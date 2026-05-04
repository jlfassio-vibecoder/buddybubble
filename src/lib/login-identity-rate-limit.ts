/**
 * Short-window rate limit for POST / login identity checks (abuse of service-role lookups + recovery sends).
 * Uses Vercel KV when `KV_REST_API_URL` + `KV_REST_API_TOKEN` are set; otherwise in-memory (dev / fallback).
 */

const WINDOW_SEC = 15 * 60;
const MAX_PER_WINDOW = 40;

const memoryCounts = new Map<string, number>();
const memoryExpires = new Map<string, number>();

function hasKvEnv(): boolean {
  return !!(
    typeof process !== 'undefined' &&
    process.env?.KV_REST_API_URL?.trim() &&
    process.env?.KV_REST_API_TOKEN?.trim()
  );
}

function pruneMemory(now: number) {
  if (memoryExpires.size < 5000) return;
  for (const [k, exp] of memoryExpires) {
    if (exp <= now) {
      memoryExpires.delete(k);
      memoryCounts.delete(k);
    }
  }
}

export type LoginIdentityRateLimitResult =
  | { ok: true; backend: 'kv' | 'memory' }
  | { ok: false; message: string };

/**
 * @param clientKey Best-effort IP or `'unknown'`.
 */
export async function enforceLoginIdentityRateLimit(
  clientKey: string,
): Promise<LoginIdentityRateLimitResult> {
  const key = `login_identity:${clientKey || 'unknown'}`;

  if (hasKvEnv()) {
    try {
      const { kv } = await import('@vercel/kv');
      const count = await kv.incr(key);
      if (count === 1) {
        await kv.expire(key, WINDOW_SEC);
      }
      if (count > MAX_PER_WINDOW) {
        return { ok: false, message: 'Too many attempts. Please try again later.' };
      }
      return { ok: true, backend: 'kv' };
    } catch (e) {
      console.error('[login-identity-rate-limit] KV error, falling back to memory:', e);
    }
  }

  const now = Date.now();
  pruneMemory(now);
  const exp = memoryExpires.get(key) ?? 0;
  if (exp <= now) {
    memoryCounts.set(key, 0);
    memoryExpires.set(key, now + WINDOW_SEC * 1000);
  }
  const n = (memoryCounts.get(key) ?? 0) + 1;
  memoryCounts.set(key, n);
  if (n > MAX_PER_WINDOW) {
    return { ok: false, message: 'Too many attempts. Please try again later.' };
  }
  return { ok: true, backend: 'memory' };
}
