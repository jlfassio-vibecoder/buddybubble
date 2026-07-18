'use client';

import { useEffect, useMemo, useRef } from 'react';
import {
  cumulativeDurationsSec,
  estimateQueueDurationsSec,
  findActiveIndexFromCumulative,
  type TeleprompterItem,
} from '@/lib/fitness/estimate-exercise-duration';

const DEFAULT_RECENTER_EVERY = 3;
const SCROLL_DEBOUNCE_MS = 400;

export type UseAutoAdvanceQueueArgs = {
  enabled: boolean;
  items: TeleprompterItem[];
  /** Elapsed ms since clock zero. null = paused / not running. */
  elapsedMs: number | null;
  getItemElement: (itemId: string) => HTMLElement | null;
  /** Recenter when active index crosses a multiple of this (default 3). */
  recenterEvery?: number;
};

export type UseAutoAdvanceQueueResult = {
  activeIndex: number;
  activeItemId: string | null;
  estimatedTotalSec: number;
};

/** True when nextIndex enters a higher floor(index / N) band than prevIndex (forward only). */
export function didCrossRecenterBoundary(
  prevIndex: number,
  nextIndex: number,
  recenterEvery: number,
): boolean {
  const n = Number.isFinite(recenterEvery) && recenterEvery > 0 ? Math.floor(recenterEvery) : 1;
  if (!Number.isFinite(prevIndex) || !Number.isFinite(nextIndex)) return false;
  if (nextIndex < prevIndex) return false;
  return Math.floor(nextIndex / n) > Math.floor(prevIndex / n);
}

/**
 * Teleprompter pacing: estimated active index from elapsed time + smooth recenter
 * every `recenterEvery` items. Does not mutate host deck selection.
 */
export function useAutoAdvanceQueue({
  enabled,
  items,
  elapsedMs,
  getItemElement,
  recenterEvery = DEFAULT_RECENTER_EVERY,
}: UseAutoAdvanceQueueArgs): UseAutoAdvanceQueueResult {
  const perItemSec = useMemo(() => estimateQueueDurationsSec(items), [items]);
  const cum = useMemo(() => cumulativeDurationsSec(perItemSec), [perItemSec]);
  const estimatedTotalSec = cum.length > 0 ? (cum[cum.length - 1] ?? 0) : 0;

  const activeIndex = useMemo(() => {
    if (!enabled || elapsedMs == null || items.length === 0) return 0;
    return findActiveIndexFromCumulative(cum, elapsedMs / 1000);
  }, [cum, elapsedMs, enabled, items.length]);

  const activeItemId = items[activeIndex]?.id ?? null;

  const prevActiveIndexRef = useRef(activeIndex);
  const lastScrollAtRef = useRef(0);
  const getItemElementRef = useRef(getItemElement);
  getItemElementRef.current = getItemElement;

  useEffect(() => {
    if (!enabled || elapsedMs == null || !activeItemId) {
      prevActiveIndexRef.current = activeIndex;
      return;
    }

    const prev = prevActiveIndexRef.current;
    if (!didCrossRecenterBoundary(prev, activeIndex, recenterEvery)) {
      prevActiveIndexRef.current = activeIndex;
      return;
    }

    // Boundary crossed: only advance prev after a successful scroll so a missing
    // DOM node or debounce miss can retry on the next elapsed tick.
    const now = Date.now();
    if (now - lastScrollAtRef.current < SCROLL_DEBOUNCE_MS) return;

    const el = getItemElementRef.current(activeItemId);
    if (!el) return;

    lastScrollAtRef.current = now;
    prevActiveIndexRef.current = activeIndex;
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [activeIndex, activeItemId, elapsedMs, enabled, recenterEvery]);

  return { activeIndex, activeItemId, estimatedTotalSec };
}
