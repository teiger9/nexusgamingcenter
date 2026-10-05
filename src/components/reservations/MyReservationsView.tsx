import React, { useState, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Reservation, ReservationSettings } from '../../types';
import { cancelReservationByUser } from '../../services/reservationService';
import {
  Monitor,
  Gamepad2,
  Users,
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock3,
  DollarSign,
  Plus,
  RefreshCw,
  Info,
  Phone,
  Search,
  PhoneCall,
  User,
} from 'lucide-react';

interface MyReservationsViewProps {
  reservations: Reservation[];
  allReservations?: Reservation[];
  settings: ReservationSettings;
  onOpenBookingModal: () => void;
}

export const MyReservationsView: React.FC<MyReservationsViewProps> = ({
  reservations,
  allReservations = [],
  settings,
  onOpenBookingModal,
}) => {
  const { user, playerProfile, isAdmin } = useAuth();

  // Tab filter: 'upcoming' | 'active' | 'completed' | 'cancelled'
  const [activeTab, setActiveTab] = useState<'upcoming' | 'active' | 'completed' | 'cancelled'>('upcoming');

  // Guest lookup state
  const [guestPhoneLookup, setGuestPhoneLookup] = useState<string>(() => {
    try {
      return localStorage.getItem('nexus_guest_phone') || '';
    } catch {
      return '';
    }
  });
  const [searchFilter, setSearchFilter] = useState<string>('');

  // Cancellation State
  const [cancellingRes, setCancellingRes] = useState<Reservation | null>(null);
  const [cancelReason, setCancelReason] = useState<string>('');
  const [cancellingLoading, setCancellingLoading] = useState<boolean>(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const now = Date.now();

  // Identify relevant reservations for this visitor
  const effectiveReservations = useMemo(() => {
    if (user) {
      return reservations.filter((r) => r.userId === user.uid);
    }

    // Guest visitor: check localStorage for saved guest IDs and phone
    let storedIds: string[] = [];
    try {
      storedIds = JSON.parse(localStorage.getItem('nexus_guest_reservation_ids') || '[]');
    } catch {
      storedIds = [];
    }

    const cleanPhone = guestPhoneLookup.trim().replace(/[\s\-\(\)]/g, '');

    return allReservations.filter((r) => {
      if (storedIds.includes(r.id)) return true;
      if (cleanPhone) {
        const resPhone = (r.phoneNumber || r.phone || '').replace(/[\s\-\(\)]/g, '');
        if (resPhone && resPhone.includes(cleanPhone)) return true;
      }
      return false;
    });
  }, [user, reservations, allReservations, guestPhoneLookup]);

  // Categorize reservations
  const upcomingReservations = effectiveReservations.filter(
    (r) =>
      ['PENDING', 'PENDING_ADMIN_APPROVAL', 'CONFIRMED'].includes(r.status) &&
      r.startAt > now
  );

  const activeReservations = effectiveReservations.filter(
    (r) =>
      r.status === 'CHECKED_IN' ||
      (['PENDING', 'PENDING_ADMIN_APPROVAL', 'CONFIRMED'].includes(r.status) &&
        r.startAt <= now &&
        r.endAt >= now)
  );

  const completedReservations = effectiveReservations.filter(
    (r) => r.status === 'COMPLETED' || (['CONFIRMED', 'CHECKED_IN'].includes(r.status) && r.endAt < now)
  );

  const cancelledReservations = effectiveReservations.filter(
    (r) => ['CANCELLED', 'NO_SHOW'].includes(r.status)
  );

  const displayedList =
    activeTab === 'upcoming'
      ? upcomingReservations
      : activeTab === 'active'
      ? activeReservations
      : activeTab === 'completed'
      ? completedReservations
      : cancelledReservations;

  const handleConfirmCancel = async () => {
    if (!cancellingRes) return;
    setCancellingLoading(true);
    setCancelError(null);

    try {
      await cancelReservationByUser(
        cancellingRes.id,
        {
          uid: user ? user.uid : cancellingRes.userId,
          gamerTag: user ? playerProfile?.gamerTag : cancellingRes.fullName || 'Guest',
        },
        cancelReason
      );
      setCancellingRes(null);
      setCancelReason('');
    } catch (err: any) {
      console.error('Cancellation failed:', err);
      setCancelError(err.message || 'Failed to cancel reservation.');
    } finally {
      setCancellingLoading(false);
    }
  };

  const isEligibleToCancel = (res: Reservation) => {
    const deadlineMs = (settings.cancellationDeadlineHours || 2) * 3600 * 1000;
    return now <= res.startAt - deadlineMs;
  };

  return (
    <div className="space-y-6">
      {/* Guest Lookup Tool (If not logged in or looking up guest bookings) */}
      {!user && (
        <div className="p-5 rounded-2xl nexus-card-3d space-y-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-black font-display text-white uppercase tracking-wider flex items-center gap-2">
                <Search className="w-4 h-4 text-red-500" />
                <span>Guest Booking Status Lookup</span>
              </h3>
              <p className="text-xs text-neutral-400 mt-0.5">
                Booked as a guest? Enter your contact phone number to track your reservation status in real time.
              </p>
            </div>
            <div className="w-full sm:w-auto flex items-center gap-2">
              <input
                type="tel"
                value={guestPhoneLookup}
                onChange={(e) => {
                  setGuestPhoneLookup(e.target.value);
                  try {
                    localStorage.setItem('nexus_guest_phone', e.target.value);
                  } catch {}
                }}
                placeholder="Enter phone number..."
                className="bg-neutral-900 border border-white/10 focus:border-red-500 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none w-full sm:w-60"
              />
            </div>
          </div>
        </div>
      )}

      {/* Sub-Tabs Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-neutral-900 border border-white/10 flex-wrap">
          <button
            onClick={() => setActiveTab('upcoming')}
            className={`px-4 py-2 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
              activeTab === 'upcoming'
                ? 'bg-red-600 text-white shadow-sm'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            Upcoming ({upcomingReservations.length})
          </button>

          <button
            onClick={() => setActiveTab('active')}
            className={`px-4 py-2 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
              activeTab === 'active'
                ? 'bg-neutral-800 text-white border border-white/15 shadow-sm'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            Active Now ({activeReservations.length})
          </button>

          <button
            onClick={() => setActiveTab('completed')}
            className={`px-4 py-2 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
              activeTab === 'completed'
                ? 'bg-neutral-800 text-neutral-200 shadow-sm'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            Completed ({completedReservations.length})
          </button>

          <button
            onClick={() => setActiveTab('cancelled')}
            className={`px-4 py-2 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
              activeTab === 'cancelled'
                ? 'bg-red-950/40 text-red-300 border border-red-500/30'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            Cancelled ({cancelledReservations.length})
          </button>
        </div>

        <button
          onClick={onOpenBookingModal}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl nexus-btn-3d text-white font-bold uppercase text-xs tracking-wider transition-all shadow-md cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5 stroke-[3]" />
          <span>New Reservation</span>
        </button>
      </div>

      {/* Main Reservation Cards List */}
      {displayedList.length === 0 ? (
        <div className="p-12 text-center rounded-2xl nexus-card-3d space-y-4">
          <Clock className="w-12 h-12 text-neutral-600 mx-auto" />
          <div className="space-y-1">
            <h4 className="text-base font-bold text-white font-display uppercase tracking-wide">
              No {activeTab.replace('_', ' ')} reservations found
            </h4>
            <p className="text-xs text-neutral-400 max-w-sm mx-auto">
              {activeTab === 'upcoming'
                ? 'You have no scheduled upcoming reservations. Ready to book an 8–10 PC battle or PS5 console?'
                : 'No reservation history found for this category.'}
            </p>
          </div>
          <button
            onClick={onOpenBookingModal}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl nexus-btn-3d text-white font-bold uppercase text-xs tracking-wider transition-all font-mono cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>Book A Session</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {displayedList.map((res) => {
            const isGroup = res.reservationType === 'GROUP_10_PC' || res.postType === 'PC' || Boolean(res.requestedPcCount);
            const isPs5 = res.postType === 'PS5';
            const pcCount = res.requestedPcCount || res.postIds?.length || 8;
            const isPendingApproval = res.status === 'PENDING' || res.status === 'PENDING_ADMIN_APPROVAL';
            const customerPhone = res.phoneNumber || res.phone;

            return (
              <div
                key={res.id}
                className="p-5 rounded-2xl bg-neutral-900 border border-white/10 space-y-4 hover:border-red-600/40 transition-all relative overflow-hidden"
              >
                {/* Station & Status Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={`p-3 rounded-2xl border ${
                        isGroup
                          ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400'
                          : isPs5
                          ? 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                          : 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400'
                      }`}
                    >
                      {isGroup ? (
                        <Users className="w-5 h-5" />
                      ) : (
                        <Gamepad2 className="w-5 h-5" />
                      )}
                    </div>
                    <div>
                      {/* Rule 1: Customer must NOT see individual PC numbers (e.g. PC 1, PC 2) */}
                      <div className="font-black text-sm text-white uppercase tracking-wider">
                        {isGroup
                          ? `${pcCount} PCs Reserved (Group Arena)`
                          : isPs5
                          ? 'PS5 Pro Station'
                          : 'Gaming Station'}
                      </div>
                      <div className="text-xs text-slate-400 font-mono">
                        {res.gameName || (isGroup ? 'Esports Squad Arena' : 'PS5 Console Gaming')}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1">
                    <span
                      className={`text-[9px] px-2 py-0.5 rounded-full font-mono font-bold uppercase tracking-wider border ${
                        res.status === 'CONFIRMED'
                          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                          : res.status === 'CHECKED_IN'
                          ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40'
                          : isPendingApproval
                          ? 'bg-amber-500/20 text-amber-400 border-amber-500/40 animate-pulse'
                          : res.status === 'COMPLETED'
                          ? 'bg-slate-800 text-slate-300 border-slate-700'
                          : 'bg-red-500/20 text-red-400 border-red-500/40'
                      }`}
                    >
                      {isPendingApproval ? 'PENDING APPROVAL' : res.status}
                    </span>

                    <span
                      className={`text-[9px] px-2 py-0.5 rounded font-mono ${
                        res.paymentStatus === 'PAID'
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : res.paymentStatus === 'PARTIALLY_PAID'
                          ? 'bg-yellow-500/10 text-yellow-400'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {res.paymentStatus}
                    </span>
                  </div>
                </div>

                {/* Status Notice Banner */}
                {isPendingApproval && (
                  <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-mono flex items-start gap-2.5">
                    <PhoneCall className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-white block">Staff Verification in Progress</span>
                      <span className="text-[11px] text-slate-300">
                        Nexus management will call your phone at{' '}
                        <strong className="text-amber-300">{customerPhone}</strong> to verify attendance and officially confirm your reservation.
                      </span>
                    </div>
                  </div>
                )}

                {/* Date & Time Grid */}
                <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800/80 grid grid-cols-2 gap-3 text-xs font-mono">
                  <div>
                    <span className="text-slate-500 text-[10px] block">DATE</span>
                    <span className="text-slate-200 font-bold">
                      {new Date(res.startAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 text-[10px] block">SCHEDULE</span>
                    <span className="text-cyan-400 font-bold">
                      {new Date(res.startAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}{' '}
                      →{' '}
                      {new Date(res.endAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}{' '}
                      ({res.durationHours}h)
                    </span>
                  </div>
                </div>

                {/* Price & Actions Row */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
                  <div>
                    <span className="text-[10px] text-slate-400 block font-mono">TOTAL PRICE</span>
                    <span className="text-emerald-400 font-black text-sm font-mono">
                      {res.totalPrice} DA
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Cancellation Button */}
                    {['PENDING', 'PENDING_ADMIN_APPROVAL', 'CONFIRMED'].includes(res.status) && (
                      <button
                        type="button"
                        onClick={() => {
                          setCancellingRes(res);
                          setCancelReason('');
                          setCancelError(null);
                        }}
                        className="px-3 py-1.5 rounded-xl border border-red-500/30 hover:bg-red-500/20 text-red-400 font-mono text-xs font-bold transition-all"
                      >
                        Cancel Booking
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CANCELLATION MODAL */}
      {cancellingRes && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0f111a] border border-slate-800 rounded-3xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-400 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="space-y-1">
              <h3 className="text-base font-black text-white uppercase tracking-wider">
                Cancel Your Reservation?
              </h3>
              <p className="text-xs text-slate-400 font-mono">
                {cancellingRes.requestedPcCount || cancellingRes.postIds.length} PCs •{' '}
                {new Date(cancellingRes.startAt).toLocaleDateString()} at{' '}
                {new Date(cancellingRes.startAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>

            {cancelError && (
              <div className="p-3 rounded-xl bg-red-500/20 border border-red-500/40 text-red-200 text-xs font-mono">
                {cancelError}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Reason for cancellation (optional)
              </label>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="e.g. Squad member couldn't make it..."
                rows={2}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-xs text-white focus:border-cyan-400 focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 font-mono text-xs">
              <button
                type="button"
                onClick={() => setCancellingRes(null)}
                className="px-4 py-2 rounded-xl text-slate-400 hover:text-white font-bold"
              >
                Keep Booking
              </button>
              <button
                type="button"
                disabled={cancellingLoading}
                onClick={handleConfirmCancel}
                className="px-5 py-2.5 rounded-xl bg-red-500 hover:bg-red-400 text-white font-black uppercase tracking-wider transition-all disabled:opacity-50 shadow-lg shadow-red-500/20"
              >
                {cancellingLoading ? 'Cancelling...' : 'Confirm Cancellation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
