export type KanbanCardDensity = 'summary' | 'full' | 'detailed';

export const KANBAN_CARD_DENSITY_STORAGE_KEY = 'buddybubble.kanbanCardDensity';

export function parseKanbanCardDensity(raw: string | null): KanbanCardDensity {
  if (raw === 'summary' || raw === 'full' || raw === 'detailed') return raw;
  return 'full';
}
