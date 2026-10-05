import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Season } from '../types';
import {
  subscribeToActiveSeason,
  fetchAllSeasons,
  updateSeasonDetails,
  endSeasonAndStartNext,
  checkAndProcessExpiredSeason,
  removeSeason,
  migrateLegacyCatalogAndFCData,
} from '../services/seasonService';
import {
  Trophy,
  Crown,
  AlertTriangle,
  CheckCircle2,
  Edit2,
  Sparkles,
  Loader2,
  Zap,
  Trash2,
  Eye,
  ShieldAlert,
} from 'lucide-react';

export const AdminSeasonsView: React.FC = () => {
  const { playerProfile, isAdmin, isSuperAdmin } = useAuth();

  const [activeSeason, setActiveSeason] = useState<Season | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [allSeasons, setAllSeasons] = useState<Season[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Edit Active Season State
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editStartDate, setEditStartDate] = useState('');
  const [editEndDate, setEditEndDate] = useState('');

  // End Season Modal State
  const [showEndSeasonModal, setShowEndSeasonModal] = useState(false);
  const [nextSeasonName, setNextSeasonName] = useState('');
  const [nextStartDate, setNextStartDate] = useState('');
  const [nextEndDate, setNextEndDate] = useState('');
  const [transitioning, setTransitioning] = useState(false);

  // Testing expiration state
  const [triggeringTest, setTriggeringTest] = useState(false);

  // Season Management & Removal State (Requirements 6, 7, 8)
  const [seasonToRemove, setSeasonToRemove] = useState<Season | null>(null);
  const [seasonToView, setSeasonToView] = useState<Season | null>(null);
  const [activeSeasonAlert, setActiveSeasonAlert] = useState(false);
  const [removeConfirmationInput, setRemoveConfirmationInput] = useState('');
  const [removingSeason, setRemovingSeason] = useState(false);
  const [migratingCatalog, setMigratingCatalog] = useState(false);

  const handleOpenRemoveModal = (season: Season) => {
    if (season.status === 'ACTIVE') {
      setError('You cannot remove an active season. Finalize or close the season first.');
      setActiveSeasonAlert(true);
      return;
    }
    setSeasonToRemove(season);
    setRemoveConfirmationInput('');
  };

  const handleExecuteSeasonRemoval = async () => {
    if (!seasonToRemove || !playerProfile) return;
    const expected = `REMOVE ${(seasonToRemove.name || `SEASON ${seasonToRemove.number}`).toUpperCase().trim()}`;
    if (removeConfirmationInput.trim().toUpperCase() !== expected) {
      setError(`Confirmation mismatch. You must type exactly: "${expected}".`);
      return;
    }

    setRemovingSeason(true);
    setError(null);
    try {
      const res = await removeSeason({
        seasonId: seasonToRemove.id,
        confirmationInput: removeConfirmationInput,
        actor: {
          uid: playerProfile.uid,
          role: playerProfile.role,
          gamerTag: playerProfile.gamerTag || 'Super Admin',
        },
      });

      if (res.success) {
        setSuccessMsg(`Successfully removed ${seasonToRemove.name}. Ratings and Hall of Fame references cleaned.`);
        setSeasonToRemove(null);
        await loadData();
      } else {
        setError(res.error || 'Failed to remove season.');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to remove season.');
    } finally {
      setRemovingSeason(false);
    }
  };

  const handleRunCatalogMigration = async () => {
    setMigratingCatalog(true);
    setError(null);
    try {
      const res = await migrateLegacyCatalogAndFCData();
      if (res.success) {
        setSuccessMsg(`Catalog Migration Complete: ${res.migratedRatingsCount} FC ratings unified, ${res.archivedAnnouncementsCount} unwanted game announcements archived.`);
      } else {
        setError('Migration completed with warnings.');
      }
    } catch (err: any) {
      setError(err.message || 'Catalog migration failed.');
    } finally {
      setMigratingCatalog(false);
    }
  };

  const loadData = async () => {
    try {
      const seasons = await fetchAllSeasons();
      setAllSeasons(seasons);
    } catch (err: any) {
      setError(err.message || 'Failed to load seasons');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    // Real-time active season listener
    const unsub = subscribeToActiveSeason((season, processing) => {
      setActiveSeason(season);
      setIsProcessing(Boolean(processing));
      setLoading(false);

      if (season) {
        setEditName(season.name);
        setEditStartDate(new Date(season.startDate).toISOString().split('T')[0]);
        setEditEndDate(new Date(season.endDate).toISOString().split('T')[0]);

        // Pre-fill next season
        const nextNum = (season.number || 1) + 1;
        setNextSeasonName(`Season ${nextNum}`);
        const nextStart = new Date(season.endDate + 86400000);
        const nextEnd = new Date(nextStart);
        nextEnd.setMonth(nextEnd.getMonth() + 4);
        nextEnd.setDate(nextEnd.getDate() - 1);

        setNextStartDate(nextStart.toISOString().split('T')[0]);
        setNextEndDate(nextEnd.toISOString().split('T')[0]);
      }
    });

    return () => unsub();
  }, []);

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSeason) return;

    try {
      const startTs = new Date(editStartDate).getTime();
      const endTs = new Date(editEndDate).getTime();

      if (isNaN(startTs) || isNaN(endTs) || endTs <= startTs) {
        setError('End date must be after start date');
        return;
      }

      const res = await updateSeasonDetails(activeSeason.id, {
        name: editName,
        startDate: startTs,
        endDate: endTs,
      });

      if (res.success) {
        setSuccessMsg('Season dates updated successfully');
        setIsEditing(false);
        await loadData();
      } else {
        setError(res.error || 'Failed to update season');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to update season');
    }
  };

  // Quick test feature: sets end date to 10 seconds in the future
  const handleFastTestExpiration = async () => {
    if (!activeSeason) return;
    setTriggeringTest(true);
    setError(null);
    try {
      const testEndDate = Date.now() + 10000; // 10 seconds from now
      await updateSeasonDetails(activeSeason.id, {
        endDate: testEndDate,
      });
      setSuccessMsg('Set active season end date to 10 seconds from now! Watch the countdown hit 0, process champions, and automatically reset for next season.');
    } catch (err: any) {
      setError(err.message || 'Failed to trigger test expiration');
    } finally {
      setTriggeringTest(false);
    }
  };

  const handleConfirmEndSeason = async () => {
    if (!activeSeason || !playerProfile) return;

    setTransitioning(true);
    setError(null);
    try {
      const startTs = new Date(nextStartDate).getTime();
      const endTs = new Date(nextEndDate).getTime();

      if (isNaN(startTs) || isNaN(endTs) || endTs <= startTs) {
        setError('Next season end date must be after start date');
        setTransitioning(false);
        return;
      }

      const res = await endSeasonAndStartNext({
        currentSeasonId: activeSeason.id,
        nextSeasonName,
        nextStartDate: startTs,
        nextEndDate: endTs,
        adminId: playerProfile?.uid || 'admin',
        adminName: playerProfile?.gamerTag || playerProfile?.fullName || 'Admin',
      });

      if (res.success) {
        setSuccessMsg(`Successfully completed ${activeSeason.name} and launched ${nextSeasonName}!`);
        setShowEndSeasonModal(false);
        await loadData();
      } else {
        setError(res.error || 'Failed to transition season');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to transition season');
    } finally {
      setTransitioning(false);
    }
  };

  // Live countdown calculation
  let daysRemaining = 0;
  if (activeSeason?.endDate) {
    const diff = activeSeason.endDate - Date.now();
    daysRemaining = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }

  return (
    <div className="space-y-6">
      {/* Status Alerts */}
      {error && (
        <div className="p-4 rounded-2xl bg-red-950/40 border border-red-500/50 flex items-center justify-between text-xs text-red-300">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-white font-mono font-bold">
            ✕
          </button>
        </div>
      )}

      {successMsg && (
        <div className="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-500/50 flex items-center justify-between text-xs text-emerald-300">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-400 hover:text-white font-mono font-bold">
            ✕
          </button>
        </div>
      )}

      {/* Active Season Banner & Actions */}
      {activeSeason ? (
        <div className="p-6 rounded-3xl bg-[#08080a] border border-red-600/30 space-y-6 shadow-xl relative overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-4">
            <div>
              <div className="flex items-center gap-2">
                {isProcessing ? (
                  <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/50 text-amber-300 text-[10px] font-mono font-black uppercase flex items-center gap-1.5 animate-pulse">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>TRANSITION IN PROGRESS</span>
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-950/40 border border-emerald-500/40 text-emerald-400 text-[10px] font-mono font-bold uppercase">
                    ● ACTIVE SEASON
                  </span>
                )}
                <span className="text-xs font-mono text-zinc-400">
                  Cycle #{activeSeason.number}
                </span>
              </div>
              <h2 className="text-2xl font-black font-display text-white mt-1">
                {activeSeason.name.toUpperCase()}
              </h2>
            </div>

            {isAdmin && (
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  id="btn-fast-test-season"
                  disabled={triggeringTest || isProcessing}
                  onClick={handleFastTestExpiration}
                  className="px-3.5 py-2 rounded-xl bg-purple-950/40 hover:bg-purple-900/60 text-purple-300 border border-purple-500/40 text-xs font-mono font-bold flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
                  title="Sets end time to 10 seconds in the future to test auto-transition and Hall of Fame crowning"
                >
                  <Zap className="w-3.5 h-3.5 text-purple-400" />
                  <span>🧪 Fast-Test End (10s)</span>
                </button>

                <button
                  onClick={() => setIsEditing(!isEditing)}
                  className="px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-200 text-xs font-mono font-bold flex items-center gap-1.5 transition-colors border border-zinc-700 cursor-pointer"
                >
                  <Edit2 className="w-3.5 h-3.5 text-red-400" />
                  <span>{isEditing ? 'Cancel Edit' : 'Edit Season Dates'}</span>
                </button>

                <button
                  onClick={() => setShowEndSeasonModal(true)}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 text-white text-xs font-mono font-black uppercase flex items-center gap-1.5 shadow-[0_4px_16px_rgba(220,38,38,0.3)] active:scale-95 transition-all cursor-pointer"
                >
                  <Crown className="w-4 h-4 text-amber-300" />
                  <span>Manual End & Crown</span>
                </button>
              </div>
            )}
          </div>

          {/* Edit Form */}
          {isEditing && (
            <form onSubmit={handleSaveEdit} className="p-4 rounded-2xl bg-[#0f0f13] border border-red-600/40 space-y-4">
              <h4 className="text-xs font-bold font-mono uppercase text-red-400">Edit Active Season Settings</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] font-mono text-zinc-400 uppercase mb-1">Season Name</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-xl bg-[#08080a] border border-zinc-700 text-xs font-mono text-white focus:outline-none focus:border-red-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono text-zinc-400 uppercase mb-1">Start Date</label>
                  <input
                    type="date"
                    value={editStartDate}
                    onChange={(e) => setEditStartDate(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-xl bg-[#08080a] border border-zinc-700 text-xs font-mono text-white focus:outline-none focus:border-red-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono text-zinc-400 uppercase mb-1">End Date</label>
                  <input
                    type="date"
                    value={editEndDate}
                    onChange={(e) => setEditEndDate(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-xl bg-[#08080a] border border-zinc-700 text-xs font-mono text-white focus:outline-none focus:border-red-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-3 py-1.5 rounded-xl bg-zinc-800 text-zinc-300 text-xs font-mono"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-mono font-bold text-xs"
                >
                  Save Changes
                </button>
              </div>
            </form>
          )}

          {/* Active Season Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-2xl bg-[#0f0f13] border border-zinc-800">
              <div className="text-[10px] font-mono text-zinc-400 uppercase">Schedule</div>
              <div className="text-sm font-bold font-mono text-white mt-1">
                {new Date(activeSeason.startDate).toLocaleDateString()} → {new Date(activeSeason.endDate).toLocaleDateString()}
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#0f0f13] border border-zinc-800">
              <div className="text-[10px] font-mono text-zinc-400 uppercase">Days Remaining</div>
              <div className="text-xl font-black font-display text-red-400 font-mono-numbers mt-0.5">
                {daysRemaining} Days
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#0f0f13] border border-zinc-800">
              <div className="text-[10px] font-mono text-zinc-400 uppercase">Length</div>
              <div className="text-sm font-bold font-mono text-white mt-1">
                4 Months (3 / Year)
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#0f0f13] border border-zinc-800">
              <div className="text-[10px] font-mono text-zinc-400 uppercase">Status</div>
              <div className="text-sm font-bold font-mono text-emerald-400 mt-1 uppercase">
                {isProcessing ? 'Processing Transition' : 'Active & Accepting Matches'}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-8 rounded-3xl bg-[#08080a] border border-zinc-800 text-center">
          <p className="text-xs text-zinc-400">Loading season control panel...</p>
        </div>
      )}

      {/* SEASON MANAGEMENT (Super Admin & Admin interface) */}
      <div id="nexus-season-management" className="p-6 rounded-3xl bg-[#08080a] border border-zinc-800/90 space-y-4 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800/80 pb-3">
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-red-500" />
            <div>
              <h3 className="text-lg font-black font-display text-white tracking-tight">SEASON MANAGEMENT</h3>
              <p className="text-[11px] font-mono text-zinc-400">Official competitive cycle archive & Super Admin control</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isSuperAdmin && (
              <button
                disabled={migratingCatalog}
                onClick={handleRunCatalogMigration}
                className="px-3 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-mono font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Normalize legacy FC26/FC27 records to unified FC and archive unwanted game announcements"
              >
                {migratingCatalog ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <span>⚡ Normalize FC & Catalog</span>}
              </button>
            )}
            <span className="text-xs font-mono text-zinc-400">
              {allSeasons.length} Total Seasons
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-400 uppercase font-bold text-[10px]">
                <th className="py-2.5 px-3">Season</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Dates</th>
                <th className="py-2.5 px-3">Champions Crowned</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {allSeasons.map((s) => (
                <tr key={s.id} className="hover:bg-zinc-900/40 transition-colors">
                  <td className="py-3 px-3 font-bold text-white font-display">
                    {s.name}
                  </td>
                  <td className="py-3 px-3">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                        s.status === 'ACTIVE'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : s.status === 'COMPLETED'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          : 'bg-zinc-800 text-zinc-400'
                      }`}
                    >
                      {s.status}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-zinc-400">
                    {new Date(s.startDate).toLocaleDateString()} → {new Date(s.endDate).toLocaleDateString()}
                  </td>
                  <td className="py-3 px-3 text-zinc-300">
                    {s.champions && s.champions.length > 0 ? (
                      <span className="text-amber-400 font-bold">
                        👑 {s.champions.length} Game Champions
                      </span>
                    ) : (
                      <span className="text-zinc-500">In Progress</span>
                    )}
                  </td>
                  <td className="py-3 px-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => setSeasonToView(s)}
                        className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-[11px] font-bold transition-colors cursor-pointer"
                        title="View season details"
                      >
                        [ VIEW ]
                      </button>

                      {isSuperAdmin && (
                        <button
                          onClick={() => handleOpenRemoveModal(s)}
                          className="px-2.5 py-1 rounded-lg bg-red-950/40 hover:bg-red-900/60 text-red-400 hover:text-red-300 border border-red-500/30 text-[11px] font-bold transition-colors cursor-pointer"
                          title="Permanently remove season"
                        >
                          [ REMOVE ]
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

      {/* Permanently Remove Season Confirmation Modal (Super Admin Only) */}
      {seasonToRemove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="w-full max-w-lg rounded-3xl bg-[#0c0c12] border border-red-600/50 p-6 sm:p-8 space-y-6 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-red-950/60 border border-red-500/40 flex items-center justify-center text-red-400">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xl font-black font-display text-white tracking-tight">
                    PERMANENTLY REMOVE SEASON?
                  </h3>
                  <span className="text-xs font-mono text-red-400 font-bold uppercase">
                    Super Admin Authorization Required
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSeasonToRemove(null)}
                className="text-zinc-500 hover:text-white font-mono text-sm"
              >
                ✕
              </button>
            </div>

            <div className="p-4 rounded-2xl bg-red-950/30 border border-red-500/30 text-xs font-mono space-y-3 text-red-200">
              <div className="text-sm font-bold text-white font-display">
                {seasonToRemove.name}
              </div>
              <p className="text-zinc-300 leading-relaxed text-[11px]">
                This will remove this season from the active ranking/history system and remove its public Hall of Fame/announcement references.
              </p>
              <p className="text-zinc-400 leading-relaxed text-[11px]">
                Historical records that are required for audit integrity may be preserved as archived records.
              </p>
              <p className="text-red-400 font-bold text-[11px]">
                This action cannot be undone.
              </p>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-mono text-zinc-300">
                Type: <strong className="text-red-400 select-all font-mono">REMOVE {(seasonToRemove.name || `SEASON ${seasonToRemove.number}`).toUpperCase().trim()}</strong>
              </label>
              <input
                type="text"
                value={removeConfirmationInput}
                onChange={(e) => setRemoveConfirmationInput(e.target.value)}
                placeholder={`REMOVE ${(seasonToRemove.name || `SEASON ${seasonToRemove.number}`).toUpperCase().trim()}`}
                className="w-full px-4 py-2.5 rounded-xl bg-black border border-zinc-700 text-xs font-mono text-white focus:outline-none focus:border-red-500 uppercase"
              />
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-zinc-800 pt-4">
              <button
                type="button"
                disabled={removingSeason}
                onClick={() => setSeasonToRemove(null)}
                className="px-4 py-2 rounded-xl bg-zinc-800 text-zinc-300 text-xs font-mono font-bold hover:bg-zinc-700 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={
                  removingSeason ||
                  removeConfirmationInput.trim().toUpperCase() !== `REMOVE ${(seasonToRemove.name || `SEASON ${seasonToRemove.number}`).toUpperCase().trim()}`
                }
                onClick={handleExecuteSeasonRemoval}
                className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:hover:bg-red-600 text-white text-xs font-mono font-black uppercase shadow-lg transition-all flex items-center gap-2 cursor-pointer disabled:cursor-not-allowed"
              >
                {removingSeason ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Removing...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>PERMANENTLY REMOVE</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Active Season Protected Alert Modal */}
      {activeSeasonAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl bg-[#0e0e14] border border-amber-500/50 p-6 space-y-4 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-black font-display text-white">ACTIVE SEASON PROTECTED</h3>
                <span className="text-[10px] font-mono text-zinc-400">Security Invariant Enforced</span>
              </div>
            </div>
            <p className="text-xs font-mono text-zinc-300 leading-relaxed bg-amber-500/10 p-3 rounded-xl border border-amber-500/20">
              You cannot remove an active season. Finalize or close the season first.
            </p>
            <div className="flex justify-end pt-2">
              <button
                onClick={() => setActiveSeasonAlert(false)}
                className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-mono font-bold cursor-pointer"
              >
                Understood
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Season Details Modal */}
      {seasonToView && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl bg-[#0e0e14] border border-zinc-700 p-6 space-y-6 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
              <div className="flex items-center gap-2.5">
                <Eye className="w-5 h-5 text-cyan-400" />
                <h3 className="text-lg font-black font-display text-white uppercase">
                  {seasonToView.name} Details
                </h3>
              </div>
              <button
                onClick={() => setSeasonToView(null)}
                className="text-zinc-500 hover:text-white font-mono text-sm"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs font-mono">
              <div className="p-3 rounded-xl bg-black border border-zinc-800">
                <div className="text-[10px] text-zinc-500 uppercase font-bold">Status</div>
                <div className="text-sm font-bold text-white mt-1">{seasonToView.status}</div>
              </div>
              <div className="p-3 rounded-xl bg-black border border-zinc-800">
                <div className="text-[10px] text-zinc-500 uppercase font-bold">Cycle Number</div>
                <div className="text-sm font-bold text-cyan-400 mt-1">#{seasonToView.number}</div>
              </div>
              <div className="p-3 rounded-xl bg-black border border-zinc-800">
                <div className="text-[10px] text-zinc-500 uppercase font-bold">Start Date</div>
                <div className="text-zinc-300 mt-1">{new Date(seasonToView.startDate).toLocaleDateString()}</div>
              </div>
              <div className="p-3 rounded-xl bg-black border border-zinc-800">
                <div className="text-[10px] text-zinc-500 uppercase font-bold">End Date</div>
                <div className="text-zinc-300 mt-1">{new Date(seasonToView.endDate).toLocaleDateString()}</div>
              </div>
            </div>

            {seasonToView.champions && seasonToView.champions.length > 0 && (
              <div className="space-y-2">
                <div className="text-[10px] font-mono text-zinc-400 uppercase font-bold">
                  👑 Crowned Champions ({seasonToView.champions.length})
                </div>
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {seasonToView.champions.map((c, idx) => (
                    <div
                      key={idx}
                      className="p-2 rounded-lg bg-black border border-amber-500/20 flex items-center justify-between text-xs font-mono"
                    >
                      <span className="text-amber-300 font-bold">{c.gameName}</span>
                      <span className="text-white font-bold">{c.gamerTag}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end border-t border-zinc-800 pt-4">
              <button
                onClick={() => setSeasonToView(null)}
                className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-mono font-bold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* End Season & Start Next Season Modal */}
      {showEndSeasonModal && activeSeason && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-3xl bg-[#0e0e14] border border-amber-500/40 p-6 space-y-6 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
              <div className="flex items-center gap-2.5">
                <Crown className="w-6 h-6 text-amber-400" />
                <h3 className="text-xl font-black font-display text-white">
                  END {activeSeason.name.toUpperCase()} & LAUNCH NEXT
                </h3>
              </div>
              <button
                onClick={() => setShowEndSeasonModal(false)}
                className="text-zinc-400 hover:text-white font-mono"
              >
                ✕
              </button>
            </div>

            {/* Explanation box of what will happen */}
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-xs space-y-2 text-amber-200 font-mono">
              <div className="font-bold flex items-center gap-1.5 text-amber-400 uppercase">
                <Sparkles className="w-4 h-4" />
                <span>Automated Season Transition Execution:</span>
              </div>
              <ul className="list-disc list-inside space-y-1 text-zinc-300 text-[11px]">
                <li>
                  <strong>1. Freeze Standings:</strong> Locks {activeSeason.name} final ranks for all games.
                </li>
                <li>
                  <strong>2. Crown Champions:</strong> Inducts the #1 player in each game into the 👑 Nexus Hall of Fame.
                </li>
                <li>
                  <strong>3. Soft MMR Reset:</strong> Applies official soft reset: <br />
                  <code className="bg-black/50 px-1 py-0.5 rounded text-amber-400">
                    New MMR = 1000 + ((Previous MMR - 1000) × 0.75)
                  </code>
                </li>
                <li>
                  <strong>4. Player History:</strong> Retains all past match records and all-time ratings permanently.
                </li>
              </ul>
            </div>

            {/* Next Season Form */}
            <div className="space-y-4">
              <h4 className="text-xs font-bold font-mono uppercase text-zinc-300">
                Configure Next Season
              </h4>

              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] font-mono text-zinc-400 uppercase mb-1">
                    Next Season Name
                  </label>
                  <input
                    type="text"
                    value={nextSeasonName}
                    onChange={(e) => setNextSeasonName(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-xl bg-[#08080a] border border-zinc-700 text-xs font-mono text-white focus:outline-none focus:border-amber-400"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-mono text-zinc-400 uppercase mb-1">
                      Start Date
                    </label>
                    <input
                      type="date"
                      value={nextStartDate}
                      onChange={(e) => setNextStartDate(e.target.value)}
                      required
                      className="w-full px-3 py-2 rounded-xl bg-[#08080a] border border-zinc-700 text-xs font-mono text-white focus:outline-none focus:border-amber-400"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono text-zinc-400 uppercase mb-1">
                      End Date
                    </label>
                    <input
                      type="date"
                      value={nextEndDate}
                      onChange={(e) => setNextEndDate(e.target.value)}
                      required
                      className="w-full px-3 py-2 rounded-xl bg-[#08080a] border border-zinc-700 text-xs font-mono text-white focus:outline-none focus:border-amber-400"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 border-t border-zinc-800 pt-4">
              <button
                type="button"
                disabled={transitioning}
                onClick={() => setShowEndSeasonModal(false)}
                className="px-4 py-2 rounded-xl bg-zinc-800 text-zinc-300 text-xs font-mono font-bold hover:bg-zinc-700 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={transitioning}
                onClick={handleConfirmEndSeason}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 text-white text-xs font-mono font-black uppercase shadow-lg active:scale-95 transition-all flex items-center gap-2"
              >
                {transitioning ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Processing Transition...</span>
                  </>
                ) : (
                  <>
                    <Crown className="w-4 h-4 text-amber-300" />
                    <span>Confirm & Launch {nextSeasonName}</span>
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
