import { useState, useEffect } from 'react';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Player } from '../types';

// In-memory global profile cache to prevent flickering and excessive Firestore reads
const profileCache = new Map<string, Player>();

/**
 * Fetch a single player's real-time profile by UID
 */
export async function fetchPlayerProfile(uid: string): Promise<Player | null> {
  if (!uid || typeof uid !== 'string') return null;
  const cached = profileCache.get(uid);
  if (cached) return cached;

  try {
    const snap = await getDoc(doc(db, 'players', uid));
    if (snap.exists()) {
      const data = snap.data() as Player;
      profileCache.set(uid, data);
      return data;
    }
  } catch (err) {
    console.warn(`Could not fetch profile for UID: ${uid}`, err);
  }
  return null;
}

/**
 * Fetch multiple player profiles concurrently by UID
 */
export async function fetchPlayerProfiles(uids: string[]): Promise<Record<string, Player>> {
  const validUids = Array.from(new Set(uids.filter((u) => !!u && typeof u === 'string' && u.length > 3)));
  const result: Record<string, Player> = {};

  await Promise.all(
    validUids.map(async (uid) => {
      const p = await fetchPlayerProfile(uid);
      if (p) {
        result[uid] = p;
      }
    })
  );

  return result;
}

/**
 * Subscribe in real-time to an array of player UIDs
 * Single source of truth: user/player profile in Firestore
 */
export function subscribeToPlayerProfiles(
  uids: string[],
  callback: (profiles: Record<string, Player>) => void
): () => void {
  const validUids = Array.from(new Set(uids.filter((u) => !!u && typeof u === 'string' && u.length > 3)));

  if (validUids.length === 0) {
    callback({});
    return () => {};
  }

  const profilesMap: Record<string, Player> = {};
  // Populate from cache immediately
  validUids.forEach((uid) => {
    if (profileCache.has(uid)) {
      profilesMap[uid] = profileCache.get(uid)!;
    }
  });
  callback({ ...profilesMap });

  const unsubs = validUids.map((uid) => {
    return onSnapshot(
      doc(db, 'players', uid),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as Player;
          profileCache.set(uid, data);
          profilesMap[uid] = data;
          callback({ ...profilesMap });
        }
      },
      (err) => {
        console.warn(`Profile subscription error for ${uid}:`, err);
      }
    );
  });

  return () => {
    unsubs.forEach((unsub) => unsub());
  };
}

/**
 * React hook to resolve live player profiles for an array of player UIDs
 */
export function usePlayerProfiles(uids: (string | undefined | null)[]): {
  profiles: Record<string, Player>;
  loading: boolean;
} {
  const [profiles, setProfiles] = useState<Record<string, Player>>(() => {
    const initial: Record<string, Player> = {};
    uids.forEach((u) => {
      if (u && profileCache.has(u)) {
        initial[u] = profileCache.get(u)!;
      }
    });
    return initial;
  });
  const [loading, setLoading] = useState(true);

  const uidsKey = uids.filter(Boolean).sort().join(',');

  useEffect(() => {
    const cleanUids = uids.filter((u): u is string => typeof u === 'string' && u.length > 3);
    if (cleanUids.length === 0) {
      setProfiles({});
      setLoading(false);
      return;
    }

    const unsub = subscribeToPlayerProfiles(cleanUids, (latest) => {
      setProfiles(latest);
      setLoading(false);
    });

    return () => unsub();
  }, [uidsKey]);

  return { profiles, loading };
}

export interface ResolvedPlayerIdentity {
  uid: string;
  displayName: string;
  gamerTag: string;
  ign?: string;
  ignLabel?: string;
  rating: number;
  avatarUrl?: string;
  isCaptain?: boolean;
}

/**
 * Resolves a player's identity strictly adhering to the requirements:
 * 1. Single source of truth: playerUid -> user/player profile
 * 2. Never displays "undefined", "null", "[object Object]", or raw Firebase UID
 * 3. Formats Real/Nexus Player Name and Game-Specific IGN (CS2, Valorant, etc.)
 */
export function resolvePlayerIdentity(params: {
  uid?: string | null;
  profile?: Player | null;
  snapshot?: { id?: string; gamerTag?: string; name?: string; rating?: number; inGameName?: string };
  gameId?: string;
  captainId?: string;
  slotIndex?: number;
}): ResolvedPlayerIdentity {
  const { uid, profile, snapshot, gameId = '', captainId, slotIndex } = params;
  const safeUid = uid || snapshot?.id || '';

  // 1. Resolve Display Name (Full Name or Nexus Player Name)
  let rawName = profile?.fullName || snapshot?.name || profile?.gamerTag || snapshot?.gamerTag || '';
  if (
    !rawName ||
    rawName === 'undefined' ||
    rawName === 'null' ||
    rawName === '[object Object]' ||
    rawName === safeUid
  ) {
    rawName = profile?.gamerTag || snapshot?.gamerTag || (slotIndex !== undefined ? `Player ${slotIndex + 1}` : 'Player');
  }

  // 2. Resolve GamerTag
  let rawTag = profile?.gamerTag || snapshot?.gamerTag || rawName;
  if (
    !rawTag ||
    rawTag === 'undefined' ||
    rawTag === 'null' ||
    rawTag === '[object Object]' ||
    rawTag === safeUid
  ) {
    rawTag = rawName;
  }

  // 3. Resolve Game-Specific IGN
  const normGame = (gameId || '').toLowerCase().trim();
  let ign: string | undefined = undefined;
  let ignLabel = 'IGN';

  if (normGame.includes('cs') || normGame.includes('counter-strike')) {
    ignLabel = 'CS2';
    ign = profile?.inGameNames?.['cs2'] ||
      profile?.inGameNames?.['counter-strike'] ||
      snapshot?.inGameName ||
      profile?.inGameName;
  } else if (normGame.includes('val') || normGame.includes('valorant')) {
    ignLabel = 'VALORANT';
    ign = profile?.inGameNames?.['valorant'] ||
      snapshot?.inGameName ||
      profile?.inGameName;
  } else if (normGame.includes('chess')) {
    ignLabel = 'CHESS ID';
    ign = profile?.inGameNames?.['chess'] ||
      snapshot?.inGameName ||
      profile?.inGameName;
  } else if (normGame.includes('fc') || normGame.includes('fifa')) {
    ignLabel = 'EA ID';
    ign = profile?.inGameNames?.['fc26'] ||
      profile?.inGameNames?.['fc27'] ||
      profile?.inGameNames?.['fifa'] ||
      snapshot?.inGameName ||
      profile?.inGameName;
  } else {
    ignLabel = 'IGN';
    ign = profile?.inGameNames?.[normGame] ||
      snapshot?.inGameName ||
      profile?.inGameName;
  }

  // Sanitize IGN so it never shows junk
  if (
    ign &&
    (ign === 'undefined' || ign === 'null' || ign === '[object Object]' || ign === safeUid || !ign.trim())
  ) {
    ign = undefined;
  }

  // 4. Rating
  const rating = profile?.overallRating || snapshot?.rating || 1000;

  // 5. Captain check
  const isCaptain = !!captainId && captainId === safeUid;

  return {
    uid: safeUid,
    displayName: rawName.trim(),
    gamerTag: rawTag.trim(),
    ign: ign?.trim(),
    ignLabel,
    rating,
    avatarUrl: profile?.avatarUrl,
    isCaptain,
  };
}
