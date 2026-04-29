'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@utils/supabase/client';
import {
  clearExerciseDictionaryAutocompleteCache,
  loadExerciseDictionaryForAutocomplete,
  type ExerciseDictionaryAutocompleteRow,
} from '@/lib/exercise-dictionary-autocomplete-cache';
import { useUserProfileStore } from '@/store/userProfileStore';

/**
 * RLS-scoped `exercise_dictionary` for RichMessageComposer `#` exercise autocomplete
 * (ChatArea, WorkoutCoachRail, TaskModalCommentsPanel).
 */
export function useExerciseDictionaryAutocomplete(): {
  rows: ExerciseDictionaryAutocompleteRow[];
  loading: boolean;
  refresh: () => Promise<void>;
} {
  const userId = useUserProfileStore((s) => s.profile?.id ?? null);
  const [rows, setRows] = useState<ExerciseDictionaryAutocompleteRow[]>([]);
  const [loading, setLoading] = useState(false);
  const supabase = useMemo(() => createClient(), []);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const next = await loadExerciseDictionaryForAutocomplete(supabase, { userId, force: true });
      setRows(next);
    } catch (e) {
      console.warn(
        '[useExerciseDictionaryAutocomplete] Failed to load exercises:',
        e instanceof Error ? e.message : 'Unknown error',
      );
    } finally {
      setLoading(false);
    }
  }, [supabase, userId]);

  useEffect(() => {
    if (!userId) {
      setRows([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void loadExerciseDictionaryForAutocomplete(supabase, { userId })
      .then((r) => {
        if (!cancelled) setRows(r);
      })
      .catch((e) => {
        console.warn(
          '[useExerciseDictionaryAutocomplete] Failed to load exercises:',
          e instanceof Error ? e.message : 'Unknown error',
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [supabase, userId]);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        clearExerciseDictionaryAutocompleteCache();
        setRows([]);
      }
    });
    return () => {
      subscription.unsubscribe();
    };
  }, [supabase]);

  return { rows, loading, refresh };
}
