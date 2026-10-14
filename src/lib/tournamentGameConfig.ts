export interface GameTournamentConfig {
  gameId: string;
  gameName: string;
  inGameNameLabel: string;
  inGameNamePlaceholder: string;
  inGameRankLabel: string;
  rankOptions: string[];
}

export function getTournamentGameConfig(gameId: string, gameName: string): GameTournamentConfig {
  const normalized = (gameId || '').toLowerCase().trim();
  const nameNorm = (gameName || '').toLowerCase().trim();

  if (normalized.includes('cs') || nameNorm.includes('counter-strike') || nameNorm.includes('cs2') || nameNorm.includes('cs:go')) {
    return {
      gameId,
      gameName: 'Counter-Strike 2',
      inGameNameLabel: 'CS2 In-Game Name & Steam ID',
      inGameNamePlaceholder: 'e.g. s1mple#1337 or Steam Nickname',
      inGameRankLabel: 'CS2 Rank / Premier Rating',
      rankOptions: [
        'Premier: 25,000+ (World Class)',
        'Premier: 20,000 - 24,999',
        'Premier: 15,000 - 19,999',
        'Premier: 10,000 - 14,999',
        'Premier: 5,000 - 9,999',
        'Premier: Under 5,000',
        'FACEIT Level 10',
        'FACEIT Level 8 - 9',
        'FACEIT Level 5 - 7',
        'FACEIT Level 1 - 4',
        'The Global Elite',
        'Supreme First Class',
        'Legendary Eagle Master / LE',
        'Distinguished Master Guardian (DMG)',
        'Master Guardian I / II / Elite',
        'Gold Nova I - IV',
        'Silver I - Elite',
      ],
    };
  }

  if (normalized.includes('val') || nameNorm.includes('valorant')) {
    return {
      gameId,
      gameName: 'Valorant',
      inGameNameLabel: 'Valorant Riot ID & Tagline',
      inGameNamePlaceholder: 'e.g. TenZ#NA1 or Aspas#BR1',
      inGameRankLabel: 'Valorant Competitive Rank',
      rankOptions: [
        'Radiant',
        'Immortal 3',
        'Immortal 2',
        'Immortal 1',
        'Ascendant 3',
        'Ascendant 2',
        'Ascendant 1',
        'Diamond 3',
        'Diamond 2',
        'Diamond 1',
        'Platinum 1 - 3',
        'Gold 1 - 3',
        'Silver 1 - 3',
        'Bronze / Iron',
      ],
    };
  }

  if (normalized.includes('lol') || normalized.includes('league') || nameNorm.includes('league of legends') || nameNorm.includes('lol')) {
    return {
      gameId,
      gameName: 'League of Legends',
      inGameNameLabel: 'Riot ID & Tagline',
      inGameNamePlaceholder: 'e.g. Faker#KR1 or Caps#EUW',
      inGameRankLabel: 'LoL Competitive Solo/Duo/Flex Rank',
      rankOptions: [
        'Challenger (Top 300)',
        'Grandmaster',
        'Master',
        'Diamond I - II',
        'Diamond III - IV',
        'Emerald I - IV',
        'Platinum I - IV',
        'Gold I - IV',
        'Silver I - IV',
        'Bronze / Iron',
      ],
    };
  }

  if (normalized.includes('fc') || normalized.includes('fifa') || nameNorm.includes('fc') || nameNorm.includes('fifa')) {
    return {
      gameId,
      gameName: 'EA Sports FC',
      inGameNameLabel: 'EA ID / PlayStation Network ID',
      inGameNamePlaceholder: 'e.g. EA-ProGamer25 or PSN Nickname',
      inGameRankLabel: 'FC Division Rivals / Champs Rank',
      rankOptions: [
        'Elite Division (Top Tier)',
        'Division 1',
        'Division 2',
        'Division 3',
        'Division 4 - 6',
        'Division 7 - 10',
        'FUT Champions Rank 1 - 3 (16+ Wins)',
        'FUT Champions Rank 4 - 6 (9 - 15 Wins)',
        'Pro Clubs Player / Tournament Veteran',
      ],
    };
  }

  if (normalized.includes('chess') || nameNorm.includes('chess')) {
    return {
      gameId,
      gameName: 'Competitive Chess',
      inGameNameLabel: 'Chess.com / Lichess / FIDE ID',
      inGameNamePlaceholder: 'e.g. MagnusC90 or FIDE ID',
      inGameRankLabel: 'Chess ELO Rating / Title',
      rankOptions: [
        'GM / IM / FM Title',
        'FIDE Master / National Master',
        'FIDE / Arena 2200+',
        'FIDE / Arena 2000 - 2199',
        'Online Rapid 2000+',
        'Online Rapid 1800 - 1999',
        'Online Rapid 1600 - 1799',
        'Online Rapid 1400 - 1599',
        'Online Rapid 1200 - 1399',
        'Intermediate / Club Player (1000 - 1199)',
        'Novice / Beginner (< 1000)',
      ],
    };
  }

  // Default fallback
  const cleanName = gameName || 'Esports Game';
  return {
    gameId,
    gameName: cleanName,
    inGameNameLabel: `${cleanName} In-Game Nickname`,
    inGameNamePlaceholder: `Enter your official handle for ${cleanName}`,
    inGameRankLabel: `${cleanName} Competitive Rank`,
    rankOptions: [
      'Pro / Master / Tier 1',
      'Diamond / High Elo / Tier 2',
      'Platinum / Veteran / Tier 3',
      'Gold / Intermediate',
      'Silver / Novice',
      'Unranked / Casual',
    ],
  };
}

/**
 * Validate phone number format (at least 8 digits, valid characters)
 */
export function validatePhoneNumber(phone?: string): { valid: boolean; error?: string } {
  if (!phone || !phone.trim()) {
    return { valid: false, error: 'Phone number is strictly mandatory.' };
  }
  const clean = phone.trim();
  const digitsOnly = clean.replace(/[^0-9]/g, '');
  if (digitsOnly.length < 8) {
    return { valid: false, error: 'Phone number must contain at least 8 digits.' };
  }
  const regex = /^[+0-9\s\-()]{8,20}$/;
  if (!regex.test(clean)) {
    return { valid: false, error: 'Phone number format is invalid.' };
  }
  return { valid: true };
}

/**
 * Mask private phone number for unauthorized viewers
 */
export function maskPhoneNumber(phone?: string, authorized: boolean = false): string {
  if (!phone) return '—';
  if (authorized) return phone;
  const digits = phone.trim();
  if (digits.length <= 4) return '••••••••';
  return `${digits.slice(0, 3)} •••• •• ${digits.slice(-2)}`;
}
