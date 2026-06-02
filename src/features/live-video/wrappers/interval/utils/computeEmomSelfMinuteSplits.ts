import { listEmomGlobalMinutesForStation } from '@/lib/workout-factory/interval-timer/resolve-emom-alternating';
import { isAlternatingEmomParams } from '@/lib/workout-factory/types/emom-format-params';
import type { EmomMinuteSplitEntry } from '@/features/live-video/wrappers/interval/types/interval-engine';
import type { WorkoutExerciseLogRow } from '@/features/live-video/hooks/useWorkoutLogs';
import type { WorkoutSessionBlockView } from '@/lib/workout-factory/workout-session-view-model';
import {
  blockContextForGlobalIndex,
  buildPlayerExerciseIndexLookup,
} from '@/lib/workout-factory/workout-player-exercise-index';

function formatActiveSecondsLabel(seconds: number): string {
  const sec = Math.max(0, Math.floor(seconds));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Inverse of slap set_number mapping: 1-based minute index for a log row. */
export function emomSetNumberToMinuteIndex(
  exerciseIndexInBlock: number,
  setNumber: number,
  formatParams: Record<string, unknown>,
): number | null {
  if (setNumber < 1) return null;
  if (isAlternatingEmomParams(formatParams)) {
    const appearances = listEmomGlobalMinutesForStation(exerciseIndexInBlock, formatParams);
    const localSet = setNumber - 1;
    if (localSet < 0 || localSet >= appearances.length) return null;
    return appearances[localSet]! + 1;
  }
  return setNumber;
}

export type ComputeEmomSelfMinuteSplitsArgs = {
  logs: WorkoutExerciseLogRow[];
  blocks: WorkoutSessionBlockView[];
  formatParams: Record<string, unknown>;
};

/**
 * Self pacing chips from `active_seconds` per EMOM minute.
 * When multiple exercises log the same minute, uses the minimum active_seconds (fastest work).
 */
export function computeEmomSelfMinuteSplits(
  args: ComputeEmomSelfMinuteSplitsArgs,
): EmomMinuteSplitEntry[] {
  const { logs, blocks, formatParams } = args;
  if (logs.length === 0) return [];

  const lookup = buildPlayerExerciseIndexLookup(blocks);
  const nameToExerciseIndex = new Map<string, number>();
  let globalIndex = 0;
  for (const block of blocks) {
    for (const ex of block.exercises) {
      const ctx = blockContextForGlobalIndex(globalIndex, blocks, lookup);
      if (ctx) {
        const label = ex.exerciseName?.trim();
        if (label) nameToExerciseIndex.set(label, ctx.exerciseIndexInBlock);
      }
      globalIndex += 1;
    }
  }

  const byMinute = new Map<number, number>();

  const alternating = isAlternatingEmomParams(formatParams);

  for (const row of logs) {
    const active = row.active_seconds;
    if (active == null || !Number.isFinite(active) || active < 0) continue;

    const exerciseIndexInBlock = nameToExerciseIndex.get(row.exercise_name.trim());
    let minuteIndex: number | null = null;
    if (exerciseIndexInBlock != null) {
      minuteIndex = emomSetNumberToMinuteIndex(exerciseIndexInBlock, row.set_number, formatParams);
    } else if (!alternating && row.set_number >= 1) {
      // Host/flat metadata: log names may not match block exerciseName index.
      minuteIndex = row.set_number;
    }
    if (minuteIndex == null) continue;
    const prev = byMinute.get(minuteIndex);
    if (prev == null || active < prev) {
      byMinute.set(minuteIndex, active);
    }
  }

  return [...byMinute.entries()]
    .sort(([a], [b]) => a - b)
    .map(([minuteIndex, activeSeconds]) => ({
      minuteIndex,
      activeSeconds,
      durationLabel: formatActiveSecondsLabel(activeSeconds),
    }));
}
