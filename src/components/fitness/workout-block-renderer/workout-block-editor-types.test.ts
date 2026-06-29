import { describe, expect, it } from 'vitest';
import { buildWorkoutSessionViewModel } from '@/lib/workout-factory/workout-session-view-model';
import {
  richAlternatingEmomMetadata,
  richMetadataWithBlockFormat,
} from '@/lib/workout-factory/__fixtures__/workout-session-view-model.fixtures';
import {
  addExerciseToBlock,
  createDefaultBlockExercise,
  removeExerciseFromBlock,
} from './workout-block-editor-types';

describe('workout-block-editor-types structural helpers', () => {
  it('createDefaultBlockExercise inherits sets/reps from previous sibling', () => {
    const vm = buildWorkoutSessionViewModel(richMetadataWithBlockFormat('tabata'));
    const main = vm.blocks.find((b) => b.section === 'main')!;
    const first = main.exercises[0]!;

    const created = createDefaultBlockExercise(main, main.exercises.length);

    expect(created.exerciseName).toBe('');
    expect(created.id).toBeTruthy();
    expect(created.sets).toBe(first.sets);
    expect(created.reps).toBe(first.reps);
  });

  it('addExerciseToBlock appends and renumbers order 1..n', () => {
    const vm = buildWorkoutSessionViewModel(richMetadataWithBlockFormat('tabata'));
    const main = vm.blocks.find((b) => b.section === 'main')!;
    const originalLength = main.exercises.length;

    const newEx = createDefaultBlockExercise(main, main.exercises.length);
    const next = addExerciseToBlock(vm.blocks, main.id, newEx);
    const mainNext = next.find((b) => b.id === main.id)!;

    expect(mainNext.exercises.length).toBe(originalLength + 1);
    expect(mainNext.exercises.map((e) => e.order)).toEqual(mainNext.exercises.map((_, i) => i + 1));
    expect(next).not.toBe(vm.blocks);
    expect(mainNext.exercises).not.toBe(main.exercises);
  });

  it('removeExerciseFromBlock splices and renumbers order 1..n', () => {
    const vm = buildWorkoutSessionViewModel(
      richAlternatingEmomMetadata({
        totalRounds: 12,
        cycle: [[0], [1], [2]],
      }),
    );
    const main = vm.blocks.find((b) => b.section === 'main')!;

    const next = removeExerciseFromBlock(vm.blocks, main.id, 1);
    const mainNext = next.find((b) => b.id === main.id)!;

    expect(mainNext.exercises.length).toBe(2);
    expect(mainNext.exercises.map((e) => e.exerciseName)).toEqual(['Deadlift', 'Air Squat']);
    expect(mainNext.exercises.map((e) => e.order)).toEqual([1, 2]);
  });
});
