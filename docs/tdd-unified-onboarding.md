# Technical design: unified onboarding (Host + Invitee)

## 1. Problem

BuddyBubble needs a **single authentication and routing pipeline** for two personas:

1. **Host (Creator)** — signs up and creates a BuddyBubble (workspace) before anyone can be invited.
2. **Invitee (Guest)** — accepts a controlled invitation into an existing BuddyBubble.

If Host and Invitee flows are built in isolation, we risk **duplicate login UI**, divergent session handling, and fragile routing. Chronologically, **the Host path must work end-to-end first**: you cannot meaningfully issue invitations until a workspace exists and seeding runs.

This document defines the **unified architecture** (front door, middleware, fork, security model, `invitations` data model). **Implementation order:** ship **Workflow A (Host)** first; **Workflow B (Invitee)** and the three invite mechanisms follow once Host creation and template seeding are stable.

## 2. Goals

1. **One front door** — Supabase Auth (magic link / OAuth) and one place users land after sign-in before entering a workspace.
2. **Traffic control** — **Not** in middleware for onboarding gating: the **`/app` root page** decides whether the user needs onboarding (see §8). **Host vs Invitee** fork reads invite context on **`/onboarding`** (and invite routes) without duplicating auth screens.
3. **Host onboarding** — Collect profile + BuddyBubble metadata, create `workspaces` row, add Host as `workspace_members` **admin**, run template seeding (default Bubbles, Kanban columns, etc.), then drop into the app.
4. **Invitee onboarding** — Validate a **durable invitation record** (not a generic Discord-style slug), enforce expiry, use limits, optional identity lock, and membership grant with correct RLS.
5. **Zero-trust invites** — QR, private link, and email/SMS each map to **rows** in `public.invitations` with revocation, audit-friendly fields, and server-side validation before any workspace-scoped UI.

### Non-goals (initial Host-first slice)

- Full Invitee UI and all three delivery mechanisms (can stub routes and DB only if needed).
- Replacing existing `/login` UX wholesale in one PR (iterate toward the spec).

**In scope for v1 Invitee launch:** **Approval waiting room** (§10) is **mandatory**, including bulk approval UX.

## 3. Current implementation map

| Area                | Location / artifact                               | Notes                                                                                                                                                                                                                                                                              |
| ------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BuddyBubble storage | `public.workspaces`                               | Product term “BuddyBubble”; `category_type` ∈ `business`, `kids`, `class`, `community`.                                                                                                                                                                                            |
| Membership          | `public.workspace_members`                        | Roles: `admin`, `member`, `guest`.                                                                                                                                                                                                                                                 |
| Auth profile        | `public.users`                                    | Created via `handle_new_user` on `auth.users` insert.                                                                                                                                                                                                                              |
| Middleware          | `middleware.ts`, `utils/supabase/middleware.ts`   | **Auth only:** refresh session; gate `/app` → `/login`; logged-in `/login` → `/app`. **Do not** use middleware to force `/onboarding` (see §8).                                                                                                                                    |
| App entry           | `src/app/(dashboard)/app/page.tsx`                | **Traffic controller for onboarding:** query `workspace_members`. **0 rows** → `redirect('/onboarding')`. **≥1** → resolve target workspace from cookie **`bb_last_workspace`** with membership-validated fallback (§8). Replaces static **`NoWorkspaces`** once onboarding ships. |
| Workspace shell     | `src/app/(dashboard)/app/[workspace_id]/page.tsx` | Post-onboarding “drop” target should align with **`/app/{workspace_id}`** (not a separate `/[workspace_id]/home` unless product adds it).                                                                                                                                          |

## 4. Design overview

### 4.1 Unified front door (authentication)

- **Mechanism:** Supabase Auth via existing patterns (extend with **Next.js Server Actions** where appropriate for magic-link/OAuth callbacks and profile updates).
- **Flow:** User provides email (and/or OAuth). Session is established; **`public.users`** row already exists from the auth trigger (may need **`full_name`** update during onboarding).
- **Principle:** All personas use the **same** `/login` (and recovery) experience.

### 4.2 Traffic controller (routing, invite cookie, middleware scope)

**Onboarding gate (not middleware):** See §8. **`src/app/(dashboard)/app/page.tsx`** is the **only** place that redirects authenticated users with **zero** `workspace_members` rows to **`/onboarding`**. Middleware **only** verifies authentication (and session refresh), not “has completed onboarding.”

**Target landing after auth:** an **onboarding interstitial** route, e.g. **`/onboarding`** (exact path TBD; keep under `(dashboard)` or public layout per UX).

**Fork logic (Host vs Invitee)** — run in **Server Components / Server Actions** on **`/onboarding`** (and related invite handlers), not in middleware:

1. Resolve **`invite_token`** from, in priority order:
   - **URL** — e.g. `/invite/{token}` sets the pre-auth cookie and/or redirects to `/onboarding?…` after login (avoid leaking token in logs where possible).
   - **Cookie** — pre-auth persistence across the **OAuth round-trip** (critical).

2. **Pre-auth invite cookie (OAuth-safe):** When a user hits `/invite/{token}` before they are logged in, set a **dedicated** cookie (e.g. `bb_invite_token` or signed equivalent). **Required attributes for implementation (Cursor):**
   - **`HttpOnly`** — not readable by JS.
   - **`SameSite=Lax`** — **not `Strict`**. After “Sign in with Google,” the browser returns from `accounts.google.com` via a top-level **GET**; `Lax` allows the cookie to be sent on that navigation. **`Strict` would often drop the cookie** and strand the user in the Host flow with no invite context.
   - **`Secure`** — `true` in production (HTTPS).
   - **`Path`** — `/` (or at least `/onboarding`, `/login`, `/app`, `/invite` as needed so post-auth routes see it).
   - **`Max-Age` / `Expires`** — **short TTL, e.g. 15 minutes**; enough to complete OAuth + magic link, not a long-lived session secret.

3. **If valid invite context exists** → **Workflow B (Invitee)** steps (after auth).
4. **If no invite context** → **Workflow A (Host)**.

Avoid **`localStorage` for the invite token** for server-side reads; prefer **cookie + server** or first-hop query.

**Middleware responsibilities (incremental):**

- Continue **session refresh** (current behavior).
- Allow **public** paths: `/login`, **`/invite/*`**, marketing pages, auth callbacks.
- **Do not** redirect to `/onboarding` based on a **`users` onboarding flag** — that pattern is **rejected** (§8).

Heavy validation stays in **Server Components / Server Actions** and **`security definer` RPCs** (see §6–§9).

### 4.3 Workflow A — Host (Creator) — build this first

| Step | User-facing                     | System                                                                                                                                                                                                                           |
| ---- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Name + BuddyBubble display name | `UPDATE public.users` (`full_name`); collect workspace `name`.                                                                                                                                                                   |
| 2    | Template / `category_type`      | User picks **Business / Kids / Community / Class** (matches DB check).                                                                                                                                                           |
| 3    | Transaction                     | **Insert** `workspaces` (`created_by` = `auth.uid()`). **Insert** `workspace_members` (**`admin`**). Run **seeding** (default `bubbles`, `board_columns`, etc.) — same transactional boundaries as existing or new seed routine. |
| 4    | Drop                            | **`redirect(`/app/${workspace_id}`)`** (align with current app router).                                                                                                                                                          |

**No `onboarding_completed` column on `users`:** Completion is implied by **at least one** `workspace_members` row; `/app` recomputes every visit (§8).

### 4.4 Workflow B — Invitee (Guest) — specified now, built after Host

| Step | User-facing        | System                                                                                                                                                            |
| ---- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Land on invite URL | Server: load `invitations` by `token`, apply §6 checks.                                                                                                           |
| 2    | Auth + name        | If new user, collect / confirm `full_name` (email may be locked by invite).                                                                                       |
| 3    | Transaction        | **`accept_invitation` RPC** (or pending queue per §10): insert `workspace_members` when approved / single-use path; never burn token if user already member (§6). |
| 4    | Drop               | **`redirect(`/app/${workspace_id}`)`**                                                                                                                            |

## 5. Database: `public.invitations`

Every QR, link, email, or SMS invite is a **row** (not a reusable slug).

| Column            | Type                                   | Notes                                                                                                                                                                     |
| ----------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`              | `uuid`                                 | PK, `gen_random_uuid()`.                                                                                                                                                  |
| `workspace_id`    | `uuid`                                 | FK → `public.workspaces(id)` `on delete cascade`.                                                                                                                         |
| `created_by`      | `uuid`                                 | FK → `public.users(id)`; Host who created the invite.                                                                                                                     |
| `token`           | `text`                                 | **Unique**, high-entropy (e.g. prefix `bb_inv_` + random). Store **hash** optional v2 — v1 can store opaque string if length sufficient; never store guessable sequences. |
| `invite_type`     | `text`                                 | Check constraint: `qr`, `link`, `email`, `sms`.                                                                                                                           |
| `target_identity` | `text` nullable                        | Normalized email or E.164 phone for targeted invites; `null` for QR/generic link flows.                                                                                   |
| `label`           | `text` nullable                        | Host-facing note (“Link for Sarah”) — audit/UX only.                                                                                                                      |
| `max_uses`        | `int` not null default `1`             | `1` for one-time QR / single-burn link; **>1** or “unlimited” patterns pair with **waiting room** (§10) for group invites.                                                |
| `uses_count`      | `int` not null default `0`             | Incremented atomically on successful accept.                                                                                                                              |
| `expires_at`      | `timestamptz` not null                 | Required for security.                                                                                                                                                    |
| `revoked_at`      | `timestamptz` nullable                 | Soft revoke; treat as invalid when set.                                                                                                                                   |
| `created_at`      | `timestamptz` not null default `now()` |                                                                                                                                                                           |

**Indexes:** unique on `token`; partial index on `(workspace_id)` where `revoked_at is null` for dashboards.

**RLS (high level):**

- **Hosts/admins:** `select` invitations for workspaces they administer; `insert` with `created_by = auth.uid()` and admin check; `update` for revoke only.
- **Anonymous / members:** **no direct client `select`** on raw tokens; validation via **Server Action / RPC** using controlled queries or `security definer` function that returns only `{ valid, workspace_id, invite_type, … }` without leaking other rows.

## 6. Security funnel (invite consumption)

For `GET /invite/{token}` and the post-auth accept step, the **`accept_invitation`** RPC (§9) should follow this order:

1. **Lookup** — `token` matches a single invitation row; read `workspace_id` (and other fields). If no row, error.
2. **Already a member (edge case)** — If `auth.uid()` **already exists** in `workspace_members` for that **`workspace_id`**, **stop with success**: return **`workspace_id`** (and any stable status code the app expects) so the client can **`redirect(`/app/${workspace_id}`)`**. **Do not** increment **`uses_count`** and **do not** “burn” or consume the invite. This covers repeat clicks, shared devices, and users who joined via another path.
3. **Revoked** — `revoked_at is null` (only applies when the caller is **not** already a member; existing members were handled in step 2).
4. **Time** — `expires_at > now()`; else “Invite expired.”
5. **Uses** — `uses_count < max_uses`; else “Already used.”
6. **Identity** — If `target_identity` set, authenticated user’s **verified** email or phone must match (normalize case for email; strict E.164 for SMS). OAuth emails count if Supabase marks email confirmed.
7. **Execute** — In a **single transaction** (or serializable flow): insert `workspace_members` (or enqueue **waiting room** per §10), increment `uses_count` where applicable, idempotent guard against double-submit (`uses_count` check in `WHERE` clause).

**Rate limiting:** Apply per-IP / per-token throttling on public invite endpoints to reduce brute force.

## 7. Three entry mechanisms (Invitee)

### 7.1 One-time QR

- Host action: “Generate QR” → insert row (`invite_type = 'qr'`, `max_uses = 1`, short `expires_at`, e.g. 1 hour).
- URL: `https://{app_domain}/invite/{token}`.
- UI: render QR (e.g. `qrcode.react`) from that URL client-side; no need to expose row `id`.
- After successful accept, `uses_count` reaches `max_uses` → QR dead.

### 7.2 Secure private link

- Host creates **named** link → one row per link; **`max_uses = 1`** for **immediate** single-burn entry, or **multi-use / pool** semantics when combined with **approval waiting room** (§10) for mass or group invites.
- Revoke: set `revoked_at` or move `expires_at` to past.
- **Leaked link:** Host revokes; pending queue entries for not-yet-approved users can be rejected in bulk from the dashboard.

### 7.3 Email / SMS (targeted)

- Host enters email or phone → Server Action creates row + sends via **Resend** / **Twilio** (secrets in env).
- Message contains same `/invite/{token}` URL.
- **Lock:** consumption requires **identity match** on `target_identity` (§6).

## 8. Onboarding gate: dynamic membership check (no user flag)

**Rejected:** Do **not** add **`onboarding_completed_at`** (or any similar boolean / timestamp) on **`public.users`**. State flags **go stale**: e.g. a user completes onboarding, later loses all memberships (workspace deleted or removed); a **`true` completion flag** would still send them to **`/app`** while **`workspace_members`** is empty, yielding empty or broken shell UX. A **live membership query** on **`/app`** avoids that.

**Adopted approach:**

- **Middleware** — **Authentication only** (session refresh, `/app` requires login, logged-in `/login` redirect). **No** onboarding completion logic in middleware.
- **`/app` root (`src/app/(dashboard)/app/page.tsx`)** — Acts as the **onboarding traffic controller** for authenticated users:
  1. Query **`workspace_members`** for `user_id = auth.uid()`.
  2. If **count = 0** → **`redirect('/onboarding')`** (Host path or Invitee path is then decided on `/onboarding` using invite cookie / params — §4.2).
  3. If **count > 0** → **`redirect(`/app/${workspace_id}`)`** using the resolution rules below.

**Last active workspace (`bb_last_workspace` cookie):**

1. **Cookie name:** **`bb_last_workspace`** — value is the **workspace UUID** (string) the user last opened in the app.
2. **Who writes it:** **Client-side**, whenever the user **switches workspace** in the UI (e.g. workspace picker / nav). Keep the cookie **client-updatable** so the shell can react without a round-trip-only server action; **`/app`** **reads** it on the server when deciding the redirect.
3. **`/app` resolution algorithm** (server, after loading the user’s `workspace_members`):
   - Read **`bb_last_workspace`** from the request cookies.
   - If the value is **missing**, **not a valid UUID**, or **not** among the user’s `workspace_id`s in **`workspace_members`** → **ignore** it.
   - **Otherwise** → redirect to **`/app/{that_uuid}`**.
   - If the cookie was ignored → **fallback:** choose **`workspace_id`** from the user’s memberships ordered by **`workspace_members.created_at DESC`** (most recently joined first).

**Schema note:** `public.workspace_members` does **not** currently include **`created_at`**. Ship a migration that adds **`created_at timestamptz not null default now()`** (and an index supporting **`(user_id, created_at desc)`** if needed). For **pre-existing** rows, use a one-time backfill (e.g. set to `now()` at migration time, or derive from audit data if available) so **`ORDER BY created_at DESC`** is stable.

The **source of truth** for “may use app” remains **membership rows**, not the cookie (the cookie is only a **hint** for which workspace to open first).

**Re-onboarding:** Users with **zero** memberships always hit **`/onboarding`** again; no stale flag overrides that.

## 9. RLS and siloing (principles)

- **Never** widen `workspace_members_insert` for “anyone with a token” without a **controlled server path** — anonymous clients must not arbitrarily insert membership.
- Prefer **`security definer` RPC** `accept_invitation(p_token text)` that:
  - Resolves the invite and `auth.uid()`,
  - **If the user is already in `workspace_members` for that workspace, returns `workspace_id` and exits** without consuming the invite (§6),
  - Otherwise validates revoke / expiry / uses / identity (§6),
  - Inserts membership **or** creates/updates **waiting-room** rows per §10,
  - Updates `uses_count` only on **actual** consumption paths,
  - Returns `workspace_id` (and status: immediate vs pending) for redirect or UI.
- Keep **workspace-scoped data** behind existing `is_workspace_member` patterns; invitations table is the **new edge** that must not become a bypass.

## 10. Approval waiting room (mandatory for v1)

**Requirement:** **Approval waiting room** ships in **v1** for **mass / group** invitations so Hosts are not forced to mint dozens of single-use links for the same BuddyBubble.

**Problem addressed:** ~20 parents on a kids’ team → one **multi-use** or **pool** invite flow with **pending** state beats **N** separate one-off links for the Host.

### 10.1 Data model (pending queue)

Use a dedicated table (name TBD; e.g. **`public.invitation_join_requests`**) or an equivalent normalized shape:

- Links to **`invitations.id`** and **`workspace_id`**.
- **`user_id`** (or `auth.users` id) of the requester after they authenticate.
- **Status:** `pending` | `approved` | `rejected` | `cancelled` (exact enum TBD).
- **Timestamps** for audit (`created_at`, `resolved_at`).
- **Unique constraint** where appropriate (e.g. one **pending** row per `(invitation_id, user_id)`).

**Flow:** Invitee hits invite → passes §6 checks **except** final membership insert → instead **insert pending row** (identity / expiry / uses rules still enforced per invite design). **No `workspace_members` row** until a Host **approves**.

**Consumption / `uses_count`:** Define whether multi-use invites increment **`uses_count`** on **request submitted** vs **approved** — document in migration comments; avoid double-burn on reject.

### 10.2 Host dashboard UX

- List pending requesters for a workspace / invite with **Approve** and **Reject** per row.
- **Select all:** Host can **select the full pending list** (checkbox column + “select all on this page” / “select all matching filter”) and **approve in one action** to avoid repetitive clicks for large groups.
- Optional: bulk reject for moderation.

### 10.3 Security notes

- **Leaked multi-use link:** Mitigate with **short `expires_at`**, **revoke** on the invitation row, and **reject** pending users who have not yet been approved.
- **Single-use QR / targeted email** paths may still **skip** the waiting room when `max_uses = 1` and product requires **instant** join — same RPC family branches on invite configuration.

## 11. Implementation phases (for Cursor / eng)

1. **`/app` onboarding controller + membership timestamp** — Migration: **`workspace_members.created_at`**. Update **`app/page.tsx`**: count **0** → **`/onboarding`**; **>0** → read **`bb_last_workspace`**, validate against memberships, else **`ORDER BY created_at DESC`** (§8). Middleware stays **auth-only** (§4.2).
2. **`/onboarding` + Host fork** — Workflow A UI + Server Actions; integrate seeding; pre-auth invite cookie **`SameSite=Lax`**, **~15 min** TTL (§4.2).
3. **Schema + RLS + RPC** — `invitations`, **`invitation_join_requests`** (or equivalent), indexes, admin policies, **`accept_invitation`** with **already-member** short-circuit (§6–§9).
4. **`/invite/[token]`** — public page + cookie handoff to auth; post-login consume / pending enqueue.
5. **Waiting room v1** — Host dashboard: pending list, per-row approve/reject, **select all + bulk approve** (§10).
6. **Host invite surfaces** — QR, link, email/SMS (Resend/Twilio); wire multi-use / waiting-room invite types.

## 12. Acceptance criteria

**Host-first slice**

- New user can sign in, complete Host onboarding, see **exactly one** workspace created with **admin** membership and **seeded** defaults.
- Authenticated user with **zero** `workspace_members` rows hitting **`/app`** is redirected to **`/onboarding`** (no **`users` onboarding flag**).
- User with **≥1** membership is redirected from **`/app`** per **`bb_last_workspace`** with validated fallback to **most recent `workspace_members.created_at`** (§8).
- **Middleware** does not implement onboarding gating; it only enforces authentication.

**Invitee / invites v1**

- **`accept_invitation`**: user **already** in `workspace_members` for the invite’s workspace gets **success + `workspace_id`** without consuming the invite (§6).
- Pre-auth invite cookie survives **OAuth** return: **`SameSite=Lax`**, short (**e.g. 15 min**) TTL (§4.2).
- **Approval waiting room** is implemented: pending queue, Host approve/reject, **select all + bulk approve** for large groups (§10).

---

_This document is the scaffolding contract for unified onboarding._
