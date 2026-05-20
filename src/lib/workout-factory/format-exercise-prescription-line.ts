import type { WorkoutExercise } from '@/lib/item-metadata';
import { formatRepsDisplay } from '@/lib/workout-factory/parse-reps-scalar';
import { formatRestLabel } from '@/lib/workout-factory/format-rest-label';
import type { Exercise } from '@/lib/workout-factory/types/ai-program';

function joinMetaBits(bits: string[]): string | null {
  return bits.length > 0 ? bits.join(' · ') : null;
}

/** Prescription meta line from factory `Exercise` (viewer / block renderer). */
export function formatExercisePrescriptionLineFromFactory(ex: Exercise): string | null {
  const bits: string[] = [];
  if (typeof ex.sets === 'number' && ex.sets > 0) bits.push(`${ex.sets}×`);
  if (ex.reps) bits.push(`${formatRepsDisplay(ex.reps)} reps`);
  if (ex.rpe != null) bits.push(`RPE ${ex.rpe}`);
  if (ex.restSeconds != null && ex.restSeconds > 0) bits.push(formatRestLabel(ex.restSeconds));
  if (ex.workSeconds != null && ex.workSeconds > 0) bits.push(`${ex.workSeconds}s work`);
  if (ex.rounds != null && ex.rounds > 0) bits.push(`${ex.rounds} rounds`);
  return joinMetaBits(bits);
}

/** Prescription meta line from flat `WorkoutExercise` (legacy metadata.exercises). */
export function formatExercisePrescriptionLineFromTask(ex: WorkoutExercise): string | null {
  const parts: string[] = [];
  if (ex.sets != null) parts.push(`${ex.sets}×`);
  if (ex.reps != null) parts.push(`${formatRepsDisplay(ex.reps)} reps`);
  const rest = ex.rest_seconds != null ? formatRestLabel(ex.rest_seconds) : '';
  const metaParts = [...parts, rest].filter(Boolean);
  return metaParts.length > 0 ? metaParts.join(' · ') : null;
}

/** Thumbnail URL from flat exercise metadata when present. */
export function exerciseThumbnailSrcFromTask(ex: WorkoutExercise): string | null {
  const u = ex.thumbnail_url;
  return typeof u === 'string' && u.trim().length > 0 ? u.trim() : null;
}
