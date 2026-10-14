import React, { useRef } from 'react';
import { ArrowRight, ChevronDown, Gamepad2, Monitor, Trophy, Users, Shield, Zap, UserPlus } from 'lucide-react';
import { NexusLogo } from './NexusLogo';

interface VisitorHomeViewProps {
  onOpenAuth: (mode?: 'login' | 'register') => void;
  onNavigateToReservations?: () => void;
  onNavigateToMatchmaking?: () => void;
  onSelectGameLeaderboard?: (gameId: string) => void;
  onSelectPlayerProfile?: (playerId: string) => void;
  onSelectTeamProfile?: (teamId: string) => void;
  onOpenRankingGuide?: () => void;
  onNavigateToTournaments?: (tournamentId?: string) => void;
  onSelectMatch?: (matchId: string) => void;
  onNavigateToMatchHistory?: () => void;
  onNavigateToLeaderboard?: () => void;
  onNavigateToHallOfFame?: () => void;
}

export const VisitorHomeView: React.FC<VisitorHomeViewProps> = ({
  onOpenAuth,
  onNavigateToReservations,
  onNavigateToMatchmaking,
  onNavigateToLeaderboard,
  onNavigateToTournaments,
  onOpenRankingGuide,
}) => {
  const gamesSectionRef = useRef<HTMLDivElement>(null);

  const handleExploreGamesClick = () => {
    if (gamesSectionRef.current) {
      gamesSectionRef.current.scrollIntoView({ behavior: 'smooth' });
    } else if (onNavigateToMatchmaking) {
      onNavigateToMatchmaking();
    }
  };

  const featuredGames = [
    {
      id: 'valorant',
      name: 'VALORANT',
      genre: '5v5 Tactical FPS',
      tagline: 'Defuse, plant, clutch. Ranked 5v5 & 1v1 aim duels.',
      accent: 'from-rose-500/20 to-red-600/10',
    },
    {
      id: 'cs2',
      name: 'COUNTER-STRIKE 2',
      genre: 'Competitive FPS',
      tagline: 'High-tick competitive matchmaking and official tournaments.',
      accent: 'from-amber-500/20 to-orange-600/10',
    },
    {
      id: 'lol',
      name: 'LEAGUE OF LEGENDS',
      genre: '5v5 MOBA',
      tagline: 'Summoner rift squad tournaments & verified ELO.',
      accent: 'from-blue-500/20 to-indigo-600/10',
    },
    {
      id: 'fc',
      name: 'EA SPORTS FC',
      genre: 'Competitive Football',
      tagline: '1v1 PS5 & PC esports brackets with cash rewards.',
      accent: 'from-emerald-500/20 to-teal-600/10',
    },
    {
      id: 'chess',
      name: 'COMPETITIVE CHESS',
      genre: 'Blitz & Rapid ELO',
      tagline: 'Strategic over-the-board master tournaments & blitz clocks.',
      accent: 'from-purple-500/20 to-violet-600/10',
    },
  ];

  return (
    <div className="relative w-full bg-[#050507] text-white selection:bg-red-600 selection:text-white">
      {/* =========================================================================
          HERO SECTION
          Full-width gaming venue background with dark overlay and red gradients
          ========================================================================= */}
      <section className="relative min-h-[92vh] sm:min-h-[90vh] flex flex-col justify-between px-4 sm:px-6 lg:px-8 py-8 sm:py-12 overflow-hidden">
        {/* Full-width gaming venue background image */}
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat pointer-events-none -z-20 opacity-35 filter brightness-75 scale-105 transition-transform duration-1000"
          style={{
            backgroundImage: `url('https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=2000&q=80')`,
          }}
        />

        {/* Dark Overlays & Subtle Red Atmospheric Gradients */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/95 via-black/80 to-[#050507] pointer-events-none -z-10" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_rgba(220,38,38,0.22)_0%,_transparent_60%)] pointer-events-none -z-10" />
        <div className="absolute bottom-0 inset-x-0 h-48 bg-gradient-to-t from-[#050507] via-[#050507]/80 to-transparent pointer-events-none -z-10" />

        {/* Ambient Top Glow */}
        <div className="absolute top-0 right-1/4 w-[500px] h-[300px] bg-red-600/10 rounded-full blur-[140px] pointer-events-none -z-10" />

        <div className="w-full max-w-4xl mx-auto my-auto flex flex-col justify-center pt-4 pb-8">
          {/* Eyebrow: "WELCOME TO THE ARENA" preceded by short red line */}
          <div className="flex items-center gap-3 mb-4 sm:mb-6">
            <span className="w-8 sm:w-10 h-[3px] bg-red-600 rounded-full shadow-[0_0_10px_rgba(239,68,68,0.8)]" />
            <span className="text-xs sm:text-sm font-black font-display tracking-[0.25em] text-red-500 uppercase drop-shadow-[0_0_12px_rgba(239,68,68,0.4)]">
              WELCOME TO THE ARENA
            </span>
          </div>

          {/* Large, Heavy, Condensed Headline:
              Line 1: PLAY. (white)
              Line 2: COMPETE. (vivid red)
              Line 3: DOMINATE. (white) */}
          <h1 className="font-headline text-6xl sm:text-7xl md:text-8xl lg:text-9xl font-black uppercase tracking-tight leading-[0.88] select-none mb-6 sm:mb-8 text-left">
            <span className="block text-white drop-shadow-[0_4px_20px_rgba(0,0,0,0.9)]">
              PLAY.
            </span>
            <span className="block text-red-600 drop-shadow-[0_0_40px_rgba(220,38,38,0.65)]">
              COMPETE.
            </span>
            <span className="block text-white drop-shadow-[0_4px_20px_rgba(0,0,0,0.9)]">
              DOMINATE.
            </span>
          </h1>

          {/* Introductory Text */}
          <p className="max-w-xl text-neutral-300 text-sm sm:text-base md:text-lg leading-relaxed font-sans mb-8 sm:mb-10 text-left">
            Experience elite esports battle stations, verified competitive matchmaking, LAN tournaments, and instant PC station booking at Nexus Gaming Center.
          </p>

          {/* Primary Public Actions:
              1. BOOK A PC (Vivid Red + Monitor Icon + Arrow)
              2. CREATE AN ACCOUNT (Dark Surface + UserPlus Icon + Arrow)
              3. EXPLORE GAMES (Tertiary outline action) */}
          <div className="w-full max-w-md flex flex-col gap-3.5 sm:gap-4 select-none">
            {/* 1. BOOK A PC */}
            <button
              id="public-btn-book-pc"
              onClick={onNavigateToReservations}
              className="group relative w-full h-14 sm:h-16 px-6 sm:px-7 rounded-xl bg-red-600 hover:bg-red-500 text-white font-display font-black uppercase tracking-wider text-base sm:text-lg shadow-[0_0_30px_rgba(220,38,38,0.45)] hover:shadow-[0_0_45px_rgba(220,38,38,0.65)] transition-all duration-200 active:scale-[0.98] cursor-pointer flex items-center justify-between overflow-hidden border border-red-500/50"
            >
              <div className="flex items-center gap-3">
                <Monitor className="w-5 h-5 text-white/90 shrink-0" />
                <span>BOOK A PC</span>
              </div>
              <ArrowRight className="w-5 h-5 text-white group-hover:translate-x-1 transition-transform duration-200 shrink-0" />
            </button>

            {/* 2. CREATE AN ACCOUNT */}
            <button
              id="public-btn-create-account"
              onClick={() => onOpenAuth('register')}
              className="group relative w-full h-14 sm:h-16 px-6 sm:px-7 rounded-xl bg-neutral-900/90 hover:bg-neutral-800 text-white font-display font-black uppercase tracking-wider text-base sm:text-lg border border-white/20 hover:border-red-500/60 hover:shadow-[0_0_25px_rgba(220,38,38,0.25)] transition-all duration-200 active:scale-[0.98] cursor-pointer flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <UserPlus className="w-5 h-5 text-neutral-300 group-hover:text-red-400 transition-colors shrink-0" />
                <span>CREATE AN ACCOUNT</span>
              </div>
              <ArrowRight className="w-5 h-5 text-neutral-400 group-hover:text-white group-hover:translate-x-1 transition-all duration-200 shrink-0" />
            </button>

            {/* 3. EXPLORE GAMES */}
            <button
              id="public-btn-explore-games"
              onClick={handleExploreGamesClick}
              className="group relative w-full h-11 px-5 rounded-xl bg-black/40 hover:bg-neutral-900/70 text-neutral-400 hover:text-white font-display font-bold uppercase tracking-wider text-xs sm:text-sm border border-white/10 hover:border-white/20 transition-all duration-200 cursor-pointer flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <Trophy className="w-4 h-4 text-neutral-400 group-hover:text-red-400 transition-colors shrink-0" />
                <span>EXPLORE GAMES</span>
              </div>
              <ChevronDown className="w-4 h-4 text-neutral-400 group-hover:text-white group-hover:translate-y-0.5 transition-all duration-200 shrink-0" />
            </button>
          </div>

          {/* Account Authentication Bar */}
          <div className="mt-5 flex items-center gap-2.5 text-xs sm:text-sm font-mono text-neutral-400 select-none">
            <span>Already have an account?</span>
            <button
              id="visitor-login-link"
              onClick={() => onOpenAuth('login')}
              className="text-red-500 hover:text-red-400 font-bold underline underline-offset-4 transition-colors cursor-pointer"
            >
              Log in
            </button>
          </div>
        </div>

        {/* Subtle Venue Status Indicators / Footer Indicators */}
        <div className="w-full max-w-4xl mx-auto pt-6 border-t border-white/5 flex flex-wrap items-center justify-between gap-4 text-xs font-mono text-neutral-400">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-neutral-300 font-bold">10 High-End Battle Stations</span>
            </div>
            <div className="hidden sm:flex items-center gap-2">
              <Shield className="w-3.5 h-3.5 text-red-500" />
              <span>Verified Matchmaking & ELO</span>
            </div>
          </div>

          <button
            onClick={handleExploreGamesClick}
            className="flex items-center gap-1.5 text-neutral-400 hover:text-white transition-colors cursor-pointer group"
          >
            <span>Scroll to explore</span>
            <ChevronDown className="w-4 h-4 group-hover:translate-y-1 transition-transform" />
          </button>
        </div>
      </section>

      {/* =========================================================================
          ARENA GAMES SECTION (Connected to real features)
          ========================================================================= */}
      <section ref={gamesSectionRef} className="w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24 border-t border-white/5">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-10">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-6 h-[2px] bg-red-600 rounded-full" />
              <span className="text-xs font-black font-display tracking-widest text-red-500 uppercase">
                COMPETITIVE TITLES
              </span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-black font-display uppercase tracking-tight text-white">
              SUPPORTED ARENA GAMES
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-neutral-400 max-w-md">
            Join 1v1 duels, form 5v5 squads, climb the seasonal leaderboards, and compete for Nexus Coins and prize pools.
          </p>
        </div>

        {/* Games Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {featuredGames.map((game) => (
            <div
              key={game.id}
              className="group relative p-6 rounded-2xl bg-neutral-900/60 border border-white/10 hover:border-red-600/50 hover:bg-neutral-900 transition-all duration-300 flex flex-col justify-between overflow-hidden shadow-lg hover:shadow-[0_0_30px_rgba(220,38,38,0.2)]"
            >
              <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${game.accent} rounded-full blur-2xl pointer-events-none -z-10 group-hover:scale-150 transition-transform duration-500`} />

              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-red-400 bg-red-950/60 border border-red-800/40 px-2 py-0.5 rounded">
                    {game.genre}
                  </span>
                  <Zap className="w-4 h-4 text-neutral-500 group-hover:text-red-500 transition-colors" />
                </div>
                <h3 className="text-xl sm:text-2xl font-black font-display uppercase tracking-wide text-white mb-2 group-hover:text-red-400 transition-colors">
                  {game.name}
                </h3>
                <p className="text-xs sm:text-sm text-neutral-400 leading-relaxed mb-6">
                  {game.tagline}
                </p>
              </div>

              <div className="flex items-center gap-2 pt-4 border-t border-white/5">
                <button
                  onClick={onNavigateToMatchmaking}
                  className="flex-1 py-2.5 px-3 rounded-lg bg-red-600/90 hover:bg-red-600 text-white text-xs font-bold font-display uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5"
                >
                  <Gamepad2 className="w-3.5 h-3.5" />
                  <span>Play Match</span>
                </button>
                <button
                  onClick={onNavigateToLeaderboard}
                  className="py-2.5 px-3 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white text-xs font-bold font-display uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5"
                  title="View rankings"
                >
                  <Trophy className="w-3.5 h-3.5" />
                  <span>Rankings</span>
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Venue Quick Features Banner */}
        <div className="mt-12 p-6 sm:p-8 rounded-2xl bg-gradient-to-r from-neutral-950 via-neutral-900 to-neutral-950 border border-white/10 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <NexusLogo size="lg" showWordmark={false} glow={true} />
            <div>
              <h4 className="text-lg font-black font-display uppercase text-white tracking-wide">
                NEXUS ARENA SPECIFICATIONS
              </h4>
              <p className="text-xs sm:text-sm text-neutral-400">
                10 Dedicated Tournament Rigs • 240Hz Fast IPS Displays • Ultra-low latency fiber LAN
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              onClick={onNavigateToReservations}
              className="flex-1 sm:flex-initial py-3 px-6 rounded-xl bg-red-600 hover:bg-red-500 text-white font-display font-black uppercase tracking-wider text-xs sm:text-sm transition-all shadow-[0_0_20px_rgba(220,38,38,0.4)] whitespace-nowrap"
            >
              Reserve a Station
            </button>
            <button
              onClick={onOpenRankingGuide}
              className="py-3 px-5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white font-display font-bold uppercase tracking-wider text-xs sm:text-sm transition-colors whitespace-nowrap"
            >
              How Ranks Work
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
