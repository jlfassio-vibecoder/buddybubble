# Technical design: Stripe dual-mode (dev/test vs production) and billing funnel analytics — v1

## 1. Problem

Today, billing flows through **Stripe** using **`STRIPE_SECRET_KEY`** and **`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`**, with **product and price IDs** embedded in code (`src/lib/stripe.ts` / `src/lib/stripe-plans.ts`). If local or preview environments accidentally use **live** keys while developers use **test cards** (e.g. `4242…`), Stripe rejects the request (“live mode but used a known test card”). Conversely, using **test** keys against **live** price IDs (or mixed key modes) produces confusing failures and risks **polluting production Stripe** with experimental customers and subscriptions.

Separately, when users abandon checkout, there is **no first-class record** of _which step_ failed or _how long_ they spent—making an admin “why didn’t they pay?” view guesswork instead of data-driven.

## 2. Goals

| Goal                     | Description                                                                                                                                                                                           |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Reliable dev testing** | Local and non-production deploys use **Stripe test mode** end-to-end: keys, customers, payment methods, subscriptions, and webhooks—without touching live money or live customers.                    |
| **Production isolation** | Production uses **live** keys and live catalog only; no code path in production should read “developer override” flags that switch to test.                                                           |
| **Single mental model**  | Team follows **industry-standard Stripe practice**: environment configuration selects mode (`sk_test_` / `pk_test_` vs `sk_live_` / `pk_live_`), not ad-hoc feature flags in shared DB rows for mode. |
| **Aligned catalog**      | Test mode has a **parallel product/price catalog** (or env-driven IDs) so subscription creation matches production semantics (same plan keys, different Stripe IDs).                                  |
| **Funnel observability** | **Server-authoritative** (and optionally client-assist) **analytics events** for each checkout step, stored for **admin reporting** and troubleshooting drop-offs.                                    |
| **Privacy & retention**  | Events store **minimal PII** (user id, workspace id, anonymized session id); card details never logged.                                                                                               |

## 3. Non-goals (v1)

- **Running test and live in the same browser session** or toggling Stripe mode at runtime in the UI.
- **Replacing Stripe Dashboard** for dispute/refund ops (Stripe remains source of truth for money movement).
- **A/B testing pricing** or dynamic price experiments (future product work).
- **Real-time admin dashboards** at millisecond latency (batch/reporting-oriented is fine for v1).

## 4. Industry baseline (Stripe “dual system”)

Stripe does not expose a separate “sandbox URL”; **test vs live is determined entirely by API keys**.

| Layer                              | Test / dev                                                              | Production                          |
| ---------------------------------- | ----------------------------------------------------------------------- | ----------------------------------- |
| **Secret key**                     | `sk_test_…`                                                             | `sk_live_…`                         |
| **Publishable key**                | `pk_test_…`                                                             | `pk_live_…`                         |
| **Dashboard**                      | “View test data”                                                        | Live data                           |
| **Customers, PMs, subs, invoices** | Separate namespace                                                      | Separate namespace                  |
| **Webhooks**                       | Test endpoint + `whsec_…` from Stripe CLI or test endpoint in Dashboard | Live endpoint + live signing secret |
| **Customer Portal**                | Configured under test mode                                              | Configured under live mode          |
| **Test cards**                     | Allowed                                                                 | **Rejected** (your observed error)  |

**Best practice:** treat **environment** (local `.env.local`, Vercel **Preview** vs **Production**) as the selector. Never commit secrets; document in `.env.example` only.

**Anti-patterns to avoid:**

- Mixing `pk_test_` with `sk_live_` (or reverse)—causes opaque client/server errors.
- Storing **live** `stripe_customer_id` in a DB that is shared with **test** Stripe activity without clear env separation (see §6.3).
- Relying on “same” `price_…` string in test and live (IDs are **not** portable across modes).

## 5. Current codebase (anchor points)

| Area                   | Location / notes                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------ |
| Stripe server client   | `src/lib/stripe.ts` — `getStripe()`, `STRIPE_PLANS` (hardcoded `prod_` / `price_`)                     |
| Browser-safe plan copy | `src/lib/stripe-plans.ts` — same IDs for UI labels                                                     |
| SetupIntent API        | `src/app/api/stripe/setup-intent/route.ts`                                                             |
| Subscribe / trial API  | `src/app/api/stripe/create-trial/route.ts`                                                             |
| Webhook                | `src/app/api/stripe/webhook/route.ts`                                                                  |
| Client checkout UI     | `src/components/subscription/start-trial-modal.tsx` — `loadStripe(NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)` |
| Customer DB            | `stripe_customers` (Supabase): `stripe_customer_id`, `has_had_trial`                                   |
| Workspace sub state    | `workspace_subscriptions`; client store `src/store/subscriptionStore.ts`                               |

## 6. Proposed architecture

### 6.1 Mode selection (no new “mode” flag required)

**Rule:** `STRIPE_SECRET_KEY` prefix defines behavior.

- `sk_test_` → test mode for all server SDK calls.
- `sk_live_` → live mode.

Optional **derived helper** (implementation detail):

```ts
// Conceptual — server-only
export function stripeRuntimeMode(): 'test' | 'live' {
  const k = process.env.STRIPE_SECRET_KEY ?? '';
  if (k.startsWith('sk_live_')) return 'live';
  if (k.startsWith('sk_test_')) return 'test';
  throw new Error('Invalid STRIPE_SECRET_KEY');
}
```

**Startup guard (recommended):** assert `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` matches the same mode (`pk_test_` vs `pk_live_`). Log or fail fast in dev to catch misconfiguration early.

**Production guard (recommended):** in `NODE_ENV === 'production'` and when deployed to the production host (e.g. `VERCEL_ENV === 'production'`), **require** `sk_live_` + `pk_live_` and refuse `sk_test_`—prevents accidental test keys on the prod domain.

### 6.2 Plan catalog: test vs live IDs

**Problem:** One hardcoded table cannot serve both modes unless IDs are identical (they are not across modes).

**Recommended pattern (v1):**

1. **Keep plan keys** (`athlete`, `host`, …) as the stable application vocabulary.
2. **Resolve** `productId` / `defaultPriceId` from environment **or** from a small server-only map keyed by `stripeRuntimeMode()`:
   - **Option A — Env per price (explicit):**  
     `STRIPE_PRICE_ATHLETE`, `STRIPE_PRICE_HOST`, … (test values in `.env.local`, live values in Vercel Production). Pros: no code change when prices rotate. Cons: many env vars.

   - **Option B — JSON blob in one env (compact):**  
     `STRIPE_TEST_CATALOG_JSON` (+ optional `STRIPE_TEST_CATALOG_JSON_OVERLAY` merged by plan key in BuddyBubble). Pros: split fitness vs business across two lines. Cons: two vars to reason about.

   - **Option C — Two TS modules (simplest for small teams):**  
     `stripe-plans.live.ts` and `stripe-plans.test.ts` imported by `stripe.ts` based on `stripeRuntimeMode()`. Pros: typed, reviewable in PRs. Cons: must duplicate when catalog changes.

**Recommendation for BuddyBubble v1:** **Option C** or **Option A** for prices only (products rarely needed at runtime if price embeds product). Pick one and document in `.env.example` / internal wiki.

**Client bundle:** `start-trial-modal.tsx` should not need live price IDs for charging (server creates Subscription). It only needs labels/icons unless you display price amounts from Stripe—if so, fetch **public** prices via a small API route that reads the same resolved catalog server-side.

### 6.3 Database and `has_had_trial`

`stripe_customers.stripe_customer_id` is **mode-specific**. A test customer `cus_…` from `sk_test_` does not exist in live.

**Rules:**

- **Local / preview** Supabase pointing at a **shared** project with production-like data: test checkouts still create **test** Stripe customers—IDs stored in DB **must not** be mixed into production Stripe operations. Prefer **separate Supabase branches/projects** for “staging” when doing realistic QA, _or_ accept that `stripe_customer_id` will be overwritten when the same user tests again (your `setup-intent` route already mitigates **stale** IDs via Stripe retrieve).
- **Document:** “Trial flags and customer IDs are environment-specific; resetting QA DB or using a dedicated QA project avoids cross-contamination.”

**Do not** reset production databases (per project rules); this design assumes **config + catalog separation**, not destructive resets.

### 6.4 Webhooks

| Environment               | STRIPE_WEBHOOK_SECRET                                               | Endpoint                             |
| ------------------------- | ------------------------------------------------------------------- | ------------------------------------ |
| Local                     | CLI: `stripe listen --forward-to localhost:3000/api/stripe/webhook` | Same route                           |
| Vercel Preview (optional) | Test-mode signing secret from Dashboard **test** webhook            | `/api/stripe/webhook` on preview URL |
| Production                | Live signing secret                                                 | Production URL                       |

**Best practice:** register **two** Dashboard endpoints if preview should receive test webhooks without CLI; use **test** secret on preview env vars.

## 7. Billing funnel analytics

### 7.1 Principles

1. **Server-side events** for anything security- or money-related (SetupIntent created, subscription created, API errors).
2. **Client-side events** for UX steps (modal opened, plan selected, Elements mounted, user clicked submit)—useful but **supplemental** (ad blockers, tab close).
3. Each flow run has a **`billing_attempt_id`** (UUID) generated when the modal opens or when “Continue to payment” succeeds—propagated in API request bodies/headers so rows can be joined.

### 7.2 Funnel steps (suggested event names)

| Step                                   | `step` / event key                    | Emitter                                   | Payload (examples)                                                          |
| -------------------------------------- | ------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------- |
| Modal opened                           | `billing_modal_opened`                | Client                                    | `workspace_id`, `category_type`, `subscription_status`, `trial_available`   |
| Plan selected                          | `billing_plan_selected`               | Client                                    | `plan_key`, `billing_attempt_id`                                            |
| SetupIntent requested                  | `billing_setup_intent_started`        | Server                                    | `billing_attempt_id`, `user_id`, `workspace_id`                             |
| SetupIntent succeeded (client confirm) | `billing_setup_intent_succeeded`      | Client or infer server-side after confirm | `setup_intent_id` (last 6 chars only if logged)                             |
| SetupIntent / confirm error            | `billing_setup_intent_failed`         | Client + Server                           | `error_code`, `error_message` (sanitized), `stripe_decline_code` if present |
| Create subscription started            | `billing_subscription_create_started` | Server                                    | `plan_key`, `billing_attempt_id`                                            |
| Subscription created                   | `billing_subscription_succeeded`      | Server                                    | `plan_key`, `internal_status`, `subscribe_without_trial`                    |
| Subscription create failed             | `billing_subscription_failed`         | Server                                    | HTTP status from Stripe, safe message                                       |
| Modal closed without success           | `billing_modal_abandoned`             | Client `beforeunload` / close handler     | last step, dwell ms                                                         |

**PII policy:** no full card numbers, no full client secret; Stripe IDs are acceptable internally; prefer **`billing_attempt_id`** + internal user UUID for admin joins.

### 7.3 Storage (Supabase)

**New table (conceptual):** `billing_funnel_events`

| Column               | Type          | Notes                                                          |
| -------------------- | ------------- | -------------------------------------------------------------- |
| `id`                 | `uuid` PK     | `gen_random_uuid()`                                            |
| `created_at`         | `timestamptz` | default `now()`                                                |
| `billing_attempt_id` | `uuid`        | nullable for backfill                                          |
| `workspace_id`       | `uuid`        | FK optional                                                    |
| `user_id`            | `uuid`        | nullable for anon edge cases                                   |
| `environment`        | `text`        | `local` / `preview` / `production` from `VERCEL_ENV` or config |
| `stripe_mode`        | `text`        | `test` \| `live` (from server helper)                          |
| `source`             | `text`        | `client` \| `server`                                           |
| `event_key`          | `text`        | e.g. `billing_subscription_failed`                             |
| `payload`            | `jsonb`       | small structured metadata                                      |
| `client_session_id`  | `text`        | optional hash for de-duplication                               |

**Indexes:** `(workspace_id, created_at desc)`, `(user_id, created_at desc)`, `(billing_attempt_id)`, `(event_key, created_at desc)` for admin filters.

**RLS:** inserts from **authenticated** users for client events (via Supabase RPC or Next route with user); server uses **service role** for trusted inserts. **No** public anonymous insert unless rate-limited and strictly validated.

### 7.4 Ingestion paths

| Path                                        | Use                                                                                                                                |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **POST `/api/billing/analytics`** (new)     | Client batches 1–N events with CSRF/session auth; validates `workspace_id` membership (owner for billing).                         |
| **Direct insert in existing Stripe routes** | Minimal: first/last line of `setup-intent` and `create-trial` + webhook handler for server truth (`invoice.payment_failed`, etc.). |

**Idempotency:** for server events keyed by Stripe object id (`evt_…` webhook) use upsert or unique constraint to avoid double-counting on webhook retry.

### 7.5 Admin reporting (future page)

**Queries / views:**

- **Funnel conversion:** count distinct `billing_attempt_id` where event sequence contains `billing_modal_opened` → … → `billing_subscription_succeeded` within 24h.
- **Drop-off by step:** last `event_key` per `billing_attempt_id` for abandoned flows.
- **Error taxonomy:** group `billing_subscription_failed` by `payload->>'code'`.
- **Test vs live:** filter `stripe_mode = 'test'` for internal QA; production admin defaults to `live`.

**Export:** CSV by date range for support.

## 8. Phased implementation

| Phase  | Deliverable                                                                                                                                                           |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P0** | Document env matrix; add startup assert publishable/secret mode match; extend `.env.example` with test key placeholders and warning about price IDs.                  |
| **P1** | Split plan IDs (Option C or A); verify local `stripe listen` + test webhook updates `workspace_subscriptions`.                                                        |
| **P2** | Create `billing_funnel_events` + RLS; add server events to `setup-intent`, `create-trial`, `webhook`; add `billing_attempt_id` to client modal + POST batch endpoint. |
| **P3** | Admin page: funnel chart + drill-down table + filters (`stripe_mode`, date, workspace).                                                                               |

## 9. Security checklist

- [ ] Never log `STRIPE_SECRET_KEY`, full SetupIntent client secret, or full payment method PAN.
- [ ] Production refuses `sk_test_` when `VERCEL_ENV=production` (or equivalent).
- [ ] Webhook signature verification remains mandatory; separate secrets per env.
- [ ] Admin UI is **staff-only** (existing admin role or new `is_staff` claim)—not workspace owners of other tenants unless B2B support model requires it.

## 10. Open questions

1. **Preview deployments:** Should Preview use **test** Stripe only (recommended) or optionally live for a single “dogfood” preview? (Test-only is simpler.)
2. **Price display:** Should list prices come from **Stripe Prices API** at runtime to avoid drift, or stay static in UI?
3. **Webhook-only sync:** If subscription state is eventually **only** webhook-driven, should `create-trial` response still emit `billing_subscription_succeeded` or rely solely on `customer.subscription.created` webhook event for analytics?

---

**Document owner:** Engineering  
**Status:** Draft v1 — **P0–P2 implemented** (2026-05-16): key-mode guards, live vs test plan resolution (`STRIPE_TEST_CATALOG_JSON`), `billing_funnel_events` + `/api/billing/analytics`, instrumentation in `setup-intent`, `create-trial`, `webhook`, `StartTrialModal`. **P3** (admin UI) still open.  
**Related:** `.env.example` (Stripe), `src/lib/stripe.ts`, `src/lib/stripe-runtime.ts`, `src/lib/billing-funnel-events.ts`, `src/components/subscription/start-trial-modal.tsx`
