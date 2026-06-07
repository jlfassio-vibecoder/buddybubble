import type { SupabaseClient } from '@supabase/supabase-js';
import { getStorefrontBrowserClient } from './supabase-browser';

/** CRM hooks (`useTaskBubbleUps`, etc.) expect `@utils/supabase/client`. */
export function createClient(): SupabaseClient {
  const client = getStorefrontBrowserClient();
  if (!client) {
    throw new Error(
      'Storefront Supabase is not configured — set PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_ANON_KEY.',
    );
  }
  return client;
}
