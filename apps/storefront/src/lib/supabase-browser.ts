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

/** Browser Supabase client for the marketing site (anon key + RLS). Returns null if env is missing or placeholder. */
export function createStorefrontBrowserClient(): SupabaseClient | null {
  const url = import.meta.env.PUBLIC_SUPABASE_URL;
  const anonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
  if (!url?.trim() || !anonKey?.trim()) {
    return null;
  }
  if (isStorefrontSupabasePlaceholder(url, anonKey)) {
    return null;
  }
  return createClient(url, anonKey);
}
