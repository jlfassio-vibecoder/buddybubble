'use client';

import { useMemo } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@utils/supabase/client';
import { AgoraSessionProvider, LiveSessionView, useAgoraSession } from '@/features/live-video';
import { PreJoinBuilder } from '@/features/live-video/shells/huddle/PreJoinBuilder';
import type { LiveVideoActiveSession } from '@/store/liveVideoStore';

export type DashboardLiveVideoDockProps = {
  session: LiveVideoActiveSession;
  localUserId: string;
  onLeaveSession: () => void;
  canWriteTasks?: boolean;
  onWorkoutDeckPersisted?: () => void;
};

type DockRouterProps = {
  session: LiveVideoActiveSession;
  localUserId: string;
  supabase: SupabaseClient;
  onLeaveSession: () => void;
  canWriteTasks: boolean;
  onWorkoutDeckPersisted?: () => void;
};

/**
 * Strict pre-join boundary: while Agora is disconnected we render `PreJoinBuilder`
 * (queue + editor + Join CTA). Once `isConnected` or `isConnecting` is true we render
 * the `LiveSessionView` Huddle (video stage + session controls).
 *
 * VideoState (Agora) and SessionState (workout timer) stay independent: this router
 * only reads Agora connectivity, never the session machine.
 */
function DashboardLiveVideoDockRouter({
  session,
  localUserId,
  supabase,
  onLeaveSession,
  canWriteTasks,
  onWorkoutDeckPersisted,
}: DockRouterProps) {
  const { isConnected, isConnecting } = useAgoraSession();

  if (!isConnected && !isConnecting) {
    return (
      <PreJoinBuilder
        workspaceId={session.workspaceId}
        supabase={supabase}
        canWriteTasks={canWriteTasks}
        onWorkoutDeckPersisted={onWorkoutDeckPersisted}
        className="min-h-0 flex-1 px-0 py-0"
      />
    );
  }

  return (
    <LiveSessionView
      localUserId={localUserId}
      hostUserId={session.hostUserId}
      onAfterLeave={onLeaveSession}
      workspaceId={session.workspaceId}
      supabase={supabase}
      canWriteTasks={canWriteTasks}
      onWorkoutDeckPersisted={onWorkoutDeckPersisted}
      className="min-h-0 flex-1 px-0 py-0"
    />
  );
}

/**
 * Full-width live-video strip above `WorkspaceMainSplit`. Must stay under dashboard `ThemeScope`.
 */
export function DashboardLiveVideoDock({
  session,
  localUserId,
  onLeaveSession,
  canWriteTasks = false,
  onWorkoutDeckPersisted,
}: DashboardLiveVideoDockProps) {
  const supabase = useMemo(() => createClient(), []);

  if (session.mode !== 'workout') return null;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 border-b border-border bg-background/95 px-2 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col">
        <AgoraSessionProvider channelId={session.channelId} workspaceId={session.workspaceId}>
          <div className="flex min-h-0 flex-1 flex-col">
            <DashboardLiveVideoDockRouter
              session={session}
              localUserId={localUserId}
              supabase={supabase}
              onLeaveSession={onLeaveSession}
              canWriteTasks={canWriteTasks}
              onWorkoutDeckPersisted={onWorkoutDeckPersisted}
            />
          </div>
        </AgoraSessionProvider>
      </div>
    </div>
  );
}
