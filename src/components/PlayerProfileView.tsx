import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { fetchPlayerById, fetchPlayerGameRatings } from '../services/playerService';
import { subscribeToPlayerMatches } from '../services/matchService';
import { fetchPlayerSeasonHistory, fetchPlayerHallOfFameEntries } from '../services/seasonService';
import { fetchPlayerAchievements } from '../services/tournamentService';
import { fetchPlayerMatchHistory } from '../services/matchHistoryService';
import { Player, PlayerGameRating, Match, HallOfFameEntry, PlayerSeasonHistoryItem, TournamentAchievement, MatchHistoryRecord, Team } from '../types';
import { NexusRankBadge, UnrankedEmblem, RankEmblem } from './NexusRankBadge';
import { NEXUS_RANK_TIERS, getRankFromMMR } from '../lib/ranks';
import { normalizeUserRole } from '../services/roleService';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { sanitizeFirestoreData } from '../services/matchService';
import { fetchPlayerTeams } from '../services/teamService';
import { useToast } from './Toast';
import {
  User,
  Users,
  Trophy,
  Swords,
  Shield,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  Gamepad2,
  Zap,
  Award,
  Sparkles,
  ChevronRight,
  Crown,
  Medal,
  Edit2,
  Check,
  X,
  Phone,
  KeyRound,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { WinStreakAvatarWrapper, WinStreakBadge } from './WinStreakFire';

interface PlayerProfileViewProps {
  playerId?: string;
  onOpenCreateMatch?: () => void;
  onSelectMatch?: (matchId: string) => void;
  onNavigateToHallOfFame?: () => void;
}

export const PlayerProfileView: React.FC<PlayerProfileViewProps> = ({
  playerId,
  onOpenCreateMatch,
  onSelectMatch,
  onNavigateToHallOfFame,
}) => {
  const { user, playerProfile: currentAuthProfile, refreshProfile, changeCurrentPassword } = useAuth();
  const { showToast } = useToast();

  const targetId = playerId || user?.uid;
  const isOwnProfile = user?.uid === targetId;

  const [player, setPlayer] = useState<Player | null>(isOwnProfile ? currentAuthProfile : null);
  const [gameRatings, setGameRatings] = useState<PlayerGameRating[]>([]);
  const [seasonRatings, setSeasonRatings] = useState<PlayerSeasonHistoryItem[]>([]);
  const [championships, setChampionships] = useState<HallOfFameEntry[]>([]);
  const [tournamentAchievements, setTournamentAchievements] = useState<TournamentAchievement[]>([]);
  const [recentMatches, setRecentMatches] = useState<Match[]>([]);
  const [validatedMatchHistory, setValidatedMatchHistory] = useState<MatchHistoryRecord[]>([]);
  const [playerTeams, setPlayerTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTierLadder, setShowTierLadder] = useState(false);

  // Edit Profile modal / states
  const [isEditing, setIsEditing] = useState(false);
  const [editFullName, setEditFullName] = useState('');
  const [editPhoneNumber, setEditPhoneNumber] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Security / Change Password states
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [passwordChangeLoading, setPasswordChangeLoading] = useState(false);
  const [passwordChangeError, setPasswordChangeError] = useState<string | null>(null);
  const [passwordChangeSuccess, setPasswordChangeSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!targetId) return;

    let unsubMatches: (() => void) | null = null;

    const loadData = async () => {
      setLoading(true);
      try {
        const [pData, ratings, sHistoryRes, hofRecords, tournAchs, valHistory, teamsData] = await Promise.all([
          isOwnProfile && currentAuthProfile ? currentAuthProfile : fetchPlayerById(targetId),
          fetchPlayerGameRatings(targetId),
          fetchPlayerSeasonHistory(targetId),
          fetchPlayerHallOfFameEntries(targetId),
          fetchPlayerAchievements(targetId),
          fetchPlayerMatchHistory(targetId),
          fetchPlayerTeams(targetId).catch(() => []),
        ]);
        setPlayer(pData);
        if (pData) {
          setEditFullName(pData.fullName || '');
          setEditPhoneNumber(pData.phoneNumber || '');
        }
        setGameRatings(ratings);
        setSeasonRatings(sHistoryRes.history || []);
        setChampionships(hofRecords);
        setTournamentAchievements(tournAchs);
        setValidatedMatchHistory(valHistory);
        setPlayerTeams(teamsData || []);

        // Listen to matches
        unsubMatches = subscribeToPlayerMatches(targetId, (matches) => {
          setRecentMatches(matches.slice(0, 10));
        });
      } catch (err) {
        console.error('Error loading player profile:', err);
      } finally {
        setLoading(false);
      }
    };

    loadData();

    return () => {
      if (unsubMatches) unsubMatches();
    };
  }, [targetId, isOwnProfile, currentAuthProfile]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!player || !isOwnProfile) return;
    if (!editFullName.trim()) {
      showToast('error', 'Validation Error', 'Full Name cannot be empty.');
      return;
    }

    setSavingEdit(true);
    try {
      const pRef = doc(db, 'players', player.uid);
      const updates = {
        fullName: editFullName.trim(),
        phoneNumber: editPhoneNumber.trim(),
        updatedAt: Date.now(),
      };
      await updateDoc(pRef, sanitizeFirestoreData(updates));
      setPlayer((prev) => (prev ? { ...prev, ...updates } : null));
      await refreshProfile();
      setIsEditing(false);
      showToast('success', 'Profile Updated', 'Your profile details have been saved successfully.');
    } catch (err: any) {
      showToast('error', 'Update Failed', err.message || 'Could not save profile changes.');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleChangePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordChangeError(null);
    setPasswordChangeSuccess(null);

    if (!currentPassword) {
      setPasswordChangeError('Current password is required.');
      return;
    }

    if (!newPassword) {
      setPasswordChangeError('New password is required.');
      return;
    }

    if (newPassword.length < 6) {
      setPasswordChangeError('New password must be at least 6 characters with letters and numbers.');
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setPasswordChangeError('New passwords do not match. Please verify both fields.');
      return;
    }

    setPasswordChangeLoading(true);

    try {
      const res = await changeCurrentPassword(currentPassword, newPassword);
      if (res.success) {
        setPasswordChangeSuccess('PASSWORD UPDATED SUCCESSFULLY. Your Nexus account credentials are secure.');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmNewPassword('');
        showToast('success', 'Security Updated', 'Your password has been changed successfully.');
      } else {
        setPasswordChangeError(res.error || 'Failed to update password. Please check your credentials.');
        showToast('error', 'Security Error', res.error);
      }
    } catch (err: any) {
      setPasswordChangeError(err.message || 'An unexpected error occurred while updating your password.');
    } finally {
      setPasswordChangeLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="py-24 text-center">
        <div className="inline-block w-8 h-8 border-3 border-cyan-400 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-slate-400 text-xs font-mono">Loading player dossier...</p>
      </div>
    );
  }

  if (!player) {
    return (
      <div className="max-w-xl mx-auto py-16 text-center">
        <User className="w-12 h-12 text-slate-600 mx-auto mb-3" />
        <h3 className="text-xl font-bold font-display text-white">Player Profile Not Found</h3>
        <p className="text-sm text-slate-400 mt-1">This user profile may not exist or has been removed.</p>
      </div>
    );
  }

  const total = player.totalGames || 0;
  const wins = player.totalWins || 0;
  const losses = player.totalLosses || 0;
  const draws = player.totalDraws || 0;
  const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;
  const playerOverallRating = player.overallRating || 1000;
  const currentTier = getRankFromMMR(playerOverallRating);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      {/* Profile Header Hero with Official Ranking Logo & Badge */}
      <div className="relative overflow-hidden rounded-3xl bg-[#0a0a0f] border border-slate-800 p-6 sm:p-8 shadow-2xl">
        <div
          className={`absolute -top-24 -right-24 w-80 h-80 bg-gradient-to-b ${currentTier.bgGlowClass} rounded-full blur-3xl pointer-events-none`}
        />

        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 relative z-10">
          <div className="flex items-center gap-4 sm:gap-6">
            {/* Player Avatar or Official Nexus Tier Emblem */}
            <div className="relative shrink-0">
              <WinStreakAvatarWrapper streak={player.currentWinStreak || 0}>
                <div
                  className="absolute inset-0 rounded-2xl blur-md opacity-70 pointer-events-none"
                  style={{ backgroundColor: total < 10 ? '#eab308' : currentTier.colorHex }}
                />
                {total < 10 ? (
                  <UnrankedEmblem sizeClass="w-20 h-20 sm:w-24 sm:h-24" iconSizeClass="w-10 h-10 sm:w-12 sm:h-12" />
                ) : (
                  <RankEmblem
                    tier={currentTier}
                    sizeClass="w-20 h-20 sm:w-24 sm:h-24"
                    iconSizeClass="text-4xl sm:text-5xl"
                  />
                )}
              </WinStreakAvatarWrapper>
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2">
                {(() => {
                  const normRole = normalizeUserRole(player.role);
                  return (
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider border ${
                        normRole === 'SUPER_ADMIN'
                          ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                          : normRole === 'ADMIN'
                          ? 'bg-red-500/20 text-red-300 border-red-500/40'
                          : normRole === 'STAFF'
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                          : 'bg-slate-800 border-slate-700 text-slate-300'
                      }`}
                    >
                      {normRole === 'SUPER_ADMIN'
                        ? '👑 Super Admin'
                        : normRole === 'ADMIN'
                        ? '🛡️ Administrator'
                        : normRole === 'STAFF'
                        ? '💼 Staff Member'
                        : 'Competitor'}
                    </span>
                  );
                })()}
                {total < 10 ? (
                  <span className="px-2.5 py-0.5 rounded-full bg-yellow-500/15 border border-yellow-500/40 text-yellow-400 text-[10px] font-bold font-mono uppercase tracking-wider">
                    ⚪ UNRANKED ({total}/10 Matches)
                  </span>
                ) : (
                  <span
                    className={`px-2.5 py-0.5 rounded-full ${currentTier.badgeBgClass} border ${currentTier.borderColorClass} ${currentTier.textColorClass} text-[10px] font-bold font-mono uppercase tracking-wider`}
                  >
                    {currentTier.icon} {currentTier.name}
                  </span>
                )}
                {championships.length > 0 && (
                  <span className="px-2.5 py-0.5 rounded-full bg-yellow-500/20 text-yellow-300 border border-yellow-500/40 text-[10px] font-bold font-mono uppercase flex items-center gap-1">
                    <Crown className="w-3 h-3 text-yellow-400" />
                    <span>{championships.length}x CHAMPION</span>
                  </span>
                )}
                {(player.currentWinStreak || 0) >= 3 && (
                  <WinStreakBadge streak={player.currentWinStreak || 0} size="sm" />
                )}
                {isOwnProfile && (
                  <span className="px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 text-[10px] font-bold font-mono">
                    YOU
                  </span>
                )}
              </div>

              <h1 className="text-2xl sm:text-4xl font-black font-display text-white mt-1.5 flex items-center gap-3">
                <span>{player.gamerTag}</span>
                {isOwnProfile && !isEditing && (
                  <button
                    onClick={() => {
                      setEditFullName(player.fullName || '');
                      setEditPhoneNumber(player.phoneNumber || '');
                      setIsEditing(true);
                    }}
                    className="p-1.5 rounded-xl bg-slate-800/80 hover:bg-cyan-500/20 border border-slate-700 hover:border-cyan-400/50 text-slate-400 hover:text-cyan-400 transition-colors"
                    title="Edit Profile"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                )}
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                {player.fullName} {player.phoneNumber ? `• ${player.phoneNumber}` : ''}
              </p>
            </div>
          </div>

          {/* Primary Ranking Badge Card */}
          <div className="w-full lg:w-auto min-w-[280px]">
            <NexusRankBadge
              rating={playerOverallRating}
              size="md"
              showProgress={true}
              showDetails={true}
              isProvisional={total < 10}
              placementGames={total}
              gamesPlayed={total}
            />
          </div>
        </div>

        {/* Edit Profile inline drawer */}
        {isEditing && (
          <form
            onSubmit={handleSaveProfile}
            className="mt-6 pt-6 border-t border-slate-800 bg-[#121218]/90 rounded-2xl p-5 border border-cyan-500/30"
          >
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-sm font-bold text-white font-display flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-cyan-400" />
                <span>Edit Profile Details</span>
              </h4>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-mono uppercase text-slate-400 mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={editFullName}
                  onChange={(e) => setEditFullName(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-[#1a1a24] border border-slate-700 text-xs text-white focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="block text-[11px] font-mono uppercase text-slate-400 mb-1">
                  Phone Number
                </label>
                <input
                  type="tel"
                  value={editPhoneNumber}
                  onChange={(e) => setEditPhoneNumber(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-[#1a1a24] border border-slate-700 text-xs text-white focus:outline-none focus:border-cyan-400"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 mt-4">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-mono text-slate-300"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingEdit}
                className="px-4 py-1.5 rounded-xl bg-cyan-400 hover:bg-cyan-300 disabled:bg-slate-700 text-xs font-bold font-mono text-black flex items-center gap-1.5"
              >
                {savingEdit ? (
                  <span className="inline-block w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Save Changes</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* Aggregate Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-8 pt-6 border-t border-slate-800">
          <div className="p-3.5 rounded-2xl bg-[#15151b] border border-slate-800/80">
            <div className="text-[11px] text-slate-400 font-mono uppercase">Status</div>
            <div className={`text-xs font-bold font-mono mt-1 uppercase ${total < 10 ? 'text-yellow-400' : 'text-emerald-400'}`}>
              {total < 10 ? 'UNRANKED' : 'RANKED'}
            </div>
            {total < 10 && (
              <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                Placements: {total}/10
              </div>
            )}
          </div>
          <div className="p-3.5 rounded-2xl bg-[#15151b] border border-slate-800/80">
            <div className="text-[11px] text-slate-400 font-mono uppercase">Matches Played</div>
            <div className="text-xl font-bold font-display font-mono-numbers text-white mt-0.5">{total}</div>
          </div>
          <div className="p-3.5 rounded-2xl bg-[#15151b] border border-slate-800/80">
            <div className="text-[11px] text-slate-400 font-mono uppercase">Total Victories</div>
            <div className="text-xl font-bold font-display font-mono-numbers text-emerald-400 mt-0.5">{wins}</div>
          </div>
          <div className="p-3.5 rounded-2xl bg-[#15151b] border border-slate-800/80">
            <div className="text-[11px] text-slate-400 font-mono uppercase">Total Defeats</div>
            <div className="text-xl font-bold font-display font-mono-numbers text-red-400 mt-0.5">{losses}</div>
          </div>
          <div className="p-3.5 rounded-2xl bg-[#15151b] border border-slate-800/80">
            <div className="text-[11px] text-slate-400 font-mono uppercase">Win Rate</div>
            <div className="text-xl font-bold font-display font-mono-numbers text-yellow-400 mt-0.5">{winRate}%</div>
          </div>
        </div>
      </div>

      {/* SECURITY → CHANGE PASSWORD (Strictly for authenticated owner of profile) */}
      {isOwnProfile && (
        <div id="player-profile-security-section" className="p-6 rounded-3xl bg-[#0f1015] border border-slate-800 space-y-4 shadow-lg">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono font-bold text-cyan-400 uppercase tracking-widest">
                    SECURITY
                  </span>
                  <span className="text-slate-600 font-mono text-xs">→</span>
                  <span className="text-[10px] font-mono font-bold text-white uppercase tracking-wider">
                    CHANGE PASSWORD
                  </span>
                </div>
                <h3 className="text-sm font-bold font-display text-white mt-0.5">
                  Nexus Account Authentication Security
                </h3>
              </div>
            </div>

            <button
              id="toggle-change-password-btn"
              type="button"
              onClick={() => {
                setShowChangePassword(!showChangePassword);
                setPasswordChangeError(null);
                setPasswordChangeSuccess(null);
              }}
              className="px-4 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 hover:border-cyan-500/40 text-xs font-mono font-bold text-slate-200 hover:text-white flex items-center gap-2 transition-all cursor-pointer self-start sm:self-auto"
            >
              <KeyRound className="w-3.5 h-3.5 text-cyan-400" />
              <span>{showChangePassword ? 'CLOSE' : 'CHANGE PASSWORD'}</span>
            </button>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">
            Changing your password updates your Firebase Authentication credentials. Your permanent Firebase UID, GamerTag, MMR ratings, team rosters, and Nexus Coins wallet remain completely intact.
          </p>

          {showChangePassword && (
            <form onSubmit={handleChangePasswordSubmit} className="pt-4 border-t border-slate-800/80 space-y-4 max-w-xl animate-fadeIn" noValidate>
              {passwordChangeError && (
                <div className="p-3.5 rounded-xl bg-red-950/70 border border-red-500/50 text-red-200 text-xs flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{passwordChangeError}</span>
                </div>
              )}

              {passwordChangeSuccess && (
                <div className="p-3.5 rounded-xl bg-emerald-950/70 border border-emerald-500/50 text-emerald-200 text-xs flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{passwordChangeSuccess}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1 font-mono">
                  Current Password <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type={showCurrentPass ? 'text' : 'password'}
                    required
                    placeholder="Enter current password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full pl-10 pr-10 py-2.5 bg-[#15151b] border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPass(!showCurrentPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                  >
                    {showCurrentPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1 font-mono">
                    New Password <span className="text-red-400">*</span>
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type={showNewPass ? 'text' : 'password'}
                      required
                      placeholder="Min 6 characters"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full pl-10 pr-10 py-2.5 bg-[#15151b] border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPass(!showNewPass)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                    >
                      {showNewPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1 font-mono">
                    Confirm New Password <span className="text-red-400">*</span>
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type={showNewPass ? 'text' : 'password'}
                      required
                      placeholder="Re-enter new password"
                      value={confirmNewPassword}
                      onChange={(e) => setConfirmNewPassword(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 bg-[#15151b] border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 transition-colors"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  id="submit-change-password-btn"
                  type="submit"
                  disabled={passwordChangeLoading}
                  className="px-5 py-2.5 rounded-xl bg-cyan-400 hover:bg-cyan-300 disabled:bg-slate-800 text-black font-black text-xs font-mono uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer disabled:cursor-not-allowed"
                >
                  {passwordChangeLoading ? (
                    <>
                      <span className="inline-block w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                      <span>UPDATING CREDENTIALS...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>SAVE NEW PASSWORD</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowChangePassword(false);
                    setPasswordChangeError(null);
                    setPasswordChangeSuccess(null);
                  }}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-mono text-slate-300 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Championships & Hall of Fame Accolades */}
      {championships.length > 0 && (
        <div className="p-6 rounded-3xl bg-[#0a0a0f] border border-yellow-500/40 space-y-4 shadow-xl relative overflow-hidden">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Crown className="w-5 h-5 text-yellow-400" />
              <h3 className="text-lg font-black font-display text-white">
                👑 HALL OF FAME CHAMPIONSHIPS
              </h3>
            </div>
            {onNavigateToHallOfFame && (
              <button
                onClick={onNavigateToHallOfFame}
                className="text-xs font-mono text-yellow-400 hover:text-yellow-300 transition-colors uppercase font-bold flex items-center gap-1"
              >
                <span>View Full Hall of Fame</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {championships.map((champ) => (
              <div
                key={champ.id}
                className="p-4 rounded-2xl bg-[#121218] border border-yellow-500/30 flex items-center justify-between"
              >
                <div>
                  <span className="text-[10px] font-mono font-bold text-yellow-400 uppercase">
                    🏆 {champ.seasonName}
                  </span>
                  <h4 className="text-sm font-bold text-white font-display mt-0.5">
                    {champ.gameName}
                  </h4>
                  <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                    Final MMR: <span className="text-yellow-400 font-bold">{champ.finalMMR}</span> • {champ.winRate}% WR
                  </div>
                </div>
                <div className="w-10 h-10 rounded-xl bg-yellow-500/15 border border-yellow-500/40 flex items-center justify-center text-yellow-400">
                  <Crown className="w-5 h-5" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Official Tournament Accolades & Trophies */}
      {tournamentAchievements.length > 0 && (
        <div className="p-6 rounded-3xl bg-gradient-to-r from-yellow-950/20 via-[#0a0a0f] to-amber-950/20 border border-yellow-500/30 space-y-4 shadow-xl relative overflow-hidden">
          <div className="flex items-center gap-2.5">
            <Trophy className="w-5 h-5 text-yellow-400" />
            <h3 className="text-lg font-black font-display text-white">
              🏆 TOURNAMENT CHAMPIONSHIPS & AWARDS
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {tournamentAchievements.map((ach) => (
              <div
                key={ach.id}
                className={`p-4 rounded-2xl border flex items-center justify-between transition-all ${
                  ach.placement === 1
                    ? 'bg-yellow-500/10 border-yellow-500/50 shadow-[0_0_15px_rgba(234,179,8,0.15)]'
                    : ach.placement === 2
                    ? 'bg-slate-800/40 border-slate-600/50'
                    : 'bg-amber-900/20 border-amber-700/40'
                }`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] font-mono font-black uppercase px-2 py-0.5 rounded ${
                        ach.placement === 1
                          ? 'bg-yellow-400 text-black'
                          : ach.placement === 2
                          ? 'bg-slate-300 text-black'
                          : 'bg-amber-700 text-amber-100'
                      }`}
                    >
                      {ach.badgeText || (ach.placement === 1 ? '1ST PLACE' : `${ach.placement}ND PLACE`)}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400 uppercase">
                      {ach.gameName}
                    </span>
                  </div>

                  <h4 className="text-sm font-bold text-white font-display mt-1.5">
                    {ach.tournamentName}
                  </h4>

                  {ach.prize && (
                    <div className="text-[11px] font-mono text-yellow-300 mt-1">
                      Prize: {ach.prize}
                    </div>
                  )}

                  <div className="text-[10px] font-mono text-slate-500 mt-1">
                    {new Date(ach.awardedAt).toLocaleDateString(undefined, {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </div>
                </div>

                <div
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                    ach.placement === 1
                      ? 'bg-yellow-500/20 border border-yellow-500/50 text-yellow-400'
                      : ach.placement === 2
                      ? 'bg-slate-700/30 border border-slate-600/50 text-slate-300'
                      : 'bg-amber-900/30 border border-amber-600/40 text-amber-400'
                  }`}
                >
                  <Trophy className="w-6 h-6" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Official Nexus Ranking System Tier Guide */}
      <div className="p-6 rounded-3xl bg-[#0a0a0f] border border-slate-800 space-y-4 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <Award className="w-5 h-5 text-cyan-400" />
            <h3 className="text-lg font-black font-display text-white">NEXUS COMPETITIVE RANKING TIERS</h3>
          </div>
          <button
            onClick={() => setShowTierLadder(!showTierLadder)}
            className="text-xs font-mono text-cyan-400 hover:text-cyan-300 transition-colors uppercase font-bold flex items-center gap-1"
          >
            <span>{showTierLadder ? 'Hide Tiers' : 'View All Tiers & Emblems'}</span>
            <ChevronRight className={`w-3.5 h-3.5 transition-transform ${showTierLadder ? 'rotate-90' : ''}`} />
          </button>
        </div>

        <p className="text-xs text-slate-400">
          Rankings are modeled directly after the official Nexus Gaming Center laser-slashed emblem. Advance through the ladder by competing on designated center stations.
        </p>

        {showTierLadder && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-4 border-t border-slate-800/80">
            {NEXUS_RANK_TIERS.map((tier) => {
              const isCurrent = currentTier.id === tier.id;
              return (
                <div
                  key={tier.id}
                  className={`p-4 rounded-2xl border transition-all flex flex-col items-center text-center ${
                    isCurrent
                      ? `bg-[#15151b] ${tier.borderColorClass} shadow-[0_0_15px_rgba(34,211,238,0.2)] ring-1 ring-cyan-400/40`
                      : 'bg-[#0e0e14] border-slate-800/80 hover:border-slate-700'
                  }`}
                >
                  <div className="relative mb-3">
                    <RankEmblem tier={tier} sizeClass="w-14 h-14" iconSizeClass="text-3xl" />
                    {isCurrent && (
                      <span className="absolute -bottom-2 -right-1 px-1.5 py-0.5 rounded bg-cyan-400 text-black font-black text-[8px] font-mono uppercase shadow-sm z-20">
                        CURRENT
                      </span>
                    )}
                  </div>

                  <span
                    className={`text-[9px] font-mono font-black uppercase tracking-widest ${tier.textColorClass}`}
                  >
                    {tier.division}
                  </span>
                  <h4 className="text-xs font-bold font-display text-white mt-0.5">
                    {tier.icon} {tier.name}
                  </h4>
                  <div className="text-[11px] font-mono font-bold text-slate-400 mt-1">
                    {tier.rangeDisplay}
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1 line-clamp-2 leading-tight">
                    {tier.description}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 5v5 TEAM COMPETITIVE RELATIONSHIP (Requirement 6) */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-cyan-400" />
            <h3 className="text-xl font-black font-display text-white">5v5 COMPETITIVE TEAM RELATIONSHIPS</h3>
          </div>
          <span className="text-xs text-slate-400 font-mono">Valorant, CS2 &amp; League of Legends Team MMR</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { id: 'valorant', name: 'VALORANT', icon: '🎯' },
            { id: 'cs2', name: 'COUNTER-STRIKE 2', icon: '💣' },
            { id: 'lol', name: 'LEAGUE OF LEGENDS', icon: '⚔️' },
          ].map((game) => {
            const team = playerTeams.find(
              (t) => t.gameId?.toLowerCase() === game.id.toLowerCase()
            );
            const teamTier = team ? getRankFromMMR(team.teamRating) : null;

            // Find 5v5 match history for this game
            const teamMatches = validatedMatchHistory.filter((m) => {
              const is5v5 = m.is5v5 || m.gameMode === '5v5';
              const isThisGame =
                (m.game?.toLowerCase().includes(game.id) ||
                  (m as any).gameId?.toLowerCase() === game.id);
              const participated =
                m.teamAPlayerIds?.includes(targetId) ||
                m.teamBPlayerIds?.includes(targetId) ||
                (team && (m.teamAId === team.teamId || m.teamBId === team.teamId));
              return is5v5 && (isThisGame || participated);
            });

            return (
              <div
                key={game.id}
                className="p-6 rounded-3xl bg-[#0a0a0f] border border-slate-800 hover:border-slate-700 transition-all flex flex-col justify-between shadow-xl relative overflow-hidden space-y-4"
              >
                <div>
                  <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{game.icon}</span>
                      <h4 className="text-base font-black font-display text-white tracking-wide">
                        {game.name}
                      </h4>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-950 text-cyan-400 border border-cyan-500/30 uppercase">
                      5v5 SQUAD
                    </span>
                  </div>

                  {/* Current Team & Team MMR */}
                  <div className="mt-4 p-4 rounded-2xl bg-neutral-950 border border-neutral-850 space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block">
                          Current Team
                        </span>
                        {team ? (
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-base font-black font-display text-white">
                              {team.teamName}
                            </span>
                            <span className="px-2 py-0.5 bg-cyan-950/80 border border-cyan-500/40 text-cyan-400 text-xs font-mono font-bold rounded">
                              [{team.teamTag}]
                            </span>
                            {team.captainId === targetId && (
                              <span className="text-yellow-400 text-xs font-bold" title="Team Captain">👑</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs font-mono text-slate-400 italic">
                            No active 5v5 squad registered
                          </span>
                        )}
                      </div>

                      {team && teamTier && (
                        <div className="text-right">
                          <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block">
                            Team MMR
                          </span>
                          <span className="text-xl font-black font-mono text-cyan-400 block">
                            {team.teamRating}
                          </span>
                          <span className={`text-[10px] font-mono font-bold uppercase ${teamTier.textColorClass}`}>
                            {teamTier.gameCustomTitles?.[team.gameId] || `${teamTier.icon} ${teamTier.name}`}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Recent 5v5 Matches */}
                  <div className="mt-4 space-y-2">
                    <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 font-bold block">
                      Recent 5v5 Matches:
                    </span>

                    {teamMatches.length === 0 ? (
                      <div className="p-4 rounded-xl bg-neutral-950/60 border border-neutral-900 text-center text-xs text-slate-500 font-mono italic">
                        No official 5v5 {game.name} matches recorded yet.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {teamMatches.slice(0, 4).map((m) => {
                          const isTeamA = m.teamAPlayerIds?.includes(targetId) || (team && m.teamAId === team.teamId);
                          const myTeamName = isTeamA ? (m.teamAName || 'TEAM ALPHA') : (m.teamBName || 'TEAM OMEGA');
                          const oppTeamName = isTeamA ? (m.teamBName || 'TEAM OMEGA') : (m.teamAName || 'TEAM ALPHA');
                          const myTeamTag = isTeamA ? m.teamATag : m.teamBTag;
                          const oppTeamTag = isTeamA ? m.teamBTag : m.teamATag;

                          const isDraw = m.winnerId === 'DRAW' || m.teamOutcome === 'draw';
                          const isWin = !isDraw && (
                            (isTeamA && (m.winnerTeamId === m.teamAId || m.winnerTeamName === m.teamAName || m.teamOutcome === 'teamA')) ||
                            (!isTeamA && (m.winnerTeamId === m.teamBId || m.winnerTeamName === m.teamBName || m.teamOutcome === 'teamB'))
                          );

                          const mmrChange = isTeamA ? m.teamAMMRChange : m.teamBMMRChange;

                          return (
                            <div
                              key={m.matchId || m.id}
                              className="p-3 rounded-xl bg-neutral-950 border border-neutral-850 flex items-center justify-between text-xs font-mono"
                            >
                              <div>
                                <div className="font-bold text-white flex items-center gap-1.5">
                                  <span>{myTeamName}</span>
                                  {myTeamTag && <span className="text-slate-400 text-[10px]">[{myTeamTag}]</span>}
                                  <span className="text-slate-500 text-[10px] font-normal">vs</span>
                                  <span>{oppTeamName}</span>
                                  {oppTeamTag && <span className="text-slate-400 text-[10px]">[{oppTeamTag}]</span>}
                                </div>
                                <div className="text-[10px] text-slate-500 mt-0.5">
                                  {new Date(m.validatedAt || m.createdAt).toLocaleDateString()}
                                </div>
                              </div>

                              <div className="text-right">
                                <div>
                                  <span
                                    className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                                      isWin
                                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                        : isDraw
                                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                        : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                    }`}
                                  >
                                    {isWin ? 'WIN' : isDraw ? 'DRAW' : 'LOSS'}
                                  </span>
                                </div>
                                {mmrChange !== undefined && (
                                  <div
                                    className={`text-[11px] font-bold mt-1 ${
                                      mmrChange > 0
                                        ? 'text-cyan-400'
                                        : mmrChange < 0
                                        ? 'text-red-400'
                                        : 'text-slate-400'
                                    }`}
                                  >
                                    {mmrChange > 0 ? `+${mmrChange}` : mmrChange} Team MMR
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Per-Game Ratings Section with Game-Specific Rank Emblems */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Gamepad2 className="w-5 h-5 text-cyan-400" />
            <h3 className="text-xl font-black font-display text-white">ALL-TIME GAME RATINGS</h3>
          </div>
          {isOwnProfile && onOpenCreateMatch && (
            <button
              onClick={onOpenCreateMatch}
              className="px-4 py-2 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-black font-black text-xs tracking-wider uppercase transition-all shadow-md active:scale-95 flex items-center gap-1.5"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>New Match</span>
            </button>
          )}
        </div>

        {gameRatings.length === 0 ? (
          <div className="p-8 rounded-3xl bg-[#0a0a0f] border border-slate-800 text-center space-y-2">
            <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 mx-auto">
              <Gamepad2 className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-bold text-white font-display">No Game Ratings Recorded Yet</h4>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Play and submit a competitive match in Chess, FC, Valorant, CS2, or League of Legends on center stations to earn your official game rank!
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {gameRatings.map((gr) => {
              const grTotal = Math.max(gr.gamesPlayed || 0, gr.placementGames || 0);
              const grIsUnranked = grTotal < 10;
              const grWinRate = grTotal > 0 ? Math.round(((gr.wins || 0) / grTotal) * 100) : 0;
              const grTier = getRankFromMMR(gr.rating);

              return (
                <div
                  key={gr.id}
                  className="p-5 rounded-3xl bg-[#0a0a0f] border border-slate-800 hover:border-slate-700 transition-all flex flex-col justify-between shadow-xl relative overflow-hidden group"
                >
                  <div
                    className={`absolute -top-12 -right-12 w-32 h-32 bg-gradient-to-b ${grTier.bgGlowClass} rounded-full blur-2xl pointer-events-none`}
                  />

                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span
                        className="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 uppercase"
                      >
                        {gr.gameCategory || 'COMPETITIVE'}
                      </span>
                      {grIsUnranked ? (
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/30 uppercase">
                          ⚪ UNRANKED • {grTotal}/10
                        </span>
                      ) : (
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 uppercase">
                          RANKED
                        </span>
                      )}
                      {(gr.currentWinStreak || gr.winStreak || 0) >= 3 && (
                        <WinStreakBadge streak={gr.currentWinStreak || gr.winStreak || 0} size="sm" />
                      )}
                    </div>

                    <div className="flex items-center gap-3.5">
                      <WinStreakAvatarWrapper streak={gr.currentWinStreak || gr.winStreak || 0}>
                        <RankEmblem
                          tier={grTier}
                          gameId={gr.gameId}
                          sizeClass="w-12 h-12"
                          isUnranked={grIsUnranked}
                        />
                      </WinStreakAvatarWrapper>
                      <div>
                        <h4 className="text-base font-bold font-display text-white group-hover:text-cyan-400 transition-colors">
                          {gr.gameName}
                        </h4>
                        {grIsUnranked ? (
                          <span className="text-[10px] font-mono text-yellow-400/80">
                            Placement Matches: {grTotal}/10
                          </span>
                        ) : (
                          <span className={`text-[10px] font-mono font-bold uppercase ${grTier.textColorClass}`}>
                            {grTier.gameCustomTitles?.[gr.gameId] || `${grTier.icon} ${grTier.name}`}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-slate-800 flex items-end justify-between">
                    <div>
                      <div className="text-[10px] text-slate-400 uppercase font-mono font-bold">Game MMR</div>
                      <div className={`text-2xl font-black font-display ${grTier.textColorClass} font-mono-numbers`}>
                        {gr.rating}
                      </div>
                    </div>
                    <div className="text-right text-[11px] font-mono">
                      <div className="text-slate-300">
                        <span className="text-emerald-400 font-bold">{gr.wins || 0}W</span> —{' '}
                        <span className="text-red-400 font-bold">{gr.losses || 0}L</span>
                      </div>
                      <div className="text-slate-500">{grWinRate}% WR</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Season History Records */}
      {seasonRatings.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-yellow-400" />
            <h3 className="text-xl font-black font-display text-white">SEASONAL PERFORMANCE ARCHIVE</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {seasonRatings.map((sr, idx) => {
              const srTier = getRankFromMMR(sr.finalMMR);
              return (
                <div
                  key={`${sr.seasonId}_${sr.gameId}_${idx}`}
                  className="p-5 rounded-3xl bg-[#0a0a0f] border border-slate-800 hover:border-slate-700 transition-all flex flex-col justify-between shadow-xl relative overflow-hidden group"
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-yellow-500/15 border border-yellow-500/30 text-yellow-300 uppercase">
                        Season {sr.seasonNumber || 1}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400 uppercase">
                        {sr.gameCategory}
                      </span>
                    </div>

                    <h4 className="text-base font-bold font-display text-white mt-1">
                      {sr.gameName}
                    </h4>
                    <span className={`text-[10px] font-mono font-bold uppercase ${srTier.textColorClass}`}>
                      {srTier.icon} {srTier.name}
                    </span>
                  </div>

                  <div className="mt-4 pt-4 border-t border-slate-800 flex items-end justify-between">
                    <div>
                      <div className="text-[10px] text-slate-400 uppercase font-mono font-bold">Season MMR</div>
                      <div className={`text-2xl font-black font-display ${srTier.textColorClass} font-mono-numbers`}>
                        {sr.finalMMR}
                      </div>
                    </div>
                    <div className="text-right text-[11px] font-mono">
                      <div className="text-slate-300">
                        <span className="text-emerald-400 font-bold">{sr.wins}W</span> —{' '}
                        <span className="text-red-400 font-bold">{sr.losses}L</span>
                      </div>
                      <div className="text-slate-500">
                        {sr.winRate}% WR
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* OFFICIAL VALIDATED MATCH HISTORY (Section 4 Requirement) */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-400" />
            <h3 className="text-xl font-black font-display text-white uppercase tracking-tight">MATCH HISTORY</h3>
          </div>
          <span className="text-xs text-slate-400 font-mono">Validated by Nexus Staff</span>
        </div>

        {validatedMatchHistory.length === 0 ? (
          <div className="p-8 rounded-2xl bg-[#0a0a0f] border border-slate-800 text-center space-y-1">
            <p className="text-xs text-slate-400">No validated match records found for this player yet.</p>
            <p className="text-[11px] text-slate-500 font-mono">Play a match at Nexus Gaming Center and have staff validate your score!</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-[#0a0a0f] shadow-lg">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-neutral-900/80 border-b border-slate-800 text-slate-400 uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-3 px-4">Game</th>
                  <th className="py-3 px-4">Opponent</th>
                  <th className="py-3 px-4">Result</th>
                  <th className="py-3 px-4">Score</th>
                  <th className="py-3 px-4">NC</th>
                  <th className="py-3 px-4">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850">
                {validatedMatchHistory.map((m) => {
                  const isP1 = m.player1Id === targetId;
                  const opponent = isP1 ? m.player2GamerTag : m.player1GamerTag;
                  const isDraw = m.winnerId === 'DRAW' || m.winnerGamerTag === 'DRAW';
                  const isWin = !isDraw && m.winnerId === targetId;
                  const resultText = isDraw ? 'DRAW' : isWin ? 'WIN' : 'LOSS';
                  const myScore = isP1 ? m.player1Wins : m.player2Wins;
                  const oppScore = isP1 ? m.player2Wins : m.player1Wins;
                  const scoreText = (m.game || '').toLowerCase().includes('chess') && (myScore === 0 && oppScore === 0)
                    ? '—'
                    : `${myScore}–${oppScore}`;
                  const ncEarned = isP1
                    ? (m.player1NCReward ?? (isWin ? m.winnerNCReward : isDraw ? m.winnerNCReward : m.loserNCReward))
                    : (m.player2NCReward ?? (isWin ? m.winnerNCReward : isDraw ? m.winnerNCReward : m.loserNCReward));

                  return (
                    <tr key={m.matchId || m.id} className="hover:bg-slate-900/40 transition-colors">
                      <td className="py-3.5 px-4 font-bold text-white whitespace-nowrap">
                        {m.game}
                      </td>
                      <td className="py-3.5 px-4 text-slate-300 font-bold whitespace-nowrap">
                        {opponent}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                            isWin
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : isDraw
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                          }`}
                        >
                          {resultText}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-white font-bold whitespace-nowrap">
                        {scoreText}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap font-bold">
                        <span className={ncEarned > 0 ? 'text-amber-400 font-black' : 'text-slate-500'}>
                          {ncEarned > 0 ? `+${ncEarned}` : '0'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-slate-400 whitespace-nowrap text-[11px]">
                        {new Date(m.validatedAt || m.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent Matches */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Swords className="w-5 h-5 text-cyan-400" />
            <h3 className="text-xl font-black font-display text-white">RECENT MATCH HISTORY</h3>
          </div>
          <span className="text-xs text-slate-400 font-mono">Last 10 matches</span>
        </div>

        {recentMatches.length === 0 ? (
          <div className="p-8 rounded-2xl bg-[#0a0a0f] border border-slate-800 text-center">
            <p className="text-xs text-slate-400">No match records found for this player yet.</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {recentMatches.map((m) => {
              const is5v5 = m.matchType === '5v5';
              const isA = is5v5
                ? (m.teamAPlayerIds?.includes(player.uid) ?? false)
                : m.playerAId === player.uid;
              const opponentTag = is5v5
                ? (isA ? `${m.teamBName || 'Team B'} (5v5)` : `${m.teamAName || 'Team A'} (5v5)`)
                : (isA ? m.playerBGamerTag : m.playerAGamerTag);
              const ratingChange = is5v5
                ? (isA ? m.teamARatingChange : m.teamBRatingChange)
                : (isA ? m.playerARatingChange : m.playerBRatingChange);
              const isWinner = is5v5
                ? (m.winnerId === 'teamA' ? isA : m.winnerId === 'teamB' ? !isA : false)
                : m.winnerId === player.uid;
              const isDraw = m.winnerId === 'draw';
              const isCancelled = m.status === 'CANCELLED';

              return (
                <div
                  key={m.id}
                  onClick={() => onSelectMatch?.(m.id)}
                  className="p-4 rounded-2xl bg-[#0a0a0f] border border-slate-800 hover:border-slate-700 transition-all flex items-center justify-between cursor-pointer group shadow-md"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold ${
                        isCancelled
                          ? 'bg-slate-800 text-slate-400 border border-slate-700'
                          : m.status === 'CONFIRMED'
                          ? isWinner
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : isDraw
                            ? 'bg-slate-800 text-slate-300 border border-slate-700'
                            : 'bg-red-500/20 text-red-300 border border-red-500/30'
                          : m.status === 'DISPUTED'
                          ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30'
                          : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                      }`}
                    >
                      {isCancelled
                        ? 'CANCELLED'
                        : m.status === 'CONFIRMED'
                        ? isWinner
                          ? 'VICTORY'
                          : isDraw
                          ? 'DRAW'
                          : 'DEFEAT'
                        : m.status === 'DISPUTED'
                        ? 'DISPUTED'
                        : 'LIVE'}
                    </div>

                    <div>
                      <div className="text-sm font-bold font-display text-white group-hover:text-cyan-400 transition-colors">
                        {m.gameName}{' '}
                        <span className="text-slate-400 font-normal text-xs">vs {opponentTag}</span>
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        Station: {m.station} • {new Date(m.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>

                  <div className="text-right font-mono text-xs">
                    {isCancelled ? (
                      <span className="text-slate-500 text-[11px] font-mono">No rating change</span>
                    ) : m.status === 'CONFIRMED' && ratingChange !== undefined ? (
                      <span
                        className={`font-bold font-mono-numbers ${
                          ratingChange > 0
                            ? 'text-cyan-400'
                            : ratingChange < 0
                            ? 'text-red-400'
                            : 'text-slate-400'
                        }`}
                      >
                        {ratingChange > 0 ? `+${ratingChange}` : ratingChange} MMR
                      </span>
                    ) : m.status === 'DISPUTED' ? (
                      <span className="text-yellow-400 text-[11px] font-mono">Waiting for staff</span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

