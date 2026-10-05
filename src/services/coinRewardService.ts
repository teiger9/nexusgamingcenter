import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  runTransaction,
  arrayUnion,
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import {
  CoinTransaction,
  CoinRewardsSettings,
  FidelityReward,
  FidelityRewardCategory,
  RewardRedemption,
  RedemptionStatus,
  Player,
  Game,
  WalletReconciliationResult,
} from '../types';
import { normalizeGameId } from '../lib/ranks';
import { sendNotification } from './notificationService';
import { normalizeUserRole, FOUNDING_SUPER_ADMIN_UID, isAdminUser } from './roleService';

// Helper to remove any undefined fields before writing to Firebase
function cleanUndefined<T extends Record<string, any>>(obj: T): Partial<T> {
  const cleaned: Record<string, any> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val !== undefined) {
      cleaned[key] = val;
    }
  }
  return cleaned as Partial<T>;
}

// ========================================================
// DEFAULT REWARDS CONFIGURATION
// ========================================================
export const DEFAULT_GAME_REWARDS: Record<string, number> = {
  chess: 2,     // Win = 2 NC, Draw = 1 NC each, Loss = 0 NC
  fc26: 60,     // 60 NC × games won by winner (Overall winner only • Loss = 0 NC)
  fc27: 60,     // 60 NC × games won by winner (Overall winner only • Loss = 0 NC)
  fc: 60,       // 60 NC × games won by winner (Overall winner only • Loss = 0 NC)
  valorant: 90, // 5v5 Base Hourly Rate: 90 NC/player/hr (1h=90, 2h=180, 3h=270; Loser: 30 NC/hr; Draw: 45 NC/hr)
  cs2: 90,      // 5v5 Base Hourly Rate: 90 NC/player/hr (1h=90, 2h=180, 3h=270; Loser: 30 NC/hr; Draw: 45 NC/hr)
  lol: 90,      // 5v5 Base Hourly Rate: 90 NC/player/hr (1h=90, 2h=180, 3h=270; Loser: 30 NC/hr; Draw: 45 NC/hr)
  league: 90,   // 5v5 Base Hourly Rate: 90 NC/player/hr (1h=90, 2h=180, 3h=270; Loser: 30 NC/hr; Draw: 45 NC/hr)
};

export const FALLBACK_DEFAULT_REWARD = 15;

// ========================================================
// 1. REWARD SETTINGS MANAGEMENT
// ========================================================

export async function getCoinRewardsSettings(): Promise<CoinRewardsSettings> {
  try {
    const settingsRef = doc(db, 'coinRewardsSettings', 'default');
    const snap = await getDoc(settingsRef);

    if (snap.exists()) {
      const data = snap.data() as CoinRewardsSettings;
      // Auto-migrate canonical rewards if stale (e.g. old chess: 4 or 20, old fc: 5 or 20, old 5v5: 80)
      if (
        data.gameRewards?.chess !== 2 ||
        data.gameRewards?.fc26 !== 60 ||
        data.gameRewards?.fc27 !== 60 ||
        data.gameRewards?.fc !== 60 ||
        data.gameRewards?.valorant !== 90 ||
        data.gameRewards?.cs2 !== 90 ||
        data.gameRewards?.lol !== 90
      ) {
        const updated: CoinRewardsSettings = {
          ...data,
          gameRewards: {
            ...data.gameRewards,
            chess: 2,
            fc26: 60,
            fc27: 60,
            fc: 60,
            valorant: 90,
            cs2: 90,
            lol: 90,
            league: 90,
          },
          updatedAt: Date.now(),
        };
        setDoc(settingsRef, updated, { merge: true }).catch(() => {});
        return updated;
      }
      return data;
    }

    // Initialize default document
    const initialSettings: CoinRewardsSettings = {
      id: 'default',
      gameRewards: { ...DEFAULT_GAME_REWARDS },
      defaultReward: FALLBACK_DEFAULT_REWARD,
      updatedAt: Date.now(),
      updatedBy: 'system',
    };

    await setDoc(settingsRef, initialSettings);
    return initialSettings;
  } catch (err) {
    console.error('getCoinRewardsSettings error:', err);
    return {
      id: 'default',
      gameRewards: { ...DEFAULT_GAME_REWARDS },
      defaultReward: FALLBACK_DEFAULT_REWARD,
      updatedAt: Date.now(),
    };
  }
}

export function subscribeToCoinRewardsSettings(
  callback: (settings: CoinRewardsSettings) => void
): () => void {
  const settingsRef = doc(db, 'coinRewardsSettings', 'default');
  return onSnapshot(
    settingsRef,
    (snap) => {
      if (snap.exists()) {
        callback(snap.data() as CoinRewardsSettings);
      } else {
        // Return default fallback
        callback({
          id: 'default',
          gameRewards: { ...DEFAULT_GAME_REWARDS },
          defaultReward: FALLBACK_DEFAULT_REWARD,
          updatedAt: Date.now(),
        });
      }
    },
    (err) => {
      console.warn('subscribeToCoinRewardsSettings warning:', err);
    }
  );
}

export async function updateCoinRewardsSettings(
  gameRewards: Record<string, number>,
  defaultReward: number,
  adminUid: string
): Promise<void> {
  const settingsRef = doc(db, 'coinRewardsSettings', 'default');
  const payload: CoinRewardsSettings = {
    id: 'default',
    gameRewards,
    defaultReward,
    updatedAt: Date.now(),
    updatedBy: adminUid,
  };
  await setDoc(settingsRef, payload, { merge: true });
}

// ========================================================
// 2. ATOMIC MATCH WIN REWARDS (IDEMPOTENT)
// ========================================================

/**
 * Awards coins to winning players exactly once per confirmed match.
 * Uses atomic Firestore transactions with deterministic transaction doc IDs
 * so duplicate calls, page reloads, and race conditions are strictly blocked.
 */
export async function awardMatchWinCoins(params: {
  matchId: string;
  winnerUids: string[];
  gameId: string;
  gameName: string;
  is5v5?: boolean;
  opponentTeamName?: string;
  opponentPlayerName?: string;
  customRewardAmount?: number;
  isDraw?: boolean;
  totalGamesPlayed?: number;
  playerAGamesWon?: number;
  playerBGamesWon?: number;
  seriesWinnerId?: string | 'draw' | null;
}): Promise<{ awardedCount: number; amountPerWinner: number }> {
  const {
    matchId,
    winnerUids,
    gameId,
    gameName,
    is5v5,
    opponentTeamName,
    opponentPlayerName,
    isDraw = false,
    totalGamesPlayed,
    playerAGamesWon,
    playerBGamesWon,
    seriesWinnerId,
  } = params;

  if (!matchId) {
    return { awardedCount: 0, amountPerWinner: 0 };
  }

  const normGame = normalizeGameId(gameId);
  const isFc =
    normGame === 'fc' ||
    (typeof gameId === 'string' && gameId.toLowerCase().includes('fc')) ||
    Boolean(gameName?.toLowerCase().includes('fc'));

  // 1. Calculate exact reward amount according to official Nexus rules
  let baseAmountPerWinner = 0;
  if (normGame === 'chess') {
    // Chess 1v1:
    // WIN: 2 NC for the winner, 0 NC for the loser.
    // DRAW: 1 NC for EACH player.
    // LOSS: 0 NC.
    // A player must NEVER receive 4 NC for a Chess win.
    baseAmountPerWinner = isDraw ? 1 : 2;
  } else if (isFc) {
    // FC 26, FC 27, and existing general FC match system:
    // Reward = 60 NC × number of games won by the player.
    // The reward is granted ONLY if that player wins the overall match/series.
    // If the overall result is a DRAW according to existing FC match rules, preserve existing draw logic.
    if (isDraw) {
      const validTotalGames = typeof totalGamesPlayed === 'number' && totalGamesPlayed > 0 ? totalGamesPlayed : 1;
      baseAmountPerWinner = (5 * validTotalGames) / 2;
    } else {
      baseAmountPerWinner = 60; // 60 NC per game won (computed dynamically per winner below)
    }
  } else if (normGame === 'cs2' || normGame === 'valorant' || normGame === 'lol' || is5v5) {
    // 5v5 CS2, Valorant, League of Legends:
    // Rule: NC Reward = Match Duration (hours) × Team Result Rate (Win: 90 NC/hr, Loss: 30 NC/hr, Draw: 45 NC/hr)
    const rawHours = (params as any).officialHours;
    const hours = typeof rawHours === 'number' && rawHours > 0 ? rawHours : 1.0;
    baseAmountPerWinner = isDraw ? Math.round(45 * hours * 100) / 100 : Math.round(90 * hours * 100) / 100;
  } else if (typeof params.customRewardAmount === 'number' && params.customRewardAmount >= 0) {
    baseAmountPerWinner = isDraw ? params.customRewardAmount / 2 : params.customRewardAmount;
  } else {
    // Fallback for custom or other games:
    const settings = await getCoinRewardsSettings();
    const rawReward = settings.gameRewards[gameId] ?? settings.gameRewards[gameId.toLowerCase()];
    const baseReward = typeof rawReward === 'number' && rawReward > 0 ? rawReward : settings.defaultReward || FALLBACK_DEFAULT_REWARD;
    baseAmountPerWinner = isDraw ? baseReward / 2 : baseReward;
  }

  let awardedCount = 0;

  // 2. Process winners atomically if amount > 0 and winnerUids provided
  if (baseAmountPerWinner > 0 && winnerUids && winnerUids.length > 0) {
    for (const playerUid of winnerUids) {
      if (!playerUid || typeof playerUid !== 'string' || !playerUid.trim()) continue;

      const canonicalTxId = `tx_match_${matchId}_${playerUid}`;
      const legacyTxId = `match_${matchId}_${playerUid}_${isDraw ? 'MATCH_DRAW' : 'MATCH_WIN'}`;
      const legacyTxWinId = `match_${matchId}_${playerUid}_MATCH_WIN`;
      const legacyTxDrawId = `match_${matchId}_${playerUid}_MATCH_DRAW`;
      const legacyTxDrawRewardId = `match_${matchId}_${playerUid}_MATCH_DRAW_REWARD`;

      const txRef = doc(db, 'coinTransactions', canonicalTxId);
      const legacyRef = doc(db, 'coinTransactions', legacyTxId);
      const legacyWinRef = doc(db, 'coinTransactions', legacyTxWinId);
      const legacyDrawRef = doc(db, 'coinTransactions', legacyTxDrawId);
      const legacyDrawRewardRef = doc(db, 'coinTransactions', legacyTxDrawRewardId);
      const playerRef = doc(db, 'players', playerUid);
      const matchDocRef = doc(db, 'matches', matchId);

      try {
        await runTransaction(db, async (transaction) => {
          // Idempotency: Check if already awarded via canonical or legacy transaction ID
          const [txSnap, legacySnap, legacyWinSnap, legacyDrawSnap, legacyDrawRewardSnap, matchSnap] = await Promise.all([
            transaction.get(txRef),
            transaction.get(legacyRef),
            transaction.get(legacyWinRef),
            transaction.get(legacyDrawRef),
            transaction.get(legacyDrawRewardRef),
            transaction.get(matchDocRef),
          ]);

          if (
            txSnap.exists() ||
            legacySnap.exists() ||
            legacyWinSnap.exists() ||
            legacyDrawSnap.exists() ||
            legacyDrawRewardSnap.exists()
          ) {
            return;
          }

          if (matchSnap.exists()) {
            const matchData = matchSnap.data();
            // If match was cancelled, do not award coins
            if (matchData.status === 'CANCELLED') {
              return;
            }
            // Check if player UID is already recorded in coinsAwardedPlayerUids
            if (Array.isArray(matchData.coinsAwardedPlayerUids) && matchData.coinsAwardedPlayerUids.includes(playerUid)) {
              return;
            }
          }

          const playerSnap = await transaction.get(playerRef);
          if (!playerSnap.exists()) {
            return;
          }

          // Compute exact award amount for this specific player
          let amountPerWinner = baseAmountPerWinner;
          let fcGamesWon = 0;
          if (isFc && !isDraw) {
            const matchData = matchSnap.exists() ? (matchSnap.data() as any) : null;
            const effectiveWinnerId =
              seriesWinnerId ||
              matchData?.seriesWinnerId ||
              matchData?.winnerId ||
              (matchData?.outcome === 'playerA' ? matchData?.playerAId : matchData?.outcome === 'playerB' ? matchData?.playerBId : null);

            const isPlayerA = playerUid === matchData?.playerAId;
            const isPlayerB = playerUid === matchData?.playerBId;

            const isWinner =
              (effectiveWinnerId === 'playerA' && isPlayerA) ||
              (effectiveWinnerId === 'playerB' && isPlayerB) ||
              (effectiveWinnerId === playerUid) ||
              (Array.isArray(winnerUids) && winnerUids.length === 1 && winnerUids[0] === playerUid);

            if (!isWinner) {
              // Overall loser in FC series receives strictly 0 NC
              return;
            }

            if (isPlayerA) {
              fcGamesWon = matchData?.playerAGamesWon ?? matchData?.playerASeriesScore?.gamesWon ?? playerAGamesWon ?? 0;
            } else if (isPlayerB) {
              fcGamesWon = matchData?.playerBGamesWon ?? matchData?.playerBSeriesScore?.gamesWon ?? playerBGamesWon ?? 0;
            } else {
              fcGamesWon = playerAGamesWon || playerBGamesWon || 0;
            }

            if (fcGamesWon <= 0) {
              return;
            }
            amountPerWinner = 60 * fcGamesWon;
          } else if (normGame === 'chess') {
            // Chess 1v1:
            // WIN: 2 NC for the winner, 0 NC for the loser.
            // DRAW: 1 NC for EACH player.
            // LOSS: 0 NC.
            // A player must NEVER receive 4 NC for a Chess win.
            if (isDraw) {
              amountPerWinner = 1;
            } else {
              const matchData = matchSnap.exists() ? (matchSnap.data() as any) : null;
              const isWinner =
                (Array.isArray(winnerUids) && winnerUids.includes(playerUid)) ||
                (matchData?.winnerId === playerUid) ||
                (matchData?.outcome === 'playerA' && matchData?.playerAId === playerUid) ||
                (matchData?.outcome === 'playerB' && matchData?.playerBId === playerUid);

              if (!isWinner) {
                // Chess loser receives strictly 0 NC
                return;
              }
              amountPerWinner = 2;
            }
          }

          if (amountPerWinner <= 0) {
            return;
          }

          const playerData = playerSnap.data() as Player;
          const currentBalance = Number(playerData.nexusCoins || 0);
          const newBalance = currentBalance + amountPerWinner;
          const totalEarned = Number(playerData.totalCoinsEarned || 0) + amountPerWinner;

          let txReason = `${gameName} Victory (+${amountPerWinner} NC)`;
          if (isFc) {
            txReason = isDraw
              ? `${gameName} Series Draw (${totalGamesPlayed || 1} Games Played • Split Prize +${amountPerWinner} NC)`
              : `${gameName} Series Victory (${fcGamesWon} Game${fcGamesWon === 1 ? '' : 's'} Won • +${amountPerWinner} NC)`;
          } else if (normGame === 'chess') {
            txReason = isDraw
              ? 'Chess 1v1 Draw (+1 NC)'
              : 'Chess 1v1 Victory (+2 NC)';
          } else if (isDraw) {
            txReason = is5v5
              ? `${gameName} 5v5 Match Draw (Split Prize +${amountPerWinner} NC)`
              : `${gameName} Match Draw (Split Prize +${amountPerWinner} NC)`;
          } else if (is5v5) {
            txReason = `${gameName} 5v5 Victory${opponentTeamName ? ` vs ${opponentTeamName}` : ''} (+${amountPerWinner} NC)`;
          } else if (opponentPlayerName) {
            txReason = `${gameName} Victory vs ${opponentPlayerName} (+${amountPerWinner} NC)`;
          }

          // Transaction record (Strictly immutable ledger entry conforming to schema)
          const coinTx: CoinTransaction = cleanUndefined({
            id: canonicalTxId,
            transactionId: canonicalTxId,
            playerUid,
            userId: playerUid,
            playerId: playerUid,
            gamerTag: playerData.gamerTag || 'Player',
            amount: amountPerWinner,
            type: isDraw ? 'MATCH_DRAW_REWARD' : 'MATCH_WIN',
            result: isDraw ? 'DRAW' : 'WIN',
            reason: txReason,
            game: gameName,
            gameId,
            matchId,
            opponentName: is5v5 ? opponentTeamName : opponentPlayerName,
            balanceBefore: currentBalance,
            balanceAfter: newBalance,
            actor: 'SYSTEM',
            actorType: 'SYSTEM',
            status: 'COMPLETED',
            createdAt: Date.now(),
          }) as CoinTransaction;

          // Write ledger entry
          transaction.set(txRef, coinTx);

          // Update player balance
          transaction.update(playerRef, {
            nexusCoins: newBalance,
            totalCoinsEarned: totalEarned,
            updatedAt: Date.now(),
          });

          // Mark player UID awarded on match document atomically
          transaction.set(
            matchDocRef,
            cleanUndefined({
              coinsAwarded: true,
              coinsAwardedAt: Date.now(),
              coinsAwardedAmount: amountPerWinner,
              ncReward: amountPerWinner,
              coinsAwardedPlayerUids: arrayUnion(playerUid),
              updatedAt: Date.now(),
            }),
            { merge: true }
          );

          awardedCount++;
        });
      } catch (txErr) {
        console.error(`Error awarding match win/draw coins to player ${playerUid}:`, txErr);
      }
    }
  }

  // 3. Update match document with FC series metadata if provided (never write undefined)
  try {
    const matchDocRef = doc(db, 'matches', matchId);
    const matchDocSnap = await getDoc(matchDocRef);
    if (matchDocSnap.exists()) {
      const matchUpdatePayload: Record<string, any> = {};

      if (totalGamesPlayed !== undefined && totalGamesPlayed !== null) {
        matchUpdatePayload.totalGamesPlayed = totalGamesPlayed;
      }
      if (playerAGamesWon !== undefined && playerAGamesWon !== null) {
        matchUpdatePayload.playerAGamesWon = playerAGamesWon;
      }
      if (playerBGamesWon !== undefined && playerBGamesWon !== null) {
        matchUpdatePayload.playerBGamesWon = playerBGamesWon;
      }
      if (seriesWinnerId !== undefined) {
        matchUpdatePayload.seriesWinnerId = seriesWinnerId;
      }

      if (Object.keys(matchUpdatePayload).length > 0) {
        await updateDoc(matchDocRef, cleanUndefined(matchUpdatePayload));
      }
    }
  } catch (err) {
    console.warn('Could not update match with series metadata:', err);
  }

  return { awardedCount, amountPerWinner: baseAmountPerWinner };
}

/**
 * Authoritative 5v5 Squad Match Reward Processor (Strictly Idempotent)
 * Calculates and awards Nexus Coins based on official hours played entered by Admin/Staff:
 * - Winning team: +90 NC per player per official hour
 * - Losing team: +30 NC per player per official hour
 * - Draw: +45 NC per player per official hour (both teams)
 */
export async function award5v5SquadHoursCoins(params: {
  matchId: string;
  gameId: string;
  gameName: string;
  outcome: 'teamA' | 'teamB' | 'draw';
  officialHours: number;
  teamAPlayerIds: string[];
  teamBPlayerIds: string[];
  teamAName?: string;
  teamBName?: string;
  adminId: string;
  adminName: string;
}): Promise<{
  success: boolean;
  teamARewardPerPlayer: number;
  teamBRewardPerPlayer: number;
  awardedCount: number;
  error?: string;
}> {
  const {
    matchId,
    gameId,
    gameName,
    outcome,
    officialHours,
    teamAPlayerIds,
    teamBPlayerIds,
    teamAName = 'Team A',
    teamBName = 'Team B',
    adminId,
    adminName,
  } = params;

  if (!matchId) {
    return {
      success: false,
      teamARewardPerPlayer: 0,
      teamBRewardPerPlayer: 0,
      awardedCount: 0,
      error: 'Match ID is required.',
    };
  }

  // Validate officialHours
  if (
    typeof officialHours !== 'number' ||
    isNaN(officialHours) ||
    !isFinite(officialHours) ||
    officialHours <= 0
  ) {
    return {
      success: false,
      teamARewardPerPlayer: 0,
      teamBRewardPerPlayer: 0,
      awardedCount: 0,
      error: 'Invalid official hours. Must be a finite number greater than 0.',
    };
  }

  // Calculate rewards per player per official hour
  let teamAReward = 0;
  let teamBReward = 0;

  if (outcome === 'teamA') {
    teamAReward = Math.round(90 * officialHours * 100) / 100;
    teamBReward = Math.round(30 * officialHours * 100) / 100;
  } else if (outcome === 'teamB') {
    teamAReward = Math.round(30 * officialHours * 100) / 100;
    teamBReward = Math.round(90 * officialHours * 100) / 100;
  } else {
    // DRAW
    teamAReward = Math.round(45 * officialHours * 100) / 100;
    teamBReward = Math.round(45 * officialHours * 100) / 100;
  }

  const now = Date.now();
  let awardedCount = 0;
  const newlyAwardedUids: string[] = [];

  // Deduplicate and sanitize player UIDs
  const uniqueTeamA = Array.from(
    new Set((teamAPlayerIds || []).filter((id): id is string => typeof id === 'string' && id.trim().length > 0).map((id) => id.trim()))
  );
  const uniqueTeamB = Array.from(
    new Set((teamBPlayerIds || []).filter((id): id is string => typeof id === 'string' && id.trim().length > 0).map((id) => id.trim()))
  );

  // Combine players into a unified processing list
  const playersToProcess: Array<{
    uid: string;
    teamSide: 'teamA' | 'teamB';
    amount: number;
    isWinner: boolean;
    isDraw: boolean;
    opponentName: string;
  }> = [];

  uniqueTeamA.forEach((uid) => {
    playersToProcess.push({
      uid,
      teamSide: 'teamA',
      amount: teamAReward,
      isWinner: outcome === 'teamA',
      isDraw: outcome === 'draw',
      opponentName: teamBName,
    });
  });

  uniqueTeamB.forEach((uid) => {
    playersToProcess.push({
      uid,
      teamSide: 'teamB',
      amount: teamBReward,
      isWinner: outcome === 'teamB',
      isDraw: outcome === 'draw',
      opponentName: teamAName,
    });
  });

  for (const item of playersToProcess) {
    const { uid: playerUid, amount, isWinner, isDraw, opponentName } = item;
    const canonicalTxId = `tx_match_${matchId}_${playerUid}`;
    const txRef = doc(db, 'coinTransactions', canonicalTxId);
    const playerRef = doc(db, 'players', playerUid);
    const matchDocRef = doc(db, 'matches', matchId);

    try {
      let awardedInTx = false;
      await runTransaction(db, async (transaction) => {
        const [txSnap, matchSnap, playerSnap] = await Promise.all([
          transaction.get(txRef),
          transaction.get(matchDocRef),
          transaction.get(playerRef),
        ]);

        // Idempotency: skip if already awarded
        if (txSnap.exists()) {
          return;
        }

        if (matchSnap.exists()) {
          const matchData = matchSnap.data();
          if (matchData.status === 'CANCELLED') {
            return;
          }
          if (
            Array.isArray(matchData.coinsAwardedPlayerUids) &&
            matchData.coinsAwardedPlayerUids.includes(playerUid)
          ) {
            return;
          }
        }

        if (!playerSnap.exists()) {
          return;
        }

        const playerData = playerSnap.data() as Player;
        const currentBalance = Number(playerData.nexusCoins || 0);
        const newBalance = Math.round((currentBalance + amount) * 100) / 100;
        const totalEarned = Math.round((Number(playerData.totalCoinsEarned || 0) + amount) * 100) / 100;

        const resultLabel = isDraw ? 'DRAW' : isWinner ? 'WIN' : 'LOSS';
        const roleLabel = isDraw ? 'Draw' : isWinner ? 'Victory' : 'Participation';
        const txReason = `${gameName} 5v5 ${roleLabel} (${officialHours}h • +${amount} NC)`;

        const coinTx: CoinTransaction = cleanUndefined({
          id: canonicalTxId,
          transactionId: canonicalTxId,
          playerUid,
          userId: playerUid,
          playerId: playerUid,
          gamerTag: playerData.gamerTag || 'Player',
          amount,
          type: isDraw ? 'MATCH_DRAW_REWARD' : isWinner ? 'MATCH_WIN' : 'MATCH_LOSS_REWARD',
          result: resultLabel,
          reason: txReason,
          game: gameName,
          gameId,
          matchId,
          officialHours,
          opponentName,
          balanceBefore: currentBalance,
          balanceAfter: newBalance,
          actor: adminId,
          actorType: 'ADMIN',
          status: 'COMPLETED',
          createdAt: now,
        }) as CoinTransaction;

        transaction.set(txRef, coinTx);
        transaction.update(playerRef, {
          nexusCoins: newBalance,
          totalCoinsEarned: totalEarned,
          updatedAt: now,
        });

        transaction.set(
          matchDocRef,
          cleanUndefined({
            coinsAwarded: true,
            coinsAwardedAt: now,
            coinsAwardedAmount: teamAReward,
            officialHours,
            rewardProcessed: true,
            ncRewardProcessed: true,
            teamARewardPerPlayer: teamAReward,
            teamBRewardPerPlayer: teamBReward,
            coinsAwardedPlayerUids: arrayUnion(playerUid),
            confirmedBy: adminId,
            confirmedByName: adminName,
            confirmedAt: now,
            updatedAt: now,
          }),
          { merge: true }
        );

        awardedInTx = true;
      });

      if (awardedInTx) {
        awardedCount++;
        newlyAwardedUids.push(playerUid);

        // Send notification to player
        try {
          const resOutcomeText = isDraw ? 'DRAW' : isWinner ? 'WON' : 'DEFEAT';
          const notifTitle = isDraw
            ? '5v5 Match Confirmed: DRAW 🤝'
            : isWinner
            ? '5v5 Match Confirmed: VICTORY! 🏆'
            : '5v5 Match Confirmed: DEFEAT';
          const notifMsg = `${gameName} 5v5 Match Confirmed • Official duration: ${officialHours} hour${officialHours === 1 ? '' : 's'}. You earned: +${amount} NC.`;

          await sendNotification({
            userId: playerUid,
            recipientId: playerUid,
            type: 'MATCH_CONFIRMED',
            title: notifTitle,
            message: notifMsg,
            lobbyId: matchId,
            data: {
              matchId,
              officialHours,
              ncEarned: amount,
              result: resOutcomeText,
            },
          });
        } catch (notifErr) {
          console.warn('Failed to send match confirmation notification:', notifErr);
        }
      }
    } catch (txErr) {
      console.error(`Error processing 5v5 reward for player ${playerUid}:`, txErr);
    }
  }

  return {
    success: true,
    teamARewardPerPlayer: teamAReward,
    teamBRewardPerPlayer: teamBReward,
    awardedCount,
  };
}

// ========================================================
// 3. ADMIN MANUAL COIN ADJUSTMENT
// ========================================================

export async function adminAdjustPlayerCoins(params: {
  playerUid: string;
  amount: number; // positive to grant, negative to deduct
  reason: string;
  adminUid: string;
  adminName: string;
}): Promise<{ success: boolean; newBalance?: number; error?: string }> {
  const { playerUid, amount, reason, adminUid, adminName } = params;

  if (!playerUid) return { success: false, error: 'Player UID is required.' };
  if (!amount || isNaN(amount) || amount === 0) return { success: false, error: 'A valid non-zero coin amount is required.' };
  if (!reason || !reason.trim()) return { success: false, error: 'A mandatory reason is required for balance adjustments.' };

  const playerRef = doc(db, 'players', playerUid);
  const txDocId = `adj_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const txRef = doc(db, 'coinTransactions', txDocId);

  try {
    const res = await runTransaction(db, async (transaction) => {
      const playerSnap = await transaction.get(playerRef);
      if (!playerSnap.exists()) {
        throw new Error('Player account not found in system.');
      }

      const playerData = playerSnap.data() as Player;
      const currentBalance = Number(playerData.nexusCoins || 0);
      const newBalance = currentBalance + amount;

      if (newBalance < 0) {
        throw new Error(`Adjustment would result in negative balance (${newBalance} NC). Current balance is ${currentBalance} NC.`);
      }

      const totalEarned = amount > 0
        ? Number(playerData.totalCoinsEarned || 0) + amount
        : Number(playerData.totalCoinsEarned || 0);

      const totalRedeemed = amount < 0
        ? Number(playerData.totalCoinsRedeemed || 0) + Math.abs(amount)
        : Number(playerData.totalCoinsRedeemed || 0);

      const txRecord: CoinTransaction = {
        id: txDocId,
        transactionId: txDocId,
        playerUid,
        playerId: playerUid,
        gamerTag: playerData.gamerTag || 'Player',
        amount,
        type: 'ADMIN_ADJUSTMENT',
        reason: reason.trim(),
        adminUid,
        adminName,
        balanceBefore: currentBalance,
        balanceAfter: newBalance,
        actor: adminUid,
        actorType: 'ADMIN',
        status: 'COMPLETED',
        createdAt: Date.now(),
      };

      transaction.set(txRef, txRecord);
      transaction.update(playerRef, {
        nexusCoins: newBalance,
        totalCoinsEarned: totalEarned,
        totalCoinsRedeemed: totalRedeemed,
        updatedAt: Date.now(),
      });

      return newBalance;
    });

    return { success: true, newBalance: res };
  } catch (err: any) {
    console.error('adminAdjustPlayerCoins error:', err);
    return { success: false, error: err.message || 'Failed to adjust player balance.' };
  }
}

// ========================================================
// 4. COIN TRANSACTION LEDGER SUBSCRIPTIONS
// ========================================================

export function subscribeToPlayerTransactions(
  playerUid: string,
  callback: (transactions: CoinTransaction[]) => void,
  limitCount: number = 50
): () => void {
  if (!playerUid) {
    callback([]);
    return () => {};
  }

  let fallbackUnsub: (() => void) | null = null;

  const q = query(
    collection(db, 'coinTransactions'),
    where('playerUid', '==', playerUid),
    orderBy('createdAt', 'desc'),
    limit(limitCount)
  );

  const mainUnsub = onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => d.data() as CoinTransaction);
      callback(list);
    },
    (err: any) => {
      console.warn('subscribeToPlayerTransactions warning:', err);
      // Fallback query without compound sorting ONLY if index is building or missing
      const isIndexError = err?.code === 'failed-precondition' || err?.message?.toLowerCase().includes('index');
      if (isIndexError) {
        const fallbackQuery = query(
          collection(db, 'coinTransactions'),
          where('playerUid', '==', playerUid),
          limit(limitCount)
        );
        fallbackUnsub = onSnapshot(
          fallbackQuery,
          (fSnap) => {
            const list = fSnap.docs.map((d) => d.data() as CoinTransaction);
            list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            callback(list);
          },
          (fbErr) => {
            console.warn('subscribeToPlayerTransactions fallback warning:', fbErr);
            callback([]);
          }
        );
      } else {
        callback([]);
      }
    }
  );

  return () => {
    mainUnsub();
    if (fallbackUnsub) {
      fallbackUnsub();
    }
  };
}

export function subscribeToAllTransactions(
  callback: (transactions: CoinTransaction[]) => void,
  limitCount: number = 100
): () => void {
  const q = query(
    collection(db, 'coinTransactions'),
    orderBy('createdAt', 'desc'),
    limit(limitCount)
  );

  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => d.data() as CoinTransaction);
      callback(list);
    },
    (err) => {
      console.warn('subscribeToAllTransactions warning:', err);
    }
  );
}

// ========================================================
// 5. FIDELITY CARD REWARDS CATALOG
// ========================================================

export const DEFAULT_FIDELITY_REWARDS: Omit<FidelityReward, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    title: 'FC 26 / FC 27 — 10 Minutes',
    description: '10 minutes of FC 26 / FC 27 gameplay.',
    icon: 'gamepad',
    cost: 180,
    coinCost: 180,
    category: 'STATION_TIME',
    game: 'ALL',
    active: true,
    availableQuantity: null,
    claimedCount: 0,
    terms: 'Valid for 10 minutes of FC 26 / FC 27 gameplay. Present redemption code at front desk.',
    displayOrder: 1,
    hasOffer: false,
    createdBy: 'system',
  },
  {
    title: 'PC Gaming — 1 Hour',
    description: '1 hour of PC gaming.',
    icon: 'monitor',
    cost: 300,
    coinCost: 300,
    category: 'STATION_TIME',
    game: 'ALL',
    active: true,
    availableQuantity: null,
    claimedCount: 0,
    terms: 'Valid for 1 hour of PC gaming on standard or RTX stations. Present redemption code at front desk.',
    displayOrder: 2,
    hasOffer: false,
    createdBy: 'system',
  },
];

/**
 * Authoritative check that caller is strictly an Admin or Super Admin (STAFF / PLAYER / VISITOR -> DENIED)
 */
export async function verifyAdminOrSuperAdminOnly(uid: string): Promise<boolean> {
  if (!uid) return false;
  if (uid === FOUNDING_SUPER_ADMIN_UID) return true;
  try {
    const playerSnap = await getDoc(doc(db, 'players', uid));
    if (playerSnap.exists()) {
      const pData = playerSnap.data();
      if (isAdminUser(pData?.email, pData?.role, uid)) {
        return true;
      }
    }
    const userSnap = await getDoc(doc(db, 'users', uid));
    if (userSnap.exists()) {
      const uData = userSnap.data();
      if (isAdminUser(uData?.email, uData?.role, uid)) {
        return true;
      }
    }
    return false;
  } catch (err) {
    console.warn('Error verifying admin/superadmin role:', err);
    return false;
  }
}

/**
 * Validates and sanitizes redemption offer payload
 */
export function validateOfferPayload(data: {
  title?: string;
  description?: string;
  cost?: number;
  coinCost?: number;
  category?: string;
  game?: string;
  active?: boolean;
}): {
  title: string;
  description: string;
  cost: number;
  coinCost: number;
  category: FidelityRewardCategory;
  game: string;
  active: boolean;
} {
  const rawTitle = (data.title || '').trim();
  if (!rawTitle) {
    throw new Error('Offer name cannot be empty.');
  }
  // Strip potential HTML/XSS tags
  const cleanTitle = rawTitle.replace(/<[^>]*>?/gm, '').trim();
  if (!cleanTitle) {
    throw new Error('Offer name contains invalid characters.');
  }
  if (cleanTitle.length > 100) {
    throw new Error('Offer name cannot exceed 100 characters.');
  }

  const rawDesc = (data.description || '').trim();
  const cleanDesc = rawDesc.replace(/<[^>]*>?/gm, '').trim();
  if (cleanDesc.length > 500) {
    throw new Error('Offer description cannot exceed 500 characters.');
  }

  const rawCost = data.coinCost ?? data.cost;
  if (
    typeof rawCost !== 'number' ||
    !Number.isFinite(rawCost) ||
    isNaN(rawCost) ||
    !Number.isInteger(rawCost) ||
    rawCost <= 0
  ) {
    throw new Error('Offer cost must be a positive integer greater than zero.');
  }

  const validCategories: FidelityRewardCategory[] = [
    'STATION_TIME',
    'FOOD_BEVERAGE',
    'TOURNAMENT',
    'MERCH',
    'PASS',
    'SPECIAL',
  ];
  const cat = (data.category || 'STATION_TIME') as FidelityRewardCategory;
  const category = validCategories.includes(cat) ? cat : 'STATION_TIME';

  const game = (data.game || 'ALL').trim();
  const active = typeof data.active === 'boolean' ? data.active : true;

  return {
    title: cleanTitle,
    description: cleanDesc,
    cost: rawCost,
    coinCost: rawCost,
    category,
    game,
    active,
  };
}

const LEGACY_REMOVED_OFFER_IDS = new Set([
  '6L7lsePIRkfhF8Y9khsp',
  '6sdLXJBQGm7mEKmApK5V',
  'Bm4o7szPN1eFRQV6V5T3',
  'Cna9XVyxfqMzkkrlwaYi',
  'ERArNGOZV232GUBqnF4m',
  'Fwp00XfuKL57oomh1ECH',
  'KkLVv4XUtCw7rd2dmAbK',
  'LbuysrqL7y1OkABPUXhf',
  'MXTgjGY4A9CNYCfZywhW',
  'bamCj3jAnxpzD43A0GPq',
  'fTF1qAoGZDhvDaIVvBWG',
  'liNTkERM8SIDyjlksv0a',
]);

/**
 * Checks whether an offer is one of the old removed NC legacy offers.
 * Requirement 6: Do not automatically restore the old removed NC offers.
 * The system displays: Existing configured offers + New offers created by authorized Admin/Super Admin.
 */
export function isLegacyRemovedOffer(reward: FidelityReward | any): boolean {
  if (!reward) return true;
  if (reward.isDeleted) return true;
  if (reward.id && LEGACY_REMOVED_OFFER_IDS.has(reward.id)) return true;

  // Crucial: Offers created by an authorized Admin or Super Admin are NEVER legacy removed offers!
  if (reward.createdBy && reward.createdBy !== 'system') {
    return false;
  }

  const titleLower = (reward.title || '').toLowerCase().trim();
  // Old removed NC offers that must not be reintroduced
  if (titleLower === '1 hour pc gaming' && (reward.cost === 100 || reward.coinCost === 100)) return true;
  if (titleLower.includes('ps5 pro station')) return true;
  if (titleLower.includes('2 hours pc gaming')) return true;
  if (titleLower.includes('entry ticket')) return true;
  if (titleLower.includes('snack pack')) return true;
  if (titleLower.includes('vip reward package')) return true;
  return false;
}

export async function seedInitialFidelityRewardsIfEmpty(): Promise<void> {
  try {
    const snap = await getDocs(collection(db, 'fidelityRewards'));
    if (snap.empty) {
      // Only seed default canonical offers if the database collection is completely empty
      for (const def of DEFAULT_FIDELITY_REWARDS) {
        const docRef = doc(collection(db, 'fidelityRewards'));
        await setDoc(docRef, {
          ...def,
          id: docRef.id,
          cost: def.coinCost,
          game: 'ALL',
          createdBy: 'system',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }).catch(() => {});
      }
    }
  } catch (err) {
    console.warn('seedInitialFidelityRewardsIfEmpty warning:', err);
  }
}

/**
 * Authoritative Rewards Catalog Subscription.
 * Reads directly from authoritative 'fidelityRewards' collection.
 * Real-time updates automatically push newly created/edited/deactivated offers.
 */
export function subscribeToFidelityRewards(
  callback: (rewards: FidelityReward[]) => void,
  options?: { includeInactive?: boolean }
): () => void {
  // Query authoritative collection
  const q = collection(db, 'fidelityRewards');

  const filterDocs = (docs: any[]) => {
    let list = docs.map((d) => {
      const data = d.data();
      const rawCost = typeof data.cost === 'number' ? data.cost : (typeof data.coinCost === 'number' ? data.coinCost : (parseInt(data.cost || data.coinCost) || 0));
      const cost = Math.max(0, rawCost);
      const coinCost = typeof data.coinCost === 'number' ? data.coinCost : cost;
      const createdAt = data.createdAt?.toMillis
        ? data.createdAt.toMillis()
        : typeof data.createdAt === 'number'
        ? data.createdAt
        : data.createdAt?.seconds
        ? data.createdAt.seconds * 1000
        : Date.now();
      const updatedAt = data.updatedAt?.toMillis
        ? data.updatedAt.toMillis()
        : typeof data.updatedAt === 'number'
        ? data.updatedAt
        : data.updatedAt?.seconds
        ? data.updatedAt.seconds * 1000
        : createdAt;

      return {
        ...data,
        id: d.id,
        title: data.title || 'Reward Offer',
        description: data.description || '',
        cost,
        coinCost,
        category: data.category || 'STATION_TIME',
        game: data.game || 'ALL',
        active: data.active !== false,
        createdBy: data.createdBy || 'system',
        createdAt,
        updatedAt,
      } as FidelityReward;
    });

    if (!options?.includeInactive) {
      // Player catalog: strictly active, not deleted, and not an old removed offer
      list = list.filter((r) => r.active && !r.isDeleted && !isLegacyRemovedOffer(r));
    } else {
      // Admin offer management view: exclude permanently deleted and removed legacy offers
      list = list.filter((r) => !r.isDeleted && !isLegacyRemovedOffer(r));
    }

    // Sort by displayOrder ascending, then by createdAt descending
    list.sort((a, b) => (a.displayOrder || 1) - (b.displayOrder || 1) || (b.createdAt || 0) - (a.createdAt || 0));
    return list;
  };

  return onSnapshot(
    q,
    (snap) => {
      callback(filterDocs(snap.docs));
    },
    (err: any) => {
      console.warn('subscribeToFidelityRewards error:', err);
      fetchFidelityRewards(options).then(callback).catch(() => callback([]));
    }
  );
}

/**
 * Fetch authoritative rewards catalog.
 */
export async function fetchFidelityRewards(
  options?: { includeInactive?: boolean }
): Promise<FidelityReward[]> {
  try {
    const snap = await getDocs(collection(db, 'fidelityRewards'));
    let list = snap.docs.map((d) => {
      const data = d.data();
      const rawCost = typeof data.cost === 'number' ? data.cost : (typeof data.coinCost === 'number' ? data.coinCost : (parseInt(data.cost || data.coinCost) || 0));
      const cost = Math.max(0, rawCost);
      const coinCost = typeof data.coinCost === 'number' ? data.coinCost : cost;
      const createdAt = data.createdAt?.toMillis
        ? data.createdAt.toMillis()
        : typeof data.createdAt === 'number'
        ? data.createdAt
        : data.createdAt?.seconds
        ? data.createdAt.seconds * 1000
        : Date.now();
      const updatedAt = data.updatedAt?.toMillis
        ? data.updatedAt.toMillis()
        : typeof data.updatedAt === 'number'
        ? data.updatedAt
        : data.updatedAt?.seconds
        ? data.updatedAt.seconds * 1000
        : createdAt;

      return {
        ...data,
        id: d.id,
        title: data.title || 'Reward Offer',
        description: data.description || '',
        cost,
        coinCost,
        category: data.category || 'STATION_TIME',
        game: data.game || 'ALL',
        active: data.active !== false,
        createdBy: data.createdBy || 'system',
        createdAt,
        updatedAt,
      } as FidelityReward;
    });

    if (!options?.includeInactive) {
      list = list.filter((r) => r.active && !r.isDeleted && !isLegacyRemovedOffer(r));
    } else {
      list = list.filter((r) => !r.isDeleted && !isLegacyRemovedOffer(r));
    }

    list.sort((a, b) => (a.displayOrder || 1) - (b.displayOrder || 1) || (b.createdAt || 0) - (a.createdAt || 0));
    return list;
  } catch (err) {
    console.error('fetchFidelityRewards error:', err);
    return [];
  }
}

// In-flight offer creation promise cache for double-click and idempotency protection
const inFlightOfferCreations = new Map<string, Promise<string>>();

/**
 * Authoritative Offer Creation.
 * Creates an authoritative offer in 'fidelityRewards' with all required fields:
 * id, title, description, cost, category, game, active, createdAt, createdBy.
 * Includes duplicate and idempotency protection.
 */
export async function createFidelityReward(
  rewardData: {
    id?: string;
    idempotencyKey?: string;
    title: string;
    description?: string;
    cost?: number;
    coinCost?: number;
    category?: FidelityRewardCategory;
    game?: string;
    active?: boolean;
    availableQuantity?: number | null;
    terms?: string;
    displayOrder?: number;
    hasOffer?: boolean;
    offerPrice?: number;
    offerLabel?: string;
    offerStartAt?: number;
    offerEndAt?: number;
    createdBy?: string;
  },
  adminUid: string
): Promise<string> {
  const isAuthorized = await verifyAdminOrSuperAdminOnly(adminUid);
  if (!isAuthorized) {
    throw new Error('PERMISSION_DENIED: Only Administrators and Super Administrators can create redemption offers.');
  }

  const validated = validateOfferPayload(rewardData);

  // Idempotency / Double-click deduplication key
  const idempotencyKey = rewardData.idempotencyKey || rewardData.id;
  const dedupKey = idempotencyKey
    ? `${adminUid}_${idempotencyKey}`
    : `${adminUid}_${validated.title.toLowerCase()}_${validated.cost}`;

  if (inFlightOfferCreations.has(dedupKey)) {
    return inFlightOfferCreations.get(dedupKey)!;
  }

  const creationPromise = (async () => {
    try {
      const docId = rewardData.id || (idempotencyKey ? `offer_${idempotencyKey.replace(/[^a-zA-Z0-9_-]/g, '_')}` : doc(collection(db, 'fidelityRewards')).id);
      const docRef = doc(db, 'fidelityRewards', docId);

      // Check if doc already exists with this idempotency key
      const existingSnap = await getDoc(docRef);
      if (existingSnap.exists()) {
        return docId;
      }

      const now = Date.now();
      const payload: FidelityReward = cleanUndefined({
        id: docId,
        title: validated.title,
        description: validated.description,
        cost: validated.cost,
        coinCost: validated.coinCost,
        category: validated.category,
        game: validated.game || 'ALL',
        active: validated.active !== false,
        availableQuantity: typeof rewardData.availableQuantity === 'number' ? Math.max(0, rewardData.availableQuantity) : null,
        claimedCount: 0,
        terms: rewardData.terms ? rewardData.terms.replace(/<[^>]*>?/gm, '').trim() : '',
        displayOrder: typeof rewardData.displayOrder === 'number' ? rewardData.displayOrder : 1,
        hasOffer: Boolean(rewardData.hasOffer),
        offerPrice: rewardData.offerPrice,
        offerLabel: rewardData.offerLabel,
        offerStartAt: rewardData.offerStartAt,
        offerEndAt: rewardData.offerEndAt,
        createdAt: now,
        createdBy: adminUid,
        updatedAt: now,
      }) as FidelityReward;

      await setDoc(docRef, payload);
      return docId;
    } catch (err) {
      inFlightOfferCreations.delete(dedupKey);
      throw err;
    } finally {
      // Clear in-flight cache after 5 seconds to prevent memory leak
      setTimeout(() => {
        inFlightOfferCreations.delete(dedupKey);
      }, 5000);
    }
  })();

  inFlightOfferCreations.set(dedupKey, creationPromise);
  return creationPromise;
}

export async function updateFidelityReward(
  rewardId: string,
  rewardData: Partial<FidelityReward>,
  adminUid: string
): Promise<void> {
  if (!rewardId) throw new Error('Reward ID is required.');
  const isAuthorized = await verifyAdminOrSuperAdminOnly(adminUid);
  if (!isAuthorized) {
    throw new Error('PERMISSION_DENIED: Only Administrators and Super Administrators can modify redemption offers.');
  }

  const updates: Record<string, any> = {
    updatedAt: Date.now(),
  };

  if (rewardData.title !== undefined) {
    const rawTitle = (rewardData.title || '').trim().replace(/<[^>]*>?/gm, '');
    if (!rawTitle) throw new Error('Offer name cannot be empty.');
    if (rawTitle.length > 100) throw new Error('Offer name cannot exceed 100 characters.');
    updates.title = rawTitle;
  }

  if (rewardData.description !== undefined) {
    updates.description = (rewardData.description || '').trim().replace(/<[^>]*>?/gm, '');
  }

  const rawCost = rewardData.cost ?? rewardData.coinCost;
  if (rawCost !== undefined) {
    if (typeof rawCost !== 'number' || !Number.isFinite(rawCost) || isNaN(rawCost) || !Number.isInteger(rawCost) || rawCost <= 0) {
      throw new Error('Offer cost must be a positive integer greater than zero.');
    }
    updates.cost = rawCost;
    updates.coinCost = rawCost;
  }

  if (rewardData.game !== undefined) {
    updates.game = rewardData.game || 'ALL';
  }

  if (rewardData.active !== undefined) {
    updates.active = Boolean(rewardData.active);
  }

  if (rewardData.category !== undefined) {
    updates.category = rewardData.category;
  }

  if (rewardData.availableQuantity !== undefined) {
    updates.availableQuantity = rewardData.availableQuantity;
  }

  if (rewardData.terms !== undefined) {
    updates.terms = (rewardData.terms || '').replace(/<[^>]*>?/gm, '').trim();
  }

  if (rewardData.displayOrder !== undefined) {
    updates.displayOrder = rewardData.displayOrder;
  }

  if (rewardData.hasOffer !== undefined) {
    updates.hasOffer = Boolean(rewardData.hasOffer);
    updates.offerPrice = rewardData.offerPrice;
    updates.offerLabel = rewardData.offerLabel;
    updates.offerStartAt = rewardData.offerStartAt;
    updates.offerEndAt = rewardData.offerEndAt;
  }

  const docRef = doc(db, 'fidelityRewards', rewardId);
  await updateDoc(docRef, cleanUndefined(updates));
}

export async function deleteFidelityReward(rewardId: string, adminUid: string): Promise<void> {
  if (!rewardId) throw new Error('Reward ID is required.');
  const isAuthorized = await verifyAdminOrSuperAdminOnly(adminUid);
  if (!isAuthorized) {
    throw new Error('PERMISSION_DENIED: Only Administrators and Super Administrators can delete redemption offers.');
  }

  const docRef = doc(db, 'fidelityRewards', rewardId);
  // Safe soft-delete / deactivation so historical redemptions remain valid
  await updateDoc(docRef, {
    active: false,
    isDeleted: true,
    deletedAt: Date.now(),
    deletedBy: adminUid,
    updatedAt: Date.now(),
  });
}

export async function toggleFidelityRewardActive(
  rewardId: string,
  currentActive: boolean,
  adminUid: string
): Promise<void> {
  if (!rewardId) throw new Error('Reward ID is required.');
  const isAuthorized = await verifyAdminOrSuperAdminOnly(adminUid);
  if (!isAuthorized) {
    throw new Error('PERMISSION_DENIED: Only Administrators and Super Administrators can enable or disable redemption offers.');
  }

  const docRef = doc(db, 'fidelityRewards', rewardId);
  await updateDoc(docRef, {
    active: !currentActive,
    updatedAt: Date.now(),
  });
}

// Helper: Calculate effective cost factoring in active limited-time offers
export function getEffectiveRewardCost(reward: FidelityReward, timestamp: number = Date.now()): {
  cost: number;
  hasActiveOffer: boolean;
  normalPrice: number;
  offerPrice?: number;
  offerEndsAt?: number;
  offerLabel?: string;
} {
  const normalPrice = reward.coinCost;

  if (
    reward.hasOffer &&
    typeof reward.offerPrice === 'number' &&
    reward.offerPrice > 0 &&
    reward.offerPrice < normalPrice
  ) {
    const isStarted = !reward.offerStartAt || timestamp >= reward.offerStartAt;
    const isNotExpired = !reward.offerEndAt || timestamp <= reward.offerEndAt;

    if (isStarted && isNotExpired) {
      return {
        cost: reward.offerPrice,
        hasActiveOffer: true,
        normalPrice,
        offerPrice: reward.offerPrice,
        offerEndsAt: reward.offerEndAt,
        offerLabel: reward.offerLabel || 'SPECIAL OFFER',
      };
    }
  }

  return {
    cost: normalPrice,
    hasActiveOffer: false,
    normalPrice,
  };
}

// Generate human-readable cryptographically unpredictable redemption code e.g. NEXUS-8UT7D
export function generateRedemptionCode(): string {
  // 32 unambiguous characters (excludes 0, O, 1, I for clean customer and staff desk readability)
  const charset = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const bytes = new Uint8Array(5);
  if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
    window.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 5; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  let randomPart = '';
  for (let i = 0; i < 5; i++) {
    randomPart += charset[bytes[i] % charset.length];
  }
  return `NEXUS-${randomPart}`;
}

// ========================================================
// 6. ATOMIC REWARD REDEMPTION
// ========================================================

export async function redeemFidelityReward(params: {
  playerUid: string;
  rewardId: string;
  idempotencyKey?: string;
}): Promise<{
  success: boolean;
  redemption?: RewardRedemption;
  newBalance?: number;
  error?: string;
}> {
  const { playerUid, rewardId, idempotencyKey } = params;

  if (!playerUid) return { success: false, error: 'User must be authenticated.' };
  if (!rewardId) return { success: false, error: 'Reward selection is required.' };

  // Security check: authenticated user must match player UID
  const currentAuthUid = auth.currentUser?.uid;
  if (currentAuthUid && currentAuthUid !== playerUid) {
    return { success: false, error: 'Unauthorized: You can only redeem rewards for your authenticated wallet.' };
  }

  const playerRef = doc(db, 'players', playerUid);
  const rewardRef = doc(db, 'fidelityRewards', rewardId);

  // Deterministic doc ID if idempotencyKey is supplied; else unique random
  const sanitizedKey = idempotencyKey ? idempotencyKey.replace(/[^a-zA-Z0-9_-]/g, '_') : '';
  const redemptionDocId = sanitizedKey
    ? `red_${sanitizedKey}`
    : `red_${playerUid}_${rewardId}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const redemptionRef = doc(db, 'rewardRedemptions', redemptionDocId);
  const txDocId = `tx_${redemptionDocId}`;
  const txRef = doc(db, 'coinTransactions', txDocId);

  try {
    const result = await runTransaction(db, async (transaction) => {
      // 1. Check idempotency: If this redemption doc already exists, return existing
      const existingRedemptionSnap = await transaction.get(redemptionRef);
      if (existingRedemptionSnap.exists()) {
        const existingRedemption = existingRedemptionSnap.data() as RewardRedemption;
        const playerSnap = await transaction.get(playerRef);
        const currentBalance = playerSnap.exists() ? (playerSnap.data() as Player).nexusCoins || 0 : 0;
        return { redemption: existingRedemption, newBalance: currentBalance };
      }

      // 2. Read player
      const playerSnap = await transaction.get(playerRef);
      if (!playerSnap.exists()) {
        throw new Error('Player profile not found in system.');
      }
      const player = playerSnap.data() as Player;

      // 3. Read reward
      const rewardSnap = await transaction.get(rewardRef);
      let reward: FidelityReward;
      if (!rewardSnap.exists()) {
        const canonical = DEFAULT_FIDELITY_REWARDS.find(
          (d, idx) => `canonical_default_${idx + 1}` === rewardId || d.title === rewardId
        );
        if (canonical) {
          reward = {
            ...canonical,
            id: rewardId,
            createdAt: 0,
            updatedAt: 0,
          } as FidelityReward;
        } else {
          throw new Error('Reward item not found.');
        }
      } else {
        reward = rewardSnap.data() as FidelityReward;
      }

      // 4. Verify reward active and not deleted/deprecated
      if ((reward as any).isDeleted) {
        throw new Error('This reward offer has been removed.');
      }
      if (!reward.active) {
        throw new Error('This reward is currently inactive.');
      }

      const titleLower = (reward.title || '').toLowerCase();
      const isOldOffer =
        (titleLower.includes('1 hour pc gaming') && reward.coinCost !== 300) ||
        titleLower.includes('ps5 pro station') ||
        titleLower.includes('2 hours pc gaming') ||
        titleLower.includes('entry ticket') ||
        titleLower.includes('snack pack') ||
        titleLower.includes('vip reward package');
      if (isOldOffer) {
        throw new Error('This reward offer is deprecated and no longer available.');
      }

      // 5. Verify quantity available if bounded
      if (
        reward.availableQuantity !== null &&
        reward.availableQuantity !== undefined &&
        reward.availableQuantity <= 0
      ) {
        throw new Error('This reward is currently out of stock.');
      }

      // 6. Calculate trusted price on backend from reward document
      const now = Date.now();
      const pricing = getEffectiveRewardCost(reward, now);
      const effectiveCost = pricing.cost;

      // 7. Verify player balance
      const currentBalance = Number(player.nexusCoins || 0);
      if (currentBalance < effectiveCost) {
        throw new Error(
          `Insufficient Nexus Coins. Required: ${effectiveCost} NC, Your Balance: ${currentBalance} NC.`
        );
      }

      const newBalance = currentBalance - effectiveCost;
      if (newBalance < 0) {
        throw new Error('Transaction would result in negative balance.');
      }

      const totalRedeemed = Number(player.totalCoinsRedeemed || 0) + effectiveCost;

      // 8. Generate cryptographically unpredictable code and guarantee uniqueness
      let redemptionCode = generateRedemptionCode();
      let codeRef = doc(db, 'redemptionCodes', redemptionCode);
      let codeSnap = await transaction.get(codeRef);

      let attempts = 0;
      while (codeSnap.exists() && attempts < 5) {
        redemptionCode = generateRedemptionCode();
        codeRef = doc(db, 'redemptionCodes', redemptionCode);
        codeSnap = await transaction.get(codeRef);
        attempts++;
      }

      if (codeSnap.exists()) {
        throw new Error('Failed to allocate unique redemption code. Please retry.');
      }

      // 9. Create snapshot redemption record (Initial state: ACTIVE)
      const expiresAt = reward.hasOffer && reward.offerEndAt ? reward.offerEndAt : (now + 30 * 24 * 60 * 60 * 1000);
      const redemption: RewardRedemption = {
        id: redemptionDocId,
        redemptionId: redemptionDocId,
        code: redemptionCode,
        redemptionCode,
        playerUid,
        playerId: playerUid,
        playerGamerTag: player.gamerTag || 'Player',
        playerEmail: player.email || '',
        rewardId: reward.id,
        rewardTitle: reward.title,
        rewardNameSnapshot: reward.title,
        rewardDescriptionSnapshot: reward.description || '',
        rewardCategory: reward.category,
        coinCost: effectiveCost,
        ncCost: effectiveCost,
        status: 'ACTIVE',
        terms: reward.terms || '',
        createdAt: now,
        expiresAt,
      };

      // 10. Create coin transaction record (deduction)
      const coinTx: CoinTransaction = {
        id: txDocId,
        transactionId: txDocId,
        playerUid,
        playerId: playerUid,
        gamerTag: player.gamerTag || 'Player',
        amount: -effectiveCost,
        type: 'REDEMPTION',
        reason: `Redeemed: ${reward.title} (Pass: ${redemptionCode})`,
        rewardId: reward.id,
        rewardTitle: reward.title,
        redemptionId: redemptionDocId,
        redemptionCode,
        balanceBefore: currentBalance,
        balanceAfter: newBalance,
        actor: playerUid,
        actorType: 'PLAYER',
        status: 'COMPLETED',
        createdAt: now,
      };

      // Unique code registry permanent reservation
      transaction.set(codeRef, {
        code: redemptionCode,
        redemptionId: redemptionDocId,
        playerUid,
        status: 'ACTIVE',
        createdAt: now,
      });

      // Writes:
      transaction.set(redemptionRef, cleanUndefined(redemption));
      transaction.set(txRef, cleanUndefined(coinTx));

      // Update player balance
      transaction.update(playerRef, {
        nexusCoins: newBalance,
        totalCoinsRedeemed: totalRedeemed,
        updatedAt: now,
      });

      // Update reward counters
      const rewardUpdate: Record<string, any> = {
        claimedCount: (reward.claimedCount || 0) + 1,
        updatedAt: now,
      };

      if (reward.availableQuantity !== null && reward.availableQuantity !== undefined) {
        rewardUpdate.availableQuantity = Math.max(0, reward.availableQuantity - 1);
      }

      transaction.update(rewardRef, rewardUpdate);

      return { redemption, newBalance };
    });

    return {
      success: true,
      redemption: result.redemption,
      newBalance: result.newBalance,
    };
  } catch (err: any) {
    console.warn('redeemFidelityReward rejected:', err.message || err);
    return {
      success: false,
      error: err.message || 'Reward redemption failed. Please try again.',
    };
  }
}

// ========================================================
// 7. REDEMPTIONS MANAGEMENT & STAFF VERIFICATION
// ========================================================

export function subscribeToPlayerRedemptions(
  playerUid: string,
  callback: (redemptions: RewardRedemption[]) => void
): () => void {
  if (!playerUid) {
    callback([]);
    return () => {};
  }

  let fallbackUnsub: (() => void) | null = null;

  const q = query(
    collection(db, 'rewardRedemptions'),
    where('playerUid', '==', playerUid),
    orderBy('createdAt', 'desc')
  );

  const mainUnsub = onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => d.data() as RewardRedemption);
      callback(list);
    },
    (err: any) => {
      console.warn('subscribeToPlayerRedemptions warning:', err);
      const isIndexError = err?.code === 'failed-precondition' || err?.message?.toLowerCase().includes('index');
      if (isIndexError) {
        fallbackUnsub = onSnapshot(
          query(collection(db, 'rewardRedemptions'), where('playerUid', '==', playerUid)),
          (fSnap) => {
            const list = fSnap.docs.map((d) => d.data() as RewardRedemption);
            list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            callback(list);
          },
          (fbErr) => {
            console.warn('subscribeToPlayerRedemptions fallback error:', fbErr);
            callback([]);
          }
        );
      } else {
        callback([]);
      }
    }
  );

  return () => {
    mainUnsub();
    if (fallbackUnsub) {
      fallbackUnsub();
    }
  };
}

export function subscribeToAllRedemptions(
  callback: (redemptions: RewardRedemption[]) => void,
  limitCount: number = 100
): () => void {
  const q = query(
    collection(db, 'rewardRedemptions'),
    orderBy('createdAt', 'desc'),
    limit(limitCount)
  );

  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => d.data() as RewardRedemption);
      callback(list);
    },
    (err) => {
      console.warn('subscribeToAllRedemptions warning:', err);
    }
  );
}

export async function updateRedemptionStatus(params: {
  redemptionId: string;
  status: RedemptionStatus;
  adminUid: string;
  adminName: string;
  notes?: string;
  options?: { expectedCode?: string };
}): Promise<{ success: boolean; error?: string }> {
  const { redemptionId, status, adminUid, adminName, notes, options } = params;

  if (!redemptionId) return { success: false, error: 'Redemption ID required.' };

  const redemptionRef = doc(db, 'rewardRedemptions', redemptionId);

  try {
    if (status === 'CANCELLED') {
      // Refund coins atomically with idempotent refund transaction doc ID
      const result = await runTransaction(db, async (transaction) => {
        const rSnap = await transaction.get(redemptionRef);
        if (!rSnap.exists()) throw new Error('Redemption record not found.');
        const rData = rSnap.data() as RewardRedemption;

        if (rData.status === 'CANCELLED') {
          return { alreadyCancelled: true }; // Already cancelled and refunded
        }

        if (rData.status === 'USED') {
          throw new Error('This redemption pass has already been used and cannot be cancelled.');
        }

        const playerRef = doc(db, 'players', rData.playerUid);
        const rewardRef = doc(db, 'fidelityRewards', rData.rewardId);
        const refundTxRef = doc(db, 'coinTransactions', `refund_${redemptionId}`);

        const [pSnap, refundTxSnap, rewardSnap] = await Promise.all([
          transaction.get(playerRef),
          transaction.get(refundTxRef),
          transaction.get(rewardRef),
        ]);

        if (pSnap.exists()) {
          const pData = pSnap.data() as Player;
          const currentBalance = Number(pData.nexusCoins || 0);
          const refundAmount = rData.coinCost;
          const newBalance = currentBalance + refundAmount;

          if (!refundTxSnap.exists()) {
            const refundTx: CoinTransaction = {
              id: refundTxRef.id,
              transactionId: refundTxRef.id,
              playerUid: rData.playerUid,
              playerId: rData.playerUid,
              gamerTag: pData.gamerTag || 'Player',
              amount: refundAmount,
              type: 'ADMIN_ADJUSTMENT',
              reason: `Refund for cancelled redemption ${rData.code} (${rData.rewardTitle})`,
              rewardId: rData.rewardId,
              rewardTitle: rData.rewardTitle,
              redemptionCode: rData.code,
              adminUid,
              adminName,
              balanceBefore: currentBalance,
              balanceAfter: newBalance,
              actor: adminUid,
              actorType: 'ADMIN',
              status: 'COMPLETED',
              createdAt: Date.now(),
            };

            transaction.set(refundTxRef, refundTx);
          }

          transaction.update(playerRef, {
            nexusCoins: newBalance,
            totalCoinsRedeemed: Math.max(0, Number(pData.totalCoinsRedeemed || 0) - refundAmount),
            updatedAt: Date.now(),
          });
        }

        // Restore stock if reward has limited quantity
        if (rewardSnap.exists()) {
          const rwData = rewardSnap.data() as FidelityReward;
          if (rwData.availableQuantity !== null && rwData.availableQuantity !== undefined) {
            transaction.update(rewardRef, {
              availableQuantity: rwData.availableQuantity + 1,
              claimedCount: Math.max(0, (rwData.claimedCount || 1) - 1),
              updatedAt: Date.now(),
            });
          }
        }

        const now = Date.now();
        transaction.update(redemptionRef, {
          status: 'CANCELLED',
          cancelledAt: now,
          verifiedBy: adminName,
          usedBy: adminUid,
          notes: notes || 'Cancelled and refunded by staff',
          updatedAt: now,
        });

        return { alreadyCancelled: false };
      });

      return { success: true };
    }

    if (status === 'USED') {
      // Mark USED atomically to prevent double-use
      await runTransaction(db, async (transaction) => {
        const rSnap = await transaction.get(redemptionRef);
        if (!rSnap.exists()) throw new Error('Redemption record not found.');
        const rData = rSnap.data() as RewardRedemption;

        const canonicalCode = (rData.code || rData.redemptionCode || '').toUpperCase().trim();

        if (options?.expectedCode) {
          const targetCode = options.expectedCode.toUpperCase().trim();
          if (canonicalCode !== targetCode) {
            throw new Error('Redemption code mismatch.');
          }
        }

        const isActive = rData.status === 'ACTIVE' || rData.status === 'APPROVED';
        if (!isActive) {
          if (rData.status === 'USED') {
            throw new Error('CODE ALREADY USED');
          }
          if (rData.status === 'CANCELLED') {
            throw new Error('REDEMPTION CANCELLED');
          }
          if (rData.status === 'EXPIRED') {
            throw new Error('REDEMPTION EXPIRED');
          }
          throw new Error(`Cannot mark as USED. Current status is ${rData.status}.`);
        }

        const now = Date.now();
        if (rData.expiresAt && now > rData.expiresAt) {
          transaction.update(redemptionRef, {
            status: 'EXPIRED',
            updatedAt: now,
          });
          throw new Error('REDEMPTION EXPIRED');
        }

        // 1. Mark redemption as USED
        transaction.update(redemptionRef, {
          status: 'USED',
          usedAt: now,
          usedBy: adminUid,
          verifiedBy: adminName,
          notes: notes || 'Verified and marked as used by staff at desk',
          updatedAt: now,
        });

        // 2. Update permanent code registry status if code exists
        if (canonicalCode) {
          const codeRegRef = doc(db, 'redemptionCodes', canonicalCode);
          transaction.set(
            codeRegRef,
            {
              code: canonicalCode,
              redemptionId,
              status: 'USED',
              usedAt: now,
              usedBy: adminUid,
            },
            { merge: true }
          );
        }
      });

      return { success: true };
    }

    // Standard status update for other statuses
    const updates: Partial<RewardRedemption> = {
      status,
      verifiedBy: adminName,
      ...(notes ? { notes } : {}),
      updatedAt: Date.now(),
    };

    await updateDoc(redemptionRef, cleanUndefined(updates));
    return { success: true };
  } catch (err: any) {
    console.error('updateRedemptionStatus error:', err);
    return { success: false, error: err.message || 'Failed to update redemption status.' };
  }
}

/**
 * Dedicated atomic wrapper to mark a redemption as USED.
 * Enforces atomic state validation (ACTIVE -> USED), idempotency, and audit logging.
 */
export async function markRedemptionAsUsed(
  paramsOrId:
    | {
        redemptionId: string;
        adminUid: string;
        adminName: string;
        notes?: string;
        expectedCode?: string;
      }
    | string,
  staffUidArg?: string,
  notesArg?: string,
  optionsArg?: { expectedCode?: string; adminName?: string }
): Promise<{ success: boolean; error?: string }> {
  if (typeof paramsOrId === 'string') {
    return updateRedemptionStatus({
      redemptionId: paramsOrId,
      status: 'USED',
      adminUid: staffUidArg || '',
      adminName: optionsArg?.adminName || 'Admin Staff',
      notes: notesArg,
      options: optionsArg?.expectedCode ? { expectedCode: optionsArg.expectedCode } : undefined,
    });
  }

  return updateRedemptionStatus({
    redemptionId: paramsOrId.redemptionId,
    status: 'USED',
    adminUid: paramsOrId.adminUid,
    adminName: paramsOrId.adminName,
    notes: paramsOrId.notes,
    options: paramsOrId.expectedCode ? { expectedCode: paramsOrId.expectedCode } : undefined,
  });
}

// ========================================================
// 8. REDEMPTION VERIFICATION HELPERS
// ========================================================

/**
 * Normalizes redemption code: trims whitespace, removes spaces, upper-cases, and handles prefix
 */
export function normalizeRedemptionCode(raw: string): string {
  if (!raw) return '';
  let clean = raw.trim().toUpperCase().replace(/\s+/g, '');
  // If user only typed alphanumeric part without prefix (e.g. 8UT7D), prepend standard NEXUS- prefix
  if (/^[A-Z0-9]{4,10}$/.test(clean) && !clean.startsWith('NEXUS-')) {
    clean = `NEXUS-${clean}`;
  }
  return clean;
}

export async function verifyRedemptionById(redemptionId: string): Promise<RewardRedemption | null> {
  if (!redemptionId) return null;
  try {
    const snap = await getDoc(doc(db, 'rewardRedemptions', redemptionId));
    if (snap.exists()) {
      return snap.data() as RewardRedemption;
    }
    return null;
  } catch (err) {
    console.error('verifyRedemptionById error:', err);
    return null;
  }
}

export async function verifyRedemptionByCode(code: string): Promise<RewardRedemption | null> {
  if (!code || !code.trim()) return null;
  const cleanCode = normalizeRedemptionCode(code);
  const rawClean = code.trim().toUpperCase();

  try {
    // 1. Direct query in rewardRedemptions by code (normalized)
    const q1 = query(collection(db, 'rewardRedemptions'), where('code', '==', cleanCode), limit(1));
    const snap1 = await getDocs(q1);
    if (!snap1.empty) {
      return snap1.docs[0].data() as RewardRedemption;
    }

    // 2. Query in rewardRedemptions by redemptionCode alias
    const q2 = query(collection(db, 'rewardRedemptions'), where('redemptionCode', '==', cleanCode), limit(1));
    const snap2 = await getDocs(q2);
    if (!snap2.empty) {
      return snap2.docs[0].data() as RewardRedemption;
    }

    // 3. Fallback: Lookup code in permanent redemptionCodes registry
    const codeRegSnap = await getDoc(doc(db, 'redemptionCodes', cleanCode));
    if (codeRegSnap.exists()) {
      const regData = codeRegSnap.data();
      if (regData.redemptionId) {
        const redSnap = await getDoc(doc(db, 'rewardRedemptions', regData.redemptionId));
        if (redSnap.exists()) {
          return redSnap.data() as RewardRedemption;
        }
      }
    }

    // 4. Also check with raw cleaned code if different from cleanCode
    if (rawClean && rawClean !== cleanCode) {
      const q3 = query(collection(db, 'rewardRedemptions'), where('code', '==', rawClean), limit(1));
      const snap3 = await getDocs(q3);
      if (!snap3.empty) {
        return snap3.docs[0].data() as RewardRedemption;
      }
    }

    return null;
  } catch (err) {
    console.error('verifyRedemptionByCode error:', err);
    return null;
  }
}

// ========================================================
// 9. ADMIN RECONCILIATION & AUDIT ENGINE
// ========================================================

/**
 * Reconciles a single player's wallet balance against the immutable transaction ledger.
 * Calculates: calculatedLedgerBalance = SUM(positive tx) - SUM(abs(negative tx))
 * If stored balance !== calculated balance, flags as DISCREPANCY.
 * NEVER silently overwrites balance; provides audit report for Admin review.
 */
export async function reconcilePlayerWallet(playerUid: string): Promise<WalletReconciliationResult> {
  const playerRef = doc(db, 'players', playerUid);
  const playerSnap = await getDoc(playerRef);

  const gamerTag = playerSnap.exists()
    ? (playerSnap.data() as Player).gamerTag || 'Player'
    : 'Unknown Player';
  const currentWalletBalance = playerSnap.exists()
    ? Number((playerSnap.data() as Player).nexusCoins || 0)
    : 0;

  // Query all transactions for this player
  const txQuery = query(
    collection(db, 'coinTransactions'),
    where('playerUid', '==', playerUid)
  );
  const txSnap = await getDocs(txQuery);

  let totalPositiveCoins = 0;
  let totalNegativeCoins = 0;

  txSnap.docs.forEach((d) => {
    const tx = d.data() as CoinTransaction;
    const amount = Number(tx.amount || 0);
    if (amount > 0) {
      totalPositiveCoins += amount;
    } else if (amount < 0) {
      totalNegativeCoins += Math.abs(amount);
    }
  });

  const calculatedLedgerBalance = totalPositiveCoins - totalNegativeCoins;
  const delta = currentWalletBalance - calculatedLedgerBalance;
  const isDiscrepancy = delta !== 0;

  if (isDiscrepancy) {
    console.warn(
      `[NC AUDIT DISCREPANCY] Player: ${gamerTag} (${playerUid}) | Stored Balance: ${currentWalletBalance} NC | Ledger Balance: ${calculatedLedgerBalance} NC | Delta: ${delta > 0 ? `+${delta}` : delta} NC`
    );
  }

  return {
    playerUid,
    playerId: playerUid,
    gamerTag,
    currentWalletBalance,
    calculatedLedgerBalance,
    delta,
    isDiscrepancy,
    totalPositiveCoins,
    totalNegativeCoins,
    transactionCount: txSnap.docs.length,
    reconciledAt: Date.now(),
  };
}

/**
 * Runs a full audit across all registered players in the system.
 * Returns array sorted with discrepancies at the top.
 */
export async function reconcileAllWallets(): Promise<WalletReconciliationResult[]> {
  try {
    const playersSnap = await getDocs(collection(db, 'players'));
    const results: WalletReconciliationResult[] = [];

    for (const pDoc of playersSnap.docs) {
      const res = await reconcilePlayerWallet(pDoc.id);
      results.push(res);
    }

    // Sort discrepancies first, then by gamerTag
    results.sort((a, b) => {
      if (a.isDiscrepancy && !b.isDiscrepancy) return -1;
      if (!a.isDiscrepancy && b.isDiscrepancy) return 1;
      return a.gamerTag.localeCompare(b.gamerTag);
    });

    return results;
  } catch (err) {
    console.error('reconcileAllWallets error:', err);
    return [];
  }
}
