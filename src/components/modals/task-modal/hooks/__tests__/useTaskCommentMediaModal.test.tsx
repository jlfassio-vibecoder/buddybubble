import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTaskCommentMediaModal } from '@/components/modals/task-modal/hooks/useTaskCommentMediaModal';
import type { MessageAttachment } from '@/types/message-attachment';

describe('useTaskCommentMediaModal', () => {
  it('opens modal state via onOpenAttachment', () => {
    const { result } = renderHook(() => useTaskCommentMediaModal());
    expect(result.current.mediaModal).toBeNull();

    const att: MessageAttachment = {
      id: 'a1',
      kind: 'image',
      path: 'p1',
      file_name: 'x.png',
      mime_type: 'image/png',
      size_bytes: 1,
      uploaded_at: new Date().toISOString(),
    };

    act(() => {
      result.current.onOpenAttachment([att], 0);
    });

    expect(result.current.mediaModal).toEqual({
      attachments: [att],
      index: 0,
    });

    act(() => {
      result.current.onMediaModalOpenChange(false);
    });
    expect(result.current.mediaModal).toBeNull();
  });
});
