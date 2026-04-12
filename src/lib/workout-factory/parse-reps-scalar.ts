/**
 * Parse AI / user rep strings into a single numeric reps field when unambiguous.
 * Avoids collapsing ranges like "8-10" into 810 via naive digit stripping.
 */

export function parseRepsStringToScalar(reps: string): number | undefined {
  const normalized = String(reps).trim().toLowerCase();
  if (normalized === '') return undefined;

  if (
    normalized === 'amrap' ||
    normalized.includes('amrap') ||
    normalized.includes('max reps') ||
    normalized.includes('to failure')
  ) {
    return undefined;
  }

  if (
    /^\d+(?:\.\d+)?\s*[-–—]\s*\d+(?:\.\d+)?$/.test(normalized) ||
    /^\d+(?:\.\d+)?\s+to\s+\d+(?:\.\d+)?$/.test(normalized)
  ) {
    return undefined;
  }

  if (/^\d+(?:\.\d+)?\+$/.test(normalized)) {
    return undefined;
  }

  const match = normalized.match(/^(\d+(?:\.\d+)?)(?:\s*rep(?:s)?)?$/);
  if (!match) return undefined;
  const n = parseFloat(match[1]);
  return Number.isFinite(n) ? n : undefined;
}

/** Handles JSON numbers or strings from personalize-program output. */
export function parseRepsFieldToScalar(reps: unknown): number | undefined {
  if (reps == null || reps === '') return undefined;
  if (typeof reps === 'number' && Number.isFinite(reps)) return reps;
  return parseRepsStringToScalar(String(reps));
}
