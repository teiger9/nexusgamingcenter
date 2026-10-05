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
  runTransaction,
  writeBatch,
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import {
  GamingPost,
  GamingPostType,
  GamingPostStatus,
  PostBlock,
  Reservation,
  ReservationSettings,
  ReservationType,
  ReservationStatus,
  PaymentStatus,
  PaymentMethod,
  Player,
} from '../types';
import { sendNotification, sendBulkNotification, updateReservationNotificationsActioned } from './notificationService';
import { logAuditEvent } from './auditService';
import { isStaffUser, isAdminUser, normalizeUserRole } from './roleService';

/**
 * Authoritatively verifies backend staff authorization.
 * Identifies caller using authenticated Firebase UID (auth.currentUser.uid).
 * Retrieves authoritative role from Firestore /players/{uid}.
 * Reuses canonical normalizeUserRole and isStaffUser from roleService.
 * Returns the verified Player profile.
 */
export async function assertAuthorizedStaff(providedPlayer?: Player | null): Promise<Player> {
  const currentUser = auth.currentUser;
  const authUid = currentUser?.uid || providedPlayer?.uid;
  if (!authUid) {
    throw new Error('Unauthorized access: Staff credentials required.');
  }

  // Load authoritative player profile by UID directly from Firestore
  const playerSnap = await getDoc(doc(db, 'players', authUid));
  if (!playerSnap.exists()) {
    throw new Error('Unauthorized access: Staff credentials required.');
  }

  const playerData = { ...playerSnap.data(), uid: playerSnap.id } as Player;
  const canonicalRole = normalizeUserRole(playerData.role);

  if (!isStaffUser(playerData.email, canonicalRole, authUid)) {
    throw new Error('Unauthorized access: Staff credentials required.');
  }

  return playerData;
}

/**
 * Authoritatively verifies backend admin authorization.
 */
export async function assertAuthorizedAdmin(providedPlayer?: Player | null): Promise<Player> {
  const currentUser = auth.currentUser;
  const authUid = currentUser?.uid || providedPlayer?.uid;
  if (!authUid) {
    throw new Error('Unauthorized access: Administrator credentials required.');
  }

  const playerSnap = await getDoc(doc(db, 'players', authUid));
  if (!playerSnap.exists()) {
    throw new Error('Unauthorized access: Administrator credentials required.');
  }

  const playerData = { ...playerSnap.data(), uid: playerSnap.id } as Player;
  const canonicalRole = normalizeUserRole(playerData.role);

  if (!isAdminUser(playerData.email, canonicalRole, authUid)) {
    throw new Error('Unauthorized access: Administrator credentials required.');
  }

  return playerData;
}

// Default 10 PC Posts and 4 PS5 Posts
export const DEFAULT_POSTS: GamingPost[] = [
  { id: 'pc_1', name: 'PC 1', type: 'PC', status: 'ACTIVE', order: 1, specs: 'RTX 4080 • Core i7 • 240Hz 1440p • Mechanical RGB', createdAt: Date.now(), updatedAt: Date.now() },
  { id: 'pc_2', name: 'PC 2', type: 'PC', status: 'ACTIVE', order: 2, specs: 'RTX 4080 • Core i7 • 240Hz 1440p • Mechanical RGB', createdAt: Date.now(), updatedAt: Date.now() },
  { id: 'pc_3', name: 'PC 3', type: 'PC', status: 'ACTIVE', order: 3, specs: 'RTX 4080 • Core i7 • 240Hz 1440p • Mechanical RGB', createdAt: Date.now(), updatedAt: Date.now() },
  { id: 'pc_4', name: 'PC 4', type: 'PC', status: 'ACTIVE', order: 4, specs: 'RTX 4080 • Core i7 • 240Hz 1440p • Mechanical RGB', createdAt: Date.now(), updatedAt: Date.now() },
  { id: 'pc_5', name: 'PC 5', type: 'PC', status: 'ACTIVE', order: 5, specs: 'RTX 4080 • Core i7 • 240Hz 1440p • Mechanical RGB', createdAt: Date.now(), updatedAt: Date.now() },
  { id: 'pc_6', name: 'PC 6', type: 'PC', status: 'ACTIVE', order: 6, specs: 'RTX 4080 • Core i7 • 240Hz 1440p • Mechanical RGB', createdAt: Date.now(), updatedAt: Date.now() },
  { id: 'pc_7', name: 'PC 7', type: 'PC', status: 'ACTIVE', order: 7, specs: 'RTX 4080 • Core i7 • 240Hz 1440p • Mechanical RGB', createdAt: Date.now(), updatedAt: Date.now() },
  { id: 'pc_8', name: 'PC 8', type: 'PC', status: 'ACTIVE', order: 8, specs: 'RTX 4080 • Core i7 • 240Hz 1440p • Mechanical RGB', createdAt: Date.now(), updatedAt: Date.now() },
  { id: 'pc_9', name: 'PC 9', type: 'PC', status: 'ACTIVE', order: 9, specs: 'RTX 4080 • Core i7 • 240Hz 1440p • Mechanical RGB', createdAt: Date.now(), updatedAt: Date.now() },
  { id: 'pc_10', name: 'PC 10', type: 'PC', status: 'ACTIVE', order: 10, specs: 'RTX 4080 • Core i7 • 240Hz 1440p • Mechanical RGB', createdAt: Date.now(), updatedAt: Date.now() },
  { id: 'ps5_1', name: 'PS5 1', type: 'PS5', status: 'ACTIVE', order: 11, specs: 'PS5 Pro • 4K 120Hz OLED • DualSense Edge', createdAt: Date.now(), updatedAt: Date.now() },
  { id: 'ps5_2', name: 'PS5 2', type: 'PS5', status: 'ACTIVE', order: 12, specs: 'PS5 Pro • 4K 120Hz OLED • DualSense Edge', createdAt: Date.now(), updatedAt: Date.now() },
  { id: 'ps5_3', name: 'PS5 3', type: 'PS5', status: 'ACTIVE', order: 13, specs: 'PS5 Pro • 4K 120Hz OLED • DualSense Edge', createdAt: Date.now(), updatedAt: Date.now() },
  { id: 'ps5_4', name: 'PS5 4', type: 'PS5', status: 'ACTIVE', order: 14, specs: 'PS5 Pro • 4K 120Hz OLED • DualSense Edge', createdAt: Date.now(), updatedAt: Date.now() },
];

export const DEFAULT_SETTINGS: ReservationSettings = {
  id: 'system_settings',
  pcHourlyPrice: 150, // 150 DA / hr
  ps5HourlyPrice: 400, // 400 DA / hr
  group10PcHourlyPrice: 1500, // 10 * 150 DA = 1500 DA / hr
  groupDiscountPercent: 0,
  autoConfirm: false, // Default: FALSE (manual phone confirmation required by admin)
  minDurationHours: 1,
  maxDurationHours: 8,
  timeIntervalMinutes: 60,
  pendingExpirationMinutes: 60, // Pending requests expire if unconfirmed for 60 min
  cancellationDeadlineHours: 2,
  cancellationFeePercent: 0,
  openingHours: {
    monday: { open: '10:00', close: '00:00', isOpen: true },
    tuesday: { open: '10:00', close: '00:00', isOpen: true },
    wednesday: { open: '10:00', close: '00:00', isOpen: true },
    thursday: { open: '10:00', close: '00:00', isOpen: true },
    friday: { open: '10:00', close: '00:00', isOpen: true },
    saturday: { open: '10:00', close: '00:00', isOpen: true },
    sunday: { open: '10:00', close: '00:00', isOpen: true },
  },
  allowedPaymentMethods: ['CASH', 'CARD', 'ONLINE_PAYMENT', 'OTHER'],
  remindersEnabled: true,
  reminderHours: [24, 2],
  updatedAt: Date.now(),
};

/**
 * Phone number validation helper:
 * Normalizes input and verifies minimum 8-15 valid digits
 */
export function isValidPhoneNumber(phone: string): boolean {
  if (!phone || typeof phone !== 'string') return false;
  const cleaned = phone.replace(/[\s\-\.\(\)\+]/g, '');
  return /^[0-9]{8,15}$/.test(cleaned);
}

/**
 * Sanitize firestore document payload to strip undefined fields
 */
function sanitize(obj: any): any {
  if (obj === undefined) return null;
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitize);

  const clean: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      clean[key] = sanitize(value);
    }
  }
  return clean;
}

// ==========================================
// 1. SETTINGS SERVICES
// ==========================================

export async function getReservationSettings(): Promise<ReservationSettings> {
  try {
    const docRef = doc(db, 'reservationSettings', 'system_settings');
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return snap.data() as ReservationSettings;
    }
    // Seed default settings
    await setDoc(docRef, sanitize(DEFAULT_SETTINGS));
    return DEFAULT_SETTINGS;
  } catch (err) {
    console.error('Error fetching reservation settings:', err);
    return DEFAULT_SETTINGS;
  }
}

export function subscribeToReservationSettings(callback: (settings: ReservationSettings) => void) {
  const docRef = doc(db, 'reservationSettings', 'system_settings');
  return onSnapshot(
    docRef,
    async (snap) => {
      if (snap.exists()) {
        callback(snap.data() as ReservationSettings);
      } else {
        try {
          await setDoc(docRef, sanitize(DEFAULT_SETTINGS));
          callback(DEFAULT_SETTINGS);
        } catch (e) {
          callback(DEFAULT_SETTINGS);
        }
      }
    },
    (err) => {
      console.error('Error subscribing to reservation settings:', err);
      callback(DEFAULT_SETTINGS);
    }
  );
}

export async function updateReservationSettings(
  newSettings: Partial<ReservationSettings>,
  adminPlayer: Player
): Promise<void> {
  const verifiedAdmin = await assertAuthorizedAdmin(adminPlayer);
  const docRef = doc(db, 'reservationSettings', 'system_settings');
  const payload = {
    ...newSettings,
    updatedAt: Date.now(),
    updatedBy: verifiedAdmin.gamerTag || adminPlayer.gamerTag,
  };
  await updateDoc(docRef, sanitize(payload));

  await logAuditEvent({
    action: 'UPDATE_RESERVATION_SETTINGS',
    actorId: verifiedAdmin.uid,
    actorName: verifiedAdmin.gamerTag,
    targetType: 'system',
    targetId: 'reservation_settings',
    details: `Updated reservation settings (PC: ${newSettings.pcHourlyPrice ?? 'unchanged'} DA, PS5: ${newSettings.ps5HourlyPrice ?? 'unchanged'} DA, AutoConfirm: ${newSettings.autoConfirm ?? 'unchanged'})`,
  });
}

// ==========================================
// 2. GAMING POSTS SERVICES
// ==========================================

export async function getGamingPosts(): Promise<GamingPost[]> {
  try {
    const snap = await getDocs(query(collection(db, 'gamingPosts'), orderBy('order', 'asc')));
    if (!snap.empty) {
      return snap.docs.map((d) => d.data() as GamingPost);
    }
    // Seed default posts if empty
    const batch = writeBatch(db);
    for (const post of DEFAULT_POSTS) {
      batch.set(doc(db, 'gamingPosts', post.id), sanitize(post));
    }
    await batch.commit();
    return DEFAULT_POSTS;
  } catch (err) {
    console.error('Error fetching gaming posts:', err);
    return DEFAULT_POSTS;
  }
}

export function subscribeToGamingPosts(callback: (posts: GamingPost[]) => void) {
  const q = query(collection(db, 'gamingPosts'), orderBy('order', 'asc'));
  return onSnapshot(
    q,
    async (snap) => {
      if (!snap.empty) {
        callback(snap.docs.map((d) => d.data() as GamingPost));
      } else {
        // Seed default posts
        try {
          const batch = writeBatch(db);
          for (const post of DEFAULT_POSTS) {
            batch.set(doc(db, 'gamingPosts', post.id), sanitize(post));
          }
          await batch.commit();
          callback(DEFAULT_POSTS);
        } catch (e) {
          callback(DEFAULT_POSTS);
        }
      }
    },
    (err) => {
      console.error('Error subscribing to gaming posts:', err);
      callback(DEFAULT_POSTS);
    }
  );
}

export async function addGamingPost(
  postData: Omit<GamingPost, 'id' | 'createdAt' | 'updatedAt'>,
  adminPlayer: Player
): Promise<string> {
  const verifiedAdmin = await assertAuthorizedAdmin(adminPlayer);
  const id = `${postData.type.toLowerCase()}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const now = Date.now();
  const newPost: GamingPost = {
    ...postData,
    id,
    createdAt: now,
    updatedAt: now,
  };

  await setDoc(doc(db, 'gamingPosts', id), sanitize(newPost));

  await logAuditEvent({
    action: 'ADD_GAMING_POST',
    actorId: verifiedAdmin.uid,
    actorName: verifiedAdmin.gamerTag,
    targetType: 'post',
    targetId: id,
    details: `Added new ${postData.type} post "${postData.name}"`,
  });

  return id;
}

export async function updateGamingPost(
  postId: string,
  updates: Partial<GamingPost>,
  adminPlayer: Player
): Promise<void> {
  const verifiedStaff = await assertAuthorizedStaff(adminPlayer);
  const docRef = doc(db, 'gamingPosts', postId);
  const payload = {
    ...updates,
    updatedAt: Date.now(),
  };
  await updateDoc(docRef, sanitize(payload));

  await logAuditEvent({
    action: 'UPDATE_GAMING_POST',
    actorId: verifiedStaff.uid,
    actorName: verifiedStaff.gamerTag,
    targetType: 'post',
    targetId: postId,
    details: `Updated gaming post "${updates.name || postId}" (Status: ${updates.status || 'unchanged'})`,
  });
}

export async function deleteGamingPost(postId: string, adminPlayer: Player): Promise<void> {
  const verifiedAdmin = await assertAuthorizedAdmin(adminPlayer);
  await deleteDoc(doc(db, 'gamingPosts', postId));

  await logAuditEvent({
    action: 'DELETE_GAMING_POST',
    actorId: verifiedAdmin.uid,
    actorName: verifiedAdmin.gamerTag,
    targetType: 'post',
    targetId: postId,
    details: `Deleted gaming post "${postId}"`,
  });
}

// ==========================================
// 3. POST BLOCKS & MAINTENANCE SERVICES
// ==========================================

export function subscribeToPostBlocks(callback: (blocks: PostBlock[]) => void) {
  const q = query(collection(db, 'postBlocks'), orderBy('startAt', 'asc'));
  return onSnapshot(
    q,
    (snap) => {
      callback(snap.docs.map((d) => d.data() as PostBlock));
    },
    (err) => {
      console.error('Error subscribing to post blocks:', err);
      callback([]);
    }
  );
}

export async function addPostBlock(
  blockData: Omit<PostBlock, 'id' | 'createdAt'>,
  adminPlayer: Player
): Promise<string> {
  const verifiedStaff = await assertAuthorizedStaff(adminPlayer);
  const id = `block_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const newBlock: PostBlock = {
    ...blockData,
    id,
    createdAt: Date.now(),
  };

  await setDoc(doc(db, 'postBlocks', id), sanitize(newBlock));

  await logAuditEvent({
    action: 'ADD_POST_BLOCK',
    actorId: verifiedStaff.uid,
    actorName: verifiedStaff.gamerTag,
    targetType: 'post',
    targetId: blockData.postId,
    details: `Blocked post "${blockData.postName}" from ${new Date(blockData.startAt).toLocaleString()} to ${new Date(blockData.endAt).toLocaleString()} (Reason: ${blockData.reason})`,
  });

  return id;
}

export async function deletePostBlock(blockId: string, adminPlayer: Player): Promise<void> {
  const verifiedStaff = await assertAuthorizedStaff(adminPlayer);
  await deleteDoc(doc(db, 'postBlocks', blockId));

  await logAuditEvent({
    action: 'DELETE_POST_BLOCK',
    actorId: verifiedStaff.uid,
    actorName: verifiedStaff.gamerTag,
    targetType: 'post',
    targetId: blockId,
    details: `Removed post block/maintenance for ID "${blockId}"`,
  });
}

// ==========================================
// 4. PRICING & CONFLICT CALCULATION HELPERS
// ==========================================

export function calculateReservationPrice(
  reservationType: ReservationType,
  durationHours: number,
  settings: ReservationSettings,
  activePcCount: number = 10,
  pcCount?: number
): { totalPrice: number; hourlyPriceSnapshot: number } {
  if (durationHours <= 0) return { totalPrice: 0, hourlyPriceSnapshot: 0 };

  if (reservationType === 'PC') {
    const hourly = settings.pcHourlyPrice || 150;
    const count = pcCount || 1;
    const effectiveHourly = hourly * count;
    return {
      hourlyPriceSnapshot: effectiveHourly,
      totalPrice: Math.round(durationHours * effectiveHourly),
    };
  } else if (reservationType === 'PS5') {
    const hourly = settings.ps5HourlyPrice || 400;
    return {
      hourlyPriceSnapshot: hourly,
      totalPrice: Math.round(durationHours * hourly),
    };
  } else if (reservationType === 'GROUP_10_PC') {
    const count = pcCount || 10;
    const unitHourly = settings.pcHourlyPrice || 150;
    const hourly = count === 10 && settings.group10PcHourlyPrice
      ? settings.group10PcHourlyPrice
      : unitHourly * count;
    const discount = settings.groupDiscountPercent || 0;
    const discountedHourly = hourly * (1 - discount / 100);
    return {
      hourlyPriceSnapshot: Math.round(discountedHourly),
      totalPrice: Math.round(durationHours * discountedHourly),
    };
  }

  return { totalPrice: 0, hourlyPriceSnapshot: 0 };
}

/**
 * Authoritative PC Availability Calculation:
 * availablePCCount = totalActivePCs - overlappingConfirmedPCReservations
 * PS5 posts are strictly excluded. Maintenance and confirmed PC bookings are subtracted.
 */
export function getAvailablePcCount(
  startAt: number,
  endAt: number,
  allPosts: GamingPost[],
  existingReservations: Reservation[],
  postBlocks: PostBlock[],
  excludeReservationId?: string
): {
  availableCount: number;
  totalActivePCs: number;
  occupiedPcIds: string[];
  availablePosts: GamingPost[];
} {
  // 1. Only active PC posts (PS5 strictly excluded)
  const activePcPosts = allPosts.filter((p) => p.type === 'PC' && p.status === 'ACTIVE');

  // 2. Identify maintenance blocks overlapping this window
  const maintenancePcIds = new Set<string>();
  for (const block of postBlocks) {
    if (startAt < block.endAt && endAt > block.startAt) {
      maintenancePcIds.add(block.postId);
    }
  }

  // 3. Identify PCs occupied by CONFIRMED or CHECKED_IN reservations overlapping this window
  const occupiedByConfirmedPcIds = new Set<string>();
  for (const res of existingReservations) {
    if (excludeReservationId && res.id === excludeReservationId) continue;
    if (!['CONFIRMED', 'CHECKED_IN'].includes(res.status)) continue;

    const isOverlapping = startAt < res.endAt && endAt > res.startAt;
    if (isOverlapping) {
      if (res.postIds && res.postIds.length > 0) {
        for (const pid of res.postIds) {
          const post = allPosts.find((p) => p.id === pid);
          if (!post || post.type === 'PC') {
            occupiedByConfirmedPcIds.add(pid);
          }
        }
      }
    }
  }

  const unavailablePcIds = new Set<string>([...maintenancePcIds, ...occupiedByConfirmedPcIds]);
  const availablePosts = activePcPosts.filter((p) => !unavailablePcIds.has(p.id));

  return {
    availableCount: availablePosts.length,
    totalActivePCs: activePcPosts.length,
    occupiedPcIds: Array.from(unavailablePcIds),
    availablePosts,
  };
}

/**
 * Mathematical overlap verification:
 * Conflicting if: newStart < existingEnd AND newEnd > existingStart
 */
export function checkReservationConflict(
  startAt: number,
  endAt: number,
  postIds: string[],
  existingReservations: Reservation[],
  postBlocks: PostBlock[],
  excludeReservationId?: string,
  includePending: boolean = false
): { hasConflict: boolean; conflictReason?: string } {
  const activeStatuses: ReservationStatus[] = includePending
    ? ['PENDING', 'CONFIRMED', 'CHECKED_IN']
    : ['CONFIRMED', 'CHECKED_IN'];

  // Check against existing reservations
  for (const res of existingReservations) {
    if (
      excludeReservationId &&
      (res.id === excludeReservationId || String(res.id) === String(excludeReservationId))
    ) {
      continue;
    }
    if (!activeStatuses.includes(res.status)) continue;

    // Check time overlap
    const isOverlapping = startAt < res.endAt && endAt > res.startAt;
    if (isOverlapping) {
      // Check if any post matches
      const intersectingPostId = postIds.find((id) => res.postIds && res.postIds.includes(id));
      if (intersectingPostId) {
        const postNameIndex = res.postIds.indexOf(intersectingPostId);
        const postName = res.postNames?.[postNameIndex] || intersectingPostId.toUpperCase();
        const startStr = new Date(res.startAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const endStr = new Date(res.endAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        if (res.reservationType === 'GROUP_10_PC') {
          return {
            hasConflict: true,
            conflictReason: `A 10-PC Group Reservation (${startStr} - ${endStr}) is already blocking all PCs during this time.`,
          };
        }

        return {
          hasConflict: true,
          conflictReason: `${postName} is already reserved from ${startStr} to ${endStr}.`,
        };
      }
    }
  }

  // Check against maintenance blocks
  for (const block of postBlocks) {
    const isOverlapping = startAt < block.endAt && endAt > block.startAt;
    if (isOverlapping && postIds.includes(block.postId)) {
      const startStr = new Date(block.startAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const endStr = new Date(block.endAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return {
        hasConflict: true,
        conflictReason: `${block.postName} is in scheduled maintenance (${block.reason}) from ${startStr} to ${endStr}.`,
      };
    }
  }

  return { hasConflict: false };
}

// ==========================================
// 4B. DETERMINISTIC SLOT LOCK INFRASTRUCTURE
// ==========================================

export const SLOT_GRANULARITY_MS = 30 * 60 * 1000; // Canonical 30-minute slot window

/**
 * Computes all canonical discrete slot lock keys for a resource across a time interval [startAt, endAt).
 * A slot [t, t + SLOT_GRANULARITY_MS) is included if and only if t < endAt && t + SLOT_GRANULARITY_MS > startAt.
 * This guarantees that ANY two overlapping intervals will intersect on at least one deterministic slot key.
 * Adjacent intervals (e.g. 14:00-16:00 and 16:00-18:00) share zero slot keys.
 */
export function getSlotLockKeysForPost(postId: string, startAt: number, endAt: number): string[] {
  const keys: string[] = [];
  const firstSlotStart = Math.floor(startAt / SLOT_GRANULARITY_MS) * SLOT_GRANULARITY_MS;
  for (let t = firstSlotStart; t < endAt; t += SLOT_GRANULARITY_MS) {
    if (t + SLOT_GRANULARITY_MS > startAt) {
      keys.push(`${postId}_${t}`);
    }
  }
  return keys;
}

export function getAllSlotLockKeys(postIds: string[], startAt: number, endAt: number): string[] {
  const allKeys: string[] = [];
  for (const postId of postIds) {
    allKeys.push(...getSlotLockKeysForPost(postId, startAt, endAt));
  }
  return allKeys;
}

/**
 * Atomically releases all postSlotLocks associated with a reservation.
 */
export async function releaseSlotLocksForReservation(res: {
  id?: string;
  postIds?: string[];
  startAt?: number;
  endAt?: number;
}): Promise<void> {
  if (!res.postIds || res.postIds.length === 0 || !res.startAt || !res.endAt) return;
  try {
    const slotKeys = getAllSlotLockKeys(res.postIds, res.startAt, res.endAt);
    const batch = writeBatch(db);
    for (const key of slotKeys) {
      batch.delete(doc(db, 'postSlotLocks', key));
    }
    await batch.commit();
  } catch (err) {
    console.warn('Could not release postSlotLocks for reservation:', res.id, err);
  }
}

// ==========================================
// 5. RESERVATION SUBSCRIPTIONS & ATOMIC BOOKING
// ==========================================

export function subscribeToReservations(callback: (reservations: Reservation[]) => void) {
  const q = query(collection(db, 'reservations'), orderBy('startAt', 'asc'));
  return onSnapshot(
    q,
    (snap) => {
      callback(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Reservation) })));
    },
    (err) => {
      console.error('Error subscribing to reservations:', err);
      callback([]);
    }
  );
}

export function subscribeToPlayerReservations(
  userId: string,
  callback: (reservations: Reservation[]) => void
) {
  if (!userId) {
    callback([]);
    return () => {};
  }
  const q = query(
    collection(db, 'reservations'),
    where('userId', '==', userId),
    orderBy('startAt', 'desc')
  );
  return onSnapshot(
    q,
    (snap) => {
      callback(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Reservation) })));
    },
    (err) => {
      console.error('Error subscribing to player reservations:', err);
      callback([]);
    }
  );
}

export interface CreateReservationParams {
  userId?: string;
  isGuest?: boolean;
  requestedPcCount?: number; // 8, 9, or 10 for PC group reservations
  gamerTag: string;
  fullName?: string;
  phoneNumber: string; // Mandatory contact phone number
  phone?: string;
  email?: string;
  reservationType: ReservationType;
  selectedPostId?: string; // For single PC or PS5
  gameId?: string;
  gameName?: string;
  startAt: number; // ms timestamp
  durationHours: number;
  notes?: string;
  linkedMatchId?: string;
  isAdminBooking?: boolean;
}

/**
 * Atomic Reservation Creation with Transaction:
 * - Validates future time (no reservations in the past)
 * - Validates required phone number snapshot
 * - Checks equipment active status & maintenance blocks
 * - Sets initial status to PENDING_ADMIN_APPROVAL (unless admin staff internal booking)
 * - Dispatches notifications to staff and user
 */
export async function createReservationAtomic(
  params: CreateReservationParams
): Promise<Reservation> {
  const {
    userId,
    isGuest,
    requestedPcCount,
    gamerTag,
    fullName,
    phoneNumber,
    phone,
    email,
    reservationType,
    selectedPostId,
    gameId,
    gameName,
    startAt,
    durationHours,
    notes,
    linkedMatchId,
    isAdminBooking = false,
  } = params;

  // 1. Phone number validation (Mandatory for all reservations)
  const rawPhone = (phoneNumber || phone || '').trim();
  if (!rawPhone || !isValidPhoneNumber(rawPhone)) {
    throw new Error('Please enter a valid phone number.');
  }

  // 2. Full name validation for guests
  const effectiveUserId = userId || `guest_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const isGuestBooking = Boolean(isGuest || !userId || userId.startsWith('guest_'));

  if (isGuestBooking && (!fullName || !fullName.trim())) {
    throw new Error('Please provide your full name for the reservation request.');
  }

  // 3. No reservations in the past validation
  const now = Date.now();
  if (startAt <= now) {
    throw new Error('This time has already passed. Please choose a future time.');
  }

  if (durationHours <= 0) {
    throw new Error('Reservation duration must be at least 1 hour.');
  }

  const endAt = startAt + durationHours * 3600 * 1000;
  if (endAt <= now) {
    throw new Error('This time has already passed. Please choose a future time.');
  }

  const reservationId = `res_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  // Pre-fetch gaming posts, maintenance blocks, and existing reservations
  const postsSnap = await getDocs(query(collection(db, 'gamingPosts'), orderBy('order', 'asc')));
  const allPosts: GamingPost[] = postsSnap.empty
    ? DEFAULT_POSTS
    : postsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as GamingPost) }));

  const pcPosts = allPosts.filter((p) => p.type === 'PC' && p.status === 'ACTIVE');

  const resSnap = await getDocs(query(collection(db, 'reservations')));
  const existingReservations: Reservation[] = resSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Reservation) }));

  const blocksSnap = await getDocs(query(collection(db, 'postBlocks')));
  const postBlocks: PostBlock[] = blocksSnap.docs.map((d) => ({ id: d.id, ...(d.data() as PostBlock) }));

  const isPcGroup = reservationType === 'GROUP_10_PC' || reservationType === 'PC' || Boolean(requestedPcCount);
  let postType: GamingPostType = reservationType === 'PS5' ? 'PS5' : 'PC';

  const result = await runTransaction(db, async (transaction) => {
    // 1. Read authoritative system settings
    const settingsRef = doc(db, 'reservationSettings', 'system_settings');
    const settingsSnap = await transaction.get(settingsRef);
    const settings: ReservationSettings = settingsSnap.exists()
      ? (settingsSnap.data() as ReservationSettings)
      : DEFAULT_SETTINGS;

    // Validate min/max duration
    if (durationHours < (settings.minDurationHours || 1)) {
      throw new Error(`Minimum reservation time is ${settings.minDurationHours || 1} hour(s).`);
    }
    if (durationHours > (settings.maxDurationHours || 8)) {
      throw new Error(`Maximum reservation time is ${settings.maxDurationHours || 8} hours.`);
    }

    let targetPostIds: string[] = [];
    let targetPostNames: string[] = [];
    let effectivePcCount: number | undefined = undefined;

    // 2. ATOMIC DETERMINISTIC SLOT-LOCK READ PHASE
    if (reservationType === 'PS5') {
      postType = 'PS5';
      if (!selectedPostId) throw new Error('Please select a specific PS5 station.');
      const post = allPosts.find((p) => p.id === selectedPostId);
      if (!post) throw new Error('Selected PS5 station was not found.');
      if (post.status !== 'ACTIVE') throw new Error(`${post.name} is currently ${post.status.toLowerCase()} and cannot be reserved.`);

      // Check maintenance blocks
      const conflict = checkReservationConflict(startAt, endAt, [post.id], existingReservations, postBlocks, undefined, false);
      if (conflict.hasConflict) {
        throw new Error(conflict.conflictReason || 'Station unavailable.');
      }

      // Read all normalized slot lock documents for this PS5 station
      const slotKeys = getSlotLockKeysForPost(post.id, startAt, endAt);
      for (const slotKey of slotKeys) {
        const slotRef = doc(db, 'postSlotLocks', slotKey);
        const slotSnap = await transaction.get(slotRef);
        if (slotSnap.exists()) {
          const lockData = slotSnap.data();
          if (lockData.status !== 'CANCELLED' && lockData.status !== 'REJECTED') {
            if (!lockData.expiresAt || lockData.expiresAt > now) {
              throw new Error('SLOT_ALREADY_BOOKED: This station has already been reserved for another player. Please choose another available post or time.');
            }
          }
        }
      }

      targetPostIds = [post.id];
      targetPostNames = [post.name];
    } else if (isPcGroup) {
      postType = 'PC';
      const targetCount = requestedPcCount || (reservationType === 'GROUP_10_PC' ? 10 : 8);

      if (!isAdminBooking && (targetCount < 8 || targetCount > 10)) {
        throw new Error('PC group reservations can only be made for 8, 9, or 10 PCs.');
      }

      effectivePcCount = targetCount;

      // Check all active PC posts transactionally against postSlotLocks and maintenance blocks
      const availableCandidatePosts: GamingPost[] = [];
      for (const post of pcPosts) {
        // Check maintenance blocks
        const hasBlock = postBlocks.some((b) => b.postId === post.id && startAt < b.endAt && endAt > b.startAt);
        if (hasBlock) continue;

        // Check legacy reservation conflict
        const hasLegacyConflict = existingReservations.some(
          (r) => ['CONFIRMED', 'CHECKED_IN'].includes(r.status) &&
                 r.postIds && r.postIds.includes(post.id) &&
                 startAt < r.endAt && endAt > r.startAt
        );
        if (hasLegacyConflict) continue;

        // Read all normalized slot lock documents for this PC
        let isSlotOccupied = false;
        const slotKeys = getSlotLockKeysForPost(post.id, startAt, endAt);
        for (const slotKey of slotKeys) {
          const slotRef = doc(db, 'postSlotLocks', slotKey);
          const slotSnap = await transaction.get(slotRef);
          if (slotSnap.exists()) {
            const lockData = slotSnap.data();
            if (lockData.status !== 'CANCELLED' && lockData.status !== 'REJECTED') {
              if (!lockData.expiresAt || lockData.expiresAt > now) {
                isSlotOccupied = true;
                break;
              }
            }
          }
        }

        if (!isSlotOccupied) {
          availableCandidatePosts.push(post);
        }
      }

      if (availableCandidatePosts.length < targetCount) {
        throw new Error(
          `SLOT_ALREADY_BOOKED: Only ${availableCandidatePosts.length} PCs are currently available for this time window. Group booking requires ${targetCount} PCs.`
        );
      }

      targetPostIds = availableCandidatePosts.slice(0, targetCount).map((p) => p.id);
      targetPostNames = availableCandidatePosts.slice(0, targetCount).map((p) => p.name);
    } else {
      // Single PC (Admin or fallback)
      postType = 'PC';
      if (!selectedPostId) throw new Error('Please select a specific PC.');
      const post = allPosts.find((p) => p.id === selectedPostId);
      if (!post) throw new Error('Selected PC was not found.');
      if (post.status !== 'ACTIVE') throw new Error(`${post.name} is currently ${post.status.toLowerCase()} and cannot be reserved.`);

      const conflict = checkReservationConflict(startAt, endAt, [post.id], existingReservations, postBlocks, undefined, false);
      if (conflict.hasConflict) {
        throw new Error(conflict.conflictReason || 'Station unavailable.');
      }

      const slotKeys = getSlotLockKeysForPost(post.id, startAt, endAt);
      for (const slotKey of slotKeys) {
        const slotRef = doc(db, 'postSlotLocks', slotKey);
        const slotSnap = await transaction.get(slotRef);
        if (slotSnap.exists()) {
          const lockData = slotSnap.data();
          if (lockData.status !== 'CANCELLED' && lockData.status !== 'REJECTED') {
            if (!lockData.expiresAt || lockData.expiresAt > now) {
              throw new Error('SLOT_ALREADY_BOOKED: This station has already been reserved for another player. Please choose another available post or time.');
            }
          }
        }
      }

      targetPostIds = [post.id];
      targetPostNames = [post.name];
    }

    // 3. Calculate authoritative price based on admin settings
    const { totalPrice, hourlyPriceSnapshot } = calculateReservationPrice(
      reservationType === 'PS5' ? 'PS5' : 'GROUP_10_PC',
      durationHours,
      settings,
      pcPosts.length,
      effectivePcCount || (reservationType === 'PS5' ? 1 : 10)
    );

    const initialStatus: ReservationStatus = isAdminBooking ? 'CONFIRMED' : 'PENDING_ADMIN_APPROVAL';
    const pendingExpirationMs = (settings.pendingExpirationMinutes || 60) * 60 * 1000;
    const pendingExpiresAt = initialStatus !== 'CONFIRMED' ? now + pendingExpirationMs : undefined;

    const newReservation: Reservation = {
      id: reservationId,
      userId: effectiveUserId,
      isGuest: isGuestBooking,
      gamerTag: gamerTag || fullName || 'Guest Customer',
      fullName: fullName || gamerTag,
      phoneNumber: rawPhone,
      phone: rawPhone,
      email,
      reservationType: isPcGroup ? 'GROUP_10_PC' : reservationType,
      requestedPcCount: effectivePcCount,
      gameId,
      gameName,
      postType,
      postIds: targetPostIds,
      postNames: targetPostNames,
      startAt,
      endAt,
      durationHours,
      status: initialStatus,
      totalPrice,
      hourlyPriceSnapshot,
      paymentStatus: 'UNPAID',
      amountPaid: 0,
      remainingAmount: totalPrice,
      notes,
      linkedMatchId,
      createdById: effectiveUserId,
      createdByRole: isAdminBooking ? 'admin' : 'player',
      createdAt: now,
      updatedAt: now,
      pendingExpiresAt,
      confirmedAt: initialStatus === 'CONFIRMED' ? now : undefined,
      confirmedBy: initialStatus === 'CONFIRMED' ? (isAdminBooking ? 'Nexus Staff' : 'Admin Manual Approval') : undefined,
    };

    // 4. ATOMIC TRANSACTIONAL WRITE PHASE
    // Write deterministic slot locks for each station and each canonical time quantum
    for (const postId of targetPostIds) {
      const firstSlotStart = Math.floor(startAt / SLOT_GRANULARITY_MS) * SLOT_GRANULARITY_MS;
      for (let t = firstSlotStart; t < endAt; t += SLOT_GRANULARITY_MS) {
        if (t + SLOT_GRANULARITY_MS > startAt) {
          const slotLockKey = `${postId}_${t}`;
          const slotLockRef = doc(db, 'postSlotLocks', slotLockKey);
          transaction.set(slotLockRef, sanitize({
            id: slotLockKey,
            postId,
            slotStart: t,
            slotEnd: t + SLOT_GRANULARITY_MS,
            reservationId,
            userId: effectiveUserId,
            gamerTag: gamerTag || fullName || 'Guest Customer',
            status: initialStatus,
            createdAt: now,
            expiresAt: pendingExpiresAt,
          }));
        }
      }
    }

    const resRef = doc(db, 'reservations', reservationId);
    transaction.set(resRef, sanitize(newReservation));

    return newReservation;
  });

  // Track guest reservation in localStorage for client retrieval
  if (isGuestBooking && typeof window !== 'undefined') {
    try {
      const storageKey = 'nexus_guest_reservations';
      const existing: string[] = JSON.parse(localStorage.getItem(storageKey) || '[]');
      if (!existing.includes(result.id)) {
        existing.unshift(result.id);
        localStorage.setItem(storageKey, JSON.stringify(existing.slice(0, 30)));
      }
    } catch (e) {
      console.warn('Could not cache guest reservation ID:', e);
    }
  }

  // Post-transaction notifications
  const dateStr = new Date(startAt).toLocaleDateString();
  const timeStr = `${new Date(startAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} → ${new Date(endAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

  const postLabel =
    result.requestedPcCount
      ? `${result.requestedPcCount} PCs Group Reservation`
      : result.reservationType === 'GROUP_10_PC'
      ? '10-PC Group Arena'
      : result.postNames.join(', ');

  if (result.status === 'CONFIRMED') {
    if (!isGuestBooking) {
      await sendNotification({
        userId: result.userId,
        type: 'RESERVATION_CONFIRMED',
        title: 'Reservation Confirmed',
        message: `Your reservation for ${postLabel} on ${dateStr} (${timeStr}) has been confirmed! Total: ${result.totalPrice} DA.`,
        data: {
          reservationId: result.id,
          postName: postLabel,
          postType: result.postType,
          startAt: result.startAt,
          endAt: result.endAt,
          totalPrice: result.totalPrice,
        },
      });
    }
  } else {
    // Notify user of pending status if authenticated
    if (!isGuestBooking) {
      await sendNotification({
        userId: result.userId,
        type: 'RESERVATION_PENDING',
        title: 'Reservation Request Submitted',
        message: `Your reservation request for ${postLabel} on ${dateStr} (${timeStr}) is pending admin approval. Nexus staff will call you at ${result.phoneNumber} shortly to confirm.`,
        data: {
          reservationId: result.id,
          postName: postLabel,
          postType: result.postType,
          startAt: result.startAt,
          endAt: result.endAt,
          totalPrice: result.totalPrice,
        },
      });
    }

    // Notify admins and staff immediately about new pending reservation request
    try {
      const requestedPcs = result.requestedPcCount || (result.reservationType === 'GROUP_10_PC' ? 10 : (result.postIds?.length || 8));
      const notifMessage = `Customer: ${result.fullName || result.gamerTag}\nPCs requested: ${requestedPcs}\nDate: ${dateStr}\nTime: ${timeStr}\nDuration: ${durationHours} hour(s)\nStatus: PENDING APPROVAL`;

      const adminRoles = ['admin', 'staff', 'superadmin', 'ADMIN', 'STAFF', 'SUPER_ADMIN', 'super_admin'];
      const adminsQuery = query(collection(db, 'players'), where('role', 'in', adminRoles));
      const adminsSnap = await getDocs(adminsQuery);

      for (const adminDoc of adminsSnap.docs) {
        await sendNotification({
          userId: adminDoc.id,
          type: 'RESERVATION_PENDING',
          title: '🎮 NEW PC RESERVATION',
          message: notifMessage,
          data: {
            reservationId: result.id,
            customerName: result.fullName || result.gamerTag,
            gamerTag: result.gamerTag,
            phoneNumber: result.phoneNumber,
            reservationType: result.reservationType,
            requestedPcCount: requestedPcs,
            postName: postLabel,
            postType: result.postType,
            startAt: result.startAt,
            endAt: result.endAt,
            durationHours: result.durationHours,
            totalPrice: result.totalPrice,
            status: 'PENDING_ADMIN_APPROVAL',
            actionState: 'UNREAD',
          },
        });
      }
    } catch (adminNotifErr) {
      console.warn('Could not dispatch admin notifications:', adminNotifErr);
    }
  }

  return result;
}

// ==========================================
// 6. CANCELLATION & ADMIN WORKFLOWS
// ==========================================

export async function cancelReservationByUser(
  reservationId: string,
  user: { uid: string; gamerTag?: string },
  reason?: string
): Promise<void> {
  const docRef = doc(db, 'reservations', reservationId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) throw new Error('Reservation not found.');

  const res = snap.data() as Reservation;
  if (res.userId !== user.uid) {
    throw new Error('You are not authorized to cancel another player’s reservation.');
  }

  if (res.status === 'CANCELLED' || res.status === 'REJECTED' || res.status === 'EXPIRED') return;
  if (res.status === 'COMPLETED' || res.status === 'CHECKED_IN') {
    throw new Error('Active or completed reservations cannot be cancelled.');
  }

  // Check cancellation deadline if confirmed
  if (res.status === 'CONFIRMED') {
    const settings = await getReservationSettings();
    const deadlineMs = (settings.cancellationDeadlineHours || 2) * 3600 * 1000;
    const now = Date.now();

    if (now > res.startAt - deadlineMs) {
      const hours = settings.cancellationDeadlineHours || 2;
      throw new Error(
        `Cancellations must be requested at least ${hours} hour(s) before the scheduled start time. Please contact Nexus staff directly.`
      );
    }
  }

  const now = Date.now();
  await updateDoc(docRef, {
    status: 'CANCELLED',
    cancelledAt: now,
    cancelledBy: user.gamerTag || user.uid,
    cancellationReason: reason || 'Cancelled by player',
    updatedAt: now,
  });

  await releaseSlotLocksForReservation(res);

  await sendNotification({
    userId: res.userId,
    type: 'RESERVATION_CANCELLED',
    title: 'Reservation Cancelled',
    message: `Your reservation request for ${res.postNames.join(', ')} on ${new Date(res.startAt).toLocaleDateString()} has been cancelled.`,
    data: { reservationId },
  });
}

export async function adminCancelReservation(
  reservationId: string,
  adminPlayer: Player,
  reason: string
): Promise<void> {
  const verifiedStaff = await assertAuthorizedStaff(adminPlayer);
  const docRef = doc(db, 'reservations', reservationId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) throw new Error('Reservation not found.');

  const res = snap.data() as Reservation;
  const now = Date.now();

  await updateDoc(docRef, sanitize({
    status: 'CANCELLED',
    cancelledAt: now,
    cancelledBy: `Staff (${verifiedStaff.gamerTag || adminPlayer.gamerTag})`,
    cancellationReason: reason || 'Cancelled by Nexus Administration',
    updatedAt: now,
  }));

  await releaseSlotLocksForReservation(res);

  // Update notification history state
  await updateReservationNotificationsActioned(reservationId, 'CANCELLED', verifiedStaff.gamerTag || adminPlayer.gamerTag);

  if (!res.isGuest && res.userId && !res.userId.startsWith('guest_')) {
    await sendNotification({
      userId: res.userId,
      type: 'RESERVATION_CANCELLED',
      title: 'Reservation Cancelled by Staff',
      message: `Your reservation for ${res.postNames.join(', ')} was cancelled by staff. Reason: ${reason || 'Operational adjustment'}`,
      data: { reservationId, cancellationReason: reason },
    });
  }

  await logAuditEvent({
    action: 'ADMIN_CANCEL_RESERVATION',
    actorId: verifiedStaff.uid,
    actorName: verifiedStaff.gamerTag,
    targetType: 'reservation',
    targetId: reservationId,
    details: `Staff cancelled reservation for ${res.gamerTag} (${res.postNames.join(', ')}) - Reason: ${reason}`,
  });
}

/**
 * Admin Accept / Confirm Reservation:
 * - Validates that the start time has not already passed
 * - Atomically prevents double-acceptance (Requirement 8)
 * - Performs fresh live availability check against Firebase (Requirement 4 & 9)
 * - Internally allocates available PC slots and marks them TAKEN (Requirement 5 & 6)
 * - Saves status = CONFIRMED, approvedBy, approvedAt, confirmedBy, confirmedAt
 * - Updates notifications to ACTIONED state (Requirement 11)
 * - Notifies customer of confirmation
 */
export async function adminConfirmReservation(
  reservationId: string,
  adminPlayer: Player,
  customAllocatedPostIds?: string[]
): Promise<void> {
  const verifiedStaff = await assertAuthorizedStaff(adminPlayer);
  const now = Date.now();

  await runTransaction(db, async (transaction) => {
    const docRef = doc(db, 'reservations', reservationId);
    const snap = await transaction.get(docRef);
    if (!snap.exists()) throw new Error('Reservation not found.');

    const res = snap.data() as Reservation;

    // Requirement 8: Prevent double acceptance
    if (res.status === 'CONFIRMED') {
      throw new Error('Reservation already confirmed.');
    }
    if (res.status === 'CANCELLED' || res.status === 'REJECTED') {
      throw new Error(`Cannot confirm a reservation with status ${res.status}.`);
    }

    // Validate that start time is not in the past
    if (res.startAt <= now) {
      throw new Error('This time has already passed. Please choose a future time.');
    }

    // FRESH AVAILABILITY CHECK AGAINST FIREBASE (Requirement 4 & 9)
    const postsSnap = await getDocs(query(collection(db, 'gamingPosts'), orderBy('order', 'asc')));
    const allPosts: GamingPost[] = postsSnap.empty
      ? DEFAULT_POSTS
      : postsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as GamingPost) }));

    const resSnap = await getDocs(query(collection(db, 'reservations')));
    const allReservations: Reservation[] = resSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Reservation) }));

    const blocksSnap = await getDocs(query(collection(db, 'postBlocks')));
    const postBlocks: PostBlock[] = blocksSnap.docs.map((d) => ({ id: d.id, ...(d.data() as PostBlock) }));

    let finalPostIds: string[] = [];
    let finalPostNames: string[] = [];

    const isPcGroup = res.postType === 'PC' || res.reservationType === 'GROUP_10_PC' || Boolean(res.requestedPcCount);

    if (isPcGroup) {
      const requestedCount = res.requestedPcCount || (res.reservationType === 'GROUP_10_PC' ? 10 : (res.postIds?.length || 8));

      // Calculate fresh real-time PC availability excluding PS5s and maintenance blocks
      const pcAvail = getAvailablePcCount(res.startAt, res.endAt, allPosts, allReservations, postBlocks, reservationId);

      // Requirement 9: Prevent overbooking - check capacity
      if (pcAvail.availableCount < requestedCount) {
        throw new Error('Not enough PCs available for this time period.');
      }

      // Requirement 6: Allocate available PC slots internally
      if (customAllocatedPostIds && customAllocatedPostIds.length === requestedCount) {
        const availSet = new Set(pcAvail.availablePosts.map((p) => p.id));
        const allCustomValid = customAllocatedPostIds.every((id) => availSet.has(id));
        if (!allCustomValid) {
          throw new Error('Some selected PCs are no longer available for this time slot.');
        }
        finalPostIds = customAllocatedPostIds;
      } else {
        // Automatically take the first available active PCs
        finalPostIds = pcAvail.availablePosts.slice(0, requestedCount).map((p) => p.id);
      }

      finalPostNames = finalPostIds.map((id) => {
        const p = allPosts.find((post) => post.id === id);
        return p ? p.name : id;
      });
    } else {
      // PS5 or individual station reservation
      finalPostIds = customAllocatedPostIds && customAllocatedPostIds.length > 0 ? customAllocatedPostIds : res.postIds;
      finalPostNames = finalPostIds.map((id) => {
        const p = allPosts.find((post) => post.id === id);
        return p ? p.name : id;
      });

      const conflict = checkReservationConflict(
        res.startAt,
        res.endAt,
        finalPostIds,
        allReservations,
        postBlocks,
        reservationId,
        false
      );

      if (conflict.hasConflict) {
        throw new Error(conflict.conflictReason || 'This station is not available for the selected period.');
      }
    }

    // Update reservation with CONFIRMED status, approval info, and allocated PCs
    transaction.update(docRef, sanitize({
      postIds: finalPostIds,
      postNames: finalPostNames,
      status: 'CONFIRMED',
      confirmedAt: now,
      confirmedBy: verifiedStaff.gamerTag || adminPlayer.gamerTag,
      approvedAt: now,
      approvedBy: verifiedStaff.gamerTag || adminPlayer.gamerTag,
      updatedAt: now,
    }));

    // Update slot lock allocations to CONFIRMED
    const oldSlotKeys = getAllSlotLockKeys(res.postIds || [], res.startAt, res.endAt);
    const newSlotKeys = getAllSlotLockKeys(finalPostIds, res.startAt, res.endAt);
    for (const oldKey of oldSlotKeys) {
      if (!newSlotKeys.includes(oldKey)) {
        transaction.delete(doc(db, 'postSlotLocks', oldKey));
      }
    }
    for (const newKey of newSlotKeys) {
      const lockRef = doc(db, 'postSlotLocks', newKey);
      transaction.set(lockRef, sanitize({
        id: newKey,
        reservationId: res.id,
        userId: res.userId,
        gamerTag: res.gamerTag,
        status: 'CONFIRMED',
        updatedAt: now,
      }), { merge: true });
    }
  });

  // Requirement 11: Transition notifications to ACTIONED state
  await updateReservationNotificationsActioned(reservationId, 'CONFIRMED', verifiedStaff.gamerTag || adminPlayer.gamerTag);

  // Fetch updated doc for notification and audit log
  const docRef = doc(db, 'reservations', reservationId);
  const snap = await getDoc(docRef);
  const res = snap.data() as Reservation;

  const dateStr = new Date(res.startAt).toLocaleDateString();
  const startStr = new Date(res.startAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const endStr = new Date(res.endAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const postLabel = res.requestedPcCount
    ? `${res.requestedPcCount} PCs Group Reservation`
    : res.postNames.join(', ');

  if (!res.isGuest && res.userId && !res.userId.startsWith('guest_')) {
    await sendNotification({
      userId: res.userId,
      type: 'RESERVATION_CONFIRMED',
      title: 'Reservation Confirmed',
      message: `Your reservation for ${postLabel} on ${dateStr} from ${startStr} to ${endStr} has been confirmed. Total: ${res.totalPrice} DA.`,
      data: {
        reservationId,
        startAt: res.startAt,
        endAt: res.endAt,
        postNames: res.postNames,
        totalPrice: res.totalPrice,
      },
    });
  }

  await logAuditEvent({
    action: 'CONFIRM_RESERVATION',
    actorId: verifiedStaff.uid,
    actorName: verifiedStaff.gamerTag,
    targetType: 'reservation',
    targetId: reservationId,
    details: `Staff confirmed reservation for ${res.fullName || res.gamerTag} (${res.postNames.join(', ')}) from ${startStr} to ${endStr}`,
  });
}

/**
 * Admin Reject Reservation:
 * - Updates status to REJECTED
 * - Records rejection reason and timestamp
 * - Updates notifications to ACTIONED
 * - Notifies user with clear rejection reason
 */
export async function adminRejectReservation(
  reservationId: string,
  adminPlayer: Player,
  reason: string
): Promise<void> {
  const verifiedStaff = await assertAuthorizedStaff(adminPlayer);
  const docRef = doc(db, 'reservations', reservationId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) throw new Error('Reservation not found.');

  const res = snap.data() as Reservation;
  const now = Date.now();

  await updateDoc(docRef, sanitize({
    status: 'REJECTED',
    rejectedAt: now,
    rejectedBy: verifiedStaff.gamerTag || adminPlayer.gamerTag,
    rejectionReason: reason || 'Declined by Nexus staff',
    updatedAt: now,
  }));

  await releaseSlotLocksForReservation(res);

  // Update notification history state
  await updateReservationNotificationsActioned(reservationId, 'REJECTED', verifiedStaff.gamerTag || adminPlayer.gamerTag);

  if (!res.isGuest && res.userId && !res.userId.startsWith('guest_')) {
    await sendNotification({
      userId: res.userId,
      type: 'RESERVATION_REJECTED',
      title: 'Reservation Request Declined',
      message: `Your reservation request for ${res.postNames.join(', ')} was declined. Reason: ${reason || 'Capacity or scheduling conflict'}`,
      data: { reservationId, rejectionReason: reason },
    });
  }

  await logAuditEvent({
    action: 'REJECT_RESERVATION',
    actorId: verifiedStaff.uid,
    actorName: verifiedStaff.gamerTag,
    targetType: 'reservation',
    targetId: reservationId,
    details: `Staff declined reservation for ${res.fullName || res.gamerTag} (${res.postNames.join(', ')}) - Reason: ${reason}`,
  });
}

/**
 * Expire stale pending requests that exceeded the expiration window or start time
 */
export async function checkAndExpirePendingReservations(reservations: Reservation[]): Promise<number> {
  const now = Date.now();
  let expiredCount = 0;

  for (const res of reservations) {
    if (res.status === 'PENDING' || res.status === 'PENDING_ADMIN_APPROVAL') {
      const isExpiredByTimer = res.pendingExpiresAt ? now > res.pendingExpiresAt : now > res.createdAt + 60 * 60 * 1000;
      const isPastStartTime = now > res.startAt;

      if (isExpiredByTimer || isPastStartTime) {
        try {
          const docRef = doc(db, 'reservations', res.id);
          await updateDoc(docRef, {
            status: 'EXPIRED',
            expiredAt: now,
            updatedAt: now,
          });

          await releaseSlotLocksForReservation(res);

          if (!res.isGuest && res.userId && !res.userId.startsWith('guest_')) {
            await sendNotification({
              userId: res.userId,
              type: 'RESERVATION_CANCELLED',
              title: 'Reservation Request Expired',
              message: `Your reservation request expired because it was not confirmed in time. Please submit a new request if needed.`,
              data: { reservationId: res.id },
            });
          }

          expiredCount++;
        } catch (err) {
          console.warn('Error expiring reservation:', res.id, err);
        }
      }
    }
  }

  return expiredCount;
}

export async function adminCheckInReservation(
  reservationId: string,
  adminPlayer: Player
): Promise<void> {
  const verifiedStaff = await assertAuthorizedStaff(adminPlayer);
  const docRef = doc(db, 'reservations', reservationId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) throw new Error('Reservation not found.');

  const res = snap.data() as Reservation;
  const now = Date.now();

  await updateDoc(docRef, {
    status: 'CHECKED_IN',
    checkedInAt: now,
    checkedInBy: verifiedStaff.gamerTag || adminPlayer.gamerTag,
    updatedAt: now,
  });

  await sendNotification({
    userId: res.userId,
    type: 'RESERVATION_CHECKED_IN',
    title: 'Checked In at Nexus Gaming Center',
    message: `You are now checked in at ${res.postNames.join(', ')}. Enjoy your session!`,
    data: { reservationId },
  });

  await logAuditEvent({
    action: 'CHECK_IN_RESERVATION',
    actorId: verifiedStaff.uid,
    actorName: verifiedStaff.gamerTag,
    targetType: 'reservation',
    targetId: reservationId,
    details: `Checked in player ${res.gamerTag} on ${res.postNames.join(', ')}`,
  });
}

export async function adminMarkNoShow(
  reservationId: string,
  adminPlayer: Player,
  reason?: string
): Promise<void> {
  const verifiedStaff = await assertAuthorizedStaff(adminPlayer);
  const docRef = doc(db, 'reservations', reservationId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) throw new Error('Reservation not found.');

  const res = snap.data() as Reservation;
  const now = Date.now();

  await updateDoc(docRef, {
    status: 'NO_SHOW',
    noShowAt: now,
    noShowMarkedBy: verifiedStaff.gamerTag || adminPlayer.gamerTag,
    noShowReason: reason || 'Player did not arrive for scheduled slot',
    updatedAt: now,
  });

  await sendNotification({
    userId: res.userId,
    type: 'RESERVATION_NO_SHOW',
    title: 'Reservation Marked as No-Show',
    message: `Your reservation for ${res.postNames.join(', ')} on ${new Date(res.startAt).toLocaleDateString()} was marked as a No-Show.`,
    data: { reservationId },
  });

  await logAuditEvent({
    action: 'MARK_NO_SHOW',
    actorId: verifiedStaff.uid,
    actorName: verifiedStaff.gamerTag,
    targetType: 'reservation',
    targetId: reservationId,
    details: `Marked player ${res.gamerTag} as No-Show for ${res.postNames.join(', ')}`,
  });
}

export async function adminCompleteReservation(
  reservationId: string,
  adminPlayer: Player
): Promise<void> {
  const verifiedStaff = await assertAuthorizedStaff(adminPlayer);
  const docRef = doc(db, 'reservations', reservationId);
  const now = Date.now();
  await updateDoc(docRef, {
    status: 'COMPLETED',
    updatedAt: now,
  });

  await logAuditEvent({
    action: 'COMPLETE_RESERVATION',
    actorId: verifiedStaff.uid,
    actorName: verifiedStaff.gamerTag,
    targetType: 'reservation',
    targetId: reservationId,
    details: `Marked reservation ${reservationId} as completed.`,
  });
}

export async function adminUpdateReservation(
  reservationId: string,
  updates: {
    startAt?: number;
    durationHours?: number;
    selectedPostIds?: string[];
    selectedPostNames?: string[];
    status?: ReservationStatus;
    overridePrice?: number;
    priceOverrideReason?: string;
    notes?: string;
    phone?: string;
    email?: string;
    fullName?: string;
  },
  adminPlayer: Player
): Promise<void> {
  const verifiedStaff = await assertAuthorizedStaff(adminPlayer);
  const docRef = doc(db, 'reservations', reservationId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) throw new Error('Reservation not found.');

  const current = { id: snap.id, ...(snap.data() as Reservation) };
  const now = Date.now();

  const newStartAt = updates.startAt ?? current.startAt;
  const newDuration = updates.durationHours ?? current.durationHours;
  const newEndAt = newStartAt + newDuration * 3600 * 1000;
  const newPostIds = updates.selectedPostIds ?? current.postIds;
  const newPostNames = updates.selectedPostNames ?? current.postNames;
  const targetStatus = updates.status ?? current.status;

  // Conflict validation: Only needed when the target status is active (CONFIRMED or CHECKED_IN)
  // and either the schedule/posts were altered or a pending reservation is being activated
  const isTargetActive = ['CONFIRMED', 'CHECKED_IN'].includes(targetStatus);
  const timeOrPostsChanged =
    newStartAt !== current.startAt ||
    newDuration !== current.durationHours ||
    JSON.stringify(newPostIds) !== JSON.stringify(current.postIds);
  const statusBecameActive = isTargetActive && !['CONFIRMED', 'CHECKED_IN'].includes(current.status);

  if (isTargetActive && (timeOrPostsChanged || statusBecameActive)) {
    const resSnap = await getDocs(query(collection(db, 'reservations')));
    const allReservations: Reservation[] = resSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Reservation) }));

    const blocksSnap = await getDocs(query(collection(db, 'postBlocks')));
    const postBlocks: PostBlock[] = blocksSnap.docs.map((d) => ({ id: d.id, ...(d.data() as PostBlock) }));

    const conflict = checkReservationConflict(
      newStartAt,
      newEndAt,
      newPostIds,
      allReservations,
      postBlocks,
      reservationId,
      false // Only check confirmed
    );

    if (conflict.hasConflict) {
      throw new Error(`Conflict detected: ${conflict.conflictReason}`);
    }
  }

  // Price calculation / override handling
  let finalPrice = current.totalPrice;
  let originalPrice = current.originalPrice || current.totalPrice;
  let priceOverrideReason = current.priceOverrideReason;
  let priceOverriddenBy = current.priceOverriddenBy;

  if (updates.overridePrice !== undefined && updates.overridePrice !== current.totalPrice) {
    originalPrice = current.totalPrice;
    finalPrice = updates.overridePrice;
    priceOverrideReason = updates.priceOverrideReason || 'Staff override';
    priceOverriddenBy = verifiedStaff.gamerTag || adminPlayer.gamerTag;
  } else if (newDuration !== current.durationHours) {
    // Recalculate based on snapshot rate
    finalPrice = Math.round(newDuration * (current.hourlyPriceSnapshot || 150));
  }

  const payload: Partial<Reservation> = {
    startAt: newStartAt,
    endAt: newEndAt,
    durationHours: newDuration,
    postIds: newPostIds,
    postNames: newPostNames,
    totalPrice: finalPrice,
    originalPrice,
    finalPrice,
    priceOverrideReason,
    priceOverriddenBy,
    remainingAmount: Math.max(0, finalPrice - (current.amountPaid || 0)),
    notes: updates.notes ?? current.notes,
    phone: updates.phone ?? current.phone,
    email: updates.email ?? current.email,
    fullName: updates.fullName ?? current.fullName,
    status: updates.status ?? current.status,
    updatedAt: now,
  };

  await updateDoc(docRef, sanitize(payload));

  if (timeOrPostsChanged || statusBecameActive) {
    await releaseSlotLocksForReservation(current);
    if (['CONFIRMED', 'CHECKED_IN', 'PENDING', 'PENDING_ADMIN_APPROVAL'].includes(payload.status || current.status)) {
      try {
        const newSlotKeys = getAllSlotLockKeys(newPostIds, newStartAt, newEndAt);
        const batch = writeBatch(db);
        for (const key of newSlotKeys) {
          batch.set(doc(db, 'postSlotLocks', key), sanitize({
            id: key,
            reservationId: current.id,
            userId: current.userId,
            gamerTag: current.gamerTag,
            status: payload.status || current.status,
            updatedAt: now,
          }), { merge: true });
        }
        await batch.commit();
      } catch (slotErr) {
        console.warn('Could not sync postSlotLocks in adminUpdateReservation:', slotErr);
      }
    }
  }

  await sendNotification({
    userId: current.userId,
    type: 'RESERVATION_MODIFIED',
    title: 'Reservation Updated by Staff',
    message: `Your reservation details for ${newPostNames.join(', ')} on ${new Date(newStartAt).toLocaleDateString()} have been updated by Nexus administration.`,
    data: {
      reservationId,
      postName: newPostNames.join(', '),
      startAt: newStartAt,
      endAt: newEndAt,
      totalPrice: finalPrice,
    },
  });

  await logAuditEvent({
    action: 'UPDATE_RESERVATION_DETAILS',
    actorId: verifiedStaff.uid,
    actorName: verifiedStaff.gamerTag,
    targetType: 'reservation',
    targetId: reservationId,
    details: `Staff modified reservation for ${current.gamerTag} (Posts: ${newPostNames.join(', ')}, Duration: ${newDuration}h, Price: ${finalPrice} DA)`,
  });
}

export async function adminUpdatePaymentStatus(
  reservationId: string,
  paymentData: {
    paymentStatus: PaymentStatus;
    amountPaid: number;
    paymentMethod?: PaymentMethod;
  },
  adminPlayer: Player
): Promise<void> {
  const verifiedStaff = await assertAuthorizedStaff(adminPlayer);
  const docRef = doc(db, 'reservations', reservationId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) throw new Error('Reservation not found.');

  const res = snap.data() as Reservation;
  const now = Date.now();
  const remaining = Math.max(0, res.totalPrice - paymentData.amountPaid);

  await updateDoc(docRef, {
    paymentStatus: paymentData.paymentStatus,
    amountPaid: paymentData.amountPaid,
    remainingAmount: remaining,
    paymentMethod: paymentData.paymentMethod || res.paymentMethod,
    updatedAt: now,
  });

  await sendNotification({
    userId: res.userId,
    type: 'RESERVATION_PAYMENT',
    title: 'Payment Status Updated',
    message: `Payment updated for reservation ${res.postNames.join(', ')}: Status ${paymentData.paymentStatus}, Paid: ${paymentData.amountPaid} DA (Remaining: ${remaining} DA).`,
    data: { reservationId, totalPrice: res.totalPrice },
  });

  await logAuditEvent({
    action: 'UPDATE_RESERVATION_PAYMENT',
    actorId: verifiedStaff.uid,
    actorName: verifiedStaff.gamerTag,
    targetType: 'reservation',
    targetId: reservationId,
    details: `Staff updated payment for reservation ${res.postNames.join(', ')} to ${paymentData.paymentStatus} (Paid: ${paymentData.amountPaid} DA)`,
  });
}

// ==========================================
// 8. STAFF OPERATIONAL ACTIONS
// ==========================================

/**
 * Start an active gaming session for a customer.
 * Allowed from CONFIRMED or CHECKED_IN.
 * Enforces transaction safety and prevents invalid transitions.
 */
export async function staffStartSession(
  reservationId: string,
  staffPlayer: Player
): Promise<void> {
  const verifiedStaff = await assertAuthorizedStaff(staffPlayer);
  const reservationRef = doc(db, 'reservations', reservationId);
  const now = Date.now();

  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(reservationRef);
    if (!snap.exists()) {
      throw new Error('Reservation not found.');
    }

    const res = snap.data() as Reservation;

    if (res.status === 'COMPLETED') {
      throw new Error('This session has already ended and cannot be restarted.');
    }
    if (res.status === 'CANCELLED') {
      throw new Error('Cannot start a cancelled reservation.');
    }
    if (res.status === 'NO_SHOW') {
      throw new Error('Cannot start a session marked as No-Show.');
    }
    if (res.status === 'ACTIVE') {
      throw new Error('This session is already currently active.');
    }
    if (res.status !== 'CONFIRMED' && res.status !== 'CHECKED_IN') {
      throw new Error(`Cannot start session from status "${res.status}".`);
    }

    const updates: Partial<Reservation> = {
      status: 'ACTIVE',
      startedAt: now,
      startedBy: verifiedStaff.gamerTag || staffPlayer.gamerTag,
      checkedInAt: res.checkedInAt || now,
      checkedInBy: res.checkedInBy || verifiedStaff.gamerTag || staffPlayer.gamerTag,
      updatedAt: now,
    };

    transaction.update(reservationRef, sanitize(updates));
  });

  const resSnap = await getDoc(reservationRef);
  if (resSnap.exists()) {
    const res = resSnap.data() as Reservation;
    if (res.userId && !res.isGuest) {
      await sendNotification({
        userId: res.userId,
        type: 'RESERVATION_CHECKED_IN',
        title: 'Gaming Session Started',
        message: `Your gaming session at ${res.postNames.join(', ')} has officially started! Enjoy your time at Nexus.`,
        data: { reservationId },
      });
    }
  }

  await logAuditEvent({
    action: 'START_GAMING_SESSION',
    actorId: verifiedStaff.uid,
    actorName: verifiedStaff.gamerTag,
    targetType: 'reservation',
    targetId: reservationId,
    details: `Staff started active session for reservation ${reservationId}`,
  });
}

/**
 * End an active gaming session.
 * Must be ACTIVE. Prevents double-ending via transaction.
 * Saves endedAt and final calculated duration.
 */
export async function staffEndSession(
  reservationId: string,
  staffPlayer: Player
): Promise<{ elapsedMinutes: number; finalPrice: number }> {
  const verifiedStaff = await assertAuthorizedStaff(staffPlayer);
  const reservationRef = doc(db, 'reservations', reservationId);
  const now = Date.now();
  let calculatedElapsedMinutes = 0;
  let finalPrice = 0;

  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(reservationRef);
    if (!snap.exists()) {
      throw new Error('Reservation not found.');
    }

    const res = snap.data() as Reservation;

    if (res.status === 'COMPLETED') {
      throw new Error('This gaming session has already been completed.');
    }
    if (res.status !== 'ACTIVE') {
      throw new Error(`Cannot end session: reservation is in status "${res.status}", not ACTIVE.`);
    }

    const sessionStart = res.startedAt || res.startAt || now;
    calculatedElapsedMinutes = Math.max(1, Math.round((now - sessionStart) / 60000));
    finalPrice = res.finalPrice || res.totalPrice;

    const updates: Partial<Reservation> = {
      status: 'COMPLETED',
      endedAt: now,
      endedBy: verifiedStaff.gamerTag || staffPlayer.gamerTag,
      elapsedMinutes: calculatedElapsedMinutes,
      updatedAt: now,
    };

    transaction.update(reservationRef, sanitize(updates));
  });

  const resSnap = await getDoc(reservationRef);
  if (resSnap.exists()) {
    const res = resSnap.data() as Reservation;
    if (res.userId && !res.isGuest) {
      await sendNotification({
        userId: res.userId,
        type: 'RESERVATION_COMPLETED',
        title: 'Gaming Session Completed',
        message: `Your gaming session at ${res.postNames.join(', ')} has ended (${calculatedElapsedMinutes} mins). Thank you for gaming at Nexus!`,
        data: { reservationId },
      });
    }
  }

  await logAuditEvent({
    action: 'END_GAMING_SESSION',
    actorId: verifiedStaff.uid,
    actorName: verifiedStaff.gamerTag,
    targetType: 'reservation',
    targetId: reservationId,
    details: `Staff ended session for reservation ${reservationId} (Duration: ${calculatedElapsedMinutes}m)`,
  });

  return { elapsedMinutes: calculatedElapsedMinutes, finalPrice };
}

/**
 * Create a Walk-In customer session.
 * Uses authoritative pricing from settings.
 * Can start immediately as ACTIVE or booked as CONFIRMED.
 */
export async function createWalkInReservation(params: {
  customerName: string;
  phone?: string;
  deviceType: GamingPostType;
  postIds: string[];
  postNames: string[];
  durationHours: number;
  startImmediately?: boolean;
  paymentMethod?: PaymentMethod;
  notes?: string;
  staffPlayer: Player;
}): Promise<string> {
  const {
    customerName,
    phone,
    deviceType,
    postIds,
    postNames,
    durationHours,
    startImmediately = true,
    paymentMethod = 'CASH',
    notes,
    staffPlayer,
  } = params;

  const verifiedStaff = await assertAuthorizedStaff(staffPlayer);

  if (!customerName || !customerName.trim()) {
    throw new Error('Customer name is required.');
  }
  if (!postIds || postIds.length === 0) {
    throw new Error('At least one station must be selected.');
  }
  if (!durationHours || durationHours <= 0) {
    throw new Error('Duration must be at least 1 hour.');
  }

  // Get authoritative settings
  const settings = await getReservationSettings();
  const unitRate = deviceType === 'PC' ? (settings.pcHourlyPrice || 150) : (settings.ps5HourlyPrice || 400);
  const totalRate = unitRate * postIds.length;
  const totalPrice = Math.round(totalRate * durationHours);

  const now = Date.now();
  const startAt = now;
  const endAt = now + durationHours * 3600 * 1000;
  const resId = `res_walkin_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

  const newRes: Reservation = {
    id: resId,
    userId: `walkin_${Date.now()}`,
    isGuest: true,
    isWalkIn: true,
    gamerTag: customerName.trim(),
    fullName: customerName.trim(),
    phoneNumber: phone?.trim() || 'WALK-IN',
    phone: phone?.trim() || 'WALK-IN',
    reservationType: deviceType === 'PC' && postIds.length === 10 ? 'GROUP_10_PC' : deviceType,
    postType: deviceType,
    postIds,
    postNames,
    startAt,
    endAt,
    durationHours,
    status: startImmediately ? 'ACTIVE' : 'CONFIRMED',
    totalPrice,
    hourlyPriceSnapshot: totalRate,
    originalPrice: totalPrice,
    finalPrice: totalPrice,
    paymentStatus: 'PAID',
    amountPaid: totalPrice,
    remainingAmount: 0,
    paymentMethod,
    notes: notes?.trim() || `Walk-in customer handled by staff ${verifiedStaff.gamerTag || staffPlayer.gamerTag}`,
    createdById: verifiedStaff.uid,
    createdByRole: 'staff',
    createdAt: now,
    updatedAt: now,
    confirmedAt: now,
    confirmedBy: verifiedStaff.gamerTag || staffPlayer.gamerTag,
    checkedInAt: startImmediately ? now : undefined,
    checkedInBy: startImmediately ? (verifiedStaff.gamerTag || staffPlayer.gamerTag) : undefined,
    startedAt: startImmediately ? now : undefined,
    startedBy: startImmediately ? (verifiedStaff.gamerTag || staffPlayer.gamerTag) : undefined,
  };

  await setDoc(doc(db, 'reservations', resId), sanitize(newRes));

  await logAuditEvent({
    action: 'CREATE_WALKIN_RESERVATION',
    actorId: verifiedStaff.uid,
    actorName: verifiedStaff.gamerTag,
    targetType: 'reservation',
    targetId: resId,
    details: `Staff created walk-in session for ${customerName} on ${postNames.join(', ')} (${durationHours}h, ${totalPrice} DA, Status: ${newRes.status})`,
  });

  return resId;
}

/**
 * Report a technical issue on a gaming station.
 * Adds a post block for maintenance and notifies administrators.
 */
export async function staffReportStationIssue(
  postId: string,
  postName: string,
  reason: string,
  staffPlayer: Player,
  postType: GamingPostType = 'PC'
): Promise<string> {
  const verifiedStaff = await assertAuthorizedStaff(staffPlayer);
  const blockId = `maint_${postId}_${Date.now()}`;
  const now = Date.now();
  const oneWeekLater = now + 7 * 24 * 3600 * 1000;

  const newBlock: PostBlock = {
    id: blockId,
    postId,
    postName,
    postType,
    reason: 'TECHNICAL_ISSUE',
    reasonDescription: reason.trim(),
    startAt: now,
    endAt: oneWeekLater,
    createdById: verifiedStaff.uid,
    createdByGamerTag: verifiedStaff.gamerTag,
    createdAt: now,
  };

  await setDoc(doc(db, 'postBlocks', blockId), sanitize(newBlock));

  // Also update gaming post status if it exists
  try {
    const postRef = doc(db, 'gamingPosts', postId);
    const postSnap = await getDoc(postRef);
    if (postSnap.exists()) {
      await updateDoc(postRef, {
        status: 'MAINTENANCE',
        updatedAt: now,
      });
    }
  } catch (e) {
    console.warn('Could not update post status directly:', e);
  }

  await logAuditEvent({
    action: 'REPORT_STATION_ISSUE',
    actorId: verifiedStaff.uid,
    actorName: verifiedStaff.gamerTag,
    targetType: 'post',
    targetId: postId,
    details: `Staff reported issue on station ${postName}: ${reason}`,
  });

  return blockId;
}

/**
 * Clear technical issue / maintenance block on a station.
 */
export async function staffClearStationIssue(
  blockId: string,
  postId: string,
  staffPlayer: Player
): Promise<void> {
  const verifiedStaff = await assertAuthorizedStaff(staffPlayer);
  try {
    await deleteDoc(doc(db, 'postBlocks', blockId));
  } catch (err) {
    console.warn('Error deleting post block:', err);
  }

  try {
    const postRef = doc(db, 'gamingPosts', postId);
    const postSnap = await getDoc(postRef);
    if (postSnap.exists()) {
      await updateDoc(postRef, {
        status: 'ACTIVE',
        updatedAt: Date.now(),
      });
    }
  } catch (e) {
    console.warn('Could not update post status to ACTIVE:', e);
  }

  await logAuditEvent({
    action: 'CLEAR_STATION_ISSUE',
    actorId: verifiedStaff.uid,
    actorName: verifiedStaff.gamerTag,
    targetType: 'post',
    targetId: postId,
    details: `Staff cleared maintenance issue for station ID: ${postId}`,
  });
}
