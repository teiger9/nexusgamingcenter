import React, { useState, useMemo } from 'react';
import { Tournament, Player } from '../types';
import {
  UnifiedTournamentTeam,
  PublicTeamStatusKey,
  buildUnifiedTournamentTeams,
} from '../utils/tournamentTeamStatus';
import { TournamentTeamCard } from './TournamentTeamCard';
import { PublicTeamDetailsModal } from './PublicTeamDetailsModal';
import {
  Trophy,
  Users,
  Clock,
  CheckCircle2,
  Search,
  Filter,
  Shield,
  Plus,
  Flame,
  Sparkles,
  Info,
} from 'lucide-react';

interface TournamentTeamsSectionProps {
  tournament: Tournament;
  currentUser?: Player | null;
  isAdmin?: boolean;
  registrations: any[]; // TeamTournamentRegistration[]
  onOpenTeamRegistration?: () => void;
  onOpenAdminReview?: (team: UnifiedTournamentTeam) => void;
  onOpenManageTeam?: (team: UnifiedTournamentTeam) => void;
}

export const TournamentTeamsSection: React.FC<TournamentTeamsSectionProps> = ({
  tournament,
  currentUser,
  isAdmin = false,
  registrations,
  onOpenTeamRegistration,
  onOpenAdminReview,
  onOpenManageTeam,
}) => {
  const [activeTab, setActiveTab] = useState<'ALL' | PublicTeamStatusKey>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTeam, setSelectedTeam] = useState<UnifiedTournamentTeam | null>(null);

  // Unify registrations and participants with real-time status calculation
  const allTeams = useMemo(() => {
    return buildUnifiedTournamentTeams(tournament, registrations);
  }, [tournament, registrations]);

  // Status breakdown calculations
  const readyTeams = useMemo(
    () => allTeams.filter((t) => t.status.statusKey === 'READY'),
    [allTeams]
  );
  const pendingTeams = useMemo(
    () => allTeams.filter((t) => t.status.statusKey === 'PENDING_APPROVAL'),
    [allTeams]
  );
  const formingTeams = useMemo(
    () => allTeams.filter((t) => t.status.statusKey === 'FORMING_TEAM'),
    [allTeams]
  );

  const totalTeamsCreated = allTeams.length;
  const officialParticipantsCount = readyTeams.length;
  const maxCapacity = tournament.maxParticipants || 16;
  const isCapacityReached = officialParticipantsCount >= maxCapacity;

  // Filtered teams based on search and active tab
  const filteredTeams = useMemo(() => {
    return allTeams.filter((t) => {
      const matchesTab = activeTab === 'ALL' || t.status.statusKey === activeTab;
      const matchesSearch =
        !searchQuery.trim() ||
        t.teamName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.teamTag && t.teamTag.toLowerCase().includes(searchQuery.toLowerCase())) ||
        t.captainGamerTag.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.slots.some(
          (s) =>
            s.gamerTag?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.inGameName?.toLowerCase().includes(searchQuery.toLowerCase())
        );
      return matchesTab && matchesSearch;
    });
  }, [allTeams, activeTab, searchQuery]);

  return (
    <div id="tournament-teams-system-section" className="space-y-8 animate-in fade-in">
      {/* 1. OFFICIAL PARTICIPANT & TEAMS CREATED CAPACITY BANNER */}
      <div className="p-6 sm:p-7 rounded-3xl bg-gradient-to-br from-[#0c0f1d] to-[#080a14] border border-slate-800 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-mono font-bold uppercase tracking-wider">
              <Shield className="w-3.5 h-3.5" />
              <span>OFFICIAL TOURNAMENT PARTICIPATION SYSTEM</span>
            </div>

            <h2 className="text-2xl sm:text-3xl font-black font-display text-white uppercase tracking-tight">
              TOURNAMENT SQUADS & ROSTERS
            </h2>

            <p className="text-xs sm:text-sm text-slate-300 max-w-2xl">
              All creating, forming, and verified teams are tracked live. Only fully formed 5-player squads with manual Admin approval count toward the official tournament bracket capacity.
            </p>
          </div>

          {/* Action button if registration is open */}
          {tournament.status === 'REGISTRATION_OPEN' && onOpenTeamRegistration && (
            <button
              id="section-register-team-btn"
              onClick={onOpenTeamRegistration}
              disabled={isCapacityReached}
              className={`px-6 py-3 rounded-2xl font-mono font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2.5 transition-all shadow-xl ${
                isCapacityReached
                  ? 'bg-slate-800 text-slate-400 cursor-not-allowed border border-slate-700'
                  : 'bg-gradient-to-r from-cyan-400 via-teal-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-black shadow-cyan-500/25 hover:scale-[1.02]'
              }`}
            >
              <Plus className="w-4 h-4 text-black stroke-[3]" />
              <span>{isCapacityReached ? 'Tournament Capacity Reached' : 'Register 5v5 Squad'}</span>
            </button>
          )}
        </div>

        {/* METRICS & BREAKDOWN CARDS */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mt-6 pt-6 border-t border-slate-800/80 font-mono">
          {/* Total Teams Created */}
          <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80">
            <span className="text-[11px] text-slate-400 block uppercase font-bold tracking-wider">
              TEAMS CREATED
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl sm:text-3xl font-black font-display text-white">
                {totalTeamsCreated}
              </span>
              <span className="text-xs text-slate-400">Total Registered</span>
            </div>
            <span className="text-[10px] text-slate-400 block mt-1">
              All public squads (Forming + Verified)
            </span>
          </div>

          {/* Official Confirmed Teams */}
          <div className="p-4 rounded-2xl bg-emerald-950/20 border border-emerald-500/30">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-emerald-400 block uppercase font-bold tracking-wider">
                OFFICIAL PARTICIPANTS
              </span>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl sm:text-3xl font-black font-display text-emerald-400">
                {officialParticipantsCount}
              </span>
              <span className="text-xs text-slate-400">/ {maxCapacity} Teams</span>
            </div>
            <span className="text-[10px] text-emerald-400/80 block mt-1">
              🟢 READY (5/5 + Admin Approved)
            </span>
          </div>

          {/* Waiting for Approval */}
          <div className="p-4 rounded-2xl bg-amber-950/20 border border-amber-500/30">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-amber-300 block uppercase font-bold tracking-wider">
                WAITING APPROVAL
              </span>
              <Clock className="w-4 h-4 text-amber-400 animate-spin" style={{ animationDuration: '6s' }} />
            </div>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl sm:text-3xl font-black font-display text-amber-400">
                {pendingTeams.length}
              </span>
              <span className="text-xs text-slate-400">Squads Complete</span>
            </div>
            <span className="text-[10px] text-amber-400/80 block mt-1">
              ⏳ 5/5 Complete (Pending Staff)
            </span>
          </div>

          {/* Teams Forming */}
          <div className="p-4 rounded-2xl bg-indigo-950/20 border border-indigo-500/30">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-indigo-300 block uppercase font-bold tracking-wider">
                TEAMS FORMING
              </span>
              <Users className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl sm:text-3xl font-black font-display text-indigo-400">
                {formingTeams.length}
              </span>
              <span className="text-xs text-slate-400">Building Roster</span>
            </div>
            <span className="text-[10px] text-indigo-400/80 block mt-1">
              👥 1–4 Players Joined
            </span>
          </div>
        </div>
      </div>

      {/* 2. NAVIGATION TABS & SEARCH BAR */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Section Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 max-w-full font-mono text-xs">
          <button
            id="tab-all-teams"
            onClick={() => setActiveTab('ALL')}
            className={`px-4 py-2 rounded-xl font-bold uppercase transition-all whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'ALL'
                ? 'bg-cyan-500 text-black shadow-md shadow-cyan-500/20'
                : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <span>ALL TEAMS</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/20 font-bold">
              {allTeams.length}
            </span>
          </button>

          <button
            id="tab-official-teams"
            onClick={() => setActiveTab('READY')}
            className={`px-4 py-2 rounded-xl font-bold uppercase transition-all whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'READY'
                ? 'bg-emerald-500 text-black shadow-md shadow-emerald-500/20'
                : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-emerald-300 hover:bg-slate-800'
            }`}
          >
            <span>🏆 OFFICIAL TEAMS</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-950 text-emerald-300 font-bold">
              {readyTeams.length}
            </span>
          </button>

          <button
            id="tab-forming-teams"
            onClick={() => setActiveTab('FORMING_TEAM')}
            className={`px-4 py-2 rounded-xl font-bold uppercase transition-all whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'FORMING_TEAM'
                ? 'bg-indigo-500 text-white shadow-md shadow-indigo-500/20'
                : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-indigo-300 hover:bg-slate-800'
            }`}
          >
            <span>👥 TEAMS FORMING</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-indigo-950 text-indigo-300 font-bold">
              {formingTeams.length}
            </span>
          </button>

          <button
            id="tab-pending-teams"
            onClick={() => setActiveTab('PENDING_APPROVAL')}
            className={`px-4 py-2 rounded-xl font-bold uppercase transition-all whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'PENDING_APPROVAL'
                ? 'bg-amber-500 text-black shadow-md shadow-amber-500/20'
                : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-amber-300 hover:bg-slate-800'
            }`}
          >
            <span>⏳ WAITING FOR APPROVAL</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-950 text-amber-300 font-bold">
              {pendingTeams.length}
            </span>
          </button>
        </div>

        {/* Search Input */}
        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            id="search-tournament-teams-input"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search teams or players..."
            className="w-full bg-[#0a0c14] border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
          />
        </div>
      </div>

      {/* 3. TEAMS GRID DISPLAY */}
      {filteredTeams.length === 0 ? (
        <div className="p-12 rounded-3xl bg-[#0a0c14] border border-slate-800 text-center space-y-3">
          <Users className="w-10 h-10 text-slate-600 mx-auto" />
          <h4 className="text-base font-bold text-white font-display">No Teams Found</h4>
          <p className="text-xs text-slate-400 font-mono max-w-md mx-auto">
            {searchQuery
              ? `No tournament teams match "${searchQuery}". Try a different name or tag.`
              : activeTab === 'READY'
              ? 'No teams are officially confirmed yet. Teams currently forming or pending review are shown in the respective tabs.'
              : activeTab === 'PENDING_APPROVAL'
              ? 'No 5-player teams are currently awaiting Admin verification.'
              : activeTab === 'FORMING_TEAM'
              ? 'No teams are currently building their roster. Be the first captain to register!'
              : 'No teams have registered for this tournament yet.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {filteredTeams.map((team) => {
            const isUserCaptain = Boolean(currentUser?.uid && team.captainId === currentUser.uid);
            const isUserMember = Boolean(
              currentUser?.uid && team.slots.some((s) => s.playerId === currentUser.uid)
            );

            return (
              <TournamentTeamCard
                key={team.id}
                team={team}
                isUserCaptain={isUserCaptain}
                isUserMember={isUserMember}
                isAdmin={isAdmin}
                onClick={(t) => setSelectedTeam(t)}
              />
            );
          })}
        </div>
      )}

      {/* 4. MODAL: PUBLIC TEAM DETAILS & ROSTER INSPECTION */}
      <PublicTeamDetailsModal
        isOpen={Boolean(selectedTeam)}
        onClose={() => setSelectedTeam(null)}
        team={selectedTeam}
        currentUser={currentUser}
        isAdmin={isAdmin}
        onOpenManageTeam={(t) => {
          setSelectedTeam(null);
          onOpenManageTeam?.(t);
        }}
        onOpenAdminReview={(t) => {
          setSelectedTeam(null);
          onOpenAdminReview?.(t);
        }}
      />
    </div>
  );
};
