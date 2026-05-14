'use client';

import { useEffect, useRef } from 'react';
import type { TaskDraftBaseline } from '@/components/modals/task-modal/task-draft-types';
import { tryDeleteUntouchedOptimisticDraft } from '@/components/modals/task-modal/task-draft-cleanup-logic';

export type UseDraftCleanupOnCloseArgs = {
  open: boolean;
  taskId: string | null;
  isOptimisticDraft: boolean;
  baseline: TaskDraftBaseline | null;
  hardDeleteTask: (id: string) => Promise<void>;
  /** Called after the server confirms an untouched optimistic draft was hard-deleted. */
  onUntouchedDraftDeleted?: () => void;
};

/**
 * When the modal closes, hard-delete an optimistic draft that still matches the
 * insert baseline on the server and has no comments yet.
 */
export function useDraftCleanupOnClose({
  open,
  taskId,
  isOptimisticDraft,
  baseline,
  hardDeleteTask,
  onUntouchedDraftDeleted,
}: UseDraftCleanupOnCloseArgs): void {
  const prevOpenRef = useRef(open);

  useEffect(() => {
    const prev = prevOpenRef.current;
    prevOpenRef.current = open;

    if (prev && !open) {
      if (!taskId || !isOptimisticDraft || !baseline) return;
      void tryDeleteUntouchedOptimisticDraft({ taskId, baseline, hardDeleteTask }).then((r) => {
        if (r === 'deleted') {
          onUntouchedDraftDeleted?.();
        }
      });
    }
  }, [open, taskId, isOptimisticDraft, baseline, hardDeleteTask, onUntouchedDraftDeleted]);
}
