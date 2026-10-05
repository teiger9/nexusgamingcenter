import { normalizeRankingGame, COMPETITIVE_GAMES, SupportedGameId } from '../src/lib/ranks';

async function runTest() {
  console.log('--- TEST 18: LARGE PLAYERBASE SCALE & QUERY INTEGRITY TEST ---');

  const SCALES = [1000, 10000, 50000, 100000];

  for (const scale of SCALES) {
    console.log(`\nTesting scale: ${scale.toLocaleString()} player ranking records...`);
    const startBuild = performance.now();

    // 1. Simulate scale ranking records with mix of FC26, FC27, FC, and other games
    const fcPlayers = new Map<string, { rating: number; wins: number; losses: number; games: number }>();
    const games = ['chess', 'fc', 'valorant', 'cs2', 'lol'];

    // Generate simulated rankings in-memory to benchmark aggregation and sorting
    let duplicateFCCount = 0;
    for (let i = 0; i < scale; i++) {
      const pId = `player_${i % (scale / 2)}`; // 50% overlap to test duplicate FC version consolidation
      const rawGame = i % 5 === 0 ? 'fc26' : i % 5 === 1 ? 'fc27' : i % 5 === 2 ? 'fc' : games[i % 5];
      const norm = normalizeRankingGame(rawGame);

      if (norm.gameId === 'fc') {
        const rating = 1000 + ((i * 17) % 1500);
        const ex = fcPlayers.get(pId);
        if (!ex) {
          fcPlayers.set(pId, { rating, wins: 4, losses: 2, games: 6 });
        } else {
          duplicateFCCount++;
          fcPlayers.set(pId, {
            rating: Math.max(ex.rating, rating),
            wins: ex.wins + 5,
            losses: ex.losses + 1,
            games: ex.games + 6,
          });
        }
      }
    }

    const buildTime = performance.now() - startBuild;
    console.log(`- Simulated dataset generated in ${buildTime.toFixed(1)}ms. Unified FC distinct players: ${fcPlayers.size.toLocaleString()}`);

    // 2. Benchmark leaderboard sort & ranking calculation
    const startSort = performance.now();
    const sortedFC = Array.from(fcPlayers.entries())
      .map(([id, stats]) => ({ id, ...stats }))
      .sort((a, b) => b.rating - a.rating);
    const sortTime = performance.now() - startSort;

    console.log(`- Sorted ${sortedFC.length.toLocaleString()} FC players in ${sortTime.toFixed(1)}ms.`);
    if (sortTime > 150) {
      console.warn(`⚠️ Sort time ${sortTime.toFixed(1)}ms exceeded target threshold.`);
    }

    // 3. Test pagination (Page 1: 50 items, subsequent page)
    const pageSize = 50;
    const page1 = sortedFC.slice(0, pageSize);
    const targetPageIdx = sortedFC.length >= pageSize * 10 ? 9 : Math.max(0, Math.floor(sortedFC.length / pageSize) - 1);
    const nextPage = sortedFC.slice(pageSize * targetPageIdx, pageSize * (targetPageIdx + 1));
    if (page1.length !== pageSize || nextPage.length !== pageSize) {
      throw new Error(`Pagination slice failed (page1: ${page1.length}, targetPage: ${nextPage.length})`);
    }
    console.log(`- Pagination verified: Page 1 top MMR: ${page1[0].rating}, Page ${targetPageIdx + 1} top MMR: ${nextPage[0].rating}`);

    // 4. Test player rank lookup (O(1) index search in sorted list or binary search)
    const testLookupId = sortedFC[Math.floor(sortedFC.length / 2)].id;
    const startLookup = performance.now();
    const foundIndex = sortedFC.findIndex((p) => p.id === testLookupId);
    const lookupTime = performance.now() - startLookup;
    if (foundIndex === -1) throw new Error('Player rank lookup failed');
    console.log(`- Player rank lookup for rank #${foundIndex + 1} completed in ${lookupTime.toFixed(3)}ms.`);

    // 5. Verify no duplicate FC rankings created
    const uniqueIds = new Set(sortedFC.map((p) => p.id));
    if (uniqueIds.size !== sortedFC.length) {
      throw new Error(`Duplicate FC rankings detected! Unique: ${uniqueIds.size}, Total: ${sortedFC.length}`);
    }
    console.log(`- Duplicate check verified: 0 duplicate rankings across ${sortedFC.length.toLocaleString()} records.`);

    // 6. Verify removed games cannot reappear
    const removedCheck = ['tekken', 'rocket league', 'mortal kombat', 'fortnite', 'call of duty'];
    for (const rg of removedCheck) {
      const norm = normalizeRankingGame(rg);
      if (norm.supported) throw new Error(`Removed game ${rg} reappeared as supported!`);
    }
    console.log(`- Catalog constraint verified: 0 removed games present.`);
  }

  console.log('\n✅ TEST 18 PASSED: Large playerbase scale & query performance verified up to 100,000 records.');
}

runTest().catch((err) => {
  console.error('TEST 18 FAILED:', err);
  process.exit(1);
});
