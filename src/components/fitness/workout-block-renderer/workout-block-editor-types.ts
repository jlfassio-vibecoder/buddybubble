import type { BlockFormat } from '@/lib/agents/coach/block-blueprint-library';
import type { Exercise } from '@/lib/workout-factory/types/ai-program';
import type { WorkoutSessionBlockView } from '@/lib/workout-factory/workout-session-view-model';
import type { UnitSystem } from '@/types/database';

export type WorkoutBlockListEditorProps = {
  blocks: WorkoutSessionBlockView[];
  canWrite: boolean;
  workoutUnitSystem: UnitSystem;
  onChange: (next: WorkoutSessionBlockView[]) => void;
  idPrefix?: string;
};

export function blockUsesGroupedLayout(
  blockFormat: BlockFormat | null,
  exerciseCount: number,
): boolean {
  if (exerciseCount < 2) return false;
  return blockFormat === 'superset' || blockFormat === 'contrast' || blockFormat === 'circuit';
}

export function blockStationLabel(
  blockFormat: BlockFormat | null,
  exerciseIndexInBlock: number,
  exerciseCount: number,
): string | null {
  if (!blockUsesGroupedLayout(blockFormat, exerciseCount)) return null;
  return `A${exerciseIndexInBlock + 1}`;
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
