import { describe, expect, it } from 'vitest';

import { matchExerciseNamesToDictionaryIds } from './useUserExerciseNotes';

describe('matchExerciseNamesToDictionaryIds', () => {
  it('matches names case-insensitively and preserves order', () => {
    const rows = [
      { id: 'a', name: 'Deadlift' },
      { id: 'b', name: 'Squat' },
    ];
    expect(matchExerciseNamesToDictionaryIds(['deadlift', 'SQUAT '], rows)).toEqual(['a', 'b']);
  });

  it('returns null when no dictionary row matches', () => {
    expect(
      matchExerciseNamesToDictionaryIds(['Custom Move'], [{ id: 'x', name: 'Other' }]),
    ).toEqual([null]);
  });

  it('uses first dictionary row per normalized name', () => {
    const rows = [
      { id: 'first', name: 'Bench' },
      { id: 'second', name: 'bench' },
    ];
    expect(matchExerciseNamesToDictionaryIds(['bench'], rows)).toEqual(['first']);
  });
});
