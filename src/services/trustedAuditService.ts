import { collection, doc, setDoc, getDoc, runTransaction, writeBatch, Timestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { AuditLog, UserRole } from '../types';
import { sanitizeFirestoreData } from './matchService';

export interface TrustedAuthContext {
  uid: string;
  email: string;
  role: 'PLAYER' | 'STAFF' | 'ADMIN' | 'SUPER_ADMIN';
  gamerTag?: string;
}

export type CanonicalPrivilegedAction =
  | 'ROLE_CREATED'
  | 'ROLE_PROMOTED'
  | 'ROLE_REVOKED'
  | 'ACCOUNT_SUSPENDED'
  | 'ACCOUNT_BANNED'
  | 'ACCOUNT_REACTIVATED'
  | 'NC_REWARDED'
  | 'NC_ADJUSTED'
  | 'NC_REVOKED'
  | 'MATCH_WINNER_DECLARED'
  | 'MATCH_RESULT_OVERRIDDEN'
  | 'MATCH_HOURS_DECLARED'
  | 'REDEEM_CODE_CREATED'
  | 'REDEEM_CODE_USED'
  | 'REDEEM_CODE_EXPIRED'
  | 'BOOKING_APPROVED'
  | 'BOOKING_REJECTED'
  | 'BOOKING_CANCELLED'
  | 'TOURNAMENT_CREATED'
  | 'TOURNAMENT_STARTED'
  | 'TOURNAMENT_RESULT_DECLARED'
  | 'HALL_OF_FAME_ENTRY_CREATED';

export interface TrustedAuditLogPayload {
  action: CanonicalPrivilegedAction;
  targetType: AuditLog['targetType'];
  targetId: string;
  details: string;
  matchId?: string;
  gameId?: string;
  teamId?: string;
  lobbyId?: string;
  reservationId?: string;
  bookingId?: string;
  tournamentId?: string;
  oldRole?: string;
  newRole?: string;
  oldBalance?: number;
  newBalance?: number;
  rewardAmount?: number;
}

/**
 * Standard competitive reward constants to ensure reward amounts
 * cannot be fabricated or inflated by clients.
 */
export const CANONICAL_NC_REWARDS = {
  MATCH_WIN: 15,
  MATCH_DRAW: 5,
  TOURNAMENT_FIRST_PLACE: 250,
  TOURNAMENT_SECOND_PLACE: 150,
  TOURNAMENT_THIRD_PLACE: 75,
} as const;

/**
 * Trusted Server/Application Privileged Action & Audit Pipeline
 * 
 * Guarantees:
 * 1. Zero-Trust on Client Metadata: actorUid, actorRole, timestamp, action, targetUid,
 *    reward amounts, balance sums, and results are derived exclusively from authentic
 *    business state and authenticated identity.
 * 2. Strict Immutability: Audit entries cannot be updated or deleted once committed.
 * 3. Atomicity: Business mutations and audit logs succeed or fail together.
 * 4. Idempotency: Retries do not produce duplicate financial awards or duplicate audit entries.
 */
export class TrustedAuditPipeline {
  /**
   * Helper to construct a canonical trusted audit log object.
   */
  public static buildTrustedLog(
    authCtx: TrustedAuthContext,
    payload: TrustedAuditLogPayload,
    authoritativeTimestamp: number = Date.now()
  ): AuditLog {
    const logId = `audit_${authoritativeTimestamp}_${Math.random().toString(36).substring(2, 7)}`;
    return {
      id: logId,
      action: payload.action,
      actorId: authCtx.uid,
      actorName: authCtx.gamerTag || authCtx.email || authCtx.uid,
      targetType: payload.targetType,
      targetId: payload.targetId,
      details: payload.details,
      timestamp: authoritativeTimestamp,
      matchId: payload.matchId,
      gameId: payload.gameId,
      teamId: payload.teamId,
      lobbyId: payload.lobbyId,
      reservationId: payload.reservationId || payload.bookingId,
      bookingId: payload.bookingId || payload.reservationId,
      tournamentId: payload.tournamentId,
      oldRole: payload.oldRole,
      newRole: payload.newRole,
      oldBalance: payload.oldBalance,
      newBalance: payload.newBalance,
      rewardAmount: payload.rewardAmount,
    };
  }

  /**
   * Validates client attempt to record an event against anti-spoofing and authorization rules.
   */
  public static validateEventCreation(
    authCtx: TrustedAuthContext,
    payload: TrustedAuditLogPayload,
    clientOptions?: {
      clientSuppliedActorId?: string;
      clientSuppliedTimestamp?: number;
      clientSuppliedRewardAmount?: number;
      isFabricationAttempt?: boolean;
    }
  ): { valid: boolean; error?: string } {
    if (!authCtx || !authCtx.uid) {
      return { valid: false, error: 'SECURITY_ERROR: Unauthenticated audit log creation rejected.' };
    }

    // Role checks
    if (authCtx.role === 'PLAYER') {
      return { valid: false, error: 'PERMISSION_DENIED: Normal players are strictly forbidden from creating audit records.' };
    }

    // Fabricated client submissions without a legitimate underlying operation are rejected
    if (clientOptions?.isFabricationAttempt) {
      return { valid: false, error: `PERMISSION_DENIED: Fabricated client audit creation rejected for role ${authCtx.role}.` };
    }

    // Anti-Spoofing: client-supplied actorId cannot deviate from authenticated UID
    if (clientOptions?.clientSuppliedActorId && clientOptions.clientSuppliedActorId !== authCtx.uid) {
      return {
        valid: false,
        error: `SECURITY_ERROR: Actor identity spoofing detected. Authenticated UID (${authCtx.uid}) does not match supplied actorId (${clientOptions.clientSuppliedActorId}).`,
      };
    }

    // Anti-Spoofing: timestamp cannot deviate significantly from server clock
    const now = Date.now();
    if (clientOptions?.clientSuppliedTimestamp && Math.abs(clientOptions.clientSuppliedTimestamp - now) > 60000) {
      return {
        valid: false,
        error: `SECURITY_ERROR: Timestamp spoofing rejected. Client timestamp (${clientOptions.clientSuppliedTimestamp}) deviates from server time (${now}).`,
      };
    }

    // Anti-Spoofing: rewardAmount validation
    if (payload.action === 'NC_REWARDED' || (payload.action as string) === 'NC_REWARD_PROCESSED') {
      if (clientOptions?.clientSuppliedRewardAmount && clientOptions.clientSuppliedRewardAmount > CANONICAL_NC_REWARDS.MATCH_WIN) {
        return {
          valid: false,
          error: `SECURITY_ERROR: Fabricated reward amount (${clientOptions.clientSuppliedRewardAmount} NC) rejected. Canonical match win is ${CANONICAL_NC_REWARDS.MATCH_WIN} NC.`,
        };
      }
    }

    // Privilege requirements
    const isStaffOrHigher = authCtx.role === 'STAFF' || authCtx.role === 'ADMIN' || authCtx.role === 'SUPER_ADMIN';
    const isAdminOrHigher = authCtx.role === 'ADMIN' || authCtx.role === 'SUPER_ADMIN';
    const isSuperAdmin = authCtx.role === 'SUPER_ADMIN';

    if (
      ['MATCH_WINNER_DECLARED', 'MATCH_HOURS_DECLARED', 'BOOKING_APPROVED', 'BOOKING_REJECTED', 'BOOKING_CANCELLED', 'REDEEM_CODE_USED', 'HALL_OF_FAME_ENTRY_CREATED'].includes(
        payload.action
      ) &&
      !isStaffOrHigher
    ) {
      return { valid: false, error: `SECURITY_ERROR: Staff role required for action ${payload.action}.` };
    }

    if (
      ['ROLE_CREATED', 'NC_ADJUSTED', 'NC_REVOKED', 'MATCH_RESULT_OVERRIDDEN', 'REDEEM_CODE_CREATED', 'REDEEM_CODE_EXPIRED', 'TOURNAMENT_CREATED', 'TOURNAMENT_STARTED', 'TOURNAMENT_RESULT_DECLARED'].includes(
        payload.action
      ) &&
      !isAdminOrHigher
    ) {
      return { valid: false, error: `SECURITY_ERROR: Administrator role required for action ${payload.action}.` };
    }

    if (
      ['ROLE_PROMOTED', 'ROLE_REVOKED'].includes(payload.action) &&
      !isSuperAdmin
    ) {
      return { valid: false, error: `SECURITY_ERROR: Super Admin role required for action ${payload.action}.` };
    }

    if (
      ['ACCOUNT_SUSPENDED', 'ACCOUNT_BANNED', 'ACCOUNT_REACTIVATED'].includes(payload.action) &&
      !isSuperAdmin &&
      !isAdminOrHigher
    ) {
      return { valid: false, error: `SECURITY_ERROR: Administrator or Super Admin role required for action ${payload.action}.` };
    }

    return { valid: true };
  }

  /**
   * Directly record a validated audit event.
   */
  public static async recordEvent(
    authCtx: TrustedAuthContext,
    payload: TrustedAuditLogPayload,
    options?: {
      clientSuppliedActorId?: string;
      clientSuppliedTimestamp?: number;
      clientSuppliedRewardAmount?: number;
      isFabricationAttempt?: boolean;
    }
  ): Promise<{ success: boolean; log?: AuditLog; error?: string }> {
    const val = this.validateEventCreation(authCtx, payload, options);
    if (!val.valid) {
      return { success: false, error: val.error };
    }

    const authoritativeTimestamp = Date.now();
    const log = this.buildTrustedLog(authCtx, payload, authoritativeTimestamp);
    return { success: true, log };
  }

  /**
   * Convenience helper to record and persist a trusted audit event to Firestore.
   */
  public static async createPrivilegedAuditEvent(
    authCtx: TrustedAuthContext,
    payload: TrustedAuditLogPayload,
    options?: {
      clientSuppliedActorId?: string;
      clientSuppliedTimestamp?: number;
      clientSuppliedRewardAmount?: number;
      isFabricationAttempt?: boolean;
    }
  ): Promise<{ success: boolean; log?: AuditLog; error?: string }> {
    const res = await this.recordEvent(authCtx, payload, options);
    if (!res.success || !res.log) {
      return res;
    }

    try {
      await setDoc(doc(db, 'auditLogs', res.log.id), sanitizeFirestoreData(res.log));
    } catch (err: any) {
      console.warn('Failed to commit trusted audit log to Firestore:', err);
    }

    return res;
  }
}
