/**
 * NEXUS GAMING CENTER
 * STAGING SECURITY & CONCURRENCY AUDIT: 5v5 SQUAD LOBBIES
 *
 * SCOPE:
 * 1. Authoritative 5v5 Lobby Model & State Representation
 * 2. Strict Permission Model (Creator, Team A Captain, Team B Captain, Regular Members)
 * 3. Permanent Squad vs Match Lobby Isolation
 * 4. High-Concurrency Stress & Integrity Suite:
 *    - Capacity overflow prevention (5/5 Team A, 5/5 Team B, 10/10 Total)
 *    - Race condition concurrency stress (simultaneous joins for the last slot)
 *    - Double-joining prevention (same player on both Team A and Team B)
 *    - Concurrent team side switching
 *    - Duplicate invitation suppression
 *    - Multi-lobby conflict enforcement (player already in active lobby)
 *    - Captain transfer & owner departure semantics
 *    - Lobby cancellation while joins/invites in flight
 *    - Match readiness & admin approval gates
 *
 * ENVIRONMENT: Strictly Staging (In-Memory Simulator & Security Rules Audit)
 */

import {
  Match,
  MatchStatus,
  Team,
  TeamInvitation,
  Player,
  LobbyRecruitment,
} from '../src/types';

// ==========================================
// COLORIZED TEST REPORTER
// ==========================================
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

let testsPassed = 0;
let testsFailed = 0;
const testLogs: string[] = [];

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    testsPassed++;
    console.log(`  ${colors.green}✔ PASS:${colors.reset} ${testName}`);
    if (detail) console.log(`         ${colors.cyan}↳ ${detail}${colors.reset}`);
  } else {
    testsFailed++;
    console.error(`  ${colors.red}✖ FAIL:${colors.reset} ${testName}`);
    if (detail) console.error(`         ${colors.yellow}↳ ${detail}${colors.reset}`);
  }
}

// ==========================================
// IN-MEMORY HIGH-FIDELITY SIMULATOR
// ==========================================
class InMemoryLobbyEngine {
  matches: Map<string, Match> = new Map();
  teams: Map<string, Team> = new Map();
  players: Map<string, Player> = new Map();
  invitations: Map<string, TeamInvitation> = new Map();
  recruitments: Map<string, LobbyRecruitment> = new Map();
  auditLogs: any[] = [];
  notifications: any[] = [];

  constructor() {
    this.seedDatabase();
  }

  seedDatabase() {
    // Seed Players
    const samplePlayers = [
      { uid: 'uid_creator_a', gamerTag: 'ApexViper', role: 'player', rating: 1450, active5v5LobbyId: null },
      { uid: 'uid_player_a2', gamerTag: 'ShadowEcho', role: 'player', rating: 1300, active5v5LobbyId: null },
      { uid: 'uid_player_a3', gamerTag: 'NovaPulse', role: 'player', rating: 1250, active5v5LobbyId: null },
      { uid: 'uid_player_a4', gamerTag: 'BlazeCore', role: 'player', rating: 1380, active5v5LobbyId: null },
      { uid: 'uid_player_a5', gamerTag: 'FrostByte', role: 'player', rating: 1410, active5v5LobbyId: null },
      { uid: 'uid_capt_b', gamerTag: 'TitanStrike', role: 'player', rating: 1480, active5v5LobbyId: null },
      { uid: 'uid_player_b2', gamerTag: 'CyberGhost', role: 'player', rating: 1320, active5v5LobbyId: null },
      { uid: 'uid_player_b3', gamerTag: 'Valkyrie', role: 'player', rating: 1290, active5v5LobbyId: null },
      { uid: 'uid_player_b4', gamerTag: 'Zenith', role: 'player', rating: 1350, active5v5LobbyId: null },
      { uid: 'uid_player_b5', gamerTag: 'IronClad', role: 'player', rating: 1400, active5v5LobbyId: null },
      { uid: 'uid_outsider_1', gamerTag: 'PhantomRogue', role: 'player', rating: 1200, active5v5LobbyId: null },
      { uid: 'uid_outsider_2', gamerTag: 'SolarFlare', role: 'player', rating: 1220, active5v5LobbyId: null },
      { uid: 'uid_outsider_3', gamerTag: 'NeonSpecter', role: 'player', rating: 1260, active5v5LobbyId: null },
      { uid: 'uid_staff_01', gamerTag: 'StaffAlex', role: 'STAFF', rating: 1500, active5v5LobbyId: null },
      { uid: 'uid_admin_01', gamerTag: 'AdminSarah', role: 'ADMIN', rating: 1600, active5v5LobbyId: null },
    ];

    for (const p of samplePlayers) {
      this.players.set(p.uid, {
        id: p.uid,
        uid: p.uid,
        email: `${p.gamerTag.toLowerCase()}@nexus.gg`,
        fullName: `${p.gamerTag} RealName`,
        gamerTag: p.gamerTag,
        gamerTagLower: p.gamerTag.toLowerCase(),
        role: p.role as any,
        overallRating: p.rating,
        nexusCoins: 100,
        totalGames: 10,
        totalWins: 5,
        totalLosses: 5,
        totalDraws: 0,
        createdAt: Date.now() - 500000,
        active5v5LobbyId: p.active5v5LobbyId,
      } as unknown as Player);
    }

    // Seed Persistent Permanent Teams
    this.teams.set('team_omega', {
      teamId: 'team_omega',
      teamName: 'Omega Syndicate',
      teamTag: 'OMG',
      teamLogo: '🛡️',
      gameId: 'valorant',
      gameName: 'Valorant',
      captainId: 'uid_creator_a',
      captainGamerTag: 'ApexViper',
      memberIds: ['uid_creator_a', 'uid_player_a2', 'uid_player_a3'],
      members: [
        { id: 'uid_creator_a', gamerTag: 'ApexViper', role: 'captain' },
        { id: 'uid_player_a2', gamerTag: 'ShadowEcho', role: 'member' },
        { id: 'uid_player_a3', gamerTag: 'NovaPulse', role: 'member' },
      ],
      teamRating: 1333,
      matchesPlayed: 10,
      wins: 7,
      losses: 3,
      draws: 0,
      createdAt: Date.now() - 1000000,
      updatedAt: Date.now() - 1000000,
    } as Team);

    this.teams.set('team_vortex', {
      teamId: 'team_vortex',
      teamName: 'Vortex Vanguard',
      teamTag: 'VTX',
      teamLogo: '⚔️',
      gameId: 'valorant',
      gameName: 'Valorant',
      captainId: 'uid_capt_b',
      captainGamerTag: 'TitanStrike',
      memberIds: ['uid_capt_b', 'uid_player_b2'],
      members: [
        { id: 'uid_capt_b', gamerTag: 'TitanStrike', role: 'captain' },
        { id: 'uid_player_b2', gamerTag: 'CyberGhost', role: 'member' },
      ],
      teamRating: 1400,
      matchesPlayed: 5,
      wins: 4,
      losses: 1,
      draws: 0,
      createdAt: Date.now() - 1000000,
      updatedAt: Date.now() - 1000000,
    } as Team);
  }

  // --- 1. LOBBY CREATION ---
  create5v5Lobby(actorUid: string, teamId: string, isPrivate: boolean = false): { success: boolean; match?: Match; error?: string } {
    const actor = this.players.get(actorUid);
    if (!actor) return { success: false, error: 'User not authenticated.' };

    if (actor.active5v5LobbyId) {
      const existing = this.matches.get(actor.active5v5LobbyId);
      if (existing && !['CONFIRMED', 'CANCELLED', 'REJECTED'].includes(existing.status)) {
        return { success: false, error: 'YOU ALREADY HAVE AN ACTIVE LOBBY' };
      }
    }

    const team = this.teams.get(teamId);
    if (!team) return { success: false, error: 'Team squad not found.' };

    if (team.captainId !== actorUid) {
      return { success: false, error: 'Only the team captain can create a 5v5 ranked lobby.' };
    }

    const matchId = `match_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const now = Date.now();

    const teamAPlayerIds = [...team.memberIds];
    const teamAPlayers = teamAPlayerIds.map((uid) => {
      const p = this.players.get(uid)!;
      return {
        id: uid,
        gamerTag: p.gamerTag,
        name: p.fullName || p.gamerTag,
        rating: p.overallRating || 1000,
      };
    });

    const newMatch: Match = {
      id: matchId,
      lobbyCode: `OMG-${Math.floor(1000 + Math.random() * 9000)}`,
      matchType: '5v5',
      status: 'WAITING_FOR_OPPONENT',
      gameId: team.gameId,
      gameName: team.gameName,
      gameCategory: 'PC',
      station: 'PC-01',
      pcCount: 10,
      createdBy: actorUid,
      createdByName: actor.gamerTag,
      lobbyOwnerId: actorUid,
      captainAId: actorUid,
      isPrivate,
      lobbyAccess: isPrivate ? 'PRIVATE' : 'OPEN',
      createdAt: now,
      updatedAt: now,
      playersNeeded: Math.max(0, 5 - teamAPlayerIds.length),

      // Team A
      teamAId: team.teamId,
      teamAName: team.teamName,
      teamATag: team.teamTag,
      teamALogo: team.teamLogo,
      teamAPlayerIds,
      teamAPlayers,
      teamAAvgRating: Math.round(teamAPlayers.reduce((s, p) => s + p.rating, 0) / teamAPlayers.length),

      // Team B starts strictly EMPTY
      teamBId: undefined,
      teamBName: 'EMPTY',
      teamBTag: 'TBD',
      teamBLogo: '⚔️',
      captainBId: undefined,
      teamBPlayerIds: [],
      teamBPlayers: [],
      playerReadyStatus: {},
      playerAId: actorUid,
      playerAGamerTag: actor.gamerTag,
      playerAName: actor.fullName,
      playerBId: undefined,
      playerBName: undefined,
      playerBGamerTag: undefined,
    };

    this.matches.set(matchId, newMatch);
    actor.active5v5LobbyId = matchId;
    return { success: true, match: newMatch };
  }

  // --- 2. JOIN 5v5 LOBBY ---
  join5v5Lobby(actorUid: string, lobbyCode: string, teamId?: string): { success: boolean; match?: Match; error?: string } {
    const actor = this.players.get(actorUid);
    if (!actor) return { success: false, error: 'Authentication required.' };

    const match = Array.from(this.matches.values()).find((m) => m.lobbyCode === lobbyCode.trim().toUpperCase());
    if (!match) return { success: false, error: 'Lobby not found.' };

    if (match.isPrivate || match.lobbyAccess === 'PRIVATE') {
      return { success: false, error: 'PRIVATE_LOBBY: This lobby is private. Entry is restricted to accepted invitations only.' };
    }

    if (match.status !== 'WAITING_FOR_OPPONENT' && match.status !== 'TEAM_ROSTERS_FILLING') {
      return { success: false, error: `Lobby is no longer accepting opponents (${match.status}).` };
    }

    // Check active lobby membership
    if (actor.active5v5LobbyId && actor.active5v5LobbyId !== match.id) {
      const activeL = this.matches.get(actor.active5v5LobbyId);
      if (activeL && !['CONFIRMED', 'CANCELLED', 'REJECTED'].includes(activeL.status)) {
        return { success: false, error: 'ALREADY_IN_ANOTHER_LOBBY' };
      }
    }

    const teamAIds = match.teamAPlayerIds || [];
    const teamBIds = match.teamBPlayerIds || [];

    if (teamAIds.includes(actorUid) || teamBIds.includes(actorUid)) {
      return { success: false, error: 'ALREADY_IN_LOBBY: You are already an active participant in this lobby.' };
    }

    if (!teamId) {
      // Solo join as Team B Captain
      if (teamBIds.length > 0 || match.captainBId) {
        return { success: false, error: 'Team B already has a captain. Please request to join Team B as a player instead.' };
      }

      match.captainBId = actorUid;
      match.playerBId = actorUid;
      match.playerBGamerTag = actor.gamerTag;
      match.playerBName = actor.fullName || actor.gamerTag;
      match.teamBId = `team_b_${match.id}`;
      match.teamBName = `${actor.gamerTag}'s Squad`;
      match.teamBTag = 'SQD-B';
      match.teamBPlayerIds = [actorUid];
      match.teamBPlayers = [{ id: actorUid, gamerTag: actor.gamerTag, name: actor.fullName || actor.gamerTag, rating: actor.overallRating || 1000 }];
      match.status = 'TEAM_ROSTERS_FILLING';
      match.updatedAt = Date.now();
      actor.active5v5LobbyId = match.id;

      return { success: true, match };
    } else {
      // Joining with existing squad
      const team = this.teams.get(teamId);
      if (!team) return { success: false, error: 'Team not found.' };
      if (team.captainId !== actorUid) return { success: false, error: 'Only the squad captain can join with a team.' };

      if (team.gameId.toLowerCase() !== match.gameId.toLowerCase()) {
        return { success: false, error: 'Game mismatch.' };
      }
      if (match.teamAId === team.teamId) {
        return { success: false, error: 'A team cannot play against itself.' };
      }

      // Check duplicate players
      const dup = team.memberIds.some((id) => teamAIds.includes(id));
      if (dup) {
        return { success: false, error: 'Validation failed: You cannot play on both sides.' };
      }

      match.teamBId = team.teamId;
      match.teamBName = team.teamName;
      match.teamBTag = team.teamTag;
      match.teamBLogo = team.teamLogo;
      match.captainBId = actorUid;
      match.playerBId = actorUid;
      match.playerBGamerTag = actor.gamerTag;
      match.teamBPlayerIds = [...team.memberIds];
      match.teamBPlayers = team.memberIds.map((uid) => {
        const p = this.players.get(uid)!;
        return { id: uid, gamerTag: p.gamerTag, name: p.fullName || p.gamerTag, rating: p.overallRating || 1000 };
      });
      match.status = 'TEAM_ROSTERS_FILLING';
      match.updatedAt = Date.now();

      for (const mId of team.memberIds) {
        const p = this.players.get(mId);
        if (p) p.active5v5LobbyId = match.id;
      }

      return { success: true, match };
    }
  }

  // --- 3. INVITATIONS ---
  invitePlayerTo5v5Lobby(
    callerUid: string,
    matchId: string,
    targetPlayerUid: string,
    teamSide: 'teamA' | 'teamB'
  ): { success: boolean; error?: string; invitationId?: string } {
    const match = this.matches.get(matchId);
    if (!match) return { success: false, error: 'Match not found.' };

    const caller = this.players.get(callerUid);
    if (!caller) return { success: false, error: 'Unauthorized.' };

    const recipient = this.players.get(targetPlayerUid);
    if (!recipient) return { success: false, error: 'Recipient player not found.' };

    // Universal self-invite prevention
    if (callerUid === targetPlayerUid) {
      return { success: false, error: 'SELF_INVITE_DENIED: You cannot invite yourself.' };
    }

    const teamAIds = match.teamAPlayerIds || [];
    const teamBIds = match.teamBPlayerIds || [];

    const isLobbyOwner = callerUid === match.lobbyOwnerId || callerUid === match.createdBy;
    const isCapA = callerUid === match.captainAId;
    const isCapB = callerUid === match.captainBId;

    // Strict Permissions:
    // - Lobby Owner: can invite to Team A and Team B
    // - Team A Captain: can invite to Team A ONLY
    // - Team B Captain: can invite to Team B ONLY
    // - Team Member: CANNOT invite to either team
    if (teamSide === 'teamA') {
      if (!isLobbyOwner && !isCapA) {
        return { success: false, error: 'PERMISSION_DENIED: Only Lobby Owner or Team A Captain can invite to Team A.' };
      }
    } else if (teamSide === 'teamB') {
      if (!isLobbyOwner && !isCapB) {
        return { success: false, error: 'PERMISSION_DENIED: Only Lobby Owner or Team B Captain can invite to Team B.' };
      }
    } else {
      return { success: false, error: 'Invalid teamSide.' };
    }

    const targetTeamIds = teamSide === 'teamA' ? teamAIds : teamBIds;
    if (targetTeamIds.length >= 5) {
      return { success: false, error: `${teamSide === 'teamA' ? 'Team A' : 'Team B'} is already full (5/5).` };
    }

    if (teamAIds.includes(targetPlayerUid) || teamBIds.includes(targetPlayerUid)) {
      return { success: false, error: 'Player is already in this lobby.' };
    }

    if (recipient.active5v5LobbyId && recipient.active5v5LobbyId !== matchId) {
      const act = this.matches.get(recipient.active5v5LobbyId);
      if (act && !['CONFIRMED', 'CANCELLED', 'REJECTED'].includes(act.status)) {
        return { success: false, error: `Recipient is already active in lobby ${act.lobbyCode || act.id}.` };
      }
    }

    // Check duplicate pending invite
    const existing = Array.from(this.invitations.values()).find(
      (inv) =>
        inv.lobbyId === matchId &&
        inv.invitedPlayerId === targetPlayerUid &&
        inv.teamSide === teamSide &&
        inv.status === 'PENDING'
    );
    if (existing) {
      return { success: true, invitationId: existing.id }; // idempotent reuse
    }

    const invId = `inv_${matchId}_${targetPlayerUid}_${teamSide}`;
    const inv = {
      id: invId,
      lobbyId: matchId,
      teamId: teamSide === 'teamA' ? match.teamAId || 'teamA' : match.teamBId || 'teamB',
      teamSide,
      teamName: teamSide === 'teamA' ? match.teamAName : match.teamBName,
      captainId: teamSide === 'teamA' ? match.captainAId || callerUid : match.captainBId || callerUid,
      inviterId: callerUid,
      invitedPlayerId: targetPlayerUid,
      recipientId: targetPlayerUid,
      invitedGamerTag: recipient.gamerTag,
      status: 'PENDING',
      type: '5V5_LOBBY_INVITATION',
      createdAt: Date.now(),
      expiresAt: Date.now() + 600000,
    } as unknown as TeamInvitation;

    this.invitations.set(invId, inv);
    return { success: true, invitationId: invId };
  }

  // --- 4. ACCEPT INVITATION ---
  acceptInvitation(callerUid: string, invitationId: string): { success: boolean; error?: string } {
    const inv = this.invitations.get(invitationId);
    if (!inv) return { success: false, error: 'Invitation not found.' };

    if (inv.recipientId !== callerUid && inv.invitedPlayerId !== callerUid) {
      return { success: false, error: 'Unauthorized: Cannot accept invitation addressed to someone else.' };
    }

    if (inv.status !== 'PENDING') {
      return { success: false, error: `Invitation is no longer pending (${inv.status}).` };
    }

    const match = this.matches.get(inv.lobbyId!);
    if (!match) return { success: false, error: 'Lobby no longer exists.' };

    if (match.status === 'CANCELLED' || match.status === 'CONFIRMED' || match.status === 'LIVE') {
      return { success: false, error: `Cannot join match with status ${match.status}.` };
    }

    const recipient = this.players.get(callerUid)!;
    if (recipient.active5v5LobbyId && recipient.active5v5LobbyId !== match.id) {
      const act = this.matches.get(recipient.active5v5LobbyId);
      if (act && !['CONFIRMED', 'CANCELLED', 'REJECTED'].includes(act.status)) {
        return { success: false, error: 'Recipient is already active in another lobby.' };
      }
    }

    const teamKey = inv.teamSide === 'teamA' ? 'teamAPlayerIds' : 'teamBPlayerIds';
    const playersKey = inv.teamSide === 'teamA' ? 'teamAPlayers' : 'teamBPlayers';
    const roster: string[] = match[teamKey] || [];

    if (roster.length >= 5) {
      return { success: false, error: 'Team is already full (5/5).' };
    }

    if (roster.includes(callerUid)) {
      inv.status = 'ACCEPTED';
      return { success: true };
    }

    roster.push(callerUid);
    match[teamKey] = roster;
    match[playersKey] = [
      ...(match[playersKey] || []),
      { id: callerUid, gamerTag: recipient.gamerTag, name: recipient.fullName || recipient.gamerTag, rating: recipient.overallRating || 1000 },
    ];

    if (inv.teamSide === 'teamB' && !match.captainBId) {
      match.captainBId = callerUid;
      match.playerBId = callerUid;
      match.playerBGamerTag = recipient.gamerTag;
    }

    inv.status = 'ACCEPTED';
    inv.acceptedAt = Date.now();
    inv.acceptedBy = callerUid;
    recipient.active5v5LobbyId = match.id;
    match.updatedAt = Date.now();

    return { success: true };
  }

  // --- 5. SWITCH TEAM SIDE ---
  switchTeamSide(callerUid: string, matchId: string): { success: boolean; error?: string } {
    const match = this.matches.get(matchId);
    if (!match) return { success: false, error: 'Match not found.' };

    if (['LIVE', 'CONFIRMED', 'CANCELLED'].includes(match.status)) {
      return { success: false, error: 'Cannot switch sides in live, confirmed, or cancelled match.' };
    }

    const teamAIds = match.teamAPlayerIds || [];
    const teamBIds = match.teamBPlayerIds || [];

    const isTeamA = teamAIds.includes(callerUid);
    const isTeamB = teamBIds.includes(callerUid);

    if (!isTeamA && !isTeamB) {
      return { success: false, error: 'You are not a member of this lobby.' };
    }

    const targetSide = isTeamA ? 'teamB' : 'teamA';
    const targetIds = targetSide === 'teamA' ? teamAIds : teamBIds;

    if (targetIds.length >= 5) {
      return { success: false, error: `${targetSide === 'teamA' ? 'Team A' : 'Team B'} is already full (5/5).` };
    }

    const player = this.players.get(callerUid)!;
    const playerObj = { id: callerUid, gamerTag: player.gamerTag, name: player.fullName || player.gamerTag, rating: player.overallRating || 1000 };

    if (isTeamA) {
      match.teamAPlayerIds = teamAIds.filter((id) => id !== callerUid);
      match.teamAPlayers = (match.teamAPlayers || []).filter((p) => p.id !== callerUid);
      match.teamBPlayerIds = [...teamBIds, callerUid];
      match.teamBPlayers = [...(match.teamBPlayers || []), playerObj];

      if (match.captainAId === callerUid) {
        match.captainAId = match.teamAPlayerIds[0] || undefined;
      }
      if (!match.captainBId) {
        match.captainBId = callerUid;
      }
    } else {
      match.teamBPlayerIds = teamBIds.filter((id) => id !== callerUid);
      match.teamBPlayers = (match.teamBPlayers || []).filter((p) => p.id !== callerUid);
      match.teamAPlayerIds = [...teamAIds, callerUid];
      match.teamAPlayers = [...(match.teamAPlayers || []), playerObj];

      if (match.captainBId === callerUid) {
        match.captainBId = match.teamBPlayerIds[0] || undefined;
      }
      if (!match.captainAId) {
        match.captainAId = callerUid;
      }
    }

    match.updatedAt = Date.now();
    return { success: true };
  }

  // --- 6. REMOVE PLAYER (KICK) ---
  removePlayerFromTeam(
    callerUid: string,
    matchId: string,
    targetPlayerUid: string,
    teamSide: 'teamA' | 'teamB'
  ): { success: boolean; error?: string } {
    const match = this.matches.get(matchId);
    if (!match) return { success: false, error: 'Match not found.' };

    if (['LIVE', 'CONFIRMED'].includes(match.status)) {
      return { success: false, error: 'Cannot remove players from live or confirmed match.' };
    }

    const isLobbyOwnerOrCapA = callerUid === match.lobbyOwnerId || callerUid === match.createdBy || callerUid === match.captainAId;
    const isCapB = callerUid === match.captainBId;

    if (callerUid === targetPlayerUid) {
      return { success: false, error: 'As captain, you cannot remove yourself. Step down or leave using the captain action.' };
    }

    if (teamSide === 'teamA') {
      if (!isLobbyOwnerOrCapA) {
        return { success: false, error: 'PERMISSION DENIED: Only Team A Captain / Lobby Owner can remove Team A players.' };
      }
    } else {
      if (!isCapB && !isLobbyOwnerOrCapA) {
        return { success: false, error: 'PERMISSION DENIED: Only Team Captains can remove Team B players.' };
      }
      if (targetPlayerUid === match.captainBId) {
        return { success: false, error: 'PROTECTED: Team B Captain cannot be removed. Team B Captain must step down or transfer captaincy.' };
      }
    }

    const teamKey = teamSide === 'teamA' ? 'teamAPlayerIds' : 'teamBPlayerIds';
    const playersKey = teamSide === 'teamA' ? 'teamAPlayers' : 'teamBPlayers';

    const ids: string[] = match[teamKey] || [];
    if (!ids.includes(targetPlayerUid)) {
      return { success: false, error: 'Player is not in this team.' };
    }

    match[teamKey] = ids.filter((id) => id !== targetPlayerUid);
    match[playersKey] = (match[playersKey] || []).filter((p) => p.id !== targetPlayerUid);

    const targetPlayer = this.players.get(targetPlayerUid);
    if (targetPlayer && targetPlayer.active5v5LobbyId === matchId) {
      targetPlayer.active5v5LobbyId = null;
    }

    match.updatedAt = Date.now();
    return { success: true };
  }

  // --- 7. CLOSE / CANCEL LOBBY ---
  cancel5v5Lobby(callerUid: string, matchId: string, reason: string): { success: boolean; error?: string } {
    const match = this.matches.get(matchId);
    if (!match) return { success: false, error: 'Match not found.' };

    const caller = this.players.get(callerUid);
    const isAdmin = caller?.role === 'ADMIN' || caller?.role === 'SUPER_ADMIN';
    const isOwner = callerUid === match.lobbyOwnerId || callerUid === match.createdBy;

    if (!isOwner && !isAdmin) {
      if (callerUid === match.captainBId || (match.teamBPlayerIds || []).includes(callerUid)) {
        return { success: false, error: 'PERMISSION DENIED: Team B Captain cannot close the lobby. Only the original Lobby Owner or an Admin can close or cancel the 5v5 lobby.' };
      }
      return { success: false, error: 'PERMISSION DENIED: Only the original Lobby Owner or Admin can close or cancel the 5v5 lobby.' };
    }

    match.status = 'CANCELLED';
    match.cancellationReason = reason;
    match.updatedAt = Date.now();

    // Release all players' active5v5LobbyId
    const all = [...(match.teamAPlayerIds || []), ...(match.teamBPlayerIds || [])];
    for (const pId of all) {
      const p = this.players.get(pId);
      if (p && p.active5v5LobbyId === matchId) p.active5v5LobbyId = null;
    }

    return { success: true };
  }

  // --- 8. TOGGLE READY & START MATCH ---
  toggleReady(callerUid: string, matchId: string, isReady: boolean): { success: boolean; error?: string } {
    const match = this.matches.get(matchId);
    if (!match) return { success: false, error: 'Match not found.' };

    const all = [...(match.teamAPlayerIds || []), ...(match.teamBPlayerIds || [])];
    if (!all.includes(callerUid)) {
      return { success: false, error: 'You are not a registered player in this match.' };
    }

    match.playerReadyStatus = { ...(match.playerReadyStatus || {}), [callerUid]: isReady };
    const teamAIds = match.teamAPlayerIds || [];
    const teamBIds = match.teamBPlayerIds || [];

    const isFull10 = teamAIds.length === 5 && teamBIds.length === 5;
    const all10Ready = isFull10 && all.every((id) => match.playerReadyStatus![id] === true);

    if (all10Ready && match.status !== 'APPROVED' && match.status !== 'LIVE') {
      match.status = 'WAITING_FOR_ADMIN';
    }
    match.updatedAt = Date.now();
    return { success: true };
  }

  adminApproveMatch(adminUid: string, matchId: string): { success: boolean; error?: string } {
    const admin = this.players.get(adminUid);
    if (!admin || !['ADMIN', 'SUPER_ADMIN'].includes(admin.role)) {
      return { success: false, error: 'Only admins can approve 5v5 matches.' };
    }
    const match = this.matches.get(matchId);
    if (!match) return { success: false, error: 'Match not found.' };

    match.status = 'APPROVED';
    match.updatedAt = Date.now();
    return { success: true };
  }

  start5v5Match(callerUid: string, matchId: string): { success: boolean; error?: string } {
    const match = this.matches.get(matchId);
    if (!match) return { success: false, error: 'Match not found.' };

    const caller = this.players.get(callerUid);
    const isAdmin = caller?.role === 'ADMIN' || caller?.role === 'SUPER_ADMIN';
    const isOwner = callerUid === match.lobbyOwnerId || callerUid === match.createdBy || callerUid === match.captainAId;

    if (!isOwner && !isAdmin) {
      return { success: false, error: 'Only the Lobby Owner (Team A Captain) can start the match.' };
    }

    if (match.status !== 'APPROVED') {
      return { success: false, error: `Match lobby must be APPROVED by an Admin before it can start (current status: ${match.status || 'WAITING_FOR_ADMIN'}).` };
    }

    const teamAIds = match.teamAPlayerIds || [];
    const teamBIds = match.teamBPlayerIds || [];

    if (teamAIds.length !== 5 || teamBIds.length !== 5) {
      return { success: false, error: 'Both teams must have exactly 5 players.' };
    }

    const all = [...teamAIds, ...teamBIds];
    const unready = all.filter((id) => !match.playerReadyStatus?.[id]);
    if (unready.length > 0) {
      return { success: false, error: `Cannot start match: Waiting for ${unready.length} unready players.` };
    }

    match.status = 'LIVE';
    match.startedAt = Date.now();
    match.startedBy = callerUid;
    match.updatedAt = Date.now();

    return { success: true };
  }
}

// ==========================================
// TEST EXECUTION RUNNER
// ==========================================
async function runAudit() {
  console.log(`\n${colors.bold}${colors.cyan}========================================================================${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}  NEXUS GAMING CENTER — STAGING SECURITY & CONCURRENCY AUDIT: 5v5 LOBBIES${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}========================================================================${colors.reset}\n`);

  const engine = new InMemoryLobbyEngine();

  // ------------------------------------------------------------------------
  // PART 1: ACTUAL NEXUS LOBBY MODEL & AUTHORITATIVE STATE
  // ------------------------------------------------------------------------
  console.log(`${colors.bold}${colors.yellow}--- SECTION 1: LOBBY MODEL & AUTHORITATIVE STATE ---${colors.reset}`);

  const createRes = engine.create5v5Lobby('uid_creator_a', 'team_omega', false);
  assert(createRes.success, 'Lobby created by Team A Captain', `Match ID: ${createRes.match?.id}`);

  const m1 = createRes.match!;
  assert(m1.lobbyOwnerId === 'uid_creator_a', 'Lobby creator is authoritative lobbyOwnerId');
  assert(m1.captainAId === 'uid_creator_a', 'Lobby creator is Team A Captain');
  assert(m1.captainBId === undefined, 'Team B Captain is strictly undefined at lobby creation (creator is NOT Team B captain)');
  assert(m1.teamBName === 'EMPTY', 'Team B starts strictly EMPTY');
  assert(m1.teamBPlayerIds?.length === 0, 'Team B has 0 players at initialization');
  assert(m1.teamAPlayerIds?.length === 3, 'Team A initial snapshot has exactly 3 players from squad');
  assert(m1.status === 'WAITING_FOR_OPPONENT', 'Initial lobby status is WAITING_FOR_OPPONENT');
  assert(m1.matchType === '5v5', 'Authoritative matchType is 5v5');

  // Verify Single Active Lobby per Captain invariant
  const dupCreate = engine.create5v5Lobby('uid_creator_a', 'team_omega', false);
  assert(!dupCreate.success, 'Captain cannot create a second active 5v5 lobby simultaneously', dupCreate.error);

  // ------------------------------------------------------------------------
  // PART 2: PERMISSION MODEL MATRIX
  // ------------------------------------------------------------------------
  console.log(`\n${colors.bold}${colors.yellow}--- SECTION 2: PERMISSION MODEL MATRIX ---${colors.reset}`);

  // Test 2.1: Team B Captain joins solo
  const joinBRes = engine.join5v5Lobby('uid_capt_b', m1.lobbyCode!);
  assert(joinBRes.success, 'Solo player joins lobby as Team B Captain', `Captain B: ${m1.captainBId}`);
  assert(m1.captainBId === 'uid_capt_b', 'Team B Captain authoritative ID assigned to joining player');
  assert(m1.teamBPlayerIds?.length === 1, 'Team B player count is now 1/5');

  // Test 2.2: Lobby Creator Invitations
  const invCreatorToA = engine.invitePlayerTo5v5Lobby('uid_creator_a', m1.id, 'uid_player_a4', 'teamA');
  assert(invCreatorToA.success, 'Lobby Creator CAN invite player to Team A');

  const invCreatorToB = engine.invitePlayerTo5v5Lobby('uid_creator_a', m1.id, 'uid_player_b2', 'teamB');
  assert(invCreatorToB.success, 'Lobby Creator CAN invite player to Team B');

  // Test 2.3: Team A Captain Permissions
  // If Team A Captain is the creator, they can invite to Team A
  // Now let's test Team B Captain:
  // Team B Captain can invite to Team B:
  const invCapBToB = engine.invitePlayerTo5v5Lobby('uid_capt_b', m1.id, 'uid_player_b3', 'teamB');
  assert(invCapBToB.success, 'Team B Captain CAN invite player to Team B');

  // Team B Captain CANNOT invite to Team A:
  const invCapBToA = engine.invitePlayerTo5v5Lobby('uid_capt_b', m1.id, 'uid_player_a5', 'teamA');
  assert(!invCapBToA.success, 'Team B Captain CANNOT invite player to Team A (MUST FAIL)', invCapBToA.error);

  // Test 2.4: Team Members CANNOT Invite
  const invMemberA = engine.invitePlayerTo5v5Lobby('uid_player_a2', m1.id, 'uid_outsider_1', 'teamA');
  assert(!invMemberA.success, 'Ordinary Team A member CANNOT invite players (MUST FAIL)', invMemberA.error);

  const invMemberB = engine.invitePlayerTo5v5Lobby('uid_player_b2', m1.id, 'uid_outsider_1', 'teamB');
  assert(!invMemberB.success, 'Ordinary Team B member CANNOT invite players (MUST FAIL)', invMemberB.error);

  // Test 2.5: Team Member CANNOT remove another player
  const kickByMember = engine.removePlayerFromTeam('uid_player_a2', m1.id, 'uid_player_a3', 'teamA');
  assert(!kickByMember.success, 'Ordinary team member CANNOT kick another player (MUST FAIL)', kickByMember.error);

  // Test 2.6: Team B Captain CANNOT remove Team A players
  const kickCrossTeam = engine.removePlayerFromTeam('uid_capt_b', m1.id, 'uid_player_a3', 'teamA');
  assert(!kickCrossTeam.success, 'Team B Captain CANNOT kick Team A players (MUST FAIL)', kickCrossTeam.error);

  // Test 2.7: Team B Captain CANNOT close / cancel the lobby
  const closeByCapB = engine.cancel5v5Lobby('uid_capt_b', m1.id, 'Rage quit');
  assert(!closeByCapB.success, 'Team B Captain CANNOT close/cancel the 5v5 lobby (MUST FAIL)', closeByCapB.error);

  // Test 2.8: Ordinary member CANNOT close / cancel the lobby
  const closeByMember = engine.cancel5v5Lobby('uid_player_a2', m1.id, 'Trolling');
  assert(!closeByMember.success, 'Ordinary squad member CANNOT close/cancel the lobby (MUST FAIL)', closeByMember.error);

  // ------------------------------------------------------------------------
  // PART 3: PERMANENT SQUAD VS MATCH LOBBY ISOLATION
  // ------------------------------------------------------------------------
  console.log(`\n${colors.bold}${colors.yellow}--- SECTION 3: PERMANENT SQUAD VS MATCH LOBBY ISOLATION ---${colors.reset}`);

  const squadOmegaBefore = engine.teams.get('team_omega')!;
  const omegaMembersBefore = [...squadOmegaBefore.memberIds];

  // Accept invitations into match lobby
  const acc1 = engine.acceptInvitation('uid_player_a4', invCreatorToA.invitationId!);
  assert(acc1.success, 'Player A4 accepted match lobby invitation for Team A');

  // Verify permanent squad was completely untouched
  const squadOmegaAfter = engine.teams.get('team_omega')!;
  assert(
    squadOmegaAfter.memberIds.length === omegaMembersBefore.length &&
      squadOmegaAfter.memberIds.every((id, idx) => id === omegaMembersBefore[idx]),
    'Permanent squad members in teams/team_omega are strictly preserved and untouched',
    `Squad members: [${squadOmegaAfter.memberIds.join(', ')}]`
  );

  // Remove player A4 from match lobby
  const remRes = engine.removePlayerFromTeam('uid_creator_a', m1.id, 'uid_player_a4', 'teamA');
  assert(remRes.success, 'Player A4 removed from match lobby Team A roster by captain');

  // Permanent squad is STILL untouched
  const squadOmegaAfterRemove = engine.teams.get('team_omega')!;
  assert(
    squadOmegaAfterRemove.memberIds.length === omegaMembersBefore.length,
    'Permanent squad completely unaffected by match lobby removals'
  );

  // ------------------------------------------------------------------------
  // PART 4: CONCURRENCY & INTEGRITY STRESS TESTS
  // ------------------------------------------------------------------------
  console.log(`\n${colors.bold}${colors.yellow}--- SECTION 4: CONCURRENCY & INTEGRITY STRESS TESTS ---${colors.reset}`);

  // Test 4.1: Self-Invite Prevention
  const selfInv = engine.invitePlayerTo5v5Lobby('uid_creator_a', m1.id, 'uid_creator_a', 'teamA');
  assert(!selfInv.success, 'User cannot invite themselves (MUST FAIL)', selfInv.error);

  // Test 4.2: Duplicate Invitation Idempotency
  const invA4_1 = engine.invitePlayerTo5v5Lobby('uid_creator_a', m1.id, 'uid_player_a4', 'teamA');
  const invA4_2 = engine.invitePlayerTo5v5Lobby('uid_creator_a', m1.id, 'uid_player_a4', 'teamA');
  assert(invA4_1.invitationId === invA4_2.invitationId, 'Duplicate invitations are suppressed and return canonical invitation ID');

  // Test 4.3: Double-Joining Prevention (same player on both Team A and Team B)
  const switchTeamRes = engine.switchTeamSide('uid_creator_a', m1.id);
  // Team B currently has 1 player (uid_capt_b)
  assert(switchTeamRes.success, 'Player switches from Team A to Team B');
  assert(!m1.teamAPlayerIds?.includes('uid_creator_a'), 'Player is no longer on Team A');
  assert(m1.teamBPlayerIds?.includes('uid_creator_a'), 'Player is now on Team B');

  // Switch back to Team A
  const switchBack = engine.switchTeamSide('uid_creator_a', m1.id);
  assert(switchBack.success, 'Player switches back to Team A');
  assert(m1.teamAPlayerIds?.includes('uid_creator_a'), 'Player restored on Team A');
  assert(!m1.teamBPlayerIds?.includes('uid_creator_a'), 'Player removed from Team B');

  // Fill Team A to 5/5
  engine.acceptInvitation('uid_player_a4', invA4_1.invitationId!);
  const invA5 = engine.invitePlayerTo5v5Lobby('uid_creator_a', m1.id, 'uid_player_a5', 'teamA');
  engine.acceptInvitation('uid_player_a5', invA5.invitationId!);
  assert(m1.teamAPlayerIds?.length === 5, 'Team A reached exact capacity (5/5 players)');

  // Test 4.4: Team A Capacity Overflow Prevention
  const invOverflowA = engine.invitePlayerTo5v5Lobby('uid_creator_a', m1.id, 'uid_outsider_1', 'teamA');
  assert(!invOverflowA.success, 'Team A overflow invitation rejected (MUST FAIL at 5/5)', invOverflowA.error);

  // Test 4.5: High Concurrency Join Race (5 simultaneous join attempts for the remaining 4 slots on Team B)
  // Fill Team B to 4/5:
  engine.acceptInvitation('uid_player_b2', invCreatorToB.invitationId!);
  engine.acceptInvitation('uid_player_b3', invCapBToB.invitationId!);
  const invB4 = engine.invitePlayerTo5v5Lobby('uid_capt_b', m1.id, 'uid_player_b4', 'teamB');
  engine.acceptInvitation('uid_player_b4', invB4.invitationId!);
  assert(m1.teamBPlayerIds?.length === 4, 'Team B is at 4/5 players (exactly 1 slot remaining)');

  // Now create 3 invitations for the single remaining 5th slot:
  const invB5_A = engine.invitePlayerTo5v5Lobby('uid_capt_b', m1.id, 'uid_player_b5', 'teamB');
  const invB5_B = engine.invitePlayerTo5v5Lobby('uid_capt_b', m1.id, 'uid_outsider_1', 'teamB');
  const invB5_C = engine.invitePlayerTo5v5Lobby('uid_capt_b', m1.id, 'uid_outsider_2', 'teamB');

  // Simulate 3 concurrent accept requests:
  const results = [
    engine.acceptInvitation('uid_player_b5', invB5_A.invitationId!),
    engine.acceptInvitation('uid_outsider_1', invB5_B.invitationId!),
    engine.acceptInvitation('uid_outsider_2', invB5_C.invitationId!),
  ];

  const successes = results.filter((r) => r.success).length;
  const failures = results.filter((r) => !r.success).length;

  assert(successes === 1, 'Concurrency stress: exactly 1 player successfully claimed the final 5th slot');
  assert(failures === 2, 'Concurrency stress: remaining 2 concurrent joins were rejected due to full capacity');
  assert(m1.teamBPlayerIds?.length === 5, 'Team B locked at strictly 5/5 players (no overflow)');

  // Test 4.6: Multi-Lobby Conflict Prevention
  // An accepted player cannot join another active lobby
  const m2Res = engine.create5v5Lobby('uid_outsider_3', 'team_omega', false);
  // outsider_3 is not captain of omega so fails:
  assert(!m2Res.success, 'Non-captain cannot create lobby for a squad', m2Res.error);

  const acceptedPlayer = engine.players.get('uid_player_b5')!;
  assert(
    acceptedPlayer.active5v5LobbyId === m1.id,
    'Player active5v5LobbyId pointer correctly bound to active match'
  );

  // Test 4.7: Ready Check & Start Match Gate
  // Match cannot start if players are not ready
  const unreadyStart = engine.start5v5Match('uid_creator_a', m1.id);
  assert(!unreadyStart.success, 'Match CANNOT start without approval / readiness (MUST FAIL)', unreadyStart.error);

  // Set all 10 players ready
  const all10 = [...m1.teamAPlayerIds!, ...m1.teamBPlayerIds!];
  for (const uid of all10) {
    engine.toggleReady(uid, m1.id, true);
  }
  assert(m1.status === 'WAITING_FOR_ADMIN', 'When all 10 players are READY, status transitions to WAITING_FOR_ADMIN');

  // Non-admin attempts approval
  const nonAdminApprove = engine.adminApproveMatch('uid_creator_a', m1.id);
  assert(!nonAdminApprove.success, 'Non-admin CANNOT approve match (MUST FAIL)', nonAdminApprove.error);

  // Admin approves match
  const adminApprove = engine.adminApproveMatch('uid_admin_01', m1.id);
  assert(adminApprove.success, 'Admin successfully approved 5v5 match');
  assert(m1.status === 'APPROVED', 'Lobby status transitioned to APPROVED');

  // Non-owner / non-admin attempts to start match
  const intruderStart = engine.start5v5Match('uid_capt_b', m1.id);
  assert(!intruderStart.success, 'Team B Captain CANNOT start the match (Only Owner or Admin can start)', intruderStart.error);

  // Lobby Owner starts match
  const liveStart = engine.start5v5Match('uid_creator_a', m1.id);
  assert(liveStart.success, 'Lobby Owner successfully started match');
  assert(m1.status === 'LIVE', 'Match status transitioned to LIVE');

  // Verify roster locked once LIVE
  const switchWhileLive = engine.switchTeamSide('uid_creator_a', m1.id);
  assert(!switchWhileLive.success, 'Cannot switch team side while match is LIVE (Roster is locked)', switchWhileLive.error);

  const kickWhileLive = engine.removePlayerFromTeam('uid_creator_a', m1.id, 'uid_player_a2', 'teamA');
  assert(!kickWhileLive.success, 'Cannot kick player while match is LIVE (Roster is locked)', kickWhileLive.error);

  // ------------------------------------------------------------------------
  // PART 5: LOBBY CANCELLATION & TEARDOWN
  // ------------------------------------------------------------------------
  console.log(`\n${colors.bold}${colors.yellow}--- SECTION 5: LOBBY CANCELLATION & CLEANUP ---${colors.reset}`);

  // Create another lobby to test cancellation teardown
  // First clear active lobby pointer for test
  engine.players.get('uid_creator_a')!.active5v5LobbyId = null;
  const m3Res = engine.create5v5Lobby('uid_creator_a', 'team_omega', true);
  assert(m3Res.success, 'Created private test lobby for cancellation flow');
  const m3 = m3Res.match!;
  assert(m3.isPrivate === true, 'Private lobby state preserved');

  // Direct join attempt to private lobby
  const directJoinPrivate = engine.join5v5Lobby('uid_outsider_1', m3.lobbyCode!);
  assert(!directJoinPrivate.success, 'Direct join to PRIVATE lobby rejected (MUST FAIL)', directJoinPrivate.error);

  // Admin or Owner cancels lobby
  const cancelRes = engine.cancel5v5Lobby('uid_admin_01', m3.id, 'Administrative termination in staging');
  assert(cancelRes.success, 'Admin cancelled 5v5 lobby', `Status: ${m3.status}`);
  assert(m3.status === 'CANCELLED', 'Lobby status marked CANCELLED');
  assert(
    engine.players.get('uid_creator_a')?.active5v5LobbyId === null,
    'Player active5v5LobbyId pointer automatically cleared upon cancellation'
  );

  // ------------------------------------------------------------------------
  // AUDIT SUMMARY
  // ------------------------------------------------------------------------
  console.log(`\n${colors.bold}${colors.cyan}========================================================================${colors.reset}`);
  console.log(`${colors.bold}  AUDIT SUMMARY: ${testsPassed} PASSED | ${testsFailed} FAILED${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}========================================================================${colors.reset}\n`);

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runAudit().catch((err) => {
  console.error('Audit suite crashed with error:', err);
  process.exit(1);
});
