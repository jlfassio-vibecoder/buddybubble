import { describe, expect, it, afterEach } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { richMetadataWithBlockFormat } from '@/lib/workout-factory/__fixtures__/workout-session-view-model.fixtures';
import { CoachDraftCard } from './CoachDraftCard';
import type { CoachDraftPayload } from '@/types/coach-draft';

afterEach(() => {
  cleanup();
});

function pendingDraft(proposed_metadata: Record<string, unknown>): CoachDraftPayload {
  return {
    status: 'pending',
    proposed_title: 'Test draft',
    proposed_description: null,
    proposed_metadata,
    target_task_id: 'task-1',
  };
}

describe('CoachDraftCard', () => {
  it('renders compact block preview for rich proposed_metadata', () => {
    const { getByTestId, getByText } = render(
      <CoachDraftCard
        messageId="msg-1"
        draft={pendingDraft(richMetadataWithBlockFormat('tabata'))}
      />,
    );

    expect(getByTestId('coach-draft-workout-preview')).toBeTruthy();
    expect(getByText('MAIN')).toBeTruthy();
  });

  it('renders flat preview for legacy proposed_metadata exercises', () => {
    const { getByTestId, getByText } = render(
      <CoachDraftCard
        messageId="msg-1"
        draft={pendingDraft({
          exercises: [{ name: 'Row', sets: 4, reps: 8 }],
        })}
      />,
    );

    expect(getByTestId('coach-draft-workout-preview')).toBeTruthy();
    expect(getByText('Row')).toBeTruthy();
  });
});
