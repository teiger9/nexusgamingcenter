import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  runTransaction,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
  Season,
  SeasonPlayerGameRating,
  SeasonPlayerOverall,
  HallOfFameEntry,
  HallOfFameAnnouncement,
  PlayerSeasonHistoryItem,
  LeaderboardEntry,
  GameCategory,
  PlayerGameRating,
  Player,
  Team,
} from '../types';
import { INITIAL_RATING, PLACEMENT_GAMES_REQUIRED } from '../lib/elo';
import { sanitizeFirestoreData } from './matchService';
import { COMPETITIVE_GAMES } from '../lib/ranks';

/**
 * Season Soft MMR Reset Formula:
 * New Season MMR = 1000 + ((Previous Season MMR - 1000) * 0.75)
 * Round to whole numbers.
 */
export function calculateSoftResetMMR(previousMMR: number = INITIAL_RATING): number {
  const base = 1000;
  const delta = previousMMR - base;
  const newMMR = Math.round(base + delta * 0.75);
  return Math.max(100, newMMR);
}

/**
 * Returns the Hall of Fame Season schedule:
 * Season 1: October 2 → November 18 (47 Days 12 Hours)
 * Subsequent seasons: 47 Days 12 Hours (or standard competitive cycle)
 */
export function getStandardSeasonDates(date: Date = new Date()): {
  seasonNumber: number;
  seasonName: string;
  year: number;
  startDate: number;
  endDate: number;
} {
  const year = date.getFullYear();

  // Official Hall of Fame Season 1 schedule: October 2 → November 18 (47 Days 12 Hours)
  const season1Start = new Date(year, 9, 2, 0, 0, 0, 0).getTime(); // Oct 2, 00:00:00
  const season1End = new Date(year, 10, 18, 12, 0, 0, 0).getTime(); // Nov 18, 12:00:00 (47d 12h)

  return {
    seasonNumber: 1,
    seasonName: 'Season 1',
    year,
    startDate: season1Start,
    endDate: season1End,
  };
}

/**
 * Ensure an active season exists in Firestore.
 * If none exists, bootstraps Season 1 (or current active season) and default seed records.
 */
export async function ensureDefaultActiveSeason(): Promise<Season> {
  try {
    const seasonsRef = collection(db, 'seasons');
    const q = query(seasonsRef, where('status', '==', 'ACTIVE'), limit(1));
    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
      const active = snapshot.docs[0].data() as Season;
      // If Season 1 was seeded with an outdated legacy end date in the past, update it to canonical Oct 2 -> Nov 18
      if (active.number === 1 && active.endDate <= Date.now()) {
        const canonicalDates = getStandardSeasonDates();
        const updated = {
          ...active,
          startDate: canonicalDates.startDate,
          endDate: canonicalDates.endDate,
        };
        await updateDoc(doc(db, 'seasons', active.id), sanitizeFirestoreData({
          startDate: canonicalDates.startDate,
          endDate: canonicalDates.endDate,
        }));
        return updated;
      }
      return active;
    }

    // Check if any seasons exist at all
    const allSeasonsSnap = await getDocs(query(seasonsRef, orderBy('number', 'desc'), limit(1)));
    if (!allSeasonsSnap.empty) {
      // Re-activate the latest season or create the next one
      const latest = allSeasonsSnap.docs[0].data() as Season;
      if (latest.status === 'COMPLETED') {
        const nextNum = (latest.number || 1) + 1;
        const now = Date.now();
        const duration = 47.5 * 24 * 60 * 60 * 1000; // 47 Days 12 Hours
        const newSeasonId = `season_${nextNum}`;
        const newSeason: Season = {
          id: newSeasonId,
          number: nextNum,
          name: `Season ${nextNum}`,
          year: new Date(now).getFullYear(),
          status: 'ACTIVE',
          startDate: now,
          endDate: now + duration,
          createdAt: now,
          totalMatches: 0,
          totalPlayers: 0,
          champions: [],
        };
        await setDoc(doc(db, 'seasons', newSeasonId), sanitizeFirestoreData(newSeason));
        return newSeason;
      }
      return latest;
    }

    // Initialize Default Season 1 (October 2 -> November 18: 47 Days 12 Hours)
    const defaults = getStandardSeasonDates();
    const season1Id = 'season_1';
    const initialSeason: Season = {
      id: season1Id,
      number: 1,
      name: 'Season 1',
      year: defaults.year,
      status: 'ACTIVE',
      startDate: defaults.startDate,
      endDate: defaults.endDate,
      createdAt: Date.now(),
      totalMatches: 0,
      totalPlayers: 0,
      champions: [],
    };

    await setDoc(doc(db, 'seasons', season1Id), sanitizeFirestoreData(initialSeason));

    // Also populate default all-time player stats into Season 1 for active players
    try {
      const [allPlayersSnap, allRatingsSnap] = await Promise.all([
        getDocs(collection(db, 'players')),
        getDocs(collection(db, 'playerGameRatings')),
      ]);

      const batch = writeBatch(db);

      allRatingsSnap.docs.forEach((d) => {
        const pgr = d.data() as PlayerGameRating;
        const sRatingId = `${season1Id}_${pgr.playerId}_${pgr.gameId}`;
        const sRating: SeasonPlayerGameRating = {
          id: sRatingId,
          seasonId: season1Id,
          seasonNumber: 1,
          playerId: pgr.playerId,
          gamerTag: pgr.gamerTag,
          gameId: pgr.gameId,
          gameName: pgr.gameName,
          gameCategory: pgr.gameCategory,
          startingRating: pgr.rating || INITIAL_RATING,
          rating: pgr.rating || INITIAL_RATING,
          eloRating: pgr.eloRating || pgr.rating || INITIAL_RATING,
          performanceRating: pgr.performanceRating || pgr.rating || INITIAL_RATING,
          isProvisional: pgr.isProvisional ?? ((pgr.placementGames || 0) < PLACEMENT_GAMES_REQUIRED),
          placementGames: pgr.placementGames || 0,
          placementGamesRequired: PLACEMENT_GAMES_REQUIRED,
          sumOpponentRatings: pgr.sumOpponentRatings || 0,
          averageOpponentRating: pgr.averageOpponentRating || INITIAL_RATING,
          winStreak: pgr.winStreak || 0,
          currentWinStreak: pgr.currentWinStreak || 0,
          bestWinStreak: pgr.bestWinStreak || 0,
          gamesPlayed: pgr.gamesPlayed || 0,
          wins: pgr.wins || 0,
          losses: pgr.losses || 0,
          draws: pgr.draws || 0,
          updatedAt: Date.now(),
        };
        batch.set(doc(db, 'seasonPlayerGameRatings', sRatingId), sanitizeFirestoreData(sRating));
      });

      allPlayersSnap.docs.forEach((d) => {
        const p = d.data() as Player;
        const sOverallId = `${season1Id}_${p.uid}`;
        const sOverall: SeasonPlayerOverall = {
          id: sOverallId,
          seasonId: season1Id,
          seasonNumber: 1,
          playerId: p.uid,
          gamerTag: p.gamerTag,
          fullName: p.fullName,
          overallRating: p.overallRating || INITIAL_RATING,
          gamesPlayed: p.totalGames || 0,
          wins: p.totalWins || 0,
          losses: p.totalLosses || 0,
          draws: p.totalDraws || 0,
          currentWinStreak: p.currentWinStreak || 0,
          bestWinStreak: p.bestWinStreak || 0,
          updatedAt: Date.now(),
        };
        batch.set(doc(db, 'seasonPlayerOverall', sOverallId), sanitizeFirestoreData(sOverall));
      });

      await batch.commit();
    } catch (err) {
      console.warn('Could not backfill season 1 stats:', err);
    }

    return initialSeason;
  } catch (err) {
    console.error('Failed to ensure default active season:', err);
    // Fallback in-memory season
    const defaults = getStandardSeasonDates();
    return {
      id: 'season_1',
      number: 1,
      name: 'Season 1',
      year: defaults.year,
      status: 'ACTIVE',
      startDate: defaults.startDate,
      endDate: defaults.endDate,
      createdAt: Date.now(),
    };
  }
}

/**
 * Fetch the current active season, automatically recovering or processing if expired.
 */
export async function getActiveSeason(): Promise<Season | null> {
  try {
    const q = query(collection(db, 'seasons'), where('status', 'in', ['ACTIVE', 'PROCESSING']), limit(1));
    const snap = await getDocs(q);
    if (!snap.empty) {
      const s = snap.docs[0].data() as Season;
      if (s.status === 'PROCESSING' || s.endDate <= Date.now()) {
        const transRes = await checkAndProcessExpiredSeason();
        if (transRes?.newSeason) return transRes.newSeason;
        if (transRes?.activeSeason) return transRes.activeSeason;
      }
      return s;
    }
    const recRes = await checkAndProcessExpiredSeason();
    if (recRes?.newSeason) return recRes.newSeason;
    if (recRes?.activeSeason) return recRes.activeSeason;
    return await ensureDefaultActiveSeason();
  } catch (err) {
    console.error('Error fetching active season:', err);
    return null;
  }
}

/**
 * Subscribe to the active season in real-time.
 * If the season has expired (endDate <= Date.now()), signals isProcessing: true
 * and triggers automated idempotent transition into the next season.
 */
export function subscribeToActiveSeason(
  callback: (season: Season | null, isProcessing?: boolean) => void
) {
  const q = query(collection(db, 'seasons'), where('status', 'in', ['ACTIVE', 'ENDED', 'PROCESSING']), limit(1));
  return onSnapshot(
    q,
    async (snap) => {
      if (!snap.empty) {
        const season = snap.docs[0].data() as Season;
        if (season.status === 'PROCESSING') {
          callback(season, true);
        } else if (season.status === 'ACTIVE' && season.endDate <= Date.now()) {
          // Season has ended: trigger transition to ENDED without creating fake champions
          callback(season, false);
          checkAndProcessExpiredSeason();
        } else {
          callback(season, false);
        }
      } else {
        // No active season document found in query: check latest
        const allSnap = await getDocs(query(collection(db, 'seasons'), orderBy('number', 'desc'), limit(1)));
        if (!allSnap.empty) {
          const latest = allSnap.docs[0].data() as Season;
          callback(latest, false);
          return;
        }
        ensureDefaultActiveSeason()
          .then((s) => callback(s, false))
          .catch(() => callback(null, false));
      }
    },
    (err) => {
      console.error('Active season listener error:', err);
      callback(null, false);
    }
  );
}

/**
 * Subscribe to Hall of Fame in real-time
 * Rule 5: Only official Hall of Fame records (status: 'OFFICIAL') are emitted
 */
export function subscribeToHallOfFame(callback: (entries: HallOfFameEntry[]) => void) {
  const q = query(collection(db, 'hallOfFame'), orderBy('seasonNumber', 'desc'), orderBy('gameName', 'asc'));
  return onSnapshot(
    q,
    (snap) => {
      const officialEntries = snap.docs
        .map((d) => d.data() as HallOfFameEntry)
        .filter((e) => e && e.status === 'OFFICIAL' && Boolean(e.championId || e.playerId || e.teamId));
      callback(officialEntries);
    },
    (err) => {
      console.error('Hall of Fame listener error:', err);
      callback([]);
    }
  );
}

/**
 * Fetch all seasons sorted by season number descending
 */
export async function fetchAllSeasons(): Promise<Season[]> {
  try {
    const q = query(collection(db, 'seasons'), orderBy('number', 'desc'));
    const snap = await getDocs(q);
    if (snap.empty) {
      const def = await ensureDefaultActiveSeason();
      return [def];
    }
    return snap.docs.map((d) => d.data() as Season);
  } catch (err) {
    console.error('Error fetching all seasons:', err);
    return [];
  }
}

/**
 * Fetch a single season by ID
 */
export async function fetchSeasonById(seasonId: string): Promise<Season | null> {
  try {
    const snap = await getDoc(doc(db, 'seasons', seasonId));
    if (snap.exists()) {
      return snap.data() as Season;
    }
    return null;
  } catch (err) {
    console.error('Error fetching season by id:', err);
    return null;
  }
}

/**
 * Fetch seasonal leaderboard for a specific season and game
 */
export async function fetchSeasonLeaderboard(params: {
  seasonId: string;
  gameIdFilter?: string;
  categoryFilter?: 'ALL' | GameCategory;
}): Promise<LeaderboardEntry[]> {
  try {
    const { seasonId, gameIdFilter, categoryFilter = 'ALL' } = params;

    // Specific game query
    if (gameIdFilter && gameIdFilter !== 'all') {
      const isFcFilter = gameIdFilter === 'fc' || gameIdFilter === 'fc26' || gameIdFilter === 'fc27';
      let docs: any[] = [];

      if (isFcFilter) {
        // Fetch any FC records (fc, legacy fc26, legacy fc27) and merge by player
        const qUnified = query(
          collection(db, 'seasonPlayerGameRatings'),
          where('seasonId', '==', seasonId),
          where('gameId', 'in', ['fc', 'fc26', 'fc27'])
        );
        const snap = await getDocs(qUnified);
        const playerMap = new Map<string, SeasonPlayerGameRating>();
        snap.docs.forEach((d) => {
          const item = d.data() as SeasonPlayerGameRating;
          const ex = playerMap.get(item.playerId);
          if (!ex) {
            playerMap.set(item.playerId, { ...item, gameId: 'fc', gameName: 'FC', gameCategory: 'FC' });
          } else {
            playerMap.set(item.playerId, {
              ...ex,
              rating: Math.max(ex.rating, item.rating),
              wins: (ex.wins || 0) + (item.wins || 0),
              losses: (ex.losses || 0) + (item.losses || 0),
              draws: (ex.draws || 0) + (item.draws || 0),
              gamesPlayed: (ex.gamesPlayed || 0) + (item.gamesPlayed || 0),
              gameId: 'fc',
              gameName: 'FC',
              gameCategory: 'FC',
            });
          }
        });
        const sortedItems = Array.from(playerMap.values()).sort((a, b) => b.rating - a.rating);
        let rank = 1;
        return sortedItems.map((data) => {
          const total = Math.max(data.gamesPlayed || 0, data.placementGames || 0);
          const winRate = total > 0 ? Math.round(((data.wins || 0) / total) * 100) : 0;
          const isProvisional = total < 10;
          return {
            rank: rank++,
            playerId: data.playerId,
            gamerTag: data.gamerTag,
            fullName: data.gamerTag,
            rating: data.rating,
            gamesPlayed: total,
            wins: data.wins || 0,
            losses: data.losses || 0,
            draws: data.draws || 0,
            winRate,
            isProvisional,
            placementGames: Math.min(10, total),
            currentWinStreak: data.currentWinStreak || 0,
            bestWinStreak: data.bestWinStreak || 0,
            gameId: 'fc',
            gameName: 'FC',
            gameCategory: 'FC',
          };
        });
      }

      const q = query(
        collection(db, 'seasonPlayerGameRatings'),
        where('seasonId', '==', seasonId),
        where('gameId', '==', gameIdFilter),
        orderBy('rating', 'desc')
      );
      const snap = await getDocs(q);

      let rank = 1;
      return snap.docs.map((d) => {
        const data = d.data() as SeasonPlayerGameRating;
        const total = Math.max(data.gamesPlayed || 0, data.placementGames || 0);
        const winRate = total > 0 ? Math.round(((data.wins || 0) / total) * 100) : 0;
        const isProvisional = total < 10;
        return {
          rank: data.finalRank || rank++,
          playerId: data.playerId,
          gamerTag: data.gamerTag,
          fullName: data.gamerTag,
          rating: data.rating,
          gamesPlayed: total,
          wins: data.wins || 0,
          losses: data.losses || 0,
          draws: data.draws || 0,
          winRate,
          isProvisional,
          placementGames: Math.min(10, total),
          currentWinStreak: data.currentWinStreak || 0,
          bestWinStreak: data.bestWinStreak || 0,
          gameId: data.gameId,
          gameName: data.gameName,
          gameCategory: data.gameCategory,
        };
      });
    }

    // Category filter
    if (categoryFilter !== 'ALL') {
      const q = query(
        collection(db, 'seasonPlayerGameRatings'),
        where('seasonId', '==', seasonId),
        where('gameCategory', '==', categoryFilter),
        orderBy('rating', 'desc')
      );
      const snap = await getDocs(q);

      const map = new Map<string, LeaderboardEntry>();
      snap.docs.forEach((d) => {
        const data = d.data() as SeasonPlayerGameRating;
        const existing = map.get(data.playerId);
        if (!existing || data.rating > existing.rating) {
          const total = Math.max(data.gamesPlayed || 0, data.placementGames || 0);
          const winRate = total > 0 ? Math.round(((data.wins || 0) / total) * 100) : 0;
          const isProvisional = total < 10;
          map.set(data.playerId, {
            rank: 0,
            playerId: data.playerId,
            gamerTag: data.gamerTag,
            fullName: data.gamerTag,
            rating: data.rating,
            gamesPlayed: total,
            wins: data.wins || 0,
            losses: data.losses || 0,
            draws: data.draws || 0,
            winRate,
            isProvisional,
            placementGames: Math.min(10, total),
            currentWinStreak: data.currentWinStreak || 0,
            bestWinStreak: data.bestWinStreak || 0,
            gameId: data.gameId,
            gameName: data.gameName,
            gameCategory: data.gameCategory,
          });
        }
      });

      const sorted = Array.from(map.values()).sort((a, b) => b.rating - a.rating);
      return sorted.map((entry, idx) => ({ ...entry, rank: idx + 1 }));
    }

    // Overall seasonal standings
    const q = query(
      collection(db, 'seasonPlayerOverall'),
      where('seasonId', '==', seasonId),
      orderBy('overallRating', 'desc')
    );
    const snap = await getDocs(q);

    let rank = 1;
    return snap.docs.map((d) => {
      const data = d.data() as SeasonPlayerOverall;
      const total = data.gamesPlayed || 0;
      const winRate = total > 0 ? Math.round((data.wins / total) * 100) : 0;
      return {
        rank: data.rank || rank++,
        playerId: data.playerId,
        gamerTag: data.gamerTag,
        fullName: data.fullName || data.gamerTag,
        rating: data.overallRating || INITIAL_RATING,
        gamesPlayed: total,
        wins: data.wins || 0,
        losses: data.losses || 0,
        draws: data.draws || 0,
        winRate,
        isProvisional: total < 10,
        placementGames: total,
        currentWinStreak: data.currentWinStreak || 0,
        bestWinStreak: data.bestWinStreak || 0,
      };
    });
  } catch (err) {
    console.error('Error fetching season leaderboard:', err);
    return [];
  }
}

/**
 * Fetch all Hall of Fame champions
 */
export async function fetchHallOfFame(): Promise<HallOfFameEntry[]> {
  try {
    const q = query(collection(db, 'hallOfFame'), orderBy('seasonNumber', 'desc'), orderBy('gameName', 'asc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as HallOfFameEntry);
  } catch (err) {
    console.error('Error fetching hall of fame:', err);
    return [];
  }
}

/**
 * Fetch a player's performance across all past seasons and championship count
 */
export async function fetchPlayerSeasonHistory(playerId: string): Promise<{
  history: PlayerSeasonHistoryItem[];
  championshipsCount: number;
  bestRank: number | null;
  peakSeasonMMR: number | null;
}> {
  try {
    const q = query(
      collection(db, 'seasonPlayerGameRatings'),
      where('playerId', '==', playerId),
      orderBy('seasonNumber', 'desc')
    );
    const snap = await getDocs(q);

    // Fetch all seasons to get season dates and names
    const allSeasons = await fetchAllSeasons();
    const seasonMap = new Map<string, Season>();
    allSeasons.forEach((s) => seasonMap.set(s.id, s));

    const history: PlayerSeasonHistoryItem[] = [];
    let championshipsCount = 0;
    let bestRank: number | null = null;
    let peakSeasonMMR: number | null = null;

    snap.docs.forEach((d) => {
      const data = d.data() as SeasonPlayerGameRating;
      const seasonInfo = seasonMap.get(data.seasonId);

      // Only include completed seasons in official season history, or current season with matches
      if (data.gamesPlayed > 0 || (seasonInfo && seasonInfo.status === 'COMPLETED')) {
        const total = data.gamesPlayed || 0;
        const winRate = total > 0 ? Math.round((data.wins / total) * 100) : 0;
        const rank = data.finalRank || 1;
        const isChamp = Boolean(data.isChampion || (seasonInfo?.champions?.some((c) => c.playerId === playerId && c.gameId === data.gameId)));

        if (isChamp) championshipsCount++;
        if (bestRank === null || rank < bestRank) bestRank = rank;
        if (peakSeasonMMR === null || data.rating > peakSeasonMMR) peakSeasonMMR = data.rating;

        history.push({
          seasonId: data.seasonId,
          seasonNumber: data.seasonNumber || 1,
          seasonName: seasonInfo?.name || `Season ${data.seasonNumber || 1}`,
          startDate: seasonInfo?.startDate || Date.now(),
          endDate: seasonInfo?.endDate || Date.now(),
          gameId: data.gameId,
          gameName: data.gameName,
          gameCategory: data.gameCategory,
          finalMMR: data.rating,
          finalRank: rank,
          wins: data.wins || 0,
          losses: data.losses || 0,
          draws: data.draws || 0,
          gamesPlayed: total,
          winRate,
          isChampion: isChamp,
        });
      }
    });

    return {
      history,
      championshipsCount,
      bestRank,
      peakSeasonMMR,
    };
  } catch (err) {
    console.error('Error fetching player season history:', err);
    return {
      history: [],
      championshipsCount: 0,
      bestRank: null,
      peakSeasonMMR: null,
    };
  }
}

/**
 * Fetch Hall of Fame entries for a specific player
 */
export async function fetchPlayerHallOfFameEntries(playerId: string): Promise<HallOfFameEntry[]> {
  try {
    const q = query(collection(db, 'hallOfFame'), where('playerId', '==', playerId));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as HallOfFameEntry);
  } catch (err) {
    console.error('Error fetching player hall of fame entries:', err);
    return [];
  }
}

/**
 * Get or create a seasonal game rating record for a player
 */
export async function getOrCreateSeasonPlayerGameRating(
  seasonId: string,
  seasonNumber: number,
  playerId: string,
  gameId: string,
  gameName: string,
  gameCategory: GameCategory,
  gamerTag: string,
  currentAllTimeRating: number = INITIAL_RATING,
  isProvisionalAllTime: boolean = true,
  placementGamesAllTime: number = 0
): Promise<SeasonPlayerGameRating> {
  const ratingId = `${seasonId}_${playerId}_${gameId}`;
  const docRef = doc(db, 'seasonPlayerGameRatings', ratingId);
  const snap = await getDoc(docRef);

  if (snap.exists()) {
    return snap.data() as SeasonPlayerGameRating;
  }

  // Calculate starting soft reset rating
  const startingRating = calculateSoftResetMMR(currentAllTimeRating);

  const initialRecord: SeasonPlayerGameRating = {
    id: ratingId,
    seasonId,
    seasonNumber,
    playerId,
    gamerTag,
    gameId,
    gameName,
    gameCategory,
    startingRating,
    rating: startingRating,
    eloRating: startingRating,
    performanceRating: startingRating,
    isProvisional: isProvisionalAllTime,
    placementGames: placementGamesAllTime,
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
    updatedAt: Date.now(),
  };

  await setDoc(docRef, sanitizeFirestoreData(initialRecord));
  return initialRecord;
}

/**
 * Admin Action: Edit an existing season's details (dates, name)
 */
export async function updateSeasonDetails(
  seasonId: string,
  updates: {
    name?: string;
    startDate?: number;
    endDate?: number;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const seasonRef = doc(db, 'seasons', seasonId);
    await updateDoc(seasonRef, sanitizeFirestoreData(updates));
    return { success: true };
  } catch (err: any) {
    console.error('Error updating season:', err);
    return { success: false, error: err.message || 'Failed to update season' };
  }
}

/**
 * Core Season Transition Engine (Atomic & Idempotent):
 * Ends the specified season and transitions to the next season.
 * 1. Acquires atomic distributed lock on the season document (or aborts if already processed)
 * 2. Determines champions for each game from seasonal ratings and all-time ratings
 * 3. Freezes final leaderboard and stats
 * 4. Permanently saves champions to the Hall of Fame collection
 * 5. Marks the ended season as COMPLETED with permanent champions array & selection metadata
 * 6. Launches the new season with status ACTIVE and configured duration
 * 7. Applies soft MMR reset for all active players into the new season
 * 8. Records comprehensive audit log
 */
export async function executeSeasonTransition(params: {
  currentSeasonId?: string;
  currentSeason?: Season;
  nextSeasonName?: string;
  nextStartDate?: number;
  nextEndDate?: number;
  actorId?: string;
  actorName?: string;
}): Promise<{
  success: boolean;
  champions?: HallOfFameEntry[];
  newSeason?: Season;
  alreadyProcessed?: boolean;
  error?: string;
}> {
  const currentSeasonId = params.currentSeasonId || params.currentSeason?.id;
  if (!currentSeasonId) {
    return { success: false, error: 'No current season ID specified' };
  }

  const seasonRef = doc(db, 'seasons', currentSeasonId);
  const lockId = `lock_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  let lockAcquired = false;
  let activeSeasonData: Season | null = null;

  try {
    lockAcquired = await runTransaction(db, async (tx) => {
      const snap = await tx.get(seasonRef);
      if (!snap.exists()) {
        return false;
      }
      const data = snap.data() as Season;
      activeSeasonData = data;

      // 1. If already completed, finalized, or hallOfFameProcessed, NEVER process again!
      if (data.status === 'COMPLETED' || data.status === 'FINALIZED' || data.hallOfFameProcessed) {
        return false;
      }

      // 2. If another process is actively transitioning (locked within last 45 seconds)
      if (data.status === 'PROCESSING') {
        const started = data.transitionStartedAt || 0;
        if (Date.now() - started < 45000) {
          return false;
        }
        // Stale lock (> 45s), reclaim lock!
      }

      // 3. Acquire atomic transition lock
      tx.update(seasonRef, {
        status: 'PROCESSING',
        transitionStartedAt: Date.now(),
        transitionLockedBy: lockId,
      });

      return true;
    });
  } catch (err: any) {
    console.warn('Season transition lock acquisition error:', err);
    lockAcquired = false;
  }

  if (!lockAcquired) {
    return {
      success: false,
      alreadyProcessed: true,
      error: 'Season transition already completed or currently in progress.',
    };
  }

  try {
    const currentSeasonSnap = await getDoc(seasonRef);
    const currentSeason = (currentSeasonSnap.data() as Season) || activeSeasonData || params.currentSeason!;
    const currentNumber = currentSeason.number || 1;
    const nextNumber = currentNumber + 1;
    const nextSeasonId = `season_${nextNumber}`;
    const nextSeasonName = params.nextSeasonName || `Season ${nextNumber}`;

    // 1. Fetch all seasonPlayerGameRatings for current season
    const sRatingsSnap = await getDocs(
      query(collection(db, 'seasonPlayerGameRatings'), where('seasonId', '==', currentSeasonId))
    );

    // Group ratings by gameId
    const gameRatingsMap = new Map<string, SeasonPlayerGameRating[]>();
    sRatingsSnap.docs.forEach((d) => {
      const r = d.data() as SeasonPlayerGameRating;
      const list = gameRatingsMap.get(r.gameId) || [];
      list.push(r);
      gameRatingsMap.set(r.gameId, list);
    });

    // Also fetch all-time player ratings as fallback for any game where season ratings are sparse
    const pgrSnap = await getDocs(collection(db, 'playerGameRatings'));
    const pgrMap = new Map<string, PlayerGameRating[]>();
    pgrSnap.docs.forEach((d) => {
      const p = d.data() as PlayerGameRating;
      const list = pgrMap.get(p.gameId) || [];
      list.push(p);
      pgrMap.set(p.gameId, list);
    });

    // Merge any legacy fc26 and fc27 ratings into the unified fc ratings pool
    if (gameRatingsMap.has('fc26') || gameRatingsMap.has('fc27') || gameRatingsMap.has('fc')) {
      const fcList = gameRatingsMap.get('fc') || [];
      const fc26List = gameRatingsMap.get('fc26') || [];
      const fc27List = gameRatingsMap.get('fc27') || [];
      const combined = [...fcList, ...fc26List, ...fc27List];
      const mergedMap = new Map<string, SeasonPlayerGameRating>();
      combined.forEach((item) => {
        const ex = mergedMap.get(item.playerId);
        if (!ex) {
          mergedMap.set(item.playerId, { ...item, gameId: 'fc', gameName: 'FC', gameCategory: 'FC' });
        } else {
          mergedMap.set(item.playerId, {
            ...ex,
            rating: Math.max(ex.rating, item.rating),
            wins: (ex.wins || 0) + (item.wins || 0),
            losses: (ex.losses || 0) + (item.losses || 0),
            draws: (ex.draws || 0) + (item.draws || 0),
            gamesPlayed: (ex.gamesPlayed || 0) + (item.gamesPlayed || 0),
            gameId: 'fc',
            gameName: 'FC',
            gameCategory: 'FC',
          });
        }
      });
      gameRatingsMap.set('fc', Array.from(mergedMap.values()));
    }

    // Ensure all configured competitive games are evaluated
    for (const compGame of COMPETITIVE_GAMES) {
      if (!gameRatingsMap.has(compGame.id) || gameRatingsMap.get(compGame.id)!.length === 0) {
        let allTimeList = pgrMap.get(compGame.id) || [];
        if (compGame.id === 'fc') {
          const fc26List = pgrMap.get('fc26') || [];
          const fc27List = pgrMap.get('fc27') || [];
          const combined = [...allTimeList, ...fc26List, ...fc27List];
          const uniqueByPlayer = new Map<string, PlayerGameRating>();
          combined.forEach((p) => {
            const ex = uniqueByPlayer.get(p.playerId);
            if (!ex || (p.rating || 0) > (ex.rating || 0)) {
              uniqueByPlayer.set(p.playerId, { ...p, gameId: 'fc', gameName: 'FC', gameCategory: 'FC' });
            }
          });
          allTimeList = Array.from(uniqueByPlayer.values());
        }
        if (allTimeList.length > 0) {
          const converted: SeasonPlayerGameRating[] = allTimeList.map((p) => ({
            id: `${currentSeasonId}_${p.playerId}_${compGame.id}`,
            seasonId: currentSeasonId,
            seasonNumber: currentNumber,
            playerId: p.playerId,
            gamerTag: p.gamerTag,
            gameId: compGame.id,
            gameName: compGame.name,
            gameCategory: compGame.category,
            startingRating: p.rating,
            rating: p.rating,
            eloRating: p.eloRating || p.rating,
            performanceRating: p.performanceRating || p.rating,
            isProvisional: p.isProvisional ?? false,
            placementGames: p.placementGames || 0,
            placementGamesRequired: PLACEMENT_GAMES_REQUIRED,
            sumOpponentRatings: p.sumOpponentRatings || 0,
            averageOpponentRating: p.averageOpponentRating || INITIAL_RATING,
            winStreak: p.winStreak || 0,
            currentWinStreak: p.currentWinStreak || 0,
            bestWinStreak: p.bestWinStreak || 0,
            gamesPlayed: p.gamesPlayed || 0,
            wins: p.wins || 0,
            losses: p.losses || 0,
            draws: p.draws || 0,
            updatedAt: Date.now(),
          }));
          gameRatingsMap.set(compGame.id, converted);
        }
      }
    }

    // Fetch all 5v5 teams from teams collection
    const teamsSnap = await getDocs(collection(db, 'teams'));
    const teamsByGame = new Map<string, Team[]>();
    teamsSnap.docs.forEach((d) => {
      const t = d.data() as Team;
      if (t && t.gameId) {
        const cleanG = t.gameId.toLowerCase();
        const list = teamsByGame.get(cleanG) || [];
        list.push(t);
        teamsByGame.set(cleanG, list);
      }
    });

    // Authoritative official games catalog: strictly the 5 competitive games (no arbitrary dynamic additions)
    const allRankedGames = [...COMPETITIVE_GAMES];

    const championsList: HallOfFameEntry[] = [];
    const announcementsList: HallOfFameAnnouncement[] = [];
    const frozenRatings: SeasonPlayerGameRating[] = [];
    const selectedAt = Date.now();

    // 2. Rank contenders and crown champions dynamically per game (1v1: #1 Player • 5v5: #1 Team)
    // Core Rule 4: Independently verify whether a legitimate champion exists for each game.
    // "Chess -> valid ranking exists -> champion exists"
    // "Valorant -> no valid results -> NO CHAMPION"
    // "Never substitute another player, random account, current leader, admin, Super Admin, or placeholder account."
    for (const compGame of allRankedGames) {
      const is5v5 = compGame.matchFormat === '5v5' || ['valorant', 'cs2', 'lol'].includes(compGame.id);

      if (is5v5) {
        // 5v5 Squads: Determine the #1 ranked TEAM for this game
        const rawTeams = teamsByGame.get(compGame.id.toLowerCase()) || [];
        const activeTeams = rawTeams.filter((t) => t.status !== 'disbanded');

        // Filter strictly for active teams with verified actual participation (played matches > 0 or wins > 0)
        const legitimateTeams = activeTeams.filter(
          (t) => (t.matchesPlayed || 0) > 0 || (t.wins || 0) > 0
        );

        if (legitimateTeams.length === 0) {
          // No valid champion exists for this 5v5 game.
          // Rule: Never substitute another player, random account, placeholder, or admin!
          // Output: "No champion declared"
          continue;
        }

        // Sort descending by team rating (MMR), then wins, then matches played
        legitimateTeams.sort((a, b) => {
          if ((b.teamRating || 1000) !== (a.teamRating || 1000)) return (b.teamRating || 1000) - (a.teamRating || 1000);
          if ((b.wins || 0) !== (a.wins || 0)) return (b.wins || 0) - (a.wins || 0);
          return (b.matchesPlayed || 0) - (a.matchesPlayed || 0);
        });

        const topTeam = legitimateTeams[0];
        const topTeamMMR = topTeam.teamRating || 1000;
        const topTeamWins = topTeam.wins || 0;
        const topTeamLosses = topTeam.losses || 0;
        const topTeamDraws = topTeam.draws || 0;
        const topTeamMatches = topTeam.matchesPlayed || (topTeamWins + topTeamLosses + topTeamDraws);
        const topTeamWinRate = topTeamMatches > 0 ? Math.round((topTeamWins / topTeamMatches) * 100) : 0;

        const teamEntry: HallOfFameEntry = {
          id: `hof_${currentSeasonId}_${compGame.id}`,
          seasonId: currentSeasonId,
          seasonNumber: currentNumber,
          seasonName: currentSeason.name,
          year: currentSeason.year || new Date(currentSeason.startDate).getFullYear(),
          startDate: currentSeason.startDate,
          endDate: currentSeason.endDate,
          gameId: compGame.id,
          game: compGame.name,
          gameName: compGame.name,
          gameCategory: compGame.category,
          matchFormat: '5v5',
          winnerType: 'TEAM',
          status: 'OFFICIAL',
          championId: topTeam.teamId,
          championName: topTeam.teamName,
          teamId: topTeam.teamId,
          winnerId: topTeam.teamId,
          playerId: topTeam.captainId || topTeam.teamId,
          gamerTag: topTeam.teamName,
          teamName: topTeam.teamName,
          teamTag: topTeam.teamTag,
          captainId: topTeam.captainId,
          captainGamerTag: topTeam.captainGamerTag,
          finalRank: 1,
          finalMMR: topTeamMMR,
          wins: topTeamWins,
          losses: topTeamLosses,
          draws: topTeamDraws,
          gamesPlayed: topTeamMatches,
          winRate: topTeamWinRate,
          selectedAt,
          crownedAt: selectedAt,
        };
        championsList.push(teamEntry);

        // Generate Hall of Fame Announcement for this 5v5 Game
        announcementsList.push({
          id: `hof_announce_${currentSeasonId}_${compGame.id}`,
          seasonId: currentSeasonId,
          seasonNumber: currentNumber,
          seasonName: currentSeason.name,
          gameId: compGame.id,
          gameName: compGame.name,
          gameIcon: compGame.icon,
          gameCategory: compGame.category,
          matchFormat: '5v5',
          winnerType: 'TEAM',
          winnerId: topTeam.teamId,
          winnerName: topTeam.teamName,
          winnerTag: topTeam.teamTag,
          finalMMR: topTeamMMR,
          title: `🏆 OFFICIAL HALL OF FAME`,
          headline: `${currentSeason.name} — ${compGame.name}`,
          subheadline: `👑 ${topTeam.teamName}${topTeam.teamTag ? ` [${topTeam.teamTag}]` : ''}`,
          badgeText: `#1 Team — ${topTeamMMR.toLocaleString()} MMR`,
          congratulationsText: `Officially declared by Nexus Gaming Center.`,
          wins: topTeamWins,
          losses: topTeamLosses,
          draws: topTeamDraws,
          winRate: topTeamWinRate,
          createdAt: selectedAt,
        });

      } else {
        // 1v1 Games: Determine the #1 ranked PLAYER for this game
        const rawList = gameRatingsMap.get(compGame.id) || [];
        
        // Filter strictly for players with verified legitimate game participation during this season
        const legitimatePlayers = rawList.filter(
          (p) => (p.gamesPlayed || 0) > 0 || ((p.wins || 0) + (p.losses || 0) + (p.draws || 0)) > 0
        );

        // Sort descending by MMR / rating, then by wins, then by games played
        legitimatePlayers.sort((a, b) => {
          if (b.rating !== a.rating) return b.rating - a.rating;
          if ((b.wins || 0) !== (a.wins || 0)) return (b.wins || 0) - (a.wins || 0);
          return (b.gamesPlayed || 0) - (a.gamesPlayed || 0);
        });

        legitimatePlayers.forEach((ratingItem, index) => {
          const rank = index + 1;
          const total = ratingItem.gamesPlayed || 0;
          const winRate = total > 0 ? Math.round(((ratingItem.wins || 0) / total) * 100) : 0;
          const isChamp = rank === 1;

          const updatedRatingItem: SeasonPlayerGameRating = {
            ...ratingItem,
            finalRank: rank,
            isChampion: isChamp,
            updatedAt: selectedAt,
          };
          frozenRatings.push(updatedRatingItem);
        });

        if (legitimatePlayers.length === 0) {
          // No legitimate players with games played for this game.
          // Rule: Never substitute another player, random account, current leader, admin, or placeholder!
          // Output: "No champion declared"
          continue;
        }

        const topPlayer = legitimatePlayers[0];
        const total = topPlayer.gamesPlayed || 0;
        const winRate = total > 0 ? Math.round(((topPlayer.wins || 0) / total) * 100) : 0;

        const playerEntry: HallOfFameEntry = {
          id: `hof_${currentSeasonId}_${compGame.id}`,
          seasonId: currentSeasonId,
          seasonNumber: currentNumber,
          seasonName: currentSeason.name,
          year: currentSeason.year || new Date(currentSeason.startDate).getFullYear(),
          startDate: currentSeason.startDate,
          endDate: currentSeason.endDate,
          gameId: compGame.id,
          game: compGame.name,
          gameName: compGame.name,
          gameCategory: compGame.category,
          matchFormat: '1v1',
          winnerType: 'PLAYER',
          status: 'OFFICIAL',
          championId: topPlayer.playerId,
          championName: topPlayer.gamerTag,
          playerId: topPlayer.playerId,
          winnerId: topPlayer.playerId,
          gamerTag: topPlayer.gamerTag,
          finalRank: 1,
          finalMMR: topPlayer.rating,
          wins: topPlayer.wins || 0,
          losses: topPlayer.losses || 0,
          draws: topPlayer.draws || 0,
          gamesPlayed: total,
          winRate,
          selectedAt,
          crownedAt: selectedAt,
        };
        championsList.push(playerEntry);

        // Generate Hall of Fame Announcement for this 1v1 Game
        announcementsList.push({
          id: `hof_announce_${currentSeasonId}_${compGame.id}`,
          seasonId: currentSeasonId,
          seasonNumber: currentNumber,
          seasonName: currentSeason.name,
          gameId: compGame.id,
          gameName: compGame.name,
          gameIcon: compGame.icon,
          gameCategory: compGame.category,
          matchFormat: '1v1',
          winnerType: 'PLAYER',
          winnerId: topPlayer.playerId,
          winnerName: topPlayer.gamerTag,
          finalMMR: topPlayer.rating,
          title: `🏆 OFFICIAL HALL OF FAME`,
          headline: `${currentSeason.name} — ${compGame.name}`,
          subheadline: `👑 ${topPlayer.gamerTag}`,
          badgeText: `#1 Player — ${topPlayer.rating.toLocaleString()} MMR`,
          congratulationsText: `Officially declared by Nexus Gaming Center.`,
          wins: topPlayer.wins || 0,
          losses: topPlayer.losses || 0,
          draws: topPlayer.draws || 0,
          winRate,
          createdAt: selectedAt,
        });
      }
    }

    // 3. Compute Next Season Dates (47 Days 12 Hours for fresh countdown)
    const nextStartDate = params.nextStartDate || Date.now();
    const cycleDuration = 47.5 * 24 * 60 * 60 * 1000; // 47 Days 12 Hours
    let nextEndDate = params.nextEndDate || (nextStartDate + cycleDuration);

    if (nextEndDate <= nextStartDate) {
      nextEndDate = nextStartDate + cycleDuration;
    }

    // 4. Batch commit all changes atomically
    const batch = writeBatch(db);

    // Save frozen ratings
    frozenRatings.forEach((fr) => {
      batch.set(doc(db, 'seasonPlayerGameRatings', fr.id), sanitizeFirestoreData(fr));
    });

    // Save permanent Hall of Fame entries (Only for games with legitimate champions!)
    championsList.forEach((champ) => {
      batch.set(doc(db, 'hallOfFame', champ.id), sanitizeFirestoreData(champ));
    });

    // Save permanent Hall of Fame Announcements
    announcementsList.forEach((announce) => {
      batch.set(doc(db, 'hallOfFameAnnouncements', announce.id), sanitizeFirestoreData(announce));
    });

    // Mark current season as FINALIZED with permanent champions & metadata
    const completedSeasonData: Season = {
      ...currentSeason,
      status: 'FINALIZED',
      completedAt: selectedAt,
      finalizedAt: selectedAt,
      finalizedBy: params.actorId || 'admin',
      finalizedByName: params.actorName || 'Admin',
      selectedAt,
      hallOfFameProcessed: true,
      champions: championsList.map((c) => ({
        seasonId: currentSeasonId,
        gameId: c.gameId,
        game: c.gameName,
        gameName: c.gameName,
        gameCategory: c.gameCategory,
        matchFormat: c.matchFormat || '1v1',
        winnerType: c.winnerType || 'PLAYER',
        teamId: c.teamId,
        teamName: c.teamName,
        teamTag: c.teamTag,
        playerId: c.playerId,
        winnerId: c.winnerId || c.playerId,
        gamerTag: c.gamerTag,
        finalRank: 1,
        finalMMR: c.finalMMR,
        wins: c.wins,
        losses: c.losses,
        draws: c.draws,
        gamesPlayed: c.gamesPlayed,
        winRate: c.winRate,
        selectedAt: c.selectedAt || selectedAt,
        crownedAt: c.crownedAt || selectedAt,
      })),
    };
    batch.set(seasonRef, sanitizeFirestoreData(completedSeasonData));

    // 5. Create new season document (ACTIVE)
    const newSeasonData: Season = {
      id: nextSeasonId,
      number: nextNumber,
      name: nextSeasonName,
      year: new Date(nextStartDate).getFullYear(),
      status: 'ACTIVE',
      startDate: nextStartDate,
      endDate: nextEndDate,
      createdAt: selectedAt,
      totalMatches: 0,
      totalPlayers: 0,
      champions: [],
    };
    batch.set(doc(db, 'seasons', nextSeasonId), sanitizeFirestoreData(newSeasonData));

    // 6. Apply Soft MMR Reset for all players into the new season
    for (const fr of frozenRatings) {
      const newStartingMMR = calculateSoftResetMMR(fr.rating);
      const newRatingId = `${nextSeasonId}_${fr.playerId}_${fr.gameId}`;

      const newSeasonRating: SeasonPlayerGameRating = {
        id: newRatingId,
        seasonId: nextSeasonId,
        seasonNumber: nextNumber,
        playerId: fr.playerId,
        gamerTag: fr.gamerTag,
        gameId: fr.gameId,
        gameName: fr.gameName,
        gameCategory: fr.gameCategory,
        startingRating: newStartingMMR,
        rating: newStartingMMR,
        eloRating: newStartingMMR,
        performanceRating: newStartingMMR,
        isProvisional: fr.isProvisional,
        placementGames: fr.placementGames,
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
        updatedAt: selectedAt,
      };
      batch.set(doc(db, 'seasonPlayerGameRatings', newRatingId), sanitizeFirestoreData(newSeasonRating));
    }

    // 7. Reset Season Player Overall stats
    const sOverallSnap = await getDocs(
      query(collection(db, 'seasonPlayerOverall'), where('seasonId', '==', currentSeasonId))
    );
    sOverallSnap.docs.forEach((d) => {
      const prevOverall = d.data() as SeasonPlayerOverall;
      const newOverallMMR = calculateSoftResetMMR(prevOverall.overallRating || INITIAL_RATING);
      const newOverallId = `${nextSeasonId}_${prevOverall.playerId}`;
      const newOverall: SeasonPlayerOverall = {
        id: newOverallId,
        seasonId: nextSeasonId,
        seasonNumber: nextNumber,
        playerId: prevOverall.playerId,
        gamerTag: prevOverall.gamerTag,
        fullName: prevOverall.fullName,
        overallRating: newOverallMMR,
        gamesPlayed: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        currentWinStreak: 0,
        bestWinStreak: 0,
        updatedAt: selectedAt,
      };
      batch.set(doc(db, 'seasonPlayerOverall', newOverallId), sanitizeFirestoreData(newOverall));
    });

    // 8. Record Audit Log
    const auditId = `audit_${selectedAt}`;
    batch.set(doc(db, 'auditLogs', auditId), sanitizeFirestoreData({
      id: auditId,
      action: 'SEASON_TRANSITION',
      actorId: params.actorId || 'system',
      actorName: params.actorName || 'Nexus System Automated Engine',
      targetType: 'system',
      targetId: currentSeasonId,
      details: `Ended Season ${currentNumber} and launched Season ${nextNumber} (${nextSeasonName}). Crowned ${championsList.length} champions into Hall of Fame.`,
      timestamp: selectedAt,
    }));

    await batch.commit();

    console.log(`[SeasonService] Season transition completed successfully: ${currentSeasonId} → ${nextSeasonId}. Crowned ${championsList.length} champions.`);

    return {
      success: true,
      champions: championsList,
      newSeason: newSeasonData,
    };
  } catch (err: any) {
    console.error('Error during season transition execution:', err);
    // Safety fallback: revert PROCESSING status to ACTIVE if batch failed
    try {
      await updateDoc(seasonRef, {
        status: 'ACTIVE',
        transitionError: err.message || 'Execution failed',
      });
    } catch {
      // ignore
    }
    return {
      success: false,
      error: err.message || 'Failed to complete season transition',
    };
  }
}

let activeTransitionLock = false;

/**
 * Automatically inspects the current active season.
 * If expired (endDate <= Date.now()), automatically triggers executeSeasonTransition exactly once.
 * Survives offline periods, reloads, and browser closures.
 */
export async function checkAndProcessExpiredSeason(): Promise<{
  processed: boolean;
  reason?: string;
  activeSeason?: Season | null;
  newSeason?: Season;
  champions?: HallOfFameEntry[];
  error?: string;
}> {
  if (activeTransitionLock) {
    return { processed: false, reason: 'transition_lock_held' };
  }

  try {
    activeTransitionLock = true;
    const now = Date.now();
    const seasonsRef = collection(db, 'seasons');

    // 1. Look for currently ACTIVE, ENDED, or PROCESSING season
    const activeQuery = query(seasonsRef, where('status', 'in', ['ACTIVE', 'ENDED', 'PROCESSING']), limit(1));
    const activeSnap = await getDocs(activeQuery);

    if (activeSnap.empty) {
      // Check if any seasons exist
      const allSnap = await getDocs(query(seasonsRef, orderBy('number', 'desc'), limit(1)));
      if (allSnap.empty) {
        const initial = await ensureDefaultActiveSeason();
        return { processed: false, activeSeason: initial };
      }
      const latest = allSnap.docs[0].data() as Season;
      if (latest.status === 'COMPLETED' || latest.status === 'FINALIZED') {
        // All seasons completed, create next active season
        const currentDates = getStandardSeasonDates();
        const nextNum = (latest.number || 1) + 1;
        const newSeasonId = `season_${nextNum}`;
        const newSeason: Season = {
          id: newSeasonId,
          number: nextNum,
          name: `Season ${nextNum}`,
          year: currentDates.year,
          status: 'ACTIVE',
          startDate: currentDates.startDate,
          endDate: currentDates.endDate,
          createdAt: Date.now(),
          totalMatches: 0,
          totalPlayers: 0,
          champions: [],
        };
        await setDoc(doc(db, 'seasons', newSeasonId), sanitizeFirestoreData(newSeason));
        return { processed: true, newSeason, activeSeason: newSeason };
      }
      return { processed: false, activeSeason: latest };
    }

    const currentSeason = activeSnap.docs[0].data() as Season;

    // If active and not yet expired, no transition needed
    if (currentSeason.status === 'ACTIVE' && currentSeason.endDate > now) {
      return { processed: false, reason: 'season_active_and_valid', activeSeason: currentSeason };
    }

    // Required Sequence Rule 2:
    // When the countdown reaches zero (or season.endDate <= now), season transitions from ACTIVE -> ENDED.
    // "Champions are awaiting official finalization. Again, show no winner."
    // "A Hall of Fame champion can exist only after the authorized season-finalization transaction successfully completes."
    if (currentSeason.status === 'ACTIVE' && currentSeason.endDate <= now) {
      console.log(`[SeasonService] Season ${currentSeason.id} reached end date. Transitioning status to ENDED (awaiting admin finalization).`);
      await updateDoc(doc(db, 'seasons', currentSeason.id), sanitizeFirestoreData({
        status: 'ENDED',
        endedAt: now,
      }));
      const endedSeason: Season = {
        ...currentSeason,
        status: 'ENDED',
        endedAt: now,
      };
      return {
        processed: true,
        reason: 'season_ended_awaiting_finalization',
        activeSeason: endedSeason,
      };
    }

    if (currentSeason.status === 'ENDED') {
      return {
        processed: false,
        reason: 'season_ended_awaiting_finalization',
        activeSeason: currentSeason,
      };
    }
  } catch (err: any) {
    console.error('Error in checkAndProcessExpiredSeason:', err);
    return { processed: false, error: err.message };
  } finally {
    activeTransitionLock = false;
  }
}

/**
 * Admin Action: End the current active season and transition to the next season.
 * Reuses the same atomic, idempotent executeSeasonTransition engine.
 */
export async function endSeasonAndStartNext(params: {
  currentSeasonId: string;
  nextSeasonName: string;
  nextStartDate: number;
  nextEndDate: number;
  adminId: string;
  adminName: string;
}): Promise<{
  success: boolean;
  champions?: HallOfFameEntry[];
  newSeason?: Season;
  error?: string;
}> {
  const result = await executeSeasonTransition({
    currentSeasonId: params.currentSeasonId,
    nextSeasonName: params.nextSeasonName,
    nextStartDate: params.nextStartDate,
    nextEndDate: params.nextEndDate,
    actorId: params.adminId,
    actorName: params.adminName,
  });

  return {
    success: result.success,
    champions: result.champions,
    newSeason: result.newSeason,
    error: result.error,
  };
}

/**
 * Super Admin/Admin manual trigger: starts the next season cycle and crowns champions.
 */
export async function startNextSeasonManually(actor: {
  uid: string;
  name: string;
}): Promise<{
  success: boolean;
  champions?: HallOfFameEntry[];
  newSeason?: Season;
  error?: string;
}> {
  const activeSnap = await getDocs(
    query(collection(db, 'seasons'), where('status', 'in', ['ACTIVE', 'ENDED', 'PROCESSING']), limit(1))
  );

  let currentSeason: Season;
  if (activeSnap.empty) {
    currentSeason = await ensureDefaultActiveSeason();
  } else {
    currentSeason = activeSnap.docs[0].data() as Season;
  }

  const result = await executeSeasonTransition({
    currentSeason,
    actorId: actor.uid,
    actorName: actor.name,
  });

  return result;
}

export const finalizeSeasonAndCrownChampions = startNextSeasonManually;

/**
 * Validates Hall of Fame announcements.
 * Removes/disables:
 * - FC EA / EA FC completely
 * - FC 26 and FC 27 as separate announcement categories (FC is unified)
 * - Removed games (Tekken, Rocket League, Mortal Kombat, Fortnite, Call of Duty)
 * - Fake, seed, demo, or fallback winners
 * Preserves legitimate official Hall of Fame records.
 */
export function isValidHofAnnouncement(ann: any): boolean {
  if (!ann) return false;
  if (ann.status === 'archived' || ann.status === 'inactive' || ann.active === false) return false;

  const gName = (ann.gameName || ann.gameId || ann.headline || '').toLowerCase().trim();
  const gCategory = (ann.gameCategory || '').toLowerCase().trim();

  // 1. Remove FC EA completely
  if (
    gName.includes('fc ea') ||
    gName.includes('ea fc') ||
    gName === 'ea-fc' ||
    gName === 'fc-ea' ||
    gName === 'fcea' ||
    gName === 'eafc' ||
    gCategory.includes('fc ea') ||
    gCategory.includes('ea fc')
  ) {
    return false;
  }

  // 2. Remove FC 26 and FC 27 as separate announcement categories
  if (
    ann.gameId === 'fc26' ||
    ann.gameId === 'fc27' ||
    gName === 'fc 26' ||
    gName === 'fc 27' ||
    gCategory === 'fc26' ||
    gCategory === 'fc27'
  ) {
    return false;
  }

  // 3. Remove unsupported games
  const UNWANTED_GAMES = [
    'tekken',
    'rocket league',
    'rocketleague',
    'mortal kombat',
    'mortalkombat',
    'fortnite',
    'call of duty',
    'callofduty',
    'cod',
  ];
  if (UNWANTED_GAMES.some((u) => gName.includes(u))) return false;

  // 4. Must have a valid winnerId and winnerName (reject fallback/seed/demo accounts)
  const winnerId = (ann.winnerId || ann.championId || ann.playerId || '').trim().toLowerCase();
  const winnerName = (ann.winnerName || ann.championName || '').trim().toLowerCase();

  if (
    !winnerId ||
    winnerId === 'undefined' ||
    winnerId === 'null' ||
    winnerId === 'deleted' ||
    winnerId === '[deleted]'
  ) {
    return false;
  }
  if (!winnerName) return false;

  if (
    winnerId.includes('_seed') ||
    winnerId.startsWith('demo_') ||
    winnerId.startsWith('test_') ||
    winnerId.startsWith('fallback_') ||
    winnerId.startsWith('placeholder_') ||
    winnerName.includes('fallback') ||
    winnerName.includes('placeholder') ||
    winnerName.includes('test account') ||
    winnerName === 'deleted' ||
    winnerName === 'deleteduser'
  ) {
    return false;
  }

  return true;
}

/**
 * Subscribe to real-time Hall of Fame announcements.
 * Filters out invalid/removed game announcements, FC EA, separate FC 26/27, and fallback winners.
 */
export function subscribeToHallOfFameAnnouncements(
  callback: (announcements: HallOfFameAnnouncement[]) => void
) {
  const q = query(collection(db, 'hallOfFameAnnouncements'), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snap) => {
      const filtered = snap.docs
        .map((d) => d.data() as HallOfFameAnnouncement)
        .filter(isValidHofAnnouncement);
      callback(filtered);
    },
    (err) => {
      console.error('Hall of Fame Announcements listener error:', err);
      callback([]);
    }
  );
}

/**
 * Fetch all Hall of Fame announcements.
 * Filters out invalid/removed game announcements, FC EA, separate FC 26/27, and fallback winners.
 */
export async function fetchHallOfFameAnnouncements(): Promise<HallOfFameAnnouncement[]> {
  try {
    const q = query(collection(db, 'hallOfFameAnnouncements'), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => d.data() as HallOfFameAnnouncement)
      .filter(isValidHofAnnouncement);
  } catch (err) {
    console.error('Error fetching Hall of Fame announcements:', err);
    return [];
  }
}

const FOUNDING_SUPER_ADMIN_UID = 'c3Vip2TwMvZXhub5gjjVpjcsStI2';

/**
 * Super Admin Action: Permanently remove a finalized season.
 * Enforces:
 * - Only SUPER_ADMIN allowed (Admin, Staff, Player strictly denied)
 * - Cannot remove an ACTIVE season ("You cannot remove an active season. Finalize or close the season first.")
 * - Exact confirmation string required ("REMOVE SEASON 3")
 * - Atomic cleanup of Season, ratings, overall stats, Hall of Fame entries, announcements.
 * - Completed match records and financial logs preserved for audit integrity.
 */
export async function removeSeason(params: {
  seasonId: string;
  confirmationInput: string;
  actor: {
    uid: string;
    role: string;
    gamerTag?: string;
  };
}): Promise<{
  success: boolean;
  error?: string;
  removedCounts?: {
    ratings: number;
    overall: number;
    hallOfFame: number;
    announcements: number;
  };
}> {
  const isSuper =
    params.actor.role === 'SUPER_ADMIN' ||
    params.actor.uid === FOUNDING_SUPER_ADMIN_UID;

  if (!isSuper) {
    return {
      success: false,
      error: 'Permission Denied: Only Super Administrators can permanently remove a season.',
    };
  }

  try {
    const seasonRef = doc(db, 'seasons', params.seasonId);
    const seasonSnap = await getDoc(seasonRef);
    if (!seasonSnap.exists()) {
      return {
        success: false,
        error: `Season not found (${params.seasonId}).`,
      };
    }

    const season = seasonSnap.data() as Season;

    if (season.status === 'ACTIVE') {
      return {
        success: false,
        error: 'You cannot remove an active season. Finalize or close the season first.',
      };
    }

    const expectedConfirmation = `REMOVE ${(season.name || `SEASON ${season.number}`).toUpperCase().trim()}`;
    const cleanTyped = (params.confirmationInput || '').trim().toUpperCase();
    if (cleanTyped !== expectedConfirmation) {
      return {
        success: false,
        error: `Confirmation mismatch. You must type exactly: "${expectedConfirmation}".`,
      };
    }

    const [ratingsSnap, overallSnap, hofSnap, annSnap] = await Promise.all([
      getDocs(query(collection(db, 'seasonPlayerGameRatings'), where('seasonId', '==', params.seasonId))),
      getDocs(query(collection(db, 'seasonPlayerOverall'), where('seasonId', '==', params.seasonId))),
      getDocs(query(collection(db, 'hallOfFame'), where('seasonId', '==', params.seasonId))),
      getDocs(query(collection(db, 'hallOfFameAnnouncements'), where('seasonId', '==', params.seasonId))),
    ]);

    const docsToDelete = [
      ...ratingsSnap.docs.map((d) => d.ref),
      ...overallSnap.docs.map((d) => d.ref),
      ...hofSnap.docs.map((d) => d.ref),
      ...annSnap.docs.map((d) => d.ref),
      seasonRef,
    ];

    const BATCH_SIZE = 400;
    for (let i = 0; i < docsToDelete.length; i += BATCH_SIZE) {
      const batch = writeBatch(db);
      const chunk = docsToDelete.slice(i, i + BATCH_SIZE);
      chunk.forEach((ref) => batch.delete(ref));
      await batch.commit();
    }

    try {
      const auditDocRef = doc(collection(db, 'auditLogs'));
      await setDoc(auditDocRef, sanitizeFirestoreData({
        id: auditDocRef.id,
        action: 'SEASON_PERMANENT_REMOVAL',
        seasonId: params.seasonId,
        seasonName: season.name,
        seasonNumber: season.number,
        performedByUid: params.actor.uid,
        performedByGamerTag: params.actor.gamerTag || 'Super Admin',
        performedByRole: params.actor.role,
        removedCounts: {
          ratings: ratingsSnap.size,
          overall: overallSnap.size,
          hallOfFame: hofSnap.size,
          announcements: annSnap.size,
        },
        timestamp: Date.now(),
        createdAt: Date.now(),
      }));
    } catch (auditErr) {
      console.warn('Audit log write warning:', auditErr);
    }

    return {
      success: true,
      removedCounts: {
        ratings: ratingsSnap.size,
        overall: overallSnap.size,
        hallOfFame: hofSnap.size,
        announcements: annSnap.size,
      },
    };
  } catch (err: any) {
    console.warn('removeSeason error:', err);
    return {
      success: false,
      error: err.message || 'Failed to remove season.',
    };
  }
}

/**
 * Migration helper: Normalizes legacy FC26 and FC27 competitive records to FC
 * and archives announcements for unwanted games.
 */
export async function migrateLegacyCatalogAndFCData(): Promise<{
  success: boolean;
  migratedRatingsCount: number;
  archivedAnnouncementsCount: number;
}> {
  try {
    let migratedRatingsCount = 0;
    let archivedAnnouncementsCount = 0;

    const pgrSnap = await getDocs(collection(db, 'playerGameRatings'));
    const fcRatingsByPlayer = new Map<string, PlayerGameRating[]>();
    pgrSnap.docs.forEach((d) => {
      const data = d.data() as PlayerGameRating;
      if (data.gameId === 'fc26' || data.gameId === 'fc27' || data.gameId === 'fc') {
        const list = fcRatingsByPlayer.get(data.playerId) || [];
        list.push(data);
        fcRatingsByPlayer.set(data.playerId, list);
      }
    });

    for (const [playerId, ratings] of fcRatingsByPlayer.entries()) {
      if (ratings.some((r) => r.gameId === 'fc26' || r.gameId === 'fc27')) {
        let highestRating = 1000;
        let totalGames = 0;
        let totalWins = 0;
        let totalLosses = 0;
        let totalDraws = 0;
        let gamerTag = ratings[0]?.gamerTag || 'Player';
        let latestVersion = 'FC26';

        ratings.forEach((r) => {
          if (r.rating > highestRating) highestRating = r.rating;
          totalGames += (r.gamesPlayed || 0);
          totalWins += (r.wins || 0);
          totalLosses += (r.losses || 0);
          totalDraws += (r.draws || 0);
          if (r.gamerTag) gamerTag = r.gamerTag;
          if (r.gameId === 'fc27') latestVersion = 'FC27';
        });

        const unifiedDocRef = doc(db, 'playerGameRatings', `${playerId}_fc`);
        const unifiedData: PlayerGameRating = {
          id: `${playerId}_fc`,
          playerId,
          gamerTag,
          gameId: 'fc',
          gameName: 'FC',
          gameCategory: 'FC',
          gameVersion: latestVersion,
          rating: highestRating,
          eloRating: highestRating,
          isProvisional: totalGames < 10,
          placementGames: Math.min(10, totalGames),
          placementGamesRequired: 10,
          gamesPlayed: totalGames,
          wins: totalWins,
          losses: totalLosses,
          draws: totalDraws,
          updatedAt: Date.now(),
        };

        await setDoc(unifiedDocRef, sanitizeFirestoreData(unifiedData), { merge: true });
        migratedRatingsCount++;
      }
    }

    const [annSnap, hofSnap] = await Promise.all([
      getDocs(collection(db, 'hallOfFameAnnouncements')),
      getDocs(collection(db, 'hallOfFame')),
    ]);

    const UNWANTED_GAMES = [
      'tekken', 'rocket league', 'rocketleague', 'mortal kombat', 'mortalkombat',
      'fortnite', 'call of duty', 'callofduty', 'cod',
      'fc26', 'fc27', 'ea-fc', 'ea fc', 'fc ea', 'ea sports fc'
    ];

    const officialHofKeys = new Set(
      hofSnap.docs
        .map((d) => d.data())
        .filter((h) => h.status === 'OFFICIAL' || !h.status)
        .map((h) => `${h.seasonId}_${(h.gameCategory || '').toUpperCase()}`)
    );

    for (const d of annSnap.docs) {
      const data = d.data();
      const gName = (data.gameName || data.gameId || data.headline || '').toLowerCase();
      const isUnwanted = UNWANTED_GAMES.some((u) => gName.includes(u));
      const hasOfficialHof = officialHofKeys.has(`${data.seasonId}_${(data.gameCategory || '').toUpperCase()}`);
      const isFakeFallback = data.winnerName === 'MagnusTactician' || data.winnerId === 'player_ea-fc_seed';

      if (isUnwanted || !hasOfficialHof || isFakeFallback) {
        await updateDoc(d.ref, sanitizeFirestoreData({
          status: 'archived',
          active: false,
          archivedAt: Date.now(),
        }));
        archivedAnnouncementsCount++;
      }
    }

    return {
      success: true,
      migratedRatingsCount,
      archivedAnnouncementsCount,
    };
  } catch (err) {
    console.warn('migrateLegacyCatalogAndFCData warning:', err);
    return { success: false, migratedRatingsCount: 0, archivedAnnouncementsCount: 0 };
  }
}

