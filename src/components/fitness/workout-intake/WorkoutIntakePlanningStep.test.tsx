import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { WorkoutIntakePlanningStep } from '@/components/fitness/workout-intake/WorkoutIntakePlanningStep';
import { WORKOUT_GENERATION_PROGRESSION_TREND_OPTIONS } from '@/lib/workout-factory/generation-intake-context';

describe('WorkoutIntakePlanningStep', () => {
  it('selects progression trend chips and renders generate slot', () => {
    const setProgressionTrend = vi.fn();

    render(
      <WorkoutIntakePlanningStep
        progressionTrend="Appropriately Challenging"
        setProgressionTrend={setProgressionTrend}
        progressionTrendOptions={WORKOUT_GENERATION_PROGRESSION_TREND_OPTIONS}
        anchorLiftName=""
        setAnchorLiftName={vi.fn()}
        anchorLiftWeight={null}
        setAnchorLiftWeight={vi.fn()}
        anchorLiftReps={null}
        setAnchorLiftReps={vi.fn()}
        temporaryLimitations=""
        setTemporaryLimitations={vi.fn()}
        onBack={vi.fn()}
        submitSlot={<button type="button">Generate Workout</button>}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Hitting a Plateau' }));
    expect(setProgressionTrend).toHaveBeenCalledWith('Hitting a Plateau');
    expect(screen.getByRole('button', { name: 'Generate Workout' })).toBeTruthy();
  });
});
