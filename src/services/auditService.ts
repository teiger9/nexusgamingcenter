import {
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { AuditLog } from '../types';
import { sanitizeFirestoreData } from './matchService';

/**
 * Record an action to the audit logs collection
 */
export async function logAuditEvent(params: {
  action: string;
  actorId: string;
  actorName: string;
  targetType: AuditLog['targetType'];
  targetId: string;
  details: string;
  gameId?: string;
  teamId?: string;
  lobbyId?: string;
  matchId?: string;
}): Promise<void> {
  try {
    const currentUid = auth.currentUser?.uid;
    const effectiveActorId = params.actorId || currentUid || 'system';
    const logId = `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const newLog: AuditLog = {
      id: logId,
      action: params.action,
      actorId: effectiveActorId,
      actorName: params.actorName,
      targetType: params.targetType,
      targetId: params.targetId,
      details: params.details,
      timestamp: Date.now(),
      gameId: params.gameId,
      teamId: params.teamId,
      lobbyId: params.lobbyId,
      matchId: params.matchId,
    };

    await setDoc(doc(db, 'auditLogs', logId), sanitizeFirestoreData(newLog));
  } catch (err) {
    console.error('Failed to record audit log:', err);
  }
}

/**
 * Subscribe to recent audit logs (Admin only)
 */
export function subscribeToAuditLogs(
  callback: (logs: AuditLog[]) => void,
  filterAction?: string
) {
  const logsRef = collection(db, 'auditLogs');
  let q = query(logsRef, orderBy('timestamp', 'desc'), limit(100));

  if (filterAction && filterAction !== 'ALL') {
    q = query(
      logsRef,
      where('action', '==', filterAction),
      orderBy('timestamp', 'desc'),
      limit(100)
    );
  }

  return onSnapshot(
    q,
    (snap) => {
      const logs = snap.docs.map((d) => d.data() as AuditLog);
      callback(logs);
    },
    (err) => {
      console.error('Error fetching audit logs:', err);
      callback([]);
    }
  );
}
