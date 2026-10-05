import React, { useState, useMemo } from 'react';
import { Reservation, ReservationStatus, GamingPostType, Player, ReservationSettings } from '../../types';
import {
  adminCheckInReservation,
  adminMarkNoShow,
  adminCancelReservation,
  adminConfirmReservation,
  staffStartSession,
  staffEndSession,
} from '../../services/reservationService';
import {
  Calendar,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  Play,
  Square,
  AlertTriangle,
  Clock,
  User,
  Phone,
  Monitor,
  Gamepad2,
  ChevronDown,
  Info,
  DollarSign,
  Plus,
  RefreshCw,
} from 'lucide-react';

interface StaffReservationsTabProps {
  reservations: Reservation[];
  staffPlayer: Player;
  settings: ReservationSettings;
  onOpenWalkInModal: () => void;
  onSelectReservationDetails: (reservation: Reservation) => void;
}

export const StaffReservationsTab: React.FC<StaffReservationsTabProps> = ({
  reservations,
  staffPlayer,
  settings,
  onOpenWalkInModal,
  onSelectReservationDetails,
}) => {
  // Filters
  const [dateFilter, setDateFilter] = useState<'today' | 'tomorrow' | 'all'>('today');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [deviceFilter, setDeviceFilter] = useState<string>('ALL');

  // Action states
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Confirm modal for actions
  const [confirmActionModal, setConfirmActionModal] = useState<{
    reservation: Reservation;
    action: 'CHECK_IN' | 'START_SESSION' | 'END_SESSION' | 'NO_SHOW' | 'CANCEL' | 'CONFIRM';
  } | null>(null);

  // Date boundaries
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const endOfToday = startOfToday + 24 * 3600 * 1000 - 1;
  const startOfTomorrow = endOfToday + 1;
  const endOfTomorrow = startOfTomorrow + 24 * 3600 * 1000 - 1;

  // Filtered reservations
  const filteredReservations = useMemo(() => {
    return reservations.filter((res) => {
      // 1. Date Filter
      if (dateFilter === 'today') {
        if (res.startAt < startOfToday || res.startAt > endOfToday) return false;
      } else if (dateFilter === 'tomorrow') {
        if (res.startAt < startOfTomorrow || res.startAt > endOfTomorrow) return false;
      }

      // 2. Status Filter
      if (statusFilter !== 'ALL' && res.status !== statusFilter) {
        return false;
      }

      // 3. Device Filter
      if (deviceFilter !== 'ALL') {
        if (deviceFilter === 'PC' && res.postType !== 'PC') return false;
        if (deviceFilter === 'PS5' && res.postType !== 'PS5') return false;
      }

      // 4. Search Filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const tag = (res.gamerTag || '').toLowerCase();
        const name = (res.fullName || '').toLowerCase();
        const phone = (res.phoneNumber || res.phone || '').toLowerCase();
        const posts = (res.postNames || []).join(' ').toLowerCase();

        if (!tag.includes(q) && !name.includes(q) && !phone.includes(q) && !posts.includes(q)) {
          return false;
        }
      }

      return true;
    }).sort((a, b) => b.startAt - a.startAt);
  }, [reservations, dateFilter, statusFilter, deviceFilter, searchQuery, startOfToday, endOfToday, startOfTomorrow, endOfTomorrow]);

  // Execute confirmed staff action
  const handleExecuteAction = async () => {
    if (!confirmActionModal) return;
    const { reservation, action } = confirmActionModal;
    setProcessingId(reservation.id);
    setActionError(null);
    setActionSuccess(null);

    try {
      if (action === 'CONFIRM') {
        await adminConfirmReservation(reservation.id, staffPlayer);
        setActionSuccess(`Reservation for ${reservation.gamerTag} confirmed.`);
      } else if (action === 'CHECK_IN') {
        await adminCheckInReservation(reservation.id, staffPlayer);
        setActionSuccess(`Customer ${reservation.gamerTag} checked in successfully.`);
      } else if (action === 'START_SESSION') {
        await staffStartSession(reservation.id, staffPlayer);
        setActionSuccess(`Gaming session started for ${reservation.gamerTag}.`);
      } else if (action === 'END_SESSION') {
        const res = await staffEndSession(reservation.id, staffPlayer);
        setActionSuccess(`Gaming session ended (${res.elapsedMinutes} mins). Total: ${res.finalPrice} DA.`);
      } else if (action === 'NO_SHOW') {
        await adminMarkNoShow(reservation.id, staffPlayer);
        setActionSuccess(`Reservation marked as No-Show.`);
      } else if (action === 'CANCEL') {
        await adminCancelReservation(reservation.id, staffPlayer, 'Cancelled at counter by staff');
        setActionSuccess(`Reservation cancelled.`);
      }

      setConfirmActionModal(null);
    } catch (err: any) {
      console.error('Error executing staff reservation action:', err);
      setActionError(err.message || 'Operation failed');
    } finally {
      setProcessingId(null);
    }
  };

  const getStatusBadge = (status: ReservationStatus) => {
    switch (status) {
      case 'ACTIVE':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold font-mono bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 flex items-center gap-1.5 animate-pulse">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
            ACTIVE
          </span>
        );
      case 'CHECKED_IN':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
            CHECKED IN
          </span>
        );
      case 'CONFIRMED':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold font-mono bg-blue-500/20 text-blue-300 border border-blue-500/40">
            CONFIRMED
          </span>
        );
      case 'PENDING':
      case 'PENDING_ADMIN_APPROVAL':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold font-mono bg-amber-500/20 text-amber-300 border border-amber-500/40">
            PENDING
          </span>
        );
      case 'COMPLETED':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold font-mono bg-slate-800 text-slate-400 border border-slate-700">
            COMPLETED
          </span>
        );
      case 'NO_SHOW':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold font-mono bg-red-950/40 text-red-400 border border-red-500/30">
            NO SHOW
          </span>
        );
      case 'CANCELLED':
      case 'REJECTED':
      case 'EXPIRED':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold font-mono bg-slate-900 text-slate-500 border border-slate-800">
            {status}
          </span>
        );
      default:
        return <span className="px-2 py-0.5 text-xs text-slate-400">{status}</span>;
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Banner with Quick Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#0b0e14] border border-slate-800 rounded-2xl p-5">
        <div>
          <h3 className="text-base font-bold text-white uppercase tracking-wider flex items-center gap-2 font-display">
            <Calendar className="w-5 h-5 text-red-500" />
            <span>Reservations & Session Dispatch</span>
          </h3>
          <p className="text-xs text-slate-400">
            Authoritative check-ins, active session tracking, and walk-in dispatching
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onOpenWalkInModal}
            className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-[0_0_20px_rgba(239,68,68,0.4)] transition-all flex items-center gap-2 cursor-pointer font-display"
          >
            <Plus className="w-4 h-4" />
            <span>+ Walk-In Customer</span>
          </button>
        </div>
      </div>

      {/* Action Alerts */}
      {actionSuccess && (
        <div className="p-3 bg-emerald-950/40 border border-emerald-500/50 rounded-xl text-xs text-emerald-300 flex items-center justify-between">
          <span>{actionSuccess}</span>
          <button onClick={() => setActionSuccess(null)} className="text-emerald-400 hover:text-white">✕</button>
        </div>
      )}
      {actionError && (
        <div className="p-3 bg-red-950/40 border border-red-500/50 rounded-xl text-xs text-red-300 flex items-center justify-between">
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} className="text-red-400 hover:text-white">✕</button>
        </div>
      )}

      {/* Filters Bar */}
      <div className="bg-[#0b0e14] border border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Date Filter Tabs */}
          <div className="flex rounded-xl bg-[#121620] p-1 border border-slate-800">
            <button
              onClick={() => setDateFilter('today')}
              className={`flex-1 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${
                dateFilter === 'today' ? 'bg-red-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              Today
            </button>
            <button
              onClick={() => setDateFilter('tomorrow')}
              className={`flex-1 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${
                dateFilter === 'tomorrow' ? 'bg-red-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              Tomorrow
            </button>
            <button
              onClick={() => setDateFilter('all')}
              className={`flex-1 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${
                dateFilter === 'all' ? 'bg-red-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              All Dates
            </button>
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full bg-[#121620] border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-red-500"
            >
              <option value="ALL">All Statuses</option>
              <option value="PENDING">PENDING</option>
              <option value="CONFIRMED">CONFIRMED</option>
              <option value="CHECKED_IN">CHECKED IN</option>
              <option value="ACTIVE">ACTIVE (Running)</option>
              <option value="COMPLETED">COMPLETED</option>
              <option value="NO_SHOW">NO SHOW</option>
              <option value="CANCELLED">CANCELLED</option>
            </select>
          </div>

          {/* Device Filter */}
          <div>
            <select
              value={deviceFilter}
              onChange={(e) => setDeviceFilter(e.target.value)}
              className="w-full bg-[#121620] border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-red-500"
            >
              <option value="ALL">All Stations (PC & PS5)</option>
              <option value="PC">PC Stations</option>
              <option value="PS5">PS5 Stations</option>
            </select>
          </div>

          {/* Customer Search */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search customer, phone, station..."
              className="w-full bg-[#121620] border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-red-500 placeholder:text-slate-600"
            />
          </div>
        </div>
      </div>

      {/* Reservations Table / Cards */}
      <div className="bg-[#0b0e14] border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="px-6 py-4 border-b border-slate-800/80 flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Showing {filteredReservations.length} Reservation{filteredReservations.length !== 1 ? 's' : ''}
          </span>
          <span className="text-xs font-mono text-slate-500">
            Prices: PC {settings.pcHourlyPrice || 150} DA/h • PS5 {settings.ps5HourlyPrice || 400} DA/h
          </span>
        </div>

        {filteredReservations.length === 0 ? (
          <div className="py-16 text-center text-slate-500">
            <Calendar className="w-10 h-10 mx-auto mb-2 text-slate-600 opacity-50" />
            <p className="text-sm font-medium">No activity yet</p>
            <p className="text-xs mt-1 text-slate-600">No reservations match the selected date and filters.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/60">
            {filteredReservations.map((res) => {
              const timeStr = new Date(res.startAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              });
              const dateStr = new Date(res.startAt).toLocaleDateString([], {
                month: 'short',
                day: 'numeric',
              });
              const isProcessing = processingId === res.id;

              return (
                <div
                  key={res.id}
                  className="p-4 sm:p-5 hover:bg-[#0e121a] transition-colors flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                >
                  {/* Left Column: Customer & Station Info */}
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {getStatusBadge(res.status)}
                      <span className="text-sm font-bold text-white font-display">
                        {res.fullName || res.gamerTag}
                      </span>
                      {res.isWalkIn && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                          WALK-IN
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400 font-mono">
                      <span className="flex items-center gap-1 text-cyan-400 font-bold">
                        {res.postType === 'PC' ? <Monitor className="w-3.5 h-3.5" /> : <Gamepad2 className="w-3.5 h-3.5" />}
                        {res.postNames?.join(', ') || res.postType}
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1 text-slate-300">
                        <Clock className="w-3.5 h-3.5 text-slate-500" />
                        {dateStr} at {timeStr} ({res.durationHours}h)
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1 text-slate-300">
                        <DollarSign className="w-3.5 h-3.5 text-slate-500" />
                        {res.totalPrice} DA ({res.paymentStatus})
                      </span>
                      {res.phoneNumber && (
                        <>
                          <span>•</span>
                          <span className="flex items-center gap-1 text-slate-400">
                            <Phone className="w-3.5 h-3.5 text-slate-500" />
                            {res.phoneNumber}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Right Column: Operational Staff Actions */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {/* Action 1: Pending -> Confirm */}
                    {(res.status === 'PENDING' || res.status === 'PENDING_ADMIN_APPROVAL') && (
                      <button
                        disabled={isProcessing}
                        onClick={() => setConfirmActionModal({ reservation: res, action: 'CONFIRM' })}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
                      >
                        Confirm Booking
                      </button>
                    )}

                    {/* Action 2: Confirmed -> Check In */}
                    {res.status === 'CONFIRMED' && (
                      <>
                        <button
                          disabled={isProcessing}
                          onClick={() => setConfirmActionModal({ reservation: res, action: 'CHECK_IN' })}
                          className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-black uppercase tracking-wider transition-all shadow-[0_0_15px_rgba(16,185,129,0.3)] cursor-pointer"
                        >
                          Check In
                        </button>
                        <button
                          disabled={isProcessing}
                          onClick={() => setConfirmActionModal({ reservation: res, action: 'NO_SHOW' })}
                          className="px-3 py-1.5 bg-slate-800 hover:bg-red-950/60 text-slate-400 hover:text-red-400 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                        >
                          No Show
                        </button>
                      </>
                    )}

                    {/* Action 3: Checked In -> Start Session */}
                    {res.status === 'CHECKED_IN' && (
                      <button
                        disabled={isProcessing}
                        onClick={() => setConfirmActionModal({ reservation: res, action: 'START_SESSION' })}
                        className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-black uppercase tracking-wider transition-all shadow-[0_0_15px_rgba(6,182,212,0.4)] flex items-center gap-1.5 cursor-pointer"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Start Session</span>
                      </button>
                    )}

                    {/* Action 4: Active -> End Session */}
                    {res.status === 'ACTIVE' && (
                      <button
                        disabled={isProcessing}
                        onClick={() => setConfirmActionModal({ reservation: res, action: 'END_SESSION' })}
                        className="px-4 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-black uppercase tracking-wider transition-all shadow-[0_0_15px_rgba(239,68,68,0.4)] flex items-center gap-1.5 cursor-pointer"
                      >
                        <Square className="w-3.5 h-3.5 fill-current" />
                        <span>End Session</span>
                      </button>
                    )}

                    {/* View Details Button */}
                    <button
                      onClick={() => onSelectReservationDetails(res)}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-bold transition-colors"
                    >
                      Details
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      {confirmActionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#0b0e14] border border-red-500/40 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-600/20 border border-red-500/50 flex items-center justify-center text-red-400">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white uppercase tracking-wider font-display">
                  Confirm Staff Action
                </h3>
                <p className="text-xs text-slate-400">Action: {confirmActionModal.action}</p>
              </div>
            </div>

            <div className="p-3 bg-[#121620] border border-slate-800 rounded-xl text-xs space-y-1 text-slate-300">
              <p><strong>Customer:</strong> {confirmActionModal.reservation.fullName || confirmActionModal.reservation.gamerTag}</p>
              <p><strong>Stations:</strong> {confirmActionModal.reservation.postNames?.join(', ')}</p>
              <p><strong>Scheduled:</strong> {new Date(confirmActionModal.reservation.startAt).toLocaleString()}</p>
              {confirmActionModal.action === 'START_SESSION' && (
                <p className="text-cyan-400 font-bold mt-2">
                  This will launch the live operational session timer right now.
                </p>
              )}
              {confirmActionModal.action === 'END_SESSION' && (
                <p className="text-amber-400 font-bold mt-2">
                  This will officially complete the session and finalize billing.
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmActionModal(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold uppercase tracking-wider"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteAction}
                className="px-5 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-[0_0_20px_rgba(239,68,68,0.4)]"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
