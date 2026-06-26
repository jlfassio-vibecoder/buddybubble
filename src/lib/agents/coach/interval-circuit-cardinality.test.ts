import { describe, expect, it } from 'vitest';

import {
  genericIntervalCircuitPlaceholderName,
  looksLikeCompoundIntervalExerciseName,
  messageSegmentForBlockToken,
  parseExerciseCountFromBlockName,
  parseStatedExerciseCount,
  validateTabataCircuitCardinality,
} from './interval-circuit-cardinality';

describe('parseStatedExerciseCount', () => {
  it('parses digit exercise counts', () => {
    expect(parseStatedExerciseCount('Classic HIIT 30/30, 4 bodyweight exercises, 3 rounds')).toBe(
      4,
    );
    expect(parseStatedExerciseCount('3 movements in the finisher')).toBe(3);
    expect(parseStatedExerciseCount('use 2 stations')).toBe(2);
  });

  it('parses word exercise counts', () => {
    expect(parseStatedExerciseCount('four exercises in the circuit')).toBe(4);
  });

  it('returns null when count is absent', () => {
    expect(parseStatedExerciseCount('add a classic hiit finisher')).toBeNull();
  });
});

describe('messageSegmentForBlockToken', () => {
  it('scopes stated count to the block token segment', () => {
    const msg =
      'add :main/hiit/classic with 2 exercises #Squats add :finisher/hiit/classic with 4 exercises #Burpees ';
    const tokens = [':main/hiit/classic ', ':finisher/hiit/classic '];
    expect(parseStatedExerciseCount(messageSegmentForBlockToken(msg, tokens[0]!, tokens))).toBe(2);
    expect(parseStatedExerciseCount(messageSegmentForBlockToken(msg, tokens[1]!, tokens))).toBe(4);
  });
});

describe('validateTabataCircuitCardinality', () => {
  it('drops when block name encodes more exercises than emitted', () => {
    expect(validateTabataCircuitCardinality(1, { blockName: 'Main Circuit 4 exercises' })).toBe(
      'tabata_circuit_cardinality',
    );
  });

  it('drops compound single exercise when multi-station count requested', () => {
    expect(
      validateTabataCircuitCardinality(1, {
        requestedCount: 4,
        singleExerciseName: 'Burpees to Mountain Climbers',
      }),
    ).toBe('tabata_circuit_cardinality');
  });

  it('allows legitimate single-movement names with to/and when no multi-station count', () => {
    expect(validateTabataCircuitCardinality(1, { singleExerciseName: 'Toe to Bar' })).toBeNull();
    expect(
      validateTabataCircuitCardinality(1, { singleExerciseName: 'Clean and Jerk' }),
    ).toBeNull();
  });

  it('passes when exercise count matches stated count', () => {
    expect(validateTabataCircuitCardinality(4, { requestedCount: 4 })).toBeNull();
  });
});

describe('helpers', () => {
  it('detects compound interval names', () => {
    expect(looksLikeCompoundIntervalExerciseName('Burpees to Mountain Climbers')).toBe(true);
    expect(looksLikeCompoundIntervalExerciseName('Push-ups')).toBe(false);
  });

  it('parses exercise count from block name', () => {
    expect(parseExerciseCountFromBlockName('Finisher 4 exercises')).toBe(4);
  });

  it('builds generic placeholder labels', () => {
    expect(genericIntervalCircuitPlaceholderName(0)).toBe('Movement 1');
    expect(genericIntervalCircuitPlaceholderName(3)).toBe('Movement 4');
  });
});
