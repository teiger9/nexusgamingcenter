import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { LobbyRecruitment, Match } from '../types';
import {
  subscribeToActiveRecruitments,
  joinTeamRecruitment,
  cancelTeamRecruitment,
} from '../services/recruitmentService';
import {
  subscribeToOpen5v5Lobbies,
  calculate5v5LobbyState,
  requestToJoin5v5Team,
  cancelMatch,
  remove5v5Lobby,
  subscribeToPlayerMatches,
} from '../services/matchService';
import { usePlayerProfiles, resolvePlayerIdentity } from '../services/playerResolver';
import { Join5v5LobbyModal } from './Join5v5LobbyModal';
import { RemoveLobbyModal } from './RemoveLobbyModal';
import { useToast } from './Toast';
import {
  Radio,
  Users,
  Swords,
  Crown,
  Zap,
  ArrowRight,
  Shield,
  Clock,
  CheckCircle2,
  AlertCircle,
  Play,
  Eye,
  PlusCircle,
  Trash2,
} from 'lucide-react';

interface LobbyRecruitmentFeedProps {
  onSelectMatch: (matchId: string) => void;
  onSelectTeam?: (teamId: string) => void;
  onOpenAuth?: (mode?: 'login' | 'register') => void;
  onOpenCreate5v5Lobby?: () => void;
  compact?: boolean;
  filterGameId?: string;
}

export const LobbyRecruitmentFeed: React.FC<LobbyRecruitmentFeedProps> = ({
  onSelectMatch,
  onSelectTeam,
  onOpenAuth,
  onOpenCreate5v5Lobby,
  compact = false,
  filterGameId,
}) => {
  const { user, playerProfile, isAdmin } = useAuth();
  const { showToast } = useToast();

  const [openMatches, setOpenMatches] = useState<Match[]>([]);
  const [recruitments, setRecruitments] = useState<LobbyRecruitment[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionPendingId, setActionPendingId] = useState<string | null>(null);
  const [selectedGame, setSelectedGame] = useState<string>(filterGameId || 'ALL');
  const [joinModalLobbyCode, setJoinModalLobbyCode] = useState<string | null>(null);
  const [userActive5v5Match, setUserActive5v5Match] = useState<Match | null>(null);
  const [lobbyToRemove, setLobbyToRemove] = useState<Match | null>(null);
  const [isRemovingLobby, setIsRemovingLobby] = useState(false);

  // Subscribe to logged-in user's active 5v5 matches (READY_CHECK, TEAM_ROSTERS_FILLING, LIVE)
  useEffect(() => {
    if (!user) {
      setUserActive5v5Match(null);
      return;
    }
    const unsub = subscribeToPlayerMatches(user.uid, (matches) => {
      const active5v5 = matches.find(
        (m) =>
          ((m.matchType || '').toLowerCase() === '5v5' || !!m.lobbyCode) &&
          (m.status === 'READY_CHECK' ||
            m.status === 'TEAM_ROSTERS_FILLING' ||
            m.status === 'LIVE' ||
            m.status === 'WAITING_FOR_ADMIN' ||
            m.status === 'APPROVED' ||
            m.status === 'PENDING')
      );
      setUserActive5v5Match(active5v5 || null);
    });
    return () => unsub();
  }, [user]);

  // 1. Subscribe to real active 5v5 lobbies in Firestore (Status: WAITING_FOR_OPPONENT, OPPONENT_JOINED, TEAM_ROSTERS_FILLING)
  // Automatically calculates open opposing side / empty slots and updates in real-time
  useEffect(() => {
    const unsubMatches = subscribeToOpen5v5Lobbies(
      selectedGame === 'ALL' ? undefined : selectedGame,
      (matches) => {
        setOpenMatches(matches);
        setLoading(false);
      }
    );

    const unsubRecruitments = subscribeToActiveRecruitments((recData) => {
      setRecruitments(recData);
    });

    return () => {
      unsubMatches();
      unsubRecruitments();
    };
  }, [selectedGame]);

  // 2. Gather all player UIDs across all active matches and recruitments to resolve profiles
  // Single source of truth: user/player profile in Firestore (Section 15 & 16)
  const allPlayerUids = useMemo(() => {
    const uids = new Set<string>();

    openMatches.forEach((m) => {
      (m.teamAPlayerIds || []).forEach((id) => id && uids.add(id));
      (m.teamBPlayerIds || []).forEach((id) => id && uids.add(id));
      if (m.captainAId) uids.add(m.captainAId);
      if (m.captainBId) uids.add(m.captainBId);
      if (m.createdBy) uids.add(m.createdBy);
    });

    recruitments.forEach((r) => {
      (r.playerIds || []).forEach((id) => id && uids.add(id));
      if (r.captainId) uids.add(r.captainId);
    });

    return Array.from(uids);
  }, [openMatches, recruitments]);

  const { profiles } = usePlayerProfiles(allPlayerUids);

  // Filter matches by game
  const filteredMatches = useMemo(() => {
    let list = openMatches;
    if (selectedGame !== 'ALL') {
      list = list.filter(
        (m) => (m.gameId || '').toLowerCase() === selectedGame.toLowerCase()
      );
    }
    return list;
  }, [openMatches, selectedGame]);

  // Filter standalone recruitments so we don't display duplicates if a match card already exists for that team
  const standaloneRecruitments = useMemo(() => {
    const matchLobbyIds = new Set(filteredMatches.map((m) => m.id));
    const activeTeamKeys = new Set(
      filteredMatches.map((m) => (m.teamAId || m.teamAName || '').trim().toLowerCase())
    );
    const seenRecruitTeams = new Set<string>();

    return recruitments.filter((r) => {
      if (r.status !== 'ACTIVE') return false;
      if (selectedGame !== 'ALL' && r.gameId !== selectedGame) return false;
      // Match-linked recruitments are represented in the 5v5 Match Lobbies section;
      // Standalone recruitments are strictly for teams recruiting outside an active match.
      if (r.lobbyId) return false;

      const teamKey = (r.teamId || r.teamName || '').trim().toLowerCase();
      // If team already has an active 5v5 lobby, do not show duplicate card
      if (teamKey && activeTeamKeys.has(teamKey)) return false;
      if (teamKey && seenRecruitTeams.has(teamKey)) return false;
      if (teamKey) seenRecruitTeams.add(teamKey);

      const needed = r.playersNeeded ?? Math.max(0, 5 - (r.currentActivePlayers || (r.playerIds?.length || 1)));
      return needed > 0;
    });
  }, [recruitments, filteredMatches, selectedGame]);

  const totalActiveCount = filteredMatches.length + standaloneRecruitments.length;

  // Handle outside player requesting to join Team A or Team B
  const handleRequestJoinTeam = async (matchId: string, teamSide: 'teamA' | 'teamB', teamName: string) => {
    if (!user) {
      if (onOpenAuth) onOpenAuth('login');
      else showToast('info', 'Sign in Required', 'Please sign in to request joining a 5v5 team.');
      return;
    }

    setActionPendingId(`${matchId}_${teamSide}`);
    try {
      const res = await requestToJoin5v5Team({
        matchId,
        playerId: user.uid,
        teamSide,
      });

      if (res.success) {
        showToast(
          'success',
          'Join Request Submitted 🚀',
          `Your request to join ${teamName} (${teamSide === 'teamA' ? 'Team A' : 'Team B'}) was sent to the captain.`
        );
      } else {
        showToast('error', 'Could Not Join', res.error || 'Failed to submit join request.');
      }
    } catch (err: any) {
      showToast('error', 'Request Error', err.message || 'Error requesting to join team.');
    } finally {
      setActionPendingId(null);
    }
  };

  // Handle joining standalone recruitment
  const handleJoinStandaloneRecruitment = async (rec: LobbyRecruitment) => {
    if (!user || !playerProfile) {
      if (onOpenAuth) onOpenAuth('login');
      else showToast('info', 'Sign in Required', 'Please sign in to join a squad.');
      return;
    }

    setActionPendingId(rec.id);
    try {
      const res = await joinTeamRecruitment({
        recruitmentId: rec.id,
        player: playerProfile,
      });

      if (res.success) {
        showToast('success', 'Joined Squad!', `Successfully joined ${rec.teamName} [${rec.teamTag}].`);
        if (onSelectTeam) onSelectTeam(rec.teamId);
      } else {
        showToast('error', 'Could Not Join', res.error || 'Failed to join squad.');
      }
    } catch (err: any) {
      showToast('error', 'Join Error', err.message || 'Error joining squad.');
    } finally {
      setActionPendingId(null);
    }
  };

  // Handle cancelling recruitment announcement
  const handleCancelAnnouncement = async (rec: LobbyRecruitment) => {
    if (!user) return;
    try {
      const res = await cancelTeamRecruitment(rec.id, user.uid);
      if (res.success) {
        showToast('info', 'Announcement Cancelled', 'Your recruitment announcement was removed.');
      } else {
        showToast('error', 'Error', res.error || 'Failed to cancel announcement.');
      }
    } catch (err: any) {
      showToast('error', 'Error', err.message);
    }
  };

  // Handle captain confirming removal of a 5v5 lobby
  const handleConfirmRemoveLobby = async () => {
    if (!lobbyToRemove || !user) return;
    setIsRemovingLobby(true);
    try {
      const res = await remove5v5Lobby({
        matchId: lobbyToRemove.id,
        reason: 'Captain removed 5v5 lobby.',
      });
      if (res.success) {
        showToast('info', 'Lobby Removed', `Lobby ${lobbyToRemove.lobbyCode || lobbyToRemove.id} has been closed.`);
        setLobbyToRemove(null);
      } else {
        showToast('error', 'Removal Failed', res.error || 'Failed to remove lobby.');
      }
    } catch (err: any) {
      showToast('error', 'Error', err.message);
    } finally {
      setIsRemovingLobby(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-3xl bg-[#0a0a0f] border border-slate-800 p-8 text-center space-y-3">
        <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-xs text-slate-400 font-mono">Loading Arena Open 5v5 Lobbies...</p>
      </div>
    );
  }

  return (
    <div className="rounded-3xl bg-[#0a0a0f] border border-slate-800/90 overflow-hidden shadow-2xl">
      {/* Modal for Joining as Opposing Captain or with Squad */}
      {joinModalLobbyCode && (
        <Join5v5LobbyModal
          isOpen={!!joinModalLobbyCode}
          onClose={() => setJoinModalLobbyCode(null)}
          initialLobbyCode={joinModalLobbyCode}
          onLobbyJoined={(m) => {
            setJoinModalLobbyCode(null);
            onSelectMatch(m.id);
          }}
        />
      )}

      {/* Arena Feed Header */}
      <div className="p-5 sm:p-6 border-b border-slate-800/80 bg-gradient-to-r from-cyan-950/30 via-[#0a0a0f] to-amber-950/20">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0 shadow-[0_0_15px_rgba(245,158,11,0.25)]">
              <Swords className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-black font-display text-white tracking-tight">
                  5v5 TEAM LOBBIES
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-400 font-mono text-[10px] font-black uppercase tracking-wider animate-pulse flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                  LIVE ARENA DISPATCH
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Active 5v5 team lobbies for CS2 and VALORANT. All active matches including full squads and open lobbies.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Game filter pills */}
            <div className="flex items-center gap-1 bg-[#121218] p-1 rounded-xl border border-slate-800 text-xs font-mono">
              <button
                onClick={() => setSelectedGame('ALL')}
                className={`px-3 py-1 rounded-lg transition-colors ${
                  selectedGame === 'ALL'
                    ? 'bg-cyan-500/20 text-cyan-400 font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                ALL ({totalActiveCount})
              </button>
              <button
                onClick={() => setSelectedGame('valorant')}
                className={`px-3 py-1 rounded-lg transition-colors ${
                  selectedGame === 'valorant'
                    ? 'bg-rose-500/20 text-rose-400 font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                VALORANT
              </button>
              <button
                onClick={() => setSelectedGame('cs2')}
                className={`px-3 py-1 rounded-lg transition-colors ${
                  selectedGame === 'cs2'
                    ? 'bg-cyan-500/20 text-cyan-400 font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                CS2
              </button>
            </div>

            {onOpenCreate5v5Lobby && (
              <button
                onClick={onOpenCreate5v5Lobby}
                className="hidden sm:flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-black font-mono text-xs font-black transition-all shadow-md uppercase tracking-wider shrink-0 active:scale-95"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>Create 5v5 Lobby</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Announcements & Open Lobbies List */}
      <div className="p-4 sm:p-6 space-y-4">
        {/* Pinned User Active 5v5 Match Banner */}
        {userActive5v5Match && (
          <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-emerald-950/60 via-slate-900 to-cyan-950/60 border border-emerald-500/40 relative overflow-hidden shadow-[0_0_30px_rgba(16,185,129,0.15)] mb-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
                  <Swords className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-emerald-400 text-black text-[10px] font-mono font-black uppercase tracking-wider">
                      {userActive5v5Match.status === 'READY_CHECK' ? 'LOBBY READY (10/10 FULL)' : 'YOUR ACTIVE 5V5 MATCH'}
                    </span>
                    <span className="text-xs text-slate-400 font-mono">
                      Station: <strong className="text-white">{userActive5v5Match.station || 'PC Arena'}</strong>
                    </span>
                  </div>
                  <h4 className="text-sm sm:text-base font-bold font-display text-white mt-0.5">
                    <span className="text-emerald-400">{userActive5v5Match.teamAName || 'Team A'}</span> (5/5) vs{' '}
                    <span className="text-cyan-400">{userActive5v5Match.teamBName || 'Team B'}</span> (5/5)
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {userActive5v5Match.status === 'READY_CHECK'
                      ? 'Both sides are full! Enter the match room now to set ready and begin.'
                      : 'Match is currently in progress or waiting in room.'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onSelectMatch(userActive5v5Match.id)}
                className="px-5 py-2.5 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-black font-black text-xs uppercase tracking-wider transition-all shadow-[0_0_20px_rgba(52,211,153,0.3)] flex items-center gap-2 shrink-0 active:scale-95"
              >
                <span>ENTER MATCH ROOM</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {totalActiveCount === 0 ? (
          // SECTION 14: Correct Empty State Message
          <div className="py-14 text-center space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-600 mx-auto">
              <Users className="w-7 h-7" />
            </div>
            <h3 className="text-base font-bold font-display text-white">
              No active 5v5 team lobbies right now.
            </h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              No squad matches are currently active. Create your own 5v5 team lobby or challenge rival squads!
            </p>
            {onOpenCreate5v5Lobby && (
              <div className="pt-2">
                <button
                  onClick={onOpenCreate5v5Lobby}
                  className="px-5 py-2.5 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-black font-mono text-xs font-black uppercase tracking-wider transition-colors shadow-lg flex items-center gap-1.5 mx-auto"
                >
                  <Swords className="w-4 h-4" />
                  <span>Create 5v5 Squad Lobby</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 1. RENDER ACTIVE 5v5 MATCH LOBBIES */}
            {filteredMatches.map((match) => {
              const lobbyState = calculate5v5LobbyState(match);
              const isGameVal = (match.gameId || '').toLowerCase().includes('val');

              // Team A Data
              const teamAPlayerIds = (match.teamAPlayerIds || match.teamAPlayers?.map((p) => p.id) || []).filter(
                (id): id is string => typeof id === 'string' && id.trim().length > 0
              );
              const teamACount = lobbyState.teamACount;
              const isUserInTeamA = !!user && teamAPlayerIds.includes(user.uid);
              const isUserLobbyOwner =
                !!user &&
                (user.uid === match.lobbyOwnerId || user.uid === match.createdBy);
              const isUserCaptainA =
                !!user &&
                (isUserLobbyOwner || user.uid === match.captainAId);

              // Team B Data
              const teamBPlayerIds = (match.teamBPlayerIds || match.teamBPlayers?.map((p) => p.id) || []).filter(
                (id): id is string => typeof id === 'string' && id.trim().length > 0
              );
              const teamBCount = lobbyState.teamBCount;
              const isUserInTeamB = !!user && teamBPlayerIds.includes(user.uid);
              const isUserCaptainB = !!user && user.uid === match.captainBId;

              // Resolve Team A Captain Identity
              const capAId = match.captainAId || match.lobbyOwnerId || match.createdBy || teamAPlayerIds[0];
              const capAProfile = profiles[capAId || ''];
              const capASnapshot = match.teamAPlayers?.find((p) => p.id === capAId);
              const resolvedCaptainA = resolvePlayerIdentity({
                uid: capAId,
                profile: capAProfile,
                snapshot: capASnapshot,
                gameId: match.gameId,
                captainId: capAId,
              });

              // Resolve Team B Captain Identity (if joined)
              const capBId = match.captainBId || teamBPlayerIds[0];
              const capBProfile = profiles[capBId || ''];
              const capBSnapshot = match.teamBPlayers?.find((p) => p.id === capBId);
              const resolvedCaptainB = capBId
                ? resolvePlayerIdentity({
                    uid: capBId,
                    profile: capBProfile,
                    snapshot: capBSnapshot,
                    gameId: match.gameId,
                    captainId: capBId,
                  })
                : null;

              // Action button logic
              const isTeamBEmpty = teamBCount === 0;
              const totalPlayers = teamACount + teamBCount;
              const isFull = lobbyState.isFull || totalPlayers >= 10;
              const openSlots = Math.max(0, 10 - totalPlayers);
              const squadName = match.teamAName || resolvedCaptainA.gamerTag || 'Nexus Squad';
              const isUserInLobby = isUserInTeamA || isUserInTeamB || isUserCaptainA || isUserCaptainB;

              return (
                <div
                  key={match.id}
                  className="p-5 rounded-2xl bg-neutral-950 border border-white/10 hover:border-white/20 transition-all flex flex-col justify-between gap-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="text-[11px] font-mono font-bold uppercase text-red-500 tracking-wider">
                        {match.gameName || (isGameVal ? 'VALORANT' : 'CS2')}
                      </span>
                      <h4 className="text-base font-bold font-display text-white mt-0.5 truncate">
                        {squadName}
                      </h4>
                      <p className="text-xs text-neutral-400 font-mono mt-0.5">
                        Station: {match.station || 'PC Arena'}
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      {isFull ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-red-500">
                          <span className="w-2 h-2 rounded-full bg-red-500" />
                          <span>🔴 FULL</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-emerald-400">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                          <span>🟢 OPEN</span>
                        </span>
                      )}
                      <div className="text-xs font-mono text-neutral-400 mt-1">
                        <strong className="text-white">{totalPlayers}</strong> / 10
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-white/5 flex items-center justify-between gap-2">
                    <span className="text-xs text-neutral-400 font-mono">
                      {isFull ? '0 slots open' : `${openSlots} slots open`}
                    </span>

                    <div className="flex items-center gap-2">
                      {(isUserLobbyOwner || isAdmin) && (
                        <button
                          id={`btn-remove-lobby-${match.lobbyCode || match.id}`}
                          data-testid={`btn-close-lobby-${match.lobbyCode || match.id}`}
                          onClick={() => setLobbyToRemove(match)}
                          className="p-2 rounded-lg bg-neutral-900 hover:bg-red-950 text-neutral-400 hover:text-red-400 transition-colors cursor-pointer"
                          title="Close Lobby"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {isUserInLobby ? (
                        <button
                          onClick={() => onSelectMatch(match.id)}
                          className="px-4 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold text-xs uppercase tracking-wider transition-colors"
                        >
                          Enter Room
                        </button>
                      ) : isFull ? (
                        <button
                          onClick={() => onSelectMatch(match.id)}
                          className="px-4 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-neutral-300 font-bold text-xs uppercase tracking-wider transition-colors"
                        >
                          View
                        </button>
                      ) : isTeamBEmpty ? (
                        <button
                          onClick={() => setJoinModalLobbyCode(match.lobbyCode)}
                          className="px-5 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold text-xs uppercase tracking-wider transition-all shadow-[0_0_12px_rgba(239,68,68,0.3)]"
                        >
                          Join
                        </button>
                      ) : (
                        <button
                          onClick={() => handleRequestJoinTeam(match.id, 'teamB', match.teamBName || 'Team B')}
                          disabled={actionPendingId === `${match.id}_teamB`}
                          className="px-5 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold text-xs uppercase tracking-wider transition-all shadow-[0_0_12px_rgba(239,68,68,0.3)] disabled:opacity-40"
                        >
                          Join
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* 2. RENDER STANDALONE SQUAD RECRUITMENT ANNOUNCEMENTS (if any) */}
            {standaloneRecruitments.map((rec) => {
              const currentPlayers = rec.currentActivePlayers || (rec.playerIds?.length || 1);
              const playersNeeded = rec.playersNeeded ?? Math.max(0, 5 - currentPlayers);
              const isCaptain = user && (rec.captainId === user.uid || rec.playerIds?.[0] === user.uid);
              const isMember = user && rec.playerIds?.includes(user.uid);
              const isGameVal = rec.gameId === 'valorant';

              return (
                <div
                  key={rec.id}
                  className="p-5 rounded-2xl bg-[#121218] border border-slate-800 hover:border-slate-700 transition-all space-y-4 relative group shadow-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2.5 py-0.5 rounded-lg text-[10px] font-mono font-black uppercase tracking-wider border ${
                          isGameVal
                            ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                            : 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'
                        }`}
                      >
                        {rec.gameName || (isGameVal ? 'VALORANT' : 'CS2')}
                      </span>
                      <span className="text-[11px] font-mono text-slate-400">
                        Squad: <strong className="text-white">[{rec.teamTag}]</strong>
                      </span>
                      <span className="text-[10px] font-mono font-bold text-cyan-400 bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-500/30">
                        💻 PCs: {rec.pcCount || 10}
                      </span>
                    </div>

                    <div className="px-3 py-1 rounded-full bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/40 text-amber-300 font-mono font-black text-xs uppercase tracking-wider flex items-center gap-1.5 shadow-[0_0_12px_rgba(245,158,11,0.2)]">
                      <Users className="w-3.5 h-3.5 text-amber-400" />
                      <span>NEED {playersNeeded} PLAYER{playersNeeded > 1 ? 'S' : ''}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-12 h-12 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center text-2xl shrink-0">
                        {rec.teamLogo || '🛡️'}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-black font-display text-white truncate">
                            {rec.teamName}
                          </h3>
                          <span className="px-1.5 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 font-mono font-bold text-[10px]">
                            [{rec.teamTag}]
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-0.5 font-mono">
                          <Crown className="w-3 h-3 text-amber-400" />
                          <span>Captain: <strong className="text-slate-200">{rec.captainGamerTag || rec.captainName}</strong></span>
                        </div>
                      </div>
                    </div>

                    {rec.teamAvgRating && (
                      <div className="text-right font-mono shrink-0">
                        <div className="text-xs font-bold text-cyan-400 font-display">
                          {rec.teamAvgRating} <span className="text-[10px] text-slate-500">MMR</span>
                        </div>
                        <div className="text-[10px] text-slate-500 uppercase">Squad Rating</div>
                      </div>
                    )}
                  </div>

                  {rec.recruitmentMessage && (
                    <div className="p-3 rounded-xl bg-[#0a0a0f] border border-slate-800/80 text-xs text-slate-300 font-mono italic">
                      "{rec.recruitmentMessage}"
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-mono">
                      <span className="text-slate-400">Roster Status:</span>
                      <span className="font-bold text-white">
                        {currentPlayers}/5 Active Players
                      </span>
                    </div>
                    <div className="grid grid-cols-5 gap-1.5">
                      {[0, 1, 2, 3, 4].map((slotIdx) => {
                        const filled = slotIdx < currentPlayers;
                        return (
                          <div
                            key={slotIdx}
                            className={`h-2 rounded-full transition-all ${
                              filled
                                ? 'bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.4)]'
                                : 'bg-slate-800/80 border border-dashed border-slate-700'
                            }`}
                          />
                        );
                      })}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between gap-3">
                    <div className="text-[11px] font-mono text-slate-500 flex items-center gap-1.5">
                      <Clock className="w-3 h-3" />
                      <span>{new Date(rec.updatedAt || rec.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      {isCaptain ? (
                        <button
                          onClick={() => handleCancelAnnouncement(rec)}
                          className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono font-bold transition-colors"
                        >
                          Cancel
                        </button>
                      ) : isMember ? (
                        <span className="px-3 py-1.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-mono font-bold flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>In Squad</span>
                        </span>
                      ) : (
                        <button
                          onClick={() => handleJoinStandaloneRecruitment(rec)}
                          disabled={actionPendingId === rec.id}
                          className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-black font-mono text-xs font-black uppercase tracking-wider transition-all shadow-md flex items-center gap-1.5 active:scale-95 disabled:opacity-50 cursor-pointer"
                        >
                          {actionPendingId === rec.id ? (
                            <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Zap className="w-3.5 h-3.5 fill-black" />
                          )}
                          <span>JOIN SQUAD</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Remove Lobby Confirmation Modal */}
      {lobbyToRemove && (
        <RemoveLobbyModal
          isOpen={!!lobbyToRemove}
          onClose={() => setLobbyToRemove(null)}
          onConfirm={handleConfirmRemoveLobby}
          lobbyCode={lobbyToRemove.lobbyCode}
          gameName={lobbyToRemove.gameName}
          station={lobbyToRemove.station}
          isSubmitting={isRemovingLobby}
        />
      )}
    </div>
  );
};
