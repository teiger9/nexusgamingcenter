import React, { useState, useEffect } from 'react';
import { Match } from '../types';
import { subscribeToAll5v5Matches, approveMatchRequest, rejectMatchRequest, cancelMatch } from '../services/matchService';
import { useAuth } from '../context/AuthContext';
import { useToast } from './Toast';
import { AdminForceEndModal } from './AdminForceEndModal';
import {
  Swords,
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Check,
  Shield,
  Trash2,
  ExternalLink,
  Crown,
  Play,
  RotateCcw,
  Zap,
} from 'lucide-react';

interface AdminLobbiesViewProps {
  onSelectMatch: (matchId: string) => void;
  onSelectTeamProfile: (teamId: string) => void;
}

export const AdminLobbiesView: React.FC<AdminLobbiesViewProps> = ({
  onSelectMatch,
  onSelectTeamProfile,
}) => {
  const { user, playerProfile, isAdmin } = useAuth();
  const { showToast } = useToast();

  const [lobbies, setLobbies] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [gameFilter, setGameFilter] = useState<'ALL' | 'valorant' | 'cs2'>('ALL');
  const [actionLoading, setActionLoading] = useState(false);

  // Rejection modal
  const [rejectingMatchId, setRejectingMatchId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  // Cancellation modal
  const [cancellingMatchId, setCancellingMatchId] = useState<string | null>(null);
  const [cancellationReason, setCancellationReason] = useState('');

  // Force end modal
  const [forceEndMatch, setForceEndMatch] = useState<Match | null>(null);

  useEffect(() => {
    const unsub = subscribeToAll5v5Matches((all) => {
      setLobbies(all);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const filteredLobbies = lobbies.filter((m) => {
    if (gameFilter !== 'ALL' && m.gameId !== gameFilter) return false;
    if (statusFilter !== 'ALL' && m.status !== statusFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchCode = (m.lobbyCode || '').toLowerCase();
      const tA = (m.teamAName || '').toLowerCase();
      const tB = (m.teamBName || '').toLowerCase();
      const cA = (m.playerAGamerTag || '').toLowerCase();
      const cB = (m.playerBGamerTag || '').toLowerCase();
      const st = (m.station || '').toLowerCase();
      return matchCode.includes(q) || tA.includes(q) || tB.includes(q) || cA.includes(q) || cB.includes(q) || st.includes(q);
    }
    return true;
  });

  const handleApprove = async (matchId: string) => {
    if (!user || !playerProfile) return;
    setActionLoading(true);
    try {
      const res = await approveMatchRequest({
        matchId,
        adminId: user.uid,
        adminName: playerProfile.gamerTag || 'Nexus Admin',
      });
      if (res.success) {
        showToast('success', 'Lobby Approved', '5v5 lobby is now approved for live play.');
      } else {
        showToast('error', 'Approval failed', res.error);
      }
    } catch (err: any) {
      showToast('error', 'Error', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!user || !playerProfile || !rejectingMatchId) return;
    setActionLoading(true);
    try {
      const res = await rejectMatchRequest({
        matchId: rejectingMatchId,
        adminId: user.uid,
        adminName: playerProfile.gamerTag || 'Nexus Admin',
        reason: rejectionReason,
      });
      if (res.success) {
        showToast('info', 'Lobby Rejected', '5v5 request was rejected.');
        setRejectingMatchId(null);
        setRejectionReason('');
      } else {
        showToast('error', 'Reject failed', res.error);
      }
    } catch (err: any) {
      showToast('error', 'Error', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelLobby = async () => {
    if (!user || !playerProfile || !cancellingMatchId) return;
    setActionLoading(true);
    try {
      const res = await cancelMatch({
        matchId: cancellingMatchId,
        actorId: user.uid,
        actorName: playerProfile.gamerTag || 'Nexus Admin',
        reason: cancellationReason,
        isAdmin: true,
      });
      if (res.success) {
        showToast('warning', 'Lobby Cancelled', 'Admin cancelled 5v5 lobby.');
        setCancellingMatchId(null);
        setCancellationReason('');
      } else {
        showToast('error', 'Cancel failed', res.error);
      }
    } catch (err: any) {
      showToast('error', 'Error', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Swords className="w-5 h-5 text-cyan-400" />
            <h1 className="text-xl font-black font-display text-white">5v5 LOBBIES & STATIONS</h1>
          </div>
          <p className="text-xs text-slate-400 font-mono mt-0.5">
            Real-time management for competitive 5v5 lobbies across Valorant and CS2
          </p>
        </div>

        {/* Game Filters */}
        <div className="flex items-center gap-1 bg-[#121218] p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => setGameFilter('ALL')}
            className={`px-3 py-1 rounded-lg text-xs font-mono font-bold transition-all ${
              gameFilter === 'ALL' ? 'bg-cyan-400 text-black' : 'text-slate-400 hover:text-white'
            }`}
          >
            ALL
          </button>
          <button
            onClick={() => setGameFilter('valorant')}
            className={`px-3 py-1 rounded-lg text-xs font-mono font-bold transition-all ${
              gameFilter === 'valorant' ? 'bg-cyan-400 text-black' : 'text-slate-400 hover:text-white'
            }`}
          >
            VALORANT
          </button>
          <button
            onClick={() => setGameFilter('cs2')}
            className={`px-3 py-1 rounded-lg text-xs font-mono font-bold transition-all ${
              gameFilter === 'cs2' ? 'bg-cyan-400 text-black' : 'text-slate-400 hover:text-white'
            }`}
          >
            CS2
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search lobby code, team, captain, station..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-[#121218] border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 font-mono"
          />
        </div>

        {/* Status Filter Dropdown */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-slate-400">Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 bg-[#121218] border border-slate-800 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-cyan-400"
          >
            <option value="ALL">All Statuses ({lobbies.length})</option>
            <option value="WAITING_FOR_OPPONENT">Waiting for Challenger</option>
            <option value="READY_CHECK">Ready Check</option>
            <option value="WAITING_FOR_ADMIN">Awaiting Staff Approval</option>
            <option value="APPROVED">Approved / Ready</option>
            <option value="LIVE">Live In Progress</option>
            <option value="AWAITING_RESULTS">Awaiting Results</option>
            <option value="PENDING_ADMIN_APPROVAL">Pending Admin Result Approval</option>
            <option value="DISPUTED">Disputed</option>
            <option value="CONFIRMED">Confirmed</option>
            <option value="CANCELLED">Cancelled</option>
            <option value="REJECTED">Rejected</option>
          </select>
        </div>
      </div>

      {/* Lobbies List */}
      {loading ? (
        <div className="py-16 text-center">
          <div className="inline-block w-8 h-8 border-3 border-cyan-400 border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-slate-400 text-xs font-mono">Loading 5v5 Lobbies...</p>
        </div>
      ) : filteredLobbies.length === 0 ? (
        <div className="bg-[#0a0a0f] border border-slate-800 rounded-3xl p-12 text-center space-y-2">
          <Swords className="w-8 h-8 text-slate-600 mx-auto" />
          <h3 className="text-base font-bold text-white">No 5v5 Lobbies Found</h3>
          <p className="text-xs text-slate-500">No lobbies match your filter criteria.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredLobbies.map((lobby) => {
            const isPendingApproval = lobby.status === 'WAITING_FOR_ADMIN';
            const isLive = lobby.status === 'LIVE';
            const isDisputed = lobby.status === 'DISPUTED';
            const isCancellable = ['WAITING_FOR_OPPONENT', 'OPPONENT_JOINED', 'WAITING_FOR_ADMIN', 'APPROVED', 'LIVE'].includes(lobby.status);

            return (
              <div
                key={lobby.id}
                className={`p-5 rounded-3xl bg-[#0a0a0f] border transition-all space-y-4 shadow-xl ${
                  isPendingApproval
                    ? 'border-amber-500/50 bg-amber-950/10'
                    : isDisputed
                    ? 'border-rose-500/50 bg-rose-950/10'
                    : isLive
                    ? 'border-cyan-500/50'
                    : 'border-slate-800'
                }`}
              >
                {/* Lobby Header */}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 font-mono font-bold text-[10px] uppercase">
                        {lobby.gameName} 5v5
                      </span>
                      {lobby.lobbyCode && (
                        <span className="text-xs font-mono font-black text-white bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                          Code: {lobby.lobbyCode}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 font-mono mt-1 flex items-center gap-2 flex-wrap">
                      <span>Station: <strong className="text-white">{lobby.station}</strong></span>
                      <span>•</span>
                      <span>💻 PCs: <strong className="text-cyan-400">{lobby.pcCount || 10}</strong></span>
                    </div>
                  </div>

                  <span
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold ${
                      lobby.status === 'LIVE'
                        ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30 animate-pulse'
                        : lobby.status === 'CONFIRMED'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : lobby.status === 'WAITING_FOR_ADMIN'
                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 animate-bounce'
                        : lobby.status === 'DISPUTED'
                        ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                        : lobby.status === 'CANCELLED'
                        ? 'bg-slate-800 text-slate-500 line-through'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {lobby.status.replace(/_/g, ' ')}
                  </span>
                </div>

                {/* Matchup strip */}
                <div className="p-3 rounded-2xl bg-[#121218] border border-slate-800 grid grid-cols-2 gap-3 text-xs font-mono">
                  <div className="space-y-1">
                    <div className="text-[10px] text-slate-400">Team A (Host)</div>
                    <div className="font-bold text-white truncate">{lobby.teamAName}</div>
                    <div className="text-[10px] text-cyan-400">Cap: {lobby.playerAGamerTag}</div>
                  </div>

                  <div className="space-y-1 text-right">
                    <div className="text-[10px] text-slate-400">Team B (Challenger)</div>
                    <div className="font-bold text-white truncate">{lobby.teamBName || 'Waiting for Squad...'}</div>
                    <div className="text-[10px] text-cyan-400">
                      {lobby.playerBGamerTag ? `Cap: ${lobby.playerBGamerTag}` : 'None'}
                    </div>
                  </div>
                </div>

                {/* Cancellation / Rejection info if applicable */}
                {lobby.cancellationReason && (
                  <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-[11px] font-mono text-rose-300">
                    <strong>Cancellation Reason:</strong> {lobby.cancellationReason}
                  </div>
                )}

                {/* Actions Bar */}
                <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
                  <button
                    onClick={() => onSelectMatch(lobby.id)}
                    className="text-xs font-mono text-cyan-400 hover:underline flex items-center gap-1"
                  >
                    <span>Enter Match Room</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>

                  <div className="flex items-center gap-1.5">
                    {isPendingApproval && (
                      <>
                        <button
                          onClick={() => handleApprove(lobby.id)}
                          disabled={actionLoading}
                          className="px-3 py-1 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-black font-mono font-bold text-xs flex items-center gap-1"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Approve</span>
                        </button>
                        <button
                          onClick={() => setRejectingMatchId(lobby.id)}
                          disabled={actionLoading}
                          className="px-3 py-1 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 font-mono font-bold text-xs"
                        >
                          Reject
                        </button>
                      </>
                    )}

                    {(isLive || isDisputed) && isAdmin && (
                      <button
                        onClick={() => setForceEndMatch(lobby)}
                        className="px-2.5 py-1 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/30 text-xs font-mono font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <Zap className="w-3 h-3" />
                        <span>Force End</span>
                      </button>
                    )}

                    {isCancellable && isAdmin && (
                      <button
                        onClick={() => setCancellingMatchId(lobby.id)}
                        disabled={actionLoading}
                        className="p-1.5 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
                        title="Cancel Lobby"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Reject Modal */}
      {rejectingMatchId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#0a0a0f] border border-slate-800 rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-white font-display">Reject 5v5 Lobby</h3>
            <p className="text-xs text-slate-400">
              Provide a clear reason for rejecting this 5v5 lobby request.
            </p>
            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="e.g. Station maintenance, tournament conflict..."
              rows={3}
              className="w-full p-3 bg-[#121218] border border-slate-800 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-cyan-400"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setRejectingMatchId(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-xs text-white font-mono"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={actionLoading || !rejectionReason.trim()}
                className="px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-400 text-white font-mono font-bold text-xs"
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancellation Modal */}
      {cancellingMatchId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#0a0a0f] border border-slate-800 rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-white font-display">Cancel 5v5 Lobby</h3>
            <p className="text-xs text-slate-400">
              Please enter the administrative reason for closing/cancelling this lobby.
            </p>
            <textarea
              value={cancellationReason}
              onChange={(e) => setCancellationReason(e.target.value)}
              placeholder="e.g. Center closing, hardware restart, team disconnected..."
              rows={3}
              className="w-full p-3 bg-[#121218] border border-slate-800 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-cyan-400"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setCancellingMatchId(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-xs text-white font-mono"
              >
                Cancel
              </button>
              <button
                onClick={handleCancelLobby}
                disabled={actionLoading || !cancellationReason.trim()}
                className="px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-400 text-white font-mono font-bold text-xs"
              >
                Confirm Cancellation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Force End Modal */}
      {forceEndMatch && (
        <AdminForceEndModal
          isOpen={true}
          match={forceEndMatch}
          onClose={() => setForceEndMatch(null)}
          onSuccess={() => {
            setForceEndMatch(null);
            showToast('success', 'Match Overridden', 'Admin force end completed.');
          }}
        />
      )}
    </div>
  );
};
