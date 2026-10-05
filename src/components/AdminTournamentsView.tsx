import React, { useState, useEffect } from 'react';
import { Tournament, TournamentMatch, TeamTournamentRegistration, Player } from '../types';
import {
  subscribeToAllTournaments,
  generateAndLockBracket,
  updateTournamentMatchResult,
  completeTournamentAndAnnounceWinner,
  createTournament,
  updateTournamentStatus,
  fetchTournamentById,
  subscribeToPendingTeamRegistrations,
} from '../services/tournamentService';
import { countCompletedDistinctPlayers } from '../utils/tournamentTeamStatus';
import { AdminTeamTournamentReviewModal } from './AdminTeamTournamentReviewModal';
import { AdminTournamentDashboard } from './AdminTournamentDashboard';
import { AdminEditTournamentModal } from './AdminEditTournamentModal';
import { useAuth } from '../context/AuthContext';
import { useToast } from './Toast';
import {
  Trophy,
  Crown,
  Plus,
  Play,
  CheckCircle2,
  Calendar,
  Users,
  Clock,
  Sparkles,
  AlertTriangle,
  Lock,
  Edit2,
  ChevronRight,
  Shield,
  Gamepad2,
  Check,
  X,
  Phone,
} from 'lucide-react';

interface AdminTournamentsViewProps {
  onSelectTournament?: (tournamentId: string) => void;
}

export const AdminTournamentsView: React.FC<AdminTournamentsViewProps> = ({
  onSelectTournament,
}) => {
  const { user, playerProfile, isAdmin } = useAuth();
  const { showToast } = useToast();

  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(null);

  // New Tournament Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newGameId, setNewGameId] = useState('valorant');
  const [newGameName, setNewGameName] = useState('Valorant');
  const [newType, setNewType] = useState<'INDIVIDUAL' | 'TEAM'>('INDIVIDUAL');
  const [newFormat, setNewFormat] = useState<'SINGLE_ELIMINATION' | 'DOUBLE_ELIMINATION' | 'ROUND_ROBIN' | 'GROUP_STAGE_KNOCKOUT'>('SINGLE_ELIMINATION');
  const [newMaxParticipants, setNewMaxParticipants] = useState(8);
  const [newStartDate, setNewStartDate] = useState('');
  const [newPrizeFirst, setNewPrizeFirst] = useState('10,000 DA + Championship Trophy');
  const [newPrizeSecond, setNewPrizeSecond] = useState('5,000 DA');
  const [newPrizeThird, setNewPrizeThird] = useState('2,500 DA');
  const [newSeedType, setNewSeedType] = useState<'ELO_SEEDED' | 'RANDOM'>('ELO_SEEDED');
  const [newApplyMMR, setNewApplyMMR] = useState(true);
  const [creating, setCreating] = useState(false);

  // Match Update Modal State
  const [editingMatch, setEditingMatch] = useState<TournamentMatch | null>(null);
  const [matchScoreA, setMatchScoreA] = useState(0);
  const [matchScoreB, setMatchScoreB] = useState(0);
  const [matchWinnerId, setMatchWinnerId] = useState('');
  const [matchStation, setMatchStation] = useState('PC-01');
  const [savingMatch, setSavingMatch] = useState(false);

  // Complete & Announce Winner Modal State
  const [showWinnerModal, setShowWinnerModal] = useState(false);
  const [winnerParticipantId, setWinnerParticipantId] = useState('');
  const [runnerUpParticipantId, setRunnerUpParticipantId] = useState('');
  const [thirdPlaceParticipantId, setThirdPlaceParticipantId] = useState('');
  const [adminNotes, setAdminNotes] = useState('Officially certified by Nexus Staff.');
  const [announcing, setAnnouncing] = useState(false);

  // 5v5 Team Tournament Registrations State
  const [pendingTeamRegistrations, setPendingTeamRegistrations] = useState<TeamTournamentRegistration[]>([]);
  const [reviewingTeamRegistration, setReviewingTeamRegistration] = useState<TeamTournamentRegistration | null>(null);
  const [adminTab, setAdminTab] = useState<'TOURNAMENTS' | 'PENDING_TEAMS'>('TOURNAMENTS');
  const [managingTournamentId, setManagingTournamentId] = useState<string | null>(null);
  const [editingTournamentForModal, setEditingTournamentForModal] = useState<Tournament | null>(null);

  useEffect(() => {
    const unsub = subscribeToAllTournaments((list) => {
      setTournaments(list);
      setLoading(false);

      // Keep selectedTournament in sync if open
      if (selectedTournament) {
        const found = list.find((t) => t.id === selectedTournament.id);
        if (found) setSelectedTournament(found);
      }
    });

    const unsubTeams = subscribeToPendingTeamRegistrations((regs) => {
      setPendingTeamRegistrations(regs);
    });

    return () => {
      unsub();
      unsubTeams();
    };
  }, [selectedTournament?.id]);

  const handleCreateTournament = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !isAdmin) return;

    if (!newName.trim()) {
      showToast('error', 'Validation Error', 'Tournament name is required.');
      return;
    }

    setCreating(true);
    try {
      const scheduledTime = newStartDate ? new Date(newStartDate).getTime() : Date.now() + 86400000;
      const gameCategory = newGameId === 'chess' ? 'CHESS' : newGameId === 'fc25' || newGameId === 'fc24' ? 'PS5' : 'PC';

      const createdId = await createTournament({
        name: newName.trim(),
        gameId: newGameId,
        gameName: newGameName,
        gameCategory,
        type: newType,
        format: newFormat,
        maxParticipants: newMaxParticipants,
        startDate: scheduledTime,
        prizes: {
          firstPlace: newPrizeFirst,
          secondPlace: newPrizeSecond,
          thirdPlace: newPrizeThird,
        },
        applyMMR: newApplyMMR,
        createdById: user.uid,
        createdByName: playerProfile?.gamerTag || 'Nexus Admin',
      });
      showToast('success', 'Tournament Created', `Tournament "${newName}" is now open for registration!`);
      setShowCreateModal(false);
      // Reset form
      setNewName('');
    } catch (err: any) {
      showToast('error', 'Failed to Create', err.message || 'Error creating tournament.');
    } finally {
      setCreating(false);
    }
  };

  const handleGenerateBracket = async (t: Tournament) => {
    if (!confirm(`Generate official bracket for "${t.name}" with ${t.participants?.length || 0} participants?`)) {
      return;
    }

    try {
      const res = await generateAndLockBracket(t.id);
      if (!res.success) {
        throw new Error(res.error || 'Failed to generate bracket');
      }
      showToast('success', 'Bracket Generated', 'Seeding completed and bracket generated.');
      const updated = await fetchTournamentById(t.id);
      if (updated) setSelectedTournament(updated);
    } catch (err: any) {
      showToast('error', 'Generation Error', err.message || 'Could not generate bracket.');
    }
  };

  const handleSetStatus = async (tournamentId: string, status: any) => {
    try {
      await updateTournamentStatus(tournamentId, status);
      showToast('info', 'Status Updated', `Tournament status set to ${status}`);
    } catch (err: any) {
      showToast('error', 'Error', err.message || 'Could not update status');
    }
  };

  const handleOpenEditMatch = (m: TournamentMatch) => {
    setEditingMatch(m);
    setMatchScoreA(m.scoreA || 0);
    setMatchScoreB(m.scoreB || 0);
    setMatchWinnerId(m.winnerId || '');
    setMatchStation(m.station || 'PC-01');
  };

  const handleSaveMatchResult = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTournament || !editingMatch) return;

    setSavingMatch(true);
    try {
      const res = await updateTournamentMatchResult({
        tournamentId: selectedTournament.id,
        matchId: editingMatch.id,
        scoreA: matchScoreA,
        scoreB: matchScoreB,
        winnerId: matchWinnerId,
        station: matchStation,
      });

      if (!res.success) {
        throw new Error(res.error || 'Could not record match result');
      }

      showToast('success', 'Match Updated', 'Bracket match result recorded.');
      setEditingMatch(null);
      const updated = await fetchTournamentById(selectedTournament.id);
      if (updated) setSelectedTournament(updated);
    } catch (err: any) {
      showToast('error', 'Update Error', err.message || 'Could not record match result.');
    } finally {
      setSavingMatch(false);
    }
  };

  const handleOpenAnnounceWinner = (t: Tournament) => {
    setSelectedTournament(t);
    // Suggest 1st place if grand final match has a winner
    const grandFinal = t.matches?.find((m) => m.round === Math.max(...(t.matches.map((x) => x.round) || [1])));
    if (grandFinal?.winnerId) {
      setWinnerParticipantId(grandFinal.winnerId);
      const runnerUp = grandFinal.winnerId === grandFinal.participantA?.id ? grandFinal.participantB?.id : grandFinal.participantA?.id;
      if (runnerUp) setRunnerUpParticipantId(runnerUp);
    }
    setShowWinnerModal(true);
  };

  const handleConfirmWinnerAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTournament || !winnerParticipantId) {
      showToast('error', 'Selection Required', 'Please select the 1st place winner.');
      return;
    }

    setAnnouncing(true);
    try {
      await completeTournamentAndAnnounceWinner(
        selectedTournament.id,
        winnerParticipantId,
        runnerUpParticipantId || undefined,
        thirdPlaceParticipantId || undefined,
        adminNotes
      );

      showToast('success', 'Winner Announced!', `Official champions for ${selectedTournament.name} announced and achievements awarded.`);
      setShowWinnerModal(false);
      const updated = await fetchTournamentById(selectedTournament.id);
      if (updated) setSelectedTournament(updated);
    } catch (err: any) {
      showToast('error', 'Announcement Failed', err.message || 'Could not finalize tournament.');
    } finally {
      setAnnouncing(false);
    }
  };

  if (managingTournamentId) {
    return (
      <div className="space-y-6 animate-in fade-in">
        <AdminTournamentDashboard
          tournamentId={managingTournamentId}
          onBack={() => setManagingTournamentId(null)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in">
      {/* Admin Tournament Banner */}
      <div className="p-6 sm:p-8 rounded-3xl bg-[#0d0f18] border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 shadow-xl">
        <div className="space-y-2 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-xs font-mono font-bold">
            <Trophy className="w-3.5 h-3.5" />
            <span>NEXUS TOURNAMENT COMMISSION</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black font-display text-white tracking-tight">
            TOURNAMENT OPERATIONS & BRACKETS
          </h2>
          <p className="text-xs sm:text-sm text-slate-300">
            Create 1v1 and 5v5 tournaments, manage competitor rosters, seed brackets, record referee match scores, and officially crown champions to the main dashboard and player profiles.
          </p>
        </div>

        {isAdmin && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-6 py-3.5 rounded-2xl bg-gradient-to-r from-yellow-400 to-amber-500 hover:from-yellow-300 hover:to-amber-400 text-black font-mono font-black text-xs uppercase tracking-wider transition-all shadow-[0_0_20px_rgba(234,179,8,0.3)] shrink-0 flex items-center gap-2 active:scale-95 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Create New Tournament</span>
          </button>
        )}
      </div>

      {/* Admin Sub-Navigation Tabs */}
      <div className="flex items-center space-x-2 border-b border-slate-800 pb-3">
        <button
          id="admin-tournaments-tab-btn"
          onClick={() => setAdminTab('TOURNAMENTS')}
          className={`px-4 py-2 rounded-xl text-xs font-mono font-bold uppercase tracking-wider transition-all flex items-center space-x-2 ${
            adminTab === 'TOURNAMENTS'
              ? 'bg-yellow-400 text-black shadow-lg shadow-yellow-400/20'
              : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Trophy className="w-4 h-4" />
          <span>Tournaments & Brackets ({tournaments.length})</span>
        </button>

        <button
          id="admin-pending-teams-tab-btn"
          onClick={() => setAdminTab('PENDING_TEAMS')}
          className={`px-4 py-2 rounded-xl text-xs font-mono font-bold uppercase tracking-wider transition-all flex items-center space-x-2 ${
            adminTab === 'PENDING_TEAMS'
              ? 'bg-cyan-500 text-black shadow-lg shadow-cyan-500/20'
              : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Shield className="w-4 h-4" />
          <span>Pending 5v5 Team Approvals</span>
          {pendingTeamRegistrations.length > 0 && (
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
              adminTab === 'PENDING_TEAMS' ? 'bg-black text-cyan-400' : 'bg-rose-500 text-white animate-pulse'
            }`}>
              {pendingTeamRegistrations.length}
            </span>
          )}
        </button>
      </div>

      {/* PENDING 5V5 TEAMS REVIEW SECTION */}
      {adminTab === 'PENDING_TEAMS' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-black font-display text-white uppercase tracking-tight">
              5v5 TEAM REGISTRATIONS AWAITING ADMIN APPROVAL ({pendingTeamRegistrations.length})
            </h3>
            <span className="text-xs text-slate-400">
              Only manually approved teams become official tournament participants.
            </span>
          </div>

          {pendingTeamRegistrations.length === 0 ? (
            <div className="p-12 rounded-3xl bg-[#0a0a0f] border border-slate-800 text-center space-y-3">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
              <h4 className="text-sm font-bold text-white font-display">No Pending Squad Registrations</h4>
              <p className="text-xs text-slate-400 font-mono max-w-sm mx-auto">
                All submitted 5v5 team tournament registrations have been reviewed. New submissions from team captains will appear here in real-time.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {pendingTeamRegistrations.map((reg) => {
                const tourney = tournaments.find((t) => t.id === reg.tournamentId);
                const confirmedCount = tourney?.participants.length || 0;
                const maxCount = tourney?.maxParticipants || 16;
                const isFull = confirmedCount >= maxCount;

                return (
                  <div
                    key={reg.id}
                    className="p-5 rounded-2xl bg-[#0a0c14] border border-slate-800 hover:border-cyan-500/50 transition-all space-y-4 shadow-lg"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 text-[10px] font-mono font-bold uppercase border border-indigo-500/30">
                            {reg.gameName}
                          </span>
                          <span className="text-xs text-slate-400 font-medium">
                            {reg.tournamentName}
                          </span>
                        </div>
                        <h4 className="text-lg font-bold text-white mt-1">
                          {reg.teamName} {reg.teamTag && <span className="text-cyan-400 font-mono text-sm">[{reg.teamTag}]</span>}
                        </h4>
                      </div>

                      <span className="px-2.5 py-1 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-mono font-bold flex items-center space-x-1.5">
                        <Clock className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                        <span>Pending Review</span>
                      </span>
                    </div>

                    {/* Captain & Roster Overview */}
                    <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 flex items-center space-x-1">
                          <Crown className="w-3.5 h-3.5 text-amber-400" />
                          <span>Captain:</span>
                        </span>
                        <strong className="text-slate-200">{reg.captainGamerTag} ({reg.captainFullName})</strong>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 flex items-center space-x-1">
                          <Phone className="w-3.5 h-3.5 text-slate-400" />
                          <span>Captain Contact:</span>
                        </span>
                        <strong className="text-cyan-300 font-mono">{reg.captainPhone}</strong>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Roster Status:</span>
                        <span className={countCompletedDistinctPlayers(reg.slots, reg.captainPhone) === 5 ? "text-emerald-400 font-semibold" : "text-amber-400 font-semibold"}>
                          {countCompletedDistinctPlayers(reg.slots, reg.captainPhone)} / 5 Players Verified
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Tournament Capacity:</span>
                        <span className={isFull ? 'text-rose-400 font-bold' : 'text-slate-300'}>
                          {confirmedCount} / {maxCount} Teams Confirmed {isFull && '(Full)'}
                        </span>
                      </div>
                    </div>

                    {/* Review CTA */}
                    <div className="flex items-center justify-end pt-2 border-t border-slate-800/80">
                      <button
                        id={`review-team-${reg.id}-btn`}
                        onClick={() => setReviewingTeamRegistration(reg)}
                        className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-400 hover:to-indigo-500 text-white font-mono font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center space-x-2 shadow-md shadow-purple-500/20"
                      >
                        <Shield className="w-4 h-4" />
                        <span>Review 5-Player Squad</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* List of Tournaments */}
      {adminTab === 'TOURNAMENTS' && (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-black font-display text-white uppercase tracking-tight">
            ACTIVE & RECENT TOURNAMENTS ({tournaments.length})
          </h3>
        </div>

        {loading ? (
          <div className="py-12 text-center text-slate-400 font-mono text-xs">
            Loading tournament database...
          </div>
        ) : tournaments.length === 0 ? (
          <div className="p-12 rounded-3xl bg-[#0a0a0f] border border-slate-800 text-center space-y-3">
            <Trophy className="w-10 h-10 text-slate-600 mx-auto" />
            <h4 className="text-sm font-bold text-white font-display">No Tournaments Created Yet</h4>
            <p className="text-xs text-slate-400 font-mono max-w-sm mx-auto">
              Click &quot;Create New Tournament&quot; above to organize your first Nexus Gaming Center esports tournament.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {tournaments.map((t) => {
              const isSelected = selectedTournament?.id === t.id;
              const hasBracket = t.matches && t.matches.length > 0;

              return (
                <div
                  key={t.id}
                  className={`p-5 rounded-3xl border transition-all space-y-4 flex flex-col justify-between ${
                    isSelected
                      ? 'bg-[#141624] border-cyan-400 shadow-xl'
                      : 'bg-[#0a0c14] border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="px-2.5 py-1 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-mono font-bold uppercase">
                        {t.gameName}
                      </span>

                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-black uppercase border ${
                          t.status === 'LIVE'
                            ? 'bg-red-500/20 text-red-400 border-red-500/50'
                            : t.status === 'COMPLETED'
                            ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/50'
                            : t.status === 'REGISTRATION_OPEN'
                            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50'
                            : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}
                      >
                        {t.status.replace('_', ' ')}
                      </span>
                    </div>

                    <div>
                      <h4 className="text-lg font-black font-display text-white">
                        {t.name}
                      </h4>
                      <div className="text-xs font-mono text-slate-400 mt-1 flex items-center gap-2">
                        <span>{t.type === 'TEAM' ? '5v5 Squad' : '1v1 Individual'}</span>
                        <span>•</span>
                        <span>{t.format.replace('_', ' ')}</span>
                      </div>
                    </div>

                    <div className="p-3 rounded-2xl bg-[#0f111d] border border-slate-800 space-y-1.5 text-xs font-mono">
                      <div className="flex items-center justify-between text-slate-400">
                        <span>Roster:</span>
                        <strong className="text-white">
                          {t.participants?.length || 0} / {t.maxParticipants}
                        </strong>
                      </div>
                      <div className="flex items-center justify-between text-slate-400">
                        <span>Bracket:</span>
                        <span className={hasBracket ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                          {hasBracket ? `${t.matches?.length} Matches` : 'Not Generated'}
                        </span>
                      </div>
                      {t.winnerName && (
                        <div className="flex items-center justify-between text-yellow-400 pt-1 border-t border-slate-800 font-bold">
                          <span>Champion:</span>
                          <span className="truncate">{t.winnerName}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Admin Action Buttons */}
                  <div className="space-y-2 pt-2 border-t border-slate-800">
                    {/* Primary Dashboard CTA */}
                    <button
                      id={`manage-tournament-${t.id}-btn`}
                      onClick={() => setManagingTournamentId(t.id)}
                      className="w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-black font-mono font-black text-xs uppercase tracking-wider transition-all flex items-center justify-center space-x-2 shadow-md shadow-cyan-500/20 active:scale-95 cursor-pointer"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      <span>{isAdmin ? '⚙️ Manage Tournament & Details' : '👁️ View Tournament Details'}</span>
                    </button>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setSelectedTournament(isSelected ? null : t)}
                        className={`px-3 py-2 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-cyan-400 text-black'
                            : 'bg-slate-900 hover:bg-slate-800 text-slate-300'
                        }`}
                      >
                        {isSelected ? 'Close Quick View' : 'Quick Matches'}
                      </button>

                      {!hasBracket ? (
                        isAdmin ? (
                          <button
                            onClick={() => handleGenerateBracket(t)}
                            disabled={(t.participants?.length || 0) < 2}
                            className="px-3 py-2 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/40 text-purple-300 text-xs font-mono font-bold disabled:opacity-50 transition-all cursor-pointer"
                          >
                            Seed Bracket
                          </button>
                        ) : (
                          <span className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-500 text-xs font-mono text-center">
                            Awaiting Bracket
                          </span>
                        )
                      ) : t.status !== 'COMPLETED' ? (
                        isAdmin ? (
                          <button
                            onClick={() => handleOpenAnnounceWinner(t)}
                            className="px-3 py-2 rounded-xl bg-yellow-500/20 hover:bg-yellow-500/30 border border-yellow-500/40 text-yellow-300 text-xs font-mono font-bold transition-all flex items-center justify-center gap-1 cursor-pointer"
                          >
                            <Crown className="w-3.5 h-3.5 text-yellow-400" />
                            <span>Announce Winner</span>
                          </button>
                        ) : (
                          <span className="px-3 py-2 rounded-xl bg-purple-500/10 text-purple-300 border border-purple-500/20 text-xs font-mono text-center">
                            Bracket Active
                          </span>
                        )
                      ) : (
                        <span className="px-3 py-2 rounded-xl bg-yellow-400/10 text-yellow-400 text-xs font-mono font-bold text-center">
                          Crown Awarded
                        </span>
                      )}
                    </div>

                    {/* Quick status dropdown */}
                    {isAdmin && (
                      <div className="flex items-center justify-between text-[11px] font-mono pt-1 text-slate-400">
                        <span>Status:</span>
                        <div className="flex items-center gap-1.5">
                          {t.status === 'REGISTRATION_OPEN' && (
                            <button
                              onClick={() => handleSetStatus(t.id, 'UPCOMING')}
                              className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-cyan-400 text-[10px] cursor-pointer"
                            >
                              Close Reg
                            </button>
                          )}
                          {t.status !== 'LIVE' && t.status !== 'COMPLETED' && hasBracket && (
                            <button
                              onClick={() => handleSetStatus(t.id, 'LIVE')}
                              className="px-2 py-0.5 rounded bg-red-500/20 hover:bg-red-500/30 text-red-400 text-[10px] font-bold cursor-pointer"
                            >
                              Go Live
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      )}

      {/* Selected Tournament Match Management Console */}
      {selectedTournament && (
        <div className="p-6 sm:p-8 rounded-3xl bg-[#0c0e18] border-2 border-cyan-400/60 shadow-2xl space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div>
              <span className="text-xs font-mono font-bold text-cyan-400 uppercase tracking-wider">
                Active Bracket Management Console
              </span>
              <h3 className="text-2xl font-black font-display text-white">
                {selectedTournament.name}
              </h3>
            </div>

            <div className="flex items-center gap-3">
              {(!selectedTournament.matches || selectedTournament.matches.length === 0) ? (
                <button
                  onClick={() => handleGenerateBracket(selectedTournament)}
                  disabled={(selectedTournament.participants?.length || 0) < 2}
                  className="px-4 py-2 rounded-xl bg-purple-500 hover:bg-purple-400 text-white font-mono font-bold text-xs uppercase"
                >
                  Generate Official Bracket
                </button>
              ) : selectedTournament.status !== 'COMPLETED' && (
                <button
                  onClick={() => handleOpenAnnounceWinner(selectedTournament)}
                  className="px-4 py-2 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-black font-mono font-black text-xs uppercase flex items-center gap-2 shadow-[0_0_15px_rgba(234,179,8,0.3)]"
                >
                  <Crown className="w-4 h-4" />
                  <span>Crown & Announce Champion</span>
                </button>
              )}
            </div>
          </div>

          {/* Matches Referee Table */}
          {(!selectedTournament.matches || selectedTournament.matches.length === 0) ? (
            <div className="text-center py-12 text-slate-500 text-xs font-mono">
              Bracket has not been generated yet. Add participants and click &quot;Generate Official Bracket&quot;.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="text-xs font-mono text-slate-400">
                Click any match to referee, assign gaming station, or submit final match scores:
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {selectedTournament.matches.map((m) => {
                  const isDone = m.status === 'COMPLETED';

                  return (
                    <div
                      key={m.id}
                      onClick={() => handleOpenEditMatch(m)}
                      className={`p-4 rounded-2xl border transition-all cursor-pointer space-y-3 ${
                        isDone
                          ? 'bg-[#0a0c13] border-slate-800 hover:border-slate-700'
                          : 'bg-[#10121e] border-cyan-500/30 hover:border-cyan-400 shadow-md'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[10px] font-mono">
                        <span className="text-cyan-400 font-bold">
                          Round {m.round} • Match #{m.matchNumber}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded font-black uppercase ${
                            isDone ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
                          }`}
                        >
                          {m.status}
                        </span>
                      </div>

                      {/* Opponents */}
                      <div className="space-y-1 text-xs font-mono">
                        <div
                          className={`p-2 rounded-xl flex items-center justify-between ${
                            m.winnerId === m.participantAId
                              ? 'bg-yellow-500/10 text-yellow-300 font-bold border border-yellow-500/30'
                              : 'bg-slate-900 text-slate-300'
                          }`}
                        >
                          <span className="truncate">{m.participantAName || 'TBD'}</span>
                          <span>{m.scoreA !== undefined ? m.scoreA : '-'}</span>
                        </div>

                        <div
                          className={`p-2 rounded-xl flex items-center justify-between ${
                            m.winnerId === m.participantBId
                              ? 'bg-yellow-500/10 text-yellow-300 font-bold border border-yellow-500/30'
                              : 'bg-slate-900 text-slate-300'
                          }`}
                        >
                          <span className="truncate">{m.participantBName || 'TBD'}</span>
                          <span>{m.scoreB !== undefined ? m.scoreB : '-'}</span>
                        </div>
                      </div>

                      <div className="text-[10px] font-mono text-slate-500 flex items-center justify-between">
                        <span>Station: {m.station || 'Unassigned'}</span>
                        <span className="text-cyan-400 font-bold">Edit Match Result →</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal: Create Tournament */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-2xl bg-[#0c0e18] border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl my-8">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-yellow-400 text-black font-black">
                  <Trophy className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black font-display text-white">
                    CREATE NEXUS TOURNAMENT
                  </h3>
                  <p className="text-xs text-slate-400 font-mono">
                    Configure tournament format, game title, and championship prizes
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateTournament} className="space-y-4 text-xs font-mono">
              <div>
                <label className="block text-slate-400 uppercase text-[10px] font-bold mb-1">
                  Tournament Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Nexus Autumn Valorant Championship 2026"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-yellow-400"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-400 uppercase text-[10px] font-bold mb-1">
                    Game Title *
                  </label>
                  <select
                    value={newGameId}
                    onChange={(e) => {
                      setNewGameId(e.target.value);
                      const names: Record<string, string> = {
                        valorant: 'Valorant',
                        cs2: 'CS2',
                        chess: 'Chess',
                        fc26: 'FC 26',
                        fc27: 'FC 27',
                      };
                      setNewGameName(names[e.target.value] || e.target.value);
                    }}
                    className="w-full px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-yellow-400"
                  >
                    <option value="valorant">Valorant (PC)</option>
                    <option value="cs2">CS2 (PC)</option>
                    <option value="chess">Chess (Board)</option>
                    <option value="fc26">FC 26 (PS5 Pro)</option>
                    <option value="fc27">FC 27 (PS5 Pro)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 uppercase text-[10px] font-bold mb-1">
                    Contestant Type *
                  </label>
                  <select
                    value={newType}
                    onChange={(e: any) => setNewType(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-yellow-400"
                  >
                    <option value="INDIVIDUAL">1v1 Individual Players</option>
                    <option value="TEAM">5v5 Squad Teams</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-400 uppercase text-[10px] font-bold mb-1">
                    Format *
                  </label>
                  <select
                    value={newFormat}
                    onChange={(e: any) => setNewFormat(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-yellow-400"
                  >
                    <option value="SINGLE_ELIMINATION">Single Elimination Bracket</option>
                    <option value="DOUBLE_ELIMINATION">Double Elimination Bracket</option>
                    <option value="ROUND_ROBIN">Round Robin</option>
                    <option value="GROUP_STAGE_KNOCKOUT">Group Stage + Knockout</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 uppercase text-[10px] font-bold mb-1">
                    Max Slots (Contestants)
                  </label>
                  <select
                    value={newMaxParticipants}
                    onChange={(e) => setNewMaxParticipants(Number(e.target.value))}
                    className="w-full px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-yellow-400"
                  >
                    <option value={4}>4 Participants</option>
                    <option value={8}>8 Participants</option>
                    <option value={16}>16 Participants</option>
                    <option value={32}>32 Participants</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-400 uppercase text-[10px] font-bold mb-1">
                    Seeding Strategy
                  </label>
                  <select
                    value={newSeedType}
                    onChange={(e: any) => setNewSeedType(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-yellow-400"
                  >
                    <option value="ELO_SEEDED">Seeded by Verified Nexus ELO</option>
                    <option value="RANDOM">Randomized Draw</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 uppercase text-[10px] font-bold mb-1">
                    Scheduled Start Date & Time
                  </label>
                  <input
                    type="datetime-local"
                    value={newStartDate}
                    onChange={(e) => setNewStartDate(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-yellow-400"
                  />
                </div>
              </div>

              {/* Prize Pool Details */}
              <div className="p-4 rounded-2xl bg-[#070910] border border-slate-800 space-y-3">
                <div className="text-yellow-400 font-bold uppercase text-[10px] flex items-center gap-1.5">
                  <Crown className="w-3.5 h-3.5" />
                  <span>Championship Rewards & Prizes</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <span className="text-slate-400 text-[9px] uppercase">1st Place Prize</span>
                    <input
                      type="text"
                      value={newPrizeFirst}
                      onChange={(e) => setNewPrizeFirst(e.target.value)}
                      className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-white text-xs mt-1"
                    />
                  </div>
                  <div>
                    <span className="text-slate-400 text-[9px] uppercase">2nd Place Prize</span>
                    <input
                      type="text"
                      value={newPrizeSecond}
                      onChange={(e) => setNewPrizeSecond(e.target.value)}
                      className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-white text-xs mt-1"
                    />
                  </div>
                  <div>
                    <span className="text-slate-400 text-[9px] uppercase">3rd Place Prize</span>
                    <input
                      type="text"
                      value={newPrizeThird}
                      onChange={(e) => setNewPrizeThird(e.target.value)}
                      className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-white text-xs mt-1"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="applyMMR"
                  checked={newApplyMMR}
                  onChange={(e) => setNewApplyMMR(e.target.checked)}
                  className="rounded border-slate-800 text-yellow-400 focus:ring-0"
                />
                <label htmlFor="applyMMR" className="text-slate-300 text-xs">
                  Apply official game MMR changes to participants upon match completion
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-900 text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-6 py-2.5 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-black font-bold uppercase transition-all shadow-md"
                >
                  {creating ? 'Creating Tournament...' : 'Publish Tournament'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Match Result */}
      {editingMatch && selectedTournament && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-[#0c0e18] border border-slate-800 rounded-3xl p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h4 className="text-base font-black font-display text-white">
                  REFEREE MATCH #{editingMatch.matchNumber}
                </h4>
                <p className="text-xs text-slate-400 font-mono">
                  Round {editingMatch.round} • {selectedTournament.gameName}
                </p>
              </div>
              <button
                onClick={() => setEditingMatch(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveMatchResult} className="space-y-4 text-xs font-mono">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800 space-y-2">
                  <span className="text-slate-400 text-[10px] uppercase font-bold">
                    Contestant A
                  </span>
                  <div className="text-sm font-bold text-white truncate">
                    {editingMatch.participantAName || 'TBD'}
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

                <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800 space-y-2">
                  <span className="text-slate-400 text-[10px] uppercase font-bold">
                    Contestant B
                  </span>
                  <div className="text-sm font-bold text-white truncate">
                    {editingMatch.participantBName || 'TBD'}
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
                <label className="block text-slate-400 uppercase text-[10px] font-bold mb-1">
                  Declare Match Winner
                </label>
                <select
                  value={matchWinnerId}
                  onChange={(e) => setMatchWinnerId(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white"
                >
                  <option value="">Match Still in Progress (No Winner Yet)</option>
                  {editingMatch.participantAId && (
                    <option value={editingMatch.participantAId}>
                      Winner: {editingMatch.participantAName}
                    </option>
                  )}
                  {editingMatch.participantBId && (
                    <option value={editingMatch.participantBId}>
                      Winner: {editingMatch.participantBName}
                    </option>
                  )}
                </select>
              </div>

              <div>
                <label className="block text-slate-400 uppercase text-[10px] font-bold mb-1">
                  Gaming Station Assigned
                </label>
                <input
                  type="text"
                  placeholder="e.g. PC-01 or PS5-02"
                  value={matchStation}
                  onChange={(e) => setMatchStation(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white"
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
                  className="px-5 py-2 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-black font-bold uppercase transition-all"
                >
                  {savingMatch ? 'Saving...' : 'Save Match Result'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Complete Tournament & Announce Winner */}
      {showWinnerModal && selectedTournament && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="w-full max-w-lg bg-[#0e101c] border-2 border-yellow-500/60 rounded-3xl p-6 sm:p-8 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-yellow-400 text-black text-xl">
                  👑
                </div>
                <div>
                  <h3 className="text-lg font-black font-display text-white">
                    OFFICIAL WINNER ANNOUNCEMENT
                  </h3>
                  <p className="text-xs text-yellow-300 font-mono">
                    Admin Confirmation & Hall of Champions Immortalization
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

            <p className="text-xs font-mono text-slate-300 leading-relaxed">
              Confirming this announcement will officially complete &quot;{selectedTournament.name}&quot;, publish the champion to the main dashboard showcase, and bestow permanent tournament achievements on the winners&apos; player dossiers.
            </p>

            <form onSubmit={handleConfirmWinnerAnnouncement} className="space-y-4 text-xs font-mono">
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
                  {selectedTournament.participants?.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.seedRank ? `${p.seedRank} ELO` : 'Contestant'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-400 uppercase text-[10px] font-bold mb-1">
                  🥈 2nd Place Finalist (Runner-Up)
                </label>
                <select
                  value={runnerUpParticipantId}
                  onChange={(e) => setRunnerUpParticipantId(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white"
                >
                  <option value="">None / Optional</option>
                  {selectedTournament.participants?.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-400 uppercase text-[10px] font-bold mb-1">
                  🥉 3rd Place
                </label>
                <select
                  value={thirdPlaceParticipantId}
                  onChange={(e) => setThirdPlaceParticipantId(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white"
                >
                  <option value="">None / Optional</option>
                  {selectedTournament.participants?.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-400 uppercase text-[10px] font-bold mb-1">
                  Official Nexus Commission Certification Note
                </label>
                <textarea
                  rows={2}
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowWinnerModal(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-900 text-slate-400"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={announcing || !winnerParticipantId}
                  className="px-6 py-2.5 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-black font-black uppercase tracking-wider transition-all shadow-[0_0_20px_rgba(234,179,8,0.4)]"
                >
                  {announcing ? 'Confirming...' : 'CONFIRM & ANNOUNCE WINNER'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5v5 Team Roster Admin Review Modal */}
      {reviewingTeamRegistration && (
        <AdminTeamTournamentReviewModal
          isOpen={Boolean(reviewingTeamRegistration)}
          onClose={() => setReviewingTeamRegistration(null)}
          registration={reviewingTeamRegistration}
          tournament={tournaments.find((t) => t.id === reviewingTeamRegistration.tournamentId)}
          adminUser={playerProfile || (user as unknown as Player)}
          onReviewed={() => {
            showToast('success', 'Roster Verified', `Action completed for team "${reviewingTeamRegistration.teamName}".`);
            setReviewingTeamRegistration(null);
          }}
        />
      )}
    </div>
  );
};
