'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { LiveTheaterLayoutPlan } from '@/features/live-video/theater/live-theater-layout.types';

const LiveTheaterLayoutContext = createContext<LiveTheaterLayoutPlan | null>(null);

export function LiveTheaterLayoutProvider({
  value,
  children,
}: {
  value: LiveTheaterLayoutPlan;
  children: ReactNode;
}) {
  return (
    <LiveTheaterLayoutContext.Provider value={value}>{children}</LiveTheaterLayoutContext.Provider>
  );
}

export function useLiveTheaterLayoutPlanContext(): LiveTheaterLayoutPlan {
  const ctx = useContext(LiveTheaterLayoutContext);
  if (!ctx) {
    throw new Error('useLiveTheaterLayoutPlanContext requires LiveTheaterLayoutProvider');
  }
  return ctx;
}

/** Safe default when the shell does not wrap (e.g. isolated usage). */
export function useLiveTheaterLayoutPlanOptional(): LiveTheaterLayoutPlan | null {
  return useContext(LiveTheaterLayoutContext);
}
