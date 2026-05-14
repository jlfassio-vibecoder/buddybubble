'use client';

import { TaskModalHero, type TaskModalHeroProps } from '@/components/modals/task-modal-hero';

export type TaskModalWorkoutHeroProps = Omit<TaskModalHeroProps, 'cinematicPlaceholder'> & {
  /**
   * Default false: workout cards keep the tall 16:9 cinematic header when space allows.
   * Set true for layouts that stack other panes under the hero (e.g. desktop comments split:
   * rail + details) so the flex body receives a bounded share of viewport height.
   */
  compactCinematic?: boolean;
};

/** Workout / workout_log: cinematic shell by default; optional compact header for dense split layouts. */
export function TaskModalWorkoutHero({
  compactCinematic = false,
  ...props
}: TaskModalWorkoutHeroProps) {
  return <TaskModalHero {...props} cinematicPlaceholder compactCinematic={compactCinematic} />;
}
