import { describe, expect, it } from 'vitest';
import type { TaskRow } from '@/types/database';
import {
  mergeWorkoutExercisesIntoTaskMetadata,
  workoutMetadataSignature,
} from './session-deck-snapshot';

describe('workoutMetadataSignature', () => {
  const flatMeta = {
    workout_type: 'Strength',
    duration_min: 45,
    exercises: [{ name: 'Squat', sets: 3, reps: 5 }],
  };

  const richMeta = {
    ...flatMeta,
    ai_workout_factory: {
      workout_set: {
        workouts: [
          {
            exerciseBlocks: [
              {
                name: 'MAIN',
                blockFormat: 'amrap',
                formatParams: { time_cap_minutes: 12 },
                exercises: [{ order: 1, exerciseName: 'Squat', sets: 1, reps: '5' }],
              },
            ],
          },
        ],
      },
    },
  };

  it('differs when factory changes but flat exercises are unchanged', () => {
    const sigFlat = workoutMetadataSignature(flatMeta);
    const sigRich = workoutMetadataSignature(richMeta);
    expect(sigFlat).not.toBe(sigRich);
  });

  it('differs when factory block format changes', () => {
    const alt = {
      ...richMeta,
      ai_workout_factory: {
        workout_set: {
          workouts: [
            {
              exerciseBlocks: [
                {
                  name: 'MAIN',
                  blockFormat: 'tabata',
                  formatParams: { rounds: 8, work_seconds: 20, rest_seconds: 10 },
                  exercises: [{ order: 1, exerciseName: 'Squat', sets: 1, reps: '5' }],
                },
              ],
            },
          ],
        },
      },
    };
    expect(workoutMetadataSignature(richMeta)).not.toBe(workoutMetadataSignature(alt));
  });
});

describe('mergeWorkoutExercisesIntoTaskMetadata', () => {
  it('strips legacy program linkage keys from metadata', () => {
    const task = {
      metadata: {
        linked_program_task_id: 'legacy-task',
        program_session_key: 'legacy-key',
        exercises: [{ name: 'Squat', sets: 3, reps: 5 }],
      },
    } as unknown as TaskRow;

    const merged = mergeWorkoutExercisesIntoTaskMetadata(task, [
      { name: 'Squat', sets: 3, reps: 5 },
      { name: 'Bench', sets: 3, reps: 8 },
    ]) as Record<string, unknown>;

    expect(merged.linked_program_task_id).toBeUndefined();
    expect(merged.program_session_key).toBeUndefined();
    expect(merged.exercises).toHaveLength(2);
  });
});
