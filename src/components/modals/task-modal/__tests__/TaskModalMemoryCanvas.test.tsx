import { describe, expect, it, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TaskModalMemoryCanvas } from '@/components/modals/task-modal/TaskModalMemoryCanvas';
import type { TaskAttachment } from '@/types/task-modal';

vi.mock('@/components/modals/task-modal/task-modal-media', () => ({
  TaskAttachmentImagePreview: ({ path }: { path: string }) => (
    <span data-testid={`thumb-${path}`}>{path}</span>
  ),
}));

const imageAtt: TaskAttachment = {
  id: 'a1',
  name: 'sunset.jpg',
  path: 'ws/t/sunset.jpg',
  size: 100,
  uploaded_at: '2026-01-01T00:00:00Z',
};

const pdfAtt: TaskAttachment = {
  id: 'a2',
  name: 'notes.pdf',
  path: 'ws/t/notes.pdf',
  size: 50,
  uploaded_at: '2026-01-01T00:00:00Z',
};

describe('TaskModalMemoryCanvas', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders image tiles and ignores non-images', () => {
    render(
      <TaskModalMemoryCanvas
        attachments={[imageAtt, pdfAtt]}
        canWrite
        isCreateMode={false}
        taskId="t1"
        typeNoun="memory"
        onPickAttachmentFile={vi.fn()}
        onDownloadAttachment={vi.fn()}
        onRemoveAttachment={vi.fn()}
      />,
    );

    expect(screen.getByTestId('task-modal-memory-gallery')).toBeTruthy();
    expect(screen.getByTestId('thumb-ws/t/sunset.jpg')).toBeTruthy();
    expect(screen.queryByTestId('thumb-ws/t/notes.pdf')).toBeNull();
    expect(screen.getByTestId('task-modal-memory-add-photo')).toBeTruthy();
  });

  it('invokes pick handler from add tile', () => {
    const onPick = vi.fn();
    render(
      <TaskModalMemoryCanvas
        attachments={[]}
        canWrite
        isCreateMode={false}
        taskId="t1"
        typeNoun="memory"
        onPickAttachmentFile={onPick}
        onDownloadAttachment={vi.fn()}
        onRemoveAttachment={vi.fn()}
      />,
    );

    const input = screen.getByTestId('task-modal-memory-add-photo').querySelector('input');
    expect(input).toBeTruthy();
    const file = new File(['x'], 'new.png', { type: 'image/png' });
    fireEvent.change(input!, { target: { files: [file] } });
    expect(onPick).toHaveBeenCalledWith(file);
  });

  it('hides add tile in create mode', () => {
    render(
      <TaskModalMemoryCanvas
        attachments={[]}
        canWrite
        isCreateMode
        taskId={null}
        typeNoun="memory"
        onPickAttachmentFile={vi.fn()}
        onDownloadAttachment={vi.fn()}
        onRemoveAttachment={vi.fn()}
      />,
    );

    expect(screen.queryByTestId('task-modal-memory-add-photo')).toBeNull();
    expect(screen.getByTestId('task-modal-memory-empty')).toBeTruthy();
  });
});
