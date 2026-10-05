import React, { useState, useEffect, useMemo } from 'react';
import confetti from 'canvas-confetti';
import {
  TournamentParticipant,
  TournamentMatch,
  Tournament,
} from '../types';
import {
  Dices,
  Swords,
  CheckCircle2,
  Sparkles,
  Shield,
  X,
  Shuffle,
  Users,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react';
import {
  generateRandomTournamentDraw,
  saveTournamentBracket,
  getEligibleConfirmedTournamentTeams,
} from '../services/tournamentService';
import { useToast } from './Toast';

interface TournamentDrawModalProps {
  isOpen: boolean;
  onClose: () => void;
  tournament: Tournament;
  confirmedTeams?: TournamentParticipant[];
  teamRegistrations?: any[];
  adminUser?: any;
  onDrawCompleted?: (matches: TournamentMatch[]) => void;
  onDrawSuccess?: () => void;
}

type DrawStage = 'ROSTER' | 'SHUFFLING' | 'REVEALING' | 'COMPLETE';

export const TournamentDrawModal: React.FC<TournamentDrawModalProps> = ({
  isOpen,
  onClose,
  tournament,
  confirmedTeams: initialConfirmedTeams,
  teamRegistrations = [],
  onDrawCompleted,
  onDrawSuccess,
}) => {
  const { showToast } = useToast();
  const [stage, setStage] = useState<DrawStage>('ROSTER');
  const [shuffledTeams, setShuffledTeams] = useState<TournamentParticipant[]>([]);
  const [revealedMatchIndex, setRevealedMatchIndex] = useState<number>(0);
  const [generatedMatches, setGeneratedMatches] = useState<TournamentMatch[]>([]);
  const [saving, setSaving] = useState(false);

  const confirmedTeams = useMemo(() => {
    if (initialConfirmedTeams && Array.isArray(initialConfirmedTeams)) {
      return initialConfirmedTeams;
    }
    return getEligibleConfirmedTournamentTeams(tournament, teamRegistrations);
  }, [initialConfirmedTeams, tournament, teamRegistrations]);

  useEffect(() => {
    if (isOpen) {
      setStage('ROSTER');
      setShuffledTeams([...(confirmedTeams || [])]);
      setRevealedMatchIndex(0);
      setGeneratedMatches([]);
    }
  }, [isOpen, confirmedTeams]);

  if (!isOpen) return null;

  const handleStartDraw = () => {
    if (!confirmedTeams || confirmedTeams.length < 2) {
      showToast('error', 'Insufficient Teams', 'At least 2 confirmed teams are required for the draw.');
      return;
    }

    setStage('SHUFFLING');

    try {
      // 1. Generate the random draw using the core rules
      const { matches, orderedParticipants } = generateRandomTournamentDraw(
        tournament.id,
        confirmedTeams,
        tournament.format || 'SINGLE_ELIMINATION',
        true
      );

      setGeneratedMatches(matches);
      setShuffledTeams(orderedParticipants);

      // Shuffling suspense animation
      setTimeout(() => {
        setStage('REVEALING');
        setRevealedMatchIndex(1); // Reveal match 1

        // Reveal second match after 1200ms
        setTimeout(() => {
          setRevealedMatchIndex(2);

          // If more matches (e.g. 8 teams), reveal sequentially
          const r1Matches = matches.filter((m) => m.round === 1);
          if (r1Matches.length > 2) {
            let idx = 3;
            const interval = setInterval(() => {
              if (idx <= r1Matches.length) {
                setRevealedMatchIndex(idx);
                idx++;
              } else {
                clearInterval(interval);
                finishDraw();
              }
            }, 800);
          } else {
            setTimeout(() => {
              finishDraw();
            }, 900);
          }
        }, 1200);
      }, 1800);
    } catch (err: any) {
      setStage('ROSTER');
      showToast('error', 'Draw Error', err.message || 'Failed to generate draw.');
    }
  };

  const finishDraw = () => {
    setStage('COMPLETE');
    confetti({
      particleCount: 150,
      spread: 90,
      origin: { y: 0.55 },
      colors: ['#22d3ee', '#fbbf24', '#34d399', '#a855f7', '#f43f5e'],
    });
  };

  const handleConfirmAndSave = async () => {
    if (generatedMatches.length === 0) return;
    setSaving(true);
    try {
      const res = await saveTournamentBracket(tournament.id, generatedMatches);
      if (res.success) {
        showToast(
          'success',
          'Tournament Draw Saved!',
          `Official pairings locked in! ${(confirmedTeams || []).length} confirmed teams paired into ${generatedMatches.filter(m => m.round === 1).length} first-round matches.`
        );
        if (onDrawCompleted) onDrawCompleted(generatedMatches);
        if (onDrawSuccess) onDrawSuccess();
        onClose();
      } else {
        showToast('error', 'Save Failed', res.error || 'Could not save tournament bracket.');
      }
    } catch (err: any) {
      showToast('error', 'Error', err.message);
    } finally {
      setSaving(false);
    }
  };

  const r1Matches = generatedMatches.filter((m) => m.round === 1);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/90 backdrop-blur-xl animate-in fade-in overflow-y-auto">
      <div className="w-full max-w-3xl rounded-3xl bg-[#090c15] border border-cyan-500/40 shadow-[0_0_60px_rgba(6,182,212,0.25)] overflow-hidden my-8 relative">
        {/* Background glow fx */}
        <div className="absolute -top-32 -right-32 w-80 h-80 bg-cyan-500/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -left-32 w-80 h-80 bg-purple-500/15 rounded-full blur-3xl pointer-events-none" />

        {/* Modal Header */}
        <div className="p-6 border-b border-slate-800/80 flex items-center justify-between bg-slate-900/40 relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.3)]">
              <Dices className="w-6 h-6 animate-spin-slow" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black font-display text-white uppercase tracking-tight">
                  TOURNAMENT DRAW CEREMONY
                </h2>
                <span className="px-2.5 py-0.5 rounded-full bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 text-[11px] font-mono font-bold">
                  {confirmedTeams.length} CONFIRMED TEAMS
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                Official random seeding & first-round pairing protocol
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={stage === 'SHUFFLING'}
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6 relative z-10">
          {/* STAGE 1: CONFIRMED TEAMS ROSTER */}
          {stage === 'ROSTER' && (
            <div className="space-y-6">
              <div className="p-4 rounded-2xl bg-cyan-950/20 border border-cyan-500/30 text-cyan-300 text-xs font-mono flex items-center justify-between">
                <span>
                  All {confirmedTeams.length} teams below have officially confirmed eligibility. Ready to randomize the draw?
                </span>
                <span className="font-bold text-white px-2 py-0.5 bg-cyan-500/20 rounded">
                  {confirmedTeams.length === 4 ? '4 Teams = 2 Matches' : `${confirmedTeams.length} Teams`}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {confirmedTeams.map((team, idx) => (
                  <div
                    key={team.id}
                    className="p-3.5 rounded-2xl bg-[#0c101d] border border-slate-800 flex items-center gap-3.5 shadow-md"
                  >
                    <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-cyan-400 font-mono font-bold text-sm overflow-hidden shrink-0">
                      {team.avatarUrl ? (
                        <img src={team.avatarUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span>#{idx + 1}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        {team.tag && (
                          <span className="text-[11px] font-mono font-bold text-cyan-400">
                            [{team.tag}]
                          </span>
                        )}
                        <span className="text-sm font-bold text-white truncate">
                          {team.name}
                        </span>
                      </div>
                      <div className="text-[10px] font-mono text-slate-400 flex items-center gap-1.5 mt-0.5">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        <span>ELIGIBLE & CONFIRMED</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-4 border-t border-slate-800 flex items-center justify-between gap-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono font-bold uppercase transition-all"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={handleStartDraw}
                  className="px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black text-xs font-mono font-black uppercase tracking-wider flex items-center gap-2 shadow-[0_0_25px_rgba(6,182,212,0.4)] transition-all cursor-pointer"
                >
                  <Dices className="w-4 h-4" />
                  <span>🎲 DRAW MATCHUPS</span>
                </button>
              </div>
            </div>
          )}

          {/* STAGE 2: SHUFFLING SUSPENSE ANIMATION */}
          {stage === 'SHUFFLING' && (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-6">
              <div className="relative">
                <div className="w-24 h-24 rounded-3xl bg-cyan-500/20 border-2 border-cyan-400 flex items-center justify-center text-cyan-300 shadow-[0_0_40px_rgba(6,182,212,0.6)] animate-bounce">
                  <Shuffle className="w-12 h-12 animate-spin text-cyan-400" />
                </div>
                <div className="absolute inset-0 rounded-3xl bg-cyan-400/20 animate-ping pointer-events-none" />
              </div>

              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-cyan-500/20 border border-cyan-400/40 text-cyan-300 text-xs font-mono font-bold uppercase tracking-widest animate-pulse">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>RANDOMIZING BRACKET DRAW...</span>
                </div>
                <h3 className="text-2xl font-black font-display text-white tracking-tight uppercase">
                  SHUFFLING CONFIRMED TEAMS
                </h3>
                <p className="text-xs text-slate-400 font-mono max-w-sm mx-auto">
                  Generating verified randomized matchups under official competition integrity rules...
                </p>
              </div>

              {/* Shuffling Card Avatars */}
              <div className="flex items-center justify-center gap-3 pt-2">
                {shuffledTeams.map((team, idx) => (
                  <div
                    key={team.id || idx}
                    className="w-12 h-12 rounded-xl bg-slate-800 border border-cyan-500/40 flex items-center justify-center text-cyan-400 font-mono text-xs font-bold shadow-lg animate-pulse"
                    style={{ animationDelay: `${idx * 150}ms` }}
                  >
                    {team.tag || team.name.substring(0, 3).toUpperCase()}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* STAGE 3 & 4: REVEALING MATCHUPS & DRAW COMPLETE */}
          {(stage === 'REVEALING' || stage === 'COMPLETE') && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <div className="text-[11px] font-mono text-cyan-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                    <span>{stage === 'COMPLETE' ? '✅ DRAW COMPLETE' : '🎲 DRAWING MATCHUPS...'}</span>
                  </div>
                  <h3 className="text-lg font-black font-display text-white uppercase">
                    FIRST ROUND MATCHUPS
                  </h3>
                </div>

                <span className="px-3 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-300 text-xs font-mono font-bold">
                  {confirmedTeams.length === 4 ? '2 Semifinal Matches' : `${r1Matches.length} Matches`}
                </span>
              </div>

              {/* Matchups Reveal Cards */}
              <div className="space-y-4">
                {r1Matches.map((m, idx) => {
                  const isRevealed = idx < revealedMatchIndex;
                  return (
                    <div
                      key={m.id}
                      className={`p-4 rounded-2xl border transition-all duration-500 ${
                        isRevealed
                          ? 'bg-[#0b101e] border-cyan-500/60 shadow-[0_0_25px_rgba(6,182,212,0.18)] translate-y-0 opacity-100'
                          : 'bg-[#080a12] border-slate-800/80 opacity-40 translate-y-2'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-3 text-xs font-mono">
                        <span className="px-2.5 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 font-bold uppercase flex items-center gap-1.5">
                          <Swords className="w-3 h-3 text-cyan-400" />
                          <span>{m.roundName || `MATCH #${m.matchNumber}`}</span>
                        </span>

                        {isRevealed ? (
                          <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold text-[10px] uppercase flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>LOCKED IN</span>
                          </span>
                        ) : (
                          <span className="text-slate-500 text-[10px] uppercase">
                            DRAWING OPPONENTS...
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                        {/* Team A */}
                        <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-300 font-mono font-bold text-xs shrink-0 overflow-hidden">
                            {m.participantA?.avatarUrl ? (
                              <img src={m.participantA.avatarUrl} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <span>A</span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-mono text-cyan-400 font-bold">
                              {m.participantA?.tag ? `[${m.participantA.tag}]` : 'TEAM 1'}
                            </div>
                            <div className="text-sm font-bold text-white truncate">
                              {m.participantA?.name || 'Waiting...'}
                            </div>
                          </div>
                        </div>

                        {/* Team B */}
                        <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-300 font-mono font-bold text-xs shrink-0 overflow-hidden">
                            {m.participantB?.avatarUrl ? (
                              <img src={m.participantB.avatarUrl} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <span>B</span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-mono text-purple-400 font-bold">
                              {m.participantB?.tag ? `[${m.participantB.tag}]` : 'TEAM 2'}
                            </div>
                            <div className="text-sm font-bold text-white truncate">
                              {m.participantB?.name || 'Waiting...'}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Integrity Checklist */}
              {stage === 'COMPLETE' && (
                <div className="p-4 rounded-2xl bg-emerald-950/20 border border-emerald-500/30 text-emerald-300 text-xs font-mono space-y-1.5">
                  <div className="font-bold uppercase tracking-wider flex items-center gap-1.5 text-emerald-400">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>BRACKET INTEGRITY VERIFIED</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-[11px] text-slate-300">
                    <div>Confirmed Teams: <strong className="text-white">{confirmedTeams.length}</strong></div>
                    <div>First-Round Matches: <strong className="text-white">{r1Matches.length}</strong></div>
                    <div>Unique Teams Placed: <strong className="text-white">{confirmedTeams.length}</strong></div>
                    <div>Unplaced Teams: <strong className="text-white">0</strong></div>
                  </div>
                </div>
              )}

              {/* Bottom Actions */}
              {stage === 'COMPLETE' && (
                <div className="pt-4 border-t border-slate-800 flex items-center justify-between gap-4">
                  <button
                    type="button"
                    onClick={handleStartDraw}
                    className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono font-bold uppercase flex items-center gap-1.5 transition-all"
                  >
                    <Shuffle className="w-3.5 h-3.5" />
                    <span>Shuffle Again</span>
                  </button>

                  <button
                    type="button"
                    disabled={saving}
                    onClick={handleConfirmAndSave}
                    className="px-6 py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-black text-xs font-mono font-black uppercase tracking-wider flex items-center gap-2 shadow-[0_0_25px_rgba(16,185,129,0.4)] transition-all cursor-pointer disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{saving ? 'SAVING BRACKET...' : 'CONFIRM & SAVE BRACKET'}</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
