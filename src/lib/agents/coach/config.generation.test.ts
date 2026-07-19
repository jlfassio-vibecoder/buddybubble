import { describe, expect, it } from 'vitest';

import {
  COACH_CUE_MAX_OUTPUT_TOKENS,
  COACH_CUE_THINKING_BUDGET,
  COACH_MAIN_CHAT_INTAKE_THINKING_BUDGET,
  COACH_MAX_OUTPUT_TOKENS,
  COACH_RICH_WORKOUT_MAX_OUTPUT_TOKENS,
  COACH_RICH_WORKOUT_THINKING_BUDGET,
  COACH_THINKING_BUDGET,
  resolveCoachThinkingBudget,
} from './config';

describe('resolveCoachThinkingBudget', () => {
  it('uses reduced budget for main bubble intake (non_rail, no workout context)', () => {
    expect(resolveCoachThinkingBudget({ isRailSurface: false, hasWorkoutContext: false })).toBe(
      COACH_MAIN_CHAT_INTAKE_THINKING_BUDGET,
    );
    expect(COACH_MAIN_CHAT_INTAKE_THINKING_BUDGET).toBe(512);
  });

  it('uses default budget on task rail without workout context', () => {
    expect(resolveCoachThinkingBudget({ isRailSurface: true, hasWorkoutContext: false })).toBe(
      COACH_THINKING_BUDGET,
    );
  });

  it('uses rich-workout surgical budget on task rail with workout context', () => {
    expect(resolveCoachThinkingBudget({ isRailSurface: true, hasWorkoutContext: true })).toBe(
      COACH_RICH_WORKOUT_THINKING_BUDGET,
    );
    expect(COACH_RICH_WORKOUT_MAX_OUTPUT_TOKENS).toBeLessThanOrEqual(4096);
  });

  it('uses default budget when workout context is present on main bubble', () => {
    expect(resolveCoachThinkingBudget({ isRailSurface: false, hasWorkoutContext: true })).toBe(
      COACH_THINKING_BUDGET,
    );
  });

  it('uses cue-mode thinking budget when exerciseCueRequestMode is set', () => {
    expect(
      resolveCoachThinkingBudget({
        isRailSurface: true,
        hasWorkoutContext: true,
        exerciseCueRequestMode: true,
      }),
    ).toBe(COACH_CUE_THINKING_BUDGET);
    expect(COACH_CUE_THINKING_BUDGET).toBe(256);
    // Headroom: cue JSON + fields must fit after thinking shares maxOutputTokens.
    expect(COACH_CUE_MAX_OUTPUT_TOKENS).toBeGreaterThanOrEqual(4096);
    expect(COACH_CUE_MAX_OUTPUT_TOKENS).toBeGreaterThan(COACH_CUE_THINKING_BUDGET * 4);
  });

  it('main Coach JSON call has enough maxOutputTokens headroom for structural rewrites', () => {
    expect(COACH_MAX_OUTPUT_TOKENS).toBeGreaterThanOrEqual(16384);
    expect(COACH_MAX_OUTPUT_TOKENS).toBeGreaterThan(COACH_THINKING_BUDGET * 4);
  });
});
