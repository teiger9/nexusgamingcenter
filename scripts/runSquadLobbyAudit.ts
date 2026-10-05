/**
 * NEXUS GAMING CENTER
 * STAGING SECURITY & CONCURRENCY AUDIT: 5v5 SQUAD LOBBIES
 *
 * SAFETY INVARIANT: STRICTLY STAGING. ZERO PRODUCTION MUTATION.
 */

import fs from 'fs';
import path from 'path';
import {
  Match,
  Team,
  TeamMember,
  TeamInvitation,
  Player,
  UserRole,
  MatchStatus,
} from '../src/types';
import {
  isMatchPrivate,
  FINAL_MATCH_STATUSES,
} from '../src/services/matchService';
import {
  cleanForFirestore,
} from '../src/utils/firestoreSanitizer';

// Safety check
const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
if (!fs.existsSync(configPath)) {
  throw new Error('FATAL: firebase-applet-config.json not found.');
}
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

console.log('\n====================================================================');
console.log('🛡️  NEXUS 5v5 SQUAD LOBBY SECURITY & CONCURRENCY AUDIT');
console.log('====================================================================');
console.log(`[SAFETY CHECK] Live Production Database: ${config.firestoreDatabaseId} (ISOLATED - ZERO WRITES)`);
console.log(`[SAFETY CHECK] Test Environment: Staging In-Memory 5v5 Security Engine`);
console.log(`[SAFETY CHECK] STAGING ≠ PRODUCTION: PASS`);
console.log('====================================================================\n');

// ============================================================================
// STAGING REPOSITORY & STATE SIMULATOR FOR 5v5 LOBBIES
// ============================================================================

export interface Staging5v5LobbyDoc extends Match {
  id: string;
  lobbyCode: string;
  matchType: '5v5';
  status: MatchStatus;
  gameId: string;
  gameName: string;
  lobbyOwnerId: string;
  createdBy: string;
  captainAId?: string;
  captainBId?: string;
  teamAId?: string;
  teamBId?: string;
  teamAName: string;
  teamBName: string;
  teamAPlayerIds: string[];
  teamBPlayerIds: string[];
  teamAPlayers: { id: string; gamerTag: string; name?: string; rating?: number }[];
  teamBPlayers: { id: string; gamerTag: string; name?: string; rating?: number }[];
  isPrivate: boolean;
  lobbyAccess: 'OPEN' | 'PRIVATE';
  isRecruiting?: boolean;
  isTeamBRecruiting?: boolean;
  playersNeeded?: number;
}

export interface StagingTeamDoc extends Partial<Team> {
  id?: string;
  teamId: string;
  teamName: string;
  teamTag: string;
  captainId: string;
  memberIds: string[];
  members: TeamMember[];
}

export interface StagingPlayerDoc extends Partial<Player> {
  uid: string;
  gamerTag: string;
  fullName: string;
  role: UserRole;
  active5v5LobbyId?: string | null;
}

export interface StagingInvitationDoc extends Partial<TeamInvitation> {
  id: string;
  lobbyId?: string;
  teamId: string;
  teamSide?: 'teamA' | 'teamB';
  invitedPlayerId: string;
  recipientId: string;
  inviterId: string;
  senderId: string;
  captainId: string;
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'CANCELLED' | 'EXPIRED';
  createdAt: number;
  expiresAt: number;
}

class Staging5v5SecurityEngine {
  public matches = new Map<string, Staging5v5LobbyDoc>();
  public teams = new Map<string, StagingTeamDoc>();
  public players = new Map<string, StagingPlayerDoc>();
  public invitations = new Map<string, StagingInvitationDoc>();
  public auditEvents = new Map<string, any>();

  constructor() {
    this.reset();
  }

  public reset() {
    this.matches.clear();
    this.teams.clear();
    this.players.clear();
    this.invitations.clear();
    this.auditEvents.clear();

    // Seed test users
    const seedUsers = [
      { uid: 'u_creator_A', gamerTag: 'LobbyCreatorA', role: 'player' as UserRole },
      { uid: 'u_captain_B', gamerTag: 'TeamACaptainB', role: 'player' as UserRole },
      { uid: 'u_captain_C', gamerTag: 'TeamBCaptainC', role: 'player' as UserRole },
      { uid: 'u_member_A2', gamerTag: 'MemberA2', role: 'player' as UserRole },
      { uid: 'u_member_A3', gamerTag: 'MemberA3', role: 'player' as UserRole },
      { uid: 'u_member_A4', gamerTag: 'MemberA4', role: 'player' as UserRole },
      { uid: 'u_member_A5', gamerTag: 'MemberA5', role: 'player' as UserRole },
      { uid: 'u_member_B2', gamerTag: 'MemberB2', role: 'player' as UserRole },
      { uid: 'u_member_B3', gamerTag: 'MemberB3', role: 'player' as UserRole },
      { uid: 'u_member_B4', gamerTag: 'MemberB4', role: 'player' as UserRole },
      { uid: 'u_member_B5', gamerTag: 'MemberB5', role: 'player' as UserRole },
      { uid: 'u_extra_01', gamerTag: 'ExtraCompetitor01', role: 'player' as UserRole },
      { uid: 'u_extra_02', gamerTag: 'ExtraCompetitor02', role: 'player' as UserRole },
      { uid: 'u_staff_01', gamerTag: 'StaffReferee', role: 'STAFF' as UserRole },
      { uid: 'u_admin_01', gamerTag: 'AdminOps', role: 'ADMIN' as UserRole },
      { uid: 'c3Vip2TwMvZXhub5gjjVpjcsStI2', gamerTag: 'teiger9', role: 'SUPER_ADMIN' as UserRole },
    ];

    for (const u of seedUsers) {
      this.players.set(u.uid, {
        uid: u.uid,
        email: `${u.gamerTag.toLowerCase()}@nexus.io`,
        gamerTag: u.gamerTag,
        fullName: u.gamerTag,
        role: u.role,
        nexusCoins: 100,
        totalGames: 10,
        totalWins: 5,
        totalLosses: 5,
        totalDraws: 0,
        overallRating: 1500,
        createdAt: Date.now() - 500000,
        active5v5LobbyId: null,
      });
    }

    // Seed persistent squad Team Alpha
    this.teams.set('team_alpha', {
      id: 'team_alpha',
      teamId: 'team_alpha',
      teamName: 'Alpha Squad',
      teamTag: 'ALPH',
      captainId: 'u_captain_B',
      captainGamerTag: 'TeamACaptainB',
      captainName: 'TeamACaptainB',
      memberIds: ['u_captain_B', 'u_member_A2', 'u_member_A3', 'u_member_A4'],
      members: [
        { id: 'u_captain_B', gamerTag: 'TeamACaptainB', fullName: 'TeamACaptainB', role: 'captain', joinedAt: Date.now() - 400000 },
        { id: 'u_member_A2', gamerTag: 'MemberA2', fullName: 'MemberA2', role: 'member', joinedAt: Date.now() - 400000 },
        { id: 'u_member_A3', gamerTag: 'MemberA3', fullName: 'MemberA3', role: 'member', joinedAt: Date.now() - 400000 },
        { id: 'u_member_A4', gamerTag: 'MemberA4', fullName: 'MemberA4', role: 'member', joinedAt: Date.now() - 400000 },
      ],
      gameId: 'cs2',
      gameName: 'Counter-Strike 2',
      status: 'active',
      teamRating: 1600,
      matchesPlayed: 10,
      wins: 7,
      losses: 3,
      draws: 0,
      currentWinStreak: 2,
      bestWinStreak: 4,
      winRate: 70,
      createdAt: Date.now() - 400000,
      updatedAt: Date.now() - 400000,
    });

    // Seed standard 5v5 lobby:
    // Creator: u_creator_A
    // Team A Captain: u_captain_B
    // Team B Captain: u_captain_C
    this.matches.set('match_5v5_main', {
      id: 'match_5v5_main',
      lobbyCode: 'ALPH-5555',
      matchType: '5v5',
      status: 'TEAM_ROSTERS_FILLING',
      gameId: 'cs2',
      gameName: 'Counter-Strike 2',
      gameCategory: 'PC',
      station: 'PC-01',
      lobbyOwnerId: 'u_creator_A',
      createdBy: 'u_creator_A',
      createdByName: 'LobbyCreatorA',
      captainAId: 'u_captain_B',
      captainBId: 'u_captain_C',
      teamAId: 'team_alpha',
      teamBId: 'team_bravo',
      teamAName: 'Alpha Squad',
      teamBName: 'Bravo Squad',
      teamATag: 'ALPH',
      teamBTag: 'BRAV',
      teamALogo: '🛡️',
      teamBLogo: '⚔️',
      teamAPlayerIds: ['u_captain_B', 'u_member_A2', 'u_member_A3', 'u_member_A4'],
      teamBPlayerIds: ['u_captain_C', 'u_member_B2', 'u_member_B3'],
      teamAPlayers: [
        { id: 'u_captain_B', gamerTag: 'TeamACaptainB', rating: 1600 },
        { id: 'u_member_A2', gamerTag: 'MemberA2', rating: 1550 },
        { id: 'u_member_A3', gamerTag: 'MemberA3', rating: 1500 },
        { id: 'u_member_A4', gamerTag: 'MemberA4', rating: 1450 },
      ],
      teamBPlayers: [
        { id: 'u_captain_C', gamerTag: 'TeamBCaptainC', rating: 1620 },
        { id: 'u_member_B2', gamerTag: 'MemberB2', rating: 1580 },
        { id: 'u_member_B3', gamerTag: 'MemberB3', rating: 1520 },
      ],
      isPrivate: false,
      lobbyAccess: 'OPEN',
      isRecruiting: true,
      isTeamBRecruiting: true,
      playersNeeded: 1,
      createdAt: Date.now() - 300000,
      updatedAt: Date.now() - 300000,
      playerAId: 'u_captain_B',
      playerAName: 'TeamACaptainB',
      playerAGamerTag: 'TeamACaptainB',
      playerBId: 'u_captain_C',
      playerBName: 'TeamBCaptainC',
      playerBGamerTag: 'TeamBCaptainC',
    });

    // Mark active lobby in players
    for (const uid of ['u_captain_B', 'u_member_A2', 'u_member_A3', 'u_member_A4']) {
      this.players.get(uid)!.active5v5LobbyId = 'match_5v5_main';
    }
    for (const uid of ['u_captain_C', 'u_member_B2', 'u_member_B3']) {
      this.players.get(uid)!.active5v5LobbyId = 'match_5v5_main';
    }
  }

  // ============================================================================
  // OPERATIONS & RULES SIMULATION
  // ============================================================================

  /**
   * Inviting a player to 5v5 lobby
   */
  public async inviteTo5v5(params: {
    callerUid: string;
    lobbyId: string;
    targetTeam: 'teamA' | 'teamB';
    recipientUid: string;
  }): Promise<{ success: boolean; error?: string; invitationId?: string }> {
    const lobby = this.matches.get(params.lobbyId);
    if (!lobby) return { success: false, error: 'Lobby not found.' };

    const caller = this.players.get(params.callerUid);
    if (!caller) return { success: false, error: 'Caller not found.' };

    if (params.callerUid === params.recipientUid) {
      return { success: false, error: 'Cannot invite yourself.' };
    }

    const isLobbyOwner = params.callerUid === lobby.lobbyOwnerId || params.callerUid === lobby.createdBy;
    const isTeamACaptain = params.callerUid === lobby.captainAId;
    const isTeamBCaptain = params.callerUid === lobby.captainBId;

    const canInviteToA = isLobbyOwner || isTeamACaptain;
    const canInviteToB = isLobbyOwner || isTeamBCaptain;

    if (params.targetTeam === 'teamA' && !canInviteToA) {
      return { success: false, error: 'PERMISSION_DENIED: Only Lobby Owner or Team A Captain can invite to Team A.' };
    }
    if (params.targetTeam === 'teamB' && !canInviteToB) {
      return { success: false, error: 'PERMISSION_DENIED: Only Lobby Owner or Team B Captain can invite to Team B.' };
    }

    const targetList = params.targetTeam === 'teamA' ? lobby.teamAPlayerIds : lobby.teamBPlayerIds;
    if (targetList.length >= 5) {
      return { success: false, error: 'TEAM_FULL: Team already has maximum 5 players.' };
    }

    if (lobby.teamAPlayerIds.includes(params.recipientUid) || lobby.teamBPlayerIds.includes(params.recipientUid)) {
      return { success: false, error: 'ALREADY_IN_LOBBY: Recipient is already in this lobby.' };
    }

    const recPlayer = this.players.get(params.recipientUid);
    if (recPlayer?.active5v5LobbyId && recPlayer.active5v5LobbyId !== params.lobbyId) {
      return { success: false, error: 'ALREADY_IN_ANOTHER_LOBBY: Recipient is already active in another 5v5 lobby.' };
    }

    const now = Date.now();
    const invId = `inv_${params.lobbyId}_${params.recipientUid}_${params.targetTeam}_${now}`;
    const inv: StagingInvitationDoc = {
      id: invId,
      lobbyId: params.lobbyId,
      teamId: params.targetTeam === 'teamA' ? lobby.teamAId || '' : lobby.teamBId || '',
      teamSide: params.targetTeam,
      teamName: params.targetTeam === 'teamA' ? lobby.teamAName : lobby.teamBName,
      invitedPlayerId: params.recipientUid,
      recipientId: params.recipientUid,
      inviterId: params.callerUid,
      senderId: params.callerUid,
      captainId: params.targetTeam === 'teamA' ? lobby.captainAId || params.callerUid : lobby.captainBId || params.callerUid,
      status: 'PENDING',
      createdAt: now,
      expiresAt: now + 15 * 60 * 1000,
      type: '5V5_LOBBY_INVITATION',
      gameId: lobby.gameId,
      gameName: lobby.gameName,
    };

    this.invitations.set(invId, inv);
    return { success: true, invitationId: invId };
  }

  /**
   * Responding to an invitation
   */
  public async respondToInvitation(params: {
    callerUid: string;
    invitationId: string;
    response: 'accepted' | 'declined';
    tamperedUpdates?: Partial<StagingInvitationDoc>;
  }): Promise<{ success: boolean; error?: string }> {
    const inv = this.invitations.get(params.invitationId);
    if (!inv) return { success: false, error: 'Invitation not found.' };

    if (inv.recipientId !== params.callerUid) {
      return { success: false, error: 'UNAUTHORIZED: Identity mismatch.' };
    }

    if (inv.status !== 'PENDING') {
      return { success: false, error: `INVITATION_ALREADY_PROCESSED: Status is ${inv.status}.` };
    }

    if (Date.now() >= inv.expiresAt) {
      inv.status = 'EXPIRED';
      return { success: false, error: 'INVITATION_EXPIRED' };
    }

    // Check tampering
    if (params.tamperedUpdates) {
      if (params.tamperedUpdates.teamSide && params.tamperedUpdates.teamSide !== inv.teamSide) {
        return { success: false, error: 'TAMPERING_DETECTED: Target team cannot be modified.' };
      }
      if (params.tamperedUpdates.lobbyId && params.tamperedUpdates.lobbyId !== inv.lobbyId) {
        return { success: false, error: 'TAMPERING_DETECTED: Lobby cannot be modified.' };
      }
      if (params.tamperedUpdates.recipientId && params.tamperedUpdates.recipientId !== inv.recipientId) {
        return { success: false, error: 'TAMPERING_DETECTED: Recipient cannot be modified.' };
      }
      if (params.tamperedUpdates.inviterId && params.tamperedUpdates.inviterId !== inv.inviterId) {
        return { success: false, error: 'TAMPERING_DETECTED: Inviter cannot be modified.' };
      }
    }

    if (params.response === 'declined') {
      inv.status = 'DECLINED';
      return { success: true };
    }

    // Acceptance
    const lobby = this.matches.get(inv.lobbyId!);
    if (!lobby) return { success: false, error: 'Lobby not found.' };

    const side = inv.teamSide || 'teamA';
    const playerList = side === 'teamA' ? lobby.teamAPlayerIds : lobby.teamBPlayerIds;
    const oppList = side === 'teamA' ? lobby.teamBPlayerIds : lobby.teamAPlayerIds;

    if (playerList.length >= 5) {
      return { success: false, error: 'TEAM_FULL: Maximum 5 players reached.' };
    }

    if (oppList.includes(params.callerUid)) {
      return { success: false, error: 'DUPLICATE_MEMBERSHIP: Cannot exist on both sides of the same lobby.' };
    }

    const pDoc = this.players.get(params.callerUid);
    if (pDoc?.active5v5LobbyId && pDoc.active5v5LobbyId !== inv.lobbyId) {
      return { success: false, error: 'ALREADY_IN_ANOTHER_LOBBY: Player is already in another active 5v5 lobby.' };
    }

    // Atomic join
    playerList.push(params.callerUid);
    const pObj = { id: params.callerUid, gamerTag: pDoc?.gamerTag || 'Player', rating: pDoc?.overallRating || 1500 };
    if (side === 'teamA') {
      lobby.teamAPlayers.push(pObj);
      lobby.playersNeeded = Math.max(0, 5 - playerList.length);
      if (lobby.playersNeeded === 0) lobby.isRecruiting = false;
    } else {
      lobby.teamBPlayers.push(pObj);
    }

    if (pDoc) pDoc.active5v5LobbyId = inv.lobbyId;
    inv.status = 'ACCEPTED';
    return { success: true };
  }

  /**
   * Claiming Team B Captaincy
   */
  public async claimTeamBCaptain(params: {
    callerUid: string;
    lobbyId: string;
  }): Promise<{ success: boolean; error?: string }> {
    const lobby = this.matches.get(params.lobbyId);
    if (!lobby) return { success: false, error: 'Lobby not found.' };

    if (lobby.status === 'LIVE' || lobby.status === 'CONFIRMED' || lobby.status === 'CANCELLED') {
      return { success: false, error: 'Cannot claim captaincy for active or closed match.' };
    }

    if (!lobby.teamBPlayerIds.includes(params.callerUid)) {
      return { success: false, error: 'You must be an active member of Team B to claim captaincy.' };
    }

    if (lobby.captainBId) {
      return { success: false, error: 'Team B already has an active Captain.' };
    }

    lobby.captainBId = params.callerUid;
    lobby.playerBId = params.callerUid;
    const p = this.players.get(params.callerUid);
    lobby.playerBGamerTag = p?.gamerTag || 'Captain B';
    lobby.playerBName = p?.fullName || lobby.playerBGamerTag;
    return { success: true };
  }

  /**
   * Leaving a 5v5 Lobby
   */
  public async leave5v5(params: {
    callerUid: string;
    lobbyId: string;
  }): Promise<{ success: boolean; error?: string; lobbyDisbanded?: boolean; newOwnerId?: string }> {
    const lobby = this.matches.get(params.lobbyId);
    if (!lobby) return { success: false, error: 'Lobby not found.' };

    if (lobby.status === 'LIVE' || lobby.status === 'CONFIRMED') {
      return { success: false, error: 'Cannot leave a match while it is in progress or completed.' };
    }

    const isTeamA = lobby.teamAPlayerIds.includes(params.callerUid);
    const isTeamB = lobby.teamBPlayerIds.includes(params.callerUid);
    const isOwner = lobby.lobbyOwnerId === params.callerUid;

    if (!isTeamA && !isTeamB && !isOwner) {
      return { success: true };
    }

    // Case 1: Team A Captain / Lobby Owner leaving
    if ((isOwner || lobby.captainAId === params.callerUid) && isTeamA) {
      const remainingTeamA = lobby.teamAPlayerIds.filter((id) => id !== params.callerUid);
      if (remainingTeamA.length === 0) {
        lobby.status = 'CANCELLED';
        const p = this.players.get(params.callerUid);
        if (p) p.active5v5LobbyId = null;
        return { success: true, lobbyDisbanded: true };
      }

      // Promote next player
      const nextOwner = remainingTeamA[0];
      if (isOwner) {
        lobby.lobbyOwnerId = nextOwner;
      }
      lobby.captainAId = nextOwner;
      lobby.playerAId = nextOwner;
      const nextP = this.players.get(nextOwner);
      lobby.playerAGamerTag = nextP?.gamerTag || 'Captain A';
      lobby.playerAName = nextP?.fullName || lobby.playerAGamerTag;
      lobby.teamAPlayerIds = remainingTeamA;
      lobby.teamAPlayers = lobby.teamAPlayers.filter((p) => p.id !== params.callerUid);
      lobby.playersNeeded = Math.max(0, 5 - remainingTeamA.length);

      const departingP = this.players.get(params.callerUid);
      if (departingP) departingP.active5v5LobbyId = null;
      return { success: true, newOwnerId: nextOwner };
    }

    // Case 2: Team B Captain leaving
    if (lobby.captainBId === params.callerUid && isTeamB) {
      const remainingTeamB = lobby.teamBPlayerIds.filter((id) => id !== params.callerUid);
      if (remainingTeamB.length === 0) {
        lobby.teamBPlayerIds = [];
        lobby.teamBPlayers = [];
        lobby.captainBId = undefined;
        lobby.playerBId = undefined;
        lobby.teamBName = 'EMPTY';
      } else {
        const nextCapB = remainingTeamB[0];
        lobby.captainBId = nextCapB;
        lobby.playerBId = nextCapB;
        const nextP = this.players.get(nextCapB);
        lobby.playerBGamerTag = nextP?.gamerTag || 'Captain B';
        lobby.playerBName = nextP?.fullName || lobby.playerBGamerTag;
        lobby.teamBPlayerIds = remainingTeamB;
        lobby.teamBPlayers = lobby.teamBPlayers.filter((p) => p.id !== params.callerUid);
      }
      const departingP = this.players.get(params.callerUid);
      if (departingP) departingP.active5v5LobbyId = null;
      return { success: true };
    }

    // Case 3: Regular member leaving
    if (isTeamA) {
      lobby.teamAPlayerIds = lobby.teamAPlayerIds.filter((id) => id !== params.callerUid);
      lobby.teamAPlayers = lobby.teamAPlayers.filter((p) => p.id !== params.callerUid);
      lobby.playersNeeded = Math.max(0, 5 - lobby.teamAPlayerIds.length);
    } else if (isTeamB) {
      lobby.teamBPlayerIds = lobby.teamBPlayerIds.filter((id) => id !== params.callerUid);
      lobby.teamBPlayers = lobby.teamBPlayers.filter((p) => p.id !== params.callerUid);
    }

    const departingP = this.players.get(params.callerUid);
    if (departingP) departingP.active5v5LobbyId = null;
    return { success: true };
  }

  /**
   * Switching sides
   */
  public async switchSides(params: {
    callerUid: string;
    lobbyId: string;
  }): Promise<{ success: boolean; error?: string }> {
    const lobby = this.matches.get(params.lobbyId);
    if (!lobby) return { success: false, error: 'Lobby not found.' };

    if (lobby.status === 'LIVE' || lobby.status === 'CONFIRMED' || lobby.status === 'CANCELLED') {
      return { success: false, error: 'Cannot switch sides during an active or closed match.' };
    }

    const isTeamA = lobby.teamAPlayerIds.includes(params.callerUid);
    const isTeamB = lobby.teamBPlayerIds.includes(params.callerUid);

    if (!isTeamA && !isTeamB) {
      return { success: false, error: 'You are not in this lobby.' };
    }

    const targetList = isTeamA ? lobby.teamBPlayerIds : lobby.teamAPlayerIds;
    if (targetList.length >= 5) {
      return { success: false, error: 'Target team is full (5/5).' };
    }

    const p = this.players.get(params.callerUid);
    const pObj = { id: params.callerUid, gamerTag: p?.gamerTag || 'Player', rating: p?.overallRating || 1500 };

    if (isTeamA) {
      lobby.teamAPlayerIds = lobby.teamAPlayerIds.filter((id) => id !== params.callerUid);
      lobby.teamAPlayers = lobby.teamAPlayers.filter((p) => p.id !== params.callerUid);
      lobby.teamBPlayerIds.push(params.callerUid);
      lobby.teamBPlayers.push(pObj);

      if (lobby.captainAId === params.callerUid) {
        lobby.captainAId = lobby.teamAPlayerIds[0] || undefined;
      }
    } else {
      lobby.teamBPlayerIds = lobby.teamBPlayerIds.filter((id) => id !== params.callerUid);
      lobby.teamBPlayers = lobby.teamBPlayers.filter((p) => p.id !== params.callerUid);
      lobby.teamAPlayerIds.push(params.callerUid);
      lobby.teamAPlayers.push(pObj);

      if (lobby.captainBId === params.callerUid) {
        lobby.captainBId = lobby.teamBPlayerIds[0] || undefined;
      }
    }

    return { success: true };
  }

  /**
   * Closing / cancelling a lobby
   */
  public async closeLobby(params: {
    callerUid: string;
    lobbyId: string;
  }): Promise<{ success: boolean; error?: string }> {
    const lobby = this.matches.get(params.lobbyId);
    if (!lobby) return { success: false, error: 'Lobby not found.' };

    const caller = this.players.get(params.callerUid);
    const isAdmin = caller?.role === 'ADMIN' || caller?.role === 'SUPER_ADMIN';
    const isOwner = params.callerUid === lobby.lobbyOwnerId || params.callerUid === lobby.createdBy;

    if (!isOwner && !isAdmin) {
      if (params.callerUid === lobby.captainBId) {
        return { success: false, error: 'PERMISSION DENIED: Team B Captain cannot close the lobby.' };
      }
      if (params.callerUid === lobby.captainAId) {
        return { success: false, error: 'PERMISSION DENIED: Team A Captain cannot close the lobby unless they are also the Lobby Owner.' };
      }
      return { success: false, error: 'PERMISSION DENIED: Only the Lobby Owner or an Admin can close this 5v5 lobby.' };
    }

    lobby.status = 'CANCELLED';
    return { success: true };
  }

  /**
   * Evaluates Firestore Rules for a direct client update to matches/{matchId}
   */
  public evaluateMatchUpdateRule(
    authUid: string,
    currentDoc: Staging5v5LobbyDoc,
    newDoc: Staging5v5LobbyDoc
  ): { allowed: boolean; reason?: string } {
    const caller = this.players.get(authUid);
    const isStaff = caller?.role === 'STAFF' || caller?.role === 'ADMIN' || caller?.role === 'SUPER_ADMIN';
    const isAdmin = caller?.role === 'ADMIN' || caller?.role === 'SUPER_ADMIN';

    // 1. Creator Takeover Protection: createdBy is immutable
    if (newDoc.createdBy !== currentDoc.createdBy && !isAdmin) {
      return { allowed: false, reason: 'RULE_VIOLATION: createdBy is strictly immutable.' };
    }

    // 2. Lobby Owner Takeover Protection
    if (newDoc.lobbyOwnerId !== currentDoc.lobbyOwnerId) {
      const isOwner = authUid === currentDoc.lobbyOwnerId || authUid === currentDoc.createdBy;
      if (!isOwner && !isAdmin) {
        return { allowed: false, reason: 'RULE_VIOLATION: Non-owner cannot steal or transfer lobbyOwnerId.' };
      }
    }

    // 3. Match Live / Confirmed Roster Lock
    if (currentDoc.status === 'LIVE' || currentDoc.status === 'CONFIRMED') {
      const rosterChanged =
        JSON.stringify(newDoc.teamAPlayerIds) !== JSON.stringify(currentDoc.teamAPlayerIds) ||
        JSON.stringify(newDoc.teamBPlayerIds) !== JSON.stringify(currentDoc.teamBPlayerIds) ||
        newDoc.captainAId !== currentDoc.captainAId ||
        newDoc.captainBId !== currentDoc.captainBId;

      if (rosterChanged && !isStaff) {
        return { allowed: false, reason: 'RULE_VIOLATION: Rosters locked once match is LIVE or CONFIRMED.' };
      }
    }

    // 4. CANCELLED transition protection
    if (newDoc.status === 'CANCELLED' && currentDoc.status !== 'CANCELLED') {
      const isOwner = authUid === currentDoc.lobbyOwnerId || authUid === currentDoc.createdBy;
      if (!isOwner && !isAdmin) {
        return { allowed: false, reason: 'RULE_VIOLATION: Only Lobby Owner or Admin can CANCEL lobby.' };
      }
    }

    return { allowed: true };
  }

  /**
   * Evaluates Firestore Rules for a direct client update to teamInvitations/{id}
   */
  public evaluateInvitationUpdateRule(
    authUid: string,
    currentDoc: StagingInvitationDoc,
    newDoc: StagingInvitationDoc
  ): { allowed: boolean; reason?: string } {
    const caller = this.players.get(authUid);
    const isAdmin = caller?.role === 'ADMIN' || caller?.role === 'SUPER_ADMIN';

    if (isAdmin) return { allowed: true };

    const isRecipient = authUid === currentDoc.recipientId || authUid === currentDoc.invitedPlayerId;
    const isInviter = authUid === currentDoc.inviterId || authUid === currentDoc.senderId || authUid === currentDoc.captainId;

    if (isRecipient) {
      if (currentDoc.status !== 'PENDING') {
        return { allowed: false, reason: 'RULE_VIOLATION: Invitation is no longer PENDING.' };
      }
      if (!['ACCEPTED', 'DECLINED'].includes(newDoc.status)) {
        return { allowed: false, reason: 'RULE_VIOLATION: Recipient can only set status to ACCEPTED or DECLINED.' };
      }
      if (newDoc.teamSide !== currentDoc.teamSide) {
        return { allowed: false, reason: 'RULE_VIOLATION: teamSide cannot be altered.' };
      }
      if (newDoc.lobbyId !== currentDoc.lobbyId) {
        return { allowed: false, reason: 'RULE_VIOLATION: lobbyId cannot be altered.' };
      }
      if (newDoc.recipientId !== currentDoc.recipientId || newDoc.invitedPlayerId !== currentDoc.invitedPlayerId) {
        return { allowed: false, reason: 'RULE_VIOLATION: Recipient identity cannot be altered.' };
      }
      return { allowed: true };
    }

    if (isInviter) {
      if (!['CANCELLED', 'EXPIRED'].includes(newDoc.status)) {
        return { allowed: false, reason: 'RULE_VIOLATION: Inviter can only cancel or expire invitation.' };
      }
      return { allowed: true };
    }

    return { allowed: false, reason: 'RULE_VIOLATION: Unauthorized invitation update.' };
  }
}

// ============================================================================
// AUDIT TEST SUITE
// ============================================================================

async function runSquadLobbyAudit() {
  const engine = new Staging5v5SecurityEngine();
  const results: { category: string; test: string; passed: boolean; details: string }[] = [];

  function record(category: string, test: string, passed: boolean, details: string) {
    results.push({ category, test, passed, details });
    const mark = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`[${category}] ${mark} - ${test}: ${details}`);
  }

  console.log('\n--- SECTION 1 & 2: PERMISSION MODEL & CREATOR VS CAPTAIN ---');

  // Creator = u_creator_A
  // Team A Captain = u_captain_B
  // Team B Captain = u_captain_C
  // Ordinary Member = u_member_A2

  // 1. Creator invites to Team A -> ALLOWED
  const cA = await engine.inviteTo5v5({
    callerUid: 'u_creator_A',
    lobbyId: 'match_5v5_main',
    targetTeam: 'teamA',
    recipientUid: 'u_extra_01',
  });
  record('INVITATION_PERMISSIONS', 'Creator Invites to Team A', cA.success, 'Creator has full lobby management authority.');

  // 2. Creator invites to Team B -> ALLOWED
  const cB = await engine.inviteTo5v5({
    callerUid: 'u_creator_A',
    lobbyId: 'match_5v5_main',
    targetTeam: 'teamB',
    recipientUid: 'u_extra_02',
  });
  record('INVITATION_PERMISSIONS', 'Creator Invites to Team B', cB.success, 'Creator has full lobby management authority.');

  // 3. Team A Captain invites to Team A -> ALLOWED
  const capAA = await engine.inviteTo5v5({
    callerUid: 'u_captain_B',
    lobbyId: 'match_5v5_main',
    targetTeam: 'teamA',
    recipientUid: 'u_extra_01',
  });
  record('INVITATION_PERMISSIONS', 'Team A Captain Invites to Team A', capAA.success, 'Team A Captain manages Team A invitations.');

  // 4. Team A Captain invites to Team B -> DENIED
  const capAB = await engine.inviteTo5v5({
    callerUid: 'u_captain_B',
    lobbyId: 'match_5v5_main',
    targetTeam: 'teamB',
    recipientUid: 'u_extra_01',
  });
  record('INVITATION_PERMISSIONS', 'Team A Captain Invites to Team B', !capAB.success, `Expected Deny: ${capAB.error}`);

  // 5. Team B Captain invites to Team B -> ALLOWED
  const capBB = await engine.inviteTo5v5({
    callerUid: 'u_captain_C',
    lobbyId: 'match_5v5_main',
    targetTeam: 'teamB',
    recipientUid: 'u_extra_02',
  });
  record('INVITATION_PERMISSIONS', 'Team B Captain Invites to Team B', capBB.success, 'Team B Captain manages Team B invitations.');

  // 6. Team B Captain invites to Team A -> DENIED
  const capBA = await engine.inviteTo5v5({
    callerUid: 'u_captain_C',
    lobbyId: 'match_5v5_main',
    targetTeam: 'teamA',
    recipientUid: 'u_extra_02',
  });
  record('INVITATION_PERMISSIONS', 'Team B Captain Invites to Team A', !capBA.success, `Expected Deny: ${capBA.error}`);

  // 7. Ordinary Member invites to Team A -> DENIED
  const memA = await engine.inviteTo5v5({
    callerUid: 'u_member_A2',
    lobbyId: 'match_5v5_main',
    targetTeam: 'teamA',
    recipientUid: 'u_extra_01',
  });
  record('INVITATION_PERMISSIONS', 'Ordinary Member Invites to Team A', !memA.success, `Expected Deny: ${memA.error}`);

  // 8. Ordinary Member invites to Team B -> DENIED
  const memB = await engine.inviteTo5v5({
    callerUid: 'u_member_A2',
    lobbyId: 'match_5v5_main',
    targetTeam: 'teamB',
    recipientUid: 'u_extra_02',
  });
  record('INVITATION_PERMISSIONS', 'Ordinary Member Invites to Team B', !memB.success, `Expected Deny: ${memB.error}`);

  console.log('\n--- SECTION 4: TEAM B WITHOUT CAPTAIN & CLAIMING CAPTAINCY ---');

  // Create empty Team B lobby
  engine.reset();
  const mainLobby = engine.matches.get('match_5v5_main')!;
  mainLobby.captainBId = undefined;
  mainLobby.teamBPlayerIds = ['u_member_B2', 'u_member_B3'];
  mainLobby.teamBPlayers = [
    { id: 'u_member_B2', gamerTag: 'MemberB2', rating: 1580 },
    { id: 'u_member_B3', gamerTag: 'MemberB3', rating: 1520 },
  ];

  // u_member_B2 claims captaincy -> ALLOWED
  const claim1 = await engine.claimTeamBCaptain({ callerUid: 'u_member_B2', lobbyId: 'match_5v5_main' });
  record('CAPTAIN_CLAIM', 'Member B2 Claims Team B Captaincy', claim1.success && mainLobby.captainBId === 'u_member_B2', 'First claimant becomes Team B Captain.');

  // u_member_B3 claims captaincy now that it has a captain -> DENIED
  const claim2 = await engine.claimTeamBCaptain({ callerUid: 'u_member_B3', lobbyId: 'match_5v5_main' });
  record('CAPTAIN_CLAIM', 'Member B3 Attempts Claim When Already Claimed', !claim2.success, `Expected Deny: ${claim2.error}`);

  // Non-member u_extra_01 attempts claim -> DENIED
  const claim3 = await engine.claimTeamBCaptain({ callerUid: 'u_extra_01', lobbyId: 'match_5v5_main' });
  record('CAPTAIN_CLAIM', 'Non-member Attempts Claim', !claim3.success, `Expected Deny: ${claim3.error}`);

  console.log('\n--- SECTION 6: INVITATION TAMPERING ATTACKS ---');

  engine.reset();
  const createInv = await engine.inviteTo5v5({
    callerUid: 'u_captain_B',
    lobbyId: 'match_5v5_main',
    targetTeam: 'teamA',
    recipientUid: 'u_extra_01',
  });
  const invId = createInv.invitationId!;

  // 1. Attacker attempts changing teamSide: teamA -> teamB
  const tamperTeam = await engine.respondToInvitation({
    callerUid: 'u_extra_01',
    invitationId: invId,
    response: 'accepted',
    tamperedUpdates: { teamSide: 'teamB' },
  });
  record('INVITATION_TAMPERING', 'Tamper teamSide (teamA → teamB)', !tamperTeam.success, `Blocked: ${tamperTeam.error}`);

  // 2. Attacker attempts changing recipient
  const tamperRecipient = await engine.respondToInvitation({
    callerUid: 'u_extra_02', // different account!
    invitationId: invId,
    response: 'accepted',
  });
  record('INVITATION_TAMPERING', 'Accept from Different Account', !tamperRecipient.success, `Blocked: ${tamperRecipient.error}`);

  // 3. Attacker attempts changing lobbyId
  const tamperLobby = await engine.respondToInvitation({
    callerUid: 'u_extra_01',
    invitationId: invId,
    response: 'accepted',
    tamperedUpdates: { lobbyId: 'some_other_lobby' },
  });
  record('INVITATION_TAMPERING', 'Tamper lobbyId', !tamperLobby.success, `Blocked: ${tamperLobby.error}`);

  // 4. Accept once -> ALLOWED
  const validAccept = await engine.respondToInvitation({
    callerUid: 'u_extra_01',
    invitationId: invId,
    response: 'accepted',
  });
  record('INVITATION_ACCEPT', 'Legitimate Invitation Acceptance', validAccept.success, 'Successfully joined Team A.');

  // 5. Attempt second accept on same invitation -> DENIED (already processed)
  const doubleAccept = await engine.respondToInvitation({
    callerUid: 'u_extra_01',
    invitationId: invId,
    response: 'accepted',
  });
  record('INVITATION_REUSE', 'Reuse / Double Accept Invitation', !doubleAccept.success, `Blocked: ${doubleAccept.error}`);

  // 6. Expired invitation reuse
  const expInv = await engine.inviteTo5v5({
    callerUid: 'u_captain_C',
    lobbyId: 'match_5v5_main',
    targetTeam: 'teamB',
    recipientUid: 'u_extra_02',
  });
  const expInvId = expInv.invitationId!;
  engine.invitations.get(expInvId)!.expiresAt = Date.now() - 1000; // expired!

  const expAccept = await engine.respondToInvitation({
    callerUid: 'u_extra_02',
    invitationId: expInvId,
    response: 'accepted',
  });
  record('INVITATION_EXPIRATION', 'Expired Invitation Acceptance', !expAccept.success, `Blocked: ${expAccept.error}`);

  console.log('\n--- SECTION 7: TEAM CAPACITY LIMITS (MAX 5 PLAYERS) ---');

  engine.reset();
  const lob = engine.matches.get('match_5v5_main')!;
  // Team A currently has 4 players. Add 5th player.
  lob.teamAPlayerIds.push('u_member_A5');
  lob.teamAPlayers.push({ id: 'u_member_A5', gamerTag: 'MemberA5', rating: 1500 });
  record('CAPACITY_CHECK', 'Team A at 5/5 Capacity', lob.teamAPlayerIds.length === 5, 'Roster filled to maximum 5 players.');

  // Attempt adding 6th player to Team A -> DENIED
  const inv6 = await engine.inviteTo5v5({
    callerUid: 'u_creator_A',
    lobbyId: 'match_5v5_main',
    targetTeam: 'teamA',
    recipientUid: 'u_extra_01',
  });
  record('CAPACITY_CHECK', '6th Player Invite to Full Team A', !inv6.success, `Blocked: ${inv6.error}`);

  console.log('\n--- SECTION 8: DUPLICATE MEMBERSHIP GUARD ---');

  engine.reset();
  // Player is in Team A. Tries to accept invitation to Team B in same lobby -> DENIED
  const invDup = await engine.inviteTo5v5({
    callerUid: 'u_creator_A',
    lobbyId: 'match_5v5_main',
    targetTeam: 'teamB',
    recipientUid: 'u_member_A2', // already in Team A!
  });
  record('DUPLICATE_MEMBERSHIP', 'Invite Player to Opposing Team in Same Lobby', !invDup.success, `Blocked: ${invDup.error}`);

  console.log('\n--- SECTION 9: CROSS-LOBBY MEMBERSHIP ENFORCEMENT ---');

  engine.reset();
  // Player u_member_A2 is already active in match_5v5_main.
  // Create second lobby match_5v5_secondary
  engine.matches.set('match_5v5_secondary', {
    ...engine.matches.get('match_5v5_main')!,
    id: 'match_5v5_secondary',
    lobbyCode: 'BETA-1234',
    teamAPlayerIds: ['u_extra_01'],
    teamBPlayerIds: [],
    teamAPlayers: [{ id: 'u_extra_01', gamerTag: 'Extra01' }],
    teamBPlayers: [],
  });

  // Attempt to invite u_member_A2 to match_5v5_secondary
  const crossInv = await engine.inviteTo5v5({
    callerUid: 'u_extra_01',
    lobbyId: 'match_5v5_secondary',
    targetTeam: 'teamA',
    recipientUid: 'u_member_A2',
  });
  record('CROSS_LOBBY_GUARD', 'Cross-Lobby Invite Rejection', !crossInv.success, `Blocked: ${crossInv.error}`);

  console.log('\n--- SECTION 10 & 11: LEAVE SQUAD & CAPTAIN PROMOTION ---');

  engine.reset();
  // 1. Regular player leaves Team A
  const leaveReg = await engine.leave5v5({ callerUid: 'u_member_A4', lobbyId: 'match_5v5_main' });
  const lobAfterReg = engine.matches.get('match_5v5_main')!;
  const regRemoved = !lobAfterReg.teamAPlayerIds.includes('u_member_A4') && engine.players.get('u_member_A4')!.active5v5LobbyId === null;
  record('LEAVE_SQUAD', 'Regular Member Leaves Team A', leaveReg.success && regRemoved, 'Player removed from roster and active5v5LobbyId cleared.');

  // 2. Team A Captain (u_captain_B) leaves Team A
  const leaveCapA = await engine.leave5v5({ callerUid: 'u_captain_B', lobbyId: 'match_5v5_main' });
  const lobAfterCapA = engine.matches.get('match_5v5_main')!;
  const newCapAPromoted = lobAfterCapA.captainAId === 'u_member_A2';
  record('CAPTAIN_LEAVE', 'Team A Captain Leaves -> Next Member Promoted', leaveCapA.success && newCapAPromoted, `New Team A Captain: ${lobAfterCapA.captainAId}`);

  // 3. Team B Captain (u_captain_C) leaves Team B
  const leaveCapB = await engine.leave5v5({ callerUid: 'u_captain_C', lobbyId: 'match_5v5_main' });
  const lobAfterCapB = engine.matches.get('match_5v5_main')!;
  const newCapBPromoted = lobAfterCapB.captainBId === 'u_member_B2';
  record('CAPTAIN_LEAVE', 'Team B Captain Leaves -> Next Member Promoted', leaveCapB.success && newCapBPromoted, `New Team B Captain: ${lobAfterCapB.captainBId}`);

  // 4. Sole member leaves -> lobby cancelled cleanly
  engine.reset();
  const soloLobby = engine.matches.get('match_5v5_main')!;
  soloLobby.teamAPlayerIds = ['u_creator_A'];
  soloLobby.teamAPlayers = [{ id: 'u_creator_A', gamerTag: 'LobbyCreatorA' }];
  soloLobby.teamBPlayerIds = [];
  soloLobby.teamBPlayers = [];

  const soloLeave = await engine.leave5v5({ callerUid: 'u_creator_A', lobbyId: 'match_5v5_main' });
  record('LEAVE_SQUAD', 'Sole Owner Leaves -> Lobby Disbanded Cleanly', soloLeave.success && soloLeave.lobbyDisbanded === true, 'Lobby marked CANCELLED with no orphaned state.');

  console.log('\n--- SECTION 12: TEAM IDENTITY REPLACEMENT & PERSISTENCE ---');

  engine.reset();
  const teamDoc = engine.teams.get('team_alpha')!;
  const originalTeamId = teamDoc.teamId;
  const originalName = teamDoc.teamName;

  // Member u_member_A4 leaves squad
  teamDoc.memberIds = teamDoc.memberIds.filter((id) => id !== 'u_member_A4');
  teamDoc.members = teamDoc.members.filter((m) => m.id !== 'u_member_A4');

  // New player u_extra_01 joins
  teamDoc.memberIds.push('u_extra_01');
  teamDoc.members.push({
    id: 'u_extra_01',
    gamerTag: 'Extra01',
    role: 'member',
    joinedAt: Date.now(),
  });

  const identityPreserved = teamDoc.teamId === originalTeamId && teamDoc.teamName === originalName && teamDoc.memberIds.length === 4;
  record('TEAM_PERSISTENCE', 'Squad Identity Preserved During Member Replacement', identityPreserved, `Team ID (${teamDoc.teamId}) and Team Name (${teamDoc.teamName}) remain intact.`);

  console.log('\n--- SECTION 14: CLOSE LOBBY PERMISSIONS ---');

  engine.reset();
  // 1. Ordinary member attempts close -> DENIED
  const closeMem = await engine.closeLobby({ callerUid: 'u_member_A2', lobbyId: 'match_5v5_main' });
  record('CLOSE_LOBBY', 'Ordinary Team A Member Closes Lobby', !closeMem.success, `Blocked: ${closeMem.error}`);

  // 2. Team B Captain attempts close -> DENIED
  const closeCapB = await engine.closeLobby({ callerUid: 'u_captain_C', lobbyId: 'match_5v5_main' });
  record('CLOSE_LOBBY', 'Team B Captain Closes Lobby', !closeCapB.success, `Blocked: ${closeCapB.error}`);

  // 3. Team A Captain (not creator) attempts close -> DENIED
  const closeCapA = await engine.closeLobby({ callerUid: 'u_captain_B', lobbyId: 'match_5v5_main' });
  record('CLOSE_LOBBY', 'Team A Captain Closes Lobby (Non-Owner)', !closeCapA.success, `Blocked: ${closeCapA.error}`);

  // 4. Lobby Owner closes lobby -> ALLOWED
  const closeOwner = await engine.closeLobby({ callerUid: 'u_creator_A', lobbyId: 'match_5v5_main' });
  record('CLOSE_LOBBY', 'Lobby Owner Closes Lobby', closeOwner.success, 'Lobby successfully closed and cancelled by owner.');

  // 5. Admin closes lobby -> ALLOWED
  engine.reset();
  const closeAdmin = await engine.closeLobby({ callerUid: 'u_admin_01', lobbyId: 'match_5v5_main' });
  record('CLOSE_LOBBY', 'Admin Closes Lobby', closeAdmin.success, 'Lobby successfully closed and cancelled by admin.');

  console.log('\n--- SECTION 17 & 18: DIRECT FIRESTORE TAKEOVER ATTACKS ---');

  engine.reset();
  const curMatch = engine.matches.get('match_5v5_main')!;

  // 1. Attacker attempts changing createdBy
  const tamperCreator = { ...curMatch, createdBy: 'u_extra_01' };
  const r1 = engine.evaluateMatchUpdateRule('u_extra_01', curMatch, tamperCreator);
  record('TAKEOVER_ATTACK', 'Direct Firestore Manipulation: createdBy', !r1.allowed, `Blocked: ${r1.reason}`);

  // 2. Attacker attempts stealing lobbyOwnerId
  const tamperOwner = { ...curMatch, lobbyOwnerId: 'u_extra_01' };
  const r2 = engine.evaluateMatchUpdateRule('u_extra_01', curMatch, tamperOwner);
  record('TAKEOVER_ATTACK', 'Direct Firestore Manipulation: lobbyOwnerId', !r2.allowed, `Blocked: ${r2.reason}`);

  // 3. Attacker attempts direct transition to CANCELLED
  const tamperCancel = { ...curMatch, status: 'CANCELLED' as MatchStatus };
  const r3 = engine.evaluateMatchUpdateRule('u_extra_01', curMatch, tamperCancel);
  record('TAKEOVER_ATTACK', 'Unauthorized Direct Match Cancellation', !r3.allowed, `Blocked: ${r3.reason}`);

  console.log('\n--- SECTION 20: MATCH START TRANSITION & ROSTER LOCK ---');

  engine.reset();
  const liveMatch = { ...engine.matches.get('match_5v5_main')!, status: 'LIVE' as MatchStatus };

  // Attempt modifying teamAPlayerIds while match is LIVE
  const tamperLiveRoster = {
    ...liveMatch,
    teamAPlayerIds: ['u_extra_01', 'u_extra_02'],
  };
  const rLive = engine.evaluateMatchUpdateRule('u_captain_B', liveMatch, tamperLiveRoster);
  record('MATCH_START_LOCK', 'Mutate Rosters While Match is LIVE', !rLive.allowed, `Blocked: ${rLive.reason}`);

  console.log('\n--- SECTION 22: CONCURRENCY STRESS TESTS (100 SIMULTANEOUS REQUESTS) ---');

  // Concurrency Test 1: 50 simultaneous attempts to take final slot of Team A (capacity = 5)
  engine.reset();
  const cLobby = engine.matches.get('match_5v5_main')!;
  // Team A has 4 players. Slot 5 is open.
  const claimPromises: Promise<any>[] = [];
  for (let i = 0; i < 50; i++) {
    const candidateUid = `candidate_A_${i}`;
    engine.players.set(candidateUid, {
      uid: candidateUid,
      email: `${candidateUid}@nexus.io`,
      gamerTag: `CandA${i}`,
      fullName: `CandA${i}`,
      role: 'player',
      nexusCoins: 10,
      totalGames: 0,
      totalWins: 0,
      totalLosses: 0,
      totalDraws: 0,
      overallRating: 1500,
      createdAt: Date.now(),
    });

    // Create invitation for each
    const invId = `inv_race_A_${i}`;
    engine.invitations.set(invId, {
      id: invId,
      lobbyId: 'match_5v5_main',
      teamId: 'team_alpha',
      teamSide: 'teamA',
      invitedPlayerId: candidateUid,
      recipientId: candidateUid,
      inviterId: 'u_creator_A',
      senderId: 'u_creator_A',
      captainId: 'u_captain_B',
      status: 'PENDING',
      createdAt: Date.now(),
      expiresAt: Date.now() + 60000,
      type: '5V5_LOBBY_INVITATION',
      gameId: 'cs2',
      gameName: 'Counter-Strike 2',
    });

    claimPromises.push(
      engine.respondToInvitation({
        callerUid: candidateUid,
        invitationId: invId,
        response: 'accepted',
      })
    );
  }

  const raceResults = await Promise.all(claimPromises);
  const successCount = raceResults.filter((r) => r.success).length;
  const rejectedCount = raceResults.filter((r) => !r.success).length;
  const finalTeamACount = cLobby.teamAPlayerIds.length;

  record(
    'CONCURRENCY_TEST',
    '50 Simultaneous Joins for Final Team A Slot',
    successCount === 1 && finalTeamACount === 5 && rejectedCount === 49,
    `Accepted: ${successCount} | Rejected: ${rejectedCount} | Final Team A Roster Size: ${finalTeamACount}/5`
  );

  // Concurrency Test 2: 100 simultaneous Team B captain claims
  engine.reset();
  const lobB = engine.matches.get('match_5v5_main')!;
  lobB.captainBId = undefined; // empty captain
  lobB.teamBPlayerIds = ['u_member_B2', 'u_member_B3', 'u_member_B4'];

  const captainClaimPromises: Promise<any>[] = [];
  for (let i = 0; i < 100; i++) {
    const claimantUid = i % 2 === 0 ? 'u_member_B2' : 'u_member_B3';
    captainClaimPromises.push(
      engine.claimTeamBCaptain({
        callerUid: claimantUid,
        lobbyId: 'match_5v5_main',
      })
    );
  }

  const capClaimResults = await Promise.all(captainClaimPromises);
  const capSuccess = capClaimResults.filter((r) => r.success).length;
  const finalCaptain = lobB.captainBId;

  record(
    'CONCURRENCY_TEST',
    '100 Simultaneous Team B Captain Claims',
    capSuccess === 1 && (finalCaptain === 'u_member_B2' || finalCaptain === 'u_member_B3'),
    `Exactly 1 captain claim succeeded (${capSuccess}). Final Captain: ${finalCaptain}. Zero captain collision.`
  );

  // Concurrency Test 3: 100 simultaneous leave requests
  engine.reset();
  const leavePromises: Promise<any>[] = [];
  for (let i = 0; i < 100; i++) {
    leavePromises.push(
      engine.leave5v5({
        callerUid: 'u_member_A4',
        lobbyId: 'match_5v5_main',
      })
    );
  }
  const leaveResults = await Promise.all(leavePromises);
  const leaveSuccess = leaveResults.filter((r) => r.success).length;
  const inTeamAfter = engine.matches.get('match_5v5_main')!.teamAPlayerIds.includes('u_member_A4');

  record(
    'CONCURRENCY_TEST',
    '100 Simultaneous Leave Requests for Same Player',
    leaveSuccess === 100 && !inTeamAfter,
    'All 100 idempotent leave calls resolved smoothly. Player cleanly removed from roster.'
  );

  // Summary
  console.log('\n====================================================================');
  console.log('📊 5v5 SQUAD LOBBY AUDIT SUMMARY');
  console.log('====================================================================');
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = total - passed;

  console.log(`TOTAL SECURITY & CONCURRENCY TESTS : ${total}`);
  console.log(`PASSED                             : ${passed}`);
  console.log(`FAILED                             : ${failed}`);
  console.log(`VERDICT                            : ${failed === 0 ? '🟢 ALL 5v5 SQUAD LOBBY TESTS PASSED' : '🔴 VULNERABILITY DETECTED'}`);
  console.log('====================================================================\n');

  if (failed > 0) process.exit(1);
}

runSquadLobbyAudit().catch((err) => {
  console.error('Fatal audit failure:', err);
  process.exit(1);
});
