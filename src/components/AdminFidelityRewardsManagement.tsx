import React, { useState, useEffect } from 'react';
import {
  Gift,
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertCircle,
  QrCode,
  Tag,
  Clock,
  Flame,
  Search,
  Check,
  X,
  ExternalLink,
  RotateCcw,
  Ticket,
  ShieldAlert,
  AlertTriangle,
  Loader2,
  ShieldCheck,
  Coins,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  FidelityReward,
  FidelityRewardCategory,
  RewardRedemption,
  RedemptionStatus,
} from '../types';
import {
  subscribeToFidelityRewards,
  fetchFidelityRewards,
  subscribeToAllRedemptions,
  createFidelityReward,
  updateFidelityReward,
  deleteFidelityReward,
  toggleFidelityRewardActive,
  updateRedemptionStatus,
  getEffectiveRewardCost,
  verifyRedemptionByCode,
} from '../services/coinRewardService';

export const AdminFidelityRewardsManagement: React.FC = () => {
  const { user, playerProfile, isAdmin, isSuperAdmin } = useAuth();
  const canManageOffers = Boolean(isAdmin || isSuperAdmin);
  const [subTab, setSubTab] = useState<'DESK' | 'CATALOG' | 'REDEMPTIONS'>('CATALOG');
  const [rewards, setRewards] = useState<FidelityReward[]>([]);
  const [redemptions, setRedemptions] = useState<RewardRedemption[]>([]);

  // Front Desk Validation & Fulfillment State
  const [deskCodeInput, setDeskCodeInput] = useState('');
  const [deskSearchLoading, setDeskSearchLoading] = useState(false);
  const [deskSearchedRedemption, setDeskSearchedRedemption] = useState<RewardRedemption | null>(null);
  const [deskSearchNotFound, setDeskSearchNotFound] = useState(false);
  const [deskSearchError, setDeskSearchError] = useState<string | null>(null);
  const [deskActionSuccess, setDeskActionSuccess] = useState<string | null>(null);
  const [confirmMarkUsedModalOpen, setConfirmMarkUsedModalOpen] = useState(false);
  const [selectedForUsedRedemption, setSelectedForUsedRedemption] = useState<RewardRedemption | null>(null);
  const [markUsedLoading, setMarkUsedLoading] = useState(false);
  const [markUsedError, setMarkUsedError] = useState<string | null>(null);

  // Modal state for Delete Reward
  const [confirmDeleteReward, setConfirmDeleteReward] = useState<FidelityReward | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Modal state for Cancel & Refund Redemption
  const [confirmCancelRedemption, setConfirmCancelRedemption] = useState<RewardRedemption | null>(null);

  // Modal / Form state for Add/Edit reward
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRewardId, setEditingRewardId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formCost, setFormCost] = useState(100);
  const [formCategory, setFormCategory] = useState<FidelityRewardCategory>('STATION_TIME');
  const [formGame, setFormGame] = useState('ALL');
  const [formActive, setFormActive] = useState(true);
  const [formQuantity, setFormQuantity] = useState<string>(''); // empty for unlimited
  const [formTerms, setFormTerms] = useState('');
  const [formDisplayOrder, setFormDisplayOrder] = useState(1);

  // Limited Time Offer Form State
  const [formHasOffer, setFormHasOffer] = useState(false);
  const [formOfferPrice, setFormOfferPrice] = useState(80);
  const [formOfferLabel, setFormOfferLabel] = useState('LIMITED-TIME OFFER');
  const [formOfferDays, setFormOfferDays] = useState(7);

  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Redemptions filter
  const [redemptionSearch, setRedemptionSearch] = useState('');
  const [redemptionStatusFilter, setRedemptionStatusFilter] = useState<'ALL' | 'APPROVED' | 'USED' | 'CANCELLED'>('ALL');
  const [deskActionLoadingId, setDeskActionLoadingId] = useState<string | null>(null);

  useEffect(() => {
    const unsubRewards = subscribeToFidelityRewards((list) => {
      setRewards(list);
    }, { includeInactive: true });

    // Initial fetch to guarantee immediate catalog state
    fetchFidelityRewards({ includeInactive: true }).then((list) => {
      if (list && list.length > 0) {
        setRewards(list);
      }
    }).catch(() => {});

    const unsubRedemptions = subscribeToAllRedemptions((list) => {
      setRedemptions(list);
    });

    return () => {
      unsubRewards();
      unsubRedemptions();
    };
  }, []);

  // Open modal for Create
  const handleOpenCreateModal = () => {
    if (!canManageOffers) return;
    setEditingRewardId(null);
    setFormTitle('');
    setFormDesc('');
    setFormCost(180);
    setFormCategory('STATION_TIME');
    setFormGame('ALL');
    setFormActive(true);
    setFormQuantity('');
    setFormTerms('Valid during standard hours. Present code at Nexus front desk.');
    setFormDisplayOrder(rewards.length + 1);
    setFormHasOffer(false);
    setFormOfferPrice(150);
    setFormOfferLabel('LIMITED-TIME OFFER');
    setFormOfferDays(7);
    setFormError(null);
    setIsModalOpen(true);
  };

  // Open modal for Edit
  const handleOpenEditModal = (r: FidelityReward) => {
    if (!canManageOffers) return;
    setEditingRewardId(r.id);
    setFormTitle(r.title);
    setFormDesc(r.description);
    setFormCost(r.cost || r.coinCost);
    setFormCategory(r.category);
    setFormGame(r.game || 'ALL');
    setFormActive(r.active);
    setFormQuantity(r.availableQuantity !== null && r.availableQuantity !== undefined ? String(r.availableQuantity) : '');
    setFormTerms(r.terms || '');
    setFormDisplayOrder(r.displayOrder || 1);
    setFormHasOffer(!!r.hasOffer);
    setFormOfferPrice(r.offerPrice || Math.round((r.cost || r.coinCost) * 0.8));
    setFormOfferLabel(r.offerLabel || 'LIMITED-TIME OFFER');
    setFormOfferDays(7);
    setFormError(null);
    setIsModalOpen(true);
  };

  // Toggle active/inactive
  const handleToggleOfferActive = async (reward: FidelityReward) => {
    if (!user || !canManageOffers) return;
    try {
      await toggleFidelityRewardActive(reward.id, reward.active, user.uid);
      const updated = await fetchFidelityRewards({ includeInactive: true });
      if (updated && updated.length > 0) setRewards(updated);
    } catch (err: any) {
      console.error('Error toggling offer status:', err);
      alert(err.message || 'Failed to update offer status.');
    }
  };

  // Submit form
  const handleSaveReward = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formLoading) return; // Strict double-click guard
    if (!user || !canManageOffers) {
      setFormError('Unauthorized: Only Administrators and Super Administrators can manage offers.');
      return;
    }

    const cleanTitle = formTitle.trim().replace(/<[^>]*>?/gm, '');
    if (!cleanTitle) {
      setFormError('Offer name is required and cannot be empty.');
      return;
    }
    if (cleanTitle.length > 100) {
      setFormError('Offer name cannot exceed 100 characters.');
      return;
    }

    const numCost = Number(formCost);
    if (!Number.isFinite(numCost) || isNaN(numCost) || !Number.isInteger(numCost) || numCost <= 0) {
      setFormError('NC cost must be a positive integer greater than zero.');
      return;
    }

    setFormLoading(true);
    setFormError(null);

    const parsedQty = formQuantity.trim() === '' ? null : Math.max(0, parseInt(formQuantity) || 0);

    const idempotencyKey = editingRewardId ? undefined : `offer_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    const payload = {
      title: cleanTitle,
      description: formDesc.trim().replace(/<[^>]*>?/gm, ''),
      cost: numCost,
      coinCost: numCost,
      category: formCategory,
      game: formGame || 'ALL',
      active: formActive,
      availableQuantity: parsedQty,
      terms: formTerms.trim().replace(/<[^>]*>?/gm, ''),
      displayOrder: formDisplayOrder,
      hasOffer: formHasOffer,
      offerPrice: formHasOffer ? Math.max(1, formOfferPrice) : undefined,
      offerLabel: formHasOffer ? formOfferLabel : undefined,
      offerStartAt: formHasOffer ? Date.now() - 3600000 : undefined,
      offerEndAt: formHasOffer ? Date.now() + formOfferDays * 24 * 3600000 : undefined,
    };

    try {
      if (editingRewardId) {
        await updateFidelityReward(editingRewardId, payload, user.uid);
      } else {
        await createFidelityReward({ ...payload, idempotencyKey }, user.uid);
      }
      setIsModalOpen(false);
      // Immediately refetch to refresh catalog state without needing browser reload
      const refreshed = await fetchFidelityRewards({ includeInactive: true });
      if (refreshed && refreshed.length > 0) {
        setRewards(refreshed);
      }
    } catch (err: any) {
      console.error('Error saving reward:', err);
      setFormError(err.message || 'Failed to save reward.');
    } finally {
      setFormLoading(false);
    }
  };

  // Delete reward (safe soft-delete)
  const handleInitiateDeleteReward = (reward: FidelityReward) => {
    if (!user || !canManageOffers) return;
    setDeleteError(null);
    setConfirmDeleteReward(reward);
  };

  const handleConfirmDeleteReward = async () => {
    if (!user || !canManageOffers || !confirmDeleteReward) return;
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      await deleteFidelityReward(confirmDeleteReward.id, user.uid);
      setConfirmDeleteReward(null);
    } catch (err: any) {
      console.error('Error deleting reward:', err);
      setDeleteError(err.message || 'Failed to delete offer.');
    } finally {
      setDeleteLoading(false);
    }
  };

  // Desk action: Mark as Used or Cancel/Refund
  const handleInitiateCancelRedemption = (redemption: RewardRedemption) => {
    if (!user) return;
    setConfirmCancelRedemption(redemption);
  };

  const handleConfirmCancelRedemption = async () => {
    if (!user || !confirmCancelRedemption) return;
    const redemptionId = confirmCancelRedemption.id;
    setDeskActionLoadingId(redemptionId);
    try {
      await updateRedemptionStatus({
        redemptionId,
        status: 'CANCELLED',
        adminUid: user.uid,
        adminName: playerProfile?.gamerTag || 'Nexus Staff',
      });
      setConfirmCancelRedemption(null);
    } catch (err: any) {
      console.error('Error cancelling redemption:', err);
    } finally {
      setDeskActionLoadingId(null);
    }
  };

  // Front desk code lookup handler
  const handleSearchRewardCode = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setDeskSearchError(null);
    setDeskActionSuccess(null);
    setDeskSearchNotFound(false);
    setDeskSearchedRedemption(null);

    const raw = deskCodeInput.trim().toUpperCase();
    if (!raw) {
      setDeskSearchError('Please enter a redemption code.');
      return;
    }

    // Auto-normalize: if user typed 5 chars without prefix (e.g. 8UT7D), prepend NEXUS-
    let normalized = raw;
    if (!normalized.startsWith('NEXUS-') && /^[A-Z0-9]{5}$/.test(normalized)) {
      normalized = `NEXUS-${normalized}`;
      setDeskCodeInput(normalized);
    }

    // Validate format: must start with NEXUS- followed by alphanumeric characters
    if (!/^NEXUS-[A-Z0-9]{4,10}$/.test(normalized)) {
      setDeskSearchError('Malformed redemption code. Code must follow the NEXUS-XXXXX format (e.g. NEXUS-8UT7D).');
      return;
    }

    setDeskSearchLoading(true);
    try {
      const record = await verifyRedemptionByCode(normalized);
      if (!record) {
        setDeskSearchNotFound(true);
      } else {
        setDeskSearchedRedemption(record);
      }
    } catch (err: any) {
      console.error('Error searching redemption code:', err);
      setDeskSearchError('Failed to search code. Please try again.');
    } finally {
      setDeskSearchLoading(false);
    }
  };

  const handleOpenMarkUsedModal = (redemption: RewardRedemption) => {
    setSelectedForUsedRedemption(redemption);
    setMarkUsedError(null);
    setConfirmMarkUsedModalOpen(true);
  };

  const handleConfirmMarkUsed = async () => {
    if (!selectedForUsedRedemption || !user) return;
    setMarkUsedLoading(true);
    setMarkUsedError(null);

    try {
      const res = await updateRedemptionStatus({
        redemptionId: selectedForUsedRedemption.id,
        status: 'USED',
        adminUid: user.uid,
        adminName: playerProfile?.gamerTag || 'Nexus Staff',
        notes: 'Verified and marked as used by staff at desk',
        options: { expectedCode: selectedForUsedRedemption.code },
      });

      if (res.success) {
        setConfirmMarkUsedModalOpen(false);
        setDeskActionSuccess(`Reward for ${selectedForUsedRedemption.playerGamerTag} successfully marked USED!`);
        // Refresh searched redemption to show updated USED status
        const updated = await verifyRedemptionByCode(selectedForUsedRedemption.code);
        if (updated) {
          setDeskSearchedRedemption(updated);
        }
        setSelectedForUsedRedemption(null);
      } else {
        setMarkUsedError(res.error || 'Failed to mark reward as used.');
        const latest = await verifyRedemptionByCode(selectedForUsedRedemption.code);
        if (latest) {
          setDeskSearchedRedemption(latest);
        }
      }
    } catch (err: any) {
      setMarkUsedError(err.message || 'An unexpected error occurred.');
      const latest = await verifyRedemptionByCode(selectedForUsedRedemption.code);
      if (latest) {
        setDeskSearchedRedemption(latest);
      }
    } finally {
      setMarkUsedLoading(false);
    }
  };

  // Quick jump from table to Desk
  const handleVerifyAtDesk = (code: string) => {
    setDeskCodeInput(code);
    setSubTab('DESK');
    setDeskSearchNotFound(false);
    setDeskSearchError(null);
    setDeskActionSuccess(null);
    // Trigger lookup
    setDeskSearchLoading(true);
    verifyRedemptionByCode(code).then((rec) => {
      setDeskSearchLoading(false);
      if (rec) setDeskSearchedRedemption(rec);
      else setDeskSearchNotFound(true);
    });
  };

  // Filtered redemptions
  const filteredRedemptions = redemptions.filter((r) => {
    if (redemptionStatusFilter !== 'ALL' && r.status !== redemptionStatusFilter) return false;
    if (redemptionSearch.trim()) {
      const q = redemptionSearch.toLowerCase();
      const matchCode = r.code.toLowerCase().includes(q);
      const matchGamer = r.playerGamerTag.toLowerCase().includes(q);
      const matchTitle = r.rewardTitle.toLowerCase().includes(q);
      if (!matchCode && !matchGamer && !matchTitle) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Sub Tabs */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between border-b border-neutral-800 pb-3 gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setSubTab('DESK')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
              subTab === 'DESK'
                ? 'bg-amber-500 text-neutral-950 shadow-[0_0_15px_rgba(245,158,11,0.25)]'
                : 'bg-neutral-900 text-neutral-400 hover:text-white border border-neutral-800'
            }`}
          >
            <Ticket className="w-4 h-4 stroke-[2.5]" />
            <span>🎁 Redeem Customer Reward</span>
          </button>

          <button
            onClick={() => setSubTab('CATALOG')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
              subTab === 'CATALOG'
                ? 'bg-amber-500 text-neutral-950 shadow-[0_0_15px_rgba(245,158,11,0.25)]'
                : 'bg-neutral-900 text-neutral-400 hover:text-white border border-neutral-800'
            }`}
          >
            <Gift className="w-4 h-4" />
            <span>🪙 NC Redemption Offers ({rewards.length})</span>
          </button>

          <button
            onClick={() => setSubTab('REDEMPTIONS')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
              subTab === 'REDEMPTIONS'
                ? 'bg-amber-500 text-neutral-950 shadow-[0_0_15px_rgba(245,158,11,0.25)]'
                : 'bg-neutral-900 text-neutral-400 hover:text-white border border-neutral-800'
            }`}
          >
            <QrCode className="w-4 h-4" />
            <span>Passes & Ledger ({redemptions.filter((r) => r.status === 'APPROVED' || r.status === 'ACTIVE').length} Active)</span>
          </button>
        </div>

        {subTab === 'CATALOG' && canManageOffers && (
          <button
            id="add-new-fidelity-reward-btn"
            onClick={handleOpenCreateModal}
            className="flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black uppercase text-xs tracking-wider transition-all shadow-[0_0_15px_rgba(245,158,11,0.25)] cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>Add Offer</span>
          </button>
        )}
      </div>

      {/* ========================================================
          SUB-TAB 0: 🎁 REDEEM CUSTOMER REWARD (DESK FLOW)
          ======================================================== */}
      {subTab === 'DESK' && (
        <div className="space-y-6">
          {/* Desk Code Search Card */}
          <div className="p-6 rounded-2xl bg-neutral-950 border border-neutral-800 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <Ticket className="w-5 h-5 stroke-[2.5]" />
              </div>
              <div>
                <h3 className="text-base font-black uppercase tracking-wider text-white">
                  🎁 REDEEM CUSTOMER REWARD
                </h3>
                <p className="text-xs text-neutral-400">
                  Front Desk Customer Reward Validation & Fulfillment Terminal
                </p>
              </div>
            </div>

            <form onSubmit={handleSearchRewardCode} className="space-y-3 pt-2">
              <label className="block text-xs font-bold text-neutral-300 uppercase tracking-wider">
                Enter customer's redemption code
              </label>
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500" />
                  <input
                    type="text"
                    value={deskCodeInput}
                    onChange={(e) => {
                      setDeskCodeInput(e.target.value.toUpperCase());
                      setDeskSearchNotFound(false);
                      setDeskSearchError(null);
                    }}
                    placeholder="e.g. NEXUS-8UT7D"
                    className="w-full pl-10 pr-4 py-3 rounded-xl bg-neutral-900 border border-neutral-800 text-white font-mono font-bold text-sm uppercase placeholder:normal-case placeholder:font-sans placeholder:font-normal placeholder:text-neutral-600 focus:outline-none focus:border-amber-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={deskSearchLoading || !deskCodeInput.trim()}
                  className="px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black uppercase text-xs tracking-wider transition-all shadow-[0_0_15px_rgba(245,158,11,0.25)] disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer shrink-0"
                >
                  {deskSearchLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Searching...</span>
                    </>
                  ) : (
                    <>
                      <Search className="w-4 h-4 stroke-[3]" />
                      <span>SEARCH CODE</span>
                    </>
                  )}
                </button>
              </div>

              {deskSearchError && (
                <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-800 text-xs text-rose-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>{deskSearchError}</span>
                </div>
              )}

              {deskActionSuccess && (
                <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-800 text-xs text-emerald-300 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                  <span>{deskActionSuccess}</span>
                </div>
              )}
            </form>
          </div>

          {/* Search Result: Not Found */}
          {deskSearchNotFound && (
            <div className="p-6 rounded-2xl bg-neutral-950 border border-neutral-800 text-center space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 mx-auto flex items-center justify-center">
                <X className="w-6 h-6 stroke-[3]" />
              </div>
              <h4 className="text-base font-black uppercase tracking-wider text-rose-400">
                ❌ INVALID REDEMPTION CODE
              </h4>
              <p className="text-xs text-neutral-400 max-w-md mx-auto">
                No record exists for this code. Verify the code with the customer.
              </p>
            </div>
          )}

          {/* Search Result: Found Record */}
          {deskSearchedRedemption && (() => {
            const isUsed = deskSearchedRedemption.status === 'USED';
            const isCancelled = deskSearchedRedemption.status === 'CANCELLED';
            const isExpired = deskSearchedRedemption.status === 'EXPIRED' ||
              ((deskSearchedRedemption.status === 'ACTIVE' || deskSearchedRedemption.status === 'APPROVED') &&
                deskSearchedRedemption.expiresAt && Date.now() > deskSearchedRedemption.expiresAt);
            const isActive = (deskSearchedRedemption.status === 'ACTIVE' || deskSearchedRedemption.status === 'APPROVED') && !isExpired;

            return (
              <div className="p-6 rounded-2xl bg-neutral-950 border border-neutral-800 space-y-5 animate-fadeIn">
                {/* Status Banners */}
                {isUsed && (
                  <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-500/50 text-rose-300 flex items-start gap-3">
                    <ShieldAlert className="w-6 h-6 shrink-0 text-rose-400 mt-0.5" />
                    <div className="space-y-1">
                      <div className="text-sm font-black uppercase tracking-wider text-rose-200">
                        🔴 CODE ALREADY USED
                      </div>
                      <div className="text-xs text-neutral-300">
                        Used date/time:{' '}
                        <span className="font-mono font-bold text-white">
                          {deskSearchedRedemption.usedAt ? new Date(deskSearchedRedemption.usedAt).toLocaleString() : 'Previously recorded'}
                        </span>
                      </div>
                      <div className="text-xs text-neutral-300">
                        Staff/Admin who used it:{' '}
                        <span className="font-mono font-bold text-amber-300">
                          {deskSearchedRedemption.usedBy || deskSearchedRedemption.verifiedBy || 'Staff'}
                        </span>
                      </div>
                      <div className="text-[11px] text-rose-400 font-bold uppercase tracking-wider pt-1">
                        Do not fulfill or give another reward for this code.
                      </div>
                    </div>
                  </div>
                )}

                {isCancelled && (
                  <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-500/40 text-amber-300 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 shrink-0 text-amber-400 mt-0.5" />
                    <div>
                      <div className="text-xs font-black uppercase tracking-wider">
                        ⚠️ REDEMPTION CANCELLED
                      </div>
                      <div className="text-xs text-neutral-300 mt-0.5">
                        This redemption was cancelled and refunded. It cannot be used.
                      </div>
                    </div>
                  </div>
                )}

                {isExpired && (
                  <div className="p-4 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-300 flex items-start gap-3">
                    <Clock className="w-5 h-5 shrink-0 text-neutral-400 mt-0.5" />
                    <div>
                      <div className="text-xs font-black uppercase tracking-wider text-neutral-200">
                        ⚠️ REDEMPTION EXPIRED
                      </div>
                      <div className="text-xs text-neutral-400 mt-0.5">
                        This reward pass has expired and cannot be marked as used.
                      </div>
                    </div>
                  </div>
                )}

                {isActive && (
                  <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-500/40 text-emerald-300 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400" />
                      <div>
                        <div className="text-sm font-black uppercase tracking-wider">
                          ✅ VALID REDEMPTION
                        </div>
                        <div className="text-xs text-neutral-300 mt-0.5">
                          Status: <span className="text-emerald-400 font-bold">ACTIVE</span>. Verify details below before fulfilling reward.
                        </div>
                      </div>
                    </div>
                    <span className="px-2.5 py-1 rounded text-[10px] font-mono font-black bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 uppercase shrink-0">
                      🟢 ACTIVE
                    </span>
                  </div>
                )}

                {/* Details Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="p-4 rounded-xl bg-neutral-900/60 border border-neutral-800">
                    <span className="text-[10px] font-mono uppercase text-neutral-500 block mb-1">Customer name</span>
                    <span className="text-sm font-bold text-white block">{deskSearchedRedemption.playerGamerTag}</span>
                  </div>

                  <div className="p-4 rounded-xl bg-neutral-900/60 border border-neutral-800">
                    <span className="text-[10px] font-mono uppercase text-neutral-500 block mb-1">Reward</span>
                    <span className="text-sm font-bold text-white block">{deskSearchedRedemption.rewardTitle}</span>
                  </div>

                  <div className="p-4 rounded-xl bg-neutral-900/60 border border-neutral-800">
                    <span className="text-[10px] font-mono uppercase text-neutral-500 block mb-1">NC cost</span>
                    <span className="text-sm font-mono font-black text-amber-300 block">🪙 {deskSearchedRedemption.coinCost} NC</span>
                  </div>

                  <div className="p-4 rounded-xl bg-neutral-900/60 border border-neutral-800">
                    <span className="text-[10px] font-mono uppercase text-neutral-500 block mb-1">Redemption date</span>
                    <span className="text-xs font-mono text-neutral-300 block">
                      {new Date(deskSearchedRedemption.createdAt).toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Pass Code Badge & Fulfillment Action */}
                <div className="p-4 rounded-xl bg-neutral-900/80 border border-neutral-800 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <QrCode className="w-8 h-8 text-neutral-500 shrink-0" />
                    <div>
                      <div className="text-[10px] font-mono uppercase text-neutral-500">Code • Status: {deskSearchedRedemption.status}</div>
                      <div className="text-xl font-black font-mono tracking-widest text-amber-300">
                        {deskSearchedRedemption.code}
                      </div>
                    </div>
                  </div>

                  {/* Mark as Used Button - only shown if ACTIVE */}
                  {isActive && (
                    <button
                      onClick={() => handleOpenMarkUsedModal(deskSearchedRedemption)}
                      className="w-full sm:w-auto px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase text-xs tracking-wider transition-all shadow-[0_0_15px_rgba(16,185,129,0.3)] flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Check className="w-4 h-4 stroke-[3]" />
                      <span>MARK AS USED</span>
                    </button>
                  )}
                </div>

                {deskSearchedRedemption.terms && (
                  <div className="text-xs text-neutral-400 bg-neutral-900/40 p-3 rounded-xl border border-neutral-800/80">
                    <span className="font-bold text-neutral-300">Terms / Instructions:</span> {deskSearchedRedemption.terms}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* ========================================================
          SUB-TAB 1: NC REDEMPTION OFFERS MANAGEMENT
          ======================================================== */}
      {subTab === 'CATALOG' && (
        <div className="space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-neutral-800 gap-3">
            <div>
              <h3 className="text-base font-black uppercase tracking-wider text-white flex items-center gap-2">
                <Gift className="w-5 h-5 text-amber-400" />
                <span>NC Redemption Offers</span>
              </h3>
              <p className="text-xs text-neutral-400 mt-0.5">
                Authorized Admin/Super Admin interface to create, edit, enable/disable, and remove NC redemption offers.
              </p>
            </div>
            {canManageOffers && (
              <button
                id="add-offer-catalog-btn"
                onClick={handleOpenCreateModal}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black uppercase text-xs tracking-wider transition-all shadow-[0_0_15px_rgba(245,158,11,0.25)] active:scale-95 cursor-pointer self-start sm:self-auto shrink-0"
              >
                <Plus className="w-4 h-4 stroke-[3]" />
                <span>Add Offer</span>
              </button>
            )}
          </div>

          {!canManageOffers ? (
            <div className="p-8 rounded-2xl bg-neutral-950 border border-neutral-800 text-center space-y-2">
              <ShieldAlert className="w-8 h-8 text-amber-500 mx-auto" />
              <h4 className="text-sm font-bold text-white uppercase tracking-wider">Access Restricted</h4>
              <p className="text-xs text-neutral-400 max-w-md mx-auto">
                Staff and visitor accounts are not permitted to manage redemption offers. Front-desk staff can verify and redeem vouchers in the Redeem Desk tab.
              </p>
            </div>
          ) : rewards.length === 0 ? (
            <div className="p-12 text-center border border-dashed border-neutral-800 rounded-2xl bg-neutral-950/60 max-w-lg mx-auto">
              <Gift className="w-12 h-12 text-neutral-600 mx-auto mb-3" />
              <h3 className="text-base font-bold text-white">No Offers Configured</h3>
              <p className="text-xs text-neutral-400 mt-1 mb-4">
                Create new NC redemption offers for FC gameplay or PC station hours.
              </p>
              <button
                onClick={handleOpenCreateModal}
                className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black uppercase text-xs tracking-wider transition-all"
              >
                Add First Offer
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {rewards.map((reward) => {
                const pricing = getEffectiveRewardCost(reward);
                return (
                  <div
                    key={reward.id}
                    className={`p-5 rounded-2xl bg-neutral-950 border transition-all flex flex-col justify-between ${
                      reward.active ? 'border-neutral-800 hover:border-neutral-700' : 'border-neutral-800/60 opacity-75'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-neutral-800 text-neutral-400 uppercase">
                          {reward.category}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            reward.active
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : 'bg-neutral-800 text-neutral-500 border border-neutral-700/60'
                          }`}
                        >
                          {reward.active ? 'ACTIVE' : 'INACTIVE'}
                        </span>
                      </div>

                      <h4 className="text-base font-bold text-white">{reward.title}</h4>
                      <p className="text-xs text-neutral-400 mt-1 line-clamp-2">{reward.description}</p>

                      {/* Pricing Details */}
                      <div className="mt-3 p-3 rounded-xl bg-neutral-900/60 border border-neutral-800 text-xs">
                        <div className="flex justify-between items-center">
                          <span className="text-neutral-400">Offer Cost:</span>
                          <span className="font-mono font-bold text-amber-300">🪙 {reward.coinCost} NC</span>
                        </div>

                        {pricing.hasActiveOffer && (
                          <div className="flex justify-between items-center mt-1 pt-1 border-t border-neutral-800 text-amber-300">
                            <span className="flex items-center gap-1 font-bold">
                              <Flame className="w-3 h-3 text-amber-400" />
                              <span>Flash Offer:</span>
                            </span>
                            <span className="font-mono font-bold">🪙 {pricing.offerPrice} NC</span>
                          </div>
                        )}

                        <div className="flex justify-between items-center mt-1 text-[11px] text-neutral-500">
                          <span>Stock:</span>
                          <span>{reward.availableQuantity ?? 'Unlimited'}</span>
                        </div>

                        <div className="flex justify-between items-center text-[11px] text-neutral-500">
                          <span>Total Claimed:</span>
                          <span>{reward.claimedCount || 0} times</span>
                        </div>
                      </div>
                    </div>

                    {canManageOffers && (
                      <div className="mt-4 pt-3 border-t border-neutral-900 flex items-center justify-between gap-2">
                        <button
                          onClick={() => handleToggleOfferActive(reward)}
                          className={`px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1.5 ${
                            reward.active
                              ? 'bg-neutral-900 hover:bg-neutral-800 text-amber-400 border border-neutral-800'
                              : 'bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-800/60'
                          }`}
                          title={reward.active ? 'Disable Offer' : 'Enable Offer'}
                        >
                          {reward.active ? (
                            <>
                              <X className="w-3.5 h-3.5 text-amber-400" />
                              <span>Disable</span>
                            </>
                          ) : (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                              <span>Enable</span>
                            </>
                          )}
                        </button>

                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleOpenEditModal(reward)}
                            className="p-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-neutral-300 hover:text-white transition-colors cursor-pointer"
                            title="Edit Offer"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleInitiateDeleteReward(reward)}
                            className="p-2 rounded-lg bg-neutral-900 hover:bg-red-950 text-neutral-400 hover:text-red-400 transition-colors cursor-pointer"
                            title="Delete Offer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================
          SUB-TAB 2: REDEMPTION DESK & ACTIVE PASSES
          ======================================================== */}
      {subTab === 'REDEMPTIONS' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-neutral-950 border border-neutral-800">
            <div className="flex items-center gap-2">
              <QrCode className="w-5 h-5 text-amber-400" />
              <div>
                <h3 className="text-sm font-bold text-white">Front Desk Pass Verification</h3>
                <p className="text-[11px] text-neutral-400">
                  Verify redemption pass codes presented by customers at Nexus Gaming Center.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 p-1 rounded-xl bg-neutral-900 border border-neutral-800 text-xs">
                {(['ALL', 'APPROVED', 'USED', 'CANCELLED'] as const).map((st) => (
                  <button
                    key={st}
                    onClick={() => setRedemptionStatusFilter(st)}
                    className={`px-2.5 py-1 rounded-lg font-bold uppercase tracking-wider text-[10px] transition-colors ${
                      redemptionStatusFilter === st
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    {st === 'APPROVED' ? 'READY' : st}
                  </button>
                ))}
              </div>

              <div className="relative min-w-[220px]">
                <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={redemptionSearch}
                  onChange={(e) => setRedemptionSearch(e.target.value)}
                  placeholder="Search code or player..."
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-neutral-500 focus:outline-hidden focus:border-amber-500"
                />
              </div>
            </div>
          </div>

          {/* Redemptions Table */}
          <div className="overflow-x-auto rounded-2xl border border-neutral-800 bg-neutral-950">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-neutral-800 text-[10px] uppercase font-mono text-neutral-500">
                  <th className="py-3 px-4">Pass Code</th>
                  <th className="py-3 px-4">Player GamerTag</th>
                  <th className="py-3 px-4">Reward Title</th>
                  <th className="py-3 px-4">Cost</th>
                  <th className="py-3 px-4">Date Claimed</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Desk Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-900">
                {filteredRedemptions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-neutral-500">
                      No customer redemptions found.
                    </td>
                  </tr>
                ) : (
                  filteredRedemptions.map((red) => {
                    const isApproved = red.status === 'APPROVED';
                    const isUsed = red.status === 'USED';
                    const isCancelled = red.status === 'CANCELLED';
                    const isBusy = deskActionLoadingId === red.id;

                    return (
                      <tr key={red.id} className="hover:bg-neutral-900/40 transition-colors">
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className="font-mono font-black text-sm text-amber-300 px-2 py-1 rounded bg-amber-500/10 border border-amber-500/20">
                            {red.code}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-bold text-white whitespace-nowrap">
                          {red.playerGamerTag}
                        </td>
                        <td className="py-3 px-4 text-neutral-300 max-w-xs truncate">
                          {red.rewardTitle}
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-amber-400 whitespace-nowrap">
                          🪙 {red.coinCost} NC
                        </td>
                        <td className="py-3 px-4 font-mono text-neutral-400 whitespace-nowrap">
                          {new Date(red.createdAt).toLocaleDateString()} {new Date(red.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                              isApproved
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : isUsed
                                ? 'bg-neutral-800 text-neutral-400'
                                : 'bg-rose-950 text-rose-400 border border-rose-900'
                            }`}
                          >
                            {isApproved ? 'READY' : red.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          {isApproved && (
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => handleVerifyAtDesk(red.code)}
                                className="px-2.5 py-1 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-amber-300 border border-neutral-800 text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer"
                                title="Open in Desk Terminal"
                              >
                                <Ticket className="w-3.5 h-3.5" />
                                <span>Desk</span>
                              </button>
                              <button
                                disabled={isBusy}
                                onClick={() => handleOpenMarkUsedModal(red)}
                                className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs uppercase tracking-wider transition-colors flex items-center gap-1 cursor-pointer"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>Mark Used</span>
                              </button>
                              <button
                                disabled={isBusy}
                                onClick={() => handleInitiateCancelRedemption(red)}
                                className="px-2.5 py-1 rounded-lg bg-neutral-900 hover:bg-red-950 text-neutral-400 hover:text-red-400 border border-neutral-800 transition-colors text-xs font-bold cursor-pointer"
                                title="Cancel & Refund"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}

                          {isUsed && (
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => handleVerifyAtDesk(red.code)}
                                className="px-2 py-0.5 rounded text-[10px] font-mono text-neutral-400 hover:text-white bg-neutral-900 border border-neutral-800"
                              >
                                View Record
                              </button>
                              <span className="text-[11px] text-neutral-500 font-mono">
                                Used • {red.usedBy || red.verifiedBy || 'Staff'}
                              </span>
                            </div>
                          )}

                          {isCancelled && (
                            <span className="text-[11px] text-rose-400/80 font-mono">
                              Cancelled & Refunded
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================
          ADD / EDIT REWARD MODAL
          ======================================================== */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-lg bg-neutral-950 border border-neutral-800 rounded-2xl p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <h3 className="text-base font-black uppercase tracking-wider text-white flex items-center gap-2">
                <Coins className="w-4 h-4 text-amber-400" />
                <span>{editingRewardId ? 'Edit NC Redemption Offer' : 'Add New NC Redemption Offer'}</span>
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-neutral-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveReward} className="space-y-4 text-xs">
              <div>
                <label className="font-bold uppercase tracking-wider text-neutral-300 block mb-1">
                  Offer Name *
                </label>
                <input
                  type="text"
                  required
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="e.g. FC 26 / FC 27 — 10 Minutes or PC Gaming — 1 Hour"
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-white placeholder-neutral-500 focus:outline-hidden focus:border-amber-500"
                />
              </div>

              <div>
                <label className="font-bold uppercase tracking-wider text-neutral-300 block mb-1">
                  Description
                </label>
                <textarea
                  rows={2}
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  placeholder="Describe what the player receives upon redemption..."
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-white placeholder-neutral-500 focus:outline-hidden focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold uppercase tracking-wider text-neutral-300 block mb-1">
                    NC Cost * (Positive Integer)
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    required
                    value={formCost}
                    onChange={(e) => setFormCost(parseInt(e.target.value) || 0)}
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 font-mono font-bold text-amber-300 focus:outline-hidden focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="font-bold uppercase tracking-wider text-neutral-300 block mb-1">
                    Category
                  </label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value as FidelityRewardCategory)}
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-white focus:outline-hidden focus:border-amber-500"
                  >
                    <option value="STATION_TIME">Station Time (PC / PS5)</option>
                    <option value="FOOD_BEVERAGE">Food & Beverage</option>
                    <option value="TOURNAMENT">Tournament Entry</option>
                    <option value="SPECIAL">VIP Special</option>
                    <option value="PASS">Pass / Membership</option>
                    <option value="MERCH">Merchandise</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold uppercase tracking-wider text-neutral-300 block mb-1">
                    Associated Game
                  </label>
                  <select
                    value={formGame}
                    onChange={(e) => setFormGame(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-white focus:outline-hidden focus:border-amber-500"
                  >
                    <option value="ALL">All Games / General</option>
                    <option value="FC">FC (EA SPORTS FC)</option>
                    <option value="CHESS">Chess</option>
                    <option value="VALORANT">Valorant</option>
                    <option value="CS2">Counter-Strike 2</option>
                    <option value="LEAGUE_OF_LEGENDS">League of Legends</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold uppercase tracking-wider text-neutral-300 block mb-1">
                    Available Stock (Blank = Unlimited)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formQuantity}
                    onChange={(e) => setFormQuantity(e.target.value)}
                    placeholder="Unlimited"
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-white placeholder-neutral-500 focus:outline-hidden focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold uppercase tracking-wider text-neutral-300 block mb-1">
                  Display Order
                </label>
                <input
                  type="number"
                  min="1"
                  value={formDisplayOrder}
                  onChange={(e) => setFormDisplayOrder(parseInt(e.target.value) || 1)}
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-white focus:outline-hidden focus:border-amber-500"
                />
              </div>

              <div>
                <label className="font-bold uppercase tracking-wider text-neutral-300 block mb-1">
                  Terms & Instructions
                </label>
                <input
                  type="text"
                  value={formTerms}
                  onChange={(e) => setFormTerms(e.target.value)}
                  placeholder="e.g. Valid during standard hours. Present code at Nexus front desk."
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-white placeholder-neutral-500 focus:outline-hidden focus:border-amber-500"
                />
              </div>

              {/* Limited Time Offer Toggle & Options */}
              <div className="p-3.5 rounded-xl bg-neutral-900/60 border border-neutral-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Flame className="w-4 h-4 text-amber-400" />
                    <span className="font-bold text-white uppercase tracking-wider">
                      Limited-Time Flash Offer
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={formHasOffer}
                    onChange={(e) => setFormHasOffer(e.target.checked)}
                    className="w-4 h-4 accent-amber-500 rounded"
                  />
                </div>

                {formHasOffer && (
                  <div className="grid grid-cols-2 gap-3 pt-2 border-t border-neutral-800 animate-fadeIn">
                    <div>
                      <label className="font-bold uppercase text-[10px] text-neutral-400 block mb-1">
                        Discounted Offer Price (NC)
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={formOfferPrice}
                        onChange={(e) => setFormOfferPrice(Math.max(1, parseInt(e.target.value) || 0))}
                        className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-2.5 py-1.5 font-mono font-bold text-amber-300 focus:outline-hidden"
                      />
                    </div>
                    <div>
                      <label className="font-bold uppercase text-[10px] text-neutral-400 block mb-1">
                        Offer Duration (Days)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="90"
                        value={formOfferDays}
                        onChange={(e) => setFormOfferDays(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-white focus:outline-hidden"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="reward-active-toggle"
                  checked={formActive}
                  onChange={(e) => setFormActive(e.target.checked)}
                  className="w-4 h-4 accent-amber-500 rounded"
                />
                <label htmlFor="reward-active-toggle" className="text-neutral-300 font-bold">
                  Reward is Active & Visible in Catalog
                </label>
              </div>

              {formError && (
                <div className="p-3 rounded-lg bg-red-950/60 border border-red-800 text-xs text-red-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="flex items-center gap-3 pt-2 border-t border-neutral-800">
                <button
                  type="button"
                  disabled={formLoading}
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-neutral-300 font-bold uppercase tracking-wider"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black uppercase tracking-wider shadow-[0_0_15px_rgba(245,158,11,0.25)] flex items-center justify-center gap-2"
                >
                  {formLoading ? 'Saving...' : editingRewardId ? 'Update Reward' : 'Create Reward'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* ========================================================
          MARK AS USED CONFIRMATION MODAL
          ======================================================== */}
      {confirmMarkUsedModalOpen && selectedForUsedRedemption && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-md bg-neutral-950 border border-neutral-800 rounded-2xl p-6 shadow-2xl space-y-4 animate-scaleUp">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <Check className="w-5 h-5 stroke-[3]" />
              </div>
              <div>
                <h3 className="text-base font-black uppercase tracking-wider text-white">
                  Confirm Reward Fulfillment
                </h3>
                <p className="text-xs text-neutral-400">Nexus Gaming Center Desk Verification</p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-neutral-900/80 border border-neutral-800 space-y-2 text-xs">
              <p className="text-sm font-bold text-white">
                Confirm that this reward has been given to the customer?
              </p>
              <div className="pt-2 border-t border-neutral-800 space-y-1">
                <div className="flex justify-between text-neutral-400">
                  <span>Customer:</span>
                  <span className="font-bold text-white">{selectedForUsedRedemption.playerGamerTag}</span>
                </div>
                <div className="flex justify-between text-neutral-400">
                  <span>Reward:</span>
                  <span className="font-bold text-amber-300">{selectedForUsedRedemption.rewardTitle}</span>
                </div>
                <div className="flex justify-between text-neutral-400">
                  <span>Pass Code:</span>
                  <span className="font-mono font-bold text-white">{selectedForUsedRedemption.code}</span>
                </div>
              </div>
            </div>

            {markUsedError && (
              <div className="p-3 rounded-xl bg-rose-950/50 border border-rose-800 text-xs text-rose-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{markUsedError}</span>
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                disabled={markUsedLoading}
                onClick={() => {
                  setConfirmMarkUsedModalOpen(false);
                  setSelectedForUsedRedemption(null);
                }}
                className="flex-1 py-2.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-neutral-300 font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer"
              >
                CANCEL
              </button>
              <button
                type="button"
                disabled={markUsedLoading}
                onClick={handleConfirmMarkUsed}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase text-xs tracking-wider transition-all shadow-[0_0_15px_rgba(16,185,129,0.3)] disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
              >
                {markUsedLoading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <span>CONFIRM & MARK AS USED</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          CONFIRM DELETE OFFER MODAL (SAFE SOFT-DELETE)
          ======================================================== */}
      {confirmDeleteReward && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-md bg-neutral-950 border border-neutral-800 rounded-2xl p-6 shadow-2xl space-y-4 animate-scaleUp">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400">
                <Trash2 className="w-5 h-5 stroke-[2.5]" />
              </div>
              <div>
                <h3 className="text-base font-black uppercase tracking-wider text-white">
                  Remove Redemption Offer
                </h3>
                <p className="text-xs text-neutral-400">Admin Offer Management</p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-neutral-900/80 border border-neutral-800 space-y-2 text-xs">
              <p className="text-sm font-bold text-white">
                Are you sure you want to remove this offer?
              </p>
              <p className="text-neutral-400 text-xs">
                It will be safely deactivated and removed from the active catalogue so historical player redemptions remain valid.
              </p>
              <div className="pt-2 border-t border-neutral-800 space-y-1">
                <div className="flex justify-between text-neutral-400">
                  <span>Offer Name:</span>
                  <span className="font-bold text-white">{confirmDeleteReward.title}</span>
                </div>
                <div className="flex justify-between text-neutral-400">
                  <span>Cost:</span>
                  <span className="font-bold text-amber-300">🪙 {confirmDeleteReward.coinCost} NC</span>
                </div>
              </div>
            </div>

            {deleteError && (
              <div className="p-3 rounded-xl bg-rose-950/50 border border-rose-800 text-xs text-rose-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{deleteError}</span>
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                disabled={deleteLoading}
                onClick={() => {
                  setConfirmDeleteReward(null);
                  setDeleteError(null);
                }}
                className="flex-1 py-2.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-neutral-300 font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer"
              >
                CANCEL
              </button>
              <button
                type="button"
                disabled={deleteLoading}
                onClick={handleConfirmDeleteReward}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black uppercase text-xs tracking-wider transition-all shadow-[0_0_15px_rgba(244,63,94,0.3)] disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
              >
                {deleteLoading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Removing...</span>
                  </>
                ) : (
                  <span>CONFIRM REMOVAL</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          CONFIRM CANCEL & REFUND REDEMPTION MODAL
          ======================================================== */}
      {confirmCancelRedemption && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-md bg-neutral-950 border border-neutral-800 rounded-2xl p-6 shadow-2xl space-y-4 animate-scaleUp">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <RotateCcw className="w-5 h-5 stroke-[2.5]" />
              </div>
              <div>
                <h3 className="text-base font-black uppercase tracking-wider text-white">
                  Cancel & Refund Redemption
                </h3>
                <p className="text-xs text-neutral-400">Desk Terminal Operation</p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-neutral-900/80 border border-neutral-800 space-y-2 text-xs">
              <p className="text-sm font-bold text-white">
                Cancelling this redemption will immediately refund the coins back to the player wallet.
              </p>
              <div className="pt-2 border-t border-neutral-800 space-y-1">
                <div className="flex justify-between text-neutral-400">
                  <span>Player:</span>
                  <span className="font-bold text-white">{confirmCancelRedemption.playerGamerTag}</span>
                </div>
                <div className="flex justify-between text-neutral-400">
                  <span>Reward:</span>
                  <span className="font-bold text-amber-300">{confirmCancelRedemption.rewardTitle}</span>
                </div>
                <div className="flex justify-between text-neutral-400">
                  <span>Refund Amount:</span>
                  <span className="font-mono font-bold text-amber-400">🪙 {confirmCancelRedemption.coinCost} NC</span>
                </div>
                <div className="flex justify-between text-neutral-400">
                  <span>Code:</span>
                  <span className="font-mono font-bold text-white">{confirmCancelRedemption.code}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                disabled={Boolean(deskActionLoadingId)}
                onClick={() => setConfirmCancelRedemption(null)}
                className="flex-1 py-2.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-neutral-300 font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer"
              >
                ABORT
              </button>
              <button
                type="button"
                disabled={Boolean(deskActionLoadingId)}
                onClick={handleConfirmCancelRedemption}
                className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black uppercase text-xs tracking-wider transition-all shadow-[0_0_15px_rgba(245,158,11,0.3)] disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
              >
                {deskActionLoadingId ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Processing Refund...</span>
                  </>
                ) : (
                  <span>CONFIRM & REFUND</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
