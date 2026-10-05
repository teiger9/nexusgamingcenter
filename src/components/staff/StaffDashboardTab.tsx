import React from 'react';
import { Reservation, GamingPost, Match, Tournament, RewardRedemption, Player, PostBlock } from '../../types';
import {
  Calendar,
  CheckCircle2,
  Clock,
  Play,
  Monitor,
  Gamepad2,
  Swords,
  Trophy,
  Gift,
  AlertTriangle,
  ArrowRight,
  Plus,
  Users,
  Zap,
} from 'lucide-react';

interface StaffDashboardTabProps {
  reservations: Reservation[];
  posts: GamingPost[];
  postBlocks: PostBlock[];
  matches: Match[];
  tournaments: Tournament[];
  redemptions: RewardRedemption[];
  onNavigateTab: (tab: string) => void;
  onOpenWalkInModal: () => void;
  onCheckInReservation: (reservation: Reservation) => void;
  onStartSession: (reservation: Reservation) => void;
  onSelectMatch?: (matchId: string) => void;
}

export const StaffDashboardTab: React.FC<StaffDashboardTabProps> = ({
  reservations,
  posts,
  postBlocks,
  matches,
  tournaments,
  redemptions,
  onNavigateTab,
  onOpenWalkInModal,
  onCheckInReservation,
  onStartSession,
  onSelectMatch,
}) => {
  const now = Date.now();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  // Today's reservations
  const todayReservations = reservations.filter(
    (r) => r.startAt >= startOfToday.getTime() && r.startAt <= endOfToday.getTime()
  );

  const confirmedToday = todayReservations.filter((r) => r.status === 'CONFIRMED');
  const pendingToday = todayReservations.filter(
    (r) => r.status === 'PENDING' || r.status === 'PENDING_ADMIN_APPROVAL'
  );
  const activeSessions = reservations.filter((r) => r.status === 'ACTIVE');

  // Station counts
  const pcPosts = posts.filter((p) => p.type === 'PC');
  const ps5Posts = posts.filter((p) => p.type === 'PS5');

  // Currently occupied station IDs by ACTIVE sessions
  const occupiedPostIds = new Set<string>();
  for (const session of activeSessions) {
    if (session.postIds) {
      session.postIds.forEach((pid) => occupiedPostIds.add(pid));
    }
  }

  // Active maintenance blocks
  const maintenancePostIds = new Set<string>();
  for (const block of postBlocks) {
    if (now >= block.startAt && now <= block.endAt) {
      maintenancePostIds.add(block.postId);
    }
  }

  const pcsInUse = pcPosts.filter((p) => occupiedPostIds.has(p.id)).length;
  const availablePcs = pcPosts.filter(
    (p) => p.status === 'ACTIVE' && !occupiedPostIds.has(p.id) && !maintenancePostIds.has(p.id)
  ).length;

  const ps5InUse = ps5Posts.filter((p) => occupiedPostIds.has(p.id)).length;
  const availablePs5 = ps5Posts.filter(
    (p) => p.status === 'ACTIVE' && !occupiedPostIds.has(p.id) && !maintenancePostIds.has(p.id)
  ).length;

  // Active matches (IN_PROGRESS, LIVE)
  const liveMatchesList = matches.filter((m) => m.status === 'IN_PROGRESS');

  // Active tournaments
  const activeTournamentsList = tournaments.filter(
    (t) => t.status === 'LIVE' || t.status === 'UPCOMING' || t.status === 'REGISTRATION_OPEN'
  );

  // Upcoming today reservations
  const upcomingReservations = todayReservations
    .filter((r) => r.status === 'CONFIRMED' && r.startAt >= now)
    .sort((a, b) => a.startAt - b.startAt)
    .slice(0, 5);

  // Pending staff actions (pending reservations to confirm, checked_in ready to start session)
  const readyToStartSessions = todayReservations.filter((r) => r.status === 'CHECKED_IN');
  const pendingStaffActionsCount = pendingToday.length + readyToStartSessions.length;

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Top Quick Actions Bar */}
      <div className="bg-[#0b0e14] border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div>
            <h3 className="text-base font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Zap className="w-5 h-5 text-red-500" />
              <span>Staff Quick Actions</span>
            </h3>
            <p className="text-xs text-slate-400">Rapid center operational tasks</p>
          </div>
          <button
            onClick={onOpenWalkInModal}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-[0_0_20px_rgba(239,68,68,0.4)] transition-all cursor-pointer font-display"
          >
            <Plus className="w-4 h-4" />
            <span>+ Walk-In Customer</span>
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
          <button
            onClick={onOpenWalkInModal}
            className="flex flex-col items-center justify-center p-3 rounded-xl bg-[#121620] hover:bg-slate-800/80 border border-slate-800 hover:border-red-500/50 text-slate-200 hover:text-white transition-all group"
          >
            <Plus className="w-5 h-5 text-red-400 mb-1 group-hover:scale-110 transition-transform" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-center">New Reservation</span>
          </button>

          <button
            onClick={() => onNavigateTab('reservations')}
            className="flex flex-col items-center justify-center p-3 rounded-xl bg-[#121620] hover:bg-slate-800/80 border border-slate-800 hover:border-emerald-500/50 text-slate-200 hover:text-white transition-all group"
          >
            <CheckCircle2 className="w-5 h-5 text-emerald-400 mb-1 group-hover:scale-110 transition-transform" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-center">Check In Customer</span>
          </button>

          <button
            onClick={() => onNavigateTab('stations')}
            className="flex flex-col items-center justify-center p-3 rounded-xl bg-[#121620] hover:bg-slate-800/80 border border-slate-800 hover:border-cyan-500/50 text-slate-200 hover:text-white transition-all group"
          >
            <Play className="w-5 h-5 text-cyan-400 mb-1 group-hover:scale-110 transition-transform" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-center">Start Session</span>
          </button>

          <button
            onClick={() => onNavigateTab('stations')}
            className="flex flex-col items-center justify-center p-3 rounded-xl bg-[#121620] hover:bg-slate-800/80 border border-slate-800 hover:border-cyan-500/50 text-slate-200 hover:text-white transition-all group"
          >
            <Monitor className="w-5 h-5 text-cyan-400 mb-1 group-hover:scale-110 transition-transform" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-center">View Stations</span>
          </button>

          <button
            onClick={() => onNavigateTab('active_matches')}
            className="flex flex-col items-center justify-center p-3 rounded-xl bg-[#121620] hover:bg-slate-800/80 border border-slate-800 hover:border-red-500/50 text-slate-200 hover:text-white transition-all group"
          >
            <Swords className="w-5 h-5 text-red-400 mb-1 group-hover:scale-110 transition-transform" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-center">Active Matches</span>
          </button>

          <button
            onClick={() => onNavigateTab('rewards')}
            className="flex flex-col items-center justify-center p-3 rounded-xl bg-[#121620] hover:bg-slate-800/80 border border-slate-800 hover:border-amber-500/50 text-slate-200 hover:text-white transition-all group"
          >
            <Gift className="w-5 h-5 text-amber-400 mb-1 group-hover:scale-110 transition-transform" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-center">Use Reward Code</span>
          </button>
        </div>
      </div>

      {/* TODAY'S OPERATIONAL METRICS */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Calendar className="w-5 h-5 text-red-500" />
            <span>Today's Real-Time Metrics</span>
          </h3>
          <span className="text-xs text-slate-400 font-mono">
            {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {/* Today's Reservations */}
          <div className="bg-[#0b0e14] border border-slate-800 rounded-xl p-4 relative overflow-hidden">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-400 font-medium">Reservations Today</span>
              <Calendar className="w-4 h-4 text-slate-500" />
            </div>
            <div className="text-2xl font-black font-display text-white">{todayReservations.length}</div>
            <div className="flex items-center gap-2 mt-2 text-[11px]">
              <span className="text-emerald-400 font-bold">{confirmedToday.length} Confirmed</span>
              <span className="text-slate-600">•</span>
              <span className="text-amber-400 font-bold">{pendingToday.length} Pending</span>
            </div>
          </div>

          {/* Active Sessions */}
          <div className="bg-[#0b0e14] border border-cyan-500/30 rounded-xl p-4 relative overflow-hidden">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-400 font-medium">Active Sessions</span>
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
            </div>
            <div className="text-2xl font-black font-display text-cyan-300">{activeSessions.length}</div>
            <p className="text-[11px] text-slate-400 mt-2">Currently gaming at Nexus</p>
          </div>

          {/* PC Status */}
          <div className="bg-[#0b0e14] border border-slate-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-400 font-medium">PC Stations</span>
              <Monitor className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black font-display text-emerald-400">{availablePcs}</span>
              <span className="text-xs text-slate-500 font-mono">Available</span>
              <span className="text-slate-600 ml-auto">|</span>
              <span className="text-sm font-bold text-red-400 font-mono">{pcsInUse} in use</span>
            </div>
            <div className="w-full bg-slate-800 h-1.5 rounded-full mt-3 overflow-hidden">
              <div
                className="bg-cyan-500 h-full rounded-full transition-all"
                style={{
                  width: `${pcPosts.length ? (pcsInUse / pcPosts.length) * 100 : 0}%`,
                }}
              />
            </div>
          </div>

          {/* PS5 Status */}
          <div className="bg-[#0b0e14] border border-slate-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-400 font-medium">PS5 Pro Stations</span>
              <Gamepad2 className="w-4 h-4 text-purple-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black font-display text-emerald-400">{availablePs5}</span>
              <span className="text-xs text-slate-500 font-mono">Available</span>
              <span className="text-slate-600 ml-auto">|</span>
              <span className="text-sm font-bold text-red-400 font-mono">{ps5InUse} in use</span>
            </div>
            <div className="w-full bg-slate-800 h-1.5 rounded-full mt-3 overflow-hidden">
              <div
                className="bg-purple-500 h-full rounded-full transition-all"
                style={{
                  width: `${ps5Posts.length ? (ps5InUse / ps5Posts.length) * 100 : 0}%`,
                }}
              />
            </div>
          </div>

          {/* Active Matches */}
          <div className="bg-[#0b0e14] border border-slate-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-400 font-medium">Live Matches</span>
              <Swords className="w-4 h-4 text-red-400" />
            </div>
            <div className="text-2xl font-black font-display text-white">{liveMatchesList.length}</div>
            <p className="text-[11px] text-slate-400 mt-2">1v1 & 5v5 lobbies in progress</p>
          </div>

          {/* Active Tournaments */}
          <div className="bg-[#0b0e14] border border-slate-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-400 font-medium">Active Tournaments</span>
              <Trophy className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-2xl font-black font-display text-amber-300">{activeTournamentsList.length}</div>
            <p className="text-[11px] text-slate-400 mt-2">Check-ins & brackets active</p>
          </div>

          {/* Pending Staff Actions */}
          <div className={`rounded-xl p-4 border col-span-2 sm:col-span-1 lg:col-span-2 ${
            pendingStaffActionsCount > 0
              ? 'bg-amber-950/20 border-amber-500/40 text-amber-300'
              : 'bg-[#0b0e14] border-slate-800 text-slate-400'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium">Pending Staff Actions</span>
              <AlertTriangle className={`w-4 h-4 ${pendingStaffActionsCount > 0 ? 'text-amber-400' : 'text-slate-600'}`} />
            </div>
            <div className="text-2xl font-black font-display">{pendingStaffActionsCount}</div>
            <p className="text-[11px] text-slate-400 mt-2">
              {pendingToday.length} booking approval{pendingToday.length !== 1 ? 's' : ''} • {readyToStartSessions.length} checked-in ready to launch
            </p>
          </div>
        </div>
      </div>

      {/* Two Column Section: Live Sessions & Upcoming Bookings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active Gaming Sessions */}
        <div className="bg-[#0b0e14] border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              <span>Live Gaming Sessions ({activeSessions.length})</span>
            </h4>
            <button
              onClick={() => onNavigateTab('stations')}
              className="text-xs text-cyan-400 hover:text-cyan-300 font-bold flex items-center gap-1"
            >
              <span>Manage Stations</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {activeSessions.length === 0 ? (
            <div className="py-12 text-center text-slate-500 border border-dashed border-slate-800 rounded-xl">
              <p className="text-sm font-medium">No activity yet</p>
              <p className="text-xs mt-1">There are no active gaming sessions running right now.</p>
            </div>
          ) : (
            <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
              {activeSessions.map((session) => {
                const startTime = session.startedAt || session.startAt;
                const elapsedMins = Math.max(0, Math.floor((now - startTime) / 60000));
                const totalMins = session.durationHours * 60;
                const remainingMins = Math.max(0, totalMins - elapsedMins);

                return (
                  <div
                    key={session.id}
                    className="p-3 bg-[#121620] border border-slate-800 rounded-xl flex items-center justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                          {session.postNames?.join(', ') || session.postType}
                        </span>
                        <span className="text-xs font-bold text-white">{session.fullName || session.gamerTag}</span>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-slate-400 mt-1 font-mono">
                        <span>Elapsed: {elapsedMins}m</span>
                        <span>•</span>
                        <span className={remainingMins <= 15 ? 'text-amber-400 font-bold' : 'text-slate-400'}>
                          Remaining: {remainingMins}m
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() => onNavigateTab('stations')}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 rounded-lg transition-colors"
                    >
                      View
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Upcoming Today Reservations */}
        <div className="bg-[#0b0e14] border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Clock className="w-4 h-4 text-emerald-400" />
              <span>Upcoming Today ({upcomingReservations.length})</span>
            </h4>
            <button
              onClick={() => onNavigateTab('reservations')}
              className="text-xs text-emerald-400 hover:text-emerald-300 font-bold flex items-center gap-1"
            >
              <span>All Bookings</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {upcomingReservations.length === 0 ? (
            <div className="py-12 text-center text-slate-500 border border-dashed border-slate-800 rounded-xl">
              <p className="text-sm font-medium">No activity yet</p>
              <p className="text-xs mt-1">No upcoming confirmed reservations for the rest of today.</p>
            </div>
          ) : (
            <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
              {upcomingReservations.map((res) => {
                const timeStr = new Date(res.startAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                });

                return (
                  <div
                    key={res.id}
                    className="p-3 bg-[#121620] border border-slate-800 rounded-xl flex items-center justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                          {timeStr}
                        </span>
                        <span className="text-xs font-bold text-white">{res.fullName || res.gamerTag}</span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">
                        {res.postNames?.join(', ') || res.postType} • {res.durationHours}h • {res.totalPrice} DA
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onCheckInReservation(res)}
                        className="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 text-xs font-bold rounded-lg transition-colors"
                      >
                        Check In
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
