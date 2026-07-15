import type { Json } from '@/types/database';
import type { WorkoutExercise } from '@/lib/item-metadata';
import { parseTaskMetadata } from '@/lib/parse-task-metadata';
import { parseWorkoutExercisesFromMetadata } from '@/lib/parse-workout-exercises-from-metadata';
import {
  collectBlockExercises,
  collectFlatOnlyExercises,
  formatFormCuesFromFlat,
  indexFlatExercisesByName,
  matchFlatExerciseForCollected,
  type CollectedBlockExercise,
} from '@/lib/workout-factory/resolve-exercise-cue-bundle';
import { buildWorkoutSessionViewModel } from '@/lib/workout-factory/workout-session-view-model';
import { hasRichWorkoutSetInMetadata } from '@/lib/workout-factory/sync-workout-metadata';
import type { WorkoutCuePatch } from '@/lib/workout-factory/apply-cue-patches-to-metadata';
import type { Exercise } from '@/lib/workout-factory/types/ai-program';

const CUE_FIELDS = [
  'instructions',
  'form_cues',
  'tips',
  'injury_prevention_tips',
  'coach_notes',
] as const satisfies readonly (keyof WorkoutCuePatch)[];

export type ReconcileWorkoutCueMetadataArgs = {
  local: Json;
  incoming: Json;
  /** Pending Coach patches keyed by resolution_key (optional). */
  pending?: Record<string, WorkoutCuePatch>;
};

export type ReconcileWorkoutCueMetadataResult = {
  metadata: Json;
  /** True when a pending patch field was absent on the server-origin (incoming) rows. */
  pendingStillMissing: boolean;
};

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

function trimNonEmpty(s: string | null | undefined): string | null {
  const t = typeof s === 'string' ? s.trim() : '';
  return t.length > 0 ? t : null;
}

function stringifyRich(v: string | string[] | undefined | null): string | null {
  if (v == null) return null;
  if (Array.isArray(v)) {
    const parts = v.map((x) => (typeof x === 'string' ? x.trim() : '')).filter(Boolean);
    return parts.length > 0 ? parts.join('\n') : null;
  }
  return trimNonEmpty(v);
}

function flatFieldValue(
  row: WorkoutExercise | undefined,
  field: (typeof CUE_FIELDS)[number],
): string | null {
  if (!row) return null;
  if (field === 'form_cues') return formatFormCuesFromFlat(row);
  if (field === 'instructions') {
    return trimNonEmpty(row.instructions) ?? trimNonEmpty(row.notes);
  }
  if (field === 'injury_prevention_tips') return stringifyRich(row.injury_prevention_tips);
  return trimNonEmpty(row[field] as string | undefined);
}

function setFlatField(
  row: WorkoutExercise,
  field: (typeof CUE_FIELDS)[number],
  value: string,
): void {
  row[field] = value;
  if (field === 'form_cues') delete row.form_cue;
}

function collectExercises(meta: unknown): CollectedBlockExercise[] {
  const vm = buildWorkoutSessionViewModel(meta);
  if (vm.source === 'flat') {
    return collectFlatOnlyExercises(vm.flatExercises);
  }
  const fromBlocks = collectBlockExercises(vm.blocks);
  if (fromBlocks.length > 0) return fromBlocks;
  return collectFlatOnlyExercises(vm.flatExercises);
}

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

  return (
    collected.find((c) => c.key.startsWith(`${resolutionKey}::`)) ??
    collected.find((c) => c.exerciseName.trim().toLowerCase() === resolutionKey)
  );
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

function matchFlatRow(
  collected: CollectedBlockExercise,
  flat: WorkoutExercise[],
  flatByName: Map<string, WorkoutExercise[]>,
): WorkoutExercise | undefined {
  return matchFlatExerciseForCollected(collected, flatByName, flat);
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

const FACTORY_CUE_KEYS = [
  'instructions',
  'formCues',
  'tips',
  'injuryPreventionTips',
  'coachNotes',
] as const;

/** Copy factory cue fields from local onto incoming when incoming lacks them. */
function richerMergeFactoryCues(
  localMeta: Record<string, unknown>,
  incomingMeta: Record<string, unknown>,
): void {
  if (!hasRichWorkoutSetInMetadata(localMeta) || !hasRichWorkoutSetInMetadata(incomingMeta)) {
    return;
  }
  const localSession = getPrimarySession(localMeta);
  const incomingSession = getPrimarySession(incomingMeta);
  if (!localSession || !incomingSession) return;

  const localBlocks = localSession.exerciseBlocks;
  const incomingBlocks = incomingSession.exerciseBlocks;
  if (!Array.isArray(localBlocks) || !Array.isArray(incomingBlocks)) return;

  for (let bi = 0; bi < localBlocks.length; bi++) {
    const localBlock = localBlocks[bi];
    const incomingBlock = incomingBlocks[bi];
    if (!isPlainObject(localBlock) || !isPlainObject(incomingBlock)) continue;
    const localExs = localBlock.exercises;
    const incomingExs = incomingBlock.exercises;
    if (!Array.isArray(localExs) || !Array.isArray(incomingExs)) continue;

    for (let ei = 0; ei < localExs.length; ei++) {
      const localEx = localExs[ei];
      const incomingEx = incomingExs[ei];
      if (!isPlainObject(localEx) || !isPlainObject(incomingEx)) continue;
      const localTyped = localEx as unknown as Exercise;
      const incomingTyped = incomingEx as unknown as Exercise;
      for (const key of FACTORY_CUE_KEYS) {
        const localVal = trimNonEmpty(localTyped[key] as string | undefined);
        const incomingVal = trimNonEmpty(incomingTyped[key] as string | undefined);
        if (localVal && !incomingVal) {
          (incomingTyped as unknown as Record<string, unknown>)[key] = localVal;
        }
      }
    }
  }
}

/**
 * Silent Realtime reconcile: start from server `incoming`, copy workout-scoped cue fields
 * from `local` when incoming lacks them (and for pending Coach patches).
 */
export function reconcileWorkoutCueMetadata(
  args: ReconcileWorkoutCueMetadataArgs,
): ReconcileWorkoutCueMetadataResult {
  const localParsed = parseTaskMetadata(args.local) as Record<string, unknown>;
  const incomingParsed = parseTaskMetadata(args.incoming) as Record<string, unknown>;
  const pending = args.pending ?? {};

  if (incomingParsed.variant === 'workout_log') {
    return { metadata: args.incoming, pendingStillMissing: false };
  }

  const result = deepClone(incomingParsed) as Record<string, unknown>;
  const localFlat = parseWorkoutExercisesFromMetadata(localParsed);
  const incomingFlat = parseWorkoutExercisesFromMetadata(result).map((row) => ({ ...row }));
  const localByName = indexFlatExercisesByName(localFlat);
  const incomingByName = indexFlatExercisesByName(incomingFlat);

  const localCollected = collectExercises(localParsed);
  const incomingCollected = collectExercises(result);

  let pendingStillMissing = false;

  for (const [resolutionKey, patch] of Object.entries(pending)) {
    const item =
      findCollectedForResolutionKey(incomingCollected, resolutionKey) ??
      findCollectedForResolutionKey(localCollected, resolutionKey);
    if (!item) {
      pendingStillMissing = true;
      continue;
    }
    const incomingRow = matchFlatRow(item, incomingFlat, incomingByName);
    for (const field of CUE_FIELDS) {
      if (!(field in patch)) continue;
      const pendingVal = trimNonEmpty(patch[field]);
      if (!pendingVal) continue;
      if (!flatFieldValue(incomingRow, field)) {
        pendingStillMissing = true;
      }
    }
  }

  const keysToMerge = new Set<string>([
    ...localCollected.map((c) => c.key),
    ...Object.keys(pending),
  ]);

  for (const key of keysToMerge) {
    const localItem =
      findCollectedForResolutionKey(localCollected, key) ??
      localCollected.find((c) => c.key === key);
    if (!localItem) continue;

    const localRow = matchFlatRow(localItem, localFlat, localByName);
    if (!localRow) continue;

    const incomingItem = findCollectedForResolutionKey(incomingCollected, key) ?? localItem;
    const targetRow = findOrEnsureFlatRow(incomingFlat, incomingItem, incomingByName);

    for (const field of CUE_FIELDS) {
      const localVal = flatFieldValue(localRow, field);
      if (!localVal) continue;
      if (!flatFieldValue(targetRow, field)) {
        setFlatField(targetRow, field, localVal);
      }
    }

    if (localItem.blockExercise?.id && !targetRow.id) {
      targetRow.id = localItem.blockExercise.id;
    }
  }

  if (incomingFlat.length > 0) {
    result.exercises = incomingFlat;
  }

  richerMergeFactoryCues(localParsed, result);

  return { metadata: result as Json, pendingStillMissing };
}

/** TTL for pending Coach cue patches awaiting Realtime confirmation. */
export const PENDING_WORKOUT_CUE_TTL_MS = 25_000;

export type PendingWorkoutCueEntry = {
  resolution_key: string;
  patch: WorkoutCuePatch;
  at: number;
};

/** Drop expired entries and return active patches keyed by resolution_key. */
export function snapshotPendingWorkoutCuePatches(
  pendingByMessage: Map<string, PendingWorkoutCueEntry>,
  now = Date.now(),
): Record<string, WorkoutCuePatch> {
  const out: Record<string, WorkoutCuePatch> = {};
  for (const [messageId, entry] of pendingByMessage) {
    if (now - entry.at > PENDING_WORKOUT_CUE_TTL_MS) {
      pendingByMessage.delete(messageId);
      continue;
    }
    out[entry.resolution_key] = { ...out[entry.resolution_key], ...entry.patch };
  }
  return out;
}

/**
 * Remove pending entries whose patched fields are now present on `incoming` metadata.
 */
export function clearPendingWorkoutCuesSatisfiedByIncoming(
  pendingByMessage: Map<string, PendingWorkoutCueEntry>,
  incoming: Json,
): void {
  const incomingParsed = parseTaskMetadata(incoming);
  const flat = parseWorkoutExercisesFromMetadata(incomingParsed);
  const byName = indexFlatExercisesByName(flat);
  const collected = collectExercises(incomingParsed);

  for (const [messageId, entry] of pendingByMessage) {
    const item = findCollectedForResolutionKey(collected, entry.resolution_key);
    const row = item ? matchFlatRow(item, flat, byName) : undefined;
    let allPresent = true;
    for (const field of CUE_FIELDS) {
      if (!(field in entry.patch)) continue;
      const pendingVal = trimNonEmpty(entry.patch[field]);
      if (!pendingVal) continue;
      if (!flatFieldValue(row, field)) {
        allPresent = false;
        break;
      }
    }
    if (allPresent) {
      pendingByMessage.delete(messageId);
    }
  }
}
