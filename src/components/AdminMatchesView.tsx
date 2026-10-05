import React, { useState, useEffect } from 'react';
import { subscribeToAllMatches } from '../services/matchService';
import { Match } from '../types';
import { AdminForceEndModal } from './AdminForceEndModal';
import { useAuth } from '../context/AuthContext';
import { formatMatchDateTime, formatMatchDuration } from '../utils/matchTimer';
import {
  Swords,
  Search,
  Filter,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  ChevronRight,
  ShieldAlert,
  XCircle,
  Trophy,
  ArrowRight,
  AlertOctagon,
} from 'lucide-react';

interface AdminMatchesViewProps {
  onSelectMatch: (matchId: string) => void;
}

export const AdminMatchesView: React.FC<AdminMatchesViewProps> = ({ onSelectMatch }) => {
  const { isAdmin } = useAuth();
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [gameFilter, setGameFilter] = useState<string>('ALL');
  const [forceEndMatchTarget, setForceEndMatchTarget] = useState<Match | null>(null);

  useEffect(() => {
    const unsub = subscribeToAllMatches((data) => {
      setMatches(data);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  const filtered = matches.filter((m) => {
    if (statusFilter !== 'ALL' && m.status !== statusFilter) return false;
    if (gameFilter !== 'ALL') {
      const matchGameId = (m.gameId || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const filterGameId = gameFilter.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (matchGameId !== filterGameId && !m.gameName.toLowerCase().includes(gameFilter.toLowerCase())) {
        return false;
      }
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        m.gameName.toLowerCase().includes(q) ||
        m.playerAGamerTag.toLowerCase().includes(q) ||
        m.playerBGamerTag.toLowerCase().includes(q) ||
        m.station.toLowerCase().includes(q) ||
        (m.teamAName && m.teamAName.toLowerCase().includes(q)) ||
        (m.teamBName && m.teamBName.toLowerCase().includes(q)) ||
        (m.adminName && m.adminName.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const canForceEnd = (status: string) => {
    return status === 'LIVE' ||
      status === 'AWAITING_CONFIRMATION' ||
      status === 'DISPUTED' ||
      status === 'WAITING_FOR_ADMIN' ||
      status === 'APPROVED' ||
      status === 'PENDING';
  };

  const formatDeclaration = (decl?: string | null) => {
    if (!decl) return <span className="text-slate-500 italic">None</span>;
    if (decl === 'WIN' || decl === 'playerA' || decl === 'playerB') {
      return <span className="text-emerald-400 font-bold">WIN</span>;
    }
    if (decl === 'LOSS') {
      return <span className="text-rose-400 font-bold">LOSS</span>;
    }
    if (decl === 'DRAW' || decl === 'draw') {
      return <span className="text-yellow-400 font-bold">DRAW</span>;
    }
    return <span className="text-slate-300 font-bold">{decl}</span>;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black font-display text-white">ALL CENTER MATCHES</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Audit log of all competitive duels across Nexus Gaming Center with referee override controls.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Game Selector */}
          <select
            value={gameFilter}
            onChange={(e) => setGameFilter(e.target.value)}
            className="bg-[#0a0a0f] border border-slate-800 text-xs text-cyan-400 font-bold rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-cyan-400 font-mono"
          >
            <option value="ALL">All Games</option>
            <option value="chess">♟️ Chess (1v1)</option>
            <option value="fc26">⚽ FC 26 (1v1)</option>
            <option value="fc27">⚽ FC 27 (1v1)</option>
            <option value="valorant">🔫 Valorant (5v5)</option>
            <option value="cs2">🔫 CS2 (5v5)</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-[#0a0a0f] border border-slate-800 text-xs text-slate-200 rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-cyan-400 font-mono"
          >
            <option value="ALL">All Statuses</option>
            <option value="WAITING_FOR_ADMIN">Waiting For Admin</option>
            <option value="APPROVED">Approved (Ready)</option>
            <option value="LIVE">Live</option>
            <option value="AWAITING_CONFIRMATION">Awaiting Confirmation</option>
            <option value="CONFIRMED">Confirmed</option>
            <option value="DISPUTED">Disputed</option>
            <option value="CANCELLED">Cancelled</option>
            <option value="REJECTED">Rejected</option>
            <option value="PENDING">Pending</option>
          </select>

          <div className="relative w-full sm:w-60">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search players, stations..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-[#0a0a0f] border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center">
          <div className="inline-block w-8 h-8 border-3 border-cyan-400 border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-slate-400 text-xs font-mono">Loading match logbook...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center bg-[#0a0a0f] border border-slate-800 rounded-3xl p-6 text-xs text-slate-400">
          No matches found.
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((m) => (
            <div
              key={m.id}
              className="p-5 sm:p-6 rounded-3xl bg-[#0a0a0f] border border-slate-800 hover:border-slate-700 transition-all shadow-xl space-y-4"
            >
              {/* Header Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
                <div className="flex items-center gap-3">
                  <span
                    className={`px-3 py-1 rounded-lg text-xs font-mono font-bold ${
                      m.status === 'CONFIRMED'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : m.status === 'DISPUTED'
                        ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                        : m.status === 'LIVE'
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                        : m.status === 'APPROVED'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : m.status === 'WAITING_FOR_ADMIN'
                        ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30'
                        : m.status === 'CANCELLED'
                        ? 'bg-slate-700 text-slate-300 border border-slate-600'
                        : m.status === 'REJECTED'
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                        : m.status === 'AWAITING_CONFIRMATION'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {m.status}
                  </span>

                  <div>
                    <div className="text-base font-bold text-white font-display flex items-center gap-2">
                      <span>{m.gameName}</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                        {m.matchType === '5v5' ? '5v5 TEAM' : '1v1'}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono flex flex-wrap items-center gap-x-2 gap-y-1 mt-0.5">
                      <span>Station: <strong className="text-slate-300">{m.station}</strong></span>
                      <span>•</span>
                      <span>Created: {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      {m.startedAt && (
                        <>
                          <span>•</span>
                          <span className="text-emerald-400 font-bold">
                            Started: {formatMatchDateTime(m.startedAt)}
                            {m.startedByName ? ` (${m.startedByName})` : ''}
                          </span>
                        </>
                      )}
                      {m.endedAt && (
                        <>
                          <span>•</span>
                          <span className="text-slate-300">
                            Ended: {formatMatchDateTime(m.endedAt)}
                          </span>
                        </>
                      )}
                      {(m.durationFormatted || m.durationSeconds !== undefined) && (
                        <>
                          <span>•</span>
                          <span className="text-cyan-400 font-bold bg-cyan-950/40 px-1.5 py-0.5 rounded border border-cyan-500/20">
                            ⏱️ {m.durationFormatted || formatMatchDuration(m.durationSeconds)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {isAdmin && canForceEnd(m.status) && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setForceEndMatchTarget(m);
                      }}
                      className="px-3.5 py-1.5 rounded-xl bg-red-600/20 hover:bg-red-600 text-red-300 hover:text-white border border-red-500/40 text-xs font-mono font-black uppercase tracking-wider transition-all shadow-[0_0_10px_rgba(239,68,68,0.2)] flex items-center gap-1.5 active:scale-95"
                    >
                      <AlertOctagon className="w-3.5 h-3.5" />
                      <span>🛑 END MATCH</span>
                    </button>
                  )}

                  <button
                    onClick={() => onSelectMatch(m.id)}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono font-bold transition-colors flex items-center gap-1"
                  >
                    <span>Room</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Grid showing GAME, PLAYER A / TEAM A, PLAYER B / TEAM B, RESULTS, MMR BEFORE & AFTER */}
              {m.matchType === '5v5' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 font-mono text-xs">
                  {/* Team A Box */}
                  <div className="p-3.5 rounded-2xl bg-[#121218] border border-cyan-500/30 space-y-2">
                    <div className="flex items-center justify-between text-slate-400">
                      <span className="uppercase text-[10px] font-bold text-cyan-400">Team A (5v5)</span>
                      <span className="text-cyan-400 font-bold text-sm font-display">{m.teamAName || 'Team A'}</span>
                    </div>

                    <div className="space-y-1 py-1 border-t border-slate-800/60">
                      {(m.teamAPlayers || []).map((p, idx) => (
                        <div key={p.id || idx} className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-200">{idx + 1}. {p.gamerTag}</span>
                          <span className="text-slate-500 text-[10px]">
                            {m.votes?.[p.id] ? `Vote: ${m.votes[p.id]}` : 'No vote'}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800/60 text-[11px]">
                      <div>
                        <div className="text-slate-500 text-[10px]">Team Avg MMR:</div>
                        <div className="text-slate-300 font-bold mt-0.5">
                          {m.teamAAvgRating ?? '1000'}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-500 text-[10px]">MMR Impact:</div>
                        <div className="font-bold mt-0.5 flex items-center gap-1">
                          {m.teamARatingChange !== undefined && m.teamARatingChange !== null ? (
                            <span className={m.teamARatingChange >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                              {m.teamARatingChange >= 0 ? `+${m.teamARatingChange}` : m.teamARatingChange} MMR
                            </span>
                          ) : (
                            <span className="text-slate-500">—</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Team B Box */}
                  <div className="p-3.5 rounded-2xl bg-[#121218] border border-blue-500/30 space-y-2">
                    <div className="flex items-center justify-between text-slate-400">
                      <span className="uppercase text-[10px] font-bold text-blue-400">Team B (5v5)</span>
                      <span className="text-blue-400 font-bold text-sm font-display">{m.teamBName || 'Team B'}</span>
                    </div>

                    <div className="space-y-1 py-1 border-t border-slate-800/60">
                      {(m.teamBPlayers || []).map((p, idx) => (
                        <div key={p.id || idx} className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-200">{idx + 1}. {p.gamerTag}</span>
                          <span className="text-slate-500 text-[10px]">
                            {m.votes?.[p.id] ? `Vote: ${m.votes[p.id]}` : 'No vote'}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800/60 text-[11px]">
                      <div>
                        <div className="text-slate-500 text-[10px]">Team Avg MMR:</div>
                        <div className="text-slate-300 font-bold mt-0.5">
                          {m.teamBAvgRating ?? '1000'}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-500 text-[10px]">MMR Impact:</div>
                        <div className="font-bold mt-0.5 flex items-center gap-1">
                          {m.teamBRatingChange !== undefined && m.teamBRatingChange !== null ? (
                            <span className={m.teamBRatingChange >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                              {m.teamBRatingChange >= 0 ? `+${m.teamBRatingChange}` : m.teamBRatingChange} MMR
                            </span>
                          ) : (
                            <span className="text-slate-500">—</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 font-mono text-xs">
                  {/* Player A Box */}
                  <div className="p-3.5 rounded-2xl bg-[#121218] border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between text-slate-400">
                      <span className="uppercase text-[10px] font-bold">Player A</span>
                      <span className="text-cyan-400 font-bold text-sm font-display">{m.playerAGamerTag}</span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 pt-1 border-t border-slate-800/60 text-[11px]">
                      <div>
                        <div className="text-slate-500 text-[10px]">Result:</div>
                        <div className="mt-0.5">{formatDeclaration(m.playerADeclaration)}</div>
                      </div>
                      <div>
                        <div className="text-slate-500 text-[10px]">MMR Before:</div>
                        <div className="text-slate-300 font-bold mt-0.5">
                          {m.playerARatingBefore ?? '1000'}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-500 text-[10px]">MMR After:</div>
                        <div className="font-bold mt-0.5 flex items-center gap-1">
                          <span className="text-white">{m.playerARatingAfter ?? '—'}</span>
                          {m.playerARatingChange !== undefined && m.playerARatingChange !== null && (
                            <span
                              className={
                                m.playerARatingChange >= 0
                                  ? 'text-emerald-400 text-[10px]'
                                  : 'text-rose-400 text-[10px]'
                              }
                            >
                              ({m.playerARatingChange >= 0 ? `+${m.playerARatingChange}` : m.playerARatingChange})
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Player B Box */}
                  <div className="p-3.5 rounded-2xl bg-[#121218] border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between text-slate-400">
                      <span className="uppercase text-[10px] font-bold">Player B</span>
                      <span className="text-blue-400 font-bold text-sm font-display">{m.playerBGamerTag}</span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 pt-1 border-t border-slate-800/60 text-[11px]">
                      <div>
                        <div className="text-slate-500 text-[10px]">Result:</div>
                        <div className="mt-0.5">{formatDeclaration(m.playerBDeclaration)}</div>
                      </div>
                      <div>
                        <div className="text-slate-500 text-[10px]">MMR Before:</div>
                        <div className="text-slate-300 font-bold mt-0.5">
                          {m.playerBRatingBefore ?? '1000'}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-500 text-[10px]">MMR After:</div>
                        <div className="font-bold mt-0.5 flex items-center gap-1">
                          <span className="text-white">{m.playerBRatingAfter ?? '—'}</span>
                          {m.playerBRatingChange !== undefined && m.playerBRatingChange !== null && (
                            <span
                              className={
                                m.playerBRatingChange >= 0
                                  ? 'text-emerald-400 text-[10px]'
                                  : 'text-rose-400 text-[10px]'
                              }
                            >
                              ({m.playerBRatingChange >= 0 ? `+${m.playerBRatingChange}` : m.playerBRatingChange})
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Admin Decision / Override Summary (if applicable) */}
              {(m.adminResolved || m.resultType === 'ADMIN_DECISION' || m.resultType === 'ADMIN_CANCELLATION' || m.adminId) && (
                <div className="p-3 rounded-2xl bg-red-950/20 border border-red-500/30 text-xs font-mono flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-red-300">
                    <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
                    <span>
                      <strong>ADMIN DECISION:</strong>{' '}
                      {m.resultType === 'ADMIN_CANCELLATION'
                        ? 'Match Voided / Cancelled'
                        : m.winnerId === 'draw' || m.officialResult === 'DRAW'
                        ? 'Official Draw Ruled'
                        : m.winnerId === 'teamA' || m.officialWinner === 'teamA' || m.winnerId === m.playerAId || m.officialWinner === m.playerAId
                        ? `${m.matchType === '5v5' ? (m.teamAName || 'Team A') : m.playerAGamerTag} Declared Winner`
                        : `${m.matchType === '5v5' ? (m.teamBName || 'Team B') : m.playerBGamerTag} Declared Winner`}
                    </span>
                  </div>

                  <div className="text-[11px] text-slate-400">
                    {m.adminResolutionReason && (
                      <span className="italic mr-2">"{m.adminResolutionReason}"</span>
                    )}
                    <span>by {m.resolvedByName || m.adminName || 'Nexus Admin'}</span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Force End Modal */}
      {forceEndMatchTarget && (
        <AdminForceEndModal
          match={forceEndMatchTarget}
          onClose={() => setForceEndMatchTarget(null)}
          onSuccess={() => setForceEndMatchTarget(null)}
        />
      )}
    </div>
  );
};

