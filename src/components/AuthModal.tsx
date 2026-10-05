import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from './Toast';
import { NexusLogo } from './NexusLogo';
import {
  X,
  Lock,
  Mail,
  User,
  Phone,
  Gamepad2,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  KeyRound,
  RotateCcw,
  Clock,
} from 'lucide-react';
import {
  normalizeGamerTag,
  normalizePhoneNumber,
  validateEmail,
  validatePassword,
} from '../utils/firestoreSanitizer';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'login' | 'register' | 'forgot_password';
  prefilledEmail?: string;
  onSuccess?: () => void;
}

type ModalView = 'login' | 'register' | 'forgot_password';

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  initialMode = 'login',
  prefilledEmail,
  onSuccess,
}) => {
  const { loginPlayer, registerPlayer, sendPasswordReset } = useAuth();
  const { showToast } = useToast();

  const [view, setView] = useState<ModalView>(initialMode);
  const [loading, setLoading] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [resetSuccessMessage, setResetSuccessMessage] = useState<string | null>(null);
  const [emailAlreadyInUse, setEmailAlreadyInUse] = useState(false);
  const [resetCooldown, setResetCooldown] = useState(0);

  // Form inputs
  const [fullName, setFullName] = useState('');
  const [gamerTag, setGamerTag] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Field-specific validation errors
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // Rate-limiting cooldown timer
  useEffect(() => {
    if (resetCooldown <= 0) return;
    const timer = setInterval(() => {
      setResetCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resetCooldown]);

  useEffect(() => {
    if (isOpen) {
      setView(initialMode);
      setGeneralError(null);
      setResetSuccessMessage(null);
      setEmailAlreadyInUse(false);
      if (prefilledEmail) {
        setEmail(prefilledEmail);
      }
    }
  }, [isOpen, initialMode, prefilledEmail]);

  if (!isOpen) return null;

  // Validation computations
  const fullNameError =
    view === 'register' && touched.fullName && (!fullName.trim() || fullName.trim().length < 2)
      ? 'Full name must be at least 2 characters.'
      : null;

  const tagCheck = view === 'register' ? normalizeGamerTag(gamerTag) : { isValid: true, error: undefined as string | undefined };
  const gamerTagError =
    view === 'register' && touched.gamerTag && !tagCheck.isValid ? (tagCheck.error || 'Invalid GamerTag.') : null;

  const emailCheck = validateEmail(email);
  const emailError =
    touched.email && !email.trim()
      ? 'Email is required.'
      : touched.email && view !== 'login' && !emailCheck.isValid
      ? emailCheck.error
      : null;

  const phoneCheck = normalizePhoneNumber(phoneNumber);
  const phoneError =
    view === 'register' && touched.phoneNumber && phoneNumber.trim() && !phoneCheck.isValid
      ? phoneCheck.error
      : null;

  const passCheck = validatePassword(password);
  const passwordError =
    touched.password && !passCheck.isValid
      ? passCheck.error
      : null;

  const confirmPasswordError =
    view === 'register' && touched.confirmPassword && password !== confirmPassword
      ? 'Passwords do not match.'
      : null;

  const handleBlur = (field: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralError(null);

    // Mark all touched
    setTouched({
      fullName: true,
      gamerTag: true,
      email: true,
      phoneNumber: true,
      password: true,
      confirmPassword: true,
    });

    // Client-side verification
    if (!fullName.trim() || fullName.trim().length < 2) {
      setGeneralError('Please enter your full name (minimum 2 characters).');
      return;
    }

    const tagVal = normalizeGamerTag(gamerTag);
    if (!tagVal.isValid) {
      setGeneralError(tagVal.error || 'Please enter a valid GamerTag.');
      return;
    }

    const emailVal = validateEmail(email);
    if (!emailVal.isValid) {
      setGeneralError(emailVal.error || 'Please enter a valid email address.');
      return;
    }

    if (phoneNumber.trim()) {
      const phoneVal = normalizePhoneNumber(phoneNumber);
      if (!phoneVal.isValid) {
        setGeneralError(phoneVal.error || 'Please enter a valid phone number.');
        return;
      }
    }

    if (password.length < 6) {
      setGeneralError('Password must be at least 6 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setGeneralError('Passwords do not match. Please verify your confirmation password.');
      return;
    }

    setLoading(true);

    try {
      const res = await registerPlayer({
        fullName,
        gamerTag,
        email,
        phoneNumber,
        password,
        confirmPassword,
      });

      if (res.success) {
        showToast(
          'success',
          'Account Created Successfully!',
          `Welcome to Nexus Gaming Center, ${gamerTag}! Starting MMR: 1000.`
        );
        onSuccess?.();
        onClose();
      } else if (res.isEmailInUse) {
        setEmailAlreadyInUse(true);
        setGeneralError(null);
      } else {
        setEmailAlreadyInUse(false);
        setGeneralError(res.error || 'Failed to complete registration.');
        showToast('error', 'Registration Error', res.error);
      }
    } catch (err: any) {
      setGeneralError(err.message || 'An unexpected error occurred during account creation.');
    } finally {
      setLoading(false);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralError(null);

    setTouched({
      email: true,
      password: true,
    });

    const trimmedInput = email.trim();
    if (!trimmedInput) {
      setGeneralError('Please enter your registered email address or GamerTag.');
      return;
    }

    if (!password) {
      setGeneralError('Please enter your password.');
      return;
    }

    setLoading(true);

    try {
      const res = await loginPlayer(trimmedInput, password);
      if (res.success) {
        showToast('success', 'Welcome Back!', 'Signed into Nexus Gaming Center.');
        onSuccess?.();
        onClose();
      } else {
        setGeneralError(res.error || 'Incorrect email or password.');
      }
    } catch (err: any) {
      setGeneralError(err.message || 'Unable to sign in. Please verify your connection.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralError(null);
    setResetSuccessMessage(null);

    // 1. Normalize the email to lowercase and trim spaces
    const normalizedEmail = (email || '').trim().toLowerCase();

    // 2. Validate the email format
    if (!normalizedEmail) {
      setGeneralError('Please enter the email address associated with your Nexus account.');
      return;
    }

    const emailVal = validateEmail(normalizedEmail);
    if (!emailVal.isValid) {
      setGeneralError(emailVal.error || 'Please enter a valid email address.');
      return;
    }

    if (resetCooldown > 0) {
      setGeneralError(`Please wait ${resetCooldown} seconds before sending another reset request.`);
      return;
    }

    setLoading(true);

    try {
      // 3. Use Firebase Authentication's official password reset mechanism
      const res = await sendPasswordReset(normalizedEmail);

      if (res.success) {
        // 4. Show: "IF AN ACCOUNT EXISTS FOR THIS EMAIL, A PASSWORD RESET LINK HAS BEEN SENT."
        setResetSuccessMessage(res.message);
        setResetCooldown(60);
      } else {
        if (res.isRateLimited) {
          setResetCooldown(60);
        }
        setGeneralError(res.message);
      }
    } catch (err: any) {
      setGeneralError(err.message || 'Unable to process reset request. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-md bg-[#0a0a0f] border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl my-8">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          aria-label="Close modal"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="mb-6 text-center">
          <div className="flex justify-center mb-3">
            <NexusLogo size="md" showWordmark={false} glow={true} />
          </div>
          <h3 className="text-2xl font-black font-display tracking-tight text-white uppercase">
            {view === 'register' && 'JOIN NEXUS GAMING'}
            {view === 'login' && 'COMPETITOR LOGIN'}
            {view === 'forgot_password' && 'RESET YOUR PASSWORD'}
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            {view === 'register' && 'Create your competitive profile & start at 1000 MMR'}
            {view === 'login' && 'Sign in with your email or GamerTag to access your stats'}
            {view === 'forgot_password' && 'Enter the email address associated with your Nexus account.'}
          </p>
        </div>

        {/* Email Already Registered Resolution Banner */}
        {emailAlreadyInUse && (
          <div className="mb-5 p-4 rounded-2xl bg-amber-950/70 border border-amber-500/50 text-amber-200 text-xs space-y-3 animate-fadeIn">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-white text-sm">Account Already Exists</p>
                <p className="mt-1 text-amber-300/90 leading-relaxed">
                  An account is already registered with <strong className="text-white font-mono">{email}</strong>. Would you like to sign in or reset your password?
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setView('login');
                  setEmailAlreadyInUse(false);
                  setGeneralError(null);
                }}
                className="px-3.5 py-2 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-black font-black text-[11px] uppercase tracking-wider transition-colors cursor-pointer"
              >
                Sign In With This Email
              </button>
              <button
                type="button"
                onClick={() => {
                  setView('forgot_password');
                  setEmailAlreadyInUse(false);
                  setGeneralError(null);
                }}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-[11px] uppercase tracking-wider transition-colors cursor-pointer"
              >
                Reset Password
              </button>
            </div>
          </div>
        )}

        {/* General Error Banner */}
        {generalError && (
          <div className="mb-5 p-3.5 rounded-xl bg-red-950/70 border border-red-500/50 text-red-200 text-xs flex items-start gap-2.5 animate-fadeIn">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <span className="leading-relaxed">{generalError}</span>
          </div>
        )}

        {/* Password Reset Success Notice */}
        {resetSuccessMessage && (
          <div className="mb-5 p-4 rounded-xl bg-emerald-950/70 border border-emerald-500/50 text-emerald-200 text-xs flex items-start gap-2.5 animate-fadeIn">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span className="leading-relaxed">{resetSuccessMessage}</span>
          </div>
        )}

        {/* 1. REGISTRATION FORM */}
        {view === 'register' && (
          <form onSubmit={handleRegisterSubmit} className="space-y-3.5" noValidate>
            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1 font-mono">
                Full Name <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  name="name"
                  autoComplete="name"
                  required
                  placeholder="e.g. Mohamed Ali"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  onBlur={() => handleBlur('fullName')}
                  className={`w-full pl-10 pr-4 py-2.5 bg-[#15151b] border rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none transition-colors ${
                    fullNameError ? 'border-red-500/80 bg-red-950/20' : 'border-slate-800 focus:border-cyan-400'
                  }`}
                />
              </div>
              {fullNameError && <p className="text-[11px] text-red-400 mt-1">{fullNameError}</p>}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1 font-mono">
                Gamer Tag (Nexus Username) <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <Gamepad2 className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  name="username"
                  autoComplete="username"
                  required
                  placeholder="e.g. ShadowSniper"
                  value={gamerTag}
                  onChange={(e) => setGamerTag(e.target.value)}
                  onBlur={() => handleBlur('gamerTag')}
                  className={`w-full pl-10 pr-4 py-2.5 bg-[#15151b] border rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none transition-colors ${
                    gamerTagError ? 'border-red-500/80 bg-red-950/20' : 'border-slate-800 focus:border-cyan-400'
                  }`}
                />
              </div>
              {gamerTagError ? (
                <p className="text-[11px] text-red-400 mt-1">{gamerTagError}</p>
              ) : (
                <p className="text-[10px] text-slate-500 mt-1 font-mono">
                  3-20 letters, numbers, underscores, hyphens, and dots. Case-insensitive unique.
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1 font-mono">
                Email Address <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  name="email"
                  autoComplete="email"
                  required
                  placeholder="player@example.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (emailAlreadyInUse) setEmailAlreadyInUse(false);
                  }}
                  onBlur={() => handleBlur('email')}
                  className={`w-full pl-10 pr-4 py-2.5 bg-[#15151b] border rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none transition-colors ${
                    emailError ? 'border-red-500/80 bg-red-950/20' : 'border-slate-800 focus:border-cyan-400'
                  }`}
                />
              </div>
              {emailError && <p className="text-[11px] text-red-400 mt-1">{emailError}</p>}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1 font-mono">
                Phone Number (Optional)
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="tel"
                  name="tel"
                  autoComplete="tel"
                  placeholder="+1 555 0192"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  onBlur={() => handleBlur('phoneNumber')}
                  className={`w-full pl-10 pr-4 py-2.5 bg-[#15151b] border rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none transition-colors ${
                    phoneError ? 'border-red-500/80 bg-red-950/20' : 'border-slate-800 focus:border-cyan-400'
                  }`}
                />
              </div>
              {phoneError && <p className="text-[11px] text-red-400 mt-1">{phoneError}</p>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1 font-mono">
                  Password <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    name="new-password"
                    autoComplete="new-password"
                    required
                    placeholder="Min 6 chars"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onBlur={() => handleBlur('password')}
                    className={`w-full pl-10 pr-3 py-2.5 bg-[#15151b] border rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none transition-colors ${
                      passwordError ? 'border-red-500/80 bg-red-950/20' : 'border-slate-800 focus:border-cyan-400'
                    }`}
                  />
                </div>
                {passwordError && <p className="text-[11px] text-red-400 mt-1">{passwordError}</p>}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1 font-mono">
                  Confirm Password <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <ShieldCheck className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    name="confirm-password"
                    autoComplete="new-password"
                    required
                    placeholder="Repeat password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    onBlur={() => handleBlur('confirmPassword')}
                    className={`w-full pl-10 pr-3 py-2.5 bg-[#15151b] border rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none transition-colors ${
                      confirmPasswordError
                        ? 'border-red-500/80 bg-red-950/20'
                        : 'border-slate-800 focus:border-cyan-400'
                    }`}
                  />
                </div>
                {confirmPasswordError && (
                  <p className="text-[11px] text-red-400 mt-1">{confirmPasswordError}</p>
                )}
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-3.5 px-4 rounded-xl bg-cyan-400 hover:bg-cyan-300 disabled:bg-slate-800 text-black font-black text-xs uppercase tracking-[0.15em] transition-all shadow-[0_0_20px_rgba(34,211,238,0.35)] flex items-center justify-center gap-2 active:scale-95 cursor-pointer disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <span className="inline-block w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                  <span>CREATING YOUR NEXUS ACCOUNT...</span>
                </>
              ) : (
                <>
                  <span>CREATE COMPETITOR ACCOUNT</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        )}

        {/* 2. LOGIN FORM */}
        {view === 'login' && (
          <form onSubmit={handleLoginSubmit} className="space-y-4" noValidate>
            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5 font-mono">
                Email Address or GamerTag <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  name="username"
                  autoComplete="username"
                  required
                  placeholder="player@example.com or ShadowSniper"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => handleBlur('email')}
                  className="w-full pl-10 pr-4 py-2.5 bg-[#15151b] border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider font-mono">
                  Password <span className="text-red-400">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setView('forgot_password');
                    setGeneralError(null);
                    setResetSuccessMessage(null);
                  }}
                  className="text-[11px] text-cyan-400 hover:text-cyan-300 transition-colors cursor-pointer"
                >
                  Forgot Password?
                </button>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  name="password"
                  autoComplete="current-password"
                  required
                  placeholder="Enter your account password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onBlur={() => handleBlur('password')}
                  className="w-full pl-10 pr-4 py-2.5 bg-[#15151b] border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                />
              </div>
            </div>

            <button
              id="login-submit-btn"
              type="submit"
              disabled={loading}
              className="w-full mt-3 py-3.5 px-4 rounded-xl bg-cyan-400 hover:bg-cyan-300 disabled:bg-slate-800 text-black font-black text-xs uppercase tracking-[0.15em] transition-all shadow-[0_0_20px_rgba(34,211,238,0.35)] flex items-center justify-center gap-2 active:scale-95 cursor-pointer disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <span className="inline-block w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                  <span>LOGGING IN TO NEXUS...</span>
                </>
              ) : (
                <>
                  <span>LOGIN</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            <button
              id="login-forgot-password-btn"
              type="button"
              onClick={() => {
                setView('forgot_password');
                setGeneralError(null);
                setResetSuccessMessage(null);
              }}
              className="w-full py-2.5 px-4 rounded-xl border border-slate-800 hover:border-slate-700 bg-slate-900/60 hover:bg-slate-800 text-cyan-400 hover:text-cyan-300 font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer flex items-center justify-center gap-1.5"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>FORGOT PASSWORD?</span>
            </button>
          </form>
        )}

        {/* 3. FORGOT PASSWORD VIEW */}
        {view === 'forgot_password' && (
          <form onSubmit={handleForgotPasswordSubmit} className="space-y-4" noValidate>
            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5 font-mono">
                Email Address <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="forgot-password-email-input"
                  type="email"
                  name="email"
                  autoComplete="email"
                  required
                  placeholder="player@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-[#15151b] border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 transition-colors"
                />
              </div>
              <p className="text-[11px] text-slate-500 mt-1.5">
                Enter the email address associated with your Nexus account to receive a secure recovery link.
              </p>
            </div>

            <button
              id="forgot-password-send-btn"
              type="submit"
              disabled={loading || resetCooldown > 0}
              className="w-full mt-2 py-3.5 px-4 rounded-xl bg-cyan-400 hover:bg-cyan-300 disabled:bg-slate-800 disabled:text-slate-500 text-black font-black text-xs uppercase tracking-[0.15em] transition-all shadow-[0_0_20px_rgba(34,211,238,0.25)] flex items-center justify-center gap-2 active:scale-95 cursor-pointer disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <span className="inline-block w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                  <span>SENDING RESET LINK...</span>
                </>
              ) : resetCooldown > 0 ? (
                <>
                  <Clock className="w-4 h-4" />
                  <span>PLEASE WAIT ({resetCooldown}s)</span>
                </>
              ) : (
                <>
                  <KeyRound className="w-4 h-4" />
                  <span>SEND RESET LINK</span>
                </>
              )}
            </button>

            <div className="text-center pt-2">
              <button
                id="forgot-password-back-to-login-btn"
                type="button"
                onClick={() => {
                  setView('login');
                  setGeneralError(null);
                  setResetSuccessMessage(null);
                }}
                className="text-xs text-slate-400 hover:text-white transition-colors cursor-pointer inline-flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>BACK TO LOGIN</span>
              </button>
            </div>
          </form>
        )}

        {/* View Switcher Footer */}
        {view !== 'forgot_password' && (
          <div className="mt-6 pt-5 border-t border-slate-800 text-center">
            {view === 'register' ? (
              <button
                type="button"
                onClick={() => {
                  setView('login');
                  setGeneralError(null);
                }}
                className="text-xs text-slate-400 hover:text-cyan-400 transition-colors cursor-pointer"
              >
                Already have an account?{' '}
                <strong className="text-cyan-400 underline ml-1">Sign in here</strong>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setView('register');
                  setGeneralError(null);
                }}
                className="text-xs text-slate-400 hover:text-cyan-400 transition-colors cursor-pointer"
              >
                New competitor?{' '}
                <strong className="text-cyan-400 underline ml-1">Create player account</strong>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
