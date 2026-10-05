import React from 'react';
import { Tournament, TournamentParticipant } from '../types';
import { Trophy, Crown, Sparkles, Award, Medal, Calendar, Users, Gamepad2, ArrowRight } from 'lucide-react';

interface TournamentChampionsShowcaseProps {
  champions: Tournament[];
  onSelectTournament?: (tournamentId: string) => void;
  onSelectParticipant?: (participantId: string, type: 'PLAYER' | 'TEAM') => void;
}

export const TournamentChampionsShowcase: React.FC<TournamentChampionsShowcaseProps> = ({
  champions,
  onSelectTournament,
  onSelectParticipant,
}) => {
  if (!champions || champions.length === 0) {
    return null;
  }

  return (
    <section className="relative overflow-hidden rounded-3xl bg-gradient-to-b from-[#131520] via-[#0d0f18] to-[#080910] border-2 border-yellow-500/40 p-6 sm:p-10 shadow-2xl space-y-6">
      {/* Background Glow */}
      <div className="absolute top-0 right-1/4 w-96 h-96 bg-yellow-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-10 w-72 h-72 bg-amber-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-yellow-500/20 pb-5">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 font-mono text-xs font-bold uppercase tracking-wider">
            <Crown className="w-4 h-4 text-yellow-400" />
            <span>HALL OF CHAMPIONS</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black font-display tracking-tight text-white uppercase flex items-center gap-2">
            <span>OFFICIAL TOURNAMENT CHAMPIONS</span>
            <Sparkles className="w-6 h-6 text-yellow-400 animate-pulse" />
          </h2>
          <p className="text-xs text-slate-300 font-mono">
            Officially crowned winners of sanctioned Nexus Gaming Center tournaments. Permanently immortalized.
          </p>
        </div>
      </div>

      {/* Champions Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 relative z-10">
        {champions.map((tourn) => (
          <div
            key={tourn.id}
            onClick={() => onSelectTournament && onSelectTournament(tourn.id)}
            className="group p-5 rounded-3xl bg-[#0e101a]/90 border border-yellow-500/30 hover:border-yellow-400/80 transition-all duration-300 cursor-pointer shadow-lg hover:shadow-[0_0_25px_rgba(234,179,8,0.2)] flex flex-col justify-between space-y-4 relative overflow-hidden"
          >
            {/* Top banner tag */}
            <div className="flex items-center justify-between">
              <span className="px-2.5 py-1 rounded-xl bg-yellow-500/20 border border-yellow-500/40 text-yellow-300 font-mono text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5">
                <Trophy className="w-3.5 h-3.5 text-yellow-400" />
                <span>{tourn.gameName}</span>
              </span>

              <span className="px-2 py-0.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 font-mono text-[10px] uppercase font-bold">
                {tourn.type === 'TEAM' ? '5v5 Squad' : '1v1 Individual'}
              </span>
            </div>

            {/* Winner Spotlight */}
            <div className="space-y-3">
              <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">
                {tourn.name}
              </div>

              <div className="p-4 rounded-2xl bg-gradient-to-r from-yellow-950/40 to-slate-900/60 border border-yellow-500/30 flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-yellow-400 text-black font-black flex items-center justify-center text-xl shadow-[0_0_15px_rgba(234,179,8,0.4)] shrink-0">
                  {tourn.winnerType === 'TEAM' ? '🛡️' : '👑'}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-mono text-yellow-400 font-bold uppercase tracking-wider flex items-center gap-1">
                    <span>1ST PLACE CHAMPION</span>
                  </div>
                  <div className="text-base sm:text-lg font-black text-white truncate group-hover:text-yellow-300 transition-colors">
                    {tourn.winnerName || 'Winner'}
                  </div>
                  {tourn.prizes?.firstPlace && (
                    <div className="text-[11px] text-yellow-200/80 font-mono truncate">
                      🎁 {tourn.prizes.firstPlace}
                    </div>
                  )}
                </div>
              </div>

              {/* Runner-up & 3rd Place row */}
              {(tourn.runnerUpName || tourn.thirdPlaceName) && (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  {tourn.runnerUpName && (
                    <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 text-[11px]">
                      <div className="text-slate-400 font-mono text-[9px] uppercase font-bold flex items-center gap-1">
                        <span>🥈 Finalist</span>
                      </div>
                      <div className="font-bold text-slate-200 truncate mt-0.5">
                        {tourn.runnerUpName}
                      </div>
                    </div>
                  )}

                  {tourn.thirdPlaceName && (
                    <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 text-[11px]">
                      <div className="text-slate-400 font-mono text-[9px] uppercase font-bold flex items-center gap-1">
                        <span>🥉 3rd Place</span>
                      </div>
                      <div className="font-bold text-slate-200 truncate mt-0.5">
                        {tourn.thirdPlaceName}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Bottom info footer */}
            <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs font-mono">
              <span className="text-slate-400 text-[11px]">
                {tourn.announcedAt ? new Date(tourn.announcedAt).toLocaleDateString() : 'Official'}
              </span>
              <span className="text-yellow-400 font-bold flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                <span>View Bracket</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};
