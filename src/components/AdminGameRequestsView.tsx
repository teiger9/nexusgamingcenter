import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  subscribeToPendingMatchRequests,
  approveMatchRequest,
  rejectMatchRequest,
} from '../services/matchService';
import { Match } from '../types';
import { useToast } from './Toast';
import {
  ShieldAlert,
  Swords,
  CheckCircle2,
  XCircle,
  Clock,
  Radio,
  Gamepad2,
  User,
  AlertTriangle,
  ArrowRight,
  Sparkles,
} from 'lucide-react';

interface AdminGameRequestsViewProps {
  onSelectMatch?: (matchId: string) => void;
}

export const AdminGameRequestsView: React.FC<AdminGameRequestsViewProps> = ({ onSelectMatch }) => {
  const { user, playerProfile, isAdmin } = useAuth();
  const { showToast } = useToast();

  const [requests, setRequests] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // Modal states
  const [approvingMatch, setApprovingMatch] = useState<Match | null>(null);
  const [rejectingMatch, setRejectingMatch] = useState<Match | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  const REASON_PRESETS = [
    'Players are not present at station',
    'Incorrect opponent selected',
    'Station conflict or station occupied',
    'Game station mismatch',
    'Casual / unranked friendly game',
  ];

  useEffect(() => {
    const unsub = subscribeToPendingMatchRequests((data) => {
      setRequests(data);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  const handleApprove = async () => {
    if (!approvingMatch || !user || !playerProfile) return;
    setActionLoading(true);
    try {
      const res = await approveMatchRequest({
        matchId: approvingMatch.id,
        adminId: user.uid,
        adminName: playerProfile.gamerTag || 'Nexus Admin',
      });

      if (res.success) {
        showToast(
          'success',
          'Ranked Match Approved!',
          `${approvingMatch.playerAGamerTag} vs ${approvingMatch.playerBGamerTag} at ${approvingMatch.station} is ready to start.`
        );
        setApprovingMatch(null);
      } else {
        showToast('error', 'Failed to approve match', res.error);
      }
    } catch (err: any) {
      showToast('error', 'Approval error', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!rejectingMatch || !user || !playerProfile) return;
    setActionLoading(true);
    try {
      const res = await rejectMatchRequest({
        matchId: rejectingMatch.id,
        adminId: user.uid,
        adminName: playerProfile.gamerTag || 'Nexus Admin',
        reason: rejectionReason.trim() || 'Declined by Nexus Staff',
      });

      if (res.success) {
        showToast('warning', 'Match Request Declined', 'The request has been rejected and archived.');
        setRejectingMatch(null);
        setRejectionReason('');
      } else {
        showToast('error', 'Failed to reject match', res.error);
      }
    } catch (err: any) {
      showToast('error', 'Rejection error', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="py-20 text-center">
        <div className="inline-block w-8 h-8 border-3 border-cyan-400 border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-slate-400 text-xs font-mono">Listening for live match requests...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-black font-display text-white">PENDING GAME REQUESTS</h2>
            {requests.length > 0 && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-yellow-500/20 text-yellow-400 border border-yellow-500/40 animate-pulse">
                {requests.length} Pending
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Ranked matches require official referee approval before players can initiate live gameplay.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-mono font-bold flex items-center gap-1.5">
            <Radio className="w-3.5 h-3.5 animate-spin" />
            <span>Live Queue Active</span>
          </span>
        </div>
      </div>

      {/* Requests List */}
      {requests.length === 0 ? (
        <div className="p-12 rounded-3xl bg-[#0a0a0f] border border-slate-800 text-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-7 h-7" />
          </div>
          <h3 className="text-lg font-bold font-display text-white">No Pending Match Requests</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            All ranked match requests have been reviewed. When competitors queue up at stations, their requests will appear here instantly.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {requests.map((req) => (
            <div
              key={req.id}
              className="p-5 sm:p-6 rounded-3xl bg-[#0a0a0f] border-2 border-yellow-500/40 shadow-xl space-y-4 hover:border-yellow-500/70 transition-all relative overflow-hidden"
            >
              <div className="absolute -top-16 -right-16 w-40 h-40 bg-yellow-500/5 rounded-full blur-2xl pointer-events-none" />

              {/* Card Top: Station & Time */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-xl bg-slate-800 border border-slate-700 text-xs font-mono font-black text-cyan-400">
                    {req.station}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold ${
                      req.gameCategory === 'PC'
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                        : req.gameCategory === 'PS5'
                        ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                        : 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30'
                    }`}
                  >
                    {req.gameCategory}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 text-xs text-slate-400 font-mono">
                  <Clock className="w-3.5 h-3.5 text-slate-500" />
                  <span>{new Date(req.createdAt).toLocaleTimeString()}</span>
                </div>
              </div>

              {/* Game Title */}
              <div>
                <div className="text-[11px] font-mono font-bold text-slate-400 uppercase tracking-wider">
                  Game Title
                </div>
                <div className="text-lg font-black font-display text-white mt-0.5">
                  {req.gameName}
                </div>
              </div>

              {/* Matchup Banner */}
              {req.matchType === '5v5' ? (
                <div className="p-3.5 rounded-2xl bg-[#15151b] border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[10px] font-mono text-cyan-400 font-bold uppercase">Team A (5v5)</div>
                      <div className="font-display font-bold text-sm text-white">{req.teamAName || 'Team A'}</div>
                    </div>
                    <div className="w-7 h-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-display font-bold text-[10px] text-yellow-400 shrink-0">
                      VS
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] font-mono text-blue-400 font-bold uppercase">Team B (5v5)</div>
                      <div className="font-display font-bold text-sm text-white">{req.teamBName || 'Team B'}</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800/60 text-[10px] font-mono text-slate-400">
                    <div>
                      {(req.teamAPlayers || []).map((p, idx) => (
                        <div key={p.id || idx} className="truncate">{idx + 1}. {p.gamerTag}</div>
                      ))}
                    </div>
                    <div className="text-right">
                      {(req.teamBPlayers || []).map((p, idx) => (
                        <div key={p.id || idx} className="truncate">{idx + 1}. {p.gamerTag}</div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-3.5 rounded-2xl bg-[#15151b] border border-slate-800 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <div className="text-[10px] font-mono text-cyan-400 font-bold uppercase">Competitor A</div>
                    <div className="font-display font-bold text-sm text-white">{req.playerAGamerTag}</div>
                    <div className="text-[11px] text-slate-400">{req.playerAName}</div>
                  </div>

                  <div className="w-7 h-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-display font-bold text-[10px] text-yellow-400 shrink-0 mx-2">
                    VS
                  </div>

                  <div className="space-y-0.5 text-right">
                    <div className="text-[10px] font-mono text-cyan-400 font-bold uppercase">Competitor B</div>
                    <div className="font-display font-bold text-sm text-white">{req.playerBGamerTag}</div>
                    <div className="text-[11px] text-slate-400">{req.playerBName}</div>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="pt-2 border-t border-slate-800 flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setApprovingMatch(req)}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs uppercase tracking-wider transition-all shadow-[0_0_15px_rgba(16,185,129,0.3)] flex items-center justify-center gap-2 active:scale-95"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>APPROVE</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setRejectingMatch(req);
                    setRejectionReason('');
                  }}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 active:scale-95"
                >
                  <XCircle className="w-4 h-4" />
                  <span>REJECT</span>
                </button>

                {onSelectMatch && (
                  <button
                    type="button"
                    onClick={() => onSelectMatch(req.id)}
                    className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                    title="View Room"
                  >
                    <ArrowRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* APPROVE CONFIRMATION MODAL */}
      {approvingMatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
          <div className="relative w-full max-w-md bg-[#0a0a0f] border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 animate-scale-up">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.2)]">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-black font-display text-white">APPROVE RANKED MATCH</h3>
                <p className="text-xs text-slate-400">Confirm referee authorization for station play</p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-[#15151b] border border-slate-800 space-y-2.5 text-xs font-mono">
              <div className="flex justify-between">
                <span className="text-slate-400">Game:</span>
                <span className="font-bold text-white">{approvingMatch.gameName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Station:</span>
                <span className="font-bold text-cyan-400">{approvingMatch.station}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Competitors:</span>
                <span className="font-bold text-white">
                  {approvingMatch.matchType === '5v5'
                    ? `${approvingMatch.teamAName || 'Team A'} vs ${approvingMatch.teamBName || 'Team B'} (5v5)`
                    : `${approvingMatch.playerAGamerTag} vs ${approvingMatch.playerBGamerTag}`}
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Approving will update the match status to <strong className="text-emerald-400">APPROVED</strong> and allow the competitors to start their live match timer.
            </p>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setApprovingMatch(null)}
                disabled={actionLoading}
                className="flex-1 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold uppercase tracking-wider transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApprove}
                disabled={actionLoading}
                className="flex-1 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-black uppercase tracking-wider transition-all shadow-[0_0_20px_rgba(16,185,129,0.35)] flex items-center justify-center gap-2"
              >
                {actionLoading ? (
                  <span className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                ) : (
                  <span>APPROVE MATCH</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REJECT MODAL */}
      {rejectingMatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
          <div className="relative w-full max-w-md bg-[#0a0a0f] border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 animate-scale-up">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-500/20 border border-red-500/40 flex items-center justify-center text-red-400 shadow-[0_0_15px_rgba(239,68,68,0.2)]">
                <XCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-black font-display text-white">REJECT MATCH REQUEST</h3>
                <p className="text-xs text-slate-400">Decline ranked match request with reason</p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider font-mono">
                Select Reason or Note
              </label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {REASON_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setRejectionReason(preset)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-mono transition-all text-left ${
                      rejectionReason === preset
                        ? 'bg-red-500/30 text-red-300 border border-red-500/50'
                        : 'bg-[#15151b] text-slate-400 border border-slate-800 hover:text-white'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>

              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Reason for declining match request..."
                rows={3}
                className="w-full p-3 bg-[#15151b] border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-red-500"
              />
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setRejectingMatch(null)}
                disabled={actionLoading}
                className="flex-1 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold uppercase tracking-wider transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleReject}
                disabled={actionLoading}
                className="flex-1 py-3 rounded-xl bg-red-500 hover:bg-red-400 text-white text-xs font-black uppercase tracking-wider transition-all shadow-[0_0_20px_rgba(239,68,68,0.35)] flex items-center justify-center gap-2"
              >
                {actionLoading ? (
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <span>REJECT REQUEST</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
