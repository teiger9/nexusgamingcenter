import React, { useState } from 'react';
import { RewardRedemption, Player } from '../../types';
import {
  verifyRedemptionByCode,
  markRedemptionAsUsed,
  normalizeRedemptionCode,
} from '../../services/coinRewardService';
import {
  Gift,
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Coins,
  User,
  Shield,
  Tag,
  ArrowRight,
} from 'lucide-react';

interface StaffRewardsTabProps {
  redemptions: RewardRedemption[];
  staffPlayer: Player;
}

export const StaffRewardsTab: React.FC<StaffRewardsTabProps> = ({
  redemptions,
  staffPlayer,
}) => {
  const [inputCode, setInputCode] = useState('');
  const [checking, setChecking] = useState(false);
  const [checkedRedemption, setCheckedRedemption] = useState<RewardRedemption | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);

  // Use confirmation modal state
  const [showConfirmUseModal, setShowConfirmUseModal] = useState(false);
  const [useNotes, setUseNotes] = useState('');
  const [submittingUse, setSubmittingUse] = useState(false);
  const [useSuccessMsg, setUseSuccessMsg] = useState<string | null>(null);
  const [useErrorMsg, setUseErrorMsg] = useState<string | null>(null);

  // Status filter for recent redemptions list
  const [recentFilter, setRecentFilter] = useState<'ALL' | 'ACTIVE' | 'USED'>('ALL');

  const handleCheckCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputCode.trim()) return;

    setChecking(true);
    setCheckError(null);
    setCheckedRedemption(null);
    setUseSuccessMsg(null);
    setUseErrorMsg(null);

    try {
      const code = normalizeRedemptionCode(inputCode);
      const res = await verifyRedemptionByCode(code);
      if (!res) {
        setCheckError('INVALID OR UNKNOWN CODE. Please verify the code entered.');
      } else {
        setCheckedRedemption(res);
      }
    } catch (err: any) {
      console.error('Error verifying code:', err);
      setCheckError(err.message || 'Verification failed');
    } finally {
      setChecking(false);
    }
  };

  const handleConfirmUse = async () => {
    if (!checkedRedemption) return;
    setSubmittingUse(true);
    setUseErrorMsg(null);

    try {
      const res = await markRedemptionAsUsed(
        checkedRedemption.id,
        staffPlayer.uid,
        useNotes.trim() || undefined,
        {
          expectedCode: checkedRedemption.code || checkedRedemption.redemptionCode,
          adminName: staffPlayer.gamerTag,
        }
      );

      if (!res.success) {
        throw new Error(res.error || 'Failed to mark redemption as used.');
      }

      setUseSuccessMsg(`Reward voucher "${checkedRedemption.rewardTitle}" marked as USED successfully.`);
      setShowConfirmUseModal(false);
      setUseNotes('');

      // Refresh checked redemption view
      setCheckedRedemption({
        ...checkedRedemption,
        status: 'USED',
        usedAt: Date.now(),
        verifiedByAdminName: staffPlayer.gamerTag,
      });
    } catch (err: any) {
      console.error('Error marking reward as used:', err);
      setUseErrorMsg(err.message || 'Operation failed');
    } finally {
      setSubmittingUse(false);
    }
  };

  const filteredRecentRedemptions = redemptions.filter((r) => {
    if (recentFilter !== 'ALL' && r.status !== recentFilter) return false;
    return true;
  });

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#0b0e14] border border-slate-800 rounded-2xl p-5">
        <div>
          <h3 className="text-base font-bold text-white uppercase tracking-wider flex items-center gap-2 font-display">
            <Gift className="w-5 h-5 text-amber-500" />
            <span>Customer Reward Code Validator</span>
          </h3>
          <p className="text-xs text-slate-400">
            Verify & redeem Nexus loyalty cards, drink vouchers, and free gaming hours
          </p>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-400">
          <Shield className="w-3.5 h-3.5 text-amber-400" />
          <span>Operational Validator • Coins are never deducted twice upon consumption</span>
        </div>
      </div>

      {useSuccessMsg && (
        <div className="p-3 bg-emerald-950/40 border border-emerald-500/50 rounded-xl text-xs text-emerald-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{useSuccessMsg}</span>
          </div>
          <button onClick={() => setUseSuccessMsg(null)} className="text-emerald-400 hover:text-white">✕</button>
        </div>
      )}

      {useErrorMsg && (
        <div className="p-3 bg-red-950/40 border border-red-500/50 rounded-xl text-xs text-red-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{useErrorMsg}</span>
          </div>
          <button onClick={() => setUseErrorMsg(null)} className="text-red-400 hover:text-white">✕</button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Code Verification Panel */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-[#0b0e14] border border-slate-800 rounded-2xl p-5 space-y-4">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Search className="w-4 h-4 text-amber-400" />
              <span>Validate Customer Code</span>
            </h4>

            <form onSubmit={handleCheckCode} className="space-y-3">
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">
                  Redemption Code (e.g. NEXUS-XXXXX or XXXXX)
                </label>
                <div className="relative">
                  <Tag className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                  <input
                    type="text"
                    required
                    value={inputCode}
                    onChange={(e) => setInputCode(e.target.value)}
                    placeholder="NEXUS-8UT7D"
                    className="w-full bg-[#121620] border border-slate-700 rounded-xl pl-9 pr-3 py-2.5 text-sm font-mono text-white uppercase tracking-wider focus:outline-none focus:border-amber-500 placeholder:text-slate-600"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={checking || !inputCode.trim()}
                className="w-full py-2.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-neutral-950 font-black font-display text-xs uppercase tracking-wider rounded-xl transition-all shadow-[0_0_20px_rgba(245,158,11,0.4)] flex items-center justify-center gap-2 cursor-pointer"
              >
                {checking ? (
                  <div className="w-4 h-4 border-2 border-neutral-950 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Search className="w-4 h-4" />
                )}
                <span>Check Code</span>
              </button>
            </form>

            {checkError && (
              <div className="p-3 bg-red-950/40 border border-red-500/50 rounded-xl text-xs text-red-200 flex items-center gap-2">
                <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                <span>{checkError}</span>
              </div>
            )}
          </div>

          {/* Validation Result Box */}
          {checkedRedemption && (
            <div className={`border rounded-2xl p-5 space-y-4 ${
              checkedRedemption.status === 'ACTIVE'
                ? 'bg-emerald-950/20 border-emerald-500/50 shadow-[0_0_25px_rgba(16,185,129,0.2)]'
                : 'bg-slate-900/50 border-slate-800'
            }`}>
              {/* Status Header */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-slate-400">
                  {checkedRedemption.code || checkedRedemption.redemptionCode}
                </span>

                {checkedRedemption.status === 'ACTIVE' ? (
                  <span className="px-2.5 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded-full text-xs font-bold font-mono flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    VALID REDEMPTION
                  </span>
                ) : checkedRedemption.status === 'USED' ? (
                  <span className="px-2.5 py-1 bg-slate-800 text-slate-400 border border-slate-700 rounded-full text-xs font-bold font-mono">
                    ALREADY USED
                  </span>
                ) : (
                  <span className="px-2.5 py-1 bg-red-950/40 text-red-400 border border-red-500/30 rounded-full text-xs font-bold font-mono">
                    {checkedRedemption.status}
                  </span>
                )}
              </div>

              {/* Reward Details */}
              <div className="space-y-2">
                <h4 className="text-sm font-bold text-white font-display">
                  {checkedRedemption.rewardTitle}
                </h4>
                {checkedRedemption.rewardDescription && (
                  <p className="text-xs text-slate-400">
                    {checkedRedemption.rewardDescription}
                  </p>
                )}

                <div className="p-3 bg-[#0b0e14] border border-slate-800 rounded-xl space-y-1.5 text-xs text-slate-300 font-mono">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Customer:</span>
                    <span className="font-bold text-white">{checkedRedemption.gamerTag}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Coins Deducted:</span>
                    <span className="text-amber-400 font-bold flex items-center gap-1">
                      <Coins className="w-3 h-3" />
                      {checkedRedemption.coinCost || 0} Coins
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Redeemed On:</span>
                    <span>{new Date(checkedRedemption.createdAt).toLocaleString()}</span>
                  </div>
                  {checkedRedemption.usedAt && (
                    <div className="flex items-center justify-between text-slate-400 pt-1 border-t border-slate-800">
                      <span>Consumed At:</span>
                      <span>{new Date(checkedRedemption.usedAt).toLocaleString()}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Button */}
              {checkedRedemption.status === 'ACTIVE' ? (
                <button
                  type="button"
                  onClick={() => setShowConfirmUseModal(true)}
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black font-display text-xs uppercase tracking-wider rounded-xl transition-all shadow-[0_0_20px_rgba(16,185,129,0.4)] flex items-center justify-center gap-2 cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Use Reward Pass</span>
                </button>
              ) : (
                <div className="p-2.5 bg-slate-900 border border-slate-800 rounded-xl text-center text-xs text-slate-500 font-mono">
                  This voucher is no longer active.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Column: Recent Redemptions Table */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-[#0b0e14] border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Clock className="w-4 h-4 text-cyan-400" />
                <span>Recent Redemptions Log ({filteredRecentRedemptions.length})</span>
              </h4>

              <div className="flex rounded-xl bg-[#121620] p-1 border border-slate-800">
                <button
                  onClick={() => setRecentFilter('ALL')}
                  className={`px-3 py-1 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${
                    recentFilter === 'ALL' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setRecentFilter('ACTIVE')}
                  className={`px-3 py-1 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${
                    recentFilter === 'ACTIVE' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Active
                </button>
                <button
                  onClick={() => setRecentFilter('USED')}
                  className={`px-3 py-1 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${
                    recentFilter === 'USED' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Used
                </button>
              </div>
            </div>

            {filteredRecentRedemptions.length === 0 ? (
              <div className="py-16 text-center text-slate-500">
                <Gift className="w-10 h-10 mx-auto mb-2 text-slate-600 opacity-50" />
                <p className="text-sm font-medium">No activity yet</p>
                <p className="text-xs mt-1 text-slate-600">No reward redemptions found for this filter.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-800/60 max-h-[500px] overflow-y-auto pr-1">
                {filteredRecentRedemptions.map((red) => {
                  return (
                    <div
                      key={red.id}
                      className="py-3 px-2 flex items-center justify-between hover:bg-[#121620]/50 rounded-xl transition-colors"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-white">{red.rewardTitle}</span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#121620] text-amber-300 border border-slate-700">
                            {red.code || red.redemptionCode}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-slate-400 font-mono">
                          <span className="text-slate-300">{red.gamerTag}</span>
                          <span>•</span>
                          <span>{red.coinCost || 0} Coins</span>
                          <span>•</span>
                          <span>{new Date(red.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {red.status === 'ACTIVE' ? (
                          <button
                            onClick={() => {
                              setCheckedRedemption(red);
                              setInputCode(red.code || red.redemptionCode || '');
                            }}
                            className="px-3 py-1 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 text-xs font-bold rounded-lg transition-colors"
                          >
                            Validate
                          </button>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-800 text-slate-400 border border-slate-700">
                            {red.status}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Confirmation Modal to Mark as USED */}
      {showConfirmUseModal && checkedRedemption && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#0b0e14] border border-emerald-500/40 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-600/20 border border-emerald-500/50 flex items-center justify-center text-emerald-400">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white uppercase tracking-wider font-display">
                  Confirm Reward Handout
                </h3>
                <p className="text-xs text-slate-400">Code: {checkedRedemption.code || checkedRedemption.redemptionCode}</p>
              </div>
            </div>

            <div className="p-3 bg-[#121620] border border-slate-800 rounded-xl text-xs space-y-1 text-slate-300">
              <p><strong>Item:</strong> {checkedRedemption.rewardTitle}</p>
              <p><strong>Customer:</strong> {checkedRedemption.gamerTag}</p>
              <p className="text-emerald-400 font-bold mt-2">
                Marking as USED will permanently fulfill this reward voucher.
              </p>
            </div>

            <div>
              <label className="text-[11px] text-slate-400 block mb-1">Staff Note (Optional)</label>
              <input
                type="text"
                value={useNotes}
                onChange={(e) => setUseNotes(e.target.value)}
                placeholder="e.g. Free Red Bull delivered to PC 04"
                className="w-full bg-[#121620] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 placeholder:text-slate-600"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmUseModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold uppercase tracking-wider"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submittingUse}
                onClick={handleConfirmUse}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-[0_0_20px_rgba(16,185,129,0.4)] flex items-center gap-1.5"
              >
                {submittingUse && (
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                )}
                <span>Confirm Used</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
