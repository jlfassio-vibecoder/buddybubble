import { beforeEach, describe, expect, it } from 'vitest';
import {
  getCachedPublishedExerciseDictionary,
  resetExerciseDictionaryCacheForTests,
} from '@/lib/exercise-dictionary-autocomplete-cache';

describe('exercise-dictionary-autocomplete-cache', () => {
  beforeEach(() => {
    resetExerciseDictionaryCacheForTests();
  });

  it('starts with no cached rows', () => {
    expect(getCachedPublishedExerciseDictionary()).toBeNull();
  });
});
