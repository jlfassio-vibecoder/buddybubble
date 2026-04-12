/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Schedule normalization module: single source of truth for workout/schedule format
 * across programs, challenges, and workout sets.
 *
 * Canonical format contract:
 * - Workout has `exerciseBlocks` (grouped exercises), not legacy `blocks` (flat list).
 * - Each exercise has `reps` as string (AI may return number).
 * - Callers ensure `description` is present where required.
 *
 * Consumers: generate-program-chain, generate-challenge-chain, generate-workout-chain,
 * generate-program, extend-program, admin persistence (programs/challenges/workouts),
 * ProgramBlueprintEditor, WorkoutPlayer, map-program-workout-to-artist.
 *
 * When to use:
 * - normalizeWorkoutForEditor: single workout (e.g. editor init, or one-off normalization).
 * - normalizeProgramSchedule: program or challenge (object with `schedule`: weeks with workouts).
 * - normalizeWorkoutSet: workout set (object with `workouts`: flat array, no weeks).
 * - getExercisesFromWorkout: read-only flatten for display/playback (accepts both formats).
 */

import type { Exercise, ExerciseBlock } from '@/lib/workout-factory/types/ai-program';

export type ProgramWorkout = {
  title: string;
  description: string;
  blocks?: Exercise[];
  exerciseBlocks?: ExerciseBlock[];
  warmupBlocks?: Array<{
    order: number;
    exerciseName: string;
    instructions: string[];
  }>;
  finisherBlocks?: Array<{
    order: number;
    exerciseName: string;
    instructions: string[];
  }>;
  cooldownBlocks?: Array<{
    order: number;
    exerciseName: string;
    instructions: string[];
  }>;
};

/** Normalize reps to string (AI/chain may return number); downstream types expect string. */
function withRepsAsString<T extends { reps?: string | number }>(ex: T): T & { reps: string } {
  const r = ex.reps;
  return { ...ex, reps: typeof r === 'number' ? String(r) : (r ?? '') };
}

/**
 * Normalizes a single workout to canonical format.
 * If workout has `blocks` but no `exerciseBlocks`, converts to
 * exerciseBlocks: [{ name: "Main", exercises: blocks }].
 * Ensures reps is string. Returns workout with exerciseBlocks guaranteed.
 * Use for: editor init, or when you have one workout (e.g. WorkoutInSet).
 */
export function normalizeWorkoutForEditor(
  workout: ProgramWorkout,
): ProgramWorkout & { exerciseBlocks: ExerciseBlock[] } {
  const { blocks: _blocks, ...rest } = workout;
  if (workout.exerciseBlocks && workout.exerciseBlocks.length > 0) {
    const normalizedBlocks = workout.exerciseBlocks.map((block) => ({
      ...block,
      exercises: (block.exercises ?? []).map(withRepsAsString),
    }));
    return { ...rest, exerciseBlocks: normalizedBlocks };
  }
  const legacyBlocks = workout.blocks ?? [];
  const exerciseBlocks: ExerciseBlock[] =
    legacyBlocks.length > 0
      ? [{ order: 1, name: 'Main', exercises: legacyBlocks.map(withRepsAsString) }]
      : [{ order: 1, name: '', exercises: [] }];
  return { ...rest, exerciseBlocks };
}

/**
 * Returns flattened Exercise[] for consumers (WorkoutPlayer, map-program-workout-to-artist).
 * Accepts both legacy `blocks` and canonical `exerciseBlocks`; use for read-only display/playback.
 */
export function getExercisesFromWorkout(workout: ProgramWorkout): Exercise[] {
  if (workout.exerciseBlocks && workout.exerciseBlocks.length > 0) {
    return workout.exerciseBlocks.flatMap((b) => b.exercises ?? []);
  }
  return workout.blocks ?? [];
}

/**
 * Normalizes a program or challenge (object with schedule: weeks with workouts).
 * Each workout gets canonical format. Use at API return and before persistence.
 */
export function normalizeProgramSchedule<
  T extends { schedule?: Array<{ workouts?: ProgramWorkout[] }> },
>(program: T): T {
  if (!program.schedule?.length) return program;
  return {
    ...program,
    schedule: program.schedule.map((week) => ({
      ...week,
      workouts: (week.workouts ?? []).map((w) => normalizeWorkoutForEditor(w)),
    })),
  };
}

/**
 * Normalizes a workout set (object with workouts: flat array, no weeks).
 * Each workout gets canonical format. Use at API return and before persistence.
 */
export function normalizeWorkoutSet<T extends { workouts?: ProgramWorkout[] }>(set: T): T {
  if (!set.workouts?.length) return set;
  return {
    ...set,
    workouts: set.workouts.map((w) => normalizeWorkoutForEditor(w)),
  };
}
