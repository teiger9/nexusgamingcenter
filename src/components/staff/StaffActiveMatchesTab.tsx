import React, { useState } from 'react';
import { Match, Player } from '../../types';
import { sendNotification } from '../../services/notificationService';
import {
  Swords,
  Clock,
  Shield,
  Search,
  MessageSquare,
  Users,
  CheckCircle2,
  AlertTriangle,
  Send,
  Eye,
  Monitor,
} from 'lucide-react';

interface StaffActiveMatchesTabProps {
  matches: Match[];
  staffPlayer: Player;
  onSelectMatch?: (matchId: string) => void;
}

export const StaffActiveMatchesTab: React.FC<StaffActiveMatchesTabProps> = ({
  matches,
  staffPlayer,
  onSelectMatch,
}) => {
  const [filterGame, setFilterGame] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('IN_PROGRESS');
  const [searchQuery, setSearchQuery] = useState('');

  // Assist modal
  const [assistMatch, setAssistMatch] = useState<Match | null>(null);
  const [assistMessage, setAssistMessage] = useState('');
  const [assistLoading, setAssistLoading] = useState(false);
  const [assistSuccess, setAssistSuccess] = useState<string | null>(null);

  const filteredMatches = matches.filter((m) => {
    if (filterStatus !== 'ALL') {
      if (filterStatus === 'IN_PROGRESS' && m.status !== 'IN_PROGRESS') return false;
      if (filterStatus === 'PENDING' && m.status !== 'PENDING') return false;
      if (filterStatus === 'COMPLETED' && m.status !== 'COMPLETED') return false;
    }

    if (filterGame !== 'ALL' && m.game !== filterGame) {
      return false;
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const pA = (m.playerAName || '').toLowerCase();
      const pB = (m.playerBName || '').toLowerCase();
      const tA = (m.teamAName || '').toLowerCase();
      const tB = (m.teamBName || '').toLowerCase();
      const id = (m.id || '').toLowerCase();
      if (!pA.includes(q) && !pB.includes(q) && !tA.includes(q) && !tB.includes(q) && !id.includes(q)) {
        return false;
      }
    }

    return true;
  });

  const handleSendAssistNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assistMatch || !assistMessage.trim()) return;

    setAssistLoading(true);
    try {
      // Send notification to both match participants / captains
      const targets = [assistMatch.playerAId, assistMatch.playerBId].filter(Boolean);
      for (const uid of targets) {
        await sendNotification({
          userId: uid,
          type: 'SYSTEM_ALERT',
          title: 'Nexus Staff Operational Message',
          message: `[Staff ${staffPlayer.gamerTag}]: ${assistMessage.trim()}`,
          data: { matchId: assistMatch.id },
        });
      }

      setAssistSuccess(`Staff message dispatched to players in Match #${assistMatch.id.slice(-6)}.`);
      setAssistMessage('');
      setAssistMatch(null);
    } catch (err: any) {
      console.error('Error sending assist message:', err);
    } finally {
      setAssistLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#0b0e14] border border-slate-800 rounded-2xl p-5">
        <div>
          <h3 className="text-base font-bold text-white uppercase tracking-wider flex items-center gap-2 font-display">
            <Swords className="w-5 h-5 text-red-500" />
            <span>Active Matches & Arenas</span>
          </h3>
          <p className="text-xs text-slate-400">
            Real-time arena observation, lobby assistance, and participant support
          </p>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-400">
          <Shield className="w-3.5 h-3.5 text-amber-400" />
          <span>Operational View • MMR & Results modifications restricted to Admins</span>
        </div>
      </div>

      {assistSuccess && (
        <div className="p-3 bg-emerald-950/40 border border-emerald-500/50 rounded-xl text-xs text-emerald-300 flex items-center justify-between">
          <span>{assistSuccess}</span>
          <button onClick={() => setAssistSuccess(null)} className="text-emerald-400 hover:text-white">✕</button>
        </div>
      )}

      {/* Filters Bar */}
      <div className="bg-[#0b0e14] border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Status filter */}
          <div className="flex rounded-xl bg-[#121620] p-1 border border-slate-800">
            <button
              onClick={() => setFilterStatus('IN_PROGRESS')}
              className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${
                filterStatus === 'IN_PROGRESS' ? 'bg-red-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              Live Now
            </button>
            <button
              onClick={() => setFilterStatus('PENDING')}
              className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${
                filterStatus === 'PENDING' ? 'bg-red-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              Pending Lobbies
            </button>
            <button
              onClick={() => setFilterStatus('ALL')}
              className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${
                filterStatus === 'ALL' ? 'bg-red-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              All Matches
            </button>
          </div>

          {/* Game filter */}
          <select
            value={filterGame}
            onChange={(e) => setFilterGame(e.target.value)}
            className="bg-[#121620] border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-red-500"
          >
            <option value="ALL">All Games</option>
            <option value="CHESS">Chess</option>
            <option value="FC26">EA SPORTS FC 26</option>
            <option value="FC27">EA SPORTS FC 27</option>
            <option value="VALORANT">Valorant 5v5</option>
            <option value="CS2">Counter-Strike 2</option>
          </select>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search players or teams..."
            className="w-full bg-[#121620] border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-red-500 placeholder:text-slate-600"
          />
        </div>
      </div>

      {/* Matches Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredMatches.length === 0 ? (
          <div className="col-span-full py-16 text-center text-slate-500 bg-[#0b0e14] border border-slate-800 rounded-2xl">
            <Swords className="w-10 h-10 mx-auto mb-2 text-slate-600 opacity-50" />
            <p className="text-sm font-medium">No activity yet</p>
            <p className="text-xs mt-1 text-slate-600">No active competitive matches found for the selected filter.</p>
          </div>
        ) : (
          filteredMatches.map((m) => {
            const isLive = m.status === 'IN_PROGRESS';
            const is5v5 = m.format === '5v5' || (m.game && ['VALORANT', 'CS2'].includes(m.game));

            return (
              <div
                key={m.id}
                className="bg-[#0b0e14] border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition-all flex flex-col justify-between"
              >
                <div>
                  {/* Top line */}
                  <div className="flex items-center justify-between mb-3">
                    <span className="px-2.5 py-0.5 rounded text-[11px] font-bold font-mono bg-red-600/20 text-red-400 border border-red-500/30">
                      {m.game || 'MATCH'} • {m.format || '1v1'}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                      isLive ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 animate-pulse' : 'bg-slate-800 text-slate-400'
                    }`}>
                      {m.status}
                    </span>
                  </div>

                  {/* Competitors */}
                  <div className="space-y-2 py-2">
                    <div className="flex items-center justify-between p-2 rounded-xl bg-[#121620] border border-slate-800">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-blue-600/20 text-blue-400 flex items-center justify-center text-xs font-bold font-mono">
                          A
                        </div>
                        <span className="text-xs font-bold text-white truncate max-w-[150px]">
                          {m.teamAName || m.playerAName || 'Side A'}
                        </span>
                      </div>
                      <span className="text-xs font-mono text-slate-400">
                        {m.scoreA !== undefined ? m.scoreA : '-'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between p-2 rounded-xl bg-[#121620] border border-slate-800">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-red-600/20 text-red-400 flex items-center justify-center text-xs font-bold font-mono">
                          B
                        </div>
                        <span className="text-xs font-bold text-white truncate max-w-[150px]">
                          {m.teamBName || m.playerBName || 'Side B'}
                        </span>
                      </div>
                      <span className="text-xs font-mono text-slate-400">
                        {m.scoreB !== undefined ? m.scoreB : '-'}
                      </span>
                    </div>
                  </div>

                  {/* Informational note for 5v5 lobbies */}
                  {is5v5 && (
                    <div className="mt-2 text-[10px] text-slate-500 font-mono flex items-center gap-1">
                      <Monitor className="w-3 h-3 text-cyan-500" />
                      <span>10 PCs allocated informatively</span>
                    </div>
                  )}
                </div>

                {/* Bottom Actions */}
                <div className="pt-3 mt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
                  <button
                    onClick={() => setAssistMatch(m)}
                    className="flex-1 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <MessageSquare className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Assist Players</span>
                  </button>

                  {onSelectMatch && (
                    <button
                      onClick={() => onSelectMatch(m.id)}
                      className="px-3 py-1.5 bg-red-600/20 hover:bg-red-600/30 border border-red-500/40 text-red-300 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>View</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Assist Players Modal */}
      {assistMatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#0b0e14] border border-cyan-500/40 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-600/20 border border-cyan-500/50 flex items-center justify-center text-cyan-400">
                <MessageSquare className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white uppercase tracking-wider font-display">
                  Assist Match Participants
                </h3>
                <p className="text-xs text-slate-400">Match ID: {assistMatch.id.slice(0, 8)}</p>
              </div>
            </div>

            <form onSubmit={handleSendAssistNotification} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block mb-1">
                  Operational Message to Competitors
                </label>
                <textarea
                  required
                  rows={3}
                  value={assistMessage}
                  onChange={(e) => setAssistMessage(e.target.value)}
                  placeholder="e.g. Please ready up your lobby, or notify staff if you are experiencing network lag..."
                  className="w-full bg-[#121620] border border-slate-700 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-cyan-500 placeholder:text-slate-600 resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setAssistMatch(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold uppercase tracking-wider"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={assistLoading || !assistMessage.trim()}
                  className="px-5 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-[0_0_20px_rgba(6,182,212,0.4)] flex items-center gap-2"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Send Notification</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
