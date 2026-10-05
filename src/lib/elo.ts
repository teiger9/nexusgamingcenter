/**
 * Nexus Gaming Center - MMR & Provisional Ranking System
 * 
 * Rules:
 * 1. Starting MMR: 1000 per game (Chess, FC, Valorant, CS2, League of Legends each have independent MMR).
 * 2. Provisional Period: First 10 confirmed matches in a specific game (placementGames < 10, isProvisional = true).
 * 3. Provisional K-Factor: K = 96.
 * 4. Established K-Factor: K = 32 (isProvisional = false, placementGames >= 10).
 * 5. Win-Streak Multiplier (Provisional only):
 *    - 1-2 consecutive wins: 1.0x
 *    - 3-4 consecutive wins: 1.10x
 *    - 5+ consecutive wins: 1.20x
 *    - Rating change clamped between -150 and +150 during provisional period.
 * 6. Performance MMR:
 *    performanceRating = averageOpponentRating + 400 * log10((wins + 1) / (losses + 1))
 *    Clamped between 800 and 2500.
 * 7. Combined Provisional MMR:
 *    weight = placementGames / 10
 *    combinedMMR = ELO_MMR * (1 - weight) + PerformanceMMR * weight
 *    Round to whole numbers.
 * 8. Established Player Protection: Normal ELO only (K = 32, no multipliers).
 */

export const INITIAL_RATING = 1000;
export const K_ESTABLISHED = 32;
export const K_PROVISIONAL = 96;
export const PLACEMENT_GAMES_REQUIRED = 10;
export const PROVISIONAL_MAX_CHANGE = 150;
export const PROVISIONAL_MIN_CHANGE = -150;
export const PERF_MIN = 800;
export const PERF_MAX = 2500;

export interface PlayerRatingState {
  rating: number; // Current displayed/active rating
  eloRating?: number; // Internal pure ELO rating accumulator
  performanceRating?: number; // Performance estimate
  isProvisional: boolean;
  placementGames: number;
  sumOpponentRatings?: number;
  averageOpponentRating?: number;
  winStreak?: number;
  gamesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
}

export interface SinglePlayerRatingResult {
  newRating: number; // Displayed MMR
  ratingChange: number; // Net change in displayed MMR
  newEloRating: number;
  newPerformanceRating: number;
  newIsProvisional: boolean;
  newPlacementGames: number;
  newSumOpponentRatings: number;
  newAverageOpponentRating: number;
  newWinStreak: number;
  expectedScore: number;
  score: number;
  kFactorUsed: number;
}

export interface MatchRatingCalculationResult {
  playerA: SinglePlayerRatingResult;
  playerB: SinglePlayerRatingResult;
}

/**
 * Expected score formula:
 * Expected = 1 / (1 + 10^((OpponentRating - PlayerRating) / 400))
 */
export function calculateExpectedScore(playerRating: number, opponentRating: number): number {
  return 1 / (1 + Math.pow(10, (opponentRating - playerRating) / 400));
}

/**
 * Win streak multiplier during provisional matches only:
 * 1-2 consecutive wins: 1.0
 * 3-4 consecutive wins: 1.10
 * 5+ consecutive wins: 1.20
 */
export function getProvisionalWinStreakMultiplier(winStreak: number): number {
  if (winStreak >= 5) return 1.20;
  if (winStreak >= 3) return 1.10;
  return 1.0;
}

/**
 * Performance rating estimate:
 * performanceRating = averageOpponentRating + 400 * log10((wins + 1) / (losses + 1))
 * Clamped between 800 and 2500.
 */
export function calculatePerformanceRating(averageOpponentRating: number, wins: number, losses: number): number {
  const ratio = (wins + 1) / (losses + 1);
  const rawPerf = averageOpponentRating + 400 * Math.log10(ratio);
  return Math.min(PERF_MAX, Math.max(PERF_MIN, Math.round(rawPerf)));
}

/**
 * Calculate updated rating for a single player against an opponent
 */
export function calculateSinglePlayerRating(
  player: PlayerRatingState,
  opponentRating: number,
  score: 1 | 0 | 0.5 // 1 = Win, 0 = Loss, 0.5 = Draw
): SinglePlayerRatingResult {
  const currentDisplayedRating = player.rating || INITIAL_RATING;
  const currentElo = player.eloRating || currentDisplayedRating;
  const wasProvisional = player.isProvisional !== false && (player.placementGames || 0) < PLACEMENT_GAMES_REQUIRED;

  const expectedScore = calculateExpectedScore(currentDisplayedRating, opponentRating);

  // Win streak calculation
  let newWinStreak = 0;
  if (score === 1) {
    newWinStreak = (player.winStreak || 0) + 1;
  } else {
    newWinStreak = 0;
  }

  // Update placement tracking
  const oldPlacementGames = player.placementGames || 0;
  const newPlacementGames = Math.min(PLACEMENT_GAMES_REQUIRED, oldPlacementGames + 1);
  const newIsProvisional = newPlacementGames < PLACEMENT_GAMES_REQUIRED;

  const oldSumOpponentRatings = player.sumOpponentRatings || (player.averageOpponentRating ? player.averageOpponentRating * oldPlacementGames : opponentRating * oldPlacementGames);
  const newSumOpponentRatings = oldSumOpponentRatings + opponentRating;
  const newAverageOpponentRating = Math.round(newSumOpponentRatings / newPlacementGames);

  const newWins = (player.wins || 0) + (score === 1 ? 1 : 0);
  const newLosses = (player.losses || 0) + (score === 0 ? 1 : 0);

  if (wasProvisional) {
    // PROVISIONAL CALCULATION (K = 96)
    const kFactor = K_PROVISIONAL;
    const baseEloChange = kFactor * (score - expectedScore);

    // Apply win streak multiplier if positive
    let adjustedChange = baseEloChange;
    if (score === 1 && baseEloChange > 0) {
      const streakMultiplier = getProvisionalWinStreakMultiplier(newWinStreak);
      adjustedChange = baseEloChange * streakMultiplier;
    }

    // Clamp rating change per match during provisional
    adjustedChange = Math.max(PROVISIONAL_MIN_CHANGE, Math.min(PROVISIONAL_MAX_CHANGE, adjustedChange));
    const newEloRating = Math.max(100, Math.round(currentElo + adjustedChange));

    // Calculate Performance MMR
    const newPerformanceRating = calculatePerformanceRating(newAverageOpponentRating, newWins, newLosses);

    // Combined MMR: weight = placementGames / 10
    const weight = newPlacementGames / PLACEMENT_GAMES_REQUIRED;
    const combinedMMR = Math.round(newEloRating * (1 - weight) + newPerformanceRating * weight);
    const finalRating = Math.max(100, combinedMMR);
    const ratingChange = finalRating - currentDisplayedRating;

    return {
      newRating: finalRating,
      ratingChange,
      newEloRating,
      newPerformanceRating,
      newIsProvisional,
      newPlacementGames,
      newSumOpponentRatings,
      newAverageOpponentRating,
      newWinStreak,
      expectedScore: Number(expectedScore.toFixed(4)),
      score,
      kFactorUsed: kFactor,
    };
  } else {
    // ESTABLISHED PLAYER CALCULATION (K = 32, no multipliers)
    const kFactor = K_ESTABLISHED;
    const rawChange = kFactor * (score - expectedScore);
    const ratingChange = Math.round(rawChange);
    const finalRating = Math.max(100, currentDisplayedRating + ratingChange);

    return {
      newRating: finalRating,
      ratingChange,
      newEloRating: finalRating,
      newPerformanceRating: player.performanceRating || finalRating,
      newIsProvisional: false,
      newPlacementGames: PLACEMENT_GAMES_REQUIRED,
      newSumOpponentRatings: newSumOpponentRatings,
      newAverageOpponentRating: newAverageOpponentRating,
      newWinStreak,
      expectedScore: Number(expectedScore.toFixed(4)),
      score,
      kFactorUsed: kFactor,
    };
  }
}

/**
 * Main matchmaking ELO / Provisional rating calculator for a confirmed match
 */
export function calculateMatchRatings(
  playerA: PlayerRatingState,
  playerB: PlayerRatingState,
  outcome: 'playerA' | 'playerB' | 'draw'
): MatchRatingCalculationResult {
  const scoreA: 1 | 0 | 0.5 = outcome === 'playerA' ? 1 : outcome === 'playerB' ? 0 : 0.5;
  const scoreB: 1 | 0 | 0.5 = outcome === 'playerB' ? 1 : outcome === 'playerA' ? 0 : 0.5;

  const ratingA = playerA.rating || INITIAL_RATING;
  const ratingB = playerB.rating || INITIAL_RATING;

  const resultA = calculateSinglePlayerRating(playerA, ratingB, scoreA);
  const resultB = calculateSinglePlayerRating(playerB, ratingA, scoreB);

  return {
    playerA: resultA,
    playerB: resultB,
  };
}

/**
 * Legacy compatibility wrapper
 */
export function calculateElo(
  ratingA: number = INITIAL_RATING,
  ratingB: number = INITIAL_RATING,
  outcome: 'playerA' | 'playerB' | 'draw'
) {
  const result = calculateMatchRatings(
    {
      rating: ratingA,
      isProvisional: false,
      placementGames: 10,
      gamesPlayed: 10,
      wins: 5,
      losses: 5,
      draws: 0,
    },
    {
      rating: ratingB,
      isProvisional: false,
      placementGames: 10,
      gamesPlayed: 10,
      wins: 5,
      losses: 5,
      draws: 0,
    },
    outcome
  );

  return {
    playerANewRating: result.playerA.newRating,
    playerBNewRating: result.playerB.newRating,
    playerAChange: result.playerA.ratingChange,
    playerBChange: result.playerB.ratingChange,
    playerAExpected: result.playerA.expectedScore,
    playerBExpected: result.playerB.expectedScore,
  };
}
