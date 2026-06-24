import { describe, expect, it } from 'vitest';

import {
  buildTabataWorkSetRowValues,
  prescriptionNumbersFromExercise,
  shouldResetTabataWorkSetSyncRef,
  shouldSyncTabataWorkSet,
  tabataWorkSetSyncKey,
} from '@/features/live-video/wrappers/interval/mechanics/tabata-work-set-sync';
import { buildInitialTabataMechanicsState } from '@/features/live-video/wrappers/interval/mechanics/tabata-mechanics-state';
import type { WorkoutExercise } from '@/lib/item-metadata';

const CONFIG = { totalRounds: 8, workSeconds: 20, restSeconds: 10 };

function workState(roundIndex: number, anchor = '2026-06-01T18:30:12.000Z') {
  return {
    ...buildInitialTabataMechanicsState(CONFIG),
    segment: 'work' as const,
    round_index: roundIndex,
    segment_started_at: anchor,
  };
}

describe('shouldSyncTabataWorkSet', () => {
  it('returns true for anchored work segment', () => {
    expect(shouldSyncTabataWorkSet(workState(1))).toBe(true);
  });

  it('returns false for rest segment', () => {
    const state = {
      ...workState(1),
      segment: 'rest' as const,
    };
    expect(shouldSyncTabataWorkSet(state)).toBe(false);
  });

  it('returns false when paused', () => {
    expect(shouldSyncTabataWorkSet({ ...workState(1), is_paused: true })).toBe(false);
  });

  it('returns false without segment anchor', () => {
    expect(shouldSyncTabataWorkSet({ ...workState(1), segment_started_at: null })).toBe(false);
  });
});

describe('tabataWorkSetSyncKey', () => {
  it('builds stable dedup key from round and anchor', () => {
    const state = workState(3);
    expect(tabataWorkSetSyncKey(state)).toBe('3:2026-06-01T18:30:12.000Z');
    expect(tabataWorkSetSyncKey(state)).toBe(tabataWorkSetSyncKey(state));
  });

  it('returns null when sync should not run', () => {
    expect(tabataWorkSetSyncKey(buildInitialTabataMechanicsState(CONFIG))).toBeNull();
  });
});

describe('shouldResetTabataWorkSetSyncRef', () => {
  it('resets on idle and pre-start setup', () => {
    expect(shouldResetTabataWorkSetSyncRef(buildInitialTabataMechanicsState(CONFIG))).toBe(true);
    expect(
      shouldResetTabataWorkSetSyncRef({
        ...buildInitialTabataMechanicsState(CONFIG),
        segment: 'idle',
      }),
    ).toBe(true);
  });

  it('does not reset during active work', () => {
    expect(shouldResetTabataWorkSetSyncRef(workState(2))).toBe(false);
  });
});

describe('buildTabataWorkSetRowValues', () => {
  const squat: WorkoutExercise = { name: 'Squat', sets: 8, reps: 10, weight: 135 };

  it('uses prescription for round 1', () => {
    const values = buildTabataWorkSetRowValues(squat, 1, []);
    expect(values).toEqual({ weightLbs: 135, reps: 10, rpe: null });
  });

  it('copies from prior set when present', () => {
    const values = buildTabataWorkSetRowValues(squat, 2, [
      {
        exercise_name: 'Squat',
        set_number: 1,
        weight_lbs: 140,
        reps: 12,
        rpe: 8,
      } as never,
    ]);
    expect(values).toEqual({ weightLbs: 140, reps: 12, rpe: 8 });
  });

  it('set_number equals round_index via caller contract', () => {
    const state = workState(3);
    expect(state.round_index).toBe(3);
    const values = buildTabataWorkSetRowValues(squat, state.round_index, []);
    expect(values?.reps).toBe(10);
  });

  it('returns null when prescription has no loggable fields', () => {
    const empty: WorkoutExercise = { name: 'Air Squat', sets: 8 };
    expect(prescriptionNumbersFromExercise(empty)).toEqual({
      weightLbs: null,
      reps: null,
      rpe: null,
    });
    expect(buildTabataWorkSetRowValues(empty, 1, [])).toBeNull();
  });
});
