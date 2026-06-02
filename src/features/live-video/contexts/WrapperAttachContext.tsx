'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

export type WrapperAttachOverride = {
  kind: 'amrap' | 'amrap_minimal' | 'tabata' | 'emom';
  config: { interval_session_id: string };
} | null;

type Value = {
  override: WrapperAttachOverride;
  setOverride: (next: WrapperAttachOverride) => void;
};

const WrapperAttachContext = createContext<Value | null>(null);

export function WrapperAttachProvider({ children }: { children: ReactNode }) {
  const [override, setOverride] = useState<WrapperAttachOverride>(null);
  const value = useMemo(() => ({ override, setOverride }), [override]);
  return <WrapperAttachContext.Provider value={value}>{children}</WrapperAttachContext.Provider>;
}

export function useWrapperAttach(): Value {
  const ctx = useContext(WrapperAttachContext);
  if (!ctx) {
    throw new Error('useWrapperAttach must be used within WrapperAttachProvider');
  }
  return ctx;
}

export function useWrapperAttachOptional(): Value | null {
  return useContext(WrapperAttachContext);
}
