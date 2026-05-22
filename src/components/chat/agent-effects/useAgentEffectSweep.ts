'use client';

import { useEffect, useRef } from 'react';
import type { MessageRowWithEmbeddedTask } from '@/types/database';
import type { AgentDefinitionLite } from '@/lib/agents/resolveTargetAgent';
import { COACH_SLUG } from '@/lib/agents/coach/config';
import { parseExecutionPatchFromMetadata, type ExecutionPatch } from '@/types/execution-patch';
import { executionPatchFingerprint } from '@/lib/workout-player-execution-patch-bridge';
import { parseTaskModalIntakePatchFromMetadata } from '@/lib/agents/coach/task-modal-intake-patch';
import { parseCardActionFromMetadata } from '@/components/chat/agent-effects/parse-card-action';
import type {
  AgentEffectTelemetryEvent,
  CardActionEffectPayload,
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
  onCardAction?: (ctx: CardActionEffectPayload) => void;
  onEffectTelemetry?: (event: AgentEffectTelemetryEvent) => void;
};

function messageCreatedAtMs(row: MessageRowWithEmbeddedTask): number {
  const rawCreated = (row as { created_at?: unknown }).created_at;
  const parsed = typeof rawCreated === 'string' ? Date.parse(rawCreated) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : Date.now();
}

/**
 * Scans coach-authored rows for `execution_patch` / `task_modal_intake_patch` / `card_action` metadata.
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
  onCardAction,
  onEffectTelemetry,
}: UseAgentEffectSweepArgs): void {
  const onExecutionPatchRef = useRef(onExecutionPatch);
  onExecutionPatchRef.current = onExecutionPatch;
  const onTaskModalIntakePatchRef = useRef(onTaskModalIntakePatch);
  onTaskModalIntakePatchRef.current = onTaskModalIntakePatch;
  const onCardActionRef = useRef(onCardAction);
  onCardActionRef.current = onCardAction;
  const onEffectTelemetryRef = useRef(onEffectTelemetry);
  onEffectTelemetryRef.current = onEffectTelemetry;

  const handledExecutionPatchFingerprintRef = useRef<Map<string, string>>(new Map());
  const handledCardActionMessageIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    handledExecutionPatchFingerprintRef.current.clear();
    handledCardActionMessageIdsRef.current.clear();
  }, [taskId]);

  useEffect(() => {
    const emit = onEffectTelemetryRef.current;
    const onEx = onExecutionPatchRef.current;
    const onIntake = onTaskModalIntakePatchRef.current;
    const onCard = onCardActionRef.current;
    if (!onEx && !onIntake && !onCard) return;
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
        const meta = row.metadata;
        const rawEx =
          meta != null && typeof meta === 'object' && !Array.isArray(meta)
            ? (meta as { execution_patch?: unknown }).execution_patch
            : undefined;
        const fp = executionPatchFingerprint(rawEx);
        const alreadyApplied =
          fp != null && handledExecutionPatchFingerprintRef.current.get(id) === fp;
        if (!alreadyApplied) {
          let patch: ExecutionPatch | null = null;
          let executionPatchParseThrew = false;
          try {
            patch = parseExecutionPatchFromMetadata(rawEx);
          } catch {
            executionPatchParseThrew = true;
            patch = null;
          }
          if (!patch) {
            emit?.({
              kind: 'effect.parse_dropped',
              effect: 'execution_patch',
              messageId: id,
              reason: executionPatchParseThrew || rawEx !== undefined ? 'invalid' : 'missing',
            });
            if (!executionPatchParseThrew && fp != null) {
              handledExecutionPatchFingerprintRef.current.set(id, fp);
            }
          } else {
            onEx({ ...baseCtx, patch });
            if (fp != null) handledExecutionPatchFingerprintRef.current.set(id, fp);
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
        } else {
          onIntake({ ...baseCtx, patch: intakePatch });
          intakeHandledThisRun.add(id);
          emit?.({ kind: 'effect.applied', effect: 'task_modal_intake_patch', messageId: id });
        }
      }

      if (onCard) {
        emit?.({ kind: 'effect.scanned', effect: 'card_action', messageId: id });
        if (!handledCardActionMessageIdsRef.current.has(id)) {
          const meta = row.metadata;
          const rawAction =
            meta != null && typeof meta === 'object' && !Array.isArray(meta)
              ? (meta as { card_action?: unknown }).card_action
              : undefined;
          const action = parseCardActionFromMetadata(rawAction);
          if (!action) {
            handledCardActionMessageIdsRef.current.add(id);
            emit?.({
              kind: 'effect.parse_dropped',
              effect: 'card_action',
              messageId: id,
              reason: rawAction === undefined ? 'missing' : 'invalid',
            });
          } else {
            onCard({ ...baseCtx, action });
            handledCardActionMessageIdsRef.current.add(id);
            emit?.({ kind: 'effect.applied', effect: 'card_action', messageId: id });
          }
        }
      }
    }
  }, [agentsByAuthUserId, isLoading, messages, taskId]);
}
