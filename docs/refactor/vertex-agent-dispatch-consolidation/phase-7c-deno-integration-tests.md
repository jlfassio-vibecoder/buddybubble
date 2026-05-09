# Phase 7c — Deno integration test suite for `agent-dispatch`

> The Final Boss of the consolidation. Final modular Phase 7 deliverable.
> Independent of Phases 7a (linters) and 7b (observability) — can land at any
> time after Phase 6 cutover.

## Goal

Programmatically prove the dispatcher's retry, fallback, parse-error, and
short-circuit paths work end-to-end without ever touching the live Vertex
publisher API or a real PostgREST endpoint.

The unit-test suite under `src/lib/agents/<slug>/parse.test.ts` already covers
each strategy's pure logic (parser quirks, schema shape, server guards). What
they cannot cover — and what this suite will — is the **plumbing** in
[`supabase/functions/agent-dispatch/index.ts`](../../../supabase/functions/agent-dispatch/index.ts):

1. Webhook auth + envelope parsing.
2. Loop guard (author-is-agent skip).
3. Routing → strategy resolution.
4. Vertex `generateContent` retry/backoff on 429 / 5xx.
5. Strategy `parse` failures → classified `parse` / `shape` errors.
6. Fallback eligibility → `insertSafeReply` (or strategy-specific
   `safeReplyInsert` for Buddy).
7. Structured-log envelope per phase.

If any of those regress, this suite catches it before deploy.

## Inputs

- Phase 6 merged. `agent-dispatch` is the only dispatcher function.
- Phase 7a merged. Schema/prompt/parser drift and mirror parity are CI-enforced
  invariants the integration tests can rely on.
- Phase 7b merged. Structured logging contract from
  [`_shared/obs/log.ts`](../../../supabase/functions/_shared/obs/log.ts) is
  stable and the [observability playbook](../../agents/observability.md)
  documents the per-phase log envelope the integration tests will assert on.
- `deno --version` ≥ 2.x already in use (per
  [`scripts/check-agent-mirror-parity.ts`](../../../scripts/check-agent-mirror-parity.ts)
  parity runs). Confirmed locally as `deno 2.7.14`.

## Deliverables

| File                                                                                                | Purpose                                                                                                                                                                                                            |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`supabase/functions/agent-dispatch/index.ts`](../../../supabase/functions/agent-dispatch/index.ts) | **Production entry**: slimmed down to `import { handleDispatchRequest } from './handler.ts'; Deno.serve(handleDispatchRequest);` so the deploy contract is "import + serve" with no guards.                        |
| `supabase/functions/agent-dispatch/handler.ts` (NEW)                                                | **Surgical extraction**: holds the entire dispatch pipeline as an exported `handleDispatchRequest(req): Promise<Response>`. Imported by both `index.ts` (production) and the integration test.                     |
| `supabase/functions/agent-dispatch/index.integration.test.ts` (NEW)                                 | The 10 integration scenarios (8 dispatcher branches + Organizer + Buddy happy paths) + log-envelope assertions; ~700 lines.                                                                                        |
| `supabase/functions/_shared/test-helpers/fetch-router.ts` (NEW)                                     | Deno-only `MockFetchRouter` — registers URL-pattern handlers, swaps `globalThis.fetch`, records call ledger. ~150 lines.                                                                                           |
| `supabase/functions/_shared/test-helpers/postgrest-fixtures.ts` (NEW)                               | Canned PostgREST responses for `agent_definitions`, `bubble_agent_bindings`, `messages`, plus an RPC capture/replay shim. ~200 lines.                                                                              |
| `supabase/functions/_shared/test-helpers/vertex-fixtures.ts` (NEW)                                  | Canned `generateContent` responses (200-happy, 429-then-200, 500/500/500, malformed-JSON, shape-violating-JSON) and a stub for the Google OAuth token endpoint. ~120 lines.                                        |
| `supabase/functions/_shared/test-helpers/log-capture.ts` (NEW)                                      | Swap `console.log`; parse each emitted JSON line; expose `findLog(predicate)` + `phaseSequence()`. ~60 lines.                                                                                                      |
| [`package.json`](../../../package.json)                                                             | New `test:deno-integration` script (runs `deno test --allow-env --allow-read --node-modules-dir=auto --no-check supabase/functions/agent-dispatch/*.integration.test.ts`). Chained into `pnpm check` after ESLint. |
| [`docs/refactor/vertex-agent-dispatch-consolidation/README.md`](./README.md)                        | Add `phase-7c-deno-integration-tests.md` to the index.                                                                                                                                                             |

**Total surface:** 2 production files touched (`index.ts` slimmed to a Deno
serve entry; new `handler.ts` holds the dispatch pipeline — export-only, no
behavior change), 4 new test-only modules, 1 new test file, 1 `package.json`
script, 1 README link.

## Production refactor — `handler.ts` split

The dispatcher today wraps the entire pipeline inside an inline async function
passed to `Deno.serve`. That's correct for production, but tests can't import
the module without `Deno.serve` actually starting a listener.

**Smallest possible change** — extract the inline body verbatim into a new
`handler.ts` module that exports `handleDispatchRequest`, and slim `index.ts`
down to "import + serve":

```ts
// supabase/functions/agent-dispatch/handler.ts (NEW, Phase 7c)

export async function handleDispatchRequest(req: Request): Promise<Response> {
  const dispatchStartedAt = Date.now();
  // … entire dispatcher pipeline, moved verbatim from the previous index.ts …
}
```

```ts
// supabase/functions/agent-dispatch/index.ts (Phase 7c, production entry)

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { handleDispatchRequest } from './handler.ts';

Deno.serve(handleDispatchRequest);
```

**Why split into two files instead of guarding `Deno.serve` with
`import.meta.main`.** Supabase's Edge runtime sometimes imports the entry
module with `import.meta.main = false` during the bundle/serve handshake.
Wrapping the call in `if (import.meta.main) Deno.serve(...)` would silently
leave the deployed function with no registered handler. Splitting the handler
into `handler.ts` lets tests import the function directly while `index.ts`
unconditionally registers `Deno.serve` for every Supabase deploy.

No env reads happen at module load (already true today —
`readDispatcherEnv()` is called inside the handler). The integration test
`import { handleDispatchRequest } from './handler.ts'` and calls it with
synthetic `Request` objects. Production behavior is unchanged because
`Deno.serve(handleDispatchRequest)` and
`Deno.serve(async (req) => handleDispatchRequest(req))` produce identical
runtime behavior.

This is the only Phase 7c change that touches production files. Every other
deliverable is test-only.

## Test architecture

### Layered mocks

The dispatcher reaches three external boundaries during a single request:

| Boundary                    | Calls go through   | Mock approach                                                                                                                                                                              |
| --------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Supabase PostgREST + RPC    | `globalThis.fetch` | `MockFetchRouter` route by URL prefix + method, return canned JSON.                                                                                                                        |
| Google OAuth token endpoint | `globalThis.fetch` | `MockFetchRouter` route on `https://oauth2.googleapis.com/token` — return `{ access_token: 'fake', expires_in: 3600, token_type: 'Bearer' }`.                                              |
| Vertex `:generateContent`   | `globalThis.fetch` | `MockFetchRouter` route on `https://*-aiplatform.googleapis.com/v1/projects/*/...:generateContent` — returns the per-scenario canned response (200, 429, 500, malformed, shape-violating). |

**Why route-by-fetch (not module mocking):** Deno cannot intercept JSR / HTTPS
imports at runtime, and the `createClient` instance buries its own `fetch`
inside the JSR module. Routing all `fetch` calls through `MockFetchRouter`
catches both PostgREST traffic AND Vertex traffic in one swap, with zero
production code changes.

### `MockFetchRouter` API sketch

```ts
type RouteHandler = (req: Request) => Promise<Response> | Response;

class MockFetchRouter {
  private routes: Array<{ match: (req: Request) => boolean; handler: RouteHandler }> = [];
  private calls: Array<{ url: string; method: string; bodyText: string | null }> = [];
  private originalFetch: typeof globalThis.fetch | null = null;

  route(predicate: (req: Request) => boolean, handler: RouteHandler): this { … }
  routePost(urlPattern: RegExp, handler: RouteHandler): this { … }
  routeGet(urlPattern: RegExp, handler: RouteHandler): this { … }

  install(): void {
    this.originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const req = new Request(input, init);
      this.calls.push({ url: req.url, method: req.method, bodyText: await req.clone().text() });
      for (const { match, handler } of this.routes) {
        if (match(req)) return handler(req);
      }
      throw new Error(`MockFetchRouter: no route for ${req.method} ${req.url}`);
    };
  }

  restore(): void { /* reset globalThis.fetch */ }

  callsMatching(predicate: (call) => boolean): typeof this.calls { … }
  reset(): void { /* clear ledger */ }
}
```

Tests use `using router = installRouter(...)` (Deno's explicit-resource-management)
or a plain `try { … } finally { router.restore(); }`.

### `postgrest-fixtures.ts`

Canned 200 responses for the three resolver / context queries:

| Table                        | Verb                        | Canned response                                                                                                              |
| ---------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `agent_definitions`          | GET (eq author_id)          | `{ data: null }` (loop guard miss — author is a normal user) OR `{ data: { id: '<uuid>' } }` (loop-guard-positive scenario). |
| `agent_definitions`          | GET (in slug, eq is_active) | Three rows for coach / organizer / buddy with stable fixture `auth_user_id`s.                                                |
| `bubble_agent_bindings`      | GET                         | One row binding `coach` to the test bubble at `sort_order = 0`.                                                              |
| `messages`                   | GET (history)               | Empty array (single-trigger conversation).                                                                                   |
| RPCs (`/rest/v1/rpc/<name>`) | POST                        | Captured into `rpcCalls[]`; default returns `{ data: { ok: true, message_id: '<uuid>' } }`.                                  |

Helpers exported:

- `installPostgrestRoutes(router, opts)` — opts let scenarios flip a single
  fixture (e.g. `loopGuardMatches: true`, `bindingsEmpty: true`).
- `getRpcCalls()` / `resetRpcCalls()` — assertion handles for "RPC called once
  with these args".
- `setRpcResponse(rpcName, response)` — for the rare scenario that asserts
  the dispatcher correctly handles an RPC error envelope.

### `vertex-fixtures.ts`

Canned response factories (each returns a `RouteHandler`):

| Helper                           | What it sends back                                                                                                                                           |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `vertexHappy(parsedJson)`        | HTTP 200 with `{ candidates: [{ content: { parts: [{ text: JSON.stringify(parsedJson) }] } }], usageMetadata: { promptTokenCount, candidatesTokenCount } }`. |
| `vertex429ThenHappy(parsedJson)` | First call 429 with `Retry-After: 1`; second call returns `vertexHappy`. State held in a closure counter.                                                    |
| `vertex500Always()`              | HTTP 500 every time (exhausts both retries → throws `VertexClassifiedError`).                                                                                |
| `vertexMalformedJson()`          | HTTP 200, body text is `not even close to json {{`. Triggers `parse` classification in `parseCoachJson`.                                                     |
| `vertexShapeViolating()`         | HTTP 200, valid JSON but missing a required key (e.g. `reply_content`). Triggers `shape` classification.                                                     |
| `googleOAuthHappy()`             | Stub for `https://oauth2.googleapis.com/token` (returns fake bearer).                                                                                        |
| `googleOAuthAuthError()`         | Stub returning HTTP 401 — used by the `auth` scenario.                                                                                                       |

Each helper bumps an internal call counter the test can assert on
(`expect(vertexCallCount()).toBe(2)` for the 429-retry case).

### `log-capture.ts`

```ts
export type CapturedLog = { level: string; msg: string; phase?: string; [k: string]: unknown };

export function captureLogs(): {
  logs: CapturedLog[];
  restore: () => void;
  phaseSequence: () => string[];
  findLog: (predicate: (l: CapturedLog) => boolean) => CapturedLog | undefined;
};
```

Implementation: swap `console.log`; on each call, attempt `JSON.parse(line)`
and push the result if it parsed and has `ns === 'agent-dispatch'`; otherwise
keep the raw line for debug-only assertions.

### Synthetic webhook builder

```ts
export function buildWebhookRequest(opts: {
  secret: string;
  record: Partial<NormalizedMessage> & { id: string; user_id: string };
}): Request;
```

Returns a `POST /` `Request` with the canonical
`{ type: 'INSERT', schema: 'public', table: 'messages', record }` envelope and
the `x-agent-secret` header set. Default `record.bubble_id` is the fixture
bubble; default `content` is `'@coach what should I do today?'` to drive the
mention-routing path.

## Scenario matrix

Each row is one `Deno.test(...)` block. All ten scenarios share the same
boilerplate (install router, install logs, build webhook, call handler) and
differ only in `vertex-fixtures` choice, fixture configuration, and
assertions.

| #   | Name                                | Vertex stub                   | Expected status | Expected RPC                                             | Expected phases                                                       | Other assertions                                                                                                                      |
| --- | ----------------------------------- | ----------------------------- | --------------- | -------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `unauthorized webhook`              | n/a (never called)            | 200             | none                                                     | none (returns before `webhook received`)                              | Body `{ ok: false, error: 'unauthorized' }`. Vertex 0 calls.                                                                          |
| 2   | `loop guard skips agent author`     | n/a                           | 200             | none                                                     | `received` then loop guard skip log line                              | Body `{ ok: true, skipped: 'author_is_agent' }`. Vertex 0.                                                                            |
| 3   | `happy coach mention`               | `vertexHappy(coachReply)`     | 200             | `agent_create_card_and_reply` ×1                         | `received → routed → llm_call → llm_done → parsed → persisted → done` | `dispatch done` carries `latency_ms: number`. `slug = 'coach'` on every log line from `routed` onward.                                |
| 4   | `429 then 200`                      | `vertex429ThenHappy(...)`     | 200             | `agent_create_card_and_reply` ×1                         | Same as #3                                                            | Vertex called 2×; `llm done` `latency_ms` ≥ 200ms (retry delay).                                                                      |
| 5   | `500 / 500 / 500 → fallback`        | `vertex500Always()`           | 200             | `agent_create_card_and_reply` ×1 (the safe-reply insert) | `… → fallback`                                                        | Body `{ ok: true, fallback_reply_inserted: true, … }`. RPC arg `p_create_card === false`. `error_kind: 'http'` in fallback log.       |
| 6   | `malformed JSON → fallback`         | `vertexMalformedJson()`       | 200             | safe-reply RPC ×1                                        | `… → llm_done → fallback`                                             | `error_kind: 'parse'`.                                                                                                                |
| 7   | `schema-shape violation → fallback` | `vertexShapeViolating()`      | 200             | safe-reply RPC ×1                                        | `… → llm_done → parsed → fallback` (parse succeeds; guards reject)    | `error_kind: 'shape'`.                                                                                                                |
| 8   | `vertex auth fails → fallback`      | OAuth 401, Vertex never hit   | 200             | safe-reply RPC ×1                                        | `… → llm_call → fallback` with `vertex auth failed` error log         | `error_kind: 'auth'`.                                                                                                                 |
| 9   | `happy organizer mention`           | `vertexHappy(organizerReply)` | 200             | `organizer_create_reply_and_task` ×1                     | Same shape as #3                                                      | `slug = 'organizer'`. RPC arg shape matches `OrganizerCreateReplyAndTaskArgs`. `organizer write intent` persistence log line emitted. |
| 10  | `happy buddy mention`               | `vertexHappy(buddyReply)`     | 200             | `buddy_create_onboarding_reply` ×1                       | Same shape as #3                                                      | `slug = 'buddy'`. RPC arg shape matches `BuddyCreateOnboardingReplyArgs`. `buddy persisted` log line emitted.                         |

(Scenario 1 also covers the legacy "HTTP 200 on auth failure" contract —
critical because Supabase webhooks would retry on a 4xx/5xx status.)

**Scenarios 9 & 10 — per-agent strategy coverage.** Scenarios 3–8 all run
against Coach to keep the failure-path matrix tight. Scenarios 9 & 10 cover
the Organizer and Buddy happy paths so the per-strategy `persist` branches
(different RPC shapes, different log-line shapes, different `safeReplyInsert`
hooks) are exercised end-to-end. Routing fixtures flip:

- Scenario 9 binds Organizer to the test bubble and posts a webhook with
  content `'@organizer please make a task for this'`.
- Scenario 10 leaves Buddy unbound (workspace-global), bindings result
  contains only Coach, and the webhook posts content
  `'@buddy how do I add a teammate?'`. The resolver appends Buddy via the
  unbound-strategies fallback path.

Failure-path coverage for Organizer / Buddy is not duplicated: the dispatcher
treats `parse` / `shape` / `http` errors identically across strategies (same
`classifyError` → `isFallbackEligible` → `safeReplyInsert ?? insertSafeReply`
path), and Buddy's `safeReplyInsert` override is exercised via Scenario 10's
RPC arg-shape assertion.

### Assertion taxonomy

For every scenario the test asserts:

1. **HTTP status + JSON body** of the `Response` returned by `handleDispatchRequest`.
2. **Vertex fetch call count** via `MockFetchRouter.callsMatching(req => req.url.includes(':generateContent'))`.
3. **RPC call count + arg shape** for any `/rest/v1/rpc/<name>` POST.
4. **Phase sequence** in captured logs (e.g.
   `['received', 'routed', 'llm_call', 'llm_done', 'parsed', 'persisted', 'done']`).
5. **Final log line carries the right `error_kind`** for the failure scenarios.

## CI wiring

[`package.json`](../../../package.json) gets one new script and one chain
update:

```json
{
  "scripts": {
    "test:deno-integration": "deno test --allow-env --allow-read --node-modules-dir=auto --no-check supabase/functions/agent-dispatch/*.integration.test.ts",
    "check": "pnpm format:check && pnpm lint && pnpm check:agent-coupling && pnpm check:agent-prompts && pnpm check:agent-mirror && pnpm test:deno-integration && pnpm build && pnpm check:storefront"
  }
}
```

`pnpm test` (Vitest) is **unchanged** — Deno integration tests run via the
dedicated script, `pnpm check`, and the GitHub Actions CI workflow. Rationale:
Vitest invokes Node and cannot load the dispatcher's `jsr:` / `https:` imports;
conversely, Deno cannot run the React component tests. Two commands, two
runtimes, deterministic.

The `--no-check` flag is intentional: parity with how the function deploys
(Supabase doesn't run `deno check` either; it just bundles + serves).
TypeScript correctness is already enforced via `pnpm lint` (`tsc --noEmit`)
on the `src/lib/agents/` mirrors.

## Adding a new scenario

When porting a new strategy or wiring a new failure path:

1. Add a canned response factory to `vertex-fixtures.ts` if the new failure
   shape isn't already covered.
2. Add a row to the **Scenario matrix** above.
3. Add a `Deno.test('<name>', async () => { … })` block in
   `index.integration.test.ts`. Reuse the helper boilerplate
   (`installRouter`, `captureLogs`, `buildWebhookRequest`).
4. Run `pnpm test:deno-integration`. It should fail with the new scenario
   listed; implement the strategy / dispatcher change; rerun until green.

## Verification

Run all four locally before opening the PR:

```bash
pnpm test:deno-integration         # 10 scenarios pass
pnpm test                          # Vitest still green (no overlap)
pnpm check                         # full chain incl. build + storefront
deno check supabase/functions/agent-dispatch/index.ts  # type-clean from the Deno side too
```

**Manual sabotage smoke tests** (revert before committing):

- Remove the `if (RETRYABLE_STATUSES.has(response.status) && attempt < RETRY_DELAYS_MS.length)`
  branch in `_shared/llm/vertex-gemini.ts` → scenario 4 (`429 then 200`)
  fails because Vertex is now called only once and the test sees a 500-style
  fallback path.
- Change the fallback eligibility predicate in `handler.ts` from
  `kind === 'http'` to `kind !== 'http'` → scenarios 5–7 now return HTTP 500
  with `error: 'dispatch_failed'` instead of falling back; the matrix rows
  fail loudly.

## Risks (and mitigations)

- **`Deno.serve` keeps holding the port in tests.** Mitigated by splitting
  the handler into `handler.ts` (exports `handleDispatchRequest`) and keeping
  `index.ts` as a `Deno.serve(handleDispatchRequest)`-only entry. Tests
  import from `handler.ts` so `Deno.serve` is never called from the test
  file. We deliberately do **not** guard `Deno.serve` with `import.meta.main`
  — Supabase's Edge runtime can import the entry module with
  `import.meta.main = false`, which would silently leave the deployed
  function with no handler.
- **Module-level env reads.** None — `readDispatcherEnv()` is called inside
  the handler and tests use `Deno.env.set(...)` in setup. Confirmed by reading
  `_shared/env.ts` (lazy, throws only when invoked).
- **`crypto.subtle.importKey` on a hardcoded PEM (security).** Mitigated by
  generating a fresh 2048-bit RSA key pair at test runtime via
  `crypto.subtle.generateKey` and exporting it as PKCS8 PEM (see
  `vertex-fixtures.ts → getTestGcpServiceAccountJson`). No `BEGIN PRIVATE KEY`
  literal lives in the repo, so secret scanners (GitHub Advanced Security et
  al.) don't trip on the fixture file. The PEM is memoized per process; the
  module-level cache in `vertex-auth.ts` is reset between tests via
  `_resetVertexAuthCacheForTests()` so each scenario re-imports the same key
  cleanly.
- **Flaky retry-timing assertions.** Mitigated by NOT asserting wall-clock
  numbers — only assert that `vertex429ThenHappy` was called twice and the
  retry log line exists. The `Math.random()`-based jitter in
  `vertex-gemini.ts` would make tighter assertions flaky.
- **Fixture drift over time.** The `postgrest-fixtures.ts` shapes mirror the
  `select(...)` strings in `resolve.ts`. If those queries change, the tests
  fail loudly with a "no route for GET …" error pointing at the unhandled
  query — an explicit signal to update the fixture, not a silent bug.
- **Deno → JSR import latency in CI.** Mitigated by the existing CI Deno
  cache (already warmed by `check:agent-mirror` runs since Phase 7a). First
  run on a fresh runner takes ~5s extra; subsequent runs are sub-second.

## Hand-off

Phase 7c closes out the consolidation. After merge:

- All five operational invariants from the original consolidation plan are
  CI-enforced: shared LLM contract, single secret/webhook/config bundle,
  schema-prompt-parser parity, mirror parity, and now end-to-end retry/
  fallback/parse-error behavior.
- The dispatcher can be refactored or extended (per-tenant SAs, streaming,
  tool calling) without re-deriving these invariants by hand.
- The legacy multi-dispatcher era is fully retired.
