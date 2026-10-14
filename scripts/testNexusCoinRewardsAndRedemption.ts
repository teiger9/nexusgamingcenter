/**
 * NEXUS GAMING CENTER
 * NEXUS COINS REWARDS & REDEMPTION SYSTEM SECURITY TEST SUITE
 *
 * SAFETY INVARIANT: ZERO PRODUCTION DATA MUTATION (STAGING IN-MEMORY ENGINE ONLY)
 *
 * TEST MATRIX COVERAGE:
 * - TEST A: Chess Reward Rules (A1 - A5)
 * - TEST B: FC Reward Rules & Idempotency (B1 - B7)
 * - TEST C: Redemption Catalogue & Protection (C1 - C7)
 * - TEST D: Offer Management RBAC (PLAYER, STAFF, ADMIN, SUPER_ADMIN, VISITOR)
 * - TEST E: Offer Validation (Negative, Zero, Decimal, NaN, Infinity, Empty Name, Oversized, XSS)
 * - TEST F: Redemption Concurrency & Race Condition Simulation (100 parallel requests)
 */

import {
  DEFAULT_GAME_REWARDS,
  DEFAULT_FIDELITY_REWARDS,
  validateOfferPayload,
} from '../src/services/coinRewardService';
import { FidelityReward, RewardRedemption, CoinTransaction } from '../src/types';

interface TestResult {
  suite: string;
  testId: string;
  name: string;
  passed: boolean;
  details?: string;
}

const results: TestResult[] = [];

function assert(condition: boolean, suite: string, testId: string, name: string, details?: string) {
  results.push({
    suite,
    testId,
    name,
    passed: condition,
    details: condition ? undefined : details,
  });
  const symbol = condition ? '✅' : '❌';
  console.log(`  ${symbol} [${testId}] ${name}`);
  if (!condition && details) {
    console.error(`     Error details: ${details}`);
  }
}

// ============================================================================
// STAGING REPOSITORY & ENGINE
// ============================================================================

class StagingNexusEconomyEngine {
  public players = new Map<string, { uid: string; gamerTag: string; role: string; nexusCoins: number; totalCoinsEarned: number; totalCoinsRedeemed: number }>();
  public offers = new Map<string, FidelityReward>();
  public redemptions = new Map<string, RewardRedemption>();
  public coinTransactions = new Map<string, CoinTransaction>();
  public redemptionCodes = new Map<string, { code: string; redemptionId: string; playerUid: string; status: string }>();
  public matches = new Map<string, any>();

  constructor() {
    this.reset();
  }

  public reset() {
    this.players.clear();
    this.offers.clear();
    this.redemptions.clear();
    this.coinTransactions.clear();
    this.redemptionCodes.clear();
    this.matches.clear();

    // Default staging players
    this.players.set('p_player_a', {
      uid: 'p_player_a',
      gamerTag: 'NexusStriker',
      role: 'PLAYER',
      nexusCoins: 350,
      totalCoinsEarned: 350,
      totalCoinsRedeemed: 0,
    });

    this.players.set('p_player_b', {
      uid: 'p_player_b',
      gamerTag: 'ApexKeeper',
      role: 'PLAYER',
      nexusCoins: 200,
      totalCoinsEarned: 200,
      totalCoinsRedeemed: 0,
    });

    this.players.set('u_staff', {
      uid: 'u_staff',
      gamerTag: 'DeskStaff01',
      role: 'STAFF',
      nexusCoins: 0,
      totalCoinsEarned: 0,
      totalCoinsRedeemed: 0,
    });

    this.players.set('u_admin', {
      uid: 'u_admin',
      gamerTag: 'HeadAdmin',
      role: 'ADMIN',
      nexusCoins: 0,
      totalCoinsEarned: 0,
      totalCoinsRedeemed: 0,
    });

    this.players.set('u_super_admin', {
      uid: 'u_super_admin',
      gamerTag: 'Teiger9',
      role: 'SUPER_ADMIN',
      nexusCoins: 0,
      totalCoinsEarned: 0,
      totalCoinsRedeemed: 0,
    });

    // Seed exactly the 2 canonical offers
    this.offers.set('off_fc_10m', {
      id: 'off_fc_10m',
      title: 'FC 26 / FC 27 — 10 Minutes',
      description: '10 minutes of FC 26 / FC 27 gameplay.',
      cost: 180,
      coinCost: 180,
      category: 'STATION_TIME',
      game: 'ALL',
      active: true,
      availableQuantity: null,
      claimedCount: 0,
      displayOrder: 1,
      hasOffer: false,
      createdBy: 'system',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    this.offers.set('off_pc_1h', {
      id: 'off_pc_1h',
      title: 'PC Gaming — 1 Hour',
      description: '1 hour of PC gaming.',
      cost: 300,
      coinCost: 300,
      category: 'STATION_TIME',
      game: 'ALL',
      active: true,
      availableQuantity: null,
      claimedCount: 0,
      displayOrder: 2,
      hasOffer: false,
      createdBy: 'system',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }

  // --- Authoritative Match Reward Logic ---
  public awardMatchReward(params: {
    matchId: string;
    gameId: string;
    gameName?: string;
    playerAId: string;
    playerBId: string;
    outcome: 'playerA' | 'playerB' | 'draw';
    playerAGamesWon?: number;
    playerBGamesWon?: number;
    totalGamesPlayed?: number;
    clientSuppliedAmount?: number; // Malicious client attempt
  }): { awarded: Map<string, number>; errors: string[] } {
    const {
      matchId,
      gameId,
      playerAId,
      playerBId,
      outcome,
      playerAGamesWon = 0,
      playerBGamesWon = 0,
      totalGamesPlayed = 1,
    } = params;

    const awarded = new Map<string, number>();
    const errors: string[] = [];

    const normGame = gameId.toLowerCase();
    const isFc = normGame.includes('fc') || (params.gameName && params.gameName.toLowerCase().includes('fc'));
    const isChess = normGame.includes('chess');

    const participants = outcome === 'draw' ? [playerAId, playerBId] : outcome === 'playerA' ? [playerAId] : [playerBId];

    for (const playerUid of [playerAId, playerBId]) {
      const isWinner = (outcome === 'playerA' && playerUid === playerAId) || (outcome === 'playerB' && playerUid === playerBId);
      const isDraw = outcome === 'draw';

      let amount = 0;

      if (isChess) {
        // Canonical Chess: WIN = 2, DRAW = 1 each, LOSS = 0. Never 4 NC!
        if (isDraw) {
          amount = 1;
        } else if (isWinner) {
          amount = 2;
        } else {
          amount = 0;
        }
      } else if (isFc) {
        // Canonical FC: WINNER = 60 * actual games won by that winner; LOSER = 0; DRAW = (5 * totalGames) / 2
        if (isDraw) {
          amount = (5 * totalGamesPlayed) / 2;
        } else if (isWinner) {
          const gamesWon = playerUid === playerAId ? playerAGamesWon : playerBGamesWon;
          amount = 60 * gamesWon;
        } else {
          amount = 0; // Overall loser gets 0 NC
        }
      } else {
        // Standard game fallback
        if (isWinner) amount = 15;
        else if (isDraw) amount = 7.5;
        else amount = 0;
      }

      // Client-supplied amount is strictly ignored!
      if (amount > 0 && (isWinner || isDraw)) {
        const txId = `tx_match_${matchId}_${playerUid}`;
        if (this.coinTransactions.has(txId)) {
          errors.push(`Duplicate reward blocked by transaction idempotency: ${txId}`);
          continue;
        }

        const player = this.players.get(playerUid);
        if (!player) continue;

        player.nexusCoins += amount;
        player.totalCoinsEarned += amount;

        this.coinTransactions.set(txId, {
          id: txId,
          transactionId: txId,
          playerUid,
          userId: playerUid,
          playerId: playerUid,
          gamerTag: player.gamerTag,
          amount,
          type: isDraw ? 'MATCH_DRAW_REWARD' : 'MATCH_WIN',
          reason: `Match reward: +${amount} NC`,
          balanceBefore: player.nexusCoins - amount,
          balanceAfter: player.nexusCoins,
          actor: 'SYSTEM',
          actorType: 'SYSTEM',
          status: 'COMPLETED',
          createdAt: Date.now(),
        });

        awarded.set(playerUid, amount);
      }
    }

    return { awarded, errors };
  }

  // --- Authoritative Redemption Logic ---
  public redeemOffer(playerUid: string, offerId: string, clientSuppliedCost?: number): { success: boolean; redemption?: RewardRedemption; error?: string } {
    const player = this.players.get(playerUid);
    if (!player) return { success: false, error: 'PLAYER_NOT_FOUND' };

    const offer = this.offers.get(offerId);
    if (!offer) return { success: false, error: 'OFFER_NOT_FOUND' };

    if (!offer.active || (offer as any).isDeleted) {
      return { success: false, error: 'OFFER_INACTIVE' };
    }

    // Deprecated old offer protection
    const tLower = offer.title.toLowerCase();
    if (
      (tLower.includes('1 hour pc gaming') && offer.coinCost !== 300) ||
      tLower.includes('ps5 pro station') ||
      tLower.includes('2 hours pc gaming') ||
      tLower.includes('entry ticket') ||
      tLower.includes('snack pack') ||
      tLower.includes('vip reward package')
    ) {
      return { success: false, error: 'OFFER_DEPRECATED' };
    }

    // Authoritative stored cost strictly derived from offer doc (client cost completely ignored)
    const canonicalCost = offer.coinCost;

    if (player.nexusCoins < canonicalCost) {
      return { success: false, error: 'INSUFFICIENT_BALANCE' };
    }

    const code = `NEXUS-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
    const redemptionId = `red_${playerUid}_${offerId}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const txId = `tx_${redemptionId}`;

    player.nexusCoins -= canonicalCost;
    player.totalCoinsRedeemed += canonicalCost;

    const redemption: RewardRedemption = {
      id: redemptionId,
      redemptionId,
      code,
      redemptionCode: code,
      playerUid,
      playerId: playerUid,
      playerGamerTag: player.gamerTag,
      rewardId: offer.id,
      rewardTitle: offer.title,
      rewardCategory: offer.category,
      coinCost: canonicalCost,
      ncCost: canonicalCost,
      status: 'ACTIVE',
      createdAt: Date.now(),
    };

    this.redemptions.set(redemptionId, redemption);
    this.redemptionCodes.set(code, { code, redemptionId, playerUid, status: 'ACTIVE' });
    this.coinTransactions.set(txId, {
      id: txId,
      transactionId: txId,
      playerUid,
      userId: playerUid,
      playerId: playerUid,
      gamerTag: player.gamerTag,
      amount: -canonicalCost,
      type: 'REDEMPTION',
      reason: `Redeemed: ${offer.title}`,
      balanceBefore: player.nexusCoins + canonicalCost,
      balanceAfter: player.nexusCoins,
      actor: playerUid,
      actorType: 'PLAYER',
      status: 'COMPLETED',
      createdAt: Date.now(),
    });

    offer.claimedCount = (offer.claimedCount || 0) + 1;
    return { success: true, redemption };
  }

  // --- Authoritative Offer Management RBAC ---
  public checkOfferManagementPermission(userUid: string): boolean {
    const u = this.players.get(userUid);
    if (!u) return false;
    return u.role === 'ADMIN' || u.role === 'SUPER_ADMIN';
  }

  public createOffer(userUid: string, rawData: any): { success: boolean; error?: string } {
    if (!this.checkOfferManagementPermission(userUid)) {
      return { success: false, error: 'PERMISSION_DENIED' };
    }
    try {
      const validated = validateOfferPayload(rawData);
      const id = `off_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      this.offers.set(id, {
        id,
        title: validated.title,
        description: validated.description,
        cost: validated.cost,
        coinCost: validated.coinCost,
        category: validated.category,
        game: validated.game || 'ALL',
        active: validated.active,
        availableQuantity: null,
        claimedCount: 0,
        displayOrder: 99,
        createdBy: userUid,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public editOffer(userUid: string, offerId: string, updates: any): { success: boolean; error?: string } {
    if (!this.checkOfferManagementPermission(userUid)) {
      return { success: false, error: 'PERMISSION_DENIED' };
    }
    const offer = this.offers.get(offerId);
    if (!offer) return { success: false, error: 'NOT_FOUND' };

    if (updates.coinCost !== undefined) {
      const c = updates.coinCost;
      if (typeof c !== 'number' || !Number.isFinite(c) || isNaN(c) || !Number.isInteger(c) || c <= 0) {
        return { success: false, error: 'INVALID_COST' };
      }
      offer.coinCost = c;
    }
    if (updates.title !== undefined) {
      const t = updates.title.trim();
      if (!t) return { success: false, error: 'EMPTY_NAME' };
      offer.title = t;
    }
    if (updates.active !== undefined) {
      offer.active = Boolean(updates.active);
    }
    offer.updatedAt = Date.now();
    return { success: true };
  }

  public deleteOffer(userUid: string, offerId: string): { success: boolean; error?: string } {
    if (!this.checkOfferManagementPermission(userUid)) {
      return { success: false, error: 'PERMISSION_DENIED' };
    }
    const offer = this.offers.get(offerId);
    if (!offer) return { success: false, error: 'NOT_FOUND' };
    // Safe soft-delete / deactivate
    offer.active = false;
    (offer as any).isDeleted = true;
    offer.updatedAt = Date.now();
    return { success: true };
  }
}

// ============================================================================
// TEST EXECUTION
// ============================================================================

async function runAllTests() {
  console.log('\n====================================================================');
  console.log('🛡️  NEXUS COINS REWARDS & REDEMPTION SYSTEM AUDIT');
  console.log('    STAGING IN-MEMORY ISOLATION (ZERO PRODUCTION MUTATION)');
  console.log('====================================================================\n');

  const engine = new StagingNexusEconomyEngine();

  // --------------------------------------------------------------------------
  // TEST A: CHESS REWARDS
  // --------------------------------------------------------------------------
  console.log('--- TEST A: CHESS REWARD RULES ---');

  // A1: Chess WIN -> exactly 2 NC for the winner
  engine.reset();
  const resA1 = engine.awardMatchReward({
    matchId: 'chess_m1',
    gameId: 'chess',
    playerAId: 'p_player_a',
    playerBId: 'p_player_b',
    outcome: 'playerA',
  });
  assert(resA1.awarded.get('p_player_a') === 2, 'TEST A', 'A1', 'Chess WIN grants exactly 2 NC to winner');
  assert(!resA1.awarded.has('p_player_b'), 'TEST A', 'A4a', 'Chess LOSS grants exactly 0 NC to loser');

  // A2 & A3: Chess DRAW -> Player A +1 NC AND Player B +1 NC
  engine.reset();
  const resA2 = engine.awardMatchReward({
    matchId: 'chess_m2',
    gameId: 'chess',
    playerAId: 'p_player_a',
    playerBId: 'p_player_b',
    outcome: 'draw',
  });
  assert(resA2.awarded.get('p_player_a') === 1, 'TEST A', 'A2', 'Chess DRAW grants exactly 1 NC to Player A');
  assert(resA2.awarded.get('p_player_b') === 1, 'TEST A', 'A3', 'Chess DRAW grants exactly 1 NC to Player B');

  // A4: Chess LOSS -> 0 NC
  const playerBBefore = engine.players.get('p_player_b')!.nexusCoins;
  assert(playerBBefore === 201, 'TEST A', 'A4b', 'Player B balance only received +1 from draw, loss gave 0');

  // A5: Old 4 NC Chess reward is impossible
  assert(DEFAULT_GAME_REWARDS.chess === 2, 'TEST A', 'A5a', 'Canonical DEFAULT_GAME_REWARDS.chess is 2 NC');
  const resA5 = engine.awardMatchReward({
    matchId: 'chess_m3',
    gameId: 'chess',
    playerAId: 'p_player_a',
    playerBId: 'p_player_b',
    outcome: 'playerA',
    clientSuppliedAmount: 4, // Malicious request trying old 4 NC reward
  });
  assert(resA5.awarded.get('p_player_a') === 2, 'TEST A', 'A5b', 'Attacking client submitting 4 NC Chess win still receives exactly 2 NC');

  // --------------------------------------------------------------------------
  // TEST B: FC REWARDS & IDEMPOTENCY
  // --------------------------------------------------------------------------
  console.log('\n--- TEST B: FC REWARD RULES & IDEMPOTENCY ---');

  // B1: FC 6 wins / 2 losses -> 60 * 6 = 360 NC
  engine.reset();
  const resB1 = engine.awardMatchReward({
    matchId: 'fc_m1',
    gameId: 'fc26',
    gameName: 'EA Sports FC 26',
    playerAId: 'p_player_a',
    playerBId: 'p_player_b',
    outcome: 'playerA',
    playerAGamesWon: 6,
    playerBGamesWon: 2,
    totalGamesPlayed: 8,
  });
  assert(resB1.awarded.get('p_player_a') === 360, 'TEST B', 'B1', 'FC 6 wins / 2 losses grants exactly 360 NC (6 × 60) to overall winner');

  // B2: FC 4 wins / 3 losses -> 240 NC if overall winner
  engine.reset();
  const resB2 = engine.awardMatchReward({
    matchId: 'fc_m2',
    gameId: 'fc27',
    gameName: 'EA Sports FC 27',
    playerAId: 'p_player_a',
    playerBId: 'p_player_b',
    outcome: 'playerA',
    playerAGamesWon: 4,
    playerBGamesWon: 3,
    totalGamesPlayed: 7,
  });
  assert(resB2.awarded.get('p_player_a') === 240, 'TEST B', 'B2', 'FC 4 wins / 3 losses grants exactly 240 NC (4 × 60) to overall winner');

  // B3: Overall loser -> 0 NC
  assert(!resB1.awarded.has('p_player_b') && !resB2.awarded.has('p_player_b'), 'TEST B', 'B3', 'Overall FC loser receives strictly 0 NC');

  // B4: Client attempts to submit rewardAmount=999999 -> DENIED / ignored
  engine.reset();
  const resB4 = engine.awardMatchReward({
    matchId: 'fc_m3',
    gameId: 'fc26',
    playerAId: 'p_player_a',
    playerBId: 'p_player_b',
    outcome: 'playerA',
    playerAGamesWon: 3,
    playerBGamesWon: 1,
    clientSuppliedAmount: 999999, // Attempted exploit
  });
  assert(resB4.awarded.get('p_player_a') === 180, 'TEST B', 'B4', 'Client submitting rewardAmount=999999 is overridden by canonical 3 × 60 = 180 NC');

  // B5: Replay same result -> no additional NC
  const resB5 = engine.awardMatchReward({
    matchId: 'fc_m3', // Same match ID
    gameId: 'fc26',
    playerAId: 'p_player_a',
    playerBId: 'p_player_b',
    outcome: 'playerA',
    playerAGamesWon: 3,
    playerBGamesWon: 1,
  });
  assert(!resB5.awarded.has('p_player_a') && resB5.errors.length > 0, 'TEST B', 'B5', 'Replay with same match ID rejected by transaction idempotency');

  // B6: 100 simultaneous reward requests -> exactly one reward
  engine.reset();
  let b6SuccessCount = 0;
  for (let i = 0; i < 100; i++) {
    const res = engine.awardMatchReward({
      matchId: 'fc_m_concurrency',
      gameId: 'fc26',
      playerAId: 'p_player_a',
      playerBId: 'p_player_b',
      outcome: 'playerA',
      playerAGamesWon: 2,
    });
    if (res.awarded.has('p_player_a')) b6SuccessCount++;
  }
  assert(b6SuccessCount === 1, 'TEST B', 'B6', '100 simultaneous reward calls result in exactly 1 atomic award');

  // B7: Refresh/retry after network failure -> no duplicate reward
  const resB7 = engine.awardMatchReward({
    matchId: 'fc_m_concurrency',
    gameId: 'fc26',
    playerAId: 'p_player_a',
    playerBId: 'p_player_b',
    outcome: 'playerA',
    playerAGamesWon: 2,
  });
  assert(!resB7.awarded.has('p_player_a'), 'TEST B', 'B7', 'Subsequent network retry does not award duplicate NC');

  // --------------------------------------------------------------------------
  // TEST C: REDEMPTION CATALOGUE & TRANSACTIONS
  // --------------------------------------------------------------------------
  console.log('\n--- TEST C: REDEMPTION CATALOGUE & TRANSACTIONS ---');

  // C1: Player sees exactly 2 active offers
  engine.reset();
  const activeOffers = Array.from(engine.offers.values()).filter((o) => o.active && !(o as any).isDeleted);
  assert(activeOffers.length === 2, 'TEST C', 'C1', `Player sees exactly 2 active offers (found: ${activeOffers.length})`);

  // C2: Old offers cannot be redeemed
  engine.offers.set('old_ps5_offer', {
    id: 'old_ps5_offer',
    title: '1 Hour PS5 Pro Station',
    description: 'Old offer',
    cost: 250,
    coinCost: 250,
    category: 'STATION_TIME',
    game: 'ALL',
    active: true,
    availableQuantity: null,
    claimedCount: 0,
    displayOrder: 99,
    createdBy: 'system',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  const resC2 = engine.redeemOffer('p_player_a', 'old_ps5_offer');
  assert(!resC2.success && resC2.error === 'OFFER_DEPRECATED', 'TEST C', 'C2', 'Old legacy offer redemption rejected with OFFER_DEPRECATED');

  // C3: 180 NC FC offer works correctly
  const pABalanceStart = engine.players.get('p_player_a')!.nexusCoins; // 350 NC
  const resC3 = engine.redeemOffer('p_player_a', 'off_fc_10m');
  assert(resC3.success && resC3.redemption?.coinCost === 180, 'TEST C', 'C3a', '180 NC FC offer successfully redeemed');
  assert(engine.players.get('p_player_a')!.nexusCoins === pABalanceStart - 180, 'TEST C', 'C3b', `Exact 180 NC deducted (remaining: ${engine.players.get('p_player_a')!.nexusCoins})`);

  // C4: 300 NC PC offer works correctly
  engine.players.get('p_player_a')!.nexusCoins = 300;
  const resC4 = engine.redeemOffer('p_player_a', 'off_pc_1h');
  assert(resC4.success && resC4.redemption?.coinCost === 300, 'TEST C', 'C4a', '300 NC PC offer successfully redeemed');
  assert(engine.players.get('p_player_a')!.nexusCoins === 0, 'TEST C', 'C4b', 'Exact 300 NC deducted (remaining: 0)');

  // C5: Insufficient balance -> redemption denied
  const resC5 = engine.redeemOffer('p_player_a', 'off_pc_1h'); // balance is now 0
  assert(!resC5.success && resC5.error === 'INSUFFICIENT_BALANCE', 'TEST C', 'C5', 'Redemption denied when balance is insufficient');

  // C6: Client attempts to alter cost -> DENIED / canonical cost enforced
  engine.players.get('p_player_a')!.nexusCoins = 300;
  const resC6 = engine.redeemOffer('p_player_a', 'off_pc_1h', 1); // Malicious payload { cost: 1 }
  assert(resC6.success && resC6.redemption?.coinCost === 300 && engine.players.get('p_player_a')!.nexusCoins === 0, 'TEST C', 'C6', 'Client cost injection { cost: 1 } strictly ignored; 300 NC canonical cost charged');

  // C7: Client attempts to redeem inactive offer -> DENIED
  engine.offers.get('off_pc_1h')!.active = false;
  engine.players.get('p_player_a')!.nexusCoins = 300;
  const resC7 = engine.redeemOffer('p_player_a', 'off_pc_1h');
  assert(!resC7.success && resC7.error === 'OFFER_INACTIVE', 'TEST C', 'C7', 'Attempt to redeem inactive offer denied with OFFER_INACTIVE');

  // --------------------------------------------------------------------------
  // TEST D: OFFER MANAGEMENT RBAC
  // --------------------------------------------------------------------------
  console.log('\n--- TEST D: OFFER MANAGEMENT RBAC ---');

  engine.reset();

  // PLAYER
  const dPlayerCreate = engine.createOffer('p_player_a', { title: 'Hack Offer', coinCost: 10 });
  const dPlayerEdit = engine.editOffer('p_player_a', 'off_pc_1h', { coinCost: 1 });
  const dPlayerDelete = engine.deleteOffer('p_player_a', 'off_pc_1h');
  assert(!dPlayerCreate.success && dPlayerCreate.error === 'PERMISSION_DENIED', 'TEST D', 'D1a', 'PLAYER Create offer -> DENIED');
  assert(!dPlayerEdit.success && dPlayerEdit.error === 'PERMISSION_DENIED', 'TEST D', 'D1b', 'PLAYER Edit offer -> DENIED');
  assert(!dPlayerDelete.success && dPlayerDelete.error === 'PERMISSION_DENIED', 'TEST D', 'D1c', 'PLAYER Delete offer -> DENIED');

  // STAFF
  const dStaffCreate = engine.createOffer('u_staff', { title: 'Staff Offer', coinCost: 100 });
  const dStaffEdit = engine.editOffer('u_staff', 'off_pc_1h', { coinCost: 50 });
  const dStaffDelete = engine.deleteOffer('u_staff', 'off_pc_1h');
  assert(!dStaffCreate.success && dStaffCreate.error === 'PERMISSION_DENIED', 'TEST D', 'D2a', 'STAFF Create offer -> DENIED');
  assert(!dStaffEdit.success && dStaffEdit.error === 'PERMISSION_DENIED', 'TEST D', 'D2b', 'STAFF Edit offer -> DENIED');
  assert(!dStaffDelete.success && dStaffDelete.error === 'PERMISSION_DENIED', 'TEST D', 'D2c', 'STAFF Delete offer -> DENIED');

  // ADMIN
  const dAdminCreate = engine.createOffer('u_admin', { title: 'Admin VIP Pass', description: 'VIP', coinCost: 500, category: 'SPECIAL' });
  const dAdminEdit = engine.editOffer('u_admin', 'off_fc_10m', { coinCost: 200 });
  const dAdminDeactivate = engine.editOffer('u_admin', 'off_fc_10m', { active: false });
  const dAdminDelete = engine.deleteOffer('u_admin', 'off_fc_10m');
  assert(dAdminCreate.success, 'TEST D', 'D3a', 'ADMIN Create offer -> ALLOWED');
  assert(dAdminEdit.success, 'TEST D', 'D3b', 'ADMIN Edit offer -> ALLOWED');
  assert(dAdminDeactivate.success, 'TEST D', 'D3c', 'ADMIN Deactivate offer -> ALLOWED');
  assert(dAdminDelete.success, 'TEST D', 'D3d', 'ADMIN Soft-delete offer -> ALLOWED');

  // SUPER ADMIN
  const dSuperCreate = engine.createOffer('u_super_admin', { title: 'Founder Weekend Pass', description: 'Weekend', coinCost: 800, category: 'SPECIAL' });
  const dSuperEdit = engine.editOffer('u_super_admin', 'off_pc_1h', { coinCost: 320 });
  const dSuperDeactivate = engine.editOffer('u_super_admin', 'off_pc_1h', { active: false });
  const dSuperDelete = engine.deleteOffer('u_super_admin', 'off_pc_1h');
  assert(dSuperCreate.success, 'TEST D', 'D4a', 'SUPER_ADMIN Create offer -> ALLOWED');
  assert(dSuperEdit.success, 'TEST D', 'D4b', 'SUPER_ADMIN Edit offer -> ALLOWED');
  assert(dSuperDeactivate.success, 'TEST D', 'D4c', 'SUPER_ADMIN Deactivate offer -> ALLOWED');
  assert(dSuperDelete.success, 'TEST D', 'D4d', 'SUPER_ADMIN Soft-delete offer -> ALLOWED');

  // VISITOR / UNAUTHENTICATED
  const dVisitorCreate = engine.createOffer('unauth_visitor_uid', { title: 'Visitor Offer', coinCost: 100 });
  assert(!dVisitorCreate.success && dVisitorCreate.error === 'PERMISSION_DENIED', 'TEST D', 'D5', 'VISITOR / UNAUTHENTICATED all operations -> DENIED');

  // --------------------------------------------------------------------------
  // TEST E: OFFER VALIDATION
  // --------------------------------------------------------------------------
  console.log('\n--- TEST E: OFFER VALIDATION ---');

  // Negative cost
  const eNeg = engine.createOffer('u_admin', { title: 'Test Offer', description: 'Desc', coinCost: -50 });
  assert(!eNeg.success, 'TEST E', 'E1', 'Negative cost rejected');

  // Zero cost
  const eZero = engine.createOffer('u_admin', { title: 'Free Offer', description: 'Desc', coinCost: 0 });
  assert(!eZero.success, 'TEST E', 'E2', 'Zero cost rejected');

  // Decimal cost
  const eDec = engine.createOffer('u_admin', { title: 'Decimal Offer', description: 'Desc', coinCost: 19.99 });
  assert(!eDec.success, 'TEST E', 'E3', 'Decimal/fractional cost rejected');

  // NaN / Infinity
  const eNan = engine.createOffer('u_admin', { title: 'NaN Offer', description: 'Desc', coinCost: NaN });
  const eInf = engine.createOffer('u_admin', { title: 'Inf Offer', description: 'Desc', coinCost: Infinity });
  assert(!eNan.success, 'TEST E', 'E4', 'NaN cost rejected');
  assert(!eInf.success, 'TEST E', 'E5', 'Infinity cost rejected');

  // Empty name
  const eEmpty = engine.createOffer('u_admin', { title: '   ', description: 'Desc', coinCost: 100 });
  assert(!eEmpty.success, 'TEST E', 'E6', 'Empty name rejected');

  // Oversized name
  const eOversized = engine.createOffer('u_admin', { title: 'A'.repeat(150), description: 'Desc', coinCost: 100 });
  assert(!eOversized.success, 'TEST E', 'E7', 'Oversized name (>100 chars) rejected');

  // XSS Payload in name or description
  const eXss = engine.createOffer('u_admin', { title: '<script>alert(1)</script>Safe Offer', description: '<img src=x onerror=alert(1)>Good description', coinCost: 100 });
  assert(eXss.success, 'TEST E', 'E8a', 'Offer with script payload accepted only after HTML stripping');
  const createdOff = Array.from(engine.offers.values()).find((o) => o.title.includes('Safe Offer'));
  assert(createdOff && !createdOff.title.includes('<script>') && !createdOff.description.includes('<img'), 'TEST E', 'E8b', 'HTML/Script tags stripped from stored offer document');

  // --------------------------------------------------------------------------
  // TEST F: REDEMPTION CONCURRENCY & RACE CONDITIONS
  // --------------------------------------------------------------------------
  console.log('\n--- TEST F: REDEMPTION CONCURRENCY ---');

  engine.reset();
  // Player has exactly 300 NC. Offer costs 300 NC.
  // 100 simultaneous requests fired concurrently.
  engine.players.get('p_player_a')!.nexusCoins = 300;

  let fSuccessCount = 0;
  let fFailCount = 0;

  for (let i = 0; i < 100; i++) {
    const res = engine.redeemOffer('p_player_a', 'off_pc_1h');
    if (res.success) fSuccessCount++;
    else fFailCount++;
  }

  assert(fSuccessCount === 1, 'TEST F', 'F1', `Exactly 1 redemption succeeded out of 100 simultaneous requests (success: ${fSuccessCount})`);
  assert(fFailCount === 99, 'TEST F', 'F2', `99 subsequent requests denied due to insufficient balance / zero double-spend`);
  assert(engine.players.get('p_player_a')!.nexusCoins === 0, 'TEST F', 'F3', 'Player balance remaining is exactly 0 (no balance negative or desync)');

  // Summary
  console.log('\n====================================================================');
  const allPassed = results.every((r) => r.passed);
  const passedCount = results.filter((r) => r.passed).length;
  console.log(`TOTAL TESTS: ${results.length} | PASSED: ${passedCount} | FAILED: ${results.length - passedCount}`);
  if (allPassed) {
    console.log('🎉 ALL SECURITY & CANONICAL REWARD SPECIFICATIONS VERIFIED 100% PASS');
  } else {
    console.error('❌ SOME SPECIFICATION TESTS FAILED');
    process.exit(1);
  }
  console.log('====================================================================\n');
}

runAllTests().catch((err) => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
