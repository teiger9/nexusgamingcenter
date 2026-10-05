import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { MatchHistoryRecord } from '../types';
import { subscribeToMatchHistory, formatRecentMatchDate } from '../services/matchHistoryService';
import { deriveMatchRewardsAndMMR } from '../services/matchRewardAnnouncementService';
import {
  Trophy,
  Swords,
  Search,
  CheckCircle2,
  Calendar,
  Clock,
  Shield,
  Coins,
  ChevronRight,
  Filter,
  X,
  Copy,
  Check,
  User,
  ExternalLink,
  Flame,
  ArrowUpDown,
} from 'lucide-react';

interface MatchHistoryViewProps {
  onSelectPlayerProfile?: (playerId: string) => void;
  defaultGameFilter?: string;
  initialPlayerId?: string;
}

const GAME_FILTERS = [
  { id: 'ALL', label: 'All', icon: '🎮' },
  { id: 'Chess', label: 'Chess', icon: '♟️' },
  { id: 'FC', label: 'FC', icon: '⚽' },
  { id: 'FC 26', label: 'FC 26', icon: '⚽' },
  { id: 'FC 27', label: 'FC 27', icon: '⚽' },
  { id: 'CS2', label: 'CS2', icon: '🔫' },
  { id: 'Valorant', label: 'Valorant', icon: '🎯' },
  { id: 'League of Legends', label: 'League of Legends', icon: '⚔️' },
];

export const MatchHistoryView: React.FC<MatchHistoryViewProps> = ({
  onSelectPlayerProfile,
  defaultGameFilter = 'ALL',
  initialPlayerId,
}) => {
  const { user, playerProfile } = useAuth();

  const [selectedGame, setSelectedGame] = useState<string>(defaultGameFilter);
  const [searchGamerTag, setSearchGamerTag] = useState<string>('');
  const [sortOrder, setSortOrder] = useState<'latest' | 'oldest'>('latest');
  const [onlyMyMatches, setOnlyMyMatches] = useState<boolean>(Boolean(initialPlayerId || false));
  const [pageLimit, setPageLimit] = useState<number>(24);
  const [matches, setMatches] = useState<MatchHistoryRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Detail Modal state
  const [selectedMatch, setSelectedMatch] = useState<MatchHistoryRecord | null>(null);
  const [copiedId, setCopiedId] = useState<boolean>(false);

  // Subscribe in real-time to match history
  useEffect(() => {
    setLoading(true);
    const unsub = subscribeToMatchHistory(
      {
        game: selectedGame,
        searchGamerTag,
        sortOrder,
        playerId: onlyMyMatches && user ? user.uid : initialPlayerId,
        limitCount: pageLimit,
      },
      (data) => {
        setMatches(data);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [selectedGame, searchGamerTag, sortOrder, onlyMyMatches, pageLimit, user, initialPlayerId]);

  const handleCopyMatchId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const getGameIcon = (game: string) => {
    const g = (game || '').toLowerCase();
    if (g.includes('chess')) return '♟️';
    if (g.includes('fc')) return '🎮';
    if (g.includes('cs')) return '🔫';
    if (g.includes('val')) return '🎯';
    if (g.includes('lol') || g.includes('league')) return '⚔️';
    return '🎮';
  };

  const formatDate = (timestamp: number) => {
    if (!timestamp) return 'Recent';
    const d = new Date(timestamp);
    const day = d.getDate();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[d.getMonth()];
    const year = d.getFullYear();
    const hours = d.getHours().toString().padStart(2, '0');
    const mins = d.getMinutes().toString().padStart(2, '0');
    return `${day} ${month} ${year} — ${hours}:${mins}`;
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-fadeIn">
      {/* Top Banner & Title */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-white/10 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full bg-red-600/20 text-red-400 border border-red-500/30 text-[10px] font-mono font-bold uppercase tracking-widest flex items-center gap-1.5">
              <CheckCircle2 className="w-3 h-3 text-red-400" />
              <span>Official Gaming Center Ledger</span>
            </span>
            <span className="text-xs font-mono text-neutral-500">• Permanent Immutable Records</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black font-display tracking-tight text-white uppercase flex items-center gap-3">
            <span>Match</span>
            <span className="text-red-500">History</span>
          </h1>
          <p className="text-sm text-neutral-400 mt-1 max-w-2xl">
            Verified competitive matches played at Nexus Gaming Center. All outcomes validated by staff &amp; referees with authoritative NC wallet rewards.
          </p>
        </div>

        {/* Quick Search & "My Matches" Toggle */}
        <div className="flex flex-wrap items-center gap-3">
          {user && (
            <button
              onClick={() => setOnlyMyMatches(!onlyMyMatches)}
              className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer border ${
                onlyMyMatches
                  ? 'bg-red-600 text-white border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.4)]'
                  : 'bg-neutral-900/80 text-neutral-300 border-white/10 hover:border-neutral-700 hover:text-white'
              }`}
            >
              <User className="w-3.5 h-3.5" />
              <span>{onlyMyMatches ? 'Showing My Matches' : 'My Matches'}</span>
            </button>
          )}

          {/* Latest vs Oldest Sort Toggle */}
          <div className="flex items-center gap-1 bg-neutral-900/90 border border-white/10 rounded-xl p-1 text-xs font-mono font-bold">
            <button
              onClick={() => setSortOrder('latest')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                sortOrder === 'latest'
                  ? 'bg-red-600 text-white shadow-sm'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              Latest
            </button>
            <button
              onClick={() => setSortOrder('oldest')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                sortOrder === 'oldest'
                  ? 'bg-red-600 text-white shadow-sm'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              Oldest
            </button>
          </div>

          <div className="relative min-w-[220px]">
            <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search by GamerTag..."
              value={searchGamerTag}
              onChange={(e) => setSearchGamerTag(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-neutral-900/90 border border-white/10 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-red-500"
            />
            {searchGamerTag && (
              <button
                onClick={() => setSearchGamerTag('')}
                className="absolute right-2.5 top-2.5 text-neutral-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Filter Tabs (Horizontal Scrollable) */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin">
        {GAME_FILTERS.map((f) => {
          const isSelected = selectedGame === f.id;
          return (
            <button
              key={f.id}
              onClick={() => setSelectedGame(f.id)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-all flex items-center gap-2 cursor-pointer border ${
                isSelected
                  ? 'bg-neutral-900 text-white border-red-600 shadow-[0_0_10px_rgba(239,68,68,0.3)] font-black'
                  : 'bg-neutral-950/70 text-neutral-400 border-white/5 hover:border-white/20 hover:text-white hover:bg-neutral-900/50'
              }`}
            >
              <span>{f.icon}</span>
              <span>{f.label}</span>
            </button>
          );
        })}
      </div>

      {/* Match Cards Grid (Gaming-center aesthetic, not raw database table) */}
      {loading ? (
        <div className="p-16 text-center text-neutral-400 space-y-3">
          <div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs font-mono">Loading validated match records...</p>
        </div>
      ) : matches.length === 0 ? (
        <div className="p-16 text-center rounded-2xl bg-neutral-950 border border-white/10 space-y-3">
          <Trophy className="w-10 h-10 text-neutral-600 mx-auto" />
          <h3 className="text-base font-bold text-white uppercase">No Match Records Found</h3>
          <p className="text-xs text-neutral-400 max-w-sm mx-auto">
            {onlyMyMatches
              ? "You haven't participated in any validated matches for this filter yet."
              : 'No matches match your current game or GamerTag filter.'}
          </p>
          {(selectedGame !== 'ALL' || searchGamerTag || onlyMyMatches) && (
            <button
              onClick={() => {
                setSelectedGame('ALL');
                setSearchGamerTag('');
                setOnlyMyMatches(false);
              }}
              className="px-4 py-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-bold uppercase tracking-wider transition-all"
            >
              Reset Filters
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {matches.map((m) => {
            const is5v5 = m.is5v5 || m.gameMode === '5v5';
            const isDraw = m.winnerId === 'DRAW' || m.winnerGamerTag === 'DRAW';
            const p1IsWinner = !isDraw && m.winnerId === m.player1Id;
            const p2IsWinner = !isDraw && m.winnerId === m.player2Id;
            const gameIcon = getGameIcon(m.game);
            const currentUid = user?.uid;

            // 5v5 specific helpers
            const isTeamAWinner = is5v5 && (m.teamOutcome === 'teamA' || m.winnerTeamId === m.teamAId || m.winnerId === m.teamAId);
            const isTeamBWinner = is5v5 && (m.teamOutcome === 'teamB' || m.winnerTeamId === m.teamBId || m.winnerId === m.teamBId);
            const tAName = m.teamAName || m.player1GamerTag || 'Team Alpha';
            const tATag = m.teamATag || 'ALP';
            const tBName = m.teamBName || m.player2GamerTag || 'Team Omega';
            const tBTag = m.teamBTag || 'OMG';
            const userOnTeamA = is5v5 && currentUid ? (m.teamAPlayerIds?.includes(currentUid) ?? false) : false;
            const userOnTeamB = is5v5 && currentUid ? (m.teamBPlayerIds?.includes(currentUid) ?? false) : false;

            return (
              <div
                key={m.matchId || m.id}
                onClick={() => setSelectedMatch(m)}
                className="group relative p-5 rounded-2xl bg-gradient-to-b from-neutral-950 to-[#0a0a0f] border border-white/10 hover:border-red-500/60 transition-all duration-200 cursor-pointer shadow-lg hover:shadow-[0_0_25px_rgba(239,68,68,0.2)] flex flex-col justify-between space-y-4"
              >
                {/* Header: Game Icon & Game Name + Validated Badge */}
                <div className="flex items-center justify-between border-b border-white/5 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl group-hover:scale-110 transition-transform">{gameIcon}</span>
                    <div>
                      <span className="text-sm font-black font-display text-white uppercase tracking-tight block">
                        {m.game}
                      </span>
                      <span className="text-[10px] font-mono text-cyan-400 font-bold uppercase">
                        {is5v5 ? '5v5 Team Match' : (m.gameMode || '1v1 Match')}
                      </span>
                    </div>
                  </div>

                  <span className="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-mono font-bold uppercase tracking-wider flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>VALIDATED</span>
                  </span>
                </div>

                {/* Match Opponents & Score */}
                {is5v5 ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <div className="flex items-center gap-1.5 truncate max-w-[45%]">
                        <span className={`font-bold truncate ${userOnTeamA ? 'text-cyan-400' : 'text-neutral-300'}`}>
                          {tAName} [{tATag}]
                        </span>
                        {userOnTeamA && <span className="text-[9px] px-1 bg-cyan-950 border border-cyan-500/40 text-cyan-300 rounded font-black">YOU</span>}
                      </div>
                      <span className="text-neutral-600 font-bold uppercase text-[10px]">vs</span>
                      <div className="flex items-center gap-1.5 justify-end truncate max-w-[45%]">
                        {userOnTeamB && <span className="text-[9px] px-1 bg-cyan-950 border border-cyan-500/40 text-cyan-300 rounded font-black">YOU</span>}
                        <span className={`font-bold truncate ${userOnTeamB ? 'text-cyan-400' : 'text-neutral-300'}`}>
                          {tBName} [{tBTag}]
                        </span>
                      </div>
                    </div>

                    {/* Result Banner */}
                    <div className="p-3 rounded-xl bg-neutral-900/80 border border-white/5 space-y-2">
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="text-neutral-400 uppercase text-[10px] font-bold">RESULT</span>
                        <span className={`font-black uppercase text-xs ${
                          isDraw ? 'text-amber-400' : isTeamAWinner ? 'text-emerald-400' : 'text-cyan-400'
                        }`}>
                          {isDraw ? 'DRAW' : isTeamAWinner ? `${tAName} — WIN` : `${tBName} — WIN`}
                        </span>
                      </div>

                      {/* Team MMR changes */}
                      {(m.teamARatingBefore !== undefined || m.teamAMMRChange !== undefined) && (
                        <div className="pt-2 border-t border-white/5 grid grid-cols-2 gap-2 text-[11px] font-mono">
                          <div>
                            <span className="text-neutral-400 block text-[9px] uppercase font-bold">{tAName} MMR</span>
                            <div className="flex items-center gap-1 text-white font-bold">
                              <span>{m.teamARatingBefore ?? 1000} → {m.teamARatingAfter ?? (1000 + (m.teamAMMRChange ?? 0))}</span>
                              <span className={(m.teamAMMRChange ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                                ({(m.teamAMMRChange ?? 0) >= 0 ? `+${m.teamAMMRChange}` : m.teamAMMRChange})
                              </span>
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="text-neutral-400 block text-[9px] uppercase font-bold">{tBName} MMR</span>
                            <div className="flex items-center gap-1 justify-end text-white font-bold">
                              <span>{m.teamBRatingBefore ?? 1000} → {m.teamBRatingAfter ?? (1000 + (m.teamBMMRChange ?? 0))}</span>
                              <span className={(m.teamBMMRChange ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                                ({(m.teamBMMRChange ?? 0) >= 0 ? `+${m.teamBMMRChange}` : m.teamBMMRChange})
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-neutral-400 font-bold truncate max-w-[45%]">
                        {m.player1GamerTag}
                      </span>
                      <span className="text-neutral-600 font-bold uppercase text-[10px]">vs</span>
                      <span className="text-neutral-400 font-bold truncate max-w-[45%] text-right">
                        {m.player2GamerTag}
                      </span>
                    </div>

                    {/* Main Score Line */}
                    <div className="p-3 rounded-xl bg-neutral-900/80 border border-white/5 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`text-base font-black font-mono ${p1IsWinner ? 'text-emerald-400' : 'text-white'}`}>
                          {m.player1GamerTag}
                        </span>
                        <span className="text-lg font-black text-amber-400 font-mono">
                          {m.player1Wins} — {m.player2Wins}
                        </span>
                        <span className={`text-base font-black font-mono ${p2IsWinner ? 'text-emerald-400' : 'text-white'}`}>
                          {m.player2GamerTag}
                        </span>
                      </div>

                      {isDraw && (
                        <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold text-[10px] uppercase font-mono">
                          Draw
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Authoritative Winner & NC Reward Display with MMR Connection */}
                <div className="p-3 rounded-xl bg-neutral-950/90 border border-white/5 space-y-1.5 text-xs font-mono">
                  {(() => {
                    const cardAuth = deriveMatchRewardsAndMMR(m);
                    if (cardAuth.isDraw) {
                      return (
                        <div className="flex items-center justify-between">
                          <span className="text-amber-300 font-bold flex items-center gap-1.5">
                            <span>🤝</span>
                            <span>Draw</span>
                          </span>
                          <div className="text-right">
                            <span className="text-amber-400 font-black">
                              +{cardAuth.drawRewardPerPlayer} NC {cardAuth.is5v5 ? '/ player' : 'each'}
                            </span>
                            {cardAuth.is5v5 && (
                              <div className="text-[10px] text-neutral-500">
                                {cardAuth.drawTeamTotalReward} NC team total each
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    }
                    return (
                      <>
                        <div className="flex items-center justify-between">
                          <span className="text-white font-bold flex items-center gap-1.5">
                            <span className="text-amber-400">🏆</span>
                            <span>Winner: <strong className="text-emerald-400">{cardAuth.winnerTitle}</strong></span>
                          </span>
                          <span className="text-amber-400 font-black text-sm">
                            +{cardAuth.winnerRewardPerPlayer} NC{cardAuth.is5v5 ? ' / player' : ''}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-neutral-400 pt-1 border-t border-neutral-900">
                          <span>Loser Reward:</span>
                          <span className="font-bold text-amber-500/80">+{cardAuth.loserRewardPerPlayer} NC{cardAuth.is5v5 ? ' / player' : ''}</span>
                        </div>
                        {cardAuth.is5v5 && (
                          <div className="text-[10px] text-neutral-500 text-right pt-0.5">
                            Squad Pool: {cardAuth.winnerTeamTotalReward} NC winner • {cardAuth.loserTeamTotalReward} NC loser
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>

                {/* Footer: Validated By & Date */}
                <div className="flex items-center justify-between text-[10px] font-mono text-neutral-400 pt-2 border-t border-white/5">
                  <span className="flex items-center gap-1 text-neutral-300">
                    <Shield className="w-3 h-3 text-red-400" />
                    <span>Validated by {m.validatedByRole || 'Staff'}</span>
                  </span>
                  <span>{formatDate(m.validatedAt || m.createdAt)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination / Load More */}
      {matches.length >= pageLimit && (
        <div className="text-center pt-4">
          <button
            onClick={() => setPageLimit(pageLimit + 24)}
            className="px-6 py-2.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-white/10 text-white text-xs font-bold uppercase tracking-wider transition-all cursor-pointer hover:border-red-500"
          >
            Load More Matches
          </button>
        </div>
      )}

      {/* ========================================================
          MATCH DETAILS MODAL
          ======================================================== */}
      {selectedMatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md overflow-y-auto animate-fadeIn">
          <div className="relative w-full max-w-lg bg-[#0d0d14] border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 my-8">
            <button
              onClick={() => setSelectedMatch(null)}
              className="absolute top-5 right-5 text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-neutral-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Modal Header */}
            <div className="flex items-center gap-3.5 border-b border-white/10 pb-5">
              <div className="w-14 h-14 rounded-2xl bg-neutral-900 border border-white/10 flex items-center justify-center text-3xl shrink-0">
                {getGameIcon(selectedMatch.game)}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-mono font-bold uppercase">
                    STATUS: VALIDATED
                  </span>
                  <span className="text-xs font-mono text-neutral-400">{selectedMatch.gameMode || '1v1'}</span>
                </div>
                <h2 className="text-2xl font-black font-display text-white uppercase mt-1">
                  {selectedMatch.game} Match Record
                </h2>
              </div>
            </div>

            {/* Opponents Dossier Comparison */}
            {selectedMatch.is5v5 || selectedMatch.gameMode === '5v5' ? (
              <div className="space-y-4 font-mono text-xs">
                {/* 5v5 Team Alpha vs Team Omega */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Team A Roster */}
                  <div className="p-4 rounded-2xl bg-neutral-950 border border-white/5 space-y-2.5">
                    <div className="flex items-center justify-between border-b border-neutral-900 pb-2">
                      <div>
                        <span className="text-[10px] text-red-400 uppercase font-black block">Team A</span>
                        <span className="text-sm font-black text-white">
                          {selectedMatch.teamAName || selectedMatch.player1GamerTag} [{selectedMatch.teamATag || 'ALP'}]
                        </span>
                      </div>
                      <span className="px-2 py-0.5 rounded bg-neutral-900 text-neutral-400 text-[10px] font-bold">
                        5 Players
                      </span>
                    </div>

                    {/* Member List */}
                    <div className="space-y-1 pt-1">
                      {selectedMatch.teamAPlayers && selectedMatch.teamAPlayers.length > 0 ? (
                        selectedMatch.teamAPlayers.map((p, idx) => {
                          const isYou = user?.uid && p.uid === user.uid;
                          return (
                            <div key={p.uid || idx} className={`flex items-center justify-between p-1.5 rounded ${isYou ? 'bg-cyan-950/80 border border-cyan-500/40 text-cyan-300 font-bold' : 'text-neutral-300'}`}>
                              <span className="truncate">{p.gamerTag}</span>
                              {isYou && <span className="text-[9px] font-black uppercase text-cyan-400">YOU</span>}
                            </div>
                          );
                        })
                      ) : selectedMatch.teamAPlayerGamerTags && selectedMatch.teamAPlayerGamerTags.length > 0 ? (
                        selectedMatch.teamAPlayerGamerTags.map((tag, idx) => (
                          <div key={idx} className="p-1.5 rounded text-neutral-300">
                            {tag}
                          </div>
                        ))
                      ) : (
                        <div className="text-neutral-400">{selectedMatch.player1GamerTag} (Roster)</div>
                      )}
                    </div>
                  </div>

                  {/* Team B Roster */}
                  <div className="p-4 rounded-2xl bg-neutral-950 border border-white/5 space-y-2.5">
                    <div className="flex items-center justify-between border-b border-neutral-900 pb-2">
                      <div>
                        <span className="text-[10px] text-cyan-400 uppercase font-black block">Team B</span>
                        <span className="text-sm font-black text-white">
                          {selectedMatch.teamBName || selectedMatch.player2GamerTag} [{selectedMatch.teamBTag || 'OMG'}]
                        </span>
                      </div>
                      <span className="px-2 py-0.5 rounded bg-neutral-900 text-neutral-400 text-[10px] font-bold">
                        5 Players
                      </span>
                    </div>

                    {/* Member List */}
                    <div className="space-y-1 pt-1">
                      {selectedMatch.teamBPlayers && selectedMatch.teamBPlayers.length > 0 ? (
                        selectedMatch.teamBPlayers.map((p, idx) => {
                          const isYou = user?.uid && p.uid === user.uid;
                          return (
                            <div key={p.uid || idx} className={`flex items-center justify-between p-1.5 rounded ${isYou ? 'bg-cyan-950/80 border border-cyan-500/40 text-cyan-300 font-bold' : 'text-neutral-300'}`}>
                              <span className="truncate">{p.gamerTag}</span>
                              {isYou && <span className="text-[9px] font-black uppercase text-cyan-400">YOU</span>}
                            </div>
                          );
                        })
                      ) : selectedMatch.teamBPlayerGamerTags && selectedMatch.teamBPlayerGamerTags.length > 0 ? (
                        selectedMatch.teamBPlayerGamerTags.map((tag, idx) => (
                          <div key={idx} className="p-1.5 rounded text-neutral-300">
                            {tag}
                          </div>
                        ))
                      ) : (
                        <div className="text-neutral-400">{selectedMatch.player2GamerTag} (Roster)</div>
                      )}
                    </div>
                  </div>
                </div>

                {/* RESULT BANNER */}
                <div className="p-4 rounded-2xl bg-neutral-900/80 border border-white/10 text-center space-y-2">
                  <span className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider">RESULT</span>
                  <div className="text-lg font-black text-white">
                    {selectedMatch.winnerId === 'DRAW'
                      ? 'MATCH DRAW'
                      : selectedMatch.outcome === 'teamA' || selectedMatch.winnerTeamId === selectedMatch.teamAId || selectedMatch.winnerId === selectedMatch.teamAId
                      ? `${selectedMatch.teamAName || selectedMatch.player1GamerTag} — WIN`
                      : `${selectedMatch.teamBName || selectedMatch.player2GamerTag} — WIN`}
                  </div>
                </div>

                {/* TEAM MMR COMPARISON */}
                <div className="p-4 rounded-2xl bg-neutral-950 border border-white/5 space-y-3">
                  <span className="text-[10px] text-neutral-400 uppercase font-black block tracking-wider">
                    TEAM MMR DYNAMICS
                  </span>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 rounded-xl bg-neutral-900/60 border border-neutral-800">
                      <span className="text-[10px] text-neutral-400 block font-bold truncate">
                        {selectedMatch.teamAName || 'Team Alpha'}
                      </span>
                      <div className="text-sm font-bold text-white mt-1">
                        {selectedMatch.teamARatingBefore ?? 1000} → {selectedMatch.teamARatingAfter ?? (1000 + (selectedMatch.teamAMMRChange ?? 0))}
                      </div>
                      <div className={`text-xs font-black mt-0.5 ${(selectedMatch.teamAMMRChange ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {(selectedMatch.teamAMMRChange ?? 0) >= 0 ? `+${selectedMatch.teamAMMRChange}` : selectedMatch.teamAMMRChange} MMR
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-neutral-900/60 border border-neutral-800 text-right">
                      <span className="text-[10px] text-neutral-400 block font-bold truncate">
                        {selectedMatch.teamBName || 'Team Omega'}
                      </span>
                      <div className="text-sm font-bold text-white mt-1">
                        {selectedMatch.teamBRatingBefore ?? 1000} → {selectedMatch.teamBRatingAfter ?? (1000 + (selectedMatch.teamBMMRChange ?? 0))}
                      </div>
                      <div className={`text-xs font-black mt-0.5 ${(selectedMatch.teamBMMRChange ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {(selectedMatch.teamBMMRChange ?? 0) >= 0 ? `+${selectedMatch.teamBMMRChange}` : selectedMatch.teamBMMRChange} MMR
                      </div>
                    </div>
                  </div>
                </div>

                {/* REWARD BREAKDOWN */}
                {(() => {
                  const modalAuth = deriveMatchRewardsAndMMR(selectedMatch);
                  return (
                    <div className="p-4 rounded-2xl bg-neutral-950 border border-white/5 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs uppercase font-bold text-neutral-300">Authoritative Match Rewards</span>
                        <div className="text-right">
                          {modalAuth.isDraw ? (
                            <span className="text-amber-400 font-black text-sm">
                              🤝 +{modalAuth.drawRewardPerPlayer} NC / player
                            </span>
                          ) : (
                            <>
                              <span className="text-amber-400 font-black text-sm block">
                                🏆 +{modalAuth.winnerRewardPerPlayer} NC / player ({modalAuth.winnerTeamTotalReward} NC squad total)
                              </span>
                              <span className="text-neutral-500 block text-[10px]">
                                ❌ +{modalAuth.loserRewardPerPlayer} NC / player ({modalAuth.loserTeamTotalReward} NC squad total)
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="text-[11px] text-slate-400 border-t border-neutral-900 pt-1.5">
                        {modalAuth.rewardBreakdown}
                      </div>
                    </div>
                  );
                })()}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                {(() => {
                  const modalAuth = deriveMatchRewardsAndMMR(selectedMatch);
                  return (
                    <>
                      {/* Player 1 */}
                      <div className="p-4 rounded-2xl bg-neutral-950 border border-white/5 space-y-2">
                        <span className="text-[10px] text-red-400 uppercase font-bold block">Player 1</span>
                        <div className="text-base font-black text-white truncate">{selectedMatch.player1GamerTag}</div>
                        {selectedMatch.player1FullName && selectedMatch.player1FullName !== selectedMatch.player1GamerTag && (
                          <div className="text-[11px] text-neutral-400">{selectedMatch.player1FullName}</div>
                        )}
                        <div className="pt-2 border-t border-neutral-900 flex justify-between items-center text-sm">
                          <span className="text-neutral-400">Wins:</span>
                          <span className="font-bold text-white">{selectedMatch.player1Wins}</span>
                        </div>
                        {modalAuth.player1MMRChange !== undefined && (
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-neutral-400">MMR Change:</span>
                            <span className={`font-bold ${modalAuth.player1MMRChange >= 0 ? 'text-cyan-400' : 'text-red-400'}`}>
                              {modalAuth.player1MMRChange >= 0 ? `+${modalAuth.player1MMRChange}` : modalAuth.player1MMRChange}
                            </span>
                          </div>
                        )}
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-neutral-400">Reward:</span>
                          <span className="font-bold text-amber-400">
                            +{modalAuth.teamARewardPerPlayer} NC
                          </span>
                        </div>
                      </div>

                      {/* Player 2 */}
                      <div className="p-4 rounded-2xl bg-neutral-950 border border-white/5 space-y-2">
                        <span className="text-[10px] text-cyan-400 uppercase font-bold block">Player 2</span>
                        <div className="text-base font-black text-white truncate">{selectedMatch.player2GamerTag}</div>
                        {selectedMatch.player2FullName && selectedMatch.player2FullName !== selectedMatch.player2GamerTag && (
                          <div className="text-[11px] text-neutral-400">{selectedMatch.player2FullName}</div>
                        )}
                        <div className="pt-2 border-t border-neutral-900 flex justify-between items-center text-sm">
                          <span className="text-neutral-400">Wins:</span>
                          <span className="font-bold text-white">{selectedMatch.player2Wins}</span>
                        </div>
                        {modalAuth.player2MMRChange !== undefined && (
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-neutral-400">MMR Change:</span>
                            <span className={`font-bold ${modalAuth.player2MMRChange >= 0 ? 'text-cyan-400' : 'text-red-400'}`}>
                              {modalAuth.player2MMRChange >= 0 ? `+${modalAuth.player2MMRChange}` : modalAuth.player2MMRChange}
                            </span>
                          </div>
                        )}
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-neutral-400">Reward:</span>
                          <span className="font-bold text-amber-400">
                            +{modalAuth.teamBRewardPerPlayer} NC
                          </span>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            )}

            {/* Score & Winner Banner */}
            <div className="p-4 rounded-2xl bg-neutral-900/80 border border-white/10 space-y-3 font-mono text-center">
              <div className="text-xs uppercase text-neutral-400 font-bold">Official Match Outcome</div>
              <div className="text-3xl font-black text-white tracking-wide">
                {selectedMatch.player1Wins} — {selectedMatch.player2Wins}
              </div>
              {(() => {
                const modalAuth = deriveMatchRewardsAndMMR(selectedMatch);
                return (
                  <>
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold uppercase">
                      <Trophy className="w-3.5 h-3.5 text-amber-400" />
                      <span>
                        {modalAuth.isDraw
                          ? 'SERIES DRAW'
                          : `WINNER: ${modalAuth.winnerTitle}`}
                      </span>
                    </div>
                    <div className="text-xs text-slate-300 font-mono mt-1">
                      {modalAuth.rewardBreakdown}
                    </div>
                  </>
                );
              })()}
            </div>

            {/* Metadata Ledger */}
            <div className="space-y-2 text-xs font-mono p-4 rounded-2xl bg-neutral-950 border border-white/5">
              <div className="flex justify-between text-neutral-400">
                <span>Validator:</span>
                <span className="text-white font-bold">
                  {selectedMatch.validatedByName || selectedMatch.validatedByRole || 'Staff'} ({selectedMatch.validatedByRole})
                </span>
              </div>
              <div className="flex justify-between text-neutral-400">
                <span>Validation Date/Time:</span>
                <span className="text-white">{formatDate(selectedMatch.validatedAt || selectedMatch.createdAt)}</span>
              </div>
              <div className="flex justify-between items-center text-neutral-400 pt-2 border-t border-neutral-900">
                <span>Match ID:</span>
                <button
                  onClick={() => handleCopyMatchId(selectedMatch.matchId || selectedMatch.id || '')}
                  className="flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300 font-bold"
                >
                  <span className="truncate max-w-[200px]">{selectedMatch.matchId || selectedMatch.id}</span>
                  {copiedId ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                </button>
              </div>
            </div>

            <div className="text-center pt-2">
              <button
                onClick={() => setSelectedMatch(null)}
                className="w-full py-3 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-bold uppercase tracking-wider transition-all"
              >
                Close Record
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
