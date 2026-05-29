'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, LayoutGrid } from 'lucide-react';
import { WorkoutOutlinePanel } from '@/components/fitness/WorkoutOutlinePanel';
import {
  WorkoutGenerationIntakePanel,
  type WorkoutIntakePanelWizardProps,
} from '@/components/fitness/workout-intake/WorkoutGenerationIntakePanel';
import { StandardTaskChatRail } from '@/components/chat/StandardTaskChatRail';
import { isStandardTaskChatRailEnabled } from '@/lib/feature-flags/standardTaskChatRail';
import { COACH_SLUG } from '@/lib/agents/coach/config';
import { useWorkoutBuilderChatRail } from '@/features/workout-builder/useWorkoutBuilderChatRail';
import { WorkoutGenerationSkeleton } from '@/features/workout-builder/WorkoutGenerationSkeleton';
import { WorkoutBuilderGeneratedReview } from '@/features/workout-builder/WorkoutBuilderGeneratedReview';
import { useWorkoutSessionViewModel } from '@/hooks/use-workout-session-view-model';
import { buildWorkoutBuilderGeneratedHandoffUrl } from '@/lib/workout-builder/build-workout-builder-url';
import { safeNextPath } from '@/lib/safe-next-path';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { OutlineDraftAppliedEffectPayload } from '@/components/chat/agent-effects/types';
import type { TaskModalIntakePatch } from '@/lib/agents/coach/task-modal-intake-patch';
import type { WorkoutBuilderTaskPayload } from '@/features/workout-builder/types/workout-builder-task';
import { useWorkoutBuilderTaskHost } from '@/features/workout-builder/useWorkoutBuilderTaskHost';
import { useWorkoutIntakeWizardState } from '@/components/modals/task-modal/hooks/useWorkoutIntakeWizardState';
import { useTaskDirtyState } from '@/components/modals/task-modal/hooks/useTaskDirtyState';
import { useWorkoutUnitSystem } from '@/components/modals/task-modal/hooks/useWorkoutUnitSystem';
import {
  useTaskWorkoutAi,
  type WorkoutIntakeWizardData,
} from '@/components/modals/task-modal/hooks/useTaskWorkoutAi';

function pickWorkoutIntakePanelWizardProps(
  w: ReturnType<typeof useWorkoutIntakeWizardState>,
): WorkoutIntakePanelWizardProps {
  const {
    applyTaskModalIntakePatch,
    applyTaskModalIntakePatchFromMessage,
    markUserTouched,
    buildWizardPayload,
    buildPreflightPayload,
    mode,
    maxStep,
    ...rest
  } = w;
  return rest;
}

type Props = {
  workspaceId: string;
  task: WorkoutBuilderTaskPayload;
};

export function WorkoutBuilderShell({ workspaceId, task }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const standardRailEnabled = isStandardTaskChatRailEnabled();
  const [mobilePane, setMobilePane] = useState<'builder' | 'chat'>('builder');
  const handledOutlineAppliedMessageIdsRef = useRef<Map<string, Set<string>>>(new Map());
  const handledIntakePatchMessageIdsRef = useRef<Set<string>>(new Set());

  const host = useWorkoutBuilderTaskHost({ workspaceId, initialTask: task });
  const {
    taskId,
    bubbleId,
    title,
    description,
    loading,
    error,
    canWrite,
    canPostMessages,
    outlineEditor,
    workoutHashExerciseNames,
    metadata,
    setMetadata,
    workoutDurationMin,
    workoutExercises,
    setTitle,
    setDescription,
    setWorkoutType,
    setWorkoutDurationMin,
    setWorkoutExercises,
    loadTask,
    saveCoreFields,
    saving,
    metadataForSave,
    originalRef,
    itemType,
    status,
    priority,
    scheduledOn,
    scheduledTime,
    visibility,
    assignedTo,
    liveStreamEnabled,
  } = host;

  const { workoutUnitSystem } = useWorkoutUnitSystem(true, workspaceId, true);

  const { coreDirty } = useTaskDirtyState({
    originalRef,
    isCreateMode: false,
    title,
    description,
    status,
    priority,
    scheduledOn,
    scheduledTime,
    itemType,
    metadataForSave,
    visibility,
    assignedTo,
    liveStreamEnabled,
  });

  const workoutIntake = useWorkoutIntakeWizardState(`existing:${taskId}`);
  const { aiWorkoutGenerating, handleAiGenerateWorkout, handleWorkoutViewerApply } =
    useTaskWorkoutAi({
      open: true,
      taskId,
      loading,
      initialOpenWorkoutViewer: false,
      canWrite,
      workspaceId,
      isWorkoutItemType: true,
      title,
      description,
      workoutDurationMin,
      metadata,
      workoutExercises,
      setTitle,
      setDescription,
      setWorkoutType,
      setWorkoutDurationMin,
      setWorkoutExercises,
      setMetadata,
    });

  const handleGenerateWorkoutFromIntake = useCallback(
    (wizardData: WorkoutIntakeWizardData) => {
      void handleAiGenerateWorkout(wizardData);
    },
    [handleAiGenerateWorkout],
  );

  const handleTaskModalIntakePatch = useCallback(
    (args: {
      taskId: string;
      messageId: string;
      messageCreatedAtMs: number;
      patch: TaskModalIntakePatch;
    }) => {
      if (args.taskId !== taskId) return;
      if (handledIntakePatchMessageIdsRef.current.has(args.messageId)) return;
      handledIntakePatchMessageIdsRef.current.add(args.messageId);
      workoutIntake.applyTaskModalIntakePatchFromMessage({
        patch: args.patch,
        messageId: args.messageId,
        messageCreatedAtMs: args.messageCreatedAtMs,
      });
    },
    [taskId, workoutIntake.applyTaskModalIntakePatchFromMessage],
  );

  const showIntakePanel = Boolean(canWrite && outlineEditor.isOutlineConfirmed);
  const hasFactory = outlineEditor.hasFactory;
  const sessionVm = useWorkoutSessionViewModel(metadata);
  const generatedReviewSyncKey = useMemo(() => {
    const generatedAt =
      typeof metadata === 'object' &&
      metadata !== null &&
      !Array.isArray(metadata) &&
      typeof (metadata as { ai_workout_factory?: { generated_at?: unknown } }).ai_workout_factory
        ?.generated_at === 'string'
        ? (metadata as { ai_workout_factory: { generated_at: string } }).ai_workout_factory
            .generated_at
        : sessionVm.blocks.length;
    return `${generatedAt}:${sessionVm.blocks.length}`;
  }, [metadata, sessionVm.blocks.length]);

  const intakeDisabledReason = useMemo(() => {
    if (!outlineEditor.canRunIntake) {
      return 'Confirm workout structure above before completing intake and generating.';
    }
    return undefined;
  }, [outlineEditor.canRunIntake]);

  const chatRail = useWorkoutBuilderChatRail({ outlineEditor, metadata, title });

  const handleOutlineDraftApplied = useCallback(
    (ctx: OutlineDraftAppliedEffectPayload) => {
      if (ctx.taskId !== taskId) return;
      let set = handledOutlineAppliedMessageIdsRef.current.get(taskId);
      if (!set) {
        set = new Set();
        handledOutlineAppliedMessageIdsRef.current.set(taskId, set);
      }
      if (set.has(ctx.messageId)) return;
      set.add(ctx.messageId);

      const applied = outlineEditor.applyCoachPatch({
        revision: ctx.applied.revision,
        localRevision: chatRail.outlineRevision,
        blocks: ctx.applied.blocks,
        drops: ctx.applied.drops,
        onRevisionSynced: chatRail.setOutlineRevision,
      });
      if (!applied && !ctx.applied.blocks?.length) {
        void loadTask(taskId, { silent: true });
      }
    },
    [taskId, outlineEditor, chatRail.outlineRevision, chatRail.setOutlineRevision, loadTask],
  );

  const workoutTitle = title.trim() || 'Workout';

  const navigateBack = useCallback(() => {
    const returnUrl = safeNextPath(searchParams.get('return'));
    if (returnUrl) {
      router.push(returnUrl);
    } else {
      router.back();
    }
  }, [router, searchParams]);

  const openBoard = useCallback(() => {
    router.push(`/app/${workspaceId}`);
  }, [router, workspaceId]);

  const navigateToHandoff = useCallback(() => {
    const returnUrl = safeNextPath(searchParams.get('return'));
    router.push(
      buildWorkoutBuilderGeneratedHandoffUrl(workspaceId, taskId, {
        returnPath: returnUrl ?? `/app/${workspaceId}`,
      }),
    );
  }, [router, searchParams, workspaceId, taskId]);

  const handleSaveAndReturn = useCallback(async () => {
    const ok = await saveCoreFields();
    if (!ok) return;
    navigateToHandoff();
  }, [saveCoreFields, navigateToHandoff]);

  const renderPostOutlineWorkflow = () => {
    if (!showIntakePanel) return null;

    if (hasFactory) {
      return (
        <WorkoutBuilderGeneratedReview
          taskId={taskId}
          title={title}
          description={description}
          canWrite={canWrite}
          workoutUnitSystem={workoutUnitSystem}
          blocks={sessionVm.blocks}
          syncKey={generatedReviewSyncKey}
          chrome={{
            difficulty: sessionVm.workoutSet?.difficulty,
            setTitle: sessionVm.workoutSet?.title,
            setDescription: sessionVm.workoutSet?.description ?? undefined,
            sessionTitle: sessionVm.session?.title,
            sessionDescription: sessionVm.session?.description ?? undefined,
            cardTitle: workoutTitle,
          }}
          onApplyEdits={handleWorkoutViewerApply}
          onSaveAndReturn={handleSaveAndReturn}
          onReturn={navigateToHandoff}
          saving={saving}
          coreDirty={coreDirty}
        />
      );
    }

    if (aiWorkoutGenerating) {
      return <WorkoutGenerationSkeleton blocks={outlineEditor.draftBlocks} />;
    }

    return (
      <WorkoutGenerationIntakePanel
        {...pickWorkoutIntakePanelWizardProps(workoutIntake)}
        handleAiGenerateWorkout={handleGenerateWorkoutFromIntake}
        isGenerating={false}
        disabledReason={intakeDisabledReason}
      />
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 md:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1.5"
            onClick={navigateBack}
          >
            <ArrowLeft className="size-4 shrink-0" aria-hidden />
            Back
          </Button>
          <h1 className="truncate text-lg font-semibold text-foreground">{workoutTitle}</h1>
          <span className="hidden text-xs text-muted-foreground sm:inline">Workout structure</span>
        </div>
        <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={openBoard}>
          <LayoutGrid className="size-4 shrink-0" aria-hidden />
          Board
        </Button>
      </header>

      {standardRailEnabled ? (
        <div
          className="flex gap-1 border-b border-border bg-muted/40 px-2 py-2 md:hidden"
          role="tablist"
          aria-label="Builder or chat"
        >
          <button
            type="button"
            className={cn(
              'flex-1 rounded-md py-2 text-xs font-semibold transition-colors',
              mobilePane === 'builder'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-muted/80',
            )}
            aria-pressed={mobilePane === 'builder'}
            onClick={() => setMobilePane('builder')}
          >
            Structure
          </button>
          <button
            type="button"
            className={cn(
              'flex-1 rounded-md py-2 text-xs font-semibold transition-colors',
              mobilePane === 'chat'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-muted/80',
            )}
            aria-pressed={mobilePane === 'chat'}
            onClick={() => setMobilePane('chat')}
          >
            Coach
          </button>
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 md:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] md:gap-4 md:p-4">
        <div
          className={cn(
            'flex min-h-0 flex-col overflow-y-auto overscroll-contain p-4 md:rounded-lg md:border md:border-border md:p-6',
            standardRailEnabled && mobilePane === 'chat' && 'max-md:hidden',
          )}
        >
          {error ? (
            <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading workout…</p>
          ) : (
            <div className="space-y-4">
              <WorkoutOutlinePanel editor={outlineEditor} canWrite={canWrite} />
              {renderPostOutlineWorkflow()}
            </div>
          )}
        </div>

        {standardRailEnabled ? (
          <div
            className={cn(
              'flex min-h-0 min-w-0 flex-col md:min-h-0 md:rounded-lg md:border md:border-border',
              mobilePane === 'builder' ? 'max-md:hidden' : 'flex max-md:flex-1 max-md:min-h-0',
              'md:flex',
            )}
          >
            <div className="relative flex min-h-0 min-w-0 flex-1 flex-col px-4 pb-4 pt-2 md:px-4 md:pt-4">
              <StandardTaskChatRail
                key={taskId}
                workspaceId={workspaceId}
                taskId={taskId}
                bubbleId={bubbleId}
                canPostMessages={canPostMessages && canWrite}
                defaultAgentSlug={COACH_SLUG}
                enableExerciseHashMentions
                enableBlockBlueprintMentions
                workoutExerciseNames={workoutHashExerciseNames}
                buildOutgoingMessageMetadata={chatRail.buildOutgoingMessageMetadata}
                transcriptFilter={chatRail.transcriptFilter}
                onEffectTelemetry={chatRail.onEffectTelemetry}
                onOutlineDraftApplied={handleOutlineDraftApplied}
                onTaskModalIntakePatch={handleTaskModalIntakePatch}
              />
            </div>
          </div>
        ) : (
          <div className="hidden border-t border-border p-4 text-sm text-muted-foreground md:block md:rounded-lg md:border">
            Enable the standard task chat rail to use Coach on this page.
          </div>
        )}
      </div>
    </div>
  );
}
