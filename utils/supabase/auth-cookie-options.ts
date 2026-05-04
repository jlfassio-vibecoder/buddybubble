import type { CookieOptions } from '@supabase/ssr';

/**
 * Keeps Supabase auth cookie attributes aligned between the browser client
 * (`document.cookie`) and Next.js middleware / route handlers.
 *
 * On HTTPS, cookies should be marked `Secure` so overwrites and deletions
 * (e.g. after a failed refresh) apply to the same cookie store the server uses.
 */
export function supabaseAuthCookieOptionsForUrl(url: URL): CookieOptions {
  return url.protocol === 'https:' ? { secure: true } : {};
}

/** Use in Server Components / Server Actions where only `headers()` is available. */
export function supabaseAuthCookieOptionsForForwardedProto(headerList: Headers): CookieOptions {
  const raw = headerList.get('x-forwarded-proto');
  if (!raw) return {};
  const first = raw.split(',')[0]?.trim().toLowerCase();
  return first === 'https' ? { secure: true } : {};
}

/** Browser Supabase client — prefer `https:` (not `isSecureContext`, which is true on http://localhost). */
export function supabaseAuthCookieOptionsBrowser(): CookieOptions {
  if (typeof window === 'undefined') return {};
  return window.location.protocol === 'https:' ? { secure: true } : {};
}
