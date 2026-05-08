/**
 * Supabase PostgREST + RPC fixtures for the `agent-dispatch` integration tests.
 */

import { jsonResponse, type MockFetchRouter } from './fetch-router.ts';

export const TEST_SUPABASE_URL = 'http://127.0.0.1:54321';
export const TEST_SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
export const TEST_AGENT_WEBHOOK_SECRET = 'test-agent-webhook-secret';

export const TEST_BUBBLE_ID = '00000000-0000-4000-8000-000000000001';
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
};

export type PostgrestFixtureHarness = {
  rpcCalls: RpcCall[];
  getRpcCalls: (name?: string) => RpcCall[];
  setRpcResponse: (name: string, response: RpcResponse) => void;
  resetRpcCalls: () => void;
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
  const rpcResponses: Record<string, RpcResponse> = { ...(options.rpcResponses ?? {}) };
  const boundSlugs = options.boundSlugs ?? ['coach'];
  const rootHistoryRows = options.rootHistoryRows ?? [];

  router
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
      'postgrest:messages-history',
      (_req, call) => call.method === 'GET' && isRestPath(call.url, 'messages'),
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
  };
}
