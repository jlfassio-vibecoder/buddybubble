import { type NextRequest } from 'next/server';
import { BB_INVITE_TOKEN_COOKIE, inviteTokenCookieOptions } from '@/lib/invite-cookies';
import { isPlausibleInviteTokenForCookie } from '@/lib/invite-token';
import { updateSession } from '@utils/supabase/middleware';

export async function middleware(request: NextRequest) {
  const response = await updateSession(request);
  const pathname = request.nextUrl.pathname;
  const inviteMatch = pathname.match(/^\/invite\/([^/]+)/);
  if (inviteMatch?.[1]) {
    const raw = inviteMatch[1];
    const token = (() => {
      try {
        return decodeURIComponent(raw);
      } catch {
        return raw;
      }
    })();
    // Skip cookie for malformed/huge path segments (Copilot: avoid oversized Set-Cookie / abuse).
    if (isPlausibleInviteTokenForCookie(token)) {
      response.cookies.set(BB_INVITE_TOKEN_COOKIE, token, inviteTokenCookieOptions());
    }
  }
  return response;
}

/**
 * Run session refresh + auth gates on app shell, login, and marketing routes.
 * Excludes static assets and Next internals.
 */
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
