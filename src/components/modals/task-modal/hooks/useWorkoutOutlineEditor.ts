'use client';

import type { Dispatch, SetStateAction } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Json } from '@/types/database';
import type { BlockBlueprintCatalogEntry } from '@/lib/agents/coach/block-blueprint-catalog';
import {
  mergeCoachOutlineMetadataPatch,
  readCoachOutlineMetadata,
  type CoachOutlineStatus,
} from '@/lib/agents/coach/coach-outline-metadata';
import {
  catalogPresetToOutlineBlock,
  createInstructionBlock,
  normalizeOutlineDraft,
  validateOutlineDraftForConfirm,
} from '@/lib/agents/coach/outline-editor-client';
import { ensureOutlineExercisePlaceholders } from '@/lib/agents/coach/outline-exercise-placeholders';
import { postGenerateWorkoutOutline } from '@/lib/ai/generate-workout-outline-client';
import { parseTaskMetadata } from '@/lib/item-metadata';
import { toast } from 'sonner';

export type OutlineUiState =
  | 'empty'
  | 'generating'
  | 'ready'
  | 'needs_structure'
  | 'confirmed'
  | 'failed'
  | 'read_only';

export type UseWorkoutOutlineEditorArgs = {
  canWrite: boolean;
  taskId: string | null;
  workspaceId: string;
  title: string;
  description: string;
  metadata: Json;
  setMetadata: Dispatch<SetStateAction<Json>>;
  patchOriginalMetadataJson: (metadataJson: string) => void;
  saveCoreFields?: (metadataOverride?: Json) => Promise<boolean>;
};

function draftFromMetadata(meta: unknown): Record<string, unknown>[] {
  const { outline } = readCoachOutlineMetadata(meta);
  if (!outline?.length) return [];
  return ensureOutlineExercisePlaceholders(outline.map((b) => ({ ...b })));
}

export function useWorkoutOutlineEditor({
  canWrite,
  taskId,
  workspaceId,
  title,
  description,
  metadata,
  setMetadata,
  patchOriginalMetadataJson,
  saveCoreFields,
}: UseWorkoutOutlineEditorArgs) {
  const parsedMeta = useMemo(() => readCoachOutlineMetadata(metadata), [metadata]);
  const [draftBlocks, setDraftBlocks] = useState<Record<string, unknown>[]>(() =>
    draftFromMetadata(metadata),
  );
  const [localGenerating, setLocalGenerating] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [expandedBlockIdx, setExpandedBlockIdx] = useState<number | null>(0);
  const autoRetryStartedRef = useRef(false);

  useEffect(() => {
    setDraftBlocks(draftFromMetadata(metadata));
  }, [metadata]);

  useEffect(() => {
    autoRetryStartedRef.current = false;
  }, [taskId]);

  const persistMetadata = useCallback(
    async (nextMeta: Record<string, unknown>) => {
      const json = nextMeta as unknown as Json;
      setMetadata(json);
      patchOriginalMetadataJson(JSON.stringify(nextMeta));
      if (saveCoreFields) {
        await saveCoreFields(json);
      }
    },
    [setMetadata, patchOriginalMetadataJson, saveCoreFields],
  );

  const outlineUiState: OutlineUiState = useMemo(() => {
    if (parsedMeta.hasFactory) return 'read_only';
    if (localGenerating || parsedMeta.status === 'generating') return 'generating';
    if (parsedMeta.confirmedAt) return 'confirmed';
    if (localError || parsedMeta.status === 'failed') return 'failed';
    if (parsedMeta.status === 'needs_structure') return 'needs_structure';
    const { blocks } = normalizeOutlineDraft(draftBlocks);
    if (blocks.length > 0) return 'ready';
    if (parsedMeta.status === 'empty' || !parsedMeta.outline?.length) return 'empty';
    return 'ready';
  }, [parsedMeta, localGenerating, localError, draftBlocks]);

  const validationPreview = useMemo(() => normalizeOutlineDraft(draftBlocks), [draftBlocks]);

  const isOutlineConfirmed = Boolean(parsedMeta.confirmedAt);
  const canRunIntake = isOutlineConfirmed && validationPreview.blocks.length > 0;

  const applyDraftToMetadata = useCallback(
    (
      blocks: Record<string, unknown>[],
      status: CoachOutlineStatus,
      extra?: { error?: string | null; drops?: typeof validationPreview.drops },
    ) => {
      const base = parseTaskMetadata(metadata) as Record<string, unknown>;
      const next = mergeCoachOutlineMetadataPatch(base, {
        outline: blocks.length > 0 ? blocks : null,
        status,
        error: extra?.error ?? null,
        drops: extra?.drops ?? [],
        clearConfirmation: true,
      });
      return next;
    },
    [metadata],
  );

  const addFromCatalog = useCallback((preset: BlockBlueprintCatalogEntry) => {
    setDraftBlocks((prev) => [...prev, catalogPresetToOutlineBlock(preset)]);
    setExpandedBlockIdx((prev) => (prev == null ? 0 : prev));
    setLocalError(null);
  }, []);

  const addInstructionBlock = useCallback((name: string, lines: string[]) => {
    setDraftBlocks((prev) => [...prev, createInstructionBlock(name, lines)]);
    setLocalError(null);
  }, []);

  const updateBlock = useCallback((index: number, patch: Record<string, unknown>) => {
    setDraftBlocks((prev) => prev.map((b, i) => (i === index ? { ...b, ...patch } : b)));
  }, []);

  const removeBlock = useCallback((index: number) => {
    setDraftBlocks((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const reorderBlocks = useCallback((from: number, to: number) => {
    setDraftBlocks((prev) => {
      if (from < 0 || from >= prev.length || to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  }, []);

  const saveDraft = useCallback(async () => {
    if (!canWrite || !taskId) return false;
    const { blocks, drops } = normalizeOutlineDraft(draftBlocks);
    const status: CoachOutlineStatus = blocks.length > 0 ? 'ready' : 'empty';
    const next = applyDraftToMetadata(blocks, status, { drops });
    try {
      await persistMetadata(next);
      setLocalError(null);
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not save outline';
      setLocalError(msg);
      toast.error(msg);
      return false;
    }
  }, [canWrite, taskId, draftBlocks, applyDraftToMetadata, persistMetadata]);

  const confirmStructure = useCallback(async () => {
    if (!canWrite || !taskId) return false;
    const validation = validateOutlineDraftForConfirm(draftBlocks);
    if (!validation.ok) {
      toast.error('Fix validation issues before confirming structure.');
      return false;
    }
    const base = parseTaskMetadata(metadata) as Record<string, unknown>;
    const next = mergeCoachOutlineMetadataPatch(base, {
      outline: validation.blocks,
      status: 'ready',
      confirmedAt: new Date().toISOString(),
      error: null,
      drops: validation.drops,
    });
    try {
      await persistMetadata(next);
      setDraftBlocks(validation.blocks);
      toast.success('Workout structure confirmed — complete intake to generate.');
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not confirm structure';
      setLocalError(msg);
      toast.error(msg);
      return false;
    }
  }, [canWrite, taskId, draftBlocks, metadata, persistMetadata]);

  const editStructure = useCallback(async () => {
    if (!canWrite) return;
    const base = parseTaskMetadata(metadata) as Record<string, unknown>;
    const next = mergeCoachOutlineMetadataPatch(base, {
      clearConfirmation: true,
      status: draftBlocks.length > 0 ? 'ready' : 'empty',
    });
    await persistMetadata(next);
  }, [canWrite, metadata, draftBlocks.length, persistMetadata]);

  const retryStructure = useCallback(async () => {
    if (!canWrite || !taskId || !workspaceId) return;
    setLocalGenerating(true);
    setLocalError(null);
    try {
      const { metadata: nextMeta } = await postGenerateWorkoutOutline({
        workspace_id: workspaceId,
        task_id: taskId,
      });
      setMetadata(nextMeta);
      patchOriginalMetadataJson(JSON.stringify(nextMeta));
      const { outline, error: outlineError } = readCoachOutlineMetadata(nextMeta);
      if (outline?.length) {
        setDraftBlocks(draftFromMetadata(nextMeta));
        toast.success('Structure generated — review and confirm.');
      } else {
        toast.error(outlineError ?? 'Structure generation failed.');
      }
    } catch (e) {
      const err = e as Error & { metadata?: Json };
      if (err.metadata != null) {
        setMetadata(err.metadata);
        patchOriginalMetadataJson(JSON.stringify(err.metadata));
        const { outline } = readCoachOutlineMetadata(err.metadata);
        if (outline?.length) setDraftBlocks(draftFromMetadata(err.metadata));
      }
      const msg = err.message || 'Structure generation failed';
      setLocalError(msg);
      toast.error(msg);
    } finally {
      setLocalGenerating(false);
    }
  }, [canWrite, taskId, workspaceId, setMetadata, patchOriginalMetadataJson]);

  useEffect(() => {
    if (!canWrite || !taskId || autoRetryStartedRef.current || parsedMeta.hasFactory) return;
    if (parsedMeta.confirmedAt || parsedMeta.outline?.length) return;
    if (parsedMeta.status !== 'needs_structure' && parsedMeta.status !== 'empty') return;
    if (!title.trim() && !description.trim()) return;
    autoRetryStartedRef.current = true;
    void retryStructure();
  }, [
    canWrite,
    taskId,
    parsedMeta.hasFactory,
    parsedMeta.confirmedAt,
    parsedMeta.outline,
    parsedMeta.status,
    title,
    description,
    retryStructure,
  ]);

  return {
    draftBlocks,
    setDraftBlocks,
    outlineUiState,
    validationDrops: validationPreview.drops,
    isOutlineConfirmed,
    canRunIntake,
    expandedBlockIdx,
    setExpandedBlockIdx,
    localError: localError ?? parsedMeta.error,
    isGenerating: localGenerating || parsedMeta.status === 'generating',
    addFromCatalog,
    addInstructionBlock,
    updateBlock,
    removeBlock,
    reorderBlocks,
    saveDraft,
    confirmStructure,
    editStructure,
    retryStructure,
    hasFactory: parsedMeta.hasFactory,
    title,
    description,
  };
}

export type WorkoutOutlineEditorState = ReturnType<typeof useWorkoutOutlineEditor>;
