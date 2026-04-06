'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BB_INVITE_HANDOFF_SESSION_KEY } from '@/lib/invite-handoff-storage';
import { persistInviteHandoffToken } from './actions';

export function InviteHandoffRecovery({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [showFallback, setShowFallback] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const raw = sessionStorage.getItem(BB_INVITE_HANDOFF_SESSION_KEY);
        const token = raw?.trim();
        if (!token) {
          if (!cancelled) setShowFallback(true);
          return;
        }
        const res = await persistInviteHandoffToken(token);
        if ('ok' in res && res.ok) {
          sessionStorage.removeItem(BB_INVITE_HANDOFF_SESSION_KEY);
          router.refresh();
          return;
        }
      } catch {
        // fall through to fallback
      }
      if (!cancelled) setShowFallback(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!showFallback) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-8">
        <p className="text-center text-sm text-muted-foreground">Restoring your invite…</p>
      </main>
    );
  }

  return <>{children}</>;
}
