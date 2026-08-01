import { describe, expect, it, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { TaskModalCoverHeader } from '@/components/modals/task-modal/TaskModalCoverHeader';

vi.mock('@/lib/task-card-cover', () => ({
  useTaskCardCoverUrl: () => ({ url: null }),
}));

const baseProps = {
  itemType: 'task' as const,
  onItemTypeChange: vi.fn(),
  canManageClasses: false,
  canWrite: true,
  visibility: 'private' as const,
  title: 'Coach title',
  description: 'Coach description',
  onTitleChange: vi.fn(),
  onDescriptionChange: vi.fn(),
  onClose: vi.fn(),
};

describe('TaskModalCoverHeader', () => {
  afterEach(() => {
    cleanup();
  });

  it('shows Coach chrome when title and description agent flags are set', () => {
    render(<TaskModalCoverHeader {...baseProps} titleAgent descriptionAgent />);

    expect(screen.getByTestId('task-modal-cover-title-agent')).toBeTruthy();
    expect(screen.getByTestId('task-modal-cover-desc-agent')).toBeTruthy();
    expect(screen.getByLabelText('Title')).toBeTruthy();
    expect(screen.getByLabelText('Description')).toBeTruthy();
  });

  it('hides Coach chrome when agent flags are false', () => {
    render(<TaskModalCoverHeader {...baseProps} />);

    expect(screen.queryByTestId('task-modal-cover-title-agent')).toBeNull();
    expect(screen.queryByTestId('task-modal-cover-desc-agent')).toBeNull();
  });
});
