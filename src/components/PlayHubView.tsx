import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Match, Game, GameCategory } from '../types';
import { fetchGames } from '../services/gameService';
import {
  subscribeToOpen5v5Lobbies,
  calculate5v5LobbyState,
  isMatchPrivate,
  join5v5Lobby,
  isActive5v5Lobby,
} from '../services/matchService';
import { Join5v5LobbyModal } from './Join5v5LobbyModal';
import { useToast } from './Toast';
import { Swords, Users, Play, Plus, ChevronRight, Shield, Radio, CheckCircle2, Lock, Info, Coins, X } from 'lucide-react';
import { OfficialMatchResult } from '../types';
import { subscribeToOfficialMatchResults } from '../services/manualMatchResultService';
import { AdminRecordMatchResult } from './AdminRecordMatchResult';
import { HomeRecentMatchesFeed } from './HomeRecentMatchesFeed';

interface PlayHubViewProps {
  onSelect1v1Game?: (gameId: string) => void;
  onOpenCreate5v5Lobby: () => void;
  onSelectMatch: (matchId: string) => void;
  onOpenAuth?: (mode?: 'login' | 'register') => void;
  onOpenRecordResult?: () => void;
  onNavigateToHistory?: () => void;
}

interface GameCardDef {
  id: string;
  name: string;
  format: '1v1' | '5v5';
  device: string;
  icon: string;
  category: GameCategory;
  accent: string;
  rewardRules: string;
  howToPlay: string;
}

const PRIMARY_GAMES: GameCardDef[] = [
  {
    id: 'chess',
    name: 'CHESS',
    format: '1v1',
    device: 'Physical & Digital Clocks',
    icon: '♟️',
    category: 'CHESS',
    accent: 'border-white/10 hover:border-red-600',
    rewardRules: 'Win = +2 NC • Draw = +1 NC each • Loss = 0 NC',
    howToPlay: 'Play over-the-board clock duels at Chess stations. When finished, inform staff to verify the clock & record the outcome.',
  },
  {
    id: 'fc26',
    name: 'FC 26',
    format: '1v1',
    device: 'PS5 Pro Station',
    icon: '⚽',
    category: 'PS5',
    accent: 'border-white/10 hover:border-red-600',
    rewardRules: 'Total Games Played × 60 NC (Winner: Total Games × 60 NC • Series Draw: Split equally • Loser = 0 NC)',
    howToPlay: 'Play your series on PS5 Pro stations. Report final game scores to staff desk upon completion.',
  },
  {
    id: 'fc27',
    name: 'FC 27',
    format: '1v1',
    device: 'PS5 Pro Station',
    icon: '⚽',
    category: 'PS5',
    accent: 'border-white/10 hover:border-red-600',
    rewardRules: 'Total Games Played × 60 NC (Winner: Total Games × 60 NC • Series Draw: Split equally • Loser = 0 NC)',
    howToPlay: 'Next-gen tournament series on PS5 Pro stations. Staff records validated series score.',
  },
  {
    id: 'valorant',
    name: 'VALORANT',
    format: '5v5',
    device: 'PC 240Hz Rigs',
    icon: '🎯',
    category: 'PC',
    accent: 'border-white/10 hover:border-red-600',
    rewardRules: 'Hourly Reward: Winning Team = 90 NC/hr per player • Losing Team = 30 NC/hr per player (Draw = 45 NC/hr)',
    howToPlay: 'Play 5v5 competitive match on PC stations or form a squad in the open lobbies below. Staff records victory & duration.',
  },
  {
    id: 'cs2',
    name: 'CS2',
    format: '5v5',
    device: 'PC 240Hz Rigs',
    icon: '🔫',
    category: 'PC',
    accent: 'border-white/10 hover:border-red-600',
    rewardRules: 'Hourly Reward: Winning Team = 90 NC/hr per player • Losing Team = 30 NC/hr per player (Draw = 45 NC/hr)',
    howToPlay: '5v5 LAN competitive match on 240Hz PC rigs. Staff records winning team & duration.',
  },
  {
    id: 'lol',
    name: 'LEAGUE OF LEGENDS',
    format: '5v5',
    device: 'PC 240Hz Rigs',
    icon: '⚔️',
    category: 'PC',
    accent: 'border-white/10 hover:border-red-600',
    rewardRules: 'Hourly Reward: Winning Team = 90 NC/hr per player • Losing Team = 30 NC/hr per player (Draw = 45 NC/hr)',
    howToPlay: '5v5 Summoner Rift match on PC rigs. Staff records verified outcome & duration.',
  },
];

export const PlayHubView: React.FC<PlayHubViewProps> = ({
  onSelect1v1Game,
  onOpenCreate5v5Lobby,
  onSelectMatch,
  onOpenAuth,
  onOpenRecordResult,
  onNavigateToHistory,
}) => {
  const { user, playerProfile, isStaff, isAdmin, isSuperAdmin } = useAuth();
  const canRecord = Boolean(isStaff || isAdmin || isSuperAdmin);
  const { showToast } = useToast();
  const [games, setGames] = useState<Game[]>([]);
  const [openLobbies, setOpenLobbies] = useState<Match[]>([]);
  const [selectedGameFilter, setSelectedGameFilter] = useState<string>('ALL');
  const [joinModalLobbyCode, setJoinModalLobbyCode] = useState<string | null>(null);
  const [selectedLobbyForDetails, setSelectedLobbyForDetails] = useState<Match | null>(null);

  // Game details modal
  const [selectedGameCard, setSelectedGameCard] = useState<GameCardDef | null>(null);
  // Staff Record Result Modal
  const [recordResultModalOpen, setRecordResultModalOpen] = useState(false);
  // Recent official results feed
  const [recentResults, setRecentResults] = useState<OfficialMatchResult[]>([]);

  useEffect(() => {
    fetchGames(true).then(setGames).catch(console.error);

    const unsub = subscribeToOpen5v5Lobbies(
      selectedGameFilter === 'ALL' ? undefined : selectedGameFilter,
      (matches) => {
        setOpenLobbies(matches);
      }
    );

    const unsubResults = subscribeToOfficialMatchResults((results) => {
      setRecentResults(results);
    }, 6);

    return () => {
      unsub();
      unsubResults();
    };
  }, [selectedGameFilter]);

  const handleGameCardClick = (card: GameCardDef) => {
    setSelectedGameCard(card);
  };

  const [joiningLobbyId, setJoiningLobbyId] = useState<string | null>(null);

  const handleJoinLobby = async (match: Match) => {
    if (!user) {
      onOpenAuth?.('login');
      return;
    }

    const currentUid = user.uid;
    const teamAIds = match.teamAPlayerIds || [];
    const teamBIds = match.teamBPlayerIds || [];
    const isOwner = match.lobbyOwnerId === currentUid || match.createdBy === currentUid;
    const isMember = teamAIds.includes(currentUid) || teamBIds.includes(currentUid) || isOwner;

    // If user is already in this lobby, open the room directly
    if (isMember) {
      onSelectMatch(match.id);
      return;
    }

    if (
      playerProfile?.isBanned ||
      playerProfile?.isSuspended ||
      (playerProfile as any)?.status === 'BANNED' ||
      (playerProfile as any)?.status === 'SUSPENDED'
    ) {
      showToast('error', 'Account Suspended', 'You cannot join lobbies while your account is suspended or banned.');
      return;
    }

    // Direct transactional join using existing canonical join5v5Lobby service
    setJoiningLobbyId(match.id);
    try {
      const res = await join5v5Lobby({
        lobbyCode: match.lobbyCode || '',
        captainId: currentUid,
        playerId: currentUid,
      });

      if (res.success && res.match) {
        showToast(
          'success',
          'Joined 5v5 Lobby! ⚔️',
          `Successfully joined ${res.match.gameName || '5v5 squad'} lobby.`
        );
        onSelectMatch(res.match.id);
      } else {
        showToast('error', 'Could Not Join Lobby', res.error || 'Failed to join 5v5 lobby.');
      }
    } catch (err: any) {
      showToast('error', 'Error Joining Lobby', err.message || 'An unexpected error occurred.');
    } finally {
      setJoiningLobbyId(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-10">
      {/* Title & Quick CTAs */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-white/10 pb-6">
        <div>
          <h1 className="text-3xl sm:text-4xl font-black font-display tracking-tight text-white uppercase">
            Play <span className="text-red-500">Arena</span>
          </h1>
          <p className="text-sm text-neutral-400 mt-1">
            Real-world gaming sessions rewarded instantly. No advance match creation needed!
          </p>
        </div>

        <div className="flex items-center gap-3">
          {canRecord && (
            <button
              onClick={() => setRecordResultModalOpen(true)}
              className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer shadow-[0_0_15px_rgba(239,68,68,0.4)]"
            >
              <Swords className="w-4 h-4" />
              <span>⚡ VALIDATE MATCH RESULT</span>
            </button>
          )}

          <button
            onClick={() => {
              if (!user) {
                onOpenAuth?.('register');
              } else {
                onOpenCreate5v5Lobby();
              }
            }}
            className="px-4 py-2.5 rounded-xl nexus-btn-3d text-white text-xs font-bold uppercase tracking-wider flex items-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ 5v5 Squad</span>
          </button>
        </div>
      </div>

      {/* HOW IT WORKS BANNER */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-neutral-950 via-neutral-900 to-neutral-950 border border-white/10 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-red-600/20 text-red-400 border border-red-500/30 text-[10px] font-mono font-bold uppercase tracking-widest">
                Arena Play Workflow
              </span>
              <span className="text-xs font-mono text-neutral-400">Play First • Claim Verified NC Rewards</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black font-display text-white uppercase mt-1">
              How Nexus Match Rewards Work
            </h2>
            <p className="text-xs text-neutral-400 max-w-2xl mt-0.5">
              Players do not need to create matches in advance! Enjoy your game at any Nexus station. When your match ends, on-duty staff records the official score, and Nexus Coins are automatically deposited into your wallet.
            </p>
          </div>
          {canRecord && (
            <button
              onClick={() => setRecordResultModalOpen(true)}
              className="px-5 py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-black uppercase tracking-wider shadow-lg flex items-center gap-2 shrink-0 cursor-pointer"
            >
              <Swords className="w-4 h-4" />
              <span>Enter / Validate Match Result</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2 border-t border-white/5 text-xs">
          <div className="p-3 rounded-xl bg-neutral-900/60 border border-white/5 space-y-1">
            <div className="font-mono text-red-400 font-bold">1. SIT &amp; PLAY</div>
            <p className="text-neutral-400 text-[11px]">Play your session on PC, PS5 Pro, or Chess board with opponents.</p>
          </div>
          <div className="p-3 rounded-xl bg-neutral-900/60 border border-white/5 space-y-1">
            <div className="font-mono text-amber-400 font-bold">2. FINISH MATCH</div>
            <p className="text-neutral-400 text-[11px]">Conclude your game or series and inform any on-duty staff member.</p>
          </div>
          <div className="p-3 rounded-xl bg-neutral-900/60 border border-white/5 space-y-1">
            <div className="font-mono text-cyan-400 font-bold">3. STAFF RECORDS</div>
            <p className="text-neutral-400 text-[11px]">Staff validates participants and records the official score at the desk.</p>
          </div>
          <div className="p-3 rounded-xl bg-neutral-900/60 border border-white/5 space-y-1">
            <div className="font-mono text-emerald-400 font-bold">4. INSTANT NC</div>
            <p className="text-neutral-400 text-[11px]">Authoritative NC rewards are credited instantly to winner wallets.</p>
          </div>
        </div>
      </div>

      {/* 1. VISUAL GAME CARDS (3D DEPTH) */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-mono font-bold uppercase tracking-widest text-neutral-400">
            Available Games &amp; Rewards
          </h2>
          <span className="text-xs text-neutral-500 font-mono">Click any title to view rules &amp; NC rewards</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {PRIMARY_GAMES.map((card) => (
            <button
              key={card.id}
              onClick={() => handleGameCardClick(card)}
              className="group relative p-4 rounded-2xl nexus-card-3d text-left flex flex-col justify-between h-56 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 overflow-hidden cursor-pointer"
            >
              {/* Subtle top indicator on hover */}
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-red-600 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

              <div>
                {/* Big Game Emoji / Icon */}
                <div className="text-3xl mb-3 group-hover:scale-110 transition-transform origin-left">
                  {card.icon}
                </div>

                {/* Game Title */}
                <h3 className="text-lg font-black font-display tracking-tight text-white group-hover:text-red-500 transition-colors">
                  {card.name}
                </h3>

                {/* Subtitle / Station */}
                <p className="text-[11px] text-neutral-400 mt-0.5 font-mono truncate">
                  {card.device}
                </p>
              </div>

              {/* Bottom format + action indicator */}
              <div className="pt-3 border-t border-white/5 flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold uppercase text-neutral-400">
                  {card.format}
                </span>
                <span className="text-[11px] font-bold uppercase tracking-wider text-red-500 flex items-center gap-0.5 group-hover:translate-x-1 transition-transform">
                  <span>INFO</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* RECENT OFFICIAL RESULTS FEED */}
      {recentResults.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-mono font-bold uppercase tracking-widest text-neutral-400 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Recent Official Match Results</span>
            </h2>
            <span className="text-[11px] font-mono text-neutral-500">Recorded by Nexus Staff</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {recentResults.slice(0, 6).map((item) => (
              <div key={item.id} className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white uppercase flex items-center gap-1.5">
                    <span>{PRIMARY_GAMES.find((g) => g.id === item.gameId)?.icon || '🎮'}</span>
                    <span>{item.gameName}</span>
                  </span>
                  <span className="font-mono font-bold text-amber-400">🪙 +{item.totalRewardAwarded} NC</span>
                </div>

                <div className="text-neutral-300 font-mono flex items-center justify-between pt-1 border-t border-neutral-900">
                  <span className="text-neutral-400">
                    {item.matchFormat === '1v1' ? (
                      <>
                        <span className="text-white font-bold">{item.playerAGamerTag}</span> vs{' '}
                        <span className="text-white font-bold">{item.playerBGamerTag}</span>
                      </>
                    ) : (
                      <span>Squad Match</span>
                    )}
                  </span>
                  <span className="text-emerald-400 font-bold">
                    {item.winnerGamerTag ? `Winner: ${item.winnerGamerTag}` : 'Draw'}
                  </span>
                </div>

                <div className="text-[10px] text-neutral-500 font-mono flex items-center justify-between">
                  <span>Logged by {item.recordedByName}</span>
                  <span>{new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2. SIMPLIFIED LOBBY FEED */}
      <div className="space-y-4 pt-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold font-display text-white tracking-wide uppercase flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-pulse" />
              <span>Active Squad Lobbies</span>
            </h2>
            <p className="text-xs text-neutral-400 mt-0.5">
              Instant pickup squads. Click Join to enter a lobby.
            </p>
          </div>

          {/* Simple Filter */}
          <div className="flex items-center gap-1 bg-neutral-950 border border-white/10 rounded-lg p-1">
            {['ALL', 'cs2', 'valorant'].map((tab) => (
              <button
                key={tab}
                onClick={() => setSelectedGameFilter(tab)}
                className={`px-3 py-1 rounded text-xs font-mono font-bold uppercase transition-colors ${
                  selectedGameFilter === tab
                    ? 'bg-red-600 text-white'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                {tab === 'ALL' ? 'All Games' : tab.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {openLobbies.length === 0 ? (
          <div className="p-10 rounded-2xl bg-neutral-950 border border-white/10 text-center space-y-4">
            <Users className="w-10 h-10 text-neutral-600 mx-auto" />
            <div>
              <p className="text-sm font-bold text-white">No Open Squad Lobbies Right Now</p>
              <p className="text-xs text-neutral-400 mt-1 max-w-sm mx-auto">
                Be the first to open a squad lobby for CS2 or Valorant and invite players in the center!
              </p>
            </div>
            <button
              onClick={() => {
                if (!user) onOpenAuth?.('register');
                else onOpenCreate5v5Lobby();
              }}
              className="px-5 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold uppercase tracking-wider transition-all"
            >
              + Create Squad Lobby
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {openLobbies.map((lobby) => {
              const state = calculate5v5LobbyState(lobby);
              const totalJoined = (state.teamACount || 0) + (state.teamBCount || 0);
              const maxCapacity = 10;
              const isFull = state.isFull || totalJoined >= maxCapacity;
              const squadName = lobby.teamAName || lobby.playerAGamerTag || 'Nexus Squad';
              const openSlots = Math.max(0, maxCapacity - totalJoined);

              // Canonical Lobby Membership & Ownership Checks using authenticated Firebase UID
              const currentUid = user?.uid;

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
              const isMember = isMemberOfTeamA || isMemberOfTeamB || isLobbyOwner;

              // Check if user is active in another 5v5 lobby
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

              // Only consider active5v5LobbyId if it matches an actual active open lobby in openLobbies,
              // avoiding stale pointer from an old/finished lobby blocking joining.
              const isPointerActiveInAnother = Boolean(
                currentUid &&
                playerProfile?.active5v5LobbyId &&
                playerProfile.active5v5LobbyId !== lobby.id &&
                openLobbies.some((ol) => ol.id === playerProfile.active5v5LobbyId && isActive5v5Lobby(ol))
              );

              const isInAnotherLobby = Boolean(userOtherActiveLobby || isPointerActiveInAnother);

              const isUserSuspended = Boolean(
                playerProfile?.isSuspended ||
                playerProfile?.isBanned ||
                (playerProfile as any)?.status === 'BANNED' ||
                (playerProfile as any)?.status === 'SUSPENDED'
              );

              return (
                <div
                  key={lobby.id}
                  className="p-5 rounded-2xl nexus-card-3d flex flex-col justify-between gap-4 min-w-0"
                >
                  <div className="flex items-start justify-between gap-3 min-w-0">
                    <div className="min-w-0 flex-1">
                      {/* Game Name */}
                      <span className="text-[11px] font-mono font-bold uppercase text-red-500 tracking-wider">
                        {lobby.gameName || '5v5 TACTICAL'}
                      </span>
                      {/* Squad / Lobby Name */}
                      <h4 className="text-base font-bold font-display text-white mt-0.5 truncate">
                        {squadName}
                      </h4>
                      {/* Station */}
                      <p className="text-xs text-neutral-400 font-mono mt-0.5 truncate">
                        Station: {lobby.station || 'PC Area'}
                      </p>
                    </div>

                    {/* Status Indicator */}
                    <div className="text-right shrink-0">
                      {isFull ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-red-500">
                          <span className="w-2 h-2 rounded-full bg-red-500" />
                          <span>FULL</span>
                        </span>
                      ) : isMatchPrivate(lobby) ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-amber-400">
                          <Lock className="w-3 h-3 text-amber-400" />
                          <span>PRIVATE</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-white">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                          <span>OPEN</span>
                        </span>
                      )}
                      <div className="text-xs font-mono text-neutral-400 mt-1">
                        <strong className="text-white">{totalJoined}</strong> / {maxCapacity}
                      </div>
                    </div>
                  </div>

                  {/* Bottom Action Row */}
                  <div className="pt-3 border-t border-white/5 flex items-center justify-between gap-2">
                    <span className="text-xs text-neutral-400 font-mono">
                      {isFull ? '0 slots left' : `${openSlots} slots left`}
                    </span>

                    {/* Button logic according to specifications */}
                    {(() => {
                      if (!user) {
                        if (isFull) {
                          return (
                            <button
                              id={`btn-full-lobby-${lobby.lobbyCode || lobby.id}`}
                              onClick={() => onSelectMatch(lobby.id)}
                              className="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider bg-neutral-900 text-neutral-400 hover:text-white hover:bg-neutral-800 border border-white/5 transition-all cursor-pointer"
                              title="Lobby is full. Click to view."
                            >
                              <span>FULL</span>
                            </button>
                          );
                        }
                        if (isMatchPrivate(lobby)) {
                          return (
                            <button
                              id={`btn-private-lobby-${lobby.lobbyCode || lobby.id}`}
                              onClick={() => {
                                showToast(
                                  'info',
                                  'Private Lobby',
                                  'This lobby is private. Entry requires an invitation from the Lobby Owner or Team B Captain.'
                                );
                              }}
                              className="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider bg-neutral-900 border border-amber-500/30 text-amber-300 hover:bg-neutral-800 transition-all cursor-pointer flex items-center gap-1.5"
                              title="Private Lobby - Invitation Required"
                            >
                              <Lock className="w-3.5 h-3.5 text-amber-400" />
                              <span>PRIVATE</span>
                            </button>
                          );
                        }
                        return (
                          <button
                            id={`btn-join-5v5-${lobby.lobbyCode || lobby.id}`}
                            onClick={() => onOpenAuth?.('login')}
                            className="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all nexus-btn-3d text-white cursor-pointer"
                          >
                            <span>JOIN 5V5</span>
                          </button>
                        );
                      }

                      // 1. If user account is suspended or banned: SHOW [ SUSPENDED ]
                      if (isUserSuspended) {
                        return (
                          <button
                            id={`btn-suspended-lobby-${lobby.lobbyCode || lobby.id}`}
                            onClick={() => {
                              showToast(
                                'error',
                                'Account Suspended',
                                'You cannot join lobbies while your account is suspended or banned.'
                              );
                            }}
                            className="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider bg-neutral-900 border border-red-500/20 text-neutral-500 cursor-not-allowed opacity-75"
                            title="Account suspended or banned."
                          >
                            <span>SUSPENDED</span>
                          </button>
                        );
                      }

                      // 2. If currentUser.uid === lobby.ownerId: SHOW [ YOUR LOBBY ] (or [ OPEN LOBBY ])
                      if (isLobbyOwner) {
                        return (
                          <button
                            id={`btn-open-owner-lobby-${lobby.lobbyCode || lobby.id}`}
                            onClick={() => onSelectMatch(lobby.id)}
                            className="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all bg-emerald-500 hover:bg-emerald-400 text-black shadow-md cursor-pointer flex items-center gap-1.5 font-mono font-black"
                            title="You created and own this lobby. Click to open match room."
                          >
                            <Shield className="w-3.5 h-3.5 text-black" />
                            <span>YOUR LOBBY</span>
                          </button>
                        );
                      }

                      // 3. If currentUser.uid is already a member of Team A or Team B: SHOW [ IN LOBBY ] (or [ OPEN LOBBY ])
                      if (isMemberOfTeamA || isMemberOfTeamB) {
                        return (
                          <button
                            id={`btn-in-lobby-${lobby.lobbyCode || lobby.id}`}
                            onClick={() => onSelectMatch(lobby.id)}
                            className="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all bg-cyan-500 hover:bg-cyan-400 text-black shadow-md cursor-pointer flex items-center gap-1.5 font-mono font-black"
                            title={`You are on ${isMemberOfTeamA ? 'Team A' : 'Team B'} in this lobby. Click to open match room.`}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 text-black" />
                            <span>IN LOBBY</span>
                          </button>
                        );
                      }

                      // 4. If currentUser.uid is already in ANOTHER active lobby: JOIN is NOT available
                      if (isInAnotherLobby) {
                        return (
                          <button
                            id={`btn-other-lobby-${lobby.lobbyCode || lobby.id}`}
                            onClick={() => {
                              showToast(
                                'warning',
                                'Already in Lobby',
                                `You are already an active participant in 5v5 lobby ${
                                  userOtherActiveLobby?.lobbyCode || 'another squad lobby'
                                }. Please leave or finish that lobby first.`
                              );
                            }}
                            className="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider bg-neutral-900 border border-white/5 text-neutral-500 cursor-not-allowed opacity-80"
                            title="You are already in another active 5v5 lobby."
                          >
                            <span>IN OTHER LOBBY</span>
                          </button>
                        );
                      }

                      // 5. If currentUser.uid is NOT a member AND lobby is full: SHOW [ FULL ]
                      if (isFull) {
                        return (
                          <button
                            id={`btn-full-lobby-${lobby.lobbyCode || lobby.id}`}
                            onClick={() => onSelectMatch(lobby.id)}
                            className="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider bg-neutral-900 text-neutral-400 hover:text-white hover:bg-neutral-800 border border-white/5 transition-all cursor-pointer"
                            title="Lobby is full. Click to view."
                          >
                            <span>FULL</span>
                          </button>
                        );
                      }

                      // 6. If lobby is PRIVATE: Non-members cannot join directly (entry requires invitation)
                      if (isMatchPrivate(lobby)) {
                        return (
                          <button
                            id={`btn-private-lobby-${lobby.lobbyCode || lobby.id}`}
                            onClick={() => {
                              showToast(
                                'info',
                                'Private Lobby',
                                'This lobby is private. Entry requires an invitation from the Lobby Owner or Team B Captain.'
                              );
                            }}
                            className="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider bg-neutral-900 border border-amber-500/30 text-amber-300 hover:bg-neutral-800 transition-all cursor-pointer flex items-center gap-1.5"
                            title="Private Lobby - Invitation Required"
                          >
                            <Lock className="w-3.5 h-3.5 text-amber-400" />
                            <span>PRIVATE</span>
                          </button>
                        );
                      }

                      // 7. If currentUser.uid is NOT in Team A and NOT in Team B and lobby has available slot: SHOW [ JOIN 5V5 ]
                      const isJoiningThis = joiningLobbyId === lobby.id;
                      return (
                        <button
                          id={`btn-join-5v5-${lobby.lobbyCode || lobby.id}`}
                          onClick={() => handleJoinLobby(lobby)}
                          disabled={isJoiningThis}
                          className="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all nexus-btn-3d text-white cursor-pointer flex items-center gap-1.5"
                          title="Click to join this 5v5 lobby"
                        >
                          {isJoiningThis ? (
                            <span>JOINING...</span>
                          ) : (
                            <span>JOIN 5V5</span>
                          )}
                        </button>
                      );
                    })()}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 3. RECENT VALIDATED MATCH HISTORY */}
      <HomeRecentMatchesFeed
        title="Recent Validated Matches"
        onViewAllMatchHistory={onNavigateToHistory || (() => {})}
      />

      {/* Join Lobby Modal */}
      {joinModalLobbyCode && (
        <Join5v5LobbyModal
          isOpen={!!joinModalLobbyCode}
          onClose={() => setJoinModalLobbyCode(null)}
          onLobbyJoined={(joinedMatch) => {
            setJoinModalLobbyCode(null);
            onSelectMatch(joinedMatch.id);
          }}
          prefilledCode={joinModalLobbyCode}
        />
      )}

      {/* GAME DETAILS & REWARD RULES MODAL */}
      {selectedGameCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-lg bg-neutral-950 border border-neutral-800 rounded-2xl p-6 shadow-2xl space-y-5 animate-scaleUp">
            <div className="flex items-center justify-between border-b border-neutral-850 pb-4">
              <div className="flex items-center gap-3">
                <span className="text-4xl">{selectedGameCard.icon}</span>
                <div>
                  <h3 className="text-xl font-black uppercase text-white tracking-tight">
                    {selectedGameCard.name}
                  </h3>
                  <p className="text-xs text-neutral-400 font-mono">
                    {selectedGameCard.format} • {selectedGameCard.device}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedGameCard(null)}
                className="p-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Reward Matrix Rule */}
            <div className="p-4 rounded-xl bg-neutral-900 border border-neutral-800 space-y-2">
              <div className="flex items-center gap-2 text-xs font-mono font-bold uppercase text-amber-400">
                <Coins className="w-4 h-4" />
                <span>Authoritative Reward Matrix</span>
              </div>
              <p className="text-sm font-bold text-white">
                {selectedGameCard.rewardRules}
              </p>
            </div>

            {/* How to Play & Claim */}
            <div className="space-y-2 text-xs">
              <span className="font-mono uppercase font-bold text-neutral-400">How to Play at Nexus</span>
              <p className="text-neutral-300 leading-relaxed bg-neutral-900/60 p-3 rounded-xl border border-neutral-850">
                {selectedGameCard.howToPlay}
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-neutral-900/40 border border-neutral-800/80 text-[11px] text-neutral-400 space-y-1">
              <div className="font-bold text-white flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>No Advance Match Setup Required</span>
              </div>
              <p>Play your real-world match directly in the arena. Staff validates and logs verified outcomes at the front desk terminal.</p>
            </div>

            <div className="flex items-center gap-3 pt-2">
              {canRecord && (
                <button
                  onClick={() => {
                    setSelectedGameCard(null);
                    setRecordResultModalOpen(true);
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-black text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer shadow-[0_0_15px_rgba(239,68,68,0.3)]"
                >
                  <Swords className="w-3.5 h-3.5" />
                  <span>Staff: Record Result</span>
                </button>
              )}
              <button
                onClick={() => setSelectedGameCard(null)}
                className="flex-1 py-2.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-neutral-300 font-bold text-xs uppercase tracking-wider transition-all cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STAFF RECORD RESULT MODAL */}
      {recordResultModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
          <div className="w-full max-w-4xl bg-neutral-950 border border-neutral-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 animate-scaleUp my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-red-600/20 text-red-500 flex items-center justify-center">
                  <Swords className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-lg font-black uppercase text-white tracking-wide">
                    Enter Match Result — Authoritative Validation Desk
                  </h3>
                  <p className="text-xs text-neutral-400">Authorized Nexus Employee Terminal • NC &amp; MMR Pipeline</p>
                </div>
              </div>
              <button
                onClick={() => setRecordResultModalOpen(false)}
                className="p-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <AdminRecordMatchResult />
          </div>
        </div>
      )}
    </div>
  );
};
