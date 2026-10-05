import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Search,
  UserPlus,
  Loader2,
  AlertTriangle,
  Users,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import { User } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { Match, Player, TeamInvitation } from '../types';
import { fetchAllPlayers } from '../services/playerService';
import {
  invitePlayerTo5v5Lobby,
  subscribeToLobbyInvitations,
} from '../services/matchService';
import { normalizeInvitationStatus } from '../utils/tournamentTeamStatus';

interface InvitePlayer5v5ModalProps {
  isOpen: boolean;
  onClose: () => void;
  match: Match;
  teamSide: 'teamA' | 'teamB';
  currentUser?: User | null;
  currentUserId?: string;
  currentProfile?: Player | null;
  canSelectBothTeams?: boolean;
  onInviteSent?: (gamerTag: string) => void;
  onSuccess?: () => void;
}

export const InvitePlayer5v5Modal: React.FC<InvitePlayer5v5ModalProps> = ({
  isOpen,
  onClose,
  match,
  teamSide,
  currentUser,
  currentUserId,
  currentProfile,
  canSelectBothTeams,
  onInviteSent,
  onSuccess,
}) => {
  const [selectedTeamSide, setSelectedTeamSide] = useState<'teamA' | 'teamB'>(teamSide);
  const [searchQuery, setSearchQuery] = useState('');
  const [players, setPlayers] = useState<Player[]>([]);
  const [loadingPlayers, setLoadingPlayers] = useState(true);
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [lobbyInvitations, setLobbyInvitations] = useState<TeamInvitation[]>([]);

  // Securely resolve active authenticated user ID from Firebase session
  const activeUserId = auth.currentUser?.uid || currentUser?.uid || currentUserId || '';

  // Canonical Permissions:
  // Lobby Owner CAN: invite to Team A, invite to Team B.
  // Team A Captain CAN: invite to Team A, invite to Team B.
  // Team B Captain CAN: invite to Team B only.
  // Normal Player CANNOT: invite to either team.
  const isLobbyOwner = Boolean(
    activeUserId && (activeUserId === match.lobbyOwnerId || activeUserId === match.createdBy)
  );

  const teamAPlayerIds = match.teamAPlayerIds || [];
  const teamBPlayerIds = match.teamBPlayerIds || [];

  const isTeamACaptain = Boolean(
    activeUserId &&
      (activeUserId === match.captainAId ||
        activeUserId === match.playerAId ||
        activeUserId === match.createdBy ||
        (teamAPlayerIds.length > 0 && teamAPlayerIds[0] === activeUserId))
  );

  const isTeamBCaptain = Boolean(
    activeUserId &&
      (activeUserId === match.captainBId ||
        activeUserId === match.playerBId)
  );

  const canInviteToTeamA = isLobbyOwner || isTeamACaptain;
  const canInviteToTeamB = isLobbyOwner || isTeamACaptain || isTeamBCaptain;

  // When Lobby Owner or Team A Captain opens: can select Team A or Team B!
  // When Team B Captain opens: ONLY select Team B. Do NOT even show Team A option.
  const canChooseTeam = Boolean((isLobbyOwner || isTeamACaptain) && canSelectBothTeams !== false);

  useEffect(() => {
    if (isLobbyOwner || isTeamACaptain) {
      setSelectedTeamSide(teamSide);
    } else if (isTeamBCaptain) {
      setSelectedTeamSide('teamB');
    }
  }, [teamSide, isOpen, isLobbyOwner, isTeamACaptain, isTeamBCaptain]);

  // 1. Fetch all registered Nexus players
  useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;
    setLoadingPlayers(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    fetchAllPlayers()
      .then((data) => {
        if (isMounted) {
          setPlayers(data);
          setLoadingPlayers(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          console.error('Failed to load Nexus players:', err);
          setErrorMessage('Could not load Nexus players directory.');
          setLoadingPlayers(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  // 2. Real-time subscription to existing lobby invitations
  useEffect(() => {
    if (!isOpen || !match?.id) return;
    const unsub = subscribeToLobbyInvitations(match.id, (invs) => {
      setLobbyInvitations(invs);
    });
    return () => unsub();
  }, [isOpen, match?.id]);

  // Roster checks for the currently selected team side
  const targetTeamPlayerIds = selectedTeamSide === 'teamA' ? teamAPlayerIds : teamBPlayerIds;
  const isTeamFull = targetTeamPlayerIds.length >= 5;

  const targetTeamName = selectedTeamSide === 'teamA' ? (match.teamAName || 'Team A') : (match.teamBName || 'Team B');
  const targetTeamTag = selectedTeamSide === 'teamA' ? (match.teamATag || 'SQD-A') : (match.teamBTag || 'SQD-B');
  const modalTitle = 'INVITE PLAYER TO 5V5 SQUAD';

  // Set of players with pending invitations for the currently selected team
  const pendingInvitedUids = useMemo(() => {
    const set = new Set<string>();
    lobbyInvitations.forEach((inv) => {
      if (
        (inv.teamSide === selectedTeamSide ||
          inv.teamId === (selectedTeamSide === 'teamA' ? match.teamAId : match.teamBId)) &&
        normalizeInvitationStatus(inv.status) === 'PENDING'
      ) {
        const uid = inv.invitedPlayerId || inv.recipientId;
        if (uid) set.add(uid);
      }
    });
    return set;
  }, [lobbyInvitations, selectedTeamSide, match]);

  // Filter eligible players: must be registered, not self, not already in either team
  const filteredPlayers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return players.filter((p) => {
      const pUid = p.uid;
      // Exclude self using authenticated UID
      if (activeUserId && pUid === activeUserId) return false;
      // Exclude if already in Team A or Team B
      if (teamAPlayerIds.includes(pUid) || teamBPlayerIds.includes(pUid)) return false;

      // Filter by query
      if (!q) return true;
      const tagMatch = (p.gamerTag || '').toLowerCase().includes(q);
      const nameMatch = (p.fullName || '').toLowerCase().includes(q);
      const ignMatch =
        (p.inGameNames &&
          Object.values(p.inGameNames).some(
            (v) => typeof v === 'string' && v.toLowerCase().includes(q)
          )) ||
        false;
      return tagMatch || nameMatch || ignMatch;
    });
  }, [players, searchQuery, activeUserId, teamAPlayerIds, teamBPlayerIds]);

  // Invitation action
  const handleSendInvite = async (player: Player) => {
    if (isTeamFull) {
      setErrorMessage('This team is already full (5/5 players).');
      return;
    }

    if (!activeUserId) {
      setErrorMessage('Please sign in to your Nexus account to invite players.');
      return;
    }

    // Permission check
    if (selectedTeamSide === 'teamA' && !canInviteToTeamA) {
      setErrorMessage('PERMISSION DENIED: Only the Lobby Owner or Team A Captain can invite players to Team A.');
      return;
    }
    if (selectedTeamSide === 'teamB' && !canInviteToTeamB) {
      setErrorMessage('PERMISSION DENIED: Only the Lobby Owner, Team A Captain, or Team B Captain can invite players to Team B.');
      return;
    }

    const currentUid = (auth.currentUser?.uid || currentUser?.uid || activeUserId || '').trim();
    if (player.uid === currentUid) {
      setErrorMessage('You cannot select yourself as an opponent or invite yourself.');
      return;
    }

    setInvitingId(player.uid);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await invitePlayerTo5v5Lobby({
        matchId: match.id,
        inviterId: activeUserId,
        recipientPlayerId: player.uid,
        teamSide: selectedTeamSide,
      });

      if (res.success) {
        setSuccessMessage(
          `Invitation sent to ${player.gamerTag} for ${selectedTeamSide === 'teamA' ? 'Team A' : 'Team B'}!`
        );
        if (onInviteSent) onInviteSent(player.gamerTag);
        if (onSuccess) onSuccess();
      } else {
        setErrorMessage(res.error || 'Failed to send invitation.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'An unexpected error occurred while inviting.');
    } finally {
      setInvitingId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      id="invite-player-5v5-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div
        id="invite-player-5v5-modal-content"
        className="w-full max-w-lg bg-[#0f0f14] border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4 relative max-h-[90vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-2xl flex items-center justify-center border ${
                selectedTeamSide === 'teamA'
                  ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
              }`}
            >
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black font-display text-white">{modalTitle}</h2>
              <p className="text-xs text-slate-400 font-mono mt-0.5 flex items-center gap-1.5">
                <span>Active Target:</span>
                <strong className="text-slate-200">{targetTeamName}</strong>
                <span className={selectedTeamSide === 'teamA' ? 'text-cyan-400' : 'text-rose-400'}>
                  [{targetTeamTag}]
                </span>
                <span>•</span>
                <span className={isTeamFull ? 'text-rose-400 font-bold' : 'text-emerald-400 font-bold'}>
                  {targetTeamPlayerIds.length}/5 Slots Filled
                </span>
              </p>
            </div>
          </div>
          <button
            id="close-invite-modal-btn"
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Team Selection: Team A or Team B (Available to Team A Captain / Lobby Owner) */}
        {canChooseTeam && (
          <div className="space-y-1.5 shrink-0">
            <div className="text-[11px] font-mono text-slate-400 font-bold uppercase tracking-wider flex items-center justify-between">
              <span>Select Destination Team:</span>
              <span className="text-[10px] text-cyan-400">Team A Captain Global Recruitment</span>
            </div>
            <div className="grid grid-cols-2 gap-2 p-1.5 bg-slate-900/90 rounded-2xl border border-slate-800">
              <button
                id="team-selector-teama-btn"
                type="button"
                onClick={() => setSelectedTeamSide('teamA')}
                className={`py-2 px-3 rounded-xl font-mono text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                  selectedTeamSide === 'teamA'
                    ? 'bg-cyan-500 text-black shadow-lg shadow-cyan-500/20 font-black'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
                }`}
              >
                <span>[ TEAM A ]</span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded ${
                    selectedTeamSide === 'teamA' ? 'bg-black/20 text-black' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {teamAPlayerIds.length}/5
                </span>
              </button>
              <button
                id="team-selector-teamb-btn"
                type="button"
                onClick={() => setSelectedTeamSide('teamB')}
                className={`py-2 px-3 rounded-xl font-mono text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                  selectedTeamSide === 'teamB'
                    ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/20 font-black'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
                }`}
              >
                <span>[ TEAM B ]</span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded ${
                    selectedTeamSide === 'teamB' ? 'bg-black/20 text-white' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {teamBPlayerIds.length}/5
                </span>
              </button>
            </div>
          </div>
        )}

        {/* Team Full Alert */}
        {isTeamFull && (
          <div className="p-3 rounded-2xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs font-mono flex items-center gap-2 shrink-0">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>
              TEAM FULL: {selectedTeamSide === 'teamA' ? 'Team A' : 'Team B'} already has all 5 player slots occupied.
            </span>
          </div>
        )}

        {/* Status Feedback Messages */}
        {errorMessage && (
          <div className="p-3 rounded-2xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs font-mono flex items-center gap-2 shrink-0">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div className="p-3 rounded-2xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-xs font-mono flex items-center gap-2 shrink-0">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Search Input */}
        <div className="relative shrink-0">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            id="nexus-player-search-input"
            type="text"
            placeholder="Search registered Nexus players by GamerTag..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            disabled={isTeamFull}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 text-sm font-sans disabled:opacity-50"
          />
        </div>

        {/* Eligible Players List */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[200px]">
          {loadingPlayers ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400 space-y-2">
              <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
              <p className="text-xs font-mono">Loading registered Nexus players...</p>
            </div>
          ) : filteredPlayers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400 text-center px-4">
              <Users className="w-8 h-8 text-slate-600 mb-2" />
              <p className="text-sm font-semibold text-slate-300">No eligible Nexus players found</p>
              <p className="text-xs text-slate-500 mt-1 max-w-xs font-mono">
                {searchQuery
                  ? `No available registered players match "${searchQuery}".`
                  : 'All registered players are either already in this lobby or unavailable.'}
              </p>
            </div>
          ) : (
            filteredPlayers.map((player) => {
              const isInvited = pendingInvitedUids.has(player.uid);
              const isInvitingThis = invitingId === player.uid;

              return (
                <div
                  key={player.uid}
                  id={`invite-row-${player.uid}`}
                  className="p-3 rounded-2xl bg-slate-900/60 border border-slate-800/90 flex items-center justify-between hover:border-slate-700 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-white font-bold text-xs shrink-0">
                      {player.gamerTag ? player.gamerTag.substring(0, 2).toUpperCase() : 'NX'}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-white truncate">{player.gamerTag}</span>
                        {player.role === 'admin' && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-red-500/20 text-red-300 border border-red-500/30 font-mono">
                            STAFF
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] font-mono text-slate-400 mt-0.5 flex items-center gap-2">
                        <span>
                          MMR: <strong className="text-cyan-400">{player.overallRating || 1000}</strong>
                        </span>
                        {player.fullName && player.fullName !== player.gamerTag && (
                          <span className="truncate text-slate-500">({player.fullName})</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    {isTeamFull ? (
                      <span className="px-3 py-1.5 rounded-xl bg-slate-800/80 text-slate-500 font-mono text-xs font-bold uppercase cursor-not-allowed">
                        TEAM FULL
                      </span>
                    ) : (
                      <>
                        {/* Send Invitation Button */}
                        {isInvited ? (
                          <span className="px-2.5 py-1.5 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono text-[10px] font-bold uppercase flex items-center gap-1">
                            <Clock className="w-3 h-3 animate-spin" />
                            <span>Invited</span>
                          </span>
                        ) : (
                          <button
                            id={`btn-invite-${player.uid}`}
                            type="button"
                            onClick={() => handleSendInvite(player)}
                            disabled={isInvitingThis || Boolean(invitingId)}
                            className="px-3 py-1.5 rounded-xl font-mono text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1 bg-cyan-500 hover:bg-cyan-400 text-black shadow-md disabled:opacity-50"
                            title={`Send invitation to ${player.gamerTag}`}
                          >
                            {isInvitingThis ? (
                              <>
                                <Loader2 className="w-3 h-3 animate-spin" />
                                <span>Sending...</span>
                              </>
                            ) : (
                              <>
                                <UserPlus className="w-3.5 h-3.5" />
                                <span>Invite</span>
                              </>
                            )}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer info */}
        <div className="pt-3 border-t border-slate-800 text-[11px] font-mono text-slate-500 flex items-center justify-between shrink-0">
          <span>Registered Nexus accounts directory.</span>
          <span>Click "Invite" to send an official invitation.</span>
        </div>
      </div>
    </div>
  );
};
