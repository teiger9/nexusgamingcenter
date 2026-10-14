/**
 * Safe local calendar date utility functions for Nexus Gaming Center.
 * Guarantees that local dates (YYYY-MM-DD) do not shift due to UTC conversions.
 */

/**
 * Returns today's local date formatted strictly as 'YYYY-MM-DD'.
 */
export const getTodayLocalYMD = (): string => {
  const now = new Date();
  return formatLocalDateToYMD(now);
};

/**
 * Formats a Date object to 'YYYY-MM-DD' using local year, month, and day.
 */
export const formatLocalDateToYMD = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Safely parses a 'YYYY-MM-DD' string into a Date at local midnight (00:00:00.000).
 * Avoids new Date("YYYY-MM-DD") which standardizes to UTC midnight.
 */
export const parseYMDToLocalDate = (ymd: string): Date => {
  if (!ymd || !ymd.includes('-')) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }
  const [yearStr, monthStr, dayStr] = ymd.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  return new Date(year, (month || 1) - 1, day || 1, 0, 0, 0, 0);
};

/**
 * Adds or subtracts days from a 'YYYY-MM-DD' string in local time.
 */
export const addDaysToYMD = (ymd: string, days: number): string => {
  const date = parseYMDToLocalDate(ymd);
  date.setDate(date.getDate() + days);
  return formatLocalDateToYMD(date);
};

export interface CalendarDateLabelInfo {
  relativeLabel: 'TODAY' | 'TOMORROW' | 'YESTERDAY' | null;
  dayMonthYear: string; // e.g. "5 September 2026"
  weekday: string; // e.g. "Saturday"
  title: string; // e.g. "TODAY — 5 September 2026" or "TOMORROW — 6 September 2026" or "10 September 2026"
  isToday: boolean;
  isTomorrow: boolean;
  isYesterday: boolean;
  diffDays: number;
  ymd: string;
}

/**
 * Calculates dynamic date labeling and relative status comparing calendar days in local time.
 * - Today: "TODAY — 5 September 2026"
 * - Tomorrow: "TOMORROW — 6 September 2026"
 * - Yesterday: "YESTERDAY — 4 September 2026"
 * - Other: "10 September 2026"
 */
export const getCalendarDateLabel = (targetYmd: string): CalendarDateLabelInfo => {
  const todayYmd = getTodayLocalYMD();
  const targetDate = parseYMDToLocalDate(targetYmd);
  const todayDate = parseYMDToLocalDate(todayYmd);

  // Day comparison using integer differences of local midnight timestamps
  const diffMs = targetDate.getTime() - todayDate.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  let relativeLabel: 'TODAY' | 'TOMORROW' | 'YESTERDAY' | null = null;
  if (diffDays === 0) {
    relativeLabel = 'TODAY';
  } else if (diffDays === 1) {
    relativeLabel = 'TOMORROW';
  } else if (diffDays === -1) {
    relativeLabel = 'YESTERDAY';
  }

  // Format e.g. "5 September 2026"
  const day = targetDate.getDate();
  const monthName = targetDate.toLocaleDateString('en-US', { month: 'long' });
  const year = targetDate.getFullYear();
  const dayMonthYear = `${day} ${monthName} ${year}`;
  const weekday = targetDate.toLocaleDateString('en-US', { weekday: 'long' });

  let title = dayMonthYear;
  if (relativeLabel) {
    title = `${relativeLabel} — ${dayMonthYear}`;
  }

  return {
    relativeLabel,
    dayMonthYear,
    weekday,
    title,
    isToday: diffDays === 0,
    isTomorrow: diffDays === 1,
    isYesterday: diffDays === -1,
    diffDays,
    ymd: targetYmd,
  };
};

/**
 * Formats a YMD string into e.g. "Saturday, 5 September 2026" or with relative tag.
 */
export const formatYMDDisplay = (ymd: string): string => {
  const info = getCalendarDateLabel(ymd);
  if (info.relativeLabel) {
    return `${info.relativeLabel} (${info.weekday}, ${info.dayMonthYear})`;
  }
  return `${info.weekday}, ${info.dayMonthYear}`;
};
