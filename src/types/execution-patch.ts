/**
 * Coach-authored structured updates for live `WorkoutPlayer` `logs` (set grid).
 * Carried on `messages.metadata.execution_patch` (JSON) — applied client-side only.
 */

import { coerceExecutionPatchNumericField } from '@/lib/agents/coach/execution-patch-numeric';

export type ExecutionPatchItem = {
  exerciseIndex: number;
  setIndex: number;
  weight?: string;
  reps?: string;
  rpe?: string;
  done?: boolean;
};

export type ExecutionPatch = ExecutionPatchItem[];

function isIntegerNonNegative(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 0;
}

/**
 * Validates `metadata.execution_patch` from a message row. Returns `null` if invalid or empty.
 */
export function parseExecutionPatchFromMetadata(raw: unknown): ExecutionPatch | null {
  if (raw == null) return null;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: ExecutionPatch = [];
  for (const el of raw) {
    if (el == null || typeof el !== 'object' || Array.isArray(el)) return null;
    const o = el as Record<string, unknown>;
    if (!isIntegerNonNegative(o.exerciseIndex) || !isIntegerNonNegative(o.setIndex)) return null;
    const item: ExecutionPatchItem = {
      exerciseIndex: o.exerciseIndex,
      setIndex: o.setIndex,
    };
    if (o.weight !== undefined) {
      const s = coerceExecutionPatchNumericField(o.weight);
      if (s !== null) item.weight = s;
    }
    if (o.reps !== undefined) {
      const s = coerceExecutionPatchNumericField(o.reps);
      if (s !== null) item.reps = s;
    }
    if (o.rpe !== undefined) {
      const s = coerceExecutionPatchNumericField(o.rpe);
      if (s !== null) item.rpe = s;
    }
    if (o.done !== undefined && typeof o.done === 'boolean') {
      item.done = o.done;
    }
    out.push(item);
  }
  return out;
}
