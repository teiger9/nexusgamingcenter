import React, { useState, useEffect } from 'react';
import { GameCategory, Player, Team } from '../types';
import { subscribeToLeaderboard } from '../services/playerService';
import { subscribeToTeams } from '../services/teamService';
import { NexusRankBadge } from './NexusRankBadge';
import { TournamentChampionsShowcase } from './TournamentChampionsShowcase';
import { ArenaLiveBroadcastFeed } from './ArenaLiveBroadcastFeed';
import { LobbyRecruitmentFeed } from './LobbyRecruitmentFeed';
import { HomeRecentMatchesFeed } from './HomeRecentMatchesFeed';
import { CurrentSeasonBanner } from './CurrentSeasonBanner';
import {
  Trophy,
  Swords,
  Shield,
  Gamepad2,
  Users,
  Award,
  ChevronRight,
  Search,
  Sparkles,
  Zap,
  Target,
  ArrowRight,
  Flame,
  CheckCircle2,
  HelpCircle,
  TrendingUp,
  Calendar,
} from 'lucide-react';

interface VisitorHomeViewProps {
  onOpenAuth: (mode?: 'login' | 'register') => void;
  onSelectGameLeaderboard?: (gameId: string) => void;
  onSelectPlayerProfile?: (playerId: string) => void;
  onSelectTeamProfile?: (teamId: string) => void;
  onOpenRankingGuide?: () => void;
  onNavigateToReservations?: () => void;
  onNavigateToTournaments?: (tournamentId?: string) => void;
  onSelectMatch?: (matchId: string) => void;
  onNavigateToMatchHistory?: () => void;
  onNavigateToLeaderboard?: () => void;
  onNavigateToHallOfFame?: () => void;
}

const AVAILABLE_GAMES = [
  {
    id: 'chess',
    name: 'Chess',
    category: 'CHESS' as GameCategory,
    format: '1v1 Classical / Blitz',
    color: 'from-amber-500/20 to-amber-900/10',
    borderColor: 'border-amber-500/30',
    textColor: 'text-amber-400',
    description: 'Pure tactical warfare and strategic mastery on physical boards and digital timers.',
    icon: '♟️',
  },
  {
    id: 'fc26',
    name: 'FC 26',
    category: 'PS5' as GameCategory,
    format: '1v1 Competitive',
    color: 'from-emerald-500/20 to-emerald-900/10',
    borderColor: 'border-emerald-500/30',
    textColor: 'text-emerald-400',
    description: 'Next-gen virtual pitch combat on high-framerate PS5 Pro tournament stations.',
    icon: '⚽',
  },
  {
    id: 'fc27',
    name: 'FC 27',
    category: 'PS5' as GameCategory,
    format: '1v1 Competitive',
    color: 'from-teal-500/20 to-teal-900/10',
    borderColor: 'border-teal-500/30',
    textColor: 'text-teal-400',
    description: 'The pinnacle of football esports with real-time tactical depth and clutch goals.',
    icon: '⚽',
  },
  {
    id: 'valorant',
    name: 'Valorant',
    category: 'PC' as GameCategory,
    format: '1v1 & 5v5 Squads',
    color: 'from-rose-500/20 to-rose-900/10',
    borderColor: 'border-rose-500/30',
    textColor: 'text-rose-400',
    description: 'High-stakes precision tactical shooter on 240Hz mechanical gaming rigs.',
    icon: '🎯',
  },
  {
    id: 'cs2',
    name: 'CS2',
    category: 'PC' as GameCategory,
    format: '1v1 & 5v5 Squads',
    color: 'from-cyan-500/20 to-cyan-900/10',
    borderColor: 'border-cyan-500/30',
    textColor: 'text-cyan-400',
    description: 'Legendary Counter-Strike bomb defusal and squad execution under official tournament rules.',
    icon: '💣',
  },
  {
    id: 'lol',
    name: 'League of Legends',
    category: 'PC' as GameCategory,
    format: '5v5 Squads',
    color: 'from-blue-500/20 to-indigo-900/10',
    borderColor: 'border-blue-500/30',
    textColor: 'text-blue-400',
    description: 'Premier 5v5 tactical MOBA combat. Strategic lane control, Baron contests, and nexus demolition.',
    icon: '⚔️',
  },
];

export const VisitorHomeView: React.FC<VisitorHomeViewProps> = ({
  onOpenAuth,
  onSelectPlayerProfile,
  onSelectTeamProfile,
  onOpenRankingGuide,
  onNavigateToReservations,
  onNavigateToTournaments,
  onSelectMatch,
  onNavigateToMatchHistory,
  onNavigateToLeaderboard,
  onNavigateToHallOfFame,
}) => {
  const [activeLeaderboardGame, setActiveLeaderboardGame] = useState<string>('valorant');
  const [leaderboardPlayers, setLeaderboardPlayers] = useState<Player[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    setLoadingLeaderboard(true);
    const unsub = subscribeToLeaderboard(activeLeaderboardGame, (players) => {
      setLeaderboardPlayers(players);
      setLoadingLeaderboard(false);
    });
    return () => unsub();
  }, [activeLeaderboardGame]);

  useEffect(() => {
    const unsubTeams = subscribeToTeams(
      activeLeaderboardGame === 'valorant' || activeLeaderboardGame === 'cs2' ? activeLeaderboardGame : undefined,
      (t) => setTeams(t)
    );
    return () => unsubTeams();
  }, [activeLeaderboardGame]);

  const filteredPlayers = leaderboardPlayers.filter((p) =>
    (p?.gamerTag && p.gamerTag.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (p?.fullName && p.fullName.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="space-y-12 pb-16">
      {/* Hero Section */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-b from-[#14080a] via-[#090a0d] to-[#050608] border border-red-600/30 p-8 sm:p-12 lg:p-16 shadow-[0_10px_50px_rgba(0,0,0,0.9)]">
        {/* Cyber Grid & Red Glow Accents */}
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-96 h-96 bg-red-600/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-80 h-80 bg-red-950/25 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-red-600 to-transparent pointer-events-none" />

        <div className="relative z-10 max-w-3xl space-y-6">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-red-950/40 border border-red-600/40 text-red-400 font-mono text-xs font-bold uppercase tracking-wider shadow-[0_0_15px_rgba(239,68,68,0.2)]">
            <Sparkles className="w-3.5 h-3.5 text-red-500 animate-pulse" />
            <span>Official Nexus Gaming Center Competitive Arena</span>
          </div>

          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black font-display tracking-tight text-white leading-none">
            WHERE GAMERS <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-500 via-red-400 to-white">FORGE LEGACIES.</span>
          </h1>

          <p className="text-sm sm:text-base text-slate-300 font-sans leading-relaxed max-w-2xl">
            Welcome to Nexus Gaming Center — the premier competitive gaming hub. Battle in real-time on our tournament-grade LAN stations, track your verified ELO across Chess, FC 26, FC 27, Valorant, and CS2, build 5v5 squads, and compete for seasonal glory.
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              onClick={() => onOpenAuth('register')}
              className="px-6 py-3.5 rounded-2xl bg-red-600 hover:bg-red-500 text-white font-mono font-black text-xs uppercase tracking-wider transition-all shadow-[0_0_25px_rgba(239,68,68,0.5)] border border-red-400 flex items-center gap-2 transform active:scale-95 cursor-pointer"
            >
              <span>Join Nexus Gaming Center</span>
              <ArrowRight className="w-4 h-4 stroke-[3]" />
            </button>

            <button
              onClick={() => onOpenAuth('login')}
              className="px-6 py-3.5 rounded-2xl bg-neutral-900/90 hover:bg-neutral-800 text-white border border-neutral-700 hover:border-red-500/50 font-mono font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer"
            >
              <span>Player Login</span>
            </button>

            {onOpenRankingGuide && (
              <button
                onClick={onOpenRankingGuide}
                className="px-4 py-3 rounded-2xl text-slate-400 hover:text-red-400 text-xs font-mono font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <HelpCircle className="w-4 h-4 text-red-500" />
                <span>How MMR Works</span>
              </button>
            )}
          </div>
        </div>

        {/* Live Center Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-10 pt-8 border-t border-neutral-800">
          <div className="bg-[#0b0c10]/90 backdrop-blur p-4 rounded-2xl border border-neutral-800 hover:border-red-500/40 transition-colors">
            <div className="text-[11px] font-mono uppercase text-slate-400">Supported Titles</div>
            <div className="text-2xl font-black font-display text-white mt-1">5 Core Games</div>
            <div className="text-[10px] text-red-400 font-mono mt-0.5">PC • PS5 Pro • Chess</div>
          </div>
          <div className="bg-[#0b0c10]/90 backdrop-blur p-4 rounded-2xl border border-neutral-800 hover:border-red-500/40 transition-colors">
            <div className="text-[11px] font-mono uppercase text-slate-400">Match Formats</div>
            <div className="text-2xl font-black font-display text-white mt-1">1v1 & 5v5</div>
            <div className="text-[10px] text-red-400 font-mono mt-0.5">Ranked & Squads</div>
          </div>
          <div className="bg-[#0b0c10]/90 backdrop-blur p-4 rounded-2xl border border-neutral-800 hover:border-red-500/40 transition-colors">
            <div className="text-[11px] font-mono uppercase text-slate-400">Rating Engine</div>
            <div className="text-2xl font-black font-display text-white mt-1">K=32 Elo</div>
            <div className="text-[10px] text-red-400 font-mono mt-0.5">10-Game Placement</div>
          </div>
          <div className="bg-[#0b0c10]/90 backdrop-blur p-4 rounded-2xl border border-neutral-800 hover:border-red-500/40 transition-colors">
            <div className="text-[11px] font-mono uppercase text-slate-400">Season Cycle</div>
            <div className="text-2xl font-black font-display text-white mt-1">4 Months</div>
            <div className="text-[10px] text-red-400 font-mono mt-0.5">Hall of Fame Crowns</div>
          </div>
        </div>
      </section>

      {/* 🏆 HALL OF FAME SEASON CYCLE & COUNTDOWN BANNER */}
      <CurrentSeasonBanner
        onNavigateToLeaderboard={onNavigateToLeaderboard}
        onNavigateToHallOfFame={onNavigateToHallOfFame}
        onNavigateToRankingRules={onOpenRankingGuide}
      />

      {/* 🎮 RECENT MATCHES (GLOBAL HOME PUBLIC FEED) */}
      <HomeRecentMatchesFeed onViewAllMatchHistory={onNavigateToMatchHistory || (() => {})} />

      {/* ⚡ ARENA LIVE BROADCAST FEED */}
      <ArenaLiveBroadcastFeed onNavigateToTournaments={onNavigateToTournaments} />

      {/* Official Tournament Champions & Hall of Victors Showcase */}
      <TournamentChampionsShowcase
        onNavigateToTournaments={onNavigateToTournaments}
        onSelectParticipant={(id, type) => {
          if (type === 'PLAYER' && onSelectPlayerProfile) {
            onSelectPlayerProfile(id);
          } else if (type === 'TEAM' && onSelectTeamProfile) {
            onSelectTeamProfile(id);
          }
        }}
      />

      {/* 📢 5v5 SQUAD LOBBY RECRUITMENT FEED (ARENA DISPATCH) */}
      <LobbyRecruitmentFeed
        onSelectMatch={(matchId) => {
          if (onSelectMatch) {
            onSelectMatch(matchId);
          } else {
            onOpenAuth('login');
          }
        }}
        onOpenAuth={onOpenAuth}
      />

      {/* Station Booking / Reservation Feature Callout */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-red-950/40 via-[#0a0b0e] to-neutral-950 border border-red-600/30 p-6 sm:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 shadow-xl">
        <div className="space-y-2 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-950/40 border border-red-500/30 text-red-400 text-xs font-mono font-bold">
            <Calendar className="w-3.5 h-3.5 text-red-500" />
            <span>REAL-TIME EQUIPMENT RESERVATIONS</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black font-display text-white">
            BOOK YOUR PC OR PS5 STATION BEFORE YOU ARRIVE
          </h2>
          <p className="text-xs sm:text-sm text-slate-300">
            Browse live availability, reserve high-refresh rate PC rigs (150 DA/hr), 4K PS5 tournament posts (400 DA/hr), or lock down a full 10-PC LAN group room for your squad.
          </p>
        </div>

        <button
          onClick={onNavigateToReservations}
          className="px-6 py-3.5 rounded-2xl bg-red-600 hover:bg-red-500 text-white font-mono font-bold text-xs uppercase tracking-wider transition-all shadow-[0_0_20px_rgba(239,68,68,0.4)] border border-red-500 shrink-0 flex items-center gap-2 active:scale-95 cursor-pointer"
        >
          <Calendar className="w-4 h-4" />
          <span>View Availability & Calendar</span>
        </button>
      </section>

      {/* Available Games Section */}
      <section className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl sm:text-2xl font-black font-display text-white">COMPETITIVE GAME TITLES</h2>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              Choose your arena. Play ranked matches on dedicated physical stations at Nexus.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {AVAILABLE_GAMES.map((game) => (
            <div
              key={game.id}
              onClick={() => setActiveLeaderboardGame(game.id)}
              className={`p-5 rounded-3xl bg-[#090a0d] border transition-all cursor-pointer flex flex-col justify-between space-y-4 hover:-translate-y-1 ${
                activeLeaderboardGame === game.id
                  ? 'border-red-500 bg-gradient-to-b from-red-950/40 to-[#090a0d] shadow-lg shadow-red-950/40'
                  : 'border-neutral-800 hover:border-neutral-700'
              }`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-3xl">{game.icon}</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-neutral-900 border border-neutral-800 text-slate-300">
                    {game.category}
                  </span>
                </div>
                <h3 className="text-lg font-black font-display text-white mt-3">{game.name}</h3>
                <div className="text-xs font-mono font-bold text-red-400 mt-0.5">
                  {game.format}
                </div>
                <p className="text-xs text-slate-400 mt-2 line-clamp-3 leading-relaxed">
                  {game.description}
                </p>
              </div>

              <div className="pt-3 border-t border-neutral-800 flex items-center justify-between text-xs font-mono">
                <span className="text-slate-400">View Rankings</span>
                <ChevronRight className="w-4 h-4 text-red-500" />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Public Leaderboard Preview */}
      <section className="bg-[#08090c] border border-neutral-800 rounded-3xl overflow-hidden shadow-2xl space-y-4 p-6 sm:p-8 relative">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-800 pb-5">
          <div>
            <div className="flex items-center gap-2">
              <Trophy className="w-5 h-5 text-red-500" />
              <h2 className="text-xl font-black font-display text-white uppercase tracking-wide">
                PUBLIC LEADERBOARD: {activeLeaderboardGame.toUpperCase()}
              </h2>
            </div>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              Live competitive standings for verified players at Nexus Gaming Center
            </p>
          </div>

          {/* Game selector tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto bg-[#101116] p-1.5 rounded-2xl border border-neutral-800">
            {AVAILABLE_GAMES.map((g) => (
              <button
                key={g.id}
                onClick={() => setActiveLeaderboardGame(g.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all shrink-0 cursor-pointer ${
                  activeLeaderboardGame === g.id
                    ? 'bg-red-600 text-white shadow-md shadow-red-600/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {g.name}
              </button>
            ))}
          </div>
        </div>

        {/* Filter bar */}
        <div className="flex items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search gamer tag..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-[#101116] border border-neutral-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-red-500 font-mono"
            />
          </div>

          <div className="text-xs font-mono text-slate-400">
            Showing <strong className="text-white">{filteredPlayers.length}</strong> competitors
          </div>
        </div>

        {/* Table */}
        {loadingLeaderboard ? (
          <div className="py-16 text-center">
            <div className="inline-block w-8 h-8 border-3 border-red-600 border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-slate-400 text-xs font-mono">Loading rankings...</p>
          </div>
        ) : filteredPlayers.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-xs font-mono">
            No player standings found for this game yet. Be the first to register and play!
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-[#101116] text-slate-400 uppercase text-[10px] tracking-wider border-b border-neutral-800">
                <tr>
                  <th className="py-3 px-4">Rank</th>
                  <th className="py-3 px-4">Player</th>
                  <th className="py-3 px-4">Tier Badge</th>
                  <th className="py-3 px-4">Rating (MMR)</th>
                  <th className="py-3 px-4">Record (W-L-D)</th>
                  <th className="py-3 px-4">Win Rate</th>
                  <th className="py-3 px-4 text-right">Profile</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/60">
                {filteredPlayers.slice(0, 10).map((player, index) => {
                  const mmr = player.overallRating || 1000;
                  const total = player.totalGames || 0;
                  const wins = player.totalWins || 0;
                  const losses = player.totalLosses || 0;
                  const draws = player.totalDraws || 0;
                  const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;

                  return (
                    <tr
                      key={player.uid}
                      className="hover:bg-red-950/10 transition-colors cursor-pointer"
                      onClick={() => onSelectPlayerProfile && onSelectPlayerProfile(player.uid)}
                    >
                      <td className="py-3.5 px-4 font-bold">
                        {index === 0 ? (
                          <span className="text-red-400 flex items-center gap-1 font-display text-sm">
                            🥇 #1
                          </span>
                        ) : index === 1 ? (
                          <span className="text-slate-300 flex items-center gap-1 font-display text-sm">
                            🥈 #2
                          </span>
                        ) : index === 2 ? (
                          <span className="text-amber-500 flex items-center gap-1 font-display text-sm">
                            🥉 #3
                          </span>
                        ) : (
                          <span className="text-slate-500">#{index + 1}</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-xl bg-neutral-900 flex items-center justify-center font-bold text-white uppercase text-xs border border-neutral-700">
                            {player.avatarUrl ? (
                              <img
                                src={player.avatarUrl}
                                alt={player.gamerTag}
                                className="w-full h-full object-cover rounded-xl"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              player.gamerTag.substring(0, 2)
                            )}
                          </div>
                          <div>
                            <div className="font-bold text-white hover:text-red-400 transition-colors">
                              {player.gamerTag}
                            </div>
                            <div className="text-[10px] text-slate-400">{player.fullName}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <NexusRankBadge rating={mmr} size="sm" showLabel={true} />
                      </td>
                      <td className="py-3.5 px-4 font-bold text-red-400 font-display text-sm">
                        {mmr} <span className="text-[10px] text-slate-500 font-normal">ELO</span>
                      </td>
                      <td className="py-3.5 px-4 text-slate-300">
                        <span className="text-emerald-400">{wins}</span>-
                        <span className="text-rose-400">{losses}</span>-
                        <span className="text-slate-400">{draws}</span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={winRate >= 60 ? 'text-emerald-400 font-bold' : 'text-slate-300'}>
                          {winRate}%
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onSelectPlayerProfile) onSelectPlayerProfile(player.uid);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-neutral-800 hover:bg-red-950/60 border border-transparent hover:border-red-600/40 text-red-400 hover:text-white text-[10px] font-mono transition-colors cursor-pointer"
                        >
                          View Dossier
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="p-4 rounded-2xl bg-[#101116] border border-neutral-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono">
          <div className="text-slate-400">
            Want to climb this leaderboard? Create your Nexus player profile in seconds.
          </div>
          <button
            onClick={() => onOpenAuth('register')}
            className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold uppercase tracking-wider shrink-0 transition-all shadow-[0_0_15px_rgba(239,68,68,0.4)] cursor-pointer"
          >
            Register to Compete
          </button>
        </div>
      </section>

      {/* 5v5 Squads & Team Section */}
      <section className="bg-gradient-to-r from-[#14080a] to-[#07070a] border border-red-900/30 rounded-3xl p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-950/40 border border-red-600/40 text-red-400 font-mono text-xs font-bold uppercase mb-2">
              <Users className="w-3.5 h-3.5" />
              <span>Competitive 5v5 Esports</span>
            </div>
            <h2 className="text-2xl font-black font-display text-white">5-PLAYER SQUADS (VALORANT & CS2)</h2>
            <p className="text-xs text-slate-400 font-mono mt-1">
              Captains recruit lineups, challenge rival squads in open lobbies, and battle with 10-player consensus voting.
            </p>
          </div>

          <button
            onClick={() => onOpenAuth('login')}
            className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-mono font-bold text-xs uppercase tracking-wider shrink-0 shadow-[0_0_15px_rgba(239,68,68,0.4)] cursor-pointer"
          >
            Create or Join Squad
          </button>
        </div>

        {teams.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
            {teams.slice(0, 6).map((t) => (
              <div
                key={t.teamId}
                onClick={() => onSelectTeamProfile && onSelectTeamProfile(t.teamId)}
                className="p-4 rounded-2xl bg-[#090a0d] border border-neutral-800 hover:border-red-500/50 cursor-pointer transition-colors flex items-center justify-between group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-[#121318] border border-neutral-700 group-hover:border-red-500/40 flex items-center justify-center text-xl shrink-0">
                    {t.teamLogo || '🛡️'}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-white group-hover:text-red-400 transition-colors">{t.teamName}</span>
                      <span className="text-[10px] font-mono text-red-400 font-bold">[{t.teamTag}]</span>
                    </div>
                    <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                      {t.gameName} • {t.members?.length || 0}/5 Roster
                    </div>
                  </div>
                </div>

                <div className="text-right font-mono">
                  <div className="text-xs font-bold text-red-400">{t.teamRating || 1000} ELO</div>
                  <div className="text-[10px] text-slate-500">{t.wins}W - {t.losses}L</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* How the Gaming Center Works */}
      <section className="space-y-5">
        <div>
          <h2 className="text-xl sm:text-2xl font-black font-display text-white">HOW NEXUS OPERATES</h2>
          <p className="text-xs text-slate-400 font-mono mt-0.5">
            Our multi-layered competitive structure guarantees fair matches and zero cheating.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-6 rounded-3xl bg-[#08090c] border border-neutral-800 hover:border-red-500/40 transition-colors space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-red-950/40 border border-red-600/40 text-red-400 flex items-center justify-center shadow-[0_0_15px_rgba(239,68,68,0.2)]">
              <Gamepad2 className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold font-display text-white">1. Station Matchmaking</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Match with a player at the center, select a station, and send a ranked challenge. Nexus staff verifies station allocation.
            </p>
          </div>

          <div className="p-6 rounded-3xl bg-[#08090c] border border-neutral-800 hover:border-red-500/40 transition-colors space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-red-950/40 border border-red-600/40 text-red-400 flex items-center justify-center shadow-[0_0_15px_rgba(239,68,68,0.2)]">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold font-display text-white">2. Mutual Consensus</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Both players submit match declarations. In 5v5, all 10 players vote. If results match, MMR updates immediately.
            </p>
          </div>

          <div className="p-6 rounded-3xl bg-[#08090c] border border-neutral-800 hover:border-red-500/40 transition-colors space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-red-950/40 border border-red-600/40 text-red-400 flex items-center justify-center shadow-[0_0_15px_rgba(239,68,68,0.2)]">
              <Shield className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold font-display text-white">3. Admin Adjudication</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              If conflicting outcomes are submitted, the match enters the Dispute Room for staff review and referee ruling.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};
