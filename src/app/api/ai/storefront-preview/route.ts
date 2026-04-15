/**
 * POST /api/ai/storefront-preview
 *
 * Unauthenticated, stateless Day-1 workout preview (single Vertex call).
 * Turnstile + IP daily cap. No writes to Postgres.
 *
 * CORS: set `STOREFRONT_PREVIEW_CORS_ORIGINS` (comma-separated) if the browser calls this
 * route cross-origin; otherwise use the Astro same-origin proxy to avoid CORS.
 */

import { NextResponse } from 'next/server';
import { getClientIpFromRequest } from '@/lib/client-ip';
import { enforceStorefrontPreviewRateLimit } from '@/lib/storefront-preview-rate-limit';
import { isTurnstileSecretConfigured, verifyTurnstileToken } from '@/lib/turnstile-verify';
import { runStorefrontPreviewGeneration } from '@/lib/workout-factory/storefront-preview-runner';

export const maxDuration = 90;

const MAX_PROFILE_JSON_BYTES = 100_000;

type PreviewBody = {
  profile?: unknown;
  turnstileToken?: string;
};

function parseAllowedCorsOrigins(): string[] {
  const raw = process.env.STOREFRONT_PREVIEW_CORS_ORIGINS?.trim();
  if (!raw) return [];
  return raw
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

function corsHeadersForRequest(req: Request): Record<string, string> {
  const origin = req.headers.get('origin');
  if (!origin) return {};
  const allowed = parseAllowedCorsOrigins();
  if (!allowed.includes(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}

function jsonWithCors(req: Request, body: unknown, init?: { status?: number }): NextResponse {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  const ch = corsHeadersForRequest(req);
  for (const [k, v] of Object.entries(ch)) {
    headers.set(k, v);
  }
  return new NextResponse(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers,
  });
}

export async function OPTIONS(req: Request) {
  const headers = new Headers();
  const ch = corsHeadersForRequest(req);
  for (const [k, v] of Object.entries(ch)) {
    headers.set(k, v);
  }
  if (!ch['Access-Control-Allow-Origin']) {
    return new NextResponse(null, { status: 204 });
  }
  return new NextResponse(null, { status: 204, headers });
}

export async function POST(req: Request) {
  let body: PreviewBody;
  try {
    body = (await req.json()) as PreviewBody;
  } catch {
    return jsonWithCors(req, { error: 'Invalid JSON' }, { status: 400 });
  }

  const profile = body.profile;
  try {
    const encoded = new TextEncoder().encode(JSON.stringify(profile ?? null)).length;
    if (encoded > MAX_PROFILE_JSON_BYTES) {
      return jsonWithCors(req, { error: 'profile payload too large' }, { status: 413 });
    }
  } catch {
    return jsonWithCors(req, { error: 'profile must be JSON-serializable' }, { status: 400 });
  }

  let clientIp = getClientIpFromRequest(req);
  if (!clientIp && process.env.NODE_ENV === 'development') {
    clientIp = '127.0.0.1';
  }
  if (!clientIp) {
    return jsonWithCors(req, { error: 'Could not verify client' }, { status: 403 });
  }

  const rl = await enforceStorefrontPreviewRateLimit(clientIp);
  if (!rl.ok) {
    return jsonWithCors(req, { error: rl.message }, { status: rl.status });
  }

  const turnstileToken = typeof body.turnstileToken === 'string' ? body.turnstileToken.trim() : '';
  // Local dev defaults to bypass so storefront works without full Turnstile wiring.
  // Set ALLOW_STOREFRONT_PREVIEW_WITHOUT_TURNSTILE=0 to force verification locally.
  const devBypass =
    process.env.NODE_ENV === 'development' &&
    process.env.ALLOW_STOREFRONT_PREVIEW_WITHOUT_TURNSTILE !== '0';

  if (!devBypass) {
    if (!isTurnstileSecretConfigured()) {
      return jsonWithCors(req, { error: 'Preview service unavailable' }, { status: 503 });
    }
    if (!turnstileToken) {
      return jsonWithCors(req, { error: 'turnstileToken is required' }, { status: 400 });
    }
    const tv = await verifyTurnstileToken({ token: turnstileToken, remoteip: clientIp });
    if (!tv.ok) {
      return jsonWithCors(req, { error: tv.error }, { status: tv.status });
    }
  }

  const t0 = Date.now();
  const result = await runStorefrontPreviewGeneration(profile ?? {});
  const ms = Date.now() - t0;

  if (!result.ok) {
    const errText = await result.response.text();
    let status = result.response.status;
    let message = 'Preview generation failed';
    try {
      const j = JSON.parse(errText) as { error?: string };
      if (j?.error) message = j.error;
    } catch {
      if (status >= 400 && status < 600) message = errText.slice(0, 200);
    }
    if (process.env.NODE_ENV === 'development') {
      console.warn('[storefront-preview] generation failed', status, message);
    }
    return jsonWithCors(req, { error: message }, { status: status >= 400 ? status : 502 });
  }

  if (process.env.NODE_ENV === 'development') {
    console.info('[storefront-preview] ok', {
      ip: `${clientIp.slice(0, 12)}…`,
      ms,
      limiter: rl.ok ? rl.backend : '?',
    });
  }

  return jsonWithCors(req, { ok: true, preview: result.preview });
}
