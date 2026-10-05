import React from 'react';
import { ArenaNewsItem } from '../types';
import { formatRelativeTime, formatScheduledDateTime } from '../services/arenaNewsService';
import { ArenaTournamentNewsCountdown } from './ArenaTournamentNewsCountdown';
import {
  X,
  Trophy,
  Swords,
  Radio,
  Clock,
  Calendar,
  Shield,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Medal,
  Dices,
  Flag,
  Users,
  Layers,
  MapPin,
  DollarSign,
} from 'lucide-react';

interface ArenaTournamentNewsDetailModalProps {
  newsItem: ArenaNewsItem | null;
  onClose: () => void;
  onNavigateToTournament: (tournamentId: string) => void;
}

export const ArenaTournamentNewsDetailModal: React.FC<ArenaTournamentNewsDetailModalProps> = ({
  newsItem,
  onClose,
  onNavigateToTournament,
}) => {
  if (!newsItem) return null;

  const { dateStr, timeStr } = formatScheduledDateTime(
    newsItem.scheduledAt || newsItem.tournamentDate || newsItem.timestamp
  );

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'CHAMPION':
        return <Trophy className="w-7 h-7 text-amber-400" />;
      case 'TOURNAMENT_ANNOUNCEMENT':
        return <Trophy className="w-7 h-7 text-red-400" />;
      case 'OFFICIAL_MATCH_STAGES':
        return <Layers className="w-7 h-7 text-cyan-400" />;
      case 'MATCH_LIVE':
        return <Radio className="w-7 h-7 text-red-500 animate-pulse" />;
      case 'QUALIFIED':
        return <Trophy className="w-7 h-7 text-red-400" />;
      case 'THIRD_PLACE_RACE':
        return <Medal className="w-7 h-7 text-amber-500" />;
      case 'UPCOMING_MATCH':
        return <Swords className="w-7 h-7 text-red-400" />;
      case 'MATCH_ENDED_PENDING':
        return <Flag className="w-7 h-7 text-yellow-400" />;
      case 'TOURNAMENT_DRAW':
        return <Dices className="w-7 h-7 text-red-300" />;
      default:
        return <Shield className="w-7 h-7 text-red-400" />;
    }
  };

  const isAnnouncement = newsItem.eventType === 'TOURNAMENT_ANNOUNCEMENT';
  const isOfficialStages = newsItem.eventType === 'OFFICIAL_MATCH_STAGES';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-2xl rounded-3xl bg-[#090a0f] border border-red-600/40 p-6 sm:p-8 shadow-[0_0_50px_rgba(239,68,68,0.25)] text-slate-200 my-8">
        {/* Glow Header Accent */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-red-600 to-transparent" />

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-xl bg-neutral-900/80 hover:bg-neutral-800 text-slate-400 hover:text-white border border-neutral-800 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header Badges */}
        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 rounded-2xl bg-red-950/40 border border-red-600/30 flex items-center justify-center shrink-0">
            {getEventIcon(newsItem.eventType)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono font-black uppercase tracking-wider text-red-400">
                {newsItem.title}
              </span>
              <span className="text-slate-600">•</span>
              <span className="text-[11px] font-mono text-slate-400">
                {formatRelativeTime(newsItem.timestamp)}
              </span>
            </div>
            <h3 className="text-xl sm:text-2xl font-black font-display text-white mt-0.5">
              {newsItem.headline}
            </h3>
          </div>
        </div>

        {/* Tournament & Game Meta */}
        <div className="p-4 rounded-2xl bg-black/60 border border-neutral-800 mb-6 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
          <div>
            <span className="text-slate-500 uppercase">Tournament: </span>
            <strong className="text-white ml-1">{newsItem.tournamentName}</strong>
          </div>
          {newsItem.roundName && (
            <div>
              <span className="text-slate-500 uppercase">Stage: </span>
              <span className="text-red-400 font-bold ml-1">{newsItem.roundName}</span>
            </div>
          )}
          {newsItem.gameName && (
            <div>
              <span className="text-slate-500 uppercase">Game: </span>
              <span className="text-slate-300 ml-1">{newsItem.gameName}</span>
            </div>
          )}
        </div>

        {/* 1. TOURNAMENT ANNOUNCEMENT SPECIFICS */}
        {isAnnouncement && (
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-b from-[#18090d] to-[#0a0a0f] border border-red-500/40 p-5 mb-6 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold text-red-400 uppercase tracking-wider flex items-center gap-2">
                <Trophy className="w-4 h-4 text-amber-400" />
                <span>OFFICIAL TOURNAMENT REGISTRATION SPECS</span>
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-500/50 text-emerald-400 text-[10px] font-mono font-bold">
                {newsItem.registrationStatus === 'OPEN' ? '⚡ REGISTRATION ACTIVE' : 'REGISTRATION CLOSED'}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
              <div className="p-3 rounded-xl bg-black/60 border border-neutral-800">
                <span className="text-slate-500 block text-[10px]">TOURNAMENT DATE</span>
                <span className="text-white font-bold">{dateStr}</span>
              </div>
              <div className="p-3 rounded-xl bg-black/60 border border-neutral-800">
                <span className="text-slate-500 block text-[10px]">CONFIRMED TEAMS</span>
                <span className="text-white font-bold">{newsItem.confirmedCount ?? 0}/{newsItem.maxParticipants ?? 16}</span>
              </div>
              <div className="p-3 rounded-xl bg-black/60 border border-neutral-800">
                <span className="text-slate-500 block text-[10px]">PRIZE POOL</span>
                <span className="text-amber-400 font-bold">{newsItem.prizePool || 'Trophy'}</span>
              </div>
              <div className="p-3 rounded-xl bg-black/60 border border-neutral-800">
                <span className="text-slate-500 block text-[10px]">ENTRY INFO</span>
                <span className="text-slate-300 font-bold">{newsItem.entryFee || 'Free Entry'}</span>
              </div>
            </div>
          </div>
        )}

        {/* 2. OFFICIAL MATCH STAGES SPECIFICS */}
        {isOfficialStages && newsItem.matchStagesSummary && (
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-b from-[#140b17] to-[#0a0a0f] border border-cyan-500/40 p-5 mb-6 space-y-3">
            <span className="text-xs font-mono font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-2">
              <Layers className="w-4 h-4 text-cyan-400" />
              <span>OFFICIAL DRAWN MATCH STAGES</span>
            </span>

            <div className="space-y-2">
              {newsItem.matchStagesSummary.map((m, idx) => (
                <div
                  key={m.matchId || idx}
                  className="p-3 rounded-xl bg-black/60 border border-neutral-800 flex items-center justify-between text-xs font-mono"
                >
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-neutral-900 text-slate-400 text-[10px] font-bold border border-neutral-800">
                      {m.roundName}
                    </span>
                    <span className="text-white font-bold">{m.teamAName}</span>
                    <span className="text-red-500 font-bold text-[10px]">VS</span>
                    <span className="text-white font-bold">{m.teamBName}</span>
                  </div>
                  {m.station && (
                    <span className="text-slate-500 text-[10px]">Station {m.station}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 3. Matchup & Score Card (if teams exist and not an announcement) */}
        {!isAnnouncement && (newsItem.teamA || newsItem.teamB || newsItem.winnerTeam) && (
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-b from-[#14080a] to-[#0a0a0f] border border-red-600/30 p-5 mb-6">
            <div className="grid grid-cols-3 items-center text-center">
              {/* Team A */}
              <div className="flex flex-col items-center gap-2">
                <div className="w-14 h-14 rounded-2xl bg-black/70 border border-neutral-700 flex items-center justify-center text-2xl shadow-md overflow-hidden">
                  {newsItem.teamA?.avatarUrl ? (
                    <img
                      src={newsItem.teamA.avatarUrl}
                      alt={newsItem.teamA.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span>🛡️</span>
                  )}
                </div>
                <div className="font-bold font-display text-sm sm:text-base text-white truncate max-w-[140px]">
                  {newsItem.teamA?.name || 'Team Nexus'}
                </div>
                {newsItem.teamA?.tag && (
                  <span className="text-[10px] font-mono text-red-400">[{newsItem.teamA.tag}]</span>
                )}
                {newsItem.winnerTeam?.id === newsItem.teamA?.id && (
                  <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-mono font-bold">
                    WINNER
                  </span>
                )}
              </div>

              {/* Score / VS */}
              <div className="flex flex-col items-center justify-center">
                {newsItem.teamA?.score !== undefined && newsItem.teamB?.score !== undefined ? (
                  <div className="flex items-center gap-2 text-2xl sm:text-3xl font-black font-display text-white">
                    <span className={newsItem.teamA.score > newsItem.teamB.score ? 'text-red-400' : 'text-slate-400'}>
                      {newsItem.teamA.score}
                    </span>
                    <span className="text-slate-600 text-lg">—</span>
                    <span className={newsItem.teamB.score > newsItem.teamA.score ? 'text-red-400' : 'text-slate-400'}>
                      {newsItem.teamB.score}
                    </span>
                  </div>
                ) : (
                  <span className="text-sm font-black font-display text-red-500 tracking-widest uppercase">
                    VS
                  </span>
                )}

                {newsItem.eventType === 'UPCOMING_MATCH' && newsItem.scheduledAt && (
                  <div className="mt-2">
                    <ArenaTournamentNewsCountdown scheduledAt={newsItem.scheduledAt} />
                  </div>
                )}

                {newsItem.eventType === 'MATCH_LIVE' && (
                  <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-red-950/60 border border-red-500 text-red-400 text-[10px] font-mono font-black animate-pulse">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                    <span>LIVE</span>
                  </div>
                )}
              </div>

              {/* Team B */}
              <div className="flex flex-col items-center gap-2">
                <div className="w-14 h-14 rounded-2xl bg-black/70 border border-neutral-700 flex items-center justify-center text-2xl shadow-md overflow-hidden">
                  {newsItem.teamB?.avatarUrl ? (
                    <img
                      src={newsItem.teamB.avatarUrl}
                      alt={newsItem.teamB.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span>⚔️</span>
                  )}
                </div>
                <div className="font-bold font-display text-sm sm:text-base text-white truncate max-w-[140px]">
                  {newsItem.teamB?.name || 'TBD'}
                </div>
                {newsItem.teamB?.tag && (
                  <span className="text-[10px] font-mono text-red-400">[{newsItem.teamB.tag}]</span>
                )}
                {newsItem.winnerTeam?.id === newsItem.teamB?.id && (
                  <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-mono font-bold">
                    WINNER
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Narrative & Description */}
        <div className="p-4 rounded-2xl bg-neutral-900/50 border border-neutral-800 text-sm text-slate-300 mb-6 leading-relaxed">
          {newsItem.description}
        </div>

        {/* Progression & Timeline Audit Details */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6 text-xs font-mono">
          {newsItem.nextRoundName && (
            <div className="p-3.5 rounded-xl bg-black/50 border border-red-600/20">
              <span className="text-slate-500 block uppercase text-[10px]">Next Match Target</span>
              <div className="font-bold text-red-400 text-sm mt-0.5 flex items-center gap-1.5">
                <span>{newsItem.nextRoundName}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </div>
          )}

          <div className="p-3.5 rounded-xl bg-black/50 border border-neutral-800">
            <span className="text-slate-500 block uppercase text-[10px]">Scheduled Time</span>
            <div className="font-bold text-white text-sm mt-0.5 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>{dateStr} • {timeStr}</span>
            </div>
          </div>

          {newsItem.actualStartedAt && (
            <div className="p-3 rounded-xl bg-black/40 border border-neutral-800 text-slate-400">
              <span className="text-slate-500 block text-[10px]">Match Started</span>
              <span className="text-white font-bold">{new Date(newsItem.actualStartedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          )}

          {newsItem.approvedAt && (
            <div className="p-3 rounded-xl bg-black/40 border border-neutral-800 text-slate-400">
              <span className="text-slate-500 block text-[10px]">Official Admin Approval</span>
              <span className="text-white font-bold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-red-400" />
                <span>{new Date(newsItem.approvedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ({newsItem.approvedByName || 'Admin'})</span>
              </span>
            </div>
          )}
        </div>

        {/* Footer Action */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-800">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-slate-300 font-mono text-xs uppercase tracking-wider transition-colors cursor-pointer"
          >
            Close
          </button>
          <button
            onClick={() => {
              onClose();
              onNavigateToTournament(newsItem.tournamentId);
            }}
            className="px-6 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-mono font-black text-xs uppercase tracking-wider transition-all shadow-[0_0_20px_rgba(239,68,68,0.4)] flex items-center gap-2 cursor-pointer active:scale-95"
          >
            <span>{isAnnouncement && newsItem.registrationStatus === 'OPEN' ? 'Join Tournament' : 'View Tournament Bracket'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
