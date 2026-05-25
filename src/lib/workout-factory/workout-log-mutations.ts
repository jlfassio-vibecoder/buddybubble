import type { SetDraft } from '@/components/fitness/workout-block-renderer/WorkoutPlayerExercisePanel';
import type { WorkoutExercise } from '@/lib/item-metadata';

export function applySetChange(
  draftLogs: SetDraft[][],
  exIdx: number,
  setIdx: number,
  field: 'weight' | 'reps' | 'rpe',
  value: string,
): SetDraft[][] {
  const next = draftLogs.map((rows) => [...rows]);
  const row = next[exIdx]?.[setIdx];
  if (row) next[exIdx][setIdx] = { ...row, [field]: value };
  return next;
}

export function toggleSetDone(
  draftLogs: SetDraft[][],
  exIdx: number,
  setIdx: number,
): SetDraft[][] {
  const next = draftLogs.map((rows) => [...rows]);
  const row = next[exIdx]?.[setIdx];
  if (row) next[exIdx][setIdx] = { ...row, done: !row.done };
  return next;
}

export function appendSetRow(
  draftLogs: SetDraft[][],
  exIdx: number,
  exercise: WorkoutExercise,
): SetDraft[][] {
  const next = draftLogs.map((rows) => [...rows]);
  if (!next[exIdx]) return next;
  next[exIdx] = [
    ...next[exIdx],
    {
      weight: exercise.weight != null ? String(exercise.weight) : '',
      reps: typeof exercise.reps === 'number' ? String(exercise.reps) : '',
      rpe: '',
      done: false,
    },
  ];
  return next;
}
