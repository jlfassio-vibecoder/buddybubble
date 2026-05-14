'use client';

import { useEffect, useRef } from 'react';

export type UseDeepLinkMessageScrollArgs = {
  taskId: string;
  initialCommentThreadMessageId?: string | null;
  isLoading: boolean;
  /** Minimal shape: need `id` for presence check and DOM `data-message-id`. */
  messages: ReadonlyArray<{ id?: string | null }>;
};

/**
 * Scrolls to `initialCommentThreadMessageId` once per `(taskId, messageId)` when the row exists.
 * Extracted from the former task-modal comments rail wrapper (Phase 3.7).
 */
export function useDeepLinkMessageScroll({
  taskId,
  initialCommentThreadMessageId = null,
  isLoading,
  messages,
}: UseDeepLinkMessageScrollArgs): void {
  const deepLinkConsumedRef = useRef(false);

  useEffect(() => {
    deepLinkConsumedRef.current = false;
  }, [taskId, initialCommentThreadMessageId]);

  useEffect(() => {
    if (!taskId.trim()) return;
    const raw = initialCommentThreadMessageId?.trim();
    if (!raw || isLoading || deepLinkConsumedRef.current) return;
    if (!messages.some((m) => m.id === raw)) return;

    const t = window.setTimeout(() => {
      const el = document.querySelector(`[data-message-id="${CSS.escape(raw)}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      deepLinkConsumedRef.current = true;
    }, 150);

    return () => window.clearTimeout(t);
  }, [initialCommentThreadMessageId, isLoading, messages]);
}
