import {
  buildAmrapBlockSnapshot,
  type AmrapBlockSnapshotPayload,
} from '@/features/amrap/utils/buildAmrapBlockSnapshot';
import {
  buildInitialTabataMechanicsState,
  type TabataMechanicsState,
} from '@/features/live-video/wrappers/interval/mechanics/tabata-mechanics-state';
import type { SessionDeckSnapshot } from '@/features/live-video/shells/huddle/session-deck-snapshot';
import { resolveTabataTimerConfig } from '@/lib/workout-factory/interval-timer/resolve-tabata-timer-config';
import { expandExercisesForPlayerLogRows } from '@/lib/workout-factory/resolve-player-log-row-count';
import { buildWorkoutSessionViewModel } from '@/lib/workout-factory/workout-session-view-model';

export type TabataAttachPayload = {
  blockSnapshot: AmrapBlockSnapshotPayload;
  mechanicsState: TabataMechanicsState;
} | null;

export function buildTabataAttachPayload(snap: SessionDeckSnapshot | null): TabataAttachPayload {
  if (!snap) return null;

  const vm = buildWorkoutSessionViewModel(snap.task.metadata);
  const tabataBlock =
    vm.blocks.find((b) => b.blockFormat?.trim().toLowerCase() === 'tabata') ?? null;
  if (!tabataBlock) return null;

  const timerConfig = resolveTabataTimerConfig(tabataBlock);
  if (!timerConfig) return null;

  const blockSnapshotBase = buildAmrapBlockSnapshot(snap);
  if (!blockSnapshotBase) return null;

  const exercises = expandExercisesForPlayerLogRows(vm.flatExercises, vm.blocks);

  const mechanicsState = buildInitialTabataMechanicsState({
    totalRounds: timerConfig.totalRounds,
    workSeconds: Math.round(timerConfig.workMs / 1000),
    restSeconds: Math.round(timerConfig.restMs / 1000),
  });

  return {
    blockSnapshot: { ...blockSnapshotBase, exercises },
    mechanicsState,
  };
}

export function isTabataDeckSnapshot(snap: SessionDeckSnapshot | null): boolean {
  return buildTabataAttachPayload(snap) != null;
}
