import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  clearExerciseDictionaryAutocompleteCache,
  loadExerciseDictionaryForAutocomplete,
  resetExerciseDictionaryAutocompleteCacheForTests,
} from '@/lib/exercise-dictionary-autocomplete-cache';

const TTL_MS = 5 * 60 * 1000;

let fetchCount = 0;
let mockData: { id: string; name: string; slug: string; status: string }[] = [];

function makeMockClient(): SupabaseClient {
  return {
    from: (table: string) => {
      expect(table).toBe('exercise_dictionary');
      return {
        select: () => ({
          order: () => ({
            limit: (_n: number) => {
              fetchCount += 1;
              return Promise.resolve({ data: mockData, error: null });
            },
          }),
        }),
      };
    },
  } as unknown as SupabaseClient;
}

function row(id: string, name: string) {
  return { id, name, slug: name.toLowerCase().replace(/\s+/g, '-'), status: 'published' };
}

describe('exercise-dictionary-autocomplete-cache (RLS)', () => {
  let mock: SupabaseClient;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-29T12:00:00.000Z'));
    resetExerciseDictionaryAutocompleteCacheForTests();
    fetchCount = 0;
    mock = makeMockClient();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the same data on second call within TTL without a second query', async () => {
    mockData = [row('1', 'A')];
    const a = await loadExerciseDictionaryForAutocomplete(mock, { userId: 'u1' });
    const b = await loadExerciseDictionaryForAutocomplete(mock, { userId: 'u1' });
    expect(fetchCount).toBe(1);
    expect(b).toEqual(a);
  });

  it('key separation: different users have separate cache entries', async () => {
    const firstUserRows = [row('a1', 'Alpha')];
    const secondUserRows = [row('b1', 'Bravo')];

    mockData = firstUserRows;
    const u1First = await loadExerciseDictionaryForAutocomplete(mock, { userId: 'userA' });
    expect(fetchCount).toBe(1);
    expect(u1First[0]!.name).toBe('Alpha');

    mockData = secondUserRows;
    const u2 = await loadExerciseDictionaryForAutocomplete(mock, { userId: 'userB' });
    expect(fetchCount).toBe(2);
    expect(u2[0]!.name).toBe('Bravo');

    // userA cache must still be Alpha; no fetch
    const u1Again = await loadExerciseDictionaryForAutocomplete(mock, { userId: 'userA' });
    expect(fetchCount).toBe(2);
    expect(u1Again[0]!.name).toBe('Alpha');
  });

  it('force: true bypasses TTL and fetches again', async () => {
    mockData = [row('1', 'One')];
    const first = await loadExerciseDictionaryForAutocomplete(mock, { userId: 'u' });
    expect(first[0]!.name).toBe('One');
    expect(fetchCount).toBe(1);

    vi.advanceTimersByTime(TTL_MS - 1000);

    mockData = [row('1', 'Two')];
    const second = await loadExerciseDictionaryForAutocomplete(mock, { userId: 'u', force: true });
    expect(fetchCount).toBe(2);
    expect(second[0]!.name).toBe('Two');
  });

  it('clearExerciseDictionaryAutocompleteCache invalidates all users', async () => {
    mockData = [row('a1', 'A')];
    await loadExerciseDictionaryForAutocomplete(mock, { userId: 'A' });
    expect(fetchCount).toBe(1);
    mockData = [row('b1', 'B')];
    await loadExerciseDictionaryForAutocomplete(mock, { userId: 'B' });
    expect(fetchCount).toBe(2);

    clearExerciseDictionaryAutocompleteCache();
    await loadExerciseDictionaryForAutocomplete(mock, { userId: 'A' });
    await loadExerciseDictionaryForAutocomplete(mock, { userId: 'B' });
    expect(fetchCount).toBe(4);
  });
});
