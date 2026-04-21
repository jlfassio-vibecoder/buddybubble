'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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
        const base = {
          weight:
            log?.weight_lbs != null && Number.isFinite(Number(log.weight_lbs))
              ? String(log.weight_lbs)
              : '',
          reps: log?.reps != null ? String(log.reps) : '',
          rpe: log?.rpe != null ? String(log.rpe) : '',
        };
        const cur = prev[k] ?? base;
        return { ...prev, [k]: { ...cur, [field]: value } };
      });
    },
    [logs],
  );

  const handleLogSet = useCallback(
    async (exerciseName: string, setNumber: number) => {
      const k = draftKey(exerciseName, setNumber);
      const log = logFor(exerciseName, setNumber);
      const d = drafts[k];
      const wStr = d?.weight ?? (log?.weight_lbs != null ? String(log.weight_lbs) : '');
      const rStr = d?.reps ?? (log?.reps != null ? String(log.reps) : '');
      const rpeStr = d?.rpe ?? (log?.rpe != null ? String(log.rpe) : '');

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
    [drafts, logFor, logSet],
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
                  const wDisplay = displayField(
                    ex.name,
                    setNumber,
                    'weight',
                    log?.weight_lbs != null && Number.isFinite(Number(log.weight_lbs))
                      ? String(log.weight_lbs)
                      : '',
                  );
                  const rDisplay = displayField(
                    ex.name,
                    setNumber,
                    'reps',
                    log?.reps != null ? String(log.reps) : '',
                  );
                  const rpeDisplay = displayField(
                    ex.name,
                    setNumber,
                    'rpe',
                    log?.rpe != null ? String(log.rpe) : '',
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
