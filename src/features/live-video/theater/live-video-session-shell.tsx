'use client';

import type { ReactNode } from 'react';
import { LiveTheaterLayoutProvider } from '@/features/live-video/theater/live-theater-layout-context';
import { useLiveSessionRuntimeOptional } from '@/features/live-video/theater/live-session-runtime-context';
import { useLiveTheaterLayoutPlan } from '@/features/live-video/theater/use-live-theater-layout-plan';
import type { LiveTheaterLayoutInputs } from '@/features/live-video/theater/live-theater-layout.types';

/** Provides derived `LiveTheaterLayoutPlan` under `LiveSessionRuntimeProvider`. */
export function LiveVideoSessionShell({
  theaterPlanDeps,
  children,
}: {
  theaterPlanDeps: Omit<LiveTheaterLayoutInputs, 'sessionUiKind'>;
  children: ReactNode;
}) {
  const runtime = useLiveSessionRuntimeOptional();
  const theaterPlan = useLiveTheaterLayoutPlan({
    ...theaterPlanDeps,
    sessionUiKind: runtime?.sessionUiKind,
  });
  return <LiveTheaterLayoutProvider value={theaterPlan}>{children}</LiveTheaterLayoutProvider>;
}
