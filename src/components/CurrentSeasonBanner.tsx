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
      className="relative overflow-hidden rounded-2xl sm:rounded-3xl bg-[#08080a] border border-amber-500/30 p-5 sm:p-7 shadow-[0_10px_35px_rgba(245,158,11,0.12)] transition-all hover:border-amber-500/50"
    >
      {/* Background ambient gold & red glow */}
      <div className="absolute -top-24 -right-24 w-88 h-88 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -left-24 w-88 h-88 bg-red-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(#f59e0b_1px,transparent_1px)] [background-size:24px_24px] opacity-[0.03] pointer-events-none" />

      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 relative z-10">
        <div className="space-y-4 max-w-2xl w-full">
          {/* Season Status & Mode Badges */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-400 text-xs font-mono font-bold tracking-wide">
              <Trophy className="w-3.5 h-3.5 text-amber-400" />
              <span>🏆 HALL OF FAME SEASON</span>
            </span>

            {/* Dynamic Status Badge */}
            {isProcessing ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500/50 text-amber-300 text-[11px] font-mono font-black uppercase tracking-wider animate-pulse">
                <Loader2 className="w-3 h-3 animate-spin text-amber-400" />
                <span>FINALIZING &amp; CROWNING CHAMPIONS</span>
              </span>
            ) : isSeasonActive ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-950/40 border border-emerald-500/40 text-emerald-400 text-[10px] font-mono font-bold uppercase tracking-wider">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                ACTIVE
              </span>
            ) : isSeasonEnded ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-950/50 border border-amber-500/50 text-amber-300 text-[10px] font-mono font-bold uppercase tracking-wider">
                <Clock className="w-3 h-3 text-amber-400" />
                ENDED
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-purple-950/40 border border-purple-500/40 text-purple-300 text-[10px] font-mono font-bold uppercase tracking-wider">
                <ShieldCheck className="w-3 h-3 text-purple-400" />
                FINALIZED
              </span>
            )}

            <span className="text-zinc-500 text-xs font-mono">
              (Ranked 1v1 &amp; 5v5 Competition)
            </span>

            {/* Finalized Seasons Switcher Dropdown */}
            {finalizedSeasonsList.length > 0 && (
              <div className="ml-auto flex items-center gap-1.5">
                <label className="text-[10px] font-mono text-zinc-400 uppercase">View:</label>
                <select
                  value={selectedSeasonId}
                  onChange={(e) => setSelectedSeasonId(e.target.value)}
                  className="bg-[#0f0f13] border border-zinc-700 text-zinc-300 text-xs rounded-lg px-2.5 py-1 font-mono focus:outline-none focus:border-amber-400"
                >
                  <option value="CURRENT">Current Cycle ({activeSeason.name})</option>
                  {finalizedSeasonsList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} (Finalized)
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div>
            <h2 className="text-3xl sm:text-4xl font-black font-display tracking-tight text-white flex items-center gap-2.5">
              <span>{displayedSeason.name}</span>
            </h2>

            {/* Countdown Headline for Active Season */}
            {isSeasonActive && timeLeft && !isProcessing && (
              <div className="text-base sm:text-lg font-black font-display text-amber-400 mt-1 flex items-center gap-2">
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

            {/* Date line: October 2 → November 18 */}
            <div className="flex items-center gap-2 text-xs font-mono text-zinc-300 mt-1.5">
              <Calendar className="w-3.5 h-3.5 text-amber-500" />
              <span className="font-bold text-zinc-200">
                {startDateStr} → {endDateStr}
              </span>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* RULE 1, 2, 3, 7: HALL OF FAME DISPLAY LOGIC BASED ON OFFICIAL SEASON STATUS */}
          {/* ========================================================================= */}
          <div className="rounded-2xl bg-[#0f0f13]/90 border border-zinc-800 p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2.5">
              <div className="flex items-center gap-2 text-amber-400 font-display font-black text-sm uppercase tracking-wide">
                <Crown className="w-4 h-4 text-amber-400" />
                <span>🏆 HALL OF FAME</span>
              </div>
              <span className="text-[10px] font-mono text-zinc-500 uppercase">
                {isSeasonActive ? 'Season In Progress' : isSeasonEnded ? 'Awaiting Finalization' : 'Official Induction'}
              </span>
            </div>

            {/* 1. ACTIVE SEASON STATE */}
            {isSeasonActive && (
              <div className="space-y-2">
                <div className="text-sm font-bold text-white flex items-center gap-2">
                  <span className="text-emerald-400">●</span>
                  <span>Season is currently active.</span>
                </div>
                <p className="text-xs text-zinc-300 leading-relaxed">
                  No champions have been declared yet. Final champions will be determined when the season ends.
                </p>
                <div className="p-2.5 rounded-xl bg-amber-950/20 border border-amber-500/20 text-[11px] font-mono text-amber-300/90 leading-relaxed flex items-start gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                  <span>
                    <strong>Rule:</strong> Being #1 during an active season does NOT make someone a Hall of Fame winner. Current leaderboard leaders change with every match until official season finalization.
                  </span>
                </div>
              </div>
            )}

            {/* 2. ENDED BUT NOT FINALIZED STATE */}
            {isSeasonEnded && (
              <div className="space-y-2">
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

            {/* 3. FINALIZED SEASON STATE: Rule 3 & 4: Only official records or "No champion declared" */}
            {isSeasonFinalized && (
              <div className="space-y-3">
                <div className="text-xs font-mono text-zinc-400 uppercase font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-purple-400" />
                  <span>Official Verified Champions ({displayedSeason.name})</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {COMPETITIVE_GAMES.map((game) => {
                    // Match authoritative official Hall of Fame document
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

          {/* Action links & Super Admin Controls */}
          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            {onNavigateToHallOfFame && (
              <button
                id="btn-season-hof"
                onClick={onNavigateToHallOfFame}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-black text-xs font-mono uppercase transition-all flex items-center gap-1.5 shadow-[0_4px_16px_rgba(245,158,11,0.3)] active:scale-95 cursor-pointer"
              >
                <Crown className="w-3.5 h-3.5 text-black" />
                <span>Hall of Fame Archive</span>
              </button>
            )}
            {onNavigateToLeaderboard && (
              <button
                id="btn-season-leaderboard"
                onClick={onNavigateToLeaderboard}
                className="px-4 py-2 rounded-xl bg-[#121216] hover:bg-[#181820] text-zinc-200 border border-zinc-700 hover:border-zinc-500 font-bold text-xs font-mono uppercase transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer"
              >
                <span>Live Rankings</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
            {onNavigateToRankingRules && (
              <button
                id="btn-season-guide"
                onClick={onNavigateToRankingRules}
                className="px-4 py-2 rounded-xl bg-[#121216] hover:bg-[#181820] text-zinc-400 hover:text-zinc-300 border border-zinc-800 hover:border-zinc-700 font-bold text-xs font-mono uppercase transition-all cursor-pointer"
              >
                MMR Tier Guide
              </button>
            )}

            {/* Admin Manual Start Next Season Trigger (When Active or Ended) */}
            {(isAdmin || isStaff) && !isSeasonFinalized && (
              <button
                id="btn-admin-refresh-season"
                onClick={() => setShowConfirmModal(true)}
                className="px-3.5 py-2 rounded-xl bg-red-950/40 hover:bg-red-900/60 border border-red-600/40 text-red-400 hover:text-white font-mono text-xs font-bold uppercase transition-all flex items-center gap-1.5 cursor-pointer ml-auto"
                title="Super Admin: Officially finalize season and crown verified champions"
              >
                <RefreshCw className="w-3.5 h-3.5 text-red-400" />
                <span>Finalize Season &amp; Cycle</span>
              </button>
            )}
          </div>
        </div>

        {/* Right side: Countdown Card & Live Ladder Leaders (Never called champions!) */}
        <div className="w-full lg:w-auto flex flex-col sm:flex-row lg:flex-col gap-3 min-w-[300px]">
          {/* Days / Hours / Seconds Countdown */}
          {isProcessing ? (
            <div className="p-4 rounded-2xl bg-[#0f0f13] border border-amber-500/40 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <Loader2 className="w-5 h-5 animate-spin" />
                </div>
                <div>
                  <div className="text-[10px] font-mono text-amber-400 uppercase font-bold">
                    Season Finalization
                  </div>
                  <div className="text-base font-black font-display text-white">
                    VERIFYING CHAMPIONS...
                  </div>
                </div>
              </div>
            </div>
          ) : isSeasonActive && timeLeft ? (
            <div className="p-4 rounded-2xl bg-[#0f0f13] border border-amber-500/30 flex items-center justify-between gap-4 hover:border-amber-400/50 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-[10px] font-mono text-zinc-400 uppercase font-bold tracking-wider">
                    Countdown to Induction
                  </div>
                  <div className="text-lg font-black font-display text-white font-mono-numbers tracking-tight">
                    {timeLeft.days > 0 ? (
                      <>
                        <span className="text-amber-400">{timeLeft.days}</span>d{' '}
                        <span className="text-white">{timeLeft.hours}</span>h{' '}
                        <span className="text-zinc-400 text-sm">{timeLeft.minutes}m</span>
                      </>
                    ) : (
                      <>
                        <span className="text-amber-400">{timeLeft.hours}</span>h{' '}
                        <span className="text-white">{timeLeft.minutes}</span>m{' '}
                        <span className="text-red-400 font-bold">{timeLeft.seconds}</span>s
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="text-right">
                <span className="px-2.5 py-1 rounded-md text-[10px] font-mono font-bold uppercase tracking-wide bg-amber-500/10 border border-amber-500/30 text-amber-300">
                  {timeLeft.days <= 14 ? 'FINAL WEEKS' : 'IN PROGRESS'}
                </span>
              </div>
            </div>
          ) : isSeasonEnded ? (
            <div className="p-4 rounded-2xl bg-[#0f0f13] border border-amber-500/40 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <Clock className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <div className="text-[10px] font-mono text-amber-400 uppercase font-bold">
                    Cycle Concluded
                  </div>
                  <div className="text-base font-black font-display text-white">
                    ENDED — PENDING ADMIN
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {/* Current In-Progress Ladder Leaders (Rule 1: Clearly marked as Live Leaders, NEVER Champions) */}
          {topLeaders.length > 0 && isSeasonActive && !isProcessing && (
            <div className="p-4 rounded-2xl bg-[#0f0f13] border border-zinc-800/90 space-y-2">
              <div className="flex items-center justify-between text-[11px] font-mono font-bold text-zinc-400 uppercase">
                <span className="flex items-center gap-1.5 text-zinc-300">
                  <span>Current Ladder Leaders</span>
                </span>
                <span className="text-[10px] text-amber-400 font-normal">(NOT Champions)</span>
              </div>

              <div className="space-y-1.5">
                {topLeaders.map((leader, idx) => {
                  const tier = getRankFromMMR(leader.rating);
                  return (
                    <div
                      key={leader.playerId}
                      className="flex items-center justify-between text-xs py-1.5 px-2.5 rounded-lg bg-[#08080a] border border-zinc-800/80"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-zinc-400">
                          #{idx + 1}
                        </span>
                        <span className="font-bold text-white font-display truncate max-w-[130px]">
                          {leader.gamerTag}
                        </span>
                      </div>
                      <span className={`font-mono font-black ${tier.textColorClass} font-mono-numbers`}>
                        {leader.rating}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
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
