# Phase 7 — Observability, schema-vs-prompt lint, integration tests, and final docs

> The function and routing layer are done. This phase finishes the production-ready
> story: structured-log query playbook, drift-detection lint, end-to-end integration
> tests with mocked Vertex, and an updated doc set.

## Inputs

- Phase 6 merged. `agent-dispatch` is the only dispatcher function.
- `_shared/obs/log.ts` is producing structured JSON lines per Phase 1's contract.
- All three strategies live under `src/lib/agents/<slug>/`.

## Deliverables

Files to **create**:

1. `docs/agents/observability.md` — playbook for Supabase Logs queries:
   - "Coach error rate by error_kind, last 24h"
   - "Per-slug median LLM latency, last 24h"
   - "Fallback rate by slug"
   - "Top error_kind in the last hour"

   Each entry shows the structured-log filter (e.g. `slug = 'coach' AND error_kind IS NOT NULL`)
   and the expected interpretation. When you outgrow Supabase Logs, the same shape
   forwards to Cloud Logging or BigQuery.

2. `scripts/check-agent-prompt-schema-drift.ts` — CI lint that loads each strategy
   in turn and asserts every key the system prompt references appears in
   `responseSchema.required`. The Coach prompt has bitten this team before; encode
   the protection now. Also assert that every key in `responseSchema.required` is
   read by the parser.

   Pseudocode:

   ```ts
   for (const strat of [CoachStrategy, OrganizerStrategy, BuddyStrategy]) {
     const prompt = await strat.buildSystemPrompt(fixtureCtx);
     const required = strat.responseSchema.required ?? [];
     for (const key of required) {
       assert(
         prompt.includes(key) || isAllowedSchemaOnlyKey(key, strat.slug),
         `${strat.slug}: schema requires '${key}' but system prompt does not mention it`,
       );
     }
     for (const key of detectKeysFromPrompt(prompt)) {
       assert(
         strat.responseSchema.properties[key] != null,
         `${strat.slug}: prompt mentions '${key}' but schema does not declare it`,
       );
     }
   }
   ```

   Hook into `pnpm check:agent-coupling` (or a new `pnpm check:agent-prompts`) and
   run from CI.

3. `supabase/functions/agent-dispatch/index.integration.test.ts` — Deno integration
   test that:
   - Mocks `fetch` for the Vertex endpoint (return canned 200, 429-then-200,
     500/500/500, malformed JSON, schema-shape-violating JSON).
   - Stubs the Supabase client's `.rpc` with an in-memory implementation.
   - Runs the full handler against a synthetic webhook payload for each scenario
     and asserts:
     - Happy → 200, RPC called once, structured logs include `phase = 'persisted'`.
     - 429 → retry → 200, `retry_count = 1` in logs.
     - 500/500/500 → fallback insert, HTTP 200 with `fallback_reply_inserted: true`.
     - Malformed JSON → fallback insert.
     - Schema shape error → fallback insert.

   Skip in `pnpm test` (Vitest); run via
   `deno test supabase/functions/agent-dispatch/index.integration.test.ts`.

4. `scripts/smoke-agent-dispatch.ts` — final consolidated smoke script (rename from
   `smoke-agent-dispatch-v2.ts`). Posts synthetic webhooks for Coach (regular +
   workout sentinel + draft path), Organizer (writes-off + writes-on), Buddy
   (mention + onboarding sentinel + thread continuation). Asserts a reply row
   appears for each. Runnable against any environment (dev / staging / prod-only
   for the read-only paths).

Files to **modify**:

1. `package.json` — add `check:agent-prompts` script wired into `pnpm check`.
2. `.github/workflows/*.yml` (whichever runs CI) — invoke the new lint and the
   Deno integration test.
3. `docs/agents/coach/README.md` — add a final section "Observability" linking to
   `docs/agents/observability.md`. Strike the legacy `BUDDY_AGENT_DEBUG` /
   `ORGANIZER_AGENT_DEBUG` references; replace with `LLM_DEBUG=1`.
4. `docs/agents/adding-a-coach.md` — extend with a "Strategy file" step:
   create `src/lib/agents/<slug>/{config,schema,prompts,parse,strategy,parse.test}.ts`,
   then re-export from `supabase/functions/agents/<slug>.ts`, then add to
   `supabase/functions/agents/index.ts`'s `REGISTRY`.
5. `docs/agents/adding-an-organizer-variant.md` — replace any references to
   `organizer-agent-dispatch` with the strategy-registration flow.
6. `docs/agents/coach/ARCHITECTURE_ASSESSMENT.md` — add a final "Phase 7 RESOLVED"
   section listing the items now addressed (structured logging, integration tests,
   schema-vs-prompt lint).

## Schema-vs-prompt lint allowlist

Some required schema keys are intentionally not mentioned in the system prompt
because the prompt instructs the model implicitly (e.g. `intake_phase` is named in
Coach's prompt; `proposed_workout_metadata` is named; but a future schema key like
`debug_id` might be server-injected and not prompted). Provide an explicit
per-slug allowlist in the lint:

```ts
const SCHEMA_ONLY_KEYS: Record<AgentSlug, string[]> = {
  coach: [],
  organizer: [],
  buddy: [],
};
```

Empty by default; add entries only when justified.

## Observability — concrete log queries

### Coach error budget (Supabase Logs)

```text
function_name = 'agent-dispatch'
AND slug = 'coach'
AND error_kind IS NOT NULL
| count(*) by error_kind, hour(ts)
```

Alert when `error_kind = 'http' AND status >= 500` exceeds 5 events per 5-minute
bucket.

### Per-slug latency

```text
function_name = 'agent-dispatch'
AND phase = 'llm_done'
| median(latency_ms) by slug, hour(ts)
```

### Fallback rate

```text
function_name = 'agent-dispatch'
AND phase = 'fallback'
| count(*) by slug, hour(ts)
```

Track week-over-week. A sudden jump usually means Vertex returned a payload the
parser rejects (i.e. model regression). The schema-vs-prompt lint catches this at
build time, but Vertex's "model upgrade" silent rollouts can shift behavior between
deploys.

### Token budget (when Vertex returns usage metadata)

Include `token_in` and `token_out` in the `phase = 'llm_done'` log. Sum hourly to
project monthly Vertex spend before the GCP invoice arrives.

## Integration test fixtures

Build each fixture once and reuse across scenarios:

- Synthetic `webhookPayload` matching Supabase's `database.webhooks` envelope
  (`{ type: 'INSERT', table: 'messages', schema: 'public', record: { … } }`).
- Synthetic Coach `parsed` JSON for the happy path.
- Synthetic Vertex 429/500/timeout responses.
- An in-memory RPC harness that captures the args and returns
  `{ data: { ok: true, deduped: false, … }, error: null }`.

Reuse the canned Coach payloads from `src/lib/agents/coach/parse.test.ts` so test
maintenance is centralized.

## Verification

- CI passes with the new schema-vs-prompt lint.
- Deno integration test passes locally and in CI.
- Smoke script passes against staging.
- The four log queries above are documented and one of them is wired into a
  Supabase Logs saved query (or external alerting).

## Hand-off

After Phase 7, the agent dispatch system is the production-ready stack the original
plan specified:

- Single Deno-native dispatcher.
- Vertex AI publisher API with strict JSON contracts and IAM auth.
- One secret, one webhook, one config block per agent.
- Structured logs with a query playbook.
- Schema/prompt drift caught in CI.
- Integration tests for the retry / fallback / parse-error paths.
- Layer B turn gate, draft RPC, workout sentinel, and `execution_patch` preserved
  byte-for-byte from the legacy Coach pipeline.

If you later need:

- **Streaming** → wire `streamGenerateContent` into `_shared/llm/vertex-gemini.ts`
  behind a strategy flag.
- **Tool / function calling** → add a `tools` field to `AgentStrategy` and pass to
  Vertex; Coach's existing `responseSchema` covers most current needs without
  tools.
- **Per-agent quotas / cost attribution** → mint per-slug GCP service accounts and
  store one SA JSON per slug in Supabase secrets, then look it up in
  `vertex-auth.ts` keyed by `strategy.slug`.
- **DB-driven prompt config** → add `agent_runtime_config (slug, version, prompt,
schema_json, model, …)` and a 60s in-memory cache in `_shared/llm/`. Promote
  from `src/lib/agents/<slug>/config.ts` only when non-engineers want to tune
  prompts without a deploy.

None of these are required pre-MVP.
