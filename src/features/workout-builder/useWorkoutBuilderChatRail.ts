'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Json } from '@/types/database';
import { buildTaskModalOutlineDraftPayload } from '@/lib/agents/coach/build-outline-draft-context';
import { readCoachOutlineMetadata } from '@/lib/agents/coach/coach-outline-metadata';
import { normalizeOutlineDraft } from '@/lib/agents/coach/outline-editor-client';
import { buildTaskModalOutgoingWorkoutContext } from '@/lib/agents/coach/task-modal-outgoing-workout-context';
import type { WorkoutOutlineEditorState } from '@/components/modals/task-modal/hooks/useWorkoutOutlineEditor';
import { BUDDY_ONBOARDING_SYSTEM_EVENT } from '@/lib/agents/buddy-sentinel';
import type { AgentEffectTelemetryEvent } from '@/components/chat/agent-effects/types';

export type UseWorkoutBuilderChatRailArgs = {
  outlineEditor: WorkoutOutlineEditorState;
  metadata: Json;
  title: string;
};

export function useWorkoutBuilderChatRail({
  outlineEditor,
  metadata,
  title,
}: UseWorkoutBuilderChatRailArgs) {
  const [outlineRevision, setOutlineRevision] = useState(1);
  const fingerprintRef = useRef<string | null>(null);
  const skipInitialBumpRef = useRef(true);

  const shouldAttachOutlineDraft = !outlineEditor.isOutlineConfirmed && !outlineEditor.hasFactory;

  useEffect(() => {
    const fp = JSON.stringify(outlineEditor.draftBlocks);
    if (skipInitialBumpRef.current) {
      skipInitialBumpRef.current = false;
      fingerprintRef.current = fp;
      return;
    }
    if (fingerprintRef.current === fp) return;
    fingerprintRef.current = fp;
    setOutlineRevision((r) => r + 1);
  }, [outlineEditor.draftBlocks]);

  const buildOutgoingMessageMetadata = useCallback(
    (_args: { content: string; files: File[] }) => {
      const payload: Record<string, Json> = {};

      const workoutContext = buildTaskModalOutgoingWorkoutContext(metadata, title);
      if (workoutContext) {
        payload.workoutContext = workoutContext as Json;
      }

      if (shouldAttachOutlineDraft) {
        const { blocks, drops } = normalizeOutlineDraft(outlineEditor.draftBlocks);
        const { status } = readCoachOutlineMetadata(metadata);
        const draft = buildTaskModalOutlineDraftPayload({
          revision: outlineRevision,
          status,
          confirmed: false,
          blocks,
          drops: drops.length > 0 ? drops : outlineEditor.validationDrops,
        });
        payload.task_modal_outline_draft = draft as unknown as Json;
      }

      return Object.keys(payload).length > 0 ? payload : null;
    },
    [
      shouldAttachOutlineDraft,
      outlineEditor.draftBlocks,
      outlineEditor.validationDrops,
      metadata,
      outlineRevision,
      title,
    ],
  );

  const transcriptFilter = useCallback(
    (row: { content: string }) => row.content !== BUDDY_ONBOARDING_SYSTEM_EVENT,
    [],
  );

  const onEffectTelemetry = useCallback((_event: AgentEffectTelemetryEvent) => {
    /* Host may forward to logAgentRoutingEvent */
  }, []);

  return {
    outlineRevision,
    setOutlineRevision,
    buildOutgoingMessageMetadata,
    transcriptFilter,
    onEffectTelemetry,
  };
}
