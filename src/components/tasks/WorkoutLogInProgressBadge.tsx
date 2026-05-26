import {
  isWorkoutLogInProgress,
  WORKOUT_LOG_IN_PROGRESS_LABEL,
  workoutLogInProgressBadgeClassName,
  type WorkoutLogInProgressBadgeVariant,
  type WorkoutLogTaskLike,
} from '@/lib/workout-log-task-state';

type Props = {
  task: WorkoutLogTaskLike;
  variant?: WorkoutLogInProgressBadgeVariant;
  density?: 'summary' | 'default';
};

export function WorkoutLogInProgressBadge({
  task,
  variant = 'kanban',
  density = 'default',
}: Props) {
  if (!isWorkoutLogInProgress(task)) return null;

  return (
    <span
      title={WORKOUT_LOG_IN_PROGRESS_LABEL}
      className={workoutLogInProgressBadgeClassName(variant, density)}
    >
      {density === 'summary' ? 'IP' : WORKOUT_LOG_IN_PROGRESS_LABEL}
    </span>
  );
}
