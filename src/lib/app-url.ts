/**
 * Single source of truth for the Next.js app’s public origin (auth callbacks, invites, QR, email/SMS).
 *
 * Set `NEXT_PUBLIC_SITE_URL` in production (e.g. https://app.buddybubble.app) so Vercel previews
 * and shareable links stay aligned with Supabase redirect URL configuration.
 */

function trimOrigin(raw: string): string {
  return raw.trim().replace(/\/$/, '');
}

function vercelHostToOrigin(host: string): string {
  const t = trimOrigin(host);
  if (!t) return '';
  return t.startsWith('http') ? t : `https://${t}`;
}

/**
 * Fallback chain (fixed order):
 * 1. `NEXT_PUBLIC_SITE_URL`
 * 2. `NEXT_PUBLIC_APP_ORIGIN`
 * 3. `NEXT_PUBLIC_APP_URL`
 * 4. `NEXT_PUBLIC_VERCEL_URL` (https:// prepended when missing)
 * 5. `http://localhost:3000`
 */
export function getCanonicalOrigin(): string {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (siteUrl) return trimOrigin(siteUrl);

  const appOrigin = process.env.NEXT_PUBLIC_APP_ORIGIN?.trim();
  if (appOrigin) return trimOrigin(appOrigin);

  const legacyAppUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (legacyAppUrl) return trimOrigin(legacyAppUrl);

  const publicVercel = process.env.NEXT_PUBLIC_VERCEL_URL?.trim();
  if (publicVercel) return vercelHostToOrigin(publicVercel);

  return 'http://localhost:3000';
}

export function inviteUrlForToken(token: string): string {
  const base = getCanonicalOrigin();
  const path = `/invite/${encodeURIComponent(token)}`;
  return `${base}${path}`;
}
