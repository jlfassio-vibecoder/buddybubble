import {
  buildAmrapBlockSnapshot,
  type AmrapBlockSnapshotPayload,
} from '@/features/amrap/utils/buildAmrapBlockSnapshot';
import {
  buildInitialEmomMechanicsState,
  type EmomMechanicsState,
} from '@/features/live-video/wrappers/interval/mechanics/emom-mechanics-state';
import type { SessionDeckSnapshot } from '@/features/live-video/shells/huddle/session-deck-snapshot';
import { resolveEmomTimerConfig } from '@/lib/workout-factory/interval-timer/resolve-emom-timer-config';
import { expandExercisesForPlayerLogRows } from '@/lib/workout-factory/resolve-player-log-row-count';
import { buildWorkoutSessionViewModel } from '@/lib/workout-factory/workout-session-view-model';

export type EmomAttachPayload = {
  blockSnapshot: AmrapBlockSnapshotPayload;
  mechanicsState: EmomMechanicsState;
} | null;

export function buildEmomAttachPayload(snap: SessionDeckSnapshot | null): EmomAttachPayload {
  if (!snap) return null;

  const vm = buildWorkoutSessionViewModel(snap.task.metadata);
  const emomBlock = vm.blocks.find((b) => b.blockFormat?.trim().toLowerCase() === 'emom') ?? null;
  if (!emomBlock) return null;

  const timerConfig = resolveEmomTimerConfig(emomBlock);
  if (!timerConfig) return null;

  const blockSnapshotBase = buildAmrapBlockSnapshot(snap);
  if (!blockSnapshotBase) return null;

  const exercises = expandExercisesForPlayerLogRows(vm.flatExercises, vm.blocks);

  const mechanicsState = buildInitialEmomMechanicsState({
    totalMinutes: timerConfig.totalRounds,
    intervalSeconds: timerConfig.intervalSeconds,
    isAlternating: timerConfig.alternatingStations != null,
    alternatingStations:
      timerConfig.alternatingStations != null
        ? timerConfig.alternatingStations.map((m) => [...m])
        : undefined,
  });

  return {
    blockSnapshot: { ...blockSnapshotBase, exercises },
    mechanicsState,
  };
}

export function isEmomDeckSnapshot(snap: SessionDeckSnapshot | null): boolean {
  return buildEmomAttachPayload(snap) != null;
}
