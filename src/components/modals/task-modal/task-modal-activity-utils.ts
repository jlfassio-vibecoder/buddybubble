import type { TaskActivityEntry } from '@/types/task-modal';

export function formatActivityLine(e: TaskActivityEntry): string {
  if (e.type === 'field_change' && e.field) {
    if (e.field === 'title') return `Title updated`;
    if (e.field === 'description') return `Description updated`;
    if (e.field === 'status') return `Status changed to "${e.to ?? ''}"`;
    if (e.field === 'priority') return `Priority changed to "${e.to ?? ''}"`;
  }
  return e.message || 'Activity';
}
