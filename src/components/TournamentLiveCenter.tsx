import React, { useState, useEffect, useMemo } from 'react';
import {
  Trophy,
  Swords,
  Clock,
  Calendar,
  Sparkles,
  ShieldCheck,
  Award,
  Flame,
  Radio,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  Users,
  Play,
  ArrowUpRight,
  RefreshCw,
  Bell,
  Eye,
} from 'lucide-react';
import {
  Tournament,
  TournamentMatch,
  TournamentQualificationEvent,
  TournamentActivityLog,
  Player,
  TeamTournamentRegistration,
} from '../types';
import {
  subscribeToTournamentEvents,
  subscribeToTournamentActivityLogs,
} from '../services/tournamentService';
import {
  TournamentQualificationBroadcastModal,
  QualificationBroadcastData,
} from './TournamentQualificationBroadcastModal';

interface TournamentLiveCenterProps {
  tournament: Tournament;
  currentUser?: Player | null;
  isAdmin?: boolean;
  teamRegistrations?: TeamTournamentRegistration[];
  onSelectMatch?: (match: TournamentMatch) => void;
  onViewBracket?: () => void;
  onRefreshTournament?: () => Promise<void> | void;
}

export const TournamentLiveCenter: React.FC<TournamentLiveCenterProps> = ({
  tournament,
  currentUser,
  isAdmin = false,
  teamRegistrations = [],
  onSelectMatch,
  onViewBracket,
  onRefreshTournament,
}) => {
  const [events, setEvents] = useState<TournamentQualificationEvent[]>(
    tournament.qualificationEvents || []
  );
  const [activityLogs, setActivityLogs] = useState<TournamentActivityLog[]>([]);
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'MATCHES' | 'QUALIFIED' | 'TIMELINE' | 'NEWS'>('OVERVIEW');
  const [nowTime, setNowTime] = useState<number>(Date.now());
  const [broadcastData, setBroadcastData] = useState<QualificationBroadcastData | null>(null);

  // Live clock for timers
  useEffect(() => {
    const timer = setInterval(() => setNowTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Real-time subscription to Qualification Events
  useEffect(() => {
    if (!tournament.id) return;
    const unsubEvents = subscribeToTournamentEvents(tournament.id, (list) => {
      setEvents(list);
    });
    const unsubLogs = subscribeToTournamentActivityLogs(tournament.id, (logs) => {
      setActivityLogs(logs);
    });

    return () => {
      unsubEvents();
      unsubLogs();
    };
  }, [tournament.id]);

  // Combined matches list
  const matches = useMemo(() => tournament.matches || [], [tournament.matches]);

  // Live Matches
  const liveMatches = useMemo(
    () => matches.filter((m) => m.status === 'LIVE'),
    [matches]
  );

  // Pending Admin Approval Matches (Finished and awaiting admin approval)
  const pendingApprovalMatches = useMemo(
    () =>
      matches.filter(
        (m) =>
          m.status === 'AWAITING_CONFIRMATION' ||
          m.status === 'PENDING_ADMIN_APPROVAL' ||
          (m.submittedResult && !m.adminApproved && m.status !== 'COMPLETED')
      ),
    [matches]
  );

  // Upcoming Matches
  const upcomingMatches = useMemo(
    () =>
      matches.filter(
        (m) =>
          (m.status === 'SCHEDULED' || m.status === 'READY') &&
          !m.winnerId &&
          m.status !== 'LIVE'
      ),
    [matches]
  );

  // Completed & Confirmed Matches
  const confirmedMatches = useMemo(
    () =>
      matches.filter(
        (m) => (m.status === 'COMPLETED' || m.status === 'CONFIRMED') && m.winnerId
      ),
    [matches]
  );

  // Determine current active round name
  const currentRoundName = useMemo(() => {
    if (tournament.status === 'COMPLETED') return 'TOURNAMENT COMPLETED';
    if (liveMatches.length > 0) return liveMatches[0].roundName || 'ACTIVE ROUND';
    if (pendingApprovalMatches.length > 0) return pendingApprovalMatches[0].roundName || 'ACTIVE ROUND';
    if (upcomingMatches.length > 0) {
      const sorted = [...upcomingMatches].sort((a, b) => (a.round || 1) - (b.round || 1));
      return sorted[0].roundName || 'UPCOMING ROUND';
    }
    return 'STAGE 1';
  }, [tournament.status, liveMatches, pendingApprovalMatches, upcomingMatches]);

  // User's registered team (if user is participant)
  const userTeamStatus = useMemo(() => {
    if (!currentUser?.id) return null;

    // Check in teamRegistrations or tournament.participants
    let userTeamName: string | null = null;
    let userTeamId: string | null = null;

    for (const reg of teamRegistrations) {
      if (reg.captainId === currentUser.id || reg.slots?.some((s) => s.playerId === currentUser.id)) {
        userTeamName = reg.teamName;
        userTeamId = reg.id || reg.teamId || null;
        break;
      }
    }

    if (!userTeamName) {
      const part = (tournament.participants || []).find(
        (p) =>
          p.id === currentUser.id ||
          p.teamMemberIds?.includes(currentUser.id) ||
          p.teamMembers?.some((m) => m.uid === currentUser.id)
      );
      if (part) {
        userTeamName = part.name;
        userTeamId = part.id;
      }
    }

    if (!userTeamName) return null;

    // Determine current team status in tournament
    const isWinner = tournament.winnerId === userTeamId || tournament.winnerName === userTeamName;
    const isRunnerUp = tournament.runnerUpId === userTeamId || tournament.runnerUpName === userTeamName;
    const isThirdPlace = tournament.thirdPlaceId === userTeamId || tournament.thirdPlaceName === userTeamName;

    // Check active or completed matches
    const teamMatches = matches.filter(
      (m) =>
        m.participantA?.id === userTeamId ||
        m.participantB?.id === userTeamId ||
        m.participantA?.name === userTeamName ||
        m.participantB?.name === userTeamName
    );

    const activeLive = teamMatches.find((m) => m.status === 'LIVE');
    const nextUpcoming = teamMatches.find(
      (m) => (m.status === 'READY' || m.status === 'SCHEDULED') && !m.winnerId
    );
    const pendingMatch = teamMatches.find(
      (m) => m.status === 'PENDING_ADMIN_APPROVAL' || m.status === 'AWAITING_CONFIRMATION'
    );

    // Check qualification events
    const qualEvent = events.find(
      (e) => e.winnerTeamId === userTeamId || e.winnerTeamName === userTeamName
    );
    const loser3rdPlaceEvent = events.find(
      (e) => (e.loserTeamId === userTeamId || e.loserTeamName === userTeamName) && e.isSemiFinal
    );

    let statusText = 'REGISTERED';
    let statusColor = 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40';
    let statusIcon = <CheckCircle2 className="w-4 h-4 text-cyan-400" />;

    if (isWinner) {
      statusText = '🏆 TOURNAMENT CHAMPION';
      statusColor = 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40 shadow-[0_0_15px_rgba(234,179,8,0.3)]';
      statusIcon = <Trophy className="w-4 h-4 text-yellow-400" />;
    } else if (activeLive) {
      statusText = '🔴 MATCH CURRENTLY LIVE';
      statusColor = 'bg-red-500/20 text-red-400 border-red-500/40 animate-pulse';
      statusIcon = <Flame className="w-4 h-4 text-red-400" />;
    } else if (pendingMatch) {
      statusText = '🛡️ AWAITING ADMIN APPROVAL';
      statusColor = 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      statusIcon = <Clock className="w-4 h-4 text-amber-400" />;
    } else if (qualEvent) {
      statusText = `🏆 QUALIFIED FOR ${qualEvent.nextRoundName || 'NEXT ROUND'}`;
      statusColor = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-[0_0_15px_rgba(16,185,129,0.2)]';
      statusIcon = <Sparkles className="w-4 h-4 text-emerald-400" />;
    } else if (loser3rdPlaceEvent) {
      statusText = '🥉 QUALIFIED FOR 3RD PLACE MATCH';
      statusColor = 'bg-amber-600/20 text-amber-300 border-amber-600/40';
      statusIcon = <Award className="w-4 h-4 text-amber-400" />;
    } else if (isRunnerUp) {
      statusText = '🥈 TOURNAMENT RUNNER-UP (2ND PLACE)';
      statusColor = 'bg-slate-500/20 text-slate-300 border-slate-500/40';
      statusIcon = <Award className="w-4 h-4 text-slate-400" />;
    } else if (isThirdPlace) {
      statusText = '🥉 3RD PLACE WINNER';
      statusColor = 'bg-amber-600/20 text-amber-300 border-amber-600/40';
      statusIcon = <Award className="w-4 h-4 text-amber-400" />;
    }

    // Opponent in next upcoming
    let nextOpponent = 'TBD';
    if (nextUpcoming) {
      if (nextUpcoming.participantA?.name === userTeamName) {
        nextOpponent = nextUpcoming.participantB?.name || 'Waiting for Qualifier';
      } else {
        nextOpponent = nextUpcoming.participantA?.name || 'Waiting for Qualifier';
      }
    }

    return {
      teamName: userTeamName,
      statusText,
      statusColor,
      statusIcon,
      nextUpcoming,
      nextOpponent,
      isWinner,
    };
  }, [currentUser, teamRegistrations, tournament, matches, events]);

  // Third Place Race Match
  const thirdPlaceMatch = useMemo(() => {
    return matches.find(
      (m) => m.id.includes('3rd') || m.roundName?.toLowerCase().includes('3rd')
    );
  }, [matches]);

  // Launch broadcast modal for a specific match or qualification event
  const openBroadcastForMatch = (match: TournamentMatch) => {
    if (!match.winnerId) return;
    const winnerObj = match.winnerId === match.participantA?.id ? match.participantA : match.participantB;
    const loserObj = match.winnerId === match.participantA?.id ? match.participantB : match.participantA;
    const isChamp =
      match.roundName?.toLowerCase().includes('final') &&
      !match.roundName?.toLowerCase().includes('semi') &&
      !match.roundName?.toLowerCase().includes('3rd');
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

    setBroadcastData({
      match,
      winnerName: winnerObj?.name || 'Winner',
      winnerTag: winnerObj?.tag,
      winnerAvatar: winnerObj?.avatarUrl,
      loserName: loserObj?.name,
      loserTag: loserObj?.tag,
      loserAvatar: loserObj?.avatarUrl,
      scoreA: match.scoreA ?? 0,
      scoreB: match.scoreB ?? 0,
      roundName: match.roundName || `Match #${match.matchNumber}`,
      nextRoundName: isChamp ? 'TOURNAMENT CHAMPION' : nextM?.roundName || 'THE FINAL',
      nextMatchDate: nextDate,
      nextMatchTime: nextTime,
      isSemiFinal: isSemi,
      isChampionship: isChamp,
      approvedByName: match.adminApprovedByName || 'Tournament Admin',
      nextOpponentName: nextOpp,
    });
  };

  const openBroadcastForEvent = (event: TournamentQualificationEvent) => {
    setBroadcastData({
      event,
      winnerName: event.winnerTeamName,
      winnerTag: event.winnerTeamTag,
      winnerAvatar: event.winnerAvatarUrl,
      loserName: event.loserTeamName,
      loserTag: event.loserTeamTag,
      loserAvatar: event.loserAvatarUrl,
      scoreA: event.scoreA,
      scoreB: event.scoreB,
      roundName: event.roundName,
      nextRoundName: event.nextRoundName,
      isSemiFinal: event.isSemiFinal,
      isChampionship: event.isChampionship,
      approvedByName: event.approvedByName || 'Tournament Admin',
    });
  };

  // Helper for relative time ("2m ago", "just now")
  const getRelativeTime = (timestamp: number) => {
    const diffSeconds = Math.max(0, Math.floor((nowTime - timestamp) / 1000));
    if (diffSeconds < 60) return 'Just now';
    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return new Date(timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  return (
    <div className="w-full space-y-6">
      {/* ======================================================== */}
      {/* 1. TOP ESPORTS BROADCAST HEADER & LIVE STATUS TICKER     */}
      {/* ======================================================== */}
      <div className="relative rounded-3xl bg-gradient-to-b from-[#0e1222] to-[#070913] border border-cyan-500/30 p-6 shadow-[0_0_40px_rgba(34,211,238,0.08)] overflow-hidden">
        {/* Background glow lines */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800/80">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5">
              <span className="flex h-3 w-3 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-cyan-500" />
              </span>
              <span className="text-xs font-mono font-black text-cyan-400 uppercase tracking-widest">
                LIVE ESPORTS CENTER • SOURCE OF TRUTH
              </span>
            </div>

            <h2 className="text-2xl sm:text-3xl font-black text-white font-display uppercase tracking-wide flex items-center gap-3">
              <Trophy className="w-7 h-7 text-yellow-400 shrink-0" />
              <span>{tournament.name}</span>
            </h2>

            <div className="flex items-center gap-3 text-xs font-mono text-slate-400 flex-wrap">
              <span className="text-cyan-300 font-bold">{tournament.gameName}</span>
              <span>•</span>
              <span className="text-slate-300 uppercase font-bold">{currentRoundName}</span>
              <span>•</span>
              <span className="text-slate-400">{tournament.format.replace(/_/g, ' ')}</span>
            </div>
          </div>

          {/* Quick Metrics & Actions */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {events.length > 0 && (
              <button
                type="button"
                onClick={() => openBroadcastForEvent(events[0])}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black font-black text-xs font-mono uppercase tracking-wider shadow-[0_0_20px_rgba(34,211,238,0.25)] flex items-center gap-2 transition-all"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Qualification Replay</span>
              </button>
            )}

            {onViewBracket && (
              <button
                type="button"
                onClick={onViewBracket}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono font-bold uppercase transition-colors flex items-center gap-1.5 border border-slate-700"
              >
                <Swords className="w-3.5 h-3.5 text-cyan-400" />
                <span>View Full Bracket</span>
              </button>
            )}

            {onRefreshTournament && (
              <button
                type="button"
                onClick={() => onRefreshTournament()}
                title="Refresh Tournament State"
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors border border-slate-700"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Live Counters Strip */}
        <div className="relative z-10 grid grid-cols-2 sm:grid-cols-4 gap-3 pt-6">
          <div className="p-3.5 rounded-2xl bg-[#080a14] border border-slate-800/80">
            <span className="text-[10px] font-mono text-slate-500 uppercase block">Active Round</span>
            <div className="text-sm font-bold font-mono text-cyan-300 mt-1 truncate">
              {currentRoundName}
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-[#080a14] border border-slate-800/80">
            <span className="text-[10px] font-mono text-slate-500 uppercase block">Live Matches</span>
            <div className="text-sm font-bold font-mono text-white mt-1 flex items-center gap-1.5">
              {liveMatches.length > 0 ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                  <span className="text-red-400">{liveMatches.length} LIVE NOW</span>
                </>
              ) : (
                <span className="text-slate-400">0 Live</span>
              )}
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-[#080a14] border border-slate-800/80">
            <span className="text-[10px] font-mono text-slate-500 uppercase block">Official Results</span>
            <div className="text-sm font-bold font-mono text-emerald-400 mt-1 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{confirmedMatches.length} Confirmed</span>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-[#080a14] border border-slate-800/80">
            <span className="text-[10px] font-mono text-slate-500 uppercase block">Total Teams</span>
            <div className="text-sm font-bold font-mono text-white mt-1 flex items-center gap-1">
              <Users className="w-3.5 h-3.5 text-slate-400" />
              <span>{tournament.participants?.length || 0} Registered</span>
            </div>
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 2. USER'S PERSONALIZED SQUAD STATUS (SECTION 16)         */}
      {/* ======================================================== */}
      {userTeamStatus && (
        <div className="p-5 rounded-3xl bg-gradient-to-r from-slate-900 via-[#0d1326] to-slate-900 border border-cyan-500/40 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-cyan-400">
                YOUR TEAM DIRECTORY
              </span>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-mono font-black uppercase border flex items-center gap-1.5 ${userTeamStatus.statusColor}`}>
                {userTeamStatus.statusIcon}
                <span>{userTeamStatus.statusText}</span>
              </span>
            </div>

            <h3 className="text-xl font-black text-white font-display uppercase tracking-wide">
              {userTeamStatus.teamName}
            </h3>

            {userTeamStatus.nextUpcoming ? (
              <div className="text-xs font-mono text-slate-300 flex items-center gap-2 flex-wrap">
                <span className="text-slate-400">Next Scheduled Match:</span>
                <span className="text-cyan-300 font-bold">
                  {userTeamStatus.teamName} vs {userTeamStatus.nextOpponent}
                </span>
                {userTeamStatus.nextUpcoming.station && (
                  <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-slate-300">
                    {userTeamStatus.nextUpcoming.station}
                  </span>
                )}
              </div>
            ) : (
              <p className="text-xs font-mono text-slate-400">
                All scheduled rounds for your squad are currently up to date.
              </p>
            )}
          </div>

          {userTeamStatus.nextUpcoming && onSelectMatch && (
            <button
              type="button"
              onClick={() => onSelectMatch(userTeamStatus.nextUpcoming!)}
              className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-bold font-mono text-xs uppercase tracking-wider shrink-0 transition-colors flex items-center gap-1.5 shadow-[0_0_15px_rgba(34,211,238,0.2)]"
            >
              <span>View Match Details</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* 3. NAVIGATION TABS                                       */}
      {/* ======================================================== */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-slate-800 font-mono text-xs">
        <button
          type="button"
          onClick={() => setActiveTab('OVERVIEW')}
          className={`px-4 py-2 rounded-xl font-bold uppercase transition-all shrink-0 ${
            activeTab === 'OVERVIEW'
              ? 'bg-cyan-500 text-black shadow-[0_0_15px_rgba(34,211,238,0.3)]'
              : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          🏆 Live Overview
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('MATCHES')}
          className={`px-4 py-2 rounded-xl font-bold uppercase transition-all shrink-0 flex items-center gap-1.5 ${
            activeTab === 'MATCHES'
              ? 'bg-cyan-500 text-black shadow-[0_0_15px_rgba(34,211,238,0.3)]'
              : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          <span>⚔️ Matches</span>
          {liveMatches.length > 0 && (
            <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('QUALIFIED')}
          className={`px-4 py-2 rounded-xl font-bold uppercase transition-all shrink-0 flex items-center gap-1.5 ${
            activeTab === 'QUALIFIED'
              ? 'bg-cyan-500 text-black shadow-[0_0_15px_rgba(34,211,238,0.3)]'
              : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          <span>🏆 Qualified Teams</span>
          <span className="px-1.5 py-0.2 rounded-full bg-slate-800 text-[10px] text-cyan-400">
            {events.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('TIMELINE')}
          className={`px-4 py-2 rounded-xl font-bold uppercase transition-all shrink-0 ${
            activeTab === 'TIMELINE'
              ? 'bg-cyan-500 text-black shadow-[0_0_15px_rgba(34,211,238,0.3)]'
              : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          ⏱️ Progression Timeline
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('NEWS')}
          className={`px-4 py-2 rounded-xl font-bold uppercase transition-all shrink-0 flex items-center gap-1.5 ${
            activeTab === 'NEWS'
              ? 'bg-cyan-500 text-black shadow-[0_0_15px_rgba(34,211,238,0.3)]'
              : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          <Bell className="w-3.5 h-3.5" />
          <span>Latest Updates</span>
        </button>
      </div>

      {/* ======================================================== */}
      {/* 4. OVERVIEW TAB CONTENT                                  */}
      {/* ======================================================== */}
      {activeTab === 'OVERVIEW' && (
        <div className="space-y-6">
          {/* A. Live Matches Section if any active */}
          {liveMatches.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
                <h3 className="text-base font-bold font-display uppercase text-white tracking-wide">
                  LIVE MATCHES IN PROGRESS ({liveMatches.length})
                </h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {liveMatches.map((m) => {
                  const elapsedSec = m.actualStartedAt
                    ? Math.max(0, Math.floor((nowTime - m.actualStartedAt) / 1000))
                    : 0;
                  const elapsedMin = Math.floor(elapsedSec / 60);
                  const remSec = elapsedSec % 60;

                  return (
                    <div
                      key={m.id}
                      onClick={() => onSelectMatch?.(m)}
                      className="p-5 rounded-3xl bg-[#140b12] border-2 border-red-500/60 shadow-[0_0_30px_rgba(239,68,68,0.2)] hover:border-red-400 cursor-pointer transition-all space-y-3 relative group"
                    >
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="text-red-400 font-bold uppercase flex items-center gap-1.5">
                          <Radio className="w-4 h-4 animate-pulse" />
                          <span>LIVE {elapsedMin}:{remSec < 10 ? '0' : ''}{remSec}</span>
                        </span>
                        {m.station && (
                          <span className="px-2 py-0.5 rounded-full bg-slate-900 text-cyan-300 border border-slate-800">
                            {m.station}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between gap-3 text-center">
                        <div className="flex-1 truncate">
                          <div className="text-base font-bold text-white truncate">
                            {m.participantA?.name || 'Participant A'}
                          </div>
                          {m.participantA?.tag && (
                            <div className="text-xs text-slate-400 font-mono">[{m.participantA.tag}]</div>
                          )}
                        </div>

                        <div className="px-4 py-2 rounded-2xl bg-slate-900 border border-slate-800 font-mono text-2xl font-black text-cyan-300 shrink-0">
                          {m.scoreA ?? 0} — {m.scoreB ?? 0}
                        </div>

                        <div className="flex-1 truncate">
                          <div className="text-base font-bold text-white truncate">
                            {m.participantB?.name || 'Participant B'}
                          </div>
                          {m.participantB?.tag && (
                            <div className="text-xs text-slate-400 font-mono">[{m.participantB.tag}]</div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 border-t border-red-500/20 pt-2.5">
                        <span>{m.roundName || `Match #${m.matchNumber}`}</span>
                        <span className="text-cyan-400 flex items-center gap-1 group-hover:underline">
                          <span>Match Controls</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* B. Pending Admin Approval Notice if any */}
          {pendingApprovalMatches.length > 0 && (
            <div className="p-4 rounded-2xl bg-amber-950/20 border border-amber-500/40 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-amber-300 font-mono text-xs font-bold uppercase">
                  <Clock className="w-4 h-4 text-amber-400" />
                  <span>
                    {pendingApprovalMatches.length} MATCH RESULT(S) PENDING ADMIN APPROVAL
                  </span>
                </div>
                {isAdmin && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500 text-black font-black uppercase">
                    Admin Action Required
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-300 font-mono">
                Scores have been submitted by referee/players and are awaiting official admin verification before advancing bracket progression.
              </p>
            </div>
          )}

          {/* C. Grid: Qualified Teams & Third Place Race */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Qualified Teams Box */}
            <div className="p-5 rounded-3xl bg-[#0a0d17] border border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-yellow-400" />
                  <h4 className="text-sm font-bold font-display uppercase text-white">
                    OFFICIALLY QUALIFIED TEAMS
                  </h4>
                </div>
                <span className="text-[10px] font-mono text-slate-400 uppercase">
                  {events.length} Advanced
                </span>
              </div>

              {events.length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-xs font-mono">
                  No matches have concluded yet. First qualifiers will appear here once Admin approves match results.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {events.slice(0, 4).map((e) => (
                    <div
                      key={e.eventId}
                      onClick={() => openBroadcastForEvent(e)}
                      className="p-3.5 rounded-2xl bg-slate-900/80 border border-cyan-500/20 hover:border-cyan-400/50 cursor-pointer transition-all flex items-center justify-between text-xs font-mono group"
                    >
                      <div className="flex items-center gap-3 truncate">
                        <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center shrink-0">
                          {e.isChampionship ? (
                            <Trophy className="w-4 h-4 text-yellow-400" />
                          ) : (
                            <Sparkles className="w-4 h-4 text-cyan-400" />
                          )}
                        </div>
                        <div className="truncate">
                          <div className="font-bold text-white truncate flex items-center gap-1.5">
                            <span>{e.winnerTeamName}</span>
                            {e.winnerTeamTag && (
                              <span className="text-slate-400 font-normal">[{e.winnerTeamTag}]</span>
                            )}
                          </div>
                          <div className="text-[10px] text-cyan-400 truncate">
                            {e.isChampionship ? 'TOURNAMENT CHAMPION' : `Qualified for ${e.nextRoundName || 'Final'}`}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        className="px-2.5 py-1 rounded-lg bg-slate-800 group-hover:bg-cyan-500 group-hover:text-black text-slate-300 text-[10px] font-bold uppercase transition-all shrink-0 flex items-center gap-1"
                      >
                        <Play className="w-2.5 h-2.5 fill-current" />
                        <span>Replay</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Third Place Race Box */}
            <div className="p-5 rounded-3xl bg-[#0a0d17] border border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Award className="w-4 h-4 text-amber-500" />
                  <h4 className="text-sm font-bold font-display uppercase text-white">
                    3RD PLACE PODIUM RACE
                  </h4>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  Bronze Medal
                </span>
              </div>

              {thirdPlaceMatch ? (
                <div
                  onClick={() => onSelectMatch?.(thirdPlaceMatch)}
                  className="p-4 rounded-2xl bg-amber-950/10 border border-amber-500/30 hover:border-amber-400/50 cursor-pointer transition-all space-y-3"
                >
                  <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                    <span className="text-amber-400 font-bold">3RD PLACE PLAYOFF</span>
                    {thirdPlaceMatch.scheduledTime && (
                      <span>
                        {new Date(thirdPlaceMatch.scheduledTime).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-2 text-center text-xs font-mono">
                    <div className="flex-1 truncate">
                      <div className="font-bold text-white truncate">
                        {thirdPlaceMatch.participantA?.name || 'Semifinal 1 Runner-Up'}
                      </div>
                    </div>
                    <span className="text-slate-500 font-bold px-2">VS</span>
                    <div className="flex-1 truncate">
                      <div className="font-bold text-white truncate">
                        {thirdPlaceMatch.participantB?.name || 'Semifinal 2 Runner-Up'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 border-t border-amber-500/20 pt-2">
                    <span className="text-amber-300">
                      {thirdPlaceMatch.status === 'COMPLETED'
                        ? `Winner: ${thirdPlaceMatch.winnerName} 🥉`
                        : 'Awaiting Semifinal Consequential Seeds'}
                    </span>
                    <span className="text-slate-400 flex items-center gap-1">
                      <span>View</span>
                      <ChevronRight className="w-3 h-3" />
                    </span>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-slate-500 text-xs font-mono">
                  Third Place match will unlock automatically as soon as semifinal results are approved.
                </div>
              )}
            </div>
          </div>

          {/* D. Recent Results Showcase */}
          <div className="p-5 rounded-3xl bg-[#0a0d17] border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <h4 className="text-sm font-bold font-display uppercase text-white">
                  RECENT CONFIRMED RESULTS
                </h4>
              </div>
              <span className="text-[10px] font-mono text-slate-400 uppercase">
                {confirmedMatches.length} Matches Concluded
              </span>
            </div>

            {confirmedMatches.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-xs font-mono">
                No matches have concluded yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {confirmedMatches.map((m) => (
                  <div
                    key={m.id}
                    onClick={() => onSelectMatch?.(m)}
                    className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800 hover:border-slate-700 cursor-pointer transition-all space-y-2.5 text-xs font-mono"
                  >
                    <div className="flex items-center justify-between text-[10px] text-slate-400">
                      <span className="text-cyan-400 font-bold uppercase">{m.roundName}</span>
                      <span className="px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        Official
                      </span>
                    </div>

                    <div className="space-y-1">
                      <div className={`flex items-center justify-between p-1.5 rounded-lg ${m.winnerId === m.participantA?.id ? 'bg-emerald-500/10 font-bold text-white' : 'text-slate-400'}`}>
                        <span className="truncate">{m.participantA?.name || 'Team A'}</span>
                        <span className="font-mono ml-2">{m.scoreA ?? 0}</span>
                      </div>
                      <div className={`flex items-center justify-between p-1.5 rounded-lg ${m.winnerId === m.participantB?.id ? 'bg-emerald-500/10 font-bold text-white' : 'text-slate-400'}`}>
                        <span className="truncate">{m.participantB?.name || 'Team B'}</span>
                        <span className="font-mono ml-2">{m.scoreB ?? 0}</span>
                      </div>
                    </div>

                    {m.adminApprovedByName && (
                      <div className="pt-2 border-t border-slate-800/80 text-[10px] text-slate-500 flex items-center justify-between">
                        <span>Verified by {m.adminApprovedByName}</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openBroadcastForMatch(m);
                          }}
                          className="text-cyan-400 hover:underline flex items-center gap-1 font-bold"
                        >
                          <Play className="w-2.5 h-2.5 fill-current" />
                          <span>Replay</span>
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 5. MATCHES TAB CONTENT                                   */}
      {/* ======================================================== */}
      {activeTab === 'MATCHES' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {matches.map((m) => {
              const isLive = m.status === 'LIVE';
              const isDone = m.status === 'COMPLETED' || m.status === 'CONFIRMED';
              const isPending = m.status === 'PENDING_ADMIN_APPROVAL' || m.status === 'AWAITING_CONFIRMATION';
              const isReady = (m.status === 'READY' || m.status === 'SCHEDULED') && m.participantA && m.participantB;

              return (
                <div
                  key={m.id}
                  onClick={() => onSelectMatch?.(m)}
                  className={`p-5 rounded-3xl border cursor-pointer transition-all space-y-3 ${
                    isLive
                      ? 'bg-[#140b12] border-red-500/70 shadow-[0_0_20px_rgba(239,68,68,0.2)]'
                      : isPending
                      ? 'bg-[#17130b] border-amber-500/60'
                      : isDone
                      ? 'bg-[#0a0d16] border-emerald-500/30'
                      : isReady
                      ? 'bg-[#0b1020] border-cyan-500/40'
                      : 'bg-[#090b14] border-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px] font-mono">
                    <span className="text-slate-400 font-bold uppercase">{m.roundName}</span>
                    <div>
                      {isLive ? (
                        <span className="px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 font-black uppercase text-[10px] border border-red-500/40 animate-pulse">
                          🔴 LIVE
                        </span>
                      ) : isPending ? (
                        <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-bold uppercase text-[10px] border border-amber-500/40">
                          🛡️ Pending Admin
                        </span>
                      ) : isDone ? (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold uppercase text-[10px] border border-emerald-500/40">
                          ✅ Confirmed
                        </span>
                      ) : isReady ? (
                        <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-bold uppercase text-[10px] border border-cyan-500/40">
                          ⚔️ Ready
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 uppercase text-[10px]">
                          ⏳ Upcoming
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className={`flex items-center justify-between p-2 rounded-xl text-xs font-mono ${m.winnerId === m.participantA?.id ? 'bg-emerald-500/15 text-white font-bold' : 'text-slate-300'}`}>
                      <span className="truncate">{m.participantA?.name || 'Waiting for Qualifier'}</span>
                      <span className="font-black text-sm">{m.scoreA ?? '—'}</span>
                    </div>

                    <div className={`flex items-center justify-between p-2 rounded-xl text-xs font-mono ${m.winnerId === m.participantB?.id ? 'bg-emerald-500/15 text-white font-bold' : 'text-slate-300'}`}>
                      <span className="truncate">{m.participantB?.name || 'Waiting for Qualifier'}</span>
                      <span className="font-black text-sm">{m.scoreB ?? '—'}</span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] font-mono text-slate-400">
                    <div className="flex items-center gap-1.5">
                      {m.scheduledTime && (
                        <span>
                          {new Date(m.scheduledTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                      {m.station && <span>• {m.station}</span>}
                    </div>
                    <span className="text-cyan-400 font-bold">Open Match →</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 6. QUALIFIED TEAMS TAB CONTENT                           */}
      {/* ======================================================== */}
      {activeTab === 'QUALIFIED' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold font-display uppercase text-white">
              TOURNAMENT ADVANCEMENT RECORDS ({events.length})
            </h3>
            <span className="text-xs font-mono text-slate-400">
              Generated exclusively from official Admin approvals
            </span>
          </div>

          {events.length === 0 ? (
            <div className="p-8 rounded-3xl bg-[#090b14] border border-slate-800 text-center text-slate-500 text-xs font-mono">
              No qualification events logged yet.
            </div>
          ) : (
            <div className="space-y-3">
              {events.map((e) => (
                <div
                  key={e.eventId}
                  className="p-5 rounded-3xl bg-[#0b0e1b] border border-cyan-500/30 shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 font-mono text-[10px] font-bold border border-cyan-500/30 uppercase">
                        {e.roundName}
                      </span>
                      <span className="text-slate-500 text-xs font-mono">•</span>
                      <span className="text-xs font-mono text-slate-400">
                        {getRelativeTime(e.qualificationTime)}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-cyan-500/10 border border-cyan-500/40 flex items-center justify-center shrink-0">
                        {e.isChampionship ? (
                          <Trophy className="w-5 h-5 text-yellow-400" />
                        ) : (
                          <Sparkles className="w-5 h-5 text-cyan-400" />
                        )}
                      </div>

                      <div>
                        <div className="text-base font-bold text-white font-display uppercase">
                          {e.winnerTeamName}
                        </div>
                        <div className="text-xs font-mono text-emerald-400">
                          {e.isChampionship
                            ? '👑 Crowned Official Tournament Champion'
                            : `🏆 Officially Qualified for ${e.nextRoundName || 'Next Round'}`}
                        </div>
                      </div>
                    </div>

                    <div className="text-xs font-mono text-slate-400">
                      Defeated <span className="text-slate-200 font-bold">{e.loserTeamName}</span> with official score ({e.scoreA} — {e.scoreB}).
                      {e.isSemiFinal && (
                        <span className="text-amber-400 ml-1.5">
                          ({e.loserTeamName} advanced to 3rd Place Match 🥉)
                        </span>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => openBroadcastForEvent(e)}
                    className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-mono text-xs font-black uppercase tracking-wider shrink-0 transition-colors flex items-center gap-1.5 shadow-[0_0_15px_rgba(34,211,238,0.2)]"
                  >
                    <Play className="w-3 h-3 fill-current" />
                    <span>Replay Celebration</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* 7. PROGRESSION TIMELINE TAB CONTENT (SECTION 14)         */}
      {/* ======================================================== */}
      {activeTab === 'TIMELINE' && (
        <div className="p-6 rounded-3xl bg-[#090b14] border border-slate-800 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <h3 className="text-base font-bold font-display uppercase text-white">
                TOURNAMENT PROGRESSION TIMELINE
              </h3>
              <p className="text-xs font-mono text-slate-400 mt-0.5">
                Official chronological audit trail of all tournament events
              </p>
            </div>
            <span className="text-xs font-mono text-cyan-400">
              {activityLogs.length} Events Logged
            </span>
          </div>

          {activityLogs.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-xs font-mono">
              No activity logs recorded yet. Events will appear in real time as the tournament progresses.
            </div>
          ) : (
            <div className="relative border-l-2 border-slate-800 ml-4 pl-6 space-y-6">
              {activityLogs.map((log) => {
                const isQual = log.action === 'TEAM_QUALIFIED' || log.action === 'TEAM_QUALIFIED_3RD_PLACE';
                const isMatchApprove = log.action === 'MATCH_RESULT_APPROVED';
                const isDraw = log.action === 'TOURNAMENT_DRAW_COMPLETED';
                const isStart = log.action === 'MATCH_STARTED' || log.action === 'TOURNAMENT_STARTED';

                return (
                  <div key={log.id} className="relative group">
                    {/* Node Dot on line */}
                    <div
                      className={`absolute -left-[31px] top-1.5 w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                        isQual
                          ? 'bg-cyan-500 border-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.8)]'
                          : isMatchApprove
                          ? 'bg-emerald-500 border-emerald-300'
                          : isStart
                          ? 'bg-red-500 border-red-300'
                          : 'bg-slate-700 border-slate-500'
                      }`}
                    />

                    <div className="p-4 rounded-2xl bg-[#0d101d] border border-slate-800/80 hover:border-slate-700 transition-colors space-y-1 text-xs font-mono">
                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span className="font-bold text-white uppercase flex items-center gap-1.5">
                          {isQual && <Sparkles className="w-3.5 h-3.5 text-cyan-400" />}
                          {isMatchApprove && <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />}
                          {isStart && <Flame className="w-3.5 h-3.5 text-red-400" />}
                          <span>{log.action.replace(/_/g, ' ')}</span>
                        </span>
                        <span>{getRelativeTime(log.timestamp)}</span>
                      </div>

                      <p className="text-slate-300 leading-relaxed">
                        {log.details || 'Tournament state changed'}
                      </p>

                      <div className="pt-1 text-[10px] text-slate-500">
                        Authorized: {log.adminName || 'Nexus Tournament Engine'}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* 8. LATEST NEWS TICKER TAB (SECTION 15)                   */}
      {/* ======================================================== */}
      {activeTab === 'NEWS' && (
        <div className="p-6 rounded-3xl bg-[#090b14] border border-slate-800 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-cyan-400" />
              <h3 className="text-base font-bold font-display uppercase text-white">
                LIVE TOURNAMENT NEWSWIRE
              </h3>
            </div>
            <span className="text-xs font-mono text-slate-400">Real-time Feed</span>
          </div>

          <div className="space-y-2.5">
            {/* Qualification news */}
            {events.map((e) => (
              <div
                key={`news_${e.eventId}`}
                onClick={() => openBroadcastForEvent(e)}
                className="p-3.5 rounded-2xl bg-[#0c1020] border border-slate-800 hover:border-cyan-500/50 cursor-pointer transition-colors flex items-center justify-between text-xs font-mono group"
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg">🏆</span>
                  <div>
                    <span className="text-cyan-300 font-bold">{e.winnerTeamName}</span>
                    <span className="text-slate-300 ml-1">
                      defeated {e.loserTeamName} ({e.scoreA}-{e.scoreB}) and qualified for {e.nextRoundName || 'the next round'}.
                    </span>
                  </div>
                </div>
                <span className="text-[10px] text-slate-500 shrink-0 ml-2">
                  {getRelativeTime(e.qualificationTime)}
                </span>
              </div>
            ))}

            {/* Live matches news */}
            {liveMatches.map((m) => (
              <div
                key={`news_live_${m.id}`}
                onClick={() => onSelectMatch?.(m)}
                className="p-3.5 rounded-2xl bg-[#140b12] border border-red-500/40 cursor-pointer transition-colors flex items-center justify-between text-xs font-mono"
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg">🔴</span>
                  <div>
                    <span className="text-red-400 font-bold">{m.roundName}</span>
                    <span className="text-slate-300 ml-1">
                      is officially LIVE: {m.participantA?.name} vs {m.participantB?.name}
                      {m.station && ` at ${m.station}`}.
                    </span>
                  </div>
                </div>
                <span className="text-[10px] text-red-400 font-bold shrink-0 ml-2">
                  NOW
                </span>
              </div>
            ))}

            {/* Upcoming ready matches news */}
            {upcomingMatches.slice(0, 3).map((m) => (
              <div
                key={`news_up_${m.id}`}
                onClick={() => onSelectMatch?.(m)}
                className="p-3.5 rounded-2xl bg-[#090b14] border border-slate-800 hover:border-slate-700 cursor-pointer transition-colors flex items-center justify-between text-xs font-mono"
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg">⚔️</span>
                  <div>
                    <span className="text-slate-200 font-bold">{m.participantA?.name || 'Qualifier'}</span>
                    <span className="text-slate-400 mx-1">vs</span>
                    <span className="text-slate-200 font-bold">{m.participantB?.name || 'Qualifier'}</span>
                    <span className="text-slate-400 ml-1">
                      scheduled for {m.scheduledTime ? new Date(m.scheduledTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'TBD'}.
                    </span>
                  </div>
                </div>
                <span className="text-[10px] text-slate-500 shrink-0 ml-2">Upcoming</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 9. BROADCAST ANIMATION MODAL OVERLAY                     */}
      {/* ======================================================== */}
      {broadcastData && (
        <TournamentQualificationBroadcastModal
          isOpen={Boolean(broadcastData)}
          onClose={() => setBroadcastData(null)}
          data={broadcastData}
          onViewBracket={onViewBracket}
        />
      )}
    </div>
  );
};
