import { describe, expect, it } from 'vitest';
import { backfillFactoryCuesFromFlat } from './backfill-factory-cues-from-flat';
import { richMetadataWithBlockFormat } from './__fixtures__/workout-session-view-model.fixtures';
import { parseWorkoutExercisesFromMetadata } from '@/lib/parse-workout-exercises-from-metadata';
import type { Json } from '@/types/database';
import type { Exercise } from '@/lib/workout-factory/types/ai-program';

function factoryMainExercise(meta: Record<string, unknown>): Exercise {
  const af = meta.ai_workout_factory as {
    workout_set: { workouts: { exerciseBlocks: { exercises: Exercise[] }[] }[] };
  };
  return af.workout_set.workouts[0]!.exerciseBlocks[0]!.exercises[0]!;
}

describe('backfillFactoryCuesFromFlat', () => {
  it('copies flat-only cues onto empty factory fields and re-projects flat', () => {
    const meta = richMetadataWithBlockFormat('straight_sets') as Record<string, unknown>;
    meta.exercises = [
      {
        name: 'Goblet Squat',
        sets: 3,
        reps: 10,
        instructions: 'Brace hard',
        form_cues: 'Knees out',
        tips: 'Slow eccentric',
        injury_prevention_tips: 'Keep heels down',
        coach_notes: 'Stay tall',
      },
    ];

    const next = backfillFactoryCuesFromFlat(meta as Json) as Record<string, unknown>;
    const factoryEx = factoryMainExercise(next);

    expect(factoryEx.instructions).toBe('Brace hard');
    expect(factoryEx.formCues).toBe('Knees out');
    expect(factoryEx.tips).toBe('Slow eccentric');
    expect(factoryEx.injuryPreventionTips).toBe('Keep heels down');
    expect(factoryEx.coachNotes).toBe('Stay tall');

    const flat = parseWorkoutExercisesFromMetadata(next);
    expect(flat[0]?.instructions).toBe('Brace hard');
    expect(flat[0]?.form_cues).toBe('Knees out');
    expect(flat[0]?.coach_notes).toBe('Stay tall');
  });

  it('does not overwrite already-filled factory cue fields', () => {
    const meta = richMetadataWithBlockFormat('straight_sets') as Record<string, unknown>;
    const factoryEx = factoryMainExercise(meta);
    factoryEx.instructions = 'From factory';
    meta.exercises = [
      {
        name: 'Goblet Squat',
        sets: 3,
        reps: 10,
        instructions: 'From flat',
        form_cues: 'Flat form',
      },
    ];

    const next = backfillFactoryCuesFromFlat(meta as Json) as Record<string, unknown>;
    const nextFactory = factoryMainExercise(next);
    expect(nextFactory.instructions).toBe('From factory');
    expect(nextFactory.formCues).toBe('Flat form');
  });

  it('returns metadata unchanged when there is no rich factory tree', () => {
    const meta = {
      exercises: [{ name: 'Squat', instructions: 'Brace' }],
    };
    expect(backfillFactoryCuesFromFlat(meta as Json)).toEqual(meta);
  });
});
