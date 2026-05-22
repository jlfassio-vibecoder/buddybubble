import type { ExecutionPatch } from '@/types/execution-patch';

/** Stable fingerprint for deduping Coach `execution_patch` applies (raw metadata or parsed patch). */
export function executionPatchFingerprint(raw: unknown): string | null {
  if (raw == null) return 'null';
  try {
    return JSON.stringify(raw);
  } catch {
    return null;
  }
}

/** Set by `WorkoutPlayer` while open; cleared on close. */
let activeApplier: ((patch: ExecutionPatch) => void) | null = null;

export function registerWorkoutPlayerExecutionPatchApplier(
  fn: ((patch: ExecutionPatch) => void) | null,
): void {
  activeApplier = fn;
}

/** Applies a Coach `execution_patch` to the open player grid when WorkoutPlayer is mounted. */
export function applyWorkoutPlayerExecutionPatchIfOpen(patch: ExecutionPatch): void {
  activeApplier?.(patch);
}
