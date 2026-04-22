# Storefront Lead Onboarding Workflow (current implementation)

This document is the **source-of-truth** for the _current_ Storefront Lead onboarding flow end-to-end, based on the running code in:

- Storefront hero island: `apps/storefront/src/components/hero/StorefrontHero.jsx` (plus `hero/HeroShell.jsx`, `hero/HeroNav.jsx`, `hero/hooks/*`, `hero/lib/*`, and phase components under `hero/phases/`) + `apps/storefront/src/pages/[slug].astro`
- Storefront → CRM proxy: `apps/storefront/src/pages/api/storefront-trial.ts`
- Core intake engine (CRM): `src/app/api/leads/storefront-trial/route.ts`
- Trial isolation + default bubble grants: `src/lib/storefront-trial-isolation.ts`
- Reverse trial soft-lock: `src/lib/member-trial-soft-lock.ts` + `src/components/subscription/trial-paywall-guard.tsx`
- Trial expiry cron: `src/app/api/cron/expire-member-trials/route.ts`

---

## Concepts & roles (the “separation” model)

This workflow distinguishes **where a person exists** and **what access they should have**:

- **Workspace lead (CRM)**: a row in `public.leads` representing acquisition + attribution for a workspace.
  - Created/updated by the **service-role** intake route `POST /api/leads/storefront-trial`.
  - Storefront-only sources are enforced (`storefront_organic` or `storefront_paid`).
- **Social Space guest / member (access)**: a row in `public.workspace_members` that grants access to a workspace.
  - Storefront onboarding provisions the user as `**role = 'trialing'`\*\* with a 3-day `trial_expires_at` window and `onboarding_status = 'trial_active'`.
  - The legacy `role = 'guest'` may exist in older data; the intake explicitly treats `guest` and `trialing` as safe-to-upsert into `trialing`.

> Important: **trial gating is keyed off `trialing` in the UI**, not `guest`. See `memberPreviewPeriodEnded()` in `src/lib/member-trial-soft-lock.ts`.

---

## User journey (Storefront UI)

### 1) Public workspace landing page

- Route: `apps/storefront/src/pages/[slug].astro`
- The page resolves the workspace by `workspaces.public_slug` where `workspaces.is_public = true`.
- If the workspace `category_type` is `business` or `fitness`, the page renders the interactive preview CTA:
  - `StorefrontHero` (client-side hero shell; React island)
  - Copy: “Start 3-Day Preview”

The page _also_ renders a separate “Join community” link (`/login?next=/app/{workspace_id}`), which is a direct app login path and **not** the reverse-trial flow.

### 2) “Start 3-Day Preview” flow (client-side state only)

Entry component: `apps/storefront/src/components/hero/StorefrontHero.jsx`

- **Child UI (representative paths)**:
  - Phases: `apps/storefront/src/components/hero/phases/PhaseIdle.jsx`, `PhaseProfile.jsx`, `PhaseOutline.jsx`, `PhaseRefine.jsx` (fitness only), `PhaseEmail.jsx`, `PhaseLoading.jsx`
  - Layout: `apps/storefront/src/components/hero/HeroShell.jsx`, `apps/storefront/src/components/hero/HeroNav.jsx`
- **State persistence**: draft progress is stored in `sessionStorage` under:
  - `buddybubble_storefront_trial_v1:{publicSlug}`
- **Phase model** (see `apps/storefront/src/components/hero/lib/phaseTransitions.js`):
  - **Fitness:** `idle` → `profile` → `outline` → `refine` → `email` → `loading`
  - **Business:** `idle` → `profile` → `outline` → `email` → `loading`
- **Turnstile**:
  - When configured, the hero requires a valid Turnstile token before:
    - generating the AI outline preview (`POST /api/storefront-preview`)
    - and before submitting email (`POST /api/storefront-trial`)

### 3) Email submit (first write; starts the reverse trial)

On the final “Save & start preview” submit:

- Storefront POSTs to its same-origin proxy endpoint:
  - `POST /api/storefront-trial` (Astro)
- Payload includes:
  - `publicSlug`
  - `email`
  - `source`: computed as `storefront_paid` vs `storefront_organic` (from UTM medium / click IDs)
  - `utmParams`: extracted from query string (utm\_\* + gclid/fbclid/msclkid)
  - `profile`: full hero draft JSON (bounded by size checks)
  - `cachedWorkoutData`: **fitness only**, when an outline preview is present (BYOD / “bring your own preview”)
  - `turnstileToken` (when available)

### 4) Redirect into the app (magic link verify URL)

If successful, the proxy returns `{ next }` and the browser redirects to that URL.

`next` is a **Supabase “magic link” verify URL** (generated server-side) whose `redirect_to` points back to:

- `/auth/callback?next=/app/{workspaceId}?bubble={trialBubbleId}`

This means the user’s browser flows:

- Supabase verify → CRM `/auth/callback` → CRM deep link into the workspace and the trial bubble

---

## Backend flow (CRM intake engine)

Route: `src/app/api/leads/storefront-trial/route.ts` (service-role Supabase client)

### Request validation & security gates

The intake rejects early unless all of the following are valid:

- `publicSlug`: non-empty string
- `email`: basic validation (contains `@`)
- `source`: must pass `isStorefrontLeadSource()` (`storefront_organic` or `storefront_paid`)
- `profile`: must be JSON-serializable and under the size cap
- **Turnstile**:
  - Development can bypass by default
  - Production requires Turnstile secret to be configured and a valid token + client IP
- Workspace resolution:
  - `workspaces.public_slug = publicSlug` and `workspaces.is_public = true`
  - `workspaces.category_type` must be `business` or `fitness` (storefront trial is disabled otherwise)

### Step-by-step DB operations (exact order)

Below is the effective sequence for a **new** storefront lead (no existing storefront trial context found):

1. **Resolve or create user**

- If a `public.users` row exists by email, reuse `users.id` as `userId`
- Otherwise create an auth user via `supabase.auth.admin.createUser(...)`:
  - `email_confirm: true`
  - `user_metadata.full_name` is derived from profile fields or email local-part
- Best-effort backfill `public.users.full_name` if empty

2. **Upsert `workspace_members` with `trialing` role**

- Reads existing membership (`role`, `trial_expires_at`) if present.
- If existing role is **neither** `trialing` **nor** legacy `guest`, intake returns **409** (already a real member/admin/owner).
- Upserts on `(workspace_id,user_id)`:
  - `role = 'trialing'`
  - `trial_expires_at = existingTrialExpires || now + 3 days`
  - `onboarding_status = 'trial_active'`

3. **Idempotency: detect an existing storefront trial**

- `findExistingStorefrontTrial()` queries `public.leads` for this `(workspace_id,user_id)` with `source in ('storefront_organic','storefront_paid')`
- It extracts `trial_bubble_id` from `leads.metadata.trial_bubble_id` and verifies the bubble still exists in `public.bubbles`.
- If found:
  - Updates `leads.last_seen_at = now`
  - **Backfills default community bubbles** via `grantStorefrontTrialDefaultBubbles()` (best-effort)
  - Optionally upserts `fitness_profiles` (fitness only)
  - Provisions the trial workout (see below)
  - Returns the magic-link `next` deep link (idempotent response)

4. **Provision the isolated 1-to-1 Trial Bubble**

- Resolve coach user:
  - Prefer `workspace_members.role = 'owner'` else first `admin`
- Create bubble via `createTrialBubbleAndMembers()`:
  - Insert into `public.bubbles`:
    - `workspace_id = workspaceId`
    - `name = "Trial · {emailLocalPart}"`
    - `is_private = true`
    - `bubble_type = 'trial'`
  - Insert into `public.bubble_members`:
    - guest `userId` as `role = 'editor'`
    - coach `coachUserId` as `role = 'editor'`
  - Rationale in code: guest must be `editor` so private-bubble RLS lines up with the trial UX (TaskModal, Kanban updates).

5. **Grant Host-configured default community bubbles (best-effort)**

- Immediately after the 1-to-1 trial bubble is created, intake attempts:
  - `grantStorefrontTrialDefaultBubbles({ workspaceId, userId })`
- This reads `workspace_role_default_bubbles` for `role = 'trialing'` and upserts `bubble_members` rows for the lead:
  - `role = 'viewer'`
  - `onConflict = (bubble_id,user_id)`
  - `ignoreDuplicates = true` (do not duplicate; do not downgrade an existing editor grant)
- Failures here are explicitly swallowed so the lead can still land in their 1-to-1 trial bubble.

6. **Insert the CRM lead row (`public.leads`)**

- Inserts `public.leads` with:
  - `workspace_id`
  - `source` (`storefront_organic` or `storefront_paid`)
  - `email`
  - `utm_params`
  - `first_seen_at`, `last_seen_at`
  - `user_id`
  - `metadata` including:
    - `acquisition: 'storefront'`
    - `public_slug`
    - optional `profile`
    - `trial_bubble_id` (stored at `leads.metadata.trial_bubble_id`)
- If lead insert fails, intake **rolls back** the trial bubble by deleting:
  - `bubble_members` for `trialBubbleId`
  - then the `bubbles` row itself

7. **Emit analytics (server-side only)**

- Fire-and-forget:
  - `trackWorkspaceLeadCaptured({ workspaceId, leadId, source, utmParams, inviteToken: null })`

8. **Fitness-only: upsert `fitness_profiles` (best-effort)**

- Upserts `(workspace_id,user_id)` with mapped fields from the storefront profile draft.

9. **Fitness-only: provision the trial workout task**

- If the trial bubble already has a workout for this user, mark generation complete.
- Else:
  - If `cachedWorkoutData` is valid, insert the workout task synchronously.
  - Otherwise schedule an after-response job (`scheduleStorefrontTrialWorkoutAfterResponse`) and mark bubble metadata generation status pending.

10. **Return the handoff link**

- Creates a Supabase magic link verify URL via `auth.admin.generateLink(type='magiclink')`
- Sets `redirectTo = /auth/callback?next=/app/{workspaceId}?bubble={trialBubbleId}`
- Returns `{ next }` to the storefront, which redirects the browser.

---

## Sequence diagram (Storefront → CRM → Supabase)

```mermaid
sequenceDiagram
  autonumber
  actor U as Visitor (browser)
  participant SF as Astro Storefront
  participant CRM as Next.js CRM API
  participant SB as Supabase (Auth + Postgres)

  U->>SF: Load /[publicSlug]
  SF->>SB: SELECT workspaces WHERE public_slug=slug AND is_public=true
  U->>SF: Hero preview flow (sessionStorage only)
  U->>SF: POST /api/storefront-trial (email + profile + UTM + optional Turnstile + cached preview)
  SF->>CRM: Proxy POST /api/leads/storefront-trial (same JSON, forwards client IP headers)
  CRM->>SB: Resolve workspace (public_slug + is_public)
  CRM->>SB: Resolve/create auth user + ensure public.users.full_name
  CRM->>SB: UPSERT workspace_members (role=trialing, trial_expires_at=now+3d, onboarding_status=trial_active)
  CRM->>SB: Query leads for existing storefront trial (idempotency)
  alt Existing trial found
    CRM->>SB: UPDATE leads.last_seen_at
    CRM->>SB: Grant default community bubbles (viewer)
    CRM->>SB: Provision workout (insert or schedule)
  else New trial
    CRM->>SB: INSERT bubbles (private, bubble_type=trial)
    CRM->>SB: INSERT bubble_members (guest editor, coach editor)
    CRM->>SB: Grant default community bubbles (viewer; best-effort)
    CRM->>SB: INSERT leads (metadata.trial_bubble_id=trialBubbleId)
    CRM-->>SB: trackWorkspaceLeadCaptured (async)
    CRM->>SB: Provision workout (insert or schedule)
  end
  CRM->>SB: auth.admin.generateLink (magiclink) redirect_to=/auth/callback?next=/app/{workspace}?bubble={trialBubble}
  CRM-->>SF: 200 { next: action_link }
  SF-->>U: window.location = next (Supabase verify URL)
  U->>SB: Verify magic link
  SB-->>U: Redirect to CRM /auth/callback?next=...
  U->>CRM: /auth/callback (sets session cookies)
  CRM-->>U: Redirect to /app/{workspace}?bubble={trialBubble}
```

---

## Default bubble access (Host-defined)

### Where Hosts configure it

In the app Workspace Settings modal:

- UI: `src/components/modals/workspace-settings/TrialMemberAccessSection.tsx`
- Server actions: `src/app/(dashboard)/trial-member-access-actions.ts`
- Backing tables (migration referenced in code):
  - `workspace_role_default_bubbles`
  - `workspace_role_feature_flags`

### What intake does with it

The CRM intake calls:

- `grantStorefrontTrialDefaultBubbles()` in `src/lib/storefront-trial-isolation.ts`

Details of the grant behavior:

- **Source of truth**: `workspace_role_default_bubbles` rows for:
  - `workspace_id = {workspaceId}`
  - `role = 'trialing'`
- **Applied via**: `bubble_members` upsert on `(bubble_id,user_id)`
  - Inserted role is **always `viewer`** for these default “community” bubbles.
  - The lead’s 1-to-1 trial bubble remains the only bubble where the lead is forcibly `editor`.
- **Idempotency / safety**:
  - Uses `ignoreDuplicates: true` so re-entry never duplicates rows.
  - Does **not** downgrade: if the user already has `editor` on a bubble (from another flow), this grant will not reduce it.
- **Failure mode**:
  - Any error is logged and swallowed by the intake route so a deleted/missing default bubble cannot block onboarding.

---

## The isolated 1-to-1 Trial Bubble

Every reverse-trial lead gets a dedicated private bubble:

- Table: `public.bubbles`
- Inserted shape:
  - `is_private = true`
  - `bubble_type = 'trial'`
  - `name = "Trial · {emailLocalPart}"`

Membership in the trial bubble is explicit and role-based:

- Table: `public.bubble_members`
- Rows inserted:
  - lead user: `role = 'editor'`
  - coach user (owner/admin): `role = 'editor'`

This bubble ID is persisted on the lead record:

- `public.leads.metadata.trial_bubble_id`

That metadata key is the **idempotency anchor** for re-entry: the intake uses it to re-find the user’s existing trial bubble if they return and submit again.

---

## Reverse trial lifecycle (3-day countdown + soft-lock)

### Trial start and expiry timestamp

The 3-day window is defined at intake time:

- Table: `public.workspace_members`
- On upsert for storefront leads:
  - `role = 'trialing'`
  - `trial_expires_at = existingTrialExpires || (now + 3 days)`
  - `onboarding_status = 'trial_active'`

Notes:

- **Re-entry does not extend the trial** by default: if a membership already has a `trial_expires_at`, the intake preserves it.
- The timestamp is stored and compared using ISO strings (UTC) in the intake and helper logic.

### Role interaction (how the UI decides to gate)

The trial paywall behavior is keyed off **workspace role**:

- Helper: `memberPreviewPeriodEnded(activeWorkspace)`
  - Returns `false` unless `activeWorkspace.role === 'trialing'`.
  - Returns `true` if:
    - `onboarding_status === 'trial_expired'`, **or**
    - `onboarding_status === 'trial_active'` and `trial_expires_at < now()` (wall-clock fallback, even before cron runs)

This means:

- `**trialing`\*\* users can be soft-locked after expiry.
- `**guest**` users are explicitly **not** part of this reverse-trial gating path (by design in the helper).

### What gets soft-locked (and what stays usable)

The UI does a **soft lock**, not a hard deny:

- The overlay component is `TrialPaywallGuard` (`src/components/subscription/trial-paywall-guard.tsx`).
- It is applied when `shouldSoftLockTrialSurfaces(...)` returns `true`.
- Current behavior:
  - **Soft-locked**: Kanban + calendar/workout “surfaces” when the selected bubble is a trial bubble (or the aggregate view includes any trial bubbles).
  - **Stays usable**: Chat / “lobby” behaviors are intentionally left available.

The decision is bubble-aware:

- `shouldSoftLockTrialSurfaces(...)` checks `bubble_type === 'trial'` for:
  - the selected bubble, or
  - any bubble when viewing the “All Bubbles” aggregate.

### The CTA and what it means

When soft-locked, the overlay CTA opens the existing BuddyBubble membership upgrade modal:

- Component: `TrialPaywallGuard`
- Action: `useSubscriptionStore().openTrialModal()`
- Copy is explicit that this is **BuddyBubble membership**, separate from any future coach/client checkout.

### Expiration cron (status flip)

Cron route: `src/app/api/cron/expire-member-trials/route.ts`

What it does:

- Periodically updates `workspace_members.onboarding_status` from `trial_active` → `trial_expired` when `trial_expires_at < now`.

Important implementation detail (as currently written):

- The cron query targets `workspace_members.role = 'guest'` (not `trialing`).

Operational impact:

- The UI does **not** rely solely on cron to lock: `memberPreviewPeriodEnded()` will still treat an expired `trial_active` + past `trial_expires_at` as ended for `trialing` users.
- However, the `trial_expired` status may not be set by cron for `trialing` users unless that filter is updated.

---

## RLS and data access (what to expect)

The onboarding flow is intentionally “defense in depth”:

- **Provisioning writes** are done via **service-role** Supabase client in the CRM intake route.
- **Ongoing access** in the app is still governed by Supabase **RLS**:
  - Workspace-level membership exists via `workspace_members`.
  - Bubble-level membership exists via `bubble_members`.

Practical consequences:

- Trial leads see their private 1-to-1 bubble because they have explicit `bubble_members` membership.
- Trial leads may see additional community bubbles because `grantStorefrontTrialDefaultBubbles()` adds explicit `bubble_members` rows (viewer).
- The app’s soft-lock is a **UX gate**, not a security boundary; RLS remains authoritative for actual data access.

---

## Troubleshooting checklist (common failure modes)

- **Storefront can’t submit / Turnstile errors**
  - Storefront requires `PUBLIC_TURNSTILE_SITE_KEY` (site key).
  - CRM requires `TURNSTILE_SECRET_KEY` (secret).
  - The Astro proxy forwards IP headers so the CRM can validate Turnstile against the real client.
- **Lead submits but doesn’t land in the right bubble**
  - Intake deep link uses `next = /app/{workspaceId}?bubble={trialBubbleId}`.
  - Ensure `leads.metadata.trial_bubble_id` is present and the bubble still exists.
- **Re-entry creates a second trial bubble**
  - Intake is designed to be idempotent via `leads.metadata.trial_bubble_id`.
  - If a prior lead row is missing metadata (or the bubble was deleted), intake will create a new trial bubble.
- **Default community bubbles not granted**
  - The grant is best-effort and intentionally non-fatal.
  - Check `workspace_role_default_bubbles` rows for `role = 'trialing'`.
  - If a default bubble was deleted, the grant may error and be swallowed (lead still gets their 1-to-1 bubble).
