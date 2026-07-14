/**
 * Shared JSON surface for pasted / handoff workouts (hub ↔ main app APIs).
 * Exercise / block shapes align with `apps/app` `@/types/ai-program` so normalization
 * (`normalizeWorkoutSet`) and `ProgramWorkout` stay type-compatible.
 */

export interface Exercise {
  order: number;
  exerciseName: string;
  exerciseQuery?: string;
  sets: number;
  reps: string;
  rpe?: number;
  restSeconds?: number;
  /** Per-exercise coaching prose (M5 SoT); projected to flat `metadata.exercises`. */
  instructions?: string;
  formCues?: string;
  tips?: string;
  injuryPreventionTips?: string;
  coachNotes?: string;
  id?: string;
  workSeconds?: number;
  rounds?: number;
}

export interface ExerciseBlock {
  order?: number;
  name?: string;
  exercises: Exercise[];
  id?: string;
  /** Parametric blueprint key written by Coach merge (Phase 11.2). */
  blockFormat?: string;
  /** Format-specific params (snake_case keys, e.g. time_cap_minutes). */
  formatParams?: Record<string, unknown>;
}

export interface WarmupBlock {
  order: number;
  exerciseName: string;
  instructions: string[];
  exerciseQuery?: string;
  /** Stable id for round-trips (editor / server change tracking); optional for legacy data. */
  id?: string;
}

export interface WorkoutInSet {
  title: string;
  description: string;
  warmupBlocks?: WarmupBlock[];
  blocks?: Exercise[];
  exerciseBlocks?: ExerciseBlock[];
  finisherBlocks?: WarmupBlock[];
  cooldownBlocks?: WarmupBlock[];
}

export interface WorkoutSetTemplate {
  title: string;
  description: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  workouts: WorkoutInSet[];
}
