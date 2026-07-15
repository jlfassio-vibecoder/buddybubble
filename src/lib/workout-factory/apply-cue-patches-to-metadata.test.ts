import { describe, expect, it } from 'vitest';
import {
  applyCuePatchesToMetadata,
  mergeCuePatchIntoBundle,
  type WorkoutCuePatch,
} from './apply-cue-patches-to-metadata';
import {
  exerciseResolutionKey,
  flatExerciseResolutionKey,
  type ResolvedCueBundle,
} from './resolve-exercise-cue-bundle';
import { richMetadataWithBlockFormat } from './__fixtures__/workout-session-view-model.fixtures';
import { parseWorkoutExercisesFromMetadata } from '@/lib/parse-workout-exercises-from-metadata';
import type { Json } from '@/types/database';
import type { Exercise } from '@/lib/workout-factory/types/ai-program';

function richFixtureMainExercise(meta: Record<string, unknown>): Exercise {
  const af = meta.ai_workout_factory as {
    workout_set: { workouts: { exerciseBlocks: { exercises: Exercise[] }[] }[] };
  };
  return af.workout_set.workouts[0]!.exerciseBlocks[0]!.exercises[0]!;
}

describe('mergeCuePatchIntoBundle', () => {
  const base: ResolvedCueBundle = {
    exerciseName: 'Squat',
    dictionaryId: null,
    instructions: { value: 'Old', provenance: 'library' },
    form_cues: null,
    tips: null,
    injury_prevention_tips: null,
    coach_notes: null,
    isEmpty: false,
  };

  it('overrides fields with workout provenance', () => {
    const patch: WorkoutCuePatch = { instructions: 'New instr', form_cues: 'Knees out' };
    const merged = mergeCuePatchIntoBundle(base, patch);
    expect(merged.instructions).toEqual({ value: 'New instr', provenance: 'workout' });
    expect(merged.form_cues).toEqual({ value: 'Knees out', provenance: 'workout' });
    expect(merged.isEmpty).toBe(false);
  });

  it('clears a field when patch value is empty', () => {
    const merged = mergeCuePatchIntoBundle(base, { instructions: '   ' });
    expect(merged.instructions).toBeNull();
    expect(merged.isEmpty).toBe(true);
  });
});

describe('applyCuePatchesToMetadata', () => {
  it('writes enriched fields to flat cache on rich metadata', () => {
    const meta = richMetadataWithBlockFormat('straight_sets');
    const key = exerciseResolutionKey(richFixtureMainExercise(meta));

    const next = applyCuePatchesToMetadata(meta as Json, {
      [key]: {
        instructions: 'Brace core',
        form_cues: 'Knees track toes',
        tips: 'Control descent',
        injury_prevention_tips: 'Avoid valgus',
      },
    });

    const flat = parseWorkoutExercisesFromMetadata(next);
    expect(flat[0]?.instructions).toBe('Brace core');
    expect(flat[0]?.form_cues).toBe('Knees track toes');
    expect(flat[0]?.tips).toBe('Control descent');
    expect(flat[0]?.injury_prevention_tips).toBe('Avoid valgus');
  });

  it('writes all five cue fields to factory camelCase and flat snake_case', () => {
    const meta = richMetadataWithBlockFormat('straight_sets');
    const key = exerciseResolutionKey(richFixtureMainExercise(meta));

    const next = applyCuePatchesToMetadata(meta as Json, {
      [key]: {
        instructions: 'Brace core',
        form_cues: 'Knees track toes',
        tips: 'Control descent',
        injury_prevention_tips: 'Avoid valgus',
        coach_notes: 'Stay tight',
      },
    }) as Record<string, unknown>;

    const factoryEx = richFixtureMainExercise(next);
    expect(factoryEx.instructions).toBe('Brace core');
    expect(factoryEx.formCues).toBe('Knees track toes');
    expect(factoryEx.tips).toBe('Control descent');
    expect(factoryEx.injuryPreventionTips).toBe('Avoid valgus');
    expect(factoryEx.coachNotes).toBe('Stay tight');

    const flat = parseWorkoutExercisesFromMetadata(next)[0]!;
    expect(flat.instructions).toBe('Brace core');
    expect(flat.form_cues).toBe('Knees track toes');
    expect(flat.tips).toBe('Control descent');
    expect(flat.injury_prevention_tips).toBe('Avoid valgus');
    expect(flat.coach_notes).toBe('Stay tight');
  });

  it('clears flat fields when patch value is empty string', () => {
    const meta = {
      exercises: [
        {
          name: 'Goblet Squat',
          instructions: 'Old',
          form_cues: 'Old cue',
        },
      ],
    };
    const key = flatExerciseResolutionKey(meta.exercises[0], 0);

    const next = applyCuePatchesToMetadata(meta as Json, {
      [key]: { instructions: '', form_cues: '' },
    });

    const flat = parseWorkoutExercisesFromMetadata(next)[0]!;
    expect(flat.instructions).toBeUndefined();
    expect(flat.form_cues).toBeUndefined();
  });

  it('applies Coach resolution_key with ::flatIndex when collected key differs', () => {
    const meta = richMetadataWithBlockFormat('straight_sets');
    const next = applyCuePatchesToMetadata(meta as Json, {
      'goblet squat::0': {
        instructions: 'Aliased apply',
      },
    });

    const flat = parseWorkoutExercisesFromMetadata(next);
    expect(flat[0]?.instructions).toBe('Aliased apply');
  });

  it('patches flat-only metadata by flat index key', () => {
    const meta = {
      exercises: [
        { name: 'Squat A', sets: 3, reps: '8' },
        { name: 'Squat A', sets: 3, reps: '8' },
      ],
    };
    const key0 = flatExerciseResolutionKey(meta.exercises[0], 0);
    const key1 = flatExerciseResolutionKey(meta.exercises[1], 1);

    const next = applyCuePatchesToMetadata(meta as Json, {
      [key0]: { tips: 'First variant' },
      [key1]: { tips: 'Second variant' },
    });

    const flat = parseWorkoutExercisesFromMetadata(next);
    expect(flat[0]?.tips).toBe('First variant');
    expect(flat[1]?.tips).toBe('Second variant');
  });

  it('returns metadata unchanged when patches object is empty', () => {
    const meta = { exercises: [{ name: 'Row' }] };
    expect(applyCuePatchesToMetadata(meta as Json, {})).toEqual(meta);
  });

  it('returns metadata unchanged for workout_log variant', () => {
    const meta = {
      variant: 'workout_log',
      exercises: [{ name: 'Squat', instructions: 'Old' }],
    };
    const next = applyCuePatchesToMetadata(meta as Json, {
      'squat::0': { instructions: 'New' },
    });
    expect(next).toEqual(meta);
  });
});
