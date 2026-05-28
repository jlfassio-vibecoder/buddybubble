/**
 * End-to-end dispatcher tests with mocked PostgREST, OAuth, and Vertex fetches.
 *
 * Run (from repo root; `supabase/deno.json` + `supabase/deno.lock`, `--node-modules-dir=none`):
 *   pnpm run test:deno-integration
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
  TEST_WORKSPACE_ID,
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
  vertexHappyCapturingBody,
  vertexHappySequence,
  vertexMaxTokens,
  vertexHanging,
  vertexMalformedJson,
  vertexShapeViolating,
  vertexUrl,
  type VertexHandlerWithCount,
} from '../_shared/test-helpers/vertex-fixtures.ts';
import { simulateCreateCardReplyMetadata } from '../_shared/test-helpers/agent-rpc-persistence-simulator.ts';

/** Present only when `buildBlockBlueprintLibraryPrompt()` is injected (not Apex prose references). */
const BLOCK_LIBRARY_INJECTED_MARKER =
  'When you emit proposed_workout_metadata.blocks for exercise-shaped sections';

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
  card_action: null,
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
  Deno.env.delete('COACH_MERGE_WORKOUT_METADATA');
  Deno.env.delete('COACH_CARD_ACTIONS');
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
    'COACH_MERGE_WORKOUT_METADATA',
    'COACH_CARD_ACTIONS',
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
    targetTaskId?: string | null;
    attachedTaskId?: string | null;
  } = {},
): Request {
  const record = {
    id: options.id ?? '00000000-0000-4000-8000-000000000201',
    bubble_id: options.bubbleId === undefined ? TEST_BUBBLE_ID : options.bubbleId,
    user_id: options.userId ?? TEST_USER_ID,
    parent_id: options.parentId ?? null,
    target_task_id: options.targetTaskId === undefined ? null : options.targetTaskId,
    attached_task_id: options.attachedTaskId === undefined ? null : options.attachedTaskId,
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
    /** When true, sets `COACH_MERGE_WORKOUT_METADATA=1` after base dispatcher env (not cleared by setDispatcherEnv). */
    coachMergeWorkoutMetadata?: boolean;
  },
  fn: (harness: {
    router: MockFetchRouter;
    logs: ReturnType<typeof captureAgentLogs>;
    rpc: ReturnType<typeof installPostgrestRoutes>;
    vertex: VertexHandlerWithCount | null;
  }) => Promise<T>,
): Promise<T> {
  await setDispatcherEnv();
  if (options.coachMergeWorkoutMetadata === true) {
    Deno.env.set('COACH_MERGE_WORKOUT_METADATA', '1');
  }
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

function parseCapturedVertexRequest(bodyText: string): {
  systemPrompt: string;
  thinkingBudget: number | undefined;
} {
  const body = JSON.parse(bodyText) as {
    system_instruction?: { parts?: Array<{ text?: string }> };
    generationConfig?: { thinkingConfig?: { thinkingBudget?: number } };
  };
  const systemPrompt = body.system_instruction?.parts?.map((p) => p.text ?? '').join('') ?? '';
  return {
    systemPrompt,
    thinkingBudget: body.generationConfig?.thinkingConfig?.thinkingBudget,
  };
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
    ...(slug === 'coach' ? ['enriched'] : []),
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
    assertEquals(calls[0].args.p_card_action, null);
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

integrationTest('Vertex timeout inserts safe reply with 200', async () => {
  const vertex = vertexHanging();
  await withHarness({ vertex }, async ({ logs, rpc }) => {
    const response = await handleDispatchRequest(webhookRequest());
    assertEquals(response.status, 200);
    assertEquals((await readJson(response)).fallback_reply_inserted, true);
    assertEquals(vertex.count(), 1);
    assertExists(
      logs.findLog(
        (log) =>
          log.msg === 'fallback insertion' &&
          log.error_kind === 'timeout' &&
          log.fallback_ok === true,
      ),
    );
    assertEquals(rpc.getRpcCalls('agent_create_card_and_reply').length, 1);
    const fallbackCall = rpc.getRpcCalls('agent_create_card_and_reply')[0];
    assertEquals(fallbackCall.args.p_card_action, null);
    assertEquals(fallbackCall.args.p_task_modal_intake_patch, null);
  });
});

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

const COACH_REPLY_WITH_INTAKE_PATCH = {
  ...COACH_REPLY,
  task_modal_intake_patch: { readiness: 7 },
};

const COACH_RAIL_SURFACE_DIRECT_REPLY = {
  ...COACH_REPLY,
  reply_content: 'I have updated the workout description on your card.',
  update_existing_task: true,
  updated_task_title: null,
  updated_task_description: 'Full body AMRAP with supersets and mobility finisher.',
  proposed_workout_metadata: null,
};

const COACH_REPLY_RAIL_AUTO_APPLY = {
  ...COACH_REPLY,
  reply_content: 'Added a finisher.',
  update_existing_task: true,
  updated_task_title: null,
  updated_task_description: null,
  proposed_workout_metadata: {
    workout_type: 'AMRAP',
    duration_min: 45,
    exercises: [
      { name: 'Goblet Squat' },
      { name: 'Push Press' },
      { name: 'Kettlebell Thrusters', sets: 3, reps: 12 },
    ],
  },
};

const COACH_REPLY_APPEND_FINISHER_BLOCK = {
  ...COACH_REPLY,
  reply_content: 'Added a Finisher block.',
  update_existing_task: true,
  updated_task_title: null,
  updated_task_description: null,
  proposed_workout_metadata: {
    blocks: [
      {
        name: 'Finisher',
        block_format: 'amrap',
        format_params: { time_cap_minutes: 8 },
        exercises: [{ name: 'Kettlebell Thrusters', sets: 3, reps: 10 }],
      },
    ],
  },
};

const RICH_WORKOUT_TASK_METADATA = {
  workout_type: 'AMRAP',
  duration_min: 45,
  ai_workout_factory: {
    workout_set: {
      workouts: [
        {
          name: 'Main',
          exerciseBlocks: [
            {
              name: 'Main',
              exercises: [{ name: 'Goblet Squat' }, { name: 'Push Press' }],
            },
          ],
        },
      ],
    },
  },
};

const TEST_COACH_TARGET_TASK_ID = '00000000-0000-4000-8000-000000000501';

integrationTest(
  'coach rail surface routes title or description updates to agent_update_task_and_reply',
  async () => {
    await withHarness(
      {
        postgrest: {
          coachTaskResolution: { taskId: TEST_COACH_TARGET_TASK_ID },
        },
        vertex: vertexHappy(COACH_RAIL_SURFACE_DIRECT_REPLY),
      },
      async ({ rpc }) => {
        const response = await handleDispatchRequest(
          webhookRequest({
            id: '00000000-0000-4000-8000-000000000888',
            content: '@coach rewrite the workout description',
            metadata: {
              surface: 'standard_task_chat_rail',
              default_agent_slug: 'coach',
            },
            targetTaskId: TEST_COACH_TARGET_TASK_ID,
          }),
        );
        assertEquals(response.status, 200);
        assertEquals((await readJson(response)).ok, true);

        const direct = rpc.getRpcCalls('agent_update_task_and_reply');
        assertEquals(direct.length, 1);
        assertEquals(direct[0].args.p_target_task_id, TEST_COACH_TARGET_TASK_ID);
        assertEquals(direct[0].args.p_new_title, null);
        assertEquals(
          direct[0].args.p_new_description,
          COACH_RAIL_SURFACE_DIRECT_REPLY.updated_task_description,
        );

        assertEquals(rpc.getRpcCalls('agent_insert_coach_workout_draft_reply').length, 0);
        assertEquals(rpc.getRpcCalls('agent_create_card_and_reply').length, 0);
      },
    );
  },
);

integrationTest(
  'coach rail surface auto-applies proposed_workout_metadata via agent_update_task_and_reply (Step 3 write path)',
  async () => {
    await withHarness(
      {
        coachMergeWorkoutMetadata: true,
        postgrest: {
          coachTaskResolution: {
            taskId: TEST_COACH_TARGET_TASK_ID,
            metadata: {
              // Outline confirmed → outline co-pilot inactive; flat exercise merge still applies.
              coach_outline_confirmed_at: '2026-01-01T00:00:00.000Z',
              workout_type: 'AMRAP',
              duration_min: 45,
              exercises: [{ name: 'Goblet Squat' }, { name: 'Push Press' }],
            },
            item_type: 'workout',
          },
          // Phase 12 (Phase B): flat workout-shaped task metadata is no longer
          // eligible as `task_metadata` workout-context source. The resolver falls back
          // to history, which is exactly what we want to exercise here — the auto-apply
          // merge still operates on the task row directly (not on the resolver result),
          // so the assertions on the RPC args below remain unchanged.
          rootHistoryRows: [{ metadata: { workoutContext: { partial: true } } }],
        },
        vertex: vertexHappy(COACH_REPLY_RAIL_AUTO_APPLY),
      },
      async ({ logs, rpc, vertex }) => {
        const response = await handleDispatchRequest(
          webhookRequest({
            id: '00000000-0000-4000-8000-000000000887',
            content: '@coach add a HIIT finisher',
            metadata: {
              surface: 'standard_task_chat_rail',
              default_agent_slug: 'coach',
            },
            targetTaskId: TEST_COACH_TARGET_TASK_ID,
          }),
        );
        assertEquals(response.status, 200);
        assertEquals((await readJson(response)).ok, true);
        assertExists(vertex);
        assertEquals(vertex.count(), 1);

        const direct = rpc.getRpcCalls('agent_update_task_and_reply');
        assertEquals(direct.length, 1);
        assertEquals(direct[0].args.p_target_task_id, TEST_COACH_TARGET_TASK_ID);
        assertEquals(direct[0].args.p_new_title, null);
        assertEquals(direct[0].args.p_new_description, null);
        const meta = direct[0].args.p_new_metadata as Record<string, unknown>;
        assertEquals(meta.workout_type, 'AMRAP');
        assertEquals(meta.duration_min, 45);
        const exercises = meta.exercises as Array<{ name?: string }>;
        assertEquals(
          exercises.some((e) => e.name === 'Goblet Squat'),
          true,
        );
        assertEquals(
          exercises.some((e) => e.name === 'Push Press'),
          true,
        );
        assertEquals(
          exercises.some((e) => e.name === 'Kettlebell Thrusters'),
          true,
        );

        assertEquals(rpc.getRpcCalls('agent_insert_coach_workout_draft_reply').length, 0);
        assertEquals(rpc.getRpcCalls('agent_create_card_and_reply').length, 0);

        const received = logs.findLog((log) => log.msg === 'webhook received');
        assertExists(received);
        const requestId = received.request_id;
        assertEquals(typeof requestId, 'string');

        assertExists(
          logs.findLog(
            (log) =>
              log.msg === 'coach rail auto-applied workout edit' &&
              log.request_id === requestId &&
              log.has_metadata === true,
          ),
        );
        const ctxLogs = logs.logs.filter(
          (log) => log.msg === 'coach workout context source' && log.request_id === requestId,
        );
        assertEquals(ctxLogs.length, 1);
        assertEquals(ctxLogs[0].surface, 'rail');
        // Phase 12 (Phase B): flat workout-shaped task metadata is no longer
        // eligible for `task_metadata` source — only rich
        // `ai_workout_factory.workout_set.workouts[]` qualifies. The resolver
        // falls back to history here. The auto-apply RPC path is unaffected.
        assertEquals(ctxLogs[0].source, 'history');
      },
    );
  },
);

integrationTest(
  'coach rail surface appends blocks-only Finisher to rich workout via merge (append-only co-pilot)',
  async () => {
    await withHarness(
      {
        coachMergeWorkoutMetadata: true,
        postgrest: {
          coachTaskResolution: {
            taskId: TEST_COACH_TARGET_TASK_ID,
            metadata: RICH_WORKOUT_TASK_METADATA,
            item_type: 'workout',
          },
        },
        vertex: vertexHappy(COACH_REPLY_APPEND_FINISHER_BLOCK),
      },
      async ({ rpc, vertex }) => {
        const response = await handleDispatchRequest(
          webhookRequest({
            id: '00000000-0000-4000-8000-000000000886',
            content: '@coach add a HIIT finisher',
            metadata: {
              surface: 'standard_task_chat_rail',
              default_agent_slug: 'coach',
            },
            targetTaskId: TEST_COACH_TARGET_TASK_ID,
          }),
        );
        assertEquals(response.status, 200);
        assertEquals((await readJson(response)).ok, true);
        assertExists(vertex);
        assertEquals(vertex.count(), 1);

        const direct = rpc.getRpcCalls('agent_update_task_and_reply');
        assertEquals(direct.length, 1);
        assertEquals(direct[0].args.p_target_task_id, TEST_COACH_TARGET_TASK_ID);
        assertEquals(direct[0].args.p_new_title, null);
        assertEquals(direct[0].args.p_new_description, null);

        const meta = direct[0].args.p_new_metadata as {
          ai_workout_factory?: {
            workout_set?: {
              workouts?: Array<{
                exerciseBlocks?: Array<{
                  name?: string;
                  exercises?: Array<{ name?: string; exerciseName?: string }>;
                }>;
              }>;
            };
          };
        };
        const exerciseLabel = (e: { name?: string; exerciseName?: string }) =>
          e.exerciseName ?? e.name ?? '';
        const session = meta.ai_workout_factory?.workout_set?.workouts?.[0];
        assertExists(session);
        const blocks = session.exerciseBlocks ?? [];
        const mainBlock = blocks.find((b) => b.name === 'Main');
        assertExists(mainBlock);
        assertEquals(
          mainBlock.exercises?.some((e) => exerciseLabel(e) === 'Goblet Squat'),
          true,
        );
        assertEquals(
          mainBlock.exercises?.some((e) => exerciseLabel(e) === 'Push Press'),
          true,
        );
        const finisherBlock = blocks.find((b) => b.name === 'Finisher');
        assertExists(finisherBlock);
        assertEquals(
          finisherBlock.exercises?.some((e) => exerciseLabel(e) === 'Kettlebell Thrusters'),
          true,
        );

        assertEquals(rpc.getRpcCalls('agent_insert_coach_workout_draft_reply').length, 0);
        assertEquals(rpc.getRpcCalls('agent_create_card_and_reply').length, 0);
      },
    );
  },
);

const LANE2_EXERCISE_FILL_RESPONSE = {
  blocks: [
    {
      name: 'Finisher',
      exercises: [
        { name: 'Burpees', sets: 1, reps: 'max' },
        { name: 'Mountain Climbers', sets: 1, reps: 'max' },
      ],
    },
  ],
};

integrationTest(
  'Lane 1 block append deterministic bypass persists without full Coach schema',
  async () => {
    const vertex = vertexHappy(COACH_REPLY);
    await withHarness(
      {
        coachMergeWorkoutMetadata: true,
        postgrest: {
          coachTaskResolution: {
            taskId: TEST_COACH_TARGET_TASK_ID,
            metadata: RICH_WORKOUT_TASK_METADATA,
            item_type: 'workout',
          },
        },
        vertex,
      },
      async ({ logs, vertex: vtx, rpc }) => {
        const response = await handleDispatchRequest(
          webhookRequest({
            id: '00000000-0000-4000-8000-000000000890',
            content: '@coach add :finisher/tabata #Push-ups ',
            metadata: {
              surface: 'standard_task_chat_rail',
              default_agent_slug: 'coach',
              block_blueprint_mentions: [
                {
                  token: ':finisher/tabata ',
                  section_name: 'Finisher',
                  section_role: 'finisher',
                  block_format: 'tabata',
                  format_params: { rounds: 8, work_seconds: 20, rest_seconds: 10 },
                },
              ],
              exercise_mentions: [
                {
                  token: '#Push-ups ',
                  name: 'Push-ups',
                  source: 'dictionary',
                },
              ],
            },
            targetTaskId: TEST_COACH_TARGET_TASK_ID,
          }),
        );
        assertEquals(response.status, 200);
        const body = await readJson(response);
        assertEquals(body.ok, true);
        assertEquals(body.preflight_short_circuit, true);
        assertEquals(body.lane, 'block_append_deterministic');
        assertEquals(vtx?.count() ?? 0, 0);

        const direct = rpc.getRpcCalls('agent_update_task_and_reply');
        assertEquals(direct.length, 1);
        assertExists(
          logs.findLog(
            (log) =>
              log.msg === 'coach block blueprint lane' && log.lane === 'block_append_deterministic',
          ),
        );

        const meta = direct[0].args.p_new_metadata as {
          ai_workout_factory?: {
            workout_set?: {
              workouts?: Array<{ exerciseBlocks?: Array<{ name?: string }> }>;
            };
          };
        };
        const blocks = meta.ai_workout_factory?.workout_set?.workouts?.[0]?.exerciseBlocks ?? [];
        assertEquals(
          blocks.some((b) => b.name === 'Finisher'),
          true,
        );
      },
    );
  },
);

integrationTest(
  'Lane 1 tabata finisher uses trigger workoutContext when task row has no rich workout (unsaved generate)',
  async () => {
    const vertex = vertexHappy(COACH_REPLY);
    await withHarness(
      {
        coachMergeWorkoutMetadata: true,
        postgrest: {
          coachTaskResolution: {
            taskId: TEST_COACH_TARGET_TASK_ID,
            metadata: {
              workout_type: 'Complex',
            },
            item_type: 'workout',
          },
        },
        vertex,
      },
      async ({ logs, vertex: vtx, rpc }) => {
        const response = await handleDispatchRequest(
          webhookRequest({
            id: '00000000-0000-4000-8000-000000000896',
            content: '@coach add :finisher/tabata #Push-ups ',
            metadata: {
              surface: 'standard_task_chat_rail',
              default_agent_slug: 'coach',
              workoutContext: RICH_WORKOUT_TASK_METADATA,
              block_blueprint_mentions: [
                {
                  token: ':finisher/tabata ',
                  section_name: 'Finisher',
                  section_role: 'finisher',
                  block_format: 'tabata',
                  format_params: { rounds: 8, work_seconds: 20, rest_seconds: 10 },
                },
              ],
              exercise_mentions: [
                {
                  token: '#Push-ups ',
                  name: 'Push-ups',
                  source: 'dictionary',
                },
              ],
            },
            targetTaskId: TEST_COACH_TARGET_TASK_ID,
          }),
        );
        assertEquals(response.status, 200);
        const body = await readJson(response);
        assertEquals(body.ok, true);
        assertEquals(body.preflight_short_circuit, true);
        assertEquals(body.lane, 'block_append_deterministic');
        assertEquals(vtx?.count() ?? 0, 0);

        const received = logs.findLog((log) => log.msg === 'webhook received');
        assertExists(received);
        const requestId = received.request_id;
        const ctxLog = logs.logs.find(
          (log) => log.msg === 'coach workout context source' && log.request_id === requestId,
        );
        assertExists(ctxLog);
        assertEquals(ctxLog.source, 'trigger');

        const direct = rpc.getRpcCalls('agent_update_task_and_reply');
        assertEquals(direct.length, 1);
        const meta = direct[0].args.p_new_metadata as {
          ai_workout_factory?: {
            workout_set?: {
              workouts?: Array<{
                exerciseBlocks?: Array<{ name?: string; exercises?: Array<{ name?: string }> }>;
              }>;
            };
          };
        };
        const blocks = meta.ai_workout_factory?.workout_set?.workouts?.[0]?.exerciseBlocks ?? [];
        assertEquals(
          blocks.some((b) => b.name === 'Main'),
          true,
        );
        assertEquals(
          blocks.some((b) => b.name === 'Finisher'),
          true,
        );
        const main = blocks.find((b) => b.name === 'Main');
        assertEquals(
          main?.exercises?.some((e) => e.name === 'Goblet Squat'),
          true,
        );
      },
    );
  },
);

integrationTest(
  'Lane 1 tabata finisher persists two EOS exercise mentions with hydrated timers',
  async () => {
    const vertex = vertexHappy(COACH_REPLY);
    await withHarness(
      {
        coachMergeWorkoutMetadata: true,
        postgrest: {
          coachTaskResolution: {
            taskId: TEST_COACH_TARGET_TASK_ID,
            metadata: RICH_WORKOUT_TASK_METADATA,
            item_type: 'workout',
          },
        },
        vertex,
      },
      async ({ vertex: vtx, rpc }) => {
        const response = await handleDispatchRequest(
          webhookRequest({
            id: '00000000-0000-4000-8000-000000000895',
            content: '@coach add :finisher/tabata with #Broad Jumps and #Jump Squats',
            metadata: {
              surface: 'standard_task_chat_rail',
              default_agent_slug: 'coach',
              block_blueprint_mentions: [
                {
                  token: ':finisher/tabata ',
                  section_name: 'Finisher',
                  section_role: 'finisher',
                  block_format: 'tabata',
                  format_params: { rounds: 8, work_seconds: 20, rest_seconds: 10 },
                },
              ],
              exercise_mentions: [
                { token: '#Broad Jumps ', name: 'Broad Jumps', source: 'dictionary' },
                { token: '#Jump Squats ', name: 'Jump Squats', source: 'dictionary' },
              ],
            },
            targetTaskId: TEST_COACH_TARGET_TASK_ID,
          }),
        );
        assertEquals(response.status, 200);
        assertEquals((await readJson(response)).lane, 'block_append_deterministic');
        assertEquals(vtx?.count() ?? 0, 0);

        const meta = rpc.getRpcCalls('agent_update_task_and_reply')[0].args.p_new_metadata as {
          ai_workout_factory?: {
            workout_set?: {
              workouts?: Array<{
                exerciseBlocks?: Array<{
                  name?: string;
                  exercises?: Array<Record<string, unknown>>;
                }>;
              }>;
            };
          };
        };
        const finisher = meta.ai_workout_factory?.workout_set?.workouts?.[0]?.exerciseBlocks?.find(
          (b) => b.name === 'Finisher',
        );
        assertExists(finisher);
        const exercises = finisher.exercises ?? [];
        assertEquals(exercises.length, 2);
        const names = exercises.map((e) => e.exerciseName).sort();
        assertEquals(names, ['Broad Jumps', 'Jump Squats']);
        for (const ex of exercises) {
          assertEquals(ex.workSeconds, 20);
          assertEquals(ex.restSeconds, 10);
          assertEquals(ex.rounds, 8);
          assertEquals(ex.reps, '');
        }
      },
    );
  },
);

integrationTest('Lane 2 block append uses exercise-fill micro-schema then persists', async () => {
  const vertex = vertexHappyCapturingBody(LANE2_EXERCISE_FILL_RESPONSE);
  await withHarness(
    {
      coachMergeWorkoutMetadata: true,
      postgrest: {
        coachTaskResolution: {
          taskId: TEST_COACH_TARGET_TASK_ID,
          metadata: RICH_WORKOUT_TASK_METADATA,
          item_type: 'workout',
        },
      },
      vertex,
    },
    async ({ logs, vertex: vtx, rpc }) => {
      const response = await handleDispatchRequest(
        webhookRequest({
          id: '00000000-0000-4000-8000-000000000891',
          content: '@coach add a bodyweight :finisher/tabata',
          metadata: {
            surface: 'standard_task_chat_rail',
            default_agent_slug: 'coach',
            block_blueprint_mentions: [
              {
                token: ':finisher/tabata ',
                section_name: 'Finisher',
                section_role: 'finisher',
                block_format: 'tabata',
                format_params: { rounds: 8, work_seconds: 20, rest_seconds: 10 },
              },
            ],
          },
          targetTaskId: TEST_COACH_TARGET_TASK_ID,
        }),
      );
      assertEquals(response.status, 200);
      assertEquals((await readJson(response)).lane, 'block_append_exercise_fill');
      assertEquals(vtx?.count(), 1);
      const bodyText = vtx!.lastBodyText();
      assertExists(bodyText);
      assertEquals(bodyText.includes('"blocks"'), true);
      assertEquals(bodyText.includes('reply_content'), false);

      assertEquals(rpc.getRpcCalls('agent_update_task_and_reply').length, 1);
      assertExists(
        logs.findLog(
          (log) =>
            log.msg === 'coach block blueprint lane' && log.lane === 'block_append_exercise_fill',
        ),
      );
    },
  );
});

integrationTest(
  'Lane 2 exercise-fill failure inserts safe reply without full Coach schema retry',
  async () => {
    const vertex = vertexHappyCapturingBody({
      blocks: [{ name: 'Finisher', exercises: [] }],
    });
    await withHarness(
      {
        coachMergeWorkoutMetadata: true,
        postgrest: {
          coachTaskResolution: {
            taskId: TEST_COACH_TARGET_TASK_ID,
            metadata: RICH_WORKOUT_TASK_METADATA,
            item_type: 'workout',
          },
        },
        vertex,
      },
      async ({ rpc, vertex: vtx }) => {
        const response = await handleDispatchRequest(
          webhookRequest({
            id: '00000000-0000-4000-8000-000000000892',
            content: '@coach bodyweight :finisher/tabata',
            metadata: {
              surface: 'standard_task_chat_rail',
              default_agent_slug: 'coach',
              block_blueprint_mentions: [
                {
                  token: ':finisher/tabata ',
                  section_name: 'Finisher',
                  section_role: 'finisher',
                  block_format: 'tabata',
                  format_params: { rounds: 8 },
                },
              ],
            },
            targetTaskId: TEST_COACH_TARGET_TASK_ID,
          }),
        );
        assertEquals(response.status, 200);
        assertEquals((await readJson(response)).preflight_short_circuit, true);
        assertEquals(vtx?.count(), 1);
        assertEquals(rpc.getRpcCalls('agent_update_task_and_reply').length, 0);
        assertEquals(rpc.getRpcCalls('agent_create_card_and_reply').length, 1);
      },
    );
  },
);

integrationTest(
  'main bubble intake includes block library, Apex block, and reduced thinking budget',
  async () => {
    const vertex = vertexHappyCapturingBody(COACH_REPLY);
    await withHarness({ vertex }, async ({ vertex: vtx, logs }) => {
      const response = await handleDispatchRequest(
        webhookRequest({
          id: '00000000-0000-4000-8000-000000000894',
          content: '@coach create a leg day workout for me',
          metadata: { default_agent_slug: 'coach' },
        }),
      );
      assertEquals(response.status, 200);
      assertExists(vtx);
      const body = vtx!.lastBodyText();
      assertExists(body);
      const req = parseCapturedVertexRequest(body);
      assertEquals(req.systemPrompt.includes(BLOCK_LIBRARY_INJECTED_MARKER), true);
      assertEquals(req.systemPrompt.includes('--- APEX ARCHITECT (main bubble chat) ---'), true);
      assertEquals(req.thinkingBudget, 512);
      const dietLog = logs.findLog((log) => log.msg === 'coach main rail diet');
      assertExists(dietLog);
      assertEquals(dietLog.block_library_included, true);
      assertEquals(dietLog.thinking_budget, 512);
      assertEquals(dietLog.surface, 'non_rail');
    });
  },
);

integrationTest('main bubble draft intent includes block library and Apex block', async () => {
  const vertex = vertexHappyCapturingBody(COACH_REPLY);
  await withHarness({ vertex }, async ({ vertex: vtx, logs }) => {
    const response = await handleDispatchRequest(
      webhookRequest({
        id: '00000000-0000-4000-8000-000000000895',
        content: 'Please draft the outline.',
        metadata: { default_agent_slug: 'coach' },
      }),
    );
    assertEquals(response.status, 200);
    assertExists(vtx);
    const body = vtx!.lastBodyText();
    assertExists(body);
    const req = parseCapturedVertexRequest(body);
    assertEquals(req.systemPrompt.includes(BLOCK_LIBRARY_INJECTED_MARKER), true);
    assertEquals(req.systemPrompt.includes('--- APEX ARCHITECT (main bubble chat) ---'), true);
    const dietLog = logs.findLog((log) => log.msg === 'coach main rail diet');
    assertExists(dietLog);
    assertEquals(dietLog.block_library_included, true);
    assertEquals(dietLog.surface, 'non_rail');
  });
});

integrationTest(
  'block mentions with merge disabled falls through to Lane 3 Coach prompt',
  async () => {
    const vertex = vertexHappyCapturingBody(COACH_REPLY);
    await withHarness(
      {
        postgrest: {
          coachTaskResolution: {
            taskId: TEST_COACH_TARGET_TASK_ID,
            metadata: RICH_WORKOUT_TASK_METADATA,
            item_type: 'workout',
          },
        },
        vertex,
      },
      async ({ vertex: vtx, logs }) => {
        const response = await handleDispatchRequest(
          webhookRequest({
            id: '00000000-0000-4000-8000-000000000893',
            content: '@coach add a finisher',
            metadata: {
              surface: 'standard_task_chat_rail',
              default_agent_slug: 'coach',
              block_blueprint_mentions: [
                {
                  token: ':finisher/amrap ',
                  section_name: 'Finisher',
                  section_role: 'finisher',
                  block_format: 'amrap',
                  format_params: { time_cap_minutes: 5 },
                },
              ],
            },
            targetTaskId: TEST_COACH_TARGET_TASK_ID,
          }),
        );
        assertEquals(response.status, 200);
        assertExists(vtx);
        const body = vtx!.lastBodyText();
        assertExists(body);
        const req = parseCapturedVertexRequest(body);
        assertEquals(req.systemPrompt.includes(BLOCK_LIBRARY_INJECTED_MARKER), true);
        assertEquals(req.systemPrompt.includes('BLOCK_BLUEPRINT_REFS'), true);
        assertEquals(req.thinkingBudget, 2048);
        assertEquals(vtx!.count(), 1);
        const dietLog = logs.findLog((log) => log.msg === 'coach main rail diet');
        assertExists(dietLog);
        assertEquals(dietLog.block_library_included, true);
        assertEquals(dietLog.thinking_budget, 2048);
        assertEquals(dietLog.surface, 'rail');
      },
    );
  },
);

integrationTest(
  'coach rail surface prefers rich tasks.metadata over stale history workoutContext (Step 1 read path)',
  async () => {
    await withHarness(
      {
        postgrest: {
          coachTaskResolution: {
            taskId: TEST_COACH_TARGET_TASK_ID,
            // Phase 12 (Phase B): only rich `ai_workout_factory.workout_set.workouts[]`
            // metadata is eligible as `task_metadata` source. This test demonstrates
            // that with a rich workout on the card, the resolver chooses it over a
            // stale history `workoutContext` — preserving the original semantic of
            // "rail surface prefers the live task row".
            metadata: {
              workout_type: 'AMRAP',
              duration_min: 45,
              ai_workout_factory: {
                workout_set: {
                  workouts: [
                    {
                      name: 'Main',
                      exerciseBlocks: [
                        {
                          name: 'Main',
                          exercises: [{ name: 'Goblet Squat' }, { name: 'Push Press' }],
                        },
                      ],
                    },
                  ],
                },
              },
            },
            item_type: 'workout',
          },
          rootHistoryRows: [{ metadata: { workoutContext: { partial: true } } }],
        },
        vertex: vertexHappy(COACH_REPLY),
      },
      async ({ logs, vertex }) => {
        const response = await handleDispatchRequest(
          webhookRequest({
            id: '00000000-0000-4000-8000-000000000889',
            content: '@coach review my workout and add a finisher',
            metadata: {
              surface: 'standard_task_chat_rail',
              default_agent_slug: 'coach',
            },
            targetTaskId: TEST_COACH_TARGET_TASK_ID,
          }),
        );
        assertEquals(response.status, 200);
        assertEquals((await readJson(response)).ok, true);
        assertExists(vertex);
        assertEquals(vertex.count(), 1);

        const received = logs.findLog((log) => log.msg === 'webhook received');
        assertExists(received);
        const requestId = received.request_id;
        assertEquals(typeof requestId, 'string');

        const ctxLogs = logs.logs.filter(
          (log) => log.msg === 'coach workout context source' && log.request_id === requestId,
        );
        assertEquals(
          ctxLogs.length,
          1,
          'expected exactly one workout context source log for this request',
        );
        assertEquals(ctxLogs[0].surface, 'rail');
        assertEquals(ctxLogs[0].source, 'task_metadata');
        assertEquals(typeof ctxLogs[0].bytes, 'number');
        assertEquals((ctxLogs[0].bytes as number) > 0, true);

        const historyLog = logs.logs.find(
          (log) =>
            log.msg === 'coach workout context source' &&
            log.request_id === requestId &&
            log.source === 'history',
        );
        assertEquals(historyLog, undefined);
      },
    );
  },
);

integrationTest(
  'coach rail surface: flat / intake-only tasks.metadata is NOT injected as workout context (Phase 12 rich-workout gate)',
  async () => {
    await withHarness(
      {
        postgrest: {
          coachTaskResolution: {
            taskId: TEST_COACH_TARGET_TASK_ID,
            // Intake-only metadata: readiness + intake fields, NO rich
            // ai_workout_factory.workout_set. Under Phase 12 Phase B this must
            // NOT be treated as workout context; the resolver should fall through
            // to history (none here) and report `source: 'none'`. The model then
            // sees a flat card and can correctly emit GENERATION HAND-OFF instead
            // of LIVE CO-PILOT edits.
            metadata: {
              readiness: 7,
              sleep_quality: 6,
              duration_minutes: 45,
              target_intensity: 'Moderate',
              soreness: ['None'],
              equipment: ['Dumbbells'],
            },
            item_type: 'workout',
          },
        },
        vertex: vertexHappy(COACH_REPLY),
      },
      async ({ logs }) => {
        const response = await handleDispatchRequest(
          webhookRequest({
            id: '00000000-0000-4000-8000-000000000895',
            content: '@coach can you draft a workout?',
            metadata: {
              surface: 'standard_task_chat_rail',
              default_agent_slug: 'coach',
            },
            targetTaskId: TEST_COACH_TARGET_TASK_ID,
          }),
        );
        assertEquals(response.status, 200);
        assertEquals((await readJson(response)).ok, true);

        const received = logs.findLog((log) => log.msg === 'webhook received');
        assertExists(received);
        const requestId = received.request_id;

        const ctxLogs = logs.logs.filter(
          (log) => log.msg === 'coach workout context source' && log.request_id === requestId,
        );
        assertEquals(ctxLogs.length, 1);
        assertEquals(ctxLogs[0].surface, 'rail');
        assertEquals(ctxLogs[0].source, 'none');
        assertEquals(ctxLogs[0].bytes, 0);
      },
    );
  },
);

integrationTest(
  'coach rail surface: flat workout-shaped tasks.metadata without rich workout_set falls through to history',
  async () => {
    await withHarness(
      {
        postgrest: {
          coachTaskResolution: {
            taskId: TEST_COACH_TARGET_TASK_ID,
            metadata: {
              workout_type: 'AMRAP',
              duration_min: 45,
              exercises: [{ name: 'Goblet Squat' }],
            },
            item_type: 'workout',
          },
          rootHistoryRows: [{ metadata: { workoutContext: { exercises: [{ name: 'Squat' }] } } }],
        },
        vertex: vertexHappy(COACH_REPLY),
      },
      async ({ logs }) => {
        const response = await handleDispatchRequest(
          webhookRequest({
            id: '00000000-0000-4000-8000-000000000896',
            content: '@coach swap squats for hinges',
            metadata: {
              surface: 'standard_task_chat_rail',
              default_agent_slug: 'coach',
            },
            targetTaskId: TEST_COACH_TARGET_TASK_ID,
          }),
        );
        assertEquals(response.status, 200);
        assertEquals((await readJson(response)).ok, true);

        const received = logs.findLog((log) => log.msg === 'webhook received');
        assertExists(received);
        const requestId = received.request_id;

        // Phase 12 (Phase B): flat workout-shaped task metadata is rejected by
        // the rich-only gate; resolver falls back to history's workoutContext.
        const ctxLogs = logs.logs.filter(
          (log) => log.msg === 'coach workout context source' && log.request_id === requestId,
        );
        assertEquals(ctxLogs.length, 1);
        assertEquals(ctxLogs[0].surface, 'rail');
        assertEquals(ctxLogs[0].source, 'history');
      },
    );
  },
);

integrationTest(
  'trigger message with workoutContext clears task_modal_intake_patch before RPC',
  async () => {
    await withHarness({ vertex: vertexHappy(COACH_REPLY_WITH_INTAKE_PATCH) }, async ({ rpc }) => {
      const response = await handleDispatchRequest(
        webhookRequest({
          content: '@coach log my set',
          metadata: {
            default_agent_slug: 'coach',
            workoutContext: { exercises: [{ name: 'Squat' }] },
          },
        }),
      );
      assertEquals(response.status, 200);
      assertEquals((await readJson(response)).ok, true);
      const calls = rpc.getRpcCalls('agent_create_card_and_reply');
      assertEquals(calls.length, 1);
      assertEquals(calls[0].args.p_task_modal_intake_patch, null);
    });
  },
);

const COACH_REPLY_CREATE_EMOM_SHELL = {
  ...COACH_REPLY,
  reply_content: 'Your EMOM card is ready.',
  create_card: true,
  task_title: 'EMOM Alternating',
  task_description: '12-minute alternating EMOM with kettlebell swing and push-ups.',
  coach_task_notes:
    "Complete the Workout Intake 3-step form then click 'Generate Workout' on the card.",
  user_requested_immediate_card: true,
  session_request: true,
  intake_phase: 'ready_to_prescribe',
  missing_intake_categories: [],
};

const COACH_OUTLINE_PHASE_B_EMOM = {
  blocks: [
    {
      name: 'Main',
      block_format: 'emom',
      format_params: {
        interval_seconds: 60,
        total_minutes: 12,
      },
      exercises: [{ name: 'KB Swing' }, { name: 'Push-up' }],
    },
  ],
};

integrationTest('coach create_card passes p_coach_workout_outline for Apex outline', async () => {
  const vertex = vertexHappySequence([COACH_REPLY_CREATE_EMOM_SHELL, COACH_OUTLINE_PHASE_B_EMOM]);
  await withHarness({ vertex }, async ({ rpc }) => {
    const response = await handleDispatchRequest(
      webhookRequest({ content: '@coach build my EMOM card now' }),
    );
    assertEquals(response.status, 200);
    assertEquals((await readJson(response)).ok, true);
    assertEquals(vertex.count(), 2);
    const calls = rpc.getRpcCalls('agent_create_card_and_reply');
    assertEquals(calls.length, 1);
    assertEquals(calls[0].args.p_create_card, true);
    const outline = calls[0].args.p_coach_workout_outline as Array<Record<string, unknown>>;
    assertEquals(Array.isArray(outline), true);
    assertEquals(outline.length, 1);
    assertEquals(outline[0].block_format, 'emom');
    const fp = outline[0].format_params as Record<string, unknown>;
    assertEquals(fp.is_alternating, true);
    assertEquals(fp.alternating_stations, [[0], [1]]);
  });
});

integrationTest(
  'coach reply with task_modal_intake_patch passes through when trigger has no workoutContext',
  async () => {
    await withHarness({ vertex: vertexHappy(COACH_REPLY_WITH_INTAKE_PATCH) }, async ({ rpc }) => {
      const response = await handleDispatchRequest(webhookRequest());
      assertEquals(response.status, 200);
      assertEquals((await readJson(response)).ok, true);
      const calls = rpc.getRpcCalls('agent_create_card_and_reply');
      assertEquals(calls.length, 1);
      assertEquals(calls[0].args.p_task_modal_intake_patch, { readiness: 7 });
    });
  },
);

const COACH_REPLY_TRIGGER_GENERATION = {
  ...COACH_REPLY,
  reply_content: 'Starting the workout generator on your card now.',
  card_action: 'trigger_generation',
};

const COACH_REPLY_GENERATOR_PROSE_ONLY = {
  ...COACH_REPLY,
  reply_content: 'Starting the generator now — give me about a minute.',
  card_action: null,
};

integrationTest('coach server_inferred card_action when model omits JSON hand-off', async () => {
  await withHarness(
    {
      postgrest: {
        coachTaskResolution: {
          taskId: TEST_COACH_TARGET_TASK_ID,
          metadata: { workout_type: 'AMRAP' },
          item_type: 'workout',
        },
      },
      vertex: vertexHappy(COACH_REPLY_GENERATOR_PROSE_ONLY),
    },
    async ({ logs, rpc }) => {
      Deno.env.set('COACH_CARD_ACTIONS', '1');
      const response = await handleDispatchRequest(
        webhookRequest({
          content: 'Please draft the outline',
          metadata: {
            surface: 'standard_task_chat_rail',
            default_agent_slug: 'coach',
          },
          targetTaskId: TEST_COACH_TARGET_TASK_ID,
        }),
      );
      assertEquals(response.status, 200);
      assertExists(
        logs.findLog(
          (log) =>
            log.msg === 'coach card_action server_inferred' && log.action === 'trigger_generation',
        ),
      );
      const calls = rpc.getRpcCalls('agent_create_card_and_reply');
      assertEquals(calls.length, 1);
      assertEquals(calls[0].args.p_card_action, { v: 1, kind: 'trigger_generation' });
    },
  );
});

integrationTest(
  'coach card_action trigger_generation persists via reply-only RPC when flag on',
  async () => {
    await withHarness(
      {
        postgrest: {
          coachTaskResolution: { taskId: TEST_COACH_TARGET_TASK_ID },
        },
        vertex: vertexHappyCapturingBody(COACH_REPLY_TRIGGER_GENERATION),
      },
      async ({ logs, rpc, vertex }) => {
        Deno.env.set('COACH_CARD_ACTIONS', '1');
        const response = await handleDispatchRequest(
          webhookRequest({
            content: '@coach please draft the workout now',
            metadata: {
              surface: 'standard_task_chat_rail',
              default_agent_slug: 'coach',
            },
            targetTaskId: TEST_COACH_TARGET_TASK_ID,
          }),
        );
        assertEquals(response.status, 200);
        assertEquals((await readJson(response)).ok, true);

        assertExists(
          logs.findLog(
            (log) =>
              (log.msg === 'coach card_action emitted' ||
                log.msg === 'coach card_action server_inferred') &&
              log.action === 'trigger_generation',
          ),
        );

        const calls = rpc.getRpcCalls('agent_create_card_and_reply');
        assertEquals(calls.length, 1);
        assertEquals(calls[0].args.p_create_card, false);
        assertEquals(calls[0].args.p_card_action, { v: 1, kind: 'trigger_generation' });
        assertEquals(rpc.getRpcCalls('agent_insert_coach_workout_draft_reply').length, 0);
        assertEquals(rpc.getRpcCalls('agent_update_task_and_reply').length, 0);

        // Persistence proof: drive the same args Postgres receives through the
        // simulator and assert `card_action` survives onto reply metadata even
        // without an accompanying intake patch — the exact regression that
        // shipped silently in the prior migration.
        const args = calls[0].args;
        const persistedMeta = simulateCreateCardReplyMetadata({
          execution_patch: args.p_execution_patch,
          personal_cues: args.p_personal_cues,
          task_modal_intake_patch: args.p_task_modal_intake_patch,
          card_action: args.p_card_action,
        });
        assertEquals(persistedMeta.card_action, { v: 1, kind: 'trigger_generation' });
        assertEquals('task_modal_intake_patch' in persistedMeta, false);

        const bodyText = vertex?.lastBodyText?.() ?? null;
        assertExists(bodyText);
        assertEquals(bodyText.includes('card_action'), true);
      },
    );
  },
);

const COACH_REPLY_TRIGGER_GENERATION_WITH_INTAKE = {
  ...COACH_REPLY,
  reply_content: 'Logged that you slept well — starting the generator now.',
  card_action: 'trigger_generation',
  task_modal_intake_patch: { readiness: 7 },
};

integrationTest(
  'coach card_action + intake patch both persist on the same reply metadata',
  async () => {
    await withHarness(
      {
        postgrest: {
          coachTaskResolution: { taskId: TEST_COACH_TARGET_TASK_ID },
        },
        vertex: vertexHappy(COACH_REPLY_TRIGGER_GENERATION_WITH_INTAKE),
      },
      async ({ rpc }) => {
        Deno.env.set('COACH_CARD_ACTIONS', '1');
        const response = await handleDispatchRequest(
          webhookRequest({
            content: '@coach I slept well — go ahead and draft it',
            metadata: {
              surface: 'standard_task_chat_rail',
              default_agent_slug: 'coach',
            },
            targetTaskId: TEST_COACH_TARGET_TASK_ID,
          }),
        );
        assertEquals(response.status, 200);
        assertEquals((await readJson(response)).ok, true);

        const calls = rpc.getRpcCalls('agent_create_card_and_reply');
        assertEquals(calls.length, 1);
        const args = calls[0].args;
        assertEquals(args.p_card_action, { v: 1, kind: 'trigger_generation' });
        assertEquals(args.p_task_modal_intake_patch, { readiness: 7 });

        // Persistence proof: both card_action and the intake patch survive as
        // siblings. The prior SQL bug would have dropped card_action even
        // here in the worst-case ordering of the nested `case ... end` chain.
        const persistedMeta = simulateCreateCardReplyMetadata({
          execution_patch: args.p_execution_patch,
          personal_cues: args.p_personal_cues,
          task_modal_intake_patch: args.p_task_modal_intake_patch,
          card_action: args.p_card_action,
        });
        assertEquals(persistedMeta.card_action, { v: 1, kind: 'trigger_generation' });
        assertEquals(persistedMeta.task_modal_intake_patch, { readiness: 7 });
      },
    );
  },
);

integrationTest(
  'coach reply claiming sleep quality slider update without patch logs warn',
  async () => {
    await withHarness(
      {
        vertex: vertexHappy({
          ...COACH_REPLY,
          reply_content: 'Set your sleep quality slider to 8.',
        }),
      },
      async ({ logs }) => {
        const response = await handleDispatchRequest(webhookRequest());
        assertEquals(response.status, 200);
        assertEquals((await readJson(response)).ok, true);
        assertExists(
          logs.findLog(
            (log) => log.msg === 'coach reply_content claims intake update without patch',
          ),
        );
      },
    );
  },
);

integrationTest(
  'coach reply with execution_patch and intensity wording does not log intake warn',
  async () => {
    await withHarness(
      {
        vertex: vertexHappy({
          ...COACH_REPLY,
          reply_content:
            'Added 35 reps with an RPE of 8.5 for each set — this gives you a clear intensity goal.',
          execution_patch: [
            { exerciseIndex: 5, setIndex: 0, reps: '35', rpe: '8.5' },
            { exerciseIndex: 5, setIndex: 1, reps: '35', rpe: '8.5' },
          ],
        }),
      },
      async ({ logs }) => {
        const response = await handleDispatchRequest(webhookRequest());
        assertEquals(response.status, 200);
        assertEquals((await readJson(response)).ok, true);
        const warn = logs.findLog(
          (log) => log.msg === 'coach reply_content claims intake update without patch',
        );
        assertEquals(warn, undefined);
      },
    );
  },
);

integrationTest('successful coach dispatch records workspace_ai_events success row', async () => {
  await withHarness(
    {
      postgrest: {
        coachTaskResolution: { taskId: TEST_COACH_TARGET_TASK_ID },
      },
      vertex: vertexHappy(COACH_REPLY),
    },
    async ({ rpc }) => {
      const response = await handleDispatchRequest(
        webhookRequest({
          metadata: {
            surface: 'standard_task_chat_rail',
            default_agent_slug: 'coach',
          },
          targetTaskId: TEST_COACH_TARGET_TASK_ID,
        }),
      );
      assertEquals(response.status, 200);
      assertEquals((await readJson(response)).ok, true);

      const rows = rpc.getWorkspaceAiEventInserts();
      assertEquals(rows.length, 1);
      assertEquals(rows[0].workspace_id, TEST_WORKSPACE_ID);
      assertEquals(rows[0].event_type, 'success');
      assertEquals(rows[0].agent_slug, 'coach');
      assertEquals(rows[0].surface, 'standard_task_chat_rail');
      assertEquals(rows[0].prompt_tokens, 101);
      assertEquals(rows[0].completion_tokens, 22);
    },
  );
});

integrationTest(
  'MAX_TOKENS Vertex response records workspace_ai_events error_truncated row',
  async () => {
    await withHarness(
      {
        postgrest: {
          coachTaskResolution: { taskId: TEST_COACH_TARGET_TASK_ID },
        },
        vertex: vertexMaxTokens(),
      },
      async ({ rpc }) => {
        const response = await handleDispatchRequest(
          webhookRequest({
            metadata: {
              surface: 'standard_task_chat_rail',
              default_agent_slug: 'coach',
            },
            targetTaskId: TEST_COACH_TARGET_TASK_ID,
          }),
        );
        assertEquals(response.status, 200);
        const body = await readJson(response);
        assertEquals(body.ok, true);
        assertEquals(body.fallback_reply_inserted, true);

        const rows = rpc.getWorkspaceAiEventInserts();
        assertEquals(rows.length, 1);
        assertEquals(rows[0].workspace_id, TEST_WORKSPACE_ID);
        assertEquals(rows[0].event_type, 'error_truncated');
        assertEquals(rows[0].error_kind, 'truncated');
        assertEquals(rows[0].prompt_tokens, 512);
        assertEquals(rows[0].completion_tokens, 2048);
        assertEquals(rows[0].thoughts_tokens, 128);
      },
    );
  },
);
