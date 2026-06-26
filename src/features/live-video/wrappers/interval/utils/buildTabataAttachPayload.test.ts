import { describe, expect, it } from 'vitest';

import { createSessionDeckSnapshot } from '@/features/live-video/shells/huddle/session-deck-snapshot';
import { buildTabataAttachPayload } from '@/features/live-video/wrappers/interval/utils/buildTabataAttachPayload';
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
