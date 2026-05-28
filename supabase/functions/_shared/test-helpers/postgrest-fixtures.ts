/**
 * Supabase PostgREST + RPC fixtures for the `agent-dispatch` integration tests.
 */

import { jsonResponse, type MockFetchRouter } from './fetch-router.ts';

export const TEST_SUPABASE_URL = 'http://127.0.0.1:54321';
export const TEST_SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
export const TEST_AGENT_WEBHOOK_SECRET = 'test-agent-webhook-secret';

export const TEST_BUBBLE_ID = '00000000-0000-4000-8000-000000000001';
export const TEST_WORKSPACE_ID = '00000000-0000-4000-8000-000000000010';
export const TEST_USER_ID = '00000000-0000-4000-8000-000000000002';
export const TEST_AGENT_AUTHOR_ID = '00000000-0000-4000-8000-000000000003';

export const TEST_AGENT_AUTH_USER_IDS = {
  coach: '00000000-0000-4000-8000-000000000101',
  organizer: '00000000-0000-4000-8000-000000000102',
  buddy: '00000000-0000-4000-8000-000000000103',
} as const;

type AgentSlug = keyof typeof TEST_AGENT_AUTH_USER_IDS;

type RpcResponse = {
  status?: number;
  body: unknown;
};

export type RpcCall = {
  name: string;
  args: Record<string, unknown>;
};

export type InstallPostgrestOptions = {
  loopGuardMatches?: boolean;
  boundSlugs?: AgentSlug[];
  rpcResponses?: Record<string, RpcResponse>;
  rootHistoryRows?: Array<Record<string, unknown>>;
  /** When true, bubble workspace lookup returns null (telemetry skip path). */
  bubbleWorkspaceIdNull?: boolean;
  /**
   * When set, mocks GET `/rest/v1/tasks` for `taskIdInBubble` (`select=id`) and
   * `loadCurrentTaskContext` (`select` includes `title`).
   */
  coachTaskResolution?: {
    taskId: string;
    bubbleId?: string;
    title?: string;
    description?: string | null;
    metadata?: unknown;
    item_type?: string | null;
  };
};

export type PostgrestFixtureHarness = {
  rpcCalls: RpcCall[];
  getRpcCalls: (name?: string) => RpcCall[];
  setRpcResponse: (name: string, response: RpcResponse) => void;
  resetRpcCalls: () => void;
  workspaceAiEventInserts: Array<Record<string, unknown>>;
  getWorkspaceAiEventInserts: () => Array<Record<string, unknown>>;
  resetWorkspaceAiEventInserts: () => void;
};

const DEFAULT_RPC_RESPONSE: RpcResponse = {
  body: {
    ok: true,
    data: {
      message_id: '00000000-0000-4000-8000-000000000301',
      reply_message_id: '00000000-0000-4000-8000-000000000302',
      created_task_id: '00000000-0000-4000-8000-000000000303',
      deduped: false,
    },
  },
};

function urlOf(raw: string): URL {
  return new URL(raw);
}

function isRestPath(raw: string, path: string): boolean {
  const url = urlOf(raw);
  return url.origin === TEST_SUPABASE_URL && url.pathname === `/rest/v1/${path}`;
}

function selectParam(raw: string): string {
  return urlOf(raw).searchParams.get('select') ?? '';
}

/**
 * supabase-js strips whitespace from `select` column lists when serializing the URL
 * (so `'id, user_id, content'` becomes `select=id%2Cuser_id%2Ccontent`). Tests
 * express expected columns with the same spaced format as the loader source for
 * readability; this comparator normalizes whitespace on both sides so the match
 * holds against the actual on-the-wire URL. See
 * `supabase/functions/_shared/dispatch/history.ts:HISTORY_COLUMNS`.
 */
function selectMatches(raw: string, expected: string): boolean {
  const normalize = (s: string) => s.replace(/\s+/g, '');
  return normalize(selectParam(raw)) === normalize(expected);
}

function hasQueryParam(raw: string, name: string): boolean {
  return urlOf(raw).searchParams.has(name);
}

function queryParam(raw: string, name: string): string {
  return urlOf(raw).searchParams.get(name) ?? '';
}

function isMessagesHistoryBase(raw: string): boolean {
  return (
    isRestPath(raw, 'messages') &&
    hasQueryParam(raw, 'bubble_id') &&
    hasQueryParam(raw, 'id') &&
    queryParam(raw, 'order') === 'created_at.desc'
  );
}

function isThreadHistoryQuery(raw: string): boolean {
  return (
    isMessagesHistoryBase(raw) &&
    selectMatches(
      raw,
      'id, user_id, content, created_at, parent_id, target_task_id, attached_task_id, metadata',
    ) &&
    hasQueryParam(raw, 'or') &&
    queryParam(raw, 'limit') === '50'
  );
}

function isTargetTaskHistoryQuery(raw: string): boolean {
  const lim = Number(queryParam(raw, 'limit'));
  return (
    isMessagesHistoryBase(raw) &&
    selectMatches(
      raw,
      'id, user_id, content, created_at, parent_id, target_task_id, attached_task_id, metadata',
    ) &&
    hasQueryParam(raw, 'target_task_id') &&
    Number.isFinite(lim) &&
    lim > 0
  );
}

function isPriorBubbleMessageQuery(raw: string): boolean {
  return (
    isMessagesHistoryBase(raw) &&
    selectMatches(raw, 'id, user_id') &&
    queryParam(raw, 'limit') === '2'
  );
}

function isOrganizerRootHistoryQuery(raw: string): boolean {
  return (
    isMessagesHistoryBase(raw) &&
    selectMatches(
      raw,
      'id, user_id, content, created_at, parent_id, target_task_id, attached_task_id, metadata',
    ) &&
    queryParam(raw, 'limit') === '10'
  );
}

function isBuddyRootHistoryQuery(raw: string): boolean {
  return (
    isMessagesHistoryBase(raw) &&
    selectMatches(raw, 'id, user_id, content, created_at, parent_id') &&
    queryParam(raw, 'limit') === '12'
  );
}

function agentDefinitionRows() {
  return [
    {
      slug: 'coach',
      display_name: 'Coach',
      mention_handle: 'coach',
      auth_user_id: TEST_AGENT_AUTH_USER_IDS.coach,
      is_active: true,
    },
    {
      slug: 'organizer',
      display_name: 'Organizer',
      mention_handle: 'organizer',
      auth_user_id: TEST_AGENT_AUTH_USER_IDS.organizer,
      is_active: true,
    },
    {
      slug: 'buddy',
      display_name: 'Buddy',
      mention_handle: 'buddy',
      auth_user_id: TEST_AGENT_AUTH_USER_IDS.buddy,
      is_active: true,
    },
  ];
}

function bindingRows(boundSlugs: AgentSlug[]) {
  return boundSlugs.map((slug, index) => ({
    sort_order: index,
    agent_definitions: { slug },
  }));
}

export function installPostgrestRoutes(
  router: MockFetchRouter,
  options: InstallPostgrestOptions = {},
): PostgrestFixtureHarness {
  const rpcCalls: RpcCall[] = [];
  const workspaceAiEventInserts: Array<Record<string, unknown>> = [];
  const rpcResponses: Record<string, RpcResponse> = { ...(options.rpcResponses ?? {}) };
  const boundSlugs = options.boundSlugs ?? ['coach'];
  const rootHistoryRows = options.rootHistoryRows ?? [];
  const coachTask = options.coachTaskResolution;

  if (coachTask) {
    router.route(
      'postgrest:tasks-coach-context',
      (_req, call) =>
        call.method === 'GET' &&
        isRestPath(call.url, 'tasks') &&
        call.url.includes(coachTask.taskId),
      (_req, call) => {
        const sel = selectParam(call.url);
        if (sel === 'id') {
          // PostgREST returns a JSON array of rows; supabase-js expects that shape.
          return jsonResponse([{ id: coachTask.taskId }]);
        }
        return jsonResponse([
          {
            title: coachTask.title ?? 'Test workout',
            description: coachTask.description ?? '',
            metadata: coachTask.metadata ?? {},
            item_type: coachTask.item_type ?? 'workout',
          },
        ]);
      },
    );
  }

  router
    .route(
      'postgrest:bubbles-workspace',
      (_req, call) =>
        call.method === 'GET' &&
        isRestPath(call.url, 'bubbles') &&
        selectParam(call.url).includes('workspace_id'),
      () =>
        jsonResponse({
          workspace_id: options.bubbleWorkspaceIdNull ? null : TEST_WORKSPACE_ID,
        }),
    )
    .route(
      'postgrest:workspace-ai-events-insert',
      (_req, call) => call.method === 'POST' && isRestPath(call.url, 'workspace_ai_events'),
      (_req, call) => {
        const parsed = call.bodyText
          ? (JSON.parse(call.bodyText) as Record<string, unknown> | Record<string, unknown>[])
          : null;
        const rows = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
        workspaceAiEventInserts.push(...rows);
        return jsonResponse(null, 201);
      },
    )
    .route(
      'postgrest:loop-guard-agent-definitions',
      (_req, call) =>
        call.method === 'GET' &&
        isRestPath(call.url, 'agent_definitions') &&
        selectParam(call.url) === 'id' &&
        urlOf(call.url).searchParams.has('auth_user_id'),
      () =>
        jsonResponse(
          options.loopGuardMatches ? { id: '00000000-0000-4000-8000-000000000401' } : null,
        ),
    )
    .route(
      'postgrest:resolver-agent-definitions',
      (_req, call) =>
        call.method === 'GET' &&
        isRestPath(call.url, 'agent_definitions') &&
        selectParam(call.url).includes('slug') &&
        urlOf(call.url).searchParams.has('slug') &&
        urlOf(call.url).searchParams.has('is_active'),
      () => jsonResponse(agentDefinitionRows()),
    )
    .route(
      'postgrest:bubble-agent-bindings',
      (_req, call) =>
        call.method === 'GET' &&
        isRestPath(call.url, 'bubble_agent_bindings') &&
        selectParam(call.url).includes('agent_definitions'),
      () => jsonResponse(bindingRows(boundSlugs)),
    )
    .route(
      'postgrest:messages-thread-history',
      (_req, call) => call.method === 'GET' && isThreadHistoryQuery(call.url),
      () => jsonResponse(rootHistoryRows),
    )
    .route(
      'postgrest:messages-target-task-history',
      (_req, call) => call.method === 'GET' && isTargetTaskHistoryQuery(call.url),
      () => jsonResponse(rootHistoryRows),
    )
    .route(
      'postgrest:messages-prior-bubble-author',
      (_req, call) => call.method === 'GET' && isPriorBubbleMessageQuery(call.url),
      () => jsonResponse(rootHistoryRows),
    )
    .route(
      'postgrest:messages-organizer-root-history',
      (_req, call) => call.method === 'GET' && isOrganizerRootHistoryQuery(call.url),
      () => jsonResponse(rootHistoryRows),
    )
    .route(
      'postgrest:messages-buddy-root-history',
      (_req, call) => call.method === 'GET' && isBuddyRootHistoryQuery(call.url),
      () => jsonResponse(rootHistoryRows),
    )
    .route(
      'postgrest:rpc',
      (_req, call) =>
        call.method === 'POST' && urlOf(call.url).pathname.startsWith('/rest/v1/rpc/'),
      (_req, call) => {
        const name = urlOf(call.url).pathname.split('/').pop() ?? 'unknown_rpc';
        const args = call.bodyText ? (JSON.parse(call.bodyText) as Record<string, unknown>) : {};
        rpcCalls.push({ name, args });
        const response = rpcResponses[name] ?? DEFAULT_RPC_RESPONSE;
        return jsonResponse(response.body, response.status ?? 200);
      },
    );

  return {
    rpcCalls,
    getRpcCalls: (name?: string) =>
      name ? rpcCalls.filter((call) => call.name === name) : [...rpcCalls],
    setRpcResponse: (name, response) => {
      rpcResponses[name] = response;
    },
    resetRpcCalls: () => {
      rpcCalls.length = 0;
    },
    workspaceAiEventInserts,
    getWorkspaceAiEventInserts: () => [...workspaceAiEventInserts],
    resetWorkspaceAiEventInserts: () => {
      workspaceAiEventInserts.length = 0;
    },
  };
}
