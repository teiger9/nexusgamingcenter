import React, { useState, useEffect } from 'react';
import { fetchAllPlayers } from '../services/playerService';
import { Player } from '../types';
import { useToast } from './Toast';
import { useAuth } from '../context/AuthContext';
import {
  promoteUserRole,
  revokeUserRole,
  normalizeUserRole,
  isSuperAdminUser,
  FOUNDING_SUPER_ADMIN_UID,
} from '../services/roleService';
import { executePermanentPlayerRemovalClient } from '../services/playerAccountRemovalService';
import { Users, Search, Shield, ShieldCheck, UserCheck, Trophy, Crown, AlertTriangle, X, Trash2 } from 'lucide-react';

interface AdminPlayersViewProps {
  onSelectPlayerProfile?: (playerId: string) => void;
}

export const AdminPlayersView: React.FC<AdminPlayersViewProps> = ({ onSelectPlayerProfile }) => {
  const { user: currentAuthUser, playerProfile, isSuperAdmin, isAdmin, permissions } = useAuth();
  const { showToast } = useToast();

  const canManageRoles = Boolean(isSuperAdmin || permissions?.canManageStaff);

  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [updatingUid, setUpdatingUid] = useState<string | null>(null);

  // In-DOM confirmation modal state for role actions
  const [confirmAction, setConfirmAction] = useState<{
    type: 'PROMOTE' | 'REVOKE';
    player: Player;
  } | null>(null);

  // Super Admin Permanent Removal state
  const [removalTarget, setRemovalTarget] = useState<Player | null>(null);
  const [confirmInput, setConfirmInput] = useState<string>('');
  const [isRemoving, setIsRemoving] = useState<boolean>(false);
  const [removalError, setRemovalError] = useState<string | null>(null);

  useEffect(() => {
    loadPlayers();
  }, []);

  const loadPlayers = async () => {
    setLoading(true);
    try {
      const data = await fetchAllPlayers();
      setPlayers(data);
    } catch (err) {
      console.error('Error fetching players:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleInitiateRoleAction = (targetPlayer: Player) => {
    if (!canManageRoles) {
      showToast('error', 'Unauthorized', 'Only Administrators can manage staff roles.');
      return;
    }
    if (targetPlayer.uid === currentAuthUser?.uid) {
      showToast('warning', 'Action Forbidden', 'You cannot change your own staff role.');
      return;
    }

    const currentRoleNorm = normalizeUserRole(targetPlayer.role);
    if (currentRoleNorm === 'PLAYER' || currentRoleNorm === 'VISITOR') {
      console.log("PROMOTE TO STAFF BUTTON CLICKED", {
        currentAuthenticatedUid: currentAuthUser?.uid,
        currentRole: playerProfile?.role,
        targetPlayerUid: targetPlayer.uid,
        targetPlayerRole: targetPlayer.role,
      });
      setConfirmAction({
        type: 'PROMOTE',
        player: targetPlayer,
      });
    } else {
      setConfirmAction({
        type: 'REVOKE',
        player: targetPlayer,
      });
    }
  };

  const handleExecuteRoleAction = async () => {
    if (!confirmAction) return;
    const targetPlayer = confirmAction.player;
    const isPromote = confirmAction.type === 'PROMOTE';

    setUpdatingUid(targetPlayer.uid);
    try {
      if (isPromote) {
        const res = await promoteUserRole({
          targetUid: targetPlayer.uid,
          newRole: 'STAFF',
          performedByUid: currentAuthUser?.uid || '',
          performedByName: playerProfile?.gamerTag || currentAuthUser?.displayName || 'Super Admin',
          performedByEmail: currentAuthUser?.email || '',
          performedByRole: playerProfile?.role,
          reason: 'Promoted from Registered Players Directory',
        });
        if (!res.success) {
          throw new Error(res.error || 'Failed to promote player');
        }
        showToast('success', 'Player Promoted', `${targetPlayer.gamerTag} is now a STAFF member.`);
      } else {
        const res = await revokeUserRole({
          targetUid: targetPlayer.uid,
          revokedByUid: currentAuthUser?.uid || '',
          revokedByName: playerProfile?.gamerTag || currentAuthUser?.displayName || 'Super Admin',
          revokedByEmail: currentAuthUser?.email || '',
          revokedByRole: playerProfile?.role,
          reason: 'Administrative role adjustment from Players Directory',
        });
        if (!res.success) {
          throw new Error(res.error || 'Failed to revoke role');
        }
        showToast('success', 'Role Revoked', `${targetPlayer.gamerTag} is now a standard player.`);
      }
      setConfirmAction(null);
      await loadPlayers();
    } catch (err: any) {
      console.error('Role update error:', err);
      showToast('error', 'Update Failed', err.message || 'Operation failed');
    } finally {
      setUpdatingUid(null);
    }
  };

  const handleInitiateRemovePlayer = (targetPlayer: Player) => {
    if (!isSuperAdmin && currentAuthUser?.uid !== FOUNDING_SUPER_ADMIN_UID) {
      showToast('error', 'Unauthorized', 'Only Super Administrators can remove player accounts.');
      return;
    }
    if (targetPlayer.uid === currentAuthUser?.uid) {
      showToast('warning', 'Action Forbidden', 'Super Administrators cannot remove their own account.');
      return;
    }
    if (targetPlayer.uid === FOUNDING_SUPER_ADMIN_UID) {
      showToast('error', 'Protected Account', 'The Founding Super Admin is permanently protected and cannot be removed.');
      return;
    }

    setRemovalTarget(targetPlayer);
    setConfirmInput('');
    setRemovalError(null);
  };

  const handleExecuteRemovePlayer = async (forceAutoResolve: boolean = true) => {
    if (!removalTarget) return;

    const cleanInput = confirmInput.trim();
    const isTagMatch = cleanInput.toLowerCase() === (removalTarget.gamerTag || '').toLowerCase();
    const isRemoveKeyword = cleanInput.toUpperCase() === 'REMOVE';

    if (!isTagMatch && !isRemoveKeyword) {
      showToast('warning', 'Confirmation Required', `Type "${removalTarget.gamerTag}" or "REMOVE" to proceed.`);
      return;
    }

    setIsRemoving(true);
    setUpdatingUid(removalTarget.uid);
    setRemovalError(null);

    try {
      const res = await executePermanentPlayerRemovalClient({
        targetUid: removalTarget.uid,
        confirmationTag: cleanInput,
        reason: 'Super Admin permanent removal via Players Directory',
        autoResolveConflicts: forceAutoResolve,
      });

      if (!res.success) {
        setRemovalError(res.error || 'Failed to remove player account.');
        showToast('warning', 'Removal Blocked', res.error || 'Failed to remove player account.');
        return;
      }

      showToast(
        'success',
        'Player Removed',
        `Account "${removalTarget.gamerTag}" was permanently removed. Username is now released.`
      );
      setRemovalTarget(null);
      setConfirmInput('');
      setRemovalError(null);
      await loadPlayers();
    } catch (err: any) {
      const errMsg = err?.message || 'Failed to permanently remove player.';
      setRemovalError(errMsg);
      showToast('error', 'Removal Blocked', errMsg);
    } finally {
      setIsRemoving(false);
      setUpdatingUid(null);
    }
  };

  const filtered = players.filter(
    (p) =>
      (p?.gamerTag && p.gamerTag.toLowerCase().includes(search.toLowerCase())) ||
      (p?.fullName && p.fullName.toLowerCase().includes(search.toLowerCase())) ||
      (p?.email && p.email.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black font-display text-white">REGISTERED PLAYERS DIRECTORY</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Total of {players.length} registered competitors in Nexus Gaming Center.
          </p>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by gamer tag, name, email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-[#0a0a0f] border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
          />
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center">
          <div className="inline-block w-8 h-8 border-3 border-cyan-400 border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-slate-400 text-xs font-mono">Loading player roster...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center bg-[#0a0a0f] border border-slate-800 rounded-3xl p-6 text-xs text-slate-400">
          No players found matching "{search}".
        </div>
      ) : (
        <div className="bg-[#0a0a0f] border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-[#15151b] text-slate-400 uppercase tracking-wider font-mono text-[11px]">
                  <th className="py-4 px-5">Gamer Tag & Name</th>
                  <th className="py-4 px-5">Contact (Staff)</th>
                  <th className="py-4 px-5 text-center">Role</th>
                  <th className="py-4 px-5 text-right">Overall MMR</th>
                  <th className="py-4 px-5 text-center">Record (W/L/D)</th>
                  <th className="py-4 px-5 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filtered.map((player) => (
                  <tr key={player.uid} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-4 px-5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-xs text-cyan-400 font-mono">
                          {player.gamerTag.substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div
                            onClick={() => onSelectPlayerProfile?.(player.uid)}
                            className="font-bold text-white hover:text-cyan-400 cursor-pointer font-display text-sm"
                          >
                            {player.gamerTag}
                          </div>
                          <div className="text-[11px] text-slate-400">{player.fullName}</div>
                        </div>
                      </div>
                    </td>

                    <td className="py-4 px-5 font-mono text-slate-400">
                      <div>{player.email}</div>
                      {player.phoneNumber && (
                        <div className="text-[10px] text-slate-500">{player.phoneNumber}</div>
                      )}
                    </td>

                    <td className="py-4 px-5 text-center">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                          normalizeUserRole(player.role) === 'SUPER_ADMIN'
                            ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                            : normalizeUserRole(player.role) === 'ADMIN'
                            ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                            : normalizeUserRole(player.role) === 'STAFF'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : 'bg-slate-800 text-slate-300 border border-slate-700'
                        }`}
                      >
                        {normalizeUserRole(player.role) === 'SUPER_ADMIN' ? (
                          <span>👑 SUPER ADMIN</span>
                        ) : normalizeUserRole(player.role) === 'ADMIN' ? (
                          <>
                            <Shield className="w-3 h-3 text-red-400" />
                            <span>ADMIN</span>
                          </>
                        ) : normalizeUserRole(player.role) === 'STAFF' ? (
                          <>
                            <UserCheck className="w-3 h-3 text-emerald-400" />
                            <span>STAFF</span>
                          </>
                        ) : (
                          <span>PLAYER</span>
                        )}
                      </span>
                    </td>

                    <td className="py-4 px-5 text-right font-display font-black text-cyan-400 text-sm font-mono-numbers">
                      {player.overallRating || 1000}
                    </td>

                    <td className="py-4 px-5 text-center font-mono">
                      <span className="text-emerald-400 font-bold">{player.totalWins || 0}W</span>{' '}
                      <span className="text-slate-600">/</span>{' '}
                      <span className="text-red-400 font-bold">{player.totalLosses || 0}L</span>{' '}
                      <span className="text-slate-600">/</span>{' '}
                      <span className="text-slate-400">{player.totalDraws || 0}D</span>
                    </td>

                    <td className="py-4 px-5 text-center">
                      <div className="flex items-center justify-center gap-2">
                        {normalizeUserRole(player.role) === 'SUPER_ADMIN' ? (
                          <span className="text-[10px] font-mono text-purple-400 font-bold">Protected</span>
                        ) : canManageRoles ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleInitiateRoleAction(player);
                            }}
                            disabled={updatingUid === player.uid || player.uid === currentAuthUser?.uid}
                            className={`relative z-10 px-3 py-1.5 rounded-xl text-[11px] font-bold font-mono transition-colors cursor-pointer active:scale-95 ${
                              normalizeUserRole(player.role) === 'ADMIN' || normalizeUserRole(player.role) === 'STAFF'
                                ? 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                                : 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30'
                            } disabled:opacity-40 disabled:cursor-not-allowed`}
                          >
                            <span className="pointer-events-none">
                              {updatingUid === player.uid
                                ? 'Updating...'
                                : normalizeUserRole(player.role) === 'ADMIN' || normalizeUserRole(player.role) === 'STAFF'
                                ? 'Revoke Role'
                                : 'Promote to Staff'}
                            </span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onSelectPlayerProfile?.(player.uid)}
                            className="px-3 py-1.5 rounded-xl text-[11px] font-bold font-mono transition-colors bg-neutral-800 hover:bg-neutral-700 text-neutral-300 border border-neutral-700 hover:text-white cursor-pointer active:scale-95"
                          >
                            View
                          </button>
                        )}

                        {/* Super Admin Permanent Player Removal Button */}
                        {isSuperAdmin &&
                          player.uid !== currentAuthUser?.uid &&
                          player.uid !== FOUNDING_SUPER_ADMIN_UID &&
                          normalizeUserRole(player.role) !== 'SUPER_ADMIN' && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleInitiateRemovePlayer(player);
                              }}
                              disabled={updatingUid === player.uid}
                              className="relative z-10 px-2.5 py-1.5 rounded-xl text-[11px] font-bold font-mono transition-all cursor-pointer active:scale-95 bg-red-500/10 hover:bg-red-500/25 text-red-400 hover:text-red-300 border border-red-500/30 flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                              title="Permanently remove player account (Super Admin only)"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-red-400 pointer-events-none" />
                              <span className="pointer-events-none">Remove Player</span>
                            </button>
                          )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* IN-DOM CONFIRMATION DIALOG MODAL FOR PLAYERS DIRECTORY */}
      {confirmAction && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg bg-[#0e0e17] border-2 border-purple-500/60 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
            <button
              type="button"
              onClick={() => {
                if (!updatingUid) setConfirmAction(null);
              }}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            {confirmAction.type === 'PROMOTE' ? (
              <>
                <div className="flex items-start gap-3">
                  <div className="p-2.5 rounded-2xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                    <UserCheck className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black font-display text-white uppercase tracking-wide">
                      Promote {confirmAction.player.fullName || confirmAction.player.gamerTag} to Staff?
                    </h3>
                    <p className="text-xs text-slate-400 font-mono mt-0.5">
                      Grant staff authority and match coordination capabilities
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-[#141420] border border-slate-800 space-y-2 text-xs font-mono">
                  <div className="flex justify-between items-center py-1 border-b border-slate-800/80">
                    <span className="text-slate-400">Player:</span>
                    <strong className="text-white text-sm">
                      {confirmAction.player.fullName || confirmAction.player.gamerTag} (@{confirmAction.player.gamerTag})
                    </strong>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-800/80">
                    <span className="text-slate-400">Target User UID:</span>
                    <span className="text-slate-300">{confirmAction.player.uid}</span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-slate-400">New Role Assigned:</span>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/40">
                      STAFF
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setConfirmAction(null)}
                    disabled={!!updatingUid}
                    className="flex-1 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold font-mono transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleExecuteRoleAction}
                    disabled={!!updatingUid}
                    className="flex-1 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-black font-mono uppercase tracking-wider transition shadow-lg shadow-emerald-950/60 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {updatingUid ? (
                      <span className="inline-block w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <UserCheck className="w-4 h-4" />
                        <span>Confirm Promotion</span>
                      </>
                    )}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-start gap-3">
                  <div className="p-2.5 rounded-2xl bg-amber-500/20 text-amber-300 border border-amber-500/40">
                    <AlertTriangle className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black font-display text-white uppercase tracking-wide">
                      Revoke Staff Privileges?
                    </h3>
                    <p className="text-xs text-slate-400 font-mono mt-0.5">
                      Target user will return to standard Player status
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-[#141420] border border-slate-800 space-y-2 text-xs font-mono">
                  <div className="flex justify-between items-center py-1">
                    <span className="text-slate-400">Player:</span>
                    <strong className="text-white text-sm">
                      {confirmAction.player.fullName || confirmAction.player.gamerTag} (@{confirmAction.player.gamerTag})
                    </strong>
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setConfirmAction(null)}
                    disabled={!!updatingUid}
                    className="flex-1 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold font-mono transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleExecuteRoleAction}
                    disabled={!!updatingUid}
                    className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-black font-mono uppercase tracking-wider transition shadow-lg shadow-red-950/60 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {updatingUid ? (
                      <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <span>Confirm Revocation</span>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* SUPER ADMIN PERMANENT PLAYER REMOVAL CONFIRMATION DIALOG MODAL */}
      {removalTarget && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg bg-[#0e0e17] border-2 border-red-600/70 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
            <button
              type="button"
              onClick={() => {
                if (!isRemoving) {
                  setRemovalTarget(null);
                  setConfirmInput('');
                }
              }}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Header & Warning */}
            <div className="flex items-start gap-3">
              <div className="p-3 rounded-2xl bg-red-500/20 text-red-400 border border-red-500/40 shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-black font-display text-white uppercase tracking-wide text-red-400">
                  Permanently remove this player?
                </h3>
                <p className="text-xs text-slate-300 font-mono mt-1">
                  This will permanently remove the player's Nexus application account and associated application data.
                </p>
                <p className="text-xs text-red-400 font-bold font-mono mt-0.5">
                  This action cannot be undone.
                </p>
              </div>
            </div>

            {/* DO NOT ALLOW ACCIDENTAL REMOVAL: Pre-Deletion Player Summary Card */}
            <div className="p-4 rounded-2xl bg-[#141420] border border-slate-800 space-y-2 text-xs font-mono">
              <div className="flex justify-between items-center py-1 border-b border-slate-800/80">
                <span className="text-slate-400">Player:</span>
                <span className="text-white font-bold">{removalTarget.fullName || removalTarget.gamerTag}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-800/80">
                <span className="text-slate-400">GamerTag:</span>
                <span className="text-cyan-400 font-bold">{removalTarget.gamerTag}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-800/80">
                <span className="text-slate-400">Role:</span>
                <span className="text-slate-300 font-bold">{normalizeUserRole(removalTarget.role)}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-800/80">
                <span className="text-slate-400">Nexus Coins:</span>
                <span className="text-amber-400 font-bold">{removalTarget.nexusCoins || 0}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-800/80">
                <span className="text-slate-400">Matches:</span>
                <span className="text-slate-200 font-bold">
                  {removalTarget.totalGames ||
                    (removalTarget.totalWins || 0) + (removalTarget.totalLosses || 0) + (removalTarget.totalDraws || 0)}
                </span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-slate-400">Status:</span>
                <span className="text-emerald-400 font-bold">{removalTarget.status || 'ACTIVE'}</span>
              </div>
            </div>

            {/* Confirmation Input Requirement */}
            <div className="space-y-2">
              <label className="block text-xs font-mono text-slate-300">
                Enter the player's GamerTag (<span className="text-cyan-400 font-bold">{removalTarget.gamerTag}</span>) or type{' '}
                <span className="text-red-400 font-bold">REMOVE</span> to confirm:
              </label>
              <input
                type="text"
                value={confirmInput}
                onChange={(e) => {
                  setConfirmInput(e.target.value);
                  if (removalError) setRemovalError(null);
                }}
                placeholder={`Type "${removalTarget.gamerTag}" or "REMOVE"`}
                disabled={isRemoving}
                autoFocus
                className="w-full px-4 py-2.5 bg-[#08080c] border border-red-500/40 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-red-500 font-mono tracking-wider"
              />
            </div>

            {/* Error & Active Session Conflict Alert */}
            {removalError && (
              <div className="p-3.5 rounded-2xl bg-red-950/60 border border-red-500/50 space-y-2">
                <div className="flex items-start gap-2.5 text-xs text-red-200 font-mono">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <span>{removalError}</span>
                </div>
                {removalError.includes('active match or lobby') && (
                  <button
                    type="button"
                    onClick={() => handleExecuteRemovePlayer(true)}
                    disabled={isRemoving}
                    className="w-full py-2 px-3 rounded-xl bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-200 text-xs font-mono font-bold flex items-center justify-center gap-1.5 cursor-pointer transition active:scale-95"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-400" />
                    <span>Auto-Cancel Active Sessions & Force Remove</span>
                  </button>
                )}
              </div>
            )}

            {/* Action Buttons: [ CANCEL ] [ PERMANENTLY REMOVE ] */}
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setRemovalTarget(null);
                  setConfirmInput('');
                  setRemovalError(null);
                }}
                disabled={isRemoving}
                className="flex-1 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold font-mono transition cursor-pointer"
              >
                CANCEL
              </button>
              <button
                type="button"
                onClick={() => handleExecuteRemovePlayer(true)}
                disabled={
                  isRemoving ||
                  (confirmInput.trim().toUpperCase() !== 'REMOVE' &&
                    confirmInput.trim().toLowerCase() !== (removalTarget.gamerTag || '').toLowerCase())
                }
                className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-500 disabled:bg-slate-800/80 disabled:text-slate-600 disabled:border disabled:border-slate-800 disabled:cursor-not-allowed text-white text-xs font-black font-mono uppercase tracking-wider transition shadow-lg shadow-red-950/60 flex items-center justify-center gap-2 cursor-pointer"
              >
                {isRemoving ? (
                  <>
                    <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Removing...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>PERMANENTLY REMOVE</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
