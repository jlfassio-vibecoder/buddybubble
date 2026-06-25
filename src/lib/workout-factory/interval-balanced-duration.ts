/**
 * Interval balanced mode: preset-driven W/R per round; total main-block time from catalog.
 */

import type { KnownIntervalPresetId } from '@/lib/workout-factory/interval-timer/interval-preset-catalog';
import { getIntervalPresetDefinition } from '@/lib/workout-factory/interval-timer/interval-preset-catalog';
import type { IntervalBalancedPairingPattern } from '@/lib/workout-factory/types/ai-workout';
import { INTERVAL_PRESET_ROUND_BOUNDS } from '@/lib/workout-factory/interval-timer/interval-preset-catalog';

export const INTERVAL_BALANCED_DEFAULT_ROUNDS = 8;
export const INTERVAL_BALANCED_MIN_ROUNDS = INTERVAL_PRESET_ROUND_BOUNDS.tabata.min;
export const INTERVAL_BALANCED_MAX_ROUNDS = INTERVAL_PRESET_ROUND_BOUNDS.tabata.max;

/** Seconds for the main interval block (no warmup/cooldown). */
export function intervalBalancedMainBlockSeconds(
  presetId: KnownIntervalPresetId,
  roundCount: number,
): number {
  const preset = getIntervalPresetDefinition(presetId);
  return roundCount * preset.workSeconds + Math.max(0, roundCount - 1) * preset.restSeconds;
}

/**
 * Session duration in whole minutes for the main interval prescription (v1: no warmup/cooldown in factory).
 */
export function intervalBalancedSessionMinutes(
  presetId: KnownIntervalPresetId,
  roundCount: number,
): number {
  return Math.ceil(intervalBalancedMainBlockSeconds(presetId, roundCount) / 60);
}

export function intervalBalancedExerciseCount(pattern: IntervalBalancedPairingPattern): number {
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
export function intervalBalancedRoundsPerExercise(
  pattern: IntervalBalancedPairingPattern,
  roundCount: number,
): number {
  const n = intervalBalancedExerciseCount(pattern);
  return roundCount / n;
}

/** Snap round count into preset bounds and divisible by exercise count when pattern uses multiple exercises. */
export function snapIntervalRoundCountToPattern(
  presetId: KnownIntervalPresetId,
  pattern: IntervalBalancedPairingPattern,
  roundCount: number,
): number {
  const bounds = INTERVAL_PRESET_ROUND_BOUNDS[presetId];
  const n = intervalBalancedExerciseCount(pattern);
  let rc = Math.min(bounds.max, Math.max(bounds.min, roundCount));
  if (n <= 1) return rc;
  let x = Math.ceil(rc / n) * n;
  if (x > bounds.max) {
    x = Math.floor(bounds.max / n) * n;
  }
  if (x < bounds.min) {
    x = Math.ceil(bounds.min / n) * n;
  }
  return x;
}
