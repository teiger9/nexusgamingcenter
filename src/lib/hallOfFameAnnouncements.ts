import { Season, HallOfFameEntry, HallOfFameAnnouncement } from '../types';
import { COMPETITIVE_GAMES, CompetitiveGameConfig, normalizeRankingGame } from './ranks';

export interface AuthoritativeAnnouncement {
  id: string;
  seasonId: string;
  seasonNumber: number;
  seasonName: string;
  gameId: string;
  gameName: string; // Strictly "Chess", "FC", "Valorant", "CS2", "League of Legends"
  gameIcon: string;
  gameCategory: string; // Strictly "CHESS", "FC", "VALORANT", "CS2", "LEAGUE_OF_LEGENDS"
  championId: string;
  championName: string;
  teamTag?: string;
  finalMMR: number;
  wins?: number;
  losses?: number;
  draws?: number;
  gamesPlayed?: number;
  winRate?: number;
  matchFormat: '1v1' | '5v5';
  winnerType: 'PLAYER' | 'TEAM';
  badgeText: string;
  title: string; // "🏆 OFFICIAL HALL OF FAME"
  seasonGameLabel: string; // e.g. "Season 4 — FC"
  declarationText: string; // "Officially declared by Nexus Gaming Center."
  createdAt: number;
}

export interface SeasonAnnouncementNotice {
  show: boolean;
  title: string;
  headline: string;
  subheadline: string;
  seasonName: string;
  seasonNumber: number;
  status: 'ACTIVE' | 'ENDED';
}

export interface ResolvedAnnouncementFeed {
  activeNotice: SeasonAnnouncementNotice | null;
  endedUnfinalizedNotice: SeasonAnnouncementNotice | null;
  announcements: AuthoritativeAnnouncement[];
}

const UNWANTED_GAMES = [
  'tekken',
  'rocket league',
  'rocketleague',
  'rocket-league',
  'mortal kombat',
  'mortalkombat',
  'mortal-kombat',
  'mk1',
  'fortnite',
  'call of duty',
  'callofduty',
  'call-of-duty',
  'cod',
];

/**
 * Validates whether a Hall of Fame entry is an authoritative, legitimate champion record.
 * Rejects missing championId, invalid/dummy accounts, removed games, and non-canonical categories.
 */
export function isAuthoritativeHofRecord(
  entry: HallOfFameEntry | null | undefined
): boolean {
  if (!entry) return false;

  // 1. Must be marked OFFICIAL (or valid official record)
  if (entry.status && entry.status !== 'OFFICIAL') return false;

  // 2. Must have a valid, non-empty championId / playerId / winnerId
  const champId = (entry.championId || entry.playerId || entry.winnerId || entry.teamId || '').trim();
  if (!champId || champId === 'undefined' || champId === 'null') return false;

  // 3. Must have a valid championName / gamerTag / teamName
  const champName = (entry.championName || entry.gamerTag || entry.teamName || '').trim();
  if (!champName) return false;

  // 4. Reject invalid / deleted / fallback / seed / demo champion IDs or names
  const champIdLower = champId.toLowerCase();
  const champNameLower = champName.toLowerCase();
  if (
    champIdLower === 'deleted' ||
    champIdLower === '[deleted]' ||
    champIdLower.includes('_seed') ||
    champIdLower.startsWith('demo_') ||
    champIdLower.startsWith('test_') ||
    champIdLower.startsWith('fallback_') ||
    champIdLower.startsWith('placeholder_') ||
    champNameLower.includes('fallback') ||
    champNameLower.includes('placeholder') ||
    champNameLower.includes('test account') ||
    champNameLower === 'deleted' ||
    champNameLower === 'deleteduser'
  ) {
    return false;
  }

  // 5. Reject FC EA completely (Requirement 1, 7, 8: FC EA record -> Not displayed)
  const rawGame = (entry.gameName || entry.game || entry.gameId || '').toLowerCase().trim();
  const rawCategory = (entry.gameCategory || '').toLowerCase().trim();
  if (
    rawGame.includes('fc ea') ||
    rawGame.includes('ea fc') ||
    rawGame === 'ea-fc' ||
    rawGame === 'fc-ea' ||
    rawGame === 'fcea' ||
    rawGame === 'eafc' ||
    rawCategory.includes('fc ea') ||
    rawCategory.includes('ea fc')
  ) {
    return false;
  }

  // 6. Reject removed games
  if (UNWANTED_GAMES.some((u) => rawGame.includes(u))) return false;

  // 7. Must normalize to one of the 5 canonical games
  const norm = normalizeRankingGame(entry.gameId || entry.gameName || entry.game);
  if (!norm.supported || !norm.gameId) return false;

  return true;
}

/**
 * Finds the authoritative Hall of Fame record for a specific season and game.
 * Unifies FC into the single authoritative FC category.
 * Strictly excludes FC EA.
 * Returns null if no official record exists.
 */
export function findAuthoritativeHofRecord(
  hofEntries: HallOfFameEntry[],
  seasonId: string,
  game: CompetitiveGameConfig
): HallOfFameEntry | null {
  if (!hofEntries || !seasonId || !game) return null;

  const matching = hofEntries.filter((e) => {
    if (!e || e.seasonId !== seasonId) return false;
    if (!isAuthoritativeHofRecord(e)) return false;

    // Explicitly reject any FC EA / EA FC record
    const rawG = (e.gameName || e.game || e.gameId || '').toLowerCase().trim();
    const rawC = (e.gameCategory || '').toLowerCase().trim();
    if (
      rawG.includes('fc ea') ||
      rawG.includes('ea fc') ||
      rawG === 'ea-fc' ||
      rawG === 'fc-ea' ||
      rawG === 'fcea' ||
      rawG === 'eafc' ||
      rawC.includes('fc ea') ||
      rawC.includes('ea fc')
    ) {
      return false;
    }

    const norm = normalizeRankingGame(e.gameId || e.gameName || e.game);
    if (!norm.supported) return false;

    // FC is strictly one unified game
    if (game.id === 'fc') {
      return norm.gameId === 'fc' || e.gameCategory === 'FC';
    }

    return norm.gameId === game.id || e.gameCategory === game.category;
  });

  if (matching.length === 0) return null;

  // If multiple matching records (e.g. legacy FC26 and FC27), pick the one with highest rating / wins
  matching.sort((a, b) => {
    const mmrA = a.finalMMR || (a as any).rating || 0;
    const mmrB = b.finalMMR || (b as any).rating || 0;
    if (mmrB !== mmrA) return mmrB - mmrA;
    return (b.wins || 0) - (a.wins || 0);
  });

  return matching[0];
}

/**
 * Single source of truth for the Official Hall of Fame Announcements feed.
 * Enforces:
 * - Active Season -> "The season is still active. No champion has been declared yet." (0 winner names)
 * - Ended Season (Unfinalized) -> "Season ended. Official champions have not been declared yet." (0 winner names)
 * - Finalized Season -> Announces champion ONLY when an authoritative Hall of Fame record exists.
 * - No Record -> NO announcement (never invent or substitute winners).
 * - FC is unified: no FC EA, FC 26, or FC 27 separate categories.
 */
export function resolveAuthoritativeAnnouncementFeed(params: {
  seasons: Season[];
  hofEntries: HallOfFameEntry[];
  storedAnnouncements?: HallOfFameAnnouncement[];
  seasonFilter?: string;
}): ResolvedAnnouncementFeed {
  const { seasons, hofEntries, seasonFilter = 'ALL' } = params;

  // 1. Identify active season and ended-unfinalized season
  const activeSeason = seasons.find((s) => s.status === 'ACTIVE');
  const now = Date.now();
  const endedUnfinalizedSeason = seasons.find(
    (s) =>
      s.status === 'ENDED' ||
      (s.endDate <= now && s.status !== 'FINALIZED' && s.status !== 'COMPLETED' && s.status !== 'ACTIVE')
  );

  let activeNotice: SeasonAnnouncementNotice | null = null;
  if (activeSeason && (seasonFilter === 'ALL' || seasonFilter === activeSeason.id)) {
    activeNotice = {
      show: true,
      title: '🏆 OFFICIAL HALL OF FAME',
      headline: 'The season is still active.',
      subheadline: 'No champion has been declared yet.',
      seasonName: activeSeason.name,
      seasonNumber: activeSeason.number || 1,
      status: 'ACTIVE',
    };
  }

  let endedUnfinalizedNotice: SeasonAnnouncementNotice | null = null;
  if (endedUnfinalizedSeason && (seasonFilter === 'ALL' || seasonFilter === endedUnfinalizedSeason.id)) {
    endedUnfinalizedNotice = {
      show: true,
      title: '🏆 OFFICIAL HALL OF FAME',
      headline: 'Season ended.',
      subheadline: 'Official champions have not been declared yet.',
      seasonName: endedUnfinalizedSeason.name,
      seasonNumber: endedUnfinalizedSeason.number || 1,
      status: 'ENDED',
    };
  }

  // 2. Collect announcements for finalized seasons
  const finalizedSeasons = seasons
    .filter((s) => s.status === 'FINALIZED' || s.status === 'COMPLETED')
    .filter((s) => seasonFilter === 'ALL' || s.id === seasonFilter)
    .sort((a, b) => (b.number || 0) - (a.number || 0));

  const announcements: AuthoritativeAnnouncement[] = [];

  for (const season of finalizedSeasons) {
    for (const game of COMPETITIVE_GAMES) {
      // Rule: Check if authoritative official record exists in /hallOfFame
      const officialRecord = findAuthoritativeHofRecord(hofEntries, season.id, game);

      // Rule: NO RECORD = NO ANNOUNCEMENT. Never fabricate a winner.
      if (!officialRecord) {
        continue;
      }

      const champId = (
        officialRecord.championId ||
        officialRecord.playerId ||
        officialRecord.winnerId ||
        officialRecord.teamId ||
        ''
      ).trim();

      const champName = (
        officialRecord.championName ||
        officialRecord.gamerTag ||
        officialRecord.teamName ||
        ''
      ).trim();

      if (!champId || !champName) {
        // Missing championId or championName -> No announcement
        continue;
      }

      const isTeam = officialRecord.winnerType === 'TEAM' || game.matchFormat === '5v5';
      const mmr = officialRecord.finalMMR || (officialRecord as any).rating || 1000;

      announcements.push({
        id: `ann_${season.id}_${game.id}`,
        seasonId: season.id,
        seasonNumber: season.number || 1,
        seasonName: season.name,
        gameId: game.id,
        gameName: game.name, // Strictly canonical: "Chess", "FC", "Valorant", "CS2", "League of Legends"
        gameIcon: game.icon,
        gameCategory: game.category,
        championId: champId,
        championName: champName,
        teamTag: officialRecord.teamTag,
        finalMMR: mmr,
        wins: officialRecord.wins,
        losses: officialRecord.losses,
        draws: officialRecord.draws,
        gamesPlayed: officialRecord.gamesPlayed,
        winRate: officialRecord.winRate,
        matchFormat: isTeam ? '5v5' : '1v1',
        winnerType: isTeam ? 'TEAM' : 'PLAYER',
        badgeText: isTeam ? `#1 Team — ${mmr.toLocaleString()} MMR` : `#1 Player — ${mmr.toLocaleString()} MMR`,
        title: '🏆 OFFICIAL HALL OF FAME',
        seasonGameLabel: `${season.name} — ${game.name}`,
        declarationText: 'Officially declared by Nexus Gaming Center.',
        createdAt: officialRecord.crownedAt || officialRecord.selectedAt || season.endDate || Date.now(),
      });
    }
  }

  return {
    activeNotice,
    endedUnfinalizedNotice,
    announcements,
  };
}
