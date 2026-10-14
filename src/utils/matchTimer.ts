import { useState, useEffect, useMemo } from 'react';

/**
 * Format total seconds into canonical HH:MM:SS format (e.g. 00:17:42, 01:05:00)
 */
export function formatMatchDuration(totalSeconds: number | null | undefined): string {
  if (totalSeconds === null || totalSeconds === undefined || isNaN(totalSeconds) || totalSeconds < 0) {
    return '00:00:00';
  }
  const secs = Math.floor(totalSeconds);
  const hours = Math.floor(secs / 3600);
  const minutes = Math.floor((secs % 3600) / 60);
  const remainingSeconds = secs % 60;

  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(remainingSeconds)}`;
}

/**
 * Format a canonical server timestamp into the user's local timezone date (e.g. 20 September 2026)
 */
export function formatMatchDate(timestamp?: number | null, short = false): string {
  if (!timestamp) return '—';
  try {
    const d = new Date(timestamp);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString(undefined, {
      day: 'numeric',
      month: short ? 'short' : 'long',
      year: 'numeric',
    });
  } catch (err) {
    return '—';
  }
}

/**
 * Format a canonical server timestamp into the user's local timezone 24-hour time (e.g. 15:42)
 */
export function formatMatchTime(timestamp?: number | null, includeSeconds = false): string {
  if (!timestamp) return '—';
  try {
    const d = new Date(timestamp);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: includeSeconds ? '2-digit' : undefined,
      hour12: false,
    });
  } catch (err) {
    return '—';
  }
}

/**
 * Format full date & time (e.g. 20 Sep 2026 — 15:42)
 */
export function formatMatchDateTime(timestamp?: number | null): string {
  if (!timestamp) return '—';
  const dateStr = formatMatchDate(timestamp, true);
  const timeStr = formatMatchTime(timestamp);
  if (dateStr === '—' || timeStr === '—') return '—';
  return `${dateStr} — ${timeStr}`;
}

/**
 * Calculate duration in seconds between two timestamps
 */
export function calculateMatchDurationSeconds(
  startedAt?: number | null,
  endedAt?: number | null
): number {
  if (!startedAt) return 0;
  const end = endedAt || Date.now();
  return Math.max(0, Math.floor((end - startedAt) / 1000));
}

export interface MatchTimerState {
  statusText: 'NOT STARTED' | 'LIVE' | 'ENDED';
  isLive: boolean;
  isNotStarted: boolean;
  isEnded: boolean;
  elapsedSeconds: number;
  formattedDuration: string;
  startDateFormatted: string;
  startTimeFormatted: string;
  startDateTimeFormatted: string;
  endDateFormatted: string;
  endTimeFormatted: string;
  endDateTimeFormatted: string;
}

/**
 * Custom React hook for live game counter and match timeline display.
 * Strictly adheres to specifications:
 * - Only 'LIVE' matches run the live counter interval.
 * - Timer is computed locally: currentTime - startedAt.
 * - No Firebase writes per second.
 * - Stops immediately when match transitions out of LIVE.
 * - Reconstructs elapsed time immediately on page refresh from canonical startedAt.
 */
export function useMatchTimer(match?: {
  status?: string;
  startedAt?: number;
  endedAt?: number;
  finishedAt?: number;
  durationSeconds?: number;
} | null): MatchTimerState {
  const isLive = match?.status === 'LIVE';
  const startedAt = match?.startedAt;
  const effectiveEnd = match?.endedAt || match?.finishedAt;

  // Determine if match is truly in ended phase
  const isEnded = Boolean(
    !isLive && (
      effectiveEnd ||
      match?.durationSeconds !== undefined ||
      match?.status === 'AWAITING_RESULTS' ||
      match?.status === 'AWAITING_CONFIRMATION' ||
      match?.status === 'CONFIRMED' ||
      match?.status === 'DISPUTED' ||
      match?.status === 'CANCELLED' ||
      match?.status === 'REJECTED'
    ) && startedAt
  );

  const isNotStarted = !isLive && !isEnded;

  // Initial calculation for immediate render upon mount or refresh
  const computeSeconds = (): number => {
    if (isLive && startedAt) {
      return Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
    }
    if (isEnded) {
      if (match?.durationSeconds !== undefined && match.durationSeconds >= 0) {
        return match.durationSeconds;
      }
      if (startedAt && effectiveEnd) {
        return Math.max(0, Math.floor((effectiveEnd - startedAt) / 1000));
      }
      return 0;
    }
    return 0;
  };

  const [currentSeconds, setCurrentSeconds] = useState<number>(computeSeconds);

  // Sync state whenever match data or status changes
  useEffect(() => {
    setCurrentSeconds(computeSeconds());

    if (!isLive || !startedAt) {
      return; // DO NOT run interval if not LIVE
    }

    // Tick every second locally in UI only
    const interval = setInterval(() => {
      const now = Date.now();
      const elapsed = Math.max(0, Math.floor((now - startedAt) / 1000));
      setCurrentSeconds(elapsed);
    }, 1000);

    return () => clearInterval(interval);
  }, [isLive, startedAt, effectiveEnd, match?.durationSeconds, match?.status]);

  const formattedDuration = useMemo(() => {
    return formatMatchDuration(currentSeconds);
  }, [currentSeconds]);

  const startDateFormatted = useMemo(() => formatMatchDate(startedAt), [startedAt]);
  const startTimeFormatted = useMemo(() => formatMatchTime(startedAt), [startedAt]);
  const startDateTimeFormatted = useMemo(() => formatMatchDateTime(startedAt), [startedAt]);

  const endDateFormatted = useMemo(() => formatMatchDate(effectiveEnd), [effectiveEnd]);
  const endTimeFormatted = useMemo(() => formatMatchTime(effectiveEnd), [effectiveEnd]);
  const endDateTimeFormatted = useMemo(() => formatMatchDateTime(effectiveEnd), [effectiveEnd]);

  let statusText: 'NOT STARTED' | 'LIVE' | 'ENDED' = 'NOT STARTED';
  if (isLive) statusText = 'LIVE';
  else if (isEnded) statusText = 'ENDED';

  return {
    statusText,
    isLive,
    isNotStarted,
    isEnded,
    elapsedSeconds: currentSeconds,
    formattedDuration,
    startDateFormatted,
    startTimeFormatted,
    startDateTimeFormatted,
    endDateFormatted,
    endTimeFormatted,
    endDateTimeFormatted,
  };
}
