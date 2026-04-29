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
  error: string | null;
  refresh: () => Promise<void>;
} {
  const userId = useUserProfileStore((s) => s.profile?.id ?? null);
  const [rows, setRows] = useState<ExerciseDictionaryAutocompleteRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = useMemo(() => createClient(), []);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const next = await loadExerciseDictionaryForAutocomplete(supabase, { userId, force: true });
      setRows(next);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      console.warn('[useExerciseDictionaryAutocomplete] Failed to load exercises:', msg);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [supabase, userId]);

  useEffect(() => {
    if (!userId) {
      setRows([]);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void loadExerciseDictionaryForAutocomplete(supabase, { userId })
      .then((r) => {
        if (!cancelled) {
          setRows(r);
          setError(null);
        }
      })
      .catch((e) => {
        const msg = e instanceof Error ? e.message : 'Failed to load exercises';
        console.warn('[useExerciseDictionaryAutocomplete] Failed to load exercises:', msg);
        if (!cancelled) setError(msg);
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
        setError(null);
      }
    });
    return () => {
      subscription.unsubscribe();
    };
  }, [supabase]);

  return { rows, loading, error, refresh };
}
