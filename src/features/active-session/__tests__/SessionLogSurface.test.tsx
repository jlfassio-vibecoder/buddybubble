import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { buildWorkoutSessionViewModel } from '@/lib/workout-factory/workout-session-view-model';
import { SessionLogSurface } from '../components/SessionLogSurface';

describe('SessionLogSurface ghost placeholders', () => {
  it('shows historical weight and reps in empty set input placeholders', () => {
    const vm = buildWorkoutSessionViewModel({
      exercises: [{ name: 'Back Squat', sets: 3, reps: 10, weight: 135 }],
    });
    const draftLogs = [[{ weight: '', reps: '', rpe: '', done: false }]];
    const ghostLogs = [[{ weight: '225', reps: '8', rpe: '7' }]];

    render(
      <SessionLogSurface
        viewModel={vm}
        draftLogs={draftLogs}
        ghostLogs={ghostLogs}
        unit="lbs"
        onDraftLogsChange={vi.fn()}
      />,
    );

    expect(screen.getByPlaceholderText('Last: 225')).toBeTruthy();
    expect(screen.getByPlaceholderText('Last: 8')).toBeTruthy();
    expect(screen.getByPlaceholderText('Last: 7')).toBeTruthy();
  });
});
