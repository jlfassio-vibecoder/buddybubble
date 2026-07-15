import { describe, expect, it } from 'vitest';
import { workoutInSetToTaskExercises } from './map-ai-workout-to-task-exercises';
import type { WorkoutInSet } from '@/lib/workout-factory/types/ai-workout';

describe('mapExercise / workoutInSetToTaskExercises', () => {
  it('projects all five factory cue fields to flat snake_case', () => {
    const session = {
      title: 'Session',
      description: 'Desc',
      exerciseBlocks: [
        {
          order: 1,
          name: 'Main',
          blockFormat: 'straight_sets',
          exercises: [
            {
              order: 1,
              exerciseName: 'Squat',
              sets: 3,
              reps: '8',
              instructions: 'Brace',
              formCues: 'Knees out',
              tips: 'Tempo 3-1-1',
              injuryPreventionTips: 'Neutral spine',
              coachNotes: 'Stay tight',
            },
          ],
        },
      ],
    } as unknown as WorkoutInSet;

    const flat = workoutInSetToTaskExercises(session);
    expect(flat).toHaveLength(1);
    expect(flat[0]).toMatchObject({
      name: 'Squat',
      instructions: 'Brace',
      form_cues: 'Knees out',
      tips: 'Tempo 3-1-1',
      injury_prevention_tips: 'Neutral spine',
      coach_notes: 'Stay tight',
    });
  });
});
