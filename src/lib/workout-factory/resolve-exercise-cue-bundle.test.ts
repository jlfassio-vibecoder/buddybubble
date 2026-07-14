import { describe, expect, it } from 'vitest';
import { buildWorkoutSessionViewModel } from '@/lib/workout-factory/workout-session-view-model';
import { richMetadataWithBlockFormat } from '@/lib/workout-factory/__fixtures__/workout-session-view-model.fixtures';
import {
  collectBlockExercises,
  exerciseResolutionKey,
  flatExerciseResolutionKey,
  resolveExerciseCueBundle,
} from '@/lib/workout-factory/resolve-exercise-cue-bundle';
import type { ExerciseDictionaryRow } from '@/types/database';

describe('resolve-exercise-cue-bundle', () => {
  it('exerciseResolutionKey prefers id over name', () => {
    expect(exerciseResolutionKey({ id: 'uuid-1', exerciseName: 'Squat' })).toBe('uuid-1');
    expect(exerciseResolutionKey({ exerciseName: 'Goblet Squat' })).toBe('goblet squat');
  });

  it('block coachNotes wins over flat coach_notes', () => {
    const bundle = resolveExerciseCueBundle({
      exerciseName: 'Squat',
      blockExercise: {
        order: 1,
        exerciseName: 'Squat',
        sets: 3,
        reps: '10',
        coachNotes: 'From block',
      },
      flatRow: { name: 'Squat', coach_notes: 'From flat' },
    });

    expect(bundle.coach_notes).toEqual({ value: 'From block', provenance: 'workout' });
    expect(bundle.dictionaryId).toBeNull();
  });

  it('sets dictionaryId from dictRow', () => {
    const bundle = resolveExerciseCueBundle({
      exerciseName: 'Squat',
      dictRow: {
        id: 'd1',
        slug: 'squat',
        name: 'Squat',
        status: 'published',
        biomechanics: {},
        instructions: [],
        media: {},
        complexity_level: null,
        kinetic_chain_type: null,
        created_at: '',
        updated_at: '',
        created_by: null,
      } as ExerciseDictionaryRow,
    });

    expect(bundle.dictionaryId).toBe('d1');
  });

  it('personal form_cues wins over flat and library', () => {
    const bundle = resolveExerciseCueBundle({
      exerciseName: 'Squat',
      personalRow: {
        id: 'n1',
        user_id: 'u1',
        exercise_dictionary_id: 'd1',
        instructions: null,
        form_cues: 'Knees out',
        tips: null,
        injury_prevention_tips: null,
      },
      flatRow: { name: 'Squat', form_cues: 'Flat cue' },
      dictRow: {
        id: 'd1',
        slug: 'squat',
        name: 'Squat',
        status: 'published',
        biomechanics: { performanceCues: ['Library cue'] },
        instructions: ['Step 1'],
        media: {},
        complexity_level: null,
        kinetic_chain_type: null,
        created_at: '',
        updated_at: '',
        created_by: null,
      } as ExerciseDictionaryRow,
    });

    expect(bundle.form_cues).toEqual({ value: 'Knees out', provenance: 'personal' });
  });

  it('flat instructions win over library when personal empty', () => {
    const bundle = resolveExerciseCueBundle({
      exerciseName: 'Squat',
      flatRow: { name: 'Squat', instructions: 'Flat steps' },
      dictRow: {
        id: 'd1',
        slug: 'squat',
        name: 'Squat',
        status: 'published',
        biomechanics: {},
        instructions: ['Library steps'],
        media: {},
        complexity_level: null,
        kinetic_chain_type: null,
        created_at: '',
        updated_at: '',
        created_by: null,
      } as ExerciseDictionaryRow,
    });

    expect(bundle.instructions).toEqual({ value: 'Flat steps', provenance: 'flat' });
  });

  it('returns empty bundle when all layers blank', () => {
    const bundle = resolveExerciseCueBundle({
      exerciseName: 'Custom Move',
      blockExercise: { order: 1, exerciseName: 'Custom Move', sets: 1, reps: '10' },
    });

    expect(bundle.isEmpty).toBe(true);
  });

  it('collectBlockExercises flattens main block exercises', () => {
    const vm = buildWorkoutSessionViewModel(richMetadataWithBlockFormat('tabata'));
    const collected = collectBlockExercises(vm.blocks);

    expect(collected.length).toBeGreaterThan(0);
    expect(collected[0]!.exerciseName).toBeTruthy();
    expect(collected[0]!.key).toBeTruthy();
  });

  it('collectBlockExercises disambiguates duplicate names without ids by flatIndex', () => {
    const collected = collectBlockExercises([
      {
        id: 'b1',
        section: 'main',
        order: 0,
        name: 'Main',
        blockFormat: 'straight_sets',
        formatParams: {},
        subtitle: null,
        instructions: [],
        exercises: [
          { order: 1, exerciseName: 'Curl', sets: 3, reps: '10' },
          { order: 2, exerciseName: 'Curl', sets: 3, reps: '10' },
        ],
      },
    ]);

    expect(collected).toHaveLength(2);
    expect(collected[0]!.key).toBe('curl::0');
    expect(collected[1]!.key).toBe('curl::1');
  });

  it('flatExerciseResolutionKey disambiguates duplicate flat names by index', () => {
    const ex = { name: 'Push-ups' };
    expect(flatExerciseResolutionKey(ex, 0)).toBe('push-ups::0');
    expect(flatExerciseResolutionKey(ex, 1)).toBe('push-ups::1');
    expect(flatExerciseResolutionKey({ name: 'Push-ups', id: 'uuid-1' }, 1)).toBe('uuid-1');
  });
});
