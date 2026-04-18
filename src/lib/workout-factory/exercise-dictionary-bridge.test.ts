import { describe, expect, it } from 'vitest';
import type { ExerciseDictionaryRow } from '@/types/database';
import { validateEnrichWorkoutBiomechanicsOutput } from '@/lib/workout-factory/prompt-chain/enrich-workout-biomechanics';
import {
  dictionaryRowToEnrichedExercise,
  mergeKanbanEnrichFromDictionaryAndVertex,
  slugifyExerciseName,
  splitExtractByDictionaryMatches,
  dictionaryRowsByNormalizedName,
} from '@/lib/workout-factory/exercise-dictionary-bridge';

function row(
  partial: Partial<ExerciseDictionaryRow> & Pick<ExerciseDictionaryRow, 'name' | 'slug'>,
): ExerciseDictionaryRow {
  return {
    id: partial.id ?? '00000000-0000-4000-8000-000000000001',
    slug: partial.slug,
    name: partial.name,
    complexity_level: partial.complexity_level ?? null,
    kinetic_chain_type: partial.kinetic_chain_type ?? null,
    status: partial.status ?? 'published',
    biomechanics: partial.biomechanics ?? {},
    instructions: partial.instructions ?? ['Step one'],
    media: partial.media ?? {},
    created_at: partial.created_at ?? '2026-01-01T00:00:00Z',
    updated_at: partial.updated_at ?? '2026-01-01T00:00:00Z',
  };
}

describe('slugifyExerciseName', () => {
  it('lowercases and hyphenates', () => {
    expect(slugifyExerciseName('Goblet Squat!')).toBe('goblet-squat');
  });

  it('never returns empty string', () => {
    expect(slugifyExerciseName('!!!')).toBe('exercise');
  });
});

describe('splitExtractByDictionaryMatches + merge', () => {
  const extracted = {
    workout_title: 'T',
    exercises: [
      {
        order: 1,
        section: 'main' as const,
        exercise_name: 'Goblet Squat',
        sets: 3,
        reps: '8',
        equipment: null,
        rest_seconds: null,
        rpe: null,
        work_seconds: null,
        rounds: null,
        brief_note: null,
      },
      {
        order: 2,
        section: 'main' as const,
        exercise_name: 'Novel Move XYZ',
        sets: 2,
        reps: '10',
        equipment: null,
        rest_seconds: null,
        rpe: null,
        work_seconds: null,
        rounds: null,
        brief_note: null,
      },
    ],
  };

  it('merges dictionary row and vertex subset by order', () => {
    const dict = row({
      slug: 'goblet-squat',
      name: 'Goblet Squat',
      instructions: ['Sit tall', 'Drive up'],
      biomechanics: { performanceCues: ['Brace'] },
    });
    const normToRow = dictionaryRowsByNormalizedName([dict]);
    const { foundByOrder, missing } = splitExtractByDictionaryMatches(extracted, normToRow);
    expect(missing).toHaveLength(1);
    expect(missing[0].exercise_name).toBe('Novel Move XYZ');

    const vertex = {
      exercises: [
        {
          order: 2,
          exercise_name: 'Novel Move XYZ',
          detailed_instructions: ['Do the thing'],
          biomechanical_cues: ['Cue'],
        },
      ],
    };
    const merged = mergeKanbanEnrichFromDictionaryAndVertex(extracted, foundByOrder, vertex);
    expect(merged.exercises.map((e) => e.order)).toEqual([1, 2]);
    expect(merged.exercises[0].detailed_instructions).toEqual(['Sit tall', 'Drive up']);
    expect(merged.exercises[1].detailed_instructions).toEqual(['Do the thing']);
  });

  it('builds full enrich from dictionary only when vertex is null', () => {
    const dict = row({
      slug: 'goblet-squat',
      name: 'goblet squat',
      instructions: ['One'],
      biomechanics: {},
    });
    const normToRow = dictionaryRowsByNormalizedName([dict]);
    const extractedOne = {
      exercises: [extracted.exercises[0]],
    };
    const { foundByOrder } = splitExtractByDictionaryMatches(extractedOne, normToRow);
    const merged = mergeKanbanEnrichFromDictionaryAndVertex(extractedOne, foundByOrder, null);
    expect(merged.exercises).toHaveLength(1);
    expect(merged.exercises[0].order).toBe(1);
  });
});

describe('dictionaryRowToEnrichedExercise', () => {
  it('maps instructions and cues', () => {
    const r = row({
      slug: 'x',
      name: 'X',
      instructions: ['A', 'B'],
      biomechanics: { performanceCues: ['P'], injuryPreventionTips: 'Keep ribs down' },
    });
    const e = dictionaryRowToEnrichedExercise(r, 5, '  Custom Name  ');
    expect(e.order).toBe(5);
    expect(e.exercise_name).toBe('Custom Name');
    expect(e.detailed_instructions).toEqual(['A', 'B']);
    expect(e.injury_prevention_tips).toBe('Keep ribs down');
  });
});

describe('validateEnrichWorkoutBiomechanicsOutput (subset)', () => {
  it('accepts enrich array matching partial extract length', () => {
    const subset = {
      exercises: [
        {
          order: 2,
          section: 'main' as const,
          exercise_name: 'Curl',
          sets: 3,
          reps: '10',
          equipment: null,
          rest_seconds: null,
          rpe: null,
          work_seconds: null,
          rounds: null,
          brief_note: null,
        },
      ],
    };
    const enrich = {
      exercises: [
        {
          order: 2,
          exercise_name: 'Curl',
          detailed_instructions: ['Squeeze'],
          biomechanical_cues: ['Slow ecc'],
        },
      ],
    };
    const v = validateEnrichWorkoutBiomechanicsOutput(enrich, subset);
    expect(v.valid).toBe(true);
  });
});
