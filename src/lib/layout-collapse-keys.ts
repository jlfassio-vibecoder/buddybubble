export function workspaceRailCollapsedStorageKey(workspaceId: string) {
  return `buddybubble.workspaceRailCollapsed.${workspaceId}`;
}

export function bubbleSidebarCollapsedStorageKey(workspaceId: string) {
  return `buddybubble.bubbleSidebarCollapsed.${workspaceId}`;
}

export function chatCollapsedStorageKey(workspaceId: string) {
  return `buddybubble.chatCollapsed.${workspaceId}`;
}

export function kanbanCollapsedStorageKey(workspaceId: string) {
  return `buddybubble.kanbanCollapsed.${workspaceId}`;
}

/** Board columns collapsed to a left strip; calendar keeps the rest. */
export function kanbanBoardStripStorageKey(workspaceId: string) {
  return `buddybubble.kanbanBoardStrip.${workspaceId}`;
}

export function calendarCollapsedStorageKey(workspaceId: string) {
  return `buddybubble.calendarCollapsed.${workspaceId}`;
}

/** Per-workspace Kanban column strips (`buddybubble.kanbanCollapsedColumns:${workspaceId}` JSON array of column ids). */
export function kanbanBoardCollapsedColumnsStorageKey(workspaceId: string) {
  return `buddybubble.kanbanCollapsedColumns:${workspaceId}`;
}

/** Kanban board filter toolbar (date / sort / priority / density) vertically collapsed — `1` / `0`. */
export function kanbanBoardFiltersToolbarCollapsedStorageKey(workspaceId: string) {
  return `buddybubble.kanbanBoardFiltersToolbarCollapsed.${workspaceId}`;
}

/** Per-bubble Programs board column strips. */
export function programsBoardCollapsedColumnsStorageKey(workspaceId: string, bubbleId: string) {
  return `buddybubble.programsBoardCollapsedColumns:${workspaceId}:${bubbleId}`;
}

/** Per-bubble dismissed static template ids (JSON array) — hides cards in the Templates column only. */
export function programsBoardDismissedTemplateIdsStorageKey(workspaceId: string, bubbleId: string) {
  return `buddybubble.programsBoardDismissedTemplates:${workspaceId}:${bubbleId}`;
}
