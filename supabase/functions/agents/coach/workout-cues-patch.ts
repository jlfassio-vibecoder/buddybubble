/**
 * MIRROR FILE — canonical lives at `src/lib/agents/coach/workout-cues-patch.ts`.
 * Run `pnpm check:agent-mirror` to verify parity.
 */

import { WORKOUT_CUE_FIELD_MAX_CHARS } from './config.ts';
import type { CueFieldKey } from './exercise-cue-request.ts';
import { flatExerciseResolutionKey } from './workout-cue-metadata-merge.ts';

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
  if (s.length <= WORKOUT_CUE_FIELD_MAX_CHARS) return s;
  return s.slice(0, WORKOUT_CUE_FIELD_MAX_CHARS - 3) + '...';
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

/** Unanchored personal cue row eligible for workout-scoped reroute (M3). */
export type PersonalCueUnanchoredRow = {
  exerciseIndex: number;
} & Partial<Record<CueFieldKey, string>>;

export function resolutionKeyFromWorkoutContextExerciseIndex(
  workoutContextJson: string | null,
  exerciseIndex: number,
): string | null {
  const trimmed = workoutContextJson?.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    let ex: unknown[] = [];
    if (Array.isArray(parsed)) {
      ex = parsed;
    } else if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const raw = (parsed as Record<string, unknown>).exercises;
      ex = Array.isArray(raw) ? raw : [];
    }
    const el = ex[exerciseIndex];
    if (!el || typeof el !== 'object' || Array.isArray(el)) return null;
    const o = el as Record<string, unknown>;
    const name = typeof o.name === 'string' ? o.name.trim() : '';
    const id = typeof o.id === 'string' ? o.id.trim() : undefined;
    return flatExerciseResolutionKey({ name: name || 'Exercise', id }, exerciseIndex);
  } catch {
    return null;
  }
}

function personalCueDropToWorkoutPatch(
  drop: PersonalCueUnanchoredRow,
  resolutionKey: string,
): WorkoutCuesPatchV1 | null {
  const patch: WorkoutCuesPatchV1 = { v: 1, resolution_key: resolutionKey };
  let hasField = false;
  for (const key of PATCH_FIELD_KEYS) {
    const val = drop[key];
    if (typeof val === 'string' && val.trim()) {
      patch[key] = capField(val.trim());
      hasField = true;
    }
  }
  return hasField ? patch : null;
}

/**
 * When the model emits `personal_cues_patch` for a custom/unanchored exercise, reroute
 * to `workout_cues_patch` so cues merge into this workout card instead of dropping.
 */
export function coalesceWorkoutCuesPatchFromPersonalFallback(args: {
  workoutCuesPatch: WorkoutCuesPatchV1 | null;
  unanchoredDrops: PersonalCueUnanchoredRow[];
  workoutContextJson: string | null;
  exerciseCueRequestResolutionKey: string | null;
  exerciseCueRequestExerciseIndex: number | undefined;
}): WorkoutCuesPatchV1 | null {
  if (args.workoutCuesPatch) return args.workoutCuesPatch;
  if (args.unanchoredDrops.length === 0) return null;

  const targetIndex = args.exerciseCueRequestExerciseIndex;
  const drop =
    targetIndex !== undefined
      ? (args.unanchoredDrops.find((d) => d.exerciseIndex === targetIndex) ??
        args.unanchoredDrops[0])
      : args.unanchoredDrops.length === 1
        ? args.unanchoredDrops[0]
        : null;
  if (!drop) return null;

  const resolutionKey =
    args.exerciseCueRequestResolutionKey ??
    resolutionKeyFromWorkoutContextExerciseIndex(args.workoutContextJson, drop.exerciseIndex);
  if (!resolutionKey) return null;

  return personalCueDropToWorkoutPatch(drop, resolutionKey);
}

/** Versioned payload for `p_workout_cues_patch` on agent RPCs (or null when empty). */
export function workoutCuesPatchForRpc(patch: WorkoutCuesPatchV1 | null): unknown | null {
  if (patch == null) return null;
  return patch;
}
