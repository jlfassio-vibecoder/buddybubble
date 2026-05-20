import { describe, expect, it } from 'vitest';
import {
  applyBlockEditsToMetadata,
  applyFlatWorkoutEditsToMetadata,
  deriveFlatExercisesFromMetadata,
  flatExercisesMatchDerived,
  hasRichWorkoutSetInMetadata,
} from './sync-workout-metadata';
import { buildWorkoutSessionViewModel } from './workout-session-view-model';
import { richMetadataWithBlockFormat } from './__fixtures__/workout-session-view-model.fixtures';
import type { TaskMetadataFormFields } from '@/lib/item-metadata';
import { buildTaskMetadataPayload, finalizeWorkoutMetadataForSave } from '@/lib/item-metadata';

function richBaseFixture() {
  return {
    workout_type: 'Strength',
    duration_min: 45,
    exercises: [{ name: 'Legacy flat', sets: 1, reps: '5' }],
    ai_workout_factory: {
      generated_at: '2026-01-01T00:00:00Z',
      model: 'gemini-test',
      chain_metadata: { foo: 1 },
      workout_set: {
        title: 'Set title',
        description: 'Set desc',
        difficulty: 'intermediate',
        workouts: [
          {
            title: 'Session',
            description: 'Session desc',
            exerciseBlocks: [
              {
                name: 'MAIN',
                blockFormat: 'tabata',
                formatParams: { rounds: 8, work_seconds: 20, rest_seconds: 10 },
                exercises: [
                  {
                    order: 1,
                    exerciseName: 'Kettlebell Sumo Deadlift',
                    sets: 3,
                    reps: '15',
                    rpe: 8,
                    restSeconds: 60,
                  },
                ],
              },
            ],
            cooldownBlocks: [
              {
                order: 1,
                exerciseName: 'Deep Squat Hold',
                instructions: ['Static stretch for hip openers.'],
              },
            ],
          },
        ],
      },
    },
  };
}

describe('hasRichWorkoutSetInMetadata', () => {
  it('returns true when workouts array is non-empty', () => {
    expect(hasRichWorkoutSetInMetadata(richBaseFixture())).toBe(true);
  });

  it('returns false for flat-only metadata', () => {
    expect(hasRichWorkoutSetInMetadata({ exercises: [{ name: 'Squat', sets: 3, reps: 5 }] })).toBe(
      false,
    );
  });

  it('returns false when factory has empty workouts', () => {
    expect(
      hasRichWorkoutSetInMetadata({
        ai_workout_factory: { workout_set: { workouts: [] } },
        exercises: [{ name: 'A', sets: 1, reps: 1 }],
      }),
    ).toBe(false);
  });
});

describe('applyFlatWorkoutEditsToMetadata', () => {
  it('preserves ai_workout_factory and siblings on flat edit', () => {
    const base = richBaseFixture();
    const next = applyFlatWorkoutEditsToMetadata(base, [
      { name: 'Goblet Squat', sets: 4, reps: 12 },
    ]) as Record<string, unknown>;

    expect(next.ai_workout_factory).toBeDefined();
    const af = next.ai_workout_factory as Record<string, unknown>;
    expect(af.generated_at).toBe('2026-01-01T00:00:00Z');
    expect(af.chain_metadata).toEqual({ foo: 1 });

    const session = (af.workout_set as { workouts: Record<string, unknown>[] }).workouts[0];
    expect(session.cooldownBlocks).toHaveLength(1);
    const blocks = session.exerciseBlocks as Record<string, unknown>[];
    expect(blocks).toHaveLength(1);
    expect(blocks[0].name).toBe('Main');
    expect(blocks[0].blockFormat).toBe('straight_sets');
    const ex = (blocks[0].exercises as Record<string, unknown>[])[0];
    expect(ex.exerciseName).toBe('Goblet Squat');
  });

  it('flat-only metadata sets exercises without factory', () => {
    const next = applyFlatWorkoutEditsToMetadata({}, [
      { name: 'Push-up', sets: 3, reps: 10 },
    ]) as Record<string, unknown>;
    expect(next.ai_workout_factory).toBeUndefined();
    expect((next.exercises as unknown[]).length).toBe(1);
  });
});

describe('deriveFlatExercisesFromMetadata', () => {
  it('derives from factory when rich', () => {
    const flat = deriveFlatExercisesFromMetadata(richBaseFixture());
    expect(flat.some((e) => e.name.includes('Kettlebell'))).toBe(true);
  });
});

describe('flatExercisesMatchDerived', () => {
  it('detects mismatch between form flat and derived', () => {
    const derived = deriveFlatExercisesFromMetadata(richBaseFixture());
    expect(flatExercisesMatchDerived([{ name: 'Other', sets: 1, reps: 1 }], derived)).toBe(false);
    expect(flatExercisesMatchDerived(derived, derived)).toBe(true);
  });

  it('treats reorder as a change (order-sensitive)', () => {
    const a = [
      { name: 'Squat', sets: 3, reps: 5 },
      { name: 'Bench', sets: 3, reps: 8 },
    ];
    const b = [
      { name: 'Bench', sets: 3, reps: 8 },
      { name: 'Squat', sets: 3, reps: 5 },
    ];
    expect(flatExercisesMatchDerived(a, b)).toBe(false);
  });
});

describe('applyBlockEditsToMetadata', () => {
  it('preserves tabata blockFormat when renaming main exercise', () => {
    const meta = richMetadataWithBlockFormat('tabata');
    const vm1 = buildWorkoutSessionViewModel(meta);
    const main = vm1.blocks.find((b) => b.section === 'main')!;
    const edited = vm1.blocks.map((b) =>
      b.id === main.id
        ? {
            ...b,
            exercises: b.exercises.map((ex, i) =>
              i === 0 ? { ...ex, exerciseName: 'Renamed Tabata Move' } : ex,
            ),
          }
        : b,
    );

    const next = applyBlockEditsToMetadata(meta, edited) as Record<string, unknown>;
    const vm2 = buildWorkoutSessionViewModel(next);
    const main2 = vm2.blocks.find((b) => b.section === 'main')!;

    expect(main2.blockFormat).toBe('tabata');
    expect(main2.formatParams).toEqual(main.formatParams);
    expect(main2.exercises[0].exerciseName).toBe('Renamed Tabata Move');

    const af = next.ai_workout_factory as {
      workout_set: { workouts: { exerciseBlocks: { blockFormat: string }[] }[] };
    };
    expect(af.workout_set.workouts[0].exerciseBlocks[0].blockFormat).toBe('tabata');
  });

  it('round-trips physiological fields to flat exercises cache', () => {
    const meta = richBaseFixture();
    const vm1 = buildWorkoutSessionViewModel(meta);
    const main = vm1.blocks.find((b) => b.section === 'main')!;
    const edited = vm1.blocks.map((b) =>
      b.id === main.id
        ? {
            ...b,
            exercises: b.exercises.map((ex, i) =>
              i === 0
                ? {
                    ...ex,
                    rpe: 9,
                    restSeconds: 90,
                    workSeconds: 30,
                    rounds: 4,
                  }
                : ex,
            ),
          }
        : b,
    );

    const next = applyBlockEditsToMetadata(meta, edited) as Record<string, unknown>;
    const flat = next.exercises as {
      rpe?: number;
      rest_seconds?: number;
      work_seconds?: number;
      rounds?: number;
    }[];
    expect(flat[0].rpe).toBe(9);
    expect(flat[0].rest_seconds).toBe(90);
    expect(flat[0].work_seconds).toBe(30);
    expect(flat[0].rounds).toBe(4);
  });

  it('updates finisher instruction blocks without touching main tabata block', () => {
    const meta = richMetadataWithBlockFormat('tabata');
    const vm1 = buildWorkoutSessionViewModel(meta);
    const edited = vm1.blocks.map((b) =>
      b.section === 'finisher'
        ? { ...b, name: 'New Finisher', instructions: ['Sprint 30s', 'Walk 60s'] }
        : b,
    );

    const next = applyBlockEditsToMetadata(meta, edited) as Record<string, unknown>;
    const session = (
      next.ai_workout_factory as { workout_set: { workouts: Record<string, unknown>[] } }
    ).workout_set.workouts[0];
    const finisherBlocks = session.finisherBlocks as {
      exerciseName: string;
      instructions: string[];
    }[];
    expect(finisherBlocks[0].exerciseName).toBe('New Finisher');
    expect(finisherBlocks[0].instructions).toEqual(['Sprint 30s', 'Walk 60s']);

    const mainBlock = (session.exerciseBlocks as { blockFormat: string }[])[0];
    expect(mainBlock.blockFormat).toBe('tabata');
  });

  it('keeps superset two exercises in one block after edit', () => {
    const meta = richMetadataWithBlockFormat('superset');
    const vm1 = buildWorkoutSessionViewModel(meta);
    const main = vm1.blocks.find((b) => b.section === 'main')!;
    const edited = vm1.blocks.map((b) =>
      b.id === main.id
        ? {
            ...b,
            exercises: b.exercises.map((ex, i) =>
              i === 1 ? { ...ex, exerciseName: 'Edited B exercise' } : ex,
            ),
          }
        : b,
    );

    const next = applyBlockEditsToMetadata(meta, edited) as Record<string, unknown>;
    const blocks = (
      next.ai_workout_factory as { workout_set: { workouts: { exerciseBlocks: unknown[] }[] } }
    ).workout_set.workouts[0].exerciseBlocks;
    expect(blocks).toHaveLength(1);
    const ex = (blocks[0] as { exercises: { exerciseName: string }[] }).exercises;
    expect(ex).toHaveLength(2);
    expect(ex[1].exerciseName).toBe('Edited B exercise');
  });

  it('returns metadata unchanged for flat-only cards', () => {
    const flat = { exercises: [{ name: 'Squat', sets: 3, reps: 10 }] };
    const vm = buildWorkoutSessionViewModel(flat);
    const next = applyBlockEditsToMetadata(flat, vm.blocks);
    expect((next as Record<string, unknown>).ai_workout_factory).toBeUndefined();
    expect((next as Record<string, unknown>).exercises).toEqual(flat.exercises);
  });

  it('preserves warmup main finisher cooldown sections from fixture', () => {
    const meta = richMetadataWithBlockFormat('tabata');
    const vm1 = buildWorkoutSessionViewModel(meta);
    const next = applyBlockEditsToMetadata(meta, vm1.blocks) as Record<string, unknown>;
    const session = (
      next.ai_workout_factory as { workout_set: { workouts: Record<string, unknown>[] } }
    ).workout_set.workouts[0];

    expect(session.warmupBlocks).toBeDefined();
    expect(session.exerciseBlocks).toBeDefined();
    expect(session.finisherBlocks).toBeDefined();
    expect(session.cooldownBlocks).toBeDefined();
  });
});

describe('finalizeWorkoutMetadataForSave', () => {
  const emptyFields = (): TaskMetadataFormFields => ({
    eventLocation: '',
    eventUrl: '',
    experienceSeason: '',
    experienceEndDate: '',
    memoryCaption: '',
    workoutType: 'Strength',
    workoutDurationMin: '45',
    workoutExercises: [],
    programGoal: '',
    programDurationWeeks: '',
    programCurrentWeek: 0,
    programSchedule: [],
    programSourceTitle: '',
    cardCoverPath: '',
  });

  it('refreshes exercises from factory when form matches derived', () => {
    const base = richBaseFixture();
    const derived = deriveFlatExercisesFromMetadata(base);
    const fields = { ...emptyFields(), workoutExercises: derived };
    const built = buildTaskMetadataPayload('workout', fields, base);
    const finalized = finalizeWorkoutMetadataForSave('workout', fields, built) as Record<
      string,
      unknown
    >;
    expect(finalized.ai_workout_factory).toBeDefined();
    expect((finalized.exercises as unknown[]).length).toBeGreaterThan(0);
    const tabataBlock = (
      (finalized.ai_workout_factory as { workout_set: { workouts: Record<string, unknown>[] } })
        .workout_set.workouts[0].exerciseBlocks as Record<string, unknown>[]
    )[0];
    expect(tabataBlock.blockFormat).toBe('tabata');
  });

  it('degrades factory when form flat differs from derived', () => {
    const base = richBaseFixture();
    const fields = {
      ...emptyFields(),
      workoutExercises: [{ name: 'Edited Row', sets: 2, reps: 8 }],
    };
    const built = buildTaskMetadataPayload('workout', fields, base);
    const finalized = finalizeWorkoutMetadataForSave('workout', fields, built) as Record<
      string,
      unknown
    >;
    const blocks = (
      finalized.ai_workout_factory as { workout_set: { workouts: Record<string, unknown>[] } }
    ).workout_set.workouts[0].exerciseBlocks as Record<string, unknown>[];
    expect(blocks[0].blockFormat).toBe('straight_sets');
    expect((blocks[0].exercises as Record<string, unknown>[])[0].exerciseName).toBe('Edited Row');
  });
});
