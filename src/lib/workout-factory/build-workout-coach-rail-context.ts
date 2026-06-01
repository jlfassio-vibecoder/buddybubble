import { parseTaskMetadata } from '@/lib/item-metadata';
import { buildEmomAlternatingCoachGuide } from '@/lib/workout-factory/build-emom-alternating-coach-guide';
import { formatRichWorkoutStripSummary } from '@/lib/workout-factory/format-block-summary-line';
import { buildWorkoutSessionViewModel } from '@/lib/workout-factory/workout-session-view-model';
import { hasRichWorkoutSetInMetadata } from '@/lib/workout-factory/sync-workout-metadata';
import type { Json } from '@/types/database';

/** Validates live grid row counts against flat exercise list length (WorkoutPlayer M6.2). */
export function validateLiveSetCounts(
  liveSetCounts: number[] | undefined,
  exerciseCount: number,
): number[] | null {
  if (liveSetCounts == null || exerciseCount === 0) return null;
  if (liveSetCounts.length !== exerciseCount) return null;
  for (const n of liveSetCounts) {
    if (!Number.isInteger(n) || n < 1) return null;
  }
  return liveSetCounts;
}

/**
 * Coach rail / WorkoutPlayer sentinel context: flat `exercises` for legacy parsers plus
 * block structure summary and factory when rich metadata exists.
 */
export function buildWorkoutCoachRailContext(
  metadata: unknown,
  title: string,
  liveSetCounts?: number[],
  options?: { includeFactoryBlob?: boolean },
): Record<string, unknown> {
  const includeFactoryBlob = options?.includeFactoryBlob !== false;
  const vm = buildWorkoutSessionViewModel(metadata ?? {});
  const parsed = parseTaskMetadata(metadata) as Record<string, unknown>;
  const taskTitle = title.trim() || 'this workout';

  const out: Record<string, unknown> = {
    exercises: vm.flatExercises,
    workout_task_title: taskTitle,
  };

  const validatedCounts = validateLiveSetCounts(liveSetCounts, vm.flatExercises.length);
  if (validatedCounts != null) {
    out.live_set_counts = validatedCounts;
  }

  if (typeof parsed.workout_type === 'string' && parsed.workout_type.trim()) {
    out.workout_type = parsed.workout_type.trim();
  }
  if (
    typeof parsed.duration_min === 'number' &&
    Number.isFinite(parsed.duration_min) &&
    parsed.duration_min > 0
  ) {
    out.duration_min = Math.round(parsed.duration_min);
  }

  if (vm.source === 'rich' && vm.blocks.length > 0) {
    const summary = formatRichWorkoutStripSummary(vm.blocks, {
      maxBlocks: 4,
      flatExercises: vm.flatExercises,
      maxFlatExercises: 4,
    });
    if (summary) {
      out.workout_structure_summary = summary;
    }
    if (includeFactoryBlob && hasRichWorkoutSetInMetadata(metadata)) {
      const af = parsed.ai_workout_factory;
      if (af != null && typeof af === 'object' && !Array.isArray(af)) {
        out.ai_workout_factory = af;
      }
    }
  }

  const emomGuide = buildEmomAlternatingCoachGuide(vm.blocks, vm.flatExercises);
  if (emomGuide != null) {
    out.emom_alternating_guide = emomGuide;
  }

  return out;
}

/** Exercise names for `#` picker when `workoutData` is structured context or legacy shapes. */
export function exerciseNamesFromCoachWorkoutData(workoutData: unknown): string[] {
  if (workoutData == null) return [];
  if (Array.isArray(workoutData)) {
    return workoutData
      .map((row) => {
        if (row && typeof row === 'object' && !Array.isArray(row)) {
          const name = (row as { name?: unknown }).name;
          return typeof name === 'string' ? name.trim() : '';
        }
        return '';
      })
      .filter(Boolean);
  }
  if (typeof workoutData === 'object' && !Array.isArray(workoutData)) {
    const o = workoutData as Record<string, unknown>;
    if (Array.isArray(o.exercises)) {
      return o.exercises
        .map((row) => {
          if (row && typeof row === 'object' && !Array.isArray(row)) {
            const name = (row as { name?: unknown }).name;
            return typeof name === 'string' ? name.trim() : '';
          }
          return '';
        })
        .filter(Boolean);
    }
  }
  return [];
}

/** Normalize `workoutData` prop to structured coach context for sentinel + hash picker. */
export function normalizeCoachWorkoutDataProp(
  workoutData: Json | undefined,
  metadata: unknown,
  title: string,
): Record<string, unknown> {
  if (metadata != null && hasRichWorkoutSetInMetadata(metadata)) {
    return buildWorkoutCoachRailContext(metadata, title);
  }
  if (workoutData != null && typeof workoutData === 'object' && !Array.isArray(workoutData)) {
    const o = workoutData as Record<string, unknown>;
    if (Array.isArray(o.exercises) || o.workout_structure_summary != null || o.ai_workout_factory) {
      return {
        ...o,
        workout_task_title:
          typeof o.workout_task_title === 'string' && o.workout_task_title.trim()
            ? o.workout_task_title.trim()
            : title.trim() || 'this workout',
      };
    }
  }
  if (Array.isArray(workoutData) && workoutData.length > 0) {
    return buildWorkoutCoachRailContext({ exercises: workoutData }, title);
  }
  if (metadata != null) {
    return buildWorkoutCoachRailContext(metadata, title);
  }
  return buildWorkoutCoachRailContext({}, title);
}
