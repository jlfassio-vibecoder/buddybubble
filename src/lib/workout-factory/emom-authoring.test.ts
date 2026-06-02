import { describe, expect, it } from 'vitest';

import {
  deriveEmomLegacyParams,
  hydrateEmomAuthoringDraft,
  reconcileEmomStationsForExerciseCount,
  stationsFromAlternatingCycle,
} from '@/lib/workout-factory/emom-authoring';

describe('deriveEmomLegacyParams', () => {
  it('emits cycle length equal to stations.length, not total_minutes', () => {
    const stations = [
      {
        is_rest: false as const,
        exercise_index: 0,
        target_type: 'reps' as const,
        target_value: 10,
      },
      {
        is_rest: false as const,
        exercise_index: 1,
        target_type: 'reps' as const,
        target_value: 10,
      },
      {
        is_rest: false as const,
        exercise_index: 2,
        target_type: 'time' as const,
        target_value: 45,
      },
    ];
    const legacy = deriveEmomLegacyParams(stations, 12);
    expect(legacy.total_minutes).toBe(12);
    expect(legacy.interval_seconds).toBe(60);
    expect(legacy.is_alternating).toBe(true);
    expect(legacy.alternating_stations).toEqual([[0], [1], [2]]);
    expect(legacy.alternating_stations!.length).toBe(3);
  });

  it('falls back to non-alternating when rest is in the cycle', () => {
    const stations = [
      {
        is_rest: false as const,
        exercise_index: 0,
        target_type: 'reps' as const,
        target_value: null,
      },
      { is_rest: true as const },
      {
        is_rest: false as const,
        exercise_index: 1,
        target_type: 'reps' as const,
        target_value: null,
      },
    ];
    const legacy = deriveEmomLegacyParams(stations, 9);
    expect(legacy.is_alternating).toBe(false);
    expect(legacy.alternating_stations).toBeUndefined();
    expect(legacy.total_minutes).toBe(9);
  });
});

describe('reconcileEmomStationsForExerciseCount', () => {
  it('converts out-of-bounds work stations to rest', () => {
    const stations = [
      {
        is_rest: false as const,
        exercise_index: 0,
        target_type: 'reps' as const,
        target_value: 10,
      },
      { is_rest: false as const, exercise_index: 2, target_type: 'reps' as const, target_value: 8 },
      { is_rest: true as const },
    ];
    expect(reconcileEmomStationsForExerciseCount(stations, 2)).toEqual([
      { is_rest: false, exercise_index: 0, target_type: 'reps', target_value: 10 },
      { is_rest: true },
      { is_rest: true },
    ]);
  });

  it('maps all stations to rest when exercise count is zero', () => {
    const stations = [
      {
        is_rest: false as const,
        exercise_index: 0,
        target_type: 'reps' as const,
        target_value: null,
      },
    ];
    expect(reconcileEmomStationsForExerciseCount(stations, 0)).toEqual([{ is_rest: true }]);
  });
});

describe('hydrateEmomAuthoringDraft', () => {
  it('prefers rich stations over alternating_stations', () => {
    const draft = hydrateEmomAuthoringDraft(
      {
        total_minutes: 8,
        track_active_pacing: false,
        stations: [{ is_rest: true }],
        alternating_stations: [[0], [1]],
        is_alternating: true,
      },
      2,
    );
    expect(draft.stations).toEqual([{ is_rest: true }]);
    expect(draft.track_active_pacing).toBe(false);
    expect(draft.total_minutes).toBe(8);
  });

  it('reconstructs cycle from alternating_stations without expanding to total_minutes', () => {
    const cycle = [[0], [1], [2]] as const;
    const fromCycle = stationsFromAlternatingCycle(cycle);
    expect(fromCycle).toHaveLength(3);
    const draft = hydrateEmomAuthoringDraft(
      {
        total_minutes: 12,
        is_alternating: true,
        alternating_stations: cycle,
      },
      3,
    );
    expect(draft.stations).toHaveLength(3);
    expect(draft.total_minutes).toBe(12);
  });
});
