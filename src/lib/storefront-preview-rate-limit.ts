/**
 * Daily IP cap for unauthenticated storefront AI preview (Phase 5).
 *
 * **Production:** Set `KV_REST_API_URL` + `KV_REST_API_TOKEN` (Vercel KV / Upstash-backed KV) so limits
 * are shared across all serverless instances.
 *
 * **Fallback:** In-process `Map` when KV is missing or errors — limits are not shared across
 * serverless instances; configure KV for accurate production-wide caps.
 */

const MAX_PER_DAY = 20;

/** Lazy in-memory fallback (dev / no KV). */
const memoryCounts = new Map<string, number>();
let memoryDay = '';

function utcDateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function secondsUntilUtcEndOfDay(): number {
  const now = new Date();
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999),
  );
  return Math.max(60, Math.ceil((end.getTime() - now.getTime()) / 1000));
}

function memoryIncr(ip: string, day: string): number {
  if (day !== memoryDay) {
    memoryCounts.clear();
    memoryDay = day;
  }
  const key = `${ip}:${day}`;
  const n = (memoryCounts.get(key) ?? 0) + 1;
  memoryCounts.set(key, n);
  /** After UTC day rollover all keys share the same `:day` suffix; evict oldest entries when over cap. */
  if (memoryCounts.size > 20_000) {
    for (const k of memoryCounts.keys()) {
      memoryCounts.delete(k);
      if (memoryCounts.size <= 15_000) break;
    }
  }
  return n;
}

function hasKvEnv(): boolean {
  return !!(
    typeof process !== 'undefined' &&
    process.env?.KV_REST_API_URL?.trim() &&
    process.env?.KV_REST_API_TOKEN?.trim()
  );
}

export type RateLimitResult =
  | { ok: true; count: number; backend: 'kv' | 'memory' }
  | { ok: false; status: 429 | 503; message: string };

/**
 * Increments today's preview count for `clientIp` and returns whether under cap.
 */
export async function enforceStorefrontPreviewRateLimit(
  clientIp: string,
): Promise<RateLimitResult> {
  const day = utcDateKey();
  const key = `storefront_preview:${clientIp}:${day}`;

  if (hasKvEnv()) {
    try {
      // Copilot suggestion ignored: migrating off @vercel/kv is deferred until we standardize on Upstash project-wide.
      const { kv } = await import('@vercel/kv');
      const count = await kv.incr(key);
      if (count === 1) {
        await kv.expire(key, secondsUntilUtcEndOfDay());
      }
      if (count > MAX_PER_DAY) {
        return { ok: false, status: 429, message: 'Daily preview limit reached' };
      }
      return { ok: true, count, backend: 'kv' };
    } catch (e) {
      console.error('[storefront-preview-rate-limit] KV error, falling back to memory:', e);
    }
  } else if (process.env.NODE_ENV === 'production') {
    console.warn(
      '[storefront-preview-rate-limit] KV not configured; using in-memory daily cap (not shared across serverless instances). Set KV_REST_API_URL + KV_REST_API_TOKEN for production.',
    );
  }

  if (process.env.NODE_ENV === 'development') {
    console.warn(
      '[storefront-preview-rate-limit] Using in-memory limiter (not safe for multi-instance production). Set KV_REST_API_URL + KV_REST_API_TOKEN.',
    );
  }
  const count = memoryIncr(clientIp, day);
  if (count > MAX_PER_DAY) {
    return { ok: false, status: 429, message: 'Daily preview limit reached' };
  }
  return { ok: true, count, backend: 'memory' };
}
