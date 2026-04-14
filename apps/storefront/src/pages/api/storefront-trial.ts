import type { APIRoute } from 'astro';
import { resolveCrmOriginForStorefront } from '../../lib/crm-origin';
import { getPublicEnv } from '../../lib/public-env';

export const prerender = false;

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

  const upstream = await fetch(`${crmOrigin}/api/leads/storefront-trial`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...forwardClientIp,
    },
    body: JSON.stringify(payload),
  });

  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json',
    },
  });
};
