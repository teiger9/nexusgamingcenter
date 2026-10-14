import React, { useState, useEffect } from 'react';
import { subscribeToLiveMatches } from '../services/matchService';
import { Match, STATIONS, Station } from '../types';
import { AdminForceEndModal } from './AdminForceEndModal';
import { useAuth } from '../context/AuthContext';
import { Radio, Swords, Clock, ArrowRight, CheckCircle2, AlertOctagon } from 'lucide-react';

interface AdminLiveMatchesViewProps {
  onSelectMatch: (matchId: string) => void;
}

export const AdminLiveMatchesView: React.FC<AdminLiveMatchesViewProps> = ({ onSelectMatch }) => {
  const { isAdmin, isStaff, isSuperAdmin } = useAuth();
  const isAuthorized = isAdmin || isStaff || isSuperAdmin;
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [forceEndMatchTarget, setForceEndMatchTarget] = useState<Match | null>(null);

  useEffect(() => {
    const unsub = subscribeToLiveMatches((data) => {
      setMatches(data);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  const stationMap = new Map<Station, Match>();
  matches.forEach((m) => {
    stationMap.set(m.station, m);
  });

  if (loading) {
    return (
      <div className="py-20 text-center">
        <div className="inline-block w-8 h-8 border-3 border-red-500 border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-slate-400 text-xs font-mono">Monitoring station telemetry...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black font-display text-white">LIVE STATION MONITOR</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-time station occupancy and active match state across the gaming center.
          </p>
        </div>
        <span className="px-3 py-1 rounded-full bg-red-500/20 text-red-400 border border-white/10 text-xs font-mono font-bold flex items-center gap-1.5">
          <Radio className="w-3.5 h-3.5 animate-spin" />
          <span>{matches.filter((m) => m.status === 'LIVE' || m.status === 'AWAITING_CONFIRMATION').length} Active Matches</span>
        </span>
      </div>

      {/* Grid of Stations */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {STATIONS.map((station) => {
          const activeMatch = stationMap.get(station.id);
          const isOccupied = !!activeMatch;

          return (
            <div
              key={station.id}
              className={`p-5 rounded-3xl border transition-all flex flex-col justify-between shadow-xl ${
                isOccupied
                  ? activeMatch.status === 'LIVE'
                    ? 'bg-[#07080c] border-red-500 shadow-[0_0_15px_rgba(220, 38, 38, 0.15)]'
                    : 'bg-[#07080c] border-yellow-500/40'
                  : 'bg-[#07080c]/60 border-slate-800'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="font-mono font-black text-sm text-white">{station.id}</span>
                  <span
                    className={`px-2.5 py-0.5 rounded-lg text-[10px] font-mono font-bold ${
                      isOccupied
                        ? activeMatch.status === 'LIVE'
                          ? 'bg-red-600 text-black animate-pulse font-black'
                          : 'bg-yellow-500 text-black font-black'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {isOccupied ? activeMatch.status : 'AVAILABLE'}
                  </span>
                </div>

                <div className="text-[11px] text-slate-400 font-semibold mb-2">{station.label}</div>

                {isOccupied ? (
                  <div className="space-y-2 mt-3 pt-3 border-t border-slate-800">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-red-500 font-display">
                        {activeMatch.gameName}
                      </span>
                      {activeMatch.matchType === '5v5' && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-red-500/20 text-red-400">
                          5v5
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-white font-semibold flex items-center gap-1.5 truncate">
                      {activeMatch.matchType === '5v5' ? (
                        <>
                          <span className="truncate">{activeMatch.teamAName || 'Team A'}</span>
                          <span className="text-slate-500 text-[10px] font-mono shrink-0">vs</span>
                          <span className="truncate">{activeMatch.teamBName || 'Team B'}</span>
                        </>
                      ) : (
                        <>
                          <span className="truncate">{activeMatch.playerAGamerTag}</span>
                          <span className="text-slate-500 text-[10px] font-mono shrink-0">vs</span>
                          <span className="truncate">{activeMatch.playerBGamerTag}</span>
                        </>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-500" />
                      <span>
                        Started:{' '}
                        {activeMatch.startedAt
                          ? new Date(activeMatch.startedAt).toLocaleTimeString()
                          : 'Waiting...'}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="py-4 text-center text-xs text-slate-500 font-mono">
                    Ready for next match
                  </div>
                )}
              </div>

              {isOccupied && (
                <div className="mt-4 space-y-2">
                  <button
                    onClick={() => onSelectMatch(activeMatch.id)}
                    className="w-full py-2.5 px-3 rounded-xl bg-[#0f1015] hover:bg-slate-800 text-red-500 text-xs font-bold transition-colors flex items-center justify-center gap-1.5 border border-slate-800 font-mono uppercase tracking-wider"
                  >
                    <span>View Match</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>

                  {isAuthorized && (
                    <button
                      onClick={() => setForceEndMatchTarget(activeMatch)}
                      className="w-full py-2 px-3 rounded-xl bg-red-600/20 hover:bg-red-600 text-red-300 hover:text-white border border-red-500/40 text-[11px] font-mono font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 active:scale-95 shadow-sm"
                    >
                      <AlertOctagon className="w-3.5 h-3.5" />
                      <span>🛑 END MATCH</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {forceEndMatchTarget && (
        <AdminForceEndModal
          match={forceEndMatchTarget}
          onClose={() => setForceEndMatchTarget(null)}
          onSuccess={() => setForceEndMatchTarget(null)}
        />
      )}
    </div>
  );
};

