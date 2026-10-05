import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Team, Match } from '../types';
import { subscribeToTeams, subscribeToPlayerTeams, leaveTeam, transferCaptaincy, disbandTeam } from '../services/teamService';
import {
  subscribeToOpen5v5Lobbies,
  subscribeToAll5v5Matches,
  calculate5v5LobbyState,
} from '../services/matchService';
import { TeamProfileModal } from './TeamProfileModal';
import { CreateTeamModal } from './CreateTeamModal';
import { Create5v5LobbyModal } from './Create5v5LobbyModal';
import { Join5v5LobbyModal } from './Join5v5LobbyModal';
import { LobbyRecruitmentFeed } from './LobbyRecruitmentFeed';
import { useToast } from './Toast';
import {
  Users,
  Shield,
  Swords,
  Crown,
  Trophy,
  Flame,
  Plus,
  Play,
  KeyRound,
  Search,
  ExternalLink,
  ChevronRight,
  Sparkles,
  LogOut,
} from 'lucide-react';

interface TeamsHubViewProps {
  onSelectMatch: (matchId: string) => void;
  onSelectPlayerProfile?: (playerId: string) => void;
  onOpenAuth?: () => void;
}

export const TeamsHubView: React.FC<TeamsHubViewProps> = ({
  onSelectMatch,
  onSelectPlayerProfile,
  onOpenAuth,
}) => {
  const { user, playerProfile } = useAuth();

  const [activeTab, setActiveTab] = useState<'my_teams' | 'lobbies' | 'leaderboard' | 'directory'>('my_teams');
  const [gameFilter, setGameFilter] = useState<'ALL' | 'valorant' | 'cs2' | 'lol'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Data states
  const [myTeams, setMyTeams] = useState<Team[]>([]);
  const [loadingMyTeams, setLoadingMyTeams] = useState<boolean>(true);
  const [allTeams, setAllTeams] = useState<Team[]>([]);
  const [openLobbies, setOpenLobbies] = useState<Match[]>([]);
  const [all5v5Matches, setAll5v5Matches] = useState<Match[]>([]);

  // Modals
  const [selectedTeamIdForProfile, setSelectedTeamIdForProfile] = useState<string | null>(null);
  const [isCreateTeamOpen, setIsCreateTeamOpen] = useState(false);
  const [isCreateLobbyOpen, setIsCreateLobbyOpen] = useState(false);
  const [isJoinLobbyOpen, setIsJoinLobbyOpen] = useState(false);
  const [preselectedTeamForLobby, setPreselectedTeamForLobby] = useState<Team | null>(null);
  const [prefilledJoinCode, setPrefilledJoinCode] = useState<string>('');

  const { showToast } = useToast();

  // Leave squad flow
  const [teamToLeave, setTeamToLeave] = useState<Team | null>(null);
  const [showLeaveSquadModal, setShowLeaveSquadModal] = useState(false);
  const [showCaptainLeaveModal, setShowCaptainLeaveModal] = useState(false);
  const [selectedNewCaptainId, setSelectedNewCaptainId] = useState('');
  const [leaveActionLoading, setLeaveActionLoading] = useState(false);

  const handleInitiateLeave = (team: Team) => {
    if (!user) return;
    setTeamToLeave(team);
    const isCap = team.captainId === user.uid;
    if (isCap) {
      const otherMembers = (team.members || []).filter((m) => m.id !== user.uid);
      if (otherMembers.length > 0) {
        setSelectedNewCaptainId(otherMembers[0].id);
      }
      setShowCaptainLeaveModal(true);
    } else {
      setShowLeaveSquadModal(true);
    }
  };

  const handleConfirmLeaveSquad = async () => {
    if (!teamToLeave || !user) return;
    setLeaveActionLoading(true);
    try {
      const res = await leaveTeam({
        teamId: teamToLeave.teamId,
        playerId: user.uid,
      });

      if (res.success) {
        showToast('info', 'Left Squad', 'YOU LEFT THE SQUAD.');
        const leftId = teamToLeave.teamId;
        setMyTeams((prev) => prev.filter((t) => t.teamId !== leftId));
        setShowLeaveSquadModal(false);
        setTeamToLeave(null);
      } else {
        showToast('error', 'Could not leave squad', res.error);
      }
    } catch (err: any) {
      showToast('error', 'Error', err.message);
    } finally {
      setLeaveActionLoading(false);
    }
  };

  const handleCaptainTransferAndLeave = async () => {
    if (!teamToLeave || !user || !selectedNewCaptainId) {
      showToast('error', 'Selection Required', 'Please select a squad member to become the new Captain.');
      return;
    }
    setLeaveActionLoading(true);
    try {
      const transRes = await transferCaptaincy({
        teamId: teamToLeave.teamId,
        captainId: user.uid,
        newCaptainId: selectedNewCaptainId,
      });

      if (!transRes.success) {
        showToast('error', 'Transfer Failed', transRes.error || 'Failed to transfer captaincy.');
        setLeaveActionLoading(false);
        return;
      }

      const leaveRes = await leaveTeam({
        teamId: teamToLeave.teamId,
        playerId: user.uid,
      });

      if (leaveRes.success) {
        showToast('info', 'Left Squad', 'YOU LEFT THE SQUAD.');
        const leftId = teamToLeave.teamId;
        setMyTeams((prev) => prev.filter((t) => t.teamId !== leftId));
        setShowCaptainLeaveModal(false);
        setTeamToLeave(null);
      } else {
        showToast('error', 'Error leaving squad', leaveRes.error);
      }
    } catch (err: any) {
      showToast('error', 'Error', err.message);
    } finally {
      setLeaveActionLoading(false);
    }
  };

  const handleSoleCaptainDisband = async () => {
    if (!teamToLeave || !user) return;
    setLeaveActionLoading(true);
    try {
      const res = await disbandTeam({
        teamId: teamToLeave.teamId,
        captainId: user.uid,
      });
      if (res.success) {
        showToast('info', 'Squad Disbanded', `${teamToLeave.teamName} has been disbanded.`);
        const leftId = teamToLeave.teamId;
        setMyTeams((prev) => prev.filter((t) => t.teamId !== leftId));
        setShowCaptainLeaveModal(false);
        setTeamToLeave(null);
      } else {
        showToast('error', 'Could not disband squad', res.error);
      }
    } catch (err: any) {
      showToast('error', 'Error', err.message);
    } finally {
      setLeaveActionLoading(false);
    }
  };

  // Subscriptions
  useEffect(() => {
    if (!user) {
      setMyTeams([]);
      setLoadingMyTeams(false);
      return;
    }
    setLoadingMyTeams(true);
    const unsubMyTeams = subscribeToPlayerTeams(user.uid, (teams) => {
      // Canonical UI safeguard: only retain squads where player is an active member
      const activeOnly = teams.filter(
        (t) =>
          t.status !== 'disbanded' &&
          Array.isArray(t.memberIds) &&
          t.memberIds.includes(user.uid) &&
          Array.isArray(t.members) &&
          t.members.some((m) => m.id === user.uid && !m.leftAt && !m.removedAt)
      );
      setMyTeams(activeOnly);
      setLoadingMyTeams(false);
    });
    return () => unsubMyTeams();
  }, [user]);

  useEffect(() => {
    const unsubTeams = subscribeToTeams(gameFilter === 'ALL' ? undefined : gameFilter, (teams) => {
      setAllTeams(teams);
    });

    const unsubOpen = subscribeToOpen5v5Lobbies(gameFilter === 'ALL' ? undefined : gameFilter, (matches) => {
      setOpenLobbies(matches);
    });

    const unsubAll5v5 = subscribeToAll5v5Matches((matches) => {
      setAll5v5Matches(matches);
    });

    return () => {
      unsubTeams();
      unsubOpen();
      unsubAll5v5();
    };
  }, [gameFilter]);

  const filteredTeams = allTeams.filter((t) => {
    const matchesSearch =
      t.teamName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.teamTag.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.captainGamerTag.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Top Banner / Controls Bar */}
      <div className="bg-[#0a0a0f] border border-slate-800 rounded-3xl p-6 sm:p-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 text-cyan-400 font-mono text-xs font-bold uppercase tracking-widest mb-1">
              <Swords className="w-4 h-4" />
              <span>Competitive 5v5 Squad HQ</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black font-display text-white">
              TEAMS & 5v5 LOBBIES
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-xl">
              Form 5-player rosters for <strong className="text-cyan-400">VALORANT</strong> and <strong className="text-cyan-400">CS2</strong>, host official ranked lobbies with admin referee inspection, and climb the Team Leaderboards.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              onClick={() => {
                if (!user && onOpenAuth) {
                  onOpenAuth();
                  return;
                }
                setIsCreateTeamOpen(true);
              }}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider transition-colors flex items-center gap-1.5 border border-slate-700"
            >
              <Plus className="w-4 h-4 text-cyan-400" />
              <span>Create Squad</span>
            </button>

            <button
              onClick={() => {
                if (!user && onOpenAuth) {
                  onOpenAuth();
                  return;
                }
                setIsJoinLobbyOpen(true);
              }}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 font-mono font-bold text-xs uppercase tracking-wider transition-colors flex items-center gap-1.5 border border-cyan-500/30"
            >
              <KeyRound className="w-4 h-4 text-cyan-400" />
              <span>Join Lobby</span>
            </button>

            <button
              onClick={() => {
                if (!user && onOpenAuth) {
                  onOpenAuth();
                  return;
                }
                setIsCreateLobbyOpen(true);
              }}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:brightness-110 text-black font-mono font-black text-xs uppercase tracking-wider transition-all shadow-lg flex items-center gap-1.5"
            >
              <Play className="w-4 h-4" />
              <span>Create 5v5 Lobby</span>
            </button>
          </div>
        </div>

        {/* Secondary Filter & Navigation Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-6 pt-6 border-t border-slate-800/80">
          {/* Main Navigation Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
            <button
              onClick={() => setActiveTab('my_teams')}
              className={`px-4 py-2 rounded-xl text-xs font-mono font-bold uppercase tracking-wider transition-all flex items-center gap-2 shrink-0 ${
                activeTab === 'my_teams'
                  ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
                  : 'bg-slate-900/60 text-slate-400 hover:text-white border border-transparent'
              }`}
            >
              <Shield className="w-3.5 h-3.5" />
              <span>My Squads ({loadingMyTeams ? '...' : myTeams.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('lobbies')}
              className={`px-4 py-2 rounded-xl text-xs font-mono font-bold uppercase tracking-wider transition-all flex items-center gap-2 shrink-0 ${
                activeTab === 'lobbies'
                  ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
                  : 'bg-slate-900/60 text-slate-400 hover:text-white border border-transparent'
              }`}
            >
              <Swords className="w-3.5 h-3.5" />
              <span>5v5 Lobbies ({openLobbies.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('leaderboard')}
              className={`px-4 py-2 rounded-xl text-xs font-mono font-bold uppercase tracking-wider transition-all flex items-center gap-2 shrink-0 ${
                activeTab === 'leaderboard'
                  ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
                  : 'bg-slate-900/60 text-slate-400 hover:text-white border border-transparent'
              }`}
            >
              <Trophy className="w-3.5 h-3.5" />
              <span>Team Leaderboard</span>
            </button>

            <button
              onClick={() => setActiveTab('directory')}
              className={`px-4 py-2 rounded-xl text-xs font-mono font-bold uppercase tracking-wider transition-all flex items-center gap-2 shrink-0 ${
                activeTab === 'directory'
                  ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
                  : 'bg-slate-900/60 text-slate-400 hover:text-white border border-transparent'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Team Directory</span>
            </button>
          </div>

          {/* Game Filter Pills */}
          <div className="flex items-center gap-1.5 bg-[#121218] p-1 rounded-xl border border-slate-800 shrink-0">
            <button
              onClick={() => setGameFilter('ALL')}
              className={`px-3 py-1 rounded-lg text-xs font-mono font-bold transition-all ${
                gameFilter === 'ALL' ? 'bg-cyan-400 text-black' : 'text-slate-400 hover:text-white'
              }`}
            >
              ALL
            </button>
            <button
              onClick={() => setGameFilter('valorant')}
              className={`px-3 py-1 rounded-lg text-xs font-mono font-bold transition-all ${
                gameFilter === 'valorant' ? 'bg-cyan-400 text-black' : 'text-slate-400 hover:text-white'
              }`}
            >
              VALORANT
            </button>
            <button
              onClick={() => setGameFilter('cs2')}
              className={`px-3 py-1 rounded-lg text-xs font-mono font-bold transition-all ${
                gameFilter === 'cs2' ? 'bg-cyan-400 text-black' : 'text-slate-400 hover:text-white'
              }`}
            >
              CS2
            </button>
            <button
              onClick={() => setGameFilter('lol')}
              className={`px-3 py-1 rounded-lg text-xs font-mono font-bold transition-all ${
                gameFilter === 'lol' ? 'bg-cyan-400 text-black' : 'text-slate-400 hover:text-white'
              }`}
            >
              LEAGUE
            </button>
          </div>
        </div>
      </div>

      {/* Tab Content 1: My Teams */}
      {activeTab === 'my_teams' && (
        <div className="space-y-4">
          {loadingMyTeams ? (
            <div className="bg-[#0a0a0f] border border-slate-800 rounded-3xl p-12 text-center space-y-4">
              <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs font-mono text-slate-400 uppercase tracking-widest">
                Loading squad data...
              </p>
            </div>
          ) : myTeams.length === 0 ? (
            <div className="bg-[#0a0a0f] border border-slate-800 rounded-3xl p-10 text-center space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center mx-auto">
                <Shield className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-lg font-bold font-display text-white">YOU ARE NOT IN A SQUAD</h3>
                <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                  You are not currently enrolled in any 5v5 squad. Create a new squad or get invited by a team captain!
                </p>
              </div>
              <button
                onClick={() => setIsCreateTeamOpen(true)}
                className="px-6 py-2.5 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-black font-mono font-bold text-xs uppercase tracking-wider transition-all inline-flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                <span>CREATE SQUAD</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {myTeams.map((team) => {
                const isCaptain = user && team.captainId === user.uid;
                const isFull = team.members.length === 5;

                return (
                  <div
                    key={team.teamId}
                    className="bg-[#0a0a0f] border border-slate-800 hover:border-slate-700 rounded-3xl p-6 transition-all space-y-5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-14 h-14 rounded-2xl bg-[#15151b] border border-slate-700 flex items-center justify-center text-3xl shrink-0 shadow-md">
                          {team.teamLogo || '🛡️'}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-lg font-black font-display text-white">
                              {team.teamName}
                            </h3>
                            <span className="px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 font-mono font-black text-xs">
                              [{team.teamTag}]
                            </span>
                          </div>
                          <div className="text-xs text-slate-400 font-mono flex items-center gap-2 mt-0.5">
                            <span className="text-cyan-400 font-bold uppercase">{team.gameName} 5v5</span>
                            <span>•</span>
                            {isCaptain ? (
                              <span className="text-yellow-400 font-bold flex items-center gap-1">
                                <Crown className="w-3 h-3" /> You are Captain
                              </span>
                            ) : (
                              <span className="text-slate-400">Captain: {team.captainGamerTag}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="text-right font-mono">
                        <div className="text-lg font-bold text-cyan-400 font-display">
                          {team.teamRating || 1000} <span className="text-[10px] text-slate-500">ELO</span>
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {team.wins}W - {team.losses}L ({team.winRate || 0}%)
                        </div>
                      </div>
                    </div>

                    {/* Roster Strip */}
                    <div className="p-3 rounded-2xl bg-[#121218] border border-slate-800/80">
                      <div className="flex items-center justify-between text-[11px] font-mono mb-2">
                        <span className="text-slate-400">Roster Members:</span>
                        <span className={isFull ? 'text-emerald-400 font-bold' : 'text-yellow-400 font-bold'}>
                          {team.members.length}/5 Active
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {team.members.map((m) => (
                          <div
                            key={m.id}
                            className="px-2.5 py-1 rounded-lg bg-slate-800/80 border border-slate-700 text-xs font-mono text-slate-200 flex items-center gap-1"
                          >
                            {m.role === 'captain' && <Crown className="w-3 h-3 text-yellow-400" />}
                            <span>{m.gamerTag}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Action Bar */}
                    <div className="flex items-center justify-between gap-3 pt-1 flex-wrap">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => setSelectedTeamIdForProfile(team.teamId)}
                          className="text-xs font-mono text-cyan-400 hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <span>View Squad Dossier</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleInitiateLeave(team)}
                          className="text-xs font-mono text-rose-400 hover:text-rose-300 hover:underline flex items-center gap-1 cursor-pointer"
                          title="Leave Squad"
                        >
                          <LogOut className="w-3.5 h-3.5" />
                          <span>Leave Squad</span>
                        </button>
                      </div>

                      {isCaptain && (
                        <button
                          onClick={() => {
                            setPreselectedTeamForLobby(team);
                            setIsCreateLobbyOpen(true);
                          }}
                          disabled={!isFull}
                          className={`px-4 py-2 rounded-xl text-xs font-mono font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-md ${
                            isFull
                              ? 'bg-cyan-400 hover:bg-cyan-300 text-black'
                              : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                          }`}
                        >
                          <Play className="w-3.5 h-3.5" />
                          <span>Host 5v5 Lobby</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab Content 2: 5v5 Lobbies */}
      {activeTab === 'lobbies' && (
        <div className="space-y-6">
          {/* Live Squad Recruitment Feed */}
          <LobbyRecruitmentFeed
            onSelectMatch={onSelectMatch}
            onOpenAuth={onOpenAuth}
            onOpenCreate5v5Lobby={() => setIsCreateLobbyOpen(true)}
            filterGameId={gameFilter === 'ALL' ? undefined : gameFilter}
          />

          <div className="flex items-center justify-between pt-2">
            <h2 className="text-sm font-mono font-bold uppercase text-slate-400">
              5v5 Team Lobbies
            </h2>
            <button
              onClick={() => setIsCreateLobbyOpen(true)}
              className="text-xs font-mono text-cyan-400 hover:underline flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create New Lobby</span>
            </button>
          </div>

          {openLobbies.length === 0 ? (
            <div className="bg-[#0a0a0f] border border-slate-800 rounded-3xl p-10 text-center space-y-3">
              <Swords className="w-10 h-10 text-slate-600 mx-auto" />
              <h3 className="text-base font-bold text-white">No Active 5v5 Team Lobbies Right Now</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                No squad is currently waiting for opponents. Captains can create an open lobby with a unique code!
              </p>
              <button
                onClick={() => setIsCreateLobbyOpen(true)}
                className="px-5 py-2 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-black font-mono font-bold text-xs uppercase"
              >
                Host a Lobby
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {openLobbies.map((lobby) => {
                const lobbyState = calculate5v5LobbyState(lobby);
                const totalPlayers = lobbyState.teamACount + lobbyState.teamBCount;

                return (
                  <div
                    key={lobby.id}
                    className="bg-[#0a0a0f] border border-cyan-500/30 hover:border-cyan-400 rounded-3xl p-5 transition-all space-y-4 shadow-lg shadow-cyan-950/20"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-2xl">
                          {lobby.teamALogo || '🛡️'}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-base font-black font-display text-white">
                              {lobby.teamAName}
                            </h3>
                            <span className="px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 font-mono font-bold text-xs">
                              [{lobby.teamATag}]
                            </span>
                          </div>
                          <div className="text-xs text-slate-400 font-mono">
                            Captain: <strong className="text-slate-300">{lobby.playerAGamerTag}</strong> • {lobby.station}
                          </div>
                        </div>
                      </div>

                      <div className="text-right font-mono space-y-1">
                        <div className="text-[10px] text-cyan-400 uppercase font-bold">Lobby Code</div>
                        <div className="text-sm font-black text-white bg-slate-900 px-2 py-1 rounded-lg border border-slate-800">
                          {lobby.lobbyCode}
                        </div>
                        {lobbyState.isFull ? (
                          <div className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-950/50 border border-emerald-500/40 px-2 py-0.5 rounded-full inline-block">
                            🟢 FULL (10/10)
                          </div>
                        ) : (
                          <div className="text-[10px] font-mono font-bold text-amber-400 bg-amber-950/50 border border-amber-500/40 px-2 py-0.5 rounded-full inline-block">
                            🟡 {totalPlayers}/10 PLAYERS
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs font-mono text-slate-400 pt-2 border-t border-slate-800">
                      <div>
                        Game: <strong className="text-cyan-400 uppercase">{lobby.gameName || 'VALORANT'} 5v5</strong>
                      </div>
                      <div>
                        Rosters:{' '}
                        <strong className="text-cyan-300">{lobbyState.teamACount}/5</strong> vs{' '}
                        <strong className="text-orange-300">{lobbyState.teamBCount}/5</strong>
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => onSelectMatch(lobby.id)}
                        className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-mono text-xs font-bold transition-colors"
                      >
                        View Lobby
                      </button>
                      {!lobbyState.isFull && (
                        <button
                          onClick={() => {
                            setPrefilledJoinCode(lobby.lobbyCode || '');
                            setIsJoinLobbyOpen(true);
                          }}
                          className="px-4 py-2 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-black font-mono font-bold text-xs uppercase transition-all shadow-md flex items-center gap-1"
                        >
                          <Swords className="w-3.5 h-3.5" />
                          <span>Challenge / Join</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Active 5v5 Matches in Progress */}
          {all5v5Matches.filter((m) => m.status !== 'WAITING_FOR_OPPONENT').length > 0 && (
            <div className="pt-6 space-y-3">
              <h3 className="text-xs font-mono font-bold uppercase text-slate-400">
                5v5 Matches In Progress / Recent
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {all5v5Matches
                  .filter((m) => m.status !== 'WAITING_FOR_OPPONENT')
                  .slice(0, 6)
                  .map((m) => (
                    <div
                      key={m.id}
                      onClick={() => onSelectMatch(m.id)}
                      className="p-4 rounded-2xl bg-[#0a0a0f] border border-slate-800 hover:border-slate-700 cursor-pointer transition-colors flex items-center justify-between"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-white">
                            {m.teamAName} [{m.teamATag}]
                          </span>
                          <span className="text-[10px] font-mono text-slate-500">VS</span>
                          <span className="text-xs font-bold text-white">
                            {m.teamBName} [{m.teamBTag}]
                          </span>
                        </div>
                        <div className="text-[10px] font-mono text-slate-400">
                          {m.gameName} 5v5 • {m.station}
                        </div>
                      </div>

                      <div>
                        <span
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold ${
                            m.status === 'LIVE'
                              ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30 animate-pulse'
                              : m.status === 'CONFIRMED'
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : m.status === 'WAITING_FOR_ADMIN'
                              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {m.status.replace(/_/g, ' ')}
                        </span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab Content 3: Team Leaderboard */}
      {activeTab === 'leaderboard' && (
        <div className="bg-[#0a0a0f] border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
          <div className="p-5 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-black font-display text-white">
                5v5 TEAM RANKINGS ({gameFilter === 'ALL' ? 'ALL SQUADS' : gameFilter.toUpperCase()})
              </h2>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                Official ELO-rated standings for competitive 5-player teams
              </p>
            </div>

            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Search team or tag..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-4 py-1.5 bg-[#121218] border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 font-mono"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-[#121218] text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Rank</th>
                  <th className="py-3 px-4">Squad Name</th>
                  <th className="py-3 px-4">Game</th>
                  <th className="py-3 px-4">Captain</th>
                  <th className="py-3 px-4 text-right">Team ELO</th>
                  <th className="py-3 px-4 text-center">Record (W-L-D)</th>
                  <th className="py-3 px-4 text-right">Win %</th>
                  <th className="py-3 px-4 text-center">Streak</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredTeams.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-500">
                      No active teams found matching your filters.
                    </td>
                  </tr>
                ) : (
                  filteredTeams.map((team, idx) => (
                    <tr
                      key={team.teamId}
                      onClick={() => setSelectedTeamIdForProfile(team.teamId)}
                      className="hover:bg-slate-900/60 transition-colors cursor-pointer"
                    >
                      <td className="py-3.5 px-4 font-bold">
                        {idx === 0 ? (
                          <span className="w-6 h-6 rounded-full bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 flex items-center justify-center font-bold">
                            1
                          </span>
                        ) : idx === 1 ? (
                          <span className="w-6 h-6 rounded-full bg-slate-300/20 text-slate-200 border border-slate-300/30 flex items-center justify-center font-bold">
                            2
                          </span>
                        ) : idx === 2 ? (
                          <span className="w-6 h-6 rounded-full bg-amber-600/20 text-amber-500 border border-amber-600/30 flex items-center justify-center font-bold">
                            3
                          </span>
                        ) : (
                          <span className="text-slate-500 pl-1.5">#{idx + 1}</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5">
                          <span className="text-lg">{team.teamLogo || '🛡️'}</span>
                          <div>
                            <div className="font-bold text-white flex items-center gap-1.5">
                              <span>{team.teamName}</span>
                              <span className="px-1.5 py-0.2 rounded bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 font-mono text-[10px]">
                                [{team.teamTag}]
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-500">
                              {team.members.length} Players
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-cyan-400 uppercase font-bold">
                        {team.gameName}
                      </td>

                      <td className="py-3.5 px-4 text-slate-300 flex items-center gap-1">
                        <Crown className="w-3 h-3 text-yellow-400" />
                        <span>{team.captainGamerTag}</span>
                      </td>

                      <td className="py-3.5 px-4 text-right font-bold text-white text-sm font-display">
                        {team.teamRating || 1000}
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        <span className="text-emerald-400 font-bold">{team.wins}</span>-
                        <span className="text-rose-400 font-bold">{team.losses}</span>-
                        <span className="text-slate-400">{team.draws}</span>
                      </td>

                      <td className="py-3.5 px-4 text-right font-bold text-slate-300">
                        {team.winRate || 0}%
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        {(team.currentWinStreak || 0) > 0 ? (
                          <span className="text-orange-400 font-bold inline-flex items-center gap-0.5">
                            <Flame className="w-3 h-3 fill-orange-400" /> {team.currentWinStreak}W
                          </span>
                        ) : (
                          <span className="text-slate-600">-</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab Content 4: Directory */}
      {activeTab === 'directory' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-mono font-bold uppercase text-slate-400">
              Nexus Team Directory ({filteredTeams.length} Registered Teams)
            </h2>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Search teams..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-4 py-1.5 bg-[#121218] border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredTeams.map((team) => (
              <div
                key={team.teamId}
                onClick={() => setSelectedTeamIdForProfile(team.teamId)}
                className="p-5 rounded-3xl bg-[#0a0a0f] border border-slate-800 hover:border-slate-700 cursor-pointer transition-all space-y-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-[#15151b] border border-slate-700 flex items-center justify-center text-2xl shrink-0">
                      {team.teamLogo || '🛡️'}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <h4 className="text-sm font-bold text-white">{team.teamName}</h4>
                        <span className="px-1.5 py-0.2 rounded bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 font-mono text-[10px]">
                          [{team.teamTag}]
                        </span>
                      </div>
                      <div className="text-[10px] text-cyan-400 font-mono uppercase font-bold">
                        {team.gameName} 5v5
                      </div>
                    </div>
                  </div>

                  <div className="text-right font-mono text-xs">
                    <span className="text-white font-bold">{team.teamRating || 1000}</span>
                    <span className="text-[9px] text-slate-500 block">ELO</span>
                  </div>
                </div>

                <div className="text-xs text-slate-400 font-mono flex items-center justify-between pt-2 border-t border-slate-800">
                  <span className="flex items-center gap-1">
                    <Crown className="w-3 h-3 text-yellow-400" /> {team.captainGamerTag}
                  </span>
                  <span>{team.members.length}/5 Players</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modals */}
      {selectedTeamIdForProfile && (
        <TeamProfileModal
          teamId={selectedTeamIdForProfile}
          isOpen={true}
          onClose={() => setSelectedTeamIdForProfile(null)}
          onSelectPlayerProfile={onSelectPlayerProfile}
          onSelectMatch={onSelectMatch}
          onTeamLeft={(teamId) => {
            setMyTeams((prev) => prev.filter((t) => t.teamId !== teamId));
          }}
          onTeamDisbanded={(teamId) => {
            setMyTeams((prev) => prev.filter((t) => t.teamId !== teamId));
          }}
          onCreateLobby={(team) => {
            setPreselectedTeamForLobby(team);
            setIsCreateLobbyOpen(true);
          }}
        />
      )}

      {isCreateTeamOpen && (
        <CreateTeamModal
          isOpen={true}
          onClose={() => setIsCreateTeamOpen(false)}
          defaultGameId={gameFilter !== 'ALL' ? gameFilter : 'valorant'}
          onTeamCreated={(team) => {
            setSelectedTeamIdForProfile(team.teamId);
          }}
        />
      )}

      {isCreateLobbyOpen && (
        <Create5v5LobbyModal
          isOpen={true}
          onClose={() => {
            setIsCreateLobbyOpen(false);
            setPreselectedTeamForLobby(null);
          }}
          preselectedTeam={preselectedTeamForLobby}
          onLobbyCreated={(match) => {
            onSelectMatch(match.id);
          }}
        />
      )}

      {isJoinLobbyOpen && (
        <Join5v5LobbyModal
          isOpen={true}
          onClose={() => {
            setIsJoinLobbyOpen(false);
            setPrefilledJoinCode('');
          }}
          initialLobbyCode={prefilledJoinCode}
          onLobbyJoined={(match) => {
            onSelectMatch(match.id);
          }}
        />
      )}

      {/* Leave Squad Modal (Member) */}
      {showLeaveSquadModal && teamToLeave && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#121218] border border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-amber-400">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                <LogOut className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h3 className="text-base font-bold font-display text-white">LEAVE SQUAD?</h3>
                <p className="text-xs text-slate-400 font-mono">Voluntary roster departure</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 font-mono leading-relaxed bg-[#0a0a0f] p-3.5 rounded-2xl border border-slate-800">
              Are you sure you want to leave <strong className="text-white">{teamToLeave.teamName}</strong>? Your statistics with this squad will remain recorded in the squad history.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowLeaveSquadModal(false);
                  setTeamToLeave(null);
                }}
                disabled={leaveActionLoading}
                className="px-4 py-2.5 rounded-xl text-xs font-mono text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                CANCEL
              </button>
              <button
                type="button"
                onClick={handleConfirmLeaveSquad}
                disabled={leaveActionLoading}
                className="px-5 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-400 text-white text-xs font-mono font-bold uppercase tracking-wider transition-all shadow-md cursor-pointer"
              >
                {leaveActionLoading ? 'Leaving...' : 'LEAVE SQUAD'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Captain Leave Modal (Enforce Captain transfer or Sole Member Disband) */}
      {showCaptainLeaveModal && teamToLeave && user && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#121218] border border-amber-500/30 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-amber-400">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                <Crown className="w-5 h-5 text-yellow-400" />
              </div>
              <div>
                <h3 className="text-base font-bold font-display text-white">YOU ARE THE SQUAD CAPTAIN</h3>
                <p className="text-xs text-amber-400 font-mono">Captaincy transfer required</p>
              </div>
            </div>

            {teamToLeave.members.filter((m) => m.id !== user.uid).length > 0 ? (
              <div className="space-y-3">
                <p className="text-xs text-slate-300 font-mono leading-relaxed bg-[#0a0a0f] p-3.5 rounded-2xl border border-slate-800">
                  You must transfer captaincy to another member before leaving. Select the member who will succeed you as Squad Captain:
                </p>

                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {teamToLeave.members
                    .filter((m) => m.id !== user.uid)
                    .map((m) => (
                      <label
                        key={m.id}
                        className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
                          selectedNewCaptainId === m.id
                            ? 'bg-amber-500/10 border-amber-500 text-white'
                            : 'bg-[#15151b] border-slate-800 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <input
                            type="radio"
                            name="hubNewCaptain"
                            value={m.id}
                            checked={selectedNewCaptainId === m.id}
                            onChange={() => setSelectedNewCaptainId(m.id)}
                            className="text-amber-500 focus:ring-amber-500"
                          />
                          <span className="text-xs font-bold font-mono text-white">{m.gamerTag}</span>
                        </div>
                        <span className="text-[10px] font-mono text-slate-400">{m.rating || 1000} MMR</span>
                      </label>
                    ))}
                </div>

                <div className="flex items-center justify-end gap-3 pt-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCaptainLeaveModal(false);
                      setTeamToLeave(null);
                    }}
                    disabled={leaveActionLoading}
                    className="px-4 py-2.5 rounded-xl text-xs font-mono text-slate-400 hover:text-white transition-colors cursor-pointer"
                  >
                    CANCEL
                  </button>
                  <button
                    type="button"
                    onClick={handleCaptainTransferAndLeave}
                    disabled={leaveActionLoading || !selectedNewCaptainId}
                    className={`px-5 py-2.5 rounded-xl text-xs font-mono font-bold uppercase tracking-wider transition-all shadow-md cursor-pointer ${
                      selectedNewCaptainId
                        ? 'bg-amber-400 hover:bg-amber-300 text-black'
                        : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                    }`}
                  >
                    {leaveActionLoading ? 'Processing...' : 'TRANSFER CAPTAINCY & LEAVE'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-xs text-slate-300 font-mono leading-relaxed bg-[#0a0a0f] p-3.5 rounded-2xl border border-slate-800">
                  You are the sole member of this squad. To leave, you can disband the squad or invite other members first.
                </p>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCaptainLeaveModal(false);
                      setTeamToLeave(null);
                    }}
                    disabled={leaveActionLoading}
                    className="px-4 py-2.5 rounded-xl text-xs font-mono text-slate-400 hover:text-white transition-colors cursor-pointer"
                  >
                    CANCEL
                  </button>
                  <button
                    type="button"
                    onClick={handleSoleCaptainDisband}
                    disabled={leaveActionLoading}
                    className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-mono font-bold uppercase tracking-wider transition-all shadow-md cursor-pointer"
                  >
                    {leaveActionLoading ? 'Disbanding...' : 'DISBAND SQUAD'}
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
