import { describe, expect, it } from 'vitest';
import {
  richSessionExerciseBlocksToCoachOutline,
  syncCoachOutlineFromRichMetadata,
} from './factory-session-to-coach-outline';

describe('richSessionExerciseBlocksToCoachOutline', () => {
  it('maps parametric exerciseBlocks to outline placeholders', () => {
    const session = {
      exerciseBlocks: [
        {
          name: 'Main — Tabata Power',
          blockFormat: 'tabata',
          formatParams: { workSeconds: 20, restSeconds: 10, rounds: 8 },
          exercises: [{ exerciseName: 'Kettlebell Swing' }, { exerciseName: 'Push-up' }],
        },
      ],
    };
    const outline = richSessionExerciseBlocksToCoachOutline(session);
    expect(outline).toEqual([
      {
        name: 'Main — Tabata Power',
        block_format: 'tabata',
        format_params: { workSeconds: 20, restSeconds: 10, rounds: 8 },
        exercises: [{ name: 'Kettlebell Swing' }, { name: 'Push-up' }],
      },
    ]);
  });
});

describe('syncCoachOutlineFromRichMetadata', () => {
  it('sets coach_workout_outline from factory and preserves confirmation', () => {
    const meta = {
      coach_outline_confirmed_at: '2026-01-15T12:00:00.000Z',
      ai_workout_factory: {
        workout_set: {
          workouts: [
            {
              exerciseBlocks: [
                {
                  name: 'Main',
                  blockFormat: 'amrap',
                  formatParams: { timeCapMinutes: 10 },
                  exercises: [{ exerciseName: 'Burpees' }],
                },
              ],
            },
          ],
        },
      },
    };
    const next = syncCoachOutlineFromRichMetadata(meta);
    expect(next.coach_workout_outline).toEqual([
      {
        name: 'Main',
        block_format: 'amrap',
        format_params: { timeCapMinutes: 10 },
        exercises: [{ name: 'Burpees' }],
      },
    ]);
    expect(next.coach_outline_status).toBe('ready');
    expect(next.coach_outline_confirmed_at).toBe('2026-01-15T12:00:00.000Z');
    expect(next.coach_outline_error).toBeUndefined();
  });
});
