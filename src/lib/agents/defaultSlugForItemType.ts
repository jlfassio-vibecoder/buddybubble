import { COACH_SLUG } from '@/lib/agents/coach/config';
import type { ItemType } from '@/lib/item-types';

/**
 * TaskModal comments default agent slug from `tasks.item_type`.
 * Frozen mapping: docs/refactor/standard-task-chat-rail/phase-0-discovery-and-decisions.md §3c.
 * `null` = omit `default_agent_slug` on insert (human-only default for routing).
 */
export function defaultSlugForItemType(itemType: ItemType | null | undefined): string | null {
  switch (itemType) {
    case 'task':
    case 'event':
    case 'experience':
    case 'idea':
    case 'memory':
    case 'workout':
    case 'workout_log':
    case 'program':
      return COACH_SLUG;
    case 'class':
      return null;
    default:
      return null;
  }
}
