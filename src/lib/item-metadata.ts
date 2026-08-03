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
import {
  parseMemoryMomentReactions,
  serializeMemoryMomentReactions,
  type MemoryMomentReaction,
} from '@/lib/memory-moment-reactions';

export { parseTaskMetadata } from '@/lib/parse-task-metadata';
export type { MemoryMomentReaction } from '@/lib/memory-moment-reactions';

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
  /** Optional display-only PR flag on a logged exercise (no detection this pass). */
  pr?: boolean;
};

/** Single day within a program week. */
export type ProgramDay = {
  /** 1–7, where 1 = Monday. */
  day: number;
  name: string;
  workout_type?: string;
  duration_min?: number;
  /** Optional linked workout task id (handoff `card_ref`). */
  card_ref?: string;
};

/** One week's schedule within a fitness program. A single-entry schedule array
 *  is treated as a repeating template for all `duration_weeks`. */
export type ProgramWeek = {
  /** 1-indexed week number. */
  week: number;
  /** Optional week focus label (handoff `focus`). */
  focus?: string;
  days: ProgramDay[];
};

const MANAGED_METADATA_KEYS = [
  'location',
  'url',
  'bring',
  'going',
  'capacity',
  'going_people',
  /** Event: end wall time (`metadata.ends`, YYYY-MM-DDTHH:mm). */
  'ends',
  'season',
  'end_date',
  'highlights',
  'includes',
  'good_for',
  'price',
  'group_min',
  'group_max',
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
  /** Idea: denormalized interest vote count (`metadata.votes`). */
  'votes',
  /** Idea: user ids who voted (`metadata.voted_by`). */
  'voted_by',
  /** Idea: effort / impact / tags (Phase K schemas gap). */
  'effort',
  'impact',
  'tags',
  /** Event: cost display string (`metadata.cost`). */
  'cost',
  /** Workout: target session RPE 1–10 (`metadata.target_rpe`). */
  'target_rpe',
  /** Workout log: session RPE / completion % / mood. */
  'session_rpe',
  'completion',
  'mood',
  /** Program: days per week + level. */
  'days_per_week',
  'level',
  /** Memory: tagged people labels (`metadata.people`). */
  'people',
  /** Memory: linked event title/id (`metadata.linked_event`). */
  'linked_event',
  /** Memory: moment reaction pills (`metadata.reactions`). */
  'reactions',
] as const;

export type TaskMetadataFormFields = {
  eventLocation: string;
  eventUrl: string;
  /** Event: what-to-bring tags (`metadata.bring`). */
  eventBring: string[];
  /** Event: going count as string for number input (`metadata.going`). */
  eventGoing: string;
  /** Event: optional capacity (`metadata.capacity`). */
  eventCapacity: string;
  /** Event: people labels/initials for avatar stack (`metadata.going_people`). */
  eventGoingPeople: string[];
  /** Event: cost display string (`metadata.cost`). */
  eventCost: string;
  /** Event: end datetime wall time (`metadata.ends`, YYYY-MM-DDTHH:mm). */
  eventEnds: string;
  experienceSeason: string;
  /** YYYY-MM-DD; experience span end (start is `scheduled_on`). */
  experienceEndDate: string;
  /** Experience: highlight bullets (`metadata.highlights`). */
  experienceHighlights: string[];
  /** Experience: includes list (`metadata.includes`). */
  experienceIncludes: string[];
  /** Experience: good-for tags (`metadata.good_for`). */
  experienceGoodFor: string[];
  /** Experience: location (`metadata.location`); separate from event form state. */
  experienceLocation: string;
  /** Experience: duration minutes (`metadata.duration_min`); separate from workout form state. */
  experienceDurationMin: string;
  /** Experience: price display string (`metadata.price`). */
  experiencePrice: string;
  /** Experience: group size min (`metadata.group_min`). */
  experienceGroupMin: string;
  /** Experience: group size max (`metadata.group_max`). */
  experienceGroupMax: string;
  memoryCaption: string;
  /** Memory: tagged people labels (`metadata.people`). */
  memoryPeople: string[];
  /** Memory: linked event title or id (`metadata.linked_event`). */
  memoryLinkedEvent: string;
  /** Memory: optional place string (`metadata.location`). */
  memoryLocation: string;
  /** Memory: moment reactions (`metadata.reactions`). */
  memoryReactions: MemoryMomentReaction[];
  /** Workout / workout_log: free-text type (e.g. "Strength", "Cardio"). */
  workoutType: string;
  /** Workout duration in whole minutes. */
  workoutDurationMin: string;
  /** Workout: target RPE 1–10 (`metadata.target_rpe`). */
  workoutTargetRpe: string;
  /** Workout log: session RPE 1–10 (`metadata.session_rpe`). */
  workoutLogSessionRpe: string;
  /** Workout log: completion 0–100 (`metadata.completion`). */
  workoutLogCompletion: string;
  /** Workout log: mood emoji/string (`metadata.mood`). */
  workoutLogMood: string;
  /** Ordered list of exercises with sets/reps/weight/duration. */
  workoutExercises: WorkoutExercise[];
  /** Program: stated goal (e.g. "Build lean muscle"). */
  programGoal: string;
  /** Program: total length as a string for number input. */
  programDurationWeeks: string;
  /** Program: days per week (`metadata.days_per_week`). */
  programDaysPerWeek: string;
  /** Program: level beginner|intermediate|advanced (`metadata.level`). */
  programLevel: string;
  /** Program: which week the user is currently on (0 = not started). */
  programCurrentWeek: number;
  /** Program: weekly workout schedule. */
  programSchedule: ProgramWeek[];
  /** Program: host capacity (`metadata.capacity`). */
  programCapacity: string;
  /** Program: original template title before AI suffix (metadata `program_source_title`). */
  programSourceTitle: string;
  /** Storage path for optional card cover image (all item types). */
  cardCoverPath: string;
  /** Idea: interest vote count (`metadata.votes`). */
  ideaVotes: number;
  /** Idea: user ids who voted (`metadata.voted_by`). */
  ideaVotedBy: string[];
  /** Idea: effort Low|Medium|High (`metadata.effort`). */
  ideaEffort: string;
  /** Idea: impact Low|Medium|High (`metadata.impact`). */
  ideaImpact: string;
  /** Idea: tags (`metadata.tags`). */
  ideaTags: string[];
};

/** Normalize a string[] metadata field (trim, drop empties). */
export function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

/** Normalize stored `schedule` JSON into `ProgramWeek[]` (for API + forms). */
export function asProgramSchedule(value: unknown): ProgramWeek[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((w): ProgramWeek[] => {
    if (typeof w !== 'object' || w === null) return [];
    const week = (w as { week?: unknown }).week;
    const days = (w as { days?: unknown }).days;
    if (!Number.isFinite(week) || !Array.isArray(days)) return [];
    const focusRaw = (w as { focus?: unknown }).focus;
    const focus = typeof focusRaw === 'string' && focusRaw.trim() ? focusRaw.trim() : undefined;
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
      const cardRefRaw = (d as { card_ref?: unknown }).card_ref;
      const cardRef =
        typeof cardRefRaw === 'string' && cardRefRaw.trim() ? cardRefRaw.trim() : undefined;
      return [
        {
          day: day as number,
          name,
          ...(typeof workoutType === 'string' ? { workout_type: workoutType } : {}),
          ...(Number.isFinite(durationMin) ? { duration_min: durationMin as number } : {}),
          ...(cardRef ? { card_ref: cardRef } : {}),
        },
      ];
    });
    return [
      {
        week: week as number,
        days: cleanedDays,
        ...(focus ? { focus } : {}),
      },
    ];
  });
}

/** Append the next week to a program schedule (copy previous days when present). */
export function appendProgramWeek(schedule: ProgramWeek[]): ProgramWeek[] {
  const sorted = [...schedule].sort((a, b) => a.week - b.week);
  const maxWeek = sorted.reduce((m, w) => Math.max(m, w.week), 0);
  const prev = sorted[sorted.length - 1];
  const nextWeek = maxWeek + 1;
  const days = (prev?.days ?? []).map((d) => {
    const { card_ref: _c, ...rest } = d;
    void _c;
    return { ...rest };
  });
  return [...schedule, { week: nextWeek, days, ...(prev?.focus ? { focus: '' } : {}) }];
}

/**
 * Stamp `card_ref` onto schedule days whose name matches a linked workout title
 * (case-insensitive). Prefer existing card_ref when already set.
 */
export function stampProgramScheduleCardRefs(
  schedule: ProgramWeek[],
  linked: { id: string; title: string }[],
): ProgramWeek[] {
  if (!linked.length) return schedule;
  const byTitle = new Map<string, string>();
  for (const row of linked) {
    const key = row.title.trim().toLowerCase();
    if (key && !byTitle.has(key)) byTitle.set(key, row.id);
  }
  return schedule.map((w) => ({
    ...w,
    days: (w.days ?? []).map((d) => {
      if (d.card_ref?.trim()) return d;
      const id = byTitle.get(d.name.trim().toLowerCase());
      return id ? { ...d, card_ref: id } : d;
    }),
  }));
}

/** Normalize idea effort/impact to Low|Medium|High (empty if unknown). */
export function normalizeIdeaLevel(value: unknown): string {
  if (typeof value !== 'string') return '';
  const t = value.trim().toLowerCase();
  if (t === 'low') return 'Low';
  if (t === 'medium') return 'Medium';
  if (t === 'high') return 'High';
  return '';
}

/** Normalize program level to beginner|intermediate|advanced. */
export function normalizeProgramLevel(value: unknown): string {
  if (typeof value !== 'string') return '';
  const t = value.trim().toLowerCase();
  if (t === 'beginner' || t === 'intermediate' || t === 'advanced') return t;
  return '';
}

/** Normalize event `ends` to `YYYY-MM-DDTHH:mm` (empty when unset/invalid). */
export function normalizeEventEnds(value: unknown): string {
  if (typeof value !== 'string') return '';
  const s = value.trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(s)) return s.slice(0, 16);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s}T00:00`;
  return '';
}

/** Split `metadata.ends` into date + time inputs. */
export function splitEventEnds(ends: string): { date: string; time: string } {
  const n = normalizeEventEnds(ends);
  if (!n) return { date: '', time: '' };
  const [date = '', time = ''] = n.split('T');
  return { date, time: time.slice(0, 5) };
}

/** Combine Schedule Ends date/time into managed `ends` string. */
export function combineEventEnds(date: string, time: string): string {
  const d = date.trim().slice(0, 10);
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return '';
  const t = (time.trim() || '00:00').slice(0, 5);
  if (!/^\d{2}:\d{2}$/.test(t)) return `${d}T00:00`;
  return `${d}T${t}`;
}

/**
 * Soft validation: true when both start (columns) and ends are set and ends ≤ start.
 * Empty ends never fails.
 */
export function isEventEndsBeforeOrEqualStart(
  scheduledOn: string,
  scheduledTime: string,
  eventEnds: string,
): boolean {
  const on = scheduledOn.trim().slice(0, 10);
  const ends = normalizeEventEnds(eventEnds);
  if (!on || !ends) return false;
  const start = combineEventEnds(on, scheduledTime);
  if (!start) return false;
  return ends <= start;
}

/** Empty form fields (all managed keys cleared). */
export function emptyTaskMetadataFormFields(): TaskMetadataFormFields {
  return metadataFieldsFromParsed({});
}

/** Read string inputs from saved metadata (for TaskModal local state). */
export function metadataFieldsFromParsed(meta: unknown): TaskMetadataFormFields {
  const o = parseTaskMetadata(meta) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const endRaw = str(o.end_date);
  const numStr = (v: unknown) =>
    v != null && Number.isFinite(Number(v)) ? String(Math.floor(Number(v))) : '';
  return {
    eventLocation: str(o.location),
    eventUrl: str(o.url),
    eventBring: asStringList(o.bring),
    eventGoing: o.going != null && Number.isFinite(Number(o.going)) ? String(o.going) : '',
    eventCapacity:
      o.capacity != null && Number.isFinite(Number(o.capacity)) ? String(o.capacity) : '',
    eventGoingPeople: asStringList(o.going_people),
    eventCost: str(o.cost),
    eventEnds: normalizeEventEnds(o.ends),
    experienceSeason: str(o.season),
    experienceEndDate: endRaw.length >= 10 ? endRaw.slice(0, 10) : endRaw,
    experienceHighlights: asStringList(o.highlights),
    experienceIncludes: asStringList(o.includes),
    experienceGoodFor: asStringList(o.good_for),
    experienceLocation: str(o.location),
    experienceDurationMin: o.duration_min != null ? String(o.duration_min) : '',
    experiencePrice: str(o.price),
    experienceGroupMin:
      o.group_min != null && Number.isFinite(Number(o.group_min)) ? String(o.group_min) : '',
    experienceGroupMax:
      o.group_max != null && Number.isFinite(Number(o.group_max)) ? String(o.group_max) : '',
    memoryCaption: str(o.caption),
    memoryPeople: asStringList(o.people),
    memoryLinkedEvent: str(o.linked_event),
    memoryLocation: str(o.location),
    memoryReactions: parseMemoryMomentReactions(o.reactions),
    workoutType: str(o.workout_type),
    workoutDurationMin: o.duration_min != null ? String(o.duration_min) : '',
    workoutTargetRpe: numStr(o.target_rpe),
    workoutLogSessionRpe: numStr(o.session_rpe),
    workoutLogCompletion: (() => {
      const fromCompletion = numStr(o.completion);
      if (fromCompletion) return fromCompletion;
      return numStr(o.completion_pct);
    })(),
    workoutLogMood: str(o.mood),
    workoutExercises: parseWorkoutExercisesFromMetadata(meta),
    programGoal: str(o.goal),
    programDurationWeeks: o.duration_weeks != null ? String(o.duration_weeks) : '',
    programDaysPerWeek: numStr(o.days_per_week),
    programLevel: normalizeProgramLevel(o.level),
    programCurrentWeek: typeof o.current_week === 'number' ? o.current_week : 0,
    programSchedule: asProgramSchedule(o.schedule),
    programCapacity:
      o.capacity != null && Number.isFinite(Number(o.capacity)) ? String(o.capacity) : '',
    programSourceTitle: str(o.program_source_title),
    cardCoverPath: str(o.card_cover_path),
    ideaVotedBy: asStringList(o.voted_by),
    ideaVotes: (() => {
      const votedBy = asStringList(o.voted_by);
      const raw =
        o.votes != null && Number.isFinite(Number(o.votes)) && Number(o.votes) >= 0
          ? Math.floor(Number(o.votes))
          : 0;
      return votedBy.length > 0 ? Math.max(raw, votedBy.length) : raw;
    })(),
    ideaEffort: normalizeIdeaLevel(o.effort),
    ideaImpact: normalizeIdeaLevel(o.impact),
    ideaTags: asStringList(o.tags),
  };
}

/**
 * Merge type-specific fields into metadata; strips managed keys first so switching `item_type`
 * does not leave stale keys. Preserves unmanaged keys on the base object.
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
    case 'idea': {
      if (fields.ideaVotedBy.length > 0) o.voted_by = fields.ideaVotedBy;
      if (fields.ideaVotes > 0) o.votes = fields.ideaVotes;
      const effort = normalizeIdeaLevel(fields.ideaEffort);
      if (effort) o.effort = effort;
      const impact = normalizeIdeaLevel(fields.ideaImpact);
      if (impact) o.impact = impact;
      if (fields.ideaTags.length > 0) o.tags = fields.ideaTags;
      break;
    }
    case 'event': {
      if (t(fields.eventLocation)) o.location = t(fields.eventLocation);
      if (t(fields.eventUrl)) o.url = t(fields.eventUrl);
      if (fields.eventBring.length > 0) o.bring = fields.eventBring;
      const goingN = parseInt(fields.eventGoing, 10);
      if (!isNaN(goingN) && goingN >= 0) o.going = goingN;
      const capN = parseInt(fields.eventCapacity, 10);
      if (!isNaN(capN) && capN > 0) o.capacity = capN;
      if (fields.eventGoingPeople.length > 0) o.going_people = fields.eventGoingPeople;
      if (t(fields.eventCost)) o.cost = t(fields.eventCost);
      const ends = normalizeEventEnds(fields.eventEnds);
      if (ends) o.ends = ends;
      break;
    }
    case 'experience': {
      if (t(fields.experienceSeason)) o.season = t(fields.experienceSeason);
      if (t(fields.experienceEndDate)) o.end_date = t(fields.experienceEndDate).slice(0, 10);
      if (fields.experienceHighlights.length > 0) o.highlights = fields.experienceHighlights;
      if (fields.experienceIncludes.length > 0) o.includes = fields.experienceIncludes;
      if (fields.experienceGoodFor.length > 0) o.good_for = fields.experienceGoodFor;
      if (t(fields.experienceLocation)) o.location = t(fields.experienceLocation);
      const expMins = parseInt(fields.experienceDurationMin, 10);
      if (!isNaN(expMins) && expMins > 0) o.duration_min = expMins;
      if (t(fields.experiencePrice)) o.price = t(fields.experiencePrice);
      const gMin = parseInt(fields.experienceGroupMin, 10);
      if (!isNaN(gMin) && gMin > 0) o.group_min = gMin;
      const gMax = parseInt(fields.experienceGroupMax, 10);
      if (!isNaN(gMax) && gMax > 0) o.group_max = gMax;
      break;
    }
    case 'memory': {
      if (t(fields.memoryCaption)) o.caption = t(fields.memoryCaption);
      if (fields.memoryPeople.length > 0) o.people = fields.memoryPeople;
      if (t(fields.memoryLinkedEvent)) o.linked_event = t(fields.memoryLinkedEvent);
      if (t(fields.memoryLocation)) o.location = t(fields.memoryLocation);
      const reactions = serializeMemoryMomentReactions(fields.memoryReactions);
      if (reactions.length > 0) o.reactions = reactions;
      break;
    }
    case 'workout':
    case 'workout_log': {
      delete o.linked_program_task_id;
      delete o.program_session_key;
      if (t(fields.workoutType)) o.workout_type = t(fields.workoutType);
      const mins = parseInt(fields.workoutDurationMin, 10);
      if (!isNaN(mins) && mins > 0) o.duration_min = mins;
      if (fields.workoutExercises.length > 0) o.exercises = fields.workoutExercises;
      if (itemType === 'workout') {
        const rpe = parseInt(fields.workoutTargetRpe, 10);
        if (!isNaN(rpe) && rpe >= 1 && rpe <= 10) o.target_rpe = rpe;
      }
      if (itemType === 'workout_log') {
        delete o.completion_pct;
        const sessionRpe = parseInt(fields.workoutLogSessionRpe, 10);
        if (!isNaN(sessionRpe) && sessionRpe >= 1 && sessionRpe <= 10) {
          o.session_rpe = sessionRpe;
        }
        const completion = parseInt(fields.workoutLogCompletion, 10);
        if (!isNaN(completion) && completion >= 0 && completion <= 100) {
          o.completion = completion;
        }
        if (t(fields.workoutLogMood)) o.mood = t(fields.workoutLogMood);
      }
      break;
    }
    case 'program': {
      if (t(fields.programGoal)) o.goal = t(fields.programGoal);
      const dw = parseInt(fields.programDurationWeeks, 10);
      if (!isNaN(dw) && dw > 0) o.duration_weeks = dw;
      const dpw = parseInt(fields.programDaysPerWeek, 10);
      if (!isNaN(dpw) && dpw > 0) o.days_per_week = dpw;
      const level = normalizeProgramLevel(fields.programLevel);
      if (level) o.level = level;
      if (fields.programCurrentWeek > 0) o.current_week = fields.programCurrentWeek;
      const capN = parseInt(fields.programCapacity, 10);
      if (!isNaN(capN) && capN > 0) o.capacity = capN;
      if (fields.programSchedule.length > 0) {
        o.schedule = fields.programSchedule.map((w) => {
          const focus = typeof w.focus === 'string' ? w.focus.trim() : '';
          return {
            week: w.week,
            ...(focus ? { focus } : {}),
            days: (w.days ?? []).map((d) => {
              const cardRef = typeof d.card_ref === 'string' ? d.card_ref.trim() : '';
              return {
                day: d.day,
                name: d.name,
                ...(d.workout_type ? { workout_type: d.workout_type } : {}),
                ...(typeof d.duration_min === 'number' && Number.isFinite(d.duration_min)
                  ? { duration_min: d.duration_min }
                  : {}),
                ...(cardRef ? { card_ref: cardRef } : {}),
              };
            }),
          };
        });
      }
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
