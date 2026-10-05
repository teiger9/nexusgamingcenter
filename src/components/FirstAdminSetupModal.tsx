import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from './Toast';
import { Shield, ShieldAlert, CheckCircle2, Lock, ArrowRight, X } from 'lucide-react';

interface FirstAdminSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FirstAdminSetupModal: React.FC<FirstAdminSetupModalProps> = ({ isOpen, onClose }) => {
  const { user, playerProfile, hasAdminInSystem, claimFirstAdmin, refreshProfile } = useAuth();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleClaim = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await claimFirstAdmin();
      if (res.success) {
        await refreshProfile();
        showToast('success', 'Admin Role Granted', 'Your account has been granted Administrator permissions.');
        onClose();
      } else {
        setError(res.error || 'Could not claim Admin role.');
      }
    } catch (e: any) {
      setError(e.message || 'Error claiming role');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
      <div className="relative w-full max-w-lg bg-[#0a0a0f] border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-xl font-bold font-display text-white">Nexus Admin Initial Setup</h3>
            <p className="text-xs text-slate-400 font-mono">Security & staff configuration</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3.5 rounded-xl bg-red-950/60 border border-red-500/40 text-red-300 text-xs font-mono">
            {error}
          </div>
        )}

        <div className="space-y-4 text-sm text-slate-300">
          {!hasAdminInSystem ? (
            <>
              <div className="p-4 rounded-2xl bg-yellow-500/10 border border-yellow-500/30 text-yellow-200 text-xs flex items-start gap-2.5">
                <ShieldAlert className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">No Administrator configured yet.</span>
                  <p className="mt-1 text-yellow-300/90 leading-relaxed">
                    Nexus Gaming Center requires at least one Administrator to manage games, monitor live matches, and resolve player disputes.
                  </p>
                </div>
              </div>

              {user ? (
                <div>
                  <p className="text-xs text-slate-400 mb-3 font-mono">
                    You are logged in as <strong className="text-cyan-400">{playerProfile?.gamerTag}</strong> ({playerProfile?.email}).
                  </p>
                  <button
                    onClick={handleClaim}
                    disabled={loading}
                    className="w-full py-3.5 px-4 rounded-xl bg-cyan-400 hover:bg-cyan-300 disabled:bg-slate-800 text-black font-black text-xs uppercase tracking-wider transition-all shadow-[0_0_15px_rgba(34,211,238,0.3)] flex items-center justify-center gap-2 active:scale-95"
                  >
                    {loading ? (
                      <span className="inline-block w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <span>CLAIM FIRST ADMINISTRATOR ROLE</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <div className="p-4 rounded-2xl bg-[#15151b] border border-slate-800 text-center">
                  <p className="text-xs text-slate-400">
                    Please log in or register your account first, then click here to claim the Admin role.
                  </p>
                </div>
              )}
            </>
          ) : (
            <div className="p-4 rounded-2xl bg-[#15151b] border border-slate-800 space-y-3">
              <div className="flex items-center gap-2 text-cyan-400 font-bold text-xs font-mono">
                <CheckCircle2 className="w-4 h-4" />
                <span>Administrator account is already initialized</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Nexus Gaming Center has active staff. If you require staff privileges, please ask an existing Administrator to promote your Gamer Tag from the Admin Players section.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
