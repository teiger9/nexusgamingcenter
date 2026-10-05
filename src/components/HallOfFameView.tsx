import React, { useState, useEffect } from 'react';
import { HallOfFameEntry, HallOfFameAnnouncement, Season, GameCategory } from '../types';
import {
  subscribeToHallOfFame,
  subscribeToHallOfFameAnnouncements,
  fetchAllSeasons,
  checkAndProcessExpiredSeason,
} from '../services/seasonService';
import { COMPETITIVE_GAMES, normalizeRankingGame } from '../lib/ranks';
import { resolveAuthoritativeAnnouncementFeed } from '../lib/hallOfFameAnnouncements';
import {
  Crown,
  Trophy,
  ChevronRight,
  Layers,
  Ban,
  Calendar,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';

interface HallOfFameViewProps {
  onSelectPlayer?: (playerId: string) => void;
  onSelectPlayerProfile?: (playerId: string) => void;
  onSelectTeamProfile?: (teamId: string) => void;
  onNavigateToLeaderboard?: () => void;
  onNavigateToActiveSeason?: () => void;
}

export const HallOfFameView: React.FC<HallOfFameViewProps> = ({
  onSelectPlayer,
  onSelectPlayerProfile,
  onSelectTeamProfile,
  onNavigateToLeaderboard,
  onNavigateToActiveSeason,
}) => {
  const [entries, setEntries] = useState<HallOfFameEntry[]>([]);
  const [announcements, setAnnouncements] = useState<HallOfFameAnnouncement[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSeasonFilter, setSelectedSeasonFilter] = useState<string>('ALL');
  const [selectedGameFilter, setSelectedGameFilter] = useState<string>('ALL');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<'ALL' | GameCategory>('ALL');
  const [activeTab, setActiveTab] = useState<'ANNOUNCEMENTS' | 'HISTORY' | 'GALLERY'>('ANNOUNCEMENTS');

  const handleSelectParticipant = (entry: HallOfFameEntry) => {
    if (entry.winnerType === 'TEAM' || entry.matchFormat === '5v5') {
      if (entry.teamId && onSelectTeamProfile) {
        onSelectTeamProfile(entry.teamId);
        return;
      }
    }
    const playerId = entry.championId || entry.playerId || entry.winnerId;
    if (playerId) {
      if (onSelectPlayerProfile) {
        onSelectPlayerProfile(playerId);
      } else if (onSelectPlayer) {
        onSelectPlayer(playerId);
      }
    }
  };

  useEffect(() => {
    // 1. Check for expired season state transition
    checkAndProcessExpiredSeason()
      .then(() => fetchAllSeasons().then(setSeasons))
      .catch(() => {});

    // 2. Real-time Hall of Fame subscription (Only official records)
    const unsubHof = subscribeToHallOfFame((hofData) => {
      // Rule 5: Only keep authoritative records with status === 'OFFICIAL'
      const officialOnly = (hofData || []).filter(
        (e) => e && e.status === 'OFFICIAL' && Boolean(e.championId || e.playerId || e.teamId)
      );
      setEntries(officialOnly);
      setLoading(false);
      fetchAllSeasons().then(setSeasons).catch(() => {});
    });

    // 3. Real-time Hall of Fame announcements subscription
    const unsubAnnounce = subscribeToHallOfFameAnnouncements((annData) => {
      setAnnouncements(annData || []);
    });

    return () => {
      unsubHof();
      unsubAnnounce();
    };
  }, []);

  // Filter entries
  const filteredEntries = entries.filter((entry) => {
    if (selectedSeasonFilter !== 'ALL' && entry.seasonId !== selectedSeasonFilter) {
      return false;
    }
    if (selectedGameFilter !== 'ALL') {
      const entryGame = (entry.gameId || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const filterGame = selectedGameFilter.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (entryGame !== filterGame && !entry.gameName.toLowerCase().includes(selectedGameFilter.toLowerCase())) {
        return false;
      }
    }
    if (selectedCategoryFilter !== 'ALL' && entry.gameCategory !== selectedCategoryFilter) {
      return false;
    }
    return true;
  });

  // Filter for all seasons (including active to show status, with finalized displaying permanent records)
  const allSeasonsList = [...seasons].sort((a, b) => (b.number || 0) - (a.number || 0));

  // Group official entries by seasonId
  const seasonGroups = new Map<string, { seasonName: string; seasonNumber: number; year: number; status: string; entries: HallOfFameEntry[] }>();
  
  // Initialize season groups from all seasons
  allSeasonsList.forEach((s) => {
    seasonGroups.set(s.id, {
      seasonName: s.name,
      seasonNumber: s.number || 1,
      year: s.year || new Date(s.startDate).getFullYear(),
      status: s.status,
      entries: [],
    });
  });

  filteredEntries.forEach((entry) => {
    // Only accept canonical games: chess, fc, valorant, cs2, lol
    const norm = normalizeRankingGame(entry.gameId || entry.gameName);
    if (!norm.supported) return;

    const key = entry.seasonId;
    const existing = seasonGroups.get(key);
    if (existing) {
      if (!existing.entries.some((e) => e.id === entry.id)) {
        existing.entries.push(entry);
      }
    } else {
      seasonGroups.set(key, {
        seasonName: entry.seasonName,
        seasonNumber: entry.seasonNumber || 1,
        year: entry.year,
        status: 'COMPLETED',
        entries: [entry],
      });
    }
  });

  // Sort descending by season number (Season 4, Season 3, Season 2, Season 1)
  const displayGroups = Array.from(seasonGroups.entries()).sort(
    ([, a], [, b]) => b.seasonNumber - a.seasonNumber
  );

  // Single source of truth for Hall of Fame Announcements:
  // - Active season -> "The season is still active. No champion has been declared yet." (0 winner names)
  // - Ended but not finalized -> "Season ended. Official champions have not been declared yet." (0 winner names)
  // - Finalized season -> Announced ONLY when an authoritative Hall of Fame record exists.
  // - No record = No announcement. Never invent winners.
  // - FC is strictly unified (no FC EA, FC 26, FC 27).
  const announcementFeed = resolveAuthoritativeAnnouncementFeed({
    seasons,
    hofEntries: entries,
    storedAnnouncements: announcements,
    seasonFilter: selectedSeasonFilter,
  });

  return (
    <div id="nexus-hall-of-fame" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-[#08080a] border border-amber-500/30 p-6 sm:p-8 shadow-[0_10px_35px_rgba(245,158,11,0.1)]">
        <div className="absolute -top-24 -right-24 w-88 h-88 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-88 h-88 bg-red-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-mono font-bold tracking-wide">
              <Crown className="w-4 h-4 text-amber-400" />
              <span>THE IMMORTAL ROSTER</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-black font-display tracking-tight text-white flex items-center gap-3">
              <span>👑 NEXUS HALL OF FAME</span>
            </h1>
            <p className="text-sm text-zinc-300 leading-relaxed">
              Permanent history of verified champions across all competitive ranked games. A player or team is inducted strictly after official administrator finalization. No predictions, no active leader assumptions, and no placeholder accounts.
            </p>
          </div>

          {/* Quick Metrics */}
          <div className="grid grid-cols-2 gap-3 w-full lg:w-auto min-w-[260px]">
            <div className="p-4 rounded-2xl bg-[#0f0f13] border border-amber-500/20 text-center">
              <div className="text-[10px] text-zinc-400 font-mono uppercase tracking-wider">Official Champions</div>
              <div className="text-2xl font-black font-display text-amber-400 font-mono-numbers mt-0.5">
                {entries.length}
              </div>
            </div>
            <div className="p-4 rounded-2xl bg-[#0f0f13] border border-zinc-800 text-center">
              <div className="text-[10px] text-zinc-400 font-mono uppercase tracking-wider">Finalized Eras</div>
              <div className="text-2xl font-black font-display text-white font-mono-numbers mt-0.5">
                {seasons.filter((s) => s.status !== 'ACTIVE').length}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* View Switcher: Announcements vs Permanent History vs Gallery */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800/80 pb-3">
        <div className="flex items-center gap-1.5 bg-[#0f0f13] p-1 rounded-2xl border border-zinc-800">
          <button
            onClick={() => setActiveTab('ANNOUNCEMENTS')}
            className={`px-4 py-2 rounded-xl text-xs font-mono font-bold uppercase transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'ANNOUNCEMENTS'
                ? 'bg-amber-400 text-black font-black shadow-md'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Trophy className="w-3.5 h-3.5" />
            <span>Official Announcements</span>
          </button>
          <button
            onClick={() => setActiveTab('HISTORY')}
            className={`px-4 py-2 rounded-xl text-xs font-mono font-bold uppercase transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'HISTORY'
                ? 'bg-amber-400 text-black font-black shadow-md'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Permanent History</span>
          </button>
          <button
            onClick={() => setActiveTab('GALLERY')}
            className={`px-4 py-2 rounded-xl text-xs font-mono font-bold uppercase transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'GALLERY'
                ? 'bg-amber-400 text-black font-black shadow-md'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Crown className="w-3.5 h-3.5" />
            <span>Champion Cards</span>
          </button>
        </div>

        {/* Live Leaderboard Link */}
        {onNavigateToActiveSeason && (
          <button
            onClick={onNavigateToActiveSeason}
            className="px-4 py-2 rounded-xl bg-[#121216] hover:bg-[#181820] text-amber-400 border border-amber-500/30 font-bold text-xs font-mono uppercase transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <span>Live Ladder Standings</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* ========================================================================= */}
      {/* SECTION 1: OFFICIAL HALL OF FAME ANNOUNCEMENTS */}
      {/* ========================================================================= */}
      {activeTab === 'ANNOUNCEMENTS' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <Trophy className="w-4 h-4" />
              </div>
              <h2 className="text-xl font-black font-display text-white uppercase tracking-tight">
                Official Hall of Fame Announcements
              </h2>
            </div>
            <span className="text-xs font-mono text-zinc-500">
              Only Published Upon Official Finalization
            </span>
          </div>

          {/* 1. Active Season Status Notice (Requirement 3: Zero winner names displayed) */}
          {announcementFeed.activeNotice && (
            <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-b from-[#14141c] via-[#0d0d12] to-[#08080a] border border-emerald-500/30 shadow-[0_8px_30px_rgba(16,185,129,0.08)] relative overflow-hidden space-y-3">
              <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
                <div className="flex items-center gap-2 text-amber-400 font-display font-black text-sm uppercase tracking-wide">
                  <Crown className="w-5 h-5 text-amber-400" />
                  <span>🏆 OFFICIAL HALL OF FAME</span>
                </div>
                <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-emerald-950/60 border border-emerald-500/40 text-emerald-400 font-bold uppercase">
                  {announcementFeed.activeNotice.seasonName} Active
                </span>
              </div>
              <div className="space-y-1.5 pt-1">
                <h3 className="text-xl sm:text-2xl font-black font-display text-white tracking-tight">
                  {announcementFeed.activeNotice.headline}
                </h3>
                <p className="text-sm font-mono text-zinc-400">
                  {announcementFeed.activeNotice.subheadline}
                </p>
              </div>
              <div className="pt-2 text-[11px] font-mono text-zinc-500 border-t border-zinc-800/60">
                Current ladder leaders are provisional until official administrator season finalization.
              </div>
            </div>
          )}

          {/* 2. Ended Season But Not Finalized Notice (Requirement 4: Zero winner names displayed) */}
          {announcementFeed.endedUnfinalizedNotice && (
            <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-b from-[#14141c] via-[#0d0d12] to-[#08080a] border border-amber-500/40 shadow-[0_8px_30px_rgba(245,158,11,0.1)] relative overflow-hidden space-y-3">
              <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
                <div className="flex items-center gap-2 text-amber-400 font-display font-black text-sm uppercase tracking-wide">
                  <Crown className="w-5 h-5 text-amber-400" />
                  <span>🏆 OFFICIAL HALL OF FAME</span>
                </div>
                <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-amber-950/60 border border-amber-500/40 text-amber-400 font-bold uppercase">
                  {announcementFeed.endedUnfinalizedNotice.seasonName} Ended
                </span>
              </div>
              <div className="space-y-1.5 pt-1">
                <h3 className="text-xl sm:text-2xl font-black font-display text-amber-300 tracking-tight">
                  {announcementFeed.endedUnfinalizedNotice.headline}
                </h3>
                <p className="text-sm font-mono text-zinc-300">
                  {announcementFeed.endedUnfinalizedNotice.subheadline}
                </p>
              </div>
              <div className="pt-2 text-[11px] font-mono text-zinc-500 border-t border-zinc-800/60">
                Match clock has expired. Official champions will be announced once an authorized administrator finalizes the season.
              </div>
            </div>
          )}

          {/* 3. Authoritative Finalized Season Announcements (Requirements 1, 2, 5, 6) */}
          {announcementFeed.announcements.length === 0 && !announcementFeed.activeNotice && !announcementFeed.endedUnfinalizedNotice ? (
            <div className="p-8 sm:p-12 rounded-3xl bg-[#08080a] border border-zinc-800 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 mx-auto flex items-center justify-center text-zinc-500">
                <Trophy className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white font-display">
                No Official Announcements Published Yet
              </h3>
              <p className="text-xs text-zinc-400 max-w-md mx-auto leading-relaxed">
                Hall of Fame announcements are generated strictly upon authorized administrator season finalization.
              </p>
            </div>
          ) : (
            announcementFeed.announcements.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {announcementFeed.announcements.map((ann) => (
                  <div
                    key={ann.id}
                    onClick={() => {
                      if (onSelectPlayerProfile) {
                        onSelectPlayerProfile(ann.championId);
                      } else if (onSelectPlayer) {
                        onSelectPlayer(ann.championId);
                      }
                    }}
                    className="p-6 rounded-3xl bg-gradient-to-b from-[#14141c] via-[#0d0d12] to-[#08080a] border border-amber-500/40 shadow-[0_8px_30px_rgba(245,158,11,0.12)] relative overflow-hidden flex flex-col justify-between space-y-4 hover:border-amber-400 transition-all group cursor-pointer"
                  >
                    <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl pointer-events-none group-hover:bg-amber-500/20 transition-all" />

                    <div className="space-y-3 relative z-10">
                      {/* Header */}
                      <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2.5">
                        <div className="flex items-center gap-1.5 text-xs font-mono font-black text-amber-400 uppercase tracking-wider">
                          <Crown className="w-4 h-4 text-amber-400" />
                          <span>{ann.title}</span>
                        </div>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-900 border border-zinc-700 text-zinc-300 font-mono font-bold">
                          {ann.matchFormat === '5v5' ? '5v5 SQUAD' : '1v1'}
                        </span>
                      </div>

                      {/* Season — Game */}
                      <div className="text-sm font-mono font-black tracking-wide text-zinc-200 uppercase flex items-center gap-2">
                        <span className="text-base">{ann.gameIcon || '🎮'}</span>
                        <span>{ann.seasonGameLabel}</span>
                      </div>

                      {/* Champion Block */}
                      <div className="space-y-1.5 pt-1 bg-black/40 p-4 rounded-2xl border border-amber-500/20">
                        <div className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider font-bold">
                          Champion:
                        </div>
                        <div className="text-2xl font-black font-display text-white tracking-tight group-hover:text-amber-300 transition-colors flex items-center gap-2">
                          <Crown className="w-6 h-6 text-amber-400 shrink-0" />
                          <span className="truncate">{ann.championName}</span>
                          {ann.teamTag && (
                            <span className="text-xs font-mono text-zinc-400">[{ann.teamTag}]</span>
                          )}
                        </div>
                        <div className="text-xs font-mono text-amber-400/90 font-bold pt-1">
                          {ann.badgeText}
                          {ann.wins !== undefined ? ` • ${ann.wins}W - ${ann.losses || 0}L` : ''}
                        </div>
                      </div>

                      {/* Declaration footer */}
                      <p className="text-xs text-zinc-400 italic font-mono pt-1">
                        {ann.declarationText}
                      </p>
                    </div>

                    <div className="pt-3 border-t border-zinc-800/80 flex items-center justify-between text-[11px] font-mono text-zinc-500">
                      <span>Verified Hall of Fame Roster</span>
                      <span className="text-amber-400 font-bold flex items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                        <span>Official</span>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 2: PERMANENT HALL OF FAME HISTORY (BY SEASON) */}
      {/* Rule 4 & 13: Strictly 5 canonical games. If no champion -> "No champion declared" */}
      {/* If active -> "Season is still active. No champion has been declared." */}
      {/* ========================================================================= */}
      {activeTab === 'HISTORY' && (
        <div className="space-y-8">
          <div className="p-6 rounded-3xl bg-[#08080a] border border-amber-500/30 space-y-2">
            <h2 className="text-xl font-black font-display text-white uppercase tracking-tight flex items-center gap-2">
              <span>🏆 HALL OF FAME</span>
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Official roster of champions for <strong>Chess, FC, Valorant, CS2, and League of Legends</strong>. If a season is active, no champion is declared until official administrator finalization.
            </p>
          </div>

          {displayGroups.length === 0 ? (
            <div className="p-8 sm:p-12 rounded-3xl bg-[#08080a] border border-zinc-800 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 mx-auto flex items-center justify-center text-zinc-500">
                <Layers className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white font-display">
                No Seasons Recorded Yet
              </h3>
              <p className="text-xs text-zinc-400 max-w-md mx-auto leading-relaxed">
                Competitive seasons and Hall of Fame records will appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-8">
              {displayGroups.map(([groupKey, group]) => {
                const isActive = group.status === 'ACTIVE';

                return (
                  <div
                    key={groupKey}
                    className="p-6 sm:p-8 rounded-3xl bg-[#0b0c10] border border-zinc-800 space-y-6 shadow-xl"
                  >
                    {/* Season Title Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800/90 pb-4">
                      <div className="flex items-center gap-3">
                        <div className="px-4 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 font-display font-black text-base uppercase tracking-wider">
                          🏆 {group.seasonName}
                        </div>
                        {isActive ? (
                          <span className="px-2.5 py-0.5 rounded-full bg-emerald-950/60 border border-emerald-500/50 text-emerald-400 text-[10px] font-mono font-bold uppercase">
                            ● Active Season
                          </span>
                        ) : (
                          <span className="text-xs font-mono text-zinc-400">
                            Finalized Season {group.seasonNumber}
                          </span>
                        )}
                      </div>
                      <span className="text-xs font-mono text-zinc-500">
                        {isActive ? 'Ongoing Ladder' : 'Official Permanent Roster'}
                      </span>
                    </div>

                    {/* Active season notice */}
                    {isActive && (
                      <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-xs font-mono text-amber-300 space-y-1">
                        <div className="font-bold flex items-center gap-1.5">
                          <span>Season is still active.</span>
                        </div>
                        <div className="text-zinc-400 text-[11px]">
                          No champion has been declared. Ranks are determined upon official administrator season finalization.
                        </div>
                      </div>
                    )}

                    {/* Game by Game Breakdown: Strictly the 5 canonical games */}
                    <div className="space-y-3">
                      {COMPETITIVE_GAMES.map((game) => {
                        const officialChamp = group.entries.find(
                          (c) =>
                            (c.gameId === game.id ||
                              c.gameName?.toLowerCase() === game.name.toLowerCase() ||
                              (game.id === 'fc' && (c.gameId.startsWith('fc') || c.gameCategory === 'FC'))) &&
                            c.status === 'OFFICIAL' &&
                            Boolean(c.championId)
                        );

                        const hasChampion = !isActive && Boolean(officialChamp);
                        const isTeam = officialChamp?.winnerType === 'TEAM' || officialChamp?.matchFormat === '5v5';

                        return (
                          <div
                            key={game.id}
                            onClick={() => {
                              if (hasChampion && officialChamp) handleSelectParticipant(officialChamp);
                            }}
                            className={`p-4 sm:p-5 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                              hasChampion
                                ? 'bg-[#08080a] border-zinc-800/80 hover:border-amber-500/50 cursor-pointer group'
                                : 'bg-[#060608] border-zinc-900/80 cursor-default opacity-85'
                            }`}
                          >
                            {/* Game → Winner */}
                            <div className="flex items-center gap-3 sm:gap-5 min-w-0">
                              <span className="text-2xl shrink-0">{game.icon}</span>

                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-mono font-bold text-zinc-400 uppercase">
                                    {game.name}
                                  </span>
                                  <span className="text-zinc-600 font-bold">→</span>
                                  <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-zinc-900 text-zinc-400 border border-zinc-800">
                                    {isActive ? 'Season Active' : hasChampion ? (isTeam ? 'Winning Team' : 'Winner') : 'No Champion'}
                                  </span>
                                </div>

                                <div className="text-base sm:text-lg font-black font-display text-white group-hover:text-amber-400 transition-colors flex items-center gap-2 mt-0.5 truncate">
                                  {isActive ? (
                                    <div className="space-y-0.5">
                                      <div className="text-zinc-400 text-sm font-mono font-normal">
                                        Season is still active.
                                      </div>
                                      <div className="text-zinc-500 text-xs font-mono">
                                        No champion has been declared.
                                      </div>
                                    </div>
                                  ) : hasChampion && officialChamp ? (
                                    <>
                                      <span>👑</span>
                                      <span className="truncate">
                                        Champion: {officialChamp.championName || officialChamp.gamerTag}
                                      </span>
                                      {officialChamp.teamTag && (
                                        <span className="text-xs font-mono text-zinc-500 font-bold">
                                          [{officialChamp.teamTag}]
                                        </span>
                                      )}
                                    </>
                                  ) : (
                                    <span className="text-zinc-500 text-sm font-mono font-normal flex items-center gap-1.5">
                                      <Ban className="w-3.5 h-3.5 text-zinc-600" />
                                      <span>No champion declared</span>
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* MMR & Record (If official champion exists) */}
                            {hasChampion && officialChamp ? (
                              <div className="flex items-center justify-between sm:justify-end gap-6 text-right pt-2 sm:pt-0 border-t sm:border-t-0 border-zinc-900">
                                <div>
                                  <div className="text-[10px] font-mono text-zinc-500 uppercase font-bold">
                                    Final MMR
                                  </div>
                                  <div className="text-lg font-black font-mono text-amber-400 font-mono-numbers">
                                    {officialChamp.finalMMR.toLocaleString()}
                                  </div>
                                </div>

                                <div className="text-right">
                                  <div className="text-xs font-mono font-bold text-zinc-300">
                                    <span className="text-emerald-400">{officialChamp.wins}W</span> - <span className="text-red-400">{officialChamp.losses}L</span>
                                  </div>
                                  <div className="text-[11px] font-mono text-amber-400 font-bold">
                                    {officialChamp.winRate}% WR
                                  </div>
                                </div>

                                <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-amber-400 transition-colors shrink-0 hidden sm:block" />
                              </div>
                            ) : (
                              <div className="text-xs font-mono text-zinc-600 italic sm:text-right">
                                {isActive ? 'In Progress' : 'No verified competitive results in this season'}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 3: CHAMPION CARDS GALLERY */}
      {/* ========================================================================= */}
      {activeTab === 'GALLERY' && (
        <div className="space-y-6">
          {entries.length === 0 ? (
            <div className="p-8 sm:p-12 rounded-3xl bg-[#08080a] border border-zinc-800 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 mx-auto flex items-center justify-center text-zinc-500">
                <Crown className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white font-display">
                No Official Champion Cards Available
              </h3>
              <p className="text-xs text-zinc-400 max-w-md mx-auto leading-relaxed">
                Cards are generated and cataloged here only upon official administrator season finalization.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {entries.map((champ) => {
                const isTeam = champ.winnerType === 'TEAM' || champ.matchFormat === '5v5';
                return (
                  <div
                    key={champ.id}
                    onClick={() => handleSelectParticipant(champ)}
                    className="p-6 rounded-3xl bg-[#0e0e14] border border-amber-500/30 hover:border-amber-400 transition-all flex flex-col justify-between space-y-4 cursor-pointer shadow-lg group"
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2.5">
                        <span className="text-xs font-mono font-bold text-amber-400 uppercase">
                          {champ.seasonName}
                        </span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-zinc-900 text-zinc-400 border border-zinc-800">
                          {isTeam ? '5v5 SQUAD' : '1v1'}
                        </span>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-2xl">
                          {champ.gameId === 'chess' ? '♟️' : champ.gameId.includes('fc') ? '⚽' : champ.gameId === 'valorant' ? '🔴' : champ.gameId === 'cs2' ? '🟠' : '🟢'}
                        </div>
                        <div>
                          <div className="text-xs font-mono text-zinc-400 uppercase font-bold">
                            {champ.gameName}
                          </div>
                          <div className="text-lg font-black font-display text-white group-hover:text-amber-400 transition-colors flex items-center gap-1.5 truncate">
                            <span>👑</span>
                            <span className="truncate">{champ.championName || champ.gamerTag}</span>
                            {champ.teamTag && (
                              <span className="text-xs font-mono text-zinc-500 font-bold">
                                [{champ.teamTag}]
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-2">
                        <div className="p-2.5 rounded-xl bg-[#08080a] border border-zinc-800 text-center">
                          <div className="text-[10px] font-mono text-zinc-500 uppercase font-bold">Final MMR</div>
                          <div className="text-base font-black font-mono text-amber-400 font-mono-numbers mt-0.5">
                            {champ.finalMMR}
                          </div>
                        </div>
                        <div className="p-2.5 rounded-xl bg-[#08080a] border border-zinc-800 text-center">
                          <div className="text-[10px] font-mono text-zinc-500 uppercase font-bold">Win Rate</div>
                          <div className="text-base font-black font-mono text-emerald-400 font-mono-numbers mt-0.5">
                            {champ.winRate}%
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between text-[11px] font-mono text-zinc-400">
                      <span>{champ.wins}W - {champ.losses}L</span>
                      <span className="text-amber-400 font-bold flex items-center gap-1">
                        <span>Profile</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
