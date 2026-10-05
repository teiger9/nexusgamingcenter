import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  onSnapshot,
  runTransaction,
  limit,
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { Match, Team, Player, LobbyRecruitment, RecruitmentStatus, MatchStatus } from '../types';
import { sanitizeFirestoreData, getPlayerActive5v5Lobby } from './matchService';
import { sendNotification } from './notificationService';
import { logAuditEvent } from './auditService';

/**
 * Publish / Update a recruitment announcement for a team on the Arena / Main page
 * Strictly enforces ONE active recruitment announcement per team!
 */
export async function publishTeamRecruitment(params: {
  teamId?: string;
  captainId?: string;
  message?: string;
  note?: string;
  preferredRole?: string;
  lobbyId?: string;
  team?: Team;
  captain?: any;
}): Promise<{ success: boolean; recruitment?: LobbyRecruitment; error?: string }> {
  try {
    const teamId = params.teamId || params.team?.teamId;
    const captainId = params.captainId || params.captain?.uid || params.team?.captainId;
    const message = params.message || params.note;
    const preferredRole = params.preferredRole;
    const lobbyId = params.lobbyId;

    if (!teamId || !captainId) {
      return { success: false, error: 'Team ID and Captain ID are required.' };
    }

    let team = params.team;
    if (!team) {
      const teamRef = doc(db, 'teams', teamId);
      const teamSnap = await getDoc(teamRef);
      if (!teamSnap.exists()) {
        return { success: false, error: 'Team not found.' };
      }
      team = teamSnap.data() as Team;
    }

    const isCaptain =
      team.captainId === captainId ||
      team.members?.some((m) => m.id === captainId && m.role === 'captain');

    if (!isCaptain) {
      return { success: false, error: 'Only the team captain can publish recruitment announcements.' };
    }

    const currentMembers = team.members || [];
    const currentMemberIds = team.memberIds || currentMembers.map((m) => m.id);
    const currentCount = currentMemberIds.length;

    if (currentCount >= 5) {
      return { success: false, error: 'Team roster is already full (5/5 players).' };
    }

    const playersNeeded = Math.max(0, 5 - currentCount);
    const now = Date.now();
    const defaultMsg = `Need ${playersNeeded} player${playersNeeded > 1 ? 's' : ''} to complete 5v5 squad!`;
    const recruitmentMsg = message?.trim() || defaultMsg;

    // Check if team already has an active recruitment announcement
    const qRec = query(collection(db, 'lobbyRecruitments'), where('teamId', '==', teamId));
    const snapRec = await getDocs(qRec);
    const activeDocs = snapRec.docs.filter((d) => (d.data() as LobbyRecruitment).status === 'ACTIVE');

    let recDocId = `rec_${teamId}`;
    let resolvedLobbyId = lobbyId || '';

    // If an active announcement already exists for this team, update it instead of creating another
    if (activeDocs.length > 0) {
      recDocId = activeDocs[0].id;
      if (!resolvedLobbyId && activeDocs[0].data().lobbyId) {
        resolvedLobbyId = activeDocs[0].data().lobbyId;
      }
    }

    const recruitmentData: LobbyRecruitment = {
      id: recDocId,
      lobbyId: resolvedLobbyId,
      lobbyCode: resolvedLobbyId ? `5V5-${team.teamTag}` : '5V5',
      teamId: team.teamId,
      teamName: team.teamName,
      teamTag: team.teamTag,
      teamLogo: team.teamLogo || '🛡️',
      captainId: team.captainId,
      captainName: team.captainName || team.captainGamerTag,
      captainGamerTag: team.captainGamerTag,
      gameId: team.gameId,
      gameName: team.gameName,
      gameCategory: 'PC',
      station: 'PC-01',
      currentActivePlayers: currentCount,
      playersNeeded,
      status: 'ACTIVE',
      teamAvgRating: team.teamRating || 1000,
      playerIds: currentMemberIds,
      recruitmentMessage: recruitmentMsg,
      preferredRole: preferredRole || 'Any',
      createdAt: activeDocs.length > 0 ? (activeDocs[0].data().createdAt || now) : now,
      updatedAt: now,
    };

    // Write / update the single active recruitment document
    await setDoc(doc(db, 'lobbyRecruitments', recDocId), sanitizeFirestoreData(recruitmentData), { merge: true });

    // Cancel any older duplicate active recruitments for this team if they exist
    for (let i = 1; i < activeDocs.length; i++) {
      await updateDoc(activeDocs[i].ref, { status: 'CANCELLED', updatedAt: now });
    }

    // If linked to an active lobby, update the match document as well
    if (resolvedLobbyId) {
      const matchRef = doc(db, 'matches', resolvedLobbyId);
      const matchSnap = await getDoc(matchRef);
      if (matchSnap.exists()) {
        await updateDoc(
          matchRef,
          sanitizeFirestoreData({
            isRecruiting: true,
            recruitmentStatus: 'ACTIVE',
            playersNeeded,
            recruitmentAnnouncementAt: now,
            recruitmentMessage: recruitmentMsg,
            preferredRole: preferredRole || 'Any',
            updatedAt: now,
          })
        );
      }
    }

    await logAuditEvent({
      action: 'TEAM_RECRUITMENT_PUBLISHED',
      actorId: captainId,
      actorName: team.captainGamerTag,
      targetType: 'team',
      targetId: teamId,
      details: `Published recruitment announcement for ${team.teamName}: Need ${playersNeeded} players.`,
      gameId: team.gameId,
      teamId,
    });

    return { success: true, recruitment: recruitmentData };
  } catch (err: any) {
    console.error('Failed to publish team recruitment:', err);
    return { success: false, error: err.message || 'Failed to publish recruitment announcement.' };
  }
}

/**
 * Edit an existing recruitment announcement's message and role
 */
export async function editTeamRecruitment(params: {
  recruitmentId?: string;
  teamId?: string;
  captainId: string;
  message?: string;
  note?: string;
  preferredRole?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { recruitmentId, teamId, captainId } = params;
    const message = (params.message || params.note || '').trim();
    const preferredRole = params.preferredRole?.trim();

    let docToEdit: any = null;
    if (recruitmentId) {
      const snap = await getDoc(doc(db, 'lobbyRecruitments', recruitmentId));
      if (snap.exists()) {
        docToEdit = snap;
      }
    }

    if (!docToEdit && teamId) {
      const qRec = query(collection(db, 'lobbyRecruitments'), where('teamId', '==', teamId));
      const snapRec = await getDocs(qRec);
      const activeDocs = snapRec.docs.filter((d) => (d.data() as LobbyRecruitment).status === 'ACTIVE');
      if (activeDocs.length > 0) {
        docToEdit = activeDocs[0];
      }
    }

    if (!docToEdit) {
      return { success: false, error: 'No active recruitment announcement found to edit.' };
    }

    const data = docToEdit.data() as LobbyRecruitment;

    if (data.captainId !== captainId) {
      return { success: false, error: 'Only the captain can edit the announcement.' };
    }

    const now = Date.now();
    const updatePayload: any = { updatedAt: now };
    if (message) updatePayload.recruitmentMessage = message;
    if (preferredRole !== undefined) updatePayload.preferredRole = preferredRole;

    await updateDoc(docToEdit.ref, sanitizeFirestoreData(updatePayload));

    if (data.lobbyId) {
      const matchRef = doc(db, 'matches', data.lobbyId);
      const matchSnap = await getDoc(matchRef);
      if (matchSnap.exists()) {
        await updateDoc(matchRef, sanitizeFirestoreData(updatePayload));
      }
    }

    return { success: true };
  } catch (err: any) {
    console.error('Failed to edit recruitment:', err);
    return { success: false, error: err.message || 'Failed to edit announcement.' };
  }
}

/**
 * Cancel a team's active recruitment announcement
 */
export async function cancelTeamRecruitment(
  recruitmentIdOrParams: string | { teamId: string; captainId: string; reason?: string },
  maybeCaptainId?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const recruitmentId = typeof recruitmentIdOrParams === 'string' ? recruitmentIdOrParams : '';
    const teamId = typeof recruitmentIdOrParams === 'object' ? recruitmentIdOrParams.teamId : '';
    const captainId = typeof recruitmentIdOrParams === 'object' ? recruitmentIdOrParams.captainId : (maybeCaptainId || '');
    const reason = typeof recruitmentIdOrParams === 'object' ? recruitmentIdOrParams.reason : 'Captain cancelled';

    const now = Date.now();

    if (recruitmentId) {
      const recRef = doc(db, 'lobbyRecruitments', recruitmentId);
      const snap = await getDoc(recRef);
      if (snap.exists()) {
        const data = snap.data() as LobbyRecruitment;
        if (!captainId || data.captainId === captainId) {
          await updateDoc(recRef, { status: 'CANCELLED', updatedAt: now });
          if (data.lobbyId) {
            const matchRef = doc(db, 'matches', data.lobbyId);
            const matchSnap = await getDoc(matchRef);
            if (matchSnap.exists()) {
              await updateDoc(
                matchRef,
                sanitizeFirestoreData({
                  isRecruiting: false,
                  recruitmentStatus: 'CANCELLED',
                  updatedAt: now,
                })
              );
            }
          }
          return { success: true };
        } else {
          return { success: false, error: 'Only the captain can cancel this announcement.' };
        }
      }
    }

    if (teamId) {
      const qRec = query(collection(db, 'lobbyRecruitments'), where('teamId', '==', teamId));
      const snapRec = await getDocs(qRec);
      const activeDocs = snapRec.docs.filter((d) => (d.data() as LobbyRecruitment).status === 'ACTIVE');

      for (const d of activeDocs) {
        const data = d.data() as LobbyRecruitment;
        if (!captainId || data.captainId === captainId) {
          await updateDoc(d.ref, {
            status: 'CANCELLED',
            updatedAt: now,
          });

          if (data.lobbyId) {
            const matchRef = doc(db, 'matches', data.lobbyId);
            const matchSnap = await getDoc(matchRef);
            if (matchSnap.exists()) {
              await updateDoc(
                matchRef,
                sanitizeFirestoreData({
                  isRecruiting: false,
                  recruitmentStatus: 'CANCELLED',
                  updatedAt: now,
                })
              );
            }
          }
        }
      }

      await logAuditEvent({
        action: 'TEAM_RECRUITMENT_CANCELLED',
        actorId: captainId || 'unknown',
        actorName: 'Captain',
        targetType: 'team',
        targetId: teamId,
        details: `Cancelled recruitment announcement for team ${teamId}. Reason: ${reason || 'Captain cancelled'}`,
        teamId,
      });

      return { success: true };
    }

    return { success: false, error: 'Target announcement or team not specified.' };
  } catch (err: any) {
    console.error('Failed to cancel recruitment:', err);
    return { success: false, error: err.message || 'Failed to cancel announcement.' };
  }
}

/**
 * Real-time subscription to active recruitment for a specific team
 */
export function subscribeToTeamActiveRecruitment(
  teamId: string,
  callback: (recruitment: LobbyRecruitment | null) => void
): () => void {
  if (!teamId) {
    callback(null);
    return () => {};
  }

  const q = query(collection(db, 'lobbyRecruitments'), where('teamId', '==', teamId));

  return onSnapshot(
    q,
    (snap) => {
      const active = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as LobbyRecruitment))
        .find((r) => r.status === 'ACTIVE');

      callback(active || null);
    },
    (err) => {
      console.warn('Error subscribing to team active recruitment:', err);
      callback(null);
    }
  );
}

/**
 * Publish a public recruitment announcement for a 5v5 lobby on the Arena / Main page
 * Only the team captain / lobby creator can publish.
 * Enforces strictly ONE active recruitment per team.
 */
export async function publishLobbyRecruitment(params: {
  matchId: string;
  captainId: string;
  message?: string;
}): Promise<{ success: boolean; recruitment?: LobbyRecruitment; error?: string }> {
  try {
    const { matchId, captainId, message } = params;
    const matchRef = doc(db, 'matches', matchId);
    const matchSnap = await getDoc(matchRef);

    if (!matchSnap.exists()) {
      return { success: false, error: '5v5 Lobby not found.' };
    }

    const match = matchSnap.data() as Match;

    if (match.matchType !== '5v5') {
      return { success: false, error: 'Only 5v5 lobbies can publish recruitment announcements.' };
    }

    const isTeamA = match.playerAId === captainId || match.captainAId === captainId || match.createdBy === captainId;
    const isTeamB = match.playerBId === captainId || match.captainBId === captainId;
    if (!isTeamA && !isTeamB) {
      return { success: false, error: 'Only the team captain or lobby creator can announce the need for players.' };
    }

    const OPEN_ROSTER_STATUSES: MatchStatus[] = [
      'WAITING_FOR_OPPONENT',
      'OPPONENT_JOINED',
      'TEAM_ROSTERS_FILLING',
      'PENDING',
    ];

    if (!OPEN_ROSTER_STATUSES.includes(match.status)) {
      return { success: false, error: 'Cannot recruit players once the match is approved, live, or concluded.' };
    }

    const recruitingSide = isTeamB ? 'teamB' : 'teamA';
    const currentCount = recruitingSide === 'teamB' ? (match.teamBPlayerIds?.length || 1) : (match.teamAPlayerIds?.length || 1);
    if (currentCount >= 5) {
      return { success: false, error: 'Team roster is already full (5/5 players).' };
    }

    const playersNeeded = 5 - currentCount;
    const now = Date.now();
    const recruitmentMsg = message?.trim() || `Need ${playersNeeded} player${playersNeeded > 1 ? 's' : ''} to complete 5v5 squad!`;

    // Ensure ONE active announcement per team:
    // If team has an active announcement already under rec_${teamId}, reuse/link it!
    const targetTeamId = recruitingSide === 'teamB' ? (match.teamBId || '') : (match.teamAId || '');
    let targetDocId = recruitingSide === 'teamB' ? `rec_match_${matchId}_teamB` : matchId;

    if (targetTeamId) {
      const qExisting = query(collection(db, 'lobbyRecruitments'), where('teamId', '==', targetTeamId));
      const snapExisting = await getDocs(qExisting);
      const activeExisting = snapExisting.docs.find((d) => (d.data() as LobbyRecruitment).status === 'ACTIVE');
      if (activeExisting) {
        targetDocId = activeExisting.id;
      } else if (recruitingSide === 'teamA') {
        targetDocId = `rec_${targetTeamId}`;
      }
    }

    const captainName = isTeamB
      ? (match.playerBName || match.playerBGamerTag || 'Captain')
      : (match.playerAName || match.playerAGamerTag || 'Captain');
    const captainGamerTag = isTeamB
      ? (match.playerBGamerTag || 'Captain')
      : (match.playerAGamerTag || 'Captain');

    const recruitmentData: LobbyRecruitment = {
      id: targetDocId,
      lobbyId: matchId,
      lobbyCode: match.lobbyCode || '5v5',
      teamId: targetTeamId,
      teamName: isTeamB ? (match.teamBName || 'Opponent Squad') : (match.teamAName || 'Squad'),
      teamTag: isTeamB ? (match.teamBTag || '5v5') : (match.teamATag || '5v5'),
      teamLogo: isTeamB ? (match.teamBLogo || '🛡️') : (match.teamALogo || '🛡️'),
      teamSide: recruitingSide,
      captainId,
      captainName,
      captainGamerTag,
      gameId: match.gameId,
      gameName: match.gameName,
      gameCategory: match.gameCategory || 'PC',
      station: match.station || 'PC-01',
      pcCount: match.pcCount || 10,
      currentActivePlayers: currentCount,
      playersNeeded,
      status: 'ACTIVE',
      teamAvgRating: (isTeamB ? match.teamBAvgRating : match.teamAAvgRating) || 1000,
      playerIds: (isTeamB ? match.teamBPlayerIds : match.teamAPlayerIds) || [captainId],
      recruitmentMessage: recruitmentMsg,
      createdAt: now,
      updatedAt: now,
    };

    // Update match document
    await updateDoc(
      matchRef,
      sanitizeFirestoreData({
        isRecruiting: true,
        recruitmentStatus: 'ACTIVE',
        playersNeeded,
        recruitmentAnnouncementAt: now,
        recruitmentMessage: recruitmentMsg,
        updatedAt: now,
      })
    );

    // Write to lobbyRecruitments collection
    await setDoc(doc(db, 'lobbyRecruitments', targetDocId), sanitizeFirestoreData(recruitmentData), { merge: true });

    await logAuditEvent({
      action: 'LOBBY_RECRUITMENT_PUBLISHED',
      actorId: captainId,
      actorName: match.playerAGamerTag || 'Captain',
      targetType: 'match',
      targetId: matchId,
      details: `Published recruitment for ${match.teamAName}: Need ${playersNeeded} players.`,
      gameId: match.gameId,
      lobbyId: matchId,
    });

    return { success: true, recruitment: recruitmentData };
  } catch (err: any) {
    console.error('Failed to publish lobby recruitment:', err);
    return { success: false, error: err.message || 'Failed to publish recruitment announcement.' };
  }
}

/**
 * Cancel a recruitment announcement
 */
export async function cancelLobbyRecruitment(params: {
  matchId: string;
  captainId: string;
  reason?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { matchId, captainId } = params;
    const matchRef = doc(db, 'matches', matchId);
    const matchSnap = await getDoc(matchRef);

    if (!matchSnap.exists()) {
      return { success: false, error: 'Lobby not found.' };
    }

    const match = matchSnap.data() as Match;
    const isCaptain = match.playerAId === captainId || match.captainAId === captainId || match.createdBy === captainId;
    if (!isCaptain) {
      return { success: false, error: 'Only the captain or lobby creator can cancel recruitment.' };
    }

    const now = Date.now();

    await updateDoc(
      matchRef,
      sanitizeFirestoreData({
        isRecruiting: false,
        recruitmentStatus: 'CANCELLED',
        updatedAt: now,
      })
    );

    const recRef = doc(db, 'lobbyRecruitments', matchId);
    await updateDoc(
      recRef,
      sanitizeFirestoreData({
        status: 'CANCELLED',
        updatedAt: now,
      })
    );

    await logAuditEvent({
      action: 'LOBBY_RECRUITMENT_CANCELLED',
      actorId: captainId,
      actorName: match.playerAGamerTag || 'Captain',
      targetType: 'match',
      targetId: matchId,
      details: `Cancelled recruitment announcement for lobby ${match.lobbyCode || matchId}.`,
      gameId: match.gameId,
      lobbyId: matchId,
    });

    return { success: true };
  } catch (err: any) {
    console.error('Failed to cancel recruitment:', err);
    return { success: false, error: err.message || 'Failed to cancel recruitment.' };
  }
}

/**
 * Atomic join lobby from recruitment announcement
 * Race condition protected: Max 5 players, atomic transaction
 */
export async function joinLobbyRecruitment(params: {
  matchId: string;
  player: Player;
  teamSide?: 'teamA' | 'teamB';
}): Promise<{ success: boolean; match?: Match; error?: string }> {
  try {
    const { matchId, player } = params;

    // Authoritative UID
    const authUid = auth.currentUser?.uid || player.uid;
    if (!authUid) {
      return { success: false, error: 'Authentication required to join lobby.' };
    }

    // Backend-level check: Verify player is not already in another active 5v5 lobby
    const playerActiveLobby = await getPlayerActive5v5Lobby(authUid, matchId);
    if (playerActiveLobby) {
      return {
        success: false,
        error: 'YOU ARE ALREADY IN AN ACTIVE LOBBY',
      };
    }

    const matchRef = doc(db, 'matches', matchId);
    const recRef = doc(db, 'lobbyRecruitments', matchId);

    const now = Date.now();
    let updatedMatchData: Match | null = null;
    let captainToNotify: string = '';
    let isFullAfterJoin = false;
    let playersNeededAfter = 0;
    let newPlayerCount = 0;
    let teamNameJoined = '';
    let teamTagJoined = '';
    let lobbyCodeJoined = '';

    await runTransaction(db, async (tx) => {
      // 1. Read Match
      const matchDoc = await tx.get(matchRef);
      if (!matchDoc.exists()) {
        throw new Error('5v5 Lobby no longer exists.');
      }
      const match = matchDoc.data() as Match;

      if (match.matchType !== '5v5') {
        throw new Error('This match is not a 5v5 lobby.');
      }

      const OPEN_ROSTER_STATUSES: MatchStatus[] = [
        'WAITING_FOR_OPPONENT',
        'OPPONENT_JOINED',
        'TEAM_ROSTERS_FILLING',
        'PENDING',
      ];
      const CLOSED_STATUSES: MatchStatus[] = [
        'READY_CHECK',
        'WAITING_FOR_ADMIN',
        'APPROVED',
        'LIVE',
        'AWAITING_RESULTS',
        'AWAITING_CONFIRMATION',
        'PENDING_ADMIN_APPROVAL',
        'PENDING_ADMIN_REVIEW',
        'COMPLETED',
        'CONFIRMED',
        'CANCELLED',
        'REJECTED',
        'DISPUTED',
      ];

      if (CLOSED_STATUSES.includes(match.status) || !OPEN_ROSTER_STATUSES.includes(match.status)) {
        throw new Error('This lobby is no longer accepting players (match in progress or closed).');
      }

      const teamAPlayerIds = match.teamAPlayerIds || [];
      const teamBPlayerIds = match.teamBPlayerIds || [];

      // Determine which team side player wants or is assigned to join
      let targetSide: 'teamA' | 'teamB' = params.teamSide || 'teamA';

      // If recruitment document specifies teamSide or teamId:
      const recDoc = await tx.get(recRef);
      if (recDoc.exists()) {
        const recData = recDoc.data() as LobbyRecruitment;
        if (recData.teamSide) {
          targetSide = recData.teamSide;
        } else if (recData.teamId && match.teamBId && recData.teamId === match.teamBId) {
          targetSide = 'teamB';
        }
      }

      // Check if player is already in this squad (idempotent)
      if (
        (targetSide === 'teamA' && teamAPlayerIds.includes(player.uid)) ||
        (targetSide === 'teamB' && teamBPlayerIds.includes(player.uid))
      ) {
        updatedMatchData = match;
        return;
      }

      // Check if player is on the opposing squad
      if (
        (targetSide === 'teamA' && teamBPlayerIds.includes(player.uid)) ||
        (targetSide === 'teamB' && teamAPlayerIds.includes(player.uid))
      ) {
        throw new Error('You are already an active player on the opposing squad in this lobby. Please leave the other squad first.');
      }

      // If chosen side is full, but the other side has open slots, and no specific team was mandated:
      if (!params.teamSide && targetSide === 'teamA' && teamAPlayerIds.length >= 5 && teamBPlayerIds.length < 5) {
        targetSide = 'teamB';
      }

      const isTargetTeamA = targetSide === 'teamA';
      const targetPlayerIds = isTargetTeamA ? teamAPlayerIds : teamBPlayerIds;

      // Overfill Protection: Strictly enforce 5 players max per squad
      if (targetPlayerIds.length >= 5) {
        throw new Error(`${isTargetTeamA ? 'Team A' : 'Team B'} squad roster is now full (5/5 players).`);
      }

      // 2. Read Team (Optional fallback for metadata only, never modifies persistent squad)
      let team: Team | null = null;
      const targetTeamId = isTargetTeamA ? match.teamAId : match.teamBId;
      if (targetTeamId) {
        const teamRef = doc(db, 'teams', targetTeamId);
        const teamDoc = await tx.get(teamRef);
        if (teamDoc.exists()) {
          team = teamDoc.data() as Team;
        }
      }

      // 3. Compute New Roster
      const nextPlayerIds = [...targetPlayerIds, player.uid];
      newPlayerCount = nextPlayerIds.length;
      playersNeededAfter = Math.max(0, 5 - newPlayerCount);
      isFullAfterJoin = newPlayerCount >= 5;

      // Extract Game-Specific IGN for the match's game
      const gameKey = (match.gameId || '').toLowerCase().trim();
      const inGameName = player.inGameNames?.[gameKey] || player.inGameName || player.gamerTag;

      const newPlayerSnapshot = {
        id: player.uid,
        gamerTag: player.gamerTag || 'Player',
        name: player.fullName || player.gamerTag || 'Player',
        rating: player.overallRating || 1000,
        inGameName,
      };

      const currentSnapshots = isTargetTeamA ? (match.teamAPlayers || []) : (match.teamBPlayers || []);
      const nextSnapshots = [...currentSnapshots.filter((p) => p.id !== player.uid), newPlayerSnapshot];
      const sumRatings = nextSnapshots.reduce((acc, p) => acc + (p.rating || 1000), 0);
      const newAvgRating = Math.round(sumRatings / newPlayerCount);

      teamNameJoined = isTargetTeamA
        ? (match.teamAName || team?.teamName || 'Squad')
        : (match.teamBName || team?.teamName || 'Squad');
      teamTagJoined = isTargetTeamA
        ? (match.teamATag || team?.teamTag || '5v5')
        : (match.teamBTag || team?.teamTag || '5v5');
      lobbyCodeJoined = match.lobbyCode || '';
      captainToNotify = isTargetTeamA
        ? (match.playerAId || match.captainAId || team?.captainId || '')
        : (match.playerBId || match.captainBId || team?.captainId || '');

      const isTeamA5 = isTargetTeamA ? (newPlayerCount >= 5) : (teamAPlayerIds.length >= 5);
      const isTeamB5 = !isTargetTeamA ? (newPlayerCount >= 5) : (teamBPlayerIds.length >= 5);
      const isBoth5 = isTeamA5 && isTeamB5;
      const nextMatchStatus: MatchStatus = isBoth5 ? 'READY_CHECK' : 'TEAM_ROSTERS_FILLING';

      const matchUpdates: Partial<Match> = {
        ...(isTargetTeamA
          ? {
              teamAPlayerIds: nextPlayerIds,
              teamAPlayers: nextSnapshots,
              teamAAvgRating: newAvgRating,
              playersNeeded: playersNeededAfter,
            }
          : {
              teamBPlayerIds: nextPlayerIds,
              teamBPlayers: nextSnapshots,
              teamBAvgRating: newAvgRating,
            }),
        status: nextMatchStatus,
        isRecruiting: !isBoth5,
        recruitmentStatus: isBoth5 ? 'FULL' : 'ACTIVE',
        updatedAt: now,
      };

      tx.update(matchRef, sanitizeFirestoreData(matchUpdates));

      // 4. NOTE: Permanent squad roster in teams/{teamId} is deliberately preserved.
      // Joining a temporary 5v5 match lobby NEVER alters persistent squad membership.

      // 5. Update Recruitment Document if it exists
      if (recDoc.exists()) {
        const recruitmentUpdates: Partial<LobbyRecruitment> = {
          currentActivePlayers: newPlayerCount,
          playersNeeded: playersNeededAfter,
          status: newPlayerCount >= 5 ? 'FULL' : 'ACTIVE',
          teamAvgRating: newAvgRating,
          playerIds: nextPlayerIds,
          updatedAt: now,
        };
        tx.update(recRef, sanitizeFirestoreData(recruitmentUpdates));
      }

      updatedMatchData = {
        ...match,
        ...matchUpdates,
      } as Match;

      // Update player active5v5LobbyId pointer
      tx.set(
        doc(db, 'players', authUid),
        sanitizeFirestoreData({ active5v5LobbyId: matchId }),
        { merge: true }
      );
    });

    // If idempotent early return (player was already in lobby)
    if (updatedMatchData && !captainToNotify) {
      return { success: true, match: updatedMatchData };
    }

    // Notify Captain
    if (captainToNotify) {
      if (isFullAfterJoin) {
        await sendNotification({
          userId: captainToNotify,
          type: 'TEAM_INVITE_ACCEPTED',
          title: '5v5 Squad Complete! 🏆',
          message: `${player.gamerTag} joined! Your 5v5 roster is now full (5/5 players). Ready to find opponents!`,
          data: { matchId, lobbyCode: lobbyCodeJoined },
        });
      } else {
        await sendNotification({
          userId: captainToNotify,
          type: 'TEAM_INVITE_ACCEPTED',
          title: 'Player Joined 5v5 Squad! 📢',
          message: `${player.gamerTag} joined your 5v5 squad from Arena recruitment! (${newPlayerCount}/5 players - Need ${playersNeededAfter} more).`,
          data: { matchId, lobbyCode: lobbyCodeJoined },
        });
      }
    }

    // Notify Player
    await sendNotification({
      userId: player.uid,
      type: 'TEAM_INVITE_ACCEPTED',
      title: 'Joined 5v5 Squad! 🎮',
      message: `You successfully joined ${teamNameJoined} [${teamTagJoined}] for 5v5 Lobby ${lobbyCodeJoined}!`,
      data: { matchId, lobbyCode: lobbyCodeJoined },
    });

    await logAuditEvent({
      action: 'PLAYER_JOINED_LOBBY_RECRUITMENT',
      actorId: player.uid,
      actorName: player.gamerTag || 'Player',
      targetType: 'match',
      targetId: matchId,
      details: `${player.gamerTag} joined 5v5 squad ${teamNameJoined} via public recruitment. Roster is now ${newPlayerCount}/5.`,
      gameId: updatedMatchData?.gameId || '',
      lobbyId: matchId,
    });

    return { success: true, match: updatedMatchData || undefined };
  } catch (err: any) {
    console.error('Failed to join lobby recruitment:', err);
    return { success: false, error: err.message || 'Failed to join lobby.' };
  }
}

/**
 * Join team/lobby directly from recruitment announcement card
 * Supports both announcements with or without active match lobby
 */
export async function joinTeamRecruitment(params: {
  recruitmentId: string;
  player: Player;
}): Promise<{ success: boolean; match?: Match; team?: Team; error?: string }> {
  try {
    const { recruitmentId, player } = params;
    const recRef = doc(db, 'lobbyRecruitments', recruitmentId);
    const recSnap = await getDoc(recRef);

    if (!recSnap.exists()) {
      return { success: false, error: 'Recruitment announcement no longer exists.' };
    }

    const rec = recSnap.data() as LobbyRecruitment;

    if (rec.status !== 'ACTIVE') {
      return { success: false, error: 'This squad is no longer accepting new members.' };
    }

    // If this recruitment is linked to a match lobby, verify match status
    if (rec.lobbyId) {
      const matchRef = doc(db, 'matches', rec.lobbyId);
      const matchSnap = await getDoc(matchRef);

      if (matchSnap.exists()) {
        const matchData = matchSnap.data() as Match;
        const CLOSED_STATUSES: MatchStatus[] = [
          'READY_CHECK',
          'WAITING_FOR_ADMIN',
          'APPROVED',
          'LIVE',
          'AWAITING_RESULTS',
          'AWAITING_CONFIRMATION',
          'PENDING_ADMIN_APPROVAL',
          'PENDING_ADMIN_REVIEW',
          'COMPLETED',
          'CONFIRMED',
          'CANCELLED',
          'REJECTED',
          'DISPUTED',
        ];

        if (CLOSED_STATUSES.includes(matchData.status)) {
          // Linked match is already finished or started: mark recruitment stale
          try {
            await updateDoc(recRef, sanitizeFirestoreData({
              status: 'IN_LOBBY',
              updatedAt: Date.now(),
            }));
          } catch (_) {}

          if (!rec.teamId) {
            return {
              success: false,
              error: 'This 5v5 match is no longer accepting players (match in progress or closed).',
            };
          }
          // If rec.teamId exists, proceed below to join persistent team squad!
        } else {
          // Open 5v5 lobby: join match
          const res = await joinLobbyRecruitment({
            matchId: rec.lobbyId,
            player,
            teamSide: rec.teamSide || (rec.teamId && rec.teamId === matchData.teamBId ? 'teamB' : 'teamA'),
          });
          return res;
        }
      }
    }

    // Otherwise, join the team directly
    const teamRef = doc(db, 'teams', rec.teamId);
    let updatedTeamData: Team | null = null;
    let wasAlreadyMember = false;
    let isFullAfterJoin = false;
    let newPlayerCount = 0;
    let playersNeededAfter = 0;
    const now = Date.now();

    await runTransaction(db, async (tx) => {
      const teamDoc = await tx.get(teamRef);
      if (!teamDoc.exists()) {
        throw new Error('Team squad no longer exists.');
      }
      const team = teamDoc.data() as Team;

      if (team.memberIds.includes(player.uid)) {
        // Player is already in the squad - return cleanly
        wasAlreadyMember = true;
        updatedTeamData = team;
        return;
      }

      if (team.memberIds.length >= 5) {
        throw new Error('Team squad roster is already full (5/5 players).');
      }

      const nextMemberIds = [...team.memberIds, player.uid];
      newPlayerCount = nextMemberIds.length;
      playersNeededAfter = Math.max(0, 5 - newPlayerCount);
      isFullAfterJoin = newPlayerCount >= 5;

      const gameKey = (team.gameId || '').toLowerCase().trim();
      const inGameName = player.inGameNames?.[gameKey] || player.inGameName || player.gamerTag;

      const newMemberSnapshot = {
        id: player.uid,
        gamerTag: player.gamerTag || 'Player',
        fullName: player.fullName || player.gamerTag || 'Player',
        rating: player.overallRating || 1000,
        role: 'member' as const,
        joinedAt: now,
        inGameName,
      };

      const nextMembers = [...(team.members || []).filter((m) => m.id !== player.uid), newMemberSnapshot];
      const sumRatings = nextMembers.reduce((acc, m) => acc + (m.rating || 1000), 0);
      const newAvgRating = Math.round(sumRatings / newPlayerCount);

      const teamUpdates: Partial<Team> = {
        memberIds: nextMemberIds,
        members: nextMembers,
        teamRating: newAvgRating,
        updatedAt: now,
      };

      tx.update(teamRef, sanitizeFirestoreData(teamUpdates));

      // Update recruitment doc
      const recUpdates: Partial<LobbyRecruitment> = {
        currentActivePlayers: newPlayerCount,
        playersNeeded: playersNeededAfter,
        status: isFullAfterJoin ? 'FULL' : 'ACTIVE',
        playerIds: nextMemberIds,
        updatedAt: now,
      };

      tx.update(recRef, sanitizeFirestoreData(recUpdates));

      updatedTeamData = {
        ...team,
        ...teamUpdates,
      } as Team;
    });

    if (wasAlreadyMember && updatedTeamData) {
      return { success: true, team: updatedTeamData };
    }

    // Notify captain
    if (rec.captainId) {
      await sendNotification({
        userId: rec.captainId,
        type: 'TEAM_INVITE_ACCEPTED',
        title: isFullAfterJoin ? '5v5 Squad Complete! 🏆' : 'Player Joined Squad! 📢',
        message: `${player.gamerTag} joined ${rec.teamName} from Arena recruitment! (${newPlayerCount}/5 players - ${isFullAfterJoin ? 'Ready to play!' : `Need ${playersNeededAfter} more`}).`,
        data: { teamId: rec.teamId },
      });
    }

    // Notify player
    await sendNotification({
      userId: player.uid,
      type: 'TEAM_INVITE_ACCEPTED',
      title: 'Joined 5v5 Squad! 🎮',
      message: `You successfully joined ${rec.teamName} [${rec.teamTag}]!`,
      data: { teamId: rec.teamId },
    });

    await logAuditEvent({
      action: 'PLAYER_JOINED_TEAM_RECRUITMENT',
      actorId: player.uid,
      actorName: player.gamerTag || 'Player',
      targetType: 'team',
      targetId: rec.teamId,
      details: `${player.gamerTag} joined squad ${rec.teamName} via Arena recruitment. Roster is now ${newPlayerCount}/5.`,
      gameId: rec.gameId,
      teamId: rec.teamId,
    });

    return { success: true, team: updatedTeamData || undefined };
  } catch (err: any) {
    console.error('Failed to join team recruitment:', err);
    return { success: false, error: err.message || 'Failed to join squad.' };
  }
}

/**
 * Real-time subscription to active 5v5 lobby recruitments
 * Updates instantly on the Main Page / Arena without refreshing.
 * Strictly guarantees ONE active announcement per team!
 */
export function subscribeToActiveRecruitments(
  callback: (recruitments: LobbyRecruitment[]) => void
): () => void {
  const recRef = collection(db, 'lobbyRecruitments');
  const q = query(recRef, where('status', '==', 'ACTIVE'));

  return onSnapshot(
    q,
    (snap) => {
      const mapByTeam = new Map<string, LobbyRecruitment>();
      const listWithoutTeam: LobbyRecruitment[] = [];

      snap.docs.forEach((d) => {
        const r = { id: d.id, ...d.data() } as LobbyRecruitment;
        const needed = r.playersNeeded ?? Math.max(0, 5 - (r.currentActivePlayers || (r.playerIds?.length || 1)));
        if (r.status === 'ACTIVE' && needed > 0) {
          const canonicalKey = (r.lobbyId || (r as any).matchId || r.teamId || r.captainId || r.id).trim().toLowerCase();
          const existing = mapByTeam.get(canonicalKey);
          if (!existing || (r.updatedAt || 0) > (existing.updatedAt || 0)) {
            mapByTeam.set(canonicalKey, r);
          }
        }
      });

      const uniqueList = Array.from(mapByTeam.values()).sort(
        (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)
      );

      callback(uniqueList);
    },
    (err) => {
      console.error('Error subscribing to active recruitments:', err);
      callback([]);
    }
  );
}

/**
 * Synchronize recruitment announcement status when roster changes (e.g. invite accepted, member removed)
 * Dynamic count: playersNeeded = 5 - actualActivePlayers
 * If count reaches 5: status becomes FULL (closes automatically)
 * If count < 5 and recruitment exists: updates playersNeeded and reopens if was FULL
 */
export async function syncTeamRecruitmentRoster(
  teamId: string,
  updatedMemberIds: string[]
): Promise<void> {
  try {
    const currentCount = updatedMemberIds.length;
    const playersNeeded = Math.max(0, 5 - currentCount);
    const now = Date.now();

    // 1. Sync lobbyRecruitments collection
    const qRec = query(collection(db, 'lobbyRecruitments'), where('teamId', '==', teamId));
    const snapRec = await getDocs(qRec);

    for (const d of snapRec.docs) {
      const rec = d.data() as LobbyRecruitment;
      let nextStatus = rec.status;
      if (currentCount >= 5) {
        nextStatus = 'FULL';
      } else if (rec.status === 'FULL' && currentCount < 5) {
        nextStatus = 'ACTIVE';
      }

      await updateDoc(
        d.ref,
        sanitizeFirestoreData({
          currentActivePlayers: currentCount,
          playersNeeded,
          status: nextStatus,
          playerIds: updatedMemberIds,
          updatedAt: now,
        })
      );
    }

    // 2. Sync any active 5v5 matches for this team
    const qMatch = query(
      collection(db, 'matches'),
      where('teamAId', '==', teamId),
      where('matchType', '==', '5v5')
    );
    const snapMatch = await getDocs(qMatch);
    const openStatuses: MatchStatus[] = ['WAITING_FOR_OPPONENT', 'OPPONENT_JOINED', 'TEAM_ROSTERS_FILLING', 'PENDING'];
    const waitingMatches = snapMatch.docs.filter((d) => openStatuses.includes((d.data() as Match).status));

    for (const mDoc of waitingMatches) {
      const isRecruiting = playersNeeded > 0;
      const recStatus = currentCount >= 5 ? 'FULL' : isRecruiting ? 'ACTIVE' : undefined;

      await updateDoc(
        mDoc.ref,
        sanitizeFirestoreData({
          teamAPlayerIds: updatedMemberIds,
          playersNeeded,
          isRecruiting,
          recruitmentStatus: recStatus,
          updatedAt: now,
        })
      );
    }
  } catch (err) {
    console.warn('Failed to sync team recruitment roster:', err);
  }
}

/**
 * Synchronize recruitment status when a player leaves or is removed from a team/lobby
 * Automatically reactivates announcement if playersNeeded > 0
 */
export async function syncLobbyRecruitmentOnRosterChange(
  matchId: string,
  updatedPlayerIds: string[]
): Promise<void> {
  try {
    const matchRef = doc(db, 'matches', matchId);
    const matchSnap = await getDoc(matchRef);
    if (!matchSnap.exists()) return;

    const match = matchSnap.data() as Match;
    if (match.matchType !== '5v5') return;

    const currentCount = updatedPlayerIds.length;
    const playersNeeded = Math.max(0, 5 - currentCount);
    const openStatuses: MatchStatus[] = ['WAITING_FOR_OPPONENT', 'OPPONENT_JOINED', 'TEAM_ROSTERS_FILLING', 'PENDING'];
    const isRecruiting = playersNeeded > 0 && openStatuses.includes(match.status);
    const status: RecruitmentStatus = isRecruiting ? 'ACTIVE' : currentCount >= 5 ? 'FULL' : 'IN_LOBBY';

    const now = Date.now();

    await updateDoc(
      matchRef,
      sanitizeFirestoreData({
        teamAPlayerIds: updatedPlayerIds,
        playersNeeded,
        isRecruiting,
        recruitmentStatus: status,
        updatedAt: now,
      })
    );

    const recRef = doc(db, 'lobbyRecruitments', matchId);
    await setDoc(
      recRef,
      sanitizeFirestoreData({
        currentActivePlayers: currentCount,
        playersNeeded,
        status,
        playerIds: updatedPlayerIds,
        updatedAt: now,
      }),
      { merge: true }
    );
  } catch (err) {
    console.warn('Failed to sync recruitment on roster change:', err);
  }
}
