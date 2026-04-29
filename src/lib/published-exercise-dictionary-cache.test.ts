import { beforeEach, describe, expect, it } from 'vitest';
import {
  getCachedPublishedExerciseDictionary,
  resetExerciseDictionaryCacheForTests,
} from '@/lib/published-exercise-dictionary-cache';

describe('published-exercise-dictionary-cache', () => {
  beforeEach(() => {
    resetExerciseDictionaryCacheForTests();
  });

  it('starts with no cached rows', () => {
    expect(getCachedPublishedExerciseDictionary()).toBeNull();
  });
});
