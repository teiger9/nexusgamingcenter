import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useBackHandler } from '../context/NavigationContext';
import { Match, Game, GameCategory } from '../types';
import { fetchGames } from '../services/gameService';
import {
  subscribeToOpen5v5Lobbies,
  calculate5v5LobbyState,
  isMatchPrivate,
  join5v5Lobby,
  isActive5v5Lobby,
  subscribeToPlayerMatches,
} from '../services/matchService';
import { Join5v5LobbyModal } from './Join5v5LobbyModal';
import { useToast } from './Toast';
import {
  Swords,
  Users,
  Play,
  Plus,
  ChevronRight,
  Shield,
  Radio,
  CheckCircle2,
  Lock,
  Info,
  Coins,
  X,
  Flame,
  Gamepad2,
  Gift,
  Trophy,
  ArrowRight,
  Clock,
  Sparkles,
  TrendingUp,
  Filter,
} from 'lucide-react';
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
  rewardTag: string;
}

const PRIMARY_GAMES: GameCardDef[] = [
  {
    id: 'chess',
    name: 'CHESS',
    format: '1v1',
    device: 'Physical & Digital',
    icon: '♟️',
    category: 'CHESS',
    accent: 'border-white/10 hover:border-red-600',
    rewardRules: 'Win = +2 NC • Draw = +1 NC each • Loss = 0 NC',
    howToPlay: 'Play over-the-board clock duels at Chess stations. When finished, inform staff to verify the clock & record the outcome.',
    rewardTag: '1v1 - 2 NC',
  },
  {
    id: 'fc26',
    name: 'FC 26',
    format: '1v1',
    device: 'PS5 Pro Station',
    icon: '⚽',
    category: 'PS5',
    accent: 'border-white/10 hover:border-red-600',
    rewardRules: 'FC Series: 7m=10 NC, 8m=12 NC, 9m=14 NC, 10m=16 NC per match (Winner: Total Matches × Rate • Series Draw: Split equally • Loser = 0 NC)',
    howToPlay: 'Play your series on PS5 Pro stations. Report final game scores to staff desk upon completion.',
    rewardTag: '1v1 - 16 NC',
  },
  {
    id: 'fc27',
    name: 'FC 27',
    format: '1v1',
    device: 'PS5 Pro Station',
    icon: '⚽',
    category: 'PS5',
    accent: 'border-white/10 hover:border-red-600',
    rewardRules: 'FC Series: 7m=10 NC, 8m=12 NC, 9m=14 NC, 10m=16 NC per match (Winner: Total Matches × Rate • Series Draw: Split equally • Loser = 0 NC)',
    howToPlay: 'Next-gen tournament series on PS5 Pro stations. Staff records validated series score.',
    rewardTag: '1v1 - 16 NC',
  },
  {
    id: 'valorant',
    name: 'VALORANT',
    format: '5v5',
    device: 'PC 240Hz Rigs',
    icon: '🎯',
    category: 'PC',
    accent: 'border-white/10 hover:border-red-600',
    rewardRules: 'Hourly Reward: Winning Team = 20 NC/player/hr • Losing Team = 10 NC/player/hr • Draw = 10 NC/player/hr',
    howToPlay: 'Play 5v5 competitive match on PC stations or form a squad in the open lobbies below. Staff records victory & duration.',
    rewardTag: '5v5 - 20 NC',
  },
  {
    id: 'cs2',
    name: 'CS2',
    format: '5v5',
    device: 'PC 240Hz Rigs',
    icon: '🔫',
    category: 'PC',
    accent: 'border-white/10 hover:border-red-600',
    rewardRules: 'Hourly Reward: Winning Team = 20 NC/player/hr • Losing Team = 10 NC/player/hr • Draw = 10 NC/player/hr',
    howToPlay: '5v5 LAN competitive match on 240Hz PC rigs. Staff records winning team & duration.',
    rewardTag: '5v5 - 20 NC',
  },
  {
    id: 'lol',
    name: 'LEAGUE OF LEGENDS',
    format: '5v5',
    device: 'PC 240Hz Rigs',
    icon: '🛡️',
    category: 'PC',
    accent: 'border-white/10 hover:border-red-600',
    rewardRules: 'Hourly Reward: Winning Team = 20 NC/player/hr • Losing Team = 10 NC/player/hr • Draw = 10 NC/player/hr',
    howToPlay: '5v5 Summoner Rift match on PC rigs. Staff records verified outcome & duration.',
    rewardTag: '5v5 - 20 NC',
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
  // Player's recent matches
  const [playerMatches, setPlayerMatches] = useState<Match[]>([]);
  const [playerMatchesLoading, setPlayerMatchesLoading] = useState<boolean>(false);
  const [historyGameFilter, setHistoryGameFilter] = useState<string>('ALL');
  const [selectedMatchDetail, setSelectedMatchDetail] = useState<Match | null>(null);

  // Android Back Handlers for PlayHub modals
  useBackHandler({
    id: 'play-game-details-modal',
    active: !!selectedGameCard,
    onBack: () => setSelectedGameCard(null),
    priority: 15,
  });

  useBackHandler({
    id: 'play-lobby-details-modal',
    active: !!selectedLobbyForDetails,
    onBack: () => setSelectedLobbyForDetails(null),
    priority: 15,
  });

  useBackHandler({
    id: 'play-join-lobby-modal',
    active: !!joinModalLobbyCode,
    onBack: () => setJoinModalLobbyCode(null),
    priority: 15,
  });

  useBackHandler({
    id: 'play-record-result-modal',
    active: recordResultModalOpen,
    onBack: () => setRecordResultModalOpen(false),
    priority: 15,
  });

  useBackHandler({
    id: 'play-match-detail-modal',
    active: !!selectedMatchDetail,
    onBack: () => setSelectedMatchDetail(null),
    priority: 15,
  });

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

  // Subscribe to personal player match history when user is authenticated
  useEffect(() => {
    if (!user) {
      setPlayerMatches([]);
      return;
    }
    setPlayerMatchesLoading(true);
    const unsub = subscribeToPlayerMatches(user.uid, (matches) => {
      setPlayerMatches(matches);
      setPlayerMatchesLoading(false);
    });
    return () => unsub();
  }, [user]);

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

  // Filter player matches or official results
  const filteredPlayerMatches = playerMatches.filter((m) => {
    if (historyGameFilter === 'ALL') return true;
    const g = (m.gameId || m.gameName || '').toLowerCase();
    const filterKey = historyGameFilter.toLowerCase();
    return g.includes(filterKey) || filterKey.includes(g);
  });

  const filteredRecentResults = recentResults.filter((r) => {
    if (historyGameFilter === 'ALL') return true;
    const g = (r.gameId || r.gameName || '').toLowerCase();
    const filterKey = historyGameFilter.toLowerCase();
    return g.includes(filterKey) || filterKey.includes(g);
  });

  const getGameIconForHistory = (gameName?: string) => {
    const g = (gameName || '').toLowerCase();
    if (g.includes('chess')) return '♟️';
    if (g.includes('fc 26')) return '⚽';
    if (g.includes('fc 27')) return '⚽';
    if (g.includes('fc')) return '⚽';
    if (g.includes('val') || g.includes('valorant')) return '🎯';
    if (g.includes('cs') || g.includes('counter')) return '🔫';
    if (g.includes('lol') || g.includes('league')) return '🛡️';
    return '🎮';
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-7 space-y-6 sm:space-y-7">
      {/* A. PAGE HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.08] pb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2.5 h-2.5 bg-red-600 rounded-sm shrink-0 shadow-[0_0_8px_rgba(239,68,68,0.7)]" />
            <span className="text-[10px] font-mono font-bold text-red-500 uppercase tracking-widest">
              NEXUS COMPETITIVE SUITE
            </span>
            <span className="text-zinc-600">•</span>
            <span className="text-[10px] font-mono text-cyan-400 font-semibold uppercase tracking-wider">
              SEASON 1 ACTIVE
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black font-display tracking-tight text-white uppercase">
            PLAY ARENA
          </h1>
          <p className="text-xs text-zinc-400 mt-1 max-w-2xl leading-relaxed">
            Real-world gaming sessions rewarded instantly. No advance match-creation needed! Choose a title, queue with your squad, and log match results for Nexus Coins &amp; MMR.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0 self-start sm:self-center">
          {canRecord && (
            <button
              onClick={() => {
                if (onOpenRecordResult) onOpenRecordResult();
                else setRecordResultModalOpen(true);
              }}
              className="px-4 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-black text-xs uppercase tracking-wider shadow-[0_0_18px_rgba(239,68,68,0.4)] hover:shadow-[0_0_25px_rgba(239,68,68,0.55)] flex items-center gap-2 shrink-0 cursor-pointer transition-all active:scale-95"
            >
              <Swords className="w-4 h-4" />
              <span>ENTER / VALIDATE MATCH RESULT</span>
            </button>
          )}
        </div>
      </div>

      {/* B. HOW NEXUS MATCH REWARDS WORK (4-Step Explanatory Panel) */}
      <div className="rounded-2xl bg-gradient-to-b from-[#0e121c]/95 to-[#070910]/98 border border-red-950/40 p-4 sm:p-5 relative shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.06] pb-3">
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <span className="w-1.5 h-1.5 bg-red-500 rounded-sm" />
              <span className="text-[10px] font-mono font-bold text-red-500 uppercase tracking-widest">
                ARENA PLAY WORKFLOW
              </span>
            </div>
            <h2 className="text-sm sm:text-base font-black font-display text-white uppercase tracking-wider">
              HOW NEXUS MATCH REWARDS WORK
            </h2>
          </div>
          <span className="text-[11px] text-zinc-400 font-mono">
            4-step automated validation &amp; NC payout pipeline
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-4 text-xs">
          {/* Step 1 */}
          <div className="p-3.5 rounded-xl bg-[#0b0f19] border border-slate-800/80 hover:border-red-500/40 transition-colors relative flex flex-col justify-between group">
            <div>
              <div className="flex items-center justify-between font-mono font-bold text-xs uppercase text-white mb-2">
                <span className="flex items-center gap-1.5 text-red-400">
                  <Gamepad2 className="w-3.5 h-3.5 text-red-500" />
                  <span>1. SET UP &amp; PLAY</span>
                </span>
                <span className="text-red-500/40 font-mono font-black text-sm group-hover:text-red-500 transition-colors">
                  01
                </span>
              </div>
              <p className="text-zinc-400 text-[11px] leading-relaxed">
                Book a station or grab a console. Challenge another registered player or squad in any supported title.
              </p>
            </div>
            <div className="mt-3 pt-2 border-t border-white/[0.04] text-[10px] font-mono text-zinc-500">
              PC • PS5 Pro • Physical Chess
            </div>
          </div>

          {/* Step 2 */}
          <div className="p-3.5 rounded-xl bg-[#0b0f19] border border-slate-800/80 hover:border-amber-500/40 transition-colors relative flex flex-col justify-between group">
            <div>
              <div className="flex items-center justify-between font-mono font-bold text-xs uppercase text-white mb-2">
                <span className="flex items-center gap-1.5 text-amber-400">
                  <Coins className="w-3.5 h-3.5 text-amber-500" />
                  <span>2. EARN MATCH NC</span>
                </span>
                <span className="text-amber-500/40 font-mono font-black text-sm group-hover:text-amber-400 transition-colors">
                  02
                </span>
              </div>
              <p className="text-zinc-400 text-[11px] leading-relaxed">
                Win or draw to earn Nexus Coins credited instantly to your account. Higher stakes yield larger payouts.
              </p>
            </div>
            <div className="mt-3 pt-2 border-t border-white/[0.04] text-[10px] font-mono text-zinc-500">
              Instant balance update
            </div>
          </div>

          {/* Step 3 */}
          <div className="p-3.5 rounded-xl bg-[#0b0f19] border border-slate-800/80 hover:border-cyan-500/40 transition-colors relative flex flex-col justify-between group">
            <div>
              <div className="flex items-center justify-between font-mono font-bold text-xs uppercase text-white mb-2">
                <span className="flex items-center gap-1.5 text-cyan-400">
                  <Flame className="w-3.5 h-3.5 text-cyan-400" />
                  <span>3. STREAK &amp; RANK</span>
                </span>
                <span className="text-cyan-500/40 font-mono font-black text-sm group-hover:text-cyan-400 transition-colors">
                  03
                </span>
              </div>
              <p className="text-zinc-400 text-[11px] leading-relaxed">
                Rack up consecutive wins for NC streak multipliers and climb the seasonal MMR ladder.
              </p>
            </div>
            <div className="mt-3 pt-2 border-t border-white/[0.04] text-[10px] font-mono text-zinc-500">
              Elo &amp; Tier progression
            </div>
          </div>

          {/* Step 4 */}
          <div className="p-3.5 rounded-xl bg-[#0b0f19] border border-slate-800/80 hover:border-emerald-500/40 transition-colors relative flex flex-col justify-between group">
            <div>
              <div className="flex items-center justify-between font-mono font-bold text-xs uppercase text-white mb-2">
                <span className="flex items-center gap-1.5 text-emerald-400">
                  <Gift className="w-3.5 h-3.5 text-emerald-400" />
                  <span>4. REDEEM NC</span>
                </span>
                <span className="text-emerald-500/40 font-mono font-black text-sm group-hover:text-emerald-400 transition-colors">
                  04
                </span>
              </div>
              <p className="text-zinc-400 text-[11px] leading-relaxed">
                Spend your NC at the Nexus desk for free PC/console gaming hours, snacks, drinks, and tournaments.
              </p>
            </div>
            <div className="mt-3 pt-2 border-t border-white/[0.04] text-[10px] font-mono text-zinc-500">
              Desk loyalty redemptions
            </div>
          </div>
        </div>
      </div>

      {/* C. AVAILABLE GAMES & REWARDS (6 Supported Games) */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-600" />
            <h2 className="text-xs font-mono font-bold uppercase tracking-widest text-zinc-200">
              AVAILABLE GAMES &amp; REWARDS
            </h2>
          </div>
          <span className="text-[10px] sm:text-[11px] text-zinc-500 font-mono">
            Click any title to view authoritative reward rules &amp; format details
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-3">
          {PRIMARY_GAMES.map((card) => (
            <button
              key={card.id}
              onClick={() => {
                if (onSelect1v1Game && card.format === '1v1') {
                  onSelect1v1Game(card.id);
                } else {
                  handleGameCardClick(card);
                }
              }}
              className="group relative p-3.5 rounded-xl bg-gradient-to-b from-[#0e1320] to-[#070b13] border border-slate-800/90 hover:border-red-500/60 hover:from-[#131929] hover:to-[#0a0f1a] text-left flex flex-col justify-between h-32 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 overflow-hidden cursor-pointer shadow-sm transition-all duration-200"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-2xl group-hover:scale-110 transition-transform origin-left">
                    {card.icon}
                  </span>
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase tracking-wider bg-black/40 border border-white/10 text-zinc-400">
                    {card.format}
                  </span>
                </div>
                <h3 className="text-xs sm:text-sm font-black font-display tracking-tight text-white group-hover:text-red-400 transition-colors uppercase truncate">
                  {card.name}
                </h3>
                <p className="text-[10px] text-zinc-500 font-mono truncate mt-0.5">
                  {card.device}
                </p>
              </div>

              <div className="pt-2 border-t border-white/[0.05] flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold text-red-400 group-hover:text-red-300 transition-colors truncate">
                  {card.rewardTag}
                </span>
                <ChevronRight className="w-3.5 h-3.5 text-zinc-600 group-hover:text-white group-hover:translate-x-0.5 transition-all shrink-0" />
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* D. RECENT MATCH HISTORY RESULTS */}
      <section className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <h2 className="text-xs sm:text-sm font-mono font-bold uppercase tracking-widest text-zinc-200">
              RECENT MATCH HISTORY RESULTS
            </h2>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
            {['ALL', 'Chess', 'FC 26', 'FC 27', 'Valorant', 'CS2', 'League of Legends'].map((tab) => (
              <button
                key={tab}
                onClick={() => setHistoryGameFilter(tab)}
                className={`px-2.5 py-1 rounded-md text-[10px] font-mono font-bold uppercase transition-colors shrink-0 cursor-pointer ${
                  historyGameFilter === tab
                    ? 'bg-red-600 text-white shadow-sm'
                    : 'bg-[#0b0f19] text-zinc-400 hover:text-white border border-slate-800/80 hover:border-slate-700'
                }`}
              >
                {tab === 'League of Legends' ? 'LOL' : tab}
              </button>
            ))}
          </div>
        </div>

        {/* Matches Feed Container */}
        {user && filteredPlayerMatches.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredPlayerMatches.slice(0, 6).map((match) => {
              const currentUid = user.uid;
              const isWinner = match.winnerId === currentUid || (match.winningTeam && (
                match.winningTeam === 'teamA'
                  ? (match.teamAPlayerIds || []).includes(currentUid)
                  : (match.teamBPlayerIds || []).includes(currentUid)
              ));
              const isDraw = match.status === 'DRAW' || match.matchStatus === 'DRAW' || (match as any).isDraw;
              const outcome = isDraw ? 'DRAW' : isWinner ? 'WIN' : 'LOSS';
              const outcomeBadgeClass = isDraw
                ? 'bg-amber-950/70 border-amber-500/40 text-amber-400'
                : isWinner
                ? 'bg-emerald-950/70 border-emerald-500/40 text-emerald-400'
                : 'bg-red-950/70 border-red-500/40 text-red-400';

              const gameIcon = getGameIconForHistory(match.gameName || match.gameId);
              const opponentName = match.playerAId === currentUid
                ? match.playerBGamerTag || 'Opponent'
                : match.playerAGamerTag || 'Opponent';

              const ncReward = isWinner
                ? (match.coinsAwarded || 16)
                : isDraw
                ? Math.floor((match.coinsAwarded || 10) / 2)
                : 0;

              const mmrDelta = isWinner ? '+25 MMR' : isDraw ? '+5 MMR' : '-15 MMR';

              return (
                <div
                  key={match.id}
                  onClick={() => onSelectMatch(match.id)}
                  className="p-3.5 rounded-xl bg-[#0b0f19] border border-slate-800/90 hover:border-slate-700 transition-all duration-200 cursor-pointer shadow-sm hover:shadow-[0_0_15px_rgba(239,68,68,0.15)] flex flex-col justify-between space-y-2.5 group"
                >
                  <div className="flex items-center justify-between border-b border-white/[0.06] pb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-base shrink-0">{gameIcon}</span>
                      <span className="text-xs font-black font-display text-white uppercase tracking-tight truncate">
                        {match.gameName || 'Match'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={`px-2 py-0.5 rounded border text-[10px] font-mono font-bold uppercase tracking-wider ${outcomeBadgeClass}`}>
                        {outcome}
                      </span>
                    </div>
                  </div>

                  <div className="py-0.5 flex items-center justify-between text-xs">
                    <div className="min-w-0">
                      <p className="text-[10px] text-zinc-500 font-mono uppercase">VERSUS</p>
                      <p className="text-xs font-bold text-white truncate max-w-[150px]">
                        {opponentName}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-[10px] font-mono font-bold text-cyan-400">{mmrDelta}</p>
                      <p className="text-xs font-bold font-mono text-amber-400">+{ncReward} NC</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500 pt-1.5 border-t border-white/[0.06]">
                    <span className="flex items-center gap-1 text-emerald-400">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>VALIDATED</span>
                    </span>
                    <span>
                      {match.createdAt ? new Date(match.createdAt).toLocaleDateString() : 'Recent'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : filteredRecentResults.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredRecentResults.slice(0, 6).map((item) => {
              const gameIcon = getGameIconForHistory(item.gameName);
              const winnerGamerTag = item.winnerGamerTag;
              const isDraw = !winnerGamerTag || item.matchOutcome === 'draw';

              return (
                <div
                  key={item.id}
                  className="p-3.5 rounded-xl bg-[#0b0f19] border border-slate-800/90 hover:border-slate-700 transition-all duration-200 shadow-sm flex flex-col justify-between space-y-2.5"
                >
                  <div className="flex items-center justify-between border-b border-white/[0.06] pb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-base shrink-0">{gameIcon}</span>
                      <span className="text-xs font-black font-display text-white uppercase tracking-tight truncate">
                        {item.gameName}
                      </span>
                      {item.matchFormat && (
                        <span className="px-1.5 py-0.2 rounded bg-black/50 border border-white/10 text-zinc-400 text-[9px] font-mono font-bold shrink-0">
                          {item.matchFormat}
                        </span>
                      )}
                    </div>

                    <span className="px-2 py-0.5 rounded bg-emerald-950/70 border border-emerald-500/40 text-emerald-400 text-[10px] font-mono font-bold uppercase tracking-wider flex items-center gap-1 shrink-0">
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                      <span>VALIDATED</span>
                    </span>
                  </div>

                  <div className="py-0.5 flex items-center justify-between text-xs">
                    <div className="min-w-0 max-w-[65%]">
                      {item.matchFormat === '1v1' ? (
                        <div className="truncate text-xs">
                          <span className="text-white font-bold">{item.playerAGamerTag}</span>
                          <span className="text-zinc-500 mx-1">vs</span>
                          <span className="text-white font-bold">{item.playerBGamerTag}</span>
                        </div>
                      ) : (
                        <div className="text-xs text-white font-bold truncate">5v5 Squad Battle</div>
                      )}
                      <p className="text-[10px] font-mono text-emerald-400 mt-0.5 truncate">
                        {winnerGamerTag ? `Winner: ${winnerGamerTag}` : 'Series Draw'}
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <p className="text-xs font-bold font-mono text-amber-400">+{item.totalRewardAwarded} NC</p>
                      <p className="text-[10px] font-mono text-cyan-400">±25 MMR</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500 pt-1.5 border-t border-white/[0.06]">
                    <span className="truncate max-w-[60%]">Validated by {item.recordedByName || 'Staff'}</span>
                    <span className="shrink-0">{new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-8 text-center rounded-xl bg-[#090c14] border border-slate-800/80 space-y-2">
            <Trophy className="w-7 h-7 text-zinc-600 mx-auto" />
            <p className="text-xs font-bold text-white uppercase">No Recent Matches For This Filter</p>
            <p className="text-[11px] text-zinc-400 max-w-md mx-auto">
              Play a session at any station or console. Once completed, referee desk staff will record and validate your match result here.
            </p>
          </div>
        )}
      </section>

      {/* E. ACTIVE SQUAD LOBBIES */}
      <section className="space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-xs sm:text-sm font-mono font-bold text-white tracking-widest uppercase flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-600 shadow-[0_0_8px_rgba(239,68,68,0.7)]" />
              <span>ACTIVE SQUAD LOBBIES</span>
            </h2>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              Form 5v5 teams for CS2 &amp; Valorant LAN battles with real-time slot tracking.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            {/* Simple Filter */}
            <div className="flex items-center gap-1 bg-[#0a0d16] border border-slate-800/80 rounded-lg p-0.5">
              {['ALL', 'cs2', 'valorant'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setSelectedGameFilter(tab)}
                  className={`px-3 py-1 rounded-md text-[10px] sm:text-xs font-mono font-bold uppercase transition-colors cursor-pointer ${
                    selectedGameFilter === tab
                      ? 'bg-red-600 text-white shadow-sm'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {tab === 'ALL' ? 'ALL GAMES' : tab.toUpperCase()}
                </button>
              ))}
            </div>

            <button
              onClick={() => {
                if (!user) onOpenAuth?.('register');
                else onOpenCreate5v5Lobby();
              }}
              className="px-3.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-black text-xs uppercase tracking-wider transition-all inline-flex items-center gap-1.5 cursor-pointer shadow-[0_0_15px_rgba(239,68,68,0.35)] active:scale-95 shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>CREATE SQUAD LOBBY</span>
            </button>
          </div>
        </div>

        {openLobbies.length === 0 ? (
          <div className="p-8 sm:p-10 rounded-2xl bg-[#0b0f19] border border-slate-800/80 text-center space-y-3.5 shadow-xl">
            <div className="w-12 h-12 rounded-2xl bg-[#0e1424] border border-slate-800 flex items-center justify-center text-zinc-400 mx-auto shadow-sm">
              <Users className="w-6 h-6 text-cyan-400" />
            </div>
            <div>
              <p className="text-sm sm:text-base font-bold font-display text-white uppercase tracking-tight">
                No Open Squad Lobbies Right Now
              </p>
              <p className="text-xs text-zinc-400 mt-1 max-w-md mx-auto leading-relaxed">
                No teams currently looking for members. Create your own lobby to recruit teammates for 5v5 competitive matches in the arena!
              </p>
            </div>
            <button
              onClick={() => {
                if (!user) onOpenAuth?.('register');
                else onOpenCreate5v5Lobby();
              }}
              className="px-5 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-black text-xs uppercase tracking-wider transition-all inline-flex items-center gap-2 cursor-pointer shadow-[0_0_15px_rgba(239,68,68,0.35)] active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>CREATE SQUAD LOBBY</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
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
                  className="p-4 rounded-xl bg-[#0b0f19] border border-slate-800/90 hover:border-slate-700 flex flex-col justify-between gap-3.5 min-w-0 transition-all shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3 min-w-0">
                    <div className="min-w-0 flex-1">
                      {/* Game Name */}
                      <span className="text-[11px] font-mono font-bold uppercase text-red-500 tracking-wider">
                        {lobby.gameName || '5v5 TACTICAL'}
                      </span>
                      {/* Squad / Lobby Name */}
                      <h4 className="text-sm sm:text-base font-bold font-display text-white mt-0.5 truncate">
                        {squadName}
                      </h4>
                      {/* Station */}
                      <p className="text-[11px] text-zinc-400 font-mono mt-0.5 truncate">
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
                        <span className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-emerald-400">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                          <span>OPEN</span>
                        </span>
                      )}
                      <div className="text-xs font-mono text-zinc-400 mt-1">
                        <strong className="text-white">{totalJoined}</strong> / {maxCapacity}
                      </div>
                    </div>
                  </div>

                  {/* Bottom Action Row */}
                  <div className="pt-2.5 border-t border-white/[0.06] flex items-center justify-between gap-2">
                    <span className="text-[11px] text-zinc-400 font-mono">
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
                              className="px-3.5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider bg-zinc-900 text-zinc-400 hover:text-white hover:bg-zinc-800 border border-white/5 transition-all cursor-pointer"
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
                              className="px-3.5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider bg-zinc-900 border border-amber-500/30 text-amber-300 hover:bg-zinc-800 transition-all cursor-pointer flex items-center gap-1.5"
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
                            className="px-3.5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all bg-red-600 hover:bg-red-500 text-white cursor-pointer shadow-[0_0_12px_rgba(239,68,68,0.35)]"
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
                            className="px-3.5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider bg-zinc-900 border border-red-500/20 text-zinc-500 cursor-not-allowed opacity-75"
                            title="Account suspended or banned."
                          >
                            <span>SUSPENDED</span>
                          </button>
                        );
                      }

                      // 2. If currentUser.uid === lobby.ownerId: SHOW [ YOUR LOBBY ]
                      if (isLobbyOwner) {
                        return (
                          <button
                            id={`btn-open-owner-lobby-${lobby.lobbyCode || lobby.id}`}
                            onClick={() => onSelectMatch(lobby.id)}
                            className="px-3.5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all bg-emerald-500 hover:bg-emerald-400 text-black shadow-md cursor-pointer flex items-center gap-1.5 font-mono font-black"
                            title="You created and own this lobby. Click to open match room."
                          >
                            <Shield className="w-3.5 h-3.5 text-black" />
                            <span>YOUR LOBBY</span>
                          </button>
                        );
                      }

                      // 3. If currentUser.uid is already a member of Team A or Team B: SHOW [ IN LOBBY ]
                      if (isMemberOfTeamA || isMemberOfTeamB) {
                        return (
                          <button
                            id={`btn-in-lobby-${lobby.lobbyCode || lobby.id}`}
                            onClick={() => onSelectMatch(lobby.id)}
                            className="px-3.5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all bg-cyan-500 hover:bg-cyan-400 text-black shadow-md cursor-pointer flex items-center gap-1.5 font-mono font-black"
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
                            className="px-3.5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider bg-zinc-900 border border-white/5 text-zinc-500 cursor-not-allowed opacity-80"
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
                            className="px-3.5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider bg-zinc-900 text-zinc-400 hover:text-white hover:bg-zinc-800 border border-white/5 transition-all cursor-pointer"
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
                            className="px-3.5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider bg-zinc-900 border border-amber-500/30 text-amber-300 hover:bg-zinc-800 transition-all cursor-pointer flex items-center gap-1.5"
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
                          className="px-3.5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all bg-red-600 hover:bg-red-500 text-white cursor-pointer shadow-[0_0_12px_rgba(239,68,68,0.35)] flex items-center gap-1.5"
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
      </section>

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
