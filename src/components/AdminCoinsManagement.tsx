import React, { useState, useEffect } from 'react';
import {
  Coins,
  Save,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  CreditCard,
  UserCheck,
  Search,
  ArrowDownLeft,
  ArrowUpRight,
  ShieldAlert,
  Gamepad2,
  RefreshCw,
  ShieldCheck,
  Layers,
  Loader2,
} from 'lucide-react';
import { collection, getDocs, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import {
  CoinRewardsSettings,
  CoinTransaction,
  Game,
  Player,
  WalletReconciliationResult,
} from '../types';
import {
  getCoinRewardsSettings,
  updateCoinRewardsSettings,
  adminAdjustPlayerCoins,
  subscribeToAllTransactions,
  reconcileAllWallets,
  FALLBACK_DEFAULT_REWARD,
} from '../services/coinRewardService';

export const AdminCoinsManagement: React.FC = () => {
  const { user, playerProfile, isAdmin } = useAuth();
  const [games, setGames] = useState<Game[]>([]);
  const [settings, setSettings] = useState<CoinRewardsSettings | null>(null);
  const [gameRewardsState, setGameRewardsState] = useState<Record<string, number>>({});
  const [defaultRewardState, setDefaultRewardState] = useState<number>(FALLBACK_DEFAULT_REWARD);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSuccessMsg, setSettingsSuccessMsg] = useState<string | null>(null);

  // Manual Adjustment State
  const [playersList, setPlayersList] = useState<Player[]>([]);
  const [selectedPlayerUid, setSelectedPlayerUid] = useState<string>('');
  const [adjustAmount, setAdjustAmount] = useState<number>(50);
  const [adjustAction, setAdjustAction] = useState<'CREDIT' | 'DEBIT'>('CREDIT');
  const [adjustReason, setAdjustReason] = useState<string>('');
  const [adjustLoading, setAdjustLoading] = useState(false);
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const [adjustSuccessMsg, setAdjustSuccessMsg] = useState<string | null>(null);
  const [playerSearchQuery, setPlayerSearchQuery] = useState('');

  // Transactions Ledger State
  const [transactions, setTransactions] = useState<CoinTransaction[]>([]);
  const [txFilter, setTxFilter] = useState<'ALL' | 'MATCH_WIN' | 'MATCH_DRAW_REWARD' | 'REDEMPTION' | 'ADMIN_ADJUSTMENT'>('ALL');
  const [txSearch, setTxSearch] = useState('');

  // Wallet Reconciliation & Audit State
  const [reconciling, setReconciling] = useState(false);
  const [reconciliationResults, setReconciliationResults] = useState<WalletReconciliationResult[] | null>(null);

  const handleRunReconciliation = async () => {
    if (!isAdmin) return;
    setReconciling(true);
    try {
      const results = await reconcileAllWallets();
      setReconciliationResults(results);
    } catch (err) {
      console.error('Reconciliation audit error:', err);
    } finally {
      setReconciling(false);
    }
  };

  // Fetch games & settings
  useEffect(() => {
    // 1. Fetch games
    getDocs(collection(db, 'games')).then((snap) => {
      const gList = snap.docs.map((d) => ({ ...d.data(), id: d.id } as Game));
      setGames(gList);
    });

    // 2. Fetch players for adjustment tool
    getDocs(collection(db, 'players')).then((snap) => {
      const pList = snap.docs.map((d) => ({ ...d.data(), uid: d.id } as Player));
      setPlayersList(pList);
    });

    // 3. Fetch settings
    getCoinRewardsSettings().then((s) => {
      setSettings(s);
      setGameRewardsState(s.gameRewards || {});
      setDefaultRewardState(s.defaultReward || FALLBACK_DEFAULT_REWARD);
    });

    // 4. Subscribe to transactions
    const unsubTx = subscribeToAllTransactions((list) => {
      setTransactions(list);
    });

    return () => unsubTx();
  }, []);

  // Save Settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !isAdmin) return;
    setSavingSettings(true);
    setSettingsSuccessMsg(null);

    try {
      await updateCoinRewardsSettings(gameRewardsState, defaultRewardState, user.uid);
      setSettingsSuccessMsg('Match win coin rewards configuration saved successfully!');
      setTimeout(() => setSettingsSuccessMsg(null), 3000);
    } catch (err: any) {
      console.error('Error saving coin settings:', err);
    } finally {
      setSavingSettings(false);
    }
  };

  // Perform Manual Adjustment
  const handlePerformAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !isAdmin || !selectedPlayerUid) {
      if (!isAdmin) setAdjustError('Only Administrators can manually adjust balances.');
      return;
    }
    if (!adjustReason.trim()) {
      setAdjustError('A mandatory reason is required for balance adjustments.');
      return;
    }
    if (!adjustAmount || adjustAmount <= 0) {
      setAdjustError('Please specify a valid coin amount greater than 0.');
      return;
    }

    setAdjustLoading(true);
    setAdjustError(null);
    setAdjustSuccessMsg(null);

    const delta = adjustAction === 'CREDIT' ? adjustAmount : -adjustAmount;

    const res = await adminAdjustPlayerCoins({
      playerUid: selectedPlayerUid,
      amount: delta,
      reason: adjustReason.trim(),
      adminUid: user.uid,
      adminName: playerProfile?.gamerTag || 'Nexus Admin',
    });

    setAdjustLoading(false);

    if (res.success) {
      setAdjustSuccessMsg(`Successfully adjusted balance! New balance: ${res.newBalance} NC`);
      setAdjustReason('');
      // Refresh local player list balance
      setPlayersList((prev) =>
        prev.map((p) =>
          p.uid === selectedPlayerUid ? { ...p, nexusCoins: res.newBalance } : p
        )
      );
      setTimeout(() => setAdjustSuccessMsg(null), 4000);
    } else {
      setAdjustError(res.error || 'Failed to adjust balance.');
    }
  };

  // Selected Player Profile
  const selectedPlayer = playersList.find((p) => p.uid === selectedPlayerUid);

  // Filtered Players for selection
  const filteredPlayers = playersList.filter((p) => {
    if (!playerSearchQuery.trim()) return true;
    const q = playerSearchQuery.toLowerCase();
    return (
      (p.gamerTag && p.gamerTag.toLowerCase().includes(q)) ||
      (p.email && p.email.toLowerCase().includes(q)) ||
      (p.fullName && p.fullName.toLowerCase().includes(q))
    );
  });

  // Calculate Economy Stats
  const totalCoinsIssued = transactions
    .filter((tx) => tx.amount > 0)
    .reduce((sum, tx) => sum + tx.amount, 0);

  const totalCoinsRedeemed = transactions
    .filter((tx) => tx.amount < 0)
    .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

  const circulatingCoins = playersList.reduce((sum, p) => sum + (p.nexusCoins || 0), 0);

  // Filtered Transactions
  const filteredTransactions = transactions.filter((tx) => {
    if (txFilter !== 'ALL' && tx.type !== txFilter) return false;
    if (txSearch.trim()) {
      const q = txSearch.toLowerCase();
      const matchGamer = tx.gamerTag?.toLowerCase().includes(q);
      const matchReason = tx.reason?.toLowerCase().includes(q);
      const matchGame = tx.game?.toLowerCase().includes(q);
      const matchCode = tx.redemptionCode?.toLowerCase().includes(q);
      if (!matchGamer && !matchReason && !matchGame && !matchCode) return false;
    }
    return true;
  });

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-neutral-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Coins className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-black uppercase tracking-wider text-white">
              Nexus Coins & Economy Management
            </h2>
            <p className="text-xs text-neutral-400">
              Configure per-game match victory rewards, adjust player balances, and inspect the economy ledger.
            </p>
          </div>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-neutral-900/60 border border-neutral-800">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-400 mb-1">
            <Coins className="w-3.5 h-3.5" />
            <span>Circulating Balance</span>
          </div>
          <div className="text-2xl font-black font-mono text-white">
            {circulatingCoins.toLocaleString()}{' '}
            <span className="text-xs font-normal text-amber-400">NC</span>
          </div>
          <div className="text-[10px] text-neutral-500 mt-1">Held across player accounts</div>
        </div>

        <div className="p-4 rounded-xl bg-neutral-900/60 border border-neutral-800">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-400 mb-1">
            <ArrowDownLeft className="w-3.5 h-3.5" />
            <span>Total Coins Issued</span>
          </div>
          <div className="text-2xl font-black font-mono text-white">
            +{totalCoinsIssued.toLocaleString()}{' '}
            <span className="text-xs font-normal text-emerald-400">NC</span>
          </div>
          <div className="text-[10px] text-neutral-500 mt-1">From confirmed victories & bonuses</div>
        </div>

        <div className="p-4 rounded-xl bg-neutral-900/60 border border-neutral-800">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-rose-400 mb-1">
            <ArrowUpRight className="w-3.5 h-3.5" />
            <span>Total Coins Redeemed</span>
          </div>
          <div className="text-2xl font-black font-mono text-white">
            {totalCoinsRedeemed.toLocaleString()}{' '}
            <span className="text-xs font-normal text-rose-400">NC</span>
          </div>
          <div className="text-[10px] text-neutral-500 mt-1">Spent in Fidelity Card catalog</div>
        </div>

        <div className="p-4 rounded-xl bg-neutral-900/60 border border-neutral-800">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-cyan-400 mb-1">
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Total Transactions</span>
          </div>
          <div className="text-2xl font-black font-mono text-white">
            {transactions.length.toLocaleString()}
          </div>
          <div className="text-[10px] text-neutral-500 mt-1">Audited ledger entries</div>
        </div>
      </div>

      {/* Grid: Game Rewards Settings + Manual Balance Adjustment */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* ========================================================
            PANEL 1: PER-GAME MATCH WIN REWARDS CONFIGURATION
            ======================================================== */}
        <div className="lg:col-span-6 p-6 rounded-2xl bg-neutral-950 border border-neutral-800 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Gamepad2 className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-black uppercase tracking-wider text-white">
                Match Win Coin Rewards
              </h3>
            </div>
            <span className="text-[10px] font-mono text-neutral-500">AWARDED TO WINNERS ONLY</span>
          </div>

          <p className="text-xs text-neutral-400 leading-relaxed">
            Configure how many Nexus Coins are automatically credited to the winning player (1v1) or every winning team member (5v5) upon official match confirmation.
          </p>

          <form onSubmit={handleSaveSettings} className="space-y-4 pt-2">
            <div className="space-y-3">
              {/* Standard core games with official Nexus rules: Chess, FC 26, FC 27, Valorant, CS2 */}
              {[
                {
                  id: 'chess',
                  name: 'Chess (1v1)',
                  category: 'CHESS',
                  defaultVal: 2,
                  rewardRule: 'Win = 2 NC • Draw = 1 NC each • Loss = 0 NC',
                },
                {
                  id: 'fc26',
                  name: 'FC 26 (1v1)',
                  category: 'PS5',
                  defaultVal: 60,
                  rewardRule: '60 NC × games won by winner (Overall winner only • Loss = 0 NC)',
                },
                {
                  id: 'fc27',
                  name: 'FC 27 (1v1)',
                  category: 'PS5',
                  defaultVal: 60,
                  rewardRule: '60 NC × games won by winner (Overall winner only • Loss = 0 NC)',
                },
                {
                  id: 'valorant',
                  name: 'Valorant (5v5)',
                  category: 'PC',
                  defaultVal: 15,
                  rewardRule: 'Winning Team: 15 NC per player • Losing Team = 0 NC • Draw = 0 NC',
                },
                {
                  id: 'cs2',
                  name: 'CS2 (5v5)',
                  category: 'PC',
                  defaultVal: 15,
                  rewardRule: 'Winning Team: 15 NC per player • Losing Team = 0 NC • Draw = 0 NC',
                },
              ].map((gameConfig) => {
                const currentVal =
                  gameRewardsState[gameConfig.id] ??
                  gameRewardsState[gameConfig.id.toLowerCase()] ??
                  gameConfig.defaultVal;

                return (
                  <div
                    key={gameConfig.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-xl bg-neutral-900/70 border border-neutral-800 gap-2"
                  >
                    <div>
                      <div className="text-xs font-bold text-white">{gameConfig.name}</div>
                      <div className="text-[10px] text-neutral-500 uppercase tracking-wider font-mono">
                        {gameConfig.category} ARENA
                      </div>
                      <div className="text-[10px] text-amber-400/90 font-mono mt-0.5">
                        {gameConfig.rewardRule}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center">
                      <span className="text-xs text-neutral-400">
                        {gameConfig.id.startsWith('fc') ? 'BASE/GAME →' : 'WIN →'}
                      </span>
                      <div className="relative w-24">
                        <input
                          type="number"
                          min="0"
                          max="1000"
                          disabled={!isAdmin}
                          value={currentVal}
                          onChange={(e) =>
                            setGameRewardsState({
                              ...gameRewardsState,
                              [gameConfig.id]: Math.max(0, parseInt(e.target.value) || 0),
                            })
                          }
                          className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-2.5 py-1 text-xs font-mono font-bold text-amber-300 text-right pr-7 focus:outline-hidden focus:border-amber-500 disabled:opacity-75 disabled:cursor-not-allowed"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-sans font-bold text-neutral-500">
                          NC
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Dynamic list of any other games registered in catalog */}
              {games
                .filter(
                  (g) =>
                    !['chess', 'fc26', 'fc27', 'valorant', 'cs2'].includes(
                      g.customId || g.id.toLowerCase()
                    )
                )
                .map((customGame) => {
                  const key = customGame.customId || customGame.id;
                  const currentVal = gameRewardsState[key] ?? defaultRewardState;
                  return (
                    <div
                      key={key}
                      className="flex items-center justify-between p-3 rounded-xl bg-neutral-900/70 border border-neutral-800"
                    >
                      <div>
                        <div className="text-xs font-bold text-white">{customGame.name}</div>
                        <div className="text-[10px] text-neutral-500 uppercase tracking-wider font-mono">
                          {customGame.category} CATALOG GAME
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-xs text-neutral-400">WIN →</span>
                        <div className="relative w-24">
                          <input
                            type="number"
                            min="0"
                            max="1000"
                            disabled={!isAdmin}
                            value={currentVal}
                            onChange={(e) =>
                              setGameRewardsState({
                                ...gameRewardsState,
                                [key]: Math.max(0, parseInt(e.target.value) || 0),
                              })
                            }
                            className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-2.5 py-1 text-xs font-mono font-bold text-amber-300 text-right pr-7 focus:outline-hidden focus:border-amber-500 disabled:opacity-75 disabled:cursor-not-allowed"
                          />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-sans font-bold text-neutral-500">
                            NC
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}

              {/* Default Fallback for New Games */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-neutral-900/40 border border-dashed border-neutral-800">
                <div>
                  <div className="text-xs font-bold text-neutral-300">Default Unconfigured Game Reward</div>
                  <div className="text-[10px] text-neutral-500">Fallback for any newly created game</div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative w-24">
                    <input
                      type="number"
                      min="0"
                      max="1000"
                      disabled={!isAdmin}
                      value={defaultRewardState}
                      onChange={(e) => setDefaultRewardState(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-2.5 py-1 text-xs font-mono font-bold text-amber-300 text-right pr-7 focus:outline-hidden focus:border-amber-500 disabled:opacity-75 disabled:cursor-not-allowed"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-sans font-bold text-neutral-500">
                      NC
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {settingsSuccessMsg && (
              <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-800 text-xs text-emerald-300 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                <span>{settingsSuccessMsg}</span>
              </div>
            )}

            {isAdmin ? (
              <button
                id="save-coin-rewards-settings-btn"
                type="submit"
                disabled={savingSettings}
                className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black uppercase text-xs tracking-wider transition-all shadow-[0_0_15px_rgba(245,158,11,0.25)] flex items-center justify-center gap-2 cursor-pointer"
              >
                {savingSettings ? (
                  <span>Saving Configuration...</span>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>Save Match Rewards Configuration</span>
                  </>
                )}
              </button>
            ) : (
              <div className="text-center py-2 text-[11px] font-mono text-neutral-500 border border-dashed border-neutral-800 rounded-xl">
                Reward values view-only. Settings modification requires Administrator privileges.
              </div>
            )}
          </form>
        </div>

        {/* ========================================================
            PANEL 2: MANUAL PLAYER BALANCE ADJUSTMENT TOOL
            ======================================================== */}
        <div className="lg:col-span-6 p-6 rounded-2xl bg-neutral-950 border border-neutral-800 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-black uppercase tracking-wider text-white">
                Manual Balance Adjustment Tool
              </h3>
            </div>
            <span className="text-[10px] font-mono text-neutral-500">ADMIN CONTROL</span>
          </div>

          {isAdmin ? (
            <>
              <p className="text-xs text-neutral-400 leading-relaxed">
                Credit or debit Nexus Coins for a specific player. A mandatory reason is required for compliance and will be permanently recorded in the ledger.
              </p>

              <form onSubmit={handlePerformAdjustment} className="space-y-4 pt-2">
                {/* Player Selection */}
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-neutral-300 block mb-1">
                    Select Target Player
                  </label>
                  <div className="relative mb-2">
                    <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={playerSearchQuery}
                      onChange={(e) => setPlayerSearchQuery(e.target.value)}
                      placeholder="Filter players by gamerTag or email..."
                      className="w-full bg-neutral-900 border border-neutral-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-neutral-500 focus:outline-hidden focus:border-amber-500"
                    />
                  </div>

                  <select
                    id="manual-adjust-player-select"
                    value={selectedPlayerUid}
                    onChange={(e) => setSelectedPlayerUid(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-hidden focus:border-amber-500"
                  >
                    <option value="">-- Choose Player Account --</option>
                    {filteredPlayers.map((p) => (
                      <option key={p.uid} value={p.uid}>
                        {p.gamerTag || p.fullName} ({p.nexusCoins || 0} NC) - {p.email}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Selected Player Preview */}
                {selectedPlayer && (
                  <div className="p-3 rounded-xl bg-neutral-900/60 border border-neutral-800 flex items-center justify-between text-xs">
                    <div>
                      <span className="text-neutral-400">Current Balance:</span>
                      <span className="ml-2 font-mono font-bold text-amber-300">
                        🪙 {(selectedPlayer.nexusCoins || 0).toLocaleString()} NC
                      </span>
                    </div>
                    <div className="text-[11px] text-neutral-500">
                      Role: <span className="uppercase font-bold text-white">{selectedPlayer.role}</span>
                    </div>
                  </div>
                )}

                {/* Action Type & Amount */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-wider text-neutral-300 block mb-1">
                      Adjustment Type
                    </label>
                    <div className="grid grid-cols-2 gap-1 p-1 bg-neutral-900 rounded-xl border border-neutral-800 text-xs">
                      <button
                        type="button"
                        onClick={() => setAdjustAction('CREDIT')}
                        className={`py-1.5 rounded-lg font-bold uppercase tracking-wider transition-colors ${
                          adjustAction === 'CREDIT'
                            ? 'bg-emerald-500 text-neutral-950'
                            : 'text-neutral-400 hover:text-white'
                        }`}
                      >
                        + Credit
                      </button>
                      <button
                        type="button"
                        onClick={() => setAdjustAction('DEBIT')}
                        className={`py-1.5 rounded-lg font-bold uppercase tracking-wider transition-colors ${
                          adjustAction === 'DEBIT'
                            ? 'bg-rose-600 text-white'
                            : 'text-neutral-400 hover:text-white'
                        }`}
                      >
                        - Debit
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-wider text-neutral-300 block mb-1">
                      Coin Amount (NC)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="100000"
                      value={adjustAmount}
                      onChange={(e) => setAdjustAmount(Math.max(1, parseInt(e.target.value) || 0))}
                      className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-xs font-mono font-bold text-white focus:outline-hidden focus:border-amber-500"
                    />
                  </div>
                </div>

                {/* Mandatory Reason */}
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-neutral-300 block mb-1">
                    Reason for Adjustment <span className="text-red-400">* Mandatory</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={adjustReason}
                    onChange={(e) => setAdjustReason(e.target.value)}
                    placeholder="e.g. Tournament champion bonus, staff compensation, desk correction"
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white placeholder-neutral-500 focus:outline-hidden focus:border-amber-500"
                  />
                </div>

                {/* Status Messages */}
                {adjustError && (
                  <div className="p-3 rounded-xl bg-red-950/60 border border-red-800 text-xs text-red-300 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                    <span>{adjustError}</span>
                  </div>
                )}

                {adjustSuccessMsg && (
                  <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-800 text-xs text-emerald-300 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                    <span>{adjustSuccessMsg}</span>
                  </div>
                )}

                <button
                  id="submit-manual-coin-adjust-btn"
                  type="submit"
                  disabled={adjustLoading || !selectedPlayerUid}
                  className="w-full py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-neutral-950 font-black uppercase text-xs tracking-wider transition-all shadow-[0_0_15px_rgba(6,182,212,0.25)] disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                >
                  {adjustLoading ? (
                    <span>Executing Adjustment...</span>
                  ) : (
                    <>
                      <Coins className="w-4 h-4" />
                      <span>Execute Balance Adjustment</span>
                    </>
                  )}
                </button>
              </form>
            </>
          ) : (
            <div className="py-16 text-center space-y-2">
              <ShieldAlert className="w-8 h-8 text-neutral-600 mx-auto" />
              <p className="text-xs font-bold text-neutral-300">Administrator Privileges Required</p>
              <p className="text-[11px] text-neutral-500 max-w-sm mx-auto leading-relaxed">
                Staff accounts can view live transactions, balances, and redemption requests, but manual balance additions and deductions are restricted to Administrators.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ========================================================
          PANEL 2.5: NC WALLET RECONCILIATION & AUDIT ENGINE
          ======================================================== */}
      <div className="p-6 rounded-2xl bg-neutral-950 border border-neutral-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-black uppercase tracking-wider text-white">
                  Wallet Reconciliation & Ledger Integrity
                </h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  SINGLE SOURCE OF TRUTH
                </span>
              </div>
              <p className="text-xs text-neutral-400 mt-0.5">
                Compares every player's stored balance directly against the sum of their immutable ledger entries.
              </p>
            </div>
          </div>

          {isAdmin && (
            <button
              onClick={handleRunReconciliation}
              disabled={reconciling}
              className="px-4 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-white font-bold text-xs uppercase tracking-wider transition-colors disabled:opacity-50 flex items-center gap-2 shrink-0 cursor-pointer"
            >
              {reconciling ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                  <span>Auditing All Accounts...</span>
                </>
              ) : (
                <>
                  <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Run Integrity Audit</span>
                </>
              )}
            </button>
          )}
        </div>

        {reconciliationResults && (
          <div className="space-y-4 pt-2">
            {/* Summary Bar */}
            {(() => {
              const discrepancies = reconciliationResults.filter((r) => r.isDiscrepancy);
              const totalAudited = reconciliationResults.length;
              return (
                <div
                  className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    discrepancies.length === 0
                      ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300'
                      : 'bg-amber-950/30 border-amber-500/40 text-amber-300'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {discrepancies.length === 0 ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                    ) : (
                      <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0" />
                    )}
                    <div>
                      <div className="text-xs font-bold uppercase tracking-wider">
                        {discrepancies.length === 0
                          ? `100% Ledger Consistency Verified across ${totalAudited} players`
                          : `Audit Complete: ${discrepancies.length} discrepancy found out of ${totalAudited} players`}
                      </div>
                      <div className="text-[11px] opacity-80 mt-0.5">
                        {discrepancies.length === 0
                          ? 'All player wallet balances perfectly match transaction ledger calculations (SUM(+) - SUM(-)).'
                          : 'Flagged accounts have a discrepancy between stored profile balance and recorded ledger transactions.'}
                      </div>
                    </div>
                  </div>

                  <span className="text-[10px] font-mono opacity-60">
                    Audited at: {new Date().toLocaleTimeString()}
                  </span>
                </div>
              );
            })()}

            {/* Results Table (Shows discrepancies first) */}
            <div className="overflow-x-auto max-h-72 border border-neutral-800 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-neutral-900/80 sticky top-0 border-b border-neutral-800">
                  <tr className="text-[10px] uppercase font-mono text-neutral-400">
                    <th className="py-2.5 px-3">Player</th>
                    <th className="py-2.5 px-3">Player UID</th>
                    <th className="py-2.5 px-3 text-right">Stored Balance</th>
                    <th className="py-2.5 px-3 text-right">Ledger Balance</th>
                    <th className="py-2.5 px-3 text-right">Delta</th>
                    <th className="py-2.5 px-3 text-center">Status</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-900">
                  {reconciliationResults.map((r) => (
                    <tr
                      key={r.playerUid}
                      className={
                        r.isDiscrepancy
                          ? 'bg-amber-950/20 hover:bg-amber-950/30'
                          : 'hover:bg-neutral-900/40'
                      }
                    >
                      <td className="py-2.5 px-3 font-bold text-white whitespace-nowrap">
                        {r.gamerTag}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[10px] text-neutral-500 whitespace-nowrap">
                        {r.playerUid.substring(0, 10)}...
                      </td>
                      <td className="py-2.5 px-3 font-mono text-right text-neutral-300 whitespace-nowrap">
                        {r.currentWalletBalance.toLocaleString()} NC
                      </td>
                      <td className="py-2.5 px-3 font-mono text-right text-neutral-300 whitespace-nowrap">
                        {r.calculatedLedgerBalance.toLocaleString()} NC
                      </td>
                      <td className="py-2.5 px-3 font-mono text-right whitespace-nowrap">
                        {r.delta === 0 ? (
                          <span className="text-neutral-500">0</span>
                        ) : (
                          <span className={r.delta > 0 ? 'text-amber-400 font-bold' : 'text-rose-400 font-bold'}>
                            {r.delta > 0 ? `+${r.delta}` : r.delta} NC
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        {r.isDiscrepancy ? (
                          <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                            DISCREPANCY
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            MATCHED
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <button
                          onClick={() => {
                            setTxSearch(r.playerUid);
                          }}
                          className="px-2 py-1 rounded text-[10px] bg-neutral-900 hover:bg-neutral-800 text-neutral-300 font-mono transition-colors"
                        >
                          View Ledger ({r.transactionCount})
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================
          PANEL 3: NETWORK-WIDE AUDITED TRANSACTION LEDGER
          ======================================================== */}
      <div className="p-6 rounded-2xl bg-neutral-950 border border-neutral-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Coins className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-black uppercase tracking-wider text-white">
              Nexus Coin Transactions Ledger
            </h3>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-neutral-800 text-neutral-400">
              {filteredTransactions.length} ENTRIES
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Filter */}
            <div className="flex items-center gap-1 p-1 rounded-xl bg-neutral-900 border border-neutral-800 text-xs">
              {(['ALL', 'MATCH_WIN', 'MATCH_DRAW_REWARD', 'REDEMPTION', 'ADMIN_ADJUSTMENT'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setTxFilter(mode)}
                  className={`px-2.5 py-1 rounded-lg font-bold uppercase tracking-wider text-[10px] transition-colors ${
                    txFilter === mode
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  {mode.replace(/_/g, ' ')}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="relative min-w-[200px]">
              <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={txSearch}
                onChange={(e) => setTxSearch(e.target.value)}
                placeholder="Search ledger..."
                className="w-full bg-neutral-900 border border-neutral-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-neutral-500 focus:outline-hidden focus:border-amber-500"
              />
            </div>
          </div>
        </div>

        {/* Ledger Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-neutral-800 text-[10px] uppercase font-mono text-neutral-500">
                <th className="py-2.5 px-3">Date / Time</th>
                <th className="py-2.5 px-3">Player</th>
                <th className="py-2.5 px-3">Type</th>
                <th className="py-2.5 px-3">Reason / Details</th>
                <th className="py-2.5 px-3 text-right">Amount</th>
                <th className="py-2.5 px-3 text-right">Balance After</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-900">
              {filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-neutral-500">
                    No transactions recorded matching your search.
                  </td>
                </tr>
              ) : (
                filteredTransactions.slice(0, 50).map((tx) => {
                  const isPositive = tx.amount > 0;
                  return (
                    <tr key={tx.id} className="hover:bg-neutral-900/40 transition-colors">
                      <td className="py-2.5 px-3 font-mono text-neutral-400 whitespace-nowrap">
                        {new Date(tx.createdAt).toLocaleDateString()} {new Date(tx.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="py-2.5 px-3 font-bold text-white whitespace-nowrap">
                        {tx.gamerTag || 'Player'}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase tracking-wider ${
                            tx.type === 'MATCH_WIN'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : tx.type === 'MATCH_DRAW_REWARD'
                              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                              : tx.type === 'REDEMPTION'
                              ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                              : 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                          }`}
                        >
                          {tx.type}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-neutral-300">
                        <span>{tx.reason}</span>
                        {tx.adminName && (
                          <span className="text-[10px] text-neutral-500 ml-1.5">
                            (by {tx.adminName})
                          </span>
                        )}
                        {tx.redemptionCode && (
                          <span className="ml-1.5 px-1.5 py-0.2 rounded font-mono text-[9px] font-bold bg-amber-500/15 text-amber-300">
                            {tx.redemptionCode}
                          </span>
                        )}
                      </td>
                      <td
                        className={`py-2.5 px-3 text-right font-mono font-black whitespace-nowrap ${
                          isPositive ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {isPositive ? `+${tx.amount}` : tx.amount} NC
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-neutral-400 whitespace-nowrap">
                        {typeof tx.balanceAfter === 'number'
                          ? `${tx.balanceAfter.toLocaleString()} NC`
                          : '---'}
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
  );
};
