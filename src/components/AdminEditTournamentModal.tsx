import React, { useState } from 'react';
import { Tournament, TournamentFormat, TournamentType, TournamentStatus } from '../types';
import { adminUpdateTournamentDetails } from '../services/tournamentService';
import { useToast } from './Toast';
import {
  X,
  Edit2,
  Calendar,
  MapPin,
  Trophy,
  AlertTriangle,
  Bell,
  CheckCircle2,
  Gamepad2,
  Shield,
  Clock,
  Layers,
} from 'lucide-react';

interface AdminEditTournamentModalProps {
  isOpen: boolean;
  onClose: () => void;
  tournament: Tournament;
  adminId: string;
  adminName: string;
  onSuccess?: () => void;
}

const GAME_OPTIONS = [
  { id: 'chess', name: 'Chess', category: 'CHESS' },
  { id: 'fc', name: 'FC', category: 'FC' },
  { id: 'valorant', name: 'Valorant', category: 'VALORANT' },
  { id: 'cs2', name: 'CS2', category: 'CS2' },
  { id: 'lol', name: 'League of Legends', category: 'LEAGUE_OF_LEGENDS' },
];

const LOCATION_OPTIONS = [
  'Main Arena (Stage)',
  'LAN PC Zone (Area A)',
  'LAN PC Zone (Area B)',
  'PS5 Lounge 1',
  'PS5 Lounge 2',
  'VIP Gaming Booth',
  'Online / Remote',
];

export const AdminEditTournamentModal: React.FC<AdminEditTournamentModalProps> = ({
  isOpen,
  onClose,
  tournament,
  adminId,
  adminName,
  onSuccess,
}) => {
  const { showToast } = useToast();

  const toLocalDateTimeString = (timestamp: number) => {
    const d = new Date(timestamp);
    const pad = (n: number) => (n < 10 ? `0${n}` : n);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const [name, setName] = useState(tournament.name);
  const [gameId, setGameId] = useState(tournament.gameId);
  const [description, setDescription] = useState(tournament.description || '');
  const [rules, setRules] = useState(tournament.rules || '');
  const [bannerUrl, setBannerUrl] = useState(tournament.bannerUrl || '');
  const [type, setType] = useState<TournamentType>(tournament.type);
  const [format, setFormat] = useState<TournamentFormat>(tournament.format);
  const [maxParticipants, setMaxParticipants] = useState<number>(tournament.maxParticipants);
  const [location, setLocation] = useState(tournament.location || 'Main Arena (Stage)');
  const [entryFee, setEntryFee] = useState(tournament.entryFee || 'Free');
  const [status, setStatus] = useState<TournamentStatus>(tournament.status);
  const [startDateStr, setStartDateStr] = useState(toLocalDateTimeString(tournament.startDate));
  const [endDateStr, setEndDateStr] = useState(
    tournament.endDate ? toLocalDateTimeString(tournament.endDate) : ''
  );
  const [notifyParticipants, setNotifyParticipants] = useState(true);
  const [saving, setSaving] = useState(false);

  if (!isOpen) return null;

  const hasBracket = tournament.matches && tournament.matches.length > 0;
  const isLive = tournament.status === 'LIVE';
  const participantsCount = tournament.participants?.length || 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      showToast('error', 'Validation Error', 'Tournament name is required.');
      return;
    }

    const selectedGame = GAME_OPTIONS.find((g) => g.id === gameId);
    const startDate = new Date(startDateStr).getTime();
    const endDate = endDateStr ? new Date(endDateStr).getTime() : undefined;

    if (isNaN(startDate)) {
      showToast('error', 'Validation Error', 'Valid start date is required.');
      return;
    }

    if (endDate && endDate < startDate) {
      showToast('error', 'Validation Error', 'End date cannot be earlier than start date.');
      return;
    }

    // Capacity check
    if (maxParticipants < participantsCount) {
      showToast(
        'error',
        'Capacity Conflict',
        `Max capacity cannot be smaller than current registered participants (${participantsCount}).`
      );
      return;
    }

    setSaving(true);
    try {
      const res = await adminUpdateTournamentDetails({
        tournamentId: tournament.id,
        updates: {
          name: name.trim(),
          gameId,
          gameName: selectedGame?.name || tournament.gameName,
          gameCategory: (selectedGame?.category as any) || tournament.gameCategory,
          description: description.trim(),
          rules: rules.trim(),
          bannerUrl: bannerUrl.trim() || undefined,
          type,
          format,
          maxParticipants,
          location: location.trim(),
          entryFee: entryFee.trim(),
          status,
          startDate,
          endDate,
        },
        adminId,
        adminName,
        notifyParticipants,
      });

      if (!res.success) {
        throw new Error(res.error || 'Failed to update tournament');
      }

      showToast('success', 'Tournament Updated', `"${name}" has been successfully updated.`);
      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      showToast('error', 'Update Failed', err.message || 'Error updating tournament details.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
      <div className="w-full max-w-3xl bg-[#0c0e18] border-2 border-cyan-500/50 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl my-8">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-cyan-400 text-black font-black">
              <Edit2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xl font-black font-display text-white">
                EDIT TOURNAMENT DETAILS
              </h3>
              <p className="text-xs text-cyan-400 font-mono">
                Full administrative control over tournament settings and schedule
              </p>
            </div>
          </div>
          <button
            id="close-edit-tournament-modal-btn"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Safety Warnings if Bracket or Live */}
        {hasBracket && (
          <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-mono flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <strong className="block text-amber-200">Bracket Already Generated ({tournament.matches?.length} Matches)</strong>
              Updating tournament format or type may require regenerating the bracket. Modifying dates and details will preserve all match records.
            </div>
          </div>
        )}

        {isLive && (
          <div className="p-3.5 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs font-mono flex items-start gap-3">
            <Shield className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div>
              <strong className="block text-red-200">Tournament Is Currently LIVE</strong>
              Matches are currently in progress. Changes should be made with care to avoid disrupting participants.
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5 text-xs font-mono">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Name */}
            <div className="md:col-span-2">
              <label className="block text-slate-300 uppercase text-[10px] font-bold mb-1.5">
                Tournament Name *
              </label>
              <input
                id="edit-tournament-name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white font-bold focus:border-cyan-400 focus:outline-none"
                placeholder="e.g. Nexus Valorant Champions Invitational Season 2"
              />
            </div>

            {/* Game */}
            <div>
              <label className="block text-slate-300 uppercase text-[10px] font-bold mb-1.5 flex items-center gap-1.5">
                <Gamepad2 className="w-3.5 h-3.5 text-cyan-400" />
                <span>Featured Game *</span>
              </label>
              <select
                id="edit-tournament-game"
                value={gameId}
                onChange={(e) => setGameId(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white font-bold focus:border-cyan-400 focus:outline-none"
              >
                {GAME_OPTIONS.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name} ({g.category})
                  </option>
                ))}
              </select>
            </div>

            {/* Status */}
            <div>
              <label className="block text-slate-300 uppercase text-[10px] font-bold mb-1.5 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-cyan-400" />
                <span>Tournament Status *</span>
              </label>
              <select
                id="edit-tournament-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as TournamentStatus)}
                className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white font-bold focus:border-cyan-400 focus:outline-none"
              >
                <option value="UPCOMING">Upcoming (Announced)</option>
                <option value="REGISTRATION_OPEN">Registration Open</option>
                <option value="LIVE">Live (Matches in progress)</option>
                <option value="COMPLETED">Completed</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>

            {/* Type */}
            <div>
              <label className="block text-slate-300 uppercase text-[10px] font-bold mb-1.5">
                Tournament Type *
              </label>
              <select
                id="edit-tournament-type"
                value={type}
                onChange={(e) => setType(e.target.value as TournamentType)}
                className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white font-bold focus:border-cyan-400 focus:outline-none"
              >
                <option value="INDIVIDUAL">1v1 Individual Player</option>
                <option value="TEAM">5v5 Team Tournament (1 Team = 1 Entry)</option>
              </select>
            </div>

            {/* Format */}
            <div>
              <label className="block text-slate-300 uppercase text-[10px] font-bold mb-1.5 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-cyan-400" />
                <span>Bracket Format *</span>
              </label>
              <select
                id="edit-tournament-format"
                value={format}
                onChange={(e) => setFormat(e.target.value as TournamentFormat)}
                className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white font-bold focus:border-cyan-400 focus:outline-none"
              >
                <option value="SINGLE_ELIMINATION">Single Elimination</option>
                <option value="DOUBLE_ELIMINATION">Double Elimination</option>
                <option value="ROUND_ROBIN">Round Robin</option>
                <option value="GROUP_STAGE_KNOCKOUT">Group Stage + Knockout</option>
              </select>
            </div>

            {/* Max Participants */}
            <div>
              <label className="block text-slate-300 uppercase text-[10px] font-bold mb-1.5">
                Max Participants (Slots) *
              </label>
              <select
                id="edit-tournament-max-participants"
                value={maxParticipants}
                onChange={(e) => setMaxParticipants(Number(e.target.value))}
                className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white font-bold focus:border-cyan-400 focus:outline-none"
              >
                <option value={4}>4 Slots</option>
                <option value={8}>8 Slots (Standard Quarterfinals)</option>
                <option value={16}>16 Slots (Standard Round of 16)</option>
                <option value={32}>32 Slots (Round of 32)</option>
                <option value={64}>64 Slots</option>
              </select>
              <span className="text-[10px] text-slate-500 mt-1 block">
                Currently registered: {participantsCount} {type === 'TEAM' ? 'teams' : 'players'}
              </span>
            </div>

            {/* Location / Zone */}
            <div>
              <label className="block text-slate-300 uppercase text-[10px] font-bold mb-1.5 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-cyan-400" />
                <span>Location / Zone *</span>
              </label>
              <input
                id="edit-tournament-location"
                type="text"
                list="location-options-list"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Main Arena (Stage)"
                className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white font-bold focus:border-cyan-400 focus:outline-none"
              />
              <datalist id="location-options-list">
                {LOCATION_OPTIONS.map((loc) => (
                  <option key={loc} value={loc} />
                ))}
              </datalist>
            </div>

            {/* Entry Fee */}
            <div>
              <label className="block text-slate-300 uppercase text-[10px] font-bold mb-1.5">
                Entry Fee
              </label>
              <input
                id="edit-tournament-entry-fee"
                type="text"
                value={entryFee}
                onChange={(e) => setEntryFee(e.target.value)}
                placeholder="e.g. Free or 1,000 DA per team"
                className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white font-bold focus:border-cyan-400 focus:outline-none"
              />
            </div>

            {/* Banner URL */}
            <div>
              <label className="block text-slate-300 uppercase text-[10px] font-bold mb-1.5">
                Cover / Banner Image URL
              </label>
              <input
                id="edit-tournament-banner-url"
                type="url"
                value={bannerUrl}
                onChange={(e) => setBannerUrl(e.target.value)}
                placeholder="https://images.unsplash.com/..."
                className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white font-mono focus:border-cyan-400 focus:outline-none text-xs"
              />
            </div>

            {/* Start Date & Time */}
            <div>
              <label className="block text-slate-300 uppercase text-[10px] font-bold mb-1.5 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-cyan-400" />
                <span>Start Date & Time *</span>
              </label>
              <input
                id="edit-tournament-start-date"
                type="datetime-local"
                required
                value={startDateStr}
                onChange={(e) => setStartDateStr(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white font-bold focus:border-cyan-400 focus:outline-none"
              />
            </div>

            {/* End Date & Time */}
            <div>
              <label className="block text-slate-300 uppercase text-[10px] font-bold mb-1.5 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-cyan-400" />
                <span>End Date & Time (Optional)</span>
              </label>
              <input
                id="edit-tournament-end-date"
                type="datetime-local"
                value={endDateStr}
                onChange={(e) => setEndDateStr(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white font-bold focus:border-cyan-400 focus:outline-none"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-slate-300 uppercase text-[10px] font-bold mb-1.5">
              Tournament Description
            </label>
            <textarea
              id="edit-tournament-description"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief overview of tournament, eligibility, and stage structure..."
              className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white focus:border-cyan-400 focus:outline-none leading-relaxed"
            />
          </div>

          {/* Rules */}
          <div>
            <label className="block text-slate-300 uppercase text-[10px] font-bold mb-1.5">
              Tournament Rules & Regulations
            </label>
            <textarea
              id="edit-tournament-rules"
              rows={2}
              value={rules}
              onChange={(e) => setRules(e.target.value)}
              placeholder="Format details, pause limits, disconnect policies, overtime rules..."
              className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white focus:border-cyan-400 focus:outline-none leading-relaxed"
            />
          </div>

          {/* Participant Notification Checkbox */}
          <div className="p-3.5 rounded-2xl bg-cyan-950/30 border border-cyan-500/30 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Bell className="w-4 h-4 text-cyan-400 shrink-0" />
              <div>
                <span className="text-white font-bold block text-xs">
                  Notify Registered Participants
                </span>
                <span className="text-slate-400 text-[10px]">
                  Automatically sends push notification alerts to all captains/players if schedule or details change.
                </span>
              </div>
            </div>
            <input
              type="checkbox"
              id="notify-participants-checkbox"
              checked={notifyParticipants}
              onChange={(e) => setNotifyParticipants(e.target.checked)}
              className="w-4 h-4 rounded text-cyan-500 focus:ring-cyan-400 bg-slate-900 border-slate-700 cursor-pointer"
            />
          </div>

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl bg-slate-900 text-slate-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              id="save-tournament-details-btn"
              disabled={saving}
              className="px-6 py-2.5 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-black font-black uppercase tracking-wider transition-all shadow-[0_0_20px_rgba(6,182,212,0.3)] disabled:opacity-50 flex items-center space-x-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{saving ? 'Saving...' : 'Save Tournament Changes'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
