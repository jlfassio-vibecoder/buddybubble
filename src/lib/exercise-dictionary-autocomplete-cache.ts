import { createClient } from '@utils/supabase/client';
import { supabaseClientErrorMessage } from '@/lib/supabase-client-error';
import type { RichMessageComposerExercise } from '@/components/chat/RichMessageComposer';

const EXERCISE_LIST_LIMIT = 2000;

let cachedRows: RichMessageComposerExercise[] | null = null;
let inFlight: Promise<RichMessageComposerExercise[]> | null = null;
let lastLoadError: string | null = null;

function mapRow(row: {
  id: string;
  name: string;
  slug: string;
  status: string;
}): RichMessageComposerExercise {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status,
  };
}

/**
 * Synchronous peek for hooks to avoid a loading flash when data is already in memory.
 */
export function getCachedPublishedExerciseDictionary(): RichMessageComposerExercise[] | null {
  return cachedRows;
}

/**
 * Idempotent load: one in-flight request shared by all consumers; result cached in module memory.
 */
export function loadPublishedExerciseDictionary(): Promise<RichMessageComposerExercise[]> {
  if (cachedRows) return Promise.resolve(cachedRows);
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('exercise_dictionary')
        .select('id,name,slug,status')
        .eq('status', 'published')
        .order('name')
        .limit(EXERCISE_LIST_LIMIT);
      if (error) {
        const msg = supabaseClientErrorMessage(error);
        lastLoadError = msg;
        throw new Error(msg);
      }
      cachedRows = (data ?? []).map((row) =>
        mapRow(row as { id: string; name: string; slug: string; status: string }),
      );
      lastLoadError = null;
      return cachedRows;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

export function getLastPublishedExerciseDictionaryError(): string | null {
  return lastLoadError;
}

/** @internal tests only */
export function resetExerciseDictionaryCacheForTests() {
  cachedRows = null;
  inFlight = null;
  lastLoadError = null;
}
