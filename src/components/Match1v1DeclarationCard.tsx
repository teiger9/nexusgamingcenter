import React from 'react';
import { Trophy, ShieldAlert, CheckCircle2, Clock, AlertTriangle, Coins, Gamepad2 } from 'lucide-react';
import { Match, Player } from '../types';
import { get1v1DeclarationSummary } from '../utils/declarationHelpers';

interface Match1v1DeclarationCardProps {
  match: Match;
  currentUser?: Player | null;
  isAdmin?: boolean;
  livePlayerProfiles?: Record<string, any>;
  onDeclareResult?: (
    outcome: 'WIN' | 'LOSS' | 'DRAW',
    seriesScore?: { gamesWon: number; gamesLost: number }
  ) => void;
  onAdminResolve?: (
    outcome: 'playerA' | 'playerB' | 'draw',
    seriesData?: {
      totalGamesPlayed?: number;
      playerAGamesWon?: number;
      playerBGamesWon?: number;
      seriesWinnerId?: string | 'draw' | null;
      ncReward?: number;
    }
  ) => void;
  onAdminCancel?: () => void;
  isSubmittingDeclaration?: boolean;
}

export const Match1v1DeclarationCard: React.FC<Match1v1DeclarationCardProps> = ({
  match,
  currentUser,
  isAdmin = false,
  livePlayerProfiles,
  onDeclareResult,
  onAdminResolve,
  onAdminCancel,
  isSubmittingDeclaration = false,
}) => {
  const summary = get1v1DeclarationSummary(match, livePlayerProfiles);
  const {
    playerAName,
    playerBName,
    playerADeclared,
    playerBDeclared,
    playerADisplayText,
    playerBDisplayText,
    bothDeclared,
    isAgreed,
    isContested,
    isFcSeries: isFcMatch,
    playerAGamesWon: fcPlayerAGamesWon,
    playerBGamesWon: fcPlayerBGamesWon,
    totalGamesPlayed: fcTotalGames,
    calculatedSeriesWinnerName: fcCalculatedWinnerName,
    calculatedNcReward: fcCalculatedReward,
    fcConflictReason,
  } = summary;

  const currentUid = currentUser?.uid;
  const isPlayerA = currentUid === match.playerAId;
  const isPlayerB = currentUid === match.playerBId;
  const isParticipant = isPlayerA || isPlayerB;

  const myDeclaration = isPlayerA
    ? playerADeclared
    : isPlayerB
    ? playerBDeclared
    : null;

  const opponentName = isPlayerA ? playerBName : playerAName;
  const opponentDeclared = isPlayerA ? playerBDeclared : playerADeclared;

  // Player series inputs for FC 26 / FC 27
  const [playerGamesWonInput, setPlayerGamesWonInput] = React.useState<number>(0);
  const [playerGamesLostInput, setPlayerGamesLostInput] = React.useState<number>(0);

  // Auto-calculated player values
  const myTotalGames = playerGamesWonInput + playerGamesLostInput;
  const myAutoDeclaration: 'WIN' | 'LOSS' | 'DRAW' =
    playerGamesWonInput > playerGamesLostInput
      ? 'WIN'
      : playerGamesWonInput < playerGamesLostInput
      ? 'LOSS'
      : 'DRAW';
  const myPotentialReward = myTotalGames * 5;

  // Admin series inputs for FC 26 / FC 27 override/refinement
  const [adminAWins, setAdminAWins] = React.useState<number>(() => {
    return fcPlayerAGamesWon ?? match.playerAGamesWon ?? match.playerASeriesScore?.gamesWon ?? 0;
  });
  const [adminBWins, setAdminBWins] = React.useState<number>(() => {
    return fcPlayerBGamesWon ?? match.playerBGamesWon ?? match.playerBSeriesScore?.gamesWon ?? 0;
  });

  const adminTotalGames = adminAWins + adminBWins;
  const adminCalculatedReward = adminTotalGames * 5;

  const handleAdminConfirmA = () => {
    const selectedWinnerId = match.playerAId;
    console.log('WINNER DECLARATION CLICKED', {
      matchId: match.id,
      'currentUser.uid': currentUser?.uid,
      'currentUser.role': currentUser?.role,
      selectedWinnerId,
      'match.status': match.status,
      'match.game': match.gameName || match.gameId,
      'match.type': match.matchType || (match.is5v5 ? '5v5' : '1v1'),
    });

    if (isFcMatch) {
      onAdminResolve?.('playerA', {
        totalGamesPlayed: adminTotalGames,
        playerAGamesWon: adminAWins,
        playerBGamesWon: adminBWins,
        seriesWinnerId: match.playerAId,
        ncReward: adminCalculatedReward,
      });
    } else {
      onAdminResolve?.('playerA');
    }
  };

  const handleAdminConfirmB = () => {
    const selectedWinnerId = match.playerBId;
    console.log('WINNER DECLARATION CLICKED', {
      matchId: match.id,
      'currentUser.uid': currentUser?.uid,
      'currentUser.role': currentUser?.role,
      selectedWinnerId,
      'match.status': match.status,
      'match.game': match.gameName || match.gameId,
      'match.type': match.matchType || (match.is5v5 ? '5v5' : '1v1'),
    });

    if (isFcMatch) {
      onAdminResolve?.('playerB', {
        totalGamesPlayed: adminTotalGames,
        playerAGamesWon: adminAWins,
        playerBGamesWon: adminBWins,
        seriesWinnerId: match.playerBId,
        ncReward: adminCalculatedReward,
      });
    } else {
      onAdminResolve?.('playerB');
    }
  };

  const handleAdminConfirmDraw = () => {
    const selectedWinnerId = null;
    console.log('WINNER DECLARATION CLICKED', {
      matchId: match.id,
      'currentUser.uid': currentUser?.uid,
      'currentUser.role': currentUser?.role,
      selectedWinnerId,
      'match.status': match.status,
      'match.game': match.gameName || match.gameId,
      'match.type': match.matchType || (match.is5v5 ? '5v5' : '1v1'),
    });

    if (isFcMatch) {
      onAdminResolve?.('draw', {
        totalGamesPlayed: adminTotalGames,
        playerAGamesWon: adminAWins,
        playerBGamesWon: adminBWins,
        seriesWinnerId: 'draw',
        ncReward: adminCalculatedReward / 2,
      });
    } else {
      onAdminResolve?.('draw');
    }
  };

  const isConflict = isContested || match.status === 'DISPUTED';

  // Human-readable outcome text for current viewer
  const getHumanOutcomeText = () => {
    if (isConflict) return 'RESULT UNDER REVIEW';
    if (match.status === 'CONFIRMED' || isAgreed) {
      if (isParticipant) {
        if (myDeclaration === 'WON') return 'YOU WON';
        if (myDeclaration === 'LOST') return 'YOU LOST';
        if (myDeclaration === 'DRAW') return 'DRAW';
      }
      if (match.winnerId === 'draw') return 'DRAW';
      if (match.winnerId === match.playerAId) return `${playerAName} WON`;
      if (match.winnerId === match.playerBId) return `${playerBName} WON`;
      return 'RESULT CONFIRMED';
    }
    if (myDeclaration) return 'SUBMITTED · WAITING FOR OPPONENT';
    return 'WAITING FOR RESULTS';
  };

  return (
    <div
      id="match-1v1-declaration-section"
      className="p-6 rounded-2xl bg-neutral-950 border border-white/10 shadow-xl space-y-6"
    >
      {/* Header: YOU vs OPPONENT */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-red-500">
            {match.gameName} · {match.station}
          </span>
          <div className="flex items-center gap-3 mt-1">
            <h3 className="text-xl sm:text-2xl font-black font-display text-white uppercase tracking-tight">
              {isParticipant ? (
                <>
                  <span>YOU</span>
                  <span className="text-neutral-500 mx-2 font-normal lowercase text-base">vs</span>
                  <span className="text-neutral-200">{opponentName}</span>
                </>
              ) : (
                <>
                  <span>{playerAName}</span>
                  <span className="text-neutral-500 mx-2 font-normal lowercase text-base">vs</span>
                  <span className="text-neutral-200">{playerBName}</span>
                </>
              )}
            </h3>
          </div>
        </div>

        {/* Status Callout */}
        <div className="shrink-0">
          {isConflict ? (
            <div
              id="result-contested-badge"
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-600/20 border border-red-500 text-red-400 font-mono text-xs font-black"
            >
              <AlertTriangle className="w-4 h-4 shrink-0 text-red-500" />
              <span>⚠ RESULT UNDER REVIEW</span>
            </div>
          ) : match.status === 'CONFIRMED' || isAgreed ? (
            <div
              id="result-agreed-badge"
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-neutral-900 border border-white/20 text-white font-mono text-xs font-black"
            >
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>{getHumanOutcomeText()}</span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-neutral-900 border border-white/10 text-neutral-400 font-mono text-xs">
              <Clock className="w-4 h-4 text-neutral-500" />
              <span>{myDeclaration ? 'Awaiting Opponent' : 'Awaiting Declaration'}</span>
            </div>
          )}
        </div>
      </div>

      {/* Contested / Disputed Warning Alert */}
      {isConflict && (
        <div
          id="result-contested-alert"
          className="p-4 rounded-xl bg-red-950/20 border border-red-600/40 flex items-start gap-3 text-xs text-neutral-300"
        >
          <ShieldAlert className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-bold text-white text-sm">
              ⚠ Result Under Review
            </div>
            <p className="text-neutral-400 leading-relaxed font-mono">
              {fcConflictReason ||
                'The match result declarations do not match. A staff member will verify the station and approve the final score.'}
            </p>
          </div>
        </div>
      )}

      {/* Declarations Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Box A: YOU (or Player A) */}
        <div
          id="declaration-box-playerA"
          className="p-4 rounded-xl bg-neutral-900 border border-white/10 space-y-2"
        >
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="font-bold text-white uppercase">
              {isPlayerA ? 'YOU' : playerAName}
            </span>
            <span
              className={`font-bold px-2 py-0.5 rounded text-[11px] ${
                playerADeclared === 'WON'
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : playerADeclared === 'LOST'
                  ? 'bg-neutral-800 text-neutral-400'
                  : playerADeclared === 'DRAW'
                  ? 'bg-neutral-800 text-neutral-300'
                  : 'text-neutral-500'
              }`}
            >
              {playerADeclared ? (playerADeclared === 'WON' ? 'YOU WON' : playerADeclared === 'LOST' ? 'YOU LOST' : 'DRAW') : 'Not submitted'}
            </span>
          </div>

          {isFcMatch && match.playerASeriesScore && (
            <div className="text-xs font-mono text-neutral-400 pt-2 border-t border-white/5 flex justify-between">
              <span>Series Score:</span>
              <strong className="text-white">
                {match.playerASeriesScore.gamesWon}W - {match.playerASeriesScore.gamesLost}L
              </strong>
            </div>
          )}
        </div>

        {/* Box B: OPPONENT (or Player B) */}
        <div
          id="declaration-box-playerB"
          className="p-4 rounded-xl bg-neutral-900 border border-white/10 space-y-2"
        >
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="font-bold text-white uppercase">
              {isPlayerB ? 'YOU' : isPlayerA ? 'OPPONENT' : playerBName}
            </span>
            <span
              className={`font-bold px-2 py-0.5 rounded text-[11px] ${
                playerBDeclared === 'WON'
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : playerBDeclared === 'LOST'
                  ? 'bg-neutral-800 text-neutral-400'
                  : playerBDeclared === 'DRAW'
                  ? 'bg-neutral-800 text-neutral-300'
                  : 'text-neutral-500'
              }`}
            >
              {playerBDeclared
                ? playerBDeclared === 'WON'
                  ? isPlayerB ? 'YOU WON' : 'OPPONENT WON'
                  : playerBDeclared === 'LOST'
                  ? isPlayerB ? 'YOU LOST' : 'OPPONENT LOST'
                  : 'DRAW'
                : 'Not submitted'}
            </span>
          </div>

          {isFcMatch && match.playerBSeriesScore && (
            <div className="text-xs font-mono text-neutral-400 pt-2 border-t border-white/5 flex justify-between">
              <span>Series Score:</span>
              <strong className="text-white">
                {match.playerBSeriesScore.gamesWon}W - {match.playerBSeriesScore.gamesLost}L
              </strong>
            </div>
          )}
        </div>
      </div>

      {/* Participant Player Submission Controls */}
      {isParticipant && match.status !== 'CONFIRMED' && match.status !== 'CANCELLED' && (
        <div className="p-4 rounded-xl bg-neutral-900 border border-white/10 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono uppercase font-bold text-neutral-400">
              Submit Your Match Result
            </span>
            {myDeclaration && (
              <span className="text-xs font-mono text-white font-bold">
                ✓ You declared: {myDeclaration === 'WON' ? 'YOU WON' : myDeclaration === 'LOST' ? 'YOU LOST' : 'DRAW'}
              </span>
            )}
          </div>

          {!myDeclaration ? (
            isFcMatch ? (
              /* FC 26 / FC 27 Series Input */
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-neutral-950 border border-white/10 space-y-1">
                    <label className="text-xs font-mono text-neutral-400 uppercase block">
                      Games You Won:
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={99}
                      value={playerGamesWonInput}
                      onChange={(e) => setPlayerGamesWonInput(Math.max(0, parseInt(e.target.value, 10) || 0))}
                      className="w-full px-3 py-2 rounded bg-neutral-900 border border-white/20 text-white font-mono text-base font-bold focus:outline-none focus:border-red-500"
                    />
                  </div>

                  <div className="p-3 rounded-lg bg-neutral-950 border border-white/10 space-y-1">
                    <label className="text-xs font-mono text-neutral-400 uppercase block">
                      Games You Lost:
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={99}
                      value={playerGamesLostInput}
                      onChange={(e) => setPlayerGamesLostInput(Math.max(0, parseInt(e.target.value, 10) || 0))}
                      className="w-full px-3 py-2 rounded bg-neutral-900 border border-white/20 text-white font-mono text-base font-bold focus:outline-none focus:border-red-500"
                    />
                  </div>
                </div>

                <button
                  id="submit-fc-series-btn"
                  disabled={isSubmittingDeclaration || myTotalGames === 0}
                  onClick={() =>
                    onDeclareResult?.(myAutoDeclaration, {
                      gamesWon: playerGamesWonInput,
                      gamesLost: playerGamesLostInput,
                    })
                  }
                  className="w-full py-3 px-4 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold text-xs uppercase tracking-wider transition-all disabled:opacity-40"
                >
                  Submit Series ({playerGamesWonInput}W - {playerGamesLostInput}L)
                </button>
              </div>
            ) : (
              /* Standard 1v1 Outcome Buttons: YOU WON / YOU LOST / DRAW */
              <div className="grid grid-cols-3 gap-2">
                <button
                  id="declare-1v1-win-btn"
                  disabled={isSubmittingDeclaration}
                  onClick={() => onDeclareResult?.('WIN')}
                  className="py-3 px-4 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold text-xs uppercase tracking-wider transition-all disabled:opacity-40"
                >
                  YOU WON
                </button>
                <button
                  id="declare-1v1-loss-btn"
                  disabled={isSubmittingDeclaration}
                  onClick={() => onDeclareResult?.('LOSS')}
                  className="py-3 px-4 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-bold text-xs uppercase tracking-wider transition-all disabled:opacity-40"
                >
                  YOU LOST
                </button>
                <button
                  id="declare-1v1-draw-btn"
                  disabled={isSubmittingDeclaration}
                  onClick={() => onDeclareResult?.('DRAW')}
                  className="py-3 px-4 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-bold text-xs uppercase tracking-wider transition-all disabled:opacity-40"
                >
                  DRAW
                </button>
              </div>
            )
          ) : (
            <div className="text-xs font-mono text-neutral-400 flex items-center justify-between">
              <span>Waiting for opponent or staff confirmation...</span>
              {isConflict && onDeclareResult && (
                <button
                  onClick={() => onDeclareResult('WIN')}
                  className="text-xs text-red-500 hover:underline"
                >
                  Update Result
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Staff / Admin Arbitration Panel */}
      {isAdmin && match.status !== 'CONFIRMED' && match.status !== 'CANCELLED' && (
        <div
          id="admin-1v1-result-controls"
          className="p-4 rounded-xl bg-neutral-900 border border-red-600/40 space-y-3"
        >
          <div className="flex items-center gap-2 text-red-500 text-xs font-mono font-bold uppercase tracking-wider">
            <ShieldAlert className="w-4 h-4" />
            <span>Staff Result Decision</span>
          </div>

          <p className="text-xs text-neutral-400 font-mono">
            Direct staff confirmation will finalize match MMR and award Nexus Coins:
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <button
              id="admin-confirm-playerA-btn"
              onClick={handleAdminConfirmA}
              className="py-2.5 px-3 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold text-xs uppercase tracking-wider truncate"
            >
              {playerAName} Won
            </button>
            <button
              id="admin-confirm-playerB-btn"
              onClick={handleAdminConfirmB}
              className="py-2.5 px-3 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white font-bold text-xs uppercase tracking-wider truncate"
            >
              {playerBName} Won
            </button>
            <button
              id="admin-confirm-draw-btn"
              onClick={handleAdminConfirmDraw}
              className="py-2.5 px-3 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white font-bold text-xs uppercase tracking-wider truncate"
            >
              Draw
            </button>
            <button
              id="admin-cancel-match-btn"
              onClick={() => onAdminCancel?.()}
              className="py-2.5 px-3 rounded-lg bg-neutral-950 border border-white/15 text-neutral-400 hover:text-white font-bold text-xs uppercase tracking-wider truncate"
            >
              Cancel Match
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
