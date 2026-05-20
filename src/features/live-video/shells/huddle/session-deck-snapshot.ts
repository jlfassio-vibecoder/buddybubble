import type { TaskRow } from '@/types/database';
import type { WorkoutExercise } from '@/lib/item-metadata';
import {
  metadataFieldsFromParsed,
  parseTaskMetadata,
  stripLegacyWorkoutMetadataKeys,
} from '@/lib/item-metadata';
import {
  applyFlatWorkoutEditsToMetadata,
  hasRichWorkoutSetInMetadata,
} from '@/lib/workout-factory/sync-workout-metadata';

export type SessionDeckSnapshot = {
  /**
   * Stable unique id for this deck **row** (React keys + dnd-kit). Never equals another row’s key,
   * even when `snapshotId` / `task.id` collide across rehydration vs optimistic state.
   */
  deckRowKey: string;
  /** Client-only id used for deck DnD and `TaskRow.id` on the cloned row. */
  snapshotId: string;
  /** `live_session_deck_items.id` once persisted for this session; null until insert succeeds. */
  deckItemId: string | null;
  /** Original `tasks.id` from the Kanban board. */
  originTaskId: string;
  /** Deep-cloned task; `task.id` equals `snapshotId`. */
  task: TaskRow;
  /** Metadata clone at snapshot time; used to detect edits vs session-only accept. */
  baselineMetadata: TaskRow['metadata'];
  /** True when workout metadata differs from `baselineMetadata`. */
  dirty: boolean;
};

function newSnapshotId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function cloneJsonMetadata(meta: TaskRow['metadata']): TaskRow['metadata'] {
  const parsed = parseTaskMetadata(meta) as Record<string, unknown>;
  try {
    return structuredClone(parsed) as TaskRow['metadata'];
  } catch {
    return JSON.parse(JSON.stringify(parsed)) as TaskRow['metadata'];
  }
}

/** Shallow-merge overlay JSON over base task metadata (session row overlay wins on key collisions). */
export function mergeTaskMetadataOverlay(
  base: TaskRow['metadata'],
  overlay: unknown,
): TaskRow['metadata'] {
  return {
    ...(parseTaskMetadata(base) as Record<string, unknown>),
    ...(parseTaskMetadata(overlay) as Record<string, unknown>),
  } as TaskRow['metadata'];
}

export function cloneSessionDeckSnapshot(s: SessionDeckSnapshot): SessionDeckSnapshot {
  try {
    return structuredClone(s);
  } catch {
    return JSON.parse(JSON.stringify(s)) as SessionDeckSnapshot;
  }
}

function factoryWorkoutSetSignature(meta: Record<string, unknown>): string | null {
  if (!hasRichWorkoutSetInMetadata(meta)) return null;
  const af = meta.ai_workout_factory;
  if (typeof af !== 'object' || af === null) return null;
  const ws = (af as { workout_set?: unknown }).workout_set;
  if (ws == null) return null;
  try {
    return JSON.stringify(ws);
  } catch {
    return null;
  }
}

/** Stable comparison for dirty detection (workout-relevant metadata slice). */
export function workoutMetadataSignature(meta: unknown): string {
  const o = parseTaskMetadata(meta) as Record<string, unknown>;
  const f = metadataFieldsFromParsed(meta);
  return JSON.stringify({
    t: f.workoutType,
    d: f.workoutDurationMin,
    e: f.workoutExercises,
    factory: factoryWorkoutSetSignature(o),
  });
}

export function computeSnapshotDirty(
  task: TaskRow,
  baselineMetadata: TaskRow['metadata'],
): boolean {
  return workoutMetadataSignature(task.metadata) !== workoutMetadataSignature(baselineMetadata);
}

/** Deep-clone a board task into a deck snapshot (does not touch Supabase). */
export function createSessionDeckSnapshot(task: TaskRow): SessionDeckSnapshot {
  let cloned: TaskRow;
  try {
    cloned = structuredClone(task);
  } catch {
    cloned = JSON.parse(JSON.stringify(task)) as TaskRow;
  }
  const snapshotId = newSnapshotId();
  const deckRowKey = newSnapshotId();
  const originTaskId = task.id;
  cloned.id = snapshotId;
  const baselineMetadata = cloneJsonMetadata(cloned.metadata);
  return {
    deckRowKey,
    snapshotId,
    deckItemId: null,
    originTaskId,
    task: cloned,
    baselineMetadata,
    dirty: false,
  };
}

export function withSnapshotTask(
  snap: SessionDeckSnapshot,
  nextTask: TaskRow,
): SessionDeckSnapshot {
  return {
    ...snap,
    task: nextTask,
    dirty: computeSnapshotDirty(nextTask, snap.baselineMetadata),
  };
}

/** Accept current task metadata as the new baseline (session-only). */
export function acceptSnapshotBaseline(snap: SessionDeckSnapshot): SessionDeckSnapshot {
  const baselineMetadata = cloneJsonMetadata(snap.task.metadata);
  return {
    ...snap,
    baselineMetadata,
    dirty: false,
  };
}

export function mergeWorkoutExercisesIntoTaskMetadata(
  task: TaskRow,
  nextExercises: WorkoutExercise[],
): TaskRow['metadata'] {
  const merged = applyFlatWorkoutEditsToMetadata(task.metadata, nextExercises);
  // Session-only path: no buildTaskMetadataPayload / finalizeWorkoutMetadataForSave — still strip legacy linkage keys.
  return stripLegacyWorkoutMetadataKeys(merged) as TaskRow['metadata'];
}
