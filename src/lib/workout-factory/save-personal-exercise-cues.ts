import { PERSONAL_CUES_FIELD_MAX_CHARS } from '@/lib/agents/coach/config';
import type { PersonalCueResolvedForRpc } from '@/lib/agents/coach/parse';
import type { WorkoutCuePatch } from '@/lib/workout-factory/apply-cue-patches-to-metadata';

export type PersonalCueSaveMode = 'replace' | 'append';

export type PersonalCueSavePayload = {
  exerciseName: string;
  dictionaryId?: string | null;
  patch: WorkoutCuePatch;
  mode?: PersonalCueSaveMode;
};

export type PersonalCueSaveResult =
  | { ok: true; dictionaryId: string }
  | { ok: false; error: string };

const PATCH_FIELDS = [
  'instructions',
  'form_cues',
  'tips',
  'injury_prevention_tips',
] as const satisfies readonly (keyof WorkoutCuePatch)[];

function capField(s: string): string {
  if (s.length <= PERSONAL_CUES_FIELD_MAX_CHARS) return s;
  return s.slice(0, PERSONAL_CUES_FIELD_MAX_CHARS - 3) + '...';
}

function trimPatchField(value: string | undefined): string | undefined {
  if (value == null) return undefined;
  const t = value.trim();
  if (!t) return undefined;
  return capField(t);
}

/** Maps a micro-edit draft to a single `apply_personal_cues_for_user` array element. */
export function workoutCuePatchToPersonalRpcRow(
  patch: WorkoutCuePatch,
  dictionaryId: string,
  mode: PersonalCueSaveMode = 'replace',
): PersonalCueResolvedForRpc | null {
  const row: PersonalCueResolvedForRpc = {
    exercise_dictionary_id: dictionaryId,
    mode,
  };
  let hasField = false;
  for (const key of PATCH_FIELDS) {
    const val = trimPatchField(patch[key]);
    if (val) {
      row[key] = val;
      hasField = true;
    }
  }
  return hasField ? row : null;
}

export function personalCuePatchHasContent(patch: WorkoutCuePatch): boolean {
  return workoutCuePatchToPersonalRpcRow(patch, '00000000-0000-4000-8000-000000000001') != null;
}

/** Client POST to `/api/exercise-cues/save-personal`. */
export async function savePersonalExerciseCues(
  payload: PersonalCueSavePayload,
): Promise<PersonalCueSaveResult> {
  const exerciseName = payload.exerciseName?.trim();
  if (!exerciseName) {
    return { ok: false, error: 'Exercise name is required.' };
  }
  if (!personalCuePatchHasContent(payload.patch)) {
    return { ok: false, error: 'At least one cue field must be non-empty.' };
  }

  const res = await fetch('/api/exercise-cues/save-personal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      exercise_name: exerciseName,
      dictionary_id: payload.dictionaryId ?? null,
      patch: payload.patch,
      mode: payload.mode ?? 'replace',
    }),
  });

  let body: { error?: string; dictionary_id?: string } = {};
  try {
    body = (await res.json()) as typeof body;
  } catch {
    body = {};
  }

  if (!res.ok) {
    return {
      ok: false,
      error: typeof body.error === 'string' ? body.error : 'Could not save to your notes.',
    };
  }

  const dictionaryId = typeof body.dictionary_id === 'string' ? body.dictionary_id.trim() : '';
  if (!dictionaryId) {
    return { ok: false, error: 'Save succeeded but dictionary id was missing.' };
  }

  return { ok: true, dictionaryId };
}
