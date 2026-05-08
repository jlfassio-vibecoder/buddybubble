/**
 * End-to-end dispatcher tests with mocked PostgREST, OAuth, and Vertex fetches.
 *
 * Run:
 *   deno test --allow-env --allow-read --no-check supabase/functions/agent-dispatch/*.integration.test.ts
 */

import { assertEquals, assertExists } from 'jsr:@std/assert@1';

import { _resetVertexAuthCacheForTests } from '../_shared/llm/vertex-auth.ts';
import { handleDispatchRequest } from './handler.ts';
import { MockFetchRouter } from '../_shared/test-helpers/fetch-router.ts';
import { captureAgentLogs, type CapturedAgentLog } from '../_shared/test-helpers/log-capture.ts';
import {
  installPostgrestRoutes,
  TEST_AGENT_WEBHOOK_SECRET,
  TEST_BUBBLE_ID,
  TEST_SUPABASE_SERVICE_ROLE_KEY,
  TEST_SUPABASE_URL,
  TEST_USER_ID,
  type InstallPostgrestOptions,
} from '../_shared/test-helpers/postgrest-fixtures.ts';
import {
  getTestGcpServiceAccountJson,
  googleOAuthAuthError,
  googleOAuthHappy,
  oauthUrl,
  TEST_VERTEX_LOCATION,
  TEST_VERTEX_PROJECT,
  vertex429ThenHappy,
  vertex500Always,
  vertexHappy,
  vertexMalformedJson,
  vertexShapeViolating,
  vertexUrl,
  type VertexHandlerWithCount,
} from '../_shared/test-helpers/vertex-fixtures.ts';

const COACH_REPLY = {
  reply_content: 'Start with an easy full-body warmup today.',
  create_card: false,
  task_title: null,
  task_description: null,
  update_existing_task: false,
  updated_task_title: null,
  updated_task_description: null,
  intake_phase: 'other',
  session_readiness_score: 70,
  missing_intake_categories: [],
  user_requested_immediate_card: false,
  session_request: false,
  coach_task_notes: null,
  proposed_workout_metadata: null,
  execution_patch: null,
};

const ORGANIZER_REPLY = {
  replyContent: 'I made a note of that and can turn it into a task.',
  proposedWrite: {
    kind: 'task',
    title: 'Follow up on the planning note',
    description: 'Review the planning note and assign next steps.',
    dueOn: null,
    assigneeUserId: null,
  },
};

const BUDDY_REPLY = {
  replyContent: 'You can invite a teammate from the workspace members screen.',
  createCard: {
    title: 'Invite a teammate',
    description: 'Open workspace settings, then use the members tab.',
    action_type: 'invite_teammate',
  },
};

async function setDispatcherEnv(): Promise<void> {
  Deno.env.set('SUPABASE_URL', TEST_SUPABASE_URL);
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', TEST_SUPABASE_SERVICE_ROLE_KEY);
  Deno.env.set('AGENT_WEBHOOK_SECRET', TEST_AGENT_WEBHOOK_SECRET);
  Deno.env.set('GCP_PROJECT_ID', TEST_VERTEX_PROJECT);
  Deno.env.set('GCP_LOCATION', TEST_VERTEX_LOCATION);
  Deno.env.set('GCP_SERVICE_ACCOUNT_JSON', await getTestGcpServiceAccountJson());
  Deno.env.set('LLM_TIMEOUT_MS', '2500');
  Deno.env.delete('LLM_DEBUG');
  Deno.env.delete('ORGANIZER_WRITES_ENABLED');
}

function clearDispatcherEnv(): void {
  for (const key of [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'AGENT_WEBHOOK_SECRET',
    'GCP_PROJECT_ID',
    'GCP_LOCATION',
    'GCP_SERVICE_ACCOUNT_JSON',
    'LLM_TIMEOUT_MS',
    'LLM_DEBUG',
    'ORGANIZER_WRITES_ENABLED',
  ]) {
    Deno.env.delete(key);
  }
}

function webhookRequest(
  options: {
    secret?: string;
    content?: string;
    id?: string;
    userId?: string;
    bubbleId?: string | null;
    parentId?: string | null;
    metadata?: Record<string, unknown> | null;
  } = {},
): Request {
  const record = {
    id: options.id ?? '00000000-0000-4000-8000-000000000201',
    bubble_id: options.bubbleId === undefined ? TEST_BUBBLE_ID : options.bubbleId,
    user_id: options.userId ?? TEST_USER_ID,
    parent_id: options.parentId ?? null,
    target_task_id: null,
    attached_task_id: null,
    content: options.content ?? '@coach what should I do today?',
    created_at: '2026-05-08T21:00:00.000Z',
    metadata: options.metadata ?? null,
  };
  return new Request('http://localhost/functions/v1/agent-dispatch', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-agent-secret': options.secret ?? TEST_AGENT_WEBHOOK_SECRET,
    },
    body: JSON.stringify({
      type: 'INSERT',
      schema: 'public',
      table: 'messages',
      record,
      old_record: null,
    }),
  });
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

async function withHarness<T>(
  options: {
    postgrest?: InstallPostgrestOptions;
    vertex?: VertexHandlerWithCount;
    oauth?: 'happy' | 'auth_error';
  },
  fn: (harness: {
    router: MockFetchRouter;
    logs: ReturnType<typeof captureAgentLogs>;
    rpc: ReturnType<typeof installPostgrestRoutes>;
    vertex: VertexHandlerWithCount | null;
  }) => Promise<T>,
): Promise<T> {
  await setDispatcherEnv();
  _resetVertexAuthCacheForTests();

  const router = new MockFetchRouter();
  const rpc = installPostgrestRoutes(router, options.postgrest);
  const vertex = options.vertex ?? null;

  router.route(
    'oauth',
    (_req, call) => oauthUrl(call),
    options.oauth === 'auth_error' ? googleOAuthAuthError() : googleOAuthHappy(),
  );
  if (vertex) {
    router.route('vertex', (_req, call) => vertexUrl(call), vertex.handler);
  }

  const logs = captureAgentLogs();
  router.install();

  try {
    return await fn({ router, logs, rpc, vertex });
  } finally {
    router.restore();
    logs.restore();
    clearDispatcherEnv();
    _resetVertexAuthCacheForTests();
  }
}

function integrationTest(name: string, fn: () => Promise<void>): void {
  Deno.test({
    name,
    sanitizeOps: false,
    sanitizeResources: false,
    fn,
  });
}

function agentLogsFromRouted(logs: CapturedAgentLog[]): CapturedAgentLog[] {
  const routedIndex = logs.findIndex((log) => log.msg === 'routed to strategy');
  return routedIndex === -1 ? [] : logs.slice(routedIndex);
}

function assertSuccessfulDispatchLogs(logs: CapturedAgentLog[], slug: string): void {
  const phases = logs
    .filter(
      (log) => log.phase && log.msg !== 'organizer write intent' && log.msg !== 'buddy persisted',
    )
    .map((log) => log.phase);
  assertEquals(phases, [
    'received',
    'routed',
    'llm_call',
    'llm_done',
    'parsed',
    ...(slug === 'coach' ? ['guarded'] : []),
    'persisted',
    'done',
  ]);
  for (const log of agentLogsFromRouted(logs)) {
    assertEquals(log.slug, slug);
  }
  const done = logs.find((log) => log.msg === 'dispatch done');
  assertExists(done);
  assertEquals(typeof done.latency_ms, 'number');
}

integrationTest('unauthorized webhook returns HTTP 200 and never calls Vertex', async () => {
  await withHarness({ vertex: vertexHappy(COACH_REPLY) }, async ({ vertex }) => {
    const response = await handleDispatchRequest(webhookRequest({ secret: 'wrong-secret' }));
    assertEquals(response.status, 200);
    assertEquals(await readJson(response), { ok: false, error: 'unauthorized' });
    assertEquals(vertex?.count(), 0);
  });
});

integrationTest('loop guard skips when the message author is an agent', async () => {
  await withHarness(
    { postgrest: { loopGuardMatches: true }, vertex: vertexHappy(COACH_REPLY) },
    async ({ logs, vertex, rpc }) => {
      const response = await handleDispatchRequest(webhookRequest());
      assertEquals(response.status, 200);
      assertEquals(await readJson(response), { ok: true, skipped: 'author_is_agent' });
      assertEquals(vertex?.count(), 0);
      assertEquals(rpc.getRpcCalls().length, 0);
      assertExists(logs.findLog((log) => log.msg === 'loop guard skip (author is agent)'));
    },
  );
});

integrationTest('happy coach mention persists one reply', async () => {
  await withHarness({ vertex: vertexHappy(COACH_REPLY) }, async ({ logs, vertex, rpc }) => {
    const response = await handleDispatchRequest(webhookRequest());
    assertEquals(response.status, 200);
    assertEquals((await readJson(response)).ok, true);
    assertEquals(vertex?.count(), 1);
    assertSuccessfulDispatchLogs(logs.logs, 'coach');

    const calls = rpc.getRpcCalls('agent_create_card_and_reply');
    assertEquals(calls.length, 1);
    assertEquals(calls[0].args.p_create_card, false);
    assertEquals(calls[0].args.p_reply_text, COACH_REPLY.reply_content);
  });
});

integrationTest('429 from Vertex retries once and then persists', async () => {
  const vertex = vertex429ThenHappy(COACH_REPLY);
  await withHarness({ vertex }, async ({ logs, rpc }) => {
    const response = await handleDispatchRequest(webhookRequest());
    assertEquals(response.status, 200);
    assertEquals((await readJson(response)).ok, true);
    assertEquals(vertex.count(), 2);
    assertSuccessfulDispatchLogs(logs.logs, 'coach');
    assertEquals(rpc.getRpcCalls('agent_create_card_and_reply').length, 1);
  });
});

integrationTest('500 from Vertex exhausts retries and inserts safe reply', async () => {
  const vertex = vertex500Always();
  await withHarness({ vertex }, async ({ logs, rpc }) => {
    const response = await handleDispatchRequest(webhookRequest());
    assertEquals(response.status, 200);
    assertEquals((await readJson(response)).fallback_reply_inserted, true);
    assertEquals(vertex.count(), 3);
    assertExists(
      logs.findLog((log) => log.msg === 'fallback insertion' && log.error_kind === 'http'),
    );

    const calls = rpc.getRpcCalls('agent_create_card_and_reply');
    assertEquals(calls.length, 1);
    assertEquals(calls[0].args.p_create_card, false);
  });
});

integrationTest(
  'malformed Vertex response body inserts safe reply with parse error_kind',
  async () => {
    const vertex = vertexMalformedJson();
    await withHarness({ vertex }, async ({ logs, rpc }) => {
      const response = await handleDispatchRequest(webhookRequest());
      assertEquals(response.status, 200);
      assertEquals((await readJson(response)).fallback_reply_inserted, true);
      assertEquals(vertex.count(), 1);
      assertExists(
        logs.findLog((log) => log.msg === 'fallback insertion' && log.error_kind === 'parse'),
      );
      assertEquals(rpc.getRpcCalls('agent_create_card_and_reply').length, 1);
    });
  },
);

integrationTest(
  'shape-violating Vertex response inserts safe reply with shape error_kind',
  async () => {
    const vertex = vertexShapeViolating();
    await withHarness({ vertex }, async ({ logs, rpc }) => {
      const response = await handleDispatchRequest(webhookRequest());
      assertEquals(response.status, 200);
      assertEquals((await readJson(response)).fallback_reply_inserted, true);
      assertEquals(vertex.count(), 1);
      assertExists(
        logs.findLog((log) => log.msg === 'fallback insertion' && log.error_kind === 'shape'),
      );
      assertEquals(rpc.getRpcCalls('agent_create_card_and_reply').length, 1);
    });
  },
);

integrationTest('OAuth auth failure inserts safe reply with auth error_kind', async () => {
  await withHarness(
    { vertex: vertexHappy(COACH_REPLY), oauth: 'auth_error' },
    async ({ logs, vertex, rpc }) => {
      const response = await handleDispatchRequest(webhookRequest());
      assertEquals(response.status, 200);
      assertEquals((await readJson(response)).fallback_reply_inserted, true);
      assertEquals(vertex?.count(), 0);
      assertExists(
        logs.findLog((log) => log.msg === 'vertex auth failed' && log.error_kind === 'auth'),
      );
      assertExists(
        logs.findLog((log) => log.msg === 'fallback insertion' && log.error_kind === 'auth'),
      );
      assertEquals(rpc.getRpcCalls('agent_create_card_and_reply').length, 1);
    },
  );
});

integrationTest('happy organizer mention persists via organizer RPC', async () => {
  await withHarness(
    { postgrest: { boundSlugs: ['coach', 'organizer'] }, vertex: vertexHappy(ORGANIZER_REPLY) },
    async ({ logs, vertex, rpc }) => {
      const response = await handleDispatchRequest(
        webhookRequest({ content: '@organizer please make a task for this' }),
      );
      assertEquals(response.status, 200);
      assertEquals((await readJson(response)).ok, true);
      assertEquals(vertex?.count(), 1);
      assertSuccessfulDispatchLogs(logs.logs, 'organizer');
      assertExists(logs.findLog((log) => log.msg === 'organizer write intent'));

      const calls = rpc.getRpcCalls('organizer_create_reply_and_task');
      assertEquals(calls.length, 1);
      assertEquals(calls[0].args.p_reply_content, ORGANIZER_REPLY.replyContent);
      assertEquals(calls[0].args.p_task_title, null);
    },
  );
});

integrationTest('happy buddy mention persists via buddy RPC', async () => {
  await withHarness(
    { postgrest: { boundSlugs: ['coach'] }, vertex: vertexHappy(BUDDY_REPLY) },
    async ({ logs, vertex, rpc }) => {
      const response = await handleDispatchRequest(
        webhookRequest({ content: '@buddy how do I add a teammate?' }),
      );
      assertEquals(response.status, 200);
      assertEquals((await readJson(response)).ok, true);
      assertEquals(vertex?.count(), 1);
      assertSuccessfulDispatchLogs(logs.logs, 'buddy');
      assertExists(logs.findLog((log) => log.msg === 'buddy persisted'));

      const calls = rpc.getRpcCalls('buddy_create_onboarding_reply');
      assertEquals(calls.length, 1);
      assertEquals(calls[0].args.p_reply_content, BUDDY_REPLY.replyContent);
      assertEquals(calls[0].args.p_card_title, BUDDY_REPLY.createCard.title);
      assertEquals(calls[0].args.p_action_type, BUDDY_REPLY.createCard.action_type);
    },
  );
});
