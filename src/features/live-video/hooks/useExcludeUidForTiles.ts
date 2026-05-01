'use client';

import { useMemo } from 'react';

import { getIntervalWrapper } from '@/features/live-video/wrappers/registry';
import type { IntervalWrapperKind } from '@/features/live-video/wrappers/types';

export function useExcludeUidForTiles(
  intervalWrapperKind: IntervalWrapperKind,
  hostParticipantId: string | null,
): string | null {
  return useMemo(() => {
    const entry = getIntervalWrapper(intervalWrapperKind);
    return entry?.hasVideoBackground ? hostParticipantId : null;
  }, [intervalWrapperKind, hostParticipantId]);
}
