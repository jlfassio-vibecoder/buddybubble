'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@utils/supabase/client';
import { useWorkoutUnitSystem } from '@/components/modals/task-modal/hooks/useWorkoutUnitSystem';
import type { ActiveSessionTaskPayload } from '@/features/active-session/types/session-task';
import {
  createNoOpCoachSyncAdapter,
  createProductionFinishWorkoutRunner,
  createProductionPersistenceAdapter,
  type CoachSyncAdapter,
} from '@/features/active-session';
import { useActiveSessionCoachBridge } from '@/features/active-session/hooks/useActiveSessionCoachBridge';
import { useWorkoutSessionViewModel } from '@/hooks/use-workout-session-view-model';
import { formatUserFacingError } from '@/lib/format-error';
import { buildBlankSessionDraftLogs } from '@/lib/workout-factory/ghost-set-snapshot';
import { recoverWorkoutSessionLogs } from '@/lib/workout-factory/recover-workout-session-logs';
import { safeNextPath } from '@/lib/safe-next-path';
import type { SetDraft } from '@/components/fitness/workout-block-renderer/WorkoutPlayerExercisePanel';
import type { ActiveSessionContext } from '../machines/types';
import { useActiveSession } from '../hooks/useActiveSession';
import { SessionCoachPane } from './SessionCoachPane';
import { SessionHUD } from './SessionHUD';
import { SessionLogSurface } from './SessionLogSurface';

type Props = {
  workspaceId: string;
  task: ActiveSessionTaskPayload;
};

export function ActiveSessionShell({ workspaceId, task }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const viewModel = useWorkoutSessionViewModel(task.metadata);
  const { workoutUnitSystem } = useWorkoutUnitSystem(true, workspaceId, true);
  const unit = workoutUnitSystem === 'imperial' ? 'lbs' : 'kg';
  const supabase = useMemo(() => createClient(), []);

  const classInstanceId = searchParams.get('class_instance_id');
  const sessionIdParam = searchParams.get('sessionId');
  const returnUrl = searchParams.get('return');
  const generatedSessionIdRef = useRef(crypto.randomUUID());
  const sessionId = sessionIdParam ?? generatedSessionIdRef.current;
  const exitIntentRef = useRef<'none' | 'finish'>('none');
  const contextRef = useRef<ActiveSessionContext | null>(null);
  const coachAdapterImplRef = useRef<CoachSyncAdapter>(createNoOpCoachSyncAdapter());

  const coachSyncAdapter = useMemo<CoachSyncAdapter>(
    () => ({
      fireSentinel: () => coachAdapterImplRef.current.fireSentinel(),
      canAttemptSentinel: () => coachAdapterImplRef.current.canAttemptSentinel(),
    }),
    [],
  );

  const workoutTitle = task.title?.trim() || 'Workout';

  const templateDraftLogs = useMemo(
    () => buildBlankSessionDraftLogs(viewModel.flatExercises, viewModel.blocks),
    [viewModel.flatExercises, viewModel.blocks],
  );

  const persistenceAdapter = useMemo(
    () =>
      createProductionPersistenceAdapter({
        supabase,
        getContext: () => contextRef.current!,
        sourceMetadata: task.metadata,
        sessionVm: viewModel,
        workoutTitle,
      }),
    [supabase, task.metadata, viewModel, workoutTitle],
  );

  const finishWorkoutRunner = useMemo(
    () =>
      createProductionFinishWorkoutRunner({
        supabase,
        sourceMetadata: task.metadata,
        sessionVm: viewModel,
        workoutTitle,
      }),
    [supabase, task.metadata, viewModel, workoutTitle],
  );

  const machineInput = useMemo(
    () => ({
      sessionId,
      sourceTaskId: task.id,
      bubbleId: task.bubble_id,
      targetBubbleId: task.target_bubble_id,
      workspaceId,
      classInstanceId,
      sourceMetadata: task.metadata,
      workoutTitle,
      sessionVm: viewModel,
      draftLogs: templateDraftLogs,
      persistenceAdapter,
      finishWorkoutRunner,
      coachSyncAdapter,
    }),
    [
      sessionId,
      task.id,
      task.bubble_id,
      task.target_bubble_id,
      task.metadata,
      workspaceId,
      classInstanceId,
      workoutTitle,
      viewModel,
      templateDraftLogs,
      persistenceAdapter,
      finishWorkoutRunner,
      coachSyncAdapter,
    ],
  );

  const { snapshot, send, actorRef } = useActiveSession(machineInput);
  contextRef.current = snapshot.context;

  const isActiveSession = snapshot.matches('active');
  const coachBridge = useActiveSessionCoachBridge({
    enabled: isActiveSession,
    send,
    coachAdapterImplRef,
    workspaceId,
    bubbleId: task.bubble_id,
    sourceTaskId: task.id,
    sessionId,
    classInstanceId,
    sourceMetadata: task.metadata,
    workoutTitle,
    draftLogs: snapshot.context.draftLogs,
    sessionVm: viewModel,
    sentinelFired: snapshot.context.sentinelFired,
    sessionStartedAt: snapshot.context.startedAt,
  });

  const isHydrating = snapshot.matches('hydrating');
  const hydrationFailed = Boolean(snapshot.context.hydrationError);
  const isFinishing = snapshot.matches('finishing');
  const sessionStartedAt = snapshot.matches('active') ? snapshot.context.startedAt : null;

  const abandonDisabled =
    isFinishing || snapshot.matches('closing') || snapshot.context.finishQueued;

  const finishBusy = abandonDisabled;
  const logSurfaceDisabled = isHydrating || isFinishing;

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const result = await recoverWorkoutSessionLogs({
          supabase,
          logBubbleId: task.target_bubble_id,
          sourceTaskId: task.id,
          exercises: viewModel.flatExercises,
          blocks: viewModel.blocks,
        });
        if (cancelled) return;
        send({
          type: 'HYDRATE_DONE',
          draftLogs: result.draftLogs,
          ghostLogs: result.ghostLogs,
          logTaskId: result.logTaskId,
        });
      } catch {
        if (cancelled) return;
        send({ type: 'HYDRATE_FAILED', error: 'draft_recovery_failed' });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [send, supabase, task.target_bubble_id, task.id, viewModel.flatExercises, viewModel.blocks]);

  useEffect(() => {
    if (!sessionStartedAt) return;

    const startedMs = new Date(sessionStartedAt).getTime();
    if (Number.isNaN(startedMs)) return;

    const tick = () => {
      send({
        type: 'SESSION_TICK',
        elapsedSec: Math.max(0, Math.floor((Date.now() - startedMs) / 1000)),
      });
    };

    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [send, sessionStartedAt]);

  useEffect(() => {
    if (snapshot.status !== 'done' || exitIntentRef.current !== 'finish') return;
    router.replace(`/app/${workspaceId}`);
  }, [snapshot.status, router, workspaceId]);

  const finishError = snapshot.context.finishError;
  useEffect(() => {
    if (!finishError) return;
    toast.error(formatUserFacingError(finishError));
  }, [finishError]);

  const onDraftLogsChange = useCallback(
    (next: SetDraft[][]) => send({ type: 'LOGS_CHANGED', draftLogs: next }),
    [send],
  );

  const handleAbandon = () => {
    send({ type: 'ABANDON' });
    const safeReturn = safeNextPath(returnUrl);
    if (safeReturn) {
      router.push(safeReturn);
      return;
    }
    router.back();
  };

  const handleFinish = () => {
    exitIntentRef.current = 'finish';
    send({ type: 'FINISH' });
  };

  if (hydrationFailed) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-8">
        <p className="text-center text-sm text-muted-foreground">
          Could not restore your workout session. Please go back and try again.
        </p>
        <button
          type="button"
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          onClick={handleAbandon}
        >
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SessionHUD
        title={workoutTitle}
        actorRef={actorRef}
        abandonDisabled={abandonDisabled}
        finishBusy={finishBusy}
        onAbandon={handleAbandon}
        onFinish={handleFinish}
        finishDisabled={viewModel.flatExercises.length === 0}
      />
      {isHydrating ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-8">
          <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
          <p className="text-sm text-muted-foreground">Loading session…</p>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <SessionLogSurface
            viewModel={viewModel}
            draftLogs={snapshot.context.draftLogs}
            ghostLogs={snapshot.context.ghostLogs}
            unit={unit}
            disabled={logSurfaceDisabled}
            onDraftLogsChange={onDraftLogsChange}
          />
          <SessionCoachPane
            bubbleId={task.bubble_id}
            taskId={task.id}
            workoutTitle={workoutTitle}
            workoutData={coachBridge.coachWorkoutData}
            bubbleRow={coachBridge.coachBubbleRow}
            canPostMessages={coachBridge.canPostMessages}
            messageThread={coachBridge.messageThread}
          />
        </div>
      )}
    </div>
  );
}
