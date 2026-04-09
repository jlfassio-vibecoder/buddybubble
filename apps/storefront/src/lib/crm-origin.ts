/**
 * Absolute origin of the Next.js CRM (where `/login`, `/demo`, `/app` live).
 * - If missing a scheme, we add http/https so the iframe is not a relative URL on Astro.
 * - If someone pastes a full app URL (e.g. …/app/workspace-id), we keep **origin only** so
 *   `/demo` is not wrongly built as `/app/{uuid}/demo` (that path does not exist → 404).
 */
export function normalizeCrmOrigin(raw: string | undefined): string {
  const fallback = 'https://app.buddybubble.app';
  let s = (raw ?? '').trim();
  if (!s) return fallback;
  s = s.replace(/\/$/, '');
  if (!/^https?:\/\//i.test(s)) {
    // Match IPv6 loopback with or without brackets (URL later normalizes hostname to ::1).
    const isLocal =
      /^(localhost|127\.0\.0\.1|\[::1\]|::1)(:\d+)?$/i.test(s) || /^localhost:\d+$/i.test(s);
    s = `${isLocal ? 'http' : 'https'}://${s}`;
  }
  try {
    const u = new URL(s);
    return `${u.protocol}//${u.host}`;
  } catch {
    return s.replace(/\/$/, '');
  }
}

/**
 * When the storefront is served on a real host (not localhost), never use a CRM origin that
 * points at localhost — iframe demo and post-login handoff would target the visitor's machine.
 * Local dev with storefront on localhost still respects PUBLIC_APP_ORIGIN=http://localhost:3000.
 */
export function resolveCrmOriginForStorefront(
  raw: string | undefined,
  storefrontHostname: string,
): string {
  const o = normalizeCrmOrigin(raw);
  // WHATWG URL.hostname is ::1 for IPv6 loopback, not [::1]; keep bracket form for odd proxies.
  const isLocalStorefront = /^(localhost|127\.0\.0\.1|::1|\[::1\])$/i.test(
    storefrontHostname.trim(),
  );
  if (isLocalStorefront) return o;
  try {
    const u = new URL(o);
    const host = u.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {
      return 'https://app.buddybubble.app';
    }
  } catch {
    /* keep o */
  }
  return o;
}
