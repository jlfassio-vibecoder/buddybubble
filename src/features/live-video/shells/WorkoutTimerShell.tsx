'use client';

import { useMemo } from 'react';
import { BaseVideoHarness } from '@/features/live-video/BaseVideoHarness';
import { AmrapVideoOverlays } from '@/features/live-video/ui/AmrapVideoOverlays';
import { TimerDisplay } from '@/features/live-video/shells/TimerDisplay';
import { useLiveSessionRuntime } from '@/features/live-video/theater/live-session-runtime-context';
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

function WorkoutTimerHarnessHud({}: {}) {
  const runtime = useLiveSessionRuntime();
  const realtimeConnected = runtime.connectionStatus === 'connected';
  const state = runtime.state;
  const sessionStatus = state.status;

  return (
    <div className="mt-6 rounded-xl border border-border bg-card/70 p-5 shadow-md backdrop-blur-md">
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <TimerDisplay getElapsedMs={runtime.getElapsedMs} isActive={realtimeConnected} />
            <p className="mt-1 text-xs text-muted-foreground">
              Realtime: {runtime.connectionStatus} · gen {state.generation} · session{' '}
              <span className="font-medium text-foreground">{sessionStatus}</span>
            </p>
          </div>
        </div>

        {runtime.isHost ? (
          <div className="flex flex-col gap-4">
            {sessionStatus === 'idle' ? (
              <Button
                type="button"
                size="lg"
                className="w-full font-semibold sm:w-auto sm:min-w-[12rem]"
                disabled={!realtimeConnected}
                onClick={() => {
                  runtime.actions.startSession();
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
                      runtime.actions.endSession();
                    }}
                  >
                    End Session
                  </Button>
                  {sessionStatus === 'running' ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="border-border/80 bg-background/50"
                      disabled={!realtimeConnected}
                      onClick={() => runtime.actions.pauseSession()}
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
                      onClick={() => runtime.actions.resumeSession()}
                    >
                      Resume
                    </Button>
                  )}
                  <span className="hidden h-6 w-px bg-border/60 sm:block" aria-hidden />
                  <Button
                    type="button"
                    size="sm"
                    variant={state.phase === 'warmup' ? 'secondary' : 'outline'}
                    className={state.phase === 'warmup' ? '' : 'border-border/80 bg-background/50'}
                    onClick={() => runtime.actions.transitionToPhase('warmup')}
                  >
                    Warm-up
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={state.phase === 'amrap' ? 'secondary' : 'outline'}
                    className={state.phase === 'amrap' ? '' : 'border-border/80 bg-background/50'}
                    onClick={() => runtime.actions.transitionToPhase('amrap')}
                  >
                    AMRAP block
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={state.phase === 'tabata' ? 'secondary' : 'outline'}
                    className={state.phase === 'tabata' ? '' : 'border-border/80 bg-background/50'}
                    onClick={() => runtime.actions.transitionToPhase('tabata')}
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
  const runtime = useLiveSessionRuntime();
  // Copilot suggestion ignored: topic is used for the Timer channel QA label in the paragraph below, not an unused variable.
  const topic = useMemo(() => `room-session:${workspaceId}:${sessionId}`, [workspaceId, sessionId]);
  const layoutDisabled =
    runtime.connectionStatus !== 'connected' || !runtime.isHost || enabled === false;

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
          aspectRatio={runtime.aspectRatio}
          videoOverlays={
            runtime.state.phase === 'amrap' ? <AmrapVideoOverlays isHost={runtime.isHost} /> : null
          }
          floatingMediaExtras={
            runtime.isHost ? (
              <label className="flex items-center gap-2 text-xs text-white/90">
                <span className="whitespace-nowrap">Layout</span>
                <select
                  className="h-8 min-w-[4.5rem] rounded-md border border-white/20 bg-white/10 px-2 text-xs text-white shadow-sm disabled:opacity-50 [&>option]:bg-neutral-900 [&>option]:text-white"
                  value={runtime.aspectRatio}
                  onChange={(e) =>
                    runtime.actions.setAspectRatio(e.target.value as typeof runtime.aspectRatio)
                  }
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

        <WorkoutTimerHarnessHud />

        <div className="mt-8 rounded-xl border border-border bg-muted/50 p-6">
          <h3 className="mb-4 text-xl font-semibold text-foreground">Workout Details</h3>
          <p className="text-muted-foreground">Exercise list and data entry will go here.</p>
        </div>
      </div>
    </div>
  );
}
