import { describe, expect, it, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { WorkoutExerciseCuePanel } from '@/components/fitness/workout-block-renderer/WorkoutExerciseCuePanel';
import type { ResolvedCueBundle } from '@/lib/workout-factory/resolve-exercise-cue-bundle';

describe('WorkoutExerciseCuePanel', () => {
  afterEach(() => cleanup());

  it('renders nothing when collapsed', () => {
    const bundle: ResolvedCueBundle = {
      exerciseName: 'Squat',
      instructions: { value: 'Step 1', provenance: 'flat' },
      form_cues: null,
      tips: null,
      injury_prevention_tips: null,
      coach_notes: null,
      isEmpty: false,
    };

    const { container } = render(
      <WorkoutExerciseCuePanel exerciseName="Squat" bundle={bundle} isExpanded={false} />,
    );

    expect(container.firstChild).toBeNull();
  });

  it('renders empty state when bundle is empty', () => {
    const bundle: ResolvedCueBundle = {
      exerciseName: 'Squat',
      instructions: null,
      form_cues: null,
      tips: null,
      injury_prevention_tips: null,
      coach_notes: null,
      isEmpty: true,
    };

    render(<WorkoutExerciseCuePanel exerciseName="Squat" bundle={bundle} isExpanded />);

    expect(screen.getByTestId('workout-exercise-cue-empty').textContent).toContain(
      'No form cues yet for Squat',
    );
  });

  it('renders fields and provenance chips when expanded', () => {
    const bundle: ResolvedCueBundle = {
      exerciseName: 'Squat',
      instructions: { value: 'Brace core', provenance: 'personal' },
      form_cues: { value: 'Knees out', provenance: 'library' },
      tips: null,
      injury_prevention_tips: null,
      coach_notes: { value: 'Go heavy', provenance: 'workout' },
      isEmpty: false,
    };

    render(<WorkoutExerciseCuePanel exerciseName="Squat" bundle={bundle} isExpanded />);

    expect(screen.getByTestId('workout-exercise-cue-panel')).toBeTruthy();
    expect(screen.getByText('Brace core')).toBeTruthy();
    expect(screen.getByText('Knees out')).toBeTruthy();
    expect(screen.getByText('Your notes')).toBeTruthy();
    expect(screen.getByText('Library')).toBeTruthy();
    expect(screen.getByText('This workout')).toBeTruthy();
  });
});
