import { normalizeItemType } from '@/lib/item-types';
import { parseTaskMetadata } from '@/lib/parse-task-metadata';
import { cn } from '@/lib/utils';

export const WORKOUT_LOG_IN_PROGRESS_STATUS = 'in_progress' as const;
export const WORKOUT_LOG_IN_PROGRESS_LABEL = 'In progress';

export type WorkoutLogTaskLike = {
  item_type?: string | null;
  status?: string | null;
};

export function isWorkoutLogInProgress(task: WorkoutLogTaskLike): boolean {
  return (
    normalizeItemType(task.item_type) === 'workout_log' &&
    task.status === WORKOUT_LOG_IN_PROGRESS_STATUS
  );
}

/** Source workout `tasks.id` stored on draft/completed log metadata. */
export function readWorkoutLogSourceTaskId(meta: unknown): string | null {
  const o = parseTaskMetadata(meta ?? {}) as Record<string, unknown>;
  const raw = o.source_task_id;
  if (typeof raw !== 'string') return null;
  const id = raw.trim();
  return id.length > 0 ? id : null;
}

export function workoutLogInProgressStatusSelectOption(): {
  value: typeof WORKOUT_LOG_IN_PROGRESS_STATUS;
  label: string;
} {
  return { value: WORKOUT_LOG_IN_PROGRESS_STATUS, label: WORKOUT_LOG_IN_PROGRESS_LABEL };
}

export type WorkoutLogInProgressBadgeVariant = 'kanban' | 'kanban-cover' | 'chat' | 'modal-hero';

export function workoutLogInProgressBadgeClassName(
  variant: WorkoutLogInProgressBadgeVariant = 'kanban',
  density: 'summary' | 'default' = 'default',
): string {
  const size =
    density === 'summary'
      ? 'px-1 py-0.5 text-[9px] uppercase tracking-wide'
      : 'px-1.5 py-0.5 text-[10px]';

  const base = cn('inline-flex rounded-md border font-medium leading-none', size);

  if (variant === 'kanban-cover') {
    return cn(base, 'border-white/30 bg-black/20 text-white');
  }

  if (variant === 'chat') {
    return cn(
      base,
      'border-[color:color-mix(in_srgb,var(--accent-yellow)_38%,transparent)] bg-[var(--accent-yellow-bg)] text-[var(--accent-yellow-text)]',
    );
  }

  if (variant === 'modal-hero') {
    return cn(
      base,
      'border-[color:color-mix(in_srgb,var(--accent-yellow)_38%,transparent)] bg-[var(--accent-yellow-bg)] text-[var(--accent-yellow-text)]',
    );
  }

  return cn(
    base,
    'border-[color:color-mix(in_srgb,var(--accent-yellow)_38%,transparent)] bg-[var(--accent-yellow-bg)] text-[var(--accent-yellow-text)]',
  );
}
