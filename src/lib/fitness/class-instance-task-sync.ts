import { scheduledTimeInputToPgValue } from '@/lib/task-scheduled-time';

/** Maps `class_instances.scheduled_at` to `tasks.scheduled_on` / `scheduled_time` (local browser TZ). */
export function classScheduledAtToTaskSchedule(scheduledAt: string): {
  scheduled_on: string;
  scheduled_time: string;
} {
  const dt = new Date(scheduledAt);
  const y = dt.getFullYear();
  const mo = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  const h = String(dt.getHours()).padStart(2, '0');
  const mi = String(dt.getMinutes()).padStart(2, '0');
  return {
    scheduled_on: `${y}-${mo}-${d}`,
    scheduled_time: scheduledTimeInputToPgValue(`${h}:${mi}`),
  };
}
