import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  limit,
  runTransaction,
  arrayUnion,
  QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { Team, TeamMember, TeamHistoryEvent, Player, Match, TeamInvitation, TeamTournamentRegistration, MatchStatus } from '../types';
import { sanitizeFirestoreData, getPlayerActive5v5Lobby, notifyAdminsMatchNeedsApproval, verifyAdminAuthority } from './matchService';
import { sendNotification, sendBulkNotification, updateMatchInvitationNotificationsActioned } from './notificationService';
import { logAuditEvent } from './auditService';
import { normalizeInvitationStatus } from '../utils/tournamentTeamStatus';
import { syncTeamRecruitmentRoster } from './recruitmentService';
import {
  calculateInvitationExpiresAt,
  isInvitationExpired,
  INVITATION_EXPIRATION_MS,
} from '../utils/invitationExpiration';

const PROFANITY_BLOCKLIST = [
  'nigger', 'nigga', 'faggot', 'fag', 'cunt', 'whore', 'slut', 'kike', 'chink',
  'hitler', 'nazi', 'terrorist', 'isis', 'pedophile'
];

export function validateTeamName(name: string): { valid: boolean; error?: string } {
  const trimmed = name?.trim() || '';
  if (trimmed.length < 2 || trimmed.length > 30) {
    return { valid: false, error: 'Team name must be between 2 and 30 characters.' };
  }
  const lower = trimmed.toLowerCase();
  for (const banned of PROFANITY_BLOCKLIST) {
    if (lower.includes(banned)) {
      return { valid: false, error: 'Team name contains inappropriate or offensive content.' };
    }
  }
  return { valid: true };
}

export function validateTeamTag(tag: string): { valid: boolean; error?: string } {
  const trimmed = tag?.trim().toUpperCase() || '';
  if (trimmed.length < 2 || trimmed.length > 5) {
    return { valid: false, error: 'Team tag must be between 2 and 5 characters.' };
  }
  if (!/^[A-Z0-9]+$/.test(trimmed)) {
    return { valid: false, error: 'Team tag must contain alphanumeric characters only.' };
  }
  const lower = trimmed.toLowerCase();
  for (const banned of PROFANITY_BLOCKLIST) {
    if (lower.includes(banned)) {
      return { valid: false, error: 'Team tag contains inappropriate content.' };
    }
  }
  return { valid: true };
}

export interface CreateTeamParams {
  teamName: string;
  teamTag: string;
  gameId: 'valorant' | 'cs2' | string;
  gameName?: string;
  captain: Player;
  teamLogo?: string;
}

/**
 * Creates a new Team with the creator as Captain.
 * Enforces unique team name and team tag for that specific game.
 */
export async function createTeam(params: CreateTeamParams): Promise<{ success: boolean; team?: Team; error?: string }> {
  try {
    const { teamName, teamTag, gameId, captain, teamLogo } = params;

    const nameValidation = validateTeamName(teamName);
    if (!nameValidation.valid) {
      return { success: false, error: nameValidation.error };
    }

    const tagValidation = validateTeamTag(teamTag);
    if (!tagValidation.valid) {
      return { success: false, error: tagValidation.error };
    }

    const normalizedGameId = gameId.toLowerCase();
    const gameName = params.gameName || (normalizedGameId === 'valorant' ? 'Valorant' : normalizedGameId === 'cs2' ? 'CS2' : gameId);

    const nameLower = teamName.trim().toLowerCase();
    const tagUpper = teamTag.trim().toUpperCase();
    const tagLower = tagUpper.toLowerCase();

    // Check for duplicate teamName or teamTag in the same game
    const teamsRef = collection(db, 'teams');
    const existingNameQ = query(
      teamsRef,
      where('gameId', '==', normalizedGameId),
      where('teamNameLower', '==', nameLower),
      where('status', '==', 'active')
    );
    const nameSnap = await getDocs(existingNameQ);
    if (!nameSnap.empty) {
      return { success: false, error: `A ${gameName} team named "${teamName.trim()}" already exists.` };
    }

    const existingTagQ = query(
      teamsRef,
      where('gameId', '==', normalizedGameId),
      where('teamTagLower', '==', tagLower),
      where('status', '==', 'active')
    );
    const tagSnap = await getDocs(existingTagQ);
    if (!tagSnap.empty) {
      return { success: false, error: `A ${gameName} team with tag [${tagUpper}] already exists.` };
    }

    // Check if captain is already in an active team for this game
    const captainTeamQ = query(
      teamsRef,
      where('gameId', '==', normalizedGameId),
      where('memberIds', 'array-contains', captain.uid),
      where('status', '==', 'active')
    );
    const captainTeamSnap = await getDocs(captainTeamQ);
    if (!captainTeamSnap.empty) {
      return { success: false, error: `You are already a member of a ${gameName} team.` };
    }

    const teamId = `team_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = Date.now();

    const captainMember: TeamMember = {
      id: captain.uid,
      gamerTag: captain.gamerTag,
      fullName: captain.fullName,
      rating: captain.overallRating || 1000,
      role: 'captain',
      joinedAt: now,
    };

    const newTeam: Team = {
      teamId,
      teamName: teamName.trim(),
      teamNameLower: nameLower,
      teamTag: tagUpper,
      teamTagLower: tagLower,
      teamLogo: teamLogo || '🛡️',
      gameId: normalizedGameId,
      gameName,
      captainId: captain.uid,
      captainName: captain.fullName,
      captainGamerTag: captain.gamerTag,
      memberIds: [captain.uid],
      members: [captainMember],
      pastMembers: [],
      squadHistory: [
        {
          id: `hist_${now}_${Math.random().toString(36).substring(2, 7)}`,
          action: 'CREATED',
          details: `Squad founded by Captain ${captain.gamerTag}`,
          timestamp: now,
          actorId: captain.uid,
          actorName: captain.gamerTag,
        },
      ],
      createdAt: now,
      updatedAt: now,
      status: 'active',
      teamRating: captain.overallRating || 1000,
      wins: 0,
      losses: 0,
      draws: 0,
      matchesPlayed: 0,
      winRate: 0,
      currentWinStreak: 0,
      bestWinStreak: 0,
    };

    await setDoc(doc(db, 'teams', teamId), sanitizeFirestoreData(newTeam));

    await logAuditEvent({
      action: 'TEAM_CREATED',
      actorId: captain.uid,
      actorName: captain.gamerTag,
      targetType: 'team',
      targetId: teamId,
      details: `Created team ${newTeam.teamName} [${newTeam.teamTag}] for ${gameName}`,
      gameId: normalizedGameId,
      teamId,
    });

    return { success: true, team: newTeam };
  } catch (err: any) {
    console.error('Failed to create team:', err);
    return { success: false, error: err.message || 'Team creation failed.' };
  }
}

/**
 * Send an invitation to a player to join a team
 */
export async function sendTeamInvitation(params: {
  teamId: string;
  captainId: string;
  captainGamerTag: string;
  invitedPlayer: Player;
  lobbyId?: string;
}): Promise<{ success: boolean; invitationId?: string; error?: string }> {
  try {
    const { teamId, captainId, captainGamerTag, invitedPlayer, lobbyId } = params;

    // Self-invite / self-opponent prevention
    const authUid = (auth.currentUser?.uid || '').trim();
    const recipientUid = (invitedPlayer?.uid || (invitedPlayer as any)?.id || '').trim();
    if ((authUid && recipientUid === authUid) || (captainId && recipientUid === captainId.trim())) {
      return { success: false, error: 'You cannot select yourself as an opponent or invite yourself.' };
    }

    const teamRef = doc(db, 'teams', teamId);
    const teamSnap = await getDoc(teamRef);

    if (!teamSnap.exists()) {
      return { success: false, error: 'Team not found.' };
    }

    const team = teamSnap.data() as Team;

    const isCaptain =
      team.captainId === captainId ||
      team.members?.some((m) => m.id === captainId && m.role === 'captain');

    if (!isCaptain) {
      return { success: false, error: 'Only the team captain can invite players.' };
    }

    if (team.memberIds.length >= 5) {
      return { success: false, error: 'Team roster is full (5/5 players).' };
    }

    if (team.memberIds.includes(invitedPlayer.uid)) {
      return { success: false, error: `${invitedPlayer.gamerTag} is already an active member of this team.` };
    }

    // Check if player already has a pending invitation for this team
    const invQ = query(
      collection(db, 'teamInvitations'),
      where('teamId', '==', teamId),
      where('invitedPlayerId', '==', invitedPlayer.uid)
    );
    const invSnap = await getDocs(invQ);
    const hasPending = invSnap.docs.some(
      (d) => normalizeInvitationStatus((d.data() as TeamInvitation).status) === 'PENDING'
    );
    if (hasPending) {
      return { success: false, error: `An invitation is already pending for ${invitedPlayer.gamerTag}.` };
    }

    // Check if player is in another active team for this game
    const teamsRef = collection(db, 'teams');
    const existingTeamQ = query(
      teamsRef,
      where('gameId', '==', team.gameId),
      where('memberIds', 'array-contains', invitedPlayer.uid),
      where('status', '==', 'active')
    );
    const existingSnap = await getDocs(existingTeamQ);
    if (!existingSnap.empty) {
      return { success: false, error: `${invitedPlayer.gamerTag} is already a member of another ${team.gameName} team.` };
    }

    const inviteId = `inv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = Date.now();
    const expiresAt = calculateInvitationExpiresAt(now);

    const invitation: TeamInvitation = {
      id: inviteId,
      teamId: team.teamId,
      teamName: team.teamName,
      teamTag: team.teamTag,
      teamLogo: team.teamLogo,
      gameId: team.gameId,
      gameName: team.gameName,
      captainId,
      senderId: captainId,
      captainGamerTag,
      invitedPlayerId: invitedPlayer.uid,
      recipientId: invitedPlayer.uid,
      invitedGamerTag: invitedPlayer.gamerTag,
      invitedPlayerGamerTag: invitedPlayer.gamerTag,
      status: 'PENDING',
      createdAt: now,
      expiresAt,
      updatedAt: now,
    };

    if (lobbyId) {
      (invitation as any).lobbyId = lobbyId;
    }

    await setDoc(doc(db, 'teamInvitations', inviteId), sanitizeFirestoreData(invitation));

    await sendNotification({
      userId: invitedPlayer.uid,
      type: 'TEAM_INVITE',
      title: 'Squad Invitation 🎮',
      message: `${captainGamerTag} invited you to join ${team.teamName} [${team.teamTag}] for ${team.gameName} 5v5!`,
      status: 'PENDING',
      expiresAt,
      data: {
        teamId: team.teamId,
        teamName: team.teamName,
        teamTag: team.teamTag,
        invitationId: inviteId,
        expiresAt,
        lobbyId,
      },
    });

    await logAuditEvent({
      action: 'PLAYER_INVITED',
      actorId: captainId,
      actorName: captainGamerTag,
      targetType: 'team',
      targetId: teamId,
      details: `Invited ${invitedPlayer.gamerTag} to join team ${team.teamName}`,
      gameId: team.gameId,
      teamId,
    });

    return { success: true, invitationId: inviteId };
  } catch (err: any) {
    console.error('Error sending team invite:', err);
    return { success: false, error: err.message || 'Failed to send invite.' };
  }
}

/**
 * Cancel a pending team invitation (Captain only)
 * Resets invitation to CANCELLED and notifies the player
 */
export async function cancelTeamInvitation(params: {
  invitationId: string;
  captainId: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { invitationId, captainId } = params;
    const invRef = doc(db, 'teamInvitations', invitationId);
    const invSnap = await getDoc(invRef);

    if (!invSnap.exists()) {
      return { success: false, error: 'Invitation not found.' };
    }

    const inv = invSnap.data() as TeamInvitation;

    if (inv.captainId !== captainId && inv.senderId !== captainId) {
      return { success: false, error: 'Only the team captain can cancel this invitation.' };
    }

    if (normalizeInvitationStatus(inv.status) !== 'PENDING') {
      return { success: false, error: 'Only pending invitations can be cancelled.' };
    }

    const now = Date.now();
    await updateDoc(invRef, {
      status: 'CANCELLED',
      cancelledBy: captainId,
      cancelledAt: now,
      updatedAt: now,
    });

    const targetUid = inv.recipientId || inv.invitedPlayerId;
    if (targetUid) {
      await sendNotification({
        userId: targetUid,
        type: 'TEAM_INVITE_DECLINED',
        title: 'Invitation Cancelled',
        message: `The invitation to join ${inv.teamName} [${inv.teamTag}] was cancelled by Captain ${inv.captainGamerTag || 'Captain'}.`,
        data: { teamId: inv.teamId, teamName: inv.teamName },
      });
    }

    await logAuditEvent({
      action: 'TEAM_INVITATION_CANCELLED',
      actorId: captainId,
      actorName: inv.captainGamerTag || 'Captain',
      targetType: 'team',
      targetId: inv.teamId,
      details: `Captain cancelled pending invitation for player ${inv.invitedGamerTag || targetUid}`,
      teamId: inv.teamId,
    });

    return { success: true };
  } catch (err: any) {
    console.error('Failed to cancel team invitation:', err);
    return { success: false, error: err.message || 'Failed to cancel invitation.' };
  }
}

/**
 * Real-time subscription to a team's invitations
 */
export function subscribeToTeamInvitations(
  teamId: string,
  callback: (invitations: TeamInvitation[]) => void
): () => void {
  if (!teamId) {
    callback([]);
    return () => {};
  }

  const q = query(collection(db, 'teamInvitations'), where('teamId', '==', teamId));

  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as TeamInvitation))
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      callback(list);
    },
    (err) => {
      console.warn('Error subscribing to team invitations:', err);
      callback([]);
    }
  );
}

/**
 * Add / Direct Invite a player to a team (Captain only, Max 5 active players)
 */
export async function addMemberToTeam(params: {
  teamId: string;
  captainId: string;
  player: Player;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { teamId, captainId, player } = params;

    // Self-add prevention
    const authUid = (auth.currentUser?.uid || '').trim();
    const playerUid = (player?.uid || (player as any)?.id || '').trim();
    if ((authUid && playerUid === authUid) || (captainId && playerUid === captainId.trim())) {
      return { success: false, error: 'You cannot add yourself to your own squad.' };
    }

    const teamRef = doc(db, 'teams', teamId);
    const teamSnap = await getDoc(teamRef);

    if (!teamSnap.exists()) {
      return { success: false, error: 'Team not found.' };
    }

    const team = teamSnap.data() as Team;

    if (team.status !== 'active') {
      return { success: false, error: 'Team is no longer active.' };
    }

    if (team.captainId !== captainId) {
      return { success: false, error: 'Only the team captain can invite or add members.' };
    }

    if (team.memberIds.length >= 5) {
      return { success: false, error: 'Team roster is full (maximum 5 active players).' };
    }

    if (team.memberIds.includes(player.uid)) {
      return { success: false, error: `${player.gamerTag} is already on this team.` };
    }

    // Check if player is already in another team for the same game
    const teamsRef = collection(db, 'teams');
    const existingTeamQ = query(
      teamsRef,
      where('gameId', '==', team.gameId),
      where('memberIds', 'array-contains', player.uid),
      where('status', '==', 'active')
    );
    const existingSnap = await getDocs(existingTeamQ);
    if (!existingSnap.empty) {
      return { success: false, error: `${player.gamerTag} is already a member of another ${team.gameName} team.` };
    }

    const now = Date.now();
    const newMember: TeamMember = {
      id: player.uid,
      gamerTag: player.gamerTag,
      fullName: player.fullName,
      rating: player.overallRating || 1000,
      role: 'member',
      joinedAt: now,
    };

    const updatedMemberIds = [...team.memberIds, player.uid];
    const updatedMembers = [...team.members, newMember];

    // If team has 0 matches played, recompute baseline teamRating as average of members
    let newTeamRating = team.teamRating;
    if (team.matchesPlayed === 0) {
      const sumRatings = updatedMembers.reduce((acc, m) => acc + (m.rating || 1000), 0);
      newTeamRating = Math.round(sumRatings / updatedMembers.length);
    }

    const historyEvent: TeamHistoryEvent = {
      id: `hist_${now}_${Math.random().toString(36).substring(2, 7)}`,
      action: 'MEMBER_ADDED',
      details: `Captain ${team.captainGamerTag} added ${player.gamerTag} to active roster`,
      timestamp: now,
      actorId: captainId,
      actorName: team.captainGamerTag,
    };
    const updatedSquadHistory = [...(team.squadHistory || []), historyEvent];

    await updateDoc(
      teamRef,
      sanitizeFirestoreData({
        memberIds: updatedMemberIds,
        members: updatedMembers,
        squadHistory: updatedSquadHistory,
        teamRating: newTeamRating,
        updatedAt: now,
      })
    );

    // Sync recruitment announcement and open 5v5 lobby roster
    await syncTeamRecruitmentRoster(team.teamId, updatedMemberIds);

    // Notify new member and team
    await sendNotification({
      userId: player.uid,
      type: 'TEAM_INVITE_ACCEPTED',
      title: 'Joined Squad',
      message: `You are now an active member of ${team.teamName} [${team.teamTag}] for ${team.gameName}!`,
      data: { teamId: team.teamId, teamName: team.teamName },
    });

    await logAuditEvent({
      action: 'PLAYER_JOINED',
      actorId: captainId,
      actorName: team.captainGamerTag,
      targetType: 'team',
      targetId: teamId,
      details: `Added ${player.gamerTag} to team ${team.teamName}`,
      gameId: team.gameId,
      teamId,
    });

    return { success: true };
  } catch (err: any) {
    console.error('Failed to add member to team:', err);
    return { success: false, error: err.message || 'Failed to add player to team.' };
  }
}

/**
 * Remove a member from a team (Captain only, cannot remove captain)
 */
export async function removeMemberFromTeam(params: {
  teamId: string;
  captainId: string;
  memberIdToRemove: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { teamId, captainId, memberIdToRemove } = params;
    const teamRef = doc(db, 'teams', teamId);
    const teamSnap = await getDoc(teamRef);

    if (!teamSnap.exists()) {
      return { success: false, error: 'Team not found.' };
    }

    const team = teamSnap.data() as Team;

    if (team.captainId !== captainId) {
      return { success: false, error: 'Only the team captain can remove team members.' };
    }

    if (memberIdToRemove === team.captainId) {
      return { success: false, error: 'The captain cannot be kicked. You can transfer captaincy or disband the team.' };
    }

    const removedMember = team.members.find((m) => m.id === memberIdToRemove);
    const removedGamerTag = removedMember?.gamerTag || 'Player';

    const now = Date.now();
    const updatedMemberIds = team.memberIds.filter((id) => id !== memberIdToRemove);
    const updatedMembers = team.members.filter((m) => m.id !== memberIdToRemove);

    const archivedMember: TeamMember = {
      ...(removedMember || {
        id: memberIdToRemove,
        gamerTag: removedGamerTag,
        role: 'member',
        joinedAt: now,
      }),
      leftAt: now,
      removedAt: now,
      reason: 'removed',
    };
    const updatedPastMembers = [
      ...(team.pastMembers || []).filter((m) => m.id !== memberIdToRemove),
      archivedMember,
    ];

    // If team has 0 matches played, recompute baseline teamRating as average of remaining members
    let newTeamRating = team.teamRating;
    if (team.matchesPlayed === 0 && updatedMembers.length > 0) {
      const sumRatings = updatedMembers.reduce((acc, m) => acc + (m.rating || 1000), 0);
      newTeamRating = Math.round(sumRatings / updatedMembers.length);
    }

    const historyEvent: TeamHistoryEvent = {
      id: `hist_${now}_${Math.random().toString(36).substring(2, 7)}`,
      action: 'MEMBER_REMOVED',
      details: `Captain ${team.captainGamerTag} removed ${removedGamerTag} from active roster`,
      timestamp: now,
      actorId: captainId,
      actorName: team.captainGamerTag,
    };
    const updatedSquadHistory = [...(team.squadHistory || []), historyEvent];

    await updateDoc(
      teamRef,
      sanitizeFirestoreData({
        memberIds: updatedMemberIds,
        members: updatedMembers,
        pastMembers: updatedPastMembers,
        squadHistory: updatedSquadHistory,
        teamRating: newTeamRating,
        updatedAt: now,
      })
    );

    // Sync recruitment announcement and open 5v5 lobby roster
    await syncTeamRecruitmentRoster(team.teamId, updatedMemberIds);

    // Notify the removed member
    await sendNotification({
      userId: memberIdToRemove,
      type: 'PLAYER_REMOVED',
      title: 'Removed From Squad',
      message: `You were removed from ${team.teamName} [${team.teamTag}] by Captain ${team.captainGamerTag}.`,
      data: { teamId: team.teamId, teamName: team.teamName },
    });

    // Notify remaining team members
    await sendBulkNotification({
      userIds: updatedMemberIds.filter((id) => id !== captainId),
      type: 'PLAYER_REMOVED',
      title: 'Roster Update',
      message: `${removedGamerTag} was removed from ${team.teamName}. Roster is now ${updatedMembers.length}/5.`,
      data: { teamId: team.teamId, teamName: team.teamName },
    });

    await logAuditEvent({
      action: 'PLAYER_REMOVED',
      actorId: captainId,
      actorName: team.captainGamerTag,
      targetType: 'team',
      targetId: teamId,
      details: `Removed ${removedGamerTag} from team ${team.teamName}`,
      gameId: team.gameId,
      teamId,
    });

    return { success: true };
  } catch (err: any) {
    console.error('Failed to remove member from team:', err);
    return { success: false, error: err.message || 'Failed to remove member.' };
  }
}

/**
 * Replace a squad member with a new player (Captain only)
 * The removed member leaves the active roster and is preserved in pastMembers.
 * The replacement player becomes an active member.
 */
export async function replaceTeamMember(params: {
  teamId: string;
  captainId: string;
  memberIdToReplace: string;
  newPlayer: Player;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { teamId, captainId, memberIdToReplace, newPlayer } = params;
    const teamRef = doc(db, 'teams', teamId);
    const teamSnap = await getDoc(teamRef);

    if (!teamSnap.exists()) {
      return { success: false, error: 'Team not found.' };
    }

    const team = teamSnap.data() as Team;

    if (team.captainId !== captainId) {
      return { success: false, error: 'Only the squad captain can replace squad members.' };
    }

    if (memberIdToReplace === team.captainId) {
      return { success: false, error: 'The captain cannot be replaced. You can transfer captaincy or disband the squad.' };
    }

    if (team.memberIds.includes(newPlayer.uid)) {
      return { success: false, error: `${newPlayer.gamerTag} is already an active member of this squad.` };
    }

    // Check if newPlayer is in another active team for this game
    const teamsRef = collection(db, 'teams');
    const existingTeamQ = query(
      teamsRef,
      where('gameId', '==', team.gameId),
      where('memberIds', 'array-contains', newPlayer.uid),
      where('status', '==', 'active')
    );
    const existingSnap = await getDocs(existingTeamQ);
    if (!existingSnap.empty) {
      return { success: false, error: `${newPlayer.gamerTag} is already a member of another ${team.gameName} squad.` };
    }

    const removedMember = team.members.find((m) => m.id === memberIdToReplace);
    const removedGamerTag = removedMember?.gamerTag || 'Player';
    const now = Date.now();

    const gameKey = (team.gameId || '').toLowerCase().trim();
    const inGameName = newPlayer.inGameNames?.[gameKey] || newPlayer.inGameName || newPlayer.gamerTag;

    const newMember: TeamMember = {
      id: newPlayer.uid,
      gamerTag: newPlayer.gamerTag,
      fullName: newPlayer.fullName,
      rating: newPlayer.overallRating || 1000,
      role: 'member',
      joinedAt: now,
      inGameName,
    };

    const archivedMember: TeamMember = {
      ...(removedMember || {
        id: memberIdToReplace,
        gamerTag: removedGamerTag,
        role: 'member',
        joinedAt: now,
      }),
      leftAt: now,
      removedAt: now,
      reason: 'replaced',
      replacedByGamerTag: newPlayer.gamerTag,
    };

    const updatedMemberIds = [
      ...team.memberIds.filter((id) => id !== memberIdToReplace),
      newPlayer.uid,
    ];
    const updatedMembers = [
      ...team.members.filter((m) => m.id !== memberIdToReplace),
      newMember,
    ];
    const updatedPastMembers = [
      ...(team.pastMembers || []).filter((m) => m.id !== memberIdToReplace),
      archivedMember,
    ];

    let newTeamRating = team.teamRating;
    if (team.matchesPlayed === 0 && updatedMembers.length > 0) {
      const sumRatings = updatedMembers.reduce((acc, m) => acc + (m.rating || 1000), 0);
      newTeamRating = Math.round(sumRatings / updatedMembers.length);
    }

    const historyEvent: TeamHistoryEvent = {
      id: `hist_${now}_${Math.random().toString(36).substring(2, 7)}`,
      action: 'MEMBER_REPLACED',
      details: `Captain ${team.captainGamerTag} replaced ${removedGamerTag} with ${newPlayer.gamerTag}`,
      timestamp: now,
      actorId: captainId,
      actorName: team.captainGamerTag,
    };
    const updatedSquadHistory = [...(team.squadHistory || []), historyEvent];

    await updateDoc(
      teamRef,
      sanitizeFirestoreData({
        memberIds: updatedMemberIds,
        members: updatedMembers,
        pastMembers: updatedPastMembers,
        squadHistory: updatedSquadHistory,
        teamRating: newTeamRating,
        updatedAt: now,
      })
    );

    // Sync recruitment announcement if active
    await syncTeamRecruitmentRoster(team.teamId, updatedMemberIds);

    // Notifications
    await sendNotification({
      userId: memberIdToReplace,
      type: 'PLAYER_REMOVED',
      title: 'Squad Roster Update',
      message: `You were replaced by ${newPlayer.gamerTag} on ${team.teamName} [${team.teamTag}] by Captain ${team.captainGamerTag}.`,
      data: { teamId: team.teamId, teamName: team.teamName },
    });

    await sendNotification({
      userId: newPlayer.uid,
      type: 'TEAM_INVITE_ACCEPTED',
      title: 'Welcome to Squad',
      message: `You have been added to ${team.teamName} [${team.teamTag}] by Captain ${team.captainGamerTag}!`,
      data: { teamId: team.teamId, teamName: team.teamName },
    });

    await sendBulkNotification({
      userIds: updatedMemberIds.filter((id) => id !== captainId && id !== newPlayer.uid),
      type: 'PLAYER_REMOVED',
      title: 'Roster Update',
      message: `${removedGamerTag} was replaced by ${newPlayer.gamerTag} in ${team.teamName}.`,
      data: { teamId: team.teamId, teamName: team.teamName },
    });

    await logAuditEvent({
      action: 'PLAYER_REPLACED',
      actorId: captainId,
      actorName: team.captainGamerTag,
      targetType: 'team',
      targetId: teamId,
      details: `Replaced ${removedGamerTag} with ${newPlayer.gamerTag} on team ${team.teamName}`,
      gameId: team.gameId,
      teamId,
    });

    return { success: true };
  } catch (err: any) {
    console.error('Failed to replace team member:', err);
    return { success: false, error: err.message || 'Failed to replace member.' };
  }
}

/**
 * Update Squad Name and Tag (Captain only)
 * Keeps the same squadId and preserves all existing members and statistics.
 */
export async function updateSquadName(params: {
  teamId: string;
  captainId: string;
  newTeamName: string;
  newTeamTag?: string;
  newTeamLogo?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { teamId, captainId, newTeamName, newTeamTag, newTeamLogo } = params;
    const teamRef = doc(db, 'teams', teamId);
    const teamSnap = await getDoc(teamRef);

    if (!teamSnap.exists()) {
      return { success: false, error: 'Squad not found.' };
    }

    const team = teamSnap.data() as Team;

    if (team.captainId !== captainId) {
      return { success: false, error: 'Only the squad captain can update the squad name.' };
    }

    const nameValidation = validateTeamName(newTeamName);
    if (!nameValidation.valid) {
      return { success: false, error: nameValidation.error };
    }

    const trimmedName = newTeamName.trim();
    const nameLower = trimmedName.toLowerCase();

    // Check name uniqueness if changed
    if (nameLower !== team.teamNameLower) {
      const q = query(
        collection(db, 'teams'),
        where('gameId', '==', team.gameId),
        where('teamNameLower', '==', nameLower),
        where('status', '==', 'active')
      );
      const snap = await getDocs(q);
      const isTaken = snap.docs.some((d) => d.id !== teamId);
      if (isTaken) {
        return { success: false, error: `A squad named "${trimmedName}" already exists for this game.` };
      }
    }

    let tagUpper = team.teamTag;
    let tagLower = team.teamTagLower;
    if (newTeamTag && newTeamTag.trim()) {
      const tagValidation = validateTeamTag(newTeamTag);
      if (!tagValidation.valid) {
        return { success: false, error: tagValidation.error };
      }
      tagUpper = newTeamTag.trim().toUpperCase();
      tagLower = tagUpper.toLowerCase();

      if (tagLower !== team.teamTagLower) {
        const tagQ = query(
          collection(db, 'teams'),
          where('gameId', '==', team.gameId),
          where('teamTagLower', '==', tagLower),
          where('status', '==', 'active')
        );
        const tagSnap = await getDocs(tagQ);
        const isTagTaken = tagSnap.docs.some((d) => d.id !== teamId);
        if (isTagTaken) {
          return { success: false, error: `Squad tag [${tagUpper}] is already taken for this game.` };
        }
      }
    }

    const now = Date.now();
    const oldName = team.teamName;
    const oldTag = team.teamTag;

    const historyEvent: TeamHistoryEvent = {
      id: `hist_${now}_${Math.random().toString(36).substring(2, 7)}`,
      action: 'NAME_CHANGED',
      details: `Captain ${team.captainGamerTag} renamed squad from "${oldName}" [${oldTag}] to "${trimmedName}" [${tagUpper}]`,
      timestamp: now,
      actorId: captainId,
      actorName: team.captainGamerTag,
    };
    const updatedSquadHistory = [...(team.squadHistory || []), historyEvent];

    await updateDoc(
      teamRef,
      sanitizeFirestoreData({
        teamName: trimmedName,
        teamNameLower: nameLower,
        teamTag: tagUpper,
        teamTagLower: tagLower,
        teamLogo: newTeamLogo || team.teamLogo,
        squadHistory: updatedSquadHistory,
        updatedAt: now,
      })
    );

    // Notify members of rename
    await sendBulkNotification({
      userIds: team.memberIds.filter((id) => id !== captainId),
      type: 'TEAM_UPDATED',
      title: 'Squad Renamed',
      message: `Captain ${team.captainGamerTag} renamed the squad to "${trimmedName}" [${tagUpper}].`,
      data: { teamId: team.teamId, teamName: trimmedName },
    });

    await logAuditEvent({
      action: 'TEAM_UPDATED',
      actorId: captainId,
      actorName: team.captainGamerTag,
      targetType: 'team',
      targetId: teamId,
      details: `Renamed squad from "${oldName}" [${oldTag}] to "${trimmedName}" [${tagUpper}]`,
      gameId: team.gameId,
      teamId,
    });

    return { success: true };
  } catch (err: any) {
    console.error('Failed to update squad name:', err);
    return { success: false, error: err.message || 'Failed to update squad name.' };
  }
}

/**
 * Transfer captaincy of a team to another roster member
 */
export async function transferCaptaincy(params: {
  teamId: string;
  captainId: string;
  newCaptainId: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { teamId, captainId, newCaptainId } = params;
    const teamRef = doc(db, 'teams', teamId);
    const now = Date.now();
    let newCapMemberGamerTag = '';
    let newCapMemberFullName = '';
    let teamName = '';
    let teamTag = '';
    let teamGameId = '';
    let oldCaptainGamerTag = '';
    let memberIdsToNotify: string[] = [];

    await runTransaction(db, async (transaction) => {
      const teamSnap = await transaction.get(teamRef);
      if (!teamSnap.exists()) {
        throw new Error('Team not found.');
      }

      const team = teamSnap.data() as Team;
      teamName = team.teamName;
      teamTag = team.teamTag;
      teamGameId = team.gameId;
      oldCaptainGamerTag = team.captainGamerTag;

      if (team.captainId !== captainId) {
        throw new Error('Only the current team captain can transfer captaincy.');
      }

      const newCapMember = team.members.find((m) => m.id === newCaptainId);
      if (!newCapMember) {
        throw new Error('Selected player is not a member of this team.');
      }

      newCapMemberGamerTag = newCapMember.gamerTag;
      newCapMemberFullName = newCapMember.fullName || newCapMember.gamerTag;
      memberIdsToNotify = (team.memberIds || []).filter((id) => id !== newCaptainId);

      const updatedMembers = team.members.map((m) => {
        if (m.id === newCaptainId) {
          return { ...m, role: 'captain' as const };
        }
        if (m.id === captainId) {
          return { ...m, role: 'member' as const };
        }
        return m;
      });

      const historyEvent: TeamHistoryEvent = {
        id: `hist_${now}_${Math.random().toString(36).substring(2, 7)}`,
        action: 'CAPTAIN_TRANSFERRED',
        details: `Captaincy transferred from ${team.captainGamerTag} to ${newCapMember.gamerTag}`,
        timestamp: now,
        actorId: captainId,
        actorName: team.captainGamerTag,
      };
      const updatedSquadHistory = [...(team.squadHistory || []), historyEvent];

      transaction.update(
        teamRef,
        sanitizeFirestoreData({
          captainId: newCaptainId,
          captainName: newCapMember.fullName || newCapMember.gamerTag,
          captainGamerTag: newCapMember.gamerTag,
          members: updatedMembers,
          squadHistory: updatedSquadHistory,
          updatedAt: now,
        })
      );
    });

    // Notify new captain
    await sendNotification({
      userId: newCaptainId,
      type: 'CAPTAIN_TRANSFERRED',
      title: 'Promoted to Captain',
      message: `You are now the Captain of ${teamName} [${teamTag}]!`,
      data: { teamId, teamName },
    });

    // Notify all roster members
    await sendBulkNotification({
      userIds: memberIdsToNotify,
      type: 'CAPTAIN_TRANSFERRED',
      title: 'Captaincy Transferred',
      message: `${newCapMemberGamerTag} is now the Captain of ${teamName}.`,
      data: { teamId, teamName },
    });

    await logAuditEvent({
      action: 'CAPTAIN_TRANSFERRED',
      actorId: captainId,
      actorName: oldCaptainGamerTag,
      targetType: 'team',
      targetId: teamId,
      details: `Transferred captaincy of ${teamName} to ${newCapMemberGamerTag}`,
      gameId: teamGameId,
      teamId,
    });

    // Sync active recruitments with new captain identity
    try {
      const qRec = query(collection(db, 'lobbyRecruitments'), where('teamId', '==', teamId));
      const snapRec = await getDocs(qRec);
      for (const rDoc of snapRec.docs) {
        if (rDoc.data().status === 'ACTIVE') {
          await updateDoc(rDoc.ref, sanitizeFirestoreData({
            captainId: newCaptainId,
            captainName: newCapMemberFullName,
            captainGamerTag: newCapMemberGamerTag,
            updatedAt: now,
          }));
        }
      }
    } catch (_) {}

    // Sync active matches if this squad is currently in a 5v5 lobby
    try {
      const qMatchA = query(collection(db, 'matches'), where('teamAId', '==', teamId), where('matchType', '==', '5v5'));
      const qMatchB = query(collection(db, 'matches'), where('teamBId', '==', teamId), where('matchType', '==', '5v5'));
      const [snapA, snapB] = await Promise.all([getDocs(qMatchA), getDocs(qMatchB)]);
      const activeStatuses = ['WAITING_FOR_OPPONENT', 'OPPONENT_JOINED', 'TEAM_ROSTERS_FILLING', 'READY_CHECK'];

      for (const d of snapA.docs) {
        const m = d.data() as Match;
        if (activeStatuses.includes(m.status)) {
          await updateDoc(d.ref, sanitizeFirestoreData({
            captainAId: newCaptainId,
            playerAId: newCaptainId,
            playerAName: newCapMemberFullName,
            playerAGamerTag: newCapMemberGamerTag,
            lobbyOwnerId: m.lobbyOwnerId === captainId ? newCaptainId : m.lobbyOwnerId,
            updatedAt: now,
          }));
        }
      }

      for (const d of snapB.docs) {
        const m = d.data() as Match;
        if (activeStatuses.includes(m.status)) {
          await updateDoc(d.ref, sanitizeFirestoreData({
            captainBId: newCaptainId,
            playerBId: newCaptainId,
            playerBName: newCapMemberFullName,
            playerBGamerTag: newCapMemberGamerTag,
            updatedAt: now,
          }));
        }
      }
    } catch (_) {}

    return { success: true };
  } catch (err: any) {
    console.error('Failed to transfer captaincy:', err);
    return { success: false, error: err.message || 'Failed to transfer captaincy.' };
  }
}

/**
 * Member voluntarily leaves a team
 */
export async function leaveTeam(params: {
  teamId: string;
  playerId: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { teamId, playerId } = params;

    // 1. Authenticated user validation
    const authenticatedUid = auth.currentUser?.uid || playerId;
    if (authenticatedUid !== playerId) {
      return { success: false, error: 'Unauthorized: You can only remove yourself from a squad.' };
    }

    const teamRef = doc(db, 'teams', teamId);
    const now = Date.now();
    let leavingGamerTag = 'Player';
    let teamName = '';
    let gameId = '';
    let remainingMemberIds: string[] = [];
    let isDisband = false;

    // Execute atomic departure in a Firestore transaction
    await runTransaction(db, async (transaction) => {
      const teamSnap = await transaction.get(teamRef);
      if (!teamSnap.exists()) {
        throw new Error('Team not found.');
      }

      const team = teamSnap.data() as Team;
      teamName = team.teamName;
      gameId = team.gameId;

      // 2. Verify player is actually a member of this squad
      const isMember =
        (team.memberIds || []).includes(playerId) ||
        (team.members || []).some((m) => m.id === playerId);

      if (!isMember) {
        throw new Error('You are not a member of this squad.');
      }

      const leavingMember = team.members.find((m) => m.id === playerId);
      leavingGamerTag = leavingMember?.gamerTag || 'Player';

      // 3. CAPTAIN LEAVE RULE:
      // Captain cannot leave if other members exist. Must transfer captaincy first.
      if (team.captainId === playerId) {
        const otherMembers = (team.members || []).filter((m) => m.id !== playerId);
        if (otherMembers.length > 0) {
          throw new Error('You are the squad captain. You must transfer captaincy to another member before leaving.');
        }

        // Sole remaining member (Captain alone): Disband squad
        isDisband = true;
        transaction.update(
          teamRef,
          sanitizeFirestoreData({
            status: 'disbanded',
            memberIds: [],
            members: [],
            updatedAt: now,
          })
        );
        return;
      }

      // 4. Regular member leaving
      const updatedMemberIds = (team.memberIds || []).filter((id) => id !== playerId);
      const updatedMembers = (team.members || []).filter((m) => m.id !== playerId);
      remainingMemberIds = updatedMemberIds;

      const archivedLeavingMember: TeamMember = {
        ...(leavingMember || {
          id: playerId,
          gamerTag: leavingGamerTag,
          role: 'member',
          joinedAt: now,
        }),
        leftAt: now,
        reason: 'left',
      };
      const updatedPastMembers = [
        ...(team.pastMembers || []).filter((m) => m.id !== playerId),
        archivedLeavingMember,
      ];

      const historyEvent: TeamHistoryEvent = {
        id: `hist_${now}_${Math.random().toString(36).substring(2, 7)}`,
        action: 'MEMBER_REMOVED',
        details: `${leavingGamerTag} left the squad voluntarily`,
        timestamp: now,
        actorId: playerId,
        actorName: leavingGamerTag,
      };
      const updatedSquadHistory = [...(team.squadHistory || []), historyEvent];

      // Recompute team rating if no matches played yet
      let newTeamRating = team.teamRating;
      if ((team.matchesPlayed || 0) === 0 && updatedMembers.length > 0) {
        const sum = updatedMembers.reduce((acc, m) => acc + (m.rating || 1000), 0);
        newTeamRating = Math.round(sum / updatedMembers.length);
      }

      transaction.update(
        teamRef,
        sanitizeFirestoreData({
          memberIds: updatedMemberIds,
          members: updatedMembers,
          pastMembers: updatedPastMembers,
          squadHistory: updatedSquadHistory,
          teamRating: newTeamRating,
          updatedAt: now,
        })
      );
    });

    // 5. Clean up pending squad invitations for this player for this squad
    try {
      const invQ1 = query(
        collection(db, 'teamInvitations'),
        where('teamId', '==', teamId),
        where('invitedPlayerId', '==', playerId)
      );
      const invQ2 = query(
        collection(db, 'teamInvitations'),
        where('teamId', '==', teamId),
        where('recipientId', '==', playerId)
      );
      const [snap1, snap2] = await Promise.all([getDocs(invQ1), getDocs(invQ2)]);
      const allInvDocs = [...snap1.docs, ...snap2.docs];
      for (const iDoc of allInvDocs) {
        const invData = iDoc.data() as TeamInvitation;
        if (invData.status === 'pending' || invData.status === 'PENDING') {
          await updateDoc(iDoc.ref, sanitizeFirestoreData({
            status: 'CANCELLED',
            cancelledBy: playerId,
            cancelledAt: now,
            updatedAt: now,
          }));
        }
      }
    } catch (invErr) {
      console.warn('Error cleaning up squad invitations on leave:', invErr);
    }

    if (isDisband) {
      // Clean up recruitments if disbanded
      try {
        const qRec = query(collection(db, 'lobbyRecruitments'), where('teamId', '==', teamId));
        const snapRec = await getDocs(qRec);
        for (const rDoc of snapRec.docs) {
          await updateDoc(rDoc.ref, sanitizeFirestoreData({
            status: 'CANCELLED',
            isRecruiting: false,
            updatedAt: now,
          }));
        }
      } catch (_) {}

      await logAuditEvent({
        action: 'TEAM_DISBANDED',
        actorId: playerId,
        actorName: leavingGamerTag,
        targetType: 'team',
        targetId: teamId,
        details: `Team ${teamName} disbanded by sole member/captain ${leavingGamerTag}.`,
        gameId,
        teamId,
      });
    } else {
      // 6. Sync recruitment announcement
      try {
        await syncTeamRecruitmentRoster(teamId, remainingMemberIds);
      } catch (_) {}

      // 7. Notify remaining team members
      if (remainingMemberIds.length > 0) {
        await sendBulkNotification({
          userIds: remainingMemberIds,
          type: 'PLAYER_REMOVED',
          title: 'Player Left Squad',
          message: `${leavingGamerTag} left ${teamName}. Current squad roster: ${remainingMemberIds.length}/5.`,
          data: { teamId, teamName },
        });
      }

      await logAuditEvent({
        action: 'PLAYER_LEFT_TEAM',
        actorId: playerId,
        actorName: leavingGamerTag,
        targetType: 'team',
        targetId: teamId,
        details: `${leavingGamerTag} left team ${teamName}`,
        gameId,
        teamId,
      });
    }

    return { success: true };
  } catch (err: any) {
    console.error('Failed to leave team:', err);
    return { success: false, error: err.message || 'Failed to leave team.' };
  }
}

/**
 * Disband team (Captain only)
 */
export async function disbandTeam(params: {
  teamId: string;
  captainId: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { teamId, captainId } = params;
    const teamRef = doc(db, 'teams', teamId);
    const teamSnap = await getDoc(teamRef);

    if (!teamSnap.exists()) {
      return { success: false, error: 'Team not found.' };
    }

    const team = teamSnap.data() as Team;
    if (team.captainId !== captainId) {
      return { success: false, error: 'Only the team captain can disband the team.' };
    }

    const now = Date.now();
    const historyEvent: TeamHistoryEvent = {
      id: `hist_${now}_${Math.random().toString(36).substring(2, 7)}`,
      action: 'DISBANDED',
      details: `Captain ${team.captainGamerTag} disbanded the squad`,
      timestamp: now,
      actorId: captainId,
      actorName: team.captainGamerTag,
    };
    const updatedSquadHistory = [...(team.squadHistory || []), historyEvent];

    await updateDoc(
      teamRef,
      sanitizeFirestoreData({
        status: 'disbanded',
        squadHistory: updatedSquadHistory,
        updatedAt: now,
      })
    );

    // Notify all members
    await sendBulkNotification({
      userIds: team.memberIds.filter((id) => id !== captainId),
      type: 'TEAM_DISBANDED',
      title: 'Team Disbanded',
      message: `${team.teamName} [${team.teamTag}] was disbanded by Captain ${team.captainGamerTag}.`,
      data: { teamId: team.teamId, teamName: team.teamName },
    });

    await logAuditEvent({
      action: 'TEAM_DISBANDED',
      actorId: captainId,
      actorName: team.captainGamerTag,
      targetType: 'team',
      targetId: teamId,
      details: `Captain disbanded team ${team.teamName}`,
      gameId: team.gameId,
      teamId,
    });

    return { success: true };
  } catch (err: any) {
    console.error('Failed to disband team:', err);
    return { success: false, error: err.message || 'Failed to disband team.' };
  }
}

/**
 * Cancel a 5v5 lobby with a stated reason
 */
export async function cancel5v5Lobby(params: {
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
      return { success: false, error: 'Lobby not found.' };
    }

    const match = matchSnap.data() as Match;
    const authUid = auth.currentUser?.uid || actorId;
    const isStaffOrAdmin = isAdmin || (await verifyAdminAuthority(authUid));

    // Canonical Lobby Owner (original creator)
    const canonicalOwnerId = match.lobbyOwnerId || match.createdBy || match.playerAId;
    const isLobbyOwner = Boolean(authUid && canonicalOwnerId && authUid === canonicalOwnerId);

    // Team B Captain / challenger is strictly prohibited from cancelling the lobby
    if (!isLobbyOwner && !isStaffOrAdmin) {
      if (
        authUid === match.captainBId ||
        authUid === match.playerBId ||
        (match.teamBPlayerIds && match.teamBPlayerIds.includes(authUid))
      ) {
        return {
          success: false,
          error: 'PERMISSION DENIED: Team B Captain cannot close or cancel the lobby. Only the original Lobby Owner or an Admin can cancel this lobby.',
        };
      }
      return {
        success: false,
        error: 'PERMISSION DENIED: Only the original Lobby Owner or an Admin can cancel this lobby.',
      };
    }

    const now = Date.now();

    await updateDoc(
      matchRef,
      sanitizeFirestoreData({
        status: 'CANCELLED',
        cancelledBy: actorId,
        cancelledByName: actorName,
        cancellationReason: reason.trim() || 'Lobby closed by creator',
        cancelledAt: now,
        updatedAt: now,
      })
    );

    // Notify all participants in both rosters
    const allPlayerIds = Array.from(new Set([
      ...(match.teamAPlayerIds || []),
      ...(match.teamBPlayerIds || []),
      match.playerAId,
      match.playerBId,
    ])).filter(Boolean) as string[];

    await sendBulkNotification({
      userIds: allPlayerIds.filter((id) => id !== actorId),
      type: 'LOBBY_CANCELLED',
      title: '5v5 Lobby Cancelled',
      message: `5v5 lobby (${match.teamAName} vs ${match.teamBName || 'Challenger'}) was cancelled by ${actorName}. Reason: ${reason}`,
      data: { matchId, gameId: match.gameId },
    });

    await logAuditEvent({
      action: 'LOBBY_CANCELLED',
      actorId,
      actorName,
      targetType: 'match',
      targetId: matchId,
      details: `Cancelled 5v5 lobby ${match.lobbyCode || matchId}. Reason: ${reason}`,
      gameId: match.gameId,
      lobbyId: matchId,
    });

    return { success: true };
  } catch (err: any) {
    console.error('Error cancelling lobby:', err);
    return { success: false, error: err.message || 'Failed to cancel lobby.' };
  }
}

/**
 * Fetch a single team by ID
 */
export async function fetchTeamById(teamId: string): Promise<Team | null> {
  try {
    if (!teamId) return null;
    const teamSnap = await getDoc(doc(db, 'teams', teamId));
    if (teamSnap.exists()) {
      return teamSnap.data() as Team;
    }

    // Fallback: Check tournament team registrations collection
    const tournRegSnap = await getDoc(doc(db, 'tournamentTeamRegistrations', teamId));
    if (tournRegSnap.exists()) {
      const reg = tournRegSnap.data() as TeamTournamentRegistration;
      const teamAdapted: Team = {
        teamId: reg.id,
        teamName: reg.teamName,
        teamNameLower: reg.teamName.toLowerCase(),
        teamTag: reg.teamTag || '5v5',
        teamTagLower: (reg.teamTag || '5v5').toLowerCase(),
        teamLogo: reg.teamLogo || '🛡️',
        gameId: reg.gameId,
        gameName: reg.gameName,
        captainId: reg.captainId,
        captainName: reg.captainFullName || reg.captainGamerTag,
        captainGamerTag: reg.captainGamerTag,
        memberIds: reg.slots.filter((s) => s.playerId).map((s) => s.playerId!),
        members: reg.slots
          .filter((s) => s.playerId)
          .map((s) => ({
            id: s.playerId!,
            gamerTag: s.gamerTag || s.invitedGamerTag || 'Player',
            role: s.isCaptain ? ('captain' as const) : ('member' as const),
            joinedAt: s.completedAt || s.invitedAt || Date.now(),
            fullName: s.fullName,
          })),
        wins: 0,
        losses: 0,
        draws: 0,
        matchesPlayed: 0,
        winRate: 0,
        currentWinStreak: 0,
        bestWinStreak: 0,
        teamRating: 1000,
        createdAt: reg.createdAt,
        updatedAt: reg.updatedAt,
        status: 'active',
      };
      return teamAdapted;
    }

    return null;
  } catch (err) {
    console.error('Error fetching team by ID:', err);
    return null;
  }
}

/**
 * Canonical rule to verify whether a player is an active member of a squad.
 * A player is an active member ONLY if:
 * 1. The squad exists and has status === 'active' (not disbanded).
 * 2. The player's UID is in memberIds.
 * 3. The player is in members array without leftAt or removedAt.
 */
export function isPlayerActiveSquadMember(team: Team, playerId: string): boolean {
  if (!team || !playerId) return false;
  if (team.status !== 'active') return false;

  const inMemberIds = Array.isArray(team.memberIds) && team.memberIds.includes(playerId);
  const inActiveMembers =
    Array.isArray(team.members) &&
    team.members.some((m) => m.id === playerId && !m.leftAt && !m.removedAt);

  return inMemberIds && inActiveMembers;
}

/**
 * Fetch all teams for a specific player across games
 */
export async function fetchPlayerTeams(playerId: string): Promise<Team[]> {
  if (!playerId) return [];
  try {
    const qMembers = query(
      collection(db, 'teams'),
      where('memberIds', 'array-contains', playerId)
    );
    const qCaptain = query(
      collection(db, 'teams'),
      where('captainId', '==', playerId)
    );

    const [snapMembers, snapCaptain] = await Promise.all([
      getDocs(qMembers).catch(() => ({ docs: [] })),
      getDocs(qCaptain).catch(() => ({ docs: [] })),
    ]);

    const teamsMap = new Map<string, Team>();
    for (const d of [...snapMembers.docs, ...snapCaptain.docs]) {
      const data = { teamId: d.id, ...d.data() } as Team;
      if (isPlayerActiveSquadMember(data, playerId)) {
        teamsMap.set(d.id, data);
      }
    }

    return Array.from(teamsMap.values());
  } catch (err) {
    console.error('Error fetching player teams:', err);
    return [];
  }
}

/**
 * Real-time subscription to player's active teams
 */
export function subscribeToPlayerTeams(playerId: string, callback: (teams: Team[]) => void) {
  if (!playerId) {
    callback([]);
    return () => {};
  }

  let memberDocs: QueryDocumentSnapshot[] = [];
  let captainDocs: QueryDocumentSnapshot[] = [];

  const emit = () => {
    const teamsMap = new Map<string, Team>();
    for (const d of [...memberDocs, ...captainDocs]) {
      const data = { teamId: d.id, ...d.data() } as Team;
      if (isPlayerActiveSquadMember(data, playerId)) {
        teamsMap.set(d.id, data);
      }
    }
    callback(Array.from(teamsMap.values()));
  };

  const q1 = query(
    collection(db, 'teams'),
    where('memberIds', 'array-contains', playerId)
  );

  const q2 = query(
    collection(db, 'teams'),
    where('captainId', '==', playerId)
  );

  const unsub1 = onSnapshot(
    q1,
    (snap) => {
      memberDocs = snap.docs;
      emit();
    },
    (err) => {
      console.error('Error in subscribeToPlayerTeams (memberIds):', err);
      memberDocs = [];
      emit();
    }
  );

  const unsub2 = onSnapshot(
    q2,
    (snap) => {
      captainDocs = snap.docs;
      emit();
    },
    (err) => {
      console.error('Error in subscribeToPlayerTeams (captainId):', err);
      captainDocs = [];
      emit();
    }
  );

  return () => {
    unsub1();
    unsub2();
  };
}

/**
 * Subscribe to all teams for a specific game (for Team Leaderboard & Team Directory)
 */
export function subscribeToTeams(gameId: string | undefined, callback: (teams: Team[]) => void) {
  const teamsRef = collection(db, 'teams');
  const cleanGame = (gameId && gameId !== 'ALL') ? gameId.toLowerCase().trim() : null;

  return onSnapshot(
    teamsRef,
    (snap) => {
      let teams = snap.docs.map((d) => d.data() as Team);
      // Filter out disbanded teams
      teams = teams.filter((t) => {
        const s = (t.status || 'active').toLowerCase().trim();
        return s === 'active';
      });
      // Filter by game if specified
      if (cleanGame) {
        teams = teams.filter((t) => {
          const g = (t.gameId || '').toLowerCase().trim();
          if (cleanGame === 'lol' || cleanGame === 'league' || cleanGame === 'leagueoflegends') {
            return g === 'lol' || g === 'league' || g === 'leagueoflegends';
          }
          if (cleanGame === 'cs2' || cleanGame === 'cs') {
            return g === 'cs2' || g.includes('counter-strike') || g === 'cs';
          }
          if (cleanGame === 'valorant' || cleanGame === 'val') {
            return g === 'valorant' || g === 'val';
          }
          return g === cleanGame;
        });
      }
      // Order strictly by teamRating desc, then matchesPlayed desc, then wins desc
      teams.sort((a, b) => {
        const rDiff = (b.teamRating ?? 1000) - (a.teamRating ?? 1000);
        if (rDiff !== 0) return rDiff;
        const wDiff = (b.wins ?? 0) - (a.wins ?? 0);
        if (wDiff !== 0) return wDiff;
        return (b.matchesPlayed ?? 0) - (a.matchesPlayed ?? 0);
      });
      callback(teams);
    },
    (err) => {
      console.error('Error in subscribeToTeams:', err);
      callback([]);
    }
  );
}

/**
 * Fetch team match history (5v5 matches where team was Team A or Team B)
 */
export async function fetchTeamMatchHistory(teamId: string): Promise<Match[]> {
  try {
    const qA = query(
      collection(db, 'matches'),
      where('teamAId', '==', teamId),
      orderBy('createdAt', 'desc'),
      limit(30)
    );
    const qB = query(
      collection(db, 'matches'),
      where('teamBId', '==', teamId),
      orderBy('createdAt', 'desc'),
      limit(30)
    );

    const [snapA, snapB] = await Promise.all([getDocs(qA), getDocs(qB)]);
    const map = new Map<string, Match>();
    snapA.docs.forEach((d) => map.set(d.id, d.data() as Match));
    snapB.docs.forEach((d) => map.set(d.id, d.data() as Match));

    return Array.from(map.values()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  } catch (err) {
    console.error('Error fetching team match history:', err);
    return [];
  }
}

/**
 * Real-time subscription to team match history
 */
export function subscribeToTeamMatches(teamId: string, callback: (matches: Match[]) => void) {
  const qA = query(collection(db, 'matches'), where('teamAId', '==', teamId), orderBy('createdAt', 'desc'), limit(30));
  const qB = query(collection(db, 'matches'), where('teamBId', '==', teamId), orderBy('createdAt', 'desc'), limit(30));

  let matchesA: Match[] = [];
  let matchesB: Match[] = [];

  const emit = () => {
    const map = new Map<string, Match>();
    matchesA.forEach((m) => map.set(m.id, m));
    matchesB.forEach((m) => map.set(m.id, m));
    const sorted = Array.from(map.values()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    callback(sorted);
  };

  const unsubA = onSnapshot(qA, (snap) => {
    matchesA = snap.docs.map((d) => d.data() as Match);
    emit();
  }, () => emit());

  const unsubB = onSnapshot(qB, (snap) => {
    matchesB = snap.docs.map((d) => d.data() as Match);
    emit();
  }, () => emit());

  return () => {
    unsubA();
    unsubB();
  };
}

/**
 * Subscribe to pending invitations for a player
 */
export function subscribeToUserInvitations(
  playerId: string,
  callback: (invitations: TeamInvitation[]) => void
) {
  if (!playerId) {
    callback([]);
    return () => {};
  }

  // To ensure invitations are always retrieved regardless of whether invitedPlayerId or recipientId
  // was set, and without requiring composite indexes on Firestore:
  const qByInvited = query(
    collection(db, 'teamInvitations'),
    where('invitedPlayerId', '==', playerId)
  );

  const qByRecipient = query(
    collection(db, 'teamInvitations'),
    where('recipientId', '==', playerId)
  );

  let mapByInvited = new Map<string, TeamInvitation>();
  let mapByRecipient = new Map<string, TeamInvitation>();

  const emit = () => {
    const combined = new Map<string, TeamInvitation>();
    for (const [id, inv] of mapByInvited.entries()) {
      combined.set(id, inv);
    }
    for (const [id, inv] of mapByRecipient.entries()) {
      combined.set(id, inv);
    }
    const list = Array.from(combined.values())
      .filter((inv) => normalizeInvitationStatus(inv.status) === 'PENDING')
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    callback(list);
  };

  const unsub1 = onSnapshot(
    qByInvited,
    (snap) => {
      mapByInvited = new Map();
      snap.docs.forEach((d) => {
        mapByInvited.set(d.id, { id: d.id, ...d.data() } as TeamInvitation);
      });
      emit();
    },
    (err) => {
      console.error('Error listening to team invitations by invitedPlayerId:', err);
    }
  );

  const unsub2 = onSnapshot(
    qByRecipient,
    (snap) => {
      mapByRecipient = new Map();
      snap.docs.forEach((d) => {
        mapByRecipient.set(d.id, { id: d.id, ...d.data() } as TeamInvitation);
      });
      emit();
    },
    (err) => {
      console.error('Error listening to team invitations by recipientId:', err);
    }
  );

  return () => {
    unsub1();
    unsub2();
  };
}

/**
 * Accept or decline a team invitation
 */
export async function respondToTeamInvitation(params: {
  invitationId: string;
  response: 'accepted' | 'declined';
  player: Player;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { invitationId, response, player } = params;
    const invRef = doc(db, 'teamInvitations', invitationId);
    const invSnap = await getDoc(invRef);

    if (!invSnap.exists()) {
      return { success: false, error: 'Invitation not found.' };
    }

    const invitation = invSnap.data() as TeamInvitation;

    const authenticatedUid = auth.currentUser?.uid || player.uid;
    const targetUid = invitation.recipientId || invitation.invitedPlayerId;
    if (targetUid !== authenticatedUid && targetUid !== player.uid) {
      return { success: false, error: 'Unauthorized: Authenticated identity does not match invitation recipient.' };
    }

    if (normalizeInvitationStatus(invitation.status) !== 'PENDING') {
      if (normalizeInvitationStatus(invitation.status) === 'ACCEPTED') {
        return { success: true };
      }
      return { success: false, error: 'This invitation has already been processed.' };
    }

    const now = Date.now();
    const expiresAt = invitation.expiresAt || (invitation.createdAt ? invitation.createdAt + INVITATION_EXPIRATION_MS : 0);
    if (expiresAt && now >= expiresAt) {
      await updateDoc(invRef, {
        status: 'EXPIRED',
        expiredAt: now,
        updatedAt: now,
      });
      await updateMatchInvitationNotificationsActioned(invitationId, 'EXPIRED', authenticatedUid);
      const matchId = invitation.matchId || invitation.lobbyId;
      if (matchId) {
        try {
          const matchRef = doc(db, 'matches', matchId);
          const matchSnap = await getDoc(matchRef);
          if (matchSnap.exists()) {
            const mData = matchSnap.data() as Match;
            if (mData.invitationStatus === 'PENDING' && !mData.opponentAccepted) {
              await updateDoc(matchRef, {
                invitationStatus: 'EXPIRED',
                updatedAt: now,
              });
            }
          }
        } catch (e) {}
      }
      return { success: false, error: '⏱ INVITATION EXPIRED: This invitation has expired after 15 minutes.' };
    }

    const isChess =
      invitation.type === 'CHESS_MATCH_INVITATION' ||
      invitation.game === 'Chess' ||
      (invitation.gameName && invitation.gameName.toLowerCase().includes('chess'));
    const is1v1Match =
      isChess ||
      invitation.type === 'MATCH_INVITATION' ||
      (!invitation.teamSide && (invitation.matchId || invitation.lobbyId));

    if (response === 'declined') {
      await updateDoc(invRef, {
        status: 'DECLINED',
        declinedBy: authenticatedUid,
        respondedAt: now,
        updatedAt: now,
      });

      // Mark related notifications as ACTIONED / DECLINED
      await updateMatchInvitationNotificationsActioned(invitationId, 'DECLINED', authenticatedUid);

      // If match exists, update match record
      const matchId = invitation.matchId || invitation.lobbyId;
      if (matchId) {
        try {
          const matchRef = doc(db, 'matches', matchId);
          const matchSnap = await getDoc(matchRef);
          if (matchSnap.exists()) {
            await updateDoc(matchRef, {
              invitationStatus: 'DECLINED',
              opponentAccepted: false,
              updatedAt: now,
            });
          }
        } catch (e) {
          console.warn('Could not update match status on decline:', e);
        }
      }

      const notifyTarget = invitation.inviterId || invitation.senderId || invitation.captainId;
      if (notifyTarget) {
        await sendNotification({
          userId: notifyTarget,
          recipientId: notifyTarget,
          senderId: authenticatedUid,
          matchId: invitation.matchId || invitation.lobbyId,
          type: isChess ? 'CHESS_MATCH_INVITATION_DECLINED' : 'MATCH_INVITATION_DECLINED',
          title: isChess ? '♟️ CHESS INVITATION DECLINED' : '🎮 INVITATION DECLINED',
          message: is1v1Match
            ? `${player.gamerTag} declined your ${invitation.gameName || '1v1'} match invitation.`
            : `${player.gamerTag} declined your invitation to join ${invitation.teamName}.`,
          invitationId,
          lobbyId: invitation.lobbyId,
          teamId: invitation.teamId,
          status: 'DECLINED',
          data: {
            teamId: invitation.teamId,
            teamName: invitation.teamName,
            lobbyId: invitation.lobbyId,
            matchId: invitation.matchId || invitation.lobbyId,
            invitationId,
            declinedBy: player.gamerTag,
            status: 'DECLINED',
            game: isChess ? 'Chess' : invitation.game || invitation.gameName,
          },
        });
      }

      return { success: true };
    }

    // Accepting 1v1 Match Invitation (Chess, FC 26, FC 27, CS2, Valorant 1v1, etc.)
    if (is1v1Match) {
      const matchId = invitation.matchId || invitation.lobbyId;
      if (!matchId) {
        return { success: false, error: 'Match identifier missing on this invitation.' };
      }

      const matchRef = doc(db, 'matches', matchId);
      let resolvedMatchData: Match | null = null;

      // ATOMIC TRANSACTION: Guarantees mutually exclusive state transition (PENDING -> ACCEPTED or PENDING -> EXPIRED)
      await runTransaction(db, async (transaction) => {
        const liveInvSnap = await transaction.get(invRef);
        if (!liveInvSnap.exists()) {
          throw new Error('Invitation not found.');
        }
        const liveInv = liveInvSnap.data() as TeamInvitation;
        if (normalizeInvitationStatus(liveInv.status) !== 'PENDING') {
          throw new Error('This invitation has already been processed.');
        }

        const txNow = Date.now();
        const txExpiresAt = liveInv.expiresAt || (liveInv.createdAt ? liveInv.createdAt + INVITATION_EXPIRATION_MS : 0);
        if (txExpiresAt && txNow >= txExpiresAt) {
          transaction.update(invRef, {
            status: 'EXPIRED',
            expiredAt: txNow,
            updatedAt: txNow,
          });
          throw new Error('⏱ INVITATION EXPIRED: This invitation has expired after 15 minutes.');
        }

        const liveMatchSnap = await transaction.get(matchRef);
        if (!liveMatchSnap.exists()) {
          transaction.update(invRef, { status: 'EXPIRED', expiredAt: txNow, updatedAt: txNow });
          throw new Error('This match no longer exists.');
        }

        const matchData = liveMatchSnap.data() as Match;
        resolvedMatchData = matchData;

        if (matchData.status === 'CONFIRMED' || matchData.status === 'COMPLETED') {
          transaction.update(invRef, { status: 'EXPIRED', expiredAt: txNow, updatedAt: txNow });
          throw new Error('This match has already finished.');
        }

        if (matchData.status === 'CANCELLED' || matchData.invitationStatus === 'CANCELLED') {
          transaction.update(invRef, { status: 'CANCELLED', updatedAt: txNow });
          throw new Error('This match was cancelled by the host.');
        }

        if (matchData.status === 'LIVE' || (matchData.status as string) === 'IN_PROGRESS') {
          transaction.update(invRef, { status: 'EXPIRED', expiredAt: txNow, updatedAt: txNow });
          throw new Error('This match is already in progress.');
        }

        if (matchData.status === 'REJECTED') {
          transaction.update(invRef, { status: 'CANCELLED', updatedAt: txNow });
          throw new Error('This match was rejected by the referee.');
        }

        if (matchData.playerAId === authenticatedUid || (matchData.createdBy && matchData.createdBy === authenticatedUid)) {
          transaction.update(invRef, { status: 'CANCELLED', updatedAt: txNow });
          throw new Error('You cannot select yourself as an opponent.');
        }

        if (matchData.playerBId && matchData.playerBId !== authenticatedUid && matchData.opponentAccepted) {
          transaction.update(invRef, { status: 'EXPIRED', expiredAt: txNow, updatedAt: txNow });
          throw new Error('The opponent slot for this match has already been filled.');
        }

        // 1. Update existing match in real-time to WAITING_FOR_ADMIN
        transaction.update(matchRef, {
          playerBId: authenticatedUid,
          playerBGamerTag: player.gamerTag,
          playerBName: player.fullName || player.gamerTag,
          invitationStatus: 'ACCEPTED',
          opponentAccepted: true,
          opponentAcceptedAt: txNow,
          status: 'WAITING_FOR_ADMIN',
          updatedAt: txNow,
        });

        // 2. Update invitation status to ACCEPTED
        transaction.update(invRef, {
          status: 'ACCEPTED',
          acceptedBy: authenticatedUid,
          acceptedAt: txNow,
          respondedAt: txNow,
          updatedAt: txNow,
        });
      });

      const matchData = resolvedMatchData || (await getDoc(matchRef)).data() as Match;

      // 3. Update related notifications to ACTIONED
      await updateMatchInvitationNotificationsActioned(invitationId, 'ACCEPTED', authenticatedUid);

      // 4. Notify the inviter that the invitation was accepted
      const notifyTarget = invitation.inviterId || invitation.senderId || matchData.playerAId;
      if (notifyTarget) {
        await sendNotification({
          userId: notifyTarget,
          recipientId: notifyTarget,
          senderId: authenticatedUid,
          matchId,
          type: isChess ? 'CHESS_MATCH_INVITATION_ACCEPTED' : 'MATCH_INVITATION_ACCEPTED',
          title: isChess ? '♟️ CHESS INVITATION ACCEPTED' : '🎮 INVITATION ACCEPTED',
          message: `${player.gamerTag} accepted your ${invitation.gameName || '1v1'} match invitation! Ready for battle at Station ${matchData.station || '01'}.`,
          invitationId,
          lobbyId: matchId,
          status: 'ACCEPTED',
          data: {
            matchId,
            lobbyId: matchId,
            invitationId,
            acceptedBy: player.gamerTag,
            status: 'ACCEPTED',
            game: invitation.gameName || (isChess ? 'Chess' : '1v1 Match'),
          },
        });
      }

      // 5. Notify both players that the match is waiting for Admin approval
      const gameLabel = invitation.gameName || (isChess ? 'Chess' : '1v1 Match');
      const pendingApprovalMsg = `Your ${gameLabel} match between ${matchData.playerAGamerTag} and ${player.gamerTag} at Station ${matchData.station || '01'} is pending Admin approval before start.`;

      const pA = matchData.playerAId;
      const pB = authenticatedUid;
      const matchParticipants = [pA, pB].filter(Boolean);

      await Promise.all(
        matchParticipants.map((uid) =>
          sendNotification({
            userId: uid,
            recipientId: uid,
            type: 'MATCH_PENDING_APPROVAL',
            title: '⏳ MATCH PENDING ADMIN APPROVAL',
            message: pendingApprovalMsg,
            matchId,
            lobbyId: matchId,
            game: gameLabel,
            status: 'PENDING_ADMIN_APPROVAL',
            notificationState: 'UNREAD',
            data: {
              matchId,
              lobbyId: matchId,
              game: gameLabel,
              station: matchData.station || '01',
              status: 'PENDING_ADMIN_APPROVAL',
            },
          }).catch((e) => console.warn(`Failed to notify participant ${uid} of pending admin approval:`, e))
        )
      );

      // 6. Notify Admins that match is ready and waiting for approval
      const updatedMatchForAdmin: Match = {
        ...matchData,
        playerBId: authenticatedUid,
        playerBGamerTag: player.gamerTag,
        playerBName: player.fullName || player.gamerTag,
        invitationStatus: 'ACCEPTED',
        opponentAccepted: true,
        opponentAcceptedAt: now,
        status: 'WAITING_FOR_ADMIN',
        updatedAt: now,
      };

      notifyAdminsMatchNeedsApproval(updatedMatchForAdmin).catch((err) => {
        console.warn('Could not dispatch admin notifications for 1v1 match ready:', err);
      });

      return { success: true };
    }

    // Accepting 5v5 Lobby Invitation: Add player directly to the active 5v5 match lobby
    if (invitation.lobbyId || invitation.type === '5V5_LOBBY_INVITATION') {
      const matchId = invitation.lobbyId!;

      // Enforce: Player must not be an active member of another 5v5 lobby
      const existingActiveLobby = await getPlayerActive5v5Lobby(player.uid, matchId);
      if (existingActiveLobby) {
        return {
          success: false,
          error: `YOU ARE ALREADY IN AN ACTIVE LOBBY (${existingActiveLobby.lobbyCode || existingActiveLobby.id}).`,
        };
      }

      const matchRef = doc(db, 'matches', matchId);

      let targetSide: 'teamA' | 'teamB' = 'teamA';
      let resultingRosterCount = 0;

      await runTransaction(db, async (transaction) => {
        const liveInvSnap = await transaction.get(invRef);
        if (!liveInvSnap.exists()) {
          throw new Error('This invitation no longer exists.');
        }
        const liveInv = liveInvSnap.data() as TeamInvitation;
        if (normalizeInvitationStatus(liveInv.status) !== 'PENDING') {
          throw new Error('This invitation has already been processed.');
        }
        const txNow = Date.now();
        const txExpiresAt = liveInv.expiresAt || (liveInv.createdAt ? liveInv.createdAt + INVITATION_EXPIRATION_MS : 0);
        if (txExpiresAt && txNow >= txExpiresAt) {
          transaction.update(invRef, {
            status: 'EXPIRED',
            expiredAt: txNow,
            updatedAt: txNow,
          });
          throw new Error('⏱ INVITATION EXPIRED: This invitation has expired after 15 minutes.');
        }

        const matchSnap = await transaction.get(matchRef);
        if (!matchSnap.exists()) {
          throw new Error('This 5v5 lobby no longer exists.');
        }

        const match = matchSnap.data() as Match;
        if (match.status === 'CANCELLED') {
          throw new Error('LOBBY CANCELLED: This 5v5 match lobby was cancelled.');
        }
        if (match.status === 'CONFIRMED' || match.status === 'COMPLETED') {
          throw new Error('MATCH ENDED: This 5v5 match has already finished.');
        }
        if (match.status === 'LIVE' || (match.status as string) === 'IN_PROGRESS') {
          throw new Error('MATCH STARTED: This 5v5 match has already started.');
        }

        const side = invitation.teamSide || (match.teamAId === invitation.teamId ? 'teamA' : 'teamB');
        targetSide = side;
        const teamKey = side === 'teamA' ? 'teamAPlayerIds' : 'teamBPlayerIds';
        const playersKey = side === 'teamA' ? 'teamAPlayers' : 'teamBPlayers';
        const currentIds: string[] = match[teamKey] || [];
        const currentPlayers: any[] = match[playersKey] || [];

        if (currentIds.length >= 5) {
          throw new Error(`TEAM_FULL: ${side === 'teamA' ? 'Team A' : 'Team B'} is already full (5/5 players).`);
        }

        if (currentIds.includes(player.uid)) {
          // Player is already an active member of this squad in this lobby!
          // Mark the invitation as ACCEPTED and exit transaction cleanly.
          transaction.update(invRef, sanitizeFirestoreData({
            status: 'ACCEPTED',
            acceptedBy: player.uid,
            acceptedAt: now,
            respondedAt: now,
            updatedAt: now,
          }));
          return;
        }

        const oppKey = side === 'teamA' ? 'teamBPlayerIds' : 'teamAPlayerIds';
        const oppIds: string[] = match[oppKey] || [];
        const oppCaptainId = side === 'teamA' ? (match.captainBId || match.playerBId) : (match.captainAId || match.playerAId || match.createdBy);
        if (oppIds.includes(player.uid) || (oppCaptainId && oppCaptainId === player.uid)) {
          throw new Error('You cannot select yourself as an opponent or play on both sides of the same lobby.');
        }

        const newPlayer = {
          id: player.uid,
          gamerTag: player.gamerTag,
          name: player.fullName || player.gamerTag,
          rating: player.overallRating || 1000,
          inGameName: player.gamerTag,
        };

        const updatedIds = [...currentIds, player.uid];
        const updatedPlayers = [...currentPlayers, newPlayer];
        resultingRosterCount = updatedIds.length;

        const teamACount = side === 'teamA' ? updatedIds.length : (match.teamAPlayerIds || []).length;
        const teamBCount = side === 'teamB' ? updatedIds.length : (match.teamBPlayerIds || []).length;
        const isBoth5 = teamACount === 5 && teamBCount === 5;
        const nextStatus: MatchStatus = isBoth5 ? 'READY_CHECK' : 'TEAM_ROSTERS_FILLING';

        const matchUpdates: any = {
          [teamKey]: updatedIds,
          [playersKey]: updatedPlayers,
          status: nextStatus,
          playerReadyStatus: {
            ...(match.playerReadyStatus || {}),
            [player.uid]: false,
          },
          updatedAt: now,
        };

        if (side === 'teamA') {
          const updatedNeeded = Math.max(0, 5 - updatedIds.length);
          matchUpdates.playersNeeded = updatedNeeded;
          if (updatedNeeded === 0) {
            matchUpdates.isRecruiting = false;
            matchUpdates.recruitmentStatus = 'FULL';
          }
        } else {
          // Team B joining via invitation: Captain is optional and not automatically assigned
          if (!match.teamBName) {
            matchUpdates.teamBName = 'Team B';
          }
          if (!match.teamBTag) {
            matchUpdates.teamBTag = 'SQD-B';
          }
          matchUpdates.teamBLogo = match.teamBLogo || '⚔️';
          if (teamBCount === 5) {
            matchUpdates.isTeamBRecruiting = false;
          }
        }

        transaction.update(matchRef, sanitizeFirestoreData(matchUpdates));
        transaction.set(
          doc(db, 'players', player.uid),
          sanitizeFirestoreData({ active5v5LobbyId: matchId }),
          { merge: true }
        );
        transaction.update(invRef, sanitizeFirestoreData({
          status: 'ACCEPTED',
          acceptedBy: authenticatedUid,
          acceptedAt: now,
          respondedAt: now,
          updatedAt: now,
        }));
      });

      // Update all notifications associated with this invitation to ACTIONED / ACCEPTED
      await updateMatchInvitationNotificationsActioned(invitationId, 'ACCEPTED', authenticatedUid);

      // Permanent squad is strictly preserved. Accepting a temporary 5v5 match lobby invite
      // only adds the player to the active 5v5 match lobby, NOT altering permanent squad rosters.

      // Send notifications to inviter and captain
      const notifyTarget = invitation.inviterId || invitation.senderId || invitation.captainId;
      if (notifyTarget) {
        await sendNotification({
          userId: notifyTarget,
          recipientId: notifyTarget,
          type: 'MATCH_INVITATION_ACCEPTED',
          title: '🎮 INVITATION ACCEPTED',
          message: `${player.gamerTag} accepted your invitation to join ${invitation.teamName}! (${resultingRosterCount}/5 Players)`,
          invitationId,
          lobbyId: matchId,
          teamId: invitation.teamId,
          status: 'ACCEPTED',
          data: {
            matchId,
            lobbyId: matchId,
            teamId: invitation.teamId,
            teamSide: targetSide,
            teamName: invitation.teamName,
            invitationId,
            acceptedBy: player.gamerTag,
            status: 'ACCEPTED',
          },
        });
      }

      return { success: true };
    }

    // Accepting regular squad/team invitation: Add to team roster
    const teamRef = doc(db, 'teams', invitation.teamId);
    let updatedMembersCount = 0;
    let registeredGameId = invitation.gameId;

    await runTransaction(db, async (transaction) => {
      const liveInvSnap = await transaction.get(invRef);
      if (!liveInvSnap.exists()) throw new Error('Invitation not found.');
      const liveInv = liveInvSnap.data() as TeamInvitation;
      if (normalizeInvitationStatus(liveInv.status) !== 'PENDING') {
        throw new Error('This invitation has already been processed.');
      }
      const txNow = Date.now();
      const txExpiresAt = liveInv.expiresAt || (liveInv.createdAt ? liveInv.createdAt + INVITATION_EXPIRATION_MS : 0);
      if (txExpiresAt && txNow >= txExpiresAt) {
        transaction.update(invRef, {
          status: 'EXPIRED',
          expiredAt: txNow,
          updatedAt: txNow,
        });
        throw new Error('⏱ INVITATION EXPIRED: This invitation has expired after 15 minutes.');
      }

      const teamSnap = await transaction.get(teamRef);
      if (!teamSnap.exists()) {
        throw new Error('The team no longer exists.');
      }

      const team = teamSnap.data() as Team;
      registeredGameId = team.gameId;

      if (team.status !== 'active') {
        throw new Error('This team is no longer active.');
      }

      if (team.memberIds.includes(player.uid)) {
        transaction.update(invRef, {
          status: 'ACCEPTED',
          acceptedBy: player.uid,
          acceptedAt: txNow,
          respondedAt: txNow,
          updatedAt: txNow,
        });
        return;
      }

      if (team.memberIds.length >= 5) {
        throw new Error('This team roster is now full (5/5).');
      }

      const newMember: TeamMember = {
        id: player.uid,
        gamerTag: player.gamerTag,
        fullName: player.fullName,
        rating: player.overallRating || 1000,
        role: 'member',
        joinedAt: txNow,
      };

      const updatedMemberIds = [...team.memberIds, player.uid];
      const updatedMembers = [...team.members, newMember];
      updatedMembersCount = updatedMembers.length;

      let newTeamRating = team.teamRating;
      if (team.matchesPlayed === 0) {
        const sumRatings = updatedMembers.reduce((acc, m) => acc + (m.rating || 1000), 0);
        newTeamRating = Math.round(sumRatings / updatedMembers.length);
      }

      const squadHistoryEvent: TeamHistoryEvent = {
        id: `hist_${txNow}_${Math.random().toString(36).substring(2, 7)}`,
        action: 'MEMBER_ADDED',
        details: `${player.gamerTag} accepted squad invitation and joined active roster`,
        timestamp: txNow,
        actorId: player.uid,
        actorName: player.gamerTag,
      };
      const updatedSquadHistory = [...(team.squadHistory || []), squadHistoryEvent];

      transaction.update(teamRef, {
        memberIds: updatedMemberIds,
        members: updatedMembers,
        squadHistory: updatedSquadHistory,
        teamRating: newTeamRating,
        updatedAt: txNow,
      });

      transaction.update(invRef, {
        status: 'ACCEPTED',
        acceptedBy: player.uid,
        acceptedAt: txNow,
        respondedAt: txNow,
        updatedAt: txNow,
      });
    });

    const teamSnapAfter = await getDoc(teamRef);
    const team = teamSnapAfter.data() as Team;
    const updatedMemberIds = team?.memberIds || [];

    // Sync recruitment announcement and open 5v5 lobby roster
    await syncTeamRecruitmentRoster(team.teamId, updatedMemberIds);

    // Notify captain
    await sendNotification({
      userId: invitation.captainId,
      type: 'TEAM_INVITE_ACCEPTED',
      title: 'Invite Accepted!',
      message: `${player.gamerTag} has joined ${team.teamName}! Roster: ${team.members.length}/5.`,
      data: { teamId: team.teamId, teamName: team.teamName },
    });

    await logAuditEvent({
      action: 'PLAYER_JOINED',
      actorId: player.uid,
      actorName: player.gamerTag,
      targetType: 'team',
      targetId: team.teamId,
      details: `${player.gamerTag} accepted invitation to join ${team.teamName}`,
      gameId: team.gameId,
      teamId: team.teamId,
    });

    return { success: true };
  } catch (err: any) {
    console.error('Error responding to invitation:', err);
    return { success: false, error: err.message || 'Failed to process response.' };
  }
}

/**
 * Helper to fetch a player's active team tag for a specific game (e.g. Valorant or CS2)
 */
export async function getPlayerTeamTagForGame(playerId: string, gameId: string): Promise<string | null> {
  try {
    const q = query(
      collection(db, 'teams'),
      where('gameId', '==', gameId.toLowerCase()),
      where('memberIds', 'array-contains', playerId),
      where('status', '==', 'active'),
      limit(1)
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      const t = snap.docs[0].data() as Team;
      return t.teamTag;
    }
    return null;
  } catch {
    return null;
  }
}
