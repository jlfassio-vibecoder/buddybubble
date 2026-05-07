# Phase 1 — Shared LLM/dispatch/obs foundations + AgentStrategy contract

> Land the new `_shared/llm`, `_shared/dispatch`, `_shared/obs`, the typed env reader,
> and the strategy interface — **without** wiring any agent yet. No webhook is moved
> in this phase; no behavior changes for users.

## Inputs

- Phase 0 complete (GCP SA + Supabase secrets seeded; `secrets-matrix.md` committed).
- Repo at `main` (or feature branch off `main`) with the three legacy dispatchers
  intact.

## Deliverables

Files to **create**:

1. `supabase/functions/_shared/env.ts`
2. `supabase/functions/_shared/obs/log.ts`
3. `supabase/functions/_shared/llm/types.ts`
4. `supabase/functions/_shared/llm/vertex-auth.ts`
5. `supabase/functions/_shared/llm/vertex-gemini.ts`
6. `supabase/functions/_shared/dispatch/types.ts` (the `AgentStrategy<TParsed>` interface
   and `DispatchContext`)
7. `supabase/functions/_shared/dispatch/webhook.ts` (secret check + payload parse +
   loop guard)
8. `supabase/functions/_shared/dispatch/routing.ts` (mention parser, default-slug parser,
   thread-history loader, "earlier agent in thread" finder, bubble-binding lookup —
   composable, **no agent slugs hardcoded**)
9. `supabase/functions/_shared/dispatch/sentinel.ts` (helpers for slug-agnostic sentinel
   detection: workout-player + onboarding)
10. `supabase/functions/_shared/dispatch/history.ts` (thread fetch + role mapping; both
    `parent_id`-based and `target_task_id`-based queries — Coach uses both today)
11. `supabase/functions/_shared/dispatch/rpc.ts` (typed wrappers for every RPC the
    consolidated dispatcher will invoke; see RPC inventory below)
12. `supabase/functions/_shared/dispatch/fallback.ts` (slug-agnostic safe-reply insert)
13. `src/lib/agents/_shared/dispatch/types.ts` — **same** `AgentStrategy` interface
    re-exported for Vitest. (Or a single source under `src/lib/...` re-exported by the
    Deno path; see "mirror-vs-import" below.)

Files to **modify**:

- `supabase/config.toml` — add a `[functions.agent-dispatch-v2]` block with
  `verify_jwt = false`. Do **not** create the function entry yet (Phase 2 does that).
  Reserving the block in config keeps the same PR atomic when Phase 2 lands.

Files **not** touched in this phase:

- `supabase/functions/bubble-agent-dispatch/index.ts`
- `supabase/functions/buddy-agent-dispatch/index.ts`
- `supabase/functions/organizer-agent-dispatch/index.ts`

## RPC inventory (for `_shared/dispatch/rpc.ts`)

Wrap each as a typed function returning `{ data, error }` plus a parsed envelope.
All are `service_role`-only; the dispatcher is the sole caller.

| RPC                                      | Used by   | Definition                                                                                                                                                    |
| ---------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agent_create_card_and_reply`            | Coach     | `supabase/migrations/20260729120000_agent_rpcs_persist_execution_patch.sql:46`–`:60`                                                                          |
| `agent_insert_coach_workout_draft_reply` | Coach     | Same migration; signature in `supabase/migrations/20260623120000_coach_workout_draft_messages_metadata.sql:43`–`:53` plus `p_execution_patch jsonb` extension |
| `buddy_create_onboarding_reply`          | Buddy     | Existing migration (referenced from `buddy-agent-dispatch/index.ts:545`)                                                                                      |
| `organizer_create_reply_and_task`        | Organizer | Existing migration (referenced from `organizer-agent-dispatch/index.ts:604`)                                                                                  |

Do **not** invoke `apply_workout_draft` from the dispatcher — it is an authenticated
client RPC.

## The `AgentStrategy` interface

Place the canonical definition in `src/lib/agents/_shared/dispatch/types.ts` so Vitest
can import it; the Deno copy in `supabase/functions/_shared/dispatch/types.ts` should
be a `re-export`-only module that pulls from a path Deno can resolve at deploy time
(use a relative import via `../../../../src/lib/agents/_shared/dispatch/types.ts` —
Supabase Edge Functions can resolve relative paths at deploy provided the source files
do not use Node-only globals; if that is a problem, keep a hand-mirrored Deno file and
add the drift-detection lint planned in Phase 7).

```ts
export type AgentSlug = string;

export interface DispatchContext {
  /** Service-role Supabase client. */
  supabase: SupabaseClient;
  /** Stable id for this dispatch attempt (used in every log line). */
  requestId: string;
  /** The trigger row from the webhook payload, normalized. */
  message: NormalizedMessage;
  /** Resolved agent identity (slug, auth_user_id, mention_handle, display_name). */
  agent: ResolvedAgent;
  /** Slack-style thread root id (parent_id || message.id). */
  threadId: string;
  /** Optional thread/task history loaded once by the dispatcher. */
  history: HistoryRow[];
  /** Memoized signal shared across the LLM call(s). */
  signal: AbortSignal;
}

export interface AgentStrategy<TParsed> {
  slug: AgentSlug;
  /** Vertex publisher model id, e.g. 'gemini-2.5-flash'. */
  model: string;
  temperature: number;
  maxOutputTokens: number;
  /** JSON-mode contract, identical shape to today's responseSchema. */
  responseSchema: VertexResponseSchema;

  /**
   * Optional pre-flight. Return null to proceed with the normal flow, or an action
   * descriptor to short-circuit (e.g. Coach's workout-player silent greeting path).
   */
  preflight?(ctx: DispatchContext): Promise<PreflightAction | null>;

  /** Build the full system prompt from server-side context. */
  buildSystemPrompt(ctx: DispatchContext): Promise<string>;

  /** Build the contents array (history + this turn). */
  buildContents(ctx: DispatchContext): Promise<GeminiContent[]>;

  /** Validate + normalize parsed JSON; throws on shape errors. */
  parse(json: unknown, ctx: DispatchContext): TParsed;

  /** Server policy that overrides model output (e.g. Coach Layer B turn gate). */
  applyServerGuards?(parsed: TParsed, ctx: DispatchContext): TParsed;

  /** Persist via the strategy's chosen RPC; returns the RPC envelope. */
  persist(parsed: TParsed, ctx: DispatchContext): Promise<RpcEnvelope>;

  /** Optional: how this strategy answers "should I respond at all?" */
  routing?: RoutingDescriptor;

  /** Strategy-specific safe-reply text used by the fallback path. */
  safeReplyText: string;
}
```

`PreflightAction` covers Coach's workout-player branch:

```ts
export type PreflightAction =
  | {
      kind: 'short_circuit_with_reply';
      replyText: string;
      rpc: 'agent_create_card_and_reply';
      rpcArgs: Partial<AgentCreateCardArgs>;
    }
  | { kind: 'skip'; reason: string };
```

`RoutingDescriptor` lets each strategy declare which routing rules it opts into so
`agent-dispatch` does not need slug-specific branches:

```ts
export interface RoutingDescriptor {
  /** Match this slug on @mention parse. Default: true. */
  acceptMention: boolean;
  /** Match when message.metadata.default_agent_slug === this slug. */
  acceptRootDefault: boolean;
  /** Match when an earlier message in the thread was authored by this agent. */
  acceptThreadContinuation: boolean;
  /** Slugs that, when @mentioned, mean "do not run this strategy". */
  excludeOnMentionOf?: AgentSlug[];
  /** Cheap content predicate that triggers this strategy without @mention. */
  implicitTrigger?: (msg: NormalizedMessage) => boolean;
  /** Require the agent to be bound to the bubble via bubble_agent_bindings. */
  requireBubbleBinding: boolean;
}
```

## Vertex auth + client (file sketches)

### `_shared/llm/vertex-auth.ts`

- Parse SA JSON from `GCP_SERVICE_ACCOUNT_JSON` once at module load (cache the parsed
  object).
- Build a JWT `{ iss: client_email, scope: 'https://www.googleapis.com/auth/cloud-platform',
aud: 'https://oauth2.googleapis.com/token', exp: now + 3600, iat: now }`.
- Sign with RS256 using `crypto.subtle.importKey` + `crypto.subtle.sign`.
- POST to `https://oauth2.googleapis.com/token` with
  `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=<jwt>`.
- Cache `access_token` in module scope until `expiry - 60s`.

### `_shared/llm/vertex-gemini.ts`

- Endpoint:
  `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/${model}:generateContent`.
- Body shape **identical** to the Generative Language API today; see
  `bubble-agent-dispatch/index.ts:694`–`:862`. Vertex publisher API accepts `system_instruction`,
  `contents`, `generationConfig.responseMimeType`, `generationConfig.responseSchema`.
- Retry policy:
  - Retry on `429`, `500`, `502`, `503`, `504` up to 2 retries with jitter (200ms, 700ms).
  - No retry on `400`, `401`, `403`, `404`.
  - No retry on `AbortError` / timeout; surface as classified `{ kind: 'timeout' }`.
- Total budget: `LLM_TIMEOUT_MS` (default 25_000) shared across all attempts via one
  `AbortController` started at request top.
- Returns parsed JSON conforming to schema, or throws a discriminated union
  `{ kind: 'http' | 'parse' | 'shape' | 'timeout' | 'auth', status?, body? }`.
- Reuse `extractGeminiText` (multi-part-aware) — port from
  `bubble-agent-dispatch/index.ts:658`–`:668`.

### `_shared/llm/types.ts`

Pure Vertex / Gemini types: `GeminiContent`, `VertexResponseSchema`, `VertexGenerateRequest`,
`VertexGenerateResponse`, `VertexErrorKind`. Mirror the existing shapes so Coach's
schema literal can be lifted across with no edits.

## `_shared/dispatch/webhook.ts`

Single function `verifyAndParseWebhook(req): { ok: true, payload, requestId } | { ok: false, response }`:

- Reject non-POST → HTTP 200 `{ ok: false, error: 'method_not_allowed' }` (preserve
  legacy contract; see `bubble-agent-dispatch/index.ts:1267`).
- Read `AGENT_WEBHOOK_SECRET`; reject unauthorized → HTTP 200
  `{ ok: false, error: 'unauthorized' }` (legacy contract at `:1286`).
- Parse JSON; reject `not_messages_insert` and `missing_record_fields` as HTTP 200
  skips (legacy contract at `:1299` and `:1304`).
- Generate a `requestId` (`crypto.randomUUID()`) for the structured logger.

## `_shared/dispatch/routing.ts`

Export pure helpers — **no slug strings inside**:

```ts
export function mentionsHandle(content: string | null | undefined, handle: string): boolean;
export function parseRootDefaultAgentSlug(record: NormalizedMessage): string | null;
export function findFirstMentionedAgent(content: string, agents: AgentDef[]): AgentDef | null;
export function findAuthoringAgentInThread(
  rows: HistoryRow[],
  agentAuthIds: Set<string>,
): AgentDef | null;
export async function bubbleHasBindingForSlug(supabase, bubbleId, slug): Promise<boolean>;
```

Port `mentionsHandle` from `buddy-agent-dispatch/index.ts:99`–`:114` (the regex-escape
version) so the case-insensitive, word-bounded match continues to work for any
`mention_handle`.

## `_shared/dispatch/sentinel.ts`

Slug-agnostic primitives. Strategies wire them in via `routing.implicitTrigger`:

```ts
export const ONBOARDING_SYSTEM_EVENT = '[SYSTEM_EVENT: ONBOARDING_STARTED]';

export function isExactSentinel(message: NormalizedMessage, sentinel: string): boolean;

/**
 * Workout-player metadata sentinel detection (preserves the metadata-first contract
 * documented at bubble-agent-dispatch/index.ts:119–:126 with legacy magic-string fallback).
 */
export function isWorkoutContextSentinel(message: NormalizedMessage): boolean;
export function shouldExcludeWorkoutSentinelFromHistory(row: HistoryRow): boolean;
```

## `_shared/dispatch/history.ts`

Two loaders (Coach uses both today; the dispatcher picks one based on the trigger row):

```ts
export async function loadThreadHistoryByParent(
  supabase: SupabaseClient,
  bubbleId: string,
  triggerId: string,
  threadId: string,
  limit: number,
): Promise<HistoryRow[]>;

export async function loadThreadHistoryByTargetTask(
  supabase: SupabaseClient,
  bubbleId: string,
  triggerId: string,
  taskId: string,
  limit: number,
): Promise<HistoryRow[]>;

/** Map history rows + agent auth ids into Vertex `contents` array (oldest → newest). */
export function toGeminiContents(rows: HistoryRow[], agentAuthIds: Set<string>): GeminiContent[];
```

Reference: `bubble-agent-dispatch/index.ts:1421`–`:1438` (the `if record.target_task_id` branch).

## `_shared/dispatch/fallback.ts`

```ts
export async function insertSafeReply(
  supabase: SupabaseClient,
  ctx: DispatchContext,
  text: string,
): Promise<RpcEnvelope>;
```

Always uses `agent_create_card_and_reply` with `p_create_card: false` and
`p_execution_patch: null` — the universal "reply only" path, identical to
`bubble-agent-dispatch/index.ts:1741`–`:1752`. Strategies that want a different fallback
RPC (Buddy, Organizer) override by passing their own RPC name in a future overload.
For Phase 1, the universal path is sufficient because Coach is the first agent ported.

## `_shared/obs/log.ts`

```ts
export type LogLevel = 'info' | 'warn' | 'error';
export interface LogFields {
  request_id: string;
  slug?: string;
  message_id?: string;
  bubble_id?: string;
  phase?:
    | 'received'
    | 'routed'
    | 'preflight'
    | 'llm_call'
    | 'llm_done'
    | 'parsed'
    | 'guarded'
    | 'persisted'
    | 'fallback'
    | 'done';
  model?: string;
  latency_ms?: number;
  http_status?: number;
  retry_count?: number;
  token_in?: number;
  token_out?: number;
  error_kind?: string;
}
export function log(level: LogLevel, msg: string, fields: LogFields): void;
```

`log` writes one JSON object per line via `console.log` so Supabase Logs and Cloud
Logging both ingest cleanly.

## `_shared/env.ts`

Single typed reader, fail-fast at boot:

```ts
export function readDispatcherEnv(): {
  supabaseUrl: string;
  serviceRoleKey: string;
  webhookSecret: string;
  gcpProjectId: string;
  gcpLocation: string;
  gcpServiceAccountJson: string;
  llmTimeoutMs: number;
  llmDebug: boolean;
};
```

Throws a single descriptive error listing every missing var; the dispatcher catches
it and returns 500 once at boot (the only legitimate 500).

## Verification

This phase ships **no behavior change**. Verification is:

- `pnpm tsc --noEmit` (or whatever the existing CI invokes) passes.
- New files exist at the listed paths.
- `supabase functions list` is unchanged (no new function deployed yet).
- `_shared` modules have no `Deno.serve` import; they are libraries only.
- A Vitest test file under `src/lib/agents/_shared/dispatch/types.test.ts` imports
  `AgentStrategy` and asserts the type compiles (smoke test the import path).

## Risk + rollback

- Adding files under `_shared/` cannot affect runtime; the existing dispatchers do not
  import them.
- Rollback: revert the PR. No DB or secret state changes.

## Hand-off to next phase

Phase 2 expects:

- `_shared/llm`, `_shared/dispatch`, `_shared/obs`, and `_shared/env.ts` available.
- `AgentStrategy<TParsed>` and `DispatchContext` exported and importable from both
  `supabase/functions/_shared/dispatch/types.ts` and `src/lib/agents/_shared/dispatch/types.ts`.
- `[functions.agent-dispatch-v2] verify_jwt = false` reserved in `supabase/config.toml`
  (or added in Phase 2's PR; document the choice in the Phase 1 PR description either way).
