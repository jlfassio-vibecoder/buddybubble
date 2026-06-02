'use client';

import { useEffect, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import type { SessionState } from '@/features/live-video/state/sessionStateMachine';
import type { SessionActions } from '@/features/live-video/hooks/useSessionState';
import {
  pickActiveSnapshot,
  buildAmrapBlockSnapshot,
} from '@/features/amrap/utils/buildAmrapBlockSnapshot';
import { useLiveSessionRuntime } from '@/features/live-video/theater/live-session-runtime-context';
import { SESSION_COMMAND_EVENT } from '@/features/live-video/state/session-sync.types';
import { useWorkoutDeckSelectionOptional } from '@/features/live-video/shells/huddle/workout-deck-selection-context';
import { useWrapperAttach } from '@/features/live-video/contexts/WrapperAttachContext';
import {
  buildEmomAttachPayload,
  isEmomDeckSnapshot,
} from '@/features/live-video/wrappers/interval/utils/buildEmomAttachPayload';
import {
  buildTabataAttachPayload,
  isTabataDeckSnapshot,
} from '@/features/live-video/wrappers/interval/utils/buildTabataAttachPayload';
import { emomMechanicsStateToJson } from '@/features/live-video/wrappers/interval/mechanics/emom-mechanics-state';
import { tabataMechanicsStateToJson } from '@/features/live-video/wrappers/interval/mechanics/tabata-mechanics-state';
import type { Json } from '@/types/database';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export type SessionControlsActionsProps = {
  state: SessionState;
  actions: SessionActions;
  disableActions?: boolean;
  onHostEndLiveSessionForAll?: () => void | Promise<void>;
  onLeaveDock?: () => void;
  onHostStartRecording?: (opts: {
    aspectRatio: SessionState['aspectRatio'];
  }) => void | Promise<void>;
  liveDbReady?: boolean;
  hostClassRecordingPipelineBusy?: boolean;
  hostAsyncWorkoutEnabled?: boolean;
  hostNavActions?: ReactNode;
  hostDeckInjector?: ReactNode;
  className?: string;
};

function ControlsSeparator() {
  return <div className="mx-2 h-4 w-px shrink-0 bg-border" aria-hidden />;
}

/** Survives SessionControlsActions remounts within the same live session tab. */
const recordingHintShownSessionIds = new Set<string>();

function recordingHintToastId(sessionId: string): string {
  return `live-recording-off-hint:${sessionId}`;
}

export function SessionControlsActions({
  state,
  actions,
  disableActions = false,
  onHostEndLiveSessionForAll,
  onHostStartRecording,
  onLeaveDock,
  liveDbReady = true,
  hostClassRecordingPipelineBusy = false,
  hostAsyncWorkoutEnabled,
  hostNavActions,
  hostDeckInjector,
  className,
}: SessionControlsActionsProps) {
  const {
    supabase,
    sessionId: liveSessionRowId,
    isHost,
    localUserId,
    realtimeChannel,
  } = useLiveSessionRuntime();
  const { setOverride } = useWrapperAttach();
  const deckSel = useWorkoutDeckSelectionOptional();
  const amrapAttachReady = !disableActions && liveDbReady && liveSessionRowId.trim().length > 0;
  const activeDeckSnap = pickActiveSnapshot(deckSel?.deck ?? [], deckSel?.activeSnapshotId ?? null);
  const tabataAttachReady = amrapAttachReady && isTabataDeckSnapshot(activeDeckSnap);
  const emomAttachReady = amrapAttachReady && isEmomDeckSnapshot(activeDeckSnap);

  const isIdle = state.status === 'idle';

  useEffect(() => {
    const sessionId = liveSessionRowId.trim();
    if (
      !sessionId ||
      recordingHintShownSessionIds.has(sessionId) ||
      disableActions ||
      onHostStartRecording == null ||
      hostAsyncWorkoutEnabled !== false
    ) {
      return;
    }
    recordingHintShownSessionIds.add(sessionId);
    toast.message('Recording off. Enable async workout to record.', {
      id: recordingHintToastId(sessionId),
    });
  }, [disableActions, hostAsyncWorkoutEnabled, liveSessionRowId, onHostStartRecording]);

  const handleEndSessionForAll = () => {
    if (amrapAttachReady) {
      void supabase
        .rpc('host_detach_amrap_session', { p_session_id: liveSessionRowId.trim() })
        .then(({ error }) => {
          if (error) {
            if (process.env.NODE_ENV === 'development') {
              console.error(
                '[SessionControlsActions] host_detach_amrap_session',
                error.message,
                error.code,
                error.details,
                error.hint,
              );
            } else {
              console.error('[SessionControlsActions] host_detach_amrap_session failed');
            }
          }
        });
    }
    if (!disableActions) setOverride(null);
    const sid = liveSessionRowId.trim();
    if (!disableActions && isHost && realtimeChannel && localUserId && sid) {
      void realtimeChannel.send({
        type: 'broadcast',
        event: SESSION_COMMAND_EVENT,
        payload: { type: 'SESSION_TERMINATED', senderId: localUserId, sessionId: sid },
      });
    }
    actions.endSession();
    void onHostEndLiveSessionForAll?.();
  };

  const handleReturnToHuddle = () => {
    if (amrapAttachReady) {
      void supabase
        .rpc('host_detach_amrap_session', { p_session_id: liveSessionRowId.trim() })
        .then(({ error }) => {
          if (error) {
            if (process.env.NODE_ENV === 'development') {
              console.error(
                '[SessionControlsActions] host_detach_amrap_session',
                error.message,
                error.code,
                error.details,
                error.hint,
              );
            } else {
              console.error('[SessionControlsActions] host_detach_amrap_session failed');
            }
          }
        });
    }
    setOverride(null);
    actions.transitionToPhase('lobby');
  };

  const handleStartAmrapBlock = () => {
    if (!amrapAttachReady) return;
    void (async () => {
      const snap = pickActiveSnapshot(deckSel?.deck ?? [], deckSel?.activeSnapshotId ?? null);
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
            '[SessionControlsActions] amrap_create_for_session',
            error.message,
            error.code,
            error.details,
            error.hint,
          );
        } else {
          console.error('[SessionControlsActions] amrap_create_for_session failed');
        }
        return;
      }
      if (typeof data === 'string') {
        setOverride({ kind: 'amrap', config: { interval_session_id: data } });
        actions.transitionToPhase('amrap');
      }
    })();
  };

  const handleStartEmomBlock = () => {
    if (!emomAttachReady) return;
    void (async () => {
      const snap = pickActiveSnapshot(deckSel?.deck ?? [], deckSel?.activeSnapshotId ?? null);
      const payload = buildEmomAttachPayload(snap);
      if (!payload) return;
      const { data, error } = await supabase.rpc('emom_create_for_session', {
        p_live_session_id: liveSessionRowId.trim(),
        p_block_snapshot: payload.blockSnapshot as Json,
        p_mechanics_state: emomMechanicsStateToJson(payload.mechanicsState) as Json,
      });
      if (error) {
        if (process.env.NODE_ENV === 'development') {
          console.error(
            '[SessionControlsActions] emom_create_for_session',
            error.message,
            error.code,
            error.details,
            error.hint,
          );
        } else {
          console.error('[SessionControlsActions] emom_create_for_session failed');
        }
        return;
      }
      if (typeof data === 'string') {
        setOverride({ kind: 'emom', config: { interval_session_id: data } });
        actions.transitionToPhase('emom');
      }
    })();
  };

  const handleStartTabataBlock = () => {
    if (!tabataAttachReady) return;
    void (async () => {
      const snap = pickActiveSnapshot(deckSel?.deck ?? [], deckSel?.activeSnapshotId ?? null);
      const payload = buildTabataAttachPayload(snap);
      if (!payload) return;
      const { data, error } = await supabase.rpc('tabata_create_for_session', {
        p_live_session_id: liveSessionRowId.trim(),
        p_block_snapshot: payload.blockSnapshot as Json,
        p_mechanics_state: tabataMechanicsStateToJson(payload.mechanicsState) as Json,
      });
      if (error) {
        if (process.env.NODE_ENV === 'development') {
          console.error(
            '[SessionControlsActions] tabata_create_for_session',
            error.message,
            error.code,
            error.details,
            error.hint,
          );
        } else {
          console.error('[SessionControlsActions] tabata_create_for_session failed');
        }
        return;
      }
      if (typeof data === 'string') {
        setOverride({ kind: 'tabata', config: { interval_session_id: data } });
        actions.transitionToPhase('tabata');
      }
    })();
  };

  const inHuddle = state.phase === 'lobby';
  const activeBlock = !inHuddle && state.status !== 'idle';
  const phaseDisabled = isIdle || disableActions;
  const canPauseBlock = activeBlock && state.status === 'running' && state.blockStartedAt !== null;
  const canResumeBlock = activeBlock && state.status === 'paused';

  const showLifecycle = isIdle || !disableActions;
  const showBlockControls = !isIdle && (inHuddle || activeBlock);
  const showSeparator = showBlockControls && showLifecycle;

  return (
    <div className={cn('flex min-w-0 flex-wrap items-center justify-end gap-2', className)}>
      {hostClassRecordingPipelineBusy && !disableActions ? (
        <span
          className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          <span
            className="inline-block h-2 w-2 shrink-0 animate-pulse rounded-full bg-destructive"
            aria-hidden
          />
          REC
        </span>
      ) : null}

      {hostDeckInjector != null ? (
        <div className="flex shrink-0 items-center">{hostDeckInjector}</div>
      ) : null}

      {!isIdle && inHuddle && !activeBlock ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            disabled={phaseDisabled}
            className={cn(
              buttonVariants({ variant: 'secondary', size: 'sm' }),
              'gap-1 font-medium',
            )}
          >
            Intervals
            <ChevronDown className="size-3.5 opacity-70" aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-40">
            <DropdownMenuItem
              disabled={phaseDisabled}
              onClick={() => actions.transitionToPhase('warmup')}
            >
              Warm-up
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={phaseDisabled || !amrapAttachReady}
              onClick={handleStartAmrapBlock}
            >
              AMRAP block
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={phaseDisabled || !tabataAttachReady}
              onClick={handleStartTabataBlock}
            >
              Tabata block
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={phaseDisabled || !emomAttachReady}
              onClick={handleStartEmomBlock}
            >
              EMOM block
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}

      {activeBlock ? (
        <>
          {state.status === 'running' ? (
            <Button
              type="button"
              size="sm"
              variant="default"
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
            variant="secondary"
            className="font-medium"
            disabled={disableActions}
            onClick={handleReturnToHuddle}
          >
            Return to Huddle
          </Button>
        </>
      ) : null}

      {hostNavActions != null ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{hostNavActions}</div>
      ) : null}

      {showSeparator ? <ControlsSeparator /> : null}

      {isIdle ? (
        <Button
          type="button"
          size="sm"
          variant="default"
          className="font-medium"
          disabled={disableActions}
          onClick={() => {
            actions.startSession();
            void onHostStartRecording?.({ aspectRatio: state.aspectRatio });
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

      {onLeaveDock ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="font-medium"
          onClick={onLeaveDock}
        >
          Exit workout
        </Button>
      ) : null}
    </div>
  );
}
