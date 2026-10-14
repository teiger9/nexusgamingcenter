import React, { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';

interface ArenaTournamentNewsCountdownProps {
  scheduledAt?: number;
  className?: string;
  showIcon?: boolean;
}

export const ArenaTournamentNewsCountdown: React.FC<ArenaTournamentNewsCountdownProps> = ({
  scheduledAt,
  className = '',
  showIcon = true,
}) => {
  const [timeLeft, setTimeLeft] = useState<{
    hours: number;
    minutes: number;
    seconds: number;
    isPast: boolean;
  }>({
    hours: 0,
    minutes: 0,
    seconds: 0,
    isPast: false,
  });

  useEffect(() => {
    if (!scheduledAt) return;

    const calculateTime = () => {
      const diff = scheduledAt - Date.now();
      if (diff <= 0) {
        setTimeLeft({ hours: 0, minutes: 0, seconds: 0, isPast: true });
        return;
      }

      const totalSeconds = Math.floor(diff / 1000);
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;

      setTimeLeft({ hours, minutes, seconds, isPast: false });
    };

    calculateTime();
    const timer = setInterval(calculateTime, 1000);
    return () => clearInterval(timer);
  }, [scheduledAt]);

  if (!scheduledAt) return null;

  if (timeLeft.isPast) {
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-950/60 border border-red-500/40 text-red-400 text-xs font-mono font-bold tracking-wider uppercase ${className}`}>
        {showIcon && <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />}
        <span>STARTING SHORTLY</span>
      </span>
    );
  }

  const pad = (n: number) => n.toString().padStart(2, '0');
  const formatted = `${pad(timeLeft.hours)}:${pad(timeLeft.minutes)}:${pad(timeLeft.seconds)}`;

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-black/80 border border-red-500/50 text-white font-mono shadow-[0_0_15px_rgba(239,68,68,0.25)] ${className}`}>
      {showIcon && <Clock className="w-3.5 h-3.5 text-red-500 shrink-0" />}
      <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">STARTS IN</span>
      <span className="text-xs sm:text-sm font-black text-red-400 tracking-widest tabular-nums">
        {formatted}
      </span>
    </div>
  );
};
