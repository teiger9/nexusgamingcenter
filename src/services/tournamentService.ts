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
  onSnapshot,
  writeBatch,
  runTransaction,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
  Tournament,
  TournamentMatch,
  TournamentParticipant,
  TournamentStatus,
  TournamentFormat,
  TournamentType,
  TournamentAchievement,
  TournamentStanding,
  GameCategory,
  Player,
  Team,
  TeamInvitation,
  TeamTournamentRegistration,
  TeamTournamentPlayerSlot,
  TeamRegistrationStatus,
  TournamentActivityLog,
  TournamentPrizeBreakdown,
  TournamentQualificationEvent,
  AppNotification,
} from '../types';
import { sanitizeFirestoreData } from './matchService';
import { calculateMatchRatings } from '../lib/elo';
import { sendNotification, sendBulkNotification } from './notificationService';
import { validatePhoneNumber } from '../lib/tournamentGameConfig';
import {
  calculateInvitationExpiresAt,
  isInvitationExpired,
  INVITATION_EXPIRATION_MS,
} from '../utils/invitationExpiration';
import {
  countCompletedDistinctPlayers,
  isPlayerSlotComplete,
  isPlayerInformationComplete,
  isPlayerInvitationAccepted,
  normalizeInvitationStatus,
} from '../utils/tournamentTeamStatus';

/**
 * Helper to compute standard esports seeding order for any power of two bracket.
 * e.g. 2 -> [1, 2]
 * 4 -> [1, 4, 2, 3] (Pairs: 1 vs 4, 2 vs 3)
 * 8 -> [1, 8, 4, 5, 2, 7, 3, 6] (Pairs: 1 vs 8, 4 vs 5, 2 vs 7, 3 vs 6)
 * 16 -> [1, 16, 8, 9, 4, 13, 5, 12, 2, 15, 7, 10, 3, 14, 6, 11]
 */
export function getStandardBracketSeeding(powerOfTwo: number): number[] {
  let seeds = [1, 2];
  while (seeds.length < powerOfTwo) {
    const nextSeeds: number[] = [];
    const sum = seeds.length * 2 + 1;
    for (const seed of seeds) {
      nextSeeds.push(seed);
      nextSeeds.push(sum - seed);
    }
    seeds = nextSeeds;
  }
  return seeds;
}

/**
 * Detect officially confirmed and approved team participants for a tournament.
 * Follows the strict rule:
 * ONLY count teams that are officially eligible to participate according to the existing tournament approval system:
 * - Either in tournament.participants (where type === 'TEAM' or teamMembers exist, and not WITHDRAWN/DISQUALIFIED)
 * - Or in teamRegistrations with status === 'CONFIRMED'
 * - Filter out: FORMING teams, incomplete teams, pending teams, rejected teams, cancelled teams, withdrawn teams, removed teams, duplicate registrations.
 * - Deduplicate by team ID and normalized team name.
 */
export function getEligibleConfirmedTournamentTeams(
  tournament?: Tournament | null,
  teamRegistrations: TeamTournamentRegistration[] = []
): TournamentParticipant[] {
  if (!tournament) return [];
  const safeRegistrations = Array.isArray(teamRegistrations) ? teamRegistrations : [];
  const confirmedMap = new Map<string, TournamentParticipant>();

  // Helper to check if a status implies dropped/inactive
  const isDroppedStatus = (status?: string) => {
    if (!status) return false;
    const s = status.toUpperCase().trim();
    return s === 'WITHDRAWN' || s === 'DISQUALIFIED' || s === 'CANCELLED' || s === 'REJECTED' || s === 'REMOVED';
  };

  // 1. Check tournament.participants (teams on the tournament roster)
  if (tournament.participants && tournament.participants.length > 0) {
    for (const p of tournament.participants) {
      if (!isDroppedStatus(p.status)) {
        if (p.id && p.name) {
          const key = p.id.trim();
          confirmedMap.set(key, { ...p });
        }
      }
    }
  }

  // 2. Check teamRegistrations for any confirmed or submitted teams
  for (const reg of safeRegistrations) {
    if (!reg) continue;
    if (!isDroppedStatus(reg.status)) {
      const regId = ((reg.teamId || reg.id) || '').trim();
      const normalizedName = (reg.teamName || '').toLowerCase().trim();

      // Find if already recorded in map by ID or normalized name
      let matchedKey: string | null = null;
      for (const [key, val] of confirmedMap.entries()) {
        if (key === regId || val.id === regId || (val.name || '').toLowerCase().trim() === normalizedName) {
          matchedKey = key;
          break;
        }
      }

      const existing = matchedKey ? confirmedMap.get(matchedKey) : undefined;
      const teamParticipant: TournamentParticipant = {
        id: existing?.id || regId,
        name: existing?.name || reg.teamName || 'Unknown Team',
        tag: existing?.tag || reg.teamTag,
        type: 'TEAM',
        registeredAt: existing?.registeredAt || reg.createdAt || Date.now(),
        seed: existing?.seed,
        status: 'CONFIRMED',
        avatarUrl: existing?.avatarUrl || reg.teamLogo,
        teamMemberIds: existing?.teamMemberIds || (reg.slots || []).filter((s) => s.playerId).map((s) => s.playerId!),
        teamMembers: existing?.teamMembers || (reg.slots || []).map((s) => ({
          uid: s.playerId || '',
          gamerTag: s.gamerTag || '',
          fullName: s.fullName || '',
          isCaptain: s.isCaptain,
          slotNumber: s.slotNumber,
          playerStatus: s.status,
          inGameName: s.inGameName,
          inGameRank: s.inGameRank,
          phoneNumber: s.phoneNumber,
          informationConfirmed: s.status === 'INFORMATION_COMPLETE' || s.status === 'COMPLETED',
        })),
      };

      if (matchedKey) {
        confirmedMap.set(matchedKey, teamParticipant);
      } else {
        confirmedMap.set(regId, teamParticipant);
      }
    }
  }

  // Deduplicate strictly by unique ID and unique lowercase name
  const uniqueParticipants: TournamentParticipant[] = [];
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();

  for (const p of confirmedMap.values()) {
    const idKey = (p.id || '').trim();
    const nameKey = (p.name || '').trim().toLowerCase();
    if (!idKey || !nameKey) continue;
    if (seenIds.has(idKey) || seenNames.has(nameKey)) continue;

    seenIds.add(idKey);
    seenNames.add(nameKey);
    uniqueParticipants.push({
      ...p,
      status: 'CONFIRMED',
    });
  }

  // Sort by existing seed if available, or preserve registration order
  uniqueParticipants.sort((a, b) => {
    if (a.seed && b.seed) return a.seed - b.seed;
    if (a.seed) return -1;
    if (b.seed) return 1;
    return (a.registeredAt || 0) - (b.registeredAt || 0);
  });

  // Ensure 1-based sequential seeds if not properly assigned
  uniqueParticipants.forEach((p, idx) => {
    p.seed = idx + 1;
  });

  return uniqueParticipants;
}

/**
 * Validates bracket integrity after generation.
 * Ensures every confirmed team appears exactly once in the first round (or receives an explicit BYE),
 * and matches the required topology.
 */
export function validateTournamentBracket(
  matches: TournamentMatch[],
  participants: TournamentParticipant[]
): { valid: boolean; error?: string; stats: { confirmedCount: number; r1MatchCount: number; placedCount: number } } {
  const confirmedCount = participants.length;
  const placedTeamIds = new Set<string>();
  const r1Matches = matches.filter((m) => m.round === 1);

  r1Matches.forEach((m) => {
    if (m.participantA) {
      if (placedTeamIds.has(m.participantA.id)) {
        throw new Error(`Validation Failure: Team "${m.participantA.name}" (ID: ${m.participantA.id}) is placed more than once in Round 1.`);
      }
      placedTeamIds.add(m.participantA.id);
    }
    if (m.participantB) {
      if (placedTeamIds.has(m.participantB.id)) {
        throw new Error(`Validation Failure: Team "${m.participantB.name}" (ID: ${m.participantB.id}) is placed more than once in Round 1.`);
      }
      placedTeamIds.add(m.participantB.id);
    }
  });

  // Count teams that received direct BYEs to Round 2 (e.g. for odd or non-power of 2 counts like 3, 5, 6, 7)
  const r2Matches = matches.filter((m) => m.round === 2 && !m.id.includes('3rd'));
  r2Matches.forEach((m) => {
    if (m.participantA && !r1Matches.some((r1) => r1.nextMatchId === m.id && r1.nextMatchSlot === 'A')) {
      if (placedTeamIds.has(m.participantA.id)) {
        throw new Error(`Validation Failure: Team "${m.participantA.name}" is placed more than once.`);
      }
      placedTeamIds.add(m.participantA.id);
    }
    if (m.participantB && !r1Matches.some((r1) => r1.nextMatchId === m.id && r1.nextMatchSlot === 'B')) {
      if (placedTeamIds.has(m.participantB.id)) {
        throw new Error(`Validation Failure: Team "${m.participantB.name}" is placed more than once.`);
      }
      placedTeamIds.add(m.participantB.id);
    }
  });

  // Special strict rule for 4 teams:
  if (confirmedCount === 4) {
    if (r1Matches.length !== 2) {
      return {
        valid: false,
        error: `Core Rule Violation: Exactly 4 confirmed teams MUST produce 2 first-round matches, but found ${r1Matches.length}.`,
        stats: { confirmedCount, r1MatchCount: r1Matches.length, placedCount: placedTeamIds.size },
      };
    }
    if (placedTeamIds.size !== 4) {
      return {
        valid: false,
        error: `Core Rule Violation: Exactly 4 confirmed teams MUST all be placed once, but only ${placedTeamIds.size} unique teams were placed.`,
        stats: { confirmedCount, r1MatchCount: r1Matches.length, placedCount: placedTeamIds.size },
      };
    }
  } else {
    if (placedTeamIds.size !== confirmedCount) {
      return {
        valid: false,
        error: `Validation Failure: Expected ${confirmedCount} unique teams placed, but placed ${placedTeamIds.size}.`,
        stats: { confirmedCount, r1MatchCount: r1Matches.length, placedCount: placedTeamIds.size },
      };
    }
  }

  return {
    valid: true,
    stats: { confirmedCount, r1MatchCount: r1Matches.length, placedCount: placedTeamIds.size },
  };
}

/**
 * Generates an official Random Tournament Draw.
 * - Randomly shuffles the confirmed teams
 * - For 4 teams: Shuffled [A, C, B, D] -> Match 1 (A vs C), Match 2 (B vs D), Final, 3rd Place Match
 * - Validates that every team is used exactly once
 * - Supports any number of teams dynamically
 */
export function generateRandomTournamentDraw(
  tournamentId: string,
  participants: TournamentParticipant[],
  format: TournamentFormat = 'SINGLE_ELIMINATION',
  randomize: boolean = true
): { matches: TournamentMatch[]; orderedParticipants: TournamentParticipant[] } {
  const count = participants.length;
  if (count < 2) {
    throw new Error(`At least 2 confirmed teams are required for a tournament draw (found ${count}).`);
  }

  // Shuffle teams if randomize is true
  const ordered = [...participants];
  if (randomize) {
    for (let i = ordered.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
    }
  }

  // Re-index seeds 1..N based on draw order
  ordered.forEach((p, idx) => {
    p.seed = idx + 1;
  });

  // =========================================================================
  // CORE CASE: EXACTLY 4 TEAMS -> 2 FIRST-ROUND MATCHES + FINAL + 3RD PLACE
  // =========================================================================
  if (count === 4 && format === 'SINGLE_ELIMINATION') {
    const [teamA, teamC, teamB, teamD] = ordered;

    const finalMatchId = `${tournamentId}_m_2_1`;
    const thirdPlaceMatchId = `${tournamentId}_m_3rd_place`;

    // Match 1: Semifinal 1 (Team A vs Team C)
    const match1: TournamentMatch = {
      id: `${tournamentId}_m_1_1`,
      tournamentId,
      round: 1,
      roundName: 'Semifinal 1',
      matchNumber: 1,
      bracketType: 'MAIN',
      participantA: teamA,
      participantAId: teamA.id,
      participantAName: teamA.name,
      participantB: teamC,
      participantBId: teamC.id,
      participantBName: teamC.name,
      status: 'READY',
      nextMatchId: finalMatchId,
      nextMatchSlot: 'A',
      loserMatchId: thirdPlaceMatchId,
      loserMatchSlot: 'A',
      updatedAt: Date.now(),
    };

    // Match 2: Semifinal 2 (Team B vs Team D)
    const match2: TournamentMatch = {
      id: `${tournamentId}_m_1_2`,
      tournamentId,
      round: 1,
      roundName: 'Semifinal 2',
      matchNumber: 2,
      bracketType: 'MAIN',
      participantA: teamB,
      participantAId: teamB.id,
      participantAName: teamB.name,
      participantB: teamD,
      participantBId: teamD.id,
      participantBName: teamD.name,
      status: 'READY',
      nextMatchId: finalMatchId,
      nextMatchSlot: 'B',
      loserMatchId: thirdPlaceMatchId,
      loserMatchSlot: 'B',
      updatedAt: Date.now(),
    };

    // Match 3: 🏆 Grand Final (Winner SF1 vs Winner SF2)
    const finalMatch: TournamentMatch = {
      id: finalMatchId,
      tournamentId,
      round: 2,
      roundName: 'Final',
      matchNumber: 3,
      bracketType: 'MAIN',
      status: 'SCHEDULED',
      updatedAt: Date.now(),
    };

    // Match 4: 🥉 3rd Place Match (Loser SF1 vs Loser SF2)
    const thirdPlaceMatch: TournamentMatch = {
      id: thirdPlaceMatchId,
      tournamentId,
      round: 2,
      roundName: '3rd Place Match',
      matchNumber: 4,
      bracketType: 'MAIN',
      status: 'SCHEDULED',
      updatedAt: Date.now(),
    };

    const matches = [match1, match2, finalMatch, thirdPlaceMatch];

    // Validate
    const val = validateTournamentBracket(matches, ordered);
    if (!val.valid) {
      throw new Error(val.error || 'Validation failed for 4-team draw.');
    }

    return { matches, orderedParticipants: ordered };
  }

  // =========================================================================
  // CASE: EXACTLY 2 TEAMS -> DIRECT GRAND FINAL
  // =========================================================================
  if (count === 2 && format === 'SINGLE_ELIMINATION') {
    const finalMatch: TournamentMatch = {
      id: `${tournamentId}_m_1_1`,
      tournamentId,
      round: 1,
      roundName: 'Final',
      matchNumber: 1,
      bracketType: 'MAIN',
      participantA: ordered[0],
      participantAId: ordered[0].id,
      participantAName: ordered[0].name,
      participantB: ordered[1],
      participantBId: ordered[1].id,
      participantBName: ordered[1].name,
      status: 'READY',
      updatedAt: Date.now(),
    };

    return { matches: [finalMatch], orderedParticipants: ordered };
  }

  // =========================================================================
  // DYNAMIC KNOCKOUT FOR ANY OTHER COUNT (3, 5, 6, 7, 8, 10, 12, 16...)
  // =========================================================================
  if (format === 'SINGLE_ELIMINATION') {
    const P = Math.pow(2, Math.ceil(Math.log2(Math.max(count, 2))));
    const numRounds = Math.log2(P);
    const seedOrder = getStandardBracketSeeding(P);

    // Map participants by 1-based index (guaranteed 1..count)
    const partMap = new Map<number, TournamentParticipant>();
    ordered.forEach((p, idx) => {
      partMap.set(idx + 1, p);
    });

    const matchesByRound: { [round: number]: TournamentMatch[] } = {};

    // 1. Placeholders for rounds 2 through numRounds
    for (let r = 2; r <= numRounds; r++) {
      matchesByRound[r] = [];
      const countInRound = P / Math.pow(2, r);

      for (let m = 0; m < countInRound; m++) {
        let baseRoundName = 'Round ' + r;
        if (r === numRounds) {
          baseRoundName = 'Final';
        } else if (r === numRounds - 1) {
          baseRoundName = countInRound > 1 ? `Semifinal ${m + 1}` : 'Semifinal';
        } else if (r === numRounds - 2) {
          baseRoundName = countInRound > 1 ? `Quarterfinal ${m + 1}` : 'Quarterfinal';
        } else if (r === numRounds - 3) {
          baseRoundName = `Round of 16 Match ${m + 1}`;
        }

        const match: TournamentMatch = {
          id: `${tournamentId}_m_${r}_${m + 1}`,
          tournamentId,
          round: r,
          roundName: baseRoundName,
          matchNumber: 0,
          bracketType: 'MAIN',
          status: 'SCHEDULED',
          updatedAt: Date.now(),
        };
        matchesByRound[r].push(match);
      }
    }

    // 2. Link rounds 2 -> 3 -> ... -> numRounds
    for (let r = 2; r < numRounds; r++) {
      const currList = matchesByRound[r];
      const nextList = matchesByRound[r + 1];
      for (let i = 0; i < currList.length; i++) {
        const nextIdx = Math.floor(i / 2);
        if (nextList[nextIdx]) {
          currList[i].nextMatchId = nextList[nextIdx].id;
          currList[i].nextMatchSlot = i % 2 === 0 ? 'A' : 'B';
        }
      }
    }

    // 3. Optional 3rd Place Match if >= 4 participants
    let thirdPlaceMatch: TournamentMatch | null = null;
    if (count >= 4) {
      thirdPlaceMatch = {
        id: `${tournamentId}_m_3rd_place`,
        tournamentId,
        round: numRounds,
        roundName: '3rd Place Match',
        matchNumber: 0,
        bracketType: 'MAIN',
        status: 'SCHEDULED',
        updatedAt: Date.now(),
      };

      const semiRound = numRounds === 2 ? 1 : numRounds - 1;
      if (semiRound >= 2) {
        const semiMatches = matchesByRound[semiRound];
        if (semiMatches && semiMatches.length >= 2) {
          semiMatches[0].loserMatchId = thirdPlaceMatch.id;
          semiMatches[0].loserMatchSlot = 'A';
          semiMatches[1].loserMatchId = thirdPlaceMatch.id;
          semiMatches[1].loserMatchSlot = 'B';
        }
      }
    }

    // 4. Build Round 1 matches and place BYEs directly into Round 2
    matchesByRound[1] = [];
    const r2Matches = matchesByRound[2];

    for (let i = 0; i < P / 2; i++) {
      const sA = seedOrder[i * 2];
      const sB = seedOrder[i * 2 + 1];
      const pA = partMap.get(sA);
      const pB = partMap.get(sB);
      const targetR2Match = r2Matches[Math.floor(i / 2)];
      const targetSlot: 'A' | 'B' = i % 2 === 0 ? 'A' : 'B';

      if (pA && pB) {
        let r1Name = `Round 1 Match ${matchesByRound[1].length + 1}`;
        if (numRounds === 2) {
          r1Name = `Semifinal ${matchesByRound[1].length + 1}`;
        } else if (numRounds === 3) {
          r1Name = `Quarterfinal ${matchesByRound[1].length + 1}`;
        }

        const match: TournamentMatch = {
          id: `${tournamentId}_m_1_${matchesByRound[1].length + 1}`,
          tournamentId,
          round: 1,
          roundName: r1Name,
          matchNumber: 0,
          bracketType: 'MAIN',
          participantA: pA,
          participantAId: pA.id,
          participantAName: pA.name,
          participantB: pB,
          participantBId: pB.id,
          participantBName: pB.name,
          status: 'READY',
          nextMatchId: targetR2Match.id,
          nextMatchSlot: targetSlot,
          updatedAt: Date.now(),
        };

        if (numRounds === 2 && thirdPlaceMatch) {
          match.loserMatchId = thirdPlaceMatch.id;
          match.loserMatchSlot = targetSlot;
        }

        matchesByRound[1].push(match);
      } else if (pA && !pB) {
        if (targetSlot === 'A') {
          targetR2Match.participantA = pA;
          targetR2Match.participantAId = pA.id;
          targetR2Match.participantAName = pA.name;
        } else {
          targetR2Match.participantB = pA;
          targetR2Match.participantBId = pA.id;
          targetR2Match.participantBName = pA.name;
        }
        targetR2Match.adminNotes = (targetR2Match.adminNotes ? `${targetR2Match.adminNotes}; ` : '') + `${pA.name} (BYE QUALIFIED)`;
      } else if (!pA && pB) {
        if (targetSlot === 'A') {
          targetR2Match.participantA = pB;
          targetR2Match.participantAId = pB.id;
          targetR2Match.participantAName = pB.name;
        } else {
          targetR2Match.participantB = pB;
          targetR2Match.participantBId = pB.id;
          targetR2Match.participantBName = pB.name;
        }
        targetR2Match.adminNotes = (targetR2Match.adminNotes ? `${targetR2Match.adminNotes}; ` : '') + `${pB.name} (BYE QUALIFIED)`;
      }
    }

    r2Matches.forEach((m) => {
      if (m.participantA && m.participantB) {
        m.status = 'READY';
      }
    });

    const finalMatches: TournamentMatch[] = [];
    let matchCounter = 1;

    for (let r = 1; r <= numRounds; r++) {
      (matchesByRound[r] || []).forEach((m) => {
        m.matchNumber = matchCounter++;
        finalMatches.push(m);
      });
    }

    if (thirdPlaceMatch) {
      thirdPlaceMatch.matchNumber = matchCounter++;
      finalMatches.push(thirdPlaceMatch);
    }

    const val = validateTournamentBracket(finalMatches, ordered);
    if (!val.valid) {
      throw new Error(val.error || 'Validation failed for tournament draw.');
    }

    return { matches: finalMatches, orderedParticipants: ordered };
  }

  // Fallback for ROUND_ROBIN
  const roundRobinMatches: TournamentMatch[] = [];
  let matchNumber = 1;
  for (let i = 0; i < count; i++) {
    for (let j = i + 1; j < count; j++) {
      roundRobinMatches.push({
        id: `${tournamentId}_rr_${matchNumber}`,
        tournamentId,
        round: 1,
        roundName: 'Round Robin',
        matchNumber: matchNumber++,
        bracketType: 'MAIN',
        participantA: ordered[i],
        participantAId: ordered[i].id,
        participantAName: ordered[i].name,
        participantB: ordered[j],
        participantBId: ordered[j].id,
        participantBName: ordered[j].name,
        status: 'READY',
        updatedAt: Date.now(),
      });
    }
  }

  return { matches: roundRobinMatches, orderedParticipants: ordered };
}

/**
 * Standard bracket generator (preserves existing order/seeds without random shuffle)
 */
export function generateTournamentBracket(
  tournamentId: string,
  participants: TournamentParticipant[],
  format: TournamentFormat
): TournamentMatch[] {
  const result = generateRandomTournamentDraw(tournamentId, participants, format, false);
  return result.matches;
}

/**
 * Fetch all tournaments
 */
export async function fetchTournaments(): Promise<Tournament[]> {
  try {
    const q = query(collection(db, 'tournaments'), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as Tournament);
  } catch (err) {
    console.error('Error fetching tournaments:', err);
    return [];
  }
}

/**
 * Real-time subscription to tournaments (with alias subscribeToAllTournaments for flexibility)
 */
export function subscribeToTournaments(callback: (tournaments: Tournament[]) => void) {
  const q = query(collection(db, 'tournaments'), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => d.data() as Tournament);
      callback(items);
    },
    (err) => {
      console.error('Tournaments subscription error:', err);
      callback([]);
    }
  );
}

export const subscribeToAllTournaments = subscribeToTournaments;

/**
 * Real-time subscription to completed tournaments with announced champions
 */
export function subscribeToCompletedTournaments(callback: (tournaments: Tournament[]) => void) {
  const q = query(
    collection(db, 'tournaments'),
    where('status', '==', 'COMPLETED'),
    where('winnerAnnounced', '==', true)
  );
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => d.data() as Tournament);
      items.sort((a, b) => (b.announcedAt || 0) - (a.announcedAt || 0));
      callback(items);
    },
    (err) => {
      console.error('Completed tournaments subscription error:', err);
      callback([]);
    }
  );
}

/**
 * Fetch single tournament by ID
 */
export async function fetchTournamentById(id: string): Promise<Tournament | null> {
  try {
    const docRef = doc(db, 'tournaments', id);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    return snap.data() as Tournament;
  } catch (err) {
    console.error('Error fetching tournament by ID:', err);
    return null;
  }
}

/**
 * Real-time subscription to a single tournament
 */
export function subscribeToTournamentById(id: string, callback: (tournament: Tournament | null) => void) {
  const docRef = doc(db, 'tournaments', id);
  return onSnapshot(
    docRef,
    (snap) => {
      if (snap.exists()) {
        callback(snap.data() as Tournament);
      } else {
        callback(null);
      }
    },
    (err) => {
      console.error('Tournament by ID subscription error:', err);
      callback(null);
    }
  );
}

/**
 * Admin: Create Tournament
 */
export async function createTournament(params: {
  name: string;
  description?: string;
  rules?: string;
  gameId: string;
  gameName: string;
  gameCategory: GameCategory;
  type: TournamentType;
  format: TournamentFormat;
  maxParticipants: number;
  entryFee?: string;
  prizePool?: string;
  prizes?: {
    firstPlace?: string;
    secondPlace?: string;
    thirdPlace?: string;
  };
  applyMMR: boolean;
  startDate: number;
  endDate?: number;
  registrationDeadline?: number;
  createdById: string;
  createdByName: string;
}): Promise<{ success: boolean; tournamentId?: string; error?: string }> {
  try {
    const id = `tourn_${Date.now()}`;
    const newTournament: Tournament = {
      id,
      name: params.name.trim(),
      description: params.description?.trim() || '',
      rules: params.rules?.trim() || '',
      gameId: params.gameId,
      gameName: params.gameName,
      gameCategory: params.gameCategory,
      type: params.type,
      format: params.format,
      status: 'REGISTRATION_OPEN', // Can immediately accept registrations
      maxParticipants: params.maxParticipants || 8,
      currentParticipantsCount: 0,
      entryFee: params.entryFee || 'Free',
      prizePool: params.prizePool || 'Trophies & Nexus Glory',
      prizes: params.prizes || {
        firstPlace: 'Champion Trophy & Nexus Pass',
        secondPlace: 'Silver Medalist',
        thirdPlace: 'Bronze Medalist',
      },
      applyMMR: params.applyMMR,
      startDate: params.startDate,
      endDate: params.endDate,
      registrationDeadline: params.registrationDeadline,
      participants: [],
      matches: [],
      winnerAnnounced: false,
      createdById: params.createdById,
      createdByName: params.createdByName,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await setDoc(doc(db, 'tournaments', id), sanitizeFirestoreData(newTournament));
    return { success: true, tournamentId: id };
  } catch (err: any) {
    console.error('Error creating tournament:', err);
    return { success: false, error: err.message || 'Failed to create tournament' };
  }
}

/**
 * Admin: Update Tournament Status
 */
export async function updateTournamentStatus(
  tournamentId: string,
  newStatus: TournamentStatus
): Promise<{ success: boolean; error?: string }> {
  try {
    const tRef = doc(db, 'tournaments', tournamentId);
    await updateDoc(tRef, sanitizeFirestoreData({
      status: newStatus,
      updatedAt: Date.now(),
    }));
    return { success: true };
  } catch (err: any) {
    console.error('Error updating tournament status:', err);
    return { success: false, error: err.message || 'Failed to update tournament status' };
  }
}

/**
 * Player / Captain: Register for Tournament
 */
export async function registerForTournament(
  tournamentId: string,
  participant: TournamentParticipant
): Promise<{ success: boolean; error?: string }> {
  try {
    const tRef = doc(db, 'tournaments', tournamentId);
    const snap = await getDoc(tRef);
    if (!snap.exists()) return { success: false, error: 'Tournament does not exist.' };

    const tournament = snap.data() as Tournament;
    if (tournament.status !== 'REGISTRATION_OPEN') {
      return { success: false, error: 'Registration is not open for this tournament.' };
    }

    if (tournament.type === 'TEAM' && participant.type !== 'TEAM') {
      return {
        success: false,
        error: 'This is a 5v5 Team Tournament. Individual player registration is forbidden. You must create or join a 5-player squad registration.',
      };
    }

    if (tournament.participants.some((p) => p.id === participant.id)) {
      return { success: false, error: 'Already registered for this tournament.' };
    }

    if (tournament.participants.length >= tournament.maxParticipants) {
      return { success: false, error: 'Tournament participant limit reached.' };
    }

    const updatedParticipants = [...tournament.participants, participant];
    await updateDoc(tRef, sanitizeFirestoreData({
      participants: updatedParticipants,
      currentParticipantsCount: updatedParticipants.length,
      updatedAt: Date.now(),
    }));

    return { success: true };
  } catch (err: any) {
    console.error('Error registering for tournament:', err);
    return { success: false, error: err.message || 'Failed to register for tournament' };
  }
}

/**
 * Player / Captain: Withdraw / Unregister from Tournament
 */
export async function withdrawFromTournament(
  tournamentId: string,
  participantId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const tRef = doc(db, 'tournaments', tournamentId);
    const snap = await getDoc(tRef);
    if (!snap.exists()) return { success: false, error: 'Tournament does not exist.' };

    const tournament = snap.data() as Tournament;
    if (tournament.status !== 'REGISTRATION_OPEN' && tournament.status !== 'DRAFT') {
      return { success: false, error: 'Cannot withdraw after registration has closed or bracket is generated.' };
    }

    const updatedParticipants = tournament.participants.filter((p) => p.id !== participantId);
    await updateDoc(tRef, sanitizeFirestoreData({
      participants: updatedParticipants,
      currentParticipantsCount: updatedParticipants.length,
      updatedAt: Date.now(),
    }));

    return { success: true };
  } catch (err: any) {
    console.error('Error withdrawing from tournament:', err);
    return { success: false, error: err.message || 'Failed to withdraw from tournament' };
  }
}

/**
 * Admin: Generate and lock Bracket
 */
export async function generateAndLockBracket(
  tournamentId: string
): Promise<{ success: boolean; matches?: TournamentMatch[]; error?: string }> {
  try {
    const tRef = doc(db, 'tournaments', tournamentId);
    const snap = await getDoc(tRef);
    if (!snap.exists()) return { success: false, error: 'Tournament does not exist.' };

    const tournament = snap.data() as Tournament;
    if (tournament.participants.length < 2) {
      return { success: false, error: 'At least 2 participants are required to generate bracket.' };
    }

    const matches = generateTournamentBracket(
      tournament.id,
      tournament.participants,
      tournament.format
    );

    await updateDoc(tRef, sanitizeFirestoreData({
      matches,
      status: 'UPCOMING', // Ready to start
      updatedAt: Date.now(),
    }));

    return { success: true, matches };
  } catch (err: any) {
    console.error('Error generating bracket:', err);
    return { success: false, error: err.message || 'Failed to generate bracket' };
  }
}

/**
 * Save official tournament bracket matches to Firestore
 */
export async function saveTournamentBracket(
  tournamentId: string,
  matches: TournamentMatch[]
): Promise<{ success: boolean; error?: string }> {
  try {
    const tRef = doc(db, 'tournaments', tournamentId);
    await updateDoc(tRef, sanitizeFirestoreData({
      matches,
      status: 'UPCOMING',
      updatedAt: Date.now(),
    }));
    return { success: true };
  } catch (err: any) {
    console.error('Error saving tournament bracket:', err);
    return { success: false, error: err.message || 'Failed to save bracket' };
  }
}

/**
 * 1. Admin: Start a Tournament Match (UPCOMING/READY -> LIVE)
 * Records actualStartedAt timestamp and sets tournament to LIVE
 */
export async function adminStartTournamentMatch(params: {
  tournamentId: string;
  matchId: string;
  station?: string;
  adminId?: string;
  adminName?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { tournamentId, matchId, station, adminId = 'admin', adminName = 'Admin' } = params;
    const tRef = doc(db, 'tournaments', tournamentId);
    const snap = await getDoc(tRef);
    if (!snap.exists()) return { success: false, error: 'Tournament does not exist.' };

    const tournament = snap.data() as Tournament;
    const matches = [...(tournament.matches || [])];
    const matchIndex = matches.findIndex((m) => m.id === matchId);
    if (matchIndex === -1) return { success: false, error: 'Match not found.' };

    const match = { ...matches[matchIndex] };
    if (!match.participantA || !match.participantB) {
      return { success: false, error: 'Cannot start match: Both participants must be determined.' };
    }

    const now = Date.now();
    match.status = 'LIVE';
    match.actualStartedAt = match.actualStartedAt || now;
    if (station) match.station = station;
    match.updatedAt = now;
    matches[matchIndex] = match;

    const tournamentUpdates: any = {
      matches,
      status: tournament.status === 'UPCOMING' || tournament.status === 'REGISTRATION_CLOSED' ? 'LIVE' : tournament.status,
      updatedAt: now,
    };

    await updateDoc(tRef, sanitizeFirestoreData(tournamentUpdates));

    await logTournamentActivity({
      tournamentId,
      adminId,
      adminName,
      action: 'MATCH_STARTED',
      details: `Started Match #${match.matchNumber} (${match.roundName || 'Round ' + match.round}): ${match.participantA.name} vs ${match.participantB.name} at station ${match.station || 'Default'}`,
    });

    return { success: true };
  } catch (err: any) {
    console.error('Error starting match:', err);
    return { success: false, error: err.message || 'Failed to start match.' };
  }
}

/**
 * 2. Captain or Referee: Submit Tournament Match Result
 * MANDATORY WORKFLOW:
 * GAME ENDS -> RESULT SUBMITTED -> ⏳ PENDING ADMIN APPROVAL
 * CRITICAL: Winner MUST NOT advance yet! The next match remains waiting for Admin approval.
 */
export async function submitTournamentMatchResult(params: {
  tournamentId: string;
  matchId: string;
  scoreA: number;
  scoreB: number;
  winnerId: string;
  submittedBy: string;
  submittedByName?: string;
  notes?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { tournamentId, matchId, scoreA, scoreB, winnerId, submittedBy, submittedByName = 'Player', notes } = params;
    const tRef = doc(db, 'tournaments', tournamentId);
    const snap = await getDoc(tRef);
    if (!snap.exists()) return { success: false, error: 'Tournament does not exist.' };

    const tournament = snap.data() as Tournament;
    const matches = [...(tournament.matches || [])];
    const matchIndex = matches.findIndex((m) => m.id === matchId);
    if (matchIndex === -1) return { success: false, error: 'Match not found in tournament.' };

    const match = { ...matches[matchIndex] };
    const pA = match.participantA;
    const pB = match.participantB;
    if (!pA || !pB) {
      return { success: false, error: 'Both participants must be determined to submit scores.' };
    }

    if (winnerId !== pA.id && winnerId !== pB.id) {
      return { success: false, error: 'Winner ID must match one of the participating teams/players.' };
    }

    const winner = winnerId === pA.id ? pA : pB;
    const now = Date.now();
    const durationSeconds = match.actualStartedAt
      ? Math.max(1, Math.round((now - match.actualStartedAt) / 1000))
      : undefined;

    // Record submission and change status to AWAITING_CONFIRMATION (Pending Admin Approval)
    match.status = 'AWAITING_CONFIRMATION';
    match.actualEndedAt = now;
    if (durationSeconds) match.durationSeconds = durationSeconds;
    match.submittedResult = {
      scoreA,
      scoreB,
      winnerId: winner.id,
      winnerName: winner.name,
      submittedBy,
      submittedByName,
      submittedAt: now,
      notes: notes || undefined,
    };
    match.updatedAt = now;

    // DO NOT advance winner yet!
    matches[matchIndex] = match;

    await updateDoc(tRef, sanitizeFirestoreData({
      matches,
      updatedAt: now,
    }));

    await logTournamentActivity({
      tournamentId,
      adminId: submittedBy,
      adminName: submittedByName,
      action: 'MATCH_RESULT_SUBMITTED',
      details: `Result submitted for Match #${match.matchNumber} (${match.roundName || 'Round ' + match.round}): ${pA.name} ${scoreA} - ${scoreB} ${pB.name} (Claimed winner: ${winner.name}). Pending Admin approval.`,
    });

    return { success: true };
  } catch (err: any) {
    console.error('Error submitting match result:', err);
    return { success: false, error: err.message || 'Failed to submit match result.' };
  }
}

/**
 * 3. Admin: Approve Tournament Match Result
 * MANDATORY WORKFLOW:
 * ⏳ ADMIN APPROVAL -> ✅ OFFICIAL RESULT -> 🏆 WINNER ADVANCES
 * Once approved, winner advances to next match (Final), and loser drops to 3rd place match if semi-final.
 * If this is the Final, crowns Champion and sets tournament to COMPLETED.
 */
export async function adminApproveTournamentMatchResult(params: {
  tournamentId: string;
  matchId: string;
  adminId: string;
  adminName: string;
  overrideScores?: { scoreA: number; scoreB: number; winnerId: string };
  station?: string;
  notes?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { tournamentId, matchId, adminId, adminName, overrideScores, station, notes } = params;
    const tRef = doc(db, 'tournaments', tournamentId);
    const snap = await getDoc(tRef);
    if (!snap.exists()) return { success: false, error: 'Tournament does not exist.' };

    const tournament = snap.data() as Tournament;
    const matches = [...(tournament.matches || [])];
    const matchIndex = matches.findIndex((m) => m.id === matchId);
    if (matchIndex === -1) return { success: false, error: 'Match not found in tournament.' };

    const match = { ...matches[matchIndex] };
    const pA = match.participantA;
    const pB = match.participantB;
    if (!pA || !pB) {
      return { success: false, error: 'Both participants must be assigned to approve match.' };
    }

    let finalScoreA = overrideScores ? overrideScores.scoreA : (match.submittedResult?.scoreA ?? match.scoreA ?? 0);
    let finalScoreB = overrideScores ? overrideScores.scoreB : (match.submittedResult?.scoreB ?? match.scoreB ?? 0);
    let finalWinnerId = overrideScores ? overrideScores.winnerId : (match.submittedResult?.winnerId ?? match.winnerId);

    if (!finalWinnerId || (finalWinnerId !== pA.id && finalWinnerId !== pB.id)) {
      return { success: false, error: 'A valid winner (Participant A or B) must be chosen.' };
    }

    const winner = finalWinnerId === pA.id ? pA : pB;
    const loser = finalWinnerId === pA.id ? pB : pA;
    const now = Date.now();

    match.scoreA = finalScoreA;
    match.scoreB = finalScoreB;
    match.winnerId = winner.id;
    match.winnerName = winner.name;
    match.loserId = loser.id;
    match.loserName = loser.name;
    match.status = 'COMPLETED';
    match.completedAt = now;
    match.adminApproved = true;
    match.adminApprovedAt = now;
    match.adminApprovedBy = adminId;
    match.adminApprovedByName = adminName;
    if (station) match.station = station;
    if (notes) match.adminNotes = notes;
    match.updatedAt = now;

    matches[matchIndex] = match;

    // NOW ADVANCE WINNER TO NEXT MATCH
    if (match.nextMatchId) {
      const nextIdx = matches.findIndex((m) => m.id === match.nextMatchId);
      if (nextIdx !== -1) {
        const nextM = { ...matches[nextIdx] };
        if (match.nextMatchSlot === 'A') {
          nextM.participantA = winner;
          nextM.participantAId = winner.id;
          nextM.participantAName = winner.name;
        } else {
          nextM.participantB = winner;
          nextM.participantBId = winner.id;
          nextM.participantBName = winner.name;
        }
        if (nextM.participantA && nextM.participantB) {
          nextM.status = 'READY';
        }
        nextM.updatedAt = now;
        matches[nextIdx] = nextM;
      }
    } else {
      // Fallback for Final match if nextMatchId wasn't set explicitly:
      // If round 1 of a 4-team tournament, route match 1 winner to slot A and match 2 winner to slot B of the final
      const isSemi1 = match.roundName?.toLowerCase().includes('semifinal 1') || match.roundName?.toLowerCase().includes('semi-final 1') || match.id.endsWith('_m_1_1');
      const isSemi2 = match.roundName?.toLowerCase().includes('semifinal 2') || match.roundName?.toLowerCase().includes('semi-final 2') || match.id.endsWith('_m_1_2');
      const finalIdx = matches.findIndex((m) => m.id.endsWith('_m_2_1') || (m.round === 2 && !m.id.includes('3rd')));
      if (finalIdx !== -1 && (isSemi1 || isSemi2)) {
        const finalM = { ...matches[finalIdx] };
        if (isSemi1) {
          finalM.participantA = winner;
          finalM.participantAId = winner.id;
          finalM.participantAName = winner.name;
        } else {
          finalM.participantB = winner;
          finalM.participantBId = winner.id;
          finalM.participantBName = winner.name;
        }
        if (finalM.participantA && finalM.participantB) {
          finalM.status = 'READY';
        }
        finalM.updatedAt = now;
        matches[finalIdx] = finalM;
      }
    }

    // NOW ADVANCE LOSER TO 3RD PLACE MATCH (if Semi-Final)
    const isSemiFinal =
      match.roundName?.toLowerCase().includes('semi') ||
      match.id.endsWith('_m_1_1') ||
      match.id.endsWith('_m_1_2') ||
      match.loserMatchId;

    if (isSemiFinal) {
      const thirdPlaceIdx = matches.findIndex(
        (m) => (match.loserMatchId && m.id === match.loserMatchId) || m.id === `${tournamentId}_3rd_place` || m.roundName?.includes('3rd')
      );
      if (thirdPlaceIdx !== -1) {
        const tpMatch = { ...matches[thirdPlaceIdx] };
        const slot = match.loserMatchSlot || (match.id.endsWith('_m_1_1') ? 'A' : 'B');
        if (slot === 'A' || !tpMatch.participantA) {
          tpMatch.participantA = loser;
          tpMatch.participantAId = loser.id;
          tpMatch.participantAName = loser.name;
        } else {
          tpMatch.participantB = loser;
          tpMatch.participantBId = loser.id;
          tpMatch.participantBName = loser.name;
        }
        if (tpMatch.participantA && tpMatch.participantB) {
          tpMatch.status = 'READY';
        }
        tpMatch.updatedAt = now;
        matches[thirdPlaceIdx] = tpMatch;
      }
    }

    // Check if this was the Final match or 3rd place match to update tournament standings/champion
    const tournamentUpdates: any = {
      matches,
      updatedAt: now,
    };

    const isFinalMatch =
      match.roundName?.toLowerCase().includes('final') &&
      !match.roundName?.toLowerCase().includes('semi') &&
      !match.roundName?.toLowerCase().includes('3rd');

    const isThirdPlaceMatch =
      match.id.includes('3rd') || match.roundName?.toLowerCase().includes('3rd');

    if (isFinalMatch) {
      tournamentUpdates.winnerId = winner.id;
      tournamentUpdates.winnerName = winner.name;
      tournamentUpdates.winnerParticipant = winner;
      tournamentUpdates.winnerAnnounced = true;
      tournamentUpdates.runnerUpId = loser.id;
      tournamentUpdates.runnerUpName = loser.name;
      tournamentUpdates.runnerUpParticipant = loser;

      // Check if 3rd place match is already completed
      const tp = matches.find((m) => m.id.includes('3rd') || m.roundName?.toLowerCase().includes('3rd'));
      if (tp && tp.status === 'COMPLETED' && tp.winnerId) {
        const tpWinner = tp.winnerId === tp.participantA?.id ? tp.participantA : tp.participantB;
        if (tpWinner) {
          tournamentUpdates.thirdPlaceId = tpWinner.id;
          tournamentUpdates.thirdPlaceName = tpWinner.name;
          tournamentUpdates.thirdPlaceParticipant = tpWinner;
        }
        tournamentUpdates.status = 'COMPLETED';
        tournamentUpdates.completedAt = now;
      }
    } else if (isThirdPlaceMatch) {
      tournamentUpdates.thirdPlaceId = winner.id;
      tournamentUpdates.thirdPlaceName = winner.name;
      tournamentUpdates.thirdPlaceParticipant = winner;

      // Check if Final is already completed
      const finalM = matches.find(
        (m) =>
          m.roundName?.toLowerCase().includes('final') &&
          !m.roundName?.toLowerCase().includes('semi') &&
          !m.roundName?.toLowerCase().includes('3rd')
      );
      if (finalM && finalM.status === 'COMPLETED' && finalM.winnerId) {
        tournamentUpdates.status = 'COMPLETED';
        tournamentUpdates.completedAt = now;
      }
    }

    // Determine next round name and match progression details
    let nextRoundName = 'Next Round';
    let targetNextMatchId = match.nextMatchId;
    if (isFinalMatch) {
      nextRoundName = 'TOURNAMENT CHAMPION';
    } else if (match.nextMatchId) {
      const nm = matches.find((m) => m.id === match.nextMatchId);
      nextRoundName = nm?.roundName || 'Grand Finals';
    } else if (isSemiFinal) {
      const finalM = matches.find(
        (m) =>
          m.roundName?.toLowerCase().includes('final') &&
          !m.roundName?.toLowerCase().includes('semi') &&
          !m.roundName?.toLowerCase().includes('3rd')
      );
      if (finalM) {
        targetNextMatchId = finalM.id;
        nextRoundName = finalM.roundName || 'Grand Finals';
      } else {
        nextRoundName = 'Grand Finals';
      }
    }

    const thirdPlaceMatch = isSemiFinal
      ? matches.find((m) => m.id.includes('3rd') || m.roundName?.toLowerCase().includes('3rd'))
      : undefined;

    // SECTION 3: Create Idempotent TEAM_QUALIFIED Tournament Event
    const eventId = `qual_${tournamentId}_${match.id}`;
    const existingEvents: TournamentQualificationEvent[] = tournament.qualificationEvents || [];
    const alreadyHasEvent = existingEvents.some((e) => e.eventId === eventId || e.matchId === match.id);

    let qualEvent: TournamentQualificationEvent | null = null;

    if (!alreadyHasEvent) {
      qualEvent = {
        eventId,
        tournamentId,
        tournamentName: tournament.name,
        matchId: match.id,
        matchNumber: match.matchNumber,
        round: match.round,
        roundName: match.roundName,
        winnerTeamId: winner.id,
        winnerTeamName: winner.name,
        winnerTeamTag: winner.tag,
        winnerAvatarUrl: winner.avatarUrl,
        loserTeamId: loser.id,
        loserTeamName: loser.name,
        loserTeamTag: loser.tag,
        loserAvatarUrl: loser.avatarUrl,
        scoreA: finalScoreA,
        scoreB: finalScoreB,
        nextMatchId: targetNextMatchId,
        nextRoundName,
        loserMatchId: thirdPlaceMatch?.id,
        loserRoundName: thirdPlaceMatch ? thirdPlaceMatch.roundName || '3rd Place Playoff' : undefined,
        isSemiFinal: Boolean(isSemiFinal),
        isChampionship: Boolean(isFinalMatch),
        qualificationTime: now,
        createdAt: now,
        approvedBy: adminId,
        approvedByName: adminName,
      };

      tournamentUpdates.qualificationEvents = [qualEvent, ...existingEvents];

      // Save to dedicated /tournamentEvents/{eventId} doc in Firestore
      await setDoc(doc(db, 'tournamentEvents', eventId), sanitizeFirestoreData(qualEvent)).catch((e) =>
        console.error('Error saving to tournamentEvents collection:', e)
      );
    }

    await updateDoc(tRef, sanitizeFirestoreData(tournamentUpdates));

    await logTournamentActivity({
      tournamentId,
      adminId,
      adminName,
      action: 'MATCH_RESULT_APPROVED',
      affectedParticipant: winner.name,
      details: `Admin ${adminName} approved official result for Match #${match.matchNumber} (${match.roundName}): ${winner.name} (${finalScoreA}-${finalScoreB}) won against ${loser.name}. Progression updated.`,
    });

    if (qualEvent) {
      await logTournamentActivity({
        tournamentId,
        adminId,
        adminName,
        action: 'TEAM_QUALIFIED',
        affectedParticipant: winner.name,
        details: `${winner.name} officially qualified for ${nextRoundName} after defeating ${loser.name} (${finalScoreA}-${finalScoreB}).`,
      });

      if (isSemiFinal && loser.id) {
        await logTournamentActivity({
          tournamentId,
          adminId,
          adminName,
          action: 'TEAM_QUALIFIED_3RD_PLACE',
          affectedParticipant: loser.name,
          details: `${loser.name} advanced to the 3rd Place Match.`,
        });
      }
    }

    // Helper to resolve all user IDs belonging to a participant team or player
    const getParticipantMemberIds = (p?: TournamentParticipant): string[] => {
      if (!p) return [];
      const ids = new Set<string>();
      if (p.id && !p.id.startsWith('guest_')) ids.add(p.id);
      if (p.type === 'TEAM') {
        if (p.teamMemberIds && Array.isArray(p.teamMemberIds)) {
          p.teamMemberIds.forEach((mId) => {
            if (mId && !mId.startsWith('guest_')) ids.add(mId);
          });
        }
        if (p.teamMembers && Array.isArray(p.teamMembers)) {
          p.teamMembers.forEach((m) => {
            if (m.uid && !m.uid.startsWith('guest_')) ids.add(m.uid);
          });
        }
      }
      return Array.from(ids);
    };

    // Idempotent notification helper to ensure no spam / duplicates
    const sendIdempotentTournamentNotification = async (p: {
      notificationId: string;
      userId: string;
      type: AppNotification['type'];
      title: string;
      message: string;
      data?: Record<string, any>;
    }) => {
      try {
        if (!p.userId || p.userId.startsWith('guest_')) return;
        const notifRef = doc(db, 'notifications', p.notificationId);
        const existing = await getDoc(notifRef);
        if (existing.exists()) return; // Already sent, skip!
        await setDoc(
          notifRef,
          sanitizeFirestoreData({
            id: p.notificationId,
            userId: p.userId,
            type: p.type,
            title: p.title,
            message: p.message,
            read: false,
            createdAt: now,
            data: p.data || {},
          })
        );
      } catch (err) {
        console.error('Error sending idempotent notification:', err);
      }
    };

    // 1. Notify Winning Team members
    const winnerUserIds = getParticipantMemberIds(winner);
    for (const uid of winnerUserIds) {
      const notifId = `notif_qual_win_${tournamentId}_${match.id}_${uid}`;
      await sendIdempotentTournamentNotification({
        notificationId: notifId,
        userId: uid,
        type: 'MATCH_RESULT',
        title: '🏆 YOU QUALIFIED',
        message: `${winner.name} has officially qualified for the ${nextRoundName} in ${tournament.name}!`,
        data: {
          tournamentId,
          tournamentName: tournament.name,
          matchId: match.id,
          nextMatchId: targetNextMatchId,
          role: 'winner',
        },
      });
    }

    // 2. Notify Semifinal Loser about Third Place Placement Match
    const loserUserIds = isSemiFinal && loser.id ? getParticipantMemberIds(loser) : [];
    if (isSemiFinal && loser.id) {
      for (const uid of loserUserIds) {
        const notifId = `notif_qual_tp_${tournamentId}_${match.id}_${uid}`;
        await sendIdempotentTournamentNotification({
          notificationId: notifId,
          userId: uid,
          type: 'MATCH_RESULT',
          title: '🥉 THIRD PLACE MATCH',
          message: `${loser.name} will compete in the Third Place Match in ${tournament.name}!`,
          data: {
            tournamentId,
            tournamentName: tournament.name,
            matchId: match.id,
            thirdPlaceMatchId: thirdPlaceMatch?.id,
            role: 'loser_third_place',
          },
        });
      }
    }

    // 3. Notify opponents if a subsequent match is now READY (both participants assigned)
    const targetMatch = matches.find((m) => m.id === targetNextMatchId);
    if (targetMatch && targetMatch.participantA?.id && targetMatch.participantB?.id) {
      const partA = targetMatch.participantA;
      const partB = targetMatch.participantB;
      const partAIds = getParticipantMemberIds(partA);
      const partBIds = getParticipantMemberIds(partB);

      const matchDateStr = targetMatch.scheduledTime
        ? new Date(targetMatch.scheduledTime).toLocaleDateString([], {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })
        : tournament.startDate
        ? new Date(tournament.startDate).toLocaleDateString([], {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })
        : 'TBD';
      const matchTimeStr = targetMatch.scheduledTime
        ? new Date(targetMatch.scheduledTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : 'TBD';

      for (const uid of partAIds) {
        const notifId = `notif_next_ready_${tournamentId}_${targetMatch.id}_${uid}`;
        await sendIdempotentTournamentNotification({
          notificationId: notifId,
          userId: uid,
          type: 'MATCH_CONFIRMED',
          title: '⚔️ NEXT MATCH READY',
          message: `${partA.name} vs ${partB.name}\nDate: ${matchDateStr}\nTime: ${matchTimeStr}`,
          data: {
            tournamentId,
            tournamentName: tournament.name,
            matchId: targetMatch.id,
            scheduledDate: matchDateStr,
            scheduledTime: matchTimeStr,
          },
        });
      }

      for (const uid of partBIds) {
        const notifId = `notif_next_ready_${tournamentId}_${targetMatch.id}_${uid}`;
        await sendIdempotentTournamentNotification({
          notificationId: notifId,
          userId: uid,
          type: 'MATCH_CONFIRMED',
          title: '⚔️ NEXT MATCH READY',
          message: `${partB.name} vs ${partA.name}\nDate: ${matchDateStr}\nTime: ${matchTimeStr}`,
          data: {
            tournamentId,
            tournamentName: tournament.name,
            matchId: targetMatch.id,
            scheduledDate: matchDateStr,
            scheduledTime: matchTimeStr,
          },
        });
      }
    }

    // 4. Public Tournament Participants Feed Notification
    const allRegisteredUserIds = extractParticipantUserIds(tournament);
    const excludeIds = new Set([...winnerUserIds, ...loserUserIds]);
    const publicRecipients = allRegisteredUserIds.filter((id) => !excludeIds.has(id));

    for (const uid of publicRecipients) {
      const notifId = `notif_qual_public_${tournamentId}_${match.id}_${uid}`;
      await sendIdempotentTournamentNotification({
        notificationId: notifId,
        userId: uid,
        type: 'TOURNAMENT_ANNOUNCEMENT',
        title: '🏆 TOURNAMENT UPDATE',
        message: `${winner.name} defeated ${loser.name} and qualified for the ${nextRoundName}.`,
        data: {
          tournamentId,
          tournamentName: tournament.name,
          matchId: match.id,
          winnerName: winner.name,
          loserName: loser.name,
        },
      });
    }

    return { success: true };
  } catch (err: any) {
    console.error('Error approving match result:', err);
    return { success: false, error: err.message || 'Failed to approve match result.' };
  }
}

/**
 * 4. Admin: Reject / Dispute Tournament Match Result
 */
export async function adminRejectTournamentMatchResult(params: {
  tournamentId: string;
  matchId: string;
  adminId: string;
  adminName: string;
  reason: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { tournamentId, matchId, adminId, adminName, reason } = params;
    const tRef = doc(db, 'tournaments', tournamentId);
    const snap = await getDoc(tRef);
    if (!snap.exists()) return { success: false, error: 'Tournament does not exist.' };

    const tournament = snap.data() as Tournament;
    const matches = [...(tournament.matches || [])];
    const matchIndex = matches.findIndex((m) => m.id === matchId);
    if (matchIndex === -1) return { success: false, error: 'Match not found.' };

    const match = { ...matches[matchIndex] };
    const now = Date.now();

    match.status = 'DISPUTED';
    match.disputedAt = now;
    match.disputeReason = reason;
    match.disputedBy = adminId;
    match.disputedByName = adminName;
    match.adminNotes = `Result rejected by ${adminName}: ${reason}`;
    match.updatedAt = now;

    matches[matchIndex] = match;

    await updateDoc(tRef, sanitizeFirestoreData({
      matches,
      updatedAt: now,
    }));

    await logTournamentActivity({
      tournamentId,
      adminId,
      adminName,
      action: 'MATCH_RESULT_REJECTED',
      details: `Admin ${adminName} rejected/disputed match #${match.matchNumber} result: ${reason}`,
    });

    return { success: true };
  } catch (err: any) {
    console.error('Error rejecting match result:', err);
    return { success: false, error: err.message || 'Failed to reject match result.' };
  }
}

/**
 * 5. Admin: Force End Tournament Match (Instant override and completion)
 */
export async function adminForceEndTournamentMatch(params: {
  tournamentId: string;
  matchId: string;
  scoreA: number;
  scoreB: number;
  winnerId: string;
  adminId: string;
  adminName: string;
  reason?: string;
  station?: string;
}): Promise<{ success: boolean; error?: string }> {
  return adminApproveTournamentMatchResult({
    tournamentId: params.tournamentId,
    matchId: params.matchId,
    adminId: params.adminId,
    adminName: params.adminName,
    overrideScores: {
      scoreA: params.scoreA,
      scoreB: params.scoreB,
      winnerId: params.winnerId,
    },
    station: params.station,
    notes: params.reason ? `Force ended by admin: ${params.reason}` : 'Force ended by admin',
  });
}

/**
 * 6. Admin: Reset Tournament Match (Rollback to READY or LIVE if needed)
 */
export async function adminResetTournamentMatch(params: {
  tournamentId: string;
  matchId: string;
  adminId: string;
  adminName: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { tournamentId, matchId, adminId, adminName } = params;
    const tRef = doc(db, 'tournaments', tournamentId);
    const snap = await getDoc(tRef);
    if (!snap.exists()) return { success: false, error: 'Tournament does not exist.' };

    const tournament = snap.data() as Tournament;
    const matches = [...(tournament.matches || [])];
    const matchIndex = matches.findIndex((m) => m.id === matchId);
    if (matchIndex === -1) return { success: false, error: 'Match not found.' };

    const match = { ...matches[matchIndex] };
    const now = Date.now();

    // Clear outcome
    delete match.scoreA;
    delete match.scoreB;
    delete match.winnerId;
    delete match.winnerName;
    delete match.loserId;
    delete match.loserName;
    delete match.completedAt;
    delete match.adminApproved;
    delete match.adminApprovedAt;
    delete match.adminApprovedBy;
    delete match.adminApprovedByName;
    delete match.submittedResult;
    delete match.disputedAt;
    delete match.disputeReason;
    delete match.disputedBy;

    match.status = match.participantA && match.participantB ? 'READY' : 'SCHEDULED';
    match.updatedAt = now;
    matches[matchIndex] = match;

    // Clear downstream advanced slots
    if (match.nextMatchId) {
      const nextIdx = matches.findIndex((m) => m.id === match.nextMatchId);
      if (nextIdx !== -1) {
        const nextM = { ...matches[nextIdx] };
        if (match.nextMatchSlot === 'A') {
          delete nextM.participantA;
          delete nextM.participantAId;
          delete nextM.participantAName;
        } else {
          delete nextM.participantB;
          delete nextM.participantBId;
          delete nextM.participantBName;
        }
        nextM.status = 'SCHEDULED';
        nextM.updatedAt = now;
        matches[nextIdx] = nextM;
      }
    }

    if (match.loserMatchId) {
      const loserIdx = matches.findIndex((m) => m.id === match.loserMatchId);
      if (loserIdx !== -1) {
        const loserM = { ...matches[loserIdx] };
        if (match.loserMatchSlot === 'A') {
          delete loserM.participantA;
          delete loserM.participantAId;
          delete loserM.participantAName;
        } else {
          delete loserM.participantB;
          delete loserM.participantBId;
          delete loserM.participantBName;
        }
        loserM.status = 'SCHEDULED';
        loserM.updatedAt = now;
        matches[loserIdx] = loserM;
      }
    }

    await updateDoc(tRef, sanitizeFirestoreData({
      matches,
      updatedAt: now,
    }));

    await logTournamentActivity({
      tournamentId,
      adminId,
      adminName,
      action: 'MATCH_RESET',
      details: `Admin ${adminName} reset Match #${match.matchNumber} back to ${match.status}.`,
    });

    return { success: true };
  } catch (err: any) {
    console.error('Error resetting match:', err);
    return { success: false, error: err.message || 'Failed to reset match.' };
  }
}

/**
 * Admin: Update individual Match Score and advance winner (Legacy compatibility wrapper)
 */
export async function updateTournamentMatchResult(params: {
  tournamentId: string;
  matchId: string;
  scoreA: number;
  scoreB: number;
  winnerId: string;
  station?: string;
  adminId?: string;
  adminName?: string;
}): Promise<{ success: boolean; error?: string }> {
  return adminApproveTournamentMatchResult({
    tournamentId: params.tournamentId,
    matchId: params.matchId,
    adminId: params.adminId || 'admin',
    adminName: params.adminName || 'Admin',
    overrideScores: {
      scoreA: params.scoreA,
      scoreB: params.scoreB,
      winnerId: params.winnerId,
    },
    station: params.station,
  });
}

/**
 * Admin: Complete Tournament and officially Announce Champions
 * CRITICAL RULE: "Do not automatically declare or announce winners without Admin confirmation."
 * Admin reviews standings, selects winner, runner-up, 3rd place, confirms rewards, and awards permanent profile achievements.
 */
export async function officiallyAnnounceTournamentWinners(params: {
  tournamentId: string;
  winnerParticipant: TournamentParticipant;
  runnerUpParticipant?: TournamentParticipant;
  thirdPlaceParticipant?: TournamentParticipant;
  finalStandings: TournamentStanding[];
  adminId: string;
  adminName: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const {
      tournamentId,
      winnerParticipant,
      runnerUpParticipant,
      thirdPlaceParticipant,
      finalStandings,
      adminId,
      adminName,
    } = params;

    const tRef = doc(db, 'tournaments', tournamentId);
    const snap = await getDoc(tRef);
    if (!snap.exists()) return { success: false, error: 'Tournament does not exist.' };

    const tournament = snap.data() as Tournament;

    // 1. Prepare batch
    const batch = writeBatch(db);

    // 2. Update tournament document
    const now = Date.now();
    const tournamentUpdates: Partial<Tournament> = {
      status: 'COMPLETED',
      winnerAnnounced: true,
      winnerId: winnerParticipant.id,
      winnerName: winnerParticipant.name,
      winnerType: winnerParticipant.type,
      winnerAvatarUrl: winnerParticipant.avatarUrl,
      runnerUpId: runnerUpParticipant?.id,
      runnerUpName: runnerUpParticipant?.name,
      thirdPlaceId: thirdPlaceParticipant?.id,
      thirdPlaceName: thirdPlaceParticipant?.name,
      finalStandings,
      completedAt: now,
      announcedAt: now,
      updatedAt: now,
    };
    batch.update(tRef, sanitizeFirestoreData(tournamentUpdates));

    // 3. Award Permanent Achievements to Players' Profiles
    // 1st Place (Champion)
    const champAwardId = `ach_${tournamentId}_1st_${winnerParticipant.id}`;
    const champAward: TournamentAchievement = {
      id: champAwardId,
      tournamentId,
      tournamentName: tournament.name,
      gameId: tournament.gameId,
      gameName: tournament.gameName,
      gameCategory: tournament.gameCategory,
      tournamentType: tournament.type,
      place: 1,
      title: 'Tournament Champion',
      icon: '🏆',
      date: now,
      prize: tournament.prizes?.firstPlace,
      teamId: winnerParticipant.type === 'TEAM' ? winnerParticipant.id : undefined,
      teamName: winnerParticipant.type === 'TEAM' ? winnerParticipant.name : undefined,
    };

    if (winnerParticipant.type === 'PLAYER') {
      batch.set(doc(db, 'tournamentAchievements', champAwardId), sanitizeFirestoreData(champAward));
    } else if (winnerParticipant.teamMemberIds) {
      // Award to each member of the winning 5v5 team
      winnerParticipant.teamMemberIds.forEach((memberUid) => {
        const memberAwardId = `ach_${tournamentId}_1st_${memberUid}`;
        batch.set(doc(db, 'tournamentAchievements', memberAwardId), sanitizeFirestoreData({
          ...champAward,
          id: memberAwardId,
          recipientPlayerId: memberUid,
        }));
      });
    }

    // 2nd Place (Runner-up)
    if (runnerUpParticipant) {
      const runnerUpAwardId = `ach_${tournamentId}_2nd_${runnerUpParticipant.id}`;
      const runnerUpAward: TournamentAchievement = {
        id: runnerUpAwardId,
        tournamentId,
        tournamentName: tournament.name,
        gameId: tournament.gameId,
        gameName: tournament.gameName,
        gameCategory: tournament.gameCategory,
        tournamentType: tournament.type,
        place: 2,
        title: 'Grand Finalist',
        icon: '🥈',
        date: now,
        prize: tournament.prizes?.secondPlace,
        teamId: runnerUpParticipant.type === 'TEAM' ? runnerUpParticipant.id : undefined,
        teamName: runnerUpParticipant.type === 'TEAM' ? runnerUpParticipant.name : undefined,
      };

      if (runnerUpParticipant.type === 'PLAYER') {
        batch.set(doc(db, 'tournamentAchievements', runnerUpAwardId), sanitizeFirestoreData(runnerUpAward));
      } else if (runnerUpParticipant.teamMemberIds) {
        runnerUpParticipant.teamMemberIds.forEach((memberUid) => {
          const memberAwardId = `ach_${tournamentId}_2nd_${memberUid}`;
          batch.set(doc(db, 'tournamentAchievements', memberAwardId), sanitizeFirestoreData({
            ...runnerUpAward,
            id: memberAwardId,
            recipientPlayerId: memberUid,
          }));
        });
      }
    }

    // 3rd Place
    if (thirdPlaceParticipant) {
      const thirdPlaceAwardId = `ach_${tournamentId}_3rd_${thirdPlaceParticipant.id}`;
      const thirdAward: TournamentAchievement = {
        id: thirdPlaceAwardId,
        tournamentId,
        tournamentName: tournament.name,
        gameId: tournament.gameId,
        gameName: tournament.gameName,
        gameCategory: tournament.gameCategory,
        tournamentType: tournament.type,
        place: 3,
        title: '3rd Place Medalist',
        icon: '🥉',
        date: now,
        prize: tournament.prizes?.thirdPlace,
        teamId: thirdPlaceParticipant.type === 'TEAM' ? thirdPlaceParticipant.id : undefined,
        teamName: thirdPlaceParticipant.type === 'TEAM' ? thirdPlaceParticipant.name : undefined,
      };

      if (thirdPlaceParticipant.type === 'PLAYER') {
        batch.set(doc(db, 'tournamentAchievements', thirdPlaceAwardId), sanitizeFirestoreData(thirdAward));
      } else if (thirdPlaceParticipant.teamMemberIds) {
        thirdPlaceParticipant.teamMemberIds.forEach((memberUid) => {
          const memberAwardId = `ach_${tournamentId}_3rd_${memberUid}`;
          batch.set(doc(db, 'tournamentAchievements', memberAwardId), sanitizeFirestoreData({
            ...thirdAward,
            id: memberAwardId,
            recipientPlayerId: memberUid,
          }));
        });
      }
    }

    // 4. Audit Log
    const auditId = `audit_tourn_${Date.now()}`;
    batch.set(doc(db, 'auditLogs', auditId), {
      id: auditId,
      action: 'TOURNAMENT_COMPLETED_AND_ANNOUNCED',
      actorId: adminId,
      actorName: adminName,
      targetType: 'tournament',
      targetId: tournamentId,
      details: `Officially concluded ${tournament.name} (${tournament.gameName}). Champion crowned: ${winnerParticipant.name}.`,
      timestamp: now,
    });

    await batch.commit();
    return { success: true };
  } catch (err: any) {
    console.error('Error announcing tournament winners:', err);
    return { success: false, error: err.message || 'Failed to announce tournament winners' };
  }
}

/**
 * Convenient wrapper for AdminTournamentsView winner completion
 */
export async function completeTournamentAndAnnounceWinner(
  tournamentId: string,
  winnerParticipantId: string,
  runnerUpParticipantId?: string,
  thirdPlaceParticipantId?: string,
  adminNotes?: string
): Promise<{ success: boolean; error?: string }> {
  const tRef = doc(db, 'tournaments', tournamentId);
  const snap = await getDoc(tRef);
  if (!snap.exists()) return { success: false, error: 'Tournament not found' };
  const tourn = snap.data() as Tournament;

  const winner = tourn.participants.find((p) => p.id === winnerParticipantId);
  if (!winner) return { success: false, error: 'Winner participant not found in tournament.' };

  const runnerUp = runnerUpParticipantId
    ? tourn.participants.find((p) => p.id === runnerUpParticipantId)
    : undefined;

  const third = thirdPlaceParticipantId
    ? tourn.participants.find((p) => p.id === thirdPlaceParticipantId)
    : undefined;

  const standings: TournamentStanding[] = [
    {
      place: 1,
      participantId: winner.id,
      participantName: winner.name,
      participantType: winner.type,
      prize: tourn.prizes?.firstPlace,
      memberIds: winner.teamMemberIds,
    },
  ];

  if (runnerUp) {
    standings.push({
      place: 2,
      participantId: runnerUp.id,
      participantName: runnerUp.name,
      participantType: runnerUp.type,
      prize: tourn.prizes?.secondPlace,
      memberIds: runnerUp.teamMemberIds,
    });
  }

  if (third) {
    standings.push({
      place: 3,
      participantId: third.id,
      participantName: third.name,
      participantType: third.type,
      prize: tourn.prizes?.thirdPlace,
      memberIds: third.teamMemberIds,
    });
  }

  return officiallyAnnounceTournamentWinners({
    tournamentId,
    winnerParticipant: winner,
    runnerUpParticipant: runnerUp,
    thirdPlaceParticipant: third,
    finalStandings: standings,
    adminId: tourn.createdById || 'admin',
    adminName: adminNotes || tourn.createdByName || 'Nexus Tournament Admin',
  });
}

/**
 * Fetch achievements for a specific player across all tournaments
 */
export async function fetchPlayerTournamentAchievements(playerId: string): Promise<TournamentAchievement[]> {
  try {
    const q1 = query(collection(db, 'tournamentAchievements'), where('recipientPlayerId', '==', playerId));
    const q2 = query(collection(db, 'tournamentAchievements'), where('id', '>=', `ach_`), where('id', '<=', `ach_\uf8ff`));
    
    // We can also query all achievements and filter for this player ID
    const snap = await getDocs(collection(db, 'tournamentAchievements'));
    const achievements: TournamentAchievement[] = [];
    
    snap.docs.forEach((d) => {
      const data = d.data() as any;
      if (data.recipientPlayerId === playerId || d.id.includes(playerId)) {
        const item = data as TournamentAchievement;
        item.placement = item.placement || item.place;
        item.awardedAt = item.awardedAt || item.date;
        achievements.push(item);
      }
    });

    return achievements.sort((a, b) => (b.awardedAt || b.date) - (a.awardedAt || a.date));
  } catch (err) {
    console.error('Error fetching player tournament achievements:', err);
    return [];
  }
}

export const fetchPlayerAchievements = fetchPlayerTournamentAchievements;

/**
 * Fetch all recently announced champions across all completed tournaments
 * Used on Main Dashboard & Tournament page
 */
export async function fetchAllTournamentChampions(): Promise<Tournament[]> {
  try {
    const q = query(
      collection(db, 'tournaments'),
      where('status', '==', 'COMPLETED'),
      where('winnerAnnounced', '==', true),
      orderBy('announcedAt', 'desc')
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as Tournament);
  } catch (err) {
    console.error('Error fetching tournament champions:', err);
    return [];
  }
}

// =========================================================================
// 5 VS 5 TEAM TOURNAMENT REGISTRATION SYSTEM (ONE TEAM = ONE TOURNAMENT ENTRY)
// =========================================================================

export interface PlayerTournamentActiveMembership {
  isActive: boolean;
  teamId?: string;
  teamName?: string;
  role?: 'CAPTAIN' | 'MEMBER' | 'SOLO_PLAYER';
  status?: string;
  reason?: string;
  isPendingInvite?: boolean;
}

/**
 * CANONICAL ELIGIBILITY CHECK: Determines whether a player is currently an ACTIVE/CONFIRMED
 * member of any team in the specified tournament.
 *
 * Rules:
 * 1. Filter to current tournament.
 * 2. Ignore the current team if excludeTeamId is provided (e.g. when inviting/re-inviting).
 * 3. Ignore historical/inactive memberships:
 *    - REMOVED slots or removed audit records
 *    - CANCELLED registrations or slots
 *    - DECLINED invitations or slots
 *    - WITHDRAWN teams or participants
 *    - REJECTED teams
 *    - EMPTY slots
 * 4. Check whether there is a CURRENT ACTIVE/CONFIRMED team membership:
 *    - Captain of an active squad (WAITING_FOR_PLAYERS, PENDING_ADMIN_APPROVAL, CONFIRMED, APPROVED)
 *    - Teammate in an ACTIVE/CONFIRMED slot (ACCEPTED, INFORMATION_COMPLETE, COMPLETED, or isPlayerInvitationAccepted(slot))
 *    - Confirmed participant in tournament.participants (where the team is active and the slot is active in registration)
 */
export async function checkPlayerTournamentActiveMembership(
  tournamentId: string,
  playerUid: string,
  excludeTeamId?: string
): Promise<PlayerTournamentActiveMembership> {
  if (!tournamentId || !playerUid) {
    return { isActive: false };
  }

  // 1. Check tournamentTeamRegistrations (single source of truth for rosters & slots)
  const regsQuery = query(
    collection(db, 'tournamentTeamRegistrations'),
    where('tournamentId', '==', tournamentId)
  );
  const regsSnap = await getDocs(regsQuery);
  const regMap = new Map<string, TeamTournamentRegistration>();

  for (const d of regsSnap.docs) {
    const reg = d.data() as TeamTournamentRegistration;
    regMap.set(reg.id, reg);

    // Skip the excluded team (e.g. the team currently inviting the player)
    if (excludeTeamId && reg.id === excludeTeamId) {
      continue;
    }

    // Ignore inactive registrations
    if (
      reg.status === 'CANCELLED' ||
      reg.status === 'REJECTED' ||
      (reg.status as string) === 'WITHDRAWN'
    ) {
      continue;
    }

    // Check if player is the active captain of this other team
    if (reg.captainId === playerUid) {
      return {
        isActive: true,
        teamId: reg.id,
        teamName: reg.teamName,
        role: 'CAPTAIN',
        status: reg.status,
        reason: `Captain of squad "${reg.teamName}"`,
      };
    }

    // Check slots in this team
    for (const s of reg.slots || []) {
      const slotPlayerUid = s.playerId || s.invitedPlayerId || (s as any).recipientId;
      if (!slotPlayerUid || slotPlayerUid !== playerUid) {
        continue;
      }

      // Explicitly ignore inactive/historical statuses
      if (
        s.status === 'EMPTY' ||
        s.playerStatus === 'EMPTY' ||
        s.status === 'REMOVED' ||
        s.playerStatus === 'REMOVED' ||
        s.status === 'DECLINED' ||
        s.playerStatus === 'DECLINED' ||
        s.status === 'CANCELLED' ||
        s.playerStatus === 'CANCELLED' ||
        s.invitationStatus === 'CANCELLED' ||
        s.invitationStatus === 'DECLINED' ||
        s.invitationStatus === 'EXPIRED'
      ) {
        // Historical, removed, declined, or cancelled slot - NOT active!
        continue;
      }

      // Check if slot is ACTIVE / CONFIRMED
      const isFilled =
        s.status === 'COMPLETED' ||
        s.status === 'ACCEPTED' ||
        s.status === 'INFORMATION_COMPLETE' ||
        s.playerStatus === 'INFORMATION_COMPLETE' ||
        s.playerStatus === 'ACCEPTED' ||
        isPlayerInvitationAccepted(s);

      if (isFilled) {
        return {
          isActive: true,
          teamId: reg.id,
          teamName: reg.teamName,
          role: 'MEMBER',
          status: reg.status === 'CONFIRMED' || (reg.status as string) === 'APPROVED' ? 'CONFIRMED' : reg.status,
          reason: `Active member of squad "${reg.teamName}"`,
        };
      }
    }
  }

  // 2. Check tournament doc participants
  const tRef = doc(db, 'tournaments', tournamentId);
  const tSnap = await getDoc(tRef);
  if (tSnap.exists()) {
    const t = tSnap.data() as Tournament;
    for (const p of t.participants || []) {
      // Skip the excluded team
      if (excludeTeamId && p.id === excludeTeamId) {
        continue;
      }

      // Ignore withdrawn, disqualified, or cancelled participants
      if (p.status === 'WITHDRAWN' || p.status === 'DISQUALIFIED') {
        continue;
      }

      // Solo player participant
      if (p.type === 'PLAYER') {
        if (p.id === playerUid) {
          return {
            isActive: true,
            teamId: p.id,
            teamName: p.name,
            role: 'SOLO_PLAYER',
            status: p.status || 'CONFIRMED',
            reason: `Solo participant in tournament`,
          };
        }
        continue;
      }

      // Team participant
      const isListedInMemberIds = p.teamMemberIds && p.teamMemberIds.includes(playerUid);
      const isListedInMembers = p.teamMembers && p.teamMembers.some((m) => m.uid === playerUid);

      if (isListedInMemberIds || isListedInMembers) {
        // CRITICAL: Check against regMap if this participant corresponds to a registration!
        // If the registration exists, it is the authoritative source for actual active slots.
        const reg = regMap.get(p.id);
        if (reg) {
          // Does reg ACTUALLY have this player in an active slot?
          const actuallyActive = (reg.slots || []).some((s) => {
            const slotPlayerUid = s.playerId || s.invitedPlayerId || (s as any).recipientId;
            if (slotPlayerUid !== playerUid) return false;
            if (
              s.status === 'EMPTY' ||
              s.playerStatus === 'EMPTY' ||
              s.status === 'REMOVED' ||
              s.playerStatus === 'REMOVED' ||
              s.status === 'DECLINED' ||
              s.playerStatus === 'DECLINED' ||
              s.status === 'CANCELLED' ||
              s.playerStatus === 'CANCELLED' ||
              s.invitationStatus === 'CANCELLED' ||
              s.invitationStatus === 'DECLINED' ||
              s.invitationStatus === 'EXPIRED'
            ) {
              return false;
            }
            return (
              s.status === 'COMPLETED' ||
              s.status === 'ACCEPTED' ||
              s.status === 'INFORMATION_COMPLETE' ||
              s.playerStatus === 'INFORMATION_COMPLETE' ||
              s.playerStatus === 'ACCEPTED' ||
              isPlayerInvitationAccepted(s)
            );
          });

          if (!actuallyActive && reg.captainId !== playerUid) {
            // The tournament participant has STALE member data!
            // Player was removed from the squad's slots!
            // IGNORE THIS STALE RECORD!
            continue;
          }
        }

        return {
          isActive: true,
          teamId: p.id,
          teamName: p.name,
          role: 'MEMBER',
          status: p.status || 'CONFIRMED',
          reason: `Confirmed member of team "${p.name}"`,
        };
      }
    }
  }

  return { isActive: false };
}

/**
 * Captain: Create a new 5v5 Team Tournament Registration Room
 */
export async function createTeamTournamentRegistration(params: {
  tournament: Tournament;
  teamName: string;
  captain: Player;
  captainInGameName: string;
  captainPhone: string;
  captainRank: string;
  captainFullName?: string;
  teamTag?: string;
  teamLogo?: string;
}): Promise<{ success: boolean; registration?: TeamTournamentRegistration; error?: string }> {
  try {
    const {
      tournament,
      teamName,
      captain,
      captainInGameName,
      captainPhone,
      captainRank,
      captainFullName,
      teamTag,
      teamLogo,
    } = params;

    if (tournament.type !== 'TEAM') {
      return { success: false, error: 'This tournament is not configured for 5v5 squads.' };
    }

    if (tournament.status !== 'REGISTRATION_OPEN') {
      return { success: false, error: 'Tournament registration is currently closed.' };
    }

    // Validate phone number
    const phoneVal = validatePhoneNumber(captainPhone);
    if (!phoneVal.valid) {
      return { success: false, error: `Captain phone error: ${phoneVal.error}` };
    }

    if (!teamName || !teamName.trim()) {
      return { success: false, error: 'Team Name is strictly required.' };
    }

    if (!captainInGameName || !captainInGameName.trim()) {
      return { success: false, error: 'Captain in-game name is required.' };
    }

    if (!captainRank || !captainRank.trim()) {
      return { success: false, error: 'Captain in-game rank is required.' };
    }

    const trimmedTeamName = teamName.trim();
    const lowerName = trimmedTeamName.toLowerCase();

    // Check if tournament capacity is full (confirmed teams)
    if (tournament.participants.length >= tournament.maxParticipants) {
      return { success: false, error: 'Tournament team capacity is already full.' };
    }

    // Check for duplicate team name or player already in this tournament
    const existingRegsSnap = await getDocs(
      query(collection(db, 'tournamentTeamRegistrations'), where('tournamentId', '==', tournament.id))
    );

    for (const docSnap of existingRegsSnap.docs) {
      const reg = docSnap.data() as TeamTournamentRegistration;
      if (reg.status !== 'CANCELLED' && reg.status !== 'REJECTED') {
        if (reg.teamNameLower === lowerName) {
          return { success: false, error: `A team named "${trimmedTeamName}" is already registered or pending in this tournament.` };
        }
        // Check if captain is already in an active slot
        const isCaptainInActiveSlot = reg.slots.some((s) => {
          if (s.playerId !== captain.uid) return false;
          if (
            s.status === 'EMPTY' ||
            s.playerStatus === 'EMPTY' ||
            s.status === 'REMOVED' ||
            s.playerStatus === 'REMOVED' ||
            s.status === 'DECLINED' ||
            s.playerStatus === 'DECLINED' ||
            s.status === 'CANCELLED' ||
            s.playerStatus === 'CANCELLED'
          ) {
            return false;
          }
          return (
            s.status === 'COMPLETED' ||
            s.status === 'ACCEPTED' ||
            s.status === 'INFORMATION_COMPLETE' ||
            isPlayerInvitationAccepted(s)
          );
        });
        if (isCaptainInActiveSlot) {
          return { success: false, error: 'You are already registered or part of another team in this tournament.' };
        }
      }
    }

    // Also check confirmed tournament participants
    if (tournament.participants.some((p) => p.status !== 'WITHDRAWN' && p.status !== 'DISQUALIFIED' && p.name.toLowerCase() === lowerName)) {
      return { success: false, error: `A confirmed team with name "${trimmedTeamName}" already exists in this tournament.` };
    }
    const captainMembership = await checkPlayerTournamentActiveMembership(tournament.id, captain.uid);
    if (captainMembership.isActive) {
      return { success: false, error: `You are already an official participant on a confirmed team in this tournament (${captainMembership.teamName || 'another team'}).` };
    }

    const regId = `treg_${tournament.id}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const now = Date.now();

    const slots: TeamTournamentPlayerSlot[] = [
      {
        slotNumber: 1,
        isCaptain: true,
        status: 'INFORMATION_COMPLETE',
        playerStatus: 'INFORMATION_COMPLETE',
        invitationStatus: 'ACCEPTED',
        playerId: captain.uid,
        gamerTag: captain.gamerTag,
        fullName: (captainFullName || captain.fullName || captain.gamerTag).trim(),
        inGameName: captainInGameName.trim(),
        phoneNumber: captainPhone.trim(),
        inGameRank: captainRank.trim(),
        acceptedAt: now,
        acceptedBy: captain.uid,
        informationCompletedAt: now,
        informationCompletedBy: captain.uid,
        confirmedByPlayer: true,
        informationConfirmed: true,
        completedAt: now,
      },
      { slotNumber: 2, isCaptain: false, status: 'EMPTY', playerStatus: 'EMPTY', invitationStatus: 'NONE' },
      { slotNumber: 3, isCaptain: false, status: 'EMPTY', playerStatus: 'EMPTY', invitationStatus: 'NONE' },
      { slotNumber: 4, isCaptain: false, status: 'EMPTY', playerStatus: 'EMPTY', invitationStatus: 'NONE' },
      { slotNumber: 5, isCaptain: false, status: 'EMPTY', playerStatus: 'EMPTY', invitationStatus: 'NONE' },
    ];

    const newReg: TeamTournamentRegistration = {
      id: regId,
      tournamentId: tournament.id,
      tournamentName: tournament.name,
      gameId: tournament.gameId,
      gameName: tournament.gameName,
      teamName: trimmedTeamName,
      teamNameLower: lowerName,
      teamTag: teamTag?.trim() || undefined,
      teamLogo: teamLogo?.trim() || '🛡️',
      captainId: captain.uid,
      captainGamerTag: captain.gamerTag,
      captainFullName: (captainFullName || captain.fullName || captain.gamerTag).trim(),
      captainPhone: captainPhone.trim(),
      slots,
      status: 'WAITING_FOR_PLAYERS',
      createdAt: now,
      updatedAt: now,
    };

    await setDoc(doc(db, 'tournamentTeamRegistrations', regId), sanitizeFirestoreData(newReg));
    return { success: true, registration: newReg };
  } catch (err: any) {
    console.error('Error creating team tournament registration:', err);
    return { success: false, error: err.message || 'Failed to create team tournament registration' };
  }
}

/**
 * Captain: Invite a player to a specific slot (2 - 5)
 */
export async function invitePlayerToTournamentTeam(params: {
  registrationId: string;
  slotNumber: 2 | 3 | 4 | 5;
  targetPlayer: Player;
  captainGamerTag: string;
}): Promise<{ success: boolean; error?: string }> {
  const { registrationId, slotNumber, targetPlayer, captainGamerTag } = params;
  
  // Extract recipient Firebase UID strictly
  const targetPlayerUid = targetPlayer?.uid || (targetPlayer as any)?.playerUid || (targetPlayer as any)?.id;
  if (!targetPlayerUid || typeof targetPlayerUid !== 'string' || !targetPlayerUid.trim()) {
    console.error('[INVITE DEBUG] Invalid target player account: missing Firebase UID', targetPlayer);
    return { success: false, error: 'Cannot invite player: Target user is missing a valid Firebase account UID.' };
  }

  try {
    let regRef = doc(db, 'tournamentTeamRegistrations', registrationId);
    let snap = await getDoc(regRef);

    // Fallback: Check if registrationId corresponds to a teamId or doc query
    if (!snap.exists()) {
      const q = query(
        collection(db, 'tournamentTeamRegistrations'),
        where('teamId', '==', registrationId)
      );
      const qSnap = await getDocs(q);
      if (!qSnap.empty) {
        snap = qSnap.docs[0];
        regRef = snap.ref;
      } else {
        console.error('[INVITE DEBUG] Registration room not found for ID:', registrationId);
        return { success: false, error: 'Team registration not found.' };
      }
    }

    const reg = snap.data() as TeamTournamentRegistration;
    if (reg.status === 'CANCELLED' || reg.status === 'REJECTED') {
      return { success: false, error: 'This team registration is no longer active.' };
    }

    // Ensure slot is not Slot 1 (Captain slot)
    if ((slotNumber as number) === 1) {
      return { success: false, error: 'Cannot invite to the captain slot.' };
    }

    // Do not allow captain to invite themselves
    if (targetPlayerUid === reg.captainId) {
      return { success: false, error: 'The team captain cannot invite themselves.' };
    }

    // 5 PLAYER LIMIT: active roster count + pending invitations must be <= 5
    const activeSlotsCount = reg.slots.filter(
      (s) => s.status !== 'EMPTY' && s.status !== 'REMOVED' && s.status !== 'DECLINED' && s.status !== 'CANCELLED'
    ).length;
    if (activeSlotsCount >= 5) {
      return { success: false, error: 'TEAM FULL — 5/5 PLAYERS' };
    }

    // Ensure player is not already occupying an active slot or duplicate active invitation on this team
    const isPlayerAlreadyActive = reg.slots.some((s) => {
      const isSamePlayer =
        s.playerId === targetPlayerUid ||
        s.invitedPlayerId === targetPlayerUid ||
        (s as any).recipientId === targetPlayerUid;
      const isActiveSlot =
        s.status !== 'EMPTY' &&
        s.status !== 'REMOVED' &&
        s.status !== 'DECLINED' &&
        s.status !== 'CANCELLED';
      return isSamePlayer && isActiveSlot;
    });

    if (isPlayerAlreadyActive) {
      return { success: false, error: `${targetPlayer.gamerTag || 'Player'} is already active or invited on this team roster.` };
    }

    // Check for duplicate pending invitation in teamInvitations
    try {
      const invQ = query(
        collection(db, 'teamInvitations'),
        where('teamId', '==', reg.id),
        where('recipientId', '==', targetPlayerUid),
        where('status', '==', 'PENDING')
      );
      const existingInvSnap = await getDocs(invQ);
      if (!existingInvSnap.empty) {
        return { success: false, error: 'A pending invitation has already been sent to this player.' };
      }
    } catch (invCheckErr) {
      console.warn('[INVITE DEBUG] Could not check existing invitations:', invCheckErr);
    }

    // Canonical check: is target player currently an active member of another confirmed/approved squad in this tournament?
    if (reg.tournamentId) {
      const membership = await checkPlayerTournamentActiveMembership(
        reg.tournamentId,
        targetPlayerUid,
        reg.id
      );

      if (membership.isActive) {
        return {
          success: false,
          error: `${targetPlayer.gamerTag || 'Player'} is already on a confirmed team in this tournament (${membership.teamName || 'another squad'}).`,
        };
      }

      // Check if target player already has a pending invitation to ANOTHER team in this tournament
      try {
        const otherInvQuery = query(
          collection(db, 'teamInvitations'),
          where('recipientId', '==', targetPlayerUid),
          where('status', '==', 'PENDING')
        );
        const otherInvSnap = await getDocs(otherInvQuery);
        for (const docSnap of otherInvSnap.docs) {
          const invData = docSnap.data();
          if (
            invData.tournamentId === reg.tournamentId &&
            invData.teamId !== reg.id &&
            normalizeInvitationStatus(invData.status) === 'PENDING'
          ) {
            return {
              success: false,
              error: `${targetPlayer.gamerTag || 'Player'} already has a pending invitation to join another squad in this tournament.`,
            };
          }
        }
      } catch (invErr) {
        console.warn('[INVITE DEBUG] Could not check other tournament invitations:', invErr);
      }
    }

    const updatedSlots = [...reg.slots];
    const targetSlotIndex = updatedSlots.findIndex((s) => s.slotNumber === slotNumber);
    if (targetSlotIndex === -1) return { success: false, error: 'Invalid slot selected.' };

    const targetSlot = updatedSlots[targetSlotIndex];
    if (
      targetSlot &&
      targetSlot.status !== 'EMPTY' &&
      targetSlot.status !== 'REMOVED' &&
      targetSlot.status !== 'DECLINED' &&
      targetSlot.status !== 'CANCELLED'
    ) {
      return { success: false, error: `Slot #${slotNumber} is already occupied or has a pending invitation.` };
    }

    const now = Date.now();
    const invitationId = `inv_tourn_${reg.id}_s${slotNumber}_${now}`;

    console.log('[INVITE DEBUG] Initiating Firebase invitation:', {
      captainUid: reg.captainId,
      selectedPlayerUid: targetPlayerUid,
      teamId: reg.id,
      tournamentId: reg.tournamentId,
      invitationId,
    });

    // 1. Create and persist invitation document FIRST with canonical PENDING status
    const invitationDoc: TeamInvitation = {
      id: invitationId,
      teamId: reg.id,
      teamName: reg.teamName,
      teamTag: reg.teamTag || '5v5',
      teamLogo: reg.teamLogo || '🛡️',
      gameId: reg.gameId,
      gameName: reg.gameName,
      game: reg.gameName,
      captainId: reg.captainId,
      captainGamerTag: captainGamerTag,
      senderId: reg.captainId,
      invitedPlayerId: targetPlayerUid,
      invitedGamerTag: targetPlayer.gamerTag,
      recipientId: targetPlayerUid,
      tournamentId: reg.tournamentId,
      tournamentName: reg.tournamentName,
      slotNumber,
      type: 'TEAM_TOURNAMENT_INVITATION',
      teamPath: 'tournamentTeamRegistrations',
      status: 'PENDING',
      createdAt: now,
      expiresAt: calculateInvitationExpiresAt(now),
      updatedAt: now,
    };

    await setDoc(doc(db, 'teamInvitations', invitationId), sanitizeFirestoreData(invitationDoc));
    console.log('[INVITE DEBUG] Firebase write result (invitation): SUCCESS', invitationId);

    // 2. Update team registration slot (with canonical INVITED status, playerStatus INVITED, invitationStatus PENDING)
    updatedSlots[targetSlotIndex] = {
      slotNumber,
      isCaptain: false,
      status: 'INVITED',
      playerStatus: 'INVITED',
      invitationStatus: 'PENDING',
      playerId: targetPlayerUid,
      invitedPlayerId: targetPlayerUid,
      recipientId: targetPlayerUid,
      gamerTag: targetPlayer.gamerTag,
      invitedGamerTag: targetPlayer.gamerTag,
      invitationId,
      invitedAt: now,
      expiresAt: calculateInvitationExpiresAt(now),
      acceptedAt: undefined,
      acceptedBy: undefined,
      fullName: undefined,
      phoneNumber: undefined,
      inGameName: undefined,
      inGameRank: undefined,
      informationCompletedAt: undefined,
      informationCompletedBy: undefined,
      confirmedByPlayer: false,
      informationConfirmed: false,
      removedAt: undefined,
      removedBy: undefined,
      removedPlayerId: undefined,
      removedPlayerGamerTag: undefined,
    };

    await updateDoc(regRef, sanitizeFirestoreData({
      slots: updatedSlots,
      updatedAt: now,
    }));
    console.log('[INVITE DEBUG] Firebase write result (team roster slot): SUCCESS for slot', slotNumber);

    // 3. Send in-app notification with verified identifiers
    await sendNotification({
      userId: targetPlayerUid,
      type: 'TEAM_TOURNAMENT_INVITATION',
      title: '🏆 TEAM INVITATION',
      message: `You have been invited by ${captainGamerTag} to join team "${reg.teamName}" for the "${reg.tournamentName}" 5v5 tournament!`,
      status: 'PENDING',
      expiresAt: calculateInvitationExpiresAt(now),
      data: {
        type: 'TEAM_TOURNAMENT_INVITATION',
        invitationId,
        teamId: reg.id,
        tournamentId: reg.tournamentId,
        recipientId: targetPlayerUid,
        captainId: reg.captainId,
        teamName: reg.teamName,
        tournamentName: reg.tournamentName,
        expiresAt: calculateInvitationExpiresAt(now),
        game: reg.gameName,
        slotNumber,
        teamPath: 'tournamentTeamRegistrations',
      },
    });
    console.log('[INVITE DEBUG] Notification sent to recipient:', targetPlayerUid);

    return { success: true };
  } catch (err: any) {
    console.error('[INVITE DEBUG] Error creating invitation:', {
      captainUid: captainGamerTag,
      selectedPlayerUid: targetPlayerUid,
      registrationId,
      errorCode: err.code,
      errorMessage: err.message,
      errorStack: err.stack,
    });
    return { success: false, error: err.message || 'Failed to invite player' };
  }
}

export interface TournamentInvitationDetailsResult {
  success: boolean;
  error?: string;
  isExpired?: boolean;
  isAlreadyAccepted?: boolean;
  isAlreadyCompleted?: boolean;
  isAcceptedAwaitingInfo?: boolean;
  invitation?: TeamInvitation;
  team?: TeamTournamentRegistration;
  tournament?: Tournament;
  slot?: TeamTournamentPlayerSlot;
}

/**
 * Audit and load tournament team invitation details
 * Strict validation with descriptive error messages
 */
export async function getTournamentTeamInvitationDetails(params: {
  invitationId?: string;
  teamId?: string;
  tournamentId?: string;
  currentUserId?: string;
  currentUserGamerTag?: string;
}): Promise<TournamentInvitationDetailsResult> {
  try {
    const { invitationId, teamId, tournamentId, currentUserId, currentUserGamerTag } = params;

    if (!invitationId && !teamId) {
      return { success: false, error: 'Invitation not found: No invitation or team ID provided.' };
    }

    let invitation: TeamInvitation | null = null;
    let resolvedTeamId = teamId || '';
    let resolvedTournamentId = tournamentId || '';
    let resolvedSlotNumber: number | undefined;

    // 1. Check if invitation document exists in teamInvitations
    if (invitationId) {
      const invRef = doc(db, 'teamInvitations', invitationId);
      const invSnap = await getDoc(invRef);
      if (invSnap.exists()) {
        invitation = invSnap.data() as TeamInvitation;
        resolvedTeamId = invitation.teamId || resolvedTeamId;
        resolvedTournamentId = invitation.tournamentId || resolvedTournamentId;
        resolvedSlotNumber = invitation.slotNumber;
      } else {
        // Fallback for legacy invitations where invitationId might be "${reg.id}_slot_${slotNumber}"
        if (invitationId.includes('_slot_')) {
          const parts = invitationId.split('_slot_');
          resolvedTeamId = resolvedTeamId || parts[0];
          const parsedSlot = parseInt(parts[1], 10);
          if (!isNaN(parsedSlot)) resolvedSlotNumber = parsedSlot;
        } else if (!resolvedTeamId) {
          resolvedTeamId = invitationId;
        }
      }
    }

    // 2. Load the team document using the actual unique teamId
    if (!resolvedTeamId) {
      return { success: false, error: 'Team registration was removed.' };
    }

    const regRef = doc(db, 'tournamentTeamRegistrations', resolvedTeamId);
    const regSnap = await getDoc(regRef);

    if (!regSnap.exists()) {
      return { success: false, error: 'Team registration was removed.' };
    }

    const team = regSnap.data() as TeamTournamentRegistration;

    if (team.status === 'CANCELLED' || team.status === 'REJECTED') {
      return { success: false, isExpired: true, error: 'This team registration is no longer active.' };
    }

    resolvedTournamentId = resolvedTournamentId || team.tournamentId;

    // 3. Load tournament document
    const tRef = doc(db, 'tournaments', resolvedTournamentId);
    const tSnap = await getDoc(tRef);
    if (!tSnap.exists()) {
      return { success: false, error: 'Tournament not found.' };
    }
    const tournament = tSnap.data() as Tournament;

    // 4. Find the relevant slot for the current user
    let slot = team.slots.find((s) => {
      if (resolvedSlotNumber && s.slotNumber === resolvedSlotNumber) return true;
      if (currentUserId && s.playerId === currentUserId) return true;
      if (currentUserGamerTag && s.invitedGamerTag && s.invitedGamerTag.toLowerCase() === currentUserGamerTag.toLowerCase()) return true;
      return false;
    });

    // If slot not matched, find first invited slot matching player or gamerTag
    if (!slot && currentUserId) {
      slot = team.slots.find((s) => s.playerId === currentUserId);
    }
    if (!slot && currentUserGamerTag) {
      slot = team.slots.find((s) => s.invitedGamerTag && s.invitedGamerTag.toLowerCase() === currentUserGamerTag.toLowerCase());
    }

    // 5. Build or ensure invitation object if not loaded from collection
    if (!invitation) {
      invitation = {
        id: invitationId || `inv_tourn_${team.id}_s${slot?.slotNumber || 2}`,
        teamId: team.id,
        teamName: team.teamName,
        teamTag: team.teamTag || '5v5',
        teamLogo: team.teamLogo || '🛡️',
        gameId: team.gameId,
        gameName: team.gameName,
        game: team.gameName,
        captainId: team.captainId,
        captainGamerTag: team.captainGamerTag,
        invitedPlayerId: currentUserId || slot?.playerId || '',
        invitedGamerTag: currentUserGamerTag || slot?.invitedGamerTag || slot?.gamerTag || '',
        recipientId: currentUserId || slot?.playerId || '',
        tournamentId: team.tournamentId,
        tournamentName: team.tournamentName,
        slotNumber: slot?.slotNumber,
        type: 'TEAM_TOURNAMENT_INVITATION',
        teamPath: 'tournamentTeamRegistrations',
        status: slot?.status === 'COMPLETED' ? 'accepted' : 'pending',
        createdAt: slot?.invitedAt || team.createdAt,
        updatedAt: team.updatedAt,
      };
    }

    // 6. Verify recipient: The current user must be the intended player
    if (currentUserId) {
      const isRecipient =
        (invitation.recipientId && invitation.recipientId === currentUserId) ||
        (invitation.invitedPlayerId && invitation.invitedPlayerId === currentUserId) ||
        team.slots.some((s) => s.playerId === currentUserId) ||
        (currentUserGamerTag && team.slots.some((s) => s.invitedGamerTag && s.invitedGamerTag.toLowerCase() === currentUserGamerTag.toLowerCase()));

      if (!isRecipient) {
        return { success: false, error: 'This invitation belongs to another user.' };
      }
    }

    // 7. Check if invitation is still active or expired
    if (invitation && (invitation.status === 'declined' || invitation.status === 'DECLINED')) {
      return { success: false, isExpired: true, error: 'This invitation has already been declined.' };
    }
    if (invitation && (invitation.status === 'cancelled' || invitation.status === 'CANCELLED')) {
      return { success: false, isExpired: true, error: 'This invitation was cancelled by the team captain.' };
    }
    if (invitation && (invitation.status === 'expired' || invitation.status === 'EXPIRED')) {
      return { success: false, isExpired: true, error: '⏱ INVITATION EXPIRED: This invitation has expired after 15 minutes.' };
    }

    // Check if slot was cancelled or freed to empty
    if (slot && (slot.status === 'EMPTY' || slot.playerStatus === 'EMPTY') && (!currentUserId || slot.playerId !== currentUserId)) {
      return { success: false, isExpired: true, error: 'This invitation was cancelled by the team captain or the slot is no longer reserved.' };
    }
    if (slot && (slot.status === 'REMOVED' || slot.playerStatus === 'REMOVED')) {
      return { success: false, isExpired: true, error: 'This roster slot was removed by the team captain.' };
    }

    const isCompleted = !!(
      slot &&
      (slot.status === 'COMPLETED' || slot.playerStatus === 'INFORMATION_COMPLETE') &&
      currentUserId &&
      slot.playerId === currentUserId
    );

    const isAcceptedAwaitingInfo = !!(
      slot &&
      (slot.status === 'ACCEPTED_INVITATION' || slot.playerStatus === 'PROFILE_INFORMATION_INCOMPLETE' || invitation?.status === 'accepted') &&
      !isCompleted
    );

    const now = Date.now();
    const invExpiresAt = invitation?.expiresAt || (invitation?.createdAt ? invitation.createdAt + INVITATION_EXPIRATION_MS : slot?.expiresAt);
    if (invExpiresAt && now >= invExpiresAt && !isCompleted && !isAcceptedAwaitingInfo) {
      return { success: false, isExpired: true, error: '⏱ INVITATION EXPIRED: This invitation has expired after 15 minutes.' };
    }

    if (slot && (slot.status === 'COMPLETED' || slot.playerStatus === 'INFORMATION_COMPLETE') && currentUserId && slot.playerId !== currentUserId) {
      return { success: false, isExpired: true, error: 'This player slot has already been taken by another teammate.' };
    }

    if (tournament.status === 'COMPLETED' || tournament.status === 'CANCELLED') {
      return { success: false, isExpired: true, error: 'This tournament is already concluded or cancelled.' };
    }

    return {
      success: true,
      isAlreadyAccepted: isCompleted || isAcceptedAwaitingInfo,
      isAlreadyCompleted: isCompleted,
      isAcceptedAwaitingInfo,
      invitation,
      team,
      tournament,
      slot,
    };
  } catch (err: any) {
    console.error('Error in getTournamentTeamInvitationDetails:', err);
    return { success: false, error: err.message || 'Failed to load tournament invitation' };
  }
}

/**
 * Accept a team tournament invitation and complete player slot
 */
export async function acceptTournamentTeamInvitation(params: {
  invitationId?: string;
  teamId: string;
  tournamentId: string;
  player: Player;
  inGameName: string;
  phoneNumber: string;
  inGameRank: string;
  fullName?: string;
  slotNumber?: 1 | 2 | 3 | 4 | 5;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { invitationId, teamId, player, inGameName, phoneNumber, inGameRank, fullName, slotNumber } = params;

    if (!player || !player.uid) {
      return { success: false, error: 'User must be authenticated.' };
    }

    if (!inGameName || !inGameName.trim()) {
      return { success: false, error: 'In-Game Name is required.' };
    }

    if (!phoneNumber || !phoneNumber.trim()) {
      return { success: false, error: 'Contact phone number is required.' };
    }

    const phoneValidation = validatePhoneNumber(phoneNumber);
    if (!phoneValidation.valid) {
      return { success: false, error: phoneValidation.error || 'Invalid phone number format.' };
    }

    // 1. Verify team still exists
    const regRef = doc(db, 'tournamentTeamRegistrations', teamId);
    const snap = await getDoc(regRef);
    if (!snap.exists()) {
      return { success: false, error: 'Team registration was removed.' };
    }

    const reg = snap.data() as TeamTournamentRegistration;
    if (reg.status === 'CANCELLED' || reg.status === 'REJECTED') {
      return { success: false, error: 'This team registration is no longer active.' };
    }

    // 2. Verify player is not already an active member of another team in this tournament
    const membership = await checkPlayerTournamentActiveMembership(reg.tournamentId, player.uid, reg.id);
    if (membership.isActive) {
      return { success: false, error: `You are already officially registered on confirmed team "${membership.teamName || 'another team'}" in this tournament.` };
    }

    // 3. Find and update slot
    const updatedSlots = [...reg.slots];
    let targetIndex = -1;
    if (slotNumber) {
      targetIndex = updatedSlots.findIndex((s) => s.slotNumber === slotNumber);
    }
    if (targetIndex === -1) {
      targetIndex = updatedSlots.findIndex((s) => s.playerId === player.uid || s.invitedPlayerId === player.uid || s.recipientId === player.uid);
    }
    if (targetIndex === -1) {
      targetIndex = updatedSlots.findIndex((s) => s.invitedGamerTag && s.invitedGamerTag.toLowerCase() === player.gamerTag.toLowerCase());
    }

    if (targetIndex === -1) {
      return { success: false, error: 'This invitation has been cancelled by the team captain or is no longer available.' };
    }

    const currentSlot = updatedSlots[targetIndex];
    if (currentSlot.status === 'EMPTY' || currentSlot.playerStatus === 'EMPTY' || currentSlot.status === 'REMOVED' || currentSlot.playerStatus === 'REMOVED' || currentSlot.status === 'DECLINED') {
      return { success: false, error: 'This invitation has been cancelled by the team captain or the slot is no longer reserved.' };
    }

    const checkNow = Date.now();
    const slotExpiresAt = currentSlot.expiresAt || (currentSlot.invitedAt ? currentSlot.invitedAt + INVITATION_EXPIRATION_MS : 0);
    if (slotExpiresAt && checkNow >= slotExpiresAt && currentSlot.status !== 'COMPLETED' && currentSlot.status !== 'INFORMATION_COMPLETE') {
      return { success: false, error: '⏱ INVITATION EXPIRED: This invitation has expired after 15 minutes.' };
    }

    // Check invitation document status in teamInvitations
    if (invitationId) {
      try {
        const invRef = doc(db, 'teamInvitations', invitationId);
        const invSnap = await getDoc(invRef);
        if (invSnap.exists()) {
          const invData = invSnap.data() as TeamInvitation;
          if (normalizeInvitationStatus(invData.status) === 'CANCELLED') {
            return { success: false, error: 'This invitation has been cancelled by the team captain.' };
          }
          if (normalizeInvitationStatus(invData.status) === 'EXPIRED') {
            return { success: false, error: '⏱ INVITATION EXPIRED: This invitation has expired after 15 minutes.' };
          }
          const invExp = invData.expiresAt || (invData.createdAt ? invData.createdAt + INVITATION_EXPIRATION_MS : 0);
          if (invExp && checkNow >= invExp && currentSlot.status !== 'COMPLETED' && currentSlot.status !== 'INFORMATION_COMPLETE') {
            await updateDoc(invRef, { status: 'EXPIRED', expiredAt: checkNow, updatedAt: checkNow });
            return { success: false, error: '⏱ INVITATION EXPIRED: This invitation has expired after 15 minutes.' };
          }
        }
      } catch (err) {
        console.warn('Could not read invitation status during accept:', err);
      }
    }

    // Security check: Captain cannot accept invitations on behalf of teammates
    if (reg.captainId === player.uid && !currentSlot.isCaptain) {
      return { success: false, error: 'Team captains cannot accept invitations on behalf of teammates.' };
    }
    // Security check: Only the designated invited player can accept
    const targetUid = currentSlot.invitedPlayerId || currentSlot.playerId;
    if (!currentSlot.isCaptain && targetUid && targetUid !== player.uid) {
      return { success: false, error: 'You are not the invited player for this slot.' };
    }

    if (currentSlot.playerId && currentSlot.playerId !== player.uid && (currentSlot.status === 'COMPLETED' || currentSlot.status === 'INFORMATION_COMPLETE')) {
      return { success: false, error: 'This slot is already completed by another teammate.' };
    }

    const now = Date.now();
    updatedSlots[targetIndex] = {
      ...currentSlot,
      status: 'INFORMATION_COMPLETE',
      playerStatus: 'INFORMATION_COMPLETE',
      invitationStatus: 'ACCEPTED',
      playerId: player.uid,
      recipientId: player.uid,
      gamerTag: player.gamerTag,
      fullName: (fullName || player.fullName || player.gamerTag).trim(),
      inGameName: inGameName.trim(),
      phoneNumber: phoneNumber.trim(),
      inGameRank: inGameRank.trim() || 'Unranked',
      acceptedAt: currentSlot.acceptedAt || now,
      acceptedBy: player.uid,
      informationCompletedAt: now,
      informationCompletedBy: player.uid,
      confirmedByPlayer: true,
      informationConfirmed: true,
      presenceStatus: currentSlot.presenceStatus || 'NOT_CONFIRMED',
      completedAt: now,
    };

    const completedCount = countCompletedDistinctPlayers(updatedSlots);
    const allCompleted = completedCount === 5;
    const newStatus: TeamRegistrationStatus = allCompleted ? 'READY_TO_SUBMIT' : 'WAITING_FOR_PLAYERS';
    const updatedMemberIds = Array.from(new Set([...(reg.memberIds || []), player.uid]));

    await updateDoc(regRef, sanitizeFirestoreData({
      slots: updatedSlots,
      memberIds: updatedMemberIds,
      status: newStatus,
      updatedAt: now,
    }));

    // 4. Update teamInvitations document if exists
    if (invitationId) {
      try {
        const invRef = doc(db, 'teamInvitations', invitationId);
        const invSnap = await getDoc(invRef);
        if (invSnap.exists()) {
          await updateDoc(invRef, {
            status: 'ACCEPTED',
            acceptedBy: player.uid,
            recipientId: player.uid,
            respondedAt: now,
            updatedAt: now,
          });
        }
      } catch (e) {
        console.warn('Could not update invitation doc:', e);
      }
    }

    // 5. Notify captain that player accepted
    await sendNotification({
      userId: reg.captainId,
      type: 'TOURNAMENT_TEAM_INVITE_ACCEPTED',
      title: '✓ TOURNAMENT INVITATION ACCEPTED',
      message: `${player.gamerTag} has accepted your invitation and completed their slot for team "${reg.teamName}" in "${reg.tournamentName}"!`,
      data: {
        teamId: reg.id,
        teamName: reg.teamName,
        tournamentId: reg.tournamentId,
        tournamentName: reg.tournamentName,
        slotNumber: updatedSlots[targetIndex].slotNumber,
      },
    });

    if (allCompleted) {
      await sendNotification({
        userId: reg.captainId,
        type: 'TOURNAMENT_TEAM_READY',
        title: '✓ ALL 5 SQUAD MEMBERS READY!',
        message: `All 5 player slots for "${reg.teamName}" are now completed! You can now submit the registration for Admin review.`,
        data: { teamId: reg.id, teamName: reg.teamName, tournamentId: reg.tournamentId },
      });
    }

    return { success: true };
  } catch (err: any) {
    console.error('Error accepting tournament team invitation:', err);
    return { success: false, error: err.message || 'Failed to accept invitation' };
  }
}

/**
 * Step 1: Invited player clicks "ACCEPT INVITATION".
 * Transitions player slot to ACCEPTED_INVITATION / PROFILE_INFORMATION_INCOMPLETE.
 * Player is NOT counted as complete until they provide full details and confirm.
 */
export async function playerAcceptInvitationPrompt(params: {
  invitationId?: string;
  teamId: string;
  player: Player;
  slotNumber?: number;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { invitationId, teamId, player, slotNumber } = params;
    const now = Date.now();

    const regRef = doc(db, 'tournamentTeamRegistrations', teamId);
    const invRef = invitationId ? doc(db, 'teamInvitations', invitationId) : null;

    let captainIdToNotify = '';
    let teamNameToNotify = '';
    let tournamentIdToNotify = '';
    let tournamentNameToNotify = '';

    await runTransaction(db, async (transaction) => {
      const regSnap = await transaction.get(regRef);
      if (!regSnap.exists()) {
        throw new Error('Team registration not found.');
      }

      const reg = regSnap.data() as TeamTournamentRegistration;
      if (reg.status === 'CANCELLED' || reg.status === 'REJECTED') {
        throw new Error('This team registration is no longer active.');
      }

      captainIdToNotify = reg.captainId;
      teamNameToNotify = reg.teamName;
      tournamentIdToNotify = reg.tournamentId;
      tournamentNameToNotify = reg.tournamentName;

      let invSnap = invRef ? await transaction.get(invRef) : null;
      if (invSnap?.exists()) {
        const invData = invSnap.data() as TeamInvitation;
        const normalizedStatus = normalizeInvitationStatus(invData.status);
        if (normalizedStatus === 'CANCELLED') {
          throw new Error('This invitation has been cancelled by the team captain.');
        }
        if (normalizedStatus === 'DECLINED') {
          throw new Error('This invitation has already been declined.');
        }
        if (normalizedStatus === 'EXPIRED') {
          throw new Error('⏱ INVITATION EXPIRED: This invitation has expired after 15 minutes.');
        }
        const txExpiresAt = invData.expiresAt || (invData.createdAt ? invData.createdAt + INVITATION_EXPIRATION_MS : 0);
        if (txExpiresAt && now >= txExpiresAt) {
          transaction.update(invRef!, {
            status: 'EXPIRED',
            expiredAt: now,
            updatedAt: now,
          });
          throw new Error('⏱ INVITATION EXPIRED: This invitation has expired after 15 minutes.');
        }
      }

      const updatedSlots = [...reg.slots];
      let targetIndex = -1;
      if (slotNumber) {
        targetIndex = updatedSlots.findIndex((s) => s.slotNumber === slotNumber);
      }
      if (targetIndex === -1) {
        targetIndex = updatedSlots.findIndex((s) => s.playerId === player.uid || s.invitedPlayerId === player.uid || s.recipientId === player.uid);
      }
      if (targetIndex === -1) {
        targetIndex = updatedSlots.findIndex((s) => s.invitedGamerTag && s.invitedGamerTag.toLowerCase() === player.gamerTag.toLowerCase());
      }

      if (targetIndex === -1) {
        throw new Error('This invitation has been cancelled or is no longer available.');
      }

      const currentSlot = updatedSlots[targetIndex];

      const slotExpiresAt = currentSlot.expiresAt || (currentSlot.invitedAt ? currentSlot.invitedAt + INVITATION_EXPIRATION_MS : 0);
      if (slotExpiresAt && now >= slotExpiresAt && currentSlot.status !== 'COMPLETED' && currentSlot.status !== 'INFORMATION_COMPLETE') {
        throw new Error('⏱ INVITATION EXPIRED: This invitation has expired after 15 minutes.');
      }

      // Security check: Captain cannot accept invitations on behalf of teammates
      if (reg.captainId === player.uid && !currentSlot.isCaptain) {
        throw new Error('Team captains cannot accept invitations on behalf of teammates.');
      }

      // If slot has been emptied or removed or cancelled, cannot accept
      if (currentSlot.status === 'EMPTY' || currentSlot.playerStatus === 'EMPTY' || currentSlot.status === 'REMOVED' || currentSlot.playerStatus === 'REMOVED' || currentSlot.status === 'DECLINED') {
        throw new Error('This invitation has been cancelled by the team captain or is no longer available.');
      }

      // Security check: Only the designated invited player can accept
      const targetUid = currentSlot.invitedPlayerId || currentSlot.playerId || currentSlot.recipientId;
      if (!currentSlot.isCaptain && targetUid && targetUid !== player.uid) {
        throw new Error('You are not the invited player for this slot.');
      }

      // Only set to ACCEPTED if not already complete
      if (currentSlot.status !== 'COMPLETED' && currentSlot.status !== 'INFORMATION_COMPLETE') {
        updatedSlots[targetIndex] = {
          ...currentSlot,
          status: 'ACCEPTED',
          playerStatus: 'INFORMATION_INCOMPLETE',
          invitationStatus: 'ACCEPTED',
          playerId: player.uid,
          recipientId: player.uid,
          gamerTag: player.gamerTag,
          acceptedAt: now,
          acceptedBy: player.uid,
        };

        const updatedMemberIds = Array.from(new Set([...(reg.memberIds || []), player.uid]));

        transaction.update(regRef, sanitizeFirestoreData({
          slots: updatedSlots,
          memberIds: updatedMemberIds,
          updatedAt: now,
        }));
      }

      if (invRef && invSnap?.exists()) {
        transaction.update(invRef, {
          status: 'ACCEPTED',
          acceptedBy: player.uid,
          recipientId: player.uid,
          respondedAt: now,
          updatedAt: now,
        });
      }
    });

    // Notify captain that player accepted and needs to fill info
    if (captainIdToNotify) {
      await sendNotification({
        userId: captainIdToNotify,
        type: 'TOURNAMENT_TEAM_INVITE_ACCEPTED',
        title: '✅ PLAYER ACCEPTED INVITATION',
        message: `${player.gamerTag} accepted the invite for "${teamNameToNotify}" and is now filling in their required tournament details.`,
        data: {
          teamId,
          teamName: teamNameToNotify,
          tournamentId: tournamentIdToNotify,
          tournamentName: tournamentNameToNotify,
        },
      });
    }

    return { success: true };
  } catch (err: any) {
    console.error('Error in playerAcceptInvitationPrompt:', err);
    return { success: false, error: err.message || 'Failed to accept invitation prompt' };
  }
}

/**
 * Decline a team tournament invitation
 */
export async function declineTournamentTeamInvitation(params: {
  invitationId?: string;
  teamId: string;
  player: Player;
  reason?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { invitationId, teamId, player } = params;
    const now = Date.now();

    // 1. Update invitation document
    if (invitationId) {
      try {
        const invRef = doc(db, 'teamInvitations', invitationId);
        const invSnap = await getDoc(invRef);
        if (invSnap.exists()) {
          await updateDoc(invRef, {
            status: 'declined',
            respondedAt: now,
            updatedAt: now,
          });
        }
      } catch (e) {
        console.warn('Could not update invitation doc:', e);
      }
    }

    // 2. Clear slot in team registration
    const regRef = doc(db, 'tournamentTeamRegistrations', teamId);
    const snap = await getDoc(regRef);
    if (snap.exists()) {
      const reg = snap.data() as TeamTournamentRegistration;
      const updatedSlots = reg.slots.map((s) => {
        if (s.playerId === player.uid || (s.invitedGamerTag && s.invitedGamerTag.toLowerCase() === player.gamerTag.toLowerCase())) {
          return {
            slotNumber: s.slotNumber,
            isCaptain: false,
            status: 'EMPTY' as const,
          };
        }
        return s;
      });

      await updateDoc(regRef, sanitizeFirestoreData({
        slots: updatedSlots,
        status: 'WAITING_FOR_PLAYERS',
        updatedAt: now,
      }));

      // 3. Notify captain
      await sendNotification({
        userId: reg.captainId,
        type: 'TOURNAMENT_TEAM_INVITE_DECLINED',
        title: '✕ TOURNAMENT INVITATION DECLINED',
        message: `${player.gamerTag} declined the invitation to join team "${reg.teamName}" for "${reg.tournamentName}".`,
        data: {
          teamId: reg.id,
          teamName: reg.teamName,
          tournamentId: reg.tournamentId,
          tournamentName: reg.tournamentName,
        },
      });
    }

    return { success: true };
  } catch (err: any) {
    console.error('Error declining tournament team invitation:', err);
    return { success: false, error: err.message || 'Failed to decline invitation' };
  }
}

/**
 * Player: Fill or complete their own slot in the team registration room
 */
export async function completeTournamentPlayerSlot(params: {
  registrationId: string;
  player: Player;
  inGameName: string;
  phoneNumber: string;
  inGameRank: string;
  fullName?: string;
  slotNumber?: 1 | 2 | 3 | 4 | 5;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { registrationId, player, inGameName, phoneNumber, inGameRank, fullName, slotNumber } = params;

    const phoneVal = validatePhoneNumber(phoneNumber);
    if (!phoneVal.valid) {
      return { success: false, error: phoneVal.error };
    }

    if (!inGameName || !inGameName.trim()) {
      return { success: false, error: 'In-game name is strictly required.' };
    }

    if (!inGameRank || !inGameRank.trim()) {
      return { success: false, error: 'In-game rank is strictly required.' };
    }

    const regRef = doc(db, 'tournamentTeamRegistrations', registrationId);
    const snap = await getDoc(regRef);
    if (!snap.exists()) return { success: false, error: 'Tournament team registration not found.' };

    const reg = snap.data() as TeamTournamentRegistration;
    if (reg.status === 'CANCELLED' || reg.status === 'REJECTED') {
      return { success: false, error: 'This team registration is no longer active.' };
    }

    const updatedSlots = [...reg.slots];

    // Find the slot for this player
    let targetIndex = -1;
    if (slotNumber) {
      targetIndex = updatedSlots.findIndex((s) => s.slotNumber === slotNumber);
    } else {
      // Find where player is invited or already joined
      targetIndex = updatedSlots.findIndex((s) => s.playerId === player.uid);
      if (targetIndex === -1) {
        // Find first empty slot (2 - 5)
        targetIndex = updatedSlots.findIndex((s) => !s.isCaptain && s.status === 'EMPTY');
      }
    }

    if (targetIndex === -1) {
      return { success: false, error: 'No available slot found for your registration.' };
    }

    const currentSlot = updatedSlots[targetIndex];

    // Security check: Captain cannot complete slots for teammates. Each player must complete their own slot.
    if (currentSlot.isCaptain) {
      if (player.uid !== reg.captainId) {
        return { success: false, error: 'Only the team captain can complete the captain slot.' };
      }
    } else {
      if (reg.captainId === player.uid) {
        return { success: false, error: 'Team captains cannot complete or confirm information on behalf of other players.' };
      }
      if (currentSlot.playerId && currentSlot.playerId !== player.uid) {
        return { success: false, error: 'You can only complete your own player slot.' };
      }
      if (currentSlot.invitedPlayerId && currentSlot.invitedPlayerId !== player.uid) {
        return { success: false, error: 'You can only complete your own player slot.' };
      }
    }

    const now = Date.now();
    updatedSlots[targetIndex] = {
      ...currentSlot,
      status: 'INFORMATION_COMPLETE',
      playerStatus: 'INFORMATION_COMPLETE',
      invitationStatus: 'ACCEPTED',
      playerId: player.uid,
      gamerTag: player.gamerTag,
      fullName: (fullName || player.fullName || currentSlot.fullName || player.gamerTag).trim(),
      inGameName: inGameName.trim(),
      phoneNumber: phoneNumber.trim(),
      inGameRank: inGameRank.trim(),
      acceptedAt: currentSlot.acceptedAt || now,
      acceptedBy: player.uid,
      informationCompletedAt: now,
      informationCompletedBy: player.uid,
      confirmedByPlayer: true,
      informationConfirmed: true,
      presenceStatus: currentSlot.presenceStatus || 'NOT_CONFIRMED',
      completedAt: now,
    };

    // Strict 5v5 completion check: 5 distinct accounts personally accepted & completed
    const completedCount = countCompletedDistinctPlayers(updatedSlots);
    const allCompleted = completedCount === 5;
    const newStatus: TeamRegistrationStatus = allCompleted ? 'READY_TO_SUBMIT' : 'WAITING_FOR_PLAYERS';

    await updateDoc(regRef, sanitizeFirestoreData({
      slots: updatedSlots,
      status: newStatus,
      updatedAt: now,
    }));

    // If ready to submit, alert captain
    if (allCompleted) {
      await sendNotification({
        userId: reg.captainId,
        type: 'TOURNAMENT_TEAM_READY',
        title: '✓ ALL 5 SQUAD MEMBERS READY!',
        message: `All 5 player slots for "${reg.teamName}" are now completed! You can now submit the registration for Admin review.`,
        data: { teamId: reg.id, teamName: reg.teamName },
      });
    }

    return { success: true };
  } catch (err: any) {
    console.error('Error completing tournament player slot:', err);
    return { success: false, error: err.message || 'Failed to update player information' };
  }
}

/**
 * Remove or clear a player from a slot.
 * Transitions slot to REMOVED state, records removal audit history in removedMembers,
 * cleans up memberIds, and allows captain to invite a replacement.
 */
export async function removePlayerFromTeamSlot(
  registrationId: string,
  slotNumber: 2 | 3 | 4 | 5,
  requesterId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const regRef = doc(db, 'tournamentTeamRegistrations', registrationId);
    const snap = await getDoc(regRef);
    if (!snap.exists()) return { success: false, error: 'Registration room not found.' };

    const reg = snap.data() as TeamTournamentRegistration;
    if (reg.captainId !== requesterId && !reg.slots.some((s) => s.slotNumber === slotNumber && s.playerId === requesterId)) {
      return { success: false, error: 'Unauthorized to modify this slot.' };
    }

    const targetSlot = reg.slots.find((s) => s.slotNumber === slotNumber);

    const now = Date.now();
    const removedPlayerId = targetSlot?.playerId || targetSlot?.invitedPlayerId;
    const removedGamerTag = targetSlot?.gamerTag || targetSlot?.invitedGamerTag;

    // Build removed member audit record
    const removedEntry = removedPlayerId
      ? {
          playerId: removedPlayerId,
          gamerTag: removedGamerTag || 'Player',
          slotNumber,
          removedAt: now,
          removedBy: requesterId,
        }
      : null;

    const updatedRemovedMembers = [...(reg.removedMembers || [])];
    if (removedEntry) {
      updatedRemovedMembers.push(removedEntry);
    }

    // Cancel any associated pending invitation document
    if (targetSlot?.invitationId) {
      try {
        const invRef = doc(db, 'teamInvitations', targetSlot.invitationId);
        await updateDoc(invRef, {
          status: 'CANCELLED',
          updatedAt: now,
          cancelledAt: now,
          cancelledBy: requesterId,
        });
      } catch (invErr) {
        console.warn('Could not cancel invitation doc during slot removal:', invErr);
      }
    }

    // Remove from memberIds if present
    const updatedMemberIds = (reg.memberIds || []).filter((id) => id !== removedPlayerId);

    // Update slot to REMOVED state so the captain can clearly see the transition and invite a replacement
    const updatedSlots = reg.slots.map((s) => {
      if (s.slotNumber === slotNumber) {
        return {
          slotNumber,
          isCaptain: false,
          status: 'REMOVED' as const,
          playerStatus: 'REMOVED' as const,
          invitationStatus: 'CANCELLED' as const,
          removedAt: now,
          removedBy: requesterId,
          removedPlayerId: removedPlayerId || undefined,
          removedPlayerGamerTag: removedGamerTag || undefined,
        };
      }
      return s;
    });

    const nextStatus = reg.status === 'CONFIRMED' ? 'CONFIRMED' : 'WAITING_FOR_PLAYERS';

    await updateDoc(regRef, sanitizeFirestoreData({
      slots: updatedSlots,
      memberIds: updatedMemberIds,
      removedMembers: updatedRemovedMembers,
      status: nextStatus,
      submittedAt: reg.status === 'PENDING_ADMIN_APPROVAL' ? null : (reg.submittedAt || null),
      submittedBy: reg.status === 'PENDING_ADMIN_APPROVAL' ? null : (reg.submittedBy || null),
      updatedAt: now,
    }));

    // Synchronize tournament doc participants if this team was already registered/confirmed
    if (reg.tournamentId && removedPlayerId) {
      try {
        const tRef = doc(db, 'tournaments', reg.tournamentId);
        const tSnap = await getDoc(tRef);
        if (tSnap.exists()) {
          const tData = tSnap.data() as Tournament;
          const participants = [...(tData.participants || [])];
          const pIdx = participants.findIndex((p) => p.id === reg.id);
          if (pIdx !== -1) {
            const teamParticipant = { ...participants[pIdx] };
            const updatedMembers = (teamParticipant.teamMembers || []).filter(
              (m) => m.uid !== removedPlayerId
            );
            const updatedMemberIds = (teamParticipant.teamMemberIds || []).filter(
              (id) => id !== removedPlayerId
            );
            teamParticipant.teamMembers = updatedMembers;
            teamParticipant.teamMemberIds = updatedMemberIds;
            teamParticipant.status = updatedMembers.length < 5 ? 'INCOMPLETE' : teamParticipant.status;
            participants[pIdx] = teamParticipant;

            await updateDoc(tRef, sanitizeFirestoreData({
              participants,
              updatedAt: now,
            }));
          }
        }
      } catch (tErr) {
        console.warn('Could not sync tournament participants on player removal:', tErr);
      }
    }

    // Send notification to the removed player if captain removed them
    if (removedPlayerId && removedPlayerId !== requesterId) {
      await sendNotification({
        userId: removedPlayerId,
        type: 'TOURNAMENT_TEAM_PLAYER_REMOVED',
        title: 'ROSTER UPDATE',
        message: `You were removed from the roster of "${reg.teamName}" for tournament "${reg.tournamentName}".`,
        data: {
          teamId: reg.id,
          teamName: reg.teamName,
          tournamentId: reg.tournamentId,
          tournamentName: reg.tournamentName,
        },
      });
    }

    return { success: true };
  } catch (err: any) {
    console.error('Error removing player from slot:', err);
    return { success: false, error: err.message || 'Failed to remove player' };
  }
}

/**
 * Captain: Cancel a pending tournament team invitation
 */
export async function cancelTournamentTeamInvitation(params: {
  registrationId: string;
  slotNumber: 2 | 3 | 4 | 5;
  captainId: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { registrationId, slotNumber, captainId } = params;
    const regRef = doc(db, 'tournamentTeamRegistrations', registrationId);

    // Initial read to locate invitation ID if not saved on slot
    const initialSnap = await getDoc(regRef);
    if (!initialSnap.exists()) {
      // Fallback: Check if registrationId corresponds to a participant in a tournament doc
      const tournamentsSnap = await getDocs(collection(db, 'tournaments'));
      let targetTournamentDoc: any = null;
      let targetParticipantIndex = -1;

      for (const tDoc of tournamentsSnap.docs) {
        const tData = tDoc.data() as Tournament;
        const pIdx = (tData.participants || []).findIndex((p) => p.id === registrationId);
        if (pIdx !== -1) {
          targetTournamentDoc = tDoc;
          targetParticipantIndex = pIdx;
          break;
        }
      }

      if (targetTournamentDoc) {
        const tData = targetTournamentDoc.data() as Tournament;
        const participant = tData.participants[targetParticipantIndex];
        const pCaptainId = (participant as any).captainId || (participant.type === 'PLAYER' ? participant.id : undefined);
        if (pCaptainId && pCaptainId !== captainId) {
          return { success: false, error: 'Only the team captain can cancel invitations.' };
        }

        const members = [...(participant.teamMembers || [])];
        const slotIdx = members.findIndex((m) => m.slotNumber === slotNumber || m.slotNumber === (slotNumber as any));
        let cancelledUid: string | undefined;

        if (slotIdx !== -1) {
          cancelledUid = members[slotIdx].uid;
          members.splice(slotIdx, 1);
        }

        participant.teamMembers = members.map((m, idx) => ({
          ...m,
          slotNumber: (idx + 1) as any,
        }));
        participant.teamMemberIds = (participant.teamMemberIds || []).filter((id) => id !== cancelledUid);

        await updateDoc(targetTournamentDoc.ref, sanitizeFirestoreData({
          participants: tData.participants,
          updatedAt: Date.now(),
        }));

        // Cancel any pending invitation for this team and slot/recipient
        try {
          const invQuery = query(collection(db, 'teamInvitations'), where('teamId', '==', registrationId));
          const invDocs = await getDocs(invQuery);
          for (const d of invDocs.docs) {
            const iData = d.data();
            if (iData.slotNumber === slotNumber || (cancelledUid && (iData.recipientId === cancelledUid || iData.invitedPlayerId === cancelledUid))) {
              await updateDoc(d.ref, {
                status: 'CANCELLED',
                cancelledAt: Date.now(),
                cancelledBy: captainId,
                updatedAt: Date.now(),
              });
            }
          }
        } catch (invErr) {
          console.warn('Could not cancel invitations for participant:', invErr);
        }

        if (cancelledUid) {
          await sendNotification({
            userId: cancelledUid,
            type: 'TOURNAMENT_TEAM_INVITE_CANCELLED',
            title: 'INVITATION CANCELLED',
            message: `Your invitation to join team "${participant.name}" for tournament "${tData.name}" was cancelled by the captain.`,
            data: {
              teamId: registrationId,
              teamName: participant.name,
              tournamentId: targetTournamentDoc.id,
              tournamentName: tData.name,
            },
          });
        }

        return { success: true };
      }

      return { success: false, error: 'Registration room not found.' };
    }

    const initialReg = initialSnap.data() as TeamTournamentRegistration;
    if (initialReg.captainId !== captainId) {
      return { success: false, error: 'Only the team captain can cancel invitations.' };
    }

    const initialSlot = initialReg.slots.find((s) => s.slotNumber === slotNumber);
    if (!initialSlot) return { success: false, error: 'Slot not found.' };

    const targetRecipientId = (initialSlot as any).recipientId || initialSlot.invitedPlayerId || initialSlot.playerId;
    const targetGamerTag = (initialSlot.invitedGamerTag || initialSlot.gamerTag || '').trim().toLowerCase();

    let invId = initialSlot.invitationId;
    if (!invId) {
      try {
        // Query invitations for this team
        const q = query(
          collection(db, 'teamInvitations'),
          where('teamId', '==', registrationId)
        );
        const qSnap = await getDocs(q);
        for (const d of qSnap.docs) {
          const dData = d.data();
          const invStatus = normalizeInvitationStatus(dData.status);
          if (invStatus === 'CANCELLED' || invStatus === 'DECLINED') continue;

          if (dData.slotNumber === slotNumber) {
            invId = d.id;
            break;
          }
          if (targetRecipientId && (dData.recipientId === targetRecipientId || dData.invitedPlayerId === targetRecipientId)) {
            invId = d.id;
            break;
          }
          if (targetGamerTag && ((dData.invitedGamerTag && dData.invitedGamerTag.toLowerCase() === targetGamerTag) || (dData.recipientGamerTag && dData.recipientGamerTag.toLowerCase() === targetGamerTag))) {
            invId = d.id;
            break;
          }
        }
      } catch (qErr) {
        console.warn('Could not query invitation doc by team and slot:', qErr);
      }
    }

    // Fallback: search by recipientId if still not found
    if (!invId && targetRecipientId) {
      try {
        const qRecipient = query(
          collection(db, 'teamInvitations'),
          where('recipientId', '==', targetRecipientId)
        );
        const rSnap = await getDocs(qRecipient);
        for (const d of rSnap.docs) {
          const dData = d.data();
          if (dData.teamId === registrationId && normalizeInvitationStatus(dData.status) !== 'CANCELLED') {
            invId = d.id;
            break;
          }
        }
      } catch (rErr) {
        console.warn('Could not query invitation doc by recipientId:', rErr);
      }
    }

    const invRef = invId ? doc(db, 'teamInvitations', invId) : null;

    let cancelledPlayerId: string | undefined;
    let didConvertToRemove = false;
    let teamNameToNotify = initialReg.teamName;
    let tournamentIdToNotify = initialReg.tournamentId;
    let tournamentNameToNotify = initialReg.tournamentName;

    const now = Date.now();

    await runTransaction(db, async (transaction) => {
      const regSnap = await transaction.get(regRef);
      if (!regSnap.exists()) {
        throw new Error('Registration room not found.');
      }

      const reg = regSnap.data() as TeamTournamentRegistration;
      if (reg.captainId !== captainId) {
        throw new Error('Only the team captain can cancel invitations.');
      }

      teamNameToNotify = reg.teamName;
      tournamentIdToNotify = reg.tournamentId;
      tournamentNameToNotify = reg.tournamentName;

      const targetIndex = reg.slots.findIndex((s) => s.slotNumber === slotNumber);
      if (targetIndex === -1) {
        throw new Error('Slot not found.');
      }

      const targetSlot = reg.slots[targetIndex];
      if (targetSlot.isCaptain) {
        throw new Error('Captain slot cannot be cancelled.');
      }

      // Check if slot is already fully clean and empty
      if (
        (targetSlot.status === 'EMPTY' || targetSlot.playerStatus === 'EMPTY') &&
        !targetSlot.playerId &&
        !targetSlot.invitedPlayerId &&
        !(targetSlot as any).recipientId &&
        !targetSlot.invitedGamerTag &&
        !targetSlot.invitationId
      ) {
        return;
      }

      cancelledPlayerId =
        targetSlot.playerId ||
        targetSlot.invitedPlayerId ||
        (targetSlot as any).recipientId;

      const slotAccepted = isPlayerInvitationAccepted(targetSlot);

      const nextRegStatus = reg.status === 'CONFIRMED' ? 'CONFIRMED' : 'WAITING_FOR_PLAYERS';

      // RACE CONDITION CHECK:
      // If the invited player accepted first right before captain cancelled:
      // Convert seamlessly to a normal REMOVE PLAYER action rather than corrupting the roster
      if (slotAccepted) {
        didConvertToRemove = true;
        const removedEntry = cancelledPlayerId
          ? {
              playerId: cancelledPlayerId,
              gamerTag: targetSlot.gamerTag || targetSlot.invitedGamerTag || 'Player',
              slotNumber,
              removedAt: now,
              removedBy: captainId,
            }
          : null;

        const updatedRemovedMembers = [...(reg.removedMembers || [])];
        if (removedEntry) {
          updatedRemovedMembers.push(removedEntry);
        }

        const updatedMemberIds = (reg.memberIds || []).filter((id) => id !== cancelledPlayerId);

        // Free the slot so it becomes available immediately
        const updatedSlots = reg.slots.map((s) => {
          if (s.slotNumber === slotNumber) {
            return {
              slotNumber,
              isCaptain: false,
              status: 'EMPTY' as const,
              playerStatus: 'EMPTY' as const,
              invitationStatus: 'NONE' as const,
            };
          }
          return s;
        });

        transaction.update(regRef, sanitizeFirestoreData({
          slots: updatedSlots,
          memberIds: updatedMemberIds,
          removedMembers: updatedRemovedMembers,
          status: nextRegStatus,
          submittedAt: reg.status === 'PENDING_ADMIN_APPROVAL' ? null : (reg.submittedAt || null),
          submittedBy: reg.status === 'PENDING_ADMIN_APPROVAL' ? null : (reg.submittedBy || null),
          updatedAt: now,
        }));
        return;
      }

      // NORMAL CANCELLATION:
      // Free the slot immediately (status = EMPTY, all pending/invited metadata cleared)
      const updatedSlots = reg.slots.map((s) => {
        if (s.slotNumber === slotNumber) {
          return {
            slotNumber,
            isCaptain: false,
            status: 'EMPTY' as const,
            playerStatus: 'EMPTY' as const,
            invitationStatus: 'NONE' as const,
          };
        }
        return s;
      });

      const updatedMemberIds = (reg.memberIds || []).filter((id) => id !== cancelledPlayerId);

      transaction.update(regRef, sanitizeFirestoreData({
        slots: updatedSlots,
        memberIds: updatedMemberIds,
        status: nextRegStatus,
        submittedAt: reg.status === 'PENDING_ADMIN_APPROVAL' ? null : (reg.submittedAt || null),
        submittedBy: reg.status === 'PENDING_ADMIN_APPROVAL' ? null : (reg.submittedBy || null),
        updatedAt: now,
      }));
    });

    // Cancel any associated invitation document safely outside the transaction
    if (invId) {
      try {
        await updateDoc(doc(db, 'teamInvitations', invId), {
          status: 'CANCELLED',
          cancelledAt: now,
          cancelledBy: captainId,
          updatedAt: now,
        });
      } catch (invUpdErr) {
        console.warn('Could not update invitation document status:', invUpdErr);
      }
    }

    if (initialSlot.invitationId && initialSlot.invitationId !== invId) {
      try {
        await updateDoc(doc(db, 'teamInvitations', initialSlot.invitationId), {
          status: 'CANCELLED',
          cancelledAt: now,
          cancelledBy: captainId,
          updatedAt: now,
        });
      } catch (invUpdErr) {
        console.warn('Could not update slot invitation doc status:', invUpdErr);
      }
    }

    if (cancelledPlayerId) {
      // Sync tournament document participants if team was confirmed
      if (tournamentIdToNotify) {
        try {
          const tRef = doc(db, 'tournaments', tournamentIdToNotify);
          const tSnap = await getDoc(tRef);
          if (tSnap.exists()) {
            const tData = tSnap.data() as Tournament;
            const participants = [...(tData.participants || [])];
            const pIdx = participants.findIndex((p) => p.id === registrationId);
            if (pIdx !== -1) {
              const teamParticipant = { ...participants[pIdx] };
              const updatedMembers = (teamParticipant.teamMembers || []).filter(
                (m) => m.uid !== cancelledPlayerId
              );
              const updatedMemberIds = (teamParticipant.teamMemberIds || []).filter(
                (id) => id !== cancelledPlayerId
              );
              teamParticipant.teamMembers = updatedMembers;
              teamParticipant.teamMemberIds = updatedMemberIds;
              teamParticipant.status = updatedMembers.length < 5 ? 'INCOMPLETE' : teamParticipant.status;
              participants[pIdx] = teamParticipant;

              await updateDoc(tRef, sanitizeFirestoreData({
                participants,
                updatedAt: now,
              }));
            }
          }
        } catch (tSyncErr) {
          console.warn('Could not sync tournament doc participants during cancellation:', tSyncErr);
        }
      }

      await sendNotification({
        userId: cancelledPlayerId,
        type: 'TOURNAMENT_TEAM_INVITE_CANCELLED',
        title: didConvertToRemove ? 'ROSTER UPDATE' : 'INVITATION CANCELLED',
        message: didConvertToRemove
          ? `You were removed from the roster of "${teamNameToNotify}" for tournament "${tournamentNameToNotify}".`
          : `Your invitation to join team "${teamNameToNotify}" was cancelled by the captain.`,
        data: {
          teamId: registrationId,
          teamName: teamNameToNotify,
          tournamentId: tournamentIdToNotify,
          tournamentName: tournamentNameToNotify,
        },
      });
    }

    return { success: true };
  } catch (err: any) {
    console.error('Error cancelling tournament team invitation:', err);
    return { success: false, error: err.message || 'Failed to cancel invitation' };
  }
}

/**
 * Captain: Resend a tournament team invitation
 */
export async function resendTournamentTeamInvitation(params: {
  registrationId: string;
  slotNumber: 2 | 3 | 4 | 5;
  captainId: string;
  captainGamerTag: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { registrationId, slotNumber, captainId, captainGamerTag } = params;
    const regRef = doc(db, 'tournamentTeamRegistrations', registrationId);
    const snap = await getDoc(regRef);
    if (!snap.exists()) return { success: false, error: 'Registration room not found.' };

    const reg = snap.data() as TeamTournamentRegistration;
    if (reg.captainId !== captainId) {
      return { success: false, error: 'Only the team captain can resend invitations.' };
    }

    const targetSlot = reg.slots.find((s) => s.slotNumber === slotNumber);
    if (!targetSlot) return { success: false, error: 'Slot not found.' };

    const targetPlayerId = targetSlot.playerId || targetSlot.invitedPlayerId;
    if (!targetPlayerId) {
      return { success: false, error: 'No player assigned to this invitation.' };
    }

    const now = Date.now();
    const invitationId = targetSlot.invitationId || `inv_tourn_${reg.id}_s${slotNumber}_${now}`;

    // Refresh invitation document in teamInvitations
    const invRef = doc(db, 'teamInvitations', invitationId);
    await setDoc(
      invRef,
      sanitizeFirestoreData({
        id: invitationId,
        teamId: reg.id,
        teamName: reg.teamName,
        teamTag: reg.teamTag || '5v5',
        teamLogo: reg.teamLogo || '🛡️',
        gameId: reg.gameId,
        gameName: reg.gameName,
        game: reg.gameName,
        captainId: reg.captainId,
        captainGamerTag,
        invitedPlayerId: targetPlayerId,
        invitedGamerTag: targetSlot.invitedGamerTag || targetSlot.gamerTag || 'Player',
        recipientId: targetPlayerId,
        tournamentId: reg.tournamentId,
        tournamentName: reg.tournamentName,
        slotNumber,
        type: 'TEAM_TOURNAMENT_INVITATION',
        teamPath: 'tournamentTeamRegistrations',
        status: 'PENDING',
        createdAt: now,
        expiresAt: calculateInvitationExpiresAt(now),
        updatedAt: now,
        resentAt: now,
      }),
      { merge: true }
    );

    // Update slot invitedAt and expiresAt
    const updatedSlots = reg.slots.map((s) => {
      if (s.slotNumber === slotNumber) {
        return {
          ...s,
          invitationId,
          invitedAt: now,
          expiresAt: calculateInvitationExpiresAt(now),
          status: 'INVITED' as const,
          playerStatus: 'INVITED' as const,
          invitationStatus: 'PENDING' as const,
        };
      }
      return s;
    });

    await updateDoc(regRef, sanitizeFirestoreData({
      slots: updatedSlots,
      updatedAt: now,
    }));

    // Send notification
    await sendNotification({
      userId: targetPlayerId,
      type: 'TEAM_TOURNAMENT_INVITATION',
      title: '🏆 INVITATION REMINDER',
      message: `Reminder: You have a pending invitation from ${captainGamerTag} to join team "${reg.teamName}" for the "${reg.tournamentName}" tournament.`,
      data: {
        type: 'TEAM_TOURNAMENT_INVITATION',
        invitationId,
        teamId: reg.id,
        tournamentId: reg.tournamentId,
        captainId: reg.captainId,
        recipientId: targetPlayerId,
        teamName: reg.teamName,
        tournamentName: reg.tournamentName,
        game: reg.gameName,
        slotNumber,
        teamPath: 'tournamentTeamRegistrations',
      },
    });

    return { success: true };
  } catch (err: any) {
    console.error('Error resending tournament team invitation:', err);
    return { success: false, error: err.message || 'Failed to resend invitation' };
  }
}

/**
 * Captain: Submit 5v5 Team Registration for Admin Review
 */
export async function submitTeamRegistration(
  registrationId: string,
  captainId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const regRef = doc(db, 'tournamentTeamRegistrations', registrationId);
    const snap = await getDoc(regRef);
    if (!snap.exists()) return { success: false, error: 'Team registration not found.' };

    const reg = snap.data() as TeamTournamentRegistration;
    if (reg.captainId !== captainId) {
      return { success: false, error: 'Only the team captain can submit the registration.' };
    }

    if (reg.status === 'CONFIRMED') {
      return { success: false, error: 'This team is already confirmed.' };
    }

    if (reg.status === 'PENDING_ADMIN_APPROVAL') {
      return { success: false, error: 'This team is already submitted and pending Admin approval.' };
    }

    // Validate all 5 slots are complete and personally accepted & confirmed
    if (reg.slots.length !== 5) {
      return { success: false, error: 'Team must have exactly 5 player slots.' };
    }

    const completedCount = countCompletedDistinctPlayers(reg.slots, reg.captainPhone);
    if (completedCount !== 5) {
      return {
        success: false,
        error: 'Your team is not complete. Every player must accept their invitation and complete their information.',
      };
    }

    const playerIds = new Set<string>();
    for (const slot of reg.slots) {
      if (!isPlayerInformationComplete(slot, slot.isCaptain ? reg.captainPhone : undefined) || !slot.playerId) {
        return {
          success: false,
          error: `Player slot #${slot.slotNumber} (${slot.gamerTag || 'Player'}) is incomplete. Every player must personally complete their information.`,
        };
      }
      if (!slot.isCaptain) {
        if (slot.acceptedBy !== slot.playerId) {
          return {
            success: false,
            error: `Player slot #${slot.slotNumber} (${slot.gamerTag}) must personally accept their invitation.`,
          };
        }
        if (slot.informationCompletedBy !== slot.playerId) {
          return {
            success: false,
            error: `Player slot #${slot.slotNumber} (${slot.gamerTag}) must personally fill and confirm their own information.`,
          };
        }
      }
      const effectivePhone = slot.phoneNumber || (slot.isCaptain ? reg.captainPhone : '');
      const phoneVal = validatePhoneNumber(effectivePhone);
      if (!phoneVal.valid) {
        return { success: false, error: `Player #${slot.slotNumber} (${slot.gamerTag}) has an invalid phone number: ${phoneVal.error}` };
      }
      if (!slot.inGameName || !slot.inGameName.trim()) {
        return { success: false, error: `Player #${slot.slotNumber} (${slot.gamerTag}) is missing their In-Game Name.` };
      }
      if (!slot.inGameRank || !slot.inGameRank.trim()) {
        return { success: false, error: `Player #${slot.slotNumber} (${slot.gamerTag}) is missing their In-Game Rank.` };
      }
      if (playerIds.has(slot.playerId)) {
        return { success: false, error: `Duplicate player detected (${slot.gamerTag}). Each player must be a distinct account.` };
      }
      playerIds.add(slot.playerId);
    }

    // Verify tournament is open and has capacity
    const tRef = doc(db, 'tournaments', reg.tournamentId);
    const tSnap = await getDoc(tRef);
    if (!tSnap.exists()) return { success: false, error: 'Tournament not found.' };
    const tournament = tSnap.data() as Tournament;

    if (tournament.status !== 'REGISTRATION_OPEN') {
      return { success: false, error: 'Tournament registration has closed.' };
    }

    if (tournament.participants.length >= tournament.maxParticipants) {
      return { success: false, error: 'Tournament participant capacity has been reached.' };
    }

    // Ensure no player is in another confirmed team in this tournament
    for (const pId of Array.from(playerIds)) {
      const membership = await checkPlayerTournamentActiveMembership(reg.tournamentId, pId, reg.id);
      if (membership.isActive) {
        const slot = reg.slots.find((s) => s.playerId === pId);
        return {
          success: false,
          error: `Player ${slot?.gamerTag || pId} is already officially registered on another confirmed team in this tournament (${membership.teamName || 'another team'}).`,
        };
      }
    }

    const now = Date.now();
    await updateDoc(regRef, sanitizeFirestoreData({
      status: 'PENDING_ADMIN_APPROVAL',
      submittedAt: now,
      submittedBy: captainId,
      updatedAt: now,
    }));

    // Notify all 5 players that submission has been sent to Admin
    await sendBulkNotification({
      userIds: Array.from(playerIds),
      type: 'TOURNAMENT_TEAM_SUBMITTED',
      title: '⏳ 5v5 TEAM SUBMITTED FOR APPROVAL',
      message: `Team "${reg.teamName}" has been submitted to Nexus Tournament Commission for "${tournament.name}". Awaiting manual review.`,
      data: { teamId: reg.id, teamName: reg.teamName, gameName: tournament.gameName },
    });

    return { success: true };
  } catch (err: any) {
    console.error('Error submitting team registration:', err);
    return { success: false, error: err.message || 'Failed to submit team registration' };
  }
}

/**
 * Admin: Manually Accept / Confirm Team Registration
 */
export async function adminApproveTeamRegistration(params: {
  registrationId: string;
  adminUser: Player;
  adminNotes?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { registrationId, adminUser, adminNotes } = params;
    const regRef = doc(db, 'tournamentTeamRegistrations', registrationId);
    const snap = await getDoc(regRef);
    if (!snap.exists()) return { success: false, error: 'Team registration not found.' };

    const reg = snap.data() as TeamTournamentRegistration;
    if (reg.status === 'CONFIRMED') {
      return { success: false, error: 'This team is already confirmed.' };
    }

    const tRef = doc(db, 'tournaments', reg.tournamentId);
    const tSnap = await getDoc(tRef);
    if (!tSnap.exists()) return { success: false, error: 'Tournament not found.' };

    const tournament = tSnap.data() as Tournament;

    // Strict Capacity check: 5 players = 1 team entry!
    if (tournament.participants.length >= tournament.maxParticipants) {
      return {
        success: false,
        error: `Tournament capacity has been reached (${tournament.participants.length} / ${tournament.maxParticipants} teams). Cannot confirm additional teams.`,
      };
    }

    // Verify all 5 slots are complete using the single source of truth
    if (reg.slots.length !== 5) {
      return { success: false, error: 'Tournament team must have exactly 5 player slots.' };
    }

    const incompleteSlots = reg.slots.filter(
      (s) => !isPlayerInformationComplete(s, s.isCaptain ? reg.captainPhone : undefined)
    );
    if (incompleteSlots.length > 0) {
      const missingDetails = incompleteSlots.map((s) => `Slot #${s.slotNumber} (${s.gamerTag || 'Player'})`).join(', ');
      return {
        success: false,
        error: `Cannot approve: The following player slot(s) have incomplete mandatory information: ${missingDetails}.`,
      };
    }

    const completedCount = countCompletedDistinctPlayers(reg.slots, reg.captainPhone);
    if (completedCount !== 5) {
      return {
        success: false,
        error: 'Cannot approve: Team requires 5 distinct, verified player accounts with completed tournament details.',
      };
    }

    // Construct confirmed TournamentParticipant
    const newParticipant: TournamentParticipant = {
      id: reg.id,
      name: reg.teamName,
      tag: reg.teamTag || undefined,
      type: 'TEAM',
      registeredAt: Date.now(),
      seed: tournament.participants.length + 1,
      teamMemberIds: reg.slots.map((s) => s.playerId!),
      teamMembers: reg.slots.map((s) => ({
        uid: s.playerId!,
        gamerTag: s.gamerTag || 'Player',
        fullName: s.fullName || (s.isCaptain ? reg.captainFullName : undefined) || s.gamerTag,
        inGameName: s.inGameName,
        inGameRank: s.inGameRank,
        phoneNumber: s.phoneNumber || (s.isCaptain ? reg.captainPhone : undefined),
        isCaptain: s.isCaptain,
        slotNumber: s.slotNumber,
        playerStatus: 'INFORMATION_COMPLETE',
        informationConfirmed: s.informationConfirmed ?? true,
        presenceStatus: s.presenceStatus || 'NOT_CONFIRMED',
      })),
      captainName: reg.captainGamerTag,
      captainPhone: reg.captainPhone,
      teamTag: reg.teamTag,
      presenceStatus: 'NOT_CONFIRMED',
    };

    const existingIndex = tournament.participants.findIndex((p) => p.id === reg.id);
    let updatedParticipants: TournamentParticipant[];
    if (existingIndex !== -1) {
      updatedParticipants = [...tournament.participants];
      updatedParticipants[existingIndex] = newParticipant;
    } else {
      updatedParticipants = [...tournament.participants, newParticipant];
    }
    const now = Date.now();

    const batch = writeBatch(db);

    // 1. Update tournament doc
    batch.update(tRef, sanitizeFirestoreData({
      participants: updatedParticipants,
      currentParticipantsCount: updatedParticipants.length,
      updatedAt: now,
    }));

    // 2. Update registration doc
    batch.update(regRef, sanitizeFirestoreData({
      status: 'CONFIRMED',
      reviewedBy: adminUser.uid,
      reviewedByName: adminUser.gamerTag,
      reviewedAt: now,
      adminNotes: adminNotes || 'Officially accepted by Nexus Tournament Commission.',
      updatedAt: now,
    }));

    await batch.commit();

    // 3. Notify Captain
    await sendNotification({
      userId: reg.captainId,
      type: 'TOURNAMENT_TEAM_APPROVED',
      title: '✓ 5v5 TEAM REGISTRATION CONFIRMED!',
      message: `Congratulations! Your team "${reg.teamName}" has been officially accepted and entered into the "${tournament.name}"!`,
      data: { teamId: reg.id, teamName: reg.teamName, gameName: tournament.gameName },
    });

    // 4. Notify other 4 teammates
    const otherMembers = reg.slots.filter((s) => !s.isCaptain).map((s) => s.playerId!);
    await sendBulkNotification({
      userIds: otherMembers,
      type: 'TOURNAMENT_TEAM_APPROVED',
      title: '🏆 YOUR SQUAD HAS BEEN ACCEPTED!',
      message: `Your team "${reg.teamName}" is officially confirmed for the "${tournament.name}" 5v5 Tournament!`,
      data: { teamId: reg.id, teamName: reg.teamName, gameName: tournament.gameName },
    });

    return { success: true };
  } catch (err: any) {
    console.error('Error approving team registration:', err);
    return { success: false, error: err.message || 'Failed to approve team registration' };
  }
}

/**
 * Admin: Manually Reject Team Registration
 */
export async function adminRejectTeamRegistration(params: {
  registrationId: string;
  adminUser: Player;
  rejectionReason: string;
  adminNotes?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { registrationId, adminUser, rejectionReason, adminNotes } = params;
    const regRef = doc(db, 'tournamentTeamRegistrations', registrationId);
    const snap = await getDoc(regRef);
    if (!snap.exists()) return { success: false, error: 'Team registration not found.' };

    const reg = snap.data() as TeamTournamentRegistration;
    const now = Date.now();

    await updateDoc(regRef, sanitizeFirestoreData({
      status: 'REJECTED',
      rejectionReason: rejectionReason || 'Tournament requirements not met.',
      reviewedBy: adminUser.uid,
      reviewedByName: adminUser.gamerTag,
      reviewedAt: now,
      adminNotes: adminNotes || undefined,
      updatedAt: now,
    }));

    // Notify all 5 players
    const allPlayerIds = reg.slots.filter((s) => s.playerId).map((s) => s.playerId!);
    await sendBulkNotification({
      userIds: allPlayerIds,
      type: 'TOURNAMENT_TEAM_REJECTED',
      title: '✕ TEAM REGISTRATION REJECTED',
      message: `Registration for team "${reg.teamName}" in "${reg.tournamentName}" was declined by Admin: ${rejectionReason}`,
      data: { teamId: reg.id, teamName: reg.teamName, rejectionReason },
    });

    return { success: true };
  } catch (err: any) {
    console.error('Error rejecting team registration:', err);
    return { success: false, error: err.message || 'Failed to reject team registration' };
  }
}

/**
 * Cancel or Withdraw a Team Registration (Captain only, before confirmation)
 */
export async function cancelTeamRegistration(
  registrationId: string,
  captainId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const regRef = doc(db, 'tournamentTeamRegistrations', registrationId);
    const snap = await getDoc(regRef);
    if (!snap.exists()) return { success: false, error: 'Registration room not found.' };

    const reg = snap.data() as TeamTournamentRegistration;
    if (reg.captainId !== captainId) {
      return { success: false, error: 'Only the captain can cancel team registration.' };
    }

    if (reg.status === 'CONFIRMED') {
      return { success: false, error: 'Cannot cancel an already confirmed team without Admin assistance.' };
    }

    await updateDoc(regRef, sanitizeFirestoreData({
      status: 'CANCELLED',
      updatedAt: Date.now(),
    }));

    return { success: true };
  } catch (err: any) {
    console.error('Error cancelling team registration:', err);
    return { success: false, error: err.message || 'Failed to cancel team registration' };
  }
}

/**
 * Captain: Withdraw a pending team registration submission back to WAITING_FOR_PLAYERS so the roster can be modified.
 */
export async function withdrawTeamRegistrationSubmission(
  registrationId: string,
  captainId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const regRef = doc(db, 'tournamentTeamRegistrations', registrationId);
    const snap = await getDoc(regRef);
    if (!snap.exists()) return { success: false, error: 'Registration room not found.' };

    const reg = snap.data() as TeamTournamentRegistration;
    if (reg.captainId !== captainId) {
      return { success: false, error: 'Only the captain can withdraw the team submission.' };
    }

    if (reg.status === 'CONFIRMED') {
      return { success: false, error: 'Cannot withdraw an already confirmed team without Admin assistance.' };
    }

    await updateDoc(regRef, sanitizeFirestoreData({
      status: 'WAITING_FOR_PLAYERS',
      submittedAt: null,
      submittedBy: null,
      updatedAt: Date.now(),
    }));

    return { success: true };
  } catch (err: any) {
    console.error('Error withdrawing team registration submission:', err);
    return { success: false, error: err.message || 'Failed to withdraw team registration' };
  }
}

/**
 * Realtime subscription: All Team Registrations for a Tournament
 */
export function subscribeToTeamRegistrationsForTournament(
  tournamentId: string,
  callback: (regs: TeamTournamentRegistration[]) => void
) {
  const q = query(
    collection(db, 'tournamentTeamRegistrations'),
    where('tournamentId', '==', tournamentId)
  );

  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => d.data() as TeamTournamentRegistration);
      callback(list);
    },
    (err) => {
      console.error('Error subscribing to team registrations:', err);
      callback([]);
    }
  );
}

/**
 * Realtime subscription: Team Registrations in which a specific player participates
 */
export function subscribeToPlayerRegistrationsForTournament(
  tournamentId: string,
  playerId: string,
  callback: (regs: TeamTournamentRegistration[]) => void
) {
  const q = query(
    collection(db, 'tournamentTeamRegistrations'),
    where('tournamentId', '==', tournamentId)
  );

  return onSnapshot(
    q,
    (snap) => {
      const all = snap.docs.map((d) => d.data() as TeamTournamentRegistration);
      // Filter where player is in slots and registration is active
      const playerRegs = all.filter(
        (r) =>
          r.status !== 'CANCELLED' &&
          r.status !== 'REJECTED' &&
          r.slots.some(
            (s) =>
              s.playerId === playerId &&
              s.status !== 'EMPTY' &&
              s.status !== 'REMOVED' &&
              s.playerStatus !== 'REMOVED' &&
              s.status !== 'DECLINED' &&
              s.playerStatus !== 'DECLINED' &&
              s.status !== 'CANCELLED' &&
              s.playerStatus !== 'CANCELLED'
          )
      );
      callback(playerRegs);
    },
    (err) => {
      console.error('Error subscribing to player team registrations:', err);
      callback([]);
    }
  );
}

/**
 * Realtime subscription: Pending Team Registrations for Admins across all tournaments
 */
export function subscribeToPendingTeamRegistrations(
  callback: (regs: TeamTournamentRegistration[]) => void
) {
  const q = query(
    collection(db, 'tournamentTeamRegistrations'),
    where('status', '==', 'PENDING_ADMIN_APPROVAL')
  );

  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => d.data() as TeamTournamentRegistration);
      callback(list.sort((a, b) => (b.submittedAt || b.createdAt) - (a.submittedAt || a.createdAt)));
    },
    (err) => {
      console.error('Error subscribing to pending team registrations:', err);
      callback([]);
    }
  );
}

/**
 * Fetch a single team registration room
 */
export async function fetchTeamRegistrationById(registrationId: string): Promise<TeamTournamentRegistration | null> {
  try {
    const snap = await getDoc(doc(db, 'tournamentTeamRegistrations', registrationId));
    if (!snap.exists()) return null;
    return snap.data() as TeamTournamentRegistration;
  } catch (err) {
    console.error('Error fetching team registration:', err);
    return null;
  }
}

// ============================================================================
// ADMIN TOURNAMENT EDITING & MANAGEMENT SYSTEM
// ============================================================================

/**
 * Log an Admin action in the Tournament Activity & Audit Log
 */
export async function logTournamentActivity(params: {
  tournamentId: string;
  adminId: string;
  adminName: string;
  action: string;
  affectedParticipant?: string;
  oldValue?: string;
  newValue?: string;
  details?: string;
}): Promise<void> {
  try {
    const logId = `tlog_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const newLog: TournamentActivityLog = {
      id: logId,
      tournamentId: params.tournamentId,
      adminId: params.adminId,
      adminName: params.adminName,
      action: params.action,
      affectedParticipant: params.affectedParticipant,
      oldValue: params.oldValue,
      newValue: params.newValue,
      details: params.details,
      timestamp: Date.now(),
    };
    await setDoc(doc(db, 'tournamentActivityLogs', logId), sanitizeFirestoreData(newLog));
  } catch (err) {
    console.error('Failed to log tournament activity:', err);
  }
}

/**
 * Realtime subscription to Tournament Activity Logs
 */
export function subscribeToTournamentActivityLogs(
  tournamentId: string,
  callback: (logs: TournamentActivityLog[]) => void
) {
  const q = query(
    collection(db, 'tournamentActivityLogs'),
    where('tournamentId', '==', tournamentId)
  );

  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => d.data() as TournamentActivityLog);
      list.sort((a, b) => b.timestamp - a.timestamp);
      callback(list);
    },
    (err) => {
      console.error('Error subscribing to tournament activity logs:', err);
      callback([]);
    }
  );
}

/**
 * Realtime subscription to Tournament Qualification & Progression Events
 */
export function subscribeToTournamentEvents(
  tournamentId: string,
  callback: (events: TournamentQualificationEvent[]) => void
) {
  const q = query(
    collection(db, 'tournamentEvents'),
    where('tournamentId', '==', tournamentId)
  );

  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => d.data() as TournamentQualificationEvent);
      list.sort((a, b) => b.createdAt - a.createdAt);
      callback(list);
    },
    (err) => {
      console.error('Error subscribing to tournament events:', err);
      callback([]);
    }
  );
}

/**
 * Fetch Tournament Qualification Events for a tournament
 */
export async function getTournamentEvents(tournamentId: string): Promise<TournamentQualificationEvent[]> {
  try {
    const q = query(
      collection(db, 'tournamentEvents'),
      where('tournamentId', '==', tournamentId)
    );
    const snap = await getDocs(q);
    const list = snap.docs.map((d) => d.data() as TournamentQualificationEvent);
    list.sort((a, b) => b.createdAt - a.createdAt);
    return list;
  } catch (err) {
    console.error('Error fetching tournament events:', err);
    return [];
  }
}


/**
 * Helper to collect all registered player / captain user IDs for notifications
 */
function extractParticipantUserIds(tournament: Tournament): string[] {
  const ids = new Set<string>();
  (tournament.participants || []).forEach((p) => {
    if (p.type === 'PLAYER') {
      if (p.id && !p.id.startsWith('guest_')) ids.add(p.id);
    } else if (p.type === 'TEAM') {
      if (p.teamMemberIds) {
        p.teamMemberIds.forEach((mId) => {
          if (mId && !mId.startsWith('guest_')) ids.add(mId);
        });
      }
      if (p.teamMembers) {
        p.teamMembers.forEach((m) => {
          if (m.uid && !m.uid.startsWith('guest_')) ids.add(m.uid);
        });
      }
    }
  });
  return Array.from(ids);
}

/**
 * 1. Admin Edit Tournament Details (Name, Game, Description, Rules, Format, Date, Location, etc.)
 * Date/time changes notify participants without deleting registrations or brackets.
 */
export async function adminUpdateTournamentDetails(params: {
  tournamentId: string;
  updates: Partial<Tournament>;
  adminId: string;
  adminName: string;
  notifyParticipants?: boolean;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { tournamentId, updates, adminId, adminName, notifyParticipants = true } = params;
    const tRef = doc(db, 'tournaments', tournamentId);
    const snap = await getDoc(tRef);
    if (!snap.exists()) return { success: false, error: 'Tournament not found' };

    const current = snap.data() as Tournament;
    const changes: string[] = [];

    if (updates.name && updates.name !== current.name) {
      changes.push(`Name: "${current.name}" → "${updates.name}"`);
    }

    let dateChanged = false;
    let oldDateStr = '';
    let newDateStr = '';

    if (updates.startDate && updates.startDate !== current.startDate) {
      dateChanged = true;
      oldDateStr = new Date(current.startDate).toLocaleString();
      newDateStr = new Date(updates.startDate).toLocaleString();
      changes.push(`Start Schedule: ${oldDateStr} → ${newDateStr}`);
    }

    if (updates.status && updates.status !== current.status) {
      changes.push(`Status: ${current.status} → ${updates.status}`);
    }

    if (updates.format && updates.format !== current.format) {
      changes.push(`Format: ${current.format} → ${updates.format}`);
    }

    if (updates.maxParticipants && updates.maxParticipants !== current.maxParticipants) {
      changes.push(`Capacity: ${current.maxParticipants} → ${updates.maxParticipants}`);
    }

    if (updates.location && updates.location !== current.location) {
      changes.push(`Location: "${current.location || 'None'}" → "${updates.location}"`);
    }

    if (updates.entryFee && updates.entryFee !== current.entryFee) {
      changes.push(`Entry Fee: "${current.entryFee || 'Free'}" → "${updates.entryFee}"`);
    }

    const payload = sanitizeFirestoreData({
      ...updates,
      updatedAt: Date.now(),
    });

    await updateDoc(tRef, payload);

    // Activity Log
    await logTournamentActivity({
      tournamentId,
      adminId,
      adminName,
      action: 'EDIT_TOURNAMENT_DETAILS',
      details: changes.length > 0 ? changes.join(' | ') : 'Updated general tournament metadata',
    });

    // Notify registered participants if date or time changed
    if (dateChanged && notifyParticipants) {
      const userIds = extractParticipantUserIds(current);
      if (userIds.length > 0) {
        await sendBulkNotification({
          userIds,
          type: 'TOURNAMENT_SCHEDULE_CHANGED',
          title: `📅 TOURNAMENT UPDATED - ${current.name}`,
          message: `The date or schedule for "${current.name}" has been changed.\nPrevious: ${oldDateStr}\nNew: ${newDateStr}`,
          data: { tournamentId },
        });
      }
    }

    return { success: true };
  } catch (err: any) {
    console.error('Error updating tournament details:', err);
    return { success: false, error: err.message || 'Failed to update tournament' };
  }
}

/**
 * 2. Admin Edit Prizes & Rewards
 */
export async function adminUpdateTournamentPrizes(params: {
  tournamentId: string;
  prizes: TournamentPrizeBreakdown;
  prizePool?: string;
  adminId: string;
  adminName: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { tournamentId, prizes, prizePool, adminId, adminName } = params;
    const tRef = doc(db, 'tournaments', tournamentId);
    const snap = await getDoc(tRef);
    if (!snap.exists()) return { success: false, error: 'Tournament not found' };

    const current = snap.data() as Tournament;

    await updateDoc(tRef, sanitizeFirestoreData({
      prizes,
      prizePool: prizePool || current.prizePool || 'Custom Prize Pool',
      updatedAt: Date.now(),
    }));

    await logTournamentActivity({
      tournamentId,
      adminId,
      adminName,
      action: 'UPDATE_PRIZES',
      details: `Prizes updated: 1st: ${prizes.firstPlace || 'N/A'}, 2nd: ${prizes.secondPlace || 'N/A'}, 3rd: ${prizes.thirdPlace || 'N/A'}${prizes.cashPrize ? ` | Cash: ${prizes.cashPrize}` : ''}`,
    });

    return { success: true };
  } catch (err: any) {
    console.error('Error updating tournament prizes:', err);
    return { success: false, error: err.message || 'Failed to update prizes' };
  }
}

/**
 * 3. Admin: Add New Team manually to a 5v5 Team Tournament
 * ONE TEAM = ONE TOURNAMENT ENTRY
 */
export async function adminAddTeamToTournament(params: {
  tournamentId: string;
  teamName: string;
  teamTag?: string;
  status: 'CONFIRMED' | 'PENDING';
  captain: {
    gamerTag: string;
    fullName?: string;
    phoneNumber?: string;
    inGameName?: string;
    inGameRank?: string;
    uid?: string;
  };
  members: Array<{
    gamerTag: string;
    fullName?: string;
    phoneNumber?: string;
    inGameName?: string;
    inGameRank?: string;
    uid?: string;
    role?: 'starter' | 'substitute' | 'member';
  }>;
  adminId: string;
  adminName: string;
}): Promise<{ success: boolean; error?: string; teamId?: string }> {
  try {
    const { tournamentId, teamName, teamTag, status, captain, members, adminId, adminName } = params;
    const tRef = doc(db, 'tournaments', tournamentId);
    const snap = await getDoc(tRef);
    if (!snap.exists()) return { success: false, error: 'Tournament not found' };

    const tournament = snap.data() as Tournament;
    const currentParticipants = [...(tournament.participants || [])];

    // Check duplicate team name
    if (currentParticipants.some((p) => p.name.trim().toLowerCase() === teamName.trim().toLowerCase())) {
      return { success: false, error: `A team named "${teamName}" is already registered in this tournament.` };
    }

    // Check capacity if confirmed
    if (status === 'CONFIRMED') {
      const confirmedCount = currentParticipants.filter((p) => p.status !== 'WITHDRAWN' && p.status !== 'DISQUALIFIED').length;
      if (confirmedCount >= tournament.maxParticipants) {
        return { success: false, error: `Tournament capacity reached (${tournament.maxParticipants} teams maximum).` };
      }
    }

    const teamId = `team_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const captainUid = captain.uid || `player_c_${Date.now()}`;

    const teamMembersList = [
      {
        uid: captainUid,
        gamerTag: captain.gamerTag.trim(),
        fullName: captain.fullName?.trim() || '',
        phoneNumber: captain.phoneNumber?.trim() || '',
        inGameName: captain.inGameName?.trim() || captain.gamerTag.trim(),
        inGameRank: captain.inGameRank?.trim() || 'Diamond',
        isCaptain: true,
        slotNumber: 1,
        role: 'captain' as const,
      },
      ...members.slice(0, 4).map((m, idx) => ({
        uid: m.uid || `player_m${idx + 2}_${Date.now()}`,
        gamerTag: m.gamerTag.trim(),
        fullName: m.fullName?.trim() || '',
        phoneNumber: m.phoneNumber?.trim() || '',
        inGameName: m.inGameName?.trim() || m.gamerTag.trim(),
        inGameRank: m.inGameRank?.trim() || 'Platinum',
        isCaptain: false,
        slotNumber: (idx + 2) as any,
        role: (m.role || 'starter') as any,
      })),
    ];

    const newTeamParticipant: TournamentParticipant = {
      id: teamId,
      name: teamName.trim(),
      tag: teamTag?.trim() || '',
      type: 'TEAM',
      registeredAt: Date.now(),
      status: status,
      seed: currentParticipants.length + 1,
      teamMembers: teamMembersList,
      teamMemberIds: teamMembersList.map((m) => m.uid),
      fullName: captain.fullName || '',
      phoneNumber: captain.phoneNumber || '',
    };

    currentParticipants.push(newTeamParticipant);

    const activeConfirmed = currentParticipants.filter(
      (p) => p.status === 'CONFIRMED' || (!p.status && status === 'CONFIRMED')
    ).length;

    await updateDoc(tRef, sanitizeFirestoreData({
      participants: currentParticipants,
      currentParticipantsCount: activeConfirmed,
      updatedAt: Date.now(),
    }));

    // Create a synchronized TeamTournamentRegistration doc for seamless tracking
    const regId = `reg_${teamId}`;
    const slots: TeamTournamentPlayerSlot[] = [
      {
        slotNumber: 1,
        isCaptain: true,
        status: 'COMPLETED',
        playerId: captainUid,
        playerGamerTag: captain.gamerTag.trim(),
        playerFullName: captain.fullName?.trim() || '',
        playerPhone: captain.phoneNumber?.trim() || '',
        inGameName: captain.inGameName?.trim() || captain.gamerTag.trim(),
        inGameRank: captain.inGameRank?.trim() || 'Diamond',
      },
      ...members.slice(0, 4).map((m, idx) => ({
        slotNumber: (idx + 2) as any,
        isCaptain: false,
        status: 'COMPLETED' as const,
        playerId: m.uid || `player_m${idx + 2}_${Date.now()}`,
        playerGamerTag: m.gamerTag.trim(),
        playerFullName: m.fullName?.trim() || '',
        playerPhone: m.phoneNumber?.trim() || '',
        inGameName: m.inGameName?.trim() || m.gamerTag.trim(),
        inGameRank: m.inGameRank?.trim() || 'Platinum',
      })),
    ];

    const teamRegDoc: TeamTournamentRegistration = {
      id: regId,
      tournamentId,
      tournamentName: tournament.name,
      gameId: tournament.gameId,
      gameName: tournament.gameName,
      teamName: teamName.trim(),
      teamNameLower: teamName.trim().toLowerCase(),
      teamTag: teamTag?.trim() || '',
      captainId: captainUid,
      captainGamerTag: captain.gamerTag.trim(),
      captainFullName: captain.fullName?.trim() || '',
      captainPhone: captain.phoneNumber?.trim() || '',
      slots,
      filledSlotsCount: slots.length,
      status: status === 'CONFIRMED' ? 'CONFIRMED' : 'PENDING_ADMIN_APPROVAL',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      submittedAt: Date.now(),
      reviewedAt: status === 'CONFIRMED' ? Date.now() : undefined,
      reviewedBy: status === 'CONFIRMED' ? adminName : undefined,
    };

    await setDoc(doc(db, 'tournamentTeamRegistrations', regId), sanitizeFirestoreData(teamRegDoc));

    await logTournamentActivity({
      tournamentId,
      adminId,
      adminName,
      action: 'ADD_TEAM_MANUAL',
      affectedParticipant: teamName.trim(),
      newValue: `Status: ${status} | Members: ${teamMembersList.length}/5`,
      details: `Admin added 5v5 team "${teamName}" with Captain ${captain.gamerTag}`,
    });

    return { success: true, teamId };
  } catch (err: any) {
    console.error('Error adding team to tournament:', err);
    return { success: false, error: err.message || 'Failed to add team' };
  }
}

/**
 * 4. Admin: Remove, Withdraw, or Disqualify Team
 * Safe removal preserves historical match records and offers withdrawal/disqualification when live.
 */
export async function adminRemoveTeamFromTournament(params: {
  tournamentId: string;
  teamId: string;
  action: 'REMOVE' | 'WITHDRAW' | 'DISQUALIFY';
  reason?: string;
  adminId: string;
  adminName: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { tournamentId, teamId, action, reason, adminId, adminName } = params;
    const tRef = doc(db, 'tournaments', tournamentId);
    const snap = await getDoc(tRef);
    if (!snap.exists()) return { success: false, error: 'Tournament not found' };

    const tournament = snap.data() as Tournament;
    const participants = [...(tournament.participants || [])];
    const teamIndex = participants.findIndex((p) => p.id === teamId);

    if (teamIndex === -1) {
      return { success: false, error: 'Team not found in tournament.' };
    }

    const team = participants[teamIndex];
    const hasBracket = Boolean(tournament.matches && tournament.matches.length > 0);
    const isLive = tournament.status === 'LIVE';

    let matches = [...(tournament.matches || [])];

    if (action === 'REMOVE') {
      if (isLive || hasBracket) {
        return {
          success: false,
          error: 'Cannot permanently delete team after bracket generation or during live play. Use "Withdraw" or "Disqualify" to preserve tournament match history.',
        };
      }
      // Safe removal before bracket
      participants.splice(teamIndex, 1);
    } else {
      // WITHDRAW or DISQUALIFY
      const newStatus = action === 'WITHDRAW' ? 'WITHDRAWN' : 'DISQUALIFIED';
      participants[teamIndex] = {
        ...team,
        status: newStatus,
        withdrawnAt: action === 'WITHDRAW' ? Date.now() : team.withdrawnAt,
        disqualifiedAt: action === 'DISQUALIFY' ? Date.now() : team.disqualifiedAt,
        statusReason: reason || `Admin action: ${action}`,
      };

      // For live uncompleted matches involving this team, mark forfeit
      matches = matches.map((m) => {
        if (m.status !== 'COMPLETED') {
          if (m.participantAId === teamId && m.participantB) {
            return {
              ...m,
              status: 'COMPLETED',
              winnerId: m.participantB.id,
              winnerName: m.participantB.name,
              loserId: teamId,
              loserName: team.name,
              scoreA: 0,
              scoreB: 1,
              completedAt: Date.now(),
              notes: `Team ${team.name} ${newStatus.toLowerCase()} by Admin. Opponent wins by default.`,
            };
          }
          if (m.participantBId === teamId && m.participantA) {
            return {
              ...m,
              status: 'COMPLETED',
              winnerId: m.participantA.id,
              winnerName: m.participantA.name,
              loserId: teamId,
              loserName: team.name,
              scoreA: 1,
              scoreB: 0,
              completedAt: Date.now(),
              notes: `Team ${team.name} ${newStatus.toLowerCase()} by Admin. Opponent wins by default.`,
            };
          }
        }
        return m;
      });
    }

    const activeCount = participants.filter(
      (p) => p.status === 'CONFIRMED' || (!p.status && action !== 'REMOVE')
    ).length;

    await updateDoc(tRef, sanitizeFirestoreData({
      participants,
      currentParticipantsCount: activeCount,
      matches,
      updatedAt: Date.now(),
    }));

    // Update associated TeamTournamentRegistration if exists
    try {
      const regSnap = await getDoc(doc(db, 'tournamentTeamRegistrations', `reg_${teamId}`));
      if (regSnap.exists()) {
        await updateDoc(doc(db, 'tournamentTeamRegistrations', `reg_${teamId}`), sanitizeFirestoreData({
          status: action === 'REMOVE' ? 'CANCELLED' : action === 'WITHDRAW' ? 'CANCELLED' : 'REJECTED',
          reviewNotes: reason || `Admin action: ${action}`,
          updatedAt: Date.now(),
        }));
      }
    } catch (e) {
      console.warn('Could not sync registration doc:', e);
    }

    await logTournamentActivity({
      tournamentId,
      adminId,
      adminName,
      action: `${action}_TEAM`,
      affectedParticipant: team.name,
      oldValue: team.status || 'CONFIRMED',
      newValue: action === 'REMOVE' ? 'REMOVED' : action === 'WITHDRAW' ? 'WITHDRAWN' : 'DISQUALIFIED',
      details: reason || `Admin performed ${action} on team "${team.name}"`,
    });

    return { success: true };
  } catch (err: any) {
    console.error('Error in adminRemoveTeamFromTournament:', err);
    return { success: false, error: err.message || 'Failed to remove/withdraw team' };
  }
}

/**
 * 5. Admin: Edit Team Details (Name, Tag, etc.)
 */
export async function adminUpdateTeamDetails(params: {
  tournamentId: string;
  teamId: string;
  teamName: string;
  teamTag?: string;
  captainName?: string;
  captainPhone?: string;
  adminId: string;
  adminName: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { tournamentId, teamId, teamName, teamTag, captainName, captainPhone, adminId, adminName } = params;
    const tRef = doc(db, 'tournaments', tournamentId);
    const snap = await getDoc(tRef);
    if (!snap.exists()) return { success: false, error: 'Tournament not found' };

    const tournament = snap.data() as Tournament;
    const participants = [...(tournament.participants || [])];
    const teamIndex = participants.findIndex((p) => p.id === teamId);

    if (teamIndex === -1) return { success: false, error: 'Team not found' };

    const oldName = participants[teamIndex].name;
    participants[teamIndex] = {
      ...participants[teamIndex],
      name: teamName.trim(),
      tag: teamTag?.trim() || '',
      teamTag: teamTag?.trim() || '',
      captainName: captainName !== undefined ? captainName.trim() : participants[teamIndex].captainName,
      captainPhone: captainPhone !== undefined ? captainPhone.trim() : participants[teamIndex].captainPhone,
    };

    // Propagate new team name to uncompleted matches
    const matches = (tournament.matches || []).map((m) => {
      const updated = { ...m };
      if (updated.participantAId === teamId && updated.participantA) {
        updated.participantA = { ...updated.participantA, name: teamName.trim(), tag: teamTag?.trim() || '' };
        updated.participantAName = teamName.trim();
      }
      if (updated.participantBId === teamId && updated.participantB) {
        updated.participantB = { ...updated.participantB, name: teamName.trim(), tag: teamTag?.trim() || '' };
        updated.participantBName = teamName.trim();
      }
      return updated;
    });

    await updateDoc(tRef, sanitizeFirestoreData({
      participants,
      matches,
      updatedAt: Date.now(),
    }));

    await logTournamentActivity({
      tournamentId,
      adminId,
      adminName,
      action: 'EDIT_TEAM_DETAILS',
      affectedParticipant: teamName.trim(),
      oldValue: oldName,
      newValue: teamName.trim(),
      details: `Updated team details: Name: "${teamName}", Tag: "${teamTag || ''}"`,
    });

    return { success: true };
  } catch (err: any) {
    console.error('Error updating team details:', err);
    return { success: false, error: err.message || 'Failed to update team details' };
  }
}

/**
 * 6. Admin: Remove Player from a Team (Player Count Validation & Incomplete Squad Warning)
 */
export async function adminRemovePlayerFromTeam(params: {
  tournamentId: string;
  teamId: string;
  playerIdentifier: string; // uid or gamerTag
  reason?: string;
  adminId: string;
  adminName: string;
}): Promise<{ success: boolean; error?: string; remainingCount?: number }> {
  try {
    const { tournamentId, teamId, playerIdentifier, reason, adminId, adminName } = params;
    const tRef = doc(db, 'tournaments', tournamentId);
    const snap = await getDoc(tRef);
    if (!snap.exists()) return { success: false, error: 'Tournament not found' };

    const tournament = snap.data() as Tournament;
    const participants = [...(tournament.participants || [])];
    const teamIndex = participants.findIndex((p) => p.id === teamId);

    if (teamIndex === -1) return { success: false, error: 'Team not found' };

    const team = { ...participants[teamIndex] };
    const members = [...(team.teamMembers || [])];

    const playerIdx = members.findIndex(
      (m) => m.uid === playerIdentifier || m.gamerTag.toLowerCase() === playerIdentifier.toLowerCase()
    );

    if (playerIdx === -1) {
      return { success: false, error: 'Player not found in this team roster.' };
    }

    const removedPlayer = members[playerIdx];
    members.splice(playerIdx, 1);

    // Re-assign slot numbers
    const updatedMembers = members.map((m, idx) => ({
      ...m,
      slotNumber: (idx + 1) as any,
    }));

    // If squad has less than 5 players, flag as INCOMPLETE
    const remainingCount = updatedMembers.length;
    const newStatus = remainingCount < 5 ? 'INCOMPLETE' : team.status;

    team.teamMembers = updatedMembers;
    team.teamMemberIds = updatedMembers.map((m) => m.uid);
    team.status = newStatus;

    participants[teamIndex] = team;

    await updateDoc(tRef, sanitizeFirestoreData({
      participants,
      updatedAt: Date.now(),
    }));

    // Also sync the team's tournamentTeamRegistrations document if one exists
    try {
      const regRef = doc(db, 'tournamentTeamRegistrations', teamId);
      const regSnap = await getDoc(regRef);
      if (regSnap.exists()) {
        const reg = regSnap.data() as TeamTournamentRegistration;
        const now = Date.now();
        const removedPlayerUid = removedPlayer.uid;
        const updatedSlots = reg.slots.map((s) => {
          if (s.playerId === removedPlayerUid || s.invitedPlayerId === removedPlayerUid) {
            return {
              ...s,
              status: 'REMOVED' as const,
              playerStatus: 'REMOVED' as const,
              invitationStatus: 'CANCELLED' as const,
              removedAt: now,
              removedBy: adminId,
              removedPlayerId: removedPlayerUid,
              removedPlayerGamerTag: removedPlayer.gamerTag,
            };
          }
          return s;
        });
        const updatedMemberIds = (reg.memberIds || []).filter((id) => id !== removedPlayerUid);
        const updatedRemovedMembers = [
          ...(reg.removedMembers || []),
          {
            playerId: removedPlayerUid,
            gamerTag: removedPlayer.gamerTag,
            slotNumber: removedPlayer.slotNumber || 0,
            removedAt: now,
            removedBy: adminId,
          },
        ];
        await updateDoc(regRef, sanitizeFirestoreData({
          slots: updatedSlots,
          memberIds: updatedMemberIds,
          removedMembers: updatedRemovedMembers,
          updatedAt: now,
        }));
      }
    } catch (regSyncErr) {
      console.warn('Could not sync tournamentTeamRegistration in adminRemovePlayerFromTeam:', regSyncErr);
    }

    await logTournamentActivity({
      tournamentId,
      adminId,
      adminName,
      action: 'REMOVE_PLAYER_FROM_TEAM',
      affectedParticipant: team.name,
      oldValue: `${removedPlayer.gamerTag} (${remainingCount + 1} players)`,
      newValue: `${remainingCount} players (${newStatus})`,
      details: `Removed player ${removedPlayer.gamerTag} from team "${team.name}". Squad has ${remainingCount}/5 players.${reason ? ` Reason: ${reason}` : ''}`,
    });

    return { success: true, remainingCount };
  } catch (err: any) {
    console.error('Error removing player from team:', err);
    return { success: false, error: err.message || 'Failed to remove player' };
  }
}

/**
 * 7. Admin: Add Replacement Player to a Team (Validates duplicates across tournament)
 */
export async function adminAddPlayerToTeam(params: {
  tournamentId: string;
  teamId: string;
  playerData: {
    gamerTag: string;
    fullName?: string;
    phoneNumber?: string;
    inGameName?: string;
    inGameRank?: string;
    uid?: string;
    role?: 'starter' | 'substitute' | 'member';
  };
  adminId: string;
  adminName: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { tournamentId, teamId, playerData, adminId, adminName } = params;
    const tRef = doc(db, 'tournaments', tournamentId);
    const snap = await getDoc(tRef);
    if (!snap.exists()) return { success: false, error: 'Tournament not found' };

    const tournament = snap.data() as Tournament;
    const participants = [...(tournament.participants || [])];
    const teamIndex = participants.findIndex((p) => p.id === teamId);

    if (teamIndex === -1) return { success: false, error: 'Team not found' };

    const team = { ...participants[teamIndex] };
    const members = [...(team.teamMembers || [])];

    // Check duplicate in this team or other teams in tournament
    const checkTag = playerData.gamerTag.trim().toLowerCase();
    for (const p of participants) {
      if (p.teamMembers?.some((m) => m.gamerTag.trim().toLowerCase() === checkTag)) {
        return {
          success: false,
          error: `Player "${playerData.gamerTag}" is already registered in team "${p.name}" for this tournament.`,
        };
      }
    }

    const newUid = playerData.uid || `player_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`;
    const newSlotNumber = (members.length + 1) as any;

    members.push({
      uid: newUid,
      gamerTag: playerData.gamerTag.trim(),
      fullName: playerData.fullName?.trim() || '',
      phoneNumber: playerData.phoneNumber?.trim() || '',
      inGameName: playerData.inGameName?.trim() || playerData.gamerTag.trim(),
      inGameRank: playerData.inGameRank?.trim() || 'Gold',
      isCaptain: false,
      slotNumber: newSlotNumber,
      role: playerData.role || 'starter',
    });

    team.teamMembers = members;
    team.teamMemberIds = members.map((m) => m.uid);

    // If team was INCOMPLETE and reached 5 players, restore to CONFIRMED
    if (members.length >= 5 && team.status === 'INCOMPLETE') {
      team.status = 'CONFIRMED';
    }

    participants[teamIndex] = team;

    await updateDoc(tRef, sanitizeFirestoreData({
      participants,
      updatedAt: Date.now(),
    }));

    await logTournamentActivity({
      tournamentId,
      adminId,
      adminName,
      action: 'ADD_PLAYER_TO_TEAM',
      affectedParticipant: team.name,
      newValue: `${playerData.gamerTag} (Total: ${members.length}/5)`,
      details: `Added ${playerData.gamerTag} (${playerData.inGameRank || 'Player'}) to team "${team.name}". Squad now has ${members.length}/5 players.`,
    });

    return { success: true };
  } catch (err: any) {
    console.error('Error adding player to team:', err);
    return { success: false, error: err.message || 'Failed to add player' };
  }
}

/**
 * 8. Admin: Edit Player in Team Roster
 */
export async function adminEditPlayerInTeam(params: {
  tournamentId: string;
  teamId: string;
  playerIdentifier: string;
  updates: {
    gamerTag?: string;
    fullName?: string;
    phoneNumber?: string;
    inGameName?: string;
    inGameRank?: string;
    isCaptain?: boolean;
    role?: 'captain' | 'starter' | 'substitute' | 'member';
  };
  adminId: string;
  adminName: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { tournamentId, teamId, playerIdentifier, updates, adminId, adminName } = params;
    const tRef = doc(db, 'tournaments', tournamentId);
    const snap = await getDoc(tRef);
    if (!snap.exists()) return { success: false, error: 'Tournament not found' };

    const tournament = snap.data() as Tournament;
    const participants = [...(tournament.participants || [])];
    const teamIndex = participants.findIndex((p) => p.id === teamId);

    if (teamIndex === -1) return { success: false, error: 'Team not found' };

    const team = { ...participants[teamIndex] };
    const members = [...(team.teamMembers || [])];

    const playerIdx = members.findIndex(
      (m) => m.uid === playerIdentifier || m.gamerTag.toLowerCase() === playerIdentifier.toLowerCase()
    );

    if (playerIdx === -1) return { success: false, error: 'Player not found in roster' };

    const prev = members[playerIdx];
    members[playerIdx] = {
      ...prev,
      gamerTag: updates.gamerTag ? updates.gamerTag.trim() : prev.gamerTag,
      fullName: updates.fullName !== undefined ? updates.fullName.trim() : prev.fullName,
      phoneNumber: updates.phoneNumber !== undefined ? updates.phoneNumber.trim() : prev.phoneNumber,
      inGameName: updates.inGameName ? updates.inGameName.trim() : prev.inGameName,
      inGameRank: updates.inGameRank ? updates.inGameRank.trim() : prev.inGameRank,
      isCaptain: updates.isCaptain !== undefined ? updates.isCaptain : prev.isCaptain,
      role: updates.role || prev.role,
    };

    team.teamMembers = members;
    participants[teamIndex] = team;

    await updateDoc(tRef, sanitizeFirestoreData({
      participants,
      updatedAt: Date.now(),
    }));

    await logTournamentActivity({
      tournamentId,
      adminId,
      adminName,
      action: 'EDIT_PLAYER_IN_TEAM',
      affectedParticipant: team.name,
      oldValue: prev.gamerTag,
      newValue: updates.gamerTag || prev.gamerTag,
      details: `Updated info for player ${prev.gamerTag} in team "${team.name}"`,
    });

    return { success: true };
  } catch (err: any) {
    console.error('Error editing player in team:', err);
    return { success: false, error: err.message || 'Failed to edit player' };
  }
}

/**
 * Admin: Update player tournament presence (CONFIRMED, NOT_CONFIRMED, ABSENT)
 */
export async function adminUpdatePlayerPresence(params: {
  tournamentId: string;
  teamId?: string;
  playerId: string;
  presenceStatus: 'NOT_CONFIRMED' | 'CONFIRMED' | 'ABSENT';
  adminId: string;
  adminName: string;
  notes?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { tournamentId, teamId, playerId, presenceStatus, adminId, adminName, notes } = params;
    const now = Date.now();

    // 1. Update tournament document
    const tRef = doc(db, 'tournaments', tournamentId);
    const tSnap = await getDoc(tRef);
    if (!tSnap.exists()) return { success: false, error: 'Tournament not found' };

    const tournament = tSnap.data() as Tournament;
    const participants = [...(tournament.participants || [])];
    let affectedParticipantName = '';
    let playerGamerTag = '';
    let updated = false;

    for (let i = 0; i < participants.length; i++) {
      const p = participants[i];
      if (teamId && p.id === teamId) {
        affectedParticipantName = p.name;
        const members = [...(p.teamMembers || [])];
        const mIdx = members.findIndex(
          (m) => m.uid === playerId || m.gamerTag.toLowerCase() === playerId.toLowerCase()
        );
        if (mIdx !== -1) {
          playerGamerTag = members[mIdx].gamerTag;
          members[mIdx] = {
            ...members[mIdx],
            presenceStatus,
            presenceConfirmedBy: adminId,
            presenceConfirmedByName: adminName,
            presenceConfirmedAt: now,
            presenceNotes: notes || members[mIdx].presenceNotes,
          };
          participants[i] = { ...p, teamMembers: members };
          updated = true;
          break;
        }
      } else if (!teamId && p.teamMembers) {
        const members = [...p.teamMembers];
        const mIdx = members.findIndex(
          (m) => m.uid === playerId || m.gamerTag.toLowerCase() === playerId.toLowerCase()
        );
        if (mIdx !== -1) {
          affectedParticipantName = p.name;
          playerGamerTag = members[mIdx].gamerTag;
          members[mIdx] = {
            ...members[mIdx],
            presenceStatus,
            presenceConfirmedBy: adminId,
            presenceConfirmedByName: adminName,
            presenceConfirmedAt: now,
            presenceNotes: notes || members[mIdx].presenceNotes,
          };
          participants[i] = { ...p, teamMembers: members };
          updated = true;
          break;
        }
      } else if (p.id === playerId) {
        affectedParticipantName = p.name;
        playerGamerTag = p.name;
        participants[i] = {
          ...p,
          presenceStatus,
          presenceConfirmedBy: adminId,
          presenceConfirmedByName: adminName,
          presenceConfirmedAt: now,
          presenceNotes: notes || p.presenceNotes,
        };
        updated = true;
        break;
      }
    }

    if (updated) {
      await updateDoc(tRef, sanitizeFirestoreData({
        participants,
        updatedAt: now,
      }));
    }

    // 2. Also update tournamentTeamRegistrations document if exists
    if (teamId) {
      try {
        const regRef = doc(db, 'tournamentTeamRegistrations', teamId);
        const regSnap = await getDoc(regRef);
        if (regSnap.exists()) {
          const reg = regSnap.data() as TeamTournamentRegistration;
          const slots = reg.slots.map((s) => {
            if (s.playerId === playerId || (s.gamerTag && s.gamerTag.toLowerCase() === playerId.toLowerCase())) {
              playerGamerTag = playerGamerTag || s.gamerTag || 'Player';
              return {
                ...s,
                presenceStatus,
                presenceConfirmedBy: adminId,
                presenceConfirmedByName: adminName,
                presenceConfirmedAt: now,
                presenceNotes: notes || s.presenceNotes,
              };
            }
            return s;
          });
          await updateDoc(regRef, sanitizeFirestoreData({
            slots,
            updatedAt: now,
          }));
        }
      } catch (e) {
        console.warn('Could not sync presence to registration doc:', e);
      }
    }

    // 3. Log audit activity
    await logTournamentActivity({
      tournamentId,
      adminId,
      adminName,
      action: presenceStatus === 'CONFIRMED' ? 'CONFIRM_PRESENCE' : presenceStatus === 'ABSENT' ? 'MARK_ABSENT' : 'RESET_PRESENCE',
      affectedParticipant: affectedParticipantName || playerGamerTag,
      oldValue: 'STATUS_CHANGED',
      newValue: presenceStatus,
      details: `Admin ${adminName} set presence of ${playerGamerTag || playerId} to ${presenceStatus} in tournament "${tournament.name}".`,
    });

    return { success: true };
  } catch (err: any) {
    console.error('Error updating player presence:', err);
    return { success: false, error: err.message || 'Failed to update presence status' };
  }
}

/**
 * Admin: Complete Edit of Player Details in Team or Tournament
 */
export async function adminUpdatePlayerFullDetails(params: {
  tournamentId: string;
  teamId?: string;
  playerId: string;
  updates: {
    fullName?: string;
    phoneNumber?: string;
    inGameName?: string;
    inGameRank?: string;
    gamerTag?: string;
    presenceStatus?: 'NOT_CONFIRMED' | 'CONFIRMED' | 'ABSENT';
  };
  adminId: string;
  adminName: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { tournamentId, teamId, playerId, updates, adminId, adminName } = params;
    const now = Date.now();

    // 1. Update tournament doc
    const tRef = doc(db, 'tournaments', tournamentId);
    const tSnap = await getDoc(tRef);
    if (!tSnap.exists()) return { success: false, error: 'Tournament not found' };

    const tournament = tSnap.data() as Tournament;
    const participants = [...(tournament.participants || [])];

    let foundTeamName = '';
    let foundGamerTag = '';

    for (let i = 0; i < participants.length; i++) {
      const p = participants[i];
      if (teamId && p.id === teamId) {
        foundTeamName = p.name;
        const members = [...(p.teamMembers || [])];
        const mIdx = members.findIndex((m) => m.uid === playerId || m.gamerTag.toLowerCase() === playerId.toLowerCase());
        if (mIdx !== -1) {
          foundGamerTag = members[mIdx].gamerTag;
          members[mIdx] = {
            ...members[mIdx],
            fullName: updates.fullName !== undefined ? updates.fullName.trim() : members[mIdx].fullName,
            phoneNumber: updates.phoneNumber !== undefined ? updates.phoneNumber.trim() : members[mIdx].phoneNumber,
            inGameName: updates.inGameName !== undefined ? updates.inGameName.trim() : members[mIdx].inGameName,
            inGameRank: updates.inGameRank !== undefined ? updates.inGameRank.trim() : members[mIdx].inGameRank,
            gamerTag: updates.gamerTag !== undefined ? updates.gamerTag.trim() : members[mIdx].gamerTag,
            presenceStatus: updates.presenceStatus || members[mIdx].presenceStatus || 'NOT_CONFIRMED',
            playerStatus: 'INFORMATION_COMPLETE',
          };
          participants[i] = { ...p, teamMembers: members };
          break;
        }
      } else if (!teamId && p.id === playerId) {
        foundGamerTag = p.name;
        participants[i] = {
          ...p,
          fullName: updates.fullName !== undefined ? updates.fullName.trim() : p.fullName,
          phoneNumber: updates.phoneNumber !== undefined ? updates.phoneNumber.trim() : p.phoneNumber,
          inGameName: updates.inGameName !== undefined ? updates.inGameName.trim() : p.inGameName,
          inGameRank: updates.inGameRank !== undefined ? updates.inGameRank.trim() : p.inGameRank,
          name: updates.gamerTag !== undefined ? updates.gamerTag.trim() : p.name,
          presenceStatus: updates.presenceStatus || p.presenceStatus || 'NOT_CONFIRMED',
        };
        break;
      }
    }

    await updateDoc(tRef, sanitizeFirestoreData({
      participants,
      updatedAt: now,
    }));

    // 2. Also update tournamentTeamRegistrations doc if exists
    if (teamId) {
      try {
        const regRef = doc(db, 'tournamentTeamRegistrations', teamId);
        const regSnap = await getDoc(regRef);
        if (regSnap.exists()) {
          const reg = regSnap.data() as TeamTournamentRegistration;
          const slots = reg.slots.map((s) => {
            if (s.playerId === playerId || (s.gamerTag && s.gamerTag.toLowerCase() === playerId.toLowerCase())) {
              return {
                ...s,
                fullName: updates.fullName !== undefined ? updates.fullName.trim() : s.fullName,
                phoneNumber: updates.phoneNumber !== undefined ? updates.phoneNumber.trim() : s.phoneNumber,
                inGameName: updates.inGameName !== undefined ? updates.inGameName.trim() : s.inGameName,
                inGameRank: updates.inGameRank !== undefined ? updates.inGameRank.trim() : s.inGameRank,
                gamerTag: updates.gamerTag !== undefined ? updates.gamerTag.trim() : s.gamerTag,
                presenceStatus: updates.presenceStatus || s.presenceStatus || 'NOT_CONFIRMED',
                status: 'COMPLETED' as const,
                playerStatus: 'INFORMATION_COMPLETE' as const,
                informationConfirmed: true,
              };
            }
            return s;
          });
          await updateDoc(regRef, sanitizeFirestoreData({
            slots,
            updatedAt: now,
          }));
        }
      } catch (e) {
        console.warn('Could not update registration doc:', e);
      }
    }

    await logTournamentActivity({
      tournamentId,
      adminId,
      adminName,
      action: 'UPDATE_PLAYER_DETAILS',
      affectedParticipant: foundTeamName || foundGamerTag,
      oldValue: 'PREV_INFO',
      newValue: 'UPDATED_INFO',
      details: `Admin ${adminName} updated tournament details for player ${foundGamerTag || playerId}`,
    });

    return { success: true };
  } catch (err: any) {
    console.error('Error in adminUpdatePlayerFullDetails:', err);
    return { success: false, error: err.message || 'Failed to update player details' };
  }
}

/**
 * 9. Admin: Add Player to 1v1 Individual Tournament
 */
export async function adminAddIndividualPlayer(params: {
  tournamentId: string;
  playerData: {
    gamerTag: string;
    fullName?: string;
    phoneNumber?: string;
    inGameName?: string;
    inGameRank?: string;
    uid?: string;
    seed?: number;
  };
  status: 'CONFIRMED' | 'PENDING';
  adminId: string;
  adminName: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { tournamentId, playerData, status, adminId, adminName } = params;
    const tRef = doc(db, 'tournaments', tournamentId);
    const snap = await getDoc(tRef);
    if (!snap.exists()) return { success: false, error: 'Tournament not found' };

    const tournament = snap.data() as Tournament;
    const participants = [...(tournament.participants || [])];

    // Check duplicate
    if (participants.some((p) => p.name.trim().toLowerCase() === playerData.gamerTag.trim().toLowerCase())) {
      return { success: false, error: `Player "${playerData.gamerTag}" is already registered in this tournament.` };
    }

    if (status === 'CONFIRMED') {
      const activeConfirmed = participants.filter((p) => p.status !== 'WITHDRAWN' && p.status !== 'DISQUALIFIED').length;
      if (activeConfirmed >= tournament.maxParticipants) {
        return { success: false, error: `Tournament capacity reached (${tournament.maxParticipants} players maximum).` };
      }
    }

    const playerId = playerData.uid || `player_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    const newParticipant: TournamentParticipant = {
      id: playerId,
      name: playerData.gamerTag.trim(),
      fullName: playerData.fullName?.trim() || '',
      phoneNumber: playerData.phoneNumber?.trim() || '',
      inGameName: playerData.inGameName?.trim() || playerData.gamerTag.trim(),
      inGameRank: playerData.inGameRank?.trim() || 'Competitor',
      type: 'PLAYER',
      status: status,
      seed: playerData.seed || participants.length + 1,
      registeredAt: Date.now(),
    };

    participants.push(newParticipant);

    const activeConfirmed = participants.filter(
      (p) => p.status === 'CONFIRMED' || (!p.status && status === 'CONFIRMED')
    ).length;

    await updateDoc(tRef, sanitizeFirestoreData({
      participants,
      currentParticipantsCount: activeConfirmed,
      updatedAt: Date.now(),
    }));

    await logTournamentActivity({
      tournamentId,
      adminId,
      adminName,
      action: 'ADD_PLAYER_MANUAL',
      affectedParticipant: playerData.gamerTag.trim(),
      newValue: `Status: ${status}`,
      details: `Admin added player ${playerData.gamerTag} to individual tournament`,
    });

    return { success: true };
  } catch (err: any) {
    console.error('Error adding individual player:', err);
    return { success: false, error: err.message || 'Failed to add player' };
  }
}

/**
 * 10. Admin: Remove, Withdraw, or Disqualify Player in Individual Tournament
 */
export async function adminRemoveIndividualPlayer(params: {
  tournamentId: string;
  playerId: string;
  action: 'REMOVE' | 'WITHDRAW' | 'DISQUALIFY';
  reason?: string;
  adminId: string;
  adminName: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { tournamentId, playerId, action, reason, adminId, adminName } = params;
    const tRef = doc(db, 'tournaments', tournamentId);
    const snap = await getDoc(tRef);
    if (!snap.exists()) return { success: false, error: 'Tournament not found' };

    const tournament = snap.data() as Tournament;
    const participants = [...(tournament.participants || [])];
    const idx = participants.findIndex((p) => p.id === playerId);

    if (idx === -1) return { success: false, error: 'Player not found in tournament.' };

    const player = participants[idx];
    const hasBracket = Boolean(tournament.matches && tournament.matches.length > 0);
    const isLive = tournament.status === 'LIVE';

    let matches = [...(tournament.matches || [])];

    if (action === 'REMOVE') {
      if (isLive || hasBracket) {
        return {
          success: false,
          error: 'Cannot permanently delete player after bracket generation or during live play. Use "Withdraw" or "Disqualify" to preserve match records.',
        };
      }
      participants.splice(idx, 1);
    } else {
      const newStatus = action === 'WITHDRAW' ? 'WITHDRAWN' : 'DISQUALIFIED';
      participants[idx] = {
        ...player,
        status: newStatus,
        withdrawnAt: action === 'WITHDRAW' ? Date.now() : player.withdrawnAt,
        disqualifiedAt: action === 'DISQUALIFY' ? Date.now() : player.disqualifiedAt,
        statusReason: reason || `Admin action: ${action}`,
      };

      // For live uncompleted matches, handle forfeit
      matches = matches.map((m) => {
        if (m.status !== 'COMPLETED') {
          if (m.participantAId === playerId && m.participantB) {
            return {
              ...m,
              status: 'COMPLETED',
              winnerId: m.participantB.id,
              winnerName: m.participantB.name,
              loserId: playerId,
              loserName: player.name,
              scoreA: 0,
              scoreB: 1,
              completedAt: Date.now(),
              notes: `Player ${player.name} ${newStatus.toLowerCase()} by Admin. Opponent advances.`,
            };
          }
          if (m.participantBId === playerId && m.participantA) {
            return {
              ...m,
              status: 'COMPLETED',
              winnerId: m.participantA.id,
              winnerName: m.participantA.name,
              loserId: playerId,
              loserName: player.name,
              scoreA: 1,
              scoreB: 0,
              completedAt: Date.now(),
              notes: `Player ${player.name} ${newStatus.toLowerCase()} by Admin. Opponent advances.`,
            };
          }
        }
        return m;
      });
    }

    const activeCount = participants.filter(
      (p) => p.status === 'CONFIRMED' || (!p.status && action !== 'REMOVE')
    ).length;

    await updateDoc(tRef, sanitizeFirestoreData({
      participants,
      currentParticipantsCount: activeCount,
      matches,
      updatedAt: Date.now(),
    }));

    await logTournamentActivity({
      tournamentId,
      adminId,
      adminName,
      action: `${action}_PLAYER`,
      affectedParticipant: player.name,
      oldValue: player.status || 'CONFIRMED',
      newValue: action === 'REMOVE' ? 'REMOVED' : action === 'WITHDRAW' ? 'WITHDRAWN' : 'DISQUALIFIED',
      details: reason || `Admin performed ${action} on player "${player.name}"`,
    });

    return { success: true };
  } catch (err: any) {
    console.error('Error removing individual player:', err);
    return { success: false, error: err.message || 'Failed to remove/withdraw player' };
  }
}

/**
 * 11. Admin: Edit Player in Individual Tournament
 */
export async function adminEditIndividualPlayer(params: {
  tournamentId: string;
  playerId: string;
  updates: {
    name?: string;
    fullName?: string;
    phoneNumber?: string;
    inGameName?: string;
    inGameRank?: string;
    seed?: number;
  };
  adminId: string;
  adminName: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { tournamentId, playerId, updates, adminId, adminName } = params;
    const tRef = doc(db, 'tournaments', tournamentId);
    const snap = await getDoc(tRef);
    if (!snap.exists()) return { success: false, error: 'Tournament not found' };

    const tournament = snap.data() as Tournament;
    const participants = [...(tournament.participants || [])];
    const idx = participants.findIndex((p) => p.id === playerId);

    if (idx === -1) return { success: false, error: 'Player not found' };

    const prev = participants[idx];
    participants[idx] = {
      ...prev,
      name: updates.name ? updates.name.trim() : prev.name,
      fullName: updates.fullName !== undefined ? updates.fullName.trim() : prev.fullName,
      phoneNumber: updates.phoneNumber !== undefined ? updates.phoneNumber.trim() : prev.phoneNumber,
      inGameName: updates.inGameName ? updates.inGameName.trim() : prev.inGameName,
      inGameRank: updates.inGameRank ? updates.inGameRank.trim() : prev.inGameRank,
      seed: updates.seed !== undefined ? updates.seed : prev.seed,
    };

    // Propagate to uncompleted matches
    const matches = (tournament.matches || []).map((m) => {
      const updated = { ...m };
      if (updated.participantAId === playerId && updated.participantA) {
        updated.participantA = { ...updated.participantA, name: updates.name ? updates.name.trim() : prev.name };
        updated.participantAName = updates.name ? updates.name.trim() : prev.name;
      }
      if (updated.participantBId === playerId && updated.participantB) {
        updated.participantB = { ...updated.participantB, name: updates.name ? updates.name.trim() : prev.name };
        updated.participantBName = updates.name ? updates.name.trim() : prev.name;
      }
      return updated;
    });

    await updateDoc(tRef, sanitizeFirestoreData({
      participants,
      matches,
      updatedAt: Date.now(),
    }));

    await logTournamentActivity({
      tournamentId,
      adminId,
      adminName,
      action: 'EDIT_PLAYER_DETAILS',
      affectedParticipant: updates.name || prev.name,
      details: `Updated details for ${updates.name || prev.name}`,
    });

    return { success: true };
  } catch (err: any) {
    console.error('Error editing individual player:', err);
    return { success: false, error: err.message || 'Failed to edit player' };
  }
}

/**
 * 12. Admin: Update Participant Status (CONFIRMED, PENDING, WITHDRAWN, DISQUALIFIED)
 */
export async function adminUpdateParticipantStatus(params: {
  tournamentId: string;
  participantId: string;
  newStatus: 'CONFIRMED' | 'PENDING' | 'WITHDRAWN' | 'DISQUALIFIED';
  reason?: string;
  adminId: string;
  adminName: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { tournamentId, participantId, newStatus, reason, adminId, adminName } = params;
    const tRef = doc(db, 'tournaments', tournamentId);
    const snap = await getDoc(tRef);
    if (!snap.exists()) return { success: false, error: 'Tournament not found' };

    const tournament = snap.data() as Tournament;
    const participants = [...(tournament.participants || [])];
    const idx = participants.findIndex((p) => p.id === participantId);

    if (idx === -1) return { success: false, error: 'Participant not found' };

    const prev = participants[idx];
    const oldStatus = prev.status || 'CONFIRMED';

    participants[idx] = {
      ...prev,
      status: newStatus,
      statusReason: reason || prev.statusReason,
      withdrawnAt: newStatus === 'WITHDRAWN' ? Date.now() : prev.withdrawnAt,
      disqualifiedAt: newStatus === 'DISQUALIFIED' ? Date.now() : prev.disqualifiedAt,
    };

    const activeConfirmed = participants.filter((p) => p.status === 'CONFIRMED').length;

    await updateDoc(tRef, sanitizeFirestoreData({
      participants,
      currentParticipantsCount: activeConfirmed,
      updatedAt: Date.now(),
    }));

    await logTournamentActivity({
      tournamentId,
      adminId,
      adminName,
      action: 'SET_PARTICIPANT_STATUS',
      affectedParticipant: prev.name,
      oldValue: oldStatus,
      newValue: newStatus,
      details: `Status set to ${newStatus}${reason ? ` (${reason})` : ''}`,
    });

    return { success: true };
  } catch (err: any) {
    console.error('Error updating participant status:', err);
    return { success: false, error: err.message || 'Failed to update status' };
  }
}

/**
 * 13. Admin: Update Seeds for Participants
 */
export async function adminUpdateSeeds(params: {
  tournamentId: string;
  seeds: Array<{ participantId: string; seed: number }>;
  adminId: string;
  adminName: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { tournamentId, seeds, adminId, adminName } = params;
    const tRef = doc(db, 'tournaments', tournamentId);
    const snap = await getDoc(tRef);
    if (!snap.exists()) return { success: false, error: 'Tournament not found' };

    const tournament = snap.data() as Tournament;
    const participants = [...(tournament.participants || [])];

    const seedMap = new Map(seeds.map((s) => [s.participantId, s.seed]));

    const updated = participants.map((p) => {
      if (seedMap.has(p.id)) {
        return { ...p, seed: seedMap.get(p.id) };
      }
      return p;
    });

    await updateDoc(tRef, sanitizeFirestoreData({
      participants: updated,
      updatedAt: Date.now(),
    }));

    await logTournamentActivity({
      tournamentId,
      adminId,
      adminName,
      action: 'UPDATE_SEEDS',
      details: `Admin updated seeding rankings for ${seeds.length} participants`,
    });

    return { success: true };
  } catch (err: any) {
    console.error('Error updating seeds:', err);
    return { success: false, error: err.message || 'Failed to update seeds' };
  }
}

/**
 * 14. Admin: Redraw Tournament Bracket (Random Seeding)
 * Strict Lock Rule:
 * If any match has started (LIVE, COMPLETED, CONFIRMED, or actualStartedAt > 0),
 * redrawing is FORBIDDEN and returns an explicit error.
 */
export async function redrawTournamentBracket(params: {
  tournamentId: string;
  adminId: string;
  adminName: string;
  teamRegistrations?: TeamTournamentRegistration[];
}): Promise<{ success: boolean; error?: string; matches?: TournamentMatch[] }> {
  try {
    const { tournamentId, adminId, adminName, teamRegistrations = [] } = params;
    const tRef = doc(db, 'tournaments', tournamentId);
    const snap = await getDoc(tRef);
    if (!snap.exists()) return { success: false, error: 'Tournament not found' };

    const tournament = snap.data() as Tournament;
    const existingMatches = tournament.matches || [];

    // STRICT LOCK CHECK
    const hasStarted = existingMatches.some(
      (m) =>
        m.status === 'LIVE' ||
        m.status === 'COMPLETED' ||
        m.status === 'CONFIRMED' ||
        m.status === 'PENDING_ADMIN_APPROVAL' ||
        (m.actualStartedAt !== undefined && m.actualStartedAt > 0)
    );

    if (hasStarted) {
      return {
        success: false,
        error: 'Draw is locked because tournament matches have already started or been played.',
      };
    }

    // Detect confirmed teams dynamically
    const confirmedTeams = getEligibleConfirmedTournamentTeams(tournament, teamRegistrations);
    if (confirmedTeams.length < 2) {
      return {
        success: false,
        error: `At least 2 confirmed teams are required to draw the bracket (found ${confirmedTeams.length}).`,
      };
    }

    // Generate random tournament draw
    const { matches: newMatches, orderedParticipants } = generateRandomTournamentDraw(
      tournamentId,
      confirmedTeams,
      tournament.format || 'SINGLE_ELIMINATION',
      true
    );

    await updateDoc(
      tRef,
      sanitizeFirestoreData({
        matches: newMatches,
        participants: orderedParticipants,
        status: tournament.status === 'DRAFT' || tournament.status === 'REGISTRATION_OPEN' ? 'UPCOMING' : tournament.status,
        updatedAt: Date.now(),
      })
    );

    await logTournamentActivity({
      tournamentId,
      adminId,
      adminName,
      action: 'REDRAW_TOURNAMENT',
      details: `Admin redrew matchups randomly for ${confirmedTeams.length} confirmed teams (${newMatches.length} matches created).`,
    });

    return { success: true, matches: newMatches };
  } catch (err: any) {
    console.error('Error redrawing tournament bracket:', err);
    return { success: false, error: err.message || 'Failed to redraw tournament' };
  }
}

/**
 * 14b. Admin: Regenerate Official Tournament Bracket
 * Warns before regeneration, regenerates bracket with active confirmed participants.
 */
export async function adminRegenerateBracket(params: {
  tournamentId: string;
  adminId: string;
  adminName: string;
  teamRegistrations?: TeamTournamentRegistration[];
}): Promise<{ success: boolean; error?: string; matches?: TournamentMatch[] }> {
  return redrawTournamentBracket(params);
}

/**
 * 15. Admin: Cancel Tournament with Notification & Reason
 */
export async function adminCancelTournament(params: {
  tournamentId: string;
  reason?: string;
  adminId: string;
  adminName: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { tournamentId, reason, adminId, adminName } = params;
    const tRef = doc(db, 'tournaments', tournamentId);
    const snap = await getDoc(tRef);
    if (!snap.exists()) return { success: false, error: 'Tournament not found' };

    const tournament = snap.data() as Tournament;

    await updateDoc(tRef, sanitizeFirestoreData({
      status: 'CANCELLED',
      updatedAt: Date.now(),
    }));

    const userIds = extractParticipantUserIds(tournament);
    if (userIds.length > 0) {
      await sendBulkNotification({
        userIds,
        type: 'TOURNAMENT_ANNOUNCEMENT',
        title: `❌ TOURNAMENT CANCELLED - ${tournament.name}`,
        message: `The tournament "${tournament.name}" has been cancelled by Nexus Tournament Commission.${reason ? ` Reason: ${reason}` : ''}`,
        data: { tournamentId },
      });
    }

    await logTournamentActivity({
      tournamentId,
      adminId,
      adminName,
      action: 'CANCEL_TOURNAMENT',
      oldValue: tournament.status,
      newValue: 'CANCELLED',
      details: reason || 'Tournament cancelled by admin',
    });

    return { success: true };
  } catch (err: any) {
    console.error('Error cancelling tournament:', err);
    return { success: false, error: err.message || 'Failed to cancel tournament' };
  }
}

/**
 * 16. Admin: Reschedule Match (Station & Time) with conflict detection
 */
export async function adminRescheduleMatch(params: {
  tournamentId: string;
  matchId: string;
  scheduledTime?: number;
  station?: string;
  durationMinutes?: number;
  notes?: string;
  adminId: string;
  adminName: string;
}): Promise<{ success: boolean; error?: string; conflictWarning?: string }> {
  try {
    const {
      tournamentId,
      matchId,
      scheduledTime,
      station,
      durationMinutes = 60,
      notes,
      adminId,
      adminName,
    } = params;
    const tRef = doc(db, 'tournaments', tournamentId);
    const snap = await getDoc(tRef);
    if (!snap.exists()) return { success: false, error: 'Tournament not found' };

    const tournament = snap.data() as Tournament;
    const matches = [...(tournament.matches || [])];
    const matchIdx = matches.findIndex((m) => m.id === matchId);

    if (matchIdx === -1) return { success: false, error: 'Match not found' };

    const match = { ...matches[matchIdx] };
    if (scheduledTime !== undefined) match.scheduledTime = scheduledTime;
    if (station !== undefined) match.station = station;
    if (notes !== undefined) match.notes = notes;
    match.updatedAt = Date.now();

    // Check for station time overlap conflicts with other matches in this tournament
    let conflictWarning: string | undefined = undefined;
    if (match.station && match.scheduledTime) {
      const windowMs = durationMinutes * 60 * 1000;
      const conflicting = matches.find(
        (other) =>
          other.id !== matchId &&
          other.station &&
          other.station.trim().toLowerCase() === match.station!.trim().toLowerCase() &&
          other.scheduledTime &&
          Math.abs(other.scheduledTime - match.scheduledTime!) < windowMs
      );

      if (conflicting) {
        const otherTimeStr = new Date(conflicting.scheduledTime!).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        });
        conflictWarning = `⚠️ Station Conflict: Match #${conflicting.matchNumber} (${conflicting.participantAName || 'TBD'} vs ${conflicting.participantBName || 'TBD'}) is also assigned to "${match.station}" around ${otherTimeStr}.`;
      }
    }

    matches[matchIdx] = match;

    await updateDoc(
      tRef,
      sanitizeFirestoreData({
        matches,
        updatedAt: Date.now(),
      })
    );

    await logTournamentActivity({
      tournamentId,
      adminId,
      adminName,
      action: 'RESCHEDULE_MATCH',
      affectedParticipant: `${match.participantAName || 'TBD'} vs ${match.participantBName || 'TBD'}`,
      details: `Match #${match.matchNumber} set to station "${match.station || 'Unassigned'}"${match.scheduledTime ? ` at ${new Date(match.scheduledTime).toLocaleString()}` : ''}${conflictWarning ? ` [Warning: ${conflictWarning}]` : ''}`,
    });

    return { success: true, conflictWarning };
  } catch (err: any) {
    console.error('Error rescheduling match:', err);
    return { success: false, error: err.message || 'Failed to reschedule match' };
  }
}

/**
 * Operational Staff Check-In for Individual or Team Tournament Participants
 */
export async function staffCheckInTournamentParticipant(
  tournamentId: string,
  participantId: string,
  staffPlayer: Player
): Promise<{ success: boolean; error?: string }> {
  try {
    const tRef = doc(db, 'tournaments', tournamentId);
    const snap = await getDoc(tRef);
    if (!snap.exists()) {
      return { success: false, error: 'Tournament not found' };
    }

    const tData = snap.data() as Tournament;
    const participants = [...(tData.participants || [])];
    const pIdx = participants.findIndex((p) => p.id === participantId);

    if (pIdx === -1) {
      return { success: false, error: 'Participant not found in tournament roster' };
    }

    const now = Date.now();
    participants[pIdx] = {
      ...participants[pIdx],
      checkedIn: true,
      checkedInAt: now,
      checkedInBy: staffPlayer.gamerTag,
    };

    await updateDoc(
      tRef,
      sanitizeFirestoreData({
        participants,
        updatedAt: now,
      })
    );

    // Notify participant if solo
    if (participants[pIdx].id && !participants[pIdx].id.startsWith('team_')) {
      await sendNotification({
        userId: participants[pIdx].id,
        type: 'TOURNAMENT_ANNOUNCEMENT',
        title: 'Tournament Check-In Confirmed',
        message: `You are officially checked in for "${tData.name}" by Nexus staff. Please remain near your station!`,
        data: { tournamentId },
      });
    }

    await logTournamentActivity({
      tournamentId,
      adminId: staffPlayer.uid,
      adminName: staffPlayer.gamerTag,
      action: 'CHECK_IN_PARTICIPANT',
      affectedParticipant: participants[pIdx].name,
      details: `Staff checked in participant "${participants[pIdx].name}" on tournament arrival.`,
    });

    return { success: true };
  } catch (err: any) {
    console.error('Error checking in tournament participant:', err);
    return { success: false, error: err.message || 'Failed to check in participant' };
  }
}

/**
 * Operational Staff Check-In for 5v5 Tournament Teams
 */
export async function staffCheckInTournamentTeam(
  tournamentId: string,
  teamRegistrationId: string,
  staffPlayer: Player
): Promise<{ success: boolean; error?: string }> {
  try {
    const regRef = doc(db, 'tournamentTeamRegistrations', teamRegistrationId);
    const snap = await getDoc(regRef);
    if (!snap.exists()) {
      return { success: false, error: 'Team registration record not found' };
    }

    const regData = snap.data() as TeamTournamentRegistration;
    const now = Date.now();

    await updateDoc(
      regRef,
      sanitizeFirestoreData({
        checkedIn: true,
        checkedInAt: now,
        checkedInBy: staffPlayer.gamerTag,
        updatedAt: now,
      })
    );

    // Also update in tournaments document if present
    const tRef = doc(db, 'tournaments', tournamentId);
    const tSnap = await getDoc(tRef);
    if (tSnap.exists()) {
      const tData = tSnap.data() as Tournament;
      const participants = [...(tData.participants || [])];
      const pIdx = participants.findIndex(
        (p) => p.id === regData.teamId || p.id === teamRegistrationId || p.name === regData.teamName
      );
      if (pIdx !== -1) {
        participants[pIdx] = {
          ...participants[pIdx],
          checkedIn: true,
          checkedInAt: now,
          checkedInBy: staffPlayer.gamerTag,
        };
        await updateDoc(
          tRef,
          sanitizeFirestoreData({
            participants,
            updatedAt: now,
          })
        );
      }
    }

    // Notify team captain
    if (regData.captainId) {
      await sendNotification({
        userId: regData.captainId,
        type: 'TOURNAMENT_ANNOUNCEMENT',
        title: 'Team Check-In Confirmed',
        message: `Your team "${regData.teamName}" is officially checked in for the tournament by Nexus staff.`,
        data: { tournamentId },
      });
    }

    await logTournamentActivity({
      tournamentId,
      adminId: staffPlayer.uid,
      adminName: staffPlayer.gamerTag,
      action: 'CHECK_IN_TEAM',
      affectedParticipant: regData.teamName,
      details: `Staff checked in team "${regData.teamName}" (Captain: ${regData.captainGamerTag || regData.captainFullName || 'Unknown'}).`,
    });

    return { success: true };
  } catch (err: any) {
    console.error('Error checking in tournament team:', err);
    return { success: false, error: err.message || 'Failed to check in team' };
  }
}



