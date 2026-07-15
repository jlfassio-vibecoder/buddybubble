/** Circuit rotation semantics for block_format tabata (multi-exercise intervals). */

/**
 * Total work segments for the timer FSM.
 * Multiplies circuit rounds by station count when exerciseCount > 1.
 */
export function resolveTabataWorkSegmentTotal(
  circuitRounds: number,
  exerciseCount: number,
): number {
  if (exerciseCount > 1) return circuitRounds * exerciseCount;
  return circuitRounds;
}

/** Live mechanics use 1-based round_index as work-segment index. */
export function deriveTabataActiveExerciseIndex(
  roundIndex: number,
  exerciseCount: number,
): number | null {
  if (roundIndex < 1 || exerciseCount <= 1) return null;
  return (roundIndex - 1) % exerciseCount;
}

/** Circuit-round set_number for logger rows (each exercise gets `circuitRounds` rows). */
export function deriveTabataCircuitRound(roundIndex: number, exerciseCount: number): number {
  if (exerciseCount <= 1) return roundIndex;
  return Math.floor((roundIndex - 1) / exerciseCount) + 1;
}

/**
 * 1-based finished work index: end of circuit pass when E > 1 and index % E === 0.
 * Live `round_index` and offline `roundIndex + 1` both use this 1-based convention.
 */
export function isTabataEndOfCircuitPass(
  finishedWorkIndex: number,
  exerciseCount: number,
): boolean {
  if (finishedWorkIndex < 1 || exerciseCount <= 1) return false;
  return finishedWorkIndex % exerciseCount === 0;
}

/** Station rest vs longer round rest after a finished work segment. */
export function resolveTabataRestDurationSeconds(args: {
  finishedWorkIndex: number;
  exerciseCount: number;
  restSeconds: number;
  roundRestSeconds: number;
}): number {
  const { finishedWorkIndex, exerciseCount, restSeconds, roundRestSeconds } = args;
  if (isTabataEndOfCircuitPass(finishedWorkIndex, exerciseCount) && roundRestSeconds > 0) {
    return roundRestSeconds;
  }
  return restSeconds;
}

/**
 * 0-based index into active_rest_exercises during a rest segment.
 * Unlike {@link deriveTabataActiveExerciseIndex}, count === 1 broadcasts index 0.
 */
export function deriveTabataActiveRestExerciseIndex(
  roundIndex: number,
  activeRestCount: number,
): number | null {
  if (roundIndex < 1 || activeRestCount < 1) return null;
  return (roundIndex - 1) % activeRestCount;
}

/** Resolved active-rest movement name for HUD; null when index/name unavailable. */
export function resolveTabataActiveRestExerciseName(
  roundIndex: number,
  activeRestExercises: readonly string[],
): string | null {
  const idx = deriveTabataActiveRestExerciseIndex(roundIndex, activeRestExercises.length);
  if (idx == null) return null;
  const name = activeRestExercises[idx]?.trim();
  return name || null;
}

/** Minimal exercise shape for work-station name resolution (compatible with WorkoutExercise). */
export type TabataExerciseNameSource = { name?: string | null };

/**
 * Work-station display name for a 1-based work-segment index.
 * Multi-exercise blank names fall back to `'Movement'`; single-exercise blank → null (HUD parity).
 */
export function resolveTabataWorkExerciseName(
  roundIndex: number,
  exercises: readonly TabataExerciseNameSource[],
): string | null {
  if (roundIndex < 1) return null;
  const exerciseCount = exercises.length;
  if (exerciseCount > 1) {
    const activeIndex = deriveTabataActiveExerciseIndex(roundIndex, exerciseCount);
    const exerciseName = activeIndex != null ? exercises[activeIndex]?.name?.trim() : '';
    return exerciseName || 'Movement';
  }
  if (exerciseCount === 1) {
    const name = exercises[0]?.name?.trim();
    return name || null;
  }
  return null;
}

/**
 * Next work-station name after a finished work segment (passive rest look-ahead).
 * `roundIndex` is the just-finished work segment; returns null when there is no next work.
 */
export function resolveTabataNextWorkExerciseName(
  roundIndex: number,
  totalRounds: number,
  exercises: readonly TabataExerciseNameSource[],
): string | null {
  // roundIndex is the just-finished work segment; invalid before first work.
  if (roundIndex < 1) return null;
  const next = roundIndex + 1;
  if (next > totalRounds) return null;
  return resolveTabataWorkExerciseName(next, exercises);
}
