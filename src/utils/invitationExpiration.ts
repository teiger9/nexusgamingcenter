import { useState, useEffect, useMemo, useRef } from 'react';
import { doc, updateDoc, getDoc, runTransaction } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { CanonicalInvitationStatus, TeamInvitation } from '../types';

/**
 * Universal Invitation Expiration Constants
 * Every invitation to play a match (Chess 1v1, FC 26/27, Valorant 5v5, CS2 5v5, etc.)
 * or join a lobby/team expires strictly 15 minutes after creation.
 */
export const INVITATION_EXPIRATION_MS = 15 * 60 * 1000; // 15 minutes = 900,000 ms

/**
 * Calculate the expiresAt timestamp from a trusted createdAt timestamp.
 */
export function calculateInvitationExpiresAt(createdAt: number = Date.now()): number {
  return createdAt + INVITATION_EXPIRATION_MS;
}

/**
 * Extract or compute the numeric expiresAt timestamp from an invitation, notification, or match document.
 */
export function getInvitationExpiresAt(item?: {
  expiresAt?: number;
  createdAt?: number;
  data?: { expiresAt?: number; createdAt?: number };
  [key: string]: any;
}): number {
  if (!item) return 0;

  // Direct expiresAt field
  if (typeof item.expiresAt === 'number' && item.expiresAt > 0) {
    return item.expiresAt;
  }

  // Nested in notification data
  if (typeof item.data?.expiresAt === 'number' && item.data.expiresAt > 0) {
    return item.data.expiresAt;
  }

  // Fallback: computed from createdAt + 15 minutes
  if (typeof item.createdAt === 'number' && item.createdAt > 0) {
    return item.createdAt + INVITATION_EXPIRATION_MS;
  }

  if (typeof item.data?.createdAt === 'number' && item.data.createdAt > 0) {
    return item.data.createdAt + INVITATION_EXPIRATION_MS;
  }

  return 0;
}

/**
 * Checks whether an invitation has expired based on its status and timestamps.
 * A terminal status (ACCEPTED, DECLINED, CANCELLED) takes precedence over expiration.
 */
export function isInvitationExpired(
  item?: {
    status?: string;
    expiresAt?: number;
    createdAt?: number;
    data?: { status?: string; expiresAt?: number; createdAt?: number };
    [key: string]: any;
  },
  currentTime: number = Date.now()
): boolean {
  if (!item) return false;

  const rawStatus = (item.status || item.data?.status || '').toUpperCase();
  if (rawStatus === 'EXPIRED') return true;

  // If already reached terminal state other than EXPIRED, do not consider it expired
  if (rawStatus === 'ACCEPTED' || rawStatus === 'DECLINED' || rawStatus === 'CANCELLED') {
    return false;
  }

  const expiresAt = getInvitationExpiresAt(item);
  if (!expiresAt) return false;

  return currentTime >= expiresAt;
}

/**
 * Formats milliseconds remaining into a clean MM:SS countdown string (e.g., "14:32").
 */
export function formatInvitationCountdown(remainingMs: number): string {
  if (remainingMs <= 0) return '00:00';
  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * React hook to maintain a local, second-by-second countdown for an invitation.
 * CRITICAL: This updates strictly locally in client React state every second.
 * It does NOT write to Firebase every second.
 */
export function useInvitationCountdown(
  expiresAt?: number,
  isPending: boolean = true,
  onExpired?: () => void
) {
  const [now, setNow] = useState<number>(() => Date.now());
  const expiredHandledRef = useRef<boolean>(false);

  useEffect(() => {
    if (!expiresAt || !isPending) return;

    // Check immediately if already expired
    if (Date.now() >= expiresAt) {
      setNow(Date.now());
      if (!expiredHandledRef.current) {
        expiredHandledRef.current = true;
        onExpired?.();
      }
      return;
    }

    expiredHandledRef.current = false;
    const interval = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= expiresAt) {
        clearInterval(interval);
        if (!expiredHandledRef.current) {
          expiredHandledRef.current = true;
          onExpired?.();
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [expiresAt, isPending, onExpired]);

  const remainingMs = useMemo(() => {
    if (!expiresAt) return 0;
    return Math.max(0, expiresAt - now);
  }, [expiresAt, now]);

  const isExpired = useMemo(() => {
    if (!expiresAt) return false;
    return now >= expiresAt;
  }, [expiresAt, now]);

  const formatted = useMemo(() => {
    return formatInvitationCountdown(remainingMs);
  }, [remainingMs]);

  return {
    remainingMs,
    formatted,
    isExpired,
    expiresAt,
  };
}

/**
 * Atomically marks an invitation and its associated match/notification as EXPIRED in Firestore
 * if it is still currently PENDING and its time has elapsed.
 * Uses Firestore transaction to guarantee that state transitions are mutually exclusive (PENDING -> ACCEPTED or PENDING -> EXPIRED).
 */
export async function markInvitationExpiredInFirestore(invitationId: string, matchId?: string): Promise<boolean> {
  if (!invitationId) return false;

  try {
    const invRef = doc(db, 'teamInvitations', invitationId);

    const didExpire = await runTransaction(db, async (transaction) => {
      const invSnap = await transaction.get(invRef);
      if (!invSnap.exists()) return false;

      const invData = invSnap.data() as TeamInvitation;
      const status = (invData.status || '').toUpperCase();

      // Only transition if still PENDING
      if (status !== 'PENDING') {
        return false;
      }

      const now = Date.now();
      const expiresAt = invData.expiresAt || (invData.createdAt ? invData.createdAt + INVITATION_EXPIRATION_MS : 0);

      // Verify expiration criteria
      if (expiresAt && now < expiresAt) {
        return false;
      }

      transaction.update(invRef, {
        status: 'EXPIRED',
        expiredAt: now,
        updatedAt: now,
      });

      return true;
    });

    // If matchId exists and match is still awaiting opponent, sync invitationStatus
    const resolvedMatchId = matchId;
    if (didExpire && resolvedMatchId) {
      try {
        const matchRef = doc(db, 'matches', resolvedMatchId);
        const matchSnap = await getDoc(matchRef);
        if (matchSnap.exists()) {
          const matchData = matchSnap.data();
          if (matchData.invitationStatus === 'PENDING' && !matchData.opponentAccepted) {
            await updateDoc(matchRef, {
              invitationStatus: 'EXPIRED',
              updatedAt: Date.now(),
            });
          }
        }
      } catch (err) {
        console.warn('Could not sync match expiration status:', err);
      }
    }

    return didExpire;
  } catch (error) {
    console.warn(`[Invitation Expiration] Error transitioning invitation ${invitationId} to EXPIRED:`, error);
    return false;
  }
}
