/** Formats elapsed ms as `MM:SS.T` (tenths). */
export function formatElapsedMs(ms: number): string {
  const clamped = Math.max(0, ms);
  const totalTenths = Math.floor(clamped / 100);
  const tenths = totalTenths % 10;
  const totalSeconds = Math.floor(totalTenths / 10);
  const sec = totalSeconds % 60;
  const min = Math.floor(totalSeconds / 60);
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${tenths}`;
}

export type SessionTimeFormat = 'count-up' | 'countdown-seconds' | 'countdown-tenths';

/**
 * Session block clock formatting. Elapsed `ms` is phase elapsed from anchor.
 * Countdown modes subtract elapsed from `totalBlockMs` (remaining time).
 */
export function formatSessionTime(
  elapsedMs: number,
  format: SessionTimeFormat = 'count-up',
  totalBlockMs?: number,
): string {
  if (format === 'count-up') {
    return formatElapsedMs(elapsedMs);
  }
  const total = totalBlockMs ?? 0;
  const remaining = Math.max(0, total - elapsedMs);
  if (format === 'countdown-seconds') {
    const totalSec = Math.ceil(remaining / 1000);
    const sec = totalSec % 60;
    const min = Math.floor(totalSec / 60);
    return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }
  return formatElapsedMs(remaining);
}
