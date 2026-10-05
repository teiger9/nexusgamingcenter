import React, { useState, useEffect } from 'react';
import {
  Tournament,
  TournamentMatch,
  TournamentParticipant,
  TournamentActivityLog,
  TournamentPrizeBreakdown,
  TournamentStatus,
  Player,
  TeamTournamentRegistration,
} from '../types';
import {
  subscribeToTournamentById,
  subscribeToTournamentActivityLogs,
  subscribeToTeamRegistrationsForTournament,
  adminUpdateTournamentPrizes,
  adminAddTeamToTournament,
  adminRemoveTeamFromTournament,
  adminUpdateTeamDetails,
  adminAddIndividualPlayer,
  adminRemoveIndividualPlayer,
  adminEditIndividualPlayer,
  adminUpdateParticipantStatus,
  adminRegenerateBracket,
  adminCancelTournament,
  adminRescheduleMatch,
  updateTournamentMatchResult,
  completeTournamentAndAnnounceWinner,
  adminEditPlayerInTeam,
  adminRemovePlayerFromTeam,
  adminAddPlayerToTeam,
  adminUpdatePlayerPresence,
  adminUpdatePlayerFullDetails,
} from '../services/tournamentService';
import { AdminEditTournamentModal } from './AdminEditTournamentModal';
import { InteractiveTournamentBracketMap } from './InteractiveTournamentBracketMap';
import { useAuth } from '../context/AuthContext';
import { useToast } from './Toast';
import {
  Trophy,
  Crown,
  Edit2,
  Calendar,
  Users,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  MapPin,
  Shield,
  Gamepad2,
  Search,
  Plus,
  Trash2,
  UserCheck,
  UserX,
  History,
  Layers,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Phone,
  Check,
  X,
  Send,
  Sparkles,
  Info,
} from 'lucide-react';

interface AdminTournamentDashboardProps {
  tournamentId: string;
  onBack: () => void;
}

type DashboardTab = 'OVERVIEW' | 'PRIZES' | 'PARTICIPANTS' | 'BRACKET' | 'AUDIT';

export const AdminTournamentDashboard: React.FC<AdminTournamentDashboardProps> = ({
  tournamentId,
  onBack,
}) => {
  const { user, playerProfile, isAdmin } = useAuth();
  const { showToast } = useToast();

  const adminId = user?.uid || 'admin';
  const adminName = playerProfile?.gamerTag || 'Nexus Admin';

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<DashboardTab>('OVERVIEW');
  const [activityLogs, setActivityLogs] = useState<TournamentActivityLog[]>([]);

  // Modals & Sub-forms
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAddTeamModal, setShowAddTeamModal] = useState(false);
  const [showAddPlayerModal, setShowAddPlayerModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showRegenerateWarningModal, setShowRegenerateWarningModal] = useState(false);
  const [editingMatch, setEditingMatch] = useState<TournamentMatch | null>(null);
  const [reschedulingMatch, setReschedulingMatch] = useState<TournamentMatch | null>(null);
  const [showWinnerModal, setShowWinnerModal] = useState(false);

  // Prizes Form State
  const [totalPrizePool, setTotalPrizePool] = useState('');
  const [firstPlacePrize, setFirstPlacePrize] = useState('');
  const [secondPlacePrize, setSecondPlacePrize] = useState('');
  const [thirdPlacePrize, setThirdPlacePrize] = useState('');
  const [additionalPrizeNotes, setAdditionalPrizeNotes] = useState('');
  const [savingPrizes, setSavingPrizes] = useState(false);

  // Add 5v5 Team Form State
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamTag, setNewTeamTag] = useState('');
  const [captainGamerTag, setCaptainGamerTag] = useState('');
  const [captainFullName, setCaptainFullName] = useState('');
  const [captainPhone, setCaptainPhone] = useState('');
  const [captainInGameName, setCaptainInGameName] = useState('');
  const [member2Tag, setMember2Tag] = useState('');
  const [member3Tag, setMember3Tag] = useState('');
  const [member4Tag, setMember4Tag] = useState('');
  const [member5Tag, setMember5Tag] = useState('');
  const [teamRegistrationStatus, setTeamRegistrationStatus] = useState<'CONFIRMED' | 'PENDING'>('CONFIRMED');
  const [addingTeam, setAddingTeam] = useState(false);

  // Add 1v1 Player Form State
  const [newPlayerGamerTag, setNewPlayerGamerTag] = useState('');
  const [newPlayerFullName, setNewPlayerFullName] = useState('');
  const [newPlayerPhone, setNewPlayerPhone] = useState('');
  const [newPlayerRating, setNewPlayerRating] = useState(1200);
  const [newPlayerStatus, setNewPlayerStatus] = useState<'CONFIRMED' | 'PENDING'>('CONFIRMED');
  const [addingPlayer, setAddingPlayer] = useState(false);

  // Editing Team or Player Modal
  const [editingParticipant, setEditingParticipant] = useState<TournamentParticipant | null>(null);
  const [editPartName, setEditPartName] = useState('');
  const [editPartTag, setEditPartTag] = useState('');
  const [editPartCaptainName, setEditPartCaptainName] = useState('');
  const [editPartPhone, setEditPartPhone] = useState('');
  const [savingParticipant, setSavingParticipant] = useState(false);

  // Expanded Team Members Accordion
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);

  // Edit Player Details & Presence inside Team Roster or Solo Participant
  const [editingPlayerDetails, setEditingPlayerDetails] = useState<{
    teamId?: string;
    teamName?: string;
    playerId: string;
    gamerTag: string;
    fullName: string;
    phoneNumber: string;
    inGameName: string;
    inGameRank: string;
    presenceStatus: 'NOT_CONFIRMED' | 'CONFIRMED' | 'ABSENT';
  } | null>(null);
  const [savingPlayerDetails, setSavingPlayerDetails] = useState(false);

  // Match Editing State
  const [matchScoreA, setMatchScoreA] = useState(0);
  const [matchScoreB, setMatchScoreB] = useState(0);
  const [matchWinnerId, setMatchWinnerId] = useState('');
  const [matchStation, setMatchStation] = useState('');
  const [matchScheduledTime, setMatchScheduledTime] = useState('');
  const [savingMatch, setSavingMatch] = useState(false);

  // Cancel Tournament State
  const [cancellationReason, setCancellationReason] = useState('');
  const [cancellingTournament, setCancellingTournament] = useState(false);

  // Announce Winner State
  const [winnerParticipantId, setWinnerParticipantId] = useState('');
  const [runnerUpParticipantId, setRunnerUpParticipantId] = useState('');
  const [thirdPlaceParticipantId, setThirdPlaceParticipantId] = useState('');
  const [announcingNotes, setAnnouncingNotes] = useState('Certified by Nexus Staff');
  const [announcingWinner, setAnnouncingWinner] = useState(false);

  // Audit Search
  const [auditSearch, setAuditSearch] = useState('');
  const [auditFilterAction, setAuditFilterAction] = useState('ALL');
  const [teamRegistrations, setTeamRegistrations] = useState<TeamTournamentRegistration[]>([]);

  // Real-time subscriptions
  useEffect(() => {
    const unsubTournament = subscribeToTournamentById(tournamentId, (data) => {
      setTournament(data);
      setLoading(false);
      if (data) {
        setTotalPrizePool(data.prizePool || '');
        setFirstPlacePrize(data.prizes?.firstPlace || '');
        setSecondPlacePrize(data.prizes?.secondPlace || '');
        setThirdPlacePrize(data.prizes?.thirdPlace || '');
        setAdditionalPrizeNotes(data.prizes?.notes || '');
      }
    });

    const unsubAudit = subscribeToTournamentActivityLogs(tournamentId, (logs) => {
      setActivityLogs(logs);
    });

    const unsubRegistrations = subscribeToTeamRegistrationsForTournament(tournamentId, (regs) => {
      setTeamRegistrations(regs);
    });

    return () => {
      unsubTournament();
      unsubAudit();
      unsubRegistrations();
    };
  }, [tournamentId]);

  if (loading) {
    return (
      <div className="py-24 text-center space-y-3">
        <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin mx-auto" />
        <p className="text-slate-400 font-mono text-xs">Loading Tournament Management Console...</p>
      </div>
    );
  }

  if (!tournament) {
    return (
      <div className="p-8 rounded-3xl bg-[#0c0e18] border border-slate-800 text-center space-y-4">
        <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto" />
        <h3 className="text-lg font-bold text-white font-display">Tournament Not Found</h3>
        <p className="text-xs text-slate-400 font-mono">The tournament could not be loaded or was removed.</p>
        <button
          onClick={onBack}
          className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-mono font-bold"
        >
          ← Back to Tournaments List
        </button>
      </div>
    );
  }

  const hasBracket = tournament.matches && tournament.matches.length > 0;
  const isLive = tournament.status === 'LIVE';
  const participants = tournament.participants || [];
  const confirmedCount = participants.filter((p) => p.status === 'CONFIRMED' || !p.status).length;
  const is5v5Team = tournament.type === 'TEAM';

  // Handle Save Prizes
  const handleSavePrizes = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPrizes(true);
    try {
      const res = await adminUpdateTournamentPrizes({
        tournamentId: tournament.id,
        prizePool: totalPrizePool.trim(),
        prizes: {
          firstPlace: firstPlacePrize.trim(),
          secondPlace: secondPlacePrize.trim(),
          thirdPlace: thirdPlacePrize.trim(),
          notes: additionalPrizeNotes.trim() || undefined,
        },
        adminId,
        adminName,
      });

      if (!res.success) throw new Error(res.error);
      showToast('success', 'Prizes Updated', 'Tournament prize breakdown saved.');
    } catch (err: any) {
      showToast('error', 'Prize Error', err.message || 'Failed to update prizes.');
    } finally {
      setSavingPrizes(false);
    }
  };

  // Handle Add 5v5 Team Manually
  const handleAddTeamSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeamName.trim() || !captainGamerTag.trim()) {
      showToast('error', 'Validation Error', 'Team Name and Captain GamerTag are required.');
      return;
    }

    if ((tournament.participants || []).length >= tournament.maxParticipants) {
      showToast('error', 'Limit Reached', `Tournament capacity (${tournament.maxParticipants}) is full.`);
      return;
    }

    setAddingTeam(true);
    try {
      const members: Array<{ gamerTag: string; role: 'member' | 'starter' | 'substitute' }> = [
        { gamerTag: member2Tag.trim() || `${newTeamName.trim()}_P2`, role: 'starter' },
        { gamerTag: member3Tag.trim() || `${newTeamName.trim()}_P3`, role: 'starter' },
        { gamerTag: member4Tag.trim() || `${newTeamName.trim()}_P4`, role: 'starter' },
        { gamerTag: member5Tag.trim() || `${newTeamName.trim()}_P5`, role: 'starter' },
      ];

      const res = await adminAddTeamToTournament({
        tournamentId: tournament.id,
        teamName: newTeamName.trim(),
        teamTag: newTeamTag.trim() || undefined,
        captain: {
          gamerTag: captainGamerTag.trim(),
          fullName: captainFullName.trim() || captainGamerTag.trim(),
          phoneNumber: captainPhone.trim() || '0550000000',
          inGameName: captainInGameName.trim() || captainGamerTag.trim(),
        },
        members,
        status: teamRegistrationStatus,
        adminId,
        adminName,
      });

      if (!res.success) throw new Error(res.error);

      showToast('success', 'Team Added', `Team "${newTeamName}" registered as ${teamRegistrationStatus}.`);
      setShowAddTeamModal(false);
      // Reset
      setNewTeamName('');
      setNewTeamTag('');
      setCaptainGamerTag('');
      setCaptainFullName('');
      setCaptainPhone('');
      setCaptainInGameName('');
      setMember2Tag('');
      setMember3Tag('');
      setMember4Tag('');
      setMember5Tag('');
    } catch (err: any) {
      showToast('error', 'Add Team Failed', err.message || 'Failed to add team.');
    } finally {
      setAddingTeam(false);
    }
  };

  // Handle Add 1v1 Player Manually
  const handleAddPlayerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlayerGamerTag.trim()) {
      showToast('error', 'Validation Error', 'Player GamerTag is required.');
      return;
    }

    setAddingPlayer(true);
    try {
      const res = await adminAddIndividualPlayer({
        tournamentId: tournament.id,
        playerData: {
          gamerTag: newPlayerGamerTag.trim(),
          fullName: newPlayerFullName.trim() || undefined,
          phoneNumber: newPlayerPhone.trim() || undefined,
          inGameRank: 'Competitor',
        },
        status: newPlayerStatus,
        adminId,
        adminName,
      });

      if (!res.success) throw new Error(res.error);

      showToast('success', 'Player Added', `Player "${newPlayerGamerTag}" registered.`);
      setShowAddPlayerModal(false);
      setNewPlayerGamerTag('');
      setNewPlayerFullName('');
      setNewPlayerPhone('');
    } catch (err: any) {
      showToast('error', 'Add Player Failed', err.message || 'Failed to add player.');
    } finally {
      setAddingPlayer(false);
    }
  };

  // Handle Participant Status Change (e.g. Confirmed, Disqualified, Withdrawn)
  const handleStatusChange = async (
    participantId: string,
    newStatus: 'CONFIRMED' | 'PENDING' | 'WITHDRAWN' | 'DISQUALIFIED'
  ) => {
    const p = participants.find((x) => x.id === participantId);
    if (!p) return;

    if (newStatus === 'DISQUALIFIED' || newStatus === 'WITHDRAWN') {
      const confirmAction = confirm(
        `Are you sure you want to mark ${p.name} as ${newStatus}?\n\nIf the tournament has a bracket, this will safely forfeit their remaining active matches and preserve previous match history.`
      );
      if (!confirmAction) return;
    }

    try {
      const res = await adminUpdateParticipantStatus({
        tournamentId: tournament.id,
        participantId,
        newStatus,
        adminId,
        adminName,
      });

      if (!res.success) throw new Error(res.error);
      showToast('success', 'Status Updated', `${p.name} status updated to ${newStatus}.`);
    } catch (err: any) {
      showToast('error', 'Status Update Error', err.message);
    }
  };

  // Handle Remove Participant
  const handleRemoveParticipant = async (p: TournamentParticipant) => {
    if (isLive || hasBracket) {
      const choice = confirm(
        `⚠️ IMPORTANT SAFETY CHECK:\nThis tournament has active matches or a bracket.\n\nDeleting a participant directly is blocked to prevent breaking brackets. Would you like to mark them as WITHDRAWN / DISQUALIFIED instead?`
      );
      if (choice) {
        handleStatusChange(p.id, 'WITHDRAWN');
      }
      return;
    }

    if (!confirm(`Are you sure you want to completely remove "${p.name}" from the tournament roster?`)) {
      return;
    }

    try {
      let res;
      if (p.type === 'TEAM') {
        res = await adminRemoveTeamFromTournament({
          tournamentId: tournament.id,
          teamId: p.id,
          action: 'REMOVE',
          adminId,
          adminName,
        });
      } else {
        res = await adminRemoveIndividualPlayer({
          tournamentId: tournament.id,
          playerId: p.id,
          action: 'REMOVE',
          adminId,
          adminName,
        });
      }

      if (!res.success) throw new Error(res.error);
      showToast('success', 'Removed', `Removed "${p.name}" from tournament.`);
    } catch (err: any) {
      showToast('error', 'Removal Failed', err.message);
    }
  };

  // Handle Edit Participant Info
  const handleOpenEditParticipant = (p: TournamentParticipant) => {
    setEditingParticipant(p);
    setEditPartName(p.name);
    setEditPartTag(p.teamTag || '');
    setEditPartCaptainName(p.captainName || '');
    setEditPartPhone(p.captainPhone || p.phoneNumber || '');
  };

  const handleSaveParticipantEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingParticipant) return;

    setSavingParticipant(true);
    try {
      if (editingParticipant.type === 'TEAM') {
        const res = await adminUpdateTeamDetails({
          tournamentId: tournament.id,
          teamId: editingParticipant.id,
          teamName: editPartName.trim(),
          teamTag: editPartTag.trim() || undefined,
          captainName: editPartCaptainName.trim() || undefined,
          captainPhone: editPartPhone.trim() || undefined,
          adminId,
          adminName,
        });
        if (!res.success) throw new Error(res.error);
      } else {
        const res = await adminEditIndividualPlayer({
          tournamentId: tournament.id,
          playerId: editingParticipant.id,
          updates: {
            name: editPartName.trim(),
            fullName: editPartCaptainName.trim() || undefined,
            phoneNumber: editPartPhone.trim() || undefined,
          },
          adminId,
          adminName,
        });
        if (!res.success) throw new Error(res.error);
      }

      showToast('success', 'Participant Updated', `Saved details for "${editPartName}".`);
      setEditingParticipant(null);
    } catch (err: any) {
      showToast('error', 'Edit Failed', err.message);
    } finally {
      setSavingParticipant(false);
    }
  };

  // Admin Quick Update Player Presence (Solo or Team Member)
  const handleAdminUpdatePresence = async (
    playerId: string,
    status: 'NOT_CONFIRMED' | 'CONFIRMED' | 'ABSENT',
    teamId?: string
  ) => {
    try {
      const res = await adminUpdatePlayerPresence({
        tournamentId,
        teamId,
        playerId,
        presenceStatus: status,
        adminId,
        adminName,
      });

      if (!res.success) {
        showToast('error', 'Presence Error', res.error || 'Failed to update presence status.');
      } else {
        const label = status === 'CONFIRMED' ? 'PRESENT (Confirmed)' : status === 'ABSENT' ? 'ABSENT' : 'UNCONFIRMED';
        showToast('success', 'Presence Updated', `Marked player as ${label}.`);
      }
    } catch (err: any) {
      showToast('error', 'Presence Error', err.message || 'Error updating presence.');
    }
  };

  // Admin Save Player Full Details (Name, Phone, In-Game Name, Rank, Presence)
  const handleAdminSavePlayerDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPlayerDetails) return;
    setSavingPlayerDetails(true);

    try {
      const res = await adminUpdatePlayerFullDetails({
        tournamentId,
        teamId: editingPlayerDetails.teamId,
        playerId: editingPlayerDetails.playerId,
        updates: {
          fullName: editingPlayerDetails.fullName.trim(),
          phoneNumber: editingPlayerDetails.phoneNumber.trim(),
          inGameName: editingPlayerDetails.inGameName.trim(),
          inGameRank: editingPlayerDetails.inGameRank.trim(),
          presenceStatus: editingPlayerDetails.presenceStatus,
        },
        adminId,
        adminName,
      });

      if (!res.success) {
        showToast('error', 'Update Failed', res.error || 'Failed to update player details.');
      } else {
        showToast('success', 'Player Details Saved', `Updated information and presence for ${editingPlayerDetails.gamerTag}.`);
        setEditingPlayerDetails(null);
      }
    } catch (err: any) {
      showToast('error', 'Update Error', err.message || 'Error saving player details.');
    } finally {
      setSavingPlayerDetails(false);
    }
  };

  // Handle Bracket Regeneration
  const handleRegenerateBracket = async () => {
    setShowRegenerateWarningModal(false);
    try {
      const res = await adminRegenerateBracket({
        tournamentId: tournament.id,
        adminId,
        adminName,
      });

      if (!res.success) throw new Error(res.error);
      showToast('success', 'Bracket Regenerated', 'Tournament bracket seeded and generated.');
    } catch (err: any) {
      showToast('error', 'Regeneration Error', err.message);
    }
  };

  // Handle Cancel Tournament
  const handleCancelTournamentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCancellingTournament(true);
    try {
      const res = await adminCancelTournament({
        tournamentId: tournament.id,
        reason: cancellationReason.trim() || 'Cancelled by tournament admin',
        adminId,
        adminName,
      });

      if (!res.success) throw new Error(res.error);
      showToast('info', 'Tournament Cancelled', 'Tournament status changed to CANCELLED.');
      setShowCancelModal(false);
    } catch (err: any) {
      showToast('error', 'Cancellation Error', err.message);
    } finally {
      setCancellingTournament(false);
    }
  };

  // Handle Match Score Edit & Advance
  const handleOpenEditMatch = (m: TournamentMatch) => {
    setEditingMatch(m);
    setMatchScoreA(m.scoreA || 0);
    setMatchScoreB(m.scoreB || 0);
    setMatchWinnerId(m.winnerId || '');
    setMatchStation(m.station || 'PC-01');
  };

  const handleSaveMatchResult = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMatch) return;

    setSavingMatch(true);
    try {
      const res = await updateTournamentMatchResult({
        tournamentId: tournament.id,
        matchId: editingMatch.id,
        scoreA: matchScoreA,
        scoreB: matchScoreB,
        winnerId: matchWinnerId,
        station: matchStation,
      });

      if (!res.success) throw new Error(res.error);
      showToast('success', 'Match Saved', 'Scores and winner status recorded.');
      setEditingMatch(null);
    } catch (err: any) {
      showToast('error', 'Match Save Error', err.message);
    } finally {
      setSavingMatch(false);
    }
  };

  // Handle Reschedule Single Match
  const handleRescheduleMatchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reschedulingMatch) return;

    try {
      const scheduledTime = matchScheduledTime ? new Date(matchScheduledTime).getTime() : undefined;
      const res = await adminRescheduleMatch({
        tournamentId: tournament.id,
        matchId: reschedulingMatch.id,
        scheduledTime,
        station: matchStation.trim() || undefined,
        adminId,
        adminName,
      });

      if (!res.success) throw new Error(res.error);
      showToast('success', 'Match Rescheduled', `Match #${reschedulingMatch.matchNumber} updated.`);
      setReschedulingMatch(null);
    } catch (err: any) {
      showToast('error', 'Reschedule Error', err.message);
    }
  };

  // Handle Announce Winner
  const handleOpenAnnounceWinner = () => {
    const grandFinal = tournament.matches?.find(
      (m) => m.round === Math.max(...(tournament.matches.map((x) => x.round) || [1]))
    );
    if (grandFinal?.winnerId) {
      setWinnerParticipantId(grandFinal.winnerId);
      const runnerUp =
        grandFinal.winnerId === grandFinal.participantA?.id
          ? grandFinal.participantB?.id
          : grandFinal.participantA?.id;
      if (runnerUp) setRunnerUpParticipantId(runnerUp);
    }
    setShowWinnerModal(true);
  };

  const handleConfirmWinner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!winnerParticipantId) {
      showToast('error', 'Selection Required', 'Please choose the 1st place champion.');
      return;
    }

    setAnnouncingWinner(true);
    try {
      const res = await completeTournamentAndAnnounceWinner(
        tournament.id,
        winnerParticipantId,
        runnerUpParticipantId || undefined,
        thirdPlaceParticipantId || undefined,
        announcingNotes
      );

      if (!res.success) throw new Error(res.error);
      showToast('success', 'Champion Announced!', 'Hall of Champions updated and achievements awarded.');
      setShowWinnerModal(false);
    } catch (err: any) {
      showToast('error', 'Announcement Failed', err.message);
    } finally {
      setAnnouncingWinner(false);
    }
  };

  // Filtered Audit Logs
  const filteredLogs = activityLogs.filter((log) => {
    if (auditFilterAction !== 'ALL' && log.action !== auditFilterAction) return false;
    if (auditSearch.trim()) {
      const q = auditSearch.toLowerCase();
      return (
        log.adminName.toLowerCase().includes(q) ||
        log.action.toLowerCase().includes(q) ||
        (log.details && log.details.toLowerCase().includes(q)) ||
        (log.affectedParticipant && log.affectedParticipant.toLowerCase().includes(q))
      );
    }
    return true;
  });

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* Top Bar Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-3xl bg-[#090a12] border border-slate-800">
        <div className="flex items-center space-x-3">
          <button
            id="back-to-tournaments-btn"
            onClick={onBack}
            className="p-2.5 rounded-2xl bg-slate-900 border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 transition-colors flex items-center space-x-1.5 text-xs font-mono font-bold"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Tournaments</span>
          </button>
          <div>
            <div className="flex items-center space-x-2">
              <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 text-[10px] font-mono font-bold uppercase border border-cyan-500/30">
                {tournament.gameName}
              </span>
              <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 text-[10px] font-mono font-bold uppercase border border-purple-500/30">
                {is5v5Team ? '5v5 Team Tournament' : '1v1 Individual'}
              </span>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-black uppercase border ${
                  tournament.status === 'LIVE'
                    ? 'bg-red-500/20 text-red-400 border-red-500/50'
                    : tournament.status === 'COMPLETED'
                    ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/50'
                    : tournament.status === 'REGISTRATION_OPEN'
                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}
              >
                {tournament.status.replace('_', ' ')}
              </span>
            </div>
            <h2 className="text-xl font-black font-display text-white mt-1">
              {tournament.name}
            </h2>
          </div>
        </div>

        {/* Primary Action: ✏️ EDIT TOURNAMENT */}
        {isAdmin && (
          <div className="flex items-center gap-2">
            <button
              id="admin-edit-tournament-btn"
              onClick={() => setShowEditModal(true)}
              className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black font-mono font-black text-xs uppercase tracking-wider transition-all shadow-lg shadow-cyan-500/25 flex items-center space-x-2 cursor-pointer"
            >
              <Edit2 className="w-4 h-4" />
              <span>✏️ Edit Tournament</span>
            </button>
          </div>
        )}
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
        <button
          id="tab-overview"
          onClick={() => setActiveTab('OVERVIEW')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-mono font-bold uppercase tracking-wider transition-all flex items-center space-x-2 whitespace-nowrap ${
            activeTab === 'OVERVIEW'
              ? 'bg-cyan-400 text-black shadow-lg shadow-cyan-400/20'
              : 'bg-[#0a0c14] border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <Info className="w-4 h-4" />
          <span>Overview & Details</span>
        </button>

        <button
          id="tab-prizes"
          onClick={() => setActiveTab('PRIZES')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-mono font-bold uppercase tracking-wider transition-all flex items-center space-x-2 whitespace-nowrap ${
            activeTab === 'PRIZES'
              ? 'bg-yellow-400 text-black shadow-lg shadow-yellow-400/20'
              : 'bg-[#0a0c14] border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <Trophy className="w-4 h-4" />
          <span>Prize Management</span>
        </button>

        <button
          id="tab-participants"
          onClick={() => setActiveTab('PARTICIPANTS')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-mono font-bold uppercase tracking-wider transition-all flex items-center space-x-2 whitespace-nowrap ${
            activeTab === 'PARTICIPANTS'
              ? 'bg-purple-500 text-white shadow-lg shadow-purple-500/20'
              : 'bg-[#0a0c14] border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>{is5v5Team ? 'Teams Management' : 'Players Management'} ({participants.length}/{tournament.maxParticipants})</span>
        </button>

        <button
          id="tab-bracket"
          onClick={() => setActiveTab('BRACKET')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-mono font-bold uppercase tracking-wider transition-all flex items-center space-x-2 whitespace-nowrap ${
            activeTab === 'BRACKET'
              ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20'
              : 'bg-[#0a0c14] border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Bracket & Matches {hasBracket && `(${tournament.matches?.length})`}</span>
        </button>

        <button
          id="tab-audit"
          onClick={() => setActiveTab('AUDIT')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-mono font-bold uppercase tracking-wider transition-all flex items-center space-x-2 whitespace-nowrap ${
            activeTab === 'AUDIT'
              ? 'bg-slate-200 text-black shadow-lg'
              : 'bg-[#0a0c14] border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <History className="w-4 h-4" />
          <span>Audit Log ({activityLogs.length})</span>
        </button>
      </div>

      {/* ============================================================ */}
      {/* TAB 1: OVERVIEW & DETAILS */}
      {/* ============================================================ */}
      {activeTab === 'OVERVIEW' && (
        <div className="space-y-6">
          {/* Quick Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 rounded-2xl bg-[#0a0c14] border border-slate-800 space-y-1">
              <span className="text-[10px] font-mono text-slate-400 uppercase">Confirmed Roster</span>
              <div className="text-xl font-bold font-display text-white">
                {confirmedCount} / {tournament.maxParticipants}
              </div>
              <span className="text-[10px] text-cyan-400 font-mono">
                {is5v5Team ? '5v5 Squads' : 'Solo Players'}
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-[#0a0c14] border border-slate-800 space-y-1">
              <span className="text-[10px] font-mono text-slate-400 uppercase">Bracket Format</span>
              <div className="text-sm font-bold font-display text-purple-300 truncate">
                {tournament.format.replace(/_/g, ' ')}
              </div>
              <span className="text-[10px] text-slate-400 font-mono">
                {hasBracket ? `${tournament.matches?.length} Matches Generated` : 'Pending Generation'}
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-[#0a0c14] border border-slate-800 space-y-1">
              <span className="text-[10px] font-mono text-slate-400 uppercase">Prize Pool</span>
              <div className="text-sm font-bold font-display text-yellow-400 truncate">
                {tournament.prizePool || 'Trophies & Glory'}
              </div>
              <span className="text-[10px] text-slate-400 font-mono truncate block">
                1st: {tournament.prizes?.firstPlace || 'Trophy'}
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-[#0a0c14] border border-slate-800 space-y-1">
              <span className="text-[10px] font-mono text-slate-400 uppercase">Venue / Zone</span>
              <div className="text-sm font-bold font-display text-emerald-400 truncate">
                {tournament.location || 'Main Arena'}
              </div>
              <span className="text-[10px] text-slate-400 font-mono">
                Entry: {tournament.entryFee || 'Free'}
              </span>
            </div>
          </div>

          {/* Details Card */}
          <div className="p-6 rounded-3xl bg-[#0a0c14] border border-slate-800 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
              <h3 className="text-sm font-bold font-display text-white uppercase tracking-wider flex items-center space-x-2">
                <Info className="w-4 h-4 text-cyan-400" />
                <span>Tournament Specifications</span>
              </h3>
              {isAdmin && (
                <button
                  onClick={() => setShowEditModal(true)}
                  className="text-xs text-cyan-400 hover:text-cyan-300 font-mono flex items-center space-x-1 cursor-pointer"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  <span>Modify Specifications</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs font-mono">
              <div className="space-y-3">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Start Schedule</span>
                  <strong className="text-slate-200 text-sm">
                    {new Date(tournament.startDate).toLocaleString()}
                  </strong>
                </div>

                {tournament.endDate && (
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Estimated Conclusion</span>
                    <strong className="text-slate-200 text-sm">
                      {new Date(tournament.endDate).toLocaleString()}
                    </strong>
                  </div>
                )}

                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Description</span>
                  <p className="text-slate-300 leading-relaxed mt-1">
                    {tournament.description || 'No description provided.'}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Rules & Guidelines</span>
                  <p className="text-slate-300 leading-relaxed mt-1 whitespace-pre-line">
                    {tournament.rules || 'Standard Nexus esports tournament rules apply.'}
                  </p>
                </div>

                {tournament.bannerUrl && (
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold mb-1">Banner Image</span>
                    <img
                      src={tournament.bannerUrl}
                      alt={tournament.name}
                      className="w-full h-32 object-cover rounded-xl border border-slate-800"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Tournament Control & Safety Panel */}
          {isAdmin && (
            <div className="p-6 rounded-3xl bg-slate-900/60 border border-slate-800 space-y-4">
              <h3 className="text-sm font-bold font-display text-white uppercase tracking-wider">
                Administrative Lifecycle Controls
              </h3>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={() => setShowEditModal(true)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono font-bold flex items-center space-x-2 cursor-pointer"
                >
                  <Edit2 className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Reschedule / Edit Times</span>
                </button>

                {!hasBracket ? (
                  <button
                    onClick={() => setActiveTab('BRACKET')}
                    className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-mono font-bold flex items-center space-x-2 cursor-pointer"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>Seed & Generate Bracket</span>
                  </button>
                ) : (
                  <button
                    onClick={() => setShowRegenerateWarningModal(true)}
                    className="px-4 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-mono font-bold flex items-center space-x-2 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Regenerate Bracket</span>
                  </button>
                )}

                {tournament.status !== 'COMPLETED' && (
                  <button
                    onClick={handleOpenAnnounceWinner}
                    className="px-4 py-2 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-black text-xs font-mono font-black uppercase flex items-center space-x-2 cursor-pointer"
                  >
                    <Crown className="w-3.5 h-3.5" />
                    <span>Crown Champion</span>
                  </button>
                )}

                {tournament.status !== 'CANCELLED' && (
                  <button
                    onClick={() => setShowCancelModal(true)}
                    className="px-4 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-xs font-mono font-bold flex items-center space-x-2 cursor-pointer"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    <span>Cancel Tournament</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* TAB 2: PRIZE MANAGEMENT */}
      {/* ============================================================ */}
      {activeTab === 'PRIZES' && (
        <div className="p-6 sm:p-8 rounded-3xl bg-[#0a0c14] border border-slate-800 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
            <div>
              <h3 className="text-lg font-black font-display text-white uppercase tracking-tight flex items-center space-x-2">
                <Trophy className="w-5 h-5 text-yellow-400" />
                <span>TOURNAMENT PRIZE MANAGEMENT</span>
              </h3>
              <p className="text-xs text-slate-400 font-mono">
                Configure cash rewards, trophies, hardware peripherals, and gaming hours for victors.
              </p>
            </div>
          </div>

          <form onSubmit={handleSavePrizes} className="space-y-5 text-xs font-mono max-w-2xl">
            <div>
              <label className="block text-slate-300 uppercase text-[10px] font-bold mb-1.5">
                Total Prize Pool Headline
              </label>
              <input
                id="input-total-prize-pool"
                type="text"
                disabled={!isAdmin}
                value={totalPrizePool}
                onChange={(e) => setTotalPrizePool(e.target.value)}
                placeholder="e.g. 50,000 DA Cash Pool + Pro Headsets"
                className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white font-bold focus:border-yellow-400 focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
              />
            </div>

            <div className="p-4 rounded-2xl bg-yellow-500/10 border border-yellow-500/30 space-y-4">
              <div>
                <label className="block text-yellow-300 uppercase text-[10px] font-bold mb-1.5 flex items-center space-x-1.5">
                  <span>🥇 1st Place (Champion) Prize *</span>
                </label>
                <input
                  id="input-first-place-prize"
                  type="text"
                  required
                  disabled={!isAdmin}
                  value={firstPlacePrize}
                  onChange={(e) => setFirstPlacePrize(e.target.value)}
                  placeholder="e.g. 25,000 DA + Championship Trophy + 20 Free Gaming Hours"
                  className="w-full px-4 py-2.5 bg-slate-900 border border-yellow-500/50 rounded-xl text-white font-bold focus:border-yellow-400 focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-slate-300 uppercase text-[10px] font-bold mb-1.5">
                  🥈 2nd Place (Runner-Up) Prize
                </label>
                <input
                  id="input-second-place-prize"
                  type="text"
                  disabled={!isAdmin}
                  value={secondPlacePrize}
                  onChange={(e) => setSecondPlacePrize(e.target.value)}
                  placeholder="e.g. 15,000 DA + Silver Medals + 10 Gaming Hours"
                  className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white font-bold focus:border-yellow-400 focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-slate-300 uppercase text-[10px] font-bold mb-1.5">
                  🥉 3rd Place Prize
                </label>
                <input
                  id="input-third-place-prize"
                  type="text"
                  disabled={!isAdmin}
                  value={thirdPlacePrize}
                  onChange={(e) => setThirdPlacePrize(e.target.value)}
                  placeholder="e.g. 10,000 DA + Bronze Medals"
                  className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white font-bold focus:border-yellow-400 focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-300 uppercase text-[10px] font-bold mb-1.5">
                Additional Prize Notes / Payout Terms
              </label>
              <textarea
                id="input-prize-notes"
                rows={3}
                disabled={!isAdmin}
                value={additionalPrizeNotes}
                onChange={(e) => setAdditionalPrizeNotes(e.target.value)}
                placeholder="Prizes disbursed in cash at front desk immediately following finals. Team prizes divided evenly among 5 roster members."
                className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white focus:border-yellow-400 focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
              />
            </div>

            {isAdmin && (
              <div className="pt-2">
                <button
                  id="save-prizes-btn"
                  type="submit"
                  disabled={savingPrizes}
                  className="px-6 py-2.5 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-black font-black uppercase tracking-wider transition-all shadow-[0_0_20px_rgba(234,179,8,0.3)] disabled:opacity-50 flex items-center space-x-2 cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{savingPrizes ? 'Saving Prizes...' : 'Save Prize Breakdown'}</span>
                </button>
              </div>
            )}
          </form>
        </div>
      )}

      {/* ============================================================ */}
      {/* TAB 3: TEAMS & PLAYERS MANAGEMENT */}
      {/* ============================================================ */}
      {activeTab === 'PARTICIPANTS' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-black font-display text-white uppercase tracking-tight">
                {is5v5Team ? 'REGISTERED 5v5 SQUADS' : 'REGISTERED PLAYERS'} ({participants.length} / {tournament.maxParticipants})
              </h3>
              <p className="text-xs text-slate-400 font-mono">
                {is5v5Team
                  ? 'One team = One tournament entry. Manage 5-player rosters, captains, and status.'
                  : 'Manage solo participants, ratings, and seeding.'}
              </p>
            </div>

            {isAdmin && (
              <div className="flex items-center gap-2">
                {is5v5Team ? (
                  <button
                    id="admin-add-team-btn"
                    onClick={() => setShowAddTeamModal(true)}
                    disabled={participants.length >= tournament.maxParticipants}
                    className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-400 hover:to-indigo-500 text-white font-mono font-bold text-xs uppercase tracking-wider transition-all flex items-center space-x-2 shadow-lg shadow-purple-500/20 disabled:opacity-50 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>➕ Add 5v5 Team Manually</span>
                  </button>
                ) : (
                  <button
                    id="admin-add-player-btn"
                    onClick={() => setShowAddPlayerModal(true)}
                    disabled={participants.length >= tournament.maxParticipants}
                    className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black font-mono font-bold text-xs uppercase tracking-wider transition-all flex items-center space-x-2 shadow-lg shadow-cyan-500/20 disabled:opacity-50 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>➕ Add Player Manually</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Roster List */}
          {participants.length === 0 ? (
            <div className="p-12 rounded-3xl bg-[#0a0c14] border border-slate-800 text-center space-y-3">
              <Users className="w-10 h-10 text-slate-600 mx-auto" />
              <h4 className="text-sm font-bold text-white font-display">No Participants Registered</h4>
              <p className="text-xs text-slate-400 font-mono max-w-sm mx-auto">
                {is5v5Team
                  ? 'Click "Add 5v5 Team Manually" to register a squad, or approve pending submissions in the registrations tab.'
                  : 'Click "Add Player Manually" to register participants.'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {participants.map((p, idx) => {
                const isConfirmed = p.status === 'CONFIRMED' || !p.status;
                const isDisqualified = p.status === 'DISQUALIFIED';
                const isWithdrawn = p.status === 'WITHDRAWN';
                const isPending = p.status === 'PENDING';
                const isExpanded = expandedTeamId === p.id;

                return (
                  <div
                    key={p.id}
                    className={`p-5 rounded-2xl border transition-all space-y-4 ${
                      isDisqualified
                        ? 'bg-red-950/20 border-red-900/40'
                        : isWithdrawn
                        ? 'bg-slate-900/40 border-slate-800 opacity-70'
                        : isPending
                        ? 'bg-amber-950/20 border-amber-800/40'
                        : 'bg-[#0a0c14] border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {/* Participant Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center space-x-3">
                        <span className="w-7 h-7 rounded-xl bg-slate-900 border border-slate-700 text-slate-300 text-xs font-mono font-bold flex items-center justify-center">
                          #{p.seed || idx + 1}
                        </span>

                        <div>
                          <div className="flex items-center space-x-2">
                            <h4 className="text-base font-bold text-white">
                              {p.name}
                            </h4>
                            {p.teamTag && (
                              <span className="text-cyan-400 font-mono text-xs">
                                [{p.teamTag}]
                              </span>
                            )}
                          </div>

                          <div className="flex items-center space-x-2 text-xs font-mono text-slate-400 mt-0.5">
                            {p.captainName && (
                              <span>Captain: <strong className="text-slate-300">{p.captainName}</strong></span>
                            )}
                            {(p.captainPhone || p.phoneNumber) && (
                              <>
                                <span>•</span>
                                <span className="text-cyan-300 font-mono flex items-center space-x-1">
                                  <Phone className="w-3 h-3" />
                                  <span>{p.captainPhone || p.phoneNumber}</span>
                                </span>
                              </>
                            )}
                            {p.seedRank && (
                              <>
                                <span>•</span>
                                <span className="text-yellow-400">{p.seedRank} ELO</span>
                              </>
                            )}
                            {is5v5Team && p.teamMembers && (
                              <>
                                <span>•</span>
                                <span className="text-emerald-400 font-bold">
                                  {p.teamMembers.filter((m) => m.presenceStatus === 'CONFIRMED').length}/5 Present
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Status & Quick Actions */}
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Solo Participant Presence Controls */}
                        {!is5v5Team && (
                          <div className="flex items-center space-x-1 px-2 py-1 rounded-xl bg-slate-900/90 border border-slate-700 text-xs">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border ${
                                p.presenceStatus === 'CONFIRMED'
                                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                  : p.presenceStatus === 'ABSENT'
                                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                                  : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                              }`}
                            >
                              {p.presenceStatus === 'CONFIRMED'
                                ? '✓ Present'
                                : p.presenceStatus === 'ABSENT'
                                ? '✕ Absent'
                                : '⏳ Unconfirmed'}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleAdminUpdatePresence(p.id, 'CONFIRMED')}
                              title="Mark Present"
                              className="p-1 rounded hover:bg-emerald-500/20 text-emerald-400 transition-colors"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleAdminUpdatePresence(p.id, 'ABSENT')}
                              title="Mark Absent"
                              className="p-1 rounded hover:bg-rose-500/20 text-rose-400 transition-colors"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleAdminUpdatePresence(p.id, 'NOT_CONFIRMED')}
                              title="Reset Presence"
                              className="p-1 rounded hover:bg-slate-800 text-slate-400 transition-colors"
                            >
                              <Clock className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}

                        {/* Status Badge */}
                        <span
                          className={`px-2.5 py-1 rounded-xl text-[10px] font-mono font-bold uppercase border ${
                            isConfirmed
                              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                              : isDisqualified
                              ? 'bg-rose-500/20 text-rose-400 border-rose-500/40'
                              : isWithdrawn
                              ? 'bg-slate-800 text-slate-400 border-slate-700'
                              : 'bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse'
                          }`}
                        >
                          {p.status || 'CONFIRMED'}
                        </span>

                        {/* Admin Participant Actions */}
                        {isAdmin && (
                          <>
                            {/* Status Changer Select */}
                            <select
                              value={p.status || 'CONFIRMED'}
                              onChange={(e) => handleStatusChange(p.id, e.target.value as any)}
                              className="px-2.5 py-1 rounded-xl bg-slate-900 border border-slate-700 text-slate-300 text-xs font-mono font-bold focus:border-cyan-400 focus:outline-none cursor-pointer"
                            >
                              <option value="CONFIRMED">Set: Confirmed</option>
                              <option value="PENDING">Set: Pending</option>
                              <option value="WITHDRAWN">Set: Withdrawn</option>
                              <option value="DISQUALIFIED">Set: Disqualified</option>
                            </select>

                            {/* Edit Details */}
                            <button
                              onClick={() => handleOpenEditParticipant(p)}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
                              title="Edit Info"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>

                            {/* Remove */}
                            <button
                              onClick={() => handleRemoveParticipant(p)}
                              className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 transition-colors cursor-pointer"
                              title="Remove Participant"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}

                        {/* Expand Roster (if 5v5 team) */}
                        {is5v5Team && p.teamMembers && (
                          <button
                            onClick={() => setExpandedTeamId(isExpanded ? null : p.id)}
                            className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-400 font-mono text-xs flex items-center space-x-1"
                          >
                            <span>5 Players</span>
                            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Expandable 5-Player Roster Table */}
                    {is5v5Team && isExpanded && p.teamMembers && (
                      <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-3 text-xs font-mono animate-in fade-in">
                        <div className="flex items-center justify-between text-slate-400 text-[10px] uppercase font-bold border-b border-slate-800/80 pb-2">
                          <span className="flex items-center gap-2">
                            <span>Team Member Roster ({p.teamMembers.length} Verified Slots)</span>
                            <span className="text-emerald-400">
                              • {p.teamMembers.filter((m) => m.presenceStatus === 'CONFIRMED').length}/5 Confirmed Present
                            </span>
                          </span>
                          <span className="text-cyan-400">Admin Presence & Details Console</span>
                        </div>

                        <div className="grid grid-cols-1 gap-2.5">
                          {p.teamMembers.map((member, mIdx) => {
                            const memberPhone = member.phoneNumber || (member as any).playerPhone || '';
                            const memberPresence = member.presenceStatus || 'NOT_CONFIRMED';

                            return (
                              <div
                                key={member.uid || mIdx}
                                className="p-3 rounded-xl bg-slate-900 border border-slate-800/80 flex flex-col md:flex-row md:items-center justify-between gap-3"
                              >
                                <div className="flex items-center space-x-3 truncate">
                                  <span className="w-6 h-6 rounded-lg bg-slate-800 text-[11px] flex items-center justify-center font-bold text-slate-300">
                                    {mIdx + 1}
                                  </span>
                                  <div className="truncate">
                                    <div className="flex items-center space-x-2">
                                      <span className="font-bold text-white text-sm truncate">
                                        {member.fullName || member.gamerTag}
                                      </span>
                                      <span className="text-xs text-cyan-400 font-mono">
                                        (@{member.gamerTag})
                                      </span>
                                      {mIdx === 0 && (
                                        <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                          Captain
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-400 mt-0.5">
                                      {member.inGameName && (
                                        <span>IGN: <strong className="text-slate-200">{member.inGameName}</strong></span>
                                      )}
                                      {member.inGameRank && (
                                        <span>• Rank: <strong className="text-amber-300">{member.inGameRank}</strong></span>
                                      )}
                                      {memberPhone ? (
                                        <span className="flex items-center space-x-1">
                                          <span>•</span>
                                          <Phone className="w-3 h-3 text-emerald-400" />
                                          <a
                                            href={`tel:${memberPhone}`}
                                            className="text-emerald-300 hover:text-emerald-200 font-semibold underline"
                                          >
                                            {memberPhone}
                                          </a>
                                        </span>
                                      ) : (
                                        <span className="text-rose-400">• No Phone</span>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-center space-x-2 shrink-0 self-end md:self-center">
                                  {/* Presence Badge */}
                                  <span
                                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                                      memberPresence === 'CONFIRMED'
                                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                        : memberPresence === 'ABSENT'
                                        ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                                        : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                    }`}
                                  >
                                    {memberPresence === 'CONFIRMED'
                                      ? '✓ Present'
                                      : memberPresence === 'ABSENT'
                                      ? '✕ Absent'
                                      : '⏳ Unconfirmed'}
                                  </span>

                                  {/* Presence Action Buttons */}
                                  <div className="flex items-center space-x-1 bg-slate-950 px-1 py-0.5 rounded-lg border border-slate-800">
                                    <button
                                      type="button"
                                      onClick={() => handleAdminUpdatePresence(member.uid, 'CONFIRMED', p.id)}
                                      title="Mark Present"
                                      className={`p-1 rounded transition-colors ${
                                        memberPresence === 'CONFIRMED'
                                          ? 'bg-emerald-500 text-white font-bold'
                                          : 'hover:bg-emerald-500/20 text-emerald-400'
                                      }`}
                                    >
                                      <Check className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleAdminUpdatePresence(member.uid, 'ABSENT', p.id)}
                                      title="Mark Absent"
                                      className={`p-1 rounded transition-colors ${
                                        memberPresence === 'ABSENT'
                                          ? 'bg-rose-500 text-white font-bold'
                                          : 'hover:bg-rose-500/20 text-rose-400'
                                      }`}
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleAdminUpdatePresence(member.uid, 'NOT_CONFIRMED', p.id)}
                                      title="Reset Presence"
                                      className={`p-1 rounded transition-colors ${
                                        memberPresence === 'NOT_CONFIRMED'
                                          ? 'bg-amber-500 text-black font-bold'
                                          : 'hover:bg-amber-500/20 text-slate-400'
                                      }`}
                                    >
                                      <Clock className="w-3.5 h-3.5" />
                                    </button>
                                  </div>

                                  {/* Edit Full Player Details */}
                                  {isAdmin && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setEditingPlayerDetails({
                                          teamId: p.id,
                                          teamName: p.name,
                                          playerId: member.uid,
                                          gamerTag: member.gamerTag,
                                          fullName: member.fullName || '',
                                          phoneNumber: memberPhone,
                                          inGameName: member.inGameName || '',
                                          inGameRank: member.inGameRank || '',
                                          presenceStatus: memberPresence,
                                        })
                                      }
                                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-medium border border-slate-700 transition-colors flex items-center space-x-1 cursor-pointer"
                                      title="Edit Full Player Details & Presence"
                                    >
                                      <Edit2 className="w-3 h-3" />
                                      <span>Edit</span>
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* TAB 4: BRACKET & MATCHES */}
      {/* ============================================================ */}
      {activeTab === 'BRACKET' && (
        <div className="space-y-6">
          <InteractiveTournamentBracketMap
            tournament={tournament}
            currentUser={user ? (({ id: user.uid, gamerTag: user.displayName || 'Admin' } as unknown) as Player) : null}
            isAdmin={isAdmin}
            teamRegistrations={teamRegistrations}
            onRefreshTournament={() => {
              // Tournament doc is already subscribed in real-time
            }}
          />
        </div>
      )}

      {/* ============================================================ */}
      {/* TAB 5: AUDIT LOG */}
      {/* ============================================================ */}
      {activeTab === 'AUDIT' && (
        <div className="p-6 rounded-3xl bg-[#0a0c14] border border-slate-800 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
            <div>
              <h3 className="text-lg font-black font-display text-white uppercase tracking-tight flex items-center space-x-2">
                <History className="w-5 h-5 text-cyan-400" />
                <span>TOURNAMENT AUDIT & ACTIVITY LOG</span>
              </h3>
              <p className="text-xs text-slate-400 font-mono">
                Immutable chronological ledger of every administrative edit, team change, and match score update.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  placeholder="Search logs..."
                  value={auditSearch}
                  onChange={(e) => setAuditSearch(e.target.value)}
                  className="pl-8 pr-3 py-1.5 bg-slate-900 border border-slate-700 rounded-xl text-xs font-mono text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
                />
              </div>

              <select
                value={auditFilterAction}
                onChange={(e) => setAuditFilterAction(e.target.value)}
                className="px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-xl text-xs font-mono text-white focus:border-cyan-400 focus:outline-none"
              >
                <option value="ALL">All Actions</option>
                <option value="DETAILS_UPDATED">Details Updated</option>
                <option value="PRIZES_UPDATED">Prizes Updated</option>
                <option value="ADD_TEAM_MANUAL">Team Added</option>
                <option value="ADD_PLAYER_MANUAL">Player Added</option>
                <option value="REMOVE_TEAM">Team Removed</option>
                <option value="PARTICIPANT_STATUS_CHANGED">Status Changed</option>
                <option value="MATCH_UPDATED">Match Updated</option>
                <option value="RESCHEDULE_MATCH">Match Rescheduled</option>
                <option value="BRACKET_REGENERATED">Bracket Regenerated</option>
                <option value="CANCEL_TOURNAMENT">Cancelled</option>
              </select>
            </div>
          </div>

          {filteredLogs.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-xs font-mono">
              No audit logs recorded for this criteria yet. All admin actions will be captured here in real-time.
            </div>
          ) : (
            <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
              {filteredLogs.map((log) => (
                <div
                  key={log.id}
                  className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800 text-xs font-mono space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 text-[10px] font-bold uppercase border border-cyan-500/30">
                        {log.action.replace(/_/g, ' ')}
                      </span>
                      <strong className="text-white">{log.adminName}</strong>
                      {log.affectedParticipant && (
                        <span className="text-slate-400">
                          → <span className="text-yellow-400">{log.affectedParticipant}</span>
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-500">
                      {new Date(log.timestamp).toLocaleString()}
                    </span>
                  </div>

                  <p className="text-slate-300 leading-relaxed">
                    {log.details}
                  </p>

                  {(log.oldValue || log.newValue) && (
                    <div className="text-[10px] text-slate-400 flex items-center space-x-2 pt-1 border-t border-slate-800/80">
                      {log.oldValue && <span>Old: <span className="text-slate-300 line-through">{log.oldValue}</span></span>}
                      {log.oldValue && log.newValue && <span>→</span>}
                      {log.newValue && <span>New: <span className="text-emerald-400 font-bold">{log.newValue}</span></span>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* MODALS */}
      {/* ============================================================ */}

      {/* 1. Edit Tournament Modal */}
      {showEditModal && (
        <AdminEditTournamentModal
          isOpen={showEditModal}
          onClose={() => setShowEditModal(false)}
          tournament={tournament}
          adminId={adminId}
          adminName={adminName}
          onSuccess={() => {
            showToast('success', 'Refreshed', 'Tournament details refreshed.');
          }}
        />
      )}

      {/* 2. Add 5v5 Team Manually Modal */}
      {showAddTeamModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
          <div className="w-full max-w-2xl bg-[#0c0e18] border-2 border-purple-500/60 rounded-3xl p-6 sm:p-8 space-y-5 shadow-2xl my-8">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-purple-500 text-white">
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black font-display text-white">
                    ADD 5v5 TEAM MANUALLY
                  </h3>
                  <p className="text-xs text-purple-300 font-mono">
                    Direct Admin Squad Registration (One Team = One Entry)
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowAddTeamModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddTeamSubmit} className="space-y-4 text-xs font-mono">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-slate-300 uppercase text-[10px] font-bold mb-1">
                    Team Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Nexus Knights"
                    value={newTeamName}
                    onChange={(e) => setNewTeamName(e.target.value)}
                    className="w-full px-3.5 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white font-bold"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 uppercase text-[10px] font-bold mb-1">
                    Team Tag (Optional)
                  </label>
                  <input
                    type="text"
                    maxLength={5}
                    placeholder="e.g. NXK"
                    value={newTeamTag}
                    onChange={(e) => setNewTeamTag(e.target.value.toUpperCase())}
                    className="w-full px-3.5 py-2 bg-slate-900 border border-slate-700 rounded-xl text-cyan-400 font-bold"
                  />
                </div>
              </div>

              {/* Captain Info */}
              <div className="p-3.5 rounded-2xl bg-purple-950/20 border border-purple-800/40 space-y-3">
                <span className="text-purple-300 font-bold block uppercase text-[10px]">
                  Player 1 (Team Captain & Contact)
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 text-[10px] mb-1">Captain GamerTag *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. ShadowCaptain"
                      value={captainGamerTag}
                      onChange={(e) => setCaptainGamerTag(e.target.value)}
                      className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 text-[10px] mb-1">Captain Phone Number *</label>
                    <input
                      type="tel"
                      required
                      placeholder="0550 12 34 56"
                      value={captainPhone}
                      onChange={(e) => setCaptainPhone(e.target.value)}
                      className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-cyan-300 font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Remaining 4 Players */}
              <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-3">
                <span className="text-slate-300 font-bold block uppercase text-[10px]">
                  Remaining 4 Squad Members
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="Player 2 GamerTag"
                    value={member2Tag}
                    onChange={(e) => setMember2Tag(e.target.value)}
                    className="px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white"
                  />
                  <input
                    type="text"
                    placeholder="Player 3 GamerTag"
                    value={member3Tag}
                    onChange={(e) => setMember3Tag(e.target.value)}
                    className="px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white"
                  />
                  <input
                    type="text"
                    placeholder="Player 4 GamerTag"
                    value={member4Tag}
                    onChange={(e) => setMember4Tag(e.target.value)}
                    className="px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white"
                  />
                  <input
                    type="text"
                    placeholder="Player 5 GamerTag"
                    value={member5Tag}
                    onChange={(e) => setMember5Tag(e.target.value)}
                    className="px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white"
                  />
                </div>
              </div>

              {/* Status */}
              <div>
                <label className="block text-slate-300 uppercase text-[10px] font-bold mb-1">
                  Initial Registration Status
                </label>
                <select
                  value={teamRegistrationStatus}
                  onChange={(e) => setTeamRegistrationStatus(e.target.value as any)}
                  className="w-full px-3.5 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white font-bold"
                >
                  <option value="CONFIRMED">CONFIRMED (Immediately Official Participant)</option>
                  <option value="PENDING">PENDING (Review queue)</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddTeamModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-900 text-slate-400"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addingTeam}
                  className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold uppercase transition-all"
                >
                  {addingTeam ? 'Registering Squad...' : 'Add Team to Tournament'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. Add 1v1 Player Manually Modal */}
      {showAddPlayerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="w-full max-w-md bg-[#0c0e18] border-2 border-cyan-500/60 rounded-3xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-black font-display text-white uppercase">
                Add Individual Player
              </h3>
              <button
                onClick={() => setShowAddPlayerModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddPlayerSubmit} className="space-y-3 text-xs font-mono">
              <div>
                <label className="block text-slate-300 text-[10px] font-bold mb-1">GamerTag *</label>
                <input
                  type="text"
                  required
                  value={newPlayerGamerTag}
                  onChange={(e) => setNewPlayerGamerTag(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white font-bold"
                  placeholder="e.g. ApexSniper"
                />
              </div>

              <div>
                <label className="block text-slate-300 text-[10px] font-bold mb-1">Full Name</label>
                <input
                  type="text"
                  value={newPlayerFullName}
                  onChange={(e) => setNewPlayerFullName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white"
                  placeholder="e.g. Karim B."
                />
              </div>

              <div>
                <label className="block text-slate-300 text-[10px] font-bold mb-1">Phone Number</label>
                <input
                  type="tel"
                  value={newPlayerPhone}
                  onChange={(e) => setNewPlayerPhone(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white font-mono"
                  placeholder="0550 00 00 00"
                />
              </div>

              <div>
                <label className="block text-slate-300 text-[10px] font-bold mb-1">Initial ELO / Seed Rating</label>
                <input
                  type="number"
                  value={newPlayerRating}
                  onChange={(e) => setNewPlayerRating(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white font-bold"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddPlayerModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-900 text-slate-400"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addingPlayer}
                  className="px-5 py-2 rounded-xl bg-cyan-400 text-black font-bold uppercase"
                >
                  {addingPlayer ? 'Adding...' : 'Add Player'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. Edit Participant Modal */}
      {editingParticipant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="w-full max-w-md bg-[#0c0e18] border-2 border-cyan-500/60 rounded-3xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-black font-display text-white uppercase">
                Edit {editingParticipant.type === 'TEAM' ? 'Team' : 'Player'} Details
              </h3>
              <button
                onClick={() => setEditingParticipant(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveParticipantEdit} className="space-y-3 text-xs font-mono">
              <div>
                <label className="block text-slate-300 text-[10px] font-bold mb-1">
                  {editingParticipant.type === 'TEAM' ? 'Team Name *' : 'GamerTag *'}
                </label>
                <input
                  type="text"
                  required
                  value={editPartName}
                  onChange={(e) => setEditPartName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white font-bold"
                />
              </div>

              {editingParticipant.type === 'TEAM' && (
                <div>
                  <label className="block text-slate-300 text-[10px] font-bold mb-1">Team Tag</label>
                  <input
                    type="text"
                    maxLength={5}
                    value={editPartTag}
                    onChange={(e) => setEditPartTag(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-cyan-400 font-bold"
                  />
                </div>
              )}

              <div>
                <label className="block text-slate-300 text-[10px] font-bold mb-1">
                  {editingParticipant.type === 'TEAM' ? 'Captain GamerTag / Name' : 'Full Name'}
                </label>
                <input
                  type="text"
                  value={editPartCaptainName}
                  onChange={(e) => setEditPartCaptainName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white"
                />
              </div>

              <div>
                <label className="block text-slate-300 text-[10px] font-bold mb-1">Phone Number</label>
                <input
                  type="tel"
                  value={editPartPhone}
                  onChange={(e) => setEditPartPhone(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-cyan-300 font-mono"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingParticipant(null)}
                  className="px-4 py-2 rounded-xl bg-slate-900 text-slate-400"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingParticipant}
                  className="px-5 py-2 rounded-xl bg-cyan-400 text-black font-bold uppercase"
                >
                  {savingParticipant ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. Referee Match Modal */}
      {editingMatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="w-full max-w-lg bg-[#0c0e18] border-2 border-cyan-500/60 rounded-3xl p-6 sm:p-8 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <span className="text-[10px] font-mono text-cyan-400 font-bold uppercase">
                  Bracket Referee Center
                </span>
                <h3 className="text-lg font-black font-display text-white">
                  Match #{editingMatch.matchNumber} ({editingMatch.roundName})
                </h3>
              </div>
              <button
                onClick={() => setEditingMatch(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveMatchResult} className="space-y-4 text-xs font-mono">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
                  <span className="text-[10px] text-slate-400 uppercase font-bold">Contestant A</span>
                  <div className="text-sm font-bold text-white truncate">
                    {editingMatch.participantA?.name || editingMatch.participantAName || 'TBD'}
                  </div>
                  <div>
                    <label className="text-[9px] text-slate-500 uppercase">Score A</label>
                    <input
                      type="number"
                      value={matchScoreA}
                      onChange={(e) => setMatchScoreA(Number(e.target.value))}
                      className="w-full px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-white font-bold"
                    />
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
                  <span className="text-[10px] text-slate-400 uppercase font-bold">Contestant B</span>
                  <div className="text-sm font-bold text-white truncate">
                    {editingMatch.participantB?.name || editingMatch.participantBName || 'TBD'}
                  </div>
                  <div>
                    <label className="text-[9px] text-slate-500 uppercase">Score B</label>
                    <input
                      type="number"
                      value={matchScoreB}
                      onChange={(e) => setMatchScoreB(Number(e.target.value))}
                      className="w-full px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-white font-bold"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 uppercase text-[10px] font-bold mb-1">
                  Official Winner Declaration
                </label>
                <select
                  value={matchWinnerId}
                  onChange={(e) => setMatchWinnerId(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white font-bold"
                >
                  <option value="">In Progress (No Winner Decided)</option>
                  {(editingMatch.participantA?.id || editingMatch.participantAId) && (
                    <option value={editingMatch.participantA?.id || editingMatch.participantAId}>
                      Winner: {editingMatch.participantA?.name || editingMatch.participantAName}
                    </option>
                  )}
                  {(editingMatch.participantB?.id || editingMatch.participantBId) && (
                    <option value={editingMatch.participantB?.id || editingMatch.participantBId}>
                      Winner: {editingMatch.participantB?.name || editingMatch.participantBName}
                    </option>
                  )}
                </select>
              </div>

              <div>
                <label className="block text-slate-300 uppercase text-[10px] font-bold mb-1">
                  Gaming Station Assigned
                </label>
                <input
                  type="text"
                  value={matchStation}
                  onChange={(e) => setMatchStation(e.target.value)}
                  placeholder="e.g. PC-01 or Stage Station A"
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingMatch(null)}
                  className="px-4 py-2 rounded-xl bg-slate-900 text-slate-400"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingMatch}
                  className="px-5 py-2 rounded-xl bg-cyan-400 text-black font-bold uppercase transition-all"
                >
                  {savingMatch ? 'Saving...' : 'Record Match Result'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. Reschedule Match Time/Station Modal */}
      {reschedulingMatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="w-full max-w-md bg-[#0c0e18] border-2 border-slate-700 rounded-3xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-black font-display text-white uppercase">
                Reschedule Match #{reschedulingMatch.matchNumber}
              </h3>
              <button
                onClick={() => setReschedulingMatch(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRescheduleMatchSubmit} className="space-y-4 text-xs font-mono">
              <div>
                <label className="block text-slate-300 text-[10px] font-bold mb-1">
                  Assigned Gaming Station
                </label>
                <input
                  type="text"
                  value={matchStation}
                  onChange={(e) => setMatchStation(e.target.value)}
                  placeholder="e.g. PC-05 or PS5-02"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white font-bold"
                />
              </div>

              <div>
                <label className="block text-slate-300 text-[10px] font-bold mb-1">
                  Scheduled Start Time
                </label>
                <input
                  type="datetime-local"
                  value={matchScheduledTime}
                  onChange={(e) => setMatchScheduledTime(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white font-bold"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setReschedulingMatch(null)}
                  className="px-4 py-2 rounded-xl bg-slate-900 text-slate-400"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-cyan-400 text-black font-bold uppercase"
                >
                  Save Schedule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 7. Safety Warning: Regenerate Bracket */}
      {showRegenerateWarningModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="w-full max-w-md bg-[#0c0e18] border-2 border-amber-500/60 rounded-3xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-black font-display text-white">
                  Regenerate Bracket Warning
                </h3>
                <span className="text-xs text-amber-300 font-mono">Irreversible Operation</span>
              </div>
            </div>

            <p className="text-xs font-mono text-slate-300 leading-relaxed">
              A bracket already exists with <strong>{tournament.matches?.length} matches</strong>.
              Regenerating will recalculate seeds from the current participant roster and reset all match scores.
            </p>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                onClick={() => setShowRegenerateWarningModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-900 text-slate-400"
              >
                Keep Existing Bracket
              </button>
              <button
                onClick={handleRegenerateBracket}
                className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black uppercase text-xs font-mono"
              >
                Yes, Regenerate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 8. Cancel Tournament Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="w-full max-w-md bg-[#0c0e18] border-2 border-rose-500/60 rounded-3xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-rose-500/20 text-rose-400">
                <XCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-black font-display text-white">
                  Cancel Tournament
                </h3>
                <span className="text-xs text-rose-400 font-mono">Status will be set to CANCELLED</span>
              </div>
            </div>

            <form onSubmit={handleCancelTournamentSubmit} className="space-y-3 text-xs font-mono">
              <div>
                <label className="block text-slate-300 text-[10px] font-bold mb-1">
                  Reason for Cancellation *
                </label>
                <textarea
                  required
                  rows={3}
                  value={cancellationReason}
                  onChange={(e) => setCancellationReason(e.target.value)}
                  placeholder="e.g. Rescheduling due to local ISP network outage; all participants notified."
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCancelModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-900 text-slate-400"
                >
                  Abort
                </button>
                <button
                  type="submit"
                  disabled={cancellingTournament}
                  className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold uppercase"
                >
                  {cancellingTournament ? 'Cancelling...' : 'Confirm Cancellation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 9. Announce Champion Modal */}
      {showWinnerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="w-full max-w-lg bg-[#0e101c] border-2 border-yellow-500/60 rounded-3xl p-6 sm:p-8 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-yellow-400 text-black text-xl">
                  👑
                </div>
                <div>
                  <h3 className="text-lg font-black font-display text-white">
                    OFFICIAL CHAMPION ANNOUNCEMENT
                  </h3>
                  <p className="text-xs text-yellow-300 font-mono">
                    Permanent Hall of Champions Certification
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowWinnerModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmWinner} className="space-y-4 text-xs font-mono">
              <div>
                <label className="block text-yellow-400 uppercase text-[10px] font-bold mb-1">
                  🥇 1ST PLACE TOURNAMENT CHAMPION *
                </label>
                <select
                  required
                  value={winnerParticipantId}
                  onChange={(e) => setWinnerParticipantId(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-900 border border-yellow-500/50 rounded-xl text-white font-bold"
                >
                  <option value="">Select Champion...</option>
                  {tournament.participants?.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.type})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-300 uppercase text-[10px] font-bold mb-1">
                  🥈 2nd Place Finalist (Runner-Up)
                </label>
                <select
                  value={runnerUpParticipantId}
                  onChange={(e) => setRunnerUpParticipantId(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white"
                >
                  <option value="">None / Optional</option>
                  {tournament.participants?.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-300 uppercase text-[10px] font-bold mb-1">
                  🥉 3rd Place
                </label>
                <select
                  value={thirdPlaceParticipantId}
                  onChange={(e) => setThirdPlaceParticipantId(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white"
                >
                  <option value="">None / Optional</option>
                  {tournament.participants?.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowWinnerModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-900 text-slate-400"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={announcingWinner || !winnerParticipantId}
                  className="px-6 py-2.5 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-black font-black uppercase tracking-wider transition-all"
                >
                  {announcingWinner ? 'Certifying...' : 'Certify Champions'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* 10. Admin Player Details & Presence Management Modal */}
      {editingPlayerDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-lg bg-[#0e101c] border border-cyan-500/40 rounded-3xl p-6 sm:p-7 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
                  <UserCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white font-display">
                    Admin Player Details & Presence
                  </h3>
                  <p className="text-xs text-slate-400 font-mono">
                    {editingPlayerDetails.teamName
                      ? `Team: ${editingPlayerDetails.teamName} • @${editingPlayerDetails.gamerTag}`
                      : `@${editingPlayerDetails.gamerTag}`}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setEditingPlayerDetails(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAdminSavePlayerDetails} className="space-y-4 text-xs font-mono">
              {/* Presence Status Selector */}
              <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 space-y-2">
                <label className="block text-slate-300 uppercase text-[10px] font-bold">
                  Tournament On-Site Presence Status *
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setEditingPlayerDetails({
                        ...editingPlayerDetails,
                        presenceStatus: 'CONFIRMED',
                      })
                    }
                    className={`py-2 px-3 rounded-xl font-bold border transition-all text-center ${
                      editingPlayerDetails.presenceStatus === 'CONFIRMED'
                        ? 'bg-emerald-500/30 border-emerald-400 text-emerald-300 shadow-md shadow-emerald-500/10'
                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                    }`}
                  >
                    ✓ Present
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setEditingPlayerDetails({
                        ...editingPlayerDetails,
                        presenceStatus: 'NOT_CONFIRMED',
                      })
                    }
                    className={`py-2 px-3 rounded-xl font-bold border transition-all text-center ${
                      editingPlayerDetails.presenceStatus === 'NOT_CONFIRMED'
                        ? 'bg-amber-500/30 border-amber-400 text-amber-300 shadow-md shadow-amber-500/10'
                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                    }`}
                  >
                    ⏳ Pending
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setEditingPlayerDetails({
                        ...editingPlayerDetails,
                        presenceStatus: 'ABSENT',
                      })
                    }
                    className={`py-2 px-3 rounded-xl font-bold border transition-all text-center ${
                      editingPlayerDetails.presenceStatus === 'ABSENT'
                        ? 'bg-rose-500/30 border-rose-400 text-rose-300 shadow-md shadow-rose-500/10'
                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                    }`}
                  >
                    ✕ Absent
                  </button>
                </div>
              </div>

              {/* Full Name */}
              <div>
                <label className="block text-slate-300 uppercase text-[10px] font-bold mb-1">
                  Full Real Name
                </label>
                <input
                  type="text"
                  value={editingPlayerDetails.fullName}
                  onChange={(e) =>
                    setEditingPlayerDetails({
                      ...editingPlayerDetails,
                      fullName: e.target.value,
                    })
                  }
                  placeholder="e.g. John Doe"
                  className="w-full px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white focus:border-cyan-400 focus:outline-none"
                />
              </div>

              {/* Phone Number */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-slate-300 uppercase text-[10px] font-bold">
                    Contact Phone Number (Admin Confidential)
                  </label>
                  {editingPlayerDetails.phoneNumber && (
                    <a
                      href={`tel:${editingPlayerDetails.phoneNumber}`}
                      className="text-emerald-400 text-[10px] underline flex items-center gap-1"
                    >
                      <Phone className="w-2.5 h-2.5" />
                      <span>Call Player</span>
                    </a>
                  )}
                </div>
                <input
                  type="tel"
                  value={editingPlayerDetails.phoneNumber}
                  onChange={(e) =>
                    setEditingPlayerDetails({
                      ...editingPlayerDetails,
                      phoneNumber: e.target.value,
                    })
                  }
                  placeholder="e.g. 0550123456"
                  className="w-full px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white focus:border-cyan-400 focus:outline-none"
                />
              </div>

              {/* In-Game Name & Rank */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 uppercase text-[10px] font-bold mb-1">
                    In-Game Name (IGN)
                  </label>
                  <input
                    type="text"
                    value={editingPlayerDetails.inGameName}
                    onChange={(e) =>
                      setEditingPlayerDetails({
                        ...editingPlayerDetails,
                        inGameName: e.target.value,
                      })
                    }
                    placeholder="e.g. Faker#EUW"
                    className="w-full px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white focus:border-cyan-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 uppercase text-[10px] font-bold mb-1">
                    In-Game Rank / Rating
                  </label>
                  <input
                    type="text"
                    value={editingPlayerDetails.inGameRank}
                    onChange={(e) =>
                      setEditingPlayerDetails({
                        ...editingPlayerDetails,
                        inGameRank: e.target.value,
                      })
                    }
                    placeholder="e.g. Diamond II"
                    className="w-full px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white focus:border-cyan-400 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingPlayerDetails(null)}
                  className="px-4 py-2 rounded-xl bg-slate-900 text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingPlayerDetails}
                  className="px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold transition-all shadow-lg shadow-cyan-600/20 disabled:opacity-50"
                >
                  {savingPlayerDetails ? 'Saving...' : 'Save Player Details'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
