import { assertEquals } from 'jsr:@std/assert@1';

import type { DispatchContext, NormalizedMessage } from '../dispatch/types.ts';
import type { VertexErrorKind } from '../llm/types.ts';
import {
  recordWorkspaceAiEvent,
  resolveTelemetrySurface,
  resolveTelemetryTaskId,
  vertexErrorKindToEventType,
} from './workspace-ai-events.ts';

function makeCtx(overrides: Partial<DispatchContext> = {}): DispatchContext {
  const message: NormalizedMessage = {
    id: 'msg-1',
    bubble_id: 'bubble-1',
    user_id: 'user-1',
    parent_id: null,
    target_task_id: 'task-1',
    attached_task_id: null,
    content: '@coach hi',
    created_at: '2026-05-28T00:00:00.000Z',
    metadata: { surface: 'standard_task_chat_rail' },
  };
  return {
    supabase: { rpc: async () => ({ data: null, error: null }), from: () => ({}) },
    requestId: 'req-1',
    message,
    agent: {
      slug: 'coach',
      auth_user_id: 'agent-1',
      mention_handle: 'coach',
      display_name: 'Coach',
    },
    threadId: message.id,
    history: [],
    signal: AbortSignal.timeout(1000),
    workspaceId: 'workspace-1',
    extras: {
      coach: { knownTargetTaskId: 'known-task-1' },
    },
    ...overrides,
  };
}

Deno.test('vertexErrorKindToEventType maps all classified kinds', () => {
  const cases: Array<[VertexErrorKind, string]> = [
    ['truncated', 'error_truncated'],
    ['self_attestation_mismatch', 'error_attestation'],
    ['parse', 'error_parse'],
    ['shape', 'error_shape'],
    ['http', 'error_http'],
    ['timeout', 'error_timeout'],
    ['auth', 'error_auth'],
    ['cue_unanchored', 'error_other'],
  ];
  for (const [kind, expected] of cases) {
    assertEquals(vertexErrorKindToEventType(kind), expected);
  }
});

Deno.test('resolveTelemetryTaskId prefers coach knownTargetTaskId', () => {
  assertEquals(resolveTelemetryTaskId(makeCtx()), 'known-task-1');
  assertEquals(
    resolveTelemetryTaskId(
      makeCtx({
        extras: {},
      }),
    ),
    'task-1',
  );
});

Deno.test('resolveTelemetrySurface reads metadata.surface', () => {
  assertEquals(resolveTelemetrySurface(makeCtx(), 'coach'), 'standard_task_chat_rail');
});

Deno.test('recordWorkspaceAiEvent skips when workspaceId is null', async () => {
  let insertCalled = false;
  const supabase = {
    rpc: async () => ({ data: null, error: null }),
    from: () => ({
      insert: async () => {
        insertCalled = true;
        return { error: null };
      },
    }),
  };
  await recordWorkspaceAiEvent(supabase, {
    workspaceId: null,
    bubbleId: 'bubble-1',
    taskId: null,
    actorUserId: 'user-1',
    agentSlug: 'coach',
    surface: null,
    eventType: 'success',
    requestId: 'req-1',
  });
  assertEquals(insertCalled, false);
});

Deno.test('recordWorkspaceAiEvent inserts expected row shape', async () => {
  let captured: Record<string, unknown> | null = null;
  const supabase = {
    rpc: async () => ({ data: null, error: null }),
    from: () => ({
      insert: async (row: Record<string, unknown>) => {
        captured = row;
        return { error: null };
      },
    }),
  };
  await recordWorkspaceAiEvent(supabase, {
    workspaceId: 'workspace-1',
    bubbleId: 'bubble-1',
    taskId: 'task-1',
    actorUserId: 'user-1',
    agentSlug: 'coach',
    surface: 'standard_task_chat_rail',
    eventType: 'error_truncated',
    errorKind: 'truncated',
    tokens: { prompt: 10, completion: 20, thoughts: 3 },
    latencyMs: 900,
    model: 'gemini-test',
    requestId: 'req-1',
    metadata: { finish_reason: 'MAX_TOKENS' },
  });
  assertEquals(captured?.workspace_id, 'workspace-1');
  assertEquals(captured?.event_type, 'error_truncated');
  assertEquals(captured?.error_kind, 'truncated');
  assertEquals(captured?.prompt_tokens, 10);
});

Deno.test('recordWorkspaceAiEvent swallows insert errors', async () => {
  const supabase = {
    rpc: async () => ({ data: null, error: null }),
    from: () => ({
      insert: async () => ({ error: { message: 'boom' } }),
    }),
  };
  await recordWorkspaceAiEvent(supabase, {
    workspaceId: 'workspace-1',
    bubbleId: null,
    taskId: null,
    actorUserId: 'user-1',
    agentSlug: 'coach',
    surface: null,
    eventType: 'success',
    requestId: 'req-1',
  });
});
