'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import {
  AlignLeft,
  Check,
  Dumbbell,
  Info,
  List,
  Monitor,
  Plus,
  Smartphone,
  Timer,
  X,
} from 'lucide-react';
import { createClient } from '@utils/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { formatUserFacingError } from '@/lib/format-error';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { metadataFieldsFromParsed } from '@/lib/item-metadata';
import type { WorkoutExercise } from '@/lib/item-metadata';
import type { Json, UnitSystem } from '@/types/database';
import { useUserProfileStore } from '@/store/userProfileStore';
import { replaceTaskAssigneesWithUserIds } from '@/lib/task-assignees-db';

// ── Types ─────────────────────────────────────────────────────────────────────

type SetDraft = {
  weight: string;
  reps: string;
  rpe: string;
  done: boolean;
};

export type WorkoutPlayerProps = {
  open: boolean;
  onClose: () => void;
  /**
   * 'desktop' | 'mobile' forces that chrome. Omit to auto-pick from viewport when opened
   * (`max-width: 768px` → mobile bottom sheet).
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
  onComplete?: () => void;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatElapsed(secs: number) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function makeSets(ex: WorkoutExercise): SetDraft[] {
  const count = Math.max(1, ex.sets ?? 3);
  return Array.from({ length: count }, () => ({
    weight: ex.weight != null ? String(ex.weight) : '',
    reps: typeof ex.reps === 'number' ? String(ex.reps) : '',
    rpe: ex.rpe != null ? String(ex.rpe) : '',
    done: false,
  }));
}

function trimNonEmpty(s: string | undefined): string | null {
  const t = typeof s === 'string' ? s.trim() : '';
  return t.length > 0 ? t : null;
}

function formatFormCues(ex: WorkoutExercise): string | null {
  const raw = ex.form_cues;
  if (raw != null) {
    if (Array.isArray(raw)) {
      const parts = raw
        .map((x) => (typeof x === 'string' ? x.trim() : ''))
        .filter((x) => x.length > 0);
      if (parts.length > 0) return parts.join('\n');
    } else if (typeof raw === 'string' && raw.trim()) {
      return raw.trim();
    }
  }
  return trimNonEmpty(ex.form_cue);
}

// ── ExercisePanel ─────────────────────────────────────────────────────────────

type ExercisePanelProps = {
  exercise: WorkoutExercise;
  index: number;
  sets: SetDraft[];
  view: 'simple' | 'detailed';
  unit: string;
  onSetChange: (setIdx: number, field: 'weight' | 'reps' | 'rpe', value: string) => void;
  onToggleDone: (setIdx: number) => void;
  onAddSet: () => void;
};

function ExercisePanel({
  exercise,
  index,
  sets,
  view,
  unit,
  onSetChange,
  onToggleDone,
  onAddSet,
}: ExercisePanelProps) {
  const targetLine = [
    exercise.sets != null && `${exercise.sets} sets`,
    exercise.reps != null && `${exercise.reps} reps`,
    exercise.weight != null && `${exercise.weight} ${unit}`,
    exercise.duration_min != null && `${exercise.duration_min} min`,
    exercise.rpe != null && `RPE ${exercise.rpe}`,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="space-y-3">
      {/* Exercise header */}
      <div>
        <div className="flex items-baseline gap-2">
          <span className="shrink-0 text-sm font-bold text-primary">#{index + 1}</span>
          <h3 className="font-semibold leading-snug text-foreground">{exercise.name}</h3>
        </div>
        {targetLine && <p className="text-xs text-muted-foreground">{targetLine}</p>}
        {view === 'detailed' &&
          (() => {
            const instructionText =
              trimNonEmpty(exercise.instructions) ?? trimNonEmpty(exercise.notes);
            const formCuesTextRaw = formatFormCues(exercise);
            const formCuesText =
              formCuesTextRaw && formCuesTextRaw !== instructionText ? formCuesTextRaw : null;
            const tipsT = trimNonEmpty(exercise.tips);
            const coachT = trimNonEmpty(exercise.coach_notes);
            const tipsParagraph = tipsT && tipsT !== instructionText ? tipsT : null;
            const coachParagraph =
              coachT && coachT !== instructionText && coachT !== tipsT ? coachT : null;
            if (!instructionText && !formCuesText && !tipsParagraph && !coachParagraph) return null;
            return (
              <div className="mt-2 space-y-2 rounded-md border border-border/60 bg-muted/40 px-3 py-2.5">
                <div className="flex gap-2">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="min-w-0 flex-1 space-y-2 text-xs leading-relaxed text-muted-foreground">
                    {instructionText && (
                      <div>
                        <p className="font-medium text-foreground/80">Instructions</p>
                        <p className="mt-0.5 whitespace-pre-wrap">{instructionText}</p>
                      </div>
                    )}
                    {formCuesText && (
                      <div>
                        <p className="font-medium text-foreground/80">Form cues</p>
                        <p className="mt-0.5 whitespace-pre-wrap">{formCuesText}</p>
                      </div>
                    )}
                    {tipsParagraph && (
                      <div>
                        <p className="font-medium text-foreground/80">Tips</p>
                        <p className="mt-0.5 whitespace-pre-wrap">{tipsParagraph}</p>
                      </div>
                    )}
                    {coachParagraph && (
                      <div>
                        <p className="font-medium text-foreground/80">Coach notes</p>
                        <p className="mt-0.5 whitespace-pre-wrap">{coachParagraph}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-[2.5rem_1fr_1fr_1fr_2.5rem] items-center gap-2 px-1">
        <span className="text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Set
        </span>
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Weight
        </span>
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Reps
        </span>
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          RPE
        </span>
        <span />
      </div>

      {/* Set rows */}
      <div className="space-y-1.5">
        {sets.map((s, idx) => (
          <div
            key={idx}
            className={cn(
              'grid grid-cols-[2.5rem_1fr_1fr_1fr_2.5rem] items-center gap-2 rounded-md px-1 py-1 transition-colors',
              s.done && 'bg-primary/5',
            )}
          >
            <span
              className={cn(
                'text-center text-sm font-semibold tabular-nums',
                s.done ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              {idx + 1}
            </span>
            <Input
              value={s.weight}
              onChange={(e) => onSetChange(idx, 'weight', e.target.value)}
              placeholder={`— ${unit}`}
              className="h-8 text-center text-sm"
              type="number"
              min={0}
              step={0.5}
            />
            <Input
              value={s.reps}
              onChange={(e) => onSetChange(idx, 'reps', e.target.value)}
              placeholder="—"
              className="h-8 text-center text-sm"
              type="number"
              min={0}
            />
            <Input
              value={s.rpe}
              onChange={(e) => onSetChange(idx, 'rpe', e.target.value)}
              placeholder="—"
              className="h-8 text-center text-sm"
              type="number"
              min={1}
              max={10}
            />
            <button
              type="button"
              onClick={() => onToggleDone(idx)}
              aria-label={s.done ? `Mark set ${idx + 1} undone` : `Mark set ${idx + 1} done`}
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-md border-2 transition-colors',
                s.done
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border text-transparent hover:border-primary/40',
              )}
            >
              <Check className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={onAddSet}
        className="flex items-center gap-1.5 px-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <Plus className="h-3.5 w-3.5" />
        Add set
      </button>
    </div>
  );
}

// ── Shared player body ────────────────────────────────────────────────────────

type PlayerBodyProps = {
  workoutTitle: string;
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
  onFinish: () => void;
  onClose: () => void;
  /** When true (mobile sheet), footer gets bottom safe-area padding. */
  footerSafeArea?: boolean;
};

function PlayerBody({
  workoutTitle,
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
  onFinish,
  onClose,
  footerSafeArea = false,
}: PlayerBodyProps) {
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
        ) : (
          <div className="space-y-6">
            {exercises.map((ex, i) => (
              <div key={i}>
                <ExercisePanel
                  exercise={ex}
                  index={i}
                  sets={logs[i] ?? []}
                  view={view}
                  unit={unit}
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
  onComplete,
}: WorkoutPlayerProps) {
  const [logs, setLogs] = useState<SetDraft[][]>([]);
  const [view, setView] = useState<'simple' | 'detailed'>('simple');
  const [elapsed, setElapsed] = useState(0);
  const [saving, setSaving] = useState(false);
  const [unitSystem, setUnitSystem] = useState<UnitSystem>('metric');
  const [resolvedMode, setResolvedMode] = useState<'desktop' | 'mobile'>('desktop');
  const profileId = useUserProfileStore((s) => s.profile?.id);

  const metadataDigest = useMemo(() => JSON.stringify(metadata ?? null), [metadata]);
  const exercises = useMemo(() => {
    const parsed = JSON.parse(metadataDigest) as unknown;
    return metadataFieldsFromParsed(parsed).workoutExercises;
  }, [metadataDigest]);
  const exercisesStringDigest = useMemo(() => JSON.stringify(exercises), [exercises]);

  useLayoutEffect(() => {
    if (mode === 'desktop' || mode === 'mobile') {
      setResolvedMode(mode);
      return;
    }
    if (!open || typeof window === 'undefined') return;
    const mobile = window.matchMedia('(max-width: 768px)').matches;
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

  // Reset when player opens or when task / exercise content identity changes (not array ref churn).
  useEffect(() => {
    if (!open) return;
    setLogs(exercises.map(makeSets));
    setView('simple');
    setElapsed(0);
    setSaving(false);
  }, [open, sourceTaskId, exercisesStringDigest]);

  // Elapsed timer
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, [open]);

  const updateSet = useCallback(
    (exIdx: number, setIdx: number, field: 'weight' | 'reps' | 'rpe', value: string) => {
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
    setLogs((prev) => {
      const next = prev.map((s) => [...s]);
      const row = next[exIdx]?.[setIdx];
      if (row) next[exIdx][setIdx] = { ...row, done: !row.done };
      return next;
    });
  }, []);

  const addSet = useCallback(
    (exIdx: number) => {
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

  const handleFinish = useCallback(async () => {
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

    const workoutLogTask = {
      bubble_id: bubbleId,
      title: `${workoutTitle} — Log`,
      item_type: 'workout_log' as const,
      status: 'completed' as const,
      ...(sourceRow?.program_id != null ? { program_id: sourceRow.program_id } : {}),
      ...(sourceRow?.program_session_key != null
        ? { program_session_key: sourceRow.program_session_key }
        : {}),
      ...(sourceRow?.scheduled_on != null ? { scheduled_on: sourceRow.scheduled_on } : {}),
      ...(sourceRow?.scheduled_time != null ? { scheduled_time: sourceRow.scheduled_time } : {}),
      ...(sourceRow?.visibility != null ? { visibility: sourceRow.visibility } : {}),
      metadata: {
        ...(durationMins > 0 ? { duration_min: durationMins } : {}),
        exercises: exercisePayload,
      },
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

    if (sourceAssigneeUserIds.length > 0) {
      const { error: syncErr } = await replaceTaskAssigneesWithUserIds(
        supabase,
        insertedLog.id,
        sourceAssigneeUserIds,
      );
      if (syncErr) {
        console.error('Failed to sync workout log assignees', syncErr);
        toast.error(
          typeof syncErr === 'string' && syncErr.trim() ? syncErr : 'Failed to sync assignees.',
        );
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    onComplete?.();
    onClose();
  }, [exercises, logs, elapsed, bubbleId, workoutTitle, sourceTaskId, onComplete, onClose]);

  const unit = unitSystem === 'imperial' ? 'lbs' : 'kg';

  const bodyProps: PlayerBodyProps = {
    workoutTitle,
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
    onFinish: () => void handleFinish(),
    onClose,
    footerSafeArea: resolvedMode === 'mobile',
  };

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
              'h-[90dvh] max-h-[90dvh] max-w-[95vw] rounded-2xl border border-border bg-card text-card-foreground shadow-2xl sm:max-w-2xl',
              'gap-0 p-0',
              'data-[state=open]:animate-in data-[state=closed]:animate-out',
              'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
              'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
              'data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%]',
              'data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]',
            )}
          >
            <PlayerBody {...bodyProps} />
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
          <PlayerBody {...bodyProps} />
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

  if (metadataFieldsFromParsed(metadata ?? {}).workoutExercises.length === 0) return null;

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
          onComplete={() => {
            setMode(null);
            onComplete?.();
          }}
        />
      )}
    </>
  );
}
