/**
 * Coach-authored structured updates for live `WorkoutPlayer` `logs` (set grid).
 * Carried on `messages.metadata.execution_patch` (JSON) — applied client-side only.
 */
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
      if (typeof o.weight !== 'string') return null;
      item.weight = o.weight;
    }
    if (o.reps !== undefined) {
      if (typeof o.reps !== 'string') return null;
      item.reps = o.reps;
    }
    if (o.rpe !== undefined) {
      if (typeof o.rpe !== 'string') return null;
      item.rpe = o.rpe;
    }
    if (o.done !== undefined) {
      if (typeof o.done !== 'boolean') return null;
      item.done = o.done;
    }
    out.push(item);
  }
  return out;
}
