/**
 * Client-side helpers for `#` exercise tags in chat composers (rails, ChatArea).
 * Server contract: `metadata.exercise_mentions` → Coach `TAGGED_EXERCISE_REFS`.
 */

import type { RichMessageComposerExercise } from '@/components/chat/RichMessageComposer';
import type { ExerciseDictionaryAutocompleteRow } from '@/lib/exercise-dictionary-autocomplete-cache';
import type { ExerciseMentionClientPayload } from '@/lib/agents/coach/exercise-mentions';

export function normMentionName(s: string): string {
  return s.trim().toLowerCase();
}

/** Keep only mentions still in the outgoing text; refresh `workout_exercise_index` from current workout order. */
export function finalizeExerciseMentionsForSend(
  pending: ExerciseMentionClientPayload[],
  messageText: string,
  workoutNames: string[],
): ExerciseMentionClientPayload[] | null {
  const names = workoutNames.map((n) => n.trim());
  const filtered = pending.filter((m) => messageText.includes(m.token));
  if (filtered.length === 0) return null;
  return filtered.map((m) => {
    const idx = names.findIndex((n) => normMentionName(n) === normMentionName(m.name));
    const row: ExerciseMentionClientPayload = {
      token: m.token,
      name: m.name,
      source: m.source,
    };
    if (m.dictionary_id) row.dictionary_id = m.dictionary_id;
    if (m.dictionary_slug) row.dictionary_slug = m.dictionary_slug;
    if (idx >= 0) row.workout_exercise_index = idx;
    return row;
  });
}

/** Canvas exercise names first, then dictionary rows (dedupe by lowercase name). */
export function buildHashExerciseList(
  workoutExerciseNames: string[],
  dictionaryRows: ExerciseDictionaryAutocompleteRow[],
): RichMessageComposerExercise[] {
  const seen = new Set<string>();
  const out: RichMessageComposerExercise[] = [];
  for (const raw of workoutExerciseNames) {
    const t = raw.trim();
    const k = normMentionName(t);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push({ id: `workout:${k}`, name: t });
  }
  for (const ex of dictionaryRows) {
    const k = normMentionName(ex.name);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push({ id: ex.id, name: ex.name.trim(), slug: ex.slug });
  }
  return out;
}

/** Build a pending mention row when the user picks from the `#` popover. */
export function exerciseMentionFromHashPick(
  ex: RichMessageComposerExercise,
  workoutExerciseNames: string[],
): ExerciseMentionClientPayload {
  const names = workoutExerciseNames.map((n) => n.trim());
  const isWorkout = ex.id.startsWith('workout:');
  const name = ex.name.trim();
  const token = `#${name} `;
  const idx = names.findIndex((n) => normMentionName(n) === normMentionName(name));
  const row: ExerciseMentionClientPayload = {
    token,
    name,
    source: isWorkout ? 'workout' : 'dictionary',
  };
  if (idx >= 0) row.workout_exercise_index = idx;
  if (!isWorkout) {
    if (ex.id) row.dictionary_id = ex.id;
    if (ex.slug) row.dictionary_slug = ex.slug;
  }
  return row;
}
