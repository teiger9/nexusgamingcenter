import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { createTeam, validateTeamName, validateTeamTag } from '../services/teamService';
import { Team } from '../types';
import { useToast } from './Toast';
import { X, Shield, Swords, Sparkles, Check, Crown } from 'lucide-react';

interface CreateTeamModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTeamCreated: (team: Team) => void;
  defaultGameId?: string;
}

const TEAM_EMBLEMS = ['🐺', '⚡', '🦅', '🛡️', '⚔️', '👑', '🎯', '🔥', '🐉', '💀', '🦁', '🐯', '🚀', '💎'];

export const CreateTeamModal: React.FC<CreateTeamModalProps> = ({
  isOpen,
  onClose,
  onTeamCreated,
  defaultGameId = 'valorant',
}) => {
  const { user, playerProfile } = useAuth();
  const { showToast } = useToast();

  const [gameId, setGameId] = useState<'valorant' | 'cs2' | 'lol'>(
    defaultGameId.toLowerCase().includes('cs2')
      ? 'cs2'
      : defaultGameId.toLowerCase().includes('lol') || defaultGameId.toLowerCase().includes('league')
      ? 'lol'
      : 'valorant'
  );
  const [teamName, setTeamName] = useState('');
  const [teamTag, setTeamTag] = useState('');
  const [teamLogo, setTeamLogo] = useState('🐺');
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen || !user || !playerProfile) return null;

  const nameValidation = validateTeamName(teamName);
  const tagValidation = validateTeamTag(teamTag);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!nameValidation.valid) {
      showToast('error', 'Invalid Team Name', nameValidation.error);
      return;
    }
    if (!tagValidation.valid) {
      showToast('error', 'Invalid Team Tag', tagValidation.error);
      return;
    }

    const gameName =
      gameId === 'valorant'
        ? 'Valorant'
        : gameId === 'cs2'
        ? 'CS2'
        : 'League of Legends';

    setSubmitting(true);
    try {
      const res = await createTeam({
        teamName: teamName.trim(),
        teamTag: teamTag.trim().toUpperCase(),
        gameId,
        gameName,
        captain: playerProfile,
        teamLogo,
      });

      if (res.success && res.team) {
        showToast(
          'success',
          'Team Created!',
          `You are now captain of ${res.team.teamName} [${res.team.teamTag}]. Add 4 teammates to start 5v5 ranked matches!`
        );
        onTeamCreated(res.team);
        onClose();
      } else {
        showToast('error', 'Could not create team', res.error);
      }
    } catch (err: any) {
      showToast('error', 'Creation Error', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-lg bg-[#0a0a0f] border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl my-8">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/30 flex items-center justify-center text-2xl">
            {teamLogo}
          </div>
          <div>
            <h2 className="text-xl font-black font-display text-white">CREATE 5v5 SQUAD</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Found an official competitive team. You will be designated as <strong className="text-yellow-400">Captain</strong>.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Game Selection */}
          <div>
            <label className="block text-xs font-mono font-bold uppercase text-slate-400 mb-2">
              Competitive 5v5 Game
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <button
                type="button"
                onClick={() => setGameId('valorant')}
                className={`p-3 rounded-2xl border text-left transition-all ${
                  gameId === 'valorant'
                    ? 'bg-cyan-500/10 border-cyan-400 text-white shadow-lg'
                    : 'bg-[#121218] border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="font-bold text-xs font-display text-cyan-400">VALORANT</div>
                <div className="text-[10px] font-mono text-slate-400 mt-0.5">Tactical FPS</div>
              </button>

              <button
                type="button"
                onClick={() => setGameId('cs2')}
                className={`p-3 rounded-2xl border text-left transition-all ${
                  gameId === 'cs2'
                    ? 'bg-cyan-500/10 border-cyan-400 text-white shadow-lg'
                    : 'bg-[#121218] border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="font-bold text-xs font-display text-cyan-400">CS2</div>
                <div className="text-[10px] font-mono text-slate-400 mt-0.5">Counter-Strike 2</div>
              </button>

              <button
                type="button"
                onClick={() => setGameId('lol')}
                className={`p-3 rounded-2xl border text-left transition-all ${
                  gameId === 'lol'
                    ? 'bg-cyan-500/10 border-cyan-400 text-white shadow-lg'
                    : 'bg-[#121218] border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="font-bold text-xs font-display text-cyan-400">LEAGUE</div>
                <div className="text-[10px] font-mono text-slate-400 mt-0.5">League of Legends</div>
              </button>
            </div>
          </div>

          {/* Team Name */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-mono font-bold uppercase text-slate-400">
                Team Name (2–30 chars)
              </label>
              <span className="text-[10px] font-mono text-slate-500">{teamName.length}/30</span>
            </div>
            <input
              type="text"
              placeholder="e.g. Nexus Wolves, Algiers Titans"
              value={teamName}
              maxLength={30}
              onChange={(e) => setTeamName(e.target.value)}
              className="w-full px-4 py-3 bg-[#121218] border border-slate-800 rounded-2xl text-sm text-white placeholder-slate-600 focus:outline-none focus:border-cyan-400 font-display font-bold"
              required
            />
            {teamName.trim().length > 0 && !nameValidation.valid && (
              <p className="text-[11px] text-rose-400 font-mono mt-1">{nameValidation.error}</p>
            )}
          </div>

          {/* Team Tag */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-mono font-bold uppercase text-slate-400">
                Team Tag (2–5 uppercase letters)
              </label>
              <span className="text-[10px] font-mono text-slate-500">{teamTag.length}/5</span>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="text"
                placeholder="NW"
                value={teamTag}
                maxLength={5}
                onChange={(e) => setTeamTag(e.target.value.toUpperCase())}
                className="w-32 px-4 py-3 bg-[#121218] border border-slate-800 rounded-2xl text-sm text-cyan-400 placeholder-slate-600 focus:outline-none focus:border-cyan-400 font-mono font-black uppercase text-center"
                required
              />
              <div className="text-xs text-slate-400 font-mono flex items-center gap-1.5">
                <span>Preview:</span>
                <span className="px-2 py-1 rounded bg-slate-800 text-cyan-400 font-mono font-black text-xs">
                  [{teamTag || 'TAG'}] {playerProfile.gamerTag}
                </span>
              </div>
            </div>
            {teamTag.trim().length > 0 && !tagValidation.valid && (
              <p className="text-[11px] text-rose-400 font-mono mt-1">{tagValidation.error}</p>
            )}
          </div>

          {/* Emblem / Logo */}
          <div>
            <label className="block text-xs font-mono font-bold uppercase text-slate-400 mb-2">
              Team Emblem
            </label>
            <div className="flex flex-wrap gap-2">
              {TEAM_EMBLEMS.map((emblem) => (
                <button
                  key={emblem}
                  type="button"
                  onClick={() => setTeamLogo(emblem)}
                  className={`w-10 h-10 rounded-xl text-lg flex items-center justify-center transition-all ${
                    teamLogo === emblem
                      ? 'bg-cyan-500/20 border-2 border-cyan-400 scale-110 shadow-md'
                      : 'bg-[#121218] border border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {emblem}
                </button>
              ))}
            </div>
          </div>

          {/* Roster Notice */}
          <div className="p-3.5 rounded-2xl bg-cyan-500/5 border border-cyan-500/20 text-xs font-mono text-cyan-300 flex items-start gap-2.5">
            <Crown className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
            <div>
              <strong>Captain Privilege:</strong> You will be the team captain and can add/remove members and create official 5v5 ranked lobbies once your 5-player roster is complete.
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-mono uppercase"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !nameValidation.valid || !tagValidation.valid}
              className="px-6 py-2.5 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-black font-mono font-black text-xs uppercase tracking-wider transition-all disabled:opacity-50 shadow-md"
            >
              {submitting ? 'Creating Squad...' : 'Create Team'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
