/**
 * Helpers for `tasks.scheduled_time` (Postgres `time` → API string like `HH:MM:SS`).
 */

/** `HH:mm:ss` for Postgres `time` from a time input value. */
export function scheduledTimeInputToPgValue(hhmm: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return '00:00:00';
  return `${m[1].padStart(2, '0')}:${m[2]}:00`;
}

/** `HH:mm` for `<input type="time" />`, or empty string if unset. */
export function scheduledTimeToInputValue(raw: string | null | undefined): string {
  if (raw == null || String(raw).trim() === '') return '';
  const s = String(raw).trim();
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(s);
  if (!m) return '';
  const hh = m[1].padStart(2, '0');
  const mm = m[2];
  return `${hh}:${mm}`;
}

/** Compare two Postgres/API time strings for sort order (earlier = negative). Null sorts last. */
export function compareScheduledTime(
  a: string | null | undefined,
  b: string | null | undefined,
): number {
  const na = normalizeSortKey(a);
  const nb = normalizeSortKey(b);
  if (na === null && nb === null) return 0;
  if (na === null) return 1;
  if (nb === null) return -1;
  return na.localeCompare(nb);
}

function normalizeSortKey(raw: string | null | undefined): string | null {
  if (raw == null || String(raw).trim() === '') return null;
  const s = String(raw).trim();
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(s);
  if (!m) return s;
  const hh = m[1].padStart(2, '0');
  const mm = m[2];
  const ss = (m[3] ?? '00').padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

/** Short label for cards, e.g. `2:30 PM` */
export function formatScheduledTimeDisplay(raw: string | null | undefined): string | null {
  const input = scheduledTimeToInputValue(raw);
  if (!input) return null;
  const [hStr, minStr] = input.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(minStr, 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return input;
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${minStr.padStart(2, '0')} ${period}`;
}

/** Activity log / human-readable slot */
export function scheduledTimeActivityLabel(raw: string | null | undefined): string {
  return formatScheduledTimeDisplay(raw) ?? '';
}
