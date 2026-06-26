import { metadataFieldsFromParsed, type WorkoutExercise } from '@/lib/item-metadata';
import type { SessionDeckSnapshot } from '@/features/live-video/shells/huddle/session-deck-snapshot';
import {
  isIntervalPresetOrCustomId,
  type IntervalPresetId,
} from '@/lib/workout-factory/interval-timer/interval-preset-catalog';
import type { TabataFormatParams } from '@/lib/workout-factory/types/tabata-format-params';

export type IntervalBlockSnapshotBase = {
  /** Omitted for on-the-fly quick-launch sessions without a backing task row. */
  origin_task_id?: string | null;
  title: string;
  workout_type: string | null;
  duration_min: number | null;
  exercises: WorkoutExercise[];
};

/** Persisted on `live_interval_sessions.block_snapshot` for tabata attach. */
export type TabataBlockSnapshotPayload = IntervalBlockSnapshotBase & {
  block_format: 'tabata';
  format_params: TabataFormatParams;
};

export type ParsedIntervalBlockSnapshot = IntervalBlockSnapshotBase & {
  block_format?: 'tabata';
  format_params?: TabataFormatParams;
};

function positiveInt(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const n = Math.round(v);
  return n > 0 ? n : null;
}

export function parseTabataFormatParams(raw: unknown): TabataFormatParams | null {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const params: TabataFormatParams = {};

  const work = positiveInt(o.work_seconds);
  const rest = positiveInt(o.rest_seconds);
  const rounds = positiveInt(o.rounds);
  if (work != null) params.work_seconds = work;
  if (rest != null) params.rest_seconds = rest;
  if (rounds != null) params.rounds = rounds;

  const preset = o.interval_preset;
  if (isIntervalPresetOrCustomId(preset)) {
    params.interval_preset = preset as IntervalPresetId;
  }

  if (Object.keys(params).length === 0) return null;
  return params;
}

function parseBlockSnapshotBase(raw: unknown): IntervalBlockSnapshotBase | null {
  if (raw == null || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.title !== 'string') return null;
  const originTaskId = o.origin_task_id;
  const wt = o.workout_type;
  const dm = o.duration_min;
  const ex = o.exercises;
  const exercises: WorkoutExercise[] = Array.isArray(ex) ? (ex as WorkoutExercise[]) : [];
  return {
    ...(typeof originTaskId === 'string' && originTaskId.trim() !== ''
      ? { origin_task_id: originTaskId }
      : {}),
    title: o.title,
    workout_type: typeof wt === 'string' ? wt : null,
    duration_min: typeof dm === 'number' && Number.isFinite(dm) ? dm : null,
    exercises,
  };
}

/** Parses `block_snapshot` JSONB for any live interval wrapper (legacy-safe). */
export function parseIntervalBlockSnapshot(raw: unknown): ParsedIntervalBlockSnapshot | null {
  const base = parseBlockSnapshotBase(raw);
  if (!base) return null;

  const o = raw as Record<string, unknown>;
  const blockFormat = o.block_format === 'tabata' ? ('tabata' as const) : undefined;
  const formatParams = parseTabataFormatParams(o.format_params);

  return {
    ...base,
    ...(blockFormat ? { block_format: blockFormat } : {}),
    ...(formatParams ? { format_params: formatParams } : {}),
  };
}

export function buildTabataBlockSnapshotBase(
  snap: SessionDeckSnapshot,
): IntervalBlockSnapshotBase | null {
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

export function tabataFormatParamsFromRecord(
  formatParams: Record<string, unknown>,
): TabataFormatParams {
  return parseTabataFormatParams(formatParams) ?? {};
}
