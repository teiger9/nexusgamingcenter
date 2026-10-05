import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  verifyRedemptionByCode,
  markRedemptionAsUsed,
  subscribeToAllRedemptions,
  normalizeRedemptionCode,
} from '../services/coinRewardService';
import { RewardRedemption } from '../types';
import {
  KeyRound,
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  User,
  Gift,
  Coins,
  QrCode,
  ShieldCheck,
  History,
  Sparkles,
  RefreshCw,
  Copy,
  Check,
} from 'lucide-react';

export const AdminRewardRedemptionsView: React.FC = () => {
  const { user, playerProfile } = useAuth();

  const [inputCode, setInputCode] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchedRedemption, setSearchedRedemption] = useState<RewardRedemption | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchQueryUsed, setSearchQueryUsed] = useState('');

  // Confirmation modal state
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Live recent redemptions log
  const [recentRedemptions, setRecentRedemptions] = useState<RewardRedemption[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(true);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Subscribe to real-time redemptions so staff has an overview of all active & fulfilled passes
  useEffect(() => {
    const unsub = subscribeToAllRedemptions((list) => {
      setRecentRedemptions(list);
      setLoadingRecent(false);

      // If we have an active search result, keep it updated in real-time
      if (searchedRedemption) {
        const updated = list.find((r) => r.id === searchedRedemption.id);
        if (updated) {
          setSearchedRedemption(updated);
        }
      }
    });

    return () => unsub();
  }, [searchedRedemption?.id]);

  const handleSearchCode = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const query = inputCode.trim();
    if (!query) return;

    setIsSearching(true);
    setHasSearched(true);
    setSearchQueryUsed(query);
    setActionSuccessMessage(null);
    setErrorMessage(null);

    try {
      const result = await verifyRedemptionByCode(query);
      setSearchedRedemption(result);
    } catch (err: any) {
      console.error('Error verifying code:', err);
      setSearchedRedemption(null);
      setErrorMessage(err.message || 'Error occurred while looking up code.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleOpenConfirmModal = () => {
    if (!searchedRedemption) return;
    setConfirmModalOpen(true);
  };

  const handleConfirmMarkAsUsed = async () => {
    if (!searchedRedemption || !user) return;

    setIsProcessing(true);
    setErrorMessage(null);

    const staffUid = user.uid;
    const staffName = playerProfile?.gamerTag || user.email || 'Admin Staff';

    try {
      const res = await markRedemptionAsUsed(
        searchedRedemption.id,
        staffUid,
        `Fulfilled at front desk by ${staffName}`,
        {
          expectedCode: searchedRedemption.code,
          adminName: staffName,
        }
      );

      if (res.success) {
        setActionSuccessMessage(`REWARD SUCCESSFULLY USED\n${searchedRedemption.code}`);
        setConfirmModalOpen(false);

        // Update local state to show USED
        setSearchedRedemption((prev) =>
          prev
            ? {
                ...prev,
                status: 'USED',
                usedAt: Date.now(),
                usedBy: staffUid,
                verifiedBy: staffName,
              }
            : null
        );
      } else {
        setErrorMessage(res.error || 'Failed to mark redemption as used.');
      }
    } catch (err: any) {
      console.error('Error marking as used:', err);
      setErrorMessage(err.message || 'Error updating redemption status.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleQuickFillCode = (code: string) => {
    setInputCode(code);
    setIsSearching(true);
    setHasSearched(true);
    setSearchQueryUsed(code);
    setActionSuccessMessage(null);
    setErrorMessage(null);

    verifyRedemptionByCode(code)
      .then((res) => setSearchedRedemption(res))
      .catch((err) => {
        console.error(err);
        setSearchedRedemption(null);
      })
      .finally(() => setIsSearching(false));
  };

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const activeRedemptionsCount = recentRedemptions.filter(
    (r) => r.status === 'ACTIVE' || r.status === 'APPROVED'
  ).length;
  const usedRedemptionsCount = recentRedemptions.filter((r) => r.status === 'USED').length;

  return (
    <div className="space-y-8 max-w-5xl mx-auto py-2 animate-fadeIn">
      {/* Header Banner */}
      <div className="p-6 rounded-3xl bg-gradient-to-r from-neutral-950 via-neutral-900 to-neutral-950 border border-neutral-800 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono font-bold">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>FRONT DESK FULFILLMENT TERMINAL</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center gap-3">
              <span>🎁</span>
              <span>Reward Redemptions</span>
            </h1>
            <p className="text-xs text-neutral-400 max-w-2xl">
              Verify and fulfill customer reward redemption codes generated through the Nexus Fidelity Card & Rewards Catalog.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="px-4 py-2 rounded-2xl bg-neutral-900 border border-neutral-800 text-center">
              <span className="text-[10px] font-mono uppercase text-neutral-400 block">Active Passes</span>
              <span className="text-xl font-black font-mono text-emerald-400">{activeRedemptionsCount}</span>
            </div>
            <div className="px-4 py-2 rounded-2xl bg-neutral-900 border border-neutral-800 text-center">
              <span className="text-[10px] font-mono uppercase text-neutral-400 block">Fulfilled</span>
              <span className="text-xl font-black font-mono text-neutral-300">{usedRedemptionsCount}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================
          PROMINENT SECTION: 🔑 USE CUSTOMER REDEMPTION CODE
          ======================================================== */}
      <div className="p-6 sm:p-8 rounded-3xl bg-[#0a0a0f] border-2 border-emerald-500/40 shadow-[0_0_35px_rgba(16,185,129,0.12)] space-y-6">
        <div className="flex items-center justify-between border-b border-neutral-800/80 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shadow-md">
              <KeyRound className="w-6 h-6 stroke-[2.5]" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-black uppercase tracking-wider text-white flex items-center gap-2">
                <span>🔑</span>
                <span>USE CUSTOMER REDEMPTION CODE</span>
              </h2>
              <p className="text-xs text-neutral-400 mt-0.5">
                Type or paste the redemption code presented by the customer on their phone or loyalty card.
              </p>
            </div>
          </div>
        </div>

        {/* Search Input Form */}
        <form onSubmit={handleSearchCode} className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-neutral-300 mb-2">
              Enter Redemption Code
            </label>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={inputCode}
                  onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                  placeholder="NEXUS-8UT7D"
                  className="w-full pl-5 pr-12 py-4 rounded-2xl bg-neutral-950 border-2 border-neutral-800 focus:border-emerald-500 text-white font-mono text-lg tracking-widest uppercase transition-all shadow-inner placeholder:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
                {inputCode && (
                  <button
                    type="button"
                    onClick={() => {
                      setInputCode('');
                      setHasSearched(false);
                      setSearchedRedemption(null);
                      setActionSuccessMessage(null);
                      setErrorMessage(null);
                    }}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white transition-colors cursor-pointer text-xs font-bold px-2 py-1"
                  >
                    CLEAR
                  </button>
                )}
              </div>

              <button
                type="submit"
                disabled={isSearching || !inputCode.trim()}
                className="px-8 py-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:hover:bg-emerald-500 text-neutral-950 font-black text-sm tracking-wider uppercase transition-all shadow-[0_0_20px_rgba(16,185,129,0.35)] flex items-center justify-center gap-2 cursor-pointer active:scale-95 shrink-0"
              >
                {isSearching ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin" />
                    <span>CHECKING...</span>
                  </>
                ) : (
                  <>
                    <Search className="w-5 h-5 stroke-[3]" />
                    <span>CHECK CODE</span>
                  </>
                )}
              </button>
            </div>
            <p className="text-[11px] text-neutral-500 font-mono mt-2">
              Accepts full code (e.g. <span className="text-amber-400">NEXUS-8UT7D</span>) or shorthand alphanumeric key (e.g. <span className="text-amber-400">8UT7D</span>).
            </p>
          </div>
        </form>

        {/* Global Error Banner */}
        {errorMessage && (
          <div className="p-4 rounded-2xl bg-rose-950/40 border border-rose-500/50 text-rose-300 flex items-center gap-3 animate-fadeIn">
            <XCircle className="w-5 h-5 text-rose-400 shrink-0" />
            <span className="text-xs font-bold">{errorMessage}</span>
          </div>
        )}

        {/* Success Banner */}
        {actionSuccessMessage && (
          <div className="p-6 rounded-2xl bg-emerald-950/40 border-2 border-emerald-500/60 text-emerald-200 text-center space-y-2 animate-fadeIn shadow-[0_0_25px_rgba(16,185,129,0.2)]">
            <div className="w-12 h-12 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mx-auto text-xl font-black">
              ✅
            </div>
            <div className="text-base font-black tracking-wider uppercase text-emerald-300">
              REWARD SUCCESSFULLY USED
            </div>
            <div className="text-2xl font-black font-mono tracking-widest text-white">
              {actionSuccessMessage.split('\n')[1] || actionSuccessMessage}
            </div>
            <p className="text-xs text-neutral-300">
              This reward has been marked as fulfilled in the system and cannot be reused.
            </p>
          </div>
        )}

        {/* ========================================================
            SEARCH RESULTS CARD
            ======================================================== */}
        {hasSearched && !isSearching && (
          <div className="pt-2">
            {!searchedRedemption ? (
              /* ========================================================
                 STATE 1: INVALID CODE
                 ======================================================== */
              <div className="p-8 rounded-2xl bg-rose-950/20 border border-rose-500/40 text-center space-y-3 animate-fadeIn">
                <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 mx-auto flex items-center justify-center">
                  <XCircle className="w-8 h-8 stroke-[2.5]" />
                </div>
                <h3 className="text-lg font-black uppercase tracking-wider text-rose-400">
                  ❌ INVALID REDEMPTION CODE
                </h3>
                <p className="text-xs text-neutral-300 max-w-md mx-auto">
                  No record exists for code <span className="font-mono font-bold text-white bg-neutral-900 px-2 py-0.5 rounded border border-neutral-700">{searchQueryUsed}</span>. Verify the code with the customer.
                </p>
              </div>
            ) : (
              (() => {
                const isUsed = searchedRedemption.status === 'USED';
                const isCancelled = searchedRedemption.status === 'CANCELLED';
                const isExpired =
                  searchedRedemption.status === 'EXPIRED' ||
                  ((searchedRedemption.status === 'ACTIVE' || searchedRedemption.status === 'APPROVED') &&
                    searchedRedemption.expiresAt &&
                    Date.now() > searchedRedemption.expiresAt);
                const isActive =
                  (searchedRedemption.status === 'ACTIVE' || searchedRedemption.status === 'APPROVED') &&
                  !isExpired;

                const formattedDate = new Date(searchedRedemption.createdAt).toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                });

                return (
                  <div className="p-6 sm:p-7 rounded-2xl bg-neutral-950 border border-neutral-800 space-y-6 animate-fadeIn">
                    {/* Status Header Banner */}
                    {isActive && (
                      <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/50 text-emerald-300 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <CheckCircle2 className="w-6 h-6 shrink-0 text-emerald-400" />
                          <div>
                            <div className="text-sm font-black uppercase tracking-wider text-emerald-300">
                              ✅ VALID REDEMPTION
                            </div>
                            <div className="text-xs text-neutral-300 mt-0.5">
                              Status is verified as <strong className="text-emerald-400 font-mono">ACTIVE</strong>. Verify customer details and proceed to fulfill.
                            </div>
                          </div>
                        </div>
                        <span className="px-3 py-1 rounded-full text-xs font-mono font-black bg-emerald-500 text-neutral-950 shrink-0">
                          🟢 ACTIVE
                        </span>
                      </div>
                    )}

                    {isUsed && (
                      /* ========================================================
                         STATE 2: ALREADY USED
                         ======================================================== */
                      <div className="p-5 rounded-xl bg-rose-950/40 border border-rose-500/50 text-rose-300 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">🔴</span>
                          <span className="text-sm font-black uppercase tracking-wider text-rose-200">
                            REWARD ALREADY USED
                          </span>
                        </div>
                        <div className="text-xs text-neutral-300 space-y-1 font-mono pt-1">
                          <div>
                            <span className="text-neutral-400">Used date/time:</span>{' '}
                            <span className="text-white font-bold">
                              {searchedRedemption.usedAt
                                ? new Date(searchedRedemption.usedAt).toLocaleString()
                                : 'Recorded'}
                            </span>
                          </div>
                          <div>
                            <span className="text-neutral-400">Staff/Admin who used it:</span>{' '}
                            <span className="text-amber-300 font-bold">
                              {searchedRedemption.usedBy || searchedRedemption.verifiedBy || 'Admin Staff'}
                            </span>
                          </div>
                        </div>
                        <div className="text-[11px] text-rose-400 font-bold uppercase tracking-wider pt-2">
                          ⚠️ Do not fulfill or give another reward for this code.
                        </div>
                      </div>
                    )}

                    {isCancelled && (
                      /* ========================================================
                         STATE 3: CANCELLED
                         ======================================================== */
                      <div className="p-5 rounded-xl bg-amber-950/40 border border-amber-500/50 text-amber-300 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">⚠️</span>
                          <span className="text-sm font-black uppercase tracking-wider text-amber-200">
                            REDEMPTION NOT AVAILABLE
                          </span>
                        </div>
                        <p className="text-xs text-neutral-300">
                          This redemption was cancelled and NC coins refunded. It cannot be used.
                        </p>
                      </div>
                    )}

                    {isExpired && (
                      /* ========================================================
                         STATE 4: EXPIRED
                         ======================================================== */
                      <div className="p-5 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-300 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">⚠️</span>
                          <span className="text-sm font-black uppercase tracking-wider text-neutral-200">
                            REDEMPTION NOT AVAILABLE
                          </span>
                        </div>
                        <p className="text-xs text-neutral-400">
                          This reward pass has expired and can no longer be redeemed.
                        </p>
                      </div>
                    )}

                    {/* Customer & Reward Card (Exact fields as requested) */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {/* Customer */}
                      <div className="p-4 rounded-xl bg-neutral-900/80 border border-neutral-800 space-y-1">
                        <span className="text-[10px] font-mono uppercase text-neutral-400 block">Customer</span>
                        <div className="text-base font-black text-white flex items-center gap-2">
                          <User className="w-4 h-4 text-cyan-400" />
                          <span>{searchedRedemption.playerGamerTag}</span>
                        </div>
                      </div>

                      {/* Reward */}
                      <div className="p-4 rounded-xl bg-neutral-900/80 border border-neutral-800 space-y-1">
                        <span className="text-[10px] font-mono uppercase text-neutral-400 block">Reward</span>
                        <div className="text-base font-black text-white flex items-center gap-2">
                          <Gift className="w-4 h-4 text-amber-400" />
                          <span>{searchedRedemption.rewardTitle}</span>
                        </div>
                      </div>

                      {/* NC Cost */}
                      <div className="p-4 rounded-xl bg-neutral-900/80 border border-neutral-800 space-y-1">
                        <span className="text-[10px] font-mono uppercase text-neutral-400 block">NC Cost</span>
                        <div className="text-base font-black font-mono text-amber-300 flex items-center gap-2">
                          <Coins className="w-4 h-4 text-amber-400" />
                          <span>{searchedRedemption.coinCost} NC</span>
                        </div>
                      </div>

                      {/* Code */}
                      <div className="p-4 rounded-xl bg-neutral-900/80 border border-neutral-800 space-y-1">
                        <span className="text-[10px] font-mono uppercase text-neutral-400 block">Code</span>
                        <div className="text-xl font-black font-mono tracking-widest text-amber-300 flex items-center justify-between">
                          <span>{searchedRedemption.code}</span>
                          <button
                            type="button"
                            onClick={() => handleCopy(searchedRedemption.code)}
                            className="text-neutral-500 hover:text-white transition-colors cursor-pointer"
                            title="Copy code"
                          >
                            {copiedCode === searchedRedemption.code ? (
                              <Check className="w-4 h-4 text-emerald-400" />
                            ) : (
                              <Copy className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Redeemed */}
                      <div className="p-4 rounded-xl bg-neutral-900/80 border border-neutral-800 space-y-1">
                        <span className="text-[10px] font-mono uppercase text-neutral-400 block">Redeemed</span>
                        <div className="text-sm font-black font-mono text-neutral-200 flex items-center gap-2">
                          <Clock className="w-4 h-4 text-neutral-400" />
                          <span>{formattedDate}</span>
                        </div>
                      </div>

                      {/* Status */}
                      <div className="p-4 rounded-xl bg-neutral-900/80 border border-neutral-800 space-y-1">
                        <span className="text-[10px] font-mono uppercase text-neutral-400 block">Status</span>
                        <div className="text-sm font-black font-mono flex items-center gap-1.5">
                          {isActive ? (
                            <span className="text-emerald-400">🟢 ACTIVE</span>
                          ) : isUsed ? (
                            <span className="text-rose-400">🔴 USED</span>
                          ) : (
                            <span className="text-amber-400">⚠️ {searchedRedemption.status}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Action Button: ONLY show MARK REWARD AS USED if valid and ACTIVE */}
                    {isActive && (
                      <div className="pt-2">
                        <button
                          type="button"
                          onClick={handleOpenConfirmModal}
                          className="w-full py-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-black text-sm uppercase tracking-wider shadow-[0_0_25px_rgba(16,185,129,0.35)] flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-98"
                        >
                          <span className="text-lg">🎁</span>
                          <span>MARK REWARD AS USED</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })()
            )}
          </div>
        )}
      </div>

      {/* ========================================================
          RECENT REDEMPTIONS & QUICK ACCESS LOG
          ======================================================== */}
      <div className="p-6 rounded-3xl bg-neutral-950 border border-neutral-800 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-amber-400" />
            <h3 className="text-sm font-black uppercase tracking-wider text-white">
              Recent Player Redemptions
            </h3>
          </div>
          <span className="text-xs font-mono text-neutral-400">
            {recentRedemptions.length} total recorded
          </span>
        </div>

        {loadingRecent ? (
          <div className="py-12 text-center text-xs text-neutral-500 font-mono">
            Loading recent redemptions...
          </div>
        ) : recentRedemptions.length === 0 ? (
          <div className="py-10 text-center text-xs text-neutral-500">
            No player reward redemptions recorded yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-900/60 text-neutral-400 font-mono uppercase text-[10px] border-b border-neutral-800">
                <tr>
                  <th className="py-3 px-4">Code</th>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Reward</th>
                  <th className="py-3 px-4">NC Cost</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-900">
                {recentRedemptions.slice(0, 15).map((item) => {
                  const isActive = item.status === 'ACTIVE' || item.status === 'APPROVED';
                  const isUsed = item.status === 'USED';

                  return (
                    <tr key={item.id} className="hover:bg-neutral-900/40 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-amber-300">
                        {item.code}
                      </td>
                      <td className="py-3 px-4 font-medium text-white">
                        {item.playerGamerTag}
                      </td>
                      <td className="py-3 px-4 text-neutral-300">
                        {item.rewardTitle}
                      </td>
                      <td className="py-3 px-4 font-mono text-amber-400">
                        {item.coinCost} NC
                      </td>
                      <td className="py-3 px-4 font-mono text-neutral-400 text-[11px]">
                        {new Date(item.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-mono font-black ${
                            isActive
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                              : isUsed
                              ? 'bg-neutral-800 text-neutral-400'
                              : 'bg-rose-950/40 text-rose-300'
                          }`}
                        >
                          {isActive ? '🟢 ACTIVE' : isUsed ? '🔴 USED' : item.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => handleQuickFillCode(item.code)}
                          className="px-3 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-[11px] font-bold transition-colors cursor-pointer"
                        >
                          Select
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ========================================================
          CONFIRMATION MODAL
          ======================================================== */}
      {confirmModalOpen && searchedRedemption && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-md bg-neutral-950 border-2 border-emerald-500/60 rounded-3xl p-6 sm:p-7 shadow-2xl space-y-5 animate-scaleUp">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mx-auto text-2xl">
              🎁
            </div>

            <div className="text-center space-y-2">
              <h3 className="text-xl font-black uppercase tracking-wider text-white">
                Confirm Reward
              </h3>
              <p className="text-sm text-neutral-300">
                Are you sure you have given this reward to the customer?
              </p>
            </div>

            {/* Redemption Summary inside Modal */}
            <div className="p-4 rounded-2xl bg-neutral-900 border border-neutral-800 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-neutral-400">Customer:</span>
                <span className="font-bold text-white">{searchedRedemption.playerGamerTag}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-400">Reward:</span>
                <span className="font-bold text-amber-300">{searchedRedemption.rewardTitle}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-400">Code:</span>
                <span className="font-mono font-bold text-white">{searchedRedemption.code}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-400">Cost:</span>
                <span className="font-mono text-amber-400">{searchedRedemption.coinCost} NC</span>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                disabled={isProcessing}
                onClick={() => setConfirmModalOpen(false)}
                className="flex-1 py-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer"
              >
                CANCEL
              </button>
              <button
                type="button"
                disabled={isProcessing}
                onClick={handleConfirmMarkAsUsed}
                className="flex-1 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-neutral-950 font-black text-xs uppercase tracking-wider transition-all shadow-[0_0_15px_rgba(16,185,129,0.35)] flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {isProcessing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
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
    </div>
  );
};
