import type { ItemType, Json } from '@/types/database';

/** Single exercise entry stored in `tasks.metadata.exercises`. */
export type WorkoutExercise = {
  name: string;
  sets?: number;
  reps?: number;
  /** Weight in the user's unit_system (kg or lbs). */
  weight?: number;
  /** Duration in minutes for cardio/timed exercises. */
  duration_min?: number;
};

/** Normalize DB `metadata` jsonb for form state (object only; otherwise {}). */
export function parseTaskMetadata(value: unknown): Json {
  if (value == null) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value as Json;
  return {};
}

const MANAGED_METADATA_KEYS = [
  'location',
  'url',
  'season',
  'end_date',
  'caption',
  'workout_type',
  'duration_min',
  'exercises',
] as const;

export type TaskMetadataFormFields = {
  eventLocation: string;
  eventUrl: string;
  experienceSeason: string;
  /** YYYY-MM-DD; experience span end (start is `scheduled_on`). */
  experienceEndDate: string;
  memoryCaption: string;
  /** Workout / workout_log: free-text type (e.g. "Strength", "Cardio"). */
  workoutType: string;
  /** Workout duration in whole minutes. */
  workoutDurationMin: string;
  /** Ordered list of exercises with sets/reps/weight/duration. */
  workoutExercises: WorkoutExercise[];
};

function asWorkoutExercises(value: unknown): WorkoutExercise[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (x): x is WorkoutExercise => typeof x === 'object' && x !== null && typeof x.name === 'string',
  );
}

/** Read string inputs from saved metadata (for TaskModal local state). */
export function metadataFieldsFromParsed(meta: unknown): TaskMetadataFormFields {
  const o = parseTaskMetadata(meta) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const endRaw = str(o.end_date);
  return {
    eventLocation: str(o.location),
    eventUrl: str(o.url),
    experienceSeason: str(o.season),
    experienceEndDate: endRaw.length >= 10 ? endRaw.slice(0, 10) : endRaw,
    memoryCaption: str(o.caption),
    workoutType: str(o.workout_type),
    workoutDurationMin: o.duration_min != null ? String(o.duration_min) : '',
    workoutExercises: asWorkoutExercises(o.exercises),
  };
}

/**
 * Merge type-specific fields into metadata; strips managed keys first so switching `item_type`
 * does not leave stale keys. Preserves other keys (e.g. future `votes` on ideas).
 */
export function buildTaskMetadataPayload(
  itemType: ItemType,
  fields: TaskMetadataFormFields,
  base: unknown,
): Json {
  const o = { ...(parseTaskMetadata(base) as Record<string, unknown>) };
  for (const k of MANAGED_METADATA_KEYS) {
    delete o[k];
  }
  const t = (s: string) => s.trim();
  switch (itemType) {
    case 'event':
      if (t(fields.eventLocation)) o.location = t(fields.eventLocation);
      if (t(fields.eventUrl)) o.url = t(fields.eventUrl);
      break;
    case 'experience':
      if (t(fields.experienceSeason)) o.season = t(fields.experienceSeason);
      if (t(fields.experienceEndDate)) o.end_date = t(fields.experienceEndDate).slice(0, 10);
      break;
    case 'memory':
      if (t(fields.memoryCaption)) o.caption = t(fields.memoryCaption);
      break;
    case 'workout':
    case 'workout_log': {
      if (t(fields.workoutType)) o.workout_type = t(fields.workoutType);
      const mins = parseInt(fields.workoutDurationMin, 10);
      if (!isNaN(mins) && mins > 0) o.duration_min = mins;
      if (fields.workoutExercises.length > 0) o.exercises = fields.workoutExercises;
      break;
    }
    default:
      break;
  }
  return o as Json;
}
