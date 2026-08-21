import type { User } from '@supabase/supabase-js';
import type { createServiceRoleClient } from '@/lib/supabase-service-role';

export type FindAuthUserByEmailResult =
  | { ok: true; user: User | null }
  | { ok: false; error: 'lookup_failed' };

export type AuthEmailCollisionCheck =
  | { status: 'available' }
  | { status: 'collision' }
  | { status: 'lookup_failed' };

/**
 * Resolve an auth user by normalized email via admin `listUsers` search, with
 * `public.users` → `getUserById` fallback (same contract as login identity routing).
 */
export async function findAuthUserByEmail(
  admin: ReturnType<typeof createServiceRoleClient>,
  normalizedEmail: string,
): Promise<FindAuthUserByEmailResult> {
  const listParams = {
    page: 1,
    perPage: 200,
    search: normalizedEmail,
  } as unknown as Parameters<typeof admin.auth.admin.listUsers>[0];
  const { data: { users = [] } = {}, error: listErr } =
    await admin.auth.admin.listUsers(listParams);

  let listUsersFailed = false;
  if (listErr) {
    listUsersFailed = true;
    console.error('[findAuthUserByEmail] listUsers', listErr.message);
  } else {
    const found = users.find(
      (u) => typeof u.email === 'string' && u.email.trim().toLowerCase() === normalizedEmail,
    );
    if (found) return { ok: true, user: found };
  }

  // Fallback for tenants where admin search does not return expected rows:
  // resolve auth user id from `public.users` (service role) and then fetch auth user by id.
  const { data: profile, error: profileErr } = await admin
    .from('users')
    .select('id, email')
    .eq('email', normalizedEmail)
    .maybeSingle();

  if (profileErr) {
    console.error('[findAuthUserByEmail] users lookup fallback', profileErr.message);
    return { ok: false, error: 'lookup_failed' };
  }

  const authId =
    profile && typeof (profile as { id?: string }).id === 'string'
      ? (profile as { id: string }).id
      : '';
  if (!authId) {
    // No profile row: if listUsers also failed we could not prove absence — fail closed.
    if (listUsersFailed) return { ok: false, error: 'lookup_failed' };
    return { ok: true, user: null };
  }

  const { data: authData, error: byIdErr } = await admin.auth.admin.getUserById(authId);
  if (byIdErr) {
    console.error('[findAuthUserByEmail] getUserById fallback', byIdErr.message);
    return { ok: false, error: 'lookup_failed' };
  }
  const authUser = authData?.user ?? null;
  // Copilot suggestion ignored: profile-id-only collision checks were removed; we already verify auth email via getUserById here.
  if (
    authUser &&
    typeof authUser.email === 'string' &&
    authUser.email.trim().toLowerCase() === normalizedEmail
  ) {
    return { ok: true, user: authUser };
  }
  return { ok: true, user: null };
}

/** Pure helper for guest profile collision checks (unit-testable). */
export function authEmailCollisionAgainst(
  result: FindAuthUserByEmailResult,
  excludeUserId: string,
): AuthEmailCollisionCheck {
  if (!result.ok) return { status: 'lookup_failed' };
  if (result.user && result.user.id !== excludeUserId) return { status: 'collision' };
  return { status: 'available' };
}
