import type { WorkoutIntakeDurationChoice } from '@/lib/agents/coach/task-modal-intake-patch';

/** RPE-ceiling phase intent for macro-planning generation (Step 1). */
export const WORKOUT_GENERATION_PHASE_INTENT_OPTIONS = [
  'technical_baseline',
  'standard_progression',
  'aggressive_overload',
] as const;

export type WorkoutGenerationPhaseIntent = (typeof WORKOUT_GENERATION_PHASE_INTENT_OPTIONS)[number];

export const WORKOUT_GENERATION_PHASE_INTENT_LABELS: Record<WorkoutGenerationPhaseIntent, string> =
  {
    technical_baseline: 'Technical/Baseline (RPE 6-7)',
    standard_progression: 'Standard Progression (RPE 7-8)',
    aggressive_overload: 'Aggressive Overload (RPE 8-9+)',
  };

export function getWorkoutGenerationPhaseIntentLabel(intent: WorkoutGenerationPhaseIntent): string {
  return WORKOUT_GENERATION_PHASE_INTENT_LABELS[intent];
}

export const WORKOUT_GENERATION_PROGRESSION_TREND_OPTIONS = [
  'Feeling Easy',
  'Appropriately Challenging',
  'Hitting a Plateau',
] as const;

export type WorkoutGenerationProgressionTrend =
  (typeof WORKOUT_GENERATION_PROGRESSION_TREND_OPTIONS)[number];

export type WorkoutGenerationAnchorLift = {
  name: string;
  weight: number;
  reps: number;
};

export type WorkoutGenerationIntakeContext = {
  durationMinutes: WorkoutIntakeDurationChoice;
  phaseIntent: WorkoutGenerationPhaseIntent;
  progressionTrend: WorkoutGenerationProgressionTrend;
  anchorLift: WorkoutGenerationAnchorLift | null;
  temporaryLimitations: string | null;
};

export type BuildGenerationIntakeContextInput = {
  durationMinutes: WorkoutIntakeDurationChoice;
  phaseIntent: WorkoutGenerationPhaseIntent;
  progressionTrend: WorkoutGenerationProgressionTrend;
  anchorLiftName: string;
  anchorLiftWeight: number | null;
  anchorLiftReps: number | null;
  temporaryLimitations: string;
};

const PHASE_INTENT_SET = new Set<string>(
  WORKOUT_GENERATION_PHASE_INTENT_OPTIONS as unknown as string[],
);

const PROGRESSION_TREND_SET = new Set<string>(
  WORKOUT_GENERATION_PROGRESSION_TREND_OPTIONS as unknown as string[],
);

function clampPositiveInt(n: number | null | undefined): number | null {
  if (n == null || !Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  return rounded > 0 ? rounded : null;
}

function normalizeAnchorLift(
  name: string,
  weight: number | null,
  reps: number | null,
): WorkoutGenerationAnchorLift | null {
  const trimmedName = name.trim();
  const w = clampPositiveInt(weight);
  const r = clampPositiveInt(reps);
  if (!trimmedName || w == null || r == null) return null;
  return { name: trimmedName, weight: w, reps: r };
}

export function defaultGenerationIntakeValues(): {
  progressionTrend: WorkoutGenerationProgressionTrend;
  anchorLiftName: string;
  anchorLiftWeight: number | null;
  anchorLiftReps: number | null;
  temporaryLimitations: string;
} {
  return {
    progressionTrend: 'Appropriately Challenging',
    anchorLiftName: '',
    anchorLiftWeight: null,
    anchorLiftReps: null,
    temporaryLimitations: '',
  };
}

export function defaultGenerationPhaseIntent(): WorkoutGenerationPhaseIntent {
  return 'standard_progression';
}

export function buildGenerationIntakeContext(
  input: BuildGenerationIntakeContextInput,
): WorkoutGenerationIntakeContext {
  const phaseIntent = PHASE_INTENT_SET.has(input.phaseIntent)
    ? input.phaseIntent
    : defaultGenerationPhaseIntent();
  const progressionTrend = PROGRESSION_TREND_SET.has(input.progressionTrend)
    ? input.progressionTrend
    : 'Appropriately Challenging';
  const limitationsTrim = input.temporaryLimitations.trim();
  return {
    durationMinutes: input.durationMinutes,
    phaseIntent,
    progressionTrend,
    anchorLift: normalizeAnchorLift(
      input.anchorLiftName,
      input.anchorLiftWeight,
      input.anchorLiftReps,
    ),
    temporaryLimitations: limitationsTrim.length > 0 ? limitationsTrim : null,
  };
}

/** Snake_case payload for Factory `daily_checkin` and Coach live-state metadata. */
export function generationIntakeContextToDailyCheckin(
  ctx: WorkoutGenerationIntakeContext,
): Record<string, unknown> {
  const out: Record<string, unknown> = {
    duration_minutes: ctx.durationMinutes,
    phase_intent: ctx.phaseIntent,
    progression_trend: ctx.progressionTrend,
  };
  if (typeof ctx.durationMinutes === 'number') {
    out.target_duration_min = ctx.durationMinutes;
  }
  if (ctx.anchorLift) {
    out.anchor_lift = ctx.anchorLift;
  }
  if (ctx.temporaryLimitations) {
    out.temporary_limitations = ctx.temporaryLimitations;
  }
  return out;
}
