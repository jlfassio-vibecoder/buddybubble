'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import {
  AlignLeft,
  Check,
  Dumbbell,
  List,
  Monitor,
  Plus,
  Smartphone,
  Timer,
  X,
} from 'lucide-react';
import { createClient } from '@utils/supabase/client';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { formatUserFacingError } from '@/lib/format-error';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { WorkoutExercise } from '@/lib/item-metadata';
import type { Json, UnitSystem } from '@/types/database';
import { useUserProfileStore } from '@/store/userProfileStore';
import { replaceTaskAssigneesWithUserIds } from '@/lib/task-assignees-db';
import { WorkoutCoachRail } from '@/components/chat/WorkoutCoachRail';
import type { ExecutionPatch } from '@/types/execution-patch';
import { useUserExerciseNotes, type UserExerciseNotesRow } from '@/hooks/useUserExerciseNotes';
import { useWorkoutSessionViewModel } from '@/hooks/use-workout-session-view-model';
import { buildWorkoutSessionViewModel } from '@/lib/workout-factory/workout-session-view-model';
import { buildWorkoutCoachRailContext } from '@/lib/workout-factory/build-workout-coach-rail-context';
import { appendAmrapRoundRows } from '@/lib/workout-factory/interval-timer/append-amrap-round-rows';
import {
  buildPlayerInitialLogRowsForExercise,
  buildPlayerInitialLogs,
} from '@/lib/workout-factory/resolve-player-log-row-count';
import { buildPlayerExerciseIndexLookup } from '@/lib/workout-factory/workout-player-exercise-index';
import { WorkoutPlayerBlockList } from '@/components/fitness/workout-block-renderer/WorkoutPlayerBlockList';
import {
  WorkoutPlayerExercisePanel,
  type SetDraft,
} from '@/components/fitness/workout-block-renderer/WorkoutPlayerExercisePanel';
import { NARROW_MAX_QUERY } from '@/lib/viewport';
import type {
  WorkoutSessionBlockView,
  WorkoutSessionViewModel,
} from '@/lib/workout-factory/workout-session-view-model';

export type WorkoutPlayerProps = {
  open: boolean;
  onClose: () => void;
  /**
   * 'desktop' | 'mobile' forces that chrome. Omit to auto-pick from viewport when opened
   * (matches `NARROW_MAX_QUERY` from `@/lib/viewport` → mobile bottom sheet).
   */
  mode?: 'desktop' | 'mobile';
  /** Used to load `fitness_profiles.unit_system` for the active workspace (not cross-workspace). */
  workspaceId: string;
  workoutTitle: string;
  /** Raw `tasks.metadata` from the source workout; parsed inside the player. */
  metadata: Json;
  bubbleId: string;
  /** Source workout / workout_log task id — used to copy program linkage and scheduling onto the log row. */
  sourceTaskId: string | null;
  sessionId: string | null;
  class_instance_id: string | null;
  isMemberView: boolean;
  canPostMessages: boolean;
  workoutData?: Json;
  onComplete?: () => void;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatElapsed(secs: number) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function isSetDraftMatrix(raw: unknown): raw is SetDraft[][] {
  if (!Array.isArray(raw)) return false;
  for (const row of raw) {
    if (!Array.isArray(row)) return false;
    for (const cell of row) {
      if (cell == null || typeof cell !== 'object' || Array.isArray(cell)) return false;
      const c = cell as Record<string, unknown>;
      if (
        typeof c.weight !== 'string' ||
        typeof c.reps !== 'string' ||
        typeof c.rpe !== 'string' ||
        typeof c.done !== 'boolean'
      ) {
        return false;
      }
    }
  }
  return true;
}

function logsEqualTemplate(
  logs: SetDraft[][],
  exercises: WorkoutExercise[],
  blocks: WorkoutSessionBlockView[],
): boolean {
  return JSON.stringify(logs) === JSON.stringify(buildPlayerInitialLogs(exercises, blocks));
}

function buildDraftMetadata(
  sourceTaskId: string,
  logs: SetDraft[][],
  classInstanceId: string | null,
): Json {
  return {
    source_task_id: sourceTaskId,
    draft_logs: logs,
    ...(classInstanceId ? { class_instance_id: classInstanceId } : {}),
  };
}

const AUTOSAVE_MS = 2000;

// ── Shared player body ────────────────────────────────────────────────────────

type PlayerBodyProps = {
  workoutTitle: string;
  sessionVm: WorkoutSessionViewModel;
  exercises: WorkoutExercise[];
  logs: SetDraft[][];
  view: 'simple' | 'detailed';
  elapsed: number;
  saving: boolean;
  unit: string;
  onToggleView: () => void;
  onSetChange: (
    exIdx: number,
    setIdx: number,
    field: 'weight' | 'reps' | 'rpe',
    value: string,
  ) => void;
  onToggleDone: (exIdx: number, setIdx: number) => void;
  onAddSet: (exIdx: number) => void;
  onLogAmrapRound: (blockId: string) => void;
  onFinish: () => void;
  onClose: () => void;
  /** Per-exercise rows from `user_exercise_notes` (by catalog id), aligned with `exercises`. */
  personalNotesByExerciseIndex: (UserExerciseNotesRow | null)[];
  /** When true (mobile sheet), footer gets bottom safe-area padding. */
  footerSafeArea?: boolean;
};

function PlayerBody({
  workoutTitle,
  sessionVm,
  exercises,
  logs,
  view,
  elapsed,
  saving,
  unit,
  onToggleView,
  onSetChange,
  onToggleDone,
  onAddSet,
  onLogAmrapRound,
  onFinish,
  onClose,
  personalNotesByExerciseIndex,
  footerSafeArea = false,
}: PlayerBodyProps) {
  const useBlockList =
    sessionVm.source === 'rich' && sessionVm.blocks.length > 0 && exercises.length > 0;
  const difficulty = sessionVm.workoutSet?.difficulty;
  const doneCount = logs.reduce((acc, ex) => acc + ex.filter((s) => s.done).length, 0);
  const totalSets = logs.reduce((acc, ex) => acc + ex.length, 0);

  return (
    <>
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <Dumbbell className="h-5 w-5 shrink-0 text-primary" aria-hidden />
          <div className="min-w-0">
            <DialogPrimitive.Title className="truncate text-sm font-semibold leading-snug text-foreground">
              {workoutTitle}
            </DialogPrimitive.Title>
            {difficulty ? (
              <p className="text-[10px] capitalize text-muted-foreground/80">{difficulty}</p>
            ) : null}
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Timer className="h-3 w-3 shrink-0" aria-hidden />
              <span className="tabular-nums">{formatElapsed(elapsed)}</span>
              {totalSets > 0 && (
                <>
                  <span className="text-muted-foreground/50">·</span>
                  <span className="tabular-nums">
                    {doneCount}/{totalSets} sets
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {/* View toggle */}
          <button
            type="button"
            onClick={onToggleView}
            title={view === 'simple' ? 'Switch to detailed view' : 'Switch to simple view'}
            className={cn(
              'flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors',
              view === 'detailed'
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-muted-foreground hover:bg-muted',
            )}
          >
            {view === 'simple' ? (
              <AlignLeft className="h-3.5 w-3.5" />
            ) : (
              <List className="h-3.5 w-3.5" />
            )}
            <span className="hidden sm:inline">{view === 'simple' ? 'Detailed' : 'Simple'}</span>
          </button>

          {/* Close */}
          <DialogPrimitive.Close
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close player"
          >
            <X className="h-4 w-4" />
          </DialogPrimitive.Close>
        </div>
      </div>

      {/* Exercise panels */}
      <div
        className={cn(
          'min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-5',
          footerSafeArea && 'pb-[max(0.5rem,env(safe-area-inset-bottom))]',
        )}
      >
        {exercises.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No exercises defined for this workout.
          </p>
        ) : useBlockList ? (
          <WorkoutPlayerBlockList
            viewModel={sessionVm}
            flatExercises={exercises}
            logs={logs}
            view={view}
            unit={unit}
            personalNotesByExerciseIndex={personalNotesByExerciseIndex}
            onSetChange={onSetChange}
            onToggleDone={onToggleDone}
            onAddSet={onAddSet}
            onLogAmrapRound={onLogAmrapRound}
          />
        ) : (
          <div className="space-y-6">
            {exercises.map((ex, i) => (
              <div key={i}>
                <WorkoutPlayerExercisePanel
                  exercise={ex}
                  index={i}
                  sets={logs[i] ?? []}
                  view={view}
                  unit={unit}
                  personalNotes={personalNotesByExerciseIndex[i] ?? null}
                  onSetChange={(si, f, v) => onSetChange(i, si, f, v)}
                  onToggleDone={(si) => onToggleDone(i, si)}
                  onAddSet={() => onAddSet(i)}
                />
                {i < exercises.length - 1 && <Separator className="mt-6" />}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        className={cn(
          'flex shrink-0 items-center justify-between border-t border-border px-4 pt-3 sm:px-5',
          footerSafeArea ? 'pb-[max(1rem,env(safe-area-inset-bottom))]' : 'pb-3 sm:pb-3',
        )}
      >
        <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={onFinish}
          disabled={saving || exercises.length === 0}
          className="gap-1.5"
        >
          <Check className="h-3.5 w-3.5" />
          {saving ? 'Saving…' : 'Finish Workout'}
        </Button>
      </div>
    </>
  );
}

// ── WorkoutPlayer ─────────────────────────────────────────────────────────────

export function WorkoutPlayer({
  open,
  onClose,
  mode,
  workspaceId,
  workoutTitle,
  metadata,
  bubbleId,
  sourceTaskId,
  sessionId,
  class_instance_id,
  isMemberView,
  canPostMessages,
  workoutData,
  onComplete,
}: WorkoutPlayerProps) {
  const [logs, setLogs] = useState<SetDraft[][]>([]);
  const [view, setView] = useState<'simple' | 'detailed'>('simple');
  const [elapsed, setElapsed] = useState(0);
  const [saving, setSaving] = useState(false);
  const [unitSystem, setUnitSystem] = useState<UnitSystem>('metric');
  const [resolvedMode, setResolvedMode] = useState<'desktop' | 'mobile'>('desktop');
  const [mobileUnifiedPane, setMobileUnifiedPane] = useState<'workout' | 'coach'>('workout');
  const [activeLogTaskId, setActiveLogTaskId] = useState<string | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightAutosaveRef = useRef<Promise<void> | null>(null);
  const activeLogTaskIdRef = useRef<string | null>(null);
  const hasUserEditedRef = useRef(false);
  /** Bumps only when `sourceTaskId` / `bubble` / exercise template identity actually changes, not on effect churn. */
  const lastRecoveryIdentityRef = useRef<string | null>(null);
  const profileId = useUserProfileStore((s) => s.profile?.id);

  useEffect(() => {
    activeLogTaskIdRef.current = activeLogTaskId;
  }, [activeLogTaskId]);

  const sessionVm = useWorkoutSessionViewModel(metadata);
  const exercises = sessionVm.flatExercises;
  const exercisesStringDigest = useMemo(() => JSON.stringify(exercises), [exercises]);
  const blocksDigest = useMemo(
    () =>
      JSON.stringify(
        sessionVm.blocks.map((b) => ({
          id: b.id,
          format: b.blockFormat,
          rounds: b.formatParams?.rounds,
        })),
      ),
    [sessionVm.blocks],
  );

  const exerciseNamesForNotes = useMemo(() => exercises.map((e) => e.name), [exercises]);
  const { dictIdByExerciseIndex, notesByDictId } = useUserExerciseNotes({
    enabled: open && Boolean(profileId),
    userId: profileId ?? null,
    exerciseNames: exerciseNamesForNotes,
  });
  const personalNotesByExerciseIndex = useMemo(
    () =>
      exercises.map((_, i) => {
        const id = dictIdByExerciseIndex[i];
        if (!id) return null;
        return notesByDictId.get(id) ?? null;
      }),
    [exercises, dictIdByExerciseIndex, notesByDictId],
  );

  const liveSetCounts = useMemo(() => {
    if (logs.length === 0 || logs.length !== exercises.length) return undefined;
    return logs.map((row) => row.length);
  }, [logs, exercises.length]);

  /** Coach rail + sentinel: structured context with block summary when factory exists. */
  const coachWorkoutDataForRail = useMemo(() => {
    const ctx = buildWorkoutCoachRailContext(metadata, workoutTitle, liveSetCounts);
    const hasExercises = Array.isArray(ctx.exercises) && (ctx.exercises as unknown[]).length > 0;
    const hasRich =
      typeof ctx.workout_structure_summary === 'string' || ctx.ai_workout_factory != null;
    if (!hasExercises && !hasRich) return undefined;
    return ctx as unknown as Json;
  }, [metadata, workoutTitle, liveSetCounts]);

  useLayoutEffect(() => {
    if (mode === 'desktop' || mode === 'mobile') {
      setResolvedMode(mode);
      return;
    }
    if (!open || typeof window === 'undefined') return;
    const mobile = window.matchMedia(NARROW_MAX_QUERY).matches;
    setResolvedMode(mobile ? 'mobile' : 'desktop');
  }, [open, mode]);

  // Load unit system from fitness profile (scoped to active workspace)
  useEffect(() => {
    if (!profileId || !workspaceId) return;
    const supabase = createClient();
    void supabase
      .from('fitness_profiles')
      .select('unit_system')
      .eq('workspace_id', workspaceId)
      .eq('user_id', profileId)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.unit_system === 'imperial' || data?.unit_system === 'metric') {
          setUnitSystem(data.unit_system as UnitSystem);
        }
      });
  }, [profileId, workspaceId]);

  // Reset / recover draft when player opens or when task / exercise content identity changes.
  useEffect(() => {
    if (!open) {
      lastRecoveryIdentityRef.current = null;
      return;
    }
    const identity = `${sourceTaskId ?? 'null'}:${bubbleId}:${exercisesStringDigest}:${blocksDigest}`;
    if (lastRecoveryIdentityRef.current !== identity) {
      lastRecoveryIdentityRef.current = identity;
      hasUserEditedRef.current = false;
    }
    let cancelled = false;
    setView('simple');
    setElapsed(0);
    setSaving(false);
    setMobileUnifiedPane('workout');

    const recover = async () => {
      if (!sourceTaskId) {
        if (!cancelled) {
          setLogs(buildPlayerInitialLogs(exercises, sessionVm.blocks));
          setActiveLogTaskId(null);
        }
        return;
      }

      const supabase = createClient();
      const { data: draft, error } = await supabase
        .from('tasks')
        .select('id, metadata')
        .eq('bubble_id', bubbleId)
        .eq('item_type', 'workout_log')
        .eq('status', 'in_progress')
        .eq('metadata->>source_task_id', sourceTaskId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        console.error('workout draft recovery failed', error);
        if (!hasUserEditedRef.current) {
          setLogs(buildPlayerInitialLogs(exercises, sessionVm.blocks));
        }
        setActiveLogTaskId(null);
        return;
      }

      if (draft?.id) {
        const meta = draft.metadata;
        const raw =
          meta && typeof meta === 'object' && !Array.isArray(meta)
            ? (meta as { draft_logs?: unknown }).draft_logs
            : undefined;
        if (isSetDraftMatrix(raw) && raw.length === exercises.length) {
          if (!hasUserEditedRef.current) {
            setLogs(raw);
            setActiveLogTaskId(draft.id);
          }
          return;
        }
      }

      let prefilledLogs = buildPlayerInitialLogs(exercises, sessionVm.blocks);

      const { data: historical } = await supabase
        .from('tasks')
        .select('metadata')
        .eq('bubble_id', bubbleId)
        .eq('item_type', 'workout_log')
        .eq('status', 'completed')
        .eq('metadata->>source_task_id', sourceTaskId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cancelled) return;

      const histMeta = historical?.metadata;
      if (histMeta && typeof histMeta === 'object' && !Array.isArray(histMeta)) {
        const rawEx = (histMeta as { exercises?: unknown }).exercises;
        if (Array.isArray(rawEx) && rawEx.length > 0) {
          const byName = new Map<string, WorkoutExercise>();
          for (const h of rawEx) {
            if (h == null || typeof h !== 'object' || Array.isArray(h)) continue;
            const he = h as WorkoutExercise;
            if (typeof he.name !== 'string') continue;
            const key = he.name.toLowerCase().trim();
            if (!byName.has(key)) byName.set(key, he);
          }

          prefilledLogs = exercises.map((ex, i) => {
            const base = buildPlayerInitialLogRowsForExercise(ex, i, sessionVm.blocks);
            const key = ex.name.toLowerCase().trim();
            const hist = byName.get(key);
            if (!hist?.set_logs || !Array.isArray(hist.set_logs)) return base;
            return base.map((cell, j) => {
              const sl = hist.set_logs![j];
              if (sl == null || typeof sl !== 'object') {
                return { ...cell, done: false };
              }
              return {
                weight: sl.weight != null ? String(sl.weight) : cell.weight,
                reps: sl.reps != null ? String(sl.reps) : cell.reps,
                rpe: sl.rpe != null ? String(sl.rpe) : cell.rpe,
                done: false,
              };
            });
          });
        }
      }

      if (cancelled) return;
      if (hasUserEditedRef.current) {
        return;
      }

      setLogs(prefilledLogs);
      setActiveLogTaskId(null);
    };

    void recover();

    return () => {
      cancelled = true;
    };
  }, [
    open,
    sourceTaskId,
    exercisesStringDigest,
    blocksDigest,
    exercises,
    sessionVm.blocks,
    bubbleId,
  ]);

  // Debounced cloud autosave of in-progress draft_logs (2s) — no UI spinner.
  useEffect(() => {
    if (!open || !sourceTaskId || logs.length === 0) return;
    if (
      !activeLogTaskId &&
      !hasUserEditedRef.current &&
      logsEqualTemplate(logs, exercises, sessionVm.blocks)
    ) {
      return;
    }

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    saveTimeoutRef.current = setTimeout(() => {
      saveTimeoutRef.current = null;
      const p = (async () => {
        const supabase = createClient();
        const meta = buildDraftMetadata(sourceTaskId, logs, class_instance_id);

        const currentDraftId = activeLogTaskIdRef.current;
        if (!currentDraftId) {
          const { data, error } = await supabase
            .from('tasks')
            .insert({
              bubble_id: bubbleId,
              title: `${workoutTitle} — Log`,
              item_type: 'workout_log',
              status: 'in_progress',
              metadata: meta,
            })
            .select('id')
            .maybeSingle();
          if (error) {
            console.error('workout draft autosave insert failed', error);
            return;
          }
          if (data?.id) {
            activeLogTaskIdRef.current = data.id;
            setActiveLogTaskId(data.id);
          }
        } else {
          const { error } = await supabase
            .from('tasks')
            .update({ metadata: meta })
            .eq('id', currentDraftId);
          if (error) console.error('workout draft autosave update failed', error);
        }
      })();
      inFlightAutosaveRef.current = p;
      void p.finally(() => {
        if (inFlightAutosaveRef.current === p) inFlightAutosaveRef.current = null;
      });
    }, AUTOSAVE_MS);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
    };
  }, [
    logs,
    open,
    activeLogTaskId,
    sourceTaskId,
    workoutTitle,
    bubbleId,
    class_instance_id,
    exercisesStringDigest,
    blocksDigest,
    exercises,
    sessionVm.blocks,
  ]);

  // Elapsed timer
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, [open]);

  const updateSet = useCallback(
    (exIdx: number, setIdx: number, field: 'weight' | 'reps' | 'rpe', value: string) => {
      hasUserEditedRef.current = true;
      setLogs((prev) => {
        const next = prev.map((s) => [...s]);
        const row = next[exIdx]?.[setIdx];
        if (row) next[exIdx][setIdx] = { ...row, [field]: value };
        return next;
      });
    },
    [],
  );

  const toggleDone = useCallback((exIdx: number, setIdx: number) => {
    hasUserEditedRef.current = true;
    setLogs((prev) => {
      const next = prev.map((s) => [...s]);
      const row = next[exIdx]?.[setIdx];
      if (row) next[exIdx][setIdx] = { ...row, done: !row.done };
      return next;
    });
  }, []);

  const addSet = useCallback(
    (exIdx: number) => {
      hasUserEditedRef.current = true;
      setLogs((prev) => {
        const next = prev.map((s) => [...s]);
        const ex = exercises[exIdx];
        if (next[exIdx]) {
          next[exIdx] = [
            ...next[exIdx],
            {
              weight: ex?.weight != null ? String(ex.weight) : '',
              reps: typeof ex?.reps === 'number' ? String(ex.reps) : '',
              rpe: '',
              done: false,
            },
          ];
        }
        return next;
      });
    },
    [exercises],
  );

  const logAmrapRound = useCallback(
    (blockId: string) => {
      hasUserEditedRef.current = true;
      const indices = buildPlayerExerciseIndexLookup(sessionVm.blocks)
        .filter((e) => e.blockId === blockId)
        .map((e) => e.globalIndex);
      setLogs((prev) => appendAmrapRoundRows(prev, indices, exercises));
    },
    [sessionVm.blocks, exercises],
  );

  const handleApplyExecutionPatch = useCallback((patch: ExecutionPatch) => {
    hasUserEditedRef.current = true;
    setLogs((prev) => {
      const next = prev.map((row) => row.map((c) => ({ ...c })));
      for (const { exerciseIndex: exIdx, setIndex: setIdx, weight, reps, rpe, done } of patch) {
        if (exIdx < 0 || exIdx >= prev.length) continue;
        const exRow = prev[exIdx];
        if (setIdx < 0 || setIdx >= exRow.length) continue;
        const cell = next[exIdx][setIdx];
        if (weight !== undefined) cell.weight = weight;
        if (reps !== undefined) cell.reps = reps;
        if (rpe !== undefined) cell.rpe = rpe;
        if (done !== undefined) cell.done = done;
      }
      return next;
    });
  }, []);

  const handleFinish = useCallback(async () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    if (inFlightAutosaveRef.current) {
      try {
        await inFlightAutosaveRef.current;
      } catch {
        // Autosave path already logs; continue finalizing the workout log.
      }
    }

    setSaving(true);
    const supabase = createClient();

    const exercisePayload = exercises.map((ex, i) => {
      const completedSets = (logs[i] ?? []).filter((s) => s.done);
      return {
        name: ex.name,
        ...(ex.reps != null ? { reps: ex.reps } : {}),
        ...(ex.weight != null ? { weight: ex.weight } : {}),
        ...(ex.duration_min != null ? { duration_min: ex.duration_min } : {}),
        sets: completedSets.length,
        set_logs: completedSets.map((s, idx) => ({
          set: idx + 1,
          ...(s.weight !== '' ? { weight: parseFloat(s.weight) } : {}),
          ...(s.reps !== '' ? { reps: parseInt(s.reps, 10) } : {}),
          ...(s.rpe !== '' ? { rpe: parseInt(s.rpe, 10) } : {}),
          done: true,
        })),
      };
    });

    const durationMins = Math.round(elapsed / 60);

    let sourceRow: {
      program_id: string | null;
      program_session_key: string | null;
      scheduled_on: string | null;
      scheduled_time: string | null;
      visibility: string | null;
    } | null = null;

    let sourceAssigneeUserIds: string[] = [];

    if (sourceTaskId) {
      const { data: fetched, error: sourceTaskError } = await supabase
        .from('tasks')
        .select(
          'program_id, program_session_key, scheduled_on, scheduled_time, visibility, task_assignees(user_id)',
        )
        .eq('id', sourceTaskId)
        .maybeSingle();

      if (sourceTaskError) {
        console.error('Failed to load source task for workout log', sourceTaskError);
        toast.error(formatUserFacingError(sourceTaskError));
        setSaving(false);
        return;
      }
      if (fetched) {
        const f = fetched as {
          program_id: string | null;
          program_session_key: string | null;
          scheduled_on: string | null;
          scheduled_time: string | null;
          visibility: string | null;
          task_assignees?: { user_id: string }[] | null;
        };
        sourceRow = {
          program_id: f.program_id,
          program_session_key: f.program_session_key,
          scheduled_on: f.scheduled_on,
          scheduled_time: f.scheduled_time,
          visibility: f.visibility,
        };
        sourceAssigneeUserIds = [
          ...new Set(
            (f.task_assignees ?? [])
              .map((r) => r.user_id)
              .filter((id): id is string => Boolean(id?.trim())),
          ),
        ];
      }
    }

    const finalMetadata: Json = {
      ...(sourceTaskId ? { source_task_id: sourceTaskId } : {}),
      ...(durationMins > 0 ? { duration_min: durationMins } : {}),
      exercises: exercisePayload,
      ...(class_instance_id ? { class_instance_id } : {}),
    };

    const programFields = {
      ...(sourceRow?.program_id != null ? { program_id: sourceRow.program_id } : {}),
      ...(sourceRow?.program_session_key != null
        ? { program_session_key: sourceRow.program_session_key }
        : {}),
      ...(sourceRow?.scheduled_on != null ? { scheduled_on: sourceRow.scheduled_on } : {}),
      ...(sourceRow?.scheduled_time != null ? { scheduled_time: sourceRow.scheduled_time } : {}),
      ...(sourceRow?.visibility != null ? { visibility: sourceRow.visibility } : {}),
    } as const;

    const syncAssignees = async (taskId: string) => {
      if (sourceAssigneeUserIds.length === 0) return true;
      const { error: syncErr } = await replaceTaskAssigneesWithUserIds(
        supabase,
        taskId,
        sourceAssigneeUserIds,
      );
      if (syncErr) {
        console.error('Failed to sync workout log assignees', syncErr);
        toast.error(
          typeof syncErr === 'string' && syncErr.trim() ? syncErr : 'Failed to sync assignees.',
        );
        return false;
      }
      return true;
    };

    if (activeLogTaskId) {
      const { error: updateError } = await supabase
        .from('tasks')
        .update({
          status: 'completed',
          ...programFields,
          metadata: finalMetadata,
        })
        .eq('id', activeLogTaskId);

      if (updateError) {
        console.error('Failed to finalize workout log', updateError);
        toast.error(formatUserFacingError(updateError));
        setSaving(false);
        return;
      }

      if (!(await syncAssignees(activeLogTaskId))) {
        setSaving(false);
        return;
      }

      setActiveLogTaskId(null);
      activeLogTaskIdRef.current = null;
      setSaving(false);
      onComplete?.();
      onClose();
      return;
    }

    const workoutLogTask = {
      bubble_id: bubbleId,
      title: `${workoutTitle} — Log`,
      item_type: 'workout_log' as const,
      status: 'completed' as const,
      ...programFields,
      metadata: finalMetadata,
    };

    const { data: insertedLog, error: insertError } = await supabase
      .from('tasks')
      .insert(workoutLogTask)
      .select('id')
      .maybeSingle();

    if (insertError || !insertedLog?.id) {
      console.error('Failed to create workout log', insertError);
      toast.error(formatUserFacingError(insertError ?? new Error('Insert failed')));
      setSaving(false);
      return;
    }

    if (!(await syncAssignees(insertedLog.id))) {
      setSaving(false);
      return;
    }

    setSaving(false);
    onComplete?.();
    onClose();
  }, [
    exercises,
    logs,
    elapsed,
    bubbleId,
    workoutTitle,
    sourceTaskId,
    class_instance_id,
    activeLogTaskId,
    onComplete,
    onClose,
  ]);

  const unit = unitSystem === 'imperial' ? 'lbs' : 'kg';

  const bodyProps: PlayerBodyProps = {
    workoutTitle,
    sessionVm,
    exercises,
    logs,
    view,
    elapsed,
    saving,
    unit,
    onToggleView: () => setView((v) => (v === 'simple' ? 'detailed' : 'simple')),
    onSetChange: updateSet,
    onToggleDone: toggleDone,
    onAddSet: addSet,
    onLogAmrapRound: logAmrapRound,
    onFinish: () => void handleFinish(),
    onClose,
    personalNotesByExerciseIndex,
    footerSafeArea: resolvedMode === 'mobile',
  };

  const splitPaneBody = (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row md:items-stretch">
      {/* Mobile tab toggle (Workout | Coach) */}
      <div
        className="flex gap-1 border-b border-border bg-muted/40 px-2 py-2 md:hidden"
        role="tablist"
        aria-label="Workout or coach"
      >
        <button
          type="button"
          className={cn(
            'flex-1 rounded-md py-2 text-xs font-semibold transition-colors',
            mobileUnifiedPane === 'workout'
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:bg-muted/80',
          )}
          aria-pressed={mobileUnifiedPane === 'workout'}
          onClick={() => setMobileUnifiedPane('workout')}
        >
          Workout
        </button>
        <button
          type="button"
          className={cn(
            'flex-1 rounded-md py-2 text-xs font-semibold transition-colors',
            mobileUnifiedPane === 'coach'
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:bg-muted/80',
          )}
          aria-pressed={mobileUnifiedPane === 'coach'}
          onClick={() => setMobileUnifiedPane('coach')}
        >
          Coach
        </button>
      </div>

      {/* Left pane: Coach rail */}
      <div
        className={cn(
          'flex min-h-0 min-w-0 flex-1 flex-col',
          mobileUnifiedPane === 'coach' ? 'max-md:flex' : 'max-md:hidden',
          'md:border-r md:border-border',
          'md:max-w-[min(38%,400px)] md:shrink-0 md:basis-[min(32%,340px)] md:grow-0 md:flex-none',
        )}
      >
        <WorkoutCoachRail
          workspaceId={workspaceId}
          bubbleId={bubbleId}
          taskId={sourceTaskId ?? ''}
          canPostMessages={canPostMessages}
          sessionId={sessionId}
          class_instance_id={class_instance_id}
          isMemberView={isMemberView}
          workoutTitle={workoutTitle}
          workoutData={coachWorkoutDataForRail ?? workoutData}
          onApplyExecutionPatch={handleApplyExecutionPatch}
        />
      </div>

      {/* Right pane: Workout body */}
      <div
        className={cn(
          'flex min-h-0 min-w-0 flex-1 flex-col',
          mobileUnifiedPane === 'workout' ? 'max-md:flex' : 'max-md:hidden',
          'md:flex',
        )}
      >
        <PlayerBody {...bodyProps} />
      </div>
    </div>
  );

  // ── Desktop: centered dialog ──────────────────────────────────────────────

  if (resolvedMode === 'desktop') {
    return (
      <DialogPrimitive.Root
        open={open}
        onOpenChange={(o) => {
          if (!o) onClose();
        }}
      >
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-[155] bg-black/60 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <DialogPrimitive.Content
            className={cn(
              'fixed left-[50%] top-[50%] z-[160] flex w-full translate-x-[-50%] translate-y-[-50%] flex-col overflow-hidden',
              'h-[90dvh] max-h-[90dvh] max-w-[95vw] rounded-2xl border border-border bg-card text-card-foreground shadow-2xl sm:max-w-6xl',
              'gap-0 p-0',
              'data-[state=open]:animate-in data-[state=closed]:animate-out',
              'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
              'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
              'data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%]',
              'data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]',
            )}
          >
            {splitPaneBody}
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    );
  }

  // ── Mobile: bottom sheet ──────────────────────────────────────────────────

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[155] bg-black/60 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className={cn(
            'fixed bottom-0 left-0 right-0 z-[160] flex flex-col overflow-hidden',
            'h-[92dvh] max-h-[92dvh] w-full rounded-t-2xl border-t border-border bg-card text-card-foreground shadow-2xl',
            'gap-0 p-0',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
          )}
        >
          {/* Drag handle indicator */}
          <div className="flex shrink-0 justify-center pt-2.5 pb-0">
            <div className="h-1 w-10 rounded-full bg-muted-foreground/30" />
          </div>
          {splitPaneBody}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

// ── Trigger buttons (used in TaskModal Visibility section) ────────────────────

type WorkoutPlayerTriggersProps = {
  workoutTitle: string;
  metadata: Json;
  bubbleId: string;
  workspaceId: string;
  sourceTaskId: string | null;
  onComplete?: () => void;
};

export function WorkoutPlayerTriggers({
  workoutTitle,
  metadata,
  bubbleId,
  workspaceId,
  sourceTaskId,
  onComplete,
}: WorkoutPlayerTriggersProps) {
  const [mode, setMode] = useState<'desktop' | 'mobile' | null>(null);
  const sessionVm = useMemo(() => buildWorkoutSessionViewModel(metadata ?? {}), [metadata]);

  if (sessionVm.flatExercises.length === 0) return null;

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setMode('desktop')}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Monitor className="size-4 shrink-0" aria-hidden />
          Desktop Player
        </button>
        <button
          type="button"
          onClick={() => setMode('mobile')}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Smartphone className="size-4 shrink-0" aria-hidden />
          Mobile Player
        </button>
      </div>

      {mode !== null && (
        <WorkoutPlayer
          open
          mode={mode}
          onClose={() => setMode(null)}
          workspaceId={workspaceId}
          workoutTitle={workoutTitle}
          metadata={metadata}
          bubbleId={bubbleId}
          sourceTaskId={sourceTaskId}
          sessionId={null}
          class_instance_id={null}
          isMemberView={true}
          canPostMessages={true}
          onComplete={() => {
            setMode(null);
            onComplete?.();
          }}
        />
      )}
    </>
  );
}
