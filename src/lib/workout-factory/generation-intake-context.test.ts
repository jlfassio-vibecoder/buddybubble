import { describe, expect, it } from 'vitest';
import {
  buildGenerationIntakeContext,
  generationIntakeContextToDailyCheckin,
} from '@/lib/workout-factory/generation-intake-context';

describe('generation-intake-context', () => {
  it('buildGenerationIntakeContext normalizes anchor lift and limitations', () => {
    const ctx = buildGenerationIntakeContext({
      durationMinutes: 30,
      phaseIntent: 'aggressive_overload',
      progressionTrend: 'Hitting a Plateau',
      anchorLiftName: '  Squat ',
      anchorLiftWeight: 225.4,
      anchorLiftReps: 5,
      temporaryLimitations: '  wrist tweak  ',
    });

    expect(ctx.anchorLift).toEqual({ name: 'Squat', weight: 225, reps: 5 });
    expect(ctx.temporaryLimitations).toBe('wrist tweak');
  });

  it('generationIntakeContextToDailyCheckin uses snake_case factory keys', () => {
    const payload = generationIntakeContextToDailyCheckin(
      buildGenerationIntakeContext({
        durationMinutes: 45,
        phaseIntent: 'standard_progression',
        progressionTrend: 'Feeling Easy',
        anchorLiftName: '',
        anchorLiftWeight: null,
        anchorLiftReps: null,
        temporaryLimitations: '',
      }),
    );

    expect(payload).toEqual({
      duration_minutes: 45,
      target_duration_min: 45,
      phase_intent: 'standard_progression',
      progression_trend: 'Feeling Easy',
    });
  });
});
