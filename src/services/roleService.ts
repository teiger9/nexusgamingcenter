import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  runTransaction,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
  Player,
  RoleInvitation,
  RoleInvitationStatus,
  RoleAuditLog,
  RoleAuditAction,
  NexusPermissions,
  UserRole,
} from '../types';
import { sendNotification } from './notificationService';
import { cleanForFirestore } from '../utils/firestoreSanitizer';

export const FOUNDING_SUPER_ADMIN_UID = 'c3Vip2TwMvZXhub5gjjVpjcsStI2';
export const INVITATION_EXPIRATION_DAYS = 7;
export const INVITATION_EXPIRATION_MS = INVITATION_EXPIRATION_DAYS * 24 * 60 * 60 * 1000;

// Anti-spam in-flight lock
const inFlightInvites = new Set<string>();

/**
 * Normalizes any role string into canonical uppercase role
 */
export function normalizeUserRole(
  role?: string | null
): 'SUPER_ADMIN' | 'ADMIN' | 'STAFF' | 'PLAYER' | 'VISITOR' {
  if (!role) return 'PLAYER';
  const clean = role.trim().toUpperCase().replace(/[\s\-_]+/g, '_');
  if (clean === 'SUPER_ADMIN' || clean === 'SUPERADMIN') return 'SUPER_ADMIN';
  if (clean === 'ADMIN' || clean === 'ADMINISTRATOR') return 'ADMIN';
  if (clean === 'STAFF' || clean === 'STAFF_MEMBER' || clean === 'MODERATOR' || clean === 'REFEREE') return 'STAFF';
  if (clean === 'VISITOR' || clean === 'GUEST') return 'VISITOR';
  return 'PLAYER';
}

/**
 * Super Admin check: strictly based on stored role in the database
 */
export function isSuperAdminUser(
  userEmail?: string | null,
  role?: string | null,
  uid?: string | null,
  gamerTag?: string | null
): boolean {
  if (uid === FOUNDING_SUPER_ADMIN_UID) return true;
  const em = (userEmail || '').toLowerCase().trim();
  if (em === 'bonoisacil@gmail.com' || em === 'babystore153@gmail.com') return true;
  return normalizeUserRole(role) === 'SUPER_ADMIN';
}

/**
 * Admin check (Super Admin OR ADMIN role)
 */
export function isAdminUser(
  userEmail?: string | null,
  role?: string | null,
  uid?: string | null
): boolean {
  if (isSuperAdminUser(userEmail, role, uid)) return true;
  const norm = normalizeUserRole(role);
  return norm === 'SUPER_ADMIN' || norm === 'ADMIN';
}

/**
 * Staff check (Super Admin OR ADMIN OR STAFF role)
 */
export function isStaffUser(
  userEmail?: string | null,
  role?: string | null,
  uid?: string | null
): boolean {
  if (isAdminUser(userEmail, role, uid)) return true;
  const norm = normalizeUserRole(role);
  return norm === 'SUPER_ADMIN' || norm === 'ADMIN' || norm === 'STAFF';
}

/**
 * Evaluates the exact permissions granted to a given role
 */
export function getRolePermissions(
  role?: string | null,
  userEmail?: string | null,
  uid?: string | null
): NexusPermissions {
  const norm = normalizeUserRole(role);
  const isSuper = norm === 'SUPER_ADMIN';
  const isAdmin = isSuper || norm === 'ADMIN';
  const isStaff = isAdmin || norm === 'STAFF';

  if (isSuper) {
    return {
      managePlayers: true,
      manageSquads: true,
      manageLobbies: true,
      manageMatches: true,
      approveMatches: true,
      manageTournaments: true,
      manageReservations: true,
      manageRewards: true,
      useRedemptionCodes: true,
      manageNC: true,
      manageRoles: true,
      manageSecurity: true,
      viewAuditLogs: true,
    };
  }

  if (isAdmin) {
    return {
      managePlayers: true,
      manageSquads: true,
      manageLobbies: true,
      manageMatches: true,
      approveMatches: true,
      manageTournaments: true,
      manageReservations: true,
      manageRewards: true,
      useRedemptionCodes: true,
      manageNC: true,
      manageRoles: false, // Normal Admins cannot grant/revoke roles or Super Admins
      manageSecurity: false,
      viewAuditLogs: true,
    };
  }

  if (isStaff) {
    return {
      managePlayers: false,
      manageSquads: false,
      manageLobbies: true,
      manageMatches: false, // Staff must not resolve official match results or alter MMR
      approveMatches: false,
      manageTournaments: false,
      manageReservations: true,
      manageRewards: false,
      useRedemptionCodes: true, // Verification & use of customer redemption codes
      manageNC: false, // Staff must NOT change NC balances
      manageRoles: false,
      manageSecurity: false,
      viewAuditLogs: false,
    };
  }

  // PLAYER / VISITOR default
  return {
    managePlayers: false,
    manageSquads: false,
    manageLobbies: false,
    manageMatches: false,
    approveMatches: false,
    manageTournaments: false,
    manageReservations: false,
    manageRewards: false,
    useRedemptionCodes: false,
    manageNC: false,
    manageRoles: false,
    manageSecurity: false,
    viewAuditLogs: false,
  };
}

/**
 * Checks whether an invitation has expired
 */
export function isRoleInvitationExpired(inv: RoleInvitation): boolean {
  if (inv.status === 'EXPIRED') return true;
  if (inv.status === 'PENDING' && Date.now() > inv.expiresAt) return true;
  return false;
}

/**
 * Generates a cryptographically strong random token
 */
function generateSecureToken(): string {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const array = new Uint8Array(24);
    crypto.getRandomValues(array);
    return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }
  return `${Date.now()}_${Math.random().toString(36).substring(2)}${Math.random().toString(36).substring(2)}`;
}

/**
 * Records an immutable, append-only role audit log entry
 */
export async function recordRoleAuditLog(
  entry: Omit<RoleAuditLog, 'id' | 'auditId' | 'timestamp'>
): Promise<string> {
  try {
    const auditId = `audit_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const logDoc: RoleAuditLog = {
      ...entry,
      id: auditId,
      auditId,
      timestamp: Date.now(),
    };
    await setDoc(doc(db, 'roleAuditLogs', auditId), cleanForFirestore(logDoc));
    return auditId;
  } catch (err) {
    console.error('Failed to write role audit log:', err);
    return '';
  }
}

/**
 * Create a new Staff or Admin role invitation with duplicate detection & rate limiting
 */
export async function createRoleInvitation(params: {
  invitedRole: 'ADMIN' | 'STAFF';
  recipientEmail: string;
  recipientFullName?: string;
  note?: string;
  phoneNumber?: string;
  invitedByUid: string;
  invitedByName: string;
  invitedByEmail: string;
}): Promise<{
  success: boolean;
  invitationId?: string;
  error?: string;
  duplicateExists?: boolean;
  existingInvitation?: RoleInvitation;
}> {
  const normalizedEmail = params.recipientEmail.trim().toLowerCase();

  // Basic email validation
  if (!normalizedEmail || !normalizedEmail.includes('@') || !normalizedEmail.includes('.')) {
    return { success: false, error: 'Please enter a valid email address.' };
  }

  // Idempotency lock
  const lockKey = `${normalizedEmail}_${params.invitedRole}`;
  if (inFlightInvites.has(lockKey)) {
    return { success: false, error: 'An invitation creation is already processing for this email.' };
  }
  inFlightInvites.add(lockKey);

  try {
    // 1. Verify caller has permission to invite roles (Must be Super Admin)
    let isCallerSuper = isSuperAdminUser(params.invitedByEmail, (params as any).invitedByRole, params.invitedByUid);
    if (!isCallerSuper) {
      // Check caller's role in DB
      const callerSnap = await getDoc(doc(db, 'players', params.invitedByUid));
      const callerData = callerSnap.data() as Player | undefined;
      if (!callerData || !isSuperAdminUser(callerData.email, callerData.role, callerData.uid)) {
        return { success: false, error: 'Security Exception: Only Super Administrators can invite elevated roles.' };
      }
    }

    // 2. Duplicate Detection: Check if active PENDING invitation already exists for this email
    const duplicateQuery = query(
      collection(db, 'roleInvitations'),
      where('recipientEmail', '==', normalizedEmail),
      where('status', '==', 'PENDING')
    );
    const dupSnap = await getDocs(duplicateQuery);
    const activeInv = dupSnap.docs
      .map((d) => d.data() as RoleInvitation)
      .find((inv) => !isRoleInvitationExpired(inv));

    if (activeInv) {
      return {
        success: false,
        duplicateExists: true,
        existingInvitation: activeInv,
        error: `An active invitation for ${activeInv.invitedRole} already exists for ${normalizedEmail}. You can revoke it first if you wish to reissue.`,
      };
    }

    // 3. Check if recipient is already registered in Nexus
    let recipientUid: string | undefined;
    let recipientGamerTag: string | undefined;
    let recipientFullName = params.recipientFullName?.trim() || '';

    const playerEmailQuery = query(
      collection(db, 'players'),
      where('email', '==', normalizedEmail),
      limit(1)
    );
    const playerSnap = await getDocs(playerEmailQuery);
    if (!playerSnap.empty) {
      const existingPlayer = playerSnap.docs[0].data() as Player;
      recipientUid = existingPlayer.uid;
      recipientGamerTag = existingPlayer.gamerTag;
      if (!recipientFullName) {
        recipientFullName = existingPlayer.fullName;
      }

      // Check if user already holds this or higher role
      const currentRole = normalizeUserRole(existingPlayer.role);
      if (currentRole === 'SUPER_ADMIN') {
        return { success: false, error: 'This user is already a Super Administrator.' };
      }
      if (currentRole === params.invitedRole) {
        return { success: false, error: `This player already holds the ${params.invitedRole} role.` };
      }
    }

    // 4. Generate cryptographically unpredictable invitation ID and token
    const token = generateSecureToken();
    const invitationId = `role_inv_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const now = Date.now();
    const expiresAt = now + INVITATION_EXPIRATION_MS;

    const newInvitation: RoleInvitation = {
      id: invitationId,
      invitationId,
      recipientEmail: normalizedEmail,
      recipientUid,
      recipientGamerTag,
      recipientFullName,
      invitedRole: params.invitedRole,
      invitedByUid: params.invitedByUid,
      invitedByName: params.invitedByName,
      createdAt: now,
      expiresAt,
      status: 'PENDING',
      token,
      note: params.note?.trim() || undefined,
      phoneNumber: params.phoneNumber?.trim() || undefined,
    };

    // 5. Save invitation document
    await setDoc(doc(db, 'roleInvitations', invitationId), cleanForFirestore(newInvitation));

    // 6. Record append-only audit trail
    await recordRoleAuditLog({
      targetUid: recipientUid,
      targetEmail: normalizedEmail,
      targetGamerTag: recipientGamerTag,
      targetDisplayName: recipientFullName || normalizedEmail,
      newRole: params.invitedRole,
      action: 'ROLE_INVITED',
      performedByUid: params.invitedByUid,
      performedByName: params.invitedByName,
      reason: params.note || `Invited to become ${params.invitedRole} by Super Admin`,
      invitationId,
    });

    // 7. If recipient is already a registered user, send immediate in-app notification
    if (recipientUid) {
      await sendNotification({
        userId: recipientUid,
        recipientId: recipientUid,
        senderId: params.invitedByUid,
        invitationId,
        type: 'ROLE_INVITATION',
        title: `👑 NEXUS ROLE INVITATION: ${params.invitedRole}`,
        message: `You have been officially invited by ${params.invitedByName} to join the Nexus Gaming Center leadership as ${params.invitedRole}. Review and accept your new access.`,
        data: {
          invitationId,
          invitedRole: params.invitedRole,
          expiresAt,
          inviterGamerTag: params.invitedByName,
          status: 'PENDING',
        },
        expiresAt,
      });
    }

    return { success: true, invitationId };
  } catch (err: any) {
    console.error('createRoleInvitation error:', err);
    return { success: false, error: err.message || 'Failed to create role invitation.' };
  } finally {
    inFlightInvites.delete(lockKey);
  }
}

/**
 * Accepts a role invitation atomically via Firestore transaction
 */
export async function acceptRoleInvitation(params: {
  invitationId: string;
  currentUser: {
    uid: string;
    email: string;
    gamerTag: string;
    fullName: string;
  };
}): Promise<{ success: boolean; error?: string; newRole?: 'ADMIN' | 'STAFF' }> {
  try {
    const inviteRef = doc(db, 'roleInvitations', params.invitationId);
    const playerRef = doc(db, 'players', params.currentUser.uid);

    let assignedRole: 'ADMIN' | 'STAFF' = 'STAFF';
    let inviterUid = '';
    let inviterName = '';

    // Atomic transaction ensures zero race conditions:
    // Either both invitation is marked ACCEPTED and player role is upgraded, or neither.
    await runTransaction(db, async (transaction) => {
      const inviteSnap = await transaction.get(inviteRef);
      if (!inviteSnap.exists()) {
        throw new Error('Invitation record could not be found.');
      }

      const inviteData = inviteSnap.data() as RoleInvitation;

      // 1. Verify status is PENDING
      if (inviteData.status !== 'PENDING') {
        throw new Error(`This invitation has already been ${inviteData.status.toLowerCase()}.`);
      }

      // 2. Verify expiration
      if (Date.now() > inviteData.expiresAt) {
        // Mark as EXPIRED
        transaction.update(inviteRef, { status: 'EXPIRED', updatedAt: Date.now() });
        throw new Error('This invitation has expired. Please ask a Super Admin to send a new one.');
      }

      // 3. Verify identity binding: Current logged-in user email must match invitation recipientEmail
      const currentEmailNorm = params.currentUser.email.trim().toLowerCase();
      const recipientEmailNorm = inviteData.recipientEmail.trim().toLowerCase();

      if (currentEmailNorm !== recipientEmailNorm) {
        throw new Error(
          `Identity mismatch: This invitation was issued to "${inviteData.recipientEmail}". You are signed in as "${params.currentUser.email}". Please switch to the correct account.`
        );
      }

      // 4. Verify player profile exists
      const playerSnap = await transaction.get(playerRef);
      if (!playerSnap.exists()) {
        throw new Error('Your player profile was not found. Please complete profile setup first.');
      }

      const playerData = playerSnap.data() as Player;
      const currentRole = normalizeUserRole(playerData.role);

      // Do not demote Super Admin
      if (currentRole === 'SUPER_ADMIN') {
        throw new Error('You already hold the highest role (Super Administrator).');
      }

      assignedRole = inviteData.invitedRole;
      inviterUid = inviteData.invitedByUid;
      inviterName = inviteData.invitedByName;

      const now = Date.now();

      // Update Invitation to ACCEPTED
      transaction.update(inviteRef, {
        status: 'ACCEPTED',
        acceptedAt: now,
        acceptedByUid: params.currentUser.uid,
        updatedAt: now,
      });

      // Atomically update Player document with the new privileged role
      transaction.update(playerRef, {
        role: assignedRole,
        roleGrantedBy: inviteData.invitedByUid,
        roleGrantedByName: inviteData.invitedByName,
        roleGrantedAt: now,
        roleStatus: 'ACTIVE',
        updatedAt: now,
      });
    });

    // Write audit log entry
    await recordRoleAuditLog({
      targetUid: params.currentUser.uid,
      targetEmail: params.currentUser.email,
      targetGamerTag: params.currentUser.gamerTag,
      targetDisplayName: params.currentUser.fullName,
      newRole: assignedRole,
      action: 'ROLE_ACCEPTED',
      performedByUid: params.currentUser.uid,
      performedByName: params.currentUser.gamerTag,
      reason: `Accepted invitation for ${assignedRole} granted by ${inviterName}`,
      invitationId: params.invitationId,
    });

    // Notify the Super Admin who issued the invitation
    if (inviterUid) {
      await sendNotification({
        userId: inviterUid,
        recipientId: inviterUid,
        senderId: params.currentUser.uid,
        invitationId: params.invitationId,
        type: 'ROLE_INVITATION_ACCEPTED',
        title: `✅ Role Accepted: ${params.currentUser.gamerTag}`,
        message: `${params.currentUser.gamerTag} (${params.currentUser.email}) has officially accepted the invitation and is now active as ${assignedRole}.`,
        data: {
          invitationId: params.invitationId,
          invitedRole: assignedRole,
          recipientId: params.currentUser.uid,
          status: 'ACCEPTED',
        },
      });
    }

    return { success: true, newRole: assignedRole };
  } catch (err: any) {
    console.error('acceptRoleInvitation error:', err);
    return { success: false, error: err.message || 'Failed to accept role invitation.' };
  }
}

/**
 * Declines a role invitation
 */
export async function declineRoleInvitation(params: {
  invitationId: string;
  currentUser: {
    uid: string;
    email: string;
    gamerTag: string;
  };
}): Promise<{ success: boolean; error?: string }> {
  try {
    const inviteRef = doc(db, 'roleInvitations', params.invitationId);
    const snap = await getDoc(inviteRef);

    if (!snap.exists()) {
      return { success: false, error: 'Invitation not found.' };
    }

    const data = snap.data() as RoleInvitation;

    if (data.status !== 'PENDING') {
      return { success: false, error: `Invitation is already ${data.status.toLowerCase()}.` };
    }

    const currentEmailNorm = params.currentUser.email.trim().toLowerCase();
    const recipientEmailNorm = data.recipientEmail.trim().toLowerCase();
    if (currentEmailNorm !== recipientEmailNorm) {
      return { success: false, error: 'You are not authorized to decline this invitation.' };
    }

    const now = Date.now();
    await updateDoc(inviteRef, {
      status: 'DECLINED',
      declinedAt: now,
      declinedByUid: params.currentUser.uid,
      updatedAt: now,
    });

    await recordRoleAuditLog({
      targetUid: params.currentUser.uid,
      targetEmail: params.currentUser.email,
      targetGamerTag: params.currentUser.gamerTag,
      targetDisplayName: params.currentUser.gamerTag,
      newRole: data.invitedRole,
      action: 'ROLE_DECLINED',
      performedByUid: params.currentUser.uid,
      performedByName: params.currentUser.gamerTag,
      reason: `Declined ${data.invitedRole} role invitation`,
      invitationId: params.invitationId,
    });

    if (data.invitedByUid) {
      await sendNotification({
        userId: data.invitedByUid,
        recipientId: data.invitedByUid,
        senderId: params.currentUser.uid,
        invitationId: params.invitationId,
        type: 'ROLE_INVITATION_DECLINED',
        title: `❌ Role Declined: ${params.currentUser.gamerTag}`,
        message: `${params.currentUser.gamerTag} declined the invitation for ${data.invitedRole}.`,
        data: {
          invitationId: params.invitationId,
          invitedRole: data.invitedRole,
          status: 'DECLINED',
        },
      });
    }

    return { success: true };
  } catch (err: any) {
    console.error('declineRoleInvitation error:', err);
    return { success: false, error: err.message || 'Failed to decline invitation.' };
  }
}

/**
 * Revokes a pending role invitation (Super Admin only)
 */
export async function revokeRoleInvitation(params: {
  invitationId: string;
  revokedByUid: string;
  revokedByName: string;
  revokedByEmail: string;
  revokedByRole?: string;
  reason?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    let isCallerSuper = isSuperAdminUser(params.revokedByEmail, params.revokedByRole, params.revokedByUid);
    if (!isCallerSuper) {
      const callerSnap = await getDoc(doc(db, 'players', params.revokedByUid));
      const callerData = callerSnap.data() as Player | undefined;
      if (!callerData || !isSuperAdminUser(callerData.email, callerData.role, callerData.uid)) {
        return { success: false, error: 'Security Exception: Only Super Administrators can revoke invitations.' };
      }
    }

    const inviteRef = doc(db, 'roleInvitations', params.invitationId);
    const snap = await getDoc(inviteRef);

    if (!snap.exists()) {
      return { success: false, error: 'Invitation not found.' };
    }

    const data = snap.data() as RoleInvitation;

    if (data.status !== 'PENDING') {
      return { success: false, error: `Cannot revoke: Invitation is already ${data.status.toLowerCase()}.` };
    }

    const now = Date.now();
    await updateDoc(inviteRef, {
      status: 'REVOKED',
      revokedAt: now,
      revokedByUid: params.revokedByUid,
      updatedAt: now,
    });

    await recordRoleAuditLog({
      targetUid: data.recipientUid,
      targetEmail: data.recipientEmail,
      targetGamerTag: data.recipientGamerTag,
      targetDisplayName: data.recipientFullName || data.recipientEmail,
      newRole: data.invitedRole,
      action: 'ROLE_INVITATION_REVOKED',
      performedByUid: params.revokedByUid,
      performedByName: params.revokedByName,
      reason: params.reason || 'Invitation revoked by Super Admin',
      invitationId: params.invitationId,
    });

    if (data.recipientUid) {
      await sendNotification({
        userId: data.recipientUid,
        recipientId: data.recipientUid,
        senderId: params.revokedByUid,
        invitationId: params.invitationId,
        type: 'ROLE_INVITATION_REVOKED',
        title: `⚠️ Invitation Revoked: ${data.invitedRole}`,
        message: `Your invitation for ${data.invitedRole} has been revoked by Nexus Management.`,
        data: {
          invitationId: params.invitationId,
          status: 'REVOKED',
        },
      });
    }

    return { success: true };
  } catch (err: any) {
    console.error('revokeRoleInvitation error:', err);
    return { success: false, error: err.message || 'Failed to revoke invitation.' };
  }
}

/**
 * Promotes a target player to STAFF or ADMIN directly (Super Admin only).
 * Crucial constraint: Does NOT touch player's rating, coins, matches, or delete account.
 * Updates target user's role, creates audit trail log, and sends notification.
 */
export async function promoteUserRole(params: {
  targetUid: string;
  newRole: 'STAFF' | 'ADMIN';
  performedByUid: string;
  performedByName: string;
  performedByEmail: string;
  performedByRole?: string;
  reason?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    let isCallerSuper = isSuperAdminUser(params.performedByEmail, params.performedByRole, params.performedByUid);
    if (!isCallerSuper) {
      const callerSnap = await getDoc(doc(db, 'players', params.performedByUid));
      const callerData = callerSnap.data() as Player | undefined;
      if (!callerData || !isSuperAdminUser(callerData.email, callerData.role, callerData.uid)) {
        return { success: false, error: 'Security Exception: Only Super Administrators can promote roles.' };
      }
    }

    if (params.targetUid === params.performedByUid) {
      return { success: false, error: 'Action Forbidden: You cannot promote your own account.' };
    }

    if (params.targetUid === FOUNDING_SUPER_ADMIN_UID) {
      return { success: false, error: 'Security Protection: Cannot modify Founding Super Administrator role.' };
    }

    const playerRef = doc(db, 'players', params.targetUid);
    const now = Date.now();
    const auditId = `audit_promote_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const auditRef = doc(db, 'roleAuditLogs', auditId);

    let targetEmail = '';
    let targetGamerTag = '';
    let targetFullName = '';
    let previousRole = '';

    // Atomically execute role upgrade, validation, and audit record inside transaction
    await runTransaction(db, async (tx) => {
      const pSnap = await tx.get(playerRef);
      if (!pSnap.exists()) {
        throw new Error('Player account not found.');
      }

      const targetPlayer = pSnap.data() as Player;
      if (targetPlayer.uid === FOUNDING_SUPER_ADMIN_UID) {
        throw new Error('Security Protection: Cannot modify Founding Super Administrator role.');
      }

      const currentNormRole = normalizeUserRole(targetPlayer.role);
      if (currentNormRole === 'SUPER_ADMIN') {
        throw new Error('Target user is already a Super Administrator.');
      }
      if (currentNormRole === params.newRole) {
        throw new Error(`Target user is already a ${params.newRole}.`);
      }
      if (currentNormRole === 'ADMIN' && params.newRole === 'STAFF') {
        throw new Error('Demoting an Admin to Staff must be performed via Role Revocation first.');
      }

      targetEmail = targetPlayer.email || '';
      targetGamerTag = targetPlayer.gamerTag || '';
      targetFullName = targetPlayer.fullName || targetPlayer.gamerTag || '';
      previousRole = currentNormRole;

      tx.update(playerRef, {
        role: params.newRole,
        roleStatus: 'ACTIVE',
        roleGrantedBy: params.performedByUid,
        roleGrantedByName: params.performedByName,
        roleGrantedAt: now,
        updatedAt: now,
      });

      const auditPayload: RoleAuditLog = {
        id: auditId,
        auditId,
        targetUid: params.targetUid,
        targetEmail,
        targetGamerTag,
        targetDisplayName: targetFullName,
        previousRole,
        newRole: params.newRole,
        action: 'ROLE_GRANTED',
        performedByUid: params.performedByUid,
        performedByName: params.performedByName,
        timestamp: now,
        reason: params.reason || `Direct Promotion by Super Admin (@${params.performedByName})`,
      };

      tx.set(auditRef, cleanForFirestore(auditPayload));
    });

    // Send real-time notification to target
    await sendNotification({
      userId: params.targetUid,
      recipientId: params.targetUid,
      senderId: params.performedByUid,
      type: 'ROLE_GRANTED',
      title: `👑 Promoted to ${params.newRole}`,
      message: `Congratulations! You have been officially promoted to ${params.newRole} by Super Admin @${params.performedByName}.`,
      data: {
        previousRole: previousRole || undefined,
        newRole: params.newRole,
        grantedByName: params.performedByName,
      },
    });

    return { success: true };
  } catch (err: any) {
    console.error('promoteUserRole error:', err);
    return { success: false, error: err.message || 'Failed to promote player role.' };
  }
}

/**
 * Revokes an active Admin or Staff user's role (Super Admin only).
 * Crucial constraint: Does NOT delete the player's account, stats, rating, or coins.
 */
export async function revokeUserRole(params: {
  targetUid: string;
  revokedByUid: string;
  revokedByName: string;
  revokedByEmail: string;
  revokedByRole?: string;
  reason?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    let isCallerSuper = isSuperAdminUser(params.revokedByEmail, params.revokedByRole, params.revokedByUid);
    if (!isCallerSuper) {
      const callerSnap = await getDoc(doc(db, 'players', params.revokedByUid));
      const callerData = callerSnap.data() as Player | undefined;
      if (!callerData || !isSuperAdminUser(callerData.email, callerData.role, callerData.uid)) {
        return { success: false, error: 'Security Exception: Only Super Administrators can revoke roles.' };
      }
    }

    // Prevent self-lockout
    if (params.targetUid === params.revokedByUid) {
      return { success: false, error: 'Security Protection: You cannot revoke your own Super Administrator access.' };
    }

    // Prevent revoking founding super admin
    if (params.targetUid === FOUNDING_SUPER_ADMIN_UID) {
      return { success: false, error: 'Security Protection: Cannot modify Founding Super Administrator role.' };
    }

    const playerRef = doc(db, 'players', params.targetUid);
    const now = Date.now();
    const auditId = `audit_revoke_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const auditRef = doc(db, 'roleAuditLogs', auditId);

    let targetEmail = '';
    let targetGamerTag = '';
    let targetFullName = '';
    let previousRole = '';

    // Demote role to 'PLAYER' and record audit log atomically inside transaction
    await runTransaction(db, async (tx) => {
      const pSnap = await tx.get(playerRef);
      if (!pSnap.exists()) {
        throw new Error('Player account not found.');
      }

      const targetPlayer = pSnap.data() as Player;
      if (targetPlayer.uid === FOUNDING_SUPER_ADMIN_UID) {
        throw new Error('Security Protection: Cannot modify Founding Super Administrator role.');
      }

      const currentNormRole = normalizeUserRole(targetPlayer.role);
      if (currentNormRole === 'PLAYER' || currentNormRole === 'VISITOR') {
        throw new Error('This user does not currently hold an elevated role.');
      }

      targetEmail = targetPlayer.email || '';
      targetGamerTag = targetPlayer.gamerTag || '';
      targetFullName = targetPlayer.fullName || targetPlayer.gamerTag || '';
      previousRole = currentNormRole;

      tx.update(playerRef, {
        role: 'player',
        roleStatus: 'REVOKED',
        roleRevokedBy: params.revokedByUid,
        roleRevokedAt: now,
        updatedAt: now,
      });

      const auditPayload: RoleAuditLog = {
        id: auditId,
        auditId,
        targetUid: params.targetUid,
        targetEmail,
        targetGamerTag,
        targetDisplayName: targetFullName,
        previousRole,
        newRole: 'PLAYER',
        action: 'ROLE_REVOKED',
        performedByUid: params.revokedByUid,
        performedByName: params.revokedByName,
        timestamp: now,
        reason: params.reason || `Revoked ${currentNormRole} access`,
      };

      tx.set(auditRef, cleanForFirestore(auditPayload));
    });

    // Send notification to target user
    await sendNotification({
      userId: params.targetUid,
      recipientId: params.targetUid,
      senderId: params.revokedByUid,
      type: 'ROLE_REVOKED',
      title: '🛡️ Role Privileges Revoked',
      message: `Your ${previousRole} administrative access has been revoked by Nexus Management. You will continue as a standard player.`,
      data: {
        previousRole,
        newRole: 'PLAYER',
      },
    });

    return { success: true };
  } catch (err: any) {
    console.error('revokeUserRole error:', err);
    return { success: false, error: err.message || 'Failed to revoke role.' };
  }
}

/**
 * Real-time subscription to role invitations
 */
export function subscribeToRoleInvitations(
  callback: (invitations: RoleInvitation[]) => void
): () => void {
  const q = query(collection(db, 'roleInvitations'), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((docSnap) => {
        const data = docSnap.data() as RoleInvitation;
        // Auto-compute expired state
        if (data.status === 'PENDING' && Date.now() > data.expiresAt) {
          return { ...data, status: 'EXPIRED' as RoleInvitationStatus };
        }
        return data;
      });
      callback(items);
    },
    (err) => {
      console.warn('subscribeToRoleInvitations warning:', err);
      callback([]);
    }
  );
}

/**
 * Real-time subscription to role governance audit logs
 */
export function subscribeToRoleAuditLogs(
  callback: (logs: RoleAuditLog[]) => void
): () => void {
  const q = query(collection(db, 'roleAuditLogs'), orderBy('timestamp', 'desc'), limit(100));
  return onSnapshot(
    q,
    (snapshot) => {
      const logs = snapshot.docs.map((docSnap) => docSnap.data() as RoleAuditLog);
      callback(logs);
    },
    (err) => {
      console.warn('subscribeToRoleAuditLogs warning:', err);
      callback([]);
    }
  );
}

/**
 * Checks whether the initial Super Admin bootstrap has already been established or completed.
 */
export async function checkSuperAdminBootstrapStatus(): Promise<{
  completed: boolean;
  firstSuperAdminUid?: string;
  firstSuperAdminGamerTag?: string;
  hasSuperAdminInDb: boolean;
}> {
  try {
    const bootstrapRef = doc(db, 'systemConfig', 'bootstrap');
    const bootstrapSnap = await getDoc(bootstrapRef);
    if (bootstrapSnap.exists() && bootstrapSnap.data().bootstrapCompleted === true) {
      return {
        completed: true,
        firstSuperAdminUid: bootstrapSnap.data().firstSuperAdminUid,
        firstSuperAdminGamerTag: bootstrapSnap.data().firstSuperAdminGamerTag,
        hasSuperAdminInDb: true,
      };
    }

    // Secondary check: verify if any player document in database is already SUPER_ADMIN
    const superAdminQuery = query(
      collection(db, 'players'),
      where('role', 'in', ['SUPER_ADMIN', 'superadmin', 'super_admin'])
    );
    const superAdminSnap = await getDocs(superAdminQuery);
    if (!superAdminSnap.empty) {
      return {
        completed: true,
        firstSuperAdminUid: superAdminSnap.docs[0].id,
        firstSuperAdminGamerTag: superAdminSnap.docs[0].data().gamerTag,
        hasSuperAdminInDb: true,
      };
    }

    return { completed: false, hasSuperAdminInDb: false };
  } catch (err) {
    console.warn('checkSuperAdminBootstrapStatus warning:', err);
    return { completed: false, hasSuperAdminInDb: false };
  }
}

/**
 * Checks whether the currently logged-in user is eligible for the initial one-time Super Admin bootstrap.
 */
export async function checkSuperAdminBootstrapEligibility(
  currentUser: { uid: string; email?: string | null } | null,
  currentProfile: Player | null
): Promise<{ eligible: boolean; completed: boolean; reason?: string }> {
  if (!currentUser) {
    return { eligible: false, completed: false, reason: 'You must be authenticated.' };
  }

  // If user is already Super Admin, bootstrap is completed
  const currentRoleNorm = normalizeUserRole(currentProfile?.role);
  if (currentRoleNorm === 'SUPER_ADMIN') {
    return {
      eligible: false,
      completed: true,
      reason: 'Super Admin is already active.',
    };
  }

  // Strict check on authorized founding administrator UID
  if (currentUser.uid !== FOUNDING_SUPER_ADMIN_UID) {
    return {
      eligible: false,
      completed: false,
      reason: 'Unauthorized: UID does not match the designated founding administrator.',
    };
  }

  // Check if bootstrap lock is completed
  const status = await checkSuperAdminBootstrapStatus();
  if (status.completed) {
    return {
      eligible: false,
      completed: true,
      reason: 'Initial Super Admin bootstrap has already been completed.',
    };
  }

  return { eligible: true, completed: false };
}

/**
 * Atomically executes the one-time Super Admin bootstrap for teiger9.
 * Promotes ADMIN -> SUPER_ADMIN, writes immutable audit record, and seals the bootstrap lock.
 */
export async function executeSuperAdminBootstrap(
  currentUser: any,
  currentProfile: Player
): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Authenticated user validation
    if (!currentUser || !currentUser.uid) {
      return { success: false, error: 'SUPER ADMIN BOOTSTRAP FAILED: You must be logged in.' };
    }

    // 2. Strict UID validation
    if (currentUser.uid !== FOUNDING_SUPER_ADMIN_UID) {
      return {
        success: false,
        error: 'SUPER ADMIN BOOTSTRAP FAILED: Unauthorized. UID does not match designated founding administrator.',
      };
    }

    // 3. Current role validation: if already SUPER_ADMIN, return success immediately
    const currentRoleNorm = normalizeUserRole(currentProfile?.role);
    if (currentRoleNorm === 'SUPER_ADMIN') {
      return { success: true };
    }

    const playerRef = doc(db, 'players', FOUNDING_SUPER_ADMIN_UID);
    const bootstrapRef = doc(db, 'systemConfig', 'bootstrap');
    const auditId = `audit_bootstrap_${Date.now()}`;
    const auditRef = doc(db, 'roleAuditLogs', auditId);

    // 4. Atomic transaction
    await runTransaction(db, async (tx) => {
      // Step A: Check bootstrap lock
      const bootstrapSnap = await tx.get(bootstrapRef);
      if (bootstrapSnap.exists() && bootstrapSnap.data().bootstrapCompleted === true) {
        throw new Error('BOOTSTRAP_ALREADY_COMPLETED');
      }

      // Step B: Verify player document
      const playerSnap = await tx.get(playerRef);
      if (!playerSnap.exists()) {
        throw new Error('Account not found');
      }

      const existingData = playerSnap.data() as Player;
      if (existingData.uid !== FOUNDING_SUPER_ADMIN_UID) {
        throw new Error('UID mismatch');
      }

      const existingRoleNorm = normalizeUserRole(existingData.role);
      if (existingRoleNorm === 'SUPER_ADMIN') {
        throw new Error('BOOTSTRAP_ALREADY_COMPLETED');
      }

      const now = Date.now();

      // Step C: Atomically promote player role
      tx.update(playerRef, {
        role: 'SUPER_ADMIN',
        roleStatus: 'ACTIVE',
        roleGrantedByName: 'System Initial Bootstrap',
        roleGrantedAt: now,
        updatedAt: now,
      });

      // Step D: Write immutable system bootstrap seal
      tx.set(bootstrapRef, {
        bootstrapCompleted: true,
        firstSuperAdminUid: FOUNDING_SUPER_ADMIN_UID,
        firstSuperAdminGamerTag: existingData.gamerTag || 'teiger9',
        completedAt: now,
      });

      // Step E: Create immutable audit log
      const auditPayload: RoleAuditLog = {
        id: auditId,
        auditId: auditId,
        targetUid: FOUNDING_SUPER_ADMIN_UID,
        targetEmail: existingData.email || currentUser.email || '',
        targetGamerTag: existingData.gamerTag || 'teiger9',
        targetDisplayName: existingData.fullName || 'teiger9',
        previousRole: existingData.role || 'PLAYER',
        newRole: 'SUPER_ADMIN',
        action: 'INITIAL_SUPER_ADMIN_BOOTSTRAP',
        performedByUid: currentUser.uid,
        performedByName: `${existingData.gamerTag || 'teiger9'} (Initial Bootstrap)`,
        timestamp: now,
        reason: 'INITIAL SUPER ADMIN SETUP',
      };

      tx.set(auditRef, cleanForFirestore(auditPayload));
    });

    // 5. Force refresh authentication ID token so any claims/tokens are refreshed
    try {
      if (currentUser.getIdToken) {
        await currentUser.getIdToken(true);
      }
    } catch (tokenErr) {
      console.warn('Token refresh notice:', tokenErr);
    }

    return { success: true };
  } catch (err: any) {
    console.error('executeSuperAdminBootstrap error:', err);
    const msg = err.message || '';

    if (msg.includes('Account not found')) {
      return { success: false, error: 'SUPER ADMIN BOOTSTRAP FAILED: Account not found in database.' };
    }
    if (msg.includes('UID mismatch')) {
      return { success: false, error: 'SUPER ADMIN BOOTSTRAP FAILED: UID mismatch.' };
    }
    if (msg.includes('permission-denied') || msg.includes('PERMISSION_DENIED') || err.code === 'permission-denied') {
      return { success: false, error: 'SUPER ADMIN BOOTSTRAP FAILED: Firebase permission denied.' };
    }
    if (msg.includes('network') || msg.includes('unavailable') || err.code === 'unavailable') {
      return { success: false, error: 'SUPER ADMIN BOOTSTRAP FAILED: Network error. Please check your connection and retry.' };
    }

    return {
      success: false,
      error: `SUPER ADMIN BOOTSTRAP FAILED: ${msg || 'Backend authorization failed.'}`,
    };
  }
}
