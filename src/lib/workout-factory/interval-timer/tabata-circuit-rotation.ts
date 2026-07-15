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
