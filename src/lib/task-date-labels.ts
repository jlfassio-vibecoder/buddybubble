import type { WorkspaceCategory } from '@/types/database';

export type TaskDateFieldLabels = {
  /** Form label in TaskModal */
  primary: string;
  /** Compact chip on Kanban card */
  short: string;
  /** Optional helper under the field */
  helper?: string;
};

const BY_CATEGORY: Record<WorkspaceCategory, TaskDateFieldLabels> = {
  kids: {
    primary: 'Scheduled on',
    short: 'Scheduled',
    helper: 'Cards show in Today on that calendar day (workspace time).',
  },
  community: {
    primary: 'Scheduled for',
    short: 'Event date',
    helper: 'Cards show in Today on that calendar day (workspace time).',
  },
  business: {
    primary: 'Due by',
    short: 'Due',
    helper: 'Used for planning and sorting.',
  },
  class: {
    primary: 'Due by',
    short: 'Due',
    helper: 'Used for planning and sorting.',
  },
};

export function taskDateFieldLabels(
  category: WorkspaceCategory | null | undefined,
): TaskDateFieldLabels {
  if (!category) {
    return BY_CATEGORY.business;
  }
  return BY_CATEGORY[category] ?? BY_CATEGORY.business;
}
