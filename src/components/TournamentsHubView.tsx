import React, { useState, useEffect } from 'react';
import { Tournament } from '../types';
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
    const matchGame = filterGame === 'all' || t.gameId === filterGame;
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
      {completedTournaments.length > 0 && (
        <TournamentChampionsShowcase
          champions={completedTournaments}
          onSelectTournament={(tId) => {
            const found = tournaments.find((t) => t.id === tId);
            if (found) setSelectedTournament(found);
          }}
          onSelectParticipant={onSelectParticipant}
        />
      )}

      {/* Main Tournaments Header & Explorer */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-mono font-bold uppercase mb-2">
            <Trophy className="w-3.5 h-3.5" />
            <span>NEXUS ESPORTS ARENA</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black font-display tracking-tight text-white uppercase">
            COMPETITIVE TOURNAMENTS
          </h1>
          <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-xl">
            Register for sanctioned 1v1 and 5v5 tournaments across Valorant, CS2, Chess, and FC 26/27. Track brackets, battle for prizes, and earn permanent crowns.
          </p>
        </div>

        {isAdmin && onNavigateToAdminTournaments && (
          <button
            onClick={onNavigateToAdminTournaments}
            className="px-5 py-2.5 rounded-xl bg-yellow-500 hover:bg-yellow-400 text-black font-mono font-black text-xs uppercase tracking-wider transition-all shadow-[0_0_15px_rgba(234,179,8,0.3)] flex items-center gap-2 shrink-0 self-start md:self-auto"
          >
            <Shield className="w-4 h-4" />
            <span>Admin Tournament Hub</span>
          </button>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-[#0b0d14] p-4 rounded-2xl border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search tournaments..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder:text-slate-500 font-mono focus:outline-none focus:border-cyan-400"
          />
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto overflow-x-auto">
          {/* Game selector */}
          <select
            value={filterGame}
            onChange={(e) => setFilterGame(e.target.value)}
            className="px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs font-mono text-slate-300 focus:outline-none focus:border-cyan-400"
          >
            <option value="all">All Game Titles</option>
            <option value="valorant">Valorant</option>
            <option value="cs2">CS2</option>
            <option value="chess">Chess</option>
            <option value="fc26">FC 26</option>
            <option value="fc27">FC 27</option>
          </select>

          {/* Type selector */}
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs font-mono text-slate-300 focus:outline-none focus:border-cyan-400"
          >
            <option value="all">All Match Formats</option>
            <option value="INDIVIDUAL">1v1 Individual</option>
            <option value="TEAM">5v5 Squads</option>
          </select>
        </div>
      </div>

      {/* Tournaments Grid */}
      {loading ? (
        <div className="py-20 text-center text-slate-400 font-mono text-xs">
          Loading tournaments...
        </div>
      ) : filteredTournaments.length === 0 ? (
        <div className="p-16 rounded-3xl bg-[#0a0c14] border border-slate-800 text-center space-y-3">
          <Trophy className="w-12 h-12 text-slate-600 mx-auto" />
          <h3 className="text-base font-bold text-white font-display">No Tournaments Match Your Filter</h3>
          <p className="text-xs text-slate-400 font-mono max-w-sm mx-auto">
            Try adjusting your search query or selecting &quot;All Game Titles&quot;.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredTournaments.map((t) => {
            const isRegOpen = t.status === 'REGISTRATION_OPEN';
            const isLive = t.status === 'LIVE';
            const isCompleted = t.status === 'COMPLETED';

            return (
              <div
                key={t.id}
                onClick={() => setSelectedTournament(t)}
                className={`p-6 rounded-3xl border transition-all duration-300 cursor-pointer flex flex-col justify-between space-y-4 group relative overflow-hidden ${
                  isCompleted
                    ? 'bg-[#0a0c14] border-yellow-500/30 hover:border-yellow-400/70 shadow-lg'
                    : isLive
                    ? 'bg-[#120810] border-red-500/50 hover:border-red-400 shadow-[0_0_20px_rgba(239,68,68,0.15)]'
                    : 'bg-[#0b0d16] border-slate-800 hover:border-slate-700 hover:-translate-y-1'
                }`}
              >
                <div className="space-y-3">
                  {/* Status header */}
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-1 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 font-mono text-xs font-bold uppercase">
                      {t.gameName}
                    </span>

                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-black uppercase border tracking-wider ${
                        isLive
                          ? 'bg-red-500/20 text-red-400 border-red-500/50 animate-pulse'
                          : isCompleted
                          ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/50'
                          : isRegOpen
                          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50'
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}
                    >
                      {t.status.replace('_', ' ')}
                    </span>
                  </div>

                  <div>
                    <h3 className="text-lg font-black font-display text-white group-hover:text-cyan-300 transition-colors">
                      {t.name}
                    </h3>
                    <div className="text-xs font-mono text-slate-400 mt-1 flex items-center gap-2">
                      <span>{t.type === 'TEAM' ? '5v5 Squads' : '1v1 Individual'}</span>
                      <span>•</span>
                      <span>{t.format.replace('_', ' ')}</span>
                    </div>
                  </div>

                  {/* Summary Box */}
                  <div className="p-3.5 rounded-2xl bg-[#0f111d] border border-slate-800/80 space-y-2 text-xs font-mono">
                    <div className="flex items-center justify-between text-slate-400">
                      <span>Competitors:</span>
                      <strong className="text-white">
                        {t.participants?.length || 0} / {t.maxParticipants}
                      </strong>
                    </div>

                    <div className="flex items-center justify-between text-slate-400">
                      <span>Grand Prize:</span>
                      <span className="text-yellow-400 font-bold truncate max-w-[150px]">
                        {t.prizes?.firstPlace || 'Championship Trophy'}
                      </span>
                    </div>

                    {isCompleted && t.winnerName && (
                      <div className="flex items-center justify-between text-yellow-300 pt-1 border-t border-slate-800 font-bold">
                        <span>Champion:</span>
                        <span className="truncate flex items-center gap-1">
                          <span>👑</span>
                          <span>{t.winnerName}</span>
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Card footer CTA */}
                <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs font-mono">
                  <span className="text-slate-400 text-[11px]">
                    {new Date(t.scheduledStartAt).toLocaleDateString()}
                  </span>

                  <span className="text-cyan-400 font-bold flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                    <span>{isRegOpen ? 'Register Now' : 'View Bracket'}</span>
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
