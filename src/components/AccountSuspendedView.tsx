import React from 'react';
import { useAuth } from '../context/AuthContext';
import { ShieldAlert, LogOut, Phone, Mail } from 'lucide-react';
import { NexusLogo } from './NexusLogo';

export const AccountSuspendedView: React.FC = () => {
  const { playerProfile, accountStatusReason, logout } = useAuth();

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg bg-[#0d0909] border border-red-500/50 rounded-3xl p-6 sm:p-10 shadow-[0_0_50px_rgba(239,68,68,0.2)] text-center">
        <div className="flex justify-center mb-4">
          <NexusLogo size="lg" showWordmark={false} glow={false} />
        </div>

        <div className="w-16 h-16 rounded-2xl bg-red-950/80 border border-red-500/60 flex items-center justify-center mx-auto mb-4 text-red-400 shadow-[0_0_20px_rgba(239,68,68,0.3)]">
          <ShieldAlert className="w-8 h-8" />
        </div>

        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-950/80 border border-red-500/40 text-red-400 text-xs font-mono font-bold mb-3 uppercase tracking-wider">
          <span>ACCOUNT ACCESS RESTRICTED</span>
        </div>

        <h2 className="text-2xl sm:text-3xl font-black font-display text-white tracking-tight">
          ACCOUNT SUSPENDED
        </h2>

        <p className="text-sm text-red-300/90 mt-3 leading-relaxed">
          {accountStatusReason || 'This account has been suspended or disabled by Nexus Gaming Center administration.'}
        </p>

        <div className="my-6 p-4 rounded-2xl bg-neutral-950 border border-neutral-800 text-left text-xs space-y-2 text-slate-400">
          <div className="flex items-center justify-between pb-2 border-b border-neutral-900">
            <span className="font-mono text-slate-500">GamerTag:</span>
            <span className="font-bold text-white">{playerProfile?.gamerTag || 'Competitor'}</span>
          </div>
          <div className="flex items-center justify-between pb-2 border-b border-neutral-900">
            <span className="font-mono text-slate-500">Status:</span>
            <span className="font-mono text-red-400 font-bold">{playerProfile?.status || 'SUSPENDED'}</span>
          </div>
          <div className="flex items-center gap-2 pt-1 text-slate-400">
            <Phone className="w-3.5 h-3.5 text-red-400" />
            <span>Contact front desk or speak with Nexus tournament staff to appeal.</span>
          </div>
        </div>

        <button
          onClick={logout}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer"
        >
          <LogOut className="w-4 h-4" />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );
};
