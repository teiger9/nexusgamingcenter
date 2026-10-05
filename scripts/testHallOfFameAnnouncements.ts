/**
 * NEXUS GAMING CENTER
 * TEST SUITE: OFFICIAL HALL OF FAME ANNOUNCEMENTS VERIFICATION
 *
 * Explicit tests verifying all 10 security invariants:
 * 1. Active season + no champion -> 0 winner names displayed
 * 2. Ended season + no Hall of Fame record -> 0 winner names displayed
 * 3. Finalized season + official record -> Correct champion displayed
 * 4. FC EA record -> Not displayed
 * 5. FC26 record -> Not displayed as a separate category
 * 6. FC27 record -> Not displayed as a separate category
 * 7. No record + random player available -> Random player MUST NOT be displayed
 * 8. No record + #1 ranked player available -> #1 player MUST NOT be displayed
 * 9. Missing championId -> No announcement
 * 10. Invalid/deleted championId -> No announcement
 */

import { Season, HallOfFameEntry } from '../src/types';
import { COMPETITIVE_GAMES } from '../src/lib/ranks';
import {
  isAuthoritativeHofRecord,
  findAuthoritativeHofRecord,
  resolveAuthoritativeAnnouncementFeed,
} from '../src/lib/hallOfFameAnnouncements';

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

async function runTests() {
  console.log('================================================================');
  console.log('🏆 NEXUS OFFICIAL HALL OF FAME ANNOUNCEMENTS SECURITY VERIFICATION');
  console.log('================================================================\n');

  const fcGame = COMPETITIVE_GAMES.find((g) => g.id === 'fc')!;
  const chessGame = COMPETITIVE_GAMES.find((g) => g.id === 'chess')!;

  // -------------------------------------------------------------------------
  // TEST 1: Active season + no champion -> 0 winner names displayed
  // -------------------------------------------------------------------------
  {
    const activeSeason: Season = {
      id: 'season_active_100',
      number: 100,
      name: 'Season 100',
      year: 2026,
      status: 'ACTIVE',
      startDate: Date.now() - 100000,
      endDate: Date.now() + 1000000,
      createdAt: Date.now(),
    };

    const feed = resolveAuthoritativeAnnouncementFeed({
      seasons: [activeSeason],
      hofEntries: [],
    });

    assert(
      Boolean(feed.activeNotice?.show) &&
      feed.activeNotice?.headline === 'The season is still active.' &&
      feed.activeNotice?.subheadline === 'No champion has been declared yet.' &&
      feed.announcements.length === 0,
      'ANN-01',
      'Active season + no champion -> 0 winner names displayed',
      `Expected active notice with 0 announcements, got ${feed.announcements.length} announcements`
    );
  }

  // -------------------------------------------------------------------------
  // TEST 2: Ended season + no Hall of Fame record -> 0 winner names displayed
  // -------------------------------------------------------------------------
  {
    const endedSeason: Season = {
      id: 'season_ended_101',
      number: 101,
      name: 'Season 101',
      year: 2026,
      status: 'ENDED',
      startDate: Date.now() - 5000000,
      endDate: Date.now() - 100000,
      createdAt: Date.now() - 5000000,
    };

    const feed = resolveAuthoritativeAnnouncementFeed({
      seasons: [endedSeason],
      hofEntries: [],
    });

    assert(
      Boolean(feed.endedUnfinalizedNotice?.show) &&
      feed.endedUnfinalizedNotice?.headline === 'Season ended.' &&
      feed.endedUnfinalizedNotice?.subheadline === 'Official champions have not been declared yet.' &&
      feed.announcements.length === 0,
      'ANN-02',
      'Ended season + no Hall of Fame record -> 0 winner names displayed',
      `Expected ended notice with 0 announcements, got ${feed.announcements.length} announcements`
    );
  }

  // -------------------------------------------------------------------------
  // TEST 3: Finalized season + official record -> Correct champion displayed
  // -------------------------------------------------------------------------
  {
    const finalizedSeason: Season = {
      id: 'season_final_102',
      number: 4,
      name: 'Season 4',
      year: 2026,
      status: 'FINALIZED',
      startDate: Date.now() - 10000000,
      endDate: Date.now() - 5000000,
      createdAt: Date.now() - 10000000,
    };

    const officialRecord: HallOfFameEntry = {
      id: 'hof_season_final_102_fc',
      seasonId: 'season_final_102',
      seasonNumber: 4,
      seasonName: 'Season 4',
      year: 2026,
      startDate: Date.now() - 10000000,
      endDate: Date.now() - 5000000,
      gameId: 'fc',
      gameName: 'FC',
      gameCategory: 'FC',
      status: 'OFFICIAL',
      championId: 'player_mohamed_uid',
      championName: 'Mohamed',
      playerId: 'player_mohamed_uid',
      winnerId: 'player_mohamed_uid',
      gamerTag: 'Mohamed',
      finalRank: 1,
      finalMMR: 1850,
      wins: 15,
      losses: 2,
      draws: 1,
      gamesPlayed: 18,
      winRate: 83,
      crownedAt: Date.now() - 5000000,
    };

    const feed = resolveAuthoritativeAnnouncementFeed({
      seasons: [finalizedSeason],
      hofEntries: [officialRecord],
    });

    assert(
      feed.announcements.length === 1 &&
      feed.announcements[0].championName === 'Mohamed' &&
      feed.announcements[0].gameName === 'FC' &&
      feed.announcements[0].seasonGameLabel === 'Season 4 — FC' &&
      feed.announcements[0].title === '🏆 OFFICIAL HALL OF FAME' &&
      feed.announcements[0].declarationText === 'Officially declared by Nexus Gaming Center.',
      'ANN-03',
      'Finalized season + official record -> Correct champion displayed with exact format',
      `Announcement output: ${JSON.stringify(feed.announcements[0])}`
    );
  }

  // -------------------------------------------------------------------------
  // TEST 4: FC EA record -> Not displayed
  // -------------------------------------------------------------------------
  {
    const finalizedSeason: Season = {
      id: 'season_final_103',
      number: 3,
      name: 'Season 3',
      year: 2026,
      status: 'FINALIZED',
      startDate: Date.now() - 10000000,
      endDate: Date.now() - 5000000,
      createdAt: Date.now() - 10000000,
    };

    const eaFcRecord: HallOfFameEntry = {
      id: 'hof_season_3_ea-fc',
      seasonId: 'season_final_103',
      seasonNumber: 3,
      seasonName: 'Season 3',
      year: 2026,
      startDate: Date.now() - 10000000,
      endDate: Date.now() - 5000000,
      gameId: 'ea-fc',
      gameName: 'EA FC',
      gameCategory: 'PS5',
      status: 'OFFICIAL',
      championId: 'player_ea_seed',
      championName: 'KylianStrike',
      playerId: 'player_ea_seed',
      winnerId: 'player_ea_seed',
      gamerTag: 'KylianStrike',
      finalRank: 1,
      finalMMR: 1642,
      wins: 12,
      losses: 2,
      draws: 0,
      gamesPlayed: 14,
      winRate: 86,
      crownedAt: Date.now(),
    };

    const feed = resolveAuthoritativeAnnouncementFeed({
      seasons: [finalizedSeason],
      hofEntries: [eaFcRecord],
    });

    assert(
      feed.announcements.length === 0,
      'ANN-04',
      'FC EA record -> Not displayed (0 announcements generated)',
      `Expected 0 announcements for FC EA record, got: ${feed.announcements.length}`
    );
  }

  // -------------------------------------------------------------------------
  // TEST 5 & 6: FC26 and FC27 -> Not displayed as separate categories
  // -------------------------------------------------------------------------
  {
    const finalizedSeason: Season = {
      id: 'season_final_104',
      number: 2,
      name: 'Season 2',
      year: 2026,
      status: 'FINALIZED',
      startDate: Date.now() - 10000000,
      endDate: Date.now() - 5000000,
      createdAt: Date.now() - 10000000,
    };

    const fc26Record: HallOfFameEntry = {
      id: 'hof_season_2_fc26',
      seasonId: 'season_final_104',
      seasonNumber: 2,
      seasonName: 'Season 2',
      year: 2026,
      startDate: Date.now() - 10000000,
      endDate: Date.now() - 5000000,
      gameId: 'fc26',
      gameName: 'FC 26',
      gameCategory: 'PS5',
      status: 'OFFICIAL',
      championId: 'player_fc26',
      championName: 'Striker26',
      playerId: 'player_fc26',
      winnerId: 'player_fc26',
      gamerTag: 'Striker26',
      finalRank: 1,
      finalMMR: 1100,
      wins: 2,
      losses: 0,
      draws: 0,
      gamesPlayed: 2,
      winRate: 100,
      crownedAt: Date.now(),
    };

    const fc27Record: HallOfFameEntry = {
      id: 'hof_season_2_fc27',
      seasonId: 'season_final_104',
      seasonNumber: 2,
      seasonName: 'Season 2',
      year: 2026,
      startDate: Date.now() - 10000000,
      endDate: Date.now() - 5000000,
      gameId: 'fc27',
      gameName: 'FC 27',
      gameCategory: 'PS5',
      status: 'OFFICIAL',
      championId: 'player_fc27',
      championName: 'Legend27',
      playerId: 'player_fc27',
      winnerId: 'player_fc27',
      gamerTag: 'Legend27',
      finalRank: 1,
      finalMMR: 1250,
      wins: 5,
      losses: 0,
      draws: 0,
      gamesPlayed: 5,
      winRate: 100,
      crownedAt: Date.now(),
    };

    const feed = resolveAuthoritativeAnnouncementFeed({
      seasons: [finalizedSeason],
      hofEntries: [fc26Record, fc27Record],
    });

    const hasFc26 = feed.announcements.some((a) => a.gameName === 'FC 26' || a.gameId === 'fc26');
    const hasFc27 = feed.announcements.some((a) => a.gameName === 'FC 27' || a.gameId === 'fc27');
    const fcAnnouncements = feed.announcements.filter((a) => a.gameId === 'fc');

    assert(
      !hasFc26 && !hasFc27 && fcAnnouncements.length === 1 && fcAnnouncements[0].gameName === 'FC',
      'ANN-05-06',
      'FC26 and FC27 -> Unified into exactly ONE "FC" announcement, no separate categories',
      `Found FC announcements: ${JSON.stringify(feed.announcements.map((a) => a.gameName))}`
    );
  }

  // -------------------------------------------------------------------------
  // TEST 7: No record + random player available -> Random player MUST NOT be displayed
  // -------------------------------------------------------------------------
  {
    const finalizedSeason: Season = {
      id: 'season_final_105',
      number: 5,
      name: 'Season 5',
      year: 2026,
      status: 'FINALIZED',
      startDate: Date.now() - 10000000,
      endDate: Date.now() - 5000000,
      createdAt: Date.now() - 10000000,
    };

    // No record exists in hofEntries
    const feed = resolveAuthoritativeAnnouncementFeed({
      seasons: [finalizedSeason],
      hofEntries: [],
    });

    assert(
      feed.announcements.length === 0,
      'ANN-07',
      'No record + random player available -> Random player MUST NOT be displayed',
      `Expected 0 announcements, got ${feed.announcements.length}`
    );
  }

  // -------------------------------------------------------------------------
  // TEST 8: No record + #1 ranked player available -> #1 player MUST NOT be displayed
  // -------------------------------------------------------------------------
  {
    const finalizedSeason: Season = {
      id: 'season_final_106',
      number: 6,
      name: 'Season 6',
      year: 2026,
      status: 'FINALIZED',
      startDate: Date.now() - 10000000,
      endDate: Date.now() - 5000000,
      createdAt: Date.now() - 10000000,
    };

    // Attempting to inject a non-official / draft / fake leader record
    const draftLeaderEntry: any = {
      id: 'draft_leader_entry',
      seasonId: 'season_final_106',
      seasonNumber: 6,
      seasonName: 'Season 6',
      year: 2026,
      startDate: Date.now() - 10000000,
      endDate: Date.now() - 5000000,
      gameId: 'fc',
      gameName: 'FC',
      gameCategory: 'FC',
      status: 'DRAFT', // NOT OFFICIAL!
      championId: 'current_rank_1_player',
      championName: 'ActiveLadderLeader',
      playerId: 'current_rank_1_player',
      winnerId: 'current_rank_1_player',
      gamerTag: 'ActiveLadderLeader',
      finalRank: 1,
      finalMMR: 2400,
      wins: 20,
      losses: 0,
      draws: 0,
      gamesPlayed: 20,
      winRate: 100,
      crownedAt: Date.now(),
    };

    const feed = resolveAuthoritativeAnnouncementFeed({
      seasons: [finalizedSeason],
      hofEntries: [draftLeaderEntry],
    });

    assert(
      feed.announcements.length === 0,
      'ANN-08',
      'No official record + #1 ranked player available -> #1 player MUST NOT be displayed',
      `Unverified leader was incorrectly announced: ${JSON.stringify(feed.announcements)}`
    );
  }

  // -------------------------------------------------------------------------
  // TEST 9: Missing championId -> No announcement
  // -------------------------------------------------------------------------
  {
    const missingChampRecord: HallOfFameEntry = {
      id: 'missing_champ_record',
      seasonId: 'season_final_107',
      seasonNumber: 7,
      seasonName: 'Season 7',
      year: 2026,
      startDate: 1000,
      endDate: 2000,
      gameId: 'chess',
      gameName: 'Chess',
      gameCategory: 'CHESS',
      status: 'OFFICIAL',
      championId: '', // EMPTY!
      championName: 'GhostPlayer',
      playerId: '',
      winnerId: '',
      gamerTag: 'GhostPlayer',
      finalRank: 1,
      finalMMR: 1200,
      wins: 5,
      losses: 1,
      draws: 0,
      gamesPlayed: 6,
      winRate: 83,
      crownedAt: Date.now(),
    };

    const isAuth = isAuthoritativeHofRecord(missingChampRecord);
    const resolved = findAuthoritativeHofRecord([missingChampRecord], 'season_final_107', chessGame);

    assert(
      !isAuth && resolved === null,
      'ANN-09',
      'Missing championId -> No announcement',
      `Record with missing championId was marked authoritative: ${isAuth}`
    );
  }

  // -------------------------------------------------------------------------
  // TEST 10: Invalid / deleted championId -> No announcement
  // -------------------------------------------------------------------------
  {
    const invalidChampRecord: HallOfFameEntry = {
      id: 'invalid_champ_record',
      seasonId: 'season_final_108',
      seasonNumber: 8,
      seasonName: 'Season 8',
      year: 2026,
      startDate: 1000,
      endDate: 2000,
      gameId: 'chess',
      gameName: 'Chess',
      gameCategory: 'CHESS',
      status: 'OFFICIAL',
      championId: 'undefined', // Literal "undefined" or "null" string
      championName: 'DeletedUser',
      playerId: 'undefined',
      winnerId: 'undefined',
      gamerTag: 'DeletedUser',
      finalRank: 1,
      finalMMR: 1200,
      wins: 5,
      losses: 1,
      draws: 0,
      gamesPlayed: 6,
      winRate: 83,
      crownedAt: Date.now(),
    };

    const isAuth = isAuthoritativeHofRecord(invalidChampRecord);
    const resolved = findAuthoritativeHofRecord([invalidChampRecord], 'season_final_108', chessGame);

    assert(
      !isAuth && resolved === null,
      'ANN-10',
      'Invalid / deleted championId ("undefined" / "null") -> No announcement',
      `Invalid championId record was accepted: ${isAuth}`
    );
  }

  // -------------------------------------------------------------------------
  // TEST 11: Removed games -> Strictly rejected from announcements
  // -------------------------------------------------------------------------
  {
    const removedGames = ['Tekken', 'Rocket League', 'Mortal Kombat', 'Fortnite', 'Call of Duty'];
    let anyAccepted = false;

    for (const rg of removedGames) {
      const removedRecord: HallOfFameEntry = {
        id: `hof_removed_${rg}`,
        seasonId: 'season_final_109',
        seasonNumber: 9,
        seasonName: 'Season 9',
        year: 2026,
        startDate: 1000,
        endDate: 2000,
        gameId: rg.toLowerCase().replace(/ /g, '_'),
        gameName: rg,
        gameCategory: 'PC',
        status: 'OFFICIAL',
        championId: 'valid_uid_123',
        championName: 'SomePlayer',
        playerId: 'valid_uid_123',
        winnerId: 'valid_uid_123',
        gamerTag: 'SomePlayer',
        finalRank: 1,
        finalMMR: 1500,
        wins: 10,
        losses: 0,
        draws: 0,
        gamesPlayed: 10,
        winRate: 100,
        crownedAt: Date.now(),
      };

      if (isAuthoritativeHofRecord(removedRecord)) {
        anyAccepted = true;
        console.error(`Removed game ${rg} was accepted as authoritative!`);
      }
    }

    assert(
      !anyAccepted,
      'ANN-11',
      'Removed games (Tekken, Rocket League, Mortal Kombat, Fortnite, Call of Duty) -> Strictly rejected from announcements',
      'One or more removed games were accepted'
    );
  }

  console.log('\n================================================================');
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log(`TOTAL TESTS: ${total} | PASSED: ${passed} | FAILED: ${failed}`);
  if (failed === 0) {
    console.log('🎉 ALL OFFICIAL HALL OF FAME ANNOUNCEMENT TESTS PASSED!');
  } else {
    throw new Error(`${failed} tests failed!`);
  }
  console.log('================================================================\n');
}

runTests().then(() => {
  process.exit(0);
}).catch((err) => {
  console.error('TEST SUITE FAILED:', err);
  process.exit(1);
});
