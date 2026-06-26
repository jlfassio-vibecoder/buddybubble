/** Circuit rotation semantics for block_format tabata (multi-exercise intervals). */

export function resolveTabataExerciseCount(exerciseCount: number): number {
  return exerciseCount > 0 ? exerciseCount : 1;
}

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
