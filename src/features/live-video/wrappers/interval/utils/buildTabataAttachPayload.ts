import {
  buildInitialTabataMechanicsState,
  type TabataMechanicsState,
} from '@/features/live-video/wrappers/interval/mechanics/tabata-mechanics-state';
import {
  buildTabataBlockSnapshotBase,
  tabataFormatParamsFromRecord,
  type TabataBlockSnapshotPayload,
} from '@/features/live-video/wrappers/interval/utils/tabata-block-snapshot';
import type { SessionDeckSnapshot } from '@/features/live-video/shells/huddle/session-deck-snapshot';
import { applyIntervalPreset } from '@/lib/workout-factory/interval-timer/interval-preset-catalog';
import { resolveTabataTimerConfig } from '@/lib/workout-factory/interval-timer/resolve-tabata-timer-config';
import { expandExercisesForPlayerLogRows } from '@/lib/workout-factory/resolve-player-log-row-count';
import { buildWorkoutSessionViewModel } from '@/lib/workout-factory/workout-session-view-model';

export type TabataAttachPayload = {
  blockSnapshot: TabataBlockSnapshotPayload;
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

  const blockSnapshotBase = buildTabataBlockSnapshotBase(snap);
  if (!blockSnapshotBase) return null;

  const exercises = expandExercisesForPlayerLogRows(vm.flatExercises, vm.blocks);
  const formatParams = tabataFormatParamsFromRecord(tabataBlock.formatParams);

  const mechanicsState = buildInitialTabataMechanicsState({
    totalRounds: timerConfig.totalRounds,
    workSeconds: Math.round(timerConfig.workMs / 1000),
    restSeconds: Math.round(timerConfig.restMs / 1000),
  });

  return {
    blockSnapshot: {
      ...blockSnapshotBase,
      exercises,
      block_format: 'tabata',
      format_params: formatParams,
    },
    mechanicsState,
  };
}

export function isTabataDeckSnapshot(snap: SessionDeckSnapshot | null): boolean {
  return buildTabataAttachPayload(snap) != null;
}

/** On-the-fly strict Izumi Tabata (20/10 × 8) — bypasses deck card prescription. */
export function buildStrictTabataQuickLaunchPayload(): TabataAttachPayload {
  const formatParams = applyIntervalPreset('tabata');
  const mechanicsState = buildInitialTabataMechanicsState({
    totalRounds: formatParams.rounds,
    workSeconds: formatParams.work_seconds,
    restSeconds: formatParams.rest_seconds,
  });

  return {
    blockSnapshot: {
      title: 'Strict Tabata',
      workout_type: null,
      duration_min: null,
      exercises: [{ name: 'Movement', sets: formatParams.rounds, reps: 10 }],
      block_format: 'tabata',
      format_params: formatParams,
    },
    mechanicsState,
  };
}
