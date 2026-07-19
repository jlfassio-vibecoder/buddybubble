'use client';

import type { Dispatch, SetStateAction } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { Json } from '@/types/database';
import type { WorkoutSetTemplate } from '@/lib/workout-factory/types/workout-contract';
import {
  postGenerateWorkoutChain,
  WORKOUT_FACTORY_CHAIN_MESSAGES,
  WorkoutFactoryError,
  workoutFactoryErrorMessage,
} from '@/lib/workout-factory/api-client';
import {
  metadataFieldsFromParsed,
  parseTaskMetadata,
  type WorkoutExercise,
} from '@/lib/item-metadata';
import type { WorkoutViewerApplyPayload } from '@/components/fitness/workout-viewer-dialog';
import {
  applyCuePatchesToMetadata,
  type WorkoutCuePatch,
} from '@/lib/workout-factory/apply-cue-patches-to-metadata';
import { parseWorkoutExercisesFromMetadata } from '@/lib/parse-workout-exercises-from-metadata';
import { backfillFactoryCuesFromFlat } from '@/lib/workout-factory/backfill-factory-cues-from-flat';
import {
  applyBlockEditsToMetadata,
  applyFlatWorkoutEditsToMetadata,
  deriveFlatExercisesFromMetadata,
  flatExercisesMatchDerived,
} from '@/lib/workout-factory/sync-workout-metadata';
import { buildWorkoutSessionViewModel } from '@/lib/workout-factory/workout-session-view-model';
import { readCoachOutlineMetadata } from '@/lib/agents/coach/coach-outline-metadata';
import { generationIntakeContextToDailyCheckin } from '@/lib/workout-factory/generation-intake-context';
import { stripMacroPlanningContextSuffix } from '@/lib/workout-factory/workout-viewer-narrative';
import { preflightOutlineBlocks } from '@/lib/workout-factory/outline-block-preflight';
import type { WorkoutTemplate } from '@/hooks/use-workout-templates';

import type { WorkoutIntakeDurationChoice } from '@/lib/agents/coach/task-modal-intake-patch';
import type {
  WorkoutGenerationAnchorLift,
  WorkoutGenerationIntakeContext,
  WorkoutGenerationPhaseIntent,
  WorkoutGenerationProgressionTrend,
} from '@/lib/workout-factory/generation-intake-context';

/** Generation intake wizard payload forwarded to `postGenerateWorkoutChain` as `daily_checkin`. */
export type WorkoutIntakeWizardData = WorkoutGenerationIntakeContext;

export type {
  WorkoutGenerationAnchorLift,
  WorkoutGenerationIntakeContext,
  WorkoutGenerationPhaseIntent,
  WorkoutGenerationProgressionTrend,
  WorkoutIntakeDurationChoice,
};

export type UseTaskWorkoutAiArgs = {
  open: boolean;
  taskId: string | null;
  loading: boolean;
  initialOpenWorkoutViewer: boolean;
  canWrite: boolean;
  workspaceId: string;
  isWorkoutItemType: boolean;
  title: string;
  description: string;
  workoutDurationMin: string;
  metadata: Json;
  workoutExercises: WorkoutExercise[];
  setTitle: Dispatch<SetStateAction<string>>;
  setDescription: Dispatch<SetStateAction<string>>;
  setWorkoutType: Dispatch<SetStateAction<string>>;
  setWorkoutDurationMin: Dispatch<SetStateAction<string>>;
  setWorkoutExercises: Dispatch<SetStateAction<WorkoutExercise[]>>;
  setMetadata: Dispatch<SetStateAction<Json>>;
};

export function useTaskWorkoutAi({
  open,
  taskId,
  loading,
  initialOpenWorkoutViewer,
  canWrite,
  workspaceId,
  isWorkoutItemType,
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
}: UseTaskWorkoutAiArgs) {
  const [workoutViewerOpen, setWorkoutViewerOpen] = useState(false);
  const workoutViewerAutoOpenedRef = useRef(false);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [aiWorkoutGenerating, setAiWorkoutGenerating] = useState(false);
  const [aiWorkoutProgressIdx, setAiWorkoutProgressIdx] = useState(0);
  const lastWizardDataRef = useRef<WorkoutIntakeWizardData | undefined>(undefined);
  const handleAiGenerateWorkoutRef = useRef<
    (wizardData?: WorkoutIntakeWizardData, options?: { metadata?: Json }) => Promise<void>
  >(() => Promise.resolve());

  const resetWorkoutAiUi = useCallback(() => {
    setTemplatePickerOpen(false);
    setWorkoutViewerOpen(false);
    workoutViewerAutoOpenedRef.current = false;
    setAiWorkoutGenerating(false);
    setAiWorkoutProgressIdx(0);
  }, []);

  const applyWorkoutTemplate = useCallback(
    (tpl: WorkoutTemplate) => {
      const fields = metadataFieldsFromParsed(tpl.metadata);
      if (!title.trim()) setTitle(tpl.title);
      if (fields.workoutType) setWorkoutType(fields.workoutType);
      if (fields.workoutDurationMin) setWorkoutDurationMin(fields.workoutDurationMin);
      if (fields.workoutExercises.length) setWorkoutExercises(fields.workoutExercises);
      setTemplatePickerOpen(false);
    },
    [title, setTitle, setWorkoutType, setWorkoutDurationMin, setWorkoutExercises],
  );

  useEffect(() => {
    if (!aiWorkoutGenerating) {
      setAiWorkoutProgressIdx(0);
      return;
    }
    setAiWorkoutProgressIdx(0);
    const id = window.setInterval(() => {
      setAiWorkoutProgressIdx((i) => Math.min(i + 1, WORKOUT_FACTORY_CHAIN_MESSAGES.length - 1));
    }, 15000);
    return () => window.clearInterval(id);
  }, [aiWorkoutGenerating]);

  const handleAiGenerateWorkout = useCallback(
    async (wizardData?: WorkoutIntakeWizardData, options?: { metadata?: Json }) => {
      if (!canWrite || !workspaceId || !isWorkoutItemType) return;

      const metadataForGeneration = options?.metadata ?? metadata;
      const outlineMeta = readCoachOutlineMetadata(metadataForGeneration);
      if (!outlineMeta.confirmedAt) {
        toast.error('Confirm workout structure before generating.');
        return;
      }
      const rawOutline = outlineMeta.outline ?? [];
      const preflight = preflightOutlineBlocks(rawOutline);
      if (preflight.blocks.length === 0) {
        toast.error('Workout structure is invalid or empty. Edit and confirm structure first.');
        return;
      }

      lastWizardDataRef.current = wizardData;

      setAiWorkoutGenerating(true);
      try {
        const duration = parseInt(workoutDurationMin, 10);
        const dailyCheckInPayload = wizardData
          ? generationIntakeContextToDailyCheckin(wizardData)
          : null;
        const coach_workout_outline = preflight.blocks;
        const data = await postGenerateWorkoutChain({
          workspace_id: workspaceId,
          task_id: taskId ?? undefined,
          daily_checkin: dailyCheckInPayload,
          workout_brief_authoritative: title.trim().length > 0 && description.trim().length > 0,
          coach_workout_outline,
          persona: {
            title: title.trim() || undefined,
            description: description.trim() || undefined,
            sessionDurationMinutes: !Number.isNaN(duration) && duration > 0 ? duration : 45,
          },
        });
        setTitle((t) => (t.trim() ? t : data.suggestedTitle || t));
        setDescription((d) => {
          if (d.trim()) return d;
          const suggested = data.suggestedDescription?.trim();
          return suggested ? stripMacroPlanningContextSuffix(suggested) : d;
        });
        setWorkoutExercises(data.taskExercises);
        setWorkoutType((wt) => (wt.trim() ? wt : 'Generated'));
        setMetadata((prev) => {
          const o = parseTaskMetadata(prev) as Record<string, unknown>;
          const outlineMeta =
            data.chain_metadata.pipeline === 'parametric_outline_fill' ? data.chain_metadata : null;
          return {
            ...o,
            ai_workout_factory: {
              generated_at: data.chain_metadata.generated_at,
              model: data.chain_metadata.model_used,
              workout_set: data.workoutSet,
              chain_metadata: data.chain_metadata,
              ...(outlineMeta?.structure_rationale
                ? { structure_rationale: outlineMeta.structure_rationale }
                : {}),
              ...(outlineMeta?.session_adaptations
                ? { session_adaptations: outlineMeta.session_adaptations }
                : {}),
            },
          } as unknown as Json;
        });
        toast.success(
          'fill_fallback' in data.chain_metadata && data.chain_metadata.fill_fallback
            ? 'Workout generated with default prescriptions — review exercises before saving.'
            : 'Workout generated — review exercises and save.',
        );
      } catch (e) {
        if (e instanceof WorkoutFactoryError) {
          const { message, showRegenerate } = workoutFactoryErrorMessage(e);
          toast.error(message, {
            action: showRegenerate
              ? {
                  label: 'Regenerate',
                  onClick: () => void handleAiGenerateWorkoutRef.current(lastWizardDataRef.current),
                }
              : undefined,
          });
        } else {
          toast.error(e instanceof Error ? e.message : 'Generation failed');
        }
      } finally {
        setAiWorkoutGenerating(false);
      }
    },
    [
      canWrite,
      workspaceId,
      isWorkoutItemType,
      workoutDurationMin,
      title,
      description,
      metadata,
      taskId,
      setTitle,
      setDescription,
      setWorkoutExercises,
      setWorkoutType,
      setMetadata,
    ],
  );

  useEffect(() => {
    handleAiGenerateWorkoutRef.current = handleAiGenerateWorkout;
  }, [handleAiGenerateWorkout]);

  const viewerWorkoutSet = useMemo(
    (): WorkoutSetTemplate | null => buildWorkoutSessionViewModel(metadata).workoutSet,
    [metadata],
  );

  const hasWorkoutViewerContent =
    isWorkoutItemType && (workoutExercises.length > 0 || viewerWorkoutSet != null);

  useEffect(() => {
    if (!open) {
      setWorkoutViewerOpen(false);
      workoutViewerAutoOpenedRef.current = false;
    }
  }, [open]);

  useEffect(() => {
    if (!open || !taskId || !initialOpenWorkoutViewer || loading) return;
    if (!hasWorkoutViewerContent || workoutViewerAutoOpenedRef.current) return;
    workoutViewerAutoOpenedRef.current = true;
    setWorkoutViewerOpen(true);
  }, [open, taskId, loading, initialOpenWorkoutViewer, hasWorkoutViewerContent]);

  const handleWorkoutViewerApply = useCallback(
    (payload: WorkoutViewerApplyPayload): Json => {
      setTitle(payload.title);
      setDescription(payload.description);

      if (payload.blocks != null && payload.blocks.length > 0) {
        const seeded = backfillFactoryCuesFromFlat(metadata);
        const nextMeta = applyBlockEditsToMetadata(seeded, payload.blocks) as Json;
        setMetadata(nextMeta);
        setWorkoutExercises(parseWorkoutExercisesFromMetadata(nextMeta));
        return nextMeta;
      }

      setWorkoutExercises(payload.exercises);
      const derived = deriveFlatExercisesFromMetadata(metadata);
      if (flatExercisesMatchDerived(payload.exercises, derived)) {
        return metadata;
      }
      const nextMeta = applyFlatWorkoutEditsToMetadata(metadata, payload.exercises) as Json;
      setMetadata(nextMeta);
      return nextMeta;
    },
    [metadata, setTitle, setDescription, setWorkoutExercises, setMetadata],
  );

  // Keep a sync mirror so rapid cue patches do not both read the same stale `metadata`.
  // Update the ref in the handler and via effect (not during render) so a parent re-render
  // with a stale prop cannot clobber an in-flight patch chain.
  const cuePatchMetadataRef = useRef(metadata);
  useEffect(() => {
    cuePatchMetadataRef.current = metadata;
  }, [metadata]);

  const handleWorkoutViewerCuePatches = useCallback(
    (patches: Record<string, WorkoutCuePatch>): Json => {
      const nextMeta = applyCuePatchesToMetadata(cuePatchMetadataRef.current, patches) as Json;
      cuePatchMetadataRef.current = nextMeta;
      setMetadata(nextMeta);
      setWorkoutExercises(parseWorkoutExercisesFromMetadata(nextMeta));
      return nextMeta;
    },
    [setMetadata, setWorkoutExercises],
  );

  return {
    templatePickerOpen,
    setTemplatePickerOpen,
    aiWorkoutGenerating,
    aiWorkoutProgressIdx,
    workoutViewerOpen,
    setWorkoutViewerOpen,
    applyWorkoutTemplate,
    handleAiGenerateWorkout,
    viewerWorkoutSet,
    hasWorkoutViewerContent,
    handleWorkoutViewerApply,
    handleWorkoutViewerCuePatches,
    resetWorkoutAiUi,
  };
}
