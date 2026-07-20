import { COACH_SLUG } from '@/lib/agents/coach/config';
import type { ExecutionPatch } from '@/types/execution-patch';
import type { TaskModalIntakePatch } from '@/lib/agents/coach/task-modal-intake-patch';
import type { OutlineDraftAppliedV1 } from '@/lib/agents/coach/outline-draft-patch';
import type { WorkoutCuesPatchV1 } from '@/lib/agents/coach/workout-cues-patch';
import type { CoachStructuralPatchOp } from '@/lib/agents/_shared/workout-metadata/structural-patch-types';
import type { ProposedWorkoutMetadataView } from '@/lib/agents/coach/proposed-workout-metadata-view';

export type AgentEffectContext = {
  taskId: string;
  messageId: string;
  /** `Date.parse(row.created_at)`; `Date.now()` when non-finite. */
  messageCreatedAtMs: number;
  agentSlug: typeof COACH_SLUG;
};

export type CardActionKind = 'trigger_generation' | 'regenerate_from_outline';

export type CardAction = { v: 1; kind: CardActionKind };

export type AgentEffectName =
  | 'execution_patch'
  | 'task_modal_intake_patch'
  | 'card_action'
  | 'outline_draft_applied'
  | 'workout_cues_patch'
  | 'proposed_workout_metadata'
  | 'structural_patch';

export type AgentEffectTelemetryEvent =
  | {
      kind: 'effect.scanned';
      effect: AgentEffectName;
      messageId: string;
    }
  | {
      kind: 'effect.parse_dropped';
      effect: AgentEffectName;
      messageId: string;
      reason: 'missing' | 'invalid';
    }
  | {
      kind: 'effect.applied';
      effect: AgentEffectName;
      messageId: string;
    };

export type ExecutionPatchEffectPayload = AgentEffectContext & { patch: ExecutionPatch };

export type TaskModalIntakePatchEffectPayload = AgentEffectContext & {
  patch: TaskModalIntakePatch;
};

export type CardActionEffectPayload = AgentEffectContext & { action: CardAction };

export type OutlineDraftAppliedEffectPayload = AgentEffectContext & {
  applied: OutlineDraftAppliedV1;
};

export type WorkoutCuesPatchEffectPayload = AgentEffectContext & {
  patch: WorkoutCuesPatchV1;
};

export type ProposedWorkoutMetadataEffectPayload = AgentEffectContext & {
  proposed: ProposedWorkoutMetadataView;
};

export type StructuralPatchEffectPayload = AgentEffectContext & {
  patches: CoachStructuralPatchOp[];
};
