'use client';

import { useCallback, useState } from 'react';
import type { MessageAttachment } from '@/types/message-attachment';

export type TaskCommentMediaModalState = {
  attachments: MessageAttachment[];
  index: number;
} | null;

/**
 * Attachment preview modal for task comments / standard rail `chatRowExtras.onOpenAttachment`.
 * Extracted from the former task-modal comments rail wrapper (Phase 3.7).
 */
export function useTaskCommentMediaModal() {
  const [mediaModal, setMediaModal] = useState<TaskCommentMediaModalState>(null);

  const onOpenAttachment = useCallback((attachments: MessageAttachment[], index: number) => {
    setMediaModal({ attachments, index });
  }, []);

  const onMediaModalOpenChange = useCallback((open: boolean) => {
    if (!open) setMediaModal(null);
  }, []);

  return {
    mediaModal,
    onOpenAttachment,
    onMediaModalOpenChange,
  };
}
