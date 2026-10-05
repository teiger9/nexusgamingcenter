import React, { useEffect } from 'react';
import confetti from 'canvas-confetti';
import { ArenaNewsItem } from '../types';
import { formatRelativeTime, formatScheduledDateTime } from '../services/arenaNewsService';
import { ArenaTournamentNewsCountdown } from './ArenaTournamentNewsCountdown';
import {
  Trophy,
  Radio,
  Swords,
  Medal,
  ArrowRight,
  Sparkles,
  Flame,
  Calendar,
  Clock,
  Shield,
  CheckCircle2,
  ExternalLink,
  Users,
  Layers,
} from 'lucide-react';

interface ArenaTournamentNewsFeaturedCardProps {
  item: ArenaNewsItem;
  onClick: (item: ArenaNewsItem) => void;
  onNavigateToTournament: (tournamentId: string) => void;
}

export const ArenaTournamentNewsFeaturedCard: React.FC<ArenaTournamentNewsFeaturedCardProps> = ({
  item,
  onClick,
  onNavigateToTournament,
}) => {
  const { dateStr, timeStr } = formatScheduledDateTime(item.scheduledAt || item.tournamentDate || item.timestamp);

  // Trigger celebration confetti for CHAMPION
  useEffect(() => {
    if (item.eventType === 'CHAMPION') {
      try {
        confetti({
          particleCount: 50,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#ef4444', '#dc2626', '#f59e0b', '#ffffff'],
        });
      } catch (e) {
        // Safe fallback
      }
    }
  }, [item.newsId, item.eventType]);

  const isChampion = item.eventType === 'CHAMPION';
  const isLive = item.eventType === 'MATCH_LIVE';
  const isQualification = item.eventType === 'QUALIFIED';
  const isUpcoming = item.eventType === 'UPCOMING_MATCH';
  const isAnnouncement = item.eventType === 'TOURNAMENT_ANNOUNCEMENT';
  const isOfficialStages = item.eventType === 'OFFICIAL_MATCH_STAGES';

  const dateDisplay = item.tournamentDate
    ? new Date(item.tournamentDate).toLocaleDateString('en-US', { day: 'numeric', month: 'long' })
    : dateStr;

  return (
    <div
      className={`relative overflow-hidden rounded-3xl border p-6 sm:p-8 transition-all duration-300 ${
        isChampion
          ? 'bg-gradient-to-br from-[#2a1013] via-[#120a0d] to-[#08080c] border-amber-500/50 shadow-[0_0_40px_rgba(245,158,11,0.25)]'
          : isLive
          ? 'bg-gradient-to-br from-[#2b0c10] via-[#14080b] to-[#07080a] border-red-500 shadow-[0_0_35px_rgba(239,68,68,0.3)]'
          : isAnnouncement
          ? 'bg-gradient-to-br from-[#1c0d12] via-[#0e0f14] to-[#07080b] border-red-500/60 shadow-[0_0_35px_rgba(239,68,68,0.2)]'
          : isOfficialStages
          ? 'bg-gradient-to-br from-[#1a0c14] via-[#0d0f15] to-[#06070a] border-cyan-500/50 shadow-[0_0_30px_rgba(6,182,212,0.15)]'
          : 'bg-gradient-to-br from-[#1c0a0e] via-[#0d0e12] to-[#060709] border-red-600/40 shadow-2xl'
      }`}
    >
      {/* Top Ambient Glow & HUD line */}
      <div
        className={`absolute top-0 left-0 right-0 h-1.5 ${
          isChampion
            ? 'bg-gradient-to-r from-amber-500 via-red-500 to-amber-500'
            : isLive
            ? 'bg-gradient-to-r from-transparent via-red-500 to-transparent animate-pulse'
            : isAnnouncement
            ? 'bg-gradient-to-r from-red-500 via-amber-500 to-red-500'
            : isOfficialStages
            ? 'bg-gradient-to-r from-cyan-500 via-red-500 to-cyan-500'
            : 'bg-gradient-to-r from-transparent via-red-600 to-transparent'
        }`}
      />

      <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
        {/* Left: Event Details */}
        <div className="space-y-4 max-w-2xl">
          {/* Status Chip & Tournament Name */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {isChampion && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500/50 text-amber-300 text-xs font-mono font-black uppercase tracking-wider shadow-[0_0_15px_rgba(245,158,11,0.3)]">
                <Trophy className="w-3.5 h-3.5 text-amber-400" />
                <span>TOURNAMENT CHAMPION</span>
              </span>
            )}

            {isAnnouncement && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-950/80 border border-red-500 text-red-400 text-xs font-mono font-black uppercase tracking-wider shadow-[0_0_15px_rgba(239,68,68,0.3)]">
                <Trophy className="w-3.5 h-3.5 text-red-400" />
                <span>NEW OFFICIAL TOURNAMENT</span>
              </span>
            )}

            {isOfficialStages && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-950/70 border border-cyan-500/60 text-cyan-300 text-xs font-mono font-black uppercase tracking-wider shadow-[0_0_15px_rgba(6,182,212,0.25)]">
                <Swords className="w-3.5 h-3.5 text-cyan-400" />
                <span>OFFICIAL TOURNAMENT MATCH STAGES</span>
              </span>
            )}

            {isLive && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-950/80 border border-red-500 text-red-400 text-xs font-mono font-black uppercase tracking-wider shadow-[0_0_15px_rgba(239,68,68,0.4)] animate-pulse">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                <span>LIVE IN THE ARENA</span>
              </span>
            )}

            {isQualification && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-950/60 border border-red-500/50 text-red-300 text-xs font-mono font-black uppercase tracking-wider">
                <Trophy className="w-3.5 h-3.5 text-red-400" />
                <span>OFFICIAL QUALIFICATION</span>
              </span>
            )}

            {isUpcoming && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-neutral-900 border border-neutral-700 text-slate-300 text-xs font-mono font-bold uppercase tracking-wider">
                <Swords className="w-3.5 h-3.5 text-red-400" />
                <span>NEXT MATCH SCHEDULED</span>
              </span>
            )}

            <span className="text-xs font-mono text-slate-400">
              {item.tournamentName} {item.roundName ? `• ${item.roundName}` : ''}
            </span>

            <span className="text-xs font-mono text-slate-500">
              ({formatRelativeTime(item.timestamp)})
            </span>
          </div>

          {/* Large Headline */}
          <div>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black font-display text-white tracking-tight leading-tight">
              {item.headline}
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 mt-2 leading-relaxed">
              {item.description}
            </p>
          </div>

          {/* 1. TOURNAMENT ANNOUNCEMENT SPECIFIC DETAILS BADGES */}
          {isAnnouncement && (
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-900/90 border border-neutral-800 text-xs font-mono text-slate-300">
                <Calendar className="w-3.5 h-3.5 text-red-400" />
                <span>📅 {dateDisplay}</span>
              </div>

              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-900/90 border border-neutral-800 text-xs font-mono text-slate-300">
                <Users className="w-3.5 h-3.5 text-red-400" />
                <span>👥 {item.confirmedCount ?? 0}/{item.maxParticipants ?? 16} {item.tournamentType === 'TEAM' ? 'Teams' : 'Players'}</span>
              </div>

              {item.prizePool && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-950/40 border border-amber-500/40 text-xs font-mono text-amber-300 font-bold">
                  <Trophy className="w-3.5 h-3.5 text-amber-400" />
                  <span>🏆 Prize: {item.prizePool}</span>
                </div>
              )}

              {item.registrationStatus === 'OPEN' && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-xs font-mono text-emerald-400 font-bold">
                  <span>⚡ Registration Open</span>
                </div>
              )}
            </div>
          )}

          {/* 2. OFFICIAL MATCH STAGES PREVIEW BADGES */}
          {isOfficialStages && item.matchStagesSummary && item.matchStagesSummary.length > 0 && (
            <div className="space-y-2 pt-2">
              <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-3 h-3 text-cyan-400" />
                <span>Official Drawn Matchups:</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {item.matchStagesSummary.slice(0, 4).map((m, idx) => (
                  <div
                    key={m.matchId || idx}
                    className="p-2.5 rounded-xl bg-black/60 border border-neutral-800 flex items-center justify-between text-xs font-mono"
                  >
                    <span className="text-slate-400 text-[10px] uppercase font-bold">{m.roundName}</span>
                    <span className="text-white font-bold truncate ml-2">
                      {m.teamAName} <span className="text-red-500">vs</span> {m.teamBName}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 3. TEAMS / SCORE / COUNTDOWN DISPLAY */}
          <div className="flex flex-wrap items-center gap-4 pt-1">
            {item.teamA && item.teamB && !isAnnouncement && (
              <div className="inline-flex items-center gap-3 px-4 py-2 rounded-2xl bg-black/60 border border-neutral-800">
                <span className="font-bold text-sm text-white font-display">
                  {item.teamA.name}
                </span>

                {item.teamA.score !== undefined && item.teamB.score !== undefined ? (
                  <span className="px-2.5 py-0.5 rounded-lg bg-red-950/60 text-red-400 font-mono font-black text-sm border border-red-600/40">
                    {item.teamA.score} — {item.teamB.score}
                  </span>
                ) : (
                  <span className="text-red-500 font-black text-xs font-display uppercase tracking-widest">
                    VS
                  </span>
                )}

                <span className="font-bold text-sm text-white font-display">
                  {item.teamB.name}
                </span>
              </div>
            )}

            {isUpcoming && item.scheduledAt && (
              <ArenaTournamentNewsCountdown scheduledAt={item.scheduledAt} />
            )}

            {item.nextRoundName && isQualification && (
              <div className="inline-flex items-center gap-1.5 text-xs font-mono text-slate-300">
                <span className="text-slate-500 uppercase">Advances to:</span>
                <strong className="text-red-400 font-bold">{item.nextRoundName}</strong>
              </div>
            )}
          </div>
        </div>

        {/* Right Action & Visual Badge */}
        <div className="flex flex-row lg:flex-col items-center lg:items-end gap-3 w-full lg:w-auto shrink-0 pt-2 lg:pt-0">
          <button
            onClick={() => onNavigateToTournament(item.tournamentId)}
            className="w-full sm:w-auto px-6 py-3.5 rounded-2xl bg-red-600 hover:bg-red-500 text-white font-mono font-black text-xs uppercase tracking-wider transition-all shadow-[0_0_20px_rgba(239,68,68,0.4)] border border-red-500 flex items-center justify-center gap-2 active:scale-95 cursor-pointer"
          >
            <span>{isAnnouncement && item.registrationStatus === 'OPEN' ? 'JOIN TOURNAMENT' : 'VIEW TOURNAMENT BRACKET'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>

          <button
            onClick={() => onClick(item)}
            className="w-full sm:w-auto px-5 py-3 rounded-2xl bg-neutral-900/80 hover:bg-neutral-800 text-slate-300 hover:text-white font-mono text-xs uppercase tracking-wider transition-colors border border-neutral-800 flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>Event Details</span>
            <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
          </button>
        </div>
      </div>
    </div>
  );
};
