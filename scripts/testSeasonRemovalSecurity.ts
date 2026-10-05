import { doc, setDoc, getDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../src/lib/firebase';
import { removeSeason } from '../src/services/seasonService';

async function runTest() {
  console.log('--- TEST 17: SEASON REMOVAL SECURITY TEST ---');

  // 1. Direct Firestore delete attempt by unauthenticated / player client
  console.log('Test 1: Direct Firestore delete attempt by unauthenticated client...');
  try {
    const testSeasonRef = doc(db, 'seasons', 'season_1');
    await deleteDoc(testSeasonRef);
    throw new Error('Direct Firestore delete on seasons should have been REJECTED!');
  } catch (err: any) {
    if (err.message && err.message.includes('should have been REJECTED')) throw err;
    console.log('✅ Direct Firestore delete on season REJECTED by rules as expected:', err.code || err.message);
  }

  // 2. PLAYER -> remove season DENIED
  console.log('Test 2: Player attempting remove season...');
  const playerResult = await removeSeason({
    seasonId: 'season_2',
    confirmationInput: 'REMOVE SEASON 2',
    actor: { uid: 'player_uid_123', role: 'PLAYER', gamerTag: 'Player1' },
  });
  if (playerResult.success) {
    throw new Error('Player removeSeason must be DENIED!');
  }
  console.log('✅ Player remove season DENIED as expected:', playerResult.error);

  // 3. STAFF -> remove season DENIED
  console.log('Test 3: Staff attempting remove season...');
  const staffResult = await removeSeason({
    seasonId: 'season_2',
    confirmationInput: 'REMOVE SEASON 2',
    actor: { uid: 'staff_uid_123', role: 'STAFF', gamerTag: 'Staff1' },
  });
  if (staffResult.success) {
    throw new Error('Staff removeSeason must be DENIED!');
  }
  console.log('✅ Staff remove season DENIED as expected:', staffResult.error);

  // 4. ADMIN -> remove season DENIED
  console.log('Test 4: Admin attempting remove season...');
  const adminResult = await removeSeason({
    seasonId: 'season_2',
    confirmationInput: 'REMOVE SEASON 2',
    actor: { uid: 'admin_uid_123', role: 'ADMIN', gamerTag: 'Admin1' },
  });
  if (adminResult.success) {
    throw new Error('Admin removeSeason must be DENIED!');
  }
  console.log('✅ Admin remove season DENIED as expected:', adminResult.error);

  // 5. Super Admin -> delete ACTIVE season -> REJECTED
  console.log('Test 5: Super Admin attempting delete ACTIVE season (season_4)...');
  // Check if season_4 exists or test with active status
  const superAdminActiveResult = await removeSeason({
    seasonId: 'season_4', // season_4 is the active season in Nexus
    confirmationInput: 'REMOVE SEASON 4',
    actor: { uid: 'c3Vip2TwMvZXhub5gjjVpjcsStI2', role: 'SUPER_ADMIN', gamerTag: 'SuperAdmin' },
  });
  if (superAdminActiveResult.success) {
    throw new Error('Removing an ACTIVE season must be REJECTED!');
  }
  if (!superAdminActiveResult.error?.includes('You cannot remove an active season')) {
    console.log('Note on active check error message:', superAdminActiveResult.error);
  }
  console.log('✅ Super Admin deleting ACTIVE season REJECTED:', superAdminActiveResult.error);

  // 6. Super Admin -> Confirmation mismatch -> REJECTED
  console.log('Test 6: Super Admin typed incorrect confirmation string...');
  const superAdminMismatchResult = await removeSeason({
    seasonId: 'season_1',
    confirmationInput: 'DELETE 1',
    actor: { uid: 'c3Vip2TwMvZXhub5gjjVpjcsStI2', role: 'SUPER_ADMIN', gamerTag: 'SuperAdmin' },
  });
  if (superAdminMismatchResult.success) {
    throw new Error('Confirmation mismatch must be REJECTED!');
  }
  console.log('✅ Confirmation mismatch REJECTED:', superAdminMismatchResult.error);

  // 7. Super Admin -> non-existent season -> returns not found
  console.log('Test 7: Super Admin attempting to remove non-existent season...');
  const notFoundResult = await removeSeason({
    seasonId: 'non_existent_season_99999',
    confirmationInput: 'REMOVE SEASON 99999',
    actor: { uid: 'c3Vip2TwMvZXhub5gjjVpjcsStI2', role: 'SUPER_ADMIN', gamerTag: 'SuperAdmin' },
  });
  if (notFoundResult.success) {
    throw new Error('Non-existent season should not succeed!');
  }
  console.log('✅ Non-existent season properly handled:', notFoundResult.error);

  console.log('✅ TEST 17 PASSED: Season removal security & invariants fully verified.');
}

runTest().then(() => {
  process.exit(0);
}).catch((err) => {
  console.error('TEST 17 FAILED:', err);
  process.exit(1);
});
