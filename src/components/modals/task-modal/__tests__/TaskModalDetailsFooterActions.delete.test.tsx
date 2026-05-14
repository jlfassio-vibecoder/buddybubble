import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { TaskModalDetailsFooterActions } from '@/components/modals/task-modal/TaskModalDetailsFooterActions';
import { TaskHardDeleteBlockedError } from '@/components/modals/task-modal/hooks/useTaskHardDelete';

describe('TaskModalDetailsFooterActions delete', () => {
  afterEach(() => {
    cleanup();
  });

  it('requires two-step confirm before calling onHardDeleteTask', async () => {
    const onHardDeleteTask = vi.fn().mockResolvedValue(undefined);
    render(
      <TaskModalDetailsFooterActions
        canWrite
        isCreateMode={false}
        saving={false}
        title="T"
        typeNoun="task"
        coreDirty={false}
        onCreateTask={vi.fn()}
        onSaveCoreFields={vi.fn()}
        taskId="id-1"
        archiving={false}
        loading={false}
        onArchiveTask={vi.fn()}
        onHardDeleteTask={onHardDeleteTask}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Delete task/i }));
    expect(onHardDeleteTask).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Delete permanently/i }));
    await waitFor(() => expect(onHardDeleteTask).toHaveBeenCalled());
  });

  it('shows program child error when delete throws TaskHardDeleteBlockedError', async () => {
    const onHardDeleteTask = vi
      .fn()
      .mockRejectedValue(new TaskHardDeleteBlockedError('PROGRAM_HAS_CHILDREN', 3));
    render(
      <TaskModalDetailsFooterActions
        canWrite
        isCreateMode={false}
        saving={false}
        title="P"
        typeNoun="program"
        coreDirty={false}
        onCreateTask={vi.fn()}
        onSaveCoreFields={vi.fn()}
        taskId="id-2"
        archiving={false}
        loading={false}
        onArchiveTask={vi.fn()}
        onHardDeleteTask={onHardDeleteTask}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Delete program/i }));
    fireEvent.click(screen.getByRole('button', { name: /Delete permanently/i }));
    await waitFor(() => {
      expect(screen.getByText(/3 child workout/i)).toBeTruthy();
    });
  });
});
