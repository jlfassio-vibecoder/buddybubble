import { describe, expect, it, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TaskModalDetailsStickyFooter } from '@/components/modals/task-modal/TaskModalDetailsStickyFooter';

describe('TaskModalDetailsStickyFooter', () => {
  afterEach(() => {
    cleanup();
  });

  it('shows All changes saved when edit mode is clean', () => {
    render(
      <TaskModalDetailsStickyFooter
        canWrite
        isCreateMode={false}
        saving={false}
        title="T"
        typeNoun="task"
        coreDirty={false}
        onCancel={vi.fn()}
        onCreateTask={vi.fn()}
        onSaveCoreFields={vi.fn()}
      />,
    );

    expect(screen.getByTestId('task-modal-details-footer-hint').textContent).toMatch(
      /All changes saved/,
    );
    expect((screen.getByRole('button', { name: 'Save task' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('shows Unsaved changes and enables Save when dirty', () => {
    const onSave = vi.fn();
    render(
      <TaskModalDetailsStickyFooter
        canWrite
        isCreateMode={false}
        saving={false}
        title="T"
        typeNoun="task"
        coreDirty
        onCancel={vi.fn()}
        onCreateTask={vi.fn()}
        onSaveCoreFields={onSave}
      />,
    );

    expect(screen.getByText('Unsaved changes')).toBeTruthy();
    const save = screen.getByRole('button', { name: 'Save task' }) as HTMLButtonElement;
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('wires Cancel without calling save', () => {
    const onCancel = vi.fn();
    const onSave = vi.fn();
    render(
      <TaskModalDetailsStickyFooter
        canWrite
        isCreateMode={false}
        saving={false}
        title="T"
        typeNoun="task"
        coreDirty
        onCancel={onCancel}
        onCreateTask={vi.fn()}
        onSaveCoreFields={onSave}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('create mode: title gate and Create label', () => {
    const onCreate = vi.fn();
    const { rerender } = render(
      <TaskModalDetailsStickyFooter
        canWrite
        isCreateMode
        saving={false}
        title=""
        typeNoun="idea"
        coreDirty={false}
        onCancel={vi.fn()}
        onCreateTask={onCreate}
        onSaveCoreFields={vi.fn()}
      />,
    );

    expect(screen.getByText('Add a title to create')).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Create idea' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    rerender(
      <TaskModalDetailsStickyFooter
        canWrite
        isCreateMode
        saving={false}
        title="New idea"
        typeNoun="idea"
        coreDirty
        onCancel={vi.fn()}
        onCreateTask={onCreate}
        onSaveCoreFields={vi.fn()}
      />,
    );

    expect(screen.getByText('Unsaved changes')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Create idea' }));
    expect(onCreate).toHaveBeenCalledTimes(1);
  });
});
