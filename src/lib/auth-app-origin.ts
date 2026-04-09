import { getCanonicalOrigin } from '@/lib/app-url';

/**
 * OAuth / email-confirm `redirectTo` origin — identical to `getCanonicalOrigin()`.
 * Configure `NEXT_PUBLIC_SITE_URL` (and fallbacks in `getCanonicalOrigin`) in Vercel; add
 * `{origin}/auth/callback` under Supabase → Authentication → URL Configuration → Redirect URLs.
 */
export function getAuthAppOrigin(): string {
  return getCanonicalOrigin();
}
