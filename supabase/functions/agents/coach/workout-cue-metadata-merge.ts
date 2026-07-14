/**
 * MIRROR FILE — canonical lives at `src/lib/agents/coach/workout-cue-metadata-merge.ts`.
 *
 * Body below is byte-for-byte identical to the canonical Vitest-side file (excluding
 * this header) EXCEPT for relative imports that use the explicit `.ts` extension
 * required by Deno. Any change must be hand-mirrored — run `pnpm check:agent-mirror` to verify parity.
 */

import type { CueFieldKey } from './exercise-cue-request.ts';
import type { WorkoutCuesPatchV1 } from './workout-cues-patch.ts';

export type WorkoutCuePatchFields = Partial<Record<CueFieldKey | 'coach_notes', string>>;

const CUE_PATCH_FIELDS = [
  'instructions',
  'form_cues',
  'tips',
  'injury_prevention_tips',
  'coach_notes',
] as const satisfies readonly (keyof WorkoutCuePatchFields)[];

function deepClone<T>(value: T): T {
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value)) as T;
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function normalizeExerciseDictionaryKey(name: string): string {
  return name.trim().toLowerCase();
}

export function exerciseResolutionKey(ex: {
  id?: string;
  exerciseName?: string;
  name?: string;
}): string {
  if (typeof ex.id === 'string' && ex.id.trim()) return ex.id.trim();
  const name = (ex.exerciseName ?? ex.name ?? '').trim();
  return name ? normalizeExerciseDictionaryKey(name) : '';
}

export function flatExerciseResolutionKey(
  ex: { id?: string; name?: string },
  flatIndex: number,
): string {
  if (typeof ex.id === 'string' && ex.id.trim()) return ex.id.trim();
  const name = ex.name?.trim();
  const base = name ? normalizeExerciseDictionaryKey(name) : 'exercise';
  return `${base}::${flatIndex}`;
}

type FlatRow = Record<string, unknown> & { name?: string; id?: string };

type CollectedExercise = {
  key: string;
  exerciseName: string;
  flatIndex: number;
  blockExercise?: Record<string, unknown>;
};

function trimPatchValue(value: string | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

function parseFlatExercises(meta: Record<string, unknown>): FlatRow[] {
  const raw = meta.exercises;
  if (!Array.isArray(raw)) return [];
  const out: FlatRow[] = [];
  for (const el of raw) {
    if (!isPlainObject(el)) continue;
    const name = typeof el.name === 'string' ? el.name.trim() : '';
    if (!name) continue;
    out.push({ ...el, name });
  }
  return out;
}

function getPrimarySession(meta: Record<string, unknown>): Record<string, unknown> | null {
  const af = meta.ai_workout_factory;
  if (!isPlainObject(af)) return null;
  const ws = af.workout_set;
  if (!isPlainObject(ws)) return null;
  const workouts = ws.workouts;
  if (!Array.isArray(workouts) || workouts.length === 0) return null;
  const s0 = workouts[0];
  return isPlainObject(s0) ? s0 : null;
}

function collectExercisesForMetadata(meta: Record<string, unknown>): CollectedExercise[] {
  const flat = parseFlatExercises(meta);
  if (flat.length > 0) {
    return flat.map((ex, flatIndex) => ({
      key: flatExerciseResolutionKey(ex, flatIndex),
      exerciseName: ex.name?.trim() || 'Exercise',
      flatIndex,
    }));
  }

  const session = getPrimarySession(meta);
  if (!session) return [];
  const blocks = session.exerciseBlocks;
  if (!Array.isArray(blocks)) return [];

  const out: CollectedExercise[] = [];
  let flatIndex = 0;
  for (const blockRaw of blocks) {
    if (!isPlainObject(blockRaw)) continue;
    const exercises = blockRaw.exercises;
    if (!Array.isArray(exercises)) continue;
    for (const exRaw of exercises) {
      if (!isPlainObject(exRaw)) continue;
      const exerciseName =
        (typeof exRaw.exerciseName === 'string' && exRaw.exerciseName.trim()) ||
        (typeof exRaw.name === 'string' && exRaw.name.trim()) ||
        'Exercise';
      out.push({
        key: flatExerciseResolutionKey(
          {
            id: typeof exRaw.id === 'string' ? exRaw.id : undefined,
            name: exerciseName,
          },
          flatIndex,
        ),
        exerciseName,
        flatIndex,
        blockExercise: exRaw,
      });
      flatIndex += 1;
    }
  }
  return out;
}

function indexFlatExercisesByName(flat: FlatRow[]): Map<string, FlatRow[]> {
  const byName = new Map<string, FlatRow[]>();
  for (const ex of flat) {
    const k = normalizeExerciseDictionaryKey(ex.name ?? '');
    if (!k) continue;
    const list = byName.get(k) ?? [];
    list.push(ex);
    byName.set(k, list);
  }
  return byName;
}

function matchFlatRow(
  collected: CollectedExercise,
  flatByName: Map<string, FlatRow[]>,
  flat: FlatRow[],
): FlatRow | undefined {
  const byName = flatByName.get(normalizeExerciseDictionaryKey(collected.exerciseName));
  if (byName && byName.length === 1) return byName[0];
  if (byName && byName.length > 1) {
    return byName[collected.flatIndex] ?? byName[0];
  }
  return flat[collected.flatIndex];
}

function findOrEnsureFlatRow(
  flat: FlatRow[],
  collected: CollectedExercise,
  flatByName: Map<string, FlatRow[]>,
): FlatRow {
  const matched = matchFlatRow(collected, flatByName, flat);
  if (matched) {
    const idx = flat.indexOf(matched);
    if (idx >= 0) return flat[idx]!;
  }

  while (flat.length <= collected.flatIndex) {
    flat.push({ name: collected.exerciseName });
  }

  const existing = flat[collected.flatIndex];
  if (!existing || !existing.name?.trim()) {
    flat[collected.flatIndex] = {
      ...existing,
      name: collected.exerciseName,
    };
  }

  return flat[collected.flatIndex]!;
}

function applyPatchToFlatRow(row: FlatRow, patch: WorkoutCuePatchFields): void {
  for (const field of CUE_PATCH_FIELDS) {
    if (!(field in patch)) continue;
    const val = trimPatchValue(patch[field]);
    if (!val) {
      delete row[field];
      if (field === 'form_cues') delete row.form_cue;
    } else {
      row[field] = val;
      if (field === 'form_cues') delete row.form_cue;
    }
  }
}

function applyCoachNotesToFactoryTree(
  meta: Record<string, unknown>,
  patches: Record<string, WorkoutCuePatchFields>,
): void {
  const session = getPrimarySession(meta);
  if (!session) return;
  const blocks = session.exerciseBlocks;
  if (!Array.isArray(blocks)) return;

  let flatIndex = 0;
  for (const blockRaw of blocks) {
    if (!isPlainObject(blockRaw)) continue;
    const exercises = blockRaw.exercises;
    if (!Array.isArray(exercises)) continue;
    for (const exRaw of exercises) {
      if (!isPlainObject(exRaw)) continue;
      const directKey = exerciseResolutionKey(exRaw);
      const exerciseName =
        (typeof exRaw.exerciseName === 'string' && exRaw.exerciseName.trim()) ||
        (typeof exRaw.name === 'string' && exRaw.name.trim()) ||
        'Exercise';
      const indexedKey = flatExerciseResolutionKey(
        {
          id: typeof exRaw.id === 'string' ? exRaw.id : undefined,
          name: exerciseName,
        },
        flatIndex,
      );
      const patch = patches[directKey] ?? patches[indexedKey];
      flatIndex += 1;
      if (!patch || !('coach_notes' in patch)) continue;
      const val = trimPatchValue(patch.coach_notes);
      if (val) exRaw.coachNotes = val;
      else delete exRaw.coachNotes;
    }
  }
}

export function workoutCuePatchV1ToFields(patch: WorkoutCuesPatchV1): WorkoutCuePatchFields {
  const out: WorkoutCuePatchFields = {};
  for (const key of ['instructions', 'form_cues', 'tips', 'injury_prevention_tips'] as const) {
    const val = patch[key];
    if (typeof val === 'string' && val.trim()) out[key] = val.trim();
  }
  return out;
}

function findCollectedForResolutionKey(
  collected: CollectedExercise[],
  resolutionKey: string,
): CollectedExercise | undefined {
  const direct = collected.find((c) => c.key === resolutionKey);
  if (direct) return direct;

  const idxMatch = resolutionKey.match(/^(.+)::(\d+)$/);
  if (idxMatch) {
    const idx = Number.parseInt(idxMatch[2]!, 10);
    if (Number.isInteger(idx) && idx >= 0) {
      const byIndex = collected.find((c) => c.flatIndex === idx);
      if (byIndex) return byIndex;
    }
    const normalized = idxMatch[1]!;
    return (
      collected.find((c) => c.key === normalized) ??
      collected.find((c) => c.key.startsWith(`${normalized}::`))
    );
  }

  return (
    collected.find((c) => c.key.startsWith(`${resolutionKey}::`)) ??
    collected.find((c) => c.exerciseName.trim().toLowerCase() === resolutionKey)
  );
}

/** Merge one workout cue patch into metadata; returns full metadata object. */
export function applyWorkoutCuePatchToTaskMetadata(
  metadata: unknown,
  patch: WorkoutCuesPatchV1,
): Record<string, unknown> {
  const fields = workoutCuePatchV1ToFields(patch);
  if (Object.keys(fields).length === 0) {
    return isPlainObject(metadata) ? { ...metadata } : {};
  }

  const parsed = isPlainObject(metadata) ? deepClone(metadata) : {};
  if (parsed.variant === 'workout_log') return parsed;

  const collected = collectExercisesForMetadata(parsed);
  if (collected.length === 0) return parsed;

  const flat = parseFlatExercises(parsed).map((row) => ({ ...row }));
  const flatByName = indexFlatExercisesByName(flat);
  const item = findCollectedForResolutionKey(collected, patch.resolution_key);
  if (!item) return parsed;

  const row = findOrEnsureFlatRow(flat, item, flatByName);
  applyPatchToFlatRow(row, fields);
  if (item.blockExercise && typeof item.blockExercise.id === 'string' && !row.id) {
    row.id = item.blockExercise.id;
  }

  if (flat.length > 0) parsed.exercises = flat;
  else delete parsed.exercises;

  applyCoachNotesToFactoryTree(parsed, {
    [patch.resolution_key]: fields,
  });

  return parsed;
}

/** Shallow-merge delta for `agent_update_task_and_reply.p_new_metadata`. */
export function buildTaskMetadataDeltaForWorkoutCuePatch(
  baseMetadata: unknown,
  patch: WorkoutCuesPatchV1,
): Record<string, unknown> | null {
  const merged = applyWorkoutCuePatchToTaskMetadata(baseMetadata, patch);
  const base = isPlainObject(baseMetadata) ? baseMetadata : {};
  const delta: Record<string, unknown> = {};

  if (JSON.stringify(merged.exercises) !== JSON.stringify(base.exercises)) {
    if (merged.exercises !== undefined) delta.exercises = merged.exercises;
    else delta.exercises = null;
  }

  const mergedFactory = merged.ai_workout_factory;
  const baseFactory = base.ai_workout_factory;
  if (
    JSON.stringify(mergedFactory) !== JSON.stringify(baseFactory) &&
    mergedFactory !== undefined
  ) {
    delta.ai_workout_factory = mergedFactory;
  }

  return Object.keys(delta).length > 0 ? delta : null;
}
