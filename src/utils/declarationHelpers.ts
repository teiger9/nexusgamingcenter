import { Match } from '../types';
import { normalizeGameId } from '../lib/ranks';

export interface DeclarationDisplayInfo {
  text: string;
  rawStatus: 'TEAM_A_WIN' | 'TEAM_B_WIN' | 'DRAW' | 'WIN' | 'LOSS' | 'NOT_DECLARED';
  badgeClass: string;
}

/**
 * Resolves the real human gamer tag / display name of Player A or Player B in 1v1 matches.
 * Strictly guarantees no undefined, null, or object IDs.
 */
export function get1v1PlayerName(
  match: Match,
  side: 'playerA' | 'playerB',
  profiles?: Record<string, any>
): string {
  if (!match) return side === 'playerA' ? 'Player 1' : 'Player 2';

  if (side === 'playerA') {
    const profile = profiles && match.playerAId ? profiles[match.playerAId] : null;
    const tag = profile?.gamerTag || match.playerAGamerTag || profile?.displayName || match.playerAName;
    if (tag && typeof tag === 'string' && tag.trim() !== '') return tag.trim();
    return 'Player 1';
  } else {
    const profile = profiles && match.playerBId ? profiles[match.playerBId] : null;
    const tag = profile?.gamerTag || match.playerBGamerTag || profile?.displayName || match.playerBName;
    if (tag && typeof tag === 'string' && tag.trim() !== '') return tag.trim();
    return 'Player 2';
  }
}

/**
 * Returns a natural English sentence for what a 1v1 player declared.
 * Examples:
 * - "Mouhamed declared he WON"
 * - "Ahmed declared he LOST"
 * - "Mouhamed declared a DRAW"
 */
export function get1v1PlayerDeclarationSentence(
  playerName: string,
  rawDeclaration?: string | null
): string {
  if (!rawDeclaration) {
    return `${playerName} has not declared yet`;
  }
  const val = rawDeclaration.trim().toUpperCase();
  if (val === 'WIN' || val === 'PLAYERA' || val === 'PLAYERB' || val === 'WON') {
    return `${playerName} declared he WON`;
  }
  if (val === 'LOSS' || val === 'LOST') {
    return `${playerName} declared he LOST`;
  }
  if (val === 'DRAW' || val === 'DREW') {
    return `${playerName} declared a DRAW`;
  }
  return `${playerName} declared ${val}`;
}

export interface Match1v1DeclarationSummary {
  playerAName: string;
  playerBName: string;
  playerADeclared: 'WON' | 'LOST' | 'DRAW' | null;
  playerBDeclared: 'WON' | 'LOST' | 'DRAW' | null;
  playerADisplayText: string; // "WON" | "LOST" | "DRAW" | "Not declared"
  playerBDisplayText: string; // "WON" | "LOST" | "DRAW" | "Not declared"
  playerASentence: string; // e.g. "Mouhamed declared he WON"
  playerBSentence: string; // e.g. "Ahmed declared he LOST"
  hasPlayerADeclared: boolean;
  hasPlayerBDeclared: boolean;
  bothDeclared: boolean;
  isAgreed: boolean;
  isContested: boolean;
  statusBadgeText: 'RESULT AGREED' | 'RESULT CONTESTED' | 'AWAITING DECLARATIONS' | 'MATCH CONFIRMED';
  winnerSide: 'playerA' | 'playerB' | 'draw' | null;
  winnerName: string | null;

  // FC 26 & FC 27 Series Specific Details
  isFcSeries: boolean;
  playerASeriesScore?: {
    gamesWon: number;
    gamesLost: number;
    totalGames: number;
    declaration: 'WIN' | 'LOSS' | 'DRAW';
  } | null;
  playerBSeriesScore?: {
    gamesWon: number;
    gamesLost: number;
    totalGames: number;
    declaration: 'WIN' | 'LOSS' | 'DRAW';
  } | null;
  playerAGamesWon: number | null;
  playerBGamesWon: number | null;
  totalGamesPlayed: number | null;
  calculatedSeriesWinner: 'playerA' | 'playerB' | 'draw' | null;
  calculatedSeriesWinnerName: string | null;
  calculatedNcReward: number; // 5 * totalGamesPlayed
  seriesFormulaText: string; // e.g. "6 × 5 NC = 30 NC"
  fcConflictReason?: string | null;
}

/**
 * Analyzes and summarizes a 1v1 match's declarations and agreement status.
 */
export function get1v1DeclarationSummary(
  match: Match,
  profiles?: Record<string, any>
): Match1v1DeclarationSummary {
  const playerAName = get1v1PlayerName(match, 'playerA', profiles);
  const playerBName = get1v1PlayerName(match, 'playerB', profiles);

  const rawDeclA = getPlayerDeclarationValue(match, match.playerAId, 'teamA');
  const rawDeclB = getPlayerDeclarationValue(match, match.playerBId, 'teamB');

  const normalizeDecl = (raw: string | null | undefined): 'WON' | 'LOST' | 'DRAW' | null => {
    if (!raw) return null;
    const u = raw.trim().toUpperCase();
    if (u === 'WIN' || u === 'PLAYERA' || u === 'PLAYERB' || u === 'WON') return 'WON';
    if (u === 'LOSS' || u === 'LOST') return 'LOST';
    if (u === 'DRAW' || u === 'DREW') return 'DRAW';
    return null;
  };

  const playerADeclared = normalizeDecl(rawDeclA);
  const playerBDeclared = normalizeDecl(rawDeclB);

  const hasPlayerADeclared = playerADeclared !== null;
  const hasPlayerBDeclared = playerBDeclared !== null;
  const bothDeclared = hasPlayerADeclared && hasPlayerBDeclared;

  let isAgreed = false;
  let isContested = false;
  let winnerSide: 'playerA' | 'playerB' | 'draw' | null = null;
  let winnerName: string | null = null;

  if (bothDeclared) {
    if (playerADeclared === 'WON' && playerBDeclared === 'LOST') {
      isAgreed = true;
      winnerSide = 'playerA';
      winnerName = playerAName;
    } else if (playerADeclared === 'LOST' && playerBDeclared === 'WON') {
      isAgreed = true;
      winnerSide = 'playerB';
      winnerName = playerBName;
    } else if (playerADeclared === 'DRAW' && playerBDeclared === 'DRAW') {
      isAgreed = true;
      winnerSide = 'draw';
      winnerName = 'DRAW';
    } else {
      isContested = true;
    }
  }

  // Check FC series specific details
  const normGame = normalizeGameId(match.gameId);
  const isFcSeries =
    normGame === 'fc' ||
    Boolean(match.gameName?.toLowerCase().includes('fc'));

  let playerAGamesWon: number | null = null;
  let playerBGamesWon: number | null = null;
  let totalGamesPlayed: number | null = null;
  let calculatedSeriesWinner: 'playerA' | 'playerB' | 'draw' | null = null;
  let calculatedSeriesWinnerName: string | null = null;
  let calculatedNcReward = 0;
  let seriesFormulaText = '';
  let fcConflictReason: string | null = null;

  const scoreA = match.playerASeriesScore;
  const scoreB = match.playerBSeriesScore;

  if (isFcSeries) {
    if (match.status === 'CONFIRMED' || match.ratingProcessed) {
      playerAGamesWon = match.playerAGamesWon ?? (scoreA ? scoreA.gamesWon : null);
      playerBGamesWon = match.playerBGamesWon ?? (scoreB ? scoreB.gamesWon : null);
      totalGamesPlayed =
        match.totalGamesPlayed ??
        (scoreA?.totalGames ??
          scoreB?.totalGames ??
          (playerAGamesWon !== null && playerBGamesWon !== null ? playerAGamesWon + playerBGamesWon : null));
      
      if (match.officialWinner === match.playerAId || match.winnerId === match.playerAId) {
        calculatedSeriesWinner = 'playerA';
        calculatedSeriesWinnerName = playerAName;
      } else if (match.officialWinner === match.playerBId || match.winnerId === match.playerBId) {
        calculatedSeriesWinner = 'playerB';
        calculatedSeriesWinnerName = playerBName;
      } else if (match.winnerId === 'draw') {
        calculatedSeriesWinner = 'draw';
        calculatedSeriesWinnerName = 'DRAW';
      }
      calculatedNcReward = match.ncReward ?? (totalGamesPlayed ? totalGamesPlayed * 5 : 0);
      seriesFormulaText = totalGamesPlayed ? `${totalGamesPlayed} × 5 NC = ${calculatedNcReward} NC` : '';
    } else if (scoreA && scoreB) {
      // Both competitors submitted FC series score reports
      const aAgreesWithB = scoreA.gamesWon === scoreB.gamesLost && scoreA.gamesLost === scoreB.gamesWon;
      const validTotals = scoreA.totalGames === scoreB.totalGames && scoreA.totalGames > 0;
      const declarationsConsistent =
        (scoreA.gamesWon > scoreA.gamesLost && scoreA.declaration === 'WIN' && scoreB.declaration === 'LOSS') ||
        (scoreA.gamesWon < scoreA.gamesLost && scoreA.declaration === 'LOSS' && scoreB.declaration === 'WIN') ||
        (scoreA.gamesWon === scoreA.gamesLost && scoreA.declaration === 'DRAW' && scoreB.declaration === 'DRAW');

      if (aAgreesWithB && validTotals && declarationsConsistent) {
        playerAGamesWon = scoreA.gamesWon;
        playerBGamesWon = scoreB.gamesWon;
        totalGamesPlayed = scoreA.totalGames;
        if (playerAGamesWon > playerBGamesWon) {
          calculatedSeriesWinner = 'playerA';
          calculatedSeriesWinnerName = playerAName;
          winnerSide = 'playerA';
          winnerName = playerAName;
        } else if (playerBGamesWon > playerAGamesWon) {
          calculatedSeriesWinner = 'playerB';
          calculatedSeriesWinnerName = playerBName;
          winnerSide = 'playerB';
          winnerName = playerBName;
        } else {
          calculatedSeriesWinner = 'draw';
          calculatedSeriesWinnerName = 'DRAW';
          winnerSide = 'draw';
          winnerName = 'DRAW';
        }
        calculatedNcReward = 5 * totalGamesPlayed;
        seriesFormulaText = `${totalGamesPlayed} × 5 NC = ${calculatedNcReward} NC`;
        isAgreed = true;
        isContested = false;
      } else {
        isContested = true;
        isAgreed = false;
        fcConflictReason = 'Competitors reported conflicting game scores or declarations';
        playerAGamesWon = scoreA.gamesWon;
        playerBGamesWon = scoreB.gamesWon;
        totalGamesPlayed = Math.max(scoreA.totalGames, scoreB.totalGames);
        calculatedNcReward = 5 * totalGamesPlayed;
        seriesFormulaText = `${totalGamesPlayed} × 5 NC = ${calculatedNcReward} NC (Contested)`;
      }
    } else if (scoreA) {
      playerAGamesWon = scoreA.gamesWon;
      playerBGamesWon = scoreA.gamesLost;
      totalGamesPlayed = scoreA.totalGames;
      calculatedNcReward = 5 * totalGamesPlayed;
      seriesFormulaText = `${totalGamesPlayed} × 5 NC = ${calculatedNcReward} NC`;
      if (scoreA.gamesWon > scoreA.gamesLost) {
        calculatedSeriesWinner = 'playerA';
        calculatedSeriesWinnerName = playerAName;
      } else if (scoreA.gamesWon < scoreA.gamesLost) {
        calculatedSeriesWinner = 'playerB';
        calculatedSeriesWinnerName = playerBName;
      } else {
        calculatedSeriesWinner = 'draw';
        calculatedSeriesWinnerName = 'DRAW';
      }
    } else if (scoreB) {
      playerBGamesWon = scoreB.gamesWon;
      playerAGamesWon = scoreB.gamesLost;
      totalGamesPlayed = scoreB.totalGames;
      calculatedNcReward = 5 * totalGamesPlayed;
      seriesFormulaText = `${totalGamesPlayed} × 5 NC = ${calculatedNcReward} NC`;
      if (scoreB.gamesWon > scoreB.gamesLost) {
        calculatedSeriesWinner = 'playerB';
        calculatedSeriesWinnerName = playerBName;
      } else if (scoreB.gamesWon < scoreB.gamesLost) {
        calculatedSeriesWinner = 'playerA';
        calculatedSeriesWinnerName = playerAName;
      } else {
        calculatedSeriesWinner = 'draw';
        calculatedSeriesWinnerName = 'DRAW';
      }
    } else if (match.totalGamesPlayed) {
      totalGamesPlayed = match.totalGamesPlayed;
      playerAGamesWon = match.playerAGamesWon ?? null;
      playerBGamesWon = match.playerBGamesWon ?? null;
      calculatedNcReward = 5 * totalGamesPlayed;
      seriesFormulaText = `${totalGamesPlayed} × 5 NC = ${calculatedNcReward} NC`;
    }
  }

  // If match status is explicitly DISPUTED
  if (match.status === 'DISPUTED') {
    isContested = true;
    isAgreed = false;
  }

  // If match status is already CONFIRMED
  if (match.status === 'CONFIRMED') {
    if (match.winnerId === match.playerAId || match.officialWinner === match.playerAId) {
      winnerSide = 'playerA';
      winnerName = playerAName;
    } else if (match.winnerId === match.playerBId || match.officialWinner === match.playerBId) {
      winnerSide = 'playerB';
      winnerName = playerBName;
    } else if (match.winnerId === 'draw' || match.officialResult === 'DRAW') {
      winnerSide = 'draw';
      winnerName = 'DRAW';
    }
  }

  const statusBadgeText = isContested
    ? 'RESULT CONTESTED'
    : isAgreed || match.status === 'CONFIRMED'
    ? 'RESULT AGREED'
    : 'AWAITING DECLARATIONS';

  return {
    playerAName,
    playerBName,
    playerADeclared,
    playerBDeclared,
    playerADisplayText: playerADeclared ?? 'Not declared',
    playerBDisplayText: playerBDeclared ?? 'Not declared',
    playerASentence: get1v1PlayerDeclarationSentence(playerAName, rawDeclA),
    playerBSentence: get1v1PlayerDeclarationSentence(playerBName, rawDeclB),
    hasPlayerADeclared,
    hasPlayerBDeclared,
    bothDeclared,
    isAgreed,
    isContested,
    statusBadgeText,
    winnerSide,
    winnerName,

    // FC Series
    isFcSeries,
    playerASeriesScore: scoreA,
    playerBSeriesScore: scoreB,
    playerAGamesWon,
    playerBGamesWon,
    totalGamesPlayed,
    calculatedSeriesWinner,
    calculatedSeriesWinnerName,
    calculatedNcReward,
    seriesFormulaText,
    fcConflictReason,
  };
}

/**
 * Authoritatively retrieves a player's raw declared result for a match.
 * Resolves against:
 * 1. match.declarations[playerUid].declaredResult
 * 2. match.votes[playerUid]
 * 3. 1v1 legacy / captain fields: playerADeclaration / playerBDeclaration / teamADeclaration / teamBDeclaration
 */
export function getPlayerDeclarationValue(
  match: Match,
  playerUid?: string,
  fallbackSide?: 'teamA' | 'teamB'
): string | null {
  if (!match) return null;

  // 1. If playerUid provided, check 5v5 declarations map
  if (playerUid && match.declarations && match.declarations[playerUid]) {
    const decl = match.declarations[playerUid].declaredResult;
    if (decl) return decl;
  }

  // 2. Check 5v5 votes map
  if (playerUid && match.votes && match.votes[playerUid]) {
    const vote = match.votes[playerUid];
    if (vote) return vote;
  }

  // 3. Check captain / legacy fields
  const isPlayerA =
    (playerUid && playerUid === match.playerAId) ||
    (playerUid && (match.teamAPlayerIds || []).includes(playerUid)) ||
    fallbackSide === 'teamA';

  const isPlayerB =
    (playerUid && playerUid === match.playerBId) ||
    (playerUid && (match.teamBPlayerIds || []).includes(playerUid)) ||
    fallbackSide === 'teamB';

  if (isPlayerA) {
    if ((match as any).teamADeclaration) return (match as any).teamADeclaration;
    if (match.playerADeclaration) return match.playerADeclaration;
  }

  if (isPlayerB) {
    if ((match as any).teamBDeclaration) return (match as any).teamBDeclaration;
    if (match.playerBDeclaration) return match.playerBDeclaration;
  }

  return null;
}

/**
 * Formats a declaration value into clear, consistent UI text and badge styling.
 * For 5v5 matches: Uses Team A / Team B terminology ("TEAM A WIN", "TEAM B WIN", "DRAW").
 * For 1v1 matches: NEVER uses Team A / Team B terminology! Strictly formats as "WON", "LOST", "DRAW", "Not declared".
 */
export function formatDeclarationDisplay(
  declaredValue: string | null | undefined,
  options?: {
    teamSide?: 'teamA' | 'teamB';
    teamAName?: string;
    teamBName?: string;
    is5v5?: boolean;
    playerName?: string;
  }
): DeclarationDisplayInfo {
  if (!declaredValue) {
    return {
      text: 'Not declared',
      rawStatus: 'NOT_DECLARED',
      badgeClass: 'text-slate-500 italic',
    };
  }

  const val = declaredValue.trim();

  // -------------------------------------------------------------
  // 5v5 MATCH FORMATTING (Keep Team A / Team B terminology)
  // -------------------------------------------------------------
  if (options?.is5v5) {
    if (val === 'teamA' || val === 'playerA') {
      return {
        text: 'TEAM A WIN',
        rawStatus: 'TEAM_A_WIN',
        badgeClass: 'text-cyan-400 font-bold',
      };
    }
    if (val === 'teamB' || val === 'playerB') {
      return {
        text: 'TEAM B WIN',
        rawStatus: 'TEAM_B_WIN',
        badgeClass: 'text-rose-400 font-bold',
      };
    }
    if (val === 'draw' || val === 'DRAW') {
      return {
        text: 'DRAW',
        rawStatus: 'DRAW',
        badgeClass: 'text-yellow-400 font-bold',
      };
    }
    if (val === 'WIN') {
      if (options?.teamSide === 'teamA') {
        return { text: 'TEAM A WIN', rawStatus: 'TEAM_A_WIN', badgeClass: 'text-cyan-400 font-bold' };
      }
      if (options?.teamSide === 'teamB') {
        return { text: 'TEAM B WIN', rawStatus: 'TEAM_B_WIN', badgeClass: 'text-rose-400 font-bold' };
      }
      return { text: 'WIN', rawStatus: 'WIN', badgeClass: 'text-emerald-400 font-bold' };
    }
    if (val === 'LOSS') {
      if (options?.teamSide === 'teamA') {
        return { text: 'TEAM B WIN', rawStatus: 'TEAM_B_WIN', badgeClass: 'text-rose-400 font-bold' };
      }
      if (options?.teamSide === 'teamB') {
        return { text: 'TEAM A WIN', rawStatus: 'TEAM_A_WIN', badgeClass: 'text-cyan-400 font-bold' };
      }
      return { text: 'LOSS', rawStatus: 'LOSS', badgeClass: 'text-rose-400 font-bold' };
    }
    return {
      text: val.toUpperCase(),
      rawStatus: 'NOT_DECLARED',
      badgeClass: 'text-slate-300 font-bold',
    };
  }

  // -------------------------------------------------------------
  // 1v1 MATCH FORMATTING (NEVER USE TEAM A / TEAM B TERMINOLOGY)
  // Strictly "WON", "LOST", "DRAW", or "Not declared"
  // -------------------------------------------------------------
  const u = val.toUpperCase();
  if (u === 'WIN' || u === 'WON' || u === 'PLAYERA' || u === 'PLAYERB') {
    return {
      text: 'WON',
      rawStatus: 'WIN',
      badgeClass: 'text-emerald-400 font-bold',
    };
  }
  if (u === 'LOSS' || u === 'LOST') {
    return {
      text: 'LOST',
      rawStatus: 'LOSS',
      badgeClass: 'text-rose-400 font-bold',
    };
  }
  if (u === 'DRAW' || u === 'DREW') {
    return {
      text: 'DRAW',
      rawStatus: 'DRAW',
      badgeClass: 'text-yellow-400 font-bold',
    };
  }

  return {
    text: val.toUpperCase(),
    rawStatus: 'NOT_DECLARED',
    badgeClass: 'text-slate-300 font-bold',
  };
}

export interface TeamMemberInfo {
  id: string;
  gamerTag: string;
  inGameName?: string;
  rating?: number;
  isCaptain?: boolean;
}

/**
 * Returns the complete list of unique players for Team A or Team B in a 5v5 match.
 * Aggregates from teamAPlayers / teamBPlayers, teamAPlayerIds / teamBPlayerIds,
 * captains, and declarations.
 */
export function get5v5TeamPlayersList(
  match: Match,
  teamSide: 'teamA' | 'teamB'
): TeamMemberInfo[] {
  if (!match) return [];

  const playerMap = new Map<string, TeamMemberInfo>();

  const isA = teamSide === 'teamA';
  const playerObjects = isA ? match.teamAPlayers || [] : match.teamBPlayers || [];
  const playerIds = isA ? match.teamAPlayerIds || [] : match.teamBPlayerIds || [];
  const captainId = isA ? match.captainAId || match.playerAId : match.captainBId || match.playerBId;
  const captainGamerTag = isA ? match.playerAGamerTag : match.playerBGamerTag;

  // 1. Add from explicit player objects
  for (const p of playerObjects) {
    if (p.id) {
      playerMap.set(p.id, {
        id: p.id,
        gamerTag: p.gamerTag || p.name || 'Player',
        inGameName: p.inGameName,
        rating: p.rating,
        isCaptain: p.id === captainId,
      });
    }
  }

  // 2. Add from player IDs
  for (const id of playerIds) {
    if (!playerMap.has(id)) {
      playerMap.set(id, {
        id,
        gamerTag: id === captainId && captainGamerTag ? captainGamerTag : 'Player',
        isCaptain: id === captainId,
      });
    }
  }

  // 3. Ensure captain is in the list
  if (captainId && !playerMap.has(captainId)) {
    playerMap.set(captainId, {
      id: captainId,
      gamerTag: captainGamerTag || 'Team Captain',
      isCaptain: true,
    });
  }

  // 4. Check declarations for any players on this teamSide
  if (match.declarations) {
    for (const [uid, decl] of Object.entries(match.declarations)) {
      if (decl.teamSide === teamSide) {
        if (!playerMap.has(uid)) {
          playerMap.set(uid, {
            id: uid,
            gamerTag: decl.gamerTag || 'Player',
            inGameName: decl.inGameName,
            isCaptain: uid === captainId,
          });
        } else {
          // Enrich gamerTag if previously generic
          const existing = playerMap.get(uid)!;
          if (decl.gamerTag && existing.gamerTag === 'Player') {
            existing.gamerTag = decl.gamerTag;
          }
          if (decl.inGameName && !existing.inGameName) {
            existing.inGameName = decl.inGameName;
          }
        }
      }
    }
  }

  return Array.from(playerMap.values());
}

