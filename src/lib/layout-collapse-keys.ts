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

/** Percent split between live-video dock (top) and WorkspaceMainSplit — JSON `{ dash-live-dock: n, dash-workspace: n }`. */
export function dockWorkspaceSplitStorageKey(workspaceId: string) {
  return `buddybubble.dockWorkspaceSplit.${workspaceId}`;
}

/** Desktop theater deck builder: Kanban board (left) vs live dock (right) — JSON `{ theater-board, theater-dock }`. */
export function theaterBoardDockSplitStorageKey(workspaceId: string) {
  return `buddybubble.theaterBoardDockSplit.${workspaceId}`;
}

/** Live huddle: exercise editor (left) vs video (right) — JSON `{ huddle-editor, huddle-video }`. */
export function huddleEditorVideoSplitStorageKey(workspaceId: string) {
  return `buddybubble.huddleEditorVideoSplit.${workspaceId}`;
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
