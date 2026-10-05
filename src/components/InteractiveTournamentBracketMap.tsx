import React, { useState, useEffect, useMemo, useRef } from 'react';
import confetti from 'canvas-confetti';
import {
  Tournament,
  TournamentMatch,
  TournamentParticipant,
  TeamTournamentRegistration,
  Player,
} from '../types';
import {
  Trophy,
  Crown,
  Clock,
  Users,
  Shield,
  Medal,
  CheckCircle2,
  AlertTriangle,
  Play,
  ArrowRight,
  Sparkles,
  RefreshCw,
  X,
  Zap,
  Check,
  Award,
  Maximize2,
  Minimize2,
  AlertCircle,
  HelpCircle,
  Gamepad2,
  Radio,
  Flame,
  UserCheck,
  Swords,
  Lock,
  Unlock,
  ArrowUpRight,
  Calendar,
  Dices,
} from 'lucide-react';
import { useToast } from './Toast';
import {
  TournamentQualificationBroadcastModal,
  QualificationBroadcastData,
} from './TournamentQualificationBroadcastModal';
import {
  adminStartTournamentMatch,
  submitTournamentMatchResult,
  adminApproveTournamentMatchResult,
  adminRejectTournamentMatchResult,
  adminForceEndTournamentMatch,
  adminResetTournamentMatch,
  generateTournamentBracket,
  saveTournamentBracket,
  getEligibleConfirmedTournamentTeams,
  redrawTournamentBracket,
} from '../services/tournamentService';
import { TournamentDrawModal } from './TournamentDrawModal';
import { MatchScheduleModal } from './MatchScheduleModal';

interface InteractiveTournamentBracketMapProps {
  tournament: Tournament;
  currentUser?: Player | null;
  isAdmin?: boolean;
  teamRegistrations?: TeamTournamentRegistration[];
  onRefreshTournament?: () => void;
  onSelectParticipant?: (id: string, type: 'PLAYER' | 'TEAM') => void;
}

export const InteractiveTournamentBracketMap: React.FC<InteractiveTournamentBracketMapProps> = ({
  tournament,
  currentUser,
  isAdmin = false,
  teamRegistrations = [],
  onRefreshTournament,
  onSelectParticipant,
}) => {
  const { showToast } = useToast();

  // Selected match for the Match Center Modal
  const [selectedMatch, setSelectedMatch] = useState<TournamentMatch | null>(null);
  const [filterStage, setFilterStage] = useState<'ALL' | 'SEMIS' | 'FINALS' | 'LIVE' | 'PENDING'>('ALL');
  const [viewMode, setViewMode] = useState<'MAP' | 'CARDS'>('MAP');
  const [showPodium, setShowPodium] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [generatingBracket, setGeneratingBracket] = useState(false);

  // Match Modal Inputs
  const [scoreAInput, setScoreAInput] = useState<number>(0);
  const [scoreBInput, setScoreBInput] = useState<number>(0);
  const [selectedWinnerId, setSelectedWinnerId] = useState<string>('');
  const [notesInput, setNotesInput] = useState<string>('');
  const [stationInput, setStationInput] = useState<string>('');
  const [disputeReasonInput, setDisputeReasonInput] = useState<string>('');
  const [showDisputeInput, setShowDisputeInput] = useState<boolean>(false);

  // Qualification & Advancement Celebration Broadcast Modal
  const [qualificationCelebration, setQualificationCelebration] = useState<QualificationBroadcastData | null>(null);

  // Tournament Draw Ceremony & Scheduling Modals
  const [isDrawModalOpen, setIsDrawModalOpen] = useState<boolean>(false);
  const [scheduleModalMatch, setScheduleModalMatch] = useState<TournamentMatch | null>(null);
  const [showRedrawConfirmModal, setShowRedrawConfirmModal] = useState<boolean>(false);
  const [isRedrawing, setIsRedrawing] = useState<boolean>(false);

  // Live timer for live matches
  const [nowTime, setNowTime] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNowTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Check if any matches have started/concluded to enforce strict Draw Locking rule
  const hasMatchesStarted = useMemo(() => {
    return (tournament.matches || []).some(
      (m) =>
        m.status === 'LIVE' ||
        m.status === 'COMPLETED' ||
        m.status === 'CONFIRMED' ||
        m.status === 'PENDING_ADMIN_APPROVAL' ||
        (m.actualStartedAt !== undefined && m.actualStartedAt > 0)
    );
  }, [tournament.matches]);

  const handleRedrawClick = () => {
    if (!isAdmin) return;
    if (hasMatchesStarted) {
      showToast(
        'error',
        'Draw Locked',
        'Draw is locked because tournament matches have already started or concluded.'
      );
      return;
    }
    setShowRedrawConfirmModal(true);
  };

  const handleConfirmRedraw = async () => {
    setShowRedrawConfirmModal(false);
    setIsRedrawing(true);
    try {
      const res = await redrawTournamentBracket({
        tournamentId: tournament.id,
        adminId: currentUser?.id || 'admin',
        adminName: currentUser?.gamerTag || 'Tournament Admin',
        teamRegistrations,
      });

      if (res.success) {
        confetti({
          particleCount: 120,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#22d3ee', '#fbbf24', '#34d399', '#a855f7'],
        });
        showToast(
          'success',
          'Tournament Redrawn!',
          `Successfully redrew randomized matchups for ${confirmedTeams.length} confirmed teams!`
        );
        if (onRefreshTournament) onRefreshTournament();
      } else {
        showToast('error', 'Redraw Failed', res.error || 'Could not redraw tournament.');
      }
    } catch (err: any) {
      showToast('error', 'Redraw Error', err.message);
    } finally {
      setIsRedrawing(false);
    }
  };

  // Sync selected match with latest tournament data
  useEffect(() => {
    if (selectedMatch && tournament.matches) {
      const refreshed = tournament.matches.find((m) => m.id === selectedMatch.id);
      if (refreshed) {
        setSelectedMatch(refreshed);
      }
    }
  }, [tournament.matches]);

  // When opening a match modal, prepopulate inputs
  const handleOpenMatch = (match: TournamentMatch) => {
    setSelectedMatch(match);
    setShowDisputeInput(false);
    setDisputeReasonInput('');
    setStationInput(match.station || '');
    setNotesInput(match.adminNotes || match.submittedResult?.notes || '');

    if (match.submittedResult) {
      setScoreAInput(match.submittedResult.scoreA);
      setScoreBInput(match.submittedResult.scoreB);
      setSelectedWinnerId(match.submittedResult.winnerId);
    } else if (match.scoreA !== undefined && match.scoreB !== undefined) {
      setScoreAInput(match.scoreA);
      setScoreBInput(match.scoreB);
      setSelectedWinnerId(match.winnerId || '');
    } else {
      setScoreAInput(0);
      setScoreBInput(0);
      setSelectedWinnerId(match.participantA?.id || '');
    }
  };

  // Dynamic structure resolution
  const matches = useMemo(() => tournament.matches || [], [tournament.matches]);

  // Dynamically detect confirmed eligible teams according to official approval rules
  const confirmedTeams = useMemo(() => {
    return getEligibleConfirmedTournamentTeams(tournament, teamRegistrations);
  }, [tournament, teamRegistrations]);

  // Requirement 25: Print/debug detected tournament & confirmed team details on change
  useEffect(() => {
    console.log('=== [TOURNAMENT BRACKET ENGINE: DETECTED CONFIRMED TEAMS] ===');
    console.log('Tournament ID:', tournament.id);
    console.log('Tournament Name:', tournament.name);
    console.log('Confirmed Team Count:', confirmedTeams.length);
    console.log('Team IDs:', confirmedTeams.map((t) => t.id));
    console.log('Team Names:', confirmedTeams.map((t) => t.name));
  }, [tournament.id, tournament.name, confirmedTeams]);

  // Dynamic grouping of matches by round (excluding 3rd place match which has dedicated placement)
  const bracketRounds = useMemo(() => {
    const map: { [round: number]: TournamentMatch[] } = {};
    matches.forEach((m) => {
      const is3rd = m.id.includes('3rd') || m.roundName?.toLowerCase().includes('3rd');
      if (is3rd) return;
      const r = m.round || 1;
      if (!map[r]) map[r] = [];
      map[r].push(m);
    });

    const roundNums = Object.keys(map).map(Number).sort((a, b) => a - b);
    const totalRounds = roundNums.length;

    return roundNums.map((r) => {
      const roundMatches = map[r].sort((a, b) => (a.matchNumber || 0) - (b.matchNumber || 0));
      let stageName = `STAGE ${r}: ROUND ${r}`;
      let subTitle = `${roundMatches.length} Matches`;
      if (r === totalRounds) {
        stageName = totalRounds > 1 ? `STAGE ${r}: GRAND FINAL` : 'GRAND FINAL';
        subTitle = 'Championship Match';
      } else if (r === totalRounds - 1 && totalRounds >= 2) {
        stageName = `STAGE ${r}: SEMIFINALS`;
        subTitle = `${roundMatches.length} Semifinal Matches`;
      } else if (r === totalRounds - 2 && totalRounds >= 3) {
        stageName = `STAGE ${r}: QUARTERFINALS`;
        subTitle = `${roundMatches.length} Quarterfinal Matches`;
      } else if (r === totalRounds - 3 && totalRounds >= 4) {
        stageName = `STAGE ${r}: ROUND OF 16`;
        subTitle = `${roundMatches.length} Matches`;
      }

      return {
        roundNum: r,
        stageName,
        subTitle,
        matches: roundMatches,
        isFinalRound: r === totalRounds,
      };
    });
  }, [matches]);

  // 3rd place match if present in bracket
  const thirdPlaceMatch = useMemo(() => {
    return (
      matches.find(
        (m) =>
          m.id.includes('3rd') ||
          m.roundName?.toLowerCase().includes('3rd') ||
          m.roundName?.toLowerCase().includes('third')
      ) || null
    );
  }, [matches]);

  // Legacy convenience lookups for 4-team bracket compatibility
  const semiFinal1 = useMemo(() => {
    return (
      matches.find(
        (m) =>
          m.id.endsWith('_m_1_1') ||
          m.roundName?.toLowerCase().includes('semifinal 1') ||
          m.roundName?.toLowerCase().includes('semi-final 1') ||
          (m.round === 1 && m.matchNumber === 1)
      ) || matches[0] || null
    );
  }, [matches]);

  const semiFinal2 = useMemo(() => {
    return (
      matches.find(
        (m) =>
          m.id.endsWith('_m_1_2') ||
          m.roundName?.toLowerCase().includes('semifinal 2') ||
          m.roundName?.toLowerCase().includes('semi-final 2') ||
          (m.round === 1 && m.matchNumber === 2)
      ) || matches[1] || null
    );
  }, [matches]);

  const grandFinal = useMemo(() => {
    return (
      matches.find(
        (m) =>
          m.id.endsWith('_m_2_1') ||
          (m.roundName?.toLowerCase().includes('final') &&
            !m.roundName?.toLowerCase().includes('semi') &&
            !m.roundName?.toLowerCase().includes('3rd')) ||
          (m.round === (bracketRounds.length || 2) && !m.id.includes('3rd'))
      ) || matches[2] || null
    );
  }, [matches, bracketRounds]);

  // Check if current bracket is initialized
  const isBracketComplete = matches.length > 0;

  // Status counters
  const liveMatchesCount = matches.filter((m) => m.status === 'LIVE').length;
  const pendingApprovalCount = matches.filter(
    (m) => m.status === 'AWAITING_CONFIRMATION' || m.status === 'PENDING_ADMIN_APPROVAL'
  ).length;
  const completedMatchesCount = matches.filter((m) => m.status === 'COMPLETED' || m.status === 'CONFIRMED').length;

  // Podium resolution
  const championTeam = useMemo(() => {
    if (grandFinal && (grandFinal.status === 'COMPLETED' || grandFinal.status === 'CONFIRMED') && grandFinal.winnerId) {
      return grandFinal.winnerId === grandFinal.participantA?.id ? grandFinal.participantA : grandFinal.participantB;
    }
    if (tournament.winnerId && tournament.winnerParticipant) return tournament.winnerParticipant;
    if (tournament.winnerName) return { id: tournament.winnerId || 'winner', name: tournament.winnerName, type: 'TEAM' } as TournamentParticipant;
    return null;
  }, [grandFinal, tournament]);

  const runnerUpTeam = useMemo(() => {
    if (grandFinal && (grandFinal.status === 'COMPLETED' || grandFinal.status === 'CONFIRMED') && grandFinal.loserId) {
      return grandFinal.loserId === grandFinal.participantA?.id ? grandFinal.participantA : grandFinal.participantB;
    }
    if (tournament.runnerUpId && tournament.runnerUpParticipant) return tournament.runnerUpParticipant;
    if (tournament.runnerUpName) return { id: tournament.runnerUpId || 'runnerUp', name: tournament.runnerUpName, type: 'TEAM' } as TournamentParticipant;
    return null;
  }, [grandFinal, tournament]);

  const thirdPlaceTeam = useMemo(() => {
    if (thirdPlaceMatch && (thirdPlaceMatch.status === 'COMPLETED' || thirdPlaceMatch.status === 'CONFIRMED') && thirdPlaceMatch.winnerId) {
      return thirdPlaceMatch.winnerId === thirdPlaceMatch.participantA?.id ? thirdPlaceMatch.participantA : thirdPlaceMatch.participantB;
    }
    if (tournament.thirdPlaceId && tournament.thirdPlaceParticipant) return tournament.thirdPlaceParticipant;
    if (tournament.thirdPlaceName) return { id: tournament.thirdPlaceId || 'thirdPlace', name: tournament.thirdPlaceName, type: 'TEAM' } as TournamentParticipant;
    return null;
  }, [thirdPlaceMatch, tournament]);

  const fourthPlaceTeam = useMemo(() => {
    if (thirdPlaceMatch && (thirdPlaceMatch.status === 'COMPLETED' || thirdPlaceMatch.status === 'CONFIRMED') && thirdPlaceMatch.loserId) {
      return thirdPlaceMatch.loserId === thirdPlaceMatch.participantA?.id ? thirdPlaceMatch.participantA : thirdPlaceMatch.participantB;
    }
    return null;
  }, [thirdPlaceMatch]);

  // Helper to find full squad registration details (including 5 players) for a participant
  const getTeamRoster = (participantId?: string) => {
    if (!participantId) return null;
    return teamRegistrations.find((r) => r.teamId === participantId || r.id === participantId);
  };

  // Auto-Generate / Seed Dynamic Tournament Bracket
  const handleGenerateDynamicBracket = async () => {
    if (!isAdmin) {
      showToast('error', 'Admin Required', 'Only tournament administrators can generate or reset the bracket.');
      return;
    }

    setGeneratingBracket(true);
    try {
      const eligibleTeams = getEligibleConfirmedTournamentTeams(tournament, teamRegistrations);

      if (eligibleTeams.length < 2) {
        showToast(
          'error',
          'Insufficient Teams',
          `At least 2 confirmed teams are required to seed a bracket (currently ${eligibleTeams.length}).`
        );
        return;
      }

      console.log('=== [SEEDING DYNAMIC TOURNAMENT BRACKET] ===');
      console.log('Tournament ID:', tournament.id);
      console.log('Eligible Teams Count:', eligibleTeams.length);
      console.log('Eligible Teams:', eligibleTeams.map((t) => ({ id: t.id, name: t.name, seed: t.seed })));

      const newMatches = generateTournamentBracket(
        tournament.id,
        eligibleTeams,
        tournament.format || 'SINGLE_ELIMINATION'
      );
      const res = await saveTournamentBracket(tournament.id, newMatches);

      if (res.success) {
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#22d3ee', '#fbbf24', '#34d399', '#a855f7'],
        });
        showToast(
          'success',
          'Bracket Seeded',
          `Successfully generated dynamic bracket for ${eligibleTeams.length} teams (${newMatches.length} matches)!`
        );
        if (onRefreshTournament) onRefreshTournament();
      } else {
        showToast('error', 'Generation Error', res.error || 'Failed to save bracket.');
      }
    } catch (err: any) {
      showToast('error', 'Generation Error', err.message || 'Failed to seed bracket.');
    } finally {
      setGeneratingBracket(false);
    }
  };

  // Match Action Handlers
  const handleStartMatch = async (match: TournamentMatch) => {
    setActionLoading(true);
    try {
      const res = await adminStartTournamentMatch({
        tournamentId: tournament.id,
        matchId: match.id,
        station: stationInput || match.station,
        adminId: currentUser?.id || 'admin',
        adminName: currentUser?.gamerTag || 'Tournament Admin',
      });
      if (res.success) {
        showToast('success', 'Match Live!', `Match #${match.matchNumber} (${match.roundName}) is now officially LIVE.`);
        if (onRefreshTournament) onRefreshTournament();
      } else {
        showToast('error', 'Failed to Start', res.error || 'Could not start match.');
      }
    } catch (err: any) {
      showToast('error', 'Error', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSubmitScore = async (match: TournamentMatch) => {
    if (!selectedWinnerId) {
      showToast('error', 'Winner Required', 'Please select which team or player won the match.');
      return;
    }

    setActionLoading(true);
    try {
      const res = await submitTournamentMatchResult({
        tournamentId: tournament.id,
        matchId: match.id,
        scoreA: Number(scoreAInput),
        scoreB: Number(scoreBInput),
        winnerId: selectedWinnerId,
        submittedBy: currentUser?.id || 'referee',
        submittedByName: currentUser?.gamerTag || 'Match Referee',
        notes: notesInput || undefined,
      });

      if (res.success) {
        showToast('success', 'Result Submitted', 'Scores submitted successfully! Awaiting Admin verification before progression.');
        if (onRefreshTournament) onRefreshTournament();
      } else {
        showToast('error', 'Submission Failed', res.error || 'Could not submit match scores.');
      }
    } catch (err: any) {
      showToast('error', 'Error', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleApproveResult = async (match: TournamentMatch) => {
    if (!isAdmin) {
      showToast('error', 'Admin Access Required', 'Only tournament administrators can verify and approve official results.');
      return;
    }

    setActionLoading(true);
    try {
      const res = await adminApproveTournamentMatchResult({
        tournamentId: tournament.id,
        matchId: match.id,
        adminId: currentUser?.id || 'admin',
        adminName: currentUser?.gamerTag || 'Admin',
        overrideScores: {
          scoreA: Number(scoreAInput),
          scoreB: Number(scoreBInput),
          winnerId: selectedWinnerId,
        },
        station: stationInput || match.station,
        notes: notesInput,
      });

      if (res.success) {
        confetti({
          particleCount: 140,
          spread: 80,
          origin: { y: 0.5 },
          colors: ['#22d3ee', '#fbbf24', '#34d399', '#f43f5e'],
        });

        const winnerObj = selectedWinnerId === match.participantA?.id ? match.participantA : match.participantB;
        const loserObj = selectedWinnerId === match.participantA?.id ? match.participantB : match.participantA;
        const isChamp = match.round === bracketRounds.length && !match.roundName?.toLowerCase().includes('3rd');
        const isSemi = !isChamp && (match.roundName?.toLowerCase().includes('semi') || match.loserMatchId !== undefined);

        const nextM = matches.find((m) => m.id === match.nextMatchId);
        let nextOpp: string | undefined;
        if (nextM) {
          if (match.nextMatchSlot === 'A') {
            nextOpp = nextM.participantB?.name;
          } else {
            nextOpp = nextM.participantA?.name;
          }
        }

        const nextDate = nextM?.scheduledTime
          ? new Date(nextM.scheduledTime).toLocaleDateString([], { month: 'short', day: 'numeric' })
          : undefined;
        const nextTime = nextM?.scheduledTime
          ? new Date(nextM.scheduledTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : undefined;

        setQualificationCelebration({
          match,
          winnerName: winnerObj?.name || 'Winner',
          winnerTag: winnerObj?.tag,
          winnerAvatar: winnerObj?.avatarUrl,
          loserName: loserObj?.name || 'Opponent',
          loserTag: loserObj?.tag,
          loserAvatar: loserObj?.avatarUrl,
          scoreA: Number(scoreAInput),
          scoreB: Number(scoreBInput),
          roundName: match.roundName || `Match #${match.matchNumber}`,
          nextRoundName: isChamp ? 'TOURNAMENT CHAMPION' : nextM?.roundName || 'THE FINAL',
          nextMatchDate: nextDate,
          nextMatchTime: nextTime,
          isSemiFinal: isSemi,
          isChampionship: isChamp,
          approvedByName: currentUser?.gamerTag || 'Tournament Admin',
          nextOpponentName: nextOpp,
        });

        showToast('success', 'Official Result Approved!', `Match #${match.matchNumber} is confirmed. Winner officially advanced!`);
        setSelectedMatch(null);
        if (onRefreshTournament) onRefreshTournament();
      } else {
        showToast('error', 'Approval Error', res.error || 'Could not approve match result.');
      }
    } catch (err: any) {
      showToast('error', 'Error', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectResult = async (match: TournamentMatch) => {
    if (!isAdmin) return;
    if (!disputeReasonInput.trim()) {
      showToast('error', 'Reason Required', 'Please provide a reason for disputing or rejecting this score submission.');
      return;
    }

    setActionLoading(true);
    try {
      const res = await adminRejectTournamentMatchResult({
        tournamentId: tournament.id,
        matchId: match.id,
        adminId: currentUser?.id || 'admin',
        adminName: currentUser?.gamerTag || 'Admin',
        reason: disputeReasonInput.trim(),
      });

      if (res.success) {
        showToast('info', 'Result Disputed', `Match result was rejected and marked as disputed.`);
        setShowDisputeInput(false);
        if (onRefreshTournament) onRefreshTournament();
      } else {
        showToast('error', 'Error', res.error || 'Failed to reject result.');
      }
    } catch (err: any) {
      showToast('error', 'Error', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleForceEnd = async (match: TournamentMatch) => {
    if (!isAdmin) return;
    if (!selectedWinnerId) {
      showToast('error', 'Winner Required', 'Please select a winner to conclude the match.');
      return;
    }

    setActionLoading(true);
    try {
      const res = await adminForceEndTournamentMatch({
        tournamentId: tournament.id,
        matchId: match.id,
        scoreA: Number(scoreAInput),
        scoreB: Number(scoreBInput),
        winnerId: selectedWinnerId,
        adminId: currentUser?.id || 'admin',
        adminName: currentUser?.gamerTag || 'Admin',
        station: stationInput || match.station,
        reason: notesInput || 'Concluded by tournament administrator',
      });

      if (res.success) {
        showToast('success', 'Match Force Ended', `Match #${match.matchNumber} result finalized and officially approved.`);
        if (onRefreshTournament) onRefreshTournament();
      } else {
        showToast('error', 'Action Failed', res.error);
      }
    } catch (err: any) {
      showToast('error', 'Error', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleResetMatch = async (match: TournamentMatch) => {
    if (!isAdmin) return;
    if (!confirm('Are you sure you want to reset this match? This will clear scores, un-advance participants, and return the match to READY.')) {
      return;
    }

    setActionLoading(true);
    try {
      const res = await adminResetTournamentMatch({
        tournamentId: tournament.id,
        matchId: match.id,
        adminId: currentUser?.id || 'admin',
        adminName: currentUser?.gamerTag || 'Admin',
      });

      if (res.success) {
        showToast('info', 'Match Reset', `Match #${match.matchNumber} has been reset.`);
        if (onRefreshTournament) onRefreshTournament();
      } else {
        showToast('error', 'Reset Failed', res.error);
      }
    } catch (err: any) {
      showToast('error', 'Error', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Format duration helper
  const formatDuration = (seconds?: number, startedAt?: number, endedAt?: number) => {
    if (seconds) {
      const m = Math.floor(seconds / 60);
      const s = seconds % 60;
      return `${m}m ${s < 10 ? '0' : ''}${s}s`;
    }
    if (startedAt) {
      const end = endedAt || nowTime;
      const elapsed = Math.max(0, Math.floor((end - startedAt) / 1000));
      const m = Math.floor(elapsed / 60);
      const s = elapsed % 60;
      return `${m}m ${s < 10 ? '0' : ''}${s}s`;
    }
    return null;
  };

  return (
    <div className="space-y-6">
      {/* Top Map Header & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-5 rounded-3xl bg-[#090b12] border border-slate-800 shadow-xl">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-500/20 via-indigo-500/20 to-purple-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.25)]">
            <Gamepad2 className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg sm:text-xl font-black font-display text-white uppercase tracking-tight flex items-center gap-2">
                <span>INTERACTIVE MATCH MAP</span>
                <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 font-bold">
                  {confirmedTeams.length > 0 ? `${confirmedTeams.length}-TEAM KNOCKOUT` : 'TOURNAMENT BRACKET'}
                </span>
              </h2>
            </div>
            <p className="text-xs text-slate-400 font-mono mt-0.5 flex items-center gap-2 flex-wrap">
              <span>{confirmedTeams.length} Confirmed Teams</span>
              <span className="text-slate-600">•</span>
              <span>{matches.length > 0 ? `${bracketRounds.length} Stages • ${matches.length} Matches` : 'Ready to Seed'}</span>
              <span className="text-slate-600">•</span>
              <span className="text-cyan-300">Click any match card to open Match Center & Rosters</span>
            </p>
          </div>
        </div>

        {/* Live Counters & Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {liveMatchesCount > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-red-500/10 border border-red-500/40 text-red-400 text-xs font-mono font-bold animate-pulse">
              <Radio className="w-3.5 h-3.5" />
              <span>{liveMatchesCount} LIVE</span>
            </div>
          )}

          {pendingApprovalCount > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/40 text-amber-300 text-xs font-mono font-bold">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span>{pendingApprovalCount} Awaiting Admin</span>
            </div>
          )}

          {/* View Toggles */}
          <div className="flex items-center bg-slate-900/80 p-1 rounded-2xl border border-slate-800">
            <button
              onClick={() => setViewMode('MAP')}
              className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold uppercase transition-all ${
                viewMode === 'MAP'
                  ? 'bg-cyan-500 text-black shadow-[0_0_12px_rgba(6,182,212,0.4)]'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Graph Map
            </button>
            <button
              onClick={() => setViewMode('CARDS')}
              className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold uppercase transition-all ${
                viewMode === 'CARDS'
                  ? 'bg-cyan-500 text-black shadow-[0_0_12px_rgba(6,182,212,0.4)]'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              List View
            </button>
          </div>

          {/* Admin Tournament Draw & Redraw Controls */}
          {isAdmin && (
            <div className="flex items-center gap-2 flex-wrap">
              {/* RANDOMIZE DRAW (Opens Esports Draw Ceremony) */}
              <button
                type="button"
                onClick={() => setIsDrawModalOpen(true)}
                disabled={confirmedTeams.length < 2}
                className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black text-xs font-mono font-black uppercase tracking-wider flex items-center gap-1.5 shadow-[0_0_15px_rgba(6,182,212,0.35)] disabled:opacity-50 transition-all cursor-pointer"
              >
                <Dices className="w-4 h-4" />
                <span>🎲 RANDOMIZE DRAW</span>
              </button>

              {/* REDRAW TOURNAMENT (Subject to Strict Lock Rule) */}
              {matches.length > 0 && (
                hasMatchesStarted ? (
                  <button
                    type="button"
                    onClick={handleRedrawClick}
                    title="Draw is locked because tournament matches have started."
                    className="px-3.5 py-2 rounded-xl bg-slate-800/70 border border-slate-700/60 text-slate-500 text-xs font-mono font-bold uppercase flex items-center gap-1.5 cursor-not-allowed transition-all"
                  >
                    <Lock className="w-3.5 h-3.5 text-slate-500" />
                    <span>Draw Locked (Live/Played)</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleRedrawClick}
                    disabled={isRedrawing}
                    className="px-3.5 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 text-xs font-mono font-bold uppercase flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isRedrawing ? 'animate-spin' : ''}`} />
                    <span>🔄 REDRAW TOURNAMENT</span>
                  </button>
                )
              )}
            </div>
          )}

          {/* Champion Podium Toggle */}
          {championTeam && (
            <button
              onClick={() => setShowPodium(!showPodium)}
              className={`px-3 py-1.5 rounded-xl border text-xs font-mono font-bold flex items-center gap-1.5 transition-all ${
                showPodium
                  ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/50'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              <Trophy className="w-3.5 h-3.5 text-yellow-400" />
              <span>{showPodium ? 'Hide Podium' : 'Show Champion Podium'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Champion Podium Display (if Final match completed) */}
      {showPodium && championTeam && (
        <ChampionPodiumCard
          champion={championTeam}
          runnerUp={runnerUpTeam}
          thirdPlace={thirdPlaceTeam}
          fourthPlace={fourthPlaceTeam}
          tournament={tournament}
          teamRegistrations={teamRegistrations}
          onSelectParticipant={onSelectParticipant}
        />
      )}

      {/* Bracket Uninitialized Alert */}
      {matches.length === 0 ? (
        <div className="p-12 rounded-3xl bg-[#090b12] border border-dashed border-slate-800 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center mx-auto text-cyan-400">
            <Gamepad2 className="w-7 h-7" />
          </div>
          <div className="space-y-1 max-w-md mx-auto">
            <h3 className="text-base font-bold text-white font-display uppercase tracking-wide">
              {confirmedTeams.length}-Team Bracket Ready To Be Seeded
            </h3>
            <p className="text-xs text-slate-400 font-mono leading-relaxed">
              {confirmedTeams.length >= 2
                ? `${confirmedTeams.length} eligible teams are confirmed! Generate the official interactive tournament map to begin.`
                : `${confirmedTeams.length} team(s) confirmed. At least 2 confirmed teams are required before seeding the tournament bracket.`}
            </p>
          </div>
          {isAdmin && (
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <button
                type="button"
                onClick={() => setIsDrawModalOpen(true)}
                disabled={confirmedTeams.length < 2}
                className="px-6 py-3.5 rounded-2xl bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-black text-xs font-mono font-black uppercase tracking-wider transition-all shadow-[0_0_25px_rgba(34,211,238,0.4)] inline-flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Dices className="w-4 h-4" />
                <span>🎲 RANDOMIZE DRAW ({confirmedTeams.length} TEAMS)</span>
              </button>

              <button
                type="button"
                onClick={handleGenerateDynamicBracket}
                disabled={generatingBracket || confirmedTeams.length < 2}
                className="px-5 py-3.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono font-bold uppercase tracking-wider transition-all inline-flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Zap className="w-4 h-4" />
                <span>
                  {generatingBracket ? 'Seeding...' : 'Default Seeding'}
                </span>
              </button>
            </div>
          )}
        </div>
      ) : viewMode === 'MAP' ? (
        /* ============================================================ */
        /* DYNAMIC INTERACTIVE TOURNAMENT MATCH MAP GRAPH               */
        /* ============================================================ */
        <div className="relative overflow-x-auto pb-4">
          <div
            className="p-6 rounded-3xl bg-[#07090e] border border-slate-800/90 shadow-2xl relative"
            style={{ minWidth: `${Math.max(850, bracketRounds.length * 380)}px` }}
          >
            {/* Background Grid Accent */}
            <div
              className="absolute inset-0 opacity-[0.03] pointer-events-none rounded-3xl"
              style={{
                backgroundImage: `radial-gradient(#38bdf8 1px, transparent 1px)`,
                backgroundSize: '24px 24px',
              }}
            />

            {/* Top Stage Headers Grid */}
            <div
              className="grid gap-8 mb-6 relative z-10"
              style={{
                gridTemplateColumns: `repeat(${bracketRounds.length}, minmax(0, 1fr))`,
              }}
            >
              {bracketRounds.map((round) => (
                <div
                  key={round.roundNum}
                  className="flex items-center justify-between border-b border-slate-800 pb-2.5"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        round.isFinalRound
                          ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]'
                          : 'bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]'
                      }`}
                    />
                    <span
                      className={`text-xs font-mono font-black uppercase tracking-widest ${
                        round.isFinalRound ? 'text-amber-400' : 'text-cyan-400'
                      }`}
                    >
                      {round.stageName}
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-slate-500">{round.subTitle}</span>
                </div>
              ))}
            </div>

            {/* Stage Columns Grid */}
            <div
              className="grid gap-8 relative z-10 items-stretch"
              style={{
                gridTemplateColumns: `repeat(${bracketRounds.length}, minmax(0, 1fr))`,
              }}
            >
              {bracketRounds.map((round) => {
                const isFinalCol = round.isFinalRound;
                return (
                  <div
                    key={round.roundNum}
                    className="flex flex-col justify-around space-y-8 min-h-[420px]"
                  >
                    {round.matches.map((m) => {
                      const isChampionship = isFinalCol && !m.id.includes('3rd');
                      return (
                        <div key={m.id} className="relative group">
                          <div className="flex items-center justify-between mb-1.5 px-1">
                            <span
                              className={`text-[11px] font-mono font-black uppercase flex items-center gap-1.5 ${
                                isChampionship ? 'text-yellow-400' : 'text-cyan-400'
                              }`}
                            >
                              {isChampionship && <Trophy className="w-3.5 h-3.5 text-yellow-400" />}
                              <span>{m.roundName || `MATCH #${m.matchNumber}`}</span>
                              <span className="text-slate-600">•</span>
                              <span className="text-slate-400 text-[10px]">
                                MATCH #{m.matchNumber}
                              </span>
                            </span>
                            <span className="text-[10px] font-mono text-slate-500">
                              {isChampionship
                                ? '1st & 2nd Place'
                                : round.roundNum === bracketRounds.length - 1 && thirdPlaceMatch
                                ? 'Winner → Final • Loser → 3rd'
                                : 'Winner Advances'}
                            </span>
                          </div>

                          <MatchNodeCard
                            match={m}
                            isChampionship={isChampionship}
                            onClick={() => handleOpenMatch(m)}
                            nowTime={nowTime}
                            isAdmin={isAdmin}
                            allMatches={matches}
                            totalRounds={bracketRounds.length}
                            onScheduleClick={(matchToSchedule) => setScheduleModalMatch(matchToSchedule)}
                          />
                        </div>
                      );
                    })}

                    {/* If this is the final round column, also render 3rd place match if present! */}
                    {isFinalCol && thirdPlaceMatch && (
                      <div className="relative group mt-6 pt-6 border-t border-slate-800/80">
                        <div className="flex items-center justify-between mb-1.5 px-1">
                          <span className="text-[11px] font-mono font-black uppercase text-amber-500 flex items-center gap-1.5">
                            <Medal className="w-3.5 h-3.5 text-amber-500" />
                            <span>{thirdPlaceMatch.roundName || '3RD PLACE MATCH'}</span>
                            <span className="text-slate-600">•</span>
                            <span className="text-slate-400 text-[10px]">
                              MATCH #{thirdPlaceMatch.matchNumber}
                            </span>
                          </span>
                          <span className="text-[10px] font-mono text-slate-500">
                            Bronze Decider
                          </span>
                        </div>

                        <MatchNodeCard
                          match={thirdPlaceMatch}
                          isThirdPlace={true}
                          onClick={() => handleOpenMatch(thirdPlaceMatch)}
                          nowTime={nowTime}
                          isAdmin={isAdmin}
                          allMatches={matches}
                          totalRounds={bracketRounds.length}
                          onScheduleClick={(matchToSchedule) => setScheduleModalMatch(matchToSchedule)}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Bottom Legend & Status Guidelines */}
            <div className="mt-8 pt-4 border-t border-slate-800 flex flex-wrap items-center justify-between gap-4 text-[11px] font-mono text-slate-400">
              <div className="flex items-center gap-4 flex-wrap">
                <span className="font-bold text-white uppercase text-[10px] tracking-wider">Status Legend:</span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-slate-500" />
                  <span>Upcoming / Ready</span>
                </span>
                <span className="inline-flex items-center gap-1.5 text-red-400 font-bold">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                  <span>Live Now</span>
                </span>
                <span className="inline-flex items-center gap-1.5 text-amber-300 font-bold">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  <span>Pending Admin Approval</span>
                </span>
                <span className="inline-flex items-center gap-1.5 text-emerald-400 font-bold">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span>Official Result Confirmed</span>
                </span>
              </div>

              <div className="text-slate-500 text-[10px]">
                Official Rule: Winner advances only after Admin verifies and approves scores.
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ============================================================ */
        /* ALTERNATIVE GRID / LIST VIEW OF MATCHES                      */
        /* ============================================================ */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {matches.map((m) => (
            <MatchNodeCard
              key={m.id}
              match={m}
              onClick={() => handleOpenMatch(m)}
              nowTime={nowTime}
              isAdmin={isAdmin}
              onScheduleClick={(matchToSchedule) => setScheduleModalMatch(matchToSchedule)}
            />
          ))}
        </div>
      )}

      {/* ============================================================ */}
      {/* DETAILED INTERACTIVE MATCH CENTER MODAL                      */}
      {/* ============================================================ */}
      {selectedMatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto bg-black/85 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-3xl rounded-3xl bg-[#0c0e17] border border-slate-800 shadow-[0_0_50px_rgba(0,0,0,0.8)] overflow-hidden space-y-6 my-8">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-800 flex items-start justify-between gap-4 bg-slate-900/40">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2.5 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-mono font-bold uppercase">
                    MATCH #{selectedMatch.matchNumber}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 text-xs font-mono font-bold uppercase">
                    {selectedMatch.roundName || `ROUND ${selectedMatch.round}`}
                  </span>
                  {selectedMatch.station && (
                    <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs font-mono">
                      Station: {selectedMatch.station}
                    </span>
                  )}
                </div>
                <h3 className="text-xl font-black font-display text-white uppercase tracking-tight">
                  {selectedMatch.participantA?.name || 'TBD'} vs {selectedMatch.participantB?.name || 'TBD'}
                </h3>
              </div>

              <button
                onClick={() => setSelectedMatch(null)}
                className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 space-y-6">
              {/* Match Status Hero Banner */}
              <div className="p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#080a11] border-slate-800">
                <div className="flex items-center gap-3">
                  {selectedMatch.status === 'LIVE' ? (
                    <div className="w-10 h-10 rounded-xl bg-red-500/20 border border-red-500/40 flex items-center justify-center text-red-400 animate-pulse">
                      <Radio className="w-5 h-5" />
                    </div>
                  ) : selectedMatch.status === 'AWAITING_CONFIRMATION' || selectedMatch.status === 'PENDING_ADMIN_APPROVAL' ? (
                    <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-300">
                      <Clock className="w-5 h-5" />
                    </div>
                  ) : selectedMatch.status === 'COMPLETED' || selectedMatch.status === 'CONFIRMED' ? (
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                  ) : (
                    <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-slate-400">
                      <Clock className="w-5 h-5" />
                    </div>
                  )}

                  <div>
                    <div className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400">
                      Current Match Status
                    </div>
                    <div className="text-sm sm:text-base font-black font-display text-white">
                      {selectedMatch.status === 'AWAITING_CONFIRMATION' || selectedMatch.status === 'PENDING_ADMIN_APPROVAL'
                        ? '⏳ PENDING ADMIN APPROVAL'
                        : selectedMatch.status === 'LIVE'
                        ? '🔴 LIVE IN PROGRESS'
                        : selectedMatch.status === 'COMPLETED' || selectedMatch.status === 'CONFIRMED'
                        ? '✅ OFFICIAL RESULT CONFIRMED'
                        : selectedMatch.status === 'DISPUTED'
                        ? '⚠️ RESULT DISPUTED'
                        : 'READY TO PLAY'}
                    </div>
                  </div>
                </div>

                {/* Match Duration & Timing */}
                <div className="text-left sm:text-right text-xs font-mono space-y-0.5">
                  {(selectedMatch.status === 'LIVE' || selectedMatch.durationSeconds || selectedMatch.actualStartedAt) && (
                    <div className="flex items-center sm:justify-end gap-1.5 text-cyan-400 font-bold">
                      <Clock className="w-3.5 h-3.5" />
                      <span>
                        Elapsed: {formatDuration(selectedMatch.durationSeconds, selectedMatch.actualStartedAt, selectedMatch.actualEndedAt)}
                      </span>
                    </div>
                  )}
                  {selectedMatch.actualStartedAt && (
                    <div className="text-slate-500 text-[10px]">
                      Started: {new Date(selectedMatch.actualStartedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  )}
                </div>
              </div>

              {/* MATCH SCHEDULE (DATE, TIME & STATION) BANNER */}
              <div className="p-3.5 rounded-2xl bg-[#090d19] border border-slate-800 flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-4 flex-wrap text-xs font-mono">
                  <div className="flex items-center gap-1.5 text-cyan-300 font-bold">
                    <Calendar className="w-4 h-4 text-cyan-400" />
                    <span>
                      {selectedMatch.scheduledTime
                        ? new Date(selectedMatch.scheduledTime).toLocaleDateString([], {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })
                        : 'Date: Not Set'}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 text-white font-bold">
                    <Clock className="w-4 h-4 text-cyan-400" />
                    <span>
                      {selectedMatch.scheduledTime
                        ? new Date(selectedMatch.scheduledTime).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : 'Time: Not Set'}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 text-slate-300">
                    <span className="text-slate-500 font-bold">STATION:</span>
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-cyan-300 border border-slate-700 font-bold">
                      {selectedMatch.station || 'Unassigned'}
                    </span>
                  </div>
                </div>

                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => setScheduleModalMatch(selectedMatch)}
                    className="px-3 py-1.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 text-xs font-mono font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Calendar className="w-3.5 h-3.5" />
                    <span>Assign Date & Time</span>
                  </button>
                )}
              </div>

              {/* 5v5 ROSTER COMPARISON SIDE-BY-SIDE */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* TEAM A */}
                <TeamRosterBox
                  participant={selectedMatch.participantA}
                  score={selectedMatch.scoreA}
                  isWinner={selectedMatch.winnerId === selectedMatch.participantA?.id}
                  isClaimedWinner={selectedMatch.submittedResult?.winnerId === selectedMatch.participantA?.id}
                  roster={getTeamRoster(selectedMatch.participantA?.id)}
                  slotLabel="SLOT A"
                />

                {/* TEAM B */}
                <TeamRosterBox
                  participant={selectedMatch.participantB}
                  score={selectedMatch.scoreB}
                  isWinner={selectedMatch.winnerId === selectedMatch.participantB?.id}
                  isClaimedWinner={selectedMatch.submittedResult?.winnerId === selectedMatch.participantB?.id}
                  roster={getTeamRoster(selectedMatch.participantB?.id)}
                  slotLabel="SLOT B"
                />
              </div>

              {/* RESULT DETAILS OR SUBMISSION BANNER */}
              {selectedMatch.submittedResult && (
                <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs font-mono space-y-2">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <span className="font-bold flex items-center gap-1.5 text-amber-300">
                      <Clock className="w-4 h-4" />
                      Submitted Result Pending Verification:
                    </span>
                    <span className="text-[11px] text-amber-400/80">
                      By {selectedMatch.submittedResult.submittedByName || 'Player'} at{' '}
                      {new Date(selectedMatch.submittedResult.submittedAt || Date.now()).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="text-sm font-bold text-white flex items-center gap-3">
                    <span>
                      Claimed Score: {selectedMatch.participantA?.name} ({selectedMatch.submittedResult.scoreA}) - (
                      {selectedMatch.submittedResult.scoreB}) {selectedMatch.participantB?.name}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 text-xs">
                      Winner: {selectedMatch.submittedResult.winnerName}
                    </span>
                  </div>
                  {selectedMatch.submittedResult.notes && (
                    <div className="text-[11px] text-slate-300 italic">
                      "{selectedMatch.submittedResult.notes}"
                    </div>
                  )}
                </div>
              )}

              {/* ADMIN APPROVAL AUDIT STAMP */}
              {selectedMatch.adminApproved && selectedMatch.adminApprovedByName && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-mono flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>Verified by Admin: {selectedMatch.adminApprovedByName}</span>
                  </span>
                  <span className="text-slate-400 text-[10px]">
                    {new Date(selectedMatch.adminApprovedAt || selectedMatch.completedAt || Date.now()).toLocaleString()}
                  </span>
                </div>
              )}

              {/* DISPUTE BANNER */}
              {selectedMatch.status === 'DISPUTED' && selectedMatch.disputeReason && (
                <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-200 text-xs font-mono space-y-1">
                  <div className="font-bold flex items-center gap-1.5 text-rose-300">
                    <AlertTriangle className="w-4 h-4 text-rose-400" />
                    Match Result Disputed by Admin:
                  </div>
                  <p className="text-slate-300">{selectedMatch.disputeReason}</p>
                </div>
              )}

              {/* ACTION CENTER */}
              <div className="p-5 rounded-2xl bg-[#090b12] border border-slate-800 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                    <Zap className="w-4 h-4 text-cyan-400" />
                    <span>Match Actions & Result Reporting</span>
                  </h4>
                  {isAdmin && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                      Admin Referee Controls
                    </span>
                  )}
                </div>

                {/* State A: UPCOMING / READY */}
                {(selectedMatch.status === 'SCHEDULED' || selectedMatch.status === 'READY') && (
                  <div className="space-y-4">
                    {isAdmin ? (
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                        <div className="flex-1">
                          <label className="block text-[10px] font-mono text-slate-400 uppercase mb-1">
                            Assign Station / Server
                          </label>
                          <input
                            type="text"
                            value={stationInput}
                            onChange={(e) => setStationInput(e.target.value)}
                            placeholder="e.g. Station 1, Server NA-East"
                            className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs font-mono focus:border-cyan-500 outline-none"
                          />
                        </div>
                        <button
                          onClick={() => handleStartMatch(selectedMatch)}
                          disabled={actionLoading || !selectedMatch.participantA || !selectedMatch.participantB}
                          className="px-6 py-2.5 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-black text-xs font-mono font-black uppercase flex items-center justify-center gap-2 transition-all shadow-[0_0_15px_rgba(34,211,238,0.3)] disabled:opacity-50 mt-auto"
                        >
                          <Play className="w-4 h-4 fill-current" />
                          <span>Start Match Now</span>
                        </button>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 font-mono">
                        This match is currently scheduled. Once both teams are ready, the referee will launch the match.
                      </p>
                    )}
                  </div>
                )}

                {/* State B: LIVE or State C: PENDING APPROVAL or ADMIN EDIT */}
                {(selectedMatch.status === 'LIVE' ||
                  selectedMatch.status === 'AWAITING_CONFIRMATION' ||
                  selectedMatch.status === 'PENDING_ADMIN_APPROVAL' ||
                  selectedMatch.status === 'DISPUTED' ||
                  isAdmin) &&
                  selectedMatch.status !== 'COMPLETED' &&
                  selectedMatch.status !== 'CONFIRMED' && (
                    <div className="space-y-4 pt-2 border-t border-slate-800/80">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[10px] font-mono text-slate-400 uppercase mb-1 truncate">
                            {selectedMatch.participantA?.name || 'Team A'} Score
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={scoreAInput}
                            onChange={(e) => setScoreAInput(Number(e.target.value))}
                            className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono font-bold text-center text-base focus:border-cyan-500 outline-none"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-mono text-slate-400 uppercase mb-1 truncate">
                            {selectedMatch.participantB?.name || 'Team B'} Score
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={scoreBInput}
                            onChange={(e) => setScoreBInput(Number(e.target.value))}
                            className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono font-bold text-center text-base focus:border-cyan-500 outline-none"
                          />
                        </div>
                      </div>

                      {/* Select Winner Buttons */}
                      <div>
                        <label className="block text-[10px] font-mono text-slate-400 uppercase mb-1.5">
                          Select Declared Winner:
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                          <button
                            type="button"
                            onClick={() => setSelectedWinnerId(selectedMatch.participantA?.id || '')}
                            disabled={!selectedMatch.participantA}
                            className={`p-3 rounded-xl border text-xs font-mono font-bold flex items-center justify-center gap-2 transition-all ${
                              selectedWinnerId === selectedMatch.participantA?.id
                                ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.2)]'
                                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                            }`}
                          >
                            <Crown className="w-3.5 h-3.5" />
                            <span className="truncate">{selectedMatch.participantA?.name || 'Team A'} Wins</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setSelectedWinnerId(selectedMatch.participantB?.id || '')}
                            disabled={!selectedMatch.participantB}
                            className={`p-3 rounded-xl border text-xs font-mono font-bold flex items-center justify-center gap-2 transition-all ${
                              selectedWinnerId === selectedMatch.participantB?.id
                                ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.2)]'
                                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                            }`}
                          >
                            <Crown className="w-3.5 h-3.5" />
                            <span className="truncate">{selectedMatch.participantB?.name || 'Team B'} Wins</span>
                          </button>
                        </div>
                      </div>

                      {/* Notes / Comments */}
                      <div>
                        <label className="block text-[10px] font-mono text-slate-400 uppercase mb-1">
                          Match Notes (Optional)
                        </label>
                        <input
                          type="text"
                          value={notesInput}
                          onChange={(e) => setNotesInput(e.target.value)}
                          placeholder="e.g. Map 1 overtime 13-11, clean match"
                          className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs font-mono focus:border-cyan-500 outline-none"
                        />
                      </div>

                      {/* Dispute Input Section (Admin Only) */}
                      {showDisputeInput && (
                        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 space-y-2">
                          <label className="block text-[10px] font-mono text-rose-300 uppercase">
                            Dispute Reason / Clarification Required:
                          </label>
                          <input
                            type="text"
                            value={disputeReasonInput}
                            onChange={(e) => setDisputeReasonInput(e.target.value)}
                            placeholder="e.g. Score screenshot mismatch with reported values"
                            className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-rose-500/40 text-white text-xs font-mono outline-none"
                          />
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => setShowDisputeInput(false)}
                              className="px-3 py-1 text-[11px] font-mono text-slate-400 hover:text-white"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => handleRejectResult(selectedMatch)}
                              disabled={actionLoading || !disputeReasonInput.trim()}
                              className="px-3 py-1 rounded-lg bg-rose-600 text-white text-[11px] font-mono font-bold"
                            >
                              Confirm Dispute
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Button Group for Submitting / Approving */}
                      <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
                        {/* If Admin and Result is Pending Approval */}
                        {isAdmin ? (
                          <>
                            {!showDisputeInput && (
                              <button
                                type="button"
                                onClick={() => setShowDisputeInput(true)}
                                className="px-4 py-2.5 rounded-xl border border-rose-500/40 hover:bg-rose-500/20 text-rose-300 text-xs font-mono font-bold transition-colors"
                              >
                                Dispute Result
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => handleApproveResult(selectedMatch)}
                              disabled={actionLoading || !selectedWinnerId}
                              className="px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-mono font-black uppercase flex items-center gap-2 shadow-[0_0_15px_rgba(16,185,129,0.3)] transition-all disabled:opacity-50"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                              <span>Approve Official Result & Advance</span>
                            </button>
                          </>
                        ) : (
                          /* Non-Admin Captain Submission */
                          <button
                            type="button"
                            onClick={() => handleSubmitScore(selectedMatch)}
                            disabled={actionLoading || !selectedWinnerId}
                            className="px-6 py-2.5 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-black text-xs font-mono font-black uppercase flex items-center gap-2 shadow-[0_0_15px_rgba(34,211,238,0.3)] transition-all disabled:opacity-50"
                          >
                            <Check className="w-4 h-4" />
                            <span>Submit Score for Admin Approval</span>
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                {/* State D: COMPLETED MATCH OPTIONS */}
                {(selectedMatch.status === 'COMPLETED' || selectedMatch.status === 'CONFIRMED') && (
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2 border-t border-slate-800">
                    <div className="text-xs font-mono text-emerald-400 flex items-center gap-2">
                      <Trophy className="w-4 h-4" />
                      <span>
                        Winner:{' '}
                        <strong>
                          {selectedMatch.winnerName ||
                            (selectedMatch.winnerId === selectedMatch.participantA?.id
                              ? selectedMatch.participantA?.name
                              : selectedMatch.participantB?.name)}
                        </strong>{' '}
                        officially advanced.
                      </span>
                    </div>

                    {isAdmin && (
                      <button
                        onClick={() => handleResetMatch(selectedMatch)}
                        disabled={actionLoading}
                        className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-rose-900/40 text-slate-400 hover:text-rose-300 border border-slate-700 text-xs font-mono font-bold transition-all"
                      >
                        Reset Match
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-800/80 bg-slate-900/30 flex justify-end">
              <button
                onClick={() => setSelectedMatch(null)}
                className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-mono font-bold transition-colors"
              >
                Close Match Center
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* QUALIFICATION / ADVANCEMENT ESPORTS BROADCAST OVERLAY        */}
      {/* ============================================================ */}
      {qualificationCelebration && (
        <TournamentQualificationBroadcastModal
          isOpen={Boolean(qualificationCelebration)}
          onClose={() => setQualificationCelebration(null)}
          data={qualificationCelebration}
        />
      )}

      {/* ============================================================ */}
      {/* TOURNAMENT RANDOM DRAW CEREMONY MODAL                        */}
      {/* ============================================================ */}
      <TournamentDrawModal
        isOpen={isDrawModalOpen}
        onClose={() => setIsDrawModalOpen(false)}
        tournament={tournament}
        confirmedTeams={confirmedTeams}
        teamRegistrations={teamRegistrations}
        adminUser={currentUser}
        onDrawSuccess={() => {
          if (onRefreshTournament) onRefreshTournament();
        }}
        onDrawCompleted={() => {
          if (onRefreshTournament) onRefreshTournament();
        }}
      />

      {/* ============================================================ */}
      {/* MATCH SCHEDULE (DATE/TIME/STATION) MODAL                     */}
      {/* ============================================================ */}
      {scheduleModalMatch && (
        <MatchScheduleModal
          isOpen={!!scheduleModalMatch}
          onClose={() => setScheduleModalMatch(null)}
          tournament={tournament}
          tournamentId={tournament.id}
          match={scheduleModalMatch}
          allMatches={matches}
          adminId={currentUser?.id || 'admin'}
          adminName={currentUser?.gamerTag || 'Tournament Admin'}
          onSaved={() => {
            if (onRefreshTournament) onRefreshTournament();
          }}
          onScheduledSuccess={() => {
            if (onRefreshTournament) onRefreshTournament();
          }}
        />
      )}

      {/* ============================================================ */}
      {/* REDRAW TOURNAMENT CONFIRMATION MODAL                         */}
      {/* ============================================================ */}
      {showRedrawConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-md rounded-3xl bg-[#0e111d] border border-amber-500/40 p-6 space-y-5 shadow-[0_0_50px_rgba(245,158,11,0.2)]">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
                <RefreshCw className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-black font-display text-white uppercase tracking-wide">
                  REDRAW TOURNAMENT?
                </h3>
                <p className="text-xs text-slate-400 font-mono">
                  Official bracket re-randomization
                </p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-amber-950/20 border border-amber-500/30 text-amber-200 text-xs font-mono space-y-2">
              <p className="font-bold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <span>Redrawing will replace current matchups.</span>
              </p>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                No matches have started yet. You can launch the official Esports Random Draw Ceremony to re-shuffle the {confirmedTeams.length} confirmed teams into new pairings!
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowRedrawConfirmModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono font-bold uppercase transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowRedrawConfirmModal(false);
                  setIsDrawModalOpen(true);
                }}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-black text-xs font-mono font-black uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-amber-500/20 transition-all cursor-pointer"
              >
                <Dices className="w-4 h-4" />
                <span>Proceed to Draw Ceremony</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/* ==================================================================== */
/* COMPONENT: MATCH NODE CARD (Graph Node)                              */
/* ==================================================================== */
interface MatchNodeCardProps {
  match: TournamentMatch;
  isChampionship?: boolean;
  isThirdPlace?: boolean;
  onClick: () => void;
  nowTime: number;
  isAdmin?: boolean;
  allMatches?: TournamentMatch[];
  totalRounds?: number;
  onScheduleClick?: (match: TournamentMatch) => void;
}

const MatchNodeCard: React.FC<MatchNodeCardProps> = ({
  match,
  isChampionship = false,
  isThirdPlace = false,
  onClick,
  nowTime,
  isAdmin = false,
  allMatches = [],
  totalRounds = 1,
  onScheduleClick,
}) => {
  const isLive = match.status === 'LIVE';
  const isPending = match.status === 'AWAITING_CONFIRMATION' || match.status === 'PENDING_ADMIN_APPROVAL';
  const isDone = match.status === 'COMPLETED' || match.status === 'CONFIRMED';
  const isDisputed = match.status === 'DISPUTED';

  const elapsedText = match.actualStartedAt
    ? Math.max(0, Math.floor(((match.actualEndedAt || nowTime) - match.actualStartedAt) / 1000))
    : 0;
  const elapsedMinutes = Math.floor(elapsedText / 60);
  const elapsedSeconds = elapsedText % 60;

  // Determine feeder matches for slots A and B if participants not yet populated
  const feederA = useMemo(() => {
    if (match.participantA) return null;
    return allMatches.find(
      (m) =>
        (m.nextMatchId === match.id && (m.nextMatchSlot === 'A' || !m.nextMatchSlot)) ||
        (isThirdPlace && m.loserMatchId === match.id && (m.loserMatchSlot === 'A' || !m.loserMatchSlot))
    );
  }, [match, allMatches, isThirdPlace]);

  const feederB = useMemo(() => {
    if (match.participantB) return null;
    return allMatches.find(
      (m) =>
        (m.nextMatchId === match.id && m.nextMatchSlot === 'B') ||
        (isThirdPlace && m.loserMatchId === match.id && m.loserMatchSlot === 'B')
    );
  }, [match, allMatches, isThirdPlace]);

  const placeholderA = feederA
    ? isThirdPlace
      ? `⏳ Loser of ${feederA.roundName || `Match #${feederA.matchNumber}`}`
      : `⏳ Winner of ${feederA.roundName || `Match #${feederA.matchNumber}`}`
    : 'Waiting for Qualifier';

  const placeholderB = feederB
    ? isThirdPlace
      ? `⏳ Loser of ${feederB.roundName || `Match #${feederB.matchNumber}`}`
      : `⏳ Winner of ${feederB.roundName || `Match #${feederB.matchNumber}`}`
    : 'Waiting for Qualifier';

  const isWaitingQualifiers = !match.participantA && !match.participantB;
  const isWaitingSingleQualifier = (!match.participantA && !!match.participantB) || (!!match.participantA && !match.participantB);
  const isMatchReady = !!match.participantA && !!match.participantB && (match.status === 'READY' || match.status === 'SCHEDULED');
  const isSemiFinal = !isThirdPlace && !isChampionship && (match.roundName?.toLowerCase().includes('semi') || match.loserMatchId !== undefined);

  // Time formatting from server timestamps
  const startTimeStr = match.actualStartedAt
    ? new Date(match.actualStartedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;
  const endTimeStr = match.actualEndedAt
    ? new Date(match.actualEndedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;
  const durationMin = match.actualStartedAt && match.actualEndedAt
    ? Math.max(1, Math.round((match.actualEndedAt - match.actualStartedAt) / 60000))
    : match.durationSeconds
    ? Math.max(1, Math.round(match.durationSeconds / 60))
    : null;

  return (
    <div
      onClick={onClick}
      className={`relative p-4 rounded-2xl border cursor-pointer transition-all transform hover:-translate-y-0.5 shadow-lg group ${
        isLive
          ? 'bg-[#160b13] border-red-500/70 shadow-[0_0_25px_rgba(239,68,68,0.25)] ring-1 ring-red-500/50 animate-pulse'
          : isPending
          ? 'bg-[#17130b] border-amber-500/60 shadow-[0_0_20px_rgba(245,158,11,0.2)]'
          : isDone
          ? isChampionship
            ? 'bg-[#141209] border-yellow-500/50 shadow-[0_0_20px_rgba(234,179,8,0.15)] ring-1 ring-yellow-500/20'
            : isThirdPlace
            ? 'bg-[#151008] border-amber-600/40 shadow-[0_0_15px_rgba(217,119,6,0.15)]'
            : 'bg-[#0a0d15] border-emerald-500/30'
          : isDisputed
          ? 'bg-[#170a0d] border-rose-500/50'
          : isMatchReady
          ? 'bg-[#0a0f1d] border-cyan-500/50 shadow-[0_0_20px_rgba(34,211,238,0.12)]'
          : 'bg-[#0a0c14] border-slate-800/80 hover:border-cyan-500/50 hover:bg-[#0c101c]'
      }`}
    >
      {/* Top Meta Bar */}
      <div className="flex items-center justify-between text-[10px] font-mono mb-2.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-slate-400 font-bold uppercase">
            {match.roundName || `Match #${match.matchNumber}`}
          </span>
          {match.station && (
            <>
              <span className="text-slate-600">•</span>
              <span className="text-slate-400">{match.station}</span>
            </>
          )}
        </div>

        {/* Status Pill */}
        <div className="flex items-center gap-1">
          {isLive ? (
            <span className="px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 font-black tracking-wider uppercase border border-red-500/40 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping" />
              <span>LIVE {elapsedMinutes}:{elapsedSeconds < 10 ? '0' : ''}{elapsedSeconds}</span>
            </span>
          ) : isPending ? (
            <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-black tracking-wider uppercase border border-amber-500/40 flex items-center gap-1">
              <Clock className="w-2.5 h-2.5" />
              <span>Pending Admin</span>
            </span>
          ) : isDone ? (
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-black tracking-wider uppercase border border-emerald-500/40 flex items-center gap-1">
              <Check className="w-2.5 h-2.5" />
              <span>Official</span>
            </span>
          ) : isDisputed ? (
            <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 font-black tracking-wider uppercase border border-rose-500/40">
              Disputed
            </span>
          ) : isMatchReady ? (
            <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-black tracking-wider uppercase border border-cyan-500/40 flex items-center gap-1 animate-pulse">
              <Swords className="w-2.5 h-2.5" />
              <span>⚔️ Match Ready</span>
            </span>
          ) : isWaitingQualifiers ? (
            <span className="px-2 py-0.5 rounded-full bg-slate-800/80 text-slate-400 font-bold uppercase border border-slate-700/50 flex items-center gap-1">
              <Lock className="w-2.5 h-2.5 text-slate-500" />
              <span>Waiting for Qualifiers</span>
            </span>
          ) : isWaitingSingleQualifier ? (
            <span className="px-2 py-0.5 rounded-full bg-slate-800/80 text-amber-400/90 font-bold uppercase border border-amber-500/30 flex items-center gap-1">
              <Clock className="w-2.5 h-2.5" />
              <span>Waiting for Opponent</span>
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 font-bold uppercase">
              Scheduled
            </span>
          )}
        </div>
      </div>

      {/* Contestants List */}
      <div className="space-y-1.5">
        {/* Contestant A */}
        <ContestantRow
          participant={match.participantA}
          score={match.scoreA}
          claimedScore={match.submittedResult?.scoreA}
          isWinner={match.winnerId === match.participantA?.id}
          isClaimedWinner={match.submittedResult?.winnerId === match.participantA?.id}
          isCompleted={isDone}
          isPending={isPending}
          isChampionship={isChampionship}
          isThirdPlace={isThirdPlace}
          isSemiFinal={isSemiFinal}
          isLoser={match.loserId === match.participantA?.id}
          placeholderText={placeholderA}
        />

        {/* Contestant B */}
        <ContestantRow
          participant={match.participantB}
          score={match.scoreB}
          claimedScore={match.submittedResult?.scoreB}
          isWinner={match.winnerId === match.participantB?.id}
          isClaimedWinner={match.submittedResult?.winnerId === match.participantB?.id}
          isCompleted={isDone}
          isPending={isPending}
          isChampionship={isChampionship}
          isThirdPlace={isThirdPlace}
          isSemiFinal={isSemiFinal}
          isLoser={match.loserId === match.participantB?.id}
          placeholderText={placeholderB}
        />
      </div>

      {/* Timing & Admin Metadata if available */}
      {(startTimeStr || match.adminApprovedByName) && (
        <div className="mt-2 pt-1.5 border-t border-slate-800/60 flex items-center justify-between text-[9px] font-mono text-slate-400">
          <div className="truncate">
            {startTimeStr && (
              <span>
                {startTimeStr} {endTimeStr ? `→ ${endTimeStr}` : ''} {durationMin ? `(${durationMin}m)` : ''}
              </span>
            )}
          </div>
          {match.adminApprovedByName && isDone && (
            <span className="text-emerald-400 truncate ml-2">
              Approved by {match.adminApprovedByName}
            </span>
          )}
        </div>
      )}

      {/* Scheduled Date, Time & Station + Admin Quick Schedule Button */}
      <div className="mt-2 pt-1.5 border-t border-slate-800/80 flex items-center justify-between text-[10px] font-mono">
        <div className="flex items-center gap-2 flex-wrap text-slate-400">
          {match.scheduledTime ? (
            <>
              <span className="flex items-center gap-1 text-cyan-300 font-bold">
                <Calendar className="w-3 h-3 text-cyan-400" />
                <span>
                  {new Date(match.scheduledTime).toLocaleDateString([], {
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
              </span>
              <span className="flex items-center gap-1 text-slate-200">
                <Clock className="w-3 h-3 text-cyan-400" />
                <span>
                  {new Date(match.scheduledTime).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </span>
            </>
          ) : (
            <span className="text-slate-500 italic flex items-center gap-1">
              <Clock className="w-3 h-3 text-slate-600" />
              <span>Time TBD</span>
            </span>
          )}
          {match.station && (
            <span className="px-1.5 py-0.2 rounded bg-slate-800 text-cyan-300 text-[9px] border border-slate-700">
              {match.station}
            </span>
          )}
        </div>

        {isAdmin && onScheduleClick && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onScheduleClick(match);
            }}
            className="px-2 py-0.5 rounded bg-cyan-500/15 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/30 text-[9px] font-bold uppercase transition-colors"
          >
            📅 Schedule
          </button>
        )}
      </div>

      {/* Quick Action Cue on Hover */}
      <div className="mt-2 pt-1.5 border-t border-slate-800/80 flex items-center justify-between text-[10px] font-mono text-slate-500 group-hover:text-cyan-400 transition-colors">
        <span className="truncate">
          {isPending
            ? isAdmin
              ? '⚡ Action Needed: Click to Review & Approve'
              : 'Waiting for Admin Verification'
            : isLive
            ? '🔴 Click to Report Scores / Live Center'
            : isDone
            ? '🏆 Click to View Certified Roster & Details'
            : isMatchReady
            ? '⚔️ Match Ready: Click to Start'
            : 'Click to Open Match Center'}
        </span>
        <ArrowRight className="w-3 h-3 shrink-0 ml-1 group-hover:translate-x-0.5 transition-transform" />
      </div>
    </div>
  );
};

/* ==================================================================== */
/* COMPONENT: CONTESTANT ROW IN MATCH CARD                              */
/* ==================================================================== */
interface ContestantRowProps {
  participant?: TournamentParticipant;
  score?: number;
  claimedScore?: number;
  isWinner?: boolean;
  isClaimedWinner?: boolean;
  isCompleted?: boolean;
  isPending?: boolean;
  isChampionship?: boolean;
  isThirdPlace?: boolean;
  isSemiFinal?: boolean;
  isLoser?: boolean;
  placeholderText?: string;
}

const ContestantRow: React.FC<ContestantRowProps> = ({
  participant,
  score,
  claimedScore,
  isWinner,
  isClaimedWinner,
  isCompleted,
  isPending,
  isChampionship,
  isThirdPlace,
  isSemiFinal,
  isLoser,
  placeholderText = 'Waiting for Qualifier',
}) => {
  return (
    <div
      className={`p-2 rounded-xl border flex items-center justify-between text-xs font-mono transition-all relative overflow-hidden ${
        isWinner && isCompleted
          ? isChampionship
            ? 'bg-yellow-500/20 border-yellow-500/60 text-yellow-100 font-bold shadow-[0_0_15px_rgba(234,179,8,0.2)] ring-1 ring-yellow-400/40'
            : isThirdPlace
            ? 'bg-amber-600/20 border-amber-500/60 text-amber-200 font-bold shadow-[0_0_12px_rgba(217,119,6,0.2)]'
            : 'bg-emerald-500/15 border-emerald-500/50 text-emerald-100 font-bold shadow-[0_0_12px_rgba(16,185,129,0.15)] ring-1 ring-emerald-400/30'
          : isClaimedWinner && isPending
          ? 'bg-amber-500/10 border-amber-500/40 text-amber-200 font-bold'
          : isLoser && isCompleted && isSemiFinal
          ? 'bg-amber-950/20 border-amber-600/30 text-amber-300'
          : participant
          ? 'bg-slate-900/90 border-slate-800 text-white'
          : 'bg-slate-900/30 border-dashed border-slate-800 text-slate-500'
      }`}
    >
      <div className="flex items-center gap-2 truncate pr-2">
        {isWinner && isCompleted ? (
          isChampionship ? (
            <Crown className="w-4 h-4 text-yellow-400 shrink-0 animate-bounce" />
          ) : isThirdPlace ? (
            <Medal className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          ) : (
            <Trophy className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          )
        ) : isClaimedWinner && isPending ? (
          <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0 animate-pulse" />
        ) : participant ? (
          <div className="w-4 h-4 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0 overflow-hidden">
            {participant.avatarUrl ? (
              <img src={participant.avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
            )}
          </div>
        ) : (
          <div className="w-3.5 h-3.5 rounded-full bg-slate-800 flex items-center justify-center shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-600" />
          </div>
        )}

        <div className="flex items-center gap-1.5 truncate">
          {participant?.tag && (
            <span className="text-[10px] text-cyan-400 font-bold uppercase tracking-wider">
              [{participant.tag}]
            </span>
          )}
          <span className="truncate font-semibold">
            {participant?.name || placeholderText}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0 font-mono font-black">
        {/* Animated Qualification Badges */}
        {isWinner && isCompleted && (
          <span
            className={`text-[9px] px-2 py-0.5 rounded-full uppercase font-black tracking-wider flex items-center gap-1 shadow-sm ${
              isChampionship
                ? 'bg-yellow-400 text-black shadow-yellow-400/40 animate-pulse'
                : isThirdPlace
                ? 'bg-amber-500 text-black'
                : 'bg-emerald-400 text-black shadow-emerald-400/40 animate-pulse'
            }`}
          >
            <Sparkles className="w-2.5 h-2.5" />
            <span>
              {isChampionship ? 'CHAMPION' : isThirdPlace ? '3RD PLACE' : 'QUALIFIED!'}
            </span>
          </span>
        )}

        {/* Semifinal Loser Placement Badge */}
        {isLoser && isCompleted && isSemiFinal && (
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 uppercase font-black tracking-wider flex items-center gap-1">
            <Medal className="w-2.5 h-2.5 text-amber-400" />
            <span>Placement</span>
          </span>
        )}

        {/* Scores */}
        {isPending && claimedScore !== undefined && score === undefined ? (
          <span className="text-amber-400 text-xs px-1.5 py-0.5 rounded bg-amber-400/10 border border-amber-400/30">
            {claimedScore} (claim)
          </span>
        ) : (
          <span className={`text-xs ${isWinner && isCompleted ? 'text-yellow-300 font-black' : 'text-slate-300'}`}>
            {score !== undefined ? score : '-'}
          </span>
        )}
      </div>
    </div>
  );
};

/* ==================================================================== */
/* COMPONENT: TEAM ROSTER BOX (In Modal)                                */
/* ==================================================================== */
interface TeamRosterBoxProps {
  participant?: TournamentParticipant;
  score?: number;
  isWinner?: boolean;
  isClaimedWinner?: boolean;
  roster?: TeamTournamentRegistration | null;
  slotLabel: string;
}

const TeamRosterBox: React.FC<TeamRosterBoxProps> = ({
  participant,
  score,
  isWinner,
  isClaimedWinner,
  roster,
  slotLabel,
}) => {
  return (
    <div
      className={`p-4 rounded-2xl border space-y-3 ${
        isWinner
          ? 'bg-yellow-500/10 border-yellow-500/40 shadow-[0_0_15px_rgba(234,179,8,0.15)]'
          : 'bg-[#090b12] border-slate-800'
      }`}
    >
      {/* Team Header */}
      <div className="flex items-start justify-between gap-2 border-b border-slate-800/80 pb-2.5">
        <div className="space-y-0.5">
          <div className="text-[10px] font-mono text-slate-500 uppercase">{slotLabel}</div>
          <div className="text-sm font-black font-display text-white flex items-center gap-1.5">
            {isWinner && <Crown className="w-4 h-4 text-yellow-400 shrink-0" />}
            <span className="truncate">{participant?.name || 'Waiting to Advance...'}</span>
          </div>
        </div>

        {score !== undefined && (
          <div className="px-3 py-1 rounded-xl bg-slate-900 border border-slate-800 text-base font-black font-mono text-white">
            {score}
          </div>
        )}
      </div>

      {/* 5 Player Roster Display */}
      <div className="space-y-1.5">
        <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider flex items-center justify-between">
          <span>Confirmed 5-Player Squad:</span>
          {roster && roster.slots && (
            <span className="text-cyan-400 font-bold">
              {(roster.slots || []).filter((s) => s.status === 'ACCEPTED').length}/5 Active
            </span>
          )}
        </div>

        {roster && roster.slots && roster.slots.length > 0 ? (
          <div className="space-y-1">
            {roster.slots.map((slot) => {
              const isCapt = slot.slotNumber === 1 || slot.playerId === roster.captainId;
              const isAccepted = slot.status === 'ACCEPTED';

              return (
                <div
                  key={slot.slotNumber}
                  className={`p-1.5 rounded-lg border text-[11px] font-mono flex items-center justify-between ${
                    isAccepted
                      ? 'bg-slate-900/60 border-slate-800/80 text-slate-200'
                      : 'bg-slate-900/20 border-dashed border-slate-800 text-slate-500'
                  }`}
                >
                  <div className="flex items-center gap-1.5 truncate">
                    {isCapt ? (
                      <Crown className="w-3 h-3 text-yellow-400 shrink-0" />
                    ) : (
                      <UserCheck className="w-3 h-3 text-slate-500 shrink-0" />
                    )}
                    <span className="truncate font-semibold">
                      {slot.gamerTag || slot.playerName || `Slot #${slot.slotNumber}`}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 shrink-0 text-[10px]">
                    {isCapt && (
                      <span className="px-1.5 py-0.2 rounded bg-yellow-500/10 text-yellow-400 font-bold">
                        CAPTAIN
                      </span>
                    )}
                    {slot.gameIgn && <span className="text-slate-400">IGN: {slot.gameIgn}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-3 rounded-xl bg-slate-900/30 border border-dashed border-slate-800 text-center text-[11px] font-mono text-slate-500">
            {participant ? 'Squad roster confirmed on official bracket.' : 'Roster pending prior match outcome.'}
          </div>
        )}
      </div>
    </div>
  );
};

/* ==================================================================== */
/* COMPONENT: PLACEHOLDER NODE FOR UNSEEDED MATCH                       */
/* ==================================================================== */
const PlaceholderNode: React.FC<{ label: string }> = ({ label }) => (
  <div className="p-4 rounded-2xl border border-dashed border-slate-800 bg-[#090b12]/50 text-center space-y-1 text-slate-500">
    <div className="text-xs font-mono font-bold uppercase">{label}</div>
    <p className="text-[10px] font-mono text-slate-600">Awaiting confirmed team seeding</p>
  </div>
);

/* ==================================================================== */
/* COMPONENT: CHAMPION PODIUM / CELEBRATION SHOWCASE                    */
/* ==================================================================== */
interface ChampionPodiumCardProps {
  champion: TournamentParticipant;
  runnerUp?: TournamentParticipant | null;
  thirdPlace?: TournamentParticipant | null;
  fourthPlace?: TournamentParticipant | null;
  tournament: Tournament;
  teamRegistrations: TeamTournamentRegistration[];
  onSelectParticipant?: (id: string, type: 'PLAYER' | 'TEAM') => void;
}

const ChampionPodiumCard: React.FC<ChampionPodiumCardProps> = ({
  champion,
  runnerUp,
  thirdPlace,
  fourthPlace,
  tournament,
  teamRegistrations,
  onSelectParticipant,
}) => {
  return (
    <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-b from-[#141005] via-[#0d0f17] to-[#07080d] border border-yellow-500/40 shadow-[0_0_50px_rgba(234,179,8,0.15)] relative overflow-hidden space-y-6">
      {/* Radiant Glow Accent */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-40 bg-yellow-500/10 blur-[60px] pointer-events-none" />

      {/* Header */}
      <div className="text-center space-y-1 relative z-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-yellow-500/10 border border-yellow-500/30 text-yellow-300 text-xs font-mono font-black uppercase tracking-widest">
          <Sparkles className="w-3.5 h-3.5 text-yellow-400" />
          <span>TOURNAMENT CHAMPION PODIUM</span>
          <Sparkles className="w-3.5 h-3.5 text-yellow-400" />
        </div>
        <h2 className="text-2xl sm:text-3xl font-black font-display text-white tracking-tight">
          OFFICIAL 4-TEAM TOURNAMENT STANDINGS
        </h2>
        <p className="text-xs text-slate-400 font-mono">
          Final matches verified by tournament administration
        </p>
      </div>

      {/* 3-Tier Podium Display */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end pt-4 relative z-10 max-w-4xl mx-auto">
        {/* 2ND PLACE (Runner-Up) */}
        <div className="order-2 md:order-1 p-5 rounded-2xl bg-gradient-to-b from-slate-800/80 to-slate-900 border border-slate-700 text-center space-y-3 shadow-lg transform md:translate-y-2">
          <div className="w-12 h-12 rounded-2xl bg-slate-700/60 border border-slate-500/40 flex items-center justify-center mx-auto text-slate-300">
            <Medal className="w-6 h-6" />
          </div>
          <div className="space-y-0.5">
            <div className="text-[10px] font-mono font-black text-slate-400 uppercase tracking-wider">
              2ND PLACE • RUNNER-UP
            </div>
            <h4 className="text-base font-black font-display text-white truncate">
              {runnerUp?.name || 'Grand Finalist'}
            </h4>
            {tournament.prizes?.secondPlace && (
              <div className="text-xs font-mono font-bold text-slate-300">
                Prize: {tournament.prizes.secondPlace}
              </div>
            )}
          </div>
        </div>

        {/* 1ST PLACE (Champion - Center and Elevated) */}
        <div className="order-1 md:order-2 p-6 rounded-3xl bg-gradient-to-b from-yellow-500/25 via-[#1c1808] to-[#0d0f17] border-2 border-yellow-400/80 text-center space-y-3.5 shadow-[0_0_35px_rgba(234,179,8,0.25)] transform md:-translate-y-4">
          <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-yellow-400 to-amber-600 flex items-center justify-center mx-auto text-black shadow-[0_0_25px_rgba(251,191,36,0.6)] animate-bounce">
            <Trophy className="w-9 h-9 fill-current" />
          </div>

          <div className="space-y-1">
            <div className="text-[11px] font-mono font-black text-yellow-400 uppercase tracking-widest flex items-center justify-center gap-1">
              <Crown className="w-3.5 h-3.5" />
              <span>GRAND CHAMPION</span>
              <Crown className="w-3.5 h-3.5" />
            </div>
            <h3 className="text-xl sm:text-2xl font-black font-display text-white tracking-tight truncate">
              {champion.name}
            </h3>
            {tournament.prizes?.firstPlace && (
              <div className="text-xs font-mono font-bold text-yellow-300 px-3 py-1 rounded-full bg-yellow-500/20 border border-yellow-500/40 inline-block">
                Prize: {tournament.prizes.firstPlace}
              </div>
            )}
          </div>
        </div>

        {/* 3RD PLACE (Bronze Medalist) */}
        <div className="order-3 p-5 rounded-2xl bg-gradient-to-b from-amber-900/30 to-slate-900 border border-amber-600/40 text-center space-y-3 shadow-lg transform md:translate-y-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-700/30 border border-amber-600/50 flex items-center justify-center mx-auto text-amber-400">
            <Medal className="w-6 h-6" />
          </div>
          <div className="space-y-0.5">
            <div className="text-[10px] font-mono font-black text-amber-400 uppercase tracking-wider">
              3RD PLACE • BRONZE
            </div>
            <h4 className="text-base font-black font-display text-white truncate">
              {thirdPlace?.name || '3rd Place Winner'}
            </h4>
            {tournament.prizes?.thirdPlace && (
              <div className="text-xs font-mono font-bold text-amber-300">
                Prize: {tournament.prizes.thirdPlace}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
