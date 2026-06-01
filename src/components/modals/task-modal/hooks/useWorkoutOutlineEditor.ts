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
import { outlineDraftAppliedStaleForClient } from '@/lib/agents/coach/outline-draft-patch';
import type { BlockShapeDrop } from '@/lib/agents/coach/parse';
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
  /** When false, skip sync effects and block mutating actions (non-workout TaskModal cards). */
  enabled?: boolean;
};

function draftFromMetadata(meta: unknown): Record<string, unknown>[] {
  const { outline } = readCoachOutlineMetadata(meta);
  if (!outline?.length) return [];
  return ensureOutlineExercisePlaceholders(outline.map((b) => ({ ...b })));
}

function outlineBlocksFingerprint(blocks: Record<string, unknown>[]): string {
  const { blocks: normalized } = normalizeOutlineDraft(blocks);
  return JSON.stringify(normalized);
}

function outlineMetadataFingerprint(meta: unknown): string {
  return outlineBlocksFingerprint(draftFromMetadata(meta));
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
  enabled = true,
}: UseWorkoutOutlineEditorArgs) {
  const parsedMeta = useMemo(() => readCoachOutlineMetadata(metadata), [metadata]);
  const [draftBlocks, setDraftBlocks] = useState<Record<string, unknown>[]>(() =>
    draftFromMetadata(metadata),
  );
  const [localGenerating, setLocalGenerating] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [expandedBlockIdx, setExpandedBlockIdx] = useState<number | null>(0);
  const draftBlocksRef = useRef(draftBlocks);
  draftBlocksRef.current = draftBlocks;
  const isDirtyRef = useRef(false);
  const lastSyncedOutlineFpRef = useRef(outlineMetadataFingerprint(metadata));
  const prevTaskIdRef = useRef(taskId);

  const syncDraftFromMetadata = useCallback((meta: unknown, resetDirty: boolean) => {
    const blocks = draftFromMetadata(meta);
    lastSyncedOutlineFpRef.current = outlineMetadataFingerprint(meta);
    if (resetDirty) isDirtyRef.current = false;
    setDraftBlocks(blocks);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    if (prevTaskIdRef.current !== taskId) {
      prevTaskIdRef.current = taskId;
      syncDraftFromMetadata(metadata, true);
      return;
    }

    const incomingFp = outlineMetadataFingerprint(metadata);
    if (incomingFp === lastSyncedOutlineFpRef.current) return;
    if (isDirtyRef.current) return;

    syncDraftFromMetadata(metadata, false);
  }, [enabled, metadata, taskId, syncDraftFromMetadata]);

  const persistMetadata = useCallback(
    async (nextMeta: Record<string, unknown>) => {
      const json = nextMeta as unknown as Json;
      lastSyncedOutlineFpRef.current = outlineMetadataFingerprint(nextMeta);
      isDirtyRef.current = false;
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
    if (draftBlocks.length > 0) return 'needs_structure';
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

  const addFromCatalog = useCallback(
    async (preset: BlockBlueprintCatalogEntry): Promise<boolean> => {
      if (!enabled || !canWrite || !taskId) return false;
      const block = catalogPresetToOutlineBlock(preset);
      const nextBlocks = [...draftBlocksRef.current, block];
      setDraftBlocks(nextBlocks);
      setExpandedBlockIdx(nextBlocks.length - 1);
      setLocalError(null);
      const { blocks, drops } = normalizeOutlineDraft(nextBlocks);
      const status: CoachOutlineStatus = blocks.length > 0 ? 'ready' : 'empty';
      const next = applyDraftToMetadata(blocks, status, { drops });
      try {
        await persistMetadata(next);
        return true;
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Could not save outline';
        setLocalError(msg);
        toast.error(msg);
        return false;
      }
    },
    [enabled, canWrite, taskId, applyDraftToMetadata, persistMetadata],
  );

  const addInstructionBlock = useCallback(
    async (name: string, lines: string[]): Promise<boolean> => {
      if (!enabled || !canWrite || !taskId) return false;
      const block = createInstructionBlock(name, lines);
      const nextBlocks = [...draftBlocksRef.current, block];
      setDraftBlocks(nextBlocks);
      setLocalError(null);
      const { blocks, drops } = normalizeOutlineDraft(nextBlocks);
      const status: CoachOutlineStatus = blocks.length > 0 ? 'ready' : 'empty';
      const next = applyDraftToMetadata(blocks, status, { drops });
      try {
        await persistMetadata(next);
        return true;
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Could not save outline';
        setLocalError(msg);
        toast.error(msg);
        return false;
      }
    },
    [enabled, canWrite, taskId, applyDraftToMetadata, persistMetadata],
  );

  const updateBlock = useCallback(
    (index: number, patch: Record<string, unknown>) => {
      if (!enabled) return;
      isDirtyRef.current = true;
      setDraftBlocks((prev) => prev.map((b, i) => (i === index ? { ...b, ...patch } : b)));
    },
    [enabled],
  );

  const removeBlock = useCallback(
    (index: number) => {
      if (!enabled) return;
      isDirtyRef.current = true;
      setDraftBlocks((prev) => prev.filter((_, i) => i !== index));
    },
    [enabled],
  );

  const reorderBlocks = useCallback(
    (from: number, to: number) => {
      if (!enabled) return;
      isDirtyRef.current = true;
      setDraftBlocks((prev) => {
        if (from < 0 || from >= prev.length || to < 0 || to >= prev.length) return prev;
        const next = [...prev];
        const [item] = next.splice(from, 1);
        next.splice(to, 0, item);
        return next;
      });
    },
    [enabled],
  );

  const saveDraft = useCallback(async () => {
    if (!enabled || !canWrite || !taskId) return false;
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
  }, [enabled, canWrite, taskId, draftBlocks, applyDraftToMetadata, persistMetadata]);

  const confirmStructure = useCallback(async () => {
    if (!enabled || !canWrite || !taskId) return false;
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
  }, [enabled, canWrite, taskId, draftBlocks, metadata, persistMetadata]);

  const applyCoachPatch = useCallback(
    (args: {
      revision: number;
      localRevision: number;
      blocks?: Record<string, unknown>[];
      drops?: BlockShapeDrop[];
      onRevisionSynced?: (nextRevision: number) => void;
    }): boolean => {
      if (!enabled) return false;
      if (outlineDraftAppliedStaleForClient(args.localRevision, args.revision)) {
        toast.message('Outline update skipped — your editor has newer changes.');
        return false;
      }
      const sourceBlocks = args.blocks?.length ? args.blocks : draftBlocks;
      const { blocks: normalized, drops: normDrops } = normalizeOutlineDraft(sourceBlocks);
      lastSyncedOutlineFpRef.current = outlineBlocksFingerprint(normalized);
      isDirtyRef.current = false;
      setDraftBlocks(normalized);
      const status: CoachOutlineStatus = normalized.length > 0 ? 'ready' : 'empty';
      const next = applyDraftToMetadata(normalized, status, {
        drops: args.drops?.length ? args.drops : normDrops,
      });
      const json = next as unknown as Json;
      setMetadata(json);
      patchOriginalMetadataJson(JSON.stringify(next));
      args.onRevisionSynced?.(args.revision + 1);
      toast.success('Coach updated workout structure.');
      return true;
    },
    [enabled, draftBlocks, applyDraftToMetadata, setMetadata, patchOriginalMetadataJson],
  );

  const editStructure = useCallback(async () => {
    if (!enabled || !canWrite) return;
    const base = parseTaskMetadata(metadata) as Record<string, unknown>;
    const next = mergeCoachOutlineMetadataPatch(base, {
      clearConfirmation: true,
      status: draftBlocks.length > 0 ? 'ready' : 'empty',
    });
    await persistMetadata(next);
  }, [enabled, canWrite, metadata, draftBlocks.length, persistMetadata]);

  const retryStructure = useCallback(async () => {
    if (!enabled) return;
    if (!canWrite || !taskId || !workspaceId) return;
    if (parsedMeta.hasFactory) {
      toast.message('A generated workout already exists for this session.');
      return;
    }
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
        lastSyncedOutlineFpRef.current = outlineMetadataFingerprint(nextMeta);
        isDirtyRef.current = false;
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
        if (outline?.length) {
          lastSyncedOutlineFpRef.current = outlineMetadataFingerprint(err.metadata);
          isDirtyRef.current = false;
          setDraftBlocks(draftFromMetadata(err.metadata));
        }
      }
      const msg = err.message || 'Structure generation failed';
      setLocalError(msg);
      toast.error(msg);
    } finally {
      setLocalGenerating(false);
    }
  }, [
    enabled,
    canWrite,
    taskId,
    workspaceId,
    parsedMeta.hasFactory,
    setMetadata,
    patchOriginalMetadataJson,
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
    applyCoachPatch,
    hasFactory: parsedMeta.hasFactory,
    title,
    description,
  };
}

export type WorkoutOutlineEditorState = ReturnType<typeof useWorkoutOutlineEditor>;
