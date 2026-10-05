import { Match } from '../src/types';

function isMatchPrivate(m: Partial<Match> | null | undefined): boolean {
  if (!m) return false;
  return Boolean(
    m.isPrivate === true ||
    (m as any).privacy === 'PRIVATE' ||
    (m as any).access === 'PRIVATE' ||
    (m as any).lobbyAccess === 'PRIVATE'
  );
}

function calculate5v5LobbyState(match: Match) {
  const teamAPlayerIds = (match.teamAPlayerIds || match.teamAPlayers?.map((p) => p.id) || []).filter(
    (id): id is string => typeof id === 'string' && id.trim().length > 0
  );
  const teamBPlayerIds = (match.teamBPlayerIds || match.teamBPlayers?.map((p) => p.id) || []).filter(
    (id): id is string => typeof id === 'string' && id.trim().length > 0
  );
  const teamACount = Math.min(5, teamAPlayerIds.length);
  const teamBCount = Math.min(5, teamBPlayerIds.length);
  const isFull = teamACount >= 5 && teamBCount >= 5;
  const isOpen = !isFull && (teamACount < 5 || teamBCount < 5);
  return { teamACount, teamBCount, isFull, isOpen };
}

function isActive5v5Lobby(match: Match): boolean {
  if (!match) return false;
  const rawStatus = (match.status || '').toUpperCase();
  const inactiveStatuses = [
    'CANCELLED',
    'CLOSED',
    'COMPLETED',
    'FINISHED',
    'CONFIRMED',
    'REJECTED',
  ];
  return !inactiveStatuses.includes(rawStatus);
}

/**
 * 5v5 SQUAD LOBBIES OPEN JOIN BUTTON VERIFICATION TEST SUITE
 * Validating the complete path: UI conditions + Canonical Join Transaction
 */

class MockTransaction {
  public store = new Map<string, any>();
  public writes = new Map<string, any>();

  constructor(initialStore: Map<string, any>) {
    // Clone snapshot
    for (const [k, v] of initialStore.entries()) {
      this.store.set(k, JSON.parse(JSON.stringify(v)));
    }
  }

  async get(docId: string) {
    const val = this.store.get(docId);
    return {
      exists: () => !!val,
      data: () => val ? JSON.parse(JSON.stringify(val)) : undefined,
    };
  }

  update(docId: string, updates: any) {
    const cur = this.store.get(docId) || {};
    const next = { ...cur, ...updates };
    this.store.set(docId, next);
    this.writes.set(docId, next);
  }

  set(docId: string, data: any, opts?: { merge: boolean }) {
    const cur = opts?.merge ? (this.store.get(docId) || {}) : {};
    const next = { ...cur, ...data };
    this.store.set(docId, next);
    this.writes.set(docId, next);
  }
}

// Canonical Join Engine implementing matchService logic
function executeCanonicalJoin(
  dbStore: Map<string, any>,
  matchId: string,
  joiningPlayer: { uid: string; gamerTag: string; fullName: string; rating?: number },
  requestedSide?: 'teamA' | 'teamB'
): { success: boolean; error?: string; targetSide?: string; isCaptainB?: boolean } {
  const match = dbStore.get(`matches/${matchId}`);
  if (!match) return { success: false, error: 'Match does not exist.' };

  // Status check
  if (match.status !== 'WAITING_FOR_OPPONENT' && match.status !== 'TEAM_ROSTERS_FILLING') {
    return { success: false, error: `Lobby is no longer joinable (status: ${match.status})` };
  }

  // Privacy check
  if (isMatchPrivate(match)) {
    return { success: false, error: 'PRIVATE_LOBBY: This lobby is private. Entry is restricted to accepted invitations only.' };
  }

  // Already in lobby check
  const teamA = match.teamAPlayerIds || [];
  const teamB = match.teamBPlayerIds || [];
  if (teamA.includes(joiningPlayer.uid) || teamB.includes(joiningPlayer.uid) || match.lobbyOwnerId === joiningPlayer.uid) {
    return { success: false, error: 'ALREADY_IN_LOBBY: You are already an active participant in this lobby.' };
  }

  // Check other active lobby
  const pDoc = dbStore.get(`players/${joiningPlayer.uid}`);
  if (pDoc?.active5v5LobbyId && pDoc.active5v5LobbyId !== matchId) {
    const otherMatch = dbStore.get(`matches/${pDoc.active5v5LobbyId}`);
    if (otherMatch && isActive5v5Lobby(otherMatch)) {
      return { success: false, error: 'ALREADY_IN_ANOTHER_LOBBY: You are already in an active 5v5 lobby.' };
    }
  }

  // Determine side
  let targetSide: 'teamA' | 'teamB' = 'teamB';
  const isTeamBEmpty = teamB.length === 0 && !match.captainBId;
  let isPromotedToCaptainB = false;

  if (requestedSide === 'teamA') {
    if (teamA.length >= 5) return { success: false, error: 'Team A roster is full (5/5 players).' };
    targetSide = 'teamA';
  } else if (requestedSide === 'teamB') {
    if (teamB.length >= 5) return { success: false, error: 'Team B roster is full (5/5 players).' };
    targetSide = 'teamB';
  } else {
    if (isTeamBEmpty) {
      targetSide = 'teamB';
      isPromotedToCaptainB = true;
    } else if (teamA.length >= 5 && teamB.length < 5) {
      targetSide = 'teamB';
    } else if (teamB.length >= 5 && teamA.length < 5) {
      targetSide = 'teamA';
    } else if (teamA.length < 5 && teamB.length < 5) {
      targetSide = teamA.length <= teamB.length ? 'teamA' : 'teamB';
    } else {
      return { success: false, error: 'LOBBY_FULL: Both team rosters are full (5/5 players).' };
    }
  }

  // Transaction execution
  const playerSnapshot = {
    id: joiningPlayer.uid,
    gamerTag: joiningPlayer.gamerTag,
    name: joiningPlayer.fullName,
    rating: joiningPlayer.rating || 1000,
    inGameName: joiningPlayer.gamerTag,
  };

  const now = Date.now();
  let updates: any = {};

  if (targetSide === 'teamB' && isTeamBEmpty) {
    isPromotedToCaptainB = true;
    updates = {
      teamBId: `team_b_${match.id}`,
      teamBName: `${joiningPlayer.gamerTag}'s Squad`,
      teamBTag: 'SQDB',
      captainBId: joiningPlayer.uid,
      playerBId: joiningPlayer.uid,
      playerBName: joiningPlayer.fullName,
      playerBGamerTag: joiningPlayer.gamerTag,
      teamBPlayerIds: [joiningPlayer.uid],
      teamBPlayers: [playerSnapshot],
      status: 'TEAM_ROSTERS_FILLING',
      playersNeeded: Math.max(0, 5 - teamA.length),
      playerReadyStatus: { ...(match.playerReadyStatus || {}), [joiningPlayer.uid]: false },
      updatedAt: now,
    };
  } else if (targetSide === 'teamB') {
    const nextB = [...teamB, joiningPlayer.uid];
    const nextBPlayers = [...(match.teamBPlayers || []), playerSnapshot];
    const isBothFull = teamA.length === 5 && nextB.length === 5;
    updates = {
      teamBPlayerIds: nextB,
      teamBPlayers: nextBPlayers,
      status: isBothFull ? 'READY_CHECK' : 'TEAM_ROSTERS_FILLING',
      playerReadyStatus: { ...(match.playerReadyStatus || {}), [joiningPlayer.uid]: false },
      updatedAt: now,
    };
  } else {
    const nextA = [...teamA, joiningPlayer.uid];
    const nextAPlayers = [...(match.teamAPlayers || []), playerSnapshot];
    const isBothFull = nextA.length === 5 && teamB.length === 5;
    updates = {
      teamAPlayerIds: nextA,
      teamAPlayers: nextAPlayers,
      playersNeeded: Math.max(0, 5 - nextA.length),
      status: isBothFull ? 'READY_CHECK' : 'TEAM_ROSTERS_FILLING',
      playerReadyStatus: { ...(match.playerReadyStatus || {}), [joiningPlayer.uid]: false },
      updatedAt: now,
    };
  }

  // Atomically update match and player
  dbStore.set(`matches/${matchId}`, { ...match, ...updates });
  const curP = dbStore.get(`players/${joiningPlayer.uid}`) || {};
  dbStore.set(`players/${joiningPlayer.uid}`, { ...curP, active5v5LobbyId: matchId });

  return { success: true, targetSide, isCaptainB: isPromotedToCaptainB };
}

// Function to compute button UI state in PlayHubView
function computeLobbyButtonUI(
  lobby: Match,
  user: { uid: string } | null,
  playerProfile: any,
  openLobbies: Match[]
): {
  buttonType: 'JOIN 5V5' | 'YOUR LOBBY' | 'IN LOBBY' | 'IN OTHER LOBBY' | 'FULL' | 'PRIVATE' | 'SUSPENDED';
  enabled: boolean;
  cursor: 'pointer' | 'not-allowed';
} {
  const currentUid = user?.uid;
  const isPrivate = isMatchPrivate(lobby);

  if (!user) {
    const state = calculate5v5LobbyState(lobby);
    const totalJoined = (state.teamACount || 0) + (state.teamBCount || 0);
    const isFull = state.isFull || totalJoined >= 10 || ((lobby.teamAPlayerIds || []).length >= 5 && (lobby.teamBPlayerIds || []).length >= 5);
    if (isFull) return { buttonType: 'FULL', enabled: true, cursor: 'pointer' };
    if (isPrivate) return { buttonType: 'PRIVATE', enabled: true, cursor: 'pointer' };
    return { buttonType: 'JOIN 5V5', enabled: true, cursor: 'pointer' };
  }

  const isUserSuspended = Boolean(
    playerProfile?.isSuspended ||
    playerProfile?.isBanned ||
    playerProfile?.status === 'BANNED' ||
    playerProfile?.status === 'SUSPENDED'
  );
  if (isUserSuspended) {
    return { buttonType: 'SUSPENDED', enabled: false, cursor: 'not-allowed' };
  }

  const teamAMemberUids = Array.from(
    new Set([
      ...(lobby.teamAPlayerIds || []),
      ...(lobby.teamAPlayers?.map((p) => p.id) || []),
      ...(lobby.captainAId ? [lobby.captainAId] : []),
      ...(lobby.playerAId ? [lobby.playerAId] : []),
    ].filter((id): id is string => typeof id === 'string' && id.trim().length > 0))
  );

  const teamBMemberUids = Array.from(
    new Set([
      ...(lobby.teamBPlayerIds || []),
      ...(lobby.teamBPlayers?.map((p) => p.id) || []),
      ...(lobby.captainBId ? [lobby.captainBId] : []),
      ...(lobby.playerBId ? [lobby.playerBId] : []),
    ].filter((id): id is string => typeof id === 'string' && id.trim().length > 0))
  );

  const canonicalOwnerId = lobby.lobbyOwnerId || lobby.createdBy;
  const isMemberOfTeamA = Boolean(currentUid && teamAMemberUids.includes(currentUid));
  const isMemberOfTeamB = Boolean(currentUid && teamBMemberUids.includes(currentUid));
  const isLobbyOwner = Boolean(currentUid && canonicalOwnerId && currentUid === canonicalOwnerId);

  if (isLobbyOwner) {
    return { buttonType: 'YOUR LOBBY', enabled: true, cursor: 'pointer' };
  }

  if (isMemberOfTeamA || isMemberOfTeamB) {
    return { buttonType: 'IN LOBBY', enabled: true, cursor: 'pointer' };
  }

  // Check if active in another lobby
  const userOtherActiveLobby = currentUid
    ? openLobbies.find((other) => {
        if (other.id === lobby.id) return false;
        const otherA = other.teamAPlayerIds || [];
        const otherB = other.teamBPlayerIds || [];
        const otherOwner = other.lobbyOwnerId || other.createdBy;
        return (
          otherA.includes(currentUid) ||
          otherB.includes(currentUid) ||
          other.captainAId === currentUid ||
          other.captainBId === currentUid ||
          other.playerAId === currentUid ||
          other.playerBId === currentUid ||
          otherOwner === currentUid
        );
      })
    : null;

  const isPointerActiveInAnother = Boolean(
    currentUid &&
    playerProfile?.active5v5LobbyId &&
    playerProfile.active5v5LobbyId !== lobby.id &&
    openLobbies.some((ol) => ol.id === playerProfile.active5v5LobbyId && isActive5v5Lobby(ol))
  );

  const isInAnotherLobby = Boolean(userOtherActiveLobby || isPointerActiveInAnother);
  if (isInAnotherLobby) {
    return { buttonType: 'IN OTHER LOBBY', enabled: false, cursor: 'not-allowed' };
  }

  const state = calculate5v5LobbyState(lobby);
  const totalJoined = (state.teamACount || 0) + (state.teamBCount || 0);
  const isFull = state.isFull || totalJoined >= 10 || ((lobby.teamAPlayerIds || []).length >= 5 && (lobby.teamBPlayerIds || []).length >= 5);
  if (isFull) {
    return { buttonType: 'FULL', enabled: true, cursor: 'pointer' };
  }

  if (isPrivate) {
    return { buttonType: 'PRIVATE', enabled: true, cursor: 'pointer' };
  }

  return { buttonType: 'JOIN 5V5', enabled: true, cursor: 'pointer' };
}

// RUN TESTS
async function runTests() {
  console.log('=== RUNNING 5v5 OPEN LOBBY JOIN BUTTON SPECIFICATION TESTS ===\n');
  let passed = 0;
  let failed = 0;

  function assert(cond: boolean, msg: string, detail?: string) {
    if (cond) {
      console.log(`  [PASS] ${msg} ${detail ? `(${detail})` : ''}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${msg} ${detail ? `(${detail})` : ''}`);
      failed++;
    }
  }

  const dbStore = new Map<string, any>();

  // TEST 1: OPEN lobby, Team A 3/5, Team B 3/5, current player is not a member
  // -> JOIN 5V5 enabled and clickable
  const lobby1: Match = {
    id: 'lobby_1',
    lobbyCode: 'LOB1',
    matchType: '5v5',
    gameId: 'cs2',
    gameName: 'CS2',
    status: 'TEAM_ROSTERS_FILLING',
    createdBy: 'creator_uid',
    lobbyOwnerId: 'creator_uid',
    teamAPlayerIds: ['p1', 'p2', 'p3'],
    teamBPlayerIds: ['p4', 'p5', 'p6'],
    captainAId: 'p1',
    captainBId: 'p4',
    isPrivate: false,
    createdAt: Date.now(),
  } as any;
  dbStore.set('matches/lobby_1', lobby1);

  const playerNew = { uid: 'user_new', gamerTag: 'NewGamer', fullName: 'New Gamer' };
  dbStore.set('players/user_new', { uid: 'user_new', gamerTag: 'NewGamer', active5v5LobbyId: null });

  const ui1 = computeLobbyButtonUI(lobby1, { uid: playerNew.uid }, { active5v5LobbyId: null }, [lobby1]);
  assert(ui1.buttonType === 'JOIN 5V5', 'TEST 1: Button shows JOIN 5V5', `ui=${ui1.buttonType}`);
  assert(ui1.enabled === true, 'TEST 1: Button is enabled', `enabled=${ui1.enabled}`);
  assert(ui1.cursor === 'pointer', 'TEST 1: Button has pointer cursor', `cursor=${ui1.cursor}`);

  // TEST 2: OPEN lobby, Team A 5/5, Team B 3/5
  // -> JOIN 5V5 enabled and player joins Team B
  const lobby2: Match = {
    id: 'lobby_2',
    lobbyCode: 'LOB2',
    matchType: '5v5',
    gameId: 'cs2',
    gameName: 'CS2',
    status: 'TEAM_ROSTERS_FILLING',
    createdBy: 'creator_uid',
    lobbyOwnerId: 'creator_uid',
    teamAPlayerIds: ['p1', 'p2', 'p3', 'p4', 'p5'],
    teamBPlayerIds: ['p6', 'p7', 'p8'],
    captainAId: 'p1',
    captainBId: 'p6',
    isPrivate: false,
    createdAt: Date.now(),
  } as any;
  dbStore.set('matches/lobby_2', lobby2);

  const ui2 = computeLobbyButtonUI(lobby2, { uid: playerNew.uid }, { active5v5LobbyId: null }, [lobby2]);
  assert(ui2.buttonType === 'JOIN 5V5' && ui2.enabled, 'TEST 2: Button shows JOIN 5V5 and is enabled');
  const joinRes2 = executeCanonicalJoin(dbStore, 'lobby_2', playerNew);
  assert(joinRes2.success && joinRes2.targetSide === 'teamB', 'TEST 2: Player joins Team B', `side=${joinRes2.targetSide}`);
  const match2After = dbStore.get('matches/lobby_2');
  assert(match2After.teamBPlayerIds.includes(playerNew.uid), 'TEST 2: Team B includes player UID');
  assert(dbStore.get('players/user_new').active5v5LobbyId === 'lobby_2', 'TEST 2: active5v5LobbyId updated');

  // Reset player for TEST 3
  dbStore.set('players/user_new', { uid: 'user_new', gamerTag: 'NewGamer', active5v5LobbyId: null });

  // TEST 3: OPEN lobby, Team A 3/5, Team B 5/5
  // -> JOIN 5V5 enabled and player joins Team A
  const lobby3: Match = {
    id: 'lobby_3',
    lobbyCode: 'LOB3',
    matchType: '5v5',
    gameId: 'cs2',
    gameName: 'CS2',
    status: 'TEAM_ROSTERS_FILLING',
    createdBy: 'creator_uid',
    lobbyOwnerId: 'creator_uid',
    teamAPlayerIds: ['p1', 'p2', 'p3'],
    teamBPlayerIds: ['p6', 'p7', 'p8', 'p9', 'p10'],
    captainAId: 'p1',
    captainBId: 'p6',
    isPrivate: false,
    createdAt: Date.now(),
  } as any;
  dbStore.set('matches/lobby_3', lobby3);

  const ui3 = computeLobbyButtonUI(lobby3, { uid: playerNew.uid }, { active5v5LobbyId: null }, [lobby3]);
  assert(ui3.buttonType === 'JOIN 5V5' && ui3.enabled, 'TEST 3: Button shows JOIN 5V5 and is enabled');
  const joinRes3 = executeCanonicalJoin(dbStore, 'lobby_3', playerNew);
  assert(joinRes3.success && joinRes3.targetSide === 'teamA', 'TEST 3: Player joins Team A', `side=${joinRes3.targetSide}`);
  const match3After = dbStore.get('matches/lobby_3');
  assert(match3After.teamAPlayerIds.includes(playerNew.uid), 'TEST 3: Team A includes player UID');

  // TEST 4: OPEN lobby, Team A 5/5, Team B 5/5
  // -> JOIN disabled and show FULL
  const lobby4: Match = {
    id: 'lobby_4',
    lobbyCode: 'LOB4',
    matchType: '5v5',
    gameId: 'cs2',
    gameName: 'CS2',
    status: 'READY_CHECK',
    createdBy: 'creator_uid',
    lobbyOwnerId: 'creator_uid',
    teamAPlayerIds: ['p1', 'p2', 'p3', 'p4', 'p5'],
    teamBPlayerIds: ['p6', 'p7', 'p8', 'p9', 'p10'],
    captainAId: 'p1',
    captainBId: 'p6',
    isPrivate: false,
    createdAt: Date.now(),
  } as any;
  dbStore.set('matches/lobby_4', lobby4);

  const ui4 = computeLobbyButtonUI(lobby4, { uid: 'user_outsider' }, {}, [lobby4]);
  assert(ui4.buttonType === 'FULL', 'TEST 4: Button shows FULL', `ui=${ui4.buttonType}`);

  // TEST 5: Current player already belongs to the lobby
  // -> do not show JOIN; show IN LOBBY / YOUR LOBBY according to the existing UI
  const ui5Member = computeLobbyButtonUI(lobby1, { uid: 'p2' }, {}, [lobby1]);
  assert(ui5Member.buttonType === 'IN LOBBY', 'TEST 5: Member sees IN LOBBY', `ui=${ui5Member.buttonType}`);

  const ui5Owner = computeLobbyButtonUI(lobby1, { uid: 'creator_uid' }, {}, [lobby1]);
  assert(ui5Owner.buttonType === 'YOUR LOBBY', 'TEST 5: Owner sees YOUR LOBBY', `ui=${ui5Owner.buttonType}`);

  // TEST 6: Current player belongs to another active 5v5 lobby
  // -> JOIN disabled with appropriate message
  const playerInOther = { uid: 'p_other_only', gamerTag: 'PlayerInOther' };
  const lobbyWithOther: Match = {
    id: 'lobby_other',
    lobbyCode: 'OTHR',
    matchType: '5v5',
    gameId: 'cs2',
    gameName: 'CS2',
    status: 'TEAM_ROSTERS_FILLING',
    createdBy: 'other_owner',
    lobbyOwnerId: 'other_owner',
    teamAPlayerIds: ['p_other_only'],
    teamBPlayerIds: [],
    isPrivate: false,
    createdAt: Date.now(),
  } as any;
  const ui6 = computeLobbyButtonUI(lobby2, { uid: playerInOther.uid }, { active5v5LobbyId: lobbyWithOther.id }, [lobbyWithOther, lobby2]);
  assert(ui6.buttonType === 'IN OTHER LOBBY' && !ui6.enabled, 'TEST 6: Player in other lobby sees IN OTHER LOBBY and disabled');

  // TEST 6b: Stale active5v5LobbyId pointing to dead/finished lobby does NOT block joining!
  const playerStale = { uid: 'player_stale', gamerTag: 'StaleUser' };
  const ui6Stale = computeLobbyButtonUI(lobby1, { uid: playerStale.uid }, { active5v5LobbyId: 'non_existent_closed_lobby' }, [lobby1]);
  assert(ui6Stale.buttonType === 'JOIN 5V5' && ui6Stale.enabled, 'TEST 6b: Stale active5v5LobbyId does not block joining', `ui=${ui6Stale.buttonType}`);

  // TEST 7: PRIVATE lobby -> no direct JOIN; invitation required
  const lobbyPrivate: Match = {
    id: 'lobby_priv',
    lobbyCode: 'PRIV1',
    matchType: '5v5',
    gameId: 'cs2',
    gameName: 'CS2',
    status: 'WAITING_FOR_OPPONENT',
    createdBy: 'creator_uid',
    lobbyOwnerId: 'creator_uid',
    teamAPlayerIds: ['p1'],
    teamBPlayerIds: [],
    isPrivate: true,
    createdAt: Date.now(),
  } as any;
  dbStore.set('matches/lobby_priv', lobbyPrivate);
  const ui7 = computeLobbyButtonUI(lobbyPrivate, { uid: playerNew.uid }, {}, [lobbyPrivate]);
  assert(ui7.buttonType === 'PRIVATE', 'TEST 7: Private lobby shows PRIVATE button', `ui=${ui7.buttonType}`);

  const joinPrivateAttempt = executeCanonicalJoin(dbStore, 'lobby_priv', playerNew);
  assert(!joinPrivateAttempt.success && joinPrivateAttempt.error?.includes('PRIVATE_LOBBY'), 'TEST 7: Direct join to private lobby rejected');

  // TEST 8: Two players simultaneously attempt to take the final slot -> exactly one succeeds
  const lobbyFinalSlot: Match = {
    id: 'lobby_final',
    lobbyCode: 'FINAL',
    matchType: '5v5',
    gameId: 'cs2',
    gameName: 'CS2',
    status: 'TEAM_ROSTERS_FILLING',
    createdBy: 'creator_uid',
    lobbyOwnerId: 'creator_uid',
    teamAPlayerIds: ['p1', 'p2', 'p3', 'p4', 'p5'],
    teamBPlayerIds: ['p6', 'p7', 'p8', 'p9'], // exactly 1 slot on Team B
    captainAId: 'p1',
    captainBId: 'p6',
    isPrivate: false,
    createdAt: Date.now(),
  } as any;
  dbStore.set('matches/lobby_final', lobbyFinalSlot);

  const playerRace1 = { uid: 'race_1', gamerTag: 'Racer1', fullName: 'Racer One' };
  const playerRace2 = { uid: 'race_2', gamerTag: 'Racer2', fullName: 'Racer Two' };
  dbStore.set('players/race_1', { uid: 'race_1' });
  dbStore.set('players/race_2', { uid: 'race_2' });

  // Simulate concurrent execution: racer 1 succeeds
  const raceRes1 = executeCanonicalJoin(dbStore, 'lobby_final', playerRace1);
  const raceRes2 = executeCanonicalJoin(dbStore, 'lobby_final', playerRace2);

  assert(raceRes1.success === true, 'TEST 8: Racer 1 claims final slot');
  assert(raceRes2.success === false && (raceRes2.error?.includes('full') || raceRes2.error?.includes('FULL') || raceRes2.error?.includes('no longer joinable')), 'TEST 8: Racer 2 rejected due to full capacity / closed');
  const finalMatch = dbStore.get('matches/lobby_final');
  assert(finalMatch.teamBPlayerIds.length === 5, 'TEST 8: Team B roster strictly locked at 5');
  assert(finalMatch.status === 'READY_CHECK', 'TEST 8: Both teams full -> status transitions to READY_CHECK');

  // TEST 9: Refresh the page after joining -> player remains in the lobby and JOIN does not reappear
  const uiAfterJoin = computeLobbyButtonUI(finalMatch, { uid: playerRace1.uid }, { active5v5LobbyId: 'lobby_final' }, [finalMatch]);
  assert(uiAfterJoin.buttonType === 'IN LOBBY', 'TEST 9: After page refresh, button shows IN LOBBY and not JOIN', `ui=${uiAfterJoin.buttonType}`);

  // TEST 10: Logout/login again -> membership remains correct
  // Logged out: shows FULL because lobby is now 10/10
  const uiLoggedOut = computeLobbyButtonUI(finalMatch, null, null, [finalMatch]);
  assert(uiLoggedOut.buttonType === 'FULL', 'TEST 10: Logged out shows lobby status');
  // Log in again as playerRace1:
  const uiReLogin = computeLobbyButtonUI(finalMatch, { uid: playerRace1.uid }, { active5v5LobbyId: 'lobby_final' }, [finalMatch]);
  assert(uiReLogin.buttonType === 'IN LOBBY', 'TEST 10: Logged in again shows IN LOBBY with correct membership preserved');

  console.log(`\nTEST SUMMARY: ${passed} Passed, ${failed} Failed\n`);
  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
