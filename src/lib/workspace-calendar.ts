/**
 * Workspace-local calendar helpers for scheduled tasks (IANA timezone from `workspaces.calendar_timezone`).
 */

/** YYYY-MM-DD in the given IANA time zone for `date` (default: now). */
export function getCalendarDateInTimeZone(timeZone: string, date: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  }
}

export type ScheduledDateRelative = 'none' | 'past' | 'today' | 'future';

/**
 * Compare a Postgres/ISO date string `YYYY-MM-DD` to the workspace's calendar "today".
 */
export function scheduledOnRelativeToWorkspaceToday(
  scheduledOn: string | null | undefined,
  workspaceTimeZone: string | null | undefined,
  now: Date = new Date(),
): ScheduledDateRelative {
  if (!scheduledOn) return 'none';
  const tz = workspaceTimeZone?.trim() || 'UTC';
  const today = getCalendarDateInTimeZone(tz, now);
  if (scheduledOn < today) return 'past';
  if (scheduledOn > today) return 'future';
  return 'today';
}

/**
 * Aligns with cron `/api/cron/scheduled-tasks`: when a task is still in `scheduled` but
 * `scheduled_on` is the workspace calendar "today", it belongs in the `today` column (slug `today`).
 */
export function promotedStatusForScheduledOnToday(params: {
  currentStatus: string;
  scheduledOnYmd: string | null;
  calendarTimezone: string | null | undefined;
  hasTodayBoardColumn: boolean;
  /** For tests; defaults to `new Date()`. */
  now?: Date;
}): string {
  const { currentStatus, scheduledOnYmd, calendarTimezone, hasTodayBoardColumn, now } = params;
  if (!hasTodayBoardColumn || currentStatus !== 'scheduled') return currentStatus;
  if (!scheduledOnYmd) return currentStatus;
  if (scheduledOnRelativeToWorkspaceToday(scheduledOnYmd, calendarTimezone, now) !== 'today') {
    return currentStatus;
  }
  return 'today';
}
