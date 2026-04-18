'use client';

import type { Dispatch, SetStateAction } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { Json } from '@/types/database';
import type { WorkoutSetTemplate } from '@/lib/workout-factory/types/workout-contract';
import {
  postGenerateWorkoutChain,
  WORKOUT_FACTORY_CHAIN_MESSAGES,
} from '@/lib/workout-factory/api-client';
import {
  metadataFieldsFromParsed,
  parseTaskMetadata,
  type WorkoutExercise,
} from '@/lib/item-metadata';
import type { WorkoutTemplate } from '@/hooks/use-workout-templates';

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

  const handleAiGenerateWorkout = useCallback(async () => {
    if (!canWrite || !workspaceId || !isWorkoutItemType) return;
    setAiWorkoutGenerating(true);
    try {
      const duration = parseInt(workoutDurationMin, 10);
      const data = await postGenerateWorkoutChain({
        workspace_id: workspaceId,
        daily_checkin: null,
        workout_brief_authoritative: title.trim().length > 0 && description.trim().length > 0,
        persona: {
          title: title.trim() || undefined,
          description: description.trim() || undefined,
          sessionDurationMinutes: !Number.isNaN(duration) && duration > 0 ? duration : 45,
        },
      });
      setTitle((t) => (t.trim() ? t : data.suggestedTitle || t));
      setDescription((d) => (d.trim() ? d : data.suggestedDescription || d));
      setWorkoutExercises(data.taskExercises);
      setWorkoutType((wt) => (wt.trim() ? wt : 'Generated'));
      setMetadata((prev) => {
        const o = parseTaskMetadata(prev) as Record<string, unknown>;
        return {
          ...o,
          ai_workout_factory: {
            generated_at: data.chain_metadata.generated_at,
            model: data.chain_metadata.model_used,
            workout_set: data.workoutSet,
            chain_metadata: data.chain_metadata,
          },
        } as unknown as Json;
      });
      toast.success('Workout generated — review exercises and save.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Generation failed');
    } finally {
      setAiWorkoutGenerating(false);
    }
  }, [
    canWrite,
    workspaceId,
    isWorkoutItemType,
    workoutDurationMin,
    title,
    description,
    setTitle,
    setDescription,
    setWorkoutExercises,
    setWorkoutType,
    setMetadata,
  ]);

  const viewerWorkoutSet = useMemo((): WorkoutSetTemplate | null => {
    const o = parseTaskMetadata(metadata) as Record<string, unknown>;
    const ai = o.ai_workout_factory;
    if (!ai || typeof ai !== 'object') return null;
    const ws = (ai as { workout_set?: unknown }).workout_set;
    if (!ws || typeof ws !== 'object') return null;
    return ws as WorkoutSetTemplate;
  }, [metadata]);

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
    (payload: { title: string; description: string; exercises: WorkoutExercise[] }) => {
      setTitle(payload.title);
      setDescription(payload.description);
      setWorkoutExercises(payload.exercises);
      setMetadata((prev) => {
        const o = parseTaskMetadata(prev) as Record<string, unknown>;
        const next = { ...o };
        delete next.ai_workout_factory;
        return next as Json;
      });
    },
    [setTitle, setDescription, setWorkoutExercises, setMetadata],
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
    resetWorkoutAiUi,
  };
}
