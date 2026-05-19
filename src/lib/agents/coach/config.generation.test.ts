import { describe, expect, it } from 'vitest';

import {
  COACH_MAIN_CHAT_INTAKE_THINKING_BUDGET,
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

  it('uses default budget on task rail', () => {
    expect(resolveCoachThinkingBudget({ isRailSurface: true, hasWorkoutContext: false })).toBe(
      COACH_THINKING_BUDGET,
    );
  });

  it('uses default budget when workout context is present on main bubble', () => {
    expect(resolveCoachThinkingBudget({ isRailSurface: false, hasWorkoutContext: true })).toBe(
      COACH_THINKING_BUDGET,
    );
  });
});
