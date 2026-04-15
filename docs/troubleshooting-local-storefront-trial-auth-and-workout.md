# Local Storefront Trial Troubleshooting (Auth Redirect + Workout Generation)

## Scope

This document explains why the storefront trial flow can appear to "work in production but fail in local", and how to isolate the exact break quickly.

It is based on current code paths and observed local terminal output.

## Problem Summary

Two separate issues are being conflated:

1. **Magic-link redirect target mismatch** (landing at `/#access_token=...` and staying on home/sign-in shell)
2. **Workout task generation not appearing in app after login**

These are related only in sequence. They are not the same failure.

---

## Architecture Comparison: Production vs Local

## 1) Storefront intake and preview

- Storefront (Astro) posts to:
  - `apps/storefront/src/pages/api/storefront-preview.ts` -> proxies to Next `/api/ai/storefront-preview`
  - `apps/storefront/src/pages/api/storefront-trial.ts` -> proxies to Next `/api/leads/storefront-trial`

- Next handles:
  - preview generation (`src/app/api/ai/storefront-preview/route.ts`)
  - lead + trial setup (`src/app/api/leads/storefront-trial/route.ts`)

## 2) Auth handoff

- Trial endpoint generates Supabase magic link via:
  - `buildStorefrontTrialMagicLink()` -> `redirectTo = {origin}/auth/callback?next=/app/{workspace}?bubble={id}`
- Callback route:
  - `src/app/auth/callback/route.ts`
  - Exchanges session and redirects to `next`
- Hash fallback:
  - `src/app/login/login-form.tsx` handles `#access_token=...`
  - `src/app/root-hash-magic-link-forwarder.tsx` forwards root hash links to `/login#...`

## 3) Workout generation

- After trial intake succeeds, job is scheduled:
  - `scheduleStorefrontTrialWorkoutAfterResponse()` in `src/lib/storefront-trial-job.ts`
- Job tries single Vertex call:
  - `runStorefrontPreviewGeneration(...)`
- If AI fails, code falls back to a starter workout insert.

---

## Verified Findings From Local Logs

## A) Local Next app is reachable and receiving requests

Observed:

- `POST /api/ai/storefront-preview 200`
- `POST /api/leads/storefront-trial 200`

So local request routing is alive when both servers are up.

## B) Vertex calls are timing out intermittently in local

Observed:

- `Error [AbortError]: This operation was aborted`
- Stack points to `callVertexAI(...)` from both:
  - `/api/ai/storefront-preview`
  - `runStorefrontTrialWorkoutJob(...)`
- Followed by:
  - `[storefront-trial-job] single-call preview failed 502 {"error":"Preview generation failed"}`

This is the primary reason local workout generation appears flaky/hung.

## C) Optional email send failure is noisy but not causal

Observed:

- `optional login email not sent: Invalid from field...`

This does not block API 200 from trial intake and is not root cause for missing workout task.

---

## Why `/#access_token=...` Still Appears

If Supabase returns a hash token URL, browser fragment (`#...`) is client-only.
Server routes never see it directly.

The app must always run a client hash handler (`/login` flow or root forwarder) to finalize session.

If user lands on production URL and remains there, local fixes are irrelevant to that browser session.

---

## Common Misdiagnosis To Avoid

## "Production URL proves local is broken"

A link starting with `https://app.buddybubble.app/...` is production domain.
It does not execute local `localhost` handlers unless explicitly routed there.

Use domain separation during tests:

- **Production test:** only `app.buddybubble.app`
- **Local test:** only `localhost` URLs generated from local intake run

---

## Fast Isolation Runbook (No Code Changes)

## Step 1: Confirm both servers are up

- Next app: `http://localhost:3000`
- Storefront app: `http://localhost:4321` (or configured port)

## Step 2: Confirm storefront proxy target is local

From storefront dev logs, verify POSTs to:

- `/api/storefront-preview`
- `/api/storefront-trial`

Then check Next logs immediately for matching:

- `POST /api/ai/storefront-preview`
- `POST /api/leads/storefront-trial`

If storefront POST exists but Next POST does not, proxy target is wrong.

## Step 3: Confirm auth callback path

For a local run, generated magic link should redirect through local origin callback:

- `http://localhost:3000/auth/callback?...`

If link opens production domain, that run is not a local auth test.

## Step 4: Confirm job execution after trial intake

After `POST /api/leads/storefront-trial 200`, Next logs should show either:

- successful trial job insert path, or
- Vertex abort + fallback insert path

If neither appears, job scheduling is not firing in that run.

## Step 5: If Vertex aborts, treat as upstream AI latency issue

Given repeated `AbortError`, this is network/model latency under local constraints.
Expected effect:

- preview may fail intermittently
- job may use fallback insert

If no card appears even after fallback path should run, inspect DB rows (`tasks`) for target `bubble_id` and `assigned_to`.

---

## Likely Root Cause Matrix

- **Redirect lands on root with hash, no app transition**
  - hash/session finalization path not completing on that domain/session
- **Preview works but in-app card never appears**
  - trial job AI call aborts and fallback insert path needs verification in DB
- **Intermittent local success/failure**
  - Vertex timeout/abort variability, not deterministic app routing

---

## Recommended Next Diagnostic (Low Risk)

Add temporary request-scoped debug logging (local-only) for:

- generated `redirectTo` in trial API
- callback route entry (`code`, `token_hash`, hash-forward path)
- trial job insert result (primary vs fallback)

This is the fastest way to remove ambiguity without changing production behavior.
