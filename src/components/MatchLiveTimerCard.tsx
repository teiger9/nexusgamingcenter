import React from 'react';
import { useMatchTimer } from '../utils/matchTimer';
import { Clock, Radio, CheckCircle2, PlayCircle, Timer } from 'lucide-react';

interface MatchLiveTimerCardProps {
  match?: {
    status?: string;
    startedAt?: number;
    endedAt?: number;
    finishedAt?: number;
    durationSeconds?: number;
    gameName?: string;
    station?: string;
  } | null;
  variant?: 'full' | 'compact' | 'badge';
  className?: string;
}

export const MatchLiveTimerCard: React.FC<MatchLiveTimerCardProps> = ({
  match,
  variant = 'full',
  className = '',
}) => {
  const {
    isLive,
    isEnded,
    isNotStarted,
    formattedDuration,
    startDateFormatted,
    startTimeFormatted,
    startDateTimeFormatted,
    endDateFormatted,
    endTimeFormatted,
    endDateTimeFormatted,
  } = useMatchTimer(match);

  // Badge-only variant (for quick status labels)
  if (variant === 'badge') {
    if (isLive) {
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-400/50 text-xs font-mono font-bold shadow-[0_0_12px_rgba(34,211,238,0.25)] ${className}`}
        >
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping shrink-0" />
          <span>🟢 LIVE</span>
          <span className="text-white font-mono-numbers ml-1">{formattedDuration}</span>
        </span>
      );
    }
    if (isEnded) {
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 border border-slate-700 text-xs font-mono font-bold ${className}`}
        >
          <span>🏁 ENDED</span>
          <span className="text-cyan-400 font-mono-numbers ml-0.5">{formattedDuration}</span>
        </span>
      );
    }
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 text-slate-400 border border-slate-800 text-xs font-mono font-semibold ${className}`}
      >
        <Clock className="w-3 h-3 text-slate-500" />
        <span>⏳ NOT STARTED</span>
      </span>
    );
  }

  // Compact variant (for table or list cards)
  if (variant === 'compact') {
    return (
      <div
        className={`p-3 rounded-xl font-mono text-xs border transition-all ${
          isLive
            ? 'bg-cyan-950/30 border-cyan-500/40 text-cyan-300 shadow-[0_0_15px_rgba(34,211,238,0.15)]'
            : isEnded
            ? 'bg-[#121218] border-slate-800 text-slate-300'
            : 'bg-[#0a0a0f] border-slate-800/80 text-slate-400'
        } ${className}`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            {isLive ? (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="font-bold text-emerald-400">🟢 LIVE</span>
              </>
            ) : isEnded ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-slate-400" />
                <span className="font-bold text-slate-300">🏁 ENDED</span>
              </>
            ) : (
              <>
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                <span className="font-medium text-slate-400">⏳ NOT STARTED</span>
              </>
            )}
          </div>

          <div className="font-bold font-mono-numbers text-sm">
            {isLive ? (
              <span className="text-cyan-300 animate-pulse">{formattedDuration}</span>
            ) : isEnded ? (
              <span className="text-white">Duration: {formattedDuration}</span>
            ) : (
              <span className="text-slate-500 text-xs">—</span>
            )}
          </div>
        </div>

        {(isLive || isEnded) && (
          <div className="mt-2 pt-2 border-t border-slate-800/60 flex flex-wrap items-center justify-between text-[11px] text-slate-400 gap-x-3 gap-y-1">
            <div>
              Started: <span className="text-slate-200">{startDateTimeFormatted}</span>
            </div>
            {isEnded && (
              <div>
                Ended: <span className="text-slate-200">{endDateTimeFormatted}</span>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // Full Arena Mode (Prominently featured inside LiveMatchRoom)
  return (
    <div
      className={`rounded-2xl border transition-all overflow-hidden ${
        isLive
          ? 'bg-gradient-to-b from-cyan-950/40 to-[#0a0a0f] border-cyan-400/60 shadow-[0_0_25px_rgba(34,211,238,0.2)]'
          : isEnded
          ? 'bg-[#0e0e14] border-slate-800 shadow-lg'
          : 'bg-[#0a0a0f] border-slate-800'
      } ${className}`}
    >
      {/* Top Banner Status Bar */}
      <div
        className={`px-4 py-2.5 flex items-center justify-between border-b ${
          isLive
            ? 'bg-cyan-500/10 border-cyan-500/30'
            : isEnded
            ? 'bg-slate-900/60 border-slate-800'
            : 'bg-slate-900/30 border-slate-800'
        }`}
      >
        <div className="flex items-center gap-2">
          {isLive ? (
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
              </span>
              <span className="text-xs font-mono font-black tracking-widest text-emerald-400 uppercase">
                🟢 LIVE COMPETITIVE GAME
              </span>
            </div>
          ) : isEnded ? (
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" />
              <span className="text-xs font-mono font-bold tracking-wider text-slate-300 uppercase">
                🏁 MATCH COMPLETED
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-xs font-mono font-bold tracking-wider text-slate-400 uppercase">
                ⏳ NOT STARTED
              </span>
            </div>
          )}
        </div>

        {match?.station && (
          <div className="text-[11px] font-mono text-slate-400">
            Station: <strong className="text-cyan-400">{match.station}</strong>
          </div>
        )}
      </div>

      {/* Main Body */}
      <div className="p-5 sm:p-6">
        {isLive ? (
          /* Live View */
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
            {/* Live Counter Display */}
            <div className="text-center md:text-left space-y-1">
              <div className="flex items-center justify-center md:justify-start gap-2 text-cyan-400 text-xs font-mono font-bold uppercase tracking-widest">
                <Timer className="w-4 h-4 animate-spin text-cyan-400" />
                <span>⏱️ GAME TIME</span>
              </div>
              <div className="text-4xl sm:text-5xl font-black font-mono tracking-wider text-white drop-shadow-[0_0_15px_rgba(34,211,238,0.4)]">
                {formattedDuration}
              </div>
              <p className="text-[11px] font-mono text-cyan-300/80">
                Official competitive timer running live
              </p>
            </div>

            {/* Start Details */}
            <div className="p-4 rounded-xl bg-[#121218] border border-cyan-500/20 font-mono text-xs space-y-2">
              <div className="text-slate-400 uppercase text-[10px] tracking-wider font-bold">
                Match Start Details:
              </div>
              <div className="flex items-center justify-between text-slate-300">
                <span className="text-slate-400">Start Date:</span>
                <strong className="text-white">{startDateFormatted}</strong>
              </div>
              <div className="flex items-center justify-between text-slate-300">
                <span className="text-slate-400">Exact Start Time:</span>
                <strong className="text-cyan-300 text-sm">{startTimeFormatted}</strong>
              </div>
              <div className="pt-1 text-[10px] text-slate-500 text-right">
                Local Nexus Center Timezone
              </div>
            </div>
          </div>
        ) : isEnded ? (
          /* Ended View */
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-[#121218] border border-slate-800">
              <div>
                <div className="text-xs font-mono text-slate-400 uppercase tracking-wider font-bold">
                  Official Game Duration:
                </div>
                <div className="text-3xl font-black font-mono text-white mt-0.5">
                  {formattedDuration}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 font-mono text-xs sm:border-l sm:border-slate-800 sm:pl-6">
                <div>
                  <div className="text-slate-500 text-[10px] uppercase">Started</div>
                  <div className="text-white font-bold">{startTimeFormatted}</div>
                  <div className="text-[10px] text-slate-400">{startDateFormatted}</div>
                </div>
                <div>
                  <div className="text-slate-500 text-[10px] uppercase">Ended</div>
                  <div className="text-white font-bold">{endTimeFormatted}</div>
                  <div className="text-[10px] text-slate-400">{endDateFormatted}</div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Pre-Game Not Started View */
          <div className="py-3 text-center space-y-1">
            <div className="text-slate-400 font-mono text-xs font-bold uppercase tracking-wider">
              Match Pending Official Start
            </div>
            <p className="text-[11px] text-slate-500 font-mono max-w-md mx-auto">
              The official game timer and timestamps will begin recording the exact second play is launched.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
