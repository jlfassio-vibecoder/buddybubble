'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@utils/supabase/client';
import { getDemoWorkspaceId } from '@/lib/demo-workspace';

/** Set by the marketing iframe: `/demo?embed=true&workspace=<uuid>`. */
function workspaceIdFromSearch(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const q = new URLSearchParams(window.location.search);
  const w = (q.get('workspace') ?? q.get('w'))?.trim();
  return w || undefined;
}

async function ensureDemoMembership(userId: string, workspaceId: string): Promise<void> {
  const res = await fetch('/api/demo/join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ user_id: userId, workspace_id: workspaceId }),
  });
  const payload = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    throw new Error(payload.error ?? 'Failed to join the demo workspace.');
  }
}

export default function DemoPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const demoId = workspaceIdFromSearch() ?? getDemoWorkspaceId();
    if (!demoId) {
      setError(
        'Demo workspace not set. Add ?workspace=<uuid> to the iframe URL or set NEXT_PUBLIC_DEMO_WORKSPACE_ID on the CRM.',
      );
      return;
    }

    (async () => {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;

      try {
        if (session?.user) {
          await ensureDemoMembership(session.user.id, demoId);
          if (cancelled) return;
          router.replace(`/app/${demoId}?embed=true`);
          return;
        }

        const { error: anonErr } = await supabase.auth.signInAnonymously();
        if (cancelled) return;
        if (anonErr) {
          setError(
            anonErr.message.includes('anonymous') || anonErr.message.includes('Anonymous')
              ? 'Anonymous sign-in failed. In Supabase Dashboard → Authentication → Providers → Email, enable Anonymous sign-ins.'
              : anonErr.message,
          );
          return;
        }

        const {
          data: { session: nextSession },
        } = await supabase.auth.getSession();
        if (cancelled) return;
        const userId = nextSession?.user?.id;
        if (!userId) {
          setError('Could not read session after anonymous sign-in.');
          return;
        }

        await ensureDemoMembership(userId, demoId);
        if (cancelled) return;
        router.replace(`/app/${demoId}?embed=true`);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Something went wrong.');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-4 text-center">
      <p className="text-sm text-muted-foreground">{error ? error : 'Starting live demo…'}</p>
    </div>
  );
}
