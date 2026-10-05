import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { fetchGames, addCustomGame, toggleGameActive } from '../services/gameService';
import { Game, GameCategory } from '../types';
import { useToast } from './Toast';
import { Gamepad2, Plus, Check, X, ToggleLeft, ToggleRight, Sparkles } from 'lucide-react';

export const AdminGamesView: React.FC = () => {
  const { isAdmin } = useAuth();
  const { showToast } = useToast();
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);

  // New game modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState<GameCategory>('PC');
  const [newDescription, setNewDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    loadGames();
  }, []);

  const loadGames = async () => {
    setLoading(true);
    try {
      const data = await fetchGames(false);
      setGames(data);
    } catch (err) {
      console.error('Error fetching games:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (game: Game) => {
    try {
      await toggleGameActive(game.id, game.active);
      showToast('success', 'Game Updated', `${game.name} is now ${!game.active ? 'Active' : 'Inactive'}.`);
      await loadGames();
    } catch (err: any) {
      showToast('error', 'Update Failed', err.message);
    }
  };

  const handleAddGame = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    setIsSubmitting(true);
    try {
      await addCustomGame({
        name: newName.trim(),
        category: newCategory,
        description: newDescription.trim(),
      });
      showToast('success', 'Game Added!', `${newName.trim()} registered in Nexus catalog.`);
      setShowAddModal(false);
      setNewName('');
      setNewDescription('');
      await loadGames();
    } catch (err: any) {
      showToast('error', 'Failed to add game', err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black font-display text-white">OFFICIAL GAMES CATALOG</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Manage titles available for competitive matches and rating calculations.
          </p>
        </div>

        {isAdmin && (
          <button
            onClick={() => setShowAddModal(true)}
            className="px-5 py-2.5 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-black font-black text-xs tracking-wider uppercase transition-all shadow-[0_0_15px_rgba(34,211,238,0.3)] flex items-center justify-center gap-1.5 active:scale-95 whitespace-nowrap cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>Add New Game</span>
          </button>
        )}
      </div>

      {loading ? (
        <div className="py-20 text-center">
          <div className="inline-block w-8 h-8 border-3 border-cyan-400 border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-slate-400 text-xs font-mono">Loading games database...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {games.map((game) => (
            <div
              key={game.id}
              className={`p-5 rounded-3xl border transition-all flex flex-col justify-between shadow-xl ${
                game.active
                  ? 'bg-[#0a0a0f] border-slate-800 hover:border-slate-700'
                  : 'bg-[#0a0a0f]/50 border-slate-900 opacity-60'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span
                    className={`text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-lg ${
                      game.category === 'PC'
                        ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30'
                        : game.category === 'PS5'
                        ? 'bg-blue-500/10 text-blue-400 border border-blue-500/30'
                        : 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/30'
                    }`}
                  >
                    {game.category}
                  </span>

                  <button
                    disabled={!isAdmin}
                    onClick={() => handleToggleActive(game)}
                    className={`flex items-center gap-1 text-[11px] font-mono font-bold ${
                      game.active ? 'text-cyan-400' : 'text-slate-500'
                    } ${!isAdmin ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    {game.active ? (
                      <span className="flex items-center gap-1">
                        <span>Active</span>
                        <ToggleRight className="w-5 h-5 text-cyan-400" />
                      </span>
                    ) : (
                      <span className="flex items-center gap-1">
                        <span>Inactive</span>
                        <ToggleLeft className="w-5 h-5 text-slate-500" />
                      </span>
                    )}
                  </button>
                </div>

                <h3 className="text-base font-bold font-display text-white mt-1">{game.name}</h3>
                {game.description && (
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed line-clamp-2">
                    {game.description}
                  </p>
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-mono text-slate-500">
                <span>Slug: {game.id}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Game Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
          <div className="relative w-full max-w-md bg-[#0a0a0f] border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-4">
            <button
              onClick={() => setShowAddModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                <Gamepad2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-xl font-bold font-display text-white">Add Game to Catalog</h3>
                <p className="text-xs text-slate-400 font-mono">Register new tournament title</p>
              </div>
            </div>

            <form onSubmit={handleAddGame} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5 font-mono">
                  Game Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Street Fighter 6"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#15151b] border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5 font-mono">
                  Category *
                </label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value as GameCategory)}
                  className="w-full px-3.5 py-2.5 bg-[#15151b] border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-400 font-mono"
                >
                  <option value="PC">PC (Computer)</option>
                  <option value="PS5">PS5 (PlayStation 5)</option>
                  <option value="CHESS">CHESS (Physical Board)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5 font-mono">
                  Description
                </label>
                <textarea
                  rows={3}
                  placeholder="Brief description of rules or tournament format"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#15151b] border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2.5 rounded-xl bg-[#15151b] hover:bg-slate-800 text-xs font-bold text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 rounded-xl bg-cyan-400 hover:bg-cyan-300 disabled:bg-slate-800 text-black font-black text-xs uppercase tracking-wider transition-all shadow-[0_0_15px_rgba(34,211,238,0.3)]"
                >
                  {isSubmitting ? 'Saving...' : 'Register Game'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
