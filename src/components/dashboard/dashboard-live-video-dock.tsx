'use client';

import { AgoraSessionProvider, WorkoutTimerShell } from '@/features/live-video';
import type { LiveVideoActiveSession } from '@/store/liveVideoStore';

export type DashboardLiveVideoDockProps = {
  session: LiveVideoActiveSession;
  localUserId: string;
  onLeaveSession: () => void;
};

/**
 * Centered live-video strip above `WorkspaceMainSplit`. Must stay under dashboard `ThemeScope`.
 */
export function DashboardLiveVideoDock({
  session,
  localUserId,
  onLeaveSession,
}: DashboardLiveVideoDockProps) {
  if (session.mode !== 'workout') return null;

  return (
    <div className="flex w-full shrink-0 justify-center border-b border-border bg-background/95 px-2 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="w-full max-w-4xl">
        <AgoraSessionProvider channelId={session.channelId} workspaceId={session.workspaceId}>
          <WorkoutTimerShell
            workspaceId={session.workspaceId}
            sessionId={session.sessionId}
            localUserId={localUserId}
            hostUserId={session.hostUserId}
            agoraChannelId={session.channelId}
            onLeaveSession={onLeaveSession}
            className="px-0 py-0"
          />
        </AgoraSessionProvider>
      </div>
    </div>
  );
}
