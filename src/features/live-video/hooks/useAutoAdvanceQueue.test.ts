import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  didCrossRecenterBoundary,
  useAutoAdvanceQueue,
  type UseAutoAdvanceQueueArgs,
} from './useAutoAdvanceQueue';
import type { TeleprompterItem } from '@/lib/fitness/estimate-exercise-duration';

/** Nine 60s items → cumulative ends at 540s. */
function makeItems(count: number): TeleprompterItem[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `item-${i}`,
    deckItemId: `deck-${i}`,
    duration_min: 1,
  }));
}

describe('didCrossRecenterBoundary', () => {
  it('detects forward N=3 floor crossings (2→3, 5→6)', () => {
    expect(didCrossRecenterBoundary(2, 3, 3)).toBe(true);
    expect(didCrossRecenterBoundary(5, 6, 3)).toBe(true);
  });

  it('ignores same band and backward moves', () => {
    expect(didCrossRecenterBoundary(3, 4, 3)).toBe(false);
    expect(didCrossRecenterBoundary(3, 5, 3)).toBe(false);
    expect(didCrossRecenterBoundary(4, 2, 3)).toBe(false);
  });
});

describe('useAutoAdvanceQueue', () => {
  const items = makeItems(9);
  let scrollIntoView: ReturnType<typeof vi.fn>;
  let elements: Map<string, HTMLElement>;

  beforeEach(() => {
    scrollIntoView = vi.fn();
    elements = new Map();
    for (const item of items) {
      const el = document.createElement('div');
      el.scrollIntoView = scrollIntoView;
      elements.set(item.id, el);
    }
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function getItemElement(id: string) {
    return elements.get(id) ?? null;
  }

  function baseProps(overrides: Partial<UseAutoAdvanceQueueArgs> = {}): UseAutoAdvanceQueueArgs {
    return {
      enabled: true,
      items,
      elapsedMs: 0,
      getItemElement,
      recenterEvery: 3,
      ...overrides,
    };
  }

  it('keeps activeIndex at 0 when disabled or elapsedMs is null (no scroll)', () => {
    const { result, rerender } = renderHook(
      (props: UseAutoAdvanceQueueArgs) => useAutoAdvanceQueue(props),
      {
        initialProps: baseProps({ enabled: false, elapsedMs: 200_000 }),
      },
    );

    expect(result.current.activeIndex).toBe(0);
    expect(result.current.activeItemId).toBe('item-0');
    expect(scrollIntoView).not.toHaveBeenCalled();

    rerender(baseProps({ enabled: true, elapsedMs: null }));
    expect(result.current.activeIndex).toBe(0);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('scrolls once when entering index 3 (N=3 boundary)', () => {
    const { result, rerender } = renderHook(
      (props: UseAutoAdvanceQueueArgs) => useAutoAdvanceQueue(props),
      { initialProps: baseProps({ elapsedMs: 0 }) },
    );

    expect(result.current.activeIndex).toBe(0);
    expect(scrollIntoView).not.toHaveBeenCalled();

    rerender(baseProps({ elapsedMs: 180_000 }));

    expect(result.current.activeIndex).toBe(3);
    expect(result.current.activeItemId).toBe('item-3');
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center',
    });
  });

  it('does not scroll again for 3→4→5 within the same floor band', () => {
    const { result, rerender } = renderHook(
      (props: UseAutoAdvanceQueueArgs) => useAutoAdvanceQueue(props),
      { initialProps: baseProps({ elapsedMs: 0 }) },
    );

    vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    rerender(baseProps({ elapsedMs: 180_000 })); // → 3
    expect(result.current.activeIndex).toBe(3);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);

    vi.spyOn(Date, 'now').mockReturnValue(1_000_000 + 500);
    rerender(baseProps({ elapsedMs: 240_000 })); // → 4
    rerender(baseProps({ elapsedMs: 300_000 })); // → 5
    expect(result.current.activeIndex).toBe(5);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it('debounces a second boundary crossing within 400ms', () => {
    const { rerender } = renderHook(
      (props: UseAutoAdvanceQueueArgs) => useAutoAdvanceQueue(props),
      { initialProps: baseProps({ elapsedMs: 0 }) },
    );

    vi.spyOn(Date, 'now').mockReturnValue(2_000_000);
    rerender(baseProps({ elapsedMs: 180_000 })); // → 3
    expect(scrollIntoView).toHaveBeenCalledTimes(1);

    vi.spyOn(Date, 'now').mockReturnValue(2_000_000 + 100);
    rerender(baseProps({ elapsedMs: 360_000 })); // → 6 (next boundary)
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it('allows a second boundary scroll after the debounce window', () => {
    const { result, rerender } = renderHook(
      (props: UseAutoAdvanceQueueArgs) => useAutoAdvanceQueue(props),
      { initialProps: baseProps({ elapsedMs: 0 }) },
    );

    vi.spyOn(Date, 'now').mockReturnValue(3_000_000);
    rerender(baseProps({ elapsedMs: 180_000 })); // → 3
    expect(scrollIntoView).toHaveBeenCalledTimes(1);

    vi.spyOn(Date, 'now').mockReturnValue(3_000_000 + 400);
    rerender(baseProps({ elapsedMs: 360_000 })); // → 6
    expect(result.current.activeIndex).toBe(6);
    expect(scrollIntoView).toHaveBeenCalledTimes(2);
  });

  it('retries recenter after getItemElement was null on the boundary', () => {
    const { rerender } = renderHook(
      (props: UseAutoAdvanceQueueArgs) => useAutoAdvanceQueue(props),
      {
        initialProps: baseProps({
          elapsedMs: 0,
          getItemElement: () => null,
        }),
      },
    );

    vi.spyOn(Date, 'now').mockReturnValue(4_000_000);
    rerender(
      baseProps({
        elapsedMs: 180_000,
        getItemElement: () => null,
      }),
    );
    expect(scrollIntoView).not.toHaveBeenCalled();

    vi.spyOn(Date, 'now').mockReturnValue(4_000_000 + 500);
    rerender(baseProps({ elapsedMs: 181_000 }));
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it('exposes estimatedTotalSec without a host selection API', () => {
    const six = makeItems(6);
    for (const item of six) {
      if (!elements.has(item.id)) {
        const el = document.createElement('div');
        el.scrollIntoView = scrollIntoView;
        elements.set(item.id, el);
      }
    }

    const { result } = renderHook(() =>
      useAutoAdvanceQueue({
        enabled: true,
        items: six,
        elapsedMs: 0,
        getItemElement,
      }),
    );

    expect(result.current.estimatedTotalSec).toBe(360);
    expect(Object.keys(result.current).sort()).toEqual([
      'activeIndex',
      'activeItemId',
      'estimatedTotalSec',
    ]);
  });
});
