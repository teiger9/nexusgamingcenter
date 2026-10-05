import React, { useState, useEffect } from 'react';
import { MatchHistoryRecord } from '../types';
import { subscribeToRecentMatches, formatRecentMatchDate } from '../services/matchHistoryService';
import { deriveMatchRewardsAndMMR } from '../services/matchRewardAnnouncementService';
import {
  Trophy,
  Swords,
  CheckCircle2,
  ArrowRight,
  Shield,
  Coins,
  X,
  Copy,
  Check,
} from 'lucide-react';

interface HomeRecentMatchesFeedProps {
  onViewAllMatchHistory: () => void;
  limitCount?: number;
  title?: string;
  showViewAllButton?: boolean;
}

export const HomeRecentMatchesFeed: React.FC<HomeRecentMatchesFeedProps> = ({
  onViewAllMatchHistory,
  limitCount = 6,
  title = 'Recent Matches',
  showViewAllButton = true,
}) => {
  const [matches, setMatches] = useState<MatchHistoryRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedMatch, setSelectedMatch] = useState<MatchHistoryRecord | null>(null);
  const [copiedId, setCopiedId] = useState<boolean>(false);

  useEffect(() => {
    setLoading(true);
    const unsub = subscribeToRecentMatches(limitCount, (records) => {
      setMatches(records);
      setLoading(false);
    });
    return () => unsub();
  }, [limitCount]);

  const getGameIcon = (game: string) => {
    const g = (game || '').toLowerCase();
    if (g.includes('chess')) return '♟️';
    if (g.includes('fc')) return '🎮';
    if (g.includes('cs') || g.includes('counter-strike') || g.includes('counterstrike')) return '🔫';
    if (g.includes('val') || g.includes('valorant')) return '🎯';
    if (g.includes('lol') || g.includes('league')) return '⚔️';
    return '🎮';
  };

  const handleCopyMatchId = (id: string) => {
    if (!id) return;
    navigator.clipboard.writeText(id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  return (
    <section className="relative overflow-hidden rounded-3xl bg-gradient-to-b from-neutral-950 via-[#0b0b12] to-neutral-950 border border-white/10 p-6 sm:p-8 space-y-6 shadow-2xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="px-2.5 py-0.5 rounded-full bg-red-600/20 text-red-400 border border-red-500/30 text-[10px] font-mono font-bold uppercase tracking-widest flex items-center gap-1.5">
              <CheckCircle2 className="w-3 h-3 text-red-400" />
              <span>Public Live Feed</span>
            </span>
            <span className="text-xs font-mono text-neutral-500">• Auto-updating</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black font-display text-white uppercase tracking-tight flex items-center gap-2.5">
            <span>🎮</span>
            <span>{title}</span>
          </h2>
          <p className="text-xs text-neutral-400 mt-1 max-w-xl">
            Official verified match outcomes from Nexus Gaming Center. All scores &amp; NC rewards validated by referees and desk staff.
          </p>
        </div>

        {showViewAllButton && (
          <button
            onClick={onViewAllMatchHistory}
            className="group px-4 py-2.5 rounded-xl bg-neutral-900/90 hover:bg-neutral-800 border border-white/10 hover:border-red-500/50 text-white text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 self-start sm:self-auto cursor-pointer shadow-md"
          >
            <span>View All Match History</span>
            <ArrowRight className="w-3.5 h-3.5 text-red-500 group-hover:translate-x-1 transition-transform" />
          </button>
        )}
      </div>

      {/* Cards Feed */}
      {loading ? (
        <div className="py-12 text-center text-neutral-400 space-y-3">
          <div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs font-mono">Syncing verified arena results...</p>
        </div>
      ) : matches.length === 0 ? (
        <div className="p-10 text-center rounded-2xl bg-neutral-900/40 border border-white/5 space-y-2">
          <Trophy className="w-8 h-8 text-neutral-600 mx-auto" />
          <p className="text-sm font-bold text-white uppercase">No Matches Validated Yet</p>
          <p className="text-xs text-neutral-400 max-w-md mx-auto">
            Play at any Nexus station and have staff validate your score to see your match here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {matches.map((m) => {
            const auth = deriveMatchRewardsAndMMR(m);
            const isDraw = auth.isDraw;
            const gameIcon = getGameIcon(m.game);
            const formattedDate = formatRecentMatchDate(m.validatedAt || m.createdAt);

            // Canonical scores & rewards
            const isChess = (m.game || '').toLowerCase().includes('chess');
            const scoreDisplay = isChess && m.player1Wins === 0 && m.player2Wins === 0
              ? 'DRAW'
              : `${m.player1Wins ?? 0} — ${m.player2Wins ?? 0}`;

            const winMMR = auth.is5v5
              ? (auth.outcome === 'teamA' ? auth.teamAMMRChange : auth.teamBMMRChange)
              : (auth.outcome === 'playerA' ? auth.player1MMRChange : auth.player2MMRChange);
            const loseMMR = auth.is5v5
              ? (auth.outcome === 'teamA' ? auth.teamBMMRChange : auth.teamAMMRChange)
              : (auth.outcome === 'playerA' ? auth.player2MMRChange : auth.player1MMRChange);

            return (
              <div
                key={m.matchId || m.id}
                onClick={() => setSelectedMatch(m)}
                className="group relative p-5 rounded-2xl bg-gradient-to-b from-[#101018] to-[#0a0a0f] border border-white/10 hover:border-red-500/60 transition-all duration-200 cursor-pointer shadow-lg hover:shadow-[0_0_20px_rgba(239,68,68,0.2)] flex flex-col justify-between space-y-3.5"
              >
                {/* Card Header: Game Icon & Game Name + Validated Badge */}
                <div className="flex items-center justify-between border-b border-white/5 pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xl group-hover:scale-110 transition-transform">{gameIcon}</span>
                    <span className="text-sm font-black font-display text-white uppercase tracking-tight">
                      {auth.gameName}
                    </span>
                    {auth.is5v5 && (
                      <span className="px-1.5 py-0.5 rounded bg-cyan-950 border border-cyan-500/40 text-cyan-400 text-[9px] font-mono font-bold">
                        5v5 SQUAD
                      </span>
                    )}
                  </div>

                  <span className="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-mono font-bold uppercase tracking-wider flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>VALIDATED</span>
                  </span>
                </div>

                {/* Opponents & Score Row (Clean, readable layout) */}
                <div className="p-3 rounded-xl bg-black/50 border border-white/5 space-y-1.5 font-mono">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className={`truncate max-w-[42%] ${auth.outcome === 'teamA' || auth.outcome === 'playerA' ? 'text-emerald-400 font-black' : 'text-neutral-300'}`}>
                      {auth.entityAName}
                    </span>
                    <span className="text-amber-400 text-sm font-black tracking-wider px-2">
                      {scoreDisplay}
                    </span>
                    <span className={`truncate max-w-[42%] text-right ${auth.outcome === 'teamB' || auth.outcome === 'playerB' ? 'text-emerald-400 font-black' : 'text-neutral-300'}`}>
                      {auth.entityBName}
                    </span>
                  </div>
                </div>

                {/* Winner & NC Reward Display (Authoritative single engine) */}
                <div className="p-2.5 rounded-xl bg-neutral-950/80 border border-white/5 text-xs font-mono space-y-1.5">
                  {isDraw ? (
                    <div className="flex items-center justify-between">
                      <span className="text-amber-400 font-bold flex items-center gap-1.5">
                        <span>🤝</span>
                        <span>Draw</span>
                      </span>
                      <div className="text-right">
                        <div className="flex items-center justify-end gap-2 text-amber-400 font-black">
                          <span>+{auth.drawRewardPerPlayer} NC{auth.is5v5 ? '/player' : ''}</span>
                          {auth.teamAMMRChange !== undefined && (
                            <span className="text-[10px] text-slate-400 font-normal">
                              ({auth.teamAMMRChange >= 0 ? `+${auth.teamAMMRChange}` : auth.teamAMMRChange} MMR)
                            </span>
                          )}
                        </div>
                        {auth.is5v5 && (
                          <div className="text-[9px] text-neutral-500 font-mono">
                            {auth.drawTeamTotalReward} NC squad each
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-white font-bold flex items-center gap-1.5 truncate max-w-[65%]">
                          <span className="text-amber-400 shrink-0">🏆</span>
                          <span className="text-emerald-400 font-black truncate">{auth.winnerTitle}</span>
                        </span>
                        <div className="flex items-center gap-2 shrink-0">
                          {winMMR !== undefined && (
                            <span className="text-cyan-400 font-bold text-[11px]">
                              {winMMR >= 0 ? `+${winMMR}` : winMMR} MMR
                            </span>
                          )}
                          <span className="text-amber-400 font-black text-xs">
                            +{auth.winnerRewardPerPlayer} NC{auth.is5v5 ? '/player' : ''}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span className="flex items-center gap-1.5 truncate max-w-[65%]">
                          <span className="text-red-400 shrink-0">❌</span>
                          <span className="truncate">{auth.loserTitle}</span>
                        </span>
                        <div className="flex items-center gap-2 shrink-0">
                          {loseMMR !== undefined && (
                            <span className="text-red-400 font-medium text-[10px]">
                              {loseMMR >= 0 ? `+${loseMMR}` : loseMMR} MMR
                            </span>
                          )}
                          <span className="text-amber-500/80 font-mono text-[10px]">
                            +{auth.loserRewardPerPlayer} NC{auth.is5v5 ? '/player' : ''}
                          </span>
                        </div>
                      </div>

                      {auth.is5v5 && (
                        <div className="text-[9px] text-neutral-500 text-right pt-0.5 border-t border-neutral-900">
                          Squad Total: {auth.winnerTeamTotalReward} NC winner • {auth.loserTeamTotalReward} NC loser
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Footer: Date/time & Validator */}
                <div className="flex items-center justify-between text-[11px] font-mono text-neutral-400 pt-1 border-t border-white/5">
                  <span className="flex items-center gap-1 text-neutral-400">
                    <Shield className="w-3 h-3 text-red-400" />
                    <span>Validated by {m.validatedByRole || 'Staff'}</span>
                  </span>
                  <span className="font-bold text-neutral-300">{formattedDate}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Prominent VIEW ALL MATCH HISTORY button */}
      {showViewAllButton && matches.length > 0 && (
        <div className="pt-2 text-center">
          <button
            onClick={onViewAllMatchHistory}
            className="w-full sm:w-auto px-8 py-3.5 rounded-2xl bg-gradient-to-r from-red-600 via-red-500 to-red-600 hover:from-red-500 hover:to-red-400 text-white font-black text-xs uppercase tracking-widest transition-all duration-200 cursor-pointer shadow-[0_0_25px_rgba(239,68,68,0.35)] hover:shadow-[0_0_35px_rgba(239,68,68,0.5)] flex items-center justify-center gap-2.5 mx-auto"
          >
            <span>VIEW ALL MATCH HISTORY</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Public Match Details Modal (Zero private data exposed) */}
      {selectedMatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md overflow-y-auto animate-fadeIn">
          <div className="relative w-full max-w-lg bg-[#0d0d14] border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 my-8">
            <button
              onClick={() => setSelectedMatch(null)}
              className="absolute top-5 right-5 text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-neutral-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Modal Header */}
            <div className="flex items-center gap-3.5 border-b border-white/10 pb-5">
              <div className="w-14 h-14 rounded-2xl bg-neutral-900 border border-white/10 flex items-center justify-center text-3xl shrink-0">
                {getGameIcon(selectedMatch.game)}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-mono font-bold uppercase">
                    STATUS: VALIDATED
                  </span>
                  <span className="text-xs font-mono text-neutral-400">{selectedMatch.gameMode || '1v1'}</span>
                </div>
                <h3 className="text-2xl font-black font-display text-white uppercase mt-1">
                  {selectedMatch.game} Match
                </h3>
              </div>
            </div>

            {/* Score & Outcome Banner and Participants Dossier */}
            {(() => {
              const modalAuth = deriveMatchRewardsAndMMR(selectedMatch);
              const p1MMR = modalAuth.is5v5 ? modalAuth.teamAMMRChange : modalAuth.player1MMRChange;
              const p2MMR = modalAuth.is5v5 ? modalAuth.teamBMMRChange : modalAuth.player2MMRChange;
              return (
                <>
                  <div className="p-4 rounded-2xl bg-neutral-900/80 border border-white/10 space-y-3 font-mono text-center">
                    <div className="text-xs uppercase text-neutral-400 font-bold">Official Match Outcome</div>
                    <div className="text-3xl font-black text-white tracking-wide">
                      {selectedMatch.player1Wins ?? 0} — {selectedMatch.player2Wins ?? 0}
                    </div>
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold uppercase">
                      <Trophy className="w-3.5 h-3.5 text-amber-400" />
                      <span>
                        {modalAuth.isDraw
                          ? 'SERIES DRAW'
                          : `WINNER: ${modalAuth.winnerTitle}`}
                      </span>
                    </div>
                    <div className="text-xs text-slate-300 font-mono mt-1">
                      {modalAuth.rewardBreakdown}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                    <div className="p-4 rounded-2xl bg-neutral-950 border border-white/5 space-y-2">
                      <span className="text-[10px] text-red-400 uppercase font-bold block">
                        {modalAuth.is5v5 ? 'Squad Alpha' : 'Player 1'}
                      </span>
                      <div className="text-base font-black text-white truncate">{modalAuth.entityAName}</div>
                      <div className="pt-2 border-t border-neutral-900 flex justify-between items-center text-sm">
                        <span className="text-neutral-400">Wins:</span>
                        <span className="font-bold text-white">{selectedMatch.player1Wins ?? 0}</span>
                      </div>
                      {p1MMR !== undefined && (
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-neutral-400">MMR Change:</span>
                          <span className={`font-bold ${p1MMR >= 0 ? 'text-cyan-400' : 'text-red-400'}`}>
                            {p1MMR >= 0 ? `+${p1MMR}` : p1MMR}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-neutral-400">Reward:</span>
                        <span className="font-bold text-amber-400">
                          +{modalAuth.teamARewardPerPlayer} NC{modalAuth.is5v5 ? '/player' : ''}
                        </span>
                      </div>
                      {modalAuth.is5v5 && (
                        <div className="text-[10px] text-slate-500 text-right">
                          Squad Total: {modalAuth.teamATotalReward} NC
                        </div>
                      )}
                    </div>

                    <div className="p-4 rounded-2xl bg-neutral-950 border border-white/5 space-y-2">
                      <span className="text-[10px] text-cyan-400 uppercase font-bold block">
                        {modalAuth.is5v5 ? 'Squad Beta' : 'Player 2'}
                      </span>
                      <div className="text-base font-black text-white truncate">{modalAuth.entityBName}</div>
                      <div className="pt-2 border-t border-neutral-900 flex justify-between items-center text-sm">
                        <span className="text-neutral-400">Wins:</span>
                        <span className="font-bold text-white">{selectedMatch.player2Wins ?? 0}</span>
                      </div>
                      {p2MMR !== undefined && (
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-neutral-400">MMR Change:</span>
                          <span className={`font-bold ${p2MMR >= 0 ? 'text-cyan-400' : 'text-red-400'}`}>
                            {p2MMR >= 0 ? `+${p2MMR}` : p2MMR}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-neutral-400">Reward:</span>
                        <span className="font-bold text-amber-400">
                          +{modalAuth.teamBRewardPerPlayer} NC{modalAuth.is5v5 ? '/player' : ''}
                        </span>
                      </div>
                      {modalAuth.is5v5 && (
                        <div className="text-[10px] text-slate-500 text-right">
                          Squad Total: {modalAuth.teamBTotalReward} NC
                        </div>
                      )}
                    </div>
                  </div>
                </>
              );
            })()}

            {/* Validation Info */}
            <div className="space-y-2 text-xs font-mono p-4 rounded-2xl bg-neutral-950 border border-white/5">
              <div className="flex justify-between text-neutral-400">
                <span>Validated By:</span>
                <span className="text-white font-bold">{selectedMatch.validatedByRole || 'Staff'}</span>
              </div>
              <div className="flex justify-between text-neutral-400">
                <span>Date &amp; Time:</span>
                <span className="text-white">{formatRecentMatchDate(selectedMatch.validatedAt || selectedMatch.createdAt)}</span>
              </div>
              <div className="flex justify-between items-center text-neutral-400 pt-2 border-t border-neutral-900">
                <span>Match ID:</span>
                <button
                  onClick={() => handleCopyMatchId(selectedMatch.matchId || selectedMatch.id || '')}
                  className="flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300 font-bold"
                >
                  <span className="truncate max-w-[200px]">{selectedMatch.matchId || selectedMatch.id}</span>
                  {copiedId ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                </button>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setSelectedMatch(null);
                  onViewAllMatchHistory();
                }}
                className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold uppercase tracking-wider transition-all"
              >
                Open Full Match History
              </button>
              <button
                onClick={() => setSelectedMatch(null)}
                className="px-5 py-3 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-white text-xs font-bold uppercase tracking-wider transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
