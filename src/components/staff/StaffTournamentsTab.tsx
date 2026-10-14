import React, { useState } from 'react';
import { Tournament, TournamentParticipant, Player, TeamTournamentRegistration } from '../../types';
import {
  staffCheckInTournamentParticipant,
  staffCheckInTournamentTeam,
} from '../../services/tournamentService';
import {
  Trophy,
  Users,
  CheckCircle2,
  Clock,
  Shield,
  Search,
  Calendar,
  AlertTriangle,
  Gamepad2,
  ChevronRight,
  UserCheck,
} from 'lucide-react';

interface StaffTournamentsTabProps {
  tournaments: Tournament[];
  teamRegistrations: TeamTournamentRegistration[];
  staffPlayer: Player;
}

export const StaffTournamentsTab: React.FC<StaffTournamentsTabProps> = ({
  tournaments,
  teamRegistrations,
  staffPlayer,
}) => {
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(
    tournaments.length > 0 ? tournaments[0] : null
  );
  const [searchParticipant, setSearchParticipant] = useState('');
  const [isCheckingIn, setIsCheckingIn] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const activeTournaments = tournaments.filter(
    (t) => t.status !== 'COMPLETED' && t.status !== 'CANCELLED'
  );

  const handleCheckInParticipant = async (participantId: string) => {
    if (!selectedTournament) return;
    setIsCheckingIn(participantId);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await staffCheckInTournamentParticipant(
        selectedTournament.id,
        participantId,
        staffPlayer
      );
      if (!res.success) {
        throw new Error(res.error || 'Failed to check in participant');
      }
      setSuccessMsg('Participant checked in successfully.');
    } catch (err: any) {
      console.error('Error checking in tournament participant:', err);
      setErrorMsg(err.message || 'Check-in failed');
    } finally {
      setIsCheckingIn(null);
    }
  };

  const handleCheckInTeam = async (regId: string) => {
    if (!selectedTournament) return;
    setIsCheckingIn(regId);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await staffCheckInTournamentTeam(
        selectedTournament.id,
        regId,
        staffPlayer
      );
      if (!res.success) {
        throw new Error(res.error || 'Failed to check in team');
      }
      setSuccessMsg('Team checked in successfully.');
    } catch (err: any) {
      console.error('Error checking in tournament team:', err);
      setErrorMsg(err.message || 'Team check-in failed');
    } finally {
      setIsCheckingIn(null);
    }
  };

  // Tournament teams
  const currentTournamentTeams = selectedTournament
    ? teamRegistrations.filter((r) => r.tournamentId === selectedTournament.id)
    : [];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#0b0e14] border border-slate-800 rounded-2xl p-5">
        <div>
          <h3 className="text-base font-bold text-white uppercase tracking-wider flex items-center gap-2 font-display">
            <Trophy className="w-5 h-5 text-amber-500" />
            <span>Tournament Participant Check-In Desk</span>
          </h3>
          <p className="text-xs text-slate-400">
            Arrival check-in for solo competitors and 5v5 team rosters
          </p>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-400">
          <Shield className="w-3.5 h-3.5 text-amber-400" />
          <span>Operational View • Brackets & Winner declarations restricted to Admins</span>
        </div>
      </div>

      {successMsg && (
        <div className="p-3 bg-emerald-950/40 border border-emerald-500/50 rounded-xl text-xs text-emerald-300 flex items-center justify-between">
          <span>{successMsg}</span>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-400 hover:text-white">✕</button>
        </div>
      )}
      {errorMsg && (
        <div className="p-3 bg-red-950/40 border border-red-500/50 rounded-xl text-xs text-red-300 flex items-center justify-between">
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="text-red-400 hover:text-white">✕</button>
        </div>
      )}

      {/* Main Content Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Tournament Selector */}
        <div className="space-y-3">
          <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
            Select Active Tournament ({activeTournaments.length})
          </label>

          {activeTournaments.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500 bg-[#0b0e14] border border-slate-800 rounded-2xl">
              No active tournaments right now.
            </div>
          ) : (
            <div className="space-y-2">
              {activeTournaments.map((t) => {
                const isSelected = selectedTournament?.id === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setSelectedTournament(t)}
                    className={`w-full text-left p-4 rounded-xl border transition-all flex items-center justify-between ${
                      isSelected
                        ? 'bg-amber-950/20 border-amber-500/50 shadow-[0_0_20px_rgba(245,158,11,0.15)] text-white'
                        : 'bg-[#0b0e14] border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                          {t.game || 'Tournament'}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">{t.format || t.type}</span>
                      </div>
                      <h4 className="text-sm font-bold text-white truncate max-w-[200px]">{t.name}</h4>
                      <p className="text-[11px] text-slate-500 font-mono mt-1">
                        {t.participants?.length || 0} / {t.maxParticipants} Registered
                      </p>
                    </div>
                    <ChevronRight className={`w-4 h-4 ${isSelected ? 'text-amber-400' : 'text-slate-600'}`} />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: Participants Check-In List (2 cols) */}
        <div className="lg:col-span-2 space-y-4">
          {selectedTournament ? (
            <div className="bg-[#0b0e14] border border-slate-800 rounded-2xl p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
                <div>
                  <h4 className="text-base font-bold text-white font-display uppercase tracking-wide">
                    {selectedTournament.name}
                  </h4>
                  <p className="text-xs text-slate-400">
                    Format: {selectedTournament.format || 'Elimination'} • {selectedTournament.type}
                  </p>
                </div>

                <div className="relative w-full sm:w-56">
                  <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={searchParticipant}
                    onChange={(e) => setSearchParticipant(e.target.value)}
                    placeholder="Search participant..."
                    className="w-full bg-[#121620] border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500 placeholder:text-slate-600"
                  />
                </div>
              </div>

              {/* Individual Participants List */}
              {selectedTournament.type === 'INDIVIDUAL' || !selectedTournament.type ? (
                <div className="space-y-2">
                  <h5 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                    <span>Individual Participants ({selectedTournament.participants?.length || 0})</span>
                    <span className="text-[11px] text-emerald-400 font-mono">
                      {selectedTournament.participants?.filter((p) => p.checkedIn).length || 0} Checked In
                    </span>
                  </h5>

                  {(!selectedTournament.participants || selectedTournament.participants.length === 0) ? (
                    <div className="py-12 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl">
                      No participants registered yet.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-800/60 max-h-[500px] overflow-y-auto">
                      {selectedTournament.participants
                        .filter((p) => {
                          if (!searchParticipant.trim()) return true;
                          const q = searchParticipant.toLowerCase();
                          return (p.name || '').toLowerCase().includes(q) || (p.tag || '').toLowerCase().includes(q);
                        })
                        .map((p) => {
                          const isBusy = isCheckingIn === p.id;
                          return (
                            <div
                              key={p.id}
                              className="py-3 px-2 flex items-center justify-between hover:bg-[#121620]/50 rounded-xl transition-colors"
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-xs font-bold text-white font-mono">
                                  {p.seed || '#'}
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-white">{p.name}</span>
                                    {p.tag && <span className="text-[11px] text-slate-400">({p.tag})</span>}
                                  </div>
                                  <div className="text-[10px] text-slate-500 font-mono">
                                    {p.checkedIn ? (
                                      <span className="text-emerald-400">
                                        ✓ Checked in at {p.checkedInAt ? new Date(p.checkedInAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'counter'}
                                        {p.checkedInBy && ` by ${p.checkedInBy}`}
                                      </span>
                                    ) : (
                                      <span className="text-slate-400">Awaiting arrival</span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <div>
                                {p.checkedIn ? (
                                  <span className="px-3 py-1 bg-emerald-950/40 border border-emerald-500/40 text-emerald-400 rounded-lg text-xs font-bold flex items-center gap-1">
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    <span>Checked In</span>
                                  </span>
                                ) : (
                                  <button
                                    disabled={isBusy}
                                    onClick={() => handleCheckInParticipant(p.id)}
                                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-all shadow-[0_0_15px_rgba(16,185,129,0.3)] flex items-center gap-1 cursor-pointer"
                                  >
                                    <UserCheck className="w-3.5 h-3.5" />
                                    <span>Check In</span>
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              ) : (
                /* Team Registrations List */
                <div className="space-y-2">
                  <h5 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                    <span>Registered 5v5 Teams ({currentTournamentTeams.length})</span>
                    <span className="text-[11px] text-emerald-400 font-mono">
                      {currentTournamentTeams.filter((t) => t.checkedIn).length} Checked In
                    </span>
                  </h5>

                  {currentTournamentTeams.length === 0 ? (
                    <div className="py-12 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl">
                      No teams registered for this tournament yet.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-800/60 max-h-[500px] overflow-y-auto">
                      {currentTournamentTeams
                        .filter((t) => {
                          if (!searchParticipant.trim()) return true;
                          const q = searchParticipant.toLowerCase();
                          return (t.teamName || '').toLowerCase().includes(q) || (t.captainGamerTag || t.captainFullName || '').toLowerCase().includes(q);
                        })
                        .map((team) => {
                          const isBusy = isCheckingIn === team.id;
                          return (
                            <div
                              key={team.id}
                              className="py-3 px-2 flex items-center justify-between hover:bg-[#121620]/50 rounded-xl transition-colors"
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-red-600/20 text-red-400 flex items-center justify-center text-xs font-bold font-mono">
                                  5v5
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-white">{team.teamName}</span>
                                    <span className="text-[10px] text-slate-400 font-mono">
                                      Captain: {team.captainGamerTag || team.captainFullName || 'Unknown'}
                                    </span>
                                  </div>
                                  <div className="text-[10px] text-slate-500 font-mono">
                                    {team.checkedIn ? (
                                      <span className="text-emerald-400">
                                        ✓ Squad checked in at {team.checkedInAt ? new Date(team.checkedInAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'counter'}
                                      </span>
                                    ) : (
                                      <span className="text-slate-400">Squad not checked in</span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <div>
                                {team.checkedIn ? (
                                  <span className="px-3 py-1 bg-emerald-950/40 border border-emerald-500/40 text-emerald-400 rounded-lg text-xs font-bold flex items-center gap-1">
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    <span>Squad Ready</span>
                                  </span>
                                ) : (
                                  <button
                                    disabled={isBusy}
                                    onClick={() => handleCheckInTeam(team.id)}
                                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-all shadow-[0_0_15px_rgba(16,185,129,0.3)] flex items-center gap-1 cursor-pointer"
                                  >
                                    <UserCheck className="w-3.5 h-3.5" />
                                    <span>Check-In Team</span>
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="py-20 text-center text-slate-500 bg-[#0b0e14] border border-slate-800 rounded-2xl">
              <Trophy className="w-10 h-10 mx-auto mb-2 text-slate-600 opacity-50" />
              <p className="text-sm font-medium">Select a tournament to view and check in participants.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
