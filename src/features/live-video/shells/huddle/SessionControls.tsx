'use client';

import type { SessionState } from '@/features/live-video/state/sessionStateMachine';
import type { SessionActions } from '@/features/live-video/hooks/useSessionState';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { SessionClockMini } from '@/features/live-video/shells/huddle/SessionClockMini';

export type SessionControlsProps = {
  state: SessionState;
  actions: SessionActions;
  /** When true, session / phase / pause controls are non-interactive (e.g. non-host clients). */
  disableActions?: boolean;
  className?: string;
};

function phaseButtonVariant(active: boolean) {
  return active ? 'secondary' : 'outline';
}

export function SessionControls({
  state,
  actions,
  disableActions = false,
  className,
}: SessionControlsProps) {
  const isIdle = state.status === 'idle';
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
        ) : (
          <Button
            type="button"
            size="sm"
            variant="destructive"
            className="font-medium"
            disabled={disableActions}
            onClick={actions.endSession}
          >
            End Session
          </Button>
        )}

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
              disabled={phaseDisabled}
              onClick={() => actions.transitionToPhase('amrap')}
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
              onClick={() => actions.transitionToPhase('lobby')}
            >
              Return to Huddle
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
