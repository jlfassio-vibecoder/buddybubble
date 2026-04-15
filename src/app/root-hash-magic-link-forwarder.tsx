'use client';

import { useEffect } from 'react';

/**
 * Fallback for implicit magic-link redirects that land on any app route with tokens in `location.hash`.
 * We normalize to `/login` so existing login hash handling can exchange and route to `/app`.
 */
export function HashMagicLinkForwarder(): null {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const { hash = '', origin, pathname, search, href } = window.location;
    if (!hash.includes('access_token=')) return;
    if (pathname === '/login') return;
    const next = `${origin}/login${search}${hash}`;
    if (next === href) return;
    window.location.replace(next);
  }, []);

  return null;
}
