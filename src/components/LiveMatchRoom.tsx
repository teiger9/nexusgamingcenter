import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import {
  subscribeToMatch,
  startApprovedMatch,
  startMatch,
  finishLiveMatch,
  submitPlayerDeclaration,
  submit5v5Vote,
  resolveDisputedMatch,
  approveMatchRequest,
  rejectMatchRequest,
  joinTeamBAsSoloCaptain,
  requestToJoin5v5Team,
  respondTo5v5JoinRequest,
  removePlayerFrom5v5Team,
  leaveTeamBAsCaptain,
  publishTeamBRecruitment,
  cancelTeamBRecruitment,
  togglePlayerReady,
  start5v5Match,
  end5v5Match,
  adminResolve5v5Match,
  cancel5v5LobbyInvitation,
  subscribeToLobbyInvitations,
  cancelMatch,
  remove5v5Lobby,
  leave5v5Lobby,
  switch5v5TeamSide,
  claimTeamBCaptaincy,
} from '../services/matchService';
import { respondToTeamInvitation } from '../services/teamService';
import { Match, PlayerDeclaration, LobbyJoinRequest, TeamInvitation, Player } from '../types';
import { normalizeInvitationStatus } from '../utils/tournamentTeamStatus';
import { usePlayerProfiles, resolvePlayerIdentity } from '../services/playerResolver';
import { publishLobbyRecruitment, cancelLobbyRecruitment } from '../services/recruitmentService';
import { AdminForceEndModal } from './AdminForceEndModal';
import { Join5v5LobbyModal } from './Join5v5LobbyModal';
import { deriveMatchRewardsAndMMR } from '../services/matchRewardAnnouncementService';
import { InvitePlayer5v5Modal } from './InvitePlayer5v5Modal';
import { RemoveLobbyModal } from './RemoveLobbyModal';
import { MatchLiveTimerCard } from './MatchLiveTimerCard';
import { Match1v1DeclarationCard } from './Match1v1DeclarationCard';
import { InvitationCountdownBadge } from './InvitationCountdownBadge';
import { isInvitationExpired } from '../utils/invitationExpiration';
import { useToast } from './Toast';
import confetti from 'canvas-confetti';
import {
  getPlayerDeclarationValue,
  formatDeclarationDisplay,
  get5v5TeamPlayersList,
} from '../utils/declarationHelpers';
import {
  Swords,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Trophy,
  ShieldAlert,
  ArrowLeft,
  Lock,
  Flame,
  Radio,
  Zap,
  XCircle,
  Inbox,
  Play,
  Check,
  AlertOctagon,
  Copy,
  Users,
  Crown,
  Shield,
  Trash2,
  ThumbsUp,
  UserCheck,
  ShieldCheck,
  LogOut,
  UserPlus,
} from 'lucide-react';

interface LiveMatchRoomProps {
  matchId: string;
  invitationId?: string;
  onBack: () => void;
  onViewLeaderboard?: () => void;
}

export const LiveMatchRoom: React.FC<LiveMatchRoomProps> = ({
  matchId,
  invitationId,
  onBack,
  onViewLeaderboard,
}) => {
  const { user, playerProfile, isAdmin, isStaff, isSuperAdmin, role } = useAuth();
  const isAuthorizedStaffOrAdmin = isAdmin || isStaff || isSuperAdmin;
  const { showToast } = useToast();

  const [match, setMatch] = useState<Match | null>(null);
  const [loading, setLoading] = useState(true);
  const [submittingAction, setSubmittingAction] = useState(false);
  const [confettiFired, setConfettiFired] = useState(false);

  // Admin reject in-room state
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');

  // Admin Force End / Match Override state
  const [showForceEndModal, setShowForceEndModal] = useState(false);

  // Admin dispute resolution state
  const [adminNote, setAdminNote] = useState('');
  const [showAdminResolveModal, setShowAdminResolveModal] = useState(false);
  const [selectedAdminOutcome, setSelectedAdminOutcome] = useState<'playerA' | 'playerB' | 'draw' | null>(null);

  const [copiedLobbyCode, setCopiedLobbyCode] = useState(false);
  const [showRemoveLobbyModal, setShowRemoveLobbyModal] = useState(false);
  const [showLeaveLobbyModal, setShowLeaveLobbyModal] = useState(false);
  const [transferOwnerTargetId, setTransferOwnerTargetId] = useState('');
  const [pendingJoinRequests, setPendingJoinRequests] = useState<LobbyJoinRequest[]>([]);
  const [showJoinSquadModal, setShowJoinSquadModal] = useState(false);
  const [inviteModalTeamSide, setInviteModalTeamSide] = useState<'teamA' | 'teamB' | null>(null);
  const [lobbyInvitations, setLobbyInvitations] = useState<TeamInvitation[]>([]);

  // 5v5 Match Result Confirmation State (Super Admin / Authorized Staff controlled)
  const [admin5v5Outcome, setAdmin5v5Outcome] = useState<'teamA' | 'teamB' | 'draw'>('teamA');
  const [admin5v5Hours, setAdmin5v5Hours] = useState<string>('1.0');

  useEffect(() => {
    const unsubscribe = subscribeToMatch(matchId, (updatedMatch) => {
      setMatch(updatedMatch);
      setLoading(false);

      if (updatedMatch?.status === 'CONFIRMED' && !confettiFired) {
        confetti({
          particleCount: 60,
          spread: 70,
          origin: { y: 0.6 },
        });
        setConfettiFired(true);
      }
    });

    return () => unsubscribe();
  }, [matchId, confettiFired]);

  // Subscribe to live join requests for this match
  useEffect(() => {
    if (!matchId) return;
    const q = query(
      collection(db, 'matches', matchId, 'joinRequests'),
      where('status', '==', 'PENDING')
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: LobbyJoinRequest[] = [];
        snap.forEach((d) => {
          list.push(d.data() as LobbyJoinRequest);
        });
        setPendingJoinRequests(list);
      },
      (err) => {
        console.warn('Error subscribing to join requests:', err);
      }
    );
    return () => unsub();
  }, [matchId]);

  // Subscribe to live 5v5 lobby player invitations
  useEffect(() => {
    if (!matchId) return;
    const unsub = subscribeToLobbyInvitations(matchId, (invs) => {
      setLobbyInvitations(invs);
    });
    return () => unsub();
  }, [matchId]);

  // Single Source of Truth: Resolve live player profiles by Firebase UID (unconditional hook)
  const allPlayerUids = React.useMemo(() => {
    if (!match) return [];
    const teamAIds = match.teamAPlayerIds || [];
    const teamBIds = match.teamBPlayerIds || [];
    const list = [match.playerAId, match.playerBId, ...teamAIds, ...teamBIds];
    return Array.from(new Set(list.filter((u): u is string => !!u && typeof u === 'string' && u.length > 3)));
  }, [match]);

  const { profiles: livePlayerProfiles } = usePlayerProfiles(allPlayerUids);

  const pendingTeamAInvites = React.useMemo(() => {
    return lobbyInvitations.filter(
      (i) =>
        (i.teamSide === 'teamA' || (match?.teamAId && i.teamId === match.teamAId)) &&
        normalizeInvitationStatus(i.status) === 'PENDING'
    );
  }, [lobbyInvitations, match?.teamAId]);

  const pendingTeamBInvites = React.useMemo(() => {
    return lobbyInvitations.filter(
      (i) =>
        (i.teamSide === 'teamB' || (match?.teamBId && i.teamId === match.teamBId)) &&
        normalizeInvitationStatus(i.status) === 'PENDING'
    );
  }, [lobbyInvitations, match?.teamBId]);

  const mySpecificInvite = React.useMemo(() => {
    if (!user) return null;
    if (invitationId) {
      return lobbyInvitations.find((i) => i.id === invitationId) || null;
    }
    return lobbyInvitations.find((i) => {
      const targetUid = i.recipientId || i.invitedPlayerId;
      return targetUid === user.uid;
    }) || null;
  }, [user, lobbyInvitations, invitationId]);

  const myPendingLobbyInvite = React.useMemo(() => {
    if (!mySpecificInvite) return null;
    if (normalizeInvitationStatus(mySpecificInvite.status) === 'PENDING') {
      if (isInvitationExpired(mySpecificInvite)) return null;
      return mySpecificInvite;
    }
    return null;
  }, [mySpecificInvite]);

  const is1v1Invite = Boolean(
    mySpecificInvite && (
      !match?.is5v5 ||
      mySpecificInvite.type === 'CHESS_MATCH_INVITATION' ||
      mySpecificInvite.type === 'MATCH_INVITATION' ||
      !mySpecificInvite.teamSide
    )
  );

  const isInviteActionable = React.useMemo(() => {
    if (!myPendingLobbyInvite || !match) return false;
    if (isInvitationExpired(myPendingLobbyInvite)) return false;
    if (match.status === 'COMPLETED' || match.status === 'CONFIRMED' || match.status === 'CANCELLED' || match.status === 'REJECTED') {
      return false;
    }
    if (match.status === 'LIVE' || match.status === 'IN_PROGRESS') {
      return false;
    }
    if (!match.is5v5 && match.playerBId && match.opponentAccepted && match.playerBId !== user?.uid) {
      return false;
    }
    if (match.is5v5) {
      const side = myPendingLobbyInvite.teamSide || 'teamA';
      const roster = side === 'teamA' ? (match.teamAPlayerIds || []) : (match.teamBPlayerIds || []);
      if (roster.length >= 5 && (!user || !roster.includes(user.uid))) {
        return false;
      }
    }
    return true;
  }, [myPendingLobbyInvite, match, user]);

  const inviteEndedInfo = React.useMemo(() => {
    if (!mySpecificInvite || !match) return { icon: '⌛', title: 'Invitation Closed', badge: 'CLOSED', description: 'This invitation is no longer active.' };
    const status = normalizeInvitationStatus(mySpecificInvite.status);
    if (isInvitationExpired(mySpecificInvite) || status === 'EXPIRED') {
      return {
        icon: '⌛',
        title: 'Invitation Expired',
        badge: 'EXPIRED',
        description: 'This invitation has expired after 15 minutes. Wait for host to invite a new player or challenge another lobby.',
      };
    }
    if (status === 'ACCEPTED') {
      return { icon: '✅', title: 'Invitation Accepted', badge: 'ACCEPTED', description: 'You have already accepted this match invitation.' };
    }
    if (status === 'DECLINED') {
      return { icon: '❌', title: 'Invitation Declined', badge: 'DECLINED', description: 'You declined this match invitation.' };
    }
    if (match.status === 'CANCELLED' || status === 'CANCELLED') {
      return { icon: '⚠️', title: 'Match Cancelled', badge: 'CANCELLED', description: match.cancellationReason ? `Cancelled: ${match.cancellationReason}` : 'The host cancelled this match.' };
    }
    if (match.status === 'COMPLETED' || match.status === 'CONFIRMED') {
      return { icon: '🏁', title: 'Match Ended', badge: 'ENDED', description: 'This match has already finished.' };
    }
    if (match.status === 'LIVE' || match.status === 'IN_PROGRESS') {
      return { icon: '⚡', title: 'Match In Progress', badge: 'LIVE', description: 'This match has already started and is currently live.' };
    }
    if (!match.is5v5 && match.playerBId && match.opponentAccepted && match.playerBId !== user?.uid) {
      return { icon: '🚫', title: 'Opponent Slot Filled', badge: 'SLOT TAKEN', description: 'Another player accepted the opponent slot for this match.' };
    }
    if (match.is5v5) {
      const side = mySpecificInvite.teamSide || 'teamA';
      const roster = side === 'teamA' ? (match.teamAPlayerIds || []) : (match.teamBPlayerIds || []);
      if (roster.length >= 5 && (!user || !roster.includes(user.uid))) {
        return { icon: '👥', title: 'Squad Roster Full', badge: 'FULL (5/5)', description: `${side === 'teamA' ? 'Team A' : 'Team B'} has already reached maximum capacity (5/5 players).` };
      }
    }
    return { icon: '⌛', title: 'Invitation Expired', badge: 'EXPIRED', description: 'This invitation has expired and is no longer actionable.' };
  }, [mySpecificInvite, match, user]);

  if (loading) {
    return (
      <div className="py-24 text-center">
        <div className="inline-block w-8 h-8 border-3 border-cyan-400 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-slate-400 text-sm font-mono">Connecting to Nexus Match Server...</p>
      </div>
    );
  }

  if (!match) {
    return (
      <div className="max-w-xl mx-auto py-16 text-center">
        <AlertTriangle className="w-12 h-12 text-yellow-400 mx-auto mb-3" />
        <h3 className="text-xl font-bold font-display text-white">Match Not Found</h3>
        <p className="text-sm text-slate-400 mt-1 mb-6">This match may have been deleted or the link is invalid.</p>
        <button
          onClick={onBack}
          className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold uppercase tracking-wider"
        >
          Return to Dashboard
        </button>
      </div>
    );
  }

  const is5v5 = match.matchType === '5v5';
  const teamAPlayerIds = match.teamAPlayerIds || [];
  const teamBPlayerIds = match.teamBPlayerIds || [];
  const isTeamAPlayer = user ? teamAPlayerIds.includes(user.uid) : false;
  const isTeamBPlayer = user ? teamBPlayerIds.includes(user.uid) : false;
  const isParticipant5v5 = isTeamAPlayer || isTeamBPlayer;
  const currentVote5v5 = user
    ? match.votes?.[user.uid] || match.declarations?.[user.uid]?.declaredResult
    : undefined;

  const isTeamACaptain =
    user &&
    (user.uid === match.playerAId ||
      user.uid === match.captainAId ||
      user.uid === match.createdBy ||
      teamAPlayerIds[0] === user.uid);

  const teamBCaptainId = match.captainBId || match.playerBId || null;
  const isTeamBCaptain = Boolean(
    user && teamBCaptainId && user.uid === teamBCaptainId
  );

  // Canonical Lobby Owner (The player who originally created the lobby)
  // Ability to close the lobby is reserved strictly for the Lobby Owner (or Staff/Admin).
  // Team B Captains and general squad members CANNOT close or cancel the lobby.
  const canonicalLobbyOwnerId = match.lobbyOwnerId || match.createdBy || (is5v5 ? undefined : match.playerAId);
  const isLobbyOwner = Boolean(user && canonicalLobbyOwnerId && user.uid === canonicalLobbyOwnerId);
  const canCloseLobby = Boolean(isLobbyOwner || isAuthorizedStaffOrAdmin);

  // Distinct Captain & Management Permissions:
  // Lobby Owner & Team A Captain have global lobby management permissions (manage Team A, manage Team B, add to Team A/B).
  // Team B Captain manages Team B only (add to Team B, manage Team B readiness, remove Team B non-captain members).
  const canManageTeamA = Boolean(isLobbyOwner || isTeamACaptain);
  const canManageTeamB = Boolean(isLobbyOwner || isTeamACaptain || isTeamBCaptain);
  const canAddPlayerToTeamA = Boolean(isLobbyOwner || isTeamACaptain);
  const canAddPlayerToTeamB = Boolean(isLobbyOwner || isTeamACaptain || isTeamBCaptain);

  // Exact Invitation Permissions:
  // Lobby Owner: Team A (YES), Team B (YES)
  // Team A Captain: Team A (YES), Team B (YES)
  // Team B Captain: Team A (NO), Team B (YES)
  // Normal Player: Team A (NO), Team B (NO)
  const canInviteToTeamA = Boolean(isLobbyOwner || isTeamACaptain);
  const canInviteToTeamB = Boolean(isLobbyOwner || isTeamACaptain || isTeamBCaptain);

  const teamAPlayersNeeded = Math.max(0, 5 - teamAPlayerIds.length);
  const teamBPlayersNeeded = Math.max(0, 5 - teamBPlayerIds.length);

  const readyMap = match.playerReadyStatus || {};
  const isCurrentUserReady = user ? !!readyMap[user.uid] : false;
  const teamAReadyCount = teamAPlayerIds.filter((id) => readyMap[id]).length;
  const teamBReadyCount = teamBPlayerIds.filter((id) => readyMap[id]).length;
  const totalReadyCount = teamAReadyCount + teamBReadyCount;
  const all10Present = teamAPlayerIds.length === 5 && teamBPlayerIds.length === 5;
  const all10Ready = all10Present && totalReadyCount === 10;

  const teamAPendingRequests = pendingJoinRequests.filter((r) => r.teamSide === 'teamA');
  const teamBPendingRequests = pendingJoinRequests.filter((r) => r.teamSide === 'teamB');
  const myPendingRequest = user ? pendingJoinRequests.find((r) => r.playerId === user.uid) : null;

  const allVotes = match.votes || {};
  const votesTeamA = Object.values(allVotes).filter((v) => v === 'teamA').length;
  const votesTeamB = Object.values(allVotes).filter((v) => v === 'teamB').length;
  const votesDraw = Object.values(allVotes).filter((v) => v === 'draw').length;
  const totalVotesSubmitted = Object.keys(allVotes).length;

  const isPlayerA = user?.uid === match.playerAId || (is5v5 && isTeamAPlayer);
  const isPlayerB = user?.uid === match.playerBId || (is5v5 && isTeamBPlayer);
  const isParticipant = is5v5 ? isParticipant5v5 : (user?.uid === match.playerAId || user?.uid === match.playerBId);

  const currentDeclaration = is5v5
    ? currentVote5v5
    : isPlayerA
    ? match.playerADeclaration
    : isPlayerB
    ? match.playerBDeclaration
    : null;
  const hasCurrentPlayerDeclared = !!currentDeclaration;

  const handleAnnounceNeedForPlayers = async () => {
    if (!user) return;
    setSubmittingAction(true);
    try {
      const res = await publishLobbyRecruitment({
        matchId: match.id,
        captainId: user.uid,
      });
      if (res.success) {
        showToast(
          'success',
          'Recruitment Announcement Live! 📢',
          `Published on Arena: Squad needs ${teamAPlayersNeeded} player${teamAPlayersNeeded > 1 ? 's' : ''} to complete 5v5 squad.`
        );
      } else {
        showToast('error', 'Could not announce', res.error);
      }
    } catch (err: any) {
      showToast('error', 'Error', err.message);
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleCancelRecruitment = async () => {
    if (!user) return;
    setSubmittingAction(true);
    try {
      const res = await cancelLobbyRecruitment({
        matchId: match.id,
        captainId: user.uid,
      });
      if (res.success) {
        showToast('info', 'Recruitment Cancelled', 'Announcement removed from the Arena.');
      } else {
        showToast('error', 'Could not cancel', res.error);
      }
    } catch (err: any) {
      showToast('error', 'Error', err.message);
    } finally {
      setSubmittingAction(false);
    }
  };

  const handlePublishTeamBAnnouncement = async () => {
    if (!user) return;
    setSubmittingAction(true);
    try {
      const res = await publishTeamBRecruitment({
        matchId: match.id,
        captainId: user.uid,
      });
      if (res.success) {
        showToast('success', 'Team B Recruitment Live! 📢', 'Free agents can now request to join Team B.');
      } else {
        showToast('error', 'Could not publish', res.error);
      }
    } catch (err: any) {
      showToast('error', 'Error', err.message);
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleCancelTeamBAnnouncement = async () => {
    if (!user) return;
    setSubmittingAction(true);
    try {
      const res = await cancelTeamBRecruitment({
        matchId: match.id,
        captainId: user.uid,
      });
      if (res.success) {
        showToast('info', 'Recruitment Cancelled', 'Team B recruitment closed.');
      } else {
        showToast('error', 'Could not cancel', res.error);
      }
    } catch (err: any) {
      showToast('error', 'Error', err.message);
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleOpenInviteModal = (side: 'teamA' | 'teamB') => {
    if (!user) {
      showToast('info', 'Sign in Required', 'Please sign in to invite players.');
      return;
    }
    if (side === 'teamA' && !canInviteToTeamA) {
      showToast('error', 'Unauthorized', 'PERMISSION DENIED: Only the Lobby Owner or Team A Captain can invite players to Team A.');
      return;
    }
    if (side === 'teamB' && !canInviteToTeamB) {
      showToast('error', 'Unauthorized', 'PERMISSION DENIED: Only the Lobby Owner, Team A Captain, or Team B Captain can invite players to Team B.');
      return;
    }
    const currentCount = side === 'teamA' ? teamAPlayerIds.length : teamBPlayerIds.length;
    if (currentCount >= 5) {
      showToast('warning', 'Team Full', `${side === 'teamA' ? 'Team A' : 'Team B'} is already full (5/5).`);
      return;
    }
    setInviteModalTeamSide(side);
  };

  const handleCancelLobbyInvite = async (invitationId: string) => {
    if (!user) return;
    setSubmittingAction(true);
    try {
      const res = await cancel5v5LobbyInvitation({ invitationId, callerId: user.uid });
      if (res.success) {
        showToast('info', 'Invitation Cancelled', 'The player invitation was cancelled.');
      } else {
        showToast('error', 'Could not cancel', res.error || 'Failed to cancel invitation.');
      }
    } catch (err: any) {
      showToast('error', 'Error', err.message);
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleRespondToMyLobbyInvite = async (invitationId: string, response: 'accepted' | 'declined') => {
    if (!user) return;
    setSubmittingAction(true);
    try {
      const activePlayer: Player = playerProfile || ({
        uid: user.uid,
        gamerTag: user.displayName || 'Player',
        fullName: user.displayName || 'Player',
        eloRating: 1000,
        overallRating: 1000,
        wins: 0,
        losses: 0,
        draws: 0,
        streak: 0,
        rank: 'Bronze',
        createdAt: Date.now(),
      } as unknown as Player);

      const res = await respondToTeamInvitation({
        invitationId,
        response,
        player: activePlayer,
      });
      if (res.success) {
        const isChess = match.gameName === 'Chess' || match.gameId === 'chess';
        if (response === 'accepted') {
          showToast(
            'success',
            isChess ? 'Match Accepted! ♟️' : 'Joined Squad! 🎮',
            isChess ? 'Chess 1v1 match accepted and ready to play!' : 'You have joined the 5v5 lobby roster!'
          );
        } else {
          showToast('info', 'Invitation Declined', 'You declined the invitation.');
        }
      } else {
        showToast('error', 'Action failed', res.error || 'Could not process invitation.');
      }
    } catch (err: any) {
      showToast('error', 'Error', err.message);
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleJoinAsSoloCaptain = async () => {
    if (!user) {
      showToast('error', 'Sign In Required', 'Please log in to challenge this lobby.');
      return;
    }

    const authUid = (auth.currentUser?.uid || user.uid || '').trim();
    if (
      isTeamAPlayer ||
      isTeamACaptain ||
      teamAPlayerIds.includes(authUid) ||
      match.captainAId === authUid ||
      match.playerAId === authUid ||
      match.createdBy === authUid
    ) {
      showToast('error', 'Invalid Action', 'You cannot select yourself as an opponent.');
      return;
    }

    setSubmittingAction(true);
    try {
      const res = await joinTeamBAsSoloCaptain({
        matchId: match.id,
        playerId: user.uid,
      });
      if (res.success) {
        showToast(
          'success',
          'You are now Team B Captain! ⚔️',
          `You lead the opposing side for match ${match.lobbyCode}. Recruit players to complete your squad!`
        );
      } else {
        showToast('error', 'Could not join as Captain', res.error);
      }
    } catch (err: any) {
      showToast('error', 'Error', err.message);
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleClaimTeamBCaptaincy = async () => {
    if (!user) {
      showToast('error', 'Sign In Required', 'Please sign in to claim Team B Captaincy.');
      return;
    }

    setSubmittingAction(true);
    try {
      const res = await claimTeamBCaptaincy({
        matchId: match.id,
        playerId: user.uid,
      });
      if (res.success) {
        showToast(
          'success',
          'Team B Captain! ⚔️',
          `You are now Team B Captain for match ${match.lobbyCode}. You can now invite players to Team B!`
        );
      } else {
        showToast('error', 'Could not claim captaincy', res.error);
      }
    } catch (err: any) {
      showToast('error', 'Error', err.message);
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleRequestToJoinTeam = async (teamSide: 'teamA' | 'teamB') => {
    if (!user) {
      showToast('error', 'Sign In Required', 'Please sign in to join a squad.');
      return;
    }

    const authUid = (auth.currentUser?.uid || user.uid || '').trim();
    if (teamSide === 'teamB' && (isTeamAPlayer || isTeamACaptain || teamAPlayerIds.includes(authUid))) {
      showToast('error', 'Invalid Action', 'You cannot select yourself as an opponent.');
      return;
    }
    if (teamSide === 'teamA' && (isTeamBPlayer || isTeamBCaptain || teamBPlayerIds.includes(authUid))) {
      showToast('error', 'Invalid Action', 'You cannot select yourself as an opponent.');
      return;
    }

    setSubmittingAction(true);
    try {
      const res = await requestToJoin5v5Team({
        matchId: match.id,
        playerId: user.uid,
        teamSide,
      });
      if (res.success) {
        showToast(
          'success',
          'Join Request Submitted! 📩',
          `Request sent to ${teamSide === 'teamA' ? match.teamAName || 'Team A' : match.teamBName || 'Team B'} captain.`
        );
      } else {
        showToast('error', 'Could not submit request', res.error);
      }
    } catch (err: any) {
      showToast('error', 'Error', err.message);
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleRespondToJoinRequest = async (requestId: string, decision: 'ACCEPT' | 'REJECT') => {
    if (!user) return;
    setSubmittingAction(true);
    try {
      const res = await respondTo5v5JoinRequest({
        matchId: match.id,
        requestId,
        captainId: user.uid,
        decision,
      });
      if (res.success) {
        showToast(
          decision === 'ACCEPT' ? 'success' : 'info',
          decision === 'ACCEPT' ? 'Player Accepted! 🎉' : 'Request Declined',
          decision === 'ACCEPT' ? 'Player added to squad roster.' : 'Join request was rejected.'
        );
      } else {
        showToast('error', 'Error responding to request', res.error);
      }
    } catch (err: any) {
      showToast('error', 'Error', err.message);
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleRemovePlayer = async (playerId: string, teamSide: 'teamA' | 'teamB') => {
    if (!user) return;
    setSubmittingAction(true);
    try {
      const res = await removePlayerFrom5v5Team({
        matchId: match.id,
        targetPlayerId: playerId,
        callerId: user.uid,
        teamSide,
      });
      if (res.success) {
        showToast('info', 'Player Removed', 'The player was removed from the squad roster.');
      } else {
        showToast('error', 'Could not remove player', res.error);
      }
    } catch (err: any) {
      showToast('error', 'Error', err.message);
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleOpenLeaveLobbyModal = () => {
    if (!user || !match) return;
    const isOwner = isLobbyOwner;
    if (isOwner) {
      const otherTeamAPlayers = teamAPlayerIds.filter((pid) => pid !== user.uid);
      if (otherTeamAPlayers.length > 0) {
        setTransferOwnerTargetId(otherTeamAPlayers[0]);
      } else {
        setTransferOwnerTargetId('');
      }
    }
    setShowLeaveLobbyModal(true);
  };

  const handleConfirmLeaveLobby = async (transferId?: string) => {
    if (!user || !match) return;
    setSubmittingAction(true);
    try {
      const res = await leave5v5Lobby({
        matchId: match.id,
        playerId: user.uid,
        transferToPlayerId: transferId || transferOwnerTargetId || undefined,
      });

      if (res.success) {
        showToast('info', 'Left Lobby', 'You left the 5v5 lobby.');
        setShowLeaveLobbyModal(false);
        onBack();
      } else {
        showToast('error', 'Could not leave lobby', res.error);
      }
    } catch (err: any) {
      showToast('error', 'Error leaving lobby', err.message);
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleSwitchSide = async (targetSide: 'teamA' | 'teamB') => {
    if (!user || !match) return;
    setSubmittingAction(true);
    try {
      const res = await switch5v5TeamSide({
        matchId: match.id,
        playerId: user.uid,
      });

      if (res.success) {
        showToast('success', 'Side Switched', `Switched to ${targetSide === 'teamA' ? 'Team A' : 'Team B'}.`);
      } else {
        showToast('error', 'Could not switch side', res.error);
      }
    } catch (err: any) {
      showToast('error', 'Error switching side', err.message);
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleLeaveSquad = () => {
    handleOpenLeaveLobbyModal();
  };

  const handleConfirmRemoveLobby = async () => {
    if (!user || !match) return;
    setSubmittingAction(true);
    try {
      const res = await remove5v5Lobby({
        matchId: match.id,
        reason: isAdmin ? 'Admin removed 5v5 lobby.' : 'Captain removed 5v5 lobby.',
      });
      if (res.success) {
        showToast('info', 'Lobby Removed', `Lobby ${match.lobbyCode || match.id} has been removed.`);
        setShowRemoveLobbyModal(false);
        onBack();
      } else {
        showToast('error', 'Removal Failed', res.error || 'Failed to remove lobby.');
      }
    } catch (err: any) {
      showToast('error', 'Error', err.message);
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleTogglePlayerReady = async () => {
    if (!user) return;
    setSubmittingAction(true);
    try {
      const res = await togglePlayerReady({
        matchId: match.id,
        playerId: user.uid,
        isReady: !isCurrentUserReady,
      });
      if (res.success) {
        showToast(
          !isCurrentUserReady ? 'success' : 'info',
          !isCurrentUserReady ? 'Marked as READY! 👍' : 'Status: NOT READY ⏳',
          !isCurrentUserReady ? 'Waiting for other players to declare ready.' : 'Set to not ready.'
        );
      } else {
        showToast('error', 'Could not update ready status', res.error);
      }
    } catch (err: any) {
      showToast('error', 'Error', err.message);
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleStart5v5Game = async () => {
    if (!user) return;
    setSubmittingAction(true);
    try {
      const res = await start5v5Match({
        matchId: match.id,
        callerId: user.uid,
      });
      if (res.success) {
        showToast('success', '5v5 Match Started! 🚀', 'Live competitive match is in progress!');
      } else {
        showToast('error', 'Could not start match', res.error);
      }
    } catch (err: any) {
      showToast('error', 'Error starting match', err.message);
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleEnd5v5Game = async () => {
    if (!user) return;
    setSubmittingAction(true);
    try {
      const res = await end5v5Match({
        matchId: match.id,
        callerId: user.uid,
      });
      if (res.success) {
        showToast('info', 'Match Ended — Submit Results', 'Competitors can now vote on the match outcome.');
      } else {
        showToast('error', 'Could not end match', res.error);
      }
    } catch (err: any) {
      showToast('error', 'Error ending match', err.message);
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleConfirm5v5ResultAndAwardNC = async () => {
    if (!user || !isAuthorizedStaffOrAdmin || !match) {
      showToast('error', 'Unauthorized', 'Only authorized Staff or Admins can confirm 5v5 matches and award NC.');
      return;
    }

    const parsedHours = parseFloat(admin5v5Hours);
    if (isNaN(parsedHours) || !isFinite(parsedHours) || parsedHours <= 0) {
      showToast('error', 'Invalid Official Hours', 'Official hours played must be a valid positive number greater than 0.');
      return;
    }

    const selectedWinnerId = admin5v5Outcome === 'teamA'
      ? (match?.teamAId || 'TEAM_A')
      : admin5v5Outcome === 'teamB'
      ? (match?.teamBId || 'TEAM_B')
      : null;

    console.log('WINNER DECLARATION CLICKED', {
      matchId: match?.id,
      'currentUser.uid': user?.uid,
      'currentUser.role': role || playerProfile?.role,
      selectedWinnerId,
      officialHours: parsedHours,
      'match.status': match?.status,
      'match.game': match?.gameName || match?.gameId,
      'match.type': match?.matchType || (match?.is5v5 ? '5v5' : '1v1'),
    });

    setSubmittingAction(true);
    try {
      const res = await adminResolve5v5Match({
        matchId: match.id,
        adminId: user.uid,
        adminName: playerProfile?.gamerTag || 'Nexus Admin',
        outcome: admin5v5Outcome,
        officialHours: parsedHours,
        adminNote: adminNote.trim() || undefined,
      });
      if (res.success) {
        showToast(
          'success',
          'Match Result Confirmed & NC Awarded! 🏆',
          `Official outcome confirmed (${admin5v5Outcome === 'draw' ? 'DRAW' : admin5v5Outcome === 'teamA' ? `${match.teamAName || 'Team A'} Won` : `${match.teamBName || 'Team B'} Won`}). Coins credited based on ${parsedHours} official hour(s).`
        );
      } else {
        showToast('error', 'Confirmation Failed', res.error || 'Failed to confirm result.');
      }
    } catch (err: any) {
      showToast('error', 'Error', err.message);
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleAdminCancel5v5Game = async () => {
    if (!user || !isAuthorizedStaffOrAdmin || !match) {
      showToast('error', 'Unauthorized', 'Only authorized Staff or Admins can cancel matches.');
      return;
    }
    setSubmittingAction(true);
    try {
      const res = await adminResolve5v5Match({
        matchId: match.id,
        adminId: user.uid,
        adminName: playerProfile?.gamerTag || 'Nexus Admin',
        outcome: 'CANCELLED',
        adminNote: adminNote.trim() || 'Match cancelled by Admin override',
      });
      if (res.success) {
        showToast('info', 'Match Cancelled', 'The match was voided and cancelled with no NC or MMR changes.');
      } else {
        showToast('error', 'Action failed', res.error);
      }
    } catch (err: any) {
      showToast('error', 'Error', err.message);
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleAdminDirectResolve1v1 = async (
    outcome: 'playerA' | 'playerB' | 'draw',
    seriesData?: {
      totalGamesPlayed?: number;
      playerAGamesWon?: number;
      playerBGamesWon?: number;
      seriesWinnerId?: string | 'draw' | null;
      ncReward?: number;
    }
  ) => {
    const selectedWinnerId = outcome === 'playerA'
      ? match?.playerAId
      : outcome === 'playerB'
      ? match?.playerBId
      : null;

    console.log('WINNER DECLARATION CLICKED', {
      matchId: match?.id,
      'currentUser.uid': user?.uid,
      'currentUser.role': role || playerProfile?.role,
      selectedWinnerId,
      'match.status': match?.status,
      'match.game': match?.gameName || match?.gameId,
      'match.type': match?.matchType || (match?.is5v5 ? '5v5' : '1v1'),
    });

    if (!user || !isAuthorizedStaffOrAdmin || !match) {
      showToast('error', 'Unauthorized', 'Only authorized Staff or Admins can resolve match outcomes.');
      return;
    }
    setSubmittingAction(true);
    try {
      const res = await resolveDisputedMatch({
        matchId: match.id,
        adminId: user.uid,
        adminName: playerProfile?.gamerTag || 'Nexus Admin',
        outcome,
        adminNote: 'Admin official ruling on 1v1 match',
        totalGamesPlayed: seriesData?.totalGamesPlayed,
        playerAGamesWon: seriesData?.playerAGamesWon,
        playerBGamesWon: seriesData?.playerBGamesWon,
        seriesWinnerId: seriesData?.seriesWinnerId,
        ncReward: seriesData?.ncReward,
      });
      if (res.success) {
        showToast('success', 'Result Confirmed! ⚖️', 'Official winner confirmed, MMR updated, and Nexus Coins awarded.');
      } else {
        showToast('error', 'Failed to resolve', res.error);
      }
    } catch (err: any) {
      showToast('error', 'Error', err.message);
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleAdminCancel1v1 = async () => {
    if (!user || !isAuthorizedStaffOrAdmin || !match) return;
    setSubmittingAction(true);
    try {
      const res = await cancelMatch({
        matchId: match.id,
        actorId: user.uid,
        actorName: playerProfile?.gamerTag || 'Nexus Admin',
        reason: 'Cancelled by Admin referee',
        isAdmin: true,
      });
      if (res.success) {
        showToast('info', 'Match Cancelled', 'The match has been voided with zero rating changes.');
      } else {
        showToast('error', 'Failed to cancel', res.error);
      }
    } catch (err: any) {
      showToast('error', 'Error', err.message);
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleCopyLobbyCode = () => {
    if (!match.lobbyCode) return;
    navigator.clipboard.writeText(match.lobbyCode);
    setCopiedLobbyCode(true);
    setTimeout(() => setCopiedLobbyCode(false), 2000);
    showToast('info', 'Code Copied', `Lobby code ${match.lobbyCode} copied to clipboard.`);
  };

  const handle5v5Vote = async (vote: 'teamA' | 'teamB' | 'draw') => {
    if (!user) return;
    setSubmittingAction(true);
    try {
      const res = await submit5v5Vote({
        matchId: match.id,
        playerId: user.uid,
        vote,
      });
      if (res.success) {
        if (res.status === 'CONFIRMED') {
          showToast('success', '5v5 Match Confirmed!', 'All 10 players voted and agreed. MMR and Team Ratings updated!');
        } else if (res.status === 'PENDING_ADMIN_APPROVAL') {
          showToast('success', 'Consensus Reached! ⚖️', 'All 10 players agreed. Pending official Admin approval before ratings are applied.');
        } else if (res.status === 'DISPUTED') {
          showToast('warning', 'Match Disputed', 'Conflicting votes detected across the 10 players. Flagged for Admin referee.');
        } else {
          showToast('info', 'Vote Recorded', 'Your vote has been submitted. Waiting for other players.');
        }
      } else {
        showToast('error', 'Vote failed', res.error);
      }
    } catch (err: any) {
      showToast('error', 'Error', err.message);
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleStartGame = async () => {
    setSubmittingAction(true);
    try {
      const res = await startApprovedMatch(match.id, user?.uid, playerProfile?.gamerTag);
      if (res.success) {
        showToast('info', 'Match Started!', `Live timer active on Station ${match.station}`);
      } else {
        showToast('error', 'Could not start match', res.error);
      }
    } catch (err: any) {
      showToast('error', 'Could not start match', err.message);
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleAdminApproveInRoom = async () => {
    if (!user || !playerProfile) return;
    setSubmittingAction(true);
    try {
      const res = await approveMatchRequest({
        matchId: match.id,
        adminId: user.uid,
        adminName: playerProfile.gamerTag || 'Nexus Admin',
      });
      if (res.success) {
        showToast('success', 'Match Approved!', 'Players can now start the live game.');
      } else {
        showToast('error', 'Approval failed', res.error);
      }
    } catch (err: any) {
      showToast('error', 'Error approving', err.message);
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleAdminRejectInRoom = async () => {
    if (!user || !playerProfile) return;
    setSubmittingAction(true);
    try {
      const res = await rejectMatchRequest({
        matchId: match.id,
        adminId: user.uid,
        adminName: playerProfile.gamerTag || 'Nexus Admin',
        reason: rejectionReason.trim() || 'Declined by Nexus Staff',
      });
      if (res.success) {
        showToast('warning', 'Match Rejected', 'Request has been rejected.');
        setShowRejectModal(false);
      } else {
        showToast('error', 'Rejection failed', res.error);
      }
    } catch (err: any) {
      showToast('error', 'Error rejecting', err.message);
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleDeclare = async (
    declaration: PlayerDeclaration,
    seriesScore?: { gamesWon: number; gamesLost: number }
  ) => {
    if (!user || !match) return;

    const selectedWinnerId = declaration === 'WIN'
      ? (user.uid === match.playerAId ? match.playerAId : match.playerBId)
      : declaration === 'LOSS'
      ? (user.uid === match.playerAId ? match.playerBId : match.playerAId)
      : null;

    console.log('WINNER DECLARATION CLICKED', {
      matchId: match.id,
      'currentUser.uid': user.uid,
      'currentUser.role': role || playerProfile?.role,
      selectedWinnerId,
      'match.status': match.status,
      'match.game': match.gameName || match.gameId,
      'match.type': match.matchType || (match.is5v5 ? '5v5' : '1v1'),
    });

    setSubmittingAction(true);
    try {
      const res = await submitPlayerDeclaration(match.id, user.uid, declaration, seriesScore);
      if (res.success) {
        if (res.status === 'CONFIRMED') {
          showToast('success', 'Match Confirmed!', 'Result confirmed and ELO ratings updated!');
        } else if (res.status === 'DISPUTED') {
          showToast('warning', 'Match Disputed', 'Conflicting declarations submitted. Sent to Admin.');
        } else {
          showToast('info', 'Declaration Locked', 'Declaration recorded. Awaiting final Admin confirmation.');
        }
      } else {
        showToast('error', 'Error submitting result', res.error);
      }
    } catch (err: any) {
      showToast('error', 'Failed to submit', err.message);
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleAdminResolve = async () => {
    if (!user || !selectedAdminOutcome || !playerProfile || !isAuthorizedStaffOrAdmin || !match) return;

    const selectedWinnerId = selectedAdminOutcome === 'playerA'
      ? (is5v5 ? (match.teamAId || 'TEAM_A') : match.playerAId)
      : selectedAdminOutcome === 'playerB'
      ? (is5v5 ? (match.teamBId || 'TEAM_B') : match.playerBId)
      : null;

    console.log('WINNER DECLARATION CLICKED', {
      matchId: match.id,
      'currentUser.uid': user.uid,
      'currentUser.role': role || playerProfile.role,
      selectedWinnerId,
      'match.status': match.status,
      'match.game': match.gameName || match.gameId,
      'match.type': match.matchType || (match.is5v5 ? '5v5' : '1v1'),
    });

    setSubmittingAction(true);
    try {
      const res = await resolveDisputedMatch({
        matchId: match.id,
        adminId: user.uid,
        adminName: playerProfile.gamerTag || 'Nexus Admin',
        outcome: selectedAdminOutcome,
        adminNote: adminNote.trim() || 'Official Nexus Admin ruling',
      });

      if (res.success) {
        showToast('success', 'Dispute Resolved!', 'Official winner confirmed and ELO recalculation applied.');
        setShowAdminResolveModal(false);
      } else {
        showToast('error', 'Failed to resolve', res.error);
      }
    } catch (err: any) {
      showToast('error', 'Error resolving dispute', err.message);
    } finally {
      setSubmittingAction(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      {/* Top Breadcrumb & Status */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-cyan-400 transition-colors uppercase tracking-wider font-mono"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>BACK TO ARENA</span>
        </button>

        <div className="flex items-center gap-3">
          <div className="px-3 py-1 rounded-xl bg-[#0a0a0f] border border-slate-800 text-xs font-mono font-bold text-slate-300">
            STATION: <span className="text-cyan-400">{match.station}</span>
          </div>

          {is5v5 && (
            <div className="px-3 py-1 rounded-xl bg-[#0a0a0f] border border-cyan-500/30 text-xs font-mono font-bold text-cyan-400">
              💻 PCs: {match.pcCount || 10}
            </div>
          )}

          <div
            className={`px-3 py-1 rounded-xl text-xs font-mono font-bold uppercase tracking-wider flex items-center gap-1.5 ${
              match.status === 'WAITING_FOR_ADMIN'
                ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/40 animate-pulse'
                : match.status === 'APPROVED'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : match.status === 'REJECTED'
                ? 'bg-red-500/20 text-red-300 border border-red-500/40'
                : match.status === 'CANCELLED'
                ? 'bg-slate-700 text-slate-300 border border-slate-600'
                : match.status === 'LIVE'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/50 animate-pulse shadow-[0_0_10px_rgba(34,211,238,0.3)]'
                : match.status === 'CONFIRMED'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : match.status === 'DISPUTED'
                ? 'bg-red-500/20 text-red-300 border border-red-500/40'
                : 'bg-slate-800 text-slate-400'
            }`}
          >
            {match.status === 'WAITING_FOR_ADMIN' && <Inbox className="w-3.5 h-3.5 text-yellow-400" />}
            {match.status === 'APPROVED' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
            {match.status === 'REJECTED' && <XCircle className="w-3.5 h-3.5 text-red-400" />}
            {match.status === 'CANCELLED' && <XCircle className="w-3.5 h-3.5 text-slate-400" />}
            {match.status === 'LIVE' && <Radio className="w-3.5 h-3.5 animate-spin text-cyan-400" />}
            {match.status === 'CONFIRMED' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
            {match.status === 'DISPUTED' && <AlertTriangle className="w-3.5 h-3.5 text-red-400" />}
            <span>
              STATUS:{' '}
              {match.status === 'WAITING_FOR_ADMIN'
                ? 'WAITING FOR ADMIN'
                : match.status === 'APPROVED'
                ? 'APPROVED (READY)'
                : match.status}
            </span>
          </div>

          {/* Lobby Owner / Admin CLOSE LOBBY Button */}
          {canCloseLobby &&
            (match.status === 'WAITING_FOR_OPPONENT' ||
              match.status === 'OPPONENT_JOINED' ||
              match.status === 'TEAM_ROSTERS_FILLING' ||
              match.status === 'READY_CHECK') && (
              <button
                id="btn-close-5v5-lobby"
                data-testid="btn-close-5v5-lobby"
                onClick={() => setShowRemoveLobbyModal(true)}
                disabled={submittingAction}
                className="px-3 py-1.5 rounded-xl bg-rose-950/40 hover:bg-rose-900/60 border border-rose-500/40 hover:border-rose-400 text-rose-300 hover:text-white text-xs font-mono font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 active:scale-95 shrink-0 shadow-sm cursor-pointer"
                title="Close and remove this lobby"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                <span>CLOSE LOBBY</span>
              </button>
            )}

          {/* Participant LEAVE LOBBY Button */}
          {(isTeamAPlayer || isTeamBPlayer) &&
            match.status !== 'LIVE' &&
            match.status !== 'CONFIRMED' && (
              <button
                id="btn-leave-5v5-lobby"
                onClick={handleOpenLeaveLobbyModal}
                disabled={submittingAction}
                className="px-3 py-1.5 rounded-xl bg-amber-950/40 hover:bg-amber-900/60 border border-amber-500/40 hover:border-amber-400 text-amber-300 hover:text-white text-xs font-mono font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 active:scale-95 shrink-0 shadow-sm cursor-pointer"
                title="Leave this 5v5 lobby / squad"
              >
                <LogOut className="w-3.5 h-3.5 text-amber-400" />
                <span>LEAVE LOBBY</span>
              </button>
            )}

          {/* Admin Force End / Match Override Button */}
          {isAdmin && (match.status === 'LIVE' || match.status === 'AWAITING_CONFIRMATION' || match.status === 'DISPUTED' || match.status === 'WAITING_FOR_ADMIN' || match.status === 'APPROVED' || match.status === 'PENDING') && (
            <button
              onClick={() => setShowForceEndModal(true)}
              className="px-3.5 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-white border border-red-500/40 text-xs font-mono font-black uppercase tracking-wider transition-all shadow-[0_0_15px_rgba(239,68,68,0.3)] flex items-center gap-1.5 active:scale-95 shrink-0"
            >
              <AlertOctagon className="w-3.5 h-3.5" />
              <span>🛑 END MATCH</span>
            </button>
          )}
        </div>
      </div>

      {/* Arena Card */}
      <div className="relative overflow-hidden rounded-3xl bg-[#0a0a0f] border border-slate-800 p-6 sm:p-8 shadow-2xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />

        {/* Game Title & Category */}
        <div className="text-center mb-8">
          <span className="inline-block px-3 py-1 rounded-full text-[10px] font-mono font-black uppercase tracking-wider bg-slate-800 text-cyan-400 border border-slate-700 mb-2">
            {match.gameCategory} RANKED COMPETITIVE
          </span>
          <h1 className="text-3xl sm:text-4xl font-black font-display tracking-tight text-white">
            {match.gameName}
          </h1>
          <p className="text-xs text-slate-400 mt-1 font-mono">Nexus Official MMR Match</p>
        </div>

        {/* Interactive Banner: When viewing user has an invitation to this lobby or 1v1 match */}
        {myPendingLobbyInvite && isInviteActionable ? (
          <div className="p-4 mb-6 rounded-2xl bg-gradient-to-r from-cyan-950/90 via-slate-900 to-indigo-950/90 border border-cyan-400 shadow-xl flex items-center justify-between flex-wrap gap-3 animate-in fade-in">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 flex items-center justify-center text-xl shrink-0">
                {myPendingLobbyInvite.teamLogo || (is1v1Invite ? (match.gameName === 'Chess' ? '♟️' : '🎮') : '🛡️')}
              </div>
              <div>
                <div className="text-sm font-bold text-white flex items-center gap-2 flex-wrap">
                  <span>
                    {is1v1Invite
                      ? `You have been challenged to a ${match.gameName} 1v1 match!`
                      : `You have been invited to join ${myPendingLobbyInvite.teamSide === 'teamB' ? (match.teamBName || 'Team B') : (match.teamAName || 'Team A')}!`}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[10px] font-mono font-bold">
                    {is1v1Invite
                      ? `${match.gameName.toUpperCase()} 1V1`
                      : `[${myPendingLobbyInvite.teamSide === 'teamB' ? (match.teamBTag || 'TEAM B') : (match.teamATag || 'TEAM A')}]`}
                  </span>
                  <InvitationCountdownBadge
                    expiresAt={myPendingLobbyInvite.expiresAt}
                    createdAt={myPendingLobbyInvite.createdAt}
                    size="sm"
                  />
                </div>
                <p className="text-xs text-slate-300 font-mono mt-0.5">
                  Invited by <strong className="text-cyan-400">{myPendingLobbyInvite.inviterGamerTag || 'Opponent'}</strong> • Station {match.station}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => handleRespondToMyLobbyInvite(myPendingLobbyInvite.id, 'declined')}
                disabled={submittingAction}
                className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono font-bold transition-colors disabled:opacity-50"
              >
                Decline
              </button>
              <button
                type="button"
                onClick={() => handleRespondToMyLobbyInvite(myPendingLobbyInvite.id, 'accepted')}
                disabled={submittingAction}
                className="px-4 py-1.5 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-black text-xs font-mono font-bold uppercase transition-all shadow-md flex items-center gap-1.5 disabled:opacity-50"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{is1v1Invite ? 'Accept Match' : 'Accept & Join'}</span>
              </button>
            </div>
          </div>
        ) : mySpecificInvite && !isInviteActionable && (
          <div className="p-4 mb-6 rounded-2xl bg-slate-900/90 border border-slate-700 shadow-xl flex items-center justify-between flex-wrap gap-3 animate-in fade-in">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 text-slate-400 flex items-center justify-center text-xl shrink-0">
                {inviteEndedInfo.icon}
              </div>
              <div>
                <div className="text-sm font-bold text-slate-200 flex items-center gap-2">
                  <span>{inviteEndedInfo.title}</span>
                  <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700 text-[10px] font-mono font-bold">
                    {inviteEndedInfo.badge}
                  </span>
                </div>
                <p className="text-xs text-slate-400 font-mono mt-0.5">
                  {inviteEndedInfo.description}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Universal Match Live Timer & Timestamp Card (1v1, 5v5, Chess, FC, Valorant, CS2) */}
        <div className="mb-8">
          <MatchLiveTimerCard match={match} />
        </div>

        {/* Matchup Grid (1v1 or 5v5) */}
        {is5v5 ? (
          /* 5v5 Team Matchup Display */
          <div className="space-y-6 mb-8">
            {/* Lobby Code & Recruitment Announcement Bar if WAITING_FOR_OPPONENT */}
            {match.status === 'WAITING_FOR_OPPONENT' && (
              <div className="space-y-3">
                <div className="p-5 rounded-2xl bg-neutral-950 border-2 border-red-600/40 text-center space-y-3">
                  <div className="text-xs font-mono font-bold text-red-500 uppercase tracking-widest">
                    5v5 LOBBY OPEN — WAITING FOR OPPOSING TEAM CAPTAIN
                  </div>
                  <div className="inline-flex items-center gap-3 px-4 py-2 bg-neutral-900 border border-white/10 rounded-2xl flex-wrap justify-center">
                    <span className="text-xs font-mono text-neutral-400">Lobby Code:</span>
                    <span className="text-2xl font-mono font-black text-white tracking-widest">
                      {match.lobbyCode}
                    </span>
                    <span className="text-xs font-mono font-bold text-red-500 bg-red-950/40 px-2.5 py-1 rounded-lg border border-red-500/30">
                      💻 PCs: {match.pcCount || 10}
                    </span>
                    <button
                      onClick={handleCopyLobbyCode}
                      className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white text-xs font-mono font-bold rounded-lg transition-colors flex items-center gap-1 shadow-sm"
                    >
                      {copiedLobbyCode ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedLobbyCode ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                  <p className="text-xs text-neutral-400 max-w-md mx-auto">
                    Share this code with the opposing captain. They will join with their 5-player squad!
                  </p>
                </div>

                {/* Recruitment Announcement Controls */}
                {teamAPlayersNeeded > 0 ? (
                  <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full bg-amber-400 shrink-0 animate-pulse" />
                      <div>
                        <div className="text-xs font-mono font-bold text-amber-400 uppercase flex items-center gap-2">
                          <Users className="w-3.5 h-3.5" />
                          <span>Squad has {teamAPlayerIds.length}/5 Players — NEED {teamAPlayersNeeded} PLAYER{teamAPlayersNeeded > 1 ? 'S' : ''}</span>
                        </div>
                        <div className="text-[11px] text-slate-300 mt-0.5">
                          {match.isRecruiting
                            ? '📢 Live on Arena: Players can browse and join your squad directly.'
                            : 'Squad is missing players. Publish an announcement on the Arena to recruit free agents.'}
                        </div>
                      </div>
                    </div>

                    {isTeamACaptain && (
                      <div className="shrink-0">
                        {match.isRecruiting ? (
                          <button
                            onClick={handleCancelRecruitment}
                            disabled={submittingAction}
                            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 font-mono text-xs font-bold transition-all uppercase tracking-wider"
                          >
                            ⏹️ Cancel Announcement
                          </button>
                        ) : (
                          <button
                            onClick={handleAnnounceNeedForPlayers}
                            disabled={submittingAction}
                            className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-black font-mono text-xs font-black transition-all uppercase tracking-wider shadow-lg flex items-center gap-1.5"
                          >
                            <Radio className="w-3.5 h-3.5 animate-pulse" />
                            <span>📢 ANNOUNCE — NEED {teamAPlayersNeeded} PLAYER{teamAPlayersNeeded > 1 ? 'S' : ''}</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center gap-2 text-emerald-400 text-xs font-mono font-bold">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>5v5 Squad Roster Complete (5/5 Players)! Ready for match.</span>
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-11 gap-4 items-start">
              {/* Team A Roster Card */}
              <div
                className={`lg:col-span-5 p-5 rounded-2xl border relative transition-all ${
                  match.status === 'CONFIRMED' && match.winnerId === match.teamAId
                    ? 'bg-cyan-950/30 border-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.25)]'
                    : 'bg-[#15151b] border-slate-800'
                }`}
              >
                <div className="flex items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{match.teamALogo || '🛡️'}</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-black font-display text-white">
                          {match.teamAName}
                        </h3>
                        <span className="px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 font-mono font-bold text-xs">
                          [{match.teamATag}]
                        </span>
                      </div>
                      <div className="text-[10px] font-mono text-slate-400 flex items-center gap-1.5 mt-0.5">
                        <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-bold text-[9px] flex items-center gap-0.5">
                          <Crown className="w-2.5 h-2.5" /> LOBBY OWNER
                        </span>
                        <span>Captain:</span>
                        <strong className="text-white">
                          {livePlayerProfiles[match.playerAId || match.captainAId || teamAPlayerIds[0] || '']?.gamerTag ||
                            match.playerAGamerTag ||
                            'Team A Captain'}
                        </strong>
                      </div>
                    </div>
                  </div>
                  <div className="text-right font-mono">
                    <div className="text-sm font-bold text-cyan-400 font-display">
                      {match.teamARatingBefore || match.teamAAvgRating || 1000}{' '}
                      <span className="text-[10px] text-slate-500">ELO</span>
                    </div>
                    {match.status === 'CONFIRMED' && match.teamARatingChange !== undefined && (
                      <div
                        className={`text-xs font-bold ${
                          match.teamARatingChange >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {match.teamARatingChange >= 0 ? `+${match.teamARatingChange}` : match.teamARatingChange} ELO
                      </div>
                    )}
                  </div>
                </div>

                {/* Team A Captain Recruitment Controls */}
                {isTeamACaptain && (match.status === 'WAITING_FOR_OPPONENT' || match.status === 'TEAM_ROSTERS_FILLING') && (
                  <div className="flex items-center justify-between gap-2 mb-3 p-2 bg-[#0a0a0f] rounded-xl border border-slate-800">
                    <div className="text-[10px] font-mono text-slate-400">Team A Captain:</div>
                    <div className="flex items-center gap-2">
                      {match.isRecruiting ? (
                        <button
                          type="button"
                          onClick={handleCancelRecruitment}
                          disabled={submittingAction}
                          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-mono font-bold"
                        >
                          ⏹️ Cancel Recruitment
                        </button>
                      ) : (
                        teamAPlayersNeeded > 0 && (
                          <button
                            type="button"
                            onClick={handleAnnounceNeedForPlayers}
                            disabled={submittingAction}
                            className="px-2.5 py-1 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 text-[10px] font-mono font-bold flex items-center gap-1"
                          >
                            <Radio className="w-2.5 h-2.5 animate-pulse" />
                            <span>📢 Announce Need ({teamAPlayersNeeded})</span>
                          </button>
                        )
                      )}
                    </div>
                  </div>
                )}

                {/* Team A 5 Player Slots */}
                <div className="space-y-1.5 font-mono text-xs">
                  <div className="flex items-center justify-between text-[10px] uppercase font-bold text-slate-400 mb-1 flex-wrap gap-2">
                    <span>Squad Roster (5 Players):</span>
                    <div className="flex items-center gap-2">
                      <span className={teamAPlayerIds.length === 5 ? 'text-emerald-400' : 'text-amber-400'}>
                        {teamAPlayerIds.length}/5 Active
                      </span>
                      {canInviteToTeamA && match.status !== 'CONFIRMED' && match.status !== 'CANCELLED' && (
                        teamAPlayerIds.length < 5 ? (
                          <button
                            id="btn-invite-team-a-header"
                            type="button"
                            onClick={() => handleOpenInviteModal('teamA')}
                            className="px-2 py-0.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 text-[10px] font-bold font-mono uppercase tracking-wider flex items-center gap-1 transition-all"
                          >
                            <UserPlus className="w-3 h-3" />
                            <span>+ INVITE PLAYER</span>
                          </button>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700 font-mono font-bold text-[9px]">
                            TEAM FULL
                          </span>
                        )
                      )}
                    </div>
                  </div>
                  {[0, 1, 2, 3, 4].map((slotIdx) => {
                    const pid = teamAPlayerIds[slotIdx];
                    if (pid) {
                      const snapshot = match.teamAPlayers?.find((p) => p.id === pid) || match.teamAPlayers?.[slotIdx];
                      const identity = resolvePlayerIdentity({
                        uid: pid,
                        profile: livePlayerProfiles[pid],
                        snapshot,
                        gameId: match.gameId,
                        captainId: match.playerAId || match.captainAId || teamAPlayerIds[0],
                        slotIndex: slotIdx,
                      });
                      const isSlotReady = !!readyMap[pid];
                      const vote = match.votes?.[pid];

                      return (
                        <div
                          key={pid}
                          className="flex items-center justify-between p-2.5 rounded-xl bg-[#0a0a0f] border border-slate-800/80"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-5 h-5 rounded-md bg-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-300 font-mono shrink-0">
                              {slotIdx + 1}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-bold text-slate-100 text-xs truncate">
                                  {identity.gamerTag}
                                </span>
                                {identity.displayName && identity.displayName !== identity.gamerTag && (
                                  <span className="text-[11px] text-slate-400 truncate">
                                    ({identity.displayName})
                                  </span>
                                )}
                                {slotIdx === 0 && (
                                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 text-[10px] font-bold font-mono">
                                    <Crown className="w-2.5 h-2.5" /> CAPTAIN
                                  </span>
                                )}
                                <span
                                  className={`px-1.5 py-0.2 rounded text-[9px] font-bold font-mono ${
                                    isSlotReady
                                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                      : 'bg-slate-800 text-slate-400'
                                  }`}
                                >
                                  {isSlotReady ? 'READY' : 'NOT READY'}
                                </span>
                              </div>
                              {identity.ign && (
                                <div className="text-[10px] font-mono text-cyan-400 mt-0.5">
                                  {identity.ignLabel}: <strong className="text-cyan-300">{identity.ign}</strong>
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[11px] font-mono text-slate-400 font-bold">
                              {identity.rating} <span className="text-[9px] text-slate-500">MMR</span>
                            </span>

                            {/* Live Vote Badge */}
                            {(match.status === 'LIVE' ||
                              match.status === 'AWAITING_RESULTS' ||
                              match.status === 'AWAITING_CONFIRMATION' ||
                              match.status === 'PENDING_ADMIN_APPROVAL' ||
                              match.status === 'DISPUTED') && (
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  vote === 'teamA'
                                    ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                                    : vote === 'teamB'
                                    ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                    : vote === 'draw'
                                    ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                                    : 'text-slate-500 italic'
                                }`}
                              >
                                {vote === 'teamA'
                                  ? 'Voted: TEAM A'
                                  : vote === 'teamB'
                                  ? 'Voted: TEAM B'
                                  : vote === 'draw'
                                  ? 'Voted: DRAW'
                                  : 'Pending vote...'}
                              </span>
                            )}

                            {/* Captain Remove Player button */}
                            {isTeamACaptain && slotIdx > 0 && match.status !== 'CONFIRMED' && match.status !== 'CANCELLED' && (
                              <button
                                type="button"
                                onClick={() => handleRemovePlayer(pid, 'teamA')}
                                disabled={submittingAction}
                                className="p-1 text-slate-500 hover:text-red-400 transition-colors"
                                title="Remove player from Team A"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}

                            {/* Side switch button */}
                            {user?.uid === pid &&
                              teamBPlayerIds.length < 5 &&
                              (match.status === 'WAITING_FOR_OPPONENT' ||
                                match.status === 'OPPONENT_JOINED' ||
                                match.status === 'TEAM_ROSTERS_FILLING' ||
                                match.status === 'READY_CHECK') && (
                                <button
                                  type="button"
                                  onClick={() => handleSwitchSide('teamB')}
                                  disabled={submittingAction}
                                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 text-[10px] font-mono font-bold border border-slate-700 hover:border-cyan-500/40 cursor-pointer"
                                  title="Switch to Team B"
                                >
                                  ⇄ Switch Side
                                </button>
                              )}

                            {/* Self Leave Squad button (available for all slots, captain & member) */}
                            {user?.uid === pid && match.status !== 'LIVE' && match.status !== 'CONFIRMED' && match.status !== 'CANCELLED' && (
                              <button
                                type="button"
                                onClick={handleLeaveSquad}
                                disabled={submittingAction}
                                className="p-1 text-slate-400 hover:text-amber-400 transition-colors cursor-pointer"
                                title="Leave Lobby / Squad"
                              >
                                <LogOut className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    }

                    // Empty Roster Slot
                    return (
                      <div
                        key={`empty-a-${slotIdx}`}
                        className="flex items-center justify-between p-2.5 rounded-xl bg-[#0a0a0f]/40 border border-dashed border-slate-800 text-slate-500"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="w-5 h-5 rounded-md bg-slate-900 border border-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-600 font-mono">
                            {slotIdx + 1}
                          </div>
                          <span className="text-xs font-mono italic">
                            {match.isRecruiting ? '📢 Recruiting Player on Arena...' : 'Empty Slot'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {/* Lobby Owner or Team A Captain can invite to Team A */}
                          {canInviteToTeamA && match.status !== 'CONFIRMED' && match.status !== 'CANCELLED' && (
                            <button
                              id={`btn-invite-slot-a-${slotIdx}`}
                              type="button"
                              onClick={() => handleOpenInviteModal('teamA')}
                              className="px-2 py-1 rounded bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1"
                            >
                              <UserPlus className="w-3 h-3" />
                              <span>Invite Player</span>
                            </button>
                          )}
                          {!isParticipant5v5 && match.status !== 'CONFIRMED' && match.status !== 'CANCELLED' && (
                            myPendingRequest?.teamSide === 'teamA' ? (
                              <span className="text-[10px] font-mono text-cyan-400 animate-pulse">Request Pending ⏳</span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleRequestToJoinTeam('teamA')}
                                disabled={submittingAction}
                                className="px-2.5 py-1 rounded bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 text-[10px] font-bold uppercase tracking-wider"
                              >
                                Request to Join
                              </button>
                            )
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Team A: Pending Invitations Panel */}
                {pendingTeamAInvites.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-slate-800 space-y-2">
                    <div className="text-xs font-bold text-cyan-400 uppercase font-mono flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      <span>Pending Team A Invitations ({pendingTeamAInvites.length}):</span>
                    </div>
                    <div className="space-y-1.5">
                      {pendingTeamAInvites.map((inv) => {
                        const canCancel = isTeamACaptain || user?.uid === inv.inviterId || user?.uid === inv.senderId;
                        return (
                          <div
                            key={inv.id}
                            className="p-2.5 rounded-xl bg-[#0a0a0f] border border-cyan-500/30 flex items-center justify-between gap-2"
                          >
                            <div className="min-w-0 font-mono">
                              <div className="text-xs font-bold text-white truncate">
                                {inv.invitedGamerTag || inv.invitedPlayerGamerTag}
                              </div>
                              <div className="text-[10px] text-slate-400">
                                Invited by: <span className="text-cyan-300 font-bold">{inv.inviterGamerTag || 'Teammate'}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <InvitationCountdownBadge
                                expiresAt={inv.expiresAt}
                                createdAt={inv.createdAt}
                                size="xs"
                              />
                              {canCancel && match.status !== 'CONFIRMED' && match.status !== 'CANCELLED' && (
                                <button
                                  type="button"
                                  onClick={() => handleCancelLobbyInvite(inv.id)}
                                  disabled={submittingAction}
                                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-rose-900/40 text-slate-400 hover:text-rose-300 text-[10px] font-mono font-bold"
                                >
                                  Cancel
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Team A Captain: Pending Join Requests Panel */}
                {isTeamACaptain && teamAPendingRequests.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-slate-800 space-y-2">
                    <div className="text-xs font-bold text-cyan-400 uppercase font-mono flex items-center gap-1.5">
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>Pending Team A Requests ({teamAPendingRequests.length}):</span>
                    </div>
                    <div className="space-y-1.5">
                      {teamAPendingRequests.map((req) => (
                        <div
                          key={req.id}
                          className="p-2.5 rounded-xl bg-[#0a0a0f] border border-cyan-500/30 flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-white truncate">{req.playerGamerTag}</div>
                            {req.playerIGN && (
                              <div className="text-[10px] font-mono text-cyan-400">IGN: {req.playerIGN}</div>
                            )}
                            <div className="text-[10px] font-mono text-slate-400">Rating: {req.playerRating || 1000} MMR</div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleRespondToJoinRequest(req.id, 'ACCEPT')}
                              disabled={submittingAction}
                              className="px-2.5 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold uppercase"
                            >
                              Accept
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRespondToJoinRequest(req.id, 'REJECT')}
                              disabled={submittingAction}
                              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold uppercase"
                            >
                              Decline
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* VS Divider */}
              <div className="lg:col-span-1 text-center font-display font-black text-xl text-slate-600 tracking-wider py-4 lg:py-0">
                VS
              </div>

              {/* Team B Roster Card */}
              <div
                className={`lg:col-span-5 p-5 rounded-2xl border relative transition-all ${
                  match.status === 'CONFIRMED' && match.winnerId === match.teamBId
                    ? 'bg-rose-950/30 border-rose-400 shadow-[0_0_20px_rgba(244,63,94,0.25)]'
                    : 'bg-[#15151b] border-slate-800'
                }`}
              >
                    <div className="flex items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-800">
                      <div className="flex items-center gap-3">
                        <span className="text-3xl">{match.teamBLogo || '⚔️'}</span>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-lg font-black font-display text-white">
                              {match.teamBName && match.teamBName !== 'EMPTY' ? match.teamBName : 'TEAM B'}
                            </h3>
                            <span className="px-2 py-0.5 rounded bg-rose-500/10 border border-rose-500/30 text-rose-400 font-mono font-bold text-xs">
                              [{match.teamBTag && match.teamBTag !== 'TBD' ? match.teamBTag : 'TEAM B'}]
                            </span>
                          </div>
                          <div className="text-[10px] font-mono text-slate-400 flex items-center gap-1.5 mt-0.5 flex-wrap">
                            {teamBCaptainId ? (
                              <>
                                <span className="px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 font-bold text-[9px] flex items-center gap-0.5">
                                  <Crown className="w-2.5 h-2.5" /> TEAM B CAPTAIN
                                </span>
                                <span>Captain:</span>
                                <strong className="text-white">
                                  {livePlayerProfiles[teamBCaptainId]?.gamerTag ||
                                    match.playerBGamerTag ||
                                    'Team B Captain'}
                                </strong>
                              </>
                            ) : (
                              <>
                                <span className="text-slate-500 italic">No Captain Assigned (Optional)</span>
                                {user && teamBPlayerIds.includes(user.uid) && match.status !== 'CONFIRMED' && match.status !== 'CANCELLED' && (
                                  <button
                                    type="button"
                                    onClick={handleClaimTeamBCaptaincy}
                                    disabled={submittingAction}
                                    className="px-2 py-0.5 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-[9px] font-mono font-bold flex items-center gap-1 cursor-pointer transition-colors"
                                  >
                                    <Crown className="w-2.5 h-2.5 text-rose-400" />
                                    <span>Become Team B Captain</span>
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="text-right font-mono">
                        <div className="text-sm font-bold text-rose-400 font-display">
                          {match.teamBRatingBefore || match.teamBAvgRating || 1000}{' '}
                          <span className="text-[10px] text-slate-500">ELO</span>
                        </div>
                        {match.status === 'CONFIRMED' && match.teamBRatingChange !== undefined && (
                          <div
                            className={`text-xs font-bold ${
                              match.teamBRatingChange >= 0 ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {match.teamBRatingChange >= 0 ? `+${match.teamBRatingChange}` : match.teamBRatingChange} ELO
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Team B Captain & Lobby Management Controls */}
                    {canManageTeamB && (match.status === 'WAITING_FOR_OPPONENT' || match.status === 'TEAM_ROSTERS_FILLING') && (
                      <div className="flex items-center justify-between gap-2 mb-3 p-2 bg-[#0a0a0f] rounded-xl border border-slate-800">
                        <div className="text-[10px] font-mono text-slate-400">Team B Management:</div>
                        <div className="flex items-center gap-2">
                          {match.isTeamBRecruiting ? (
                            <button
                              type="button"
                              onClick={handleCancelTeamBAnnouncement}
                              disabled={submittingAction}
                              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-mono font-bold"
                            >
                              ⏹️ Cancel Recruitment
                            </button>
                          ) : (
                            teamBPlayersNeeded > 0 && (
                              <button
                                type="button"
                                onClick={handlePublishTeamBAnnouncement}
                                disabled={submittingAction}
                                className="px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-[10px] font-mono font-bold flex items-center gap-1"
                              >
                                <Radio className="w-2.5 h-2.5 animate-pulse" />
                                <span>📢 Announce Need ({teamBPlayersNeeded})</span>
                              </button>
                            )
                          )}
                          {isTeamBCaptain && (
                            <button
                              type="button"
                              onClick={handleLeaveSquad}
                              disabled={submittingAction}
                              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-red-950/50 text-slate-400 hover:text-red-300 text-[10px] font-mono font-bold transition-colors"
                              title="Step down as Team B Captain"
                            >
                              🚪 Step Down
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Team B 5 Player Slots */}
                    <div className="space-y-1.5 font-mono text-xs">
                      <div className="flex items-center justify-between text-[10px] uppercase font-bold text-slate-400 mb-1 flex-wrap gap-2">
                        <span>Squad Roster (5 Players):</span>
                        <div className="flex items-center gap-2">
                          <span className={teamBPlayerIds.length === 5 ? 'text-emerald-400' : 'text-amber-400'}>
                            {teamBPlayerIds.length}/5 Active
                          </span>
                          {canInviteToTeamB && match.status !== 'CONFIRMED' && match.status !== 'CANCELLED' && (
                            teamBPlayerIds.length < 5 ? (
                              <button
                                id="btn-invite-team-b-header"
                                type="button"
                                onClick={() => handleOpenInviteModal('teamB')}
                                className="px-2 py-0.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-[10px] font-bold font-mono uppercase tracking-wider flex items-center gap-1 transition-all"
                              >
                                <UserPlus className="w-3 h-3" />
                                <span>+ INVITE PLAYER</span>
                              </button>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700 font-mono font-bold text-[9px]">
                                TEAM FULL
                              </span>
                            )
                          )}
                        </div>
                      </div>
                      {[0, 1, 2, 3, 4].map((slotIdx) => {
                        const pid = teamBPlayerIds[slotIdx];
                        if (pid) {
                          const snapshot = match.teamBPlayers?.find((p) => p.id === pid) || match.teamBPlayers?.[slotIdx];
                          const identity = resolvePlayerIdentity({
                            uid: pid,
                            profile: livePlayerProfiles[pid],
                            snapshot,
                            gameId: match.gameId,
                            captainId: teamBCaptainId || undefined,
                            slotIndex: slotIdx,
                          });
                          const isSlotReady = !!readyMap[pid];
                          const vote = match.votes?.[pid];

                          return (
                            <div
                              key={pid}
                              className="flex items-center justify-between p-2.5 rounded-xl bg-[#0a0a0f] border border-slate-800/80"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className="w-5 h-5 rounded-md bg-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-300 font-mono shrink-0">
                                  {slotIdx + 1}
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="font-bold text-slate-100 text-xs truncate">
                                      {identity.gamerTag}
                                    </span>
                                    {identity.displayName && identity.displayName !== identity.gamerTag && (
                                      <span className="text-[11px] text-slate-400 truncate">
                                        ({identity.displayName})
                                      </span>
                                    )}
                                    {teamBCaptainId === pid && (
                                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 text-[10px] font-bold font-mono">
                                        <Crown className="w-2.5 h-2.5" /> CAPTAIN
                                      </span>
                                    )}
                                    {!teamBCaptainId && user?.uid === pid && match.status !== 'CONFIRMED' && match.status !== 'CANCELLED' && (
                                      <button
                                        type="button"
                                        onClick={handleClaimTeamBCaptaincy}
                                        disabled={submittingAction}
                                        className="px-1.5 py-0.5 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-[9px] font-bold font-mono flex items-center gap-0.5 cursor-pointer"
                                        title="Become Team B Captain"
                                      >
                                        <Crown className="w-2.5 h-2.5" />
                                        <span>Become Captain</span>
                                      </button>
                                    )}
                                    <span
                                      className={`px-1.5 py-0.2 rounded text-[9px] font-bold font-mono ${
                                        isSlotReady
                                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                          : 'bg-slate-800 text-slate-400'
                                      }`}
                                    >
                                      {isSlotReady ? 'READY' : 'NOT READY'}
                                    </span>
                                  </div>
                                  {identity.ign && (
                                    <div className="text-[10px] font-mono text-cyan-400 mt-0.5">
                                      {identity.ignLabel}: <strong className="text-cyan-300">{identity.ign}</strong>
                                    </div>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-[11px] font-mono text-slate-400 font-bold">
                                  {identity.rating} <span className="text-[9px] text-slate-500">MMR</span>
                                </span>

                                {/* Live Vote Badge */}
                                {(match.status === 'LIVE' ||
                                  match.status === 'AWAITING_RESULTS' ||
                                  match.status === 'AWAITING_CONFIRMATION' ||
                                  match.status === 'PENDING_ADMIN_APPROVAL' ||
                                  match.status === 'DISPUTED') && (
                                  <span
                                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                      vote === 'teamA'
                                        ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                                        : vote === 'teamB'
                                        ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                        : vote === 'draw'
                                        ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                                        : 'text-slate-500 italic'
                                    }`}
                                  >
                                    {vote === 'teamA'
                                      ? 'Voted: TEAM A'
                                      : vote === 'teamB'
                                      ? 'Voted: TEAM B'
                                      : vote === 'draw'
                                      ? 'Voted: DRAW'
                                      : 'Pending vote...'}
                                  </span>
                                )}

                                {/* Captain / Manager Remove Player button */}
                                {canManageTeamB && (slotIdx > 0 || !teamBCaptainId || teamBCaptainId !== pid) && match.status !== 'CONFIRMED' && match.status !== 'CANCELLED' && (
                                  <button
                                    type="button"
                                    onClick={() => handleRemovePlayer(pid, 'teamB')}
                                    disabled={submittingAction}
                                    className="p-1 text-slate-500 hover:text-red-400 transition-colors"
                                    title="Remove player from Team B"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}

                                {/* Side switch button */}
                                {user?.uid === pid &&
                                  teamAPlayerIds.length < 5 &&
                                  (match.status === 'WAITING_FOR_OPPONENT' ||
                                    match.status === 'OPPONENT_JOINED' ||
                                    match.status === 'TEAM_ROSTERS_FILLING' ||
                                    match.status === 'READY_CHECK') && (
                                    <button
                                      type="button"
                                      onClick={() => handleSwitchSide('teamA')}
                                      disabled={submittingAction}
                                      className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-rose-300 text-[10px] font-mono font-bold border border-slate-700 hover:border-rose-500/40 cursor-pointer"
                                      title="Switch to Team A"
                                    >
                                      ⇄ Switch Side
                                    </button>
                                  )}

                                {/* Self Leave Squad button */}
                                {user?.uid === pid && match.status !== 'LIVE' && match.status !== 'CONFIRMED' && match.status !== 'CANCELLED' && (
                                  <button
                                    type="button"
                                    onClick={handleLeaveSquad}
                                    disabled={submittingAction}
                                    className="p-1 text-slate-400 hover:text-amber-400 transition-colors cursor-pointer"
                                    title="Leave Lobby / Squad"
                                  >
                                    <LogOut className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        }

                        // Empty Roster Slot
                        return (
                          <div
                            key={`empty-b-${slotIdx}`}
                            className="flex items-center justify-between p-2.5 rounded-xl bg-[#0a0a0f]/40 border border-dashed border-slate-800 text-slate-500"
                          >
                            <div className="flex items-center gap-2.5">
                              <div className="w-5 h-5 rounded-md bg-slate-900 border border-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-600 font-mono">
                                {slotIdx + 1}
                              </div>
                              <span className="text-xs font-mono italic">
                                {match.isTeamBRecruiting ? '📢 Recruiting Player on Arena...' : 'Empty'}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              {/* Lobby Owner, Team A Captain, or Team B Captain can invite into slot B */}
                              {canInviteToTeamB && match.status !== 'CONFIRMED' && match.status !== 'CANCELLED' && (
                                <button
                                  id={`btn-invite-slot-b-${slotIdx}`}
                                  type="button"
                                  onClick={() => handleOpenInviteModal('teamB')}
                                  className="px-2 py-1 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 cursor-pointer transition-colors"
                                >
                                  <UserPlus className="w-3 h-3" />
                                  <span>Invite Player</span>
                                </button>
                              )}
                              {!isParticipant5v5 && match.status !== 'CONFIRMED' && match.status !== 'CANCELLED' && (
                                myPendingRequest?.teamSide === 'teamB' ? (
                                  <span className="text-[10px] font-mono text-rose-400 animate-pulse">Request Pending ⏳</span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleRequestToJoinTeam('teamB')}
                                    disabled={submittingAction}
                                    className="px-2.5 py-1 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-[10px] font-bold uppercase tracking-wider cursor-pointer transition-colors"
                                  >
                                    Request to Join
                                  </button>
                                )
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Team B: Non-participant Challenge Options when Team B is Empty */}
                    {!isParticipant5v5 && teamBPlayerIds.length === 0 && match.status !== 'CONFIRMED' && match.status !== 'CANCELLED' && (
                      <div className="mt-4 pt-3 border-t border-slate-800 space-y-2">
                        <div className="text-[11px] font-mono text-slate-400 text-center">
                          Challenge this 5v5 Lobby:
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={handleJoinAsSoloCaptain}
                            disabled={submittingAction}
                            className="p-2.5 rounded-xl bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-400 hover:to-rose-500 text-black font-bold text-xs flex items-center justify-center gap-1.5 shadow-md uppercase tracking-wider transition-all cursor-pointer"
                          >
                            <Crown className="w-3.5 h-3.5" />
                            <span>Become Team B Captain</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowJoinSquadModal(true)}
                            disabled={submittingAction}
                            className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 border border-slate-700 uppercase tracking-wider transition-all cursor-pointer"
                          >
                            <Shield className="w-3.5 h-3.5 text-rose-400" />
                            <span>Enter with Registered Squad</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Team B: Pending Invitations Panel */}
                    {pendingTeamBInvites.length > 0 && (
                      <div className="mt-4 pt-3 border-t border-slate-800 space-y-2">
                        <div className="text-xs font-bold text-rose-400 uppercase font-mono flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5" />
                          <span>Pending Team B Invitations ({pendingTeamBInvites.length}):</span>
                        </div>
                        <div className="space-y-1.5">
                          {pendingTeamBInvites.map((inv) => {
                            const canCancel = isTeamBCaptain || user?.uid === inv.inviterId || user?.uid === inv.senderId;
                            return (
                              <div
                                key={inv.id}
                                className="p-2.5 rounded-xl bg-[#0a0a0f] border border-rose-500/30 flex items-center justify-between gap-2"
                              >
                                <div className="min-w-0 font-mono">
                                  <div className="text-xs font-bold text-white truncate">
                                    {inv.invitedGamerTag || inv.invitedPlayerGamerTag}
                                  </div>
                                  <div className="text-[10px] text-slate-400">
                                    Invited by: <span className="text-rose-300 font-bold">{inv.inviterGamerTag || 'Teammate'}</span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <InvitationCountdownBadge
                                    expiresAt={inv.expiresAt}
                                    createdAt={inv.createdAt}
                                    size="xs"
                                  />
                                  {canCancel && match.status !== 'CONFIRMED' && match.status !== 'CANCELLED' && (
                                    <button
                                      type="button"
                                      onClick={() => handleCancelLobbyInvite(inv.id)}
                                      disabled={submittingAction}
                                      className="px-2 py-0.5 rounded bg-slate-800 hover:bg-rose-900/40 text-slate-400 hover:text-rose-300 text-[10px] font-mono font-bold"
                                    >
                                      Cancel
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Team B Join Requests Panel */}
                    {canManageTeamB && teamBPendingRequests.length > 0 && (
                      <div className="mt-4 pt-3 border-t border-slate-800 space-y-2">
                        <div className="text-xs font-bold text-rose-400 uppercase font-mono flex items-center gap-1.5">
                          <UserPlus className="w-3.5 h-3.5" />
                          <span>Pending Team B Requests ({teamBPendingRequests.length}):</span>
                        </div>
                        <div className="space-y-1.5">
                          {teamBPendingRequests.map((req) => (
                            <div
                              key={req.id}
                              className="p-2.5 rounded-xl bg-[#0a0a0f] border border-rose-500/30 flex items-center justify-between gap-2"
                            >
                              <div className="min-w-0">
                                <div className="text-xs font-bold text-white truncate">{req.playerGamerTag}</div>
                                {req.playerIGN && (
                                  <div className="text-[10px] font-mono text-rose-400">IGN: {req.playerIGN}</div>
                                )}
                                <div className="text-[10px] font-mono text-slate-400">Rating: {req.playerRating || 1000} MMR</div>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => handleRespondToJoinRequest(req.id, 'ACCEPT')}
                                  disabled={submittingAction}
                                  className="px-2.5 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold uppercase"
                                >
                                  Accept
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRespondToJoinRequest(req.id, 'REJECT')}
                                  disabled={submittingAction}
                                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold uppercase"
                                >
                                  Decline
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
              </div>
            </div>

            {/* 5v5 READY CHECK & MATCH LIFECYCLE CONTROLS */}
            <div className="p-5 rounded-2xl bg-[#121218] border border-slate-800 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2 font-mono">
                  <UserCheck className="w-4 h-4 text-cyan-400" />
                  <span className="text-xs font-bold text-white uppercase tracking-wider">
                    5v5 Ready Status:
                  </span>
                  <span className="text-xs font-bold text-slate-300">
                    Team A ({teamAReadyCount}/5) • Team B ({teamBReadyCount}/5)
                  </span>
                </div>
                <div className="text-xs font-mono font-bold">
                  <span className={all10Ready ? 'text-emerald-400' : 'text-amber-400'}>
                    Total: {totalReadyCount}/10 Ready
                  </span>
                </div>
              </div>

              {/* Player Ready Toggle */}
              {isParticipant5v5 && (match.status === 'WAITING_FOR_OPPONENT' || match.status === 'TEAM_ROSTERS_FILLING' || match.status === 'READY_CHECK' || match.status === 'WAITING_FOR_ADMIN' || match.status === 'APPROVED' || match.status === 'PENDING') && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 bg-[#0a0a0f] rounded-xl border border-slate-800">
                  <div className="text-xs font-mono text-slate-300">
                    Your Status:{' '}
                    <strong className={isCurrentUserReady ? 'text-emerald-400' : 'text-amber-400'}>
                      {isCurrentUserReady ? 'READY FOR MATCH 👍' : 'NOT READY ⏳'}
                    </strong>
                  </div>
                  <button
                    type="button"
                    onClick={handleTogglePlayerReady}
                    disabled={submittingAction}
                    className={`px-4 py-2 rounded-xl font-mono text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${
                      isCurrentUserReady
                        ? 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                        : 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-lg shadow-emerald-500/20 font-black'
                    }`}
                  >
                    <ThumbsUp className="w-3.5 h-3.5" />
                    <span>{isCurrentUserReady ? 'Set to Not Ready' : 'I Am Ready'}</span>
                  </button>
                </div>
              )}

              {/* 5v5 Rejection Banner */}
              {match.status === 'REJECTED' && (
                <div className="p-4 rounded-2xl bg-red-950/30 border border-red-500/40 text-center space-y-2">
                  <div className="flex items-center justify-center gap-2 text-red-400 font-mono text-xs font-bold uppercase tracking-wider">
                    <XCircle className="w-4 h-4" />
                    <span>5V5 MATCH REJECTED BY ADMIN</span>
                  </div>
                  <p className="text-xs text-red-300 font-medium">
                    Reason: {match.rejectionReason || 'Declined by Nexus Staff'}.
                  </p>
                  <p className="text-[11px] text-slate-400">
                    This match cannot be started. Please consult with arena staff or re-open the lobby.
                  </p>
                </div>
              )}

              {/* 5v5 Admin Approval Workflow */}
              {(match.status === 'WAITING_FOR_ADMIN' || match.status === 'PENDING_ADMIN_APPROVAL') && (
                <div className="space-y-3 pt-2">
                  {isAdmin ? (
                    <div className="p-6 rounded-2xl bg-yellow-500/10 border-2 border-yellow-500/40 text-center space-y-4 shadow-xl">
                      <div className="flex items-center justify-center gap-2 text-yellow-400 font-mono text-xs font-black uppercase tracking-wider">
                        <ShieldAlert className="w-4 h-4" />
                        <span>REFEREE ACTION REQUIRED: 5V5 LOBBY READY FOR APPROVAL</span>
                      </div>
                      <div>
                        <h4 className="text-base font-black font-display text-white">
                          {match.teamAName || 'Team A'} vs {match.teamBName || 'Team B'} ({match.gameName})
                        </h4>
                        <p className="text-xs text-slate-300 mt-1 max-w-lg mx-auto">
                          All 10 competitors have checked in ready. Verify Station {match.station} setup and authorize this match to begin.
                        </p>
                      </div>
                      <div className="flex items-center justify-center gap-3 pt-2">
                        <button
                          type="button"
                          onClick={handleAdminApproveInRoom}
                          disabled={submittingAction}
                          className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-black font-display font-black text-xs uppercase tracking-wider shadow-lg transition-all"
                        >
                          {submittingAction ? 'Approving...' : '✅ Approve 5v5 Match'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowRejectModal(true)}
                          disabled={submittingAction}
                          className="px-6 py-2.5 rounded-xl bg-red-600/80 hover:bg-red-600 border border-red-500/60 text-white font-display font-black text-xs uppercase tracking-wider transition-all"
                        >
                          ❌ Reject Lobby
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="p-5 rounded-2xl bg-yellow-500/10 border border-yellow-500/30 text-center space-y-2">
                      <div className="flex items-center justify-center gap-2 text-yellow-400 font-mono text-xs font-bold uppercase tracking-wider">
                        <Clock className="w-4 h-4 animate-spin" />
                        <span>5V5 MATCH READY — PENDING ADMIN APPROVAL</span>
                      </div>
                      <p className="text-xs text-slate-300 max-w-md mx-auto">
                        All 10 competitors are ready! Nexus Staff has received notification to inspect Station {match.station} and approve your match before play begins. Neither team can start until approved.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* 5v5 Approved Match Start */}
              {match.status === 'APPROVED' && (
                <div className="space-y-4 pt-2">
                  <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-center">
                    <div className="text-xs font-mono font-bold text-emerald-400 flex items-center justify-center gap-2">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>ADMIN APPROVAL GRANTED — STATION {match.station}</span>
                    </div>
                    <p className="text-[11px] text-slate-300 mt-1">
                      Nexus Staff has authorized this match. The lobby owner or referee can now launch live gameplay.
                    </p>
                  </div>
                  {isTeamACaptain || isAdmin ? (
                    <div className="text-center">
                      <button
                        type="button"
                        onClick={handleStart5v5Game}
                        disabled={submittingAction}
                        className="w-full sm:w-auto px-8 py-3.5 rounded-xl font-display font-black text-sm uppercase tracking-wider transition-all bg-gradient-to-r from-emerald-400 to-cyan-400 hover:from-emerald-300 hover:to-cyan-300 text-black shadow-[0_0_25px_rgba(52,211,153,0.3)] animate-pulse"
                      >
                        {submittingAction ? 'Starting Match...' : '🚀 START 5v5 MATCH NOW'}
                      </button>
                    </div>
                  ) : (
                    <div className="p-2.5 rounded-xl bg-[#0a0a0f] border border-slate-800 text-xs font-mono text-emerald-400 text-center">
                      ✅ Admin approved! Awaiting Lobby Owner (Team A Captain) to launch match.
                    </div>
                  )}
                </div>
              )}

              {/* Pre-Match Preparation (Waiting for players & ready checks) */}
              {(match.status === 'WAITING_FOR_OPPONENT' || match.status === 'TEAM_ROSTERS_FILLING' || match.status === 'READY_CHECK' || match.status === 'PENDING') && (
                <div className="text-center pt-2">
                  <div className="p-3 rounded-xl bg-[#0a0a0f] border border-slate-800 text-xs font-mono text-slate-400 space-y-1">
                    <div>
                      {!all10Present
                        ? `Squad rosters filling: Team A (${teamAPlayerIds.length}/5), Team B (${teamBPlayerIds.length}/5).`
                        : `Ready check: ${totalReadyCount}/10 competitors ready.`}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      When all 10 players are ready, match transitions to Admin Approval before live play can begin.
                    </div>
                  </div>
                </div>
              )}

              {/* Live Match Active Controls */}
              {match.status === 'LIVE' && (
                <div className="p-4 rounded-xl bg-cyan-950/20 border border-cyan-500/40 text-center space-y-3">
                  <div className="flex items-center justify-center gap-2 text-cyan-400 font-mono text-xs font-bold uppercase tracking-widest animate-pulse">
                    <Radio className="w-4 h-4" />
                    <span>5v5 MATCH IN PROGRESS ON STATION {match.station}</span>
                  </div>
                  {(isTeamACaptain || isTeamBCaptain || isAdmin) && (
                    <button
                      type="button"
                      onClick={handleEnd5v5Game}
                      disabled={submittingAction}
                      className="px-6 py-2.5 rounded-xl bg-red-500 hover:bg-red-400 text-white font-mono text-xs font-bold uppercase tracking-wider transition-all shadow-md"
                    >
                      🏁 End Game & Open Result Voting
                    </button>
                  )}
                </div>
              )}

              {/* Result Voting Section (10-Player Mutual Vote) */}
              {(match.status === 'AWAITING_RESULTS' || match.status === 'AWAITING_CONFIRMATION') && (
                <div className="p-4 rounded-xl bg-[#0a0a0f] border border-cyan-500/30 space-y-3">
                  <div className="flex items-center justify-between gap-3 pb-2 border-b border-slate-800">
                    <div className="text-xs font-mono font-bold text-cyan-400 uppercase tracking-wider">
                      Submit Official Match Result:
                    </div>
                    <div className="text-xs font-mono text-slate-400">
                      Votes: <strong className="text-white">{totalVotesSubmitted}/10</strong> Submitted
                    </div>
                  </div>

                  {isParticipant5v5 && (
                    <div className="space-y-2">
                      <div className="text-[11px] font-mono text-slate-300">
                        Select outcome:
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <button
                          type="button"
                          onClick={() => handle5v5Vote('teamA')}
                          disabled={submittingAction}
                          className={`p-3 rounded-xl border font-bold text-xs uppercase tracking-wider transition-all ${
                            currentVote5v5 === 'teamA'
                              ? 'bg-cyan-400 text-black border-cyan-400 font-black'
                              : 'bg-[#15151b] border-slate-800 text-cyan-300 hover:border-cyan-500/50'
                          }`}
                        >
                          🛡️ {match.teamAName} Won
                        </button>
                        <button
                          type="button"
                          onClick={() => handle5v5Vote('teamB')}
                          disabled={submittingAction}
                          className={`p-3 rounded-xl border font-bold text-xs uppercase tracking-wider transition-all ${
                            currentVote5v5 === 'teamB'
                              ? 'bg-rose-400 text-black border-rose-400 font-black'
                              : 'bg-[#15151b] border-slate-800 text-rose-300 hover:border-rose-500/50'
                          }`}
                        >
                          ⚔️ {match.teamBName || 'Team B'} Won
                        </button>
                        <button
                          type="button"
                          onClick={() => handle5v5Vote('draw')}
                          disabled={submittingAction}
                          className={`p-3 rounded-xl border font-bold text-xs uppercase tracking-wider transition-all ${
                            currentVote5v5 === 'draw'
                              ? 'bg-yellow-400 text-black border-yellow-400 font-black'
                              : 'bg-[#15151b] border-slate-800 text-yellow-300 hover:border-yellow-500/50'
                          }`}
                        >
                          🤝 Mutual Draw
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Live Vote Audit */}
                  <div className="p-2.5 rounded-lg bg-[#15151b] text-xs font-mono text-slate-300 flex flex-wrap items-center justify-between gap-2">
                    <span>{match.teamAName}: <strong className="text-cyan-400">{votesTeamA}</strong></span>
                    <span>•</span>
                    <span>{match.teamBName || 'Team B'}: <strong className="text-rose-400">{votesTeamB}</strong></span>
                    <span>•</span>
                    <span>Draw: <strong className="text-yellow-400">{votesDraw}</strong></span>
                    <span>•</span>
                    <span className="text-slate-400">{10 - totalVotesSubmitted} votes pending</span>
                  </div>

                  {/* Live Squad Declarations Audit */}
                  {totalVotesSubmitted > 0 && (
                    <div className="pt-2 border-t border-slate-800/80 space-y-2">
                      <div className="text-[11px] font-mono font-bold text-slate-300 uppercase tracking-wider">
                        Submitted Declarations:
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {/* Team A */}
                        <div className="p-2.5 rounded-lg bg-[#0a0a0f] border border-cyan-500/20 space-y-1.5">
                          <div className="text-[10px] font-mono font-bold text-cyan-400 uppercase flex items-center justify-between">
                            <span>🛡️ {match.teamAName || 'Team A'}</span>
                            <span className="text-slate-500">Declared</span>
                          </div>
                          {get5v5TeamPlayersList(match, 'teamA').map((p) => {
                            const decl = getPlayerDeclarationValue(match, p.id, 'teamA');
                            const display = formatDeclarationDisplay(decl, {
                              teamSide: 'teamA',
                              teamAName: match.teamAName,
                              teamBName: match.teamBName,
                              is5v5: true,
                            });
                            return (
                              <div key={p.id} className="flex items-center justify-between text-[11px] font-mono">
                                <span className="text-slate-200 truncate">{p.gamerTag}</span>
                                <span className={display.badgeClass}>{display.text}</span>
                              </div>
                            );
                          })}
                        </div>
                        {/* Team B */}
                        <div className="p-2.5 rounded-lg bg-[#0a0a0f] border border-rose-500/20 space-y-1.5">
                          <div className="text-[10px] font-mono font-bold text-rose-400 uppercase flex items-center justify-between">
                            <span>⚔️ {match.teamBName || 'Team B'}</span>
                            <span className="text-slate-500">Declared</span>
                          </div>
                          {get5v5TeamPlayersList(match, 'teamB').map((p) => {
                            const decl = getPlayerDeclarationValue(match, p.id, 'teamB');
                            const display = formatDeclarationDisplay(decl, {
                              teamSide: 'teamB',
                              teamAName: match.teamAName,
                              teamBName: match.teamBName,
                              is5v5: true,
                            });
                            return (
                              <div key={p.id} className="flex items-center justify-between text-[11px] font-mono">
                                <span className="text-slate-200 truncate">{p.gamerTag}</span>
                                <span className={display.badgeClass}>{display.text}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Status: PENDING_ADMIN_APPROVAL / PENDING ADMIN/STAFF CONFIRMATION */}
              {match.status === 'PENDING_ADMIN_APPROVAL' && (
                <div className="p-5 rounded-xl bg-amber-500/10 border-2 border-amber-500/40 text-center space-y-2">
                  <div className="flex items-center justify-center gap-2 text-amber-400 font-mono text-xs font-bold uppercase tracking-widest">
                    <ShieldCheck className="w-5 h-5" />
                    <span>PENDING ADMIN/STAFF CONFIRMATION</span>
                  </div>
                  <p className="text-xs text-slate-300 max-w-lg mx-auto">
                    Player result declarations have been submitted. Player votes are not the final result. The match remains pending Admin/Staff confirmation until official hours and result are confirmed and NC is awarded.
                  </p>
                </div>
              )}

              {/* Admin Match Result Confirmation Panel (Sections 6 & 7) */}
              {isAuthorizedStaffOrAdmin && (match.status === 'PENDING_ADMIN_APPROVAL' || match.status === 'DISPUTED' || match.status === 'AWAITING_RESULTS' || match.status === 'AWAITING_CONFIRMATION' || match.status === 'LIVE' || match.status === 'ADMIN_REVIEW') && (() => {
                const parsedAdminHours = parseFloat(admin5v5Hours);
                const isHoursValid = !isNaN(parsedAdminHours) && isFinite(parsedAdminHours) && parsedAdminHours > 0;
                
                const teamAPlayerList = get5v5TeamPlayersList(match, 'teamA');
                const teamBPlayerList = get5v5TeamPlayersList(match, 'teamB');
                const countA = Math.max(1, teamAPlayerList.length);
                const countB = Math.max(1, teamBPlayerList.length);

                let perPlayerA = 0;
                let perPlayerB = 0;
                if (isHoursValid) {
                  if (admin5v5Outcome === 'teamA') {
                    perPlayerA = Math.round(90 * parsedAdminHours * 100) / 100;
                    perPlayerB = Math.round(30 * parsedAdminHours * 100) / 100;
                  } else if (admin5v5Outcome === 'teamB') {
                    perPlayerA = Math.round(30 * parsedAdminHours * 100) / 100;
                    perPlayerB = Math.round(90 * parsedAdminHours * 100) / 100;
                  } else {
                    perPlayerA = Math.round(45 * parsedAdminHours * 100) / 100;
                    perPlayerB = Math.round(45 * parsedAdminHours * 100) / 100;
                  }
                }
                const totalA = Math.round(perPlayerA * countA * 100) / 100;
                const totalB = Math.round(perPlayerB * countB * 100) / 100;

                return (
                  <div className="p-5 sm:p-6 rounded-2xl bg-[#0e0e16] border-2 border-purple-500/50 shadow-[0_0_30px_rgba(168,85,247,0.15)] space-y-5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-purple-500/30 pb-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-300">
                          <ShieldAlert className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-purple-400">
                            Official Result & NC Award System
                          </div>
                          <h4 className="text-base font-black font-display text-white uppercase tracking-wide">
                            MATCH RESULT CONFIRMATION
                          </h4>
                        </div>
                      </div>
                      <span className="px-2.5 py-1 rounded-lg bg-purple-500/10 border border-purple-500/30 text-purple-300 font-mono text-[10px] font-bold uppercase self-start sm:self-auto">
                        Super Admin / Staff Authorized Only
                      </span>
                    </div>

                    {/* 1. Official Result: [ TEAM A WON ] [ TEAM B WON ] [ DRAW ] */}
                    <div className="space-y-2">
                      <label className="block text-xs font-bold font-mono text-slate-300 uppercase tracking-wider">
                        Official Result:
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        <button
                          type="button"
                          onClick={() => setAdmin5v5Outcome('teamA')}
                          disabled={submittingAction}
                          className={`p-3.5 rounded-xl border text-center transition-all flex flex-col items-center justify-center gap-1 cursor-pointer ${
                            admin5v5Outcome === 'teamA'
                              ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200 shadow-[0_0_15px_rgba(34,211,238,0.25)] ring-1 ring-cyan-400'
                              : 'bg-[#15151f] border-slate-800 text-slate-300 hover:border-slate-700'
                          }`}
                        >
                          <span className="text-xs font-black font-mono uppercase tracking-wider">
                            🛡️ {match.teamAName || 'TEAM A'} WON
                          </span>
                          <span className="text-[10px] font-mono text-cyan-400">
                            Winner (+90 NC/hr)
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setAdmin5v5Outcome('teamB')}
                          disabled={submittingAction}
                          className={`p-3.5 rounded-xl border text-center transition-all flex flex-col items-center justify-center gap-1 cursor-pointer ${
                            admin5v5Outcome === 'teamB'
                              ? 'bg-rose-500/20 border-rose-400 text-rose-200 shadow-[0_0_15px_rgba(244,63,94,0.25)] ring-1 ring-rose-400'
                              : 'bg-[#15151f] border-slate-800 text-slate-300 hover:border-slate-700'
                          }`}
                        >
                          <span className="text-xs font-black font-mono uppercase tracking-wider">
                            ⚔️ {match.teamBName || 'TEAM B'} WON
                          </span>
                          <span className="text-[10px] font-mono text-rose-400">
                            Winner (+90 NC/hr)
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setAdmin5v5Outcome('draw')}
                          disabled={submittingAction}
                          className={`p-3.5 rounded-xl border text-center transition-all flex flex-col items-center justify-center gap-1 cursor-pointer ${
                            admin5v5Outcome === 'draw'
                              ? 'bg-yellow-500/20 border-yellow-400 text-yellow-200 shadow-[0_0_15px_rgba(234,179,8,0.25)] ring-1 ring-yellow-400'
                              : 'bg-[#15151f] border-slate-800 text-slate-300 hover:border-slate-700'
                          }`}
                        >
                          <span className="text-xs font-black font-mono uppercase tracking-wider">
                            🤝 DRAW
                          </span>
                          <span className="text-[10px] font-mono text-yellow-400">
                            Draw (+45 NC/hr each)
                          </span>
                        </button>
                      </div>
                    </div>

                    {/* 2. Official Hours Played */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="block text-xs font-bold font-mono text-slate-300 uppercase tracking-wider">
                          Official Hours Played:
                        </label>
                        <span className="text-[10px] font-mono text-slate-400">
                          Players cannot set hours • Admin only
                        </span>
                      </div>

                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                        <div className="relative flex-1">
                          <input
                            type="number"
                            step="0.1"
                            min="0.1"
                            max="24"
                            value={admin5v5Hours}
                            onChange={(e) => setAdmin5v5Hours(e.target.value)}
                            disabled={submittingAction}
                            placeholder="0.0"
                            className="w-full px-4 py-2.5 rounded-xl bg-[#15151f] border border-slate-700 focus:border-purple-400 focus:ring-1 focus:ring-purple-400 text-white font-mono text-sm placeholder-slate-500"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono text-slate-400 pointer-events-none">
                            hours
                          </span>
                        </div>

                        {/* Quick Presets */}
                        <div className="flex items-center gap-1.5 shrink-0 overflow-x-auto pb-1 sm:pb-0">
                          {[1, 1.5, 2, 2.5, 3].map((h) => (
                            <button
                              key={h}
                              type="button"
                              onClick={() => setAdmin5v5Hours(String(h))}
                              className={`px-2.5 py-2 rounded-lg text-xs font-mono font-bold transition-colors cursor-pointer ${
                                parseFloat(admin5v5Hours) === h
                                  ? 'bg-purple-600 text-white shadow-sm'
                                  : 'bg-[#15151f] border border-slate-800 text-slate-300 hover:bg-slate-800'
                              }`}
                            >
                              {h} hr{h === 1 ? '' : 's'}
                            </button>
                          ))}
                        </div>
                      </div>

                      {!isHoursValid && (
                        <p className="text-[11px] font-mono text-rose-400">
                          ⚠️ Official hours must be a valid positive number greater than 0 (e.g. 1.0, 1.5, 2.0).
                        </p>
                      )}
                    </div>

                    {/* 3. LIVE Reward Preview */}
                    <div className="p-4 rounded-xl bg-[#151522] border border-purple-500/30 space-y-3">
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="font-bold text-purple-300 uppercase tracking-wider flex items-center gap-1.5">
                          <span>🪙</span>
                          <span>Reward Preview:</span>
                        </span>
                        <span className="text-slate-400 font-mono text-[11px]">
                          Official Hours: <strong className="text-white">{isHoursValid ? parsedAdminHours : 0}</strong>
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {/* TEAM A */}
                        <div className={`p-3.5 rounded-xl border ${
                          admin5v5Outcome === 'teamA'
                            ? 'bg-cyan-950/30 border-cyan-500/40 text-cyan-200'
                            : admin5v5Outcome === 'draw'
                            ? 'bg-yellow-950/20 border-yellow-500/30 text-yellow-200'
                            : 'bg-slate-900/50 border-slate-800 text-slate-300'
                        }`}>
                          <div className="flex items-center justify-between text-xs font-bold font-mono uppercase">
                            <span>🛡️ {match.teamAName || 'TEAM A'}</span>
                            <span className={
                              admin5v5Outcome === 'teamA' ? 'text-cyan-400 font-black' : admin5v5Outcome === 'draw' ? 'text-yellow-400 font-bold' : 'text-slate-400'
                            }>
                              {admin5v5Outcome === 'teamA' ? 'WINNER (+90/h)' : admin5v5Outcome === 'draw' ? 'DRAW (+45/h)' : 'LOSER (+30/h)'}
                            </span>
                          </div>
                          <div className="mt-2 space-y-1 font-mono text-xs">
                            <div className="text-slate-400 text-[11px]">{countA} players</div>
                            <div className="font-black text-white text-sm">
                              +{perPlayerA} NC <span className="text-xs text-slate-400 font-normal">per player</span>
                            </div>
                            <div className="text-[11px] text-purple-300 font-bold pt-1 border-t border-slate-800/80">
                              {totalA.toLocaleString()} NC team total
                            </div>
                          </div>
                        </div>

                        {/* TEAM B */}
                        <div className={`p-3.5 rounded-xl border ${
                          admin5v5Outcome === 'teamB'
                            ? 'bg-rose-950/30 border-rose-500/40 text-rose-200'
                            : admin5v5Outcome === 'draw'
                            ? 'bg-yellow-950/20 border-yellow-500/30 text-yellow-200'
                            : 'bg-slate-900/50 border-slate-800 text-slate-300'
                        }`}>
                          <div className="flex items-center justify-between text-xs font-bold font-mono uppercase">
                            <span>⚔️ {match.teamBName || 'TEAM B'}</span>
                            <span className={
                              admin5v5Outcome === 'teamB' ? 'text-rose-400 font-black' : admin5v5Outcome === 'draw' ? 'text-yellow-400 font-bold' : 'text-slate-400'
                            }>
                              {admin5v5Outcome === 'teamB' ? 'WINNER (+90/h)' : admin5v5Outcome === 'draw' ? 'DRAW (+45/h)' : 'LOSER (+30/h)'}
                            </span>
                          </div>
                          <div className="mt-2 space-y-1 font-mono text-xs">
                            <div className="text-slate-400 text-[11px]">{countB} players</div>
                            <div className="font-black text-white text-sm">
                              +{perPlayerB} NC <span className="text-xs text-slate-400 font-normal">per player</span>
                            </div>
                            <div className="text-[11px] text-purple-300 font-bold pt-1 border-t border-slate-800/80">
                              {totalB.toLocaleString()} NC team total
                            </div>
                          </div>
                        </div>
                      </div>

                      {admin5v5Outcome === 'draw' && isHoursValid && (
                        <div className="text-[11px] font-mono text-yellow-300/90 text-center pt-1">
                          Because: 45 × {parsedAdminHours} = {perPlayerA} NC per player for both teams
                        </div>
                      )}
                    </div>

                    {/* Optional Admin Note */}
                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-mono text-slate-400">
                        Official Ruling Reason / Staff Note (Optional):
                      </label>
                      <input
                        type="text"
                        value={adminNote}
                        onChange={(e) => setAdminNote(e.target.value)}
                        placeholder="e.g. Official result verified by Staff on station"
                        disabled={submittingAction}
                        className="w-full px-3 py-2 rounded-xl bg-[#15151f] border border-slate-800 focus:border-purple-400 text-xs text-white placeholder-slate-500 font-mono"
                      />
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-2">
                      <button
                        type="button"
                        onClick={handleAdminCancel5v5Game}
                        disabled={submittingAction}
                        className="px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono font-bold uppercase tracking-wider transition-all border border-slate-700 cursor-pointer"
                      >
                        Void / Cancel Match
                      </button>

                      <button
                        type="button"
                        onClick={handleConfirm5v5ResultAndAwardNC}
                        disabled={submittingAction || !isHoursValid}
                        className="flex-1 sm:flex-none px-6 py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-black text-xs font-mono font-black uppercase tracking-wider transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer active:scale-95"
                      >
                        {submittingAction ? (
                          <>
                            <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                            <span>PROCESSING CONFIRMATION...</span>
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="w-4 h-4" />
                            <span>CONFIRM RESULT & AWARD NC</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        ) : (
          <>
            {/* Standard 1v1 Matchup Grid */}
          <div className="grid grid-cols-1 md:grid-cols-11 gap-4 items-center mb-8">
            {/* Player A */}
            {(() => {
              const identityA = resolvePlayerIdentity({
                uid: match.playerAId,
                profile: livePlayerProfiles[match.playerAId],
                snapshot: undefined,
                gameId: match.gameId,
              });
              return (
                <div
                  className={`md:col-span-5 p-5 rounded-2xl border text-center relative transition-all ${
                    match.status === 'CONFIRMED' && match.winnerId === match.playerAId
                      ? 'bg-cyan-950/30 border-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.25)]'
                      : 'bg-[#15151b] border-slate-800'
                  }`}
                >
                  <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center font-display font-black text-xl text-cyan-400 font-mono">
                    {identityA.gamerTag.substring(0, 2).toUpperCase()}
                  </div>
                  <div className="text-[10px] text-slate-500 uppercase tracking-widest font-mono font-semibold">Competitor 1</div>
                  <h3 className="text-xl font-bold font-display text-white mt-0.5">{identityA.gamerTag}</h3>
                  <p className="text-xs text-slate-400">{identityA.displayName}</p>
                  {identityA.ign && (
                    <div className="text-[10px] font-mono text-cyan-400 mt-1">
                      {identityA.ignLabel}: <strong className="text-cyan-300">{identityA.ign}</strong>
                    </div>
                  )}

                  {match.status === 'CONFIRMED' && (
                    <div className="mt-4 pt-3 border-t border-slate-800">
                      {match.winnerId === match.playerAId ? (
                        <div className="text-xs font-black text-cyan-400 flex items-center justify-center gap-1 font-mono">
                          <Trophy className="w-4 h-4" />
                          <span>WINNER (+{match.playerARatingChange} MMR)</span>
                        </div>
                      ) : match.winnerId === 'draw' ? (
                        <div className="text-xs font-bold text-slate-400 font-mono">DRAW ({match.playerARatingChange} MMR)</div>
                      ) : (
                        <div className="text-xs font-bold text-red-400 font-mono">DEFEAT ({match.playerARatingChange} MMR)</div>
                      )}
                      <div className="text-[11px] font-mono text-slate-400 mt-1">
                        Rating: {match.playerARatingBefore} → <strong className="text-white font-mono-numbers">{match.playerARatingAfter}</strong>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* VS Divider */}
            <div className="md:col-span-1 text-center font-display font-black text-2xl text-slate-600 tracking-wider">
              VS
            </div>

            {/* Player B */}
            {(() => {
              const identityB = resolvePlayerIdentity({
                uid: match.playerBId,
                profile: livePlayerProfiles[match.playerBId],
                snapshot: undefined,
                gameId: match.gameId,
              });
              return (
                <div
                  className={`md:col-span-5 p-5 rounded-2xl border text-center relative transition-all ${
                    match.status === 'CONFIRMED' && match.winnerId === match.playerBId
                      ? 'bg-cyan-950/30 border-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.25)]'
                      : 'bg-[#15151b] border-slate-800'
                  }`}
                >
                  <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center font-display font-black text-xl text-slate-200 font-mono">
                    {identityB.gamerTag.substring(0, 2).toUpperCase()}
                  </div>
                  <div className="text-[10px] text-slate-500 uppercase tracking-widest font-mono font-semibold">Competitor 2</div>
                  <h3 className="text-xl font-bold font-display text-white mt-0.5">{identityB.gamerTag}</h3>
                  <p className="text-xs text-slate-400">{identityB.displayName}</p>
                  {identityB.ign && (
                    <div className="text-[10px] font-mono text-cyan-400 mt-1">
                      {identityB.ignLabel}: <strong className="text-cyan-300">{identityB.ign}</strong>
                    </div>
                  )}

                  {match.status === 'CONFIRMED' && (
                    <div className="mt-4 pt-3 border-t border-slate-800">
                      {match.winnerId === match.playerBId ? (
                        <div className="text-xs font-black text-cyan-400 flex items-center justify-center gap-1 font-mono">
                          <Trophy className="w-4 h-4" />
                          <span>WINNER (+{match.playerBRatingChange} MMR)</span>
                        </div>
                      ) : match.winnerId === 'draw' ? (
                        <div className="text-xs font-bold text-slate-400 font-mono">DRAW ({match.playerBRatingChange} MMR)</div>
                      ) : (
                        <div className="text-xs font-bold text-red-400 font-mono">DEFEAT ({match.playerBRatingChange} MMR)</div>
                      )}
                      <div className="text-[11px] font-mono text-slate-400 mt-1">
                        Rating: {match.playerBRatingBefore} → <strong className="text-white font-mono-numbers">{match.playerBRatingAfter}</strong>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          {/* 1v1 Match Lifecycle Controls (Chess, FC 26, FC 27, etc.) */}
          <div className="mt-6">
            {/* State A: Waiting for Opponent */}
            {match.status === 'WAITING_FOR_OPPONENT' && (
              <div className="p-5 rounded-2xl bg-[#0a0a0f] border border-slate-800 text-center space-y-2">
                <div className="flex items-center justify-center gap-2 text-slate-400 font-mono text-xs font-bold uppercase tracking-wider">
                  <Clock className="w-4 h-4 text-cyan-400 animate-spin" />
                  <span>INVITATION PENDING — AWAITING OPPONENT</span>
                </div>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  Challenge issued to <span className="text-white font-bold">{match.playerBGamerTag || 'Opponent'}</span>. Match will proceed to Admin approval as soon as accepted.
                </p>
              </div>
            )}

            {/* State B: Waiting for Admin Approval */}
            {(match.status === 'WAITING_FOR_ADMIN' || match.status === 'PENDING_ADMIN_APPROVAL') && (
              <div className="space-y-4">
                {isAdmin ? (
                  <div className="p-6 rounded-2xl bg-yellow-500/10 border-2 border-yellow-500/40 text-center space-y-4 shadow-xl">
                    <div className="flex items-center justify-center gap-2 text-yellow-400 font-mono text-xs font-black uppercase tracking-wider">
                      <ShieldAlert className="w-4 h-4" />
                      <span>REFEREE ACTION REQUIRED: 1V1 MATCH READY FOR APPROVAL</span>
                    </div>
                    <div>
                      <h4 className="text-base font-black font-display text-white">
                        {match.playerAGamerTag} vs {match.playerBGamerTag} ({match.gameName})
                      </h4>
                      <p className="text-xs text-slate-300 mt-1 max-w-md mx-auto">
                        Both competitors have accepted and are at Station {match.station}. Review and approve to allow live play, or reject if station is unavailable.
                      </p>
                    </div>
                    <div className="flex items-center justify-center gap-3 pt-2">
                      <button
                        type="button"
                        onClick={handleAdminApproveInRoom}
                        disabled={submittingAction}
                        className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-black font-display font-black text-xs uppercase tracking-wider shadow-lg transition-all"
                      >
                        {submittingAction ? 'Approving...' : '✅ Approve 1v1 Match'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowRejectModal(true)}
                        disabled={submittingAction}
                        className="px-6 py-2.5 rounded-xl bg-red-600/80 hover:bg-red-600 border border-red-500/60 text-white font-display font-black text-xs uppercase tracking-wider transition-all"
                      >
                        ❌ Reject Match
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="p-6 rounded-2xl bg-yellow-500/10 border border-yellow-500/30 text-center space-y-2">
                    <div className="flex items-center justify-center gap-2 text-yellow-400 font-mono text-xs font-bold uppercase tracking-wider">
                      <Clock className="w-4 h-4 animate-spin" />
                      <span>MATCH READY — PENDING ADMIN APPROVAL</span>
                    </div>
                    <p className="text-xs text-slate-300 max-w-md mx-auto">
                      Both competitors have accepted. Nexus Staff has received notification to inspect Station {match.station} and approve your match. Neither player can start until approved.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* State C: Match Approved */}
            {match.status === 'APPROVED' && (
              <div className="p-6 rounded-2xl bg-emerald-500/10 border-2 border-emerald-500/40 text-center space-y-4 shadow-xl">
                <div className="flex items-center justify-center gap-2 text-emerald-400 font-mono text-xs font-black uppercase tracking-wider">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>ADMIN APPROVAL GRANTED — STATION {match.station}</span>
                </div>
                <p className="text-xs text-slate-300 max-w-md mx-auto">
                  Referee approval granted! Competitors can now initiate the live match.
                </p>
                {(isPlayerA || isPlayerB || isAdmin) ? (
                  <div>
                    <button
                      type="button"
                      onClick={handleStartGame}
                      disabled={submittingAction}
                      className="px-8 py-3 rounded-xl bg-gradient-to-r from-emerald-400 to-cyan-400 hover:from-emerald-300 hover:to-cyan-300 text-black font-display font-black text-sm uppercase tracking-wider shadow-[0_0_25px_rgba(52,211,153,0.3)] transition-all animate-pulse"
                    >
                      {submittingAction ? 'Starting Match...' : '🚀 START MATCH NOW'}
                    </button>
                  </div>
                ) : (
                  <div className="text-xs font-mono text-slate-400">
                    Waiting for competitors to start the match.
                  </div>
                )}
              </div>
            )}

            {/* State D: Match Rejected */}
            {match.status === 'REJECTED' && (
              <div className="p-6 rounded-2xl bg-red-950/30 border border-red-500/40 text-center space-y-2">
                <div className="flex items-center justify-center gap-2 text-red-400 font-mono text-xs font-bold uppercase tracking-wider">
                  <XCircle className="w-4 h-4" />
                  <span>MATCH REQUEST REJECTED BY ADMIN</span>
                </div>
                <p className="text-xs text-red-300 font-medium">
                  Reason: {match.rejectionReason || 'Declined by Nexus Staff'}.
                </p>
                <p className="text-[11px] text-slate-400">
                  This match cannot be started. Please consult with center staff or issue a new challenge.
                </p>
              </div>
            )}

            {/* State E & F: 1v1 Live Match & Result Declarations */}
            {(match.status === 'LIVE' || match.status === 'AWAITING_CONFIRMATION' || match.status === 'AWAITING_RESULTS' || match.status === 'PENDING_ADMIN_APPROVAL' || match.status === 'ADMIN_REVIEW') && (
              <Match1v1DeclarationCard
                match={match}
                currentUser={playerProfile as any}
                isAdmin={isAuthorizedStaffOrAdmin}
                livePlayerProfiles={livePlayerProfiles}
                onDeclareResult={handleDeclare}
                onAdminResolve={handleAdminDirectResolve1v1}
                onAdminCancel={handleAdminCancel1v1}
                isSubmittingDeclaration={submittingAction}
              />
            )}
          </div>
        </>
      )}

        {/* 5. Status DISPUTED: Clear Alert Banner */}
        {match.status === 'DISPUTED' && (
          <div className="p-6 rounded-2xl bg-red-950/30 border border-red-500/50 space-y-4 shadow-xl">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-7 h-7 text-red-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xl font-bold font-display text-white">⚠️ RESULT CONTESTED</h4>
                <p className="text-sm text-red-200 mt-1 font-semibold">
                  Nexus Admin will review this match.
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Conflicting result declarations submitted by players. Ratings have not been modified.
                </p>
              </div>
            </div>

            {/* Declarations Breakdown */}
            {is5v5 ? (
              <div className="space-y-3 pt-3 border-t border-red-900/40">
                <div className="text-xs font-mono font-bold uppercase tracking-wider text-red-300">
                  Player Result Declarations (5v5 Squad Audit):
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* Team A Roster Declarations */}
                  <div className="p-3.5 rounded-xl bg-[#0a0a0f] border border-cyan-500/30 space-y-2">
                    <div className="flex items-center justify-between pb-1.5 border-b border-slate-800">
                      <span className="text-xs font-mono font-bold text-cyan-400 uppercase">
                        🛡️ {match.teamAName || 'Team A'}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400">
                        {teamAPlayerIds.length} Players
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {get5v5TeamPlayersList(match, 'teamA').map((p) => {
                        const decl = getPlayerDeclarationValue(match, p.id, 'teamA');
                        const display = formatDeclarationDisplay(decl, {
                          teamSide: 'teamA',
                          teamAName: match.teamAName,
                          teamBName: match.teamBName,
                          is5v5: true,
                        });
                        return (
                          <div
                            key={p.id}
                            className="p-2.5 rounded-lg bg-[#15151b] border border-slate-800 flex items-center justify-between text-xs"
                          >
                            <div className="flex items-center gap-1.5 truncate">
                              <span className="font-bold text-slate-200 truncate">{p.gamerTag}</span>
                              {p.isCaptain && (
                                <span className="px-1 py-0.2 rounded text-[9px] font-mono font-bold bg-cyan-950 text-cyan-400 border border-cyan-800/60">
                                  C
                                </span>
                              )}
                            </div>
                            <div className="text-right shrink-0 ml-2">
                              <span className="text-[10px] text-slate-500 mr-1.5 font-mono">Declared:</span>
                              <span className={`font-mono font-bold text-xs ${display.badgeClass}`}>
                                {display.text}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Team B Roster Declarations */}
                  <div className="p-3.5 rounded-xl bg-[#0a0a0f] border border-rose-500/30 space-y-2">
                    <div className="flex items-center justify-between pb-1.5 border-b border-slate-800">
                      <span className="text-xs font-mono font-bold text-rose-400 uppercase">
                        ⚔️ {match.teamBName || 'Team B'}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400">
                        {teamBPlayerIds.length} Players
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {get5v5TeamPlayersList(match, 'teamB').map((p) => {
                        const decl = getPlayerDeclarationValue(match, p.id, 'teamB');
                        const display = formatDeclarationDisplay(decl, {
                          teamSide: 'teamB',
                          teamAName: match.teamAName,
                          teamBName: match.teamBName,
                          is5v5: true,
                        });
                        return (
                          <div
                            key={p.id}
                            className="p-2.5 rounded-lg bg-[#15151b] border border-slate-800 flex items-center justify-between text-xs"
                          >
                            <div className="flex items-center gap-1.5 truncate">
                              <span className="font-bold text-slate-200 truncate">{p.gamerTag}</span>
                              {p.isCaptain && (
                                <span className="px-1 py-0.2 rounded text-[9px] font-mono font-bold bg-rose-950 text-rose-400 border border-rose-800/60">
                                  C
                                </span>
                              )}
                            </div>
                            <div className="text-right shrink-0 ml-2">
                              <span className="text-[10px] text-slate-500 mr-1.5 font-mono">Declared:</span>
                              <span className={`font-mono font-bold text-xs ${display.badgeClass}`}>
                                {display.text}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="pt-2 border-t border-red-900/40">
                <Match1v1DeclarationCard
                  match={match}
                  currentUser={playerProfile as any}
                  isAdmin={isAuthorizedStaffOrAdmin}
                  livePlayerProfiles={livePlayerProfiles}
                  onDeclareResult={handleDeclare}
                  onAdminResolve={handleAdminDirectResolve1v1}
                  onAdminCancel={handleAdminCancel1v1}
                  isSubmittingDeclaration={submittingAction}
                />
              </div>
            )}

            {/* Admin Direct Action button if viewer is Admin / Staff (5v5) */}
            {isAuthorizedStaffOrAdmin && is5v5 && (
              <div className="pt-2 flex justify-end">
                <button
                  onClick={() => setShowAdminResolveModal(true)}
                  className="px-5 py-2.5 rounded-xl bg-red-500 hover:bg-red-400 text-white font-bold text-xs flex items-center gap-2 transition-all shadow-md uppercase tracking-wider"
                >
                  <ShieldAlert className="w-4 h-4" />
                  <span>RESOLVE DISPUTE AS STAFF</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* 6. Status CANCELLED */}
        {match.status === 'CANCELLED' && (
          <div className="p-6 rounded-2xl bg-slate-900/60 border-2 border-slate-700 text-center space-y-4 shadow-xl">
            <div className="w-12 h-12 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400 mx-auto">
              <XCircle className="w-6 h-6" />
            </div>

            <div className="max-w-lg mx-auto space-y-1.5">
              <h4 className="text-xl font-black font-display text-slate-300 uppercase tracking-wide">
                ❌ MATCH CANCELLED — NO RESULT
              </h4>
              <p className="text-xs text-slate-400">
                This match was manually terminated by Nexus Staff{match.resolvedByName || match.adminName ? ` (${match.resolvedByName || match.adminName})` : ''}.
              </p>
              {(match.adminResolutionReason || match.adminNote) && (
                <div className="p-3 rounded-xl bg-[#0a0a0f] border border-slate-800 text-xs font-mono text-slate-300">
                  Reason: "{match.adminResolutionReason || match.adminNote}"
                </div>
              )}
              <p className="text-[11px] text-slate-500 font-mono">
                No MMR, leaderboard rankings, or player streaks were altered.
              </p>
            </div>

            <button
              onClick={onBack}
              className="px-6 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold uppercase tracking-wider transition-colors"
            >
              Return to Arena
            </button>
          </div>
        )}

        {/* 7. Status CONFIRMED */}
        {match.status === 'CONFIRMED' && (
          <div className="p-6 rounded-2xl bg-[#15151b] border border-cyan-500/40 text-center space-y-4 shadow-xl">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 mx-auto shadow-[0_0_15px_rgba(34,211,238,0.2)]">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-2xl font-bold font-display text-white">✅ MATCH CONFIRMED</h4>
              <p className="text-sm font-bold text-cyan-400 mt-1">
                {is5v5
                  ? match.finalResult === 'draw' || match.officialResult === 'DRAW' || match.winnerId === 'draw'
                    ? 'Official Result: DRAW'
                    : match.finalResult === 'teamA' || match.winnerId === match.teamAId || match.officialWinner === match.teamAId
                    ? `Winner: ${match.teamAName || 'Team A'}`
                    : `Winner: ${match.teamBName || 'Team B'}`
                  : match.winnerId === 'draw' || match.officialResult === 'DRAW'
                  ? 'Official Result: DRAW'
                  : match.winnerId === match.playerAId || match.officialWinner === match.playerAId
                  ? `Winner: ${match.playerAGamerTag}`
                  : match.winnerId === match.playerBId || match.officialWinner === match.playerBId
                  ? `Winner: ${match.playerBGamerTag}`
                  : 'Official Winner Confirmed'}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                {match.adminResolved || match.resultType === 'ADMIN_DECISION'
                  ? `Confirmed by Nexus Staff: ${match.confirmedByName || match.resolvedByName || match.adminName || 'Admin'}`
                  : 'Agreed mutually by both competitors'}
              </p>
              {(match.adminResolutionReason || match.adminNote) && (
                <p className="text-xs italic text-slate-300 mt-1.5 max-w-md mx-auto">
                  "{match.adminResolutionReason || match.adminNote}"
                </p>
              )}

              {/* Authoritative Match Reward Engine Summary (Single Source of Truth) */}
              {(() => {
                const liveAuth = deriveMatchRewardsAndMMR(match);
                if (is5v5) {
                  return (
                    <div className="mt-4 p-4 rounded-2xl bg-[#0e0e16] border border-cyan-500/40 max-w-xl mx-auto space-y-3 text-left">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-slate-800 pb-2.5 text-xs font-mono">
                        <span className="text-slate-400">
                          Official Duration: <strong className="text-white">{match.officialHours ?? 1} Hour{(match.officialHours ?? 1) === 1 ? '' : 's'} Played</strong>
                        </span>
                        <span className="text-[11px] text-purple-300">
                          Confirmed by: <strong className="text-white">{match.confirmedByName || match.resolvedByName || 'Nexus Staff'}</strong>
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {/* Team A */}
                        <div className="p-3 rounded-xl bg-cyan-950/20 border border-cyan-500/30">
                          <div className="flex items-center justify-between text-xs font-mono font-bold">
                            <span className="text-cyan-400 truncate">🛡️ {match.teamAName || 'Team A'}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-300">
                              {liveAuth.outcome === 'teamA' ? '🏆 WINNER' : liveAuth.isDraw ? '🤝 DRAW' : '❌ RUNNER-UP'}
                            </span>
                          </div>
                          <div className="mt-1.5 text-sm font-black font-mono text-white">
                            +{liveAuth.teamARewardPerPlayer} NC
                            <span className="text-xs font-normal text-slate-400 ml-1">per player</span>
                          </div>
                          <div className="text-[10px] font-mono text-cyan-300/80 mt-0.5">
                            5 players • {liveAuth.teamATotalReward.toLocaleString()} NC squad total
                          </div>
                          {liveAuth.teamAMMRChange !== undefined && (
                            <div className="text-[11px] font-mono mt-1 font-bold text-cyan-400">
                              Team MMR: {liveAuth.teamAMMRChange >= 0 ? `+${liveAuth.teamAMMRChange}` : liveAuth.teamAMMRChange} MMR
                            </div>
                          )}
                        </div>

                        {/* Team B */}
                        <div className="p-3 rounded-xl bg-rose-950/20 border border-rose-500/30">
                          <div className="flex items-center justify-between text-xs font-mono font-bold">
                            <span className="text-rose-400 truncate">⚔️ {match.teamBName || 'Team B'}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-300">
                              {liveAuth.outcome === 'teamB' ? '🏆 WINNER' : liveAuth.isDraw ? '🤝 DRAW' : '❌ RUNNER-UP'}
                            </span>
                          </div>
                          <div className="mt-1.5 text-sm font-black font-mono text-white">
                            +{liveAuth.teamBRewardPerPlayer} NC
                            <span className="text-xs font-normal text-slate-400 ml-1">per player</span>
                          </div>
                          <div className="text-[10px] font-mono text-rose-300/80 mt-0.5">
                            5 players • {liveAuth.teamBTotalReward.toLocaleString()} NC squad total
                          </div>
                          {liveAuth.teamBMMRChange !== undefined && (
                            <div className="text-[11px] font-mono mt-1 font-bold text-rose-400">
                              Team MMR: {liveAuth.teamBMMRChange >= 0 ? `+${liveAuth.teamBMMRChange}` : liveAuth.teamBMMRChange} MMR
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="pt-1 text-center font-mono text-[11px] text-emerald-400 font-bold flex items-center justify-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                        <span>Nexus Coins Deposited Directly to All 10 Players' Wallets</span>
                      </div>
                    </div>
                  );
                }

                // 1v1 Games
                return (
                  <div className="mt-3 p-3 rounded-xl bg-gradient-to-r from-amber-500/15 via-amber-500/10 to-amber-500/20 border border-amber-500/40 max-w-md mx-auto space-y-2 shadow-[0_0_15px_rgba(245,158,11,0.15)] text-center font-mono">
                    <div className="flex items-center justify-center gap-2">
                      <span className="text-xl">🪙</span>
                      <span className="text-xs font-black uppercase tracking-wider text-amber-300">
                        {liveAuth.isDraw
                          ? `🤝 Draw Split: +${liveAuth.drawRewardPerPlayer} NC each`
                          : `🏆 Winner Reward: +${liveAuth.winnerRewardPerPlayer} NC to ${liveAuth.winnerTitle}`}
                      </span>
                      <span className="px-1.5 py-0.2 rounded bg-amber-400 text-black text-[9px] font-black">CREDITED</span>
                    </div>
                    {!liveAuth.isDraw && (
                      <div className="text-[11px] text-slate-400">
                        ❌ Loser Reward: +{liveAuth.loserRewardPerPlayer} NC
                      </div>
                    )}
                    <div className="text-[10px] text-amber-200/80">
                      {liveAuth.rewardBreakdown}
                    </div>
                  </div>
                );
              })()}

              {/* Declarations transparency */}
              {is5v5 ? (
                (Object.keys(match.declarations || {}).length > 0 || Object.keys(match.votes || {}).length > 0) && (
                  <div className="mt-4 pt-3 border-t border-slate-800/80 space-y-2 text-left max-w-xl mx-auto">
                    <div className="text-[11px] font-mono font-bold text-slate-400 uppercase tracking-wider text-center">
                      Final Competitor Declarations Audit
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                      <div className="p-2 rounded-lg bg-[#0a0a0f] border border-slate-800 space-y-1">
                        <div className="text-[10px] font-mono font-bold text-cyan-400 uppercase">{match.teamAName || 'Team A'}</div>
                        {get5v5TeamPlayersList(match, 'teamA').map((p) => {
                          const decl = getPlayerDeclarationValue(match, p.id, 'teamA');
                          const d = formatDeclarationDisplay(decl, { teamSide: 'teamA', is5v5: true, teamAName: match.teamAName, teamBName: match.teamBName });
                          return (
                            <div key={p.id} className="flex items-center justify-between text-[11px] font-mono">
                              <span className="text-slate-300 truncate">{p.gamerTag}</span>
                              <span className={d.badgeClass}>{d.text}</span>
                            </div>
                          );
                        })}
                      </div>
                      <div className="p-2 rounded-lg bg-[#0a0a0f] border border-slate-800 space-y-1">
                        <div className="text-[10px] font-mono font-bold text-rose-400 uppercase">{match.teamBName || 'Team B'}</div>
                        {get5v5TeamPlayersList(match, 'teamB').map((p) => {
                          const decl = getPlayerDeclarationValue(match, p.id, 'teamB');
                          const d = formatDeclarationDisplay(decl, { teamSide: 'teamB', is5v5: true, teamAName: match.teamAName, teamBName: match.teamBName });
                          return (
                            <div key={p.id} className="flex items-center justify-between text-[11px] font-mono">
                              <span className="text-slate-300 truncate">{p.gamerTag}</span>
                              <span className={d.badgeClass}>{d.text}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )
              ) : (
                (match.playerADeclaration || match.playerBDeclaration) && (
                  <div className="mt-3 pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-center gap-4 text-[11px] font-mono text-slate-400">
                    <span>
                      {match.playerAGamerTag} declared:{' '}
                      <strong className="text-slate-200">
                        {formatDeclarationDisplay(getPlayerDeclarationValue(match, match.playerAId, 'teamA'), { teamSide: 'teamA', is5v5: false }).text}
                      </strong>
                    </span>
                    <span>•</span>
                    <span>
                      {match.playerBGamerTag} declared:{' '}
                      <strong className="text-slate-200">
                        {formatDeclarationDisplay(getPlayerDeclarationValue(match, match.playerBId, 'teamB'), { teamSide: 'teamB', is5v5: false }).text}
                      </strong>
                    </span>
                  </div>
                )
              )}
            </div>

            <div className="pt-2 flex items-center justify-center gap-3">
              {onViewLeaderboard && (
                <button
                  onClick={onViewLeaderboard}
                  className="px-5 py-2.5 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-black font-black uppercase tracking-wider text-xs transition-colors shadow-md"
                >
                  View Rankings
                </button>
              )}
              <button
                onClick={onBack}
                className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs uppercase tracking-wider transition-colors"
              >
                Back to Arena
              </button>
            </div>
          </div>
        )}
      </div>

      {/* REJECT REQUEST MODAL IN ROOM */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
          <div className="relative w-full max-w-md bg-[#0a0a0f] border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-500/20 border border-red-500/40 flex items-center justify-center text-red-400">
                <XCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-black font-display text-white">REJECT REQUEST</h3>
                <p className="text-xs text-slate-400">Decline this match request</p>
              </div>
            </div>

            <textarea
              rows={3}
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Reason for rejection (e.g. players not ready)..."
              className="w-full p-3 bg-[#15151b] border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-red-500"
            />

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowRejectModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 uppercase"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAdminRejectInRoom}
                disabled={submittingAction}
                className="px-5 py-2.5 rounded-xl bg-red-500 hover:bg-red-400 text-white text-xs font-bold uppercase tracking-wider"
              >
                {submittingAction ? 'Rejecting...' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Force End / Match Override Modal */}
      {showForceEndModal && (
        <AdminForceEndModal
          match={match}
          onClose={() => setShowForceEndModal(false)}
          onSuccess={() => setShowForceEndModal(false)}
        />
      )}

      {/* Admin Dispute Resolution Modal */}
      {showAdminResolveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
          <div className="relative w-full max-w-lg bg-[#0a0a0f] border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-xl font-bold font-display text-white">Official Dispute Resolution</h3>
                <p className="text-xs text-slate-400 font-mono">Station {match.station} — {match.gameName}</p>
              </div>
            </div>

            <div className="space-y-4 my-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2 font-mono">
                  Select Official Winner
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedAdminOutcome('playerA')}
                    className={`p-3 rounded-xl border text-center font-bold text-xs transition-all ${
                      selectedAdminOutcome === 'playerA'
                        ? 'bg-cyan-400 text-black border-cyan-400 font-black'
                        : 'bg-[#15151b] border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    {is5v5
                      ? `${match.teamAName || 'Team A'} WON`
                      : `Confirm ${match.playerAGamerTag} as Winner`}
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedAdminOutcome('playerB')}
                    className={`p-3 rounded-xl border text-center font-bold text-xs transition-all ${
                      selectedAdminOutcome === 'playerB'
                        ? 'bg-cyan-400 text-black border-cyan-400 font-black'
                        : 'bg-[#15151b] border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    {is5v5
                      ? `${match.teamBName || 'Team B'} WON`
                      : `Confirm ${match.playerBGamerTag} as Winner`}
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedAdminOutcome('draw')}
                    className={`p-3 rounded-xl border text-center font-bold text-xs transition-all ${
                      selectedAdminOutcome === 'draw'
                        ? 'bg-yellow-400 text-black border-yellow-400 font-black'
                        : 'bg-[#15151b] border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    {is5v5 ? 'DRAW' : 'Confirm Draw'}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5 font-mono">
                  Admin Ruling Note
                </label>
                <textarea
                  rows={3}
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  placeholder="e.g. Verified official station replay. Player A won 3-1."
                  className="w-full p-3 bg-[#15151b] border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowAdminResolveModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 uppercase tracking-wider"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAdminResolve}
                disabled={submittingAction || !selectedAdminOutcome}
                className="px-5 py-2.5 rounded-xl bg-red-500 hover:bg-red-400 disabled:bg-slate-800 text-white text-xs font-bold uppercase tracking-wider transition-all shadow-md"
              >
                {submittingAction ? 'Applying Ruling...' : 'Confirm Ruling'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Join 5v5 Squad Modal */}
      {showJoinSquadModal && match && (
        <Join5v5LobbyModal
          isOpen={showJoinSquadModal}
          onClose={() => setShowJoinSquadModal(false)}
          initialLobbyCode={match.lobbyCode}
          onLobbyJoined={(updatedMatch) => {
            setShowJoinSquadModal(false);
            setMatch(updatedMatch);
            showToast('success', 'Joined Opposing Team! ⚔️', 'You have entered the 5v5 match as Team B.');
          }}
        />
      )}

      {/* Invite Nexus Player to 5v5 Squad Modal */}
      {inviteModalTeamSide && match && (
        <InvitePlayer5v5Modal
          isOpen={!!inviteModalTeamSide}
          onClose={() => setInviteModalTeamSide(null)}
          match={match}
          teamSide={inviteModalTeamSide}
          currentUser={user}
          currentUserId={user?.uid}
          currentProfile={playerProfile}
          canSelectBothTeams={isLobbyOwner || isTeamACaptain}
          onInviteSent={(gamerTag) => {
            showToast(
              'success',
              'Invitation Sent! 📩',
              `Invitation sent to ${gamerTag}. They must accept before joining the squad roster.`
            );
          }}
          onSuccess={() => {
            setInviteModalTeamSide(null);
          }}
        />
      )}

      {/* Remove 5v5 Lobby Modal */}
      {showRemoveLobbyModal && match && (
        <RemoveLobbyModal
          isOpen={showRemoveLobbyModal}
          onClose={() => setShowRemoveLobbyModal(false)}
          onConfirm={handleConfirmRemoveLobby}
          lobbyCode={match.lobbyCode}
          gameName={match.gameName}
          station={match.station}
          isSubmitting={submittingAction}
        />
      )}

      {/* Leave 5v5 Lobby Modal */}
      {showLeaveLobbyModal && match && user && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#121218] border border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            {/* Header */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                <LogOut className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h3 className="text-base font-bold font-display text-white">
                  {isLobbyOwner
                    ? 'TRANSFER OWNERSHIP & LEAVE'
                    : isTeamBCaptain && teamBPlayerIds[0] === user.uid
                    ? 'STEP DOWN & LEAVE SQUAD?'
                    : 'LEAVE 5v5 LOBBY?'}
                </h3>
                <p className="text-xs text-amber-400 font-mono">
                  {isLobbyOwner
                    ? 'Lobby Owner Departure'
                    : isTeamBCaptain && teamBPlayerIds[0] === user.uid
                    ? 'Team B Captain Departure'
                    : 'Roster Slot Departure'}
                </p>
              </div>
            </div>

            {/* Body */}
            {isLobbyOwner ? (
              // Case: Lobby Owner
              teamAPlayerIds.filter((pid) => pid !== user.uid).length > 0 ? (
                <div className="space-y-3">
                  <p className="text-xs text-slate-300 font-mono leading-relaxed bg-[#0a0a0f] p-3.5 rounded-2xl border border-slate-800">
                    You are the Lobby Owner. To leave without closing the lobby, transfer ownership & captaincy to an eligible Team A teammate:
                  </p>
                  <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                    {teamAPlayerIds
                      .filter((pid) => pid !== user.uid)
                      .map((pid) => {
                        const profile = livePlayerProfiles[pid];
                        return (
                          <label
                            key={pid}
                            className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
                              transferOwnerTargetId === pid
                                ? 'bg-amber-500/10 border-amber-500 text-white'
                                : 'bg-[#15151b] border-slate-800 text-slate-400 hover:border-slate-700'
                            }`}
                          >
                            <div className="flex items-center gap-2.5">
                              <input
                                type="radio"
                                name="transferOwner"
                                value={pid}
                                checked={transferOwnerTargetId === pid}
                                onChange={() => setTransferOwnerTargetId(pid)}
                                className="text-amber-500 focus:ring-amber-500"
                              />
                              <span className="text-xs font-bold font-mono text-white">
                                {profile?.gamerTag || pid}
                              </span>
                            </div>
                            <span className="text-[10px] font-mono text-slate-400">{profile?.overallRating || 1000} MMR</span>
                          </label>
                        );
                      })}
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-3 flex-wrap">
                    <button
                      type="button"
                      onClick={() => handleConfirmRemoveLobby()}
                      disabled={submittingAction}
                      className="px-3 py-2 rounded-xl text-xs font-mono text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                      title="Close lobby for all players"
                    >
                      Close Lobby Instead
                    </button>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowLeaveLobbyModal(false)}
                        disabled={submittingAction}
                        className="px-3.5 py-2 rounded-xl text-xs font-mono text-slate-400 hover:text-white transition-colors cursor-pointer"
                      >
                        CANCEL
                      </button>
                      <button
                        type="button"
                        onClick={() => handleConfirmLeaveLobby(transferOwnerTargetId)}
                        disabled={submittingAction || !transferOwnerTargetId}
                        className={`px-4 py-2 rounded-xl text-xs font-mono font-bold uppercase tracking-wider transition-all shadow-md cursor-pointer ${
                          transferOwnerTargetId
                            ? 'bg-amber-400 hover:bg-amber-300 text-black'
                            : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                        }`}
                      >
                        {submittingAction ? 'Processing...' : 'TRANSFER & LEAVE'}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-xs text-slate-300 font-mono leading-relaxed bg-[#0a0a0f] p-3.5 rounded-2xl border border-slate-800">
                    You are the Lobby Owner and sole Team A member. Leaving will close and remove this 5v5 lobby.
                  </p>
                  <div className="flex items-center justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowLeaveLobbyModal(false)}
                      disabled={submittingAction}
                      className="px-4 py-2.5 rounded-xl text-xs font-mono text-slate-400 hover:text-white transition-colors cursor-pointer"
                    >
                      CANCEL
                    </button>
                    <button
                      type="button"
                      onClick={() => handleConfirmLeaveLobby()}
                      disabled={submittingAction}
                      className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-mono font-bold uppercase tracking-wider transition-all shadow-md cursor-pointer"
                    >
                      {submittingAction ? 'Closing...' : 'CLOSE & LEAVE LOBBY'}
                    </button>
                  </div>
                </div>
              )
            ) : isTeamBCaptain && teamBPlayerIds[0] === user.uid ? (
              // Case: Team B Captain
              <div className="space-y-4">
                <p className="text-xs text-slate-300 font-mono leading-relaxed bg-[#0a0a0f] p-3.5 rounded-2xl border border-slate-800">
                  {teamBPlayerIds.length > 1
                    ? 'Leaving will step you down as Team B Captain. Captaincy will automatically transfer to the next squad member.'
                    : 'You are the sole member of Team B. Leaving will reset the opposing squad to empty (0/5) so new challengers can enter.'}
                </p>
                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowLeaveLobbyModal(false)}
                    disabled={submittingAction}
                    className="px-4 py-2.5 rounded-xl text-xs font-mono text-slate-400 hover:text-white transition-colors cursor-pointer"
                  >
                    CANCEL
                  </button>
                  <button
                    type="button"
                    onClick={() => handleConfirmLeaveLobby()}
                    disabled={submittingAction}
                    className="px-5 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-black text-xs font-mono font-bold uppercase tracking-wider transition-all shadow-md cursor-pointer"
                  >
                    {submittingAction ? 'Leaving...' : 'STEP DOWN & LEAVE'}
                  </button>
                </div>
              </div>
            ) : (
              // Case: Regular Member
              <div className="space-y-4">
                <p className="text-xs text-slate-300 font-mono leading-relaxed bg-[#0a0a0f] p-3.5 rounded-2xl border border-slate-800">
                  Are you sure you want to leave this 5v5 lobby? Your roster slot will be freed up for other players.
                </p>
                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowLeaveLobbyModal(false)}
                    disabled={submittingAction}
                    className="px-4 py-2.5 rounded-xl text-xs font-mono text-slate-400 hover:text-white transition-colors cursor-pointer"
                  >
                    CANCEL
                  </button>
                  <button
                    type="button"
                    onClick={() => handleConfirmLeaveLobby()}
                    disabled={submittingAction}
                    className="px-5 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-400 text-white text-xs font-mono font-bold uppercase tracking-wider transition-all shadow-md cursor-pointer"
                  >
                    {submittingAction ? 'Leaving...' : 'LEAVE LOBBY'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
