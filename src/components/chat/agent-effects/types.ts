import { COACH_SLUG } from '@/lib/agents/coach/config';
import type { ExecutionPatch } from '@/types/execution-patch';
import type { TaskModalIntakePatch } from '@/lib/agents/coach/task-modal-intake-patch';

export type AgentEffectContext = {
  taskId: string;
  messageId: string;
  /** `Date.parse(row.created_at)`; `Date.now()` when non-finite. */
  messageCreatedAtMs: number;
  agentSlug: typeof COACH_SLUG;
};

export type AgentEffectTelemetryEvent =
  | {
      kind: 'effect.scanned';
      effect: 'execution_patch' | 'task_modal_intake_patch';
      messageId: string;
    }
  | {
      kind: 'effect.parse_dropped';
      effect: 'execution_patch' | 'task_modal_intake_patch';
      messageId: string;
      reason: 'missing' | 'invalid';
    }
  | {
      kind: 'effect.applied';
      effect: 'execution_patch' | 'task_modal_intake_patch';
      messageId: string;
    };

export type ExecutionPatchEffectPayload = AgentEffectContext & { patch: ExecutionPatch };

export type TaskModalIntakePatchEffectPayload = AgentEffectContext & {
  patch: TaskModalIntakePatch;
};
