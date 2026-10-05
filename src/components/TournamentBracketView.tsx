import React, { useState, useEffect } from 'react';
import { Tournament, TournamentMatch, TournamentParticipant, Player, TeamTournamentRegistration } from '../types';
import {
  Trophy,
  Crown,
  Calendar,
  Clock,
  Users,
  Shield,
  Gamepad2,
  Medal,
  ChevronRight,
  Info,
  CheckCircle2,
  AlertTriangle,
  Play,
  ArrowRight,
  Lock,
  UserCheck,
  UserPlus,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  registerForTournament,
  withdrawFromTournament,
  fetchTournamentById,
  subscribeToTournamentById,
  subscribeToPlayerRegistrationsForTournament,
  subscribeToTeamRegistrationsForTournament,
} from '../services/tournamentService';
import { useToast } from './Toast';
import { TeamTournamentRegistrationModal } from './TeamTournamentRegistrationModal';
import { TournamentTeamsSection } from './TournamentTeamsSection';
import { AdminTeamTournamentReviewModal } from './AdminTeamTournamentReviewModal';
import { InteractiveTournamentBracketMap } from './InteractiveTournamentBracketMap';
import { TournamentLiveCenter } from './TournamentLiveCenter';

interface TournamentBracketViewProps {
  tournament: Tournament;
  onBack: () => void;
  onOpenAuth: (mode?: 'login' | 'register') => void;
  onRefreshTournament?: () => void;
  onSelectParticipant?: (id: string, type: 'PLAYER' | 'TEAM') => void;
}

export const TournamentBracketView: React.FC<TournamentBracketViewProps> = ({
  tournament: initialTournament,
  onBack,
  onOpenAuth,
  onRefreshTournament,
  onSelectParticipant,
}) => {
  const { user, playerProfile, isAdmin } = useAuth();
  const { showToast } = useToast();
  const [tournament, setTournament] = useState<Tournament>(initialTournament);
  const [registering, setRegistering] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);

  // 5v5 Team Tournament State
  const [userTeamRegistration, setUserTeamRegistration] = useState<TeamTournamentRegistration | null>(null);
  const [allTeamRegistrations, setAllTeamRegistrations] = useState<TeamTournamentRegistration[]>([]);
  const [showTeamRegistrationModal, setShowTeamRegistrationModal] = useState(false);
  const [managingTeamRegistration, setManagingTeamRegistration] = useState<TeamTournamentRegistration | null>(null);
  const [reviewingTeamRegistration, setReviewingTeamRegistration] = useState<TeamTournamentRegistration | null>(null);
  const [activeViewMode, setActiveViewMode] = useState<'LIVE_CENTER' | 'BRACKET_MAP'>('LIVE_CENTER');

  useEffect(() => {
    setTournament(initialTournament);
    const unsub = subscribeToTournamentById(initialTournament.id, (liveTournament) => {
      if (liveTournament) {
        setTournament(liveTournament);
      }
    });
    return () => unsub();
  }, [initialTournament.id]);

  // Subscribe to all team registrations for this tournament (live to all users)
  useEffect(() => {
    if (tournament.type !== 'TEAM') {
      setAllTeamRegistrations([]);
      return;
    }

    const unsub = subscribeToTeamRegistrationsForTournament(
      tournament.id,
      (list) => {
        setAllTeamRegistrations(list);
      }
    );

    return () => unsub();
  }, [tournament.id, tournament.type]);

  // Subscribe to user's team registration for this tournament
  useEffect(() => {
    if (!user || tournament.type !== 'TEAM') {
      setUserTeamRegistration(null);
      return;
    }

    const unsub = subscribeToPlayerRegistrationsForTournament(
      tournament.id,
      user.uid,
      (registrations) => {
        // Find active registration (or latest)
        if (registrations.length > 0) {
          setUserTeamRegistration(registrations[0]);
        } else {
          setUserTeamRegistration(null);
        }
      }
    );

    return () => unsub();
  }, [tournament.id, tournament.type, user?.uid]);

  const refreshCurrentTournament = async () => {
    try {
      const updated = await fetchTournamentById(tournament.id);
      if (updated) {
        setTournament(updated);
      }
      if (onRefreshTournament) {
        onRefreshTournament();
      }
    } catch (e) {
      console.error('Error refreshing tournament:', e);
    }
  };

  const isUserRegistered = user && (
    tournament.participants?.some((p) => p.id === user.uid || p.teamMemberIds?.includes(user.uid)) ||
    (tournament.type === 'TEAM' && userTeamRegistration?.status === 'CONFIRMED')
  );

  const handleRegister = async () => {
    if (!user || !playerProfile) {
      onOpenAuth('login');
      return;
    }

    // 5v5 Team Tournament: Open Squad Registration Room
    if (tournament.type === 'TEAM') {
      setShowTeamRegistrationModal(true);
      return;
    }

    setRegistering(true);
    try {
      const participant: TournamentParticipant = {
        id: user.uid,
        name: playerProfile.gamerTag,
        type: 'PLAYER',
        registeredAt: Date.now(),
        seed: (tournament.participants?.length || 0) + 1,
        currentMMR: playerProfile.overallRating || 1000,
      };

      await registerForTournament(tournament.id, participant);
      showToast('success', 'Registration Confirmed', `You are registered for ${tournament.name}!`);
      await refreshCurrentTournament();
    } catch (err: any) {
      showToast('error', 'Registration Failed', err.message || 'Could not complete registration.');
    } finally {
      setRegistering(false);
    }
  };

  const handleWithdraw = async () => {
    if (!user) return;
    if (!confirm('Are you sure you want to withdraw from this tournament?')) return;

    setWithdrawing(true);
    try {
      await withdrawFromTournament(tournament.id, user.uid);
      showToast('info', 'Withdrawn', 'You have been removed from the tournament roster.');
      await refreshCurrentTournament();
    } catch (err: any) {
      showToast('error', 'Withdrawal Failed', err.message || 'Could not withdraw.');
    } finally {
      setWithdrawing(false);
    }
  };

  // Group matches by round
  const matchesByRound: Record<number, TournamentMatch[]> = {};
  if (tournament.matches) {
    tournament.matches.forEach((m) => {
      if (!matchesByRound[m.round]) {
        matchesByRound[m.round] = [];
      }
      matchesByRound[m.round].push(m);
    });
  }

  const roundNumbers = Object.keys(matchesByRound)
    .map(Number)
    .sort((a, b) => a - b);

  const totalRounds = roundNumbers.length;

  const getRoundLabel = (round: number, total: number) => {
    if (round === total) return 'GRAND FINALS';
    if (round === total - 1 && total > 2) return 'SEMIFINALS';
    if (round === total - 2 && total > 3) return 'QUARTERFINALS';
    return `ROUND ${round}`;
  };

  return (
    <div className="space-y-8 animate-in fade-in">
      {/* Top Navigation & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-xs font-mono text-slate-400 hover:text-white transition-colors"
        >
          <span>← Back to All Tournaments</span>
        </button>

        <div className="flex items-center gap-2">
          <span
            className={`px-3 py-1 rounded-full text-xs font-mono font-black uppercase tracking-wider border ${
              tournament.status === 'LIVE'
                ? 'bg-red-500/20 text-red-400 border-red-500/50 animate-pulse'
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
      </div>

      {/* Tournament Details Banner */}
      <div className="p-6 sm:p-8 rounded-3xl bg-[#0b0d14] border border-slate-800 shadow-2xl relative overflow-hidden space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2 max-w-3xl">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="px-2.5 py-1 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-mono font-bold uppercase">
                {tournament.gameName}
              </span>
              <span className="px-2.5 py-1 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 text-xs font-mono">
                {tournament.type === 'TEAM' ? '5v5 Squads' : '1v1 Individual'}
              </span>
              <span className="px-2.5 py-1 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 text-xs font-mono">
                {tournament.format.replace('_', ' ')}
              </span>
            </div>

            <h1 className="text-2xl sm:text-4xl font-black font-display text-white tracking-tight">
              {tournament.name}
            </h1>

            {tournament.description && (
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-2xl">
                {tournament.description}
              </p>
            )}
          </div>

          {/* Registration / Status CTA */}
          <div className="flex flex-col sm:flex-row lg:flex-col items-stretch sm:items-center lg:items-end gap-3 shrink-0">
            {tournament.status === 'REGISTRATION_OPEN' && (
              <>
                {!user ? (
                  <button
                    onClick={() => onOpenAuth('login')}
                    className="px-6 py-3 rounded-2xl bg-cyan-400 hover:bg-cyan-300 text-black font-mono font-bold text-xs uppercase tracking-wider transition-all shadow-[0_0_20px_rgba(34,211,238,0.3)] flex items-center justify-center gap-2"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>{tournament.type === 'TEAM' ? 'Login to Register 5v5 Squad' : 'Login to Register'}</span>
                  </button>
                ) : tournament.type === 'TEAM' ? (
                  /* 5V5 TEAM REGISTRATION CTA */
                  userTeamRegistration ? (
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      <div className="px-4 py-2.5 rounded-2xl border font-mono text-xs flex items-center gap-2 bg-slate-900/90 border-slate-800">
                        {userTeamRegistration.status === 'CONFIRMED' && (
                          <>
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                            <span className="text-emerald-400 font-bold">Squad Confirmed: {userTeamRegistration.teamName}</span>
                          </>
                        )}
                        {userTeamRegistration.status === 'PENDING_ADMIN_APPROVAL' && (
                          <>
                            <Clock className="w-4 h-4 text-amber-400 animate-pulse" />
                            <span className="text-amber-300 font-bold">Pending Admin Approval ({userTeamRegistration.teamName})</span>
                          </>
                        )}
                        {userTeamRegistration.status === 'READY_TO_SUBMIT' && (
                          <>
                            <Sparkles className="w-4 h-4 text-cyan-400" />
                            <span className="text-cyan-300 font-bold">5/5 Players Ready - Submit Now!</span>
                          </>
                        )}
                        {(userTeamRegistration.status === 'WAITING_FOR_PLAYERS' || userTeamRegistration.status === 'DRAFT') && (
                          <>
                            <Users className="w-4 h-4 text-indigo-400" />
                            <span className="text-indigo-300 font-bold">
                              Roster Incomplete ({(userTeamRegistration.slots || []).filter((s) => s.status === 'ACCEPTED').length}/5 Players)
                            </span>
                          </>
                        )}
                        {userTeamRegistration.status === 'REJECTED' && (
                          <>
                            <AlertTriangle className="w-4 h-4 text-rose-400" />
                            <span className="text-rose-300 font-bold">Squad Rejected</span>
                          </>
                        )}
                      </div>

                      <button
                        id="manage-team-squad-btn"
                        onClick={() => setShowTeamRegistrationModal(true)}
                        className="px-5 py-2.5 rounded-2xl bg-cyan-400 hover:bg-cyan-300 text-black font-mono font-bold text-xs uppercase tracking-wider transition-all shadow-md flex items-center justify-center gap-2"
                      >
                        <Shield className="w-4 h-4" />
                        <span>Manage 5v5 Squad</span>
                      </button>
                    </div>
                  ) : (
                    <button
                      id="register-5v5-team-btn"
                      onClick={() => setShowTeamRegistrationModal(true)}
                      disabled={
                        registering ||
                        (tournament.maxParticipants &&
                          (tournament.participants?.length || 0) >= tournament.maxParticipants)
                      }
                      className="px-6 py-3 rounded-2xl bg-gradient-to-r from-yellow-400 via-amber-400 to-yellow-500 hover:from-yellow-300 hover:to-amber-300 text-black font-mono font-black text-xs uppercase tracking-wider transition-all shadow-[0_0_20px_rgba(234,179,8,0.3)] flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
                    >
                      <Users className="w-4 h-4" />
                      <span>
                        {(tournament.participants?.length || 0) >= (tournament.maxParticipants || 16)
                          ? 'Tournament Full (All Teams Filled)'
                          : 'Register 5v5 Team'}
                      </span>
                    </button>
                  )
                ) : isUserRegistered ? (
                  <div className="flex items-center gap-2">
                    <span className="px-4 py-2.5 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 font-mono text-xs font-bold flex items-center gap-2">
                      <UserCheck className="w-4 h-4" />
                      <span>You are Registered</span>
                    </span>
                    <button
                      onClick={handleWithdraw}
                      disabled={withdrawing}
                      className="px-3 py-2.5 rounded-2xl bg-slate-900 hover:bg-red-950/40 border border-slate-800 hover:border-red-500/40 text-slate-400 hover:text-red-400 text-xs font-mono transition-all"
                    >
                      {withdrawing ? '...' : 'Withdraw'}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={handleRegister}
                    disabled={
                      registering ||
                      (tournament.maxParticipants &&
                        (tournament.participants?.length || 0) >= tournament.maxParticipants)
                    }
                    className="px-6 py-3 rounded-2xl bg-gradient-to-r from-cyan-400 to-cyan-500 hover:from-cyan-300 hover:to-cyan-400 text-black font-mono font-black text-xs uppercase tracking-wider transition-all shadow-[0_0_20px_rgba(34,211,238,0.3)] flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>
                      {registering
                        ? 'Registering...'
                        : (tournament.participants?.length || 0) >= tournament.maxParticipants
                        ? 'Roster Full'
                        : 'Register for Tournament'}
                    </span>
                  </button>
                )}
              </>
            )}

            <div className="text-right text-xs font-mono text-slate-400">
              {tournament.type === 'TEAM' ? (
                <>
                  Confirmed Teams:{' '}
                  <strong className="text-white">
                    {tournament.participants?.length || 0} / {tournament.maxParticipants} Teams
                  </strong>
                  <div className="text-[10px] text-slate-500">
                    (1 Team = 1 Tournament Entry)
                  </div>
                </>
              ) : (
                <>
                  Slots:{' '}
                  <strong className="text-white">
                    {tournament.participants?.length || 0} / {tournament.maxParticipants}
                  </strong>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Tournament Champion Announcement Callout (If Completed) */}
        {tournament.status === 'COMPLETED' && tournament.winnerName && (
          <div className="p-6 rounded-3xl bg-gradient-to-r from-yellow-950/60 via-[#161208] to-amber-950/40 border-2 border-yellow-500/60 shadow-[0_0_30px_rgba(234,179,8,0.25)] flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-3xl bg-yellow-400 text-black font-black flex items-center justify-center text-3xl shadow-[0_0_20px_rgba(234,179,8,0.5)] shrink-0">
                👑
              </div>
              <div className="space-y-1">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-yellow-400/20 text-yellow-300 text-[10px] font-mono font-black uppercase tracking-wider">
                  <Sparkles className="w-3 h-3" />
                  <span>OFFICIALLY CROWNED CHAMPION</span>
                </div>
                <h3 className="text-2xl font-black font-display text-white">
                  {tournament.winnerName}
                </h3>
                {tournament.prizes?.firstPlace && (
                  <p className="text-xs font-mono text-yellow-200">
                    Grand Prize: {tournament.prizes.firstPlace}
                  </p>
                )}
              </div>
            </div>

            {(tournament.runnerUpName || tournament.thirdPlaceName) && (
              <div className="flex items-center gap-4 text-xs font-mono">
                {tournament.runnerUpName && (
                  <div className="text-right">
                    <div className="text-slate-400 text-[10px]">🥈 RUNNER-UP</div>
                    <div className="font-bold text-slate-200">{tournament.runnerUpName}</div>
                  </div>
                )}
                {tournament.thirdPlaceName && (
                  <div className="text-right">
                    <div className="text-slate-400 text-[10px]">🥉 3RD PLACE</div>
                    <div className="font-bold text-slate-200">{tournament.thirdPlaceName}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Metadata summary bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-slate-800 text-xs font-mono">
          <div className="p-3 rounded-2xl bg-[#12141e] border border-slate-800">
            <span className="text-slate-500 uppercase text-[10px]">Format</span>
            <div className="text-white font-bold mt-0.5">{tournament.format.replace('_', ' ')}</div>
          </div>

          <div className="p-3 rounded-2xl bg-[#12141e] border border-slate-800">
            <span className="text-slate-500 uppercase text-[10px]">Scheduled Start</span>
            <div className="text-white font-bold mt-0.5">
              {new Date(tournament.scheduledStartAt).toLocaleDateString()}{' '}
              {new Date(tournament.scheduledStartAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-[#12141e] border border-slate-800">
            <span className="text-slate-500 uppercase text-[10px]">Prize Pool</span>
            <div className="text-yellow-400 font-bold mt-0.5">
              {tournament.prizes?.firstPlace || 'Trophy & Glory'}
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-[#12141e] border border-slate-800">
            <span className="text-slate-500 uppercase text-[10px]">Tournament Seed</span>
            <div className="text-cyan-400 font-bold mt-0.5">
              {tournament.seedType === 'RANDOM' ? 'Randomized' : 'ELO Seeded'}
            </div>
          </div>
        </div>
      </div>

      {/* Esports View Switcher */}
      <div className="flex items-center justify-between gap-4 p-2 rounded-2xl bg-[#090b14] border border-slate-800 font-mono text-xs">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveViewMode('LIVE_CENTER')}
            className={`px-4 py-2 rounded-xl font-bold uppercase transition-all flex items-center gap-2 ${
              activeViewMode === 'LIVE_CENTER'
                ? 'bg-cyan-500 text-black shadow-[0_0_15px_rgba(34,211,238,0.3)]'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Trophy className="w-4 h-4" />
            <span>🏆 Live Esports Center</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveViewMode('BRACKET_MAP')}
            className={`px-4 py-2 rounded-xl font-bold uppercase transition-all flex items-center gap-2 ${
              activeViewMode === 'BRACKET_MAP'
                ? 'bg-cyan-500 text-black shadow-[0_0_15px_rgba(34,211,238,0.3)]'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Gamepad2 className="w-4 h-4" />
            <span>🗺️ Interactive Bracket Tree</span>
          </button>
        </div>

        <div className="hidden sm:flex items-center gap-2 text-[11px] text-slate-500 pr-2">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          <span>Real-time Live Sync</span>
        </div>
      </div>

      {/* Main View Mode Render */}
      {activeViewMode === 'LIVE_CENTER' ? (
        <TournamentLiveCenter
          tournament={tournament}
          currentUser={playerProfile || (user as unknown as Player)}
          isAdmin={isAdmin}
          teamRegistrations={allTeamRegistrations}
          onViewBracket={() => setActiveViewMode('BRACKET_MAP')}
          onRefreshTournament={refreshCurrentTournament}
        />
      ) : (
        <InteractiveTournamentBracketMap
          tournament={tournament}
          currentUser={playerProfile || (user as unknown as Player)}
          isAdmin={isAdmin}
          teamRegistrations={allTeamRegistrations}
          onRefreshTournament={refreshCurrentTournament}
          onSelectParticipant={onSelectParticipant}
        />
      )}

      {/* Participants Roster List */}
      {tournament.type === 'TEAM' ? (
        <TournamentTeamsSection
          tournament={tournament}
          currentUser={playerProfile || (user as unknown as Player)}
          isAdmin={isAdmin}
          registrations={allTeamRegistrations}
          onOpenTeamRegistration={() => {
            setManagingTeamRegistration(null);
            setShowTeamRegistrationModal(true);
          }}
          onOpenAdminReview={(team) => {
            if (team.sourceRegistration) {
              setReviewingTeamRegistration(team.sourceRegistration);
            }
          }}
          onOpenManageTeam={(team) => {
            if (team.sourceRegistration) {
              setManagingTeamRegistration(team.sourceRegistration);
              setShowTeamRegistrationModal(true);
            } else {
              setShowTeamRegistrationModal(true);
            }
          }}
        />
      ) : (
        <div className="p-6 rounded-3xl bg-[#0a0a0f] border border-slate-800 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-cyan-400" />
              <h3 className="text-base font-bold font-display text-white uppercase">
                CONFIRMED PARTICIPANTS ROSTER ({tournament.participants?.length || 0})
              </h3>
            </div>
          </div>

          {(!tournament.participants || tournament.participants.length === 0) ? (
            <div className="text-center py-8 text-slate-500 text-xs font-mono">
              No participants have registered yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {tournament.participants.map((p, idx) => (
                <div
                  key={p.id}
                  onClick={() => onSelectParticipant?.(p.id, p.type || 'PLAYER')}
                  className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition-all flex items-center justify-between text-xs font-mono cursor-pointer"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-6 h-6 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 flex items-center justify-center font-bold text-[10px]">
                      #{p.seed || idx + 1}
                    </span>
                    <div className="truncate">
                      <div className="font-bold text-white truncate flex items-center gap-1.5">
                        {p.name}
                      </div>
                      {p.seedRank && (
                        <div className="text-[10px] text-cyan-400">{p.seedRank} ELO</div>
                      )}
                    </div>
                  </div>

                  <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
                    Confirmed
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 5v5 Team Registration Room Modal */}
      {showTeamRegistrationModal && (
        <TeamTournamentRegistrationModal
          isOpen={showTeamRegistrationModal}
          onClose={() => {
            setShowTeamRegistrationModal(false);
            setManagingTeamRegistration(null);
          }}
          tournament={tournament}
          currentUser={playerProfile || (user as unknown as Player)}
          existingRegistration={managingTeamRegistration || userTeamRegistration}
          onRegistrationUpdated={async () => {
            await refreshCurrentTournament();
          }}
        />
      )}

      {/* Admin Review 5-Player Squad Modal */}
      {reviewingTeamRegistration && (
        <AdminTeamTournamentReviewModal
          isOpen={Boolean(reviewingTeamRegistration)}
          onClose={() => setReviewingTeamRegistration(null)}
          registration={reviewingTeamRegistration}
          tournament={tournament}
          adminUser={playerProfile || (user as unknown as Player)}
          onReviewed={async () => {
            await refreshCurrentTournament();
          }}
        />
      )}
    </div>
  );
};
