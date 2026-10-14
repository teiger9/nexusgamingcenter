import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  updateDoc,
  setDoc,
  onSnapshot,
  QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { Player, PlayerGameRating, LeaderboardEntry, GameCategory, RatingTransaction } from '../types';
import { INITIAL_RATING } from '../lib/elo';

export interface FetchPlayersPaginatedParams {
  pageSize?: number;
  lastDoc?: QueryDocumentSnapshot | null;
  searchQuery?: string;
  roleFilter?: string;
}

export interface PaginatedPlayersResult {
  players: Player[];
  lastDoc: QueryDocumentSnapshot | null;
  hasMore: boolean;
}

/**
 * Scalable cursor-based pagination for registered players
 * Loads a limited result set (e.g. 20-25) at a time to prevent loading the entire collection.
 */
export async function fetchPlayersPaginated(
  params: FetchPlayersPaginatedParams = {}
): Promise<PaginatedPlayersResult> {
  const { pageSize = 25, lastDoc = null, searchQuery = '', roleFilter = '' } = params;
  try {
    const playersRef = collection(db, 'players');
    const cleanSearch = searchQuery.trim().toLowerCase();

    // If searching by tag, prefix match using Firestore index bounds
    if (cleanSearch) {
      // Query with limit
      const q = query(
        playersRef,
        orderBy('gamerTag', 'asc'),
        limit(pageSize + 1)
      );
      const snapshot = await getDocs(q);
      const allFetched = snapshot.docs.map((d) => ({
        uid: d.id,
        ...(d.data() as any),
        id: d.id,
      } as Player));

      const filtered = allFetched.filter((p) => {
        const matchesSearch =
          (p.gamerTag && p.gamerTag.toLowerCase().includes(cleanSearch)) ||
          (p.fullName && p.fullName.toLowerCase().includes(cleanSearch)) ||
          (p.email && p.email.toLowerCase().includes(cleanSearch));
        const matchesRole = !roleFilter || (p.role && p.role.toUpperCase() === roleFilter.toUpperCase());
        return matchesSearch && matchesRole;
      });

      return {
        players: filtered.slice(0, pageSize),
        lastDoc: snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1] : null,
        hasMore: snapshot.docs.length > pageSize,
      };
    }

    let q = query(playersRef, orderBy('gamerTag', 'asc'));
    if (lastDoc) {
      q = query(playersRef, orderBy('gamerTag', 'asc'), startAfter(lastDoc), limit(pageSize + 1));
    } else {
      q = query(playersRef, orderBy('gamerTag', 'asc'), limit(pageSize + 1));
    }

    const snapshot = await getDocs(q);
    const hasMore = snapshot.docs.length > pageSize;
    const resultDocs = hasMore ? snapshot.docs.slice(0, pageSize) : snapshot.docs;

    const players = resultDocs.map((d) => ({
      uid: d.id,
      ...(d.data() as any),
      id: d.id,
    } as Player));

    return {
      players,
      lastDoc: resultDocs.length > 0 ? resultDocs[resultDocs.length - 1] : null,
      hasMore,
    };
  } catch (err) {
    console.error('Failed to fetch players paginated:', err);
    return { players: [], lastDoc: null, hasMore: false };
  }
}

/**
 * Robust normalizer for Player documents.
 * Ensures consistent field names, guarantees uid/id from doc.id,
 * and handles missing or non-standard optional fields gracefully.
 */
export function normalizePlayerProfile(docId: string, data: any): Player {
  const uid = (data?.uid || docId || '').trim();
  const gamerTag = (
    data?.gamerTag ||
    data?.displayName ||
    data?.username ||
    data?.fullName ||
    `Player_${uid.slice(0, 6)}`
  ).trim();
  const fullName = (
    data?.fullName ||
    data?.displayName ||
    data?.name ||
    gamerTag
  ).trim();

  return {
    ...data,
    uid,
    id: uid,
    gamerTag,
    gamerTagLower: (data?.gamerTagLower || gamerTag).toLowerCase(),
    fullName,
    email: data?.email || '',
    phoneNumber: data?.phoneNumber || data?.phone || '',
    role: data?.role || 'player',
    status: data?.status || (data?.roleStatus === 'ACTIVE' ? 'ACTIVE' : undefined),
    isBanned: Boolean(data?.isBanned || data?.status === 'BANNED'),
    isSuspended: Boolean(data?.isSuspended || data?.status === 'SUSPENDED'),
    overallRating: typeof data?.overallRating === 'number' ? data.overallRating : INITIAL_RATING,
    totalGames: data?.totalGames ?? 0,
    totalWins: data?.totalWins ?? 0,
    totalLosses: data?.totalLosses ?? 0,
    totalDraws: data?.totalDraws ?? 0,
    nexusCoins: data?.nexusCoins ?? 0,
    createdAt: data?.createdAt ?? Date.now(),
  } as Player;
}

/**
 * Fetch all registered players from the authoritative /players collection.
 * Uses Firestore query with safety cap, normalizes all profiles,
 * and performs in-memory alphabetical sorting so profiles without explicit
 * index fields are never silently omitted.
 */
export async function fetchAllPlayers(maxLimit: number = 100): Promise<Player[]> {
  try {
    const playersRef = collection(db, 'players');
    const q = query(playersRef, limit(maxLimit));
    const snapshot = await getDocs(q);

    const list = snapshot.docs.map((d) => normalizePlayerProfile(d.id, d.data()));
    // Filter out banned or suspended accounts
    const activeList = list.filter((p) => !p.isBanned && !p.isSuspended && p.status !== 'BANNED' && p.status !== 'SUSPENDED');
    // Sort alphabetically by gamerTag
    activeList.sort((a, b) => a.gamerTag.localeCompare(b.gamerTag, undefined, { sensitivity: 'base' }));
    return activeList;
  } catch (err) {
    console.error('Failed to fetch all players:', err);
    throw err;
  }
}

/**
 * Fetch potential opponents for 1v1 matchmaking.
 * Filters out the current user (by authUid and currentUserId)
 * while preserving all other eligible, registered competitors.
 */
export async function fetchPotentialOpponents(currentUserId?: string): Promise<Player[]> {
  try {
    const players = await fetchAllPlayers();
    const authUid = (auth.currentUser?.uid || '').trim();
    const targetUid = (currentUserId || '').trim();

    return players.filter((p) => {
      const pUid = (p.uid || (p as any).id || '').trim();
      if (!pUid) return false;
      if (authUid && pUid === authUid) return false;
      if (targetUid && pUid === targetUid) return false;
      return true;
    });
  } catch (err) {
    console.error('Failed to fetch opponents:', err);
    throw err;
  }
}

/**
 * Real-time subscription to eligible matchmaking players.
 * Reactively updates when accounts or profiles change in Firestore.
 */
export function subscribeToEligiblePlayers(
  currentUserId: string | undefined,
  callback: (players: Player[]) => void,
  onError?: (err: Error) => void
): () => void {
  const playersRef = collection(db, 'players');
  const authUid = (auth.currentUser?.uid || '').trim();
  const targetUid = (currentUserId || '').trim();

  return onSnapshot(
    playersRef,
    (snapshot) => {
      try {
        const list = snapshot.docs.map((d) => normalizePlayerProfile(d.id, d.data()));
        const eligible = list.filter((p) => {
          const pUid = (p.uid || (p as any).id || '').trim();
          if (!pUid) return false;
          if (authUid && pUid === authUid) return false;
          if (targetUid && pUid === targetUid) return false;
          if (p.isBanned || p.isSuspended || p.status === 'BANNED' || p.status === 'SUSPENDED') return false;
          return true;
        });

        eligible.sort((a, b) => a.gamerTag.localeCompare(b.gamerTag, undefined, { sensitivity: 'base' }));
        callback(eligible);
      } catch (err: any) {
        console.error('Error processing eligible players snapshot:', err);
        onError?.(err);
      }
    },
    (err) => {
      console.error('Eligible players subscription error:', err);
      onError?.(err);
    }
  );
}

/**
 * Real-time subscription to all registered active players.
 * Reactively updates when accounts or profiles change in Firestore.
 */
export function subscribeToAllPlayers(
  callback: (players: Player[]) => void,
  onError?: (err: Error) => void
): () => void {
  const playersRef = collection(db, 'players');

  return onSnapshot(
    playersRef,
    (snapshot) => {
      try {
        const list = snapshot.docs.map((d) => normalizePlayerProfile(d.id, d.data()));
        const active = list.filter(
          (p) => !p.isBanned && !p.isSuspended && p.status !== 'BANNED' && p.status !== 'SUSPENDED'
        );
        active.sort((a, b) => a.gamerTag.localeCompare(b.gamerTag, undefined, { sensitivity: 'base' }));
        callback(active);
      } catch (err: any) {
        console.error('Error in subscribeToAllPlayers snapshot:', err);
        onError?.(err);
      }
    },
    (err) => {
      console.error('All players subscription error:', err);
      onError?.(err);
    }
  );
}

export async function fetchPlayerById(playerId: string): Promise<Player | null> {
  try {
    const docSnap = await getDoc(doc(db, 'players', playerId));
    if (docSnap.exists()) {
      return docSnap.data() as Player;
    }
    return null;
  } catch (err) {
    console.error('Failed to fetch player by ID:', err);
    return null;
  }
}

export async function fetchPlayerGameRatings(playerId: string): Promise<PlayerGameRating[]> {
  try {
    const ratingsRef = collection(db, 'playerGameRatings');
    const q = query(ratingsRef, where('playerId', '==', playerId));
    const snapshot = await getDocs(q);
    
    const UNWANTED_GAMES = ['tekken', 'rocket league', 'rocketleague', 'mortal kombat', 'mortalkombat', 'fortnite', 'call of duty', 'callofduty', 'cod'];
    const validRatings: PlayerGameRating[] = [];
    const fcRatings: PlayerGameRating[] = [];

    snapshot.docs.forEach((docSnap) => {
      const data = docSnap.data() as PlayerGameRating;
      const gId = (data.gameId || '').toLowerCase();
      const gName = (data.gameName || '').toLowerCase();

      // Skip removed unwanted games
      if (UNWANTED_GAMES.some((u) => gId.includes(u) || gName.includes(u))) {
        return;
      }

      // Collect FC entries for unification
      if (gId === 'fc' || gId === 'fc26' || gId === 'fc27' || data.gameCategory === 'FC') {
        fcRatings.push(data);
        return;
      }

      const gamesCount = Math.max(data.gamesPlayed || 0, data.placementGames || 0);
      const isProvisional = gamesCount < 10;
      validRatings.push({
        ...data,
        gamesPlayed: gamesCount,
        placementGames: Math.min(10, gamesCount),
        isProvisional,
        currentWinStreak: data.currentWinStreak ?? data.winStreak ?? 0,
        bestWinStreak: data.bestWinStreak ?? data.currentWinStreak ?? data.winStreak ?? 0,
      });
    });

    // Unify FC into exactly 1 rating card
    if (fcRatings.length > 0) {
      let highestRating = 1000;
      let totalGames = 0;
      let totalWins = 0;
      let totalLosses = 0;
      let totalDraws = 0;
      let maxWinStreak = 0;
      let maxBestStreak = 0;
      let gamerTag = fcRatings[0].gamerTag || 'Player';
      let latestVersion = 'FC26';

      fcRatings.forEach((r) => {
        if (r.rating > highestRating) highestRating = r.rating;
        totalGames += Math.max(r.gamesPlayed || 0, r.placementGames || 0);
        totalWins += (r.wins || 0);
        totalLosses += (r.losses || 0);
        totalDraws += (r.draws || 0);
        if (r.currentWinStreak && r.currentWinStreak > maxWinStreak) maxWinStreak = r.currentWinStreak;
        if (r.bestWinStreak && r.bestWinStreak > maxBestStreak) maxBestStreak = r.bestWinStreak;
        if (r.gamerTag) gamerTag = r.gamerTag;
        if (r.gameId === 'fc27' || r.gameVersion === 'FC27') latestVersion = 'FC27';
      });

      validRatings.push({
        id: `${playerId}_fc`,
        playerId,
        gamerTag,
        gameId: 'fc',
        gameName: 'FC',
        gameCategory: 'FC',
        gameVersion: latestVersion,
        rating: highestRating,
        eloRating: highestRating,
        performanceRating: highestRating,
        isProvisional: totalGames < 10,
        placementGames: Math.min(10, totalGames),
        placementGamesRequired: 10,
        gamesPlayed: totalGames,
        wins: totalWins,
        losses: totalLosses,
        draws: totalDraws,
        currentWinStreak: maxWinStreak,
        bestWinStreak: Math.max(maxBestStreak, maxWinStreak),
        updatedAt: Date.now(),
      });
    }

    return validRatings;
  } catch (err) {
    console.error('Failed to fetch player game ratings:', err);
    return [];
  }
}

export async function getOrCreatePlayerGameRating(
  playerId: string,
  gameId: string,
  gameName: string,
  gameCategory: GameCategory,
  gamerTag: string
): Promise<PlayerGameRating> {
  const ratingId = `${playerId}_${gameId}`;
  const ratingDocRef = doc(db, 'playerGameRatings', ratingId);
  const snap = await getDoc(ratingDocRef);

  if (snap.exists()) {
    const data = snap.data() as PlayerGameRating;
    const gamesCount = Math.max(data.gamesPlayed || 0, data.placementGames || 0);
    const isProvisional = gamesCount < 10;
    return {
      ...data,
      gamesPlayed: gamesCount,
      isProvisional,
      placementGames: Math.min(10, gamesCount),
      placementGamesRequired: data.placementGamesRequired || 10,
      currentWinStreak: data.currentWinStreak ?? data.winStreak ?? 0,
      bestWinStreak: data.bestWinStreak ?? data.currentWinStreak ?? data.winStreak ?? 0,
    };
  }

  const initialData: PlayerGameRating = {
    id: ratingId,
    playerId,
    gameId,
    gameName,
    gameCategory,
    gamerTag,
    rating: INITIAL_RATING,
    eloRating: INITIAL_RATING,
    performanceRating: INITIAL_RATING,
    isProvisional: true,
    placementGames: 0,
    placementGamesRequired: 10,
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

  await setDoc(ratingDocRef, initialData);
  return initialData;
}

export async function fetchPlayerRatingHistory(playerId: string, limitCount: number = 20): Promise<RatingTransaction[]> {
  try {
    const historyRef = collection(db, 'ratingTransactions');
    const q = query(
      historyRef,
      where('playerId', '==', playerId),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => d.data() as RatingTransaction);
  } catch (err) {
    console.error('Failed to fetch player rating history:', err);
    return [];
  }
}

export async function fetchLeaderboard(params?: {
  categoryFilter?: 'ALL' | GameCategory;
  gameIdFilter?: string;
  limitCount?: number;
} | string): Promise<LeaderboardEntry[]> {
  try {
    let categoryFilter: 'ALL' | GameCategory = 'ALL';
    let gameIdFilter: string | undefined = undefined;
    let maxLimit = 100;

    if (typeof params === 'string') {
      gameIdFilter = params;
    } else if (params && typeof params === 'object') {
      categoryFilter = params.categoryFilter || 'ALL';
      gameIdFilter = params.gameIdFilter;
      if (params.limitCount && params.limitCount > 0) {
        maxLimit = params.limitCount;
      }
    }

    // If specific game is selected, query playerGameRatings for that game
    if (gameIdFilter && gameIdFilter !== 'all') {
      const cleanG = gameIdFilter.toLowerCase().trim();
      const UNWANTED_GAMES = ['tekken', 'rocket league', 'rocketleague', 'mortal kombat', 'mortalkombat', 'fortnite', 'call of duty', 'callofduty', 'cod'];
      if (UNWANTED_GAMES.some((u) => cleanG.includes(u))) {
        return [];
      }

      const isFc = cleanG === 'fc' || cleanG === 'fc26' || cleanG === 'fc27' || cleanG.includes('fc');
      const ratingsRef = collection(db, 'playerGameRatings');

      if (isFc) {
        // Unified FC Leaderboard across all FC versions
        const qUnified = query(
          ratingsRef,
          where('gameId', 'in', ['fc', 'fc26', 'fc27']),
          limit(maxLimit * 2)
        );
        const snapshot = await getDocs(qUnified);

        const playerMap = new Map<string, PlayerGameRating>();
        snapshot.docs.forEach((d) => {
          const item = d.data() as PlayerGameRating;
          const ex = playerMap.get(item.playerId);
          if (!ex) {
            playerMap.set(item.playerId, { ...item, gameId: 'fc', gameName: 'FC', gameCategory: 'FC' });
          } else {
            const currentItemStreak = item.currentWinStreak ?? item.winStreak ?? 0;
            const currentExStreak = ex.currentWinStreak ?? ex.winStreak ?? 0;
            const bestItemStreak = item.bestWinStreak ?? currentItemStreak;
            const bestExStreak = ex.bestWinStreak ?? currentExStreak;
            playerMap.set(item.playerId, {
              ...ex,
              rating: Math.max(ex.rating, item.rating),
              wins: (ex.wins || 0) + (item.wins || 0),
              losses: (ex.losses || 0) + (item.losses || 0),
              draws: (ex.draws || 0) + (item.draws || 0),
              gamesPlayed: (ex.gamesPlayed || 0) + (item.gamesPlayed || 0),
              currentWinStreak: Math.max(currentExStreak, currentItemStreak),
              bestWinStreak: Math.max(bestExStreak, bestItemStreak),
              gameId: 'fc',
              gameName: 'FC',
              gameCategory: 'FC',
            });
          }
        });

        const sorted = Array.from(playerMap.values()).sort((a, b) => b.rating - a.rating);
        let rank = 1;
        return sorted.map((data) => {
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
        ratingsRef,
        where('gameId', '==', cleanG),
        orderBy('rating', 'desc'),
        limit(maxLimit)
      );
      const snapshot = await getDocs(q);
      
      const entries: LeaderboardEntry[] = [];
      let rank = 1;

      for (const d of snapshot.docs) {
        const data = d.data() as PlayerGameRating;
        const total = Math.max(data.gamesPlayed || 0, data.placementGames || 0);
        const winRate = total > 0 ? Math.round(((data.wins || 0) / total) * 100) : 0;
        const isProvisional = total < 10;
        const currentWinStreak = data.currentWinStreak ?? data.winStreak ?? 0;
        const bestWinStreak = data.bestWinStreak ?? currentWinStreak;
        
        entries.push({
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
          currentWinStreak,
          bestWinStreak,
          gameId: data.gameId,
          gameName: data.gameName,
          gameCategory: data.gameCategory,
        });
      }

      return entries;
    }

    // If category filter is PC, PS5, or CHESS
    if (categoryFilter !== 'ALL') {
      const ratingsRef = collection(db, 'playerGameRatings');
      const q = query(
        ratingsRef,
        where('gameCategory', '==', categoryFilter),
        orderBy('rating', 'desc'),
        limit(maxLimit * 2)
      );
      const snapshot = await getDocs(q);
      
      // Group by player or show per-game rating highest
      const map = new Map<string, LeaderboardEntry>();

      snapshot.docs.forEach((d) => {
        const data = d.data() as PlayerGameRating;
        const existing = map.get(data.playerId);
        if (!existing || data.rating > existing.rating) {
          const total = Math.max(data.gamesPlayed || 0, data.placementGames || 0);
          const winRate = total > 0 ? Math.round(((data.wins || 0) / total) * 100) : 0;
          const isProvisional = total < 10;
          const currentWinStreak = data.currentWinStreak ?? data.winStreak ?? 0;
          const bestWinStreak = data.bestWinStreak ?? currentWinStreak;
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
            currentWinStreak,
            bestWinStreak,
            gameId: data.gameId,
            gameName: data.gameName,
            gameCategory: data.gameCategory,
          });
        }
      });

      const sorted = Array.from(map.values()).sort((a, b) => b.rating - a.rating).slice(0, maxLimit);
      return sorted.map((entry, idx) => ({ ...entry, rank: idx + 1 }));
    }

    // Overall leaderboard based on all players, sorted strictly by overallRating (MMR)
    const playersRef = collection(db, 'players');
    const q = query(playersRef, orderBy('overallRating', 'desc'), limit(maxLimit));
    const snapshot = await getDocs(q);

    return snapshot.docs.map((docSnap, index) => {
      const p = docSnap.data() as Player;
      const total = p.totalGames || 0;
      const winRate = total > 0 ? Math.round(((p.totalWins || 0) / total) * 100) : 0;
      const isProvisional = total < 10;
      const currentWinStreak = p.currentWinStreak || 0;
      const bestWinStreak = p.bestWinStreak || currentWinStreak;
      return {
        rank: index + 1,
        playerId: p.uid,
        gamerTag: p.gamerTag,
        fullName: p.fullName,
        rating: p.overallRating || INITIAL_RATING,
        gamesPlayed: total,
        wins: p.totalWins || 0,
        losses: p.totalLosses || 0,
        draws: p.totalDraws || 0,
        winRate,
        isProvisional,
        placementGames: total,
        currentWinStreak,
        bestWinStreak,
      };
    });
  } catch (err) {
    console.error('Failed to fetch leaderboard:', err);
    return [];
  }
}

export async function updatePlayerRole(targetUid: string, newRole: 'player' | 'admin'): Promise<void> {
  await updateDoc(doc(db, 'players', targetUid), {
    role: newRole,
  });
}

/**
 * Subscribe to player leaderboard in real time
 */
export function subscribeToLeaderboard(
  gameId: string | undefined,
  callback: (players: Player[]) => void
) {
  const playersRef = collection(db, 'players');
  const q = query(playersRef, orderBy('overallRating', 'desc'), limit(100));

  return onSnapshot(
    q,
    (snap) => {
      callback(snap.docs.map((d) => d.data() as Player));
    },
    (err) => {
      console.error('Leaderboard subscription error:', err);
      callback([]);
    }
  );
}

