/**
 * Resolve workoutContext exercise names → exercise_dictionary ids for Coach personal_cues_patch.
 * Deno-only (service-role RPC). Canonical behavior is mirrored in tests via hand-built maps.
 */

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

import { log } from '../../_shared/obs/log.ts';
import { COACH_SLUG } from './config.ts';
import { parseExerciseNamesFromWorkoutContextJson } from './exercise-mentions.ts';
import type { ExerciseDictionaryIndexEntry } from './prompts.ts';

function normalizeExerciseDictionaryKey(name: string): string {
  return name.trim().toLowerCase();
}

type DictionaryLookupRow = { id: string; name: string; slug: string };

/**
 * One entry per 0-based workout exercise index; null when no catalog row matches the name.
 */
export async function loadExerciseDictionaryByIndex(
  supabase: SupabaseClient,
  workoutContextJson: string,
  requestId: string,
): Promise<Record<number, ExerciseDictionaryIndexEntry | null>> {
  const out: Record<number, ExerciseDictionaryIndexEntry | null> = {};
  const names = parseExerciseNamesFromWorkoutContextJson(workoutContextJson);
  if (!names || names.length === 0) return out;

  const nonempty = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  if (nonempty.length === 0) {
    for (let i = 0; i < names.length; i++) out[i] = null;
    return out;
  }

  const { data, error } = await supabase.rpc('exercise_dictionary_lookup_by_names', {
    p_names: nonempty,
  });

  if (error) {
    log('warn', 'coach exercise_dictionary_lookup_by_names failed', {
      request_id: requestId,
      slug: COACH_SLUG,
      error: error.message,
    });
    for (let i = 0; i < names.length; i++) out[i] = null;
    return out;
  }

  const rows = (data ?? []) as DictionaryLookupRow[];
  const normToRow = new Map<string, DictionaryLookupRow>();
  for (const row of rows) {
    const k = normalizeExerciseDictionaryKey(row.name);
    if (!normToRow.has(k)) normToRow.set(k, row);
  }

  for (let i = 0; i < names.length; i++) {
    const rawName = names[i]?.trim() ?? '';
    if (!rawName) {
      out[i] = null;
      continue;
    }
    const row = normToRow.get(normalizeExerciseDictionaryKey(rawName));
    out[i] = row
      ? { dictionary_id: row.id, slug: typeof row.slug === 'string' ? row.slug : null }
      : null;
  }

  return out;
}
