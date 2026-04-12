/**
 * Balanced Tabata mode: classic 20s work / 10s rest per interval; total main-block time = roundCount × 30s.
 */

import type { TabataBalancedPairingPattern } from '@/lib/workout-factory/types/ai-workout';

export const TABATA_BALANCED_WORK_SECONDS = 20;
export const TABATA_BALANCED_REST_SECONDS = 10;

export const TABATA_BALANCED_DEFAULT_ROUNDS = 8;
export const TABATA_BALANCED_MIN_ROUNDS = 4;
export const TABATA_BALANCED_MAX_ROUNDS = 12;

/** Seconds for the main Tabata block (no warmup/cooldown). */
export function tabataBalancedMainBlockSeconds(roundCount: number): number {
  return roundCount * (TABATA_BALANCED_WORK_SECONDS + TABATA_BALANCED_REST_SECONDS);
}

/**
 * Session duration in whole minutes for the main Tabata prescription (v1: no warmup/cooldown in factory).
 */
export function tabataBalancedSessionMinutes(roundCount: number): number {
  return Math.ceil(tabataBalancedMainBlockSeconds(roundCount) / 60);
}

export function tabataBalancedExerciseCount(pattern: TabataBalancedPairingPattern): number {
  switch (pattern) {
    case 'single':
      return 1;
    case 'antagonist_pair':
    case 'agonist_pair':
      return 2;
    case 'four_station':
      return 4;
    case 'eight_station':
      return 8;
    default:
      return 1;
  }
}

/**
 * Rounds per exercise in the main block (even split across exercises).
 */
export function tabataBalancedRoundsPerExercise(
  pattern: TabataBalancedPairingPattern,
  roundCount: number,
): number {
  const n = tabataBalancedExerciseCount(pattern);
  return roundCount / n;
}

/** Snap round count into [min,max] and divisible by exercise count when pattern uses multiple exercises. */
export function snapTabataRoundCountToPattern(
  pattern: TabataBalancedPairingPattern,
  roundCount: number,
): number {
  const n = tabataBalancedExerciseCount(pattern);
  let rc = Math.min(TABATA_BALANCED_MAX_ROUNDS, Math.max(TABATA_BALANCED_MIN_ROUNDS, roundCount));
  if (n <= 1) return rc;
  let x = Math.ceil(rc / n) * n;
  if (x > TABATA_BALANCED_MAX_ROUNDS) {
    x = Math.floor(TABATA_BALANCED_MAX_ROUNDS / n) * n;
  }
  if (x < TABATA_BALANCED_MIN_ROUNDS) {
    x = Math.ceil(TABATA_BALANCED_MIN_ROUNDS / n) * n;
  }
  return x;
}
