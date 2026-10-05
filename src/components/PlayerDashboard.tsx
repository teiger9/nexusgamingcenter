import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { subscribeToPlayerMatches } from '../services/matchService';
import { Match } from '../types';
import { getRankFromMMR } from '../lib/ranks';
import { NexusLogo } from './NexusLogo';
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
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-8">
      {/* 1. Header: NEXUS Logo & Greeting */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-white/10 pb-6">
        <div className="space-y-2">
          <NexusLogo size="sm" showWordmark={true} />
          <h1 className="text-3xl sm:text-4xl font-black font-display text-white tracking-tight">
            Ready to play, <span className="text-red-500">{playerProfile.gamerTag}</span>?
          </h1>
          <p className="text-sm text-neutral-400">
            Welcome to Nexus Gaming Center. Jump into a match, join a squad, or check the tournaments.
          </p>
        </div>

        {/* Claim First Admin Alert if unassigned */}
        {!hasAdminInSystem && onOpenAdminSetup && (
          <button
            onClick={onOpenAdminSetup}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-600/20 border border-red-500/40 text-red-400 hover:bg-red-600 hover:text-white transition-all text-xs font-bold uppercase tracking-wider"
          >
            <ShieldAlert className="w-4 h-4" />
            <span>Setup Admin Account</span>
          </button>
        )}
      </div>

      {/* 🏆 HALL OF FAME SEASON BANNER & COUNTDOWN */}
      <CurrentSeasonBanner
        onNavigateToLeaderboard={() => onSelectTab('leaderboard')}
        onNavigateToHallOfFame={() => onSelectTab('hall_of_fame')}
        onNavigateToRankingRules={onOpenRankingGuide}
      />

      {/* 2. Active Match Banner (If Player In Match) */}
      {activeMatch && (
        <div className="relative overflow-hidden rounded-2xl nexus-card-3d border-red-600 p-5 shadow-[0_0_30px_rgba(239,68,68,0.25)]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-red-600/20 border border-red-500 flex items-center justify-center text-red-500 shadow-[0_0_15px_rgba(239,68,68,0.3)] shrink-0">
                <Radio className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-red-500">
                  MATCH IN PROGRESS · STATION {activeMatch.station || 'MAIN'}
                </span>
                <h3 className="text-lg font-bold font-display text-white">
                  {activeMatch.gameName} — {activeMatch.teamAName || activeMatch.playerAGamerTag}{' '}
                  <span className="text-neutral-500 font-normal">vs</span>{' '}
                  {activeMatch.teamBName || activeMatch.playerBGamerTag || 'Opponent'}
                </h3>
              </div>
            </div>

            <button
              onClick={() => onSelectMatch(activeMatch.id)}
              className="px-6 py-3 rounded-xl nexus-btn-3d text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer"
            >
              <span>ENTER MATCH ROOM</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* 3. The 4 Large Main Action Cards */}
      <div>
        <h2 className="text-xs font-mono font-bold uppercase tracking-widest text-neutral-400 mb-3">
          Quick Actions
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* PLAY */}
          <button
            onClick={() => onSelectTab('play')}
            className="group relative p-6 rounded-2xl nexus-card-3d text-left flex flex-col justify-between h-44 cursor-pointer focus-visible:ring-2 focus-visible:ring-red-500"
          >
            <div className="flex items-center justify-between">
              <span className="text-3xl">🎮</span>
              <span className="text-xs font-mono text-neutral-500 uppercase">1v1 &amp; 5v5</span>
            </div>
            <div>
              <h3 className="text-xl font-black font-display tracking-tight text-white group-hover:text-red-500 transition-colors uppercase">
                Play
              </h3>
              <p className="text-xs text-neutral-400 mt-1">
                Start 1v1 match or browse open squad lobbies
              </p>
            </div>
          </button>

          {/* BOOKING */}
          <button
            onClick={() => onSelectTab('reservations')}
            className="group relative p-6 rounded-2xl nexus-card-3d text-left flex flex-col justify-between h-44 cursor-pointer focus-visible:ring-2 focus-visible:ring-red-500"
          >
            <div className="flex items-center justify-between">
              <span className="text-3xl">📅</span>
              <span className="text-xs font-mono text-neutral-500 uppercase">PC &amp; PS5</span>
            </div>
            <div>
              <h3 className="text-xl font-black font-display tracking-tight text-white group-hover:text-red-500 transition-colors uppercase">
                Booking
              </h3>
              <p className="text-xs text-neutral-400 mt-1">
                Reserve PCs (8–10 group) &amp; PS5 stations
              </p>
            </div>
          </button>

          {/* TOURNAMENTS */}
          <button
            onClick={() => {
              if (onNavigateToTournaments) onNavigateToTournaments();
              else onSelectTab('tournaments');
            }}
            className="group relative p-6 rounded-2xl nexus-card-3d text-left flex flex-col justify-between h-44 cursor-pointer focus-visible:ring-2 focus-visible:ring-red-500"
          >
            <div className="flex items-center justify-between">
              <span className="text-3xl">🏆</span>
              <span className="text-xs font-mono text-neutral-500 uppercase">Events</span>
            </div>
            <div>
              <h3 className="text-xl font-black font-display tracking-tight text-white group-hover:text-red-500 transition-colors uppercase">
                Tournaments
              </h3>
              <p className="text-xs text-neutral-400 mt-1">
                Official cups, brackets, and cash prizes
              </p>
            </div>
          </button>

          {/* SQUADS */}
          <button
            onClick={() => onSelectTab('teams')}
            className="group relative p-6 rounded-2xl nexus-card-3d text-left flex flex-col justify-between h-44 cursor-pointer focus-visible:ring-2 focus-visible:ring-red-500"
          >
            <div className="flex items-center justify-between">
              <span className="text-3xl">👥</span>
              <span className="text-xs font-mono text-neutral-500 uppercase">5v5</span>
            </div>
            <div>
              <h3 className="text-xl font-black font-display tracking-tight text-white group-hover:text-red-500 transition-colors uppercase">
                Squads
              </h3>
              <p className="text-xs text-neutral-400 mt-1">
                Form teams, invite friends, and coordinate
              </p>
            </div>
          </button>

          {/* REWARDS */}
          <button
            onClick={() => onSelectTab('fidelity_card')}
            className="group relative p-6 rounded-2xl nexus-card-3d text-left flex flex-col justify-between h-44 cursor-pointer focus-visible:ring-2 focus-visible:ring-red-500"
          >
            <div className="flex items-center justify-between">
              <span className="text-3xl">🎁</span>
              <span className="text-xs font-mono text-neutral-500 uppercase">Perks</span>
            </div>
            <div>
              <h3 className="text-xl font-black font-display tracking-tight text-white group-hover:text-red-500 transition-colors uppercase">
                Rewards
              </h3>
              <p className="text-xs text-neutral-400 mt-1">
                Redeem Nexus Coins for free hours &amp; snacks
              </p>
            </div>
          </button>
        </div>
      </div>

      {/* 4. Useful Live Information Row */}
      <div>
        <h2 className="text-xs font-mono font-bold uppercase tracking-widest text-neutral-400 mb-3">
          Your Stats
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* YOUR RANK */}
          <button
            onClick={() => onSelectTab('profile')}
            className="p-5 rounded-2xl nexus-card-3d text-left group cursor-pointer"
          >
            <span className="text-xs font-mono text-neutral-400 uppercase block">Your Rank</span>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-2xl select-none">{isUnranked ? '⚪' : rankTier.icon}</span>
              <span className="text-lg sm:text-xl font-black font-display text-white truncate">
                {isUnranked ? 'UNRANKED' : rankTier.name}
              </span>
            </div>
            <span className="text-[11px] font-mono text-neutral-500 mt-1 block">
              {isUnranked ? `${totalMatches}/10 placement games` : rankTier.division}
            </span>
          </button>

          {/* YOUR MMR */}
          <button
            onClick={() => onSelectTab('leaderboard')}
            className="p-5 rounded-2xl nexus-card-3d text-left group cursor-pointer"
          >
            <span className="text-xs font-mono text-neutral-400 uppercase block">Your MMR</span>
            <div className="text-2xl sm:text-3xl font-black font-display text-white mt-2 font-mono-numbers">
              {playerProfile.overallRating || 1000}
            </div>
            <span className="text-[11px] font-mono text-neutral-500 mt-1 block">
              Global competitive rating
            </span>
          </button>

          {/* YOUR NC */}
          <button
            onClick={() => onSelectTab('fidelity_card')}
            className="p-5 rounded-2xl nexus-card-3d text-left group cursor-pointer"
          >
            <span className="text-xs font-mono text-neutral-400 uppercase block">Your NC</span>
            <div className="flex items-center gap-2 mt-2">
              <Coins className="w-5 h-5 text-red-500 shrink-0" />
              <span className="text-2xl sm:text-3xl font-black font-display text-white font-mono-numbers">
                {coinsBalance}
              </span>
            </div>
            <span className="text-[11px] font-mono text-neutral-500 mt-1 block">
              Nexus Coins balance
            </span>
          </button>

          {/* WIN STREAK */}
          <div className="p-5 rounded-2xl nexus-card-3d text-left">
            <span className="text-xs font-mono text-neutral-400 uppercase block">Win Streak</span>
            <div className="flex items-center gap-2 mt-2">
              <Flame className={`w-5 h-5 ${winStreak > 0 ? 'text-red-500 animate-pulse' : 'text-neutral-600'}`} />
              <span className="text-2xl sm:text-3xl font-black font-display text-white font-mono-numbers">
                {winStreak}
              </span>
            </div>
            <span className="text-[11px] font-mono text-neutral-500 mt-1 block">
              {winStreak > 2 ? 'On a hot streak!' : 'Consecutive victories'}
            </span>
          </div>
        </div>
      </div>

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
