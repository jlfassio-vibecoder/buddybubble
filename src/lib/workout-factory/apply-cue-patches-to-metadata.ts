import type { Json } from '@/types/database';
import type { WorkoutExercise } from '@/lib/item-metadata';
import { parseTaskMetadata } from '@/lib/parse-task-metadata';
import { parseWorkoutExercisesFromMetadata } from '@/lib/parse-workout-exercises-from-metadata';
import {
  collectBlockExercises,
  collectFlatOnlyExercises,
  exerciseResolutionKey,
  flatExerciseResolutionKey,
  indexFlatExercisesByName,
  matchFlatExerciseForCollected,
  type CollectedBlockExercise,
  type ResolvedCueBundle,
} from '@/lib/workout-factory/resolve-exercise-cue-bundle';
import { buildWorkoutSessionViewModel } from '@/lib/workout-factory/workout-session-view-model';
import { hasRichWorkoutSetInMetadata } from '@/lib/workout-factory/sync-workout-metadata';
import type { Exercise } from '@/lib/workout-factory/types/ai-program';

export type WorkoutCuePatch = Partial<{
  instructions: string;
  form_cues: string;
  tips: string;
  injury_prevention_tips: string;
  coach_notes: string;
}>;

const CUE_PATCH_FIELDS = [
  'instructions',
  'form_cues',
  'tips',
  'injury_prevention_tips',
  'coach_notes',
] as const satisfies readonly (keyof WorkoutCuePatch)[];

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

function trimPatchValue(value: string | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

function applyPatchToFlatRow(row: WorkoutExercise, patch: WorkoutCuePatch): void {
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

function findOrEnsureFlatRow(
  flat: WorkoutExercise[],
  collected: CollectedBlockExercise,
  flatByName: Map<string, WorkoutExercise[]>,
): WorkoutExercise {
  const matched = matchFlatExerciseForCollected(collected, flatByName, flat);
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

function applyCoachNotesToFactoryTree(
  meta: Record<string, unknown>,
  patches: Record<string, WorkoutCuePatch>,
): void {
  if (!hasRichWorkoutSetInMetadata(meta)) return;

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
      const ex = exRaw as unknown as Exercise;
      const directKey = exerciseResolutionKey(ex);
      const indexedKey = flatExerciseResolutionKey(
        { name: (ex.exerciseName ?? '').trim() || 'Exercise', id: ex.id },
        flatIndex,
      );
      const patch = patches[directKey] ?? patches[indexedKey];
      flatIndex += 1;
      if (!patch || !('coach_notes' in patch)) continue;

      const val = trimPatchValue(patch.coach_notes);
      if (val) ex.coachNotes = val;
      else delete ex.coachNotes;
    }
  }
}

function collectExercisesForPatches(meta: unknown): CollectedBlockExercise[] {
  const vm = buildWorkoutSessionViewModel(meta);
  if (vm.source === 'flat') {
    return collectFlatOnlyExercises(vm.flatExercises);
  }
  const fromBlocks = collectBlockExercises(vm.blocks);
  if (fromBlocks.length > 0) return fromBlocks;
  return collectFlatOnlyExercises(vm.flatExercises);
}

/** Match Coach `resolution_key` including `name::flatIndex` aliases (parity with Edge merge). */
function findCollectedForResolutionKey(
  collected: CollectedBlockExercise[],
  resolutionKey: string,
): CollectedBlockExercise | undefined {
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

  // Bare name / legacy keys: match indexed aliases (`name::0`) produced by collectBlockExercises.
  return (
    collected.find((c) => c.key.startsWith(`${resolutionKey}::`)) ??
    collected.find((c) => c.exerciseName.trim().toLowerCase() === resolutionKey)
  );
}

/** Overlay unsaved cue drafts onto a resolved bundle for live preview. */
export function mergeCuePatchIntoBundle(
  bundle: ResolvedCueBundle,
  patch?: WorkoutCuePatch,
): ResolvedCueBundle {
  if (!patch || Object.keys(patch).length === 0) return bundle;

  const next: ResolvedCueBundle = { ...bundle };

  for (const field of CUE_PATCH_FIELDS) {
    if (!(field in patch)) continue;
    const val = trimPatchValue(patch[field]);
    next[field] = val ? { value: val, provenance: 'workout' } : null;
  }

  next.isEmpty = !(
    next.instructions ||
    next.form_cues ||
    next.tips ||
    next.injury_prevention_tips ||
    next.coach_notes
  );

  return next;
}

/**
 * Merge workout-scoped cue patches into task metadata.
 * Dual-writes enriched fields to flat `metadata.exercises` and `coachNotes` on factory exercises.
 */
export function applyCuePatchesToMetadata(
  metadata: Json,
  patches: Record<string, WorkoutCuePatch>,
): Json {
  if (!patches || Object.keys(patches).length === 0) return metadata;

  const parsed = parseTaskMetadata(metadata) as Record<string, unknown>;
  if (parsed.variant === 'workout_log') return metadata;

  const next = deepClone(parsed) as Record<string, unknown>;
  const collected = collectExercisesForPatches(next);
  if (collected.length === 0) return next as Json;

  const flat = parseWorkoutExercisesFromMetadata(next).map((row) => ({ ...row }));
  const flatByName = indexFlatExercisesByName(flat);

  for (const [key, patch] of Object.entries(patches)) {
    const item = findCollectedForResolutionKey(collected, key);
    if (!item) continue;

    const row = findOrEnsureFlatRow(flat, item, flatByName);
    applyPatchToFlatRow(row, patch);

    if (item.blockExercise?.id && !row.id) {
      row.id = item.blockExercise.id;
    }
  }

  if (flat.length > 0) {
    next.exercises = flat;
  } else {
    delete next.exercises;
  }

  applyCoachNotesToFactoryTree(next, patches);

  return next as Json;
}
