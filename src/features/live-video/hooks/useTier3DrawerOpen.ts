'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type UseTier3DrawerOpenArgs = {
  selectionKey: string | null;
  selectionActive: boolean;
};

/**
 * Tier 3 push-drawer open state (T3-SELECTION-AUTO-OPEN).
 * Auto-opens on new selection; manual dismiss does not clear selection.
 */
export function useTier3DrawerOpen({ selectionKey, selectionActive }: UseTier3DrawerOpenArgs) {
  const [open, setOpen] = useState(false);
  const prevSelectionKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const prevKey = prevSelectionKeyRef.current;

    if (selectionKey == null) {
      setOpen(false);
    } else if (selectionActive && (prevKey == null || prevKey !== selectionKey)) {
      setOpen(true);
    }

    prevSelectionKeyRef.current = selectionKey;
  }, [selectionKey, selectionActive]);

  const onOpenChange = useCallback((next: boolean) => {
    setOpen(next);
  }, []);

  return { open, onOpenChange };
}
