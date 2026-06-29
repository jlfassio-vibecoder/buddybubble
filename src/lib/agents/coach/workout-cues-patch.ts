/**
 * Coach `workout_cues_patch` — workout-scoped cue writes (M3). Distinct from `personal_cues_patch` (M4).
 * Mirror: `supabase/functions/agents/coach/workout-cues-patch.ts`. Run `pnpm check:agent-mirror`.
 */

import { PERSONAL_CUES_FIELD_MAX_CHARS } from './config';
import type { CueFieldKey } from './exercise-cue-request';

export type WorkoutCuesPatchV1 = {
  v: 1;
  resolution_key: string;
} & Partial<Record<CueFieldKey, string>>;

const PATCH_FIELD_KEYS: readonly CueFieldKey[] = [
  'instructions',
  'form_cues',
  'tips',
  'injury_prevention_tips',
];

function capField(s: string): string {
  if (s.length <= PERSONAL_CUES_FIELD_MAX_CHARS) return s;
  return s.slice(0, PERSONAL_CUES_FIELD_MAX_CHARS - 3) + '...';
}

function pickCueField(o: Record<string, unknown>, key: CueFieldKey): string | undefined {
  const v = o[key];
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  if (!t) return undefined;
  return capField(t);
}

export function parseWorkoutCuesPatchFromGemini(raw: unknown): WorkoutCuesPatchV1 | null {
  if (raw == null) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (o.v !== 1) return null;
  if (typeof o.resolution_key !== 'string' || !o.resolution_key.trim()) return null;
  const patch: WorkoutCuesPatchV1 = {
    v: 1,
    resolution_key: o.resolution_key.trim(),
  };
  let hasField = false;
  for (const key of PATCH_FIELD_KEYS) {
    const val = pickCueField(o, key);
    if (val) {
      patch[key] = val;
      hasField = true;
    }
  }
  return hasField ? patch : null;
}

/** Versioned payload for `p_workout_cues_patch` on agent RPCs (or null when empty). */
export function workoutCuesPatchForRpc(patch: WorkoutCuesPatchV1 | null): unknown | null {
  if (patch == null) return null;
  return patch;
}
