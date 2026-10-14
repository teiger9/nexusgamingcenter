import React, { useState, useMemo, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Reservation, ReservationSettings } from '../../types';
import { cancelReservationByUser } from '../../services/reservationService';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
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
  onOpenAuth?: (mode?: 'login' | 'register') => void;
}

export const MyReservationsView: React.FC<MyReservationsViewProps> = ({
  reservations,
  allReservations = [],
  settings,
  onOpenBookingModal,
  onOpenAuth,
}) => {
  const { user, playerProfile, isAdmin, isSuperAdmin, isStaff, role } = useAuth();

  // Authorized Admin, Super Admin, and Staff can view reservation prices.
  // Normal users (PLAYER role and logged-out visitors) must NOT see prices.
  const canViewPrice = Boolean(
    user && (isAdmin || isSuperAdmin || isStaff || role === 'ADMIN' || role === 'SUPER_ADMIN' || role === 'STAFF')
  );

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
  const [guestServerReservations, setGuestServerReservations] = useState<Reservation[]>([]);
  const [searchFilter, setSearchFilter] = useState<string>('');

  // Cancellation State
  const [cancellingRes, setCancellingRes] = useState<Reservation | null>(null);
  const [cancelReason, setCancelReason] = useState<string>('');
  const [cancellingLoading, setCancellingLoading] = useState<boolean>(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const now = Date.now();

  // Guest Server Lookup Effect
  useEffect(() => {
    if (user) return;
    let storedIds: string[] = [];
    try {
      storedIds = JSON.parse(localStorage.getItem('nexus_guest_reservation_ids') || '[]');
    } catch {
      storedIds = [];
    }
    const cleanPhone = guestPhoneLookup.trim();
    if (!cleanPhone && storedIds.length === 0) {
      setGuestServerReservations([]);
      return;
    }

    let isMounted = true;

    const loadGuestBookings = async () => {
      const directDocs: Reservation[] = [];

      // 1. Authoritative direct Firestore retrieval for visitor's stored reservation IDs
      // Permitted by firestore.rules under resource.data.isGuest == true
      for (const id of storedIds.slice(0, 15)) {
        try {
          const snap = await getDoc(doc(db, 'reservations', id));
          if (snap.exists()) {
            directDocs.push({ id: snap.id, ...(snap.data() as Reservation) });
          }
        } catch {
          // Ignore individual fetch errors
        }
      }

      if (!isMounted) return;
      setGuestServerReservations(directDocs);

      // 2. Optional server endpoint lookup if available, strictly checking content-type
      const params = new URLSearchParams();
      if (cleanPhone) params.append('phone', cleanPhone);
      if (storedIds.length > 0) params.append('ids', storedIds.join(','));

      try {
        const resp = await fetch(`/api/reservations/guest-lookup?${params.toString()}`);
        const contentType = resp.headers.get('content-type') || '';
        if (resp.ok && contentType.includes('application/json')) {
          const data = await resp.json();
          if (isMounted && data.success && Array.isArray(data.reservations)) {
            const map = new Map<string, Reservation>();
            directDocs.forEach((r) => map.set(r.id, r));
            data.reservations.forEach((r: Reservation) => map.set(r.id, r));
            setGuestServerReservations(Array.from(map.values()));
          }
        }
      } catch (err) {
        // Safe catch for static host deployments
      }
    };

    loadGuestBookings();

    return () => {
      isMounted = false;
    };
  }, [user, guestPhoneLookup]);

  // Identify relevant reservations for this visitor
  const effectiveReservations = useMemo(() => {
    if (user) {
      return reservations.filter((r) => r.userId === user.uid);
    }

    // Guest visitor: combine localStorage matches and server lookup
    let storedIds: string[] = [];
    try {
      storedIds = JSON.parse(localStorage.getItem('nexus_guest_reservation_ids') || '[]');
    } catch {
      storedIds = [];
    }

    const cleanPhone = guestPhoneLookup.trim().replace(/[\s\-\(\)]/g, '');

    const map = new Map<string, Reservation>();
    for (const r of guestServerReservations) {
      map.set(r.id, r);
    }

    for (const r of allReservations) {
      if (storedIds.includes(r.id)) {
        if (!map.has(r.id)) map.set(r.id, r);
      } else if (cleanPhone) {
        const resPhone = (r.phoneNumber || r.phone || '').replace(/[\s\-\(\)]/g, '');
        if (resPhone && resPhone.includes(cleanPhone)) {
          if (!map.has(r.id)) map.set(r.id, r);
        }
      }
    }

    return Array.from(map.values()).sort((a, b) => b.startAt - a.startAt);
  }, [user, reservations, allReservations, guestServerReservations, guestPhoneLookup]);

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

  const isEligibleToCancel = (res: Reservation) => {
    // Only signed-in users who own the reservation (or admins) are eligible to cancel
    if (!user) return false;
    if (res.userId !== user.uid && !isAdmin) return false;

    const currentTime = Date.now();
    if (currentTime >= res.startAt) return false;

    if (res.status === 'CONFIRMED') {
      const isWithinCreationGracePeriod = Boolean(
        res.createdAt && currentTime - res.createdAt <= 15 * 60 * 1000 && currentTime < res.startAt
      );
      if (isWithinCreationGracePeriod) return true;

      const deadlineMs = (settings.cancellationDeadlineHours || 2) * 3600 * 1000;
      return currentTime <= res.startAt - deadlineMs;
    }

    return currentTime < res.startAt;
  };

  const handleConfirmCancel = async () => {
    if (!cancellingRes) return;

    if (!user) {
      setCancelError('You must be signed in to cancel a reservation.');
      return;
    }

    if (cancellingRes.userId !== user.uid && !isAdmin) {
      setCancelError('You are not authorized to cancel this reservation.');
      return;
    }

    if (!isEligibleToCancel(cancellingRes)) {
      const hours = settings.cancellationDeadlineHours || 2;
      setCancelError(
        `Cancellations must be requested at least ${hours} hour(s) before the scheduled start time. Please contact Nexus staff directly.`
      );
      return;
    }

    setCancellingLoading(true);
    setCancelError(null);

    try {
      await cancelReservationByUser(
        cancellingRes.id,
        {
          uid: user.uid,
          gamerTag: playerProfile?.gamerTag || user.displayName || 'Player',
        },
        cancelReason
      );
      setCancellingRes(null);
      setCancelReason('');
    } catch (err: any) {
      console.warn('Reservation cancellation notice:', err?.message || err);
      setCancelError(err?.message || 'Failed to cancel reservation.');
    } finally {
      setCancellingLoading(false);
    }
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
                ? 'You have no scheduled upcoming reservations. Ready to book an 8–10 PC battle arena?'
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
                    <div className="p-3 rounded-2xl border bg-cyan-500/10 border-cyan-500/30 text-cyan-400">
                      {isGroup ? (
                        <Users className="w-5 h-5" />
                      ) : (
                        <Monitor className="w-5 h-5" />
                      )}
                    </div>
                    <div>
                      {/* Rule 1: Customer must NOT see individual PC numbers (e.g. PC 1, PC 2) */}
                      <div className="font-black text-sm text-white uppercase tracking-wider">
                        {isGroup
                          ? `${pcCount} PCs Reserved (Group Arena)`
                          : 'PC Gaming Station'}
                      </div>
                      <div className="text-xs text-slate-400 font-mono">
                        {res.gameName || 'Esports Squad Arena'}
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
                <div
                  className={`flex items-center ${
                    canViewPrice ? 'justify-between' : 'justify-end'
                  } pt-2 border-t border-slate-800/80`}
                >
                  {canViewPrice && (
                    <div>
                      <span className="text-[10px] text-slate-400 block font-mono">TOTAL PRICE</span>
                      <span className="text-emerald-400 font-black text-sm font-mono">
                        {res.totalPrice} DA
                      </span>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    {/* Cancellation Action: strictly hidden for logged-out visitors; visible only to authorized signed-in reservation owners or admins */}
                    {Boolean(user) && (res.userId === user?.uid || isAdmin) && ['PENDING', 'PENDING_ADMIN_APPROVAL', 'CONFIRMED'].includes(res.status) && (
                      isEligibleToCancel(res) ? (
                        <button
                          type="button"
                          onClick={() => {
                            setCancellingRes(res);
                            setCancelReason('');
                            setCancelError(null);
                          }}
                          className="px-3 py-1.5 rounded-xl border border-red-500/30 hover:bg-red-500/20 text-red-400 font-mono text-xs font-bold transition-all cursor-pointer"
                          title="Cancel Reservation"
                          aria-label="Cancel Reservation"
                        >
                          Cancel Reservation
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setCancellingRes(res);
                            setCancelReason('');
                            setCancelError(null);
                          }}
                          className="px-3 py-1.5 rounded-xl border border-amber-500/30 hover:bg-amber-500/10 text-amber-400 font-mono text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                        >
                          <PhoneCall className="w-3 h-3" />
                          <span>Staff Assistance</span>
                        </button>
                      )
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CANCELLATION MODAL */}
      {cancellingRes && Boolean(user) && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0f111a] border border-slate-800 rounded-3xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-400 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="space-y-1">
              <h3 className="text-base font-black text-white uppercase tracking-wider">
                {isEligibleToCancel(cancellingRes)
                  ? 'Cancel Your Reservation?'
                  : 'Staff Assistance Required'}
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

            {isEligibleToCancel(cancellingRes) ? (
              <>
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
                    className="px-4 py-2 rounded-xl text-slate-400 hover:text-white font-bold cursor-pointer"
                  >
                    Keep Booking
                  </button>
                  <button
                    type="button"
                    disabled={cancellingLoading}
                    onClick={handleConfirmCancel}
                    className="px-5 py-2.5 rounded-xl bg-red-500 hover:bg-red-400 text-white font-black uppercase tracking-wider transition-all disabled:opacity-50 shadow-lg shadow-red-500/20 cursor-pointer"
                  >
                    {cancellingLoading ? 'Cancelling...' : 'Confirm Cancellation'}
                  </button>
                </div>
              </>
            ) : (
              <div className="space-y-4">
                <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs font-mono space-y-2">
                  <div className="flex items-center gap-2 font-bold text-amber-300">
                    <PhoneCall className="w-4 h-4 shrink-0" />
                    <span>Cancellation Policy Notice</span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-amber-200/90">
                    Cancellations must be requested at least {settings.cancellationDeadlineHours || 2} hour(s) before the scheduled start time. Because your session starts soon or is already active, please speak with Nexus staff directly at the front desk or call customer support to request any changes.
                  </p>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 font-mono text-xs">
                  <button
                    type="button"
                    onClick={() => setCancellingRes(null)}
                    className="px-5 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white font-bold uppercase tracking-wider transition-all cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
