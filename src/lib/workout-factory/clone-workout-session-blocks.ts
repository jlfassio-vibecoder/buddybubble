import type { WorkoutSessionBlockView } from '@/lib/workout-factory/workout-session-view-model';

/** Stable content key — detects block edits/regen without depending on array identity. */
export function workoutSessionBlocksContentKey(blocks: WorkoutSessionBlockView[]): string {
  return JSON.stringify(
    blocks.map((b) => ({
      id: b.id,
      section: b.section,
      order: b.order,
      name: b.name,
      blockFormat: b.blockFormat,
      formatParams: b.formatParams,
      subtitle: b.subtitle,
      exercises: b.exercises,
      instructions: b.instructions,
    })),
  );
}

/** Deep-clone block views for local editor draft state (viewer + builder review). */
export function cloneWorkoutSessionBlocksForEditor(
  blocks: WorkoutSessionBlockView[],
): WorkoutSessionBlockView[] {
  return blocks.map((b) => ({
    ...b,
    exercises: b.exercises.map((ex) => ({ ...ex })),
    instructions: [...b.instructions],
  }));
}
