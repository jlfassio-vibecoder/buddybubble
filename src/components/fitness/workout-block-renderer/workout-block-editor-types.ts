import type { Exercise } from '@/lib/workout-factory/types/ai-program';
import { formatBlockSubtitle } from '@/lib/workout-factory/format-block-subtitle';
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

export function moveArrayItem<T>(array: readonly T[], from: number, to: number): T[] {
  const next = array.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
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

export function reorderExercisesInBlock(
  blocks: WorkoutSessionBlockView[],
  blockId: string,
  oldIndex: number,
  newIndex: number,
): WorkoutSessionBlockView[] {
  if (oldIndex === newIndex || oldIndex < 0 || newIndex < 0) return blocks;
  return blocks.map((b) => {
    if (b.id !== blockId) return b;
    const moved = moveArrayItem(b.exercises, oldIndex, newIndex);
    return { ...b, exercises: renumberBlockExercises(moved) };
  });
}

function renumberMainBlockOrders(blocks: WorkoutSessionBlockView[]): WorkoutSessionBlockView[] {
  const sortedMainIds = blocks
    .filter((b) => b.section === 'main')
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((b) => b.id);
  const orderById = new Map(sortedMainIds.map((id, i) => [id, i + 1]));
  return blocks.map((b) => (b.section === 'main' ? { ...b, order: orderById.get(b.id)! } : b));
}

export function createDefaultMainBlock(order: number): WorkoutSessionBlockView {
  const blockFormat = 'straight_sets' as const;
  const formatParams = {};
  return {
    id: crypto.randomUUID(),
    section: 'main',
    order,
    name: 'MAIN',
    blockFormat,
    formatParams,
    subtitle: formatBlockSubtitle(blockFormat, formatParams),
    exercises: [createDefaultBlockExercise({ exercises: [] }, 0)],
    instructions: [],
  };
}

export function appendMainBlock(
  blocks: WorkoutSessionBlockView[],
  newBlock: WorkoutSessionBlockView,
): WorkoutSessionBlockView[] {
  const lastMainIndex = blocks.reduce((last, b, i) => (b.section === 'main' ? i : last), -1);
  const insertAt = lastMainIndex >= 0 ? lastMainIndex + 1 : blocks.length;
  const next = blocks.slice();
  next.splice(insertAt, 0, { ...newBlock, section: 'main' });
  return renumberMainBlockOrders(next);
}

export function removeMainBlockById(
  blocks: WorkoutSessionBlockView[],
  blockId: string,
): WorkoutSessionBlockView[] {
  const target = blocks.find((b) => b.id === blockId);
  if (!target || target.section !== 'main') return blocks;
  const mainCount = blocks.filter((b) => b.section === 'main').length;
  if (mainCount <= 1) return blocks;
  return renumberMainBlockOrders(blocks.filter((b) => b.id !== blockId));
}
