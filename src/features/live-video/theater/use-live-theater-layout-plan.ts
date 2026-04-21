'use client';

import { useMemo } from 'react';
import {
  deriveLiveTheaterLayoutPlan,
  type LiveTheaterLayoutInputs,
  type LiveTheaterLayoutPlan,
} from '@/features/live-video/theater/live-theater-layout.types';

export function useLiveTheaterLayoutPlan(inputs: LiveTheaterLayoutInputs): LiveTheaterLayoutPlan {
  const {
    hasLiveVideoSession,
    isSelectingFromBoard,
    layoutMobile,
    embedMode,
    layoutHydrated,
    sessionUiKind,
  } = inputs;

  return useMemo(
    () =>
      deriveLiveTheaterLayoutPlan({
        hasLiveVideoSession,
        isSelectingFromBoard,
        layoutMobile,
        embedMode,
        layoutHydrated,
        sessionUiKind,
      }),
    [
      hasLiveVideoSession,
      isSelectingFromBoard,
      layoutMobile,
      embedMode,
      layoutHydrated,
      sessionUiKind,
    ],
  );
}
