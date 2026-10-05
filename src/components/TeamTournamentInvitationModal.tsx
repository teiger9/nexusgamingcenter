import React, { useState, useEffect } from 'react';
import {
  Trophy,
  CheckCircle2,
  X,
  AlertCircle,
  Clock,
  User,
  Phone,
  Gamepad2,
  Loader2,
  Users,
  Award,
  AlertTriangle,
  XCircle,
  ArrowLeft,
  CheckSquare,
  Square,
  ShieldCheck,
} from 'lucide-react';
import { Player, TeamTournamentRegistration, Tournament, TeamTournamentPlayerSlot, TeamInvitation } from '../types';
import {
  getTournamentTeamInvitationDetails,
  playerAcceptInvitationPrompt,
  acceptTournamentTeamInvitation,
  declineTournamentTeamInvitation,
} from '../services/tournamentService';
import { getTournamentGameConfig, validatePhoneNumber } from '../lib/tournamentGameConfig';
import { getPlayerSlotState, isPlayerInformationComplete } from '../utils/tournamentTeamStatus';
import { InvitationCountdownBadge } from './InvitationCountdownBadge';
import { isInvitationExpired, INVITATION_EXPIRATION_MS } from '../utils/invitationExpiration';
import { useAuth } from '../context/AuthContext';

export interface TeamTournamentInvitationModalProps {
  isOpen: boolean;
  onClose: () => void;
  invitationId?: string;
  teamId?: string;
  tournamentId?: string;
  currentUser?: Player | null;
  onOpenTournament?: (tournamentId: string) => void;
  onInvitationHandled?: () => void;
  onInvitationAccepted?: () => void;
  onInvitationDeclined?: () => void;
}

type ModalStep = 'INVITATION' | 'COMPLETE_INFO' | 'SUCCESS';

export const TeamTournamentInvitationModal: React.FC<TeamTournamentInvitationModalProps> = ({
  isOpen,
  onClose,
  invitationId,
  teamId,
  tournamentId,
  currentUser,
  onOpenTournament,
  onInvitationHandled,
  onInvitationAccepted,
  onInvitationDeclined,
}) => {
  const { user, playerProfile } = useAuth();

  const activeUser: Player = currentUser || playerProfile || ({
    uid: user?.uid || '',
    gamerTag: playerProfile?.gamerTag || user?.displayName || 'Player',
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

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  const [invitation, setInvitation] = useState<TeamInvitation | null>(null);
  const [team, setTeam] = useState<TeamTournamentRegistration | null>(null);
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [slot, setSlot] = useState<TeamTournamentPlayerSlot | null>(null);
  const [isExpired, setIsExpired] = useState(false);

  // Workflow step
  const [step, setStep] = useState<ModalStep>('INVITATION');
  const [showDeclineConfirm, setShowDeclineConfirm] = useState(false);

  // Form fields
  const [fullName, setFullName] = useState(
    currentUser?.fullName ||
      currentUser?.gamerTag ||
      playerProfile?.fullName ||
      playerProfile?.gamerTag ||
      user?.displayName ||
      ''
  );
  const [phoneNumber, setPhoneNumber] = useState(
    currentUser?.phoneNumber || playerProfile?.phoneNumber || ''
  );
  const [inGameName, setInGameName] = useState('');
  const [inGameRank, setInGameRank] = useState('');
  const [customRankMode, setCustomRankMode] = useState(false);
  const [infoConfirmed, setInfoConfirmed] = useState(false);

  useEffect(() => {
    if (activeUser) {
      if (!fullName && (activeUser.fullName || activeUser.gamerTag)) {
        setFullName(activeUser.fullName || activeUser.gamerTag || '');
      }
      if (!phoneNumber && activeUser.phoneNumber) {
        setPhoneNumber(activeUser.phoneNumber || '');
      }
    }
  }, [activeUser.uid, activeUser.fullName, activeUser.phoneNumber, activeUser.gamerTag]);

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    setPhoneError(null);
    setShowDeclineConfirm(false);

    async function loadData() {
      try {
        const res = await getTournamentTeamInvitationDetails({
          invitationId,
          teamId,
          tournamentId,
          currentUserId: activeUser.uid,
          currentUserGamerTag: activeUser.gamerTag,
        });

        if (!isMounted) return;

        if (!res.success) {
          setErrorMsg(res.error || 'Failed to load invitation details.');
          setIsExpired(!!res.isExpired);
          setLoading(false);
          return;
        }

        setInvitation(res.invitation || null);
        setTeam(res.team || null);
        setTournament(res.tournament || null);
        setSlot(res.slot || null);

        if (res.invitation && isInvitationExpired(res.invitation)) {
          setIsExpired(true);
        }

        if (res.tournament) {
          const config = getTournamentGameConfig(res.tournament.gameId, res.tournament.gameName);
          if (res.slot?.inGameRank) {
            setInGameRank(res.slot.inGameRank);
          } else if (config.rankOptions.length > 0) {
            setInGameRank(config.rankOptions[0]);
          }
          if (res.slot?.inGameName) {
            setInGameName(res.slot.inGameName);
          }
          if (res.slot?.fullName) {
            setFullName(res.slot.fullName);
          }
          if (res.slot?.phoneNumber) {
            setPhoneNumber(res.slot.phoneNumber);
          }
        }

        // Determine step based on completion status
        if (res.isAlreadyCompleted) {
          setStep('SUCCESS');
        } else if (res.isAcceptedAwaitingInfo) {
          setStep('COMPLETE_INFO');
        } else {
          setStep('INVITATION');
        }
      } catch (err: any) {
        if (!isMounted) return;
        console.error('Error loading tournament team invitation:', err);
        setErrorMsg(err.message || 'An unexpected error occurred while loading the invitation.');
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, [isOpen, invitationId, teamId, tournamentId, activeUser.uid, activeUser.gamerTag]);

  if (!isOpen) return null;

  const gameConfig = tournament
    ? getTournamentGameConfig(tournament.gameId, tournament.gameName)
    : null;

  // Step 1: User clicks "ACCEPT INVITATION"
  const handleInitialAccept = async () => {
    if (!team) return;

    setSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await playerAcceptInvitationPrompt({
        invitationId: invitation?.id || invitationId,
        teamId: team.id,
        player: activeUser,
        slotNumber: slot?.slotNumber,
      });

      if (!res.success) {
        setErrorMsg(res.error || 'Failed to accept invitation.');
        setSubmitting(false);
        return;
      }

      // Transition immediately to Step 2: Complete Information
      setStep('COMPLETE_INFO');
    } catch (err: any) {
      console.error('Error accepting invitation prompt:', err);
      setErrorMsg(err.message || 'An error occurred.');
    } finally {
      setSubmitting(false);
    }
  };

  // Step 2: User clicks "SAVE AND JOIN TEAM" after filling required information
  const handleCompleteInformation = async () => {
    if (!team || !tournament) return;

    setErrorMsg(null);
    setPhoneError(null);

    if (!fullName.trim()) {
      setErrorMsg('Full Name is required.');
      return;
    }

    // Strict Phone Number Requirement
    if (!phoneNumber.trim()) {
      setPhoneError('Phone number is required to join the tournament team.');
      setErrorMsg('Phone number is required to join the tournament team.');
      return;
    }

    const phoneValidation = validatePhoneNumber(phoneNumber);
    if (!phoneValidation.valid) {
      setPhoneError(phoneValidation.error || 'Please enter a valid phone number (at least 8 digits).');
      setErrorMsg(phoneValidation.error || 'Please enter a valid phone number.');
      return;
    }

    if (!inGameName.trim()) {
      setErrorMsg(`Please enter your ${gameConfig?.inGameNameLabel || 'In-Game Name'}.`);
      return;
    }

    if (!inGameRank.trim()) {
      setErrorMsg(`Please select or enter your ${gameConfig?.inGameRankLabel || 'In-Game Rank'}.`);
      return;
    }

    if (!infoConfirmed) {
      setErrorMsg('Please confirm that your tournament information is correct.');
      return;
    }

    setSubmitting(true);

    try {
      const res = await acceptTournamentTeamInvitation({
        invitationId: invitation?.id || invitationId,
        teamId: team.id,
        tournamentId: tournament.id,
        player: activeUser,
        inGameName: inGameName.trim(),
        phoneNumber: phoneNumber.trim(),
        inGameRank: inGameRank.trim() || 'Unranked',
        fullName: fullName.trim(),
        slotNumber: slot?.slotNumber,
      });

      if (!res.success) {
        setErrorMsg(res.error || 'Failed to complete registration.');
        setSubmitting(false);
        return;
      }

      setSuccessMsg('You are officially registered as a completed team member!');
      setStep('SUCCESS');
      onInvitationHandled?.();
      onInvitationAccepted?.();
    } catch (err: any) {
      console.error('Error completing team registration:', err);
      setErrorMsg(err.message || 'An error occurred while saving.');
    } finally {
      setSubmitting(false);
    }
  };

  // Decline Invitation
  const handleDecline = async () => {
    if (!team) return;

    setSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await declineTournamentTeamInvitation({
        invitationId: invitation?.id || invitationId,
        teamId: team.id,
        player: activeUser,
      });

      if (!res.success) {
        setErrorMsg(res.error || 'Failed to decline invitation.');
        setSubmitting(false);
        return;
      }

      setSuccessMsg('Invitation declined.');
      onInvitationHandled?.();
      onInvitationDeclined?.();
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err: any) {
      console.error('Error declining invitation:', err);
      setErrorMsg(err.message || 'An error occurred while declining.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      id="tournament-invitation-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto"
    >
      <div
        id="tournament-invitation-modal"
        className="relative w-full max-w-2xl bg-[#0f111a] border border-cyan-500/30 rounded-2xl shadow-2xl shadow-cyan-950/40 text-slate-100 overflow-hidden my-8"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-[#151928]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-cyan-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <Trophy className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
                <span>5v5 TOURNAMENT</span>
                <span>•</span>
                <span className="text-amber-400">TEAM INVITATION</span>
              </div>
              <h3 className="text-lg font-bold font-display text-white tracking-wide">
                🏆 TEAM TOURNAMENT INVITATION
              </h3>
            </div>
          </div>
          <button
            id="close-invitation-modal-btn"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="p-12 flex flex-col items-center justify-center space-y-4">
            <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
            <p className="text-sm font-mono text-slate-400">Loading team invitation details...</p>
          </div>
        )}

        {/* Error / Not Found / Expired */}
        {!loading && errorMsg && !team && (
          <div className="p-8 space-y-6">
            <div className="p-4 rounded-xl bg-rose-950/30 border border-rose-500/40 flex items-start gap-3.5">
              <AlertCircle className="w-6 h-6 text-rose-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-rose-300 font-mono">Unable to Open Invitation</h4>
                <p className="text-xs text-rose-200/90 leading-relaxed font-sans">{errorMsg}</p>
              </div>
            </div>

            <div className="text-xs text-slate-400 font-sans space-y-2 bg-slate-900/50 p-4 rounded-xl border border-slate-800">
              <p className="font-semibold text-slate-300">Possible reasons:</p>
              <ul className="list-disc list-inside space-y-1 text-slate-400 pl-1">
                <li>The team captain may have cancelled or withdrawn the team registration.</li>
                <li>The tournament registration has closed or capacity was filled.</li>
                <li>The invitation was expired or belongs to another user account.</li>
              </ul>
            </div>

            <div className="flex justify-end">
              <button
                onClick={onClose}
                className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        )}

        {/* Main Body */}
        {!loading && team && tournament && (
          <div className="p-6 space-y-6 max-h-[82vh] overflow-y-auto">
            {/* Global Error/Success notification */}
            {errorMsg && (
              <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-500/40 flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
                <span className="text-xs text-rose-200 font-sans">{errorMsg}</span>
              </div>
            )}

            {successMsg && (
              <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-500/40 flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                <span className="text-xs text-emerald-200 font-bold">{successMsg}</span>
              </div>
            )}

            {/* ======================================================== */}
            {/* STEP 1: INVITATION SCREEN (Initial Review & Decision)     */}
            {/* ======================================================== */}
            {step === 'INVITATION' && !showDeclineConfirm && (
              <div className="space-y-6">
                {/* Tournament & Team Info Card */}
                <div className="rounded-2xl bg-gradient-to-br from-slate-900 via-[#131726] to-slate-900 border border-slate-800 p-5 space-y-4 shadow-inner">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                    <div className="flex items-center gap-2">
                      <Gamepad2 className="w-4 h-4 text-cyan-400" />
                      <span className="text-xs font-bold text-white font-mono uppercase">{tournament.gameName}</span>
                      <span className="text-slate-600">•</span>
                      <span className="text-xs text-cyan-300 font-mono font-bold">{tournament.title}</span>
                    </div>
                    <InvitationCountdownBadge
                      expiresAt={invitation?.expiresAt}
                      createdAt={invitation?.createdAt}
                      onExpired={() => setIsExpired(true)}
                      size="sm"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <span className="text-[10px] font-mono uppercase text-slate-400">Team</span>
                      <div className="text-base font-bold text-white flex items-center gap-2">
                        <span>{team.teamName}</span>
                        {team.teamTag && (
                          <span className="px-1.5 py-0.5 rounded bg-slate-800 text-xs font-mono text-cyan-400 border border-slate-700">
                            [{team.teamTag}]
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="space-y-1">
                      <span className="text-[10px] font-mono uppercase text-slate-400">Captain</span>
                      <div className="text-base font-bold text-slate-200 flex items-center gap-1.5">
                        <User className="w-4 h-4 text-cyan-400" />
                        <span>{team.captainGamerTag}</span>
                        {team.captainFullName && (
                          <span className="text-xs text-slate-400 font-normal">({team.captainFullName})</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 5-Player Team Roster Overview */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-slate-300 flex items-center gap-1.5 font-bold">
                      <Users className="w-4 h-4 text-cyan-400" />
                      <span>Team Roster (5 Players)</span>
                    </span>
                    <span className="text-cyan-400 font-bold">
                      {team.slots.filter((s) => isPlayerInformationComplete(s, s.isCaptain ? team.captainPhone : undefined)).length} / 5 Complete
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5">
                    {team.slots.map((s) => {
                      const isUserSlot =
                        (slot && slot.slotNumber === s.slotNumber) ||
                        (activeUser.uid && (s.playerId === activeUser.uid || s.invitedPlayerId === activeUser.uid)) ||
                        (s.invitedGamerTag &&
                          activeUser.gamerTag &&
                          s.invitedGamerTag.toLowerCase() === activeUser.gamerTag.toLowerCase());

                      const slotState = getPlayerSlotState(s, s.isCaptain ? team.captainPhone : undefined);
                      const isComplete = slotState === 'INFORMATION_COMPLETE';
                      const isAcceptedIncomplete = slotState === 'ACCEPTED_INCOMPLETE';
                      const isInvited = slotState === 'INVITATION_PENDING';

                      let badgeText = 'Open Slot';
                      let badgeColor = 'bg-slate-900/60 border-slate-800 text-slate-400';

                      if (isComplete) {
                        badgeText = '✓ Complete';
                        badgeColor = 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300';
                      } else if (isAcceptedIncomplete) {
                        badgeText = '⏳ Info Required';
                        badgeColor = 'bg-amber-950/30 border-amber-500/40 text-amber-300';
                      } else if (isInvited) {
                        badgeText = '⏳ Inv. Pending';
                        badgeColor = 'bg-blue-950/30 border-blue-500/40 text-blue-300';
                      }

                      if (isUserSlot && !isComplete) {
                        badgeColor = 'bg-cyan-950/40 border-cyan-500 text-cyan-200 ring-1 ring-cyan-500/50';
                      }

                      return (
                        <div
                          key={s.slotNumber}
                          className={`p-3 rounded-xl border flex flex-col items-center justify-center text-center transition-all ${badgeColor}`}
                        >
                          <div className="text-[10px] font-mono uppercase text-slate-400">
                            {s.isCaptain ? 'Captain' : `Player ${s.slotNumber}`}
                          </div>
                          <div className="text-xs font-bold truncate max-w-full font-sans mt-1">
                            {s.isCaptain
                              ? team.captainGamerTag
                              : isComplete
                              ? s.gamerTag || 'Player'
                              : isUserSlot
                              ? 'YOU'
                              : s.invitedGamerTag || 'Open'}
                          </div>
                          <div className="text-[10px] font-mono mt-1 font-semibold">
                            {badgeText}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Important Notice */}
                <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 text-xs text-slate-300 space-y-1">
                  <p className="font-semibold text-white flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-cyan-400" />
                    <span>Tournament Registration Requirement</span>
                  </p>
                  <p className="text-slate-400 leading-relaxed">
                    Accepting this invitation requires providing your Full Name, verified Phone Number, In-Game Name, and Rank.
                    You will only be counted as a registered team member after completing and confirming your information.
                  </p>
                </div>

                {/* Expiration Notice if Expired */}
                {isExpired && (
                  <div className="p-4 rounded-xl bg-rose-950/30 border border-rose-500/40 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      <h4 className="text-xs font-bold text-rose-300 font-mono">INVITATION EXPIRED</h4>
                      <p className="text-xs text-rose-200/90 font-sans">
                        This tournament team invitation has expired after 15 minutes. The accept action is now disabled. Please contact your team captain to resend an invitation.
                      </p>
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-3 pt-2">
                  <button
                    id="decline-invitation-btn"
                    type="button"
                    onClick={() => setShowDeclineConfirm(true)}
                    disabled={submitting || isExpired}
                    className="w-full sm:w-auto px-5 py-3 rounded-xl border border-rose-500/40 bg-rose-950/20 hover:bg-rose-950/40 text-rose-300 text-xs font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <XCircle className="w-4 h-4" />
                    <span>✕ DECLINE INVITATION</span>
                  </button>

                  <button
                    id="accept-invitation-btn"
                    type="button"
                    onClick={handleInitialAccept}
                    disabled={submitting || isExpired}
                    className={`w-full sm:w-auto px-8 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-lg ${
                      isExpired
                        ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                        : 'bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 shadow-emerald-500/20'
                    }`}
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Processing...</span>
                      </>
                    ) : isExpired ? (
                      <>
                        <AlertCircle className="w-4 h-4" />
                        <span>INVITATION EXPIRED</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>✓ ACCEPT INVITATION</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* ======================================================== */}
            {/* STEP 2: COMPLETE TOURNAMENT INFORMATION (Mandatory Info) */}
            {/* ======================================================== */}
            {step === 'COMPLETE_INFO' && !showDeclineConfirm && (
              <div className="space-y-5">
                {/* Header Banner */}
                <div className="p-4 rounded-xl bg-cyan-950/30 border border-cyan-500/30 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <h4 className="text-xs font-bold uppercase tracking-wider font-mono text-cyan-300">
                      COMPLETE YOUR TOURNAMENT INFORMATION
                    </h4>
                    <p className="text-xs text-cyan-100/90 leading-relaxed">
                      You have accepted the invite! Please provide all required details below. You will NOT be counted as a complete team member until this information is saved and confirmed.
                    </p>
                  </div>
                </div>

                {/* Information Form */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* FULL NAME */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-mono text-slate-300 flex items-center gap-1.5 font-semibold">
                      <User className="w-3.5 h-3.5 text-cyan-400" />
                      <span>FULL NAME *</span>
                    </label>
                    <input
                      id="player-fullname-input"
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="e.g. John Doe"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/80 border border-slate-700 text-sm text-white focus:outline-none focus:border-cyan-500 transition-colors"
                    />
                  </div>

                  {/* PHONE NUMBER (MANDATORY) */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-mono text-slate-300 flex items-center justify-between font-semibold">
                      <span className="flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-cyan-400" />
                        <span>PHONE NUMBER *</span>
                      </span>
                      <span className="text-[10px] text-amber-400 font-normal">Mandatory & Private</span>
                    </label>
                    <input
                      id="player-phone-input"
                      type="tel"
                      value={phoneNumber}
                      onChange={(e) => {
                        setPhoneNumber(e.target.value);
                        setPhoneError(null);
                      }}
                      placeholder="e.g. 0555123456"
                      className={`w-full px-3.5 py-2.5 rounded-xl bg-slate-900/80 border text-sm text-white focus:outline-none transition-colors ${
                        phoneError ? 'border-rose-500 focus:border-rose-500' : 'border-slate-700 focus:border-cyan-500'
                      }`}
                    />
                    {phoneError && (
                      <p className="text-[11px] text-rose-400 font-sans mt-1">{phoneError}</p>
                    )}
                  </div>

                  {/* IN-GAME NAME */}
                  <div className="space-y-1.5 sm:col-span-2">
                    <label className="text-xs font-mono text-slate-300 flex items-center gap-1.5 font-semibold">
                      <Gamepad2 className="w-3.5 h-3.5 text-cyan-400" />
                      <span>{gameConfig?.inGameNameLabel ? gameConfig.inGameNameLabel.toUpperCase() : 'IN-GAME NAME / USERNAME'} *</span>
                    </label>
                    <input
                      id="player-ign-input"
                      type="text"
                      value={inGameName}
                      onChange={(e) => setInGameName(e.target.value)}
                      placeholder={gameConfig?.inGameNamePlaceholder || 'e.g. NexusPlayer#1234'}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/80 border border-slate-700 text-sm text-white focus:outline-none focus:border-cyan-500 transition-colors"
                    />
                  </div>

                  {/* IN-GAME RANK */}
                  <div className="space-y-1.5 sm:col-span-2">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-slate-300 flex items-center gap-1.5 font-semibold">
                        <Award className="w-3.5 h-3.5 text-amber-400" />
                        <span>{gameConfig?.inGameRankLabel ? gameConfig.inGameRankLabel.toUpperCase() : 'IN-GAME RANK'} *</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setCustomRankMode(!customRankMode)}
                        className="text-[11px] text-cyan-400 hover:underline"
                      >
                        {customRankMode ? 'Select from list' : 'Type custom rank'}
                      </button>
                    </div>

                    {customRankMode || !gameConfig || gameConfig.rankOptions.length === 0 ? (
                      <input
                        id="player-rank-input"
                        type="text"
                        value={inGameRank}
                        onChange={(e) => setInGameRank(e.target.value)}
                        placeholder="e.g. Global Elite, Diamond 2, Faceit 8"
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/80 border border-slate-700 text-sm text-white focus:outline-none focus:border-cyan-500 transition-colors"
                      />
                    ) : (
                      <select
                        id="player-rank-select"
                        value={inGameRank}
                        onChange={(e) => setInGameRank(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white focus:outline-none focus:border-cyan-500 transition-colors"
                      >
                        {gameConfig.rankOptions.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>

                {/* Mandatory Confirmation Checkbox */}
                <div
                  id="confirm-info-checkbox-container"
                  onClick={() => setInfoConfirmed(!infoConfirmed)}
                  className={`p-4 rounded-xl border transition-all cursor-pointer flex items-center gap-3.5 ${
                    infoConfirmed
                      ? 'bg-cyan-950/20 border-cyan-500/40 text-cyan-200'
                      : 'bg-slate-900/50 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <button
                    type="button"
                    aria-label="Confirm tournament information is correct"
                    className="shrink-0 text-cyan-400"
                  >
                    {infoConfirmed ? (
                      <CheckSquare className="w-5 h-5 text-cyan-400" />
                    ) : (
                      <Square className="w-5 h-5 text-slate-500" />
                    )}
                  </button>
                  <label htmlFor="confirm-info-checkbox" className="text-xs font-semibold cursor-pointer select-none">
                    I confirm that my tournament information is correct.
                  </label>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setStep('INVITATION')}
                    disabled={submitting}
                    className="px-4 py-2.5 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-semibold transition-colors flex items-center gap-1.5"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Back to Invitation</span>
                  </button>

                  <button
                    id="save-and-join-team-btn"
                    type="button"
                    onClick={handleCompleteInformation}
                    disabled={submitting || !infoConfirmed || !phoneNumber.trim() || !inGameName.trim()}
                    className="w-full sm:w-auto px-8 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:opacity-50 text-slate-950 font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-cyan-500/20"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Saving Information...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>SAVE AND JOIN TEAM</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* ======================================================== */}
            {/* STEP 3: SUCCESS / COMPLETED REGISTRATION SCREEN           */}
            {/* ======================================================== */}
            {step === 'SUCCESS' && !showDeclineConfirm && (
              <div className="p-8 rounded-2xl bg-emerald-950/20 border border-emerald-500/30 text-center space-y-5">
                <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 mx-auto shadow-lg shadow-emerald-500/10">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <div className="space-y-1.5">
                  <span className="px-3 py-1 rounded-full text-[11px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    ✓ INFORMATION COMPLETE
                  </span>
                  <h4 className="text-lg font-bold text-white font-display pt-1">
                    You are Officially on the Team Roster!
                  </h4>
                  <p className="text-xs text-slate-300 max-w-md mx-auto leading-relaxed">
                    Your player registration for <span className="text-cyan-400 font-bold">{team.teamName}</span> in{' '}
                    <span className="text-amber-400 font-bold">{tournament.title}</span> is complete. When all 5 players are complete, the captain will submit the team for Admin approval.
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-3 pt-3">
                  {onOpenTournament && (
                    <button
                      id="view-tournament-lobby-btn"
                      onClick={() => {
                        onOpenTournament(tournament.id);
                        onClose();
                      }}
                      className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-xs flex items-center gap-2 transition-all shadow-lg shadow-cyan-500/20"
                    >
                      <Trophy className="w-4 h-4" />
                      <span>View Tournament Lobby</span>
                    </button>
                  )}
                  <button
                    id="close-success-modal-btn"
                    onClick={onClose}
                    className="px-6 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}

            {/* Decline Confirmation Prompt */}
            {showDeclineConfirm && (
              <div className="p-6 rounded-2xl bg-rose-950/20 border border-rose-500/30 space-y-4 text-center">
                <AlertTriangle className="w-8 h-8 text-rose-400 mx-auto" />
                <div>
                  <h4 className="text-sm font-bold text-white">Decline Team Invitation?</h4>
                  <p className="text-xs text-slate-300 mt-1 max-w-md mx-auto">
                    Are you sure you want to decline this invitation to join{' '}
                    <span className="text-white font-bold">{team.teamName}</span>? Your slot will be reopened
                    so the captain can invite another teammate.
                  </p>
                </div>
                <div className="flex items-center justify-center gap-3 pt-2">
                  <button
                    onClick={() => setShowDeclineConfirm(false)}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    id="confirm-decline-invitation-btn"
                    onClick={handleDecline}
                    disabled={submitting}
                    className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center gap-1.5 transition-colors"
                  >
                    {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                    <span>Confirm Decline</span>
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
