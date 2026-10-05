import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from './Toast';
import { Player, NexusPermissions } from '../types';
import {
  normalizeUserRole,
  getRolePermissions,
  revokeUserRole,
  promoteUserRole,
  isSuperAdminUser,
  FOUNDING_SUPER_ADMIN_UID,
} from '../services/roleService';
import {
  Shield,
  ShieldAlert,
  Users,
  CheckCircle2,
  XCircle,
  Clock,
  Calendar,
  Mail,
  UserCheck,
  X,
  AlertTriangle,
  Award,
  Coins,
  Gamepad2,
  Trash2,
  ArrowUpRight,
  Crown,
} from 'lucide-react';

interface StaffProfileModalProps {
  player: Player | null;
  isOpen: boolean;
  onClose: () => void;
  onRoleRevoked?: () => void;
}

export const StaffProfileModal: React.FC<StaffProfileModalProps> = ({
  player,
  isOpen,
  onClose,
  onRoleRevoked,
}) => {
  const { user, playerProfile, isSuperAdmin } = useAuth();
  const { showToast } = useToast();

  const [confirmingRevoke, setConfirmingRevoke] = useState(false);
  const [revokeReason, setRevokeReason] = useState('');
  const [confirmingPromoteRole, setConfirmingPromoteRole] = useState<'STAFF' | 'ADMIN' | null>(null);
  const [promoteReason, setPromoteReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !player) return null;

  const normalizedRole = normalizeUserRole(player.role);
  const permissions: NexusPermissions = getRolePermissions(player.role, player.email);
  const isSelf = player.uid === user?.uid;
  const isEffectiveSuperAdmin =
    isSuperAdmin ||
    normalizeUserRole(playerProfile?.role) === 'SUPER_ADMIN';

  const handlePromoteRole = async (targetNewRole: 'STAFF' | 'ADMIN') => {
    setError(null);
    setLoading(true);

    try {
      const res = await promoteUserRole({
        targetUid: player.uid,
        newRole: targetNewRole,
        performedByUid: user?.uid || '',
        performedByName: playerProfile?.gamerTag || user?.displayName || 'Super Admin',
        performedByEmail: user?.email || '',
        performedByRole: playerProfile?.role,
        reason: promoteReason.trim() || undefined,
      });

      if (res.success) {
        showToast(
          'success',
          `👑 Promoted to ${targetNewRole}`,
          `@${player.gamerTag} has been officially elevated to ${targetNewRole}.`
        );
        if (onRoleRevoked) onRoleRevoked();
        setConfirmingPromoteRole(null);
        onClose();
      } else {
        setError(res.error || 'Failed to promote player role.');
      }
    } catch (err: any) {
      setError(err.message || 'Error promoting player role.');
    } finally {
      setLoading(false);
    }
  };

  const handleRevokeRole = async () => {
    setError(null);
    setLoading(true);

    try {
      const res = await revokeUserRole({
        targetUid: player.uid,
        revokedByUid: user?.uid || '',
        revokedByName: playerProfile?.gamerTag || user?.displayName || 'Super Admin',
        revokedByEmail: user?.email || '',
        revokedByRole: playerProfile?.role,
        reason: revokeReason.trim() || undefined,
      });

      if (res.success) {
        showToast(
          'success',
          'Role Revoked',
          `Administrative privileges for ${player.gamerTag} have been revoked. Player stats remain preserved.`
        );
        if (onRoleRevoked) onRoleRevoked();
        onClose();
      } else {
        setError(res.error || 'Failed to revoke role.');
      }
    } catch (err: any) {
      setError(err.message || 'Error revoking role');
    } finally {
      setLoading(false);
    }
  };

  const permissionItems: { key: keyof NexusPermissions; label: string; desc: string }[] = [
    { key: 'managePlayers', label: 'Manage Players', desc: 'Edit profiles, suspend accounts, view private dossiers' },
    { key: 'manageSquads', label: '5v5 Squad Governance', desc: 'Disband teams, transfer captaincy, edit rosters' },
    { key: 'manageLobbies', label: '5v5 Lobby Assistance', desc: 'Monitor active lobbies, assist players, manage recruitment' },
    { key: 'manageMatches', label: 'Dispute & Match Referee', desc: 'Resolve player disputes, force match results' },
    { key: 'approveMatches', label: 'Official Match Approval', desc: 'Sign off on high-stakes competitive matches' },
    { key: 'manageTournaments', label: 'Tournament Director', desc: 'Create tournaments, seed brackets, approve teams' },
    { key: 'manageReservations', label: 'Station Bookings & Desk', desc: 'Approve station reservations, phone follow-up' },
    { key: 'manageRewards', label: 'Fidelity Catalog Admin', desc: 'Add/edit reward items, configure point thresholds' },
    { key: 'useRedemptionCodes', label: 'Process Redemptions', desc: 'Verify and redeem customer claim codes' },
    { key: 'manageNC', label: 'Nexus Coin Balance Admin', desc: 'Grant/deduct NC adjustments with audit trail' },
    { key: 'manageRoles', label: 'Staff & Role Governance', desc: 'Issue cryptographic invites, revoke roles' },
    { key: 'manageSecurity', label: 'Nexus Security & Config', desc: 'Manage system settings and security policies' },
    { key: 'viewAuditLogs', label: 'View Security Audit Logs', desc: 'Inspect append-only administrative actions' },
  ];

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-[#0c0c13] border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl overflow-y-auto max-h-[92vh]">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Member Header Card */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-slate-800/80">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div
                className={`w-16 h-16 rounded-2xl flex items-center justify-center font-display font-black text-2xl border ${
                  normalizedRole === 'SUPER_ADMIN'
                    ? 'bg-purple-950/40 border-purple-500/60 text-purple-300 shadow-[0_0_20px_rgba(168,85,247,0.3)]'
                    : normalizedRole === 'ADMIN'
                    ? 'bg-red-950/40 border-red-500/60 text-red-300 shadow-[0_0_20px_rgba(239,68,68,0.3)]'
                    : normalizedRole === 'STAFF'
                    ? 'bg-emerald-950/40 border-emerald-500/60 text-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.3)]'
                    : 'bg-blue-950/40 border-blue-500/60 text-blue-300'
                }`}
              >
                {player.gamerTag.substring(0, 2).toUpperCase()}
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-2xl font-black font-display text-white tracking-wide">
                  {player.fullName || player.gamerTag}
                </h3>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-black uppercase tracking-wider border ${
                    normalizedRole === 'SUPER_ADMIN'
                      ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                      : normalizedRole === 'ADMIN'
                      ? 'bg-red-500/20 text-red-300 border-red-500/40'
                      : normalizedRole === 'STAFF'
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                  }`}
                >
                  {normalizedRole}
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                @{player.gamerTag} • UID: <span className="text-slate-500">{player.uid}</span>
              </p>
            </div>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="mt-4 p-3.5 rounded-xl bg-red-950/60 border border-red-500/40 text-red-300 text-xs font-mono">
            {error}
          </div>
        )}

        {/* Member Metadata Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 my-6">
          <div className="p-3 rounded-2xl bg-[#14141e] border border-slate-800">
            <div className="flex items-center gap-2 text-slate-400 text-xs font-mono mb-1">
              <Mail className="w-3.5 h-3.5 text-slate-500" />
              <span>Email Address</span>
            </div>
            <div className="text-xs font-mono font-bold text-white truncate">{player.email}</div>
          </div>

          <div className="p-3 rounded-2xl bg-[#14141e] border border-slate-800">
            <div className="flex items-center gap-2 text-slate-400 text-xs font-mono mb-1">
              <UserCheck className="w-3.5 h-3.5 text-slate-500" />
              <span>Granted By</span>
            </div>
            <div className="text-xs font-mono font-bold text-purple-300 truncate">
              {player.roleGrantedByName || 'System Initial Bootstrap'}
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-[#14141e] border border-slate-800">
            <div className="flex items-center gap-2 text-slate-400 text-xs font-mono mb-1">
              <Calendar className="w-3.5 h-3.5 text-slate-500" />
              <span>Granted Date</span>
            </div>
            <div className="text-xs font-mono font-bold text-slate-300">
              {player.roleGrantedAt
                ? new Date(player.roleGrantedAt).toLocaleDateString()
                : new Date(player.createdAt).toLocaleDateString()}
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-[#14141e] border border-slate-800">
            <div className="flex items-center gap-2 text-slate-400 text-xs font-mono mb-1">
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              <span>Last Active / Login</span>
            </div>
            <div className="text-xs font-mono font-bold text-slate-300">
              {player.lastLoginAt ? new Date(player.lastLoginAt).toLocaleString() : 'Recent session'}
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-[#14141e] border border-slate-800">
            <div className="flex items-center gap-2 text-slate-400 text-xs font-mono mb-1">
              <Award className="w-3.5 h-3.5 text-slate-500" />
              <span>Player Rating / MMR</span>
            </div>
            <div className="text-xs font-mono font-bold text-cyan-400">
              {player.overallRating || 1200} ELO
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-[#14141e] border border-slate-800">
            <div className="flex items-center gap-2 text-slate-400 text-xs font-mono mb-1">
              <Coins className="w-3.5 h-3.5 text-slate-500" />
              <span>Nexus Coins (NC)</span>
            </div>
            <div className="text-xs font-mono font-bold text-amber-400">
              🪙 {player.nexusCoins || 0} NC
            </div>
          </div>
        </div>

        {/* Permission Matrix Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300">
              Canonical Permission Matrix ({normalizedRole})
            </h4>
            <span className="text-[10px] font-mono text-slate-500">
              Server-enforced by Firestore Rules
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto pr-1">
            {permissionItems.map((item) => {
              const hasPerm = permissions[item.key];
              return (
                <div
                  key={item.key}
                  className={`p-2.5 rounded-xl border flex items-center justify-between gap-3 ${
                    hasPerm
                      ? 'bg-emerald-950/20 border-emerald-500/30 text-white'
                      : 'bg-black/30 border-slate-800 text-slate-500'
                  }`}
                >
                  <div className="space-y-0.5 min-w-0">
                    <div className="text-xs font-bold truncate">{item.label}</div>
                    <div className="text-[10px] text-slate-400 truncate">{item.desc}</div>
                  </div>
                  {hasPerm ? (
                    <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 text-[10px] font-mono font-bold shrink-0">
                      GRANTED
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-400 text-[10px] font-mono font-bold shrink-0">
                      RESTRICTED
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Error Notice */}
        {error && (
          <div className="mt-4 p-3.5 rounded-xl bg-red-950/60 border border-red-500/50 text-red-200 text-xs font-mono flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Promotion Zone (Super Admin only, for PLAYER or STAFF members) */}
        {isEffectiveSuperAdmin && !isSelf && (normalizedRole === 'PLAYER' || normalizedRole === 'STAFF') && (
          <div className="mt-8 pt-6 border-t border-slate-800 space-y-4">
            {!confirmingPromoteRole ? (
              <div className="p-4 rounded-2xl bg-gradient-to-r from-purple-950/30 via-slate-900/40 to-slate-900/40 border border-purple-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h5 className="text-xs font-bold uppercase font-mono text-purple-300 flex items-center gap-1.5">
                    <Crown className="w-3.5 h-3.5 text-purple-400" />
                    <span>Promote User Privileges</span>
                  </h5>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Elevate this player's administrative role. MMR, matches, and Nexus Coins remain preserved.
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {normalizedRole === 'PLAYER' && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        console.log("PROMOTE TO STAFF BUTTON CLICKED", {
                          currentAuthenticatedUid: user?.uid,
                          currentRole: playerProfile?.role,
                          targetPlayerUid: player.uid,
                          targetPlayerRole: player.role,
                        });
                        setError(null);
                        setConfirmingRevoke(false);
                        setConfirmingPromoteRole('STAFF');
                      }}
                      className="relative z-10 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold font-mono uppercase tracking-wider transition shadow-md shadow-emerald-950/40 flex items-center gap-1.5 cursor-pointer active:scale-95"
                    >
                      <UserCheck className="w-3.5 h-3.5 pointer-events-none" />
                      <span className="pointer-events-none">Promote to Staff</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setConfirmingRevoke(false);
                      setConfirmingPromoteRole('ADMIN');
                    }}
                    className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold font-mono uppercase tracking-wider transition shadow-md shadow-purple-950/40 flex items-center gap-1.5 cursor-pointer"
                  >
                    <Shield className="w-3.5 h-3.5" />
                    <span>Promote to Admin</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-5 rounded-2xl bg-purple-950/40 border-2 border-purple-500/60 space-y-4 animate-in fade-in">
                <div className="flex items-start gap-3">
                  <Crown className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <h5 className="text-sm font-bold font-display text-white uppercase">
                      Promote {player.fullName || player.gamerTag} to {confirmingPromoteRole === 'STAFF' ? 'Staff' : 'Admin'}?
                    </h5>
                    <div className="text-xs text-slate-300 font-mono space-y-0.5 pt-1">
                      <div><span className="text-slate-500">Player:</span> <strong className="text-white">{player.fullName || player.gamerTag}</strong> (@{player.gamerTag})</div>
                      <div><span className="text-slate-500">Current role:</span> <strong className="text-amber-400">{normalizedRole}</strong></div>
                      <div><span className="text-slate-500">New role:</span> <strong className="text-emerald-400">{confirmingPromoteRole}</strong></div>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-mono font-bold text-slate-300 mb-1">
                    Promotion Reason / Appointment Note (Recorded in Audit Log)
                  </label>
                  <input
                    type="text"
                    value={promoteReason}
                    onChange={(e) => setPromoteReason(e.target.value)}
                    placeholder="e.g. Appointed as weekend station referee / shift supervisor"
                    className="w-full px-3.5 py-2 bg-[#14141e] border border-purple-500/40 focus:border-purple-400 rounded-xl text-white text-xs outline-none font-mono"
                  />
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmingPromoteRole(null);
                      setPromoteReason('');
                    }}
                    disabled={loading}
                    className="flex-1 py-2.5 px-4 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-bold font-mono uppercase cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePromoteRole(confirmingPromoteRole)}
                    disabled={loading}
                    className="flex-1 py-2.5 px-4 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-black font-mono uppercase tracking-wider transition shadow-lg shadow-purple-950/60 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {loading ? (
                      <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <span>Confirm Promotion</span>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Revocation Zone (Super Admin only, for ADMIN or STAFF members) */}
        {isEffectiveSuperAdmin && !isSelf && (normalizedRole === 'ADMIN' || normalizedRole === 'STAFF') && (
          <div className="mt-8 pt-6 border-t border-red-950/60 space-y-4">
            {!confirmingRevoke ? (
              <div className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-red-950/20 border border-red-500/30">
                <div>
                  <h5 className="text-xs font-bold uppercase font-mono text-red-300">
                    Revoke Administrative Access
                  </h5>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Demote to standard Player. Player matches, rating, and coins are safely preserved.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setError(null);
                    setConfirmingPromoteRole(null);
                    setConfirmingRevoke(true);
                  }}
                  className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold font-mono uppercase tracking-wider transition shadow-lg shadow-red-950/50 flex items-center gap-1.5 shrink-0 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Revoke {normalizedRole}</span>
                </button>
              </div>
            ) : (
              <div className="p-5 rounded-2xl bg-red-950/40 border-2 border-red-500/60 space-y-4 animate-in fade-in">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <h5 className="text-sm font-bold font-display text-white uppercase">
                      REVOKE {normalizedRole} ACCESS FOR @{player.gamerTag}?
                    </h5>
                    <div className="text-xs text-slate-300 font-mono space-y-0.5 pt-1">
                      <div><span className="text-slate-500">Player:</span> <strong className="text-white">{player.fullName || player.gamerTag}</strong> (@{player.gamerTag})</div>
                      <div><span className="text-slate-500">Current role:</span> <strong className="text-red-400">{normalizedRole}</strong></div>
                      <div><span className="text-slate-500">New role:</span> <strong className="text-blue-400">PLAYER</strong></div>
                    </div>
                    <p className="text-xs text-red-200/90 leading-relaxed pt-1">
                      This action will immediately revoke administrative permissions and log an immutable audit event. The player account, MMR rating, and coins remain completely safe.
                    </p>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-mono font-bold text-slate-300 mb-1">
                    Revocation Reason (Recorded in Audit Log)
                  </label>
                  <input
                    type="text"
                    value={revokeReason}
                    onChange={(e) => setRevokeReason(e.target.value)}
                    placeholder="e.g. End of seasonal shift / Security policy update"
                    className="w-full px-3.5 py-2 bg-[#14141e] border border-red-500/40 focus:border-red-400 rounded-xl text-white text-xs outline-none font-mono"
                  />
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmingRevoke(false);
                      setRevokeReason('');
                    }}
                    disabled={loading}
                    className="flex-1 py-2.5 px-4 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-bold font-mono uppercase cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleRevokeRole}
                    disabled={loading}
                    className="flex-1 py-2.5 px-4 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-black font-mono uppercase tracking-wider transition shadow-lg shadow-red-950/60 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {loading ? (
                      <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <span>Confirm Revocation</span>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
