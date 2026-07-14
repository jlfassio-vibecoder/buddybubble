import { describe, expect, it, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { WorkoutExerciseCuePanel } from '@/components/fitness/workout-block-renderer/WorkoutExerciseCuePanel';
import type { ResolvedCueBundle } from '@/lib/workout-factory/resolve-exercise-cue-bundle';

describe('WorkoutExerciseCuePanel', () => {
  afterEach(() => cleanup());

  it('renders nothing when collapsed', () => {
    const bundle: ResolvedCueBundle = {
      exerciseName: 'Squat',
      dictionaryId: null,
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
      dictionaryId: null,
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
      dictionaryId: null,
      instructions: { value: 'Brace core', provenance: 'personal' },
      form_cues: { value: 'Knees out', provenance: 'library' },
      tips: null,
      injury_prevention_tips: null,
      coach_notes: null,
      isEmpty: false,
    };

    render(<WorkoutExerciseCuePanel exerciseName="Squat" bundle={bundle} isExpanded />);

    expect(screen.getByText('Brace core')).toBeTruthy();
    expect(screen.getByText('Your notes')).toBeTruthy();
    expect(screen.getByText('Knees out')).toBeTruthy();
    expect(screen.getByText('Library')).toBeTruthy();
  });

  it('enters authoring mode and saves cue patch', () => {
    const onCueSave = vi.fn();
    const bundle: ResolvedCueBundle = {
      exerciseName: 'Squat',
      dictionaryId: null,
      instructions: null,
      form_cues: null,
      tips: null,
      injury_prevention_tips: null,
      coach_notes: null,
      isEmpty: true,
    };

    render(
      <WorkoutExerciseCuePanel
        exerciseName="Squat"
        bundle={bundle}
        isExpanded
        canWrite
        resolutionKey="squat::0"
        onCueSave={onCueSave}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add cues' }));
    expect(screen.getByTestId('workout-exercise-cue-edit')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Instructions'), {
      target: { value: 'New instructions' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save to this workout' }));

    expect(onCueSave).toHaveBeenCalledWith('squat::0', {
      instructions: 'New instructions',
      form_cues: '',
      tips: '',
      injury_prevention_tips: '',
    });
  });

  it('cancel discards authoring and calls onCueCancel', () => {
    const onCueCancel = vi.fn();
    const onCueDraftChange = vi.fn();
    const bundle: ResolvedCueBundle = {
      exerciseName: 'Squat',
      dictionaryId: null,
      instructions: { value: 'Existing', provenance: 'flat' },
      form_cues: null,
      tips: null,
      injury_prevention_tips: null,
      coach_notes: null,
      isEmpty: false,
    };

    render(
      <WorkoutExerciseCuePanel
        exerciseName="Squat"
        bundle={bundle}
        isExpanded
        canWrite
        resolutionKey="squat"
        onCueCancel={onCueCancel}
        onCueDraftChange={onCueDraftChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit cues' }));
    fireEvent.change(screen.getByLabelText('Instructions'), {
      target: { value: 'Draft change' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCueCancel).toHaveBeenCalledWith('squat');
    expect(screen.queryByTestId('workout-exercise-cue-edit')).toBeNull();
    expect(screen.getByText('Existing')).toBeTruthy();
  });

  it('calls onSaveToMyNotes with dictionaryId when Save to my notes is clicked', async () => {
    const onSaveToMyNotes = vi.fn().mockResolvedValue(undefined);
    const bundle: ResolvedCueBundle = {
      exerciseName: 'Squat',
      dictionaryId: '00000000-0000-4000-8000-000000000001',
      instructions: null,
      form_cues: null,
      tips: null,
      injury_prevention_tips: null,
      coach_notes: null,
      isEmpty: true,
    };

    render(
      <WorkoutExerciseCuePanel
        exerciseName="Squat"
        bundle={bundle}
        isExpanded
        canWrite
        resolutionKey="squat"
        onSaveToMyNotes={onSaveToMyNotes}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add cues' }));
    fireEvent.change(screen.getByLabelText('Form cues'), {
      target: { value: 'Knees track toes' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save to my notes' }));

    await waitFor(() => expect(onSaveToMyNotes).toHaveBeenCalledTimes(1));
    expect(onSaveToMyNotes).toHaveBeenCalledWith({
      resolutionKey: 'squat',
      exerciseName: 'Squat',
      dictionaryId: '00000000-0000-4000-8000-000000000001',
      patch: {
        instructions: '',
        form_cues: 'Knees track toes',
        tips: '',
        injury_prevention_tips: '',
      },
    });
    await waitFor(() => {
      expect(screen.queryByTestId('workout-exercise-cue-edit')).toBeNull();
    });
  });
});
