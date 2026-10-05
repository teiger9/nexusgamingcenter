import React from 'react';
import { ArenaNewsItem } from '../types';
import { formatRelativeTime, formatScheduledDateTime } from '../services/arenaNewsService';
import { ArenaTournamentNewsCountdown } from './ArenaTournamentNewsCountdown';
import {
  Trophy,
  Swords,
  Radio,
  Medal,
  Dices,
  Flag,
  ArrowRight,
  Shield,
  Clock,
  Sparkles,
  Calendar,
  Users,
  Layers,
  Flame,
} from 'lucide-react';

interface ArenaTournamentNewsCardProps {
  item: ArenaNewsItem;
  onClick: (item: ArenaNewsItem) => void;
  index?: number;
}

export const ArenaTournamentNewsCard: React.FC<ArenaTournamentNewsCardProps> = ({
  item,
  onClick,
  index = 0,
}) => {
  const { dateStr, timeStr } = formatScheduledDateTime(item.scheduledAt || item.tournamentDate || item.timestamp);

  const getEventBadge = () => {
    switch (item.eventType) {
      case 'GRAND_FINAL_LIVE':
        return {
          icon: <Flame className="w-4 h-4 text-amber-400 animate-pulse" />,
          color: 'bg-red-950/80 text-amber-300 border-amber-500/60 shadow-[0_0_15px_rgba(245,158,11,0.4)]',
          label: '🔥 GRAND FINAL — LIVE',
        };
      case 'TOURNAMENT_STARTED':
        return {
          icon: <Radio className="w-4 h-4 text-red-500 animate-pulse" />,
          color: 'bg-red-950/70 text-red-300 border-red-500/60 shadow-[0_0_12px_rgba(239,68,68,0.3)]',
          label: 'TOURNAMENT STARTED',
        };
      case 'CHAMPION':
        return {
          icon: <Trophy className="w-4 h-4 text-amber-400" />,
          color: 'bg-amber-500/10 text-amber-300 border-amber-500/40',
          label: 'CHAMPION',
        };
      case 'TOURNAMENT_ANNOUNCEMENT':
        return {
          icon: <Trophy className="w-4 h-4 text-red-400" />,
          color: 'bg-red-950/60 text-red-300 border-red-500/50',
          label: item.registrationStatus === 'OPEN' ? 'REGISTRATION OPEN' : 'NEW TOURNAMENT',
        };
      case 'OFFICIAL_MATCH_STAGES':
        return {
          icon: <Layers className="w-4 h-4 text-cyan-400" />,
          color: 'bg-cyan-950/60 text-cyan-300 border-cyan-500/50',
          label: 'MATCH STAGES',
        };
      case 'MATCH_LIVE':
        return {
          icon: <Radio className="w-4 h-4 text-red-500 animate-pulse" />,
          color: 'bg-red-950/60 text-red-400 border-red-500/50 shadow-[0_0_10px_rgba(239,68,68,0.3)]',
          label: 'LIVE NOW',
        };
      case 'QUALIFIED':
        return {
          icon: <Trophy className="w-4 h-4 text-red-400" />,
          color: 'bg-red-950/40 text-red-300 border-red-600/40',
          label: 'QUALIFIED',
        };
      case 'THIRD_PLACE_RACE':
        return {
          icon: <Medal className="w-4 h-4 text-amber-500" />,
          color: 'bg-amber-950/30 text-amber-300 border-amber-500/30',
          label: '3RD PLACE',
        };
      case 'UPCOMING_MATCH':
        return {
          icon: <Swords className="w-4 h-4 text-red-400" />,
          color: 'bg-neutral-900 text-slate-300 border-neutral-700',
          label: 'UPCOMING',
        };
      case 'MATCH_ENDED_PENDING':
        return {
          icon: <Flag className="w-4 h-4 text-yellow-400" />,
          color: 'bg-yellow-950/40 text-yellow-300 border-yellow-500/40',
          label: 'RESULT PENDING',
        };
      case 'TOURNAMENT_DRAW':
        return {
          icon: <Dices className="w-4 h-4 text-red-300" />,
          color: 'bg-neutral-900 text-red-300 border-neutral-700',
          label: 'BRACKET DRAW',
        };
      default:
        return {
          icon: <Shield className="w-4 h-4 text-red-400" />,
          color: 'bg-neutral-900 text-slate-300 border-neutral-700',
          label: 'ARENA NEWS',
        };
    }
  };

  const badge = getEventBadge();

  return (
    <div
      onClick={() => onClick(item)}
      className="group relative overflow-hidden rounded-2xl bg-[#0b0c10] hover:bg-[#111319] border border-neutral-800 hover:border-red-600/50 p-4 sm:p-5 transition-all duration-300 cursor-pointer shadow-lg hover:shadow-[0_0_25px_rgba(239,68,68,0.18)]"
    >
      {/* Red accent hover strip */}
      <div className="absolute top-0 left-0 bottom-0 w-1 bg-neutral-800 group-hover:bg-red-600 transition-colors" />

      <div className="pl-2">
        {/* Top bar: Badge, Tournament Name & Relative Time */}
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md border text-[10px] font-mono font-black tracking-wider uppercase ${badge.color}`}
            >
              {badge.icon}
              <span>{badge.label}</span>
            </span>

            <span className="text-[11px] font-mono text-slate-400 truncate max-w-[150px] sm:max-w-[200px]">
              {item.tournamentName}
            </span>
          </div>

          <span className="text-[10px] font-mono text-slate-500 whitespace-nowrap">
            {formatRelativeTime(item.timestamp)}
          </span>
        </div>

        {/* Headline */}
        <h4 className="text-base sm:text-lg font-bold font-display text-white group-hover:text-red-400 transition-colors line-clamp-1">
          {item.headline}
        </h4>

        {/* Description / Summary */}
        <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">
          {item.description}
        </p>

        {/* Teams & Score/Countdown footer bar */}
        <div className="mt-3.5 pt-3 border-t border-neutral-800/80 flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
          <div className="flex items-center gap-2">
            {item.eventType === 'TOURNAMENT_ANNOUNCEMENT' ? (
              <span className="text-slate-300 font-bold flex items-center gap-2">
                <span className="text-red-400">👥 {item.confirmedCount ?? 0}/{item.maxParticipants ?? 16}</span>
                {item.prizePool && <span className="text-amber-400">🏆 {item.prizePool}</span>}
              </span>
            ) : item.eventType === 'OFFICIAL_MATCH_STAGES' ? (
              <span className="text-cyan-400 font-bold flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5" />
                <span>{item.matchStagesSummary?.length ?? 0} Drawn Matchups</span>
              </span>
            ) : item.teamA && item.teamB ? (
              <span className="text-slate-300 font-bold flex items-center gap-1.5">
                <span>{item.teamA.name}</span>
                {item.teamA.score !== undefined && item.teamB.score !== undefined ? (
                  <span className="px-1.5 py-0.5 rounded bg-black/60 text-red-400 font-bold">
                    {item.teamA.score} - {item.teamB.score}
                  </span>
                ) : (
                  <span className="text-slate-600 text-[10px]">vs</span>
                )}
                <span>{item.teamB.name}</span>
              </span>
            ) : item.winnerTeam ? (
              <span className="text-red-400 font-bold flex items-center gap-1">
                <span>{item.winnerTeam.name}</span>
                {item.nextRoundName && (
                  <span className="text-slate-500">→ {item.nextRoundName}</span>
                )}
              </span>
            ) : (
              <span className="text-slate-400">
                {dateStr} • {timeStr}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {item.eventType === 'UPCOMING_MATCH' && item.scheduledAt ? (
              <ArenaTournamentNewsCountdown scheduledAt={item.scheduledAt} showIcon={false} />
            ) : (
              <span className="text-[11px] text-slate-500 group-hover:text-red-400 flex items-center gap-1 transition-colors font-bold uppercase">
                <span>Details</span>
                <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
