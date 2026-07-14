import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { browserAuthLock } from './browser-auth-lock';
import { supabaseAuthCookieOptionsBrowser } from './auth-cookie-options';
import { getSupabasePublishableKey, getSupabaseUrl } from './env';

/** Stable key so HMR / duplicate Turbopack chunks still share one client. */
const BROWSER_SINGLETON_KEY = '__buddybubble_supabase_browser__' as const;

type GlobalWithSupabase = typeof globalThis & {
  [BROWSER_SINGLETON_KEY]?: SupabaseClient;
};

/**
 * One browser Supabase client per JS realm (tab). `createBrowserClient` holds an async
 * lock on `sb-<project>-auth-token`. A plain module-level `let` can be **evaluated
 * twice** under Turbopack / Fast Refresh, which recreates the client and reproduces
 * "Lock broken by another request with the 'steal' option". `globalThis` survives that.
 */
function getBrowserSingleton(): SupabaseClient | undefined {
  return (globalThis as GlobalWithSupabase)[BROWSER_SINGLETON_KEY];
}

function setBrowserSingleton(client: SupabaseClient): void {
  (globalThis as GlobalWithSupabase)[BROWSER_SINGLETON_KEY] = client;
}

function browserClientOptions() {
  return {
    cookieOptions: supabaseAuthCookieOptionsBrowser(),
    auth: {
      // Map Web Lock "steal" AbortErrors → typed acquire-timeout (auto-refresh safe).
      lock: browserAuthLock,
    },
  };
}

export function createClient(): SupabaseClient {
  const url = getSupabaseUrl();
  const key = getSupabasePublishableKey();
  if (!url || !key) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or a Supabase key (NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY)',
    );
  }
  const options = browserClientOptions();
  if (typeof window === 'undefined') {
    // SSR / build: never share a singleton across requests.
    return createBrowserClient(url, key, options);
  }
  const existing = getBrowserSingleton();
  if (existing) return existing;
  const client = createBrowserClient(url, key, options);
  setBrowserSingleton(client);
  return client;
}
