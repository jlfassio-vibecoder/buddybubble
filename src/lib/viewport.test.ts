import { afterEach, describe, expect, it, vi } from 'vitest';
import { NARROW_MAX_QUERY, readIsNarrowBelowMd } from '@/lib/viewport';

describe('readIsNarrowBelowMd', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns true when matchMedia matches narrow query', () => {
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({
          media: query,
          matches: query === NARROW_MAX_QUERY,
        }) as MediaQueryList,
    );
    expect(readIsNarrowBelowMd()).toBe(true);
  });

  it('returns false when matchMedia does not match', () => {
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({
          media: query,
          matches: false,
        }) as MediaQueryList,
    );
    expect(readIsNarrowBelowMd()).toBe(false);
  });
});
