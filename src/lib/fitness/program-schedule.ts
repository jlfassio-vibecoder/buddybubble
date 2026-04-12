import { eachDayOfInterval, endOfWeek, parseISO, startOfWeek } from 'date-fns';
import { CALENDAR_WEEK_OPTIONS } from '@/lib/calendar-view-range';
import type { ProgramDay, ProgramWeek } from '@/lib/item-metadata';
import { getCalendarDateInTimeZone } from '@/lib/workspace-calendar';

/**
 * Days for a 1-based program week. Uses the matching `ProgramWeek.week`, or repeats the first
 * week’s template when only one block exists (see `ProgramTemplate.schedule` docs).
 */
export function getProgramDaysForWeek(schedule: ProgramWeek[], weekNumber: number): ProgramDay[] {
  if (!schedule.length || weekNumber < 1) return [];
  const exact = schedule.find((w) => w.week === weekNumber);
  if (exact?.days?.length) return exact.days;
  const first = schedule[0];
  return first?.days ?? [];
}

/** Monday–Sunday YMD bounds in the workspace calendar for `now` (inclusive string compare on date). */
export function workspaceCalendarWeekYmdBounds(
  calendarTimezone: string | null | undefined,
  now: Date = new Date(),
): { startYmd: string; endYmd: string } {
  const tz = calendarTimezone?.trim() || 'UTC';
  const todayYmd = getCalendarDateInTimeZone(tz, now);
  const anchor = parseISO(`${todayYmd}T12:00:00`);
  const weekStartDate = startOfWeek(anchor, CALENDAR_WEEK_OPTIONS);
  const weekEndDate = endOfWeek(anchor, CALENDAR_WEEK_OPTIONS);
  const ymds = eachDayOfInterval({ start: weekStartDate, end: weekEndDate }).map((d) =>
    getCalendarDateInTimeZone(tz, d),
  );
  const startYmd = ymds[0]!;
  const endYmd = ymds[ymds.length - 1]!;
  return { startYmd, endYmd };
}
