'use client';

import { useEffect, useRef } from 'react';
import type { MessageRowWithEmbeddedTask } from '@/types/database';
import type { AgentDefinitionLite } from '@/lib/agents/resolveTargetAgent';
import { COACH_SLUG } from '@/lib/agents/coach/config';
import { parseExecutionPatchFromMetadata, type ExecutionPatch } from '@/types/execution-patch';
import { parseTaskModalIntakePatchFromMetadata } from '@/lib/agents/coach/task-modal-intake-patch';
import type {
  AgentEffectTelemetryEvent,
  ExecutionPatchEffectPayload,
  TaskModalIntakePatchEffectPayload,
} from '@/components/chat/agent-effects/types';

export type UseAgentEffectSweepArgs = {
  taskId: string;
  isLoading: boolean;
  messages: MessageRowWithEmbeddedTask[];
  agentsByAuthUserId: Map<string, AgentDefinitionLite>;
  onExecutionPatch?: (ctx: ExecutionPatchEffectPayload) => void;
  onTaskModalIntakePatch?: (ctx: TaskModalIntakePatchEffectPayload) => void;
  onEffectTelemetry?: (event: AgentEffectTelemetryEvent) => void;
};

function messageCreatedAtMs(row: MessageRowWithEmbeddedTask): number {
  const rawCreated = (row as { created_at?: unknown }).created_at;
  const parsed = typeof rawCreated === 'string' ? Date.parse(rawCreated) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : Date.now();
}

/**
 * Scans coach-authored rows for `execution_patch` / `task_modal_intake_patch` metadata.
 * - Per-effect-run dedupe for intake within a single sweep (duplicate ids in one pass).
 * - Cross-run ref dedupe for execution (matches WorkoutCoachRail / prior TaskModal adapter).
 */
export function useAgentEffectSweep({
  taskId,
  isLoading,
  messages,
  agentsByAuthUserId,
  onExecutionPatch,
  onTaskModalIntakePatch,
  onEffectTelemetry,
}: UseAgentEffectSweepArgs): void {
  const onExecutionPatchRef = useRef(onExecutionPatch);
  onExecutionPatchRef.current = onExecutionPatch;
  const onTaskModalIntakePatchRef = useRef(onTaskModalIntakePatch);
  onTaskModalIntakePatchRef.current = onTaskModalIntakePatch;
  const onEffectTelemetryRef = useRef(onEffectTelemetry);
  onEffectTelemetryRef.current = onEffectTelemetry;

  const handledExecutionPatchMessageIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    handledExecutionPatchMessageIdsRef.current.clear();
  }, [taskId]);

  useEffect(() => {
    const emit = onEffectTelemetryRef.current;
    const onEx = onExecutionPatchRef.current;
    const onIntake = onTaskModalIntakePatchRef.current;
    if (!onEx && !onIntake) return;
    if (!taskId.trim()) return;
    if (isLoading || messages.length === 0) return;

    const availableAgents = [...agentsByAuthUserId.values()];
    const coachAuthUserId = availableAgents.find((a) => a.slug === COACH_SLUG)?.auth_user_id;
    if (!coachAuthUserId) return;

    const coachRows = messages.filter((m) => m.user_id === coachAuthUserId && Boolean(m.id));
    const intakeHandledThisRun = new Set<string>();

    for (const row of coachRows) {
      const id = row.id;
      if (!id) continue;
      const ts = messageCreatedAtMs(row);
      const baseCtx = {
        taskId,
        messageId: id,
        messageCreatedAtMs: ts,
        agentSlug: COACH_SLUG,
      };

      if (onEx) {
        emit?.({ kind: 'effect.scanned', effect: 'execution_patch', messageId: id });
        if (!handledExecutionPatchMessageIdsRef.current.has(id)) {
          const meta = row.metadata;
          const rawEx =
            meta != null && typeof meta === 'object' && !Array.isArray(meta)
              ? (meta as { execution_patch?: unknown }).execution_patch
              : undefined;
          let patch: ExecutionPatch | null = null;
          try {
            patch = parseExecutionPatchFromMetadata(rawEx);
          } catch {
            emit?.({
              kind: 'effect.parse_dropped',
              effect: 'execution_patch',
              messageId: id,
              reason: 'invalid',
            });
            return;
          }
          if (!patch) {
            handledExecutionPatchMessageIdsRef.current.add(id);
            emit?.({
              kind: 'effect.parse_dropped',
              effect: 'execution_patch',
              messageId: id,
              reason: rawEx === undefined ? 'missing' : 'invalid',
            });
          } else {
            onEx({ ...baseCtx, patch });
            handledExecutionPatchMessageIdsRef.current.add(id);
            emit?.({ kind: 'effect.applied', effect: 'execution_patch', messageId: id });
          }
        }
      }

      if (onIntake) {
        emit?.({ kind: 'effect.scanned', effect: 'task_modal_intake_patch', messageId: id });
        if (intakeHandledThisRun.has(id)) continue;
        const meta = row.metadata;
        const rawIntake =
          meta != null && typeof meta === 'object' && !Array.isArray(meta)
            ? (meta as { task_modal_intake_patch?: unknown }).task_modal_intake_patch
            : undefined;
        const intakePatch = parseTaskModalIntakePatchFromMetadata(rawIntake);
        if (!intakePatch) {
          intakeHandledThisRun.add(id);
          emit?.({
            kind: 'effect.parse_dropped',
            effect: 'task_modal_intake_patch',
            messageId: id,
            reason: rawIntake === undefined ? 'missing' : 'invalid',
          });
          continue;
        }
        onIntake({ ...baseCtx, patch: intakePatch });
        intakeHandledThisRun.add(id);
        emit?.({ kind: 'effect.applied', effect: 'task_modal_intake_patch', messageId: id });
      }
    }
  }, [agentsByAuthUserId, isLoading, messages, taskId]);
}
