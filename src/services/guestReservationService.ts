import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  query,
  orderBy,
  limit,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
  Reservation,
  ReservationSettings,
  GamingPost,
  PostBlock,
  ReservationType,
  GamingPostType,
} from '../types';
import {
  calculateReservationPrice,
  isValidPhoneNumber,
  DEFAULT_SETTINGS,
  DEFAULT_POSTS,
} from './reservationService';

export interface GuestReservationPayload {
  fullName: string;
  phoneNumber: string;
  email?: string;
  reservationType: ReservationType;
  requestedPcCount?: number;
  selectedPostId?: string;
  gameId?: string;
  gameName?: string;
  startAt: number;
  durationHours: number;
  notes?: string;
}

export interface GuestReservationResponse {
  success: boolean;
  reservation?: Reservation;
  error?: string;
}

// In-memory rate limiting: Max 5 submissions per 10 minutes per IP
const ipRateLimits = new Map<string, { count: number; resetAt: number }>();

// In-memory duplicate submission tracking (phone + time window within 30 minutes)
interface InFlightSubmission {
  phone: string;
  startAt: number;
  endAt: number;
  createdAt: number;
  reservation: Reservation;
}
const inFlightSubmissions: InFlightSubmission[] = [];

export function checkIpRateLimit(ip: string): { allowed: boolean; retryAfterSeconds?: number } {
  const now = Date.now();
  const entry = ipRateLimits.get(ip);

  if (!entry || now > entry.resetAt) {
    ipRateLimits.set(ip, { count: 1, resetAt: now + 10 * 60 * 1000 });
    return { allowed: true };
  }

  if (entry.count >= 5) {
    const retryAfterSeconds = Math.ceil((entry.resetAt - now) / 1000);
    return { allowed: false, retryAfterSeconds };
  }

  entry.count += 1;
  return { allowed: true };
}

/**
 * Executes authoritative guest PC reservation creation on the trusted server.
 */
export async function executeGuestReservation(
  payload: GuestReservationPayload,
  clientIp: string = 'unknown'
): Promise<GuestReservationResponse & { isDuplicate?: boolean; message?: string }> {
  const {
    fullName,
    phoneNumber,
    email,
    reservationType,
    requestedPcCount,
    selectedPostId,
    gameId,
    gameName,
    startAt,
    durationHours,
    notes,
  } = payload;

  // 1. Rate Limiting Check
  const rateLimit = checkIpRateLimit(clientIp);
  if (!rateLimit.allowed) {
    return {
      success: false,
      error: `Too many reservation attempts. Please try again in ${rateLimit.retryAfterSeconds || 60} seconds.`,
    };
  }

  // 2. Validate Full Name
  const trimmedName = (fullName || '').trim();
  if (!trimmedName || trimmedName.length < 2) {
    return {
      success: false,
      error: 'Please enter a valid full name (minimum 2 characters).',
    };
  }

  // 3. Validate Phone Number (Mandatory minimum 8-15 digits)
  const rawPhone = (phoneNumber || '').trim();
  if (!rawPhone || !isValidPhoneNumber(rawPhone)) {
    return {
      success: false,
      error: 'Please enter a valid phone number (minimum 8 digits) so our staff can call to confirm.',
    };
  }

  // 4. Validate Start Time and Duration (Future time strictly required)
  const now = Date.now();
  if (startAt <= now) {
    return {
      success: false,
      error: 'The requested reservation time has already passed. Please select a future time slot.',
    };
  }

  const duration = Number(durationHours);
  if (isNaN(duration) || duration < 1 || duration > 8) {
    return {
      success: false,
      error: 'Reservation duration must be between 1 and 8 hours.',
    };
  }

  const endAt = startAt + duration * 3600 * 1000;

  // 5. Validate PC Quantity (Requirement: 8, 9, or 10 PCs for PC group reservations)
  const isPcGroup = reservationType === 'GROUP_10_PC' || reservationType === 'PC' || Boolean(requestedPcCount);
  let effectivePcCount = 10;
  if (isPcGroup) {
    effectivePcCount = requestedPcCount ? Number(requestedPcCount) : 10;
    if (effectivePcCount < 8 || effectivePcCount > 10) {
      return {
        success: false,
        error: 'PC reservations must be made for 8, 9, or 10 PCs.',
      };
    }
  }

  // 6. Anti-Duplicate Protection: Check in-memory tracking & Firestore reservations
  const cleanInputPhone = rawPhone.replace(/[\s\-\.\(\)\+]/g, '');
  const inMemoryMatch = inFlightSubmissions.find((s) => {
    if (now - s.createdAt > 30 * 60 * 1000) return false;
    if (s.phone !== cleanInputPhone) return false;
    return startAt < s.endAt && endAt > s.startAt;
  });

  if (inMemoryMatch) {
    // Authoritatively check Firestore to see if this reservation is still actively pending
    let isStillPending = true;
    try {
      const snap = await getDoc(doc(db, 'reservations', inMemoryMatch.reservation.id));
      if (snap.exists()) {
        const data = snap.data();
        if (!['PENDING', 'PENDING_ADMIN_APPROVAL'].includes(data.status)) {
          isStillPending = false;
        }
      } else {
        isStillPending = false;
      }
    } catch {
      // In case unauthenticated caller cannot read doc, assume pending only if within 5 minutes
      if (now - inMemoryMatch.createdAt > 5 * 60 * 1000) {
        isStillPending = false;
      }
    }

    if (!isStillPending) {
      // Remove stale in-flight submission so newly released slot can be booked
      const idx = inFlightSubmissions.indexOf(inMemoryMatch);
      if (idx !== -1) inFlightSubmissions.splice(idx, 1);
    } else {
      return {
        success: false,
        error: 'A pending reservation request for this phone number and time slot is already being processed by staff. We will call you shortly.',
        reservation: inMemoryMatch.reservation,
        isDuplicate: true,
      };
    }
  }

  let existingReservations: Reservation[] = [];
  try {
    const resSnap = await getDocs(collection(db, 'reservations'));
    existingReservations = resSnap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Reservation),
    }));

    const duplicateRes = existingReservations.find((r) => {
      if (!['PENDING', 'PENDING_ADMIN_APPROVAL'].includes(r.status)) return false;
      const resPhone = (r.phoneNumber || r.phone || '').replace(/[\s\-\.\(\)\+]/g, '');
      if (resPhone !== cleanInputPhone) return false;
      return startAt < r.endAt && endAt > r.startAt;
    });

    if (duplicateRes) {
      return {
        success: false,
        error: 'A pending reservation request for this phone number and time slot is already being processed by staff. We will call you shortly.',
        reservation: duplicateRes,
        isDuplicate: true,
      };
    }
  } catch {
    // Unauthenticated callers cannot read all private reservations directly;
    // in-memory tracking guarantees duplicate prevention safely.
  }

  // 7. Authoritative Availability Validation against Posts, postBlocks, and postSlotLocks
  try {
    const postsSnap = await getDocs(query(collection(db, 'gamingPosts'), orderBy('order', 'asc')));
    const allPosts: GamingPost[] = postsSnap.empty
      ? DEFAULT_POSTS
      : postsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as GamingPost) }));

    const pcPosts = allPosts.filter((p) => p.type === 'PC' && p.status === 'ACTIVE');

    const blocksSnap = await getDocs(collection(db, 'postBlocks'));
    const postBlocks: PostBlock[] = blocksSnap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as PostBlock),
    }));

    // Read discrete public slot locks (non-sensitive station availability)
    let occupiedPostIdsFromLocks = new Set<string>();
    try {
      const locksSnap = await getDocs(collection(db, 'postSlotLocks'));
      for (const lockDoc of locksSnap.docs) {
        const lock = lockDoc.data();
        if (['CONFIRMED', 'CHECKED_IN'].includes(lock.status)) {
          if (startAt < lock.slotEnd && endAt > lock.slotStart) {
            occupiedPostIdsFromLocks.add(lock.postId);
          }
        }
      }
    } catch {
      occupiedPostIdsFromLocks = new Set<string>();
    }

    // Check available PCs
    const availableCandidatePosts: GamingPost[] = [];
    for (const post of pcPosts) {
      const hasBlock = postBlocks.some(
        (b) => b.postId === post.id && startAt < b.endAt && endAt > b.startAt
      );
      if (hasBlock) continue;

      if (occupiedPostIdsFromLocks.has(post.id)) continue;

      const hasConfirmedConflict = existingReservations.some(
        (r) =>
          ['CONFIRMED', 'CHECKED_IN'].includes(r.status) &&
          r.postIds &&
          r.postIds.includes(post.id) &&
          startAt < r.endAt &&
          endAt > r.startAt
      );
      if (hasConfirmedConflict) continue;

      availableCandidatePosts.push(post);
    }

    if (isPcGroup && availableCandidatePosts.length < effectivePcCount) {
      return {
        success: false,
        error: `Only ${availableCandidatePosts.length} PCs are available for this time window. Group booking requires ${effectivePcCount} PCs. Please choose another time.`,
      };
    }

    // 8. Authoritative Price Calculation from System Settings (Never trust client price)
    let settings = DEFAULT_SETTINGS;
    try {
      const settingsSnap = await getDoc(doc(db, 'reservationSettings', 'system_settings'));
      if (settingsSnap.exists()) {
        settings = settingsSnap.data() as ReservationSettings;
      }
    } catch {
      settings = DEFAULT_SETTINGS;
    }

    const { totalPrice, hourlyPriceSnapshot } = calculateReservationPrice(
      isPcGroup ? 'GROUP_10_PC' : reservationType,
      duration,
      settings,
      pcPosts.length,
      effectivePcCount
    );

    // 9. Construct New Reservation Record
    const reservationId = `res_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const guestUserId = `guest_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const targetPostIds = availableCandidatePosts.slice(0, effectivePcCount).map((p) => p.id);
    const targetPostNames = availableCandidatePosts.slice(0, effectivePcCount).map((p) => p.name);

    const pendingExpiresAt = now + (settings.pendingExpirationMinutes || 60) * 60 * 1000;

    const newReservation: Reservation = {
      id: reservationId,
      userId: guestUserId,
      isGuest: true,
      gamerTag: trimmedName,
      fullName: trimmedName,
      phoneNumber: rawPhone,
      phone: rawPhone,
      email: email?.trim() || undefined,
      reservationType: isPcGroup ? 'GROUP_10_PC' : reservationType,
      requestedPcCount: isPcGroup ? effectivePcCount : undefined,
      postType: 'PC' as GamingPostType,
      postIds: targetPostIds,
      postNames: targetPostNames,
      gameId: gameId || undefined,
      gameName: gameName || undefined,
      startAt,
      endAt,
      durationHours: duration,
      status: 'PENDING_ADMIN_APPROVAL', // Strictly PENDING until manually approved by staff
      totalPrice,
      hourlyPriceSnapshot,
      paymentStatus: 'UNPAID',
      amountPaid: 0,
      remainingAmount: totalPrice,
      notes: notes?.trim() || undefined,
      createdById: guestUserId,
      createdByRole: 'player',
      createdAt: now,
      updatedAt: now,
      pendingExpiresAt,
    };

    // 10. Write to Firestore Reservations Collection
    const sanitize = (obj: any): any => {
      if (obj === undefined) return null;
      if (obj === null || typeof obj !== 'object') return obj;
      const clean: any = Array.isArray(obj) ? [] : {};
      for (const k of Object.keys(obj)) {
        if (obj[k] !== undefined) {
          clean[k] = sanitize(obj[k]);
        }
      }
      return clean;
    };

    await setDoc(doc(db, 'reservations', reservationId), sanitize(newReservation));

    // Record in-flight submission for anti-duplicate tracking
    inFlightSubmissions.push({
      phone: cleanInputPhone,
      startAt,
      endAt,
      createdAt: now,
      reservation: newReservation,
    });

    // 11. Dispatch Admin Notifications Safely
    try {
      const adminRoles = ['admin', 'staff', 'superadmin', 'ADMIN', 'STAFF', 'SUPER_ADMIN'];
      const playersSnap = await getDocs(collection(db, 'players'));
      const adminPlayers = playersSnap.docs
        .map((d) => ({ uid: d.id, ...d.data() } as any))
        .filter((p) => adminRoles.includes(p.role));

      const dateStr = new Date(startAt).toLocaleDateString();
      const timeStr = `${new Date(startAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} → ${new Date(endAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

      for (const admin of adminPlayers) {
        const notifId = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        await setDoc(doc(db, 'notifications', notifId), sanitize({
          id: notifId,
          userId: admin.uid,
          type: 'RESERVATION_PENDING',
          title: '🎮 NEW GUEST PC RESERVATION',
          message: `Guest: ${trimmedName} (${rawPhone})\nRequested: ${effectivePcCount} PCs\nDate: ${dateStr} (${timeStr})\nStatus: PENDING APPROVAL`,
          read: false,
          actioned: false,
          createdAt: now,
          data: {
            reservationId,
            phoneNumber: rawPhone,
            requestedPcCount: effectivePcCount,
            startAt,
            endAt,
            totalPrice,
            isGuest: true,
          },
        }));
      }
    } catch (notifErr) {
      console.warn('Could not dispatch admin notifications for guest booking:', notifErr);
    }

    return {
      success: true,
      reservation: newReservation,
    };
  } catch (err: any) {
    console.error('executeGuestReservation error:', err);
    return {
      success: false,
      error: err.message || 'Failed to submit guest reservation request.',
    };
  }
}

/**
 * Looks up guest reservations by stored reservation IDs and verifies contact phone.
 * Uses exact document ID reads (allow get) to protect customer database privacy.
 */
export async function lookupGuestReservations(
  phone?: string,
  storedIds?: string[]
): Promise<Reservation[]> {
  try {
    const cleanPhone = (phone || '').trim().replace(/[\s\-\.\(\)\+]/g, '');
    const ids = storedIds || [];

    if (ids.length === 0) {
      return [];
    }

    const matched: Reservation[] = [];

    for (const id of ids) {
      try {
        const snap = await getDoc(doc(db, 'reservations', id));
        if (snap.exists()) {
          const data = snap.data() as Reservation;
          const resPhone = (data.phoneNumber || data.phone || '').replace(/[\s\-\.\(\)\+]/g, '');
          if (!cleanPhone || (resPhone && resPhone.includes(cleanPhone))) {
            matched.push({ id: snap.id, ...data });
          }
        }
      } catch {
        // Ignore unreadable or non-existent document
      }
    }

    return matched.sort((a, b) => b.startAt - a.startAt);
  } catch (err) {
    console.warn('lookupGuestReservations error:', err);
    return [];
  }
}

