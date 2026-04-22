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
 * Proxies POST JSON to the CRM `POST /api/ai/storefront-preview` (Vertex outline + summary)
 * so the browser stays same-origin with the Astro storefront.
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

  // Copilot suggestion ignored: forwarding the same IP headers as `storefront-trial.ts`; on Vercel
  // the edge sets these — we do not trust arbitrary client-spoofed IPs beyond the platform’s behavior.

  /** Forward visitor IP headers so the CRM rate limit / Turnstile see the browser IP, not the proxy hop. */
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

  const target = `${crmOrigin}/api/ai/storefront-preview`;
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
    const err = e instanceof Error ? e : new Error(String(e));
    console.error('[storefront-proxy] upstream fetch failed', {
      target,
      name: err.name,
      message: err.message,
      stack: err.stack,
    });
    const hint =
      process.env.NODE_ENV === 'development' || import.meta.env.DEV
        ? 'Start the Next.js app (repo root, usually http://localhost:3000). Override with STOREFRONT_CRM_ORIGIN or APP_URL if using a different port.'
        : undefined;
    return new Response(
      JSON.stringify({
        error: 'Could not reach app server',
        target,
        ...(hint ? { hint } : {}),
      }),
      {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json',
    },
  });
};
