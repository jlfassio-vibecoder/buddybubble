import { describe, expect, it } from 'vitest';
import { prepareWorkoutChainRequest } from '@/lib/workout-factory/prepare-workout-chain-request';

const minimalPersona = {
  demographics: {
    ageRange: '30-39',
    sex: 'any',
    weight: 165,
    experienceLevel: 'intermediate' as const,
  },
  medical: { injuries: '', conditions: '' },
  goals: { primary: 'General fitness', secondary: '' },
  weeklyTimeMinutes: 135,
  sessionsPerWeek: 3,
  sessionDurationMinutes: 45,
  splitType: 'full_body' as const,
  lifestyle: 'active' as const,
};

describe('prepareWorkoutChainRequest coach_workout_outline', () => {
  it('round-trips a valid outline onto coachWorkoutOutline', async () => {
    const outline = [
      {
        name: 'Main',
        block_format: 'emom',
        format_params: { interval_seconds: 60, total_minutes: 12, is_alternating: true },
        exercises: [{ name: 'Kettlebell Swing' }, { name: 'Goblet Squat' }],
      },
    ];
    const result = await prepareWorkoutChainRequest(
      { ...minimalPersona, coach_workout_outline: outline },
      false,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.coachWorkoutOutline).toEqual(outline);
  });

  it('omits coachWorkoutOutline when outline is empty or malformed', async () => {
    const empty = await prepareWorkoutChainRequest(
      { ...minimalPersona, coach_workout_outline: [] },
      false,
    );
    expect(empty.ok).toBe(true);
    if (empty.ok) expect(empty.data.coachWorkoutOutline).toBeUndefined();

    const bad = await prepareWorkoutChainRequest(
      { ...minimalPersona, coach_workout_outline: [{ name: 'Ok' }, 'not-an-object'] },
      false,
    );
    expect(bad.ok).toBe(true);
    if (bad.ok) expect(bad.data.coachWorkoutOutline).toBeUndefined();
  });
});
