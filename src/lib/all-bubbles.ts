import type { BubbleRow } from '@/types/database';

/** Synthetic aggregate: all Bubbles in the current BuddyBubble (not a real DB row). */
export const ALL_BUBBLES_BUBBLE_ID = 'all';

export const ALL_BUBBLES_LABEL = 'All Bubbles';

export function makeAllBubblesBubbleRow(workspaceId: string): BubbleRow {
  return {
    id: ALL_BUBBLES_BUBBLE_ID,
    workspace_id: workspaceId,
    name: ALL_BUBBLES_LABEL,
    icon: null,
    created_at: new Date(0).toISOString(),
  };
}

/** When posting from the aggregate "All Bubbles" view, target the first real bubble (legacy broadcast had no per-row bubble in UI). */
export function defaultBubbleIdForWrites(bubbles: BubbleRow[]): string | null {
  return bubbles[0]?.id ?? null;
}
