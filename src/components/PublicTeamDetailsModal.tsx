import React, { useState, useEffect } from 'react';
import { doc, onSnapshot, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import {
  UnifiedTournamentTeam,
  sanitizeSlotsForPublic,
  getPlayerSlotState,
  isPlayerInformationComplete,
  isPlayerInvitationAccepted,
  computeTeamStatus,
} from '../utils/tournamentTeamStatus';
import { Player, TeamTournamentRegistration } from '../types';
import {
  cancelTournamentTeamInvitation,
  removePlayerFromTeamSlot,
  invitePlayerToTournamentTeam,
} from '../services/tournamentService';
import { fetchAllPlayers } from '../services/playerService';
import {
  X,
  Users,
  Crown,
  Shield,
  Clock,
  CheckCircle2,
  AlertCircle,
  Phone,
  Gamepad2,
  Award,
  Lock,
  Eye,
  Settings,
  UserCheck,
  ExternalLink,
  UserPlus,
  Trash2,
  AlertTriangle,
  RotateCw,
  Search,
  Send,
  Loader2,
} from 'lucide-react';

interface PublicTeamDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  team: UnifiedTournamentTeam | null;
  currentUser?: Player | null;
  isAdmin?: boolean;
  onOpenManageTeam?: (team: UnifiedTournamentTeam) => void;
  onOpenAdminReview?: (team: UnifiedTournamentTeam) => void;
  onTeamUpdated?: (updatedTeam: UnifiedTournamentTeam) => void;
}

export const PublicTeamDetailsModal: React.FC<PublicTeamDetailsModalProps> = ({
  isOpen,
  onClose,
  team,
  currentUser,
  isAdmin = false,
  onOpenManageTeam,
  onOpenAdminReview,
  onTeamUpdated,
}) => {
  const [showAdminStaffView, setShowAdminStaffView] = useState(false);
  const [currentTeam, setCurrentTeam] = useState<UnifiedTournamentTeam | null>(team);

  // Cancellation and removal states
  const [confirmCancel, setConfirmCancel] = useState<{
    slotNumber: 2 | 3 | 4 | 5;
    playerName: string;
  } | null>(null);

  const [confirmRemoveMember, setConfirmRemoveMember] = useState<{
    slotNumber: 2 | 3 | 4 | 5;
    playerName: string;
  } | null>(null);

  // Player invitation modal state (Team Lobby)
  const [invitingSlotNumber, setInvitingSlotNumber] = useState<(2 | 3 | 4 | 5) | null>(null);
  const [availablePlayers, setAvailablePlayers] = useState<Player[]>([]);
  const [tournamentOccupancy, setTournamentOccupancy] = useState<Record<string, string>>({});
  const [loadingPlayers, setLoadingPlayers] = useState(false);
  const [searchPlayerQuery, setSearchPlayerQuery] = useState('');
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);

  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  useEffect(() => {
    setCurrentTeam(team);
    setActionError(null);
    setActionSuccess(null);
  }, [team]);

  // Real-time Firestore sync for tournament team registration
  useEffect(() => {
    if (!isOpen || !team?.id) return;
    const unsub = onSnapshot(
      doc(db, 'tournamentTeamRegistrations', team.id),
      (snap) => {
        if (snap.exists()) {
          const regData = snap.data() as TeamTournamentRegistration;
          const updatedStatus = computeTeamStatus({
            slots: regData.slots,
            registrationStatus: regData.status,
            isConfirmedInTournament: regData.status === 'CONFIRMED',
            requiredPlayerCount: 5,
            fallbackCaptainPhone: regData.captainPhone,
          });
          setCurrentTeam((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              slots: regData.slots,
              status: updatedStatus,
              rawRegistrationStatus: regData.status,
              sourceRegistration: regData,
              captainFullName: regData.captainFullName || prev.captainFullName,
              captainPhone: regData.captainPhone || prev.captainPhone,
            };
          });
        }
      },
      (err) => {
        console.warn('[TEAM LOBBY DEBUG] onSnapshot error:', err);
      }
    );
    return () => unsub();
  }, [isOpen, team?.id]);

  const openInviteModal = async (slotNumber: 2 | 3 | 4 | 5) => {
    setInvitingSlotNumber(slotNumber);
    setInviteError(null);
    setSearchPlayerQuery('');
    setLoadingPlayers(true);
    try {
      const tourneyId = currentTeam?.tournamentId;
      const [players, otherRegsSnap, tournamentSnap] = await Promise.all([
        fetchAllPlayers(),
        tourneyId
          ? getDocs(query(collection(db, 'tournamentTeamRegistrations'), where('tournamentId', '==', tourneyId)))
          : Promise.resolve(null),
        tourneyId
          ? getDoc(doc(db, 'tournaments', tourneyId))
          : Promise.resolve(null),
      ]);

      const occMap: Record<string, string> = {};

      if (otherRegsSnap) {
        for (const d of otherRegsSnap.docs) {
          const reg = d.data() as TeamTournamentRegistration;
          if (reg.id === currentTeam?.id || reg.status === 'CANCELLED' || reg.status === 'REJECTED') continue;
          if (reg.captainId) {
            occMap[reg.captainId] = reg.teamName || 'Another Squad';
          }
          for (const s of reg.slots || []) {
            const uid = s.playerId || s.invitedPlayerId || (s as any).recipientId;
            if (!uid) continue;
            if (
              s.status === 'EMPTY' ||
              s.status === 'REMOVED' ||
              s.status === 'DECLINED' ||
              s.status === 'CANCELLED'
            ) {
              continue;
            }
            const isFilled =
              s.status === 'COMPLETED' ||
              s.status === 'ACCEPTED' ||
              s.status === 'INFORMATION_COMPLETE' ||
              s.playerStatus === 'INFORMATION_COMPLETE' ||
              isPlayerInvitationAccepted(s);
            if (isFilled) {
              occMap[uid] = reg.teamName || 'Another Squad';
            }
          }
        }
      }

      const registeredTeamIds = new Set(otherRegsSnap?.docs.map((d) => d.id) || []);
      if (currentTeam?.id) {
        registeredTeamIds.add(currentTeam.id);
      }

      if (tournamentSnap?.exists()) {
        const t = tournamentSnap.data() as any;
        if (t.participants) {
          for (const p of t.participants) {
            if (p.id === currentTeam?.id) continue;
            if (p.status === 'WITHDRAWN' || p.status === 'DISQUALIFIED') continue;
            // If this team has a registration document in tournamentTeamRegistrations,
            // its active slots are already authoritative above. Do NOT use stale p.teamMemberIds!
            if (registeredTeamIds.has(p.id)) continue;

            if (p.teamMemberIds && Array.isArray(p.teamMemberIds)) {
              for (const mId of p.teamMemberIds) {
                if (!occMap[mId]) {
                  occMap[mId] = p.name || 'Tournament Participant';
                }
              }
            } else if (p.id && !occMap[p.id]) {
              occMap[p.id] = p.name || 'Tournament Participant';
            }
          }
        }
      }

      setTournamentOccupancy(occMap);
      const authUid = (auth.currentUser?.uid || currentUser?.uid || '').trim();
      setAvailablePlayers(players.filter((p) => p.uid !== authUid && p.uid !== currentUser?.uid));
    } catch (err) {
      console.error('[TEAM LOBBY DEBUG] Failed to load players for invite:', err);
    } finally {
      setLoadingPlayers(false);
    }
  };

  const handleSendInvite = async (targetPlayer: Player) => {
    if (!currentTeam || !invitingSlotNumber || !currentUser) return;
    setInviteError(null);

    const targetUid = targetPlayer.uid || (targetPlayer as any).playerUid || (targetPlayer as any).id;
    const authUid = (auth.currentUser?.uid || currentUser?.uid || '').trim();
    if (targetUid === authUid || targetUid === currentUser.uid) {
      setInviteError('You cannot select yourself as an opponent or invite yourself.');
      return;
    }

    setInviteLoading(true);

    console.log('[TEAM LOBBY DEBUG] Captain sending invitation:', {
      captainUid: currentUser.uid,
      selectedPlayerUid: targetUid,
      teamId: currentTeam.id,
      tournamentId: currentTeam.tournamentId,
      slotNumber: invitingSlotNumber,
    });

    try {
      const res = await invitePlayerToTournamentTeam({
        registrationId: currentTeam.id,
        slotNumber: invitingSlotNumber,
        targetPlayer,
        captainGamerTag: currentUser.gamerTag || 'Captain',
      });

      if (!res.success) {
        console.error('[TEAM LOBBY DEBUG] Invitation failed:', res.error);
        setInviteError(res.error || 'Failed to send invitation.');
        setInviteLoading(false);
        return;
      }

      console.log('[TEAM LOBBY DEBUG] Invitation succeeded, fetching updated registration');

      // Synchronize with fresh doc
      try {
        const snap = await getDoc(doc(db, 'tournamentTeamRegistrations', currentTeam.id));
        if (snap.exists()) {
          const regData = snap.data() as TeamTournamentRegistration;
          const updatedStatus = computeTeamStatus({
            slots: regData.slots,
            registrationStatus: regData.status,
            isConfirmedInTournament: regData.status === 'CONFIRMED',
            requiredPlayerCount: 5,
            fallbackCaptainPhone: regData.captainPhone,
          });
          const updatedTeam: UnifiedTournamentTeam = {
            ...currentTeam,
            slots: regData.slots,
            status: updatedStatus,
            rawRegistrationStatus: regData.status,
            sourceRegistration: regData,
          };
          setCurrentTeam(updatedTeam);
          onTeamUpdated?.(updatedTeam);
        }
      } catch (syncErr) {
        console.warn('Could not sync updated team:', syncErr);
      }

      setInvitingSlotNumber(null);
      setActionSuccess(`Invitation sent to ${targetPlayer.gamerTag}!`);
    } catch (err: any) {
      console.error('[TEAM LOBBY DEBUG] Unexpected error sending invite:', err);
      setInviteError(err.message || 'An unexpected error occurred while sending the invitation.');
    } finally {
      setInviteLoading(false);
    }
  };

  if (!isOpen || !currentTeam) return null;

  const { status } = currentTeam;
  const isReady = status.statusKey === 'READY';
  const isPending = status.statusKey === 'PENDING_APPROVAL';
  const isForming = status.statusKey === 'FORMING_TEAM';

  const isUserCaptain = Boolean(currentUser?.uid && currentTeam.captainId === currentUser.uid);
  const isUserMember = Boolean(
    currentUser?.uid && currentTeam.slots.some((s) => s.playerId === currentUser.uid)
  );

  // 5 PLAYER LIMIT check: count occupied slots (active or pending)
  const activeSlotsCount = currentTeam.slots.filter(
    (s) => s.status !== 'EMPTY' && s.status !== 'REMOVED' && s.status !== 'DECLINED' && s.status !== 'CANCELLED'
  ).length;
  const isTeamFull = activeSlotsCount >= 5;

  const filteredPlayers = availablePlayers.filter((p) => {
    const pUid = p.uid || (p as any).playerUid || (p as any).id;
    if (!pUid) return false;
    // Captain themselves cannot be invited
    if (pUid === currentTeam.captainId) return false;

    // Player cannot already occupy an active slot on this team
    const isOccupyingActiveSlot = currentTeam.slots.some((s) => {
      const isSame = s.playerId === pUid || s.invitedPlayerId === pUid || (s as any).recipientId === pUid;
      const isActive = s.status !== 'EMPTY' && s.status !== 'REMOVED' && s.status !== 'DECLINED' && s.status !== 'CANCELLED';
      return isSame && isActive;
    });
    if (isOccupyingActiveSlot) return false;

    // Filter by search query
    if (!searchPlayerQuery.trim()) return true;
    const q = searchPlayerQuery.toLowerCase();
    const tagMatch = p.gamerTag?.toLowerCase().includes(q);
    const nameMatch = p.fullName?.toLowerCase().includes(q);
    return Boolean(tagMatch || nameMatch);
  }).sort((a, b) => {
    const aUid = a.uid || (a as any).playerUid || (a as any).id;
    const bUid = b.uid || (b as any).playerUid || (b as any).id;
    const aOccupied = Boolean(tournamentOccupancy[aUid]);
    const bOccupied = Boolean(tournamentOccupancy[bUid]);
    // Available players first, occupied players last
    if (!aOccupied && bOccupied) return -1;
    if (aOccupied && !bOccupied) return 1;
    return (a.gamerTag || '').localeCompare(b.gamerTag || '');
  });

  const trulyEligiblePlayers = filteredPlayers.filter(
    (p) => !tournamentOccupancy[p.uid || (p as any).playerUid || (p as any).id]
  );

  // Generate public sanitized slots
  const publicSlots = sanitizeSlotsForPublic(currentTeam.slots);

  // Block representation
  const totalBlocks = 10;
  const filledBlocks = Math.round((status.progressPercent / 100) * totalBlocks);
  const emptyBlocks = totalBlocks - filledBlocks;
  const blockString = '█'.repeat(filledBlocks) + '░'.repeat(emptyBlocks);

  // Execute cancellation of pending invitation
  const handleExecuteCancel = async (slotNumber: 2 | 3 | 4 | 5) => {
    if (!currentUser?.uid || !currentTeam) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await cancelTournamentTeamInvitation({
        registrationId: currentTeam.id,
        slotNumber,
        captainId: currentUser.uid,
      });

      if (!res.success) {
        setActionError(res.error || 'Failed to cancel invitation');
        setActionLoading(false);
        return;
      }

      // Optimistically update slots and status
      const updatedSlots = currentTeam.slots.map((s) => {
        if (s.slotNumber === slotNumber) {
          return {
            slotNumber,
            isCaptain: false,
            status: 'EMPTY' as const,
            playerStatus: 'EMPTY' as const,
            invitationStatus: 'NONE' as const,
          };
        }
        return s;
      });

      const updatedStatus = computeTeamStatus({
        slots: updatedSlots,
        registrationStatus: 'WAITING_FOR_PLAYERS',
        isConfirmedInTournament: currentTeam.status.isOfficial,
        requiredPlayerCount: 5,
      });

      const updatedTeamObj: UnifiedTournamentTeam = {
        ...currentTeam,
        slots: updatedSlots,
        status: updatedStatus,
        rawRegistrationStatus: 'WAITING_FOR_PLAYERS',
        updatedAt: Date.now(),
      };

      setCurrentTeam(updatedTeamObj);
      onTeamUpdated?.(updatedTeamObj);
      setActionSuccess(`Invitation cancelled. Slot #${slotNumber} is now EMPTY and available.`);
      setConfirmCancel(null);
    } catch (err: any) {
      setActionError(err.message || 'Error cancelling invitation.');
    } finally {
      setActionLoading(false);
    }
  };

  // Execute removal of accepted member
  const handleExecuteRemoveMember = async (slotNumber: 2 | 3 | 4 | 5) => {
    if (!currentUser?.uid || !currentTeam) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await removePlayerFromTeamSlot(currentTeam.id, slotNumber, currentUser.uid);

      if (!res.success) {
        setActionError(res.error || 'Failed to remove player');
        setActionLoading(false);
        return;
      }

      const updatedSlots = currentTeam.slots.map((s) => {
        if (s.slotNumber === slotNumber) {
          return {
            slotNumber,
            isCaptain: false,
            status: 'EMPTY' as const,
            playerStatus: 'EMPTY' as const,
            invitationStatus: 'NONE' as const,
          };
        }
        return s;
      });

      const updatedStatus = computeTeamStatus({
        slots: updatedSlots,
        registrationStatus: 'WAITING_FOR_PLAYERS',
        isConfirmedInTournament: currentTeam.status.isOfficial,
        requiredPlayerCount: 5,
      });

      const updatedTeamObj: UnifiedTournamentTeam = {
        ...currentTeam,
        slots: updatedSlots,
        status: updatedStatus,
        rawRegistrationStatus: 'WAITING_FOR_PLAYERS',
        updatedAt: Date.now(),
      };

      setCurrentTeam(updatedTeamObj);
      onTeamUpdated?.(updatedTeamObj);
      setActionSuccess(`Player removed. Slot #${slotNumber} is now free.`);
      setConfirmRemoveMember(null);
    } catch (err: any) {
      setActionError(err.message || 'Error removing player.');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto bg-black/85 backdrop-blur-md animate-in fade-in">
      <div
        id="public-team-details-modal"
        className="relative w-full max-w-2xl rounded-3xl bg-[#0b0e17] border border-slate-800 shadow-2xl overflow-hidden my-auto"
      >
        {/* Header Ribbon / Banner */}
        <div
          className={`px-6 py-5 border-b flex items-start justify-between gap-4 ${
            isReady
              ? 'bg-emerald-950/30 border-emerald-500/30'
              : isPending
              ? 'bg-amber-950/30 border-amber-500/30'
              : 'bg-indigo-950/30 border-indigo-500/30'
          }`}
        >
          <div className="flex items-center gap-4">
            {team.teamLogo ? (
              <img
                src={team.teamLogo}
                alt={team.teamName}
                referrerPolicy="no-referrer"
                className="w-14 h-14 rounded-2xl object-cover border border-slate-700 shadow-md"
              />
            ) : (
              <div
                className={`w-14 h-14 rounded-2xl border flex items-center justify-center font-display font-black text-2xl shadow-md ${
                  isReady
                    ? 'bg-gradient-to-br from-emerald-900 to-slate-900 border-emerald-500/50 text-emerald-300'
                    : isPending
                    ? 'bg-gradient-to-br from-amber-900 to-slate-900 border-amber-500/50 text-amber-300'
                    : 'bg-gradient-to-br from-indigo-900 to-slate-900 border-indigo-500/50 text-indigo-300'
                }`}
              >
                {team.teamName.charAt(0).toUpperCase()}
              </div>
            )}

            <div>
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-cyan-400 text-[10px] font-mono font-bold uppercase tracking-wider">
                  🎮 {team.gameName}
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  {team.tournamentName}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <h3 className="text-xl sm:text-2xl font-black font-display text-white uppercase tracking-tight">
                  {team.teamName}
                </h3>
                {team.teamTag && (
                  <span className="px-2 py-0.5 rounded bg-slate-800 text-cyan-400 font-mono font-bold text-xs uppercase">
                    [{team.teamTag}]
                  </span>
                )}
              </div>
            </div>
          </div>

          <button
            id="close-team-details-modal-btn"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Progress & Public Status Banner */}
        <div className="p-6 space-y-6">
          <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800/80 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <span className="text-xs text-slate-400 font-mono uppercase tracking-wider block">
                  PUBLIC SQUAD STATUS
                </span>
                <span className="text-sm sm:text-base font-black font-display text-white flex items-center gap-2 mt-0.5">
                  {status.label}
                </span>
              </div>

              <span
                className={`px-3 py-1 rounded-full text-xs font-mono font-bold uppercase tracking-wider border self-start sm:self-center flex items-center gap-1.5 ${
                  isReady
                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40'
                    : isPending
                    ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                    : 'bg-indigo-500/15 text-indigo-300 border-indigo-500/40'
                }`}
              >
                {isReady && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                {isPending && <Clock className="w-3.5 h-3.5 text-amber-400 animate-spin" style={{ animationDuration: '4s' }} />}
                {isForming && <Users className="w-3.5 h-3.5 text-indigo-400" />}
                <span>{status.shortBadge}</span>
              </span>
            </div>

            {/* Visual Progress Bar */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-slate-300 font-bold">
                  👥 TEAM PROGRESS: {status.playerCount} / {status.requiredPlayerCount} PLAYERS
                </span>
                <span className="text-cyan-400 font-bold">{status.progressPercent}%</span>
              </div>
              <div className="w-full bg-slate-950 rounded-full h-2.5 overflow-hidden border border-slate-800">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    isReady
                      ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                      : isPending
                      ? 'bg-gradient-to-r from-amber-500 to-orange-400'
                      : 'bg-gradient-to-r from-indigo-500 to-cyan-500'
                  }`}
                  style={{ width: `${status.progressPercent}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                <span className="tracking-widest select-none">{blockString}</span>
                <span>{status.publicMessage}</span>
              </div>
            </div>
          </div>

          {/* Action Success / Error Notifications */}
          {actionSuccess && (
            <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-xs font-mono flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{actionSuccess}</span>
              </div>
              <button onClick={() => setActionSuccess(null)} className="text-emerald-400 hover:text-emerald-200">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {actionError && (
            <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs font-mono flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{actionError}</span>
              </div>
              <button onClick={() => setActionError(null)} className="text-rose-400 hover:text-rose-200">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Admin Switch if Admin User */}
          {isAdmin && (
            <div className="flex items-center justify-between p-3 rounded-xl bg-purple-950/20 border border-purple-500/30 text-xs">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-purple-400" />
                <span className="text-purple-200 font-bold">ADMIN / STAFF GOVERNANCE VIEW</span>
              </div>
              <button
                id="toggle-admin-staff-view-btn"
                onClick={() => setShowAdminStaffView(!showAdminStaffView)}
                className="px-3 py-1 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-mono font-bold text-[11px] uppercase transition-colors"
              >
                {showAdminStaffView ? 'Show Public View' : 'Show Staff Details'}
              </button>
            </div>
          )}

          {/* ROSTER SECTION */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-cyan-400" />
                <span>OFFICIAL 5-PLAYER ROSTER</span>
              </h4>
              <span className="text-[11px] font-mono text-slate-400">
                {status.playerCount} of {status.requiredPlayerCount} Slots Filled
              </span>
            </div>

            {/* List of 5 Slots */}
            <div className="space-y-2">
              {showAdminStaffView && isAdmin ? (
                // ADMIN AUTHORIZED VIEW (Shows Full Name, Phone, Rank, Admin Status)
                currentTeam.slots.map((s, idx) => {
                  const isCaptain = s.isCaptain || s.slotNumber === 1;
                  const isFilled = Boolean(s.playerId || s.gamerTag);
                  const slotState = getPlayerSlotState(s, isCaptain ? currentTeam.captainPhone : undefined);
                  const isComplete = slotState === 'INFORMATION_COMPLETE';
                  const isAcceptedIncomplete = slotState === 'ACCEPTED_INCOMPLETE';
                  const isInvited = slotState === 'INVITATION_PENDING';
                  const isWaitingInvite = !isCaptain && (isInvited || ['AVAILABLE / WAITING', 'WAITING', 'INVITED', 'PENDING', 'INVITATION_SENT', 'WAITING_FOR_ACCEPTANCE'].includes(s.status || '') || Boolean(s.invitedPlayerId || (s as any).recipientId || s.invitedGamerTag || s.invitationId)) && !isComplete && !isAcceptedIncomplete;

                  return (
                    <div
                      key={s.slotNumber || idx}
                      className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs ${
                        isFilled
                          ? isComplete
                            ? 'bg-slate-900/90 border-slate-800'
                            : 'bg-amber-950/10 border-amber-500/20'
                          : 'bg-slate-950 border-dashed border-slate-800 text-slate-400'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center font-mono font-bold text-xs ${
                            isCaptain
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              : isFilled
                              ? 'bg-slate-800 text-slate-200'
                              : 'bg-slate-900 text-slate-400'
                          }`}
                        >
                          {s.slotNumber}
                        </div>

                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white text-sm">
                              {isFilled ? s.gamerTag || s.invitedGamerTag || 'Player' : `Slot ${s.slotNumber}: EMPTY`}
                            </span>
                            {isCaptain && (
                              <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-mono font-bold flex items-center gap-0.5">
                                <Crown className="w-2.5 h-2.5" />
                                <span>CAPTAIN</span>
                              </span>
                            )}
                          </div>

                          {isFilled && (
                            <div className="flex items-center gap-3 text-slate-400 text-[11px] mt-0.5 font-mono">
                              <span>Full Name: <strong className="text-slate-200">{s.fullName || 'N/A'}</strong></span>
                              <span>•</span>
                              <span className="flex items-center gap-1 text-cyan-300">
                                <Phone className="w-3 h-3 text-cyan-400" />
                                {s.phoneNumber || 'No phone'}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 self-end sm:self-center font-mono flex-wrap justify-end">
                        {isFilled && (isComplete || isAcceptedIncomplete) ? (
                          <>
                            <div className="text-right">
                              <span className="text-indigo-300 font-bold block">
                                🎮 {s.inGameName || 'No IGN'}
                              </span>
                              <span className="text-slate-400 text-[10px]">
                                {s.inGameRank || 'Unranked'}
                              </span>
                            </div>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                isComplete
                                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                  : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                              }`}
                            >
                              {isComplete ? '✓ VERIFIED' : '⚠️ PENDING DETAILS'}
                            </span>
                          </>
                        ) : isWaitingInvite ? (
                          <span className="px-2 py-0.5 rounded-full bg-slate-900 border border-slate-800 text-slate-400 text-[10px] font-bold">
                            ⏳ AVAILABLE / WAITING
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-slate-900 border border-slate-800 text-slate-400 text-[10px] font-bold">
                            EMPTY
                          </span>
                        )}

                        {/* Captain Actions in Staff View */}
                        {isUserCaptain && !isCaptain && (
                          <div className="flex items-center gap-2">
                            {isWaitingInvite && (
                              <button
                                id={`staff-cancel-slot-${s.slotNumber}-btn`}
                                onClick={() => setConfirmCancel({
                                  slotNumber: s.slotNumber as 2 | 3 | 4 | 5,
                                  playerName: s.invitedGamerTag || s.gamerTag || `Slot ${s.slotNumber}`,
                                })}
                                className="px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/35 border border-rose-500/40 text-rose-300 text-xs font-mono font-bold flex items-center gap-1 transition-colors"
                                title="Cancel invitation and free slot"
                              >
                                <X className="w-3.5 h-3.5 text-rose-400" />
                                <span>❌ CANCEL INVITATION</span>
                              </button>
                            )}

                            {!isFilled && !isWaitingInvite && (
                              <button
                                id={`staff-invite-slot-${s.slotNumber}-btn`}
                                onClick={() => openInviteModal(s.slotNumber as 2 | 3 | 4 | 5)}
                                disabled={isTeamFull}
                                className={`px-2.5 py-1 rounded-lg border text-xs font-mono font-bold flex items-center gap-1 transition-colors ${
                                  isTeamFull
                                    ? 'bg-slate-800/40 border-slate-700 text-slate-500 cursor-not-allowed'
                                    : 'bg-indigo-500/20 hover:bg-indigo-500/35 border border-indigo-500/40 text-indigo-300'
                                }`}
                                title={isTeamFull ? 'TEAM FULL — 5/5 PLAYERS' : 'Invite player to this slot'}
                              >
                                <UserPlus className="w-3.5 h-3.5 text-indigo-400" />
                                <span>{isTeamFull ? 'TEAM FULL — 5/5' : '+ INVITE'}</span>
                              </button>
                            )}

                            {isFilled && (isComplete || isAcceptedIncomplete) && (
                              <button
                                id={`staff-remove-slot-${s.slotNumber}-btn`}
                                onClick={() => setConfirmRemoveMember({
                                  slotNumber: s.slotNumber as 2 | 3 | 4 | 5,
                                  playerName: s.gamerTag || `Player ${s.slotNumber}`,
                                })}
                                className="px-2.5 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 text-xs font-mono font-bold flex items-center gap-1 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                                <span>REMOVE</span>
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                // PUBLIC SANITIZED VIEW (NO Phone, NO Email, NO Private Details)
                publicSlots.map((slot) => {
                  const rawSlot = currentTeam.slots.find((s) => s.slotNumber === slot.slotNumber);
                  const isCaptain = slot.isCaptain || slot.slotNumber === 1;

                  // Determine if this slot is occupied by an invited/waiting player
                  const isWaitingInvite = !isCaptain && Boolean(
                    (slot.isWaiting && (slot.gamerTag || rawSlot?.invitedGamerTag || (rawSlot as any)?.recipientId || rawSlot?.invitedPlayerId || rawSlot?.invitationId)) ||
                    (rawSlot && ['AVAILABLE / WAITING', 'WAITING', 'INVITED', 'PENDING', 'INVITATION_SENT', 'WAITING_FOR_ACCEPTANCE'].includes(rawSlot.status || '') && rawSlot.status !== 'EMPTY' && rawSlot.status !== 'REMOVED' && !rawSlot.status.includes('COMPLETED'))
                  );

                  const displayName = slot.isJoined
                    ? slot.gamerTag
                    : isWaitingInvite
                    ? slot.gamerTag || rawSlot?.invitedGamerTag || `Invited Player (Slot ${slot.slotNumber})`
                    : `Slot ${slot.slotNumber}`;

                  return (
                    <div
                      key={slot.slotNumber}
                      className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 text-xs transition-colors flex-wrap sm:flex-nowrap ${
                        slot.isJoined
                          ? 'bg-slate-900/80 border-slate-800/90'
                          : isWaitingInvite
                          ? 'bg-slate-950 border-amber-500/30 text-amber-300/90'
                          : 'bg-slate-950 border-dashed border-slate-800/80 text-slate-400'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center font-mono font-bold text-xs ${
                            slot.isCaptain
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              : slot.isJoined
                              ? 'bg-slate-800 text-slate-200'
                              : isWaitingInvite
                              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                              : 'bg-slate-900 text-slate-400'
                          }`}
                        >
                          {slot.slotNumber}
                        </div>

                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white text-sm">
                              {displayName}
                            </span>
                            {slot.isCaptain && (
                              <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-mono font-bold flex items-center gap-0.5">
                                <Crown className="w-2.5 h-2.5" />
                                <span>CAPTAIN</span>
                              </span>
                            )}
                          </div>

                          {slot.isJoined && slot.inGameName && (
                            <div className="flex items-center gap-2 text-slate-400 text-[11px] mt-0.5 font-mono">
                              <span className="text-cyan-300 font-medium">🎮 {slot.inGameName}</span>
                              {slot.inGameRank && (
                                <>
                                  <span>•</span>
                                  <span>{slot.inGameRank}</span>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 font-mono text-right flex-wrap sm:flex-nowrap justify-end">
                        {slot.isJoined ? (
                          <span
                            className={`px-2.5 py-1 rounded-full text-[10px] font-bold border flex items-center gap-1 ${
                              slot.isInformationComplete
                                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                                : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                            }`}
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            <span>{slot.statusLabel}</span>
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-full bg-slate-900 border border-slate-800 text-slate-400 text-[10px] font-bold flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-400" />
                            <span>⏳ AVAILABLE / WAITING</span>
                          </span>
                        )}

                        {/* CAPTAIN REMOVE / CANCEL ACTION BUTTONS */}
                        {isUserCaptain && !isCaptain && (
                          <div className="flex items-center gap-1.5 ml-1">
                            {isWaitingInvite && (
                              <button
                                id={`captain-cancel-slot-${slot.slotNumber}-btn`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setConfirmCancel({
                                    slotNumber: slot.slotNumber as 2 | 3 | 4 | 5,
                                    playerName: displayName,
                                  });
                                }}
                                className="px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/35 border border-rose-500/40 hover:border-rose-500/70 text-rose-300 text-xs font-mono font-bold flex items-center gap-1.5 transition-all shadow-sm"
                                title="Cancel this player's invitation and free this slot"
                              >
                                <X className="w-3.5 h-3.5 text-rose-400" />
                                <span>❌ CANCEL INVITATION</span>
                              </button>
                            )}

                            {!slot.isJoined && !isWaitingInvite && (
                              <button
                                id={`captain-invite-slot-${slot.slotNumber}-btn`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openInviteModal(slot.slotNumber as 2 | 3 | 4 | 5);
                                }}
                                disabled={isTeamFull}
                                className={`px-2.5 py-1 rounded-lg border text-xs font-mono font-bold flex items-center gap-1.5 transition-all shadow-sm ${
                                  isTeamFull
                                    ? 'bg-slate-800/40 border-slate-700 text-slate-500 cursor-not-allowed'
                                    : 'bg-indigo-500/20 hover:bg-indigo-500/35 border border-indigo-500/40 hover:border-indigo-500/70 text-indigo-300'
                                }`}
                                title={isTeamFull ? 'TEAM FULL — 5/5 PLAYERS' : 'Invite player to this slot'}
                              >
                                <UserPlus className="w-3.5 h-3.5 text-indigo-400" />
                                <span>{isTeamFull ? 'TEAM FULL — 5/5' : '+ INVITE PLAYER'}</span>
                              </button>
                            )}

                            {slot.isJoined && (
                              <button
                                id={`captain-remove-joined-slot-${slot.slotNumber}-btn`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setConfirmRemoveMember({
                                    slotNumber: slot.slotNumber as 2 | 3 | 4 | 5,
                                    playerName: slot.gamerTag || `Player ${slot.slotNumber}`,
                                  });
                                }}
                                className="px-2.5 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 hover:border-rose-500/60 text-rose-300 text-xs font-mono font-bold flex items-center gap-1 transition-all shadow-sm"
                                title="Remove player from squad"
                              >
                                <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                                <span>REMOVE</span>
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Confirmation Modal for Cancelling Pending Invitation */}
          {confirmCancel && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
              <div
                id="cancel-invitation-confirmation-modal"
                className="bg-[#0b0e17] border border-rose-500/40 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4"
              >
                <div className="flex items-center gap-3 text-rose-400">
                  <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center">
                    <AlertTriangle className="w-5 h-5 text-rose-400" />
                  </div>
                  <div>
                    <h4 className="text-lg font-bold font-display text-white">Cancel this player's invitation?</h4>
                    <p className="text-xs text-slate-400 font-mono">Slot #{confirmCancel.slotNumber} • {confirmCancel.playerName}</p>
                  </div>
                </div>

                <p className="text-sm text-slate-300">
                  Are you sure you want to cancel the invitation for <strong className="text-white">{confirmCancel.playerName}</strong>? This will immediately free this roster slot so you can invite another player.
                </p>

                {actionError && (
                  <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-500/30 text-rose-300 text-xs font-mono">
                    {actionError}
                  </div>
                )}

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    disabled={actionLoading}
                    onClick={() => {
                      setConfirmCancel(null);
                      setActionError(null);
                    }}
                    className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 text-xs font-mono font-bold uppercase transition-colors"
                  >
                    Keep Invitation
                  </button>
                  <button
                    id="confirm-cancel-invitation-btn"
                    disabled={actionLoading}
                    onClick={() => handleExecuteCancel(confirmCancel.slotNumber)}
                    className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-mono font-bold uppercase tracking-wider transition-colors flex items-center gap-2 shadow-lg shadow-rose-900/30"
                  >
                    {actionLoading ? (
                      <>
                        <RotateCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Cancelling...</span>
                      </>
                    ) : (
                      <>
                        <X className="w-3.5 h-3.5" />
                        <span>Yes, Cancel Invitation</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Confirmation Modal for Removing Accepted Player */}
          {confirmRemoveMember && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
              <div
                id="remove-member-confirmation-modal"
                className="bg-[#0b0e17] border border-rose-500/40 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4"
              >
                <div className="flex items-center gap-3 text-rose-400">
                  <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center">
                    <Trash2 className="w-5 h-5 text-rose-400" />
                  </div>
                  <div>
                    <h4 className="text-lg font-bold font-display text-white">Remove player from squad?</h4>
                    <p className="text-xs text-slate-400 font-mono">Slot #{confirmRemoveMember.slotNumber} • {confirmRemoveMember.playerName}</p>
                  </div>
                </div>

                <p className="text-sm text-slate-300">
                  Are you sure you want to remove <strong className="text-white">{confirmRemoveMember.playerName}</strong> from your team roster? This will free their slot so you can invite a replacement.
                </p>

                {actionError && (
                  <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-500/30 text-rose-300 text-xs font-mono">
                    {actionError}
                  </div>
                )}

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    disabled={actionLoading}
                    onClick={() => {
                      setConfirmRemoveMember(null);
                      setActionError(null);
                    }}
                    className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 text-xs font-mono font-bold uppercase transition-colors"
                  >
                    Keep Player
                  </button>
                  <button
                    id="confirm-remove-member-btn"
                    disabled={actionLoading}
                    onClick={() => handleExecuteRemoveMember(confirmRemoveMember.slotNumber)}
                    className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-mono font-bold uppercase tracking-wider transition-colors flex items-center gap-2 shadow-lg shadow-rose-900/30"
                  >
                    {actionLoading ? (
                      <>
                        <RotateCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Removing...</span>
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Yes, Remove Player</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Sub-modal: Player Selection / Search for Invite (Team Lobby) */}
          {invitingSlotNumber && (
            <div
              id="lobby-invite-player-modal"
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in"
              onClick={(e) => {
                if (e.target === e.currentTarget && !inviteLoading) setInvitingSlotNumber(null);
              }}
            >
              <div className="bg-[#0b0e17] border border-cyan-500/40 rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center">
                      <UserPlus className="w-5 h-5 text-cyan-400" />
                    </div>
                    <div>
                      <h3 className="font-bold text-white text-base font-display">
                        Invite Player to Squad
                      </h3>
                      <p className="text-xs text-slate-400 font-mono">
                        Slot #{invitingSlotNumber} • {currentTeam.teamName}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (!inviteLoading) setInvitingSlotNumber(null);
                    }}
                    className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* 5-Player Limit Notice */}
                {isTeamFull && (
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-mono flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>TEAM FULL — 5/5 PLAYERS. All squad slots are filled or have pending invitations.</span>
                  </div>
                )}

                {/* Error message */}
                {inviteError && (
                  <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/30 text-rose-300 text-xs font-mono flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>{inviteError}</span>
                  </div>
                )}

                {/* Search Bar */}
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="lobby-search-player-input"
                    type="text"
                    placeholder="Search Nexus players by GamerTag or Full Name..."
                    value={searchPlayerQuery}
                    onChange={(e) => setSearchPlayerQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700/80 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 text-sm font-sans"
                  />
                </div>

                {/* Player List */}
                <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[220px] max-h-[360px]">
                  {loadingPlayers ? (
                    <div className="flex flex-col items-center justify-center py-12 text-slate-400 space-y-2">
                      <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
                      <p className="text-xs font-mono">Loading Nexus competitor directory...</p>
                    </div>
                  ) : filteredPlayers.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-slate-400 text-center px-4">
                      <Users className="w-8 h-8 text-slate-600 mb-2" />
                      <p className="text-sm font-semibold text-slate-300">No eligible players found</p>
                      <p className="text-xs text-slate-500 mt-1 max-w-xs">
                        {searchPlayerQuery
                          ? `No available players match "${searchPlayerQuery}". Try another search term.`
                          : 'All registered players are either already on this team or unavailable.'}
                      </p>
                    </div>
                  ) : (
                    filteredPlayers.map((player) => {
                      const pUid = player.uid || (player as any).playerUid || (player as any).id;
                      const occupiedSquad = tournamentOccupancy[pUid];
                      const isOccupiedInOtherSquad = Boolean(occupiedSquad);

                      return (
                        <div
                          key={pUid}
                          className="p-3 rounded-xl bg-slate-900/70 border border-slate-800 flex items-center justify-between hover:border-slate-700 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-white font-bold text-sm">
                              {player.gamerTag ? player.gamerTag.substring(0, 2).toUpperCase() : 'NX'}
                            </div>
                            <div>
                              <p className="font-bold text-sm text-white flex items-center gap-1.5">
                                <span>{player.gamerTag}</span>
                                {player.role === 'admin' && (
                                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-red-500/20 text-red-300 border border-red-500/30">
                                    STAFF
                                  </span>
                                )}
                              </p>
                              <p className="text-xs text-slate-400 font-mono">
                                {player.fullName || 'Nexus Competitor'}
                              </p>
                            </div>
                          </div>

                          {isOccupiedInOtherSquad ? (
                            <div className="flex items-center gap-2">
                              <span className="px-2.5 py-1 rounded-md text-[10px] font-mono font-semibold bg-amber-500/10 border border-amber-500/30 text-amber-300 flex items-center gap-1">
                                <Shield className="w-3 h-3 text-amber-400 shrink-0" />
                                <span>IN SQUAD: {occupiedSquad}</span>
                              </span>
                              <button
                                disabled
                                title={`Already part of ${occupiedSquad}`}
                                className="px-3 py-1.5 rounded-lg text-xs font-mono font-semibold bg-slate-800/60 border border-slate-700/50 text-slate-500 cursor-not-allowed"
                              >
                                UNAVAILABLE
                              </button>
                            </div>
                          ) : (
                            <button
                              id={`lobby-invite-player-${pUid}-btn`}
                              onClick={() => handleSendInvite(player)}
                              disabled={inviteLoading || isTeamFull}
                              className={`px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 transition-all shadow-sm ${
                                inviteLoading || isTeamFull
                                  ? 'bg-slate-800 border border-slate-700 text-slate-500 cursor-not-allowed'
                                  : 'bg-cyan-500/20 hover:bg-cyan-500/35 border border-cyan-500/40 text-cyan-300 hover:border-cyan-500/70'
                              }`}
                            >
                              {inviteLoading ? (
                                <>
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  <span>INVITING...</span>
                                </>
                              ) : (
                                <>
                                  <Send className="w-3.5 h-3.5" />
                                  <span>INVITE</span>
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Footer */}
                <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-500 font-mono">
                  <div className="flex items-center gap-2">
                    <span>Available: <strong className="text-cyan-400 font-bold">{trulyEligiblePlayers.length}</strong></span>
                    {filteredPlayers.length > trulyEligiblePlayers.length && (
                      <span className="text-slate-500">({filteredPlayers.length - trulyEligiblePlayers.length} in other squads)</span>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={inviteLoading}
                    onClick={() => setInvitingSlotNumber(null)}
                    className="px-4 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 text-xs transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Privacy Guarantee Note */}
          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 text-[11px] font-mono text-slate-400 flex items-center gap-2">
            <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span>
              Player phone numbers and private credentials are kept confidential and are only visible to authorized Tournament Staff.
            </span>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-3 border-t border-slate-800">
            {/* Captain / Member Management Action */}
            {(isUserCaptain || isUserMember) && onOpenManageTeam && (
              <button
                id="modal-manage-squad-btn"
                onClick={() => {
                  onClose();
                  onOpenManageTeam(team);
                }}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black font-mono font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/20"
              >
                <Settings className="w-4 h-4" />
                <span>{isUserCaptain ? 'Manage 5-Player Squad' : 'Edit My Slot Information'}</span>
              </button>
            )}

            {/* Admin Review Action */}
            {isAdmin && onOpenAdminReview && (
              <button
                id="modal-admin-review-team-btn"
                onClick={() => {
                  onClose();
                  onOpenAdminReview(team);
                }}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-mono font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-lg shadow-purple-500/20"
              >
                <Shield className="w-4 h-4" />
                <span>Open Staff Review</span>
              </button>
            )}

            <button
              id="modal-close-btn"
              onClick={onClose}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 font-mono font-bold text-xs uppercase transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
