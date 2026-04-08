import { endOfMonth, endOfWeek, max, min, startOfMonth, startOfWeek } from 'date-fns';
import { getCalendarDateInTimeZone } from '@/lib/workspace-calendar';

/** Monday-based weeks (ISO-style), consistent across ribbon + month grid. */
export const CALENDAR_WEEK_OPTIONS = { weekStartsOn: 1 as const };

/**
 * Inclusive YYYY-MM-DD bounds for the union of (month grid padding) and (active week),
 * so one fetch covers both calendar-week-ribbon and calendar-month-grid.
 * Dates are expressed in `timeZone` (workspace `calendar_timezone`) so they align with `scheduled_on`.
 */
export function calendarDataRangeYmd(
  activeViewDate: Date,
  timeZone: string,
): { start: string; end: string } {
  const monthStart = startOfMonth(activeViewDate);
  const monthEnd = endOfMonth(activeViewDate);
  const gridStart = startOfWeek(monthStart, CALENDAR_WEEK_OPTIONS);
  const gridEnd = endOfWeek(monthEnd, CALENDAR_WEEK_OPTIONS);
  const weekStart = startOfWeek(activeViewDate, CALENDAR_WEEK_OPTIONS);
  const weekEnd = endOfWeek(activeViewDate, CALENDAR_WEEK_OPTIONS);
  const start = min([gridStart, weekStart]);
  const end = max([gridEnd, weekEnd]);
  const tz = timeZone.trim() || 'UTC';
  return {
    start: getCalendarDateInTimeZone(tz, start),
    end: getCalendarDateInTimeZone(tz, end),
  };
}
