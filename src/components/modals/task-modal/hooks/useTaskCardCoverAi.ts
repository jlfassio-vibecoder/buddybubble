'use client';

import type { Dispatch, SetStateAction } from 'react';
import { useCallback, useState } from 'react';
import type { Json } from '@/types/database';
import { postGenerateCardCover } from '@/lib/ai/generate-card-cover-client';
import { formatUserFacingError } from '@/lib/format-error';

export type UseTaskCardCoverAiArgs = {
  canWrite: boolean;
  taskId: string | null;
  workspaceId: string;
  cardCoverAiHint: string;
  cardCoverPresetId: string;
  setCardCoverPath: Dispatch<SetStateAction<string>>;
  setMetadata: Dispatch<SetStateAction<Json>>;
  setError: Dispatch<SetStateAction<string | null>>;
  patchOriginalMetadataJson: (metadataJson: string) => void;
};

export function useTaskCardCoverAi({
  canWrite,
  taskId,
  workspaceId,
  cardCoverAiHint,
  cardCoverPresetId,
  setCardCoverPath,
  setMetadata,
  setError,
  patchOriginalMetadataJson,
}: UseTaskCardCoverAiArgs) {
  const [aiCardCoverGenerating, setAiCardCoverGenerating] = useState(false);

  const resetCardCoverAi = useCallback(() => {
    setAiCardCoverGenerating(false);
  }, []);

  const generateCardCoverWithAi = useCallback(async () => {
    if (!canWrite || !taskId) return;
    setAiCardCoverGenerating(true);
    setError(null);
    try {
      const { card_cover_path, metadata: nextMeta } = await postGenerateCardCover({
        workspace_id: workspaceId,
        task_id: taskId,
        hint: cardCoverAiHint.trim() || undefined,
        preset_id: cardCoverPresetId.trim() || undefined,
      });
      setCardCoverPath(card_cover_path);
      setMetadata(nextMeta);
      patchOriginalMetadataJson(JSON.stringify(nextMeta));
    } catch (e) {
      const err = e as Error & { code?: string };
      setError(err.message || formatUserFacingError(e));
    } finally {
      setAiCardCoverGenerating(false);
    }
  }, [
    canWrite,
    taskId,
    workspaceId,
    cardCoverAiHint,
    cardCoverPresetId,
    setCardCoverPath,
    setMetadata,
    setError,
    patchOriginalMetadataJson,
  ]);

  return { aiCardCoverGenerating, generateCardCoverWithAi, resetCardCoverAi };
}
