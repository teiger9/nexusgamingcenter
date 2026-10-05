import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  Coins,
  Sparkles,
  Gift,
  Clock,
  Flame,
  CheckCircle2,
  Tag,
  AlertCircle,
  QrCode,
  ShieldCheck,
  ChevronRight,
  ExternalLink,
  Layers,
  Search,
  Filter,
  Info,
  Tv,
  Gamepad,
  Trophy,
  Coffee,
  HelpCircle,
  Copy,
  Check,
  Loader2,
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
  subscribeToPlayerRedemptions,
  redeemFidelityReward,
  getEffectiveRewardCost,
  verifyRedemptionById,
} from '../services/coinRewardService';

interface NexusFidelityCardViewProps {
  onOpenAuth: (mode?: 'login' | 'register') => void;
  onOpenWallet: () => void;
  onOpenCreateMatch?: () => void;
}

export const NexusFidelityCardView: React.FC<NexusFidelityCardViewProps> = ({
  onOpenAuth,
  onOpenWallet,
  onOpenCreateMatch,
}) => {
  const { user, playerProfile } = useAuth();
  const [activeTab, setActiveTab] = useState<'CATALOG' | 'PASSES' | 'HOW_IT_WORKS'>('CATALOG');
  const [rewards, setRewards] = useState<FidelityReward[]>([]);
  const [redemptions, setRedemptions] = useState<RewardRedemption[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRewardToRedeem, setSelectedRewardToRedeem] = useState<FidelityReward | null>(null);
  const [redeemLoading, setRedeemLoading] = useState(false);
  const [redeemError, setRedeemError] = useState<string | null>(null);
  const [redemptionSuccessPass, setRedemptionSuccessPass] = useState<RewardRedemption | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [verifyingPending, setVerifyingPending] = useState(false);

  // Subscribe to rewards catalog
  useEffect(() => {
    const unsub = subscribeToFidelityRewards((list) => {
      setRewards(list);
    });

    // Immediate initial fetch to ensure zero blank-catalog delay
    fetchFidelityRewards().then((list) => {
      if (list && list.length > 0) {
        setRewards(list);
      }
    }).catch(() => {});

    return () => unsub();
  }, []);

  // Subscribe to player's redemptions if logged in
  useEffect(() => {
    if (!user) {
      setRedemptions([]);
      return;
    }
    const unsub = subscribeToPlayerRedemptions(user.uid, (list) => {
      setRedemptions(list);
    });
    return () => unsub();
  }, [user]);

  // Check for in-flight pending redemption on mount or user reload
  useEffect(() => {
    if (!user) return;
    const storageKey = `nexus_pending_red_${user.uid}`;
    const pendingKey = sessionStorage.getItem(storageKey);
    if (pendingKey) {
      setVerifyingPending(true);
      verifyRedemptionById(`red_${pendingKey}`)
        .then((existingRedemption) => {
          if (existingRedemption) {
            setRedemptionSuccessPass(existingRedemption);
          }
          sessionStorage.removeItem(storageKey);
        })
        .catch(() => {
          sessionStorage.removeItem(storageKey);
        })
        .finally(() => {
          setVerifyingPending(false);
        });
    }
  }, [user]);

  const currentCoins = playerProfile?.nexusCoins || 0;

  // Active limited time offers
  const activeOffers = rewards.filter((r) => {
    if (!r.active) return false;
    const eff = getEffectiveRewardCost(r);
    return eff.hasActiveOffer;
  });

  // Filtered rewards catalog
  const filteredRewards = rewards.filter((r) => {
    if (!r.active) return false;
    if (selectedCategory !== 'ALL' && r.category !== selectedCategory) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = r.title.toLowerCase().includes(q);
      const matchDesc = r.description.toLowerCase().includes(q);
      if (!matchTitle && !matchDesc) return false;
    }
    return true;
  });

  // Handle Copy Code to clipboard
  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2500);
  };

  // Execute redemption with double-click guard and idempotency key
  const handleConfirmRedeem = async () => {
    if (!user) {
      onOpenAuth('login');
      return;
    }
    if (!selectedRewardToRedeem) return;
    if (redeemLoading) return; // Strict double-click block

    const pricing = getEffectiveRewardCost(selectedRewardToRedeem);
    if (currentCoins < pricing.cost) {
      setRedeemError(`Insufficient Nexus Coins. Required: ${pricing.cost} NC, Your Balance: ${currentCoins} NC.`);
      return;
    }

    setRedeemLoading(true);
    setRedeemError(null);

    const storageKey = `nexus_pending_red_${user.uid}`;
    const idempotencyKey = `${user.uid}_${selectedRewardToRedeem.id}_${Date.now()}`;
    sessionStorage.setItem(storageKey, idempotencyKey);

    try {
      const res = await redeemFidelityReward({
        playerUid: user.uid,
        rewardId: selectedRewardToRedeem.id,
        idempotencyKey,
      });

      sessionStorage.removeItem(storageKey);

      if (res.success && res.redemption) {
        setRedemptionSuccessPass(res.redemption);
        setSelectedRewardToRedeem(null);
      } else {
        setRedeemError(res.error || 'Failed to redeem reward.');
      }
    } catch (err: any) {
      sessionStorage.removeItem(storageKey);
      setRedeemError(err.message || 'An unexpected error occurred while processing redemption.');
    } finally {
      setRedeemLoading(false);
    }
  };

  // Helper for category badge & icon
  const getCategoryDetails = (cat: FidelityRewardCategory) => {
    switch (cat) {
      case 'STATION_TIME':
        return { label: 'PC Station', icon: <Tv className="w-3.5 h-3.5" />, color: 'text-cyan-400 bg-cyan-950/40 border-cyan-800' };
      case 'FOOD_BEVERAGE':
        return { label: 'Snacks & Drinks', icon: <Coffee className="w-3.5 h-3.5" />, color: 'text-amber-400 bg-amber-950/40 border-amber-800' };
      case 'TOURNAMENT':
        return { label: 'Tournament', icon: <Trophy className="w-3.5 h-3.5" />, color: 'text-yellow-400 bg-yellow-950/40 border-yellow-800' };
      case 'SPECIAL':
        return { label: 'VIP Exclusive', icon: <Sparkles className="w-3.5 h-3.5" />, color: 'text-purple-400 bg-purple-950/40 border-purple-800' };
      case 'MERCH':
        return { label: 'Merchandise', icon: <Gift className="w-3.5 h-3.5" />, color: 'text-emerald-400 bg-emerald-950/40 border-emerald-800' };
      case 'PASS':
        return { label: 'Pass / Access', icon: <Tag className="w-3.5 h-3.5" />, color: 'text-cyan-400 bg-cyan-950/40 border-cyan-800' };
      default:
        return { label: 'Pass', icon: <Tag className="w-3.5 h-3.5" />, color: 'text-slate-400 bg-slate-900 border-slate-700' };
    }
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      {verifyingPending && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-mono flex items-center justify-between animate-pulse">
          <div className="flex items-center gap-2.5">
            <Loader2 className="w-4 h-4 animate-spin text-amber-400 shrink-0" />
            <span>VERIFYING IN-FLIGHT REDEMPTION... Confirming pass issuance with ledger.</span>
          </div>
        </div>
      )}

      {/* ========================================================
          ZONE 1: DIGITAL MEMBERSHIP FIDELITY CARD SHOWCASE
          ======================================================== */}
      <div className="relative overflow-hidden rounded-3xl bg-neutral-950 border border-neutral-800 p-6 md:p-8 shadow-2xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-red-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Left Column: Explanatory & Value Proposition */}
          <div className="lg:col-span-6 space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono font-bold uppercase tracking-widest bg-amber-500/10 text-amber-400 border border-amber-500/25">
              <Sparkles className="w-3.5 h-3.5" />
              <span>NEXUS REWARDS ECONOMY</span>
            </div>

            <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tight text-white leading-tight">
              Nexus Fidelity Card & Reward Catalog
            </h1>

            <p className="text-sm text-neutral-300 leading-relaxed">
              Play competitive matches, secure confirmed victories, and earn <span className="text-amber-300 font-bold">Nexus Coins (NC)</span>.
              Use your coins to unlock gaming station hours, PS5 lounge passes, tournament tickets, snacks, and exclusive VIP rewards at Nexus Gaming Center.
            </p>

            {/* Quick Status / Actions */}
            <div className="pt-2 flex flex-wrap items-center gap-3">
              {user ? (
                <>
                  <button
                    id="open-wallet-from-fidelity-btn"
                    onClick={onOpenWallet}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black uppercase text-xs tracking-wider transition-all shadow-[0_0_20px_rgba(245,158,11,0.3)] active:scale-95 cursor-pointer"
                  >
                    <Coins className="w-4 h-4" />
                    <span>Open Coin Wallet ({(playerProfile?.nexusCoins || 0).toLocaleString()} NC)</span>
                  </button>

                  <button
                    onClick={() => setActiveTab('PASSES')}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white font-bold text-xs uppercase tracking-wider border border-neutral-700 transition-all cursor-pointer"
                  >
                    <QrCode className="w-4 h-4 text-cyan-400" />
                    <span>My Rewards ({redemptions.filter(r => r.status === 'ACTIVE' || r.status === 'APPROVED').length} Active)</span>
                  </button>
                </>
              ) : (
                <button
                  onClick={() => onOpenAuth('register')}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white font-black uppercase text-xs tracking-wider transition-all shadow-lg active:scale-95 cursor-pointer"
                >
                  <CreditCard className="w-4 h-4" />
                  <span>Join Nexus to Earn Coins</span>
                </button>
              )}
            </div>

            {/* Mandatory Regulatory / Economy Disclaimer Box */}
            <div className="p-3.5 rounded-xl bg-neutral-900/90 border border-neutral-800/80 text-[11px] text-neutral-400 leading-relaxed">
              <span className="font-bold text-neutral-300 block mb-0.5">Nexus Loyalty Policy:</span>
              Nexus Coins are loyalty rewards earned through Nexus activities and can only be used for eligible Nexus rewards/offers. They are not cash and cannot be withdrawn or transferred unless the Admin explicitly enables such a feature.
            </div>
          </div>

          {/* Right Column: Physical-Style Digital Membership Card */}
          <div className="lg:col-span-6 flex justify-center">
            <div
              id="nexus-fidelity-physical-card"
              className="w-full max-w-md aspect-[1.586/1] rounded-2xl p-6 relative overflow-hidden bg-gradient-to-br from-neutral-900 via-neutral-950 to-black border-2 border-amber-500/40 shadow-[0_0_40px_rgba(245,158,11,0.15)] flex flex-col justify-between group select-none"
            >
              {/* Card Holographic Sheen */}
              <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-amber-500/5 to-cyan-500/10 pointer-events-none" />
              <div className="absolute -right-12 -top-12 w-48 h-48 rounded-full bg-amber-500/10 blur-2xl pointer-events-none" />

              {/* Card Top: Brand & Chip */}
              <div className="flex items-center justify-between relative z-10">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 font-black font-display text-sm">
                    N
                  </div>
                  <div>
                    <div className="text-xs font-black tracking-widest uppercase text-white font-display">
                      NEXUS GAMING CENTER
                    </div>
                    <div className="text-[9px] uppercase tracking-wider text-amber-400 font-mono font-bold">
                      FIDELITY REWARD PASS
                    </div>
                  </div>
                </div>

                {/* EMV Chip Representation */}
                <div className="w-10 h-7 rounded-md bg-gradient-to-br from-yellow-600/40 via-amber-400/30 to-yellow-700/50 border border-yellow-500/40 flex items-center justify-center">
                  <div className="w-6 h-4 border border-amber-400/40 rounded-sm grid grid-cols-2 gap-0.5 p-0.5">
                    <div className="bg-amber-400/20 rounded-xs" />
                    <div className="bg-amber-400/20 rounded-xs" />
                  </div>
                </div>
              </div>

              {/* Card Middle: Current Balance & Notice */}
              <div className="my-auto py-2 relative z-10">
                <div className="text-[10px] uppercase font-bold tracking-widest text-neutral-400 mb-0.5">
                  AVAILABLE REWARD BALANCE
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl sm:text-4xl font-black font-mono text-amber-300 drop-shadow-[0_0_12px_rgba(245,158,11,0.3)]">
                    🪙 {user ? currentCoins.toLocaleString() : '---'}
                  </span>
                  <span className="text-sm font-black text-amber-400 uppercase tracking-widest font-mono">
                    NC
                  </span>
                </div>
                <div className="text-[10px] text-amber-300/80 mt-1 flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3 text-amber-400" />
                  <span>Use your Nexus Coins to unlock rewards at Nexus Gaming Center.</span>
                </div>
              </div>

              {/* Card Bottom: Member Name & Member ID */}
              <div className="pt-2 border-t border-neutral-800/80 flex items-end justify-between relative z-10">
                <div>
                  <div className="text-[9px] uppercase tracking-wider text-neutral-500 font-mono">
                    MEMBER GAMERTAG
                  </div>
                  <div className="text-sm font-black text-white font-mono uppercase tracking-wider">
                    {user ? playerProfile?.gamerTag || 'Player' : 'GUEST / VISITOR'}
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-[9px] uppercase tracking-wider text-neutral-500 font-mono">
                    STATUS TIER
                  </div>
                  <div className="text-xs font-black text-amber-400 font-mono uppercase tracking-wider">
                    {currentCoins >= 1000
                      ? '⭐ VIP TITAN'
                      : currentCoins >= 400
                      ? '⚡ PRO CONTENDER'
                      : '🎮 ACTIVE MEMBER'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================
          ZONE 2: NAVIGATION TABS (Catalog vs My Passes vs How It Works)
          ======================================================== */}
      <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <button
            id="tab-fidelity-catalog"
            onClick={() => setActiveTab('CATALOG')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'CATALOG'
                ? 'bg-amber-500 text-neutral-950 shadow-[0_0_15px_rgba(245,158,11,0.25)]'
                : 'bg-neutral-900 text-neutral-400 hover:text-white hover:bg-neutral-800 border border-neutral-800'
            }`}
          >
            <Gift className="w-4 h-4" />
            <span>Rewards Catalog ({rewards.filter((r) => r.active).length})</span>
          </button>

          <button
            id="tab-fidelity-passes"
            onClick={() => setActiveTab('PASSES')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'PASSES'
                ? 'bg-amber-500 text-neutral-950 shadow-[0_0_15px_rgba(245,158,11,0.25)]'
                : 'bg-neutral-900 text-neutral-400 hover:text-white hover:bg-neutral-800 border border-neutral-800'
            }`}
          >
            <QrCode className="w-4 h-4" />
            <span>My Active Passes</span>
            {user && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-neutral-800 text-amber-300">
                {redemptions.length}
              </span>
            )}
          </button>

          <button
            id="tab-fidelity-how-it-works"
            onClick={() => setActiveTab('HOW_IT_WORKS')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'HOW_IT_WORKS'
                ? 'bg-amber-500 text-neutral-950 shadow-[0_0_15px_rgba(245,158,11,0.25)]'
                : 'bg-neutral-900 text-neutral-400 hover:text-white hover:bg-neutral-800 border border-neutral-800'
            }`}
          >
            <HelpCircle className="w-4 h-4" />
            <span>How It Works (6 Steps)</span>
          </button>
        </div>

        {/* Quick Balance Preview on the right */}
        {user && (
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-neutral-900 border border-neutral-800 text-xs">
            <span className="text-neutral-400 font-medium">Your Balance:</span>
            <span className="font-mono font-bold text-amber-300">🪙 {currentCoins.toLocaleString()} NC</span>
          </div>
        )}
      </div>

      {/* ========================================================
          TAB 1: REWARDS CATALOG VIEW
          ======================================================== */}
      {activeTab === 'CATALOG' && (
        <div className="space-y-6">
          {/* Limited-Time Offers Showcase */}
          {activeOffers.length > 0 && (
            <div className="p-5 rounded-2xl bg-gradient-to-r from-amber-500/10 via-neutral-900 to-amber-500/10 border border-amber-500/30">
              <div className="flex items-center gap-2 mb-3">
                <Flame className="w-5 h-5 text-amber-400 animate-pulse" />
                <h3 className="text-sm font-black uppercase tracking-wider text-white">
                  Limited-Time Nexus Offers & Flash Discounts
                </h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  SAVE COINS
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {activeOffers.map((offer) => {
                  const pricing = getEffectiveRewardCost(offer);
                  const canAfford = currentCoins >= pricing.cost;
                  return (
                    <div
                      key={offer.id}
                      className="p-4 rounded-xl bg-neutral-950/80 border border-amber-500/40 flex flex-col justify-between"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-red-600 text-white mb-2 shadow-sm">
                            <Clock className="w-3 h-3" />
                            <span>{pricing.offerLabel || 'SPECIAL OFFER'}</span>
                          </div>
                          <h4 className="text-sm font-bold text-white">{offer.title}</h4>
                          <p className="text-xs text-neutral-400 mt-1">{offer.description}</p>
                        </div>

                        {/* Pricing */}
                        <div className="text-right shrink-0">
                          <div className="text-xs text-neutral-500 line-through font-mono">
                            {pricing.normalPrice} NC
                          </div>
                          <div className="text-xl font-black font-mono text-amber-300 flex items-center gap-1">
                            <span>🪙</span>
                            <span>{pricing.cost}</span>
                            <span className="text-xs font-sans text-amber-400">NC</span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 pt-3 border-t border-neutral-800 flex items-center justify-between">
                        <span className="text-[11px] text-amber-400/80 font-mono">
                          {pricing.offerEndsAt
                            ? `Ends in: ${Math.max(1, Math.ceil((pricing.offerEndsAt - Date.now()) / (1000 * 60 * 60 * 24)))} days`
                            : 'Limited availability'}
                        </span>
                        <button
                          onClick={() => setSelectedRewardToRedeem(offer)}
                          className={`px-3.5 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                            user && canAfford
                              ? 'bg-amber-500 hover:bg-amber-400 text-neutral-950 shadow-sm'
                              : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
                          }`}
                        >
                          {!user ? 'Sign In to Redeem' : canAfford ? 'Redeem Offer' : `Need ${pricing.cost - currentCoins} More NC`}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Search & Category Filter Bar */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
            {/* Category Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              {[
                { id: 'ALL', label: 'All Rewards' },
                { id: 'STATION_TIME', label: 'Gaming Hours' },
                { id: 'FOOD_BEVERAGE', label: 'Snacks & Drinks' },
                { id: 'TOURNAMENT', label: 'Tournaments' },
                { id: 'SPECIAL', label: 'VIP Packages' },
                { id: 'PASS', label: 'Passes' },
                { id: 'MERCH', label: 'Merchandise' },
              ].map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap cursor-pointer ${
                    selectedCategory === cat.id
                      ? 'bg-neutral-800 text-white border border-neutral-700'
                      : 'text-neutral-400 hover:text-white hover:bg-neutral-900 border border-transparent'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div className="relative min-w-[240px]">
              <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search rewards..."
                className="w-full bg-neutral-900 border border-neutral-800 rounded-xl pl-9 pr-4 py-1.5 text-xs text-white placeholder-neutral-500 focus:outline-hidden focus:border-amber-500 transition-colors"
              />
            </div>
          </div>

          {/* Catalog Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredRewards.length === 0 ? (
              <div className="col-span-full py-16 text-center border border-dashed border-neutral-800 rounded-2xl p-6">
                <Gift className="w-10 h-10 text-neutral-600 mx-auto mb-2" />
                <h4 className="text-sm font-bold text-white">No rewards match your criteria</h4>
                <p className="text-xs text-neutral-500 mt-1">Try resetting the category filter or search query.</p>
              </div>
            ) : (
              filteredRewards.map((reward) => {
                const pricing = getEffectiveRewardCost(reward);
                const canAfford = currentCoins >= pricing.cost;
                const catDetails = getCategoryDetails(reward.category);
                const isOutOfStock =
                  reward.availableQuantity !== null &&
                  reward.availableQuantity !== undefined &&
                  reward.availableQuantity <= 0;

                return (
                  <div
                    key={reward.id}
                    className="p-5 rounded-2xl bg-neutral-950 border border-neutral-800/90 hover:border-neutral-700 transition-all flex flex-col justify-between group shadow-sm"
                  >
                    <div>
                      {/* Top Header: Category & Availability */}
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${catDetails.color}`}
                        >
                          {catDetails.icon}
                          <span>{catDetails.label}</span>
                        </span>

                        {reward.availableQuantity !== null && reward.availableQuantity !== undefined ? (
                          <span className="text-[10px] font-mono text-neutral-400">
                            {isOutOfStock ? (
                              <span className="text-rose-400 font-bold">OUT OF STOCK</span>
                            ) : (
                              `${reward.availableQuantity} Left`
                            )}
                          </span>
                        ) : (
                          <span className="text-[10px] font-mono text-neutral-500">Unlimited</span>
                        )}
                      </div>

                      {/* Title & Description */}
                      <h4 className="text-base font-bold text-white group-hover:text-amber-300 transition-colors">
                        {reward.title}
                      </h4>
                      <p className="text-xs text-neutral-400 mt-1.5 leading-relaxed line-clamp-2">
                        {reward.description}
                      </p>

                      {/* Terms snippet if exists */}
                      {reward.terms && (
                        <div className="mt-3 p-2 rounded-lg bg-neutral-900/60 border border-neutral-900 text-[10px] text-neutral-500 flex items-start gap-1.5">
                          <Info className="w-3 h-3 text-neutral-400 shrink-0 mt-0.5" />
                          <span className="line-clamp-2">{reward.terms}</span>
                        </div>
                      )}
                    </div>

                    {/* Bottom Action & Price */}
                    <div className="mt-6 pt-4 border-t border-neutral-900 flex items-center justify-between">
                      <div>
                        {pricing.hasActiveOffer && (
                          <span className="text-[10px] text-neutral-500 line-through font-mono block">
                            {pricing.normalPrice} NC
                          </span>
                        )}
                        <div className="text-lg font-black font-mono text-amber-300 flex items-center gap-1">
                          <span>🪙</span>
                          <span>{pricing.cost}</span>
                          <span className="text-xs font-sans text-amber-500 font-bold">NC</span>
                        </div>
                      </div>

                      <button
                        id={`redeem-btn-${reward.id}`}
                        disabled={isOutOfStock || (!!user && !canAfford)}
                        onClick={() => {
                          if (!user) {
                            onOpenAuth('login');
                            return;
                          }
                          if (!canAfford) {
                            return;
                          }
                          setSelectedRewardToRedeem(reward);
                        }}
                        className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                          isOutOfStock
                            ? 'bg-neutral-900 text-neutral-600 cursor-not-allowed border border-neutral-800'
                            : !user
                            ? 'bg-neutral-800 hover:bg-neutral-700 text-white'
                            : canAfford
                            ? 'bg-amber-500 hover:bg-amber-400 text-neutral-950 shadow-[0_0_15px_rgba(245,158,11,0.25)] active:scale-95'
                            : 'bg-neutral-900 text-neutral-500 border border-neutral-800 cursor-not-allowed'
                        }`}
                      >
                        {isOutOfStock
                          ? 'Out of Stock'
                          : !user
                          ? 'Sign In'
                          : canAfford
                          ? 'Redeem'
                          : `Need ${pricing.cost - currentCoins} NC`}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ========================================================
          TAB 2: MY REWARDS → REDEMPTION HISTORY
          ======================================================== */}
      {activeTab === 'PASSES' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
            <div>
              <h3 className="text-base font-black uppercase tracking-wider text-white flex items-center gap-2">
                <span>🎁</span>
                <span>My Rewards → Redemption History</span>
              </h3>
              <p className="text-xs text-neutral-400 mt-0.5">
                Active passes ready to present to Nexus staff, along with your complete reward history.
              </p>
            </div>
          </div>

          {!user ? (
            <div className="p-8 text-center border border-dashed border-neutral-800 rounded-2xl bg-neutral-950/60 max-w-lg mx-auto">
              <QrCode className="w-12 h-12 text-neutral-600 mx-auto mb-3" />
              <h3 className="text-base font-bold text-white">Sign In to View Your Passes</h3>
              <p className="text-xs text-neutral-400 mt-1 mb-4">
                Active redemptions and gaming passes are linked directly to your player account.
              </p>
              <button
                onClick={() => onOpenAuth('login')}
                className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black uppercase text-xs tracking-wider transition-all"
              >
                Sign In to Account
              </button>
            </div>
          ) : redemptions.length === 0 ? (
            <div className="p-12 text-center border border-dashed border-neutral-800 rounded-2xl bg-neutral-950/60 max-w-lg mx-auto">
              <Gift className="w-12 h-12 text-neutral-600 mx-auto mb-3" />
              <h3 className="text-base font-bold text-white">No Redeemed Rewards Yet</h3>
              <p className="text-xs text-neutral-400 mt-1 mb-4">
                Redeem your available Nexus Coins in the rewards catalog to generate an active code for station time or snacks.
              </p>
              <button
                onClick={() => setActiveTab('CATALOG')}
                className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black uppercase text-xs tracking-wider transition-all"
              >
                Explore Rewards Catalog
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {redemptions.map((pass) => {
                const isActive = pass.status === 'ACTIVE' || pass.status === 'APPROVED';
                const isUsed = pass.status === 'USED';
                const isCancelled = pass.status === 'CANCELLED';
                const isExpired = pass.status === 'EXPIRED';

                return (
                  <div
                    key={pass.id}
                    className={`p-6 rounded-2xl bg-neutral-950 border relative overflow-hidden flex flex-col justify-between ${
                      isActive
                        ? 'border-emerald-500/50 shadow-[0_0_25px_rgba(16,185,129,0.12)]'
                        : isUsed
                        ? 'border-neutral-800 opacity-80'
                        : 'border-red-950 opacity-60'
                    }`}
                  >
                    <div>
                      {/* Pass Status Header */}
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <span className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest">
                          NEXUS PASS #{pass.id.substring(4, 10).toUpperCase()}
                        </span>

                        <span
                          className={`px-2.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border flex items-center gap-1.5 ${
                            isActive
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                              : isUsed
                              ? 'bg-rose-950/40 text-rose-300 border-rose-900/60'
                              : isCancelled
                              ? 'bg-amber-950/40 text-amber-300 border-amber-900/60'
                              : 'bg-neutral-800 text-neutral-400 border-neutral-700'
                          }`}
                        >
                          <span>{isActive ? '🟢' : isUsed ? '🔴' : '⚠️'}</span>
                          <span>{isActive ? 'ACTIVE' : isUsed ? 'USED' : pass.status}</span>
                        </span>
                      </div>

                      <h4 className="text-lg font-black text-white flex items-center gap-2">
                        <span>🎁</span>
                        <span>{pass.rewardTitle}</span>
                      </h4>
                      <p className="text-xs text-neutral-400 mt-1">
                        Redeemed: <span className="text-neutral-200 font-mono font-medium">{new Date(pass.createdAt).toLocaleDateString()}</span> ({pass.coinCost} NC)
                      </p>
                      {isUsed && (
                        <p className="text-xs text-rose-300/80 mt-0.5 font-mono">
                          Used: {pass.usedAt ? new Date(pass.usedAt).toLocaleDateString() : 'Recorded'}
                        </p>
                      )}

                      {/* Code Banner */}
                      <div className="mt-4 p-4 rounded-xl bg-neutral-900/90 border border-neutral-800 flex items-center justify-between">
                        <div>
                          <div className="text-[9px] uppercase tracking-widest text-neutral-400 font-mono">
                            {isActive ? 'GIVE THIS CODE TO NEXUS STAFF' : 'REDEMPTION CODE'}
                          </div>
                          <div className="text-2xl font-black font-mono tracking-widest text-amber-300 mt-0.5">
                            {pass.code}
                          </div>
                        </div>

                        <button
                          onClick={() => handleCopyCode(pass.code)}
                          className="p-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white transition-colors flex items-center gap-1.5 text-xs font-bold cursor-pointer"
                          title="Copy Code"
                        >
                          {copiedCode === pass.code ? (
                            <>
                              <Check className="w-4 h-4 text-emerald-400" />
                              <span className="text-emerald-400">Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-4 h-4" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                      </div>

                      {/* Terms / Instructions */}
                      {pass.terms && (
                        <div className="mt-3 text-[11px] text-neutral-400 leading-relaxed">
                          {pass.terms}
                        </div>
                      )}
                    </div>

                    <div className="mt-5 pt-3 border-t border-neutral-900 text-[10px] text-neutral-500 flex items-center justify-between">
                      <span>Account: {pass.playerGamerTag}</span>
                      {pass.verifiedBy && <span>Staff: {pass.verifiedBy}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================
          TAB 3: "HOW IT WORKS" 6-STEP VISUAL INFOGRAPHIC
          ======================================================== */}
      {activeTab === 'HOW_IT_WORKS' && (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-neutral-950 border border-neutral-800">
            <h3 className="text-base font-black uppercase tracking-wider text-white mb-2">
              The Nexus Reward Economy: 6-Step Cycle
            </h3>
            <p className="text-xs text-neutral-400 max-w-2xl leading-relaxed">
              Every match at Nexus Gaming Center has competitive stakes. Follow the 6 simple steps to turn your gameplay into free station hours and rewards.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
              {[
                {
                  step: '01',
                  title: 'PLAY MATCHES',
                  desc: 'Queue for official 1v1 or 5v5 matches across Chess, FC 26, FC 27, Valorant, or CS2.',
                  icon: <Gamepad className="w-5 h-5 text-red-500" />,
                  tag: 'Competitive',
                },
                {
                  step: '02',
                  title: 'WIN & CONFIRM',
                  desc: 'Win your match! Outcomes are officially verified by player mutual declarations or Nexus Admin rulings.',
                  icon: <Trophy className="w-5 h-5 text-yellow-400" />,
                  tag: 'Victory',
                },
                {
                  step: '03',
                  title: 'EARN COINS',
                  desc: 'Winning players receive the configured Nexus Coin reward automatically deposited into their wallet.',
                  icon: <Coins className="w-5 h-5 text-amber-400" />,
                  tag: '+NC Deposit',
                },
                {
                  step: '04',
                  title: 'SAVE & GROW',
                  desc: 'Track your balance in the header wallet. Accumulate coins across tournaments and casual ranked matches.',
                  icon: <CreditCard className="w-5 h-5 text-cyan-400" />,
                  tag: 'Wallet',
                },
                {
                  step: '05',
                  title: 'REDEEM REWARDS',
                  desc: 'Browse the Fidelity Catalog and redeem coins for PC station hours, PS5 passes, energy drinks, or tournament tickets.',
                  icon: <Gift className="w-5 h-5 text-purple-400" />,
                  tag: 'Passes',
                },
                {
                  step: '06',
                  title: 'ENJOY AT DESK',
                  desc: 'Show your unique redemption pass code (e.g. NEXUS-7F82K) to Nexus Gaming Center staff and enjoy!',
                  icon: <CheckCircle2 className="w-5 h-5 text-emerald-400" />,
                  tag: 'Activated',
                },
              ].map((item) => (
                <div
                  key={item.step}
                  className="p-5 rounded-xl bg-neutral-900/60 border border-neutral-800 hover:border-neutral-700 transition-colors flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xl font-black font-mono text-neutral-600">
                        {item.step}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-neutral-800 text-neutral-300">
                        {item.tag}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 mb-2">
                      {item.icon}
                      <h4 className="text-sm font-black uppercase tracking-wider text-white">
                        {item.title}
                      </h4>
                    </div>

                    <p className="text-xs text-neutral-400 leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* CTA to start playing */}
            <div className="mt-8 p-4 rounded-xl bg-neutral-900 border border-neutral-800 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-xs text-neutral-300">
                <span className="font-bold text-white block">Ready to earn your first coins?</span>
                Create or join a ranked match in the Nexus lobby.
              </div>
              {onOpenCreateMatch && (
                <button
                  onClick={onOpenCreateMatch}
                  className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-black uppercase text-xs tracking-wider transition-all shadow-md shrink-0 cursor-pointer"
                >
                  Create Match Now
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          CONFIRMATION REDEMPTION MODAL
          ======================================================== */}
      {selectedRewardToRedeem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-md bg-neutral-950 border border-neutral-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <Gift className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black uppercase tracking-wider text-white">
                  Confirm Redemption
                </h3>
                <p className="text-xs text-neutral-400">Nexus Gaming Center Reward Pass</p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-neutral-900/80 border border-neutral-800 space-y-2">
              <div className="text-sm font-bold text-white">{selectedRewardToRedeem.title}</div>
              <p className="text-xs text-neutral-400">{selectedRewardToRedeem.description}</p>

              {selectedRewardToRedeem.terms && (
                <div className="mt-2 text-[10px] text-neutral-500 border-t border-neutral-800 pt-2">
                  <span className="font-bold">Terms:</span> {selectedRewardToRedeem.terms}
                </div>
              )}
            </div>

            {(() => {
              const pricing = getEffectiveRewardCost(selectedRewardToRedeem);
              const remaining = currentCoins - pricing.cost;
              const canAfford = currentCoins >= pricing.cost;
              return (
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between text-neutral-400">
                    <span>Reward Cost:</span>
                    <span className="font-mono font-bold text-amber-300">🪙 {pricing.cost} NC</span>
                  </div>
                  <div className="flex justify-between text-neutral-400">
                    <span>Current Balance:</span>
                    <span className="font-mono">{currentCoins} NC</span>
                  </div>
                  <div className="flex justify-between text-white font-bold border-t border-neutral-800 pt-2">
                    <span>Balance After Redemption:</span>
                    <span className={`font-mono ${remaining >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {remaining} NC
                    </span>
                  </div>
                  {!canAfford && (
                    <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-300">
                      ⚠️ Insufficient Nexus Coins. You need {pricing.cost - currentCoins} more NC to unlock this reward.
                    </div>
                  )}
                </div>
              );
            })()}

            {redeemError && (
              <div className="p-3 rounded-lg bg-red-950/60 border border-red-800 text-xs text-red-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                <span>{redeemError}</span>
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <button
                disabled={redeemLoading}
                onClick={() => setSelectedRewardToRedeem(null)}
                className="flex-1 py-2.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-neutral-300 font-bold text-xs uppercase tracking-wider transition-colors"
              >
                Cancel
              </button>
              {(() => {
                const pricing = getEffectiveRewardCost(selectedRewardToRedeem);
                const canAfford = currentCoins >= pricing.cost;
                return (
                  <button
                    disabled={redeemLoading || !canAfford}
                    onClick={handleConfirmRedeem}
                    className={`flex-1 py-2.5 rounded-xl font-black uppercase text-xs tracking-wider transition-all flex items-center justify-center gap-2 ${
                      !canAfford
                        ? 'bg-neutral-800 text-neutral-500 cursor-not-allowed border border-neutral-700'
                        : 'bg-amber-500 hover:bg-amber-400 text-neutral-950 shadow-[0_0_15px_rgba(245,158,11,0.3)] active:scale-95 cursor-pointer'
                    }`}
                  >
                    {redeemLoading ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-neutral-950 border-t-transparent rounded-full animate-spin" />
                        <span>PROCESSING...</span>
                      </>
                    ) : !canAfford ? (
                      <span>Need {pricing.cost - currentCoins} More NC</span>
                    ) : (
                      <span>Confirm & Deduct</span>
                    )}
                  </button>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          REDEMPTION SUCCESS MODAL (PLAYER EXPERIENCE)
          ======================================================== */}
      {redemptionSuccessPass && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="w-full max-w-md bg-neutral-950 border border-emerald-500/50 rounded-2xl p-6 shadow-2xl space-y-4 text-center">
            <div className="w-14 h-14 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mx-auto text-2xl">
              🎁
            </div>

            <div className="space-y-1">
              <h3 className="text-xl font-black text-white tracking-wider">
                🎁 REWARD READY
              </h3>
              <p className="text-xs text-neutral-300">
                Reward: <span className="text-white font-bold">{redemptionSuccessPass.rewardTitle}</span>
              </p>
              <p className="text-xs text-neutral-400">
                NC spent: <span className="text-amber-400 font-mono font-bold">{redemptionSuccessPass.coinCost} NC</span>
              </p>
            </div>

            {/* Status & Code Display */}
            <div className="p-4 rounded-xl bg-neutral-900 border border-neutral-800 space-y-3">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                <span>🟢</span>
                <span>ACTIVE — SHOW THIS CODE TO STAFF</span>
              </div>

              <div>
                <div className="text-[10px] uppercase font-mono tracking-widest text-neutral-400">
                  CODE
                </div>
                <div className="text-3xl font-black font-mono tracking-widest text-amber-300 mt-1">
                  {redemptionSuccessPass.code}
                </div>
              </div>

              <p className="text-xs text-neutral-300 italic pt-1">
                “Give this code to Nexus staff when you want to receive your reward.”
              </p>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => handleCopyCode(redemptionSuccessPass.code)}
                className="flex-1 py-2.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white font-bold text-xs uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {copiedCode === redemptionSuccessPass.code ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>Copy Code</span>
                  </>
                )}
              </button>
              <button
                onClick={() => {
                  setRedemptionSuccessPass(null);
                  setActiveTab('PASSES');
                }}
                className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black uppercase text-xs tracking-wider transition-all cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
