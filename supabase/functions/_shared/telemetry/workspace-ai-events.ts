/**
 * Best-effort writer for `public.workspace_ai_events` (System Analytics Sprint 1).
 * Never throws — telemetry must not block agent dispatch.
 */

import type { DispatchContext, SupabaseClient } from '../dispatch/types.ts';
import type { VertexErrorKind } from '../llm/types.ts';
import { log } from '../obs/log.ts';
import { COACH_SLUG } from '../../agents/coach/config.ts';
import { isCoachRailSurfaceFromMessageMetadata } from '../../agents/coach/prompts.ts';

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

export type WorkspaceAiEventTokens = {
  prompt?: number | null;
  completion?: number | null;
  thoughts?: number | null;
};

export type RecordWorkspaceAiEventArgs = {
  workspaceId: string | null;
  bubbleId: string | null;
  taskId: string | null;
  actorUserId: string;
  agentSlug: string;
  surface: string | null;
  eventType: WorkspaceAiEventType;
  errorKind?: VertexErrorKind | null;
  tokens?: WorkspaceAiEventTokens;
  latencyMs?: number | null;
  model?: string | null;
  requestId: string;
  metadata?: Record<string, unknown>;
};

/** Map dispatcher error classification to persisted `event_type`. */
export function vertexErrorKindToEventType(kind: VertexErrorKind): WorkspaceAiEventType {
  switch (kind) {
    case 'truncated':
      return 'error_truncated';
    case 'self_attestation_mismatch':
      return 'error_attestation';
    case 'parse':
      return 'error_parse';
    case 'shape':
      return 'error_shape';
    case 'http':
      return 'error_http';
    case 'timeout':
      return 'error_timeout';
    case 'auth':
      return 'error_auth';
    default:
      return 'error_other';
  }
}

/** Prefer Coach `knownTargetTaskId`, then webhook `target_task_id`. */
export function resolveTelemetryTaskId(ctx: DispatchContext): string | null {
  const coachExtras = ctx.extras?.coach;
  if (coachExtras && typeof coachExtras === 'object') {
    const known = (coachExtras as { knownTargetTaskId?: unknown }).knownTargetTaskId;
    if (typeof known === 'string' && known.length > 0) return known;
  }
  return ctx.message.target_task_id;
}

/** Read explicit metadata.surface or derive Coach rail surface when applicable. */
export function resolveTelemetrySurface(ctx: DispatchContext, agentSlug: string): string | null {
  const meta = ctx.message.metadata;
  if (meta != null && typeof meta === 'object' && !Array.isArray(meta)) {
    const surface = (meta as Record<string, unknown>).surface;
    if (typeof surface === 'string' && surface.length > 0) return surface;
  }
  if (agentSlug === COACH_SLUG && isCoachRailSurfaceFromMessageMetadata(ctx.message.metadata)) {
    return 'standard_task_chat_rail';
  }
  return null;
}

export async function recordWorkspaceAiEvent(
  supabase: SupabaseClient,
  args: RecordWorkspaceAiEventArgs,
): Promise<void> {
  if (!args.workspaceId) {
    log('debug', 'workspace_ai_events skipped (no workspace_id)', {
      request_id: args.requestId,
      agent_slug: args.agentSlug,
    });
    return;
  }

  try {
    const table = supabase.from('workspace_ai_events') as unknown as {
      insert: (row: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
    };
    const { error } = await table.insert({
      workspace_id: args.workspaceId,
      bubble_id: args.bubbleId,
      task_id: args.taskId,
      actor_user_id: args.actorUserId,
      agent_slug: args.agentSlug,
      surface: args.surface,
      event_type: args.eventType,
      error_kind: args.errorKind ?? null,
      prompt_tokens: args.tokens?.prompt ?? null,
      completion_tokens: args.tokens?.completion ?? null,
      thoughts_tokens: args.tokens?.thoughts ?? null,
      latency_ms: args.latencyMs ?? null,
      model: args.model ?? null,
      request_id: args.requestId,
      metadata: args.metadata ?? {},
    });

    if (error) {
      log('warn', 'workspace_ai_events insert failed', {
        request_id: args.requestId,
        error: error.message,
        event_type: args.eventType,
      });
      return;
    }

    log('debug', 'workspace_ai_events recorded', {
      request_id: args.requestId,
      slug: args.agentSlug,
      event_type: args.eventType,
      task_id: args.taskId,
    });
  } catch (err) {
    log('warn', 'workspace_ai_events insert failed', {
      request_id: args.requestId,
      error: err instanceof Error ? err.message : String(err),
      event_type: args.eventType,
    });
  }
}
