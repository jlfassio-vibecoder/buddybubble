'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useWorkoutUnitSystem } from '@/components/modals/task-modal/hooks/useWorkoutUnitSystem';
import type { ActiveSessionTaskPayload } from '@/features/active-session/types/session-task';
import { useWorkoutSessionViewModel } from '@/hooks/use-workout-session-view-model';
import { buildPlayerInitialLogs } from '@/lib/workout-factory/resolve-player-log-row-count';
import { safeNextPath } from '@/lib/safe-next-path';
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

  const classInstanceId = searchParams.get('class_instance_id');
  const sessionIdParam = searchParams.get('sessionId');
  const returnUrl = searchParams.get('return');
  const generatedSessionIdRef = useRef(crypto.randomUUID());
  const sessionId = sessionIdParam ?? generatedSessionIdRef.current;
  const exitIntentRef = useRef<'none' | 'finish'>('none');

  const draftLogs = useMemo(
    () => buildPlayerInitialLogs(viewModel.flatExercises, viewModel.blocks),
    [viewModel.flatExercises, viewModel.blocks],
  );

  const machineInput = useMemo(
    () => ({
      sessionId,
      sourceTaskId: task.id,
      bubbleId: task.bubble_id,
      workspaceId,
      classInstanceId,
      draftLogs,
    }),
    [sessionId, task.id, task.bubble_id, workspaceId, classInstanceId, draftLogs],
  );

  const { snapshot, send, actorRef } = useActiveSession(machineInput);

  const abandonDisabled =
    snapshot.matches('finishing') || snapshot.matches('closing') || snapshot.context.finishQueued;

  const finishBusy = abandonDisabled;

  useEffect(() => {
    const startedAt = snapshot.context.startedAt;
    const startedMs = new Date(startedAt).getTime();
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
  }, [send, snapshot.context.startedAt]);

  useEffect(() => {
    if (snapshot.status !== 'done' || exitIntentRef.current !== 'finish') return;
    router.replace(`/app/${workspaceId}`);
  }, [snapshot.status, router, workspaceId]);

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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SessionHUD
        title={task.title ?? 'Active Session'}
        actorRef={actorRef}
        abandonDisabled={abandonDisabled}
        finishBusy={finishBusy}
        onAbandon={handleAbandon}
        onFinish={handleFinish}
        finishDisabled={viewModel.flatExercises.length === 0}
      />
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <SessionLogSurface
          viewModel={viewModel}
          draftLogs={snapshot.context.draftLogs}
          unit={unit}
        />
        <SessionCoachPane />
      </div>
    </div>
  );
}
