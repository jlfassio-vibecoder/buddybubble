/**
 * Public site origin for invite links (email/SMS/QR URL). Prefer NEXT_PUBLIC_APP_URL in production.
 */
export function getAppOrigin(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) {
    return explicit.replace(/\/$/, '');
  }
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) {
    const host = vercel.startsWith('http') ? vercel : `https://${vercel}`;
    return host.replace(/\/$/, '');
  }
  return 'http://localhost:3000';
}

export function inviteUrlForToken(token: string): string {
  const base = getAppOrigin();
  const path = `/invite/${encodeURIComponent(token)}`;
  return `${base}${path}`;
}
