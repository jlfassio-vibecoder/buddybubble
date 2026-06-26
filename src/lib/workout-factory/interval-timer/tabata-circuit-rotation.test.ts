import { describe, expect, it } from 'vitest';

import {
  deriveTabataActiveExerciseIndex,
  deriveTabataCircuitRound,
  resolveTabataExerciseCount,
  resolveTabataWorkSegmentTotal,
} from './tabata-circuit-rotation';

describe('resolveTabataExerciseCount', () => {
  it('returns count when positive', () => {
    expect(resolveTabataExerciseCount(4)).toBe(4);
    expect(resolveTabataExerciseCount(1)).toBe(1);
  });

  it('falls back to 1 when empty', () => {
    expect(resolveTabataExerciseCount(0)).toBe(1);
  });
});

describe('resolveTabataWorkSegmentTotal', () => {
  it('multiplies circuit rounds by exercise count when N > 1', () => {
    expect(resolveTabataWorkSegmentTotal(3, 4)).toBe(12);
  });

  it('returns circuit rounds for single exercise', () => {
    expect(resolveTabataWorkSegmentTotal(8, 1)).toBe(8);
  });

  it('does not multiply when exercise array is empty', () => {
    expect(resolveTabataWorkSegmentTotal(3, 0)).toBe(3);
  });
});

describe('deriveTabataActiveExerciseIndex', () => {
  it('returns null for single exercise or pre-start', () => {
    expect(deriveTabataActiveExerciseIndex(1, 1)).toBeNull();
    expect(deriveTabataActiveExerciseIndex(0, 4)).toBeNull();
  });

  it('rotates A→B→C→D for 4-exercise circuit', () => {
    expect(deriveTabataActiveExerciseIndex(1, 4)).toBe(0);
    expect(deriveTabataActiveExerciseIndex(2, 4)).toBe(1);
    expect(deriveTabataActiveExerciseIndex(4, 4)).toBe(3);
    expect(deriveTabataActiveExerciseIndex(5, 4)).toBe(0);
  });
});

describe('deriveTabataCircuitRound', () => {
  it('returns round_index for single exercise', () => {
    expect(deriveTabataCircuitRound(3, 1)).toBe(3);
  });

  it('maps work segments to circuit round for multi-exercise', () => {
    expect(deriveTabataCircuitRound(1, 4)).toBe(1);
    expect(deriveTabataCircuitRound(4, 4)).toBe(1);
    expect(deriveTabataCircuitRound(5, 4)).toBe(2);
    expect(deriveTabataCircuitRound(12, 4)).toBe(3);
  });
});
