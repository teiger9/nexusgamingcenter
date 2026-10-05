import React, { useState, useEffect } from 'react';
import { AuditLog } from '../types';
import { subscribeToAuditLogs } from '../services/auditService';
import {
  FileText,
  Search,
  Filter,
  Clock,
  Shield,
  User,
  Swords,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';

export const AdminAuditLogView: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    setLoading(true);
    const unsub = subscribeToAuditLogs((data) => {
      setLogs(data);
      setLoading(false);
    }, actionFilter);
    return () => unsub();
  }, [actionFilter]);

  const filteredLogs = logs.filter((l) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const act = (l.action || '').toLowerCase();
      const actor = (l.actorName || l.actorId || '').toLowerCase();
      const det = (l.details || '').toLowerCase();
      const tgt = (l.targetId || '').toLowerCase();
      return act.includes(q) || actor.includes(q) || det.includes(q) || tgt.includes(q);
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-cyan-400" />
            <h1 className="text-xl font-black font-display text-white">SYSTEM AUDIT LOGS</h1>
          </div>
          <p className="text-xs text-slate-400 font-mono mt-0.5">
            Immutable chronological record of all competitive center actions, team updates, referee decisions, and lobby lifecycle events
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-slate-400">Action:</span>
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="px-3 py-1.5 bg-[#121218] border border-slate-800 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-cyan-400"
          >
            <option value="ALL">All Actions</option>
            <option value="TEAM_CREATED">Team Created</option>
            <option value="PLAYER_REMOVED">Player Removed from Squad</option>
            <option value="PLAYER_INVITED">Player Invited to Squad</option>
            <option value="PLAYER_JOINED">Player Joined Squad</option>
            <option value="PLAYER_LEFT_TEAM">Player Left Squad</option>
            <option value="CAPTAIN_TRANSFERRED">Captaincy Transferred</option>
            <option value="TEAM_DISBANDED">Team Disbanded</option>
            <option value="LOBBY_CANCELLED">Lobby Cancelled</option>
            <option value="MATCH_APPROVED">Match Approved</option>
            <option value="MATCH_REJECTED">Match Rejected</option>
            <option value="MATCH_CANCELLED">Match Cancelled</option>
          </select>
        </div>
      </div>

      {/* Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search audit details, actor, target ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-[#121218] border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 font-mono"
          />
        </div>

        <div className="text-xs font-mono text-slate-400">
          Showing <strong className="text-white">{filteredLogs.length}</strong> recorded event(s)
        </div>
      </div>

      {/* Logs Table */}
      {loading ? (
        <div className="py-16 text-center">
          <div className="inline-block w-8 h-8 border-3 border-cyan-400 border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-slate-400 text-xs font-mono">Loading Audit Logs...</p>
        </div>
      ) : filteredLogs.length === 0 ? (
        <div className="bg-[#0a0a0f] border border-slate-800 rounded-3xl p-12 text-center space-y-2">
          <FileText className="w-8 h-8 text-slate-600 mx-auto" />
          <h3 className="text-base font-bold text-white">No Audit Records Found</h3>
          <p className="text-xs text-slate-500">No logs match your filter criteria.</p>
        </div>
      ) : (
        <div className="bg-[#0a0a0f] border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-[#121218] text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">Action</th>
                  <th className="py-3 px-4">Actor</th>
                  <th className="py-3 px-4">Target Type</th>
                  <th className="py-3 px-4">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredLogs.map((log) => {
                  const dateStr = new Date(log.timestamp).toLocaleString();
                  return (
                    <tr key={log.id} className="hover:bg-slate-900/40 transition-colors">
                      <td className="py-3 px-4 text-slate-400 whitespace-nowrap text-[11px]">
                        {dateStr}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            log.action.includes('REMOVED') || log.action.includes('CANCELLED') || log.action.includes('REJECTED') || log.action.includes('DISBANDED')
                              ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                              : log.action.includes('APPROVED') || log.action.includes('CREATED') || log.action.includes('JOINED')
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                          }`}
                        >
                          {log.action}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-bold text-white whitespace-nowrap">
                        {log.actorName || log.actorId || 'System'}
                      </td>
                      <td className="py-3 px-4 uppercase text-slate-400 text-[10px]">
                        {log.targetType}
                      </td>
                      <td className="py-3 px-4 text-slate-300 font-sans text-xs max-w-md">
                        {log.details}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
