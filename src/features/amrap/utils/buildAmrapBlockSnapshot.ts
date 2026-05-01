import { metadataFieldsFromParsed, type WorkoutExercise } from '@/lib/item-metadata';
import type { SessionDeckSnapshot } from '@/features/live-video/shells/huddle/session-deck-snapshot';

export type AmrapBlockSnapshotPayload = {
  origin_task_id: string;
  title: string;
  workout_type: string | null;
  duration_min: number | null;
  exercises: WorkoutExercise[];
};

export function pickActiveSnapshot(
  deck: readonly SessionDeckSnapshot[],
  activeSnapshotId: string | null,
): SessionDeckSnapshot | null {
  if (deck.length === 0) return null;
  if (activeSnapshotId) {
    const a = deck.find((s) => s.snapshotId === activeSnapshotId);
    if (a) return a;
  }
  return deck[0] ?? null;
}

export function buildAmrapBlockSnapshot(
  snap: SessionDeckSnapshot | null,
): AmrapBlockSnapshotPayload | null {
  if (!snap) return null;
  const fields = metadataFieldsFromParsed(snap.task.metadata);
  const mins = parseInt(fields.workoutDurationMin, 10);
  return {
    origin_task_id: snap.originTaskId,
    title: snap.task.title?.trim() || 'Untitled workout',
    workout_type: fields.workoutType?.trim() || null,
    duration_min: Number.isFinite(mins) && mins > 0 ? mins : null,
    exercises: fields.workoutExercises ?? [],
  };
}
