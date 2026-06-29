import type { Exercise } from '@/lib/workout-factory/types/ai-program';
import type { WorkoutSessionBlockView } from '@/lib/workout-factory/workout-session-view-model';
import type { UnitSystem } from '@/types/database';

export type { BlockFormat } from '@/lib/agents/coach/block-blueprint-library';
export {
  blockStationLabel,
  blockUsesGroupedLayout,
} from '@/lib/workout-factory/block-station-label';

export type WorkoutBlockListEditorProps = {
  blocks: WorkoutSessionBlockView[];
  canWrite: boolean;
  workoutUnitSystem: UnitSystem;
  onChange: (next: WorkoutSessionBlockView[]) => void;
  idPrefix?: string;
};

function renumberBlockExercises(exercises: Exercise[]): Exercise[] {
  return exercises.map((ex, i) => ({ ...ex, order: i + 1 }));
}

export function createDefaultBlockExercise(
  block: Pick<WorkoutSessionBlockView, 'exercises'>,
  index: number,
): Exercise {
  const exercises = block.exercises ?? [];
  const prev = index > 0 ? exercises[index - 1] : undefined;
  const reps = prev?.reps;
  return {
    id: crypto.randomUUID(),
    order: index + 1,
    exerciseName: '',
    sets: prev?.sets ?? 1,
    reps: typeof reps === 'number' ? String(reps) : (reps ?? ''),
  };
}

export function addExerciseToBlock(
  blocks: WorkoutSessionBlockView[],
  blockId: string,
  exercise: Exercise,
): WorkoutSessionBlockView[] {
  return blocks.map((b) => {
    if (b.id !== blockId) return b;
    return { ...b, exercises: renumberBlockExercises([...b.exercises, exercise]) };
  });
}

export function updateBlock(
  blocks: WorkoutSessionBlockView[],
  blockId: string,
  patch: Partial<WorkoutSessionBlockView>,
): WorkoutSessionBlockView[] {
  return blocks.map((b) => (b.id === blockId ? { ...b, ...patch } : b));
}

export function updateExerciseInBlock(
  blocks: WorkoutSessionBlockView[],
  blockId: string,
  exerciseIndex: number,
  patch: Partial<Exercise>,
): WorkoutSessionBlockView[] {
  return blocks.map((b) => {
    if (b.id !== blockId) return b;
    const exercises = b.exercises.map((ex, i) => (i === exerciseIndex ? { ...ex, ...patch } : ex));
    return { ...b, exercises };
  });
}

export function removeExerciseFromBlock(
  blocks: WorkoutSessionBlockView[],
  blockId: string,
  exerciseIndex: number,
): WorkoutSessionBlockView[] {
  return blocks.map((b) => {
    if (b.id !== blockId) return b;
    return {
      ...b,
      exercises: renumberBlockExercises(b.exercises.filter((_, i) => i !== exerciseIndex)),
    };
  });
}
