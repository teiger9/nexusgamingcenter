import React, { useState, useEffect } from 'react';
import { Team } from '../types';
import { subscribeToTeams, disbandTeam } from '../services/teamService';
import { useAuth } from '../context/AuthContext';
import { useToast } from './Toast';
import {
  Shield,
  Search,
  Users,
  Crown,
  Trash2,
  ExternalLink,
  ChevronRight,
  Flame,
  AlertTriangle,
} from 'lucide-react';

interface AdminTeamsViewProps {
  onSelectTeamProfile: (teamId: string) => void;
  onSelectPlayerProfile: (playerId: string) => void;
}

export const AdminTeamsView: React.FC<AdminTeamsViewProps> = ({
  onSelectTeamProfile,
  onSelectPlayerProfile,
}) => {
  const { user, isAdmin } = useAuth();
  const { showToast } = useToast();
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [gameFilter, setGameFilter] = useState<'ALL' | 'valorant' | 'cs2' | 'lol'>('ALL');
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    const unsub = subscribeToTeams(
      gameFilter === 'ALL' ? undefined : gameFilter,
      (t) => {
        setTeams(t);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [gameFilter]);

  const filteredTeams = teams.filter(
    (t) =>
      t.teamName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.teamTag.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.captainGamerTag.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleAdminDisbandTeam = async (team: Team) => {
    if (!user) return;
    if (!confirm(`ADMIN WARNING: Are you sure you want to DISBAND "${team.teamName}" [${team.teamTag}]? This will remove all members.`)) {
      return;
    }

    setActionLoading(true);
    try {
      const res = await disbandTeam({
        teamId: team.teamId,
        captainId: team.captainId,
      });

      if (res.success) {
        showToast('warning', 'Team Disbanded', `Admin disbanded ${team.teamName}.`);
      } else {
        showToast('error', 'Disband failed', res.error);
      }
    } catch (err: any) {
      showToast('error', 'Error', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-cyan-400" />
            <h1 className="text-xl font-black font-display text-white">5v5 SQUADS & TEAMS ROSTER</h1>
          </div>
          <p className="text-xs text-slate-400 font-mono mt-0.5">
            Admin management for all registered Valorant, CS2, and League of Legends squads
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Game filter pills */}
          <div className="flex items-center gap-1 bg-[#121218] p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setGameFilter('ALL')}
              className={`px-3 py-1 rounded-lg text-xs font-mono font-bold transition-all ${
                gameFilter === 'ALL' ? 'bg-cyan-400 text-black' : 'text-slate-400 hover:text-white'
              }`}
            >
              ALL
            </button>
            <button
              onClick={() => setGameFilter('valorant')}
              className={`px-3 py-1 rounded-lg text-xs font-mono font-bold transition-all ${
                gameFilter === 'valorant' ? 'bg-cyan-400 text-black' : 'text-slate-400 hover:text-white'
              }`}
            >
              VALORANT
            </button>
            <button
              onClick={() => setGameFilter('cs2')}
              className={`px-3 py-1 rounded-lg text-xs font-mono font-bold transition-all ${
                gameFilter === 'cs2' ? 'bg-cyan-400 text-black' : 'text-slate-400 hover:text-white'
              }`}
            >
              CS2
            </button>
            <button
              onClick={() => setGameFilter('lol')}
              className={`px-3 py-1 rounded-lg text-xs font-mono font-bold transition-all ${
                gameFilter === 'lol' ? 'bg-cyan-400 text-black' : 'text-slate-400 hover:text-white'
              }`}
            >
              LEAGUE
            </button>
          </div>
        </div>
      </div>

      {/* Search & Stats Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search team name, tag, or captain..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-[#121218] border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 font-mono"
          />
        </div>

        <div className="text-xs font-mono text-slate-400">
          Showing <strong className="text-white">{filteredTeams.length}</strong> active squad(s)
        </div>
      </div>

      {/* Teams Grid / Table */}
      {loading ? (
        <div className="py-16 text-center">
          <div className="inline-block w-8 h-8 border-3 border-cyan-400 border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-slate-400 text-xs font-mono">Loading Squads...</p>
        </div>
      ) : filteredTeams.length === 0 ? (
        <div className="bg-[#0a0a0f] border border-slate-800 rounded-3xl p-12 text-center space-y-2">
          <Shield className="w-8 h-8 text-slate-600 mx-auto" />
          <h3 className="text-base font-bold text-white">No Teams Found</h3>
          <p className="text-xs text-slate-500">No teams match your search filter.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTeams.map((team) => (
            <div
              key={team.teamId}
              className="p-5 rounded-3xl bg-[#0a0a0f] border border-slate-800 hover:border-slate-700 transition-all flex flex-col justify-between space-y-4 shadow-xl"
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-[#15151b] border border-slate-700 flex items-center justify-center text-2xl shadow-md shrink-0">
                      {team.teamLogo || '🛡️'}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <h3 className="text-base font-bold text-white truncate max-w-[140px]">
                          {team.teamName}
                        </h3>
                        <span className="px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 font-mono font-bold text-[10px]">
                          [{team.teamTag}]
                        </span>
                      </div>
                      <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                        <span className="text-cyan-400 uppercase font-bold">{team.gameName} 5v5</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right font-mono">
                    <div className="text-sm font-black text-cyan-400">{team.teamRating || 1000} ELO</div>
                    <div className="text-[10px] text-slate-500">
                      {team.wins}W - {team.losses}L ({team.winRate || 0}%)
                    </div>
                  </div>
                </div>

                {/* Captain & Roster */}
                <div className="mt-4 p-3 rounded-2xl bg-[#121218] border border-slate-800 space-y-2 text-xs font-mono">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-400 flex items-center gap-1">
                      <Crown className="w-3 h-3 text-yellow-400" /> Captain:
                    </span>
                    <button
                      onClick={() => onSelectPlayerProfile(team.captainId)}
                      className="text-white hover:text-cyan-400 font-bold underline truncate max-w-[120px]"
                    >
                      {team.captainGamerTag}
                    </button>
                  </div>

                  <div className="text-[11px] text-slate-400">
                    Lineup: <strong className="text-slate-200">{team.members.length}/5 Players</strong>
                  </div>

                  <div className="flex flex-wrap gap-1 pt-1">
                    {team.members.map((m) => (
                      <span
                        key={m.id}
                        onClick={() => onSelectPlayerProfile(m.id)}
                        className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white cursor-pointer text-[10px] font-mono"
                      >
                        {m.gamerTag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Action bar */}
              <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-2">
                <button
                  onClick={() => onSelectTeamProfile(team.teamId)}
                  className="text-xs font-mono text-cyan-400 hover:underline flex items-center gap-1"
                >
                  <span>Squad Dossier</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>

                {isAdmin && (
                  <button
                    onClick={() => handleAdminDisbandTeam(team)}
                    disabled={actionLoading}
                    className="px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[10px] font-mono font-bold flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Admin Disband</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
