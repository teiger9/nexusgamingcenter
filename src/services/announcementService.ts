import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  getDocs,
  orderBy,
  limit,
  startAfter,
  QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Announcement, AnnouncementStatus } from '../types';

export interface PaginatedAnnouncementsResult {
  announcements: Announcement[];
  lastDoc: QueryDocumentSnapshot | null;
  hasMore: boolean;
}

/**
 * Calculates unix timestamp expiration from date and time strings.
 * e.g. date: "2026-10-25", time: "20:00"
 */
export function calculateAnnouncementExpiresAt(dateStr: string, timeStr: string): number {
  try {
    const trimmedDate = dateStr.trim();
    const trimmedTime = timeStr.trim();

    // Check if format is YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmedDate)) {
      const combined = `${trimmedDate}T${trimmedTime || '23:59'}:00`;
      const parsed = Date.parse(combined);
      if (!isNaN(parsed)) {
        // Expire 2 hours after scheduled game time, or at scheduled time
        return parsed + (2 * 60 * 60 * 1000);
      }
    }

    // Try standard JS Date parsing
    const parsed = Date.parse(`${trimmedDate} ${trimmedTime}`);
    if (!isNaN(parsed)) {
      return parsed + (2 * 60 * 60 * 1000);
    }
  } catch (err) {
    console.warn('Error parsing announcement date/time:', err);
  }

  // Fallback: expire 48 hours from creation
  return Date.now() + 48 * 60 * 60 * 1000;
}

/**
 * Checks whether an announcement has expired based on its scheduled time.
 */
export function isAnnouncementExpired(announcement: Announcement): boolean {
  if (announcement.status === 'expired') return true;
  if (announcement.expiresAt && announcement.expiresAt < Date.now()) {
    return true;
  }
  return false;
}

/**
 * Creates a new community announcement.
 * Initially has status = 'pending'.
 */
export async function createAnnouncement(params: {
  creatorId: string;
  creatorAccountName: string;
  creatorEmail?: string;
  game: string;
  playersNeeded: number;
  date: string;
  time: string;
  phoneNumber: string;
  message: string;
}): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const {
      creatorId,
      creatorAccountName,
      creatorEmail = '',
      game,
      playersNeeded,
      date,
      time,
      phoneNumber,
      message,
    } = params;

    if (!creatorId) return { success: false, error: 'User must be authenticated.' };
    if (!creatorAccountName) return { success: false, error: 'Account gamerTag is required.' };
    if (!game) return { success: false, error: 'Game selection is required.' };
    if (!playersNeeded || playersNeeded < 1) {
      return { success: false, error: 'Please specify how many players you need.' };
    }
    if (!date?.trim()) return { success: false, error: 'Date is required.' };
    if (!time?.trim()) return { success: false, error: 'Time is required.' };
    if (!phoneNumber?.trim()) return { success: false, error: 'Contact phone number is required.' };
    if (!message?.trim()) return { success: false, error: 'Announcement message is required.' };

    const docId = `ann_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const announcementRef = doc(db, 'announcements', docId);

    const expiresAt = calculateAnnouncementExpiresAt(date, time);
    const now = Date.now();

    const newAnnouncement: Announcement = {
      id: docId,
      creatorId,
      creatorAccountName,
      creatorEmail,
      game,
      playersNeeded: Number(playersNeeded),
      date: date.trim(),
      time: time.trim(),
      phoneNumber: phoneNumber.trim(),
      message: message.trim(),
      status: 'pending',
      createdAt: now,
      expiresAt,
    };

    await setDoc(announcementRef, newAnnouncement);
    return { success: true, id: docId };
  } catch (err: any) {
    console.error('createAnnouncement error:', err);
    return { success: false, error: err.message || 'Failed to submit announcement.' };
  }
}

/**
 * Subscribes to approved, non-expired announcements for the community board.
 * Enforces a safety limit (default 24) to prevent massive payloads.
 */
export function subscribeToApprovedAnnouncements(
  callback: (announcements: Announcement[]) => void,
  limitCount: number = 24
): () => void {
  const q = query(
    collection(db, 'announcements'),
    where('status', '==', 'approved'),
    limit(limitCount)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const now = Date.now();
      const list: Announcement[] = [];

      snapshot.forEach((d) => {
        const item = d.data() as Announcement;
        // Verify not expired
        if (!item.expiresAt || item.expiresAt >= now) {
          list.push({ ...item, id: d.id });
        }
      });

      // Sort by creation time desc (newest first)
      list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      callback(list);
    },
    (err) => {
      console.warn('subscribeToApprovedAnnouncements error:', err);
      callback([]);
    }
  );
}

/**
 * Paginated on-demand query for approved community announcements
 */
export async function fetchApprovedAnnouncementsPaginated(params: {
  pageSize?: number;
  lastDoc?: QueryDocumentSnapshot | null;
  gameFilter?: string;
} = {}): Promise<PaginatedAnnouncementsResult> {
  const { pageSize = 18, lastDoc = null, gameFilter = 'ALL' } = params;
  try {
    const now = Date.now();
    const annRef = collection(db, 'announcements');

    const constraints: any[] = [where('status', '==', 'approved')];
    if (gameFilter && gameFilter !== 'ALL') {
      constraints.push(where('game', '==', gameFilter));
    }
    if (lastDoc) {
      constraints.push(startAfter(lastDoc));
    }
    constraints.push(limit(pageSize + 1));

    const q = query(annRef, ...constraints);
    const snap = await getDocs(q);

    const hasMore = snap.docs.length > pageSize;
    const resultDocs = hasMore ? snap.docs.slice(0, pageSize) : snap.docs;

    const list: Announcement[] = [];
    resultDocs.forEach((d) => {
      const item = d.data() as Announcement;
      if (!item.expiresAt || item.expiresAt >= now) {
        list.push({ ...item, id: d.id });
      }
    });

    list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    return {
      announcements: list,
      lastDoc: resultDocs.length > 0 ? resultDocs[resultDocs.length - 1] : null,
      hasMore,
    };
  } catch (err) {
    console.error('fetchApprovedAnnouncementsPaginated error:', err);
    return { announcements: [], lastDoc: null, hasMore: false };
  }
}

/**
 * Subscribes to announcements created by a specific user.
 * Displays Pending, Approved, Rejected, Expired, and Cancelled statuses.
 */
export function subscribeToUserAnnouncements(
  userId: string,
  callback: (announcements: Announcement[]) => void
): () => void {
  if (!userId) {
    callback([]);
    return () => {};
  }

  const q = query(
    collection(db, 'announcements'),
    where('creatorId', '==', userId),
    limit(50)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const now = Date.now();
      const list: Announcement[] = [];

      snapshot.forEach((d) => {
        const item = d.data() as Announcement;
        let status = item.status;

        // Auto-mark expired locally if scheduled time has elapsed
        if (status === 'approved' && item.expiresAt && item.expiresAt < now) {
          status = 'expired';
        }

        list.push({ ...item, id: d.id, status });
      });

      list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      callback(list);
    },
    (err) => {
      console.warn('subscribeToUserAnnouncements error:', err);
      callback([]);
    }
  );
}

/**
 * Subscribes to pending announcements for Admin/Staff review.
 */
export function subscribeToPendingAnnouncements(
  callback: (announcements: Announcement[]) => void
): () => void {
  const q = query(
    collection(db, 'announcements'),
    where('status', '==', 'pending'),
    limit(50)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const list: Announcement[] = [];
      snapshot.forEach((d) => {
        list.push({ ...(d.data() as Announcement), id: d.id });
      });

      list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      callback(list);
    },
    (err) => {
      console.warn('subscribeToPendingAnnouncements error:', err);
      callback([]);
    }
  );
}

/**
 * Subscribes to all announcements (Admin/Staff management view).
 */
export function subscribeToAllAnnouncements(
  callback: (announcements: Announcement[]) => void
): () => void {
  const q = query(collection(db, 'announcements'), limit(100));

  return onSnapshot(
    q,
    (snapshot) => {
      const list: Announcement[] = [];
      snapshot.forEach((d) => {
        list.push({ ...(d.data() as Announcement), id: d.id });
      });

      list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      callback(list);
    },
    (err) => {
      console.warn('subscribeToAllAnnouncements error:', err);
      callback([]);
    }
  );
}

/**
 * Approves an announcement (Super Admin, Admin, or Staff).
 */
export async function approveAnnouncement(
  announcementId: string,
  reviewerId: string,
  reviewerName: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const ref = doc(db, 'announcements', announcementId);
    await updateDoc(ref, {
      status: 'approved',
      approvedBy: reviewerId,
      approvedByName: reviewerName,
      approvedAt: Date.now(),
    });
    return { success: true };
  } catch (err: any) {
    console.error('approveAnnouncement error:', err);
    return { success: false, error: err.message || 'Failed to approve announcement.' };
  }
}

/**
 * Rejects an announcement (Super Admin, Admin, or Staff).
 */
export async function rejectAnnouncement(
  announcementId: string,
  reviewerId: string,
  reviewerName: string,
  rejectionReason?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const ref = doc(db, 'announcements', announcementId);
    await updateDoc(ref, {
      status: 'rejected',
      rejectedBy: reviewerId,
      rejectedByName: reviewerName,
      rejectedAt: Date.now(),
      rejectionReason: rejectionReason || 'Rejected by staff',
    });
    return { success: true };
  } catch (err: any) {
    console.error('rejectAnnouncement error:', err);
    return { success: false, error: err.message || 'Failed to reject announcement.' };
  }
}

/**
 * Cancels an announcement (Owner action).
 */
export async function cancelAnnouncement(
  announcementId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const ref = doc(db, 'announcements', announcementId);
    await updateDoc(ref, {
      status: 'cancelled',
    });
    return { success: true };
  } catch (err: any) {
    console.error('cancelAnnouncement error:', err);
    return { success: false, error: err.message || 'Failed to cancel announcement.' };
  }
}

/**
 * Deletes an announcement (Owner or Admin/Staff).
 */
export async function deleteAnnouncement(
  announcementId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const ref = doc(db, 'announcements', announcementId);
    await deleteDoc(ref);
    return { success: true };
  } catch (err: any) {
    console.error('deleteAnnouncement error:', err);
    return { success: false, error: err.message || 'Failed to delete announcement.' };
  }
}
