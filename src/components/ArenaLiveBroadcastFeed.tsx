import React, { useState, useEffect, useMemo } from 'react';
import confetti from 'canvas-confetti';
import { Tournament, TournamentMatch, ArenaNewsItem } from '../types';
import { subscribeToAllTournaments } from '../services/tournamentService';
import {
  deriveArenaNewsFromTournaments,
  formatRelativeTime,
  formatScheduledDateTime,
} from '../services/arenaNewsService';
import { ArenaTournamentNewsCard } from './ArenaTournamentNewsCard';
import { ArenaTournamentNewsDetailModal } from './ArenaTournamentNewsDetailModal';
import { ArenaTournamentAllNewsModal } from './ArenaTournamentAllNewsModal';
import { ArenaTournamentNewsCountdown } from './ArenaTournamentNewsCountdown';
import {
  Trophy,
  Radio,
  Swords,
  Flame,
  Layers,
  Calendar,
  Clock,
  Users,
  ArrowRight,
  Shield,
  Medal,
  ExternalLink,
  ChevronRight,
  Sparkles,
  CheckCircle2,
} from 'lucide-react';

interface ArenaLiveBroadcastFeedProps {
  onNavigateToTournaments?: (tournamentId?: string) => void;
  className?: string;
}

export const ArenaLiveBroadcastFeed: React.FC<ArenaLiveBroadcastFeedProps> = ({
  onNavigateToTournaments,
  className = '',
}) => {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [news, setNews] = useState<ArenaNewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTournamentId, setSelectedTournamentId] = useState<string>('ALL');
  const [selectedNews, setSelectedNews] = useState<ArenaNewsItem | null>(null);
  const [allNewsModalOpen, setAllNewsModalOpen] = useState(false);

  // Subscribe directly to the Single Source of Truth (Firestore Tournaments collection)
  useEffect(() => {
    const unsub = subscribeToAllTournaments((list) => {
      setTournaments(list);
      const derived = deriveArenaNewsFromTournaments(list);
      setNews(derived);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // Filtered news items based on active tournament selector
  const filteredNews = useMemo(() => {
    if (!news || !Array.isArray(news)) return [];
    if (selectedTournamentId === 'ALL') return news;
    return news.filter((n) => n && n.tournamentId === selectedTournamentId);
  }, [news, selectedTournamentId]);

  // Determine the primary active tournament to showcase in the Hero Broadcast
  const activeTournament = useMemo(() => {
    if (tournaments.length === 0) return null;
    if (selectedTournamentId !== 'ALL') {
      return tournaments.find((t) => t.id === selectedTournamentId) || tournaments[0];
    }
    // Priority order: Live > Registration Open > In Progress > Upcoming > Completed
    const live = tournaments.find(
      (t) => t.status === 'LIVE' || (t.matches && t.matches.some((m) => m.status === 'LIVE'))
    );
    if (live) return live;

    const regOpen = tournaments.find((t) => t.status === 'REGISTRATION_OPEN');
    if (regOpen) return regOpen;

    const inProgress = tournaments.find((t) => (t.status as string) === 'IN_PROGRESS');
    if (inProgress) return inProgress;

    const upcoming = tournaments.find((t) => t.status === 'UPCOMING');
    if (upcoming) return upcoming;

    return tournaments[0];
  }, [tournaments, selectedTournamentId]);

  // Derive Hero Broadcast Stage for the active tournament
  const heroStage = useMemo(() => {
    if (!activeTournament) return null;
    const t = activeTournament;
    const matches = t.matches || [];
    const participants = t.participants || [];
    const isCompleted = t.status === 'COMPLETED' || t.winnerAnnounced;
    const isRegistrationOpen = t.status === 'REGISTRATION_OPEN';
    const hasMatches = matches.length > 0;
    const liveMatch = matches.find((m) => m.status === 'LIVE');
    const isTournamentStarted =
      t.status === 'LIVE' || (t.status as string) === 'IN_PROGRESS' || Boolean(t.startedAt);

    // 1. CHAMPION CROWNED & TOURNAMENT ENDED
    if (t.winnerAnnounced && t.winnerId && t.winnerName) {
      const grandFinal = matches.find(
        (m) =>
          (m.roundName?.toLowerCase().includes('final') &&
            !m.roundName?.toLowerCase().includes('semi') &&
            !m.roundName?.toLowerCase().includes('3rd') &&
            !m.id.includes('3rd')) ||
          m.id.endsWith('_m_2_1')
      );
      const opponentName =
        t.runnerUpName ||
        (grandFinal
          ? grandFinal.participantA?.id === t.winnerId
            ? grandFinal.participantB?.name || grandFinal.participantBName
            : grandFinal.participantA?.name || grandFinal.participantAName
          : undefined) ||
        'Finalist';

      const finalScoreStr =
        grandFinal && grandFinal.scoreA !== undefined && grandFinal.scoreB !== undefined
          ? `${grandFinal.scoreA} — ${grandFinal.scoreB}`
          : undefined;

      let thirdPlaceName = t.thirdPlaceName;
      const thirdPlaceMatch = matches.find(
        (m) => m.id.includes('3rd') || m.roundName?.toLowerCase().includes('3rd')
      );
      if (!thirdPlaceName && thirdPlaceMatch && thirdPlaceMatch.winnerId) {
        const tpWinner =
          thirdPlaceMatch.winnerId === thirdPlaceMatch.participantA?.id
            ? thirdPlaceMatch.participantA?.name
            : thirdPlaceMatch.participantB?.name;
        if (tpWinner) thirdPlaceName = tpWinner;
      }

      return {
        type: 'CHAMPION' as const,
        tournament: t,
        winnerName: t.winnerName,
        winnerAvatar: t.winnerAvatarUrl,
        opponentName,
        finalScoreStr,
        thirdPlaceName,
        prize: t.prizePool,
      };
    }

    // 2. GRAND FINAL LIVE
    if (liveMatch) {
      const isGrandFinal =
        (liveMatch.roundName?.toLowerCase().includes('final') &&
          !liveMatch.roundName?.toLowerCase().includes('semi') &&
          !liveMatch.roundName?.toLowerCase().includes('3rd') &&
          !liveMatch.id.includes('3rd')) ||
        liveMatch.id.endsWith('_m_2_1');

      if (isGrandFinal) {
        return {
          type: 'GRAND_FINAL_LIVE' as const,
          tournament: t,
          match: liveMatch,
        };
      }

      // 3. REGULAR MATCH LIVE
      return {
        type: 'MATCH_LIVE' as const,
        tournament: t,
        match: liveMatch,
      };
    }

    // 4. TOURNAMENT STARTED (Tournament underway, but current match in transition)
    if (isTournamentStarted && hasMatches && !isCompleted) {
      const minRound = Math.min(...matches.map((m) => m.round || 1));
      const initialMatches = matches.filter((m) => (m.round || 1) === minRound);

      return {
        type: 'TOURNAMENT_STARTED' as const,
        tournament: t,
        initialMatches,
        allMatches: matches,
      };
    }

    // 5. OFFICIAL MATCH STAGES LOCKED (Admin generated shuffle/bracket)
    if (hasMatches && participants.length >= 2 && !isCompleted) {
      const minRound = Math.min(...matches.map((m) => m.round || 1));
      const initialMatches = matches.filter((m) => (m.round || 1) === minRound);

      return {
        type: 'OFFICIAL_MATCH_STAGES' as const,
        tournament: t,
        initialMatches,
        allMatches: matches,
      };
    }

    // 6. TOURNAMENT CREATED / BEFORE THE DRAW (REGISTRATION OPEN)
    return {
      type: 'ANNOUNCEMENT' as const,
      tournament: t,
      isRegistrationOpen,
    };
  }, [activeTournament]);

  // Fire celebratory confetti when Champion is crowned
  useEffect(() => {
    if (heroStage?.type === 'CHAMPION') {
      try {
        confetti({
          particleCount: 60,
          spread: 75,
          origin: { y: 0.6 },
          colors: ['#f59e0b', '#ef4444', '#ffffff', '#fbbf24'],
        });
      } catch (e) {
        // Safe fallback
      }
    }
  }, [heroStage?.type, activeTournament?.id]);

  const handleNavigateToTournament = (tournamentId?: string) => {
    if (onNavigateToTournaments) {
      onNavigateToTournaments(tournamentId);
    }
  };

  // Loading state
  if (loading && news.length === 0) {
    return (
      <div
        className={`p-8 rounded-3xl bg-[#0a0b0f] border border-neutral-800 flex items-center justify-center text-slate-400 font-mono text-xs gap-3 ${className}`}
      >
        <div className="w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
        <span>Synchronizing Arena Live Broadcast Feed...</span>
      </div>
    );
  }

  // Standby state if no tournaments exist in database
  if (!activeTournament || news.length === 0) {
    return (
      <section
        className={`relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#14080a] via-[#090a0e] to-[#07080a] border border-red-600/30 p-6 sm:p-8 ${className}`}
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-950/40 border border-red-500/30 text-red-400 text-xs font-mono font-bold">
              <Radio className="w-3.5 h-3.5 text-red-500 animate-pulse" />
              <span>BROADCAST STANDBY</span>
            </div>
            <h3 className="text-xl sm:text-2xl font-black font-display text-white">
              ⚡ ARENA LIVE BROADCAST FEED
            </h3>
            <p className="text-xs text-slate-400 font-mono">
              Live tournament announcements, random shuffle stages, matches, results, and champions will broadcast here automatically.
            </p>
          </div>

          {onNavigateToTournaments && (
            <button
              onClick={() => handleNavigateToTournament()}
              className="px-5 py-3 rounded-2xl bg-red-600 hover:bg-red-500 text-white font-mono font-bold text-xs uppercase tracking-wider transition-all shadow-[0_0_15px_rgba(239,68,68,0.3)] shrink-0 flex items-center gap-2 active:scale-95 cursor-pointer"
            >
              <span>Explore Tournaments</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </section>
    );
  }

  const { dateStr, timeStr } = formatScheduledDateTime(activeTournament.startDate);

  return (
    <section className={`space-y-6 ${className}`}>
      {/* ========================================================================= */}
      {/* 1. SECTION HEADER WITH SINGLE TOURNAMENT FEED BRANDING */}
      {/* ========================================================================= */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-950/70 border border-red-500/50 text-red-400 text-xs font-mono font-bold mb-2 shadow-[0_0_15px_rgba(239,68,68,0.3)]">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
            <span>LIVE BROADCAST FEED</span>
          </div>

          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black font-display text-white tracking-tight flex items-center gap-2 sm:gap-3 flex-wrap">
            <span>⚡ ARENA LIVE</span>
            <span className="text-red-500 font-mono font-normal">/</span>
            <span className="text-slate-300 font-display font-bold">BROADCAST FEED</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-2xl font-mono">
            Direct public esports stream powered by the official Nexus tournament system. Automatic lifecycle updates in real time.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap self-start sm:self-auto">
          {/* Tournament filter selector if multiple tournaments exist */}
          {tournaments.length > 1 && (
            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-neutral-900 border border-neutral-800 text-xs font-mono">
              <span className="text-slate-500 text-[10px] uppercase font-bold px-2">Show:</span>
              <button
                onClick={() => setSelectedTournamentId('ALL')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${
                  selectedTournamentId === 'ALL'
                    ? 'bg-red-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                All
              </button>
              {tournaments.slice(0, 3).map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSelectedTournamentId(t.id)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold truncate max-w-[110px] transition-colors ${
                    selectedTournamentId === t.id
                      ? 'bg-red-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title={t.name}
                >
                  {t.name}
                </button>
              ))}
            </div>
          )}

          {news.length > 0 && (
            <button
              onClick={() => setAllNewsModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-red-400 hover:text-white border border-neutral-800 hover:border-red-600/40 font-mono text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
            >
              <span>ALL BROADCASTS</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. THE TOP HERO BROADCAST CARD (CURRENT TOURNAMENT LIFECYCLE STAGE) */}
      {/* ========================================================================= */}
      {heroStage && (
        <div
          className={`relative overflow-hidden rounded-3xl border p-6 sm:p-8 transition-all duration-300 shadow-2xl ${
            heroStage.type === 'CHAMPION'
              ? 'bg-gradient-to-br from-[#2b1014] via-[#140b0e] to-[#08080c] border-amber-500/60 shadow-[0_0_45px_rgba(245,158,11,0.25)]'
              : heroStage.type === 'GRAND_FINAL_LIVE'
              ? 'bg-gradient-to-br from-[#300c12] via-[#16080b] to-[#07080a] border-amber-500/80 shadow-[0_0_40px_rgba(245,158,11,0.3)]'
              : heroStage.type === 'MATCH_LIVE'
              ? 'bg-gradient-to-br from-[#2d0c10] via-[#14080b] to-[#07080a] border-red-500 shadow-[0_0_35px_rgba(239,68,68,0.35)]'
              : heroStage.type === 'TOURNAMENT_STARTED'
              ? 'bg-gradient-to-br from-[#240c14] via-[#120912] to-[#07080c] border-red-500/60 shadow-[0_0_30px_rgba(239,68,68,0.25)]'
              : heroStage.type === 'OFFICIAL_MATCH_STAGES'
              ? 'bg-gradient-to-br from-[#121422] via-[#0d0f17] to-[#06070a] border-cyan-500/60 shadow-[0_0_30px_rgba(6,182,212,0.2)]'
              : 'bg-gradient-to-br from-[#1c0d12] via-[#0e0f14] to-[#07080b] border-red-500/60 shadow-[0_0_35px_rgba(239,68,68,0.2)]'
          }`}
        >
          {/* Top glowing laser line */}
          <div
            className={`absolute top-0 left-0 right-0 h-1.5 ${
              heroStage.type === 'CHAMPION'
                ? 'bg-gradient-to-r from-amber-500 via-red-500 to-amber-500'
                : heroStage.type === 'GRAND_FINAL_LIVE'
                ? 'bg-gradient-to-r from-amber-500 via-red-500 to-amber-500 animate-pulse'
                : heroStage.type === 'MATCH_LIVE'
                ? 'bg-gradient-to-r from-transparent via-red-500 to-transparent animate-pulse'
                : heroStage.type === 'TOURNAMENT_STARTED'
                ? 'bg-gradient-to-r from-red-600 via-amber-500 to-red-600'
                : heroStage.type === 'OFFICIAL_MATCH_STAGES'
                ? 'bg-gradient-to-r from-cyan-500 via-red-500 to-cyan-500'
                : 'bg-gradient-to-r from-red-500 via-amber-500 to-red-500'
            }`}
          />

          <div className="relative z-10 space-y-6">
            {/* Top row: Stage Badge & Tournament info */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2.5 flex-wrap">
                {/* 1. STAGE BADGES */}
                {heroStage.type === 'CHAMPION' && (
                  <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-amber-500/20 border border-amber-500/60 text-amber-300 text-xs font-mono font-black uppercase tracking-wider shadow-[0_0_15px_rgba(245,158,11,0.4)]">
                    <Trophy className="w-4 h-4 text-amber-400" />
                    <span>🏆 TOURNAMENT WINNER</span>
                  </span>
                )}

                {heroStage.type === 'GRAND_FINAL_LIVE' && (
                  <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-red-950/80 border border-amber-500/80 text-amber-300 text-xs font-mono font-black uppercase tracking-wider shadow-[0_0_20px_rgba(245,158,11,0.4)] animate-pulse">
                    <Flame className="w-4 h-4 text-amber-400" />
                    <span>🔥 GRAND FINAL — LIVE</span>
                  </span>
                )}

                {heroStage.type === 'MATCH_LIVE' && (
                  <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-red-950/80 border border-red-500 text-red-400 text-xs font-mono font-black uppercase tracking-wider shadow-[0_0_18px_rgba(239,68,68,0.4)] animate-pulse">
                    <span className="w-2 h-2 rounded-full bg-red-500" />
                    <span>🔴 LIVE NOW</span>
                  </span>
                )}

                {heroStage.type === 'TOURNAMENT_STARTED' && (
                  <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-red-950/80 border border-red-500/70 text-red-300 text-xs font-mono font-black uppercase tracking-wider shadow-[0_0_15px_rgba(239,68,68,0.3)]">
                    <Radio className="w-4 h-4 text-red-500 animate-pulse" />
                    <span>🔴 TOURNAMENT STARTED</span>
                  </span>
                )}

                {heroStage.type === 'OFFICIAL_MATCH_STAGES' && (
                  <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-cyan-950/70 border border-cyan-500/70 text-cyan-300 text-xs font-mono font-black uppercase tracking-wider shadow-[0_0_15px_rgba(6,182,212,0.3)]">
                    <Swords className="w-4 h-4 text-cyan-400" />
                    <span>⚔️ OFFICIAL TOURNAMENT MATCH STAGES</span>
                  </span>
                )}

                {heroStage.type === 'ANNOUNCEMENT' && (
                  <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-red-950/80 border border-red-500 text-red-400 text-xs font-mono font-black uppercase tracking-wider shadow-[0_0_15px_rgba(239,68,68,0.3)]">
                    <Trophy className="w-4 h-4 text-red-400" />
                    <span>🏆 NEW TOURNAMENT</span>
                  </span>
                )}

                <span className="text-xs font-mono text-slate-400">
                  {activeTournament.name} • {activeTournament.gameName}
                </span>
              </div>

              {/* Status pill or relative time */}
              <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
                {activeTournament.status === 'REGISTRATION_OPEN' && (
                  <span className="px-2.5 py-1 rounded-full bg-emerald-950/70 border border-emerald-500/50 text-emerald-400 font-bold">
                    ⚡ Registration Open
                  </span>
                )}
                {activeTournament.status === 'LIVE' && (
                  <span className="px-2.5 py-1 rounded-full bg-red-950/70 border border-red-500/50 text-red-400 font-bold animate-pulse">
                    ● Tournament Active
                  </span>
                )}
                {activeTournament.status === 'COMPLETED' && (
                  <span className="px-2.5 py-1 rounded-full bg-amber-950/70 border border-amber-500/50 text-amber-300 font-bold">
                    🏆 Completed
                  </span>
                )}
              </div>
            </div>

            {/* ========================================================================= */}
            {/* HERO BODY VARIATION BY STAGE */}
            {/* ========================================================================= */}

            {/* STAGE 1 & 2: TOURNAMENT CREATED / BEFORE THE DRAW */}
            {heroStage.type === 'ANNOUNCEMENT' && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-2xl sm:text-3xl lg:text-4xl font-black font-display text-white tracking-tight">
                    🏆 {activeTournament.name.toUpperCase()}
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-2xl font-mono leading-relaxed">
                    Official Nexus {activeTournament.gameName} Tournament. Registration is currently open for confirmed {activeTournament.type === 'TEAM' ? 'teams' : 'players'}.
                  </p>
                </div>

                {/* Specifics grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                  <div className="p-3.5 rounded-2xl bg-black/60 border border-neutral-800">
                    <span className="text-slate-500 block text-[10px] uppercase font-bold">📅 Date</span>
                    <span className="text-white font-bold text-sm sm:text-base mt-0.5 block">{dateStr}</span>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-black/60 border border-neutral-800">
                    <span className="text-slate-500 block text-[10px] uppercase font-bold">⏰ Start Time</span>
                    <span className="text-white font-bold text-sm sm:text-base mt-0.5 block">{timeStr}</span>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-black/60 border border-neutral-800">
                    <span className="text-slate-500 block text-[10px] uppercase font-bold">👥 Confirmed</span>
                    <span className="text-red-400 font-bold text-sm sm:text-base mt-0.5 block">
                      {activeTournament.participants?.length || 0} / {activeTournament.maxParticipants || 16}{' '}
                      <span className="text-[11px] text-slate-400 font-normal">
                        {activeTournament.type === 'TEAM' ? 'Teams' : 'Players'}
                      </span>
                    </span>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-amber-950/30 border border-amber-500/30">
                    <span className="text-amber-500 block text-[10px] uppercase font-bold">🏆 Prize Pool</span>
                    <span className="text-amber-300 font-bold text-sm sm:text-base mt-0.5 block">
                      {activeTournament.prizePool || 'Official Trophy'}
                    </span>
                  </div>
                </div>

                {/* CTA Action Bar */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <div className="text-xs font-mono text-slate-400 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                    <span>Real-time team verification active</span>
                  </div>

                  <button
                    onClick={() => handleNavigateToTournament(activeTournament.id)}
                    className="px-6 py-3.5 rounded-2xl bg-red-600 hover:bg-red-500 text-white font-mono font-black text-xs uppercase tracking-wider transition-all shadow-[0_0_25px_rgba(239,68,68,0.4)] border border-red-500 flex items-center gap-2 active:scale-95 cursor-pointer"
                  >
                    <span>JOIN TOURNAMENT</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* STAGE 3 & 4: OFFICIAL MATCH STAGES & TOURNAMENT STARTED */}
            {(heroStage.type === 'OFFICIAL_MATCH_STAGES' || heroStage.type === 'TOURNAMENT_STARTED') && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-2xl sm:text-3xl lg:text-4xl font-black font-display text-white tracking-tight">
                    {heroStage.type === 'TOURNAMENT_STARTED'
                      ? `🔴 ${activeTournament.name.toUpperCase()} IS OFFICIALLY UNDERWAY!`
                      : `⚔️ OFFICIAL MATCH STAGES FOR ${activeTournament.name.toUpperCase()}`}
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-2xl font-mono leading-relaxed">
                    {heroStage.type === 'TOURNAMENT_STARTED'
                      ? 'Admin has officially commenced the tournament. Match play has started across the arena with confirmed teams visible below.'
                      : `Admin has locked the bracket and performed the official random shuffle. Below are the ${heroStage.initialMatches.length} official first-round matchups.`}
                  </p>
                </div>

                {/* Matchup Grid (dynamically renders actual matches: 2 for 4 teams, 4 for 8, 8 for 16, or dynamic with BYEs) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {heroStage.initialMatches.map((m, idx) => {
                    const nameA = m.participantA?.name || m.participantAName || 'TBD';
                    const nameB = m.participantB?.name || m.participantBName || (m.isBye ? 'BYE' : 'TBD');
                    const isMatchLive = m.status === 'LIVE';
                    const isDone = m.status === 'COMPLETED' || m.status === 'CONFIRMED' || m.adminApproved;

                    return (
                      <div
                        key={m.id || idx}
                        className={`p-3.5 rounded-2xl border transition-all ${
                          isMatchLive
                            ? 'bg-red-950/60 border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.3)]'
                            : isDone
                            ? 'bg-neutral-900/90 border-neutral-800'
                            : 'bg-black/60 border-neutral-800 hover:border-neutral-700'
                        }`}
                      >
                        <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 uppercase font-bold mb-2">
                          <span>{m.roundName || `Match ${idx + 1}`}</span>
                          {isMatchLive ? (
                            <span className="text-red-400 font-black animate-pulse flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                              LIVE
                            </span>
                          ) : isDone ? (
                            <span className="text-slate-400">FINISHED</span>
                          ) : (
                            <span>{formatScheduledDateTime(m.scheduledTime || activeTournament.startDate).timeStr}</span>
                          )}
                        </div>

                        {/* Team A */}
                        <div className="flex items-center justify-between gap-2 text-xs font-mono py-1">
                          <span
                            className={`font-bold truncate ${
                              m.winnerId === m.participantA?.id ? 'text-amber-300' : 'text-white'
                            }`}
                          >
                            {nameA}
                          </span>
                          {m.scoreA !== undefined && (
                            <span className="font-mono font-black text-red-400 bg-black/60 px-1.5 py-0.5 rounded">
                              {m.scoreA}
                            </span>
                          )}
                        </div>

                        <div className="text-[10px] text-center text-slate-600 font-black font-display uppercase tracking-widest my-0.5">
                          VS
                        </div>

                        {/* Team B */}
                        <div className="flex items-center justify-between gap-2 text-xs font-mono py-1">
                          <span
                            className={`font-bold truncate ${
                              m.winnerId === m.participantB?.id ? 'text-amber-300' : 'text-white'
                            }`}
                          >
                            {nameB}
                          </span>
                          {m.scoreB !== undefined && (
                            <span className="font-mono font-black text-red-400 bg-black/60 px-1.5 py-0.5 rounded">
                              {m.scoreB}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* CTA Action Bar */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <div className="text-xs font-mono text-slate-400 flex items-center gap-2">
                    <Layers className="w-3.5 h-3.5 text-cyan-400" />
                    <span>
                      {activeTournament.participants?.length || 0} Official Teams • {activeTournament.matches?.length || 0} Tournament Matches Total
                    </span>
                  </div>

                  <button
                    onClick={() => handleNavigateToTournament(activeTournament.id)}
                    className="px-6 py-3.5 rounded-2xl bg-cyan-600 hover:bg-cyan-500 text-white font-mono font-black text-xs uppercase tracking-wider transition-all shadow-[0_0_20px_rgba(6,182,212,0.35)] border border-cyan-500 flex items-center gap-2 active:scale-95 cursor-pointer"
                  >
                    <span>VIEW OFFICIAL BRACKET</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* STAGE 5: MATCH LIVE (OR GRAND FINAL LIVE) */}
            {(heroStage.type === 'MATCH_LIVE' || heroStage.type === 'GRAND_FINAL_LIVE') && heroStage.match && (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="text-2xl sm:text-3xl lg:text-4xl font-black font-display text-white tracking-tight">
                      {heroStage.match.participantA?.name || 'Team 1'} 🆚 {heroStage.match.participantB?.name || 'Team 2'}
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-300 mt-1 font-mono">
                      {heroStage.match.roundName || 'Official Match'} • Scheduled:{' '}
                      {formatScheduledDateTime(heroStage.match.scheduledTime).timeStr} • Started:{' '}
                      {formatScheduledDateTime(heroStage.match.actualStartedAt).timeStr}
                      {heroStage.match.station ? ` • Station ${heroStage.match.station}` : ''}
                    </p>
                  </div>

                  {heroStage.type === 'GRAND_FINAL_LIVE' && (
                    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/20 border border-amber-500/50 text-amber-300 text-xs font-mono font-bold">
                      <Trophy className="w-4 h-4 text-amber-400" />
                      <span>CHAMPIONSHIP STAKE</span>
                    </div>
                  )}
                </div>

                {/* Big Live Versus Score Display */}
                <div className="p-5 rounded-2xl bg-black/70 border border-red-600/40">
                  <div className="grid grid-cols-3 items-center text-center">
                    {/* Team A */}
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-16 h-16 rounded-2xl bg-neutral-900 border border-neutral-700 flex items-center justify-center text-2xl overflow-hidden shadow-lg">
                        {heroStage.match.participantA?.avatarUrl ? (
                          <img
                            src={heroStage.match.participantA.avatarUrl}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span>🛡️</span>
                        )}
                      </div>
                      <span className="font-black font-display text-base sm:text-xl text-white truncate max-w-[150px]">
                        {heroStage.match.participantA?.name || 'Team A'}
                      </span>
                    </div>

                    {/* Live Score Ticker */}
                    <div className="flex flex-col items-center justify-center">
                      <div className="flex items-center gap-3 text-3xl sm:text-5xl font-black font-display text-white">
                        <span className="text-red-400">{heroStage.match.scoreA ?? 0}</span>
                        <span className="text-slate-600 text-2xl sm:text-3xl">—</span>
                        <span className="text-red-400">{heroStage.match.scoreB ?? 0}</span>
                      </div>
                      <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-red-950/80 border border-red-500 text-red-400 text-[10px] font-mono font-black animate-pulse">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                        <span>LIVE IN ARENA</span>
                      </div>
                    </div>

                    {/* Team B */}
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-16 h-16 rounded-2xl bg-neutral-900 border border-neutral-700 flex items-center justify-center text-2xl overflow-hidden shadow-lg">
                        {heroStage.match.participantB?.avatarUrl ? (
                          <img
                            src={heroStage.match.participantB.avatarUrl}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span>⚔️</span>
                        )}
                      </div>
                      <span className="font-black font-display text-base sm:text-xl text-white truncate max-w-[150px]">
                        {heroStage.match.participantB?.name || 'Team B'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Action Bar */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <span className="text-xs font-mono text-slate-400">
                    Real-time official score synced with referee desk
                  </span>

                  <button
                    onClick={() => handleNavigateToTournament(activeTournament.id)}
                    className="px-6 py-3.5 rounded-2xl bg-red-600 hover:bg-red-500 text-white font-mono font-black text-xs uppercase tracking-wider transition-all shadow-[0_0_20px_rgba(239,68,68,0.4)] border border-red-500 flex items-center gap-2 active:scale-95 cursor-pointer"
                  >
                    <span>VIEW LIVE BRACKET</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* STAGE 8: CHAMPION CROWNED */}
            {heroStage.type === 'CHAMPION' && (
              <div className="space-y-5">
                <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
                  <div>
                    <div className="text-xs font-mono text-amber-400 uppercase tracking-widest font-black flex items-center gap-1.5 mb-1">
                      <Sparkles className="w-4 h-4 text-amber-400" />
                      <span>OFFICIAL TOURNAMENT CHAMPION DECLARED</span>
                    </div>
                    <h3 className="text-3xl sm:text-4xl lg:text-5xl font-black font-display text-white tracking-tight flex items-center gap-3">
                      <span>🥇 {heroStage.winnerName.toUpperCase()}</span>
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-300 mt-2 font-mono">
                      Defeated {heroStage.opponentName}
                      {heroStage.finalScoreStr ? ` (${heroStage.finalScoreStr})` : ''} in the Grand Finals of{' '}
                      {activeTournament.name}. Certified by Nexus Esports Arena.
                    </p>
                  </div>

                  {heroStage.prize && (
                    <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/40 text-center shrink-0">
                      <span className="text-[10px] font-mono text-amber-400 uppercase font-black block">Prize Awarded</span>
                      <span className="text-xl sm:text-2xl font-black font-display text-amber-300 mt-0.5 block">
                        {heroStage.prize}
                      </span>
                    </div>
                  )}
                </div>

                {/* Podium Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono">
                  {/* 1st Place */}
                  <div className="p-4 rounded-2xl bg-amber-950/40 border border-amber-500/50 flex items-center gap-3 shadow-[0_0_20px_rgba(245,158,11,0.2)]">
                    <span className="text-2xl">🥇</span>
                    <div>
                      <span className="text-[10px] text-amber-400 uppercase font-bold block">1st Place / Champion</span>
                      <strong className="text-white text-sm font-display block mt-0.5">{heroStage.winnerName}</strong>
                    </div>
                  </div>

                  {/* 2nd Place */}
                  <div className="p-4 rounded-2xl bg-neutral-900/80 border border-neutral-800 flex items-center gap-3">
                    <span className="text-2xl">🥈</span>
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-bold block">2nd Place / Runner-Up</span>
                      <strong className="text-slate-200 text-sm font-display block mt-0.5">{heroStage.opponentName}</strong>
                    </div>
                  </div>

                  {/* 3rd Place */}
                  <div className="p-4 rounded-2xl bg-neutral-900/80 border border-neutral-800 flex items-center gap-3">
                    <span className="text-2xl">🥉</span>
                    <div>
                      <span className="text-[10px] text-amber-600 uppercase font-bold block">3rd Place Podium</span>
                      <strong className="text-slate-200 text-sm font-display block mt-0.5">
                        {heroStage.thirdPlaceName || 'Official Competitor'}
                      </strong>
                    </div>
                  </div>
                </div>

                {/* CTA Action Bar */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <span className="text-xs font-mono text-amber-300 flex items-center gap-2">
                    <Trophy className="w-4 h-4 text-amber-400" />
                    <span>Hall of Fame induction recorded</span>
                  </span>

                  <button
                    onClick={() => handleNavigateToTournament(activeTournament.id)}
                    className="px-6 py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-mono font-black text-xs uppercase tracking-wider transition-all shadow-[0_0_25px_rgba(245,158,11,0.4)] border border-amber-400 flex items-center gap-2 active:scale-95 cursor-pointer"
                  >
                    <span>VIEW TOURNAMENT STANDINGS</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. TOURNAMENT LIFECYCLE PROGRESSION TRACK */}
      {/* Visual step chain keeping the complete progression visible */}
      {/* ========================================================================= */}
      {activeTournament && (
        <div className="p-4 sm:p-5 rounded-2xl bg-[#090a0e] border border-neutral-800 space-y-3">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5 text-red-500" />
              <span>TOURNAMENT LIFECYCLE PROGRESSION</span>
            </span>
            <span className="text-slate-500 text-[11px]">Auto-Synced with Firestore</span>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs font-mono no-scrollbar">
            <div
              className={`px-3 py-1.5 rounded-xl border whitespace-nowrap flex items-center gap-1.5 ${
                activeTournament.createdAt
                  ? 'bg-neutral-900 text-slate-200 border-neutral-700'
                  : 'bg-black text-slate-600 border-neutral-900'
              }`}
            >
              <span>1. Created</span>
            </div>

            <ChevronRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />

            <div
              className={`px-3 py-1.5 rounded-xl border whitespace-nowrap flex items-center gap-1.5 ${
                activeTournament.status === 'REGISTRATION_OPEN'
                  ? 'bg-red-950/70 text-red-400 border-red-500 font-bold'
                  : activeTournament.participants?.length
                  ? 'bg-neutral-900 text-slate-300 border-neutral-800'
                  : 'bg-black text-slate-600 border-neutral-900'
              }`}
            >
              <span>2. Registration</span>
            </div>

            <ChevronRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />

            <div
              className={`px-3 py-1.5 rounded-xl border whitespace-nowrap flex items-center gap-1.5 ${
                activeTournament.matches?.length
                  ? 'bg-cyan-950/60 text-cyan-300 border-cyan-500/60 font-bold'
                  : 'bg-black text-slate-600 border-neutral-900'
              }`}
            >
              <span>3. Random Shuffle</span>
            </div>

            <ChevronRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />

            <div
              className={`px-3 py-1.5 rounded-xl border whitespace-nowrap flex items-center gap-1.5 ${
                activeTournament.status === 'LIVE' || (activeTournament.status as string) === 'IN_PROGRESS'
                  ? 'bg-red-950/70 text-red-400 border-red-500 font-bold animate-pulse'
                  : activeTournament.matches?.some((m) => m.status === 'COMPLETED')
                  ? 'bg-neutral-900 text-slate-300 border-neutral-800'
                  : 'bg-black text-slate-600 border-neutral-900'
              }`}
            >
              <span>4. Matches Live</span>
            </div>

            <ChevronRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />

            <div
              className={`px-3 py-1.5 rounded-xl border whitespace-nowrap flex items-center gap-1.5 ${
                activeTournament.winnerAnnounced
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500 font-bold'
                  : 'bg-black text-slate-600 border-neutral-900'
              }`}
            >
              <span>5. Champion Crowned</span>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. CHRONOLOGICAL BROADCAST FEED DISPATCHES (NEWS STREAM) */}
      {/* ========================================================================= */}
      {filteredNews.length > 0 && (
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-slate-400 uppercase font-bold tracking-wider">
              Recent Broadcast Dispatches ({filteredNews.length})
            </span>
            <button
              onClick={() => setAllNewsModalOpen(true)}
              className="text-red-400 hover:text-white font-bold flex items-center gap-1 uppercase transition-colors cursor-pointer"
            >
              <span>Full Feed History</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredNews.slice(0, 4).map((item, idx) => (
              <ArenaTournamentNewsCard
                key={item.newsId || idx}
                item={item}
                onClick={(it) => setSelectedNews(it)}
                index={idx}
              />
            ))}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. MODALS */}
      {/* ========================================================================= */}
      <ArenaTournamentNewsDetailModal
        newsItem={selectedNews}
        onClose={() => setSelectedNews(null)}
        onNavigateToTournament={handleNavigateToTournament}
      />

      <ArenaTournamentAllNewsModal
        isOpen={allNewsModalOpen}
        onClose={() => setAllNewsModalOpen(false)}
        news={news}
        newsItems={news}
        onSelectNews={(it) => {
          setAllNewsModalOpen(false);
          setSelectedNews(it);
        }}
        onNavigateToTournament={handleNavigateToTournament}
      />
    </section>
  );
};
