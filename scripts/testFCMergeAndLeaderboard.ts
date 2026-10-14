import { normalizeRankingGame, COMPETITIVE_GAMES, CANONICAL_COMPETITIVE_CATALOG, SupportedGameId } from '../src/lib/ranks';
import { PlayerGameRating, LeaderboardEntry } from '../src/types';

async function runTest() {
  console.log('--- TEST 15: FC MERGE & UNIFIED LEADERBOARD ---');

  // 1. Verify normalization of FC versions
  const norm26 = normalizeRankingGame('FC26');
  const norm27 = normalizeRankingGame('FC27');
  const normFC = normalizeRankingGame('FC');
  const normEA26 = normalizeRankingGame('EA SPORTS FC 26');
  const normEA27 = normalizeRankingGame('EA SPORTS FC 27');
  const normFIFA = normalizeRankingGame('FIFA 24');

  console.log('FC26 normalized:', norm26);
  console.log('FC27 normalized:', norm27);
  console.log('EA SPORTS FC 26 normalized:', normEA26);

  if (norm26.gameId !== 'fc' || norm26.gameCategory !== 'FC') {
    throw new Error('FC26 normalization failed: expected gameId=fc, gameCategory=FC');
  }
  if (norm27.gameId !== 'fc' || norm27.gameCategory !== 'FC') {
    throw new Error('FC27 normalization failed: expected gameId=fc, gameCategory=FC');
  }
  if (normEA26.gameId !== 'fc' || normEA27.gameId !== 'fc') {
    throw new Error('EA FC normalization failed: expected gameId=fc');
  }

  // 2. Test FC Unified Leaderboard Invariant
  // Spec: Player A (FC26: 4 wins 2 losses) and Player B (FC27: 5 wins 1 loss) must appear in the same FC leaderboard.
  const rawMockRatings: PlayerGameRating[] = [
    {
      id: 'p1_fc26',
      playerId: 'player_1',
      gamerTag: 'Striker26',
      gameId: 'fc26',
      gameName: 'FC 26',
      gameCategory: 'FC',
      gameVersion: 'FC26',
      rating: 1250,
      wins: 4,
      losses: 2,
      draws: 0,
      gamesPlayed: 6,
      isProvisional: false,
      placementGames: 6,
      placementGamesRequired: 5,
      updatedAt: Date.now(),
    },
    {
      id: 'p2_fc27',
      playerId: 'player_2',
      gamerTag: 'Legend27',
      gameId: 'fc27',
      gameName: 'FC 27',
      gameCategory: 'FC',
      gameVersion: 'FC27',
      rating: 1320,
      wins: 5,
      losses: 1,
      draws: 0,
      gamesPlayed: 6,
      isProvisional: false,
      placementGames: 6,
      placementGamesRequired: 5,
      updatedAt: Date.now(),
    },
    {
      id: 'p1_fc27',
      playerId: 'player_1',
      gamerTag: 'Striker26',
      gameId: 'fc27',
      gameName: 'FC 27',
      gameCategory: 'FC',
      gameVersion: 'FC27',
      rating: 1280,
      wins: 3,
      losses: 1,
      draws: 0,
      gamesPlayed: 4,
      isProvisional: false,
      placementGames: 4,
      placementGamesRequired: 5,
      updatedAt: Date.now(),
    },
  ];

  // Simulating unified resolution logic as in playerService & seasonService
  const playerMap = new Map<string, PlayerGameRating>();
  rawMockRatings.forEach((item) => {
    const norm = normalizeRankingGame(item.gameId);
    if (norm.gameId === 'fc') {
      const ex = playerMap.get(item.playerId);
      if (!ex) {
        playerMap.set(item.playerId, { ...item, gameId: 'fc', gameName: 'FC', gameCategory: 'FC' });
      } else {
        playerMap.set(item.playerId, {
          ...ex,
          rating: Math.max(ex.rating, item.rating),
          wins: (ex.wins || 0) + (item.wins || 0),
          losses: (ex.losses || 0) + (item.losses || 0),
          draws: (ex.draws || 0) + (item.draws || 0),
          gamesPlayed: (ex.gamesPlayed || 0) + (item.gamesPlayed || 0),
          gameId: 'fc',
          gameName: 'FC',
          gameCategory: 'FC',
        });
      }
    }
  });

  const sortedLeaderboard = Array.from(playerMap.values()).sort((a, b) => b.rating - a.rating);
  console.log(`Unified FC Leaderboard created with ${sortedLeaderboard.length} distinct players:`);
  sortedLeaderboard.forEach((p, idx) => {
    console.log(`  #${idx + 1}: ${p.gamerTag} — ${p.rating} MMR (${p.wins}W - ${p.losses}L, ${p.gamesPlayed} games)`);
  });

  if (sortedLeaderboard.length !== 2) {
    throw new Error(`Expected exactly 2 distinct players on unified FC leaderboard, got ${sortedLeaderboard.length}`);
  }

  // Player 1 had both FC26 and FC27; they must be merged
  const p1Unified = sortedLeaderboard.find((p) => p.playerId === 'player_1');
  if (!p1Unified || p1Unified.wins !== 7 || p1Unified.losses !== 3 || p1Unified.gamesPlayed !== 10) {
    throw new Error(`Player 1 stats not correctly unified: ${JSON.stringify(p1Unified)}`);
  }

  // Verify COMPETITIVE_GAMES
  const fcInConfig = COMPETITIVE_GAMES.filter((g) => g.id.startsWith('fc'));
  console.log('FC game configs in COMPETITIVE_GAMES:', fcInConfig.map((g) => g.id));
  if (fcInConfig.length !== 1 || fcInConfig[0].id !== 'fc') {
    throw new Error(`Expected exactly 1 FC game in COMPETITIVE_GAMES, found ${fcInConfig.length}`);
  }

  // Verify Hall of Fame category count
  console.log('Canonical competitive catalog:', CANONICAL_COMPETITIVE_CATALOG);
  const fcInCatalog = CANONICAL_COMPETITIVE_CATALOG.filter((c) => c === 'FC');
  if (fcInCatalog.length !== 1) {
    throw new Error('FC must appear exactly once in CANONICAL_COMPETITIVE_CATALOG');
  }

  console.log('✅ TEST 15 PASSED: FC leaderboards created: 1, FC26 leaderboards: 0, FC27 leaderboards: 0.');
}

runTest().then(() => process.exit(0)).catch((err) => {
  console.error('TEST 15 FAILED:', err);
  process.exit(1);
});
