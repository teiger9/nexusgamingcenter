import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { subscribeToDisputedMatches, resolveDisputedMatch } from '../services/matchService';
import { Match } from '../types';
import { AdminForceEndModal } from './AdminForceEndModal';
import { useToast } from './Toast';
import { ShieldAlert, AlertTriangle, CheckCircle2, Swords, MessageSquare, Clock } from 'lucide-react';
import {
  getPlayerDeclarationValue,
  formatDeclarationDisplay,
  get5v5TeamPlayersList,
} from '../utils/declarationHelpers';

export const AdminDisputesView: React.FC = () => {
  const { user, playerProfile, isAdmin } = useAuth();
  const { showToast } = useToast();

  const [disputes, setDisputes] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  // Resolution modal state
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [forceEndMatch, setForceEndMatch] = useState<Match | null>(null);
  const [outcome, setOutcome] = useState<'playerA' | 'playerB' | 'draw'>('playerA');
  const [adminNote, setAdminNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const unsub = subscribeToDisputedMatches((data) => {
      setDisputes(data);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  const handleOpenResolveModal = (match: Match, initialOutcome: 'playerA' | 'playerB' | 'draw') => {
    if (!isAdmin) {
      showToast('error', 'Unauthorized', 'Only Administrators can resolve match disputes.');
      return;
    }
    setSelectedMatch(match);
    setOutcome(initialOutcome);
    setAdminNote('');
  };

  const handleConfirmResolution = async () => {
    if (!isAdmin) {
      showToast('error', 'Unauthorized', 'Only Administrators can resolve match disputes.');
      return;
    }
    if (!selectedMatch || !user || !playerProfile) return;

    setIsSubmitting(true);
    try {
      const res = await resolveDisputedMatch({
        matchId: selectedMatch.id,
        adminId: user.uid,
        adminName: playerProfile.gamerTag || 'Nexus Administrator',
        outcome,
        adminNote: adminNote.trim() || 'Official resolution decided by Nexus Gaming Center Administrator.',
      });

      if (res.success) {
        showToast('success', 'Dispute Resolved!', 'Match confirmed and MMR ratings updated atomically.');
        setSelectedMatch(null);
      } else {
        showToast('error', 'Resolution Failed', res.error);
      }
    } catch (err: any) {
      showToast('error', 'Error resolving dispute', err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="py-20 text-center">
        <div className="inline-block w-8 h-8 border-3 border-cyan-400 border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-slate-400 text-xs font-mono">Loading active dispute queue...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black font-display text-white">DISPUTE RESOLUTION QUEUE</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Matches with conflicting competitor declarations awaiting official referee ruling.
          </p>
        </div>
        <span className="px-3 py-1 rounded-full bg-red-500/20 text-red-300 border border-red-500/40 text-xs font-bold font-mono">
          {disputes.length} Active Dispute{disputes.length !== 1 ? 's' : ''}
        </span>
      </div>

      {disputes.length === 0 ? (
        <div className="py-16 text-center bg-[#0a0a0f] border border-slate-800 rounded-3xl p-8 shadow-xl">
          <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
          <h3 className="text-lg font-bold font-display text-white">No Active Disputes</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
            All recent competitor matches have been agreed upon mutually or already resolved.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {disputes.map((m) => (
            <div
              key={m.id}
              className="p-6 rounded-3xl bg-[#0a0a0f] border border-red-500/40 shadow-2xl space-y-5"
            >
              {/* Header */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2.5">
                  <span className="px-2.5 py-1 rounded-lg bg-red-500/20 text-red-300 text-xs font-mono font-bold border border-red-500/30">
                    DISPUTED
                  </span>
                  <h3 className="text-lg font-bold font-display text-white">
                    {m.gameName}
                  </h3>
                  <span className="text-xs text-slate-400 font-mono">({m.station})</span>
                </div>
                <div className="text-xs text-slate-400 font-mono flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Reported: {new Date(m.updatedAt || m.createdAt).toLocaleTimeString()}</span>
                </div>
              </div>

              {/* Competitors & Conflicting Declarations */}
              {m.matchType === '5v5' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Team A Box */}
                  <div className="p-4 rounded-2xl bg-[#15151b] border border-cyan-500/30">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-mono uppercase text-cyan-400 font-bold">Team A (5v5)</span>
                      <span className="text-xs font-mono font-bold text-white">
                        {m.teamAName || 'Team A'} (Avg MMR: {m.teamAAvgRating || 1000})
                      </span>
                    </div>
                    <div className="space-y-1.5 p-3 rounded-xl bg-[#0a0a0f] border border-slate-800 text-xs">
                      {get5v5TeamPlayersList(m, 'teamA').map((p, idx) => {
                        const decl = getPlayerDeclarationValue(m, p.id, 'teamA');
                        const display = formatDeclarationDisplay(decl, {
                          teamSide: 'teamA',
                          teamAName: m.teamAName,
                          teamBName: m.teamBName,
                          is5v5: true,
                        });
                        return (
                          <div key={p.id || idx} className="flex items-center justify-between text-[11px] font-mono">
                            <span className="text-slate-200">
                              {idx + 1}. {p.gamerTag} {p.isCaptain && <span className="text-cyan-400 font-bold">(C)</span>}
                            </span>
                            <span className={`text-[10px] font-mono font-bold ${display.badgeClass}`}>
                              {display.text}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Team B Box */}
                  <div className="p-4 rounded-2xl bg-[#15151b] border border-blue-500/30">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-mono uppercase text-blue-400 font-bold">Team B (5v5)</span>
                      <span className="text-xs font-mono font-bold text-white">
                        {m.teamBName || 'Team B'} (Avg MMR: {m.teamBAvgRating || 1000})
                      </span>
                    </div>
                    <div className="space-y-1.5 p-3 rounded-xl bg-[#0a0a0f] border border-slate-800 text-xs">
                      {get5v5TeamPlayersList(m, 'teamB').map((p, idx) => {
                        const decl = getPlayerDeclarationValue(m, p.id, 'teamB');
                        const display = formatDeclarationDisplay(decl, {
                          teamSide: 'teamB',
                          teamAName: m.teamAName,
                          teamBName: m.teamBName,
                          is5v5: true,
                        });
                        return (
                          <div key={p.id || idx} className="flex items-center justify-between text-[11px] font-mono">
                            <span className="text-slate-200">
                              {idx + 1}. {p.gamerTag} {p.isCaptain && <span className="text-blue-400 font-bold">(C)</span>}
                            </span>
                            <span className={`text-[10px] font-mono font-bold ${display.badgeClass}`}>
                              {display.text}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Player 1 Box */}
                  <div className="p-4 rounded-2xl bg-[#15151b] border border-slate-800">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-mono uppercase text-cyan-400 font-bold">Player 1</span>
                      <span className="text-xs font-mono font-bold text-white font-display text-sm">
                        {m.playerAGamerTag}
                      </span>
                    </div>
                    <div className="p-3.5 rounded-xl bg-[#0a0a0f] border border-slate-800 text-xs">
                      <div className="text-slate-400 font-mono text-[11px]">Declaration Status:</div>
                      <div className="font-bold text-white text-sm mt-0.5 font-display font-mono">
                        {(() => {
                          const decl = getPlayerDeclarationValue(m, m.playerAId, 'teamA');
                          const display = formatDeclarationDisplay(decl, { teamSide: 'teamA', is5v5: false });
                          return (
                            <span className={display.badgeClass}>
                              {display.text === 'Not declared'
                                ? `${m.playerAGamerTag} — Not declared`
                                : `${m.playerAGamerTag} — Declared: ${display.text}`}
                            </span>
                          );
                        })()}
                      </div>
                    </div>
                  </div>

                  {/* Player 2 Box */}
                  <div className="p-4 rounded-2xl bg-[#15151b] border border-slate-800">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-mono uppercase text-blue-400 font-bold">Player 2</span>
                      <span className="text-xs font-mono font-bold text-white font-display text-sm">
                        {m.playerBGamerTag}
                      </span>
                    </div>
                    <div className="p-3.5 rounded-xl bg-[#0a0a0f] border border-slate-800 text-xs">
                      <div className="text-slate-400 font-mono text-[11px]">Declaration Status:</div>
                      <div className="font-bold text-white text-sm mt-0.5 font-display font-mono">
                        {(() => {
                          const decl = getPlayerDeclarationValue(m, m.playerBId, 'teamB');
                          const display = formatDeclarationDisplay(decl, { teamSide: 'teamB', is5v5: false });
                          return (
                            <span className={display.badgeClass}>
                              {display.text === 'Not declared'
                                ? `${m.playerBGamerTag} — Not declared`
                                : `${m.playerBGamerTag} — Declared: ${display.text}`}
                            </span>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Admin Action Buttons */}
              <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800">
                <span className="text-xs font-mono text-slate-400">
                  {isAdmin ? 'Select Official Staff Ruling:' : 'Dispute Status:'}
                </span>

                {isAdmin ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => handleOpenResolveModal(m, 'playerA')}
                      className="px-4 py-2.5 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-black font-black text-xs uppercase tracking-wider transition-all shadow-md active:scale-95"
                    >
                      {m.matchType === '5v5'
                        ? `${m.teamAName || 'TEAM A'} WON`
                        : `Confirm ${m.playerAGamerTag} as Winner`}
                    </button>

                    <button
                      onClick={() => handleOpenResolveModal(m, 'playerB')}
                      className="px-4 py-2.5 rounded-xl bg-blue-500 hover:bg-blue-400 text-white font-bold text-xs uppercase tracking-wider transition-all shadow-md active:scale-95"
                    >
                      {m.matchType === '5v5'
                        ? `${m.teamBName || 'TEAM B'} WON`
                        : `Confirm ${m.playerBGamerTag} as Winner`}
                    </button>

                    <button
                      onClick={() => handleOpenResolveModal(m, 'draw')}
                      className="px-4 py-2.5 rounded-xl bg-yellow-500 hover:bg-yellow-400 text-black font-bold text-xs uppercase tracking-wider transition-all shadow-md active:scale-95"
                    >
                      {m.matchType === '5v5' ? 'DRAW' : 'Confirm Draw'}
                    </button>

                    <button
                      onClick={() => setForceEndMatch(m)}
                      className="px-4 py-2.5 rounded-xl bg-red-600/20 hover:bg-red-600 text-red-300 hover:text-white border border-red-500/40 font-mono font-bold text-xs uppercase tracking-wider transition-all shadow-sm active:scale-95"
                    >
                      {m.matchType === '5v5' ? '🛑 Override / Cancel' : 'Cancel Match'}
                    </button>
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-mono font-bold">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                    <span>Awaiting Administrator Official Ruling</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Full Admin Force End / Match Override Modal */}
      {forceEndMatch && (
        <AdminForceEndModal
          match={forceEndMatch}
          onClose={() => setForceEndMatch(null)}
          onSuccess={() => setForceEndMatch(null)}
        />
      )}

      {/* Confirmation & Note Modal */}
      {selectedMatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
          <div className="relative w-full max-w-lg bg-[#0a0a0f] border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-xl font-bold font-display text-white">Confirm Official Referee Decision</h3>
                <p className="text-xs text-slate-400 font-mono">{selectedMatch.gameName} ({selectedMatch.station})</p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-[#15151b] border border-slate-800 text-xs space-y-2">
              <div className="text-slate-400 font-mono">Ruling To Apply:</div>
              <div className="text-base font-bold font-display text-cyan-400">
                {outcome === 'playerA'
                  ? selectedMatch.matchType === '5v5'
                    ? `${selectedMatch.teamAName || 'Team A'} is declared the WINNER (5 players)`
                    : `${selectedMatch.playerAGamerTag} is declared the WINNER`
                  : outcome === 'playerB'
                  ? selectedMatch.matchType === '5v5'
                    ? `${selectedMatch.teamBName || 'Team B'} is declared the WINNER (5 players)`
                    : `${selectedMatch.playerBGamerTag} is declared the WINNER`
                  : 'Match is declared a DRAW'}
              </div>
              <p className="text-slate-400 mt-1">
                This will immediately compute new MMR ratings for all competitors and mark the match CONFIRMED. Player declarations and votes will be preserved in the audit log.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5 font-mono">
                Staff Note / Evidence
              </label>
              <textarea
                rows={3}
                value={adminNote}
                onChange={(e) => setAdminNote(e.target.value)}
                placeholder="e.g. Reviewed tournament screen replay at station PC-02. Winner verified."
                className="w-full p-3.5 bg-[#15151b] border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setSelectedMatch(null)}
                className="px-4 py-2.5 rounded-xl bg-[#15151b] hover:bg-slate-800 text-xs font-bold text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmResolution}
                disabled={isSubmitting}
                className="px-5 py-2.5 rounded-xl bg-cyan-400 hover:bg-cyan-300 disabled:bg-slate-800 text-black font-black text-xs uppercase tracking-wider transition-all shadow-[0_0_15px_rgba(34,211,238,0.3)]"
              >
                {isSubmitting ? 'Recording Decision...' : 'Confirm Decision & Update MMR'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
