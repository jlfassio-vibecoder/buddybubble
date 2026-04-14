import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { verifyTurnstileToken } from '@/lib/turnstile-verify';

describe('verifyTurnstileToken', () => {
  const prevSecret = process.env.TURNSTILE_SECRET_KEY;

  beforeEach(() => {
    process.env.TURNSTILE_SECRET_KEY = 'test_secret';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    if (prevSecret === undefined) delete process.env.TURNSTILE_SECRET_KEY;
    else process.env.TURNSTILE_SECRET_KEY = prevSecret;
  });

  it('returns ok when Cloudflare reports success', async () => {
    const r = await verifyTurnstileToken({ token: '  token  ', remoteip: '203.0.113.1' });
    expect(r).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(1);
    const call = vi.mocked(fetch).mock.calls[0]![0] as string;
    expect(call).toContain('siteverify');
    const init = vi.mocked(fetch).mock.calls[0]![1] as RequestInit;
    expect(init?.method).toBe('POST');
    const bodyParam = init?.body;
    const bodyStr =
      typeof bodyParam === 'string'
        ? bodyParam
        : bodyParam instanceof URLSearchParams
          ? bodyParam.toString()
          : '';
    expect(bodyStr).toContain('test_secret');
    expect(bodyStr).toContain('token');
    expect(bodyStr).toContain('203.0.113.1');
  });

  it('returns 403 when success is false', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ success: false, 'error-codes': ['invalid-input-response'] }), {
        status: 200,
      }),
    );
    const r = await verifyTurnstileToken({ token: 'bad' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(403);
      expect(r.error).toBe('Verification failed');
    }
  });

  it('returns 502 when secret missing', async () => {
    delete process.env.TURNSTILE_SECRET_KEY;
    delete process.env.CLOUDFLARE_TURNSTILE_SECRET;
    const r = await verifyTurnstileToken({ token: 'x' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(502);
  });
});
