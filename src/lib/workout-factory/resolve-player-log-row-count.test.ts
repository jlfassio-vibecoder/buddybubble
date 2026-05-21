import { describe, expect, it } from 'vitest';
import { richMetadataWithBlockFormat } from './__fixtures__/workout-session-view-model.fixtures';
import { buildPlayerInitialLogs, resolvePlayerLogRowCount } from './resolve-player-log-row-count';
import { buildWorkoutSessionViewModel } from './workout-session-view-model';

describe('resolvePlayerLogRowCount', () => {
  it('uses formatParams.rounds for Tabata main block', () => {
    const vm = buildWorkoutSessionViewModel(richMetadataWithBlockFormat('tabata'));
    const main = vm.blocks.find((b) => b.section === 'main')!;
    const ex = vm.flatExercises[0]!;
    expect(ex.sets).toBe(1);
    expect(
      resolvePlayerLogRowCount(ex, { blockFormat: 'tabata', formatParams: main.formatParams }),
    ).toBe(8);
  });

  it('uses exercise.sets for straight_sets when block has no rounds param', () => {
    expect(
      resolvePlayerLogRowCount(
        { name: 'Squat', sets: 4, reps: 5 },
        { blockFormat: 'straight_sets', formatParams: {} },
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
      resolvePlayerLogRowCount(ex, { blockFormat: 'emom', formatParams: main.formatParams }),
    ).toBe(16);
  });

  it('uses formatParams.rounds for circuit', () => {
    expect(
      resolvePlayerLogRowCount(
        { name: 'A', sets: 1 },
        { blockFormat: 'circuit', formatParams: { rounds: 3 } },
      ),
    ).toBe(3);
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

  it('builds 4 rows for flat-only straight sets', () => {
    const vm = buildWorkoutSessionViewModel({
      exercises: [{ name: 'Deadlift', sets: 4, reps: 5 }],
    });
    const logs = buildPlayerInitialLogs(vm.flatExercises, vm.blocks);
    expect(logs[0]).toHaveLength(4);
  });
});
