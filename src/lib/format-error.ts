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

const ANONYMOUS_SIGN_INS_DISABLED_RE = /anonymous\s+sign[-\s]?ins?\s+are\s+disabled/i;

function isAnonymousSignInsDisabledMessage(message: string): boolean {
  return ANONYMOUS_SIGN_INS_DISABLED_RE.test(message);
}

/**
 * Auth errors on the combined login / create-account screen: some Supabase messages
 * (e.g. anonymous auth disabled) are clearer when tied to the button the user clicked.
 */
export function formatLoginAuthError(err: unknown, intent: 'sign-in' | 'sign-up'): string {
  const base = formatUserFacingError(err);
  if (!base || !isAnonymousSignInsDisabledMessage(base)) {
    return base;
  }
  if (intent === 'sign-up') {
    return 'Anonymous sign-ins are disabled. Add your Email and Password to create an account.';
  }
  return 'Anonymous sign-ins are disabled. Add your Email and Password to sign in.';
}
