export const CALENDAR_DAY_DROP_PREFIX = 'cal-drop-';

export function calendarDayDropId(ymd: string): string {
  return `${CALENDAR_DAY_DROP_PREFIX}${ymd}`;
}

export function parseCalendarDayDropId(overId: string): string | null {
  if (!overId.startsWith(CALENDAR_DAY_DROP_PREFIX)) return null;
  return overId.slice(CALENDAR_DAY_DROP_PREFIX.length);
}
