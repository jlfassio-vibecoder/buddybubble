/**
 * Best-effort parsing of Vertex storefront `detail` strings (and legacy rows that stored the
 * same prose in `coach_notes`) into `WorkoutExercise` sets / reps / RPE / rest.
 */

import type { WorkoutExercise } from '@/lib/item-metadata';
import { normalizeRepsForStorage } from '@/lib/workout-factory/parse-reps-scalar';

export type ParsedStorefrontExerciseDetail = {
  sets?: number;
  reps?: number | string;
  rpe?: number;
  rest_seconds?: number;
  /** Text after the parsed prescription (coaching cues). */
  remainder: string;
};

function normDash(s: string): string {
  return s.replace(/[–—]/g, '-');
}

/**
 * Parses a single-line storefront exercise `detail` (or equivalent `coach_notes`).
 * Conservative: only fills fields when patterns match at the start / obvious RPE / rest cues.
 */
export function parseStorefrontExerciseDetail(detail: string): ParsedStorefrontExerciseDetail {
  const raw = detail.trim();
  const out: ParsedStorefrontExerciseDetail = { remainder: '' };
  if (!raw) return out;

  const d = raw;
  let consumed = 0;

  const patX =
    /^(\d{1,2})\s*[x×]\s*(\d{1,3}(?:\s*[-–—]\s*\d{1,3})?)(?=\s|$|[@;,·]|\s*RPE\b|\s*reps?\b)/i;
  const patSetsOf =
    /^(\d{1,2})\s*sets?\s*(?:of|×|x)\s*(\d{1,3}(?:\s*[-–—]\s*\d{1,3})?)(?=\s|$|[@;,·]|\s*RPE\b|\s*reps?\b)/i;

  let m = d.match(patX);
  if (!m) m = d.match(patSetsOf);
  if (m && m.index === 0) {
    const sets = parseInt(m[1], 10);
    const repsRaw = normDash(m[2]).replace(/\s+/g, '');
    if (sets >= 1 && sets <= 99) out.sets = sets;
    const repsNorm = normalizeRepsForStorage(repsRaw);
    if (repsNorm !== undefined) out.reps = repsNorm;
    consumed = m[0].length;
  } else {
    const patRepsFirst = /^(\d{1,3}(?:\s*[-–—]\s*\d{1,3})?)\s*reps?\b/i;
    const m2 = d.match(patRepsFirst);
    if (m2 && m2.index === 0) {
      const repsNorm = normalizeRepsForStorage(normDash(m2[1]).replace(/\s+/g, ''));
      if (repsNorm !== undefined) out.reps = repsNorm;
      consumed = m2[0].length;
    }
  }

  const rpeM = d.match(/\bRPE\s*[:.]?\s*(\d{1,2})(?:\.\d+)?\b/i);
  if (rpeM) {
    const v = parseInt(rpeM[1], 10);
    if (v >= 1 && v <= 10) out.rpe = v;
  }

  const restRange = d.match(/(\d{1,3})\s*[-–—]\s*(\d{1,3})\s*s(?:ec(?:ond)?s?)?\b/i);
  const restSingle = !restRange && d.match(/\b(\d{2,3})\s*s(?:ec(?:ond)?s?)?\b/i);
  if (restRange) {
    const a = parseInt(restRange[1], 10);
    const b = parseInt(restRange[2], 10);
    if (a > 0 && b > 0 && a <= 600 && b <= 600) {
      out.rest_seconds = Math.round((a + b) / 2);
    }
  } else if (restSingle) {
    const sec = parseInt(restSingle[1], 10);
    if (sec >= 10 && sec <= 600) out.rest_seconds = sec;
  }

  const tail = d
    .slice(consumed)
    .replace(/^[\s,;·\-–—]+/, '')
    .trim();
  out.remainder = tail;
  return out;
}

/** Maps validated storefront preview exercise → persisted `WorkoutExercise`. */
function stripRedundantRpeTail(tail: string, hasRpe: boolean): string {
  let t = tail.trim();
  if (!hasRpe || !t) return t;
  t = t.replace(/^@?\s*RPE\s*[:.]?\s*\d{1,2}(?:\.\d+)?\b\s*/i, '').trim();
  return t;
}

export function storefrontPreviewExerciseToWorkoutExercise(
  name: string,
  detail: string,
): WorkoutExercise {
  const n = name.trim() || 'Exercise';
  const parsed = parseStorefrontExerciseDetail(detail);
  const ex: WorkoutExercise = { name: n };
  if (parsed.sets !== undefined) ex.sets = parsed.sets;
  if (parsed.reps !== undefined) ex.reps = parsed.reps;
  if (parsed.rpe !== undefined) ex.rpe = parsed.rpe;
  if (parsed.rest_seconds !== undefined) ex.rest_seconds = parsed.rest_seconds;

  const tail = stripRedundantRpeTail(parsed.remainder, parsed.rpe !== undefined);
  if (tail.length >= 3) {
    ex.coach_notes = tail;
  } else if (!parsed.sets && !parsed.reps && !parsed.rpe && !parsed.rest_seconds) {
    const d = detail.trim();
    if (d) ex.coach_notes = d;
  }
  return ex;
}

/**
 * Legacy / storefront rows: `coach_notes` held the full `detail` string while `sets`/`reps`
 * were empty. Merge parsed prescription into the exercise for display and save.
 */
function looksLikeStorefrontPrescriptionLine(s: string): boolean {
  const t = s.trim();
  if (t.length > 280) return false;
  if (/^\d{1,2}\s*[x×]\s*\d/i.test(t)) return true;
  if (/^\d{1,2}\s*sets?\s*(?:of|×|x)\s*\d/i.test(t)) return true;
  if (/^\d{1,3}(?:\s*[-–—]\s*\d{1,3})?\s*reps?\b/i.test(t)) return true;
  return false;
}

export function hydrateWorkoutExerciseFromStorefrontCoachNotes(
  ex: WorkoutExercise,
): WorkoutExercise {
  if (ex.sets != null || ex.reps != null) return ex;
  const hint =
    typeof ex.coach_notes === 'string'
      ? ex.coach_notes.trim()
      : typeof ex.notes === 'string'
        ? ex.notes.trim()
        : '';
  if (!hint || !looksLikeStorefrontPrescriptionLine(hint)) return ex;

  const parsed = parseStorefrontExerciseDetail(hint);
  if (
    parsed.sets == null &&
    parsed.reps == null &&
    parsed.rpe == null &&
    parsed.rest_seconds == null
  ) {
    return ex;
  }

  const next: WorkoutExercise = { ...ex };
  if (parsed.sets !== undefined) next.sets = parsed.sets;
  if (parsed.reps !== undefined) next.reps = parsed.reps;
  if (parsed.rpe !== undefined) next.rpe = parsed.rpe;
  if (parsed.rest_seconds !== undefined) next.rest_seconds = parsed.rest_seconds;

  const tail = stripRedundantRpeTail(parsed.remainder, parsed.rpe !== undefined);
  if (tail.length >= 3) {
    next.coach_notes = tail;
  } else {
    delete next.coach_notes;
  }
  return next;
}

export function hydrateWorkoutExercisesFromStorefrontCoachNotes(
  exercises: WorkoutExercise[],
): WorkoutExercise[] {
  return exercises.map(hydrateWorkoutExerciseFromStorefrontCoachNotes);
}
