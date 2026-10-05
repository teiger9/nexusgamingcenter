import React from 'react';
import { AlertCircle, ArrowRight, X, Shield, Swords } from 'lucide-react';
import { Match } from '../types';

interface ActiveLobbyAlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenCurrentLobby: () => void;
  activeLobby?: Match | null;
  customTitle?: string;
  customMessage?: string;
}

export const ActiveLobbyAlertModal: React.FC<ActiveLobbyAlertModalProps> = ({
  isOpen,
  onClose,
  onOpenCurrentLobby,
  activeLobby,
  customTitle = 'YOU ARE ALREADY IN AN ACTIVE LOBBY',
  customMessage = 'A Nexus player can only belong to one active 5v5 lobby at a time. Please complete or leave your current lobby before joining or creating another.',
}) => {
  if (!isOpen) return null;

  return (
    <div
      id="active-lobby-alert-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div
        id="active-lobby-alert-modal-card"
        className="w-full max-w-md bg-[#0f0f14] border border-amber-500/30 rounded-3xl p-6 shadow-[0_0_50px_rgba(245,158,11,0.15)] space-y-5 relative"
      >
        {/* Close Button */}
        <button
          id="btn-close-active-lobby-alert"
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header with Icon */}
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0 shadow-inner">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div className="pr-6">
            <h2 className="text-lg font-black font-display text-white tracking-wide">
              {customTitle}
            </h2>
            <p className="text-xs text-amber-300/80 font-mono mt-1 leading-relaxed">
              {customMessage}
            </p>
          </div>
        </div>

        {/* Lobby Details Card */}
        {activeLobby && (
          <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-2.5 font-mono text-xs">
            <div className="flex items-center justify-between text-slate-400 pb-2 border-b border-slate-800/70">
              <span className="flex items-center gap-1.5 text-slate-300 font-bold">
                <Swords className="w-3.5 h-3.5 text-cyan-400" />
                <span>Current Lobby:</span>
              </span>
              <strong className="text-cyan-400 font-bold tracking-widest text-sm">
                {activeLobby.lobbyCode || activeLobby.id}
              </strong>
            </div>

            <div className="flex items-center justify-between text-slate-400">
              <span>Game:</span>
              <span className="text-slate-200 font-semibold">{activeLobby.gameName || 'Ranked 5v5'}</span>
            </div>

            <div className="flex items-center justify-between text-slate-400">
              <span>Station:</span>
              <span className="text-slate-200 font-semibold">Station #{activeLobby.station || 1}</span>
            </div>

            <div className="flex items-center justify-between text-slate-400">
              <span>Status:</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 uppercase">
                {activeLobby.status}
              </span>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            id="btn-dismiss-active-lobby-alert"
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
          >
            DISMISS
          </button>
          <button
            id="btn-open-current-lobby"
            type="button"
            onClick={onOpenCurrentLobby}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-black font-mono text-xs font-black uppercase tracking-wider transition-all shadow-[0_0_20px_rgba(245,158,11,0.35)] flex items-center gap-2 cursor-pointer active:scale-95"
          >
            <span>OPEN CURRENT LOBBY</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
