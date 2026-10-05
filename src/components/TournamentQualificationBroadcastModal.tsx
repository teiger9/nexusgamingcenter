import React, { useState, useEffect } from 'react';
import {
  Trophy,
  ShieldCheck,
  Swords,
  Sparkles,
  ArrowRight,
  Clock,
  Calendar,
  X,
  RotateCcw,
  Award,
  Flame,
  CheckCircle2,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { TournamentQualificationEvent, TournamentMatch } from '../types';

export interface QualificationBroadcastData {
  event?: TournamentQualificationEvent;
  match?: TournamentMatch;
  winnerName: string;
  winnerTag?: string;
  winnerAvatar?: string;
  loserName?: string;
  loserTag?: string;
  loserAvatar?: string;
  scoreA: number;
  scoreB: number;
  roundName: string;
  nextRoundName?: string;
  nextMatchDate?: string;
  nextMatchTime?: string;
  isSemiFinal?: boolean;
  isChampionship?: boolean;
  approvedByName?: string;
  nextOpponentName?: string;
}

interface TournamentQualificationBroadcastModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: QualificationBroadcastData;
  onViewBracket?: () => void;
}

export const TournamentQualificationBroadcastModal: React.FC<TournamentQualificationBroadcastModalProps> = ({
  isOpen,
  onClose,
  data,
  onViewBracket,
}) => {
  // Stages:
  // 0: Result Reveal (Match Ended & Score)
  // 1: Admin Confirmation (Shield check stamp)
  // 2: Winner Qualified (Esports highlight & bracket motion)
  // 3: Loser to 3rd Place (if semifinal) or Next Match Unlocked
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [autoPlay, setAutoPlay] = useState<boolean>(true);

  // Total steps:
  // If semifinal, step 3 is loser to 3rd place, step 4 is next match preview
  // If championship, step 2 is Champion crowned
  // Otherwise step 3 is next match preview
  const maxSteps = data.isSemiFinal ? 4 : data.isChampionship ? 3 : 3;

  useEffect(() => {
    if (!isOpen) {
      setCurrentStep(0);
      return;
    }

    // Trigger initial celebration confetti
    try {
      confetti({
        particleCount: 90,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#22d3ee', '#fbbf24', '#34d399', '#f43f5e'],
      });
    } catch {
      // safe fallback
    }

    setCurrentStep(0);
  }, [isOpen]);

  // Auto-advance sequence
  useEffect(() => {
    if (!isOpen || !autoPlay) return;

    const timer = setTimeout(() => {
      if (currentStep < maxSteps - 1) {
        setCurrentStep((prev) => prev + 1);
        if (currentStep === 1) {
          // Additional confetti on qualification moment
          try {
            confetti({
              particleCount: 120,
              spread: 90,
              origin: { y: 0.5 },
              colors: ['#fbbf24', '#22d3ee', '#a855f7'],
            });
          } catch {
            // safe fallback
          }
        }
      }
    }, currentStep === 0 ? 3000 : currentStep === 1 ? 2500 : 4000);

    return () => clearTimeout(timer);
  }, [isOpen, currentStep, autoPlay, maxSteps]);

  if (!isOpen) return null;

  const nextStep = () => {
    setAutoPlay(false);
    if (currentStep < maxSteps - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onClose();
    }
  };

  const prevStep = () => {
    setAutoPlay(false);
    if (currentStep > 0) setCurrentStep(currentStep - 1);
  };

  const replay = () => {
    setCurrentStep(0);
    setAutoPlay(true);
    try {
      confetti({
        particleCount: 100,
        spread: 80,
        origin: { y: 0.6 },
      });
    } catch {
      // safe fallback
    }
  };

  return (
    <div
      id="qualification-broadcast-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-300"
    >
      <div className="relative w-full max-w-2xl rounded-3xl bg-[#090b14] border border-cyan-500/40 shadow-[0_0_60px_rgba(34,211,238,0.2)] overflow-hidden">
        {/* Esports Broadcast Header Strip */}
        <div className="px-6 py-3 bg-gradient-to-r from-cyan-950/60 via-slate-900 to-indigo-950/60 border-b border-cyan-500/20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-cyan-500" />
            </span>
            <span className="text-[11px] font-black font-mono tracking-widest text-cyan-300 uppercase">
              OFFICIAL ESPORTS BROADCAST • NEXUS TOURNAMENT
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={replay}
              title="Replay Animation"
              className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Stage Navigation Dots */}
        <div className="flex items-center justify-center gap-2 pt-4 pb-2">
          {Array.from({ length: maxSteps }).map((_, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => {
                setAutoPlay(false);
                setCurrentStep(idx);
              }}
              className={`h-1.5 rounded-full transition-all ${
                currentStep === idx
                  ? 'w-8 bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.8)]'
                  : currentStep > idx
                  ? 'w-4 bg-cyan-800'
                  : 'w-2 bg-slate-800'
              }`}
            />
          ))}
        </div>

        {/* Content Container */}
        <div className="p-6 sm:p-8 min-h-[380px] flex flex-col justify-center items-center text-center">
          {/* ======================================================== */}
          {/* STEP 0: OFFICIAL MATCH RESULT                           */}
          {/* ======================================================== */}
          {currentStep === 0 && (
            <div className="w-full space-y-6 animate-in zoom-in-95 duration-300">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900 border border-slate-700 text-slate-300 text-xs font-mono font-bold uppercase tracking-wider">
                <Swords className="w-3.5 h-3.5 text-cyan-400" />
                <span>{data.roundName || 'Match Result'}</span>
              </div>

              <h2 className="text-xl sm:text-2xl font-black text-white uppercase font-display tracking-wide">
                OFFICIAL MATCH RESULT
              </h2>

              {/* Head to Head Card */}
              <div className="p-5 rounded-2xl bg-[#0e111d] border border-slate-800/80 grid grid-cols-5 items-center gap-3">
                {/* Winner Column */}
                <div className="col-span-2 flex flex-col items-center gap-2">
                  <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 border-2 border-cyan-400/80 flex items-center justify-center shadow-[0_0_20px_rgba(34,211,238,0.3)]">
                    {data.winnerAvatar ? (
                      <img
                        src={data.winnerAvatar}
                        alt={data.winnerName}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover rounded-2xl"
                      />
                    ) : (
                      <Trophy className="w-7 h-7 text-cyan-400" />
                    )}
                  </div>
                  <div className="text-center">
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/40">
                      WINNER
                    </span>
                    <div className="text-base font-bold text-white mt-1 truncate max-w-[130px]">
                      {data.winnerName}
                    </div>
                    {data.winnerTag && (
                      <div className="text-xs text-slate-400 font-mono">[{data.winnerTag}]</div>
                    )}
                  </div>
                </div>

                {/* Scores Column */}
                <div className="col-span-1 flex flex-col items-center">
                  <div className="flex items-center justify-center gap-2 text-3xl sm:text-4xl font-black font-mono">
                    <span className="text-cyan-400">{data.scoreA}</span>
                    <span className="text-slate-600 text-2xl">—</span>
                    <span className="text-slate-400">{data.scoreB}</span>
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono mt-1 uppercase">Final Score</span>
                </div>

                {/* Loser Column */}
                <div className="col-span-2 flex flex-col items-center gap-2 opacity-75">
                  <div className="w-14 h-14 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center">
                    {data.loserAvatar ? (
                      <img
                        src={data.loserAvatar}
                        alt={data.loserName || 'Opponent'}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover rounded-2xl"
                      />
                    ) : (
                      <span className="text-slate-500 font-mono font-bold text-base">VS</span>
                    )}
                  </div>
                  <div className="text-center">
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-bold">
                      DEFEATED
                    </span>
                    <div className="text-base font-bold text-slate-300 mt-1 truncate max-w-[130px]">
                      {data.loserName || 'Opponent'}
                    </div>
                    {data.loserTag && (
                      <div className="text-xs text-slate-500 font-mono">[{data.loserTag}]</div>
                    )}
                  </div>
                </div>
              </div>

              <p className="text-xs text-slate-400 font-mono">
                Official tournament result logged and confirmed on Nexus Tournament Network.
              </p>
            </div>
          )}

          {/* ======================================================== */}
          {/* STEP 1: ADMIN VERIFICATION & APPROVAL MOMENT             */}
          {/* ======================================================== */}
          {currentStep === 1 && (
            <div className="w-full space-y-6 animate-in zoom-in-95 duration-300">
              <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500/10 border-2 border-emerald-500/50 flex items-center justify-center shadow-[0_0_30px_rgba(16,185,129,0.3)] animate-pulse">
                <ShieldCheck className="w-9 h-9 text-emerald-400" />
              </div>

              <div className="space-y-1">
                <span className="text-xs font-mono text-emerald-400 font-bold uppercase tracking-wider">
                  OFFICIAL VERIFICATION
                </span>
                <h2 className="text-2xl font-black text-white uppercase font-display">
                  RESULT OFFICIALLY APPROVED
                </h2>
              </div>

              <div className="p-4 max-w-md mx-auto rounded-2xl bg-slate-900/90 border border-slate-800 text-left space-y-2.5 font-mono text-xs">
                <div className="flex items-center justify-between text-slate-400">
                  <span>Authorized Referee:</span>
                  <span className="text-white font-bold">{data.approvedByName || 'Tournament Admin'}</span>
                </div>
                <div className="flex items-center justify-between text-slate-400">
                  <span>Match:</span>
                  <span className="text-cyan-300 font-bold">{data.roundName}</span>
                </div>
                <div className="flex items-center justify-between text-slate-400">
                  <span>Winner Confirmed:</span>
                  <span className="text-emerald-400 font-bold">{data.winnerName}</span>
                </div>
                <div className="flex items-center justify-between text-slate-400 border-t border-slate-800 pt-2">
                  <span>Bracket Progression:</span>
                  <span className="text-yellow-400 font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    LOCKED & ADVANCED
                  </span>
                </div>
              </div>

              <p className="text-xs text-slate-400 font-mono">
                Verified against game logs and referee score sheets. Advancing bracket seed.
              </p>
            </div>
          )}

          {/* ======================================================== */}
          {/* STEP 2: WINNER QUALIFICATION (ESPORTS SHOWCASE)         */}
          {/* ======================================================== */}
          {currentStep === 2 && (
            <div className="w-full space-y-6 animate-in zoom-in-95 duration-300">
              <div className="relative inline-block">
                <div className="absolute -inset-2 rounded-full bg-gradient-to-r from-yellow-500/40 via-cyan-500/40 to-emerald-500/40 blur-lg animate-pulse" />
                <div className="relative w-20 h-20 mx-auto rounded-3xl bg-gradient-to-br from-yellow-500/20 to-cyan-500/20 border-2 border-yellow-400 flex items-center justify-center shadow-[0_0_40px_rgba(250,204,21,0.4)]">
                  {data.isChampionship ? (
                    <Trophy className="w-11 h-11 text-yellow-400 animate-bounce" />
                  ) : (
                    <Sparkles className="w-11 h-11 text-cyan-400 animate-pulse" />
                  )}
                </div>
              </div>

              <div className="space-y-1">
                <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-yellow-500/20 text-yellow-300 border border-yellow-500/40 text-[11px] font-mono font-black uppercase">
                  {data.isChampionship ? '🏆 GRAND CHAMPION' : '🏆 OFFICIAL ADVANCEMENT'}
                </div>
                <h2 className="text-2xl sm:text-3xl font-black text-white uppercase font-display tracking-wide">
                  {data.winnerName}
                </h2>
                <div className="text-cyan-400 font-bold font-mono text-sm sm:text-base tracking-wider uppercase">
                  {data.isChampionship
                    ? 'CROWNED TOURNAMENT CHAMPION!'
                    : `QUALIFIED FOR ${data.nextRoundName || 'THE GRAND FINAL'}!`}
                </div>
              </div>

              {/* Qualification Path Banner */}
              <div className="p-4 max-w-md mx-auto rounded-2xl bg-gradient-to-r from-cyan-950/40 via-slate-900 to-indigo-950/40 border border-cyan-500/40 flex items-center justify-around gap-2 text-xs font-mono">
                <div className="text-center">
                  <span className="text-slate-400 text-[10px] uppercase block">Previous Round</span>
                  <span className="text-white font-bold">{data.roundName}</span>
                </div>
                <ArrowRight className="w-5 h-5 text-cyan-400 animate-pulse shrink-0" />
                <div className="text-center">
                  <span className="text-slate-400 text-[10px] uppercase block">Next Destination</span>
                  <span className="text-yellow-400 font-bold">
                    {data.nextRoundName || (data.isChampionship ? 'HALL OF FAME' : 'GRAND FINALS')}
                  </span>
                </div>
              </div>

              <p className="text-xs text-slate-400 font-mono">
                Team card officially routed to the next bracket slot in live tournament map.
              </p>
            </div>
          )}

          {/* ======================================================== */}
          {/* STEP 3: SEMIFINAL LOSER TO 3RD PLACE / NEXT MATCH UNLOCK */}
          {/* ======================================================== */}
          {currentStep === 3 && data.isSemiFinal && (
            <div className="w-full space-y-6 animate-in zoom-in-95 duration-300">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-600/10 border-2 border-amber-600/60 flex items-center justify-center shadow-[0_0_30px_rgba(217,119,6,0.3)]">
                <Award className="w-9 h-9 text-amber-500" />
              </div>

              <div className="space-y-1">
                <span className="text-xs font-mono text-amber-400 font-bold uppercase tracking-wider">
                  PODIUM PLACEMENT RACE
                </span>
                <h2 className="text-2xl font-black text-white uppercase font-display">
                  {data.loserName || 'Semifinal Loser'}
                </h2>
                <div className="text-amber-400 font-bold font-mono text-sm uppercase">
                  QUALIFIED FOR 3RD PLACE PLACEMENT MATCH
                </div>
              </div>

              <div className="p-4 max-w-md mx-auto rounded-2xl bg-amber-950/20 border border-amber-500/30 text-left space-y-2 text-xs font-mono">
                <div className="text-amber-200 font-bold flex items-center gap-1.5">
                  <span>🥉 Still in the medal contention!</span>
                </div>
                <p className="text-slate-300 leading-relaxed">
                  As the semifinal runner-up, {data.loserName} moves into the official 3rd Place Match to battle for the bronze trophy and podium glory.
                </p>
                <div className="pt-2 border-t border-amber-500/20 flex items-center justify-between text-slate-400 text-[11px]">
                  <span>Stage:</span>
                  <span className="text-amber-400 font-bold">3rd Place Playoff</span>
                </div>
              </div>

              <p className="text-xs text-slate-400 font-mono">
                Roster notified and slot reserved in the 3rd place showdown.
              </p>
            </div>
          )}

          {/* ======================================================== */}
          {/* STEP 4 (or STEP 3 for non-semis): NEXT MATCH UNLOCKED    */}
          {/* ======================================================== */}
          {((currentStep === 3 && !data.isSemiFinal) || currentStep === 4) && (
            <div className="w-full space-y-6 animate-in zoom-in-95 duration-300">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-cyan-500/10 border-2 border-cyan-400 flex items-center justify-center shadow-[0_0_30px_rgba(34,211,238,0.3)] animate-pulse">
                <Flame className="w-9 h-9 text-cyan-400" />
              </div>

              <div className="space-y-1">
                <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-[11px] font-mono font-black uppercase">
                  🔓 MATCH UNLOCKED
                </div>
                <h2 className="text-2xl font-black text-white uppercase font-display">
                  {data.nextRoundName || 'NEXT ROUND MATCH'}
                </h2>
              </div>

              <div className="p-5 max-w-md mx-auto rounded-2xl bg-slate-900 border border-slate-800 text-center space-y-3">
                <div className="flex items-center justify-center gap-4 text-base sm:text-lg font-black font-display text-white">
                  <span className="text-cyan-400">{data.winnerName}</span>
                  <span className="text-slate-600 font-mono text-sm">VS</span>
                  <span className="text-yellow-400">
                    {data.nextOpponentName || 'Waiting for Qualifier'}
                  </span>
                </div>

                <div className="flex items-center justify-center gap-4 text-xs font-mono text-slate-400 pt-2 border-t border-slate-800">
                  {data.nextMatchDate && (
                    <span className="flex items-center gap-1 text-cyan-300">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>{data.nextMatchDate}</span>
                    </span>
                  )}
                  {data.nextMatchTime && (
                    <span className="flex items-center gap-1 text-slate-300">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{data.nextMatchTime}</span>
                    </span>
                  )}
                  <span className="px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 font-bold border border-cyan-500/30 text-[10px]">
                    UPCOMING
                  </span>
                </div>
              </div>

              <p className="text-xs text-slate-400 font-mono">
                Both team captains have received instant system notifications.
              </p>
            </div>
          )}
        </div>

        {/* Footer Action Bar */}
        <div className="px-6 py-4 bg-[#0c0f1c] border-t border-slate-800/80 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {currentStep > 0 && (
              <button
                type="button"
                onClick={prevStep}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono font-bold transition-colors"
              >
                Back
              </button>
            )}
            <span className="text-[11px] font-mono text-slate-500">
              Step {currentStep + 1} of {maxSteps}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {onViewBracket && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onViewBracket();
                }}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-400 text-xs font-mono font-bold uppercase transition-colors"
              >
                View Bracket
              </button>
            )}

            <button
              type="button"
              onClick={nextStep}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black font-black text-xs font-mono uppercase tracking-wider shadow-[0_0_20px_rgba(34,211,238,0.3)] transition-all flex items-center gap-1.5"
            >
              <span>{currentStep === maxSteps - 1 ? 'Close Broadcast' : 'Next'}</span>
              {currentStep < maxSteps - 1 && <ArrowRight className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
