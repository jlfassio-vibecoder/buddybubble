/** Per-class-instance reminder suppression for global live class modals. */

export function reminded15mStorageKey(workspaceId: string, instanceId: string) {
  return `buddybubble.classReminder.reminded15m.${workspaceId}.${instanceId}`;
}

export function reminded5mStorageKey(workspaceId: string, instanceId: string) {
  return `buddybubble.classReminder.reminded5m.${workspaceId}.${instanceId}`;
}

export function ignoreClassReminderStorageKey(workspaceId: string, instanceId: string) {
  return `buddybubble.classReminder.ignoreClass.${workspaceId}.${instanceId}`;
}
