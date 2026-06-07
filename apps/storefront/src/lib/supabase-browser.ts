import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * True when env still matches `.env.example` placeholders (invalid host → DNS / WebSocket errors).
 * Use real values from the CRM app: same as NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.
 */
function isStorefrontSupabasePlaceholder(
  url: string | undefined,
  anonKey: string | undefined,
): boolean {
  const u = url?.trim().toLowerCase() ?? '';
  const k = anonKey?.trim().toLowerCase() ?? '';
  if (!u || !k) return true;
  if (
    u.includes('your-project-ref') ||
    u.includes('your_real_project_ref') ||
    u.includes('example.supabase.co')
  )
    return true;
  if (
    k === 'your-anon-key' ||
    k === 'your-publishable-key' ||
    k === 'your_real_anon_or_publishable_key'
  )
    return true;
  return false;
}

export type StorefrontBrowserClientOptions = {
  /** From Astro SSR (process.env + import.meta); preferred in production. */
  url?: string;
  anonKey?: string;
};

const BROWSER_SINGLETON_KEY = '__storefront_supabase_browser__' as const;

type GlobalWithClient = typeof globalThis & {
  [BROWSER_SINGLETON_KEY]?: SupabaseClient;
};

function resolveStorefrontEnv(opts?: StorefrontBrowserClientOptions): {
  url: string;
  anonKey: string;
} | null {
  const url = (opts?.url ?? import.meta.env.PUBLIC_SUPABASE_URL)?.trim();
  const anonKey = (opts?.anonKey ?? import.meta.env.PUBLIC_SUPABASE_ANON_KEY)?.trim();
  if (!url || !anonKey || isStorefrontSupabasePlaceholder(url, anonKey)) {
    return null;
  }
  return { url, anonKey };
}

/**
 * One browser Supabase client per tab. Reused by auth, feed, comments, and CRM bubble-up hooks.
 */
export function getStorefrontBrowserClient(
  opts?: StorefrontBrowserClientOptions,
): SupabaseClient | null {
  if (typeof window !== 'undefined') {
    const existing = (globalThis as GlobalWithClient)[BROWSER_SINGLETON_KEY];
    if (existing) return existing;
  }

  const env = resolveStorefrontEnv(opts);
  if (!env) return null;

  const client = createClient(env.url, env.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });

  if (typeof window !== 'undefined') {
    (globalThis as GlobalWithClient)[BROWSER_SINGLETON_KEY] = client;
  }

  return client;
}

/** @deprecated Prefer {@link getStorefrontBrowserClient} — kept for call-site compatibility. */
export function createStorefrontBrowserClient(
  opts?: StorefrontBrowserClientOptions,
): SupabaseClient | null {
  return getStorefrontBrowserClient(opts);
}
