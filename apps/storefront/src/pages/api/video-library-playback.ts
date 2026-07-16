import type { APIRoute } from 'astro';
import { resolveCrmOriginForStorefront } from '../../lib/crm-origin';
import { getPublicEnv } from '../../lib/public-env';

export const prerender = false;

async function proxyToCrm(targetUrl: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(targetUrl, init);
  } catch (firstErr) {
    if (process.env.NODE_ENV !== 'development') throw firstErr;
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
 * Proxies GET to CRM `GET /api/video-library/public-playback` so the browser
 * stays same-origin with the Astro storefront.
 */
export const GET: APIRoute = async ({ request }) => {
  const incoming = new URL(request.url);
  const publicationId = incoming.searchParams.get('publicationId')?.trim() ?? '';
  if (!publicationId) {
    return new Response(JSON.stringify({ error: 'Invalid publication id.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const hostHeader =
    request.headers.get('x-forwarded-host')?.split(',')[0]?.trim() ||
    request.headers.get('host')?.split(':')[0] ||
    'localhost';

  const crmOrigin = resolveCrmOriginForStorefront(getPublicEnv('PUBLIC_APP_ORIGIN'), hostHeader);
  const target = new URL(`${crmOrigin}/api/video-library/public-playback`);
  target.searchParams.set('publicationId', publicationId);

  let upstream: Response;
  try {
    upstream = await proxyToCrm(target.toString(), { method: 'GET' });
  } catch {
    return new Response(JSON.stringify({ error: 'Could not reach app server' }), {
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
