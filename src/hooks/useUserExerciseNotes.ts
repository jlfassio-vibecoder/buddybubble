'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@utils/supabase/client';

export type UserExerciseNotesRow = {
  id: string;
  user_id: string;
  exercise_dictionary_id: string;
  instructions: string | null;
  form_cues: string | null;
  tips: string | null;
  injury_prevention_tips: string | null;
};

function normName(s: string): string {
  return s.trim().toLowerCase();
}

/** Maps each workout exercise name to the first matching `exercise_dictionary` id (by normalized name). */
export function matchExerciseNamesToDictionaryIds(
  exerciseNames: readonly string[],
  dictRows: { id: string; name: string }[] | null | undefined,
): (string | null)[] {
  const rows = dictRows ?? [];
  const normToId = new Map<string, string>();
  for (const r of rows) {
    const k = normName(r.name);
    if (!normToId.has(k)) normToId.set(k, r.id);
  }
  return exerciseNames.map((name) => {
    const k = normName(name);
    return k ? (normToId.get(k) ?? null) : null;
  });
}

/**
 * Resolve current workout exercise names to dictionary ids and load the signed-in user's
 * `user_exercise_notes` rows. Subscribes to Realtime changes on `user_exercise_notes`.
 */
export function useUserExerciseNotes(args: {
  enabled: boolean;
  userId: string | null;
  exerciseNames: readonly string[];
}): { dictIdByExerciseIndex: (string | null)[]; notesByDictId: Map<string, UserExerciseNotesRow> } {
  const [dictIdByExerciseIndex, setDictIdByExerciseIndex] = useState<(string | null)[]>([]);
  const [notesByDictId, setNotesByDictId] = useState<Map<string, UserExerciseNotesRow>>(new Map());

  const namesKey = useMemo(
    () => args.exerciseNames.map((n) => n.trim()).join('\u0001'),
    [args.exerciseNames],
  );

  const load = useCallback(async () => {
    if (!args.enabled || !args.userId || args.exerciseNames.length === 0) {
      setDictIdByExerciseIndex([]);
      setNotesByDictId(new Map());
      return;
    }
    const supabase = createClient();
    const unique = [...new Set(args.exerciseNames.map((n) => n.trim()).filter(Boolean))];
    if (unique.length === 0) {
      setDictIdByExerciseIndex(args.exerciseNames.map(() => null));
      setNotesByDictId(new Map());
      return;
    }

    const { data: dictRows, error: dictErr } = await supabase.rpc(
      'exercise_dictionary_lookup_by_names',
      { p_names: unique },
    );
    if (dictErr) {
      console.warn('Failed to sync personal exercise cues.');
      setDictIdByExerciseIndex(args.exerciseNames.map(() => null));
      setNotesByDictId(new Map());
      return;
    }

    const rows = (dictRows ?? []) as { id: string; name: string }[];
    const byIndex = matchExerciseNamesToDictionaryIds(args.exerciseNames, rows);

    const ids = [...new Set(byIndex.filter((x): x is string => Boolean(x)))];
    setDictIdByExerciseIndex(byIndex);

    if (ids.length === 0) {
      setNotesByDictId(new Map());
      return;
    }

    const { data: noteRows, error: noteErr } = await supabase
      .from('user_exercise_notes')
      .select('*')
      .eq('user_id', args.userId)
      .in('exercise_dictionary_id', ids);

    if (noteErr) {
      console.warn('Failed to sync personal exercise cues.');
      setNotesByDictId(new Map());
      return;
    }

    const m = new Map<string, UserExerciseNotesRow>();
    for (const row of noteRows ?? []) {
      const r = row as UserExerciseNotesRow;
      m.set(r.exercise_dictionary_id, r);
    }
    setNotesByDictId(m);
  }, [args.enabled, args.userId, namesKey, args.exerciseNames]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!args.enabled || !args.userId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`user_exercise_notes:${args.userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_exercise_notes',
          filter: `user_id=eq.${args.userId}`,
        },
        () => {
          void load();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [args.enabled, args.userId, load]);

  return { dictIdByExerciseIndex, notesByDictId };
}
