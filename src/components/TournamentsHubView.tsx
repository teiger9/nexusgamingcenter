import React, { useState, useEffect } from 'react';
import { Tournament } from '../types';
import { useBackHandler } from '../context/NavigationContext';
import {
  subscribeToAllTournaments,
  subscribeToCompletedTournaments,
} from '../services/tournamentService';
import { TournamentChampionsShowcase } from './TournamentChampionsShowcase';
import { TournamentBracketView } from './TournamentBracketView';
import { useAuth } from '../context/AuthContext';
import {
  Trophy,
  Crown,
  Calendar,
  Users,
  Gamepad2,
  Sparkles,
  ArrowRight,
  Plus,
  Search,
  Filter,
  Flame,
  Shield,
} from 'lucide-react';

interface TournamentsHubViewProps {
  onOpenAuth: (mode?: 'login' | 'register') => void;
  onNavigateToAdminTournaments?: () => void;
  onSelectParticipant?: (id: string, type: 'PLAYER' | 'TEAM') => void;
  initialTournamentId?: string;
}

export const TournamentsHubView: React.FC<TournamentsHubViewProps> = ({
  onOpenAuth,
  onNavigateToAdminTournaments,
  onSelectParticipant,
  initialTournamentId,
}) => {
  const { user, isAdmin } = useAuth();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [completedTournaments, setCompletedTournaments] = useState<Tournament[]>([]);
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState(true);

  // Android Back Handler for tournament detail view -> return to Tournaments list
  useBackHandler({
    id: 'tournaments-detail-view',
    active: !!selectedTournament,
    onBack: () => setSelectedTournament(null),
    priority: 15,
  });

  // Auto-select initialTournamentId when provided
  useEffect(() => {
    if (initialTournamentId && tournaments.length > 0) {
      const found = tournaments.find((t) => t.id === initialTournamentId);
      if (found) {
        setSelectedTournament(found);
      }
    }
  }, [initialTournamentId, tournaments]);

  // Filters
  const [filterGame, setFilterGame] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  useEffect(() => {
    const unsubAll = subscribeToAllTournaments((list) => {
      setTournaments(list);
      setLoading(false);

      if (selectedTournament) {
        const found = list.find((t) => t.id === selectedTournament.id);
        if (found) setSelectedTournament(found);
      }
    });

    const unsubComp = subscribeToCompletedTournaments((comp) => {
      setCompletedTournaments(comp);
    });

    return () => {
      unsubAll();
      unsubComp();
    };
  }, [selectedTournament?.id]);

  const filteredTournaments = tournaments.filter((t) => {
    const matchGame =
      filterGame === 'all' ||
      (() => {
        const fg = filterGame.toLowerCase();
        const gid = (t.gameId || '').toLowerCase();
        const gname = (t.gameName || '').toLowerCase();
        if (fg === 'cs2') return gid.includes('cs') || gname.includes('cs') || gname.includes('counter');
        if (fg === 'valorant') return gid.includes('val') || gname.includes('valorant');
        if (fg === 'chess') return gid.includes('chess') || gname.includes('chess');
        if (fg === 'fc') return gid.includes('fc') || gname.includes('fc') || gname.includes('fifa');
        return gid === fg || gname.includes(fg);
      })();

    const matchType = filterType === 'all' || t.type === filterType;
    const matchSearch =
      !searchQuery.trim() ||
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.gameName.toLowerCase().includes(searchQuery.toLowerCase());
    return matchGame && matchType && matchSearch;
  });

  // If a tournament bracket view is active
  if (selectedTournament) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <TournamentBracketView
          tournament={selectedTournament}
          onBack={() => setSelectedTournament(null)}
          onOpenAuth={onOpenAuth}
          onSelectParticipant={onSelectParticipant}
        />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-10 animate-in fade-in">
      {/* Prominent Hall of Champions Showcase at the top */}
      <TournamentChampionsShowcase
        champions={completedTournaments}
        onSelectTournament={(tId) => {
          const found = tournaments.find((t) => t.id === tId);
          if (found) setSelectedTournament(found);
        }}
        onSelectParticipant={onSelectParticipant}
      />

      {/* Main Tournaments Header & Description */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 border-b border-white/[0.08] pb-5">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-1.5 text-cyan-400 font-mono text-xs font-bold uppercase tracking-widest">
            <span className="text-cyan-400">🌐</span>
            <span>NEXUS ESPORTS ARENA</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black font-display tracking-tight text-white uppercase">
            COMPETITIVE TOURNAMENTS
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400 font-sans max-w-3xl leading-relaxed">
            Register for sanctioned 1v1 and 5v5 tournaments across Valorant, CS2, Chess, and EA Sports FC 25/26. Track brackets, battle for prizes, and earn permanent crowns.
          </p>
        </div>

        {isAdmin && onNavigateToAdminTournaments && (
          <button
            onClick={onNavigateToAdminTournaments}
            className="px-4 py-2.5 rounded-xl bg-red-950/40 hover:bg-red-900/60 border border-red-500/50 hover:border-red-400 text-red-400 hover:text-white font-mono font-bold text-xs uppercase tracking-wider transition-all shadow-[0_0_15px_rgba(239,68,68,0.2)] flex items-center gap-2 shrink-0 self-start md:self-auto cursor-pointer"
          >
            <Shield className="w-4 h-4 text-red-400" />
            <span>Admin Tournament Hub</span>
          </button>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-[#0b0f19] p-3 rounded-xl border border-slate-800/90 flex flex-col md:flex-row items-center justify-between gap-3 shadow-md">
        <div className="relative w-full md:flex-1">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search tournaments..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-transparent text-xs text-white placeholder:text-zinc-500 font-mono focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2.5 w-full md:w-auto">
          {/* Game selector */}
          <select
            value={filterGame}
            onChange={(e) => setFilterGame(e.target.value)}
            className="px-3 py-2 bg-[#0e1320] border border-slate-700/80 rounded-lg text-xs font-mono text-zinc-300 focus:outline-none focus:border-cyan-500 cursor-pointer flex-1 md:flex-none"
          >
            <option value="all">All Game Titles</option>
            <option value="cs2">Counter-Strike 2</option>
            <option value="valorant">Valorant</option>
            <option value="chess">Chess</option>
            <option value="fc">EA Sports FC 25</option>
          </select>

          {/* Type selector */}
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-3 py-2 bg-[#0e1320] border border-slate-700/80 rounded-lg text-xs font-mono text-zinc-300 focus:outline-none focus:border-cyan-500 cursor-pointer flex-1 md:flex-none"
          >
            <option value="all">All Match Formats</option>
            <option value="INDIVIDUAL">1v1 Format</option>
            <option value="TEAM">5v5 Squads</option>
          </select>
        </div>
      </div>

      {/* Tournaments Grid */}
      {loading ? (
        <div className="py-20 text-center text-zinc-400 font-mono text-xs">
          Loading tournaments...
        </div>
      ) : filteredTournaments.length === 0 ? (
        <div className="p-16 rounded-2xl bg-[#0b0f19] border border-slate-800/90 text-center space-y-3">
          <Trophy className="w-10 h-10 text-zinc-600 mx-auto" />
          <h3 className="text-base font-bold text-white font-display uppercase tracking-wider">
            No Tournaments Match Your Filter
          </h3>
          <p className="text-xs text-zinc-400 font-mono max-w-sm mx-auto">
            Try adjusting your search query or selecting &quot;All Game Titles&quot;.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredTournaments.map((t) => {
            const isRegOpen = t.status === 'REGISTRATION_OPEN';
            const isLive = t.status === 'LIVE';
            const isCompleted = t.status === 'COMPLETED';
            const isCancelled = t.status === 'CANCELLED';
            const isUpcoming = t.status === 'UPCOMING' || t.status === 'REGISTRATION_CLOSED' || t.status === 'DRAFT';

            // Game Badge theme mapping
            const gLower = (t.gameId || t.gameName || '').toLowerCase();
            let gameBadgeLabel = t.gameName?.toUpperCase() || 'ESPORTS';
            let gameBadgeClass = 'bg-cyan-950/40 border border-cyan-500/40 text-cyan-400';

            if (gLower.includes('cs') || gLower.includes('counter')) {
              gameBadgeLabel = 'COUNTER-STRIKE 2';
              gameBadgeClass = 'bg-cyan-950/40 border border-cyan-500/40 text-cyan-400';
            } else if (gLower.includes('val')) {
              gameBadgeLabel = 'VALORANT';
              gameBadgeClass = 'bg-rose-950/40 border border-rose-500/40 text-rose-400';
            } else if (gLower.includes('chess')) {
              gameBadgeLabel = 'CHESS';
              gameBadgeClass = 'bg-amber-950/40 border border-amber-500/40 text-amber-400';
            } else if (gLower.includes('fc') || gLower.includes('fifa')) {
              gameBadgeLabel = 'EA SPORTS FC 25';
              gameBadgeClass = 'bg-emerald-950/40 border border-emerald-500/40 text-emerald-400';
            }

            // Date format helper
            const dateTimestamp = isCompleted
              ? t.completedAt || t.endDate || t.startDate
              : t.startDate;
            const dObj = dateTimestamp ? new Date(dateTimestamp) : new Date();
            const now = new Date();
            const dateStr =
              dObj.getFullYear() !== now.getFullYear()
                ? dObj.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
                : dObj.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });

            return (
              <div
                key={t.id}
                onClick={() => setSelectedTournament(t)}
                className={`p-5 rounded-2xl bg-[#0b0f19] border transition-all duration-200 cursor-pointer flex flex-col justify-between space-y-4 group relative shadow-md ${
                  isCompleted
                    ? 'border-amber-500/30 hover:border-amber-400/60'
                    : isLive
                    ? 'border-red-500/50 hover:border-red-400/80 shadow-[0_0_20px_rgba(239,68,68,0.2)]'
                    : isCancelled
                    ? 'border-zinc-800/80 opacity-90 hover:border-zinc-700'
                    : 'border-slate-800/90 hover:border-slate-700'
                }`}
              >
                <div className="space-y-3.5">
                  {/* Top Status & Game Badges Header */}
                  <div className="flex items-center justify-between gap-2">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider ${gameBadgeClass}`}>
                      {gameBadgeLabel}
                    </span>

                    {isRegOpen ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-emerald-950/50 border border-emerald-500/40 text-emerald-400 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        <span>REGISTRATION OPEN</span>
                      </span>
                    ) : isCompleted ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-amber-950/50 border border-amber-500/40 text-amber-400">
                        COMPLETED
                      </span>
                    ) : isLive ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-red-950/50 border border-red-500/40 text-red-400 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                        <span>LIVE NOW</span>
                      </span>
                    ) : isCancelled ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-zinc-900 border border-zinc-700 text-zinc-400">
                        CANCELLED
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-cyan-950/50 border border-cyan-500/40 text-cyan-400">
                        UPCOMING
                      </span>
                    )}
                  </div>

                  {/* Tournament Title & Subtitle */}
                  <div>
                    <h3 className="text-xl font-black font-display text-white tracking-tight group-hover:text-cyan-300 transition-colors">
                      {t.name}
                    </h3>
                    <div className="text-xs font-mono text-zinc-400 mt-1 flex items-center gap-2">
                      <span>{t.type === 'TEAM' ? '5v5 Squads' : '1v1 Format'}</span>
                      <span className="text-zinc-600">•</span>
                      <span className="uppercase">{t.format.replace('_', ' ')}</span>
                    </div>
                  </div>

                  {/* Metrics Box */}
                  <div className="p-3.5 rounded-xl bg-[#070a12] border border-slate-800/80 space-y-2 text-xs font-mono">
                    <div className="flex items-center justify-between text-zinc-400">
                      <span>Competitors:</span>
                      <strong className="text-white font-bold">
                        {t.participants?.length || 0} / {t.maxParticipants} {t.type === 'TEAM' ? 'Teams' : 'Players'}
                      </strong>
                    </div>

                    <div className="flex items-center justify-between text-zinc-400">
                      <span>Grand Prize:</span>
                      <span className="text-amber-400 font-bold truncate max-w-[170px]">
                        {t.prizes?.firstPlace || t.prizePool || 'Championship Trophy'}
                      </span>
                    </div>

                    {isCompleted && t.winnerName && (
                      <div className="flex items-center justify-between text-zinc-400 pt-1.5 border-t border-white/[0.06]">
                        <span>Champion:</span>
                        <span className="text-amber-400 font-bold truncate flex items-center gap-1">
                          <span>👑</span>
                          <span>{t.winnerName}</span>
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Card footer CTA */}
                <div className="pt-3 border-t border-white/[0.08] flex items-center justify-between text-xs font-mono">
                  <span className="text-zinc-500">
                    {isCancelled ? 'Cancelled' : isCompleted ? `Ended: ${dateStr}` : `Start: ${dateStr}`}
                  </span>

                  <span
                    className={`font-bold flex items-center gap-1 group-hover:translate-x-1 transition-transform ${
                      isRegOpen
                        ? 'text-cyan-400 group-hover:text-cyan-300'
                        : isCompleted
                        ? 'text-amber-400 group-hover:text-amber-300'
                        : isCancelled
                        ? 'text-zinc-500'
                        : 'text-cyan-400 group-hover:text-cyan-300'
                    }`}
                  >
                    <span>{isRegOpen ? 'Register Now' : isCompleted ? 'View Bracket 🏆' : isCancelled ? 'View Bracket' : 'Register Now'}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
