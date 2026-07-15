import { describe, expect, it } from 'vitest';

import {
  deriveTabataActiveExerciseIndex,
  deriveTabataActiveRestExerciseIndex,
  deriveTabataCircuitRound,
  resolveTabataActiveRestExerciseName,
  resolveTabataNextWorkExerciseName,
  resolveTabataWorkExerciseName,
  resolveTabataWorkSegmentTotal,
} from './tabata-circuit-rotation';

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

describe('deriveTabataActiveRestExerciseIndex', () => {
  it('returns null for pre-start or empty list', () => {
    expect(deriveTabataActiveRestExerciseIndex(0, 2)).toBeNull();
    expect(deriveTabataActiveRestExerciseIndex(1, 0)).toBeNull();
  });

  it('broadcasts index 0 when count is 1', () => {
    expect(deriveTabataActiveRestExerciseIndex(1, 1)).toBe(0);
    expect(deriveTabataActiveRestExerciseIndex(5, 1)).toBe(0);
  });

  it('rotates through multiple active-rest names', () => {
    expect(deriveTabataActiveRestExerciseIndex(1, 2)).toBe(0);
    expect(deriveTabataActiveRestExerciseIndex(2, 2)).toBe(1);
    expect(deriveTabataActiveRestExerciseIndex(3, 2)).toBe(0);
    expect(deriveTabataActiveRestExerciseIndex(4, 2)).toBe(1);
  });
});

describe('resolveTabataActiveRestExerciseName', () => {
  it('broadcasts a single name for all rounds', () => {
    expect(resolveTabataActiveRestExerciseName(1, ['Jogging'])).toBe('Jogging');
    expect(resolveTabataActiveRestExerciseName(4, ['Jogging'])).toBe('Jogging');
  });

  it('rotates multi-name lists', () => {
    expect(resolveTabataActiveRestExerciseName(1, ['Jog', 'March'])).toBe('Jog');
    expect(resolveTabataActiveRestExerciseName(2, ['Jog', 'March'])).toBe('March');
    expect(resolveTabataActiveRestExerciseName(3, ['Jog', 'March'])).toBe('Jog');
  });

  it('returns null for empty list or pre-start', () => {
    expect(resolveTabataActiveRestExerciseName(1, [])).toBeNull();
    expect(resolveTabataActiveRestExerciseName(0, ['Jogging'])).toBeNull();
  });
});

describe('resolveTabataWorkExerciseName', () => {
  it('rotates multi-exercise stations and falls back to Movement for blank names', () => {
    expect(resolveTabataWorkExerciseName(1, [{ name: 'Burpees' }, { name: 'Push-ups' }])).toBe(
      'Burpees',
    );
    expect(resolveTabataWorkExerciseName(2, [{ name: 'Burpees' }, { name: 'Push-ups' }])).toBe(
      'Push-ups',
    );
    expect(resolveTabataWorkExerciseName(1, [{ name: '' }, { name: 'B' }])).toBe('Movement');
  });

  it('returns single-exercise name or null when blank', () => {
    expect(resolveTabataWorkExerciseName(1, [{ name: 'Squat' }])).toBe('Squat');
    expect(resolveTabataWorkExerciseName(1, [{ name: '  ' }])).toBeNull();
  });

  it('returns null for pre-start or empty list', () => {
    expect(resolveTabataWorkExerciseName(0, [{ name: 'A' }, { name: 'B' }])).toBeNull();
    expect(resolveTabataWorkExerciseName(1, [])).toBeNull();
  });
});

describe('resolveTabataNextWorkExerciseName', () => {
  it('looks ahead to the next station after rest following work 1 of 4', () => {
    expect(resolveTabataNextWorkExerciseName(1, 4, [{ name: 'A' }, { name: 'B' }])).toBe('B');
  });

  it('returns null on the last rest before done', () => {
    expect(resolveTabataNextWorkExerciseName(4, 4, [{ name: 'A' }, { name: 'B' }])).toBeNull();
  });

  it('resolves single-exercise next name', () => {
    expect(resolveTabataNextWorkExerciseName(1, 8, [{ name: 'Squat' }])).toBe('Squat');
  });

  it('returns null for roundIndex 0 or negative', () => {
    expect(resolveTabataNextWorkExerciseName(0, 4, [{ name: 'A' }, { name: 'B' }])).toBeNull();
    expect(resolveTabataNextWorkExerciseName(-1, 4, [{ name: 'A' }, { name: 'B' }])).toBeNull();
  });

  it('uses Movement for blank multi-station next name', () => {
    expect(resolveTabataNextWorkExerciseName(1, 4, [{ name: 'A' }, { name: '  ' }])).toBe(
      'Movement',
    );
  });
});
