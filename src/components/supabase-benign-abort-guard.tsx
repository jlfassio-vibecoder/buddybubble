'use client';

import { useEffect } from 'react';
import { isSupabaseBenignRequestAbort } from '@/lib/supabase-client-error';

/**
 * Next.js 16 surfaces unhandled AbortErrors in the runtime overlay. Supabase Auth's
 * Web Lock steal recovery can reject with a benign AbortError that callers no longer
 * await (auto-refresh / StrictMode). Swallow those so they don't look like app bugs.
 */
export function SupabaseBenignAbortGuard() {
  useEffect(() => {
    const onRejection = (event: PromiseRejectionEvent) => {
      if (!isSupabaseBenignRequestAbort(event.reason)) return;
      event.preventDefault();
      // Capture phase + stopImmediatePropagation so Next.js 16's overlay listener
      // does not treat Web Lock steal / acquire-timeout as a runtime error.
      event.stopImmediatePropagation();
    };
    window.addEventListener('unhandledrejection', onRejection, true);
    return () => window.removeEventListener('unhandledrejection', onRejection, true);
  }, []);

  return null;
}
