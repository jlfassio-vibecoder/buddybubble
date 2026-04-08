import { createClient } from '@supabase/supabase-js';
import { checkServiceRoleKeyMatchesUrl } from '@/lib/supabase-service-role-env';

/** Server-only: cron routes and scripts. */
export function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  const check = checkServiceRoleKeyMatchesUrl(url, key);
  if (!check.ok) {
    const extra = check.hint ? `\n${check.hint}` : '';
    throw new Error(`${check.message}${extra}`);
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
