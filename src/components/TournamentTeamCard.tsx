import React from 'react';
import { UnifiedTournamentTeam } from '../utils/tournamentTeamStatus';
import {
  Users,
  Crown,
  Shield,
  Clock,
  CheckCircle2,
  ChevronRight,
  Flame,
  Sparkles,
} from 'lucide-react';

interface TournamentTeamCardProps {
  team: UnifiedTournamentTeam;
  isUserCaptain?: boolean;
  isUserMember?: boolean;
  isAdmin?: boolean;
  onClick: (team: UnifiedTournamentTeam) => void;
}

export const TournamentTeamCard: React.FC<TournamentTeamCardProps> = ({
  team,
  isUserCaptain = false,
  isUserMember = false,
  isAdmin = false,
  onClick,
}) => {
  const { status } = team;
  const isReady = status.statusKey === 'READY';
  const isPending = status.statusKey === 'PENDING_APPROVAL';
  const isForming = status.statusKey === 'FORMING_TEAM';

  // Generate visual block progress bar like ██████░░░░ 60%
  const totalBlocks = 10;
  const filledBlocks = Math.round((status.progressPercent / 100) * totalBlocks);
  const emptyBlocks = totalBlocks - filledBlocks;
  const blockString = '█'.repeat(filledBlocks) + '░'.repeat(emptyBlocks);

  return (
    <div
      id={`team-card-${team.id}`}
      onClick={() => onClick(team)}
      className={`group relative rounded-2xl p-4 sm:p-5 transition-all cursor-pointer border bg-[#0b0e17]/90 hover:bg-[#101422] ${
        isReady
          ? 'border-emerald-500/30 hover:border-emerald-500/60 shadow-lg shadow-emerald-950/20'
          : isPending
          ? 'border-amber-500/30 hover:border-amber-500/60 shadow-lg shadow-amber-950/20'
          : 'border-slate-800 hover:border-indigo-500/50 shadow-md'
      }`}
    >
      {/* Top badges: Game & User affiliation */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800 text-slate-300 text-[10px] font-mono font-bold uppercase tracking-wider">
            🎮 {team.gameName}
          </span>

          {isUserCaptain && (
            <span className="px-2 py-0.5 rounded-md bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[10px] font-mono font-bold flex items-center gap-1">
              <Crown className="w-3 h-3 text-amber-400" />
              <span>YOUR TEAM (CAPTAIN)</span>
            </span>
          )}

          {!isUserCaptain && isUserMember && (
            <span className="px-2 py-0.5 rounded-md bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 text-[10px] font-mono font-bold flex items-center gap-1">
              <Users className="w-3 h-3" />
              <span>YOUR SQUAD</span>
            </span>
          )}

          {isAdmin && (
            <span className="px-2 py-0.5 rounded-md bg-purple-500/20 border border-purple-500/30 text-purple-300 text-[10px] font-mono font-bold flex items-center gap-1">
              <Shield className="w-3 h-3 text-purple-400" />
              <span>STAFF ACCESS</span>
            </span>
          )}
        </div>

        {/* Status Pill Badge */}
        <span
          className={`px-2.5 py-1 rounded-full text-[11px] font-mono font-bold uppercase tracking-wider flex items-center gap-1.5 border whitespace-nowrap ${
            isReady
              ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40'
              : isPending
              ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
              : 'bg-indigo-500/15 text-indigo-300 border-indigo-500/40'
          }`}
        >
          {isReady && <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />}
          {isPending && <Clock className="w-3 h-3 text-amber-400 animate-spin" style={{ animationDuration: '4s' }} />}
          {isForming && <Users className="w-3 h-3 text-indigo-400" />}
          <span>{status.shortBadge}</span>
        </span>
      </div>

      {/* Team Identity */}
      <div className="flex items-start gap-3 mb-4">
        {team.teamLogo ? (
          <img
            src={team.teamLogo}
            alt={team.teamName}
            referrerPolicy="no-referrer"
            className="w-12 h-12 rounded-xl object-cover border border-slate-700 shrink-0"
          />
        ) : (
          <div
            className={`w-12 h-12 rounded-xl border flex items-center justify-center font-display font-black text-lg shrink-0 ${
              isReady
                ? 'bg-gradient-to-br from-emerald-950 to-slate-900 border-emerald-500/40 text-emerald-300'
                : isPending
                ? 'bg-gradient-to-br from-amber-950 to-slate-900 border-amber-500/40 text-amber-300'
                : 'bg-gradient-to-br from-indigo-950 to-slate-900 border-indigo-500/30 text-indigo-300'
            }`}
          >
            {team.teamName.charAt(0).toUpperCase()}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h4 className="text-base sm:text-lg font-black font-display text-white tracking-tight truncate group-hover:text-cyan-300 transition-colors">
              {team.teamName}
            </h4>
            {team.teamTag && (
              <span className="px-1.5 py-0.5 rounded bg-slate-800 text-cyan-400 text-xs font-mono font-bold uppercase shrink-0">
                [{team.teamTag}]
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5 truncate">
            <Crown className="w-3 h-3 text-amber-400 shrink-0" />
            <span>Captain:</span>
            <span className="text-slate-300 font-medium truncate">{team.captainGamerTag}</span>
          </p>
        </div>
      </div>

      {/* Roster Slots Mini Visualizer */}
      <div className="space-y-2 mb-3">
        <div className="flex items-center justify-between text-xs font-mono">
          <span className="text-slate-400 flex items-center gap-1">
            <Users className="w-3.5 h-3.5 text-slate-400" />
            <span className="font-bold text-slate-200">
              👥 {status.playerCount} / {status.requiredPlayerCount} PLAYERS
            </span>
          </span>
          <span
            className={`font-bold ${
              isReady ? 'text-emerald-400' : isPending ? 'text-amber-400' : 'text-indigo-400'
            }`}
          >
            {status.progressPercent}%
          </span>
        </div>

        {/* Visual Progress Bar */}
        <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-800/80">
          <div
            className={`h-full transition-all duration-500 rounded-full ${
              isReady
                ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                : isPending
                ? 'bg-gradient-to-r from-amber-500 to-orange-400'
                : 'bg-gradient-to-r from-indigo-500 to-cyan-500'
            }`}
            style={{ width: `${status.progressPercent}%` }}
          />
        </div>

        {/* Text ASCII Block Representation */}
        <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
          <span className="tracking-widest text-slate-400 select-none">
            {blockString}
          </span>
          <span className="uppercase font-semibold">
            {isReady ? 'Ready for bracket' : isPending ? 'Pending staff' : `${status.requiredPlayerCount - status.playerCount} needed`}
          </span>
        </div>
      </div>

      {/* Public Status Message Notice */}
      <div
        className={`p-2.5 rounded-xl text-xs font-mono flex items-center justify-between gap-2 border ${
          isReady
            ? 'bg-emerald-950/20 border-emerald-500/20 text-emerald-300'
            : isPending
            ? 'bg-amber-950/20 border-amber-500/20 text-amber-200'
            : 'bg-indigo-950/20 border-indigo-500/20 text-indigo-200'
        }`}
      >
        <span className="truncate">{status.publicMessage}</span>
        <ChevronRight className="w-4 h-4 shrink-0 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
      </div>
    </div>
  );
};
