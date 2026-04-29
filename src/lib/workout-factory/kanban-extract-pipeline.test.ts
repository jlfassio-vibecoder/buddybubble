import { describe, expect, it } from 'vitest';
import { validateExtractWorkoutFromBriefOutput } from '@/lib/workout-factory/prompt-chain/extract-workout-from-brief';
import { validateEnrichWorkoutBiomechanicsOutput } from '@/lib/workout-factory/prompt-chain/enrich-workout-biomechanics';
import { mergeKanbanExtractEnrichToTaskExercises } from '@/lib/workout-factory/map-kanban-extract-to-workout';

describe('validateExtractWorkoutFromBriefOutput', () => {
  it('accepts valid extract JSON', () => {
    const data = {
      exercises: [
        { order: 1, section: 'warmup', exercise_name: 'Bike', reps: '5 min' },
        {
          order: 2,
          section: 'main',
          exercise_name: 'Goblet Squat',
          sets: 3,
          reps: '10',
          equipment: 'Dumbbell',
        },
      ],
    };
    const v = validateExtractWorkoutFromBriefOutput(data);
    expect(v.valid).toBe(true);
    if (v.valid) {
      expect(v.data.exercises).toHaveLength(2);
      expect(v.data.exercises[1].exercise_name).toBe('Goblet Squat');
    }
  });

  it('rejects main row without prescription fields', () => {
    const v = validateExtractWorkoutFromBriefOutput({
      exercises: [{ order: 1, section: 'main', exercise_name: 'Squat' }],
    });
    expect(v.valid).toBe(false);
  });
});

describe('validateEnrichWorkoutBiomechanicsOutput', () => {
  it('merges when enrich matches extract orders', () => {
    const extract = {
      exercises: [
        {
          order: 1,
          section: 'main' as const,
          exercise_name: 'Press',
          sets: 3,
          reps: '8',
          equipment: 'DB',
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
          order: 1,
          exercise_name: 'Press',
          detailed_instructions: ['Brace', 'Press'],
          biomechanical_cues: ['Ribs down'],
        },
      ],
    };
    const v = validateEnrichWorkoutBiomechanicsOutput(enrich, extract);
    expect(v.valid).toBe(true);
  });
});

describe('mergeKanbanExtractEnrichToTaskExercises', () => {
  it('maps tiers onto WorkoutExercise', () => {
    const extract = {
      exercises: [
        {
          order: 1,
          section: 'main' as const,
          exercise_name: 'Row',
          sets: 3,
          reps: '10',
          equipment: 'Barbell',
          rest_seconds: 90,
          rpe: 7,
          work_seconds: null,
          rounds: null,
          brief_note: null,
        },
      ],
    };
    const enrich = {
      exercises: [
        {
          order: 1,
          exercise_name: 'Row',
          detailed_instructions: 'Pull to chest',
          biomechanical_cues: ['Flat back'],
          injury_prevention_tips: 'Stop if sharp pain',
        },
      ],
    };
    const rows = mergeKanbanExtractEnrichToTaskExercises(extract, enrich);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Row');
    expect(rows[0].equipment).toBe('Barbell');
    expect(rows[0].instructions).toContain('Pull to chest');
    expect(rows[0].form_cues).toEqual(['Flat back']);
    expect(rows[0].injury_prevention_tips).toBe('Stop if sharp pain');
  });
});
