import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseClientErrorMessage } from '@/lib/supabase-client-error';
import type { Database } from '@/types/database';

const TTL_MS = 5 * 60 * 1000;

export type ExerciseDictionaryAutocompleteRow = {
  id: string;
  name: string;
  slug: string;
  status: 'published' | 'pending';
};

type CacheEntry = {
  rows: ExerciseDictionaryAutocompleteRow[];
  loadedAt: number;
};

const cacheByUserId = new Map<string, CacheEntry>();
/** Coalesce concurrent non-force fetches for the same userId. */
const inFlightByUserId = new Map<string, Promise<ExerciseDictionaryAutocompleteRow[]>>();

function narrowStatus(s: string): 'published' | 'pending' | null {
  if (s === 'published' || s === 'pending') return s;
  return null;
}

/**
 * RLS-scoped `exercise_dictionary` rows for `#` exercise autocomplete.
 * No status filter — RLS enforces published + own pending (+ trainer/admin).
 */
export async function loadExerciseDictionaryForAutocomplete(
  supabase: SupabaseClient<Database>,
  opts: { userId: string; limit?: number; force?: boolean },
): Promise<ExerciseDictionaryAutocompleteRow[]> {
  const { userId, limit = 1000, force = false } = opts;
  const now = Date.now();
  const hit = cacheByUserId.get(userId);
  if (!force && hit && now - hit.loadedAt < TTL_MS) {
    const rows = hit.rows;
    // Copilot suggestion ignored: [DEBUG] tripwires kept for post-merge manual QA; removed in a follow-up.
    console.log('[DEBUG][autocomplete-load]', { rows: rows.length, fromCache: true });
    return rows;
  }

  if (!force) {
    const pending = inFlightByUserId.get(userId);
    if (pending) return pending;
  }

  const work = (async (): Promise<ExerciseDictionaryAutocompleteRow[]> => {
    const { data, error } = await supabase
      .from('exercise_dictionary')
      .select('id,name,slug,status')
      .order('name')
      .limit(limit);
    if (error) {
      const msg = supabaseClientErrorMessage(error);
      throw new Error(msg);
    }

    const rows: ExerciseDictionaryAutocompleteRow[] = [];
    for (const r of data ?? []) {
      const st = typeof r.status === 'string' ? narrowStatus(r.status) : null;
      if (st == null) continue;
      rows.push({
        id: r.id,
        name: r.name,
        slug: r.slug,
        status: st,
      });
    }

    const loadedAt = Date.now();
    cacheByUserId.set(userId, { rows, loadedAt });
    // Copilot suggestion ignored: [DEBUG] tripwires kept for post-merge manual QA; removed in a follow-up.
    console.log('[DEBUG][autocomplete-load]', { rows: rows.length, fromCache: false });
    return rows;
  })();

  if (!force) {
    inFlightByUserId.set(userId, work);
    void work.finally(() => {
      inFlightByUserId.delete(userId);
    });
  }

  return work;
}

export function clearExerciseDictionaryAutocompleteCache(): void {
  cacheByUserId.clear();
  inFlightByUserId.clear();
}

/** @internal tests only */
export function resetExerciseDictionaryAutocompleteCacheForTests(): void {
  clearExerciseDictionaryAutocompleteCache();
}
