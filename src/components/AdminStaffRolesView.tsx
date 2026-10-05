import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from './Toast';
import { Player, RoleInvitation, RoleAuditLog } from '../types';
import {
  subscribeToRoleInvitations,
  subscribeToRoleAuditLogs,
  revokeRoleInvitation,
  promoteUserRole,
  revokeUserRole,
  normalizeUserRole,
  isSuperAdminUser,
  isStaffUser,
  checkSuperAdminBootstrapEligibility,
  executeSuperAdminBootstrap,
  FOUNDING_SUPER_ADMIN_UID,
} from '../services/roleService';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { InviteStaffModal } from './InviteStaffModal';
import { StaffProfileModal } from './StaffProfileModal';
import {
  Shield,
  ShieldAlert,
  Users,
  UserCheck,
  UserPlus,
  Search,
  RefreshCw,
  Clock,
  Mail,
  Copy,
  Trash2,
  AlertTriangle,
  Eye,
  Lock,
  FileText,
  Crown,
  X,
  CheckCircle2,
} from 'lucide-react';

type RoleSection =
  | 'SUPER_ADMINS'
  | 'ADMINS'
  | 'STAFF'
  | 'PLAYERS'
  | 'PENDING_INVITATIONS'
  | 'ROLE_HISTORY';

export const AdminStaffRolesView: React.FC = () => {
  const { user, playerProfile, isSuperAdmin, isAdmin, refreshProfile } = useAuth();
  const { showToast } = useToast();

  const isEffectiveSuperAdmin =
    isSuperAdmin ||
    normalizeUserRole(playerProfile?.role) === 'SUPER_ADMIN';

  const [activeSection, setActiveSection] = useState<RoleSection>('SUPER_ADMINS');
  const [searchQuery, setSearchQuery] = useState('');

  // Real-time lists
  const [players, setPlayers] = useState<Player[]>([]);
  const [invitations, setInvitations] = useState<RoleInvitation[]>([]);
  const [auditLogs, setAuditLogs] = useState<RoleAuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  // One-time Initial Super Admin Bootstrap state
  const [isBootstrapEligible, setIsBootstrapEligible] = useState(false);
  const [bootstrapRunning, setBootstrapRunning] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);

  // Modals
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [inviteModalRole, setInviteModalRole] = useState<'ADMIN' | 'STAFF'>('STAFF');
  const [selectedStaffPlayer, setSelectedStaffPlayer] = useState<Player | null>(null);

  // Invitation revocation state
  const [revokingInviteId, setRevokingInviteId] = useState<string | null>(null);

  // Inline Confirmation Modal state for Promotes and Revocations
  const [confirmAction, setConfirmAction] = useState<
    | {
        type: 'PROMOTE';
        targetPlayer: Player;
        newRole: 'STAFF' | 'ADMIN';
      }
    | {
        type: 'REVOKE';
        targetPlayer: Player;
        currentRole: 'ADMIN' | 'STAFF';
      }
    | null
  >(null);
  const [actionReason, setActionReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Check initial bootstrap eligibility
  useEffect(() => {
    let isMounted = true;
    checkSuperAdminBootstrapEligibility(user, playerProfile).then((res) => {
      if (isMounted) {
        setIsBootstrapEligible(res.eligible);
      }
    });
    return () => {
      isMounted = false;
    };
  }, [user, playerProfile]);

  const handleExecuteBootstrap = async () => {
    if (!user || !playerProfile) return;
    setBootstrapRunning(true);
    setBootstrapError(null);

    try {
      const res = await executeSuperAdminBootstrap(user, playerProfile);
      setBootstrapRunning(false);

      if (res.success) {
        setIsBootstrapEligible(false);
        showToast(
          'success',
          '👑 SUPER ADMIN INITIALIZED',
          `Account @${playerProfile.gamerTag || 'teiger9'} has been securely promoted to Super Admin.`
        );
        if (refreshProfile) {
          await refreshProfile();
        }
      } else {
        const err = res.error || 'SUPER ADMIN BOOTSTRAP FAILED: Unknown authorization error.';
        setBootstrapError(err);
        showToast('error', 'SUPER ADMIN BOOTSTRAP FAILED', err);
      }
    } catch (err: any) {
      setBootstrapRunning(false);
      setBootstrapError(err.message || 'Bootstrap exception occurred');
      showToast('error', 'Bootstrap Exception', err.message);
    }
  };

  // 1. Subscribe to Players
  useEffect(() => {
    const q = query(collection(db, 'players'), orderBy('createdAt', 'desc'), limit(250));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs.map((d) => d.data() as Player);
        setPlayers(list);
        setLoading(false);
      },
      (err) => {
        console.warn('Players subscription warning:', err);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  // 2. Subscribe to Invitations
  useEffect(() => {
    const unsubscribe = subscribeToRoleInvitations((invs) => {
      setInvitations(invs);
    });
    return () => unsubscribe();
  }, []);

  // 3. Subscribe to Audit Logs
  useEffect(() => {
    const unsubscribe = subscribeToRoleAuditLogs((logs) => {
      setAuditLogs(logs);
    });
    return () => unsubscribe();
  }, []);

  // Summary Metrics
  const superAdminCount = players.filter(
    (p) => normalizeUserRole(p.role) === 'SUPER_ADMIN'
  ).length;
  const adminCount = players.filter(
    (p) => normalizeUserRole(p.role) === 'ADMIN'
  ).length;
  const staffCount = players.filter((p) => normalizeUserRole(p.role) === 'STAFF').length;
  const playerCount = players.filter(
    (p) => normalizeUserRole(p.role) === 'PLAYER' || normalizeUserRole(p.role) === 'VISITOR'
  ).length;
  const pendingInvitesCount = invitations.filter((i) => i.status === 'PENDING').length;

  // Filtered Players based on search & active tab
  const filteredPlayers = players.filter((p) => {
    const norm = normalizeUserRole(p.role);

    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      p.gamerTag?.toLowerCase().includes(q) ||
      p.fullName?.toLowerCase().includes(q) ||
      p.email?.toLowerCase().includes(q);

    if (!matchesSearch) return false;

    if (activeSection === 'SUPER_ADMINS') {
      return norm === 'SUPER_ADMIN';
    }
    if (activeSection === 'ADMINS') {
      return norm === 'ADMIN';
    }
    if (activeSection === 'STAFF') {
      return norm === 'STAFF';
    }
    if (activeSection === 'PLAYERS') {
      // In ALL PLAYERS, show players or anyone matching search
      return true;
    }

    return true;
  });

  const handleRevokeInvitation = async (invitationId: string) => {
    if (!isEffectiveSuperAdmin) {
      showToast('error', 'Unauthorized', 'Only Super Administrators can revoke invitations.');
      return;
    }

    try {
      const res = await revokeRoleInvitation({
        invitationId,
        revokedByUid: user?.uid || '',
        revokedByName: playerProfile?.gamerTag || user?.displayName || 'Super Admin',
        revokedByEmail: user?.email || '',
        revokedByRole: playerProfile?.role,
        reason: 'Revoked via Admin Roles View',
      });

      if (res.success) {
        showToast('success', 'Invitation Revoked', 'The role invitation has been revoked.');
        setRevokingInviteId(null);
      } else {
        showToast('error', 'Revocation Failed', res.error || 'Failed to revoke.');
      }
    } catch (err: any) {
      showToast('error', 'Error', err.message);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    showToast('info', 'Copied to Clipboard', `${label} copied.`);
  };

  // Execution handler for Promotion
  const handleExecutePromote = async () => {
    if (!confirmAction || confirmAction.type !== 'PROMOTE') return;
    setActionLoading(true);
    setActionError(null);

    try {
      const res = await promoteUserRole({
        targetUid: confirmAction.targetPlayer.uid,
        newRole: confirmAction.newRole,
        performedByUid: user?.uid || '',
        performedByName: playerProfile?.gamerTag || user?.displayName || 'Super Admin',
        performedByEmail: user?.email || '',
        performedByRole: playerProfile?.role,
        reason: actionReason.trim() || undefined,
      });

      if (res.success) {
        showToast(
          'success',
          `👑 Promoted to ${confirmAction.newRole}`,
          `@${confirmAction.targetPlayer.gamerTag} has been officially elevated to ${confirmAction.newRole}.`
        );
        setConfirmAction(null);
        setActionReason('');
      } else {
        setActionError(res.error || 'Failed to promote player.');
        showToast('error', 'Promotion Failed', res.error || 'Failed to promote player.');
      }
    } catch (err: any) {
      console.error('Promotion error:', err);
      setActionError(err.message || 'An unexpected error occurred');
      showToast('error', 'Promotion Error', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Execution handler for Revocation
  const handleExecuteRevoke = async () => {
    if (!confirmAction || confirmAction.type !== 'REVOKE') return;
    setActionLoading(true);
    setActionError(null);

    try {
      const res = await revokeUserRole({
        targetUid: confirmAction.targetPlayer.uid,
        revokedByUid: user?.uid || '',
        revokedByName: playerProfile?.gamerTag || user?.displayName || 'Super Admin',
        revokedByEmail: user?.email || '',
        revokedByRole: playerProfile?.role,
        reason: actionReason.trim() || undefined,
      });

      if (res.success) {
        showToast(
          'success',
          'Role Privileges Revoked',
          `Administrative access for @${confirmAction.targetPlayer.gamerTag} has been revoked. Player stats and coins remain intact.`
        );
        setConfirmAction(null);
        setActionReason('');
      } else {
        setActionError(res.error || 'Failed to revoke role.');
        showToast('error', 'Revocation Failed', res.error || 'Failed to revoke role.');
      }
    } catch (err: any) {
      console.error('Revocation error:', err);
      setActionError(err.message || 'An unexpected error occurred');
      showToast('error', 'Revocation Error', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Founding Super Admin One-Time Initial Bootstrap Banner */}
      {isBootstrapEligible && (
        <div className="p-6 rounded-3xl bg-gradient-to-r from-purple-950/80 via-[#181028] to-purple-950/80 border-2 border-purple-500/70 shadow-2xl relative overflow-hidden animate-in fade-in">
          <div className="absolute top-0 right-1/4 w-80 h-80 bg-purple-600/15 rounded-full blur-3xl pointer-events-none" />

          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 rounded-full text-[11px] font-mono font-black uppercase bg-purple-500/20 text-purple-300 border border-purple-500/40 tracking-wider">
                  👑 One-Time Initial Setup
                </span>
                <span className="text-xs text-amber-300 font-mono font-bold flex items-center gap-1">
                  <Shield className="w-3.5 h-3.5" />
                  Verified Founding Administrator: @{playerProfile?.gamerTag || 'teiger9'}
                </span>
              </div>
              <h3 className="text-xl sm:text-2xl font-black font-display text-white tracking-wide">
                INITIAL SUPER ADMINISTRATOR BOOTSTRAP PENDING
              </h3>
              <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
                As the designated founding administrator (<code className="text-purple-300 font-mono">teiger9</code>), you hold the single cryptographic authority to initialize the first Super Administrator in the Nexus database. This seals the root hierarchy and enables staff delegation.
              </p>
              {bootstrapError && (
                <div className="p-3 rounded-xl bg-red-950/80 border border-red-500/60 text-red-200 text-xs font-mono">
                  {bootstrapError}
                </div>
              )}
            </div>

            <div className="flex flex-col items-start sm:items-end gap-2 shrink-0">
              <button
                onClick={handleExecuteBootstrap}
                disabled={bootstrapRunning}
                className="px-6 py-3.5 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-mono font-black text-xs uppercase tracking-wider shadow-xl shadow-purple-950/60 flex items-center gap-2.5 transition transform hover:scale-[1.02] active:scale-[0.98] cursor-pointer disabled:opacity-50"
              >
                {bootstrapRunning ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Executing Bootstrap...</span>
                  </>
                ) : (
                  <>
                    <Crown className="w-4 h-4 text-amber-300" />
                    <span>Initialize Super Admin Role</span>
                  </>
                )}
              </button>
              <span className="text-[10px] text-slate-500 font-mono">
                Atomic Transaction • Immutable Audit Trail
              </span>
            </div>
          </div>
        </div>
      )}

      {/* View Header with Action Buttons */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-6 rounded-3xl bg-gradient-to-r from-[#0c0c14] via-[#11111c] to-[#0c0c14] border border-slate-800 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-1/4 w-72 h-72 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="space-y-1 z-10">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40 uppercase">
              👑 ROLE MANAGEMENT
            </span>
            <span className="text-xs text-slate-500 font-mono">• Cryptographic Governance</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black font-display text-white tracking-wide flex items-center gap-3">
            👑 ROLE MANAGEMENT
          </h2>
          <p className="text-xs text-slate-400 font-mono">
            Super Administrator Governance, Staff Permissions & Security Auditing
          </p>
        </div>

        {/* Action Buttons for Super Admin */}
        {isEffectiveSuperAdmin && (
          <div className="flex items-center gap-2.5 flex-wrap z-10">
            <button
              onClick={() => {
                setInviteModalRole('STAFF');
                setIsInviteModalOpen(true);
              }}
              className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-black uppercase font-mono tracking-wider transition shadow-lg shadow-emerald-950/40 flex items-center gap-2 cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span>+ Invite Staff</span>
            </button>

            <button
              onClick={() => {
                setInviteModalRole('ADMIN');
                setIsInviteModalOpen(true);
              }}
              className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-black uppercase font-mono tracking-wider transition shadow-lg shadow-red-950/40 flex items-center gap-2 cursor-pointer"
            >
              <Shield className="w-4 h-4" />
              <span>+ Invite Admin</span>
            </button>
          </div>
        )}
      </div>

      {/* KPI Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div
          onClick={() => setActiveSection('SUPER_ADMINS')}
          className={`p-4 rounded-2xl bg-[#0e0e17] border transition cursor-pointer ${
            activeSection === 'SUPER_ADMINS'
              ? 'border-purple-500 ring-2 ring-purple-500/30 shadow-lg shadow-purple-950/40'
              : 'border-purple-500/30 hover:border-purple-500/60'
          }`}
        >
          <div className="flex items-center justify-between text-purple-300 mb-2">
            <span className="text-xs font-mono font-bold uppercase">Super Admins</span>
            <Lock className="w-4 h-4" />
          </div>
          <div className="text-2xl font-black font-display text-white">{superAdminCount}</div>
          <p className="text-[10px] text-slate-400 font-mono mt-1">Full governance & delegation</p>
        </div>

        <div
          onClick={() => setActiveSection('ADMINS')}
          className={`p-4 rounded-2xl bg-[#0e0e17] border transition cursor-pointer ${
            activeSection === 'ADMINS'
              ? 'border-red-500 ring-2 ring-red-500/30 shadow-lg shadow-red-950/40'
              : 'border-red-500/30 hover:border-red-500/60'
          }`}
        >
          <div className="flex items-center justify-between text-red-300 mb-2">
            <span className="text-xs font-mono font-bold uppercase">Administrators</span>
            <Shield className="w-4 h-4" />
          </div>
          <div className="text-2xl font-black font-display text-white">{adminCount}</div>
          <p className="text-[10px] text-slate-400 font-mono mt-1">Tournaments & match referees</p>
        </div>

        <div
          onClick={() => setActiveSection('STAFF')}
          className={`p-4 rounded-2xl bg-[#0e0e17] border transition cursor-pointer ${
            activeSection === 'STAFF'
              ? 'border-emerald-500 ring-2 ring-emerald-500/30 shadow-lg shadow-emerald-950/40'
              : 'border-emerald-500/30 hover:border-emerald-500/60'
          }`}
        >
          <div className="flex items-center justify-between text-emerald-300 mb-2">
            <span className="text-xs font-mono font-bold uppercase">Staff Members</span>
            <Users className="w-4 h-4" />
          </div>
          <div className="text-2xl font-black font-display text-white">{staffCount}</div>
          <p className="text-[10px] text-slate-400 font-mono mt-1">Check-in, desk & redemptions</p>
        </div>

        <div
          onClick={() => setActiveSection('PENDING_INVITATIONS')}
          className={`p-4 rounded-2xl bg-[#0e0e17] border transition cursor-pointer ${
            activeSection === 'PENDING_INVITATIONS'
              ? 'border-amber-500 ring-2 ring-amber-500/30 shadow-lg shadow-amber-950/40'
              : 'border-amber-500/30 hover:border-amber-500/60'
          }`}
        >
          <div className="flex items-center justify-between text-amber-300 mb-2">
            <span className="text-xs font-mono font-bold uppercase">Pending Invites</span>
            <Clock className="w-4 h-4" />
          </div>
          <div className="text-2xl font-black font-display text-amber-400">{pendingInvitesCount}</div>
          <p className="text-[10px] text-slate-400 font-mono mt-1">Active cryptographic tokens</p>
        </div>
      </div>

      {/* Main Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3 overflow-x-auto">
        <button
          onClick={() => setActiveSection('SUPER_ADMINS')}
          className={`px-4 py-2 rounded-xl text-xs font-mono font-bold uppercase tracking-wider transition cursor-pointer whitespace-nowrap flex items-center gap-2 ${
            activeSection === 'SUPER_ADMINS'
              ? 'bg-purple-600 text-white shadow-lg shadow-purple-950/50'
              : 'bg-[#14141e] text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          <Crown className="w-3.5 h-3.5" />
          <span>SUPER ADMINS ({superAdminCount})</span>
        </button>

        <button
          onClick={() => setActiveSection('ADMINS')}
          className={`px-4 py-2 rounded-xl text-xs font-mono font-bold uppercase tracking-wider transition cursor-pointer whitespace-nowrap flex items-center gap-2 ${
            activeSection === 'ADMINS'
              ? 'bg-purple-600 text-white shadow-lg shadow-purple-950/50'
              : 'bg-[#14141e] text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          <Shield className="w-3.5 h-3.5" />
          <span>ADMINS ({adminCount})</span>
        </button>

        <button
          onClick={() => setActiveSection('STAFF')}
          className={`px-4 py-2 rounded-xl text-xs font-mono font-bold uppercase tracking-wider transition cursor-pointer whitespace-nowrap flex items-center gap-2 ${
            activeSection === 'STAFF'
              ? 'bg-purple-600 text-white shadow-lg shadow-purple-950/50'
              : 'bg-[#14141e] text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>STAFF ({staffCount})</span>
        </button>

        <button
          onClick={() => setActiveSection('PLAYERS')}
          className={`px-4 py-2 rounded-xl text-xs font-mono font-bold uppercase tracking-wider transition cursor-pointer whitespace-nowrap flex items-center gap-2 ${
            activeSection === 'PLAYERS'
              ? 'bg-purple-600 text-white shadow-lg shadow-purple-950/50'
              : 'bg-[#14141e] text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          <UserPlus className="w-3.5 h-3.5" />
          <span>ALL PLAYERS / DIRECTORY ({players.length})</span>
        </button>

        <button
          onClick={() => setActiveSection('PENDING_INVITATIONS')}
          className={`px-4 py-2 rounded-xl text-xs font-mono font-bold uppercase tracking-wider transition cursor-pointer whitespace-nowrap flex items-center gap-2 ${
            activeSection === 'PENDING_INVITATIONS'
              ? 'bg-purple-600 text-white shadow-lg shadow-purple-950/50'
              : 'bg-[#14141e] text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>PENDING INVITATIONS ({pendingInvitesCount})</span>
        </button>

        <button
          onClick={() => setActiveSection('ROLE_HISTORY')}
          className={`px-4 py-2 rounded-xl text-xs font-mono font-bold uppercase tracking-wider transition cursor-pointer whitespace-nowrap flex items-center gap-2 ${
            activeSection === 'ROLE_HISTORY'
              ? 'bg-purple-600 text-white shadow-lg shadow-purple-950/50'
              : 'bg-[#14141e] text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>ROLE HISTORY ({auditLogs.length})</span>
        </button>
      </div>

      {/* SECTIONS: SUPER ADMINS, ADMINS, STAFF, PLAYERS */}
      {(activeSection === 'SUPER_ADMINS' ||
        activeSection === 'ADMINS' ||
        activeSection === 'STAFF' ||
        activeSection === 'PLAYERS') && (
        <div className="space-y-4">
          {/* Search Controls */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 bg-[#11111a] border border-slate-800 rounded-2xl">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name, username (@gamertag) or email..."
                className="w-full pl-10 pr-4 py-2 bg-[#161622] border border-slate-800 focus:border-purple-500 rounded-xl text-white text-xs font-mono outline-none"
              />
            </div>

            <div className="text-xs font-mono text-slate-400 px-2">
              Showing <strong className="text-white">{filteredPlayers.length}</strong> accounts
            </div>
          </div>

          {/* Members Table */}
          <div className="bg-[#0d0d15] border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800/80 bg-[#12121e] text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">
                    <th className="py-3 px-4">Member / Name</th>
                    <th className="py-3 px-4">Username</th>
                    <th className="py-3 px-4">Email</th>
                    <th className="py-3 px-4">Current Role</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Granted By</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50 text-xs">
                  {filteredPlayers.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-500 font-mono">
                        No accounts matching criteria in this category.
                      </td>
                    </tr>
                  ) : (
                    filteredPlayers.map((p) => {
                      const normRole = normalizeUserRole(p.role);
                      const isFoundingAdmin = p.uid === FOUNDING_SUPER_ADMIN_UID;
                      const isSelf = p.uid === user?.uid;

                      return (
                        <tr
                          key={p.uid}
                          className="hover:bg-slate-900/40 transition-colors group"
                        >
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-xs text-white">
                                {p.gamerTag ? p.gamerTag.substring(0, 2).toUpperCase() : '??'}
                              </div>
                              <div>
                                <div className="font-bold text-white group-hover:text-purple-300 transition-colors">
                                  {p.fullName || p.gamerTag}
                                </div>
                                <div className="text-[10px] text-slate-500 font-mono">
                                  UID: {p.uid.substring(0, 8)}...
                                </div>
                              </div>
                            </div>
                          </td>

                          <td className="py-3 px-4 font-mono font-bold text-cyan-400">
                            @{p.gamerTag}
                          </td>

                          <td className="py-3 px-4 font-mono text-slate-300 text-[11px]">
                            {p.email}
                          </td>

                          <td className="py-3 px-4">
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider border ${
                                  normRole === 'SUPER_ADMIN'
                                    ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                                    : normRole === 'ADMIN'
                                    ? 'bg-red-500/20 text-red-300 border-red-500/40'
                                    : normRole === 'STAFF'
                                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                    : 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                                }`}
                              >
                                {normRole}
                              </span>
                              {isFoundingAdmin && (
                                <span className="text-[9px] font-mono text-purple-400 font-bold">
                                  ★ ROOT
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="py-3 px-4">
                            {p.roleStatus === 'REVOKED' ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-red-950/60 text-red-300 border border-red-500/40">
                                REVOKED
                              </span>
                            ) : p.status === 'SUSPENDED' ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-950/60 text-amber-300 border border-amber-500/40">
                                SUSPENDED
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-950/60 text-emerald-300 border border-emerald-500/40">
                                ACTIVE
                              </span>
                            )}
                          </td>

                          <td className="py-3 px-4 font-mono text-[11px] text-slate-400">
                            {p.roleGrantedByName || (isFoundingAdmin ? 'Root Bootstrap' : 'Staff Delegation')}
                          </td>

                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5 flex-wrap">
                              {/* Promotion Buttons for Super Admin */}
                              {isEffectiveSuperAdmin && !isSelf && !isFoundingAdmin && (
                                <>
                                  {normRole === 'PLAYER' && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          console.log("PROMOTE TO STAFF BUTTON CLICKED", {
                                            currentAuthenticatedUid: user?.uid,
                                            currentRole: playerProfile?.role,
                                            targetPlayerUid: p.uid,
                                            targetPlayerRole: p.role,
                                          });
                                          setActionError(null);
                                          setActionReason('');
                                          setConfirmAction({
                                            type: 'PROMOTE',
                                            targetPlayer: p,
                                            newRole: 'STAFF',
                                          });
                                        }}
                                        disabled={actionLoading}
                                        className="relative z-10 px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/40 text-emerald-300 border border-emerald-500/40 text-[11px] font-mono font-bold transition cursor-pointer flex items-center gap-1 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                                      >
                                        <UserCheck className="w-3 h-3 pointer-events-none" />
                                        <span className="pointer-events-none">Promote to Staff</span>
                                      </button>

                                      <button
                                        onClick={() => {
                                          setActionError(null);
                                          setActionReason('');
                                          setConfirmAction({
                                            type: 'PROMOTE',
                                            targetPlayer: p,
                                            newRole: 'ADMIN',
                                          });
                                        }}
                                        className="px-2.5 py-1 rounded-lg bg-purple-500/20 hover:bg-purple-500/40 text-purple-300 border border-purple-500/40 text-[11px] font-mono font-bold transition cursor-pointer flex items-center gap-1"
                                      >
                                        <Shield className="w-3 h-3" />
                                        <span>Promote to Admin</span>
                                      </button>
                                    </>
                                  )}

                                  {normRole === 'STAFF' && (
                                    <>
                                      <button
                                        onClick={() => {
                                          setActionError(null);
                                          setActionReason('');
                                          setConfirmAction({
                                            type: 'PROMOTE',
                                            targetPlayer: p,
                                            newRole: 'ADMIN',
                                          });
                                        }}
                                        className="px-2.5 py-1 rounded-lg bg-purple-500/20 hover:bg-purple-500/40 text-purple-300 border border-purple-500/40 text-[11px] font-mono font-bold transition cursor-pointer flex items-center gap-1"
                                      >
                                        <Shield className="w-3 h-3" />
                                        <span>Promote to Admin</span>
                                      </button>

                                      <button
                                        onClick={() => {
                                          setActionError(null);
                                          setActionReason('');
                                          setConfirmAction({
                                            type: 'REVOKE',
                                            targetPlayer: p,
                                            currentRole: 'STAFF',
                                          });
                                        }}
                                        className="px-2.5 py-1 rounded-lg bg-red-950/40 hover:bg-red-900/60 text-red-300 border border-red-500/40 text-[11px] font-mono font-bold transition cursor-pointer flex items-center gap-1"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                        <span>Revoke Staff</span>
                                      </button>
                                    </>
                                  )}

                                  {normRole === 'ADMIN' && (
                                    <button
                                      onClick={() => {
                                        setActionError(null);
                                        setActionReason('');
                                        setConfirmAction({
                                          type: 'REVOKE',
                                          targetPlayer: p,
                                          currentRole: 'ADMIN',
                                        });
                                      }}
                                      className="px-2.5 py-1 rounded-lg bg-red-950/40 hover:bg-red-900/60 text-red-300 border border-red-500/40 text-[11px] font-mono font-bold transition cursor-pointer flex items-center gap-1"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                      <span>Revoke Admin</span>
                                    </button>
                                  )}
                                </>
                              )}

                              {/* Details Modal Button */}
                              <button
                                onClick={() => setSelectedStaffPlayer(p)}
                                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-purple-600 hover:text-white text-slate-300 text-[11px] font-mono font-bold transition cursor-pointer flex items-center gap-1.5"
                              >
                                <Eye className="w-3 h-3" />
                                <span>Details & Matrix</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SECTION: PENDING INVITATIONS */}
      {activeSection === 'PENDING_INVITATIONS' && (
        <div className="space-y-4">
          <div className="bg-[#0d0d15] border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800/80 bg-[#12121e] text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">
                    <th className="py-3 px-4">Recipient</th>
                    <th className="py-3 px-4">Invited Role</th>
                    <th className="py-3 px-4">Invited By</th>
                    <th className="py-3 px-4">Issued Date</th>
                    <th className="py-3 px-4">Status / Expiry</th>
                    <th className="py-3 px-4">Token ID</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50 text-xs">
                  {invitations.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-500 font-mono">
                        No invitations recorded in the database.
                      </td>
                    </tr>
                  ) : (
                    invitations.map((inv) => {
                      const isExpired =
                        inv.status === 'EXPIRED' ||
                        (inv.status === 'PENDING' && Date.now() > inv.expiresAt);

                      return (
                        <tr
                          key={inv.id}
                          className="hover:bg-slate-900/40 transition-colors"
                        >
                          <td className="py-3 px-4">
                            <div className="font-bold text-white">
                              {inv.recipientFullName || inv.recipientGamerTag || inv.recipientEmail}
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              {inv.recipientEmail}
                            </div>
                          </td>

                          <td className="py-3 px-4">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                                inv.invitedRole === 'ADMIN'
                                  ? 'bg-red-500/20 text-red-300 border border-red-500/40'
                                  : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                              }`}
                            >
                              {inv.invitedRole}
                            </span>
                          </td>

                          <td className="py-3 px-4 font-mono text-[11px] text-slate-300">
                            @{inv.invitedByName}
                          </td>

                          <td className="py-3 px-4 font-mono text-[11px] text-slate-400">
                            {new Date(inv.createdAt).toLocaleDateString()}
                          </td>

                          <td className="py-3 px-4">
                            {inv.status === 'ACCEPTED' ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-950/60 text-emerald-300 border border-emerald-500/40">
                                ACCEPTED
                              </span>
                            ) : inv.status === 'DECLINED' ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-red-950/60 text-red-300 border border-red-500/40">
                                DECLINED
                              </span>
                            ) : inv.status === 'REVOKED' ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-800 text-slate-400 border border-slate-700">
                                REVOKED
                              </span>
                            ) : isExpired ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-950/60 text-amber-300 border border-amber-500/40">
                                EXPIRED
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-950/60 text-blue-300 border border-blue-500/40">
                                PENDING
                              </span>
                            )}
                          </td>

                          <td className="py-3 px-4 font-mono text-[11px] text-slate-500">
                            <div className="flex items-center gap-1.5">
                              <span>{inv.id.substring(0, 10)}...</span>
                              <button
                                onClick={() => copyToClipboard(inv.id, 'Invitation Token')}
                                className="text-slate-400 hover:text-white cursor-pointer"
                              >
                                <Copy className="w-3 h-3" />
                              </button>
                            </div>
                          </td>

                          <td className="py-3 px-4 text-right">
                            {inv.status === 'PENDING' && !isExpired && isEffectiveSuperAdmin && (
                              <button
                                onClick={() => handleRevokeInvitation(inv.id)}
                                className="px-2.5 py-1 rounded-lg bg-red-950/40 hover:bg-red-900/60 text-red-300 border border-red-500/40 text-[11px] font-mono font-bold transition cursor-pointer flex items-center gap-1 ml-auto"
                              >
                                <Trash2 className="w-3 h-3" />
                                <span>Revoke</span>
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SECTION: ROLE HISTORY (AUDIT TRAIL) */}
      {activeSection === 'ROLE_HISTORY' && (
        <div className="space-y-4">
          <div className="bg-[#0d0d15] border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800/80 bg-[#12121e] text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">
                    <th className="py-3 px-4">Action</th>
                    <th className="py-3 px-4">Target Member</th>
                    <th className="py-3 px-4">Role Transition</th>
                    <th className="py-3 px-4">Performed By</th>
                    <th className="py-3 px-4">Reason / Notes</th>
                    <th className="py-3 px-4">Timestamp</th>
                    <th className="py-3 px-4 text-right">Audit ID</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50 text-xs font-mono">
                  {auditLogs.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-500 font-mono">
                        No security audit logs recorded yet.
                      </td>
                    </tr>
                  ) : (
                    auditLogs.map((log) => {
                      const isGrant = log.action === 'ROLE_GRANTED' || log.action === 'ROLE_ACCEPTED' || log.action === 'INITIAL_SUPER_ADMIN_BOOTSTRAP';
                      const isRevoke = log.action === 'ROLE_REVOKED' || log.action === 'ROLE_DECLINED';

                      return (
                        <tr key={log.id} className="hover:bg-slate-900/40 transition-colors">
                          <td className="py-3 px-4">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                log.action === 'INITIAL_SUPER_ADMIN_BOOTSTRAP'
                                  ? 'bg-purple-950/80 text-purple-300 border border-purple-500/50'
                                  : isGrant
                                  ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/40'
                                  : isRevoke
                                  ? 'bg-red-950/60 text-red-300 border border-red-500/40'
                                  : 'bg-slate-800 text-slate-300'
                              }`}
                            >
                              {log.action}
                            </span>
                          </td>

                          <td className="py-3 px-4 text-white">
                            <div>@{log.targetGamerTag || 'anonymous'}</div>
                            <div className="text-[10px] text-slate-500 font-sans">{log.targetEmail}</div>
                          </td>

                          <td className="py-3 px-4">
                            <div className="flex items-center gap-1.5 text-[11px]">
                              <span className="text-slate-500">{log.previousRole || 'NONE'}</span>
                              <span className="text-purple-400">→</span>
                              <span className="text-white font-bold">{log.newRole}</span>
                            </div>
                          </td>

                          <td className="py-3 px-4 text-slate-300 text-[11px]">
                            @{log.performedByName}
                          </td>

                          <td className="py-3 px-4 text-slate-400 text-[11px] max-w-xs truncate">
                            {log.reason || 'None provided'}
                          </td>

                          <td className="py-3 px-4 text-slate-400 text-[11px]">
                            {new Date(log.timestamp).toLocaleString()}
                          </td>

                          <td className="py-3 px-4 text-right text-slate-500 text-[10px]">
                            {log.id.substring(0, 12)}...
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRMATION DIALOG MODAL FOR DIRECT PROMOTIONS & REVOCATIONS */}
      {confirmAction && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg bg-[#0e0e17] border-2 border-purple-500/60 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
            <button
              onClick={() => {
                if (!actionLoading) setConfirmAction(null);
              }}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            {confirmAction.type === 'PROMOTE' ? (
              <>
                <div className="flex items-start gap-3">
                  <div className="p-2.5 rounded-2xl bg-purple-500/20 text-purple-300 border border-purple-500/40">
                    <Crown className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black font-display text-white uppercase tracking-wide">
                      Promote {confirmAction.targetPlayer.fullName || confirmAction.targetPlayer.gamerTag} to {confirmAction.newRole === 'STAFF' ? 'Staff' : 'Admin'}?
                    </h3>
                    <p className="text-xs text-slate-400 font-mono mt-0.5">
                      Hierarchical authority upgrade with cryptographic audit trail
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-[#141420] border border-slate-800 space-y-2 text-xs font-mono">
                  <div className="flex justify-between items-center py-1 border-b border-slate-800/80">
                    <span className="text-slate-400">Player:</span>
                    <strong className="text-white text-sm">
                      {confirmAction.targetPlayer.fullName || confirmAction.targetPlayer.gamerTag} (@{confirmAction.targetPlayer.gamerTag})
                    </strong>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-800/80">
                    <span className="text-slate-400">Current role:</span>
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-amber-300 font-bold">
                      {normalizeUserRole(confirmAction.targetPlayer.role)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-slate-400">New role:</span>
                    <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/40">
                      {confirmAction.newRole}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1 text-[11px] text-slate-500">
                    <span>Target Firebase UID:</span>
                    <span>{confirmAction.targetPlayer.uid}</span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-mono font-bold text-slate-300 mb-1.5">
                    Appointment Note / Reason (Recorded in Audit Trail)
                  </label>
                  <input
                    type="text"
                    value={actionReason}
                    onChange={(e) => setActionReason(e.target.value)}
                    placeholder="e.g. Appointed as weekend station referee / shift supervisor"
                    className="w-full px-3.5 py-2.5 bg-[#141420] border border-purple-500/40 focus:border-purple-400 rounded-xl text-white text-xs outline-none font-mono"
                  />
                </div>

                {actionError && (
                  <div className="p-3 rounded-xl bg-red-950/80 border border-red-500/60 text-red-200 text-xs font-mono flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                    <span>{actionError}</span>
                  </div>
                )}

                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setConfirmAction(null)}
                    disabled={actionLoading}
                    className="flex-1 py-3 px-4 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-bold font-mono uppercase cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleExecutePromote}
                    disabled={actionLoading}
                    className="flex-1 py-3 px-4 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-black font-mono uppercase tracking-wider transition shadow-lg shadow-purple-950/60 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {actionLoading ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Confirm Promotion</span>
                      </>
                    )}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-start gap-3">
                  <div className="p-2.5 rounded-2xl bg-red-500/20 text-red-300 border border-red-500/40">
                    <AlertTriangle className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black font-display text-white uppercase tracking-wide">
                      REVOKE {confirmAction.currentRole} ACCESS?
                    </h3>
                    <p className="text-xs text-slate-400 font-mono mt-0.5">
                      Demote to standard Player. Player matches, rating, and coins are safely preserved.
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-[#141420] border border-slate-800 space-y-2 text-xs font-mono">
                  <div className="flex justify-between items-center py-1 border-b border-slate-800/80">
                    <span className="text-slate-400">Player:</span>
                    <strong className="text-white text-sm">
                      {confirmAction.targetPlayer.fullName || confirmAction.targetPlayer.gamerTag} (@{confirmAction.targetPlayer.gamerTag})
                    </strong>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-800/80">
                    <span className="text-slate-400">Current role:</span>
                    <span className="px-2 py-0.5 rounded bg-red-950/80 text-red-300 font-bold border border-red-500/40">
                      {confirmAction.currentRole}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-slate-400">New role:</span>
                    <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 font-bold border border-blue-500/40">
                      PLAYER
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1 text-[11px] text-slate-500">
                    <span>Target Firebase UID:</span>
                    <span>{confirmAction.targetPlayer.uid}</span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-mono font-bold text-slate-300 mb-1.5">
                    Revocation Reason (Recorded in Audit Trail)
                  </label>
                  <input
                    type="text"
                    value={actionReason}
                    onChange={(e) => setActionReason(e.target.value)}
                    placeholder="e.g. End of seasonal shift / Security policy update"
                    className="w-full px-3.5 py-2.5 bg-[#141420] border border-red-500/40 focus:border-red-400 rounded-xl text-white text-xs outline-none font-mono"
                  />
                </div>

                {actionError && (
                  <div className="p-3 rounded-xl bg-red-950/80 border border-red-500/60 text-red-200 text-xs font-mono flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                    <span>{actionError}</span>
                  </div>
                )}

                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setConfirmAction(null)}
                    disabled={actionLoading}
                    className="flex-1 py-3 px-4 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-bold font-mono uppercase cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleExecuteRevoke}
                    disabled={actionLoading}
                    className="flex-1 py-3 px-4 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-black font-mono uppercase tracking-wider transition shadow-lg shadow-red-950/60 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {actionLoading ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Trash2 className="w-4 h-4" />
                        <span>Confirm Revocation</span>
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Invite Staff / Admin Modal */}
      <InviteStaffModal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
        initialRole={inviteModalRole}
      />

      {/* Staff Profile & Permission Matrix Modal */}
      <StaffProfileModal
        player={selectedStaffPlayer}
        isOpen={!!selectedStaffPlayer}
        onClose={() => setSelectedStaffPlayer(null)}
      />
    </div>
  );
};
