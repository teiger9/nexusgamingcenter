import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  getDocs,
  query,
  where,
  orderBy,
  onSnapshot,
  limit,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { AppNotification } from '../types';
import { cleanForFirestore } from '../utils/firestoreSanitizer';

/**
 * Send an in-app notification to a specific user
 */
export async function sendNotification(params: {
  userId: string;
  type: AppNotification['type'];
  title: string;
  message: string;
  data?: AppNotification['data'];
  notificationId?: string;
  recipientId?: string;
  senderId?: string;
  matchId?: string;
  invitationId?: string;
  lobbyId?: string;
  teamId?: string;
  inviterId?: string;
  inviterGamerTag?: string;
  game?: string;
  status?: string;
  notificationState?: 'UNREAD' | 'READ' | 'ACTIONED';
  expiresAt?: number;
}): Promise<string> {
  try {
    const notifId = params.notificationId || `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const recipientUid = params.recipientId || params.userId;
    const expiresAt = params.expiresAt || params.data?.expiresAt;

    const newNotif: AppNotification = {
      id: notifId,
      notificationId: notifId,
      userId: recipientUid,
      recipientId: recipientUid,
      senderId: params.senderId || params.inviterId || params.data?.inviterId,
      matchId: params.matchId || params.lobbyId || params.data?.matchId || params.data?.lobbyId,
      type: params.type,
      title: params.title,
      message: params.message,
      read: false,
      notificationState: params.notificationState || 'UNREAD',
      createdAt: Date.now(),
      expiresAt,
      invitationId: params.invitationId || params.data?.invitationId,
      lobbyId: params.lobbyId || params.data?.lobbyId || params.data?.matchId,
      teamId: params.teamId || params.data?.teamId,
      inviterId: params.inviterId || params.senderId || params.data?.inviterId,
      inviterGamerTag: params.inviterGamerTag || params.data?.inviterGamerTag,
      game: params.game || params.data?.game || params.data?.gameName,
      status: params.status || params.data?.status || (params.type === 'MATCH_INVITATION' || params.type === 'CHESS_MATCH_INVITATION' ? 'PENDING' : undefined),
      data: {
        ...(params.data || {}),
        expiresAt,
        invitationId: params.invitationId || params.data?.invitationId,
        lobbyId: params.lobbyId || params.data?.lobbyId || params.data?.matchId,
        matchId: params.matchId || params.lobbyId || params.data?.matchId || params.data?.lobbyId,
        teamId: params.teamId || params.data?.teamId,
        inviterId: params.inviterId || params.senderId || params.data?.inviterId,
        inviterGamerTag: params.inviterGamerTag || params.data?.inviterGamerTag,
        recipientId: recipientUid,
        game: params.game || params.data?.game || params.data?.gameName,
        status: params.status || params.data?.status || (params.type === 'MATCH_INVITATION' || params.type === 'CHESS_MATCH_INVITATION' ? 'PENDING' : undefined),
        actionState: params.data?.actionState || 'UNREAD',
      },
    };

    await setDoc(doc(db, 'notifications', notifId), cleanForFirestore(newNotif));
    return notifId;
  } catch (err) {
    console.error('Failed to send notification:', err);
    return '';
  }
}

/**
 * Send notification to multiple users (e.g. team roster)
 */
export async function sendBulkNotification(params: {
  userIds: string[];
  type: AppNotification['type'];
  title: string;
  message: string;
  data?: AppNotification['data'];
}): Promise<void> {
  try {
    const { userIds, type, title, message, data } = params;
    if (!userIds || userIds.length === 0) return;

    const batch = writeBatch(db);
    const now = Date.now();

    for (const uId of userIds) {
      const notifId = `notif_${now}_${Math.random().toString(36).substring(2, 7)}`;
      const notifRef = doc(db, 'notifications', notifId);
      const newNotif: AppNotification = {
        id: notifId,
        userId: uId,
        type,
        title,
        message,
        read: false,
        createdAt: now,
        data: data || {},
      };
      batch.set(notifRef, cleanForFirestore(newNotif));
    }

    await batch.commit();
  } catch (err) {
    console.error('Failed to send bulk notifications:', err);
  }
}

/**
 * Subscribe to notifications for a specific player
 */
export function subscribeToUserNotifications(
  userId: string,
  callback: (notifications: AppNotification[]) => void
) {
  if (!userId) {
    callback([]);
    return () => {};
  }

  // To avoid missing composite index crashes in Firestore and guarantee delivery
  // whether userId or recipientId was used on the notification document:
  const qUserId = query(
    collection(db, 'notifications'),
    where('userId', '==', userId)
  );
  const qRecipientId = query(
    collection(db, 'notifications'),
    where('recipientId', '==', userId)
  );

  let mapUserId = new Map<string, AppNotification>();
  let mapRecipientId = new Map<string, AppNotification>();

  const emit = () => {
    const combined = new Map<string, AppNotification>();
    for (const [id, notif] of mapUserId.entries()) {
      combined.set(id, notif);
    }
    for (const [id, notif] of mapRecipientId.entries()) {
      combined.set(id, notif);
    }
    const notifs = Array.from(combined.values()).sort(
      (a, b) => (b.createdAt || 0) - (a.createdAt || 0)
    );
    callback(notifs);
  };

  const unsub1 = onSnapshot(
    qUserId,
    (snap) => {
      mapUserId = new Map();
      snap.docs.forEach((d) => {
        mapUserId.set(d.id, { id: d.id, notificationId: d.id, ...d.data() } as AppNotification);
      });
      emit();
    },
    (err) => {
      console.error('Error listening to notifications by userId:', err);
    }
  );

  const unsub2 = onSnapshot(
    qRecipientId,
    (snap) => {
      mapRecipientId = new Map();
      snap.docs.forEach((d) => {
        mapRecipientId.set(d.id, { id: d.id, notificationId: d.id, ...d.data() } as AppNotification);
      });
      emit();
    },
    (err) => {
      console.error('Error listening to notifications by recipientId:', err);
    }
  );

  return () => {
    unsub1();
    unsub2();
  };
}

/**
 * Mark a single notification as read
 */
export async function markNotificationAsRead(notificationId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'notifications', notificationId), {
      read: true,
      notificationState: 'READ',
    });
  } catch (err) {
    console.error('Error marking notification read:', err);
  }
}

/**
 * Update all notifications associated with a reservation to ACTIONED state
 * Keeps notification in history while recording who actioned it and what status was set.
 */
export async function updateReservationNotificationsActioned(
  reservationId: string,
  actionResult: 'CONFIRMED' | 'REJECTED' | 'CANCELLED',
  actionedBy: string
): Promise<void> {
  try {
    const q = query(
      collection(db, 'notifications'),
      where('data.reservationId', '==', reservationId)
    );
    const snap = await getDocs(q);
    if (snap.empty) return;

    const batch = writeBatch(db);
    const now = Date.now();

    snap.docs.forEach((d) => {
      batch.update(d.ref, {
        notificationState: 'ACTIONED',
        read: true,
        actionedAt: now,
        actionedBy,
        actionResult,
        'data.status': actionResult,
        'data.actionState': 'ACTIONED',
      });
    });

    await batch.commit();
  } catch (err) {
    console.error('Error marking reservation notifications actioned:', err);
  }
}

/**
 * Update all notifications associated with a match invitation to ACTIONED state
 * Keeps notification record in history with verified status, actionedBy, and timestamp.
 */
export async function updateMatchInvitationNotificationsActioned(
  invitationId: string,
  actionResult: 'ACCEPTED' | 'DECLINED' | 'CANCELLED' | 'EXPIRED',
  actionedBy: string
): Promise<void> {
  try {
    if (!invitationId) return;

    const docMap = new Map<string, any>();

    // Check by data.invitationId
    try {
      const qData = query(
        collection(db, 'notifications'),
        where('data.invitationId', '==', invitationId)
      );
      const snapData = await getDocs(qData);
      snapData.docs.forEach((d) => docMap.set(d.id, d));
    } catch (qErr) {
      console.warn('Could not query notifications by data.invitationId:', qErr);
    }

    // Also check by top-level invitationId
    try {
      const qTop = query(
        collection(db, 'notifications'),
        where('invitationId', '==', invitationId)
      );
      const snapTop = await getDocs(qTop);
      snapTop.docs.forEach((d) => docMap.set(d.id, d));
    } catch (qErr) {
      console.warn('Could not query notifications by top-level invitationId:', qErr);
    }

    // Also check direct deterministic canonical notification IDs
    const canonicalIds = [
      `notif_match_inv_${invitationId}`,
      `notif_inv_${invitationId}`,
      invitationId,
    ];
    for (const cId of canonicalIds) {
      if (!docMap.has(cId)) {
        try {
          const cSnap = await getDoc(doc(db, 'notifications', cId));
          if (cSnap.exists()) {
            docMap.set(cSnap.id, cSnap);
          }
        } catch {
          // Document may not exist under this specific deterministic key
        }
      }
    }

    if (docMap.size === 0) return;

    const batch = writeBatch(db);
    const now = Date.now();

    docMap.forEach((d) => {
      batch.update(d.ref, {
        notificationState: 'ACTIONED',
        read: true,
        actionedAt: now,
        actionedBy,
        actionResult,
        status: actionResult,
        'data.status': actionResult,
        'data.actionState': 'ACTIONED',
      });
    });

    await batch.commit();
  } catch (err) {
    console.error('Error marking match invitation notifications actioned:', err);
  }
}

/**
 * Update all admin approval notifications associated with a match to ACTIONED state
 * when an Admin approves or rejects the match to start.
 */
export async function updateMatchAdminApprovalNotificationsActioned(
  matchId: string,
  actionResult: 'APPROVED' | 'REJECTED',
  actionedBy: string
): Promise<void> {
  try {
    if (!matchId) return;

    // Check by matchId and type
    const qTop = query(
      collection(db, 'notifications'),
      where('matchId', '==', matchId),
      where('type', '==', 'MATCH_ADMIN_APPROVAL')
    );
    const snapTop = await getDocs(qTop);

    // Also query by data.matchId
    const qData = query(
      collection(db, 'notifications'),
      where('data.matchId', '==', matchId),
      where('type', '==', 'MATCH_ADMIN_APPROVAL')
    );
    const snapData = await getDocs(qData);

    const docMap = new Map<string, any>();
    snapTop.docs.forEach((d) => docMap.set(d.id, d));
    snapData.docs.forEach((d) => docMap.set(d.id, d));

    if (docMap.size === 0) return;

    const batch = writeBatch(db);
    const now = Date.now();

    docMap.forEach((d) => {
      batch.update(d.ref, {
        notificationState: 'ACTIONED',
        read: true,
        actionedAt: now,
        actionedBy,
        actionResult,
        status: actionResult,
        'data.status': actionResult,
        'data.actionState': 'ACTIONED',
      });
    });

    await batch.commit();
  } catch (err) {
    console.error('Error marking admin match approval notifications actioned:', err);
  }
}

/**
 * Mark all notifications as read for a user
 */
export async function markAllNotificationsAsRead(userId: string): Promise<void> {
  try {
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', userId),
      where('read', '==', false)
    );
    const snap = await getDocs(q);
    if (snap.empty) return;

    const batch = writeBatch(db);
    snap.docs.forEach((d) => {
      batch.update(d.ref, { read: true });
    });
    await batch.commit();
  } catch (err) {
    console.error('Error marking all notifications read:', err);
  }
}
