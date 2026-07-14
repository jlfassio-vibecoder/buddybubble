import type { ItemType, Json } from '@/types/database';
import { parseWorkoutExercisesFromMetadata } from '@/lib/parse-workout-exercises-from-metadata';
import { parseTaskMetadata } from '@/lib/parse-task-metadata';
import {
  applyFlatWorkoutEditsToMetadata,
  deriveFlatExercisesFromMetadata,
  flatExercisesMatchDerived,
  hasRichWorkoutSetInMetadata,
  passThroughRichWorkoutLogMetadata,
} from '@/lib/workout-factory/sync-workout-metadata';

export { parseTaskMetadata } from '@/lib/parse-task-metadata';

/**
 * Program ↔ workout linkage uses top-level `tasks.program_id` and `tasks.program_session_key`,
 * not JSON metadata. Legacy `linked_program_task_id` / `program_session_key` keys in metadata
 * are stripped when saving workout metadata from the task modal.
 */

/** Remove legacy program linkage keys from workout metadata JSON. */
export function stripLegacyWorkoutMetadataKeys(meta: unknown): Json {
  const o = { ...(parseTaskMetadata(meta) as Record<string, unknown>) };
  delete o.linked_program_task_id;
  delete o.program_session_key;
  return o as Json;
}

/** Recorded data for one set logged during a live workout session. */
export type SetLogEntry = {
  set: number;
  weight?: number;
  reps?: number;
  /** Rate of perceived exertion, 1–10. */
  rpe?: number;
  /** EMOM: seconds to complete reps in the minute (Slap Target). */
  active_seconds?: number;
  done: boolean;
};

/** Single exercise entry stored in `tasks.metadata.exercises`. */
export type WorkoutExercise = {
  name: string;
  sets?: number;
  /** Scalar count (number) or range/text (string), e.g. `"8-10"`. */
  reps?: number | string;
  /** Weight in the user's unit_system (kg or lbs). */
  weight?: number;
  /** Duration in minutes for cardio/timed exercises. */
  duration_min?: number;
  /** RPE (1–10), when prescribed. */
  rpe?: number;
  /** Interval / HIIT: work interval seconds (Interval Timers timer schema). */
  work_seconds?: number;
  /** Rest between efforts or stations (seconds). */
  rest_seconds?: number;
  /** Interval rounds (e.g. Tabata, AMRAP stations). */
  rounds?: number;
  /** Short coach note from AI chain. */
  coach_notes?: string;
  /** Equipment for this movement (e.g. dumbbell, barbell, suspension trainer). */
  equipment?: string;
  /** Injury-aware coaching; highly detailed tier, separate from form_cues. */
  injury_prevention_tips?: string | string[];
  /** Instructions shown in the player's detailed view. */
  notes?: string;
  /** Optional step-by-step or long-form instructions (detailed player; preferred over `notes` when both exist). */
  instructions?: string;
  /** Form / execution cues as a single string or bullet list. */
  form_cues?: string | string[];
  /** Singular alias some payloads use for one form cue line. */
  form_cue?: string;
  /** Short coaching tip for detailed view. */
  tips?: string;
  /** Optional catalog / CDN URL for exercise thumbnail (no user uploads). */
  thumbnail_url?: string;
  /** Stable row id when present (editor / rich round-trip); optional on legacy flat rows. */
  id?: string;
  /** Per-set performance data recorded by the workout player (workout_log only). */
  set_logs?: SetLogEntry[];
};

/** Single day within a program week. */
export type ProgramDay = {
  /** 1–7, where 1 = Monday. */
  day: number;
  name: string;
  workout_type?: string;
  duration_min?: number;
};

/** One week's schedule within a fitness program. A single-entry schedule array
 *  is treated as a repeating template for all `duration_weeks`. */
export type ProgramWeek = {
  /** 1-indexed week number. */
  week: number;
  days: ProgramDay[];
};

const MANAGED_METADATA_KEYS = [
  'location',
  'url',
  'season',
  'end_date',
  'caption',
  'workout_type',
  'duration_min',
  'exercises',
  'goal',
  'duration_weeks',
  'current_week',
  'schedule',
  /** Pre-suffix template title for AI-personalized programs (avoids nested "A - B - C"). */
  'program_source_title',
  /** Supabase Storage path in `task-attachments` for Kanban/chat card header image. */
  'card_cover_path',
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
  /** Program: stated goal (e.g. "Build lean muscle"). */
  programGoal: string;
  /** Program: total length as a string for number input. */
  programDurationWeeks: string;
  /** Program: which week the user is currently on (0 = not started). */
  programCurrentWeek: number;
  /** Program: weekly workout schedule. */
  programSchedule: ProgramWeek[];
  /** Program: original template title before AI suffix (metadata `program_source_title`). */
  programSourceTitle: string;
  /** Storage path for optional card cover image (all item types). */
  cardCoverPath: string;
};

/** Normalize stored `schedule` JSON into `ProgramWeek[]` (for API + forms). */
export function asProgramSchedule(value: unknown): ProgramWeek[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((w): ProgramWeek[] => {
    if (typeof w !== 'object' || w === null) return [];
    const week = (w as { week?: unknown }).week;
    const days = (w as { days?: unknown }).days;
    if (!Number.isFinite(week) || !Array.isArray(days)) return [];
    const cleanedDays = days.flatMap((d): ProgramDay[] => {
      if (typeof d !== 'object' || d === null) return [];
      const day = (d as { day?: unknown }).day;
      const name = (d as { name?: unknown }).name;
      if (
        !Number.isFinite(day) ||
        (day as number) < 1 ||
        (day as number) > 7 ||
        typeof name !== 'string'
      )
        return [];
      const workoutType = (d as { workout_type?: unknown }).workout_type;
      const durationMin = (d as { duration_min?: unknown }).duration_min;
      return [
        {
          day: day as number,
          name,
          ...(typeof workoutType === 'string' ? { workout_type: workoutType } : {}),
          ...(Number.isFinite(durationMin) ? { duration_min: durationMin as number } : {}),
        },
      ];
    });
    return [{ week: week as number, days: cleanedDays }];
  });
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
    workoutExercises: parseWorkoutExercisesFromMetadata(meta),
    programGoal: str(o.goal),
    programDurationWeeks: o.duration_weeks != null ? String(o.duration_weeks) : '',
    programCurrentWeek: typeof o.current_week === 'number' ? o.current_week : 0,
    programSchedule: asProgramSchedule(o.schedule),
    programSourceTitle: str(o.program_source_title),
    cardCoverPath: str(o.card_cover_path),
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
      delete o.linked_program_task_id;
      delete o.program_session_key;
      if (t(fields.workoutType)) o.workout_type = t(fields.workoutType);
      const mins = parseInt(fields.workoutDurationMin, 10);
      if (!isNaN(mins) && mins > 0) o.duration_min = mins;
      if (fields.workoutExercises.length > 0) o.exercises = fields.workoutExercises;
      break;
    }
    case 'program': {
      if (t(fields.programGoal)) o.goal = t(fields.programGoal);
      const dw = parseInt(fields.programDurationWeeks, 10);
      if (!isNaN(dw) && dw > 0) o.duration_weeks = dw;
      if (fields.programCurrentWeek > 0) o.current_week = fields.programCurrentWeek;
      if (fields.programSchedule.length > 0) o.schedule = fields.programSchedule;
      if (t(fields.programSourceTitle)) o.program_source_title = t(fields.programSourceTitle);
      break;
    }
    default:
      break;
  }
  if (t(fields.cardCoverPath)) o.card_cover_path = t(fields.cardCoverPath);
  else delete o.card_cover_path;
  return finalizeWorkoutMetadataForSave(itemType, fields, o);
}

/**
 * After `buildTaskMetadataPayload` sets managed workout fields, reconcile rich factory vs flat form state.
 */
export function finalizeWorkoutMetadataForSave(
  itemType: ItemType,
  fields: TaskMetadataFormFields,
  built: unknown,
): Json {
  const o = { ...(parseTaskMetadata(built) as Record<string, unknown>) };

  if (itemType !== 'workout' && itemType !== 'workout_log') {
    return o as Json;
  }

  if (!hasRichWorkoutSetInMetadata(o)) {
    return o as Json;
  }

  if (itemType === 'workout_log') {
    return passThroughRichWorkoutLogMetadata(o, fields.workoutExercises);
  }

  const derived = deriveFlatExercisesFromMetadata(o);
  const flatFromForm = fields.workoutExercises;

  if (!flatExercisesMatchDerived(flatFromForm, derived)) {
    return applyFlatWorkoutEditsToMetadata(o, flatFromForm);
  }

  if (derived.length > 0) {
    o.exercises = derived;
  } else {
    delete o.exercises;
  }

  return o as Json;
}
