import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Team, Match } from '../types';
import { fetchPlayerTeams } from '../services/teamService';
import { join5v5Lobby, getPlayerActive5v5Lobby } from '../services/matchService';
import { ActiveLobbyAlertModal } from './ActiveLobbyAlertModal';
import { useToast } from './Toast';
import { X, Swords, Crown, Play, Shield } from 'lucide-react';

interface Join5v5LobbyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLobbyJoined: (match: Match) => void;
  initialLobbyCode?: string;
}

export const Join5v5LobbyModal: React.FC<Join5v5LobbyModalProps> = ({
  isOpen,
  onClose,
  onLobbyJoined,
  initialLobbyCode = '',
}) => {
  const { user, playerProfile } = useAuth();
  const { showToast } = useToast();

  const [lobbyCode, setLobbyCode] = useState(initialLobbyCode);
  const [joinMode, setJoinMode] = useState<'SOLO_CAPTAIN' | 'SQUAD'>('SOLO_CAPTAIN');
  const [captainTeams, setCaptainTeams] = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [duplicateLobby, setDuplicateLobby] = useState<Match | null>(null);

  useEffect(() => {
    if (isOpen && user) {
      loadTeams();
      if (initialLobbyCode) {
        setLobbyCode(initialLobbyCode);
      }
    }
  }, [isOpen, user, initialLobbyCode]);

  const loadTeams = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const teams = await fetchPlayerTeams(user.uid);
      const cap = teams.filter(
        (t) =>
          t.captainId === user.uid ||
          (t as any).creatorUid === user.uid ||
          t.members?.some((m) => m.id === user.uid && m.role === 'captain')
      );
      setCaptainTeams(cap);
      if (cap.length > 0) {
        setSelectedTeamId(cap[0].teamId);
      }
    } catch (err) {
      console.error('Error loading captain teams:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const selectedTeam = captainTeams.find((t) => t.teamId === selectedTeamId);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lobbyCode.trim()) {
      showToast('error', 'Lobby Code Required', 'Please enter a valid 5v5 lobby code.');
      return;
    }
    if (!user) {
      showToast('error', 'Authentication Required', 'Please sign in to join a lobby.');
      return;
    }

    if (joinMode === 'SQUAD' && !selectedTeam) {
      showToast('error', 'Team Required', 'Please select a team where you are the captain.');
      return;
    }

    setJoining(true);
    try {
      const res = await join5v5Lobby({
        lobbyCode: lobbyCode.trim().toUpperCase(),
        teamId: joinMode === 'SQUAD' ? selectedTeam?.teamId : undefined,
        captainId: user.uid,
      });

      if (res.success && res.match) {
        showToast(
          'success',
          'Joined 5v5 Lobby as Opposing Captain! ⚔️',
          `You are now Captain of Team B in match ${res.match.lobbyCode}.`
        );
        onLobbyJoined(res.match);
        onClose();
      } else if (res.error?.includes('ACTIVE LOBBY') || (res as any).activeLobby || (res as any).existingMatch) {
        const existing = (res as any).activeLobby || (res as any).existingMatch || (await getPlayerActive5v5Lobby(user.uid));
        if (existing) {
          setDuplicateLobby(existing);
        }
        showToast('warning', 'Active Lobby Exists', 'YOU ARE ALREADY IN AN ACTIVE LOBBY');
      } else {
        showToast('error', 'Could not join lobby', res.error);
      }
    } catch (err: any) {
      showToast('error', 'Error Joining Lobby', err.message);
    } finally {
      setJoining(false);
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
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <Swords className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-black font-display text-white">JOIN 5v5 LOBBY</h2>
            <p className="text-xs text-slate-400 mt-0.5 font-mono">
              Take the opposing side (Team B) and lead against Team A
            </p>
          </div>
        </div>

        <form onSubmit={handleJoin} className="space-y-5">
          {/* Lobby Code Input */}
          <div>
            <label className="block text-xs font-mono font-bold uppercase text-slate-400 mb-2">
              Lobby Code
            </label>
            <input
              type="text"
              placeholder="e.g. NW-4829"
              value={lobbyCode}
              onChange={(e) => setLobbyCode(e.target.value.toUpperCase())}
              className="w-full px-4 py-3 bg-[#121218] border border-slate-800 rounded-2xl text-lg text-cyan-400 placeholder-slate-600 focus:outline-none focus:border-cyan-400 font-mono font-black uppercase text-center tracking-widest"
              required
            />
          </div>

          {/* Join Mode Tabs */}
          <div>
            <label className="block text-xs font-mono font-bold uppercase text-slate-400 mb-2">
              How would you like to join?
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setJoinMode('SOLO_CAPTAIN')}
                className={`p-3 rounded-2xl border text-left transition-all ${
                  joinMode === 'SOLO_CAPTAIN'
                    ? 'bg-cyan-500/10 border-cyan-400 text-white'
                    : 'bg-[#121218] border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-2 font-bold text-xs font-mono">
                  <Crown className="w-4 h-4 text-cyan-400" />
                  <span>Solo Opposing Captain</span>
                </div>
                <div className="text-[10px] text-slate-400 mt-1">
                  Become Team B Captain and recruit free agents in lobby.
                </div>
              </button>

              <button
                type="button"
                onClick={() => setJoinMode('SQUAD')}
                className={`p-3 rounded-2xl border text-left transition-all ${
                  joinMode === 'SQUAD'
                    ? 'bg-cyan-500/10 border-cyan-400 text-white'
                    : 'bg-[#121218] border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-2 font-bold text-xs font-mono">
                  <Shield className="w-4 h-4 text-cyan-400" />
                  <span>With Squad</span>
                </div>
                <div className="text-[10px] text-slate-400 mt-1">
                  Bring an existing squad you already captain.
                </div>
              </button>
            </div>
          </div>

          {/* Team Selection if SQUAD mode */}
          {joinMode === 'SQUAD' && (
            <div>
              <label className="block text-xs font-mono font-bold uppercase text-slate-400 mb-2">
                Select Your Squad
              </label>
              {loading ? (
                <div className="py-6 text-center text-xs text-slate-400 font-mono">
                  Loading your squads...
                </div>
              ) : captainTeams.length === 0 ? (
                <div className="p-4 rounded-2xl bg-[#121218] border border-slate-800 text-center space-y-2">
                  <Crown className="w-6 h-6 text-yellow-400 mx-auto" />
                  <div className="text-xs text-slate-300 font-bold">No Captain Squads Found</div>
                  <div className="text-[11px] text-slate-500">
                    Switch to "Solo Opposing Captain" to become captain of Team B directly!
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {captainTeams.map((t) => (
                    <div
                      key={t.teamId}
                      onClick={() => setSelectedTeamId(t.teamId)}
                      className={`p-3.5 rounded-2xl border cursor-pointer transition-all flex items-center justify-between ${
                        selectedTeamId === t.teamId
                          ? 'bg-cyan-500/10 border-cyan-400 text-white shadow-md'
                          : 'bg-[#121218] border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{t.teamLogo || '🛡️'}</span>
                        <div>
                          <div className="font-bold text-xs font-display text-white flex items-center gap-1.5">
                            <span>{t.teamName}</span>
                            <span className="text-cyan-400 font-mono font-bold">[{t.teamTag}]</span>
                          </div>
                          <div className="text-[10px] font-mono text-slate-400">
                            {t.gameName} 5v5 • {t.teamRating || 1000} ELO
                          </div>
                        </div>
                      </div>

                      <div className="text-right font-mono text-xs">
                        <span
                          className={`font-bold ${
                            t.members.length === 5 ? 'text-emerald-400' : 'text-yellow-400'
                          }`}
                        >
                          {t.members.length}/5 Players
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {joinMode === 'SOLO_CAPTAIN' && (
            <div className="p-3.5 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 text-xs text-slate-300 space-y-1">
              <div className="font-bold text-cyan-400 font-mono flex items-center gap-1.5">
                <Crown className="w-3.5 h-3.5" />
                <span>You will be Team B Captain</span>
              </div>
              <p className="text-[11px] text-slate-400">
                You'll occupy slot 1 of Team B as Captain ({playerProfile?.gamerTag || 'You'}), and can recruit players, accept join requests, and manage Team B.
              </p>
            </div>
          )}

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
              disabled={joining || !lobbyCode.trim() || (joinMode === 'SQUAD' && !selectedTeam)}
              className="px-6 py-2.5 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-black font-mono font-black text-xs uppercase tracking-wider transition-all disabled:opacity-50 shadow-md flex items-center gap-1.5"
            >
              <Play className="w-3.5 h-3.5" />
              <span>{joining ? 'Connecting...' : 'Join 5v5 Lobby'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Active Lobby Alert Modal */}
      {duplicateLobby && (
        <ActiveLobbyAlertModal
          isOpen={!!duplicateLobby}
          onClose={() => setDuplicateLobby(null)}
          onOpenCurrentLobby={() => {
            if (duplicateLobby) {
              onLobbyJoined(duplicateLobby);
              setDuplicateLobby(null);
              onClose();
            }
          }}
          activeLobby={duplicateLobby}
          customTitle="YOU ARE ALREADY IN AN ACTIVE LOBBY"
          customMessage="A Nexus player cannot belong to two active 5v5 lobbies at the same time. You must finish or leave your current lobby before joining another."
        />
      )}
    </div>
  );
};
