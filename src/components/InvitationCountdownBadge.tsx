import React from 'react';
import { Clock, AlertTriangle, TimerOff } from 'lucide-react';
import { useInvitationCountdown, INVITATION_EXPIRATION_MS } from '../utils/invitationExpiration';

export interface InvitationCountdownBadgeProps {
  expiresAt?: number;
  createdAt?: number;
  isPending?: boolean;
  onExpired?: () => void;
  className?: string;
  size?: 'xs' | 'sm' | 'md';
  variant?: 'pill' | 'inline' | 'banner';
  prefixText?: string;
}

export const InvitationCountdownBadge: React.FC<InvitationCountdownBadgeProps> = ({
  expiresAt,
  createdAt,
  isPending = true,
  onExpired,
  className = '',
  size = 'sm',
  variant = 'pill',
  prefixText = 'Invitation expires in',
}) => {
  const effectiveExpiresAt = expiresAt || (createdAt ? createdAt + INVITATION_EXPIRATION_MS : undefined);
  const { formatted, isExpired, remainingMs } = useInvitationCountdown(effectiveExpiresAt, isPending, onExpired);

  if (!effectiveExpiresAt) return null;

  const isUrgent = remainingMs > 0 && remainingMs <= 2 * 60 * 1000; // < 2 minutes

  if (isExpired) {
    if (variant === 'banner') {
      return (
        <div
          id="invitation-expired-banner"
          className={`flex items-center gap-2 px-3 py-1.5 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 font-mono text-xs font-bold uppercase tracking-wider ${className}`}
        >
          <TimerOff className="w-4 h-4 shrink-0 text-rose-400" />
          <span>INVITATION EXPIRED</span>
        </div>
      );
    }

    return (
      <span
        id="invitation-expired-badge"
        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-mono font-bold uppercase tracking-wider border text-xs bg-rose-500/10 border-rose-500/40 text-rose-400 ${className}`}
      >
        <TimerOff className="w-3.5 h-3.5 shrink-0 text-rose-400" />
        <span>INVITATION EXPIRED</span>
      </span>
    );
  }

  if (variant === 'banner') {
    return (
      <div
        id="invitation-countdown-banner"
        className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border font-mono text-xs font-bold ${
          isUrgent
            ? 'bg-amber-950/40 border-amber-500/60 text-amber-300 animate-pulse'
            : 'bg-cyan-950/30 border-cyan-500/40 text-cyan-300'
        } ${className}`}
      >
        {isUrgent ? (
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
        ) : (
          <Clock className="w-4 h-4 shrink-0 text-cyan-400" />
        )}
        <span>
          {prefixText} <span className="font-mono font-extrabold tracking-wider underline decoration-cyan-400/50">{formatted}</span>
        </span>
      </div>
    );
  }

  const sizeClasses =
    size === 'xs'
      ? 'text-[10px] px-2 py-0.5'
      : size === 'md'
      ? 'text-xs px-3 py-1'
      : 'text-[11px] px-2.5 py-0.5';

  return (
    <span
      id="invitation-countdown-pill"
      className={`inline-flex items-center gap-1.5 rounded-full font-mono font-bold border transition-colors ${sizeClasses} ${
        isUrgent
          ? 'bg-amber-500/15 border-amber-500/50 text-amber-300 animate-pulse'
          : 'bg-cyan-950/40 border-cyan-500/40 text-cyan-300'
      } ${className}`}
    >
      {isUrgent ? (
        <AlertTriangle className="w-3 h-3 shrink-0 text-amber-400" />
      ) : (
        <Clock className="w-3 h-3 shrink-0 text-cyan-400" />
      )}
      <span>
        {prefixText} <strong className="font-extrabold">{formatted}</strong>
      </span>
    </span>
  );
};
