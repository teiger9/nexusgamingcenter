import React, { useState } from 'react';
import { Reservation, GamingPost, RewardRedemption, Tournament, Player } from '../../types';
import {
  FileText,
  Calendar,
  Printer,
  Clock,
  Monitor,
  Gamepad2,
  CheckCircle2,
  XCircle,
  Gift,
  Trophy,
  Download,
} from 'lucide-react';

interface StaffReportsTabProps {
  reservations: Reservation[];
  posts: GamingPost[];
  redemptions: RewardRedemption[];
  tournaments: Tournament[];
  staffPlayer: Player;
}

export const StaffReportsTab: React.FC<StaffReportsTabProps> = ({
  reservations,
  posts,
  redemptions,
  tournaments,
  staffPlayer,
}) => {
  const [rangeFilter, setRangeFilter] = useState<'today' | 'yesterday' | '7days'>('today');

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const endOfToday = startOfToday + 24 * 3600 * 1000 - 1;

  const startOfYesterday = startOfToday - 24 * 3600 * 1000;
  const endOfYesterday = startOfToday - 1;

  const startOf7Days = startOfToday - 7 * 24 * 3600 * 1000;

  let minTime = startOfToday;
  let maxTime = endOfToday;

  if (rangeFilter === 'yesterday') {
    minTime = startOfYesterday;
    maxTime = endOfYesterday;
  } else if (rangeFilter === '7days') {
    minTime = startOf7Days;
    maxTime = endOfToday;
  }

  // Filtered dataset for reporting
  const rangeReservations = reservations.filter(
    (r) => r.startAt >= minTime && r.startAt <= maxTime
  );

  const completedSessions = rangeReservations.filter((r) => r.status === 'COMPLETED');
  const activeSessions = rangeReservations.filter((r) => r.status === 'ACTIVE');
  const noShows = rangeReservations.filter((r) => r.status === 'NO_SHOW');

  // Device usage
  const pcReservations = rangeReservations.filter((r) => r.postType === 'PC');
  const ps5Reservations = rangeReservations.filter((r) => r.postType === 'PS5');

  const pcTotalHours = pcReservations.reduce((acc, curr) => acc + (curr.durationHours || 0), 0);
  const ps5TotalHours = ps5Reservations.reduce((acc, curr) => acc + (curr.durationHours || 0), 0);

  const totalRevenueDA = rangeReservations
    .filter((r) => r.status === 'COMPLETED' || r.status === 'ACTIVE' || r.paymentStatus === 'PAID')
    .reduce((acc, curr) => acc + (curr.totalPrice || 0), 0);

  // Redemptions in range
  const rangeRedemptions = redemptions.filter(
    (red) => red.createdAt >= minTime && red.createdAt <= maxTime
  );
  const usedRedemptions = rangeRedemptions.filter((red) => red.status === 'USED');

  // Tournament check-ins in range
  let tournamentCheckinsCount = 0;
  tournaments.forEach((t) => {
    (t.participants || []).forEach((p) => {
      if (p.checkedIn && p.checkedInAt && p.checkedInAt >= minTime && p.checkedInAt <= maxTime) {
        tournamentCheckinsCount++;
      }
    });
  });

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 animate-fade-in print:p-0">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#0b0e14] border border-slate-800 rounded-2xl p-5 print:border-none print:p-0">
        <div>
          <h3 className="text-base font-bold text-white uppercase tracking-wider flex items-center gap-2 font-display print:text-black">
            <FileText className="w-5 h-5 text-red-500 print:hidden" />
            <span>Operational Center Reports</span>
          </h3>
          <p className="text-xs text-slate-400 print:text-gray-600">
            Nexus Gaming Center daily activity, station throughput, and revenue summary
          </p>
        </div>

        <div className="flex items-center gap-2 print:hidden">
          <button
            onClick={handlePrint}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-colors flex items-center gap-2 cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Print Report</span>
          </button>
        </div>
      </div>

      {/* Range Filter */}
      <div className="bg-[#0b0e14] border border-slate-800 rounded-2xl p-4 flex items-center justify-between print:hidden">
        <div className="flex rounded-xl bg-[#121620] p-1 border border-slate-800">
          <button
            onClick={() => setRangeFilter('today')}
            className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${
              rangeFilter === 'today' ? 'bg-red-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            Today
          </button>
          <button
            onClick={() => setRangeFilter('yesterday')}
            className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${
              rangeFilter === 'yesterday' ? 'bg-red-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            Yesterday
          </button>
          <button
            onClick={() => setRangeFilter('7days')}
            className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${
              rangeFilter === '7days' ? 'bg-red-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            Last 7 Days
          </button>
        </div>

        <span className="text-xs text-slate-500 font-mono">
          Generated for: {staffPlayer.gamerTag} ({staffPlayer.role})
        </span>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {/* Total Bookings */}
        <div className="bg-[#0b0e14] border border-slate-800 rounded-xl p-4">
          <span className="text-xs text-slate-400 font-medium block mb-1">Total Reservations</span>
          <span className="text-2xl font-black font-display text-white">{rangeReservations.length}</span>
          <p className="text-[11px] text-slate-500 mt-1 font-mono">
            {completedSessions.length} completed • {activeSessions.length} active
          </p>
        </div>

        {/* PC Usage */}
        <div className="bg-[#0b0e14] border border-slate-800 rounded-xl p-4">
          <span className="text-xs text-slate-400 font-medium block mb-1">PC Usage</span>
          <span className="text-2xl font-black font-display text-cyan-400">{pcTotalHours} hrs</span>
          <p className="text-[11px] text-slate-500 mt-1 font-mono">
            {pcReservations.length} sessions booked
          </p>
        </div>

        {/* PS5 Usage */}
        <div className="bg-[#0b0e14] border border-slate-800 rounded-xl p-4">
          <span className="text-xs text-slate-400 font-medium block mb-1">PS5 Usage</span>
          <span className="text-2xl font-black font-display text-purple-400">{ps5TotalHours} hrs</span>
          <p className="text-[11px] text-slate-500 mt-1 font-mono">
            {ps5Reservations.length} sessions booked
          </p>
        </div>

        {/* Revenue DA */}
        <div className="bg-[#0b0e14] border border-slate-800 rounded-xl p-4">
          <span className="text-xs text-slate-400 font-medium block mb-1">Total Booked Volume</span>
          <span className="text-2xl font-black font-display text-emerald-400">{totalRevenueDA} DA</span>
          <p className="text-[11px] text-slate-500 mt-1 font-mono">
            Across {rangeReservations.length} sessions
          </p>
        </div>

        {/* No Shows */}
        <div className="bg-[#0b0e14] border border-slate-800 rounded-xl p-4">
          <span className="text-xs text-slate-400 font-medium block mb-1">No-Shows</span>
          <span className="text-2xl font-black font-display text-red-400">{noShows.length}</span>
          <p className="text-[11px] text-slate-500 mt-1 font-mono">Missed slots</p>
        </div>

        {/* Rewards Redeemed */}
        <div className="bg-[#0b0e14] border border-slate-800 rounded-xl p-4">
          <span className="text-xs text-slate-400 font-medium block mb-1">Rewards Redeemed</span>
          <span className="text-2xl font-black font-display text-amber-400">{usedRedemptions.length}</span>
          <p className="text-[11px] text-slate-500 mt-1 font-mono">Vouchers consumed</p>
        </div>

        {/* Tournament Check-ins */}
        <div className="bg-[#0b0e14] border border-slate-800 rounded-xl p-4 col-span-2">
          <span className="text-xs text-slate-400 font-medium block mb-1">Tournament Check-Ins</span>
          <span className="text-2xl font-black font-display text-white">{tournamentCheckinsCount}</span>
          <p className="text-[11px] text-slate-500 mt-1 font-mono">
            Competitor arrivals recorded by staff
          </p>
        </div>
      </div>

      {/* Operational Activity Log */}
      <div className="bg-[#0b0e14] border border-slate-800 rounded-2xl p-5 space-y-4">
        <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
          <Clock className="w-4 h-4 text-cyan-400" />
          <span>Operational Timeline ({rangeReservations.length} Events)</span>
        </h4>

        {rangeReservations.length === 0 ? (
          <div className="py-12 text-center text-slate-500">
            <p className="text-sm font-medium">No activity yet</p>
            <p className="text-xs mt-1 text-slate-600">No operational records found for this period.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/60 max-h-96 overflow-y-auto">
            {rangeReservations.map((res) => {
              return (
                <div
                  key={res.id}
                  className="py-3 px-2 flex items-center justify-between text-xs font-mono"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-slate-500">
                      {new Date(res.startAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="font-bold text-white font-sans">{res.fullName || res.gamerTag}</span>
                    <span className="text-cyan-400">{res.postNames?.join(', ')}</span>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-slate-400">{res.durationHours}h</span>
                    <span className="text-emerald-400 font-bold">{res.totalPrice} DA</span>
                    <span className="px-2 py-0.5 rounded text-[10px] bg-[#121620] text-slate-300 border border-slate-700">
                      {res.status}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
