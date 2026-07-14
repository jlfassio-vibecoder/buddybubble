import { describe, expect, it } from 'vitest';
import {
  mergeOutlineMetadataOntoFormSavePayload,
  mergeWorkoutCueMetadataOntoFormSavePayload,
} from '@/lib/agents/coach/coach-outline-metadata';

describe('mergeOutlineMetadataOntoFormSavePayload', () => {
  it('keeps live form fields while applying outline keys from override', () => {
    const formMetadata = {
      workout_type: 'Strength',
      duration_min: 45,
      coach_workout_outline: [{ name: 'Old block' }],
      coach_outline_status: 'ready',
    };
    const outlineSave = {
      workout_type: 'Cardio',
      duration_min: 20,
      coach_workout_outline: [{ name: 'Warm-up', block_format: 'emom' }],
      coach_outline_status: 'ready',
      coach_outline_confirmed_at: '2026-05-22T12:00:00.000Z',
    };

    const merged = mergeOutlineMetadataOntoFormSavePayload(formMetadata, outlineSave);

    expect(merged.workout_type).toBe('Strength');
    expect(merged.duration_min).toBe(45);
    expect(merged.coach_outline_confirmed_at).toBe('2026-05-22T12:00:00.000Z');
    expect(merged.coach_workout_outline).toEqual([{ name: 'Warm-up', block_format: 'emom' }]);
  });

  it('removes outline keys cleared in override (e.g. confirmation reset)', () => {
    const formMetadata = {
      duration_min: 30,
      coach_outline_confirmed_at: '2026-05-22T12:00:00.000Z',
      coach_outline_status: 'ready',
    };
    const outlineSave = {
      duration_min: 10,
      coach_outline_status: 'ready',
    };

    const merged = mergeOutlineMetadataOntoFormSavePayload(formMetadata, outlineSave);

    expect(merged.duration_min).toBe(30);
    expect(merged.coach_outline_confirmed_at).toBeUndefined();
    expect(merged.coach_outline_status).toBe('ready');
  });

  it('does not apply cue exercise fields from a full override (outline path)', () => {
    const formMetadata = {
      duration_min: 45,
      exercises: [{ name: 'Squat', form_cues: 'Old' }],
    };
    const outlineSave = {
      duration_min: 20,
      exercises: [{ name: 'Squat', form_cues: 'Knees out' }],
      ai_workout_factory: { workout_set: { workouts: [{ exerciseBlocks: [] }] } },
      coach_outline_status: 'ready',
    };

    const merged = mergeOutlineMetadataOntoFormSavePayload(formMetadata, outlineSave);

    expect(merged.exercises).toEqual([{ name: 'Squat', form_cues: 'Old' }]);
    expect(merged.ai_workout_factory).toBeUndefined();
    expect(merged.coach_outline_status).toBe('ready');
  });
});

describe('mergeWorkoutCueMetadataOntoFormSavePayload', () => {
  it('keeps form duration/type while applying cue exercises and factory from override', () => {
    const formMetadata = {
      workout_type: 'Strength',
      duration_min: 45,
      exercises: [{ name: 'Squat', form_cues: 'Old' }],
      ai_workout_factory: {
        workout_set: {
          workouts: [
            {
              exerciseBlocks: [{ exercises: [{ exerciseName: 'Squat', coachNotes: 'Old note' }] }],
            },
          ],
        },
      },
    };
    const cueSave = {
      workout_type: 'Cardio',
      duration_min: 20,
      exercises: [{ name: 'Squat', form_cues: 'Knees out', tips: 'Brace' }],
      ai_workout_factory: {
        workout_set: {
          workouts: [
            {
              exerciseBlocks: [{ exercises: [{ exerciseName: 'Squat', coachNotes: 'Drive up' }] }],
            },
          ],
        },
      },
    };

    const merged = mergeWorkoutCueMetadataOntoFormSavePayload(formMetadata, cueSave);

    expect(merged.workout_type).toBe('Strength');
    expect(merged.duration_min).toBe(45);
    expect(merged.exercises).toEqual([{ name: 'Squat', form_cues: 'Knees out', tips: 'Brace' }]);
    expect(merged.ai_workout_factory).toEqual(cueSave.ai_workout_factory);
  });
});
