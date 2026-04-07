import type { WorkspaceCategory } from '@/types/database';

export function kanbanBoardTitleForCategory(
  category: WorkspaceCategory | null | undefined,
): string {
  switch (category) {
    case 'business':
      return 'Team Board';
    case 'kids':
      return 'Kid’s Board';
    case 'class':
      return 'Cohort Board';
    case 'community':
      return 'Community Board';
    default:
      return 'Kanban Board';
  }
}
