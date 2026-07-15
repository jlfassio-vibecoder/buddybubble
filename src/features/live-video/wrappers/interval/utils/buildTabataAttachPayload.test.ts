import { describe, expect, it } from 'vitest';

import { createSessionDeckSnapshot } from '@/features/live-video/shells/huddle/session-deck-snapshot';
import {
  buildCustomIntervalQuickLaunchPayload,
  buildStrictTabataQuickLaunchPayload,
  buildTabataAttachPayload,
} from '@/features/live-video/wrappers/interval/utils/buildTabataAttachPayload';
import {
  parseIntervalBlockSnapshot,
  parseTabataFormatParams,
} from '@/features/live-video/wrappers/interval/utils/tabata-block-snapshot';
import { DEFAULT_CUSTOM_INTERVAL_CONFIG } from '@/lib/workout-factory/interval-timer/custom-interval-config';
import {
  CUSTOM_INTERVAL_SUBTITLE_LABEL,
  resolveIntervalPresetLabel,
} from '@/lib/workout-factory/interval-timer/interval-preset-catalog';
import { richMetadataWithBlockFormat } from '@/lib/workout-factory/__fixtures__/workout-session-view-model.fixtures';
import type { TaskRow } from '@/types/database';

function tabataTask(metadata?: Record<string, unknown>): TaskRow {
  return {
    id: 'origin-task-id',
    title: 'Tabata Session',
    metadata: metadata ?? richMetadataWithBlockFormat('tabata'),
  } as TaskRow;
}

function classicHiitCircuitMetadata(): Record<string, unknown> {
  const exercises = [
    { order: 1, exerciseName: 'Burpees', sets: 1, reps: '10' },
    { order: 2, exerciseName: 'Mountain Climbers', sets: 1, reps: '10' },
    { order: 3, exerciseName: 'Jump Squats', sets: 1, reps: '10' },
    { order: 4, exerciseName: 'Push-ups', sets: 1, reps: '10' },
  ];
  return {
    workout_type: 'Generated',
    exercises: exercises.map((e) => ({ name: e.exerciseName, sets: e.sets, reps: e.reps })),
    ai_workout_factory: {
      generated_at: '2026-06-01T00:00:00Z',
      model: 'test',
      workout_set: {
        title: 'Test set',
        description: 'Test',
        difficulty: 'intermediate',
        workouts: [
          {
            title: 'Session',
            description: 'Session',
            exerciseBlocks: [
              {
                order: 1,
                name: 'MAIN',
                blockFormat: 'tabata',
                formatParams: {
                  rounds: 3,
                  work_seconds: 30,
                  rest_seconds: 30,
                  interval_preset: 'classic_hiit',
                },
                exercises,
              },
            ],
          },
        ],
      },
    },
  };
}

describe('buildTabataAttachPayload', () => {
  it('returns mechanics_state and block snapshot for tabata deck card', () => {
    const snap = createSessionDeckSnapshot(tabataTask());
    const payload = buildTabataAttachPayload(snap);
    expect(payload).not.toBeNull();
    expect(payload!.mechanicsState).toMatchObject({
      segment: 'setup',
      round_index: 0,
      total_rounds: 8,
      work_seconds: 20,
      rest_seconds: 10,
      setup_seconds: 10,
      segment_started_at: null,
    });
    expect(payload!.blockSnapshot.origin_task_id).toBe('origin-task-id');
    expect(payload!.blockSnapshot.block_format).toBe('tabata');
    expect(payload!.blockSnapshot.format_params).toMatchObject({
      rounds: 8,
      work_seconds: 20,
      rest_seconds: 10,
    });
    expect(payload!.blockSnapshot.exercises.length).toBeGreaterThan(0);
    expect(payload!.blockSnapshot.exercises.every((ex) => ex.sets === 8)).toBe(true);
  });

  it('persists interval_preset on block_snapshot for named presets', () => {
    const metadata = richMetadataWithBlockFormat('tabata');
    const factory = metadata.ai_workout_factory as Record<string, unknown>;
    const workoutSet = factory.workout_set as Record<string, unknown>;
    const workouts = workoutSet.workouts as Record<string, unknown>[];
    const blocks = workouts[0].exerciseBlocks as Record<string, unknown>[];
    blocks[0].formatParams = {
      rounds: 8,
      work_seconds: 30,
      rest_seconds: 30,
      interval_preset: 'classic_hiit',
    };

    const payload = buildTabataAttachPayload(createSessionDeckSnapshot(tabataTask(metadata)));
    expect(payload).not.toBeNull();
    expect(payload!.blockSnapshot.format_params).toMatchObject({
      rounds: 8,
      work_seconds: 30,
      rest_seconds: 30,
      interval_preset: 'classic_hiit',
    });
  });

  it('sets total_rounds to work segments for multi-exercise circuit', () => {
    const payload = buildTabataAttachPayload(
      createSessionDeckSnapshot(tabataTask(classicHiitCircuitMetadata())),
    );
    expect(payload).not.toBeNull();
    expect(payload!.mechanicsState.total_rounds).toBe(12);
    expect(payload!.blockSnapshot.format_params.rounds).toBe(3);
    expect(payload!.blockSnapshot.exercises).toHaveLength(4);
    expect(payload!.blockSnapshot.exercises.every((ex) => ex.sets === 3)).toBe(true);
  });

  it('returns null for non-tabata deck', () => {
    const task = { ...tabataTask(), metadata: richMetadataWithBlockFormat('amrap') } as TaskRow;
    expect(buildTabataAttachPayload(createSessionDeckSnapshot(task))).toBeNull();
  });
});

describe('buildStrictTabataQuickLaunchPayload', () => {
  it('returns locked 20/10 x 8 tabata preset independent of deck', () => {
    const payload = buildStrictTabataQuickLaunchPayload();
    expect(payload).not.toBeNull();
    expect(payload!.blockSnapshot.format_params).toEqual({
      work_seconds: 20,
      rest_seconds: 10,
      rounds: 8,
      interval_preset: 'tabata',
    });
    expect(payload!.mechanicsState).toMatchObject({
      total_rounds: 8,
      work_seconds: 20,
      rest_seconds: 10,
    });
    expect(payload!.blockSnapshot.origin_task_id).toBeUndefined();
  });

  it('parses quick-launch block_snapshot without origin_task_id', () => {
    const payload = buildStrictTabataQuickLaunchPayload();
    const parsed = parseIntervalBlockSnapshot(payload!.blockSnapshot);
    expect(parsed).not.toBeNull();
    expect(parsed!.title).toBe('Strict Tabata');
    expect(parsed!.origin_task_id).toBeUndefined();
    expect(parsed!.format_params).toMatchObject({ rounds: 8, work_seconds: 20, rest_seconds: 10 });
  });
});

describe('buildCustomIntervalQuickLaunchPayload', () => {
  it('returns custom 45/15 x 6 attach payload with Intervals label', () => {
    const payload = buildCustomIntervalQuickLaunchPayload({
      work_seconds: 45,
      rest_seconds: 15,
      rounds: 6,
    });
    expect(payload).not.toBeNull();
    expect(payload!.blockSnapshot).toMatchObject({
      title: 'Custom Interval',
      block_format: 'tabata',
      format_params: {
        work_seconds: 45,
        rest_seconds: 15,
        rounds: 6,
        interval_preset: 'custom',
      },
      exercises: [{ name: 'Movement', sets: 6, reps: 10 }],
    });
    // Baseline: no active-rest keys when unused.
    expect(payload!.blockSnapshot.format_params.rest_mode).toBeUndefined();
    expect(payload!.blockSnapshot.format_params.active_rest_exercises).toBeUndefined();
    expect(payload!.blockSnapshot.origin_task_id).toBeUndefined();
    expect(payload!.mechanicsState).toMatchObject({
      segment: 'setup',
      total_rounds: 6,
      work_seconds: 45,
      rest_seconds: 15,
      setup_seconds: 10,
    });
    expect(resolveIntervalPresetLabel(payload!.blockSnapshot.format_params)).toBe(
      CUSTOM_INTERVAL_SUBTITLE_LABEL,
    );
  });

  it('emits active rest on format_params without changing exercises or mechanics', () => {
    const payload = buildCustomIntervalQuickLaunchPayload({
      work_seconds: 45,
      rest_seconds: 15,
      rounds: 6,
      station_names: ['Burpees'],
      rest_mode: 'active',
      active_rest_exercises: ['Jogging'],
    });
    expect(payload).not.toBeNull();
    expect(payload!.blockSnapshot.format_params).toEqual({
      work_seconds: 45,
      rest_seconds: 15,
      rounds: 6,
      interval_preset: 'custom',
      rest_mode: 'active',
      active_rest_exercises: ['Jogging'],
    });
    // Work stations only — active rest must not inflate the circuit list.
    expect(payload!.blockSnapshot.exercises).toEqual([{ name: 'Burpees', sets: 6, reps: 10 }]);
    expect(payload!.mechanicsState).toMatchObject({
      total_rounds: 6,
      work_seconds: 45,
      rest_seconds: 15,
    });

    const parsed = parseTabataFormatParams(payload!.blockSnapshot.format_params);
    expect(parsed).toEqual({
      work_seconds: 45,
      rest_seconds: 15,
      rounds: 6,
      interval_preset: 'custom',
      rest_mode: 'active',
      active_rest_exercises: ['Jogging'],
    });
  });

  it('parseTabataFormatParams strips invalid active rest combos', () => {
    expect(
      parseTabataFormatParams({
        work_seconds: 45,
        rest_seconds: 0,
        rounds: 6,
        rest_mode: 'active',
        active_rest_exercises: ['Jogging'],
      }),
    ).toEqual({
      work_seconds: 45,
      rest_seconds: 0,
      rounds: 6,
    });

    expect(
      parseTabataFormatParams({
        work_seconds: 45,
        rest_seconds: 15,
        rounds: 6,
        rest_mode: 'active',
        active_rest_exercises: [],
      }),
    ).toEqual({
      work_seconds: 45,
      rest_seconds: 15,
      rounds: 6,
    });

    expect(
      parseTabataFormatParams({
        work_seconds: 45,
        rest_seconds: 15,
        rounds: 6,
        rest_mode: 'passive',
        active_rest_exercises: ['Jogging'],
      }),
    ).toEqual({
      work_seconds: 45,
      rest_seconds: 15,
      rounds: 6,
    });
  });

  it('preserves rest_seconds 0 through mechanics and snapshot parse', () => {
    const payload = buildCustomIntervalQuickLaunchPayload({
      work_seconds: 45,
      rest_seconds: 0,
      rounds: 6,
    });
    expect(payload).not.toBeNull();
    expect(payload!.blockSnapshot.format_params.rest_seconds).toBe(0);
    expect(payload!.mechanicsState.rest_seconds).toBe(0);

    const parsed = parseIntervalBlockSnapshot(payload!.blockSnapshot);
    expect(parsed).not.toBeNull();
    expect(parsed!.format_params?.rest_seconds).toBe(0);
    expect(parsed!.title).toBe('Custom Interval');
  });

  it('omits slightly-negative rest_seconds that would round to 0', () => {
    const parsed = parseTabataFormatParams({
      work_seconds: 45,
      rest_seconds: -0.4,
      rounds: 6,
    });
    expect(parsed).not.toBeNull();
    expect(parsed!.rest_seconds).toBeUndefined();
    expect(parsed!.work_seconds).toBe(45);
    expect(parsed!.rounds).toBe(6);
  });

  it('accepts default seed config 30/30 x 8', () => {
    const payload = buildCustomIntervalQuickLaunchPayload(DEFAULT_CUSTOM_INTERVAL_CONFIG);
    expect(payload).not.toBeNull();
    expect(payload!.blockSnapshot.format_params).toEqual({
      work_seconds: 30,
      rest_seconds: 30,
      rounds: 8,
      interval_preset: 'custom',
    });
    expect(resolveIntervalPresetLabel(payload!.blockSnapshot.format_params)).toBe(
      CUSTOM_INTERVAL_SUBTITLE_LABEL,
    );
  });

  it('returns null for invalid configs without throwing', () => {
    expect(
      buildCustomIntervalQuickLaunchPayload({ work_seconds: 20, rest_seconds: 10, rounds: 0 }),
    ).toBeNull();
    expect(
      buildCustomIntervalQuickLaunchPayload({ work_seconds: 20, rest_seconds: 10, rounds: 21 }),
    ).toBeNull();
    expect(
      buildCustomIntervalQuickLaunchPayload({ work_seconds: 0, rest_seconds: 10, rounds: 8 }),
    ).toBeNull();
    expect(
      buildCustomIntervalQuickLaunchPayload({ work_seconds: 601, rest_seconds: 10, rounds: 8 }),
    ).toBeNull();
    expect(
      buildCustomIntervalQuickLaunchPayload({ work_seconds: 20, rest_seconds: -1, rounds: 8 }),
    ).toBeNull();
    expect(
      buildCustomIntervalQuickLaunchPayload({ work_seconds: 20, rest_seconds: 301, rounds: 8 }),
    ).toBeNull();
  });

  it('maps multi-station names to exercises and work-segment total_rounds', () => {
    const stations = ['Burpees', 'Mountain Climbers', 'Jump Squats', 'Push-ups'];
    const payload = buildCustomIntervalQuickLaunchPayload({
      work_seconds: 30,
      rest_seconds: 30,
      rounds: 3,
      station_names: stations,
    });
    expect(payload).not.toBeNull();
    expect(payload!.blockSnapshot.format_params.rounds).toBe(3);
    expect(payload!.blockSnapshot.exercises).toEqual(
      stations.map((name) => ({ name, sets: 3, reps: 10 })),
    );
    expect(payload!.mechanicsState.total_rounds).toBe(12);
    expect(payload!.mechanicsState.exercise_count).toBe(4);
    expect(payload!.mechanicsState.round_rest_seconds).toBe(0);
    expect(resolveIntervalPresetLabel(payload!.blockSnapshot.format_params)).toBe(
      CUSTOM_INTERVAL_SUBTITLE_LABEL,
    );

    const parsed = parseIntervalBlockSnapshot(payload!.blockSnapshot);
    expect(parsed).not.toBeNull();
    expect(parsed!.exercises).toHaveLength(4);
  });

  it('seeds round_rest_seconds on format_params and mechanics for multi-station', () => {
    const stations = ['Burpees', 'Mountain Climbers', 'Jump Squats', 'Push-ups'];
    const payload = buildCustomIntervalQuickLaunchPayload({
      work_seconds: 40,
      rest_seconds: 15,
      rounds: 3,
      station_names: stations,
      round_rest_seconds: 60,
    });
    expect(payload).not.toBeNull();
    expect(payload!.blockSnapshot.format_params).toMatchObject({
      work_seconds: 40,
      rest_seconds: 15,
      rounds: 3,
      round_rest_seconds: 60,
    });
    expect(payload!.mechanicsState).toMatchObject({
      total_rounds: 12,
      work_seconds: 40,
      rest_seconds: 15,
      round_rest_seconds: 60,
      exercise_count: 4,
    });
  });
});
