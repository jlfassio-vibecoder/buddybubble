import { describe, it, expect } from 'vitest';
import {
  buildHashExerciseList,
  exerciseMentionFromHashPick,
  finalizeExerciseMentionsForSend,
} from '@/lib/agents/coach/exercise-mentions-client';
import type { ExerciseMentionClientPayload } from '@/lib/agents/coach/exercise-mentions';

describe('finalizeExerciseMentionsForSend', () => {
  const pending: ExerciseMentionClientPayload[] = [
    {
      token: '#Goblet Squat ',
      name: 'Goblet Squat',
      source: 'workout',
      workout_exercise_index: 0,
    },
    {
      token: '#Bench Press ',
      name: 'Bench Press',
      source: 'dictionary',
      dictionary_id: 'dict-1',
    },
  ];

  it('returns null when no pending tokens remain in message text', () => {
    expect(finalizeExerciseMentionsForSend(pending, 'no tags here', ['Goblet Squat'])).toBeNull();
  });

  it('drops mentions removed from draft and refreshes workout_exercise_index', () => {
    const out = finalizeExerciseMentionsForSend(pending, 'focus on #Bench Press today', [
      'Warm-up',
      'Goblet Squat',
      'Bench Press',
    ]);
    expect(out).toHaveLength(1);
    expect(out![0].name).toBe('Bench Press');
    expect(out![0].workout_exercise_index).toBe(2);
    expect(out![0].dictionary_id).toBe('dict-1');
  });
});

describe('buildHashExerciseList', () => {
  it('lists workout names before dictionary and dedupes case-insensitively', () => {
    const list = buildHashExerciseList(
      ['Goblet Squat', 'goblet squat'],
      [{ id: 'd1', name: 'Goblet Squat', slug: 'goblet-squat', status: 'published' }],
    );
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('workout:goblet squat');
    expect(list[0].name).toBe('Goblet Squat');
  });

  it('appends dictionary-only exercises after canvas names', () => {
    const list = buildHashExerciseList(
      ['Row A'],
      [{ id: 'd2', name: 'Row B', slug: 'row-b', status: 'published' }],
    );
    expect(list.map((e) => e.name)).toEqual(['Row A', 'Row B']);
    expect(list[1].id).toBe('d2');
  });
});

describe('exerciseMentionFromHashPick', () => {
  it('marks workout source and index from canvas list', () => {
    const row = exerciseMentionFromHashPick({ id: 'workout:swing', name: 'Kettlebell Swing' }, [
      'Kettlebell Swing',
      'Row',
    ]);
    expect(row.source).toBe('workout');
    expect(row.workout_exercise_index).toBe(0);
    expect(row.token).toBe('#Kettlebell Swing ');
  });

  it('marks dictionary source with ids', () => {
    const row = exerciseMentionFromHashPick(
      { id: 'uuid-1', name: 'Deadlift', slug: 'deadlift' },
      [],
    );
    expect(row.source).toBe('dictionary');
    expect(row.dictionary_id).toBe('uuid-1');
    expect(row.dictionary_slug).toBe('deadlift');
    expect(row.workout_exercise_index).toBeUndefined();
  });
});
