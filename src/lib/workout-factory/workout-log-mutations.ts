import type { SetDraft } from '@/components/fitness/workout-block-renderer/WorkoutPlayerExercisePanel';
import type { WorkoutExercise } from '@/lib/item-metadata';
import type { ExecutionPatch } from '@/types/execution-patch';

/** Apply Coach `execution_patch` to Active Session draft logs (V1 WorkoutPlayer grid parity). */
export function applyExecutionPatchToDraftLogs(
  draftLogs: SetDraft[][],
  patch: ExecutionPatch,
): SetDraft[][] {
  const next = draftLogs.map((row) => row.map((c) => ({ ...c })));
  for (const { exerciseIndex: exIdx, setIndex: setIdx, weight, reps, rpe, done } of patch) {
    if (exIdx < 0 || exIdx >= next.length) continue;
    const exRow = next[exIdx];
    if (setIdx < 0 || setIdx >= exRow.length) continue;
    const cell = next[exIdx][setIdx];
    if (weight !== undefined) cell.weight = weight;
    if (reps !== undefined) cell.reps = reps;
    if (rpe !== undefined) cell.rpe = rpe;
    if (done !== undefined) cell.done = done;
  }
  return next;
}

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
