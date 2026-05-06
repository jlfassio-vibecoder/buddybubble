'use client';

import type { SessionState } from '@/features/live-video/state/sessionStateMachine';
import type { SessionActions } from '@/features/live-video/hooks/useSessionState';
import {
  pickActiveSnapshot,
  buildAmrapBlockSnapshot,
} from '@/features/amrap/utils/buildAmrapBlockSnapshot';
import { useLiveSessionRuntime } from '@/features/live-video/theater/live-session-runtime-context';
import { useWorkoutDeckSelectionOptional } from '@/features/live-video/shells/huddle/workout-deck-selection-context';
import { useWrapperAttach } from '@/features/live-video/contexts/WrapperAttachContext';
import type { Json } from '@/types/database';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { SessionClockMini } from '@/features/live-video/shells/huddle/SessionClockMini';

export type SessionControlsProps = {
  state: SessionState;
  actions: SessionActions;
  /** When true, session / phase / pause controls are non-interactive (e.g. non-host clients). */
  disableActions?: boolean;
  /** Host: runs after `actions.endSession()` (e.g. mark chat invite ended). */
  onHostEndLiveSessionForAll?: () => void | Promise<void>;
  /** Host: runs with Start Session to begin cloud recording. */
  onHostStartRecording?: () => void | Promise<void>;
  /**
   * When false, defers the AMRAP / wrapper-attaching RPC because `live_sessions` may not exist yet
   * (avoids the same connect-before-register race that produces 400s on join hints / list participants).
   */
  liveDbReady?: boolean;
  /** Host: show recording pipeline indicator when class metadata is `processing`. */
  hostClassRecordingProcessing?: boolean;
  className?: string;
};

function phaseButtonVariant(active: boolean) {
  return active ? 'secondary' : 'outline';
}

export function SessionControls({
  state,
  actions,
  disableActions = false,
  onHostEndLiveSessionForAll,
  onHostStartRecording,
  liveDbReady = true,
  hostClassRecordingProcessing = false,
  className,
}: SessionControlsProps) {
  const { supabase, sessionId: liveSessionRowId } = useLiveSessionRuntime();
  const { setOverride, override } = useWrapperAttach();
  const deckSel = useWorkoutDeckSelectionOptional();
  const amrapAttachReady = !disableActions && liveDbReady && liveSessionRowId.trim().length > 0;

  const isIdle = state.status === 'idle';

  const handleEndSessionForAll = () => {
    if (amrapAttachReady) {
      void supabase
        .rpc('host_detach_amrap_session', { p_session_id: liveSessionRowId.trim() })
        .then(({ error }) => {
          if (error) {
            if (process.env.NODE_ENV === 'development') {
              console.error(
                '[SessionControls] host_detach_amrap_session',
                error.message,
                error.code,
                error.details,
                error.hint,
              );
            } else {
              console.error('[SessionControls] host_detach_amrap_session failed');
            }
          }
        });
    }
    if (!disableActions) setOverride(null);
    actions.endSession();
    void onHostEndLiveSessionForAll?.();
  };
  const inHuddle = state.phase === 'lobby';
  const activeBlock = !inHuddle && state.status !== 'idle';
  const phaseDisabled = isIdle || disableActions;
  const canPauseBlock = activeBlock && state.status === 'running' && state.blockStartedAt !== null;
  const canResumeBlock = activeBlock && state.status === 'paused';

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/40 px-3 py-3 sm:flex-nowrap sm:justify-between sm:gap-4 sm:px-4',
        className,
      )}
    >
      <SessionClockMini state={state} className="min-w-0 shrink-0 sm:mr-2" />

      <div className="flex min-w-0 flex-1 flex-wrap items-center justify-center gap-2 sm:justify-end">
        {hostClassRecordingProcessing && !disableActions ? (
          <span
            className="inline-flex items-center gap-1.5 rounded-full border border-red-500/45 bg-red-500/10 px-2.5 py-0.5 text-xs font-medium text-red-700 dark:text-red-400"
            role="status"
            aria-live="polite"
          >
            <span
              className="inline-block h-2 w-2 shrink-0 rounded-full bg-red-600 animate-pulse dark:bg-red-500"
              aria-hidden
            />
            Recording
          </span>
        ) : null}
        {isIdle ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="font-medium"
            disabled={disableActions}
            onClick={() => {
              actions.startSession();
              void onHostStartRecording?.();
            }}
          >
            Start Session
          </Button>
        ) : !disableActions ? (
          <Button
            type="button"
            size="sm"
            variant="destructive"
            className="font-medium"
            onClick={handleEndSessionForAll}
          >
            End Session for All
          </Button>
        ) : null}

        {!isIdle && inHuddle ? (
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button
              type="button"
              size="sm"
              variant={phaseButtonVariant(state.phase === 'warmup')}
              className={cn(
                state.phase === 'warmup' &&
                  'ring-2 ring-primary ring-offset-2 ring-offset-background',
              )}
              disabled={phaseDisabled}
              onClick={() => actions.transitionToPhase('warmup')}
            >
              Warm-up
            </Button>
            <Button
              type="button"
              size="sm"
              variant={phaseButtonVariant(state.phase === 'amrap')}
              className={cn(
                state.phase === 'amrap' &&
                  'ring-2 ring-primary ring-offset-2 ring-offset-background',
              )}
              disabled={phaseDisabled || (!disableActions && !liveDbReady)}
              onClick={() => {
                if (!amrapAttachReady) return;
                void (async () => {
                  const snap = pickActiveSnapshot(
                    deckSel?.deck ?? [],
                    deckSel?.activeSnapshotId ?? null,
                  );
                  const blockPayload = buildAmrapBlockSnapshot(snap);
                  const { data, error } = await supabase.rpc('amrap_create_for_session', {
                    p_live_session_id: liveSessionRowId.trim(),
                    p_duration_seconds: 600,
                    p_block_snapshot: (blockPayload ?? null) as Json,
                    p_wrapper_kind: 'amrap',
                  });
                  if (error) {
                    if (process.env.NODE_ENV === 'development') {
                      console.error(
                        '[SessionControls] amrap_create_for_session',
                        error.message,
                        error.code,
                        error.details,
                        error.hint,
                      );
                    } else {
                      console.error('[SessionControls] amrap_create_for_session failed');
                    }
                    return;
                  }
                  if (typeof data === 'string') {
                    setOverride({ kind: 'amrap', config: { amrap_session_id: data } });
                    actions.transitionToPhase('amrap');
                  }
                })();
              }}
            >
              AMRAP block
            </Button>
            <Button
              type="button"
              size="sm"
              variant={phaseButtonVariant(state.phase === 'tabata')}
              className={cn(
                state.phase === 'tabata' &&
                  'ring-2 ring-primary ring-offset-2 ring-offset-background',
              )}
              disabled={phaseDisabled}
              onClick={() => actions.transitionToPhase('tabata')}
            >
              Tabata block
            </Button>
          </div>
        ) : null}

        {!isIdle && !inHuddle ? (
          <div className="flex flex-wrap items-center justify-center gap-2">
            {state.status === 'running' ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="font-medium"
                disabled={disableActions || !canPauseBlock}
                onClick={() => actions.pauseSession()}
              >
                Pause Block
              </Button>
            ) : null}
            {state.status === 'paused' ? (
              <Button
                type="button"
                size="sm"
                variant="default"
                className="font-medium"
                disabled={disableActions || !canResumeBlock}
                onClick={() => actions.resumeSession()}
              >
                Resume Block
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="font-medium"
              disabled={disableActions}
              onClick={() => {
                if (amrapAttachReady) {
                  void supabase
                    .rpc('host_detach_amrap_session', { p_session_id: liveSessionRowId.trim() })
                    .then(({ error }) => {
                      if (error) {
                        if (process.env.NODE_ENV === 'development') {
                          console.error(
                            '[SessionControls] host_detach_amrap_session',
                            error.message,
                            error.code,
                            error.details,
                            error.hint,
                          );
                        } else {
                          console.error('[SessionControls] host_detach_amrap_session failed');
                        }
                      }
                    });
                }
                setOverride(null);
                actions.transitionToPhase('lobby');
              }}
            >
              Return to Huddle
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
