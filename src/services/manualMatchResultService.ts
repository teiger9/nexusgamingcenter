import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  runTransaction,
  onSnapshot,
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import {
  OfficialMatchResult,
  OfficialMatchStatus,
  Player,
  CoinTransaction,
  Match,
  MatchHistoryRecord,
  PlayerGameRating,
  SeasonPlayerGameRating,
  SeasonPlayerOverall,
  RatingTransaction,
  Season,
} from '../types';
import { normalizeUserRole, FOUNDING_SUPER_ADMIN_UID } from './roleService';
import { TrustedAuditPipeline, TrustedAuthContext } from './trustedAuditService';
import { sendNotification } from './notificationService';
import { sanitizeFirestoreData } from './matchService';
import { DEFAULT_GAME_REWARDS, getCoinRewardsSettings } from './coinRewardService';
import {
  calculateMatchRatings,
  calculateSinglePlayerRating,
  INITIAL_RATING,
  PLACEMENT_GAMES_REQUIRED,
  K_ESTABLISHED,
} from '../lib/elo';
import {
  calculateTeamMatchMmr,
  generateStableTeamId,
  validate5v5TeamComposition,
} from './teamMmrService';
import { getActiveSeason, calculateSoftResetMMR } from './seasonService';

export interface ManualResultParticipant {
  uid: string;
  gamerTag: string;
  fullName?: string;
  email?: string;
}

export interface ManualMatchGameConfig {
  id: string;
  name: string;
  format: '1v1' | '5v5';
  device: string;
  icon: string;
  rewardRuleDescription: string;
  hasCanonicalReward: boolean;
}

export const SUPPORTED_MANUAL_GAMES: ManualMatchGameConfig[] = [
  {
    id: 'chess',
    name: 'Chess',
    format: '1v1',
    device: 'Physical & Digital Clocks',
    icon: '♟️',
    rewardRuleDescription: 'Win = +2 NC • Draw = +1 NC each • Loss = 0 NC',
    hasCanonicalReward: true,
  },
  {
    id: 'fc',
    name: 'FC',
    format: '1v1',
    device: 'PS5 Pro Station',
    icon: '⚽',
    rewardRuleDescription: 'Total Games Played × 60 NC (Winner: Total Games × 60 NC • Series Draw: Split equally • Loser: 0 NC)',
    hasCanonicalReward: true,
  },
  {
    id: 'valorant',
    name: 'Valorant',
    format: '5v5',
    device: 'PC 240Hz Rigs',
    icon: '🎯',
    rewardRuleDescription: '5v5 Hourly: Winning Team = 90 NC/hr per player (1h=90, 2h=180, 3h=270) • Losing Team = 30 NC/hr per player (1h=30, 2h=60, 3h=90) • Draw = 45 NC/hr per player',
    hasCanonicalReward: true,
  },
  {
    id: 'cs2',
    name: 'Counter-Strike 2',
    format: '5v5',
    device: 'PC 240Hz Rigs',
    icon: '🔫',
    rewardRuleDescription: '5v5 Hourly: Winning Team = 90 NC/hr per player (1h=90, 2h=180, 3h=270) • Losing Team = 30 NC/hr per player (1h=30, 2h=60, 3h=90) • Draw = 45 NC/hr per player',
    hasCanonicalReward: true,
  },
  {
    id: 'lol',
    name: 'League of Legends',
    format: '5v5',
    device: 'PC 240Hz Rigs',
    icon: '🧙',
    rewardRuleDescription: '5v5 Hourly: Winning Team = 90 NC/hr per player (1h=90, 2h=180, 3h=270) • Losing Team = 30 NC/hr per player (1h=30, 2h=60, 3h=90) • Draw = 45 NC/hr per player',
    hasCanonicalReward: true,
  },
];

/**
 * Fetch registered Nexus players for operator selection
 */
export async function fetchRegisteredPlayersForSelection(): Promise<ManualResultParticipant[]> {
  try {
    const snap = await getDocs(collection(db, 'players'));
    const list: ManualResultParticipant[] = [];
    snap.forEach((d) => {
      const data = d.data();
      if (data && data.uid && data.gamerTag) {
        list.push({
          uid: data.uid,
          gamerTag: data.gamerTag,
          fullName: data.fullName || data.gamerTag,
          email: data.email || '',
        });
      }
    });
    list.sort((a, b) => a.gamerTag.localeCompare(b.gamerTag));
    return list;
  } catch (err) {
    console.error('Error fetching registered players for manual selection:', err);
    return [];
  }
}

/**
 * Authoritative verification that caller is strictly Staff, Admin, or Super Admin
 */
export async function verifyOperatorRole(uid: string): Promise<{
  authorized: boolean;
  role?: 'STAFF' | 'ADMIN' | 'SUPER_ADMIN';
  gamerTag?: string;
  email?: string;
}> {
  if (!uid) return { authorized: false };
  if (uid === FOUNDING_SUPER_ADMIN_UID) {
    return { authorized: true, role: 'SUPER_ADMIN', gamerTag: 'Teiger9', email: 'bonoisacil@gmail.com' };
  }

  const currentUser = auth.currentUser;
  const currEmail = (currentUser?.email || '').toLowerCase().trim();
  if (currEmail === 'bonoisacil@gmail.com' || currEmail === 'babystore153@gmail.com') {
    return { authorized: true, role: 'SUPER_ADMIN', gamerTag: currentUser?.displayName || 'Super Admin', email: currEmail };
  }

  try {
    const playerSnap = await getDoc(doc(db, 'players', uid));
    if (playerSnap.exists()) {
      const data = playerSnap.data();
      const pEmail = (data?.email || '').toLowerCase().trim();
      if (pEmail === 'bonoisacil@gmail.com' || pEmail === 'babystore153@gmail.com') {
        return {
          authorized: true,
          role: 'SUPER_ADMIN',
          gamerTag: data?.gamerTag || 'Super Admin',
          email: pEmail,
        };
      }
      const role = normalizeUserRole(data?.role);
      if (role === 'SUPER_ADMIN' || role === 'ADMIN' || role === 'STAFF') {
        return {
          authorized: true,
          role,
          gamerTag: data?.gamerTag || 'Nexus Operator',
          email: data?.email || '',
        };
      }
    }

    const userSnap = await getDoc(doc(db, 'users', uid));
    if (userSnap.exists()) {
      const data = userSnap.data();
      const role = normalizeUserRole(data?.role);
      if (role === 'SUPER_ADMIN' || role === 'ADMIN' || role === 'STAFF') {
        return {
          authorized: true,
          role,
          gamerTag: data?.displayName || 'Nexus Operator',
          email: data?.email || '',
        };
      }
    }

    return { authorized: false };
  } catch (err) {
    console.error('Error verifying operator role:', err);
    return { authorized: false };
  }
}

export interface CalculateRewardInput {
  gameId: string;
  outcome: 'playerA' | 'playerB' | 'draw' | 'teamA' | 'teamB';
  // 1v1 FC Series scores
  playerAWins?: number;
  playerALosses?: number;
  playerBWins?: number;
  playerBLosses?: number;
  // Participants
  playerAId?: string;
  playerBId?: string;
  teamAPlayerIds?: string[];
  teamBPlayerIds?: string[];
  // 5v5 duration in hours (defaults to 1.0)
  officialHours?: number;
  useStandardMatchRewards?: boolean;
  teamAName?: string;
  teamATag?: string;
  teamBName?: string;
  teamBTag?: string;
}

export interface PlayerRewardAssignment {
  uid: string;
  amount: number;
  isWinner: boolean;
  teamSide?: 'teamA' | 'teamB';
  reason: string;
}

export interface CalculateRewardResult {
  valid: boolean;
  error?: string;
  winnerUids: string[];
  loserUids?: string[];
  rewardPerWinner: number;
  rewardPerLoser?: number;
  totalRewardAwarded: number;
  rewardBreakdown: string;
  isDraw: boolean;
  hasCanonicalReward: boolean;
  overallWinnerSummary: string;
  playerRewards?: PlayerRewardAssignment[];
  officialHours?: number;
}

export interface MMRPreviewInput {
  gameId: string;
  outcome: 'playerA' | 'playerB' | 'draw' | 'teamA' | 'teamB';
  playerAId?: string;
  playerBId?: string;
  playerARating?: number;
  playerBRating?: number;
  playerAWins?: number;
  playerALosses?: number;
  playerBWins?: number;
  playerBLosses?: number;
  teamAPlayerRatings?: { uid: string; rating: number; gamerTag?: string }[];
  teamBPlayerRatings?: { uid: string; rating: number; gamerTag?: string }[];
  teamARatingBefore?: number;
  teamBRatingBefore?: number;
}

export interface MMRPreviewResult {
  valid: boolean;
  playerAChange: number;
  playerBChange: number;
  playerANewRating: number;
  playerBNewRating: number;
  teamARatingBefore?: number;
  teamARatingAfter?: number;
  teamAChange?: number;
  teamBRatingBefore?: number;
  teamBRatingAfter?: number;
  teamBChange?: number;
  teamAChanges?: Record<string, { ratingBefore: number; ratingAfter: number; change: number }>;
  teamBChanges?: Record<string, { ratingBefore: number; ratingAfter: number; change: number }>;
}

/**
 * Authoritative MMR Preview using existing Nexus Elo / Provisional calculation.
 * Client displays this directly before submission.
 */
export function previewManualMatchRatings(input: MMRPreviewInput): MMRPreviewResult {
  const { gameId, outcome } = input;
  const cleanGameId = (gameId || '').toLowerCase().trim();
  const is1v1 = cleanGameId === 'chess' || cleanGameId === 'fc26' || cleanGameId === 'fc27' || cleanGameId === 'fc';

  if (is1v1) {
    const rA = input.playerARating ?? INITIAL_RATING;
    const rB = input.playerBRating ?? INITIAL_RATING;

    let effOutcome: 'playerA' | 'playerB' | 'draw' = 'playerA';
    if (cleanGameId === 'chess') {
      effOutcome = outcome === 'playerB' ? 'playerB' : outcome === 'draw' ? 'draw' : 'playerA';
    } else {
      // FC Series
      const aWins = input.playerAWins ?? 0;
      const bWins = input.playerBWins ?? 0;
      if (aWins > bWins) effOutcome = 'playerA';
      else if (bWins > aWins) effOutcome = 'playerB';
      else effOutcome = 'draw';
    }

    const calc = calculateMatchRatings(
      {
        rating: rA,
        eloRating: rA,
        isProvisional: false,
        placementGames: PLACEMENT_GAMES_REQUIRED,
        gamesPlayed: PLACEMENT_GAMES_REQUIRED,
        wins: 5,
        losses: 5,
        draws: 0,
      },
      {
        rating: rB,
        eloRating: rB,
        isProvisional: false,
        placementGames: PLACEMENT_GAMES_REQUIRED,
        gamesPlayed: PLACEMENT_GAMES_REQUIRED,
        wins: 5,
        losses: 5,
        draws: 0,
      },
      effOutcome
    );

    return {
      valid: true,
      playerAChange: calc.playerA.ratingChange,
      playerBChange: calc.playerB.ratingChange,
      playerANewRating: calc.playerA.newRating,
      playerBNewRating: calc.playerB.newRating,
    };
  } else {
    // 5v5 Team match: Competitive MMR is calculated at the team level, NOT 5 independent 1v1s!
    const teamA = input.teamAPlayerRatings || [];
    const teamB = input.teamBPlayerRatings || [];
    if (teamA.length === 0 || teamB.length === 0) {
      return {
        valid: false,
        playerAChange: 0,
        playerBChange: 0,
        playerANewRating: INITIAL_RATING,
        playerBNewRating: INITIAL_RATING,
      };
    }

    const avgA = Math.round(teamA.reduce((sum, p) => sum + (p.rating || INITIAL_RATING), 0) / Math.max(1, teamA.length));
    const avgB = Math.round(teamB.reduce((sum, p) => sum + (p.rating || INITIAL_RATING), 0) / Math.max(1, teamB.length));

    const ratingABefore = input.teamARatingBefore ?? (avgA || INITIAL_RATING);
    const ratingBBefore = input.teamBRatingBefore ?? (avgB || INITIAL_RATING);

    const teamMmrRes = calculateTeamMatchMmr({
      teamARatingBefore: ratingABefore,
      teamBRatingBefore: ratingBBefore,
      outcome: outcome as 'teamA' | 'teamB' | 'draw',
    });

    const teamAChanges: Record<string, { ratingBefore: number; ratingAfter: number; change: number }> = {};
    const teamBChanges: Record<string, { ratingBefore: number; ratingAfter: number; change: number }> = {};

    for (const p of teamA) {
      const pBefore = p.rating || INITIAL_RATING;
      teamAChanges[p.uid] = {
        ratingBefore: pBefore,
        ratingAfter: Math.max(100, pBefore + teamMmrRes.teamAChange),
        change: teamMmrRes.teamAChange,
      };
    }

    for (const p of teamB) {
      const pBefore = p.rating || INITIAL_RATING;
      teamBChanges[p.uid] = {
        ratingBefore: pBefore,
        ratingAfter: Math.max(100, pBefore + teamMmrRes.teamBChange),
        change: teamMmrRes.teamBChange,
      };
    }

    return {
      valid: true,
      teamARatingBefore: teamMmrRes.teamARatingBefore,
      teamARatingAfter: teamMmrRes.teamARatingAfter,
      teamAChange: teamMmrRes.teamAChange,
      teamBRatingBefore: teamMmrRes.teamBRatingBefore,
      teamBRatingAfter: teamMmrRes.teamBRatingAfter,
      teamBChange: teamMmrRes.teamBChange,
      playerAChange: teamMmrRes.teamAChange,
      playerBChange: teamMmrRes.teamBChange,
      playerANewRating: teamMmrRes.teamARatingAfter,
      playerBNewRating: teamMmrRes.teamBRatingAfter,
      teamAChanges,
      teamBChanges,
    };
  }
}

/**
 * Pure, authoritative calculation engine.
 * Operator NEVER controls the reward amount.
 */
export function calculateAuthoritativeMatchReward(input: CalculateRewardInput): CalculateRewardResult {
  const { gameId, outcome } = input;
  const cleanGameId = (gameId || '').toLowerCase().trim();

  // Participant guard: Player A and Player B cannot be the same
  if (input.playerAId && input.playerBId && input.playerAId === input.playerBId) {
    return {
      valid: false,
      error: 'Player A and Player B cannot be the same registered user.',
      winnerUids: [],
      rewardPerWinner: 0,
      totalRewardAwarded: 0,
      rewardBreakdown: '',
      isDraw: false,
      hasCanonicalReward: true,
      overallWinnerSummary: '',
    };
  }

  // 1. CHESS (1v1)
  if (cleanGameId === 'chess') {
    if (outcome === 'draw') {
      const winnerUids = [input.playerAId, input.playerBId].filter(Boolean) as string[];
      return {
        valid: true,
        winnerUids,
        rewardPerWinner: 1,
        totalRewardAwarded: 2, // 1 NC each
        rewardBreakdown: 'Chess Draw: Player A receives 1 NC, Player B receives 1 NC',
        isDraw: true,
        hasCanonicalReward: true,
        overallWinnerSummary: 'Draw (1 NC each)',
      };
    } else if (outcome === 'playerA') {
      if (!input.playerAId) return { valid: false, error: 'Player A is required', winnerUids: [], rewardPerWinner: 0, totalRewardAwarded: 0, rewardBreakdown: '', isDraw: false, hasCanonicalReward: true, overallWinnerSummary: '' };
      return {
        valid: true,
        winnerUids: [input.playerAId],
        rewardPerWinner: 2,
        totalRewardAwarded: 2,
        rewardBreakdown: 'Chess Win: Winner receives 2 NC, Loser receives 0 NC',
        isDraw: false,
        hasCanonicalReward: true,
        overallWinnerSummary: 'Player A Victory (+2 NC)',
      };
    } else if (outcome === 'playerB') {
      if (!input.playerBId) return { valid: false, error: 'Player B is required', winnerUids: [], rewardPerWinner: 0, totalRewardAwarded: 0, rewardBreakdown: '', isDraw: false, hasCanonicalReward: true, overallWinnerSummary: '' };
      return {
        valid: true,
        winnerUids: [input.playerBId],
        rewardPerWinner: 2,
        totalRewardAwarded: 2,
        rewardBreakdown: 'Chess Win: Winner receives 2 NC, Loser receives 0 NC',
        isDraw: false,
        hasCanonicalReward: true,
        overallWinnerSummary: 'Player B Victory (+2 NC)',
      };
    } else {
      return {
        valid: false,
        error: 'Invalid Chess outcome. Must be Player A Win, Player B Win, or Draw.',
        winnerUids: [],
        rewardPerWinner: 0,
        totalRewardAwarded: 0,
        rewardBreakdown: '',
        isDraw: false,
        hasCanonicalReward: true,
        overallWinnerSummary: '',
      };
    }
  }

  // 2. FC 26 / FC 27 (1v1 Series)
  if (cleanGameId === 'fc26' || cleanGameId === 'fc27' || cleanGameId === 'fc') {
    const aWins = input.playerAWins;
    const aLosses = input.playerALosses;
    const bWins = input.playerBWins;
    const bLosses = input.playerBLosses;

    // Numerical validation
    if (
      typeof aWins !== 'number' || typeof aLosses !== 'number' ||
      typeof bWins !== 'number' || typeof bLosses !== 'number' ||
      !Number.isFinite(aWins) || !Number.isFinite(aLosses) ||
      !Number.isFinite(bWins) || !Number.isFinite(bLosses) ||
      !Number.isInteger(aWins) || !Number.isInteger(aLosses) ||
      !Number.isInteger(bWins) || !Number.isInteger(bLosses) ||
      aWins < 0 || aLosses < 0 || bWins < 0 || bLosses < 0
    ) {
      return {
        valid: false,
        error: 'FC series scores must be valid positive integers (0 or greater).',
        winnerUids: [],
        rewardPerWinner: 0,
        totalRewardAwarded: 0,
        rewardBreakdown: '',
        isDraw: false,
        hasCanonicalReward: true,
        overallWinnerSummary: '',
      };
    }

    if (aWins > 50 || bWins > 50 || aLosses > 50 || bLosses > 50) {
      return {
        valid: false,
        error: 'FC series scores exceed reasonable maximum threshold (maximum 50 games per series).',
        winnerUids: [],
        rewardPerWinner: 0,
        totalRewardAwarded: 0,
        rewardBreakdown: '',
        isDraw: false,
        hasCanonicalReward: true,
        overallWinnerSummary: '',
      };
    }

    // Mathematical consistency check:
    // In a 1v1 series, Player A wins must equal Player B losses, and Player A losses must equal Player B wins
    if (aWins !== bLosses || aLosses !== bWins) {
      return {
        valid: false,
        error: 'Player A wins must match Player B losses, and Player A losses must match Player B wins.',
        winnerUids: [],
        rewardPerWinner: 0,
        totalRewardAwarded: 0,
        rewardBreakdown: '',
        isDraw: false,
        hasCanonicalReward: true,
        overallWinnerSummary: '',
      };
    }

    const totalGames = aWins + aLosses;

    if (totalGames === 0) {
      return {
        valid: false,
        error: 'FC series cannot have 0 total games played.',
        winnerUids: [],
        rewardPerWinner: 0,
        totalRewardAwarded: 0,
        rewardBreakdown: '',
        isDraw: false,
        hasCanonicalReward: true,
        overallWinnerSummary: '',
      };
    }

    // Outcome contradiction check:
    if (aWins > bWins && outcome === 'playerB') {
      return {
        valid: false,
        error: 'Submitted outcome (Player B) contradicts match score (Player A won more games).',
        winnerUids: [],
        rewardPerWinner: 0,
        totalRewardAwarded: 0,
        rewardBreakdown: '',
        isDraw: false,
        hasCanonicalReward: true,
        overallWinnerSummary: '',
      };
    }
    if (bWins > aWins && outcome === 'playerA') {
      return {
        valid: false,
        error: 'Submitted outcome (Player A) contradicts match score (Player B won more games).',
        winnerUids: [],
        rewardPerWinner: 0,
        totalRewardAwarded: 0,
        rewardBreakdown: '',
        isDraw: false,
        hasCanonicalReward: true,
        overallWinnerSummary: '',
      };
    }

    const totalReward = totalGames * 60;

    // Deterministic derivation of winner
    if (aWins > bWins) {
      if (!input.playerAId) {
        return {
          valid: false,
          error: 'Player A is required',
          winnerUids: [],
          rewardPerWinner: 0,
          totalRewardAwarded: 0,
          rewardBreakdown: '',
          isDraw: false,
          hasCanonicalReward: true,
          overallWinnerSummary: '',
        };
      }
      return {
        valid: true,
        winnerUids: [input.playerAId],
        rewardPerWinner: totalReward,
        totalRewardAwarded: totalReward,
        rewardBreakdown: `FC Series: ${totalGames} total games played × 60 NC = ${totalReward} NC (Winner Player A: +${totalReward} NC, Loser: 0 NC)`,
        isDraw: false,
        hasCanonicalReward: true,
        overallWinnerSummary: `Player A Winner (${aWins}W - ${aLosses}L • Total Games: ${totalGames} • +${totalReward} NC)`,
      };
    } else if (bWins > aWins) {
      if (!input.playerBId) {
        return {
          valid: false,
          error: 'Player B is required',
          winnerUids: [],
          rewardPerWinner: 0,
          totalRewardAwarded: 0,
          rewardBreakdown: '',
          isDraw: false,
          hasCanonicalReward: true,
          overallWinnerSummary: '',
        };
      }
      return {
        valid: true,
        winnerUids: [input.playerBId],
        rewardPerWinner: totalReward,
        totalRewardAwarded: totalReward,
        rewardBreakdown: `FC Series: ${totalGames} total games played × 60 NC = ${totalReward} NC (Winner Player B: +${totalReward} NC, Loser: 0 NC)`,
        isDraw: false,
        hasCanonicalReward: true,
        overallWinnerSummary: `Player B Winner (${bWins}W - ${bLosses}L • Total Games: ${totalGames} • +${totalReward} NC)`,
      };
    } else {
      // Draw in series (e.g. 3-3 -> 6 total games played = 360 NC pool split equally to 180 NC each)
      const splitReward = Math.floor(totalReward / 2);
      const winnerUids = [input.playerAId, input.playerBId].filter(Boolean) as string[];
      return {
        valid: true,
        winnerUids,
        rewardPerWinner: splitReward,
        totalRewardAwarded: totalReward,
        rewardBreakdown: `FC Series Draw: ${totalGames} total games played × 60 NC = ${totalReward} NC pool split equally (+${splitReward} NC each)`,
        isDraw: true,
        hasCanonicalReward: true,
        overallWinnerSummary: `Series Draw (${aWins}W - ${bWins}W • Total Games: ${totalGames} • +${splitReward} NC each)`,
      };
    }
  }

  // 3. 5v5 SQUADS: VALORANT, CS2, LEAGUE OF LEGENDS
  // Rule: Calculated per hour: Winning team = 90 NC/hr per player, Losing team = 30 NC/hr per player (Draw = 45 NC/hr per player)
  if (
    cleanGameId === 'valorant' ||
    cleanGameId === 'cs2' ||
    cleanGameId === 'lol' ||
    cleanGameId === 'league' ||
    cleanGameId === 'leagueoflegends'
  ) {
    const rawHours = input.officialHours;
    const hours =
      typeof rawHours === 'number' && Number.isFinite(rawHours) && !Number.isNaN(rawHours) && rawHours > 0
        ? rawHours
        : 1;

    if (hours < 0.25 || hours > 24) {
      return {
        valid: false,
        error: 'Match duration must be between 0.25 and 24 hours.',
        winnerUids: [],
        rewardPerWinner: 0,
        totalRewardAwarded: 0,
        rewardBreakdown: '',
        isDraw: false,
        hasCanonicalReward: true,
        overallWinnerSummary: '',
      };
    }

    const teamAUids = input.teamAPlayerIds || [];
    const teamBUids = input.teamBPlayerIds || [];

    if (teamAUids.length === 0 || teamBUids.length === 0) {
      return {
        valid: false,
        error: 'Both Team A and Team B must have participating players.',
        winnerUids: [],
        rewardPerWinner: 0,
        totalRewardAwarded: 0,
        rewardBreakdown: '',
        isDraw: false,
        hasCanonicalReward: true,
        overallWinnerSummary: '',
      };
    }

    const winRate = Math.round(90 * hours * 100) / 100;
    const loseRate = Math.round(30 * hours * 100) / 100;
    const drawRate = Math.round(45 * hours * 100) / 100;

    const gameDisplayName =
      cleanGameId === 'lol' || cleanGameId === 'league' || cleanGameId === 'leagueoflegends'
        ? 'League of Legends'
        : cleanGameId.toUpperCase();

    if (outcome === 'teamA') {
      const playerRewards: PlayerRewardAssignment[] = [
        ...teamAUids.map((uid) => ({
          uid,
          amount: winRate,
          isWinner: true,
          teamSide: 'teamA' as const,
          reason: `5v5 Winning Team (+${winRate} NC for ${hours}h @ 90 NC/hr)`,
        })),
        ...teamBUids.map((uid) => ({
          uid,
          amount: loseRate,
          isWinner: false,
          teamSide: 'teamB' as const,
          reason: `5v5 Losing Team (+${loseRate} NC for ${hours}h @ 30 NC/hr)`,
        })),
      ];
      const teamATotal = teamAUids.length * winRate;
      const teamBTotal = teamBUids.length * loseRate;
      const total = teamATotal + teamBTotal;
      return {
        valid: true,
        winnerUids: teamAUids,
        loserUids: teamBUids,
        rewardPerWinner: winRate,
        rewardPerLoser: loseRate,
        totalRewardAwarded: total,
        rewardBreakdown: `${gameDisplayName} 5v5 (${hours}h): Winning Team A = ${winRate} NC/player (90 NC/hr • ${teamATotal} NC squad total), Losing Team B = ${loseRate} NC/player (30 NC/hr • ${teamBTotal} NC squad total). Total = ${total} NC`,
        isDraw: false,
        hasCanonicalReward: true,
        overallWinnerSummary: `Team A Victory (+${winRate} NC each • Team B +${loseRate} NC each)`,
        playerRewards,
        officialHours: hours,
      };
    } else if (outcome === 'teamB') {
      const playerRewards: PlayerRewardAssignment[] = [
        ...teamBUids.map((uid) => ({
          uid,
          amount: winRate,
          isWinner: true,
          teamSide: 'teamB' as const,
          reason: `5v5 Winning Team (+${winRate} NC for ${hours}h @ 90 NC/hr)`,
        })),
        ...teamAUids.map((uid) => ({
          uid,
          amount: loseRate,
          isWinner: false,
          teamSide: 'teamA' as const,
          reason: `5v5 Losing Team (+${loseRate} NC for ${hours}h @ 30 NC/hr)`,
        })),
      ];
      const teamBTotal = teamBUids.length * winRate;
      const teamATotal = teamAUids.length * loseRate;
      const total = teamBTotal + teamATotal;
      return {
        valid: true,
        winnerUids: teamBUids,
        loserUids: teamAUids,
        rewardPerWinner: winRate,
        rewardPerLoser: loseRate,
        totalRewardAwarded: total,
        rewardBreakdown: `${gameDisplayName} 5v5 (${hours}h): Winning Team B = ${winRate} NC/player (90 NC/hr • ${teamBTotal} NC squad total), Losing Team A = ${loseRate} NC/player (30 NC/hr • ${teamATotal} NC squad total). Total = ${total} NC`,
        isDraw: false,
        hasCanonicalReward: true,
        overallWinnerSummary: `Team B Victory (+${winRate} NC each • Team A +${loseRate} NC each)`,
        playerRewards,
        officialHours: hours,
      };
    } else if (outcome === 'draw') {
      const playerRewards: PlayerRewardAssignment[] = [
        ...teamAUids.map((uid) => ({
          uid,
          amount: drawRate,
          isWinner: false,
          teamSide: 'teamA' as const,
          reason: `5v5 Draw (+${drawRate} NC for ${hours}h @ 45 NC/hr)`,
        })),
        ...teamBUids.map((uid) => ({
          uid,
          amount: drawRate,
          isWinner: false,
          teamSide: 'teamB' as const,
          reason: `5v5 Draw (+${drawRate} NC for ${hours}h @ 45 NC/hr)`,
        })),
      ];
      const teamATotal = teamAUids.length * drawRate;
      const teamBTotal = teamBUids.length * drawRate;
      const total = teamATotal + teamBTotal;
      return {
        valid: true,
        winnerUids: [...teamAUids, ...teamBUids],
        rewardPerWinner: drawRate,
        rewardPerLoser: drawRate,
        totalRewardAwarded: total,
        rewardBreakdown: `${gameDisplayName} 5v5 Draw (${hours}h): Both teams receive 45 NC/hr per player (${drawRate} NC/player • ${teamATotal} NC squad total each). Total = ${total} NC`,
        isDraw: true,
        hasCanonicalReward: true,
        overallWinnerSummary: `Match Draw (+${drawRate} NC each)`,
        playerRewards,
        officialHours: hours,
      };
    }
  }

  return {
    valid: false,
    error: `Unsupported game identifier: ${gameId}`,
    winnerUids: [],
    rewardPerWinner: 0,
    totalRewardAwarded: 0,
    rewardBreakdown: '',
    isDraw: false,
    hasCanonicalReward: false,
    overallWinnerSummary: '',
  };
}

export interface RecordManualMatchResultParams {
  gameId: string;
  gameName: string;
  matchFormat: '1v1' | '5v5';

  // 1v1 fields
  playerA?: ManualResultParticipant;
  playerB?: ManualResultParticipant;
  playerAWins?: number;
  playerALosses?: number;
  playerBWins?: number;
  playerBLosses?: number;
  outcome: 'playerA' | 'playerB' | 'draw' | 'teamA' | 'teamB';

  // Team fields
  teamAPlayers?: ManualResultParticipant[];
  teamBPlayers?: ManualResultParticipant[];
  teamAId?: string;
  teamAName?: string;
  teamATag?: string;
  teamBId?: string;
  teamBName?: string;
  teamBTag?: string;
  gameCount?: string | number;
  useStandardMatchRewards?: boolean;

  // 5v5 duration in hours (defaults to 1)
  officialHours?: number;

  // Optional operator note
  notes?: string;
  // Optional idempotency key override
  idempotencyKey?: string;
  // Optional validation ID
  validationId?: string;
}

export function getCanonicalGameName(gameId: string): string {
  const g = (gameId || '').toLowerCase().trim();
  if (g === 'chess') return 'Chess';
  if (g === 'fc26' || g === 'fc27' || g === 'fc') return 'FC';
  if (g.includes('cs') || g.includes('counter-strike') || g.includes('counterstrike')) return 'CS2';
  if (g.includes('val') || g.includes('valorant')) return 'Valorant';
  if (g.includes('lol') || g.includes('league')) return 'League of Legends';
  return gameId;
}

/**
 * Authoritative atomic result recording transaction.
 * Strictly verifies operator authority, copies authoritative usernames from /players/{uid},
 * computes canonical reward, credits wallets, creates immutable matchHistory, and logs audit atomically.
 */
export async function recordManualMatchResult(
  params: RecordManualMatchResultParams,
  operatorUid: string
): Promise<{
  success: boolean;
  resultId?: string;
  officialResult?: OfficialMatchResult;
  matchHistory?: MatchHistoryRecord;
  error?: string;
}> {
  // 1. Operator Authority Verification
  const opAuth = await verifyOperatorRole(operatorUid);
  if (!opAuth.authorized || !opAuth.role) {
    return {
      success: false,
      error: 'PERMISSION_DENIED: Only authorized Nexus Staff, Admin, or Super Admin can record official match results.',
    };
  }

  const rawCleanGameId = (params.gameId || '').toLowerCase().trim();
  const isFc = rawCleanGameId === 'fc' || rawCleanGameId === 'fc26' || rawCleanGameId === 'fc27';
  const cleanGameId = isFc ? 'fc' : rawCleanGameId;
  const canonicalGameCategory = isFc ? 'FC' : cleanGameId === 'chess' ? 'CHESS' : cleanGameId === 'valorant' ? 'VALORANT' : cleanGameId === 'cs2' ? 'CS2' : 'LEAGUE_OF_LEGENDS';
  const gameVersion = isFc ? (rawCleanGameId === 'fc27' ? 'FC27' : 'FC26') : undefined;
  const canonicalGameName = isFc ? 'FC' : getCanonicalGameName(cleanGameId);
  const gameConfig = SUPPORTED_MANUAL_GAMES.find((g) => g.id === cleanGameId) || {
    id: cleanGameId,
    name: canonicalGameName,
    format: params.matchFormat,
    device: isFc ? 'PS5 Pro Station' : 'Nexus Station',
    icon: isFc ? '⚽' : '🎮',
    rewardRuleDescription: 'Standard match validation',
    hasCanonicalReward: true,
  };

  // 2. Validate participants
  if (params.matchFormat === '1v1') {
    if (!params.playerA || !params.playerB) {
      return { success: false, error: 'Both Player 1 and Player 2 must be selected.' };
    }
    if (params.playerA.uid === params.playerB.uid) {
      return { success: false, error: 'Self-play invalid: Player 1 and Player 2 cannot be the same registered user.' };
    }
  } else {
    // 5v5 Team
    const tA = params.teamAPlayers || [];
    const tB = params.teamBPlayers || [];
    const isValorantOrCs2 = cleanGameId === 'valorant' || cleanGameId === 'cs2' || params.useStandardMatchRewards;

    const teamAName = (params.teamAName || '').trim() || (isValorantOrCs2 ? 'Team Alpha' : 'Team A');
    const teamATag = (params.teamATag || '').trim().toUpperCase() || (isValorantOrCs2 ? 'ALP' : 'TMA');
    const teamBName = (params.teamBName || '').trim() || (isValorantOrCs2 ? 'Team Omega' : 'Team B');
    const teamBTag = (params.teamBTag || '').trim().toUpperCase() || (isValorantOrCs2 ? 'OMG' : 'TMB');

    if (isValorantOrCs2) {
      const compCheck = validate5v5TeamComposition(
        { teamName: teamAName, teamTag: teamATag, playerIds: tA.map((p) => p.uid), players: tA },
        { teamName: teamBName, teamTag: teamBTag, playerIds: tB.map((p) => p.uid), players: tB }
      );
      if (!compCheck.valid) {
        return { success: false, error: compCheck.error || 'INVALID_5V5_TEAM_COMPOSITION' };
      }
    } else {
      if (tA.length === 0 || tB.length === 0) {
        return { success: false, error: 'Both teams must have at least one participating player.' };
      }
      const tAUids = new Set(tA.map((p) => p.uid));
      for (const p of tB) {
        if (tAUids.has(p.uid)) {
          return {
            success: false,
            error: `Player ${p.gamerTag} cannot be on both Team A and Team B simultaneously.`,
          };
        }
      }
    }
  }

  const resolvedTeamAName = (params.teamAName || '').trim() || 'Team Alpha';
  const resolvedTeamATag = (params.teamATag || '').trim().toUpperCase() || 'ALP';
  const resolvedTeamBName = (params.teamBName || '').trim() || 'Team Omega';
  const resolvedTeamBTag = (params.teamBTag || '').trim().toUpperCase() || 'OMG';
  const teamAId = params.teamAId || (params.matchFormat === '5v5' ? generateStableTeamId(cleanGameId, resolvedTeamAName, resolvedTeamATag, params.teamAPlayers?.map((p) => p.uid) || []) : undefined);
  const teamBId = params.teamBId || (params.matchFormat === '5v5' ? generateStableTeamId(cleanGameId, resolvedTeamBName, resolvedTeamBTag, params.teamBPlayers?.map((p) => p.uid) || []) : undefined);

  // 3. Calculate Authoritative Canonical Reward
  const calc = calculateAuthoritativeMatchReward({
    gameId: cleanGameId,
    outcome: params.outcome,
    playerAWins: params.playerAWins,
    playerALosses: params.playerALosses,
    playerBWins: params.playerBWins,
    playerBLosses: params.playerBLosses,
    playerAId: params.playerA?.uid,
    playerBId: params.playerB?.uid,
    teamAPlayerIds: params.teamAPlayers?.map((p) => p.uid),
    teamBPlayerIds: params.teamBPlayers?.map((p) => p.uid),
    officialHours: params.officialHours,
    useStandardMatchRewards: params.useStandardMatchRewards,
    teamAName: resolvedTeamAName,
    teamATag: resolvedTeamATag,
    teamBName: resolvedTeamBName,
    teamBTag: resolvedTeamBTag,
  });

  if (!calc.valid) {
    return { success: false, error: calc.error || 'Failed to validate match result and reward.' };
  }

  // 4. Generate deterministic or collision-safe idempotency key
  // Format from spec: manualMatchResult_{game}_{player1Id}_{player2Id}_{validationId}
  const now = Date.now();
  const rawP1Id = params.playerA?.uid || params.teamAPlayers?.[0]?.uid || 'p1';
  const rawP2Id = params.playerB?.uid || params.teamBPlayers?.[0]?.uid || 'p2';
  const validationId = params.validationId || `${now}_${Math.random().toString(36).substring(2, 8)}`;
  const canonicalGameSlug = canonicalGameName.replace(/\s+/g, '');
  const idempotencyKey =
    params.idempotencyKey ||
    `manualMatchResult_${canonicalGameSlug}_${rawP1Id}_${rawP2Id}_${validationId}`;

  const matchId = idempotencyKey;
  const matchHistoryDocRef = doc(db, 'matchHistory', matchId);
  const resultDocRef = doc(db, 'officialMatchResults', matchId);
  const matchDocRef = doc(db, 'matches', matchId);
  const auditLogRef = doc(db, 'auditLogs', `audit_val_${matchId}`);

  // Compile full participant reward assignments
  const rewardAssignments: {
    uid: string;
    amount: number;
    isWinner: boolean;
    reason: string;
  }[] = [];

  if (calc.playerRewards && calc.playerRewards.length > 0) {
    for (const pr of calc.playerRewards) {
      if (pr.amount > 0) {
        rewardAssignments.push({
          uid: pr.uid,
          amount: pr.amount,
          isWinner: pr.isWinner,
          reason: pr.reason,
        });
      }
    }
  } else {
    for (const wUid of calc.winnerUids) {
      if (calc.rewardPerWinner > 0) {
        rewardAssignments.push({
          uid: wUid,
          amount: calc.rewardPerWinner,
          isWinner: true,
          reason: `Official Manual Result: ${canonicalGameName} (${calc.rewardBreakdown})`,
        });
      }
    }
  }

  // 4b. Authoritative Active Season Verification (Section 10)
  const activeSeason = await getActiveSeason();
  if (!activeSeason || activeSeason.status !== 'ACTIVE') {
    return {
      success: false,
      error: 'NO_ACTIVE_SEASON: No active competitive season found. Validation rejected.',
    };
  }

  try {
    let finalResultData: OfficialMatchResult | null = null;
    let finalMatchHistoryRecord: MatchHistoryRecord | null = null;
    let committedPlayerSnaps: { uid: string; amount: number; isWinner: boolean }[] = [];

    await runTransaction(db, async (transaction) => {
      // 5. Idempotency Check: Prevent duplicate validation submission
      const existingHistorySnap = await transaction.get(matchHistoryDocRef);
      if (existingHistorySnap.exists()) {
        finalMatchHistoryRecord = existingHistorySnap.data() as MatchHistoryRecord;
        const existingResultSnap = await transaction.get(resultDocRef);
        if (existingResultSnap.exists()) {
          finalResultData = existingResultSnap.data() as OfficialMatchResult;
        }
        return;
      }

      // 6. Gather all participant UIDs for reads
      const participantUids: string[] = [];
      if (params.matchFormat === '1v1') {
        participantUids.push(rawP1Id, rawP2Id);
      } else {
        const tA = params.teamAPlayers?.map((p) => p.uid) || [];
        const tB = params.teamBPlayers?.map((p) => p.uid) || [];
        participantUids.push(...Array.from(new Set([...tA, ...tB])));
      }

      // =========================================================================
      // PHASE 1: ALL READS FIRST (Strict Firestore Transaction Invariant)
      // =========================================================================
      const playerDocRefs = participantUids.map((uid) => doc(db, 'players', uid));
      const pgrDocRefs = participantUids.map((uid) => doc(db, 'playerGameRatings', `${uid}_${cleanGameId}`));
      const spgrDocRefs = participantUids.map((uid) => doc(db, 'seasonPlayerGameRatings', `${activeSeason.id}_${uid}_${cleanGameId}`));
      const spoDocRefs = participantUids.map((uid) => doc(db, 'seasonPlayerOverall', `${activeSeason.id}_${uid}`));
      const teamADocRef = (params.matchFormat === '5v5' && teamAId) ? doc(db, 'teams', teamAId) : null;
      const teamBDocRef = (params.matchFormat === '5v5' && teamBId) ? doc(db, 'teams', teamBId) : null;

      const playerSnaps = await Promise.all(playerDocRefs.map((r) => transaction.get(r)));
      const pgrSnaps = await Promise.all(pgrDocRefs.map((r) => transaction.get(r)));
      const spgrSnaps = await Promise.all(spgrDocRefs.map((r) => transaction.get(r)));
      const spoSnaps = await Promise.all(spoDocRefs.map((r) => transaction.get(r)));
      const teamASnap = teamADocRef ? await transaction.get(teamADocRef) : null;
      const teamBSnap = teamBDocRef ? await transaction.get(teamBDocRef) : null;

      // Validate player existence and suspended/banned checks
      const playerDataMap = new Map<string, Player>();
      const pgrDataMap = new Map<string, PlayerGameRating>();
      const spgrDataMap = new Map<string, SeasonPlayerGameRating>();
      const spoDataMap = new Map<string, SeasonPlayerOverall>();

      for (let i = 0; i < participantUids.length; i++) {
        const uid = participantUids[i];
        const pSnap = playerSnaps[i];
        if (!pSnap.exists()) {
          throw new Error(`Authoritative player record for participant (${uid}) does not exist.`);
        }
        const pData = pSnap.data() as Player;
        if (pData.isBanned || pData.isSuspended || pData.status === 'BANNED' || pData.status === 'SUSPENDED') {
          throw new Error(`Participant ${pData.gamerTag || uid} is suspended or banned and cannot have match results recorded.`);
        }
        playerDataMap.set(uid, pData);

        const gamerTag = pData.gamerTag || 'Player';
        const pgrSnap = pgrSnaps[i];
        const defaultPgr: PlayerGameRating = {
          id: `${uid}_${cleanGameId}`,
          playerId: uid,
          gamerTag,
          gameId: cleanGameId,
          gameName: canonicalGameName,
          gameCategory: canonicalGameCategory,
          gameVersion,
          rating: INITIAL_RATING,
          eloRating: INITIAL_RATING,
          isProvisional: true,
          placementGames: 0,
          placementGamesRequired: PLACEMENT_GAMES_REQUIRED,
          sumOpponentRatings: 0,
          averageOpponentRating: INITIAL_RATING,
          winStreak: 0,
          currentWinStreak: 0,
          bestWinStreak: 0,
          gamesPlayed: 0,
          wins: 0,
          losses: 0,
          draws: 0,
          updatedAt: now,
        };
        pgrDataMap.set(uid, pgrSnap.exists() ? { ...defaultPgr, ...(pgrSnap.data() as PlayerGameRating) } : defaultPgr);

        const spgrSnap = spgrSnaps[i];
        const initialRating = pgrDataMap.get(uid)?.rating ?? INITIAL_RATING;
        const defaultSpgr: SeasonPlayerGameRating = {
          id: `${activeSeason.id}_${uid}_${cleanGameId}`,
          seasonId: activeSeason.id,
          seasonNumber: activeSeason.number,
          playerId: uid,
          gamerTag,
          gameId: cleanGameId,
          gameName: canonicalGameName,
          gameCategory: canonicalGameCategory,
          gameVersion,
          startingRating: calculateSoftResetMMR(initialRating),
          rating: calculateSoftResetMMR(initialRating),
          eloRating: calculateSoftResetMMR(initialRating),
          performanceRating: calculateSoftResetMMR(initialRating),
          isProvisional: true,
          placementGames: 0,
          placementGamesRequired: PLACEMENT_GAMES_REQUIRED,
          sumOpponentRatings: 0,
          averageOpponentRating: INITIAL_RATING,
          winStreak: 0,
          currentWinStreak: 0,
          bestWinStreak: 0,
          gamesPlayed: 0,
          wins: 0,
          losses: 0,
          draws: 0,
          updatedAt: now,
        };
        spgrDataMap.set(uid, spgrSnap.exists() ? { ...defaultSpgr, ...(spgrSnap.data() as SeasonPlayerGameRating) } : defaultSpgr);

        const spoSnap = spoSnaps[i];
        const defaultSpo: SeasonPlayerOverall = {
          id: `${activeSeason.id}_${uid}`,
          seasonId: activeSeason.id,
          seasonNumber: activeSeason.number,
          playerId: uid,
          gamerTag,
          fullName: pData.fullName || gamerTag,
          overallRating: calculateSoftResetMMR(initialRating),
          gamesPlayed: 0,
          wins: 0,
          losses: 0,
          draws: 0,
          updatedAt: now,
        };
        spoDataMap.set(uid, spoSnap.exists() ? { ...defaultSpo, ...(spoSnap.data() as SeasonPlayerOverall) } : defaultSpo);
      }

      // =========================================================================
      // PHASE 2: IN-MEMORY CALCULATIONS (MMR + NC)
      // =========================================================================
      const authoritativeP1GamerTag = playerDataMap.get(rawP1Id)?.gamerTag || 'Player 1';
      const authoritativeP2GamerTag = playerDataMap.get(rawP2Id)?.gamerTag || 'Player 2';
      const authoritativeP1FullName = playerDataMap.get(rawP1Id)?.fullName || authoritativeP1GamerTag;
      const authoritativeP2FullName = playerDataMap.get(rawP2Id)?.fullName || authoritativeP2GamerTag;

      let winnerId = '';
      let winnerGamerTag = '';
      let loserId = '';
      let loserGamerTag = '';
      let winnerNCReward = 0;
      let loserNCReward = 0;

      let p1Wins = params.playerAWins ?? (params.outcome === 'playerA' ? 1 : 0);
      let p1Losses = params.playerALosses ?? (params.outcome === 'playerB' ? 1 : 0);
      let p2Wins = params.playerBWins ?? (params.outcome === 'playerB' ? 1 : 0);
      let p2Losses = params.playerBLosses ?? (params.outcome === 'playerA' ? 1 : 0);

      // MMR Tracking maps
      const playerMMRResults = new Map<string, { ratingBefore: number; ratingAfter: number; change: number }>();
      const playerSeasonMMRResults = new Map<string, { ratingBefore: number; ratingAfter: number; change: number }>();

      let calculatedTeamMmrRes: ReturnType<typeof calculateTeamMatchMmr> | null = null;

      if (cleanGameId === 'chess') {
        if (params.outcome === 'playerA') {
          p1Wins = 1; p1Losses = 0; p2Wins = 0; p2Losses = 1;
          winnerId = rawP1Id; winnerGamerTag = authoritativeP1GamerTag;
          loserId = rawP2Id; loserGamerTag = authoritativeP2GamerTag;
          winnerNCReward = 2; loserNCReward = 0;
        } else if (params.outcome === 'playerB') {
          p1Wins = 0; p1Losses = 1; p2Wins = 1; p2Losses = 0;
          winnerId = rawP2Id; winnerGamerTag = authoritativeP2GamerTag;
          loserId = rawP1Id; loserGamerTag = authoritativeP1GamerTag;
          winnerNCReward = 2; loserNCReward = 0;
        } else {
          // Draw
          p1Wins = 0; p1Losses = 0; p2Wins = 0; p2Losses = 0;
          winnerId = 'DRAW'; winnerGamerTag = 'DRAW';
          loserId = 'DRAW'; loserGamerTag = 'DRAW';
          winnerNCReward = 1; loserNCReward = 1;
        }

        const p1RatingState = pgrDataMap.get(rawP1Id)!;
        const p2RatingState = pgrDataMap.get(rawP2Id)!;
        const calcAllTime = calculateMatchRatings(p1RatingState, p2RatingState, params.outcome as any);
        const sData1 = spgrDataMap.get(rawP1Id)!;
        const sData2 = spgrDataMap.get(rawP2Id)!;
        const calcSeason = calculateMatchRatings(sData1, sData2, params.outcome as any);

        playerMMRResults.set(rawP1Id, { ratingBefore: p1RatingState.rating, ratingAfter: calcAllTime.playerA.newRating, change: calcAllTime.playerA.ratingChange });
        playerMMRResults.set(rawP2Id, { ratingBefore: p2RatingState.rating, ratingAfter: calcAllTime.playerB.newRating, change: calcAllTime.playerB.ratingChange });
        playerSeasonMMRResults.set(rawP1Id, { ratingBefore: sData1.rating, ratingAfter: calcSeason.playerA.newRating, change: calcSeason.playerA.ratingChange });
        playerSeasonMMRResults.set(rawP2Id, { ratingBefore: sData2.rating, ratingAfter: calcSeason.playerB.newRating, change: calcSeason.playerB.ratingChange });

      } else if (cleanGameId === 'fc26' || cleanGameId === 'fc27' || cleanGameId === 'fc') {
        const totalMatches = (params.playerAWins ?? 0) + (params.playerALosses ?? 0);
        let effOutcome: 'playerA' | 'playerB' | 'draw' = 'playerA';

        if (params.outcome === 'playerA' || (params.playerAWins ?? 0) > (params.playerBWins ?? 0)) {
          effOutcome = 'playerA';
          winnerId = rawP1Id; winnerGamerTag = authoritativeP1GamerTag;
          loserId = rawP2Id; loserGamerTag = authoritativeP2GamerTag;
          winnerNCReward = totalMatches * 60;
          loserNCReward = 0;
        } else if (params.outcome === 'playerB' || (params.playerBWins ?? 0) > (params.playerAWins ?? 0)) {
          effOutcome = 'playerB';
          winnerId = rawP2Id; winnerGamerTag = authoritativeP2GamerTag;
          loserId = rawP1Id; loserGamerTag = authoritativeP1GamerTag;
          winnerNCReward = totalMatches * 60;
          loserNCReward = 0;
        } else {
          effOutcome = 'draw';
          winnerId = 'DRAW'; winnerGamerTag = 'DRAW';
          loserId = 'DRAW'; loserGamerTag = 'DRAW';
          const split = Math.floor((totalMatches * 60) / 2);
          winnerNCReward = split;
          loserNCReward = split;
        }

        const p1RatingState = pgrDataMap.get(rawP1Id)!;
        const p2RatingState = pgrDataMap.get(rawP2Id)!;
        const calcAllTime = calculateMatchRatings(p1RatingState, p2RatingState, effOutcome);
        const sData1 = spgrDataMap.get(rawP1Id)!;
        const sData2 = spgrDataMap.get(rawP2Id)!;
        const calcSeason = calculateMatchRatings(sData1, sData2, effOutcome);

        playerMMRResults.set(rawP1Id, { ratingBefore: p1RatingState.rating, ratingAfter: calcAllTime.playerA.newRating, change: calcAllTime.playerA.ratingChange });
        playerMMRResults.set(rawP2Id, { ratingBefore: p2RatingState.rating, ratingAfter: calcAllTime.playerB.newRating, change: calcAllTime.playerB.ratingChange });
        playerSeasonMMRResults.set(rawP1Id, { ratingBefore: sData1.rating, ratingAfter: calcSeason.playerA.newRating, change: calcSeason.playerA.ratingChange });
        playerSeasonMMRResults.set(rawP2Id, { ratingBefore: sData2.rating, ratingAfter: calcSeason.playerB.newRating, change: calcSeason.playerB.ratingChange });

      } else {
        // 5v5 Squads (Valorant, CS2, League of Legends)
        const teamAUids = params.teamAPlayers?.map((p) => p.uid) || [];
        const teamBUids = params.teamBPlayers?.map((p) => p.uid) || [];

        // Baseline Team Ratings
        let teamARatingBefore = 1000;
        let teamBRatingBefore = 1000;
        let teamAGamesPlayed = 0;
        let teamBGamesPlayed = 0;

        if (teamASnap && teamASnap.exists()) {
          const tAData = teamASnap.data();
          teamARatingBefore = tAData?.teamRating || 1000;
          teamAGamesPlayed = tAData?.matchesPlayed || 0;
        } else {
          const avgA = Math.round(teamAUids.reduce((sum, u) => sum + (pgrDataMap.get(u)?.rating || INITIAL_RATING), 0) / Math.max(1, teamAUids.length));
          teamARatingBefore = avgA || INITIAL_RATING;
        }

        if (teamBSnap && teamBSnap.exists()) {
          const tBData = teamBSnap.data();
          teamBRatingBefore = tBData?.teamRating || 1000;
          teamBGamesPlayed = tBData?.matchesPlayed || 0;
        } else {
          const avgB = Math.round(teamBUids.reduce((sum, u) => sum + (pgrDataMap.get(u)?.rating || INITIAL_RATING), 0) / Math.max(1, teamBUids.length));
          teamBRatingBefore = avgB || INITIAL_RATING;
        }

        // Authoritative Team MMR calculation (team level, NOT independent 1v1s)
        const teamMmrRes = calculateTeamMatchMmr({
          teamARatingBefore,
          teamBRatingBefore,
          outcome: params.outcome as 'teamA' | 'teamB' | 'draw',
          teamAGamesPlayed,
          teamBGamesPlayed,
        });
        calculatedTeamMmrRes = teamMmrRes;

        // The exact same team MMR change is reflected for all players on that team
        for (const u of teamAUids) {
          const rState = pgrDataMap.get(u)!;
          const sState = spgrDataMap.get(u)!;
          playerMMRResults.set(u, {
            ratingBefore: rState.rating,
            ratingAfter: Math.max(100, rState.rating + teamMmrRes.teamAChange),
            change: teamMmrRes.teamAChange,
          });
          playerSeasonMMRResults.set(u, {
            ratingBefore: sState.rating,
            ratingAfter: Math.max(100, sState.rating + teamMmrRes.teamAChange),
            change: teamMmrRes.teamAChange,
          });
        }

        for (const u of teamBUids) {
          const rState = pgrDataMap.get(u)!;
          const sState = spgrDataMap.get(u)!;
          playerMMRResults.set(u, {
            ratingBefore: rState.rating,
            ratingAfter: Math.max(100, rState.rating + teamMmrRes.teamBChange),
            change: teamMmrRes.teamBChange,
          });
          playerSeasonMMRResults.set(u, {
            ratingBefore: sState.rating,
            ratingAfter: Math.max(100, sState.rating + teamMmrRes.teamBChange),
            change: teamMmrRes.teamBChange,
          });
        }

        if (params.outcome === 'teamA') {
          winnerId = teamAId || rawP1Id;
          winnerGamerTag = resolvedTeamAName;
          loserId = teamBId || rawP2Id;
          loserGamerTag = resolvedTeamBName;
          winnerNCReward = calc.rewardPerWinner;
          loserNCReward = calc.rewardPerLoser || 0;
        } else if (params.outcome === 'teamB') {
          winnerId = teamBId || rawP2Id;
          winnerGamerTag = resolvedTeamBName;
          loserId = teamAId || rawP1Id;
          loserGamerTag = resolvedTeamAName;
          winnerNCReward = calc.rewardPerWinner;
          loserNCReward = calc.rewardPerLoser || 0;
        } else {
          winnerId = 'DRAW';
          winnerGamerTag = 'DRAW';
          loserId = 'DRAW';
          loserGamerTag = 'DRAW';
          winnerNCReward = calc.rewardPerWinner;
          loserNCReward = calc.rewardPerWinner;
        }
      }

      const validatedByRole =
        opAuth.role === 'SUPER_ADMIN'
          ? 'Super Admin'
          : opAuth.role === 'ADMIN'
          ? 'Admin'
          : 'Staff';

      const p1NCReward = winnerId === 'DRAW' ? winnerNCReward : winnerId === rawP1Id ? winnerNCReward : loserNCReward;
      const p2NCReward = winnerId === 'DRAW' ? loserNCReward : winnerId === rawP2Id ? winnerNCReward : loserNCReward;

      // =========================================================================
      // PHASE 3: WRITES (All Firestore writes committed atomically)
      // =========================================================================
      const rewardMap = new Map<string, number>();
      for (const pr of rewardAssignments) {
        rewardMap.set(pr.uid, (rewardMap.get(pr.uid) || 0) + pr.amount);
      }

      for (let i = 0; i < participantUids.length; i++) {
        const uid = participantUids[i];
        const pRef = playerDocRefs[i];
        const pgrRef = pgrDocRefs[i];
        const spgrRef = spgrDocRefs[i];
        const spoRef = spoDocRefs[i];

        const pData = playerDataMap.get(uid)!;
        const pgrData = pgrDataMap.get(uid)!;
        const spgrData = spgrDataMap.get(uid)!;
        const spoData = spoDataMap.get(uid)!;

        const mmrRes = playerMMRResults.get(uid) || { ratingBefore: pgrData.rating, ratingAfter: pgrData.rating, change: 0 };
        const sMmrRes = playerSeasonMMRResults.get(uid) || { ratingBefore: spgrData.rating, ratingAfter: spgrData.rating, change: 0 };
        const coinAward = rewardMap.get(uid) || 0;

        const isPlayerWinner = winnerId !== 'DRAW' && (calc.winnerUids.includes(uid) || (winnerId === uid));
        const isPlayerDraw = winnerId === 'DRAW';

        // 1. Update Player Document (All-Time overall stats + wallet)
        const updatedCoins = Number(pData.nexusCoins || 0) + coinAward;
        const updatedTotalEarned = Number(pData.totalCoinsEarned || 0) + coinAward;
        const updatedOverallRating = Math.max(100, Math.round((pData.overallRating || INITIAL_RATING) + mmrRes.change));

        let addGames = 1;
        let addWins = isPlayerWinner ? 1 : 0;
        let addLosses = (!isPlayerWinner && !isPlayerDraw) ? 1 : 0;
        let addDraws = isPlayerDraw ? 1 : 0;

        if (cleanGameId.startsWith('fc')) {
          addGames = (params.playerAWins ?? 0) + (params.playerALosses ?? 0);
          if (uid === rawP1Id) {
            addWins = params.playerAWins ?? 0;
            addLosses = params.playerALosses ?? 0;
          } else {
            addWins = params.playerBWins ?? 0;
            addLosses = params.playerBLosses ?? 0;
          }
          addDraws = 0;
        }

        const streak = isPlayerWinner ? (pData.currentWinStreak || 0) + 1 : 0;
        const bestStreak = Math.max(pData.bestWinStreak || 0, streak);

        transaction.set(
          pRef,
          sanitizeFirestoreData({
            ...pData,
            nexusCoins: updatedCoins,
            totalCoinsEarned: updatedTotalEarned,
            overallRating: updatedOverallRating,
            totalGames: (pData.totalGames || 0) + addGames,
            totalWins: (pData.totalWins || 0) + addWins,
            totalLosses: (pData.totalLosses || 0) + addLosses,
            totalDraws: (pData.totalDraws || 0) + addDraws,
            currentWinStreak: streak,
            bestWinStreak: bestStreak,
            updatedAt: now,
          }),
          { merge: true }
        );

        // 2. Update playerGameRatings Document (All-time game rating)
        const newGamesPlayed = (pgrData.gamesPlayed || 0) + addGames;
        transaction.set(
          pgrRef,
          sanitizeFirestoreData({
            ...pgrData,
            rating: mmrRes.ratingAfter,
            eloRating: mmrRes.ratingAfter,
            isProvisional: newGamesPlayed < PLACEMENT_GAMES_REQUIRED,
            placementGames: Math.min(PLACEMENT_GAMES_REQUIRED, newGamesPlayed),
            gamesPlayed: newGamesPlayed,
            wins: (pgrData.wins || 0) + addWins,
            losses: (pgrData.losses || 0) + addLosses,
            draws: (pgrData.draws || 0) + addDraws,
            winStreak: streak,
            currentWinStreak: streak,
            bestWinStreak: Math.max(pgrData.bestWinStreak || 0, streak),
            lastPlayedAt: now,
            updatedAt: now,
          })
        );

        // 3. Update seasonPlayerGameRatings Document (Seasonal game rating)
        const sNewGamesPlayed = (spgrData.gamesPlayed || 0) + addGames;
        transaction.set(
          spgrRef,
          sanitizeFirestoreData({
            ...spgrData,
            rating: sMmrRes.ratingAfter,
            eloRating: sMmrRes.ratingAfter,
            isProvisional: sNewGamesPlayed < PLACEMENT_GAMES_REQUIRED,
            placementGames: Math.min(PLACEMENT_GAMES_REQUIRED, sNewGamesPlayed),
            gamesPlayed: sNewGamesPlayed,
            wins: (spgrData.wins || 0) + addWins,
            losses: (spgrData.losses || 0) + addLosses,
            draws: (spgrData.draws || 0) + addDraws,
            winStreak: streak,
            currentWinStreak: streak,
            bestWinStreak: Math.max(spgrData.bestWinStreak || 0, streak),
            lastPlayedAt: now,
            updatedAt: now,
          })
        );

        // 4. Update seasonPlayerOverall Document (Composite seasonal stats)
        transaction.set(
          spoRef,
          sanitizeFirestoreData({
            ...spoData,
            overallRating: Math.max(100, Math.round(spoData.overallRating + sMmrRes.change)),
            gamesPlayed: (spoData.gamesPlayed || 0) + addGames,
            wins: (spoData.wins || 0) + addWins,
            losses: (spoData.losses || 0) + addLosses,
            draws: (spoData.draws || 0) + addDraws,
            currentWinStreak: streak,
            bestWinStreak: Math.max(spoData.bestWinStreak || 0, streak),
            updatedAt: now,
          })
        );

        // 5. Immutable Coin Transaction Ledger
        if (coinAward > 0) {
          const txId = `tx_manual_${matchId}_${uid}`;
          const txRef = doc(db, 'coinTransactions', txId);
          transaction.set(txRef, {
            id: txId,
            transactionId: txId,
            playerUid: uid,
            playerId: uid,
            gamerTag: pData.gamerTag || 'Player',
            amount: coinAward,
            type: isPlayerWinner ? 'MATCH_WIN' : 'MATCH_PLAY',
            reason: `Official Manual Result: ${canonicalGameName} (+${coinAward} NC)`,
            balanceBefore: Number(pData.nexusCoins || 0),
            balanceAfter: updatedCoins,
            actor: operatorUid,
            actorType: opAuth.role,
            actorGamerTag: opAuth.gamerTag,
            status: 'COMPLETED',
            matchId,
            gameId: cleanGameId,
            createdAt: now,
          });

          committedPlayerSnaps.push({ uid, amount: coinAward, isWinner: isPlayerWinner });
        }

        // 6. Immutable Rating Transaction Ledger
        const ratingTxId = `tx_manual_mmr_${matchId}_${uid}`;
        const ratingTxRef = doc(db, 'ratingTransactions', ratingTxId);
        transaction.set(ratingTxRef, {
          id: ratingTxId,
          matchId,
          gameId: cleanGameId,
          gameName: canonicalGameName,
          playerId: uid,
          gamerTag: pData.gamerTag || 'Player',
          ratingBefore: mmrRes.ratingBefore,
          oldMMR: mmrRes.ratingBefore,
          ratingAfter: mmrRes.ratingAfter,
          newMMR: mmrRes.ratingAfter,
          change: mmrRes.change,
          ratingChange: mmrRes.change,
          result: isPlayerWinner ? 'WIN' : isPlayerDraw ? 'DRAW' : 'LOSS',
          seasonId: activeSeason.id,
          seasonNumber: activeSeason.number,
          actor: operatorUid,
          actorRole: opAuth.role,
          createdAt: now,
        });
      }

      // 6b. Update /teams documents for 5v5 matches
      if (params.matchFormat === '5v5' && calculatedTeamMmrRes && teamADocRef && teamBDocRef) {
        const isTeamAWinner = params.outcome === 'teamA';
        const isTeamBWinner = params.outcome === 'teamB';
        const isDraw = params.outcome === 'draw';

        // Team A
        const tAData = teamASnap?.exists() ? teamASnap.data() : null;
        const currentAGames = Number(tAData?.matchesPlayed || 0);
        const currentAWins = Number(tAData?.wins || 0);
        const currentALosses = Number(tAData?.losses || 0);
        const currentADraws = Number(tAData?.draws || 0);
        const newAGames = currentAGames + 1;
        const newAWins = currentAWins + (isTeamAWinner ? 1 : 0);
        const newALosses = currentALosses + (!isTeamAWinner && !isDraw ? 1 : 0);
        const newADraws = currentADraws + (isDraw ? 1 : 0);
        const newAStreak = isTeamAWinner ? (Number(tAData?.currentWinStreak || 0) + 1) : 0;
        const newABestStreak = Math.max(Number(tAData?.bestWinStreak || 0), newAStreak);

        transaction.set(
          teamADocRef,
          sanitizeFirestoreData({
            id: teamAId,
            teamId: teamAId,
            teamName: resolvedTeamAName,
            teamTag: resolvedTeamATag,
            teamLogo: tAData?.teamLogo || '🛡️',
            gameId: cleanGameId,
            captainId: tAData?.captainId || params.teamAPlayers?.[0]?.uid || '',
            captainName: tAData?.captainName || params.teamAPlayers?.[0]?.gamerTag || 'Captain',
            members: params.teamAPlayers?.map((p) => ({ uid: p.uid, gamerTag: p.gamerTag, fullName: p.fullName || p.gamerTag })) || [],
            memberIds: params.teamAPlayers?.map((p) => p.uid) || [],
            teamRating: calculatedTeamMmrRes.teamARatingAfter,
            matchesPlayed: newAGames,
            wins: newAWins,
            losses: newALosses,
            draws: newADraws,
            currentWinStreak: newAStreak,
            bestWinStreak: newABestStreak,
            winRate: Math.round((newAWins / Math.max(1, newAGames)) * 100),
            status: 'active',
            updatedAt: now,
            createdAt: tAData?.createdAt || now,
          }),
          { merge: true }
        );

        // Team B
        const tBData = teamBSnap?.exists() ? teamBSnap.data() : null;
        const currentBGames = Number(tBData?.matchesPlayed || 0);
        const currentBWins = Number(tBData?.wins || 0);
        const currentBLosses = Number(tBData?.losses || 0);
        const currentBDraws = Number(tBData?.draws || 0);
        const newBGames = currentBGames + 1;
        const newBWins = currentBWins + (isTeamBWinner ? 1 : 0);
        const newBLosses = currentBLosses + (!isTeamBWinner && !isDraw ? 1 : 0);
        const newBDraws = currentBDraws + (isDraw ? 1 : 0);
        const newBStreak = isTeamBWinner ? (Number(tBData?.currentWinStreak || 0) + 1) : 0;
        const newBBestStreak = Math.max(Number(tBData?.bestWinStreak || 0), newBStreak);

        transaction.set(
          teamBDocRef,
          sanitizeFirestoreData({
            id: teamBId,
            teamId: teamBId,
            teamName: resolvedTeamBName,
            teamTag: resolvedTeamBTag,
            teamLogo: tBData?.teamLogo || '⚔️',
            gameId: cleanGameId,
            captainId: tBData?.captainId || params.teamBPlayers?.[0]?.uid || '',
            captainName: tBData?.captainName || params.teamBPlayers?.[0]?.gamerTag || 'Captain',
            members: params.teamBPlayers?.map((p) => ({ uid: p.uid, gamerTag: p.gamerTag, fullName: p.fullName || p.gamerTag })) || [],
            memberIds: params.teamBPlayers?.map((p) => p.uid) || [],
            teamRating: calculatedTeamMmrRes.teamBRatingAfter,
            matchesPlayed: newBGames,
            wins: newBWins,
            losses: newBLosses,
            draws: newBDraws,
            currentWinStreak: newBStreak,
            bestWinStreak: newBBestStreak,
            winRate: Math.round((newBWins / Math.max(1, newBGames)) * 100),
            status: 'active',
            updatedAt: now,
            createdAt: tBData?.createdAt || now,
          }),
          { merge: true }
        );
      }

      // 7. Commit Permanent Match History Document
      const p1MMRInfo = playerMMRResults.get(rawP1Id);
      const p2MMRInfo = playerMMRResults.get(rawP2Id);

      const teamASnapshotPlayers = params.teamAPlayers?.map((p) => ({
        uid: p.uid,
        gamerTag: p.gamerTag,
        fullName: p.fullName || p.gamerTag,
      }));
      const teamBSnapshotPlayers = params.teamBPlayers?.map((p) => ({
        uid: p.uid,
        gamerTag: p.gamerTag,
        fullName: p.fullName || p.gamerTag,
      }));

      finalMatchHistoryRecord = {
        matchId,
        game: canonicalGameName,
        gameMode: params.matchFormat === '5v5' ? '5v5' : '1v1',
        player1Id: rawP1Id,
        player1GamerTag: authoritativeP1GamerTag,
        player2Id: rawP2Id,
        player2GamerTag: authoritativeP2GamerTag,
        winnerId,
        winnerGamerTag,
        loserId,
        loserGamerTag,
        player1Wins: p1Wins,
        player1Losses: p1Losses,
        player2Wins: p2Wins,
        player2Losses: p2Losses,
        winnerNCReward,
        loserNCReward,
        player1NCReward: p1NCReward,
        player2NCReward: p2NCReward,
        validatedBy: operatorUid,
        validatedByRole,
        validatedAt: now,
        createdAt: now,
        status: 'VALIDATED',

        // Detail metadata & MMR
        player1FullName: authoritativeP1FullName,
        player2FullName: authoritativeP2FullName,
        validatedByName: opAuth.gamerTag || 'Staff',
        idempotencyKey,
        totalGames: p1Wins + p1Losses,
        gameCount: params.gameCount || 1,
        notes: params.notes || '',
        officialHours: params.officialHours,
        team1PlayerIds: params.teamAPlayers?.map((p) => p.uid),
        team2PlayerIds: params.teamBPlayers?.map((p) => p.uid),
        player1PreviousMMR: p1MMRInfo?.ratingBefore,
        player1NewMMR: p1MMRInfo?.ratingAfter,
        player1MMRChange: p1MMRInfo?.change,
        player2PreviousMMR: p2MMRInfo?.ratingBefore,
        player2NewMMR: p2MMRInfo?.ratingAfter,
        player2MMRChange: p2MMRInfo?.change,
        seasonId: activeSeason.id,
        seasonNumber: activeSeason.number,

        // 5v5 Team Snapshots
        is5v5: params.matchFormat === '5v5',
        teamAId: params.matchFormat === '5v5' ? teamAId : undefined,
        teamAName: params.matchFormat === '5v5' ? resolvedTeamAName : undefined,
        teamATag: params.matchFormat === '5v5' ? resolvedTeamATag : undefined,
        teamAPlayerIds: params.teamAPlayers?.map((p) => p.uid),
        teamAPlayerGamerTags: params.teamAPlayers?.map((p) => p.gamerTag),
        teamAPlayers: teamASnapshotPlayers,

        teamBId: params.matchFormat === '5v5' ? teamBId : undefined,
        teamBName: params.matchFormat === '5v5' ? resolvedTeamBName : undefined,
        teamBTag: params.matchFormat === '5v5' ? resolvedTeamBTag : undefined,
        teamBPlayerIds: params.teamBPlayers?.map((p) => p.uid),
        teamBPlayerGamerTags: params.teamBPlayers?.map((p) => p.gamerTag),
        teamBPlayers: teamBSnapshotPlayers,

        winnerTeamId: params.matchFormat === '5v5' ? (params.outcome === 'teamA' ? teamAId : params.outcome === 'teamB' ? teamBId : 'DRAW') : undefined,
        winnerTeamName: params.matchFormat === '5v5' ? (params.outcome === 'teamA' ? resolvedTeamAName : params.outcome === 'teamB' ? resolvedTeamBName : 'DRAW') : undefined,
        winnerTeamTag: params.matchFormat === '5v5' ? (params.outcome === 'teamA' ? resolvedTeamATag : params.outcome === 'teamB' ? resolvedTeamBTag : 'DRAW') : undefined,
        loserTeamId: params.matchFormat === '5v5' ? (params.outcome === 'teamA' ? teamBId : params.outcome === 'teamB' ? teamAId : 'DRAW') : undefined,
        loserTeamName: params.matchFormat === '5v5' ? (params.outcome === 'teamA' ? resolvedTeamBName : params.outcome === 'teamB' ? resolvedTeamAName : 'DRAW') : undefined,
        loserTeamTag: params.matchFormat === '5v5' ? (params.outcome === 'teamA' ? resolvedTeamBTag : params.outcome === 'teamB' ? resolvedTeamATag : 'DRAW') : undefined,
        teamOutcome: params.matchFormat === '5v5' ? (params.outcome as 'teamA' | 'teamB' | 'draw') : undefined,

        teamARatingBefore: calculatedTeamMmrRes?.teamARatingBefore,
        teamARatingAfter: calculatedTeamMmrRes?.teamARatingAfter,
        teamAMMRChange: calculatedTeamMmrRes?.teamAChange,
        teamBRatingBefore: calculatedTeamMmrRes?.teamBRatingBefore,
        teamBRatingAfter: calculatedTeamMmrRes?.teamBRatingAfter,
        teamBMMRChange: calculatedTeamMmrRes?.teamBChange,

        // Authoritative NC Rewards
        teamARewardPerPlayer: params.matchFormat === '5v5'
          ? (params.outcome === 'teamA' ? calc.rewardPerWinner : params.outcome === 'teamB' ? calc.rewardPerLoser : calc.rewardPerWinner)
          : undefined,
        teamBRewardPerPlayer: params.matchFormat === '5v5'
          ? (params.outcome === 'teamB' ? calc.rewardPerWinner : params.outcome === 'teamA' ? calc.rewardPerLoser : calc.rewardPerWinner)
          : undefined,
        rewardPerWinner: calc.rewardPerWinner,
        rewardPerLoser: calc.rewardPerLoser,
        totalRewardAwarded: calc.totalRewardAwarded,
        rewardBreakdown: calc.rewardBreakdown,
        isDraw: calc.isDraw,
      };
      transaction.set(matchHistoryDocRef, sanitizeFirestoreData(finalMatchHistoryRecord));

      // 8. Commit Authoritative Audit Log with All Required Fields (Section 11)
      const p1PrevNC = Number(playerDataMap.get(rawP1Id)?.nexusCoins || 0);
      const p2PrevNC = Number(playerDataMap.get(rawP2Id)?.nexusCoins || 0);
      const isPlayerAWinner = winnerId === rawP1Id;

      transaction.set(
        auditLogRef,
        sanitizeFirestoreData({
          id: `audit_val_${matchId}`,
          action: 'MATCH_RESULT_VALIDATED',
          actorId: operatorUid,
          actorName: opAuth.gamerTag || 'Staff',
          actorRole: opAuth.role,
          targetType: 'match',
          targetId: matchId,
          matchId,
          game: canonicalGameName,
          gameId: cleanGameId,
          winnerId,
          winnerGamerTag,
          loserId,
          loserGamerTag,
          previousWinnerMMR: isPlayerAWinner ? (p1MMRInfo?.ratingBefore ?? INITIAL_RATING) : (p2MMRInfo?.ratingBefore ?? INITIAL_RATING),
          newWinnerMMR: isPlayerAWinner ? (p1MMRInfo?.ratingAfter ?? INITIAL_RATING) : (p2MMRInfo?.ratingAfter ?? INITIAL_RATING),
          previousLoserMMR: isPlayerAWinner ? (p2MMRInfo?.ratingBefore ?? INITIAL_RATING) : (p1MMRInfo?.ratingBefore ?? INITIAL_RATING),
          newLoserMMR: isPlayerAWinner ? (p2MMRInfo?.ratingAfter ?? INITIAL_RATING) : (p1MMRInfo?.ratingAfter ?? INITIAL_RATING),
          rewardAmount: calc.totalRewardAwarded,
          previousWinnerNC: isPlayerAWinner ? p1PrevNC : p2PrevNC,
          newWinnerNC: isPlayerAWinner ? (p1PrevNC + winnerNCReward) : (p2PrevNC + winnerNCReward),
          timestamp: now,
          seasonId: activeSeason.id,
          seasonNumber: activeSeason.number,
          ...(cleanGameId.startsWith('fc')
            ? {
                winnerMatches: isPlayerAWinner ? p1Wins : p2Wins,
                loserMatches: isPlayerAWinner ? p1Losses : p2Losses,
                totalMatches: p1Wins + p1Losses,
                calculatedReward: calc.totalRewardAwarded,
              }
            : {}),
          details: `Validated ${canonicalGameName} result: ${authoritativeP1GamerTag} vs ${authoritativeP2GamerTag}. Winner: ${winnerGamerTag}. Awarded ${winnerNCReward} NC to winner, ${loserNCReward} NC to loser.`,
        })
      );

      // 9. Commit to officialMatchResults & matches
      finalResultData = {
        id: matchId,
        resultId: matchId,
        gameId: cleanGameId,
        gameName: canonicalGameName,
        matchFormat: params.matchFormat,
        playerAId: rawP1Id,
        playerAGamerTag: authoritativeP1GamerTag,
        playerBId: rawP2Id,
        playerBGamerTag: authoritativeP2GamerTag,
        playerAWins: p1Wins,
        playerALosses: p1Losses,
        playerBWins: p2Wins,
        playerBLosses: p2Losses,
        outcome: params.outcome,
        winnerId,
        winnerGamerTag,

        // 5v5 Team Snapshots
        is5v5: params.matchFormat === '5v5',
        teamAId: params.matchFormat === '5v5' ? teamAId : undefined,
        teamAName: params.matchFormat === '5v5' ? resolvedTeamAName : undefined,
        teamATag: params.matchFormat === '5v5' ? resolvedTeamATag : undefined,
        teamAPlayerIds: params.teamAPlayers?.map((p) => p.uid),
        teamAPlayerGamerTags: params.teamAPlayers?.map((p) => p.gamerTag),
        teamAPlayers: teamASnapshotPlayers,

        teamBId: params.matchFormat === '5v5' ? teamBId : undefined,
        teamBName: params.matchFormat === '5v5' ? resolvedTeamBName : undefined,
        teamBTag: params.matchFormat === '5v5' ? resolvedTeamBTag : undefined,
        teamBPlayerIds: params.teamBPlayers?.map((p) => p.uid),
        teamBPlayerGamerTags: params.teamBPlayers?.map((p) => p.gamerTag),
        teamBPlayers: teamBSnapshotPlayers,

        winnerTeamId: params.matchFormat === '5v5' ? (params.outcome === 'teamA' ? teamAId : params.outcome === 'teamB' ? teamBId : 'DRAW') : undefined,
        winnerTeamName: params.matchFormat === '5v5' ? (params.outcome === 'teamA' ? resolvedTeamAName : params.outcome === 'teamB' ? resolvedTeamBName : 'DRAW') : undefined,
        winnerTeamTag: params.matchFormat === '5v5' ? (params.outcome === 'teamA' ? resolvedTeamATag : params.outcome === 'teamB' ? resolvedTeamBTag : 'DRAW') : undefined,
        loserTeamId: params.matchFormat === '5v5' ? (params.outcome === 'teamA' ? teamBId : params.outcome === 'teamB' ? teamAId : 'DRAW') : undefined,
        loserTeamName: params.matchFormat === '5v5' ? (params.outcome === 'teamA' ? resolvedTeamBName : params.outcome === 'teamB' ? resolvedTeamAName : 'DRAW') : undefined,
        loserTeamTag: params.matchFormat === '5v5' ? (params.outcome === 'teamA' ? resolvedTeamBTag : params.outcome === 'teamB' ? resolvedTeamATag : 'DRAW') : undefined,
        teamOutcome: params.matchFormat === '5v5' ? (params.outcome as 'teamA' | 'teamB' | 'draw') : undefined,

        teamARatingBefore: calculatedTeamMmrRes?.teamARatingBefore,
        teamARatingAfter: calculatedTeamMmrRes?.teamARatingAfter,
        teamAMMRChange: calculatedTeamMmrRes?.teamAChange,
        teamBRatingBefore: calculatedTeamMmrRes?.teamBRatingBefore,
        teamBRatingAfter: calculatedTeamMmrRes?.teamBRatingAfter,
        teamBMMRChange: calculatedTeamMmrRes?.teamBChange,

        winningTeam: params.outcome === 'teamA' || params.outcome === 'teamB' || params.outcome === 'draw' ? params.outcome : undefined,
        winnerIds: calc.winnerUids,
        loserIds: calc.loserUids,
        rewardPerWinner: calc.rewardPerWinner,
        rewardPerLoser: calc.rewardPerLoser,
        officialHours: calc.officialHours,
        totalRewardAwarded: calc.totalRewardAwarded,
        rewardBreakdown: calc.rewardBreakdown,
        isDraw: calc.isDraw,
        recordedBy: operatorUid,
        recordedByName: opAuth.gamerTag || 'Staff',
        recordedByRole: opAuth.role!,
        createdAt: now,
        idempotencyKey,
        status: 'OFFICIAL',
        notes: params.notes || '',
        playerAPreviousMMR: p1MMRInfo?.ratingBefore,
        playerANewMMR: p1MMRInfo?.ratingAfter,
        playerAMMRChange: p1MMRInfo?.change,
        playerBPreviousMMR: p2MMRInfo?.ratingBefore,
        playerBNewMMR: p2MMRInfo?.ratingAfter,
        playerBMMRChange: p2MMRInfo?.change,
        seasonId: activeSeason.id,
        seasonNumber: activeSeason.number,
      };
      transaction.set(resultDocRef, sanitizeFirestoreData(finalResultData));

      transaction.set(
        matchDocRef,
        sanitizeFirestoreData({
          id: matchId,
          gameId: cleanGameId,
          gameName: canonicalGameName,
          matchFormat: params.matchFormat,
          playerAId: rawP1Id,
          playerAGamerTag: authoritativeP1GamerTag,
          playerBId: rawP2Id,
          playerBGamerTag: authoritativeP2GamerTag,
          playerAScore: p1Wins,
          playerBScore: p2Wins,
          winnerId: winnerId || (params.outcome === 'draw' ? 'DRAW' : null),
          winnerGamerTag: winnerGamerTag || (params.outcome === 'draw' ? 'DRAW' : null),
          outcome: params.outcome,
          status: 'CONFIRMED',
          resultType: 'ADMIN_DECISION',
          adminResolved: true,
          resolvedBy: operatorUid,
          resolvedByName: opAuth.gamerTag,
          resolvedAt: now,
          rewardProcessed: true,
          ncRewardProcessed: true,
          rewardAmount: calc.rewardPerWinner,
          coinsAwardedPlayerUids: calc.winnerUids,
          teamAPlayerIds: params.teamAPlayers?.map((p) => p.uid) || [],
          teamBPlayerIds: params.teamBPlayers?.map((p) => p.uid) || [],
          createdAt: now,
          confirmedAt: now,
          updatedAt: now,
        })
      );
    });

    // 13. Send in-app notifications
    for (const p of committedPlayerSnaps) {
      sendNotification({
        userId: p.uid,
        type: 'MATCH_RESULT',
        title: p.isWinner ? 'Match Victory! 🏆' : 'Match Reward! 🎮',
        message: `Your match in ${canonicalGameName} was validated by staff. You earned +${p.amount} NC!`,
        matchId,
      }).catch(() => {});
    }

    return {
      success: true,
      resultId: matchId,
      officialResult: finalResultData!,
      matchHistory: finalMatchHistoryRecord!,
    };
  } catch (err: any) {
    console.error('Error recording manual match result:', err);
    return {
      success: false,
      error: err.message || 'Failed to record official match result.',
    };
  }
}

/**
 * Result Correction Workflow:
 * Restricted strictly to ADMIN or SUPER_ADMIN.
 * Reverses previous rewards, awards corrected winner, records immutable audit.
 */
export async function correctManualMatchResult(params: {
  originalResultId: string;
  adminUid: string;
  correctionReason: string;
  newOutcome: 'playerA' | 'playerB' | 'draw' | 'teamA' | 'teamB';
  newPlayerAWins?: number;
  newPlayerALosses?: number;
  newPlayerBWins?: number;
  newPlayerBLosses?: number;
}): Promise<{ success: boolean; error?: string }> {
  const { originalResultId, adminUid, correctionReason, newOutcome } = params;

  // 1. Role verification: ONLY ADMIN or SUPER_ADMIN (STAFF DENIED)
  const authCheck = await verifyOperatorRole(adminUid);
  if (!authCheck.authorized || (authCheck.role !== 'ADMIN' && authCheck.role !== 'SUPER_ADMIN')) {
    return {
      success: false,
      error: 'PERMISSION_DENIED: Only Administrators and Super Administrators can correct official match results.',
    };
  }

  if (!correctionReason || !correctionReason.trim()) {
    return {
      success: false,
      error: 'A detailed correction reason is required for auditing purposes.',
    };
  }

  const resultDocRef = doc(db, 'officialMatchResults', originalResultId);
  const snap = await getDoc(resultDocRef);
  if (!snap.exists()) {
    return { success: false, error: 'Original result record not found.' };
  }

  const oldResult = snap.data() as OfficialMatchResult;
  if (oldResult.status === 'CORRECTED') {
    return { success: false, error: 'This result has already been corrected.' };
  }

  // Calculate new reward
  const calcNew = calculateAuthoritativeMatchReward({
    gameId: oldResult.gameId,
    outcome: newOutcome,
    playerAWins: params.newPlayerAWins,
    playerALosses: params.newPlayerALosses,
    playerBWins: params.newPlayerBWins,
    playerBLosses: params.newPlayerBLosses,
    playerAId: oldResult.playerAId,
    playerBId: oldResult.playerBId,
    teamAPlayerIds: oldResult.teamAPlayerIds,
    teamBPlayerIds: oldResult.teamBPlayerIds,
  });

  if (!calcNew.valid) {
    return { success: false, error: calcNew.error || 'Invalid corrected outcome.' };
  }

  const now = Date.now();

  try {
    await runTransaction(db, async (transaction) => {
      // 1. Reverse previous rewards (both winners and losers if any)
      const oldWinnerIds = oldResult.winnerIds || (oldResult.winnerId ? [oldResult.winnerId] : []);
      const oldLoserIds = oldResult.loserIds || [];
      const oldReversals: { uid: string; amount: number }[] = [];

      for (const oldUid of oldWinnerIds) {
        if (oldResult.rewardPerWinner && oldResult.rewardPerWinner > 0) {
          oldReversals.push({ uid: oldUid, amount: oldResult.rewardPerWinner });
        }
      }
      for (const oldUid of oldLoserIds) {
        if (oldResult.rewardPerLoser && oldResult.rewardPerLoser > 0) {
          oldReversals.push({ uid: oldUid, amount: oldResult.rewardPerLoser });
        }
      }

      for (const rev of oldReversals) {
        const pRef = doc(db, 'players', rev.uid);
        const pSnap = await transaction.get(pRef);
        if (pSnap.exists()) {
          const currentBal = Number(pSnap.data().nexusCoins || 0);
          const revAmount = rev.amount;
          const newBal = Math.max(0, currentBal - revAmount);
          transaction.update(pRef, {
            nexusCoins: newBal,
            totalCoinsEarned: Math.max(0, (pSnap.data().totalCoinsEarned || 0) - revAmount),
            updatedAt: now,
          });

          // Ledger entry for reversal
          const revTxId = `tx_reversal_${originalResultId}_${rev.uid}_${now}`;
          const revTxRef = doc(db, 'coinTransactions', revTxId);
          transaction.set(revTxRef, {
            id: revTxId,
            transactionId: revTxId,
            playerUid: rev.uid,
            playerId: rev.uid,
            gamerTag: pSnap.data().gamerTag || 'Player',
            amount: -revAmount,
            type: 'ADJUSTMENT_DEBIT',
            reason: `Result Correction Reversal: ${correctionReason}`,
            balanceBefore: currentBal,
            balanceAfter: newBal,
            actor: adminUid,
            actorType: authCheck.role,
            actorGamerTag: authCheck.gamerTag,
            status: 'COMPLETED',
            matchId: originalResultId,
            createdAt: now,
          });
        }
      }

      // 2. Apply new rewards to corrected participants
      const newAssignments: { uid: string; amount: number; isWinner: boolean; reason: string }[] = [];
      if (calcNew.playerRewards && calcNew.playerRewards.length > 0) {
        for (const pr of calcNew.playerRewards) {
          if (pr.amount > 0) {
            newAssignments.push({
              uid: pr.uid,
              amount: pr.amount,
              isWinner: pr.isWinner,
              reason: pr.reason,
            });
          }
        }
      } else {
        for (const newUid of calcNew.winnerUids) {
          if (calcNew.rewardPerWinner > 0) {
            newAssignments.push({
              uid: newUid,
              amount: calcNew.rewardPerWinner,
              isWinner: true,
              reason: `Corrected Match Victory: ${oldResult.gameName} (${calcNew.rewardBreakdown})`,
            });
          }
        }
      }

      for (const assignment of newAssignments) {
        const pRef = doc(db, 'players', assignment.uid);
        const pSnap = await transaction.get(pRef);
        if (pSnap.exists()) {
          const currentBal = Number(pSnap.data().nexusCoins || 0);
          const rewardAmount = assignment.amount;
          const newBal = currentBal + rewardAmount;
          transaction.update(pRef, {
            nexusCoins: newBal,
            totalCoinsEarned: (pSnap.data().totalCoinsEarned || 0) + rewardAmount,
            updatedAt: now,
          });

          const txId = `tx_correction_${originalResultId}_${assignment.uid}_${now}`;
          const txRef = doc(db, 'coinTransactions', txId);
          transaction.set(txRef, {
            id: txId,
            transactionId: txId,
            playerUid: assignment.uid,
            playerId: assignment.uid,
            gamerTag: pSnap.data().gamerTag || 'Player',
            amount: rewardAmount,
            type: assignment.isWinner ? 'MATCH_WIN' : 'MATCH_PLAY',
            reason: assignment.reason,
            balanceBefore: currentBal,
            balanceAfter: newBal,
            actor: adminUid,
            actorType: authCheck.role,
            actorGamerTag: authCheck.gamerTag,
            status: 'COMPLETED',
            matchId: originalResultId,
            createdAt: now,
          });
        }
      }

      // 3. Update original official match result
      transaction.update(resultDocRef, {
        status: 'CORRECTED',
        isCorrected: true,
        correctedAt: now,
        correctedBy: adminUid,
        correctedByName: authCheck.gamerTag,
        correctionReason,
        outcome: newOutcome,
        winnerIds: calcNew.winnerUids,
        loserIds: calcNew.loserUids,
        rewardPerWinner: calcNew.rewardPerWinner,
        rewardPerLoser: calcNew.rewardPerLoser,
        totalRewardAwarded: calcNew.totalRewardAwarded,
        rewardBreakdown: calcNew.rewardBreakdown,
        isDraw: calcNew.isDraw,
        playerAWins: params.newPlayerAWins ?? oldResult.playerAWins,
        playerALosses: params.newPlayerALosses ?? oldResult.playerALosses,
        playerBWins: params.newPlayerBWins ?? oldResult.playerBWins,
        playerBLosses: params.newPlayerBLosses ?? oldResult.playerBLosses,
      });
    });

    // 4. Log Privileged Audit
    const authCtx: TrustedAuthContext = {
      uid: adminUid,
      email: authCheck.email || '',
      role: authCheck.role!,
      gamerTag: authCheck.gamerTag,
    };

    await TrustedAuditPipeline.createPrivilegedAuditEvent(authCtx, {
      action: 'MATCH_RESULT_OVERRIDDEN',
      targetType: 'match',
      targetId: originalResultId,
      matchId: originalResultId,
      gameId: oldResult.gameId,
      rewardAmount: calcNew.totalRewardAwarded,
      details: `Official result corrected by ${authCheck.role} ${authCheck.gamerTag}: ${correctionReason}. New outcome: ${calcNew.overallWinnerSummary}.`,
    }).catch(console.error);

    return { success: true };
  } catch (err: any) {
    console.error('Error correcting manual match result:', err);
    return { success: false, error: err.message || 'Failed to correct match result.' };
  }
}

/**
 * Real-time listener for official match results
 */
export function subscribeToOfficialMatchResults(
  callback: (results: OfficialMatchResult[]) => void,
  limitCount: number = 50
): () => void {
  let fallbackUnsub: (() => void) | null = null;

  const q = query(
    collection(db, 'officialMatchResults'),
    orderBy('createdAt', 'desc'),
    limit(limitCount)
  );

  const mainUnsub = onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({ ...d.data(), id: d.id } as OfficialMatchResult));
      callback(list);
    },
    (err: any) => {
      console.warn('subscribeToOfficialMatchResults warning:', err);
      const isIndexError = err?.code === 'failed-precondition' || err?.message?.toLowerCase().includes('index');
      if (isIndexError) {
        fallbackUnsub = onSnapshot(
          collection(db, 'officialMatchResults'),
          (fSnap) => {
            const list = fSnap.docs.map((d) => ({ ...d.data(), id: d.id } as OfficialMatchResult));
            list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            callback(list.slice(0, limitCount));
          },
          (fbErr) => {
            console.warn('subscribeToOfficialMatchResults fallback error:', fbErr);
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
