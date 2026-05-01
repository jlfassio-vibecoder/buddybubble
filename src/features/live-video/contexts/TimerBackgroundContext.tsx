'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

type Value = {
  spotlightParticipantId: string | null;
  setSpotlightParticipantId: (id: string | null) => void;
};

const TimerBackgroundContext = createContext<Value | null>(null);

export function TimerBackgroundProvider({ children }: { children: ReactNode }) {
  const [spotlightParticipantId, setSpotlightParticipantId] = useState<string | null>(null);
  const value = useMemo(
    () => ({ spotlightParticipantId, setSpotlightParticipantId }),
    [spotlightParticipantId],
  );
  return (
    <TimerBackgroundContext.Provider value={value}>{children}</TimerBackgroundContext.Provider>
  );
}

export function useTimerBackground(): Value {
  const ctx = useContext(TimerBackgroundContext);
  if (!ctx) {
    throw new Error('useTimerBackground must be used within TimerBackgroundProvider');
  }
  return ctx;
}
