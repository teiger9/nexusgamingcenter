import React, { useState, useEffect } from 'react';
import { Tournament, TournamentMatch } from '../types';
import {
  Calendar,
  Clock,
  MapPin,
  AlertTriangle,
  CheckCircle2,
  X,
  Swords,
  Save,
} from 'lucide-react';
import { adminRescheduleMatch } from '../services/tournamentService';
import { useToast } from './Toast';

interface MatchScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  tournament?: Tournament;
  tournamentId?: string;
  match: TournamentMatch | null;
  allMatches?: TournamentMatch[];
  adminId: string;
  adminName: string;
  onSaved?: () => void;
  onScheduledSuccess?: () => void;
}

export const MatchScheduleModal: React.FC<MatchScheduleModalProps> = ({
  isOpen,
  onClose,
  tournament,
  tournamentId: propTournamentId,
  match,
  allMatches = [],
  adminId,
  adminName,
  onSaved,
  onScheduledSuccess,
}) => {
  const { showToast } = useToast();

  const [matchDate, setMatchDate] = useState<string>('');
  const [matchTime, setMatchTime] = useState<string>('');
  const [station, setStation] = useState<string>('');
  const [durationMinutes, setDurationMinutes] = useState<number>(60);
  const [notes, setNotes] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);

  const effectiveTournamentId = tournament?.id || propTournamentId || '';
  const effectiveMatches = tournament?.matches || allMatches || [];

  useEffect(() => {
    if (match) {
      if (match.scheduledTime) {
        const d = new Date(match.scheduledTime);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        setMatchDate(`${year}-${month}-${day}`);
        setMatchTime(`${hours}:${minutes}`);
      } else {
        // Default to tournament date or today
        const defaultD = new Date(tournament?.startDate || Date.now());
        const year = defaultD.getFullYear();
        const month = String(defaultD.getMonth() + 1).padStart(2, '0');
        const day = String(defaultD.getDate()).padStart(2, '0');
        setMatchDate(`${year}-${month}-${day}`);
        setMatchTime('18:00');
      }

      setStation(match.station || 'Station-01');
      setNotes(match.notes || '');
      setDurationMinutes(60);
    }
  }, [match, tournament]);

  if (!isOpen || !match) return null;

  // Calculate target timestamp
  let targetTimestamp: number | undefined = undefined;
  if (matchDate && matchTime) {
    const [y, m, d] = matchDate.split('-').map(Number);
    const [h, min] = matchTime.split(':').map(Number);
    const dt = new Date(y, m - 1, d, h, min, 0);
    targetTimestamp = dt.getTime();
  }

  // Conflict detection preview
  let conflictWarning: string | null = null;
  if (station.trim() && targetTimestamp) {
    const windowMs = durationMinutes * 60 * 1000;
    const conflicting = effectiveMatches.find(
      (m) =>
        m.id !== match.id &&
        m.station &&
        m.station.trim().toLowerCase() === station.trim().toLowerCase() &&
        m.scheduledTime &&
        Math.abs(m.scheduledTime - targetTimestamp!) < windowMs
    );

    if (conflicting) {
      const otherTimeStr = new Date(conflicting.scheduledTime!).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
      conflictWarning = `Match #${conflicting.matchNumber} (${conflicting.participantAName || 'TBD'} vs ${conflicting.participantBName || 'TBD'}) is also assigned to "${station.trim()}" at ${otherTimeStr}.`;
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetTimestamp) {
      showToast('error', 'Incomplete Schedule', 'Please provide both match date and start time.');
      return;
    }

    setSaving(true);
    try {
      const res = await adminRescheduleMatch({
        tournamentId: effectiveTournamentId,
        matchId: match.id,
        scheduledTime: targetTimestamp,
        station: station.trim() || undefined,
        durationMinutes,
        notes: notes.trim() || undefined,
        adminId,
        adminName,
      });

      if (res.success) {
        if (res.conflictWarning) {
          showToast('warning', 'Schedule Saved with Warning', res.conflictWarning);
        } else {
          showToast(
            'success',
            'Match Scheduled!',
            `Match #${match.matchNumber} set for ${new Date(targetTimestamp).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })} at ${matchTime} (${station || 'Unassigned'}).`
          );
        }
        if (onSaved) onSaved();
        if (onScheduledSuccess) onScheduledSuccess();
        onClose();
      } else {
        showToast('error', 'Failed to Schedule', res.error || 'Could not update match schedule.');
      }
    } catch (err: any) {
      showToast('error', 'Error', err.message);
    } finally {
      setSaving(false);
    }
  };

  const predefinedStations = [
    'Main Stage Arena',
    'PC Station 01',
    'PC Station 02',
    'PC Station 03',
    'PC Station 04',
    'Console Arena 01',
    'Console Arena 02',
    'Virtual Stream Pod',
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/85 backdrop-blur-md animate-in fade-in overflow-y-auto">
      <div className="w-full max-w-lg rounded-3xl bg-[#0b0e18] border border-slate-800 shadow-[0_0_50px_rgba(0,0,0,0.8)] overflow-hidden my-8">
        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex items-start justify-between gap-4 bg-slate-900/40">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-mono font-bold uppercase">
                MATCH #{match.matchNumber}
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 text-xs font-mono font-bold uppercase">
                {match.roundName || `ROUND ${match.round}`}
              </span>
            </div>
            <h3 className="text-xl font-black font-display text-white uppercase tracking-tight">
              ASSIGN MATCH DATE & TIME
            </h3>
            <p className="text-xs text-slate-400 font-mono">
              {match.participantAName || 'TBD'} vs {match.participantBName || 'TBD'}
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSave} className="p-6 space-y-5">
          {/* Match Contestants Header Banner */}
          <div className="p-3.5 rounded-2xl bg-[#080b13] border border-slate-800 flex items-center justify-between gap-3">
            <div className="text-xs font-mono text-cyan-400 font-bold">
              {match.participantAName || 'Waiting for Team A'}
            </div>
            <div className="text-xs font-mono font-black text-slate-600 uppercase">VS</div>
            <div className="text-xs font-mono text-purple-400 font-bold">
              {match.participantBName || 'Waiting for Team B'}
            </div>
          </div>

          {/* Date and Time Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-mono text-slate-400 mb-1.5 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-cyan-400" />
                <span>Match Date</span>
              </label>
              <input
                type="date"
                required
                value={matchDate}
                onChange={(e) => setMatchDate(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/80 border border-slate-700 text-white font-mono text-sm focus:outline-none focus:border-cyan-500 transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-mono text-slate-400 mb-1.5 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-cyan-400" />
                <span>Start Time (Local)</span>
              </label>
              <input
                type="time"
                required
                value={matchTime}
                onChange={(e) => setMatchTime(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/80 border border-slate-700 text-white font-mono text-sm focus:outline-none focus:border-cyan-500 transition-colors"
              />
            </div>
          </div>

          {/* Station / Arena Selection */}
          <div>
            <label className="block text-xs font-mono text-slate-400 mb-1.5 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-cyan-400" />
              <span>Station / Pitch / Stage</span>
            </label>
            <input
              type="text"
              value={station}
              onChange={(e) => setStation(e.target.value)}
              placeholder="e.g. Main Stage Arena, PC Station 01"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/80 border border-slate-700 text-white font-mono text-sm focus:outline-none focus:border-cyan-500 transition-colors"
            />
            {/* Quick Stations Pills */}
            <div className="flex flex-wrap gap-1.5 mt-2">
              {predefinedStations.slice(0, 4).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStation(s)}
                  className={`text-[10px] font-mono px-2 py-0.5 rounded-lg border transition-colors ${
                    station === s
                      ? 'bg-cyan-500/20 border-cyan-400/40 text-cyan-300'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Station Conflict Warning Banner */}
          {conflictWarning && (
            <div className="p-3.5 rounded-2xl bg-amber-950/30 border border-amber-500/40 text-amber-300 text-xs font-mono flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold uppercase tracking-wider text-amber-400">
                  Potential Station Conflict Detected
                </div>
                <div className="text-[11px] text-amber-200/90 mt-0.5">
                  {conflictWarning}
                </div>
              </div>
            </div>
          )}

          {/* Notes Input */}
          <div>
            <label className="block text-xs font-mono text-slate-400 mb-1.5">
              Admin Scheduling Notes (Optional)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Broadcast feature match; check discord stream"
              className="w-full px-3.5 py-2 rounded-xl bg-slate-900/80 border border-slate-700 text-white text-xs font-mono focus:outline-none focus:border-cyan-500"
            />
          </div>

          {/* Action Buttons */}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono font-bold uppercase transition-all"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black text-xs font-mono font-black uppercase tracking-wider flex items-center gap-2 shadow-[0_0_20px_rgba(6,182,212,0.4)] transition-all cursor-pointer disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Saving...' : 'Save Schedule'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
