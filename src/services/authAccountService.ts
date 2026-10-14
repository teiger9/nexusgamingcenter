/**
 * Nexus Gaming Center - Account & Username Uniqueness Service
 * Enforces atomic username uniqueness, race-condition protection, and recovery.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  limit,
  setDoc,
  runTransaction,
  Transaction,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { normalizeGamerTag, cleanForFirestore } from '../utils/firestoreSanitizer';
import { Player } from '../types';

export interface UsernameRecord {
  uid: string;
  gamerTag: string;
  createdAt: number;
}

/**
 * Checks if a GamerTag is available for registration or change.
 * Checks BOTH the atomic `usernames/{tag}` index and the legacy `players` collection.
 */
export async function isUsernameAvailable(
  rawTag: string,
  excludeUid?: string
): Promise<{
  available: boolean;
  reason?: string;
  normalizedTag: string;
  displayTag: string;
}> {
  const norm = normalizeGamerTag(rawTag);
  if (!norm.isValid) {
    return {
      available: false,
      reason: norm.error,
      normalizedTag: norm.normalizedTag,
      displayTag: norm.displayTag,
    };
  }

  const { normalizedTag, displayTag } = norm;

  try {
    // 1. Check atomic usernames index
    const usernameDocRef = doc(db, 'usernames', normalizedTag);
    const usernameSnap = await getDoc(usernameDocRef);

    if (usernameSnap.exists()) {
      const data = usernameSnap.data() as UsernameRecord;
      if (excludeUid && data.uid === excludeUid) {
        return { available: true, normalizedTag, displayTag };
      }
      return {
        available: false,
        reason: `Username "${displayTag}" is already taken. Please choose another.`,
        normalizedTag,
        displayTag,
      };
    }

    // 2. Backward compatibility: check players collection
    const playersRef = collection(db, 'players');
    const legacyQ = query(
      playersRef,
      where('gamerTagLower', '==', normalizedTag),
      limit(1)
    );
    const legacySnap = await getDocs(legacyQ);

    if (!legacySnap.empty) {
      const docOwner = legacySnap.docs[0];
      if (excludeUid && docOwner.id === excludeUid) {
        return { available: true, normalizedTag, displayTag };
      }
      return {
        available: false,
        reason: `Username "${displayTag}" is already taken by an existing competitor.`,
        normalizedTag,
        displayTag,
      };
    }

    return { available: true, normalizedTag, displayTag };
  } catch (err: any) {
    console.error('Error checking username availability:', err);
    // If permission or network issue, fail closed or bubble error
    return {
      available: false,
      reason: 'Unable to verify username availability. Please check your connection.',
      normalizedTag,
      displayTag,
    };
  }
}

/**
 * Atomically claims a username for a UID inside an existing transaction.
 * Throws an Error if the username is already claimed by another UID.
 */
export async function claimUsernameInTransaction(
  transaction: Transaction,
  uid: string,
  rawTag: string
): Promise<{ normalizedTag: string; displayTag: string }> {
  const norm = normalizeGamerTag(rawTag);
  if (!norm.isValid) {
    throw new Error(norm.error || 'Invalid GamerTag.');
  }

  const { normalizedTag, displayTag } = norm;
  const usernameRef = doc(db, 'usernames', normalizedTag);
  const snap = await transaction.get(usernameRef);

  if (snap.exists()) {
    const existing = snap.data() as UsernameRecord;
    if (existing.uid !== uid) {
      throw new Error(`Username "${displayTag}" was just taken by another user. Please choose a different GamerTag.`);
    }
  }

  transaction.set(
    usernameRef,
    cleanForFirestore({
      uid,
      gamerTag: displayTag,
      createdAt: Date.now(),
    })
  );

  return { normalizedTag, displayTag };
}

/**
 * Atomically writes a new Player profile and claims their username.
 * Guaranteed idempotent and race-condition proof.
 */
export async function createPlayerProfileAtomically(
  player: Player
): Promise<{ success: boolean; error?: string }> {
  const norm = normalizeGamerTag(player.gamerTag);
  if (!norm.isValid) {
    return { success: false, error: norm.error };
  }

  const normalizedTag = norm.normalizedTag;
  const usernameRef = doc(db, 'usernames', normalizedTag);
  const playerRef = doc(db, 'players', player.uid);

  try {
    await runTransaction(db, async (tx) => {
      // 1. Verify username is not claimed
      const usernameSnap = await tx.get(usernameRef);
      if (usernameSnap.exists()) {
        const uData = usernameSnap.data() as UsernameRecord;
        if (uData.uid !== player.uid) {
          throw new Error(`Username "${player.gamerTag}" is already taken. Please choose another.`);
        }
      }

      // 2. Verify player doc doesn't already exist with different immutable fields
      const existingPlayerSnap = await tx.get(playerRef);
      if (existingPlayerSnap.exists()) {
        // Idempotent retry: if already created by this exact user, don't overwrite crucial stats
        const existingData = existingPlayerSnap.data() as Player;
        if (existingData.uid === player.uid) {
          return;
        }
      }

      // 3. Atomically claim username
      tx.set(
        usernameRef,
        cleanForFirestore({
          uid: player.uid,
          gamerTag: norm.displayTag,
          createdAt: Date.now(),
        })
      );

      // 4. Atomically write sanitized player profile
      const sanitizedPlayer = cleanForFirestore({
        ...player,
        gamerTag: norm.displayTag,
        gamerTagLower: normalizedTag,
        role: 'player', // Default role forced to player
      });

      tx.set(playerRef, sanitizedPlayer);
    });

    return { success: true };
  } catch (err: any) {
    console.error('Atomic profile creation error:', err);
    return { success: false, error: err.message || 'Failed to create player profile.' };
  }
}

/**
 * Resolves an email address from either an email or a GamerTag.
 * Used for login to allow users to sign in with their GamerTag.
 */
export async function lookupEmailForLogin(input: string): Promise<string | null> {
  const trimmed = input.trim();
  if (trimmed.includes('@')) {
    return trimmed.toLowerCase();
  }

  const normalizedTag = trimmed.toLowerCase();

  try {
    // 1. Try atomic usernames index
    const usernameSnap = await getDoc(doc(db, 'usernames', normalizedTag));
    if (usernameSnap.exists()) {
      const uData = usernameSnap.data() as UsernameRecord;
      if (uData.uid) {
        const playerSnap = await getDoc(doc(db, 'players', uData.uid));
        if (playerSnap.exists()) {
          const p = playerSnap.data() as Player;
          if (p.email) return p.email.toLowerCase();
        }
      }
    }

    // 2. Fallback: check players collection directly
    const q = query(
      collection(db, 'players'),
      where('gamerTagLower', '==', normalizedTag),
      limit(1)
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      const p = snap.docs[0].data() as Player;
      if (p.email) return p.email.toLowerCase();
    }
  } catch (err) {
    console.warn('GamerTag to email lookup error:', err);
  }

  return null;
}

/**
 * Idempotently syncs an existing player's username into the `usernames` index
 * so older accounts have guaranteed protection against duplicate usernames.
 */
export async function syncLegacyUsernameIndex(player: Player): Promise<void> {
  if (!player || !player.uid || !player.gamerTag) return;
  const normalized = (player.gamerTagLower || player.gamerTag).trim().toLowerCase();
  if (!normalized) return;

  try {
    const uRef = doc(db, 'usernames', normalized);
    const uSnap = await getDoc(uRef);
    if (!uSnap.exists()) {
      await setDoc(
        uRef,
        cleanForFirestore({
          uid: player.uid,
          gamerTag: player.gamerTag,
          createdAt: player.createdAt || Date.now(),
        })
      );
    }
  } catch {
    // Non-blocking sync
  }
}
