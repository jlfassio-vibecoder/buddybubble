/**
 * Best-effort client IP for rate limiting / Turnstile remoteip behind proxies (Vercel, Cloudflare).
 */

function trimIp(s: string): string {
  return s.trim();
}

/**
 * @returns First public-ish IP from headers, or `null` if none usable.
 */
export function getClientIpFromHeaders(headers: Headers): string | null {
  const xff = headers.get('x-forwarded-for');
  if (xff) {
    const first = trimIp(xff.split(',')[0] ?? '');
    if (first && first !== 'unknown') return first;
  }
  const vff = headers.get('x-vercel-forwarded-for');
  if (vff) {
    const first = trimIp(vff.split(',')[0] ?? '');
    if (first && first !== 'unknown') return first;
  }
  const cf = headers.get('cf-connecting-ip');
  if (cf) {
    const t = trimIp(cf);
    if (t) return t;
  }
  const realIp = headers.get('x-real-ip');
  if (realIp) {
    const t = trimIp(realIp);
    if (t) return t;
  }
  return null;
}

export function getClientIpFromRequest(req: Request): string | null {
  return getClientIpFromHeaders(req.headers);
}
