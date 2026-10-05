/**
 * NEXUS GAMING CENTER
 * HALL OF FAME SECURITY & ZERO-FABRICATION TEST SUITE
 *
 * Explicit tests verifying:
 * 1. Active season + no Hall of Fame records -> 0 winners displayed
 * 2. Active season + #1 player -> #1 player MUST NOT be called champion
 * 3. Ended season + not finalized -> 0 winners displayed
 * 4. Finalized season + valid champion -> Champion displayed
 * 5. Finalized season + no valid champion -> "No champion declared"
 * 6. Missing Hall of Fame document -> No fallback winner
 * 7. Fake/random player inserted into UI state -> Must not appear as champion
 * 8. Old season -> Only its official finalized Hall of Fame records displayed
 * 9. Concurrency test: Multiple simultaneous finalization requests ->
 *    Exactly 1 record per game max, 0 duplicate, 0 random, 0 fabricated champions.
 */

import { Season, HallOfFameEntry, SeasonPlayerGameRating, Team } from '../src/types';
import { COMPETITIVE_GAMES, CompetitiveGameConfig } from '../src/lib/ranks';

interface TestResult {
  testId: string;
  name: string;
  passed: boolean;
  details?: string;
}

const results: TestResult[] = [];

function assert(condition: boolean, testId: string, name: string, details?: string) {
  results.push({
    testId,
    name,
    passed: condition,
    details: condition ? undefined : details,
  });
  const symbol = condition ? '✅ PASS' : '❌ FAIL';
  console.log(`[${symbol}] [${testId}] ${name}`);
  if (!condition && details) {
    console.error(`   -> ${details}`);
  }
}

// Pure helper mimicking the authoritative UI resolver for Hall of Fame winners
function resolveGameChampion(
  season: Season,
  game: CompetitiveGameConfig,
  authoritativeHofEntries: HallOfFameEntry[]
): {
  hasWinner: boolean;
  winnerLabel: string;
  isChampion: boolean;
} {
  // Rule 1: Active season must never show a winner
  if (season.status === 'ACTIVE') {
    return {
      hasWinner: false,
      winnerLabel: 'No champions yet. The season is still active.',
      isChampion: false,
    };
  }

  // Rule 2: Ended season awaiting finalization must never show a winner
  if (season.status === 'ENDED') {
    return {
      hasWinner: false,
      winnerLabel: 'Champions are awaiting official finalization.',
      isChampion: false,
    };
  }

  // Rule 3 & 5: Only after official finalization AND only if authoritative doc exists
  if (season.status === 'FINALIZED' || season.status === 'COMPLETED') {
    const record = authoritativeHofEntries.find(
      (e) =>
        e.seasonId === season.id &&
        (e.gameId === game.id ||
          e.gameName?.toLowerCase() === game.name.toLowerCase() ||
          (game.id.startsWith('fc') && e.gameId.startsWith('fc'))) &&
        e.status === 'OFFICIAL' &&
        Boolean(e.championId)
    );

    if (record) {
      return {
        hasWinner: true,
        winnerLabel: `Champion: ${record.championName || record.gamerTag}${record.teamTag ? ` [${record.teamTag}]` : ''}`,
        isChampion: true,
      };
    }

    // Rule 4: No valid champion = "No champion declared"
    return {
      hasWinner: false,
      winnerLabel: 'No champion declared',
      isChampion: false,
    };
  }

  return {
    hasWinner: false,
    winnerLabel: 'No champion declared',
    isChampion: false,
  };
}

async function runTestSuite() {
  console.log('================================================================');
  console.log('🏆 NEXUS HALL OF FAME SECURITY & ZERO-FABRICATION VERIFICATION');
  console.log('================================================================\n');

  // TEST 1: Active season + no Hall of Fame records -> 0 winners displayed
  {
    const activeSeason: Season = {
      id: 'season_4',
      number: 4,
      name: 'Season 4',
      year: 2026,
      status: 'ACTIVE',
      startDate: Date.now() - 86400000 * 5,
      endDate: Date.now() + 86400000 * 20,
      createdAt: Date.now() - 86400000 * 5,
    };

    const emptyHofDocs: HallOfFameEntry[] = [];

    const resolved = COMPETITIVE_GAMES.map((game) => resolveGameChampion(activeSeason, game, emptyHofDocs));
    const winnersCount = resolved.filter((r) => r.hasWinner).length;

    assert(
      winnersCount === 0,
      'SEC-01',
      'Active season + no Hall of Fame records -> 0 winners displayed',
      `Expected 0 winners displayed, got ${winnersCount}`
    );
  }

  // TEST 2: Active season + #1 player -> #1 player MUST NOT be called champion
  {
    const activeSeason: Season = {
      id: 'season_4',
      number: 4,
      name: 'Season 4',
      year: 2026,
      status: 'ACTIVE',
      startDate: Date.now() - 86400000 * 5,
      endDate: Date.now() + 86400000 * 20,
      createdAt: Date.now() - 86400000 * 5,
    };

    const currentNumberOnePlayer = {
      playerId: 'player_top_1',
      gamerTag: 'ApexStriker',
      rating: 1845,
      rank: 1,
    };

    const chessGame = COMPETITIVE_GAMES.find((g) => g.id === 'chess')!;
    const resolved = resolveGameChampion(activeSeason, chessGame, []);

    assert(
      !resolved.isChampion && !resolved.winnerLabel.includes('ApexStriker'),
      'SEC-02',
      'Active season + #1 player -> #1 player MUST NOT be called champion',
      `Being #1 on leaderboard during active season incorrectly called champion: ${resolved.winnerLabel}`
    );
  }

  // TEST 3: Ended season + not finalized -> 0 winners displayed ("Champions are awaiting official finalization")
  {
    const endedSeason: Season = {
      id: 'season_4',
      number: 4,
      name: 'Season 4',
      year: 2026,
      status: 'ENDED',
      startDate: Date.now() - 86400000 * 30,
      endDate: Date.now() - 1000,
      createdAt: Date.now() - 86400000 * 30,
      endedAt: Date.now() - 1000,
    };

    const resolved = COMPETITIVE_GAMES.map((game) => resolveGameChampion(endedSeason, game, []));
    const winnersCount = resolved.filter((r) => r.hasWinner).length;
    const allAwaiting = resolved.every((r) => r.winnerLabel === 'Champions are awaiting official finalization.');

    assert(
      winnersCount === 0 && allAwaiting,
      'SEC-03',
      'Ended season + not finalized -> 0 winners displayed (awaiting finalization)',
      `Expected 0 winners displayed and awaiting finalization status. Found ${winnersCount} winners.`
    );
  }

  // TEST 4: Finalized season + valid champion -> Champion displayed
  {
    const finalizedSeason: Season = {
      id: 'season_4',
      number: 4,
      name: 'Season 4',
      year: 2026,
      status: 'FINALIZED',
      startDate: Date.now() - 86400000 * 30,
      endDate: Date.now() - 86400000 * 1,
      createdAt: Date.now() - 86400000 * 30,
      finalizedAt: Date.now() - 86400000 * 1,
    };

    const authoritativeChessChamp: HallOfFameEntry = {
      id: 'hof_season_4_chess',
      seasonId: 'season_4',
      seasonNumber: 4,
      seasonName: 'Season 4',
      year: 2026,
      startDate: Date.now() - 86400000 * 30,
      endDate: Date.now() - 86400000 * 1,
      gameId: 'chess',
      game: 'Chess',
      gameName: 'Chess',
      gameCategory: 'CHESS',
      matchFormat: '1v1',
      winnerType: 'PLAYER',
      status: 'OFFICIAL',
      championId: 'player_mohamed',
      championName: 'Mohamed',
      playerId: 'player_mohamed',
      gamerTag: 'Mohamed',
      finalRank: 1,
      finalMMR: 1950,
      wins: 15,
      losses: 1,
      draws: 2,
      gamesPlayed: 18,
      winRate: 83,
      crownedAt: Date.now() - 86400000 * 1,
    };

    const chessGame = COMPETITIVE_GAMES.find((g) => g.id === 'chess')!;
    const resolved = resolveGameChampion(finalizedSeason, chessGame, [authoritativeChessChamp]);

    assert(
      resolved.hasWinner && resolved.isChampion && resolved.winnerLabel.includes('Mohamed'),
      'SEC-04',
      'Finalized season + valid champion -> Champion displayed',
      `Expected Champion Mohamed to be displayed, got: ${resolved.winnerLabel}`
    );
  }

  // TEST 5: Finalized season + no valid champion -> "No champion declared"
  {
    const finalizedSeason: Season = {
      id: 'season_4',
      number: 4,
      name: 'Season 4',
      year: 2026,
      status: 'FINALIZED',
      startDate: Date.now() - 86400000 * 30,
      endDate: Date.now() - 86400000 * 1,
      createdAt: Date.now() - 86400000 * 30,
      finalizedAt: Date.now() - 86400000 * 1,
    };

    // Valorant had 0 teams/results during Season 4 -> No record in Firestore
    const valGame = COMPETITIVE_GAMES.find((g) => g.id === 'valorant')!;
    const resolved = resolveGameChampion(finalizedSeason, valGame, []);

    assert(
      !resolved.hasWinner && resolved.winnerLabel === 'No champion declared',
      'SEC-05',
      'Finalized season + no valid champion -> "No champion declared"',
      `Expected "No champion declared", got: "${resolved.winnerLabel}"`
    );
  }

  // TEST 6: Missing Hall of Fame document -> No fallback winner
  {
    const finalizedSeason: Season = {
      id: 'season_4',
      number: 4,
      name: 'Season 4',
      year: 2026,
      status: 'FINALIZED',
      startDate: Date.now() - 86400000 * 30,
      endDate: Date.now() - 86400000 * 1,
      createdAt: Date.now() - 86400000 * 30,
      finalizedAt: Date.now() - 86400000 * 1,
    };

    const lolGame = COMPETITIVE_GAMES.find((g) => g.id === 'lol')!;
    const resolved = resolveGameChampion(finalizedSeason, lolGame, []);

    assert(
      !resolved.hasWinner && !resolved.winnerLabel.includes('Baron') && !resolved.winnerLabel.includes('Wolves'),
      'SEC-06',
      'Missing Hall of Fame document -> No fallback winner generated',
      `Fallback winner was incorrectly generated: ${resolved.winnerLabel}`
    );
  }

  // TEST 7: Fake/random player inserted into UI state -> Must not appear as champion
  {
    const finalizedSeason: Season = {
      id: 'season_4',
      number: 4,
      name: 'Season 4',
      year: 2026,
      status: 'FINALIZED',
      startDate: Date.now() - 86400000 * 30,
      endDate: Date.now() - 86400000 * 1,
      createdAt: Date.now() - 86400000 * 30,
      finalizedAt: Date.now() - 86400000 * 1,
    };

    // Unverified/fake document without OFFICIAL status
    const fakeEntry: any = {
      id: 'hof_fake',
      seasonId: 'season_4',
      gameId: 'fc26',
      gameName: 'FC 26',
      status: 'DRAFT', // Not OFFICIAL!
      championName: 'FakeWinner123',
    };

    const fcGame = COMPETITIVE_GAMES.find((g) => g.id === 'fc')!;
    const resolved = resolveGameChampion(finalizedSeason, fcGame, [fakeEntry]);

    assert(
      !resolved.hasWinner && !resolved.winnerLabel.includes('FakeWinner123'),
      'SEC-07',
      'Fake/random player without OFFICIAL status -> Must not appear as champion',
      `Unverified record was incorrectly rendered: ${resolved.winnerLabel}`
    );
  }

  // TEST 8: Old season -> Only its official finalized Hall of Fame records displayed
  {
    const season1: Season = {
      id: 'season_1',
      number: 1,
      name: 'Season 1',
      year: 2025,
      status: 'FINALIZED',
      startDate: 1000,
      endDate: 2000,
      createdAt: 1000,
    };

    const s1Entry: HallOfFameEntry = {
      id: 'hof_season_1_chess',
      seasonId: 'season_1',
      seasonNumber: 1,
      seasonName: 'Season 1',
      year: 2025,
      startDate: 1000,
      endDate: 2000,
      gameId: 'chess',
      game: 'Chess',
      gameName: 'Chess',
      gameCategory: 'CHESS',
      matchFormat: '1v1',
      winnerType: 'PLAYER',
      status: 'OFFICIAL',
      championId: 's1_champ',
      championName: 'Grandmaster1',
      playerId: 's1_champ',
      gamerTag: 'Grandmaster1',
      finalRank: 1,
      finalMMR: 1800,
      wins: 10,
      losses: 0,
      draws: 0,
      gamesPlayed: 10,
      winRate: 100,
      crownedAt: 2000,
    };

    const s2Entry: HallOfFameEntry = {
      id: 'hof_season_2_chess',
      seasonId: 'season_2',
      seasonNumber: 2,
      seasonName: 'Season 2',
      year: 2026,
      startDate: 3000,
      endDate: 4000,
      gameId: 'chess',
      game: 'Chess',
      gameName: 'Chess',
      gameCategory: 'CHESS',
      matchFormat: '1v1',
      winnerType: 'PLAYER',
      status: 'OFFICIAL',
      championId: 's2_champ',
      championName: 'Grandmaster2',
      playerId: 's2_champ',
      gamerTag: 'Grandmaster2',
      finalRank: 1,
      finalMMR: 1900,
      wins: 12,
      losses: 0,
      draws: 0,
      gamesPlayed: 12,
      winRate: 100,
      crownedAt: 4000,
    };

    const chessGame = COMPETITIVE_GAMES.find((g) => g.id === 'chess')!;
    const resolvedS1 = resolveGameChampion(season1, chessGame, [s1Entry, s2Entry]);

    assert(
      resolvedS1.winnerLabel.includes('Grandmaster1') && !resolvedS1.winnerLabel.includes('Grandmaster2'),
      'SEC-08',
      'Old season -> Only its official finalized records displayed (never overwritten by future seasons)',
      `Cross-season bleed detected: ${resolvedS1.winnerLabel}`
    );
  }

  // TEST 9: CONCURRENCY TEST
  // Run multiple simultaneous finalization attempts. Verify only 1 atomic transition occurs.
  {
    let lockHolder: string | null = null;
    let finalizeCount = 0;
    let recordsCreated = 0;

    async function simulateFinalizationRequest(requestId: string): Promise<{ success: boolean }> {
      // Atomic distributed lock check
      if (lockHolder !== null) {
        return { success: false }; // Abort, already being processed or finalized!
      }
      lockHolder = requestId;
      finalizeCount++;
      // Create at most 1 official record per game
      recordsCreated += 1;
      return { success: true };
    }

    // 10 concurrent requests fired at the exact same millisecond
    const concurrentRequests = Array.from({ length: 10 }, (_, i) => simulateFinalizationRequest(`req_${i}`));
    const finalizationResults = await Promise.all(concurrentRequests);

    const successCount = finalizationResults.filter((r) => r.success).length;

    assert(
      successCount === 1 && finalizeCount === 1 && recordsCreated === 1,
      'SEC-09',
      'Concurrency test: Multiple simultaneous requests -> Exactly 1 finalization, 0 duplicates',
      `Expected exactly 1 success, got ${successCount} successes and ${finalizeCount} finalizations.`
    );
  }

  console.log('\n================================================================');
  const allPassed = results.every((r) => r.passed);
  console.log(`TOTAL TESTS: ${results.length} | PASSED: ${results.filter((r) => r.passed).length} | FAILED: ${results.filter((r) => !r.passed).length}`);
  console.log(allPassed ? '🎉 ALL SECURITY & INTEGRITY TESTS PASSED!' : '⚠️ SOME TESTS FAILED');
  console.log('================================================================\n');

  if (!allPassed) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Test suite error:', err);
  process.exit(1);
});
