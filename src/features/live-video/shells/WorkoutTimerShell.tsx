'use client';

import { BaseVideoHarness } from '@/features/live-video/BaseVideoHarness';
import { TimerDisplay } from '@/features/live-video/shells/TimerDisplay';
import {
  useSharedTimerSync,
  type UseSharedTimerSyncResult,
} from '@/features/live-video/shells/shared/useSharedTimerSync';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type WorkoutTimerShellProps = {
  workspaceId: string;
  sessionId: string;
  localUserId: string;
  hostUserId: string;
  /** Agora channel id (same as `AgoraSessionProvider` `channelId`); shown in QA status only. */
  agoraChannelId: string;
  className?: string;
  enabled?: boolean;
  /** Called after Agora `leaveChannel` when the user clicks Leave in the harness. */
  onLeaveSession?: () => void;
};

/**
 * Named child of `BaseVideoHarness` so blueprint tripwire logs a real component name (not `'none'`).
 *
 * Re-render note: `TimerDisplay` owns per-frame local state; `BaseVideoHarness` only re-renders when
 * this HUD’s props change or when the parent shell’s low-frequency hook state (`connectionStatus`, `generation`) updates.
 */
function WorkoutTimerHarnessHud({ timer }: { timer: UseSharedTimerSyncResult }) {
  const realtimeConnected = timer.connectionStatus === 'connected';

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-1">
        <TimerDisplay getElapsedMs={timer.getElapsedMs} isActive={realtimeConnected} />
        <p className="text-xs text-muted-foreground">
          Realtime: {timer.connectionStatus} · gen {timer.generation}
        </p>
      </div>
      {timer.isHost ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={!realtimeConnected}
            onClick={timer.start}
          >
            Start
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!realtimeConnected}
            onClick={timer.pause}
          >
            Pause
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!realtimeConnected}
            onClick={timer.reset}
          >
            Reset
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Host controls this session.</p>
      )}
    </div>
  );
}

/**
 * First interactive shell: shared timer (Supabase broadcast) + Agora harness.
 * Timer topic: `timer-sync:${workspaceId}:${sessionId}`.
 */
export function WorkoutTimerShell({
  workspaceId,
  sessionId,
  localUserId,
  hostUserId,
  agoraChannelId,
  className,
  enabled = true,
  onLeaveSession,
}: WorkoutTimerShellProps) {
  const topic = `timer-sync:${workspaceId}:${sessionId}`;
  const timer = useSharedTimerSync({ topic, localUserId, hostUserId, enabled });

  return (
    <div
      className={cn(
        'mx-auto flex w-full max-w-4xl flex-col items-center gap-2 px-4 py-2 text-sm text-muted-foreground',
        className,
      )}
    >
      <p className="w-full max-w-3xl text-xs">
        Timer channel: <span className="font-mono text-foreground">{topic}</span> · Agora:{' '}
        <span className="font-mono text-foreground">{agoraChannelId}</span>
      </p>
      <div className="w-full max-w-4xl">
        <BaseVideoHarness onAfterLeave={onLeaveSession}>
          <WorkoutTimerHarnessHud timer={timer} />
        </BaseVideoHarness>
      </div>
    </div>
  );
}
