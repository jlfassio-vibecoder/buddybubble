'use client';

import { useCallback, useEffect } from 'react';
import type { MutableRefObject } from 'react';
import { createClient } from '@utils/supabase/client';
import type { TaskModalOriginalSnapshot } from '@/components/modals/task-modal/task-modal-save-utils';
import { formatUserFacingError } from '@/lib/format-error';
import { stampUserFields } from '@/lib/task-field-provenance';
import type { Json } from '@/types/database';

const AUTOSAVE_MS = 750;

export function useTaskCoreTextAutosave({
  enabled,
  canWrite,
  taskId,
  title,
  description,
  originalRef,
  patchOriginalCoreText,
  currentMetadata,
  onMetadataDemotedLocally,
}: {
  enabled: boolean;
  canWrite: boolean;
  taskId: string | null;
  title: string;
  description: string;
  originalRef: MutableRefObject<TaskModalOriginalSnapshot | null>;
  patchOriginalCoreText: (next: { title: string; description: string }) => void;
  currentMetadata?: unknown;
  /**
   * Client-only demotion of title/description provenance after text autosave.
   * Must not write `tasks.metadata` here — full JSONB replace races Coach merges.
   * Durable demotion persists on explicit Save via `metadataForSave`.
   */
  onMetadataDemotedLocally?: (nextMetadata: Json) => void;
}): { flushNow: () => Promise<void> } {
  const flushNow = useCallback(async () => {
    if (!enabled || !canWrite || !taskId) return;
    const orig = originalRef.current;
    if (!orig) return;
    const titleTrim = title.trim();
    const descTrim = description.trim();
    const titleDirty = titleTrim !== orig.title;
    const descDirty = descTrim !== (orig.description ?? '').trim();
    if (!titleDirty && !descDirty) return;

    const supabase = createClient();
    // Title/description columns only — never replace `metadata` from client state.
    const { error } = await supabase
      .from('tasks')
      .update({
        title: titleTrim,
        description: descTrim || null,
      })
      .eq('id', taskId);

    if (error) {
      console.warn('[useTaskCoreTextAutosave]', formatUserFacingError(error));
      return;
    }
    patchOriginalCoreText({ title: titleTrim, description: descTrim });

    const demoteKeys: string[] = [];
    if (titleDirty) demoteKeys.push('title');
    if (descDirty) demoteKeys.push('description');
    if (demoteKeys.length > 0 && currentMetadata !== undefined && onMetadataDemotedLocally) {
      onMetadataDemotedLocally(stampUserFields(currentMetadata, demoteKeys) as Json);
    }
  }, [
    enabled,
    canWrite,
    taskId,
    title,
    description,
    originalRef,
    patchOriginalCoreText,
    currentMetadata,
    onMetadataDemotedLocally,
  ]);

  useEffect(() => {
    if (!enabled || !canWrite || !taskId) return;
    const orig = originalRef.current;
    if (!orig) return;
    const titleDirty = title.trim() !== orig.title;
    const descDirty = description.trim() !== (orig.description ?? '').trim();
    if (!titleDirty && !descDirty) return;

    const tid = setTimeout(() => void flushNow(), AUTOSAVE_MS);
    return () => clearTimeout(tid);
  }, [enabled, canWrite, taskId, title, description, originalRef, flushNow]);

  return { flushNow };
}
