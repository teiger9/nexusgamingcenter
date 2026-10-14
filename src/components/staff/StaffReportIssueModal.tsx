import React, { useState } from 'react';
import { GamingPost, Player } from '../../types';
import { staffReportStationIssue } from '../../services/reservationService';
import { X, AlertTriangle, Wrench, CheckCircle2 } from 'lucide-react';

interface StaffReportIssueModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (blockId: string) => void;
  post: GamingPost | null;
  staffPlayer: Player;
}

export const StaffReportIssueModal: React.FC<StaffReportIssueModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  post,
  staffPlayer,
}) => {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !post) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError('Please provide details regarding the technical issue.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const blockId = await staffReportStationIssue(
        post.id,
        post.name,
        reason.trim(),
        staffPlayer,
        post.type
      );
      onSuccess(blockId);
      onClose();
    } catch (err: any) {
      console.error('Error reporting station issue:', err);
      setError(err.message || 'Failed to report station issue');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-[#0b0e14] border border-amber-500/40 rounded-2xl w-full max-w-md shadow-[0_0_40px_rgba(245,158,11,0.2)] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-[#07090e]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-600/20 border border-amber-500/50 flex items-center justify-center text-amber-400">
              <Wrench className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white font-display uppercase tracking-wide">
                Report Technical Issue
              </h3>
              <p className="text-xs text-slate-400">Station: {post.name} ({post.type})</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-950/40 border border-red-500/50 rounded-xl text-xs text-red-200 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="p-3 bg-amber-950/20 border border-amber-500/30 rounded-xl text-xs text-amber-300">
            <p className="font-bold mb-1">Operational Notice:</p>
            <p className="text-[11px] text-slate-400">
              Reporting this station will flag it as <strong>MAINTENANCE</strong> and block future bookings until resolved. Staff cannot alter permanent machine specs.
            </p>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block mb-1">
              Issue Description *
            </label>
            <textarea
              required
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. GPU artifacting, controller stick drift, screen flicker, broken headset port..."
              className="w-full bg-[#121620] border border-slate-700/80 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-amber-500 placeholder:text-slate-600 resize-none"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !reason.trim()}
              className="px-5 py-2.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-neutral-950 rounded-xl text-xs font-black uppercase tracking-wider shadow-[0_0_20px_rgba(245,158,11,0.4)] transition-all flex items-center gap-2 cursor-pointer font-display"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-neutral-950 border-t-transparent rounded-full animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )}
              <span>Flag Station</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
