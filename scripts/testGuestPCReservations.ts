/**
 * Verification Script: Test Guest PC Reservations Flow and Security
 */

import { executeGuestReservation, lookupGuestReservations } from '../src/services/guestReservationService';
import { assertAuthorizedStaff } from '../src/services/reservationService';
import { collection, getDocs, doc, getDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../src/lib/firebase';

async function runTests() {
  console.log('=== STARTING GUEST PC RESERVATION AUDIT ===\n');
  const createdIds: string[] = [];

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(15, 0, 0, 0);
  const startAt = tomorrow.getTime();

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Validation - Invalid phone number should be rejected
    // -------------------------------------------------------------------------
    console.log('[TEST 1] Validation: Invalid phone number rejection');
    const res1 = await executeGuestReservation({
      fullName: 'Test Guest',
      phoneNumber: '123', // Invalid
      reservationType: 'GROUP_10_PC',
      requestedPcCount: 10,
      startAt,
      durationHours: 2,
    });
    if (!res1.success && res1.error?.includes('valid phone number')) {
      console.log('  PASSED: Short/invalid phone number properly rejected.');
    } else {
      throw new Error(`TEST 1 FAILED: Expected invalid phone error, got: ${JSON.stringify(res1)}`);
    }

    // -------------------------------------------------------------------------
    // TEST 2: Validation - Missing full name should be rejected
    // -------------------------------------------------------------------------
    console.log('\n[TEST 2] Validation: Missing full name rejection');
    const res2 = await executeGuestReservation({
      fullName: '   ', // Invalid
      phoneNumber: '0555123456',
      reservationType: 'GROUP_10_PC',
      requestedPcCount: 10,
      startAt,
      durationHours: 2,
    });
    if (!res2.success && res2.error?.includes('full name')) {
      console.log('  PASSED: Empty full name properly rejected.');
    } else {
      throw new Error(`TEST 2 FAILED: Expected full name error, got: ${JSON.stringify(res2)}`);
    }

    // -------------------------------------------------------------------------
    // TEST 3: Validation - Invalid PC count (must be 8, 9, or 10)
    // -------------------------------------------------------------------------
    console.log('\n[TEST 3] Validation: PC count constraints (8-10 PCs)');
    const res3 = await executeGuestReservation({
      fullName: 'Valid Guest',
      phoneNumber: '0555123456',
      reservationType: 'GROUP_10_PC',
      requestedPcCount: 5, // Invalid count
      startAt,
      durationHours: 2,
    });
    if (!res3.success && res3.error?.includes('8, 9, or 10 PCs')) {
      console.log('  PASSED: Invalid PC count (< 8) properly rejected.');
    } else {
      throw new Error(`TEST 3 FAILED: Expected 8-10 PC error, got: ${JSON.stringify(res3)}`);
    }

    // -------------------------------------------------------------------------
    // TEST 4: Successful Guest Submission (8 PCs) without authentication
    // -------------------------------------------------------------------------
    console.log('\n[TEST 4] Successful Guest Submission for 8 PCs without authentication');
    const testPhone = '0555987654';
    const res4 = await executeGuestReservation({
      fullName: 'Karim Scrim Team',
      phoneNumber: testPhone,
      email: 'karim@example.com',
      reservationType: 'GROUP_10_PC',
      requestedPcCount: 8,
      startAt,
      durationHours: 2,
      notes: 'Scrim vs Team Phoenix',
    });

    if (res4.success && res4.reservation) {
      createdIds.push(res4.reservation.id);
      console.log('  PASSED: Reservation created with ID:', res4.reservation.id);
      console.log('  - Status:', res4.reservation.status);
      console.log('  - isGuest:', res4.reservation.isGuest);
      console.log('  - Total Price:', res4.reservation.totalPrice, 'DA');
      console.log('  - Requested PCs:', res4.reservation.requestedPcCount);

      if (res4.reservation.status !== 'PENDING_ADMIN_APPROVAL') {
        throw new Error('TEST 4 FAILED: Status must be PENDING_ADMIN_APPROVAL');
      }
      if (!res4.reservation.isGuest) {
        throw new Error('TEST 4 FAILED: isGuest must be true');
      }
    } else {
      throw new Error(`TEST 4 FAILED: ${res4.error}`);
    }

    // -------------------------------------------------------------------------
    // TEST 5: Privacy Protection: Unauthenticated listing of all customer records denied
    // -------------------------------------------------------------------------
    console.log('\n[TEST 5] Privacy Protection: Unauthenticated listing of customer records strictly denied by Firestore rules');
    try {
      await getDocs(collection(db, 'reservations'));
      throw new Error('TEST 5 FAILED: Listing all reservations should have been denied by Firestore rules!');
    } catch (err: any) {
      if (err.code === 'permission-denied' || err.message?.includes('permission')) {
        console.log('  PASSED: Unauthenticated collection listing denied (Customer records and phone numbers protected).');
      } else {
        throw err;
      }
    }

    // Verify document in Firestore has pending status and no confirmation
    const docSnap = await getDoc(doc(db, 'reservations', res4.reservation!.id));
    if (docSnap.exists()) {
      const data = docSnap.data();
      if (data.status === 'PENDING_ADMIN_APPROVAL' && !data.confirmedAt && !data.confirmedBy) {
        console.log('  PASSED: Guest reservation exists with status PENDING_ADMIN_APPROVAL and no confirmation fields.');
      } else {
        throw new Error(`TEST 5 FAILED: Document in unexpected state: ${JSON.stringify(data)}`);
      }
    } else {
      throw new Error('TEST 5 FAILED: Document not found by reference ID.');
    }

    // -------------------------------------------------------------------------
    // TEST 6: Pending reservation does NOT occupy confirmed slot locks
    // -------------------------------------------------------------------------
    console.log('\n[TEST 6] Verify pending reservation does NOT occupy confirmed calendar slot locks');
    const locksSnap = await getDocs(collection(db, 'postSlotLocks'));
    const isOccupying = locksSnap.docs.some((d) => d.data().reservationId === res4.reservation!.id);
    if (!isOccupying) {
      console.log('  PASSED: Pending reservation created 0 slot locks. Calendar remains open until staff approval.');
    } else {
      throw new Error('TEST 6 FAILED: Pending reservation must not occupy slot locks before admin approval!');
    }

    // -------------------------------------------------------------------------
    // TEST 7: Anti-Duplicate Submission Protection
    // -------------------------------------------------------------------------
    console.log('\n[TEST 7] Anti-Duplicate Submission Protection');
    const res7 = await executeGuestReservation({
      fullName: 'Karim Scrim Team',
      phoneNumber: testPhone, // Same phone number
      reservationType: 'GROUP_10_PC',
      requestedPcCount: 8,
      startAt, // Same time window
      durationHours: 2,
    });
    if (!res7.success && res7.error?.includes('already being processed')) {
      console.log('  PASSED: Duplicate reservation request correctly blocked with helpful message.');
    } else {
      throw new Error(`TEST 7 FAILED: Duplicate should be blocked, got: ${JSON.stringify(res7)}`);
    }

    // -------------------------------------------------------------------------
    // TEST 8: Guest Lookup Scoping (Phone / ID match)
    // -------------------------------------------------------------------------
    console.log('\n[TEST 8] Guest Lookup Scoping');
    const lookup1 = await lookupGuestReservations(testPhone, [res4.reservation!.id]);
    if (lookup1.length > 0 && lookup1.some((r) => r.id === res4.reservation!.id)) {
      console.log('  PASSED: Guest can retrieve their own booking via phone and ID.');
    } else {
      throw new Error('TEST 8 FAILED: Guest could not find their own booking.');
    }

    const lookupUnrelated = await lookupGuestReservations('0000000000', ['non_existent_id']);
    if (lookupUnrelated.length === 0) {
      console.log('  PASSED: Unrelated phone returns 0 bookings, protecting customer privacy.');
    } else {
      throw new Error('TEST 8 FAILED: Unrelated query returned data.');
    }

    // -------------------------------------------------------------------------
    // TEST 9: Unauthorized User Cannot Approve or Alter Reservations
    // -------------------------------------------------------------------------
    console.log('\n[TEST 9] Authorization Protection: Unauthenticated callers cannot approve reservations');
    try {
      await assertAuthorizedStaff(null);
      throw new Error('TEST 9 FAILED: assertAuthorizedStaff should reject unauthenticated caller!');
    } catch (err: any) {
      if (err.message?.includes('Unauthorized') || err.message?.includes('Staff credentials required')) {
        console.log('  PASSED: Unauthenticated callers strictly blocked from staff approval operations.');
      } else {
        throw err;
      }
    }

    console.log('\n======================================================');
    console.log('🎉 ALL 9 GUEST PC RESERVATION AUDIT TESTS PASSED! 🎉');
    console.log('======================================================\n');
    process.exit(0);
  } finally {
    // Cleanup created test documents if any
    for (const id of createdIds) {
      try {
        await deleteDoc(doc(db, 'reservations', id));
      } catch {
        // Expected: unauthenticated callers cannot delete reservations
      }
    }
  }
}

runTests().catch((err) => {
  console.error('AUDIT RUN ERROR:', err);
  process.exit(1);
});
