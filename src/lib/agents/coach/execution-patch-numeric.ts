/**
 * Shared numeric coercion for Coach `execution_patch` fields (weight, reps, rpe).
 * Used by server-side Gemini parsing and client-side message metadata parsing.
 */

/** Extract the first valid numeric sequence (optional decimal) from a string. */
export function sanitizeNumericStringForPatch(raw: string): string | null {
  const match = raw.match(/[0-9]+(?:\.[0-9]+)?/);
  if (!match) return null;
  const n = Number(match[0]);
  if (!Number.isFinite(n)) return null;
  return match[0];
}

/**
 * Accept finite `number` or `string`; return a normalized numeric token or null.
 * Rejects objects, booleans, NaN, Infinity.
 */
export function coerceExecutionPatchNumericField(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return sanitizeNumericStringForPatch(String(value));
  }
  if (typeof value === 'string') {
    return sanitizeNumericStringForPatch(value);
  }
  return null;
}
