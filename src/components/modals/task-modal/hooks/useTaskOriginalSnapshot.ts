'use client';

import type { MutableRefObject } from 'react';
import { useCallback, useRef } from 'react';
import type { TaskModalOriginalSnapshot } from '@/components/modals/task-modal/task-modal-save-utils';

export function useTaskOriginalSnapshot(): {
  originalRef: MutableRefObject<TaskModalOriginalSnapshot | null>;
  setOriginalFromAppliedRow: (snapshot: TaskModalOriginalSnapshot) => void;
  clearOriginal: () => void;
  patchOriginalMetadataJson: (metadataJson: string) => void;
  patchOriginalCoreText: (next: { title: string; description: string }) => void;
} {
  const originalRef = useRef<TaskModalOriginalSnapshot | null>(null);

  const setOriginalFromAppliedRow = useCallback((snapshot: TaskModalOriginalSnapshot) => {
    originalRef.current = snapshot;
  }, []);

  const clearOriginal = useCallback(() => {
    originalRef.current = null;
  }, []);

  const patchOriginalMetadataJson = useCallback((metadataJson: string) => {
    if (originalRef.current) {
      originalRef.current = {
        ...originalRef.current,
        metadataJson,
      };
    }
  }, []);

  const patchOriginalCoreText = useCallback((next: { title: string; description: string }) => {
    if (originalRef.current) {
      originalRef.current = {
        ...originalRef.current,
        title: next.title,
        description: next.description,
      };
    }
  }, []);

  return {
    originalRef,
    setOriginalFromAppliedRow,
    clearOriginal,
    patchOriginalMetadataJson,
    patchOriginalCoreText,
  };
}
