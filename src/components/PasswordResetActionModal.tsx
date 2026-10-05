import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { NexusLogo } from './NexusLogo';
import { Lock, Eye, EyeOff, AlertCircle, CheckCircle2, RotateCcw, ArrowRight, ShieldCheck, KeyRound } from 'lucide-react';
import { validatePassword } from '../utils/firestoreSanitizer';

interface PasswordResetActionModalProps {
  onRequestNewLink: () => void;
  onOpenLogin: (prefilledEmail?: string) => void;
}

type ResetStep = 'verifying' | 'form' | 'submitting' | 'invalid_link' | 'success';

export const PasswordResetActionModal: React.FC<PasswordResetActionModalProps> = ({
  onRequestNewLink,
  onOpenLogin,
}) => {
  const { verifyResetCode, completePasswordReset } = useAuth();

  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<ResetStep>('verifying');
  const [oobCode, setOobCode] = useState<string>('');
  const [verifiedEmail, setVerifiedEmail] = useState<string>('');
  
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Check URL parameters for password reset action code
  useEffect(() => {
    const parseResetCodeFromUrl = () => {
      // 1. Check standard search query params
      const searchParams = new URLSearchParams(window.location.search);
      let mode = searchParams.get('mode');
      let code = searchParams.get('oobCode');

      // 2. Also check hash query params if routed via hash
      if (!code && window.location.hash.includes('oobCode=')) {
        const hashPart = window.location.hash.includes('?')
          ? window.location.hash.split('?')[1]
          : window.location.hash.replace(/^#/, '');
        const hashParams = new URLSearchParams(hashPart);
        mode = mode || hashParams.get('mode');
        code = code || hashParams.get('oobCode');
      }

      if (mode === 'resetPassword' && code) {
        setOobCode(code);
        setIsOpen(true);
        setStep('verifying');
        verifyCode(code);
      }
    };

    parseResetCodeFromUrl();
  }, []);

  const verifyCode = async (code: string) => {
    setErrorMessage(null);
    const res = await verifyResetCode(code);
    if (res.success && res.email) {
      setVerifiedEmail(res.email);
      setStep('form');
    } else {
      setStep('invalid_link');
      setErrorMessage(res.error || 'THIS PASSWORD RESET LINK IS NO LONGER VALID.');
    }
  };

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!newPassword) {
      setErrorMessage('Password is required.');
      return;
    }

    const passCheck = validatePassword(newPassword);
    if (!passCheck.isValid) {
      setErrorMessage(passCheck.error || 'Password must be at least 6 characters with letters and numbers.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage('Passwords do not match. Please verify both fields.');
      return;
    }

    setStep('submitting');

    try {
      const res = await completePasswordReset(oobCode, newPassword);

      if (res.success) {
        setStep('success');
        // Clean URL to prevent re-triggering this one-time code on reload
        try {
          const cleanUrl = window.location.origin + window.location.pathname;
          window.history.replaceState({}, document.title, cleanUrl);
        } catch {
          // ignore
        }
      } else if (res.isInvalidCode) {
        setStep('invalid_link');
        setErrorMessage('THIS PASSWORD RESET LINK IS NO LONGER VALID.');
      } else {
        setStep('form');
        setErrorMessage(res.error || 'Unable to reset password. Please try again.');
      }
    } catch (err: any) {
      setStep('form');
      setErrorMessage(err.message || 'An unexpected error occurred during password reset.');
    }
  };

  if (!isOpen) return null;

  return (
    <div
      id="nexus-password-reset-action-modal"
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn"
    >
      <div className="relative w-full max-w-md bg-[#0f1015] border border-cyan-500/30 rounded-2xl p-6 sm:p-8 shadow-[0_0_50px_rgba(0,0,0,0.8),0_0_30px_rgba(34,211,238,0.15)] text-left">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="flex justify-center mb-3">
            <NexusLogo size="md" showWordmark={false} glow={true} />
          </div>

          {step === 'verifying' && (
            <>
              <h3 className="text-2xl font-black font-display tracking-tight text-white uppercase">
                VERIFYING RESET LINK
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Checking your Nexus password recovery authorization...
              </p>
            </>
          )}

          {step === 'form' && (
            <>
              <h3 className="text-2xl font-black font-display tracking-tight text-white uppercase">
                CREATE NEW PASSWORD
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Set a new password for <span className="text-cyan-400 font-mono font-medium">{verifiedEmail}</span>
              </p>
            </>
          )}

          {step === 'submitting' && (
            <>
              <h3 className="text-2xl font-black font-display tracking-tight text-white uppercase">
                UPDATING PASSWORD
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Securely confirming your new credentials with Firebase Auth...
              </p>
            </>
          )}

          {step === 'invalid_link' && (
            <>
              <h3 className="text-2xl font-black font-display tracking-tight text-red-400 uppercase">
                LINK EXPIRED OR INVALID
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Password recovery link verification failed.
              </p>
            </>
          )}

          {step === 'success' && (
            <>
              <h3 className="text-2xl font-black font-display tracking-tight text-emerald-400 uppercase">
                PASSWORD RESET SUCCESSFUL
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Your Nexus account credentials have been updated.
              </p>
            </>
          )}
        </div>

        {/* 1. VERIFYING SPINNER */}
        {step === 'verifying' && (
          <div className="py-8 flex flex-col items-center justify-center space-y-4">
            <div className="w-10 h-10 border-3 border-cyan-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-slate-400 font-mono tracking-wider uppercase">
              Verifying token authenticity...
            </p>
          </div>
        )}

        {/* 2. INVALID / EXPIRED LINK VIEW */}
        {step === 'invalid_link' && (
          <div className="space-y-5">
            <div className="p-4 rounded-xl bg-red-950/60 border border-red-500/50 text-red-200 text-xs flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-white text-sm">
                  THIS PASSWORD RESET LINK IS NO LONGER VALID.
                </p>
                <p className="mt-1 text-slate-300 leading-relaxed text-[11px]">
                  The reset link may have expired, was already used, or contains invalid parameters. For your account security, each password reset link can only be used once.
                </p>
              </div>
            </div>

            <button
              id="request-new-reset-link-btn"
              type="button"
              onClick={() => {
                setIsOpen(false);
                onRequestNewLink();
              }}
              className="w-full py-3.5 px-4 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-black font-black text-xs uppercase tracking-[0.15em] transition-all shadow-[0_0_20px_rgba(34,211,238,0.3)] flex items-center justify-center gap-2 cursor-pointer active:scale-95"
            >
              <KeyRound className="w-4 h-4" />
              <span>REQUEST A NEW RESET LINK</span>
            </button>

            <div className="text-center">
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onOpenLogin();
                }}
                className="text-xs text-slate-400 hover:text-white transition-colors cursor-pointer inline-flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Return to Login</span>
              </button>
            </div>
          </div>
        )}

        {/* 3. NEW PASSWORD FORM */}
        {(step === 'form' || step === 'submitting') && (
          <form onSubmit={handleResetSubmit} className="space-y-4" noValidate>
            {errorMessage && (
              <div className="p-3.5 rounded-xl bg-red-950/70 border border-red-500/50 text-red-200 text-xs flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{errorMessage}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1 font-mono">
                New Password <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  disabled={step === 'submitting'}
                  placeholder="At least 6 characters with letters & numbers"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full pl-10 pr-10 py-2.5 bg-[#15151b] border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[10px] text-slate-500 mt-1 font-mono">
                Minimum 6 characters. Passwords are never stored in plain text.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1 font-mono">
                Confirm New Password <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  required
                  disabled={step === 'submitting'}
                  placeholder="Re-enter your new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full pl-10 pr-10 py-2.5 bg-[#15151b] border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              id="confirm-password-reset-btn"
              type="submit"
              disabled={step === 'submitting'}
              className="w-full mt-2 py-3.5 px-4 rounded-xl bg-cyan-400 hover:bg-cyan-300 disabled:bg-slate-800 text-black font-black text-xs uppercase tracking-[0.15em] transition-all shadow-[0_0_20px_rgba(34,211,238,0.3)] flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed active:scale-95"
            >
              {step === 'submitting' ? (
                <>
                  <span className="inline-block w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                  <span>UPDATING CREDENTIALS...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>RESET PASSWORD</span>
                </>
              )}
            </button>
          </form>
        )}

        {/* 4. SUCCESS VIEW */}
        {step === 'success' && (
          <div className="space-y-5">
            <div className="p-4 rounded-xl bg-emerald-950/60 border border-emerald-500/50 text-emerald-200 text-xs flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-white text-sm">
                  PASSWORD RESET SUCCESSFUL
                </p>
                <p className="mt-1.5 text-slate-300 leading-relaxed text-xs">
                  Your Nexus account is still intact. You can now log in with your new password.
                </p>
                <p className="mt-2 text-[11px] text-emerald-300/80 font-mono">
                  Your permanent GamerTag, MMR, match history, and Nexus Coins remain unchanged.
                </p>
              </div>
            </div>

            <button
              id="password-reset-back-to-login-btn"
              type="button"
              onClick={() => {
                setIsOpen(false);
                onOpenLogin(verifiedEmail);
              }}
              className="w-full py-3.5 px-4 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-black font-black text-xs uppercase tracking-[0.15em] transition-all shadow-[0_0_20px_rgba(34,211,238,0.35)] flex items-center justify-center gap-2 cursor-pointer active:scale-95"
            >
              <span>BACK TO LOGIN</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
