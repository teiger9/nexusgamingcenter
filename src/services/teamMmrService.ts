/**
 * NEXUS GAMING CENTER — TEAM MMR SERVICE
 * Centralized authoritative calculation engine for Valorant & CS2 5v5 Team Competitions.
 * 
 * Rules:
 * 1. Competitive MMR is calculated at the TEAM level (Team A vs Team B).
 * 2. The resulting Team MMR change is applied to all 5 participating players on that team.
 * 3. Five independent 1v1 MMR results must NOT be calculated for 5v5 team matches.
 * 4. Generates stable, deterministic team identities for temporary/custom teams.
 * 5. Strictly validates 10 unique, non-overlapping players across Team A and Team B.
 */

import { calculateExpectedScore, INITIAL_RATING, K_ESTABLISHED, K_PROVISIONAL } from '../lib/elo';
import { getRankFromMMR, SupportedGameId } from '../lib/ranks';

export interface TeamMemberSnapshot {
  uid: string;
  gamerTag: string;
  fullName?: string;
  avatarUrl?: string;
}

export interface TeamSnapshot {
  teamId: string;
  teamName: string;
  teamTag: string;
  teamLogo?: string;
  players: TeamMemberSnapshot[];
  playerIds: string[];
  playerGamerTags: string[];
  ratingBefore: number;
}

export interface TeamMmrCalculationInput {
  teamARatingBefore: number;
  teamBRatingBefore: number;
  outcome: 'teamA' | 'teamB' | 'draw';
  teamAGamesPlayed?: number;
  teamBGamesPlayed?: number;
  kFactor?: number;
}

export interface TeamMmrCalculationResult {
  teamARatingBefore: number;
  teamBRatingBefore: number;
  teamAChange: number;
  teamBChange: number;
  teamARatingAfter: number;
  teamBRatingAfter: number;
  expectedScoreA: number;
  expectedScoreB: number;
  kFactorUsed: number;
}

/**
 * Deterministically generates a stable team identity for custom/temporary teams
 * so repeated matches involving the same squad can be tracked consistently.
 */
export function generateStableTeamId(
  gameId: string,
  teamName: string,
  teamTag: string,
  playerIds: string[]
): string {
  const normGame = (gameId || 'val').toLowerCase().replace(/[^a-z0-9]/g, '');
  const normTag = (teamTag || 'SQUAD').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
  const normName = (teamName || 'team').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 16);
  
  // Sort player UIDs to ensure order independence
  const sortedIds = [...playerIds].sort().join('_');
  let hash = 0;
  for (let i = 0; i < sortedIds.length; i++) {
    hash = (hash << 5) - hash + sortedIds.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }
  const hashStr = Math.abs(hash).toString(36).substring(0, 6);

  return `team_${normGame}_${normTag}_${normName}_${hashStr}`;
}

/**
 * Validates Team A and Team B composition for 5v5 matches.
 * Strictly verifies 5 players in Team A, 5 players in Team B, and exactly 10 unique players.
 */
export function validate5v5TeamComposition(
  teamA: { teamName: string; teamTag: string; playerIds: string[]; players?: { uid: string; gamerTag: string }[] },
  teamB: { teamName: string; teamTag: string; playerIds: string[]; players?: { uid: string; gamerTag: string }[] }
): { valid: boolean; error?: string } {
  // 1. Team Name Checks
  if (!teamA.teamName || !teamA.teamName.trim()) {
    return { valid: false, error: 'Team A Name is required.' };
  }
  if (!teamB.teamName || !teamB.teamName.trim()) {
    return { valid: false, error: 'Team B Name is required.' };
  }
  if (teamA.teamName.trim().length < 2 || teamA.teamName.trim().length > 30) {
    return { valid: false, error: 'Team A Name must be between 2 and 30 characters.' };
  }
  if (teamB.teamName.trim().length < 2 || teamB.teamName.trim().length > 30) {
    return { valid: false, error: 'Team B Name must be between 2 and 30 characters.' };
  }

  // 2. Team Tag Checks
  const tagA = (teamA.teamTag || '').trim().toUpperCase();
  const tagB = (teamB.teamTag || '').trim().toUpperCase();
  if (!tagA || tagA.length < 2 || tagA.length > 5) {
    return { valid: false, error: 'Team A Tag must be between 2 and 5 characters (e.g. ALP).' };
  }
  if (!tagB || tagB.length < 2 || tagB.length > 5) {
    return { valid: false, error: 'Team B Tag must be between 2 and 5 characters (e.g. OMG).' };
  }

  // 3. Player Counts
  const pAIds = teamA.playerIds || [];
  const pBIds = teamB.playerIds || [];

  if (pAIds.length !== 5) {
    return {
      valid: false,
      error: `Team A must contain exactly 5 players. Currently has ${pAIds.length}.`,
    };
  }
  if (pBIds.length !== 5) {
    return {
      valid: false,
      error: `Team B must contain exactly 5 players. Currently has ${pBIds.length}.`,
    };
  }

  // 4. Duplicate checks within Team A
  const setA = new Set<string>();
  for (const uid of pAIds) {
    if (!uid || typeof uid !== 'string' || !uid.trim()) {
      return { valid: false, error: 'Team A contains an invalid or empty player ID.' };
    }
    if (setA.has(uid)) {
      return { valid: false, error: `Duplicate player detected in Team A: ${uid}` };
    }
    setA.add(uid);
  }

  // 5. Duplicate checks within Team B
  const setB = new Set<string>();
  for (const uid of pBIds) {
    if (!uid || typeof uid !== 'string' || !uid.trim()) {
      return { valid: false, error: 'Team B contains an invalid or empty player ID.' };
    }
    if (setB.has(uid)) {
      return { valid: false, error: `Duplicate player detected in Team B: ${uid}` };
    }
    setB.add(uid);
  }

  // 6. Overlap checks between Team A and Team B
  for (const uid of setB) {
    if (setA.has(uid)) {
      return {
        valid: false,
        error: `Player cannot play on both teams simultaneously: ${uid}`,
      };
    }
  }

  // 7. Total unique players check
  const allUids = new Set([...pAIds, ...pBIds]);
  if (allUids.size !== 10) {
    return {
      valid: false,
      error: `Match must have exactly 10 unique players across both teams. Found ${allUids.size}.`,
    };
  }

  return { valid: true };
}

/**
 * Calculates authoritative Team MMR changes for Valorant and CS2 5v5 matches.
 * Follows canonical Nexus Elo formulation.
 * Zero-sum team exchange: teamAChange = -teamBChange.
 */
export function calculateTeamMatchMmr(input: TeamMmrCalculationInput): TeamMmrCalculationResult {
  const ratingA = typeof input.teamARatingBefore === 'number' && Number.isFinite(input.teamARatingBefore) && input.teamARatingBefore > 0
    ? input.teamARatingBefore
    : INITIAL_RATING;

  const ratingB = typeof input.teamBRatingBefore === 'number' && Number.isFinite(input.teamBRatingBefore) && input.teamBRatingBefore > 0
    ? input.teamBRatingBefore
    : INITIAL_RATING;

  const scoreA: 1 | 0 | 0.5 = input.outcome === 'teamA' ? 1 : input.outcome === 'teamB' ? 0 : 0.5;
  const scoreB: 1 | 0 | 0.5 = input.outcome === 'teamB' ? 1 : input.outcome === 'teamA' ? 0 : 0.5;

  const expectedScoreA = calculateExpectedScore(ratingA, ratingB);
  const expectedScoreB = calculateExpectedScore(ratingB, ratingA);

  // K factor determination:
  // If kFactor explicitly supplied, use it.
  // Otherwise, if either squad has < 10 matches, use provisional K (e.g. 86 or K_PROVISIONAL = 96), else K_ESTABLISHED (32).
  const isProvisional = (input.teamAGamesPlayed ?? 10) < 10 || (input.teamBGamesPlayed ?? 10) < 10;
  const kFactor = input.kFactor ?? (isProvisional ? 86 : K_ESTABLISHED);

  const rawChangeA = kFactor * (scoreA - expectedScoreA);
  const changeA = Math.round(rawChangeA);
  const changeB = -changeA; // Strictly symmetric and zero-sum

  const teamARatingAfter = Math.max(100, ratingA + changeA);
  const teamBRatingAfter = Math.max(100, ratingB + changeB);

  return {
    teamARatingBefore: ratingA,
    teamBRatingBefore: ratingB,
    teamAChange: changeA,
    teamBChange: changeB,
    teamARatingAfter,
    teamBRatingAfter,
    expectedScoreA: Number(expectedScoreA.toFixed(4)),
    expectedScoreB: Number(expectedScoreB.toFixed(4)),
    kFactorUsed: kFactor,
  };
}

/**
 * Returns formatted rank tier information for a given team MMR in Valorant, CS2, or League of Legends
 */
export function getTeamRankDisplay(mmr: number, gameId: 'valorant' | 'cs2' | 'lol' | string = 'valorant') {
  const tier = getRankFromMMR(mmr);
  const clean = (gameId || '').toLowerCase().trim();
  
  let rankTitle: string = tier.name;
  if (clean.includes('val')) {
    if (mmr >= 2000) rankTitle = 'Radiant';
    else if (mmr >= 1800) rankTitle = 'Immortal';
    else if (mmr >= 1600) rankTitle = 'Ascendant';
    else if (mmr >= 1400) rankTitle = 'Diamond';
    else if (mmr >= 1200) rankTitle = 'Platinum';
    else if (mmr >= 1000) rankTitle = 'Gold';
    else rankTitle = 'Silver';
  } else if (clean.includes('cs')) {
    if (mmr >= 2000) rankTitle = 'The Global Elite';
    else if (mmr >= 1800) rankTitle = 'Supreme First Class';
    else if (mmr >= 1600) rankTitle = 'Legendary Eagle';
    else if (mmr >= 1400) rankTitle = 'Distinguished Master';
    else if (mmr >= 1200) rankTitle = 'Master Guardian';
    else if (mmr >= 1000) rankTitle = 'Gold Nova';
    else rankTitle = 'Silver Star';
  } else if (clean.includes('lol') || clean.includes('league')) {
    if (mmr >= 2000) rankTitle = 'Challenger';
    else if (mmr >= 1800) rankTitle = 'Grandmaster';
    else if (mmr >= 1600) rankTitle = 'Master';
    else if (mmr >= 1400) rankTitle = 'Diamond';
    else if (mmr >= 1200) rankTitle = 'Emerald / Platinum';
    else if (mmr >= 1000) rankTitle = 'Gold';
    else rankTitle = 'Silver';
  }

  return {
    tier,
    rankTitle,
    colorHex: tier.colorHex,
    textColorClass: tier.textColorClass,
    borderColorClass: tier.borderColorClass,
    icon: tier.icon || '🛡️',
  };
}
