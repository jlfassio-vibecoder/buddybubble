'use client';

import { TaskModalHero, type TaskModalHeroProps } from '@/components/modals/task-modal-hero';

export type TaskModalWorkoutHeroProps = Omit<
  TaskModalHeroProps,
  'cinematicPlaceholder' | 'compactCinematic'
>;

/** Workout / workout_log: always use the 16:9 cinematic shell (gradient placeholder when no cover). */
export function TaskModalWorkoutHero(props: TaskModalWorkoutHeroProps) {
  return <TaskModalHero {...props} cinematicPlaceholder compactCinematic={false} />;
}
