import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import type { CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { BB_INVITE_TOKEN_COOKIE, inviteTokenCookieOptions } from '@/lib/invite-cookies';
import { safeNextPath } from '@/lib/safe-next-path';
import { getSupabasePublishableKey, getSupabaseUrl } from '@utils/supabase/env';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = safeNextPath(searchParams.get('next')) ?? '/app';
  const inviteHandoff = searchParams.get('invite_handoff')?.trim() ?? '';

  if (code) {
    const cookieStore = await cookies();
    const url = getSupabaseUrl();
    const key = getSupabasePublishableKey();
    if (!url || !key) {
      return NextResponse.redirect(`${origin}/login?error=config`);
    }

    const supabase = createServerClient(url, key, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // ignore
          }
        },
      },
    });

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      if (inviteHandoff) {
        cookieStore.set(BB_INVITE_TOKEN_COOKIE, inviteHandoff, inviteTokenCookieOptions());
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
