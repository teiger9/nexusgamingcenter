import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { subscribeToPlayerMatches } from '../services/matchService';
import { Match } from '../types';
import { getRankFromMMR } from '../lib/ranks';
import { HomeRecentMatchesFeed } from './HomeRecentMatchesFeed';
import { CurrentSeasonBanner } from './CurrentSeasonBanner';
import {
  Swords,
  Trophy,
  Users,
  Gift,
  Flame,
  ArrowRight,
  Radio,
  Coins,
  ShieldAlert,
  Calendar,
  Megaphone,
  Gamepad2,
  Shield,
  Activity,
  Zap,
  BarChart3,
} from 'lucide-react';

interface PlayerDashboardProps {
  onOpenCreateMatch: () => void;
  onSelectTab: (tab: string) => void;
  onSelectMatch: (matchId: string) => void;
  onOpenAdminSetup?: () => void;
  onOpenRankingGuide?: () => void;
  onNavigateToTournaments?: (tournamentId?: string) => void;
}

export const PlayerDashboard: React.FC<PlayerDashboardProps> = ({
  onSelectTab,
  onSelectMatch,
  onOpenAdminSetup,
  onOpenRankingGuide,
  onNavigateToTournaments,
}) => {
  const { user, playerProfile, hasAdminInSystem } = useAuth();
  const [activeMatch, setActiveMatch] = useState<Match | null>(null);
  const [recentMatches, setRecentMatches] = useState<Match[]>([]);

  useEffect(() => {
    if (!user) return;

    const unsub = subscribeToPlayerMatches(user.uid, (matches) => {
      const activeStatuses = [
        'READY_CHECK',
        'LIVE',
        'TEAM_ROSTERS_FILLING',
        'WAITING_FOR_ADMIN',
        'APPROVED',
        'PENDING',
        'AWAITING_CONFIRMATION',
        'DISPUTED',
      ];
      const live = matches.find((m) => activeStatuses.includes(m.status));
      setActiveMatch(live || null);
      setRecentMatches(matches.slice(0, 5));
    });

    return () => unsub();
  }, [user]);

  if (!user || !playerProfile) return null;

  const totalMatches = playerProfile.totalGames || 0;
  const isUnranked = totalMatches < 10;
  const rankTier = getRankFromMMR(playerProfile.overallRating || 1000);
  const coinsBalance = playerProfile.nexusCoins ?? (playerProfile as any).coins ?? 0;
  const winStreak = playerProfile.currentWinStreak ?? (playerProfile as any).winStreak ?? 0;

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-7 space-y-6 sm:space-y-7">
      {/* 0. Optional Compact Player Status / Admin Setup Alert */}
      {!hasAdminInSystem && onOpenAdminSetup && (
        <div className="flex items-center justify-between p-3 rounded-xl bg-red-950/40 border border-red-500/40 text-red-300">
          <div className="flex items-center gap-2.5 text-xs font-mono">
            <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
            <span>No administrator currently configured in this Nexus center installation.</span>
          </div>
          <button
            onClick={onOpenAdminSetup}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white transition-all text-xs font-bold uppercase tracking-wider cursor-pointer"
          >
            <span>Setup Admin Account</span>
          </button>
        </div>
      )}

      {/* 1. Active Match Banner (If Player Currently In Match) */}
      {activeMatch && (
        <div className="relative overflow-hidden rounded-xl bg-[#140c10] border border-red-500/60 p-4 sm:p-5 shadow-[0_0_25px_rgba(239,68,68,0.25)]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-lg bg-red-600/20 border border-red-500/60 flex items-center justify-center text-red-500 shadow-[0_0_15px_rgba(239,68,68,0.3)] shrink-0">
                <Radio className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-red-400">
                  MATCH IN PROGRESS · STATION {activeMatch.station || 'MAIN'}
                </span>
                <h3 className="text-base sm:text-lg font-bold font-display text-white">
                  {activeMatch.gameName} — {activeMatch.teamAName || activeMatch.playerAGamerTag}{' '}
                  <span className="text-zinc-500 font-normal">vs</span>{' '}
                  {activeMatch.teamBName || activeMatch.playerBGamerTag || 'Opponent'}
                </h3>
              </div>
            </div>

            <button
              onClick={() => onSelectMatch(activeMatch.id)}
              className="px-5 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer shadow-md transition-all active:scale-95"
            >
              <span>ENTER MATCH ROOM</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* A. 🏆 HALL OF FAME / SEASON PANEL */}
      <CurrentSeasonBanner
        onNavigateToLeaderboard={() => onSelectTab('leaderboard')}
        onNavigateToHallOfFame={() => onSelectTab('hall_of_fame')}
        onNavigateToRankingRules={onOpenRankingGuide}
      />

      {/* B. ⚡ QUICK ACTIONS (6 CARDS) */}
      <section>
        <div className="flex items-center gap-2 text-zinc-300 font-mono text-xs font-bold uppercase tracking-widest mb-3.5">
          <Zap className="w-4 h-4 text-cyan-400 fill-cyan-400/20" />
          <span>QUICK ACTIONS</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
          {/* 1. PLAY */}
          <button
            onClick={() => onSelectTab('play')}
            className="group relative p-4 rounded-xl bg-gradient-to-b from-[#0c121e] to-[#080d16] border border-slate-800/90 hover:border-cyan-500/50 hover:from-[#0e1626] hover:to-[#0a101c] text-left flex flex-col justify-between h-40 sm:h-44 cursor-pointer transition-all duration-200 shadow-md focus-visible:ring-2 focus-visible:ring-cyan-500"
          >
            <div className="flex items-center justify-between w-full">
              <div className="w-9 h-9 rounded-lg bg-cyan-950/70 border border-cyan-500/35 flex items-center justify-center text-cyan-400 group-hover:scale-105 transition-transform shrink-0">
                <Gamepad2 className="w-5 h-5" />
              </div>
              <span className="text-[10px] font-mono font-bold text-zinc-500 group-hover:text-cyan-400/80 transition-colors uppercase tracking-wider">
                1V1 &amp; 5V5
              </span>
            </div>
            <div>
              <h3 className="text-lg sm:text-xl font-black font-display tracking-wide text-white uppercase group-hover:text-cyan-300 transition-colors">
                PLAY
              </h3>
              <p className="text-xs text-zinc-400 mt-1 leading-snug line-clamp-2">
                Start 1v1 match or browse open squad lobbies
              </p>
            </div>
          </button>

          {/* 2. BOOKING */}
          <button
            onClick={() => onSelectTab('reservations')}
            className="group relative p-4 rounded-xl bg-gradient-to-b from-[#0c121e] to-[#080d16] border border-slate-800/90 hover:border-rose-500/50 hover:from-[#180e1a] hover:to-[#0d0914] text-left flex flex-col justify-between h-40 sm:h-44 cursor-pointer transition-all duration-200 shadow-md focus-visible:ring-2 focus-visible:ring-rose-500"
          >
            <div className="flex items-center justify-between w-full">
              <div className="w-9 h-9 rounded-lg bg-rose-950/70 border border-rose-500/35 flex items-center justify-center text-rose-400 group-hover:scale-105 transition-transform shrink-0">
                <Calendar className="w-4 h-4" />
              </div>
              <span className="text-[10px] font-mono font-bold text-zinc-500 group-hover:text-rose-400/80 transition-colors uppercase tracking-wider">
                PC ARENA
              </span>
            </div>
            <div>
              <h3 className="text-lg sm:text-xl font-black font-display tracking-wide text-white uppercase group-hover:text-rose-300 transition-colors">
                BOOKING
              </h3>
              <p className="text-xs text-zinc-400 mt-1 leading-snug line-clamp-2">
                Reserve PC Group Arena (8–10 PCs)
              </p>
            </div>
          </button>

          {/* 3. TOURNAMENTS */}
          <button
            onClick={() => {
              if (onNavigateToTournaments) onNavigateToTournaments();
              else onSelectTab('tournaments');
            }}
            className="group relative p-4 rounded-xl bg-gradient-to-b from-[#0c121e] to-[#080d16] border border-slate-800/90 hover:border-amber-500/50 hover:from-[#18140c] hover:to-[#0f0c08] text-left flex flex-col justify-between h-40 sm:h-44 cursor-pointer transition-all duration-200 shadow-md focus-visible:ring-2 focus-visible:ring-amber-500"
          >
            <div className="flex items-center justify-between w-full">
              <div className="w-9 h-9 rounded-lg bg-amber-950/70 border border-amber-500/35 flex items-center justify-center text-amber-400 group-hover:scale-105 transition-transform shrink-0">
                <Trophy className="w-4 h-4" />
              </div>
              <span className="text-[10px] font-mono font-bold text-zinc-500 group-hover:text-amber-400/80 transition-colors uppercase tracking-wider">
                EVENTS
              </span>
            </div>
            <div>
              <h3 className="text-lg sm:text-xl font-black font-display tracking-wide text-white uppercase group-hover:text-amber-300 transition-colors">
                TOURNAMENTS
              </h3>
              <p className="text-xs text-zinc-400 mt-1 leading-snug line-clamp-2">
                Official cups, brackets, and cash prizes
              </p>
            </div>
          </button>

          {/* 4. SQUADS */}
          <button
            onClick={() => onSelectTab('teams')}
            className="group relative p-4 rounded-xl bg-gradient-to-b from-[#0c121e] to-[#080d16] border border-slate-800/90 hover:border-purple-500/50 hover:from-[#150e20] hover:to-[#0d0916] text-left flex flex-col justify-between h-40 sm:h-44 cursor-pointer transition-all duration-200 shadow-md focus-visible:ring-2 focus-visible:ring-purple-500"
          >
            <div className="flex items-center justify-between w-full">
              <div className="w-9 h-9 rounded-lg bg-purple-950/70 border border-purple-500/35 flex items-center justify-center text-purple-400 group-hover:scale-105 transition-transform shrink-0">
                <Users className="w-4 h-4" />
              </div>
              <span className="text-[10px] font-mono font-bold text-zinc-500 group-hover:text-purple-400/80 transition-colors uppercase tracking-wider">
                5V5
              </span>
            </div>
            <div>
              <h3 className="text-lg sm:text-xl font-black font-display tracking-wide text-white uppercase group-hover:text-purple-300 transition-colors">
                SQUADS
              </h3>
              <p className="text-xs text-zinc-400 mt-1 leading-snug line-clamp-2">
                Form teams, invite friends, and coordinate
              </p>
            </div>
          </button>

          {/* 5. REWARDS */}
          <button
            onClick={() => onSelectTab('fidelity_card')}
            className="group relative p-4 rounded-xl bg-gradient-to-b from-[#0c121e] to-[#080d16] border border-slate-800/90 hover:border-emerald-500/50 hover:from-[#0d1c18] hover:to-[#081210] text-left flex flex-col justify-between h-40 sm:h-44 cursor-pointer transition-all duration-200 shadow-md focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            <div className="flex items-center justify-between w-full">
              <div className="w-9 h-9 rounded-lg bg-emerald-950/70 border border-emerald-500/35 flex items-center justify-center text-emerald-400 group-hover:scale-105 transition-transform shrink-0">
                <Gift className="w-4 h-4" />
              </div>
              <span className="text-[10px] font-mono font-bold text-zinc-500 group-hover:text-emerald-400/80 transition-colors uppercase tracking-wider">
                PERKS
              </span>
            </div>
            <div>
              <h3 className="text-lg sm:text-xl font-black font-display tracking-wide text-white uppercase group-hover:text-emerald-300 transition-colors">
                REWARDS
              </h3>
              <p className="text-xs text-zinc-400 mt-1 leading-snug line-clamp-2">
                Redeem Nexus Coins for free hours &amp; snacks
              </p>
            </div>
          </button>

          {/* 6. ANNOUNCEMENTS */}
          <button
            onClick={() => onSelectTab('announcements')}
            className="group relative p-4 rounded-xl bg-gradient-to-b from-[#0c121e] to-[#080d16] border border-slate-800/90 hover:border-red-500/50 hover:from-[#1c0f12] hover:to-[#12080a] text-left flex flex-col justify-between h-40 sm:h-44 cursor-pointer transition-all duration-200 shadow-md focus-visible:ring-2 focus-visible:ring-red-500"
          >
            <div className="flex items-center justify-between w-full">
              <div className="w-9 h-9 rounded-lg bg-red-950/70 border border-red-500/35 flex items-center justify-center text-red-400 group-hover:scale-105 transition-transform shrink-0">
                <Megaphone className="w-4 h-4" />
              </div>
              <span className="text-[10px] font-mono font-bold text-zinc-500 group-hover:text-red-400/80 transition-colors uppercase tracking-wider">
                BOARD
              </span>
            </div>
            <div>
              <h3 className="text-lg sm:text-xl font-black font-display tracking-wide text-white uppercase group-hover:text-red-300 transition-colors">
                ANNOUNCEMENTS
              </h3>
              <p className="text-xs text-zinc-400 mt-1 leading-snug line-clamp-2">
                Find players, recruit teammates, and organize games
              </p>
            </div>
          </button>
        </div>
      </section>

      {/* C. 📊 YOUR STATS (4 CARDS) */}
      <section>
        <div className="flex items-center gap-2 text-zinc-300 font-mono text-xs font-bold uppercase tracking-widest mb-3.5">
          <BarChart3 className="w-4 h-4 text-cyan-400" />
          <span>YOUR STATS</span>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* 1. YOUR RANK */}
          <button
            onClick={() => onSelectTab('profile')}
            className="p-4 sm:p-5 rounded-xl bg-gradient-to-b from-[#0c121e] to-[#080d16] border border-slate-800/90 hover:border-amber-500/40 transition-all flex items-center justify-between text-left group cursor-pointer shadow-md focus-visible:ring-2 focus-visible:ring-amber-500"
          >
            <div className="min-w-0 pr-2">
              <span className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider block">
                YOUR RANK
              </span>
              <div className="text-xl sm:text-2xl font-black font-display tracking-tight text-amber-400 uppercase mt-0.5 truncate">
                {isUnranked ? 'UNRANKED' : rankTier.name}
              </div>
              <span className="text-[11px] font-mono text-zinc-500 mt-0.5 block truncate">
                {isUnranked ? `${totalMatches}/10 placement games` : rankTier.division}
              </span>
            </div>

            <div className="w-11 h-11 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0 shadow-[0_0_15px_rgba(245,158,11,0.15)] group-hover:border-amber-400 transition-colors">
              <Shield className="w-5 h-5 fill-amber-500/20" />
            </div>
          </button>

          {/* 2. YOUR MMR */}
          <button
            onClick={() => onSelectTab('leaderboard')}
            className="p-4 sm:p-5 rounded-xl bg-gradient-to-b from-[#0c121e] to-[#080d16] border border-slate-800/90 hover:border-cyan-500/40 transition-all flex items-center justify-between text-left group cursor-pointer shadow-md focus-visible:ring-2 focus-visible:ring-cyan-500"
          >
            <div className="min-w-0 pr-2">
              <span className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider block">
                YOUR MMR
              </span>
              <div className="text-2xl sm:text-3xl font-black font-display text-white font-mono-numbers tracking-tight mt-0.5">
                {playerProfile.overallRating || 1000}
              </div>
              <span className="text-[11px] font-mono text-zinc-500 mt-0.5 block truncate">
                Global competitive rating
              </span>
            </div>

            <div className="w-11 h-11 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0 shadow-[0_0_15px_rgba(6,182,212,0.15)] group-hover:border-cyan-400 transition-colors">
              <Activity className="w-5 h-5" />
            </div>
          </button>

          {/* 3. YOUR NC */}
          <button
            onClick={() => onSelectTab('fidelity_card')}
            className="p-4 sm:p-5 rounded-xl bg-gradient-to-b from-[#0c121e] to-[#080d16] border border-slate-800/90 hover:border-rose-500/40 transition-all flex items-center justify-between text-left group cursor-pointer shadow-md focus-visible:ring-2 focus-visible:ring-rose-500"
          >
            <div className="min-w-0 pr-2">
              <span className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider block">
                YOUR NC
              </span>
              <div className="text-2xl sm:text-3xl font-black font-display text-rose-500 font-mono-numbers flex items-center gap-1.5 mt-0.5">
                <Coins className="w-5 h-5 text-rose-500 shrink-0" />
                <span>{coinsBalance}</span>
              </div>
              <span className="text-[11px] font-mono text-zinc-500 mt-0.5 block truncate">
                Nexus Coins balance
              </span>
            </div>

            <div className="w-11 h-11 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0 shadow-[0_0_15px_rgba(244,63,94,0.15)] group-hover:border-rose-400 transition-colors">
              <Coins className="w-5 h-5" />
            </div>
          </button>

          {/* 4. WIN STREAK */}
          <div className="p-4 sm:p-5 rounded-xl bg-gradient-to-b from-[#0c121e] to-[#080d16] border border-slate-800/90 flex items-center justify-between text-left shadow-md">
            <div className="min-w-0 pr-2">
              <span className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider block">
                WIN STREAK
              </span>
              <div className="text-2xl sm:text-3xl font-black font-display text-amber-500 font-mono-numbers flex items-center gap-1.5 mt-0.5">
                <Flame className={`w-5 h-5 ${winStreak > 0 ? 'text-amber-500 animate-pulse' : 'text-zinc-600'}`} />
                <span>{winStreak}</span>
              </div>
              <span className="text-[11px] font-mono text-zinc-500 mt-0.5 block truncate">
                {winStreak > 2 ? 'On a hot streak!' : 'Consecutive victories'}
              </span>
            </div>

            <div className="w-11 h-11 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500 shrink-0 shadow-[0_0_15px_rgba(245,158,11,0.15)]">
              <Flame className="w-5 h-5" />
            </div>
          </div>
        </div>
      </section>

      {/* 5. GLOBAL PUBLIC MATCH HISTORY FEED */}
      <HomeRecentMatchesFeed onViewAllMatchHistory={() => onSelectTab('match_history')} />

      {/* 6. RECENT ACTIVITY */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-mono font-bold uppercase tracking-widest text-neutral-400">
            Recent Activity
          </h2>
          {recentMatches.length > 0 && (
            <button
              onClick={() => onSelectTab('matches')}
              className="text-xs text-red-500 hover:text-red-400 font-bold uppercase tracking-wider transition-colors"
            >
              View Match History →
            </button>
          )}
        </div>

        {recentMatches.length === 0 ? (
          <div className="p-8 rounded-2xl bg-neutral-950 border border-white/10 text-center space-y-3">
            <p className="text-sm font-bold text-white">No matches played yet</p>
            <p className="text-xs text-neutral-400 max-w-sm mx-auto">
              Jump into the Play arena to challenge opponents and build your competitive MMR.
            </p>
            <button
              onClick={() => onSelectTab('play')}
              className="px-5 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold uppercase tracking-wider transition-colors inline-block"
            >
              Play Now
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {recentMatches.map((m) => {
              const isPlayerA = m.playerAId === user.uid;
              const opponentName = isPlayerA ? (m.playerBGamerTag || m.playerBName) : (m.playerAGamerTag || m.playerAName);
              const isWinner = m.winnerId === user.uid;
              const isDraw = m.winnerId === 'draw';
              const ratingChange = isPlayerA ? m.playerARatingChange : m.playerBRatingChange;
              const isFinished = m.status === 'CONFIRMED';

              return (
                <div
                  key={m.id}
                  onClick={() => onSelectMatch(m.id)}
                  className="p-4 rounded-xl bg-neutral-950 border border-white/10 hover:border-white/20 transition-all flex items-center justify-between cursor-pointer group"
                >
                  <div className="flex items-center gap-3">
                    {/* Outcome Badge */}
                    <span
                      className={`px-2.5 py-1 rounded text-xs font-mono font-bold uppercase ${
                        isFinished
                          ? isWinner
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : isDraw
                            ? 'bg-neutral-800 text-neutral-300'
                            : 'bg-red-500/20 text-red-400'
                          : 'bg-neutral-800 text-neutral-400'
                      }`}
                    >
                      {isFinished ? (isWinner ? 'WON' : isDraw ? 'DRAW' : 'LOST') : m.status}
                    </span>

                    <div>
                      <div className="text-sm font-bold text-white group-hover:text-red-500 transition-colors">
                        {m.gameName}
                      </div>
                      <div className="text-xs text-neutral-400 font-mono">
                        vs {opponentName || 'Opponent'}
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    {isFinished && ratingChange !== undefined && (
                      <span
                        className={`text-sm font-bold font-mono ${
                          ratingChange > 0
                            ? 'text-emerald-400'
                            : ratingChange < 0
                            ? 'text-red-400'
                            : 'text-neutral-400'
                        }`}
                      >
                        {ratingChange > 0 ? `+${ratingChange}` : ratingChange} MMR
                      </span>
                    )}
                    <div className="text-[10px] text-neutral-500 font-mono">
                      Station: {m.station || 'PC'}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
