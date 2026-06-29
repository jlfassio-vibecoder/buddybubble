import { describe, expect, it } from 'vitest';
import { buildWorkoutSessionViewModel } from '@/lib/workout-factory/workout-session-view-model';
import {
  richAlternatingEmomMetadata,
  richMetadataWithBlockFormat,
} from '@/lib/workout-factory/__fixtures__/workout-session-view-model.fixtures';
import {
  addExerciseToBlock,
  appendInstructionBlock,
  appendMainBlock,
  createDefaultBlockExercise,
  createDefaultMainBlock,
  createInstructionBlock,
  removeExerciseFromBlock,
  removeInstructionBlockById,
  removeMainBlockById,
  reorderExercisesInBlock,
  splitExerciseInBlock,
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

  it('reorderExercisesInBlock moves exercise and renumbers order 1..n', () => {
    const vm = buildWorkoutSessionViewModel(
      richAlternatingEmomMetadata({
        totalRounds: 12,
        cycle: [[0], [1], [2]],
      }),
    );
    const main = vm.blocks.find((b) => b.section === 'main')!;

    const next = reorderExercisesInBlock(vm.blocks, main.id, 2, 0);
    const mainNext = next.find((b) => b.id === main.id)!;

    expect(mainNext.exercises.map((e) => e.exerciseName)).toEqual([
      'Air Squat',
      'Deadlift',
      'Push-up',
    ]);
    expect(mainNext.exercises.map((e) => e.order)).toEqual([1, 2, 3]);
    expect(next).not.toBe(vm.blocks);
    expect(mainNext.exercises).not.toBe(main.exercises);
  });

  it('reorderExercisesInBlock is no-op when indices unchanged', () => {
    const vm = buildWorkoutSessionViewModel(
      richAlternatingEmomMetadata({
        totalRounds: 12,
        cycle: [[0], [1], [2]],
      }),
    );
    const main = vm.blocks.find((b) => b.section === 'main')!;

    expect(reorderExercisesInBlock(vm.blocks, main.id, 1, 1)).toBe(vm.blocks);
  });

  it('createDefaultMainBlock returns straight_sets main block with one exercise', () => {
    const block = createDefaultMainBlock(1);

    expect(block.section).toBe('main');
    expect(block.blockFormat).toBe('straight_sets');
    expect(block.formatParams).toEqual({});
    expect(block.exercises).toHaveLength(1);
    expect(block.exercises[0]!.order).toBe(1);
    expect(block.id).toBeTruthy();
    expect(block.name).toBe('MAIN');
  });

  it('appendMainBlock appends immutably and renumbers main orders 1..n', () => {
    const vm = buildWorkoutSessionViewModel(richMetadataWithBlockFormat('tabata'));
    const warmup = vm.blocks.filter((b) => b.section === 'warmup');
    const newBlock = createDefaultMainBlock(99);

    const next = appendMainBlock(vm.blocks, newBlock);
    const mains = next.filter((b) => b.section === 'main').sort((a, b) => a.order - b.order);

    expect(mains).toHaveLength(2);
    expect(mains.map((b) => b.order)).toEqual([1, 2]);
    expect(next).not.toBe(vm.blocks);
    expect(next.filter((b) => b.section === 'warmup')).toEqual(warmup);
  });

  it('removeMainBlockById removes one main and renumbers remaining', () => {
    const vm = buildWorkoutSessionViewModel(richMetadataWithBlockFormat('tabata'));
    const withTwo = appendMainBlock(vm.blocks, createDefaultMainBlock(2));
    const toRemove = withTwo
      .filter((b) => b.section === 'main')
      .find((b) => b.blockFormat === 'straight_sets')!;

    const next = removeMainBlockById(withTwo, toRemove.id);
    const mains = next.filter((b) => b.section === 'main');

    expect(mains).toHaveLength(1);
    expect(mains[0]!.order).toBe(1);
    expect(next).not.toBe(withTwo);
  });

  it('removeMainBlockById is no-op when removing the last main block', () => {
    const vm = buildWorkoutSessionViewModel(richMetadataWithBlockFormat('tabata'));
    const main = vm.blocks.find((b) => b.section === 'main')!;

    expect(removeMainBlockById(vm.blocks, main.id)).toBe(vm.blocks);
  });

  it('splitExerciseInBlock replaces one row with multiple inherited rows', () => {
    const vm = buildWorkoutSessionViewModel(richMetadataWithBlockFormat('tabata'));
    const main = vm.blocks.find((b) => b.section === 'main')!;
    const source = main.exercises[0]!;

    const next = splitExerciseInBlock(vm.blocks, main.id, 0, ['Burpees', 'Squats']);
    const mainNext = next.find((b) => b.id === main.id)!;

    expect(mainNext.exercises).toHaveLength(2);
    expect(mainNext.exercises.map((e) => e.exerciseName)).toEqual(['Burpees', 'Squats']);
    expect(mainNext.exercises.map((e) => e.order)).toEqual([1, 2]);
    expect(mainNext.exercises[0]!.sets).toBe(source.sets);
    expect(mainNext.exercises[0]!.reps).toBe(source.reps);
    expect(next).not.toBe(vm.blocks);
  });

  it('splitExerciseInBlock is no-op for a single name', () => {
    const vm = buildWorkoutSessionViewModel(richMetadataWithBlockFormat('tabata'));
    const main = vm.blocks.find((b) => b.section === 'main')!;

    expect(splitExerciseInBlock(vm.blocks, main.id, 0, ['Burpees'])).toBe(vm.blocks);
  });

  it('createInstructionBlock returns empty instructions array', () => {
    const block = createInstructionBlock('warmup', 1);

    expect(block.section).toBe('warmup');
    expect(block.name).toBe('Warm-up');
    expect(block.instructions).toEqual([]);
    expect(block.exercises).toEqual([]);
  });

  it('appendInstructionBlock inserts warmup at start', () => {
    const vm = buildWorkoutSessionViewModel(richMetadataWithBlockFormat('tabata'));
    const withoutWarmup = vm.blocks.filter((b) => b.section !== 'warmup');

    const next = appendInstructionBlock(withoutWarmup, createInstructionBlock('warmup', 1));
    const warmups = next.filter((b) => b.section === 'warmup');

    expect(warmups).toHaveLength(1);
    expect(warmups[0]!.order).toBe(1);
    expect(next[0]!.section).toBe('warmup');
    expect(next).not.toBe(withoutWarmup);
  });

  it('appendInstructionBlock is no-op when section already exists', () => {
    const vm = buildWorkoutSessionViewModel(richMetadataWithBlockFormat('tabata'));

    expect(appendInstructionBlock(vm.blocks, createInstructionBlock('warmup', 1))).toBe(vm.blocks);
  });

  it('splitExerciseInBlock is no-op when cardinality would be invalid', () => {
    const vm = buildWorkoutSessionViewModel(richMetadataWithBlockFormat('superset'));
    const main = vm.blocks.find((b) => b.section === 'main')!;

    expect(splitExerciseInBlock(vm.blocks, main.id, 0, ['A', 'B', 'C'])).toBe(vm.blocks);
  });

  it('removeInstructionBlockById removes finisher section', () => {
    const vm = buildWorkoutSessionViewModel(richMetadataWithBlockFormat('tabata'));
    const finisher = vm.blocks.find((b) => b.section === 'finisher')!;

    const next = removeInstructionBlockById(vm.blocks, finisher.id);

    expect(next.some((b) => b.section === 'finisher')).toBe(false);
    expect(next.filter((b) => b.section === 'main')).toHaveLength(1);
    expect(next).not.toBe(vm.blocks);
  });
});
