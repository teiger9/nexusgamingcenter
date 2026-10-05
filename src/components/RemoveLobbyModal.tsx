import React from 'react';
import { Trash2, AlertTriangle, Loader2, X } from 'lucide-react';

interface RemoveLobbyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  lobbyCode?: string;
  gameName?: string;
  station?: number | string;
  isSubmitting?: boolean;
}

export const RemoveLobbyModal: React.FC<RemoveLobbyModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  lobbyCode,
  gameName,
  station,
  isSubmitting = false,
}) => {
  if (!isOpen) return null;

  return (
    <div
      id="remove-lobby-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div
        id="remove-lobby-modal-card"
        className="w-full max-w-md bg-[#0f0f14] border border-rose-500/30 rounded-3xl p-6 shadow-[0_0_50px_rgba(244,63,94,0.15)] space-y-5 relative"
      >
        {/* Close Button */}
        <button
          id="btn-close-remove-modal"
          onClick={onClose}
          disabled={isSubmitting}
          className="absolute top-5 right-5 p-2 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-slate-400 hover:text-white transition-colors disabled:opacity-50"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Icon & Heading */}
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-center justify-center shrink-0 shadow-inner">
            <Trash2 className="w-6 h-6" />
          </div>
          <div className="pr-6">
            <h2 className="text-lg font-black font-display text-white tracking-wide">
              CLOSE THIS LOBBY?
            </h2>
            <p className="text-xs text-rose-300/80 font-mono mt-1 leading-relaxed">
              Players will no longer be able to join this lobby.
            </p>
          </div>
        </div>

        {/* Details Card */}
        {lobbyCode && (
          <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800/80 space-y-1.5 font-mono text-xs">
            <div className="flex items-center justify-between text-slate-400">
              <span>Lobby Code:</span>
              <strong className="text-cyan-400 font-bold tracking-widest">{lobbyCode}</strong>
            </div>
            {gameName && (
              <div className="flex items-center justify-between text-slate-400">
                <span>Game:</span>
                <span className="text-slate-200 font-semibold">{gameName}</span>
              </div>
            )}
            {station !== undefined && (
              <div className="flex items-center justify-between text-slate-400">
                <span>Station:</span>
                <span className="text-slate-200 font-semibold">Station #{station}</span>
              </div>
            )}
          </div>
        )}

        {/* Warning Note */}
        <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-2.5 text-[11px] text-amber-300 font-mono">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <span>
            This action will cancel active recruitment, close open invitations, and release all roster slots.
          </span>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            id="btn-cancel-remove-lobby"
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-50 cursor-pointer"
          >
            CANCEL
          </button>
          <button
            id="btn-confirm-remove-lobby"
            data-testid="btn-confirm-close-lobby"
            type="button"
            onClick={onConfirm}
            disabled={isSubmitting}
            className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-mono text-xs font-black uppercase tracking-wider transition-all shadow-[0_0_20px_rgba(244,63,94,0.35)] flex items-center gap-2 disabled:opacity-50 cursor-pointer active:scale-95"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>CLOSING...</span>
              </>
            ) : (
              <>
                <Trash2 className="w-3.5 h-3.5" />
                <span>CLOSE LOBBY</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
