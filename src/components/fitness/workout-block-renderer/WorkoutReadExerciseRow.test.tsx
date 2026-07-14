import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { WorkoutReadExerciseRow } from '@/components/fitness/workout-block-renderer/WorkoutReadExerciseRow';
import type { ResolvedCueBundle } from '@/lib/workout-factory/resolve-exercise-cue-bundle';

describe('WorkoutReadExerciseRow cues accordion', () => {
  afterEach(() => cleanup());

  it('expands cue panel on toggle click', () => {
    const bundle: ResolvedCueBundle = {
      exerciseName: 'Squat',
      dictionaryId: null,
      instructions: { value: 'Brace core', provenance: 'flat' },
      form_cues: null,
      tips: null,
      injury_prevention_tips: null,
      coach_notes: null,
      isEmpty: false,
    };

    render(
      <WorkoutReadExerciseRow
        name="Squat"
        metaLine="3 sets · 10 reps"
        cuePanelEnabled
        resolvedCues={bundle}
      />,
    );

    expect(screen.queryByTestId('workout-exercise-cue-panel')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Show exercise cues' }));

    expect(screen.getByTestId('workout-exercise-cue-panel')).toBeTruthy();
    expect(screen.getByText('Brace core')).toBeTruthy();
  });

  it('shows empty state when expanded with no cues', () => {
    render(
      <WorkoutReadExerciseRow
        name="Custom Move"
        metaLine="3 sets · 10 reps"
        cuePanelEnabled
        resolvedCues={{
          exerciseName: 'Custom Move',
          dictionaryId: null,
          instructions: null,
          form_cues: null,
          tips: null,
          injury_prevention_tips: null,
          coach_notes: null,
          isEmpty: true,
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Show exercise cues' }));

    expect(screen.getByTestId('workout-exercise-cue-empty').textContent).toContain(
      'No form cues yet for Custom Move',
    );
  });
});
