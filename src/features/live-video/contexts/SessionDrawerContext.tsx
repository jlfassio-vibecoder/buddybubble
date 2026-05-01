'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

type Value = {
  sessionDrawerNode: ReactNode;
  setSessionDrawerNode: (node: ReactNode) => void;
};

const SessionDrawerContext = createContext<Value | null>(null);

export function SessionDrawerProvider({ children }: { children: ReactNode }) {
  const [sessionDrawerNode, setSessionDrawerNode] = useState<ReactNode>(null);
  const value = useMemo(() => ({ sessionDrawerNode, setSessionDrawerNode }), [sessionDrawerNode]);
  return <SessionDrawerContext.Provider value={value}>{children}</SessionDrawerContext.Provider>;
}

export function useSessionDrawer(): Value {
  const ctx = useContext(SessionDrawerContext);
  if (!ctx) {
    throw new Error('useSessionDrawer must be used within SessionDrawerProvider');
  }
  return ctx;
}

export function useSessionDrawerOptional(): Value | null {
  return useContext(SessionDrawerContext);
}
