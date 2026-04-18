'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { toast } from 'sonner';
import type { Exercise } from '@/lib/workout-factory/types/ai-program';
import { normalizeWorkoutForEditor } from '@/lib/workout-factory/program-schedule-utils';
import type { ProgramWorkout } from '@/lib/workout-factory/program-schedule-utils';
import type { WorkoutSetTemplate } from '@/lib/workout-factory/types/workout-contract';
import type { WorkoutExercise } from '@/lib/item-metadata';
import type { UnitSystem } from '@/types/database';
import { cn } from '@/lib/utils';
import { Dialog, DialogOverlay, DialogPortal, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { WorkoutExercisesEditor } from '@/components/fitness/workout-exercises-editor';
import { formatRepsDisplay } from '@/lib/workout-factory/parse-reps-scalar';
import { useTaskCardCoverUrl } from '@/lib/task-card-cover';
import { Dumbbell, Image as ImageIcon, Loader2, X } from 'lucide-react';
import { WORKOUT_FACTORY_CHAIN_MESSAGES } from '@/lib/workout-factory/api-client';

export type WorkoutViewerApplyPayload = {
  title: string;
  description: string;
  exercises: WorkoutExercise[];
};

type ViewMode = 'view' | 'edit';

function formatRestLabel(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '';
  if (seconds >= 60 && seconds % 60 === 0) return `Rest ${seconds / 60} min`;
  if (seconds >= 60) return `Rest ${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `Rest ${seconds}s`;
}

function exerciseThumbnailSrc(ex: WorkoutExercise): string | null {
  const u = ex.thumbnail_url;
  return typeof u === 'string' && u.trim().length > 0 ? u.trim() : null;
}

function RequestImageLink({
  exerciseName,
  exerciseQuery,
  taskId,
}: {
  exerciseName: string;
  exerciseQuery?: string;
  taskId: string | null;
}) {
  const body = [
    'Please add or generate a visualization image for this exercise in the BuddyBubble library.',
    '',
    `Exercise: ${exerciseName}`,
    exerciseQuery?.trim() ? `Catalog / query hint: ${exerciseQuery.trim()}` : null,
    taskId ? `Task ID: ${taskId}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const subject = encodeURIComponent('Exercise image request');
  const bodyEnc = encodeURIComponent(body);
  const to =
    typeof process !== 'undefined' && process.env.NEXT_PUBLIC_EXERCISE_IMAGE_REQUEST_EMAIL?.trim()
      ? process.env.NEXT_PUBLIC_EXERCISE_IMAGE_REQUEST_EMAIL.trim()
      : '';
  const href = to
    ? `mailto:${to}?subject=${subject}&body=${bodyEnc}`
    : `mailto:?subject=${subject}&body=${bodyEnc}`;

  return (
    <a
      href={href}
      className="mt-1.5 inline-block text-[11px] font-medium text-primary/90 underline-offset-2 hover:underline"
      onClick={() => {
        toast.message('Opening your mail app…', {
          description: 'Add our team address in To: if your client left it blank.',
        });
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      Request image
    </a>
  );
}

function ExerciseThumbnailFrame({ src, alt }: { src: string | null; alt: string }) {
  return (
    <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-border/50 bg-background/80 shadow-sm ring-1 ring-border/20">
      {src ? (
        <img src={src} alt={alt} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-muted/30" aria-hidden>
          <Dumbbell className="size-6 text-muted-foreground/45" />
        </div>
      )}
    </div>
  );
}

function ExerciseReadRow({
  name,
  metaLine,
  notes,
  thumbnailUrl,
  taskId,
  exerciseQuery,
}: {
  name: string;
  metaLine: string | null;
  notes?: string | null;
  thumbnailUrl: string | null;
  taskId: string | null;
  exerciseQuery?: string;
}) {
  const showRequest = !thumbnailUrl;

  return (
    <div className="flex gap-4 rounded-xl bg-muted/40 p-3 ring-1 ring-border/15 transition-colors hover:bg-muted/55">
      <ExerciseThumbnailFrame src={thumbnailUrl} alt={name} />
      <div className="min-w-0 flex-1 flex-col">
        <h4 className="font-semibold leading-snug text-foreground">{name}</h4>
        {metaLine ? (
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            <span className="font-medium text-foreground/80">{metaLine}</span>
          </div>
        ) : null}
        {notes?.trim() ? (
          <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            {notes.trim()}
          </p>
        ) : null}
        {showRequest ? (
          <RequestImageLink exerciseName={name} exerciseQuery={exerciseQuery} taskId={taskId} />
        ) : null}
      </div>
    </div>
  );
}

function ExerciseDetail({ ex, taskId }: { ex: Exercise; taskId: string | null }) {
  const bits: string[] = [];
  if (typeof ex.sets === 'number' && ex.sets > 0) bits.push(`${ex.sets}×`);
  if (ex.reps) bits.push(`${formatRepsDisplay(ex.reps)} reps`);
  if (ex.rpe != null) bits.push(`RPE ${ex.rpe}`);
  if (ex.restSeconds != null && ex.restSeconds > 0) bits.push(formatRestLabel(ex.restSeconds));
  if (ex.workSeconds != null && ex.workSeconds > 0) bits.push(`${ex.workSeconds}s work`);
  if (ex.rounds != null && ex.rounds > 0) bits.push(`${ex.rounds} rounds`);
  const metaLine = bits.length > 0 ? bits.join(' · ') : null;
  const notes = ex.coachNotes?.trim() ?? '';

  return (
    <ExerciseReadRow
      name={ex.exerciseName}
      metaLine={metaLine}
      notes={notes || null}
      thumbnailUrl={null}
      taskId={taskId}
      exerciseQuery={ex.exerciseQuery}
    />
  );
}

function InstructionBlockSection({
  title,
  blocks,
  taskId,
}: {
  title: string;
  blocks: Array<{ order: number; exerciseName: string; instructions: string[] }>;
  taskId: string | null;
}) {
  if (!blocks?.length) return null;
  return (
    <section className="space-y-3">
      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h4>
      <div className="space-y-2">
        {blocks.map((b, i) => (
          <div
            key={`${b.order}-${i}`}
            className="flex gap-4 rounded-xl bg-muted/30 p-3 ring-1 ring-border/10"
          >
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-border/40 bg-background/60 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Prep
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-foreground">{b.exerciseName}</p>
              {b.instructions?.length ? (
                <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-xs text-muted-foreground">
                  {b.instructions.map((line, j) => (
                    <li key={j}>{line}</li>
                  ))}
                </ul>
              ) : null}
              <RequestImageLink exerciseName={b.exerciseName} taskId={taskId} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function RichWorkoutReadView({
  workoutSet,
  cardTitle,
  taskId,
}: {
  workoutSet: WorkoutSetTemplate;
  cardTitle: string;
  taskId: string | null;
}) {
  const firstRaw = workoutSet.workouts?.[0] as ProgramWorkout | undefined;
  if (!firstRaw) {
    return <p className="text-sm text-muted-foreground">No session in this workout set.</p>;
  }
  const first = normalizeWorkoutForEditor(firstRaw);
  const setTitleDiffers =
    workoutSet.title.trim().length > 0 && workoutSet.title.trim() !== cardTitle.trim();

  return (
    <div className="space-y-6">
      <p className="text-[11px] capitalize text-muted-foreground">
        Difficulty · {workoutSet.difficulty}
      </p>

      {(setTitleDiffers || workoutSet.description?.trim()) && (
        <div className="space-y-1 rounded-xl bg-muted/25 px-3 py-2.5 ring-1 ring-border/10">
          {setTitleDiffers ? (
            <p className="text-sm font-medium text-foreground">{workoutSet.title}</p>
          ) : null}
          {workoutSet.description?.trim() ? (
            <p className="text-xs leading-relaxed text-muted-foreground">
              {workoutSet.description}
            </p>
          ) : null}
        </div>
      )}

      {(first.title.trim().length > 0 || first.description?.trim()) && (
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Session
          </p>
          {first.title.trim() ? (
            <p className="text-sm font-semibold text-foreground">{first.title}</p>
          ) : null}
          {first.description?.trim() ? (
            <p className="text-sm leading-relaxed text-muted-foreground">{first.description}</p>
          ) : null}
        </div>
      )}

      <InstructionBlockSection title="Warm-up" blocks={first.warmupBlocks ?? []} taskId={taskId} />

      {first.exerciseBlocks?.map((block, bi) => (
        <section key={block.id ?? `block-${bi}`} className="space-y-3">
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {block.name?.trim() || 'Main work'}
          </h4>
          <div className="space-y-2">
            {(block.exercises ?? []).map((ex, ei) => (
              <ExerciseDetail key={ex.id ?? `${bi}-${ei}`} ex={ex} taskId={taskId} />
            ))}
          </div>
        </section>
      ))}

      <InstructionBlockSection
        title="Finisher"
        blocks={first.finisherBlocks ?? []}
        taskId={taskId}
      />
      <InstructionBlockSection
        title="Cool down"
        blocks={first.cooldownBlocks ?? []}
        taskId={taskId}
      />
    </div>
  );
}

function WorkoutViewHero({
  cardCoverPath,
  fullBleed = true,
}: {
  cardCoverPath: string | null;
  /** When false (embedded pane), hero stays within horizontal padding. */
  fullBleed?: boolean;
}) {
  const { url: coverUrl, loading } = useTaskCardCoverUrl(cardCoverPath);

  return (
    <div
      className={cn(
        'relative h-48 shrink-0 overflow-hidden bg-muted',
        fullBleed ? '-mx-5 w-[calc(100%+2.5rem)]' : 'w-full',
      )}
    >
      {cardCoverPath && loading ? (
        <div className="h-full w-full animate-pulse bg-muted-foreground/10" aria-hidden />
      ) : coverUrl ? (
        <>
          <img src={coverUrl} alt="" className="h-full w-full object-cover" />
          <div
            className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-black/15 to-transparent"
            aria-hidden
          />
        </>
      ) : (
        <div className="flex h-full w-full items-center justify-center text-muted-foreground/50">
          <ImageIcon className="size-10" aria-hidden />
        </div>
      )}
    </div>
  );
}

function ViewReadHeader({
  displayTitle,
  displayDescription,
}: {
  displayTitle: string;
  displayDescription: string;
}) {
  return (
    <div className="space-y-3">
      <h2 className="text-2xl font-bold tracking-tight text-foreground">{displayTitle}</h2>
      {displayDescription ? (
        <div className="text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">
          {displayDescription}
        </div>
      ) : null}
    </div>
  );
}

function FlatExercisesReadView({
  exercises,
  taskId,
}: {
  exercises: WorkoutExercise[];
  taskId: string | null;
}) {
  if (exercises.length === 0) {
    return <p className="text-sm text-muted-foreground">No exercises on this card yet.</p>;
  }
  return (
    <ul className="space-y-2">
      {exercises.map((ex, idx) => {
        const thumb = exerciseThumbnailSrc(ex);
        const parts: string[] = [];
        if (ex.sets != null) parts.push(`${ex.sets}×`);
        if (ex.reps != null) parts.push(`${formatRepsDisplay(ex.reps)} reps`);
        const rest = ex.rest_seconds != null ? formatRestLabel(ex.rest_seconds) : '';
        const metaParts = [...parts, rest].filter(Boolean);
        const metaLine = metaParts.length > 0 ? metaParts.join(' · ') : null;
        const notes = ex.coach_notes || ex.notes || null;

        return (
          <li key={idx}>
            <ExerciseReadRow
              name={ex.name}
              metaLine={metaLine}
              notes={notes}
              thumbnailUrl={thumb}
              taskId={taskId}
            />
          </li>
        );
      })}
    </ul>
  );
}

const sectionHeadingClass =
  'mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground';

function WorkoutPlanGeneratingView({ active }: { active: boolean }) {
  const statusLines = useMemo(
    () => ['Reading coach notes…', ...WORKOUT_FACTORY_CHAIN_MESSAGES, 'Almost there…'],
    [],
  );
  const [lineIdx, setLineIdx] = useState(0);

  useEffect(() => {
    if (!active) return;
    setLineIdx(0);
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => {
      setLineIdx((i) => (i + 1) % statusLines.length);
    }, 3400);
    return () => clearInterval(t);
  }, [active, statusLines.length]);

  if (!active) return null;

  return (
    <div
      className="flex min-h-[min(280px,45vh)] flex-col items-center justify-center gap-4 rounded-xl border border-border/60 bg-muted/25 px-6 py-12 text-center"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <Loader2 className="size-9 shrink-0 animate-spin text-primary" aria-hidden />
      <div className="max-w-sm space-y-2">
        <p className="text-base font-semibold text-foreground">Workout generating</p>
        <p className="text-xs leading-relaxed text-muted-foreground">{statusLines[lineIdx]}</p>
      </div>
    </div>
  );
}

export type WorkoutViewerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Rich AI output when present. */
  workoutSet: WorkoutSetTemplate | null;
  /** Flat list from task metadata (always passed). */
  exercises: WorkoutExercise[];
  title: string;
  description: string;
  canWrite: boolean;
  workoutUnitSystem: UnitSystem;
  onApply: (payload: WorkoutViewerApplyPayload) => void;
  /** Task card cover storage path (`metadata.card_cover_path`); signed URL resolved in-dialog. */
  cardCoverPath?: string | null;
  /** For exercise image request emails / context. */
  taskId?: string | null;
  /** Embedded viewer: show a loading state in the plan section while the AI chain runs. */
  isAiGenerating?: boolean;
};

export type WorkoutViewerContentProps = Omit<WorkoutViewerDialogProps, 'open' | 'onOpenChange'> & {
  onRequestClose: () => void;
  /** Increment when the embedded pane or dialog opens so drafts reset from props. */
  syncKey: number;
  /** `dialog`: participate in parent grid via `display:contents`. `embedded`: flex column for TaskModal split pane. */
  layout?: 'dialog' | 'embedded';
  /** When true, wrap the visible title in Radix `DialogTitle asChild` for standalone dialog a11y. */
  dialogTitleAsChild?: boolean;
  className?: string;
};

export function WorkoutViewerContent({
  workoutSet,
  exercises,
  title,
  description,
  canWrite,
  workoutUnitSystem,
  onApply,
  onRequestClose,
  syncKey,
  cardCoverPath = null,
  taskId = null,
  layout = 'dialog',
  dialogTitleAsChild = false,
  className,
  isAiGenerating = false,
}: WorkoutViewerContentProps) {
  const [mode, setMode] = useState<ViewMode>('view');
  const [localTitle, setLocalTitle] = useState(title);
  const [localDescription, setLocalDescription] = useState(description);
  const [localExercises, setLocalExercises] = useState<WorkoutExercise[]>([]);

  useEffect(() => {
    setLocalTitle(title);
    setLocalDescription(description);
    setLocalExercises(exercises.map((e) => ({ ...e })));
    setMode('view');
  }, [syncKey, title, description, exercises]);

  const handleApply = useCallback(() => {
    onApply({
      title: localTitle.trim(),
      description: localDescription.trim(),
      exercises: localExercises,
    });
    onRequestClose();
  }, [localTitle, localDescription, localExercises, onApply, onRequestClose]);

  const showRich = mode === 'view' && workoutSet != null;
  const displayTitle = localTitle.trim() || title.trim() || 'Untitled workout';
  const displayDescription = (localDescription || description).trim();
  const coverPath = cardCoverPath?.trim() ? cardCoverPath.trim() : null;
  const heroFullBleed = layout === 'dialog';

  const titleNode = dialogTitleAsChild ? (
    <DialogTitle asChild>
      <h2 className="text-lg font-semibold leading-tight text-foreground">Workout card</h2>
    </DialogTitle>
  ) : (
    <h2 className="text-lg font-semibold leading-tight text-foreground">Workout card</h2>
  );

  const header = (
    <div className="flex flex-col gap-3 border-b border-border px-5 py-4">
      <div className="flex items-start justify-between gap-2">
        {titleNode}
        <div className="flex shrink-0 items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
            <button
              type="button"
              onClick={() => setMode('view')}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                mode === 'view'
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:bg-muted',
              )}
            >
              View
            </button>
            <button
              type="button"
              disabled={!canWrite}
              onClick={() => setMode('edit')}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                mode === 'edit'
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:bg-muted',
                !canWrite && 'cursor-not-allowed opacity-50',
              )}
            >
              Edit
            </button>
          </div>
          <button
            type="button"
            onClick={onRequestClose}
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Close workout viewer"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
      </div>
      {!canWrite && mode === 'edit' ? (
        <p className="text-xs text-muted-foreground">
          You don’t have permission to edit this card.
        </p>
      ) : null}
    </div>
  );

  const body = (
    <div className={cn('min-h-0 overflow-y-auto', layout === 'embedded' && 'min-h-0 flex-1')}>
      {mode === 'view' ? (
        <div className="flex flex-col pb-2">
          <WorkoutViewHero cardCoverPath={coverPath} fullBleed={heroFullBleed} />
          <div className="space-y-8 px-5 py-6">
            <ViewReadHeader displayTitle={displayTitle} displayDescription={displayDescription} />
            <section>
              <h3 className={sectionHeadingClass}>Workout plan</h3>
              {showRich ? (
                <RichWorkoutReadView
                  workoutSet={workoutSet}
                  cardTitle={displayTitle}
                  taskId={taskId}
                />
              ) : isAiGenerating && mode === 'view' ? (
                <WorkoutPlanGeneratingView active />
              ) : (
                <div className="space-y-4">
                  <p className="text-xs text-muted-foreground">
                    No AI workout structure saved — showing the exercise list from this card.
                  </p>
                  <FlatExercisesReadView exercises={localExercises} taskId={taskId} />
                </div>
              )}
            </section>
          </div>
        </div>
      ) : (
        <div className="space-y-4 px-5 py-4">
          <div className="space-y-2">
            <Label htmlFor="wv-title">Title</Label>
            <Input
              id="wv-title"
              value={localTitle}
              onChange={(e) => setLocalTitle(e.target.value)}
              disabled={!canWrite}
              className="h-9"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="wv-desc">Description</Label>
            <Textarea
              id="wv-desc"
              value={localDescription}
              onChange={(e) => setLocalDescription(e.target.value)}
              disabled={!canWrite}
              rows={4}
              className="min-h-[96px] resize-y"
            />
          </div>
          <WorkoutExercisesEditor
            exercises={localExercises}
            onChange={setLocalExercises}
            canWrite={canWrite}
            workoutUnitSystem={workoutUnitSystem}
            idPrefix="wv-ex"
          />
        </div>
      )}
    </div>
  );

  const footer =
    mode === 'edit' && canWrite ? (
      <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
        <Button type="button" variant="outline" size="sm" onClick={onRequestClose}>
          Cancel
        </Button>
        <Button type="button" size="sm" onClick={handleApply}>
          Apply changes
        </Button>
      </div>
    ) : (
      <div className="flex justify-end border-t border-border px-5 py-3">
        <Button type="button" variant="secondary" size="sm" onClick={onRequestClose}>
          Close
        </Button>
      </div>
    );

  if (layout === 'embedded') {
    return (
      <div className={cn('flex h-full min-h-0 flex-col overflow-hidden bg-card', className)}>
        {header}
        {body}
        {footer}
      </div>
    );
  }

  return (
    <div className={cn('contents', className)}>
      {header}
      {body}
      {footer}
    </div>
  );
}

export function WorkoutViewerDialog({
  open,
  onOpenChange,
  workoutSet,
  exercises,
  title,
  description,
  canWrite,
  workoutUnitSystem,
  onApply,
  cardCoverPath = null,
  taskId = null,
}: WorkoutViewerDialogProps) {
  const [syncKey, setSyncKey] = useState(0);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setSyncKey((k) => k + 1);
    }
    wasOpenRef.current = open;
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="z-[155]" />
        <DialogPrimitive.Content
          className={cn(
            'fixed top-[50%] left-[50%] z-[160] grid max-h-[min(90vh,760px)] w-full max-w-xl translate-x-[-50%] translate-y-[-50%]',
            'gap-0 overflow-hidden border border-border bg-card p-0 text-card-foreground shadow-2xl sm:rounded-2xl',
            'grid-rows-[auto_minmax(0,1fr)_auto]',
          )}
        >
          <WorkoutViewerContent
            workoutSet={workoutSet}
            exercises={exercises}
            title={title}
            description={description}
            canWrite={canWrite}
            workoutUnitSystem={workoutUnitSystem}
            onApply={onApply}
            onRequestClose={() => onOpenChange(false)}
            syncKey={syncKey}
            cardCoverPath={cardCoverPath}
            taskId={taskId}
            layout="dialog"
            dialogTitleAsChild
          />
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
