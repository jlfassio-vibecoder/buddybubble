/**
 * Best-effort writer for `public.workspace_ai_events` (System Analytics).
 * Never throws — telemetry must not block API routes.
 */

import { createServiceRoleClient } from '@/lib/supabase-service-role';
import type { OutlineFillTelemetry } from '@/lib/workout-factory/outline-fill-telemetry';

export type WorkspaceAiEventType =
  | 'success'
  | 'success_fallback'
  | 'error_truncated'
  | 'error_attestation'
  | 'error_parse'
  | 'error_shape'
  | 'error_http'
  | 'error_timeout'
  | 'error_auth'
  | 'error_other';

export type WorkspaceAiErrorKind =
  | 'truncated'
  | 'self_attestation_mismatch'
  | 'parse'
  | 'shape'
  | 'http'
  | 'timeout'
  | 'auth'
  | 'cue_unanchored';

export const WORKOUT_FACTORY_AGENT_SLUG = 'workout_factory';
export const GENERATE_WORKOUT_CHAIN_SURFACE = 'generate_workout_chain';

export type RecordWorkspaceAiEventArgs = {
  workspaceId: string;
  bubbleId?: string | null;
  taskId?: string | null;
  actorUserId?: string | null;
  agentSlug: string;
  surface: string | null;
  eventType: WorkspaceAiEventType;
  errorKind?: WorkspaceAiErrorKind | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  thoughtsTokens?: number | null;
  latencyMs?: number | null;
  model?: string | null;
  requestId?: string | null;
  metadata?: Record<string, unknown>;
};

export function outlineFillFailureToEventType(args: {
  success: boolean;
  truncated?: boolean;
  failureKind?: 'validation' | 'parse';
  fillFallback?: boolean;
}): { eventType: WorkspaceAiEventType; errorKind: WorkspaceAiErrorKind | null } {
  if (args.success) {
    if (args.fillFallback) {
      return { eventType: 'success_fallback', errorKind: null };
    }
    return { eventType: 'success', errorKind: null };
  }
  if (args.truncated) {
    return { eventType: 'error_truncated', errorKind: 'truncated' };
  }
  if (args.failureKind === 'parse') {
    return { eventType: 'error_parse', errorKind: 'parse' };
  }
  if (args.failureKind === 'validation') {
    return { eventType: 'error_shape', errorKind: 'shape' };
  }
  return { eventType: 'error_other', errorKind: null };
}

export function vertexRouteErrorToEventType(err: unknown): {
  eventType: WorkspaceAiEventType;
  errorKind: WorkspaceAiErrorKind;
} {
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  if (msg.includes('abort') || msg.includes('timeout')) {
    return { eventType: 'error_timeout', errorKind: 'timeout' };
  }
  if (msg.includes('403') || msg.includes('auth')) {
    return { eventType: 'error_auth', errorKind: 'auth' };
  }
  if (msg.includes('ai api error')) {
    return { eventType: 'error_http', errorKind: 'http' };
  }
  return { eventType: 'error_other', errorKind: 'http' };
}

export function buildOutlineFillEventMetadata(
  telemetry: OutlineFillTelemetry,
): Record<string, unknown> {
  return {
    pipeline: telemetry.pipeline,
    failure_kind: telemetry.failureKind ?? null,
    validation_reason: telemetry.validationReason ?? null,
    validation_error: telemetry.validationError ?? null,
    attempt: telemetry.attemptCount,
    max_attempts: telemetry.maxAttempts,
    outline_block_count: telemetry.outlineBlockCount,
    exercise_count: telemetry.exerciseCount,
    finish_reason: telemetry.finishReason,
    truncated: telemetry.truncated,
    likely_truncation: telemetry.truncated,
    fill_fallback: telemetry.fillFallback ?? false,
    fill_fallback_reason: telemetry.fillFallbackReason ?? null,
  };
}

export async function recordWorkspaceAiEvent(args: RecordWorkspaceAiEventArgs): Promise<void> {
  if (!args.workspaceId) return;

  try {
    const db = createServiceRoleClient();
    const { error } = await db.from('workspace_ai_events').insert({
      workspace_id: args.workspaceId,
      bubble_id: args.bubbleId ?? null,
      task_id: args.taskId ?? null,
      actor_user_id: args.actorUserId ?? null,
      agent_slug: args.agentSlug,
      surface: args.surface,
      event_type: args.eventType,
      error_kind: args.errorKind ?? null,
      prompt_tokens: args.promptTokens ?? null,
      completion_tokens: args.completionTokens ?? null,
      thoughts_tokens: args.thoughtsTokens ?? null,
      latency_ms: args.latencyMs ?? null,
      model: args.model ?? null,
      request_id: args.requestId ?? null,
      metadata: args.metadata ?? {},
    });

    if (error) {
      console.warn('[record-workspace-ai-event] insert failed', {
        request_id: args.requestId,
        event_type: args.eventType,
        error: error.message,
      });
    }
  } catch (err) {
    console.warn('[record-workspace-ai-event] insert failed', {
      request_id: args.requestId,
      event_type: args.eventType,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function recordOutlineFillWorkspaceAiEvent(args: {
  workspaceId: string;
  taskId?: string | null;
  actorUserId: string;
  requestId: string;
  telemetry: OutlineFillTelemetry;
  success: boolean;
}): Promise<void> {
  const { eventType, errorKind } = outlineFillFailureToEventType({
    success: args.success,
    truncated: args.telemetry.truncated,
    failureKind: args.telemetry.failureKind,
    fillFallback: args.telemetry.fillFallback,
  });

  await recordWorkspaceAiEvent({
    workspaceId: args.workspaceId,
    taskId: args.taskId ?? null,
    actorUserId: args.actorUserId,
    agentSlug: WORKOUT_FACTORY_AGENT_SLUG,
    surface: GENERATE_WORKOUT_CHAIN_SURFACE,
    eventType,
    errorKind,
    promptTokens: args.telemetry.promptTokens,
    completionTokens: args.telemetry.completionTokens,
    latencyMs: args.telemetry.latencyMs,
    model: args.telemetry.model,
    requestId: args.requestId,
    metadata: buildOutlineFillEventMetadata(args.telemetry),
  });
}
