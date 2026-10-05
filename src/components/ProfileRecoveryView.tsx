import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from './Toast';
import { NexusLogo } from './NexusLogo';
import { User, Gamepad2, Phone, ArrowRight, ShieldCheck, AlertCircle } from 'lucide-react';
import { normalizeGamerTag, normalizePhoneNumber } from '../utils/firestoreSanitizer';

export const ProfileRecoveryView: React.FC = () => {
  const { user, completeMissingProfile, logout } = useAuth();
  const { showToast } = useToast();

  const [fullName, setFullName] = useState(user?.displayName || '');
  const [gamerTag, setGamerTag] = useState(user?.displayName || '');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = fullName.trim();
    if (!trimmedName || trimmedName.length < 2) {
      setError('Please provide your full name (at least 2 characters).');
      return;
    }

    const tagVal = normalizeGamerTag(gamerTag);
    if (!tagVal.isValid) {
      setError(tagVal.error || 'Please enter a valid GamerTag.');
      return;
    }

    if (phoneNumber.trim()) {
      const phoneVal = normalizePhoneNumber(phoneNumber);
      if (!phoneVal.isValid) {
        setError(phoneVal.error || 'Please enter a valid phone number.');
        return;
      }
    }

    setLoading(true);

    try {
      const res = await completeMissingProfile({
        fullName: trimmedName,
        gamerTag: tagVal.displayTag,
        phoneNumber,
      });

      if (res.success) {
        showToast('success', 'Profile Initialized!', 'Your Nexus competitive dossier is now complete.');
      } else {
        setError(res.error || 'Failed to complete profile.');
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg bg-[#0a0a0f] border border-cyan-500/40 rounded-3xl p-6 sm:p-10 shadow-[0_0_50px_rgba(34,211,238,0.15)] relative">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <NexusLogo size="lg" showWordmark={false} glow={true} />
          </div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-950/60 border border-cyan-500/30 text-cyan-400 text-xs font-mono font-bold mb-3">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>ACCOUNT IDENTITY VERIFIED</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black font-display text-white tracking-tight">
            FINISHING YOUR NEXUS ACCOUNT...
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-2">
            Your security identity is authenticated (<span className="text-cyan-400 font-mono">{user?.email}</span>),
            but your competitive player profile needs to be initialized.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-950/70 border border-red-500/50 text-red-200 text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <span className="leading-relaxed">{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1 font-mono">
              Full Name *
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                required
                placeholder="e.g. Mohamed Ali"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-[#15151b] border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1 font-mono">
              Gamer Tag (Nexus Username) *
            </label>
            <div className="relative">
              <Gamepad2 className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                required
                placeholder="e.g. ShadowSniper"
                value={gamerTag}
                onChange={(e) => setGamerTag(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-[#15151b] border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
              />
            </div>
            <p className="text-[10px] text-slate-500 mt-1 font-mono">
              3-20 letters, numbers, underscores, and hyphens. Starts at 1000 MMR.
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1 font-mono">
              Phone Number (Optional)
            </label>
            <div className="relative">
              <Phone className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="tel"
                placeholder="+1 555 0192"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-[#15151b] border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-4 py-3.5 px-4 rounded-xl bg-cyan-400 hover:bg-cyan-300 disabled:bg-slate-800 text-black font-black text-xs uppercase tracking-[0.15em] transition-all shadow-[0_0_20px_rgba(34,211,238,0.35)] flex items-center justify-center gap-2 active:scale-95 cursor-pointer disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <span className="inline-block w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                <span>FINALIZING PROFILE...</span>
              </>
            ) : (
              <>
                <span>COMPLETE MY NEXUS PROFILE</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="mt-6 pt-5 border-t border-slate-800/80 text-center">
          <button
            onClick={logout}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
          >
            Sign out of this session
          </button>
        </div>
      </div>
    </div>
  );
};
