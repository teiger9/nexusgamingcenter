import React, { useState, useEffect } from 'react';
import {
  X,
  Users,
  Crown,
  Shield,
  CheckCircle2,
  Clock,
  AlertCircle,
  AlertTriangle,
  Phone,
  UserPlus,
  Trash2,
  Send,
  RotateCw,
  Copy,
  Check,
  Gamepad2,
  Award,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import {
  Tournament,
  Player,
  TeamTournamentRegistration,
  TeamTournamentPlayerSlot,
  TeamRegistrationStatus,
} from '../types';
import {
  getTournamentGameConfig,
  validatePhoneNumber,
  maskPhoneNumber,
} from '../lib/tournamentGameConfig';
import {
  createTeamTournamentRegistration,
  invitePlayerToTournamentTeam,
  completeTournamentPlayerSlot,
  removePlayerFromTeamSlot,
  cancelTournamentTeamInvitation,
  resendTournamentTeamInvitation,
  submitTeamRegistration,
  cancelTeamRegistration,
  withdrawTeamRegistrationSubmission,
  playerAcceptInvitationPrompt,
} from '../services/tournamentService';
import {
  countCompletedDistinctPlayers,
  isPlayerSlotComplete,
  isPlayerInformationComplete,
  getPlayerMissingInformation,
  getPlayerSlotState,
  isPlayerInvitationAccepted,
} from '../utils/tournamentTeamStatus';
import { collection, getDocs, query, limit, doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { fetchAllPlayers } from '../services/playerService';
import { useAuth } from '../context/AuthContext';
import { InvitationCountdownBadge } from './InvitationCountdownBadge';

interface TeamTournamentRegistrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  tournament: Tournament;
  currentUser?: Player | null;
  existingRegistration?: TeamTournamentRegistration | null;
  onRegistrationUpdated?: () => void;
}

export const TeamTournamentRegistrationModal: React.FC<TeamTournamentRegistrationModalProps> = ({
  isOpen,
  onClose,
  tournament,
  currentUser,
  existingRegistration,
  onRegistrationUpdated,
}) => {
  const { user, playerProfile } = useAuth();

  const activeUser: Player = currentUser || playerProfile || ({
    uid: user?.uid || '',
    gamerTag: playerProfile?.gamerTag || user?.displayName || 'Captain',
    fullName: playerProfile?.fullName || user?.displayName || '',
    phoneNumber: playerProfile?.phoneNumber || '',
    role: 'player',
    eloRating: 1200,
    wins: 0,
    losses: 0,
    draws: 0,
    streak: 0,
    rank: 'Bronze',
    achievements: [],
    createdAt: Date.now(),
  } as unknown as Player);

  const [currentReg, setCurrentReg] = useState<TeamTournamentRegistration | null>(existingRegistration || null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form states for creating a new team
  const [teamName, setTeamName] = useState('');
  const [teamTag, setTeamTag] = useState('');
  const [captainFullName, setCaptainFullName] = useState(
    currentUser?.fullName ||
      currentUser?.gamerTag ||
      playerProfile?.fullName ||
      playerProfile?.gamerTag ||
      user?.displayName ||
      ''
  );
  const [captainPhone, setCaptainPhone] = useState(
    currentUser?.phoneNumber || playerProfile?.phoneNumber || ''
  );
  const [captainInGameName, setCaptainInGameName] = useState('');
  const [captainRank, setCaptainRank] = useState('');
  const [customRankMode, setCustomRankMode] = useState(false);

  // Form states for filling a teammate's slot
  const [fillingSlotNumber, setFillingSlotNumber] = useState<number | null>(null);
  const [slotFullName, setSlotFullName] = useState('');
  const [slotPhone, setSlotPhone] = useState('');
  const [slotInGameName, setSlotInGameName] = useState('');
  const [slotRank, setSlotRank] = useState('');
  const [slotCustomRankMode, setSlotCustomRankMode] = useState(false);
  const [slotConfirmed, setSlotConfirmed] = useState(false);

  // Player search for invitations
  const [invitingSlotNumber, setInvitingSlotNumber] = useState<number | null>(null);
  const [searchPlayerQuery, setSearchPlayerQuery] = useState('');
  const [availablePlayers, setAvailablePlayers] = useState<Player[]>([]);
  const [loadingPlayers, setLoadingPlayers] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Confirmation modal states
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [confirmCancelSlot, setConfirmCancelSlot] = useState<{
    slotNumber: 2 | 3 | 4 | 5;
    playerName: string;
  } | null>(null);
  const [confirmRemoveSlot, setConfirmRemoveSlot] = useState<{
    slotNumber: 2 | 3 | 4 | 5;
    playerName: string;
  } | null>(null);

  const gameConfig = getTournamentGameConfig(tournament.gameId, tournament.gameName);

  useEffect(() => {
    if (existingRegistration) {
      setCurrentReg(existingRegistration);
    }
  }, [existingRegistration]);

  // Real-time synchronization directly from Firebase to ensure latest player status
  useEffect(() => {
    if (!isOpen || !currentReg?.id) return;

    const unsub = onSnapshot(
      doc(db, 'tournamentTeamRegistrations', currentReg.id),
      (snap) => {
        if (snap.exists()) {
          setCurrentReg(snap.data() as TeamTournamentRegistration);
        }
      },
      (err) => {
        console.error('Error listening to team registration:', err);
      }
    );

    return () => unsub();
  }, [isOpen, currentReg?.id]);

  useEffect(() => {
    if (isOpen && activeUser) {
      if (!captainFullName) {
        setCaptainFullName(activeUser.fullName || activeUser.gamerTag || '');
      }
      if (!captainPhone) {
        setCaptainPhone(activeUser.phoneNumber || '');
      }
      setErrorMsg(null);
      setSuccessMsg(null);
    }
  }, [isOpen, activeUser.uid, activeUser.fullName, activeUser.phoneNumber, activeUser.gamerTag]);

  // Load registered players for invitation picker
  const loadPlayersForInvite = async () => {
    try {
      setLoadingPlayers(true);
      const allPlayers = await fetchAllPlayers();
      const authUid = (auth.currentUser?.uid || user?.uid || activeUser?.uid || '').trim();
      const list = allPlayers.filter((p) => p.uid !== activeUser.uid && p.uid !== authUid);
      setAvailablePlayers(list);
    } catch (err) {
      console.error('Error loading players:', err);
    } finally {
      setLoadingPlayers(false);
    }
  };

  if (!isOpen) return null;

  const isCaptain = Boolean(activeUser.uid && currentReg?.captainId === activeUser.uid);
  const userSlot = currentReg?.slots.find(
    (s) => activeUser.uid && (s.playerId === activeUser.uid || s.invitedPlayerId === activeUser.uid)
  );
  const isTeammate = Boolean(userSlot);
  const completedSlotsCount = currentReg
    ? countCompletedDistinctPlayers(currentReg.slots, currentReg.captainPhone)
    : 0;
  const occupiedSlotsCount = currentReg
    ? currentReg.slots.filter(
        (s) =>
          s.status !== 'EMPTY' &&
          s.playerStatus !== 'EMPTY' &&
          s.status !== 'REMOVED' &&
          s.playerStatus !== 'REMOVED' &&
          s.status !== 'DECLINED' &&
          s.playerStatus !== 'DECLINED' &&
          s.status !== 'CANCELLED' &&
          s.playerStatus !== 'CANCELLED'
      ).length
    : 0;
  const allSlotsCompleted = completedSlotsCount === 5;

  // Handle Team Creation
  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!teamName.trim()) {
      setErrorMsg('Please enter an official Team Name.');
      return;
    }

    const phoneValidation = validatePhoneNumber(captainPhone);
    if (!phoneValidation.valid) {
      setErrorMsg(phoneValidation.error || 'Please enter a valid phone number (at least 8 digits).');
      return;
    }

    if (!captainInGameName.trim()) {
      setErrorMsg(`Please enter your ${gameConfig.inGameNameLabel}.`);
      return;
    }

    if (!captainRank.trim()) {
      setErrorMsg(`Please select or specify your ${gameConfig.inGameRankLabel}.`);
      return;
    }

    setLoading(true);
    try {
      const res = await createTeamTournamentRegistration({
        tournament,
        teamName,
        teamTag: teamTag.trim() ? teamTag.toUpperCase() : undefined,
        captain: activeUser,
        captainFullName,
        captainPhone,
        captainInGameName,
        captainRank,
      });

      if (!res.success || !res.registration) {
        setErrorMsg(res.error || 'Failed to create team registration.');
      } else {
        setCurrentReg(res.registration);
        setSuccessMsg(`Team "${teamName}" created! Now complete or invite the remaining 4 players.`);
        onRegistrationUpdated?.();
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error occurred while creating team.');
    } finally {
      setLoading(false);
    }
  };

  // Handle Inviting a Teammate
  const handleInvitePlayer = async (targetPlayer: Player) => {
    if (!currentReg || !invitingSlotNumber) return;
    setErrorMsg(null);

    const authUid = (auth.currentUser?.uid || user?.uid || activeUser?.uid || '').trim();
    if (targetPlayer.uid === activeUser.uid || targetPlayer.uid === authUid) {
      setErrorMsg('You cannot select yourself as an opponent or invite yourself.');
      return;
    }

    setLoading(true);
    try {
      const res = await invitePlayerToTournamentTeam({
        registrationId: currentReg.id,
        slotNumber: invitingSlotNumber as 2 | 3 | 4 | 5,
        targetPlayer,
        captainGamerTag: activeUser.gamerTag,
      });

      if (!res.success) {
        setErrorMsg(res.error || 'Failed to invite player.');
      } else {
        // Fetch fresh document from Firestore for complete state consistency
        try {
          const freshSnap = await getDoc(doc(db, 'tournamentTeamRegistrations', currentReg.id));
          if (freshSnap.exists()) {
            setCurrentReg(freshSnap.data() as TeamTournamentRegistration);
          } else {
            // Fallback to optimistic state
            const updatedSlots = currentReg.slots.map((s) => {
              if (s.slotNumber === invitingSlotNumber) {
                return {
                  ...s,
                  status: 'INVITED' as const,
                  playerId: targetPlayer.uid,
                  gamerTag: targetPlayer.gamerTag,
                  invitedGamerTag: targetPlayer.gamerTag,
                  invitedAt: Date.now(),
                };
              }
              return s;
            });
            setCurrentReg({ ...currentReg, slots: updatedSlots });
          }
        } catch (syncErr) {
          console.warn('Could not sync registration:', syncErr);
        }
        setInvitingSlotNumber(null);
        setSuccessMsg(`Invitation sent to ${targetPlayer.gamerTag}!`);
        onRegistrationUpdated?.();
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to invite player.');
    } finally {
      setLoading(false);
    }
  };

  // Personally Accept Tournament Invitation
  const handleAcceptInvitation = async (slot: TeamTournamentPlayerSlot) => {
    if (!currentReg) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await playerAcceptInvitationPrompt({
        teamId: currentReg.id,
        slotNumber: slot.slotNumber as 1 | 2 | 3 | 4 | 5,
        player: activeUser,
        invitationId: slot.invitationId,
      });
      if (!res.success) {
        setErrorMsg(res.error || 'Failed to accept invitation.');
      } else {
        setSuccessMsg('Invitation accepted! Now please complete your mandatory details.');
        // Fetch fresh registration directly from Firebase to guarantee full synchronization
        try {
          const freshSnap = await getDoc(doc(db, 'tournamentTeamRegistrations', currentReg.id));
          if (freshSnap.exists()) {
            const freshData = freshSnap.data() as TeamTournamentRegistration;
            setCurrentReg(freshData);
            const freshSlot = freshData.slots.find((s) => s.slotNumber === slot.slotNumber) || slot;
            openFillSlotForm(freshSlot);
          } else {
            openFillSlotForm({ ...slot, playerId: activeUser.uid, status: 'ACCEPTED' });
          }
        } catch (fetchErr) {
          openFillSlotForm({ ...slot, playerId: activeUser.uid, status: 'ACCEPTED' });
        }
        onRegistrationUpdated?.();
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error accepting invitation.');
    } finally {
      setLoading(false);
    }
  };

  // Open Teammate Information Completion Form
  const openFillSlotForm = (slot: TeamTournamentPlayerSlot) => {
    // Security check: Captain cannot edit teammates' slots (slots 2..5)
    if (!slot.isCaptain && isCaptain && slot.playerId !== activeUser.uid) {
      setErrorMsg('Team captains cannot edit or confirm information on behalf of teammates.');
      return;
    }
    // Slot 1 can only be edited by Captain
    if (slot.isCaptain && !isCaptain) {
      setErrorMsg('Only the team captain can edit the captain slot.');
      return;
    }
    // Other users cannot edit another player's slot
    if (!slot.isCaptain && slot.playerId && slot.playerId !== activeUser.uid) {
      setErrorMsg('You can only complete your own player slot.');
      return;
    }

    setFillingSlotNumber(slot.slotNumber);
    setSlotFullName(activeUser.fullName || slot.fullName || activeUser.gamerTag || '');
    setSlotPhone(activeUser.phoneNumber || slot.phoneNumber || '');
    setSlotInGameName(slot.inGameName || '');
    setSlotRank(slot.inGameRank || (gameConfig.rankOptions[0] || ''));
    setSlotCustomRankMode(false);
    setSlotConfirmed(false);
    setErrorMsg(null);
  };

  // Submit Teammate Personal Info
  const handleSaveSlotInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentReg || !fillingSlotNumber) return;
    setErrorMsg(null);

    const targetSlot = currentReg.slots.find((s) => s.slotNumber === fillingSlotNumber);
    if (!targetSlot?.isCaptain && isCaptain && targetSlot?.playerId !== activeUser.uid) {
      setErrorMsg('Team captains cannot edit or confirm information on behalf of teammates.');
      return;
    }

    if (!slotConfirmed) {
      setErrorMsg('You must personally confirm that your information is correct before saving.');
      return;
    }

    const phoneValidation = validatePhoneNumber(slotPhone);
    if (!phoneValidation.valid) {
      setErrorMsg(phoneValidation.error || 'Valid phone number is strictly required.');
      return;
    }

    if (!slotInGameName.trim()) {
      setErrorMsg(`Please enter your ${gameConfig.inGameNameLabel}.`);
      return;
    }

    if (!slotRank.trim()) {
      setErrorMsg(`Please specify your ${gameConfig.inGameRankLabel}.`);
      return;
    }

    setLoading(true);
    try {
      const res = await completeTournamentPlayerSlot({
        registrationId: currentReg.id,
        player: activeUser,
        fullName: slotFullName.trim(),
        phoneNumber: slotPhone.trim(),
        inGameName: slotInGameName.trim(),
        inGameRank: slotRank.trim(),
        slotNumber: fillingSlotNumber as 1 | 2 | 3 | 4 | 5,
      });

      if (!res.success) {
        setErrorMsg(res.error || 'Failed to complete slot information.');
      } else {
        // Fetch fresh registration directly from Firebase to guarantee full synchronization
        try {
          const freshSnap = await getDoc(doc(db, 'tournamentTeamRegistrations', currentReg.id));
          if (freshSnap.exists()) {
            setCurrentReg(freshSnap.data() as TeamTournamentRegistration);
          }
        } catch (fetchErr) {
          console.error('Error reading fresh registration after save:', fetchErr);
        }

        setFillingSlotNumber(null);
        setSuccessMsg('Player information verified and saved!');
        onRegistrationUpdated?.();
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error updating slot.');
    } finally {
      setLoading(false);
    }
  };

  // Cancel Invitation
  const handleCancelInvitation = async (slotNumber: 2 | 3 | 4 | 5) => {
    if (!currentReg) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await cancelTournamentTeamInvitation({
        registrationId: currentReg.id,
        slotNumber,
        captainId: activeUser.uid,
      });
      if (!res.success) {
        setErrorMsg(res.error || 'Failed to cancel invitation.');
      } else {
        // Optimistically free the slot immediately so UI is instantaneous
        setCurrentReg((prev) => {
          if (!prev) return prev;
          const updatedSlots = prev.slots.map((s) => {
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
          return {
            ...prev,
            slots: updatedSlots,
            status: 'WAITING_FOR_PLAYERS',
            updatedAt: Date.now(),
          };
        });

        try {
          const freshSnap = await getDoc(doc(db, 'tournamentTeamRegistrations', currentReg.id));
          if (freshSnap.exists()) {
            setCurrentReg(freshSnap.data() as TeamTournamentRegistration);
          }
        } catch (fetchErr) {
          console.error('Error reading fresh registration after cancel invite:', fetchErr);
        }
        setSuccessMsg('Invitation cancelled. Slot is now empty and open for a new player.');
        setConfirmCancelSlot(null);
        onRegistrationUpdated?.();
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error cancelling invitation.');
    } finally {
      setLoading(false);
    }
  };

  // Resend Invitation
  const handleResendInvitation = async (slotNumber: 2 | 3 | 4 | 5) => {
    if (!currentReg) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await resendTournamentTeamInvitation({
        registrationId: currentReg.id,
        slotNumber,
        captainId: activeUser.uid,
        captainGamerTag: activeUser.gamerTag,
      });
      if (!res.success) {
        setErrorMsg(res.error || 'Failed to resend invitation.');
      } else {
        setSuccessMsg('Invitation reminder sent!');
        onRegistrationUpdated?.();
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error resending invitation.');
    } finally {
      setLoading(false);
    }
  };

  // Remove player or clear slot
  const handleRemoveSlot = async (slotNumber: 2 | 3 | 4 | 5) => {
    if (!currentReg) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await removePlayerFromTeamSlot(currentReg.id, slotNumber, activeUser.uid);
      if (!res.success) {
        setErrorMsg(res.error || 'Failed to remove player.');
      } else {
        // Optimistically free the slot so captain can invite replacement
        setCurrentReg((prev) => {
          if (!prev) return prev;
          const updatedSlots = prev.slots.map((s) => {
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
          return {
            ...prev,
            slots: updatedSlots,
            status: 'WAITING_FOR_PLAYERS',
            updatedAt: Date.now(),
          };
        });

        try {
          const freshSnap = await getDoc(doc(db, 'tournamentTeamRegistrations', currentReg.id));
          if (freshSnap.exists()) {
            setCurrentReg(freshSnap.data() as TeamTournamentRegistration);
          }
        } catch (fetchErr) {
          console.error('Error reading fresh registration after remove player:', fetchErr);
        }
        setSuccessMsg('Player removed. You can now invite a replacement to this slot.');
        setConfirmRemoveSlot(null);
        onRegistrationUpdated?.();
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error removing player.');
    } finally {
      setLoading(false);
    }
  };

  // Submit Team Registration for Admin Review
  const handleSubmitForReview = async () => {
    if (!currentReg) return;
    setShowSubmitConfirm(false);
    setErrorMsg(null);
    setLoading(true);

    try {
      const res = await submitTeamRegistration(currentReg.id, activeUser.uid);
      if (!res.success) {
        setErrorMsg(res.error || 'Failed to submit team registration.');
      } else {
        setCurrentReg({
          ...currentReg,
          status: 'PENDING_ADMIN_APPROVAL',
          submittedAt: Date.now(),
          submittedBy: activeUser.uid,
        });
        setSuccessMsg('Team registration submitted! The tournament administration will review your 5-player squad.');
        onRegistrationUpdated?.();
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error submitting registration.');
    } finally {
      setLoading(false);
    }
  };

  // Withdraw Team Registration Submission back to editing
  const handleWithdrawSubmission = async () => {
    if (!currentReg) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await withdrawTeamRegistrationSubmission(currentReg.id, activeUser.uid);
      if (!res.success) {
        setErrorMsg(res.error || 'Failed to withdraw submission.');
      } else {
        setCurrentReg((prev) => prev ? {
          ...prev,
          status: 'WAITING_FOR_PLAYERS',
          submittedAt: undefined,
          submittedBy: undefined,
        } : null);
        setSuccessMsg('Submission withdrawn. Your squad is now in editing mode.');
        onRegistrationUpdated?.();
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error withdrawing submission.');
    } finally {
      setLoading(false);
    }
  };

  // Copy registration link / code
  const handleCopyLink = () => {
    if (!currentReg) return;
    navigator.clipboard.writeText(
      `${window.location.origin}/?tournament=${tournament.id}&teamReg=${currentReg.id}`
    );
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div
        id="team-tournament-registration-modal"
        className="relative w-full max-w-4xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden my-8"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold tracking-wider uppercase px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  5 VS 5 Team Tournament
                </span>
                <span className="text-xs font-medium text-slate-400">
                  {gameConfig.gameName}
                </span>
              </div>
              <h2 className="text-xl font-bold text-white mt-1">
                {currentReg ? currentReg.teamName : `Register Team: ${tournament.name}`}
              </h2>
            </div>
          </div>
          <button
            id="close-team-reg-modal-btn"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Notifications & Status alerts */}
        {errorMsg && (
          <div className="mx-6 mt-4 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start space-x-3 text-rose-300 text-sm">
            <AlertCircle className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">{errorMsg}</div>
            <button onClick={() => setErrorMsg(null)} className="text-rose-400 hover:text-rose-200">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {successMsg && (
          <div className="mx-6 mt-4 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-start space-x-3 text-emerald-300 text-sm">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">{successMsg}</div>
            <button onClick={() => setSuccessMsg(null)} className="text-emerald-400 hover:text-emerald-200">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* BODY */}
        <div className="p-6 max-h-[75vh] overflow-y-auto space-y-6">
          {!currentReg ? (
            /* ============================================================
               VIEW 1: CREATE NEW 5V5 TEAM REGISTRATION
               ============================================================ */
            <form onSubmit={handleCreateTeam} className="space-y-6">
              <div className="p-4 rounded-xl bg-cyan-950/30 border border-cyan-500/20 text-slate-300 text-sm flex items-start space-x-3">
                <Shield className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" />
                <div>
                  <strong className="text-cyan-300 font-semibold block mb-0.5">
                    Official 5v5 Tournament Roster Rules:
                  </strong>
                  As Captain, you create the team entry and fill your personal slot. You will then invite or add the other 4 players. Once all 5 slots are complete, submit the registration for Admin review.
                </div>
              </div>

              {/* Team Details */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
                  Team Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Official Team Name *
                    </label>
                    <input
                      id="team-name-input"
                      type="text"
                      required
                      placeholder="e.g. Nexus Wolves, Cyber Dynasty, Titan 5"
                      value={teamName}
                      onChange={(e) => setTeamName(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-800/80 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 text-sm font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Team Tag (Optional)
                    </label>
                    <input
                      id="team-tag-input"
                      type="text"
                      maxLength={6}
                      placeholder="e.g. NW, CD"
                      value={teamTag}
                      onChange={(e) => setTeamTag(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-800/80 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 text-sm font-medium uppercase"
                    />
                  </div>
                </div>
              </div>

              {/* Captain Slot Details */}
              <div className="space-y-4 pt-4 border-t border-slate-800">
                <div className="flex items-center space-x-2">
                  <Crown className="w-4 h-4 text-amber-400" />
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
                    Slot #1: Captain Profile ({activeUser.gamerTag})
                  </h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Full Legal Name *
                    </label>
                    <input
                      id="captain-fullname-input"
                      type="text"
                      required
                      placeholder="Your First & Last Name"
                      value={captainFullName}
                      onChange={(e) => setCaptainFullName(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-800/80 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Contact Phone Number * (Private)
                    </label>
                    <div className="relative">
                      <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                      <input
                        id="captain-phone-input"
                        type="tel"
                        required
                        placeholder="+1 (555) 000-0000"
                        value={captainPhone}
                        onChange={(e) => setCaptainPhone(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-800/80 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 text-sm"
                      />
                    </div>
                    <span className="text-[11px] text-slate-400 mt-1 block">
                      Protected info: only visible to you, tournament commission, and verified admin.
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      {gameConfig.inGameNameLabel} *
                    </label>
                    <input
                      id="captain-ingamename-input"
                      type="text"
                      required
                      placeholder={gameConfig.inGameNamePlaceholder}
                      value={captainInGameName}
                      onChange={(e) => setCaptainInGameName(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-800/80 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 text-sm"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-semibold text-slate-300">
                        {gameConfig.inGameRankLabel} *
                      </label>
                      <button
                        type="button"
                        onClick={() => setCustomRankMode(!customRankMode)}
                        className="text-[11px] text-cyan-400 hover:underline"
                      >
                        {customRankMode ? 'Select from list' : 'Custom rank / rating'}
                      </button>
                    </div>

                    {customRankMode ? (
                      <input
                        id="captain-custom-rank-input"
                        type="text"
                        required
                        placeholder="e.g. 18,500 ELO / High Tier"
                        value={captainRank}
                        onChange={(e) => setCaptainRank(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl bg-slate-800/80 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 text-sm"
                      />
                    ) : (
                      <select
                        id="captain-rank-select"
                        required
                        value={captainRank}
                        onChange={(e) => setCaptainRank(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl bg-slate-800/80 border border-slate-700 text-white focus:outline-none focus:border-cyan-500 text-sm"
                      >
                        <option value="">-- Select {gameConfig.gameName} Rank --</option>
                        {gameConfig.rankOptions.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              </div>

              {/* Submit Button */}
              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 font-medium text-sm transition-colors"
                >
                  Cancel
                </button>
                <button
                  id="create-team-btn"
                  type="submit"
                  disabled={loading}
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-semibold text-sm shadow-lg shadow-cyan-500/20 disabled:opacity-50 transition-all flex items-center space-x-2"
                >
                  <Users className="w-4 h-4" />
                  <span>{loading ? 'Creating...' : 'Create 5v5 Squad Room'}</span>
                </button>
              </div>
            </form>
          ) : (
            /* ============================================================
               VIEW 2: ROSTER MANAGEMENT & SUBMISSION ROOM
               ============================================================ */
            <div className="space-y-6">
              {/* Squad Status Header Card */}
              <div className="p-5 rounded-2xl bg-gradient-to-r from-slate-900 to-slate-950 border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex items-center space-x-4">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-indigo-500/20 border border-cyan-500/30 flex items-center justify-center text-3xl shadow-inner">
                    {currentReg.teamLogo || '🛡️'}
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <h3 className="text-xl font-bold text-white">{currentReg.teamName}</h3>
                      {currentReg.teamTag && (
                        <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                          [{currentReg.teamTag}]
                        </span>
                      )}
                    </div>
                    <div className="flex items-center space-x-3 text-xs text-slate-400 mt-1">
                      <span className="flex items-center space-x-1">
                        <Crown className="w-3.5 h-3.5 text-amber-400" />
                        <span>Captain: <strong className="text-slate-200">{currentReg.captainGamerTag}</strong></span>
                      </span>
                      <span>•</span>
                      <span>Roster: <strong className="text-cyan-400">{completedSlotsCount} / 5</strong> Verified</span>
                      <span>•</span>
                      <span>Slots: <strong className="text-slate-200">{occupiedSlotsCount} / 5</strong> Claimed</span>
                    </div>
                  </div>
                </div>

                {/* Status Badge */}
                <div className="flex items-center space-x-3">
                  {currentReg.status === 'WAITING_FOR_PLAYERS' && (
                    <div className="px-3.5 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-semibold flex items-center space-x-2">
                      <Clock className="w-4 h-4 text-amber-400 animate-pulse" />
                      <span>Roster Incomplete ({completedSlotsCount}/5)</span>
                    </div>
                  )}
                  {currentReg.status === 'READY_TO_SUBMIT' && (
                    <div className="px-3.5 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center space-x-2 shadow-sm">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span>Ready to Submit (5/5 Complete)</span>
                    </div>
                  )}
                  {currentReg.status === 'PENDING_ADMIN_APPROVAL' && (
                    <div className="px-3.5 py-1.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-semibold flex items-center space-x-2">
                      <Clock className="w-4 h-4 text-cyan-400 animate-spin" />
                      <span>Pending Admin Approval</span>
                    </div>
                  )}
                  {currentReg.status === 'CONFIRMED' && (
                    <div className="px-3.5 py-1.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center space-x-2">
                      <Sparkles className="w-4 h-4 text-emerald-400" />
                      <span>Officially Registered</span>
                    </div>
                  )}
                  {currentReg.status === 'REJECTED' && (
                    <div className="px-3.5 py-1.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-semibold flex items-center space-x-2">
                      <AlertCircle className="w-4 h-4 text-rose-400" />
                      <span>Rejected by Admin</span>
                    </div>
                  )}

                  {/* Share Link Button */}
                  <button
                    id="copy-squad-link-btn"
                    onClick={handleCopyLink}
                    title="Copy Squad Room Invite Link"
                    className="p-2 rounded-xl border border-slate-700 bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
                  >
                    {copiedLink ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Status Alert Details */}
              {currentReg.status === 'PENDING_ADMIN_APPROVAL' && (
                <div className="p-4 rounded-xl bg-cyan-950/40 border border-cyan-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-sm text-slate-300">
                  <div className="flex items-start space-x-3">
                    <Clock className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-semibold text-cyan-300">
                        Team Submitted for Commission Approval
                      </h4>
                      <p className="mt-0.5 text-xs text-slate-300">
                        The tournament organizer is currently reviewing your 5-player roster, game handles, and contact details.
                        Once approved, your team will be officially seeded in the tournament bracket.
                      </p>
                    </div>
                  </div>
                  {isCaptain && (
                    <button
                      id="withdraw-submission-btn"
                      type="button"
                      onClick={handleWithdrawSubmission}
                      disabled={loading}
                      title="Retract submission to change roster players"
                      className="px-3.5 py-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 text-xs font-mono font-bold transition-all shadow-sm flex items-center space-x-1.5 whitespace-nowrap self-start sm:self-auto flex-shrink-0"
                    >
                      <RotateCw className="w-3.5 h-3.5" />
                      <span>Retract to Edit Roster</span>
                    </button>
                  )}
                </div>
              )}

              {currentReg.status === 'REJECTED' && (
                <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-500/30 flex items-start space-x-3 text-sm text-slate-300">
                  <AlertCircle className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-rose-300">Registration Declined</h4>
                    <p className="mt-0.5 text-xs text-rose-200">
                      Reason: {currentReg.rejectionReason || 'Requirements not met.'}
                    </p>
                    {currentReg.adminNotes && (
                      <p className="mt-1 text-xs text-slate-400 italic">
                        Admin Note: "{currentReg.adminNotes}"
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* The 5 Player Slots */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    5-Player Roster Slots (Required: 5 / 5)
                  </h4>
                  <span className="text-xs text-slate-400">
                    {completedSlotsCount}/5 completed
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  {currentReg.slots.map((slot) => {
                    const isUserThisSlot =
                      (activeUser.uid && (slot.playerId === activeUser.uid || slot.invitedPlayerId === activeUser.uid)) ||
                      (slot.invitedGamerTag &&
                        activeUser.gamerTag &&
                        slot.invitedGamerTag.toLowerCase() === activeUser.gamerTag.toLowerCase());

                    // Strict security: Captain can only edit Slot 1 (captain slot).
                    // Slots 2..5 can ONLY be edited by the assigned teammate. Captain CANNOT edit other players.
                    const canEditSlot =
                      (slot.isCaptain ? isCaptain : isUserThisSlot) &&
                      currentReg.status !== 'CONFIRMED' &&
                      currentReg.status !== 'PENDING_ADMIN_APPROVAL';

                    const isAuthorizedPhone = isCaptain || isUserThisSlot;
                    const slotState = getPlayerSlotState(
                      slot,
                      slot.isCaptain ? currentReg.captainPhone : undefined
                    );
                    const isComplete = slotState === 'INFORMATION_COMPLETE';
                    const isAcceptedIncomplete = slotState === 'ACCEPTED_INCOMPLETE';
                    const isInvited = slotState === 'INVITATION_PENDING';
                    const isEmpty = slotState === 'EMPTY';
                    const isDeclined = slotState === 'DECLINED';
                    const isRemoved = slotState === 'REMOVED';

                    // Check if slot has an active pending/waiting invitation (including AVAILABLE / WAITING)
                    const isWaitingInvite =
                      !slot.isCaptain &&
                      (isInvited ||
                        ['AVAILABLE / WAITING', 'WAITING', 'INVITED', 'PENDING', 'INVITATION_SENT', 'WAITING_FOR_ACCEPTANCE'].includes(slot.status || '') ||
                        ['INVITED', 'WAITING'].includes(slot.playerStatus || '') ||
                        ['PENDING', 'WAITING_FOR_ACCEPTANCE'].includes(slot.invitationStatus || '') ||
                        Boolean(slot.invitedPlayerId || (slot as any).recipientId || slot.invitedGamerTag || slot.invitationId)) &&
                      !isComplete &&
                      !isAcceptedIncomplete &&
                      !isRemoved &&
                      !isDeclined &&
                      !isEmpty;

                    const isEffectiveEmpty = !slot.isCaptain && (isEmpty || (!isComplete && !isAcceptedIncomplete && !isWaitingInvite && !isRemoved && !isDeclined));

                    const missingFields = isComplete
                      ? []
                      : getPlayerMissingInformation(slot, slot.isCaptain ? currentReg.captainPhone : undefined);

                    const effectivePhone = slot.phoneNumber || (slot.isCaptain ? currentReg.captainPhone : '');

                    return (
                      <div
                        key={slot.slotNumber}
                        id={`squad-slot-${slot.slotNumber}`}
                        className={`p-4 rounded-xl border transition-all ${
                          isComplete
                            ? 'bg-slate-800/60 border-slate-700/80 hover:border-slate-600'
                            : isAcceptedIncomplete
                            ? 'bg-amber-950/25 border-amber-500/40'
                            : isWaitingInvite
                            ? 'bg-blue-950/20 border-blue-500/30'
                            : isRemoved
                            ? 'bg-amber-950/15 border-amber-500/30'
                            : isDeclined
                            ? 'bg-rose-950/20 border-rose-500/30'
                            : 'bg-slate-900/40 border-dashed border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                          {/* Slot Info */}
                          <div className="flex items-center space-x-3">
                            <div
                              className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm ${
                                slot.isCaptain
                                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                  : isComplete
                                  ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                                  : isAcceptedIncomplete
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                  : isWaitingInvite
                                  ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                                  : isRemoved
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                  : isDeclined
                                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                  : 'bg-slate-800 text-slate-500 border border-slate-700'
                              }`}
                            >
                              {slot.isCaptain ? <Crown className="w-4 h-4" /> : `#${slot.slotNumber}`}
                            </div>

                            <div>
                              <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                                <span className="font-semibold text-sm text-white">
                                  {isComplete
                                    ? slot.gamerTag
                                    : isAcceptedIncomplete
                                    ? `${slot.gamerTag || slot.invitedGamerTag || 'Player'}`
                                    : isWaitingInvite
                                    ? `${slot.invitedGamerTag || slot.gamerTag || 'Invited Player'}`
                                    : isRemoved
                                    ? (slot.removedPlayerGamerTag ? `Slot #${slot.slotNumber} (Previously ${slot.removedPlayerGamerTag})` : `Slot #${slot.slotNumber}`)
                                    : `Slot #${slot.slotNumber}`}
                                </span>
                                {slot.isCaptain && (
                                  <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                    Captain
                                  </span>
                                )}
                                {isComplete && (
                                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center space-x-1">
                                    <span>🟢</span>
                                    <span>PLAYER COMPLETE</span>
                                  </span>
                                )}
                                {isAcceptedIncomplete && (
                                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center space-x-1">
                                    <span>⚠️</span>
                                    <span>INFORMATION INCOMPLETE</span>
                                  </span>
                                )}
                                {isWaitingInvite && (
                                  <InvitationCountdownBadge
                                    expiresAt={slot.expiresAt}
                                    createdAt={slot.invitedAt}
                                    size="xs"
                                  />
                                )}
                                {isRemoved && (
                                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
                                    REMOVED / CANCELLED
                                  </span>
                                )}
                                {isEffectiveEmpty && (
                                  <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                                    EMPTY
                                  </span>
                                )}
                                {isDeclined && (
                                  <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
                                    INVITATION DECLINED
                                  </span>
                                )}
                                {slot.presenceStatus && slot.presenceStatus !== 'NOT_CONFIRMED' && (
                                  <span
                                    className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border ${
                                      slot.presenceStatus === 'CONFIRMED'
                                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                                        : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                                    }`}
                                  >
                                    {slot.presenceStatus}
                                  </span>
                                )}
                              </div>

                              {isComplete ? (
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400 mt-1">
                                  <span>Name: <strong className="text-slate-300">{slot.fullName}</strong></span>
                                  <span>•</span>
                                  <span>{gameConfig.inGameNameLabel}: <strong className="text-cyan-300">{slot.inGameName}</strong></span>
                                  <span>•</span>
                                  <span>Rank: <strong className="text-amber-300">{slot.inGameRank}</strong></span>
                                  <span>•</span>
                                  <span className="flex items-center space-x-1">
                                    <Phone className="w-3 h-3 text-slate-500" />
                                    <span>{maskPhoneNumber(effectivePhone, isAuthorizedPhone)}</span>
                                  </span>
                                </div>
                              ) : isAcceptedIncomplete ? (
                                <div>
                                  <p className="text-xs text-emerald-300/90 mt-0.5 font-medium">
                                    ✅ Player accepted invitation! Waiting for player to complete their mandatory details.
                                  </p>
                                  {missingFields.length > 0 && (
                                    <p className="text-[11px] text-amber-400 font-mono mt-0.5">
                                      Missing: {missingFields.join(', ')}
                                    </p>
                                  )}
                                </div>
                              ) : isWaitingInvite ? (
                                <div>
                                  <p className="text-xs text-blue-300/80 mt-0.5">
                                    ⏳ AVAILABLE / WAITING — Invitation pending player acceptance.
                                  </p>
                                  <p className="text-[11px] text-blue-400/90 font-mono mt-0.5">
                                    Player: <strong className="text-blue-200">{slot.invitedGamerTag || slot.gamerTag || 'Invited Teammate'}</strong>
                                  </p>
                                </div>
                              ) : isRemoved ? (
                                <div>
                                  <p className="text-xs text-amber-300/90 mt-0.5 font-medium">
                                    Player removed from roster. Captain can invite a replacement to this slot.
                                  </p>
                                </div>
                              ) : (
                                <p className="text-xs text-slate-500 mt-0.5">
                                  Empty player slot. Captain must invite a player.
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Slot Actions */}
                          <div className="flex items-center space-x-2 self-end sm:self-center">
                            {/* If slot is empty, removed, or declined and activeUser is captain */}
                            {(isEffectiveEmpty || isRemoved || isDeclined) && isCaptain && currentReg.status !== 'CONFIRMED' && (
                              <button
                                id={`invite-slot-${slot.slotNumber}-btn`}
                                onClick={() => {
                                  setInvitingSlotNumber(slot.slotNumber);
                                  loadPlayersForInvite();
                                }}
                                disabled={loading}
                                className={`px-3.5 py-1.5 rounded-lg text-white text-xs font-semibold flex items-center space-x-1.5 transition-colors shadow-sm ${
                                  isRemoved || isDeclined
                                    ? 'bg-amber-600 hover:bg-amber-500 border border-amber-500/40'
                                    : 'bg-indigo-600 hover:bg-indigo-500 border border-indigo-500/40'
                                }`}
                              >
                                <UserPlus className="w-3.5 h-3.5" />
                                <span>{isRemoved || isDeclined ? '+ Invite Replacement' : '+ Invite Player'}</span>
                              </button>
                            )}

                            {/* If slot is invited and current user is that invited player: Stage 1 Accept */}
                            {isWaitingInvite && isUserThisSlot && (
                              <button
                                id={`accept-invited-slot-${slot.slotNumber}-btn`}
                                onClick={() => handleAcceptInvitation(slot)}
                                disabled={loading}
                                className="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold transition-colors flex items-center space-x-1.5 shadow-sm"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Accept Invitation</span>
                              </button>
                            )}

                            {/* If slot has a pending/waiting invitation and activeUser is captain: REMOVE / Resend */}
                            {isWaitingInvite && isCaptain && currentReg.status !== 'CONFIRMED' && (
                              <div className="flex items-center space-x-2">
                                <button
                                  id={`cancel-slot-${slot.slotNumber}-btn`}
                                  onClick={() => setConfirmCancelSlot({
                                    slotNumber: slot.slotNumber as 2 | 3 | 4 | 5,
                                    playerName: slot.invitedGamerTag || slot.gamerTag || `Slot ${slot.slotNumber}`,
                                  })}
                                  disabled={loading}
                                  title="Cancel Invitation and free this roster slot"
                                  className="px-3 py-1.5 rounded-lg border border-rose-500/40 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-xs font-semibold transition-colors flex items-center space-x-1.5 shadow-sm"
                                >
                                  <X className="w-3.5 h-3.5 text-rose-400" />
                                  <span>❌ REMOVE</span>
                                </button>
                                <button
                                  id={`resend-slot-${slot.slotNumber}-btn`}
                                  onClick={() => handleResendInvitation(slot.slotNumber as 2 | 3 | 4 | 5)}
                                  disabled={loading}
                                  title="Resend invitation reminder"
                                  className="px-2.5 py-1.5 rounded-lg border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 text-xs font-semibold transition-colors flex items-center space-x-1"
                                >
                                  <RotateCw className="w-3 h-3 text-blue-300" />
                                  <span>↻ Resend</span>
                                </button>
                              </div>
                            )}

                            {/* If slot is accepted but incomplete and current user is that player: Stage 2 Complete Info */}
                            {isAcceptedIncomplete && isUserThisSlot && (
                              <button
                                id={`complete-invited-slot-${slot.slotNumber}-btn`}
                                onClick={() => openFillSlotForm(slot)}
                                disabled={loading}
                                className="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold transition-colors flex items-center space-x-1.5 shadow-sm"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Complete My Information</span>
                              </button>
                            )}

                            {/* If slot is completed and the player is looking at their own slot */}
                            {isComplete && canEditSlot && (
                              <button
                                id={`edit-slot-${slot.slotNumber}-btn`}
                                onClick={() => openFillSlotForm(slot)}
                                className="px-2.5 py-1 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors"
                              >
                                Edit My Info
                              </button>
                            )}

                            {/* Captain can remove teammate from slot if accepted or completed (not captain slot) */}
                            {(isAcceptedIncomplete || isComplete) && !slot.isCaptain && isCaptain && currentReg.status !== 'CONFIRMED' && (
                              <button
                                id={`remove-slot-${slot.slotNumber}-btn`}
                                onClick={() => setConfirmRemoveSlot({
                                  slotNumber: slot.slotNumber as 2 | 3 | 4 | 5,
                                  playerName: slot.gamerTag || slot.fullName || `Player ${slot.slotNumber}`,
                                })}
                                disabled={loading}
                                title="Remove Player from Roster"
                                className="px-3 py-1.5 rounded-lg border border-rose-500/40 bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 text-xs font-semibold transition-colors flex items-center space-x-1.5 shadow-sm"
                              >
                                <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                                <span>❌ Remove Player</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Ready to Submit Banner (Captain view when all 5 slots ready) */}
              {isCaptain && allSlotsCompleted && currentReg.status === 'READY_TO_SUBMIT' && (
                <div className="p-5 rounded-2xl bg-gradient-to-r from-emerald-950/40 via-cyan-950/40 to-slate-900 border border-emerald-500/40 shadow-xl space-y-3">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400">
                      <CheckCircle2 className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="font-bold text-white text-base">
                        All 5 Player Slots Are Complete!
                      </h4>
                      <p className="text-xs text-slate-300 mt-0.5">
                        Your 5v5 team roster is fully verified with verified contact details and game rankings.
                        You can now officially submit the team for tournament commission review.
                      </p>
                    </div>
                  </div>

                  <div className="pt-2 flex items-center justify-end">
                    <button
                      id="submit-team-for-review-btn"
                      onClick={() => setShowSubmitConfirm(true)}
                      disabled={loading}
                      className="px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold text-sm shadow-lg shadow-emerald-500/25 transition-all flex items-center space-x-2"
                    >
                      <Send className="w-4 h-4" />
                      <span>Submit Team for Admin Approval</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* Incomplete Roster Guidance and Disabled Submit Button */}
              {!allSlotsCompleted && isCaptain && currentReg.status === 'WAITING_FOR_PLAYERS' && (
                <div className="p-5 rounded-2xl bg-slate-900 border border-amber-500/30 shadow-lg space-y-4">
                  <div className="flex items-start space-x-3">
                    <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-bold text-white text-sm">
                        Team Roster Incomplete ({completedSlotsCount} / 5 Players Complete)
                      </h4>
                      <p className="text-xs text-amber-200/90 mt-1">
                        Your team is not complete. Every player must accept their invitation and complete their information.
                      </p>
                    </div>
                  </div>

                  <div className="pt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-slate-800">
                    <span className="text-xs text-slate-400">
                      {5 - completedSlotsCount} player slot{5 - completedSlotsCount === 1 ? '' : 's'} pending personal acceptance and information
                    </span>
                    <button
                      id="submit-team-disabled-btn"
                      disabled
                      title="All 5 players must personally accept invitations and complete their details"
                      className="px-5 py-2.5 rounded-xl bg-slate-800 text-slate-500 border border-slate-700/60 font-semibold text-xs uppercase tracking-wider cursor-not-allowed flex items-center justify-center space-x-2"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Submit Team Registration</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ============================================================
            SUB-MODAL: FILL / EDIT PLAYER INFORMATION FOR A SLOT
            ============================================================ */}
        {fillingSlotNumber && (
          <div className="absolute inset-0 z-20 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
            <form
              onSubmit={handleSaveSlotInfo}
              className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl p-6 space-y-4 shadow-2xl"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center space-x-2">
                  <Gamepad2 className="w-5 h-5 text-cyan-400" />
                  <h3 className="font-bold text-white text-base">
                    Complete Slot #{fillingSlotNumber} Information
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setFillingSlotNumber(null)}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Full Legal Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="First & Last Name"
                  value={slotFullName}
                  onChange={(e) => setSlotFullName(e.target.value)}
                  className="w-full px-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Contact Phone Number * (Private)
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="tel"
                    required
                    placeholder="+1 (555) 000-0000"
                    value={slotPhone}
                    onChange={(e) => setSlotPhone(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 text-sm"
                  />
                </div>
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Mandatory contact info for tournament verification. Kept strictly private.
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  {gameConfig.inGameNameLabel} *
                </label>
                <input
                  type="text"
                  required
                  placeholder={gameConfig.inGameNamePlaceholder}
                  value={slotInGameName}
                  onChange={(e) => setSlotInGameName(e.target.value)}
                  className="w-full px-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 text-sm"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-300">
                    {gameConfig.inGameRankLabel} *
                  </label>
                  <button
                    type="button"
                    onClick={() => setSlotCustomRankMode(!slotCustomRankMode)}
                    className="text-[11px] text-cyan-400 hover:underline"
                  >
                    {slotCustomRankMode ? 'Select preset' : 'Custom rating'}
                  </button>
                </div>

                {slotCustomRankMode ? (
                  <input
                    type="text"
                    required
                    placeholder="e.g. 15,000 ELO / Diamond"
                    value={slotRank}
                    onChange={(e) => setSlotRank(e.target.value)}
                    className="w-full px-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 text-sm"
                  />
                ) : (
                  <select
                    required
                    value={slotRank}
                    onChange={(e) => setSlotRank(e.target.value)}
                    className="w-full px-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-cyan-500 text-sm"
                  >
                    <option value="">-- Select Rank --</option>
                    {gameConfig.rankOptions.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Mandatory Personal Confirmation Checkbox */}
              <div className="p-3.5 rounded-xl bg-cyan-950/30 border border-cyan-500/30 flex items-start space-x-3">
                <input
                  id="slot-personal-confirmation-checkbox"
                  type="checkbox"
                  required
                  checked={slotConfirmed}
                  onChange={(e) => setSlotConfirmed(e.target.checked)}
                  className="w-4 h-4 mt-0.5 text-cyan-500 rounded border-slate-700 focus:ring-cyan-500"
                />
                <label
                  htmlFor="slot-personal-confirmation-checkbox"
                  className="text-xs text-slate-200 leading-relaxed cursor-pointer select-none"
                >
                  I confirm that this information belongs to me and is correct. I understand that only personal player verification qualifies this slot for tournament approval.
                </label>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setFillingSlotNumber(null)}
                  className="px-4 py-2 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 text-sm"
                >
                  Cancel
                </button>
                <button
                  id="save-and-complete-slot-btn"
                  type="submit"
                  disabled={loading || !slotConfirmed}
                  className={`px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider shadow-md transition-all ${
                    slotConfirmed && !loading
                      ? 'bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-400 hover:to-teal-400 text-white'
                      : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                  }`}
                >
                  {loading ? 'Saving...' : 'SAVE AND COMPLETE'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ============================================================
            SUB-MODAL: INVITE PLAYER SEARCH
            ============================================================ */}
        {invitingSlotNumber && (
          <div className="absolute inset-0 z-20 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl p-6 space-y-4 shadow-2xl">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center space-x-2">
                  <UserPlus className="w-5 h-5 text-cyan-400" />
                  <h3 className="font-bold text-white text-base">
                    Invite Teammate to Slot #{invitingSlotNumber}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setInvitingSlotNumber(null)}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* 5-Player Limit Warning */}
              {currentReg && currentReg.slots.filter(
                (s) => s.status !== 'EMPTY' && s.status !== 'REMOVED' && s.status !== 'DECLINED' && s.status !== 'CANCELLED'
              ).length >= 5 && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-mono flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>TEAM FULL — 5/5 PLAYERS. Maximum team size reached.</span>
                </div>
              )}

              <div>
                <input
                  type="text"
                  placeholder="Filter registered players by GamerTag..."
                  value={searchPlayerQuery}
                  onChange={(e) => setSearchPlayerQuery(e.target.value)}
                  className="w-full px-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 text-sm"
                />
              </div>

              <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                {loadingPlayers ? (
                  <p className="text-xs text-slate-400 text-center py-4">Loading player registry...</p>
                ) : (
                  availablePlayers
                    .filter((p) => {
                      const pUid = p.uid || (p as any).playerUid || (p as any).id;
                      if (!pUid || pUid === currentReg?.captainId) return false;
                      const isAlreadyOnTeam = currentReg?.slots.some((s) => {
                        const isSame = s.playerId === pUid || s.invitedPlayerId === pUid || (s as any).recipientId === pUid;
                        const isActive = s.status !== 'EMPTY' && s.status !== 'REMOVED' && s.status !== 'DECLINED' && s.status !== 'CANCELLED';
                        return isSame && isActive;
                      });
                      if (isAlreadyOnTeam) return false;
                      const q = searchPlayerQuery.toLowerCase();
                      return (
                        !searchPlayerQuery.trim() ||
                        (p?.gamerTag && p.gamerTag.toLowerCase().includes(q)) ||
                        (p?.fullName && p.fullName.toLowerCase().includes(q))
                      );
                    })
                    .map((player) => (
                      <div
                        key={player.uid}
                        className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 flex items-center justify-between hover:border-slate-600 transition-colors"
                      >
                        <div>
                          <p className="font-semibold text-sm text-white">{player.gamerTag}</p>
                          <p className="text-xs text-slate-400">{player.fullName || 'Nexus Competitor'}</p>
                        </div>
                        <button
                          onClick={() => handleInvitePlayer(player)}
                          disabled={loading || (currentReg?.slots.filter((s) => s.status !== 'EMPTY' && s.status !== 'REMOVED' && s.status !== 'DECLINED' && s.status !== 'CANCELLED').length || 0) >= 5}
                          className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold transition-colors flex items-center space-x-1 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Send className="w-3 h-3" />
                          <span>Invite</span>
                        </button>
                      </div>
                    ))
                )}
              </div>

              <div className="pt-2 border-t border-slate-800 flex justify-end">
                <button
                  type="button"
                  onClick={() => setInvitingSlotNumber(null)}
                  className="px-4 py-2 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 text-sm"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================
            SUB-MODAL: SUBMISSION CONFIRMATION
            ============================================================ */}
        {showSubmitConfirm && currentReg && (
          <div className="absolute inset-0 z-30 bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl p-6 space-y-4 shadow-2xl">
              <div className="flex items-center space-x-3 text-cyan-400">
                <Shield className="w-6 h-6" />
                <h3 className="text-lg font-bold text-white">Confirm 5v5 Team Submission</h3>
              </div>

              <div className="space-y-2 text-sm text-slate-300">
                <p>
                  You are about to submit <strong>{currentReg.teamName}</strong> for tournament review:
                </p>
                <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700 space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Tournament:</span>
                    <span className="font-medium text-white">{tournament.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Squad Roster:</span>
                    <span className="font-medium text-emerald-400">5 / 5 Players Verified</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Status upon submit:</span>
                    <span className="font-medium text-cyan-300">PENDING_ADMIN_APPROVAL</span>
                  </div>
                </div>
                <p className="text-xs text-slate-400">
                  Once submitted, the roster is locked for review. An administrator will verify all contact details and approve official tournament entry.
                </p>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowSubmitConfirm(false)}
                  className="px-4 py-2 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 text-sm"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSubmitForReview}
                  disabled={loading}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-md transition-all flex items-center space-x-2"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{loading ? 'Submitting...' : 'Yes, Submit Team'}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================
            SUB-MODAL: CANCEL INVITATION CONFIRMATION
            ============================================================ */}
        {confirmCancelSlot && (
          <div className="absolute inset-0 z-40 bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
            <div
              id="cancel-slot-invitation-modal"
              className="w-full max-w-md bg-slate-900 border border-rose-500/50 rounded-2xl p-6 space-y-4 shadow-2xl animate-in fade-in"
            >
              <div className="flex items-center space-x-3 text-rose-400">
                <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-rose-400" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Cancel this player's invitation?</h3>
                  <p className="text-xs text-slate-400 font-mono">Slot #{confirmCancelSlot.slotNumber} • {confirmCancelSlot.playerName}</p>
                </div>
              </div>

              <p className="text-sm text-slate-300">
                Are you sure you want to cancel the invitation for <strong className="text-white">{confirmCancelSlot.playerName}</strong>? This will immediately free this roster slot so you can invite another player.
              </p>

              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => setConfirmCancelSlot(null)}
                  className="px-4 py-2 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 text-xs font-mono font-bold uppercase transition-colors"
                >
                  Keep Invitation
                </button>
                <button
                  id="confirm-cancel-slot-btn"
                  type="button"
                  disabled={loading}
                  onClick={() => handleCancelInvitation(confirmCancelSlot.slotNumber)}
                  className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-mono font-bold text-xs uppercase tracking-wider shadow-lg shadow-rose-900/30 transition-all flex items-center space-x-2"
                >
                  {loading ? (
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

        {/* ============================================================
            SUB-MODAL: REMOVE MEMBER CONFIRMATION
            ============================================================ */}
        {confirmRemoveSlot && (
          <div className="absolute inset-0 z-40 bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
            <div
              id="remove-slot-member-modal"
              className="w-full max-w-md bg-slate-900 border border-rose-500/50 rounded-2xl p-6 space-y-4 shadow-2xl animate-in fade-in"
            >
              <div className="flex items-center space-x-3 text-rose-400">
                <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center">
                  <Trash2 className="w-5 h-5 text-rose-400" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Remove player from roster?</h3>
                  <p className="text-xs text-slate-400 font-mono">Slot #{confirmRemoveSlot.slotNumber} • {confirmRemoveSlot.playerName}</p>
                </div>
              </div>

              <p className="text-sm text-slate-300">
                Are you sure you want to remove <strong className="text-white">{confirmRemoveSlot.playerName}</strong> from your squad roster? This will free this slot so you can invite a replacement.
              </p>

              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => setConfirmRemoveSlot(null)}
                  className="px-4 py-2 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 text-xs font-mono font-bold uppercase transition-colors"
                >
                  Keep Player
                </button>
                <button
                  id="confirm-remove-slot-btn"
                  type="button"
                  disabled={loading}
                  onClick={() => handleRemoveSlot(confirmRemoveSlot.slotNumber)}
                  className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-mono font-bold text-xs uppercase tracking-wider shadow-lg shadow-rose-900/30 transition-all flex items-center space-x-2"
                >
                  {loading ? (
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
      </div>
    </div>
  );
};
