import React from 'react';
import { Flame } from 'lucide-react';

export type StreakTier = 0 | 1 | 2 | 3;

export function getStreakTier(streak: number = 0): StreakTier {
  if (streak >= 7) return 3;
  if (streak >= 5) return 2;
  if (streak >= 3) return 1;
  return 0;
}

export function getStreakEmoji(streak: number = 0): string {
  const tier = getStreakTier(streak);
  if (tier === 3) return '🔥🔥🔥';
  if (tier === 2) return '🔥🔥';
  if (tier === 1) return '🔥';
  return '';
}

interface WinStreakBadgeProps {
  streak: number;
  showAlways?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const WinStreakBadge: React.FC<WinStreakBadgeProps> = ({
  streak = 0,
  showAlways = false,
  className = '',
  size = 'md',
}) => {
  const tier = getStreakTier(streak);

  if (tier === 0 && !showAlways) {
    return null;
  }

  if (streak <= 0) {
    return null;
  }

  const sizeClasses = {
    sm: 'text-[9px] px-1.5 py-0.5 gap-1',
    md: 'text-[10px] px-2 py-0.5 gap-1.5',
    lg: 'text-xs px-2.5 py-1 gap-2',
  };

  const flameIconSizes = {
    sm: 'w-2.5 h-2.5',
    md: 'w-3 h-3',
    lg: 'w-4 h-4',
  };

  if (tier === 0) {
    return (
      <span
        className={`inline-flex items-center rounded-full bg-slate-800/80 border border-slate-700 text-slate-300 font-mono font-bold uppercase tracking-wider ${sizeClasses[size]} ${className}`}
      >
        <span>{streak} WINS</span>
      </span>
    );
  }

  const tierStyles = {
    1: {
      bg: 'bg-orange-950/60 border-orange-500/50 text-orange-400 shadow-[0_0_10px_rgba(249,115,22,0.3)]',
      emojis: '🔥',
    },
    2: {
      bg: 'bg-amber-950/70 border-amber-500/60 text-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.45)]',
      emojis: '🔥🔥',
    },
    3: {
      bg: 'bg-red-950/80 border-red-500/80 text-red-300 shadow-[0_0_22px_rgba(239,68,68,0.6)] animate-pulse',
      emojis: '🔥🔥🔥',
    },
  }[tier];

  return (
    <span
      className={`inline-flex items-center rounded-full border font-mono font-black uppercase tracking-wider whitespace-nowrap select-none transition-all ${tierStyles.bg} ${sizeClasses[size]} ${className}`}
    >
      <span className="text-xs">{tierStyles.emojis}</span>
      <span>{streak} WIN STREAK</span>
    </span>
  );
};

interface WinStreakAvatarWrapperProps {
  streak: number;
  children: React.ReactNode;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const WinStreakAvatarWrapper: React.FC<WinStreakAvatarWrapperProps> = ({
  streak = 0,
  children,
  className = '',
  size = 'md',
}) => {
  const tier = getStreakTier(streak);

  if (tier === 0) {
    return <div className={`relative ${className}`}>{children}</div>;
  }

  const tierAnimationClass = {
    1: 'animate-flame-small',
    2: 'animate-flame-medium',
    3: 'animate-flame-large',
  }[tier];

  return (
    <div className={`relative flex items-center justify-center ${className}`}>
      {/* Background Animated Fire Layer */}
      <div
        className={`absolute inset-0 pointer-events-none z-0 flex items-center justify-center ${tierAnimationClass}`}
      >
        {/* Outer Radiant Glow Ring */}
        <div
          className={`absolute rounded-full blur-md opacity-80 ${
            tier === 1
              ? 'inset-[-4px] bg-gradient-to-t from-orange-600/70 to-yellow-400/60'
              : tier === 2
              ? 'inset-[-7px] bg-gradient-to-t from-red-600/80 via-orange-500/80 to-amber-300/80 blur-lg'
              : 'inset-[-10px] bg-gradient-to-t from-red-600 via-orange-500 to-yellow-200 blur-xl opacity-90'
          }`}
        />

        {/* Dynamic Flame SVG Silhouette Behind Avatar */}
        <svg
          viewBox="0 0 100 120"
          className={`absolute -top-4 w-[130%] h-[140%] pointer-events-none transition-all duration-300 ${
            tier === 1 ? 'opacity-70 scale-95' : tier === 2 ? 'opacity-85 scale-105' : 'opacity-100 scale-115'
          }`}
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id={`flameGrad_${tier}`} x1="50%" y1="100%" x2="50%" y2="0%">
              {tier === 1 && (
                <>
                  <stop offset="0%" stopColor="#c2410c" stopOpacity="0.8" />
                  <stop offset="50%" stopColor="#ea580c" stopOpacity="0.7" />
                  <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
                </>
              )}
              {tier === 2 && (
                <>
                  <stop offset="0%" stopColor="#b91c1c" stopOpacity="0.9" />
                  <stop offset="40%" stopColor="#ea580c" stopOpacity="0.85" />
                  <stop offset="80%" stopColor="#f59e0b" stopOpacity="0.6" />
                  <stop offset="100%" stopColor="#fef08a" stopOpacity="0" />
                </>
              )}
              {tier === 3 && (
                <>
                  <stop offset="0%" stopColor="#991b1b" stopOpacity="1" />
                  <stop offset="30%" stopColor="#dc2626" stopOpacity="0.95" />
                  <stop offset="70%" stopColor="#f97316" stopOpacity="0.9" />
                  <stop offset="100%" stopColor="#fef08a" stopOpacity="0.1" />
                </>
              )}
            </linearGradient>
            <filter id={`flameBlur_${tier}`} x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation={tier === 1 ? '3' : tier === 2 ? '4' : '5'} />
            </filter>
          </defs>

          {/* Flame tongues */}
          <path
            d="M50 0C50 0 35 25 35 45C35 55 42 62 42 62C42 62 30 52 24 68C18 84 28 102 50 102C72 102 82 84 76 68C70 52 58 62 58 62C58 62 65 55 65 45C65 25 50 0 50 0Z"
            fill={`url(#flameGrad_${tier})`}
            filter={`url(#flameBlur_${tier})`}
          />

          {tier >= 2 && (
            <path
              d="M50 15C50 15 40 35 40 50C40 58 45 64 45 64C45 64 35 56 30 68C26 80 34 94 50 94C66 94 74 80 70 68C65 56 55 64 55 64C55 64 60 58 60 50C60 35 50 15 50 15Z"
              fill={tier === 3 ? '#fbbf24' : '#f97316'}
              opacity="0.8"
            />
          )}

          {tier === 3 && (
            <circle cx="50" cy="70" r="18" fill="#fef08a" opacity="0.6" filter="blur(6px)" />
          )}
        </svg>

        {/* Embers for tier 3 */}
        {tier === 3 && (
          <div className="absolute inset-0 pointer-events-none animate-ember-float">
            <span className="absolute top-1 left-2 w-1 h-1 bg-yellow-300 rounded-full blur-[0.5px]" />
            <span className="absolute -top-2 right-3 w-1.5 h-1.5 bg-orange-400 rounded-full blur-[0.5px]" />
            <span className="absolute top-3 right-1 w-1 h-1 bg-red-400 rounded-full blur-[0.5px]" />
          </div>
        )}
      </div>

      {/* Foreground Content (Avatar or Badge) */}
      <div className="relative z-10">{children}</div>
    </div>
  );
};
