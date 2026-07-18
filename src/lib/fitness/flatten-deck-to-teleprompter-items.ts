import type { SessionDeckSnapshot } from '@/features/live-video/shells/huddle/session-deck-snapshot';
import {
  estimateExerciseDurationSec,
  type EstimateExerciseDurationInput,
  type TeleprompterItem,
} from '@/lib/fitness/estimate-exercise-duration';
import { parseTaskMetadata } from '@/lib/item-metadata';
import { deriveFlatExercisesFromMetadata } from '@/lib/workout-factory/sync-workout-metadata';

function parentDeckKey(snap: SessionDeckSnapshot): string {
  return snap.deckItemId ?? snap.snapshotId;
}

function positiveNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

function cardLevelEstimateInput(meta: unknown): EstimateExerciseDurationInput {
  const o = parseTaskMetadata(meta) as Record<string, unknown>;
  return {
    name: typeof o.workout_type === 'string' ? o.workout_type : null,
    duration_min: positiveNumber(o.duration_min) ?? null,
    work_seconds: positiveNumber(o.work_seconds) ?? null,
    rest_seconds: positiveNumber(o.rest_seconds) ?? null,
    rounds: positiveNumber(o.rounds) ?? null,
    sets: positiveNumber(o.sets) ?? null,
  };
}

function exerciseToInput(ex: {
  name?: string;
  sets?: number;
  reps?: number | string;
  duration_min?: number;
  work_seconds?: number;
  rest_seconds?: number;
  rounds?: number;
}): EstimateExerciseDurationInput {
  return {
    name: ex.name ?? null,
    sets: positiveNumber(ex.sets) ?? null,
    reps: ex.reps ?? null,
    duration_min: positiveNumber(ex.duration_min) ?? null,
    work_seconds: positiveNumber(ex.work_seconds) ?? null,
    rest_seconds: positiveNumber(ex.rest_seconds) ?? null,
    rounds: positiveNumber(ex.rounds) ?? null,
  };
}

/**
 * Flatten a live deck into teleprompter items (exercise-level pacing, parent card scroll key).
 */
export function flattenDeckToTeleprompterItems(deck: SessionDeckSnapshot[]): TeleprompterItem[] {
  if (!Array.isArray(deck) || deck.length === 0) return [];

  const out: TeleprompterItem[] = [];
  for (const snap of deck) {
    if (!snap) continue;
    const parentId = parentDeckKey(snap);
    const exercises = deriveFlatExercisesFromMetadata(snap.task?.metadata);

    if (exercises.length > 0) {
      exercises.forEach((ex, index) => {
        const input = exerciseToInput(ex);
        const estimateSec = estimateExerciseDurationSec(input);
        out.push({
          ...input,
          id: `${parentId}-ex-${index}`,
          deckItemId: parentId,
          estimateSec,
        });
      });
      continue;
    }

    const input = cardLevelEstimateInput(snap.task?.metadata);
    const estimateSec = estimateExerciseDurationSec(input);
    out.push({
      ...input,
      id: `${parentId}-synthetic`,
      deckItemId: parentId,
      estimateSec,
    });
  }
  return out;
}
