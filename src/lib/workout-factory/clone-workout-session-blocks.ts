import type { WorkoutSessionBlockView } from '@/lib/workout-factory/workout-session-view-model';

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
