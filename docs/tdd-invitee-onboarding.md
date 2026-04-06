# TDD: Invitee onboarding (rich invite preview & waiting room)

This document specifies the **invitee** path: someone who receives an invite link and should **join a host’s BuddyBubble** without going through **host** onboarding (creating their own workspace first).

## Goals

1. **Trust before auth** — On `/invite/[token]`, show a **rich preview** (host name, workspace name, category/theme) so the screen does not feel like a generic phishing login.
2. **Zero-trust data access** — Do **not** expose `workspaces` or `users` to anonymous clients via normal RLS `select`. Use a **narrow `SECURITY DEFINER` RPC** that validates the token and returns only public-safe fields.
3. **OAuth-safe handoff** — Persist the raw invite token in **`bb_invite_token`** (`HttpOnly`, `SameSite=Lax`, **24-hour** TTL) so slow email confirmation and OAuth round-trips do not strand users; **`invitations`** still enforce `expires_at` / `max_uses` in RPCs (see `src/lib/invite-cookies.ts` and `middleware.ts`).
4. **Post-auth routing** — After sign-in, invitees should land on **`/onboarding`** (not `/app` by default) so **`consumeInviteOnboarding`** can run `accept_invitation` using the cookie.
5. **Waiting room UX** — If `accept_invitation` returns `pending`, redirect to **`/onboarding?invite=pending`** and show a clear **“Waiting for host approval”** state with optional **“Start your own BuddyBubble”** escape hatch.

## Database: `get_invite_preview(p_token text)`

- **Migration:** `supabase/migrations/20260421140000_get_invite_preview.sql`
- **Security:** `SECURITY DEFINER`, `search_path = public` — bypasses RLS **only inside this function**; no broad grants on `workspaces` / `users` for `anon`.
- **Validation (same spirit as `peek_invitation`):** token exists, not revoked, `expires_at > now()`, `uses_count < max_uses`.
- **Joins:** `invitations` → `workspaces` (name, `category_type`) → host label from `users` row for `invitations.created_by` (`full_name`, else `email`, else `'Host'`).
- **Response (JSON):**
  - Success: `{ "valid": true, "workspace_name", "category_type", "host_name", "requires_approval" }`
  - Failure: `{ "valid": false, "error": "not_found" | "revoked" | "expired" | "depleted" | "invalid_token" }`

**Note:** `peek_invitation` remains available for lighter previews; the invite page uses **`get_invite_preview`** for the full rich card.

## Frontend: `/invite/[token]`

- **Server Component** calls `get_invite_preview` via the Supabase server client.
- **Invalid token:** polite error copy + link home (see `invitePreviewUserMessage` in `src/lib/invite-preview-parse.ts`).
- **Valid token:**
  - **Theme:** `category_type` drives page background + card chrome (`src/lib/invite-preview-theme.ts`) and CSS variables `--invite-accent` / `--invite-accent-soft` on the card wrapper.
  - **Copy:** “**{host_name}** invited you to join **{workspace_name}**” plus a short line about approval vs instant join when `requires_approval`.
  - **Auth (unauthenticated):** `InvitePreviewAuth` — Google OAuth and “Sign in with email” → **`/login?next=/onboarding`** (both use **`/auth/callback?next=/onboarding`** for OAuth).
  - **Authenticated:** existing `InviteJoinForm` to run `accept_invitation` via server action.
- **Cookie:** Middleware sets `bb_invite_token` on every `/invite/*` response so the token is present before and after auth UI (no need to duplicate in the page for the happy path).

## Post-login: onboarding consume

- **`InviteOnboardingGate`** (`src/app/(dashboard)/onboarding/invite-onboarding-gate.tsx`) calls **`consumeInviteOnboarding`** which reads the cookie, invokes **`accept_invitation`**, clears the cookie, then:
  - **`joined` / `already_member`:** set last-workspace cookie → redirect `/app/{workspace_id}`.
  - **`pending`:** redirect **`/onboarding?invite=pending`**.

## Waiting room (invitee UI)

- **`InvitePendingPanel`** (`src/app/(dashboard)/onboarding/invite-pending-panel.tsx`) — spinner, explanation, **Check status** (`router.refresh()`), link to **`/onboarding`** to start a **new** BuddyBubble (no `invite=pending` query).
- Invitees **without** a membership continue to resolve here until the host approves from **People & invites** (`/app/{id}/invites?tab=pending`).

## Distinction from host onboarding

| Flow    | Entry                                      | Primary outcome                   |
| ------- | ------------------------------------------ | --------------------------------- |
| Host    | No workspaces, no invite cookie            | `NoWorkspaces` / create workspace |
| Invitee | `/invite/...` cookie or post-login consume | Join or enqueue pending approval  |

## Operational checklist

1. Apply migration **`20260421140000_get_invite_preview.sql`** (and realtime migration for join-request updates if used).
2. Confirm Supabase **Anonymous** can execute **`get_invite_preview`** (grants in migration).
3. Optional: add **`invitation_join_requests`** to **Realtime** publication so dashboard badges update live (see existing migration `20260421120000_realtime_invitation_join_requests.sql`).

## Future enhancements (out of scope)

- Persisted **notifications** rows for join requests (mobile push, cross-device read state).
- Magic-link-only invitee path without password login.
- Localized copy and branded email/SMS templates referencing the same preview strings.
