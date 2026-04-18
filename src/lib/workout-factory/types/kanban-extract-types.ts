/**
 * DTOs for Kanban authoritative brief: Extract (Step A) + Enrich (Step B).
 */

export type KanbanBriefSection = 'warmup' | 'main' | 'cooldown';

/** One row from Step A (Extractor) — prescription only, no coaching prose. */
export interface KanbanExtractedExercise {
  order: number;
  section: KanbanBriefSection;
  exercise_name: string;
  sets?: number | null;
  reps?: string | null;
  equipment?: string | null;
  rest_seconds?: number | null;
  rpe?: number | null;
  work_seconds?: number | null;
  rounds?: number | null;
  /** Optional cue copied from the brief (one line). */
  brief_note?: string | null;
}

/** Strict JSON shape from Step A Vertex call. */
export interface KanbanExtractBriefOutput {
  workout_title?: string;
  workout_description?: string;
  exercises: KanbanExtractedExercise[];
}

/** One row from Step B (Enricher) — matches Step A by `order`. */
export interface KanbanEnrichedExercise {
  order: number;
  exercise_name: string;
  detailed_instructions?: string | string[];
  biomechanical_cues?: string | string[];
  injury_prevention_tips?: string | string[];
}

/** Strict JSON shape from Step B Vertex call. */
export interface KanbanEnrichBiomechanicsOutput {
  exercises: KanbanEnrichedExercise[];
}
