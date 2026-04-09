import { defineMiddleware } from 'astro:middleware';
import { createClient } from '@supabase/supabase-js';
import { getPublicEnv } from './lib/public-env';

/** Hostnames where we use normal path routing (no custom_domain → slug rewrite). */
function shouldSkipCustomDomainLookup(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === 'localhost' || h === '127.0.0.1' || h === '[::1]') return true;
  if (h === 'buddybubble.app' || h.endsWith('.buddybubble.app')) return true;
  if (h.endsWith('.vercel.app')) return true;
  return false;
}

function customDomainLookupVariants(hostname: string): string[] {
  const h = hostname.toLowerCase();
  const out = new Set<string>([h]);
  if (h.startsWith('www.')) out.add(h.slice(4));
  else out.add(`www.${h}`);
  return [...out];
}

async function resolvePublicSlugForHost(hostname: string): Promise<string | null> {
  const supabaseUrl = getPublicEnv('PUBLIC_SUPABASE_URL');
  const anonKey = getPublicEnv('PUBLIC_SUPABASE_ANON_KEY');
  if (!supabaseUrl || !anonKey) return null;

  const variants = customDomainLookupVariants(hostname);

  try {
    const supabase = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase
      .from('workspaces')
      .select('public_slug')
      .in('custom_domain', variants)
      .eq('is_public', true)
      .limit(1)
      .maybeSingle();

    if (!error && data && typeof data.public_slug === 'string') {
      const s = data.public_slug.trim();
      if (s) return s;
    }
  } catch {
    // Edge-safe fallback: PostgREST over fetch (no supabase-js internals).
  }

  try {
    const base = supabaseUrl.replace(/\/$/, '');
    for (const v of variants) {
      const qs = new URLSearchParams();
      qs.set('select', 'public_slug');
      qs.set('custom_domain', `eq.${v}`);
      qs.set('is_public', 'eq.true');
      qs.set('limit', '1');
      const res = await fetch(`${base}/rest/v1/workspaces?${qs}`, {
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
        },
      });
      if (!res.ok) continue;
      const rows = (await res.json()) as { public_slug?: string | null }[];
      const s = rows[0]?.public_slug?.trim();
      if (s) return s;
    }
    return null;
  } catch {
    return null;
  }
}

export const onRequest = defineMiddleware(async (context, next) => {
  const hostname = context.url.hostname;
  if (shouldSkipCustomDomainLookup(hostname)) {
    return next();
  }

  const pathname = context.url.pathname;
  if (pathname !== '/' && pathname !== '') {
    return next();
  }

  const publicSlug = await resolvePublicSlugForHost(hostname);
  if (!publicSlug) {
    return next();
  }

  const segment = encodeURIComponent(publicSlug);
  return next(new URL(`/${segment}`, context.url));
});
