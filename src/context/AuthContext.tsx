import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import {
  User,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  onAuthStateChanged,
  updateProfile,
  sendPasswordResetEmail,
  verifyPasswordResetCode,
  confirmPasswordReset,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  onSnapshot,
  limit,
  updateDoc,
} from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { Player, UserRole, NexusPermissions } from '../types';
import { INITIAL_RATING } from '../lib/elo';
import { ensureInitialGamesSeeded } from '../lib/seedGames';
import {
  isSuperAdminUser,
  isAdminUser,
  isStaffUser,
  getRolePermissions,
  normalizeUserRole,
  recordRoleAuditLog,
  FOUNDING_SUPER_ADMIN_UID,
} from '../services/roleService';
import {
  normalizeGamerTag,
  normalizePhoneNumber,
  validateEmail,
  validatePassword,
  cleanForFirestore,
} from '../utils/firestoreSanitizer';
import {
  isUsernameAvailable,
  createPlayerProfileAtomically,
  lookupEmailForLogin,
  syncLegacyUsernameIndex,
} from '../services/authAccountService';

export interface AuthContextType {
  user: User | null;
  playerProfile: Player | null;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'STAFF' | 'PLAYER' | 'VISITOR';
  isSuperAdmin: boolean;
  isAdmin: boolean;
  isStaff: boolean;
  permissions: NexusPermissions;
  loading: boolean;
  profileMissing: boolean;
  isAccountSuspended: boolean;
  accountStatusReason: string;
  hasAdminInSystem: boolean;
  registerPlayer: (params: {
    fullName: string;
    gamerTag: string;
    email: string;
    phoneNumber?: string;
    password: string;
    confirmPassword?: string;
  }) => Promise<{ success: boolean; error?: string; isEmailInUse?: boolean }>;
  loginPlayer: (emailOrGamerTag: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  claimFirstAdmin: () => Promise<{ success: boolean; error?: string }>;
  refreshProfile: () => Promise<void>;
  completeMissingProfile: (params: {
    fullName: string;
    gamerTag: string;
    phoneNumber?: string;
  }) => Promise<{ success: boolean; error?: string }>;
  sendPasswordReset: (email: string) => Promise<{
    success: boolean;
    message: string;
    isRateLimited?: boolean;
    isNetworkError?: boolean;
  }>;
  verifyResetCode: (actionCode: string) => Promise<{
    success: boolean;
    email?: string;
    error?: string;
  }>;
  completePasswordReset: (actionCode: string, newPassword: string) => Promise<{
    success: boolean;
    error?: string;
    isInvalidCode?: boolean;
  }>;
  changeCurrentPassword: (currentPassword: string, newPassword: string) => Promise<{
    success: boolean;
    error?: string;
    requiresRecentLogin?: boolean;
  }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [playerProfile, setPlayerProfile] = useState<Player | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [profileMissing, setProfileMissing] = useState<boolean>(false);
  const [hasAdminInSystem, setHasAdminInSystem] = useState<boolean>(true);

  // In-flight locks to guarantee idempotency and prevent double-clicks
  const isRegisteringRef = useRef<boolean>(false);
  const isLoggingInRef = useRef<boolean>(false);

  // Check if at least one admin exists in the system
  const checkAdminExistence = async () => {
    try {
      const q = query(
        collection(db, 'players'),
        where('role', 'in', ['SUPER_ADMIN', 'ADMIN', 'admin', 'superadmin', 'STAFF', 'staff']),
        limit(1)
      );
      const snap = await getDocs(q);
      setHasAdminInSystem(!snap.empty);
    } catch (err) {
      console.warn('Admin check warning:', err);
    }
  };

  useEffect(() => {
    // Seed initial games if not present
    ensureInitialGamesSeeded();
    checkAdminExistence();
  }, []);

  // Primary Auth State & Real-time Profile Listener
  useEffect(() => {
    let unsubscribeDoc: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);

      // Clean up previous profile listener if any
      if (unsubscribeDoc) {
        unsubscribeDoc();
        unsubscribeDoc = null;
      }

      if (currentUser) {
        const playerRef = doc(db, 'players', currentUser.uid);

        // Subscribe in real-time to the current player's document
        unsubscribeDoc = onSnapshot(
          playerRef,
          (docSnap) => {
            if (docSnap.exists()) {
              const pData = docSnap.data() as Player;

              // Update last login timestamp once per session
              if (!pData.lastLoginAt || Date.now() - pData.lastLoginAt > 120000) {
                updateDoc(playerRef, { lastLoginAt: Date.now() }).catch(() => {});
              }

              setPlayerProfile(pData);
              setProfileMissing(false);
              // Background sync legacy username index
              syncLegacyUsernameIndex(pData);
            } else {
              // Firebase Auth user exists, but Firestore profile is missing
              setPlayerProfile(null);
              setProfileMissing(true);
            }
            setLoading(false);
          },
          (err) => {
            console.error('Player profile snapshot error:', err);
            setLoading(false);
          }
        );
      } else {
        setPlayerProfile(null);
        setProfileMissing(false);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeDoc) {
        unsubscribeDoc();
      }
    };
  }, []);

  /**
   * Safe, Atomic Player Registration
   */
  const registerPlayer = async ({
    fullName,
    gamerTag,
    email,
    phoneNumber,
    password,
    confirmPassword,
  }: {
    fullName: string;
    gamerTag: string;
    email: string;
    phoneNumber?: string;
    password: string;
    confirmPassword?: string;
  }): Promise<{ success: boolean; error?: string; isEmailInUse?: boolean }> => {
    // 1. Prevent concurrent double-clicks
    if (isRegisteringRef.current) {
      return { success: false, error: 'Registration is already in progress. Please wait...' };
    }

    // 2. Strict client-side validation BEFORE touching Firebase Auth
    const trimmedFullName = (fullName || '').trim();
    if (!trimmedFullName || trimmedFullName.length < 2) {
      return { success: false, error: 'Full name must be at least 2 characters long.' };
    }

    const tagCheck = normalizeGamerTag(gamerTag);
    if (!tagCheck.isValid) {
      return { success: false, error: tagCheck.error };
    }

    const emailCheck = validateEmail(email);
    if (!emailCheck.isValid) {
      return { success: false, error: emailCheck.error };
    }

    const phoneCheck = normalizePhoneNumber(phoneNumber);
    if (!phoneCheck.isValid) {
      return { success: false, error: phoneCheck.error };
    }

    const passCheck = validatePassword(password);
    if (!passCheck.isValid) {
      return { success: false, error: passCheck.error };
    }

    if (confirmPassword !== undefined && password !== confirmPassword) {
      return { success: false, error: 'Passwords do not match. Please verify both password fields.' };
    }

    isRegisteringRef.current = true;

    try {
      // 3. Atomic pre-check for username availability
      const availability = await isUsernameAvailable(tagCheck.displayTag);
      if (!availability.available) {
        return { success: false, error: availability.reason || 'This username is already taken.' };
      }

      // 4. Create Firebase Auth user
      const userCred = await createUserWithEmailAndPassword(auth, emailCheck.normalized, password);
      const uid = userCred.user.uid;

      // 5. Update Firebase Auth displayName
      try {
        await updateProfile(userCred.user, { displayName: tagCheck.displayTag });
      } catch (profileErr) {
        console.warn('Auth updateProfile warning:', profileErr);
      }

      // 6. Build default Player profile object (Never allow 'admin' role on registration)
      const initialRole: UserRole = 'player';
      const newPlayer: Player = {
        uid,
        email: emailCheck.normalized,
        fullName: trimmedFullName,
        gamerTag: tagCheck.displayTag,
        gamerTagLower: tagCheck.normalizedTag,
        phoneNumber: phoneCheck.formatted,
        role: initialRole,
        status: 'ACTIVE',
        createdAt: Date.now(),
        totalGames: 0,
        totalWins: 0,
        totalLosses: 0,
        totalDraws: 0,
        overallRating: INITIAL_RATING,
        nexusCoins: 0,
        totalCoinsEarned: 0,
        totalCoinsRedeemed: 0,
      };

      // 7. Atomically write profile & claim username
      const creationResult = await createPlayerProfileAtomically(newPlayer);
      if (!creationResult.success) {
        // If atomic profile creation threw an error, flag profileMissing for automatic recovery
        setProfileMissing(true);
        return {
          success: false,
          error: creationResult.error || 'Account created, but profile setup was interrupted. Please finish setup.',
        };
      }

      setPlayerProfile(newPlayer);
      setProfileMissing(false);
      await checkAdminExistence();

      return { success: true };
    } catch (err: any) {
      const code = (err.code || '').toLowerCase();
      const rawMsg = (err.message || '').toLowerCase();

      let message = 'Failed to create your Nexus account.';
      let isEmailInUse = false;

      if (code === 'auth/email-already-in-use' || rawMsg.includes('email-already-in-use')) {
        message = 'This email address is already registered. Please sign in instead or reset your password.';
        isEmailInUse = true;
        console.warn('Registration: email address is already registered in Firebase Auth:', emailCheck.normalized);
      } else if (code === 'auth/invalid-email' || rawMsg.includes('invalid-email')) {
        message = 'Please provide a valid email address.';
        console.warn('Registration: invalid email format');
      } else if (code === 'auth/weak-password' || rawMsg.includes('weak-password')) {
        message = 'Password is too weak. Please use at least 6 characters with letters and numbers.';
        console.warn('Registration: weak password');
      } else if (code === 'auth/network-request-failed' || rawMsg.includes('network-request-failed')) {
        message = 'Connection problem. Please check your internet connection and try again.';
        console.warn('Registration: network failure');
      } else {
        console.error('Registration unexpected error:', err);
        if (err.message) {
          message = err.message;
        }
      }
      return { success: false, error: message, isEmailInUse };
    } finally {
      isRegisteringRef.current = false;
    }
  };

  /**
   * Safe, Resilient Login
   */
  const loginPlayer = async (
    emailOrGamerTag: string,
    password: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (isLoggingInRef.current) {
      return { success: false, error: 'Login in progress. Please wait...' };
    }

    const trimmedInput = (emailOrGamerTag || '').trim();
    if (!trimmedInput) {
      return { success: false, error: 'Please enter your email or GamerTag.' };
    }
    if (!password) {
      return { success: false, error: 'Please enter your password.' };
    }

    isLoggingInRef.current = true;

    try {
      let targetEmail = trimmedInput;

      // If user typed a GamerTag instead of an email, resolve it
      if (!trimmedInput.includes('@')) {
        const resolved = await lookupEmailForLogin(trimmedInput);
        if (!resolved) {
          return {
            success: false,
            error: 'No account found with this GamerTag. Please check your spelling or use your email.',
          };
        }
        targetEmail = resolved;
      }

      const userCred = await signInWithEmailAndPassword(auth, targetEmail.toLowerCase(), password);

      // Verify account has not been permanently removed
      const [playerSnap, tombstoneSnap] = await Promise.all([
        getDoc(doc(db, 'players', userCred.user.uid)),
        getDoc(doc(db, 'deletedAuthAccounts', userCred.user.uid)),
      ]);

      if (tombstoneSnap.exists() || !playerSnap.exists()) {
        await fbSignOut(auth);
        return {
          success: false,
          error: 'This player account has been permanently removed by an Administrator.',
        };
      }

      await checkAdminExistence();
      return { success: true };
    } catch (err: any) {
      console.warn('Login attempt failed:', err?.code || err?.message);
      let message = 'Incorrect email or password. Please verify your credentials.';
      const code = (err.code || '').toLowerCase();
      const rawMsg = (err.message || '').toLowerCase();

      if (
        code.includes('invalid-credential') ||
        code.includes('user-not-found') ||
        code.includes('wrong-password') ||
        rawMsg.includes('invalid-credential') ||
        rawMsg.includes('user-not-found') ||
        rawMsg.includes('wrong-password')
      ) {
        message = 'Incorrect email or password. Please verify your credentials.';
      } else if (code.includes('user-disabled')) {
        message = 'This account has been disabled. Please contact Nexus Gaming Center administration.';
      } else if (code.includes('too-many-requests')) {
        message = 'Too many failed login attempts. Please wait a few moments before trying again.';
      } else if (code.includes('network-request-failed')) {
        message = 'Network connection problem. Please verify your internet connection.';
      } else if (err.message) {
        message = err.message;
      }

      return { success: false, error: message };
    } finally {
      isLoggingInRef.current = false;
    }
  };

  /**
   * Complete Missing Profile (Idempotent Recovery for partial registration interruptions)
   */
  const completeMissingProfile = async ({
    fullName,
    gamerTag,
    phoneNumber,
  }: {
    fullName: string;
    gamerTag: string;
    phoneNumber?: string;
  }): Promise<{ success: boolean; error?: string }> => {
    if (!auth.currentUser) {
      return { success: false, error: 'No active session found. Please sign in first.' };
    }

    const currentUid = auth.currentUser.uid;
    const currentEmail = auth.currentUser.email || '';

    const trimmedFullName = (fullName || '').trim();
    if (!trimmedFullName || trimmedFullName.length < 2) {
      return { success: false, error: 'Full name must be at least 2 characters long.' };
    }

    const tagCheck = normalizeGamerTag(gamerTag);
    if (!tagCheck.isValid) {
      return { success: false, error: tagCheck.error };
    }

    const phoneCheck = normalizePhoneNumber(phoneNumber);
    if (!phoneCheck.isValid) {
      return { success: false, error: phoneCheck.error };
    }

    try {
      // Check if username is available (excluding currentUid if already registered)
      const availability = await isUsernameAvailable(tagCheck.displayTag, currentUid);
      if (!availability.available) {
        return { success: false, error: availability.reason };
      }

      const recoveredProfile: Player = {
        uid: currentUid,
        email: currentEmail.toLowerCase(),
        fullName: trimmedFullName,
        gamerTag: tagCheck.displayTag,
        gamerTagLower: tagCheck.normalizedTag,
        phoneNumber: phoneCheck.formatted,
        role: 'player',
        status: 'ACTIVE',
        createdAt: Date.now(),
        totalGames: 0,
        totalWins: 0,
        totalLosses: 0,
        totalDraws: 0,
        overallRating: INITIAL_RATING,
        nexusCoins: 0,
        totalCoinsEarned: 0,
        totalCoinsRedeemed: 0,
      };

      const result = await createPlayerProfileAtomically(recoveredProfile);
      if (!result.success) {
        return result;
      }

      setPlayerProfile(recoveredProfile);
      setProfileMissing(false);
      return { success: true };
    } catch (err: any) {
      console.error('Complete missing profile error:', err);
      return { success: false, error: err.message || 'Failed to finish profile setup.' };
    }
  };

  /**
   * Password Reset (Step 1: Send link to email)
   * Adheres strictly to security rule: neutral message regardless of whether user exists
   * Operates strictly on existing Firebase Auth account - never creates profiles or resets stats
   */
  const sendPasswordReset = async (
    email: string
  ): Promise<{
    success: boolean;
    message: string;
    isRateLimited?: boolean;
    isNetworkError?: boolean;
  }> => {
    const trimmed = (email || '').trim().toLowerCase();
    const emailCheck = validateEmail(trimmed);
    if (!emailCheck.isValid) {
      return { success: false, message: emailCheck.error || 'Please enter a valid email address.' };
    }

    try {
      await sendPasswordResetEmail(auth, emailCheck.normalized);
      // Neutral message to prevent account enumeration
      return {
        success: true,
        message: 'IF AN ACCOUNT EXISTS FOR THIS EMAIL, A PASSWORD RESET LINK HAS BEEN SENT.',
      };
    } catch (err: any) {
      const code = (err.code || '').toLowerCase();
      const rawMsg = (err.message || '').toLowerCase();

      if (code.includes('too-many-requests') || rawMsg.includes('too-many-requests')) {
        return {
          success: false,
          isRateLimited: true,
          message: 'TOO MANY RESET REQUESTS. PLEASE WAIT A MOMENT AND TRY AGAIN.',
        };
      }
      if (code.includes('network-request-failed') || rawMsg.includes('network')) {
        return {
          success: false,
          isNetworkError: true,
          message: 'CONNECTION PROBLEM. PLEASE CHECK YOUR INTERNET CONNECTION AND TRY AGAIN.',
        };
      }

      // In accordance with security best practices, return the neutral message for non-existing accounts
      return {
        success: true,
        message: 'IF AN ACCOUNT EXISTS FOR THIS EMAIL, A PASSWORD RESET LINK HAS BEEN SENT.',
      };
    }
  };

  /**
   * Verify Reset Code (Step 2: When player opens password reset link)
   * Verifies the oobCode action code and returns associated email without altering any state
   */
  const verifyResetCode = async (
    actionCode: string
  ): Promise<{ success: boolean; email?: string; error?: string }> => {
    try {
      const verifiedEmail = await verifyPasswordResetCode(auth, actionCode);
      return { success: true, email: verifiedEmail };
    } catch (err: any) {
      console.warn('Verify password reset code warning:', err?.code || err?.message);
      return {
        success: false,
        error: 'THIS PASSWORD RESET LINK IS NO LONGER VALID.',
      };
    }
  };

  /**
   * Complete Password Reset (Step 3: Submit new password via oobCode)
   * Confirms password change in Firebase Auth. Never creates a new UID or touches Firestore data.
   */
  const completePasswordReset = async (
    actionCode: string,
    newPassword: string
  ): Promise<{ success: boolean; error?: string; isInvalidCode?: boolean }> => {
    const passVal = validatePassword(newPassword);
    if (!passVal.isValid) {
      return { success: false, error: passVal.error };
    }

    try {
      await confirmPasswordReset(auth, actionCode, newPassword);
      return { success: true };
    } catch (err: any) {
      console.warn('Confirm password reset failed:', err?.code || err?.message);
      const code = (err.code || '').toLowerCase();
      const rawMsg = (err.message || '').toLowerCase();

      if (
        code.includes('expired-action-code') ||
        code.includes('invalid-action-code') ||
        rawMsg.includes('expired') ||
        rawMsg.includes('invalid')
      ) {
        return {
          success: false,
          isInvalidCode: true,
          error: 'THIS PASSWORD RESET LINK IS NO LONGER VALID.',
        };
      }
      if (code.includes('network-request-failed') || rawMsg.includes('network')) {
        return {
          success: false,
          error: 'CONNECTION PROBLEM. PLEASE CHECK YOUR INTERNET CONNECTION AND TRY AGAIN.',
        };
      }
      return {
        success: false,
        error: err.message || 'Failed to reset password. Please try again.',
      };
    }
  };

  /**
   * Change Current Password (For authenticated user inside Account Settings)
   * Re-authenticates with current password, then updates password securely.
   * Preserves UID, profile, and all game stats intact.
   */
  const changeCurrentPassword = async (
    currentPassword: string,
    newPassword: string
  ): Promise<{ success: boolean; error?: string; requiresRecentLogin?: boolean }> => {
    if (!auth.currentUser || !auth.currentUser.email) {
      return { success: false, error: 'You must be logged in to update your password.' };
    }

    const passVal = validatePassword(newPassword);
    if (!passVal.isValid) {
      return { success: false, error: passVal.error };
    }

    try {
      const credential = EmailAuthProvider.credential(auth.currentUser.email, currentPassword);
      await reauthenticateWithCredential(auth.currentUser, credential);
      await updatePassword(auth.currentUser, newPassword);
      return { success: true };
    } catch (err: any) {
      console.warn('Password change failed:', err?.code || err?.message);
      const code = (err.code || '').toLowerCase();
      const rawMsg = (err.message || '').toLowerCase();

      if (
        code.includes('wrong-password') ||
        code.includes('invalid-credential') ||
        rawMsg.includes('wrong-password')
      ) {
        return { success: false, error: 'Current password is incorrect. Please verify and try again.' };
      }
      if (code.includes('requires-recent-login')) {
        return {
          success: false,
          requiresRecentLogin: true,
          error: 'For your security, please sign out and sign back in before changing your password.',
        };
      }
      if (code.includes('network-request-failed') || rawMsg.includes('network')) {
        return {
          success: false,
          error: 'CONNECTION PROBLEM. PLEASE CHECK YOUR INTERNET CONNECTION AND TRY AGAIN.',
        };
      }
      return { success: false, error: err.message || 'Unable to update password. Please try again.' };
    }
  };

  /**
   * Clean Logout
   */
  const logout = async () => {
    try {
      await fbSignOut(auth);
    } catch (err) {
      console.warn('Sign out warning:', err);
    } finally {
      setUser(null);
      setPlayerProfile(null);
      setProfileMissing(false);
    }
  };

  /**
   * First Admin Bootstrap Claim - Disabled as Super Admin is established
   */
  const claimFirstAdmin = async (): Promise<{ success: boolean; error?: string }> => {
    return {
      success: false,
      error: 'Initial administrator setup has already been completed. Direct role claims are permanently disabled.',
    };
  };

  /**
   * Explicit Refresh Profile
   */
  const refreshProfile = async () => {
    if (!user) return;
    try {
      if (user.getIdToken) {
        await user.getIdToken(true);
      }
      const snap = await getDoc(doc(db, 'players', user.uid));
      if (snap.exists()) {
        const data = snap.data() as Player;
        setPlayerProfile(data);
        setProfileMissing(false);
      } else {
        setProfileMissing(true);
      }
    } catch (e) {
      console.error('Refresh profile error:', e);
    }
  };

  const role: 'SUPER_ADMIN' | 'ADMIN' | 'STAFF' | 'PLAYER' | 'VISITOR' = normalizeUserRole(playerProfile?.role);
  const isSuperAdmin = role === 'SUPER_ADMIN';
  const isAdmin = isSuperAdmin || role === 'ADMIN';
  const isStaff = isAdmin || role === 'STAFF';
  const permissions = getRolePermissions(role, user?.email, user?.uid);

  const isAccountSuspended =
    playerProfile?.status === 'SUSPENDED' ||
    playerProfile?.status === 'BANNED' ||
    playerProfile?.status === 'DISABLED';
  const accountStatusReason = playerProfile?.statusReason || 'Your account is suspended. Please contact Nexus desk.';

  return (
    <AuthContext.Provider
      value={{
        user,
        playerProfile,
        role,
        isSuperAdmin,
        isAdmin,
        isStaff,
        permissions,
        loading,
        profileMissing,
        isAccountSuspended,
        accountStatusReason,
        hasAdminInSystem,
        registerPlayer,
        loginPlayer,
        logout,
        claimFirstAdmin,
        refreshProfile,
        completeMissingProfile,
        sendPasswordReset,
        verifyResetCode,
        completePasswordReset,
        changeCurrentPassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
