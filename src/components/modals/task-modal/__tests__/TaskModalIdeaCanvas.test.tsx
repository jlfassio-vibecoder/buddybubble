import { describe, expect, it, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TaskModalIdeaCanvas } from '@/components/modals/task-modal/TaskModalIdeaCanvas';

describe('TaskModalIdeaCanvas', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders vote count from metadata and promote targets', () => {
    const onPromote = vi.fn();
    render(
      <TaskModalIdeaCanvas
        taskMetadata={{ votes: 4, effort: 'Low', impact: 'High', tags: ['community'] }}
        canWrite
        onPromoteItemType={onPromote}
      />,
    );

    expect(screen.getByTestId('task-modal-idea-canvas')).toBeTruthy();
    expect(screen.getByTestId('task-modal-idea-vote').textContent).toMatch(/4/);
    expect(screen.getByTestId('task-modal-idea-effort').textContent).toBe('Low');
    expect(screen.getByTestId('task-modal-idea-impact').textContent).toBe('High');
    expect(screen.getByText('community')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Promote to Event/i }));
    expect(onPromote).toHaveBeenCalledWith('event');
  });

  it('defaults votes to 0 and shows empty placeholders', () => {
    render(<TaskModalIdeaCanvas taskMetadata={{}} canWrite={false} />);

    expect(screen.getByTestId('task-modal-idea-vote').textContent).toMatch(/0/);
    expect(screen.getByTestId('task-modal-idea-effort').textContent).toBe('—');
    expect(screen.getByTestId('task-modal-idea-tags-empty')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Promote to Class/i })).toBeTruthy();
  });
});
