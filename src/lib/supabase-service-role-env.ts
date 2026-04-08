/**
 * Sanity-check Supabase server env before calling the REST API.
 * Catches the usual mistakes: anon key in the service slot, wrong project, stray whitespace.
 */

function decodeJwtPayloadWithoutVerify(token: string): Record<string, unknown> | null {
  const trimmed = token.trim();
  const parts = trimmed.split('.');
  if (parts.length !== 3) return null;
  try {
    const json = Buffer.from(parts[1], 'base64url').toString('utf8');
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Hostname must be `<ref>.supabase.co` for ref matching; custom API domains skip ref check. */
export function projectRefFromSupabaseUrl(urlStr: string): string | null {
  try {
    const host = new URL(urlStr.trim()).hostname.toLowerCase();
    const m = /^([a-z0-9]+)\.supabase\.co$/.exec(host);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

export type ServiceRoleEnvCheck = { ok: true } | { ok: false; message: string; hint?: string };

/**
 * Returns a failure when we can prove the key is the wrong type or project (legacy JWT API keys).
 * Unknown / non-JWT keys: ok (Supabase may introduce new formats).
 */
export function checkServiceRoleKeyMatchesUrl(
  url: string,
  serviceRoleKey: string,
): ServiceRoleEnvCheck {
  const key = serviceRoleKey.trim();
  const payload = decodeJwtPayloadWithoutVerify(key);
  if (!payload) {
    return { ok: true };
  }

  const role = typeof payload.role === 'string' ? payload.role : undefined;
  const ref = typeof payload.ref === 'string' ? payload.ref : undefined;

  if (role && role !== 'service_role') {
    return {
      ok: false,
      message: `SUPABASE_SERVICE_ROLE_KEY decodes as role "${role}", not "service_role". You likely pasted the anon (or publishable) key.`,
      hint: 'Supabase → Project Settings → API → copy the secret labeled service_role (never commit it).',
    };
  }

  const urlRef = projectRefFromSupabaseUrl(url);
  if (urlRef && ref && urlRef !== ref) {
    return {
      ok: false,
      message: `Project mismatch: NEXT_PUBLIC_SUPABASE_URL uses ref "${urlRef}" but the service_role key is for ref "${ref}".`,
      hint: 'Use URL + keys from the same project. Dashboard → Settings → General: project ref must match everywhere.',
    };
  }

  return { ok: true };
}
