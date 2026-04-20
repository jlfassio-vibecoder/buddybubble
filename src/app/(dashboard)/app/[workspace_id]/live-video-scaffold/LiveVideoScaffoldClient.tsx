'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@utils/supabase/client';
import { AgoraSessionProvider, BaseVideoHarness, WorkoutTimerShell } from '@/features/live-video';

const SCAFFOLD_TIMER_SESSION_ID = 'scaffold-demo-session';

type AuthState =
  | { status: 'loading' }
  | { status: 'signed_out' }
  | { status: 'signed_in'; userId: string };

export function LiveVideoScaffoldClient({ workspaceId }: { workspaceId: string }) {
  const [auth, setAuth] = useState<AuthState>({ status: 'loading' });
  const channelId = `bb-scaffold-${workspaceId}`;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const supabase = createClient();
      const { data, error } = await supabase.auth.getUser();
      if (cancelled) return;
      if (error || !data.user?.id) {
        setAuth({ status: 'signed_out' });
        return;
      }
      setAuth({ status: 'signed_in', userId: data.user.id });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (auth.status === 'loading') {
    return (
      <div className="flex w-full justify-center border-t border-border bg-background/95 py-8 text-sm text-muted-foreground backdrop-blur supports-[backdrop-filter]:bg-background/80">
        Loading…
      </div>
    );
  }

  if (auth.status === 'signed_out') {
    return (
      <div className="flex w-full flex-col items-center gap-3 border-t border-border bg-background/95 py-6 text-center text-sm text-muted-foreground backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <p>Sign in to use the shared workout timer on this scaffold.</p>
        <AgoraSessionProvider channelId={channelId} workspaceId={workspaceId}>
          <BaseVideoHarness />
        </AgoraSessionProvider>
      </div>
    );
  }

  const { userId } = auth;

  return (
    <div className="flex w-full justify-center border-t border-border bg-background/95 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <AgoraSessionProvider channelId={channelId} workspaceId={workspaceId}>
        <WorkoutTimerShell
          workspaceId={workspaceId}
          sessionId={SCAFFOLD_TIMER_SESSION_ID}
          localUserId={userId}
          hostUserId={userId}
          agoraChannelId={channelId}
        />
      </AgoraSessionProvider>
    </div>
  );
}
