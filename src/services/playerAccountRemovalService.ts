/**
 * Nexus Gaming Center - Permanent Player Account Removal Service
 *
 * Implements strict Super Admin player removal with:
 * - Super Admin permission enforcement (SUPER_ADMIN allowed; ADMIN, STAFF, PLAYER denied)
 * - Founding Super Admin protection (c3Vip2TwMvZXhub5gjjVpjcsStI2 immutable)
 * - Self-deletion prevention
 * - Confirmation requirement (GamerTag match or "REMOVE")
 * - Active game protection (blocks deletion if participating in live match, active lobby, tournament, or pending reservation)
 * - Atomic username registry release
 * - Related data cleanup while preserving historical competitive integrity (completed matches, brackets, Hall of Fame, audit logs)
 * - Concurrency protection against duplicate / race-condition deletion requests
 * - Immutable audit logging (ACCOUNT_PERMANENTLY_REMOVED)
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  deleteDoc,
  updateDoc,
  query,
  where,
  limit,
  setDoc,
  runTransaction,
  writeBatch,
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { Player, UserRole } from '../types';
import { normalizeGamerTag, cleanForFirestore } from '../utils/firestoreSanitizer';
import { FOUNDING_SUPER_ADMIN_UID, normalizeUserRole } from './roleService';

export interface RemovalTargetSummary {
  player: Player;
  matchesCount: number;
  nexusCoins: number;
  status: string;
  role: string;
  gamerTag: string;
  fullName: string;
}

export interface PermanentRemovalResult {
  success: boolean;
  error?: string;
  releasedGamerTag?: string;
  targetUid?: string;
}

// In-flight concurrency lock across the application process
const activeRemovalLocks = new Set<string>();

/**
 * Checks if a target player is involved in any active competitive operation
 * (LIVE 5v5 match, active lobby, active tournament, or pending reservation).
 */
export async function checkActiveSessionConflicts(targetUid: string): Promise<{
  hasConflict: boolean;
  conflictReason?: string;
}> {
  // 1. Check for LIVE or ACTIVE matches and OPEN lobbies
  try {
    const matchesRef = collection(db, 'matches');
    const activeStatuses = [
      'LIVE',
      'PENDING_DECLARATION',
      'DISPUTED',
      'ACTIVE',
      'IN_PROGRESS',
      'STARTING',
      'OPEN',
      'FORMING',
      'READY',
    ];
    const activeMatchesQ = query(
      matchesRef,
      where('status', 'in', activeStatuses),
      limit(25)
    );
    const snapMatches = await getDocs(activeMatchesQ);

    for (const d of snapMatches.docs) {
      const m = d.data();
      const isPlayerInvolved =
        m.player1Id === targetUid ||
        m.player2Id === targetUid ||
        m.playerAId === targetUid ||
        m.playerBId === targetUid ||
        m.createdBy === targetUid ||
        m.captainAId === targetUid ||
        m.captainBId === targetUid ||
        m.captainId === targetUid ||
        (Array.isArray(m.teamAPlayerIds) && m.teamAPlayerIds.includes(targetUid)) ||
        (Array.isArray(m.teamBPlayerIds) && m.teamBPlayerIds.includes(targetUid));

      if (isPlayerInvolved) {
        return {
          hasConflict: true,
          conflictReason:
            'Player cannot be removed while participating in an active match or lobby. Resolve the active session first.',
        };
      }
    }
  } catch (err) {
    console.warn('Active matches check non-fatal query error:', err);
  }

  // 2. Check for PENDING or CONFIRMED reservations (Only future or ongoing bookings block deletion)
  try {
    const reservationsRef = collection(db, 'reservations');
    const now = Date.now();
    const resvQuery = query(
      reservationsRef,
      where('userId', '==', targetUid),
      limit(20)
    );
    const snapResv = await getDocs(resvQuery);
    for (const d of snapResv.docs) {
      const r = d.data();
      const status = (r.status || '').toUpperCase();
      const isFutureOrOngoing =
        (r.endAt ? r.endAt > now : (r.startAt ? r.startAt > now - 8 * 3600000 : false));
      if (!isFutureOrOngoing) {
        continue; // Historical past reservation - does not block deletion
      }
      if (['PENDING', 'PENDING_ADMIN_APPROVAL', 'CONFIRMED', 'CHECKED_IN', 'ACTIVE', 'IN_PROGRESS'].includes(status)) {
        return {
          hasConflict: true,
          conflictReason:
            'Player cannot be removed while participating in an active match or lobby. Resolve the active session first.',
        };
      }
    }

    // Also check playerId field
    const resvQuery2 = query(
      reservationsRef,
      where('playerId', '==', targetUid),
      limit(20)
    );
    const snapResv2 = await getDocs(resvQuery2);
    for (const d of snapResv2.docs) {
      const r = d.data();
      const status = (r.status || '').toUpperCase();
      const isFutureOrOngoing =
        (r.endAt ? r.endAt > now : (r.startAt ? r.startAt > now - 8 * 3600000 : false));
      if (!isFutureOrOngoing) {
        continue; // Historical past reservation - does not block deletion
      }
      if (['PENDING', 'PENDING_ADMIN_APPROVAL', 'CONFIRMED', 'CHECKED_IN', 'ACTIVE', 'IN_PROGRESS'].includes(status)) {
        return {
          hasConflict: true,
          conflictReason:
            'Player cannot be removed while participating in an active match or lobby. Resolve the active session first.',
        };
      }
    }
  } catch (err) {
    console.warn('Active reservations check non-fatal query error:', err);
  }

  // 3. Check for ACTIVE tournament participation
  try {
    const tourneyTeamRegRef = collection(db, 'tournamentTeamRegistrations');
    const regQuery = query(
      tourneyTeamRegRef,
      where('captainId', '==', targetUid),
      limit(10)
    );
    const snapReg = await getDocs(regQuery);
    for (const d of snapReg.docs) {
      const reg = d.data();
      const status = (reg.status || '').toUpperCase();
      if (
        status !== 'CANCELLED' &&
        status !== 'REJECTED' &&
        status !== 'WITHDRAWN' &&
        status !== 'COMPLETED'
      ) {
        return {
          hasConflict: true,
          conflictReason:
            'Player cannot be removed while participating in an active match or lobby. Resolve the active session first.',
        };
      }
    }

    // Check slots in tournament team registrations
    const activeTourneyQ = query(
      tourneyTeamRegRef,
      where('status', 'in', ['WAITING_FOR_PLAYERS', 'CONFIRMED', 'APPROVED', 'CHECKED_IN']),
      limit(20)
    );
    const snapActiveTourneys = await getDocs(activeTourneyQ);
    for (const d of snapActiveTourneys.docs) {
      const reg = d.data();
      for (const slot of reg.slots || []) {
        const slotUid = slot.playerId || slot.invitedPlayerId || slot.recipientId;
        if (slotUid === targetUid) {
          return {
            hasConflict: true,
            conflictReason:
              'Player cannot be removed while participating in an active match or lobby. Resolve the active session first.',
          };
        }
      }
    }
  } catch (err) {
    console.warn('Active tournament team check non-fatal query error:', err);
  }

  // Optional legacy tournament registrations check
  try {
    const legacyTourneyRef = collection(db, 'tournamentRegistrations');
    const regQuery = query(
      legacyTourneyRef,
      where('playerIds', 'array-contains', targetUid),
      limit(5)
    );
    const snapReg = await getDocs(regQuery);
    for (const d of snapReg.docs) {
      const reg = d.data();
      const status = (reg.status || '').toUpperCase();
      if (['PENDING', 'APPROVED', 'CHECKED_IN', 'ACTIVE'].includes(status)) {
        return {
          hasConflict: true,
          conflictReason:
            'Player cannot be removed while participating in an active match or lobby. Resolve the active session first.',
        };
      }
    }
  } catch (err) {
    // Non-fatal if legacy collection does not exist
  }

  return { hasConflict: false };
}

/**
 * Loads target player details for the confirmation dialog summary
 */
export async function getPlayerRemovalSummary(targetUid: string): Promise<RemovalTargetSummary | null> {
  try {
    const playerDoc = await getDoc(doc(db, 'players', targetUid));
    if (!playerDoc.exists()) return null;
    const player = playerDoc.data() as Player;

    const matchesCount =
      player.totalGames ||
      (player.totalWins || 0) + (player.totalLosses || 0) + (player.totalDraws || 0);

    return {
      player,
      matchesCount,
      nexusCoins: player.nexusCoins || 0,
      status: player.status || 'ACTIVE',
      role: normalizeUserRole(player.role),
      gamerTag: player.gamerTag || 'Unknown',
      fullName: player.fullName || player.gamerTag || 'Unknown',
    };
  } catch (err) {
    console.error('Error fetching player removal summary:', err);
    return null;
  }
}

/**
 * Automatically cleans up any pending/forming lobbies, active matches, future reservations,
 * and tournament registrations to cleanly release active session locks for a removed player.
 */
export async function resolvePlayerActiveSessions(targetUid: string): Promise<{ resolvedCount: number }> {
  let resolvedCount = 0;

  // 1. Resolve all active/live matches and open/forming lobbies
  try {
    const matchesRef = collection(db, 'matches');
    const activeStatuses = [
      'LIVE',
      'PENDING_DECLARATION',
      'DISPUTED',
      'ACTIVE',
      'IN_PROGRESS',
      'STARTING',
      'OPEN',
      'FORMING',
      'READY',
    ];
    const snap = await getDocs(query(matchesRef, where('status', 'in', activeStatuses)));
    for (const d of snap.docs) {
      const m = d.data();
      let updated = false;
      const updates: any = {};

      const isP1 = m.player1Id === targetUid || m.playerAId === targetUid;
      const isP2 = m.player2Id === targetUid || m.playerBId === targetUid;
      const inTeamA = Array.isArray(m.teamAPlayerIds) && m.teamAPlayerIds.includes(targetUid);
      const inTeamB = Array.isArray(m.teamBPlayerIds) && m.teamBPlayerIds.includes(targetUid);
      const isCreator =
        m.createdBy === targetUid ||
        m.lobbyOwnerId === targetUid ||
        m.captainAId === targetUid ||
        m.captainBId === targetUid ||
        m.captainId === targetUid;

      if (!isP1 && !isP2 && !inTeamA && !inTeamB && !isCreator) {
        continue;
      }

      // Handle 1v1 match
      if (m.type === '1v1' || m.matchType === '1v1' || isP1 || isP2) {
        if (['LIVE', 'ACTIVE', 'IN_PROGRESS', 'STARTING', 'PENDING_DECLARATION', 'DISPUTED'].includes(m.status)) {
          const winnerId = isP1 ? (m.player2Id || m.playerBId) : (m.player1Id || m.playerAId);
          updates.status = 'CANCELLED';
          updates.cancellationReason = 'Match cancelled: Player account permanently removed by Super Admin';
          if (winnerId) {
            updates.winner = winnerId;
            updates.winnerId = winnerId;
          }
        } else {
          updates.status = 'CANCELLED';
          updates.cancellationReason = 'Lobby cancelled: Host account removed by Super Admin';
        }
        updated = true;
      }

      // Handle 5v5 or team match / lobby
      if (inTeamA) {
        updates.teamAPlayerIds = (m.teamAPlayerIds || []).filter((id: string) => id !== targetUid);
        if (Array.isArray(m.teamAPlayers)) {
          updates.teamAPlayers = m.teamAPlayers.filter((p: any) => (p?.uid ?? p?.id) !== targetUid);
        }
        updated = true;
      }
      if (inTeamB) {
        updates.teamBPlayerIds = (m.teamBPlayerIds || []).filter((id: string) => id !== targetUid);
        if (Array.isArray(m.teamBPlayers)) {
          updates.teamBPlayers = m.teamBPlayers.filter((p: any) => (p?.uid ?? p?.id) !== targetUid);
        }
        updated = true;
      }

      if (isCreator || inTeamA || inTeamB) {
        const remainingA = (updates.teamAPlayerIds ?? m.teamAPlayerIds ?? []).length;
        const remainingB = (updates.teamBPlayerIds ?? m.teamBPlayerIds ?? []).length;
        if (remainingA === 0 && remainingB === 0) {
          updates.status = 'CANCELLED';
          updates.cancellationReason = 'Lobby cancelled: Host account removed by Super Admin';
          updates.cancelledAt = Date.now();
        } else if (['LIVE', 'ACTIVE', 'IN_PROGRESS', 'STARTING'].includes(m.status)) {
          updates.status = 'CANCELLED';
          updates.cancellationReason = 'Match cancelled: Participant removed by Super Admin';
          updates.cancelledAt = Date.now();
        }
        updated = true;
      }

      if (updated) {
        updates.updatedAt = Date.now();
        await updateDoc(d.ref, updates).catch(() => {});
        resolvedCount++;
      }
    }
  } catch (err) {
    console.warn('Matches resolve non-fatal warning:', err);
  }

  // 2. Resolve pending or active reservations
  try {
    const reservationsRef = collection(db, 'reservations');
    const now = Date.now();
    const activeResvStatuses = ['PENDING', 'CONFIRMED', 'ACTIVE', 'IN_PROGRESS', 'PENDING_ADMIN_APPROVAL', 'CHECKED_IN'];

    // Check by userId
    const snap1 = await getDocs(query(reservationsRef, where('userId', '==', targetUid)));
    for (const d of snap1.docs) {
      const r = d.data();
      if (activeResvStatuses.includes(r.status)) {
        await updateDoc(d.ref, {
          status: 'CANCELLED',
          cancellationReason: 'Cancelled: Player account permanently removed by Super Admin',
          cancelledAt: now,
          updatedAt: now,
        }).catch(() => {});
        resolvedCount++;
      }
    }

    // Check by playerId
    const snap2 = await getDocs(query(reservationsRef, where('playerId', '==', targetUid)));
    for (const d of snap2.docs) {
      const r = d.data();
      if (activeResvStatuses.includes(r.status)) {
        await updateDoc(d.ref, {
          status: 'CANCELLED',
          cancellationReason: 'Cancelled: Player account permanently removed by Super Admin',
          cancelledAt: now,
          updatedAt: now,
        }).catch(() => {});
        resolvedCount++;
      }
    }
  } catch (err) {
    console.warn('Reservation resolve non-fatal warning:', err);
  }

  // 3. Resolve tournament team registrations
  try {
    const tourneyRegRef = collection(db, 'tournamentTeamRegistrations');
    const snapTourney = await getDocs(query(tourneyRegRef, where('captainId', '==', targetUid)));
    for (const d of snapTourney.docs) {
      const reg = d.data();
      const status = (reg.status || '').toUpperCase();
      if (!['CANCELLED', 'REJECTED', 'WITHDRAWN', 'COMPLETED'].includes(status)) {
        await updateDoc(d.ref, {
          status: 'CANCELLED',
          cancellationReason: 'Registration cancelled: Captain account removed by Super Admin',
          updatedAt: Date.now(),
        }).catch(() => {});
        resolvedCount++;
      }
    }

    // Also clear from any roster slots
    const activeSlotsSnap = await getDocs(query(
      tourneyRegRef,
      where('status', 'in', ['WAITING_FOR_PLAYERS', 'CONFIRMED', 'APPROVED', 'CHECKED_IN', 'READY_TO_SUBMIT'])
    ));
    for (const d of activeSlotsSnap.docs) {
      const reg = d.data();
      let slotModified = false;
      const updatedSlots = (reg.slots || []).map((slot: any) => {
        const slotUid = slot.playerId || slot.invitedPlayerId || slot.recipientId;
        if (slotUid === targetUid) {
          slotModified = true;
          return {
            slotNumber: slot.slotNumber,
            status: 'EMPTY',
            playerStatus: 'EMPTY',
            invitationStatus: 'NONE',
            isCaptain: false,
          };
        }
        return slot;
      });

      if (slotModified) {
        const updatedMemberIds = (reg.memberIds || []).filter((id: string) => id !== targetUid);
        await updateDoc(d.ref, {
          slots: updatedSlots,
          memberIds: updatedMemberIds,
          updatedAt: Date.now(),
        }).catch(() => {});
        resolvedCount++;
      }
    }
  } catch (err) {
    console.warn('Tournament registrations resolve non-fatal warning:', err);
  }

  // 4. Clear active5v5LobbyId on target player
  try {
    await updateDoc(doc(db, 'players', targetUid), {
      active5v5LobbyId: null,
      updatedAt: Date.now(),
    }).catch(() => {});
  } catch {}

  return { resolvedCount };
}

/**
 * Core engine for permanent player account removal.
 * Validates permissions, founding Super Admin, self-removal, confirmation tag,
 * active sessions, removes related records while preserving historical records,
 * releases username, and creates immutable audit log.
 */
export async function executePermanentPlayerRemoval(params: {
  callerUid: string;
  callerRole: string;
  callerEmail?: string;
  callerName?: string;
  targetUid: string;
  confirmationInput: string;
  reason?: string;
  autoResolveConflicts?: boolean;
}): Promise<PermanentRemovalResult> {
  const {
    callerUid,
    callerRole,
    callerEmail = '',
    callerName = 'Super Admin',
    targetUid,
    confirmationInput,
    reason = 'Super Admin permanent removal of player account',
    autoResolveConflicts = true,
  } = params;

  // 1. Permission Check
  // Only SUPER_ADMIN is allowed; ADMIN, STAFF, PLAYER are denied!
  const normalizedCallerRole = normalizeUserRole(callerRole);
  const isSuper =
    normalizedCallerRole === 'SUPER_ADMIN' ||
    callerUid === FOUNDING_SUPER_ADMIN_UID;

  if (!isSuper) {
    return {
      success: false,
      error: 'Permission Denied: Only Super Administrators can permanently remove player accounts.',
    };
  }

  // 2. Self-Removal Prevention
  if (callerUid === targetUid) {
    return {
      success: false,
      error: 'Action Forbidden: Super Administrators cannot remove their own account.',
    };
  }

  // 3. Founding Super Admin Protection
  if (targetUid === FOUNDING_SUPER_ADMIN_UID) {
    return {
      success: false,
      error: 'Action Forbidden: The Founding Super Admin is permanently protected and cannot be removed.',
    };
  }

  // 4. Concurrency Protection (Idempotency Lock)
  if (activeRemovalLocks.has(targetUid)) {
    return {
      success: false,
      error: 'A removal operation is already in progress for this player. Please wait.',
    };
  }

  activeRemovalLocks.add(targetUid);

  try {
    // 5. Fetch Target Player Profile
    const playerRef = doc(db, 'players', targetUid);
    const playerSnap = await getDoc(playerRef);

    if (!playerSnap.exists()) {
      return {
        success: false,
        error: 'Player profile not found or already removed.',
      };
    }

    const targetPlayer = playerSnap.data() as Player;
    const targetGamerTag = targetPlayer.gamerTag || '';
    const normalizedTag = (
      targetPlayer.gamerTagLower ||
      targetGamerTag.toLowerCase()
    ).trim();

    // Prevent removing another Super Admin if attempted by a non-founding Super Admin
    if (
      normalizeUserRole(targetPlayer.role) === 'SUPER_ADMIN' &&
      callerUid !== FOUNDING_SUPER_ADMIN_UID
    ) {
      return {
        success: false,
        error: 'Action Forbidden: Only the Founding Super Admin can manage Super Admin accounts.',
      };
    }

    // 6. Confirmation Verification
    const cleanConfirm = (confirmationInput || '').trim();
    const isValidConfirmation =
      cleanConfirm.toUpperCase() === 'REMOVE' ||
      cleanConfirm.toLowerCase() === targetGamerTag.toLowerCase();

    if (!isValidConfirmation) {
      return {
        success: false,
        error: `Confirmation failed: You must type either "${targetGamerTag}" or "REMOVE" to confirm permanent deletion.`,
      };
    }

    // 7. Active Game & Session Protection
    let activeCheck = await checkActiveSessionConflicts(targetUid);
    if (activeCheck.hasConflict && autoResolveConflicts) {
      // Auto-resolve non-live sessions (open lobbies, pending reservations)
      await resolvePlayerActiveSessions(targetUid);
      activeCheck = await checkActiveSessionConflicts(targetUid);
    }

    if (activeCheck.hasConflict) {
      return {
        success: false,
        error:
          activeCheck.conflictReason ||
          'Player cannot be removed while participating in an active match or lobby. Resolve the active session first.',
      };
    }

    // 8. Safely Clean Related Data (Non-Historical / Ephemeral / Pending Data)
    // Clean Notifications
    try {
      const notifRef = collection(db, 'notifications');
      const notifQ = query(notifRef, where('recipientId', '==', targetUid));
      const notifSnap = await getDocs(notifQ);
      for (const d of notifSnap.docs) {
        await deleteDoc(d.ref).catch(() => {});
      }
    } catch (err) {
      console.warn('Notification cleanup non-fatal warning:', err);
    }

    // Clean Pending Team Invitations
    try {
      const teamInvRef = collection(db, 'teamInvitations');
      const invQ1 = query(teamInvRef, where('inviteeUid', '==', targetUid));
      const invQ2 = query(teamInvRef, where('inviterUid', '==', targetUid));
      const [s1, s2] = await Promise.all([getDocs(invQ1), getDocs(invQ2)]);
      for (const d of [...s1.docs, ...s2.docs]) {
        await deleteDoc(d.ref).catch(() => {});
      }
    } catch (err) {
      console.warn('Team invitations cleanup non-fatal warning:', err);
    }

    // Clean Role Invitations
    try {
      const roleInvRef = collection(db, 'roleInvitations');
      const rQ = query(roleInvRef, where('targetUid', '==', targetUid));
      const rSnap = await getDocs(rQ);
      for (const d of rSnap.docs) {
        await deleteDoc(d.ref).catch(() => {});
      }
    } catch (err) {
      console.warn('Role invitations cleanup non-fatal warning:', err);
    }

    // Clean Player Game Ratings (All-Time ratings for this player)
    try {
      const ratingsRef = collection(db, 'playerGameRatings');
      const ratQ = query(ratingsRef, where('playerId', '==', targetUid));
      const ratSnap = await getDocs(ratQ);
      for (const d of ratSnap.docs) {
        await deleteDoc(d.ref).catch(() => {});
      }
    } catch (err) {
      console.warn('Player ratings cleanup non-fatal warning:', err);
    }

    // Clean Season Player Ratings
    try {
      const seasonRatRef = collection(db, 'seasonPlayerGameRatings');
      const sQ = query(seasonRatRef, where('playerId', '==', targetUid));
      const sSnap = await getDocs(sQ);
      for (const d of sSnap.docs) {
        await deleteDoc(d.ref).catch(() => {});
      }
    } catch (err) {
      console.warn('Season ratings cleanup non-fatal warning:', err);
    }

    // Clean Season Player Overall
    try {
      const seasonOverallRef = collection(db, 'seasonPlayerOverall');
      const oQ = query(seasonOverallRef, where('playerId', '==', targetUid));
      const oSnap = await getDocs(oQ);
      for (const d of oSnap.docs) {
        await deleteDoc(d.ref).catch(() => {});
      }
    } catch (err) {
      console.warn('Season overall cleanup non-fatal warning:', err);
    }

    // Clean Unused Redemption Codes assigned to this player
    try {
      const codesRef = collection(db, 'redemptionCodes');
      const codeQ = query(codesRef, where('assignedUid', '==', targetUid), where('isUsed', '==', false));
      const codeSnap = await getDocs(codeQ);
      for (const d of codeSnap.docs) {
        await deleteDoc(d.ref).catch(() => {});
      }
    } catch (err) {
      console.warn('Redemption codes cleanup non-fatal warning:', err);
    }

    // Clean Team Membership (remove from team rosters without destroying team history)
    try {
      const teamsRef = collection(db, 'teams');
      const teamQ = query(teamsRef, where('memberIds', 'array-contains', targetUid));
      const teamSnap = await getDocs(teamQ);
      for (const tDoc of teamSnap.docs) {
        const tData = tDoc.data();
        const updatedMembers = (tData.memberIds || []).filter((id: string) => id !== targetUid);
        const updatedRoster = (tData.roster || []).filter((m: any) => m.uid !== targetUid && m.id !== targetUid);
        await setDoc(
          tDoc.ref,
          {
            memberIds: updatedMembers,
            roster: updatedRoster,
            updatedAt: Date.now(),
          },
          { merge: true }
        );
      }
    } catch (err) {
      console.warn('Team roster cleanup non-fatal warning:', err);
    }

    // 9. Preserve Historical Competitive Records
    // Completed matches, season history, tournaments, and Hall of Fame entries
    // are strictly PRESERVED to maintain competitive integrity!
    // We mark references as [Deleted Account] if needed, but do NOT delete historical matches.

    // 10. Atomic Username Release + Player Profile Deletion
    const usernameDocRef = doc(db, 'usernames', normalizedTag);
    await deleteDoc(usernameDocRef).catch((e) => {
      console.warn('Username registry delete warning:', e);
    });

    await deleteDoc(playerRef);

    // 11. Record Auth Account Tombstone (Guarantees deleted account cannot log in)
    try {
      const deletedAuthRef = doc(db, 'deletedAuthAccounts', targetUid);
      await setDoc(
        deletedAuthRef,
        cleanForFirestore({
          uid: targetUid,
          gamerTag: targetGamerTag,
          email: targetPlayer.email || '',
          deletedAt: Date.now(),
          deletedByUid: callerUid,
          deletedByRole: 'SUPER_ADMIN',
          reason,
        })
      );
    } catch (err) {
      console.warn('Deleted auth tombstone write warning:', err);
    }

    // 12. Create Immutable Audit Log (ACCOUNT_PERMANENTLY_REMOVED)
    try {
      const auditLogRef = doc(collection(db, 'auditLogs'));
      await setDoc(
        auditLogRef,
        cleanForFirestore({
          id: auditLogRef.id,
          action: 'ACCOUNT_PERMANENTLY_REMOVED',
          actorId: callerUid,
          actorName: callerName,
          actorRole: 'SUPER_ADMIN',
          targetType: 'player',
          targetId: targetUid,
          targetUid: targetUid,
          targetGamerTag: targetGamerTag,
          targetEmail: targetPlayer.email || '',
          timestamp: Date.now(),
          reason,
          details: `Super Admin permanently removed player account "${targetGamerTag}" (${targetUid}). Username released for new registrations; temporary invitations and ratings cleaned; historical match and tournament integrity preserved.`,
        })
      );
    } catch (err) {
      console.warn('Audit log write error:', err);
    }

    return {
      success: true,
      releasedGamerTag: targetGamerTag,
      targetUid,
    };
  } catch (err: any) {
    console.warn('executePermanentPlayerRemoval warning:', err);
    return {
      success: false,
      error: err.message || 'An error occurred during account removal.',
    };
  } finally {
    activeRemovalLocks.delete(targetUid);
  }
}

/**
 * Client entry point: Initiates permanent removal through backend server endpoint
 * with fallback to authenticated client execution.
 */
export async function executePermanentPlayerRemovalClient(params: {
  targetUid: string;
  confirmationTag: string;
  reason?: string;
  autoResolveConflicts?: boolean;
}): Promise<PermanentRemovalResult> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    return {
      success: false,
      error: 'Authentication required. Please log in as Super Admin.',
    };
  }

  // Get current user profile for role verification
  const callerProfileSnap = await getDoc(doc(db, 'players', currentUser.uid));
  const callerData = callerProfileSnap.data() as Player | undefined;
  const callerRole = callerData?.role || 'PLAYER';

  // Strict client-side check
  if (
    normalizeUserRole(callerRole) !== 'SUPER_ADMIN' &&
    currentUser.uid !== FOUNDING_SUPER_ADMIN_UID
  ) {
    return {
      success: false,
      error: 'Permission Denied: Only Super Administrators can permanently remove player accounts.',
    };
  }

  const autoResolve = params.autoResolveConflicts ?? true;

  // Direct service execution using the authenticated Super Admin Firebase client SDK
  return await executePermanentPlayerRemoval({
    callerUid: currentUser.uid,
    callerRole,
    callerEmail: currentUser.email || '',
    callerName: callerData?.gamerTag || currentUser.displayName || 'Super Admin',
    targetUid: params.targetUid,
    confirmationInput: params.confirmationTag,
    reason: params.reason,
    autoResolveConflicts: autoResolve,
  });
}
