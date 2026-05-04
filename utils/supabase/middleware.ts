import { createServerClient } from '@supabase/ssr';
import type { CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { BB_PASSWORD_SETUP_PENDING_COOKIE } from '@/lib/login-password-setup-cookie';
import { safeNextPath } from '@/lib/safe-next-path';
import { getSupabasePublishableKey, getSupabaseUrl } from './env';
function copyCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((c) => {
    to.cookies.set(c.name, c.value, c);
  });
}

/**
 * Refreshes the Supabase session and enforces `/app` + `/onboarding` + `/update-password` auth,
 * `/login` redirects, and `bb_password_setup_pending` gating until password is saved.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const url = getSupabaseUrl();
  const key = getSupabasePublishableKey();
  if (!url || !key) {
    return supabaseResponse;
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        supabaseResponse = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const pendingPasswordSetup = request.cookies.get(BB_PASSWORD_SETUP_PENDING_COOKIE)?.value === '1';

  const requiresAuth =
    pathname.startsWith('/app') ||
    pathname.startsWith('/onboarding') ||
    pathname.startsWith('/update-password');

  if (requiresAuth && !user) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', `${pathname}${request.nextUrl.search}`);
    const redirectResponse = NextResponse.redirect(loginUrl);
    copyCookies(supabaseResponse, redirectResponse);
    return redirectResponse;
  }

  if (
    pendingPasswordSetup &&
    user &&
    (pathname.startsWith('/app') || pathname.startsWith('/onboarding'))
  ) {
    const target = new URL('/update-password', request.url);
    const redirectResponse = NextResponse.redirect(target);
    copyCookies(supabaseResponse, redirectResponse);
    return redirectResponse;
  }

  if (pathname === '/login' && user) {
    if (pendingPasswordSetup) {
      const target = new URL('/update-password', request.url);
      const redirectResponse = NextResponse.redirect(target);
      copyCookies(supabaseResponse, redirectResponse);
      return redirectResponse;
    }
    const nextParam = request.nextUrl.searchParams.get('next');
    const safe = safeNextPath(nextParam);
    if (safe === '/update-password') {
      const target = new URL('/update-password', request.url);
      const redirectResponse = NextResponse.redirect(target);
      copyCookies(supabaseResponse, redirectResponse);
      return redirectResponse;
    }
    const targetPath = safe ?? '/app';
    const target = new URL(targetPath, request.url);
    const redirectResponse = NextResponse.redirect(target);
    copyCookies(supabaseResponse, redirectResponse);
    return redirectResponse;
  }

  return supabaseResponse;
}
