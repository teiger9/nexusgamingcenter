import React, { useState, useEffect } from 'react';
import {
  X,
  Coins,
  ArrowUpRight,
  ArrowDownLeft,
  Gift,
  ExternalLink,
  ShieldAlert,
  Calendar,
  Gamepad2,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { CoinTransaction } from '../types';
import { subscribeToPlayerTransactions } from '../services/coinRewardService';

interface NexusWalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateToFidelityCard?: () => void;
  onOpenFidelityCard?: () => void;
}

export const NexusWalletModal: React.FC<NexusWalletModalProps> = ({
  isOpen,
  onClose,
  onNavigateToFidelityCard,
  onOpenFidelityCard,
}) => {
  const { user, playerProfile } = useAuth();
  const [transactions, setTransactions] = useState<CoinTransaction[]>([]);
  const [filter, setFilter] = useState<'ALL' | 'EARNED' | 'SPENT'>('ALL');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOpen || !user) {
      setTransactions([]);
      return;
    }

    setLoading(true);
    const unsub = subscribeToPlayerTransactions(user.uid, (data) => {
      setTransactions(data);
      setLoading(false);
    });

    return () => unsub();
  }, [isOpen, user]);

  if (!isOpen) return null;

  const currentBalance = playerProfile?.nexusCoins || 0;
  const totalEarned = playerProfile?.totalCoinsEarned || 0;
  const totalRedeemed = playerProfile?.totalCoinsRedeemed || 0;

  const filteredTxs = transactions.filter((tx) => {
    if (filter === 'EARNED') return tx.amount > 0;
    if (filter === 'SPENT') return tx.amount < 0;
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div
        id="nexus-wallet-modal-card"
        className="relative w-full max-w-2xl bg-neutral-950 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header Bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 bg-neutral-900/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Coins className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black uppercase tracking-wider text-white">
                  Nexus Coin Wallet
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  NC LEDGER
                </span>
              </div>
              <p className="text-xs text-neutral-400">
                Official rewards & balance for <span className="text-white font-bold">{playerProfile?.gamerTag || 'Player'}</span>
              </p>
            </div>
          </div>
          <button
            id="close-nexus-wallet-modal"
            onClick={onClose}
            className="p-2 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Balance Showcase Card */}
        <div className="p-6 border-b border-neutral-800/80 bg-gradient-to-b from-neutral-900/40 to-transparent">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Primary Available Balance */}
            <div className="md:col-span-1 p-4 rounded-xl bg-gradient-to-br from-amber-500/20 via-neutral-900 to-neutral-900 border border-amber-500/40 relative overflow-hidden">
              <div className="text-[10px] uppercase font-bold tracking-wider text-amber-400 mb-1">
                Available Balance
              </div>
              <div className="text-3xl font-black font-mono text-amber-300 flex items-baseline gap-1.5">
                <span>🪙</span>
                <span>{currentBalance.toLocaleString()}</span>
                <span className="text-sm font-sans font-bold text-amber-500">NC</span>
              </div>
              <div className="mt-2 text-[11px] text-neutral-400">
                Ready for station time & rewards
              </div>
            </div>

            {/* Lifetime Earned */}
            <div className="p-4 rounded-xl bg-neutral-900/80 border border-neutral-800">
              <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-wider text-emerald-400 mb-1">
                <ArrowDownLeft className="w-3.5 h-3.5" />
                <span>Lifetime Earned</span>
              </div>
              <div className="text-2xl font-black font-mono text-white">
                +{totalEarned.toLocaleString()}{' '}
                <span className="text-xs font-normal text-neutral-400">NC</span>
              </div>
              <div className="mt-2 text-[11px] text-neutral-400">From verified victories & events</div>
            </div>

            {/* Lifetime Redeemed */}
            <div className="p-4 rounded-xl bg-neutral-900/80 border border-neutral-800">
              <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-wider text-rose-400 mb-1">
                <ArrowUpRight className="w-3.5 h-3.5" />
                <span>Total Redeemed</span>
              </div>
              <div className="text-2xl font-black font-mono text-white">
                {totalRedeemed.toLocaleString()}{' '}
                <span className="text-xs font-normal text-neutral-400">NC</span>
              </div>
              <div className="mt-2 text-[11px] text-neutral-400">Claimed at Nexus Gaming Center</div>
            </div>
          </div>

          {/* Quick CTA to Fidelity Card */}
          <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-3 p-3.5 rounded-xl bg-neutral-900/80 border border-neutral-800">
            <div className="flex items-center gap-2.5 text-xs text-neutral-300">
              <Gift className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                Want to spend your coins? Browse station hours, passes & snacks in the Fidelity Catalog.
              </span>
            </div>
            <button
              id="wallet-open-fidelity-card-btn"
              onClick={() => {
                onClose();
                if (typeof onNavigateToFidelityCard === 'function') {
                  onNavigateToFidelityCard();
                } else if (typeof onOpenFidelityCard === 'function') {
                  onOpenFidelityCard();
                }
              }}
              className="w-full sm:w-auto px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-xs uppercase tracking-wider transition-colors shrink-0 flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
            >
              <span>View Fidelity Card</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Transactions Ledger Area */}
        <div className="flex-1 overflow-hidden flex flex-col p-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-300">
              Coin Transaction History
            </h3>
            {/* Filter Pills */}
            <div className="flex items-center gap-1 p-0.5 rounded-lg bg-neutral-900 border border-neutral-800 text-[11px]">
              {(['ALL', 'EARNED', 'SPENT'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setFilter(mode)}
                  className={`px-2.5 py-1 rounded-md font-bold uppercase tracking-wider transition-colors ${
                    filter === mode
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {loading ? (
              <div className="py-12 text-center text-xs text-neutral-500">
                Loading transaction ledger...
              </div>
            ) : filteredTxs.length === 0 ? (
              <div className="py-12 text-center border border-dashed border-neutral-800 rounded-xl p-6">
                <Coins className="w-8 h-8 text-neutral-600 mx-auto mb-2" />
                <p className="text-sm font-bold text-neutral-300">No transactions recorded yet</p>
                <p className="text-xs text-neutral-500 mt-1 max-w-sm mx-auto">
                  Win verified 1v1 or 5v5 matches to earn Nexus Coins, or redeem rewards at the Nexus desk.
                </p>
              </div>
            ) : (
              filteredTxs.map((tx) => {
                const isPositive = tx.amount > 0;
                return (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-neutral-900/60 border border-neutral-800/80 hover:border-neutral-700 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                          isPositive
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        }`}
                      >
                        {isPositive ? (
                          <ArrowDownLeft className="w-4 h-4" />
                        ) : (
                          <ArrowUpRight className="w-4 h-4" />
                        )}
                      </div>
                      <div>
                        <div className="text-xs font-bold text-white flex items-center gap-2">
                          <span>{tx.reason || (isPositive ? 'Coins Earned' : 'Redemption')}</span>
                          {(tx.type === 'MATCH_WIN' || tx.type === 'MATCH_DRAW_REWARD') && tx.game && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-neutral-800 text-neutral-300 border border-neutral-700">
                              {tx.game}
                            </span>
                          )}
                          {tx.redemptionCode && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                              {tx.redemptionCode}
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-neutral-500 mt-0.5 flex items-center gap-2">
                          <span>{new Date(tx.createdAt).toLocaleDateString()} at {new Date(tx.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          {tx.adminName && (
                            <span>• Admin: {tx.adminName}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div
                        className={`text-sm font-mono font-black ${
                          isPositive ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {isPositive ? `+${tx.amount}` : tx.amount} NC
                      </div>
                      {typeof tx.balanceAfter === 'number' && (
                        <div className="text-[10px] text-neutral-500 font-mono">
                          Bal: {tx.balanceAfter.toLocaleString()} NC
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Footer Disclaimer */}
        <div className="px-6 py-3 border-t border-neutral-800 bg-neutral-950 text-[11px] text-neutral-500 flex items-center justify-between">
          <span>Nexus Coins are non-cash gaming loyalty rewards.</span>
          <span className="font-mono text-neutral-400">ID: {playerProfile?.uid?.substring(0, 8)}</span>
        </div>
      </div>
    </div>
  );
};
