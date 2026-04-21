'use client';

import { useEffect, useState } from 'react';
import { BaseVideoHarness } from '@/features/live-video/BaseVideoHarness';
import { AmrapVideoOverlays } from '@/features/live-video/ui/AmrapVideoOverlays';
import { TimerDisplay } from '@/features/live-video/shells/TimerDisplay';
import {
  useSharedTimerSync,
  type UseSharedTimerSyncResult,
} from '@/features/live-video/shells/shared/useSharedTimerSync';
import type { LiveAspectRatioId } from '@/features/live-video/shells/shared/shared-timer-sync.types';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type WorkoutPhase = 'idle' | 'amrap' | 'tabata';

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

function WorkoutTimerHarnessHud({
  timer,
  activePhase,
  setActivePhase,
}: {
  timer: UseSharedTimerSyncResult;
  activePhase: WorkoutPhase;
  setActivePhase: (phase: WorkoutPhase) => void;
}) {
  const realtimeConnected = timer.connectionStatus === 'connected';
  const snapshot = timer.getSnapshot();
  const timerStatus = snapshot.status;

  return (
    <div className="mt-6 rounded-xl border border-border bg-card/70 p-5 shadow-md backdrop-blur-md">
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <TimerDisplay getElapsedMs={timer.getElapsedMs} isActive={realtimeConnected} />
            <p className="mt-1 text-xs text-muted-foreground">
              Realtime: {timer.connectionStatus} · gen {timer.generation} · session{' '}
              <span className="font-medium text-foreground">{timerStatus}</span>
            </p>
          </div>
        </div>

        {timer.isHost ? (
          <div className="flex flex-col gap-4">
            {timerStatus === 'idle' ? (
              <Button
                type="button"
                size="lg"
                className="w-full font-semibold sm:w-auto sm:min-w-[12rem]"
                disabled={!realtimeConnected}
                onClick={() => {
                  timer.start();
                }}
              >
                Start Session
              </Button>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Timer session
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    disabled={!realtimeConnected}
                    onClick={() => {
                      timer.reset();
                      setActivePhase('idle');
                    }}
                  >
                    End Session
                  </Button>
                  {snapshot.isRunning ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="border-border/80 bg-background/50"
                      disabled={!realtimeConnected}
                      onClick={() => timer.pause()}
                    >
                      Pause
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="border-border/80 bg-background/50"
                      disabled={!realtimeConnected}
                      onClick={() => timer.start()}
                    >
                      Resume
                    </Button>
                  )}
                  <span className="hidden h-6 w-px bg-border/60 sm:block" aria-hidden />
                  <Button
                    type="button"
                    size="sm"
                    variant={activePhase === 'idle' ? 'secondary' : 'outline'}
                    className={activePhase === 'idle' ? '' : 'border-border/80 bg-background/50'}
                    onClick={() => setActivePhase('idle')}
                  >
                    Warm-up
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={activePhase === 'amrap' ? 'secondary' : 'outline'}
                    className={activePhase === 'amrap' ? '' : 'border-border/80 bg-background/50'}
                    onClick={() => setActivePhase('amrap')}
                  >
                    AMRAP block
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={activePhase === 'tabata' ? 'secondary' : 'outline'}
                    className={activePhase === 'tabata' ? '' : 'border-border/80 bg-background/50'}
                    onClick={() => setActivePhase('tabata')}
                  >
                    Tabata block
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Host controls this session.</p>
        )}
      </div>
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
  const [activePhase, setActivePhase] = useState<WorkoutPhase>('idle');

  useEffect(() => {
    if (timer.getSnapshot().status === 'idle') {
      setActivePhase('idle');
    }
  }, [timer.generation]);

  const layoutDisabled = timer.connectionStatus !== 'connected' || !timer.isHost;

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
        <BaseVideoHarness
          onAfterLeave={onLeaveSession}
          localUserId={localUserId}
          hostUserId={hostUserId}
          aspectRatio={timer.getSnapshot().aspectRatio}
          videoOverlays={
            activePhase === 'amrap' ? <AmrapVideoOverlays isHost={timer.isHost} /> : null
          }
          floatingMediaExtras={
            timer.isHost ? (
              <label className="flex items-center gap-2 text-xs text-white/90">
                <span className="whitespace-nowrap">Layout</span>
                <select
                  className="h-8 min-w-[4.5rem] rounded-md border border-white/20 bg-white/10 px-2 text-xs text-white shadow-sm disabled:opacity-50 [&>option]:bg-neutral-900 [&>option]:text-white"
                  value={timer.aspectRatio}
                  onChange={(e) => timer.setAspectRatio(e.target.value as LiveAspectRatioId)}
                  disabled={layoutDisabled}
                  aria-label="Global aspect ratio"
                >
                  <option value="16:9">16:9</option>
                  <option value="9:16">9:16</option>
                  <option value="1:1">1:1</option>
                </select>
              </label>
            ) : undefined
          }
        />

        <WorkoutTimerHarnessHud
          timer={timer}
          activePhase={activePhase}
          setActivePhase={setActivePhase}
        />

        <div className="mt-8 rounded-xl border border-border bg-muted/50 p-6">
          <h3 className="mb-4 text-xl font-semibold text-foreground">Workout Details</h3>
          <p className="text-muted-foreground">Exercise list and data entry will go here.</p>
        </div>
      </div>
    </div>
  );
}
