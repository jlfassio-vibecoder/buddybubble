import type { APIRoute } from 'astro';
import { resolveCrmOriginForStorefront } from '../../lib/crm-origin';
import { getPublicEnv } from '../../lib/public-env';

export const prerender = false;

async function proxyToCrm(targetUrl: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(targetUrl, init);
  } catch (firstErr) {
    if (process.env.NODE_ENV !== 'development') throw firstErr;
    // Local-only fallback: swap localhost <-> 127.0.0.1 for flaky DNS / bind mismatches.
    let retryUrl = targetUrl;
    if (targetUrl.includes('://localhost:'))
      retryUrl = targetUrl.replace('://localhost:', '://127.0.0.1:');
    else if (targetUrl.includes('://127.0.0.1:'))
      retryUrl = targetUrl.replace('://127.0.0.1:', '://localhost:');
    if (retryUrl === targetUrl) throw firstErr;
    return await fetch(retryUrl, init);
  }
}

/**
 * Proxies POST JSON to the CRM `POST /api/leads/storefront-trial` so the browser
 * stays same-origin with the Astro storefront (no CORS to the Next app).
 */
export const POST: APIRoute = async ({ request }) => {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const hostHeader =
    request.headers.get('x-forwarded-host')?.split(',')[0]?.trim() ||
    request.headers.get('host')?.split(':')[0] ||
    'localhost';

  const crmOrigin = resolveCrmOriginForStorefront(getPublicEnv('PUBLIC_APP_ORIGIN'), hostHeader);

  /** Forward visitor IP headers so the CRM Turnstile check sees the browser IP, not the proxy hop. */
  const forwardClientIp: Record<string, string> = {};
  for (const name of [
    'x-forwarded-for',
    'x-vercel-forwarded-for',
    'cf-connecting-ip',
    'x-real-ip',
  ] as const) {
    const v = request.headers.get(name);
    if (v?.trim()) forwardClientIp[name] = v.trim();
  }

  const target = `${crmOrigin}/api/leads/storefront-trial`;
  let upstream: Response;
  try {
    upstream = await proxyToCrm(target, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...forwardClientIp,
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.error('[storefront-proxy] upstream fetch failed', target, e);
    return new Response(JSON.stringify({ error: 'Could not reach app server', target }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json',
    },
  });
};
