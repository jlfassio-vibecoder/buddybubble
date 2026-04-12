/**
 * Parse AI / user rep strings into a single numeric reps field when unambiguous.
 * Avoids collapsing ranges like "8-10" into 810 via naive digit stripping.
 */

/**
 * Recover "8-10" / "10-12" when a hyphenated rep range was stored as a single integer
 * (e.g. digits-only merge: "8-10" → 810).
 */
export function tryDecodeConcatenatedRepNumber(n: number): string | undefined {
  if (!Number.isFinite(n) || n < 100) return undefined;
  const s = String(Math.floor(Math.abs(n)));
  if (s.length === 3) {
    const a = parseInt(s.slice(0, 1), 10);
    const b = parseInt(s.slice(1), 10);
    if (a >= 1 && a <= 20 && b >= 1 && b <= 50) return `${a}-${b}`;
  }
  if (s.length === 4) {
    const a = parseInt(s.slice(0, 2), 10);
    const b = parseInt(s.slice(2), 10);
    if (a >= 1 && a <= 50 && b >= 1 && b <= 50) return `${a}-${b}`;
  }
  return undefined;
}

/**
 * Normalize reps from AI/JSON/DB into a scalar number, a range/text string, or undefined.
 * Decodes legacy 810 → "8-10" so we never persist bogus integers for hyphenated ranges.
 */
export function normalizeRepsForStorage(value: unknown): number | string | undefined {
  if (value == null || value === '') return undefined;
  if (typeof value === 'string') {
    const t = value.trim();
    if (!t) return undefined;
    const n = parseRepsStringToScalar(t);
    if (n !== undefined) {
      const decoded = tryDecodeConcatenatedRepNumber(n);
      if (decoded !== undefined) return decoded;
      return n;
    }
    return t;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const decoded = tryDecodeConcatenatedRepNumber(value);
    if (decoded !== undefined) return decoded;
    return value;
  }
  return undefined;
}

/** Editor / form line → stored `reps` (number when unambiguous scalar, else string). */
export function parseRepsDraftToStorage(s: string): number | string | undefined {
  const t = s.trim();
  if (!t) return undefined;
  const n = parseRepsStringToScalar(t);
  if (n !== undefined) {
    const decoded = tryDecodeConcatenatedRepNumber(n);
    if (decoded !== undefined) return decoded;
    return n;
  }
  return t;
}

/** Summary / display: never show 810 when it represents a range (string or number). */
export function formatRepsDisplay(reps: number | string | undefined): string | undefined {
  if (reps === undefined || reps === '') return undefined;
  if (typeof reps === 'string') {
    const tn = parseRepsStringToScalar(reps);
    if (tn !== undefined) {
      const d = tryDecodeConcatenatedRepNumber(tn);
      if (d !== undefined) return d;
    }
    return reps;
  }
  const decoded = tryDecodeConcatenatedRepNumber(reps);
  if (decoded !== undefined) return decoded;
  return String(reps);
}

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

/** When only a single numeric rep count is needed (legacy callers). */
export function parseRepsFieldToScalar(reps: unknown): number | undefined {
  const n = normalizeRepsForStorage(reps);
  if (n === undefined) return undefined;
  if (typeof n === 'number') return n;
  return parseRepsStringToScalar(n);
}
