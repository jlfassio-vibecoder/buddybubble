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

const galleryProps = {
  attachments: [imageAtt, pdfAtt] as TaskAttachment[],
  canWrite: true,
  isCreateMode: false,
  taskId: 't1',
  typeNoun: 'memory',
  onPickAttachmentFile: vi.fn(),
  onDownloadAttachment: vi.fn(),
  onRemoveAttachment: vi.fn(),
};

describe('TaskModalMemoryCanvas', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders image tiles and ignores non-images', () => {
    render(<TaskModalMemoryCanvas {...galleryProps} />);

    expect(screen.getByTestId('task-modal-memory-gallery')).toBeTruthy();
    expect(screen.getByTestId('thumb-ws/t/sunset.jpg')).toBeTruthy();
    expect(screen.queryByTestId('thumb-ws/t/notes.pdf')).toBeNull();
    expect(screen.getByTestId('task-modal-memory-add-photo')).toBeTruthy();
  });

  it('invokes pick handler from add tile', () => {
    const onPick = vi.fn();
    render(
      <TaskModalMemoryCanvas {...galleryProps} attachments={[]} onPickAttachmentFile={onPick} />,
    );

    const input = screen.getByTestId('task-modal-memory-add-photo').querySelector('input');
    expect(input).toBeTruthy();
    const file = new File(['x'], 'new.png', { type: 'image/png' });
    fireEvent.change(input!, { target: { files: [file] } });
    expect(onPick).toHaveBeenCalledWith(file);
  });

  it('hides add tile in create mode', () => {
    render(<TaskModalMemoryCanvas {...galleryProps} attachments={[]} isCreateMode taskId={null} />);

    expect(screen.queryByTestId('task-modal-memory-add-photo')).toBeNull();
    expect(screen.getByTestId('task-modal-memory-empty')).toBeTruthy();
  });

  it('shows linked event chip when read-only and value present', () => {
    render(
      <TaskModalMemoryCanvas {...galleryProps} canWrite={false} memoryLinkedEvent="Block Party" />,
    );
    expect(screen.getByTestId('task-modal-memory-linked-event-chip').textContent).toMatch(
      /Block Party/,
    );
  });

  it('shows people count and toggles reactions', () => {
    const onReactions = vi.fn();
    render(
      <TaskModalMemoryCanvas
        {...galleryProps}
        memoryPeople={['JF', 'MK']}
        onMemoryPeopleChange={vi.fn()}
        memoryReactions={[{ emoji: '🎉', count: 2, reacted_by: [] }]}
        onMemoryReactionsChange={onReactions}
        currentUserId="u1"
      />,
    );

    expect(screen.getByTestId('task-modal-memory-people').textContent).toMatch(/2 tagged/);
    const reactBtn = screen.getByTestId('chat-message-reaction-pills').querySelector('button');
    expect(reactBtn).toBeTruthy();
    fireEvent.click(reactBtn!);
    expect(onReactions).toHaveBeenCalled();
    const next = onReactions.mock.calls[0]?.[0] as { emoji: string; reacted_by: string[] }[];
    expect(next.some((r) => r.emoji === '🎉' && r.reacted_by.includes('u1'))).toBe(true);
  });
});
