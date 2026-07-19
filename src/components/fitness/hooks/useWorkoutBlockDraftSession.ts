'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { WorkoutExercise } from '@/lib/item-metadata';
import {
  cloneWorkoutSessionBlocksForEditor,
  workoutSessionBlocksContentKey,
} from '@/lib/workout-factory/clone-workout-session-blocks';
import type { WorkoutSessionBlockView } from '@/lib/workout-factory/workout-session-view-model';
import {
  applyCoachPatchToCanvas,
  mergeCoachPrescriptionIntoDraft,
} from '@/lib/agents/coach/coach-structural-patch';
import type { CoachStructuralPatchOp } from '@/lib/agents/_shared/workout-metadata/structural-patch-types';

export type WorkoutBlockDraftMode = 'view' | 'edit';

export type WorkoutBlockDraftApplyPayload = {
  title: string;
  description: string;
  exercises: WorkoutExercise[];
  blocks?: WorkoutSessionBlockView[];
};

export type UseWorkoutBlockDraftSessionArgs = {
  syncKey: string | number;
  source: {
    title: string;
    description: string;
    exercises: WorkoutExercise[];
    blocks: WorkoutSessionBlockView[];
  };
  /** Builder true; viewer false. Default false. */
  exitEditOnApply?: boolean;
};

type DraftBaseline = {
  title: string;
  description: string;
  exercises: WorkoutExercise[];
  blocks: WorkoutSessionBlockView[];
};

function cloneExercises(exercises: WorkoutExercise[]): WorkoutExercise[] {
  return exercises.map((e) => ({ ...e }));
}

function workoutExercisesContentKey(exercises: WorkoutExercise[]): string {
  return JSON.stringify(exercises);
}

function snapshotBaseline(args: {
  title: string;
  description: string;
  exercises: WorkoutExercise[];
  blocks: WorkoutSessionBlockView[];
}): DraftBaseline {
  return {
    title: args.title,
    description: args.description,
    exercises: cloneExercises(args.exercises),
    blocks: cloneWorkoutSessionBlocksForEditor(args.blocks),
  };
}

function computeIsDirty(
  draftTitle: string,
  draftDescription: string,
  draftExercises: WorkoutExercise[],
  draftBlocks: WorkoutSessionBlockView[],
  baseline: DraftBaseline,
): boolean {
  if (draftTitle.trim() !== baseline.title.trim()) return true;
  if (draftDescription.trim() !== baseline.description.trim()) return true;
  if (
    workoutExercisesContentKey(draftExercises) !== workoutExercisesContentKey(baseline.exercises)
  ) {
    return true;
  }
  if (
    workoutSessionBlocksContentKey(draftBlocks) !== workoutSessionBlocksContentKey(baseline.blocks)
  ) {
    return true;
  }
  return false;
}

export function useWorkoutBlockDraftSession({
  syncKey,
  source,
  exitEditOnApply = false,
}: UseWorkoutBlockDraftSessionArgs) {
  const [mode, setMode] = useState<WorkoutBlockDraftMode>('view');
  const [draftTitle, setDraftTitle] = useState(source.title);
  const [draftDescription, setDraftDescription] = useState(source.description);
  const [draftExercises, setDraftExercises] = useState<WorkoutExercise[]>(() =>
    cloneExercises(source.exercises),
  );
  const [draftBlocks, setDraftBlocks] = useState<WorkoutSessionBlockView[]>(() =>
    cloneWorkoutSessionBlocksForEditor(source.blocks),
  );
  /** Dirty is vs this baseline (last enter/reset/Coach-pristine apply), not live source. */
  const [baseline, setBaseline] = useState<DraftBaseline>(() =>
    snapshotBaseline({
      title: source.title,
      description: source.description,
      exercises: source.exercises,
      blocks: source.blocks,
    }),
  );

  const modeRef = useRef(mode);
  modeRef.current = mode;

  const draftBlocksRef = useRef(draftBlocks);
  draftBlocksRef.current = draftBlocks;

  const draftTitleRef = useRef(draftTitle);
  draftTitleRef.current = draftTitle;
  const draftDescriptionRef = useRef(draftDescription);
  draftDescriptionRef.current = draftDescription;
  const draftExercisesRef = useRef(draftExercises);
  draftExercisesRef.current = draftExercises;

  const baselineRef = useRef(baseline);
  baselineRef.current = baseline;

  const sourceRef = useRef(source);
  sourceRef.current = source;

  /** Dedupe soft-sync dirty toasts while the same source snapshot stays pending. */
  const pendingCoachUpdateToastKeyRef = useRef<string | null>(null);

  const applySourceToDrafts = useCallback(() => {
    const s = sourceRef.current;
    setDraftTitle(s.title);
    setDraftDescription(s.description);
    setDraftExercises(cloneExercises(s.exercises));
    const blocks = cloneWorkoutSessionBlocksForEditor(s.blocks);
    draftBlocksRef.current = blocks;
    setDraftBlocks(blocks);
    const nextBaseline = snapshotBaseline({
      title: s.title,
      description: s.description,
      exercises: s.exercises,
      blocks: s.blocks,
    });
    baselineRef.current = nextBaseline;
    setBaseline(nextBaseline);
  }, []);

  const adoptDraftAsBaseline = useCallback(
    (
      title: string,
      description: string,
      exercises: WorkoutExercise[],
      blocks: WorkoutSessionBlockView[],
    ) => {
      const nextBaseline = snapshotBaseline({ title, description, exercises, blocks });
      baselineRef.current = nextBaseline;
      setBaseline(nextBaseline);
    },
    [],
  );

  const hardReset = useCallback(() => {
    applySourceToDrafts();
    modeRef.current = 'view';
    setMode('view');
    pendingCoachUpdateToastKeyRef.current = null;
  }, [applySourceToDrafts]);

  // Hard reset: syncKey bump only — not Coach / metadata churn.
  useEffect(() => {
    hardReset();
  }, [syncKey, hardReset]);

  const blocksContentKey = useMemo(
    () => workoutSessionBlocksContentKey(source.blocks),
    [source.blocks],
  );
  const exercisesContentKey = useMemo(
    () => workoutExercisesContentKey(source.exercises),
    [source.exercises],
  );

  const isDirty = useMemo(
    () => computeIsDirty(draftTitle, draftDescription, draftExercises, draftBlocks, baseline),
    [draftTitle, draftDescription, draftExercises, draftBlocks, baseline],
  );

  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;

  // Soft sync: full refresh while viewing.
  // In edit + pristine: write-through Coach prescription fields from source.
  // In edit + dirty: keep local keystrokes; notify once per pending source snapshot.
  useEffect(() => {
    if (mode === 'edit') {
      const dirty = computeIsDirty(
        draftTitleRef.current,
        draftDescriptionRef.current,
        draftExercisesRef.current,
        draftBlocksRef.current,
        baselineRef.current,
      );
      if (dirty) {
        const toastKey = `${source.title}\0${source.description}\0${exercisesContentKey}\0${blocksContentKey}`;
        if (pendingCoachUpdateToastKeyRef.current !== toastKey) {
          pendingCoachUpdateToastKeyRef.current = toastKey;
          toast.message('Coach has an update', {
            id: 'coach-dirty-draft-update',
            description: 'Apply or discard your canvas edits to load Coach’s changes.',
          });
        }
        return;
      }
      pendingCoachUpdateToastKeyRef.current = null;
      const prev = draftBlocksRef.current;
      const next = mergeCoachPrescriptionIntoDraft(prev, sourceRef.current.blocks);
      if (next !== prev) {
        draftBlocksRef.current = next;
        setDraftBlocks(next);
        adoptDraftAsBaseline(
          draftTitleRef.current,
          draftDescriptionRef.current,
          draftExercisesRef.current,
          next,
        );
      }
      return;
    }
    pendingCoachUpdateToastKeyRef.current = null;
    applySourceToDrafts();
  }, [
    source.title,
    source.description,
    exercisesContentKey,
    blocksContentKey,
    mode,
    applySourceToDrafts,
    adoptDraftAsBaseline,
  ]);

  const enterEdit = useCallback(() => {
    applySourceToDrafts();
    // Sync refs so enterEdit → applyStructuralPatch works in the same tick.
    modeRef.current = 'edit';
    setMode('edit');
    pendingCoachUpdateToastKeyRef.current = null;
  }, [applySourceToDrafts]);

  const cancelEdit = useCallback(() => {
    applySourceToDrafts();
    modeRef.current = 'view';
    setMode('view');
    pendingCoachUpdateToastKeyRef.current = null;
  }, [applySourceToDrafts]);

  const applyEdits = useCallback(
    (onCommit: (payload: WorkoutBlockDraftApplyPayload) => void) => {
      const payload: WorkoutBlockDraftApplyPayload = {
        title: draftTitle.trim(),
        description: draftDescription.trim(),
        exercises: draftExercises,
        ...(draftBlocks.length > 0 ? { blocks: draftBlocks } : {}),
      };
      onCommit(payload);
      if (exitEditOnApply) {
        setMode('view');
      }
      pendingCoachUpdateToastKeyRef.current = null;
    },
    [draftTitle, draftDescription, draftExercises, draftBlocks, exitEditOnApply],
  );

  const applyExternalBlocks = useCallback(
    (blocks: WorkoutSessionBlockView[]): boolean => {
      if (modeRef.current !== 'edit') return false;
      if (isDirtyRef.current) return false;
      const next = cloneWorkoutSessionBlocksForEditor(blocks);
      draftBlocksRef.current = next;
      setDraftBlocks(next);
      adoptDraftAsBaseline(
        draftTitleRef.current,
        draftDescriptionRef.current,
        draftExercisesRef.current,
        next,
      );
      return true;
    },
    [adoptDraftAsBaseline],
  );

  const applyStructuralPatch = useCallback(
    (patches: CoachStructuralPatchOp[]): boolean => {
      if (modeRef.current !== 'edit') return false;
      if (isDirtyRef.current) return false;
      if (!Array.isArray(patches) || patches.length === 0) return false;
      const prev = draftBlocksRef.current;
      const next = applyCoachPatchToCanvas(prev, patches);
      if (next === prev) return false;
      draftBlocksRef.current = next;
      setDraftBlocks(next);
      adoptDraftAsBaseline(
        draftTitleRef.current,
        draftDescriptionRef.current,
        draftExercisesRef.current,
        next,
      );
      return true;
    },
    [adoptDraftAsBaseline],
  );

  return {
    mode,
    draftTitle,
    setDraftTitle,
    draftDescription,
    setDraftDescription,
    draftExercises,
    setDraftExercises,
    draftBlocks,
    setDraftBlocks,
    isDirty,
    enterEdit,
    cancelEdit,
    applyEdits,
    hardReset,
    applyExternalBlocks,
    applyStructuralPatch,
  };
}
