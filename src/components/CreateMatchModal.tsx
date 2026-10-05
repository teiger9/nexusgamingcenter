import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { auth } from '../lib/firebase';
import { fetchGames } from '../services/gameService';
import { fetchPotentialOpponents } from '../services/playerService';
import { createMatch } from '../services/matchService';
import { Game, Player, Station, STATIONS, GameCategory } from '../types';
import { useToast } from './Toast';
import { X, Swords, Search, ArrowRight, Check } from 'lucide-react';

interface CreateMatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMatchCreated: (matchId: string) => void;
  initialGameId?: string;
}

export const CreateMatchModal: React.FC<CreateMatchModalProps> = ({
  isOpen,
  onClose,
  onMatchCreated,
  initialGameId,
}) => {
  const { user, playerProfile } = useAuth();
  const { showToast } = useToast();

  const [games, setGames] = useState<Game[]>([]);
  const [opponents, setOpponents] = useState<Player[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form selections
  const [selectedCategory, setSelectedCategory] = useState<GameCategory | 'ALL'>('ALL');
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [selectedOpponent, setSelectedOpponent] = useState<Player | null>(null);
  const [selectedStation, setSelectedStation] = useState<Station>('PC-01');
  const [opponentSearch, setOpponentSearch] = useState('');

  useEffect(() => {
    if (isOpen && user) {
      loadInitialData();
    }
  }, [isOpen, user, initialGameId]);

  const currentAuthUid = (auth.currentUser?.uid || user?.uid || playerProfile?.uid || '').trim();

  const loadInitialData = async () => {
    setLoadingData(true);
    try {
      const [allGames, allOpponents] = await Promise.all([
        fetchGames(true),
        fetchPotentialOpponents(currentAuthUid),
      ]);
      setGames(allGames);
      setOpponents(allOpponents.filter((p) => p.uid !== currentAuthUid));

      // Match initialGameId if supplied, or pick first game
      if (allGames.length > 0) {
        let picked = allGames[0];
        if (initialGameId) {
          const found = allGames.find(
            (g) => g.id.toLowerCase() === initialGameId.toLowerCase() ||
                   g.name.toLowerCase().includes(initialGameId.toLowerCase())
          );
          if (found) picked = found;
        }
        setSelectedGame(picked);
        if (picked.category === 'PS5') setSelectedStation('PS5-01');
        else if (picked.category === 'CHESS') setSelectedStation('CHESS-01');
        else setSelectedStation('PC-01');
      }
    } catch (err) {
      console.error('Error loading create match data:', err);
    } finally {
      setLoadingData(false);
    }
  };

  if (!isOpen || !user || !playerProfile) return null;

  const filteredGames = games.filter((g) =>
    selectedCategory === 'ALL' ? true : g.category === selectedCategory
  );

  const filteredOpponents = opponents.filter((o) => {
    const oppUid = (o?.uid || (o as any)?.id || '').trim();
    if (!oppUid || oppUid === currentAuthUid) return false;
    return (
      (o?.gamerTag && o.gamerTag.toLowerCase().includes(opponentSearch.toLowerCase())) ||
      (o?.fullName && o.fullName.toLowerCase().includes(opponentSearch.toLowerCase()))
    );
  });

  const filteredStations = STATIONS.filter((st) => {
    if (!selectedGame) return true;
    return st.category === selectedGame.category;
  });

  const handleSelectOpponent = (opp: Player) => {
    const oppUid = (opp?.uid || (opp as any)?.id || '').trim();
    if (oppUid === currentAuthUid || oppUid === playerProfile.uid) {
      showToast('error', 'Invalid Action', 'You cannot select yourself as an opponent.');
      return;
    }
    setSelectedOpponent(opp);
  };

  const handleSelectGame = (game: Game) => {
    setSelectedGame(game);
    const defaultStationForCategory = STATIONS.find((s) => s.category === game.category);
    if (defaultStationForCategory) {
      setSelectedStation(defaultStationForCategory.id);
    }
  };

  const handleCreate = async () => {
    if (!selectedGame) {
      showToast('error', 'Select a Game', 'Please pick a game for this match.');
      return;
    }
    if (!selectedOpponent) {
      showToast('error', 'Select Opponent', 'Please choose your opponent from registered players.');
      return;
    }

    const recipientUid = (selectedOpponent?.uid || (selectedOpponent as any)?.id || '').trim();
    if (!recipientUid) {
      showToast('error', 'Unable to invite this player. Nexus account ID could not be found.', 'Please select a valid player.');
      return;
    }

    if (recipientUid === currentAuthUid || recipientUid === playerProfile.uid) {
      showToast('error', 'Invalid Action', 'You cannot select yourself as an opponent.');
      return;
    }

    if (!selectedStation) {
      showToast('error', 'Select Station', 'Please designate a station or board.');
      return;
    }

    setSubmitting(true);
    try {
      const newMatch = await createMatch({
        playerAId: playerProfile.uid,
        playerAName: playerProfile.fullName || playerProfile.gamerTag || 'Player A',
        playerAGamerTag: playerProfile.gamerTag,
        playerBId: recipientUid,
        playerBName: selectedOpponent.fullName || selectedOpponent.gamerTag || 'Player B',
        playerBGamerTag: selectedOpponent.gamerTag,
        gameId: selectedGame.id,
        gameName: selectedGame.name,
        gameCategory: selectedGame.category,
        station: selectedStation,
        matchType: 'RANKED',
      });

      showToast('success', 'Match Request Sent!', `Sent request for ${selectedGame.name} at Station ${selectedStation}.`);
      onMatchCreated(newMatch.id);
      onClose();
    } catch (err: any) {
      showToast('error', 'Failed to create match request', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-neutral-950 border border-white/10 rounded-2xl p-6 sm:p-8 shadow-2xl my-8">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-neutral-900 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Title */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-red-600/10 border border-red-500/30 flex items-center justify-center text-red-500 shadow-[0_0_15px_rgba(239,68,68,0.2)]">
            <Swords className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-xl font-black font-display uppercase tracking-wide text-white">Create 1v1 Match</h3>
            <p className="text-xs text-neutral-400">Select game, opponent, and station to start</p>
          </div>
        </div>

        {loadingData ? (
          <div className="py-12 text-center text-neutral-400 text-sm flex items-center justify-center gap-2 font-mono">
            <span className="w-5 h-5 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
            <span>Loading station and competitor registers...</span>
          </div>
        ) : (
          <div className="space-y-6">
            {/* 1. Game Selection */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold text-neutral-300 uppercase tracking-wider font-mono">
                  1. Game
                </label>
                <div className="flex bg-neutral-900 border border-white/10 p-0.5 rounded-lg">
                  {(['ALL', 'PC', 'PS5', 'CHESS'] as const).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-2.5 py-1 rounded text-xs font-bold transition-all ${
                        selectedCategory === cat
                          ? 'bg-red-600 text-white shadow-sm'
                          : 'text-neutral-400 hover:text-white'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto p-0.5">
                {filteredGames.map((game) => {
                  const isSelected = selectedGame?.id === game.id;
                  return (
                    <button
                      key={game.id}
                      type="button"
                      onClick={() => handleSelectGame(game)}
                      className={`p-3 rounded-xl text-left border transition-all flex flex-col justify-between ${
                        isSelected
                          ? 'bg-neutral-900 border-red-500 text-white shadow-[0_0_15px_rgba(239,68,68,0.2)]'
                          : 'bg-neutral-950 border-white/10 text-neutral-300 hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-mono font-bold text-neutral-400 uppercase">
                          {game.category}
                        </span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-red-500" />}
                      </div>
                      <span className="font-bold font-display text-sm tracking-tight text-white line-clamp-1">
                        {game.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. Opponent Selection */}
            <div>
              <label className="block text-xs font-bold text-neutral-300 uppercase tracking-wider mb-2 font-mono">
                2. Opponent
              </label>

              <div className="relative mb-2">
                <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search competitor by gamer tag..."
                  value={opponentSearch}
                  onChange={(e) => setOpponentSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-neutral-900 border border-white/10 rounded-lg text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-red-500"
                />
              </div>

              {opponents.length === 0 ? (
                <div className="p-4 rounded-xl bg-neutral-900 border border-white/10 text-center text-xs text-neutral-400">
                  No other competitors registered yet.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto p-0.5">
                  {filteredOpponents.map((opp) => {
                    const isSelected = selectedOpponent?.uid === opp.uid;
                    return (
                      <button
                        key={opp.uid}
                        type="button"
                        onClick={() => handleSelectOpponent(opp)}
                        className={`p-2.5 rounded-xl text-left border transition-all flex items-center justify-between ${
                          isSelected
                            ? 'bg-neutral-900 border-red-500 text-white'
                            : 'bg-neutral-950 border-white/10 text-neutral-300 hover:border-white/20'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-neutral-800 border border-white/10 flex items-center justify-center font-bold text-xs text-red-500 font-mono">
                            {opp.gamerTag.substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="text-xs font-bold text-white">{opp.gamerTag}</div>
                            <div className="text-[10px] text-neutral-400">{opp.overallRating || 1000} MMR</div>
                          </div>
                        </div>
                        {isSelected && <Check className="w-3.5 h-3.5 text-red-500" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 3. Station Selection */}
            <div>
              <label className="block text-xs font-bold text-neutral-300 uppercase tracking-wider mb-2 font-mono">
                3. Station / Board
              </label>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {filteredStations.map((st) => {
                  const isSelected = selectedStation === st.id;
                  return (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => setSelectedStation(st.id)}
                      className={`p-2 rounded-lg border text-center font-mono font-bold text-xs transition-all ${
                        isSelected
                          ? 'bg-red-600 text-white border-red-500 font-black shadow-[0_0_10px_rgba(239,68,68,0.3)]'
                          : 'bg-neutral-900 border-white/10 text-neutral-300 hover:border-white/20'
                      }`}
                    >
                      {st.id}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Summary preview & submit button */}
            <div className="pt-4 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-xs text-neutral-400 text-center sm:text-left">
                {selectedGame && selectedOpponent ? (
                  <span>
                    <strong className="text-white">{playerProfile.gamerTag}</strong> vs{' '}
                    <strong className="text-red-500">{selectedOpponent.gamerTag}</strong> in{' '}
                    <span className="text-white font-semibold">{selectedGame.name}</span> ({selectedStation})
                  </span>
                ) : (
                  <span>Select game, opponent, and station to proceed.</span>
                )}
              </div>

              <button
                type="button"
                onClick={handleCreate}
                disabled={submitting || !selectedGame || !selectedOpponent}
                className="w-full sm:w-auto px-6 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 disabled:bg-neutral-800 disabled:text-neutral-500 text-white font-bold text-xs uppercase tracking-wider transition-all shadow-[0_0_15px_rgba(239,68,68,0.3)] flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <span>START MATCH</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
