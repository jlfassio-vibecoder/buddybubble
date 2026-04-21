'use client';

import { useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@utils/supabase/client';
import {
  AgoraSessionProvider,
  BaseVideoHarness,
  LiveSessionView,
  useAgoraSession,
} from '@/features/live-video';
import { PreJoinBuilder } from '@/features/live-video/shells/huddle/PreJoinBuilder';
import { LiveSessionRuntimeProvider } from '@/features/live-video/theater/live-session-runtime-context';
import { LiveVideoSessionShell } from '@/features/live-video/theater/live-video-session-shell';

type AuthState =
  | { status: 'loading' }
  | { status: 'signed_out' }
  | { status: 'signed_in'; userId: string };

type ScaffoldBodyProps = {
  workspaceId: string;
  userId: string;
  supabase: SupabaseClient;
};

/** Same pre-join boundary as the dashboard dock — keeps Builder / Huddle split consistent. */
function ScaffoldLiveSessionRouter({ workspaceId, userId, supabase }: ScaffoldBodyProps) {
  const { isConnected, isConnecting } = useAgoraSession();

  if (!isConnected && !isConnecting) {
    return (
      <PreJoinBuilder workspaceId={workspaceId} supabase={supabase} className="min-h-0 flex-1" />
    );
  }

  return (
    <LiveSessionView
      localUserId={userId}
      hostUserId={userId}
      workspaceId={workspaceId}
      supabase={supabase}
      canWriteTasks={false}
      className="min-h-0 flex-1"
    />
  );
}

export function LiveVideoScaffoldClient({ workspaceId }: { workspaceId: string }) {
  const [auth, setAuth] = useState<AuthState>({ status: 'loading' });
  const channelId = `bb-scaffold-${workspaceId}`;
  const supabase = useMemo(() => createClient(), []);

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
          <BaseVideoHarness
            localUserId="00000000-0000-0000-0000-000000000000"
            hostUserId="00000000-0000-0000-0000-000000000000"
          />
        </AgoraSessionProvider>
      </div>
    );
  }

  return (
    <div className="flex min-h-[70vh] w-full flex-col border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <AgoraSessionProvider channelId={channelId} workspaceId={workspaceId}>
        <LiveSessionRuntimeProvider
          workspaceId={workspaceId}
          sessionId={`live-scaffold-${workspaceId}`}
          localUserId={auth.userId}
          hostUserId={auth.userId}
          enabled
        >
          <LiveVideoSessionShell
            theaterPlanDeps={{
              hasLiveVideoSession: true,
              isSelectingFromBoard: false,
              layoutMobile: false,
              embedMode: false,
              layoutHydrated: true,
            }}
          >
            <div className="flex min-h-0 flex-1 flex-col px-2 py-4">
              <ScaffoldLiveSessionRouter
                workspaceId={workspaceId}
                userId={auth.userId}
                supabase={supabase}
              />
            </div>
          </LiveVideoSessionShell>
        </LiveSessionRuntimeProvider>
      </AgoraSessionProvider>
    </div>
  );
}
