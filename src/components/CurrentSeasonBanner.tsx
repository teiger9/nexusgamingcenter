import React, { useState, useEffect } from 'react';
import { Season, LeaderboardEntry, HallOfFameEntry } from '../types';
import {
  subscribeToActiveSeason,
  subscribeToHallOfFame,
  fetchSeasonLeaderboard,
  fetchAllSeasons,
  checkAndProcessExpiredSeason,
  finalizeSeasonAndCrownChampions,
} from '../services/seasonService';
import { useAuth } from '../context/AuthContext';
import {
  Trophy,
  Calendar,
  Clock,
  ChevronRight,
  Crown,
  Loader2,
  Sparkles,
  RefreshCw,
  AlertTriangle,
  ShieldCheck,
  Ban,
  CheckCircle2,
} from 'lucide-react';
import { getRankFromMMR, COMPETITIVE_GAMES } from '../lib/ranks';

interface CurrentSeasonBannerProps {
  onNavigateToLeaderboard?: () => void;
  onNavigateToHallOfFame?: () => void;
  onNavigateToRankingRules?: () => void;
}

export const CurrentSeasonBanner: React.FC<CurrentSeasonBannerProps> = ({
  onNavigateToLeaderboard,
  onNavigateToHallOfFame,
  onNavigateToRankingRules,
}) => {
  const { user, playerProfile, isAdmin, isStaff } = useAuth();
  const [activeSeason, setActiveSeason] = useState<Season | null>(null);
  const [allSeasons, setAllSeasons] = useState<Season[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<string>('CURRENT');
  const [officialHofEntries, setOfficialHofEntries] = useState<HallOfFameEntry[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [manualLoading, setManualLoading] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [timeLeft, setTimeLeft] = useState<{
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
    totalMs: number;
  } | null>(null);
  const [topLeaders, setTopLeaders] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // 1. Real-time listener for active/ended season
  useEffect(() => {
    const unsub = subscribeToActiveSeason((season, processing) => {
      setActiveSeason(season);
      setIsProcessing(Boolean(processing));
      setLoading(false);

      if (season && !processing) {
        fetchSeasonLeaderboard({ seasonId: season.id })
          .then((entries) => {
            setTopLeaders(entries.slice(0, 3));
          })
          .catch(() => {});
      }
    });

    fetchAllSeasons().then(setAllSeasons).catch(() => {});

    return () => unsub();
  }, []);

  // 2. Real-time listener for official Hall of Fame records
  useEffect(() => {
    const unsubHof = subscribeToHallOfFame((hofList) => {
      setOfficialHofEntries(hofList);
      fetchAllSeasons().then(setAllSeasons).catch(() => {});
    });

    return () => unsubHof();
  }, []);

  // 3. Real-time countdown timer (ticks every 1s)
  useEffect(() => {
    if (!activeSeason?.endDate) return;

    const updateCountdown = () => {
      const now = Date.now();
      const diff = activeSeason.endDate - now;

      if (diff <= 0) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0, totalMs: 0 });
        if (activeSeason.status === 'ACTIVE') {
          // Trigger transition to status: 'ENDED' awaiting official finalization
          checkAndProcessExpiredSeason();
        }
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setTimeLeft({ days, hours, minutes, seconds, totalMs: diff });
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [activeSeason?.endDate, activeSeason?.status]);

  const handleFinalizeSeason = async () => {
    if (!user) return;
    try {
      setManualLoading(true);
      const res = await finalizeSeasonAndCrownChampions({
        uid: user.uid,
        name: playerProfile?.gamerTag || 'Admin',
      });
      if (res.success) {
        if (res.newSeason) {
          setActiveSeason(res.newSeason);
        }
        setShowConfirmModal(false);
        fetchAllSeasons().then(setAllSeasons).catch(() => {});
      }
    } catch (err) {
      console.error('Failed to finalize season:', err);
    } finally {
      setManualLoading(false);
    }
  };

  if (loading || !activeSeason) {
    return null;
  }

  // Determine which season to display in the banner
  const isViewingSpecificFinalized = selectedSeasonId !== 'CURRENT';
  const displayedSeason = isViewingSpecificFinalized
    ? allSeasons.find((s) => s.id === selectedSeasonId) || activeSeason
    : activeSeason;

  const seasonStatus = displayedSeason.status;
  const isSeasonActive = seasonStatus === 'ACTIVE';
  const isSeasonEnded = seasonStatus === 'ENDED';
  const isSeasonFinalized = seasonStatus === 'FINALIZED' || seasonStatus === 'COMPLETED';

  const startDateStr = new Date(displayedSeason.startDate).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
  });
  const endDateStr = new Date(displayedSeason.endDate).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
  });

  // Query official Hall of Fame records for this season
  // Rule 5: Only match authoritative documents where status === 'OFFICIAL'
  const seasonHofEntries = officialHofEntries.filter(
    (e) => e.seasonId === displayedSeason.id && e.status === 'OFFICIAL'
  );

  const finalizedSeasonsList = allSeasons.filter(
    (s) => s.status === 'FINALIZED' || s.status === 'COMPLETED' || s.hallOfFameProcessed
  );

  return (
    <div
      id="nexus-current-season-banner"
      className="relative overflow-hidden rounded-2xl sm:rounded-3xl bg-gradient-to-b from-[#181512]/95 via-[#0e111a]/95 to-[#090b12]/98 border border-amber-600/35 p-5 sm:p-7 shadow-[0_12px_40px_rgba(0,0,0,0.8),0_0_35px_rgba(245,158,11,0.08)] transition-all hover:border-amber-500/50"
    >
      {/* Background ambient warm gold glow */}
      <div className="absolute -top-24 -right-24 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -left-24 w-80 h-80 bg-red-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(#f59e0b_1px,transparent_1px)] [background-size:28px_28px] opacity-[0.035] pointer-events-none" />

      {/* TOP HEADER ROW: Badges on left, Dates and selector on right */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] pb-4 relative z-10">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-amber-500/10 border border-amber-500/40 text-amber-400 text-xs font-mono font-bold tracking-wider">
            <Trophy className="w-3.5 h-3.5 text-amber-400" />
            <span>HALL OF FAME SEASON</span>
          </span>

          {/* Dynamic Status Badge */}
          {isProcessing ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-amber-500/20 border border-amber-500/50 text-amber-300 text-xs font-mono font-bold uppercase tracking-wider animate-pulse">
              <Loader2 className="w-3 h-3 animate-spin text-amber-400" />
              <span>FINALIZING...</span>
            </span>
          ) : isSeasonActive ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/35 text-emerald-400 text-xs font-mono font-bold uppercase tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>ACTIVE</span>
            </span>
          ) : isSeasonEnded ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/35 text-amber-300 text-xs font-mono font-bold uppercase tracking-wider">
              <Clock className="w-3 h-3 text-amber-400" />
              <span>ENDED</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-purple-500/15 border border-purple-500/35 text-purple-300 text-xs font-mono font-bold uppercase tracking-wider">
              <ShieldCheck className="w-3 h-3 text-purple-400" />
              <span>FINALIZED</span>
            </span>
          )}

          <span className="text-zinc-400 text-xs font-mono">
            (Ranked 1v1 &amp; 5v5 Competition)
          </span>
        </div>

        {/* Right side: Date Range & Optional Season Switcher */}
        <div className="flex items-center gap-3 ml-auto">
          <div className="flex items-center gap-1.5 text-xs font-mono text-zinc-300">
            <Calendar className="w-3.5 h-3.5 text-amber-500/80" />
            <span className="font-semibold text-zinc-200">
              {startDateStr} → {endDateStr}
            </span>
          </div>

          {/* Finalized Seasons Switcher Dropdown */}
          {finalizedSeasonsList.length > 0 && (
            <select
              value={selectedSeasonId}
              onChange={(e) => setSelectedSeasonId(e.target.value)}
              className="bg-[#0c101c] border border-zinc-700/80 text-zinc-300 text-xs rounded-lg px-2.5 py-1 font-mono focus:outline-none focus:border-amber-400"
            >
              <option value="CURRENT">Cycle ({activeSeason.name})</option>
              {finalizedSeasonsList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} (Finalized)
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* MAIN TWO-COLUMN BODY */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start mt-5 relative z-10">
        {/* Left Column: Season Title, Subtitle Countdown, & Hall of Fame panel */}
        <div className="lg:col-span-7 xl:col-span-8 space-y-4">
          <div>
            <h2 className="text-4xl sm:text-5xl font-black font-display tracking-tight text-white uppercase drop-shadow-sm">
              {displayedSeason.name}
            </h2>

            {/* Countdown Headline for Active Season */}
            {isSeasonActive && timeLeft && !isProcessing && (
              <div className="text-base sm:text-lg font-bold font-display text-amber-400 mt-1.5 flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                <span>
                  Ends in {timeLeft.days} Days {timeLeft.hours} Hours
                </span>
                {timeLeft.days === 0 && (
                  <span className="text-xs font-mono text-zinc-400">
                    ({timeLeft.minutes}m {timeLeft.seconds}s)
                  </span>
                )}
              </div>
            )}
          </div>

          {/* HALL OF FAME SUB-PANEL */}
          <div className="rounded-xl bg-[#0a0d16]/95 border border-zinc-800/80 p-4 sm:p-5 space-y-3 shadow-inner">
            <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2.5">
              <div className="flex items-center gap-2 text-white font-display font-black text-xs sm:text-sm uppercase tracking-wider">
                <Crown className="w-4 h-4 text-amber-400" />
                <span>🏆 HALL OF FAME</span>
              </div>
              <span className="text-[10px] sm:text-[11px] font-mono font-bold text-zinc-500 uppercase tracking-widest">
                {isSeasonActive ? 'SEASON IN PROGRESS' : isSeasonEnded ? 'AWAITING FINALIZATION' : 'OFFICIAL INDUCTION'}
              </span>
            </div>

            {/* 1. ACTIVE SEASON STATE */}
            {isSeasonActive && (
              <div className="space-y-2.5">
                <div className="text-sm font-bold text-white flex items-center gap-2">
                  <span className="text-emerald-400">●</span>
                  <span>Season is currently active.</span>
                </div>
                <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
                  No champions have been declared yet. Final champions will be determined when the season ends.
                </p>
                <div className="p-3 rounded-lg bg-amber-950/20 border border-amber-600/30 text-xs font-sans text-amber-200/90 leading-relaxed flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-amber-300 font-bold">Rule: </strong>
                    Being #1 during an active season does NOT make someone a Hall of Fame winner. Current leaderboard leaders change with every match until official season finalization.
                  </div>
                </div>
              </div>
            )}

            {/* 2. ENDED BUT NOT FINALIZED STATE */}
            {isSeasonEnded && (
              <div className="space-y-2.5">
                <div className="text-sm font-bold text-amber-300 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-400" />
                  <span>Season has ended.</span>
                </div>
                <p className="text-xs text-zinc-200 leading-relaxed font-semibold">
                  Champions are awaiting official finalization.
                </p>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  The match clock has expired. Final rankings and verified game champions will be officially recorded once an authorized Super Admin or Admin executes finalization.
                </p>
                {(isAdmin || isStaff) && (
                  <div className="pt-2">
                    <button
                      onClick={() => setShowConfirmModal(true)}
                      className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-black font-mono text-xs uppercase transition-all flex items-center gap-2 shadow-lg cursor-pointer"
                    >
                      <Crown className="w-4 h-4 text-black" />
                      <span>👑 Finalize Season &amp; Crown Champions</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* 3. FINALIZED SEASON STATE */}
            {isSeasonFinalized && (
              <div className="space-y-3">
                <div className="text-xs font-mono text-zinc-400 uppercase font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-purple-400" />
                  <span>Official Verified Champions ({displayedSeason.name})</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {COMPETITIVE_GAMES.map((game) => {
                    const officialRecord = seasonHofEntries.find(
                      (e) =>
                        (e.gameId === game.id ||
                          e.gameName?.toLowerCase() === game.name.toLowerCase() ||
                          (game.id.startsWith('fc') && e.gameId.startsWith('fc'))) &&
                        e.status === 'OFFICIAL' &&
                        Boolean(e.championId)
                    );

                    const hasChampion = Boolean(officialRecord);

                    return (
                      <div
                        key={game.id}
                        className={`p-2.5 rounded-xl border flex items-center justify-between text-xs ${
                          hasChampion
                            ? 'bg-[#121218] border-amber-500/30 text-white'
                            : 'bg-[#08080a] border-zinc-800 text-zinc-400'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-base shrink-0">{game.icon}</span>
                          <div className="min-w-0">
                            <div className="text-[10px] font-mono text-zinc-400 uppercase font-bold">
                              {game.shortName || game.name}
                            </div>
                            <div className="font-bold truncate mt-0.5">
                              {hasChampion ? (
                                <span className="text-amber-300 font-display flex items-center gap-1 truncate">
                                  <span>👑</span>
                                  <span className="truncate">
                                    {officialRecord?.championName || officialRecord?.gamerTag}
                                  </span>
                                  {officialRecord?.teamTag && (
                                    <span className="text-[10px] text-zinc-400 font-mono">
                                      [{officialRecord.teamTag}]
                                    </span>
                                  )}
                                </span>
                              ) : (
                                <span className="text-zinc-500 text-[11px] font-mono flex items-center gap-1">
                                  <Ban className="w-3 h-3 text-zinc-600 shrink-0" />
                                  <span>No champion declared</span>
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {hasChampion && officialRecord && (
                          <div className="text-right shrink-0 font-mono text-[11px] font-bold text-amber-400 font-mono-numbers">
                            {officialRecord.finalMMR} MMR
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Countdown Card & Current Ladder Leaders */}
        <div className="lg:col-span-5 xl:col-span-4 flex flex-col gap-3.5 w-full">
          {/* Card 1: COUNTDOWN TO INDUCTION */}
          {isProcessing ? (
            <div className="p-4 rounded-xl bg-[#0c101a] border border-amber-500/40 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                  <Loader2 className="w-4 h-4 animate-spin" />
                </div>
                <div>
                  <div className="text-[10px] font-mono text-amber-400 uppercase font-bold tracking-wider">
                    Season Finalization
                  </div>
                  <div className="text-base font-black font-display text-white">
                    VERIFYING CHAMPIONS...
                  </div>
                </div>
              </div>
            </div>
          ) : isSeasonActive && timeLeft ? (
            <div className="p-4 rounded-xl bg-[#0c101a] border border-amber-500/30 flex items-center justify-between gap-4 hover:border-amber-400/50 transition-colors shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-[10px] font-mono text-zinc-400 uppercase font-bold tracking-wider">
                    COUNTDOWN TO INDUCTION
                  </div>
                  <div className="text-xl sm:text-2xl font-black font-display text-amber-400 font-mono-numbers tracking-tight mt-0.5">
                    {timeLeft.days > 0 ? (
                      <>
                        <span>{timeLeft.days}d</span> <span className="text-white font-medium">{timeLeft.hours}h</span> <span className="text-zinc-400 text-sm font-normal">{timeLeft.minutes}m</span>
                      </>
                    ) : (
                      <>
                        <span>{timeLeft.hours}h</span> <span className="text-white font-medium">{timeLeft.minutes}m</span> <span className="text-red-400 text-sm font-bold">{timeLeft.seconds}s</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="text-right shrink-0">
                <span className="px-2.5 py-1 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-amber-500/10 border border-amber-500/30 text-amber-300">
                  {timeLeft.days <= 14 ? 'FINAL WEEKS' : 'IN PROGRESS'}
                </span>
              </div>
            </div>
          ) : isSeasonEnded ? (
            <div className="p-4 rounded-xl bg-[#0c101a] border border-amber-500/40 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                  <Clock className="w-4 h-4 text-amber-400" />
                </div>
                <div>
                  <div className="text-[10px] font-mono text-amber-400 uppercase font-bold tracking-wider">
                    Cycle Concluded
                  </div>
                  <div className="text-base font-black font-display text-white">
                    ENDED — PENDING ADMIN
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {/* Card 2: CURRENT LADDER LEADERS */}
          {isSeasonActive && !isProcessing && (
            <div className="p-4 rounded-xl bg-[#0c101a] border border-slate-800 space-y-2.5 shadow-sm">
              <div className="flex items-center justify-between text-xs font-mono font-bold uppercase tracking-wider">
                <span className="flex items-center gap-1.5 text-cyan-400">
                  <span className="text-cyan-400 font-bold">☰</span>
                  <span>CURRENT LADDER LEADERS</span>
                </span>
                <span className="text-[10px] text-amber-400 font-normal font-mono">(NOT CHAMPIONS)</span>
              </div>

              <div className="space-y-1.5">
                {topLeaders.length > 0 ? (
                  topLeaders.slice(0, 3).map((leader, idx) => (
                    <div
                      key={leader.playerId}
                      className="flex items-center justify-between text-xs py-2 px-3 rounded-lg bg-[#070911] border border-slate-800/80 hover:border-slate-700 transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className={`font-mono text-xs font-bold px-2 py-0.5 rounded shrink-0 ${
                            idx === 0
                              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                              : 'bg-slate-800/90 text-slate-300 border border-slate-700/80'
                          }`}
                        >
                          #{idx + 1}
                        </span>
                        <span className="font-bold text-white font-display truncate max-w-[130px]">
                          {leader.gamerTag}
                        </span>
                      </div>
                      <span
                        className={`font-mono font-bold shrink-0 font-mono-numbers ${
                          idx === 0 ? 'text-cyan-300 font-black' : 'text-slate-300'
                        }`}
                      >
                        {leader.rating} MMR
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="py-4 text-center text-xs font-mono text-zinc-500">
                    Play ranked matches to claim ladder positions
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* BOTTOM ACTION BUTTONS BAR: Spans across the entire card */}
      <div className="flex flex-wrap items-center gap-3 pt-5 border-t border-white/[0.08] mt-6 relative z-10">
        {onNavigateToHallOfFame && (
          <button
            id="btn-season-hof"
            onClick={onNavigateToHallOfFame}
            className="px-5 py-2.5 rounded-lg bg-[#d97706] hover:bg-[#b45309] text-black font-black text-xs font-mono uppercase tracking-wider transition-all flex items-center gap-2 shadow-[0_4px_16px_rgba(217,119,6,0.25)] active:scale-95 cursor-pointer"
          >
            <Crown className="w-3.5 h-3.5 text-black" />
            <span>HALL OF FAME ARCHIVE</span>
          </button>
        )}
        {onNavigateToLeaderboard && (
          <button
            id="btn-season-leaderboard"
            onClick={onNavigateToLeaderboard}
            className="px-4 py-2.5 rounded-lg bg-[#0c1626] hover:bg-[#11223b] text-cyan-300 border border-cyan-500/50 hover:border-cyan-400 font-bold text-xs font-mono uppercase tracking-wider transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer"
          >
            <span>LIVE RANKINGS</span>
            <ChevronRight className="w-3.5 h-3.5 text-cyan-400" />
          </button>
        )}
        {onNavigateToRankingRules && (
          <button
            id="btn-season-guide"
            onClick={onNavigateToRankingRules}
            className="px-4 py-2.5 rounded-lg bg-[#11131b] hover:bg-[#181a24] text-zinc-300 hover:text-white border border-zinc-700/80 hover:border-zinc-500 font-bold text-xs font-mono uppercase tracking-wider transition-all cursor-pointer"
          >
            MMR TIER GUIDE
          </button>
        )}

        {/* Admin/Staff Manual Start Next Season Trigger */}
        {(isAdmin || isStaff) && !isSeasonFinalized && (
          <button
            id="btn-admin-refresh-season"
            onClick={() => setShowConfirmModal(true)}
            className="px-4 py-2.5 rounded-lg bg-red-950/30 hover:bg-red-900/50 border border-red-500/60 hover:border-red-400 text-red-400 hover:text-red-200 font-mono text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 shadow-[0_0_15px_rgba(239,68,68,0.25)] ml-auto cursor-pointer"
            title="Super Admin: Officially finalize season and crown verified champions"
          >
            <RefreshCw className="w-3.5 h-3.5 text-red-400" />
            <span>FINALIZE SEASON &amp; CYCLE</span>
          </button>
        )}
      </div>

      {/* Admin Manual Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-[#0f0f13] border border-amber-500/40 rounded-3xl p-6 sm:p-8 max-w-md w-full space-y-5 shadow-2xl relative">
            <div className="flex items-center gap-3 text-amber-400">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
                <Crown className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h3 className="text-lg font-black font-display text-white">Official Season Finalization</h3>
                <p className="text-xs font-mono text-zinc-400">Super Admin / Admin Authority</p>
              </div>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed">
              Are you sure you want to officially finalize <strong className="text-white">{activeSeason.name}</strong>?
              <br /><br />
              <strong>Official Verification Rules:</strong>
              <br />• 1v1 Games (Chess, FC): Only players with verified games played can be crowned.
              <br />• 5v5 Games (Valorant, CS2, LoL): Only teams with verified matches played can be crowned.
              <br />• Games without verified participation will strictly show <em>&quot;No champion declared&quot;</em>.
              <br />• Authoritative records are permanently written to <code>/hallOfFame/</code> with status <code>OFFICIAL</code>.
              <br />• Launches Season {(activeSeason.number || 1) + 1} with a new countdown.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={manualLoading}
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white text-xs font-mono font-bold uppercase transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={manualLoading}
                onClick={handleFinalizeSeason}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-mono font-black text-xs uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer shadow-lg disabled:opacity-50"
              >
                {manualLoading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Finalizing Champions...</span>
                  </>
                ) : (
                  <>
                    <Crown className="w-3.5 h-3.5 text-black" />
                    <span>Authorize &amp; Finalize Season</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
