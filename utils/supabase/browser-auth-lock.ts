import { NavigatorLockAcquireTimeoutError, navigatorLock } from '@supabase/supabase-js';

/**
 * Browser auth lock that keeps cross-tab `navigator.locks` coordination, but
 * converts "stolen lock" AbortErrors into Supabase's typed acquire-timeout
 * error for *all* acquireTimeouts (including `0` used by auto-refresh ticks).
 *
 * Without this, auth-js only maps steal AbortErrors when `acquireTimeout > 0`,
 * so `_autoRefreshTokenTick` rethrows a raw AbortError and Next.js 16 overlays
 * "Lock broken by another request with the 'steal' option".
 */
export async function browserAuthLock<R>(
  name: string,
  acquireTimeout: number,
  fn: () => Promise<R>,
): Promise<R> {
  try {
    return await navigatorLock(name, acquireTimeout, fn);
  } catch (err) {
    if (isStolenNavigatorLockAbort(err)) {
      throw new NavigatorLockAcquireTimeoutError(
        `Lock "${name}" was released because another request stole it`,
      );
    }
    throw err;
  }
}

function isStolenNavigatorLockAbort(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const name = 'name' in err ? (err as { name?: unknown }).name : undefined;
  if (name !== 'AbortError') return false;
  const message =
    'message' in err && typeof (err as { message?: unknown }).message === 'string'
      ? (err as { message: string }).message
      : '';
  return message.includes("Lock broken by another request with the 'steal' option");
}
