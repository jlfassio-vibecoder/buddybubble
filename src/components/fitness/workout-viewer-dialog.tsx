'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { toast } from 'sonner';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import type { WorkoutSetTemplate } from '@/lib/workout-factory/types/workout-contract';
import type { WorkoutExercise } from '@/lib/item-metadata';
import type { Json, UnitSystem } from '@/types/database';
import { cn } from '@/lib/utils';
import { Dialog, DialogOverlay, DialogPortal, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { WorkoutExercisesEditor } from '@/components/fitness/workout-exercises-editor';
import {
  WorkoutBlockListEditor,
  WorkoutBlockListRenderer,
  WorkoutFlatExerciseList,
  WorkoutLogReadSummary,
} from '@/components/fitness/workout-block-renderer';
import { useWorkoutSessionViewModel } from '@/hooks/use-workout-session-view-model';
import { useExerciseCueResolution } from '@/hooks/useExerciseCueResolution';
import { useWorkoutBlockDraftSession } from '@/components/fitness/hooks/useWorkoutBlockDraftSession';
import {
  collectBlockExercises,
  collectFlatOnlyExercises,
  emptyResolvedCueBundle,
} from '@/lib/workout-factory/resolve-exercise-cue-bundle';
import {
  applyCuePatchesToMetadata,
  mergeCuePatchIntoBundle,
  type WorkoutCuePatch,
} from '@/lib/workout-factory/apply-cue-patches-to-metadata';
import { savePersonalExerciseCues } from '@/lib/workout-factory/save-personal-exercise-cues';
import type { SaveToMyNotesArgs } from '@/components/fitness/workout-block-renderer/workout-block-renderer-types';
import { useUserProfileStore } from '@/store/userProfileStore';
import type { WorkoutSessionBlockView } from '@/lib/workout-factory/workout-session-view-model';
import type { CoachStructuralPatchOp } from '@/lib/agents/_shared/workout-metadata/structural-patch-types';
import { useTaskCardCoverUrl } from '@/lib/task-card-cover';
import { ChevronRight, Image as ImageIcon, Loader2, X } from 'lucide-react';
import type { ExerciseCueRequestV1 } from '@/lib/agents/coach/exercise-cue-request';
import { WORKOUT_FACTORY_CHAIN_MESSAGES } from '@/lib/workout-factory/api-client';
import { resolveWorkoutViewerNarrative } from '@/lib/workout-factory/workout-viewer-narrative';
import { WorkoutCoachBriefSection } from '@/components/fitness/workout-block-renderer/WorkoutCoachBriefSection';
import { TaskModalCardCoverAiBlock } from '@/components/modals/task-modal/TaskModalCardCoverAiBlock';
import {
  ActiveSessionLaunchControl,
  type ActiveSessionLaunchControlProps,
} from '@/components/fitness/WorkoutPlayer';

export type WorkoutViewerApplyPayload = {
  title: string;
  description: string;
  exercises: WorkoutExercise[];
  /** Present when rich block editor was used for Apply. */
  blocks?: WorkoutSessionBlockView[];
};

export type { WorkoutCuePatch } from '@/lib/workout-factory/apply-cue-patches-to-metadata';

function WorkoutViewHero({
  cardCoverPath,
  fullBleed = true,
  cardCoverGenerating = false,
}: {
  cardCoverPath: string | null;
  /** When false (embedded pane), hero stays within horizontal padding. */
  fullBleed?: boolean;
  /** AI cover generation in progress: pulsing overlay on the hero. */
  cardCoverGenerating?: boolean;
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
      {cardCoverGenerating ? (
        <div
          className="absolute inset-0 flex items-center justify-center bg-background/55 backdrop-blur-[1px]"
          aria-busy
          aria-live="polite"
        >
          <div
            className="h-full w-full animate-pulse bg-muted-foreground/15"
            role="status"
            aria-label="Generating cover"
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="size-8 shrink-0 animate-spin text-primary" aria-hidden />
          </div>
        </div>
      ) : null}
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
      {displayDescription ? <WorkoutCoachBriefSection brief={displayDescription} /> : null}
    </div>
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
  /** Task metadata for read VM (blocks, chrome). */
  metadata?: Json | null;
  title: string;
  description: string;
  canWrite: boolean;
  workoutUnitSystem: UnitSystem;
  onApply: (payload: WorkoutViewerApplyPayload) => void | boolean | Promise<void | boolean>;
  /** Merge workout-scoped cue patches into task metadata (M2). */
  onApplyCuePatches?: (patches: Record<string, WorkoutCuePatch>) => void;
  /** M3: programmatic Coach cue generation from view-mode panel. */
  onAskCoachForCues?: (payload: ExerciseCueRequestV1) => void;
  injuriesOnFile?: boolean;
  /** Task card cover storage path (`metadata.card_cover_path`); signed URL resolved in-dialog. */
  cardCoverPath?: string | null;
  /** For exercise image request emails / context. */
  taskId?: string | null;
  /** Embedded viewer: show a loading state in the plan section while the AI chain runs. */
  isAiGenerating?: boolean;
  /** TaskModal: inline AI card cover (shared `useTaskCardCoverAi` state). */
  cardCoverAiHint?: string;
  onCardCoverAiHintChange?: (hint: string) => void;
  cardCoverPresetId?: string;
  onCardCoverPresetIdChange?: (id: string) => void;
  aiCardCoverGenerating?: boolean;
  onGenerateCardCoverWithAi?: () => void | Promise<void>;
  showInlineCardCoverAi?: boolean;
  /** Parity with TaskModal Details: disable AI controls while saving. */
  cardCoverSaveBusy?: boolean;
  /** When set, show a DB save control in the view-mode footer (e.g. `TaskModal` + `saveCoreFields`). */
  onSaveTask?: (metadataOverride?: Json) => void | Promise<void>;
  /** Busy state while persisting the task. */
  saving?: boolean;
  /** When true, save is disabled (e.g. `!coreDirty` in the parent). */
  saveDisabled?: boolean;
  /** `log` uses completed-workout read UI with set_logs overlay. */
  readVariant?: 'workout' | 'log';
  /** Active Session launch control (shared gate with Details tab). */
  activeSessionLaunch?: Pick<
    ActiveSessionLaunchControlProps,
    'launchUi' | 'onLaunchClick' | 'busy'
  > | null;
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

/** Imperative canvas draft API for Coach → editor mutations (TaskModal effect sweep). */
export type WorkoutViewerCanvasDraftHandle = {
  mode: 'view' | 'edit';
  /** True when local drafts diverge from source (unsaved keystrokes / edits). */
  isDirty: boolean;
  enterEdit: () => void;
  applyExternalBlocks: (blocks: WorkoutSessionBlockView[]) => boolean;
  applyStructuralPatch: (patches: CoachStructuralPatchOp[]) => boolean;
};

export const WorkoutViewerContent = forwardRef<
  WorkoutViewerCanvasDraftHandle,
  WorkoutViewerContentProps
>(function WorkoutViewerContent(
  {
    workoutSet,
    exercises,
    metadata = null,
    title,
    description,
    canWrite,
    workoutUnitSystem,
    onApply,
    onApplyCuePatches,
    onAskCoachForCues,
    injuriesOnFile = false,
    onRequestClose,
    syncKey,
    cardCoverPath = null,
    taskId = null,
    layout = 'dialog',
    dialogTitleAsChild = false,
    className,
    isAiGenerating = false,
    cardCoverAiHint = '',
    onCardCoverAiHintChange,
    cardCoverPresetId = '',
    onCardCoverPresetIdChange,
    aiCardCoverGenerating = false,
    onGenerateCardCoverWithAi,
    showInlineCardCoverAi = false,
    cardCoverSaveBusy = false,
    onSaveTask,
    saving = false,
    saveDisabled = false,
    readVariant = 'workout',
    activeSessionLaunch = null,
  },
  ref,
) {
  const [localCuePatches, setLocalCuePatches] = useState<Record<string, WorkoutCuePatch>>({});

  const sessionVm = useWorkoutSessionViewModel(metadata ?? {});

  const {
    mode,
    draftTitle: localTitle,
    setDraftTitle: setLocalTitle,
    draftDescription: localDescription,
    setDraftDescription: setLocalDescription,
    draftExercises: localExercises,
    setDraftExercises: setLocalExercises,
    draftBlocks: localBlocks,
    setDraftBlocks: setLocalBlocks,
    isDirty,
    enterEdit,
    cancelEdit,
    applyEdits,
    applyExternalBlocks,
    applyStructuralPatch,
  } = useWorkoutBlockDraftSession({
    syncKey,
    source: {
      title,
      description,
      exercises,
      blocks: sessionVm.blocks,
    },
    exitEditOnApply: true,
  });

  useImperativeHandle(
    ref,
    () => ({
      mode,
      isDirty,
      enterEdit,
      applyExternalBlocks,
      applyStructuralPatch,
    }),
    [mode, isDirty, enterEdit, applyExternalBlocks, applyStructuralPatch],
  );

  // Cue drafts are viewer-local; clear on hard sync only (hook owns draft/mode reset).
  useEffect(() => {
    setLocalCuePatches({});
  }, [syncKey]);

  const profileId = useUserProfileStore((s) => s.profile?.id ?? null);
  const cuesEnabled = mode === 'view' && readVariant !== 'log';
  const {
    cuesByKey,
    loading: cuesLoading,
    refresh: refreshCues,
  } = useExerciseCueResolution({
    enabled: cuesEnabled,
    userId: profileId,
    blocks: sessionVm.blocks,
    flatExercises: sessionVm.flatExercises,
  });

  const exerciseNamesByKey = useMemo(() => {
    const fromBlocks = collectBlockExercises(sessionVm.blocks);
    const collected =
      fromBlocks.length > 0 ? fromBlocks : collectFlatOnlyExercises(sessionVm.flatExercises);
    const map: Record<string, string> = {};
    for (const item of collected) {
      map[item.key] = item.exerciseName;
    }
    return map;
  }, [sessionVm.blocks, sessionVm.flatExercises]);

  const displayCuesByKey = useMemo(() => {
    const out = { ...cuesByKey };
    for (const [key, patch] of Object.entries(localCuePatches)) {
      const name = exerciseNamesByKey[key] ?? 'Exercise';
      out[key] = mergeCuePatchIntoBundle(out[key] ?? emptyResolvedCueBundle(name), patch);
    }
    return out;
  }, [cuesByKey, localCuePatches, exerciseNamesByKey]);

  const hasUnsavedCuePatches = Object.keys(localCuePatches).length > 0;
  const canWriteCue = canWrite && cuesEnabled;

  const useRichBlockEdit =
    readVariant !== 'log' && sessionVm.source === 'rich' && sessionVm.blocks.length > 0;

  const handleCueDraftChange = useCallback((key: string, patch: WorkoutCuePatch) => {
    setLocalCuePatches((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }, []);

  const handleCuePatchCommit = useCallback(
    (key: string, patch: WorkoutCuePatch) => {
      onApplyCuePatches?.({ [key]: patch });
      setLocalCuePatches((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    },
    [onApplyCuePatches],
  );

  const handleCuePatchCancel = useCallback((key: string) => {
    setLocalCuePatches((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const handleSaveToMyNotes = useCallback(
    async (args: SaveToMyNotesArgs) => {
      if (!profileId) {
        toast.error('Sign in to save personal notes.');
        throw new Error('not_authenticated');
      }
      const result = await savePersonalExerciseCues({
        exerciseName: args.exerciseName,
        dictionaryId: args.dictionaryId,
        patch: args.patch,
        mode: 'replace',
      });
      if (!result.ok) {
        toast.error(result.error);
        throw new Error(result.error);
      }
      toast.success('Saved to your notes');
      await refreshCues();
    },
    [profileId, refreshCues],
  );

  const handleRequestClose = useCallback(() => {
    if (hasUnsavedCuePatches && !window.confirm('Discard unsaved cue changes?')) {
      return;
    }
    onRequestClose();
  }, [hasUnsavedCuePatches, onRequestClose]);

  const handleFooterSave = useCallback(() => {
    let metadataOverride: Json | undefined;
    if (hasUnsavedCuePatches && Object.keys(localCuePatches).length > 0) {
      metadataOverride = applyCuePatchesToMetadata(metadata ?? {}, localCuePatches) as Json;
      onApplyCuePatches?.(localCuePatches);
      setLocalCuePatches({});
    }
    void onSaveTask?.(metadataOverride);
  }, [hasUnsavedCuePatches, localCuePatches, metadata, onApplyCuePatches, onSaveTask]);

  const cueEditProps = useMemo(
    () => ({
      canWriteCue,
      onCueSave: handleCuePatchCommit,
      onCueDraftChange: handleCueDraftChange,
      onCueCancel: handleCuePatchCancel,
      onAskCoachForCues,
      onSaveToMyNotes: profileId ? handleSaveToMyNotes : undefined,
      injuriesOnFile,
    }),
    [
      canWriteCue,
      handleCuePatchCommit,
      handleCueDraftChange,
      handleCuePatchCancel,
      onAskCoachForCues,
      handleSaveToMyNotes,
      profileId,
      injuriesOnFile,
    ],
  );

  const handleApply = useCallback(() => {
    void applyEdits(async (p) => {
      const result = await onApply(
        useRichBlockEdit
          ? p
          : { title: p.title, description: p.description, exercises: p.exercises },
      );
      return result !== false;
    });
  }, [applyEdits, useRichBlockEdit, onApply]);

  const exitEditToView = cancelEdit;
  const handleViewTabClick = cancelEdit;

  const showRichRead =
    mode === 'view' && sessionVm.source === 'rich' && sessionVm.blocks.length > 0;
  const isLogRead =
    readVariant === 'log' ||
    localExercises.some((e) => Array.isArray(e.set_logs) && e.set_logs.length > 0);
  const logReadMetadata = useMemo(
    () => ({
      ...(typeof metadata === 'object' && metadata !== null && !Array.isArray(metadata)
        ? metadata
        : {}),
      exercises: localExercises,
    }),
    [metadata, localExercises],
  );
  const hasWorkoutViewerContent = workoutSet != null || localExercises.length > 0;
  const showUnsavedPersistenceNotice = !taskId && (hasWorkoutViewerContent || isAiGenerating);
  const displayTitle = localTitle.trim() || title.trim() || 'Untitled workout';
  const narrative = useMemo(
    () =>
      resolveWorkoutViewerNarrative({
        taskDescription: (localDescription || description).trim(),
        metadata,
        blocks: sessionVm.blocks,
      }),
    [localDescription, description, metadata, sessionVm.blocks],
  );
  const displayDescription = narrative.coachBrief;
  const coverPath = cardCoverPath?.trim() ? cardCoverPath.trim() : null;
  const heroFullBleed = layout === 'dialog';
  const showEmbeddedAiCover = Boolean(
    showInlineCardCoverAi &&
    layout === 'embedded' &&
    taskId &&
    onCardCoverAiHintChange &&
    onCardCoverPresetIdChange &&
    onGenerateCardCoverWithAi,
  );
  const aiBlockDisabled = !canWrite || cardCoverSaveBusy || aiCardCoverGenerating;
  const inlineAiNode =
    showEmbeddedAiCover &&
    onCardCoverPresetIdChange &&
    onCardCoverAiHintChange &&
    onGenerateCardCoverWithAi ? (
      coverPath ? (
        <details className="border-b border-border/50 bg-muted/10 px-5 py-1 open:[&>summary>svg]:rotate-90">
          <summary className="flex cursor-pointer list-none items-center gap-1 py-2 text-xs font-medium text-muted-foreground outline-none marker:content-['']">
            <ChevronRight className="size-3.5 shrink-0 transition-transform" aria-hidden />
            AI cover: update style
          </summary>
          <div className="pb-3 pt-0">
            <TaskModalCardCoverAiBlock
              presetId={cardCoverPresetId}
              onPresetChange={onCardCoverPresetIdChange}
              hint={cardCoverAiHint}
              onHintChange={onCardCoverAiHintChange}
              isGenerating={aiCardCoverGenerating}
              isDisabled={aiBlockDisabled}
              onGenerate={onGenerateCardCoverWithAi}
              canWrite={canWrite}
            />
          </div>
        </details>
      ) : (
        <div className="space-y-2 border-b border-border/50 bg-muted/10 px-5 py-3">
          <p className="text-xs text-muted-foreground">AI cover for this workout</p>
          <TaskModalCardCoverAiBlock
            presetId={cardCoverPresetId}
            onPresetChange={onCardCoverPresetIdChange}
            hint={cardCoverAiHint}
            onHintChange={onCardCoverAiHintChange}
            isGenerating={aiCardCoverGenerating}
            isDisabled={aiBlockDisabled}
            onGenerate={onGenerateCardCoverWithAi}
            canWrite={canWrite}
          />
        </div>
      )
    ) : null;

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
          {activeSessionLaunch && activeSessionLaunch.launchUi.mode !== 'hidden' ? (
            <ActiveSessionLaunchControl
              launchUi={activeSessionLaunch.launchUi}
              onLaunchClick={activeSessionLaunch.onLaunchClick}
              busy={activeSessionLaunch.busy}
              variant="compact"
            />
          ) : null}
          <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
            <button
              type="button"
              onClick={handleViewTabClick}
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
              onClick={enterEdit}
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
            onClick={handleRequestClose}
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
      {showUnsavedPersistenceNotice ? (
        <div className="rounded-lg border border-border/70 bg-muted/35 px-3 py-2 text-xs text-muted-foreground">
          Create or save this card to persist your generated workout and enable task-linked tools.
        </div>
      ) : null}
      {hasUnsavedCuePatches ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-muted-foreground">
          Unsaved cue changes — save to this workout or use Save to persist.
        </div>
      ) : null}
    </div>
  );

  const body = (
    <div className={cn('min-h-0 overflow-y-auto', layout === 'embedded' && 'min-h-0 flex-1')}>
      {mode === 'view' ? (
        <div className="flex flex-col pb-2">
          <WorkoutViewHero
            cardCoverPath={coverPath}
            fullBleed={heroFullBleed}
            cardCoverGenerating={Boolean(
              showInlineCardCoverAi && layout === 'embedded' && aiCardCoverGenerating,
            )}
          />
          {inlineAiNode}
          <div className="space-y-8 px-5 py-6">
            <ViewReadHeader displayTitle={displayTitle} displayDescription={displayDescription} />
            <section>
              <h3 className={sectionHeadingClass}>Workout plan</h3>
              {readVariant === 'log' ? (
                <WorkoutLogReadSummary
                  metadata={logReadMetadata}
                  taskId={taskId}
                  density="full"
                  unitSystem={workoutUnitSystem}
                  data-testid="workout-viewer-log-read"
                />
              ) : showRichRead ? (
                <WorkoutBlockListRenderer
                  blocks={sessionVm.blocks}
                  taskId={taskId}
                  density="full"
                  cuesByKey={displayCuesByKey}
                  cuesLoading={cuesLoading}
                  {...cueEditProps}
                  chrome={{
                    difficulty: sessionVm.workoutSet?.difficulty,
                    structureRationale: narrative.structureRationale ?? undefined,
                    sessionAdaptations: narrative.sessionAdaptations ?? undefined,
                    cardTitle: displayTitle,
                  }}
                  data-testid="workout-viewer-block-list"
                />
              ) : isAiGenerating && mode === 'view' ? (
                <WorkoutPlanGeneratingView active />
              ) : isLogRead ? (
                <WorkoutLogReadSummary
                  metadata={logReadMetadata}
                  taskId={taskId}
                  density="full"
                  unitSystem={workoutUnitSystem}
                  data-testid="workout-viewer-log-read"
                />
              ) : (
                <div className="space-y-4">
                  <p className="text-xs text-muted-foreground">
                    No AI workout structure saved — showing the exercise list from this card.
                  </p>
                  <WorkoutFlatExerciseList
                    exercises={localExercises}
                    taskId={taskId}
                    density="full"
                    cuesByKey={displayCuesByKey}
                    cuesLoading={cuesLoading}
                    {...cueEditProps}
                  />
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
          {useRichBlockEdit ? (
            <WorkoutBlockListEditor
              blocks={localBlocks}
              canWrite={canWrite}
              workoutUnitSystem={workoutUnitSystem}
              onChange={setLocalBlocks}
              idPrefix="wv-block"
            />
          ) : (
            <WorkoutExercisesEditor
              exercises={localExercises}
              onChange={setLocalExercises}
              canWrite={canWrite}
              workoutUnitSystem={workoutUnitSystem}
              idPrefix="wv-ex"
            />
          )}
        </div>
      )}
    </div>
  );

  const footer =
    mode === 'edit' && canWrite ? (
      <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
        <Button type="button" variant="outline" size="sm" onClick={exitEditToView}>
          Cancel
        </Button>
        <Button type="button" size="sm" onClick={handleApply}>
          Apply changes
        </Button>
      </div>
    ) : (
      <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
        <Button type="button" variant="outline" size="sm" onClick={handleRequestClose}>
          Close
        </Button>
        {onSaveTask ? (
          <Button
            type="button"
            size="sm"
            disabled={(saveDisabled && !hasUnsavedCuePatches) || saving}
            onClick={handleFooterSave}
          >
            {saving ? 'Saving...' : 'Save'}
          </Button>
        ) : null}
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
});

export function WorkoutViewerDialog({
  open,
  onOpenChange,
  workoutSet,
  exercises,
  metadata = null,
  title,
  description,
  canWrite,
  workoutUnitSystem,
  onApply,
  onApplyCuePatches,
  onAskCoachForCues,
  injuriesOnFile,
  cardCoverPath = null,
  taskId = null,
  onSaveTask,
  saving,
  saveDisabled,
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
            metadata={metadata}
            title={title}
            description={description}
            canWrite={canWrite}
            workoutUnitSystem={workoutUnitSystem}
            onApply={onApply}
            onApplyCuePatches={onApplyCuePatches}
            onAskCoachForCues={onAskCoachForCues}
            injuriesOnFile={injuriesOnFile}
            onRequestClose={() => onOpenChange(false)}
            syncKey={syncKey}
            cardCoverPath={cardCoverPath}
            taskId={taskId}
            onSaveTask={onSaveTask}
            saving={saving}
            saveDisabled={saveDisabled}
            layout="dialog"
            dialogTitleAsChild
          />
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
