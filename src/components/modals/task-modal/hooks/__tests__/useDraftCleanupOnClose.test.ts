import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useDraftCleanupOnClose } from '@/components/modals/task-modal/hooks/useDraftCleanupOnClose';
import * as cleanupLogic from '@/components/modals/task-modal/task-draft-cleanup-logic';

vi.mock('@/components/modals/task-modal/task-draft-cleanup-logic', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('@/components/modals/task-modal/task-draft-cleanup-logic')
    >();
  return {
    ...actual,
    tryDeleteUntouchedOptimisticDraft: vi.fn().mockResolvedValue('kept'),
  };
});

describe('useDraftCleanupOnClose', () => {
  beforeEach(() => {
    vi.mocked(cleanupLogic.tryDeleteUntouchedOptimisticDraft).mockClear().mockResolvedValue('kept');
  });

  it('invokes tryDelete when modal transitions from open to closed', () => {
    const baseline = {
      title: 'Untitled',
      description: null,
      metadataJson: '{}',
      priority: 'medium',
      visibility: 'private',
      status: 'todo',
      position: 0,
      scheduledOn: '',
      scheduledTime: '',
      attachmentsJson: '[]',
      subtasksJson: '[]',
    };
    const hardDeleteTask = vi.fn();
    const onUntouchedDraftDeleted = vi.fn();

    const { rerender } = renderHook(
      (p: { open: boolean }) =>
        useDraftCleanupOnClose({
          open: p.open,
          taskId: 'tid',
          isOptimisticDraft: true,
          baseline,
          hardDeleteTask,
          onUntouchedDraftDeleted,
        }),
      { initialProps: { open: true } },
    );

    rerender({ open: false });
    expect(cleanupLogic.tryDeleteUntouchedOptimisticDraft).toHaveBeenCalled();
  });
});
