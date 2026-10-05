import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { MatchHistoryRecord } from '../types';

export interface MatchHistoryFilterOptions {
  game?: string; // 'ALL' | 'Chess' | 'FC 26' | 'FC 27' | 'FC' | 'CS2' | 'Valorant' | 'League of Legends'
  searchGamerTag?: string;
  playerId?: string; // For "My Matches" or profile view
  limitCount?: number;
  sortOrder?: 'latest' | 'oldest';
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
 */
export async function fetchPlayerMatchHistory(playerId: string): Promise<MatchHistoryRecord[]> {
  if (!playerId) return [];
  try {
    const historyRef = collection(db, 'matchHistory');
    // Fetch recent match history records
    const q = query(historyRef, orderBy('validatedAt', 'desc'), limit(150));
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

    return matches;
  } catch (err) {
    console.warn('fetchPlayerMatchHistory error, attempting fallback:', err);
    try {
      const snap = await getDocs(query(collection(db, 'matchHistory'), limit(100)));
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
      return matches;
    } catch (e) {
      console.error('Fallback failed:', e);
      return [];
    }
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
