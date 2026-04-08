import { createClient } from '@supabase/supabase-js';

/**
 * Server-side Supabase client for the public storefront (anon key + RLS).
 * Requires PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_ANON_KEY at build/runtime.
 */
export function createStorefrontClient() {
  const url = import.meta.env.PUBLIC_SUPABASE_URL;
  const anonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
  if (!url?.trim() || !anonKey?.trim()) {
    throw new Error(
      'Missing PUBLIC_SUPABASE_URL or PUBLIC_SUPABASE_ANON_KEY — add them to apps/storefront/.env',
    );
  }
  return createClient(url, anonKey);
}
