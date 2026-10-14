import React, { useState, useEffect } from 'react';
import { Tournament, Season } from '../types';
import { Trophy, Crown, Sparkles, ChevronRight, ArrowRight, ShieldCheck, Flame, Medal } from 'lucide-react';
import { subscribeToActiveSeason } from '../services/seasonService';

interface TournamentChampionsShowcaseProps {
  champions: Tournament[];
  onSelectTournament?: (tournamentId: string) => void;
  onSelectParticipant?: (participantId: string, type: 'PLAYER' | 'TEAM') => void;
}

export const TournamentChampionsShowcase: React.FC<TournamentChampionsShowcaseProps> = ({
  champions,
  onSelectTournament,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [activeSeason, setActiveSeason] = useState<Season | null>(null);

  useEffect(() => {
    const unsub = subscribeToActiveSeason((season) => {
      setActiveSeason(season);
    });
    return () => unsub();
  }, []);

  const hasChampions = champions && champions.length > 0;
  const currentTourn = hasChampions ? champions[selectedIndex] || champions[0] : null;

  // Derive squad tag and record from live tournament data
  const winnerTag = currentTourn?.winnerName
    ? currentTourn.participants?.find(
        (p) => p.name === currentTourn.winnerName || p.id === currentTourn.winnerId
      )?.teamTag ||
      currentTourn.participants?.find(
        (p) => p.name === currentTourn.winnerName || p.id === currentTourn.winnerId
      )?.tag ||
      currentTourn.winnerName.replace(/\s+(squad|team)$/i, '').toUpperCase()
    : 'CHAMPION';

  // Calculate tournament record from matches if available
  const matchWins = currentTourn?.matches
    ? currentTourn.matches.filter(
        (m) =>
          (m.winnerId && m.winnerId === currentTourn.winnerId) ||
          (m.winnerName && m.winnerName === currentTourn.winnerName)
      ).length
    : 0;

  const recordDisplay = matchWins > 0 ? `${matchWins} - 0 (Undefeated)` : '3 - 0 (Undefeated)';
  const prizeDisplay = currentTourn?.prizes?.firstPlace || currentTourn?.prizePool || '10,000 DA';

  return (
    <section className="relative overflow-hidden rounded-2xl sm:rounded-3xl bg-gradient-to-b from-[#14120e]/95 via-[#0c0f18]/95 to-[#080a12]/98 border border-amber-600/35 p-6 sm:p-8 shadow-[0_12px_45px_rgba(0,0,0,0.8),0_0_35px_rgba(245,158,11,0.06)] transition-all">
      {/* Background ambient warm gold glow */}
      <div className="absolute -top-24 -right-24 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -left-24 w-80 h-80 bg-amber-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(#f59e0b_1px,transparent_1px)] [background-size:28px_28px] opacity-[0.035] pointer-events-none" />

      {/* TOP HEADER: Hall of Champions label, Heading, Subtitle, and Season Badge */}
      <div className="relative z-10 flex flex-col md:flex-row md:items-start justify-between gap-4 border-b border-white/[0.08] pb-5">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-amber-500/10 border border-amber-500/40 text-amber-400 font-mono text-xs font-bold uppercase tracking-wider">
            <Crown className="w-3.5 h-3.5 text-amber-400" />
            <span>HALL OF CHAMPIONS</span>
          </div>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-black font-display tracking-tight text-white uppercase">
            OFFICIAL TOURNAMENT CHAMPIONS
          </h2>
          <p className="text-xs text-zinc-400 font-mono">
            Officially crowned winners of sanctioned Nexus Gaming Center tournaments. Permanently immortalized.
          </p>
        </div>

        {/* Top-Right: Season Active Badge */}
        <div className="shrink-0 flex items-center gap-2 self-start md:self-auto">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-emerald-950/40 border border-emerald-500/40 text-emerald-400 font-mono text-xs font-bold uppercase tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>{activeSeason ? `${activeSeason.name.toUpperCase()} ACTIVE` : 'SEASON 1 ACTIVE'}</span>
          </span>
        </div>
      </div>

      {/* INNER CONTENT BOX: Featured Champion & Squad Stats */}
      {hasChampions && currentTourn ? (
        <div className="relative z-10 rounded-2xl bg-[#080b14]/90 border border-slate-800/80 p-5 sm:p-6 mt-6 space-y-5 shadow-inner">
          {/* Top Sub-row: Game badge, Format badge & Tournament title / Switcher */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] pb-3">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-mono font-bold">
                <Trophy className="w-3.5 h-3.5 text-amber-400" />
                <span>{currentTourn.gameName?.toUpperCase() || 'COMPETITIVE'}</span>
              </span>

              <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-cyan-950/40 border border-cyan-800/50 text-cyan-400 text-xs font-mono font-bold uppercase">
                {currentTourn.type === 'TEAM' ? '5V5 SQUAD' : '1V1 FORMAT'}
              </span>
            </div>

            <div className="flex items-center gap-2 ml-auto">
              {champions.length > 1 ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-mono text-zinc-400 uppercase">Tournament:</span>
                  <select
                    value={selectedIndex}
                    onChange={(e) => setSelectedIndex(Number(e.target.value))}
                    className="bg-[#0b0e17] border border-slate-700/80 text-zinc-200 text-xs rounded-lg px-2.5 py-1 font-mono uppercase focus:outline-none focus:border-amber-400"
                  >
                    {champions.map((c, idx) => (
                      <option key={c.id} value={idx}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <span className="text-xs font-mono font-bold text-zinc-400 uppercase tracking-wider">
                  {currentTourn.name}
                </span>
              )}
            </div>
          </div>

          {/* Center 2-Column Split: Podium on Left, Champion Squad Stats on Right */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
            {/* Podium Cards (3 Columns) */}
            <div className="lg:col-span-7 xl:col-span-8 grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              {/* 1ST PLACE CHAMPION */}
              <div className="rounded-xl bg-[#0c101c] border border-amber-500/60 p-4 text-center flex flex-col items-center justify-between min-h-[160px] shadow-[0_0_20px_rgba(245,158,11,0.15)] relative">
                <div className="w-10 h-10 rounded-full bg-amber-500/20 border border-amber-500/50 text-amber-400 flex items-center justify-center text-lg mb-2 shadow-sm shrink-0">
                  <Crown className="w-5 h-5 text-amber-400" />
                </div>
                <div className="space-y-1 w-full">
                  <span className="text-[10px] font-mono font-bold text-amber-400 uppercase tracking-wider block">
                    1ST PLACE CHAMPION
                  </span>
                  <div className="text-base sm:text-lg font-black font-display text-white truncate max-w-full">
                    {currentTourn.winnerName || 'Undefeated Champion'}
                  </div>
                  <div className="text-xs font-mono font-bold text-amber-300 truncate max-w-full">
                    {currentTourn.prizes?.firstPlace || currentTourn.prizePool || '10,000 DA + Trophy'}
                  </div>
                </div>
              </div>

              {/* FINALIST (2ND) */}
              <div className="rounded-xl bg-[#090d16] border border-slate-800 p-4 text-center flex flex-col items-center justify-between min-h-[160px]">
                <div className="w-10 h-10 rounded-full bg-slate-800/80 border border-slate-700 text-slate-300 flex items-center justify-center text-sm font-mono font-bold mb-2 shrink-0">
                  🥈
                </div>
                <div className="space-y-1 w-full">
                  <span className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider block">
                    FINALIST (2ND)
                  </span>
                  <div className="text-base font-bold font-display text-white truncate max-w-full">
                    {currentTourn.runnerUpName || 'Finalist Squad'}
                  </div>
                  <div className="text-xs font-mono text-zinc-400 truncate max-w-full">
                    {currentTourn.prizes?.secondPlace || 'Runner-up Medal'}
                  </div>
                </div>
              </div>

              {/* 3RD PLACE */}
              <div className="rounded-xl bg-[#090d16] border border-slate-800 p-4 text-center flex flex-col items-center justify-between min-h-[160px]">
                <div className="w-10 h-10 rounded-full bg-slate-800/80 border border-slate-700 text-slate-300 flex items-center justify-center text-sm font-mono font-bold mb-2 shrink-0">
                  🥉
                </div>
                <div className="space-y-1 w-full">
                  <span className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider block">
                    3RD PLACE
                  </span>
                  <div className="text-base font-bold font-display text-white truncate max-w-full">
                    {currentTourn.thirdPlaceName || 'Bronze Finalist'}
                  </div>
                  <div className="text-xs font-mono text-zinc-400 truncate max-w-full">
                    {currentTourn.prizes?.thirdPlace || 'Bronze Medal'}
                  </div>
                </div>
              </div>
            </div>

            {/* CHAMPION SQUAD STATS Panel */}
            <div className="lg:col-span-5 xl:col-span-4 rounded-xl bg-[#090d16] border border-slate-800/90 p-4 sm:p-5 flex flex-col justify-between space-y-3.5">
              <div className="flex items-center gap-1.5 text-xs font-mono font-bold uppercase tracking-wider text-amber-400 border-b border-white/[0.06] pb-2">
                <Crown className="w-3.5 h-3.5 text-amber-400" />
                <span>CHAMPION SQUAD STATS</span>
              </div>

              <div className="space-y-2.5 text-xs font-mono">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">Squad Tag:</span>
                  <strong className="text-white font-bold uppercase tracking-wider">
                    {winnerTag}
                  </strong>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">Tournament Record:</span>
                  <strong className="text-emerald-400 font-bold">
                    {recordDisplay}
                  </strong>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">Total Prize Earned:</span>
                  <strong className="text-amber-400 font-bold">
                    {prizeDisplay}
                  </strong>
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-white/[0.06]">
                  <span className="text-zinc-400">Permanent Hall Crown:</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 border border-amber-500/40 text-amber-300">
                    #01 CROWN
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Sub-row: Sanctioned label on left, View Bracket action on right */}
          <div className="pt-3 border-t border-white/[0.06] flex items-center justify-between text-xs font-mono">
            <span className="text-zinc-500">Official Sanctioned Event</span>

            {onSelectTournament && (
              <button
                onClick={() => onSelectTournament(currentTourn.id)}
                className="text-amber-400 hover:text-amber-300 font-bold flex items-center gap-1 cursor-pointer transition-colors group"
              >
                <span>View Bracket</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
              </button>
            )}
          </div>
        </div>
      ) : (
        /* Empty state when no completed tournaments exist yet */
        <div className="relative z-10 rounded-2xl bg-[#080b14]/90 border border-slate-800/80 p-8 mt-6 text-center space-y-3">
          <Trophy className="w-10 h-10 text-amber-500/50 mx-auto" />
          <h3 className="text-base font-bold text-white font-display uppercase tracking-wider">
            No Tournament Champions Crowned Yet
          </h3>
          <p className="text-xs text-zinc-400 font-mono max-w-md mx-auto">
            Champions of official sanctioned tournaments will be permanently immortalized here upon finalization. Register for upcoming tournaments below to compete for the crown.
          </p>
        </div>
      )}
    </section>
  );
};

