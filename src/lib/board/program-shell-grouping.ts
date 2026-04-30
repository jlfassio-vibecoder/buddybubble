import type { TaskRow } from '@/types/database';

function readMetaRecord(metadata: TaskRow['metadata']): Record<string, unknown> {
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    return metadata as Record<string, unknown>;
  }
  return {};
}

/** Program shell task from `activateProgram` (metadata.is_shell). */
export function isProgramShellTask(task: TaskRow): boolean {
  return readMetaRecord(task.metadata).is_shell === true;
}

/**
 * Parent shell task id for grouping: prefer native `program_id`, then `metadata.parent_shell_id`
 * (matches `activateProgram` which sets both).
 */
export function getProgramShellParentId(task: TaskRow): string | null {
  if (task.program_id && String(task.program_id).trim()) {
    return String(task.program_id).trim();
  }
  const p = readMetaRecord(task.metadata).parent_shell_id;
  if (typeof p === 'string' && p.trim()) return p.trim();
  return null;
}

/**
 * True when this task belongs under a program shell that appears in the supplied task scope.
 * Uses shell id set derived from `isProgramShellTask` so legacy `program_id` links to non-shell
 * parents are not grouped.
 */
export function isProgramShellChildTask(task: TaskRow, shellIds: Set<string>): boolean {
  if (isProgramShellTask(task)) return false;
  const pid = getProgramShellParentId(task);
  return Boolean(pid && shellIds.has(pid));
}

export function shellIdsInTaskList(tasks: TaskRow[]): Set<string> {
  return new Set(tasks.filter(isProgramShellTask).map((t) => t.id));
}

export function buildChildTasksByShellId(
  tasks: TaskRow[],
  shellIds: Set<string>,
): Map<string, TaskRow[]> {
  const map = new Map<string, TaskRow[]>();
  for (const t of tasks) {
    if (isProgramShellTask(t)) continue;
    const pid = getProgramShellParentId(t);
    if (!pid || !shellIds.has(pid)) continue;
    const list = map.get(pid) ?? [];
    list.push(t);
    map.set(pid, list);
  }
  for (const [, list] of map) {
    list.sort((a, b) => (Number(a.position) || 0) - (Number(b.position) || 0));
  }
  return map;
}

/** Tasks to render as top-level rows (hides children grouped under a shell in this scope). */
export function topLevelTasksForShellGrouping(tasks: TaskRow[], shellIds: Set<string>): TaskRow[] {
  return tasks.filter((t) => !isProgramShellChildTask(t, shellIds));
}
