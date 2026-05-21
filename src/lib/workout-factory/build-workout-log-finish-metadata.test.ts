import { describe, expect, it } from 'vitest';
import type { Json } from '@/types/database';
import { richMetadataWithBlockFormat } from '@/lib/workout-factory/__fixtures__/workout-session-view-model.fixtures';
import { buildWorkoutSessionViewModel } from '@/lib/workout-factory/workout-session-view-model';
import {
  WORKOUT_LOG_SCHEMA_VERSION,
  buildWorkoutLogExercisePayloadFromLogs,
  buildWorkoutLogFinishMetadata,
} from './build-workout-log-finish-metadata';

function finishParams(
  sourceMetadata: unknown,
  exercises: ReturnType<typeof buildWorkoutLogExercisePayloadFromLogs>,
  overrides?: Partial<{
    durationMin: number;
    sourceTaskId: string | null;
    classInstanceId: string | null;
    sessionVm: ReturnType<typeof buildWorkoutSessionViewModel>;
  }>,
) {
  const sessionVm =
    overrides?.sessionVm ?? buildWorkoutSessionViewModel((sourceMetadata ?? {}) as Json);
  return {
    sourceMetadata: sourceMetadata as Json,
    sessionVm,
    exercises,
    durationMin: overrides?.durationMin ?? 38,
    sourceTaskId:
      overrides && 'sourceTaskId' in overrides ? overrides.sourceTaskId! : 'task-source-1',
    classInstanceId:
      overrides && 'classInstanceId' in overrides ? overrides.classInstanceId! : null,
  };
}

describe('buildWorkoutLogFinishMetadata', () => {
  it('rich Tabata finish includes factory snapshot and set_logs', () => {
    const source = richMetadataWithBlockFormat('tabata');
    const vm = buildWorkoutSessionViewModel(source as Json);
    const exercises = buildWorkoutLogExercisePayloadFromLogs(vm.flatExercises, [
      Array.from({ length: 8 }, () => ({
        weight: '53',
        reps: '10',
        rpe: '8',
        done: true,
      })),
    ]);

    const meta = buildWorkoutLogFinishMetadata(finishParams(source, exercises)) as Record<
      string,
      unknown
    >;

    expect(meta.workout_log_schema_version).toBe(WORKOUT_LOG_SCHEMA_VERSION);
    expect(meta.source_task_id).toBe('task-source-1');
    expect(meta.duration_min).toBe(38);
    const af = meta.ai_workout_factory as Record<string, unknown>;
    expect(af?.workout_set).toBeTruthy();
    expect(af).toEqual((source as Record<string, unknown>).ai_workout_factory);
    const ex = meta.exercises as { set_logs: unknown[]; sets: number }[];
    expect(ex[0]?.sets).toBe(8);
    expect(ex[0]?.set_logs).toHaveLength(8);
  });

  it('flat-only source omits ai_workout_factory', () => {
    const source = {
      exercises: [{ name: 'Squat', sets: 3, reps: 10 }],
      workout_type: 'Strength',
    };
    const vm = buildWorkoutSessionViewModel(source as Json);
    const exercises = buildWorkoutLogExercisePayloadFromLogs(vm.flatExercises, [
      [{ weight: '100', reps: '8', rpe: '', done: true }],
    ]);

    const meta = buildWorkoutLogFinishMetadata(finishParams(source, exercises)) as Record<
      string,
      unknown
    >;

    expect(meta.workout_log_schema_version).toBe(1);
    expect(meta.ai_workout_factory).toBeUndefined();
    expect(Array.isArray(meta.exercises)).toBe(true);
  });

  it('deep-clone isolation: mutating result does not alter source', () => {
    const source = richMetadataWithBlockFormat('tabata');
    const vm = buildWorkoutSessionViewModel(source as Json);
    const exercises = buildWorkoutLogExercisePayloadFromLogs(vm.flatExercises, [[]]);

    const meta = buildWorkoutLogFinishMetadata(finishParams(source, exercises)) as Record<
      string,
      unknown
    >;
    const af = meta.ai_workout_factory as Record<string, unknown>;
    const ws = af.workout_set as Record<string, unknown>;
    ws.title = 'MUTATED';

    const sourceAf = (source as Record<string, unknown>).ai_workout_factory as Record<
      string,
      unknown
    >;
    const sourceWs = sourceAf.workout_set as Record<string, unknown>;
    expect(sourceWs.title).toBe('Test set');
  });

  it('AMRAP extra rounds: factory formatParams unchanged vs source', () => {
    const source = richMetadataWithBlockFormat('amrap');
    const vm = buildWorkoutSessionViewModel(source as Json);
    const exercises: ReturnType<typeof buildWorkoutLogExercisePayloadFromLogs> = [
      {
        name: vm.flatExercises[0]?.name ?? 'Goblet Squat',
        sets: 12,
        set_logs: Array.from({ length: 12 }, (_, i) => ({
          set: i + 1,
          reps: 10,
          done: true,
        })),
      },
    ];

    const meta = buildWorkoutLogFinishMetadata(finishParams(source, exercises)) as Record<
      string,
      unknown
    >;
    const sourceBlock = (
      (source as Record<string, unknown>).ai_workout_factory as {
        workout_set: { workouts: { exerciseBlocks: { formatParams: unknown }[] }[] };
      }
    ).workout_set.workouts[0].exerciseBlocks[0].formatParams;

    const resultBlock = (
      meta.ai_workout_factory as {
        workout_set: { workouts: { exerciseBlocks: { formatParams: unknown }[] }[] };
      }
    ).workout_set.workouts[0].exerciseBlocks[0].formatParams;

    expect(resultBlock).toEqual(sourceBlock);
    expect((meta.exercises as { set_logs: unknown[] }[])[0]?.set_logs).toHaveLength(12);
  });

  it('EMOM multi-set logs with factory attached', () => {
    const source = richMetadataWithBlockFormat('emom');
    const vm = buildWorkoutSessionViewModel(source as Json);
    const exercises = buildWorkoutLogExercisePayloadFromLogs(vm.flatExercises, [
      Array.from({ length: 16 }, () => ({
        weight: '',
        reps: '12',
        rpe: '',
        done: true,
      })),
    ]);

    const meta = buildWorkoutLogFinishMetadata(finishParams(source, exercises)) as Record<
      string,
      unknown
    >;

    expect(meta.ai_workout_factory).toBeTruthy();
    expect((meta.exercises as { set_logs: unknown[] }[])[0]?.set_logs).toHaveLength(16);
  });

  it('zero completed sets still attaches factory on rich source', () => {
    const source = richMetadataWithBlockFormat('tabata');
    const vm = buildWorkoutSessionViewModel(source as Json);
    const exercises = buildWorkoutLogExercisePayloadFromLogs(
      vm.flatExercises,
      vm.flatExercises.map(() => []),
    );

    const meta = buildWorkoutLogFinishMetadata(finishParams(source, exercises)) as Record<
      string,
      unknown
    >;

    expect(meta.ai_workout_factory).toBeTruthy();
    const ex = meta.exercises as { sets: number; set_logs: unknown[] }[];
    expect(ex.every((e) => e.sets === 0 && e.set_logs.length === 0)).toBe(true);
  });

  it('omits duration_min and source_task_id when not provided', () => {
    const source = richMetadataWithBlockFormat('tabata');
    const vm = buildWorkoutSessionViewModel(source as Json);
    const exercises = buildWorkoutLogExercisePayloadFromLogs(vm.flatExercises, [[]]);

    const meta = buildWorkoutLogFinishMetadata(
      finishParams(source, exercises, { durationMin: 0, sourceTaskId: null }),
    ) as Record<string, unknown>;

    expect(meta.duration_min).toBeUndefined();
    expect(meta.source_task_id).toBeUndefined();
  });

  it('includes class_instance_id when set', () => {
    const source = richMetadataWithBlockFormat('tabata');
    const vm = buildWorkoutSessionViewModel(source as Json);
    const exercises = buildWorkoutLogExercisePayloadFromLogs(vm.flatExercises, [[]]);

    const meta = buildWorkoutLogFinishMetadata(
      finishParams(source, exercises, { classInstanceId: 'class-abc' }),
    ) as Record<string, unknown>;

    expect(meta.class_instance_id).toBe('class-abc');
  });

  it('defensive: flat sessionVm with rich metadata does not attach factory', () => {
    const source = richMetadataWithBlockFormat('tabata');
    const flatVm = buildWorkoutSessionViewModel({
      exercises: [{ name: 'Squat', sets: 3, reps: 10 }],
    } as Json);
    const exercises = buildWorkoutLogExercisePayloadFromLogs(flatVm.flatExercises, [[]]);

    const meta = buildWorkoutLogFinishMetadata(
      finishParams(source, exercises, { sessionVm: flatVm }),
    ) as Record<string, unknown>;

    expect(meta.ai_workout_factory).toBeUndefined();
  });
});

describe('buildWorkoutLogExercisePayloadFromLogs', () => {
  it('includes only done sets and parses weight/reps/rpe', () => {
    const exercises = [{ name: 'Bench', sets: 3, reps: 8 as const }];
    const logs = [
      [
        { weight: '100', reps: '8', rpe: '7', done: true },
        { weight: '100', reps: '6', rpe: '', done: true },
        { weight: '', reps: '', rpe: '', done: false },
      ],
    ];

    const payload = buildWorkoutLogExercisePayloadFromLogs(exercises, logs);

    expect(payload).toHaveLength(1);
    expect(payload[0]?.sets).toBe(2);
    expect(payload[0]?.set_logs).toEqual([
      { set: 1, weight: 100, reps: 8, rpe: 7, done: true },
      { set: 2, weight: 100, reps: 6, done: true },
    ]);
  });
});
