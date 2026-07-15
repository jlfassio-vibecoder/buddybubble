import { navigatorLock, NavigatorLockAcquireTimeoutError } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { browserAuthLock } from '@utils/supabase/browser-auth-lock';

vi.mock('@supabase/supabase-js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@supabase/supabase-js')>();
  return {
    ...actual,
    navigatorLock: vi.fn(),
  };
});

describe('browserAuthLock', () => {
  const originalNavigator = globalThis.navigator;

  function withLocksApi(run: () => Promise<void>) {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        ...originalNavigator,
        locks: { request: vi.fn() },
      },
    });
    return run().finally(() => {
      Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: originalNavigator,
      });
    });
  }

  it('maps steal AbortError to NavigatorLockAcquireTimeoutError (timeout 0 path)', async () => {
    await withLocksApi(async () => {
      vi.mocked(navigatorLock).mockRejectedValueOnce(
        new DOMException("Lock broken by another request with the 'steal' option.", 'AbortError'),
      );

      const err = await browserAuthLock('lock:test', 0, async () => 'ok').then(
        () => null,
        (e: unknown) => e,
      );
      expect(err).toBeInstanceOf(NavigatorLockAcquireTimeoutError);
      expect(err).toMatchObject({
        isAcquireTimeout: true,
        message: expect.stringContaining('another request stole it'),
      });
    });
  });

  it('passes through successful lock acquisition', async () => {
    await withLocksApi(async () => {
      vi.mocked(navigatorLock).mockImplementationOnce(async (_n, _t, fn) => fn());
      await expect(browserAuthLock('lock:test', 0, async () => 'ok')).resolves.toBe('ok');
    });
  });

  it('rethrows non-steal errors', async () => {
    await withLocksApi(async () => {
      vi.mocked(navigatorLock).mockRejectedValueOnce(new Error('boom'));
      await expect(browserAuthLock('lock:test', 5000, async () => 'ok')).rejects.toThrow('boom');
    });
  });

  it('runs fn without navigatorLock when Web Locks API is unavailable', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {},
    });
    try {
      vi.mocked(navigatorLock).mockClear();
      await expect(browserAuthLock('lock:test', 0, async () => 'ssr-ok')).resolves.toBe('ssr-ok');
      expect(navigatorLock).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: originalNavigator,
      });
    }
  });
});
