'use client';

import type { MutableRefObject } from 'react';
import { useCallback, useRef, useState } from 'react';
import type { TaskModalOriginalSnapshot } from '@/components/modals/task-modal/task-modal-save-utils';

export function useTaskOriginalSnapshot(): {
  /** Sync mirror for event handlers / dirty checks mid-render. Prefer `originalSnapshot` in memos. */
  originalRef: MutableRefObject<TaskModalOriginalSnapshot | null>;
  /** React state that updates on set/patch/clear — safe `useMemo` dependency. */
  originalSnapshot: TaskModalOriginalSnapshot | null;
  setOriginalFromAppliedRow: (snapshot: TaskModalOriginalSnapshot) => void;
  clearOriginal: () => void;
  patchOriginalMetadataJson: (metadataJson: string) => void;
  patchOriginalCoreText: (next: { title: string; description: string }) => void;
} {
  const originalRef = useRef<TaskModalOriginalSnapshot | null>(null);
  const [originalSnapshot, setOriginalSnapshot] = useState<TaskModalOriginalSnapshot | null>(null);

  const applySnapshot = useCallback((next: TaskModalOriginalSnapshot | null) => {
    originalRef.current = next;
    setOriginalSnapshot(next);
  }, []);

  const setOriginalFromAppliedRow = useCallback(
    (snapshot: TaskModalOriginalSnapshot) => {
      applySnapshot(snapshot);
    },
    [applySnapshot],
  );

  const clearOriginal = useCallback(() => {
    applySnapshot(null);
  }, [applySnapshot]);

  const patchOriginalMetadataJson = useCallback(
    (metadataJson: string) => {
      const cur = originalRef.current;
      if (!cur) return;
      applySnapshot({
        ...cur,
        metadataJson,
      });
    },
    [applySnapshot],
  );

  const patchOriginalCoreText = useCallback(
    (next: { title: string; description: string }) => {
      const cur = originalRef.current;
      if (!cur) return;
      applySnapshot({
        ...cur,
        title: next.title,
        description: next.description,
      });
    },
    [applySnapshot],
  );

  return {
    originalRef,
    originalSnapshot,
    setOriginalFromAppliedRow,
    clearOriginal,
    patchOriginalMetadataJson,
    patchOriginalCoreText,
  };
}
