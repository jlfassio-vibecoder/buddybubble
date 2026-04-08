# Technical design v1: Public community portals (Astro storefront + Next.js CRM)

## 1. Problem

BuddyBubble today is a **private, authenticated** product: the CRM runs on **Next.js** (e.g. `app.buddybubble.app`), and we are introducing a **public Astro storefront** (e.g. `buddybubble.app`) for marketing and, now, **per-organization public portals**.

Organizations need a **branded, SEO-friendly, read-only** view of selected community content so visitors can discover the group and move into the authenticated app—without exposing internal operational data.

## 2. Goals

| Goal                           | Description                                                                                                                                          |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Public storefronts (Astro)** | Each opted-in BuddyBubble can expose a read-only portal under a stable URL path (e.g. `buddybubble.app/grace-church`) rendered by `apps/storefront`. |
| **Custom domains (Vercel)**    | Optional mapping of a org-owned hostname (e.g. `gracechurch.com`) to that same portal experience, without leaking other tenants.                     |
| **Private CRM (Next.js)**      | Members and admins continue to manage the workspace under the authenticated app (today: `/app/[workspace_id]`).                                      |
| **Data segregation**           | Admins mark specific **cards** (tasks) as public; everything else stays member-only.                                                                 |
| **CRM bridge**                 | Clear CTAs (“Join”, “RSVP”) send visitors into the existing **Supabase auth** flow and land them in the correct tenant context after sign-in.        |

## 3. Non-goals (v1)

- Public **chat/messages** or full **Kanban** parity on the web.
- Anonymous **writes** (RSVP payloads, comments) without separate design (would need service role or authenticated endpoints).
- Renaming internal tables (`workspaces`, `tasks`)—see existing product lexicon in migrations (`workspaces` = BuddyBubble tenant, `bubbles` = channel).

## 4. Current codebase baseline (relevant facts)

These constraints are **already true** in the repo and should drive the design:

| Area                  | Current state                                                                                                               | Implication                                                                                                                   |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Tenant table          | `public.workspaces` — **no** `slug`, `custom_domain`, `is_public`, or `branding` columns yet                                | New migration required for portal identity + branding.                                                                        |
| Channels              | `public.bubbles` has `workspace_id`; **`public.tasks` references `bubble_id`**                                              | Anon RLS on `tasks` must resolve **task → bubble → workspace** (not a direct `tasks.workspace_id`).                           |
| CRM routes            | Dashboard is **`/app/[workspace_id]`** (UUID), not slug-based                                                               | Slug URLs for humans (`/c/[slug]`) are **new**; alternatively, portals only use Astro URLs and CRM stays UUID-based.          |
| Workspace settings UI | `WorkspaceSettingsModal` is **calendar timezone–focused** (`src/components/modals/WorkspaceSettingsModal.tsx`)              | “Public portal” settings are a **new** surface (tab or section).                                                              |
| Task editing          | `TaskModal` (`src/components/modals/TaskModal.tsx`) persists task rows                                                      | A **visibility** control belongs here; follow existing patterns for staged columns (`isMissingColumnSchemaCacheError`, etc.). |
| Login redirects       | `LoginForm` uses **`?next=`** with `safeNextPath()` (`src/lib/safe-next-path.ts`)—not `redirect_to`                         | Bridge links should use **`/login?next=...`** (same-origin path only).                                                        |
| Next middleware       | `middleware.ts` refreshes Supabase session + invite cookie—**not** tenant routing                                           | Storefront hostname → slug mapping lives in **Astro** (or Vercel routing), not this file.                                     |
| Astro app             | `apps/storefront` — SSR (`output: 'server'`), `@astrojs/vercel`, Tailwind, `@supabase/supabase-js`, `PUBLIC_SUPABASE_*` env | Fetch public data **server-side** with the anon key; rely on **RLS** for enforcement.                                         |

## 5. Data model (Supabase)

### 5.1 `public.workspaces` (BuddyBubble / tenant)

Add (names illustrative—finalize in migration review):

| Column            | Type      | Notes                                                                                                                                                     |
| ----------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `public_slug`     | `text`    | **Unique**, URL segment for `buddybubble.app/{slug}`. Validate: lowercase, allowed charset (e.g. `[a-z0-9-]`), reserved words (`app`, `api`, `login`, …). |
| `custom_domain`   | `text`    | Nullable, **unique** where not null. Store normalized host (lowercase, no scheme/path).                                                                   |
| `is_public`       | `boolean` | Default `false`. When `true`, anon may read **public-scoped** rows per RLS.                                                                               |
| `public_branding` | `jsonb`   | e.g. `{ "logo_url", "hero_url", "primary_color", "description" }`—keep PII out.                                                                           |

**Index / constraint recommendations:**

- Unique partial index on `custom_domain` where `custom_domain is not null`.
- Optional: generated column or check constraint for `public_slug` format.

**Naming note:** Prefer `public_slug` over bare `slug` to avoid confusion with `board_columns.slug` (Kanban column slugs), which already exists in the schema.

### 5.2 `public.tasks` (cards)

Add:

| Column       | Type                | Notes                                             |
| ------------ | ------------------- | ------------------------------------------------- |
| `visibility` | `text` check / enum | `'private' \| 'public'`, default **`'private'`**. |

**Product rule:** Only rows with `visibility = 'public'` may appear on the Astro site, and only if the parent workspace is `is_public = true`.

**Optional v1 filters:** Restrict public display to certain `item_type` values (e.g. events/announcements) via storefront queries even if RLS allows broader reads—reduces accidental oversharing when admins toggle public.

### 5.3 RPC / resolver helpers (recommended)

To avoid duplicated join logic in multiple policies:

- `public.workspace_id_for_task(_task_id uuid) returns uuid` (task → bubble → workspace), or reuse patterns from `workspace_id_for_bubble`.
- `public.workspace_public_slug(_workspace_id uuid) returns text` for middleware lookups (optional).

For **custom domain → slug** resolution at the edge, a tiny **`security definer` RPC** readable by `anon` (e.g. `resolve_public_portal_by_host(host text)`) returning only `{ slug, workspace_id }` when `is_public`) can keep middleware fast and avoid exposing extra columns via broad table SELECT. Alternatively, use a **Supabase Edge Function** with service role—tradeoffs: ops complexity vs. hiding internal ids.

## 6. Security & RLS

**Principle:** The Astro server uses the **anon** Supabase client only. All public access is enforced in Postgres; the app must not rely on “hiding” columns in the UI alone.

### 6.1 `workspaces`

- Add policy: **`SELECT` for `anon`** where `is_public = true` and limit columns if using column-level privileges is not used (Supabase typically uses row policies; minimize selectable columns via **views** if needed).

Alternatively, expose only a **`public_workspace_profiles` view** (safe columns) + `SELECT` for `anon` on the view—cleaner than widening base table access.

### 6.2 `tasks`

- Add policy: **`SELECT` for `anon`** where:
  - `visibility = 'public'`, and
  - parent workspace satisfies `is_public = true` (via join `tasks` → `bubbles` → `workspaces`).

Existing member policies remain; **deny-by-default** for anon on all other rows.

### 6.3 Storage & attachments

Task files live in a **private** bucket with signed URLs (`TaskModal` / attachment helpers). **v1 recommendation:** public storefront queries **omit** `attachments` or strip them server-side, unless you add explicit **public asset** rules and a separate bucket—otherwise risk of confusing UX or accidental policy widening.

### 6.4 Rate limiting & abuse

Custom domains and public endpoints should be paired with **CDN / WAF** thinking (Vercel) and optional **RPC rate limits** or caching headers for SSR pages.

## 7. Architecture

### 7.1 Two Vercel projects

| Project                       | Role                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------ |
| **Astro** (`apps/storefront`) | Public HTML, SEO, anon Supabase reads, hostname → portal routing.                    |
| **Next.js** (repo root)       | Authenticated CRM, member/admin RLS, portal **settings** and **visibility** toggles. |

Custom domains for orgs attach to the **Astro** project. The CRM stays on `app.*`.

### 7.2 Storefront routing

1. **Path-based:** `buddybubble.app/[public_slug]` implemented as Astro dynamic routes (e.g. `src/pages/[public_slug]/index.astro`—exact file naming TBD).
2. **Custom host:** Vercel **middleware** (Astro middleware or `middleware.ts` in the Astro app) resolves `Host` → `public_slug` (via Supabase RPC or edge config) and **rewrites** internally to the same page component. **Browser URL stays the custom domain.**

**Note:** This is **storefront** middleware, distinct from Next’s `middleware.ts`.

### 7.3 CRM bridge (auth)

Target pattern aligned with current auth:

- Link to **`https://app.buddybubble.app/login?next=/app/<workspace_uuid>`** once `workspace_id` is known server-side on Astro, **or**
- Introduce **`/c/[public_slug]`** in Next that **301/302** to `/app/[workspace_id]` after server-side lookup—then `next=/c/grace-church` works with a **slug resolver route**.

**Important:** Continue using **`safeNextPath`** semantics—only same-origin relative paths.

Invite flows already use `invite_token` and cookies; portal CTAs may parallel **join request** / invite links where product requires it (out of scope unless specified).

### 7.4 Vercel Domains API (automation)

When an admin sets `custom_domain` in CRM:

- A **server-only** Next.js Route Handler (or server action) with **secrets** (`VERCEL_TOKEN`, team/project IDs for the **Astro** project) calls Vercel’s API to add the domain and drive verification.
- Never expose tokens to the browser; audit **who** can trigger provisioning (workspace **admin** only).

## 8. CRM UI (Next.js)

| Surface                | Change                                                                                                                                 |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Workspace settings** | New “Public portal” section: `public_slug`, branding fields, `is_public`, `custom_domain` status (and DNS instructions while pending). |
| **Task modal**         | Visibility control: **Private** vs **Public** (icons/copy as needed); persists `tasks.visibility`.                                     |

**Custom domain UX:** Show DNS records + verification state returned from Vercel; block `is_public` toggling until DNS verified if product requires.

## 9. Astro storefront (implementation sketch)

- Server-side: `createClient` with `PUBLIC_SUPABASE_URL` + `PUBLIC_SUPABASE_ANON_KEY`.
- Load workspace by `public_slug` where `is_public`, then list public tasks (with sensible ordering, e.g. `scheduled_on` for events).
- Shared types: follow `apps/storefront/src/types/database-sharing.ts`—prefer a future `packages/*` workspace or TS path to `src/types/database.ts` at repo root.

## 10. Phased delivery (suggested)

1. **Migration:** `workspaces` portal columns + `tasks.visibility` + RLS + indexes; regenerate/update `src/types/database.ts`.
2. **Next.js:** Settings UI + TaskModal visibility; optional slug → workspace resolver route if using `/c/...`.
3. **Astro:** `[public_slug]` page, anon queries, CTAs to login.
4. **Vercel:** Middleware rewrites for custom domains; Domains API automation.
5. **Hardening:** Views vs raw table access, attachment stripping, monitoring.

## 11. Open questions

- **Single vs multi-channel:** Tasks are per `bubble_id`. Should the public portal aggregate all bubbles in a workspace or only selected bubbles? If needed, add `bubbles.is_public` or similar.
- **SEO / caching:** ISR vs SSR revalidation for portal pages on Vercel.
- **Internationalization:** Slug collisions and reserved paths across locales.

---

_Document version: 1.0 — aligned with repository layout as of scaffolded `apps/storefront` and Next.js CRM routes under `src/app`._
