import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { NARROW_MAX_QUERY } from '@/lib/viewport';
import { useIsNarrowBelowMd } from './use-is-narrow-below-md';

function mediaQueryListStub(query: string, matches: boolean): MediaQueryList {
  return {
    media: query,
    matches,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  } as unknown as MediaQueryList;
}

describe('useIsNarrowBelowMd', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('queries NARROW_MAX_QUERY and returns true when matchMedia reports a match', async () => {
    const matchMediaSpy = vi
      .spyOn(window, 'matchMedia')
      .mockImplementation((query: string) => mediaQueryListStub(query, query === NARROW_MAX_QUERY));

    const { result } = renderHook(() => useIsNarrowBelowMd());

    expect(result.current).toBe(true);
    expect(matchMediaSpy).toHaveBeenCalledWith(NARROW_MAX_QUERY);
  });

  it('returns false when matchMedia reports no match for the narrow query', async () => {
    vi.spyOn(window, 'matchMedia').mockImplementation((query: string) =>
      mediaQueryListStub(query, false),
    );

    const { result } = renderHook(() => useIsNarrowBelowMd());

    await waitFor(() => expect(result.current).toBe(false));
  });
});
