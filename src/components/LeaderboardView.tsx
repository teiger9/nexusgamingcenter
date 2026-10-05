import React, { useState, useEffect } from 'react';
import { fetchLeaderboard } from '../services/playerService';
import { fetchAllSeasons, fetchSeasonLeaderboard, getActiveSeason } from '../services/seasonService';
import { LeaderboardEntry, Season, Team } from '../types';
import { subscribeToTeams } from '../services/teamService';
import { getRankFromMMR, COMPETITIVE_GAMES, normalizeGameId, getGameConfig, SupportedGameId } from '../lib/ranks';
import { Trophy, Crown, Calendar, Zap, ChevronRight, Search, Shield, Users, User, Flame, X } from 'lucide-react';
import { WinStreakAvatarWrapper, WinStreakBadge } from './WinStreakFire';
import { RankEmblem, UnrankedEmblem } from './NexusRankBadge';

interface LeaderboardViewProps {
  onSelectPlayerProfile?: (playerId: string) => void;
  onOpenRankingGuide?: () => void;
  onNavigateToHallOfFame?: () => void;
}

export const LeaderboardView: React.FC<LeaderboardViewProps> = ({
  onSelectPlayerProfile,
  onOpenRankingGuide,
  onNavigateToHallOfFame,
}) => {
  const [selectedGameId, setSelectedGameId] = useState<SupportedGameId>('chess');
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [activeSeason, setActiveSeason] = useState<Season | null>(null);
  const [selectedSeasonId, setSelectedSeasonId] = useState<string>('ACTIVE');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);

  const is5v5TeamGame = selectedGameId === 'valorant' || selectedGameId === 'cs2' || selectedGameId === 'lol';

  useEffect(() => {
    loadInitialMetadata();
  }, []);

  useEffect(() => {
    if (is5v5TeamGame) {
      setLoading(true);
      const unsub = subscribeToTeams(selectedGameId, (teamList) => {
        setTeams(teamList);
        setLoading(false);
      });
      return () => unsub();
    } else {
      loadLeaderboardData();
    }
  }, [selectedGameId, selectedSeasonId, activeSeason]);

  const loadInitialMetadata = async () => {
    try {
      const [allSeasonsData, active] = await Promise.all([
        fetchAllSeasons(),
        getActiveSeason(),
      ]);
      setSeasons(allSeasonsData);
      setActiveSeason(active);
      if (active) {
        setSelectedSeasonId(active.id);
      }
    } catch (err) {
      console.error('Error loading leaderboard metadata:', err);
    }
  };

  const loadLeaderboardData = async () => {
    setLoading(true);
    try {
      if (selectedSeasonId === 'ALL_TIME') {
        const data = await fetchLeaderboard({
          gameIdFilter: selectedGameId,
        });
        setEntries(data);
      } else {
        const targetSeasonId = selectedSeasonId === 'ACTIVE' ? activeSeason?.id : selectedSeasonId;
        if (targetSeasonId) {
          const data = await fetchSeasonLeaderboard({
            seasonId: targetSeasonId,
            gameIdFilter: selectedGameId,
          });
          setEntries(data);
        } else {
          const data = await fetchLeaderboard({
            gameIdFilter: selectedGameId,
          });
          setEntries(data);
        }
      }
    } catch (err) {
      console.error('Error fetching leaderboard:', err);
    } finally {
      setLoading(false);
    }
  };

  const currentGameConfig = getGameConfig(selectedGameId);
  const currentViewSeason = seasons.find((s) => s.id === selectedSeasonId);
  const isCurrentFrozen = currentViewSeason?.status === 'COMPLETED';

  const filteredEntries = entries.filter((e) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (e?.gamerTag && e.gamerTag.toLowerCase().includes(q)) || (e?.fullName && e.fullName.toLowerCase().includes(q));
  });

  const topThree = filteredEntries.slice(0, 3);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-950/60 border border-cyan-500/30 text-cyan-400 text-xs font-mono font-bold mb-2 shadow-[0_0_10px_rgba(34,211,238,0.2)]">
            <Trophy className="w-3.5 h-3.5" />
            <span>INDEPENDENT GAME LEADERBOARDS</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black font-display tracking-tight text-white flex items-center gap-3">
            <span>OFFICIAL</span>
            <span className="text-cyan-400 italic">STANDINGS</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Every game maintains its own completely independent competitive MMR, rank badges, and season leaderboard.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {onNavigateToHallOfFame && (
            <button
              onClick={onNavigateToHallOfFame}
              className="px-3.5 py-2 rounded-xl bg-[#121218] hover:bg-slate-800 text-yellow-400 border border-yellow-500/30 text-xs font-bold font-mono uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-sm"
            >
              <Crown className="w-3.5 h-3.5 text-yellow-400" />
              <span>Hall of Fame</span>
            </button>
          )}

          {onOpenRankingGuide && (
            <button
              onClick={onOpenRankingGuide}
              className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-cyan-400 border border-slate-800 hover:border-cyan-500/40 text-xs font-bold font-mono uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-sm"
              title="Learn how Nexus Ranking levels work"
            >
              <Zap className="w-3.5 h-3.5 text-cyan-400" />
              <span>MMR Tier Guide</span>
            </button>
          )}
        </div>
      </div>

      {/* RANKINGS AUTHORITATIVE NAVIGATION (Requirement 12) */}
      <div className="space-y-3">
        <div className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400">
          RANKINGS
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          {COMPETITIVE_GAMES.map((game) => {
            const isSelected = selectedGameId === game.id;
            return (
              <button
                key={game.id}
                onClick={() => {
                  setSelectedGameId(game.id);
                  setSearchQuery('');
                }}
                className={`px-3 py-3 rounded-2xl flex items-center justify-center gap-2 font-display font-black text-xs uppercase tracking-wider transition-all cursor-pointer border ${
                  isSelected
                    ? 'bg-gradient-to-r from-red-600 to-red-500 text-white border-red-400 shadow-[0_0_15px_rgba(239,68,68,0.35)]'
                    : 'bg-[#121218] border-slate-800 text-slate-300 hover:text-white hover:border-slate-700'
                }`}
              >
                <span className="text-lg">{game.icon}</span>
                <span>{game.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* GAME SELECTION: SEPARATE INDIVIDUAL (1v1) AND TEAM (5v5) RANKINGS */}
      <div className="space-y-4">
        {/* Branch 1: Individual 1v1 Rankings */}
        <div className="p-3 rounded-2xl bg-[#09090e] border border-slate-800/80 shadow-md">
          <div className="flex items-center gap-2 mb-2 px-1">
            <User className="w-3.5 h-3.5 text-indigo-400" />
            <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-indigo-300">
              Individual Rankings (1v1 Solo Competition)
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {COMPETITIVE_GAMES.filter((g) => g.matchFormat === '1v1').map((game) => {
              const isSelected = selectedGameId === game.id;
              return (
                <button
                  key={game.id}
                  onClick={() => {
                    setSelectedGameId(game.id);
                    setSearchQuery('');
                  }}
                  className={`p-3 rounded-xl flex items-center gap-3 transition-all text-left ${
                    isSelected
                      ? 'bg-gradient-to-r from-indigo-950/80 to-slate-900 border-2 border-indigo-400 text-white shadow-[0_0_15px_rgba(99,102,241,0.25)]'
                      : 'bg-[#121218]/80 border border-slate-800/80 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                  }`}
                >
                  <span className="text-2xl">{game.icon}</span>
                  <div>
                    <div className={`font-display font-black text-xs uppercase tracking-wider ${isSelected ? 'text-indigo-300' : 'text-slate-300'}`}>
                      {game.name}
                    </div>
                    <div className="text-[10px] font-mono text-slate-500">1v1 Solo Ranking</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Branch 2: Official 5v5 Team Rankings */}
        <div className="p-3 rounded-2xl bg-[#09090e] border border-cyan-500/30 shadow-md">
          <div className="flex items-center gap-2 mb-2 px-1">
            <Users className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-cyan-300">
              Team Rankings (5v5 Competitive Squad Standings)
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {COMPETITIVE_GAMES.filter((g) => g.matchFormat === '5v5').map((game) => {
              const isSelected = selectedGameId === game.id;
              return (
                <button
                  key={game.id}
                  onClick={() => {
                    setSelectedGameId(game.id);
                    setSearchQuery('');
                  }}
                  className={`p-3 rounded-xl flex items-center gap-3 transition-all text-left ${
                    isSelected
                      ? 'bg-gradient-to-r from-cyan-950/80 to-slate-900 border-2 border-cyan-400 text-white shadow-[0_0_20px_rgba(34,211,238,0.25)]'
                      : 'bg-[#121218]/80 border border-slate-800/80 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                  }`}
                >
                  <span className="text-2xl">{game.icon}</span>
                  <div>
                    <div className={`font-display font-black text-xs uppercase tracking-wider ${isSelected ? 'text-cyan-300' : 'text-slate-300'}`}>
                      {game.name}
                    </div>
                    <div className="text-[10px] font-mono text-cyan-400/80 font-bold">5v5 Team MMR</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ACTIVE GAME BANNER INFO */}
      <div className="p-4 rounded-2xl bg-[#0e0e16] border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-md">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-cyan-950/40 border border-cyan-500/30 flex items-center justify-center text-2xl shadow-[0_0_15px_rgba(34,211,238,0.15)]">
            {currentGameConfig.icon}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black font-display text-white">
                {currentGameConfig.name} {is5v5TeamGame ? 'Team Leaderboard' : 'Individual Leaderboard'}
              </h2>
              <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                is5v5TeamGame ? 'bg-cyan-950 text-cyan-400 border border-cyan-500/40' : 'bg-indigo-950 text-indigo-400 border border-indigo-500/40'
              }`}>
                {is5v5TeamGame ? 'TEAM MMR RANKING' : 'INDIVIDUAL MMR RANKING'}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {currentGameConfig.description}
            </p>
          </div>
        </div>

        {/* Season & Search Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {!is5v5TeamGame && (
            <div className="flex items-center gap-1.5 bg-[#14141c] border border-slate-700/80 rounded-xl px-2.5 py-1.5">
              <Calendar className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <select
                value={selectedSeasonId}
                onChange={(e) => setSelectedSeasonId(e.target.value)}
                className="bg-transparent text-xs font-bold font-mono text-cyan-300 focus:outline-none cursor-pointer"
              >
                {activeSeason && (
                  <option value={activeSeason.id} className="bg-[#14141c] text-white">
                    🏆 {activeSeason.name} (ACTIVE)
                  </option>
                )}
                {seasons
                  .filter((s) => s.id !== activeSeason?.id)
                  .map((s) => (
                    <option key={s.id} value={s.id} className="bg-[#14141c] text-white">
                      {s.status === 'COMPLETED' ? `❄️ ${s.name} (Frozen)` : s.name}
                    </option>
                  ))}
                <option value="ALL_TIME" className="bg-[#14141c] text-white">⭐ ALL-TIME (Career)</option>
              </select>
            </div>
          )}

          {/* Search Input */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder={is5v5TeamGame ? 'Search teams & captains...' : 'Search players...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-[#14141c] border border-slate-700/80 text-xs text-white rounded-xl pl-8 pr-3 py-1.5 focus:outline-none focus:border-cyan-400 placeholder:text-slate-500 w-36 sm:w-52 font-mono"
            />
          </div>
        </div>
      </div>

      {/* 5v5 TEAM RANKINGS (Requirement 2 & 4: Exact structure) */}
      {is5v5TeamGame ? (
        <div className="space-y-6">
          {/* Progression Workflow Banner */}
          <div className="p-3.5 rounded-2xl bg-gradient-to-r from-cyan-950/40 via-[#0e0e16] to-slate-900 border border-cyan-500/30 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs font-mono">
            <div className="flex items-center gap-2 text-cyan-300 font-bold">
              <Zap className="w-4 h-4 text-yellow-400 shrink-0" />
              <span>Match Progression Engine:</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
              <span className="px-2 py-0.5 rounded bg-slate-800 text-white">Result</span>
              <span className="text-slate-500">→</span>
              <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">NC Reward</span>
              <span className="text-slate-500">→</span>
              <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">MMR Change</span>
              <span className="text-slate-500">→</span>
              <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">Updated Team MMR</span>
              <span className="text-slate-500">→</span>
              <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">Updated Ranking</span>
            </div>
          </div>

          {loading ? (
            <div className="py-24 text-center">
              <div className="inline-block w-8 h-8 border-3 border-cyan-400 border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-slate-400 text-xs font-mono">Loading official 5v5 {currentGameConfig.name} team rankings...</p>
            </div>
          ) : teams.length === 0 ? (
            <div className="py-16 text-center bg-[#0a0a0f] border border-slate-800 rounded-2xl p-8 shadow-xl">
              <Users className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <h3 className="text-lg font-bold font-display text-white">No Official {currentGameConfig.name} Teams Yet</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto mt-1">
                Form a 5-player squad in the 5v5 Squads hub to compete for official team rating!
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Standings Table with Exact Structure: Rank → Team → Captain → MMR → Wins → Losses → Draws → Win Rate → Matches */}
              <div className="bg-[#0a0a0f] border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
                <div className="px-5 py-3.5 border-b border-slate-800 bg-[#050507] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Trophy className="w-4 h-4 text-cyan-400" />
                    <span className="font-display font-black text-xs uppercase tracking-wider text-white">
                      Official {currentGameConfig.name} Team Standings
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-500">
                    {teams.length} Active {currentGameConfig.name} Squads
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-mono">
                    <thead>
                      <tr className="border-b border-slate-800 bg-[#08080d] text-slate-400 uppercase tracking-wider text-[11px]">
                        <th className="py-3 px-4 text-center w-14">Rank</th>
                        <th className="py-3 px-4">Team</th>
                        <th className="py-3 px-4">Captain</th>
                        <th className="py-3 px-4 text-right">MMR</th>
                        <th className="py-3 px-4 text-center">Wins</th>
                        <th className="py-3 px-4 text-center">Losses</th>
                        <th className="py-3 px-4 text-center">Draws</th>
                        <th className="py-3 px-4 text-right">Win Rate</th>
                        <th className="py-3 px-4 text-center">Matches</th>
                        <th className="py-3 px-4 text-center w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {teams
                        .filter((t) => {
                          if (!searchQuery.trim()) return true;
                          const q = searchQuery.toLowerCase();
                          return (
                            t.teamName.toLowerCase().includes(q) ||
                            t.teamTag.toLowerCase().includes(q) ||
                            (t.captainName && t.captainName.toLowerCase().includes(q)) ||
                            (t.captainGamerTag && t.captainGamerTag.toLowerCase().includes(q)) ||
                            t.members?.some((m) => m.gamerTag?.toLowerCase().includes(q))
                          );
                        })
                        .map((team, idx) => {
                          const winRate =
                            team.matchesPlayed > 0
                              ? Math.round((team.wins / team.matchesPlayed) * 100)
                              : 0;
                          const teamTier = getRankFromMMR(team.teamRating);
                          const isTop1 = idx === 0;
                          const isTop2 = idx === 1;
                          const isTop3 = idx === 2;

                          return (
                            <tr
                              key={team.teamId}
                              onClick={() => setSelectedTeam(team)}
                              className="hover:bg-cyan-950/20 cursor-pointer transition-colors group"
                            >
                              {/* Rank */}
                              <td className="py-3.5 px-4 text-center font-display font-black text-sm">
                                {isTop1 ? (
                                  <span className="inline-block px-2 py-0.5 rounded bg-yellow-500 text-black font-black">
                                    01
                                  </span>
                                ) : isTop2 ? (
                                  <span className="inline-block px-2 py-0.5 rounded bg-slate-500 text-white font-bold">
                                    02
                                  </span>
                                ) : isTop3 ? (
                                  <span className="inline-block px-2 py-0.5 rounded bg-amber-800 text-white font-bold">
                                    03
                                  </span>
                                ) : (
                                  <span className="text-slate-500 font-mono">
                                    {idx + 1 < 10 ? `0${idx + 1}` : idx + 1}
                                  </span>
                                )}
                              </td>

                              {/* Team */}
                              <td className="py-3.5 px-4">
                                <div className="flex items-center gap-2.5">
                                  <span className="w-8 h-8 rounded-lg bg-neutral-900 border border-neutral-800 flex items-center justify-center text-base shrink-0">
                                    {team.teamLogo || '🛡️'}
                                  </span>
                                  <div>
                                    <div className="flex items-center gap-1.5">
                                      <span className="font-display font-black text-sm text-white group-hover:text-cyan-400 transition-colors uppercase">
                                        {team.teamName}
                                      </span>
                                      <span className="px-1.5 py-0.2 rounded bg-cyan-950 border border-cyan-500/30 text-cyan-400 text-[10px] font-bold">
                                        [{team.teamTag}]
                                      </span>
                                    </div>
                                    <span className="text-[10px] text-slate-500">
                                      {team.members?.length || 5} Squad Members
                                    </span>
                                  </div>
                                </div>
                              </td>

                              {/* Captain */}
                              <td className="py-3.5 px-4">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-yellow-400 text-xs">👑</span>
                                  <span className="font-bold text-slate-200">
                                    {team.captainGamerTag || team.captainName || 'Captain'}
                                  </span>
                                </div>
                              </td>

                              {/* MMR */}
                              <td className="py-3.5 px-4 text-right">
                                <div className="font-display font-black text-base text-cyan-400">
                                  {team.teamRating}
                                </div>
                                <span className={`text-[10px] font-bold uppercase ${teamTier.textColorClass}`}>
                                  {teamTier.gameCustomTitles?.[team.gameId] || teamTier.name}
                                </span>
                              </td>

                              {/* Wins */}
                              <td className="py-3.5 px-4 text-center font-bold text-emerald-400">
                                {team.wins}
                              </td>

                              {/* Losses */}
                              <td className="py-3.5 px-4 text-center font-bold text-red-400">
                                {team.losses}
                              </td>

                              {/* Draws */}
                              <td className="py-3.5 px-4 text-center font-bold text-amber-400">
                                {team.draws || 0}
                              </td>

                              {/* Win Rate */}
                              <td className="py-3.5 px-4 text-right font-bold">
                                <span
                                  className={
                                    winRate >= 60
                                      ? 'text-emerald-400'
                                      : winRate >= 45
                                      ? 'text-yellow-400'
                                      : 'text-slate-400'
                                  }
                                >
                                  {winRate}%
                                </span>
                              </td>

                              {/* Matches */}
                              <td className="py-3.5 px-4 text-center font-bold text-white">
                                {team.matchesPlayed}
                              </td>

                              <td className="py-3.5 px-4 text-center text-slate-500 group-hover:text-cyan-400 transition-colors">
                                <ChevronRight className="w-4 h-4" />
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Standings Grid Cards for Detailed Inspection */}
              <div className="grid grid-cols-1 gap-4">
                {teams
                  .filter((t) => {
                    if (!searchQuery.trim()) return true;
                    const q = searchQuery.toLowerCase();
                    return (
                      t.teamName.toLowerCase().includes(q) ||
                      t.teamTag.toLowerCase().includes(q) ||
                      (t.captainName && t.captainName.toLowerCase().includes(q)) ||
                      (t.captainGamerTag && t.captainGamerTag.toLowerCase().includes(q)) ||
                      t.members?.some((m) => m.gamerTag?.toLowerCase().includes(q))
                    );
                  })
                  .map((team, idx) => {
                    const winRate =
                      team.matchesPlayed > 0
                        ? Math.round((team.wins / team.matchesPlayed) * 100)
                        : 0;
                    const teamTier = getRankFromMMR(team.teamRating);
                    const isTop1 = idx === 0;
                    const isTop2 = idx === 1;
                    const isTop3 = idx === 2;

                    return (
                      <div
                        key={team.teamId}
                        onClick={() => setSelectedTeam(team)}
                        className={`p-5 rounded-2xl bg-[#0a0a0f] border transition-all cursor-pointer hover:border-cyan-400/50 hover:bg-[#0e0e16] shadow-xl group relative overflow-hidden ${
                          isTop1
                            ? 'border-yellow-500/40 ring-1 ring-yellow-500/20'
                            : isTop2
                            ? 'border-slate-500/40'
                            : isTop3
                            ? 'border-amber-700/40'
                            : 'border-slate-800'
                        }`}
                      >
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                          {/* Left: Rank, Team Name, Tag, MMR & Rank Badge */}
                          <div className="flex items-start sm:items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-neutral-900 border border-neutral-800 flex items-center justify-center shrink-0">
                              {isTop1 ? (
                                <span className="text-yellow-400 font-display font-black text-xl">#1</span>
                              ) : isTop2 ? (
                                <span className="text-slate-300 font-display font-black text-lg">#2</span>
                              ) : isTop3 ? (
                                <span className="text-amber-600 font-display font-black text-lg">#3</span>
                              ) : (
                                <span className="text-slate-400 font-display font-bold text-sm">#{idx + 1}</span>
                              )}
                            </div>

                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="text-lg sm:text-xl font-black font-display text-white group-hover:text-cyan-300 transition-colors uppercase tracking-tight">
                                  {team.teamName}
                                </h3>
                                <span className="px-2 py-0.5 bg-cyan-950/80 border border-cyan-500/40 text-cyan-400 text-xs font-mono font-bold rounded">
                                  [{team.teamTag}]
                                </span>
                                <span className="px-2 py-0.5 bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-[10px] font-mono font-bold rounded flex items-center gap-1">
                                  <span>👑 Captain:</span>
                                  <span>{team.captainGamerTag || team.captainName}</span>
                                </span>
                                {(team.currentStreak || 0) >= 3 && (
                                  <span className="px-2 py-0.5 bg-orange-500/20 text-orange-400 border border-orange-500/30 text-[10px] font-mono font-bold rounded flex items-center gap-1">
                                    <Flame className="w-3 h-3 text-orange-400 fill-orange-400" />
                                    <span>{team.currentStreak} Streak</span>
                                  </span>
                                )}
                              </div>

                              <div className="flex flex-wrap items-center gap-3 mt-1 text-xs font-mono">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-slate-400 uppercase">Team MMR:</span>
                                  <span className="text-cyan-400 font-black text-base">{team.teamRating}</span>
                                </div>
                                <span className="text-slate-600">•</span>
                                <div className="flex items-center gap-1.5">
                                  <span className={`font-bold uppercase ${teamTier.textColorClass}`}>
                                    {teamTier.gameCustomTitles?.[team.gameId] || `${teamTier.icon} ${teamTier.name}`}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Right: Record & Win Rate */}
                          <div className="flex items-center gap-6 self-start lg:self-auto font-mono text-xs">
                            <div>
                              <div className="text-[10px] text-slate-500 uppercase">Record</div>
                              <div className="text-slate-200 mt-0.5">
                                <span className="text-emerald-400 font-bold">{team.wins}W</span>{' '}
                                <span className="text-slate-600">/</span>{' '}
                                <span className="text-red-400 font-bold">{team.losses}L</span>{' '}
                                {team.draws ? (
                                  <>
                                    <span className="text-slate-600">/</span>{' '}
                                    <span className="text-amber-400 font-bold">{team.draws}D</span>
                                  </>
                                ) : null}
                              </div>
                            </div>

                            <div>
                              <div className="text-[10px] text-slate-500 uppercase">Matches</div>
                              <div className="text-white font-bold mt-0.5">{team.matchesPlayed}</div>
                            </div>

                            <div>
                              <div className="text-[10px] text-slate-500 uppercase">Win Rate</div>
                              <div className={`font-bold mt-0.5 ${winRate >= 60 ? 'text-emerald-400' : winRate >= 45 ? 'text-yellow-400' : 'text-slate-400'}`}>
                                {winRate}%
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Participating Members Roster */}
                        <div className="mt-4 pt-3.5 border-t border-slate-800/80">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold flex items-center gap-1.5">
                              <Users className="w-3 h-3 text-cyan-400" />
                              <span>Members ({team.members?.length || 5}/5):</span>
                            </span>
                            <span className="text-[10px] font-mono text-cyan-400 group-hover:underline flex items-center gap-1">
                              <span>Click to inspect team roster</span>
                              <ChevronRight className="w-3 h-3" />
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            {team.members && team.members.length > 0 ? (
                              team.members.map((m, mIdx) => (
                                <span
                                  key={m.uid || mIdx}
                                  onClick={(e) => {
                                    if (onSelectPlayerProfile && m.uid) {
                                      e.stopPropagation();
                                      onSelectPlayerProfile(m.uid);
                                    }
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-neutral-900/90 border border-neutral-800 text-xs font-mono text-slate-300 hover:text-white hover:border-cyan-500/40 transition-colors flex items-center gap-1.5"
                                >
                                  {m.role === 'captain' || m.uid === team.captainId ? (
                                    <span className="text-yellow-400 text-[10px]" title="Team Captain">👑</span>
                                  ) : (
                                    <span className="text-slate-500 text-[10px]">#{mIdx + 1}</span>
                                  )}
                                  <span className="font-bold">{m.gamerTag}</span>
                                </span>
                              ))
                            ) : (
                              <span className="text-xs text-slate-500 font-mono italic">
                                Active squad members registered
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* INDIVIDUAL RANKINGS (FC 26, FC 27, Chess) */
        <div className="space-y-6">
          {/* Frozen Past Season Banner Notice */}
          {isCurrentFrozen && currentViewSeason && (
            <div className="p-4 rounded-2xl bg-yellow-500/10 border border-yellow-500/30 flex items-center justify-between gap-4 text-xs font-mono text-yellow-300 shadow-md">
              <div className="flex items-center gap-2.5">
                <Crown className="w-5 h-5 text-yellow-400 shrink-0" />
                <div>
                  <span className="font-black text-yellow-400 uppercase tracking-wide">
                    ❄️ {currentViewSeason.name} Standings for {currentGameConfig.name} (Frozen)
                  </span>
                  <p className="text-[11px] text-slate-300 mt-0.5">
                    This competitive season has officially concluded. Rank #1 {currentGameConfig.name} champion has been permanently crowned in the Hall of Fame.
                  </p>
                </div>
              </div>
              {onNavigateToHallOfFame && (
                <button
                  onClick={onNavigateToHallOfFame}
                  className="px-3 py-1.5 rounded-xl bg-yellow-400 text-black font-black text-[11px] uppercase whitespace-nowrap hover:bg-yellow-300 transition-colors"
                >
                  View Hall of Fame
                </button>
              )}
            </div>
          )}

          {loading ? (
            <div className="py-24 text-center">
              <div className="inline-block w-8 h-8 border-3 border-cyan-400 border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-slate-400 text-xs font-mono">Fetching latest {currentGameConfig.name} standings...</p>
            </div>
          ) : filteredEntries.length === 0 ? (
          <div className="py-16 text-center bg-[#0a0a0f] border border-slate-800 rounded-2xl p-8 shadow-xl">
            <Trophy className="w-12 h-12 text-slate-600 mx-auto mb-3" />
            <h3 className="text-lg font-bold font-display text-white">No {currentGameConfig.name} Matches Recorded</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto mt-1">
              {selectedSeasonId !== 'ALL_TIME'
                ? `No matches have been recorded yet for ${currentGameConfig.name} in this season. Be the first to play!`
                : `Play the first verified competitive ${currentGameConfig.name} match in Nexus Gaming Center to claim the #1 spot!`}
            </p>
          </div>
        ) : (
          <>
            {/* Top 3 Podium with Game Specific Badges */}
            {topThree.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              {/* Silver (2nd) */}
              {topThree[1] && (() => {
                const totalMatches = Math.max(topThree[1].gamesPlayed || 0, topThree[1].placementGames || 0);
                const isUnranked = totalMatches < 10;
                const tier = getRankFromMMR(topThree[1].rating);
                const streak = topThree[1].currentWinStreak || 0;
                return (
                  <div
                    onClick={() => onSelectPlayerProfile?.(topThree[1].playerId)}
                    className={`order-2 md:order-1 bg-[#0a0a0f] border ${
                      isUnranked ? 'border-yellow-500/40' : tier.borderColorClass
                    } rounded-2xl p-6 text-center cursor-pointer transition-all hover:scale-[1.02] flex flex-col justify-between relative group shadow-xl`}
                  >
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-slate-800 border border-slate-600 text-slate-200 text-xs font-mono font-bold flex items-center gap-1 shadow-sm">
                      🥈 RANK 02
                    </div>
                    <div className="pt-2">
                      <div className="w-16 h-16 mx-auto mb-3 rounded-2xl bg-[#0e0e14] border border-slate-700 flex items-center justify-center p-1 group-hover:border-cyan-400 transition-colors">
                        <WinStreakAvatarWrapper streak={streak}>
                          <RankEmblem tier={tier} gameId={selectedGameId} sizeClass="w-14 h-14" isUnranked={isUnranked} />
                        </WinStreakAvatarWrapper>
                      </div>
                      <h3 className="text-lg font-bold font-display text-white truncate">
                        {topThree[1].gamerTag}
                      </h3>
                      {topThree[1].fullName ? <p className="text-xs text-slate-400">{topThree[1].fullName}</p> : null}
                      <div className="mt-2">
                        {isUnranked ? (
                          <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded bg-yellow-500/15 text-yellow-400 border border-yellow-500/30">
                            UNRANKED ({totalMatches}/10)
                          </span>
                        ) : (
                          <span className={`text-[11px] font-mono font-black uppercase px-2.5 py-1 rounded-full ${tier.badgeBgClass} ${tier.textColorClass} border ${tier.borderColorClass}`}>
                            {tier.gameCustomTitles?.[selectedGameId] || tier.name}
                          </span>
                        )}
                      </div>
                      {streak >= 3 && (
                        <div className="mt-2 flex justify-center">
                          <WinStreakBadge streak={streak} size="sm" />
                        </div>
                      )}
                    </div>
                    <div className="mt-4 pt-4 border-t border-slate-800">
                      <div className="text-2xl font-black font-display text-white font-mono-numbers">
                        {topThree[1].rating}{' '}
                        <span className="text-xs font-normal text-slate-400 font-mono">MMR</span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-1 font-mono">
                        {topThree[1].wins}W — {topThree[1].losses}L ({topThree[1].winRate}% WR)
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Gold (1st) */}
              {topThree[0] && (() => {
                const totalMatches = Math.max(topThree[0].gamesPlayed || 0, topThree[0].placementGames || 0);
                const isUnranked = totalMatches < 10;
                const tier = getRankFromMMR(topThree[0].rating);
                const streak = topThree[0].currentWinStreak || 0;
                return (
                  <div
                    onClick={() => onSelectPlayerProfile?.(topThree[0].playerId)}
                    className="order-1 md:order-2 bg-gradient-to-b from-[#15151b] via-[#0a0a0f] to-[#0a0a0f] border-2 border-yellow-500/60 hover:border-yellow-400 rounded-2xl p-6 text-center cursor-pointer transition-all hover:scale-[1.03] flex flex-col justify-between relative group shadow-[0_0_30px_rgba(234,179,8,0.15)]"
                  >
                    <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-0.5 rounded-full bg-yellow-500 text-black text-xs font-mono font-black flex items-center gap-1 shadow-md uppercase tracking-wider">
                      👑 RANK 01 {isCurrentFrozen ? 'CROWNED CHAMPION' : 'LEADER'}
                    </div>
                    <div className="pt-2">
                      <div className="w-18 h-18 mx-auto mb-3 rounded-2xl bg-yellow-500/10 border-2 border-yellow-500/60 flex items-center justify-center p-1 group-hover:scale-105 transition-transform shadow-[0_0_15px_rgba(234,179,8,0.3)]">
                        <WinStreakAvatarWrapper streak={streak}>
                          <RankEmblem tier={tier} gameId={selectedGameId} sizeClass="w-16 h-16" isUnranked={isUnranked} />
                        </WinStreakAvatarWrapper>
                      </div>
                      <h3 className="text-xl font-bold font-display text-white truncate">
                        {topThree[0].gamerTag}
                      </h3>
                      {topThree[0].fullName ? <p className="text-xs text-slate-400">{topThree[0].fullName}</p> : null}
                      <div className="mt-2">
                        {isUnranked ? (
                          <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded bg-yellow-500/15 text-yellow-400 border border-yellow-500/30">
                            UNRANKED ({totalMatches}/10)
                          </span>
                        ) : (
                          <span className={`text-xs font-mono font-black uppercase px-3 py-1 rounded-full ${tier.badgeBgClass} ${tier.textColorClass} border ${tier.borderColorClass}`}>
                            {tier.gameCustomTitles?.[selectedGameId] || tier.name}
                          </span>
                        )}
                      </div>
                      {streak >= 3 && (
                        <div className="mt-2 flex justify-center">
                          <WinStreakBadge streak={streak} size="md" />
                        </div>
                      )}
                    </div>
                    <div className="mt-4 pt-4 border-t border-yellow-500/20">
                      <div className="text-3xl font-black font-display text-yellow-400 font-mono-numbers">
                        {topThree[0].rating}{' '}
                        <span className="text-xs font-normal text-slate-400 font-mono">MMR</span>
                      </div>
                      <div className="text-xs text-yellow-200/90 mt-1 font-semibold font-mono">
                        {topThree[0].wins}W — {topThree[0].losses}L ({topThree[0].winRate}% Win Rate)
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Bronze (3rd) */}
              {topThree[2] && (() => {
                const totalMatches = Math.max(topThree[2].gamesPlayed || 0, topThree[2].placementGames || 0);
                const isUnranked = totalMatches < 10;
                const tier = getRankFromMMR(topThree[2].rating);
                const streak = topThree[2].currentWinStreak || 0;
                return (
                  <div
                    onClick={() => onSelectPlayerProfile?.(topThree[2].playerId)}
                    className={`order-3 md:order-3 bg-[#0a0a0f] border ${
                      isUnranked ? 'border-yellow-500/40' : tier.borderColorClass
                    } rounded-2xl p-6 text-center cursor-pointer transition-all hover:scale-[1.02] flex flex-col justify-between relative group shadow-xl`}
                  >
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-amber-950/80 border border-amber-800 text-amber-300 text-xs font-mono font-bold flex items-center gap-1 shadow-sm">
                      🥉 RANK 03
                    </div>
                    <div className="pt-2">
                      <div className="w-16 h-16 mx-auto mb-3 rounded-2xl bg-[#0e0e14] border border-amber-800/60 flex items-center justify-center p-1 group-hover:border-amber-600 transition-colors">
                        <WinStreakAvatarWrapper streak={streak}>
                          <RankEmblem tier={tier} gameId={selectedGameId} sizeClass="w-14 h-14" isUnranked={isUnranked} />
                        </WinStreakAvatarWrapper>
                      </div>
                      <h3 className="text-lg font-bold font-display text-white truncate">
                        {topThree[2].gamerTag}
                      </h3>
                      {topThree[2].fullName ? <p className="text-xs text-slate-400">{topThree[2].fullName}</p> : null}
                      <div className="mt-2">
                        {isUnranked ? (
                          <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded bg-yellow-500/15 text-yellow-400 border border-yellow-500/30">
                            UNRANKED ({totalMatches}/10)
                          </span>
                        ) : (
                          <span className={`text-[11px] font-mono font-black uppercase px-2.5 py-1 rounded-full ${tier.badgeBgClass} ${tier.textColorClass} border ${tier.borderColorClass}`}>
                            {tier.gameCustomTitles?.[selectedGameId] || tier.name}
                          </span>
                        )}
                      </div>
                      {streak >= 3 && (
                        <div className="mt-2 flex justify-center">
                          <WinStreakBadge streak={streak} size="sm" />
                        </div>
                      )}
                    </div>
                    <div className="mt-4 pt-4 border-t border-slate-800">
                      <div className="text-2xl font-black font-display text-white font-mono-numbers">
                        {topThree[2].rating}{' '}
                        <span className="text-xs font-normal text-slate-400 font-mono">MMR</span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-1 font-mono">
                        {topThree[2].wins}W — {topThree[2].losses}L ({topThree[2].winRate}% WR)
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Full Table */}
          <div className="bg-[#0a0a0f] border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 bg-[#050507] text-slate-400 uppercase tracking-wider font-semibold">
                    <th className="py-3.5 px-4 text-center w-16">Rank</th>
                    <th className="py-3.5 px-4">Gamer Tag & Tier</th>
                    <th className="py-3.5 px-4 text-right">Game MMR</th>
                    <th className="py-3.5 px-4 text-center">Matches</th>
                    <th className="py-3.5 px-4 text-center">W / L / D</th>
                    <th className="py-3.5 px-4 text-right">Win Rate</th>
                    <th className="py-3.5 px-4 text-center w-12"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredEntries.map((entry) => {
                    const totalMatches = Math.max(entry.gamesPlayed || 0, entry.placementGames || 0);
                    const isUnranked = totalMatches < 10;
                    const rowTier = getRankFromMMR(entry.rating);
                    return (
                      <tr
                        key={`${entry.playerId}_${entry.rank}`}
                        onClick={() => onSelectPlayerProfile?.(entry.playerId)}
                        className="hover:bg-slate-900/40 cursor-pointer transition-colors group"
                      >
                        <td className="py-3.5 px-4 text-center font-display font-black text-sm">
                          {entry.rank === 1 ? (
                            <span className="inline-block px-2 py-0.5 rounded bg-yellow-500 text-black font-black">
                              01
                            </span>
                          ) : entry.rank === 2 ? (
                            <span className="inline-block px-2 py-0.5 rounded bg-slate-600 text-white font-bold">
                              02
                            </span>
                          ) : entry.rank === 3 ? (
                            <span className="inline-block px-2 py-0.5 rounded bg-amber-800 text-white font-bold">
                              03
                            </span>
                          ) : (
                            <span className="text-slate-500 font-mono">
                              {entry.rank < 10 ? `0${entry.rank}` : entry.rank}
                            </span>
                          )}
                        </td>

                        <td className="py-3.5 px-4 font-semibold text-white">
                          <div className="flex items-center gap-2.5">
                            <WinStreakAvatarWrapper streak={entry.currentWinStreak || 0}>
                              <RankEmblem tier={rowTier} gameId={selectedGameId} sizeClass="w-9 h-9" isUnranked={isUnranked} />
                            </WinStreakAvatarWrapper>
                            <div>
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="group-hover:text-cyan-400 transition-colors font-display font-bold text-sm">
                                  {entry.gamerTag}
                                </span>
                                {isUnranked ? (
                                  <>
                                    <span className="text-[9px] font-mono font-black uppercase px-1.5 py-0.5 rounded bg-yellow-500/15 text-yellow-400 border border-yellow-500/30">
                                      ⚪ UNRANKED
                                    </span>
                                    <span className="text-[8px] font-mono font-bold uppercase px-1.5 py-0.5 rounded bg-slate-800/80 text-slate-400 border border-slate-700/60">
                                      {entry.gamesPlayed}/10 PLACEMENTS
                                    </span>
                                  </>
                                ) : (
                                  <span
                                    className={`text-[9px] font-mono font-bold uppercase px-2 py-0.5 rounded ${rowTier.badgeBgClass} ${rowTier.textColorClass} border ${rowTier.borderColorClass}`}
                                  >
                                    {rowTier.gameCustomTitles?.[selectedGameId] || rowTier.name}
                                  </span>
                                )}
                                {(entry.currentWinStreak || 0) >= 3 && (
                                  <WinStreakBadge streak={entry.currentWinStreak || 0} size="sm" />
                                )}
                              </div>
                                {entry.fullName ? (
                                  <div className="text-[11px] text-slate-500 font-normal">{entry.fullName}</div>
                                ) : null}
                            </div>
                          </div>
                        </td>

                        <td className="py-3.5 px-4 text-right font-display font-black text-base text-cyan-400 font-mono-numbers">
                          {entry.rating}
                        </td>

                        <td className="py-3.5 px-4 text-center font-mono text-slate-300">
                          {entry.gamesPlayed}
                        </td>

                        <td className="py-3.5 px-4 text-center font-mono">
                          <span className="text-emerald-400 font-bold">{entry.wins}W</span>{' '}
                          <span className="text-slate-600">/</span>{' '}
                          <span className="text-red-400 font-bold">{entry.losses}L</span>{' '}
                          <span className="text-slate-600">/</span>{' '}
                          <span className="text-slate-400">{entry.draws}D</span>
                        </td>

                        <td className="py-3.5 px-4 text-right font-mono font-bold">
                          <span
                            className={
                              entry.winRate >= 60
                                ? 'text-emerald-400'
                                : entry.winRate >= 45
                                ? 'text-yellow-400'
                                : 'text-slate-400'
                            }
                          >
                            {entry.winRate}%
                          </span>
                        </td>

                        <td className="py-3.5 px-4 text-center text-slate-500 group-hover:text-cyan-400 transition-colors">
                          <ChevronRight className="w-4 h-4" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )}

      {/* Team Roster Dossier Modal */}
      {selectedTeam && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn"
          onClick={() => setSelectedTeam(null)}
        >
          <div
            className="bg-[#0a0a0f] border border-cyan-500/40 rounded-3xl max-w-xl w-full p-6 space-y-5 shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-500/30 text-[10px] font-mono font-bold uppercase">
                    5v5 {selectedTeam.gameId?.toUpperCase()} SQUAD
                  </span>
                  {(selectedTeam.currentStreak || 0) >= 3 && (
                    <span className="px-2 py-0.5 rounded bg-orange-500/20 text-orange-400 border border-orange-500/30 text-[10px] font-mono font-bold flex items-center gap-1">
                      <Flame className="w-3 h-3 fill-orange-400" />
                      <span>{selectedTeam.currentStreak} Streak</span>
                    </span>
                  )}
                </div>
                <h3 className="text-2xl font-black font-display text-white flex items-center gap-2">
                  <span>{selectedTeam.teamName}</span>
                  <span className="text-cyan-400 font-mono text-lg">[{selectedTeam.teamTag}]</span>
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTeam(null)}
                className="p-1 rounded-xl bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Team MMR and Rank Banner */}
            {(() => {
              const tier = getRankFromMMR(selectedTeam.teamRating);
              return (
                <div className="p-4 rounded-2xl bg-neutral-900 border border-neutral-800 flex items-center justify-between font-mono">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase block">Official Team MMR</span>
                    <span className="text-2xl font-black text-cyan-400">{selectedTeam.teamRating}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 uppercase block">Rank Classification</span>
                    <span className={`text-base font-black ${tier.textColorClass}`}>
                      {tier.gameCustomTitles?.[selectedTeam.gameId] || `${tier.icon} ${tier.name}`}
                    </span>
                  </div>
                </div>
              );
            })()}

            {/* Stats Summary */}
            <div className="grid grid-cols-3 gap-3 font-mono text-center">
              <div className="p-3 rounded-xl bg-neutral-950 border border-neutral-800">
                <span className="text-[10px] text-slate-500 uppercase block">Matches</span>
                <span className="text-base font-black text-white">{selectedTeam.matchesPlayed}</span>
              </div>
              <div className="p-3 rounded-xl bg-neutral-950 border border-neutral-800">
                <span className="text-[10px] text-slate-500 uppercase block">Record</span>
                <span className="text-base font-black text-emerald-400">{selectedTeam.wins}W</span>{' '}
                <span className="text-xs text-red-400 font-bold">{selectedTeam.losses}L</span>
              </div>
              <div className="p-3 rounded-xl bg-neutral-950 border border-neutral-800">
                <span className="text-[10px] text-slate-500 uppercase block">Win Rate</span>
                <span className="text-base font-black text-yellow-400">
                  {selectedTeam.matchesPlayed > 0 ? Math.round((selectedTeam.wins / selectedTeam.matchesPlayed) * 100) : 0}%
                </span>
              </div>
            </div>

            {/* Official Members Roster List */}
            <div className="space-y-2">
              <span className="text-xs font-mono font-bold uppercase text-slate-400 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-cyan-400" />
                <span>Active 5v5 Roster Members ({selectedTeam.members?.length || 5}/5)</span>
              </span>

              <div className="space-y-1.5">
                {selectedTeam.members && selectedTeam.members.length > 0 ? (
                  selectedTeam.members.map((m, idx) => (
                    <div
                      key={m.uid || idx}
                      className="p-3 rounded-xl bg-neutral-950 border border-neutral-850 flex items-center justify-between text-xs font-mono"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="w-6 h-6 rounded bg-neutral-900 border border-neutral-800 text-neutral-400 flex items-center justify-center text-[10px] font-bold">
                          {idx + 1}
                        </span>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-white text-sm">{m.gamerTag}</span>
                            {(m.role === 'captain' || m.uid === selectedTeam.captainId) && (
                              <span className="px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 text-[9px] font-bold">
                                👑 CAPTAIN
                              </span>
                            )}
                          </div>
                          {m.joinedAt && (
                            <span className="text-[10px] text-slate-500">
                              Joined {new Date(m.joinedAt).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>

                      {onSelectPlayerProfile && m.uid && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedTeam(null);
                            onSelectPlayerProfile(m.uid);
                          }}
                          className="px-2.5 py-1 rounded bg-neutral-800 hover:bg-cyan-500/20 text-slate-300 hover:text-cyan-400 transition-colors text-[10px] font-bold uppercase"
                        >
                          View Profile
                        </button>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="p-4 text-center text-xs text-slate-500 font-mono italic bg-neutral-950 rounded-xl">
                    Captain: {selectedTeam.captainName}
                  </div>
                )}
              </div>
            </div>

            <div className="pt-2 text-right">
              <button
                type="button"
                onClick={() => setSelectedTeam(null)}
                className="px-5 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-xs font-mono font-bold text-white transition-colors"
              >
                Close Dossier
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
