'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from 'react';
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
import type { Json, UnitSystem, BubbleRow } from '@/types/database';
import { useUserProfileStore } from '@/store/userProfileStore';
import { replaceTaskAssigneesWithUserIds } from '@/lib/task-assignees-db';
import { WorkoutCoachRail } from '@/components/chat/WorkoutCoachRail';
import {
  CHAT_AREA_DEFAULT_AGENT_SLUG,
  MESSAGE_METADATA_DEFAULT_AGENT_SLUG_KEY,
  MESSAGE_METADATA_WORKOUT_TASK_TITLE_KEY,
  resolveWorkoutContextForSentinel,
  shouldHideWorkoutCoachSentinelFromRail,
  WORKOUT_COACH_SENTINEL_DISPLAY_TEXT,
} from '@/components/chat/WorkoutCoachRail';
import type { ExecutionPatch } from '@/types/execution-patch';
import { parseExecutionPatchFromMetadata } from '@/types/execution-patch';
import { useUserExerciseNotes, type UserExerciseNotesRow } from '@/hooks/useUserExerciseNotes';
import { useMessageThread } from '@/hooks/useMessageThread';
import type { MessageThreadFilter } from '@/lib/message-thread';
import { useWorkspaceSessionSubject } from '@/context/WorkspaceSessionContext';
import {
  buildWorkoutCoachRailContext,
  normalizeCoachWorkoutDataProp,
} from '@/lib/workout-factory/build-workout-coach-rail-context';
import {
  executionPatchFingerprint,
  registerWorkoutPlayerExecutionPatchApplier,
} from '@/lib/workout-player-execution-patch-bridge';
import { useWorkoutSessionViewModel } from '@/hooks/use-workout-session-view-model';
import { buildWorkoutSessionViewModel } from '@/lib/workout-factory/workout-session-view-model';
import {
  buildWorkoutLogDraftMetadata,
  buildWorkoutLogExercisePayloadFromLogs,
  buildWorkoutLogFinishMetadata,
} from '@/lib/workout-factory/build-workout-log-finish-metadata';
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

const AUTOSAVE_MS = 2000;

function WorkoutPlayerElapsedHeader({
  active,
  resetKey,
  elapsedRef,
}: {
  active: boolean;
  resetKey: string;
  elapsedRef: React.MutableRefObject<number>;
}) {
  const [elapsed, setElapsed] = useState(0);
  const sessionStartMsRef = useRef(Date.now());

  useEffect(() => {
    sessionStartMsRef.current = Date.now();
    setElapsed(0);
    elapsedRef.current = 0;
  }, [resetKey, elapsedRef]);

  useEffect(() => {
    if (!active) return;

    const tick = () => {
      const trueElapsedSeconds = Math.floor((Date.now() - sessionStartMsRef.current) / 1000);
      setElapsed(trueElapsedSeconds);
      elapsedRef.current = trueElapsedSeconds;
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [active, resetKey, elapsedRef]);

  return (
    <>
      <Timer className="h-3 w-3 shrink-0" aria-hidden />
      <span className="tabular-nums">{formatElapsed(elapsed)}</span>
    </>
  );
}

// ── Shared player body ────────────────────────────────────────────────────────

type PlayerBodyProps = {
  workoutTitle: string;
  sessionVm: WorkoutSessionViewModel;
  exercises: WorkoutExercise[];
  logs: SetDraft[][];
  view: 'simple' | 'detailed';
  clockActive: boolean;
  clockResetKey: string;
  elapsedRef: MutableRefObject<number>;
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
  /** When true, a close flush is in progress — disable dismiss controls. */
  closing?: boolean;
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
  clockActive,
  clockResetKey,
  elapsedRef,
  saving,
  unit,
  onToggleView,
  onSetChange,
  onToggleDone,
  onAddSet,
  onLogAmrapRound,
  onFinish,
  onClose,
  closing = false,
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
              <WorkoutPlayerElapsedHeader
                active={clockActive}
                resetKey={clockResetKey}
                elapsedRef={elapsedRef}
              />
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
            onClick={(e) => {
              e.preventDefault();
              onClose();
            }}
            disabled={saving || closing}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
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
        <Button variant="ghost" size="sm" onClick={onClose} disabled={saving || closing}>
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={onFinish}
          disabled={saving || closing || exercises.length === 0}
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
  const [saving, setSaving] = useState(false);
  const elapsedRef = useRef(0);
  const [unitSystem, setUnitSystem] = useState<UnitSystem>('metric');
  const [resolvedMode, setResolvedMode] = useState<'desktop' | 'mobile'>('desktop');
  const [mobileUnifiedPane, setMobileUnifiedPane] = useState<'workout' | 'coach'>('workout');
  const [activeLogTaskId, setActiveLogTaskId] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightAutosaveRef = useRef<Promise<void> | null>(null);
  const isInsertingDraftRef = useRef(false);
  const activeLogTaskIdRef = useRef<string | null>(null);
  const logsRef = useRef<SetDraft[][]>([]);
  const hasUserEditedRef = useRef(false);
  /** Bumps only when `sourceTaskId` / `bubble` / exercise template identity actually changes, not on effect churn. */
  const lastRecoveryIdentityRef = useRef<string | null>(null);
  /** One-shot workout-open sentinel per player session (survives lazy coach rail unmount). */
  const coachSentinelFiredRef = useRef(false);
  const coachExecutionAppliedFingerprintRef = useRef<Map<string, string>>(new Map());
  const [coachBubbleRow, setCoachBubbleRow] = useState<BubbleRow | null>(null);
  const profileId = useUserProfileStore((s) => s.profile?.id);
  const { subjectUserId: workspaceSubjectUserId } = useWorkspaceSessionSubject();

  useEffect(() => {
    activeLogTaskIdRef.current = activeLogTaskId;
  }, [activeLogTaskId]);

  useEffect(() => {
    logsRef.current = logs;
  }, [logs]);

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

  const coachWorkoutContextForSentinel = useMemo(
    () => normalizeCoachWorkoutDataProp(coachWorkoutDataForRail ?? workoutData, null, workoutTitle),
    [coachWorkoutDataForRail, workoutData, workoutTitle],
  );

  const coachMessageFilter = useMemo<MessageThreadFilter | null>(() => {
    if (!open || !sourceTaskId?.trim()) return null;
    return { scope: 'task', taskId: sourceTaskId.trim() };
  }, [open, sourceTaskId]);

  useEffect(() => {
    if (!open || !workspaceId || !bubbleId) {
      setCoachBubbleRow(null);
      return;
    }
    let cancelled = false;
    const supabase = createClient();
    void supabase
      .from('bubbles')
      .select('*')
      .eq('id', bubbleId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data) {
          setCoachBubbleRow(null);
          return;
        }
        setCoachBubbleRow(data as BubbleRow);
      });
    return () => {
      cancelled = true;
    };
  }, [open, workspaceId, bubbleId]);

  const coachBubbles = useMemo(() => (coachBubbleRow ? [coachBubbleRow] : []), [coachBubbleRow]);

  const coachMessageThread = useMessageThread({
    filter: coachMessageFilter,
    workspaceId: open ? workspaceId : null,
    bubbles: coachBubbles,
    canPostMessages,
    taskBubbleIdHint: bubbleId,
    currentUserId: profileId ?? null,
    threadSubjectUserId: workspaceSubjectUserId ?? profileId ?? null,
  });

  const coachAvailableAgents = useMemo(
    () => [...coachMessageThread.agentsByAuthUserId.values()],
    [coachMessageThread.agentsByAuthUserId],
  );

  const coachSendMessageRef = useRef(coachMessageThread.sendMessage);
  useLayoutEffect(() => {
    coachSendMessageRef.current = coachMessageThread.sendMessage;
  }, [coachMessageThread.sendMessage]);

  const isMemberViewRef = useRef(isMemberView);
  useLayoutEffect(() => {
    isMemberViewRef.current = isMemberView;
  }, [isMemberView]);

  useEffect(() => {
    if (!open) {
      coachSentinelFiredRef.current = false;
      coachExecutionAppliedFingerprintRef.current.clear();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    coachExecutionAppliedFingerprintRef.current.clear();
  }, [open, sourceTaskId]);

  useEffect(() => {
    if (!open) return;
    if (!canPostMessages) return;
    if (!profileId) return;
    if (!workspaceId || !bubbleId) return;
    if (!sourceTaskId?.trim()) return;
    if (!coachBubbleRow) return;
    if (coachMessageThread.isLoading) return;
    if (coachSentinelFiredRef.current) return;
    const hasCoachAgent = coachAvailableAgents.some((a) => a.slug === 'coach');
    if (!hasCoachAgent) return;

    const workoutContext = resolveWorkoutContextForSentinel(
      coachWorkoutContextForSentinel as unknown as Json,
      workoutTitle,
    );

    coachSentinelFiredRef.current = true;

    const sentinelMetadata: Json = {
      [MESSAGE_METADATA_DEFAULT_AGENT_SLUG_KEY]: CHAT_AREA_DEFAULT_AGENT_SLUG,
      [MESSAGE_METADATA_WORKOUT_TASK_TITLE_KEY]: workoutTitle.trim() || 'this workout',
      sessionId,
      class_instance_id,
      workoutContext,
      is_silent_sentinel: true,
      workout_context: {
        source: 'workout_player',
        sessionId,
        class_instance_id,
        isMemberView: isMemberViewRef.current,
      },
    };

    void (async () => {
      try {
        await coachSendMessageRef.current(
          WORKOUT_COACH_SENTINEL_DISPLAY_TEXT,
          undefined,
          undefined,
          { metadata: sentinelMetadata },
        );
      } catch {
        // Strict once-per-session: do not retry (avoids tight failure loops / egress spikes).
      }
    })();
  }, [
    open,
    canPostMessages,
    profileId,
    workspaceId,
    bubbleId,
    sourceTaskId,
    coachBubbleRow,
    coachMessageThread.isLoading,
    coachAvailableAgents,
    coachWorkoutContextForSentinel,
    workoutTitle,
    sessionId,
    class_instance_id,
  ]);

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
      coachSentinelFiredRef.current = false;
    }
    let cancelled = false;
    setView('simple');
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
  const executeAutosaveNow = useCallback(async (): Promise<void> => {
    const draftLogs = logsRef.current;
    if (!sourceTaskId || draftLogs.length === 0) return;
    if (
      !activeLogTaskIdRef.current &&
      !hasUserEditedRef.current &&
      logsEqualTemplate(draftLogs, exercises, sessionVm.blocks)
    ) {
      return;
    }

    const supabase = createClient();
    const meta = buildWorkoutLogDraftMetadata({
      sourceMetadata: metadata,
      sessionVm,
      sourceTaskId,
      draftLogs,
      classInstanceId: class_instance_id,
    });

    const currentDraftId = activeLogTaskIdRef.current;
    if (!currentDraftId) {
      if (isInsertingDraftRef.current) return;
      isInsertingDraftRef.current = true;
      try {
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
      } finally {
        isInsertingDraftRef.current = false;
      }
    } else {
      const { error } = await supabase
        .from('tasks')
        .update({ metadata: meta })
        .eq('id', currentDraftId);
      if (error) console.error('workout draft autosave update failed', error);
    }
  }, [sourceTaskId, exercises, sessionVm, metadata, bubbleId, workoutTitle, class_instance_id]);

  const runAutosave = useCallback(async (): Promise<void> => {
    const p = executeAutosaveNow();
    inFlightAutosaveRef.current = p;
    try {
      await p;
    } finally {
      if (inFlightAutosaveRef.current === p) inFlightAutosaveRef.current = null;
    }
  }, [executeAutosaveNow]);

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
      void runAutosave();
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
    runAutosave,
    exercisesStringDigest,
    blocksDigest,
    exercises,
    sessionVm.blocks,
  ]);

  const isClosingRef = useRef(false);

  const handleClose = useCallback(async () => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    setClosing(true);

    try {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }

      if (inFlightAutosaveRef.current) {
        try {
          await inFlightAutosaveRef.current;
        } catch {
          // Autosave path already logs; continue flushing latest logs.
        }
      }

      await runAutosave();
      onClose();
    } finally {
      isClosingRef.current = false;
    }
  }, [onClose, runAutosave]);

  const sessionClockResetKey = `${sourceTaskId ?? 'null'}:${bubbleId}:${exercisesStringDigest}:${blocksDigest}`;

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

  useEffect(() => {
    if (!open) {
      registerWorkoutPlayerExecutionPatchApplier(null);
      return;
    }
    registerWorkoutPlayerExecutionPatchApplier(handleApplyExecutionPatch);
    return () => registerWorkoutPlayerExecutionPatchApplier(null);
  }, [open, handleApplyExecutionPatch]);

  // Apply Coach execution_patch rows while player is open (independent of lazy coach rail mount).
  useEffect(() => {
    if (!open) return;
    if (coachMessageThread.isLoading) return;
    const { messages } = coachMessageThread;
    if (messages.length === 0) return;
    const coachAuthUserId = coachAvailableAgents.find((a) => a.slug === 'coach')?.auth_user_id;
    if (!coachAuthUserId) return;

    const coachRows = messages.filter(
      (m) => m.user_id === coachAuthUserId && m.id && !shouldHideWorkoutCoachSentinelFromRail(m),
    );

    for (const row of coachRows) {
      const id = row.id;
      if (!id) continue;
      const meta = row.metadata;
      const raw =
        meta != null && typeof meta === 'object' && !Array.isArray(meta)
          ? (meta as { execution_patch?: unknown }).execution_patch
          : undefined;
      const fp = executionPatchFingerprint(raw);
      if (fp != null && coachExecutionAppliedFingerprintRef.current.get(id) === fp) {
        continue;
      }
      let patch: ExecutionPatch | null = null;
      try {
        patch = parseExecutionPatchFromMetadata(raw);
      } catch {
        continue;
      }
      if (!patch) {
        if (fp != null) coachExecutionAppliedFingerprintRef.current.set(id, fp);
        continue;
      }
      handleApplyExecutionPatch(patch);
      if (fp != null) coachExecutionAppliedFingerprintRef.current.set(id, fp);
    }
  }, [open, coachAvailableAgents, coachMessageThread, handleApplyExecutionPatch]);

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
    await runAutosave();

    setSaving(true);
    const supabase = createClient();

    const exercisePayload = buildWorkoutLogExercisePayloadFromLogs(exercises, logs);

    const durationMins = Math.round(elapsedRef.current / 60);
    const finalLogId = activeLogTaskIdRef.current ?? activeLogTaskId;

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

    const finalMetadata = buildWorkoutLogFinishMetadata({
      sourceMetadata: metadata,
      sessionVm,
      exercises: exercisePayload,
      durationMin: durationMins,
      sourceTaskId,
      classInstanceId: class_instance_id,
    });

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

    if (finalLogId) {
      const { error: updateError } = await supabase
        .from('tasks')
        .update({
          status: 'completed',
          ...programFields,
          metadata: finalMetadata,
        })
        .eq('id', finalLogId);

      if (updateError) {
        console.error('Failed to finalize workout log', updateError);
        toast.error(formatUserFacingError(updateError));
        setSaving(false);
        return;
      }

      if (!(await syncAssignees(finalLogId))) {
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
    metadata,
    sessionVm,
    bubbleId,
    workoutTitle,
    sourceTaskId,
    class_instance_id,
    activeLogTaskId,
    onComplete,
    onClose,
    runAutosave,
  ]);

  const unit = unitSystem === 'imperial' ? 'lbs' : 'kg';

  const bodyProps: PlayerBodyProps = {
    workoutTitle,
    sessionVm,
    exercises,
    logs,
    view,
    clockActive: open,
    clockResetKey: sessionClockResetKey,
    elapsedRef,
    saving,
    unit,
    onToggleView: () => setView((v) => (v === 'simple' ? 'detailed' : 'simple')),
    onSetChange: updateSet,
    onToggleDone: toggleDone,
    onAddSet: addSet,
    onLogAmrapRound: logAmrapRound,
    onFinish: () => void handleFinish(),
    onClose: () => void handleClose(),
    closing,
    personalNotesByExerciseIndex,
    footerSafeArea: resolvedMode === 'mobile',
  };

  /** Coach rail mounts only when visible — unmount severs Realtime + dictionary load on mobile Workout tab. */
  const isCoachRailVisible = resolvedMode === 'desktop' || mobileUnifiedPane === 'coach';

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

      {/* Left pane: Coach rail (lazy-mounted when visible) */}
      {isCoachRailVisible ? (
        <div
          className={cn(
            'flex min-h-0 min-w-0 flex-1 flex-col',
            'md:border-r md:border-border',
            'md:max-w-[min(38%,400px)] md:shrink-0 md:basis-[min(32%,340px)] md:grow-0 md:flex-none',
          )}
        >
          <WorkoutCoachRail
            workspaceId={workspaceId}
            bubbleId={bubbleId}
            taskId={sourceTaskId ?? ''}
            canPostMessages={canPostMessages}
            workoutTitle={workoutTitle}
            workoutData={coachWorkoutDataForRail ?? workoutData}
            bubbleRow={coachBubbleRow}
            messageThread={coachMessageThread}
          />
        </div>
      ) : null}

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
          if (!o) void handleClose();
        }}
      >
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-[155] bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
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
        if (!o) void handleClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[155] bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
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
