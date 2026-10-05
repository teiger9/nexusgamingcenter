import React from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { AppNotification, TeamInvitation, Player, Match, RoleInvitation } from '../types';
import { markNotificationAsRead, markAllNotificationsAsRead } from '../services/notificationService';
import { respondToTeamInvitation } from '../services/teamService';
import { normalizeInvitationStatus } from '../utils/tournamentTeamStatus';
import { InvitationCountdownBadge } from './InvitationCountdownBadge';
import { isInvitationExpired, INVITATION_EXPIRATION_MS } from '../utils/invitationExpiration';
import { useAuth } from '../context/AuthContext';
import { useToast } from './Toast';
import { AcceptRoleInvitationModal } from './AcceptRoleInvitationModal';
import {
  Bell,
  CheckCircle2,
  AlertTriangle,
  Flame,
  Shield,
  ShieldAlert,
  Trophy,
  Swords,
  X,
  Check,
  Calendar,
  Clock,
  ExternalLink,
  Gamepad2,
  Info,
} from 'lucide-react';

interface NotificationsViewProps {
  notifications: AppNotification[];
  invitations?: TeamInvitation[];
  onSelectMatch?: (matchId: string, invitationId?: string) => void;
  onSelectMatchInvite?: (data: { invitationId?: string; lobbyId: string; teamId?: string }) => void;
  onSelectTeam?: (teamId: string) => void;
  onSelectTournamentInvite?: (data: { invitationId?: string; teamId?: string; tournamentId?: string }) => void;
  onSelectReservation?: (reservationId: string, notificationId?: string) => void;
  onClose?: () => void;
}

export interface ReconciledInvitationState {
  isActionable: boolean;
  statusCategory:
    | 'PENDING'
    | 'ACCEPTED'
    | 'DECLINED'
    | 'CANCELLED'
    | 'MATCH_ENDED'
    | 'MATCH_IN_PROGRESS'
    | 'LOBBY_FULL'
    | 'SLOT_TAKEN'
    | 'EXPIRED';
  badgeLabel: string;
  badgeStyle: string;
  badgeIcon: string;
  reasonText?: string;
  disabledReason?: string;
}

export function reconcileInvitationStatus(params: {
  notif?: AppNotification;
  invitation?: TeamInvitation;
  match?: Match;
  currentUserId?: string;
}): ReconciledInvitationState {
  const { notif, invitation, match, currentUserId } = params;

  // 1. Check raw statuses from notification and invitation
  const notifActioned = notif?.notificationState === 'ACTIONED' || notif?.data?.actionState === 'ACTIONED';
  const notifResult = notif?.actionResult || notif?.data?.status;
  const inviteStatus = normalizeInvitationStatus(invitation?.status || notif?.status || notif?.data?.status || 'PENDING');

  // Check if invitation was explicitly ACCEPTED
  if (
    inviteStatus === 'ACCEPTED' ||
    notifResult === 'ACCEPTED' ||
    (match && currentUserId && (
      (match.playerBId === currentUserId && match.opponentAccepted) ||
      (match.teamAPlayerIds && match.teamAPlayerIds.includes(currentUserId)) ||
      (match.teamBPlayerIds && match.teamBPlayerIds.includes(currentUserId))
    ))
  ) {
    return {
      isActionable: false,
      statusCategory: 'ACCEPTED',
      badgeLabel: 'INVITATION ACCEPTED',
      badgeStyle: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
      badgeIcon: '✅',
      reasonText: 'You have accepted this invitation.',
    };
  }

  // Check if invitation was explicitly DECLINED
  if (inviteStatus === 'DECLINED' || notifResult === 'DECLINED') {
    return {
      isActionable: false,
      statusCategory: 'DECLINED',
      badgeLabel: 'INVITATION DECLINED',
      badgeStyle: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
      badgeIcon: '❌',
      reasonText: 'You declined this invitation.',
    };
  }

  // Check if match or invitation was CANCELLED
  if (
    inviteStatus === 'CANCELLED' ||
    notifResult === 'CANCELLED' ||
    (match && (match.status === 'CANCELLED' || match.invitationStatus === 'CANCELLED'))
  ) {
    return {
      isActionable: false,
      statusCategory: 'CANCELLED',
      badgeLabel: 'MATCH CANCELLED',
      badgeStyle: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
      badgeIcon: '⚠️',
      reasonText: match?.cancellationReason ? `Cancelled: ${match.cancellationReason}` : 'The host cancelled this match or invitation.',
      disabledReason: 'Match was cancelled',
    };
  }

  // Check if match was REJECTED by referee/admin
  if (match && match.status === 'REJECTED') {
    return {
      isActionable: false,
      statusCategory: 'CANCELLED',
      badgeLabel: 'MATCH REJECTED',
      badgeStyle: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
      badgeIcon: '🚫',
      reasonText: 'Match request was rejected by referee.',
      disabledReason: 'Match rejected',
    };
  }

  // Check if match has COMPLETED or CONFIRMED (Ended)
  if (match && (match.status === 'COMPLETED' || match.status === 'CONFIRMED')) {
    return {
      isActionable: false,
      statusCategory: 'MATCH_ENDED',
      badgeLabel: 'MATCH ENDED',
      badgeStyle: 'bg-slate-700/40 text-slate-300 border-slate-600',
      badgeIcon: '🏁',
      reasonText: 'This match has already concluded.',
      disabledReason: 'Match has ended',
    };
  }

  // Check if match is already IN_PROGRESS or LIVE
  if (match && (match.status === 'LIVE' || (match.status as string) === 'IN_PROGRESS')) {
    return {
      isActionable: false,
      statusCategory: 'MATCH_IN_PROGRESS',
      badgeLabel: 'MATCH IN PROGRESS',
      badgeStyle: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 animate-pulse',
      badgeIcon: '⚡',
      reasonText: 'This match is currently live in progress.',
      disabledReason: 'Match in progress',
    };
  }

  const is5v5Match = match && (match.matchType === '5v5' || Boolean(match.lobbyCode || match.teamAPlayerIds));

  // Check if 1v1 match opponent slot has already been taken by someone else
  if (match && !is5v5Match) {
    if (match.playerBId && currentUserId && match.playerBId !== currentUserId && match.opponentAccepted) {
      return {
        isActionable: false,
        statusCategory: 'SLOT_TAKEN',
        badgeLabel: 'OPPONENT SLOT TAKEN',
        badgeStyle: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
        badgeIcon: '🚫',
        reasonText: 'Another player accepted the opponent slot for this match.',
        disabledReason: 'Slot filled',
      };
    }
  }

  // Check if 5v5 lobby or squad is already full (5/5)
  if (match && is5v5Match) {
    const side = invitation?.teamSide || notif?.data?.teamSide || 'teamA';
    const teamKey = side === 'teamA' ? 'teamAPlayerIds' : 'teamBPlayerIds';
    const roster: string[] = match[teamKey] || [];
    const isTeamFull = roster.length >= 5;
    const isBothFull = (match.teamAPlayerIds || []).length >= 5 && (match.teamBPlayerIds || []).length >= 5;

    if (isBothFull && (!currentUserId || (!roster.includes(currentUserId) && !(match.teamAPlayerIds || []).includes(currentUserId) && !(match.teamBPlayerIds || []).includes(currentUserId)))) {
      return {
        isActionable: false,
        statusCategory: 'LOBBY_FULL',
        badgeLabel: 'LOBBY FULL (10/10)',
        badgeStyle: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
        badgeIcon: '👥',
        reasonText: 'Both squads in this lobby are completely full.',
        disabledReason: 'Lobby full',
      };
    }

    if (isTeamFull && (!currentUserId || !roster.includes(currentUserId))) {
      return {
        isActionable: false,
        statusCategory: 'LOBBY_FULL',
        badgeLabel: `${side === 'teamA' ? 'TEAM A' : 'TEAM B'} FULL (5/5)`,
        badgeStyle: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
        badgeIcon: '👥',
        reasonText: `${side === 'teamA' ? 'Team A' : 'Team B'} squad is already full (5/5 players).`,
        disabledReason: 'Squad full',
      };
    }
  }

  const now = Date.now();
  const effectiveExpiresAt =
    invitation?.expiresAt ||
    notif?.expiresAt ||
    notif?.data?.expiresAt ||
    (invitation?.createdAt ? invitation.createdAt + INVITATION_EXPIRATION_MS : 0) ||
    (notif?.createdAt ? notif.createdAt + INVITATION_EXPIRATION_MS : 0);

  const isExpiredByTimestamp = effectiveExpiresAt > 0 && now >= effectiveExpiresAt;

  // Check if invitation is marked EXPIRED or timestamp has passed
  if (inviteStatus === 'EXPIRED' || notifResult === 'EXPIRED' || isExpiredByTimestamp) {
    return {
      isActionable: false,
      statusCategory: 'EXPIRED',
      badgeLabel: 'INVITATION EXPIRED',
      badgeStyle: 'bg-rose-500/10 text-rose-400 border-rose-500/40',
      badgeIcon: '⌛',
      reasonText: '⏱ This invitation has expired after 15 minutes.',
      disabledReason: 'Invitation expired',
    };
  }

  // Check if notification was marked ACTIONED without explicit status
  if (notifActioned && notifResult) {
    return {
      isActionable: false,
      statusCategory: notifResult === 'ACCEPTED' ? 'ACCEPTED' : notifResult === 'DECLINED' ? 'DECLINED' : 'EXPIRED',
      badgeLabel: `INVITATION ${notifResult}`,
      badgeStyle: 'bg-slate-800 text-slate-400 border-slate-700',
      badgeIcon: '📋',
      reasonText: `Invitation already processed (${notifResult}).`,
      disabledReason: 'Already processed',
    };
  }

  // Default: Truly pending and actionable
  return {
    isActionable: true,
    statusCategory: 'PENDING',
    badgeLabel: 'INVITATION PENDING',
    badgeStyle: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    badgeIcon: '🟢',
  };
}

export const NotificationsView: React.FC<NotificationsViewProps> = ({
  notifications,
  invitations = [],
  onSelectMatch,
  onSelectMatchInvite,
  onSelectTeam,
  onSelectTournamentInvite,
  onSelectReservation,
  onClose,
}) => {
  const { user, playerProfile, isAdmin, isStaff } = useAuth();
  const { showToast } = useToast();
  const [submittingInviteId, setSubmittingInviteId] = React.useState<string | null>(null);
  const [selectedRoleInvitation, setSelectedRoleInvitation] = React.useState<RoleInvitation | null>(null);

  // Track live matches and invitations in real-time
  const [liveMatches, setLiveMatches] = React.useState<Record<string, Match>>({});
  const [liveInvitations, setLiveInvitations] = React.useState<Record<string, TeamInvitation>>({});

  const relevantMatchIds = React.useMemo(() => {
    const set = new Set<string>();
    notifications.forEach((n) => {
      const id = n.matchId || n.lobbyId || n.data?.matchId || n.data?.lobbyId;
      if (id && typeof id === 'string') set.add(id);
    });
    invitations.forEach((inv) => {
      const id = inv.matchId || inv.lobbyId;
      if (id && typeof id === 'string') set.add(id);
    });
    return Array.from(set);
  }, [notifications, invitations]);

  const relevantInviteIds = React.useMemo(() => {
    const set = new Set<string>();
    notifications.forEach((n) => {
      const id = n.invitationId || n.data?.invitationId;
      if (id && typeof id === 'string') set.add(id);
    });
    invitations.forEach((inv) => {
      if (inv.id && typeof inv.id === 'string') set.add(inv.id);
    });
    return Array.from(set);
  }, [notifications, invitations]);

  React.useEffect(() => {
    if (relevantMatchIds.length === 0) {
      setLiveMatches({});
      return;
    }

    const unsubs = relevantMatchIds.map((mId) => {
      return onSnapshot(
        doc(db, 'matches', mId),
        (snap) => {
          if (snap.exists()) {
            const data = { id: snap.id, ...snap.data() } as Match;
            setLiveMatches((prev) => ({ ...prev, [mId]: data }));
          } else {
            setLiveMatches((prev) => {
              const copy = { ...prev };
              delete copy[mId];
              return copy;
            });
          }
        },
        (err) => console.warn('Error listening to live match in notifications:', err)
      );
    });

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [relevantMatchIds.join(',')]);

  React.useEffect(() => {
    if (relevantInviteIds.length === 0) {
      setLiveInvitations({});
      return;
    }

    const unsubs = relevantInviteIds.map((invId) => {
      return onSnapshot(
        doc(db, 'teamInvitations', invId),
        (snap) => {
          if (snap.exists()) {
            const data = { id: snap.id, ...snap.data() } as TeamInvitation;
            setLiveInvitations((prev) => ({ ...prev, [invId]: data }));
          } else {
            setLiveInvitations((prev) => {
              const copy = { ...prev };
              delete copy[invId];
              return copy;
            });
          }
        },
        (err) => console.warn('Error listening to live invitation in notifications:', err)
      );
    });

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [relevantInviteIds.join(',')]);

  const handleMarkAllRead = async () => {
    if (!user) return;
    await markAllNotificationsAsRead(user.uid);
    showToast('info', 'Notifications Updated', 'All notifications marked as read.');
  };

  const handleInvitationResponse = async (invitationId: string, response: 'accepted' | 'declined', teamName: string) => {
    if (!user) return;
    setSubmittingInviteId(invitationId);
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
        if (response === 'accepted') {
          showToast('success', 'Match Joined! 🎮', `You accepted the invitation for ${teamName}!`);
        } else {
          showToast('info', 'Invitation Declined', `Declined invitation for ${teamName}.`);
        }
      } else {
        showToast('error', 'Action Unavailable', res.error || 'Could not process invitation.');
      }
    } catch (err: any) {
      showToast('error', 'Error', err.message || 'Failed to respond to invitation.');
    } finally {
      setSubmittingInviteId(null);
    }
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center">
            <Bell className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-black font-display text-white">NOTIFICATIONS & ALERTS</h1>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              {unreadCount > 0 ? `${unreadCount} unread alert(s)` : 'All caught up'}
            </p>
          </div>
        </div>

        {unreadCount > 0 && (
          <button
            onClick={handleMarkAllRead}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-mono text-cyan-400 font-bold transition-colors"
          >
            Mark All Read
          </button>
        )}
      </div>

      {/* Pending Invitations Section (Top quick-action deck) */}
      {invitations.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs font-mono font-bold text-yellow-400 uppercase">
            <Shield className="w-4 h-4" />
            <span>Active Challenges & Invitations ({invitations.length})</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {invitations.map((inv) => {
              const liveInv = liveInvitations[inv.id] || inv;
              const liveM = liveMatches[inv.matchId || inv.lobbyId || ''];
              const recon = reconcileInvitationStatus({
                invitation: liveInv,
                match: liveM,
                currentUserId: user?.uid,
              });

              const isTournInvite = inv.type === 'TEAM_TOURNAMENT_INVITATION' || Boolean(inv.tournamentId);
              const isChessInvite =
                inv.type === 'CHESS_MATCH_INVITATION' ||
                inv.game === 'Chess' ||
                (inv.gameName && inv.gameName.toLowerCase().includes('chess'));
              const is5v5Invite = !isChessInvite && Boolean(inv.lobbyId || inv.type === '5V5_LOBBY_INVITATION');
              const matchId = inv.matchId || inv.lobbyId;

              return (
                <div
                  key={inv.id}
                  onClick={() => {
                    if (isTournInvite && onSelectTournamentInvite) {
                      onSelectTournamentInvite({
                        invitationId: inv.id,
                        teamId: inv.teamId,
                        tournamentId: inv.tournamentId,
                      });
                    } else if (matchId) {
                      if (is5v5Invite && onSelectMatchInvite) {
                        onSelectMatchInvite({ invitationId: inv.id, lobbyId: matchId, teamId: inv.teamId });
                      } else if (onSelectMatch) {
                        onSelectMatch(matchId, inv.id);
                      }
                    }
                  }}
                  className={`p-4 rounded-2xl border shadow-lg space-y-3 transition-all ${
                    isTournInvite
                      ? 'bg-gradient-to-r from-amber-950/30 to-[#0a0a0f] border-amber-500/40 hover:border-amber-400 cursor-pointer'
                      : !recon.isActionable
                      ? 'bg-[#0a0a0f] border-slate-800 opacity-80'
                      : isChessInvite || is5v5Invite
                      ? 'bg-gradient-to-r from-cyan-950/40 to-[#0a0a0f] border-cyan-400/50 hover:border-cyan-300 cursor-pointer'
                      : 'bg-gradient-to-r from-cyan-950/30 to-[#0a0a0f] border-cyan-500/30'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="text-2xl">{inv.teamLogo || (isTournInvite ? '🏆' : isChessInvite ? '♟️' : is5v5Invite ? '🎮' : '🛡️')}</span>
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-bold text-white">{isChessInvite ? 'Chess 1v1 Match' : inv.teamName}</span>
                          {inv.teamTag && !isChessInvite && (
                            <span className="text-xs text-cyan-400">[{inv.teamTag}]</span>
                          )}
                          {isTournInvite && (
                            <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 text-[9px] font-mono font-bold">
                              TOURNAMENT
                            </span>
                          )}
                          {isChessInvite && (
                            <span className="px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-[9px] font-mono font-bold">
                              CHESS 1V1
                            </span>
                          )}
                          {is5v5Invite && (
                            <span className="px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-[9px] font-mono font-bold">
                              5v5 MATCH
                            </span>
                          )}
                          {recon.statusCategory === 'PENDING' ? (
                            <InvitationCountdownBadge
                              expiresAt={inv.expiresAt}
                              createdAt={inv.createdAt}
                              size="xs"
                            />
                          ) : (
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase tracking-wider border ${recon.badgeStyle}`}>
                              {recon.badgeIcon} {recon.badgeLabel}
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] font-mono text-slate-400">
                          {isChessInvite ? (
                            <span>Station {inv.station || 'CHESS-01'} • Invited by {inv.captainGamerTag || inv.inviterGamerTag || 'Opponent'}</span>
                          ) : (
                            <>
                              {inv.tournamentName ? `${inv.tournamentName} • ` : ''}
                              {inv.gameName || inv.game || '5v5 Match'} • Captain {inv.captainGamerTag || inv.inviterGamerTag || 'Leader'}
                            </>
                          )}
                        </div>
                        {recon.reasonText && !recon.isActionable && (
                          <div className="text-[11px] text-amber-400 font-mono mt-1">
                            {recon.reasonText}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800/80">
                    {isTournInvite ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onSelectTournamentInvite) {
                            onSelectTournamentInvite({
                              invitationId: inv.id,
                              teamId: inv.teamId,
                              tournamentId: inv.tournamentId,
                            });
                          }
                        }}
                        className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 text-xs font-mono font-bold uppercase transition-all shadow-md flex items-center gap-1.5"
                      >
                        <Trophy className="w-3.5 h-3.5" />
                        <span>Review & Join Squad</span>
                      </button>
                    ) : (
                      <>
                        {matchId && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isChessInvite) {
                                if (onSelectMatch) onSelectMatch(matchId, inv.id);
                              } else {
                                if (onSelectMatchInvite) {
                                  onSelectMatchInvite({ invitationId: inv.id, lobbyId: matchId, teamId: inv.teamId });
                                } else if (onSelectMatch) {
                                  onSelectMatch(matchId, inv.id);
                                }
                              }
                            }}
                            className="px-3 py-1.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-xs font-mono font-bold transition-all flex items-center gap-1"
                          >
                            <span>{isChessInvite ? 'Match' : 'Lobby'}</span>
                            <ExternalLink className="w-3 h-3" />
                          </button>
                        )}
                        {recon.isActionable ? (
                          <>
                            <button
                              disabled={submittingInviteId === inv.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleInvitationResponse(inv.id, 'declined', isChessInvite ? 'Chess Match' : inv.teamName);
                              }}
                              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono font-bold transition-colors disabled:opacity-50"
                            >
                              Decline
                            </button>
                            <button
                              disabled={submittingInviteId === inv.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleInvitationResponse(inv.id, 'accepted', isChessInvite ? 'Chess Match' : inv.teamName);
                              }}
                              className="px-4 py-1.5 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-black text-xs font-mono font-bold uppercase transition-all shadow-md flex items-center gap-1 disabled:opacity-50"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>{isChessInvite ? 'Accept Match' : 'Accept & Join'}</span>
                            </button>
                          </>
                        ) : (
                          <span className="text-[11px] font-mono text-slate-500 italic px-2">
                            {recon.disabledReason || 'Action unavailable'}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* General Notifications Feed */}
      <div className="space-y-3">
        {notifications.length === 0 ? (
          <div className="bg-[#0a0a0f] border border-slate-800 rounded-3xl p-12 text-center space-y-3">
            <Bell className="w-10 h-10 text-slate-700 mx-auto" />
            <h3 className="text-base font-bold text-white">No Notifications</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Match confirmations, squad invitations, dispute updates, and seasonal milestones will appear here.
            </p>
          </div>
        ) : (
          notifications.map((notif) => {
            const isUnread = !notif.read;
            const timeAgo = formatTimeAgo(notif.createdAt);
            const isTournamentInvite =
              notif.type === 'TEAM_TOURNAMENT_INVITATION' ||
              notif.type === 'TOURNAMENT_TEAM_INVITE' ||
              notif.data?.type === 'TEAM_TOURNAMENT_INVITATION' ||
              Boolean(notif.data?.tournamentId && (notif.data?.invitationId || notif.data?.teamId));

            const isReservation = Boolean(notif.data?.reservationId);
            const isRoleInvitation =
              notif.type === 'ROLE_INVITATION' ||
              Boolean(notif.data?.roleInvitationId || (notif.data?.invitationId && notif.data?.invitedRole));
            const isActioned = notif.notificationState === 'ACTIONED' || notif.data?.actionState === 'ACTIONED';
            const actionResult = notif.actionResult || notif.data?.status;

            const isMatchInvitation =
              notif.type === 'MATCH_INVITATION' ||
              notif.type === 'CHESS_MATCH_INVITATION' ||
              Boolean((notif.invitationId || notif.data?.invitationId) && (notif.lobbyId || notif.data?.lobbyId || notif.data?.matchId));

            const isChessInvitation =
              notif.type === 'CHESS_MATCH_INVITATION' ||
              notif.game?.toLowerCase() === 'chess' ||
              notif.data?.game?.toLowerCase() === 'chess' ||
              notif.data?.gameCategory === 'CHESS' ||
              Boolean(notif.data?.station && notif.data.station.toLowerCase().includes('chess'));

            const matchInviteId = notif.invitationId || notif.data?.invitationId;
            const matchLobbyId = notif.lobbyId || notif.data?.lobbyId || notif.data?.matchId;
            const matchTeamId = notif.teamId || notif.data?.teamId;
            const matchTeamName = isChessInvitation ? 'Chess 1v1 Match' : (notif.data?.teamName || 'Squad');
            const matchTeamTag = notif.data?.teamTag ? `[${notif.data.teamTag}]` : '';
            const matchGame = notif.game || notif.data?.game || notif.data?.gameName || (isChessInvitation ? 'Chess' : '1v1 Match');
            const matchInviter = notif.inviterGamerTag || notif.data?.inviterGamerTag || (isChessInvitation ? 'Opponent' : 'Squad Captain');

            // Resolve real-time linked invitation and match
            const linkedInvite = matchInviteId ? liveInvitations[matchInviteId] : undefined;
            const linkedMatch = matchLobbyId ? liveMatches[matchLobbyId] : undefined;

            // Reconcile status dynamically against live Firestore state
            const reconciled = isMatchInvitation
              ? reconcileInvitationStatus({
                  notif,
                  invitation: linkedInvite,
                  match: linkedMatch,
                  currentUserId: user?.uid,
                })
              : null;

            return (
              <div
                key={notif.id}
                onClick={() => {
                  if (isUnread) markNotificationAsRead(notif.id);
                  if (isReservation && onSelectReservation) {
                    onSelectReservation(notif.data!.reservationId!, notif.id);
                  } else if (isTournamentInvite && onSelectTournamentInvite) {
                    onSelectTournamentInvite({
                      invitationId: notif.data?.invitationId,
                      teamId: notif.data?.teamId,
                      tournamentId: notif.data?.tournamentId,
                    });
                  } else if (isMatchInvitation && matchLobbyId) {
                    if (onSelectMatchInvite) {
                      onSelectMatchInvite({ invitationId: matchInviteId, lobbyId: matchLobbyId, teamId: matchTeamId });
                    } else if (onSelectMatch) {
                      onSelectMatch(matchLobbyId, matchInviteId);
                    }
                  } else if (notif.data?.matchId && onSelectMatch) {
                    onSelectMatch(notif.data.matchId);
                  } else if (notif.data?.teamId && onSelectTeam) {
                    onSelectTeam(notif.data.teamId);
                  }
                }}
                className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col gap-3 ${
                  isReservation
                    ? isActioned
                      ? 'bg-[#0b1017] border-emerald-900/40 hover:border-emerald-700/50'
                      : isUnread
                      ? 'bg-[#1a0f12] border-red-500/50 hover:border-red-400 shadow-lg shadow-red-950/20'
                      : 'bg-[#120a0d] border-red-900/40 hover:border-red-700'
                    : isMatchInvitation
                    ? reconciled?.isActionable
                      ? 'bg-gradient-to-r from-cyan-950/40 via-slate-900/60 to-[#0a0a0f] border-cyan-400/60 hover:border-cyan-300 shadow-lg shadow-cyan-950/20'
                      : reconciled?.statusCategory === 'ACCEPTED'
                      ? 'bg-[#0b1411] border-emerald-900/50 hover:border-emerald-700/50'
                      : reconciled?.statusCategory === 'DECLINED'
                      ? 'bg-[#140b0d] border-rose-900/40 hover:border-rose-800'
                      : reconciled?.statusCategory === 'CANCELLED'
                      ? 'bg-[#19140a] border-amber-900/40 hover:border-amber-800'
                      : 'bg-[#0a0a0f] border-slate-800 hover:border-slate-700'
                    : isUnread
                    ? isTournamentInvite
                      ? 'bg-[#15130d] border-amber-500/40 hover:border-amber-400'
                      : 'bg-[#10121d] border-cyan-500/30 hover:border-cyan-400'
                    : 'bg-[#0a0a0f] border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3.5">
                    <div className="mt-0.5">{getNotificationIcon(notif.type)}</div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-xs font-bold text-white font-mono">{notif.title}</h4>
                        {isUnread && (
                          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                        )}

                        {/* Real-time Reconciled Status Badge */}
                        {isMatchInvitation && reconciled && (
                          reconciled.statusCategory === 'PENDING' ? (
                            <InvitationCountdownBadge
                              expiresAt={notif.expiresAt || notif.data?.expiresAt || linkedInvite?.expiresAt}
                              createdAt={notif.createdAt || linkedInvite?.createdAt}
                              size="xs"
                            />
                          ) : (
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider border flex items-center gap-1.5 ${reconciled.badgeStyle}`}>
                              <span>{reconciled.badgeIcon}</span>
                              <span>{reconciled.badgeLabel}</span>
                            </span>
                          )
                        )}

                        {isTournamentInvite && !isReservation && (
                          <InvitationCountdownBadge
                            expiresAt={notif.expiresAt || notif.data?.expiresAt}
                            createdAt={notif.createdAt}
                            size="xs"
                          />
                        )}

                        {isReservation && (
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider ${
                              isActioned
                                ? actionResult === 'CONFIRMED'
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                  : actionResult === 'REJECTED'
                                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                  : 'bg-slate-700/40 text-slate-400'
                                : 'bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse'
                            }`}
                          >
                            {isActioned
                              ? actionResult === 'CONFIRMED'
                                ? '✅ Confirmed'
                                : actionResult === 'REJECTED'
                                ? '❌ Declined'
                                : 'Cancelled'
                              : 'Pending Approval'}
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-slate-300 leading-relaxed font-sans whitespace-pre-line">{notif.message}</p>

                      {/* Explicit Explanation Subtitle when Ended/Expired/Cancelled */}
                      {isMatchInvitation && reconciled && !reconciled.isActionable && reconciled.reasonText && (
                        <div className="text-[11px] font-mono text-amber-400/90 flex items-center gap-1.5 pt-0.5">
                          <Info className="w-3.5 h-3.5 shrink-0" />
                          <span>{reconciled.reasonText}</span>
                        </div>
                      )}

                      <div className="flex items-center gap-2 text-[10px] font-mono text-slate-500 pt-0.5 flex-wrap">
                        <Clock className="w-3 h-3" />
                        <span>{timeAgo}</span>
                        {notif.data?.customerName && (
                          <>
                            <span>•</span>
                            <span className="text-slate-300 font-bold">{notif.data.customerName}</span>
                          </>
                        )}
                        {(matchGame || notif.data?.gameName) && (
                          <>
                            <span>•</span>
                            <span className="text-cyan-400 font-bold">{matchGame || notif.data?.gameName}</span>
                          </>
                        )}
                        {notif.data?.tournamentName && (
                          <>
                            <span>•</span>
                            <span className="text-amber-400 font-bold">{notif.data.tournamentName}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Standard Header Shortcuts for Non-Match Items */}
                  {!isMatchInvitation && (
                    <>
                      {isReservation && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isUnread) markNotificationAsRead(notif.id);
                            if (onSelectReservation) onSelectReservation(notif.data!.reservationId!, notif.id);
                          }}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold shrink-0 transition ${
                            isActioned
                              ? 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                              : 'bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-950/40'
                          }`}
                          title="Open reservation request"
                        >
                          <span>{isActioned ? 'View' : (isAdmin || isStaff) ? 'Accept / Review' : 'View Booking'}</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {notif.data?.matchId && !isReservation && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onSelectMatch) onSelectMatch(notif.data!.matchId!);
                          }}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-400 text-xs shrink-0"
                          title="View Match"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {isTournamentInvite && !isReservation && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onSelectTournamentInvite) {
                              onSelectTournamentInvite({
                                invitationId: notif.data?.invitationId,
                                teamId: notif.data?.teamId,
                                tournamentId: notif.data?.tournamentId,
                              });
                            }
                          }}
                          className="p-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-xs shrink-0 border border-amber-500/30"
                          title="View Tournament Invitation"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </>
                  )}
                </div>

                {/* Match / Challenge Action Bar */}
                {isMatchInvitation && (
                  <div className="pt-2.5 mt-1 border-t border-slate-800/80 flex items-center justify-between flex-wrap gap-2">
                    <div className="text-[11px] font-mono text-slate-300 flex items-center gap-1.5 flex-wrap">
                      {isChessInvitation ? (
                        <>
                          <span className="text-sm">♟️</span>
                          <span className="text-slate-400">Game: </span>
                          <strong className="text-white font-bold">Chess (1v1)</strong>
                          <span className="text-slate-500 mx-1">•</span>
                          <span className="text-slate-400">Station: </span>
                          <strong className="text-cyan-400">{notif.data?.station || linkedMatch?.station || 'CHESS-01'}</strong>
                          <span className="text-slate-500 mx-1">•</span>
                          <span className="text-slate-400">Invited by: </span>
                          <strong className="text-cyan-300">{matchInviter}</strong>
                        </>
                      ) : (
                        <>
                          <span className="text-slate-400">Match: </span>
                          <strong className="text-white font-bold">{matchTeamName} {matchTeamTag}</strong>
                          <span className="text-slate-500 mx-1.5">•</span>
                          <span className="text-slate-400">Game: </span>
                          <strong className="text-cyan-400">{matchGame}</strong>
                          <span className="text-slate-500 mx-1.5">•</span>
                          <span className="text-slate-400">Invited by: </span>
                          <strong className="text-cyan-300">{matchInviter}</strong>
                        </>
                      )}
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Live second-by-second countdown */}
                      {reconciled?.isActionable && matchInviteId && (
                        <InvitationCountdownBadge
                          expiresAt={notif.expiresAt || notif.data?.expiresAt || linkedInvite?.expiresAt}
                          createdAt={notif.createdAt || linkedInvite?.createdAt}
                          size="xs"
                        />
                      )}

                      {/* Action buttons shown ONLY if reconciled state is actionable */}
                      {reconciled?.isActionable && matchInviteId && (
                        <>
                          <button
                            type="button"
                            disabled={submittingInviteId === matchInviteId}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleInvitationResponse(matchInviteId, 'declined', matchTeamName);
                            }}
                            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono font-bold transition-colors disabled:opacity-50"
                          >
                            Decline
                          </button>
                          <button
                            type="button"
                            disabled={submittingInviteId === matchInviteId}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleInvitationResponse(matchInviteId, 'accepted', matchTeamName);
                            }}
                            className="px-3.5 py-1.5 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-black text-xs font-mono font-bold uppercase transition-all shadow-md flex items-center gap-1 disabled:opacity-50"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Accept</span>
                          </button>
                        </>
                      )}

                      {/* If non-actionable, show clear label */}
                      {!reconciled?.isActionable && reconciled?.disabledReason && (
                        <span className="text-[11px] font-mono text-slate-500 italic px-2">
                          {reconciled.disabledReason}
                        </span>
                      )}

                      {/* Always allow viewing the lobby / match room */}
                      {matchLobbyId && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isUnread) markNotificationAsRead(notif.id);
                            if (onSelectMatchInvite) {
                              onSelectMatchInvite({ invitationId: matchInviteId, lobbyId: matchLobbyId, teamId: matchTeamId });
                            } else if (onSelectMatch) {
                              onSelectMatch(matchLobbyId, matchInviteId);
                            }
                          }}
                          className="px-3 py-1.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 text-xs font-mono font-bold flex items-center gap-1.5 transition-all"
                        >
                          {isChessInvitation ? <span className="text-xs">♟️</span> : <Gamepad2 className="w-3.5 h-3.5" />}
                          <span>VIEW INVITATION</span>
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                )}
                {/* Role / Leadership Invitation Action Bar */}
                {isRoleInvitation && (
                  <div className="pt-2.5 mt-1 border-t border-purple-500/20 flex items-center justify-between flex-wrap gap-2">
                    <div className="text-[11px] font-mono text-slate-300">
                      Position: <strong className="text-purple-300">{notif.data?.invitedRole || 'Staff Member'}</strong>
                      <span className="text-slate-500 mx-1.5">•</span>
                      Invited by: <strong className="text-white">{notif.data?.invitedByName || 'Administrator'}</strong>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedRoleInvitation({
                          invitationId: notif.data?.invitationId || notif.data?.roleInvitationId || notif.id,
                          invitedRole: notif.data?.invitedRole || 'STAFF',
                          recipientEmail: notif.data?.recipientEmail || user?.email || '',
                          invitedByName: notif.data?.invitedByName || 'Administrator',
                          invitedByUid: notif.data?.invitedByUid || '',
                          invitedByEmail: notif.data?.invitedByEmail || '',
                          status: 'PENDING',
                          createdAt: notif.createdAt,
                          expiresAt: notif.expiresAt || notif.data?.expiresAt || Date.now() + 7 * 24 * 60 * 60 * 1000,
                          note: notif.data?.note || '',
                        });
                      }}
                      className="px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-mono font-bold uppercase transition shadow-md shadow-purple-950/40 flex items-center gap-1.5 cursor-pointer"
                    >
                      <ShieldAlert className="w-3.5 h-3.5" />
                      <span>Review & Accept</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Role Acceptance Modal */}
      <AcceptRoleInvitationModal
        invitation={selectedRoleInvitation}
        isOpen={!!selectedRoleInvitation}
        onClose={() => setSelectedRoleInvitation(null)}
      />
    </div>
  );
};

function getNotificationIcon(type: AppNotification['type']) {
  switch (type) {
    case 'ROLE_INVITATION':
      return <ShieldAlert className="w-5 h-5 text-purple-400" />;
    case 'ROLE_GRANTED':
      return <CheckCircle2 className="w-5 h-5 text-emerald-400" />;
    case 'ROLE_REVOKED':
      return <AlertTriangle className="w-5 h-5 text-rose-400" />;
    case 'CHESS_MATCH_INVITATION':
      return <span className="text-xl leading-none">♟️</span>;
    case 'CHESS_MATCH_INVITATION_ACCEPTED':
      return <CheckCircle2 className="w-5 h-5 text-emerald-400" />;
    case 'CHESS_MATCH_INVITATION_DECLINED':
      return <X className="w-5 h-5 text-rose-400" />;
    case 'CHESS_MATCH_INVITATION_CANCELLED':
      return <AlertTriangle className="w-5 h-5 text-amber-400" />;
    case 'MATCH_INVITATION':
      return <Gamepad2 className="w-5 h-5 text-cyan-400" />;
    case 'MATCH_INVITATION_ACCEPTED':
      return <CheckCircle2 className="w-5 h-5 text-emerald-400" />;
    case 'MATCH_INVITATION_DECLINED':
      return <X className="w-5 h-5 text-rose-400" />;
    case 'MATCH_INVITATION_CANCELLED':
      return <AlertTriangle className="w-5 h-5 text-amber-400" />;
    case 'TEAM_TOURNAMENT_INVITATION':
    case 'TOURNAMENT_TEAM_INVITE':
      return <Trophy className="w-5 h-5 text-amber-400" />;
    case 'TOURNAMENT_TEAM_INVITE_ACCEPTED':
      return <CheckCircle2 className="w-5 h-5 text-emerald-400" />;
    case 'TOURNAMENT_TEAM_INVITE_DECLINED':
      return <X className="w-5 h-5 text-rose-400" />;
    case 'TOURNAMENT_TEAM_READY':
      return <Flame className="w-5 h-5 text-cyan-400 fill-cyan-400" />;
    case 'MATCH_APPROVED':
      return <CheckCircle2 className="w-5 h-5 text-emerald-400" />;
    case 'MATCH_REJECTED':
      return <AlertTriangle className="w-5 h-5 text-rose-400" />;
    case 'MATCH_STARTED':
      return <Swords className="w-5 h-5 text-cyan-400" />;
    case 'MATCH_DISPUTED':
      return <AlertTriangle className="w-5 h-5 text-amber-400" />;
    case 'MATCH_CONFIRMED':
      return <Trophy className="w-5 h-5 text-yellow-400" />;
    case 'TEAM_INVITE':
      return <Shield className="w-5 h-5 text-cyan-400" />;
    case 'WIN_STREAK_MILESTONE':
      return <Flame className="w-5 h-5 text-orange-400 fill-orange-400" />;
    case 'RESERVATION_PENDING':
      return <Clock className="w-5 h-5 text-amber-400" />;
    case 'RESERVATION_CONFIRMED':
      return <CheckCircle2 className="w-5 h-5 text-emerald-400" />;
    case 'RESERVATION_REJECTED':
      return <AlertTriangle className="w-5 h-5 text-red-400" />;
    case 'RESERVATION_CANCELLED':
      return <X className="w-5 h-5 text-slate-400" />;
    case 'RESERVATION_REMINDER':
      return <Calendar className="w-5 h-5 text-cyan-400" />;
    default:
      return <Bell className="w-5 h-5 text-cyan-400" />;
  }
}

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
