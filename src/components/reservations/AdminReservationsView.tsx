import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  GamingPost,
  Reservation,
  PostBlock,
  ReservationSettings,
  ReservationStatus,
  PaymentStatus,
  PaymentMethod,
  GamingPostType,
  GamingPostStatus,
  PostBlockReason,
} from '../../types';
import {
  adminConfirmReservation,
  adminRejectReservation,
  adminCancelReservation,
  adminCheckInReservation,
  adminMarkNoShow,
  adminCompleteReservation,
  adminUpdateReservation,
  adminUpdatePaymentStatus,
  addGamingPost,
  updateGamingPost,
  deleteGamingPost,
  addPostBlock,
  deletePostBlock,
  updateReservationSettings,
  checkAndExpirePendingReservations,
  subscribeToGamingPosts,
  subscribeToReservations,
  subscribeToPostBlocks,
  subscribeToReservationSettings,
  DEFAULT_POSTS,
  DEFAULT_SETTINGS,
} from '../../services/reservationService';
import {
  Calendar,
  Monitor,
  Gamepad2,
  Users,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  Clock,
  DollarSign,
  Edit3,
  Trash2,
  Plus,
  AlertTriangle,
  Settings,
  ShieldAlert,
  ChevronDown,
  UserCheck,
  Ban,
  Phone,
  Mail,
  FileText,
  Lock,
  ArrowRight,
  Clock3,
  Eye,
} from 'lucide-react';
import { AdminReservationDetailsModal } from './AdminReservationDetailsModal';

interface AdminReservationsViewProps {
  posts?: GamingPost[];
  reservations?: Reservation[];
  postBlocks?: PostBlock[];
  settings?: ReservationSettings;
}

export const AdminReservationsView: React.FC<AdminReservationsViewProps> = ({
  posts: propPosts,
  reservations: propReservations,
  postBlocks: propPostBlocks,
  settings: propSettings,
}) => {
  const { user, playerProfile, isAdmin, isStaff } = useAuth();

  // Internal data state if not passed from parent
  const [internalPosts, setInternalPosts] = useState<GamingPost[]>(propPosts || DEFAULT_POSTS);
  const [internalReservations, setInternalReservations] = useState<Reservation[]>(propReservations || []);
  const [internalPostBlocks, setInternalPostBlocks] = useState<PostBlock[]>(propPostBlocks || []);
  const [internalSettings, setInternalSettings] = useState<ReservationSettings>(propSettings || DEFAULT_SETTINGS);

  useEffect(() => {
    if (propPosts) setInternalPosts(propPosts);
    if (propReservations) setInternalReservations(propReservations);
    if (propPostBlocks) setInternalPostBlocks(propPostBlocks);
    if (propSettings) setInternalSettings(propSettings);
  }, [propPosts, propReservations, propPostBlocks, propSettings]);

  useEffect(() => {
    if (!propPosts) {
      const unsub = subscribeToGamingPosts(setInternalPosts);
      return () => unsub();
    }
  }, [propPosts]);

  useEffect(() => {
    if (!propReservations) {
      const unsub = subscribeToReservations(setInternalReservations);
      return () => unsub();
    }
  }, [propReservations]);

  useEffect(() => {
    if (!propPostBlocks) {
      const unsub = subscribeToPostBlocks(setInternalPostBlocks);
      return () => unsub();
    }
  }, [propPostBlocks]);

  useEffect(() => {
    if (!propSettings) {
      const unsub = subscribeToReservationSettings(setInternalSettings);
      return () => unsub();
    }
  }, [propSettings]);

  const posts = propPosts || internalPosts;
  const reservations = propReservations || internalReservations;
  const postBlocks = propPostBlocks || internalPostBlocks;
  const settings = propSettings || internalSettings;

  // Active Admin Sub-Tab: 'pending' | 'confirmed' | 'today' | 'active_now' | 'cancelled' | 'expired' | 'bookings' | 'equipment' | 'settings' | 'blocks'
  const [adminTab, setAdminTab] = useState<
    'pending' | 'confirmed' | 'today' | 'active_now' | 'cancelled' | 'expired' | 'bookings' | 'equipment' | 'settings' | 'blocks'
  >('pending');

  // Action status messages
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);
  const [actionErrorMsg, setActionErrorMsg] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  // Two-Step Confirmation Modal State
  const [confirmingResModal, setConfirmingResModal] = useState<Reservation | null>(null);
  const [selectedDetailResId, setSelectedDetailResId] = useState<string | null>(null);

  // Periodically check and expire stale pending reservations
  useEffect(() => {
    checkAndExpirePendingReservations(reservations);
    const interval = setInterval(() => {
      checkAndExpirePendingReservations(reservations);
    }, 60000);
    return () => clearInterval(interval);
  }, [reservations]);

  // Search & Filter for Bookings
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [paymentFilter, setPaymentFilter] = useState<string>('ALL');

  // Staff Confirm Handler with validation feedback
  const handleStaffConfirm = async (resId: string) => {
    setConfirmingId(resId);
    setActionErrorMsg(null);
    setActionSuccessMsg(null);
    try {
      await adminConfirmReservation(resId, playerProfile);
      setActionSuccessMsg('Reservation confirmed successfully! Player has been notified.');
      setTimeout(() => setActionSuccessMsg(null), 5000);
    } catch (err: any) {
      console.error('Staff confirmation failed:', err);
      setActionErrorMsg(err.message || 'Failed to confirm reservation. Time slot may be unavailable or in the past.');
      setTimeout(() => setActionErrorMsg(null), 8000);
    } finally {
      setConfirmingId(null);
    }
  };

  // Action / Edit Modal State
  const [editingRes, setEditingRes] = useState<Reservation | null>(null);
  const [editDate, setEditDate] = useState<string>('');
  const [editStartTime, setEditStartTime] = useState<string>('');
  const [editDuration, setEditDuration] = useState<number>(1);
  const [editPostIds, setEditPostIds] = useState<string[]>([]);
  const [editStatus, setEditStatus] = useState<ReservationStatus>('CONFIRMED');
  const [editPriceOverride, setEditPriceOverride] = useState<string>('');
  const [editPriceReason, setEditPriceReason] = useState<string>('');
  const [editNotes, setEditNotes] = useState<string>('');
  const [editPhone, setEditPhone] = useState<string>('');
  const [editLoading, setEditLoading] = useState<boolean>(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Payment Modal State
  const [payingRes, setPayingRes] = useState<Reservation | null>(null);
  const [payAmount, setPayAmount] = useState<number>(0);
  const [payStatus, setPayStatus] = useState<PaymentStatus>('PAID');
  const [payMethod, setPayMethod] = useState<PaymentMethod>('CASH');
  const [payLoading, setPayLoading] = useState<boolean>(false);

  // Rejection / Cancellation Modal State
  const [cancellingRes, setCancellingRes] = useState<Reservation | null>(null);
  const [cancelActionType, setCancelActionType] = useState<'reject' | 'cancel' | 'noshow'>('cancel');
  const [cancelReasonText, setCancelReasonText] = useState<string>('');
  const [cancelLoading, setCancelLoading] = useState<boolean>(false);

  // Add / Edit Post State
  const [isPostModalOpen, setIsPostModalOpen] = useState<boolean>(false);
  const [editingPost, setEditingPost] = useState<GamingPost | null>(null);
  const [postName, setPostName] = useState<string>('');
  const [postType, setPostType] = useState<GamingPostType>('PC');
  const [postStatus, setPostStatus] = useState<GamingPostStatus>('ACTIVE');
  const [postOrder, setPostOrder] = useState<number>(1);
  const [postSpecs, setPostSpecs] = useState<string>('');
  const [postLoading, setPostLoading] = useState<boolean>(false);

  // Maintenance Block Modal State
  const [isBlockModalOpen, setIsBlockModalOpen] = useState<boolean>(false);
  const [blockPostId, setBlockPostId] = useState<string>('');
  const [blockDate, setBlockDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [blockStartTime, setBlockStartTime] = useState<string>('12:00');
  const [blockEndTime, setBlockEndTime] = useState<string>('18:00');
  const [blockReason, setBlockReason] = useState<PostBlockReason>('MAINTENANCE');
  const [blockDesc, setBlockDesc] = useState<string>('');
  const [blockLoading, setBlockLoading] = useState<boolean>(false);

  // Settings State Form
  const [formSettings, setFormSettings] = useState<ReservationSettings>(settings);
  const [settingsSaving, setSettingsSaving] = useState<boolean>(false);
  const [settingsSavedSuccess, setSettingsSavedSuccess] = useState<boolean>(false);

  if ((!isAdmin && !isStaff) || !playerProfile) {
    return (
      <div className="p-8 text-center text-red-400 font-mono text-xs">
        Unauthorized access: Staff credentials required.
      </div>
    );
  }

  // Helper to identify pending reservation requests (both PENDING and PENDING_ADMIN_APPROVAL)
  const isPending = (r: Reservation) => r.status === 'PENDING' || r.status === 'PENDING_ADMIN_APPROVAL';

  // Boundaries for today's reservations
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  // Filter Bookings
  const filteredReservations = reservations.filter((r) => {
    // Specific tab filters
    if (adminTab === 'confirmed' && r.status !== 'CONFIRMED') return false;
    if (adminTab === 'today') {
      const isToday = r.startAt >= todayStart.getTime() && r.startAt <= todayEnd.getTime();
      if (!isToday) return false;
    }
    if (adminTab === 'active_now') {
      const isActive = r.status === 'CHECKED_IN' || (r.status === 'CONFIRMED' && r.startAt <= Date.now() && r.endAt >= Date.now());
      if (!isActive) return false;
    }
    if (adminTab === 'cancelled' && !['CANCELLED', 'NO_SHOW'].includes(r.status)) return false;
    if (adminTab === 'expired') {
      const isExpired = r.status === 'CANCELLED' && (r.cancellationReason?.toLowerCase().includes('expired') || r.cancellationReason?.toLowerCase().includes('timeout'));
      if (!isExpired) return false;
    }

    if (adminTab === 'bookings' && statusFilter !== 'ALL') {
      if (statusFilter === 'PENDING') {
        if (!isPending(r)) return false;
      } else if (r.status !== statusFilter) {
        return false;
      }
    }
    if (typeFilter !== 'ALL' && r.postType !== typeFilter) return false;
    if (paymentFilter !== 'ALL' && r.paymentStatus !== paymentFilter) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = r.gamerTag?.toLowerCase().includes(q) || r.fullName?.toLowerCase().includes(q);
      const matchEmail = r.email?.toLowerCase().includes(q);
      const matchPhone = r.phone?.includes(q) || r.phoneNumber?.includes(q);
      const matchPost = r.postNames?.some((p) => p.toLowerCase().includes(q));
      const matchId = r.id?.toLowerCase().includes(q);
      if (!matchName && !matchEmail && !matchPhone && !matchPost && !matchId) return false;
    }

    return true;
  });

  // KPI Metrics
  const pendingCount = reservations.filter(isPending).length;
  const activeNowCount = reservations.filter(
    (r) => r.status === 'CHECKED_IN' || (r.status === 'CONFIRMED' && r.startAt <= Date.now() && r.endAt >= Date.now())
  ).length;
  const confirmedCount = reservations.filter((r) => r.status === 'CONFIRMED').length;
  const todayBookingsCount = reservations.filter(
    (r) => r.startAt >= todayStart.getTime() && r.startAt <= todayEnd.getTime()
  ).length;
  const cancelledCount = reservations.filter((r) => ['CANCELLED', 'NO_SHOW'].includes(r.status)).length;
  const expiredCount = reservations.filter(
    (r) => r.status === 'CANCELLED' && (r.cancellationReason?.toLowerCase().includes('expired') || r.cancellationReason?.toLowerCase().includes('timeout'))
  ).length;
  const totalRevenue = reservations
    .filter((r) => ['CONFIRMED', 'CHECKED_IN', 'COMPLETED'].includes(r.status))
    .reduce((sum, r) => sum + (r.amountPaid || 0), 0);

  // Open Edit Modal
  const handleOpenEdit = (res: Reservation) => {
    setEditingRes(res);
    const startDate = new Date(res.startAt);
    setEditDate(startDate.toISOString().split('T')[0]);
    setEditStartTime(
      `${String(startDate.getHours()).padStart(2, '0')}:${String(startDate.getMinutes()).padStart(2, '0')}`
    );
    setEditDuration(res.durationHours);
    setEditPostIds(res.postIds);
    setEditStatus(res.status);
    setEditPriceOverride(res.finalPrice ? String(res.finalPrice) : String(res.totalPrice));
    setEditPriceReason(res.priceOverrideReason || '');
    setEditNotes(res.notes || '');
    setEditPhone(res.phone || '');
    setEditError(null);
  };

  // Submit Edit
  const handleSaveEdit = async () => {
    if (!editingRes) return;
    setEditLoading(true);
    setEditError(null);

    try {
      const [h, m] = editStartTime.split(':').map(Number);
      const startDateObj = new Date(editDate);
      startDateObj.setHours(h, m, 0, 0);
      const newStartAt = startDateObj.getTime();

      const selectedPostObjs = posts.filter((p) => editPostIds.includes(p.id));
      const newPostNames = selectedPostObjs.map((p) => p.name);

      await adminUpdateReservation(
        editingRes.id,
        {
          startAt: newStartAt,
          durationHours: editDuration,
          selectedPostIds: editPostIds,
          selectedPostNames: newPostNames.length > 0 ? newPostNames : editingRes.postNames,
          status: editStatus,
          overridePrice: editPriceOverride ? Number(editPriceOverride) : undefined,
          priceOverrideReason: editPriceReason,
          notes: editNotes,
          phone: editPhone,
        },
        playerProfile
      );

      setEditingRes(null);
    } catch (err: any) {
      console.error('Failed to update reservation:', err);
      setEditError(err.message || 'Failed to update reservation.');
    } finally {
      setEditLoading(false);
    }
  };

  // Submit Payment
  const handleSavePayment = async () => {
    if (!payingRes) return;
    setPayLoading(true);

    try {
      await adminUpdatePaymentStatus(
        payingRes.id,
        {
          paymentStatus: payStatus,
          amountPaid: payAmount,
          paymentMethod: payMethod,
        },
        playerProfile
      );
      setPayingRes(null);
    } catch (err) {
      console.error('Failed to update payment:', err);
    } finally {
      setPayLoading(false);
    }
  };

  // Submit Cancel / Reject / NoShow
  const handleConfirmCancelAction = async () => {
    if (!cancellingRes) return;
    setCancelLoading(true);

    try {
      if (cancelActionType === 'reject') {
        await adminRejectReservation(cancellingRes.id, playerProfile, cancelReasonText);
      } else if (cancelActionType === 'noshow') {
        await adminMarkNoShow(cancellingRes.id, playerProfile, cancelReasonText);
      } else {
        await adminCancelReservation(cancellingRes.id, playerProfile, cancelReasonText);
      }
      setCancellingRes(null);
      setCancelReasonText('');
    } catch (err) {
      console.error('Failed cancel action:', err);
    } finally {
      setCancelLoading(false);
    }
  };

  // Save Settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSettingsSaving(true);
    setSettingsSavedSuccess(false);

    try {
      await updateReservationSettings(formSettings, playerProfile);
      setSettingsSavedSuccess(true);
      setTimeout(() => setSettingsSavedSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to save settings:', err);
    } finally {
      setSettingsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Alert Messages for Staff Actions */}
      {actionSuccessMsg && (
        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 font-mono text-xs flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span>{actionSuccessMsg}</span>
        </div>
      )}
      {actionErrorMsg && (
        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-300 font-mono text-xs flex items-center gap-2 animate-in fade-in">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
          <span>{actionErrorMsg}</span>
        </div>
      )}

      {/* Top Staff Bar & Metric KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <button
          type="button"
          onClick={() => setAdminTab('pending')}
          className={`p-4 rounded-2xl border text-left transition-all ${
            adminTab === 'pending'
              ? 'bg-amber-500/20 border-amber-500 shadow-lg shadow-amber-500/10'
              : 'bg-slate-900/80 border-slate-800 hover:border-amber-500/50'
          } space-y-1`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-amber-400 uppercase font-bold">Pending Approval</span>
            {pendingCount > 0 && (
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping" />
            )}
          </div>
          <div className="text-2xl font-black text-white font-mono">{pendingCount}</div>
        </button>

        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-1">
          <span className="text-[10px] font-mono text-emerald-400 uppercase">Active Now</span>
          <div className="text-2xl font-black text-white font-mono">{activeNowCount}</div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-1">
          <span className="text-[10px] font-mono text-cyan-400 uppercase">Today's Bookings</span>
          <div className="text-2xl font-black text-white font-mono">{todayBookingsCount}</div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-1">
          <span className="text-[10px] font-mono text-purple-400 uppercase">Collected Revenue</span>
          <div className="text-2xl font-black text-emerald-400 font-mono">{totalRevenue} DA</div>
        </div>
      </div>

      {/* Admin Sub-Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-3">
        <button
          onClick={() => setAdminTab('pending')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-mono font-bold uppercase tracking-wider transition-all ${
            adminTab === 'pending'
              ? 'bg-amber-500 text-black shadow-md'
              : 'text-amber-400/90 hover:text-amber-300 hover:bg-amber-500/10'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>⏳ Pending ({pendingCount})</span>
        </button>

        <button
          onClick={() => {
            setAdminTab('confirmed');
            setStatusFilter('CONFIRMED');
          }}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-mono font-bold uppercase tracking-wider transition-all ${
            adminTab === 'confirmed'
              ? 'bg-emerald-500 text-black shadow-md'
              : 'text-emerald-400/90 hover:text-emerald-300 hover:bg-emerald-500/10'
          }`}
        >
          <CheckCircle2 className="w-4 h-4" />
          <span>✓ Confirmed ({confirmedCount})</span>
        </button>

        <button
          onClick={() => setAdminTab('today')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-mono font-bold uppercase tracking-wider transition-all ${
            adminTab === 'today'
              ? 'bg-cyan-500 text-black shadow-md'
              : 'text-cyan-400/90 hover:text-cyan-300 hover:bg-cyan-500/10'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>📅 Today ({todayBookingsCount})</span>
        </button>

        <button
          onClick={() => setAdminTab('active_now')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-mono font-bold uppercase tracking-wider transition-all ${
            adminTab === 'active_now'
              ? 'bg-emerald-500 text-black shadow-md'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Monitor className="w-4 h-4" />
          <span>🟢 Active Now ({activeNowCount})</span>
        </button>

        <button
          onClick={() => {
            setAdminTab('cancelled');
            setStatusFilter('CANCELLED');
          }}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-mono font-bold uppercase tracking-wider transition-all ${
            adminTab === 'cancelled'
              ? 'bg-red-500 text-white shadow-md'
              : 'text-red-400/80 hover:text-red-300 hover:bg-red-500/10'
          }`}
        >
          <XCircle className="w-4 h-4" />
          <span>❌ Cancelled ({cancelledCount})</span>
        </button>

        <button
          onClick={() => setAdminTab('expired')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-mono font-bold uppercase tracking-wider transition-all ${
            adminTab === 'expired'
              ? 'bg-amber-600 text-white shadow-md'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
          <span>⚠️ Expired ({expiredCount})</span>
        </button>

        <button
          onClick={() => {
            setAdminTab('bookings');
            setStatusFilter('ALL');
          }}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-mono font-bold uppercase tracking-wider transition-all ${
            adminTab === 'bookings'
              ? 'bg-cyan-500 text-black shadow-md'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>📋 All Bookings ({reservations.length})</span>
        </button>

        <button
          onClick={() => setAdminTab('equipment')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-mono font-bold uppercase tracking-wider transition-all ${
            adminTab === 'equipment'
              ? 'bg-cyan-500 text-black shadow-md'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Monitor className="w-4 h-4" />
          <span>🖥️ Equipment ({posts.length})</span>
        </button>

        <button
          onClick={() => setAdminTab('blocks')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-mono font-bold uppercase tracking-wider transition-all ${
            adminTab === 'blocks'
              ? 'bg-cyan-500 text-black shadow-md'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Ban className="w-4 h-4" />
          <span>🚫 Blocks ({postBlocks.length})</span>
        </button>

        <button
          onClick={() => setAdminTab('settings')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-mono font-bold uppercase tracking-wider transition-all ${
            adminTab === 'settings'
              ? 'bg-cyan-500 text-black shadow-md'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Settings className="w-4 h-4" />
          <span>⚙️ Pricing & Rules</span>
        </button>
      </div>

      {/* TAB 0: PENDING APPROVAL QUEUE */}
      {adminTab === 'pending' && (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-xs font-mono text-amber-300 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Phone className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                <strong>Admin Workflow:</strong> Call the customer using their verified phone number before confirming their reservation. Acceptance validates station availability atomically in real time.
              </span>
            </div>
            <span className="text-[10px] text-amber-400/80 uppercase font-bold">
              {pendingCount} Pending Request{pendingCount !== 1 ? 's' : ''}
            </span>
          </div>

          {reservations.filter(isPending).length === 0 ? (
            <div className="p-12 text-center rounded-3xl bg-slate-900/30 border border-slate-800 space-y-2">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
              <div className="text-sm font-bold text-slate-300 font-mono">No Pending Requests</div>
              <p className="text-xs text-slate-500 max-w-sm mx-auto font-mono">
                All reservation requests have been processed. New requests submitted by players will appear here for staff verification.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {reservations
                .filter(isPending)
                .map((res) => {
                  const isGroup = res.reservationType === 'GROUP_10_PC' || res.postType === 'PC' || Boolean(res.requestedPcCount);
                  const isPs5 = res.postType === 'PS5';
                  const customerPhone = res.phoneNumber || res.phone;
                  const isExpired = res.pendingExpiresAt ? Date.now() > res.pendingExpiresAt : false;
                  const minutesLeft = res.pendingExpiresAt
                    ? Math.max(0, Math.round((res.pendingExpiresAt - Date.now()) / 60000))
                    : null;

                  return (
                    <div
                      key={res.id}
                      className="p-5 rounded-3xl bg-slate-900/90 border border-amber-500/30 space-y-4 shadow-xl hover:border-amber-500/60 transition-all"
                    >
                      {/* Header */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div
                            className={`p-3 rounded-2xl border ${
                              isGroup
                                ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400'
                                : isPs5
                                ? 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                                : 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400'
                            }`}
                          >
                            {isGroup ? (
                              <Users className="w-5 h-5" />
                            ) : isPs5 ? (
                              <Gamepad2 className="w-5 h-5" />
                            ) : (
                              <Monitor className="w-5 h-5" />
                            )}
                          </div>
                          <div>
                            <div className="font-black text-sm text-white uppercase tracking-wider">
                              {isGroup ? `${res.requestedPcCount || 10}-PC Group Arena` : res.postNames.join(', ')}
                            </div>
                            <div className="text-[11px] font-mono text-cyan-400 font-semibold mt-0.5">
                              Internal Allocation: {res.postNames.join(', ')}
                            </div>
                            <div className="text-xs text-slate-400 font-mono mt-0.5">
                              Player: <span className="text-white font-bold">{res.gamerTag || res.fullName}</span> {res.isGuest ? '(Guest Customer)' : '(Registered Account)'}
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-1 font-mono">
                          <span className="text-[10px] px-2 py-0.5 rounded font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse">
                            PENDING CALL
                          </span>
                          {minutesLeft !== null && (
                            <span className={`text-[10px] ${isExpired ? 'text-red-400' : 'text-slate-400'}`}>
                              {isExpired ? 'Expired' : `Expires in ~${minutesLeft}m`}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Schedule & Price Details */}
                      <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 grid grid-cols-2 gap-3 text-xs font-mono">
                        <div>
                          <span className="text-slate-500 text-[10px] block">DATE & TIME</span>
                          <span className="text-white font-bold">
                            {new Date(res.startAt).toLocaleDateString()}
                          </span>
                          <span className="text-cyan-400 block text-[11px]">
                            {new Date(res.startAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} →{' '}
                            {new Date(res.endAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ({res.durationHours}h)
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 text-[10px] block">TOTAL PRICE</span>
                          <span className="text-emerald-400 font-bold text-sm">
                            {res.totalPrice} DA
                          </span>
                          {res.gameName && (
                            <span className="text-slate-400 block text-[10px] truncate">
                              Game: {res.gameName}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Prominent Phone Call Action */}
                      <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-between gap-3 font-mono">
                        <div className="flex items-center gap-2">
                          <Phone className="w-4 h-4 text-amber-400" />
                          <div>
                            <span className="text-[9px] text-amber-400/80 block uppercase font-bold">Customer Phone</span>
                            <span className="text-sm font-black text-white">{customerPhone || 'Not Provided'}</span>
                          </div>
                        </div>

                        {customerPhone && (
                          <a
                            href={`tel:${customerPhone}`}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-black text-xs uppercase tracking-wider transition-all shadow-md"
                          >
                            <Phone className="w-3.5 h-3.5 fill-black" />
                            <span>Call Player</span>
                          </a>
                        )}
                      </div>

                      {/* Staff Decision Actions */}
                      <div className="flex items-center justify-end gap-2 pt-1 font-mono">
                        <button
                          type="button"
                          onClick={() => {
                            setCancellingRes(res);
                            setCancelActionType('reject');
                            setCancelReasonText('');
                          }}
                          className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-red-500/20 text-red-400 text-xs font-bold transition-colors"
                        >
                          Reject Request
                        </button>
                        <button
                          type="button"
                          disabled={confirmingId === res.id}
                          onClick={() => setConfirmingResModal(res)}
                          className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black uppercase text-xs tracking-wider transition-all disabled:opacity-50 shadow-lg shadow-emerald-500/20"
                        >
                          <CheckCircle2 className="w-4 h-4 stroke-[3]" />
                          <span>{confirmingId === res.id ? 'Verifying...' : 'Accept & Confirm'}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* TAB 1: ALL BOOKINGS & MANAGEMENT */}
      {['bookings', 'confirmed', 'today', 'active_now', 'cancelled', 'expired'].includes(adminTab) && (
        <div className="space-y-4">
          {/* Header indicator when filtering by specific quick tab */}
          {adminTab !== 'bookings' && (
            <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between text-xs font-mono">
              <span className="text-slate-300">
                Viewing category: <strong className="text-cyan-400 uppercase">{adminTab.replace('_', ' ')}</strong> ({filteredReservations.length} results)
              </span>
              <button
                onClick={() => setAdminTab('bookings')}
                className="text-slate-400 hover:text-white underline text-[11px]"
              >
                Reset to All Bookings
              </button>
            </div>
          )}

          {/* Filter / Search Bar */}
          <div className="bg-slate-900/60 p-4 rounded-2xl border border-slate-800 grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search player, email, phone, post..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-400 font-mono"
              />
            </div>

            <div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono focus:border-cyan-400 focus:outline-none"
              >
                <option value="ALL">All Statuses</option>
                <option value="PENDING">Pending Approval</option>
                <option value="CONFIRMED">Confirmed</option>
                <option value="CHECKED_IN">Checked In</option>
                <option value="COMPLETED">Completed</option>
                <option value="CANCELLED">Cancelled</option>
                <option value="NO_SHOW">No Show</option>
              </select>
            </div>

            <div>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono focus:border-cyan-400 focus:outline-none"
              >
                <option value="ALL">All Station Types</option>
                <option value="PC">PC Esports Rigs</option>
                <option value="PS5">PS5 Tournament Stations</option>
              </select>
            </div>

            <div>
              <select
                value={paymentFilter}
                onChange={(e) => setPaymentFilter(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono focus:border-cyan-400 focus:outline-none"
              >
                <option value="ALL">All Payments</option>
                <option value="UNPAID">Unpaid</option>
                <option value="PAID">Paid</option>
                <option value="PARTIALLY_PAID">Partially Paid</option>
                <option value="REFUNDED">Refunded</option>
              </select>
            </div>
          </div>

          {/* Bookings Table */}
          <div className="bg-[#0c0d14] rounded-3xl border border-slate-800 overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-900/90 border-b border-slate-800 text-slate-400 font-mono">
                    <th className="p-4">RESERVATION / PLAYER</th>
                    <th className="p-4">STATION(S)</th>
                    <th className="p-4">DATE & SCHEDULE</th>
                    <th className="p-4">PRICE & PAYMENT</th>
                    <th className="p-4">STATUS</th>
                    <th className="p-4 text-right">STAFF ACTIONS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {filteredReservations.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-500">
                        No reservations match the selected criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredReservations.map((res) => {
                      const isGroup = res.reservationType === 'GROUP_10_PC';

                      return (
                        <tr key={res.id} className="hover:bg-slate-900/40 transition-colors">
                          {/* Player & ID */}
                          <td className="p-4">
                            <div className="font-bold text-white text-sm">
                              {res.gamerTag}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {res.fullName || 'Registered Player'}
                            </div>
                            {res.phone && (
                              <div className="text-[10px] text-cyan-400 flex items-center gap-1 mt-0.5">
                                <Phone className="w-3 h-3" />
                                <span>{res.phone}</span>
                              </div>
                            )}
                            <div className="text-[9px] text-slate-500 mt-1">
                              ID: {res.id}
                            </div>
                          </td>

                          {/* Station */}
                          <td className="p-4">
                            <div className="flex items-center gap-1.5">
                              {isGroup ? (
                                <Users className="w-4 h-4 text-yellow-400" />
                              ) : res.postType === 'PS5' ? (
                                <Gamepad2 className="w-4 h-4 text-blue-400" />
                              ) : (
                                <Monitor className="w-4 h-4 text-cyan-400" />
                              )}
                              <span className="font-bold text-white">
                                {isGroup ? '10-PC Group Arena' : res.postNames.join(', ')}
                              </span>
                            </div>
                            {res.gameName && (
                              <div className="text-[10px] text-slate-400 mt-0.5">
                                {res.gameName}
                              </div>
                            )}
                          </td>

                          {/* Schedule */}
                          <td className="p-4">
                            <div className="text-white font-bold">
                              {new Date(res.startAt).toLocaleDateString()}
                            </div>
                            <div className="text-cyan-300 text-[11px]">
                              {new Date(res.startAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}{' '}
                              →{' '}
                              {new Date(res.endAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}{' '}
                              ({res.durationHours}h)
                            </div>
                          </td>

                          {/* Price & Payment */}
                          <td className="p-4">
                            <div className="text-emerald-400 font-bold text-sm">
                              {res.totalPrice} DA
                            </div>
                            <div className="flex items-center gap-1 mt-0.5">
                              <span
                                className={`text-[9px] px-1.5 py-0.2 rounded font-bold ${
                                  res.paymentStatus === 'PAID'
                                    ? 'bg-emerald-500/20 text-emerald-400'
                                    : res.paymentStatus === 'PARTIALLY_PAID'
                                    ? 'bg-yellow-500/20 text-yellow-400'
                                    : 'bg-red-500/20 text-red-400'
                                }`}
                              >
                                {res.paymentStatus}
                              </span>
                              <span className="text-[10px] text-slate-400">
                                ({res.amountPaid || 0} DA)
                              </span>
                            </div>
                          </td>

                          {/* Status Badge */}
                          <td className="p-4">
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                                res.status === 'CONFIRMED'
                                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                                  : res.status === 'CHECKED_IN'
                                  ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40'
                                  : isPending(res)
                                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40 animate-pulse'
                                  : res.status === 'COMPLETED'
                                  ? 'bg-slate-800 text-slate-300'
                                  : 'bg-red-500/20 text-red-400 border border-red-500/40'
                              }`}
                            >
                              {res.status}
                            </span>
                          </td>

                          {/* Staff Action Buttons */}
                          <td className="p-4 text-right">
                            <div className="flex items-center justify-end gap-1.5 flex-wrap">
                              <button
                                onClick={() => setSelectedDetailResId(res.id)}
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                                title="View Reservation Details & Live PC Slots"
                              >
                                <Eye className="w-4 h-4" />
                              </button>

                              {/* Pending approvals */}
                              {isPending(res) && (
                                <>
                                  {(res.phoneNumber || res.phone) && (
                                    <a
                                      href={`tel:${res.phoneNumber || res.phone}`}
                                      className="p-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-400 text-amber-400 hover:text-black transition-colors"
                                      title={`Call customer: ${res.phoneNumber || res.phone}`}
                                    >
                                      <Phone className="w-4 h-4" />
                                    </a>
                                  )}
                                  <button
                                    disabled={confirmingId === res.id}
                                    onClick={() => setConfirmingResModal(res)}
                                    className="p-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500 text-emerald-400 hover:text-black transition-colors disabled:opacity-50"
                                    title="Approve & Confirm"
                                  >
                                    <CheckCircle2 className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => {
                                      setCancellingRes(res);
                                      setCancelActionType('reject');
                                      setCancelReasonText('');
                                    }}
                                    className="p-1.5 rounded-lg bg-red-500/20 hover:bg-red-500 text-red-400 hover:text-white transition-colors"
                                    title="Reject Booking"
                                  >
                                    <XCircle className="w-4 h-4" />
                                  </button>
                                </>
                              )}

                              {/* Check in */}
                              {res.status === 'CONFIRMED' && (
                                <button
                                  onClick={() => adminCheckInReservation(res.id, playerProfile)}
                                  className="px-2 py-1 rounded-lg bg-cyan-500/20 hover:bg-cyan-500 text-cyan-400 hover:text-black text-[10px] font-bold transition-colors"
                                  title="Check In Player"
                                >
                                  Check-In
                                </button>
                              )}

                              {/* Mark No Show */}
                              {['CONFIRMED', 'PENDING'].includes(res.status) && (
                                <button
                                  onClick={() => {
                                    setCancellingRes(res);
                                    setCancelActionType('noshow');
                                    setCancelReasonText('');
                                  }}
                                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-colors"
                                  title="Mark as No-Show"
                                >
                                  <Ban className="w-4 h-4" />
                                </button>
                              )}

                              {/* Complete */}
                              {res.status === 'CHECKED_IN' && (
                                <button
                                  onClick={() => adminCompleteReservation(res.id, playerProfile)}
                                  className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-emerald-500/20 text-slate-300 hover:text-emerald-400 text-[10px] font-bold transition-colors"
                                >
                                  Complete
                                </button>
                              )}

                              {/* Payment Update */}
                              <button
                                onClick={() => {
                                  setPayingRes(res);
                                  setPayAmount(res.amountPaid || 0);
                                  setPayStatus(res.paymentStatus);
                                  setPayMethod(res.paymentMethod || 'CASH');
                                }}
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-400 transition-colors"
                                title="Update Payment"
                              >
                                <DollarSign className="w-4 h-4" />
                              </button>

                              {/* Edit details */}
                              <button
                                onClick={() => handleOpenEdit(res)}
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-400 transition-colors"
                                title="Edit Reservation"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>

                              {/* Cancel */}
                              {!['CANCELLED', 'NO_SHOW', 'COMPLETED'].includes(res.status) && (
                                <button
                                  onClick={() => {
                                    setCancellingRes(res);
                                    setCancelActionType('cancel');
                                    setCancelReasonText('');
                                  }}
                                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-red-900/40 text-slate-400 hover:text-red-400 transition-colors"
                                  title="Cancel Booking"
                                >
                                  <XCircle className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: EQUIPMENT & POST MANAGEMENT */}
      {adminTab === 'equipment' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-white uppercase tracking-wider">
              Gaming Rigs & Tournament Stations
            </h3>
            {isAdmin && (
              <button
                onClick={() => {
                  setEditingPost(null);
                  setPostName(`PC ${posts.filter((p) => p.type === 'PC').length + 1}`);
                  setPostType('PC');
                  setPostStatus('ACTIVE');
                  setPostOrder(posts.length + 1);
                  setPostSpecs('');
                  setIsPostModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-cyan-400 hover:bg-cyan-300 text-black font-black uppercase text-xs rounded-xl shadow-md transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4 stroke-[3]" />
                <span>Add Gaming Post</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {posts.map((post) => (
              <div
                key={post.id}
                className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-3 relative"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className={`p-2 rounded-xl ${
                        post.type === 'PC'
                          ? 'bg-cyan-500/10 text-cyan-400'
                          : 'bg-blue-500/10 text-blue-400'
                      }`}
                    >
                      {post.type === 'PC' ? (
                        <Monitor className="w-5 h-5" />
                      ) : (
                        <Gamepad2 className="w-5 h-5" />
                      )}
                    </div>
                    <div>
                      <div className="font-black text-white text-sm uppercase">
                        {post.name}
                      </div>
                      <span className="text-[10px] font-mono text-slate-400">
                        {post.type} Post • Order #{post.order}
                      </span>
                    </div>
                  </div>

                  <span
                    className={`text-[9px] px-2 py-0.5 rounded font-mono font-bold ${
                      post.status === 'ACTIVE'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : post.status === 'MAINTENANCE'
                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {post.status}
                  </span>
                </div>

                {post.specs && (
                  <div className="text-[11px] font-mono text-slate-300 bg-slate-950 p-2.5 rounded-xl border border-slate-800/80">
                    {post.specs}
                  </div>
                )}

                <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() =>
                        updateGamingPost(
                          post.id,
                          { status: post.status === 'ACTIVE' ? 'MAINTENANCE' : 'ACTIVE' },
                          playerProfile
                        )
                      }
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[10px] font-mono font-bold text-slate-300 transition-colors"
                    >
                      Toggle {post.status === 'ACTIVE' ? 'Maintenance' : 'Active'}
                    </button>
                  </div>

                  {isAdmin && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          setEditingPost(post);
                          setPostName(post.name);
                          setPostType(post.type);
                          setPostStatus(post.status);
                          setPostOrder(post.order);
                          setPostSpecs(post.specs || '');
                          setIsPostModalOpen(true);
                        }}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-400 transition-colors cursor-pointer"
                        title="Edit Post"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>

                      <button
                        onClick={() => {
                          if (confirm(`Are you sure you want to delete ${post.name}?`)) {
                            deleteGamingPost(post.id, playerProfile);
                          }
                        }}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-red-500/20 text-red-400 transition-colors cursor-pointer"
                        title="Delete Post"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: MAINTENANCE BLOCKS */}
      {adminTab === 'blocks' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-white uppercase tracking-wider">
              Scheduled Station Maintenance & Blocks
            </h3>
            <button
              onClick={() => {
                setBlockPostId(posts[0]?.id || '');
                setIsBlockModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-400 hover:bg-amber-300 text-black font-black uppercase text-xs rounded-xl shadow-md transition-all"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>Schedule Maintenance Block</span>
            </button>
          </div>

          {postBlocks.length === 0 ? (
            <div className="p-8 text-center rounded-2xl bg-slate-900/40 border border-slate-800 text-slate-500 text-xs font-mono">
              No active maintenance blocks scheduled. All active stations are bookable.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {postBlocks.map((block) => (
                <div
                  key={block.id}
                  className="p-4 rounded-2xl bg-slate-900/70 border border-amber-500/30 space-y-2 relative"
                >
                  <div className="flex items-center justify-between">
                    <div className="font-bold text-white uppercase text-sm">
                      {block.postName}
                    </div>
                    <span className="text-[9px] px-2 py-0.5 rounded font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                      {block.reason}
                    </span>
                  </div>

                  <div className="text-xs font-mono text-slate-400">
                    {new Date(block.startAt).toLocaleDateString()} ({new Date(block.startAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}{' '}
                    → {new Date(block.endAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})
                  </div>

                  {block.reasonDescription && (
                    <div className="text-xs text-slate-300 bg-slate-950 p-2 rounded-xl">
                      {block.reasonDescription}
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-[10px] font-mono text-slate-500">
                    <span>Added by: {block.createdByGamerTag}</span>
                    <button
                      onClick={() => deletePostBlock(block.id, playerProfile)}
                      className="text-red-400 hover:text-red-300 font-bold"
                    >
                      Remove Block
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: PRICING & OPENING HOURS SETTINGS */}
      {adminTab === 'settings' && (
        <form onSubmit={handleSaveSettings} className="bg-slate-900/70 p-6 rounded-3xl border border-slate-800 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <h3 className="text-base font-black text-white uppercase tracking-wider">
                Reservation & Business Configuration
              </h3>
              <p className="text-xs text-slate-400">
                Modify hourly rates, 10-PC tournament pricing, auto-approval, and opening hours.
              </p>
            </div>

            {isAdmin ? (
              <button
                type="submit"
                disabled={settingsSaving}
                className="px-6 py-2.5 bg-emerald-400 hover:bg-emerald-300 text-black font-black uppercase text-xs tracking-wider rounded-xl shadow-md transition-all cursor-pointer"
              >
                {settingsSaving ? 'Saving...' : 'Save Configuration'}
              </button>
            ) : (
              <span className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-400 text-xs font-mono font-bold">
                🔒 Read-Only (Admin Access Required)
              </span>
            )}
          </div>

          {settingsSavedSuccess && (
            <div className="p-3.5 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-mono font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              <span>Settings updated successfully! Future bookings will use these rates.</span>
            </div>
          )}

          {/* Pricing Settings Grid */}
          <div className="space-y-3">
            <h4 className="text-xs font-black text-cyan-400 uppercase tracking-wider">
              1. Hourly Station Rates (DA)
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 font-mono">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300">PC Hourly Rate (DA)</label>
                <input
                  type="number"
                  min="0"
                  disabled={!isAdmin}
                  value={formSettings.pcHourlyPrice}
                  onChange={(e) =>
                    setFormSettings({ ...formSettings, pcHourlyPrice: Number(e.target.value) })
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-400 disabled:opacity-60 disabled:cursor-not-allowed"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300">PS5 Hourly Rate (DA)</label>
                <input
                  type="number"
                  min="0"
                  disabled={!isAdmin}
                  value={formSettings.ps5HourlyPrice}
                  onChange={(e) =>
                    setFormSettings({ ...formSettings, ps5HourlyPrice: Number(e.target.value) })
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-400 disabled:opacity-60 disabled:cursor-not-allowed"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300">10-PC Group Hourly Rate (DA)</label>
                <input
                  type="number"
                  min="0"
                  disabled={!isAdmin}
                  value={formSettings.group10PcHourlyPrice || formSettings.pcHourlyPrice * 10}
                  onChange={(e) =>
                    setFormSettings({ ...formSettings, group10PcHourlyPrice: Number(e.target.value) })
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-400 disabled:opacity-60 disabled:cursor-not-allowed"
                />
              </div>
            </div>
          </div>

          {/* Policy & Duration Settings */}
          <div className="space-y-3 pt-3 border-t border-slate-800">
            <h4 className="text-xs font-black text-cyan-400 uppercase tracking-wider">
              2. Approval & Duration Rules
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 font-mono">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300">Auto-Confirm Bookings</label>
                <select
                  disabled={!isAdmin}
                  value={formSettings.autoConfirm ? 'YES' : 'NO'}
                  onChange={(e) =>
                    setFormSettings({ ...formSettings, autoConfirm: e.target.value === 'YES' })
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-400 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <option value="YES">ON (Instant Confirmation)</option>
                  <option value="NO">OFF (Staff Approval Required)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300">Min Duration (Hours)</label>
                <input
                  type="number"
                  min="1"
                  max="8"
                  disabled={!isAdmin}
                  value={formSettings.minDurationHours}
                  onChange={(e) =>
                    setFormSettings({ ...formSettings, minDurationHours: Number(e.target.value) })
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-400 disabled:opacity-60 disabled:cursor-not-allowed"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300">Max Duration (Hours)</label>
                <input
                  type="number"
                  min="1"
                  max="24"
                  disabled={!isAdmin}
                  value={formSettings.maxDurationHours}
                  onChange={(e) =>
                    setFormSettings({ ...formSettings, maxDurationHours: Number(e.target.value) })
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-400 disabled:opacity-60 disabled:cursor-not-allowed"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300">Cancellation Deadline (Hours Before)</label>
                <input
                  type="number"
                  min="0"
                  disabled={!isAdmin}
                  value={formSettings.cancellationDeadlineHours}
                  onChange={(e) =>
                    setFormSettings({
                      ...formSettings,
                      cancellationDeadlineHours: Number(e.target.value),
                    })
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-400 disabled:opacity-60 disabled:cursor-not-allowed"
                />
              </div>
            </div>
          </div>
        </form>
      )}

      {/* EDIT BOOKING MODAL */}
      {editingRes && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#0f111a] border border-slate-800 rounded-3xl w-full max-w-lg p-6 space-y-4 shadow-2xl my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-base font-black text-white uppercase tracking-wider">
                  Edit Reservation ({editingRes.gamerTag})
                </h3>
                <span className="text-xs text-slate-400 font-mono">ID: {editingRes.id}</span>
              </div>
              <button
                onClick={() => setEditingRes(null)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            {editError && (
              <div className="p-3 rounded-xl bg-red-500/20 border border-red-500/40 text-red-200 text-xs">
                {editError}
              </div>
            )}

            <div className="space-y-4 font-mono text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">Date</label>
                  <input
                    type="date"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2 text-white"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Start Time</label>
                  <input
                    type="time"
                    value={editStartTime}
                    onChange={(e) => setEditStartTime(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2 text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">Duration (Hours)</label>
                  <select
                    value={editDuration}
                    onChange={(e) => setEditDuration(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2 text-white"
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((h) => (
                      <option key={h} value={h}>
                        {h} Hour(s)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">Status</label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as ReservationStatus)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2 text-white"
                  >
                    <option value="PENDING">PENDING</option>
                    <option value="CONFIRMED">CONFIRMED</option>
                    <option value="CHECKED_IN">CHECKED_IN</option>
                    <option value="COMPLETED">COMPLETED</option>
                    <option value="CANCELLED">CANCELLED</option>
                    <option value="NO_SHOW">NO_SHOW</option>
                  </select>
                </div>
              </div>

              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                <label className="text-cyan-400 font-bold block">Staff Price Override (DA)</label>
                <input
                  type="number"
                  value={editPriceOverride}
                  onChange={(e) => setEditPriceOverride(e.target.value)}
                  placeholder="Leave blank to use default rate"
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2 text-white"
                />
                <input
                  type="text"
                  value={editPriceReason}
                  onChange={(e) => setEditPriceReason(e.target.value)}
                  placeholder="Reason for price override (e.g. VIP discount, Tournament promo)"
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2 text-white text-[11px]"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Customer Phone</label>
                <input
                  type="tel"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2 text-white"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Staff Remarks / Notes</label>
                <input
                  type="text"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2 text-white"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                onClick={() => setEditingRes(null)}
                className="px-4 py-2 rounded-xl text-slate-400 hover:text-white text-xs font-bold"
              >
                Cancel
              </button>
              <button
                disabled={editLoading}
                onClick={handleSaveEdit}
                className="px-6 py-2 bg-cyan-400 hover:bg-cyan-300 text-black font-black uppercase text-xs rounded-xl shadow-md disabled:opacity-50"
              >
                {editLoading ? 'Saving...' : 'Update Booking'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PAYMENT MODAL */}
      {payingRes && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0f111a] border border-slate-800 rounded-3xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-base font-black text-white uppercase tracking-wider">
                  Update Payment
                </h3>
                <span className="text-xs text-slate-400 font-mono">
                  {payingRes.gamerTag} • Total: {payingRes.totalPrice} DA
                </span>
              </div>
              <button
                onClick={() => setPayingRes(null)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 font-mono text-xs">
              <div>
                <label className="text-slate-400 block mb-1">Payment Status</label>
                <select
                  value={payStatus}
                  onChange={(e) => setPayStatus(e.target.value as PaymentStatus)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2.5 text-white"
                >
                  <option value="PAID">PAID (Full)</option>
                  <option value="PARTIALLY_PAID">PARTIALLY PAID</option>
                  <option value="UNPAID">UNPAID</option>
                  <option value="REFUNDED">REFUNDED</option>
                </select>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Amount Paid (DA)</label>
                <input
                  type="number"
                  value={payAmount}
                  onChange={(e) => setPayAmount(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2.5 text-white text-sm font-bold text-emerald-400"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Payment Method</label>
                <select
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2.5 text-white"
                >
                  <option value="CASH">Cash at Desk</option>
                  <option value="CARD">Card / POS</option>
                  <option value="ONLINE_PAYMENT">Online Transfer</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                onClick={() => setPayingRes(null)}
                className="px-4 py-2 rounded-xl text-slate-400 hover:text-white text-xs font-bold"
              >
                Cancel
              </button>
              <button
                disabled={payLoading}
                onClick={handleSavePayment}
                className="px-6 py-2 bg-emerald-400 hover:bg-emerald-300 text-black font-black uppercase text-xs rounded-xl shadow-md disabled:opacity-50"
              >
                {payLoading ? 'Saving...' : 'Save Payment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TWO-STEP CONFIRMATION MODAL */}
      {confirmingResModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0f111a] border border-emerald-500/30 rounded-3xl w-full max-w-md p-6 space-y-4 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 stroke-[2.5]" />
            </div>

            <div className="space-y-1">
              <h3 className="text-base font-black text-white uppercase tracking-wider">
                Confirm Customer Booking?
              </h3>
              <p className="text-xs text-slate-400">
                Please verify that you have contacted the player and confirmed their attendance.
              </p>
            </div>

            {/* Verification details box */}
            <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2.5 text-xs font-mono">
              <div className="flex justify-between items-center border-b border-slate-800/80 pb-2">
                <span className="text-slate-400">Player GamerTag:</span>
                <span className="text-white font-bold">{confirmingResModal.gamerTag}</span>
              </div>
              <div className="flex justify-between items-center border-b border-slate-800/80 pb-2">
                <span className="text-slate-400">Customer Phone:</span>
                <span className="text-amber-400 font-bold">{confirmingResModal.phoneNumber || confirmingResModal.phone || 'N/A'}</span>
              </div>
              <div className="flex justify-between items-center border-b border-slate-800/80 pb-2">
                <span className="text-slate-400">Reserved Post(s):</span>
                <span className="text-cyan-400 font-bold">{confirmingResModal.postNames.join(', ')}</span>
              </div>
              <div className="flex justify-between items-center border-b border-slate-800/80 pb-2">
                <span className="text-slate-400">Date & Time:</span>
                <span className="text-white font-bold">
                  {new Date(confirmingResModal.startAt).toLocaleDateString()} (
                  {new Date(confirmingResModal.startAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} -{' '}
                  {new Date(confirmingResModal.endAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Total Price:</span>
                <span className="text-emerald-400 font-bold text-sm">{confirmingResModal.totalPrice} DA</span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-[11px] font-mono text-emerald-300">
              ✓ Once confirmed, this time slot will be officially locked and marked as <strong>TAKEN</strong> on the public calendar.
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmingResModal(null)}
                className="px-4 py-2 rounded-xl text-slate-400 hover:text-white text-xs font-bold font-mono transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={confirmingId === confirmingResModal.id}
                onClick={async () => {
                  const id = confirmingResModal.id;
                  setConfirmingResModal(null);
                  await handleStaffConfirm(id);
                }}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black uppercase text-xs tracking-wider transition-all shadow-lg shadow-emerald-500/20 font-mono"
              >
                <CheckCircle2 className="w-4 h-4 stroke-[3]" />
                <span>Yes, Confirm Booking</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CANCELLATION / REJECTION / NO-SHOW MODAL */}
      {cancellingRes && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0f111a] border border-slate-800 rounded-3xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-400 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="space-y-1">
              <h3 className="text-base font-black text-white uppercase tracking-wider">
                {cancelActionType === 'reject'
                  ? 'Decline Reservation Request?'
                  : cancelActionType === 'noshow'
                  ? 'Mark Player as No-Show?'
                  : 'Cancel Confirmed Reservation?'}
              </h3>
              <p className="text-xs text-slate-400">
                Customer:{' '}
                <span className="text-white font-bold">{cancellingRes.gamerTag}</span> (
                {cancellingRes.postNames.join(', ')}) on{' '}
                {new Date(cancellingRes.startAt).toLocaleDateString()}
              </p>
            </div>

            {/* Quick Reason Pills */}
            {cancelActionType === 'reject' && (
              <div className="space-y-1.5 font-mono text-xs">
                <label className="text-slate-400 block text-[11px]">Quick Selection:</label>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    'Customer did not answer',
                    'Customer cancelled request',
                    'Time slot no longer available',
                    'Equipment maintenance',
                    'Unable to confirm reservation',
                  ].map((reason) => (
                    <button
                      key={reason}
                      type="button"
                      onClick={() => setCancelReasonText(reason)}
                      className={`px-2.5 py-1 rounded-lg text-[10px] transition-all border ${
                        cancelReasonText === reason
                          ? 'bg-red-500/30 border-red-500 text-white font-bold'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                      }`}
                    >
                      {reason}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-1.5 font-mono text-xs">
              <label className="text-slate-300 block">Reason / Operational Remark:</label>
              <input
                type="text"
                value={cancelReasonText}
                onChange={(e) => setCancelReasonText(e.target.value)}
                placeholder="e.g. Schedule adjustment, player requested, station maintenance"
                className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2.5 text-white focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 font-mono">
              <button
                onClick={() => setCancellingRes(null)}
                className="px-4 py-2 rounded-xl text-slate-400 hover:text-white text-xs font-bold"
              >
                Go Back
              </button>
              <button
                disabled={cancelLoading}
                onClick={handleConfirmCancelAction}
                className="px-5 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white text-xs font-bold uppercase tracking-wider disabled:opacity-50"
              >
                {cancelLoading ? 'Processing...' : 'Confirm Action'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* POST ADD / EDIT MODAL */}
      {isPostModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0f111a] border border-slate-800 rounded-3xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-black text-white uppercase tracking-wider">
                {editingPost ? 'Edit Gaming Post' : 'Add New Gaming Post'}
              </h3>
              <button
                onClick={() => setIsPostModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 font-mono text-xs">
              <div>
                <label className="text-slate-400 block mb-1">Post Name</label>
                <input
                  type="text"
                  value={postName}
                  onChange={(e) => setPostName(e.target.value)}
                  placeholder="e.g. PC 11, PS5 5"
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2.5 text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">Post Type</label>
                  <select
                    value={postType}
                    onChange={(e) => setPostType(e.target.value as GamingPostType)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2.5 text-white"
                  >
                    <option value="PC">PC Esports</option>
                    <option value="PS5">PS5 Console</option>
                  </select>
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">Status</label>
                  <select
                    value={postStatus}
                    onChange={(e) => setPostStatus(e.target.value as GamingPostStatus)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2.5 text-white"
                  >
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="MAINTENANCE">MAINTENANCE</option>
                    <option value="DISABLED">DISABLED</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Hardware Specifications (Specs)</label>
                <input
                  type="text"
                  value={postSpecs}
                  onChange={(e) => setPostSpecs(e.target.value)}
                  placeholder="e.g. RTX 4080 • Core i7 • 240Hz 1440p"
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2.5 text-white"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                onClick={() => setIsPostModalOpen(false)}
                className="px-4 py-2 rounded-xl text-slate-400 hover:text-white text-xs font-bold"
              >
                Cancel
              </button>
              <button
                disabled={postLoading || !postName.trim()}
                onClick={async () => {
                  setPostLoading(true);
                  try {
                    if (editingPost) {
                      await updateGamingPost(
                        editingPost.id,
                        {
                          name: postName.trim(),
                          type: postType,
                          status: postStatus,
                          order: postOrder,
                          specs: postSpecs.trim(),
                        },
                        playerProfile
                      );
                    } else {
                      await addGamingPost(
                        {
                          name: postName.trim(),
                          type: postType,
                          status: postStatus,
                          order: postOrder,
                          specs: postSpecs.trim(),
                        },
                        playerProfile
                      );
                    }
                    setIsPostModalOpen(false);
                  } catch (e) {
                    console.error('Post error:', e);
                  } finally {
                    setPostLoading(false);
                  }
                }}
                className="px-6 py-2 bg-cyan-400 hover:bg-cyan-300 text-black font-black uppercase text-xs rounded-xl shadow-md disabled:opacity-50"
              >
                {postLoading ? 'Saving...' : 'Save Post'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SCHEDULE MAINTENANCE BLOCK MODAL */}
      {isBlockModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0f111a] border border-slate-800 rounded-3xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-black text-white uppercase tracking-wider">
                Schedule Station Block
              </h3>
              <button
                onClick={() => setIsBlockModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 font-mono text-xs">
              <div>
                <label className="text-slate-400 block mb-1">Target Station</label>
                <select
                  value={blockPostId}
                  onChange={(e) => setBlockPostId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2.5 text-white"
                >
                  {posts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.type})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Date</label>
                <input
                  type="date"
                  value={blockDate}
                  onChange={(e) => setBlockDate(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2.5 text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">Start Time</label>
                  <input
                    type="time"
                    value={blockStartTime}
                    onChange={(e) => setBlockStartTime(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2.5 text-white"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">End Time</label>
                  <input
                    type="time"
                    value={blockEndTime}
                    onChange={(e) => setBlockEndTime(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2.5 text-white"
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Block Reason</label>
                <select
                  value={blockReason}
                  onChange={(e) => setBlockReason(e.target.value as PostBlockReason)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2.5 text-white"
                >
                  <option value="MAINTENANCE">Scheduled Maintenance</option>
                  <option value="TECHNICAL_ISSUE">Technical Issue / Hardware Repair</option>
                  <option value="PRIVATE_EVENT">Private Event / Tournament</option>
                  <option value="STAFF_HOLD">Staff Hold</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Description / Remarks</label>
                <input
                  type="text"
                  value={blockDesc}
                  onChange={(e) => setBlockDesc(e.target.value)}
                  placeholder="e.g. GPU thermal paste replacement"
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2.5 text-white"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                onClick={() => setIsBlockModalOpen(false)}
                className="px-4 py-2 rounded-xl text-slate-400 hover:text-white text-xs font-bold"
              >
                Cancel
              </button>
              <button
                disabled={blockLoading || !blockPostId}
                onClick={async () => {
                  setBlockLoading(true);
                  try {
                    const post = posts.find((p) => p.id === blockPostId);
                    if (!post) return;

                    const [sh, sm] = blockStartTime.split(':').map(Number);
                    const [eh, em] = blockEndTime.split(':').map(Number);

                    const sObj = new Date(blockDate);
                    sObj.setHours(sh, sm, 0, 0);

                    const eObj = new Date(blockDate);
                    eObj.setHours(eh, em, 0, 0);

                    await addPostBlock(
                      {
                        postId: post.id,
                        postName: post.name,
                        postType: post.type,
                        reason: blockReason,
                        reasonDescription: blockDesc.trim() || undefined,
                        startAt: sObj.getTime(),
                        endAt: eObj.getTime(),
                        createdById: playerProfile.uid,
                        createdByGamerTag: playerProfile.gamerTag,
                      },
                      playerProfile
                    );

                    setIsBlockModalOpen(false);
                  } catch (e) {
                    console.error('Block error:', e);
                  } finally {
                    setBlockLoading(false);
                  }
                }}
                className="px-6 py-2 bg-amber-400 hover:bg-amber-300 text-black font-black uppercase text-xs rounded-xl shadow-md disabled:opacity-50"
              >
                {blockLoading ? 'Blocking...' : 'Confirm Block'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reservation Details & Live Allocation Modal */}
      {selectedDetailResId && (
        <AdminReservationDetailsModal
          isOpen={Boolean(selectedDetailResId)}
          reservationId={selectedDetailResId}
          adminPlayer={playerProfile}
          onClose={() => setSelectedDetailResId(null)}
        />
      )}
    </div>
  );
};
