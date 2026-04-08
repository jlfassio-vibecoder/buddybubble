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
    const isLocal =
      /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(s) || /^localhost:\d+$/i.test(s);
    s = `${isLocal ? 'http' : 'https'}://${s}`;
  }
  try {
    const u = new URL(s);
    return `${u.protocol}//${u.host}`;
  } catch {
    return s.replace(/\/$/, '');
  }
}
