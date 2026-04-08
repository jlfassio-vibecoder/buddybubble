/**
 * Whether a task's `status` slug refers to a "completion" column for UI (e.g. faded card).
 * Matches default slug `done` / `completed`, or column label "Done" / "Complete" (case-insensitive).
 */
export function taskColumnIsCompletionStatus(
  status: string,
  columnDefs: { id: string; label: string }[] | null,
): boolean {
  if (!columnDefs || columnDefs.length === 0) {
    return status === 'done' || status === 'completed';
  }
  const col = columnDefs.find((c) => c.id === status);
  if (!col) return status === 'done' || status === 'completed';
  if (col.id === 'done' || col.id === 'completed') return true;
  const L = col.label.trim().toLowerCase();
  return L === 'done' || L === 'complete' || L === 'completed';
}
