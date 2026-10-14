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
  onSnapshot,
  QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { MatchHistoryRecord } from '../types';

export interface MatchHistoryFilterOptions {
  game?: string; // 'ALL' | 'Chess' | 'FC 26' | 'FC 27' | 'FC' | 'CS2' | 'Valorant' | 'League of Legends'
  searchGamerTag?: string;
  playerId?: string; // For "My Matches" or profile view
  seasonId?: string;
  limitCount?: number;
  sortOrder?: 'latest' | 'oldest';
}

export interface PaginatedMatchHistoryResult {
  records: MatchHistoryRecord[];
  lastDoc: QueryDocumentSnapshot | null;
  hasMore: boolean;
}

/**
 * Format timestamp into gaming-center match format: e.g. "30 Sep · 18:42"
 */
export function formatRecentMatchDate(timestamp: number): string {
  if (!timestamp) return 'Recent';
  const d = new Date(timestamp);
  const day = d.getDate();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[d.getMonth()];
  const hours = d.getHours().toString().padStart(2, '0');
  const mins = d.getMinutes().toString().padStart(2, '0');
  return `${day} ${month} · ${hours}:${mins}`;
}

/**
 * Lightweight real-time subscriber for Home and Play sections
 * Subscribes to the latest 5-10 validated matches (default 6) ordered by validatedAt DESC.
 */
export function subscribeToRecentMatches(
  limitCount: number = 6,
  callback: (matches: MatchHistoryRecord[]) => void
): () => void {
  const historyRef = collection(db, 'matchHistory');
  const q = query(historyRef, orderBy('validatedAt', 'desc'), limit(limitCount));

  return onSnapshot(
    q,
    (snap) => {
      const records: MatchHistoryRecord[] = [];
      snap.forEach((d) => {
        records.push({ id: d.id, ...(d.data() as MatchHistoryRecord) });
      });
      callback(records);
    },
    (err) => {
      console.warn('subscribeToRecentMatches error, trying fallback:', err);
      getDocs(query(historyRef, limit(limitCount * 2)))
        .then((snap) => {
          const records: MatchHistoryRecord[] = [];
          snap.forEach((d) => {
            records.push({ id: d.id, ...(d.data() as MatchHistoryRecord) });
          });
          records.sort((a, b) => (b.validatedAt || b.createdAt || 0) - (a.validatedAt || a.createdAt || 0));
          callback(records.slice(0, limitCount));
        })
        .catch((fallbackErr) => {
          console.error('Recent matches fallback failed:', fallbackErr);
          callback([]);
        });
    }
  );
}

/**
 * Normalizes game names for filtering across diverse inputs
 */
export function normalizeGameFilter(game: string): string {
  const g = (game || '').toLowerCase().trim();
  if (g === 'all' || !g) return 'ALL';
  if (g.includes('chess')) return 'Chess';
  if (g === 'fc 26' || g === 'fc26') return 'FC 26';
  if (g === 'fc 27' || g === 'fc27') return 'FC 27';
  if (g === 'fc') return 'FC';
  if (g.includes('cs') || g.includes('counter-strike') || g.includes('counterstrike')) return 'CS2';
  if (g.includes('val') || g.includes('valorant')) return 'Valorant';
  if (g.includes('lol') || g.includes('league')) return 'League of Legends';
  return game;
}

/**
 * Real-time subscription to Match History with client-side filtering support
 * to prevent index crashes while ensuring most-recent matches first.
 */
export function subscribeToMatchHistory(
  options: MatchHistoryFilterOptions,
  callback: (matches: MatchHistoryRecord[]) => void
): () => void {
  const historyRef = collection(db, 'matchHistory');
  const targetLimit = options.limitCount || 100;

  // Base query ordered by validation time descending
  const q = query(historyRef, orderBy('validatedAt', 'desc'), limit(targetLimit));

  const filterDocs = (records: MatchHistoryRecord[]): MatchHistoryRecord[] => {
    let result = records;

    // 1. Filter by Game
    if (options.game && options.game !== 'ALL') {
      const normalizedTarget = normalizeGameFilter(options.game).toLowerCase();
      result = result.filter((m) => {
        const itemGame = normalizeGameFilter(m.game).toLowerCase();
        return itemGame === normalizedTarget || (normalizedTarget === 'fc' && itemGame.includes('fc'));
      });
    }

    // 2. Filter by Player ID (My Matches)
    if (options.playerId) {
      const pId = options.playerId;
      result = result.filter(
        (m) =>
          m.player1Id === pId ||
          m.player2Id === pId ||
          m.winnerId === pId ||
          m.loserId === pId ||
          m.team1PlayerIds?.includes(pId) ||
          m.team2PlayerIds?.includes(pId)
      );
    }

    // 3. Search by GamerTag
    if (options.searchGamerTag && options.searchGamerTag.trim()) {
      const s = options.searchGamerTag.trim().toLowerCase();
      result = result.filter(
        (m) =>
          (m.player1GamerTag && m.player1GamerTag.toLowerCase().includes(s)) ||
          (m.player2GamerTag && m.player2GamerTag.toLowerCase().includes(s)) ||
          (m.winnerGamerTag && m.winnerGamerTag.toLowerCase().includes(s)) ||
          (m.loserGamerTag && m.loserGamerTag.toLowerCase().includes(s)) ||
          m.team1GamerTags?.some((t) => t.toLowerCase().includes(s)) ||
          m.team2GamerTags?.some((t) => t.toLowerCase().includes(s))
      );
    }

    // 4. Sort Order: Latest vs Oldest
    if (options.sortOrder === 'oldest') {
      result.sort((a, b) => (a.validatedAt || a.createdAt || 0) - (b.validatedAt || b.createdAt || 0));
    } else {
      result.sort((a, b) => (b.validatedAt || b.createdAt || 0) - (a.validatedAt || a.createdAt || 0));
    }

    return result;
  };

  const unsub = onSnapshot(
    q,
    (snap) => {
      const records: MatchHistoryRecord[] = [];
      snap.forEach((d) => {
        records.push({ id: d.id, ...(d.data() as MatchHistoryRecord) });
      });
      callback(filterDocs(records));
    },
    (err) => {
      console.warn('Match history snapshot error, attempting fallback:', err);
      // Fallback: fetch without order if index is building
      const fallbackQ = query(historyRef, limit(targetLimit));
      getDocs(fallbackQ)
        .then((snap) => {
          const records: MatchHistoryRecord[] = [];
          snap.forEach((d) => {
            records.push({ id: d.id, ...(d.data() as MatchHistoryRecord) });
          });
          records.sort((a, b) => (b.validatedAt || b.createdAt || 0) - (a.validatedAt || a.createdAt || 0));
          callback(filterDocs(records));
        })
        .catch((fallbackErr) => {
          console.error('Match history fallback error:', fallbackErr);
          callback([]);
        });
    }
  );

  return unsub;
}

/**
 * Fetch all validated match history records for a specific player (for player profile)
 * Limited to recent matches by default to protect client performance
 */
export async function fetchPlayerMatchHistory(playerId: string, limitCount: number = 10): Promise<MatchHistoryRecord[]> {
  if (!playerId) return [];
  try {
    const historyRef = collection(db, 'matchHistory');
    // Fetch recent match history records with a reasonable limit
    const q = query(historyRef, orderBy('validatedAt', 'desc'), limit(Math.min(50, limitCount * 4)));
    const snap = await getDocs(q);

    const matches: MatchHistoryRecord[] = [];
    snap.forEach((d) => {
      const data = { id: d.id, ...(d.data() as MatchHistoryRecord) };
      if (
        data.player1Id === playerId ||
        data.player2Id === playerId ||
        data.winnerId === playerId ||
        data.loserId === playerId ||
        data.team1PlayerIds?.includes(playerId) ||
        data.team2PlayerIds?.includes(playerId)
      ) {
        matches.push(data);
      }
    });

    return matches.slice(0, limitCount);
  } catch (err) {
    console.warn('fetchPlayerMatchHistory error, attempting fallback:', err);
    try {
      const snap = await getDocs(query(collection(db, 'matchHistory'), limit(40)));
      const matches: MatchHistoryRecord[] = [];
      snap.forEach((d) => {
        const data = { id: d.id, ...(d.data() as MatchHistoryRecord) };
        if (
          data.player1Id === playerId ||
          data.player2Id === playerId ||
          data.winnerId === playerId ||
          data.loserId === playerId ||
          data.team1PlayerIds?.includes(playerId) ||
          data.team2PlayerIds?.includes(playerId)
        ) {
          matches.push(data);
        }
      });
      matches.sort((a, b) => (b.validatedAt || 0) - (a.validatedAt || 0));
      return matches.slice(0, limitCount);
    } catch (e) {
      console.error('Fallback failed:', e);
      return [];
    }
  }
}

/**
 * Paginated cursor-based match history query for 100,000+ matches scale
 */
export async function fetchMatchHistoryPaginated(
  options: MatchHistoryFilterOptions & { pageSize?: number; lastDoc?: QueryDocumentSnapshot | null }
): Promise<PaginatedMatchHistoryResult> {
  const {
    game = 'ALL',
    searchGamerTag = '',
    playerId = '',
    seasonId = '',
    pageSize = 24,
    lastDoc = null,
    sortOrder = 'latest',
  } = options;

  try {
    const historyRef = collection(db, 'matchHistory');
    const orderDirection = sortOrder === 'oldest' ? 'asc' : 'desc';

    const qConstraints: any[] = [];

    // Server-side filter by game if not ALL
    if (game && game !== 'ALL') {
      const normGame = normalizeGameFilter(game);
      if (normGame === 'FC') {
        qConstraints.push(where('game', 'in', ['FC', 'FC 26', 'FC 27']));
      } else {
        qConstraints.push(where('game', '==', normGame));
      }
    }

    // Server-side filter by season if provided
    if (seasonId) {
      qConstraints.push(where('seasonId', '==', seasonId));
    }

    qConstraints.push(orderBy('validatedAt', orderDirection));

    if (lastDoc) {
      qConstraints.push(startAfter(lastDoc));
    }

    qConstraints.push(limit(pageSize + 1));

    const q = query(historyRef, ...qConstraints);
    const snap = await getDocs(q);

    const allDocs = snap.docs;
    const hasMore = allDocs.length > pageSize;
    const resultDocs = hasMore ? allDocs.slice(0, pageSize) : allDocs;

    let records: MatchHistoryRecord[] = resultDocs.map((d) => ({
      id: d.id,
      ...(d.data() as MatchHistoryRecord),
    }));

    // Filter by Player ID if specified
    if (playerId) {
      records = records.filter(
        (m) =>
          m.player1Id === playerId ||
          m.player2Id === playerId ||
          m.winnerId === playerId ||
          m.loserId === playerId ||
          m.team1PlayerIds?.includes(playerId) ||
          m.team2PlayerIds?.includes(playerId)
      );
    }

    // Filter by search gamer tag if specified
    if (searchGamerTag.trim()) {
      const s = searchGamerTag.trim().toLowerCase();
      records = records.filter(
        (m) =>
          (m.player1GamerTag && m.player1GamerTag.toLowerCase().includes(s)) ||
          (m.player2GamerTag && m.player2GamerTag.toLowerCase().includes(s)) ||
          (m.winnerGamerTag && m.winnerGamerTag.toLowerCase().includes(s)) ||
          (m.loserGamerTag && m.loserGamerTag.toLowerCase().includes(s)) ||
          m.team1GamerTags?.some((t) => t.toLowerCase().includes(s)) ||
          m.team2GamerTags?.some((t) => t.toLowerCase().includes(s))
      );
    }

    return {
      records,
      lastDoc: resultDocs.length > 0 ? resultDocs[resultDocs.length - 1] : null,
      hasMore,
    };
  } catch (err) {
    console.warn('fetchMatchHistoryPaginated index fallback:', err);
    try {
      const historyRef = collection(db, 'matchHistory');
      let q = query(historyRef, orderBy('validatedAt', 'desc'), limit(pageSize * 2));
      if (lastDoc) {
        q = query(historyRef, orderBy('validatedAt', 'desc'), startAfter(lastDoc), limit(pageSize * 2));
      }
      const snap = await getDocs(q);
      const records: MatchHistoryRecord[] = [];
      snap.docs.forEach((d) => records.push({ id: d.id, ...(d.data() as MatchHistoryRecord) }));
      return {
        records: records.slice(0, pageSize),
        lastDoc: snap.docs.length > 0 ? snap.docs[Math.min(pageSize - 1, snap.docs.length - 1)] : null,
        hasMore: snap.docs.length > pageSize,
      };
    } catch (e) {
      console.error('fetchMatchHistoryPaginated fallback failed:', e);
      return { records: [], lastDoc: null, hasMore: false };
    }
  }
}

/**
 * Paginated match history for player profiles (10 matches per page)
 */
export async function fetchPlayerMatchHistoryPaginated(
  playerId: string,
  pageSize: number = 10,
  lastDoc: QueryDocumentSnapshot | null = null,
  gameFilter?: string
): Promise<PaginatedMatchHistoryResult> {
  if (!playerId) return { records: [], lastDoc: null, hasMore: false };
  try {
    const historyRef = collection(db, 'matchHistory');
    let q = query(historyRef, orderBy('validatedAt', 'desc'), limit(50));
    if (lastDoc) {
      q = query(historyRef, orderBy('validatedAt', 'desc'), startAfter(lastDoc), limit(50));
    }
    const snap = await getDocs(q);
    const matches: MatchHistoryRecord[] = [];
    let lastProcessedDoc: QueryDocumentSnapshot | null = null;

    for (const d of snap.docs) {
      lastProcessedDoc = d;
      const data = { id: d.id, ...(d.data() as MatchHistoryRecord) };
      const isPlayerMatch =
        data.player1Id === playerId ||
        data.player2Id === playerId ||
        data.winnerId === playerId ||
        data.loserId === playerId ||
        data.team1PlayerIds?.includes(playerId) ||
        data.team2PlayerIds?.includes(playerId);

      if (isPlayerMatch) {
        if (!gameFilter || gameFilter === 'ALL' || (data.game || '').toLowerCase() === gameFilter.toLowerCase()) {
          matches.push(data);
          if (matches.length >= pageSize) {
            break;
          }
        }
      }
    }

    return {
      records: matches,
      lastDoc: lastProcessedDoc,
      hasMore: snap.docs.length === 50,
    };
  } catch (err) {
    console.error('fetchPlayerMatchHistoryPaginated error:', err);
    return { records: [], lastDoc: null, hasMore: false };
  }
}

/**
 * Fetch a single validated match history record by ID
 */
export async function fetchMatchHistoryById(matchId: string): Promise<MatchHistoryRecord | null> {
  if (!matchId) return null;
  try {
    const snap = await getDoc(doc(db, 'matchHistory', matchId));
    if (snap.exists()) {
      return { id: snap.id, ...(snap.data() as MatchHistoryRecord) };
    }
    return null;
  } catch (err) {
    console.error('Error fetching match history by ID:', err);
    return null;
  }
}
