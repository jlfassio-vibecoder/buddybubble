import type { ItemType, TaskRow } from '@/types/database';
import type { WorkoutExercise } from '@/lib/item-metadata';
import {
  buildTaskMetadataPayload,
  metadataFieldsFromParsed,
  parseTaskMetadata,
  type TaskMetadataFormFields,
} from '@/lib/item-metadata';

export type SessionDeckSnapshot = {
  /** Client-only id used for deck DnD and `TaskRow.id` on the cloned row. */
  snapshotId: string;
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

/** Stable comparison for dirty detection (workout-relevant metadata slice). */
export function workoutMetadataSignature(meta: unknown): string {
  const f = metadataFieldsFromParsed(meta);
  return JSON.stringify({
    t: f.workoutType,
    d: f.workoutDurationMin,
    e: f.workoutExercises,
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
  const originTaskId = task.id;
  cloned.id = snapshotId;
  const baselineMetadata = cloneJsonMetadata(cloned.metadata);
  return {
    snapshotId,
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
  const fields = metadataFieldsFromParsed(task.metadata);
  const merged: TaskMetadataFormFields = {
    ...fields,
    workoutExercises: nextExercises,
  };
  return buildTaskMetadataPayload(
    task.item_type as ItemType,
    merged,
    task.metadata,
  ) as TaskRow['metadata'];
}
