import { Match, MatchHistoryRecord, OfficialMatchResult } from '../types';
import { calculateAuthoritativeMatchReward } from './manualMatchResultService';

export interface AuthoritativeMatchRewardsAndMMR {
  gameId: string;
  gameName: string;
  is5v5: boolean;
  outcome: 'teamA' | 'teamB' | 'playerA' | 'playerB' | 'draw' | 'CANCELLED';
  isDraw: boolean;
  isCancelled: boolean;

  // Participant titles
  entityAName: string;
  entityATag?: string;
  entityBName: string;
  entityBTag?: string;
  winnerTitle: string;
  loserTitle: string;

  // Exact NC Rewards (One Source of Truth)
  teamARewardPerPlayer: number;
  teamBRewardPerPlayer: number;
  teamATotalReward: number;
  teamBTotalReward: number;
  winnerRewardPerPlayer: number;
  loserRewardPerPlayer: number;
  drawRewardPerPlayer: number;
  winnerTeamTotalReward: number;
  loserTeamTotalReward: number;
  drawTeamTotalReward: number;

  // Exact MMR Changes (Stored directly with the match)
  teamAMMRChange?: number;
  teamBMMRChange?: number;
  teamARatingBefore?: number;
  teamARatingAfter?: number;
  teamBRatingBefore?: number;
  teamBRatingAfter?: number;

  player1MMRChange?: number;
  player2MMRChange?: number;
  player1RatingBefore?: number;
  player1RatingAfter?: number;
  player2RatingBefore?: number;
  player2RatingAfter?: number;

  // Formatted announcement strings (No hardcoded or outdated values)
  headline: string;
  winnerText: string;
  loserText: string;
  drawText?: string;
  announcementSummary: string;
  rewardBreakdown: string;
}

/**
 * Normalizes game names into friendly esports display titles
 */
export function getEsportsGameName(gameId?: string, rawGameName?: string): string {
  const g = (gameId || rawGameName || '').toLowerCase().trim();
  if (g.includes('lol') || g.includes('league')) return 'League of Legends';
  if (g.includes('val')) return 'Valorant';
  if (g.includes('cs2') || g.includes('counter-strike') || g.includes('counterstrike')) return 'CS2';
  if (g === 'fc27') return 'FC 27';
  if (g === 'fc26') return 'FC 26';
  if (g.includes('fc')) return 'FC';
  if (g.includes('chess')) return 'Chess';
  return rawGameName || (gameId ? gameId.toUpperCase() : 'Competitive Match');
}

/**
 * Extracts or derives authoritative rewards and MMR changes for ANY match record.
 * Guarantees exact equality between the announcement, the wallet payout, and the leaderboard ranking.
 */
export function deriveMatchRewardsAndMMR(
  match: Match | MatchHistoryRecord | OfficialMatchResult | any
): AuthoritativeMatchRewardsAndMMR {
  const cleanGameId = (match.gameId || match.game || '').toLowerCase().trim();
  const gameName = getEsportsGameName(cleanGameId, match.gameName || match.game);

  const is5v5 = Boolean(
    match.is5v5 ||
    match.matchFormat === '5v5' ||
    match.matchType === '5v5' ||
    match.gameMode === '5v5' ||
    cleanGameId === 'valorant' ||
    cleanGameId === 'cs2' ||
    cleanGameId === 'lol' ||
    cleanGameId === 'league' ||
    cleanGameId === 'leagueoflegends'
  );

  // Status check
  const isCancelled = match.status === 'CANCELLED' || match.finalResult === 'CANCELLED' || match.outcome === 'CANCELLED';

  // Determine outcome
  let outcome: 'teamA' | 'teamB' | 'playerA' | 'playerB' | 'draw' | 'CANCELLED' = 'draw';
  if (isCancelled) {
    outcome = 'CANCELLED';
  } else if (is5v5) {
    if (
      match.finalResult === 'teamA' ||
      match.outcome === 'teamA' ||
      match.teamOutcome === 'teamA' ||
      match.winnerId === match.teamAId ||
      match.winnerTeamId === match.teamAId ||
      match.winnerTeamId === 'teamA' ||
      match.winningTeam === 'teamA' ||
      match.officialWinner === 'teamA' ||
      match.officialTeamWinner === 'teamA'
    ) {
      outcome = 'teamA';
    } else if (
      match.finalResult === 'teamB' ||
      match.outcome === 'teamB' ||
      match.teamOutcome === 'teamB' ||
      match.winnerId === match.teamBId ||
      match.winnerTeamId === match.teamBId ||
      match.winnerTeamId === 'teamB' ||
      match.winningTeam === 'teamB' ||
      match.officialWinner === 'teamB' ||
      match.officialTeamWinner === 'teamB'
    ) {
      outcome = 'teamB';
    } else {
      outcome = 'draw';
    }
  } else {
    // 1v1
    const p1Id = match.player1Id || match.playerAId;
    const p2Id = match.player2Id || match.playerBId;
    if (
      match.winnerId === 'DRAW' ||
      match.winnerGamerTag === 'DRAW' ||
      match.outcome === 'draw' ||
      match.finalResult === 'draw' ||
      match.seriesWinnerId === 'draw'
    ) {
      outcome = 'draw';
    } else if (match.winnerId === p1Id || match.outcome === 'playerA' || match.finalResult === 'playerA' || match.seriesWinnerId === p1Id) {
      outcome = 'playerA';
    } else if (match.winnerId === p2Id || match.outcome === 'playerB' || match.finalResult === 'playerB' || match.seriesWinnerId === p2Id) {
      outcome = 'playerB';
    } else {
      outcome = 'draw';
    }
  }

  const isDraw = outcome === 'draw';

  // Names
  const entityAName = match.teamAName || match.player1GamerTag || match.playerAGamerTag || 'Team Alpha';
  const entityATag = match.teamATag || undefined;
  const entityBName = match.teamBName || match.player2GamerTag || match.playerBGamerTag || 'Team Omega';
  const entityBTag = match.teamBTag || undefined;

  const entityADisplay = entityATag ? `${entityAName} [${entityATag}]` : entityAName;
  const entityBDisplay = entityBTag ? `${entityBName} [${entityBTag}]` : entityBName;

  const winnerTitle = isDraw ? 'Draw' : (outcome === 'teamA' || outcome === 'playerA') ? entityADisplay : entityBDisplay;
  const loserTitle = isDraw ? 'Draw' : (outcome === 'teamA' || outcome === 'playerA') ? entityBDisplay : entityADisplay;

  // MMR Changes
  const teamAMMRChange = match.teamAMMRChange ?? match.teamARatingChange ?? (
    typeof match.teamARatingAfter === 'number' && typeof match.teamARatingBefore === 'number'
      ? match.teamARatingAfter - match.teamARatingBefore
      : undefined
  );
  const teamBMMRChange = match.teamBMMRChange ?? match.teamBRatingChange ?? (
    typeof match.teamBRatingAfter === 'number' && typeof match.teamBRatingBefore === 'number'
      ? match.teamBRatingAfter - match.teamBRatingBefore
      : undefined
  );
  const teamARatingBefore = match.teamARatingBefore ?? undefined;
  const teamARatingAfter = match.teamARatingAfter ?? undefined;
  const teamBRatingBefore = match.teamBRatingBefore ?? undefined;
  const teamBRatingAfter = match.teamBRatingAfter ?? undefined;

  const player1MMRChange = match.player1MMRChange ?? match.playerAMMRChange ?? match.playerARatingChange ?? (
    typeof match.player1NewMMR === 'number' && typeof match.player1PreviousMMR === 'number'
      ? match.player1NewMMR - match.player1PreviousMMR
      : undefined
  );
  const player2MMRChange = match.player2MMRChange ?? match.playerBMMRChange ?? match.playerBRatingChange ?? (
    typeof match.player2NewMMR === 'number' && typeof match.player2PreviousMMR === 'number'
      ? match.player2NewMMR - match.player2PreviousMMR
      : undefined
  );
  const player1RatingBefore = match.player1PreviousMMR ?? match.playerAPreviousMMR ?? match.playerARatingBefore ?? undefined;
  const player1RatingAfter = match.player1NewMMR ?? match.playerANewMMR ?? match.playerARatingAfter ?? undefined;
  const player2RatingBefore = match.player2PreviousMMR ?? match.playerBPreviousMMR ?? match.playerBRatingBefore ?? undefined;
  const player2RatingAfter = match.player2NewMMR ?? match.playerBNewMMR ?? match.playerBRatingAfter ?? undefined;

  // NC Rewards Calculation / Extraction
  let teamARewardPerPlayer = 0;
  let teamBRewardPerPlayer = 0;
  let winnerRewardPerPlayer = 0;
  let loserRewardPerPlayer = 0;
  let drawRewardPerPlayer = 0;
  let rewardBreakdown = '';

  const hours = typeof match.officialHours === 'number' && match.officialHours > 0 ? match.officialHours : 1.0;

  if (isCancelled) {
    teamARewardPerPlayer = 0;
    teamBRewardPerPlayer = 0;
    winnerRewardPerPlayer = 0;
    loserRewardPerPlayer = 0;
    drawRewardPerPlayer = 0;
    rewardBreakdown = 'Match cancelled: No NC rewards or MMR changes issued.';
  } else if (is5v5) {
    // 5v5 Squads (CS2, Valorant, League of Legends)
    // Rule: NC Reward = Match Duration (hours) × Team Result Rate
    // Win = 90 NC/hr per player • Loss = 30 NC/hr per player • Draw = 45 NC/hr per player
    const winRate = Math.round(90 * hours * 100) / 100;
    const loseRate = Math.round(30 * hours * 100) / 100;
    const drawRate = Math.round(45 * hours * 100) / 100;

    // Check if recorded directly on the match document (ignoring old hardcoded 80/20 placeholders)
    const hasExplicitNonLegacyRewards =
      typeof match.teamARewardPerPlayer === 'number' &&
      typeof match.teamBRewardPerPlayer === 'number' &&
      !(match.teamARewardPerPlayer === 80 && match.teamBRewardPerPlayer === 20) &&
      !(match.teamARewardPerPlayer === 20 && match.teamBRewardPerPlayer === 80);

    if (hasExplicitNonLegacyRewards) {
      teamARewardPerPlayer = match.teamARewardPerPlayer;
      teamBRewardPerPlayer = match.teamBRewardPerPlayer;
    } else if (typeof match.rewardPerWinner === 'number' && match.rewardPerWinner !== 80) {
      const winVal = match.rewardPerWinner;
      const loseVal = typeof match.rewardPerLoser === 'number' ? match.rewardPerLoser : loseRate;
      if (outcome === 'teamA') {
        teamARewardPerPlayer = winVal;
        teamBRewardPerPlayer = loseVal;
      } else if (outcome === 'teamB') {
        teamARewardPerPlayer = loseVal;
        teamBRewardPerPlayer = winVal;
      } else {
        teamARewardPerPlayer = winVal;
        teamBRewardPerPlayer = winVal;
      }
    } else {
      if (outcome === 'teamA') {
        teamARewardPerPlayer = winRate;
        teamBRewardPerPlayer = loseRate;
      } else if (outcome === 'teamB') {
        teamARewardPerPlayer = loseRate;
        teamBRewardPerPlayer = winRate;
      } else {
        teamARewardPerPlayer = drawRate;
        teamBRewardPerPlayer = drawRate;
      }
    }

    const teamACount = match.teamAPlayerIds?.length || match.teamAPlayers?.length || 5;
    const teamBCount = match.teamBPlayerIds?.length || match.teamBPlayers?.length || 5;

    if (outcome === 'teamA') {
      winnerRewardPerPlayer = teamARewardPerPlayer;
      loserRewardPerPlayer = teamBRewardPerPlayer;
      const winSquadTotal = winnerRewardPerPlayer * teamACount;
      const loseSquadTotal = loserRewardPerPlayer * teamBCount;
      rewardBreakdown = `${gameName} 5v5 (${hours}h): ${winnerTitle} (+${winnerRewardPerPlayer} NC/player • ${winSquadTotal} NC team total [90 NC/hr]), ${loserTitle} (+${loserRewardPerPlayer} NC/player • ${loseSquadTotal} NC team total [30 NC/hr])`;
    } else if (outcome === 'teamB') {
      winnerRewardPerPlayer = teamBRewardPerPlayer;
      loserRewardPerPlayer = teamARewardPerPlayer;
      const winSquadTotal = winnerRewardPerPlayer * teamBCount;
      const loseSquadTotal = loserRewardPerPlayer * teamACount;
      rewardBreakdown = `${gameName} 5v5 (${hours}h): ${winnerTitle} (+${winnerRewardPerPlayer} NC/player • ${winSquadTotal} NC team total [90 NC/hr]), ${loserTitle} (+${loserRewardPerPlayer} NC/player • ${loseSquadTotal} NC team total [30 NC/hr])`;
    } else {
      drawRewardPerPlayer = teamARewardPerPlayer;
      const drawSquadTotal = drawRewardPerPlayer * teamACount;
      rewardBreakdown = `${gameName} 5v5 Draw (${hours}h): Both squads received +${drawRewardPerPlayer} NC/player (${drawSquadTotal} NC team total each [45 NC/hr])`;
    }
  } else {
    // 1v1 Games: FC Series or Chess
    const isFc = cleanGameId.includes('fc');
    const isChess = cleanGameId.includes('chess');

    if (isChess) {
      if (isDraw) {
        drawRewardPerPlayer = 1;
        teamARewardPerPlayer = 1;
        teamBRewardPerPlayer = 1;
        rewardBreakdown = 'Chess 1v1 Draw: +1 NC each';
      } else {
        winnerRewardPerPlayer = 2;
        loserRewardPerPlayer = 0;
        if (outcome === 'playerA') {
          teamARewardPerPlayer = 2;
          teamBRewardPerPlayer = 0;
        } else {
          teamARewardPerPlayer = 0;
          teamBRewardPerPlayer = 2;
        }
        rewardBreakdown = `Chess 1v1: Winner +2 NC, Loser 0 NC`;
      }
    } else if (isFc) {
      // FC Series: Total games played × 60 NC
      const p1W = Number(match.player1Wins ?? match.playerAWins ?? match.playerAGamesWon ?? 0);
      const p2W = Number(match.player2Wins ?? match.playerBWins ?? match.playerBGamesWon ?? 0);
      const recordedTotal = Number(match.totalGamesPlayed ?? match.totalGames ?? (p1W + p2W));
      const totalGames = Math.max(1, recordedTotal);
      const seriesTotalNC = totalGames * 60;

      if (isDraw) {
        drawRewardPerPlayer = Math.floor(seriesTotalNC / 2);
        teamARewardPerPlayer = drawRewardPerPlayer;
        teamBRewardPerPlayer = drawRewardPerPlayer;
        rewardBreakdown = `FC Series Draw: ${totalGames} games played × 60 NC = ${seriesTotalNC} NC pool split (+${drawRewardPerPlayer} NC each)`;
      } else {
        winnerRewardPerPlayer = typeof match.winnerNCReward === 'number' && match.winnerNCReward > 0
          ? match.winnerNCReward
          : seriesTotalNC;
        loserRewardPerPlayer = 0;
        if (outcome === 'playerA') {
          teamARewardPerPlayer = winnerRewardPerPlayer;
          teamBRewardPerPlayer = 0;
        } else {
          teamARewardPerPlayer = 0;
          teamBRewardPerPlayer = winnerRewardPerPlayer;
        }
        rewardBreakdown = `FC Series: ${totalGames} games played × 60 NC = +${winnerRewardPerPlayer} NC to overall winner (${winnerTitle}), Loser: 0 NC`;
      }
    } else {
      // General 1v1
      winnerRewardPerPlayer = match.winnerNCReward || match.ncReward || 15;
      loserRewardPerPlayer = match.loserNCReward || 0;
      drawRewardPerPlayer = Math.floor(winnerRewardPerPlayer / 2);
      teamARewardPerPlayer = outcome === 'playerA' ? winnerRewardPerPlayer : isDraw ? drawRewardPerPlayer : loserRewardPerPlayer;
      teamBRewardPerPlayer = outcome === 'playerB' ? winnerRewardPerPlayer : isDraw ? drawRewardPerPlayer : loserRewardPerPlayer;
    }
  }

  const teamACount = match.teamAPlayerIds?.length || match.teamAPlayers?.length || 5;
  const teamBCount = match.teamBPlayerIds?.length || match.teamBPlayers?.length || 5;
  const teamATotalReward = is5v5 ? teamARewardPerPlayer * teamACount : teamARewardPerPlayer;
  const teamBTotalReward = is5v5 ? teamBRewardPerPlayer * teamBCount : teamBRewardPerPlayer;
  const winnerTeamTotalReward = is5v5 ? (outcome === 'teamA' ? teamATotalReward : (outcome === 'teamB' ? teamBTotalReward : teamATotalReward)) : winnerRewardPerPlayer;
  const loserTeamTotalReward = is5v5 ? (outcome === 'teamA' ? teamBTotalReward : (outcome === 'teamB' ? teamATotalReward : teamBTotalReward)) : loserRewardPerPlayer;
  const drawTeamTotalReward = is5v5 ? drawRewardPerPlayer * teamACount : drawRewardPerPlayer;

  // Formatted Headline & Text
  let headline = '';
  let winnerText = '';
  let loserText = '';
  let drawText: string | undefined = undefined;

  const winnerMMR = is5v5
    ? (outcome === 'teamA' ? teamAMMRChange : teamBMMRChange)
    : (outcome === 'playerA' ? player1MMRChange : player2MMRChange);

  const loserMMR = is5v5
    ? (outcome === 'teamA' ? teamBMMRChange : teamAMMRChange)
    : (outcome === 'playerA' ? player2MMRChange : player1MMRChange);

  const formatMMR = (val?: number) => {
    if (val === undefined || val === null) return '';
    return val >= 0 ? `+${val} MMR` : `${val} MMR`;
  };

  if (isCancelled) {
    headline = `${entityADisplay} vs ${entityBDisplay} — Match Cancelled`;
  } else if (isDraw) {
    headline = `${entityADisplay} drew with ${entityBDisplay}`;
    const mmrPart = formatMMR(teamAMMRChange ?? player1MMRChange ?? 0) || '+0 MMR';
    if (is5v5) {
      drawText = `🤝 Draw: ${entityADisplay} & ${entityBDisplay} (${mmrPart} • +${drawRewardPerPlayer} NC / player [${drawTeamTotalReward} NC team total each])`;
    } else {
      drawText = `🤝 Draw: ${entityADisplay} & ${entityBDisplay} (${mmrPart} • +${drawRewardPerPlayer} NC each)`;
    }
  } else {
    headline = `${winnerTitle} defeated ${loserTitle}`;
    const winMMRStr = winnerMMR !== undefined ? `${formatMMR(winnerMMR)} • ` : '';
    const loseMMRStr = loserMMR !== undefined ? `${formatMMR(loserMMR)} • ` : '';

    if (is5v5) {
      winnerText = `🏆 Winner: ${winnerTitle} (${winMMRStr}+${winnerRewardPerPlayer} NC / player [${winnerTeamTotalReward} NC team total])`;
      loserText = `❌ Losing Team: ${loserTitle} (${loseMMRStr}+${loserRewardPerPlayer} NC / player [${loserTeamTotalReward} NC team total])`;
    } else {
      winnerText = `🏆 Winner: ${winnerTitle} (${winMMRStr}+${winnerRewardPerPlayer} NC)`;
      loserText = `❌ Loser: ${loserTitle} (${loseMMRStr}+${loserRewardPerPlayer} NC)`;
    }
  }

  const announcementSummary = isCancelled
    ? 'Match Cancelled'
    : isDraw
    ? drawText!
    : `${winnerText} | ${loserText}`;

  return {
    gameId: cleanGameId,
    gameName,
    is5v5,
    outcome,
    isDraw,
    isCancelled,
    entityAName,
    entityATag,
    entityBName,
    entityBTag,
    winnerTitle,
    loserTitle,
    teamARewardPerPlayer,
    teamBRewardPerPlayer,
    teamATotalReward,
    teamBTotalReward,
    winnerRewardPerPlayer,
    loserRewardPerPlayer,
    drawRewardPerPlayer,
    winnerTeamTotalReward,
    loserTeamTotalReward,
    drawTeamTotalReward,
    teamAMMRChange,
    teamBMMRChange,
    teamARatingBefore,
    teamARatingAfter,
    teamBRatingBefore,
    teamBRatingAfter,
    player1MMRChange,
    player2MMRChange,
    player1RatingBefore,
    player1RatingAfter,
    player2RatingBefore,
    player2RatingAfter,
    headline,
    winnerText,
    loserText,
    drawText,
    announcementSummary,
    rewardBreakdown,
  };
}
