import { describe, expect, it } from 'vitest';

import {
  createSessionDeckSnapshot,
  mergeWorkoutExercisesIntoTaskMetadata,
} from '@/features/live-video/shells/huddle/session-deck-snapshot';
import {
  FORMAT_PARAMS_BY_BLOCK,
  richMetadataWithBlockFormat,
} from '@/lib/workout-factory/__fixtures__/workout-session-view-model.fixtures';
import { buildWorkoutSessionViewModel } from '@/lib/workout-factory/workout-session-view-model';
import { findEmomMainBlock } from '@/lib/workout-factory/patch-emom-block-metadata';
import type { TaskRow } from '@/types/database';

function emomTask(): TaskRow {
  return {
    id: 'task-1',
    title: 'EMOM',
    metadata: richMetadataWithBlockFormat('emom'),
    item_type: 'workout',
  } as unknown as TaskRow;
}

describe('mergeWorkoutExercisesIntoTaskMetadata EMOM guard', () => {
  it('preserves emom blockFormat and formatParams when editing flat exercises', () => {
    const base = richMetadataWithBlockFormat('emom') as Record<string, unknown>;
    const af = base.ai_workout_factory as Record<string, unknown>;
    const ws = af.workout_set as Record<string, unknown>;
    const workouts = ws.workouts as Record<string, unknown>[];
    const blocks = (workouts[0].exerciseBlocks as Record<string, unknown>[])[0];
    blocks.formatParams = {
      interval_seconds: 60,
      total_minutes: 12,
      track_active_pacing: true,
      stations: [
        { is_rest: false, exercise_index: 0, target_type: 'reps', target_value: 10 },
        { is_rest: true },
      ],
      is_alternating: false,
    };

    const task = { ...emomTask(), metadata: base } as TaskRow;
    const snap = createSessionDeckSnapshot(task);

    const nextMeta = mergeWorkoutExercisesIntoTaskMetadata(snap.task, [
      { name: 'Goblet Squat', sets: 1, reps: 12 },
      { name: 'Push Press', sets: 1, reps: 8 },
    ]);

    const vm = buildWorkoutSessionViewModel(nextMeta);
    const emom = findEmomMainBlock(vm.blocks);
    expect(emom?.blockFormat).toBe('emom');
    expect(emom?.formatParams.total_minutes).toBe(12);
    expect(emom?.formatParams.stations).toHaveLength(2);
    expect(emom?.exercises).toHaveLength(2);
    expect(emom?.exercises[0]?.exerciseName).toBe('Goblet Squat');
  });

  it('reconciles station indices when flat exercises are removed', () => {
    const base = richMetadataWithBlockFormat('emom') as Record<string, unknown>;
    const af = base.ai_workout_factory as Record<string, unknown>;
    const ws = af.workout_set as Record<string, unknown>;
    const workouts = ws.workouts as Record<string, unknown>[];
    const blocks = (workouts[0].exerciseBlocks as Record<string, unknown>[])[0];
    blocks.formatParams = {
      interval_seconds: 60,
      total_minutes: 12,
      stations: [
        { is_rest: false, exercise_index: 0, target_type: 'reps', target_value: 10 },
        { is_rest: false, exercise_index: 2, target_type: 'reps', target_value: 8 },
      ],
      is_alternating: true,
      alternating_stations: [[0], [2]],
    };

    const task = { ...emomTask(), metadata: base } as TaskRow;
    const snap = createSessionDeckSnapshot(task);

    const nextMeta = mergeWorkoutExercisesIntoTaskMetadata(snap.task, [
      { name: 'Goblet Squat', sets: 1, reps: 12 },
      { name: 'Push Press', sets: 1, reps: 8 },
    ]);

    const vm = buildWorkoutSessionViewModel(nextMeta);
    const emom = findEmomMainBlock(vm.blocks);
    const stations = emom?.formatParams.stations as { is_rest: boolean; exercise_index?: number }[];
    expect(stations).toHaveLength(2);
    expect(stations[1].is_rest).toBe(true);
    expect(stations[1].exercise_index).toBeUndefined();
  });

  it('partitions flat edits across main blocks without duplicating into EMOM', () => {
    const base = richMetadataWithBlockFormat('straight_sets') as Record<string, unknown>;
    const af = base.ai_workout_factory as Record<string, unknown>;
    const ws = af.workout_set as Record<string, unknown>;
    const workouts = ws.workouts as Record<string, unknown>[];
    workouts[0].exerciseBlocks = [
      {
        order: 1,
        name: 'Strength',
        blockFormat: 'straight_sets',
        formatParams: {},
        exercises: [{ order: 1, exerciseName: 'Squat', sets: 3, reps: '5' }],
      },
      {
        order: 2,
        name: 'Finisher',
        blockFormat: 'emom',
        formatParams: FORMAT_PARAMS_BY_BLOCK.emom,
        exercises: [
          { order: 1, exerciseName: 'Burpee', sets: 1, reps: '10' },
          { order: 2, exerciseName: 'Row', sets: 1, reps: '12' },
        ],
      },
    ];

    const task = { ...emomTask(), metadata: base } as TaskRow;
    const snap = createSessionDeckSnapshot(task);

    const nextMeta = mergeWorkoutExercisesIntoTaskMetadata(snap.task, [
      { name: 'Back Squat', sets: 3, reps: '5' },
      { name: 'Burpee', sets: 1, reps: '10' },
      { name: 'Row erg', sets: 1, reps: '12' },
    ]);

    const vm = buildWorkoutSessionViewModel(nextMeta);
    const strength = vm.blocks.find((b) => b.name === 'Strength');
    const emom = findEmomMainBlock(vm.blocks);
    expect(strength?.exercises).toHaveLength(1);
    expect(strength?.exercises[0]?.exerciseName).toBe('Back Squat');
    expect(emom?.exercises).toHaveLength(2);
    expect(emom?.exercises.map((e) => e.exerciseName)).toEqual(['Burpee', 'Row erg']);
    expect(vm.flatExercises).toHaveLength(3);
    expect(vm.flatExercises.map((e) => e.name)).toEqual(['Back Squat', 'Burpee', 'Row erg']);
  });

  it('finds EMOM in a non-main-named exercise block (e.g. Finisher)', () => {
    const base = richMetadataWithBlockFormat('straight_sets') as Record<string, unknown>;
    const af = base.ai_workout_factory as Record<string, unknown>;
    const ws = af.workout_set as Record<string, unknown>;
    const workouts = ws.workouts as Record<string, unknown>[];
    workouts[0].exerciseBlocks = [
      {
        order: 1,
        name: 'Strength',
        blockFormat: 'straight_sets',
        formatParams: {},
        exercises: [{ order: 1, exerciseName: 'Squat', sets: 3, reps: '5' }],
      },
      {
        order: 2,
        name: 'Finisher',
        blockFormat: 'emom',
        formatParams: FORMAT_PARAMS_BY_BLOCK.emom,
        exercises: [
          { order: 1, exerciseName: 'Burpee', sets: 1, reps: '10' },
          { order: 2, exerciseName: 'Row', sets: 1, reps: '12' },
        ],
      },
    ];

    const vm = buildWorkoutSessionViewModel(base);
    const emom = findEmomMainBlock(vm.blocks);
    expect(emom?.name).toBe('Finisher');
    expect(emom?.blockFormat).toBe('emom');
  });

  it('still collapses non-EMOM rich cards to straight_sets on flat edit', () => {
    const task = {
      ...emomTask(),
      metadata: richMetadataWithBlockFormat('tabata'),
      item_type: 'workout',
    } as TaskRow;
    const snap = createSessionDeckSnapshot(task);
    const nextMeta = mergeWorkoutExercisesIntoTaskMetadata(snap.task, [
      { name: 'Burpee', sets: 1, reps: 10 },
    ]);
    const vm = buildWorkoutSessionViewModel(nextMeta);
    const main = vm.blocks.find((b) => b.section === 'main');
    expect(main?.blockFormat).toBe('straight_sets');
  });
});
