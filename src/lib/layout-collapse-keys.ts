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
