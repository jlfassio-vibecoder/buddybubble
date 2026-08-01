import { eachDayOfInterval, endOfWeek, parseISO, startOfWeek } from 'date-fns';
import { CALENDAR_WEEK_OPTIONS } from '@/lib/calendar-view-range';
import type { ProgramDay, ProgramWeek } from '@/lib/item-metadata';
import { getCalendarDateInTimeZone } from '@/lib/workspace-calendar';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export type ProgramWeekCardRow = {
  dayLabel: (typeof DAY_LABELS)[number];
  title: string;
  kind: 'workout' | 'rest';
  /** Optional workout_type / duration hint for display. */
  subtitle?: string;
};

export type ProgramWeekCardModel = {
  weekNumber: number;
  sessionCount: number;
  /** e.g. "Repeats · 8 weeks" when a single template covers duration. */
  repeatingMeta?: string;
  rows: ProgramWeekCardRow[];
};

function workoutSubtitle(day: ProgramDay): string | undefined {
  const parts: string[] = [];
  if (day.workout_type?.trim()) parts.push(day.workout_type.trim());
  if (
    typeof day.duration_min === 'number' &&
    Number.isFinite(day.duration_min) &&
    day.duration_min > 0
  ) {
    parts.push(`${day.duration_min} min`);
  }
  return parts.length ? parts.join(' · ') : undefined;
}

/**
 * Expand one `ProgramWeek` into a Mon–Sun card model (missing days → Rest).
 * When `isRepeatingTemplate` and `durationWeeks > 1`, sets repeating meta (do not clone cards).
 */
export function buildProgramWeekCardModel(
  week: ProgramWeek,
  options?: { durationWeeks?: number; isRepeatingTemplate?: boolean },
): ProgramWeekCardModel {
  const byDay = new Map<number, ProgramDay>();
  for (const d of week.days ?? []) {
    if (d.day >= 1 && d.day <= 7) byDay.set(d.day, d);
  }

  const rows: ProgramWeekCardRow[] = DAY_LABELS.map((dayLabel, i) => {
    const dayNum = i + 1;
    const workout = byDay.get(dayNum);
    if (!workout) {
      return { dayLabel, title: 'Rest', kind: 'rest' };
    }
    const subtitle = workoutSubtitle(workout);
    return {
      dayLabel,
      title: workout.name,
      kind: 'workout',
      ...(subtitle ? { subtitle } : {}),
    };
  });

  const sessionCount = rows.filter((r) => r.kind === 'workout').length;
  const durationWeeks = options?.durationWeeks;
  const repeatingMeta =
    options?.isRepeatingTemplate &&
    typeof durationWeeks === 'number' &&
    Number.isFinite(durationWeeks) &&
    durationWeeks > 1
      ? `Repeats · ${Math.floor(durationWeeks)} weeks`
      : undefined;

  return {
    weekNumber: week.week,
    sessionCount,
    ...(repeatingMeta ? { repeatingMeta } : {}),
    rows,
  };
}

/**
 * One card per stored `ProgramWeek`. Single-entry schedules that span multiple
 * `durationWeeks` get repeating meta on the sole card (not N clones).
 */
export function buildProgramWeekCards(
  schedule: ProgramWeek[],
  durationWeeks?: number | string | null,
): ProgramWeekCardModel[] {
  const withDays = schedule.filter((w) => (w.days?.length ?? 0) > 0);
  if (!withDays.length) return [];

  const duration =
    typeof durationWeeks === 'number'
      ? durationWeeks
      : typeof durationWeeks === 'string' && durationWeeks.trim()
        ? Number(durationWeeks)
        : undefined;
  const isRepeatingTemplate = withDays.length === 1;

  return withDays.map((w) =>
    buildProgramWeekCardModel(w, {
      durationWeeks: Number.isFinite(duration) ? duration : undefined,
      isRepeatingTemplate,
    }),
  );
}

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
