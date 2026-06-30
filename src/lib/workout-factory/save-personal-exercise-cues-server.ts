import type { SupabaseClient } from '@supabase/supabase-js';
import {
  insertPendingExerciseDictionaryStub,
  normalizeExerciseDictionaryKey,
} from '@/lib/workout-factory/exercise-dictionary-bridge';
import type { WorkoutCuePatch } from '@/lib/workout-factory/apply-cue-patches-to-metadata';
import {
  personalCuePatchHasContent,
  workoutCuePatchToPersonalRpcRow,
  type PersonalCueSaveMode,
} from '@/lib/workout-factory/save-personal-exercise-cues';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type SavePersonalCuesRequestBody = {
  exercise_name: string;
  dictionary_id?: string | null;
  patch: WorkoutCuePatch;
  mode?: PersonalCueSaveMode;
};

export function isValidUuid(value: string): boolean {
  return UUID_RE.test(value);
}

async function lookupDictionaryIdByName(
  client: SupabaseClient,
  exerciseName: string,
): Promise<string | null> {
  const name = exerciseName.trim();
  if (!name) return null;
  const { data, error } = await client.rpc('exercise_dictionary_lookup_by_names', {
    p_names: [name],
  });
  if (error) throw error;
  const rows = (data ?? []) as { id: string; name: string }[];
  const target = normalizeExerciseDictionaryKey(name);
  for (const row of rows) {
    if (normalizeExerciseDictionaryKey(row.name) === target) {
      return row.id;
    }
  }
  return null;
}

/**
 * Resolve catalog anchor: client hint → name lookup → pending stub insert.
 */
export async function resolveDictionaryIdForPersonalSave(
  serviceClient: SupabaseClient,
  args: { exerciseName: string; dictionaryIdHint?: string | null; userId: string },
): Promise<string> {
  const exerciseName = args.exerciseName.trim();
  if (!exerciseName) {
    throw new Error('exercise_name_required');
  }

  if (args.dictionaryIdHint?.trim()) {
    const hint = args.dictionaryIdHint.trim();
    if (!isValidUuid(hint)) {
      throw new Error('invalid_dictionary_id');
    }
    const { data, error } = await serviceClient
      .from('exercise_dictionary')
      .select('id')
      .eq('id', hint)
      .maybeSingle();
    if (error) throw error;
    if (data?.id) return data.id;
    throw new Error('dictionary_id_not_found');
  }

  const fromLookup = await lookupDictionaryIdByName(serviceClient, exerciseName);
  if (fromLookup) return fromLookup;

  return insertPendingExerciseDictionaryStub(serviceClient, exerciseName, args.userId);
}

export async function applyPersonalCuesViaServiceRole(
  serviceClient: SupabaseClient,
  args: {
    userId: string;
    dictionaryId: string;
    patch: WorkoutCuePatch;
    mode?: PersonalCueSaveMode;
  },
): Promise<number> {
  const row = workoutCuePatchToPersonalRpcRow(
    args.patch,
    args.dictionaryId,
    args.mode ?? 'replace',
  );
  if (!row) {
    throw new Error('empty_patch');
  }

  const { data, error } = await serviceClient.rpc('apply_personal_cues_for_user', {
    p_user_id: args.userId,
    p_agent_auth_user_id: null as unknown as string,
    p_cues: [row],
  });

  if (error) throw error;
  return typeof data === 'number' ? data : 0;
}

export function parseSavePersonalCuesBody(raw: unknown): SavePersonalCuesRequestBody | null {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const exercise_name = typeof o.exercise_name === 'string' ? o.exercise_name.trim() : '';
  if (!exercise_name) return null;
  const patch = o.patch;
  if (patch == null || typeof patch !== 'object' || Array.isArray(patch)) return null;
  if (!personalCuePatchHasContent(patch as WorkoutCuePatch)) return null;
  const modeRaw = o.mode;
  const mode: PersonalCueSaveMode | undefined =
    modeRaw === 'append' || modeRaw === 'replace' ? modeRaw : undefined;
  const dictionary_id =
    o.dictionary_id === null || o.dictionary_id === undefined
      ? null
      : typeof o.dictionary_id === 'string'
        ? o.dictionary_id.trim() || null
        : null;
  return {
    exercise_name,
    dictionary_id,
    patch: patch as WorkoutCuePatch,
    mode,
  };
}
