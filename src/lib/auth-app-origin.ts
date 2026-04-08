/**
 * Origin embedded in Supabase email-confirm and OAuth `redirectTo` URLs.
 *
 * - **Development** (`next dev`): always `window.location.origin` so copied production
 *   `NEXT_PUBLIC_SITE_URL` in `.env.local` cannot send confirmation links to prod.
 * - **Production build**: prefers `NEXT_PUBLIC_SITE_URL` when set (canonical app host),
 *   else the current page origin (correct on Vercel for that deployment).
 *
 * If confirmation links still open the wrong host, add this origin + `/auth/callback`
 * under Supabase → Authentication → URL Configuration → Redirect URLs.
 */
export function getAuthAppOrigin(): string {
  if (typeof window === 'undefined') return '';
  if (process.env.NODE_ENV === 'development') {
    return window.location.origin;
  }
  const env = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, '');
  if (env && /^https?:\/\//i.test(env)) return env;
  return window.location.origin;
}
