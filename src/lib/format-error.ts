/**
 * Turn unknown values (including Auth/Postgrest errors and stray Events) into safe UI strings.
 * Avoids rendering "[object Event]" or "[object Object]" in the DOM.
 */
export function formatUserFacingError(value: unknown): string {
  if (value == null || value === '') return '';
  if (typeof value === 'string') return value;
  if (typeof Event !== 'undefined' && value instanceof Event) {
    const msg = (value as ErrorEvent).message;
    return typeof msg === 'string' && msg.length > 0
      ? msg
      : 'Something went wrong. Please try again.';
  }
  if (value instanceof Error) return value.message;
  if (typeof value === 'object' && value !== null && 'message' in value) {
    const m = (value as { message?: unknown }).message;
    if (typeof m === 'string' && m.length > 0) return m;
  }
  return 'Something went wrong. Please try again.';
}
