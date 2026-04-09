import { createClient } from '@supabase/supabase-js';
import { getPublicEnv } from './public-env';

/**
 * Server-side Supabase client for the public storefront (anon key + RLS).
 * Uses import.meta.env merged with process.env (Vercel / hosting dashboard).
 */
export function createStorefrontClient() {
  const url = getPublicEnv('PUBLIC_SUPABASE_URL');
  const anonKey = getPublicEnv('PUBLIC_SUPABASE_ANON_KEY');
  if (!url || !anonKey) {
    throw new Error(
      'Missing PUBLIC_SUPABASE_URL or PUBLIC_SUPABASE_ANON_KEY — set in apps/storefront/.env locally or in your host environment (e.g. Vercel → Environment Variables).',
    );
  }
  return createClient(url, anonKey);
}
