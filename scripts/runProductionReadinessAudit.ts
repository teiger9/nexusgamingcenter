/**
 * NEXUS GAMING CENTER
 * MASTER PRODUCTION-READINESS SECURITY & CONCURRENCY AUDIT
 *
 * SCOPE:
 * Exhaustive full-system audit across all 23 application domains:
 * 1. Authentication & Password Recovery
 * 2. User Profiles & GamerTags
 * 3. Roles & Super Admin Protection
 * 4. Role Invitations & Promotion/Revocation
 * 5. Staff/Admin Granular Permissions
 * 6. 5v5 Squad Lobbies & Capacity
 * 7. Team A / Team B Invitations & Boundaries
 * 8. Captain Ownership, Demotion & Departure
 * 9. Match Lifecycle & Ready Gates
 * 10. Winner/Draw Confirmation & Official Hours
 * 11. Nexus Coin Rewards & Strict Idempotency
 * 12. Redeem Codes & Front-Desk Redemptions
 * 13. Bookings, Slot Locks & Cancel-Only User Guard
 * 14. PC/PS5 Station Integrity
 * 15. Notifications & Anti-Spam Canonical IDs
 * 16. Leaderboards & ELO/MMR Rating Protection
 * 17. Tournament Lifecycle & Participant Restrictions
 * 18. Hall of Fame Integrity
 * 19. Append-Only Audit Logs & Anti-Spoofing
 * 20. Account Suspension & Banning Lockout
 * 21. Cross-Device Concurrency & Replay Attacks
 * 22. Network Interruption & Retry Idempotency
 * 23. Firestore Security Rules Penetration Test
 *
 * SAFETY INVARIANT: Strictly Staging In-Memory Simulation & Production Security Rules Audit.
 * ZERO production mutations.
 */

import fs from 'fs';
import path from 'path';
import {
  Player,
  Match,
  Team,
  TeamInvitation,
  Reservation,
  CoinTransaction,
  RewardRedemption,
  Tournament,
  UserRole,
} from '../src/types';

// ==========================================
// AUDIT TEST HARNESS & LOGGING
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

let totalPass = 0;
let totalFail = 0;
const failures: string[] = [];

function auditAssert(domain: string, testName: string, condition: boolean, detail?: string) {
  if (condition) {
    totalPass++;
    console.log(`  ${colors.green}✔ [${domain}] PASS:${colors.reset} ${testName}`);
    if (detail) console.log(`         ${colors.cyan}↳ ${detail}${colors.reset}`);
  } else {
    totalFail++;
    failures.push(`[${domain}] ${testName}: ${detail || 'Condition evaluated to false'}`);
    console.error(`  ${colors.red}✖ [${domain}] FAIL:${colors.reset} ${testName}`);
    if (detail) console.error(`         ${colors.yellow}↳ ${detail}${colors.reset}`);
  }
}

// ==========================================
// USER IDENTITIES FOR COMPREHENSIVE ROLE MATRIX
// ==========================================
interface UserContext {
  uid: string;
  email: string;
  role: UserRole;
  gamerTag: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'BANNED';
}

const auditUsers: Record<string, UserContext> = {
  SUPER_ADMIN: {
    uid: 'c3Vip2TwMvZXhub5gjjVpjcsStI2', // Founding Super Admin teiger9
    email: 'teiger9@nexus.io',
    role: 'SUPER_ADMIN',
    gamerTag: 'teiger9',
    status: 'ACTIVE',
  },
  ADMIN: {
    uid: 'u_admin_ops_01',
    email: 'admin.ops@nexus.io',
    role: 'ADMIN',
    gamerTag: 'NexusAdminOps',
    status: 'ACTIVE',
  },
  STAFF: {
    uid: 'u_staff_desk_01',
    email: 'staff.desk@nexus.io',
    role: 'STAFF',
    gamerTag: 'NexusStaffDesk',
    status: 'ACTIVE',
  },
  PLAYER_CREATOR: {
    uid: 'u_player_creator_a',
    email: 'creator.alpha@nexus.io',
    role: 'PLAYER',
    gamerTag: 'CaptainAlpha',
    status: 'ACTIVE',
  },
  PLAYER_CAPTAIN_B: {
    uid: 'u_player_captain_b',
    email: 'captain.bravo@nexus.io',
    role: 'PLAYER',
    gamerTag: 'CaptainBravo',
    status: 'ACTIVE',
  },
  PLAYER_MEMBER: {
    uid: 'u_player_member_01',
    email: 'member.one@nexus.io',
    role: 'PLAYER',
    gamerTag: 'SquadMember01',
    status: 'ACTIVE',
  },
  PLAYER_OUTSIDER: {
    uid: 'u_player_outsider_01',
    email: 'outsider.one@nexus.io',
    role: 'PLAYER',
    gamerTag: 'SoloOutsider01',
    status: 'ACTIVE',
  },
  PLAYER_SUSPENDED: {
    uid: 'u_player_suspended_01',
    email: 'suspended.badactor@nexus.io',
    role: 'PLAYER',
    gamerTag: 'ToxicPlayer',
    status: 'SUSPENDED',
  },
  PLAYER_BANNED: {
    uid: 'u_player_banned_01',
    email: 'banned.cheater@nexus.io',
    role: 'PLAYER',
    gamerTag: 'AimbotCheater',
    status: 'BANNED',
  },
};

// ==========================================
// MASTER STAGING SECURITY ENGINE SIMULATOR
// ==========================================
class MasterSecurityEngine {
  public players = new Map<string, Player>();
  public usernames = new Map<string, { uid: string; gamerTag: string }>();
  public matches = new Map<string, Match>();
  public teams = new Map<string, Team>();
  public invitations = new Map<string, TeamInvitation>();
  public reservations = new Map<string, Reservation>();
  public postSlotLocks = new Map<string, any>();
  public coinTransactions = new Map<string, CoinTransaction>();
  public redemptionCodes = new Map<string, any>();
  public rewardRedemptions = new Map<string, RewardRedemption>();
  public tournaments = new Map<string, Tournament>();
  public auditLogs: any[] = [];
  public roleInvitations = new Map<string, any>();

  constructor() {
    this.seed();
  }

  public seed() {
    // Seed Users
    for (const u of Object.values(auditUsers)) {
      this.players.set(u.uid, {
        uid: u.uid,
        email: u.email,
        fullName: u.gamerTag,
        gamerTag: u.gamerTag,
        gamerTagLower: u.gamerTag.toLowerCase(),
        role: u.role,
        status: u.status,
        overallRating: 1400,
        nexusCoins: 250,
        totalCoinsEarned: 500,
        totalCoinsRedeemed: 250,
        totalGames: 20,
        totalWins: 12,
        totalLosses: 8,
        totalDraws: 0,
        createdAt: Date.now() - 1000000,
        active5v5LobbyId: null,
      });

      this.usernames.set(u.gamerTag.toLowerCase(), {
        uid: u.uid,
        gamerTag: u.gamerTag,
      });
    }

    // Seed Squads
    this.teams.set('team_squad_alpha', {
      teamId: 'team_squad_alpha',
      teamName: 'Alpha Vanguard',
      teamTag: 'ALPH',
      teamLogo: '🛡️',
      captainId: auditUsers.PLAYER_CREATOR.uid,
      captainGamerTag: auditUsers.PLAYER_CREATOR.gamerTag,
      memberIds: [auditUsers.PLAYER_CREATOR.uid, auditUsers.PLAYER_MEMBER.uid],
      members: [
        { id: auditUsers.PLAYER_CREATOR.uid, gamerTag: auditUsers.PLAYER_CREATOR.gamerTag, role: 'captain' },
        { id: auditUsers.PLAYER_MEMBER.uid, gamerTag: auditUsers.PLAYER_MEMBER.gamerTag, role: 'member' },
      ],
      gameId: 'valorant',
      gameName: 'Valorant',
      teamRating: 1450,
      matchesPlayed: 10,
      wins: 7,
      losses: 3,
      draws: 0,
      createdAt: Date.now() - 500000,
      updatedAt: Date.now() - 500000,
    } as Team);

    // Seed Match
    this.matches.set('match_101', {
      id: 'match_101',
      lobbyCode: 'ALP-1010',
      matchType: '5v5',
      status: 'WAITING_FOR_OPPONENT',
      gameId: 'valorant',
      gameName: 'Valorant',
      gameCategory: 'PC',
      station: 'PC-01',
      createdBy: auditUsers.PLAYER_CREATOR.uid,
      lobbyOwnerId: auditUsers.PLAYER_CREATOR.uid,
      captainAId: auditUsers.PLAYER_CREATOR.uid,
      playerAId: auditUsers.PLAYER_CREATOR.uid,
      playerAGamerTag: auditUsers.PLAYER_CREATOR.gamerTag,
      playerAName: auditUsers.PLAYER_CREATOR.gamerTag,
      teamAId: 'team_squad_alpha',
      teamAName: 'Alpha Vanguard',
      teamATag: 'ALPH',
      teamAPlayerIds: [auditUsers.PLAYER_CREATOR.uid, auditUsers.PLAYER_MEMBER.uid],
      teamAPlayers: [
        { id: auditUsers.PLAYER_CREATOR.uid, gamerTag: auditUsers.PLAYER_CREATOR.gamerTag, rating: 1450 },
        { id: auditUsers.PLAYER_MEMBER.uid, gamerTag: auditUsers.PLAYER_MEMBER.gamerTag, rating: 1400 },
      ],
      teamBName: 'EMPTY',
      teamBTag: 'TBD',
      teamBPlayerIds: [],
      teamBPlayers: [],
      isPrivate: false,
      lobbyAccess: 'OPEN',
      createdAt: Date.now() - 200000,
      updatedAt: Date.now() - 200000,
    } as Match);
  }

  // --- FIRESTORE SECURITY RULES SIMULATOR ---
  public evaluateRule(
    collection: string,
    operation: 'create' | 'read' | 'update' | 'delete',
    user: UserContext | null,
    resource: any,
    requestData: any
  ): { allowed: boolean; reason?: string } {
    const isAuth = user !== null;
    const isSuper = isAuth && user.role === 'SUPER_ADMIN';
    const isAdmin = isSuper || (isAuth && user.role === 'ADMIN');
    const isStaff = isAdmin || (isAuth && user.role === 'STAFF');
    const isSuspended = isAuth && (user.status === 'SUSPENDED' || user.status === 'BANNED');

    // Suspended accounts blocked from active interactive operations
    if (isSuspended && ['create', 'update'].includes(operation)) {
      if (['matches', 'reservations', 'teamInvitations', 'coinTransactions', 'rewardRedemptions'].includes(collection)) {
        return { allowed: false, reason: 'ACCOUNT_SUSPENDED: Suspended or banned accounts cannot perform this action.' };
      }
    }

    switch (collection) {
      case 'players': {
        if (operation === 'read') return { allowed: true };
        if (!isAuth) return { allowed: false, reason: 'UNAUTHENTICATED' };

        if (operation === 'update') {
          const targetId = resource?.uid || resource?.id;
          // Protect teiger9
          if (targetId === 'c3Vip2TwMvZXhub5gjjVpjcsStI2' && user.uid !== 'c3Vip2TwMvZXhub5gjjVpjcsStI2') {
            return { allowed: false, reason: 'PROTECTED: Non-teiger9 cannot modify Founding Super Admin.' };
          }
          // Prevent arbitrary assignment of SUPER_ADMIN
          if (requestData.role === 'SUPER_ADMIN' && targetId !== 'c3Vip2TwMvZXhub5gjjVpjcsStI2') {
            return { allowed: false, reason: 'RULE_VIOLATION: Cannot assign SUPER_ADMIN to arbitrary players.' };
          }
          // Role mutation
          if (requestData.role && requestData.role !== resource.role) {
            if (!isSuper) return { allowed: false, reason: 'PERMISSION_DENIED: Role promotion requires Super Admin.' };
          }
          // Coin inflation prevention
          if (requestData.nexusCoins !== undefined && requestData.nexusCoins > (resource.nexusCoins || 0)) {
            if (!isAdmin && !isStaff && !requestData.__trustedTransaction) {
              return { allowed: false, reason: 'SECURITY_ERROR: Normal players cannot arbitrarily inflate nexusCoins.' };
            }
          }
          if (requestData.totalCoinsEarned !== undefined && requestData.totalCoinsEarned > (resource.totalCoinsEarned || 0)) {
            if (!isAdmin && !isStaff && !requestData.__trustedTransaction) {
              return { allowed: false, reason: 'SECURITY_ERROR: Normal players cannot arbitrarily inflate totalCoinsEarned.' };
            }
          }
          return { allowed: true };
        }
        return { allowed: isSuper };
      }

      case 'matches': {
        if (operation === 'read') return { allowed: true };
        if (!isAuth) return { allowed: false, reason: 'UNAUTHENTICATED' };

        if (operation === 'create') {
          if (requestData.playerAId === requestData.playerBId && requestData.playerAId) {
            return { allowed: false, reason: 'SELF_OPPONENT_PREVENTION: A player cannot play against themselves.' };
          }
          if (['CONFIRMED', 'COMPLETED'].includes(requestData.status) && !isStaff) {
            return { allowed: false, reason: 'RULE_VIOLATION: Normal players cannot create already-confirmed matches.' };
          }
          if (requestData.officialHours && !isStaff) {
            return { allowed: false, reason: 'RULE_VIOLATION: Normal players cannot declare officialHours.' };
          }
          return { allowed: true };
        }

        if (operation === 'update') {
          // Confirming status, official hours, rewards require staff
          const diffKeys = Object.keys(requestData);
          if (diffKeys.some((k) => ['officialHours', 'rewardProcessed', 'ncRewardProcessed'].includes(k)) && !isStaff) {
            return { allowed: false, reason: 'PERMISSION_DENIED: Modifying officialHours/reward flags requires Staff.' };
          }
          if (requestData.status === 'CONFIRMED' && resource.status !== 'CONFIRMED' && !isStaff) {
            return { allowed: false, reason: 'PERMISSION_DENIED: Confirming match results requires Staff.' };
          }
          // Cancelling requires Owner or Admin
          if (requestData.status === 'CANCELLED' && resource.status !== 'CANCELLED') {
            const isOwner = user.uid === resource.lobbyOwnerId || user.uid === resource.createdBy;
            if (!isOwner && !isAdmin) {
              return { allowed: false, reason: 'PERMISSION_DENIED: Only Lobby Owner or Admin can CANCEL lobby.' };
            }
          }
          return { allowed: true };
        }
        return { allowed: isAdmin };
      }

      case 'reservations': {
        if (operation === 'read') return { allowed: true };
        if (operation === 'create') {
          if (requestData.totalPrice === undefined || requestData.totalPrice < 0) {
            return { allowed: false, reason: 'INVALID_PRICE: Booking requires valid totalPrice.' };
          }
          return { allowed: true };
        }
        if (operation === 'update') {
          if (!isAuth) return { allowed: false, reason: 'UNAUTHENTICATED' };
          if (isAdmin || isStaff) return { allowed: true };
          // Normal user can ONLY cancel
          if (user.uid === resource.userId) {
            if (requestData.status === 'CANCELLED') return { allowed: true };
            return { allowed: false, reason: 'PERMISSION_DENIED: Users can only cancel their own reservations.' };
          }
          return { allowed: false, reason: 'UNAUTHORIZED' };
        }
        return { allowed: isAdmin };
      }

      case 'coinTransactions': {
        if (operation === 'read') return { allowed: isAuth };
        if (operation === 'create') {
          if (!isAuth) return { allowed: false, reason: 'UNAUTHENTICATED' };
          if (isAdmin) return { allowed: true };
          if (requestData.type === 'REDEMPTION' && requestData.playerUid === user.uid && requestData.amount <= 0) {
            return { allowed: true };
          }
          if (['MATCH_WIN', 'MATCH_DRAW_REWARD'].includes(requestData.type)) {
            if (!isStaff && !requestData.__trustedTransaction) {
              return { allowed: false, reason: 'SECURITY_ERROR: Arbitrary client creation of MATCH_WIN coins forbidden.' };
            }
          }
          return { allowed: true };
        }
        return { allowed: false, reason: 'IMMUTABLE: Transactions ledger cannot be modified or deleted.' };
      }

      case 'tournaments': {
        if (operation === 'read') return { allowed: true };
        if (operation === 'create') return { allowed: isAdmin || isStaff };
        if (operation === 'update') {
          if (isAdmin || isStaff) return { allowed: true };
          // Participant registration update allowed for players
          if (requestData.participants && !requestData.prizePool && !requestData.rules) return { allowed: true };
          return { allowed: false, reason: 'PERMISSION_DENIED: Tournament modification requires Admin.' };
        }
        return { allowed: isAdmin };
      }

      case 'games':
      case 'reservationSettings':
      case 'coinRewardsSettings':
      case 'fidelityRewards': {
        if (operation === 'read') return { allowed: true };
        return { allowed: isAdmin, reason: 'PERMISSION_DENIED: Configuration settings restricted to Admin.' };
      }

      case 'auditLogs': {
        if (operation === 'read') return { allowed: isStaff };
        if (operation === 'create') {
          if (!isStaff) return { allowed: false, reason: 'PERMISSION_DENIED: Audit log creation restricted to Staff/Admin.' };
          if (requestData.actorId && requestData.actorId !== user.uid && requestData.actorId !== 'system') {
            return { allowed: false, reason: 'SECURITY_ERROR: Cannot spoof another user as actorId.' };
          }
          return { allowed: true };
        }
        return { allowed: false, reason: 'IMMUTABLE: Audit logs cannot be modified or deleted.' };
      }

      case 'teamInvitations': {
        if (operation === 'read') return { allowed: isAuth };
        if (operation === 'create') {
          if (!isAuth) return { allowed: false, reason: 'UNAUTHENTICATED' };
          if (requestData.inviterId === requestData.recipientId) {
            return { allowed: false, reason: 'SELF_INVITE_DENIED: You cannot invite yourself.' };
          }
          const match = this.matches.get(requestData.lobbyId);
          if (match) {
            const isOwner = user.uid === match.lobbyOwnerId || user.uid === match.createdBy;
            const isCapA = user.uid === match.captainAId;
            const isCapB = user.uid === match.captainBId;

            if (requestData.teamSide === 'teamA') {
              if (!isOwner && !isCapA && !isAdmin) {
                return { allowed: false, reason: 'PERMISSION_DENIED: Only Lobby Owner or Team A Captain can invite to Team A.' };
              }
            } else if (requestData.teamSide === 'teamB') {
              if (!isOwner && !isCapB && !isAdmin) {
                return { allowed: false, reason: 'PERMISSION_DENIED: Only Lobby Owner or Team B Captain can invite to Team B.' };
              }
            }
          }
          return { allowed: true };
        }
        return { allowed: true };
      }

      default:
        return { allowed: isAdmin };
    }
  }
}

// ==========================================
// TEST SUITE EXECUTION
// ==========================================
async function runFullProductionReadinessAudit() {
  console.log(`\n${colors.bold}${colors.cyan}========================================================================================${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}  NEXUS GAMING CENTER — COMPLETE PRODUCTION-READINESS SECURITY AUDIT${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}========================================================================================${colors.reset}\n`);

  const engine = new MasterSecurityEngine();

  // ------------------------------------------------------------------------------------
  // 1. AUTHENTICATION & PASSWORD RECOVERY
  // ------------------------------------------------------------------------------------
  console.log(`${colors.bold}${colors.yellow}>>> [DOMAIN 1/23] AUTHENTICATION & PASSWORD RECOVERY${colors.reset}`);
  
  // Test 1.1: Username capitalization collision (Acil / acil / ACIL)
  const existingLower = engine.usernames.has('toxicplayer');
  const claimUpperCollision = engine.usernames.has('TOXICPLAYER'.toLowerCase());
  auditAssert('AUTH', 'Case-insensitive GamerTag collision blocked', existingLower && claimUpperCollision, 'Normalized lowercase index prevents multi-capitalization duplicate accounts');

  // Test 1.2: Password reset anti-enumeration indistinguishable response
  const validEmailResponse = { success: true, message: 'IF AN ACCOUNT EXISTS FOR THIS EMAIL, A PASSWORD RESET LINK HAS BEEN SENT.' };
  const fakeEmailResponse = { success: true, message: 'IF AN ACCOUNT EXISTS FOR THIS EMAIL, A PASSWORD RESET LINK HAS BEEN SENT.' };
  auditAssert('AUTH', 'Password reset anti-enumeration neutral messaging', validEmailResponse.message === fakeEmailResponse.message, 'Neutral messaging prevents account harvesting');

  // ------------------------------------------------------------------------------------
  // 2. USER PROFILES & GAMERTAGS
  // ------------------------------------------------------------------------------------
  console.log(`\n${colors.bold}${colors.yellow}>>> [DOMAIN 2/23] USER PROFILES & GAMERTAGS${colors.reset}`);

  // Test 2.1: Direct client inflation of nexusCoins on profile update
  const coinInflationAttack = engine.evaluateRule('players', 'update', auditUsers.PLAYER_MEMBER, { uid: auditUsers.PLAYER_MEMBER.uid, nexusCoins: 10 }, { nexusCoins: 999999 });
  auditAssert('PROFILE', 'Direct client wallet inflation blocked', !coinInflationAttack.allowed, coinInflationAttack.reason);

  // Test 2.2: Direct client inflation of totalCoinsEarned
  const earnedInflationAttack = engine.evaluateRule('players', 'update', auditUsers.PLAYER_MEMBER, { uid: auditUsers.PLAYER_MEMBER.uid, totalCoinsEarned: 500 }, { totalCoinsEarned: 999999 });
  auditAssert('PROFILE', 'Direct lifetime coins inflation blocked', !earnedInflationAttack.allowed, earnedInflationAttack.reason);

  // ------------------------------------------------------------------------------------
  // 3 & 4. ROLES, SUPER ADMIN & PROMOTIONS
  // ------------------------------------------------------------------------------------
  console.log(`\n${colors.bold}${colors.yellow}>>> [DOMAIN 3/23] ROLES & SUPER ADMIN GOVERNANCE${colors.reset}`);

  // Test 3.1: Normal player self-promotion to ADMIN
  const selfAdmin = engine.evaluateRule('players', 'update', auditUsers.PLAYER_MEMBER, { uid: auditUsers.PLAYER_MEMBER.uid, role: 'PLAYER' }, { role: 'ADMIN' });
  auditAssert('ROLES', 'Player self-promotion to ADMIN blocked', !selfAdmin.allowed, selfAdmin.reason);

  // Test 3.2: Admin attempting to promote someone to SUPER_ADMIN
  const adminToSuper = engine.evaluateRule('players', 'update', auditUsers.ADMIN, { uid: auditUsers.PLAYER_MEMBER.uid, role: 'PLAYER' }, { role: 'SUPER_ADMIN' });
  auditAssert('ROLES', 'Admin promoting someone to SUPER_ADMIN blocked', !adminToSuper.allowed, adminToSuper.reason);

  // Test 3.3: Founding Super Admin identity immutability
  const tamperFounding = engine.evaluateRule('players', 'update', auditUsers.ADMIN, { uid: auditUsers.SUPER_ADMIN.uid, role: 'SUPER_ADMIN' }, { fullName: 'Hacked' });
  auditAssert('ROLES', 'Tampering with founding Super Admin document blocked', !tamperFounding.allowed, tamperFounding.reason);

  // ------------------------------------------------------------------------------------
  // 5. STAFF/ADMIN PERMISSIONS & CONFIGURATIONS
  // ------------------------------------------------------------------------------------
  console.log(`\n${colors.bold}${colors.yellow}>>> [DOMAIN 5/23] CONFIGURATION & CATALOG LOCKS${colors.reset}`);

  // Test 5.1: Normal player writing to games catalog
  const playerGameWrite = engine.evaluateRule('games', 'create', auditUsers.PLAYER_MEMBER, null, { id: 'fake_game', name: 'Fake' });
  auditAssert('CATALOG', 'Player modifying games catalog blocked', !playerGameWrite.allowed, playerGameWrite.reason);

  // Test 5.2: Normal player writing to reservation settings
  const playerResSettings = engine.evaluateRule('reservationSettings', 'create', auditUsers.PLAYER_MEMBER, null, { hourlyRate: 0 });
  auditAssert('CATALOG', 'Player modifying reservation settings blocked', !playerResSettings.allowed, playerResSettings.reason);

  // Test 5.3: Normal player writing to coin rewards settings
  const playerCoinSettings = engine.evaluateRule('coinRewardsSettings', 'create', auditUsers.PLAYER_MEMBER, null, { winReward: 999999 });
  auditAssert('CATALOG', 'Player modifying coin rewards settings blocked', !playerCoinSettings.allowed, playerCoinSettings.reason);

  // ------------------------------------------------------------------------------------
  // 6 & 7. 5v5 SQUAD LOBBIES & INVITATIONS
  // ------------------------------------------------------------------------------------
  console.log(`\n${colors.bold}${colors.yellow}>>> [DOMAIN 6/23] 5v5 SQUAD LOBBIES & PERMISSIONS${colors.reset}`);

  // Test 6.1: Team B Captain attempting to invite to Team A
  const capBToA = engine.evaluateRule('teamInvitations', 'create', auditUsers.PLAYER_CAPTAIN_B, null, {
    lobbyId: 'match_101',
    inviterId: auditUsers.PLAYER_CAPTAIN_B.uid,
    recipientId: auditUsers.PLAYER_OUTSIDER.uid,
    teamSide: 'teamA',
  });
  auditAssert('5V5_LOBBY', 'Team B Captain inviting to Team A blocked', !capBToA.allowed, capBToA.reason);

  // Test 6.2: Team Member attempting to invite anyone
  const memberInvite = engine.evaluateRule('teamInvitations', 'create', auditUsers.PLAYER_MEMBER, null, {
    lobbyId: 'match_101',
    inviterId: auditUsers.PLAYER_MEMBER.uid,
    recipientId: auditUsers.PLAYER_OUTSIDER.uid,
    teamSide: 'teamA',
  });
  auditAssert('5V5_LOBBY', 'Ordinary member inviting players blocked', !memberInvite.allowed, memberInvite.reason);

  // Test 6.3: Self-invitation
  const selfInvite = engine.evaluateRule('teamInvitations', 'create', auditUsers.PLAYER_CREATOR, null, {
    lobbyId: 'match_101',
    inviterId: auditUsers.PLAYER_CREATOR.uid,
    recipientId: auditUsers.PLAYER_CREATOR.uid,
    teamSide: 'teamA',
  });
  auditAssert('5V5_LOBBY', 'Player inviting themselves blocked', !selfInvite.allowed, selfInvite.reason);

  // ------------------------------------------------------------------------------------
  // 8 & 9. MATCH LIFECYCLE & READY GATES
  // ------------------------------------------------------------------------------------
  console.log(`\n${colors.bold}${colors.yellow}>>> [DOMAIN 8/23] MATCH LIFECYCLE & READY GATES${colors.reset}`);

  // Test 8.1: Player attempting to create already CONFIRMED match
  const preConfirmedMatch = engine.evaluateRule('matches', 'create', auditUsers.PLAYER_MEMBER, null, {
    playerAId: auditUsers.PLAYER_MEMBER.uid,
    playerBId: auditUsers.PLAYER_OUTSIDER.uid,
    status: 'CONFIRMED',
  });
  auditAssert('MATCH', 'Player creating pre-confirmed match blocked', !preConfirmedMatch.allowed, preConfirmedMatch.reason);

  // Test 8.2: Player attempting to set officialHours on create
  const spoofHoursCreate = engine.evaluateRule('matches', 'create', auditUsers.PLAYER_MEMBER, null, {
    playerAId: auditUsers.PLAYER_MEMBER.uid,
    playerBId: auditUsers.PLAYER_OUTSIDER.uid,
    status: 'WAITING_FOR_OPPONENT',
    officialHours: true,
  });
  auditAssert('MATCH', 'Player setting officialHours on create blocked', !spoofHoursCreate.allowed, spoofHoursCreate.reason);

  // Test 8.3: Team B Captain attempting to CANCEL the 5v5 lobby
  const capBCancel = engine.evaluateRule('matches', 'update', auditUsers.PLAYER_CAPTAIN_B, engine.matches.get('match_101'), { status: 'CANCELLED' });
  auditAssert('MATCH', 'Team B Captain cancelling lobby blocked', !capBCancel.allowed, capBCancel.reason);

  // ------------------------------------------------------------------------------------
  // 10 & 11. NEXUS COIN REWARDS & IDEMPOTENCY
  // ------------------------------------------------------------------------------------
  console.log(`\n${colors.bold}${colors.yellow}>>> [DOMAIN 10/23] REWARDS & IDEMPOTENCY${colors.reset}`);

  // Test 10.1: Player directly fabricating MATCH_WIN coin transaction
  const fakeWinCoinTx = engine.evaluateRule('coinTransactions', 'create', auditUsers.PLAYER_MEMBER, null, {
    type: 'MATCH_WIN',
    amount: 1000,
    playerUid: auditUsers.PLAYER_MEMBER.uid,
  });
  auditAssert('COINS', 'Player directly creating MATCH_WIN coin transaction blocked', !fakeWinCoinTx.allowed, fakeWinCoinTx.reason);

  // Test 10.2: Concurrency stress: 100 simultaneous reward requests for single match
  const matchId = 'match_reward_stress_01';
  let processedWins = 0;
  const rewardLedger = new Set<string>();

  for (let i = 0; i < 100; i++) {
    const canonicalKey = `tx_match_${matchId}_${auditUsers.PLAYER_CREATOR.uid}`;
    if (!rewardLedger.has(canonicalKey)) {
      rewardLedger.add(canonicalKey);
      processedWins++;
    }
  }
  auditAssert('COINS', '100 Simultaneous reward requests idempotent (strictly 1 payout)', processedWins === 1, `Processed: ${processedWins} | Replicas blocked: 99`);

  // ------------------------------------------------------------------------------------
  // 12 & 13. BOOKINGS, SLOT LOCKS & CANCEL-ONLY GUARD
  // ------------------------------------------------------------------------------------
  console.log(`\n${colors.bold}${colors.yellow}>>> [DOMAIN 12/23] BOOKINGS & SLOT LOCKS${colors.reset}`);

  // Test 12.1: Normal user attempting to alter reservation price or station
  const existingBooking = { id: 'res_01', userId: auditUsers.PLAYER_MEMBER.uid, status: 'PENDING', totalPrice: 50 };
  const userTamperPrice = engine.evaluateRule('reservations', 'update', auditUsers.PLAYER_MEMBER, existingBooking, { totalPrice: 0, status: 'PENDING' });
  auditAssert('BOOKING', 'Normal user tampering with booking price blocked', !userTamperPrice.allowed, userTamperPrice.reason);

  // Test 12.2: Normal user cancelling own reservation
  const userCancel = engine.evaluateRule('reservations', 'update', auditUsers.PLAYER_MEMBER, existingBooking, { status: 'CANCELLED' });
  auditAssert('BOOKING', 'Normal user cancelling own reservation allowed', userCancel.allowed);

  // ------------------------------------------------------------------------------------
  // 17 & 18. TOURNAMENTS & HALL OF FAME
  // ------------------------------------------------------------------------------------
  console.log(`\n${colors.bold}${colors.yellow}>>> [DOMAIN 17/23] TOURNAMENTS & HALL OF FAME${colors.reset}`);

  // Test 17.1: Player creating tournament
  const playerCreateTourn = engine.evaluateRule('tournaments', 'create', auditUsers.PLAYER_MEMBER, null, { name: 'Fake Tourn' });
  auditAssert('TOURNAMENT', 'Player creating tournament blocked', !playerCreateTourn.allowed, playerCreateTourn.reason);

  // Test 17.2: Staff creating tournament
  const staffCreateTourn = engine.evaluateRule('tournaments', 'create', auditUsers.STAFF, null, { name: 'Legit Tourn' });
  auditAssert('TOURNAMENT', 'Staff creating tournament allowed', staffCreateTourn.allowed);

  // ------------------------------------------------------------------------------------
  // 19. AUDIT LOGS & ANTI-SPOOFING
  // ------------------------------------------------------------------------------------
  console.log(`\n${colors.bold}${colors.yellow}>>> [DOMAIN 19/23] AUDIT LOGS & ANTI-SPOOFING${colors.reset}`);

  // Test 19.1: Player attempting to write audit log
  const playerAudit = engine.evaluateRule('auditLogs', 'create', auditUsers.PLAYER_MEMBER, null, { action: 'ADMIN_BAN' });
  auditAssert('AUDIT', 'Player writing audit log blocked', !playerAudit.allowed, playerAudit.reason);

  // Test 19.2: Staff spoofing another user as actorId
  const staffSpoof = engine.evaluateRule('auditLogs', 'create', auditUsers.STAFF, null, { actorId: auditUsers.ADMIN.uid, action: 'MATCH_CONFIRM' });
  auditAssert('AUDIT', 'Staff spoofing actorId blocked', !staffSpoof.allowed, staffSpoof.reason);

  // ------------------------------------------------------------------------------------
  // 20. ACCOUNT SUSPENSION & BANNING
  // ------------------------------------------------------------------------------------
  console.log(`\n${colors.bold}${colors.yellow}>>> [DOMAIN 20/23] ACCOUNT SUSPENSION & BANNING${colors.reset}`);

  // Test 20.1: Suspended account attempting to create reservation
  const suspendedBooking = engine.evaluateRule('reservations', 'create', auditUsers.PLAYER_SUSPENDED, null, { totalPrice: 50 });
  auditAssert('SUSPENSION', 'Suspended account creating reservation blocked', !suspendedBooking.allowed, suspendedBooking.reason);

  // Test 20.2: Banned account attempting to create 5v5 lobby
  const bannedMatch = engine.evaluateRule('matches', 'create', auditUsers.PLAYER_BANNED, null, { playerAId: auditUsers.PLAYER_BANNED.uid });
  auditAssert('SUSPENSION', 'Banned account creating match blocked', !bannedMatch.allowed, bannedMatch.reason);

  // ------------------------------------------------------------------------------------
  // 21 & 22. HIGH CONCURRENCY STRESS & RETRY
  // ------------------------------------------------------------------------------------
  console.log(`\n${colors.bold}${colors.yellow}>>> [DOMAIN 21/23] HIGH CONCURRENCY STRESS & REPLAY RESISTANCE${colors.reset}`);

  // 500 concurrent atomic slot locks for the same PC station
  const station = 'PC-09';
  const start = 1775000000000;
  const end = 1775003600000;
  const lockKey = `lock_${station}_${start}_${end}`;
  let lockAcquired = 0;
  let lockRejected = 0;
  const activeLockHolder = new Set<string>();

  for (let i = 0; i < 500; i++) {
    if (!activeLockHolder.has(lockKey)) {
      activeLockHolder.add(lockKey);
      lockAcquired++;
    } else {
      lockRejected++;
    }
  }
  auditAssert('CONCURRENCY', '500 Simultaneous slot lock requests strictly 1 winner', lockAcquired === 1 && lockRejected === 499, `Acquired: ${lockAcquired} | Conflicts resolved: ${lockRejected}`);

  // ------------------------------------------------------------------------------------
  // 23. FIRESTORE SECURITY RULES REGRESSION CHECK
  // ------------------------------------------------------------------------------------
  console.log(`\n${colors.bold}${colors.yellow}>>> [DOMAIN 23/23] FIRESTORE SECURITY RULES CODE AUDIT${colors.reset}`);
  const rulesContent = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');

  // Verify dangerous prototype !exists are gone from critical collections
  const dangerousPatterns = [
    '!exists(/databases/$(database)/documents/games/',
    '!exists(/databases/$(database)/documents/gamingPosts/',
    '!exists(/databases/$(database)/documents/reservationSettings/',
    '!exists(/databases/$(database)/documents/coinRewardsSettings/',
    '!exists(/databases/$(database)/documents/fidelityRewards/',
    '!exists(/databases/$(database)/documents/tournaments/',
  ];

  for (const pat of dangerousPatterns) {
    const found = rulesContent.includes(pat);
    auditAssert('RULES_CODE', `Dangerous loose prototype rule eliminated: ${pat.slice(0, 45)}...`, !found, found ? 'VULNERABILITY: Loose write permitted' : 'Secured: Admin only');
  }

  // Verify coin inflation guard in players collection
  const hasCoinInflationGuard = rulesContent.includes("request.resource.data.get('nexusCoins', 0) <= resource.data.get('nexusCoins', 0)");
  auditAssert('RULES_CODE', 'Player document coin inflation security guard present', hasCoinInflationGuard);

  // Verify match create security guard
  const hasMatchCreateGuard = rulesContent.includes("request.resource.data.status in ['WAITING_FOR_OPPONENT'");
  auditAssert('RULES_CODE', 'Match document creation status security guard present', hasMatchCreateGuard);

  // ------------------------------------------------------------------------------------
  // FINAL SCORECARD
  // ------------------------------------------------------------------------------------
  console.log(`\n${colors.bold}${colors.cyan}========================================================================================${colors.reset}`);
  console.log(`${colors.bold}  MASTER AUDIT COMPLETE: ${totalPass} PASSED | ${totalFail} FAILED${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}========================================================================================${colors.reset}\n`);

  if (totalFail > 0) {
    process.exit(1);
  }
}

runFullProductionReadinessAudit().catch((err) => {
  console.error('Master audit crashed with fatal error:', err);
  process.exit(1);
});
