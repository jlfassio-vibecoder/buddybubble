import { describe, expect, it, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TaskModalIdeaCanvas } from '@/components/modals/task-modal/TaskModalIdeaCanvas';

describe('TaskModalIdeaCanvas', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders vote count from form props and promote targets', () => {
    const onPromote = vi.fn();
    render(
      <TaskModalIdeaCanvas
        taskMetadata={{}}
        ideaVotes={4}
        ideaVotedBy={[]}
        ideaEffort="Low"
        onIdeaEffortChange={() => undefined}
        ideaImpact="High"
        onIdeaImpactChange={() => undefined}
        ideaTags={['community']}
        onIdeaTagsChange={() => undefined}
        currentUserId="u1"
        canWrite
        onToggleVote={() => undefined}
        onPromoteItemType={onPromote}
      />,
    );

    expect(screen.getByTestId('task-modal-idea-canvas')).toBeTruthy();
    expect(screen.getByTestId('task-modal-idea-vote').textContent).toMatch(/4/);
    expect(screen.getByText('Vote to show interest')).toBeTruthy();
    expect((screen.getByTestId('task-modal-idea-effort') as HTMLSelectElement).value).toBe('Low');
    expect((screen.getByTestId('task-modal-idea-impact') as HTMLSelectElement).value).toBe('High');
    expect(screen.getByText('community')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Promote to Event/i }));
    expect(onPromote).toHaveBeenCalledWith('event');
  });

  it('shows on state and calls toggle when voted', () => {
    const onToggle = vi.fn();
    render(
      <TaskModalIdeaCanvas
        taskMetadata={{}}
        ideaVotes={2}
        ideaVotedBy={['u1']}
        currentUserId="u1"
        canWrite
        onToggleVote={onToggle}
      />,
    );

    const voteBtn = screen.getByTestId('task-modal-idea-vote');
    expect(voteBtn.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText("You're in")).toBeTruthy();
    fireEvent.click(voteBtn);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('disables vote without write or user', () => {
    const onToggle = vi.fn();
    render(
      <TaskModalIdeaCanvas
        taskMetadata={{ votes: 0 }}
        ideaVotes={0}
        ideaTags={[]}
        canWrite={false}
        currentUserId={null}
        onToggleVote={onToggle}
      />,
    );

    const voteBtn = screen.getByTestId('task-modal-idea-vote');
    expect((voteBtn as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(voteBtn);
    expect(onToggle).not.toHaveBeenCalled();
    expect(screen.getByTestId('task-modal-idea-tags-empty')).toBeTruthy();
  });
});
