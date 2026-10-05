import React, { useState, useEffect } from 'react';
import { GamingPost, PostBlock, Reservation, Player, ReservationSettings } from '../../types';
import { staffEndSession, staffClearStationIssue } from '../../services/reservationService';
import {
  Monitor,
  Gamepad2,
  Play,
  Square,
  Wrench,
  Clock,
  User,
  AlertTriangle,
  CheckCircle2,
  Plus,
  RefreshCw,
} from 'lucide-react';

interface StaffStationsTabProps {
  posts: GamingPost[];
  postBlocks: PostBlock[];
  reservations: Reservation[];
  staffPlayer: Player;
  settings: ReservationSettings;
  onOpenWalkInModal: (preselectedPostId?: string) => void;
  onOpenReportIssueModal: (post: GamingPost) => void;
  onSelectReservationDetails: (reservation: Reservation) => void;
}

export const StaffStationsTab: React.FC<StaffStationsTabProps> = ({
  posts,
  postBlocks,
  reservations,
  staffPlayer,
  settings,
  onOpenWalkInModal,
  onOpenReportIssueModal,
  onSelectReservationDetails,
}) => {
  // Live clock state ticking every 1 second client-side for live session timers
  const [currentClock, setCurrentClock] = useState<number>(Date.now());

  const [deviceFilter, setDeviceFilter] = useState<'ALL' | 'PC' | 'PS5'>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const [isProcessing, setIsProcessing] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentClock(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleEndSession = async (reservation: Reservation) => {
    setIsProcessing(reservation.id);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await staffEndSession(reservation.id, staffPlayer);
      setSuccessMsg(`Session for ${reservation.gamerTag} ended (${res.elapsedMinutes} mins). Final price: ${res.finalPrice} DA.`);
    } catch (err: any) {
      console.error('Error ending session:', err);
      setErrorMsg(err.message || 'Failed to end session');
    } finally {
      setIsProcessing(null);
    }
  };

  const handleClearMaintenance = async (block: PostBlock, postId: string) => {
    setIsProcessing(block.id);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      await staffClearStationIssue(block.id, postId, staffPlayer);
      setSuccessMsg('Station technical issue cleared. Returned to AVAILABLE.');
    } catch (err: any) {
      console.error('Error clearing maintenance:', err);
      setErrorMsg(err.message || 'Failed to clear issue');
    } finally {
      setIsProcessing(null);
    }
  };

  // Helper to determine status and associated reservation/block for each station
  const stationStatuses = posts.map((post) => {
    // Check 1: Maintenance block
    const activeBlock = postBlocks.find(
      (b) => b.postId === post.id && currentClock >= b.startAt && currentClock <= b.endAt
    );
    if (activeBlock || post.status === 'MAINTENANCE') {
      return {
        post,
        computedStatus: 'MAINTENANCE' as const,
        activeBlock,
        currentReservation: null,
      };
    }

    // Check 2: Active running session (status === 'ACTIVE')
    const activeSession = reservations.find(
      (r) => r.status === 'ACTIVE' && r.postIds && r.postIds.includes(post.id)
    );
    if (activeSession) {
      return {
        post,
        computedStatus: 'IN_USE' as const,
        activeBlock: null,
        currentReservation: activeSession,
      };
    }

    // Check 3: Reserved (CONFIRMED or CHECKED_IN for right now or next 45 min)
    const upcomingReservation = reservations.find((r) => {
      if (!['CONFIRMED', 'CHECKED_IN'].includes(r.status)) return false;
      if (!r.postIds || !r.postIds.includes(post.id)) return false;
      // Overlaps right now or starts within 45 mins
      const isOverlapping = currentClock >= r.startAt && currentClock <= r.endAt;
      const isUpcomingSoon = r.startAt > currentClock && r.startAt - currentClock <= 45 * 60 * 1000;
      return isOverlapping || isUpcomingSoon;
    });

    if (upcomingReservation) {
      return {
        post,
        computedStatus: 'RESERVED' as const,
        activeBlock: null,
        currentReservation: upcomingReservation,
      };
    }

    // Default: Available
    return {
      post,
      computedStatus: 'AVAILABLE' as const,
      activeBlock: null,
      currentReservation: null,
    };
  });

  // Filter stations
  const filteredStationStatuses = stationStatuses.filter(({ post, computedStatus }) => {
    if (deviceFilter !== 'ALL' && post.type !== deviceFilter) return false;
    if (statusFilter !== 'ALL' && computedStatus !== statusFilter) return false;
    return true;
  });

  const getStatusBadge = (status: 'AVAILABLE' | 'RESERVED' | 'IN_USE' | 'MAINTENANCE') => {
    switch (status) {
      case 'AVAILABLE':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold font-mono bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            AVAILABLE
          </span>
        );
      case 'IN_USE':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold font-mono bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 flex items-center gap-1.5 animate-pulse">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
            IN USE
          </span>
        );
      case 'RESERVED':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold font-mono bg-blue-500/20 text-blue-300 border border-blue-500/30">
            RESERVED
          </span>
        );
      case 'MAINTENANCE':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold font-mono bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1">
            <Wrench className="w-3 h-3" />
            MAINTENANCE
          </span>
        );
    }
  };

  // Format seconds into HH:MM:SS
  const formatTimer = (totalSeconds: number) => {
    const s = Math.max(0, Math.floor(totalSeconds));
    const hours = Math.floor(s / 3600);
    const minutes = Math.floor((s % 3600) / 60);
    const seconds = s % 60;

    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Controls Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#0b0e14] border border-slate-800 rounded-2xl p-5">
        <div>
          <h3 className="text-base font-bold text-white uppercase tracking-wider flex items-center gap-2 font-display">
            <Monitor className="w-5 h-5 text-cyan-400" />
            <span>Gaming Stations Live Grid</span>
          </h3>
          <p className="text-xs text-slate-400">
            Hardware status, live session timers, and operational dispatch
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onOpenWalkInModal()}
            className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-[0_0_20px_rgba(239,68,68,0.4)] transition-all flex items-center gap-2 cursor-pointer font-display"
          >
            <Plus className="w-4 h-4" />
            <span>+ Walk-In Session</span>
          </button>
        </div>
      </div>

      {/* Alerts */}
      {successMsg && (
        <div className="p-3 bg-emerald-950/40 border border-emerald-500/50 rounded-xl text-xs text-emerald-300 flex items-center justify-between">
          <span>{successMsg}</span>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-400 hover:text-white">✕</button>
        </div>
      )}
      {errorMsg && (
        <div className="p-3 bg-red-950/40 border border-red-500/50 rounded-xl text-xs text-red-300 flex items-center justify-between">
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="text-red-400 hover:text-white">✕</button>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="bg-[#0b0e14] border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-xl bg-[#121620] p-1 border border-slate-800">
          <button
            onClick={() => setDeviceFilter('ALL')}
            className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${
              deviceFilter === 'ALL' ? 'bg-red-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            All Stations ({posts.length})
          </button>
          <button
            onClick={() => setDeviceFilter('PC')}
            className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${
              deviceFilter === 'PC' ? 'bg-red-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            PCs ({posts.filter((p) => p.type === 'PC').length})
          </button>
          <button
            onClick={() => setDeviceFilter('PS5')}
            className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${
              deviceFilter === 'PS5' ? 'bg-red-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            PS5 ({posts.filter((p) => p.type === 'PS5').length})
          </button>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-[#121620] border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-red-500"
          >
            <option value="ALL">All Statuses</option>
            <option value="AVAILABLE">AVAILABLE</option>
            <option value="IN_USE">IN USE</option>
            <option value="RESERVED">RESERVED</option>
            <option value="MAINTENANCE">MAINTENANCE</option>
          </select>
        </div>
      </div>

      {/* Grid of Stations */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filteredStationStatuses.map(({ post, computedStatus, activeBlock, currentReservation }) => {
          const isBusy = isProcessing === (currentReservation?.id || activeBlock?.id);

          // Session timing calculation
          let elapsedSeconds = 0;
          let remainingSeconds = 0;
          if (computedStatus === 'IN_USE' && currentReservation) {
            const startMs = currentReservation.startedAt || currentReservation.startAt;
            elapsedSeconds = Math.max(0, (currentClock - startMs) / 1000);
            const totalDurationSeconds = (currentReservation.durationHours || 1) * 3600;
            remainingSeconds = Math.max(0, totalDurationSeconds - elapsedSeconds);
          }

          return (
            <div
              key={post.id}
              className={`bg-[#0b0e14] border rounded-2xl p-5 flex flex-col justify-between transition-all relative overflow-hidden ${
                computedStatus === 'IN_USE'
                  ? 'border-cyan-500/50 shadow-[0_0_20px_rgba(6,182,212,0.15)] bg-gradient-to-b from-[#0b0e14] to-cyan-950/20'
                  : computedStatus === 'MAINTENANCE'
                  ? 'border-amber-500/40 bg-gradient-to-b from-[#0b0e14] to-amber-950/20'
                  : computedStatus === 'RESERVED'
                  ? 'border-blue-500/40 bg-gradient-to-b from-[#0b0e14] to-blue-950/20'
                  : 'border-slate-800 hover:border-slate-700'
              }`}
            >
              {/* Header */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      post.type === 'PC' ? 'bg-cyan-500/10 text-cyan-400' : 'bg-purple-500/10 text-purple-400'
                    }`}>
                      {post.type === 'PC' ? <Monitor className="w-4 h-4" /> : <Gamepad2 className="w-4 h-4" />}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white font-mono">{post.name}</h4>
                      <p className="text-[10px] text-slate-500 uppercase">{post.type} Station</p>
                    </div>
                  </div>
                  {getStatusBadge(computedStatus)}
                </div>

                {/* Specs */}
                {post.specs && (
                  <p className="text-[11px] text-slate-400 mb-3 line-clamp-1 font-mono">
                    {post.specs}
                  </p>
                )}

                {/* Status Detail Content */}
                {computedStatus === 'IN_USE' && currentReservation && (
                  <div className="p-3 bg-[#121620] border border-cyan-500/30 rounded-xl space-y-2 mb-4">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400 flex items-center gap-1">
                        <User className="w-3.5 h-3.5 text-cyan-400" />
                        Customer:
                      </span>
                      <span className="font-bold text-white truncate max-w-[130px]">
                        {currentReservation.fullName || currentReservation.gamerTag}
                      </span>
                    </div>

                    {/* LIVE TIMER CARD */}
                    <div className="pt-1 border-t border-slate-800/80">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-[10px] text-slate-500 uppercase font-mono">Elapsed Time</p>
                          <p className="text-base font-black font-mono text-cyan-300 tracking-wider">
                            {formatTimer(elapsedSeconds)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] text-slate-500 uppercase font-mono">Remaining</p>
                          <p className={`text-base font-black font-mono tracking-wider ${
                            remainingSeconds <= 300 ? 'text-amber-400 animate-pulse' : 'text-slate-300'
                          }`}>
                            {formatTimer(remainingSeconds)}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {computedStatus === 'RESERVED' && currentReservation && (
                  <div className="p-3 bg-[#121620] border border-blue-500/30 rounded-xl space-y-1.5 text-xs mb-4">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Booked for:</span>
                      <span className="font-bold text-white truncate max-w-[130px]">
                        {currentReservation.fullName || currentReservation.gamerTag}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span>Time:</span>
                      <span className="font-mono text-blue-300">
                        {new Date(currentReservation.startAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ({currentReservation.durationHours}h)
                      </span>
                    </div>
                  </div>
                )}

                {computedStatus === 'MAINTENANCE' && (
                  <div className="p-3 bg-[#121620] border border-amber-500/30 rounded-xl space-y-1 text-xs mb-4">
                    <p className="font-bold text-amber-300 flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Maintenance Issue:
                    </p>
                    <p className="text-[11px] text-slate-300 italic">
                      {activeBlock?.reason || 'Hardware under inspection by technical staff'}
                    </p>
                  </div>
                )}

                {computedStatus === 'AVAILABLE' && (
                  <div className="py-4 text-center text-xs text-slate-500 border border-dashed border-slate-800/80 rounded-xl mb-4">
                    Ready for walk-in or assigned session
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-2">
                {computedStatus === 'AVAILABLE' && (
                  <>
                    <button
                      onClick={() => onOpenWalkInModal(post.id)}
                      className="flex-1 px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 rounded-lg text-xs font-bold transition-colors text-center"
                    >
                      Assign Walk-In
                    </button>
                    <button
                      onClick={() => onOpenReportIssueModal(post)}
                      className="p-1.5 text-slate-500 hover:text-amber-400 rounded-lg hover:bg-slate-800 transition-colors"
                      title="Report Technical Issue"
                    >
                      <Wrench className="w-4 h-4" />
                    </button>
                  </>
                )}

                {computedStatus === 'IN_USE' && currentReservation && (
                  <>
                    <button
                      disabled={isBusy}
                      onClick={() => handleEndSession(currentReservation)}
                      className="flex-1 px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-black uppercase tracking-wider transition-all shadow-[0_0_15px_rgba(239,68,68,0.4)] flex items-center justify-center gap-1.5"
                    >
                      <Square className="w-3.5 h-3.5 fill-current" />
                      <span>End Session</span>
                    </button>
                    <button
                      onClick={() => onSelectReservationDetails(currentReservation)}
                      className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-bold"
                    >
                      View
                    </button>
                  </>
                )}

                {computedStatus === 'RESERVED' && currentReservation && (
                  <>
                    <button
                      onClick={() => onSelectReservationDetails(currentReservation)}
                      className="flex-1 px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 text-blue-300 rounded-lg text-xs font-bold transition-colors"
                    >
                      View Booking
                    </button>
                    <button
                      onClick={() => onOpenReportIssueModal(post)}
                      className="p-1.5 text-slate-500 hover:text-amber-400 rounded-lg hover:bg-slate-800 transition-colors"
                      title="Report Technical Issue"
                    >
                      <Wrench className="w-4 h-4" />
                    </button>
                  </>
                )}

                {computedStatus === 'MAINTENANCE' && (
                  <>
                    {activeBlock && (
                      <button
                        disabled={isBusy}
                        onClick={() => handleClearMaintenance(activeBlock, post.id)}
                        className="flex-1 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-neutral-950 rounded-lg text-xs font-bold transition-colors"
                      >
                        Clear Issue
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
