# Coach Agent — Architectural Assessment & Gap Analysis

Companion to [`coach/README.md`](./README.md). The README documents **what is**; this document evaluates **how well it holds up** and **where it’s likely to break**. Cited line ranges are approximate but anchored to current symbols/strings.

> Scope: the **Coach** flow only — `supabase/functions/bubble-agent-dispatch`, the four Coach surfaces (`ChatArea`, `TaskModalCommentsPanel`, `WorkoutCoachRail`, `WorkoutPlayer`), the three Coach-related RPCs (`agent_create_card_and_reply`, `agent_insert_coach_workout_draft_reply`, `apply_workout_draft`), and the agent-routing layer (`resolveTargetAgent`, `useAgentResponseWait`, `useMessageThread`).
>
> Out of scope: Organizer (`organizer-agent-dispatch`), Buddy (`buddy-agent-dispatch`), broader chat/RBAC/RLS subsystems.

---

## 1. TL;DR

The Coach implementation is **substantially more sophisticated than the original architecture plan** and uses well-chosen primitives (service-role RPCs, advisory locks, a deduper table, structured Gemini JSON, realtime via `postgres_changes`). It is, however, **monolithic, uniformly untested, and entangled with fitness-specific assumptions**, with several **silent-failure modes** that will only become visible under load or specific user sequences.

**Most leverage to invest in (ranked):**

1. **Tests** for the pure parsers and the resolver, plus an integration smoke test for the dispatch state machine. (#7.1)
2. **Fix the `execution_patch` realtime race** — likely already producing dropped patches in production. (#3.2)
3. **Extract the Coach prompt and JSON schema into versioned modules** (mirroring `buddyPrompt.ts`) and split the Edge Function by flow mode. (#6.1, #6.3)
4. **Replace the `agent_create_card_and_reply` “orphan reply” reuse branch** with a more conservative dedupe key, or document its semantics explicitly. (#3.1)
5. **Server-side Coach-vs-other-agent dispatch guard** (right now only `organizer` is excluded). (#4.1)

---

## 2. Strengths (what to preserve)

These properties are non-trivially right and should not be sacrificed in any rewrite.

| #   | Property                                                                                                                                                       | Where                                                   |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| S1  | **Identity layer** uses real `auth.users` rows, so `messages.user_id` is the agent — no parallel author plumbing.                                              | `agent_definitions`, `bubble_agent_bindings` migrations |
| S2  | **Service-role RPCs with `SECURITY DEFINER` + revoke/grant**: agents never bypass RLS via the client; users can only invoke `apply_workout_draft`.             | `20260531100000_…`, `20260623120000_…`                  |
| S3  | **Idempotency table** `agent_message_runs` with `pg_advisory_xact_lock(trigger_message_id, agent_auth_user_id)` prevents duplicate replies on webhook retries. | both card RPCs                                          |
| S4  | **Server resolves task id, never trusts the LLM** (`resolveKnownTargetTaskId`, `taskIdInBubble`).                                                              | dispatch ~lines 350–400                                 |
| S5  | **Loop guard**: messages whose author is an active agent are skipped (`skipped: 'author_is_agent'`).                                                           | dispatch ~line 1248–1262                                |
| S6  | **Layer B turn gates** prevent first-turn card creation regardless of model output.                                                                            | dispatch ~lines 1615–1640                               |
| S7  | **Structured Gemini JSON** with `responseMimeType: 'application/json'` + `responseSchema` (not free-text parsing).                                             | `geminiGenerateJson`                                    |
| S8  | **Defensive parsers** for every numeric/enum/array field (`parseIntakePhase`, `parseSessionReadinessScore`, `parseExecutionPatchFromGemini`).                  | dispatch ~lines 416–497                                 |
| S9  | **Draft state machine** (`pending` → `accepted` / `superseded`) keeps `tasks` mutations user-initiated.                                                        | `apply_workout_draft`                                   |
| S10 | **Slack-style threading** is consistent across human + agent inserts (`p_thread_id == coalesce(parent_id, id)`).                                               | both card RPCs                                          |
| S11 | **Webhook returns HTTP 200 on auth/parse/skip** to avoid Supabase retry storms — explicitly designed and well-commented.                                       | dispatch top of `Deno.serve`                            |
| S12 | **Client `resolveTargetAgent` is pure and agent-agnostic**, isolating naming/UX changes from the dispatcher.                                                   | `src/lib/agents/resolveTargetAgent.ts`                  |
| S13 | **Workout sentinel is filtered out of the visible transcript** at the rail layer (`row.content !== WORKOUT_COACH_SENTINEL_EVENT`).                             | `WorkoutCoachRail.tsx`                                  |

---

## 3. Correctness & data-integrity gaps

### 3.1 `agent_create_card_and_reply` orphan-reply reuse can swallow newer model output

In `20260531100000_agent_create_card_seed_task_comment.sql` (lines ~73–105), if a prior agent message in the same `parent_id` thread already has `attached_task_id`, the function **reuses that older row** and updates only the `agent_message_runs` index — discarding the **new** `p_reply_text`, the new `task_title/description`, and (downstream) the new `execution_patch` merge.

- **Visible symptom:** user sends a follow-up that should produce a fresh card; the typing indicator clears but no new reply appears in the thread (a stale earlier reply is the “canonical” answer per `runs`).
- **Risk class:** silent, depends on thread shape; will not show up in unit tests.
- **Remediation options:**
  1. Drop this branch entirely; rely on the `(trigger_message_id, agent_auth_user_id)` dedupe alone.
  2. Keep the branch but **insert a new reply row** anyway (do not return early); use the orphan reuse only as a hint for `created_task_id`.
  3. At minimum, add a `comment on function` and an explicit log line so this behavior is traceable.

### 3.2 `execution_patch` realtime race (likely live bug)

Sequence today (dispatch ~lines 1693–1722):

1. `agent_create_card_and_reply` **inserts** the agent reply row → realtime broadcasts an `INSERT` with `metadata` that does **not** yet contain `execution_patch`.
2. Edge Function then **fetches and updates** that row to attach `execution_patch` (`mergeExecutionPatchIntoAgentReplyMetadata`) → realtime broadcasts an `UPDATE`.

`WorkoutCoachRail` (~lines 270–299) handles patches off the **last** message and uses a `Set<string>` of handled message ids:

- INSERT arrives without patch → `parseExecutionPatchFromMetadata` returns `null` → **the id is added to `coachExecutionHandledMessageIdsRef` anyway** (line ~291).
- UPDATE arrives with patch → effect re-runs, sees the id in the Set → **bails before applying**.

Result: `execution_patch` may never be applied to `WorkoutPlayer` for a given message even though it’s present on the row.

**Remediation options (any one):**

- Persist `execution_patch` **inside** the original RPC insert (extend `agent_create_card_and_reply` / `agent_insert_coach_workout_draft_reply` to accept and write `metadata.execution_patch`) so there is only one row event with the patch present.
- In the rail, only mark a message id as handled **after a successful patch application**, not on “no patch found.”
- Switch the rail to listen for row UPDATE events on the latest message and re-evaluate.

### 3.3 Layer B silently contradicts `reply_content`

When `priorUserMessageCount === 0` or the `session_request_turn_gate` fires, the server clears `taskTitle/Description/seedTaskCommentText` and forces `createCard = false` (dispatch ~lines 1615–1640). The model may already have phrased `reply_content` as **“Here’s your card!”** based on its own `create_card: true`. The reply is persisted as-is.

- **Symptom:** user sees Coach claim a card was made; no card appears.
- **Remediation:** when Layer B overrides, regenerate or adjust `reply_content` (cheap follow-up Gemini call, or static rewrite to a “before I draft, give me one more turn” message).

### 3.4 Sentinel is content-equality-keyed and unguarded server-side

Any user message whose trimmed content **equals** `[SYSTEM_EVENT: WORKOUT_CONTEXT]` enters the greeting branch (dispatch ~line 113). There is:

- No DB constraint preventing this string in `messages.content`.
- No marker tying the sentinel to the rail (a user pasting the literal string in any fitness bubble triggers a greeting flow).
- No de-dupe across mounts of the rail beyond the per-mount `sentinelHasFiredRef` — closing/reopening the workout player can produce repeated greetings.

**Remediation options:**

- Move the marker out of `content` and into a metadata flag (`is_silent_sentinel: true` already exists in the rail’s `metadata`); have the dispatcher detect by metadata, not by content equality.
- Add a server-side dedupe key per `(target_task_id, user_id, kind: 'workout_open_greeting')` so additional sentinels for the same task are no-ops.
- Reject inserts of the magic string from non-rail clients (or rewrite to empty content with metadata flag).

### 3.5 `apply_workout_draft` does a top-level `metadata` merge

`v_merged_meta := coalesce(v_task.metadata::jsonb, '{}'::jsonb) || v_prop_meta;` (migration line ~311) replaces the whole `exercises` array if `proposed_metadata.exercises` is provided. Edits a user made between draft creation and finalize on `tasks.metadata.exercises` are clobbered.

- **Acceptable for v1**, but should be documented as the contract; consider a deeper merge for `exercises` keyed by index/name if conflicts become real.

### 3.6 Coach-draft validation is duplicated in three places

- TS parser: `src/types/coach-draft.ts`.
- SQL guard: inside `agent_insert_coach_workout_draft_reply` (presence + array-shape checks).
- SQL reader: inside `apply_workout_draft` (status + target match).

No single source of truth and no schema-level CHECK on `messages.metadata->'coach_draft'`. A future change to one is easy to miss.

### 3.7 Lossy `execution_patch` parsing

`parseExecutionPatchFromGemini` (dispatch ~line 456) **returns `null` for the entire patch** on the first invalid item. If the model returns 4 valid items + 1 typo, all 4 are dropped.

- **Remediation:** skip invalid items and keep the rest; log a warning. Mirror the same change in `parseExecutionPatchFromMetadata` (`src/types/execution-patch.ts`) for symmetry.

---

## 4. Routing & isolation gaps

### 4.1 Dispatcher only excludes `organizer`

`DISPATCHER_EXCLUDED_SLUGS = new Set(['organizer'])` (dispatch ~line 1289). Any **other** non-Coach slug bound to a bubble would be routed through `bubble-agent-dispatch` and answered with the **Coach** prompt — silent semantic drift.

- **Remediation:** invert the rule — only handle `coach`, return `skipped: 'not_handled_by_coach_dispatcher'` otherwise. Or move per-agent handling into a slug-keyed map (`'coach' → coachHandler, 'fitness_coach' → coachHandler, …`).

### 4.2 Two regex implementations of “first @mention wins”

- Client: `MENTION_REGEX` in `resolveTargetAgent.ts`.
- Server: `MENTION_TOKEN_REGEX` in dispatch ~line 1319.

Same intent, two strings. A change to one without the other will produce **silent routing mismatches** (the typing indicator predicts one agent, the server picks another).

- **Remediation:** factor a tiny shared module consumable by both Deno and the client (or duplicate via a tested pattern + a snapshot test).

### 4.3 `default_agent_slug` is unenforced convention

The contract “root-message-only metadata hint” lives entirely in code comments (`bubble-agent-dispatch` ~line 100; `WorkoutCoachRail` ~line 26; `ChatArea` ~line 1422). Nothing prevents a thread reply from setting it, and there is no schema constraint. New surfaces are likely to set it inconsistently.

- **Remediation:** add a typed sender helper (e.g. `sendAgentScopedMessage({ defaultAgentSlug })`) used by all surfaces; reject the field on non-root inserts in a `BEFORE INSERT` trigger.

### 4.4 Buddy in a fitness bubble is ambiguous

If Buddy is _also_ bound to a fitness bubble (currently he is fetched globally without a binding), both `bubble-agent-dispatch` and `buddy-agent-dispatch` would fire on the same insert. The dispatcher exclusion list does not include `buddy`. This is currently a configuration question, not a code bug, but it is undefended.

---

## 5. Performance, cost, and scale

### 5.1 Webhook fires on every `messages` INSERT

There is no DB-side fast-reject. Every chat message anywhere in the workspace produces:

- 1 service-role round-trip to `agent_definitions` (self-author skip).
- 1 service-role round-trip to `bubble_agent_bindings`.

Even when the message is a plain human-to-human chat with no `@mention` and no `default_agent_slug`. For high-volume bubbles this is the dominant cost.

- **Remediation options:**
  - Webhook condition (Supabase webhooks can have a SQL filter) to skip when content has no `@` and metadata has no `default_agent_slug`.
  - Move the bindings/exclusion check into a Postgres function called by a `BEFORE INSERT` trigger that sets a boolean column the webhook reads (advanced).
  - Cache `bubble_agent_bindings` per cold-start in Edge memory if hosting allows.

### 5.2 `fetchUserContext` is fitness-specific and eager

Every Coach turn pays for: `users` + `fitness_profiles` + last assigned workout + last bubble workout + next workout (5 parallel queries — dispatch ~lines 1052–1094). Two issues:

1. The shape is hard-coded for fitness — non-fitness Coach use would still pay this cost.
2. There is no caching across turns within the same thread; every turn re-reads the same profile.

### 5.3 No rate limit / abuse guard

A user spamming `@Coach` produces N Gemini calls, each ~55 s timeout-budgeted, each non-trivial cost. Only same-`trigger_message_id` is deduped.

- **Remediation:** soft per-user / per-bubble token bucket; keep counters in a small Postgres table or KV.

### 5.4 No retry / backoff on Gemini

Single-shot fetch with `AbortSignal.timeout(55_000)`. A flaky Gemini → user gets the typing-indicator timeout. No DLQ, no replay.

### 5.5 History limit of 50

`loadThreadHistory` fetches at most 50 most-recent messages (dispatch ~line 1369). For long mid-workout threads this can evict the original sentinel’s `workoutContext` (mitigated by “latest-non-empty wins” in `resolveCurrentWorkoutContextJsonFromThread`, but only if a later message also carries the payload).

- **Remediation:** when in mid-workout mode, prefer pulling the trigger task’s metadata directly rather than relying on the chat scroll-back.

### 5.6 `messages.metadata` realtime payload size

`coach_draft.proposed_description` may be a multi-paragraph workout body. `postgres_changes` broadcasts the **whole row** to all subscribers. For a populated bubble this is non-trivial bandwidth per turn.

- **Remediation:** keep the long body in `tasks.description` post-finalize; in the draft message keep a short pointer + structured `proposed_metadata` only.

---

## 6. Modularity & evolution

### 6.1 Edge Function is monolithic (~1725 lines)

`bubble-agent-dispatch/index.ts` interleaves:

- Webhook auth, payload parsing.
- Self-author / bindings / mention / default / thread-continuation resolution.
- Workout-context sentinel handling.
- Mid-workout / new-card / draft-revise branching.
- Gemini schema, system prompt, parsers.
- `fetchUserContext` (5-query fitness join).
- `mergeExecutionPatchIntoAgentReplyMetadata`.

That structure makes prompt iteration risky (one test failure per concern), encourages copy-paste when adding flows, and makes diff review hard.

- **Remediation:** split into modules:
  - `dispatch/handler.ts` (HTTP entry).
  - `dispatch/resolveAgent.ts` (mention / default / thread continuation).
  - `dispatch/coach/sentinel.ts`.
  - `dispatch/coach/prompt.ts` (constants + schema).
  - `dispatch/coach/parse.ts` (defensive parsers).
  - `dispatch/coach/runTurn.ts` (Gemini + RPC choice + Layer B).
  - `dispatch/coach/executionPatch.ts`.

### 6.2 Three sources of truth for the Gemini contract

`responseSchema` (Gemini JSON), `CoachGeminiJsonResponse` (TS type), and `parseGeminiJsonText` (defensive parser) all encode overlapping invariants. They drift independently.

- **Remediation:** generate the JSON schema from a single source (e.g. Zod or TypeBox) and use it for both Gemini schema and runtime validation.

### 6.3 System prompt is an inline literal

The base Coach prompt is concatenated string literals across ~25 lines (dispatch ~lines 1484–1508). Buddy already uses a separate `buddyPrompt.ts` module — Coach should follow.

- **Remediation:** move to `coachPrompt.ts`, version it explicitly (e.g. `COACH_PROMPT_VERSION = '2026.04'`) and stamp the version on the agent reply’s metadata for diagnostics.

### 6.4 Coach is hard-coupled to the “fitness/workout” shape

`p_task_type: 'workout'` in both card RPCs (dispatch ~lines 1454, 1684), the fitness-specific `fetchUserContext`, the `workoutContext` metadata key, and the `WorkoutPlayer` integration all assume fitness. Reusing the “coach” slug for any non-fitness vertical (or adding a `RecipeCoach` per `docs/agents/adding-a-coach.md`) would require copying the entire dispatch path, not just adding a binding row.

- **Remediation:** if multiple coach verticals are likely, factor the fitness specialization behind a per-slug “coach profile” and parameterize task type, prompt module, and context loader.

### 6.5 No telemetry beyond `console.error`

There is no structured emission to Sentry/PostHog/Datadog from the function. Questions like “What % of Coach turns produce a card vs draft vs none?”, “p95 Gemini latency?”, “How often does Layer B fire?” are unanswerable today without log scraping.

- **Remediation:** emit structured events at every branch boundary (`agent.turn.start`, `agent.turn.gemini_done`, `agent.turn.layerb_fired`, `agent.turn.rpc_done`, `agent.turn.execution_patch_merged`) with stable property names.

---

## 7. Testability

### 7.1 No automated tests anywhere along the Coach path

A repo search for tests touching `bubble-agent-dispatch`, `WorkoutCoachRail`, `coach_draft`, `execution_patch`, or `resolveTargetAgent` returns **zero files**. Critically, the **pure** units below are trivially testable and currently untested:

- `parseGeminiJsonText`, `parseIntakePhase`, `parseSessionReadinessScore`, `parseMissingIntakeCategories`, `parseExecutionPatchFromGemini`, `parseProposedWorkoutMetadata`, `coalesceTaskDescription`, `coalesceUpdatedTaskDescription`, `stripMarkdownCodeFences`, `ensureCoachTaskNotesCta` (all in `bubble-agent-dispatch`).
- `resolveTargetAgent` (`src/lib/agents/resolveTargetAgent.ts`).
- `parseCoachDraftFromMessageMetadata`, `coachDraftMetadataToJson` (`src/types/coach-draft.ts`).
- `parseExecutionPatchFromMetadata` (`src/types/execution-patch.ts`).

Recommended **minimum** test set:

| Area                                                       | Type               | Why                                                                              |
| ---------------------------------------------------------- | ------------------ | -------------------------------------------------------------------------------- |
| Parsers above                                              | Unit               | High value; isolate against schema drift; cheap.                                 |
| Resolver client/server parity                              | Snapshot           | Catch divergence between `resolveTargetAgent` and `MENTION_TOKEN_REGEX`.         |
| Layer B gates                                              | Unit (pure helper) | Extract `applyLayerBGates(...)` and assert each branch.                          |
| `agent_create_card_and_reply` orphan reuse                 | SQL test (pgTAP)   | Pin current behavior so any change is intentional.                               |
| `apply_workout_draft` happy + forbidden + already-accepted | SQL test           | Lock in state-machine.                                                           |
| Dispatch state machine                                     | Edge integration   | Stub Supabase + Gemini; assert which RPC was called for representative payloads. |

### 7.2 Hard-to-mock pieces

- `geminiGenerateJson` and `geminiGenerateWorkoutOpenGreeting` use `fetch` directly. Inject a transport so tests can run without network.
- `createClient` is called inside the handler; an injected supabase client makes the function trivially testable.

---

## 8. UX / product failure modes

### 8.1 Typing indicator can outlast the turn but not vice-versa

`useAgentResponseWait` clears on either an arriving agent message or `response_timeout_ms`. There is **no** signal from the Edge Function back to the client that the turn was _skipped_ (e.g. `no_agent_mention`, `workout_context_sentinel_not_coach`). The client waits the full `response_timeout_ms` for nothing. Cosmetic but annoying.

- **Remediation:** lightweight ack channel (e.g. an `agent_status_events` table or a broadcast) the function writes for skip/short-circuit branches.

### 8.2 Sentinel re-fires on rail remount

The rail’s `sentinelHasFiredRef` is per-mount only. Unmount/remount → another silent sentinel → another greeting. With `agent_message_runs` keyed by trigger id, the dedupe table does not help (each sentinel insert has a fresh trigger id).

### 8.3 `execution_patch` is ephemeral by design

`WorkoutPlayer.handleApplyExecutionPatch` updates **local React state only**. A tab reload loses Coach’s prescribed weights. This is a deliberate choice (the workout is not “saved” until `handleFinish`), but it isn’t documented anywhere user-visible.

### 8.4 Sentinel string visibility risk

Even though the rail filters the magic string out, **other surfaces** (last-message previews, mobile push notifications, search results, admin moderation, exports) all read `messages.content` directly. If any of those are/will-be present, users could see `[SYSTEM_EVENT: WORKOUT_CONTEXT]` leak. This is a conservative observation; verify against your notification + preview pipeline.

### 8.5 `TaskModalCommentsPanel` defaults to Coach unconditionally

`TASK_COMMENTS_DEFAULT_AGENT_SLUG = 'coach'` (panel ~line 51). If a user opens a task in a bubble where Coach is not bound, the default points at an unavailable agent. `resolveTargetAgent` returns `null` (no harm done) but the UX hint that “plain text talks to Coach” is misleading there.

- **Remediation:** make the default slug a prop derived from the bubble (or fall through to “no default” when not in `availableAgents`).

---

## 9. Security & RLS posture

| #    | Note                                                                                                                                                                                                                                                                                                                |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sec1 | Webhook auth via shared header `x-bubble-agent-secret` is sound; consider adding HMAC of payload for replay protection.                                                                                                                                                                                             |
| Sec2 | Service-role client is created per-request; no token caching across requests (good — Supabase webhook delivery is event-scoped).                                                                                                                                                                                    |
| Sec3 | RPC `apply_workout_draft` correctly reuses `user_may_update_task_row` to mirror `tasks_update` RLS — no privilege escalation by accepting a draft you couldn’t edit.                                                                                                                                                |
| Sec4 | `messages.metadata.coach_draft.proposed_description` is RLS-protected by the row’s `bubble_id`-based policies, but the column has no per-key sensitivity. If draft contents become more sensitive (e.g. clinical notes), revisit.                                                                                   |
| Sec5 | `GEMINI_API_KEY` is per-function; rotation policy is operational, not in code — out of scope here.                                                                                                                                                                                                                  |
| Sec6 | Layer B is a server-side guard that the LLM cannot bypass — good defense-in-depth.                                                                                                                                                                                                                                  |
| Sec7 | The dispatcher does not check **user’s** RLS for the trigger message; it relies on the message having been validated at insert time by `messages_insert` RLS. This is fine **provided** an attacker cannot insert a webhook-style payload directly — the shared-secret + Supabase webhook pipeline is the boundary. |

---

## 10. Concrete recommendation backlog

A pragmatic order, optimized for **risk reduction first, then leverage**.

### Tier A — do soon (correctness)

1. **Pin the `execution_patch` to the original RPC insert** so realtime delivers a single row event with the patch attached. Removes #3.2.
2. **Make Layer B rewrite `reply_content`** when it overrides `create_card`. Removes the “Here’s your card!” lie. (#3.3)
3. **Audit `agent_create_card_and_reply` orphan-reply branch.** Either delete it or document semantics + add an integration test. (#3.1)
4. **Tighten dispatcher slug handling** — only `coach` enters the Coach pipeline; others short-circuit with a clear `skipped` reason. (#4.1)
5. **Move sentinel detection from content-equality to a metadata flag.** Reject content equality from non-rail callers. (#3.4)

### Tier B — do next (maintainability)

6. **Extract `coachPrompt.ts`** with versioning; stamp version on agent reply metadata. (#6.3)
7. **Introduce parser tests** for the entire family in §7.1. Will prevent the next round of silent regressions.
8. **Split the Edge Function** along the module boundaries in §6.1. After tests are in place.
9. **Single source of truth for the Gemini contract** (Zod or TypeBox → JSON schema + TS type + parser). (#6.2)
10. **Shared mention regex** consumed by client and dispatcher. (#4.2)

### Tier C — optimization

11. **Webhook fast-reject filter** (DB-level condition or in-function early-out). (#5.1)
12. **Cache `fetchUserContext` per thread**, keyed on (user_id, bubble_id). (#5.2)
13. **Per-user / per-bubble Coach turn rate limit**. (#5.3)
14. **Telemetry events** at every state-machine boundary. (#6.5)
15. **Lenient `execution_patch` parsing** (skip invalid items, log). (#3.7)

### Tier D — strategic

16. **Persist `execution_patch` deltas to `tasks.metadata` (or a sibling table)** so they survive reload — only if product wants the live grid to be sticky. (#8.3)
17. **De-fitness-ify the Coach** if a second coach vertical is on the roadmap (`RecipeCoach` etc.). Otherwise rename the implementation `fitness-coach-dispatch` and own the coupling explicitly. (#6.4)
18. **Replay queue / DLQ** for failed turns so users can recover without retyping. (#5.4)

---

## 11. Open questions for the team

1. **Is the orphan-reply reuse in `agent_create_card_and_reply` intentional?** It looks like a backfill safety from earlier migrations. If yes, please document; if no, see #3.1.
2. **Is the `execution_patch` realtime race actually visible in production?** A single-day metric on “patch attached but never applied client-side” would confirm.
3. **Will Coach stay the only agent on `bubble-agent-dispatch`?** This determines whether the dispatcher should be renamed/specialized or generalized with per-slug handlers.
4. **Should drafts auto-supersede when Coach proposes a newer one in the same task?** Today nothing flips an old `pending` draft to `superseded` — two pending drafts in the same task is reachable.
5. **Should the sentinel’s greeting persist in the timeline?** It currently does (it’s a real `messages` row); this preserves history but also clutters task chats with a Coach greeting per workout open.

---

_This is a living assessment. When something here is fixed, prefer updating this file in the same PR so the doc and code stay co-located in `coach/`._
