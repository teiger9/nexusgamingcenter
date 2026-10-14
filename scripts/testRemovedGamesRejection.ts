import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../src/lib/firebase';
import { normalizeRankingGame } from '../src/lib/ranks';

async function runTest() {
  console.log('--- TEST 16: ATTEMPT TO CREATE RANKING RECORDS FOR REMOVED GAMES ---');

  const removedGames = [
    { gameId: 'tekken', gameName: 'Tekken', gameCategory: 'TEKKEN' },
    { gameId: 'rocket_league', gameName: 'Rocket League', gameCategory: 'ROCKET_LEAGUE' },
    { gameId: 'mortal_kombat', gameName: 'Mortal Kombat', gameCategory: 'MORTAL_KOMBAT' },
    { gameId: 'fortnite', gameName: 'Fortnite', gameCategory: 'FORTNITE' },
    { gameId: 'call_of_duty', gameName: 'Call of Duty', gameCategory: 'CALL_OF_DUTY' },
    { gameId: 'fc26', gameName: 'FC 26', gameCategory: 'FC26' },
    { gameId: 'fc27', gameName: 'FC 27', gameCategory: 'FC27' },
  ];

  // 1. Verify code-level normalization rejects these
  for (const rg of removedGames) {
    const norm = normalizeRankingGame(rg.gameName);
    if (rg.gameId.startsWith('fc')) {
      // Normalizes to unified FC
      if (norm.gameId !== 'fc' || norm.gameCategory !== 'FC') {
        throw new Error(`Expected ${rg.gameId} to normalize to FC, got ${norm.gameId}`);
      }
      console.log(`✅ ${rg.gameName} normalized to unified FC (${norm.gameCategory})`);
    } else {
      if (norm.supported) {
        throw new Error(`Expected removed game ${rg.gameName} to be unsupported, but got supported=true`);
      }
      console.log(`✅ ${rg.gameName} properly rejected as unsupported.`);
    }
  }

  // 2. Direct Firestore write attempts as unauthenticated/player client
  for (const rg of removedGames) {
    const testDocId = `test_reject_${rg.gameId}_${Date.now()}`;
    const testRef = doc(db, 'playerGameRatings', testDocId);

    try {
      await setDoc(testRef, {
        id: testDocId,
        playerId: 'test_player_reject',
        gameId: rg.gameId,
        gameName: rg.gameName,
        gameCategory: rg.gameCategory,
        rating: 1200,
        wins: 1,
        losses: 0,
        updatedAt: Date.now(),
      });

      // If write somehow succeeded, cleanup and fail
      await deleteDoc(testRef).catch(() => {});
      throw new Error(`Direct write for ${rg.gameName} should have been REJECTED by Firestore rules!`);
    } catch (err: any) {
      if (err.message && err.message.includes('should have been REJECTED')) {
        throw err;
      }
      console.log(`✅ Direct Firestore create for "${rg.gameName}" (gameId: ${rg.gameId}) REJECTED as expected:`, err.code || err.message);
    }
  }

  console.log('✅ TEST 16 PASSED: All removed games rejected.');
}

runTest().then(() => {
  process.exit(0);
}).catch((err) => {
  console.error('TEST 16 FAILED:', err);
  process.exit(1);
});
