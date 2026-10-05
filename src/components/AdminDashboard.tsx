import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { fetchAllPlayers } from '../services/playerService';
import {
  subscribeToAllMatches,
  subscribeToDisputedMatches,
  subscribeToLiveMatches,
  subscribeToPendingMatchRequests,
  subscribeToAll5v5Matches,
} from '../services/matchService';
import { subscribeToTeams } from '../services/teamService';
import { subscribeToReservations } from '../services/reservationService';
import { AdminGameRequestsView } from './AdminGameRequestsView';
import { AdminDisputesView } from './AdminDisputesView';
import { AdminPlayersView } from './AdminPlayersView';
import { AdminLiveMatchesView } from './AdminLiveMatchesView';
import { AdminGamesView } from './AdminGamesView';
import { AdminMatchesView } from './AdminMatchesView';
import { AdminSeasonsView } from './AdminSeasonsView';
import { AdminLobbiesView } from './AdminLobbiesView';
import { AdminTeamsView } from './AdminTeamsView';
import { AdminAuditLogView } from './AdminAuditLogView';
import { AdminReservationsView } from './reservations/AdminReservationsView';
import { AdminTournamentsView } from './AdminTournamentsView';
import { AdminCoinsManagement } from './AdminCoinsManagement';
import { AdminFidelityRewardsManagement } from './AdminFidelityRewardsManagement';
import { AdminRewardRedemptionsView } from './AdminRewardRedemptionsView';
import { AdminStaffRolesView } from './AdminStaffRolesView';
import { AdminRecordMatchResult } from './AdminRecordMatchResult';
import { subscribeToAllRedemptions } from '../services/coinRewardService';
import { Match, Player, Team, Reservation, RewardRedemption } from '../types';
import {
  ShieldAlert,
  Users,
  Swords,
  Radio,
  AlertTriangle,
  CheckCircle2,
  Gamepad2,
  Calendar,
  LayoutDashboard,
  Trophy,
  Inbox,
  Shield,
  FileText,
  Clock,
  Phone,
  ArrowRight,
  BellRing,
  Coins,
  Gift,
  ShieldCheck,
} from 'lucide-react';

interface AdminDashboardProps {
  onSelectMatch: (matchId: string) => void;
  onSelectPlayerProfile: (playerId: string) => void;
  onSelectTeamProfile: (teamId: string) => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  onSelectMatch,
  onSelectPlayerProfile,
  onSelectTeamProfile,
}) => {
  const { user, playerProfile, isAdmin, isStaff, isSuperAdmin, permissions } = useAuth();

  const [activeTab, setActiveTab] = useState<
    | 'record_result'
    | 'requests'
    | 'reservations'
    | 'tournaments'
    | 'disputes'
    | 'live'
    | '5v5_lobbies'
    | 'teams'
    | 'players'
    | 'games'
    | 'matches'
    | 'seasons'
    | 'nexus_coins'
    | 'fidelity_rewards'
    | 'reward_redemptions'
    | 'audit_logs'
    | 'staff_roles'
  >('requests');

  const [players, setPlayers] = useState<Player[]>([]);
  const [allMatches, setAllMatches] = useState<Match[]>([]);
  const [pendingRequests, setPendingRequests] = useState<Match[]>([]);
  const [disputedMatches, setDisputedMatches] = useState<Match[]>([]);
  const [liveMatches, setLiveMatches] = useState<Match[]>([]);
  const [all5v5Matches, setAll5v5Matches] = useState<Match[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [redemptions, setRedemptions] = useState<RewardRedemption[]>([]);

  useEffect(() => {
    fetchAllPlayers().then(setPlayers);

    const unsubAll = subscribeToAllMatches(setAllMatches);
    const unsubPending = subscribeToPendingMatchRequests(setPendingRequests);
    const unsubDisputes = subscribeToDisputedMatches(setDisputedMatches);
    const unsubLive = subscribeToLiveMatches(setLiveMatches);
    const unsub5v5 = subscribeToAll5v5Matches(setAll5v5Matches);
    const unsubTeams = subscribeToTeams(undefined, setTeams);
    const unsubRes = subscribeToReservations(setReservations);
    const unsubRed = subscribeToAllRedemptions(setRedemptions);

    return () => {
      unsubAll();
      unsubPending();
      unsubDisputes();
      unsubLive();
      unsub5v5();
      unsubTeams();
      unsubRes();
      unsubRed();
    };
  }, []);

  if (!isAdmin && !isStaff) {
    return (
      <div className="max-w-xl mx-auto py-20 text-center px-4">
        <ShieldAlert className="w-12 h-12 text-red-500 mx-auto mb-3" />
        <h2 className="text-2xl font-bold font-display text-white">Access Restricted</h2>
        <p className="text-xs text-slate-400 mt-2">
          This portal is reserved for Nexus Gaming Center staff and administrators. Normal player accounts cannot access administrative referee functions.
        </p>
      </div>
    );
  }

  // Calculate statistics
  const pendingReservations = reservations.filter((r) => r.status === 'PENDING');
  const activeRedemptions = redemptions.filter((r) => r.status === 'ACTIVE' || r.status === 'APPROVED');
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const matchesToday = allMatches.filter((m) => m.createdAt >= todayStart.getTime()).length;
  const confirmedMatches = allMatches.filter((m) => m.status === 'CONFIRMED').length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Admin Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-mono font-bold mb-2">
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>NEXUS STAFF CONTROL CENTER</span>
          </div>
          <h1 className="text-3xl font-black font-display tracking-tight text-white">
            ADMINISTRATION DASHBOARD
          </h1>
          <p className="text-xs text-slate-400 mt-1 font-mono">
            Logged in as {isAdmin ? (isSuperAdmin ? 'Super Admin' : 'Admin') : 'Staff'} <strong className="text-cyan-400">{playerProfile?.gamerTag}</strong> ({playerProfile?.email})
          </p>
        </div>
      </div>

      {/* Prominent Real-Time Alert Card for Pending Reservation Requests */}
      {pendingReservations.length > 0 && (
        <div className="p-5 rounded-3xl bg-gradient-to-r from-amber-950/60 via-[#14100c] to-amber-950/40 border-2 border-amber-500/60 shadow-[0_0_30px_rgba(245,158,11,0.15)] flex flex-col md:flex-row items-start md:items-center justify-between gap-4 animate-in fade-in">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/50 flex items-center justify-center text-amber-400 shrink-0 animate-bounce">
              <BellRing className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono uppercase tracking-widest text-amber-400 font-black">
                  PENDING RESERVATION REQUESTS
                </span>
                <span className="px-2 py-0.5 rounded-full bg-amber-500 text-black text-[10px] font-mono font-black animate-pulse">
                  CALL REQUIRED
                </span>
              </div>
              <h3 className="text-lg sm:text-xl font-black text-white font-display mt-0.5">
                {pendingReservations.length} REQUEST{pendingReservations.length !== 1 ? 'S' : ''} WAITING FOR YOU
              </h3>
              <p className="text-xs text-amber-200/80 font-mono mt-0.5">
                Players have submitted station booking requests. Call customers to verify availability and confirm or decline.
              </p>
            </div>
          </div>

          <button
            onClick={() => setActiveTab('reservations')}
            className="w-full md:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-amber-400 hover:bg-amber-300 text-black font-black uppercase text-xs tracking-wider shadow-lg shadow-amber-500/30 transition-all active:scale-95 whitespace-nowrap"
          >
            <span>VIEW REQUESTS ({pendingReservations.length})</span>
            <ArrowRight className="w-4 h-4 stroke-[3]" />
          </button>
        </div>
      )}

      {/* Admin KPI Stat Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
        {/* Pending Match Requests */}
        <div
          onClick={() => setActiveTab('requests')}
          className={`p-4 rounded-2xl border transition-colors cursor-pointer shadow-md ${
            pendingRequests.length > 0
              ? 'bg-yellow-950/40 border-yellow-500/60 animate-pulse'
              : 'bg-[#0a0a0f] border-slate-800 hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-mono uppercase">Game Requests</span>
            <Inbox className="w-4 h-4 text-yellow-400" />
          </div>
          <div
            className={`text-2xl font-bold font-display font-mono-numbers ${
              pendingRequests.length > 0 ? 'text-yellow-400' : 'text-slate-300'
            }`}
          >
            {pendingRequests.length}
          </div>
          <div className="text-[10px] text-slate-500 font-mono mt-1">Pending approval</div>
        </div>

        {/* Pending Reservations KPI */}
        <div
          onClick={() => setActiveTab('reservations')}
          className={`p-4 rounded-2xl border transition-colors cursor-pointer shadow-md ${
            pendingReservations.length > 0
              ? 'bg-amber-950/40 border-amber-500/60 animate-pulse'
              : 'bg-[#0a0a0f] border-slate-800 hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-mono uppercase">Bookings Queue</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <div
            className={`text-2xl font-bold font-display font-mono-numbers ${
              pendingReservations.length > 0 ? 'text-amber-400' : 'text-slate-300'
            }`}
          >
            {pendingReservations.length}
          </div>
          <div className="text-[10px] text-slate-500 font-mono mt-1">
            {pendingReservations.length > 0 ? 'Pending call' : 'All confirmed'}
          </div>
        </div>

        {/* Total Players */}
        <div
          onClick={() => setActiveTab('players')}
          className="p-4 rounded-2xl bg-[#0a0a0f] border border-slate-800 hover:border-slate-700 transition-colors cursor-pointer shadow-md"
        >
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-mono uppercase">Total Players</span>
            <Users className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-bold font-display font-mono-numbers text-white">{players.length}</div>
          <div className="text-[10px] text-slate-500 font-mono mt-1">Registered roster</div>
        </div>

        {/* 5v5 Squads Count */}
        <div
          onClick={() => setActiveTab('teams')}
          className="p-4 rounded-2xl bg-[#0a0a0f] border border-slate-800 hover:border-slate-700 transition-colors cursor-pointer shadow-md"
        >
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-mono uppercase">5v5 Squads</span>
            <Shield className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-bold font-display font-mono-numbers text-cyan-400">{teams.length}</div>
          <div className="text-[10px] text-slate-500 font-mono mt-1">Valorant & CS2</div>
        </div>

        {/* Live Matches */}
        <div
          onClick={() => setActiveTab('live')}
          className="p-4 rounded-2xl bg-[#0a0a0f] border border-slate-800 hover:border-slate-700 transition-colors cursor-pointer shadow-md"
        >
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-mono uppercase">Live Matches</span>
            <Radio className="w-4 h-4 text-cyan-400 animate-pulse" />
          </div>
          <div className="text-2xl font-bold font-display font-mono-numbers text-cyan-400">
            {liveMatches.filter((m) => m.status === 'LIVE').length}
          </div>
          <div className="text-[10px] text-slate-500 font-mono mt-1">Active stations</div>
        </div>

        {/* Disputed Matches */}
        <div
          onClick={() => setActiveTab('disputes')}
          className={`p-4 rounded-2xl border transition-colors cursor-pointer shadow-md ${
            disputedMatches.length > 0
              ? 'bg-red-950/40 border-red-500/60 animate-pulse'
              : 'bg-[#0a0a0f] border-slate-800 hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-mono uppercase">Disputes</span>
            <AlertTriangle className="w-4 h-4 text-red-400" />
          </div>
          <div
            className={`text-2xl font-bold font-display font-mono-numbers ${
              disputedMatches.length > 0 ? 'text-red-400' : 'text-slate-300'
            }`}
          >
            {disputedMatches.length}
          </div>
          <div className="text-[10px] text-slate-500 font-mono mt-1">Require ruling</div>
        </div>

        {/* Active Reward Redemptions KPI */}
        <div
          onClick={() => setActiveTab('reward_redemptions')}
          className={`p-4 rounded-2xl border transition-colors cursor-pointer shadow-md ${
            activeRedemptions.length > 0
              ? 'bg-emerald-950/40 border-emerald-500/60 animate-pulse'
              : 'bg-[#0a0a0f] border-slate-800 hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-mono uppercase">Redemptions</span>
            <Gift className="w-4 h-4 text-emerald-400" />
          </div>
          <div
            className={`text-2xl font-bold font-display font-mono-numbers ${
              activeRedemptions.length > 0 ? 'text-emerald-400' : 'text-slate-300'
            }`}
          >
            {activeRedemptions.length}
          </div>
          <div className="text-[10px] text-slate-500 font-mono mt-1">
            {activeRedemptions.length > 0 ? 'Active customer passes' : 'Redeem code desk'}
          </div>
        </div>
      </div>

      {/* Admin Sub Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('record_result')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold font-display tracking-wider uppercase transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'record_result'
              ? 'bg-red-600 text-white font-black shadow-[0_0_15px_rgba(239,68,68,0.4)]'
              : 'text-red-400 hover:text-white hover:bg-red-950/40 border border-red-500/20'
          }`}
        >
          <Swords className="w-4 h-4 text-red-500" />
          <span>⚡ Record Match Result</span>
        </button>

        <button
          onClick={() => setActiveTab('requests')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold font-display tracking-wider uppercase transition-all whitespace-nowrap ${
            activeTab === 'requests'
              ? 'bg-yellow-500 text-black shadow-md font-black'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <Inbox className="w-4 h-4" />
          <span>Game Requests</span>
          {pendingRequests.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-black bg-black text-yellow-400 font-mono animate-bounce">
              {pendingRequests.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('reservations')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold font-display tracking-wider uppercase transition-all whitespace-nowrap ${
            activeTab === 'reservations'
              ? 'bg-amber-400 text-black font-black shadow-[0_0_15px_rgba(251,191,36,0.3)]'
              : 'text-amber-400 hover:text-amber-300 hover:bg-amber-950/40'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>🔔 Reservation Requests</span>
          {pendingReservations.length > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-black text-amber-400 font-mono animate-pulse">
              {pendingReservations.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('tournaments')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold font-display tracking-wider uppercase transition-all whitespace-nowrap ${
            activeTab === 'tournaments'
              ? 'bg-gradient-to-r from-yellow-500 to-amber-400 text-black font-black shadow-[0_0_15px_rgba(234,179,8,0.35)]'
              : 'text-yellow-400 hover:text-yellow-300 hover:bg-yellow-500/10'
          }`}
        >
          <Trophy className="w-4 h-4" />
          <span>🏆 Tournaments</span>
        </button>

        <button
          onClick={() => setActiveTab('disputes')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold font-display tracking-wider uppercase transition-all whitespace-nowrap ${
            activeTab === 'disputes'
              ? 'bg-red-500 text-white shadow-md font-black'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
          <span>Disputes</span>
          {disputedMatches.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-black bg-white text-red-600 font-mono">
              {disputedMatches.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('5v5_lobbies')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold font-display tracking-wider uppercase transition-all whitespace-nowrap ${
            activeTab === '5v5_lobbies'
              ? 'bg-cyan-400 text-black font-black shadow-[0_0_10px_rgba(34,211,238,0.3)]'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <Swords className="w-4 h-4" />
          <span>5v5 Lobbies</span>
        </button>

        <button
          onClick={() => setActiveTab('teams')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold font-display tracking-wider uppercase transition-all whitespace-nowrap ${
            activeTab === 'teams'
              ? 'bg-cyan-400 text-black font-black shadow-[0_0_10px_rgba(34,211,238,0.3)]'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <Shield className="w-4 h-4" />
          <span>5v5 Squads</span>
        </button>

        <button
          onClick={() => setActiveTab('live')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold font-display tracking-wider uppercase transition-all whitespace-nowrap ${
            activeTab === 'live'
              ? 'bg-cyan-400 text-black font-black shadow-[0_0_10px_rgba(34,211,238,0.3)]'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <Radio className="w-4 h-4" />
          <span>Stations & Live</span>
        </button>

        <button
          onClick={() => setActiveTab('players')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold font-display tracking-wider uppercase transition-all whitespace-nowrap ${
            activeTab === 'players'
              ? 'bg-cyan-400 text-black font-black shadow-[0_0_10px_rgba(34,211,238,0.3)]'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Players</span>
        </button>

        <button
          onClick={() => setActiveTab('matches')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold font-display tracking-wider uppercase transition-all whitespace-nowrap ${
            activeTab === 'matches'
              ? 'bg-cyan-400 text-black font-black shadow-[0_0_10px_rgba(34,211,238,0.3)]'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <Swords className="w-4 h-4" />
          <span>All Matches</span>
        </button>

        <button
          onClick={() => setActiveTab('games')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold font-display tracking-wider uppercase transition-all whitespace-nowrap ${
            activeTab === 'games'
              ? 'bg-cyan-400 text-black font-black shadow-[0_0_10px_rgba(34,211,238,0.3)]'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <Gamepad2 className="w-4 h-4" />
          <span>Catalog</span>
        </button>

        <button
          onClick={() => setActiveTab('seasons')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold font-display tracking-wider uppercase transition-all whitespace-nowrap ${
            activeTab === 'seasons'
              ? 'bg-gradient-to-r from-amber-500 to-yellow-400 text-black font-black shadow-[0_0_15px_rgba(234,179,8,0.3)]'
              : 'text-yellow-400 hover:text-yellow-300 hover:bg-yellow-500/10'
          }`}
        >
          <Trophy className="w-4 h-4" />
          <span>Seasons & Reset</span>
        </button>

        <button
          onClick={() => setActiveTab('nexus_coins')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold font-display tracking-wider uppercase transition-all whitespace-nowrap ${
            activeTab === 'nexus_coins'
              ? 'bg-gradient-to-r from-amber-500 to-yellow-400 text-black font-black shadow-[0_0_15px_rgba(245,158,11,0.35)]'
              : 'text-amber-400 hover:text-white hover:bg-amber-950/40'
          }`}
        >
          <Coins className="w-4 h-4" />
          <span>🪙 Nexus Coins</span>
        </button>

        <button
          onClick={() => setActiveTab('reward_redemptions')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold font-display tracking-wider uppercase transition-all whitespace-nowrap ${
            activeTab === 'reward_redemptions'
              ? 'bg-gradient-to-r from-emerald-500 to-teal-400 text-black font-black shadow-[0_0_15px_rgba(16,185,129,0.35)]'
              : 'text-emerald-400 hover:text-white hover:bg-emerald-950/40'
          }`}
        >
          <Gift className="w-4 h-4" />
          <span>🎁 Reward Redemptions</span>
          {activeRedemptions.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-black bg-emerald-500 text-black font-mono">
              {activeRedemptions.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('fidelity_rewards')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold font-display tracking-wider uppercase transition-all whitespace-nowrap ${
            activeTab === 'fidelity_rewards'
              ? 'bg-gradient-to-r from-emerald-500 to-teal-400 text-black font-black shadow-[0_0_15px_rgba(16,185,129,0.35)]'
              : 'text-emerald-400 hover:text-white hover:bg-emerald-950/40'
          }`}
        >
          <Gift className="w-4 h-4" />
          <span>🪙 NC Redemption Offers</span>
        </button>

        <button
          onClick={() => setActiveTab('audit_logs')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold font-display tracking-wider uppercase transition-all whitespace-nowrap ${
            activeTab === 'audit_logs'
              ? 'bg-cyan-400 text-black font-black shadow-[0_0_10px_rgba(34,211,238,0.3)]'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Audit Logs</span>
        </button>

        {(isAdmin || isSuperAdmin) && (
          <button
            onClick={() => setActiveTab('staff_roles')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold font-display tracking-wider uppercase transition-all whitespace-nowrap ${
              activeTab === 'staff_roles'
                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-black shadow-[0_0_15px_rgba(168,85,247,0.4)]'
                : 'text-purple-400 hover:text-white hover:bg-purple-950/40'
            }`}
          >
            <ShieldAlert className="w-4 h-4" />
            <span>👑 Staff & Roles</span>
          </button>
        )}
      </div>

      {/* Render Selected View */}
      <div className="pt-2">
        {activeTab === 'record_result' && <AdminRecordMatchResult />}
        {activeTab === 'requests' && <AdminGameRequestsView onSelectMatch={onSelectMatch} />}
        {activeTab === 'reservations' && <AdminReservationsView />}
        {activeTab === 'tournaments' && <AdminTournamentsView />}
        {activeTab === 'disputes' && <AdminDisputesView />}
        {activeTab === '5v5_lobbies' && (
          <AdminLobbiesView
            onSelectMatch={onSelectMatch}
            onSelectTeamProfile={onSelectTeamProfile}
          />
        )}
        {activeTab === 'teams' && (
          <AdminTeamsView
            onSelectTeamProfile={onSelectTeamProfile}
            onSelectPlayerProfile={onSelectPlayerProfile}
          />
        )}
        {activeTab === 'live' && <AdminLiveMatchesView onSelectMatch={onSelectMatch} />}
        {activeTab === 'players' && <AdminPlayersView onSelectPlayerProfile={onSelectPlayerProfile} />}
        {activeTab === 'games' && <AdminGamesView />}
        {activeTab === 'matches' && <AdminMatchesView onSelectMatch={onSelectMatch} />}
        {activeTab === 'seasons' && <AdminSeasonsView />}
        {activeTab === 'nexus_coins' && <AdminCoinsManagement />}
        {activeTab === 'reward_redemptions' && <AdminRewardRedemptionsView />}
        {activeTab === 'fidelity_rewards' && <AdminFidelityRewardsManagement />}
        {activeTab === 'audit_logs' && <AdminAuditLogView />}
        {activeTab === 'staff_roles' && (isAdmin || isSuperAdmin) && <AdminStaffRolesView />}
      </div>
    </div>
  );
};
