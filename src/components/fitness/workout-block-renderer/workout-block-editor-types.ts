import type { Exercise } from '@/lib/workout-factory/types/ai-program';
import { canAddExerciseToBlock } from '@/lib/agents/coach/outline-editor-client';
import { validateBlockShape } from '@/lib/agents/coach/block-blueprint-library';
import { formatBlockSubtitle } from '@/lib/workout-factory/format-block-subtitle';
import type { WorkoutSessionBlockView } from '@/lib/workout-factory/workout-session-view-model';
import type { UnitSystem } from '@/types/database';

export type InstructionSectionKind = 'warmup' | 'finisher' | 'cooldown';

export const SECTION_LABELS: Record<InstructionSectionKind, string> = {
  warmup: 'Warm-up',
  finisher: 'Finisher',
  cooldown: 'Cool-down',
};

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
    name: 'Main work',
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

export const INSTRUCTION_REMOVE_ARIA_LABELS: Record<InstructionSectionKind, string> = {
  warmup: 'Remove warm-up block',
  finisher: 'Remove finisher block',
  cooldown: 'Remove cool-down block',
};

function blockViewForExerciseCountGuard(
  block: WorkoutSessionBlockView,
  exerciseCount: number,
): Record<string, unknown> {
  return {
    block_format: block.blockFormat,
    format_params: block.formatParams,
    exercises: Array.from({ length: exerciseCount }, (_, i) => ({ name: `split-${i}` })),
  };
}

function exerciseNamesFromSplit(names: string[]): string[] {
  return names.map((n) => n.trim()).filter(Boolean);
}

export function canSplitExerciseNames(block: WorkoutSessionBlockView, names: string[]): boolean {
  const trimmed = exerciseNamesFromSplit(names);
  if (trimmed.length < 2) return false;

  const nextCount = block.exercises.length - 1 + trimmed.length;
  if (nextCount < trimmed.length) return false;

  const blockFormat = block.blockFormat;
  if (blockFormat) {
    const params =
      block.formatParams != null &&
      typeof block.formatParams === 'object' &&
      !Array.isArray(block.formatParams)
        ? block.formatParams
        : {};
    if (validateBlockShape(blockFormat, nextCount, params) != null) {
      return false;
    }
    if (
      nextCount > 0 &&
      !canAddExerciseToBlock(blockViewForExerciseCountGuard(block, nextCount - 1))
    ) {
      return false;
    }
  }

  return true;
}

export function splitExerciseInBlock(
  blocks: WorkoutSessionBlockView[],
  blockId: string,
  exerciseIndex: number,
  names: string[],
): WorkoutSessionBlockView[] {
  const trimmed = exerciseNamesFromSplit(names);
  if (trimmed.length < 2) return blocks;

  const target = blocks.find((b) => b.id === blockId);
  if (!target) return blocks;
  if (!canSplitExerciseNames(target, names)) return blocks;

  const source = target.exercises[exerciseIndex];
  if (!source) return blocks;

  const replacements: Exercise[] = trimmed.map((exerciseName) => ({
    id: crypto.randomUUID(),
    order: 0,
    exerciseName,
    sets: source.sets,
    reps: source.reps,
    ...(source.rpe != null ? { rpe: source.rpe } : {}),
    ...(source.restSeconds != null ? { restSeconds: source.restSeconds } : {}),
    ...(source.coachNotes ? { coachNotes: source.coachNotes } : {}),
  }));

  const nextExercises = target.exercises.slice();
  nextExercises.splice(exerciseIndex, 1, ...replacements);

  return blocks.map((b) =>
    b.id === blockId ? { ...b, exercises: renumberBlockExercises(nextExercises) } : b,
  );
}

function renumberInstructionSectionOrders(
  blocks: WorkoutSessionBlockView[],
  section: InstructionSectionKind,
): WorkoutSessionBlockView[] {
  const sortedIds = blocks
    .filter((b) => b.section === section)
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((b) => b.id);
  const orderById = new Map(sortedIds.map((id, i) => [id, i + 1]));
  return blocks.map((b) => (b.section === section ? { ...b, order: orderById.get(b.id)! } : b));
}

function insertIndexForInstructionBlock(
  blocks: WorkoutSessionBlockView[],
  section: InstructionSectionKind,
): number {
  if (section === 'warmup') {
    const lastWarmup = blocks.reduce((last, b, i) => (b.section === 'warmup' ? i : last), -1);
    return lastWarmup >= 0 ? lastWarmup + 1 : 0;
  }
  if (section === 'finisher') {
    const lastFinisher = blocks.reduce((last, b, i) => (b.section === 'finisher' ? i : last), -1);
    if (lastFinisher >= 0) return lastFinisher + 1;
    const lastMain = blocks.reduce((last, b, i) => (b.section === 'main' ? i : last), -1);
    return lastMain >= 0 ? lastMain + 1 : blocks.length;
  }
  return blocks.length;
}

export function createInstructionBlock(
  section: InstructionSectionKind,
  order: number,
): WorkoutSessionBlockView {
  return {
    id: crypto.randomUUID(),
    section,
    order,
    name: SECTION_LABELS[section],
    blockFormat: null,
    formatParams: {},
    subtitle: null,
    exercises: [],
    instructions: [],
  };
}

export function appendInstructionBlock(
  blocks: WorkoutSessionBlockView[],
  newBlock: WorkoutSessionBlockView,
): WorkoutSessionBlockView[] {
  const section = newBlock.section;
  if (section !== 'warmup' && section !== 'finisher' && section !== 'cooldown') {
    return blocks;
  }
  if (blocks.some((b) => b.section === section)) return blocks;
  const insertAt = insertIndexForInstructionBlock(blocks, section);
  const next = blocks.slice();
  next.splice(insertAt, 0, { ...newBlock, section });
  return renumberInstructionSectionOrders(next, section);
}

export function removeInstructionBlockById(
  blocks: WorkoutSessionBlockView[],
  blockId: string,
): WorkoutSessionBlockView[] {
  const target = blocks.find((b) => b.id === blockId);
  if (!target || target.section === 'main') return blocks;
  const section = target.section;
  if (section !== 'warmup' && section !== 'finisher' && section !== 'cooldown') {
    return blocks;
  }
  return renumberInstructionSectionOrders(
    blocks.filter((b) => b.id !== blockId),
    section,
  );
}
