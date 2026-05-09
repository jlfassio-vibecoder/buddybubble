/**
 * MIRROR FILE — canonical lives at `src/lib/agents/coach/exercise-mentions.ts`.
 * Run `pnpm check:agent-mirror` to verify parity.
 */

export type ExerciseMentionClientPayload = {
  /** Literal substring inserted into the composer, e.g. `#Kettlebell Goblet Squat ` */
  token: string;
  /** Canonical display name from the picker */
  name: string;
  source: 'workout' | 'dictionary';
  dictionary_id?: string;
  dictionary_slug?: string;
  /** Client hint: 0-based index in active workout when picked from workout row */
  workout_exercise_index?: number;
};

export const TAGGED_EXERCISE_REFS_HEADER = '--- TAGGED_EXERCISE_REFS ---';

/** Parse `exercises[].name` order from stringified workout context JSON. */
export function parseExerciseNamesFromWorkoutContextJson(
  workoutContextJson: string,
): string[] | null {
  const trimmed = workoutContextJson.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    let ex: unknown[];
    if (Array.isArray(parsed)) {
      ex = parsed;
    } else if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const raw = (parsed as Record<string, unknown>).exercises;
      if (!Array.isArray(raw)) return null;
      ex = raw;
    } else {
      return null;
    }
    const names: string[] = [];
    for (const el of ex) {
      if (el && typeof el === 'object' && !Array.isArray(el)) {
        const n = (el as Record<string, unknown>).name;
        names.push(typeof n === 'string' ? n : '');
      } else {
        names.push('');
      }
    }
    return names;
  } catch {
    return null;
  }
}

function normName(s: string): string {
  return s.trim().toLowerCase();
}

function indicesMatchingName(names: string[], name: string): number[] {
  const t = normName(name);
  const out: number[] = [];
  for (let i = 0; i < names.length; i++) {
    if (normName(names[i] ?? '') === t) out.push(i);
  }
  return out;
}

/**
 * Validate `metadata.exercise_mentions` from the trigger message.
 */
export function parseExerciseMentionsFromMetadata(
  meta: unknown,
): ExerciseMentionClientPayload[] | null {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return null;
  const raw = (meta as Record<string, unknown>).exercise_mentions;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: ExerciseMentionClientPayload[] = [];
  for (const el of raw) {
    if (!el || typeof el !== 'object' || Array.isArray(el)) continue;
    const o = el as Record<string, unknown>;
    if (typeof o.token !== 'string' || !o.token.trim()) continue;
    if (typeof o.name !== 'string' || !o.name.trim()) continue;
    const src = o.source === 'dictionary' || o.source === 'workout' ? o.source : 'dictionary';
    const row: ExerciseMentionClientPayload = {
      token: o.token,
      name: o.name.trim(),
      source: src,
    };
    if (typeof o.dictionary_id === 'string' && o.dictionary_id.trim())
      row.dictionary_id = o.dictionary_id.trim();
    if (typeof o.dictionary_slug === 'string' && o.dictionary_slug.trim())
      row.dictionary_slug = o.dictionary_slug.trim();
    if (
      typeof o.workout_exercise_index === 'number' &&
      Number.isInteger(o.workout_exercise_index) &&
      o.workout_exercise_index >= 0
    ) {
      row.workout_exercise_index = o.workout_exercise_index;
    }
    out.push(row);
  }
  return out.length > 0 ? out : null;
}

/**
 * One prompt line per mention: quoted token -> index or NOT_IN_ACTIVE_WORKOUT.
 */
export function resolveExerciseMentionLines(
  mentions: ExerciseMentionClientPayload[] | null | undefined,
  workoutContextJson: string | null,
): string[] {
  if (!mentions?.length) return [];
  const names = workoutContextJson
    ? parseExerciseNamesFromWorkoutContextJson(workoutContextJson)
    : null;
  const lines: string[] = [];

  for (const m of mentions) {
    const quoted = JSON.stringify(m.token);
    if (!names || names.length === 0) {
      lines.push(`${quoted} -> NOT_IN_ACTIVE_WORKOUT`);
      continue;
    }

    const hinted = m.workout_exercise_index;
    if (
      typeof hinted === 'number' &&
      hinted >= 0 &&
      hinted < names.length &&
      normName(names[hinted] ?? '') === normName(m.name)
    ) {
      lines.push(`${quoted} -> exerciseIndex=${hinted}`);
      continue;
    }

    const matches = indicesMatchingName(names, m.name);
    if (matches.length === 1) {
      lines.push(`${quoted} -> exerciseIndex=${matches[0]}`);
    } else if (matches.length > 1) {
      // Ambiguous duplicate exercise names — first occurrence wins (same as naive name match).
      lines.push(`${quoted} -> exerciseIndex=${matches[0]} (ambiguous_name_first_match)`);
    } else {
      lines.push(`${quoted} -> NOT_IN_ACTIVE_WORKOUT`);
    }
  }

  return lines;
}

export function formatTaggedExerciseRefsPromptBlock(resolvedLines: string[]): string | null {
  if (resolvedLines.length === 0) return null;
  return (
    `\n\n${TAGGED_EXERCISE_REFS_HEADER}\n` +
    resolvedLines.join('\n') +
    '\n\nWhen the user references a tagged exercise token above, execution_patch.exerciseIndex MUST equal the resolved exerciseIndex. For NOT_IN_ACTIVE_WORKOUT, do not emit execution_patch for that exercise; explain in reply_content instead. Never infer exerciseIndex only from the literal # text in the user message when this block lists a resolved index.'
  );
}
