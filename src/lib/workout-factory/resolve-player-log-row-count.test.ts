import { describe, expect, it } from 'vitest';
import {
  richAlternatingEmomMetadata,
  richMetadataWithBlockFormat,
} from './__fixtures__/workout-session-view-model.fixtures';
import {
  buildPlayerInitialLogs,
  expandExercisesForPlayerLogRows,
  resolvePlayerLogRowCount,
} from './resolve-player-log-row-count';
import { buildWorkoutSessionViewModel } from './workout-session-view-model';

describe('resolvePlayerLogRowCount', () => {
  it('uses formatParams.rounds for Tabata main block', () => {
    const vm = buildWorkoutSessionViewModel(richMetadataWithBlockFormat('tabata'));
    const main = vm.blocks.find((b) => b.section === 'main')!;
    const ex = vm.flatExercises[0]!;
    expect(ex.sets).toBe(1);
    expect(
      resolvePlayerLogRowCount(ex, {
        blockFormat: 'tabata',
        formatParams: main.formatParams,
        exerciseIndexInBlock: 0,
      }),
    ).toBe(8);
  });

  it('uses exercise.sets for straight_sets when block has no rounds param', () => {
    expect(
      resolvePlayerLogRowCount(
        { name: 'Squat', sets: 4, reps: 5 },
        { blockFormat: 'straight_sets', formatParams: {}, exerciseIndexInBlock: 0 },
      ),
    ).toBe(4);
  });

  it('falls back to max(1, sets ?? 3) with null block context', () => {
    expect(resolvePlayerLogRowCount({ name: 'Row' }, null)).toBe(3);
    expect(resolvePlayerLogRowCount({ name: 'Row', sets: 5 }, null)).toBe(5);
  });

  it('prefers exercise.rounds over sets when block context has no round-driven format', () => {
    expect(resolvePlayerLogRowCount({ name: 'Burpees', sets: 1, rounds: 8 }, null)).toBe(8);
  });

  it('uses total_minutes for EMOM main block', () => {
    const vm = buildWorkoutSessionViewModel(richMetadataWithBlockFormat('emom'));
    const main = vm.blocks.find((b) => b.section === 'main')!;
    const ex = vm.flatExercises[0]!;
    expect(
      resolvePlayerLogRowCount(ex, {
        blockFormat: 'emom',
        formatParams: main.formatParams,
        exerciseIndexInBlock: 0,
      }),
    ).toBe(16);
  });

  it('allocates uneven rows for alternating EMOM A/B/C', () => {
    const meta = richAlternatingEmomMetadata({
      totalRounds: 10,
      cycle: [[0], [1], [2]],
    });
    const vm = buildWorkoutSessionViewModel(meta);
    const main = vm.blocks.find((b) => b.section === 'main')!;
    const params = main.formatParams;
    expect(
      resolvePlayerLogRowCount(vm.flatExercises[0]!, {
        blockFormat: 'emom',
        formatParams: params,
        exerciseIndexInBlock: 0,
      }),
    ).toBe(4);
    expect(
      resolvePlayerLogRowCount(vm.flatExercises[1]!, {
        blockFormat: 'emom',
        formatParams: params,
        exerciseIndexInBlock: 1,
      }),
    ).toBe(3);
    expect(
      resolvePlayerLogRowCount(vm.flatExercises[2]!, {
        blockFormat: 'emom',
        formatParams: params,
        exerciseIndexInBlock: 2,
      }),
    ).toBe(3);
  });

  it('uses formatParams.rounds for circuit', () => {
    expect(
      resolvePlayerLogRowCount(
        { name: 'A', sets: 1 },
        { blockFormat: 'circuit', formatParams: { rounds: 3 }, exerciseIndexInBlock: 0 },
      ),
    ).toBe(3);
  });
});

describe('expandExercisesForPlayerLogRows', () => {
  it('sets exercise.sets to Tabata formatParams.rounds', () => {
    const vm = buildWorkoutSessionViewModel(richMetadataWithBlockFormat('tabata'));
    const expanded = expandExercisesForPlayerLogRows(vm.flatExercises, vm.blocks);
    expect(expanded).toHaveLength(vm.flatExercises.length);
    for (const ex of expanded) {
      expect(ex.sets).toBe(8);
    }
  });
});

describe('buildPlayerInitialLogs', () => {
  it('builds 8 rows per exercise for rich Tabata', () => {
    const vm = buildWorkoutSessionViewModel(richMetadataWithBlockFormat('tabata'));
    const logs = buildPlayerInitialLogs(vm.flatExercises, vm.blocks);
    expect(logs).toHaveLength(vm.flatExercises.length);
    for (const row of logs) {
      expect(row).toHaveLength(8);
    }
  });

  it('builds 16 rows per exercise for rich EMOM', () => {
    const vm = buildWorkoutSessionViewModel(richMetadataWithBlockFormat('emom'));
    const logs = buildPlayerInitialLogs(vm.flatExercises, vm.blocks);
    expect(logs).toHaveLength(vm.flatExercises.length);
    for (const row of logs) {
      expect(row).toHaveLength(16);
    }
  });

  it('builds uneven rows for alternating EMOM', () => {
    const vm = buildWorkoutSessionViewModel(
      richAlternatingEmomMetadata({ totalRounds: 10, cycle: [[0], [1], [2]] }),
    );
    const logs = buildPlayerInitialLogs(vm.flatExercises, vm.blocks);
    expect(logs.map((r) => r.length)).toEqual([4, 3, 3]);
  });

  it('builds 4 rows for flat-only straight sets', () => {
    const vm = buildWorkoutSessionViewModel({
      exercises: [{ name: 'Deadlift', sets: 4, reps: 5 }],
    });
    const logs = buildPlayerInitialLogs(vm.flatExercises, vm.blocks);
    expect(logs[0]).toHaveLength(4);
  });
});
