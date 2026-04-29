'use client';

import { useEffect, useState } from 'react';
import {
  getCachedPublishedExerciseDictionary,
  loadPublishedExerciseDictionary,
} from '@/lib/exercise-dictionary-autocomplete-cache';
import type { RichMessageComposerExercise } from '@/components/chat/RichMessageComposer';

/**
 * Published `exercise_dictionary` rows for RichMessageComposer `#` exercise autocomplete.
 * Uses a module-level in-memory cache + shared in-flight request (see
 * `exercise-dictionary-autocomplete-cache.ts`) so multiple composers do not re-fetch the catalog.
 */
export function useExerciseDictionaryAutocomplete() {
  const [exercises, setExercises] = useState<RichMessageComposerExercise[]>(
    () => getCachedPublishedExerciseDictionary() ?? [],
  );
  const [loading, setLoading] = useState(() => getCachedPublishedExerciseDictionary() == null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (getCachedPublishedExerciseDictionary()) {
      setExercises(getCachedPublishedExerciseDictionary()!);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void loadPublishedExerciseDictionary()
      .then((rows) => {
        if (!cancelled) {
          setExercises(rows);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setExercises([]);
          setError(err instanceof Error ? err.message : 'Failed to load exercises');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { exercises, loading, error };
}
