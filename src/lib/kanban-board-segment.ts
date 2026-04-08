export type KanbanBoardSegment = 'planning' | 'scheduled' | 'today' | 'past';

export const KANBAN_BOARD_SEGMENT_STORAGE_KEY_PREFIX = 'buddybubble.kanbanBoardSegment.';

export function parseKanbanBoardSegment(raw: string | null): KanbanBoardSegment {
  if (raw === 'planning' || raw === 'scheduled' || raw === 'today' || raw === 'past') {
    return raw;
  }
  return 'planning';
}

function doneColumnId(columnDefs: { id: string; label: string }[]): string | null {
  const doneCol = columnDefs.find(
    (c) => c.id === 'done' || c.id === 'completed' || /^done$|^complete(d)?$/i.test(c.label.trim()),
  );
  return doneCol?.id ?? null;
}

/**
 * Always `null` so every column stays visible (classic Kanban). Segment toggles remain for future UX
 * without hiding tasks in other lanes.
 */
export function segmentNarrowColumnIds(
  _segment: KanbanBoardSegment,
  _columnDefs: { id: string; label: string }[],
): string[] | null {
  return null;
}

/** When Past is selected and there is no done/completed column, filter tasks to overdue by scheduled date. */
export function segmentPastUsesOverdueFallback(
  segment: KanbanBoardSegment,
  columnDefs: { id: string; label: string }[],
): boolean {
  if (segment !== 'past') return false;
  return doneColumnId(columnDefs) === null;
}
