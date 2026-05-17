import { describe, expect, it } from 'vitest';
import {
  classifyBlockRole,
  flattenSessionExercisesForMetadata,
  mergeCoachProposedIntoTaskMetadata,
} from './merge-coach-proposed-into-task-metadata';

function richBaseFixture() {
  return {
    workout_type: 'Strength',
    duration_min: 45,
    exercises: [{ name: 'Legacy flat', sets: 1, reps: '5' }],
    card_cover_path: 'tasks/abc/cover.jpg',
    linked_program_task_id: 'prog-1',
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

describe('classifyBlockRole', () => {
  it('routes names by regex table', () => {
    expect(classifyBlockRole('Warm-up')).toBe('warmup');
    expect(classifyBlockRole('Warm up')).toBe('warmup');
    expect(classifyBlockRole('Finisher')).toBe('finisher');
    expect(classifyBlockRole('AMRAP finisher')).toBe('finisher');
    expect(classifyBlockRole('Burnout')).toBe('finisher');
    expect(classifyBlockRole('Cool down')).toBe('cooldown');
    expect(classifyBlockRole('Mobility flow')).toBe('cooldown');
    expect(classifyBlockRole('Flexibility')).toBe('cooldown');
    expect(classifyBlockRole('Stretch routine')).toBe('cooldown');
    expect(classifyBlockRole('Strength block')).toBe('main');
  });
});

describe('mergeCoachProposedIntoTaskMetadata', () => {
  it('1 — rich + Finisher exercise block: MAIN and cool-down untouched; exercises grow', () => {
    const base = richBaseFixture();
    const before = flattenSessionExercisesForMetadata(
      (base.ai_workout_factory as { workout_set: { workouts: Record<string, unknown>[] } })
        .workout_set.workouts[0],
    ).length;
    const { metadata, mergeLog } = mergeCoachProposedIntoTaskMetadata({
      base,
      proposed: {
        blocks: [
          {
            name: 'Finisher',
            exercises: [{ name: 'Kettlebell Thrusters', sets: 3, reps: '10-12', rpe: 8 }],
          },
        ],
      },
    });
    expect(mergeLog.target).toBe('rich');
    expect(mergeLog.touched).toContain('exerciseBlocks');
    const session = (metadata as { ai_workout_factory: { workout_set: { workouts: unknown[] } } })
      .ai_workout_factory.workout_set.workouts[0] as {
      exerciseBlocks: Array<{ name?: string; exercises?: unknown[] }>;
      cooldownBlocks: unknown[];
    };
    expect(session.exerciseBlocks.some((b) => b.name === 'Finisher')).toBe(true);
    const main = session.exerciseBlocks.find((b) => b.name === 'MAIN');
    expect(main?.exercises?.length).toBe(1);
    expect(session.cooldownBlocks.length).toBe(1);
    const after = flattenSessionExercisesForMetadata(session as Record<string, unknown>).length;
    expect(after).toBe(before + 1);
    expect(mergeLog.exerciseCount).toBe(after);
  });

  it('2 — rich + flat exercises only: append to Main; preserve cool-down', () => {
    const base = richBaseFixture();
    const { metadata, mergeLog } = mergeCoachProposedIntoTaskMetadata({
      base,
      proposed: {
        exercises: [{ name: 'Accessory Curl', sets: 2, reps: '12' }],
      },
    });
    expect(mergeLog.touched).toContain('exerciseBlocks');
    const session = (metadata as { ai_workout_factory: { workout_set: { workouts: unknown[] } } })
      .ai_workout_factory.workout_set.workouts[0] as {
      exerciseBlocks: Array<{ name?: string; exercises?: Array<{ exerciseName?: string }> }>;
      cooldownBlocks: unknown[];
    };
    const main = session.exerciseBlocks.find((b) => /^main$/i.test(String(b.name ?? '')));
    expect(main?.exercises?.some((e) => e.exerciseName === 'Accessory Curl')).toBe(true);
    expect(session.cooldownBlocks.length).toBe(1);
  });

  it('3 — rich + instruction-only Cool down block → cooldownBlocks', () => {
    const base = richBaseFixture();
    const { metadata, mergeLog } = mergeCoachProposedIntoTaskMetadata({
      base,
      proposed: {
        blocks: [
          {
            name: 'Cool down',
            instructions: ['Walk 2 minutes easy', 'Light breathing'],
          },
        ],
      },
    });
    expect(mergeLog.touched).toContain('cooldown');
    const session = (metadata as { ai_workout_factory: { workout_set: { workouts: unknown[] } } })
      .ai_workout_factory.workout_set.workouts[0] as {
      cooldownBlocks: Array<{ instructions: string[] }>;
    };
    expect(
      session.cooldownBlocks.some((c) => c.instructions.join('|').includes('Walk 2 minutes')),
    ).toBe(true);
  });

  it('4 — flat base + blocks: flatten to exercises; no ai_workout_factory', () => {
    const base = {
      workout_type: 'Cardio',
      exercises: [{ name: 'Old', sets: 1, reps: '1' }],
    };
    const { metadata, mergeLog } = mergeCoachProposedIntoTaskMetadata({
      base,
      proposed: {
        blocks: [
          { name: 'Warm-up', exercises: [{ name: 'Jump rope', sets: 1, reps: '60s' }] },
          { name: 'Main', exercises: [{ name: 'Run', sets: 1, reps: '10 min' }] },
          { name: 'Finisher', exercises: [{ name: 'Sprint', sets: 4, reps: '30s' }] },
        ],
      },
    });
    expect(mergeLog.target).toBe('flat');
    expect((metadata as { ai_workout_factory?: unknown }).ai_workout_factory).toBeUndefined();
    const ex = (metadata as { exercises: Array<{ name: string }> }).exercises;
    expect(ex[0].name).toBe('Warm-up: Jump rope');
    expect(ex.some((e) => e.name === 'Run')).toBe(true);
    expect(ex.some((e) => e.name === 'Finisher: Sprint')).toBe(true);
  });

  it('5 — null and {} proposed: structural equality to base; no touches', () => {
    const base = richBaseFixture();
    const a = mergeCoachProposedIntoTaskMetadata({ base, proposed: null });
    const b = mergeCoachProposedIntoTaskMetadata({ base, proposed: {} });
    expect(a.mergeLog.touched).toEqual([]);
    expect(b.mergeLog.touched).toEqual([]);
    expect(a.mergeLog.drops).toEqual([]);
    expect(b.mergeLog.drops).toEqual([]);
    expect(a.mergeLog.blockFormats).toEqual([]);
    expect(b.mergeLog.blockFormats).toEqual([]);
    expect(a.metadata).toEqual(base);
    expect(b.metadata).toEqual(base);
  });

  it('6 — preserves card_cover_path and linked_program_task_id', () => {
    const base = richBaseFixture();
    const { metadata } = mergeCoachProposedIntoTaskMetadata({
      base,
      proposed: {
        blocks: [{ name: 'Finisher', exercises: [{ name: 'Plank', sets: 1, reps: '60s' }] }],
      },
    });
    expect((metadata as { card_cover_path: string }).card_cover_path).toBe('tasks/abc/cover.jpg');
    expect((metadata as { linked_program_task_id: string }).linked_program_task_id).toBe('prog-1');
  });

  it('7 — preserves ai_workout_factory siblings (chain_metadata, generated_at, model)', () => {
    const base = richBaseFixture();
    const { metadata } = mergeCoachProposedIntoTaskMetadata({
      base,
      proposed: { duration_min: 50 },
    });
    const af = (metadata as { ai_workout_factory: Record<string, unknown> }).ai_workout_factory;
    expect(af.chain_metadata).toEqual({ foo: 1 });
    expect(af.generated_at).toBe('2026-01-01T00:00:00Z');
    expect(af.model).toBe('gemini-test');
  });

  it('8 — reps number and string round-trip through factory adapter', () => {
    const base = { exercises: [] as unknown[] };
    const { metadata } = mergeCoachProposedIntoTaskMetadata({
      base,
      proposed: {
        exercises: [
          { name: 'A', sets: 2, reps: 10 },
          { name: 'B', sets: 3, reps: '8-10' },
        ],
      },
    });
    const ex = (metadata as { exercises: Array<{ name: string; reps?: unknown }> }).exercises;
    const a = ex.find((e) => e.name === 'A');
    const b = ex.find((e) => e.name === 'B');
    expect(a?.reps).toBe(10);
    expect(b?.reps).toBe('8-10');
  });

  it('9 — Mobility flow routes to cooldownBlocks (instruction path)', () => {
    const base = richBaseFixture();
    const { metadata, mergeLog } = mergeCoachProposedIntoTaskMetadata({
      base,
      proposed: {
        blocks: [{ name: 'Mobility flow', instructions: ['Hip circles', 'Ankle rocks'] }],
      },
    });
    expect(mergeLog.touched).toContain('cooldown');
    const session = (metadata as { ai_workout_factory: { workout_set: { workouts: unknown[] } } })
      .ai_workout_factory.workout_set.workouts[0] as {
      cooldownBlocks: Array<{ exerciseName: string }>;
    };
    expect(session.cooldownBlocks.some((c) => c.exerciseName === 'Mobility flow')).toBe(true);
  });

  it('11 — parametric AMRAP block maps blockFormat and formatParams', () => {
    const base = richBaseFixture();
    const { metadata, mergeLog } = mergeCoachProposedIntoTaskMetadata({
      base,
      proposed: {
        blocks: [
          {
            name: 'Finisher',
            block_format: 'amrap',
            format_params: { time_cap_minutes: 5 },
            exercises: [{ name: 'Burpees', sets: 1, reps: 'max' }],
          },
        ],
      },
    });
    const session = (metadata as { ai_workout_factory: { workout_set: { workouts: unknown[] } } })
      .ai_workout_factory.workout_set.workouts[0] as {
      exerciseBlocks: Array<Record<string, unknown>>;
    };
    const finisher = session.exerciseBlocks.find((b) => b.name === 'Finisher');
    expect(finisher?.blockFormat).toBe('amrap');
    expect(finisher?.formatParams).toEqual({ time_cap_minutes: 5 });
    expect(finisher).not.toHaveProperty('block_format');
    expect(finisher).not.toHaveProperty('format_params');
    expect(mergeLog.blockFormats).toContain('amrap');
  });

  it('12 — EMOM derives workSeconds and restSeconds from format_params', () => {
    const base = richBaseFixture();
    const { metadata } = mergeCoachProposedIntoTaskMetadata({
      base,
      proposed: {
        blocks: [
          {
            name: 'Main',
            block_format: 'emom',
            format_params: {
              interval_seconds: 60,
              total_minutes: 16,
              rest_in_interval_seconds: 15,
            },
            exercises: [{ name: 'Kettlebell Swing', reps: '12' }],
          },
        ],
      },
    });
    const session = (metadata as { ai_workout_factory: { workout_set: { workouts: unknown[] } } })
      .ai_workout_factory.workout_set.workouts[0] as {
      exerciseBlocks: Array<{ exercises?: Array<Record<string, unknown>> }>;
    };
    const main = session.exerciseBlocks.find((b) =>
      b.exercises?.some((e) => e.exerciseName === 'Kettlebell Swing'),
    );
    const ex = main?.exercises?.find((e) => e.exerciseName === 'Kettlebell Swing');
    expect(ex?.workSeconds).toBe(45);
    expect(ex?.restSeconds).toBe(15);
  });

  it('13 — EMOM honors model-emitted per-exercise timers', () => {
    const base = richBaseFixture();
    const { metadata } = mergeCoachProposedIntoTaskMetadata({
      base,
      proposed: {
        blocks: [
          {
            name: 'Main',
            block_format: 'emom',
            format_params: { interval_seconds: 60, total_minutes: 10 },
            exercises: [{ name: 'Deadlift', work_seconds: 30, rest_seconds: 30 }],
          },
        ],
      },
    });
    const session = (metadata as { ai_workout_factory: { workout_set: { workouts: unknown[] } } })
      .ai_workout_factory.workout_set.workouts[0] as {
      exerciseBlocks: Array<{ exercises?: Array<Record<string, unknown>> }>;
    };
    const block = session.exerciseBlocks.find((b) =>
      b.exercises?.some((e) => e.exerciseName === 'Deadlift'),
    );
    const ex = block?.exercises?.find((e) => e.exerciseName === 'Deadlift');
    expect(ex?.workSeconds).toBe(30);
    expect(ex?.restSeconds).toBe(30);
  });

  it('14 — EMOM without rest_in_interval_seconds uses full interval as work', () => {
    const base = richBaseFixture();
    const { metadata } = mergeCoachProposedIntoTaskMetadata({
      base,
      proposed: {
        blocks: [
          {
            name: 'Main',
            block_format: 'emom',
            format_params: { interval_seconds: 60, total_minutes: 8 },
            exercises: [{ name: 'Push Press' }],
          },
        ],
      },
    });
    const session = (metadata as { ai_workout_factory: { workout_set: { workouts: unknown[] } } })
      .ai_workout_factory.workout_set.workouts[0] as {
      exerciseBlocks: Array<{ exercises?: Array<Record<string, unknown>> }>;
    };
    const block = session.exerciseBlocks.find((b) =>
      b.exercises?.some((e) => e.exerciseName === 'Push Press'),
    );
    const ex = block?.exercises?.find((e) => e.exerciseName === 'Push Press');
    expect(ex?.workSeconds).toBe(60);
    expect(ex?.restSeconds).toBe(0);
  });

  it('15 — Tabata block carries formatParams without synthesizing exercise timers', () => {
    const base = richBaseFixture();
    const { metadata } = mergeCoachProposedIntoTaskMetadata({
      base,
      proposed: {
        blocks: [
          {
            name: 'Finisher',
            block_format: 'tabata',
            format_params: { rounds: 8, work_seconds: 20, rest_seconds: 10 },
            exercises: [{ name: 'Bike Sprint' }],
          },
        ],
      },
    });
    const session = (metadata as { ai_workout_factory: { workout_set: { workouts: unknown[] } } })
      .ai_workout_factory.workout_set.workouts[0] as {
      exerciseBlocks: Array<Record<string, unknown>>;
    };
    const block = session.exerciseBlocks.find((b) => b.name === 'Finisher');
    expect(block?.blockFormat).toBe('tabata');
    expect(block?.formatParams).toEqual({ rounds: 8, work_seconds: 20, rest_seconds: 10 });
    const ex = (block?.exercises as Array<Record<string, unknown>>)?.[0];
    expect(ex?.workSeconds).toBeUndefined();
    expect(ex?.restSeconds).toBeUndefined();
  });

  it('16 — instruction-only blocks do not populate blockFormats', () => {
    const base = richBaseFixture();
    const { mergeLog } = mergeCoachProposedIntoTaskMetadata({
      base,
      proposed: {
        blocks: [{ name: 'Mobility flow', instructions: ['Hip circles'] }],
      },
    });
    expect(mergeLog.blockFormats).toEqual([]);
  });

  it('17 — flat card refuses parametric blocks', () => {
    const base = { exercises: [{ name: 'Old', sets: 1, reps: '1' }] };
    const { metadata, mergeLog } = mergeCoachProposedIntoTaskMetadata({
      base,
      proposed: {
        blocks: [
          {
            name: 'Main',
            block_format: 'amrap',
            format_params: { time_cap_minutes: 5 },
            exercises: [{ name: 'Burpees' }],
          },
        ],
      },
    });
    expect(mergeLog.target).toBe('flat');
    expect(mergeLog.drops).toContainEqual({
      field: 'blocks[0]',
      reason: 'parametric_requires_rich_workout_set',
    });
    expect((metadata as { exercises: Array<{ name: string }> }).exercises).toEqual([
      { name: 'Old', sets: 1, reps: '1' },
    ]);
  });

  it('18 — flat card refusal preserves workout_type and duration_min', () => {
    const base = { exercises: [] as unknown[] };
    const { metadata, mergeLog } = mergeCoachProposedIntoTaskMetadata({
      base,
      proposed: {
        workout_type: 'AMRAP',
        duration_min: 30,
        blocks: [
          {
            name: 'Main',
            block_format: 'amrap',
            format_params: { time_cap_minutes: 5 },
            exercises: [{ name: 'Burpees' }],
          },
        ],
      },
    });
    expect((metadata as { workout_type: string }).workout_type).toBe('AMRAP');
    expect((metadata as { duration_min: number }).duration_min).toBe(30);
    expect(mergeLog.drops.some((d) => d.reason === 'parametric_requires_rich_workout_set')).toBe(
      true,
    );
  });

  it('19 — flat card allows instruction-only blocks without parametric drop', () => {
    const base = { exercises: [{ name: 'Old', sets: 1, reps: '1' }] };
    const { metadata, mergeLog } = mergeCoachProposedIntoTaskMetadata({
      base,
      proposed: {
        blocks: [{ name: 'Cool down', instructions: ['Walk 2 min easy'] }],
      },
    });
    expect(mergeLog.drops.some((d) => d.reason === 'parametric_requires_rich_workout_set')).toBe(
      false,
    );
    expect((metadata as { exercises: Array<{ name: string }> }).exercises).toEqual([
      { name: 'Old', sets: 1, reps: '1' },
    ]);
  });

  it('10 — idempotent: second merge equals first for Finisher block', () => {
    const base = richBaseFixture();
    const proposed = {
      blocks: [
        { name: 'Finisher', exercises: [{ name: 'Kettlebell Thrusters', sets: 3, reps: '10' }] },
      ],
    };
    const first = mergeCoachProposedIntoTaskMetadata({ base, proposed });
    const second = mergeCoachProposedIntoTaskMetadata({ base: first.metadata, proposed });
    expect(second.metadata).toEqual(first.metadata);
    expect(second.mergeLog.drops.some((d) => d.reason === 'exercise_block_already_present')).toBe(
      true,
    );
  });
});
