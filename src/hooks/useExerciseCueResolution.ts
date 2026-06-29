'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@utils/supabase/client';
import {
  collectBlockExercises,
  collectFlatOnlyExercises,
  emptyResolvedCueBundle,
  exerciseResolutionKey,
  indexFlatExercisesByName,
  matchFlatExerciseForCollected,
  resolveExerciseCueBundle,
  type ResolvedCueBundle,
} from '@/lib/workout-factory/resolve-exercise-cue-bundle';
import { normalizeExerciseDictionaryKey } from '@/lib/workout-factory/exercise-dictionary-bridge';
import type { WorkoutExercise } from '@/lib/item-metadata';
import type { WorkoutSessionBlockView } from '@/lib/workout-factory/workout-session-view-model';
import type { ExerciseDictionaryRow } from '@/types/database';
import { matchExerciseNamesToDictionaryIds } from '@/hooks/useUserExerciseNotes';
import type { UserExerciseNotesRow } from '@/lib/workout-factory/types/user-exercise-notes';

export type {
  ResolvedCueBundle,
  CueProvenance,
  ResolvedCueField,
} from '@/lib/workout-factory/resolve-exercise-cue-bundle';

export function useExerciseCueResolution(args: {
  enabled: boolean;
  userId: string | null;
  blocks: WorkoutSessionBlockView[];
  flatExercises: WorkoutExercise[];
}): { cuesByKey: Record<string, ResolvedCueBundle>; loading: boolean } {
  const [cuesByKey, setCuesByKey] = useState<Record<string, ResolvedCueBundle>>({});
  const [loading, setLoading] = useState(false);

  const collected = useMemo(() => {
    const fromBlocks = collectBlockExercises(args.blocks);
    if (fromBlocks.length > 0) return fromBlocks;
    return collectFlatOnlyExercises(args.flatExercises);
  }, [args.blocks, args.flatExercises]);

  const collectedKey = useMemo(
    () => collected.map((c) => `${c.key}\u0001${c.exerciseName}`).join('\u0002'),
    [collected],
  );

  const flatByName = useMemo(
    () => indexFlatExercisesByName(args.flatExercises),
    [args.flatExercises],
  );

  const resolveLocalOnly = useCallback(() => {
    const next: Record<string, ResolvedCueBundle> = {};
    for (const item of collected) {
      const flatRow = matchFlatExerciseForCollected(item, flatByName, args.flatExercises);
      next[item.key] = resolveExerciseCueBundle({
        exerciseName: item.exerciseName,
        blockExercise: item.blockExercise,
        flatRow,
      });
    }
    return next;
  }, [collected, flatByName, args.flatExercises]);

  const load = useCallback(async () => {
    if (!args.enabled || collected.length === 0) {
      setCuesByKey({});
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const names = [...new Set(collected.map((c) => c.exerciseName.trim()).filter(Boolean))];
      let dictRows: ExerciseDictionaryRow[] = [];
      let personalByDictId = new Map<string, UserExerciseNotesRow>();

      if (names.length > 0) {
        let supabase;
        try {
          supabase = createClient();
        } catch {
          setCuesByKey(resolveLocalOnly());
          setLoading(false);
          return;
        }

        const { data, error } = await supabase.rpc('exercise_dictionary_lookup_by_names', {
          p_names: names,
        });

        if (error) {
          console.warn('Failed to load exercise dictionary for cue resolution.', error.message);
          setCuesByKey(resolveLocalOnly());
          setLoading(false);
          return;
        }

        dictRows = (data ?? []) as ExerciseDictionaryRow[];

        if (args.userId && dictRows.length > 0) {
          const dictIds = [...new Set(dictRows.map((r) => r.id))];
          const { data: noteRows, error: noteErr } = await supabase
            .from('user_exercise_notes')
            .select('*')
            .eq('user_id', args.userId)
            .in('exercise_dictionary_id', dictIds);

          if (noteErr) {
            console.warn('Failed to load personal exercise cues.', noteErr.message);
          } else {
            personalByDictId = new Map(
              (noteRows ?? []).map((row) => {
                const r = row as UserExerciseNotesRow;
                return [r.exercise_dictionary_id, r] as const;
              }),
            );
          }
        }
      }

      const dictByNormName = new Map<string, ExerciseDictionaryRow>();
      for (const row of dictRows) {
        const k = normalizeExerciseDictionaryKey(row.name);
        if (!dictByNormName.has(k)) dictByNormName.set(k, row);
      }

      const dictIdByNameIndex = matchExerciseNamesToDictionaryIds(
        collected.map((c) => c.exerciseName),
        dictRows.map((r) => ({ id: r.id, name: r.name })),
      );

      const next: Record<string, ResolvedCueBundle> = {};
      for (let i = 0; i < collected.length; i++) {
        const item = collected[i]!;
        const flatRow = matchFlatExerciseForCollected(item, flatByName, args.flatExercises);
        const dictId = dictIdByNameIndex[i];
        const dictRow =
          dictByNormName.get(normalizeExerciseDictionaryKey(item.exerciseName)) ?? null;
        const personalRow = dictId ? (personalByDictId.get(dictId) ?? null) : null;

        next[item.key] = resolveExerciseCueBundle({
          exerciseName: item.exerciseName,
          blockExercise: item.blockExercise,
          flatRow,
          personalRow,
          dictRow,
        });
      }

      setCuesByKey(next);
    } catch (err) {
      console.warn(
        'Exercise cue resolution failed.',
        err instanceof Error ? err.message : String(err),
      );
      setCuesByKey(resolveLocalOnly());
    } finally {
      setLoading(false);
    }
  }, [args.enabled, args.userId, collected, flatByName, args.flatExercises, resolveLocalOnly]);

  useEffect(() => {
    if (!args.enabled || collected.length === 0) {
      setCuesByKey({});
      setLoading(false);
      return;
    }
    void load();
  }, [args.enabled, collectedKey, args.userId, load, collected.length]);

  return { cuesByKey, loading };
}

export { exerciseResolutionKey, emptyResolvedCueBundle };
