import { describe, expect, it } from 'vitest';
import { EXERCISE_INDEX_MAP_HEADER, formatExerciseIndexMap } from './prompts';

describe('formatExerciseIndexMap', () => {
  it('returns null for invalid or non-object JSON', () => {
    expect(formatExerciseIndexMap('')).toBeNull();
    expect(formatExerciseIndexMap('not json')).toBeNull();
    expect(formatExerciseIndexMap('[]')).toBeNull();
    expect(formatExerciseIndexMap('{"exercises":[]}')).toBeNull();
  });

  it('emits one line per exercise index with names or (unnamed)', () => {
    const json = JSON.stringify({
      exercises: [{ name: 'Leg Swings' }, { name: 'Kettlebell Goblet Squat' }, {}],
    });
    const out = formatExerciseIndexMap(json);
    expect(out).toContain(EXERCISE_INDEX_MAP_HEADER);
    expect(out).toContain('0: Leg Swings');
    expect(out).toContain('1: Kettlebell Goblet Squat');
    expect(out).toContain('2: (unnamed)');
  });
});
