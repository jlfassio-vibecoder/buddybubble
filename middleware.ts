import { type NextRequest } from 'next/server';
import { updateSession } from '@utils/supabase/middleware';

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

/**
 * Run session refresh + auth gates on app shell, login, and marketing routes.
 * Excludes static assets and Next internals.
 */
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
