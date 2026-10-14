export type SupportedGameId = 'chess' | 'fc' | 'valorant' | 'cs2' | 'lol';
export type CanonicalGameCategory = 'CHESS' | 'FC' | 'VALORANT' | 'CS2' | 'LEAGUE_OF_LEGENDS';

export interface CompetitiveGameConfig {
  id: SupportedGameId;
  name: string;
  shortName: string;
  category: 'CHESS' | 'PS5' | 'PC' | 'FC' | 'VALORANT' | 'CS2' | 'LEAGUE_OF_LEGENDS';
  matchFormat: '1v1' | '5v5';
  icon: string;
  tagline: string;
  description: string;
  badgeThemeName: string;
  badgeThemeDescription: string;
}

export const COMPETITIVE_GAMES: CompetitiveGameConfig[] = [
  {
    id: 'chess',
    name: 'Chess',
    shortName: 'Chess',
    category: 'CHESS',
    matchFormat: '1v1',
    icon: '♟️',
    tagline: '1v1 Classical Strategy',
    description: 'Competitive 1v1 over-the-board clock duels. Deep strategic calculation, positional foresight, and endgame precision.',
    badgeThemeName: 'Chess Royal Heraldry',
    badgeThemeDescription: 'Handcrafted chess pieces, heraldic royal crowns, checkered battlements, and grandmaster gold crosses.',
  },
  {
    id: 'fc',
    name: 'FC',
    shortName: 'FC',
    category: 'FC',
    matchFormat: '1v1',
    icon: '⚽',
    tagline: '1v1 Football Tournament',
    description: 'Premier competitive 1v1 football tournament standard. All FC editions (FC26, FC27) unified under one FC ranking.',
    badgeThemeName: 'Stadium & Championship Trophy Crests',
    badgeThemeDescription: 'Classic stadium pitch arches, golden soccer balls, victory laurels, and prestigious championship medals.',
  },
  {
    id: 'valorant',
    name: 'Valorant',
    shortName: 'Valorant',
    category: 'VALORANT',
    matchFormat: '5v5',
    icon: '🎯',
    tagline: '5v5 Tactical Shooter',
    description: 'Character-based 5v5 tactical shooter with ability economy, bomb site coordination, and clutch play.',
    badgeThemeName: 'Radianite Crystals & Esports Tactical Blades',
    badgeThemeDescription: 'Sharp tactical strike shields, glowing radianite crystal facets, combat geometry, and radiant solar starbursts.',
  },
  {
    id: 'cs2',
    name: 'CS2',
    shortName: 'CS2',
    category: 'CS2',
    matchFormat: '5v5',
    icon: '🔫',
    tagline: '5v5 Precision Tactical FPS',
    description: 'Legendary 5v5 tactical FPS. Sub-tick precision gunplay, utility coordination, and team execution.',
    badgeThemeName: 'Industrial Stencil Insignias & Major Stars',
    badgeThemeDescription: 'Kevlar armor plates, polished steel CT wings, military officer chevrons, titanium strike shields, and major championship star clusters.',
  },
  {
    id: 'lol',
    name: 'League of Legends',
    shortName: 'League of Legends',
    category: 'LEAGUE_OF_LEGENDS',
    matchFormat: '5v5',
    icon: '🧙',
    tagline: '5v5 Strategic MOBA',
    description: 'Premier 5v5 MOBA esport. Strategic macro play, objective prioritization, champion synergy, and teamfight coordination.',
    badgeThemeName: 'Hextech Crystals & Challenger Crests',
    badgeThemeDescription: 'Hextech-infused armor plates, glowing runic wings, ascended gold filigree, and celestial grandmaster crests.',
  },
];

export const CANONICAL_COMPETITIVE_CATALOG = ['CHESS', 'FC', 'VALORANT', 'CS2', 'LEAGUE_OF_LEGENDS'] as const;

/**
 * Normalizes any game string to the authoritative Nexus competitive game enum.
 * Unwanted/unsupported games are rejected.
 */
export function normalizeRankingGame(rawGame?: string | null): {
  supported: boolean;
  gameId: SupportedGameId | null;
  gameCategory: CanonicalGameCategory | null;
  canonicalName: string | null;
  gameVersion?: string;
} {
  if (!rawGame) return { supported: false, gameId: null, gameCategory: null, canonicalName: null };
  const clean = rawGame.toLowerCase().trim();

  // Reject unsupported games explicitly
  if (
    clean.includes('tekken') ||
    clean.includes('rocket') ||
    clean.includes('mortal') ||
    clean.includes('kombat') ||
    clean.includes('fortnite') ||
    clean.includes('call of duty') ||
    clean.includes('call-of-duty') ||
    clean.includes('cod')
  ) {
    return { supported: false, gameId: null, gameCategory: null, canonicalName: null };
  }

  // Chess
  if (clean.includes('chess')) {
    return {
      supported: true,
      gameId: 'chess',
      gameCategory: 'CHESS',
      canonicalName: 'Chess',
    };
  }

  // FC (FC26, FC27, FC, EA SPORTS FC, FC EA, EA FC, FIFA, etc.) - ALWAYS UNIFIED TO 'FC'
  if (
    clean.startsWith('fc') ||
    clean.includes('fc-26') ||
    clean.includes('fc 26') ||
    clean.includes('fc26') ||
    clean.includes('fc-27') ||
    clean.includes('fc 27') ||
    clean.includes('fc27') ||
    clean.includes('ea-fc') ||
    clean.includes('ea fc') ||
    clean.includes('fc ea') ||
    clean.includes('fc-ea') ||
    clean.includes('ea_fc') ||
    clean.includes('fc_ea') ||
    clean.includes('eafc') ||
    clean.includes('fcea') ||
    clean.includes('ea sports fc') ||
    clean.includes('fifa')
  ) {
    let gameVersion = 'FC';
    if (clean.includes('27')) gameVersion = 'FC27';
    else if (clean.includes('26')) gameVersion = 'FC26';
    return {
      supported: true,
      gameId: 'fc',
      gameCategory: 'FC',
      canonicalName: 'FC',
      gameVersion,
    };
  }

  // Valorant
  if (clean.includes('val')) {
    return {
      supported: true,
      gameId: 'valorant',
      gameCategory: 'VALORANT',
      canonicalName: 'Valorant',
    };
  }

  // CS2
  if (clean.includes('cs2') || clean.includes('counter-strike') || clean.includes('cs-2') || clean === 'cs') {
    return {
      supported: true,
      gameId: 'cs2',
      gameCategory: 'CS2',
      canonicalName: 'CS2',
    };
  }

  // League of Legends
  if (clean.includes('lol') || clean.includes('league') || clean.includes('legends')) {
    return {
      supported: true,
      gameId: 'lol',
      gameCategory: 'LEAGUE_OF_LEGENDS',
      canonicalName: 'League of Legends',
    };
  }

  return { supported: false, gameId: null, gameCategory: null, canonicalName: null };
}

export function normalizeGameId(rawId?: string | null): SupportedGameId {
  const norm = normalizeRankingGame(rawId);
  if (norm.supported && norm.gameId) return norm.gameId;
  return 'chess';
}

export function isSupportedCompetitiveGame(rawGame?: string | null): boolean {
  return normalizeRankingGame(rawGame).supported;
}

export function getGameConfig(gameId?: string | null): CompetitiveGameConfig {
  const norm = normalizeGameId(gameId);
  return COMPETITIVE_GAMES.find((g) => g.id === norm) || COMPETITIVE_GAMES[0];
}

export type RankTierId =
  | 'bronze'
  | 'silver'
  | 'gold'
  | 'platinum'
  | 'diamond'
  | 'master'
  | 'challenger';

export interface RankTier {
  id: RankTierId;
  name: 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM' | 'DIAMOND' | 'MASTER' | 'CHALLENGER';
  minMMR: number;
  maxMMR: number;
  minRating: number;
  maxRating: number;
  order: number;
  division: string;
  rangeDisplay: string;
  description: string;
  colorHex: string;
  textColorClass: string;
  borderColorClass: string;
  bgGlowClass: string;
  badgeBgClass: string;
  accentBg: string;
  tag: string;
  laserColor: string;
  icon?: string;
  gameCustomTitles?: Record<SupportedGameId, string>;
  gameCustomDescriptions?: Record<SupportedGameId, string>;
}

/**
 * The ONLY single source of truth for the entire Nexus Ranking System.
 * Order from lowest (1) to highest (7):
 * 1. BRONZE (0–999 MMR)
 * 2. SILVER (1000–1199 MMR)
 * 3. GOLD (1200–1399 MMR)
 * 4. PLATINUM (1400–1599 MMR)
 * 5. DIAMOND (1600–1799 MMR)
 * 6. MASTER (1800–1999 MMR)
 * 7. CHALLENGER (2000+ MMR)
 *
 * UNRANKED is a provisional status (under 10 matches completed), not an MMR rank.
 */
export const NEXUS_RANK_TIERS: RankTier[] = [
  {
    id: 'bronze',
    name: 'BRONZE',
    minMMR: 0,
    maxMMR: 999,
    minRating: 0,
    maxRating: 999,
    order: 1,
    division: 'TIER VII',
    rangeDisplay: '0–999 MMR',
    description: 'Building competitive mechanics, fundamentals, and arena experience.',
    colorHex: '#cd7f32',
    textColorClass: 'text-amber-500',
    borderColorClass: 'border-amber-600/40',
    bgGlowClass: 'from-amber-700/20 to-transparent',
    badgeBgClass: 'bg-amber-950/30',
    accentBg: 'bg-amber-600',
    tag: 'TIER VII',
    laserColor: '#d97706',
    icon: '🥉',
    gameCustomTitles: {
      chess: 'Chess Pawn • Bronze',
      fc: 'Bronze Division • FC',
      valorant: 'Iron/Bronze Radianite • Val',
      cs2: 'Silver I / Bronze Stencil • CS2',
      lol: 'Iron / Bronze Summoner • LoL',
    },
    gameCustomDescriptions: {
      chess: 'Mastering basic opening principles, pawn structures, and piece development.',
      fc: 'Honing ball control, short passing, and defensive positioning on the pitch (FC26 & FC27).',
      valorant: 'Establishing crosshair placement, site entry awareness, and basic ability usage.',
      cs2: 'Practicing counter-strafing, basic grenade line-ups, and spray control.',
      lol: 'Mastering last hitting, basic lane trading, and champion ability ranges.',
    },
  },
  {
    id: 'silver',
    name: 'SILVER',
    minMMR: 1000,
    maxMMR: 1199,
    minRating: 1000,
    maxRating: 1199,
    order: 2,
    division: 'TIER VI',
    rangeDisplay: '1000–1199 MMR',
    description: 'Solid tactical fundamentals, consistent game sense, and steady execution.',
    colorHex: '#94a3b8',
    textColorClass: 'text-slate-300',
    borderColorClass: 'border-slate-400/40',
    bgGlowClass: 'from-slate-500/20 to-transparent',
    badgeBgClass: 'bg-slate-800/40',
    accentBg: 'bg-slate-400',
    tag: 'TIER VI',
    laserColor: '#cbd5e1',
    icon: '🥈',
    gameCustomTitles: {
      chess: 'Knight Herald • Silver',
      fc: 'Silver League • FC',
      valorant: 'Silver Shard • Val',
      cs2: 'Gold Nova I / Silver Star • CS2',
      lol: 'Silver Combatant • LoL',
    },
    gameCustomDescriptions: {
      chess: 'Tactical knight outposts, fork tactics, and standard rook endgames.',
      fc: 'Clean skill moves, timed finishing, and tactical manual defending (FC26 & FC27).',
      valorant: 'Coordinated site executes, trade fragging, and eco round management.',
      cs2: 'Reliable flash utility, bomb-site retakes, and steady mid-range rifle duels.',
      lol: 'Wave management, dragon contest rotations, and map warding habits.',
    },
  },
  {
    id: 'gold',
    name: 'GOLD',
    minMMR: 1200,
    maxMMR: 1399,
    minRating: 1200,
    maxRating: 1399,
    order: 3,
    division: 'TIER V',
    rangeDisplay: '1200–1399 MMR',
    description: 'High-level precision, rapid adaptation, and upper-bracket tournament performance.',
    colorHex: '#eab308',
    textColorClass: 'text-yellow-400',
    borderColorClass: 'border-yellow-500/40',
    bgGlowClass: 'from-yellow-600/20 to-transparent',
    badgeBgClass: 'bg-yellow-500/10',
    accentBg: 'bg-yellow-500',
    tag: 'TIER V',
    laserColor: '#eab308',
    icon: '🥇',
    gameCustomTitles: {
      chess: 'Castle Fortress • Gold',
      fc: 'Gold Champions • FC',
      valorant: 'Gold Radianite Crest • Val',
      cs2: 'Master Guardian • CS2 Gold',
      lol: 'Gold Tactician • LoL',
    },
    gameCustomDescriptions: {
      chess: 'Kingside attacks, piece coordination, and deep multi-move tactical combinations.',
      fc: 'Clinical finishing, driven passes, and disciplined defensive shape (FC26 & FC27).',
      valorant: 'Sharp first-shot accuracy, decisive lurk timings, and clutch post-plant play.',
      cs2: 'Clean headshot tapping, synchronized execute utility, and clutch defusals.',
      lol: 'Objective cross-mapping, teamfight priority targeting, and roam timings.',
    },
  },
  {
    id: 'platinum',
    name: 'PLATINUM',
    minMMR: 1400,
    maxMMR: 1599,
    minRating: 1400,
    maxRating: 1599,
    order: 4,
    division: 'TIER IV',
    rangeDisplay: '1400–1599 MMR',
    description: 'Advanced competitive mastery with commanding arena control and high tempo execution.',
    colorHex: '#2dd4bf',
    textColorClass: 'text-teal-300',
    borderColorClass: 'border-teal-400/40',
    bgGlowClass: 'from-teal-600/20 to-transparent',
    badgeBgClass: 'bg-teal-950/40',
    accentBg: 'bg-teal-400',
    tag: 'TIER IV',
    laserColor: '#2dd4bf',
    icon: '💎',
    gameCustomTitles: {
      chess: "Queen's Vanguard • Platinum",
      fc: 'Elite Platinum Cup • FC',
      valorant: 'Platinum Apex Strike • Val',
      cs2: 'Distinguished Master • CS2 Plat',
      lol: 'Platinum Vanguard • LoL',
    },
    gameCustomDescriptions: {
      chess: 'Deep opening theory, proactive prophylactic defense, and precise rook & pawn endgames.',
      fc: 'Domination of possession, manual goalkeeper positioning, and ruthless counter-pressing (FC26 & FC27).',
      valorant: 'High-tempo map control, intelligent utility baiting, and aggressive entry fragging.',
      cs2: 'Advanced smoke lineups, pop-flashes, and high impact entry frags on bombsite anchors.',
      lol: 'Tempo resets, Baron setup baits, and deep jungle vision control.',
    },
  },
  {
    id: 'diamond',
    name: 'DIAMOND',
    minMMR: 1600,
    maxMMR: 1799,
    minRating: 1600,
    maxRating: 1799,
    order: 5,
    division: 'TIER III',
    rangeDisplay: '1600–1799 MMR',
    description: 'Elite competitive prowess, razor-sharp mechanical accuracy, and clutch decision making.',
    colorHex: '#38bdf8',
    textColorClass: 'text-sky-400',
    borderColorClass: 'border-sky-400/40',
    bgGlowClass: 'from-sky-600/25 to-transparent',
    badgeBgClass: 'bg-sky-950/40',
    accentBg: 'bg-sky-400',
    tag: 'TIER III',
    laserColor: '#38bdf8',
    icon: '💠',
    gameCustomTitles: {
      chess: 'Grandmaster Crown • Diamond',
      fc: 'Diamond Premier • FC',
      valorant: 'Ascendant Diamond • Val',
      cs2: 'Legendary Eagle • CS2 Diamond',
      lol: 'Diamond Strategist • LoL',
    },
    gameCustomDescriptions: {
      chess: 'Master-level positional play, ruthless conversion of small imbalances, and blitz endgame speed.',
      fc: 'Zero-mistake tournament play, pinpoint set-piece routines, and flawless tactical awareness (FC26 & FC27).',
      valorant: 'Elite mechanical aim, flawless micro-positioning, and instant adaptation to opponent habits.',
      cs2: 'Surgical sub-tick aim, flawless utility timing, and dominant team-captain calling.',
      lol: 'Split-push pressure, flank teleport angles, and micro mechanical skirmish dominance.',
    },
  },
  {
    id: 'master',
    name: 'MASTER',
    minMMR: 1800,
    maxMMR: 1999,
    minRating: 1800,
    maxRating: 1999,
    order: 6,
    division: 'TIER II',
    rangeDisplay: '1800–1999 MMR',
    description: 'Supreme mastery. Among the top 1% highest skilled competitors in the center.',
    colorHex: '#c084fc',
    textColorClass: 'text-purple-400',
    borderColorClass: 'border-purple-500/40',
    bgGlowClass: 'from-purple-600/25 to-transparent',
    badgeBgClass: 'bg-purple-950/40',
    accentBg: 'bg-gradient-to-r from-purple-500 to-indigo-500',
    tag: 'TIER II',
    laserColor: '#c084fc',
    icon: '👑',
    gameCustomTitles: {
      chess: 'International Master • Chess',
      fc: 'Grand Champions Trophy • FC',
      valorant: 'Immortal Crest • Val',
      cs2: 'Supreme First Class • CS2 Master',
      lol: 'Master Sovereign • LoL',
    },
    gameCustomDescriptions: {
      chess: 'Near-engine calculation, profound strategic sacrifices, and mastery across all classical time controls.',
      fc: 'Professional esports tier play with impenetrable defensive blocks and lethal transition strikes (FC26 & FC27).',
      valorant: 'Top-tier esports execution, lethal clutch percentage, and dominant radiant-level game sense.',
      cs2: 'World-class AWPer and rifler precision, impenetrable anchor holds, and flawless site executes.',
      lol: 'Grandmaster macro pacing, flawless teamfight peel and dive execution, and clutch shotcalling.',
    },
  },
  {
    id: 'challenger',
    name: 'CHALLENGER',
    minMMR: 2000,
    maxMMR: 99999,
    minRating: 2000,
    maxRating: 99999,
    order: 7,
    division: 'PINNACLE',
    rangeDisplay: '2000+ MMR',
    description: 'The pinnacle of competitive achievement. The rarest and highest honor in Nexus Gaming Center.',
    colorHex: '#f59e0b',
    textColorClass: 'text-amber-300',
    borderColorClass: 'border-amber-400/70',
    bgGlowClass: 'from-amber-500/35 via-yellow-400/25 to-transparent',
    badgeBgClass: 'bg-amber-500/20',
    accentBg: 'bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500',
    tag: 'PINNACLE',
    laserColor: '#fbbf24',
    icon: '⚡',
    gameCustomTitles: {
      chess: 'Apex Grandmaster • Chess',
      fc: 'World Champion Ballon • FC',
      valorant: 'Radiant Apex Champion • Val',
      cs2: 'The Global Elite Major • CS2',
      lol: 'Challenger Apex Legend • LoL',
    },
    gameCustomDescriptions: {
      chess: 'The undisputed supreme monarch of the 64 squares in Nexus Gaming Center.',
      fc: 'The apex champion of the virtual pitch. The undisputed sovereign of 1v1 football tournament standard (FC26 & FC27).',
      valorant: 'The Radiant pinnacle. Unmatched aim, flawless game sense, and supreme 5v5 clutch mastery.',
      cs2: 'The Global Elite. The absolute apex tactical FPS competitor in the entire facility.',
      lol: 'The Challenger sovereign. Undisputed apex MOBA champion in Nexus Gaming Center.',
    },
  },
];

// Alias for backward compatibility
export const NEXUS_RANKING_LEVELS = NEXUS_RANK_TIERS;
export type NexusRankingLevel = RankTier;

/**
 * Central function to resolve the official rank tier from any MMR value.
 */
export function getRankFromMMR(mmr: number = 1000): RankTier {
  const rating = typeof mmr === 'number' && Number.isFinite(mmr) ? mmr : 1000;
  if (rating < 1000) return NEXUS_RANK_TIERS[0]; // BRONZE
  if (rating < 1200) return NEXUS_RANK_TIERS[1]; // SILVER
  if (rating < 1400) return NEXUS_RANK_TIERS[2]; // GOLD
  if (rating < 1600) return NEXUS_RANK_TIERS[3]; // PLATINUM
  if (rating < 1800) return NEXUS_RANK_TIERS[4]; // DIAMOND
  if (rating < 2000) return NEXUS_RANK_TIERS[5]; // MASTER
  return NEXUS_RANK_TIERS[6]; // CHALLENGER
}

export const getRankTierForRating = getRankFromMMR;
export const getNexusRankingLevel = getRankFromMMR;

export interface DisplayRankTier extends RankTier {
  isUnranked: boolean;
  placementText?: string;
}

export const UNRANKED_RANK_TIER: DisplayRankTier = {
  id: 'bronze',
  name: 'BRONZE',
  minMMR: 0,
  maxMMR: 0,
  minRating: 0,
  maxRating: 0,
  order: 0,
  division: 'UNRANKED',
  rangeDisplay: '10 Placement Matches Required',
  description: 'Currently in 10-match placement calibration phase for this specific game title.',
  colorHex: '#94a3b8',
  textColorClass: 'text-yellow-400',
  borderColorClass: 'border-yellow-500/40',
  bgGlowClass: 'from-yellow-500/20 to-transparent',
  badgeBgClass: 'bg-yellow-500/10',
  accentBg: 'bg-yellow-500',
  tag: 'PROVISIONAL',
  laserColor: '#eab308',
  isUnranked: true,
  icon: '⏳',
};

export function getPlayerDisplayTier(
  rating: number = 1000,
  isProvisional?: boolean,
  placementGames: number = 0,
  gamesPlayed: number = 0
): DisplayRankTier {
  const confirmedMatches = Math.max(placementGames || 0, gamesPlayed || 0);
  const isUnranked = confirmedMatches >= 10 ? false : (isProvisional !== undefined ? isProvisional && confirmedMatches < 10 : confirmedMatches < 10);

  if (isUnranked) {
    return {
      ...UNRANKED_RANK_TIER,
      placementText: `${confirmedMatches}/10 Matches`,
    };
  }
  const tier = getRankFromMMR(rating);
  return {
    ...tier,
    isUnranked: false,
  };
}

export function getRankProgress(rating: number = 1000): {
  currentTier: RankTier;
  nextTier: RankTier | null;
  currentLevel: RankTier;
  nextLevel: RankTier | null;
  progressPercent: number;
  pointsToNext: number;
} {
  const currentTier = getRankFromMMR(rating);
  const currentIndex = NEXUS_RANK_TIERS.findIndex((t) => t.id === currentTier.id);
  const nextTier = currentIndex < NEXUS_RANK_TIERS.length - 1 ? NEXUS_RANK_TIERS[currentIndex + 1] : null;

  if (!nextTier) {
    return {
      currentTier,
      nextTier: null,
      currentLevel: currentTier,
      nextLevel: null,
      progressPercent: 100,
      pointsToNext: 0,
    };
  }

  const range = nextTier.minMMR - currentTier.minMMR;
  const currentInTier = Math.max(0, rating - currentTier.minMMR);
  const progressPercent = Math.min(100, Math.max(0, Math.round((currentInTier / range) * 100)));
  const pointsToNext = Math.max(0, nextTier.minMMR - rating);

  return {
    currentTier,
    nextTier,
    currentLevel: currentTier,
    nextLevel: nextTier,
    progressPercent,
    pointsToNext,
  };
}

export const getNexusLevelProgress = getRankProgress;

