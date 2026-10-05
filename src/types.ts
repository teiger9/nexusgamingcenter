export type UserRole =
  | 'SUPER_ADMIN'
  | 'ADMIN'
  | 'STAFF'
  | 'PLAYER'
  | 'VISITOR'
  | 'admin'
  | 'player'
  | 'staff'
  | 'superadmin';

export type RoleInvitationStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED' | 'REVOKED';

export interface RoleInvitation {
  id: string;
  invitationId: string;
  recipientEmail: string;
  recipientUid?: string;
  recipientGamerTag?: string;
  recipientFullName?: string;
  invitedRole: 'ADMIN' | 'STAFF';
  invitedByUid: string;
  invitedByName: string;
  createdAt: number;
  expiresAt: number;
  status: RoleInvitationStatus;
  token: string;
  acceptedAt?: number;
  acceptedByUid?: string;
  declinedAt?: number;
  declinedByUid?: string;
  revokedAt?: number;
  revokedByUid?: string;
  note?: string;
  phoneNumber?: string;
}

export type RoleAuditAction =
  | 'INITIAL_SUPER_ADMIN_BOOTSTRAP'
  | 'ROLE_INVITED'
  | 'ROLE_ACCEPTED'
  | 'ROLE_DECLINED'
  | 'ROLE_GRANTED'
  | 'ROLE_REVOKED'
  | 'ROLE_INVITATION_REVOKED'
  | 'ROLE_INVITATION_EXPIRED';

export interface RoleAuditLog {
  id: string;
  auditId: string;
  targetUid?: string;
  targetEmail: string;
  targetGamerTag?: string;
  targetDisplayName?: string;
  previousRole?: string;
  newRole: string;
  action: RoleAuditAction;
  performedByUid: string;
  performedByName: string;
  timestamp: number;
  reason?: string;
  invitationId?: string;
}

export interface NexusPermissions {
  managePlayers: boolean;
  manageSquads: boolean;
  manageLobbies: boolean;
  manageMatches: boolean;
  approveMatches: boolean;
  manageTournaments: boolean;
  manageReservations: boolean;
  manageRewards: boolean;
  useRedemptionCodes: boolean;
  manageNC: boolean;
  manageRoles: boolean;
  manageSecurity: boolean;
  viewAuditLogs: boolean;
}

export type CanonicalGameCategory = 'CHESS' | 'FC' | 'VALORANT' | 'CS2' | 'LEAGUE_OF_LEGENDS';
export type GameCategory = 'PC' | 'PS5' | 'CHESS' | 'FC' | 'VALORANT' | 'CS2' | 'LEAGUE_OF_LEGENDS' | string;

export type SeasonStatus = 'UPCOMING' | 'ACTIVE' | 'ENDED' | 'FINALIZED' | 'PROCESSING' | 'COMPLETED';

export interface SeasonChampion {
  seasonId?: string;
  gameId: string;
  game?: string;
  gameName: string;
  gameCategory: GameCategory;
  gameVersion?: string;
  playerId: string;
  winnerId?: string;
  gamerTag: string;
  fullName?: string;
  avatarUrl?: string;
  finalRank?: number;
  finalMMR: number;
  wins: number;
  losses: number;
  draws: number;
  gamesPlayed: number;
  winRate: number;
  selectedAt?: number;
  crownedAt?: number;
}

export interface Season {
  id: string; // e.g. 'season_1', 'season_2'
  number: number; // 1, 2, 3...
  name: string; // e.g. "Season 1", "Season 2"
  year: number; // e.g. 2026
  status: SeasonStatus;
  startDate: number; // timestamp
  endDate: number; // timestamp
  createdAt: number;
  endedAt?: number;
  finalizedAt?: number;
  finalizedBy?: string;
  finalizedByName?: string;
  completedAt?: number;
  selectedAt?: number;
  hallOfFameProcessed?: boolean;
  transitionStartedAt?: number;
  transitionLockedBy?: string;
  champions?: SeasonChampion[];
  totalMatches?: number;
  totalPlayers?: number;
}

export interface SeasonPlayerGameRating {
  id: string; // `${seasonId}_${playerId}_${gameId}`
  seasonId: string;
  seasonNumber: number;
  playerId: string;
  gamerTag: string;
  gameId: string;
  gameName: string;
  gameCategory: GameCategory;
  gameVersion?: string;
  startingRating: number;
  rating: number; // Seasonal MMR
  eloRating?: number;
  performanceRating?: number;
  isProvisional: boolean;
  placementGames: number;
  placementGamesRequired: number;
  sumOpponentRatings?: number;
  averageOpponentRating?: number;
  winStreak?: number;
  currentWinStreak?: number;
  bestWinStreak?: number;
  gamesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  finalRank?: number;
  isChampion?: boolean;
  lastPlayedAt?: number;
  updatedAt: number;
}

export interface SeasonPlayerOverall {
  id: string; // `${seasonId}_${playerId}`
  seasonId: string;
  seasonNumber: number;
  playerId: string;
  gamerTag: string;
  fullName: string;
  overallRating: number;
  gamesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  currentWinStreak?: number;
  bestWinStreak?: number;
  rank?: number;
  updatedAt: number;
}

export interface HallOfFameEntry {
  id: string; // `${seasonId}_${gameId}`
  seasonId: string;
  seasonNumber: number;
  seasonName: string;
  year: number;
  startDate: number;
  endDate: number;
  gameId: string;
  game?: string;
  gameName: string;
  gameCategory: GameCategory;
  gameVersion?: string;
  matchFormat?: '1v1' | '5v5';
  winnerType?: 'PLAYER' | 'TEAM';
  status: 'OFFICIAL';
  championId: string;
  championName: string;
  playerId: string;
  winnerId?: string;
  teamId?: string;
  teamName?: string;
  teamTag?: string;
  gamerTag: string;
  fullName?: string;
  avatarUrl?: string;
  finalRank?: number;
  finalMMR: number;
  wins: number;
  losses: number;
  draws: number;
  gamesPlayed: number;
  winRate: number;
  selectedAt?: number;
  crownedAt: number;
  captainId?: string;
  captainGamerTag?: string;
  memberUids?: string[];
}

export interface HallOfFameAnnouncement {
  id: string; // `hof_announce_${seasonId}_${gameId}`
  seasonId: string;
  seasonNumber: number;
  seasonName: string;
  gameId: string;
  gameName: string;
  gameIcon?: string;
  gameCategory?: GameCategory;
  matchFormat: '1v1' | '5v5';
  winnerType: 'PLAYER' | 'TEAM';
  winnerId: string;
  winnerName: string; // e.g. "Nexus Wolves" or "GamerTag"
  winnerTag?: string;
  finalMMR: number;
  title: string; // "🏆 SEASON 1 HALL OF FAME"
  headline: string; // "VALORANT" or "FC"
  subheadline: string; // "👑 Nexus Wolves"
  badgeText: string; // "#1 Team — 1,842 MMR" or "#1 Player — 1,642 MMR"
  congratulationsText: string; // "Congratulations to the Season 1 champions!"
  wins?: number;
  losses?: number;
  draws?: number;
  winRate?: number;
  createdAt: number;
}

export interface PlayerSeasonHistoryItem {
  seasonId: string;
  seasonNumber: number;
  seasonName: string;
  startDate: number;
  endDate: number;
  gameId: string;
  gameName: string;
  gameCategory: GameCategory;
  finalMMR: number;
  finalRank: number;
  wins: number;
  losses: number;
  draws: number;
  gamesPlayed: number;
  winRate: number;
  isChampion: boolean;
}

export interface Game {
  id: string;
  name: string;
  category: GameCategory;
  description?: string;
  icon?: string;
  banner?: string;
  active: boolean;
  createdAt: number;
}

export interface Player {
  uid: string;
  email: string;
  fullName: string;
  gamerTag: string;
  gamerTagLower: string;
  phoneNumber?: string;
  role: UserRole;
  avatarUrl?: string;
  createdAt: number;
  totalGames: number;
  totalWins: number;
  totalLosses: number;
  totalDraws: number;
  overallRating: number; // Computed average or primary ELO
  rank?: number;
  currentWinStreak?: number;
  bestWinStreak?: number;
  nexusCoins?: number; // Current available Nexus Coin balance (NC)
  totalCoinsEarned?: number; // Lifetime earned NC
  totalCoinsRedeemed?: number; // Lifetime spent NC
  inGameNames?: Record<string, string>; // Game-specific IGN e.g. { cs2: 'mouh2', valorant: 'TenZ#NA1' }
  inGameName?: string; // Fallback or general in-game nickname
  status?: 'ACTIVE' | 'SUSPENDED' | 'BANNED' | 'DISABLED';
  isBanned?: boolean;
  isSuspended?: boolean;
  statusReason?: string;
  roleGrantedBy?: string;
  roleGrantedByName?: string;
  roleGrantedAt?: number;
  roleRevokedBy?: string;
  roleRevokedAt?: number;
  roleStatus?: 'ACTIVE' | 'REVOKED';
  lastLoginAt?: number;
  active5v5LobbyId?: string | null;
  updatedAt?: number;
}

export interface PlayerGameRating {
  id: string; // `${playerId}_${gameId}`
  playerId: string;
  gameId: string;
  gameName: string;
  gameCategory: GameCategory;
  gameVersion?: string;
  gamerTag: string;
  rating: number; // Current displayed/active MMR (combined or standard ELO)
  eloRating?: number; // Base ELO tracking
  performanceRating?: number; // Performance estimate during placement
  isProvisional: boolean; // True if placementGames < 10
  placementGames: number; // Matches played in this game (0-10)
  placementGamesRequired: number; // Always 10
  sumOpponentRatings?: number; // Sum of opponents' MMR for average calculation
  averageOpponentRating?: number;
  winStreak?: number; // Legacy compatibility
  currentWinStreak?: number; // Consecutive active wins tracker
  bestWinStreak?: number; // All-time peak win streak
  gamesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  lastPlayedAt?: number;
  updatedAt: number;
}

export type MatchStatus = 
  | 'WAITING_FOR_OPPONENT'
  | 'OPPONENT_JOINED'
  | 'TEAM_ROSTERS_FILLING'
  | 'READY_CHECK'
  | 'WAITING_FOR_ADMIN' 
  | 'APPROVED' 
  | 'REJECTED' 
  | 'LIVE' 
  | 'AWAITING_RESULTS'
  | 'AWAITING_CONFIRMATION' 
  | 'PENDING_ADMIN_APPROVAL'
  | 'PENDING_ADMIN_REVIEW'
  | 'CONFIRMED' 
  | 'DISPUTED' 
  | 'CANCELLED' 
  | 'COMPLETED'
  | 'PENDING';

export interface LobbyJoinRequest {
  id: string;
  matchId: string;
  playerId: string;
  gamerTag: string;
  fullName?: string;
  inGameName?: string;
  rating?: number;
  teamSide: 'teamA' | 'teamB';
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED';
  requestedAt: number;
  respondedAt?: number;
  respondedBy?: string;
}

export type PlayerDeclaration = 'WIN' | 'LOSS' | 'DRAW' | 'playerA' | 'playerB' | 'draw' | null;

export type TeamVote = 'teamA' | 'teamB' | 'draw';

export interface TeamMember {
  id: string;
  gamerTag: string;
  fullName?: string;
  rating?: number;
  role: 'captain' | 'member';
  joinedAt: number;
  inGameName?: string;
  leftAt?: number;
  removedAt?: number;
  reason?: 'removed' | 'replaced' | 'left' | 'disbanded';
  replacedByGamerTag?: string;
}

export interface TeamHistoryEvent {
  id: string;
  action: 'CREATED' | 'MEMBER_ADDED' | 'MEMBER_REMOVED' | 'MEMBER_REPLACED' | 'NAME_CHANGED' | 'CAPTAIN_TRANSFERRED' | 'DISBANDED';
  details: string;
  timestamp: number;
  actorId?: string;
  actorName?: string;
}

export interface Team {
  teamId: string;
  teamName: string;
  teamNameLower: string;
  teamTag: string;
  teamTagLower: string;
  teamLogo?: string;
  gameId: 'valorant' | 'cs2' | string;
  gameName: string;
  captainId: string;
  captainName: string;
  captainGamerTag: string;
  memberIds: string[];
  members: TeamMember[];
  pastMembers?: TeamMember[];
  squadHistory?: TeamHistoryEvent[];
  createdAt: number;
  updatedAt: number;
  status: 'active' | 'disbanded';
  teamRating: number;
  wins: number;
  losses: number;
  draws: number;
  matchesPlayed: number;
  winRate: number;
  currentWinStreak: number;
  bestWinStreak: number;
}

export interface TeamLeaderboardEntry {
  rank: number;
  teamId: string;
  teamName: string;
  teamTag: string;
  teamLogo?: string;
  gameId: string;
  gameName: string;
  teamRating: number;
  matchesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  currentWinStreak: number;
  bestWinStreak: number;
  captainGamerTag: string;
  memberCount: number;
  members?: TeamMember[];
}

export type MatchResultType = 'MUTUAL_DECLARATION' | 'ADMIN_DECISION' | 'ADMIN_CANCELLATION';

export type OfficialResult = 'PLAYER_A' | 'PLAYER_B' | 'DRAW' | 'CANCELLED';

export type Station = 
  | 'PC-01' 
  | 'PC-02' 
  | 'PC-03' 
  | 'PC-04' 
  | 'PC-05' 
  | 'PC-06' 
  | 'PC-07' 
  | 'PC-08' 
  | 'PC-09' 
  | 'PC-10' 
  | 'PS5-01' 
  | 'PS5-02' 
  | 'PS5-03' 
  | 'PS5-04' 
  | 'CHESS-01';

export const STATIONS: { id: Station; label: string; category: GameCategory }[] = [
  { id: 'PC-01', label: 'PC Station 01', category: 'PC' },
  { id: 'PC-02', label: 'PC Station 02', category: 'PC' },
  { id: 'PC-03', label: 'PC Station 03', category: 'PC' },
  { id: 'PC-04', label: 'PC Station 04', category: 'PC' },
  { id: 'PC-05', label: 'PC Station 05', category: 'PC' },
  { id: 'PC-06', label: 'PC Station 06', category: 'PC' },
  { id: 'PC-07', label: 'PC Station 07', category: 'PC' },
  { id: 'PC-08', label: 'PC Station 08', category: 'PC' },
  { id: 'PC-09', label: 'PC Station 09', category: 'PC' },
  { id: 'PC-10', label: 'PC Station 10', category: 'PC' },
  { id: 'PS5-01', label: 'PS5 Station 01', category: 'PS5' },
  { id: 'PS5-02', label: 'PS5 Station 02', category: 'PS5' },
  { id: 'PS5-03', label: 'PS5 Station 03', category: 'PS5' },
  { id: 'PS5-04', label: 'PS5 Station 04', category: 'PS5' },
  { id: 'CHESS-01', label: 'Chess Corner', category: 'CHESS' },
];

export interface Match {
  id: string;
  playerAId: string;
  playerBId: string;
  playerAName: string;
  playerBName: string;
  playerAGamerTag: string;
  playerBGamerTag: string;
  gameId: string;
  gameName: string;
  gameCategory: GameCategory;
  gameVersion?: string;
  station: Station;
  status: MatchStatus;
  matchType?: '1v1' | '5v5' | 'RANKED' | 'CASUAL';

  // 1v1 / Chess Invitation tracking
  invitationId?: string;
  invitationStatus?: CanonicalInvitationStatus | string;
  invitationExpiresAt?: number;
  opponentAccepted?: boolean;
  opponentAcceptedAt?: number;

  // 5v5 Team Fields & Lobby
  lobbyCode?: string;
  lobbyOwnerId?: string;
  isPrivate?: boolean;
  lobbyAccess?: 'OPEN' | 'PRIVATE';
  pcCount?: number; // How many PCs are being taken (8, 9, or 10 - default 10)
  teamAId?: string;
  teamBId?: string;
  captainAId?: string;
  captainBId?: string;
  teamAPlayerIds?: string[];
  teamBPlayerIds?: string[];
  teamAName?: string;
  teamBName?: string;
  teamATag?: string;
  teamBTag?: string;
  teamALogo?: string;
  teamBLogo?: string;
  teamAAvgRating?: number;
  teamBAvgRating?: number;
  teamARatingBefore?: number;
  teamARatingAfter?: number;
  teamARatingChange?: number;
  teamBRatingBefore?: number;
  teamBRatingAfter?: number;
  teamBRatingChange?: number;
  teamAPlayers?: { id: string; gamerTag: string; name?: string; rating?: number; inGameName?: string }[];
  teamBPlayers?: { id: string; gamerTag: string; name?: string; rating?: number; inGameName?: string }[];
  officialTeamWinner?: 'teamA' | 'teamB' | 'draw' | null;
  playerReadyStatus?: Record<string, boolean>;
  teamAJoinRequests?: LobbyJoinRequest[];
  teamBJoinRequests?: LobbyJoinRequest[];
  votes?: Record<string, 'teamA' | 'teamB' | 'draw'>;
  votedAt?: Record<string, number>;
  declarations?: Record<string, { playerUid: string; gamerTag?: string; inGameName?: string; teamSide: 'teamA' | 'teamB'; declaredResult: 'teamA' | 'teamB' | 'draw'; submittedAt: number }>;
  finalResult?: 'teamA' | 'teamB' | 'draw' | 'CANCELLED';
  officialHours?: number;
  rewardProcessed?: boolean;
  ncRewardProcessed?: boolean;
  confirmedBy?: string;
  confirmedByName?: string;
  teamARewardPerPlayer?: number;
  teamBRewardPerPlayer?: number;
  coinsAwardedPlayerUids?: string[];
  resolvedByAdminUid?: string;
  resolutionReason?: string;
  adminOverride?: boolean;
  playerRatingChanges?: Record<string, { ratingBefore: number; ratingAfter: number; change: number } | number>;

  // 5v5 Public Lobby Recruitment System
  isRecruiting?: boolean;
  isTeamBRecruiting?: boolean;
  recruitmentStatus?: RecruitmentStatus;
  playersNeeded?: number; // 5 - currentActivePlayers
  recruitmentAnnouncementAt?: number;
  recruitmentMessage?: string;

  // Request, Approval & Cancellation Flow
  createdBy?: string;
  createdByName?: string;
  approvedBy?: string;
  approvedAt?: number;
  approvedByAdminId?: string;
  rejectedBy?: string;
  rejectedAt?: number;
  rejectionReason?: string;
  cancelledBy?: string;
  cancelledByName?: string;
  cancelledAt?: number;
  cancellationReason?: string;
  
  // Timestamps
  createdAt: number;
  startedAt?: number;
  startedBy?: string;
  startedByName?: string;
  endedAt?: number;
  endedBy?: string;
  durationSeconds?: number;
  durationFormatted?: string;
  finishedAt?: number;
  updatedAt: number;

  // Season Tracking
  seasonId?: string;
  seasonNumber?: number;

  // Declarations (preserved permanently for transparency)
  playerADeclaration?: PlayerDeclaration;
  playerBDeclaration?: PlayerDeclaration;
  playerADeclaredAt?: number;
  playerBDeclaredAt?: number;

  // Final Resolution & Process Flags
  winnerId?: string | 'draw' | null;
  officialWinner?: string | 'draw' | null;
  officialResult?: OfficialResult | string;
  resultType?: MatchResultType | string;
  adminResolved?: boolean;
  resolvedBy?: string;
  resolvedByName?: string;
  resolvedAt?: number;
  adminResolutionReason?: string;
  ratingProcessed?: boolean;
  confirmedAt?: number;
  disputeReason?: string;
  adminId?: string;
  adminName?: string;
  adminNote?: string;
  adminDecidedAt?: number;

  // ELO Rating Details recorded upon confirmation
  playerARatingBefore?: number;
  playerARatingAfter?: number;
  playerARatingChange?: number;
  playerBRatingBefore?: number;
  playerBRatingAfter?: number;
  playerBRatingChange?: number;
  playerAIsProvisional?: boolean;
  playerBIsProvisional?: boolean;

  // Nexus Coins & FC Series Recording
  coinsAwarded?: boolean;
  coinsAwardedAt?: number;
  coinsAwardedAmount?: number;
  ncReward?: number;
  totalGamesPlayed?: number;
  playerAGamesWon?: number;
  playerBGamesWon?: number;
  seriesWinnerId?: string | 'draw' | null;
  playerASeriesScore?: {
    gamesWon: number;
    gamesLost: number;
    totalGames: number;
    declaration: 'WIN' | 'LOSS' | 'DRAW';
    submittedAt: number;
  };
  playerBSeriesScore?: {
    gamesWon: number;
    gamesLost: number;
    totalGames: number;
    declaration: 'WIN' | 'LOSS' | 'DRAW';
    submittedAt: number;
  };
}

export interface RatingTransaction {
  id: string;
  matchId: string;
  gameId: string;
  gameName: string;
  playerId: string;
  gamerTag: string;
  opponentId: string;
  opponentGamerTag: string;
  opponentMMR?: number;
  ratingBefore: number;
  oldMMR?: number;
  ratingAfter: number;
  newMMR?: number;
  change: number;
  ratingChange?: number;
  result: 'WIN' | 'LOSS' | 'DRAW';
  isProvisional: boolean;
  seasonId?: string;
  seasonNumber?: number;
  seasonRatingBefore?: number;
  seasonRatingAfter?: number;
  seasonChange?: number;
  createdAt: number;
}

export interface LeaderboardEntry {
  rank: number;
  playerId: string;
  gamerTag: string;
  fullName: string;
  rating: number;
  gamesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  isProvisional?: boolean;
  placementGames?: number;
  currentWinStreak?: number;
  bestWinStreak?: number;
  gameId?: string;
  gameName?: string;
  gameCategory?: GameCategory;
}

export interface AppNotification {
  id: string;
  notificationId?: string;
  userId: string;
  recipientId?: string;
  senderId?: string;
  matchId?: string;
  invitationId?: string;
  lobbyId?: string;
  teamId?: string;
  inviterId?: string;
  inviterGamerTag?: string;
  game?: string;
  status?: string;
  type:
    | 'MATCH_INVITATION'
    | 'MATCH_INVITATION_ACCEPTED'
    | 'MATCH_INVITATION_DECLINED'
    | 'MATCH_INVITATION_CANCELLED'
    | 'CHESS_MATCH_INVITATION'
    | 'CHESS_MATCH_INVITATION_ACCEPTED'
    | 'CHESS_MATCH_INVITATION_DECLINED'
    | 'CHESS_MATCH_INVITATION_CANCELLED'
    | 'TEAM_INVITE'
    | 'TEAM_INVITE_ACCEPTED'
    | 'TEAM_INVITE_DECLINED'
    | 'TEAM_REMOVED'
    | 'PLAYER_REMOVED'
    | 'TEAM_JOINED'
    | 'TEAM_LEFT'
    | 'CAPTAIN_TRANSFERRED'
    | 'TEAM_DISBANDED'
    | 'TEAM_UPDATED'
    | 'LOBBY_CANCELLED'
    | 'LOBBY_JOINED'
    | 'MATCH_APPROVED'
    | 'MATCH_REJECTED'
    | 'MATCH_ADMIN_APPROVAL'
    | 'MATCH_PENDING_APPROVAL'
    | 'MATCH_STARTED'
    | 'MATCH_ENDED'
    | 'MATCH_CONFIRMED'
    | 'MATCH_DISPUTED'
    | 'MATCH_RESULT'
    | 'WIN_STREAK_MILESTONE'
    | 'DISPUTE'
    | 'TEAM_TOURNAMENT_INVITATION'
    | 'TOURNAMENT_TEAM_INVITE'
    | 'TOURNAMENT_TEAM_INVITE_ACCEPTED'
    | 'TOURNAMENT_TEAM_INVITE_DECLINED'
    | 'TOURNAMENT_TEAM_INVITE_CANCELLED'
    | 'TOURNAMENT_TEAM_PLAYER_REMOVED'
    | 'TOURNAMENT_TEAM_READY'
    | 'TOURNAMENT_TEAM_SUBMITTED'
    | 'TOURNAMENT_TEAM_APPROVED'
    | 'TOURNAMENT_TEAM_REJECTED'
    | 'RESERVATION_CREATED'
    | 'RESERVATION_PENDING'
    | 'RESERVATION_CONFIRMED'
    | 'RESERVATION_REJECTED'
    | 'RESERVATION_CANCELLED'
    | 'RESERVATION_MODIFIED'
    | 'RESERVATION_REMINDER'
    | 'RESERVATION_CHECKED_IN'
    | 'RESERVATION_NO_SHOW'
    | 'RESERVATION_PAYMENT'
    | 'RESERVATION_COMPLETED'
    | 'SYSTEM_ALERT'
    | 'TOURNAMENT_SCHEDULE_CHANGED'
    | 'TOURNAMENT_ANNOUNCEMENT'
    | 'ROLE_INVITATION'
    | 'ROLE_INVITATION_ACCEPTED'
    | 'ROLE_INVITATION_DECLINED'
    | 'ROLE_INVITATION_REVOKED'
    | 'ROLE_GRANTED'
    | 'ROLE_REVOKED'
    | 'GENERAL';
  title: string;
  message: string;
  read: boolean;
  createdAt: number;
  expiresAt?: number;
  notificationState?: 'UNREAD' | 'READ' | 'ACTIONED';
  actionedAt?: number;
  actionedBy?: string;
  actionResult?: string;
  data?: {
    expiresAt?: number;
    tournamentId?: string;
    tournamentName?: string;
    teamId?: string;
    teamName?: string;
    teamTag?: string;
    teamLogo?: string;
    teamSide?: 'teamA' | 'teamB' | string;
    captainId?: string;
    recipientId?: string;
    inviteId?: string;
    invitationId?: string;
    inviterId?: string;
    inviterGamerTag?: string;
    acceptedBy?: string;
    declinedBy?: string;
    lobbyId?: string;
    requestId?: string;
    matchId?: string;
    nextMatchId?: string;
    lobbyCode?: string;
    game?: string;
    gameId?: string;
    gameName?: string;
    slotNumber?: number;
    teamPath?: string;
    type?: string;
    cancellationReason?: string;
    cancelledBy?: string;
    performedBy?: string;
    reservationId?: string;
    customerName?: string;
    gamerTag?: string;
    reservationType?: string;
    requestedPcCount?: number;
    postName?: string;
    postNames?: string[];
    postType?: string;
    phoneNumber?: string;
    durationHours?: number;
    status?: string;
    station?: string;
    gameCategory?: string;
    actionState?: 'UNREAD' | 'READ' | 'ACTIONED';
    rejectionReason?: string;
    startAt?: number;
    endAt?: number;
    totalPrice?: number;
    [key: string]: any;
  };
}

export type CanonicalInvitationStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'CANCELLED' | 'EXPIRED';

export interface TeamInvitation {
  id: string;
  teamId: string;
  teamName: string;
  teamTag: string;
  teamLogo?: string;
  gameId: string;
  gameName: string;
  game?: string;
  captainId: string;
  senderId?: string;
  captainGamerTag: string;
  invitedPlayerId: string;
  recipientId?: string;
  invitedGamerTag: string;
  invitedPlayerGamerTag?: string;
  tournamentId?: string;
  tournamentName?: string;
  slotNumber?: number;
  type?: 'TEAM_INVITATION' | 'TEAM_TOURNAMENT_INVITATION' | '5V5_LOBBY_INVITATION' | 'CHESS_MATCH_INVITATION' | string;
  teamPath?: string;
  status: CanonicalInvitationStatus | string;
  createdAt: number;
  expiresAt?: number;
  expiredAt?: number;
  updatedAt?: number;
  acceptedAt?: number;
  acceptedBy?: string;
  respondedAt?: number;
  matchId?: string;
  station?: string;
  // 5v5 Lobby specific fields
  lobbyId?: string;
  teamSide?: 'teamA' | 'teamB';
  inviterId?: string;
  inviterGamerTag?: string;
  cancelledBy?: string;
  cancelledAt?: number;
}

export interface AuditLog {
  id: string;
  action: string;
  actorId: string;
  actorName: string;
  targetType: 'match' | 'player' | 'game' | 'team' | 'lobby' | 'reservation' | 'post' | 'system' | 'tournament' | 'season';
  targetId: string;
  teamId?: string;
  lobbyId?: string;
  matchId?: string;
  gameId?: string;
  reservationId?: string;
  bookingId?: string;
  tournamentId?: string;
  oldRole?: string;
  newRole?: string;
  oldBalance?: number;
  newBalance?: number;
  rewardAmount?: number;
  details: string;
  timestamp: number;
}

// ==========================================
// RESERVATION & GAMING POST DATA STRUCTURES
// ==========================================

export type GamingPostType = 'PC' | 'PS5';
export type GamingPostStatus = 'ACTIVE' | 'MAINTENANCE' | 'DISABLED';

export interface GamingPost {
  id: string; // e.g. 'pc_1', 'ps5_1'
  name: string; // e.g. 'PC 1', 'PS5 1'
  type: GamingPostType;
  status: GamingPostStatus;
  order: number;
  specs?: string; // e.g. 'RTX 4080 • 240Hz' or 'PS5 Pro • 4K 120Hz'
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export type PostBlockReason =
  | 'MAINTENANCE'
  | 'TECHNICAL_ISSUE'
  | 'PRIVATE_EVENT'
  | 'STAFF_HOLD'
  | 'OTHER';

export interface PostBlock {
  id: string;
  postId: string;
  postName: string;
  postType: GamingPostType;
  reason: PostBlockReason;
  reasonDescription?: string;
  startAt: number; // timestamp
  endAt: number; // timestamp
  createdById: string;
  createdByGamerTag: string;
  createdAt: number;
}

export interface OpeningHoursDay {
  open: string; // "10:00"
  close: string; // "00:00" (or "23:59")
  isOpen: boolean;
}

export interface ReservationSettings {
  id: string; // 'system_settings'
  pcHourlyPrice: number; // default: 150 DA
  ps5HourlyPrice: number; // default: 400 DA
  group10PcHourlyPrice?: number; // default: 1500 DA (10 * 150)
  groupDiscountPercent?: number; // e.g. 0% or 10%
  autoConfirm: boolean; // default: false (Manual Admin approval after phone call)
  minDurationHours: number; // default: 1
  maxDurationHours: number; // default: 8
  timeIntervalMinutes: number; // default: 60
  pendingExpirationMinutes: number; // default: 60 (pending requests expire if unconfirmed)
  cancellationDeadlineHours: number; // default: 2 (hours before start)
  cancellationFeePercent?: number; // default: 0
  openingHours: {
    monday: OpeningHoursDay;
    tuesday: OpeningHoursDay;
    wednesday: OpeningHoursDay;
    thursday: OpeningHoursDay;
    friday: OpeningHoursDay;
    saturday: OpeningHoursDay;
    sunday: OpeningHoursDay;
  };
  allowedPaymentMethods: Array<'CASH' | 'CARD' | 'ONLINE_PAYMENT' | 'OTHER'>;
  remindersEnabled: boolean;
  reminderHours: number[]; // e.g. [24, 2]
  updatedAt: number;
  updatedBy?: string;
}

export type ReservationType = 'PC' | 'PS5' | 'GROUP_10_PC';
export type ReservationStatus =
  | 'PENDING'
  | 'PENDING_ADMIN_APPROVAL'
  | 'CONFIRMED'
  | 'CHECKED_IN'
  | 'ACTIVE'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'NO_SHOW';

export type PaymentStatus = 'UNPAID' | 'PAID' | 'PARTIALLY_PAID' | 'REFUNDED';
export type PaymentMethod = 'CASH' | 'CARD' | 'ONLINE_PAYMENT' | 'OTHER';

export interface Reservation {
  id: string;
  userId: string;
  isGuest?: boolean;
  isWalkIn?: boolean;
  gamerTag: string;
  fullName?: string;
  phoneNumber: string; // Required snapshot contact number for admin call confirmation
  phone?: string; // Kept for backwards compatibility
  email?: string;
  reservationType: ReservationType;
  requestedPcCount?: number; // 8, 9, or 10 for PC group reservations
  gameId?: string;
  gameName?: string;
  postType: GamingPostType;
  postIds: string[]; // ['pc_1'] or for 10-pc: ['pc_1', 'pc_2', ... 'pc_10']
  postNames: string[]; // ['PC 1'] or all 10 PC names
  startAt: number; // timestamp in ms
  endAt: number; // timestamp in ms
  durationHours: number;
  status: ReservationStatus;
  totalPrice: number; // Total validated price in DA
  hourlyPriceSnapshot: number; // e.g. 150 DA or 400 DA or group rate
  originalPrice?: number;
  finalPrice?: number;
  priceOverrideReason?: string;
  priceOverriddenBy?: string;
  paymentStatus: PaymentStatus;
  amountPaid: number;
  remainingAmount: number;
  paymentMethod?: PaymentMethod;
  notes?: string;
  linkedMatchId?: string; // Optional integration with competitive 5v5 match
  createdById: string;
  createdByRole: 'player' | 'admin' | 'staff';
  createdAt: number;
  updatedAt: number;
  pendingExpiresAt?: number;
  confirmedAt?: number;
  confirmedBy?: string;
  approvedAt?: number;
  approvedBy?: string;
  rejectedAt?: number;
  rejectedBy?: string;
  rejectionReason?: string;
  expiredAt?: number;
  cancelledAt?: number;
  cancelledBy?: string;
  cancellationReason?: string;
  checkedInAt?: number;
  checkedInBy?: string;
  startedAt?: number;
  startedBy?: string;
  endedAt?: number;
  endedBy?: string;
  elapsedMinutes?: number;
  noShowAt?: number;
  noShowMarkedBy?: string;
  noShowReason?: string;
}

export interface PostSlotLock {
  id: string; // ${postId}_${slotStart}
  postId: string;
  slotStart: number;
  slotEnd: number;
  reservationId: string;
  userId: string;
  gamerTag?: string;
  status: ReservationStatus;
  createdAt: number;
  expiresAt?: number;
}

// ==========================================
// TOURNAMENT SYSTEM DATA STRUCTURES
// ==========================================

export type TournamentType = 'INDIVIDUAL' | 'TEAM';
export type TournamentFormat = 'SINGLE_ELIMINATION' | 'DOUBLE_ELIMINATION' | 'ROUND_ROBIN' | 'GROUP_STAGE_KNOCKOUT';
export type TournamentStatus = 'DRAFT' | 'REGISTRATION_OPEN' | 'REGISTRATION_CLOSED' | 'UPCOMING' | 'LIVE' | 'COMPLETED' | 'CANCELLED';

export type PlayerPresenceStatus = 'NOT_CONFIRMED' | 'CONFIRMED' | 'ABSENT';

export interface TournamentParticipant {
  id: string; // userId or teamId
  name: string; // gamerTag or teamName
  tag?: string; // e.g. team tag or player fullName
  avatarUrl?: string;
  seed?: number;
  type: 'PLAYER' | 'TEAM';
  registeredAt: number;
  currentMMR?: number;
  status?: 'CONFIRMED' | 'PENDING' | 'WITHDRAWN' | 'DISQUALIFIED' | 'INCOMPLETE';
  checkedIn?: boolean;
  checkedInAt?: number;
  checkedInBy?: string;
  withdrawnAt?: number;
  disqualifiedAt?: number;
  statusReason?: string;
  fullName?: string;
  inGameName?: string;
  inGameRank?: string;
  phoneNumber?: string;
  captainName?: string;
  captainPhone?: string;
  teamTag?: string;
  teamMemberIds?: string[]; // for 5v5 teams
  presenceStatus?: PlayerPresenceStatus;
  presenceConfirmedBy?: string;
  presenceConfirmedByName?: string;
  presenceConfirmedAt?: number;
  presenceNotes?: string;
  teamMembers?: Array<{
    uid: string;
    gamerTag: string;
    fullName?: string;
    inGameName?: string;
    inGameRank?: string;
    phoneNumber?: string;
    isCaptain?: boolean;
    slotNumber?: number;
    role?: 'captain' | 'starter' | 'substitute' | 'member';
    playerStatus?: 'EMPTY' | 'INVITED' | 'ACCEPTED' | 'ACCEPTED_INVITATION' | 'INFORMATION_INCOMPLETE' | 'PROFILE_INFORMATION_INCOMPLETE' | 'INFORMATION_COMPLETE' | 'DECLINED' | 'REMOVED' | 'COMPLETED' | string;
    informationConfirmed?: boolean;
    presenceStatus?: PlayerPresenceStatus;
    presenceConfirmedBy?: string;
    presenceConfirmedByName?: string;
    presenceConfirmedAt?: number;
    presenceNotes?: string;
  }>;
}

export interface TournamentPrizeBreakdown {
  firstPlace?: string;
  secondPlace?: string;
  thirdPlace?: string;
  cashPrize?: string;
  gamingEquipment?: string;
  freeGamingHours?: string;
  mmrBonus?: string;
  profileAchievement?: string;
  customPrize?: string;
  notes?: string;
}

export interface TournamentActivityLog {
  id: string;
  tournamentId: string;
  adminId: string;
  adminName: string;
  action: string;
  affectedParticipant?: string;
  oldValue?: string;
  newValue?: string;
  details?: string;
  timestamp: number;
}

export type TeamRegistrationStatus =
  | 'DRAFT'
  | 'WAITING_FOR_PLAYERS'
  | 'READY_TO_SUBMIT'
  | 'PENDING_ADMIN_APPROVAL'
  | 'CONFIRMED'
  | 'REJECTED'
  | 'CANCELLED';

export type PlayerSlotStatus =
  | 'EMPTY'
  | 'INVITED'
  | 'ACCEPTED'
  | 'INFORMATION_INCOMPLETE'
  | 'INFORMATION_COMPLETE'
  | 'DECLINED'
  | 'REMOVED'
  | 'CANCELLED'
  // Backward compatibility
  | 'ACCEPTED_INVITATION'
  | 'PROFILE_INFORMATION_INCOMPLETE'
  | 'JOINED'
  | 'COMPLETED';

export interface TeamTournamentPlayerSlot {
  slotNumber: 1 | 2 | 3 | 4 | 5;
  isCaptain: boolean;
  status: PlayerSlotStatus;
  playerStatus?: 'EMPTY' | 'INVITED' | 'ACCEPTED' | 'ACCEPTED_INVITATION' | 'INFORMATION_INCOMPLETE' | 'PROFILE_INFORMATION_INCOMPLETE' | 'INFORMATION_COMPLETE' | 'DECLINED' | 'REMOVED' | 'CANCELLED';
  invitationStatus?: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'NONE' | 'CANCELLED' | string;
  
  // Real Player Identity (Firebase UID)
  playerId?: string; // Nexus user.uid
  gamerTag?: string; // Nexus gamerTag
  fullName?: string; // Required Full Name
  inGameName?: string; // Game-specific in-game name (e.g. CS2 Name, Riot ID, etc.)
  phoneNumber?: string; // Private phone number (at least 8 chars)
  inGameRank?: string; // Game-specific rank (e.g. Global Elite, Immortal 3, etc.)
  
  // Invitation metadata
  invitationId?: string;
  invitedGamerTag?: string;
  invitedPlayerId?: string;
  recipientId?: string;
  invitedAt?: number;
  expiresAt?: number;
  
  // Removal tracking (safe member state)
  removedPlayerId?: string;
  removedGamerTag?: string;
  removedPlayerGamerTag?: string;
  removedAt?: number;
  removedBy?: string;
  
  // Personal Acceptance Audit
  acceptedAt?: number;
  acceptedBy?: string; // Firebase UID of the player who clicked Accept
  
  // Personal Information Completion Audit
  informationCompletedAt?: number;
  informationCompletedBy?: string; // Firebase UID of the player who completed info
  confirmedByPlayer?: boolean; // "I confirm that this information belongs to me and is correct."
  
  // Legacy / convenience fields
  joinedAt?: number;
  completedAt?: number;
  informationConfirmed?: boolean;
  presenceStatus?: PlayerPresenceStatus;
  presenceConfirmedBy?: string;
  presenceConfirmedByName?: string;
  presenceConfirmedAt?: number;
  presenceNotes?: string;
}

export interface TeamTournamentRegistration {
  id: string;
  teamId?: string;
  tournamentId: string;
  tournamentName: string;
  gameId: string;
  gameName: string;
  
  teamName: string;
  teamNameLower: string;
  teamTag?: string;
  teamLogo?: string;
  
  captainId: string;
  captainGamerTag: string;
  captainFullName: string;
  captainPhone: string;
  
  slots: TeamTournamentPlayerSlot[]; // Exactly 5 slots: 1 (Captain), 2, 3, 4, 5
  filledSlotsCount?: number;
  memberIds?: string[];
  status: TeamRegistrationStatus;
  
  // Submission
  submittedAt?: number;
  submittedBy?: string;
  
  // Admin review
  reviewedBy?: string;
  reviewedByName?: string;
  reviewedAt?: number;
  adminNotes?: string;
  rejectionReason?: string;
  
  // Removal history
  removedMembers?: Array<{
    playerId?: string;
    gamerTag?: string;
    slotNumber: number;
    removedAt: number;
    reason?: string;
  }>;
  
  createdAt: number;
  updatedAt: number;
}

export interface TournamentMatchScore {
  scoreA: number;
  scoreB: number;
}

export interface TournamentMatchSubmittedResult {
  scoreA: number;
  scoreB: number;
  winnerId: string;
  winnerName?: string;
  submittedBy?: string;
  submittedByName?: string;
  submittedAt?: number;
  notes?: string;
}

export interface TournamentMatch {
  id: string;
  tournamentId: string;
  round: number; // 1 = Quarterfinals, etc. or Round 1
  roundName: string; // e.g. "Round of 16", "Quarter-Finals", "Semi-Finals", "Grand Finals", "3rd Place Playoff"
  matchNumber: number;
  bracketType?: 'WINNERS' | 'LOSERS' | 'GROUP' | 'MAIN';
  groupName?: string; // e.g. "Group A"
  station?: string;
  
  participantA?: TournamentParticipant;
  participantB?: TournamentParticipant;
  participantAId?: string;
  participantBId?: string;
  participantAName?: string;
  participantBName?: string;
  
  scoreA?: number;
  scoreB?: number;
  winnerId?: string; // participantA.id or participantB.id
  winnerName?: string;
  loserId?: string;
  loserName?: string;
  
  status: 'SCHEDULED' | 'READY' | 'LIVE' | 'AWAITING_CONFIRMATION' | 'PENDING_ADMIN_APPROVAL' | 'COMPLETED' | 'CONFIRMED' | 'DISPUTED';
  linkedMatchId?: string; // If hooked up to live match room
  
  nextMatchId?: string; // Winner advances to this match
  nextMatchSlot?: 'A' | 'B';
  loserMatchId?: string; // Loser drops to this match (for double elimination or 3rd place)
  loserMatchSlot?: 'A' | 'B';
  
  // Timing & Duration tracking
  scheduledTime?: number;
  actualStartedAt?: number;
  actualEndedAt?: number;
  durationSeconds?: number;
  isBye?: boolean;
  
  // Admin approval & Result submission flow
  submittedResult?: TournamentMatchSubmittedResult;
  adminApproved?: boolean;
  adminApprovedAt?: number;
  adminApprovedBy?: string;
  adminApprovedByName?: string;
  
  // Disputes
  disputedAt?: number;
  disputeReason?: string;
  disputedBy?: string;
  disputedByName?: string;
  
  adminNotes?: string;
  notes?: string;
  completedAt?: number;
  updatedAt: number;
}

export interface TournamentStanding {
  place: number; // 1 = 1st, 2 = 2nd, 3 = 3rd, 4 = 4th, etc.
  participantId: string;
  participantName: string;
  participantType: 'PLAYER' | 'TEAM';
  prize?: string;
  achievementBadge?: string;
  ratingChangeApplied?: number;
  memberIds?: string[];
}

export interface Tournament {
  id: string;
  name: string;
  description?: string;
  rules?: string;
  gameId: string;
  gameName: string;
  gameCategory: GameCategory; // 'PC' | 'PS5' | 'CHESS'
  type: TournamentType; // 'INDIVIDUAL' | 'TEAM'
  format: TournamentFormat;
  status: TournamentStatus;
  
  maxParticipants: number; // e.g. 4, 8, 16, 32
  currentParticipantsCount: number;
  entryFee?: string; // e.g. "Free" or "500 DA"
  prizePool?: string; // e.g. "25,000 DA + Trophy"
  location?: string; // e.g. "Main Stage Arena", "Nexus PC Section 01-10", "Nexus Gaming Center"
  prizes?: TournamentPrizeBreakdown;
  
  applyMMR: boolean; // Whether match outcomes affect official center MMR
  bannerUrl?: string;
  
  startDate: number;
  endDate?: number;
  registrationDeadline?: number;
  
  participants: TournamentParticipant[];
  matches?: TournamentMatch[];
  
  // Admin completion & official announcement
  winnerAnnounced: boolean;
  winnerId?: string;
  winnerName?: string;
  winnerType?: 'PLAYER' | 'TEAM';
  winnerAvatarUrl?: string;
  
  runnerUpId?: string;
  runnerUpName?: string;
  thirdPlaceId?: string;
  thirdPlaceName?: string;
  
  finalStandings?: TournamentStanding[];
  qualificationEvents?: TournamentQualificationEvent[];
  
  createdById: string;
  createdByName: string;
  createdAt: number;
  updatedAt: number;
  startedAt?: number;
  completedAt?: number;
  announcedAt?: number;
}

export interface TournamentAchievement {
  id: string;
  tournamentId: string;
  tournamentName: string;
  gameId: string;
  gameName: string;
  gameCategory: GameCategory;
  tournamentType: TournamentType;
  place: number; // 1, 2, 3, 4
  placement?: number; // alias for place
  title: string; // e.g. "Champion", "Finalist", "Semi-Finalist"
  badgeText?: string;
  icon: string; // e.g. "🏆", "🥈", "🥉", "🎖️"
  date: number;
  awardedAt?: number; // alias for date
  prize?: string;
  teamId?: string;
  teamName?: string;
  recipientPlayerId?: string;
}

export interface TournamentQualificationEvent {
  eventId: string; // e.g. qual_${tournamentId}_${matchId}
  tournamentId: string;
  tournamentName?: string;
  matchId: string;
  matchNumber?: number;
  round: number;
  roundName: string;
  winnerTeamId: string;
  winnerTeamName: string;
  winnerTeamTag?: string;
  winnerAvatarUrl?: string;
  loserTeamId: string;
  loserTeamName: string;
  loserTeamTag?: string;
  loserAvatarUrl?: string;
  scoreA: number;
  scoreB: number;
  nextMatchId?: string;
  nextRoundName?: string;
  loserMatchId?: string;
  loserRoundName?: string;
  isSemiFinal?: boolean;
  isChampionship?: boolean;
  qualificationTime: number;
  createdAt: number;
  approvedBy?: string;
  approvedByName?: string;
}

// ==========================================
// ARENA TOURNAMENT NEWS & BROADCAST FEED
// ==========================================

export type ArenaNewsType =
  | 'CHAMPION'
  | 'GRAND_FINAL_LIVE'
  | 'MATCH_LIVE'
  | 'QUALIFIED'
  | 'THIRD_PLACE_RACE'
  | 'MATCH_ENDED_PENDING'
  | 'UPCOMING_MATCH'
  | 'TOURNAMENT_DRAW'
  | 'TOURNAMENT_STARTED'
  | 'OFFICIAL_MATCH_STAGES'
  | 'TOURNAMENT_ANNOUNCEMENT';

export interface ArenaNewsItem {
  newsId: string;
  tournamentId: string;
  tournamentName: string;
  gameId?: string;
  gameName?: string;
  gameCategory?: GameCategory;
  matchId?: string;
  matchNumber?: number;
  round?: number;
  roundName?: string;
  eventType: ArenaNewsType;
  title: string;
  headline: string;
  description: string;
  priority: number; // 100 for CHAMPION, 90 for LIVE, 80 for QUALIFIED, 75 for 3RD PLACE, 70 for UPCOMING_FINAL, 65 for OFFICIAL_STAGES, 60 for UPCOMING, 55 for ANNOUNCEMENT (or 85 when open), 50 for PENDING, 40 for DRAW
  
  // Registration and tournament announcement specifics
  registrationStatus?: 'OPEN' | 'CLOSED' | 'UPCOMING';
  confirmedCount?: number;
  maxParticipants?: number;
  prizePool?: string;
  entryFee?: string;
  location?: string;
  tournamentDate?: number;
  tournamentType?: 'INDIVIDUAL' | 'TEAM';

  // Bracket stages overview
  matchStagesSummary?: Array<{
    matchId: string;
    roundName: string;
    teamAName: string;
    teamBName: string;
    scheduledTime?: number;
    station?: string;
  }>;

  // Final and qualification specifics
  finalScore?: {
    scoreA: number;
    scoreB: number;
  };

  teamA?: {
    id: string;
    name: string;
    tag?: string;
    avatarUrl?: string;
    score?: number;
  };
  teamB?: {
    id: string;
    name: string;
    tag?: string;
    avatarUrl?: string;
    score?: number;
  };
  winnerTeam?: {
    id: string;
    name: string;
    tag?: string;
    avatarUrl?: string;
  };
  loserTeam?: {
    id: string;
    name: string;
    tag?: string;
    avatarUrl?: string;
  };
  thirdPlaceWinner?: {
    id: string;
    name: string;
    tag?: string;
    avatarUrl?: string;
  };
  nextRoundName?: string;
  nextMatchId?: string;
  nextMatchScheduledAt?: number;
  scheduledAt?: number;
  actualStartedAt?: number;
  actualEndedAt?: number;
  approvedAt?: number;
  approvedByName?: string;
  timestamp: number;
  isSemiFinal?: boolean;
  isChampionship?: boolean;
  station?: string;
}

// ========================================================
// 5v5 LOBBY RECRUITMENT ANNOUNCEMENT SYSTEM
// ========================================================
export type RecruitmentStatus = 'ACTIVE' | 'FULL' | 'IN_LOBBY' | 'CANCELLED' | 'EXPIRED';

export interface LobbyRecruitment {
  id: string; // matchId
  lobbyId: string; // matchId
  lobbyCode: string;
  teamId: string;
  teamName: string;
  teamTag: string;
  teamLogo?: string;
  captainId: string;
  captainName: string;
  captainGamerTag: string;
  gameId: string;
  gameName: string;
  gameCategory: GameCategory;
  station: Station;
  pcCount?: number;
  currentActivePlayers: number; // e.g. 3
  playersNeeded: number; // 5 - currentActivePlayers
  status: RecruitmentStatus;
  teamAvgRating?: number;
  playerIds: string[]; // member UIDs
  recruitmentMessage?: string;
  preferredRole?: string;
  teamSide?: 'teamA' | 'teamB';
  createdAt: number;
  updatedAt: number;
}

// ========================================================
// NEXUS COINS & FIDELITY CARD REWARD SYSTEM
// ========================================================

export type CoinTransactionType =
  | 'MATCH_WIN'
  | 'MATCH_LOSS_REWARD'
  | 'MATCH_DRAW_REWARD'
  | 'MATCH_PLAY'
  | 'REDEMPTION'
  | 'ADMIN_ADJUSTMENT'
  | 'ADJUSTMENT_DEBIT'
  | 'TOURNAMENT_REWARD';

export interface CoinTransaction {
  id: string; // e.g. `tx_match_${matchId}_${playerUid}` or `tx_${timestamp}_${random}`
  transactionId?: string; // Canonical alias for id
  playerUid: string;
  userId?: string; // Canonical alias for playerUid
  playerId?: string; // Canonical alias for playerUid
  gamerTag?: string;
  amount: number; // positive for earned, negative for spent
  type: CoinTransactionType;
  result?: 'WIN' | 'DRAW' | 'LOSS' | string;
  reason: string;
  game?: string;
  gameId?: string;
  matchId?: string;
  officialHours?: number;
  opponentName?: string;
  rewardId?: string;
  rewardTitle?: string;
  redemptionId?: string;
  redemptionCode?: string;
  adminUid?: string;
  adminName?: string;
  balanceBefore?: number;
  balanceAfter?: number;
  actor?: string; // 'SYSTEM' | playerUid | adminUid
  actorType?: 'SYSTEM' | 'PLAYER' | 'ADMIN';
  status?: 'COMPLETED' | 'PENDING' | 'FAILED';
  createdAt: number;
}

export interface CoinRewardsSettings {
  id: string; // 'default'
  gameRewards: Record<string, number>; // gameId -> NC amount, e.g. { 'chess': 2, 'fc26': 60, 'fc27': 60, 'fc': 60, 'valorant': 15, 'cs2': 15 }
  defaultReward: number; // fallback reward for unconfigured games
  updatedAt: number;
  updatedBy?: string;
}

export type FidelityRewardCategory = 'STATION_TIME' | 'FOOD_BEVERAGE' | 'TOURNAMENT' | 'MERCH' | 'PASS' | 'SPECIAL';

export interface FidelityReward {
  id: string;
  title: string;
  description: string;
  icon?: string; // lucide icon identifier or visual code e.g. 'monitor', 'gamepad', 'trophy', 'sparkles', 'coffee', 'gift'
  cost: number; // NC cost (Authoritative)
  coinCost: number; // standard NC cost
  category: FidelityRewardCategory;
  game: string; // Associated game: 'ALL', 'FC', 'CHESS', 'VALORANT', 'CS2', 'LOL'
  active: boolean;
  availableQuantity?: number | null; // null for unlimited
  claimedCount?: number;
  terms?: string;
  displayOrder: number;
  // Limited-time offer / Flash sale support
  hasOffer?: boolean;
  offerPrice?: number;
  offerStartAt?: number; // timestamp
  offerEndAt?: number; // timestamp
  offerLabel?: string; // e.g. 'FLASH OFFER', 'WEEKEND PASS'
  isDeleted?: boolean;
  deletedAt?: number;
  deletedBy?: string;
  createdBy: string; // Admin UID who created the offer
  createdAt: number;
  updatedAt: number;
}

export type RedemptionStatus = 'ACTIVE' | 'USED' | 'CANCELLED' | 'EXPIRED' | 'APPROVED' | 'PENDING';

export interface RewardRedemption {
  id: string;
  redemptionId: string; // Canonical identifier
  code: string; // e.g. "NEXUS-8UT7D"
  redemptionCode: string; // Canonical alias
  playerUid: string;
  playerId: string; // Firebase Authentication UID
  playerGamerTag: string;
  playerEmail?: string;
  rewardId: string;
  rewardTitle: string;
  rewardNameSnapshot?: string;
  rewardDescriptionSnapshot?: string;
  rewardCategory: FidelityRewardCategory;
  coinCost: number; // actual coins charged
  ncCost: number; // Canonical alias
  status: RedemptionStatus;
  terms?: string;
  createdAt: number;
  updatedAt?: number;
  usedAt?: number;
  usedBy?: string; // UID of authorized staff
  verifiedBy?: string; // Display name or alias
  cancelledAt?: number;
  expiresAt?: number;
  notes?: string;
}

export interface WalletReconciliationResult {
  playerUid: string;
  playerId?: string;
  gamerTag: string;
  currentWalletBalance: number;
  calculatedLedgerBalance: number;
  delta: number;
  isDiscrepancy: boolean;
  totalPositiveCoins: number;
  totalNegativeCoins: number;
  transactionCount: number;
  reconciledAt: number;
}

export type OfficialMatchStatus = 'OFFICIAL' | 'CORRECTED' | 'CANCELLED';

export interface OfficialMatchResult {
  id: string;
  resultId: string;
  gameId: string;
  gameName: string;
  matchFormat: '1v1' | '5v5';
  
  // 1v1 Participants
  playerAId?: string;
  playerAGamerTag?: string;
  playerBId?: string;
  playerBGamerTag?: string;
  playerAWins?: number;
  playerALosses?: number;
  playerBWins?: number;
  playerBLosses?: number;
  outcome?: 'playerA' | 'playerB' | 'draw' | 'teamA' | 'teamB';
  winnerId?: string | null;
  winnerGamerTag?: string | null;

  // 5v5 Team Participants & Snapshots
  is5v5?: boolean;
  teamAId?: string;
  teamAName?: string;
  teamATag?: string;
  teamALogo?: string;
  teamAPlayerIds?: string[];
  teamAPlayerGamerTags?: string[];
  teamAPlayers?: { uid: string; gamerTag: string; fullName?: string }[];

  teamBId?: string;
  teamBName?: string;
  teamBTag?: string;
  teamBLogo?: string;
  teamBPlayerIds?: string[];
  teamBPlayerGamerTags?: string[];
  teamBPlayers?: { uid: string; gamerTag: string; fullName?: string }[];

  winningTeam?: 'teamA' | 'teamB' | 'draw';
  winnerTeamId?: string;
  winnerTeamName?: string;
  winnerTeamTag?: string;
  loserTeamId?: string;
  loserTeamName?: string;
  loserTeamTag?: string;
  winnerIds?: string[];
  loserIds?: string[];

  // Authoritative Reward Calculations
  rewardPerWinner: number;
  rewardPerLoser?: number;
  officialHours?: number;
  totalRewardAwarded: number;
  rewardBreakdown: string;
  isDraw: boolean;
  
  // Operator & Audit
  recordedBy: string;
  recordedByName: string;
  recordedByRole: 'STAFF' | 'ADMIN' | 'SUPER_ADMIN';
  createdAt: number;
  idempotencyKey: string;
  status: OfficialMatchStatus;

  // Correction Metadata
  isCorrected?: boolean;
  correctedAt?: number;
  correctedBy?: string;
  correctedByName?: string;
  correctionReason?: string;
  previousResultId?: string;
  notes?: string;

  // Authoritative MMR / Rating Metadata
  playerAPreviousMMR?: number;
  playerANewMMR?: number;
  playerAMMRChange?: number;
  playerBPreviousMMR?: number;
  playerBNewMMR?: number;
  playerBMMRChange?: number;

  // 5v5 Team MMR Snapshots
  teamARatingBefore?: number;
  teamARatingAfter?: number;
  teamAMMRChange?: number;
  teamBRatingBefore?: number;
  teamBRatingAfter?: number;
  teamBMMRChange?: number;

  teamAMMRChanges?: Record<string, { ratingBefore: number; ratingAfter: number; change: number }>;
  teamBMMRChanges?: Record<string, { ratingBefore: number; ratingAfter: number; change: number }>;
  teamOutcome?: 'teamA' | 'teamB' | 'draw';
  seasonId?: string;
  seasonNumber?: number;
}

export interface MatchHistoryRecord {
  id?: string;
  matchId: string;
  game: string;
  gameMode: string;
  player1Id: string;
  player1GamerTag: string;
  player2Id: string;
  player2GamerTag: string;
  winnerId: string;
  winnerGamerTag: string;
  loserId: string;
  loserGamerTag: string;
  player1Wins: number;
  player1Losses: number;
  player2Wins: number;
  player2Losses: number;
  winnerNCReward: number;
  loserNCReward: number;
  player1NCReward?: number;
  player2NCReward?: number;
  validatedBy: string;
  validatedByRole: string;
  validatedAt: number;
  createdAt: number;
  status: 'VALIDATED';

  // Detail view & squad metadata
  player1FullName?: string;
  player2FullName?: string;
  validatedByName?: string;
  idempotencyKey?: string;
  totalGames?: number;
  gameCount?: string | number;
  notes?: string;
  team1PlayerIds?: string[];
  team2PlayerIds?: string[];
  team1GamerTags?: string[];
  team2GamerTags?: string[];
  officialHours?: number;

  // 5v5 Team Snapshots
  is5v5?: boolean;
  teamAId?: string;
  teamAName?: string;
  teamATag?: string;
  teamALogo?: string;
  teamAPlayerIds?: string[];
  teamAPlayerGamerTags?: string[];
  teamAPlayers?: { uid: string; gamerTag: string; fullName?: string }[];

  teamBId?: string;
  teamBName?: string;
  teamBTag?: string;
  teamBLogo?: string;
  teamBPlayerIds?: string[];
  teamBPlayerGamerTags?: string[];
  teamBPlayers?: { uid: string; gamerTag: string; fullName?: string }[];

  winnerTeamId?: string;
  winnerTeamName?: string;
  winnerTeamTag?: string;
  loserTeamId?: string;
  loserTeamName?: string;
  loserTeamTag?: string;
  teamOutcome?: 'teamA' | 'teamB' | 'draw';

  teamARatingBefore?: number;
  teamARatingAfter?: number;
  teamAMMRChange?: number;
  teamBRatingBefore?: number;
  teamBRatingAfter?: number;
  teamBMMRChange?: number;

  // Authoritative MMR / Rating Metadata
  player1PreviousMMR?: number;
  player1NewMMR?: number;
  player1MMRChange?: number;
  player2PreviousMMR?: number;
  player2NewMMR?: number;
  player2MMRChange?: number;
  seasonId?: string;
  seasonNumber?: number;

  // Authoritative NC Reward Fields (Single Source of Truth)
  teamARewardPerPlayer?: number;
  teamBRewardPerPlayer?: number;
  rewardPerWinner?: number;
  rewardPerLoser?: number;
  totalRewardAwarded?: number;
  rewardBreakdown?: string;
  isDraw?: boolean;
}
