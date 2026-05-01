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
  /**
   * When false, defers the AMRAP / wrapper-attaching RPC because `live_sessions` may not exist yet
   * (avoids the same connect-before-register race that produces 400s on join hints / list participants).
   */
  liveDbReady?: boolean;
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
  liveDbReady = true,
  className,
}: SessionControlsProps) {
  const { supabase, sessionId: liveSessionRowId } = useLiveSessionRuntime();
  const { setOverride } = useWrapperAttach();
  const deckSel = useWorkoutDeckSelectionOptional();
  const amrapAttachReady = !disableActions && liveDbReady && liveSessionRowId.trim().length > 0;

  const isIdle = state.status === 'idle';

  const handleEndSessionForAll = () => {
    if (amrapAttachReady) {
      void supabase
        .rpc('host_detach_amrap_session', { p_session_id: liveSessionRowId.trim() })
        .then(({ error }) => {
          if (error) {
            console.error(
              '[SessionControls] host_detach_amrap_session',
              error.message,
              error.code,
              error.details,
              error.hint,
            );
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
        {isIdle ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="font-medium"
            disabled={disableActions}
            onClick={actions.startSession}
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
                if (amrapAttachReady) {
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
                    });
                    if (error) {
                      console.error(
                        '[SessionControls] amrap_create_for_session',
                        error.message,
                        error.code,
                        error.details,
                        error.hint,
                      );
                      return;
                    }
                    if (typeof data === 'string') {
                      setOverride({ kind: 'amrap', config: { amrap_session_id: data } });
                    }
                  })();
                }
                actions.transitionToPhase('amrap');
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
                        console.error(
                          '[SessionControls] host_detach_amrap_session',
                          error.message,
                          error.code,
                          error.details,
                          error.hint,
                        );
                      }
                    });
                }
                if (!disableActions) setOverride(null);
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
