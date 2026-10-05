import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { adminForceEndMatch } from '../services/matchService';
import { Match } from '../types';
import { useToast } from './Toast';
import {
  getPlayerDeclarationValue,
  formatDeclarationDisplay,
  get5v5TeamPlayersList,
} from '../utils/declarationHelpers';
import {
  ShieldAlert,
  AlertTriangle,
  Trophy,
  XCircle,
  Clock,
  Swords,
  CheckCircle2,
  Lock,
  FileText,
  AlertOctagon,
} from 'lucide-react';

interface AdminForceEndModalProps {
  match: Match;
  onClose: () => void;
  onSuccess?: () => void;
}

type ForceEndDecision = 'PLAYER_A_WON' | 'PLAYER_B_WON' | 'DRAW' | 'CANCEL_MATCH';

const REASON_PRESETS = [
  'Admin verified result.',
  'Players gave conflicting results.',
  'Player did not submit result.',
  'Match was stuck.',
  'Technical problem.',
];

export const AdminForceEndModal: React.FC<AdminForceEndModalProps> = ({
  match,
  onClose,
  onSuccess,
}) => {
  const { user, playerProfile, isAdmin, isStaff, isSuperAdmin, role } = useAuth();
  const isAuthorized = isAdmin || isStaff || isSuperAdmin;
  const { showToast } = useToast();

  const [decision, setDecision] = useState<ForceEndDecision>('PLAYER_A_WON');
  const [officialHours, setOfficialHours] = useState<string>(
    match.officialHours ? String(match.officialHours) : '1.0'
  );
  const [reason, setReason] = useState<string>('Admin verified result.');
  const [customReason, setCustomReason] = useState<string>('');
  const [useCustomReason, setUseCustomReason] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  if (!isAuthorized) {
    return null;
  }

  const finalReason = useCustomReason ? customReason.trim() : reason;

  const handleConfirm = async () => {
    if (!user) {
      showToast('error', 'Authentication Required', 'Please log in as staff or administrator.');
      return;
    }

    if (!finalReason) {
      showToast('error', 'Reason Required', 'Please select or enter a reason for ending this match manually.');
      return;
    }

    const selectedWinnerId = decision === 'PLAYER_A_WON'
      ? (match.matchType === '5v5' ? (match.teamAId || 'TEAM_A') : match.playerAId)
      : decision === 'PLAYER_B_WON'
      ? (match.matchType === '5v5' ? (match.teamBId || 'TEAM_B') : match.playerBId)
      : null;

    console.log('WINNER DECLARATION CLICKED', {
      matchId: match.id,
      'currentUser.uid': user.uid,
      'currentUser.role': role || playerProfile?.role,
      selectedWinnerId,
      'match.status': match.status,
      'match.game': match.gameName || match.gameId,
      'match.type': match.matchType || (match.is5v5 ? '5v5' : '1v1'),
    });

    const parsedHours = parseFloat(officialHours);
    if (match.matchType === '5v5' && decision !== 'CANCEL_MATCH') {
      if (isNaN(parsedHours) || !isFinite(parsedHours) || parsedHours <= 0) {
        showToast('error', 'Invalid Official Hours', 'Official hours played must be a valid positive number greater than 0.');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const res = await adminForceEndMatch({
        matchId: match.id,
        adminId: user.uid,
        adminName: playerProfile?.gamerTag || playerProfile?.fullName || 'Nexus Admin',
        decision,
        reason: finalReason,
        officialHours: match.matchType === '5v5' && decision !== 'CANCEL_MATCH' ? parsedHours : undefined,
      });

      if (res.success) {
        if (decision === 'CANCEL_MATCH') {
          showToast('info', 'Match Cancelled', 'Match was cancelled by administrator with no MMR changes.');
        } else {
          showToast('success', 'Match Force-Ended', 'Match confirmed and ratings processed atomically.');
        }
        if (onSuccess) onSuccess();
        onClose();
      } else {
        showToast('error', 'Action Failed', res.error || 'Failed to force end match.');
      }
    } catch (err: any) {
      showToast('error', 'Error', err.message || 'An unexpected error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getDeclarationDisplay = (decl?: string | null, gamerTag?: string) => {
    if (!decl) return <span className="text-slate-500 italic">Not submitted</span>;
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

  const isConflicted =
    match.status === 'DISPUTED' ||
    match.disputeReason === '5V5_VOTES_CONFLICT' ||
    (match.playerADeclaration && match.playerBDeclaration &&
     ((match.playerADeclaration === 'WIN' && match.playerBDeclaration === 'WIN') ||
      (match.playerADeclaration === 'LOSS' && match.playerBDeclaration === 'LOSS') ||
      (match.playerADeclaration === 'DRAW' && match.playerBDeclaration !== 'DRAW') ||
      (match.playerBDeclaration === 'DRAW' && match.playerADeclaration !== 'DRAW')));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-xl bg-[#0a0a0f] border border-red-500/40 rounded-3xl p-6 sm:p-8 shadow-[0_0_50px_rgba(239,68,68,0.15)] space-y-6 my-8">
        
        {/* Modal Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400 shrink-0 shadow-[0_0_15px_rgba(239,68,68,0.2)]">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-red-500/20 text-red-300 text-[10px] font-mono font-bold uppercase mb-1">
                <AlertOctagon className="w-3 h-3" />
                <span>Admin Match Override</span>
              </div>
              <h3 className="text-xl font-black font-display text-white">
                End this match manually?
              </h3>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors"
          >
            <XCircle className="w-6 h-6" />
          </button>
        </div>

        {/* Match Context Details Box */}
        <div className="p-4 rounded-2xl bg-[#121218] border border-slate-800 space-y-3 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
            <div className="flex items-center gap-2">
              <span className="font-bold text-white font-display text-sm">{match.gameName}</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                {match.matchType === '5v5' ? '5v5 TEAM' : '1v1 DUEL'}
              </span>
              <span className="text-slate-400 font-mono">({match.station})</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-400 font-mono">Status:</span>
              <span className="px-2.5 py-0.5 rounded-md text-[11px] font-mono font-bold bg-slate-800 text-cyan-300 border border-slate-700">
                {match.status}
              </span>
            </div>
          </div>

          {/* Player / Team Declarations comparison */}
          {match.matchType === '5v5' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div className="p-3 rounded-xl bg-[#0a0a0f] border border-cyan-500/30">
                <div className="text-[11px] font-mono text-cyan-400 uppercase font-bold flex items-center justify-between">
                  <span>{match.teamAName || 'Team A'} (5v5)</span>
                  <span className="text-[10px] text-slate-400">Avg MMR: {match.teamAAvgRating || 1000}</span>
                </div>
                <div className="mt-2 space-y-1">
                  {get5v5TeamPlayersList(match, 'teamA').map((p, idx) => {
                    const decl = getPlayerDeclarationValue(match, p.id, 'teamA');
                    const display = formatDeclarationDisplay(decl, {
                      teamSide: 'teamA',
                      teamAName: match.teamAName,
                      teamBName: match.teamBName,
                      is5v5: true,
                    });
                    return (
                      <div key={p.id || idx} className="flex items-center justify-between text-[11px] font-mono">
                        <span className="text-white font-mono">
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

              <div className="p-3 rounded-xl bg-[#0a0a0f] border border-blue-500/30">
                <div className="text-[11px] font-mono text-blue-400 uppercase font-bold flex items-center justify-between">
                  <span>{match.teamBName || 'Team B'} (5v5)</span>
                  <span className="text-[10px] text-slate-400">Avg MMR: {match.teamBAvgRating || 1000}</span>
                </div>
                <div className="mt-2 space-y-1">
                  {get5v5TeamPlayersList(match, 'teamB').map((p, idx) => {
                    const decl = getPlayerDeclarationValue(match, p.id, 'teamB');
                    const display = formatDeclarationDisplay(decl, {
                      teamSide: 'teamB',
                      teamAName: match.teamAName,
                      teamBName: match.teamBName,
                      is5v5: true,
                    });
                    return (
                      <div key={p.id || idx} className="flex items-center justify-between text-[11px] font-mono">
                        <span className="text-white font-mono">
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
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="p-3 rounded-xl bg-[#0a0a0f] border border-slate-800">
                <div className="text-[11px] font-mono text-cyan-400 uppercase font-bold">Player 1</div>
                <div className="font-bold text-white text-sm mt-0.5 truncate font-display">
                  {match.playerAGamerTag}
                </div>
                <div className="text-[11px] font-mono mt-1.5 flex items-center justify-between">
                  <span className="text-slate-400">Declaration:</span>
                  {(() => {
                    const decl = getPlayerDeclarationValue(match, match.playerAId, 'teamA');
                    const display = formatDeclarationDisplay(decl, { teamSide: 'teamA', is5v5: false });
                    return <span className={`font-mono font-bold ${display.badgeClass}`}>{display.text}</span>;
                  })()}
                </div>
                {match.playerARatingBefore && (
                  <div className="text-[10px] font-mono text-slate-500 mt-1">
                    MMR: {match.playerARatingBefore}
                  </div>
                )}
              </div>

              <div className="p-3 rounded-xl bg-[#0a0a0f] border border-slate-800">
                <div className="text-[11px] font-mono text-blue-400 uppercase font-bold">Player 2</div>
                <div className="font-bold text-white text-sm mt-0.5 truncate font-display">
                  {match.playerBGamerTag}
                </div>
                <div className="text-[11px] font-mono mt-1.5 flex items-center justify-between">
                  <span className="text-slate-400">Declaration:</span>
                  {(() => {
                    const decl = getPlayerDeclarationValue(match, match.playerBId, 'teamB');
                    const display = formatDeclarationDisplay(decl, { teamSide: 'teamB', is5v5: false });
                    return <span className={`font-mono font-bold ${display.badgeClass}`}>{display.text}</span>;
                  })()}
                </div>
                {match.playerBRatingBefore && (
                  <div className="text-[10px] font-mono text-slate-500 mt-1">
                    MMR: {match.playerBRatingBefore}
                  </div>
                )}
              </div>
            </div>
          )}

          {isConflicted && (
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
              <span>Conflicting or contested declarations detected. Admin ruling will override.</span>
            </div>
          )}
        </div>

        {/* Options Selection */}
        <div className="space-y-2">
          <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider font-mono">
            Select Official Admin Ruling:
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {/* Option 1: Player A / Team A Won */}
            <button
              type="button"
              onClick={() => setDecision('PLAYER_A_WON')}
              className={`p-3.5 rounded-2xl border text-left transition-all flex items-center justify-between gap-2 ${
                decision === 'PLAYER_A_WON'
                  ? 'bg-cyan-500/15 border-cyan-400 text-white shadow-[0_0_15px_rgba(34,211,238,0.2)]'
                  : 'bg-[#121218] border-slate-800 text-slate-300 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center gap-2.5 truncate">
                <Trophy className={`w-5 h-5 shrink-0 ${decision === 'PLAYER_A_WON' ? 'text-cyan-400' : 'text-slate-500'}`} />
                <div className="truncate">
                  <div className="text-xs font-bold font-display uppercase tracking-wide">
                    {match.matchType === '5v5'
                      ? `🏆 ${match.teamAName || 'TEAM A'} WON`
                      : `Confirm ${match.playerAGamerTag} as Winner`}
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                    {match.matchType === '5v5' ? 'Team A Victory (5 players)' : `${match.playerAGamerTag} Victory • Ratings Adjusted`}
                  </div>
                </div>
              </div>
              <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                decision === 'PLAYER_A_WON' ? 'border-cyan-400 bg-cyan-400' : 'border-slate-600'
              }`}>
                {decision === 'PLAYER_A_WON' && <div className="w-1.5 h-1.5 rounded-full bg-black" />}
              </div>
            </button>

            {/* Option 2: Player B / Team B Won */}
            <button
              type="button"
              onClick={() => setDecision('PLAYER_B_WON')}
              className={`p-3.5 rounded-2xl border text-left transition-all flex items-center justify-between gap-2 ${
                decision === 'PLAYER_B_WON'
                  ? 'bg-blue-500/15 border-blue-400 text-white shadow-[0_0_15px_rgba(59,130,246,0.2)]'
                  : 'bg-[#121218] border-slate-800 text-slate-300 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center gap-2.5 truncate">
                <Trophy className={`w-5 h-5 shrink-0 ${decision === 'PLAYER_B_WON' ? 'text-blue-400' : 'text-slate-500'}`} />
                <div className="truncate">
                  <div className="text-xs font-bold font-display uppercase tracking-wide">
                    {match.matchType === '5v5'
                      ? `🏆 ${match.teamBName || 'TEAM B'} WON`
                      : `Confirm ${match.playerBGamerTag} as Winner`}
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                    {match.matchType === '5v5' ? 'Team B Victory (5 players)' : `${match.playerBGamerTag} Victory • Ratings Adjusted`}
                  </div>
                </div>
              </div>
              <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                decision === 'PLAYER_B_WON' ? 'border-blue-400 bg-blue-400' : 'border-slate-600'
              }`}>
                {decision === 'PLAYER_B_WON' && <div className="w-1.5 h-1.5 rounded-full bg-black" />}
              </div>
            </button>

            {/* Option 3: Draw */}
            <button
              type="button"
              onClick={() => setDecision('DRAW')}
              className={`p-3.5 rounded-2xl border text-left transition-all flex items-center justify-between gap-2 ${
                decision === 'DRAW'
                  ? 'bg-yellow-500/15 border-yellow-400 text-white shadow-[0_0_15px_rgba(234,179,8,0.2)]'
                  : 'bg-[#121218] border-slate-800 text-slate-300 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center gap-2.5 truncate">
                <Swords className={`w-5 h-5 shrink-0 ${decision === 'DRAW' ? 'text-yellow-400' : 'text-slate-500'}`} />
                <div className="truncate">
                  <div className="text-xs font-bold font-display uppercase tracking-wide">
                    {match.matchType === '5v5' ? '🤝 DRAW' : 'Confirm Draw'}
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                    0.5 Score • Streak Reset
                  </div>
                </div>
              </div>
              <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                decision === 'DRAW' ? 'border-yellow-400 bg-yellow-400' : 'border-slate-600'
              }`}>
                {decision === 'DRAW' && <div className="w-1.5 h-1.5 rounded-full bg-black" />}
              </div>
            </button>

            {/* Option 4: Cancel Match */}
            <button
              type="button"
              onClick={() => setDecision('CANCEL_MATCH')}
              className={`p-3.5 rounded-2xl border text-left transition-all flex items-center justify-between gap-2 ${
                decision === 'CANCEL_MATCH'
                  ? 'bg-rose-500/15 border-rose-500 text-white shadow-[0_0_15px_rgba(244,63,94,0.2)]'
                  : 'bg-[#121218] border-slate-800 text-slate-300 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center gap-2.5 truncate">
                <XCircle className={`w-5 h-5 shrink-0 ${decision === 'CANCEL_MATCH' ? 'text-rose-400' : 'text-slate-500'}`} />
                <div className="truncate">
                  <div className="text-xs font-bold font-display uppercase tracking-wide">
                    Cancel Match
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                    Void Match • Zero MMR change
                  </div>
                </div>
              </div>
              <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                decision === 'CANCEL_MATCH' ? 'border-rose-500 bg-rose-500' : 'border-slate-600'
              }`}>
                {decision === 'CANCEL_MATCH' && <div className="w-1.5 h-1.5 rounded-full bg-black" />}
              </div>
            </button>
          </div>
        </div>

        {/* 5v5 Squad Official Hours & LIVE Reward Preview */}
        {match.matchType === '5v5' && decision !== 'CANCEL_MATCH' && (() => {
          const parsedHours = parseFloat(officialHours);
          const isHoursValid = !isNaN(parsedHours) && isFinite(parsedHours) && parsedHours > 0;
          const countA = Math.max(1, get5v5TeamPlayersList(match, 'teamA').length);
          const countB = Math.max(1, get5v5TeamPlayersList(match, 'teamB').length);

          let perPlayerA = 0;
          let perPlayerB = 0;
          if (isHoursValid) {
            if (decision === 'PLAYER_A_WON') {
              perPlayerA = Math.round(90 * parsedHours * 100) / 100;
              perPlayerB = Math.round(30 * parsedHours * 100) / 100;
            } else if (decision === 'PLAYER_B_WON') {
              perPlayerA = Math.round(30 * parsedHours * 100) / 100;
              perPlayerB = Math.round(90 * parsedHours * 100) / 100;
            } else {
              perPlayerA = Math.round(45 * parsedHours * 100) / 100;
              perPlayerB = Math.round(45 * parsedHours * 100) / 100;
            }
          }
          const totalA = Math.round(perPlayerA * countA * 100) / 100;
          const totalB = Math.round(perPlayerB * countB * 100) / 100;

          return (
            <div className="p-4 rounded-2xl bg-[#121218] border border-purple-500/30 space-y-3">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="font-bold text-purple-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-purple-400" />
                  <span>Official Hours & Reward Preview:</span>
                </span>
                <span className="text-slate-400 text-[10px]">
                  Admin Controlled
                </span>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    max="24"
                    value={officialHours}
                    onChange={(e) => setOfficialHours(e.target.value)}
                    disabled={isSubmitting}
                    placeholder="0.0"
                    className="w-full px-3.5 py-2 rounded-xl bg-[#0a0a0f] border border-slate-700 text-white font-mono text-xs focus:border-purple-400"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono text-slate-400 pointer-events-none">
                    hours
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0 overflow-x-auto">
                  {[1, 1.5, 2, 2.5, 3].map((h) => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => setOfficialHours(String(h))}
                      className={`px-2 py-1.5 rounded-lg text-xs font-mono font-bold ${
                        parseFloat(officialHours) === h
                          ? 'bg-purple-600 text-white'
                          : 'bg-[#0a0a0f] border border-slate-800 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      {h}h
                    </button>
                  ))}
                </div>
              </div>

              {!isHoursValid && (
                <p className="text-[11px] font-mono text-rose-400">
                  ⚠️ Official hours must be a valid number greater than 0.
                </p>
              )}

              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <div className={`p-2.5 rounded-xl border ${
                  decision === 'PLAYER_A_WON' ? 'bg-cyan-950/20 border-cyan-500/30' : 'bg-[#0a0a0f] border-slate-800'
                }`}>
                  <div className="flex items-center justify-between text-[11px] font-bold">
                    <span className="text-cyan-400 truncate">{match.teamAName || 'Team A'}</span>
                    <span className="text-slate-400 text-[10px]">
                      {decision === 'PLAYER_A_WON' ? 'WIN (+90/h)' : decision === 'DRAW' ? 'DRAW (+45/h)' : 'LOSS (+30/h)'}
                    </span>
                  </div>
                  <div className="text-white font-black text-sm mt-1">+{perPlayerA} NC <span className="text-[10px] text-slate-400 font-normal">/ player</span></div>
                  <div className="text-[10px] text-purple-300 mt-0.5">{totalA.toLocaleString()} NC team total</div>
                </div>

                <div className={`p-2.5 rounded-xl border ${
                  decision === 'PLAYER_B_WON' ? 'bg-rose-950/20 border-rose-500/30' : 'bg-[#0a0a0f] border-slate-800'
                }`}>
                  <div className="flex items-center justify-between text-[11px] font-bold">
                    <span className="text-rose-400 truncate">{match.teamBName || 'Team B'}</span>
                    <span className="text-slate-400 text-[10px]">
                      {decision === 'PLAYER_B_WON' ? 'WIN (+90/h)' : decision === 'DRAW' ? 'DRAW (+45/h)' : 'LOSS (+30/h)'}
                    </span>
                  </div>
                  <div className="text-white font-black text-sm mt-1">+{perPlayerB} NC <span className="text-[10px] text-slate-400 font-normal">/ player</span></div>
                  <div className="text-[10px] text-purple-300 mt-0.5">{totalB.toLocaleString()} NC team total</div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Reason Requirement */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono">
              Intervention Reason (Required):
            </label>
            <button
              type="button"
              onClick={() => setUseCustomReason(!useCustomReason)}
              className="text-[11px] text-cyan-400 hover:underline font-mono"
            >
              {useCustomReason ? 'Choose Preset' : 'Custom Reason'}
            </button>
          </div>

          {!useCustomReason ? (
            <div className="flex flex-wrap gap-2">
              {REASON_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setReason(preset)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                    reason === preset
                      ? 'bg-red-500/20 text-red-200 border border-red-500/50 font-bold'
                      : 'bg-[#121218] text-slate-400 border border-slate-800 hover:text-slate-200'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
          ) : (
            <textarea
              rows={2}
              value={customReason}
              onChange={(e) => setCustomReason(e.target.value)}
              placeholder="Provide a detailed explanation for this manual override..."
              className="w-full p-3 bg-[#121218] border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-red-400 font-mono"
            />
          )}
        </div>

        {/* Impact Warning Notice */}
        <div className="p-3.5 rounded-2xl bg-red-950/20 border border-red-500/20 text-xs text-slate-300 space-y-1">
          <div className="font-bold text-red-400 flex items-center gap-1.5 font-mono uppercase text-[11px]">
            <Lock className="w-3.5 h-3.5" />
            <span>Audit & Double MMR Protection Active</span>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            {decision === 'CANCEL_MATCH'
              ? 'This match will be marked as CANCELLED. No stats, streaks, or MMR will be altered.'
              : 'Original competitor votes will be archived for audit. Official winner and MMR will be permanently updated under your staff account.'}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 uppercase tracking-wider transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isSubmitting || !finalReason}
            className="px-6 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-black text-xs uppercase tracking-wider transition-all shadow-[0_0_20px_rgba(239,68,68,0.35)] flex items-center gap-2"
          >
            {isSubmitting ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Applying Ruling...</span>
              </>
            ) : (
              <>
                <span>🛑 Confirm Force End</span>
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
};
