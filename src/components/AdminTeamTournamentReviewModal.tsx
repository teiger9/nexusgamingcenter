import React, { useState, useEffect } from 'react';
import {
  X,
  Users,
  Crown,
  Shield,
  CheckCircle2,
  AlertCircle,
  Phone,
  Gamepad2,
  Award,
  Clock,
  Check,
  Ban,
  ArrowRight,
} from 'lucide-react';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
  Tournament,
  Player,
  TeamTournamentRegistration,
  TeamTournamentPlayerSlot,
} from '../types';
import {
  getTournamentGameConfig,
} from '../lib/tournamentGameConfig';
import {
  adminApproveTeamRegistration,
  adminRejectTeamRegistration,
} from '../services/tournamentService';
import {
  isPlayerInformationComplete,
  getPlayerMissingInformation,
  getPlayerSlotState,
} from '../utils/tournamentTeamStatus';
import { useAuth } from '../context/AuthContext';

interface AdminTeamTournamentReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  registration: TeamTournamentRegistration;
  tournament?: Tournament | null;
  adminUser: Player;
  onReviewed?: () => void;
}

export const AdminTeamTournamentReviewModal: React.FC<AdminTeamTournamentReviewModalProps> = ({
  isOpen,
  onClose,
  registration,
  tournament,
  adminUser,
  onReviewed,
}) => {
  const { isAdmin } = useAuth();
  const [currentReg, setCurrentReg] = useState<TeamTournamentRegistration>(registration);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [adminNotes, setAdminNotes] = useState('');

  // Confirmation state for Accept
  const [showConfirmAccept, setShowConfirmAccept] = useState(false);

  // Modal state for Reject
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('Incomplete or unverifiable contact information.');
  const [customRejectionReason, setCustomRejectionReason] = useState('');

  // Synchronize with Firebase in real time to avoid stale data
  useEffect(() => {
    setCurrentReg(registration);
    if (!isOpen || !registration?.id) return;

    const unsub = onSnapshot(
      doc(db, 'tournamentTeamRegistrations', registration.id),
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
  }, [isOpen, registration?.id]);

  if (!isOpen || !currentReg) return null;

  const gameConfig = getTournamentGameConfig(currentReg.gameId, currentReg.gameName);

  const confirmedTeamsCount = tournament?.participants.length || 0;
  const maxTeams = tournament?.maxParticipants || 16;
  const isFull = confirmedTeamsCount >= maxTeams;

  // Strict verification using the single source of truth
  const incompleteSlots = (currentReg.slots || []).filter(
    (s) => !isPlayerInformationComplete(s, s.isCaptain ? currentReg.captainPhone : undefined)
  );
  const isRosterFullyComplete = (currentReg.slots || []).length === 5 && incompleteSlots.length === 0;

  // Handle Accept
  const handleApproveTeam = async () => {
    setErrorMsg(null);
    setLoading(true);

    try {
      // Re-read latest registration directly from Firebase to guarantee server-grade verification
      const freshSnap = await getDoc(doc(db, 'tournamentTeamRegistrations', currentReg.id));
      if (!freshSnap.exists()) {
        setErrorMsg('Team registration document not found in database.');
        setShowConfirmAccept(false);
        setLoading(false);
        return;
      }

      const freshReg = freshSnap.data() as TeamTournamentRegistration;
      const freshIncomplete = (freshReg.slots || []).filter(
        (s) => !isPlayerInformationComplete(s, s.isCaptain ? freshReg.captainPhone : undefined)
      );

      if (freshReg.slots.length !== 5 || freshIncomplete.length > 0) {
        const details = freshIncomplete
          .map((s) => `Slot #${s.slotNumber} (${s.gamerTag || 'Player'})`)
          .join(', ');
        setErrorMsg(
          `Cannot approve team: ${freshIncomplete.length} player slot(s) have incomplete required information: ${details}. All 5 players must personally accept and complete their details.`
        );
        setShowConfirmAccept(false);
        setLoading(false);
        return;
      }

      const res = await adminApproveTeamRegistration({
        registrationId: freshReg.id,
        adminUser,
        adminNotes: adminNotes.trim() || undefined,
      });

      if (!res.success) {
        setErrorMsg(res.error || 'Failed to approve team registration.');
        setShowConfirmAccept(false);
      } else {
        setShowConfirmAccept(false);
        onReviewed?.();
        onClose();
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error occurred while confirming team.');
      setShowConfirmAccept(false);
    } finally {
      setLoading(false);
    }
  };

  // Handle Reject
  const handleRejectTeam = async () => {
    setErrorMsg(null);
    setLoading(true);

    const finalReason = rejectionReason === 'CUSTOM'
      ? customRejectionReason.trim() || 'Tournament registration requirements not met.'
      : rejectionReason;

    try {
      const res = await adminRejectTeamRegistration({
        registrationId: currentReg.id,
        adminUser,
        rejectionReason: finalReason,
        adminNotes: adminNotes.trim() || undefined,
      });

      if (!res.success) {
        setErrorMsg(res.error || 'Failed to reject team.');
      } else {
        setShowRejectDialog(false);
        onReviewed?.();
        onClose();
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error rejecting team registration.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div
        id="admin-team-review-modal"
        className="relative w-full max-w-4xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden my-8"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-400">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold uppercase px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  Admin Roster Verification
                </span>
                <span className="text-xs text-slate-400">
                  {registration.tournamentName}
                </span>
              </div>
              <h2 className="text-xl font-bold text-white mt-1">
                Review 5v5 Squad: {registration.teamName}
              </h2>
            </div>
          </div>
          <button
            id="close-admin-review-modal-btn"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div className="mx-6 mt-4 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start space-x-3 text-rose-300 text-sm">
            <AlertCircle className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">{errorMsg}</div>
            <button onClick={() => setErrorMsg(null)} className="text-rose-400 hover:text-rose-200">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Body */}
        <div className="p-6 max-h-[75vh] overflow-y-auto space-y-6">
          {/* Tournament Capacity Banner */}
          <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm">
            <div>
              <span className="text-xs font-semibold uppercase text-slate-400 block">
                Tournament Bracket Capacity
              </span>
              <span className="font-bold text-white text-base">
                {confirmedTeamsCount} / {maxTeams} Teams Confirmed
              </span>
            </div>

            <div className="flex items-center space-x-2">
              {isFull ? (
                <span className="px-3 py-1 rounded-lg bg-rose-500/20 text-rose-300 text-xs font-bold border border-rose-500/30">
                  Capacity Full
                </span>
              ) : (
                <span className="px-3 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 text-xs font-bold border border-emerald-500/30">
                  {maxTeams - confirmedTeamsCount} Team Slots Available
                </span>
              )}
              <span className="text-xs text-slate-400">
                (1 Team = 1 Tournament Entry)
              </span>
            </div>
          </div>

          {/* 5-Player Complete Roster Verification */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Official 5-Player Squad Roster & Contact Details
              </h3>
              <span
                className={`text-xs font-semibold flex items-center space-x-1 ${
                  isRosterFullyComplete ? 'text-emerald-400' : 'text-amber-400'
                }`}
              >
                {isRosterFullyComplete ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>5 / 5 Verified Player Slots</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>{5 - incompleteSlots.length} / 5 Completed</span>
                  </>
                )}
              </span>
            </div>

            {/* Incomplete Roster Warning Banner */}
            {!isRosterFullyComplete && (
              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start space-x-3 text-amber-300 text-xs">
                <AlertCircle className="w-5 h-5 shrink-0 text-amber-400 mt-0.5" />
                <div>
                  <p className="font-bold text-amber-200">Mandatory Information Incomplete</p>
                  <p className="text-amber-300/80 mt-0.5">
                    {incompleteSlots.length} player(s) in this squad have not completed their required contact phone number and player details. By tournament regulations, all 5 players must have completed their profile information before an admin can accept the registration.
                  </p>
                  <ul className="mt-1.5 list-disc list-inside space-y-0.5 text-amber-300">
                    {incompleteSlots.map((s) => (
                      <li key={s.slotNumber}>
                        Player #{s.slotNumber} ({s.gamerTag || 'Player'}): Missing {getPlayerMissingInformation(s, s.isCaptain ? currentReg.captainPhone : undefined).join(', ')}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            <div className="space-y-3">
              {currentReg.slots.map((slot) => {
                const slotState = getPlayerSlotState(
                  slot,
                  slot.isCaptain ? currentReg.captainPhone : undefined
                );
                const isSlotComplete = slotState === 'INFORMATION_COMPLETE';
                const isAcceptedIncomplete = slotState === 'ACCEPTED_INCOMPLETE';
                const isInvited = slotState === 'INVITATION_PENDING';
                const missingFields = isSlotComplete
                  ? []
                  : getPlayerMissingInformation(slot, slot.isCaptain ? currentReg.captainPhone : undefined);
                const presence = slot.presenceStatus || 'NOT_CONFIRMED';
                const contactPhone = slot.phoneNumber || (slot.isCaptain ? currentReg.captainPhone : '');

                return (
                  <div
                    key={slot.slotNumber}
                    className="p-4 rounded-xl bg-slate-800/80 border border-slate-700 flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div className="flex items-center space-x-3.5">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm ${
                          slot.isCaptain
                            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                            : 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                        }`}
                      >
                        {slot.isCaptain ? <Crown className="w-5 h-5" /> : `#${slot.slotNumber}`}
                      </div>

                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-base text-white">
                            {slot.fullName || slot.gamerTag}
                          </span>
                          <span className="text-xs text-slate-400">
                            (@{slot.gamerTag})
                          </span>
                          {slot.isCaptain && (
                            <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                              Team Captain
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-300 mt-1">
                          <div>
                            <span className="text-slate-500 mr-1">{gameConfig.inGameNameLabel}:</span>
                            <strong className="text-cyan-300 font-mono">{slot.inGameName || 'N/A'}</strong>
                          </div>
                          <div>
                            <span className="text-slate-500 mr-1">Rank / Rating:</span>
                            <strong className="text-amber-300">{slot.inGameRank || 'N/A'}</strong>
                          </div>
                          <div className="text-slate-500 font-mono text-[11px]">
                            UID: {slot.playerId?.slice(0, 10)}...
                          </div>
                        </div>

                        {!isSlotComplete && missingFields.length > 0 && (
                          <div className="text-[11px] text-amber-400 font-mono mt-1">
                            Missing: {missingFields.join(', ')}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Status & Phone Contact */}
                    <div className="flex flex-wrap items-center gap-2 self-end md:self-center">
                      {/* Information Status Badge */}
                      <span
                        className={`px-2 py-1 rounded-lg text-[10px] font-mono font-bold uppercase border ${
                          isSlotComplete
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                            : isAcceptedIncomplete
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/30 animate-pulse'
                            : isInvited
                            ? 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                            : 'bg-slate-700 text-slate-300 border-slate-600'
                        }`}
                      >
                        {isSlotComplete
                          ? '✓ Complete'
                          : isAcceptedIncomplete
                          ? '⚠️ Incomplete Info'
                          : isInvited
                          ? '⏳ Inv. Pending'
                          : 'Empty'}
                      </span>

                      {/* Presence Badge */}
                      <span
                        className={`px-2 py-1 rounded-lg text-[10px] font-mono font-bold uppercase border ${
                          presence === 'CONFIRMED'
                            ? 'bg-teal-500/20 text-teal-300 border-teal-500/30'
                            : presence === 'ABSENT'
                            ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                            : 'bg-slate-700 text-slate-300 border-slate-600'
                        }`}
                      >
                        {presence === 'CONFIRMED'
                          ? 'Present'
                          : presence === 'ABSENT'
                          ? 'Absent'
                          : 'Unconfirmed'}
                      </span>

                      {/* Phone Contact */}
                      <div className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 flex items-center space-x-2 text-xs">
                        <Phone className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-slate-400 font-medium">Contact:</span>
                        {contactPhone ? (
                          <a
                            href={`tel:${contactPhone}`}
                            className="text-white font-mono font-semibold hover:text-cyan-400 transition-colors"
                          >
                            {contactPhone}
                          </a>
                        ) : (
                          <span className="text-rose-400 font-mono">Missing</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Admin Verification Notes Input */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
              Admin Commission Internal Notes (Optional)
            </label>
            <input
              id="admin-review-notes-input"
              type="text"
              placeholder="e.g. Verified team contact details via Discord & checked ELO ratings."
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 text-sm"
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800 bg-slate-950/60">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 text-sm font-medium transition-colors"
          >
            Close
          </button>

          {isAdmin ? (
            <div className="flex items-center space-x-3">
              {/* Reject Button */}
              <button
                id="admin-reject-team-btn"
                type="button"
                onClick={() => setShowRejectDialog(true)}
                disabled={loading}
                className="px-4 py-2.5 rounded-xl border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 font-semibold text-sm transition-colors flex items-center space-x-2 cursor-pointer"
              >
                <Ban className="w-4 h-4" />
                <span>Reject Team</span>
              </button>

              {/* Accept Button */}
              <button
                id="admin-accept-team-btn"
                type="button"
                onClick={() => setShowConfirmAccept(true)}
                disabled={loading || isFull || !isRosterFullyComplete}
                title={
                  !isRosterFullyComplete
                    ? 'All 5 players must complete their required profile & phone details first'
                    : isFull
                    ? 'Tournament is full'
                    : 'Accept Team Registration'
                }
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold text-sm shadow-lg shadow-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center space-x-2 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>Accept Team Registration</span>
              </button>
            </div>
          ) : (
            <div className="text-xs text-slate-400 font-mono italic">
              Awaiting Administrator Official Approval
            </div>
          )}
        </div>

        {/* ============================================================
            CONFIRM ACCEPT MODAL
            ============================================================ */}
        {showConfirmAccept && (
          <div className="absolute inset-0 z-20 bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl p-6 space-y-4 shadow-2xl">
              <div className="flex items-center space-x-3 text-emerald-400">
                <CheckCircle2 className="w-7 h-7" />
                <h3 className="text-lg font-bold text-white">CONFIRM TEAM REGISTRATION?</h3>
              </div>

              <div className="space-y-3 text-sm text-slate-300">
                <p>
                  Are you sure you want to officially register this team for the tournament?
                </p>
                <div className="p-3.5 rounded-xl bg-slate-800/90 border border-slate-700 space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Tournament:</span>
                    <span className="font-semibold text-white">{registration.tournamentName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Team:</span>
                    <span className="font-semibold text-cyan-300">{registration.teamName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Players:</span>
                    <span className="font-semibold text-emerald-400">5 / 5 Complete Roster</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Capacity Impact:</span>
                    <span className="font-semibold text-amber-300">
                      Adds 1 Team ({confirmedTeamsCount + 1} / {maxTeams})
                    </span>
                  </div>
                </div>
                <p className="text-xs text-slate-400">
                  Upon confirmation, the team status will change to <strong>CONFIRMED</strong>, the squad will be entered as an official tournament participant, and all 5 players will be notified immediately.
                </p>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowConfirmAccept(false)}
                  className="px-4 py-2 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 text-sm"
                >
                  Cancel
                </button>
                <button
                  id="confirm-accept-team-btn"
                  type="button"
                  onClick={handleApproveTeam}
                  disabled={loading}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-md transition-all flex items-center space-x-2"
                >
                  <Check className="w-4 h-4" />
                  <span>{loading ? 'Confirming...' : 'Yes, Confirm Team'}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================
            REJECT DIALOG MODAL
            ============================================================ */}
        {showRejectDialog && (
          <div className="absolute inset-0 z-20 bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl p-6 space-y-4 shadow-2xl">
              <div className="flex items-center space-x-3 text-rose-400">
                <Ban className="w-6 h-6" />
                <h3 className="text-lg font-bold text-white">Reject Team Registration</h3>
              </div>

              <div className="space-y-3">
                <label className="block text-xs font-semibold text-slate-300">
                  Select Rejection Reason *
                </label>
                <select
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-rose-500"
                >
                  <option value="Incomplete or unverifiable contact information.">
                    Incomplete or unverifiable contact information
                  </option>
                  <option value="In-game account or rank verification failed.">
                    In-game account or rank verification failed
                  </option>
                  <option value="Player already registered on another competing team.">
                    Player already registered on another competing team
                  </option>
                  <option value="Tournament capacity reached before complete verification.">
                    Tournament capacity reached
                  </option>
                  <option value="CUSTOM">Custom reason...</option>
                </select>

                {rejectionReason === 'CUSTOM' && (
                  <textarea
                    rows={3}
                    placeholder="Enter specific explanation for the team captain..."
                    value={customRejectionReason}
                    onChange={(e) => setCustomRejectionReason(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-rose-500"
                  />
                )}
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowRejectDialog(false)}
                  className="px-4 py-2 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 text-sm"
                >
                  Cancel
                </button>
                <button
                  id="confirm-reject-team-btn"
                  type="button"
                  onClick={handleRejectTeam}
                  disabled={loading}
                  className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-sm shadow-md transition-all flex items-center space-x-2"
                >
                  <Ban className="w-4 h-4" />
                  <span>{loading ? 'Rejecting...' : 'Confirm Rejection'}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
