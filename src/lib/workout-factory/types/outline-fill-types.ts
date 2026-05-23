/**
 * Vertex Stage 1 (parametric outline fill) I/O — snake_case to match Coach outline blocks.
 */

export interface OutlineFillExercise {
  name: string;
  sets?: number | null;
  reps?: string | null;
  equipment?: string | null;
  work_seconds?: number | null;
  rest_seconds?: number | null;
  rounds?: number | null;
  rpe?: number | null;
  coach_notes?: string | null;
}

export interface OutlineFillBlock {
  name?: string;
  block_format?: string;
  format_params?: Record<string, unknown>;
  instructions?: string[];
  exercises?: OutlineFillExercise[];
}

export interface OutlineFillOutput {
  blocks: OutlineFillBlock[];
}
