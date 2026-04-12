/**
 * Flattens Interval Timers / workout-contract workout shape into BuddyBubble task metadata exercises.
 */

import type { WorkoutExercise } from '@/lib/item-metadata';
import type { WorkoutInSet } from '@/lib/workout-factory/types/ai-workout';
import type { Exercise } from '@/lib/workout-factory/types/ai-program';
import { getExercisesFromWorkout } from '@/lib/workout-factory/program-schedule-utils';
import type { ProgramWorkout } from '@/lib/workout-factory/program-schedule-utils';
import { normalizeRepsForStorage } from '@/lib/workout-factory/parse-reps-scalar';

function mapExercise(ex: Exercise): WorkoutExercise {
  const name = ex.exerciseName?.trim() || 'Exercise';
  const base: WorkoutExercise = { name };
  if (typeof ex.sets === 'number' && ex.sets > 0) base.sets = ex.sets;
  const repsNorm = normalizeRepsForStorage(ex.reps ?? '');
  if (repsNorm !== undefined) base.reps = repsNorm;
  if (typeof ex.rpe === 'number') base.rpe = ex.rpe;
  if (typeof ex.restSeconds === 'number' && ex.restSeconds > 0) {
    base.rest_seconds = ex.restSeconds;
  }
  if (typeof ex.workSeconds === 'number' && ex.workSeconds > 0) {
    base.work_seconds = ex.workSeconds;
  }
  if (typeof ex.rounds === 'number' && ex.rounds > 0) {
    base.rounds = ex.rounds;
  }
  if (ex.coachNotes?.trim()) base.coach_notes = ex.coachNotes.trim();
  return base;
}

/**
 * Uses the first generated session (typical for a single Kanban workout card).
 */
export function workoutInSetToTaskExercises(workout: WorkoutInSet): WorkoutExercise[] {
  const pw = workout as ProgramWorkout;
  const flat = getExercisesFromWorkout(pw);
  return flat.map(mapExercise);
}
