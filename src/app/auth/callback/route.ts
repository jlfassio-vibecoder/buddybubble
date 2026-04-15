import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import type { CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { EmailOtpType } from '@supabase/supabase-js';
import { insertInviteJourneyByToken } from '@/lib/analytics/invite-journey-server';
import { BB_INVITE_TOKEN_COOKIE, inviteTokenCookieOptions } from '@/lib/invite-cookies';
import { safeNextPath } from '@/lib/safe-next-path';
import { getSupabasePublishableKey, getSupabaseUrl } from '@utils/supabase/env';

async function applyInviteHandoffCookie(
  inviteHandoff: string,
  next: string,
  cookieStore: Awaited<ReturnType<typeof cookies>>,
) {
  if (!inviteHandoff) return;
  cookieStore.set(BB_INVITE_TOKEN_COOKIE, inviteHandoff, inviteTokenCookieOptions());
  await insertInviteJourneyByToken(inviteHandoff, 'auth_callback_invite_handoff_saved', {
    next_path: next,
  });
}

/**
 * Supabase auth return URL (PKCE `code`, email `token_hash`+`type`, or implicit hash — see below).
 * @see https://supabase.com/docs/guides/auth/server-side/nextjs
 */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const { searchParams, origin } = requestUrl;
  const code = searchParams.get('code');
  const token_hash = searchParams.get('token_hash');
  const typeRaw = searchParams.get('type');
  const next = safeNextPath(searchParams.get('next')) ?? '/app';
  const inviteHandoff = searchParams.get('invite_handoff')?.trim() ?? '';

  const supabaseUrl = getSupabaseUrl();
  const supabaseKey = getSupabasePublishableKey();
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.redirect(`${origin}/login?error=config`);
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          /* ignore */
        }
      },
    },
  });

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      await applyInviteHandoffCookie(inviteHandoff, next, cookieStore);
      return NextResponse.redirect(`${origin}${next}`);
    }
    return NextResponse.redirect(`${origin}/login?error=auth`);
  }

  if (token_hash && typeRaw) {
    const { error } = await supabase.auth.verifyOtp({
      type: typeRaw as EmailOtpType,
      token_hash,
    });
    if (!error) {
      await applyInviteHandoffCookie(inviteHandoff, next, cookieStore);
      return NextResponse.redirect(`${origin}${next}`);
    }
    return NextResponse.redirect(`${origin}/login?error=auth`);
  }

  /**
   * Implicit / fragment flow: after Supabase redirects here, the browser keeps tokens in
   * `location.hash`, which is never sent to this handler. HTTP redirects would drop the fragment,
   * so we return a tiny HTML shell that forwards search + hash to `/login` (client handler).
   */
  const qs = requestUrl.search || '';
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Continuing sign-in…</title></head><body><script>(function(){var o=${JSON.stringify(origin)};var q=${JSON.stringify(qs)};var h=location.hash||"";if(h.indexOf("access_token")!==-1){location.replace(o+"/login"+q+h);}else{location.replace(o+"/login?error=auth"+(q?"&"+q.slice(1):""));}})();</script><p style="font-family:system-ui,sans-serif;margin:2rem">Continuing sign-in…</p></body></html>`;

  return new NextResponse(html, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}
