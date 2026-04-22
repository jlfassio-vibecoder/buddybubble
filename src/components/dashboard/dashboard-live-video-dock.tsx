'use client';

import { useMemo } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@utils/supabase/client';
import { AgoraSessionProvider, LiveSessionView, useAgoraSession } from '@/features/live-video';
import { PreJoinBuilder } from '@/features/live-video/shells/huddle/PreJoinBuilder';
import { ParticipantPreJoinSummary } from '@/features/live-video/shells/ParticipantPreJoinSummary';
import type { Database } from '@/types/database';
import type { LiveVideoActiveSession } from '@/store/liveVideoStore';

export type DashboardLiveVideoDockProps = {
  session: LiveVideoActiveSession;
  localUserId: string;
  /** Clears this user's live dock (`leaveSession`); does not end the shared workout or the chat invite. */
  onLeaveSession: () => void;
  /** Host: after `endSession` broadcast, marks the chat invite ended (optional). */
  onHostEndLiveSessionForAll?: () => void | Promise<void>;
  canWriteTasks?: boolean;
  onWorkoutDeckPersisted?: () => void;
};

type DockRouterProps = {
  session: LiveVideoActiveSession;
  localUserId: string;
  supabase: SupabaseClient<Database>;
  onLeaveSession: () => void;
  onHostEndLiveSessionForAll?: () => void | Promise<void>;
  canWriteTasks: boolean;
  onWorkoutDeckPersisted?: () => void;
};

/**
 * Strict pre-join boundary: while Agora is disconnected, the host sees `PreJoinBuilder`
 * (queue + editor + Join CTA); participants see `ParticipantPreJoinSummary` (read-only deck +
 * bulk assign RPC, then Join video). Once `isConnected` or `isConnecting` is true we render
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
  onHostEndLiveSessionForAll,
  canWriteTasks,
  onWorkoutDeckPersisted,
}: DockRouterProps) {
  const { isConnected, isConnecting, joinChannel, joinError } = useAgoraSession();
  const isHost = localUserId === session.hostUserId;

  if (!isConnected && !isConnecting) {
    if (isHost) {
      return (
        <PreJoinBuilder
          workspaceId={session.workspaceId}
          supabase={supabase}
          canWriteTasks={canWriteTasks}
          onWorkoutDeckPersisted={onWorkoutDeckPersisted}
          onLeaveDock={onLeaveSession}
          className="min-h-0 flex-1 px-0 py-0"
        />
      );
    }
    return (
      <ParticipantPreJoinSummary
        sessionId={session.sessionId}
        localUserId={localUserId}
        supabase={supabase}
        onJoin={joinChannel}
        joinError={joinError}
        onLeaveDock={onLeaveSession}
        className="min-h-0 flex-1 px-0 py-0"
      />
    );
  }

  return (
    <LiveSessionView
      localUserId={localUserId}
      hostUserId={session.hostUserId}
      onHostEndLiveSessionForAll={onHostEndLiveSessionForAll}
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
  onHostEndLiveSessionForAll,
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
              onHostEndLiveSessionForAll={onHostEndLiveSessionForAll}
              canWriteTasks={canWriteTasks}
              onWorkoutDeckPersisted={onWorkoutDeckPersisted}
            />
          </div>
        </AgoraSessionProvider>
      </div>
    </div>
  );
}
