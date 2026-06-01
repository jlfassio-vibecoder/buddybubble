'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { AmrapSessionEngine } from '@/features/amrap/types/amrap-engine';

export type AmrapRailState = {
  amrapSessionId: string | null;
  engine: AmrapSessionEngine | null;
  isHost: boolean;
};

type AmrapRailContextValue = AmrapRailState & {
  setAmrapRail: (state: AmrapRailState) => void;
};

const emptyState: AmrapRailState = {
  amrapSessionId: null,
  engine: null,
  isHost: false,
};

const AmrapRailContext = createContext<AmrapRailContextValue | null>(null);

export function AmrapRailProvider({ children }: { children: ReactNode }) {
  const [rail, setAmrapRail] = useState<AmrapRailState>(emptyState);
  const value = useMemo(
    () => ({
      ...rail,
      setAmrapRail,
    }),
    [rail],
  );
  return <AmrapRailContext.Provider value={value}>{children}</AmrapRailContext.Provider>;
}

export function useAmrapRailOptional(): AmrapRailContextValue | null {
  return useContext(AmrapRailContext);
}

export function useAmrapRail(): AmrapRailContextValue {
  const ctx = useContext(AmrapRailContext);
  if (!ctx) {
    throw new Error('useAmrapRail must be used within AmrapRailProvider');
  }
  return ctx;
}

export { emptyState as emptyAmrapRailState };
