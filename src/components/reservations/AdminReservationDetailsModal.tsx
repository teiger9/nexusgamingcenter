import React, { useState, useEffect } from 'react';
import {
  doc,
  onSnapshot,
  collection,
  query,
  orderBy,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import {
  Reservation,
  GamingPost,
  PostBlock,
  Player,
} from '../../types';
import {
  getAvailablePcCount,
  adminConfirmReservation,
  adminRejectReservation,
  adminCancelReservation,
  DEFAULT_POSTS,
} from '../../services/reservationService';
import { isStaffUser } from '../../services/roleService';
import { markNotificationAsRead } from '../../services/notificationService';
import {
  X,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Phone,
  Calendar,
  Clock,
  Monitor,
  User,
  ShieldAlert,
  Loader2,
  Copy,
  Check,
  Ban,
  ArrowRight,
} from 'lucide-react';

interface AdminReservationDetailsModalProps {
  isOpen: boolean;
  reservationId: string | null;
  notificationId?: string | null;
  adminPlayer: Player | null;
  onClose: () => void;
  onSuccess?: () => void;
}

export const AdminReservationDetailsModal: React.FC<AdminReservationDetailsModalProps> = ({
  isOpen,
  reservationId,
  notificationId,
  adminPlayer,
  onClose,
  onSuccess,
}) => {
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [posts, setPosts] = useState<GamingPost[]>([]);
  const [allReservations, setAllReservations] = useState<Reservation[]>([]);
  const [postBlocks, setPostBlocks] = useState<PostBlock[]>([]);

  // Action states
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Rejection modal mode
  const [isRejecting, setIsRejecting] = useState<boolean>(false);
  const [rejectReason, setRejectReason] = useState<string>('');

  // Cancellation modal mode (for confirmed reservations)
  const [isCancelling, setIsCancelling] = useState<boolean>(false);
  const [cancelReason, setCancelReason] = useState<string>('');

  const [phoneCopied, setPhoneCopied] = useState<boolean>(false);

  // Automatically mark notification as read when opened
  useEffect(() => {
    if (isOpen && notificationId) {
      markNotificationAsRead(notificationId).catch(console.error);
    }
  }, [isOpen, notificationId]);

  // Real-time listener for the specific reservation
  useEffect(() => {
    if (!isOpen || !reservationId) {
      setReservation(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    setActionError(null);
    setActionSuccess(null);
    setIsRejecting(false);
    setIsCancelling(false);

    const docRef = doc(db, 'reservations', reservationId);
    const unsubscribe = onSnapshot(
      docRef,
      (docSnap) => {
        setLoading(false);
        if (docSnap.exists()) {
          setReservation({ id: docSnap.id, ...(docSnap.data() as Reservation) });
        } else {
          setError('Reservation request was not found or has been removed.');
          setReservation(null);
        }
      },
      (err) => {
        console.error('Error fetching reservation details:', err);
        setError('Failed to load reservation details.');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [isOpen, reservationId]);

  // Listen to gaming posts, existing reservations, and blocks to provide authoritative live availability
  useEffect(() => {
    if (!isOpen) return;

    const unsubPosts = onSnapshot(
      query(collection(db, 'gamingPosts'), orderBy('order', 'asc')),
      (snap) => {
        if (!snap.empty) {
          setPosts(snap.docs.map((d) => ({ id: d.id, ...(d.data() as GamingPost) })));
        } else {
          setPosts(DEFAULT_POSTS);
        }
      },
      (err) => {
        console.warn('Error fetching gaming posts in AdminReservationDetailsModal:', err);
      }
    );

    const unsubRes = onSnapshot(
      collection(db, 'reservations'),
      (snap) => {
        setAllReservations(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Reservation) })));
      },
      (err) => {
        console.warn('Error fetching reservations in AdminReservationDetailsModal:', err);
      }
    );

    const unsubBlocks = onSnapshot(
      collection(db, 'postBlocks'),
      (snap) => {
        setPostBlocks(snap.docs.map((d) => ({ id: d.id, ...(d.data() as PostBlock) })));
      },
      (err) => {
        console.warn('Error fetching post blocks in AdminReservationDetailsModal:', err);
      }
    );

    return () => {
      unsubPosts();
      unsubRes();
      unsubBlocks();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const isAuthorizedStaff = Boolean(adminPlayer && isStaffUser(adminPlayer.email, adminPlayer.role, adminPlayer.uid));

  if (!isAuthorizedStaff) {
    return (
      <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="bg-[#0f111a] border border-red-500/30 rounded-3xl w-full max-w-md p-6 text-center space-y-4 shadow-2xl">
          <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-400 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h3 className="text-base font-black text-white uppercase tracking-wider font-display">
            Unauthorized Access
          </h3>
          <p className="text-xs text-red-400 font-mono">
            Unauthorized access: Staff credentials required.
          </p>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold font-mono transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  // Calculate live PC capacity for this reservation window
  const activePosts = posts.length > 0 ? posts : DEFAULT_POSTS;
  const requestedPcCount = reservation?.requestedPcCount ||
    (reservation?.reservationType === 'GROUP_10_PC' ? 10 : (reservation?.postIds?.length || 8));

  const pcAvailability = reservation
    ? getAvailablePcCount(
        reservation.startAt,
        reservation.endAt,
        activePosts,
        allReservations,
        postBlocks,
        reservation.id
      )
    : null;

  const isPending =
    reservation?.status === 'PENDING_ADMIN_APPROVAL' ||
    reservation?.status === 'PENDING';

  const isConfirmed = reservation?.status === 'CONFIRMED';
  const isRejected = reservation?.status === 'REJECTED';
  const isCancelled = reservation?.status === 'CANCELLED';

  const hasCapacity = (pcAvailability?.availableCount || 0) >= requestedPcCount;

  // Handler: Accept reservation
  const handleAccept = async () => {
    if (!reservation || !adminPlayer) return;
    setActionLoading(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      await adminConfirmReservation(reservation.id, adminPlayer);
      setActionSuccess(`Reservation successfully confirmed! ${requestedPcCount} PC slots are now marked TAKEN.`);
      if (onSuccess) onSuccess();
    } catch (err: any) {
      console.error('Accept reservation failed:', err);
      setActionError(err.message || 'Failed to accept reservation.');
    } finally {
      setActionLoading(false);
    }
  };

  // Handler: Reject reservation
  const handleReject = async () => {
    if (!reservation || !adminPlayer) return;
    if (!rejectReason.trim()) {
      setActionError('Please enter a reason for rejecting this reservation.');
      return;
    }

    setActionLoading(true);
    setActionError(null);

    try {
      await adminRejectReservation(reservation.id, adminPlayer, rejectReason.trim());
      setActionSuccess('Reservation request declined.');
      setIsRejecting(false);
      if (onSuccess) onSuccess();
    } catch (err: any) {
      console.error('Reject reservation failed:', err);
      setActionError(err.message || 'Failed to reject reservation.');
    } finally {
      setActionLoading(false);
    }
  };

  // Handler: Cancel confirmed reservation
  const handleCancelConfirmed = async () => {
    if (!reservation || !adminPlayer) return;
    if (!cancelReason.trim()) {
      setActionError('Please specify a reason for cancellation.');
      return;
    }

    setActionLoading(true);
    setActionError(null);

    try {
      await adminCancelReservation(reservation.id, adminPlayer, cancelReason.trim());
      setActionSuccess('Reservation cancelled and PC slots released back to AVAILABLE.');
      setIsCancelling(false);
      if (onSuccess) onSuccess();
    } catch (err: any) {
      console.error('Cancel reservation failed:', err);
      setActionError(err.message || 'Failed to cancel reservation.');
    } finally {
      setActionLoading(false);
    }
  };

  const copyPhoneNumber = (phone: string) => {
    navigator.clipboard.writeText(phone);
    setPhoneCopied(true);
    setTimeout(() => setPhoneCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div
        id="admin-reservation-details-modal"
        className="relative w-full max-w-2xl my-8 bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl shadow-red-950/20 overflow-hidden text-slate-100"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400">
              <Monitor className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold tracking-wide text-white">
                  Reservation Request
                </h2>
                {reservation && (
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-mono font-bold tracking-wider uppercase ${
                      isConfirmed
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : isPending
                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 animate-pulse'
                        : isRejected
                        ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                        : 'bg-slate-700/50 text-slate-300 border border-slate-600/30'
                    }`}
                  >
                    {reservation.status.replace(/_/g, ' ')}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                {reservation?.id ? `ID: ${reservation.id.slice(0, 12)}...` : 'Staff Review Panel'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6">
          {loading && (
            <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin text-red-500" />
              <p className="text-sm">Fetching live reservation details from Firebase...</p>
            </div>
          )}

          {error && (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold">Unable to Load Request</p>
                <p className="text-xs text-rose-400/80 mt-1">{error}</p>
              </div>
            </div>
          )}

          {actionSuccess && (
            <div className="p-4 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400 mt-0.5" />
              <div>
                <p className="text-sm font-semibold">{actionSuccess}</p>
              </div>
            </div>
          )}

          {actionError && (
            <div className="p-4 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 shrink-0 text-rose-400 mt-0.5" />
              <div>
                <p className="text-sm font-semibold">Action Failed</p>
                <p className="text-xs text-rose-300/80 mt-1">{actionError}</p>
              </div>
            </div>
          )}

          {reservation && (
            <>
              {/* Customer Contact & Phone Card */}
              <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
                    <User className="w-4 h-4 text-red-400" />
                    <span>Customer Information</span>
                  </div>
                  <span className="text-[11px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                    {reservation.isGuest ? 'Guest Customer' : 'Registered Member'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                  <div>
                    <p className="text-xs text-slate-400">Full Name</p>
                    <p className="text-base font-bold text-white">
                      {reservation.fullName || reservation.gamerTag}
                    </p>
                    {reservation.fullName && reservation.gamerTag !== reservation.fullName && (
                      <p className="text-xs text-slate-400 font-mono">@{reservation.gamerTag}</p>
                    )}
                  </div>

                  <div>
                    <p className="text-xs text-slate-400">Contact Phone Number</p>
                    <div className="flex items-center gap-2 mt-1">
                      <a
                        href={`tel:${reservation.phoneNumber}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-sm font-mono font-bold transition"
                        title="Click to call customer directly"
                      >
                        <Phone className="w-3.5 h-3.5" />
                        <span>{reservation.phoneNumber}</span>
                      </a>
                      <button
                        onClick={() => copyPhoneNumber(reservation.phoneNumber)}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                        title="Copy phone number"
                      >
                        {phoneCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Reservation Specifics: PCs, Date, Time */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-xl bg-slate-950/40 border border-slate-800">
                  <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
                    <Monitor className="w-3.5 h-3.5 text-red-400" />
                    <span>Requested PCs</span>
                  </div>
                  <p className="text-lg font-black text-white font-mono">
                    {requestedPcCount} PCs
                  </p>
                  <p className="text-[11px] text-slate-400">Group Arena Booking</p>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-950/40 border border-slate-800">
                  <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
                    <Calendar className="w-3.5 h-3.5 text-amber-400" />
                    <span>Date</span>
                  </div>
                  <p className="text-sm font-bold text-white">
                    {new Date(reservation.startAt).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      weekday: 'short',
                    })}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {new Date(reservation.startAt).toLocaleDateString(undefined, { year: 'numeric' })}
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-950/40 border border-slate-800">
                  <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
                    <Clock className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Time & Length</span>
                  </div>
                  <p className="text-sm font-bold text-white font-mono">
                    {new Date(reservation.startAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {reservation.durationHours} hr{reservation.durationHours > 1 ? 's' : ''} (until{' '}
                    {new Date(reservation.endAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-950/40 border border-slate-800">
                  <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Total Price</span>
                  </div>
                  <p className="text-lg font-black text-emerald-400 font-mono">
                    {reservation.totalPrice} DA
                  </p>
                  <p className="text-[11px] text-slate-400">{reservation.paymentStatus}</p>
                </div>
              </div>

              {/* Fresh Availability Check & Internal Allocation */}
              <div
                className={`p-4 rounded-xl border transition-all ${
                  isConfirmed
                    ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300'
                    : hasCapacity
                    ? 'bg-slate-950/50 border-slate-800'
                    : 'bg-rose-950/20 border-rose-500/40 text-rose-300'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-2">
                    {isConfirmed ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <span className="text-emerald-400">Allocated PC Slots (TAKEN)</span>
                      </>
                    ) : hasCapacity ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <span className="text-slate-300">Live Firebase Availability Check</span>
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="w-4 h-4 text-rose-400" />
                        <span className="text-rose-400">Overbooking Capacity Conflict</span>
                      </>
                    )}
                  </span>

                  {pcAvailability && !isConfirmed && (
                    <span
                      className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                        hasCapacity ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/20 text-rose-300'
                      }`}
                    >
                      {pcAvailability.availableCount} of {pcAvailability.totalActivePCs} PCs Available
                    </span>
                  )}
                </div>

                {isConfirmed ? (
                  <div className="space-y-2">
                    <p className="text-xs text-slate-300">
                      Approved by <strong className="text-white">{reservation.approvedBy || reservation.confirmedBy}</strong> on{' '}
                      {reservation.approvedAt ? new Date(reservation.approvedAt).toLocaleString() : 'Confirmation'}
                    </p>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {reservation.postNames.map((name, i) => (
                        <span
                          key={i}
                          className="px-2.5 py-1 rounded-md bg-emerald-500/20 border border-emerald-500/40 text-xs font-mono font-bold text-emerald-300"
                        >
                          {name} (TAKEN)
                        </span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-slate-400">
                      {hasCapacity
                        ? `Authoritative check: Sufficient active PC capacity is available for this slot. Pressing ACCEPT will allocate ${requestedPcCount} PCs internally and immediately mark them TAKEN.`
                        : `Only ${pcAvailability?.availableCount || 0} PCs are currently free during this timeframe. Confirming requires ${requestedPcCount} PCs.`}
                    </p>

                    {pcAvailability && hasCapacity && (
                      <div className="pt-2">
                        <p className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-1.5">
                          Internal Allocation Plan (First {requestedPcCount} Available Slots):
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {pcAvailability.availablePosts.slice(0, requestedPcCount).map((p) => (
                            <span
                              key={p.id}
                              className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-xs font-mono text-slate-300"
                            >
                              {p.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Reject Reason Form */}
              {isRejecting && (
                <div className="p-4 rounded-xl bg-rose-950/20 border border-rose-500/30 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-rose-400">
                    <Ban className="w-4 h-4" />
                    <span>Decline Reservation Request</span>
                  </div>
                  <textarea
                    rows={2}
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Provide a reason for the customer (e.g. Schedule fully booked, customer requested rescheduling)..."
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm text-white focus:outline-none focus:border-rose-500"
                  />
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setIsRejecting(false)}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-400 hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={actionLoading}
                      onClick={handleReject}
                      className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow transition"
                    >
                      {actionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                      Confirm Decline
                    </button>
                  </div>
                </div>
              )}

              {/* Cancel Confirmed Reservation Form */}
              {isCancelling && (
                <div className="p-4 rounded-xl bg-amber-950/20 border border-amber-500/30 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-400">
                    <AlertTriangle className="w-4 h-4" />
                    <span>Cancel Confirmed Booking & Release PC Slots</span>
                  </div>
                  <textarea
                    rows={2}
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    placeholder="Reason for cancellation (e.g. Customer cancelled via phone, No-show)..."
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm text-white focus:outline-none focus:border-amber-500"
                  />
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setIsCancelling(false)}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-400 hover:text-white"
                    >
                      Keep Reservation
                    </button>
                    <button
                      type="button"
                      disabled={actionLoading}
                      onClick={handleCancelConfirmed}
                      className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold shadow transition"
                    >
                      {actionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />}
                      Confirm Cancellation
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Actions */}
        {reservation && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-t border-slate-800 bg-slate-950/70">
            <div className="flex items-center gap-2">
              <a
                href={`tel:${reservation.phoneNumber}`}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition"
              >
                <Phone className="w-3.5 h-3.5 text-emerald-400" />
                <span>Call Customer</span>
              </a>
            </div>

            <div className="flex items-center gap-2">
              {isPending && !isRejecting && (
                <>
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => setIsRejecting(true)}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-rose-500/40 text-rose-400 hover:bg-rose-500/10 text-xs font-bold tracking-wider uppercase transition disabled:opacity-50"
                  >
                    <XCircle className="w-4 h-4" />
                    <span>Reject Request</span>
                  </button>

                  <button
                    type="button"
                    disabled={actionLoading || !hasCapacity}
                    onClick={handleAccept}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-black tracking-wider uppercase shadow-lg shadow-emerald-950/40 transition"
                  >
                    {actionLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Verifying & Confirming...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Accept Reservation</span>
                      </>
                    )}
                  </button>
                </>
              )}

              {isConfirmed && !isCancelling && (
                <button
                  type="button"
                  onClick={() => setIsCancelling(true)}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-amber-500/40 text-amber-400 hover:bg-amber-500/10 text-xs font-bold tracking-wider uppercase transition"
                >
                  <Ban className="w-3.5 h-3.5" />
                  <span>Cancel Booking & Free PCs</span>
                </button>
              )}

              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
