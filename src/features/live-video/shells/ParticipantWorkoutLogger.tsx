'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useLiveSessionDeck } from '@/features/live-video/hooks/useLiveSessionDeck';
import { useWorkoutLogs } from '@/features/live-video/hooks/useWorkoutLogs';
import { useLiveSessionRuntime } from '@/features/live-video/theater/live-session-runtime-context';
import { formatUserFacingError } from '@/lib/format-error';
import { metadataFieldsFromParsed } from '@/lib/item-metadata';
import type { WorkoutExercise } from '@/lib/item-metadata';
import { cn } from '@/lib/utils';
import { useUserProfileStore } from '@/store/userProfileStore';
import { toast } from 'sonner';

export type ParticipantWorkoutLoggerProps = {
  className?: string;
};

function maxLoggedSetNumber(
  logs: { exercise_name: string; set_number: number }[],
  exerciseName: string,
) {
  return logs
    .filter((l) => l.exercise_name === exerciseName)
    .reduce((m, l) => Math.max(m, l.set_number), 0);
}

function setSlotCount(ex: WorkoutExercise, logs: { exercise_name: string; set_number: number }[]) {
  const prescribed = Math.max(1, ex.sets ?? 3);
  return Math.max(prescribed, maxLoggedSetNumber(logs, ex.name));
}

/** Task prescription strings for prefilling inputs when no `workout_exercise_logs` row yet. */
function prescriptionStringsForExercise(ex: WorkoutExercise): {
  weight: string;
  reps: string;
  rpe: string;
} {
  return {
    weight: Number.isFinite(Number(ex.weight)) ? String(ex.weight) : '',
    reps: ex.reps != null ? String(ex.reps) : '',
    rpe: Number.isFinite(Number(ex.rpe)) ? String(ex.rpe) : '',
  };
}

function parseOptionalInt(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number.parseInt(t, 10);
  return Number.isFinite(n) ? n : null;
}

function parseOptionalNumber(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number.parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

type DraftKey = string;

function draftKey(exerciseName: string, setNumber: number): DraftKey {
  return `${exerciseName}\0${setNumber}`;
}

export function ParticipantWorkoutLogger({ className }: ParticipantWorkoutLoggerProps) {
  const { state, sessionId, supabase, isHost } = useLiveSessionRuntime();
  const isAmrapPhase = state.phase === 'amrap';
  const userId = useUserProfileStore((s) => s.profile?.id ?? null);

  const deck = useLiveSessionDeck({
    supabase,
    sessionId,
    enabled: !isHost && Boolean(sessionId.trim()),
  });

  const activeDeckItemId = state.activeDeckItemId;

  const activeRow = useMemo(
    () => deck.rows.find((r) => r.id === activeDeckItemId) ?? null,
    [deck.rows, activeDeckItemId],
  );

  const activeTask = activeRow?.tasks ?? null;
  const taskId = activeTask?.id ?? '';

  const {
    logs,
    loading: logsLoading,
    error: logsError,
    logSet,
    saving,
    refresh: refreshWorkoutLogs,
  } = useWorkoutLogs({
    supabase,
    sessionId,
    taskId,
    userId,
    enabled: Boolean(!isHost && userId && taskId),
  });

  const exercises = useMemo(() => {
    if (!activeTask) return [];
    return metadataFieldsFromParsed(activeTask.metadata).workoutExercises;
  }, [activeTask]);

  const [drafts, setDrafts] = useState<
    Record<DraftKey, { weight: string; reps: string; rpe: string }>
  >({});

  useEffect(() => {
    setDrafts({});
  }, [taskId]);

  const prevPhaseRef = useRef(state.phase);
  useEffect(() => {
    if (prevPhaseRef.current === 'amrap' && state.phase !== 'amrap') {
      void refreshWorkoutLogs();
    }
    prevPhaseRef.current = state.phase;
  }, [state.phase, refreshWorkoutLogs]);

  /** Duplication runs in the AMRAP wrapper with a separate `useWorkoutLogs` instance — refresh on log inserts. */
  useEffect(() => {
    if (!isAmrapPhase || isHost || !userId || !taskId || !sessionId.trim()) return;

    void refreshWorkoutLogs();

    const sid = sessionId.trim();
    const logChangeHandler = () => {
      void refreshWorkoutLogs();
    };
    const channel = supabase
      .channel(`workout_exercise_logs:${sid}:${taskId}:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'workout_exercise_logs',
          filter: `session_id=eq.${sid}`,
        },
        logChangeHandler,
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'workout_exercise_logs',
          filter: `session_id=eq.${sid}`,
        },
        logChangeHandler,
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [isAmrapPhase, isHost, userId, taskId, sessionId, supabase, refreshWorkoutLogs]);

  const logFor = useCallback(
    (exerciseName: string, setNumber: number) =>
      logs.find((l) => l.exercise_name === exerciseName && l.set_number === setNumber) ?? null,
    [logs],
  );

  const displayField = useCallback(
    (
      exerciseName: string,
      setNumber: number,
      field: 'weight' | 'reps' | 'rpe',
      fromLog: string,
    ): string => {
      const k = draftKey(exerciseName, setNumber);
      const d = drafts[k];
      if (!d) return fromLog;
      const v = d[field];
      return v !== undefined ? v : fromLog;
    },
    [drafts],
  );

  const setField = useCallback(
    (exerciseName: string, setNumber: number, field: 'weight' | 'reps' | 'rpe', value: string) => {
      const k = draftKey(exerciseName, setNumber);
      setDrafts((prev) => {
        const log = logs.find(
          (l) => l.exercise_name === exerciseName && l.set_number === setNumber,
        );
        const ex = exercises.find((e) => e.name === exerciseName);
        const presc = ex ? prescriptionStringsForExercise(ex) : { weight: '', reps: '', rpe: '' };
        const base = {
          weight:
            log?.weight_lbs != null && Number.isFinite(Number(log.weight_lbs))
              ? String(log.weight_lbs)
              : presc.weight,
          reps: log?.reps != null ? String(log.reps) : presc.reps,
          rpe: log?.rpe != null ? String(log.rpe) : presc.rpe,
        };
        const cur = prev[k] ?? base;
        return { ...prev, [k]: { ...cur, [field]: value } };
      });
    },
    [logs, exercises],
  );

  const handleLogSet = useCallback(
    async (exerciseName: string, setNumber: number) => {
      const k = draftKey(exerciseName, setNumber);
      const log = logFor(exerciseName, setNumber);
      const d = drafts[k];
      const ex = exercises.find((e) => e.name === exerciseName);
      const presc = ex ? prescriptionStringsForExercise(ex) : { weight: '', reps: '', rpe: '' };
      const wStr =
        d?.weight ??
        (log?.weight_lbs != null && Number.isFinite(Number(log.weight_lbs))
          ? String(log.weight_lbs)
          : presc.weight);
      const rStr = d?.reps ?? (log?.reps != null ? String(log.reps) : presc.reps);
      const rpeStr = d?.rpe ?? (log?.rpe != null ? String(log.rpe) : presc.rpe);

      const { error } = await logSet({
        exerciseName,
        setNumber,
        weightLbs: parseOptionalNumber(wStr),
        reps: parseOptionalInt(rStr),
        rpe: parseOptionalInt(rpeStr),
      });

      if (error) {
        toast.error(formatUserFacingError(error));
        return;
      }
      toast.success('Set saved');
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[k];
        return next;
      });
    },
    [drafts, exercises, logFor, logSet],
  );

  if (isHost) {
    return null;
  }

  if (!activeDeckItemId) {
    return (
      <div
        className={cn(
          'flex min-h-0 flex-1 items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground',
          className,
        )}
      >
        Waiting for Host to select a workout…
      </div>
    );
  }

  if (deck.loading) {
    return (
      <div
        className={cn(
          'flex min-h-0 flex-1 items-center justify-center rounded-lg border border-border bg-muted/10 px-4 py-8 text-sm text-muted-foreground',
          className,
        )}
      >
        Loading workout…
      </div>
    );
  }

  if (!activeRow || !activeTask) {
    return (
      <div
        className={cn(
          'flex min-h-0 flex-1 items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground',
          className,
        )}
      >
        Waiting for Host to select a workout…
      </div>
    );
  }

  if (activeTask.item_type !== 'workout' && activeTask.item_type !== 'workout_log') {
    return (
      <div
        className={cn(
          'flex min-h-0 flex-1 items-center justify-center rounded-lg border border-border bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground',
          className,
        )}
      >
        This card is not a workout — logging is only available for workout cards.
      </div>
    );
  }

  if (exercises.length === 0) {
    return (
      <div
        className={cn(
          'flex min-h-0 flex-1 items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground',
          className,
        )}
      >
        No exercises on this card.
      </div>
    );
  }

  if (isAmrapPhase) {
    const prepSetNumber = 1;
    return (
      <div
        className={cn('flex min-h-0 flex-1 flex-col gap-4 overflow-hidden', className)}
        data-region="participant-workout-logger-amrap"
      >
        {logsError ? (
          <p className="shrink-0 text-xs text-destructive" role="alert">
            {logsError.message}
          </p>
        ) : null}
        <p className="shrink-0 text-xs text-muted-foreground">
          Set your load for this AMRAP block (one row per exercise). Each logged round will copy
          these values into the next set in your workout log.
        </p>
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto pr-1">
          {exercises.map((ex, exIdx) => {
            const log = logFor(ex.name, prepSetNumber);
            const presc = prescriptionStringsForExercise(ex);
            const wDisplay = displayField(
              ex.name,
              prepSetNumber,
              'weight',
              log?.weight_lbs != null && Number.isFinite(Number(log.weight_lbs))
                ? String(log.weight_lbs)
                : presc.weight,
            );
            const rDisplay = displayField(
              ex.name,
              prepSetNumber,
              'reps',
              log?.reps != null ? String(log.reps) : presc.reps,
            );
            const rpeDisplay = displayField(
              ex.name,
              prepSetNumber,
              'rpe',
              log?.rpe != null ? String(log.rpe) : presc.rpe,
            );
            return (
              <section key={`${ex.name}-${exIdx}`} className="space-y-3">
                <h3 className="text-sm font-semibold leading-tight text-foreground">{ex.name}</h3>
                <div className="flex flex-wrap items-end gap-2 rounded-md border border-border bg-background/80 p-2 sm:flex-nowrap">
                  <label className="flex min-w-[4.5rem] flex-1 flex-col gap-1">
                    <span className="text-[10px] uppercase text-muted-foreground">lbs</span>
                    <Input
                      inputMode="decimal"
                      className="h-8 text-sm"
                      value={wDisplay}
                      onChange={(e) => setField(ex.name, prepSetNumber, 'weight', e.target.value)}
                    />
                  </label>
                  <label className="flex min-w-[3.5rem] flex-1 flex-col gap-1">
                    <span className="text-[10px] uppercase text-muted-foreground">Reps</span>
                    <Input
                      inputMode="numeric"
                      className="h-8 text-sm"
                      value={rDisplay}
                      onChange={(e) => setField(ex.name, prepSetNumber, 'reps', e.target.value)}
                    />
                  </label>
                  <label className="flex min-w-[3rem] flex-1 flex-col gap-1">
                    <span className="text-[10px] uppercase text-muted-foreground">RPE</span>
                    <Input
                      inputMode="numeric"
                      className="h-8 text-sm"
                      value={rpeDisplay}
                      onChange={(e) => setField(ex.name, prepSetNumber, 'rpe', e.target.value)}
                    />
                  </label>
                  <Button
                    type="button"
                    size="sm"
                    className="shrink-0"
                    disabled={saving || logsLoading}
                    onClick={() => void handleLogSet(ex.name, prepSetNumber)}
                  >
                    Set
                  </Button>
                </div>
                {(() => {
                  const fromRounds = logs
                    .filter((l) => l.exercise_name === ex.name && l.set_number > prepSetNumber)
                    .sort((a, b) => a.set_number - b.set_number);
                  if (fromRounds.length === 0) return null;
                  return (
                    <ul className="space-y-1 rounded-md border border-border/60 bg-muted/30 px-2 py-2 text-[11px] text-muted-foreground">
                      <li className="font-medium text-foreground/80">Sets from logged rounds</li>
                      {fromRounds.map((row) => (
                        <li key={row.id} className="tabular-nums">
                          Set {row.set_number}:{' '}
                          {row.weight_lbs != null && Number.isFinite(Number(row.weight_lbs))
                            ? `${row.weight_lbs} lb`
                            : '—'}{' '}
                          × {row.reps != null ? row.reps : '—'} reps
                          {row.rpe != null ? ` @ RPE ${row.rpe}` : ''}
                        </li>
                      ))}
                    </ul>
                  );
                })()}
              </section>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col gap-4 overflow-hidden', className)}>
      {logsError ? (
        <p className="shrink-0 text-xs text-destructive" role="alert">
          {logsError.message}
        </p>
      ) : null}
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto pr-1">
        {exercises.map((ex, exIdx) => {
          const slots = setSlotCount(ex, logs);
          return (
            <section key={`${ex.name}-${exIdx}`} className="space-y-3">
              <h3 className="text-sm font-semibold leading-tight text-foreground">{ex.name}</h3>
              <div className="space-y-2">
                {Array.from({ length: slots }, (_, i) => {
                  const setNumber = i + 1;
                  const log = logFor(ex.name, setNumber);
                  const presc = prescriptionStringsForExercise(ex);
                  const wDisplay = displayField(
                    ex.name,
                    setNumber,
                    'weight',
                    log?.weight_lbs != null && Number.isFinite(Number(log.weight_lbs))
                      ? String(log.weight_lbs)
                      : presc.weight,
                  );
                  const rDisplay = displayField(
                    ex.name,
                    setNumber,
                    'reps',
                    log?.reps != null ? String(log.reps) : presc.reps,
                  );
                  const rpeDisplay = displayField(
                    ex.name,
                    setNumber,
                    'rpe',
                    log?.rpe != null ? String(log.rpe) : presc.rpe,
                  );

                  return (
                    <div
                      key={setNumber}
                      className="flex flex-wrap items-end gap-2 rounded-md border border-border bg-background/80 p-2 sm:flex-nowrap"
                    >
                      <span className="w-10 shrink-0 text-xs font-medium text-muted-foreground">
                        Set {setNumber}
                      </span>
                      <label className="flex min-w-[4.5rem] flex-1 flex-col gap-1">
                        <span className="text-[10px] uppercase text-muted-foreground">lbs</span>
                        <Input
                          inputMode="decimal"
                          className="h-8 text-sm"
                          value={wDisplay}
                          onChange={(e) => setField(ex.name, setNumber, 'weight', e.target.value)}
                        />
                      </label>
                      <label className="flex min-w-[3.5rem] flex-1 flex-col gap-1">
                        <span className="text-[10px] uppercase text-muted-foreground">Reps</span>
                        <Input
                          inputMode="numeric"
                          className="h-8 text-sm"
                          value={rDisplay}
                          onChange={(e) => setField(ex.name, setNumber, 'reps', e.target.value)}
                        />
                      </label>
                      <label className="flex min-w-[3rem] flex-1 flex-col gap-1">
                        <span className="text-[10px] uppercase text-muted-foreground">RPE</span>
                        <Input
                          inputMode="numeric"
                          className="h-8 text-sm"
                          value={rpeDisplay}
                          onChange={(e) => setField(ex.name, setNumber, 'rpe', e.target.value)}
                        />
                      </label>
                      <Button
                        type="button"
                        size="sm"
                        className="shrink-0"
                        disabled={saving || logsLoading}
                        onClick={() => void handleLogSet(ex.name, setNumber)}
                      >
                        Log
                      </Button>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
