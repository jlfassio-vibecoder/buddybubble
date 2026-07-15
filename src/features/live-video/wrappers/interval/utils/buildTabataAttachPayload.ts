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
import {
  type CustomIntervalConfig,
  validateCustomIntervalConfig,
} from '@/lib/workout-factory/interval-timer/custom-interval-config';
import { applyIntervalPreset } from '@/lib/workout-factory/interval-timer/interval-preset-catalog';
import { resolveTabataTimerConfig } from '@/lib/workout-factory/interval-timer/resolve-tabata-timer-config';
import { resolveTabataWorkSegmentTotal } from '@/lib/workout-factory/interval-timer/tabata-circuit-rotation';
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

/** Locked Izumi Tabata rounds — independent of catalog `defaultRounds` drift. */
const STRICT_TABATA_ROUNDS = 8;

/** On-the-fly strict Izumi Tabata (20/10 × 8) — bypasses deck card prescription. */
export function buildStrictTabataQuickLaunchPayload(): TabataAttachPayload {
  const formatParams = applyIntervalPreset('tabata', { rounds: STRICT_TABATA_ROUNDS });
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

/**
 * On-the-fly custom work/rest interval — bypasses deck card prescription.
 * Returns null when config fails validation.
 */
export function buildCustomIntervalQuickLaunchPayload(
  config: CustomIntervalConfig,
): TabataAttachPayload {
  const validated = validateCustomIntervalConfig(config);
  if (!validated.ok) return null;

  const { work_seconds, rest_seconds, rounds, interval_preset, station_names } = validated.value;
  const formatParams = { work_seconds, rest_seconds, rounds, interval_preset };
  const names = station_names != null && station_names.length > 0 ? station_names : ['Movement'];
  const exerciseCount = names.length;
  const totalRounds = resolveTabataWorkSegmentTotal(rounds, exerciseCount);
  const exercises = names.map((name) => ({ name, sets: rounds, reps: 10 }));
  const mechanicsState = buildInitialTabataMechanicsState({
    totalRounds,
    workSeconds: work_seconds,
    restSeconds: rest_seconds,
  });

  return {
    blockSnapshot: {
      title: 'Custom Interval',
      workout_type: null,
      duration_min: null,
      exercises,
      block_format: 'tabata',
      format_params: formatParams,
    },
    mechanicsState,
  };
}
