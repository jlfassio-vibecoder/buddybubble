import { describe, expect, it } from 'vitest';
import { buildWorkoutSessionViewModel } from './workout-session-view-model';
import { buildPlayerExerciseIndexLookup } from './workout-player-exercise-index';
import { richMetadataWithBlockFormat } from './__fixtures__/workout-session-view-model.fixtures';

describe('buildPlayerExerciseIndexLookup', () => {
  it('assigns contiguous global indices for main block exercises only', () => {
    const vm = buildWorkoutSessionViewModel(richMetadataWithBlockFormat('tabata'));
    const lookup = buildPlayerExerciseIndexLookup(vm.blocks);

    expect(lookup.length).toBe(vm.flatExercises.length);
    expect(lookup.map((e) => e.globalIndex)).toEqual(
      Array.from({ length: lookup.length }, (_, i) => i),
    );
  });

  it('excludes warmup and finisher sections from lookup', () => {
    const vm = buildWorkoutSessionViewModel(richMetadataWithBlockFormat('amrap'));
    const lookup = buildPlayerExerciseIndexLookup(vm.blocks);
    const mainBlocks = vm.blocks.filter((b) => b.section === 'main');
    const expectedCount = mainBlocks.reduce((n, b) => n + (b.exercises?.length ?? 0), 0);

    expect(lookup.length).toBe(expectedCount);
    expect(vm.blocks.some((b) => b.section === 'warmup')).toBe(true);
    expect(vm.blocks.some((b) => b.section === 'finisher')).toBe(true);
  });

  it('returns empty lookup when no main exercises', () => {
    const vm = buildWorkoutSessionViewModel({});
    expect(buildPlayerExerciseIndexLookup(vm.blocks)).toEqual([]);
  });
});
