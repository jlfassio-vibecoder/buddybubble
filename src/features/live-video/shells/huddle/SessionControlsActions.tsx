'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ChevronDown, Zap } from 'lucide-react';
import { toast } from 'sonner';
import type { SessionState } from '@/features/live-video/state/sessionStateMachine';
import type { SessionActions } from '@/features/live-video/hooks/useSessionState';
import {
  pickActiveSnapshot,
  buildAmrapBlockSnapshot,
  isAmrapDeckSnapshot,
} from '@/features/amrap/utils/buildAmrapBlockSnapshot';
import { useLiveSessionRuntime } from '@/features/live-video/theater/live-session-runtime-context';
import { SESSION_COMMAND_EVENT } from '@/features/live-video/state/session-sync.types';
import { CustomIntervalLaunchDialog } from '@/features/live-video/shells/huddle/CustomIntervalLaunchDialog';
import { useWorkoutDeckSelectionOptional } from '@/features/live-video/shells/huddle/workout-deck-selection-context';
import { useWrapperAttach } from '@/features/live-video/contexts/WrapperAttachContext';
import {
  buildEmomAttachPayload,
  isEmomDeckSnapshot,
} from '@/features/live-video/wrappers/interval/utils/buildEmomAttachPayload';
import {
  buildCustomIntervalQuickLaunchPayload,
  buildStrictTabataQuickLaunchPayload,
  buildTabataAttachPayload,
  isTabataDeckSnapshot,
  type TabataAttachPayload,
} from '@/features/live-video/wrappers/interval/utils/buildTabataAttachPayload';
import { emomMechanicsStateToJson } from '@/features/live-video/wrappers/interval/mechanics/emom-mechanics-state';
import { tabataMechanicsStateToJson } from '@/features/live-video/wrappers/interval/mechanics/tabata-mechanics-state';
import type { CustomIntervalConfig } from '@/lib/workout-factory/interval-timer/custom-interval-config';
import { resolveIntervalPresetLabel } from '@/lib/workout-factory/interval-timer/interval-preset-catalog';
import type { Json } from '@/types/database';
import type { SoloStudioRecorderStatus } from '@/features/live-video/hooks/useSoloStudioRecorder';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export type SoloRecorderControls = {
  status: SoloStudioRecorderStatus;
  onStart: () => void;
  onStop: () => void | Promise<void>;
  disabled?: boolean;
};

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
  /** Solo Recording Studio: relabel end control; no multi-party audience. */
  isSoloStudio?: boolean;
  /** Solo studio browser capture controls (Record / Stop). */
  soloRecorder?: SoloRecorderControls | null;
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
  isSoloStudio = false,
  soloRecorder = null,
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
  const [customIntervalOpen, setCustomIntervalOpen] = useState(false);
  const [customIntervalSubmitting, setCustomIntervalSubmitting] = useState(false);
  const amrapAttachReady = !disableActions && liveDbReady && liveSessionRowId.trim().length > 0;
  const activeDeckSnap = pickActiveSnapshot(deckSel?.deck ?? [], deckSel?.activeSnapshotId ?? null);
  const tabataAttachReady = amrapAttachReady && isTabataDeckSnapshot(activeDeckSnap);
  const emomAttachReady = amrapAttachReady && isEmomDeckSnapshot(activeDeckSnap);
  const amrapDeckReady = amrapAttachReady && isAmrapDeckSnapshot(activeDeckSnap);

  type DeckLaunchKind = 'tabata' | 'emom' | 'amrap';

  const deckLaunch = useMemo((): { kind: DeckLaunchKind; label: string } | null => {
    if (!activeDeckSnap || !amrapAttachReady) return null;
    if (tabataAttachReady) {
      const payload = buildTabataAttachPayload(activeDeckSnap);
      if (!payload) return null;
      return {
        kind: 'tabata',
        label: resolveIntervalPresetLabel(payload.blockSnapshot.format_params),
      };
    }
    if (emomAttachReady) {
      return { kind: 'emom', label: 'EMOM' };
    }
    if (amrapDeckReady) {
      return { kind: 'amrap', label: 'AMRAP' };
    }
    return null;
  }, [activeDeckSnap, amrapAttachReady, tabataAttachReady, emomAttachReady, amrapDeckReady]);

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

  const attachTabataSession = useCallback(
    async (payload: TabataAttachPayload): Promise<boolean> => {
      if (!payload || !amrapAttachReady) return false;
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
        return false;
      }
      if (typeof data === 'string') {
        setOverride({ kind: 'tabata', config: { interval_session_id: data } });
        actions.transitionToPhase('tabata');
        return true;
      }
      return false;
    },
    [actions, amrapAttachReady, liveSessionRowId, setOverride, supabase],
  );

  const handleEndSessionForAll = () => {
    const runEnd = () => {
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

    if (soloRecorder?.status === 'recording' || soloRecorder?.status === 'requesting') {
      void Promise.resolve(soloRecorder.onStop()).finally(runEnd);
      return;
    }
    runEnd();
  };

  const handleLeaveDockClick = () => {
    if (!onLeaveDock) return;
    if (soloRecorder?.status === 'recording' || soloRecorder?.status === 'requesting') {
      void Promise.resolve(soloRecorder.onStop()).finally(() => {
        onLeaveDock();
      });
      return;
    }
    onLeaveDock();
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

  const handleLaunchDeckBlock = () => {
    if (!deckLaunch) return;
    const snap = pickActiveSnapshot(deckSel?.deck ?? [], deckSel?.activeSnapshotId ?? null);

    if (deckLaunch.kind === 'tabata') {
      const payload = buildTabataAttachPayload(snap);
      if (!payload) {
        console.error(
          '[SessionControlsActions] handleLaunchDeckBlock: stale tabata deck snapshot — rebuild payload returned null',
        );
        return;
      }
      void attachTabataSession(payload);
      return;
    }

    if (deckLaunch.kind === 'emom') {
      if (!emomAttachReady) return;
      handleStartEmomBlock();
      return;
    }

    if (deckLaunch.kind === 'amrap') {
      if (!amrapDeckReady) return;
      handleStartAmrapBlock();
    }
  };

  const handleQuickLaunchStrictTabata = () => {
    void attachTabataSession(buildStrictTabataQuickLaunchPayload());
  };

  const handleQuickLaunchCustomInterval = () => {
    setCustomIntervalOpen(true);
  };

  const handleConfirmCustomInterval = async (config: CustomIntervalConfig): Promise<boolean> => {
    const payload = buildCustomIntervalQuickLaunchPayload(config);
    if (!payload) return false;
    setCustomIntervalSubmitting(true);
    try {
      const ok = await attachTabataSession(payload);
      if (ok) {
        setCustomIntervalOpen(false);
      } else {
        toast.error('Could not start custom interval.');
      }
      return ok;
    } finally {
      setCustomIntervalSubmitting(false);
    }
  };

  const inHuddle = state.phase === 'lobby';
  const activeBlock = !inHuddle && state.status !== 'idle';
  const phaseDisabled = isIdle || disableActions;
  const canPauseBlock = activeBlock && state.status === 'running' && state.blockStartedAt !== null;
  const canResumeBlock = activeBlock && state.status === 'paused';

  const showLifecycle = isIdle || !disableActions;
  const showBlockControls = !isIdle && (inHuddle || activeBlock);
  const showSeparator = showBlockControls && showLifecycle;
  const showIntervalLaunchControls = !isIdle && inHuddle && !activeBlock && amrapAttachReady;

  return (
    <div className={cn('flex min-w-0 flex-wrap items-center justify-end gap-2', className)}>
      <CustomIntervalLaunchDialog
        open={customIntervalOpen}
        onOpenChange={setCustomIntervalOpen}
        onConfirm={handleConfirmCustomInterval}
        submitting={customIntervalSubmitting}
      />
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

      {showIntervalLaunchControls ? (
        <>
          {deckLaunch ? (
            <Button
              type="button"
              size="sm"
              variant="default"
              className="font-medium"
              disabled={phaseDisabled}
              data-testid="interval-deck-launch-button"
              onClick={handleLaunchDeckBlock}
            >
              ▶ Launch {deckLaunch.label}
            </Button>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger
              disabled={phaseDisabled}
              className={cn(
                buttonVariants({ variant: 'secondary', size: 'sm' }),
                'gap-1.5 font-medium',
              )}
              data-testid="interval-quick-launch-trigger"
            >
              <Zap className="size-3.5" aria-hidden />
              Quick Launch
              <ChevronDown className="size-3.5 opacity-70" aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-48">
              <DropdownMenuItem
                disabled={phaseDisabled}
                onClick={handleQuickLaunchStrictTabata}
                data-testid="quick-launch-strict-tabata"
              >
                Strict Tabata (20s/10s)
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={phaseDisabled}
                onClick={handleQuickLaunchCustomInterval}
                data-testid="quick-launch-custom-interval"
              >
                Custom Interval…
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={phaseDisabled}
                onClick={() => actions.transitionToPhase('warmup')}
              >
                Warm-up
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={phaseDisabled || !amrapDeckReady}
                onClick={handleStartAmrapBlock}
              >
                AMRAP block
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={phaseDisabled || !emomAttachReady}
                onClick={handleStartEmomBlock}
              >
                EMOM block
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
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

      {isSoloStudio && soloRecorder ? (
        <>
          {soloRecorder.status === 'recording' ? (
            <Button
              type="button"
              size="sm"
              variant="destructive"
              className="font-medium"
              disabled={Boolean(soloRecorder.disabled) || disableActions}
              onClick={() => {
                void soloRecorder.onStop();
              }}
            >
              <span
                className="mr-1.5 inline-block size-2 animate-pulse rounded-full bg-white"
                aria-hidden
              />
              Stop recording
            </Button>
          ) : soloRecorder.status === 'requesting' ? (
            <Button type="button" size="sm" variant="secondary" className="font-medium" disabled>
              Starting…
            </Button>
          ) : soloRecorder.status === 'uploading' ? (
            <Button type="button" size="sm" variant="secondary" className="font-medium" disabled>
              Uploading…
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="font-medium"
              disabled={Boolean(soloRecorder.disabled) || disableActions}
              onClick={soloRecorder.onStart}
            >
              Record
            </Button>
          )}
          <ControlsSeparator />
        </>
      ) : null}

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
          {isSoloStudio ? 'End studio' : 'End Session for All'}
        </Button>
      ) : null}

      {onLeaveDock ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="font-medium"
          onClick={handleLeaveDockClick}
        >
          Exit workout
        </Button>
      ) : null}
    </div>
  );
}
