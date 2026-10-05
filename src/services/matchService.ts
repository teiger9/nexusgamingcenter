import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  runTransaction,
  limit,
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import {
  Match,
  PlayerDeclaration,
  Station,
  PlayerGameRating,
  Player,
  RatingTransaction,
  SeasonPlayerGameRating,
  SeasonPlayerOverall,
  Season,
  MatchResultType,
  OfficialResult,
  Team,
  TeamVote,
  LobbyJoinRequest,
  MatchStatus,
  TeamInvitation,
} from '../types';
import { normalizeInvitationStatus } from '../utils/tournamentTeamStatus';
import { calculateInvitationExpiresAt, isInvitationExpired } from '../utils/invitationExpiration';
import { calculateMatchRatings, calculateSinglePlayerRating, calculateExpectedScore, INITIAL_RATING, PLACEMENT_GAMES_REQUIRED, K_ESTABLISHED } from '../lib/elo';
import { getActiveSeason, calculateSoftResetMMR } from './seasonService';
import {
  fetchPlayerProfiles,
} from './playerResolver';
import {
  sendNotification,
  sendBulkNotification,
  updateMatchInvitationNotificationsActioned,
  updateMatchAdminApprovalNotificationsActioned,
} from './notificationService';
import { awardMatchWinCoins, award5v5SquadHoursCoins } from './coinRewardService';
import { formatMatchDuration } from '../utils/matchTimer';
import { normalizeGameId } from '../lib/ranks';
import { normalizeUserRole, FOUNDING_SUPER_ADMIN_UID } from './roleService';

/**
 * Utility to deeply sanitize data before writing to Firestore,
 * ensuring no undefined values ever get passed to addDoc, setDoc, or updateDoc.
 */
export function sanitizeFirestoreData<T extends Record<string, any>>(data: T): Partial<T> {
  const sanitized: any = {};
  for (const key of Object.keys(data)) {
    const val = data[key];
    if (val === undefined) {
      continue;
    } else if (Array.isArray(val)) {
      sanitized[key] = val.map((item) =>
        item !== null && typeof item === 'object' && !(item instanceof Date)
          ? sanitizeFirestoreData(item)
          : item === undefined
          ? null
          : item
      );
    } else if (val !== null && typeof val === 'object' && !(val instanceof Date)) {
      sanitized[key] = sanitizeFirestoreData(val);
    } else {
      sanitized[key] = val;
    }
  }
  return sanitized;
}

export interface CreateMatchParams {
  playerAId: string;
  playerAName: string;
  playerAGamerTag: string;
  playerBId: string;
  playerBName: string;
  playerBGamerTag: string;
  gameId: string;
  gameName: string;
  gameCategory: 'PC' | 'PS5' | 'CHESS';
  station: Station;
  matchType?: 'RANKED' | 'CASUAL';
}

export async function createMatch(params: CreateMatchParams): Promise<Match> {
  const authUid = (auth.currentUser?.uid || '').trim();
  const playerAId = (params.playerAId || authUid).trim();
  const playerBId = (params.playerBId || '').trim();

  // UNIVERSAL SELF-OPPONENT PREVENTION
  if (!playerBId) {
    throw new Error('Please select a valid opponent.');
  }

  if (playerAId && playerBId && playerAId === playerBId) {
    throw new Error('You cannot select yourself as an opponent.');
  }

  if (authUid && playerBId && authUid === playerBId) {
    throw new Error('You cannot select yourself as an opponent.');
  }

  const matchId = `match_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const matchDocRef = doc(db, 'matches', matchId);

  let activeSeason: Season | null = null;
  try {
    activeSeason = await getActiveSeason();
  } catch (err) {
    console.warn('Could not retrieve active season for match creation:', err);
  }

  const matchType = params.matchType || 'RANKED';

  const newMatch: Match = {
    id: matchId,
    playerAId: playerAId,
    playerBId: playerBId,
    playerAName: params.playerAName,
    playerBName: params.playerBName,
    playerAGamerTag: params.playerAGamerTag,
    playerBGamerTag: params.playerBGamerTag,
    gameId: params.gameId,
    gameName: params.gameName,
    gameCategory: params.gameCategory,
    station: params.station,
    status: 'WAITING_FOR_OPPONENT',
    matchType,
    createdBy: playerAId,
    createdByName: params.playerAName,
    playerADeclaration: null,
    playerBDeclaration: null,
    playerADeclaredAt: undefined,
    playerBDeclaredAt: undefined,
    winnerId: undefined,
    seasonId: activeSeason?.id,
    seasonNumber: activeSeason?.number,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  if (playerBId && playerBId !== playerAId) {
    const isChess = params.gameCategory === 'CHESS' || (params.gameName && params.gameName.toLowerCase().includes('chess'));
    const inviteType = isChess ? 'CHESS_MATCH_INVITATION' : 'MATCH_INVITATION';
    const inviteId = `cinv_${matchId}_${params.playerBId.trim()}`;
    const notifId = `notif_match_inv_${inviteId}`;
    const now = Date.now();
    const expiresAt = calculateInvitationExpiresAt(now);

    newMatch.invitationId = inviteId;
    newMatch.invitationStatus = 'PENDING';
    newMatch.invitationExpiresAt = expiresAt;
    newMatch.opponentAccepted = false;

    const gameTitle = params.gameName || (isChess ? 'Chess' : '1v1 Match');
    const teamName = isChess ? 'Chess 1v1 Match' : `${gameTitle} 1v1 Match`;
    const teamTag = isChess ? 'CHESS' : (gameTitle.replace(/[^a-zA-Z0-9]/g, '').substring(0, 5).toUpperCase() || '1V1');

    // 1. Create canonical invitation in teamInvitations collection
    const matchInvite: TeamInvitation = {
      id: inviteId,
      teamId: isChess ? 'chess_duel' : `${params.gameId || 'game'}_duel`,
      teamName,
      teamTag,
      gameId: params.gameId,
      gameName: gameTitle,
      game: gameTitle,
      captainId: params.playerAId,
      senderId: params.playerAId,
      inviterId: params.playerAId,
      captainGamerTag: params.playerAGamerTag,
      inviterGamerTag: params.playerAGamerTag,
      invitedPlayerId: params.playerBId.trim(),
      recipientId: params.playerBId.trim(),
      invitedGamerTag: params.playerBGamerTag,
      invitedPlayerGamerTag: params.playerBGamerTag,
      type: inviteType,
      status: 'PENDING',
      lobbyId: matchId,
      matchId: matchId,
      station: params.station,
      createdAt: now,
      expiresAt,
      updatedAt: now,
    };

    try {
      await setDoc(doc(db, 'teamInvitations', inviteId), sanitizeFirestoreData(matchInvite));
    } catch (inviteErr) {
      console.error('Failed to create invitation document:', inviteErr);
    }

    // 2. Create canonical Notification using existing notification system
    let notifCreated = false;
    const notifTitle = isChess ? '♟️ CHESS MATCH INVITATION' : `🎮 ${gameTitle.toUpperCase()} MATCH INVITATION`;
    const notifMsg = isChess
      ? `${params.playerAGamerTag} invited you to a Chess match at Station ${params.station}.`
      : `${params.playerAGamerTag} challenged you to a ${gameTitle} 1v1 match at Station ${params.station}.`;

    try {
      await sendNotification({
        notificationId: notifId,
        userId: params.playerBId.trim(),
        recipientId: params.playerBId.trim(),
        senderId: params.playerAId,
        inviterId: params.playerAId,
        inviterGamerTag: params.playerAGamerTag,
        invitationId: inviteId,
        matchId: matchId,
        lobbyId: matchId,
        game: gameTitle,
        type: inviteType,
        title: notifTitle,
        message: notifMsg,
        status: 'PENDING',
        expiresAt,
        data: {
          matchId,
          lobbyId: matchId,
          invitationId: inviteId,
          expiresAt,
          inviterId: params.playerAId,
          inviterGamerTag: params.playerAGamerTag,
          recipientId: params.playerBId.trim(),
          game: gameTitle,
          gameName: gameTitle,
          gameCategory: params.gameCategory,
          station: params.station,
          status: 'PENDING',
          actionState: 'UNREAD',
        },
      });
      notifCreated = true;
    } catch (notifErr) {
      console.error('Failed to create match invitation notification:', notifErr);
    }

    // Diagnostic logging
    console.log('[MATCH INVITATION DIAGNOSTIC]', {
      matchId,
      invitationId: inviteId,
      senderUid: params.playerAId,
      recipientUid: params.playerBId.trim(),
      game: gameTitle,
      notificationType: inviteType,
      notificationCreationSuccess: notifCreated,
    });
  }

  await setDoc(matchDocRef, sanitizeFirestoreData(newMatch));

  // If match starts directly in WAITING_FOR_ADMIN (e.g. no opponent invite required), notify admins immediately
  if (newMatch.status === 'WAITING_FOR_ADMIN') {
    notifyAdminsMatchNeedsApproval(newMatch).catch((e) => {
      console.warn('Failed to notify admins of new match ready for approval:', e);
    });
  }

  return newMatch;
}

/**
 * Fetch all admin and staff accounts to receive match approval notifications
 */
export async function getAdminUsersList(): Promise<{ uid: string; gamerTag?: string; role?: string }[]> {
  try {
    const adminRoles = ['admin', 'staff', 'superadmin', 'ADMIN', 'STAFF', 'SUPER_ADMIN', 'super_admin'];
    const q = query(
      collection(db, 'players'),
      where('role', 'in', adminRoles)
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      return snap.docs.map((d) => ({
        uid: d.id,
        gamerTag: d.data().gamerTag,
        role: d.data().role,
      }));
    }
    // Fallback: check users collection if players is empty
    const usersQ = query(
      collection(db, 'users'),
      where('role', 'in', adminRoles)
    );
    const uSnap = await getDocs(usersQ);
    return uSnap.docs.map((d) => ({
      uid: d.id,
      gamerTag: d.data().gamerTag || d.data().displayName,
      role: d.data().role,
    }));
  } catch (err) {
    console.warn('Error fetching admin users:', err);
    return [];
  }
}

/**
 * Authoritative check that caller is an Admin or Staff member
 */
export async function verifyAdminAuthority(adminId: string): Promise<boolean> {
  if (!adminId) return false;
  if (adminId === FOUNDING_SUPER_ADMIN_UID) return true;
  try {
    const playerSnap = await getDoc(doc(db, 'players', adminId));
    if (playerSnap.exists()) {
      const role = normalizeUserRole(playerSnap.data()?.role);
      if (['SUPER_ADMIN', 'ADMIN', 'STAFF'].includes(role)) {
        return true;
      }
    }
    const userSnap = await getDoc(doc(db, 'users', adminId));
    if (userSnap.exists()) {
      const role = normalizeUserRole(userSnap.data()?.role);
      if (['SUPER_ADMIN', 'ADMIN', 'STAFF'].includes(role)) {
        return true;
      }
    }
    return false;
  } catch (err) {
    console.warn('Error verifying admin authority:', err);
    return false;
  }
}

/**
 * Notify all admins that a match is ready and requires official approval before it can start.
 * Applies to 1v1 (Chess, FC 26, FC 27, etc.) and 5v5 (Valorant, CS2, etc.).
 */
export async function notifyAdminsMatchNeedsApproval(match: Match): Promise<void> {
  try {
    const admins = await getAdminUsersList();
    if (admins.length === 0) {
      console.warn('[ADMIN APPROVAL] No admin/staff accounts found to notify for match', match.id);
      return;
    }

    const is5v5 = Boolean(match.matchType === '5v5' || (match as any).is5v5 || match.gameId === 'valorant' || match.gameId === 'cs2');
    const matchupStr = is5v5
      ? `${match.teamAName || 'Team A'} vs ${match.teamBName || 'Team B'}`
      : `${match.playerAGamerTag || 'Player A'} vs ${match.playerBGamerTag || 'Player B'}`;
    const stationStr = match.station ? `Station ${match.station}` : 'Assigned Station';
    const title = is5v5
      ? `5v5 Match ready for approval: ${match.gameName} - ${matchupStr}`
      : `Match ready for approval: ${match.gameName} - ${matchupStr}`;
    const message = is5v5
      ? `5v5 Match ready for approval: ${match.gameName} - ${matchupStr} at ${stationStr}. Review and approve or reject.`
      : `Match ready for approval: ${match.gameName} - ${matchupStr} at ${stationStr}. Review and approve or reject.`;

    const now = Date.now();
    await Promise.all(
      admins.map((admin) =>
        sendNotification({
          userId: admin.uid,
          recipientId: admin.uid,
          type: 'MATCH_ADMIN_APPROVAL',
          title,
          message,
          matchId: match.id,
          lobbyId: match.id,
          game: match.gameName,
          status: 'PENDING_ADMIN_APPROVAL',
          notificationState: 'UNREAD',
          data: {
            matchId: match.id,
            lobbyId: match.id,
            game: match.gameName,
            gameCategory: match.gameCategory,
            station: match.station,
            is5v5,
            teamAName: match.teamAName,
            teamBName: match.teamBName,
            playerAGamerTag: match.playerAGamerTag,
            playerBGamerTag: match.playerBGamerTag,
            status: 'PENDING_ADMIN_APPROVAL',
            actionState: 'UNREAD',
          },
        }).catch((e) => console.warn(`Failed to notify admin ${admin.uid}:`, e))
      )
    );

    console.log(`[ADMIN APPROVAL] Dispatched MATCH_ADMIN_APPROVAL notifications to ${admins.length} admins for match ${match.id}`);
  } catch (err) {
    console.error('Failed to dispatch admin match notifications:', err);
  }
}

/**
 * Admin approves a pending match request
 */
export async function approveMatchRequest(params: {
  matchId: string;
  adminId: string;
  adminName: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { matchId, adminId, adminName } = params;

    // Verify admin authority
    const isAuthorized = await verifyAdminAuthority(adminId);
    if (!isAuthorized) {
      return {
        success: false,
        error: 'Unauthorized: Only authorized Nexus Admins/Staff can approve matches.',
      };
    }

    const matchRef = doc(db, 'matches', matchId);
    const matchSnap = await getDoc(matchRef);

    if (!matchSnap.exists()) {
      return { success: false, error: 'Match request does not exist.' };
    }

    const matchData = matchSnap.data() as Match;
    const isPending = matchData.status === 'WAITING_FOR_ADMIN' || matchData.status === 'PENDING_ADMIN_APPROVAL';
    if (!isPending) {
      return { success: false, error: `Match is not pending approval (current status: ${matchData.status}).` };
    }

    const now = Date.now();
    await updateDoc(
      matchRef,
      sanitizeFirestoreData({
        status: 'APPROVED',
        approvedBy: adminName,
        approvedByAdminId: adminId,
        approvedAt: now,
        updatedAt: now,
      })
    );

    // Mark admin approval notifications as ACTIONED
    await updateMatchAdminApprovalNotificationsActioned(matchId, 'APPROVED', adminId);

    // Notify all match participants that the match is APPROVED and ready to start
    const participantIds = new Set<string>();
    if (matchData.playerAId) participantIds.add(matchData.playerAId);
    if (matchData.playerBId) participantIds.add(matchData.playerBId);
    (matchData.teamAPlayerIds || []).forEach((id) => participantIds.add(id));
    (matchData.teamBPlayerIds || []).forEach((id) => participantIds.add(id));

    const is5v5 = Boolean(matchData.matchType === '5v5' || (matchData as any).is5v5 || matchData.gameId === 'valorant' || matchData.gameId === 'cs2');
    const notifTitle = is5v5 ? '5v5 Match approved! Match can begin.' : 'Match approved! You can now start.';
    const notifMessage = is5v5
      ? `5v5 Match approved! Match can begin. Station: ${matchData.station || '01'}.`
      : `Match approved! You can now start. Station: ${matchData.station || '01'}.`;

    await Promise.all(
      Array.from(participantIds).map((pId) =>
        sendNotification({
          userId: pId,
          recipientId: pId,
          type: 'MATCH_APPROVED',
          title: notifTitle,
          message: notifMessage,
          matchId,
          lobbyId: matchId,
          game: matchData.gameName,
          status: 'APPROVED',
          notificationState: 'UNREAD',
          data: {
            matchId,
            lobbyId: matchId,
            game: matchData.gameName,
            station: matchData.station,
            status: 'APPROVED',
            approvedBy: adminName,
          },
        }).catch((e) => console.warn(`Failed to notify participant ${pId} of approval:`, e))
      )
    );

    // Record audit log
    try {
      const logId = `audit_${now}_${Math.random().toString(36).substring(2, 6)}`;
      await setDoc(
        doc(db, 'auditLogs', logId),
        sanitizeFirestoreData({
          id: logId,
          action: 'MATCH_APPROVED',
          adminId,
          adminName,
          targetId: matchId,
          targetType: 'MATCH',
          details: `Approved ranked match between ${matchData.playerAGamerTag || matchData.teamAName || 'Team A'} and ${matchData.playerBGamerTag || matchData.teamBName || 'Team B'} for ${matchData.gameName} at Station ${matchData.station}`,
          createdAt: now,
        })
      );
    } catch (e) {
      console.warn('Audit log write error:', e);
    }

    return { success: true };
  } catch (err: any) {
    console.error('Failed to approve match request:', err);
    return { success: false, error: err.message || 'Approval failed.' };
  }
}

/**
 * Admin rejects a pending match request
 */
export async function rejectMatchRequest(params: {
  matchId: string;
  adminId: string;
  adminName: string;
  reason?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { matchId, adminId, adminName, reason } = params;

    // Verify admin authority
    const isAuthorized = await verifyAdminAuthority(adminId);
    if (!isAuthorized) {
      return {
        success: false,
        error: 'Unauthorized: Only authorized Nexus Admins/Staff can reject matches.',
      };
    }

    const matchRef = doc(db, 'matches', matchId);
    const matchSnap = await getDoc(matchRef);

    if (!matchSnap.exists()) {
      return { success: false, error: 'Match request does not exist.' };
    }

    const matchData = matchSnap.data() as Match;
    const isPending = matchData.status === 'WAITING_FOR_ADMIN' || matchData.status === 'PENDING_ADMIN_APPROVAL';
    if (!isPending) {
      return { success: false, error: `Match is not pending approval (current status: ${matchData.status}).` };
    }

    const now = Date.now();
    const finalReason = reason?.trim() || 'Declined by Nexus Staff';

    await updateDoc(
      matchRef,
      sanitizeFirestoreData({
        status: 'REJECTED',
        rejectedBy: adminName,
        rejectedAt: now,
        rejectionReason: finalReason,
        updatedAt: now,
      })
    );

    // Mark admin approval notifications as ACTIONED
    await updateMatchAdminApprovalNotificationsActioned(matchId, 'REJECTED', adminId);

    // Notify all match participants that the match was REJECTED
    const participantIds = new Set<string>();
    if (matchData.playerAId) participantIds.add(matchData.playerAId);
    if (matchData.playerBId) participantIds.add(matchData.playerBId);
    (matchData.teamAPlayerIds || []).forEach((id) => participantIds.add(id));
    (matchData.teamBPlayerIds || []).forEach((id) => participantIds.add(id));

    const is5v5 = Boolean(matchData.matchType === '5v5' || (matchData as any).is5v5 || matchData.gameId === 'valorant' || matchData.gameId === 'cs2');
    const notifTitle = is5v5
      ? `5v5 Match rejected by admin: ${finalReason}`
      : `Match rejected by admin: ${finalReason}`;
    const notifMessage = is5v5
      ? `5v5 Match rejected by admin: ${finalReason}`
      : `Match rejected by admin: ${finalReason}`;

    await Promise.all(
      Array.from(participantIds).map((pId) =>
        sendNotification({
          userId: pId,
          recipientId: pId,
          type: 'MATCH_REJECTED',
          title: notifTitle,
          message: notifMessage,
          matchId,
          lobbyId: matchId,
          game: matchData.gameName,
          status: 'REJECTED',
          notificationState: 'UNREAD',
          data: {
            matchId,
            lobbyId: matchId,
            game: matchData.gameName,
            station: matchData.station,
            status: 'REJECTED',
            rejectedBy: adminName,
            rejectionReason: finalReason,
          },
        }).catch((e) => console.warn(`Failed to notify participant ${pId} of rejection:`, e))
      )
    );

    // Record audit log
    try {
      const logId = `audit_${now}_${Math.random().toString(36).substring(2, 6)}`;
      await setDoc(
        doc(db, 'auditLogs', logId),
        sanitizeFirestoreData({
          id: logId,
          action: 'MATCH_REJECTED',
          adminId,
          adminName,
          targetId: matchId,
          targetType: 'MATCH',
          details: `Rejected match request for ${matchData.gameName} at Station ${matchData.station}: ${finalReason}`,
          createdAt: now,
        })
      );
    } catch (e) {
      console.warn('Audit log write error:', e);
    }

    return { success: true };
  } catch (err: any) {
    console.error('Failed to reject match request:', err);
    return { success: false, error: err.message || 'Rejection failed.' };
  }
}

/**
 * Start an approved match (players or admin can trigger).
 * Uses a Firestore transaction to ensure atomic execution:
 * - startedAt & startedBy are written ONLY when transitioning to LIVE.
 * - startedAt is NEVER overwritten if already set.
 */
export async function startApprovedMatch(
  matchId: string,
  startedByUid?: string,
  startedByName?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const callerId = startedByUid || auth.currentUser?.uid;
    const matchRef = doc(db, 'matches', matchId);
    const now = Date.now();
    let startedMatch: Match | null = null;

    await runTransaction(db, async (transaction) => {
      const matchSnap = await transaction.get(matchRef);
      if (!matchSnap.exists()) {
        throw new Error('Match not found.');
      }
      const matchData = matchSnap.data() as Match;

      // Idempotency: If already live or already started, preserve existing startedAt
      if (matchData.status === 'LIVE' || matchData.startedAt) {
        startedMatch = matchData;
        return;
      }

      if (matchData.status !== 'APPROVED') {
        throw new Error(`Match must be APPROVED by an Admin before it can start (current status is ${matchData.status}).`);
      }

      const payload: Record<string, any> = {
        status: 'LIVE',
        startedAt: now,
        updatedAt: now,
      };

      if (callerId) {
        payload.startedBy = callerId;
      }
      if (startedByName) {
        payload.startedByName = startedByName;
      }

      transaction.update(matchRef, sanitizeFirestoreData(payload));
      startedMatch = { ...matchData, ...payload } as Match;
    });

    // Notify participants of match start
    if (startedMatch && (startedMatch as Match).startedAt === now) {
      const m = startedMatch as Match;
      const startTimeFormatted = new Date(now).toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });

      const participantIds = [m.playerAId, m.playerBId].filter((id): id is string => Boolean(id));

      if (participantIds.length > 0) {
        sendBulkNotification({
          userIds: participantIds,
          type: 'MATCH_STARTED',
          title: `🟢 MATCH STARTED: ${m.gameName}`,
          message: `${m.playerAGamerTag} vs ${m.playerBGamerTag} on Station ${m.station}. Started: ${startTimeFormatted}`,
          data: {
            matchId: m.id,
            gameName: m.gameName,
            station: m.station,
            startedAt: now,
          },
        }).catch((err) => console.warn('Match start notification error:', err));
      }
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to start match.' };
  }
}

export async function startMatch(matchId: string, startedByUid?: string, startedByName?: string): Promise<void> {
  const res = await startApprovedMatch(matchId, startedByUid, startedByName);
  if (!res.success) {
    throw new Error(res.error || 'Failed to start match.');
  }
}

/**
 * Finish a live match and transition to result declaration phase.
 * Uses atomic check to prevent multiple endedAt overrides.
 */
export async function finishLiveMatch(
  matchId: string,
  callerId?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const matchRef = doc(db, 'matches', matchId);
    const now = Date.now();
    let finalMatch: Match | null = null;
    let newlyEnded = false;

    await runTransaction(db, async (transaction) => {
      const matchSnap = await transaction.get(matchRef);
      if (!matchSnap.exists()) {
        throw new Error('Match not found.');
      }
      const matchData = matchSnap.data() as Match;

      // If already has endedAt, do NOT overwrite endedAt or duration
      if (matchData.endedAt) {
        if (matchData.status === 'LIVE') {
          transaction.update(matchRef, sanitizeFirestoreData({
            status: 'AWAITING_CONFIRMATION',
            updatedAt: now,
          }));
        }
        finalMatch = matchData;
        return;
      }

      newlyEnded = true;
      const durationSecs = matchData.startedAt
        ? Math.max(0, Math.floor((now - matchData.startedAt) / 1000))
        : 0;

      const payload: Record<string, any> = {
        status: 'AWAITING_CONFIRMATION',
        endedAt: now,
        finishedAt: now,
        durationSeconds: durationSecs,
        durationFormatted: formatMatchDuration(durationSecs),
        updatedAt: now,
      };

      if (callerId) {
        payload.endedBy = callerId;
      }

      transaction.update(matchRef, sanitizeFirestoreData(payload));
      finalMatch = { ...matchData, ...payload } as Match;
    });

    if (newlyEnded && finalMatch) {
      const m = finalMatch as Match;
      const formatted = m.durationFormatted || formatMatchDuration(m.durationSeconds);
      const participantIds = [m.playerAId, m.playerBId].filter((id): id is string => Boolean(id));

      if (participantIds.length > 0) {
        sendBulkNotification({
          userIds: participantIds,
          type: 'MATCH_ENDED',
          title: `🏁 MATCH ENDED: ${m.gameName}`,
          message: `${m.playerAGamerTag} vs ${m.playerBGamerTag} on Station ${m.station}. Duration: ${formatted}`,
          data: {
            matchId: m.id,
            gameName: m.gameName,
            station: m.station,
            durationSeconds: m.durationSeconds,
            endedAt: now,
          },
        }).catch((err) => console.warn('Match end notification error:', err));
      }
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to finish live match.' };
  }
}

/**
 * Helper to process rating updates when match outcome is decided
 */
async function processMatchRatingOutcome(
  match: Match,
  outcome: 'playerA' | 'playerB' | 'draw',
  adminResolution?: {
    adminId?: string | null;
    adminName?: string | null;
    adminNote?: string;
    adminResolutionReason?: string;
    resultType?: MatchResultType | string;
    officialResult?: OfficialResult | string;
    totalGamesPlayed?: number;
    playerAGamesWon?: number;
    playerBGamesWon?: number;
    seriesWinnerId?: string | 'draw' | null;
    ncReward?: number;
  }
): Promise<void> {
  // Fetch active season
  let activeSeason: Season | null = null;
  try {
    activeSeason = await getActiveSeason();
  } catch (err) {
    console.warn('Could not get active season in rating outcome:', err);
  }

  const currentSeasonId = match.seasonId || activeSeason?.id || 'season_1';
  const currentSeasonNumber = match.seasonNumber || activeSeason?.number || 1;

  await runTransaction(db, async (transaction) => {
    const matchRef = doc(db, 'matches', match.id);
    const matchSnap = await transaction.get(matchRef);
    if (!matchSnap.exists()) throw new Error('Match not found');

    const currentMatch = matchSnap.data() as Match;
    // Prevent double confirmation or duplicate MMR rating processing
    if (currentMatch.status === 'CONFIRMED' || currentMatch.ratingProcessed === true) return;

    const normGame = normalizeGameId(match.gameId);
    const isFcMatch =
      normGame === 'fc' ||
      Boolean(match.gameName?.toLowerCase().includes('fc')) ||
      Boolean(match.gameCategory === 'FC');

    const rankingGameId = isFcMatch ? 'fc' : normGame;
    const rankingGameCategory = isFcMatch
      ? 'FC'
      : rankingGameId === 'chess'
      ? 'CHESS'
      : rankingGameId === 'valorant'
      ? 'VALORANT'
      : rankingGameId === 'cs2'
      ? 'CS2'
      : 'LEAGUE_OF_LEGENDS';
    const rankingGameName = isFcMatch ? 'FC' : (match.gameName || rankingGameId.toUpperCase());
    const rankingGameVersion = isFcMatch
      ? (match.gameVersion || (match.gameId?.toLowerCase().includes('27') ? 'FC27' : 'FC26'))
      : undefined;

    const ratingAId = `${match.playerAId}_${rankingGameId}`;
    const ratingBId = `${match.playerBId}_${rankingGameId}`;

    const ratingARef = doc(db, 'playerGameRatings', ratingAId);
    const ratingBRef = doc(db, 'playerGameRatings', ratingBId);
    const playerARef = doc(db, 'players', match.playerAId);
    const playerBRef = doc(db, 'players', match.playerBId);

    // Seasonal references
    const sRatingAId = `${currentSeasonId}_${match.playerAId}_${rankingGameId}`;
    const sRatingBId = `${currentSeasonId}_${match.playerBId}_${rankingGameId}`;
    const sRatingARef = doc(db, 'seasonPlayerGameRatings', sRatingAId);
    const sRatingBRef = doc(db, 'seasonPlayerGameRatings', sRatingBId);

    const sOverallAId = `${currentSeasonId}_${match.playerAId}`;
    const sOverallBId = `${currentSeasonId}_${match.playerBId}`;
    const sOverallARef = doc(db, 'seasonPlayerOverall', sOverallAId);
    const sOverallBRef = doc(db, 'seasonPlayerOverall', sOverallBId);

    const [
      ratingASnap,
      ratingBSnap,
      playerASnap,
      playerBSnap,
      sRatingASnap,
      sRatingBSnap,
      sOverallASnap,
      sOverallBSnap,
    ] = await Promise.all([
      transaction.get(ratingARef),
      transaction.get(ratingBRef),
      transaction.get(playerARef),
      transaction.get(playerBRef),
      transaction.get(sRatingARef),
      transaction.get(sRatingBRef),
      transaction.get(sOverallARef),
      transaction.get(sOverallBRef),
    ]);

    const defaultRatingA: PlayerGameRating = {
      id: ratingAId,
      playerId: match.playerAId,
      gameId: rankingGameId,
      gameName: rankingGameName,
      gameCategory: rankingGameCategory,
      gameVersion: rankingGameVersion,
      gamerTag: match.playerAGamerTag,
      rating: INITIAL_RATING,
      eloRating: INITIAL_RATING,
      performanceRating: INITIAL_RATING,
      isProvisional: true,
      placementGames: 0,
      placementGamesRequired: PLACEMENT_GAMES_REQUIRED,
      sumOpponentRatings: 0,
      averageOpponentRating: INITIAL_RATING,
      winStreak: 0,
      currentWinStreak: 0,
      bestWinStreak: 0,
      gamesPlayed: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      updatedAt: Date.now(),
    };

    const defaultRatingB: PlayerGameRating = {
      id: ratingBId,
      playerId: match.playerBId,
      gameId: rankingGameId,
      gameName: rankingGameName,
      gameCategory: rankingGameCategory,
      gameVersion: rankingGameVersion,
      gamerTag: match.playerBGamerTag,
      rating: INITIAL_RATING,
      eloRating: INITIAL_RATING,
      performanceRating: INITIAL_RATING,
      isProvisional: true,
      placementGames: 0,
      placementGamesRequired: PLACEMENT_GAMES_REQUIRED,
      sumOpponentRatings: 0,
      averageOpponentRating: INITIAL_RATING,
      winStreak: 0,
      currentWinStreak: 0,
      bestWinStreak: 0,
      gamesPlayed: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      updatedAt: Date.now(),
    };

    const playerARatingData: PlayerGameRating = ratingASnap.exists()
      ? { ...defaultRatingA, ...(ratingASnap.data() as PlayerGameRating) }
      : defaultRatingA;

    const playerBRatingData: PlayerGameRating = ratingBSnap.exists()
      ? { ...defaultRatingB, ...(ratingBSnap.data() as PlayerGameRating) }
      : defaultRatingB;

    // Calculate All-Time Provisional / ELO Ratings
    const currentStreakA = playerARatingData.currentWinStreak ?? playerARatingData.winStreak ?? 0;
    const currentStreakB = playerBRatingData.currentWinStreak ?? playerBRatingData.winStreak ?? 0;

    const gamesPlayedCountA = Math.max(playerARatingData.gamesPlayed || 0, playerARatingData.placementGames || 0);
    const gamesPlayedCountB = Math.max(playerBRatingData.gamesPlayed || 0, playerBRatingData.placementGames || 0);

    const calculationResult = calculateMatchRatings(
      {
        rating: playerARatingData.rating ?? INITIAL_RATING,
        eloRating: playerARatingData.eloRating ?? playerARatingData.rating ?? INITIAL_RATING,
        performanceRating: playerARatingData.performanceRating,
        isProvisional: gamesPlayedCountA < PLACEMENT_GAMES_REQUIRED,
        placementGames: gamesPlayedCountA,
        sumOpponentRatings: playerARatingData.sumOpponentRatings,
        averageOpponentRating: playerARatingData.averageOpponentRating,
        winStreak: currentStreakA,
        gamesPlayed: gamesPlayedCountA,
        wins: playerARatingData.wins || 0,
        losses: playerARatingData.losses || 0,
        draws: playerARatingData.draws || 0,
      },
      {
        rating: playerBRatingData.rating ?? INITIAL_RATING,
        eloRating: playerBRatingData.eloRating ?? playerBRatingData.rating ?? INITIAL_RATING,
        performanceRating: playerBRatingData.performanceRating,
        isProvisional: gamesPlayedCountB < PLACEMENT_GAMES_REQUIRED,
        placementGames: gamesPlayedCountB,
        sumOpponentRatings: playerBRatingData.sumOpponentRatings,
        averageOpponentRating: playerBRatingData.averageOpponentRating,
        winStreak: currentStreakB,
        gamesPlayed: gamesPlayedCountB,
        wins: playerBRatingData.wins || 0,
        losses: playerBRatingData.losses || 0,
        draws: playerBRatingData.draws || 0,
      },
      outcome
    );

    // Determine winner ID
    let winnerId: string = 'draw';
    if (outcome === 'playerA') winnerId = match.playerAId;
    if (outcome === 'playerB') winnerId = match.playerBId;

    // Calculate game streak updates
    const updatedStreakA = outcome === 'playerA' ? currentStreakA + 1 : 0;
    const updatedBestStreakA = Math.max(playerARatingData.bestWinStreak || 0, updatedStreakA);

    const updatedStreakB = outcome === 'playerB' ? currentStreakB + 1 : 0;
    const updatedBestStreakB = Math.max(playerBRatingData.bestWinStreak || 0, updatedStreakB);

    const newGamesPlayedA = gamesPlayedCountA + 1;
    const newGamesPlayedB = gamesPlayedCountB + 1;

    // Update Player A Game Rating (All-Time)
    const newRatingAData: PlayerGameRating = {
      ...playerARatingData,
      rating: calculationResult.playerA.newRating,
      eloRating: calculationResult.playerA.newEloRating,
      performanceRating: calculationResult.playerA.newPerformanceRating,
      isProvisional: newGamesPlayedA < PLACEMENT_GAMES_REQUIRED,
      placementGames: Math.min(PLACEMENT_GAMES_REQUIRED, newGamesPlayedA),
      placementGamesRequired: PLACEMENT_GAMES_REQUIRED,
      sumOpponentRatings: calculationResult.playerA.newSumOpponentRatings,
      averageOpponentRating: calculationResult.playerA.newAverageOpponentRating,
      winStreak: updatedStreakA,
      currentWinStreak: updatedStreakA,
      bestWinStreak: updatedBestStreakA,
      gamesPlayed: newGamesPlayedA,
      wins: (playerARatingData.wins || 0) + (outcome === 'playerA' ? 1 : 0),
      losses: (playerARatingData.losses || 0) + (outcome === 'playerB' ? 1 : 0),
      draws: (playerARatingData.draws || 0) + (outcome === 'draw' ? 1 : 0),
      lastPlayedAt: Date.now(),
      updatedAt: Date.now(),
    };

    // Update Player B Game Rating (All-Time)
    const newRatingBData: PlayerGameRating = {
      ...playerBRatingData,
      rating: calculationResult.playerB.newRating,
      eloRating: calculationResult.playerB.newEloRating,
      performanceRating: calculationResult.playerB.newPerformanceRating,
      isProvisional: newGamesPlayedB < PLACEMENT_GAMES_REQUIRED,
      placementGames: Math.min(PLACEMENT_GAMES_REQUIRED, newGamesPlayedB),
      placementGamesRequired: PLACEMENT_GAMES_REQUIRED,
      sumOpponentRatings: calculationResult.playerB.newSumOpponentRatings,
      averageOpponentRating: calculationResult.playerB.newAverageOpponentRating,
      winStreak: updatedStreakB,
      currentWinStreak: updatedStreakB,
      bestWinStreak: updatedBestStreakB,
      gamesPlayed: newGamesPlayedB,
      wins: (playerBRatingData.wins || 0) + (outcome === 'playerB' ? 1 : 0),
      losses: (playerBRatingData.losses || 0) + (outcome === 'playerA' ? 1 : 0),
      draws: (playerBRatingData.draws || 0) + (outcome === 'draw' ? 1 : 0),
      lastPlayedAt: Date.now(),
      updatedAt: Date.now(),
    };

    transaction.set(ratingARef, sanitizeFirestoreData(newRatingAData));
    transaction.set(ratingBRef, sanitizeFirestoreData(newRatingBData));

    // ==========================================
    // SEASONAL RATINGS UPDATE (Concurrent)
    // ==========================================
    const sDefaultA: SeasonPlayerGameRating = {
      id: sRatingAId,
      seasonId: currentSeasonId,
      seasonNumber: currentSeasonNumber,
      playerId: match.playerAId,
      gamerTag: match.playerAGamerTag,
      gameId: rankingGameId,
      gameName: rankingGameName,
      gameCategory: rankingGameCategory,
      gameVersion: rankingGameVersion,
      startingRating: calculateSoftResetMMR(playerARatingData.rating),
      rating: calculateSoftResetMMR(playerARatingData.rating),
      eloRating: calculateSoftResetMMR(playerARatingData.rating),
      performanceRating: calculateSoftResetMMR(playerARatingData.rating),
      isProvisional: playerARatingData.isProvisional,
      placementGames: playerARatingData.placementGames || 0,
      placementGamesRequired: PLACEMENT_GAMES_REQUIRED,
      sumOpponentRatings: 0,
      averageOpponentRating: INITIAL_RATING,
      winStreak: 0,
      currentWinStreak: 0,
      bestWinStreak: 0,
      gamesPlayed: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      updatedAt: Date.now(),
    };

    const sDefaultB: SeasonPlayerGameRating = {
      id: sRatingBId,
      seasonId: currentSeasonId,
      seasonNumber: currentSeasonNumber,
      playerId: match.playerBId,
      gamerTag: match.playerBGamerTag,
      gameId: rankingGameId,
      gameName: rankingGameName,
      gameCategory: rankingGameCategory,
      gameVersion: rankingGameVersion,
      startingRating: calculateSoftResetMMR(playerBRatingData.rating),
      rating: calculateSoftResetMMR(playerBRatingData.rating),
      eloRating: calculateSoftResetMMR(playerBRatingData.rating),
      performanceRating: calculateSoftResetMMR(playerBRatingData.rating),
      isProvisional: playerBRatingData.isProvisional,
      placementGames: playerBRatingData.placementGames || 0,
      placementGamesRequired: PLACEMENT_GAMES_REQUIRED,
      sumOpponentRatings: 0,
      averageOpponentRating: INITIAL_RATING,
      winStreak: 0,
      currentWinStreak: 0,
      bestWinStreak: 0,
      gamesPlayed: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      updatedAt: Date.now(),
    };

    const sDataA: SeasonPlayerGameRating = sRatingASnap.exists()
      ? { ...sDefaultA, ...(sRatingASnap.data() as SeasonPlayerGameRating) }
      : sDefaultA;

    const sDataB: SeasonPlayerGameRating = sRatingBSnap.exists()
      ? { ...sDefaultB, ...(sRatingBSnap.data() as SeasonPlayerGameRating) }
      : sDefaultB;

    // Calculate Seasonal Rating Changes
    const seasonCalcResult = calculateMatchRatings(
      {
        rating: sDataA.rating ?? INITIAL_RATING,
        eloRating: sDataA.eloRating ?? sDataA.rating ?? INITIAL_RATING,
        performanceRating: sDataA.performanceRating,
        isProvisional: sDataA.isProvisional ?? ((sDataA.placementGames || 0) < PLACEMENT_GAMES_REQUIRED),
        placementGames: sDataA.placementGames || 0,
        sumOpponentRatings: sDataA.sumOpponentRatings,
        averageOpponentRating: sDataA.averageOpponentRating,
        winStreak: sDataA.currentWinStreak ?? sDataA.winStreak ?? 0,
        gamesPlayed: sDataA.gamesPlayed || 0,
        wins: sDataA.wins || 0,
        losses: sDataA.losses || 0,
        draws: sDataA.draws || 0,
      },
      {
        rating: sDataB.rating ?? INITIAL_RATING,
        eloRating: sDataB.eloRating ?? sDataB.rating ?? INITIAL_RATING,
        performanceRating: sDataB.performanceRating,
        isProvisional: sDataB.isProvisional ?? ((sDataB.placementGames || 0) < PLACEMENT_GAMES_REQUIRED),
        placementGames: sDataB.placementGames || 0,
        sumOpponentRatings: sDataB.sumOpponentRatings,
        averageOpponentRating: sDataB.averageOpponentRating,
        winStreak: sDataB.currentWinStreak ?? sDataB.winStreak ?? 0,
        gamesPlayed: sDataB.gamesPlayed || 0,
        wins: sDataB.wins || 0,
        losses: sDataB.losses || 0,
        draws: sDataB.draws || 0,
      },
      outcome
    );

    const sNewRatingAData: SeasonPlayerGameRating = {
      ...sDataA,
      rating: seasonCalcResult.playerA.newRating,
      eloRating: seasonCalcResult.playerA.newEloRating,
      performanceRating: seasonCalcResult.playerA.newPerformanceRating,
      isProvisional: seasonCalcResult.playerA.newIsProvisional,
      placementGames: seasonCalcResult.playerA.newPlacementGames,
      placementGamesRequired: PLACEMENT_GAMES_REQUIRED,
      sumOpponentRatings: seasonCalcResult.playerA.newSumOpponentRatings,
      averageOpponentRating: seasonCalcResult.playerA.newAverageOpponentRating,
      winStreak: outcome === 'playerA' ? (sDataA.currentWinStreak || 0) + 1 : 0,
      currentWinStreak: outcome === 'playerA' ? (sDataA.currentWinStreak || 0) + 1 : 0,
      bestWinStreak: Math.max(sDataA.bestWinStreak || 0, outcome === 'playerA' ? (sDataA.currentWinStreak || 0) + 1 : 0),
      gamesPlayed: (sDataA.gamesPlayed || 0) + 1,
      wins: (sDataA.wins || 0) + (outcome === 'playerA' ? 1 : 0),
      losses: (sDataA.losses || 0) + (outcome === 'playerB' ? 1 : 0),
      draws: (sDataA.draws || 0) + (outcome === 'draw' ? 1 : 0),
      lastPlayedAt: Date.now(),
      updatedAt: Date.now(),
    };

    const sNewRatingBData: SeasonPlayerGameRating = {
      ...sDataB,
      rating: seasonCalcResult.playerB.newRating,
      eloRating: seasonCalcResult.playerB.newEloRating,
      performanceRating: seasonCalcResult.playerB.newPerformanceRating,
      isProvisional: seasonCalcResult.playerB.newIsProvisional,
      placementGames: seasonCalcResult.playerB.newPlacementGames,
      placementGamesRequired: PLACEMENT_GAMES_REQUIRED,
      sumOpponentRatings: seasonCalcResult.playerB.newSumOpponentRatings,
      averageOpponentRating: seasonCalcResult.playerB.newAverageOpponentRating,
      winStreak: outcome === 'playerB' ? (sDataB.currentWinStreak || 0) + 1 : 0,
      currentWinStreak: outcome === 'playerB' ? (sDataB.currentWinStreak || 0) + 1 : 0,
      bestWinStreak: Math.max(sDataB.bestWinStreak || 0, outcome === 'playerB' ? (sDataB.currentWinStreak || 0) + 1 : 0),
      gamesPlayed: (sDataB.gamesPlayed || 0) + 1,
      wins: (sDataB.wins || 0) + (outcome === 'playerB' ? 1 : 0),
      losses: (sDataB.losses || 0) + (outcome === 'playerA' ? 1 : 0),
      draws: (sDataB.draws || 0) + (outcome === 'draw' ? 1 : 0),
      lastPlayedAt: Date.now(),
      updatedAt: Date.now(),
    };

    transaction.set(sRatingARef, sanitizeFirestoreData(sNewRatingAData));
    transaction.set(sRatingBRef, sanitizeFirestoreData(sNewRatingBData));

    // Update Season Player Overall Stats
    const prevOverallA: SeasonPlayerOverall = sOverallASnap.exists()
      ? (sOverallASnap.data() as SeasonPlayerOverall)
      : {
          id: sOverallAId,
          seasonId: currentSeasonId,
          seasonNumber: currentSeasonNumber,
          playerId: match.playerAId,
          gamerTag: match.playerAGamerTag,
          fullName: match.playerAName,
          overallRating: calculateSoftResetMMR(playerARatingData.rating),
          gamesPlayed: 0,
          wins: 0,
          losses: 0,
          draws: 0,
          updatedAt: Date.now(),
        };

    const prevOverallB: SeasonPlayerOverall = sOverallBSnap.exists()
      ? (sOverallBSnap.data() as SeasonPlayerOverall)
      : {
          id: sOverallBId,
          seasonId: currentSeasonId,
          seasonNumber: currentSeasonNumber,
          playerId: match.playerBId,
          gamerTag: match.playerBGamerTag,
          fullName: match.playerBName,
          overallRating: calculateSoftResetMMR(playerBRatingData.rating),
          gamesPlayed: 0,
          wins: 0,
          losses: 0,
          draws: 0,
          updatedAt: Date.now(),
        };

    const newOverallRatingA = Math.max(100, Math.round(prevOverallA.overallRating + seasonCalcResult.playerA.ratingChange));
    const newOverallRatingB = Math.max(100, Math.round(prevOverallB.overallRating + seasonCalcResult.playerB.ratingChange));

    transaction.set(
      sOverallARef,
      sanitizeFirestoreData({
        ...prevOverallA,
        overallRating: newOverallRatingA,
        gamesPlayed: (prevOverallA.gamesPlayed || 0) + 1,
        wins: (prevOverallA.wins || 0) + (outcome === 'playerA' ? 1 : 0),
        losses: (prevOverallA.losses || 0) + (outcome === 'playerB' ? 1 : 0),
        draws: (prevOverallA.draws || 0) + (outcome === 'draw' ? 1 : 0),
        currentWinStreak: outcome === 'playerA' ? (prevOverallA.currentWinStreak || 0) + 1 : 0,
        bestWinStreak: Math.max(prevOverallA.bestWinStreak || 0, outcome === 'playerA' ? (prevOverallA.currentWinStreak || 0) + 1 : 0),
        updatedAt: Date.now(),
      })
    );

    transaction.set(
      sOverallBRef,
      sanitizeFirestoreData({
        ...prevOverallB,
        overallRating: newOverallRatingB,
        gamesPlayed: (prevOverallB.gamesPlayed || 0) + 1,
        wins: (prevOverallB.wins || 0) + (outcome === 'playerB' ? 1 : 0),
        losses: (prevOverallB.losses || 0) + (outcome === 'playerA' ? 1 : 0),
        draws: (prevOverallB.draws || 0) + (outcome === 'draw' ? 1 : 0),
        currentWinStreak: outcome === 'playerB' ? (prevOverallB.currentWinStreak || 0) + 1 : 0,
        bestWinStreak: Math.max(prevOverallB.bestWinStreak || 0, outcome === 'playerB' ? (prevOverallB.currentWinStreak || 0) + 1 : 0),
        updatedAt: Date.now(),
      })
    );

    // Update overall player statistics (All-Time)
    if (playerASnap.exists()) {
      const pA = playerASnap.data() as Player;
      const totalGamesA = (pA.totalGames || 0) + 1;
      const totalWinsA = (pA.totalWins || 0) + (outcome === 'playerA' ? 1 : 0);
      const totalLossesA = (pA.totalLosses || 0) + (outcome === 'playerB' ? 1 : 0);
      const totalDrawsA = (pA.totalDraws || 0) + (outcome === 'draw' ? 1 : 0);
      const overallRatingA = Math.max(100, Math.round((pA.overallRating || INITIAL_RATING) + calculationResult.playerA.ratingChange));

      const overallStreakA = outcome === 'playerA' ? (pA.currentWinStreak || 0) + 1 : 0;
      const overallBestStreakA = Math.max(pA.bestWinStreak || 0, overallStreakA);

      transaction.set(playerARef, sanitizeFirestoreData({
        ...pA,
        totalGames: totalGamesA,
        totalWins: totalWinsA,
        totalLosses: totalLossesA,
        totalDraws: totalDrawsA,
        overallRating: overallRatingA,
        currentWinStreak: overallStreakA,
        bestWinStreak: overallBestStreakA,
      }), { merge: true });
    }

    if (playerBSnap.exists()) {
      const pB = playerBSnap.data() as Player;
      const totalGamesB = (pB.totalGames || 0) + 1;
      const totalWinsB = (pB.totalWins || 0) + (outcome === 'playerB' ? 1 : 0);
      const totalLossesB = (pB.totalLosses || 0) + (outcome === 'playerA' ? 1 : 0);
      const totalDrawsB = (pB.totalDraws || 0) + (outcome === 'draw' ? 1 : 0);
      const overallRatingB = Math.max(100, Math.round((pB.overallRating || INITIAL_RATING) + calculationResult.playerB.ratingChange));

      const overallStreakB = outcome === 'playerB' ? (pB.currentWinStreak || 0) + 1 : 0;
      const overallBestStreakB = Math.max(pB.bestWinStreak || 0, overallStreakB);

      transaction.set(playerBRef, sanitizeFirestoreData({
        ...pB,
        totalGames: totalGamesB,
        totalWins: totalWinsB,
        totalLosses: totalLossesB,
        totalDraws: totalDrawsB,
        overallRating: overallRatingB,
        currentWinStreak: overallStreakB,
        bestWinStreak: overallBestStreakB,
      }), { merge: true });
    }

    // Record Detailed Rating Transactions (for player history & admin audit)
    const txAId = `tx_${Date.now()}_${match.playerAId}`;
    const txBId = `tx_${Date.now()}_${match.playerBId}`;

    const txA: RatingTransaction = {
      id: txAId,
      matchId: match.id,
      gameId: rankingGameId,
      gameName: rankingGameName,
      playerId: match.playerAId,
      gamerTag: match.playerAGamerTag,
      opponentId: match.playerBId,
      opponentGamerTag: match.playerBGamerTag,
      opponentMMR: playerBRatingData.rating ?? INITIAL_RATING,
      ratingBefore: playerARatingData.rating ?? INITIAL_RATING,
      oldMMR: playerARatingData.rating ?? INITIAL_RATING,
      ratingAfter: calculationResult.playerA.newRating,
      newMMR: calculationResult.playerA.newRating,
      change: calculationResult.playerA.ratingChange,
      ratingChange: calculationResult.playerA.ratingChange,
      result: outcome === 'playerA' ? 'WIN' : outcome === 'playerB' ? 'LOSS' : 'DRAW',
      isProvisional: gamesPlayedCountA < PLACEMENT_GAMES_REQUIRED,
      seasonId: currentSeasonId,
      seasonNumber: currentSeasonNumber,
      seasonRatingBefore: sDataA.rating,
      seasonRatingAfter: seasonCalcResult.playerA.newRating,
      seasonChange: seasonCalcResult.playerA.ratingChange,
      createdAt: Date.now(),
    };

    const txB: RatingTransaction = {
      id: txBId,
      matchId: match.id,
      gameId: rankingGameId,
      gameName: rankingGameName,
      playerId: match.playerBId,
      gamerTag: match.playerBGamerTag,
      opponentId: match.playerAId,
      opponentGamerTag: match.playerAGamerTag,
      opponentMMR: playerARatingData.rating ?? INITIAL_RATING,
      ratingBefore: playerBRatingData.rating ?? INITIAL_RATING,
      oldMMR: playerBRatingData.rating ?? INITIAL_RATING,
      ratingAfter: calculationResult.playerB.newRating,
      newMMR: calculationResult.playerB.newRating,
      change: calculationResult.playerB.ratingChange,
      ratingChange: calculationResult.playerB.ratingChange,
      result: outcome === 'playerB' ? 'WIN' : outcome === 'playerA' ? 'LOSS' : 'DRAW',
      isProvisional: gamesPlayedCountB < PLACEMENT_GAMES_REQUIRED,
      seasonId: currentSeasonId,
      seasonNumber: currentSeasonNumber,
      seasonRatingBefore: sDataB.rating,
      seasonRatingAfter: seasonCalcResult.playerB.newRating,
      seasonChange: seasonCalcResult.playerB.ratingChange,
      createdAt: Date.now(),
    };

    transaction.set(doc(db, 'ratingTransactions', txAId), sanitizeFirestoreData(txA));
    transaction.set(doc(db, 'ratingTransactions', txBId), sanitizeFirestoreData(txB));
    transaction.set(doc(db, 'rating_history', txAId), sanitizeFirestoreData(txA));
    transaction.set(doc(db, 'rating_history', txBId), sanitizeFirestoreData(txB));

    // Update Match Document with confirmation and provisional flags
    const nowTimestamp = Date.now();
    const isDraw = outcome === 'draw';
    const officialWinnerId = isDraw ? null : (outcome === 'playerA' ? match.playerAId : match.playerBId);
    const resolvedWinnerId = isDraw ? 'draw' : (outcome === 'playerA' ? match.playerAId : match.playerBId);

    const updatePayload: Record<string, any> = {
      status: 'CONFIRMED',
      winnerId: resolvedWinnerId,
      officialWinner: officialWinnerId,
      officialResult: isDraw ? 'DRAW' : (outcome === 'playerA' ? 'PLAYER_A' : 'PLAYER_B'),
      resultType: adminResolution?.resultType || (adminResolution ? 'ADMIN_DECISION' : 'MUTUAL_DECLARATION'),
      ratingProcessed: true,
      confirmedAt: nowTimestamp,
      finishedAt: nowTimestamp,
      endedAt: currentMatch.endedAt || match.endedAt || nowTimestamp,
      durationSeconds: (currentMatch.durationSeconds !== undefined)
        ? currentMatch.durationSeconds
        : (currentMatch.startedAt || match.startedAt)
        ? Math.max(0, Math.floor(((currentMatch.endedAt || match.endedAt || nowTimestamp) - (currentMatch.startedAt || match.startedAt!)) / 1000))
        : 0,
      durationFormatted: currentMatch.durationFormatted || match.durationFormatted || formatMatchDuration(
        (currentMatch.durationSeconds !== undefined)
          ? currentMatch.durationSeconds
          : (currentMatch.startedAt || match.startedAt)
          ? Math.max(0, Math.floor(((currentMatch.endedAt || match.endedAt || nowTimestamp) - (currentMatch.startedAt || match.startedAt!)) / 1000))
          : 0
      ),
      updatedAt: nowTimestamp,
      seasonId: currentSeasonId,
      seasonNumber: currentSeasonNumber,
      gameCategory: rankingGameCategory,
      gameVersion: rankingGameVersion,
      playerADeclaration: currentMatch.playerADeclaration ?? match.playerADeclaration ?? null,
      playerBDeclaration: currentMatch.playerBDeclaration ?? match.playerBDeclaration ?? null,
      playerADeclaredAt: currentMatch.playerADeclaredAt ?? match.playerADeclaredAt ?? nowTimestamp,
      playerBDeclaredAt: currentMatch.playerBDeclaredAt ?? match.playerBDeclaredAt ?? nowTimestamp,
      playerARatingBefore: playerARatingData.rating ?? INITIAL_RATING,
      playerARatingAfter: calculationResult.playerA.newRating,
      playerARatingChange: calculationResult.playerA.ratingChange,
      playerAIsProvisional: calculationResult.playerA.newIsProvisional,
      playerBRatingBefore: playerBRatingData.rating ?? INITIAL_RATING,
      playerBRatingAfter: calculationResult.playerB.newRating,
      playerBRatingChange: calculationResult.playerB.ratingChange,
      playerBIsProvisional: calculationResult.playerB.newIsProvisional,
    };

    let totalGamesPlayed: number | undefined =
      adminResolution?.totalGamesPlayed ?? currentMatch.totalGamesPlayed ?? match.totalGamesPlayed;
    let playerAGamesWon: number | undefined =
      adminResolution?.playerAGamesWon ?? currentMatch.playerAGamesWon ?? match.playerAGamesWon;
    let playerBGamesWon: number | undefined =
      adminResolution?.playerBGamesWon ?? currentMatch.playerBGamesWon ?? match.playerBGamesWon;
    let seriesWinnerId: string | 'draw' | null | undefined =
      adminResolution?.seriesWinnerId ?? currentMatch.seriesWinnerId ?? match.seriesWinnerId;

    if (isFcMatch) {
      if (totalGamesPlayed === undefined || totalGamesPlayed === null) {
        if (currentMatch.playerASeriesScore && currentMatch.playerBSeriesScore) {
          playerAGamesWon = currentMatch.playerASeriesScore.gamesWon;
          playerBGamesWon = currentMatch.playerBSeriesScore.gamesWon;
          totalGamesPlayed = playerAGamesWon + playerBGamesWon;
        } else if (currentMatch.playerASeriesScore) {
          playerAGamesWon = currentMatch.playerASeriesScore.gamesWon;
          playerBGamesWon = currentMatch.playerASeriesScore.gamesLost;
          totalGamesPlayed = currentMatch.playerASeriesScore.totalGames;
        } else if (currentMatch.playerBSeriesScore) {
          playerBGamesWon = currentMatch.playerBSeriesScore.gamesWon;
          playerAGamesWon = currentMatch.playerBSeriesScore.gamesLost;
          totalGamesPlayed = currentMatch.playerBSeriesScore.totalGames;
        }
      }
      if (outcome === 'playerA') {
        seriesWinnerId = match.playerAId;
      } else if (outcome === 'playerB') {
        seriesWinnerId = match.playerBId;
      } else {
        seriesWinnerId = 'draw';
      }
    }

    if (totalGamesPlayed !== undefined && totalGamesPlayed !== null) {
      updatePayload.totalGamesPlayed = totalGamesPlayed;
    }
    if (playerAGamesWon !== undefined && playerAGamesWon !== null) {
      updatePayload.playerAGamesWon = playerAGamesWon;
    }
    if (playerBGamesWon !== undefined && playerBGamesWon !== null) {
      updatePayload.playerBGamesWon = playerBGamesWon;
    }
    if (seriesWinnerId !== undefined) {
      updatePayload.seriesWinnerId = seriesWinnerId;
    }
    if (isFcMatch && totalGamesPlayed) {
      const winnerWins = outcome === 'playerA' ? (playerAGamesWon || 0) : outcome === 'playerB' ? (playerBGamesWon || 0) : 0;
      updatePayload.ncReward = outcome === 'draw' ? (2.5 * totalGamesPlayed) : (60 * winnerWins);
    }

    if (adminResolution) {
      updatePayload.adminResolved = true;
      updatePayload.resolvedBy = adminResolution.adminId || null;
      updatePayload.resolvedByName = adminResolution.adminName || 'Nexus Admin';
      updatePayload.resolvedAt = nowTimestamp;
      updatePayload.adminResolutionReason = adminResolution.adminResolutionReason || adminResolution.adminNote || 'Admin verified result';
      updatePayload.adminId = adminResolution.adminId || null;
      updatePayload.adminName = adminResolution.adminName || 'Nexus Admin';
      updatePayload.adminNote = adminResolution.adminNote || 'Resolved by Nexus Admin';
      updatePayload.adminDecidedAt = nowTimestamp;
    }

    transaction.update(matchRef, sanitizeFirestoreData(updatePayload));
  });

  // Award Nexus Coins to the confirmed 1v1 winner or split equally on draw (strictly idempotent)
  const normGame = normalizeGameId(match.gameId);
  const isFcMatch =
    normGame === 'fc' ||
    Boolean(match.gameName?.toLowerCase().includes('fc'));

  const finalTotalGames = adminResolution?.totalGamesPlayed ?? match.totalGamesPlayed;
  const finalPlayerAWins = adminResolution?.playerAGamesWon ?? match.playerAGamesWon;
  const finalPlayerBWins = adminResolution?.playerBGamesWon ?? match.playerBGamesWon;
  const finalSeriesWinner = adminResolution?.seriesWinnerId ?? match.seriesWinnerId;

  if (outcome === 'playerA' || outcome === 'playerB') {
    const winnerUid = outcome === 'playerA' ? match.playerAId : match.playerBId;
    const opponentName = outcome === 'playerA'
      ? (match.playerBName || match.playerBGamerTag || 'Opponent')
      : (match.playerAName || match.playerAGamerTag || 'Opponent');

    awardMatchWinCoins({
      matchId: match.id,
      winnerUids: [winnerUid],
      gameId: match.gameId,
      gameName: match.gameName || 'Match',
      is5v5: false,
      opponentPlayerName: opponentName,
      totalGamesPlayed: finalTotalGames,
      playerAGamesWon: finalPlayerAWins,
      playerBGamesWon: finalPlayerBWins,
      seriesWinnerId: finalSeriesWinner,
      isDraw: false,
    }).catch((coinErr) => {
      console.warn('Failed to award match win coins in 1v1:', coinErr);
    });
  } else if (outcome === 'draw') {
    // 1v1 Draw: both players receive split draw reward according to game rules (Chess: 2 NC each; FC: (5 * totalGames) / 2; etc.)
    const participantUids = [match.playerAId, match.playerBId].filter(
      (uid): uid is string => typeof uid === 'string' && uid.trim().length > 0
    );
    if (participantUids.length > 0) {
      awardMatchWinCoins({
        matchId: match.id,
        winnerUids: participantUids,
        gameId: match.gameId,
        gameName: match.gameName || 'Match',
        is5v5: false,
        isDraw: true,
        totalGamesPlayed: finalTotalGames,
        playerAGamesWon: finalPlayerAWins,
        playerBGamesWon: finalPlayerBWins,
        seriesWinnerId: 'draw',
      }).catch((coinErr) => {
        console.warn('Failed to award draw coins in 1v1:', coinErr);
      });
    }
  }
}

/**
 * Submit player declaration independently and process match outcome automatically
 * Supports Player A and Player B submitting in any order.
 * Supports special FC 26 / FC 27 series scoring and conflict detection.
 */
export async function submitPlayerDeclaration(
  matchId: string,
  playerId: string,
  declaration: PlayerDeclaration,
  seriesScore?: {
    gamesWon: number;
    gamesLost: number;
  }
): Promise<{ success: boolean; status: string; error?: string }> {
  try {
    const currentUid = auth.currentUser?.uid || playerId;
    if (!currentUid) {
      return { success: false, status: 'UNAUTHORIZED', error: 'You must be logged in to submit a result.' };
    }

    const matchRef = doc(db, 'matches', matchId);

    // 1. Read the current match document from Firestore
    const matchSnap = await getDoc(matchRef);
    if (!matchSnap.exists()) {
      return { success: false, status: 'NOT_FOUND', error: 'Match does not exist.' };
    }

    const currentMatch = matchSnap.data() as Match;

    // 2. Determine who is submitting (using authenticated UID strictly)
    const isPlayerA = currentMatch.playerAId === currentUid;
    const isPlayerB = currentMatch.playerBId === currentUid;

    if (!isPlayerA && !isPlayerB) {
      return { success: false, status: 'UNAUTHORIZED', error: 'You are not a player in this match.' };
    }

    // 3. Duplicate submission check
    if (isPlayerA && currentMatch.playerADeclaration !== null && currentMatch.playerADeclaration !== undefined) {
      return { success: false, status: 'ALREADY_SUBMITTED', error: 'Your result has already been submitted.' };
    }
    if (isPlayerB && currentMatch.playerBDeclaration !== null && currentMatch.playerBDeclaration !== undefined) {
      return { success: false, status: 'ALREADY_SUBMITTED', error: 'Your result has already been submitted.' };
    }

    // 4. Standardize submitted declaration to 'WIN' | 'LOSS' | 'DRAW'
    let normDeclaration: 'WIN' | 'LOSS' | 'DRAW';
    if (declaration === 'WIN' || (isPlayerA && declaration === 'playerA') || (isPlayerB && declaration === 'playerB')) {
      normDeclaration = 'WIN';
    } else if (declaration === 'LOSS' || (isPlayerA && declaration === 'playerB') || (isPlayerB && declaration === 'playerA')) {
      normDeclaration = 'LOSS';
    } else {
      normDeclaration = 'DRAW';
    }

    const normGame = normalizeGameId(currentMatch.gameId);
    const isFcMatch =
      normGame === 'fc' ||
      Boolean(currentMatch.gameName?.toLowerCase().includes('fc'));

    const now = Date.now();

    // If FC series score was provided, compute declaration from games won vs lost
    let fcSeriesRecord: any = null;
    if (seriesScore) {
      const won = Math.max(0, Number(seriesScore.gamesWon) || 0);
      const lost = Math.max(0, Number(seriesScore.gamesLost) || 0);
      const tot = won + lost;
      if (won > lost) {
        normDeclaration = 'WIN';
      } else if (won < lost) {
        normDeclaration = 'LOSS';
      } else if (tot > 0) {
        normDeclaration = 'DRAW';
      }
      fcSeriesRecord = {
        gamesWon: won,
        gamesLost: lost,
        totalGames: tot,
        declaration: normDeclaration,
        submittedAt: now,
      };
    }

    // 5. Update ONLY that player's declaration in Firestore (do not overwrite opponent's declaration)
    const singleUpdate: Record<string, any> = {
      updatedAt: now,
    };

    if (isPlayerA) {
      singleUpdate.playerADeclaration = normDeclaration;
      singleUpdate.playerADeclaredAt = now;
      if (fcSeriesRecord) {
        singleUpdate.playerASeriesScore = fcSeriesRecord;
      }
    } else {
      singleUpdate.playerBDeclaration = normDeclaration;
      singleUpdate.playerBDeclaredAt = now;
      if (fcSeriesRecord) {
        singleUpdate.playerBSeriesScore = fcSeriesRecord;
      }
    }

    // If match was LIVE or APPROVED, transition status to AWAITING_CONFIRMATION
    if (currentMatch.status === 'LIVE' || currentMatch.status === 'APPROVED' || currentMatch.status === 'PENDING') {
      singleUpdate.status = 'AWAITING_CONFIRMATION';
      if (!currentMatch.endedAt) {
        singleUpdate.endedAt = now;
        singleUpdate.endedBy = currentUid;
        singleUpdate.finishedAt = now;
        const durationSecs = currentMatch.startedAt
          ? Math.max(0, Math.floor((now - currentMatch.startedAt) / 1000))
          : 0;
        singleUpdate.durationSeconds = durationSecs;
        singleUpdate.durationFormatted = formatMatchDuration(durationSecs);
      }
    }

    await updateDoc(matchRef, sanitizeFirestoreData(singleUpdate));

    // 6. Re-read the latest match document from Firestore after update (fresh data, no stale React state)
    const freshSnap = await getDoc(matchRef);
    if (!freshSnap.exists()) {
      return { success: false, status: 'NOT_FOUND', error: 'Match document missing after update.' };
    }
    const freshMatch = freshSnap.data() as Match;

    // 7. Check both declarations from the latest Firestore document
    const declA = freshMatch.playerADeclaration;
    const declB = freshMatch.playerBDeclaration;

    const hasBoth = Boolean(
      declA !== null &&
      declA !== undefined &&
      declB !== null &&
      declB !== undefined
    );

    // If only one player has submitted so far:
    if (!hasBoth) {
      return { success: true, status: 'AWAITING_CONFIRMATION' };
    }

    // 8. Once BOTH declarations exist:
    // Handle FC 26 / FC 27 series scoring and conflict verification
    if (isFcMatch) {
      const sA = freshMatch.playerASeriesScore;
      const sB = freshMatch.playerBSeriesScore;

      if (sA && sB) {
        const scoresAgree =
          sA.gamesWon === sB.gamesLost &&
          sA.gamesLost === sB.gamesWon &&
          sA.totalGames === sB.totalGames &&
          sA.totalGames > 0;

        const declAgree =
          (sA.gamesWon > sA.gamesLost && sA.declaration === 'WIN' && sB.declaration === 'LOSS') ||
          (sA.gamesWon < sA.gamesLost && sA.declaration === 'LOSS' && sB.declaration === 'WIN') ||
          (sA.gamesWon === sA.gamesLost && sA.declaration === 'DRAW' && sB.declaration === 'DRAW');

        if (!scoresAgree || !declAgree) {
          // Voting conflict or score mismatch -> DISPUTED
          await updateDoc(
            matchRef,
            sanitizeFirestoreData({
              status: 'DISPUTED',
              disputeReason: 'FC_SERIES_SCORE_OR_DECLARATION_CONFLICT',
              updatedAt: now,
            })
          );
          return { success: true, status: 'DISPUTED' };
        }

        // Scores agree! Store series results, show RESULT AGREED, await Admin final confirmation
        const seriesWinnerId =
          sA.gamesWon > sB.gamesWon
            ? freshMatch.playerAId
            : sB.gamesWon > sA.gamesWon
            ? freshMatch.playerBId
            : 'draw';
        const winnerGamesWon = sA.gamesWon > sB.gamesWon ? sA.gamesWon : (sB.gamesWon > sA.gamesWon ? sB.gamesWon : 0);
        const calculatedReward = seriesWinnerId === 'draw' ? (2.5 * sA.totalGames) : (60 * winnerGamesWon);

        await updateDoc(
          matchRef,
          sanitizeFirestoreData({
            totalGamesPlayed: sA.totalGames,
            playerAGamesWon: sA.gamesWon,
            playerBGamesWon: sB.gamesWon,
            seriesWinnerId,
            ncReward: calculatedReward,
            status: 'AWAITING_CONFIRMATION',
            updatedAt: now,
          })
        );
        return { success: true, status: 'AWAITING_CONFIRMATION' };
      }
    }

    // Standard 1v1 declaration comparison (Chess, etc.):
    let outcome: 'playerA' | 'playerB' | 'draw' | 'DISPUTED';

    if (declA === 'WIN' && declB === 'LOSS') {
      outcome = 'playerA';
    } else if (declA === 'LOSS' && declB === 'WIN') {
      outcome = 'playerB';
    } else if (declA === 'DRAW' && declB === 'DRAW') {
      outcome = 'draw';
    } else {
      outcome = 'DISPUTED';
    }

    if (outcome === 'DISPUTED') {
      await updateDoc(
        matchRef,
        sanitizeFirestoreData({
          status: 'DISPUTED',
          disputeReason: 'PLAYER_DECLARATIONS_CONFLICT',
          updatedAt: now,
        })
      );
      return { success: true, status: 'DISPUTED' };
    }

    // Both declarations agree -> await Admin final confirmation
    await updateDoc(
      matchRef,
      sanitizeFirestoreData({
        status: 'AWAITING_CONFIRMATION',
        updatedAt: now,
      })
    );
    return { success: true, status: 'AWAITING_CONFIRMATION' };
  } catch (err: any) {
    console.error('Submit declaration error:', err);
    return { success: false, status: 'ERROR', error: err.message || 'Failed to submit declaration' };
  }
}

/**
 * Admin Force End / Match Override
 * Allows authorized administrators to manually terminate or override any match.
 */
export interface AdminForceEndMatchParams {
  matchId: string;
  adminId: string;
  adminName?: string;
  decision: 'PLAYER_A_WON' | 'PLAYER_B_WON' | 'DRAW' | 'CANCEL_MATCH';
  reason: string;
  totalGamesPlayed?: number;
  playerAGamesWon?: number;
  playerBGamesWon?: number;
  seriesWinnerId?: string | 'draw' | null;
  ncReward?: number;
  officialHours?: number;
}

export async function adminForceEndMatch(params: AdminForceEndMatchParams): Promise<{ success: boolean; status?: string; error?: string }> {
  try {
    const {
      matchId,
      adminId,
      adminName,
      decision,
      reason,
      totalGamesPlayed,
      playerAGamesWon,
      playerBGamesWon,
      seriesWinnerId,
      ncReward,
    } = params;
    if (!adminId) {
      return { success: false, error: 'Admin identification is required.' };
    }
    if (!reason || !reason.trim()) {
      return { success: false, error: 'A valid reason for manual match termination is required.' };
    }

    // Backend / Service-level admin authorization verification
    const isAuthorized = await verifyAdminAuthority(adminId);
    if (!isAuthorized) {
      return { success: false, error: 'PERMISSION DENIED: Only authorized Nexus administrators or staff can force end or override matches.' };
    }

    const matchRef = doc(db, 'matches', matchId);
    const matchSnap = await getDoc(matchRef);
    if (!matchSnap.exists()) {
      return { success: false, error: 'Match not found in system database.' };
    }

    const currentMatch = matchSnap.data() as Match;
    const now = Date.now();

    // CASE 1: CANCEL MATCH — NO RESULT
    // A cancelled match must NOT change MMR, season MMR, leaderboards, wins, losses, draws, or win streaks
    if (decision === 'CANCEL_MATCH') {
      await updateDoc(
        matchRef,
        sanitizeFirestoreData({
          status: 'CANCELLED',
          resultType: 'ADMIN_CANCELLATION',
          officialResult: 'CANCELLED',
          officialWinner: null,
          winnerId: null,
          adminResolved: true,
          resolvedBy: adminId,
          resolvedByName: adminName || 'Nexus Admin',
          resolvedAt: now,
          adminResolutionReason: reason.trim(),
          adminId,
          adminName: adminName || 'Nexus Admin',
          adminNote: reason.trim(),
          adminDecidedAt: now,
          finishedAt: now,
          endedAt: currentMatch.endedAt || now,
          endedBy: adminId,
          durationSeconds: (currentMatch.durationSeconds !== undefined)
            ? currentMatch.durationSeconds
            : currentMatch.startedAt
            ? Math.max(0, Math.floor(((currentMatch.endedAt || now) - currentMatch.startedAt) / 1000))
            : 0,
          durationFormatted: currentMatch.durationFormatted || formatMatchDuration(
            (currentMatch.durationSeconds !== undefined)
              ? currentMatch.durationSeconds
              : currentMatch.startedAt
              ? Math.max(0, Math.floor(((currentMatch.endedAt || now) - currentMatch.startedAt) / 1000))
              : 0
          ),
          updatedAt: now,
          // Original player declarations are preserved untouched
          playerADeclaration: currentMatch.playerADeclaration ?? null,
          playerBDeclaration: currentMatch.playerBDeclaration ?? null,
          playerADeclaredAt: currentMatch.playerADeclaredAt ?? null,
          playerBDeclaredAt: currentMatch.playerBDeclaredAt ?? null,
        })
      );
      return { success: true, status: 'CANCELLED' };
    }

    // CASE 2: PLAYER_A_WON | PLAYER_B_WON | DRAW
    // PREVENT DOUBLE MMR: If rating was already processed, do NOT update MMR again, but guarantee NC rewards are processed idempotently
    if (currentMatch.ratingProcessed === true || currentMatch.status === 'CONFIRMED') {
      await updateDoc(
        matchRef,
        sanitizeFirestoreData({
          adminResolved: true,
          resolvedBy: adminId,
          resolvedByName: adminName || 'Nexus Admin',
          resolvedAt: now,
          adminResolutionReason: reason.trim(),
          resultType: 'ADMIN_DECISION',
          adminNote: reason.trim(),
          updatedAt: now,
        })
      );

      // GUARANTEE NC REWARD INTEGRITY: Ensure winning or draw players received their NC reward
      try {
        if (currentMatch.matchType === '5v5') {
          const rawTeamA = currentMatch.teamAPlayerIds && currentMatch.teamAPlayerIds.length > 0
            ? currentMatch.teamAPlayerIds
            : (currentMatch.teamAPlayers || []).map((p: any) => p?.id);
          const teamAPlayerIds = Array.from(new Set(rawTeamA.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)));

          const rawTeamB = currentMatch.teamBPlayerIds && currentMatch.teamBPlayerIds.length > 0
            ? currentMatch.teamBPlayerIds
            : (currentMatch.teamBPlayers || []).map((p: any) => p?.id);
          const teamBPlayerIds = Array.from(new Set(rawTeamB.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)));

          const teamOutcome: 'teamA' | 'teamB' | 'draw' = decision === 'PLAYER_A_WON' ? 'teamA' : decision === 'PLAYER_B_WON' ? 'teamB' : 'draw';
          const validHours = typeof params.officialHours === 'number' && params.officialHours > 0
            ? params.officialHours
            : typeof currentMatch.officialHours === 'number' && currentMatch.officialHours > 0
            ? currentMatch.officialHours
            : 1;

          await award5v5SquadHoursCoins({
            matchId: currentMatch.id,
            gameId: currentMatch.gameId,
            gameName: currentMatch.gameName || '5v5 Match',
            outcome: teamOutcome,
            officialHours: validHours,
            teamAPlayerIds,
            teamBPlayerIds,
            teamAName: currentMatch.teamAName || 'Team A',
            teamBName: currentMatch.teamBName || 'Team B',
            adminId,
            adminName: adminName || 'Nexus Admin',
          });
        } else {
          // 1v1
          const isDraw = decision === 'DRAW';
          if (decision === 'PLAYER_A_WON' || decision === 'PLAYER_B_WON') {
            const winnerUid = decision === 'PLAYER_A_WON' ? currentMatch.playerAId : currentMatch.playerBId;
            const opponentName = decision === 'PLAYER_A_WON'
              ? (currentMatch.playerBName || currentMatch.playerBGamerTag || 'Opponent')
              : (currentMatch.playerAName || currentMatch.playerAGamerTag || 'Opponent');

            await awardMatchWinCoins({
              matchId: currentMatch.id,
              winnerUids: [winnerUid],
              gameId: currentMatch.gameId,
              gameName: currentMatch.gameName || 'Match',
              is5v5: false,
              opponentPlayerName: opponentName,
              totalGamesPlayed: currentMatch.totalGamesPlayed || 1,
              playerAGamesWon: currentMatch.playerAGamesWon,
              playerBGamesWon: currentMatch.playerBGamesWon,
              seriesWinnerId: decision === 'PLAYER_A_WON' ? currentMatch.playerAId : currentMatch.playerBId,
              isDraw: false,
            });
          } else if (isDraw) {
            const participantUids = [currentMatch.playerAId, currentMatch.playerBId].filter(
              (uid): uid is string => typeof uid === 'string' && uid.trim().length > 0
            );
            if (participantUids.length > 0) {
              await awardMatchWinCoins({
                matchId: currentMatch.id,
                winnerUids: participantUids,
                gameId: currentMatch.gameId,
                gameName: currentMatch.gameName || 'Match',
                is5v5: false,
                isDraw: true,
                totalGamesPlayed: currentMatch.totalGamesPlayed || 1,
                playerAGamesWon: currentMatch.playerAGamesWon,
                playerBGamesWon: currentMatch.playerBGamesWon,
                seriesWinnerId: 'draw',
              });
            }
          }
        }
      } catch (ncErr) {
        console.warn('NC reward verification in admin force end failed:', ncErr);
      }

      return { success: true, status: 'CONFIRMED' };
    }

    if (currentMatch.matchType === '5v5') {
      let teamOutcome: 'teamA' | 'teamB' | 'draw';
      if (decision === 'PLAYER_A_WON') teamOutcome = 'teamA';
      else if (decision === 'PLAYER_B_WON') teamOutcome = 'teamB';
      else teamOutcome = 'draw';

      const validHours = typeof params.officialHours === 'number' && params.officialHours > 0
        ? params.officialHours
        : typeof currentMatch.officialHours === 'number' && currentMatch.officialHours > 0
        ? currentMatch.officialHours
        : 1;

      await process5v5MatchRatingOutcome(currentMatch, teamOutcome, {
        adminId,
        adminName: adminName || 'Nexus Admin',
        adminNote: reason.trim(),
        adminResolutionReason: reason.trim(),
        resultType: 'ADMIN_DECISION',
        officialHours: validHours,
      });
      return { success: true, status: 'CONFIRMED' };
    }

    let outcome: 'playerA' | 'playerB' | 'draw';
    if (decision === 'PLAYER_A_WON') outcome = 'playerA';
    else if (decision === 'PLAYER_B_WON') outcome = 'playerB';
    else outcome = 'draw';

    await processMatchRatingOutcome(currentMatch, outcome, {
      adminId,
      adminName: adminName || 'Nexus Admin',
      adminNote: reason.trim(),
      adminResolutionReason: reason.trim(),
      resultType: 'ADMIN_DECISION',
      officialResult: outcome === 'draw' ? 'DRAW' : (outcome === 'playerA' ? 'PLAYER_A' : 'PLAYER_B'),
      totalGamesPlayed,
      playerAGamesWon,
      playerBGamesWon,
      seriesWinnerId,
      ncReward,
    });

    return { success: true, status: 'CONFIRMED' };
  } catch (err: any) {
    console.error('adminForceEndMatch error:', err);
    return { success: false, error: err.message || 'Failed to force end match.' };
  }
}

/**
 * Admin resolves a disputed match
 */
export async function resolveDisputedMatch(params: {
  matchId: string;
  adminId: string;
  adminName: string;
  outcome: 'playerA' | 'playerB' | 'draw';
  adminNote?: string;
  totalGamesPlayed?: number;
  playerAGamesWon?: number;
  playerBGamesWon?: number;
  seriesWinnerId?: string | 'draw' | null;
  ncReward?: number;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const {
      matchId,
      adminId,
      adminName,
      outcome,
      adminNote,
      totalGamesPlayed,
      playerAGamesWon,
      playerBGamesWon,
      seriesWinnerId,
      ncReward,
    } = params;
    const decision = outcome === 'playerA' ? 'PLAYER_A_WON' : outcome === 'playerB' ? 'PLAYER_B_WON' : 'DRAW';
    return await adminForceEndMatch({
      matchId,
      adminId,
      adminName,
      decision,
      reason: adminNote || 'Admin confirmed match result.',
      totalGamesPlayed,
      playerAGamesWon,
      playerBGamesWon,
      seriesWinnerId,
      ncReward,
    });
  } catch (err: any) {
    console.error('Failed to resolve dispute:', err);
    return { success: false, error: err.message || 'Dispute resolution failed.' };
  }
}

export function subscribeToMatch(matchId: string, callback: (match: Match | null) => void) {
  const matchRef = doc(db, 'matches', matchId);
  return onSnapshot(
    matchRef,
    (snap) => {
      if (snap.exists()) {
        callback(snap.data() as Match);
      } else {
        callback(null);
      }
    },
    (err) => {
      console.error('Match snapshot error:', err);
      callback(null);
    }
  );
}

export function subscribeToPlayerMatches(playerId: string, callback: (matches: Match[]) => void) {
  // Query both as 1v1 players/captains and as 5v5 squad roster members
  const qA = query(collection(db, 'matches'), where('playerAId', '==', playerId), orderBy('createdAt', 'desc'), limit(50));
  const qB = query(collection(db, 'matches'), where('playerBId', '==', playerId), orderBy('createdAt', 'desc'), limit(50));
  const qTeamA = query(collection(db, 'matches'), where('teamAPlayerIds', 'array-contains', playerId), limit(50));
  const qTeamB = query(collection(db, 'matches'), where('teamBPlayerIds', 'array-contains', playerId), limit(50));

  let matchesA: Match[] = [];
  let matchesB: Match[] = [];
  let matchesTeamA: Match[] = [];
  let matchesTeamB: Match[] = [];

  const updateCombined = () => {
    const combined = [...matchesA, ...matchesB, ...matchesTeamA, ...matchesTeamB];
    // deduplicate by id and sort descending
    const map = new Map<string, Match>();
    combined.forEach((m) => map.set(m.id, m));
    const sorted = Array.from(map.values()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    callback(sorted);
  };

  const unsubA = onSnapshot(qA, (snap) => {
    matchesA = snap.docs.map((d) => d.data() as Match);
    updateCombined();
  }, () => updateCombined());

  const unsubB = onSnapshot(qB, (snap) => {
    matchesB = snap.docs.map((d) => d.data() as Match);
    updateCombined();
  }, () => updateCombined());

  const unsubTeamA = onSnapshot(qTeamA, (snap) => {
    matchesTeamA = snap.docs.map((d) => d.data() as Match);
    updateCombined();
  }, () => updateCombined());

  const unsubTeamB = onSnapshot(qTeamB, (snap) => {
    matchesTeamB = snap.docs.map((d) => d.data() as Match);
    updateCombined();
  }, () => updateCombined());

  return () => {
    unsubA();
    unsubB();
    unsubTeamA();
    unsubTeamB();
  };
}

export function subscribeToPendingMatchRequests(callback: (matches: Match[]) => void) {
  const q = query(
    collection(db, 'matches'),
    where('status', 'in', ['WAITING_FOR_ADMIN', 'PENDING_ADMIN_APPROVAL'])
  );

  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => d.data() as Match);
      list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      callback(list);
    },
    (err) => {
      console.error('Pending match requests listener error:', err);
      callback([]);
    }
  );
}

export function subscribeToDisputedMatches(callback: (matches: Match[]) => void) {
  const q = query(
    collection(db, 'matches'),
    where('status', '==', 'DISPUTED'),
    orderBy('updatedAt', 'desc')
  );

  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => d.data() as Match));
  }, (err) => {
    console.error('Disputes listener error:', err);
    callback([]);
  });
}

export function subscribeToLiveMatches(callback: (matches: Match[]) => void) {
  const q = query(
    collection(db, 'matches'),
    where('status', 'in', ['LIVE', 'APPROVED', 'AWAITING_CONFIRMATION', 'PENDING']),
    orderBy('updatedAt', 'desc')
  );

  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => d.data() as Match));
  }, (err) => {
    console.error('Live matches listener error:', err);
    callback([]);
  });
}

export function subscribeToAllMatches(callback: (matches: Match[]) => void) {
  const q = query(
    collection(db, 'matches'),
    orderBy('createdAt', 'desc'),
    limit(100)
  );

  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => d.data() as Match));
  }, (err) => {
    console.error('All matches listener error:', err);
    callback([]);
  });
}

export async function fetchPlayerRatingTransactions(playerId: string): Promise<RatingTransaction[]> {
  try {
    const q = query(
      collection(db, 'ratingTransactions'),
      where('playerId', '==', playerId),
      orderBy('createdAt', 'desc'),
      limit(30)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as RatingTransaction);
  } catch (err) {
    console.error('Failed to fetch rating transactions:', err);
    return [];
  }
}

// ============================================================================
// 5v5 TEAM MATCH & LOBBY SYSTEM
// ============================================================================

export interface Create5v5LobbyParams {
  teamId: string;
  captainId: string;
  gameId: 'valorant' | 'cs2' | string;
  station?: Station;
  announceRecruitment?: boolean;
  recruitmentMessage?: string;
  pcCount?: number;
  isPrivate?: boolean;
  lobbyAccess?: 'OPEN' | 'PRIVATE';
}

/**
 * Checks if a 5v5 lobby is marked as private.
 * Private lobbies require an invitation to join.
 */
export function isMatchPrivate(m: Partial<Match> | null | undefined): boolean {
  if (!m) return false;
  return Boolean(
    m.isPrivate === true ||
    (m as any).privacy === 'PRIVATE' ||
    (m as any).access === 'PRIVATE' ||
    (m as any).lobbyAccess === 'PRIVATE'
  );
}

/**
 * Closed / final match statuses according to the project's existing MatchStatus system.
 * Once a match reaches any of these statuses, the lobby is finalized/closed.
 */
export const FINAL_MATCH_STATUSES: readonly string[] = [
  'COMPLETED',
  'CLOSED',
  'CANCELLED',
  'FINISHED',
  'CONFIRMED',
  'REJECTED',
];

/**
 * Checks if a match has reached a final/closed state.
 */
export function isMatchClosed(m: Partial<Match> | null | undefined): boolean {
  if (!m) return true;
  const statusUpper = (m.status || '').toUpperCase();
  if (FINAL_MATCH_STATUSES.includes(statusUpper)) {
    return true;
  }
  if (m.finalResult || m.winnerId || m.cancellationReason) {
    return true;
  }
  return false;
}

/**
 * Checks if a match is an active 5v5 lobby.
 * Active means any 5v5 lobby that has not reached a final/closed state, including:
 * WAITING_FOR_OPPONENT, OPPONENT_JOINED, TEAM_ROSTERS_FILLING, READY_CHECK, LIVE,
 * AWAITING_RESULTS, WAITING_FOR_ADMIN, APPROVED, PENDING_ADMIN_APPROVAL, PENDING_ADMIN_REVIEW,
 * DISPUTED, AWAITING_CONFIRMATION, PENDING.
 */
export function isMatchActive5v5(m: Partial<Match> | null | undefined): boolean {
  if (!m) return false;
  const is5v5 = (m.matchType || '').toLowerCase() === '5v5' || !!m.lobbyCode;
  if (!is5v5) return false;
  return !isMatchClosed(m);
}

/**
 * Checks if a given player UID is an active member of the match in any role:
 * Team A roster, Team B roster, Captain A, Captain B, Creator, Lobby Owner, Player A, Player B.
 */
export function isPlayerMemberOfMatch(m: Match | Partial<Match>, uid: string): boolean {
  if (!m || !uid) return false;
  const inTeamA =
    (m.teamAPlayerIds && m.teamAPlayerIds.includes(uid)) ||
    (m.teamAPlayers && m.teamAPlayers.some((p: any) => p?.id === uid));
  const inTeamB =
    (m.teamBPlayerIds && m.teamBPlayerIds.includes(uid)) ||
    (m.teamBPlayers && m.teamBPlayers.some((p: any) => p?.id === uid));
  const isCurrentCaptainA = m.captainAId === uid || m.playerAId === uid;
  const isCurrentCaptainB = m.captainBId === uid || m.playerBId === uid;
  const isCurrentLobbyOwner = m.lobbyOwnerId === uid;

  return Boolean(inTeamA || inTeamB || isCurrentCaptainA || isCurrentCaptainB || isCurrentLobbyOwner);
}

/**
 * Checks if a player already belongs to ANY active 5v5 lobby according to existing lobby statuses.
 * This applies to EVERY player:
 * - Lobby Owner / Team A Captain
 * - Team A players
 * - Team B Captain
 * - Team B players
 * - Normal players
 *
 * Active statuses: WAITING_FOR_OPPONENT, OPPONENT_JOINED, TEAM_ROSTERS_FILLING, READY_CHECK,
 * LIVE, AWAITING_RESULTS, PENDING_ADMIN_APPROVAL, DISPUTED, PENDING_ADMIN_REVIEW, etc.
 * Closed statuses: COMPLETED, CLOSED, CANCELLED, FINISHED, CONFIRMED, REJECTED.
 *
 * Uses auth.currentUser.uid as authoritative player identity.
 */
export async function getPlayerActive5v5Lobby(
  playerUid?: string,
  excludeMatchId?: string
): Promise<Match | null> {
  const authUid = playerUid || auth.currentUser?.uid;
  if (!authUid) return null;

  try {
    // 1. Direct check via player profile active5v5LobbyId for instant resolution
    try {
      const playerDoc = await getDoc(doc(db, 'players', authUid));
      if (playerDoc.exists()) {
        const activeLobbyId = playerDoc.data()?.active5v5LobbyId;
        if (activeLobbyId && activeLobbyId !== excludeMatchId) {
          const matchDoc = await getDoc(doc(db, 'matches', activeLobbyId));
          if (matchDoc.exists()) {
            const mData = { id: matchDoc.id, ...matchDoc.data() } as Match;
            if (isMatchActive5v5(mData) && isPlayerMemberOfMatch(mData, authUid)) {
              return mData;
            }
          }
        }
      }
    } catch (pointerErr) {
      console.warn('Error checking player active lobby pointer:', pointerErr);
    }

    // 2. Comprehensive Firestore queries across ALL 5v5 participant roles:
    // Team A roster, Team B roster, Captain A, Captain B, Creator, Lobby Owner, Player A, Player B
    const qTeamA = query(collection(db, 'matches'), where('teamAPlayerIds', 'array-contains', authUid));
    const qTeamB = query(collection(db, 'matches'), where('teamBPlayerIds', 'array-contains', authUid));
    const qCreated = query(collection(db, 'matches'), where('createdBy', '==', authUid));
    const qLobbyOwner = query(collection(db, 'matches'), where('lobbyOwnerId', '==', authUid));
    const qCaptainA = query(collection(db, 'matches'), where('captainAId', '==', authUid));
    const qCaptainB = query(collection(db, 'matches'), where('captainBId', '==', authUid));
    const qPlayerA = query(collection(db, 'matches'), where('playerAId', '==', authUid));
    const qPlayerB = query(collection(db, 'matches'), where('playerBId', '==', authUid));

    const [snapA, snapB, snapCreated, snapLobbyOwner, snapCaptainA, snapCaptainB, snapPlayerA, snapPlayerB] =
      await Promise.all([
        getDocs(qTeamA),
        getDocs(qTeamB),
        getDocs(qCreated),
        getDocs(qLobbyOwner),
        getDocs(qCaptainA),
        getDocs(qCaptainB),
        getDocs(qPlayerA),
        getDocs(qPlayerB),
      ]);

    const allDocs = [
      ...snapA.docs,
      ...snapB.docs,
      ...snapCreated.docs,
      ...snapLobbyOwner.docs,
      ...snapCaptainA.docs,
      ...snapCaptainB.docs,
      ...snapPlayerA.docs,
      ...snapPlayerB.docs,
    ];
    const seenIds = new Set<string>();

    for (const d of allDocs) {
      if (seenIds.has(d.id)) continue;
      seenIds.add(d.id);
      if (excludeMatchId && d.id === excludeMatchId) continue;

      const m = { id: d.id, ...d.data() } as Match;
      if (isMatchActive5v5(m) && isPlayerMemberOfMatch(m, authUid)) {
        // Sync player pointer for atomic race condition checking
        if (auth.currentUser?.uid === authUid) {
          try {
            await updateDoc(doc(db, 'players', authUid), { active5v5LobbyId: m.id });
          } catch (_) {}
        }
        return m;
      }
    }

    // If no active lobby found, ensure stale pointer on own profile is cleared
    if (auth.currentUser?.uid === authUid) {
      try {
        const playerDoc = await getDoc(doc(db, 'players', authUid));
        if (playerDoc.exists() && playerDoc.data()?.active5v5LobbyId) {
          const ptr = playerDoc.data()?.active5v5LobbyId;
          if (ptr === excludeMatchId) {
            await updateDoc(doc(db, 'players', authUid), { active5v5LobbyId: null });
          }
        }
      } catch (_) {}
    }
  } catch (err) {
    console.warn('Error checking player active 5v5 lobby:', err);
  }
  return null;
}

/**
 * Backward compatibility alias for getPlayerActive5v5Lobby
 */
export async function getCaptainActive5v5Lobby(captainUid?: string): Promise<Match | null> {
  return await getPlayerActive5v5Lobby(captainUid);
}

/**
 * Creates an official 5v5 Lobby (Captain only)
 * Snapshots Team A roster and sets status to WAITING_FOR_OPPONENT
 * Supports lobbies with 1 to 5 players with automatic recruitment announcement
 */
export async function create5v5Lobby(params: Create5v5LobbyParams): Promise<{
  success: boolean;
  match?: Match;
  lobbyCode?: string;
  existingMatch?: Match;
  error?: string;
}> {
  try {
    const {
      teamId,
      station,
      announceRecruitment,
      recruitmentMessage,
      pcCount: inputPcCount,
      gameId,
      isPrivate: inputIsPrivate,
      lobbyAccess: inputLobbyAccess,
    } = params;

    const isLobbyPrivate = Boolean(inputIsPrivate || inputLobbyAccess === 'PRIVATE');
    const lobbyAccessMode: 'OPEN' | 'PRIVATE' = isLobbyPrivate ? 'PRIVATE' : 'OPEN';

    // 1. Enforce authenticated user: auth.currentUser.uid. Do not trust client-passed captainId.
    const authUser = auth.currentUser;
    if (!authUser || !authUser.uid) {
      return {
        success: false,
        error: 'Authentication required. Please sign in as captain to create a lobby.',
      };
    }
    const captainId = authUser.uid;

    const resolvedTeamId = (teamId || '').trim();
    if (!resolvedTeamId) {
      return { success: false, error: 'Team ID is required to create a lobby.' };
    }

    // 2. Pre-check: Enforce ONE ACTIVE LOBBY PER CAPTAIN in backend logic using authenticated Firebase UID
    const captainActiveLobby = await getCaptainActive5v5Lobby(captainId);
    if (captainActiveLobby) {
      return {
        success: false,
        error: 'YOU ALREADY HAVE AN ACTIVE LOBBY',
        existingMatch: captainActiveLobby,
        lobbyCode: captainActiveLobby.lobbyCode,
      };
    }

    // 2. Fetch team document with fallback
    let team: Team | null = null;
    const teamDocRef = doc(db, 'teams', resolvedTeamId);
    const teamSnap = await getDoc(teamDocRef);

    if (teamSnap.exists()) {
      team = { teamId: teamSnap.id, ...teamSnap.data() } as Team;
    } else {
      const qAlt = query(collection(db, 'teams'), where('teamId', '==', resolvedTeamId), limit(1));
      const snapAlt = await getDocs(qAlt);
      if (!snapAlt.empty) {
        team = { teamId: snapAlt.docs[0].id, ...snapAlt.docs[0].data() } as Team;
      }
    }

    if (!team) {
      return { success: false, error: 'Team squad not found.' };
    }

    // 3. Validate captain authorization
    const resolvedCaptainId = team.captainId || (team as any).creatorUid || (team as any).createdBy;
    const isCaptain =
      resolvedCaptainId === captainId ||
      team.members?.some((m) => m.id === captainId && m.role === 'captain');

    if (!isCaptain) {
      return { success: false, error: 'Only the team captain can create a 5v5 ranked lobby.' };
    }

    // 4. Prevent duplicate active lobbies for the same team
    try {
      const qExisting = query(
        collection(db, 'matches'),
        where('teamAId', '==', team.teamId)
      );
      const existingSnap = await getDocs(qExisting);
      const closedStatuses: MatchStatus[] = ['COMPLETED', 'CONFIRMED', 'CANCELLED', 'REJECTED'];
      const activeMatchDoc = existingSnap.docs.find((d) => {
        const m = d.data() as Match;
        const is5v5 = (m.matchType || '').toLowerCase() === '5v5' || !!m.lobbyCode;
        return is5v5 && !closedStatuses.includes(m.status) && !m.finalResult && !m.winnerId && !m.cancellationReason;
      });

      if (activeMatchDoc) {
        const activeMatch = { id: activeMatchDoc.id, ...activeMatchDoc.data() } as Match;
        return {
          success: false,
          error: 'YOU ALREADY HAVE AN ACTIVE LOBBY',
          existingMatch: activeMatch,
          lobbyCode: activeMatch.lobbyCode,
        };
      }
    } catch (dupErr) {
      console.warn('Duplicate check warning:', dupErr);
    }

    // 4. Validate team has active players (1 to 5 players)
    let memberIds = team.memberIds || [];
    if (memberIds.length === 0 && team.members && team.members.length > 0) {
      memberIds = team.members.map((m) => m.id);
    }
    if (!memberIds.includes(captainId)) {
      memberIds = [captainId, ...memberIds];
    }
    memberIds = memberIds.slice(0, 5);

    if (memberIds.length < 1) {
      return {
        success: false,
        error: 'Your team must have at least 1 active player to create a 5v5 lobby.',
      };
    }

    // 5. Game normalization & validation
    const teamGame = (team.gameId || (team as any).game || team.gameName || 'cs2').toLowerCase().trim();
    const targetGame = (gameId || teamGame).toLowerCase().trim();
    const isGameMatch =
      teamGame === targetGame ||
      (teamGame.includes('cs') && targetGame.includes('cs')) ||
      (teamGame.includes('val') && targetGame.includes('val'));

    if (!isGameMatch) {
      return { success: false, error: `This team is registered for ${team.gameName || teamGame}, not ${gameId}.` };
    }

    // 6. Resolve Real Player Profiles from Firestore (Single source of truth)
    const profiles = await fetchPlayerProfiles(memberIds);

    const teamAPlayers = memberIds.map((uid, idx) => {
      const p = profiles[uid];
      const existingMember = team!.members?.find((m) => m.id === uid);
      const ignKey = targetGame.includes('cs') ? 'cs2' : 'valorant';
      const inGameName =
        p?.inGameNames?.[ignKey] ||
        p?.inGameName ||
        existingMember?.inGameName ||
        p?.gamerTag ||
        'Player';
      const gamerTag =
        p?.gamerTag ||
        existingMember?.gamerTag ||
        (uid === captainId ? team!.captainGamerTag : `Player ${idx + 1}`) ||
        'Player';
      const name = p?.fullName || existingMember?.fullName || gamerTag;
      const rating = p?.overallRating || existingMember?.rating || 1000;

      return {
        id: uid,
        gamerTag,
        name,
        rating,
        inGameName,
      };
    });

    const currentCount = teamAPlayers.length;
    const playersNeeded = Math.max(0, 5 - currentCount);
    const shouldAnnounce = announceRecruitment ?? (playersNeeded > 0);

    const teamAAvgRating = Math.round(
      teamAPlayers.reduce((acc, p) => acc + (p.rating || 1000), 0) / Math.max(1, currentCount)
    );

    // 7. Generate unique lobby code e.g. NEX-4829
    const tagPrefix =
      (team.teamTag || '5V5').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 4) || '5V5';
    const randomCode = Math.floor(1000 + Math.random() * 9000);
    const lobbyCode = `${tagPrefix}-${randomCode}`;

    const matchId = `lobby_5v5_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const now = Date.now();

    let activeSeason: Season | null = null;
    try {
      activeSeason = await getActiveSeason();
    } catch (e) {
      console.warn('Could not retrieve active season for 5v5 lobby:', e);
    }

    const captainProfile = profiles[captainId];
    const captainGamerTag = captainProfile?.gamerTag || team.captainGamerTag || 'Captain';
    const captainName = captainProfile?.fullName || team.captainName || captainGamerTag;

    const gameDisplayName = targetGame.includes('val') ? 'VALORANT' : 'Counter-Strike 2';
    const normalizedGameId = targetGame.includes('val') ? 'valorant' : 'cs2';

    const defaultMsg = `Need ${playersNeeded} player${playersNeeded > 1 ? 's' : ''} to complete squad!`;

    // 8. Resolve PC Count attached to lobby (Options: 8, 9, 10 - Default: 10)
    // Pure information attached to the lobby document. No reservations or bookings.
    const pcCount = inputPcCount === 8 || inputPcCount === 9 || inputPcCount === 10 ? inputPcCount : 10;

    const new5v5Match: Match = {
      id: matchId,
      lobbyCode,
      matchType: '5v5',
      status: 'WAITING_FOR_OPPONENT',
      gameId: normalizedGameId,
      gameName: team.gameName || gameDisplayName,
      gameCategory: 'PC',
      station: station || 'PC-01',
      pcCount,
      createdBy: captainId,
      createdByName: captainGamerTag,
      lobbyOwnerId: captainId,
      captainAId: captainId,
      isPrivate: isLobbyPrivate,
      lobbyAccess: lobbyAccessMode,
      createdAt: now,
      updatedAt: now,
      seasonId: activeSeason?.id,
      seasonNumber: activeSeason?.number,

      // 5v5 Recruitment Fields
      isRecruiting: shouldAnnounce && playersNeeded > 0,
      recruitmentStatus:
        shouldAnnounce && playersNeeded > 0 ? 'ACTIVE' : playersNeeded === 0 ? 'FULL' : undefined,
      playersNeeded,
      recruitmentAnnouncementAt: shouldAnnounce && playersNeeded > 0 ? now : undefined,
      recruitmentMessage:
        shouldAnnounce && playersNeeded > 0
          ? recruitmentMessage?.trim() || defaultMsg
          : undefined,

      // Team A Snapshot (Original Team / Lobby Creator)
      teamAId: team.teamId,
      teamAName: team.teamName || 'Squad A',
      teamATag: team.teamTag || tagPrefix,
      teamALogo: team.teamLogo || '🛡️',
      teamAPlayerIds: memberIds,
      teamAPlayers,
      teamAAvgRating,
      teamARatingBefore: team.teamRating || teamAAvgRating,

      // Team B (Opposing Team) starts strictly EMPTY
      teamBId: undefined,
      teamBName: 'EMPTY',
      teamBTag: 'TBD',
      teamBLogo: '⚔️',
      captainBId: undefined,
      teamBPlayerIds: [],
      teamBPlayers: [],
      teamBAvgRating: undefined,
      playerReadyStatus: {},

      // 1v1 legacy fields for backwards compatibility
      playerAId: captainId,
      playerAName: captainName,
      playerAGamerTag: captainGamerTag,
      playerBId: undefined,
      playerBName: undefined,
      playerBGamerTag: undefined,

      votes: {},
      votedAt: {},
      declarations: {},
    };

    // 7. Atomic Transaction to enforce single active lobby per captain and eliminate race conditions
    // If the captain clicks Create Lobby twice quickly or has two browser tabs open, only ONE active lobby is created.
    const playerRef = doc(db, 'players', captainId);
    const newMatchRef = doc(db, 'matches', matchId);

    let activeLobbyConflict: Match | null = null;

    try {
      await runTransaction(db, async (transaction) => {
        // Atomic read 1: Check player's profile active lobby pointer
        const playerSnap = await transaction.get(playerRef);
        if (playerSnap.exists()) {
          const pData = playerSnap.data();
          const activeLobbyId = pData?.active5v5LobbyId;
          if (activeLobbyId) {
            const activeMatchRef = doc(db, 'matches', activeLobbyId);
            const activeMatchSnap = await transaction.get(activeMatchRef);
            if (activeMatchSnap.exists()) {
              const currentMatch = { id: activeMatchSnap.id, ...activeMatchSnap.data() } as Match;
              if (isMatchActive5v5(currentMatch)) {
                activeLobbyConflict = currentMatch;
                throw new Error('YOU ALREADY HAVE AN ACTIVE LOBBY');
              }
            }
          }
        }

        // Atomic write 1: Set the new 5v5 match
        transaction.set(newMatchRef, sanitizeFirestoreData(new5v5Match));

        // Atomic write 2: Atomically mark the captain's active 5v5 lobby ID
        if (playerSnap.exists()) {
          transaction.set(
            playerRef,
            sanitizeFirestoreData({
              active5v5LobbyId: matchId,
              lastLobbyCreatedAt: now,
            }),
            { merge: true }
          );
        }
      });
    } catch (txErr: any) {
      if (activeLobbyConflict || txErr.message === 'YOU ALREADY HAVE AN ACTIVE LOBBY') {
        const existing = activeLobbyConflict || (await getCaptainActive5v5Lobby(captainId));
        return {
          success: false,
          error: 'YOU ALREADY HAVE AN ACTIVE LOBBY',
          existingMatch: existing || undefined,
          lobbyCode: existing?.lobbyCode,
        };
      }
      throw txErr;
    }

    // If recruiting, write to lobbyRecruitments collection for fast arena discovery
    if (shouldAnnounce && playersNeeded > 0) {
      await setDoc(
        doc(db, 'lobbyRecruitments', matchId),
        sanitizeFirestoreData({
          id: matchId,
          lobbyId: matchId,
          lobbyCode,
          teamId: team.teamId,
          teamName: team.teamName || 'Squad A',
          teamTag: team.teamTag || tagPrefix,
          teamLogo: team.teamLogo || '🛡️',
          captainId,
          captainName,
          captainGamerTag,
          gameId: normalizedGameId,
          gameName: team.gameName || gameDisplayName,
          gameCategory: 'PC',
          station: station || 'PC-01',
          pcCount,
          currentActivePlayers: currentCount,
          playersNeeded,
          status: 'ACTIVE',
          teamAvgRating: teamAAvgRating,
          playerIds: memberIds,
          recruitmentMessage: new5v5Match.recruitmentMessage,
          createdAt: now,
          updatedAt: now,
        })
      );
    }

    return { success: true, match: new5v5Match, lobbyCode };
  } catch (err: any) {
    if (err.message === 'YOU ALREADY HAVE AN ACTIVE LOBBY') {
      const authUid = auth.currentUser?.uid;
      const existing = authUid ? await getCaptainActive5v5Lobby(authUid) : undefined;
      return {
        success: false,
        error: 'YOU ALREADY HAVE AN ACTIVE LOBBY',
        existingMatch: existing || undefined,
        lobbyCode: existing?.lobbyCode,
      };
    }
    console.error('Failed to create 5v5 lobby:', err);
    return { success: false, error: err.message || 'Failed to create 5v5 lobby.' };
  }
}

/**
 * Join a 5v5 Lobby by Lobby Code.
 * Supports:
 * 1. Solo Player Joining: Automatically promoted to TEAM B CAPTAIN!
 * 2. Squad Captain Joining: Connects an existing squad to Team B.
 */
export async function join5v5Lobby(params: {
  lobbyCode: string;
  captainId?: string;
  playerId?: string;
  teamId?: string;
  teamSide?: 'teamA' | 'teamB';
}): Promise<{ success: boolean; match?: Match; error?: string }> {
  try {
    const { lobbyCode, captainId, playerId, teamId, teamSide } = params;
    const cleanCode = lobbyCode.trim().toUpperCase();

    // Enforce authenticated Firebase user identity
    const authUser = auth.currentUser;
    const effectiveCaptainId = authUser?.uid || playerId || captainId;
    if (!effectiveCaptainId) {
      return { success: false, error: 'Authentication required to join lobby.' };
    }

    // 1. Fetch Lobby by code
    const q = query(
      collection(db, 'matches'),
      where('lobbyCode', '==', cleanCode),
      where('matchType', '==', '5v5'),
      limit(1)
    );
    const snap = await getDocs(q);
    if (snap.empty) {
      return { success: false, error: `Lobby with code "${cleanCode}" was not found.` };
    }

    const matchDoc = snap.docs[0];
    const match = matchDoc.data() as Match;

    // Reject direct join if the lobby is PRIVATE
    if (isMatchPrivate(match)) {
      return {
        success: false,
        error: 'PRIVATE_LOBBY: This lobby is private. Entry is restricted to accepted invitations only.',
      };
    }

    if (match.status !== 'WAITING_FOR_OPPONENT' && match.status !== 'TEAM_ROSTERS_FILLING') {
      return {
        success: false,
        error: `This lobby is no longer open for opponents (current status: ${match.status}).`,
      };
    }

    const teamAPlayerIds = match.teamAPlayerIds || [];
    const teamBPlayerIds = match.teamBPlayerIds || [];
    const authUid = (auth.currentUser?.uid || '').trim();
    const checkUids = Array.from(new Set([effectiveCaptainId, authUid].filter(Boolean)));

    const isAlreadyOnTeamA = checkUids.some((uid) =>
      teamAPlayerIds.includes(uid) ||
      match.captainAId === uid ||
      match.playerAId === uid ||
      match.createdBy === uid ||
      match.lobbyOwnerId === uid
    );

    const isAlreadyOnTeamB = checkUids.some((uid) =>
      teamBPlayerIds.includes(uid) ||
      match.captainBId === uid ||
      match.playerBId === uid
    );

    if (isAlreadyOnTeamA || isAlreadyOnTeamB) {
      return { success: false, error: 'ALREADY_IN_LOBBY: You are already an active participant in this lobby.' };
    }

    // Check if player is already active in another lobby
    const playerActiveLobby = await getPlayerActive5v5Lobby(effectiveCaptainId, match.id);
    if (playerActiveLobby) {
      return {
        success: false,
        error: `ALREADY_IN_ANOTHER_LOBBY: You are already in an active 5v5 lobby (${playerActiveLobby.lobbyCode || playerActiveLobby.id}).`,
      };
    }

    const now = Date.now();

    // CASE A: Solo Player Joining
    if (!teamId) {
      const profiles = await fetchPlayerProfiles([effectiveCaptainId]);
      const p = profiles[effectiveCaptainId];
      const ignKey = match.gameId.toLowerCase().includes('cs') ? 'cs2' : 'valorant';
      const inGameName =
        p?.inGameNames?.[ignKey] || p?.inGameName || p?.gamerTag || 'Player';
      const gamerTag = p?.gamerTag || 'Player';
      const name = p?.fullName || gamerTag;
      const rating = p?.overallRating || 1000;

      const resolvedPlayer = {
        id: effectiveCaptainId,
        gamerTag,
        name,
        rating,
        inGameName,
      };

      const tagPrefix = gamerTag.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase() || 'SQDB';

      const matchDocRef = doc(db, 'matches', match.id);
      let updatedMatch: Match = { ...match };
      let assignedSide: 'teamA' | 'teamB' = teamSide === 'teamA' ? 'teamA' : 'teamB';
      let isPromotedToCaptainB = false;

      await runTransaction(db, async (transaction) => {
        const liveMatchSnap = await transaction.get(matchDocRef);
        if (!liveMatchSnap.exists()) {
          throw new Error('Lobby does not exist.');
        }
        const liveMatch = liveMatchSnap.data() as Match;

        if (isMatchPrivate(liveMatch)) {
          throw new Error('PRIVATE_LOBBY: This lobby is private. Entry is restricted to accepted invitations only.');
        }

        if (liveMatch.status !== 'WAITING_FOR_OPPONENT' && liveMatch.status !== 'TEAM_ROSTERS_FILLING') {
          throw new Error(`This lobby is no longer open for opponents (current status: ${liveMatch.status}).`);
        }

        const liveTeamAPlayerIds = liveMatch.teamAPlayerIds || [];
        const liveTeamBPlayerIds = liveMatch.teamBPlayerIds || [];

        if (
          liveTeamAPlayerIds.includes(effectiveCaptainId) ||
          liveMatch.captainAId === effectiveCaptainId ||
          liveMatch.playerAId === effectiveCaptainId ||
          liveMatch.createdBy === effectiveCaptainId ||
          liveMatch.lobbyOwnerId === effectiveCaptainId
        ) {
          throw new Error('ALREADY_IN_LOBBY: You are already in Team A of this lobby.');
        }

        if (
          liveTeamBPlayerIds.includes(effectiveCaptainId) ||
          liveMatch.captainBId === effectiveCaptainId ||
          liveMatch.playerBId === effectiveCaptainId
        ) {
          throw new Error('ALREADY_IN_LOBBY: You are already in Team B of this lobby.');
        }

        // Determine destination team side
        const isTeamBEmpty = liveTeamBPlayerIds.length === 0 && !liveMatch.captainBId;

        if (teamSide === 'teamA') {
          if (liveTeamAPlayerIds.length >= 5) {
            throw new Error('Team A roster is full (5/5 players).');
          }
          assignedSide = 'teamA';
        } else if (teamSide === 'teamB') {
          if (liveTeamBPlayerIds.length >= 5) {
            throw new Error('Team B roster is full (5/5 players).');
          }
          assignedSide = 'teamB';
        } else {
          // Automatic assignment based on availability
          if (isTeamBEmpty) {
            // First player to join empty Team B becomes Team B Captain
            assignedSide = 'teamB';
          } else if (liveTeamAPlayerIds.length >= 5 && liveTeamBPlayerIds.length < 5) {
            // Team A 5/5, Team B 3/5 -> joins Team B (TEST 2)
            assignedSide = 'teamB';
          } else if (liveTeamBPlayerIds.length >= 5 && liveTeamAPlayerIds.length < 5) {
            // Team A 3/5, Team B 5/5 -> joins Team A (TEST 3)
            assignedSide = 'teamA';
          } else if (liveTeamAPlayerIds.length < 5 && liveTeamBPlayerIds.length < 5) {
            // Both teams have slots: balance teams (or fill Team A if equal)
            if (liveTeamAPlayerIds.length <= liveTeamBPlayerIds.length) {
              assignedSide = 'teamA';
            } else {
              assignedSide = 'teamB';
            }
          } else {
            throw new Error('LOBBY_FULL: Both team rosters are full (5/5 players).');
          }
        }

        let updates: Partial<Match> = {};

        if (assignedSide === 'teamB' && isTeamBEmpty) {
          // Promoted to Team B Captain
          isPromotedToCaptainB = true;
          updates = {
            teamBId: liveMatch.teamBId || `team_b_${liveMatch.id}`,
            teamBName: liveMatch.teamBName && liveMatch.teamBName !== 'EMPTY' ? liveMatch.teamBName : `${gamerTag}'s Squad`,
            teamBTag: liveMatch.teamBTag && liveMatch.teamBTag !== 'TBD' ? liveMatch.teamBTag : tagPrefix,
            teamBLogo: liveMatch.teamBLogo || '⚔️',
            captainBId: effectiveCaptainId,
            playerBId: effectiveCaptainId,
            playerBName: name,
            playerBGamerTag: gamerTag,
            teamBPlayerIds: [effectiveCaptainId],
            teamBPlayers: [resolvedPlayer],
            teamBAvgRating: rating,
            teamBRatingBefore: rating,
            status: 'TEAM_ROSTERS_FILLING',
            playersNeeded: Math.max(0, 5 - liveTeamAPlayerIds.length),
            playerReadyStatus: {
              ...(liveMatch.playerReadyStatus || {}),
              [effectiveCaptainId]: false,
            },
            updatedAt: now,
          };
        } else if (assignedSide === 'teamB') {
          // Joining existing Team B as player
          if (liveTeamBPlayerIds.length >= 5) {
            throw new Error('Team B roster is full (5/5 players).');
          }
          const updatedBIds = [...liveTeamBPlayerIds, effectiveCaptainId];
          const updatedBPlayers = [
            ...(liveMatch.teamBPlayers || []).filter((pl) => pl.id !== effectiveCaptainId),
            resolvedPlayer,
          ];
          const sumRatings = updatedBPlayers.reduce((acc, pl) => acc + (pl.rating || 1000), 0);
          const newAvgB = Math.round(sumRatings / Math.max(1, updatedBPlayers.length));
          const isBothFull = liveTeamAPlayerIds.length === 5 && updatedBIds.length === 5;

          updates = {
            teamBPlayerIds: updatedBIds,
            teamBPlayers: updatedBPlayers,
            teamBAvgRating: newAvgB,
            status: isBothFull ? 'READY_CHECK' : 'TEAM_ROSTERS_FILLING',
            playerReadyStatus: {
              ...(liveMatch.playerReadyStatus || {}),
              [effectiveCaptainId]: false,
            },
            updatedAt: now,
          };
        } else {
          // Joining Team A as player
          if (liveTeamAPlayerIds.length >= 5) {
            throw new Error('Team A roster is full (5/5 players).');
          }
          const updatedAIds = [...liveTeamAPlayerIds, effectiveCaptainId];
          const updatedAPlayers = [
            ...(liveMatch.teamAPlayers || []).filter((pl) => pl.id !== effectiveCaptainId),
            resolvedPlayer,
          ];
          const sumRatings = updatedAPlayers.reduce((acc, pl) => acc + (pl.rating || 1000), 0);
          const newAvgA = Math.round(sumRatings / Math.max(1, updatedAPlayers.length));
          const isBothFull = updatedAIds.length === 5 && liveTeamBPlayerIds.length === 5;

          updates = {
            teamAPlayerIds: updatedAIds,
            teamAPlayers: updatedAPlayers,
            teamAAvgRating: newAvgA,
            playersNeeded: Math.max(0, 5 - updatedAIds.length),
            status: isBothFull ? 'READY_CHECK' : 'TEAM_ROSTERS_FILLING',
            playerReadyStatus: {
              ...(liveMatch.playerReadyStatus || {}),
              [effectiveCaptainId]: false,
            },
            updatedAt: now,
          };
        }

        transaction.update(matchDocRef, sanitizeFirestoreData(updates));
        transaction.set(
          doc(db, 'players', effectiveCaptainId),
          sanitizeFirestoreData({ active5v5LobbyId: liveMatch.id }),
          { merge: true }
        );

        updatedMatch = {
          ...liveMatch,
          ...updates,
        };
      });

      // Notifications
      if (isPromotedToCaptainB && (match.lobbyOwnerId || match.captainAId)) {
        await sendNotification({
          userId: match.lobbyOwnerId || match.captainAId!,
          type: 'LOBBY_JOINED',
          title: 'Opponent Captain Joined Team B',
          message: `${gamerTag} has joined as Team B Captain for lobby ${match.lobbyCode}.`,
          data: { matchId: match.id, lobbyId: match.id },
        });
      } else {
        const notifyTarget = assignedSide === 'teamA'
          ? (match.captainAId || match.lobbyOwnerId)
          : (match.captainBId || match.captainAId || match.lobbyOwnerId);
        if (notifyTarget && notifyTarget !== effectiveCaptainId) {
          await sendNotification({
            userId: notifyTarget,
            type: 'LOBBY_JOINED',
            title: `Player Joined ${assignedSide === 'teamA' ? 'Team A' : 'Team B'}`,
            message: `${gamerTag} has joined ${assignedSide === 'teamA' ? match.teamAName || 'Team A' : match.teamBName || 'Team B'} in lobby ${match.lobbyCode}.`,
            data: { matchId: match.id, lobbyId: match.id },
          });
        }
      }

      return { success: true, match: updatedMatch };
    }

    // CASE B: Existing Squad Captain Joining
    const teamSnap = await getDoc(doc(db, 'teams', teamId));
    if (!teamSnap.exists()) {
      return { success: false, error: 'Your team was not found.' };
    }
    const teamB = teamSnap.data() as Team;

    if (teamB.captainId !== effectiveCaptainId) {
      return { success: false, error: 'Only the squad captain can join a 5v5 ranked lobby with a team.' };
    }

    // Validate that no squad member is already in an active 5v5 lobby
    for (const mid of teamB.memberIds) {
      const memberActive = await getPlayerActive5v5Lobby(mid, match.id);
      if (memberActive) {
        return {
          success: false,
          error: `A player on your squad is already an active member of 5v5 lobby ${memberActive.lobbyCode || memberActive.id}.`,
        };
      }
    }

    if (teamB.gameId.toLowerCase() !== match.gameId.toLowerCase()) {
      return {
        success: false,
        error: `This lobby is for ${match.gameName}, but your team is registered for ${teamB.gameName}.`,
      };
    }

    if (match.teamAId === teamB.teamId) {
      return { success: false, error: 'A team cannot play against itself.' };
    }

    const duplicates = teamB.memberIds.filter(
      (id) => teamAPlayerIds.includes(id) || id === match.captainAId || id === match.playerAId || id === match.createdBy
    );
    if (duplicates.length > 0) {
      return {
        success: false,
        error: 'Validation failed: You cannot select yourself as an opponent or play on both sides.',
      };
    }

    const teamBProfiles = await fetchPlayerProfiles(teamB.memberIds);
    const resolvedTeamBPlayers = teamB.memberIds.map((uid, idx) => {
      const p = teamBProfiles[uid];
      const existingMember = teamB.members?.find((m) => m.id === uid);
      const ignKey = match.gameId.toLowerCase().includes('cs') ? 'cs2' : 'valorant';
      const inGameName =
        p?.inGameNames?.[ignKey] ||
        p?.inGameName ||
        existingMember?.inGameName ||
        p?.gamerTag ||
        'Player';
      const gamerTag =
        p?.gamerTag ||
        existingMember?.gamerTag ||
        (uid === captainId ? teamB.captainGamerTag : `Player ${idx + 1}`) ||
        'Player';
      const name = p?.fullName || existingMember?.fullName || gamerTag;
      const rating = p?.overallRating || existingMember?.rating || 1000;

      return {
        id: uid,
        gamerTag,
        name,
        rating,
        inGameName,
      };
    });

    const teamBAvgRating = Math.round(
      resolvedTeamBPlayers.reduce((acc, m) => acc + (m.rating || 1000), 0) / Math.max(1, resolvedTeamBPlayers.length)
    );

    const isFull5 = resolvedTeamBPlayers.length === 5;
    const isTeamAFull5 = (match.teamAPlayerIds || []).length === 5;
    const targetStatus: MatchStatus = isFull5 && isTeamAFull5 ? 'READY_CHECK' : 'TEAM_ROSTERS_FILLING';

    const updates: Partial<Match> = {
      teamBId: teamB.teamId,
      teamBName: teamB.teamName,
      teamBTag: teamB.teamTag,
      teamBLogo: teamB.teamLogo || '⚔️',
      captainBId: teamB.captainId,
      playerBId: teamB.captainId,
      playerBName: teamB.captainName,
      playerBGamerTag: teamB.captainGamerTag,
      teamBPlayerIds: [...teamB.memberIds],
      teamBPlayers: resolvedTeamBPlayers,
      teamBAvgRating,
      teamBRatingBefore: teamB.teamRating || teamBAvgRating,
      status: targetStatus,
      isRecruiting: false,
      recruitmentStatus: isFull5 ? 'FULL' : 'ACTIVE',
      playersNeeded: Math.max(0, 5 - resolvedTeamBPlayers.length),
      playerReadyStatus: {
        ...(match.playerReadyStatus || {}),
        ...resolvedTeamBPlayers.reduce((acc, p) => ({ ...acc, [p.id]: false }), {}),
      },
      updatedAt: now,
    };

    await updateDoc(doc(db, 'matches', match.id), sanitizeFirestoreData(updates));

    const updatedMatch: Match = {
      ...match,
      ...updates,
    };

    if (match.lobbyOwnerId || match.captainAId) {
      await sendNotification({
        userId: match.lobbyOwnerId || match.captainAId!,
        type: 'LOBBY_JOINED',
        title: 'Opposing Squad Connected',
        message: `${teamB.teamName} has joined Team B for lobby ${match.lobbyCode}.`,
        data: { matchId: match.id, lobbyId: match.id },
      });
    }

    return { success: true, match: updatedMatch };
  } catch (err: any) {
    console.error('Failed to join 5v5 lobby:', err);
    return { success: false, error: err.message || 'Failed to join 5v5 lobby.' };
  }
}

/**
 * Join an empty Team B directly as Solo Captain from the match room
 */
export async function joinTeamBAsSoloCaptain(params: {
  matchId: string;
  playerId: string;
}): Promise<{ success: boolean; match?: Match; error?: string }> {
  try {
    const { matchId, playerId } = params;
    const authUid = (auth.currentUser?.uid || '').trim();
    const matchRef = doc(db, 'matches', matchId);
    const snap = await getDoc(matchRef);
    if (!snap.exists()) {
      return { success: false, error: 'Match does not exist.' };
    }
    const match = snap.data() as Match;

    const teamAPlayerIds = match.teamAPlayerIds || [];
    const isAlreadyOnTeamA =
      teamAPlayerIds.includes(playerId) ||
      match.captainAId === playerId ||
      match.playerAId === playerId ||
      match.createdBy === playerId ||
      (authUid && (
        teamAPlayerIds.includes(authUid) ||
        match.captainAId === authUid ||
        match.playerAId === authUid ||
        match.createdBy === authUid
      ));

    if (isAlreadyOnTeamA) {
      return { success: false, error: 'You cannot select yourself as an opponent.' };
    }

    return await join5v5Lobby({
      lobbyCode: match.lobbyCode || '',
      captainId: playerId,
    });
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to join Team B.' };
  }
}

/**
 * Claim Team B Captaincy for an existing member of Team B
 * Allows a Team B member to voluntarily become the Team B Captain.
 */
export async function claimTeamBCaptaincy(params: {
  matchId: string;
  playerId: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { matchId, playerId } = params;
    const authenticatedUser = await getAuthenticatedUser();
    const authUid = authenticatedUser?.uid || auth.currentUser?.uid;
    if (!authUid || authUid !== playerId) {
      return { success: false, error: 'Unauthorized: Authentication required.' };
    }

    const matchRef = doc(db, 'matches', matchId);
    const now = Date.now();

    let gamerTag = 'Player';
    let fullName = 'Player';
    try {
      const playerSnap = await getDoc(doc(db, 'players', authUid));
      const playerData = playerSnap.data() as Player | undefined;
      gamerTag = playerData?.gamerTag || 'Player';
      fullName = playerData?.fullName || gamerTag;
    } catch (_) {}

    await runTransaction(db, async (tx) => {
      const snap = await tx.get(matchRef);
      if (!snap.exists()) {
        throw new Error('Match does not exist.');
      }
      const match = snap.data() as Match;

      if (match.status === 'LIVE' || match.status === 'CONFIRMED' || match.status === 'CANCELLED') {
        throw new Error('Cannot claim captaincy for an active, confirmed, or cancelled match.');
      }

      const teamBIds = match.teamBPlayerIds || [];
      if (!teamBIds.includes(authUid)) {
        throw new Error('You must be an active member of Team B to claim captaincy.');
      }

      if (match.captainBId && match.captainBId !== authUid) {
        throw new Error('Team B already has an active Captain.');
      }

      tx.update(matchRef, sanitizeFirestoreData({
        captainBId: authUid,
        playerBId: authUid,
        playerBName: fullName,
        playerBGamerTag: gamerTag,
        updatedAt: now,
      }));
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to claim Team B Captaincy.' };
  }
}

/**
 * Request to join Team A or Team B as an individual player
 */
export async function requestToJoin5v5Team(params: {
  matchId: string;
  playerId: string;
  teamSide: 'teamA' | 'teamB';
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { matchId, playerId, teamSide } = params;
    const authUid = (auth.currentUser?.uid || '').trim();
    const matchRef = doc(db, 'matches', matchId);
    const snap = await getDoc(matchRef);
    if (!snap.exists()) {
      return { success: false, error: 'Match does not exist.' };
    }
    const match = snap.data() as Match;

    // Verify not already in either team
    const teamAIds = match.teamAPlayerIds || [];
    const teamBIds = match.teamBPlayerIds || [];
    const checkIds = [playerId, authUid].filter(Boolean);

    const isAlreadyInTeamA = checkIds.some((id) =>
      teamAIds.includes(id) || match.captainAId === id || match.playerAId === id || match.createdBy === id || match.lobbyOwnerId === id
    );
    const isAlreadyInTeamB = checkIds.some((id) =>
      teamBIds.includes(id) || match.captainBId === id || match.playerBId === id
    );

    if (isAlreadyInTeamA || isAlreadyInTeamB) {
      return { success: false, error: 'ALREADY_IN_LOBBY: You are already an active participant in this lobby.' };
    }

    const playerActiveLobby = await getPlayerActive5v5Lobby(playerId, matchId);
    if (playerActiveLobby) {
      return {
        success: false,
        error: `ALREADY_IN_ANOTHER_LOBBY: You are already in an active 5v5 lobby (${playerActiveLobby.lobbyCode || playerActiveLobby.id}).`,
      };
    }

    const currentRoster = teamSide === 'teamA' ? teamAIds : teamBIds;
    if (currentRoster.length >= 5) {
      return { success: false, error: `${teamSide === 'teamA' ? 'Team A' : 'Team B'} is already full (5/5).` };
    }

    const profiles = await fetchPlayerProfiles([playerId]);
    const p = profiles[playerId];
    const ignKey = match.gameId.toLowerCase().includes('cs') ? 'cs2' : 'valorant';
    const gamerTag = p?.gamerTag || 'Player';
    const fullName = p?.fullName || gamerTag;
    const inGameName = p?.inGameNames?.[ignKey] || p?.inGameName || gamerTag;
    const rating = p?.overallRating || 1000;

    const requestRef = doc(collection(db, 'matches', matchId, 'joinRequests'));
    const joinReq: LobbyJoinRequest = {
      id: requestRef.id,
      matchId,
      playerId,
      gamerTag,
      fullName,
      inGameName,
      rating,
      teamSide,
      status: 'PENDING',
      requestedAt: Date.now(),
    };

    await setDoc(requestRef, sanitizeFirestoreData(joinReq));

    // Also persist in lobbyJoinRequests top-level collection for queries
    await setDoc(doc(db, 'lobbyJoinRequests', requestRef.id), sanitizeFirestoreData(joinReq));

    // Notify the respective team captain
    const captainId = teamSide === 'teamA' ? (match.captainAId || match.lobbyOwnerId) : match.captainBId;
    if (captainId) {
      await sendNotification({
        userId: captainId,
        type: 'TEAM_INVITE',
        title: `5v5 Join Request (${teamSide === 'teamA' ? 'Team A' : 'Team B'})`,
        message: `${gamerTag} requested to join ${teamSide === 'teamA' ? match.teamAName || 'Team A' : match.teamBName || 'Team B'}.`,
        data: { matchId, lobbyId: matchId, requestId: requestRef.id },
      });
    }

    return { success: true };
  } catch (err: any) {
    console.error('requestToJoin5v5Team error:', err);
    return { success: false, error: err.message || 'Failed to submit join request.' };
  }
}

/**
 * Team Captain responds to a join request (ACCEPT or REJECT)
 */
export async function respondTo5v5JoinRequest(params: {
  matchId: string;
  requestId: string;
  captainId: string;
  decision: 'ACCEPT' | 'REJECT';
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { matchId, requestId, captainId, decision } = params;
    const matchRef = doc(db, 'matches', matchId);
    const now = Date.now();

    const result = await runTransaction(db, async (transaction) => {
      const matchSnap = await transaction.get(matchRef);
      if (!matchSnap.exists()) {
        throw new Error('Match does not exist.');
      }
      const currentMatch = matchSnap.data() as Match;

      // Look up join request
      const reqRef = doc(db, 'matches', matchId, 'joinRequests', requestId);
      const reqSnap = await transaction.get(reqRef);
      if (!reqSnap.exists()) {
        throw new Error('Join request not found.');
      }
      const reqData = reqSnap.data() as LobbyJoinRequest;

      if (reqData.status !== 'PENDING') {
        throw new Error(`This request has already been ${reqData.status.toLowerCase()}.`);
      }

      // Check captain authorization
      const isLobbyOwner = Boolean(
        captainId &&
        (captainId === currentMatch.lobbyOwnerId || captainId === currentMatch.createdBy)
      );
      const isTeamACaptain = isLobbyOwner || captainId === currentMatch.captainAId || captainId === currentMatch.playerAId;
      const isTeamBCaptain = captainId === currentMatch.captainBId || captainId === currentMatch.playerBId;

      if (reqData.teamSide === 'teamA' && !isTeamACaptain) {
        throw new Error('Only the Team A Captain can respond to Team A join requests.');
      }
      if (reqData.teamSide === 'teamB' && !isTeamBCaptain && !isTeamACaptain) {
        throw new Error('Only the Team B Captain or Team A Captain can respond to Team B join requests.');
      }

      if (decision === 'REJECT') {
        transaction.update(reqRef, sanitizeFirestoreData({
          status: 'REJECTED',
          respondedAt: now,
          respondedBy: captainId,
        }));
        transaction.update(doc(db, 'lobbyJoinRequests', requestId), sanitizeFirestoreData({
          status: 'REJECTED',
          respondedAt: now,
          respondedBy: captainId,
        }));
        return { success: true, accepted: false, targetPlayerId: reqData.playerId };
      }

      // ACCEPT Logic
      const teamKey = reqData.teamSide === 'teamA' ? 'teamAPlayerIds' : 'teamBPlayerIds';
      const playersKey = reqData.teamSide === 'teamA' ? 'teamAPlayers' : 'teamBPlayers';
      const currentIds: string[] = currentMatch[teamKey] || [];
      const currentPlayers: any[] = currentMatch[playersKey] || [];

      if (currentIds.length >= 5) {
        throw new Error(`${reqData.teamSide === 'teamA' ? 'Team A' : 'Team B'} is already full (5/5).`);
      }

      if (currentIds.includes(reqData.playerId)) {
        throw new Error('Player is already in this team.');
      }

      const newPlayer = {
        id: reqData.playerId,
        gamerTag: reqData.gamerTag,
        name: reqData.fullName || reqData.gamerTag,
        rating: reqData.rating || 1000,
        inGameName: reqData.inGameName || reqData.gamerTag,
      };

      const updatedIds = [...currentIds, reqData.playerId];
      const updatedPlayers = [...currentPlayers, newPlayer];
      const updatedNeeded = Math.max(0, 5 - updatedIds.length);

      const isTeamA5 = reqData.teamSide === 'teamA' ? updatedIds.length === 5 : (currentMatch.teamAPlayerIds || []).length === 5;
      const isTeamB5 = reqData.teamSide === 'teamB' ? updatedIds.length === 5 : (currentMatch.teamBPlayerIds || []).length === 5;

      const newStatus: MatchStatus = isTeamA5 && isTeamB5 ? 'READY_CHECK' : 'TEAM_ROSTERS_FILLING';

      const matchUpdates: Partial<Match> = {
        [teamKey]: updatedIds,
        [playersKey]: updatedPlayers,
        status: newStatus,
        playersNeeded: reqData.teamSide === 'teamA' ? updatedNeeded : currentMatch.playersNeeded,
        playerReadyStatus: {
          ...(currentMatch.playerReadyStatus || {}),
          [reqData.playerId]: false,
        },
        updatedAt: now,
      };

      if (reqData.teamSide === 'teamA' && updatedNeeded === 0) {
        matchUpdates.isRecruiting = false;
        matchUpdates.recruitmentStatus = 'FULL';
      } else if (reqData.teamSide === 'teamB') {
        if (!currentMatch.teamBName || currentMatch.teamBName === 'EMPTY') {
          matchUpdates.teamBName = 'Team B';
        }
        if (!currentMatch.teamBTag || currentMatch.teamBTag === 'TBD') {
          matchUpdates.teamBTag = 'SQD-B';
        }
        if (updatedIds.length === 5) {
          matchUpdates.isTeamBRecruiting = false;
        }
      }

      transaction.update(matchRef, sanitizeFirestoreData(matchUpdates));
      transaction.update(reqRef, sanitizeFirestoreData({
        status: 'ACCEPTED',
        respondedAt: now,
        respondedBy: captainId,
      }));
      transaction.update(doc(db, 'lobbyJoinRequests', requestId), sanitizeFirestoreData({
        status: 'ACCEPTED',
        respondedAt: now,
        respondedBy: captainId,
      }));

      return {
        success: true,
        accepted: true,
        targetPlayerId: reqData.playerId,
        teamSide: reqData.teamSide,
        teamName: reqData.teamSide === 'teamA' ? currentMatch.teamAName : currentMatch.teamBName,
        isFull: updatedIds.length === 5,
      };
    });

    if (result.success && result.targetPlayerId) {
      await sendNotification({
        userId: result.targetPlayerId,
        type: 'TEAM_INVITE',
        title: result.accepted ? 'Join Request Accepted!' : 'Join Request Declined',
        message: result.accepted
          ? `You have joined ${result.teamName || 'the squad'} in the 5v5 lobby!`
          : 'Your request to join the 5v5 squad was declined.',
        data: { matchId, lobbyId: matchId },
      });
    }

    return { success: true };
  } catch (err: any) {
    console.error('respondTo5v5JoinRequest error:', err);
    return { success: false, error: err.message || 'Failed to respond to join request.' };
  }
}

/**
 * Remove a player from Team A or Team B
 * - Captain can only remove players from their own team
 * - Captain cannot remove themselves directly (must transfer or leave empty)
 */
export async function removePlayerFrom5v5Team(params: {
  matchId: string;
  captainId?: string;
  callerId?: string;
  targetPlayerId: string;
  teamSide: 'teamA' | 'teamB';
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { matchId, targetPlayerId, teamSide } = params;
    const actorId = auth.currentUser?.uid || params.captainId || params.callerId || '';
    const matchRef = doc(db, 'matches', matchId);
    const now = Date.now();

    await runTransaction(db, async (transaction) => {
      const matchSnap = await transaction.get(matchRef);
      if (!matchSnap.exists()) throw new Error('Match not found.');
      const currentMatch = matchSnap.data() as Match;

      if (currentMatch.status === 'LIVE' || currentMatch.status === 'CONFIRMED') {
        throw new Error('Cannot remove players from an active or finished match.');
      }

      const isCapAOrOwner = Boolean(
        actorId &&
        (actorId === currentMatch.captainAId ||
          actorId === currentMatch.lobbyOwnerId ||
          actorId === currentMatch.createdBy ||
          actorId === currentMatch.playerAId)
      );

      const isSelf = actorId === targetPlayerId;
      if (isSelf) {
        if ((teamSide === 'teamA' && isCapAOrOwner) ||
            (teamSide === 'teamB' && actorId === currentMatch.captainBId)) {
          throw new Error('As captain, you cannot remove yourself. Step down or leave using the captain action.');
        }
      } else {
        // Check captain authority: Team A Captain can remove Team A or Team B players. Team B Captain can only remove Team B players.
        const isLobbyOwnerOrCapA = isCapAOrOwner;
        const isCapB = actorId === currentMatch.captainBId || actorId === currentMatch.playerBId;

        if (teamSide === 'teamA') {
          if (!isLobbyOwnerOrCapA) throw new Error('PERMISSION DENIED: Only Team A Captain / Lobby Owner can remove Team A players.');
        } else {
          if (!isCapB && !isLobbyOwnerOrCapA) throw new Error('PERMISSION DENIED: Only Team Captains can remove Team B players.');
          // Preserve existing protection for captain removal
          if (targetPlayerId === currentMatch.captainBId) {
            throw new Error('PROTECTED: Team B Captain cannot be removed. Team B Captain must step down or transfer captaincy.');
          }
        }
      }

      const teamKey = teamSide === 'teamA' ? 'teamAPlayerIds' : 'teamBPlayerIds';
      const playersKey = teamSide === 'teamA' ? 'teamAPlayers' : 'teamBPlayers';
      const currentIds: string[] = currentMatch[teamKey] || [];
      const currentPlayers: any[] = currentMatch[playersKey] || [];

      if (!currentIds.includes(targetPlayerId)) {
        throw new Error('Player is not in this team.');
      }

      const updatedIds = currentIds.filter((id) => id !== targetPlayerId);
      const updatedPlayers = currentPlayers.filter((p) => p.id !== targetPlayerId);
      const newNeeded = Math.max(0, 5 - updatedIds.length);

      const updatedReadyStatus = { ...(currentMatch.playerReadyStatus || {}) };
      delete updatedReadyStatus[targetPlayerId];

      const matchUpdates: Partial<Match> = {
        [teamKey]: updatedIds,
        [playersKey]: updatedPlayers,
        status: 'TEAM_ROSTERS_FILLING',
        playerReadyStatus: updatedReadyStatus,
        updatedAt: now,
      };

      if (teamSide === 'teamA') {
        matchUpdates.playersNeeded = newNeeded;
      }

      transaction.update(matchRef, sanitizeFirestoreData(matchUpdates));
    });

    // Release active5v5LobbyId for removed player
    try {
      const pDoc = await getDoc(doc(db, 'players', targetPlayerId));
      if (pDoc.exists() && pDoc.data()?.active5v5LobbyId === matchId) {
        await updateDoc(doc(db, 'players', targetPlayerId), { active5v5LobbyId: null });
      }
    } catch (_) {}

    // Notify removed player if removed by someone else
    if (actorId !== targetPlayerId) {
      await sendNotification({
        userId: targetPlayerId,
        type: 'PLAYER_REMOVED',
        title: 'Removed from Roster',
        message: `You were removed from ${teamSide === 'teamA' ? 'Team A' : 'Team B'} by the team captain.`,
        data: { matchId },
      });
    }

    return { success: true };
  } catch (err: any) {
    console.error('removePlayerFrom5v5Team error:', err);
    return { success: false, error: err.message || 'Failed to remove player.' };
  }
}

/**
 * Team B Captain leaves the squad before match starts.
 * If 1/5: resets Team B to empty (0/5, WAITING_FOR_OPPONENT).
 * If > 1 players: promotes the next player to Team B Captain.
 */
export async function leaveTeamBAsCaptain(params: {
  matchId: string;
  captainId: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { matchId, captainId } = params;
    const matchRef = doc(db, 'matches', matchId);
    const now = Date.now();

    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(matchRef);
      if (!snap.exists()) throw new Error('Match not found.');
      const currentMatch = snap.data() as Match;

      if (currentMatch.captainBId !== captainId) {
        throw new Error('You are not the Team B Captain.');
      }
      if (currentMatch.status === 'LIVE' || currentMatch.status === 'CONFIRMED') {
        throw new Error('Cannot leave during an active or confirmed match.');
      }

      const teamBIds = (currentMatch.teamBPlayerIds || []).filter((id) => id !== captainId);
      const teamBPlayers = (currentMatch.teamBPlayers || []).filter((p) => p.id !== captainId);

      const updatedReadyStatus = { ...(currentMatch.playerReadyStatus || {}) };
      delete updatedReadyStatus[captainId];

      if (teamBIds.length === 0) {
        // Team B becomes completely EMPTY
        transaction.update(matchRef, sanitizeFirestoreData({
          teamBId: null,
          teamBName: 'EMPTY',
          teamBTag: 'TBD',
          teamBLogo: '⚔️',
          captainBId: null,
          playerBId: null,
          playerBName: null,
          playerBGamerTag: null,
          teamBPlayerIds: [],
          teamBPlayers: [],
          teamBAvgRating: null,
          playerReadyStatus: updatedReadyStatus,
          status: 'WAITING_FOR_OPPONENT',
          updatedAt: now,
        }));
      } else {
        // Promote next player
        const nextCaptain = teamBPlayers[0];
        transaction.update(matchRef, sanitizeFirestoreData({
          captainBId: nextCaptain.id,
          playerBId: nextCaptain.id,
          playerBName: nextCaptain.name || nextCaptain.gamerTag,
          playerBGamerTag: nextCaptain.gamerTag,
          teamBPlayerIds: teamBIds,
          teamBPlayers: teamBPlayers,
          playerReadyStatus: updatedReadyStatus,
          status: 'TEAM_ROSTERS_FILLING',
          updatedAt: now,
        }));

        // Set next captain's active lobby
        const nextCapRef = doc(db, 'players', nextCaptain.id);
        transaction.set(nextCapRef, { active5v5LobbyId: matchId }, { merge: true });
      }
    });

    // Release departing captain's active5v5LobbyId
    try {
      const pDoc = await getDoc(doc(db, 'players', captainId));
      if (pDoc.exists() && pDoc.data()?.active5v5LobbyId === matchId) {
        await updateDoc(doc(db, 'players', captainId), { active5v5LobbyId: null });
      }
    } catch (_) {}

    // Close any Team B recruitment if empty
    try {
      const snap = await getDoc(matchRef);
      if (snap.exists() && (snap.data() as Match).teamBPlayerIds?.length === 0) {
        await updateDoc(doc(db, 'lobbyRecruitments', `rec_match_${matchId}_teamB`), sanitizeFirestoreData({
          status: 'CANCELLED',
          updatedAt: now,
        }));
      }
    } catch (e) {
      // Ignored
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to leave Team B.' };
  }
}

/**
 * Complete, unified 5v5 Lobby Leave Action for ANY participant.
 * Handles:
 * - Non-captain player on Team A or Team B
 * - Team B Captain
 * - Lobby Owner / Team A Captain (with transfer or disband)
 * - Releases active5v5LobbyId lock
 * - Cancels pending join requests/invites for this player in this lobby
 */
export async function leave5v5Lobby(params: {
  matchId: string;
  playerId: string;
  transferToPlayerId?: string;
  disbandIfOwner?: boolean;
}): Promise<{
  success: boolean;
  error?: string;
  lobbyDisbanded?: boolean;
  newOwnerId?: string;
}> {
  try {
    const { matchId, playerId, transferToPlayerId, disbandIfOwner } = params;
    const authUid = auth.currentUser?.uid || playerId;
    if (authUid !== playerId) {
      return { success: false, error: 'Unauthorized: Authenticated identity does not match leaving player.' };
    }

    const matchRef = doc(db, 'matches', matchId);
    const snap = await getDoc(matchRef);
    if (!snap.exists()) {
      return { success: false, error: '5v5 Lobby not found.' };
    }

    const match = snap.data() as Match;

    if (match.status === 'LIVE' || match.status === 'CONFIRMED') {
      return { success: false, error: 'Cannot leave a match while it is in progress or completed.' };
    }

    const isTeamA = (match.teamAPlayerIds || []).includes(playerId);
    const isTeamB = (match.teamBPlayerIds || []).includes(playerId);
    const isOwner = match.lobbyOwnerId === playerId || match.createdBy === playerId || match.captainAId === playerId;
    const isCapB = match.captainBId === playerId || match.playerBId === playerId;

    if (!isTeamA && !isTeamB && !isOwner && !isCapB) {
      // Release player's pointer if stale
      try {
        await updateDoc(doc(db, 'players', playerId), { active5v5LobbyId: null });
      } catch (_) {}
      return { success: true };
    }

    const now = Date.now();

    // 1. Lobby Owner / Team A Captain Leaving
    if (isOwner && isTeamA) {
      const remainingTeamAPlayers = (match.teamAPlayers || []).filter((p) => p.id !== playerId);
      const remainingTeamAIds = (match.teamAPlayerIds || []).filter((id) => id !== playerId);

      // If sole player on Team A or explicitly requested disband:
      if (remainingTeamAIds.length === 0 || disbandIfOwner) {
        const cancelRes = await cancelMatch({
          matchId,
          actorId: playerId,
          actorName: match.playerAGamerTag || 'Lobby Owner',
          reason: 'Lobby closed: Lobby owner left the 5v5 lobby.',
        });
        return {
          success: cancelRes.success,
          error: cancelRes.error,
          lobbyDisbanded: true,
        };
      }

      // Transfer ownership to specified or next player
      let targetNextPlayer = remainingTeamAPlayers.find((p) => p.id === transferToPlayerId);
      if (!targetNextPlayer) {
        targetNextPlayer = remainingTeamAPlayers[0];
      }
      const nextId = targetNextPlayer.id;
      const nextName = targetNextPlayer.name || targetNextPlayer.gamerTag;
      const nextTag = targetNextPlayer.gamerTag;

      const updatedReadyStatus = { ...(match.playerReadyStatus || {}) };
      delete updatedReadyStatus[playerId];

      const newNeeded = Math.max(0, 5 - remainingTeamAIds.length);

      await runTransaction(db, async (tx) => {
        tx.update(matchRef, sanitizeFirestoreData({
          lobbyOwnerId: nextId,
          captainAId: nextId,
          playerAId: nextId,
          playerAName: nextName,
          playerAGamerTag: nextTag,
          teamAPlayerIds: remainingTeamAIds,
          teamAPlayers: remainingTeamAPlayers,
          playersNeeded: newNeeded,
          playerReadyStatus: updatedReadyStatus,
          status: 'TEAM_ROSTERS_FILLING',
          updatedAt: now,
        }));

        // Set new owner's active lobby
        tx.set(doc(db, 'players', nextId), { active5v5LobbyId: matchId }, { merge: true });
        // Clear leaving player's active lobby
        tx.set(doc(db, 'players', playerId), { active5v5LobbyId: null }, { merge: true });
      });

      // Notify new lobby owner
      await sendNotification({
        userId: nextId,
        type: 'CAPTAIN_TRANSFERRED',
        title: '👑 Promoted to Lobby Owner',
        message: `You are now the Lobby Owner and Team A Captain for 5v5 lobby ${match.lobbyCode || matchId}!`,
        data: { matchId, lobbyId: matchId },
      });

      return { success: true, newOwnerId: nextId };
    }

    // 2. Team B Captain Leaving
    if (isCapB && isTeamB) {
      const res = await leaveTeamBAsCaptain({ matchId, captainId: playerId });
      return res;
    }

    // 3. Regular Player Leaving (Team A or Team B)
    const side = isTeamA ? 'teamA' : 'teamB';
    const res = await removePlayerFrom5v5Team({
      matchId,
      targetPlayerId: playerId,
      callerId: playerId,
      teamSide: side,
    });

    return res;
  } catch (err: any) {
    console.error('leave5v5Lobby error:', err);
    return { success: false, error: err.message || 'Failed to leave 5v5 lobby.' };
  }
}

/**
 * Switch team side inside a 5v5 lobby (Team A <-> Team B)
 * - Only available when rosters are filling or waiting for opponent (not LIVE or CONFIRMED)
 * - Target team must have available slot (< 5)
 * - Team A Lobby Owner cannot switch side without leaving or transferring ownership first
 */
export async function switch5v5TeamSide(params: {
  matchId: string;
  playerId: string;
}): Promise<{ success: boolean; targetSide?: 'teamA' | 'teamB'; error?: string }> {
  try {
    const { matchId, playerId } = params;
    const authenticatedUser = await getAuthenticatedUser();
    const authUid = authenticatedUser?.uid || auth.currentUser?.uid;
    if (!authUid || authUid !== playerId) {
      return { success: false, error: 'Unauthorized.' };
    }

    const matchRef = doc(db, 'matches', matchId);
    const now = Date.now();

    const result = await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(matchRef);
      if (!snap.exists()) throw new Error('Match not found.');
      const match = snap.data() as Match;

      if (match.status === 'LIVE' || match.status === 'CONFIRMED' || match.status === 'CANCELLED') {
        throw new Error('Cannot switch sides in an active, confirmed, or cancelled match.');
      }

      const isTeamA = (match.teamAPlayerIds || []).includes(playerId);
      const isTeamB = (match.teamBPlayerIds || []).includes(playerId);

      if (!isTeamA && !isTeamB) {
        throw new Error('You must be a member of this lobby to switch sides.');
      }

      const targetSide: 'teamA' | 'teamB' = isTeamA ? 'teamB' : 'teamA';
      const sourceSide: 'teamA' | 'teamB' = isTeamA ? 'teamA' : 'teamB';

      const targetIds = targetSide === 'teamA' ? (match.teamAPlayerIds || []) : (match.teamBPlayerIds || []);
      if (targetIds.length >= 5) {
        throw new Error(`${targetSide === 'teamA' ? 'Team A' : 'Team B'} is already full (5/5).`);
      }

      // Find player object from source
      const sourcePlayers = sourceSide === 'teamA' ? (match.teamAPlayers || []) : (match.teamBPlayers || []);
      const playerObj = sourcePlayers.find((p) => p.id === playerId) || {
        id: playerId,
        gamerTag: 'Player',
        name: 'Player',
        rating: 1000,
      };

      // Remove from source
      const newSourceIds = (sourceSide === 'teamA' ? match.teamAPlayerIds || [] : match.teamBPlayerIds || []).filter((id) => id !== playerId);
      const newSourcePlayers = sourcePlayers.filter((p) => p.id !== playerId);

      // Add to target
      const newTargetIds = [...targetIds, playerId];
      const targetPlayers = targetSide === 'teamA' ? (match.teamAPlayers || []) : (match.teamBPlayers || []);
      const newTargetPlayers = [...targetPlayers, playerObj];

      const updatedReady = { ...(match.playerReadyStatus || {}) };
      updatedReady[playerId] = false;

      const updates: any = {
        [sourceSide === 'teamA' ? 'teamAPlayerIds' : 'teamBPlayerIds']: newSourceIds,
        [sourceSide === 'teamA' ? 'teamAPlayers' : 'teamBPlayers']: newSourcePlayers,
        [targetSide === 'teamA' ? 'teamAPlayerIds' : 'teamBPlayerIds']: newTargetIds,
        [targetSide === 'teamA' ? 'teamAPlayers' : 'teamBPlayers']: newTargetPlayers,
        playerReadyStatus: updatedReady,
        status: 'TEAM_ROSTERS_FILLING',
        updatedAt: now,
      };

      // Handle Team A captaincy if leaving Team A:
      // Automatically promote next player in Team A to captain, or null if Team A is empty
      const isCaptainA =
        match.captainAId === playerId ||
        match.playerAId === playerId ||
        (match.teamAPlayerIds && match.teamAPlayerIds[0] === playerId);

      if (sourceSide === 'teamA' && isCaptainA) {
        if (newSourcePlayers.length > 0) {
          const nextCapA = newSourcePlayers[0];
          updates.captainAId = nextCapA.id;
          updates.playerAId = nextCapA.id;
          updates.playerAName = nextCapA.name || nextCapA.gamerTag;
          updates.playerAGamerTag = nextCapA.gamerTag;
        } else {
          updates.captainAId = null;
          updates.playerAId = null;
          updates.playerAName = null;
          updates.playerAGamerTag = null;
        }
      }

      // Handle Team B captaincy if leaving Team B:
      // Automatically promote next player in Team B to captain, or null if Team B is empty
      const isCaptainB =
        match.captainBId === playerId ||
        match.playerBId === playerId ||
        (match.teamBPlayerIds && match.teamBPlayerIds[0] === playerId);

      if (sourceSide === 'teamB' && isCaptainB) {
        if (newSourcePlayers.length > 0) {
          const nextCapB = newSourcePlayers[0];
          updates.captainBId = nextCapB.id;
          updates.playerBId = nextCapB.id;
          updates.playerBName = nextCapB.name || nextCapB.gamerTag;
          updates.playerBGamerTag = nextCapB.gamerTag;
        } else {
          updates.captainBId = null;
          updates.playerBId = null;
          updates.playerBName = null;
          updates.playerBGamerTag = null;
          updates.teamBId = null;
          updates.teamBName = 'EMPTY';
        }
      }

      // Handle becoming Team A captain if joining Team A and Team A currently has no captain
      if (targetSide === 'teamA' && (!match.captainAId || targetIds.length === 0)) {
        updates.captainAId = playerId;
        updates.playerAId = playerId;
        updates.playerAName = playerObj.name || playerObj.gamerTag;
        updates.playerAGamerTag = playerObj.gamerTag;
        updates.teamAName = match.teamAName || 'Squad A';
      }

      if (targetSide === 'teamB') {
        if (!match.teamBName || match.teamBName === 'EMPTY') {
          updates.teamBName = 'Team B';
        }
        if (!match.teamBTag || match.teamBTag === 'TBD') {
          updates.teamBTag = 'SQD-B';
        }
      }

      updates.playersNeeded = Math.max(0, 5 - (targetSide === 'teamA' ? newTargetIds.length : newSourceIds.length));

      transaction.update(matchRef, sanitizeFirestoreData(updates));
      return { targetSide };
    });

    return { success: true, targetSide: result.targetSide };
  } catch (err: any) {
    console.error('switch5v5TeamSide error:', err);
    return { success: false, error: err.message || 'Failed to switch sides.' };
  }
}

/**
 * Team B Captain publishes recruitment announcement to the Arena
 */
export async function publishTeamBRecruitment(params: {
  matchId: string;
  captainId: string;
  message?: string;
  preferredRole?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { matchId, captainId, message, preferredRole } = params;
    const matchRef = doc(db, 'matches', matchId);
    const snap = await getDoc(matchRef);
    if (!snap.exists()) return { success: false, error: 'Match does not exist.' };
    const match = snap.data() as Match;

    const isTeamBCaptain = match.captainBId === captainId;
    const isLobbyOwnerOrCapA = Boolean(
      captainId &&
      (captainId === match.lobbyOwnerId ||
        captainId === match.createdBy ||
        captainId === match.captainAId ||
        captainId === match.playerAId)
    );
    if (!isTeamBCaptain && !isLobbyOwnerOrCapA) {
      return { success: false, error: 'Only Team B Captain or Team A Captain can announce recruitment for Team B.' };
    }

    const currentActive = (match.teamBPlayerIds || []).length;
    const playersNeeded = Math.max(0, 5 - currentActive);

    if (playersNeeded === 0) {
      return { success: false, error: 'Team B roster is already full (5/5).' };
    }

    const recId = `rec_match_${matchId}_teamB`;
    const now = Date.now();

    await setDoc(doc(db, 'lobbyRecruitments', recId), sanitizeFirestoreData({
      id: recId,
      lobbyId: matchId,
      lobbyCode: match.lobbyCode,
      teamSide: 'teamB',
      teamId: match.teamBId || `teamb_${matchId}`,
      teamName: match.teamBName || 'Opposing Squad',
      teamTag: match.teamBTag || 'SQDB',
      teamLogo: match.teamBLogo || '⚔️',
      captainId: match.captainBId,
      captainName: match.playerBName || match.playerBGamerTag || 'Captain',
      captainGamerTag: match.playerBGamerTag || 'Captain',
      gameId: match.gameId,
      gameName: match.gameName,
      gameCategory: match.gameCategory || 'PC',
      station: match.station || 'PC-01',
      currentActivePlayers: currentActive,
      playersNeeded,
      status: 'ACTIVE',
      teamAvgRating: match.teamBAvgRating,
      playerIds: match.teamBPlayerIds || [captainId],
      recruitmentMessage: message || `Need ${playersNeeded} player${playersNeeded > 1 ? 's' : ''} to complete Team B!`,
      preferredRole,
      createdAt: now,
      updatedAt: now,
    }));

    await updateDoc(matchRef, sanitizeFirestoreData({
      updatedAt: now,
    }));

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to publish Team B recruitment.' };
  }
}

/**
 * Team B Captain cancels recruitment announcement
 */
export async function cancelTeamBRecruitment(params: {
  matchId: string;
  captainId: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { matchId, captainId } = params;
    const matchRef = doc(db, 'matches', matchId);
    const snap = await getDoc(matchRef);
    if (snap.exists()) {
      const match = snap.data() as Match;
      const isTeamBCaptain = match.captainBId === captainId;
      const isLobbyOwnerOrCapA = Boolean(
        captainId &&
        (captainId === match.lobbyOwnerId ||
          captainId === match.createdBy ||
          captainId === match.captainAId ||
          captainId === match.playerAId)
      );
      if (!isTeamBCaptain && !isLobbyOwnerOrCapA) {
        return { success: false, error: 'Only Team B Captain or Team A Captain can cancel recruitment for Team B.' };
      }
    }
    const recId = `rec_match_${matchId}_teamB`;
    const now = Date.now();

    await updateDoc(doc(db, 'lobbyRecruitments', recId), sanitizeFirestoreData({
      status: 'CANCELLED',
      updatedAt: now,
    }));

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to cancel recruitment.' };
  }
}

/**
 * Toggle ready status for an individual player in a 5v5 match
 */
export async function togglePlayerReady(params: {
  matchId: string;
  playerId: string;
  isReady: boolean;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { matchId, playerId, isReady } = params;
    const matchRef = doc(db, 'matches', matchId);
    const snap = await getDoc(matchRef);
    if (!snap.exists()) return { success: false, error: 'Match not found.' };
    const match = snap.data() as Match;

    const isTeamA = (match.teamAPlayerIds || []).includes(playerId);
    const isTeamB = (match.teamBPlayerIds || []).includes(playerId);

    if (!isTeamA && !isTeamB) {
      return { success: false, error: 'You are not a registered player in this match.' };
    }

    const currentReady = match.playerReadyStatus || {};
    const updatedReady = {
      ...currentReady,
      [playerId]: isReady,
    };

    const teamAIds = match.teamAPlayerIds || [];
    const teamBIds = match.teamBPlayerIds || [];
    const all10 = [...teamAIds, ...teamBIds];
    const isBothFull = teamAIds.length === 5 && teamBIds.length === 5;
    const allReady = isBothFull && all10.length === 10 && all10.every((id) => updatedReady[id]);

    const updates: any = {
      playerReadyStatus: updatedReady,
      updatedAt: Date.now(),
    };

    if (allReady && match.status !== 'APPROVED' && match.status !== 'LIVE') {
      updates.status = 'WAITING_FOR_ADMIN';
    }

    await updateDoc(matchRef, sanitizeFirestoreData(updates));

    if (allReady && match.status !== 'APPROVED' && match.status !== 'LIVE') {
      notifyAdminsMatchNeedsApproval({
        ...match,
        ...updates,
      }).catch((e) => {
        console.warn('Failed to notify admins of 5v5 lobby ready for approval:', e);
      });
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to update ready status.' };
  }
}

/**
 * Start 5v5 Match (Lobby Owner Only)
 * Requires 5/5 on both sides, ALL 10 players READY, and ADMIN APPROVAL
 */
export async function start5v5Match(params: {
  matchId: string;
  callerId: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { matchId, callerId } = params;
    const effectiveCallerId = auth.currentUser?.uid || callerId;
    const isAdmin = await verifyAdminAuthority(effectiveCallerId);
    const matchRef = doc(db, 'matches', matchId);
    const now = Date.now();
    let startedMatch: Match | null = null;

    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(matchRef);
      if (!snap.exists()) throw new Error('Match not found.');
      const match = snap.data() as Match;

      const isOwner = Boolean(
        effectiveCallerId &&
        (
          effectiveCallerId === match.lobbyOwnerId ||
          effectiveCallerId === match.captainAId ||
          effectiveCallerId === match.playerAId ||
          effectiveCallerId === match.createdBy ||
          (match.teamAPlayerIds && match.teamAPlayerIds[0] === effectiveCallerId)
        )
      );

      if (!isOwner && !isAdmin) {
        throw new Error('Only the Lobby Owner (Team A Captain) can start the match.');
      }

      if (match.status === 'LIVE' || match.startedAt) {
        startedMatch = match;
        return; // Already live - do not overwrite startedAt
      }

      // Mandatory check: Must be approved by an Admin
      if (match.status !== 'APPROVED') {
        throw new Error(`Match lobby must be APPROVED by an Admin before it can start (current status: ${match.status || 'WAITING_FOR_ADMIN'}).`);
      }

      const teamAIds = match.teamAPlayerIds || [];
      const teamBIds = match.teamBPlayerIds || [];

      if (teamAIds.length !== 5) {
        throw new Error(`Team A has only ${teamAIds.length}/5 players.`);
      }
      if (teamBIds.length !== 5) {
        throw new Error(`Team B has only ${teamBIds.length}/5 players.`);
      }

      const all10 = [...teamAIds, ...teamBIds];
      const readyMap = match.playerReadyStatus || {};
      const unreadyPlayers = all10.filter((id) => !readyMap[id]);

      if (unreadyPlayers.length > 0) {
        throw new Error(`Cannot start match: Waiting for ${unreadyPlayers.length} player${unreadyPlayers.length > 1 ? 's' : ''} to become READY.`);
      }

      const payload = {
        status: 'LIVE' as const,
        startedAt: now,
        startedBy: callerId,
        updatedAt: now,
      };

      transaction.update(matchRef, sanitizeFirestoreData(payload));
      startedMatch = { ...match, ...payload };
    });

    // Close any active recruitments
    try {
      await updateDoc(doc(db, 'lobbyRecruitments', matchId), sanitizeFirestoreData({
        status: 'LOBBY_STARTED',
        updatedAt: now,
      }));
      await updateDoc(doc(db, 'lobbyRecruitments', `rec_match_${matchId}_teamB`), sanitizeFirestoreData({
        status: 'LOBBY_STARTED',
        updatedAt: now,
      }));
    } catch (e) {
      // Ignored
    }

    // Send 5v5 match started notification to all 10 players
    if (startedMatch && (startedMatch as Match).startedAt === now) {
      const m = startedMatch as Match;
      const startTimeFormatted = new Date(now).toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });

      const all10 = [...(m.teamAPlayerIds || []), ...(m.teamBPlayerIds || [])].filter((id): id is string => Boolean(id));

      if (all10.length > 0) {
        sendBulkNotification({
          userIds: all10,
          type: 'MATCH_STARTED',
          title: `🟢 MATCH STARTED: ${m.gameName}`,
          message: `${m.teamAName || 'Team A'} vs ${m.teamBName || 'Team B'} on Station ${m.station}. Started: ${startTimeFormatted}`,
          data: {
            matchId: m.id,
            gameName: m.gameName,
            station: m.station,
            startedAt: now,
          },
        }).catch((err) => console.warn('5v5 start notification error:', err));
      }
    }

    return { success: true };
  } catch (err: any) {
    console.error('start5v5Match error:', err);
    return { success: false, error: err.message || 'Failed to start match.' };
  }
}

/**
 * End an active 5v5 match and transition to AWAITING_RESULTS
 * Uses atomic check to prevent multiple endedAt overrides.
 */
export async function end5v5Match(params: {
  matchId: string;
  callerId: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { matchId, callerId } = params;
    const matchRef = doc(db, 'matches', matchId);
    const now = Date.now();
    let newlyEnded = false;
    let endedMatch: Match | null = null;

    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(matchRef);
      if (!snap.exists()) throw new Error('Match not found.');
      const match = snap.data() as Match;

      const isParticipant =
        (match.teamAPlayerIds || []).includes(callerId) ||
        (match.teamBPlayerIds || []).includes(callerId) ||
        callerId === match.lobbyOwnerId ||
        callerId === match.captainAId ||
        callerId === match.captainBId;

      if (!isParticipant) {
        throw new Error('Unauthorized to end match.');
      }

      // If already has endedAt, do NOT overwrite endedAt or duration
      if (match.endedAt) {
        if (match.status === 'LIVE') {
          transaction.update(matchRef, sanitizeFirestoreData({
            status: 'AWAITING_RESULTS',
            updatedAt: now,
          }));
        }
        endedMatch = match;
        return;
      }

      newlyEnded = true;
      const durationSecs = match.startedAt
        ? Math.max(0, Math.floor((now - match.startedAt) / 1000))
        : 0;

      const payload = {
        status: 'AWAITING_RESULTS' as const,
        endedAt: now,
        endedBy: callerId,
        finishedAt: now,
        durationSeconds: durationSecs,
        durationFormatted: formatMatchDuration(durationSecs),
        updatedAt: now,
      };

      transaction.update(matchRef, sanitizeFirestoreData(payload));
      endedMatch = { ...match, ...payload };
    });

    if (newlyEnded && endedMatch) {
      const m = endedMatch as Match;
      const formatted = m.durationFormatted || formatMatchDuration(m.durationSeconds);
      const all10 = [...(m.teamAPlayerIds || []), ...(m.teamBPlayerIds || [])].filter((id): id is string => Boolean(id));

      if (all10.length > 0) {
        sendBulkNotification({
          userIds: all10,
          type: 'MATCH_ENDED',
          title: `🏁 MATCH ENDED: ${m.gameName}`,
          message: `${m.teamAName || 'Team A'} vs ${m.teamBName || 'Team B'} on Station ${m.station}. Duration: ${formatted}`,
          data: {
            matchId: m.id,
            gameName: m.gameName,
            station: m.station,
            durationSeconds: m.durationSeconds,
            endedAt: now,
          },
        }).catch((err) => console.warn('5v5 Match end notification error:', err));
      }
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to end match.' };
  }
}

/**
 * Submit vote in a 5v5 Match (Any of the 10 players)
 * When all 10 players vote:
 * - If unanimous/mutually agreeing -> PENDING_ADMIN_APPROVAL (Do NOT update MMR yet!)
 * - If conflicting -> DISPUTED -> PENDING_ADMIN_REVIEW
 */
export async function submit5v5Vote(params: {
  matchId: string;
  playerId: string;
  vote: 'teamA' | 'teamB' | 'draw';
}): Promise<{ success: boolean; status: string; error?: string }> {
  try {
    const { matchId, playerId, vote } = params;
    const matchRef = doc(db, 'matches', matchId);
    const matchSnap = await getDoc(matchRef);

    if (!matchSnap.exists()) {
      return { success: false, status: 'NOT_FOUND', error: 'Match does not exist.' };
    }

    const currentMatch = matchSnap.data() as Match;

    const isTeamA =
      (currentMatch.teamAPlayerIds || []).includes(playerId) ||
      playerId === currentMatch.playerAId ||
      playerId === currentMatch.captainAId ||
      (currentMatch.teamAPlayers || []).some((p) => p.id === playerId);
    const isTeamB =
      (currentMatch.teamBPlayerIds || []).includes(playerId) ||
      playerId === currentMatch.playerBId ||
      playerId === currentMatch.captainBId ||
      (currentMatch.teamBPlayers || []).some((p) => p.id === playerId);

    if (!isTeamA && !isTeamB) {
      return { success: false, status: 'UNAUTHORIZED', error: 'You are not a participant in this 5v5 match.' };
    }

    const now = Date.now();
    const existingVotes = currentMatch.votes || {};
    const existingVotedAt = currentMatch.votedAt || {};
    const existingDeclarations = currentMatch.declarations || {};

    // Lookup player profile for pristine declaration audit
    let gamerTag = isTeamA ? 'Team A Player' : 'Team B Player';
    let inGameName = gamerTag;

    try {
      const profiles = await fetchPlayerProfiles([playerId]);
      const p = profiles[playerId];
      if (p?.gamerTag) {
        gamerTag = p.gamerTag;
      } else {
        const teamPlayerObj = (isTeamA ? currentMatch.teamAPlayers : currentMatch.teamBPlayers)?.find((tp) => tp.id === playerId);
        if (teamPlayerObj?.gamerTag) {
          gamerTag = teamPlayerObj.gamerTag;
        } else if (playerId === currentMatch.playerAId && currentMatch.playerAGamerTag) {
          gamerTag = currentMatch.playerAGamerTag;
        } else if (playerId === currentMatch.playerBId && currentMatch.playerBGamerTag) {
          gamerTag = currentMatch.playerBGamerTag;
        }
      }
      const ignKey = currentMatch.gameId.toLowerCase().includes('cs') ? 'cs2' : 'valorant';
      inGameName = p?.inGameNames?.[ignKey] || p?.inGameName || gamerTag;
    } catch (e) {
      console.warn('Could not fetch player profile in submit5v5Vote:', e);
    }

    const updatedVotes = {
      ...existingVotes,
      [playerId]: vote,
    };

    const updatedVotedAt = {
      ...existingVotedAt,
      [playerId]: now,
    };

    const updatedDeclarations = {
      ...existingDeclarations,
      [playerId]: {
        playerUid: playerId,
        gamerTag,
        inGameName,
        teamSide: isTeamA ? ('teamA' as const) : ('teamB' as const),
        declaredResult: vote,
        submittedAt: now,
      },
    };

    // Keep status as AWAITING_RESULTS or AWAITING_CONFIRMATION while votes collect
    let newStatus = currentMatch.status;
    if (
      currentMatch.status === 'LIVE' ||
      currentMatch.status === 'AWAITING_RESULTS' ||
      currentMatch.status === 'APPROVED' ||
      currentMatch.status === 'PENDING'
    ) {
      newStatus = 'AWAITING_CONFIRMATION';
    }

    // Identify votes submitted by Team A and Team B
    const teamAPlayersList = [
      ...(currentMatch.teamAPlayerIds || []),
      currentMatch.playerAId,
      currentMatch.captainAId,
      ...((currentMatch.teamAPlayers || []).map((p) => p.id)),
    ].filter(Boolean) as string[];

    const teamBPlayersList = [
      ...(currentMatch.teamBPlayerIds || []),
      currentMatch.playerBId,
      currentMatch.captainBId,
      ...((currentMatch.teamBPlayers || []).map((p) => p.id)),
    ].filter(Boolean) as string[];

    const teamAVotes = Object.entries(updatedVotes)
      .filter(([id]) => teamAPlayersList.includes(id))
      .map(([_, v]) => v);

    const teamBVotes = Object.entries(updatedVotes)
      .filter(([id]) => teamBPlayersList.includes(id))
      .map(([_, v]) => v);

    // Conflict detection:
    // 1. If Team A votes for Team A and Team B votes for Team B -> DIRECT CONFLICT
    // 2. If any vote within Team A conflicts with another vote in Team A
    // 3. If any vote within Team B conflicts with another vote in Team B
    // 4. If any submitted vote from Team A conflicts with any submitted vote from Team B
    let hasConflict = false;

    if (teamAVotes.length > 0 && teamBVotes.length > 0) {
      for (const aVote of teamAVotes) {
        for (const bVote of teamBVotes) {
          if (aVote !== bVote) {
            hasConflict = true;
            break;
          }
        }
        if (hasConflict) break;
      }
    }

    // Check intra-team conflicts
    if (!hasConflict && teamAVotes.length > 1) {
      const firstA = teamAVotes[0];
      if (teamAVotes.some((v) => v !== firstA)) {
        hasConflict = true;
      }
    }

    if (!hasConflict && teamBVotes.length > 1) {
      const firstB = teamBVotes[0];
      if (teamBVotes.some((v) => v !== firstB)) {
        hasConflict = true;
      }
    }

    const allRegisteredPlayerIds = Array.from(
      new Set([...(currentMatch.teamAPlayerIds || []), ...(currentMatch.teamBPlayerIds || [])])
    );
    const totalVotesCount = allRegisteredPlayerIds.filter((id) => updatedVotes[id] !== undefined).length;

    if (hasConflict) {
      newStatus = 'DISPUTED';
    } else if (
      (totalVotesCount >= 10 && allRegisteredPlayerIds.length === 10) ||
      (allRegisteredPlayerIds.length > 0 && totalVotesCount === allRegisteredPlayerIds.length)
    ) {
      newStatus = 'PENDING_ADMIN_APPROVAL';
    }

    const updatePayload: Record<string, any> = {
      votes: updatedVotes,
      votedAt: updatedVotedAt,
      declarations: updatedDeclarations,
      status: newStatus,
      disputeReason: newStatus === 'DISPUTED' ? '5V5_VOTES_CONFLICT' : undefined,
      updatedAt: now,
    };

    if (isTeamA) {
      updatePayload.teamADeclaration = vote;
      if (playerId === currentMatch.playerAId || !currentMatch.playerADeclaration) {
        updatePayload.playerADeclaration = vote === 'teamA' ? 'WIN' : vote === 'teamB' ? 'LOSS' : 'DRAW';
        updatePayload.playerADeclaredAt = now;
      }
    }
    if (isTeamB) {
      updatePayload.teamBDeclaration = vote;
      if (playerId === currentMatch.playerBId || !currentMatch.playerBDeclaration) {
        updatePayload.playerBDeclaration = vote === 'teamB' ? 'WIN' : vote === 'teamA' ? 'LOSS' : 'DRAW';
        updatePayload.playerBDeclaredAt = now;
      }
    }

    await updateDoc(matchRef, sanitizeFirestoreData(updatePayload));

    return { success: true, status: newStatus };
  } catch (err: any) {
    console.error('submit5v5Vote error:', err);
    return { success: false, status: 'ERROR', error: err.message || 'Failed to submit vote.' };
  }
}

/**
 * Admin Final Result Review & Resolution (Authoritative)
 * - Admin decision is final and can override player votes
 * - Processes MMR and records stats exactly ONCE
 */
export async function adminResolve5v5Match(params: {
  matchId: string;
  adminId: string;
  adminName: string;
  outcome: 'teamA' | 'teamB' | 'draw' | 'CANCELLED';
  officialHours?: number;
  adminNote?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { matchId, adminId, adminName, outcome, officialHours, adminNote } = params;
    const isAuthorized = await verifyAdminAuthority(adminId);
    if (!isAuthorized) {
      return { success: false, error: 'PERMISSION DENIED: Only authorized Nexus administrators or staff can resolve 5v5 matches.' };
    }
    const matchRef = doc(db, 'matches', matchId);
    const snap = await getDoc(matchRef);
    if (!snap.exists()) return { success: false, error: 'Match does not exist.' };
    const match = snap.data() as Match;

    const now = Date.now();

    if (outcome === 'CANCELLED') {
      await updateDoc(matchRef, sanitizeFirestoreData({
        status: 'CANCELLED',
        cancelledBy: adminId,
        cancelledByName: adminName,
        cancelledAt: now,
        cancellationReason: adminNote || 'Cancelled by Nexus Staff',
        adminResolved: true,
        resolvedBy: adminId,
        resolvedByName: adminName,
        resolvedAt: now,
        adminNote: adminNote || 'Match cancelled by Admin override',
        finalResult: 'CANCELLED',
        officialResult: 'CANCELLED',
        adminOverride: true,
        updatedAt: now,
      }));
      return { success: true };
    }

    // Official Hours validation (Sections 8, 9, 10, 11)
    if (
      typeof officialHours !== 'number' ||
      isNaN(officialHours) ||
      !isFinite(officialHours) ||
      officialHours <= 0
    ) {
      return {
        success: false,
        error: 'VALIDATION ERROR: Official hours played must be a valid positive number greater than 0.',
      };
    }

    // WIN or DRAW: process rating outcome & authoritative NC rewards exactly once
    await process5v5MatchRatingOutcome(
      match,
      outcome,
      {
        adminId,
        adminName,
        adminNote: adminNote || 'Official Nexus Admin Ruling',
        adminResolutionReason: adminNote,
        resultType: 'ADMIN_DECISION',
        officialHours,
      }
    );

    return { success: true };
  } catch (err: any) {
    console.error('adminResolve5v5Match error:', err);
    return { success: false, error: err.message || 'Failed to resolve match as admin.' };
  }
}

/**
 * Process rating updates for 5v5 matches:
 * 1. Updates all 10 players' personal MMR (vs opponent team's average MMR)
 * 2. Updates Team Rating for Team A and Team B (Elo K=32)
 * 3. Updates all-time and seasonal stats, and writes ratingTransactions for all 10 players.
 */
export async function process5v5MatchRatingOutcome(
  match: Match,
  outcome: 'teamA' | 'teamB' | 'draw',
  adminResolution?: {
    adminId: string;
    adminName: string;
    adminNote?: string;
    adminResolutionReason?: string;
    resultType?: MatchResultType;
    officialHours?: number;
  }
): Promise<void> {
  const matchRef = doc(db, 'matches', match.id);
  const now = Date.now();

  let activeSeason: Season | null = null;
  try {
    activeSeason = await getActiveSeason();
  } catch (e) {
    console.warn('Could not get active season for 5v5 rating processing:', e);
  }

  const currentSeasonId = activeSeason?.id || 'season_1';
  const currentSeasonNumber = activeSeason?.number || 1;

  let winningPlayerUids: string[] = [];
  let opponentName = '';

  await runTransaction(db, async (transaction) => {
    const matchSnap = await transaction.get(matchRef);
    if (!matchSnap.exists()) return;
    const currentMatch = matchSnap.data() as Match;

    if (currentMatch.ratingProcessed === true) {
      return; // Already processed - ratings MUST update exactly once
    }

    const rawTeamA = currentMatch.teamAPlayerIds && currentMatch.teamAPlayerIds.length > 0
      ? currentMatch.teamAPlayerIds
      : (currentMatch.teamAPlayers || []).map((p: any) => p?.id);
    const teamAPlayerIds = Array.from(new Set(rawTeamA.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)));

    const rawTeamB = currentMatch.teamBPlayerIds && currentMatch.teamBPlayerIds.length > 0
      ? currentMatch.teamBPlayerIds
      : (currentMatch.teamBPlayers || []).map((p: any) => p?.id);
    const teamBPlayerIds = Array.from(new Set(rawTeamB.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)));

    if (outcome === 'teamA') {
      winningPlayerUids = teamAPlayerIds;
      opponentName = currentMatch.teamBName || 'Team B';
    } else if (outcome === 'teamB') {
      winningPlayerUids = teamBPlayerIds;
      opponentName = currentMatch.teamAName || 'Team A';
    } else if (outcome === 'draw') {
      // In a 5v5 draw, eligible players from both teams receive the split draw reward (7.5 NC each)
      winningPlayerUids = Array.from(new Set([...teamAPlayerIds, ...teamBPlayerIds]));
      opponentName = `${currentMatch.teamAName || 'Team A'} vs ${currentMatch.teamBName || 'Team B'}`;
    }

    const scoreA: 1 | 0 | 0.5 = outcome === 'teamA' ? 1 : outcome === 'teamB' ? 0 : 0.5;
    const scoreB: 1 | 0 | 0.5 = outcome === 'teamB' ? 1 : outcome === 'teamA' ? 0 : 0.5;

    // =========================================================================
    // PHASE 1: ALL READS FIRST (Strict Firestore Transaction Requirement)
    // All transaction.get() calls MUST be executed before ANY transaction writes
    // =========================================================================
    const teamARatingDocRefs = teamAPlayerIds.map((pId) => doc(db, 'playerGameRatings', `${pId}_${match.gameId}`));
    const teamAPlayerDocRefs = teamAPlayerIds.map((pId) => doc(db, 'players', pId));
    const teamASeasonRatingDocRefs = teamAPlayerIds.map((pId) => doc(db, 'seasonPlayerGameRatings', `${currentSeasonId}_${pId}_${match.gameId}`));

    const teamBRatingDocRefs = teamBPlayerIds.map((pId) => doc(db, 'playerGameRatings', `${pId}_${match.gameId}`));
    const teamBPlayerDocRefs = teamBPlayerIds.map((pId) => doc(db, 'players', pId));
    const teamBSeasonRatingDocRefs = teamBPlayerIds.map((pId) => doc(db, 'seasonPlayerGameRatings', `${currentSeasonId}_${pId}_${match.gameId}`));

    const teamARef = match.teamAId ? doc(db, 'teams', match.teamAId) : null;
    const teamBRef = match.teamBId ? doc(db, 'teams', match.teamBId) : null;

    // Read all PlayerGameRatings
    const teamAPlayerRatingSnaps = await Promise.all(teamARatingDocRefs.map((r) => transaction.get(r)));
    const teamBPlayerRatingSnaps = await Promise.all(teamBRatingDocRefs.map((r) => transaction.get(r)));

    // Read all Player profiles
    const teamAPlayerSnaps = await Promise.all(teamAPlayerDocRefs.map((r) => transaction.get(r)));
    const teamBPlayerSnaps = await Promise.all(teamBPlayerDocRefs.map((r) => transaction.get(r)));

    // Read all SeasonPlayerGameRatings
    const teamASeasonRatingSnaps = await Promise.all(teamASeasonRatingDocRefs.map((r) => transaction.get(r)));
    const teamBSeasonRatingSnaps = await Promise.all(teamBSeasonRatingDocRefs.map((r) => transaction.get(r)));

    // Read Team documents
    const teamASnap = teamARef ? await transaction.get(teamARef) : null;
    const teamBSnap = teamBRef ? await transaction.get(teamBRef) : null;

    // =========================================================================
    // PHASE 2: IN-MEMORY COMPUTATIONS (No reads, no writes yet)
    // =========================================================================
    const teamAAvgMMR = Math.round(
      teamAPlayerRatingSnaps.reduce(
        (acc, snap) => acc + (snap.exists() ? snap.data().rating || INITIAL_RATING : INITIAL_RATING),
        0
      ) / Math.max(1, teamAPlayerRatingSnaps.length)
    );

    const teamBAvgMMR = Math.round(
      teamBPlayerRatingSnaps.reduce(
        (acc, snap) => acc + (snap.exists() ? snap.data().rating || INITIAL_RATING : INITIAL_RATING),
        0
      ) / Math.max(1, teamBPlayerRatingSnaps.length)
    );

    const playerRatingChangesMap: Record<string, { ratingBefore: number; ratingAfter: number; change: number }> = {};

    // Prepare Team A writes
    const teamAWrites: Array<{
      rRef: any;
      rData: any;
      sRef: any;
      sData: any;
      pRef: any;
      pDataToUpdate?: any;
      tx: RatingTransaction;
    }> = [];

    for (let i = 0; i < teamAPlayerIds.length; i++) {
      const pId = teamAPlayerIds[i];
      const rSnap = teamAPlayerRatingSnaps[i];
      const rRef = teamARatingDocRefs[i];
      const pSnap = teamAPlayerSnaps[i];
      const pDocRef = teamAPlayerDocRefs[i];
      const sRatingSnap = teamASeasonRatingSnaps[i];
      const sRatingRef = teamASeasonRatingDocRefs[i];

      const pData = pSnap.exists() ? (pSnap.data() as Player) : null;
      const gamerTag = pData?.gamerTag || 'Player';

      const prevRatingData: PlayerGameRating = rSnap.exists()
        ? (rSnap.data() as PlayerGameRating)
        : {
            id: `${pId}_${match.gameId}`,
            playerId: pId,
            gameId: match.gameId,
            gameName: match.gameName,
            gameCategory: match.gameCategory || 'PC',
            gamerTag,
            rating: INITIAL_RATING,
            eloRating: INITIAL_RATING,
            isProvisional: true,
            placementGames: 0,
            placementGamesRequired: PLACEMENT_GAMES_REQUIRED,
            gamesPlayed: 0,
            wins: 0,
            losses: 0,
            draws: 0,
            updatedAt: now,
          };

      const pCalc = calculateSinglePlayerRating(
        {
          rating: prevRatingData.rating || INITIAL_RATING,
          eloRating: prevRatingData.eloRating,
          performanceRating: prevRatingData.performanceRating,
          isProvisional: prevRatingData.isProvisional !== false && (prevRatingData.gamesPlayed || 0) < PLACEMENT_GAMES_REQUIRED,
          placementGames: prevRatingData.gamesPlayed || 0,
          sumOpponentRatings: prevRatingData.sumOpponentRatings,
          averageOpponentRating: prevRatingData.averageOpponentRating,
          winStreak: prevRatingData.currentWinStreak || 0,
          gamesPlayed: prevRatingData.gamesPlayed || 0,
          wins: prevRatingData.wins || 0,
          losses: prevRatingData.losses || 0,
          draws: prevRatingData.draws || 0,
        },
        teamBAvgMMR,
        scoreA
      );

      playerRatingChangesMap[pId] = {
        ratingBefore: prevRatingData.rating || INITIAL_RATING,
        ratingAfter: pCalc.newRating,
        change: pCalc.ratingChange,
      };

      const newRatingData = {
        ...prevRatingData,
        rating: pCalc.newRating,
        eloRating: pCalc.newEloRating,
        performanceRating: pCalc.newPerformanceRating,
        isProvisional: pCalc.newIsProvisional,
        placementGames: pCalc.newPlacementGames,
        placementGamesRequired: PLACEMENT_GAMES_REQUIRED,
        sumOpponentRatings: pCalc.newSumOpponentRatings,
        averageOpponentRating: pCalc.newAverageOpponentRating,
        winStreak: scoreA === 1 ? (prevRatingData.currentWinStreak || 0) + 1 : 0,
        currentWinStreak: scoreA === 1 ? (prevRatingData.currentWinStreak || 0) + 1 : 0,
        bestWinStreak: Math.max(prevRatingData.bestWinStreak || 0, scoreA === 1 ? (prevRatingData.currentWinStreak || 0) + 1 : 0),
        gamesPlayed: (prevRatingData.gamesPlayed || 0) + 1,
        wins: (prevRatingData.wins || 0) + (scoreA === 1 ? 1 : 0),
        losses: (prevRatingData.losses || 0) + (scoreA === 0 ? 1 : 0),
        draws: (prevRatingData.draws || 0) + (scoreA === 0.5 ? 1 : 0),
        lastPlayedAt: now,
        updatedAt: now,
      };

      const sData: SeasonPlayerGameRating = sRatingSnap.exists()
        ? (sRatingSnap.data() as SeasonPlayerGameRating)
        : {
            id: `${currentSeasonId}_${pId}_${match.gameId}`,
            seasonId: currentSeasonId,
            seasonNumber: currentSeasonNumber,
            playerId: pId,
            gamerTag,
            gameId: match.gameId,
            gameName: match.gameName,
            gameCategory: match.gameCategory || 'PC',
            startingRating: prevRatingData.rating || INITIAL_RATING,
            rating: prevRatingData.rating || INITIAL_RATING,
            isProvisional: true,
            placementGames: 0,
            placementGamesRequired: PLACEMENT_GAMES_REQUIRED,
            gamesPlayed: 0,
            wins: 0,
            losses: 0,
            draws: 0,
            updatedAt: now,
          };

      const newSeasonData = {
        ...sData,
        rating: pCalc.newRating,
        eloRating: pCalc.newEloRating,
        performanceRating: pCalc.newPerformanceRating,
        isProvisional: pCalc.newIsProvisional,
        placementGames: pCalc.newPlacementGames,
        placementGamesRequired: PLACEMENT_GAMES_REQUIRED,
        winStreak: scoreA === 1 ? (sData.currentWinStreak || 0) + 1 : 0,
        currentWinStreak: scoreA === 1 ? (sData.currentWinStreak || 0) + 1 : 0,
        bestWinStreak: Math.max(sData.bestWinStreak || 0, scoreA === 1 ? (sData.currentWinStreak || 0) + 1 : 0),
        gamesPlayed: (sData.gamesPlayed || 0) + 1,
        wins: (sData.wins || 0) + (scoreA === 1 ? 1 : 0),
        losses: (sData.losses || 0) + (scoreA === 0 ? 1 : 0),
        draws: (sData.draws || 0) + (scoreA === 0.5 ? 1 : 0),
        lastPlayedAt: now,
        updatedAt: now,
      };

      const pDataToUpdate = pData
        ? {
            ...pData,
            totalGames: (pData.totalGames || 0) + 1,
            totalWins: (pData.totalWins || 0) + (scoreA === 1 ? 1 : 0),
            totalLosses: (pData.totalLosses || 0) + (scoreA === 0 ? 1 : 0),
            totalDraws: (pData.totalDraws || 0) + (scoreA === 0.5 ? 1 : 0),
            overallRating: Math.max(100, Math.round((pData.overallRating || INITIAL_RATING) + pCalc.ratingChange)),
            currentWinStreak: scoreA === 1 ? (pData.currentWinStreak || 0) + 1 : 0,
            bestWinStreak: Math.max(pData.bestWinStreak || 0, scoreA === 1 ? (pData.currentWinStreak || 0) + 1 : 0),
          }
        : undefined;

      const txId = `tx_${now}_${pId}`;
      const tx: RatingTransaction = {
        id: txId,
        matchId: match.id,
        gameId: match.gameId,
        gameName: match.gameName,
        playerId: pId,
        gamerTag,
        opponentId: match.teamBId || 'teamB',
        opponentGamerTag: match.teamBName || 'Team B',
        opponentMMR: teamBAvgMMR,
        ratingBefore: prevRatingData.rating || INITIAL_RATING,
        oldMMR: prevRatingData.rating || INITIAL_RATING,
        ratingAfter: pCalc.newRating,
        newMMR: pCalc.newRating,
        change: pCalc.ratingChange,
        ratingChange: pCalc.ratingChange,
        result: scoreA === 1 ? 'WIN' : scoreA === 0 ? 'LOSS' : 'DRAW',
        isProvisional: pCalc.newIsProvisional,
        seasonId: currentSeasonId,
        seasonNumber: currentSeasonNumber,
        seasonRatingBefore: sData.rating,
        seasonRatingAfter: pCalc.newRating,
        seasonChange: pCalc.ratingChange,
        createdAt: now,
      };

      teamAWrites.push({
        rRef,
        rData: newRatingData,
        sRef: sRatingRef,
        sData: newSeasonData,
        pRef: pDocRef,
        pDataToUpdate,
        tx,
      });
    }

    // Prepare Team B writes
    const teamBWrites: Array<{
      rRef: any;
      rData: any;
      sRef: any;
      sData: any;
      pRef: any;
      pDataToUpdate?: any;
      tx: RatingTransaction;
    }> = [];

    for (let i = 0; i < teamBPlayerIds.length; i++) {
      const pId = teamBPlayerIds[i];
      const rSnap = teamBPlayerRatingSnaps[i];
      const rRef = teamBRatingDocRefs[i];
      const pSnap = teamBPlayerSnaps[i];
      const pDocRef = teamBPlayerDocRefs[i];
      const sRatingSnap = teamBSeasonRatingSnaps[i];
      const sRatingRef = teamBSeasonRatingDocRefs[i];

      const pData = pSnap.exists() ? (pSnap.data() as Player) : null;
      const gamerTag = pData?.gamerTag || 'Player';

      const prevRatingData: PlayerGameRating = rSnap.exists()
        ? (rSnap.data() as PlayerGameRating)
        : {
            id: `${pId}_${match.gameId}`,
            playerId: pId,
            gameId: match.gameId,
            gameName: match.gameName,
            gameCategory: match.gameCategory || 'PC',
            gamerTag,
            rating: INITIAL_RATING,
            eloRating: INITIAL_RATING,
            isProvisional: true,
            placementGames: 0,
            placementGamesRequired: PLACEMENT_GAMES_REQUIRED,
            gamesPlayed: 0,
            wins: 0,
            losses: 0,
            draws: 0,
            updatedAt: now,
          };

      const pCalc = calculateSinglePlayerRating(
        {
          rating: prevRatingData.rating || INITIAL_RATING,
          eloRating: prevRatingData.eloRating,
          performanceRating: prevRatingData.performanceRating,
          isProvisional: prevRatingData.isProvisional !== false && (prevRatingData.gamesPlayed || 0) < PLACEMENT_GAMES_REQUIRED,
          placementGames: prevRatingData.gamesPlayed || 0,
          sumOpponentRatings: prevRatingData.sumOpponentRatings,
          averageOpponentRating: prevRatingData.averageOpponentRating,
          winStreak: prevRatingData.currentWinStreak || 0,
          gamesPlayed: prevRatingData.gamesPlayed || 0,
          wins: prevRatingData.wins || 0,
          losses: prevRatingData.losses || 0,
          draws: prevRatingData.draws || 0,
        },
        teamAAvgMMR,
        scoreB
      );

      playerRatingChangesMap[pId] = {
        ratingBefore: prevRatingData.rating || INITIAL_RATING,
        ratingAfter: pCalc.newRating,
        change: pCalc.ratingChange,
      };

      const newRatingData = {
        ...prevRatingData,
        rating: pCalc.newRating,
        eloRating: pCalc.newEloRating,
        performanceRating: pCalc.newPerformanceRating,
        isProvisional: pCalc.newIsProvisional,
        placementGames: pCalc.newPlacementGames,
        placementGamesRequired: PLACEMENT_GAMES_REQUIRED,
        sumOpponentRatings: pCalc.newSumOpponentRatings,
        averageOpponentRating: pCalc.newAverageOpponentRating,
        winStreak: scoreB === 1 ? (prevRatingData.currentWinStreak || 0) + 1 : 0,
        currentWinStreak: scoreB === 1 ? (prevRatingData.currentWinStreak || 0) + 1 : 0,
        bestWinStreak: Math.max(prevRatingData.bestWinStreak || 0, scoreB === 1 ? (prevRatingData.currentWinStreak || 0) + 1 : 0),
        gamesPlayed: (prevRatingData.gamesPlayed || 0) + 1,
        wins: (prevRatingData.wins || 0) + (scoreB === 1 ? 1 : 0),
        losses: (prevRatingData.losses || 0) + (scoreB === 0 ? 1 : 0),
        draws: (prevRatingData.draws || 0) + (scoreB === 0.5 ? 1 : 0),
        lastPlayedAt: now,
        updatedAt: now,
      };

      const sData: SeasonPlayerGameRating = sRatingSnap.exists()
        ? (sRatingSnap.data() as SeasonPlayerGameRating)
        : {
            id: `${currentSeasonId}_${pId}_${match.gameId}`,
            seasonId: currentSeasonId,
            seasonNumber: currentSeasonNumber,
            playerId: pId,
            gamerTag,
            gameId: match.gameId,
            gameName: match.gameName,
            gameCategory: match.gameCategory || 'PC',
            startingRating: prevRatingData.rating || INITIAL_RATING,
            rating: prevRatingData.rating || INITIAL_RATING,
            isProvisional: true,
            placementGames: 0,
            placementGamesRequired: PLACEMENT_GAMES_REQUIRED,
            gamesPlayed: 0,
            wins: 0,
            losses: 0,
            draws: 0,
            updatedAt: now,
          };

      const newSeasonData = {
        ...sData,
        rating: pCalc.newRating,
        eloRating: pCalc.newEloRating,
        performanceRating: pCalc.newPerformanceRating,
        isProvisional: pCalc.newIsProvisional,
        placementGames: pCalc.newPlacementGames,
        placementGamesRequired: PLACEMENT_GAMES_REQUIRED,
        winStreak: scoreB === 1 ? (sData.currentWinStreak || 0) + 1 : 0,
        currentWinStreak: scoreB === 1 ? (sData.currentWinStreak || 0) + 1 : 0,
        bestWinStreak: Math.max(sData.bestWinStreak || 0, scoreB === 1 ? (sData.currentWinStreak || 0) + 1 : 0),
        gamesPlayed: (sData.gamesPlayed || 0) + 1,
        wins: (sData.wins || 0) + (scoreB === 1 ? 1 : 0),
        losses: (sData.losses || 0) + (scoreB === 0 ? 1 : 0),
        draws: (sData.draws || 0) + (scoreB === 0.5 ? 1 : 0),
        lastPlayedAt: now,
        updatedAt: now,
      };

      const pDataToUpdate = pData
        ? {
            ...pData,
            totalGames: (pData.totalGames || 0) + 1,
            totalWins: (pData.totalWins || 0) + (scoreB === 1 ? 1 : 0),
            totalLosses: (pData.totalLosses || 0) + (scoreB === 0 ? 1 : 0),
            totalDraws: (pData.totalDraws || 0) + (scoreB === 0.5 ? 1 : 0),
            overallRating: Math.max(100, Math.round((pData.overallRating || INITIAL_RATING) + pCalc.ratingChange)),
            currentWinStreak: scoreB === 1 ? (pData.currentWinStreak || 0) + 1 : 0,
            bestWinStreak: Math.max(pData.bestWinStreak || 0, scoreB === 1 ? (pData.currentWinStreak || 0) + 1 : 0),
          }
        : undefined;

      const txId = `tx_${now}_${pId}`;
      const tx: RatingTransaction = {
        id: txId,
        matchId: match.id,
        gameId: match.gameId,
        gameName: match.gameName,
        playerId: pId,
        gamerTag,
        opponentId: match.teamAId || 'teamA',
        opponentGamerTag: match.teamAName || 'Team A',
        opponentMMR: teamAAvgMMR,
        ratingBefore: prevRatingData.rating || INITIAL_RATING,
        oldMMR: prevRatingData.rating || INITIAL_RATING,
        ratingAfter: pCalc.newRating,
        newMMR: pCalc.newRating,
        change: pCalc.ratingChange,
        ratingChange: pCalc.ratingChange,
        result: scoreB === 1 ? 'WIN' : scoreB === 0 ? 'LOSS' : 'DRAW',
        isProvisional: pCalc.newIsProvisional,
        seasonId: currentSeasonId,
        seasonNumber: currentSeasonNumber,
        seasonRatingBefore: sData.rating,
        seasonRatingAfter: pCalc.newRating,
        seasonChange: pCalc.ratingChange,
        createdAt: now,
      };

      teamBWrites.push({
        rRef,
        rData: newRatingData,
        sRef: sRatingRef,
        sData: newSeasonData,
        pRef: pDocRef,
        pDataToUpdate,
        tx,
      });
    }

    // Team A and Team B Team Rating calculations (Elo K=32)
    let teamARatingChange = 0;
    let teamBRatingChange = 0;
    let teamARatingBefore = match.teamARatingBefore || teamAAvgMMR;
    let teamBRatingBefore = match.teamBRatingBefore || teamBAvgMMR;
    let teamARatingAfter = teamARatingBefore;
    let teamBRatingAfter = teamBRatingBefore;
    let teamAUpdateData: any = null;
    let teamBUpdateData: any = null;

    if (teamASnap && teamASnap.exists()) {
      const teamA = teamASnap.data() as Team;
      teamARatingBefore = teamA.teamRating || 1000;
      const expectedScoreA = calculateExpectedScore(teamARatingBefore, teamBRatingBefore);
      teamARatingChange = Math.round(K_ESTABLISHED * (scoreA - expectedScoreA));
      teamARatingAfter = Math.max(100, teamARatingBefore + teamARatingChange);

      const totalTeamAMatches = (teamA.matchesPlayed || 0) + 1;
      const totalTeamAWins = (teamA.wins || 0) + (scoreA === 1 ? 1 : 0);
      const totalTeamALosses = (teamA.losses || 0) + (scoreA === 0 ? 1 : 0);
      const totalTeamADraws = (teamA.draws || 0) + (scoreA === 0.5 ? 1 : 0);
      const teamAStreak = scoreA === 1 ? (teamA.currentWinStreak || 0) + 1 : 0;
      const teamABestStreak = Math.max(teamA.bestWinStreak || 0, teamAStreak);
      const teamAWinRate = totalTeamAMatches > 0 ? Math.round((totalTeamAWins / totalTeamAMatches) * 100) : 0;

      teamAUpdateData = {
        teamRating: teamARatingAfter,
        matchesPlayed: totalTeamAMatches,
        wins: totalTeamAWins,
        losses: totalTeamALosses,
        draws: totalTeamADraws,
        currentWinStreak: teamAStreak,
        bestWinStreak: teamABestStreak,
        winRate: teamAWinRate,
        updatedAt: now,
      };
    }

    if (teamBSnap && teamBSnap.exists()) {
      const teamB = teamBSnap.data() as Team;
      teamBRatingBefore = teamB.teamRating || 1000;
      const expectedScoreB = calculateExpectedScore(teamBRatingBefore, teamARatingBefore);
      teamBRatingChange = Math.round(K_ESTABLISHED * (scoreB - expectedScoreB));
      teamBRatingAfter = Math.max(100, teamBRatingBefore + teamBRatingChange);

      const totalTeamBMatches = (teamB.matchesPlayed || 0) + 1;
      const totalTeamBWins = (teamB.wins || 0) + (scoreB === 1 ? 1 : 0);
      const totalTeamBLosses = (teamB.losses || 0) + (scoreB === 0 ? 1 : 0);
      const totalTeamBDraws = (teamB.draws || 0) + (scoreB === 0.5 ? 1 : 0);
      const teamBStreak = scoreB === 1 ? (teamB.currentWinStreak || 0) + 1 : 0;
      const teamBBestStreak = Math.max(teamB.bestWinStreak || 0, teamBStreak);
      const teamBWinRate = totalTeamBMatches > 0 ? Math.round((totalTeamBWins / totalTeamBMatches) * 100) : 0;

      teamBUpdateData = {
        teamRating: teamBRatingAfter,
        matchesPlayed: totalTeamBMatches,
        wins: totalTeamBWins,
        losses: totalTeamBLosses,
        draws: totalTeamBDraws,
        currentWinStreak: teamBStreak,
        bestWinStreak: teamBBestStreak,
        winRate: teamBWinRate,
        updatedAt: now,
      };
    }

    const rawHours = adminResolution?.officialHours ?? match.officialHours;
    const officialHoursToUse = typeof rawHours === 'number' && isFinite(rawHours) && !isNaN(rawHours) && rawHours > 0
      ? rawHours
      : 1;

    const teamARewardPerPlayer = outcome === 'teamA'
      ? Math.round(90 * officialHoursToUse * 100) / 100
      : outcome === 'teamB'
      ? Math.round(30 * officialHoursToUse * 100) / 100
      : Math.round(45 * officialHoursToUse * 100) / 100;

    const teamBRewardPerPlayer = outcome === 'teamB'
      ? Math.round(90 * officialHoursToUse * 100) / 100
      : outcome === 'teamA'
      ? Math.round(30 * officialHoursToUse * 100) / 100
      : Math.round(45 * officialHoursToUse * 100) / 100;

    // Match document update payload
    const updatePayload: Record<string, any> = {
      status: 'CONFIRMED',
      finalResult: outcome,
      officialHours: officialHoursToUse,
      teamARewardPerPlayer,
      teamBRewardPerPlayer,
      rewardProcessed: true,
      ncRewardProcessed: true,
      confirmedBy: adminResolution?.adminId || match.confirmedBy,
      confirmedByName: adminResolution?.adminName || match.confirmedByName || 'Nexus Staff',
      winnerId: outcome === 'teamA' ? match.teamAId : outcome === 'teamB' ? match.teamBId : 'draw',
      officialWinner: outcome === 'teamA' ? match.teamAId : outcome === 'teamB' ? match.teamBId : 'draw',
      officialTeamWinner: outcome,
      officialResult: outcome === 'draw' ? 'DRAW' : outcome === 'teamA' ? 'TEAM_A_WIN' : 'TEAM_B_WIN',
      resultType: adminResolution?.resultType || (adminResolution ? 'ADMIN_DECISION' : 'MUTUAL_DECLARATION'),
      ratingProcessed: true,
      confirmedAt: now,
      finishedAt: now,
      endedAt: match.endedAt || now,
      durationSeconds: (match.durationSeconds !== undefined)
        ? match.durationSeconds
        : (match.startedAt)
        ? Math.max(0, Math.floor(((match.endedAt || now) - match.startedAt) / 1000))
        : 0,
      durationFormatted: match.durationFormatted || formatMatchDuration(
        (match.durationSeconds !== undefined)
          ? match.durationSeconds
          : (match.startedAt)
          ? Math.max(0, Math.floor(((match.endedAt || now) - match.startedAt) / 1000))
          : 0
      ),
      updatedAt: now,
      teamARatingBefore,
      teamARatingAfter,
      teamARatingChange,
      teamBRatingBefore,
      teamBRatingAfter,
      teamBRatingChange,
      playerRatingChanges: playerRatingChangesMap,
    };

    if (adminResolution) {
      updatePayload.adminResolved = true;
      updatePayload.resolvedBy = adminResolution.adminId || null;
      updatePayload.resolvedByName = adminResolution.adminName || 'Nexus Admin';
      updatePayload.resolvedAt = now;
      updatePayload.adminResolutionReason = adminResolution.adminResolutionReason || adminResolution.adminNote || 'Admin decision';
      updatePayload.adminId = adminResolution.adminId || null;
      updatePayload.adminName = adminResolution.adminName || 'Nexus Admin';
      updatePayload.adminNote = adminResolution.adminNote || 'Resolved by Nexus Admin';
      updatePayload.adminDecidedAt = now;
    }

    // =========================================================================
    // PHASE 3: ALL WRITES AFTER ALL READS (Strict Firestore Transaction Requirement)
    // =========================================================================

    // 1. Team A Player writes
    for (const w of teamAWrites) {
      transaction.set(w.rRef, sanitizeFirestoreData(w.rData));
      transaction.set(w.sRef, sanitizeFirestoreData(w.sData));
      if (w.pDataToUpdate) {
        transaction.set(w.pRef, sanitizeFirestoreData(w.pDataToUpdate), { merge: true });
      }
      transaction.set(doc(db, 'ratingTransactions', w.tx.id), sanitizeFirestoreData(w.tx));
      transaction.set(doc(db, 'rating_history', w.tx.id), sanitizeFirestoreData(w.tx));
    }

    // 2. Team B Player writes
    for (const w of teamBWrites) {
      transaction.set(w.rRef, sanitizeFirestoreData(w.rData));
      transaction.set(w.sRef, sanitizeFirestoreData(w.sData));
      if (w.pDataToUpdate) {
        transaction.set(w.pRef, sanitizeFirestoreData(w.pDataToUpdate), { merge: true });
      }
      transaction.set(doc(db, 'ratingTransactions', w.tx.id), sanitizeFirestoreData(w.tx));
      transaction.set(doc(db, 'rating_history', w.tx.id), sanitizeFirestoreData(w.tx));
    }

    // 3. Team document writes (only updates stats, never touches roster/members)
    if (teamARef && teamAUpdateData) {
      transaction.update(teamARef, sanitizeFirestoreData(teamAUpdateData));
    }
    if (teamBRef && teamBUpdateData) {
      transaction.update(teamBRef, sanitizeFirestoreData(teamBUpdateData));
    }

    // 4. Update Match Document
    transaction.update(matchRef, sanitizeFirestoreData(updatePayload));
  });

  // Authoritative 5v5 Squad Match Reward Processor (Strictly Idempotent)
  // Award Nexus Coins to every eligible player according to official hours (Sections 2, 3, 4, 12, 13, 14, 15, 19)
  try {
    const rawTeamA = match.teamAPlayerIds && match.teamAPlayerIds.length > 0
      ? match.teamAPlayerIds
      : (match.teamAPlayers || []).map((p: any) => p?.id);
    const teamAPlayerIds = Array.from(new Set(rawTeamA.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)));

    const rawTeamB = match.teamBPlayerIds && match.teamBPlayerIds.length > 0
      ? match.teamBPlayerIds
      : (match.teamBPlayers || []).map((p: any) => p?.id);
    const teamBPlayerIds = Array.from(new Set(rawTeamB.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)));

    const rawHours = adminResolution?.officialHours ?? match.officialHours;
    const finalHours = typeof rawHours === 'number' && isFinite(rawHours) && !isNaN(rawHours) && rawHours > 0
      ? rawHours
      : 1;

    await award5v5SquadHoursCoins({
      matchId: match.id,
      gameId: match.gameId,
      gameName: match.gameName || '5v5 Match',
      outcome,
      officialHours: finalHours,
      teamAPlayerIds,
      teamBPlayerIds,
      teamAName: match.teamAName || 'Team A',
      teamBName: match.teamBName || 'Team B',
      adminId: adminResolution?.adminId || 'ADMIN',
      adminName: adminResolution?.adminName || 'Nexus Admin',
    });
  } catch (coinErr) {
    console.error('Failed to award 5v5 squad hours coins:', coinErr);
  }
}

export interface Open5v5LobbyState {
  teamACount: number;
  teamBCount: number;
  teamANeeded: number;
  teamBNeeded: number;
  totalNeeded: number;
  isOpen: boolean;
  isFull: boolean;
  state: 'LOOKING_FOR_OPPONENT' | 'OPPONENT_FORMING' | 'INCOMPLETE_LOBBY' | 'FULL';
  stateLabel: string;
}

/**
 * Calculates the exact state of both sides (Team A and Team B) from the real lobby roster.
 * A 5v5 lobby is OPEN if:
 * teamAPlayers < 5 OR teamBPlayers < 5
 * Only if teamAPlayers == 5 AND teamBPlayers == 5 is the lobby FULL.
 */
export function calculate5v5LobbyState(match: Match): Open5v5LobbyState {
  // Team A active players
  const teamAPlayerIds = (match.teamAPlayerIds || match.teamAPlayers?.map((p) => p.id) || []).filter(
    (id): id is string => typeof id === 'string' && id.trim().length > 0
  );
  // Team B active players
  const teamBPlayerIds = (match.teamBPlayerIds || match.teamBPlayers?.map((p) => p.id) || []).filter(
    (id): id is string => typeof id === 'string' && id.trim().length > 0
  );

  const teamACount = Math.min(5, teamAPlayerIds.length);
  const teamBCount = Math.min(5, teamBPlayerIds.length);

  const teamANeeded = Math.max(0, 5 - teamACount);
  const teamBNeeded = Math.max(0, 5 - teamBCount);
  const totalNeeded = teamANeeded + teamBNeeded;

  const isFull = teamACount >= 5 && teamBCount >= 5;
  const isOpen = !isFull && (teamACount < 5 || teamBCount < 5);

  let state: Open5v5LobbyState['state'] = 'LOOKING_FOR_OPPONENT';
  let stateLabel = 'LOOKING FOR OPPONENT';

  if (isFull) {
    state = 'FULL';
    if (match.status === 'LIVE') {
      stateLabel = 'MATCH LIVE IN ARENA';
    } else if (match.status === 'READY_CHECK') {
      stateLabel = 'READY CHECK (10/10)';
    } else if (match.status === 'AWAITING_RESULTS') {
      stateLabel = 'AWAITING RESULTS';
    } else if (match.status === 'DISPUTED') {
      stateLabel = 'MATCH DISPUTED';
    } else {
      stateLabel = 'LOBBY FULL (5/5 vs 5/5)';
    }
  } else if (teamACount === 5 && teamBCount === 0) {
    // CASE A: Team A 5/5, Team B 0/5
    state = 'LOOKING_FOR_OPPONENT';
    stateLabel = 'LOOKING FOR OPPONENT';
  } else if (teamACount === 5 && teamBCount > 0 && teamBCount < 5) {
    // CASE B & C: Team A 5/5, Team B 1-4/5
    state = 'OPPONENT_FORMING';
    stateLabel = 'OPPONENT TEAM FORMING';
  } else if (teamACount < 5) {
    // CASE E: Team A < 5
    state = 'INCOMPLETE_LOBBY';
    stateLabel = teamBCount === 0 ? 'TEAM A RECRUITING & OPPONENT NEEDED' : 'ROSTERS FORMING';
  }

  return {
    teamACount,
    teamBCount,
    teamANeeded,
    teamBNeeded,
    totalNeeded,
    isOpen,
    isFull,
    state,
    stateLabel,
  };
}

/**
 * Determines if a match document is a 5v5 Team Lobby.
 * Checks matchType, lobbyCode, or CS2/Valorant team lobby structures.
 */
export function is5v5TeamLobby(match: Match): boolean {
  if (!match) return false;
  const matchType = (match.matchType || '').toLowerCase();
  if (matchType === '5v5') return true;
  if (match.lobbyCode && match.lobbyCode.trim().length > 0) return true;

  const game = (match.gameId || match.gameName || '').toLowerCase();
  if (game.includes('cs2') || game.includes('valorant') || game.includes('val')) {
    if (match.teamAId || match.teamAName || match.captainAId || match.lobbyCode) {
      return true;
    }
  }
  return false;
}

/**
 * Determines if a 5v5 team lobby is ACTIVE and should appear in the 5v5 Team Lobbies list.
 * A lobby is active if:
 * 1. It is a valid 5v5 team lobby
 * 2. It has NOT been cancelled, closed, completed, finished, confirmed, or rejected.
 * 
 * IMPORTANT: A lobby does NOT need to have an open slot to appear in the Team Lobbies list.
 * 5/5 vs 0/5 -> SHOW
 * 5/5 vs 3/5 -> SHOW
 * 5/5 vs 5/5 -> SHOW (full lobbies MUST be visible)
 * 
 * Valid active lobbies progress through:
 * WAITING_FOR_OPPONENT, OPPONENT_JOINED, TEAM_ROSTERS_FILLING, READY_CHECK,
 * LIVE, AWAITING_RESULTS, PENDING_ADMIN_APPROVAL, DISPUTED, PENDING_ADMIN_REVIEW
 */
export function isActive5v5Lobby(match: Match): boolean {
  if (!is5v5TeamLobby(match)) return false;

  const rawStatus = (match.status || '').toUpperCase();
  const inactiveStatuses = [
    'CANCELLED',
    'CLOSED',
    'COMPLETED',
    'FINISHED',
    'CONFIRMED',
    'REJECTED',
  ];
  if (inactiveStatuses.includes(rawStatus)) return false;
  if (match.cancellationReason && (rawStatus === 'CANCELLED' || rawStatus === 'REJECTED')) return false;

  return true;
}

/**
 * Checks if a 5v5 match is an open lobby with available player slots for recruitment.
 * (Used for recruitment announcements/feed where only incomplete squads should show).
 */
export function isOpen5v5Lobby(match: Match): boolean {
  if (!isActive5v5Lobby(match)) return false;
  const lobbyState = calculate5v5LobbyState(match);
  return lobbyState.isOpen;
}

/**
 * Subscribe to active 5v5 team lobbies in real-time.
 * Strictly displays ALL active 5v5 team lobbies, including FULL lobbies (10/10).
 * Does NOT filter out lobbies by player count or recruitment status.
 * Automatically updates in real-time as players join or status transitions.
 */
export function subscribeToOpen5v5Lobbies(
  gameId: string | undefined,
  callback: (matches: Match[]) => void
) {
  const matchesRef = collection(db, 'matches');

  return onSnapshot(
    matchesRef,
    (snap) => {
      let list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Match));
      // Show all active 5v5 team lobbies (including full 10/10 lobbies!)
      list = list.filter((m) => isActive5v5Lobby(m));

      if (gameId && gameId !== 'ALL') {
        const targetGame = gameId.toLowerCase();
        list = list.filter((m) => {
          const mGame = (m.gameId || m.gameName || '').toLowerCase();
          return mGame.includes(targetGame) || targetGame.includes(mGame);
        });
      }

      // Sort newest first
      list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

      callback(list);
    },
    (err) => {
      console.error('5v5 Team Lobbies listener error:', err);
      callback([]);
    }
  );
}

export const subscribeToActive5v5TeamLobbies = subscribeToOpen5v5Lobbies;

/**
 * Subscribe to all 5v5 lobbies / matches (for 5v5 hub and admin view)
 */
export function subscribeToAll5v5Matches(callback: (matches: Match[]) => void) {
  const matchesRef = collection(db, 'matches');

  return onSnapshot(
    matchesRef,
    (snap) => {
      let list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Match));
      list = list.filter((m) => is5v5TeamLobby(m));
      list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      callback(list.slice(0, 50));
    },
    (err) => {
      console.error('All 5v5 matches listener error:', err);
      callback([]);
    }
  );
}

/**
 * Cancel/Remove a match or lobby with comprehensive cleanup:
 * - Marks match as CANCELLED using existing status architecture
 * - Stops recruitment and removes it from announcements
 * - Cancels open recruitments in lobbyRecruitments
 * - Cancels pending team invitations in teamInvitations
 * - Cancels pending join requests
 * - Releases active lobby membership (active5v5LobbyId) for all participants
 * - Writes audit log
 */
export async function cancelMatch(params: {
  matchId: string;
  actorId: string;
  actorName: string;
  reason: string;
  isAdmin?: boolean;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { matchId, actorId, actorName, reason, isAdmin = false } = params;
    const matchRef = doc(db, 'matches', matchId);
    const matchSnap = await getDoc(matchRef);

    if (!matchSnap.exists()) {
      return { success: false, error: 'Match not found.' };
    }

    const match = matchSnap.data() as Match;
    const authenticatedUser = await getAuthenticatedUser();
    const authUid = authenticatedUser?.uid || auth.currentUser?.uid;
    if (!authUid) {
      return { success: false, error: 'Unauthorized: Authentication required.' };
    }
    const is5v5Lobby = (match.matchType || '').toLowerCase() === '5v5' || !!match.lobbyCode || !!match.teamAId;

    // Verify Admin / Staff authority
    const isStaffOrAdmin = isAdmin || (await verifyAdminAuthority(authUid));

    // Canonical Lobby Owner check:
    // For 5v5 lobbies, the lobby owner is strictly lobbyOwnerId or createdBy.
    // Team A captains (unless also lobby owner), Team B captains, Team B players, and regular squad members MUST NEVER close/cancel the lobby.
    const canonicalOwnerId = match.lobbyOwnerId || match.createdBy || (is5v5Lobby ? undefined : match.playerAId);
    const isLobbyOwner = Boolean(authUid && canonicalOwnerId && authUid === canonicalOwnerId);

    if (is5v5Lobby) {
      if (!isLobbyOwner && !isStaffOrAdmin) {
        if (
          authUid === match.captainBId ||
          authUid === match.playerBId ||
          (match.teamBPlayerIds && match.teamBPlayerIds.includes(authUid))
        ) {
          return {
            success: false,
            error: 'PERMISSION DENIED: Team B Captain cannot close the lobby. Only the original Lobby Owner or an Admin can close or cancel the 5v5 lobby.',
          };
        }
        if (
          authUid === match.captainAId ||
          authUid === match.playerAId ||
          (match.teamAPlayerIds && match.teamAPlayerIds[0] === authUid)
        ) {
          return {
            success: false,
            error: 'PERMISSION DENIED: Team A Captain cannot close the lobby unless they are also the Lobby Owner.',
          };
        }
        return {
          success: false,
          error: 'PERMISSION DENIED: Only the Lobby Owner or an Admin can close this 5v5 lobby.',
        };
      }
    } else {
      const is1v1Creator = match.playerAId === authUid || match.createdBy === authUid;
      if (!is1v1Creator && !isStaffOrAdmin) {
        return {
          success: false,
          error: 'PERMISSION DENIED: Only the match creator or an Admin can cancel this match.',
        };
      }
    }

    const now = Date.now();
    const finalReason = reason.trim() || 'Lobby removed by captain';

    // 1. Mark match document as CANCELLED
    await updateDoc(
      matchRef,
      sanitizeFirestoreData({
        status: 'CANCELLED',
        cancelledBy: authUid,
        cancelledByName: actorName,
        cancellationReason: finalReason,
        cancelledAt: now,
        updatedAt: now,
        isRecruiting: false,
        recruitmentStatus: 'CLOSED',
        playersNeeded: 0,
        openSlotCount: 0,
      })
    );

    // 2. Release active5v5LobbyId for ALL members/participants of this lobby
    try {
      const uidsToRelease = new Set<string>();
      if (match.captainAId) uidsToRelease.add(match.captainAId);
      if (match.captainBId) uidsToRelease.add(match.captainBId);
      if (match.createdBy) uidsToRelease.add(match.createdBy);
      if (match.lobbyOwnerId) uidsToRelease.add(match.lobbyOwnerId);
      if (match.playerAId) uidsToRelease.add(match.playerAId);
      if (match.playerBId) uidsToRelease.add(match.playerBId);
      (match.teamAPlayerIds || []).forEach((id) => uidsToRelease.add(id));
      (match.teamBPlayerIds || []).forEach((id) => uidsToRelease.add(id));
      if (authUid) uidsToRelease.add(authUid);

      for (const uid of uidsToRelease) {
        try {
          const playerDoc = await getDoc(doc(db, 'players', uid));
          if (playerDoc.exists()) {
            const currentActivePtr = playerDoc.data()?.active5v5LobbyId;
            if (currentActivePtr === matchId) {
              // Check if player has another legitimate active lobby
              const otherLobby = await getPlayerActive5v5Lobby(uid, matchId);
              await updateDoc(doc(db, 'players', uid), {
                active5v5LobbyId: otherLobby ? otherLobby.id : null,
              });
            }
          }
        } catch (_) {}
      }
    } catch (e) {
      console.warn('Error releasing player active lobby pointers:', e);
    }

    // 3. Close and cancel all recruitment announcements associated with this lobby
    try {
      await updateDoc(
        doc(db, 'lobbyRecruitments', matchId),
        sanitizeFirestoreData({
          status: 'CANCELLED',
          isRecruiting: false,
          recruitmentStatus: 'CLOSED',
          updatedAt: now,
        })
      );
    } catch (_) {}
    try {
      await updateDoc(
        doc(db, 'lobbyRecruitments', `rec_match_${matchId}_teamB`),
        sanitizeFirestoreData({
          status: 'CANCELLED',
          isRecruiting: false,
          recruitmentStatus: 'CLOSED',
          updatedAt: now,
        })
      );
    } catch (_) {}

    // Cancel any additional recruitment docs referencing this matchId
    try {
      const qRecs = query(collection(db, 'lobbyRecruitments'), where('matchId', '==', matchId));
      const snapRecs = await getDocs(qRecs);
      for (const rDoc of snapRecs.docs) {
        if (rDoc.data().status !== 'CANCELLED') {
          await updateDoc(doc(db, 'lobbyRecruitments', rDoc.id), {
            status: 'CANCELLED',
            isRecruiting: false,
            recruitmentStatus: 'CLOSED',
            updatedAt: now,
          });
        }
      }
    } catch (_) {}

    // 4. Cancel pending invitations associated with this match/lobby
    try {
      const invDocsToCancel = new Map<string, any>();
      const qInvsLobby = query(collection(db, 'teamInvitations'), where('lobbyId', '==', matchId));
      const snapInvsLobby = await getDocs(qInvsLobby);
      snapInvsLobby.docs.forEach((d) => invDocsToCancel.set(d.id, d));

      const qInvsMatch = query(collection(db, 'teamInvitations'), where('matchId', '==', matchId));
      const snapInvsMatch = await getDocs(qInvsMatch);
      snapInvsMatch.docs.forEach((d) => invDocsToCancel.set(d.id, d));

      if (match.invitationId) {
        try {
          const directInvSnap = await getDoc(doc(db, 'teamInvitations', match.invitationId));
          if (directInvSnap.exists()) {
            invDocsToCancel.set(directInvSnap.id, directInvSnap);
          }
        } catch (_) {}
      }

      for (const [invId, iDoc] of invDocsToCancel.entries()) {
        const invData = iDoc.data();
        if (invData.status === 'PENDING') {
          await updateDoc(doc(db, 'teamInvitations', invId), {
            status: 'CANCELLED',
            cancelledBy: authUid,
            cancelledAt: now,
            updatedAt: now,
          });
          await updateMatchInvitationNotificationsActioned(invId, 'CANCELLED', authUid);
        }
      }

      if (match.invitationId) {
        await updateMatchInvitationNotificationsActioned(match.invitationId, 'CANCELLED', authUid);
      }
    } catch (_) {}

    // 5. Cancel pending join requests for this lobby
    try {
      const qReqs = query(collection(db, 'lobbyJoinRequests'), where('matchId', '==', matchId));
      const snapReqs = await getDocs(qReqs);
      for (const reqDoc of snapReqs.docs) {
        if (reqDoc.data().status === 'PENDING') {
          await updateDoc(doc(db, 'lobbyJoinRequests', reqDoc.id), {
            status: 'CANCELLED',
            respondedAt: now,
          });
        }
      }
    } catch (_) {}

    // 5b. Release active5v5LobbyId on all participants
    try {
      const allParticipantIds = Array.from(new Set([
        ...(match.teamAPlayerIds || []),
        ...(match.teamBPlayerIds || []),
        match.captainAId,
        match.captainBId,
        match.lobbyOwnerId,
        match.playerAId,
        match.playerBId,
        match.createdBy,
      ].filter((id): id is string => typeof id === 'string' && id.trim().length > 0)));

      for (const pId of allParticipantIds) {
        try {
          const pDoc = await getDoc(doc(db, 'players', pId));
          if (pDoc.exists() && pDoc.data()?.active5v5LobbyId === matchId) {
            await updateDoc(doc(db, 'players', pId), {
              active5v5LobbyId: null,
            });
          }
        } catch (_) {}
      }
    } catch (_) {}

    // 6. Record audit log
    try {
      const logId = `audit_${now}_${Math.random().toString(36).substring(2, 6)}`;
      await setDoc(
        doc(db, 'auditLogs', logId),
        sanitizeFirestoreData({
          id: logId,
          action: 'MATCH_CANCELLED',
          adminId: isAdmin ? actorId : undefined,
          adminName: isAdmin ? actorName : undefined,
          actorId: authUid,
          actorName,
          targetId: matchId,
          targetType: 'MATCH',
          details: `5v5 Lobby ${match.lobbyCode || matchId} removed by ${actorName}. Reason: ${finalReason}`,
          timestamp: now,
          createdAt: now,
        })
      );
    } catch (e) {
      console.warn('Audit log write error:', e);
    }

    return { success: true };
  } catch (err: any) {
    console.error('Failed to cancel match:', err);
    return { success: false, error: err.message || 'Failed to cancel match.' };
  }
}

/**
 * High-level helper to remove a 5v5 lobby.
 * Verifies authenticated user session and transitions the lobby to CANCELLED.
 */
export async function remove5v5Lobby(params: {
  matchId: string;
  reason?: string;
}): Promise<{ success: boolean; error?: string }> {
  const authUser = auth.currentUser;
  if (!authUser || !authUser.uid) {
    return { success: false, error: 'Authentication required to remove lobby.' };
  }
  return await cancelMatch({
    matchId: params.matchId,
    actorId: authUser.uid,
    actorName: authUser.displayName || 'Captain',
    reason: params.reason || 'Lobby removed by captain',
  });
}

/**
 * Helper to ensure Firebase Auth has resolved its initial state.
 * If auth.currentUser is null, waits up to 2 seconds for auth initialization or onAuthStateChanged.
 */
export async function getAuthenticatedUser(): Promise<User | null> {
  if (auth.currentUser) return auth.currentUser;

  if (typeof auth.authStateReady === 'function') {
    try {
      await auth.authStateReady();
      if (auth.currentUser) return auth.currentUser;
    } catch {
      // fallback to onAuthStateChanged listener
    }
  }

  return new Promise((resolve) => {
    let resolved = false;
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!resolved) {
        resolved = true;
        unsub();
        resolve(user);
      }
    });
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        unsub();
        resolve(auth.currentUser);
      }
    }, 2000);
  });
}

/**
 * Invite an existing Nexus Gaming Center player to join Team A or Team B in an active 5v5 lobby.
 * Server/backend security checks:
 * - Inviter must be authenticated (resolves authenticated Firebase UID directly)
 * - Inviter must be an ACTIVE member of this lobby and target team
 * - Inviter can ONLY invite to their OWN team (Team A -> Team A, Team B -> Team B)
 * - Target team must have available slots (< 5)
 * - Recipient must exist as a registered Nexus player
 * - Recipient is NOT already an active player in Team A or Team B
 * - No duplicate PENDING invitation exists for this recipient in this lobby on this team
 * - Uses existing teamInvitations collection
 * - Sends real-time notification to recipient
 */
export async function invitePlayerTo5v5Lobby(params: {
  matchId: string;
  inviterId?: string;
  recipientPlayerId: string;
  teamSide: 'teamA' | 'teamB';
}): Promise<{ success: boolean; invitationId?: string; error?: string }> {
  try {
    const { matchId, recipientPlayerId, teamSide } = params;

    // 1. Get authenticated Firebase user (waits for initialization if temporarily pending)
    const authenticatedUser = await getAuthenticatedUser();
    if (!authenticatedUser || !authenticatedUser.uid) {
      console.warn('[5v5 Invite] Auth check failed: No authenticated user session in Firebase Auth.');
      return { success: false, error: 'Unauthorized: Authentication required.' };
    }

    const authenticatedUid = authenticatedUser.uid;

    if (authenticatedUid === recipientPlayerId) {
      return { success: false, error: 'You cannot select yourself as an opponent or invite yourself.' };
    }

    // 2. Match validation
    const matchRef = doc(db, 'matches', matchId);
    const matchSnap = await getDoc(matchRef);
    if (!matchSnap.exists()) {
      return { success: false, error: '5v5 Lobby not found.' };
    }

    const match = matchSnap.data() as Match;
    const is5v5 = match.matchType === '5v5' || (match.matchType as string)?.toLowerCase() === '5v5' || !!match.lobbyCode;
    if (!is5v5) {
      return { success: false, error: 'Player invitations only apply to 5v5 lobbies.' };
    }

    if (match.status === 'CONFIRMED' || match.status === 'CANCELLED') {
      return { success: false, error: 'This match is already finished or cancelled.' };
    }

    // 3. Find active lobby membership using currentUser.uid
    const teamAIds = Array.from(
      new Set([
        ...(match.teamAPlayerIds || []),
        ...(match.teamAPlayers?.map((p) => p.id) || []),
        ...(match.captainAId ? [match.captainAId] : []),
        ...(match.playerAId ? [match.playerAId] : []),
        ...(match.createdBy ? [match.createdBy] : []),
      ].filter((id): id is string => typeof id === 'string' && id.trim().length > 0))
    );

    const teamBIds = Array.from(
      new Set([
        ...(match.teamBPlayerIds || []),
        ...(match.teamBPlayers?.map((p) => p.id) || []),
        ...(match.captainBId ? [match.captainBId] : []),
        ...(match.playerBId ? [match.playerBId] : []),
      ].filter((id): id is string => typeof id === 'string' && id.trim().length > 0))
    );

    const isTeamA = teamAIds.includes(authenticatedUid);
    const isTeamB = teamBIds.includes(authenticatedUid);

    const isCaptainA =
      authenticatedUid === match.captainAId ||
      authenticatedUid === match.playerAId ||
      authenticatedUid === match.createdBy ||
      teamAIds[0] === authenticatedUid;

    const isCaptainB =
      authenticatedUid === match.captainBId ||
      authenticatedUid === match.playerBId ||
      teamBIds[0] === authenticatedUid;

    const isLobbyOwner = Boolean(
      authenticatedUid &&
        (authenticatedUid === match.lobbyOwnerId || authenticatedUid === match.createdBy)
    );

    const isTeamACaptain = Boolean(
      authenticatedUid &&
        (authenticatedUid === match.captainAId ||
          (!match.captainAId && authenticatedUid === match.playerAId))
    );

    const isTeamBCaptain = Boolean(
      authenticatedUid &&
        (authenticatedUid === match.captainBId ||
          (!match.captainBId && authenticatedUid === match.playerBId))
    );

    const canInviteToTeamA = isLobbyOwner || isTeamACaptain;
    const canInviteToTeamB = isLobbyOwner || isTeamBCaptain;

    // Strict Canonical Backend Permission Rules:
    // - Lobby Owner: can invite to Team A and Team B
    // - Team A Captain: can invite to Team A only (cannot invite to Team B)
    // - Team B Captain: can invite to Team B only (cannot invite to Team A)
    // - Ordinary Team Member: cannot invite to either team
    if (teamSide === 'teamA') {
      if (!canInviteToTeamA) {
        return {
          success: false,
          error: 'PERMISSION_DENIED: Only the Lobby Owner or Team A Captain can invite players to Team A.',
        };
      }
    } else if (teamSide === 'teamB') {
      if (!canInviteToTeamB) {
        return {
          success: false,
          error: 'PERMISSION_DENIED: Only the Lobby Owner or Team B Captain can invite players to Team B.',
        };
      }
    } else {
      return { success: false, error: 'Invalid team side specified.' };
    }

    // 4. Team roster limit check (max 5)
    const targetIds = teamSide === 'teamA' ? teamAIds : teamBIds;
    if (targetIds.length >= 5) {
      return { success: false, error: `${teamSide === 'teamA' ? 'Team A' : 'Team B'} is already full (5/5 players).` };
    }

    // 5. Recipient existence check in Nexus players collection
    const recipientRef = doc(db, 'players', recipientPlayerId);
    const recipientSnap = await getDoc(recipientRef);
    if (!recipientSnap.exists()) {
      return { success: false, error: 'The selected player does not have a registered Nexus Gaming Center account.' };
    }
    const recipient = recipientSnap.data() as Player;

    // 6. Recipient cannot already be an active player in the lobby
    if (teamAIds.includes(recipientPlayerId)) {
      return { success: false, error: `${recipient.gamerTag} is already an active member of Team A in this lobby.` };
    }
    if (teamBIds.includes(recipientPlayerId)) {
      return { success: false, error: `${recipient.gamerTag} is already an active member of Team B in this lobby.` };
    }

    // 6b. Recipient cannot already belong to another active 5v5 lobby
    const recipientActiveLobby = await getPlayerActive5v5Lobby(recipientPlayerId, matchId);
    if (recipientActiveLobby) {
      return {
        success: false,
        error: `ALREADY IN AN ACTIVE LOBBY: ${recipient.gamerTag} is already an active member of 5v5 lobby ${recipientActiveLobby.lobbyCode || recipientActiveLobby.id}.`,
      };
    }

    // 7. Duplicate pending invite check & canonical invitationId
    const invQ = query(
      collection(db, 'teamInvitations'),
      where('lobbyId', '==', matchId),
      where('invitedPlayerId', '==', recipientPlayerId)
    );
    const invSnap = await getDocs(invQ);
    const existingPendingDoc = invSnap.docs.find((d) => {
      const data = d.data() as TeamInvitation;
      const status = normalizeInvitationStatus(data.status);
      return status === 'PENDING' && data.teamSide === teamSide && !isInvitationExpired(data);
    });

    const now = Date.now();
    const expiresAt = calculateInvitationExpiresAt(now);
    // Canonical invitationId: reuse existing pending invitation if available, or generate a deterministic canonical ID
    const inviteId = existingPendingDoc
      ? existingPendingDoc.id
      : `inv_5v5_${matchId}_${recipientPlayerId}_${teamSide}_${now}`;

    // 8. Fetch inviter gamerTag
    let inviterGamerTag = 'Squad Member';
    const inviterSnap = await getDoc(doc(db, 'players', authenticatedUid));
    if (inviterSnap.exists()) {
      inviterGamerTag = (inviterSnap.data() as Player).gamerTag || 'Squad Member';
    }

    const targetTeamName = teamSide === 'teamA' ? (match.teamAName || 'Squad A') : (match.teamBName || 'Opposing Squad');
    const targetTeamTag = teamSide === 'teamA' ? (match.teamATag || 'SQD-A') : (match.teamBTag || 'SQD-B');
    const targetTeamLogo = teamSide === 'teamA' ? (match.teamALogo || '🛡️') : (match.teamBLogo || '⚔️');
    const targetTeamId = teamSide === 'teamA' ? (match.teamAId || `teamA_${matchId}`) : (match.teamBId || `teamB_${matchId}`);
    const captainId = teamSide === 'teamA'
      ? (match.captainAId || match.createdBy || authenticatedUid)
      : (match.captainBId && match.captainBId !== recipientPlayerId ? match.captainBId : authenticatedUid);

    const gameTitle = match.gameName || match.gameId || 'Valorant';

    // Create or update canonical invitation document
    const newInvite: TeamInvitation = {
      id: inviteId,
      lobbyId: matchId,
      teamId: targetTeamId,
      teamSide,
      teamName: targetTeamName,
      teamTag: targetTeamTag,
      teamLogo: targetTeamLogo,
      gameId: match.gameId || 'valorant',
      gameName: gameTitle,
      game: gameTitle,
      captainId,
      senderId: authenticatedUid,
      inviterId: authenticatedUid,
      inviterGamerTag,
      captainGamerTag: inviterGamerTag,
      invitedPlayerId: recipientPlayerId,
      recipientId: recipientPlayerId,
      invitedGamerTag: recipient.gamerTag,
      invitedPlayerGamerTag: recipient.gamerTag,
      status: 'PENDING',
      type: '5V5_LOBBY_INVITATION',
      createdAt: existingPendingDoc ? (existingPendingDoc.data() as TeamInvitation).createdAt || now : now,
      expiresAt: existingPendingDoc && (existingPendingDoc.data() as TeamInvitation).expiresAt
        ? (existingPendingDoc.data() as TeamInvitation).expiresAt
        : expiresAt,
      updatedAt: now,
    };

    await setDoc(doc(db, 'teamInvitations', inviteId), sanitizeFirestoreData(newInvite), { merge: true });

    // 9. Real-time notification with canonical notificationId to guarantee NO duplicates
    const notifId = `notif_match_inv_${inviteId}`;
    await sendNotification({
      notificationId: notifId,
      userId: recipientPlayerId,
      recipientId: recipientPlayerId,
      type: 'MATCH_INVITATION',
      title: '5v5 Match Invitation 🎮',
      message: `${inviterGamerTag} invited you to join ${targetTeamName} [${targetTeamTag}] in 5v5 ${gameTitle} (${match.station || 'PC Station'})!`,
      invitationId: inviteId,
      lobbyId: matchId,
      teamId: targetTeamId,
      inviterId: authenticatedUid,
      inviterGamerTag,
      game: gameTitle,
      status: 'PENDING',
      expiresAt: newInvite.expiresAt,
      data: {
        matchId,
        lobbyId: matchId,
        teamId: targetTeamId,
        teamSide,
        teamName: targetTeamName,
        teamTag: targetTeamTag,
        teamLogo: targetTeamLogo,
        invitationId: inviteId,
        expiresAt: newInvite.expiresAt,
        inviterId: authenticatedUid,
        inviterGamerTag,
        game: gameTitle,
        gameName: gameTitle,
        gameId: match.gameId || 'valorant',
        status: 'PENDING',
        actionState: 'UNREAD',
      },
    });

    return { success: true, invitationId: inviteId };
  } catch (err: any) {
    console.error('invitePlayerTo5v5Lobby error:', err);
    return { success: false, error: err.message || 'Failed to send player invitation.' };
  }
}

/**
 * Cancel a pending 5v5 lobby invitation.
 * Allowed by: The inviter, the team's captain, or an admin.
 */
export async function cancel5v5LobbyInvitation(params: {
  invitationId: string;
  callerId: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { invitationId, callerId } = params;
    const invRef = doc(db, 'teamInvitations', invitationId);
    const invSnap = await getDoc(invRef);

    if (!invSnap.exists()) {
      return { success: false, error: 'Invitation not found.' };
    }

    const invitation = invSnap.data() as TeamInvitation;
    if (normalizeInvitationStatus(invitation.status) !== 'PENDING') {
      return { success: false, error: 'This invitation is no longer pending.' };
    }

    // Permission check: inviter, captain, or admin
    const canCancel =
      callerId === invitation.inviterId ||
      callerId === invitation.captainId ||
      callerId === invitation.senderId;

    if (!canCancel) {
      return { success: false, error: 'Only the inviter or team captain can cancel this invitation.' };
    }

    const now = Date.now();
    await updateDoc(
      invRef,
      sanitizeFirestoreData({
        status: 'CANCELLED',
        cancelledBy: callerId,
        cancelledAt: now,
        updatedAt: now,
      })
    );

    // Update notifications to ACTIONED / CANCELLED state
    await updateMatchInvitationNotificationsActioned(invitationId, 'CANCELLED', callerId);

    const targetUid = invitation.recipientId || invitation.invitedPlayerId;
    if (targetUid) {
      await sendNotification({
        userId: targetUid,
        recipientId: targetUid,
        type: 'MATCH_INVITATION_CANCELLED',
        title: '🎮 INVITATION CANCELLED',
        message: `The 5v5 match invitation for ${invitation.teamName} was cancelled by the squad.`,
        invitationId,
        lobbyId: invitation.lobbyId,
        teamId: invitation.teamId,
        status: 'CANCELLED',
        data: {
          matchId: invitation.lobbyId,
          lobbyId: invitation.lobbyId,
          teamId: invitation.teamId,
          invitationId,
          status: 'CANCELLED',
        },
      });
    }

    return { success: true };
  } catch (err: any) {
    console.error('cancel5v5LobbyInvitation error:', err);
    return { success: false, error: err.message || 'Failed to cancel invitation.' };
  }
}

/**
 * Real-time listener for invitations tied to a specific 5v5 lobby
 */
export function subscribeToLobbyInvitations(
  matchId: string,
  callback: (invitations: TeamInvitation[]) => void
): () => void {
  if (!matchId) {
    callback([]);
    return () => {};
  }

  const qLobby = query(
    collection(db, 'teamInvitations'),
    where('lobbyId', '==', matchId)
  );
  const qMatch = query(
    collection(db, 'teamInvitations'),
    where('matchId', '==', matchId)
  );

  let mapLobby = new Map<string, TeamInvitation>();
  let mapMatch = new Map<string, TeamInvitation>();

  const emit = () => {
    const combined = new Map<string, TeamInvitation>();
    for (const [id, inv] of mapLobby.entries()) combined.set(id, inv);
    for (const [id, inv] of mapMatch.entries()) combined.set(id, inv);
    const list = Array.from(combined.values()).sort(
      (a, b) => (b.createdAt || 0) - (a.createdAt || 0)
    );
    callback(list);
  };

  const unsubLobby = onSnapshot(
    qLobby,
    (snap) => {
      mapLobby = new Map();
      snap.docs.forEach((d) => mapLobby.set(d.id, { id: d.id, ...d.data() } as TeamInvitation));
      emit();
    },
    (err) => {
      console.warn('Error listening to lobby invitations by lobbyId:', err);
    }
  );

  const unsubMatch = onSnapshot(
    qMatch,
    (snap) => {
      mapMatch = new Map();
      snap.docs.forEach((d) => mapMatch.set(d.id, { id: d.id, ...d.data() } as TeamInvitation));
      emit();
    },
    (err) => {
      console.warn('Error listening to lobby invitations by matchId:', err);
    }
  );

  return () => {
    unsubLobby();
    unsubMatch();
  };
}

/**
 * Add a player directly to a 5v5 lobby team (Team A or Team B)
 * - Team A Captain / Lobby Owner can add players to Team A or Team B
 * - Team B Captain can only add players to Team B (CANNOT add to Team A)
 * - If Team B was empty, the newly added player automatically becomes Team B Captain
 * - If Team B already has a captain, that captain is preserved
 */
export async function addPlayerTo5v5Team(params: {
  matchId: string;
  callerId?: string;
  targetPlayerId: string;
  teamSide: 'teamA' | 'teamB';
}): Promise<{ success: boolean; match?: Match; error?: string }> {
  // Direct adding of players without invitation is strictly disabled.
  // Both Lobby Owner and Team B Captain must use the invitation flow.
  return {
    success: false,
    error:
      'DIRECT_ADD_DISABLED: Directly adding players without an invitation is disabled. Players must be invited and accept the invitation to join the team.',
  };
}


