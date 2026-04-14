/**
 * Cloudflare Turnstile server-side verification.
 * @see https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 */

type SiteverifyResponse = {
  success?: boolean;
  'error-codes'?: string[];
  challenge_ts?: string;
};

export type TurnstileVerifyResult = { ok: true } | { ok: false; error: string; status: 403 | 502 };

function readSecret(): string | undefined {
  const s =
    (typeof process !== 'undefined' && process.env?.TURNSTILE_SECRET_KEY?.trim()) ||
    (typeof process !== 'undefined' && process.env?.CLOUDFLARE_TURNSTILE_SECRET?.trim());
  return s || undefined;
}

/**
 * Verifies the Turnstile token with Cloudflare. Uses `remoteip` when provided.
 */
export async function verifyTurnstileToken(options: {
  token: string;
  remoteip?: string | null;
}): Promise<TurnstileVerifyResult> {
  const secret = readSecret();
  if (!secret) {
    return { ok: false, error: 'Turnstile is not configured', status: 502 };
  }

  const body = new URLSearchParams();
  body.set('secret', secret);
  body.set('response', options.token.trim());
  if (options.remoteip?.trim()) {
    body.set('remoteip', options.remoteip.trim());
  }

  let res: Response;
  try {
    res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
  } catch (e) {
    console.error('[turnstile] siteverify fetch failed', e);
    return { ok: false, error: 'Verification service unavailable', status: 502 };
  }

  let data: SiteverifyResponse;
  try {
    data = (await res.json()) as SiteverifyResponse;
  } catch {
    return { ok: false, error: 'Invalid verification response', status: 502 };
  }

  if (data.success === true) {
    return { ok: true };
  }

  const codes = data['error-codes']?.join(', ') ?? 'unknown';
  if (process.env.NODE_ENV === 'development') {
    console.warn('[turnstile] verification failed:', codes);
  }
  return { ok: false, error: 'Verification failed', status: 403 };
}

export function isTurnstileSecretConfigured(): boolean {
  return !!readSecret();
}
