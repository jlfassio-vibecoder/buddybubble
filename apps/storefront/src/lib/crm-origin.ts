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

function isStorefrontDevRuntime(): boolean {
  if (import.meta.env.DEV) return true;
  if (typeof process !== 'undefined' && process.env.NODE_ENV === 'development') return true;
  return false;
}

/**
 * When the storefront is served on a real host (not localhost), never use a CRM origin that
 * points at localhost — iframe demo and post-login handoff would target the visitor's machine.
 *
 * **Dev trap (fixed):** `astro dev` with Host = LAN IP, `.local`, or a bad `x-forwarded-host`
 * used to skip the “local storefront” branch and proxy to `PUBLIC_APP_ORIGIN` (production). Trial
 * intake then ran on Vercel → magic links always pointed at production. In dev we now default the
 * CRM to local unless `STOREFRONT_USE_REMOTE_CRM=1`.
 */
export function resolveCrmOriginForStorefront(
  raw: string | undefined,
  storefrontHostname: string,
): string {
  const o = normalizeCrmOrigin(raw);
  const allowRemote =
    typeof process !== 'undefined' && process.env?.STOREFRONT_USE_REMOTE_CRM === '1';

  if (isStorefrontDevRuntime()) {
    if (allowRemote) return o;
    const localRaw =
      (typeof process !== 'undefined' && process.env?.STOREFRONT_CRM_ORIGIN?.trim()) ||
      (typeof process !== 'undefined' && process.env?.APP_URL?.trim());
    return normalizeCrmOrigin(localRaw || 'http://localhost:3000');
  }

  // WHATWG URL.hostname is ::1 for IPv6 loopback, not [::1]; keep bracket form for odd proxies.
  const isLocalStorefront = /^(localhost|127\.0\.0\.1|::1|\[::1\])$/i.test(
    storefrontHostname.trim(),
  );
  if (isLocalStorefront) {
    if (!allowRemote) {
      return normalizeCrmOrigin(
        (typeof process !== 'undefined' && process.env?.STOREFRONT_CRM_ORIGIN?.trim()) ||
          (typeof process !== 'undefined' && process.env?.APP_URL) ||
          'http://localhost:3000',
      );
    }
    return o;
  }
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
