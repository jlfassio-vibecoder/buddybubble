'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

type Value = {
  hostNavActions: ReactNode;
  setHostNavActions: (node: ReactNode) => void;
};

const HostNavActionsContext = createContext<Value | null>(null);

export function HostNavActionsProvider({ children }: { children: ReactNode }) {
  const [hostNavActions, setHostNavActions] = useState<ReactNode>(null);
  const value = useMemo(() => ({ hostNavActions, setHostNavActions }), [hostNavActions]);
  return <HostNavActionsContext.Provider value={value}>{children}</HostNavActionsContext.Provider>;
}

export function useHostNavActions(): Value {
  const ctx = useContext(HostNavActionsContext);
  if (!ctx) {
    throw new Error('useHostNavActions must be used within HostNavActionsProvider');
  }
  return ctx;
}

export function useHostNavActionsOptional(): Value | null {
  return useContext(HostNavActionsContext);
}
