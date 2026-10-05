import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  NEXUS_RANK_TIERS,
  getRankFromMMR,
  getRankProgress,
  COMPETITIVE_GAMES,
  getGameConfig,
  SupportedGameId,
} from '../lib/ranks';
import { fetchPlayerGameRatings, fetchLeaderboard } from '../services/playerService';
import { PlayerGameRating } from '../types';
import {
  Trophy,
  Swords,
  Shield,
  ArrowUpRight,
  TrendingUp,
  Sparkles,
  Layers,
  CheckCircle2,
  Users,
  User,
  Zap,
} from 'lucide-react';
import { WinStreakBadge } from './WinStreakFire';
import { RankEmblem, UnrankedEmblem } from './NexusRankBadge';

interface HowRankingWorksViewProps {
  onOpenAuth?: (mode?: 'login' | 'register') => void;
  onOpenCreateMatch?: () => void;
  onSelectGameLeaderboard?: (gameId?: string) => void;
}

export const HowRankingWorksView: React.FC<HowRankingWorksViewProps> = ({
  onOpenAuth,
  onOpenCreateMatch,
  onSelectGameLeaderboard,
}) => {
  const { user, playerProfile } = useAuth();

  const [selectedGameId, setSelectedGameId] = useState<SupportedGameId>('chess');
  const [gameRatings, setGameRatings] = useState<PlayerGameRating[]>([]);
  const [userRank, setUserRank] = useState<number | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Load user's ratings across games
  useEffect(() => {
    async function loadData() {
      if (!user) {
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        const ratings = await fetchPlayerGameRatings(user.uid);
        setGameRatings(ratings);
      } catch (err) {
        console.error('Error loading ranking data:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [user]);

  // Determine user's standing in the selected game
  const activeRatingData = React.useMemo(() => {
    const gameConfig = getGameConfig(selectedGameId);
    if (!user) {
      return {
        gameName: gameConfig.name,
        rating: 1000,
        gamesPlayed: 0,
        isUnranked: true,
        placementGames: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        streak: 0,
      };
    }

    const specific = gameRatings.find((r) => r.gameId === selectedGameId);
    const rating = specific?.rating || 1000;
    const gamesPlayed = specific ? Math.max(specific.gamesPlayed || 0, specific.placementGames || 0) : 0;
    const isUnranked = specific ? gamesPlayed < 10 : true;

    return {
      gameName: gameConfig.name,
      rating,
      gamesPlayed,
      isUnranked,
      placementGames: Math.min(10, gamesPlayed),
      wins: specific?.wins || 0,
      losses: specific?.losses || 0,
      draws: specific?.draws || 0,
      streak: specific?.currentWinStreak || 0,
    };
  }, [selectedGameId, gameRatings, user]);

  // Fetch leaderboard rank for the active selection
  useEffect(() => {
    async function loadRank() {
      if (!user) {
        setUserRank(null);
        return;
      }
      try {
        const lb = await fetchLeaderboard({ gameIdFilter: selectedGameId });
        const playerEntryIndex = lb.findIndex((entry) => entry.playerId === user.uid);
        if (playerEntryIndex !== -1) {
          setUserRank(playerEntryIndex + 1);
        } else {
          setUserRank(null);
        }
      } catch (err) {
        console.error('Failed to get rank:', err);
      }
    }
    loadRank();
  }, [selectedGameId, user]);

  const currentGameConfig = getGameConfig(selectedGameId);
  const activeLevel = getRankFromMMR(activeRatingData.rating);
  const activeProgress = getRankProgress(activeRatingData.rating);

  // Ladder displayed from Challenger (Order 7) down to Bronze (Order 1)
  const ladderLevels = React.useMemo(() => {
    return [...NEXUS_RANK_TIERS].reverse();
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-12 animate-fade-in">
      {/* Hero Header */}
      <div className="relative overflow-hidden rounded-3xl bg-[#0a0a0f] border border-slate-800 p-8 sm:p-12 shadow-2xl text-center">
        <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-3xl mx-auto space-y-4">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-mono font-bold tracking-wider uppercase">
            <TrendingUp className="w-4 h-4" />
            <span>INDEPENDENT COMPETITIVE MMR TIERS</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-black font-display tracking-tight text-white uppercase">
            HOW NEXUS RANKING WORKS
          </h1>

          <p className="text-sm sm:text-base text-slate-300 max-w-2xl mx-auto leading-relaxed">
            Every game in Nexus Gaming Center has its own completely independent competitive rating. Performance in one game never impacts another. Explore the unique badge systems for Chess, FC 26, FC 27, Valorant, and CS2 below.
          </p>
        </div>
      </div>

      {/* GAME TABS (Select which game's badges & rules to inspect) */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 p-2 rounded-2xl bg-[#09090e] border border-slate-800 shadow-lg">
        {COMPETITIVE_GAMES.map((game) => {
          const isSelected = selectedGameId === game.id;
          return (
            <button
              key={game.id}
              onClick={() => setSelectedGameId(game.id)}
              className={`px-3 py-3 rounded-xl flex flex-col items-center text-center transition-all ${
                isSelected
                  ? 'bg-gradient-to-b from-cyan-950/80 to-slate-900 border-2 border-cyan-400 text-white shadow-[0_0_20px_rgba(34,211,238,0.25)]'
                  : 'bg-[#121218]/80 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
              }`}
            >
              <div className="text-2xl mb-1">{game.icon}</div>
              <span className={`font-display font-black text-xs uppercase tracking-wider ${isSelected ? 'text-cyan-300' : 'text-slate-300'}`}>
                {game.name}
              </span>
              <div className="flex items-center gap-1 mt-1">
                <span
                  className={`text-[9px] font-mono px-1.5 py-0.5 rounded font-bold uppercase ${
                    game.matchFormat === '1v1'
                      ? 'bg-indigo-950 text-indigo-300 border border-indigo-500/30'
                      : 'bg-emerald-950 text-emerald-300 border border-emerald-500/30'
                  }`}
                >
                  {game.matchFormat}
                </span>
                <span className="text-[9px] font-mono text-slate-500 uppercase">
                  {game.category}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* GAME BADGE THEME SPOTLIGHT */}
      <div className="p-6 rounded-3xl bg-[#0e0e16] border border-slate-800 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-cyan-950/40 border border-cyan-500/40 flex items-center justify-center text-3xl shadow-[0_0_20px_rgba(34,211,238,0.2)]">
            {currentGameConfig.icon}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-black font-display text-white">
                {currentGameConfig.name} Visual Identity & Ranks
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-cyan-950 text-cyan-400 border border-cyan-500/40">
                {currentGameConfig.matchFormat} Standard
              </span>
            </div>
            <p className="text-xs sm:text-sm text-cyan-400 font-medium mt-1">
              Badge Theme: {currentGameConfig.badgeThemeName}
            </p>
            <p className="text-xs text-slate-400 mt-0.5 max-w-2xl">
              {currentGameConfig.badgeThemeDescription}
            </p>
          </div>
        </div>

        {onSelectGameLeaderboard && (
          <button
            onClick={() => onSelectGameLeaderboard(selectedGameId)}
            className="px-4 py-2.5 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-black font-black text-xs font-mono uppercase tracking-wider flex items-center gap-2 shrink-0 transition-all shadow-md"
          >
            <span>View {currentGameConfig.name} Leaderboard</span>
            <ArrowUpRight className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* CURRENT PLAYER STANDING IN THIS GAME */}
      {user && (
        <div className="rounded-3xl bg-[#0e0e14] border border-slate-800 p-6 sm:p-8 shadow-xl relative overflow-hidden">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-800/80 pb-6">
            <div>
              <div className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-cyan-400" />
                <span>YOUR CURRENT {currentGameConfig.name.toUpperCase()} STANDING</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-bold font-display text-white mt-1">
                {playerProfile?.gamerTag || 'Competitor'} • {currentGameConfig.name}
              </h2>
            </div>

            <div className="flex items-center gap-2">
              {userRank !== null ? (
                <div className="px-3.5 py-1.5 rounded-xl bg-cyan-950/60 border border-cyan-500/40 text-cyan-400 text-xs font-mono font-bold flex items-center gap-1.5 shadow-sm">
                  <Trophy className="w-3.5 h-3.5" />
                  <span>Leaderboard Rank #{userRank}</span>
                </div>
              ) : (
                <div className="px-3.5 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 text-xs font-mono font-medium">
                  Unranked on Official Board
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-6 items-center">
            {/* Left: Rank Badge Artwork */}
            <div className="lg:col-span-5 flex items-center gap-5">
              <div className="relative shrink-0">
                <div
                  className="absolute inset-0 rounded-2xl blur-lg opacity-40"
                  style={{ backgroundColor: activeRatingData.isUnranked ? '#eab308' : activeLevel.colorHex }}
                />
                <RankEmblem
                  tier={activeLevel}
                  gameId={selectedGameId}
                  sizeClass="w-24 h-24"
                  isUnranked={activeRatingData.isUnranked}
                />
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-mono font-black uppercase tracking-wider ${
                      activeRatingData.isUnranked
                        ? 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30'
                        : `${activeLevel.badgeBgClass} ${activeLevel.textColorClass} border ${activeLevel.borderColorClass}`
                    }`}
                  >
                    {activeRatingData.isUnranked ? 'UNRANKED' : activeLevel.name}
                  </span>
                  {activeRatingData.streak >= 3 && (
                    <WinStreakBadge streak={activeRatingData.streak} size="sm" />
                  )}
                </div>

                <div className="text-2xl sm:text-3xl font-black font-display text-white mt-1">
                  {activeRatingData.isUnranked
                    ? 'Provisional Calibration'
                    : activeLevel.gameCustomTitles?.[selectedGameId] || activeLevel.name}
                </div>

                <div className="text-xs font-mono text-slate-400 mt-0.5">
                  {activeRatingData.isUnranked
                    ? `${activeRatingData.placementGames}/10 Matches Completed`
                    : `${activeRatingData.rating} MMR (${activeLevel.division})`}
                </div>
              </div>
            </div>

            {/* Right: MMR Progress & Stats */}
            <div className="lg:col-span-7 space-y-4">
              {activeRatingData.isUnranked ? (
                <div className="p-4 rounded-2xl bg-yellow-500/10 border border-yellow-500/30 text-xs font-mono space-y-2">
                  <div className="flex justify-between font-bold text-yellow-400">
                    <span>10 Placement Calibration Matches Required</span>
                    <span>{activeRatingData.placementGames} / 10 Completed</span>
                  </div>
                  <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                    <div
                      className="h-full bg-yellow-500 rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, (activeRatingData.placementGames / 10) * 100)}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-slate-300">
                    Complete 10 verified matches in {currentGameConfig.name} to lock in your initial official competitive MMR.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-slate-400">
                      {activeProgress.nextTier ? `Progress to ${activeProgress.nextTier.name}` : 'Pinnacle Achievement'}
                    </span>
                    <span className="text-white font-bold">
                      {activeProgress.nextTier ? `${activeProgress.pointsToNext} MMR to Tier Up` : 'MAX TIER'}
                    </span>
                  </div>

                  <div className="w-full h-2.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                    <div
                      className={`h-full ${activeLevel.accentBg} transition-all duration-500 rounded-full`}
                      style={{ width: `${activeProgress.progressPercent}%` }}
                    />
                  </div>

                  <div className="flex justify-between text-[10px] font-mono text-slate-400">
                    <span>{activeLevel.minMMR} MMR</span>
                    <span>{activeProgress.nextTier ? `${activeProgress.nextTier.minMMR} MMR` : '2000+ MMR'}</span>
                  </div>
                </div>
              )}

              {/* Quick Mini Stats */}
              <div className="grid grid-cols-3 gap-3 pt-2 text-center font-mono">
                <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/80">
                  <div className="text-slate-400 text-[10px] uppercase font-bold">Matches</div>
                  <div className="text-white font-bold text-sm mt-0.5">{activeRatingData.gamesPlayed}</div>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/80">
                  <div className="text-slate-400 text-[10px] uppercase font-bold">W / L / D</div>
                  <div className="text-white font-bold text-sm mt-0.5">
                    <span className="text-emerald-400">{activeRatingData.wins}</span>-
                    <span className="text-red-400">{activeRatingData.losses}</span>-
                    <span className="text-slate-400">{activeRatingData.draws}</span>
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/80">
                  <div className="text-slate-400 text-[10px] uppercase font-bold">Win Rate</div>
                  <div className="text-cyan-400 font-bold text-sm mt-0.5">
                    {activeRatingData.gamesPlayed > 0
                      ? `${Math.round((activeRatingData.wins / activeRatingData.gamesPlayed) * 100)}%`
                      : '0%'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* COMPLETE TIER LADDER SHOWCASE FOR THE SELECTED GAME */}
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 border-b border-slate-800 pb-4">
          <div>
            <div className="text-xs font-mono font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-2">
              <Layers className="w-4 h-4" />
              <span>THE 7 COMPETITIVE DIVISIONS</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black font-display text-white mt-1 uppercase">
              {currentGameConfig.name} Tier Ladder
            </h2>
          </div>
          <span className="text-xs font-mono text-slate-400">
            From Bronze (0 MMR) to Challenger (2000+ MMR)
          </span>
        </div>

        <div className="space-y-4">
          {ladderLevels.map((tier) => {
            const isUserCurrent = !activeRatingData.isUnranked && activeLevel.id === tier.id;
            const customTitle = tier.gameCustomTitles?.[selectedGameId] || tier.name;
            const customDesc = tier.gameCustomDescriptions?.[selectedGameId] || tier.description;

            return (
              <div
                key={tier.id}
                className={`relative overflow-hidden rounded-2xl border transition-all p-5 sm:p-6 bg-[#0a0a0f] ${
                  isUserCurrent
                    ? `border-cyan-400 shadow-[0_0_25px_rgba(34,211,238,0.2)] scale-[1.01]`
                    : `${tier.borderColorClass} hover:border-slate-600`
                }`}
              >
                {/* Background Ambient Glow */}
                <div
                  className={`absolute top-0 right-0 w-80 h-full bg-gradient-to-l ${tier.bgGlowClass} pointer-events-none opacity-40`}
                />

                <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  {/* Left: Emblem + Tier Name & Description */}
                  <div className="flex items-center gap-4 sm:gap-6 flex-1 min-w-0">
                    <div className="relative shrink-0">
                      <RankEmblem tier={tier} gameId={selectedGameId} sizeClass="w-16 h-16 sm:w-20 sm:h-20" />
                    </div>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-xs font-mono font-black uppercase tracking-wider ${tier.badgeBgClass} ${tier.textColorClass} border ${tier.borderColorClass}`}
                        >
                          {tier.name}
                        </span>
                        <span className="text-xs font-mono font-bold text-slate-500 uppercase">
                          {tier.division}
                        </span>
                        {isUserCurrent && (
                          <span className="px-2 py-0.5 rounded-full bg-cyan-400 text-black text-[10px] font-mono font-black uppercase tracking-wider shadow-sm animate-pulse">
                            YOU ARE HERE
                          </span>
                        )}
                      </div>

                      <h3 className="text-lg sm:text-xl font-bold font-display text-white mt-1 truncate">
                        {customTitle}
                      </h3>

                      <p className="text-xs text-slate-400 mt-1 max-w-xl line-clamp-2">
                        {customDesc}
                      </p>
                    </div>
                  </div>

                  {/* Right: MMR Range */}
                  <div className="text-left sm:text-right shrink-0">
                    <div className="text-xs font-mono text-slate-500 uppercase">Threshold</div>
                    <div className="text-lg sm:text-xl font-black font-display text-white font-mono-numbers mt-0.5">
                      {tier.rangeDisplay}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 1v1 VS 5v5 MATCH RULES & MMR INDEPENDENCE EXPLANATION */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
        {/* 1v1 Games Card */}
        <div className="p-6 rounded-3xl bg-[#0e0e14] border border-indigo-500/30 space-y-4 shadow-xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-950 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold font-display text-white">1v1 Match Rating Rules</h3>
              <span className="text-xs font-mono text-indigo-400">Chess • FC 26 • FC 27</span>
            </div>
          </div>

          <p className="text-xs text-slate-300 leading-relaxed">
            In 1v1 duels, MMR is calculated directly between the two competitors using the classic Elo probability distribution formula:
          </p>

          <ul className="text-xs font-mono space-y-2 text-slate-400">
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>Higher rated player risks more MMR against lower rated opponent.</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>Underdogs gain massive MMR bonus for defeating higher tiers.</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>Draws award balanced rating adjustments based on rating difference.</span>
            </li>
          </ul>
        </div>

        {/* 5v5 Team Games Card */}
        <div className="p-6 rounded-3xl bg-[#0e0e14] border border-emerald-500/30 space-y-4 shadow-xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-950 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold font-display text-white">5v5 Team Rating Rules</h3>
              <span className="text-xs font-mono text-emerald-400">Valorant • CS2</span>
            </div>
          </div>

          <p className="text-xs text-slate-300 leading-relaxed">
            In 5v5 team esports matches, team average MMR is dynamically computed from each player's game-specific rating:
          </p>

          <ul className="text-xs font-mono space-y-2 text-slate-400">
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>Team A Average MMR vs Team B Average MMR determines win expectancy.</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>All 5 players on the winning roster receive equal team MMR boost.</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>Only the specific game's MMR is updated (Valorant never touches CS2).</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};
