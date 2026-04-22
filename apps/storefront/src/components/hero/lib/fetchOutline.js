/**
 * Thin wrapper around the Astro proxy for the Vertex outline endpoint.
 *
 * Endpoint: apps/storefront/src/pages/api/storefront-preview.ts
 *   → proxies POST to src/app/api/ai/storefront-preview/route.ts
 *
 * Request shape (confirmed by reading route.ts):
 *   { profile?: unknown, turnstileToken?: string }
 * Success response:
 *   { ok: true, preview: StorefrontPreviewPayload }
 * Error response:
 *   { error: string }, various HTTP statuses (400/403/413/429/502/503).
 *
 * Kept dependency-free and pure so it can be stubbed without mocking `fetch`
 * in pass-5 tests (mirrors `submitTrial.js`).
 */
export async function fetchOutline(payload, { signal } = {}) {
  const res = await fetch('/api/storefront-preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });
  const text = await res.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = {};
    }
  }
  return { ok: res.ok, status: res.status, data };
}

/**
 * Client-side validator mirroring `validateStorefrontPreviewPayload` in
 * src/lib/workout-factory/storefront-preview-runner.ts (server is authoritative;
 * this guards us against surprising the UI with partial data).
 */
export function isValidOutline(preview) {
  if (!preview || typeof preview !== 'object' || Array.isArray(preview)) return false;
  const p = preview;
  const okTitle = typeof p.title === 'string' && p.title.trim().length > 0;
  const okDay = typeof p.day_label === 'string' && p.day_label.trim().length > 0;
  const okSummary = typeof p.summary === 'string' && p.summary.trim().length > 0;
  const okTip = typeof p.coach_tip === 'string' && p.coach_tip.trim().length > 0;
  const okMin = typeof p.estimated_minutes === 'number' && Number.isFinite(p.estimated_minutes);
  if (!okTitle || !okDay || !okSummary || !okTip || !okMin) return false;
  if (!Array.isArray(p.main_exercises) || p.main_exercises.length < 3) return false;
  return p.main_exercises.every(
    (e) =>
      e &&
      typeof e === 'object' &&
      !Array.isArray(e) &&
      typeof e.name === 'string' &&
      e.name.trim().length > 0 &&
      typeof e.detail === 'string' &&
      e.detail.trim().length > 0,
  );
}
