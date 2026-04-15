# BuddyBubble

This repository is a **monorepo** containing:

1. **BuddyBubble** — a **Next.js 15** web application (App Router) for **local communities**: each group gets its own **Social Space** (a **BuddyBubble**; persisted as a `workspace` in the database), with **Bubbles** (topic or group areas), a **chat rail** for ongoing conversation, and a **Bubbleboard** (Kanban + calendar) for **events, meetups, experiences, playdates, meetings, fitness sessions**, and anything you organize as cards. **Invites** (QR, link, email, SMS) help people join in person or online; optional **subscriptions** and **analytics** exist for hosts who need them (especially **business** and **fitness** `workspaces.category_type` values in code).
2. **`apps/storefront`** — an **Astro** site that can serve as a **public window** for a community or small business and connect visitors into the app (lead capture, trials — see `.env.example` and `apps/storefront/.env.example`).

The root `package.json` description is minimal; technical detail below is inferred from **routing**, **`src/types/database.ts`**, **server modules**, and **`.env.example`**.

---

## Project overview

**BuddyBubble** is a **local community toolkit** built on **Supabase** (Postgres + Auth + Storage). It gives real-world groups an **online social space** that supports what they already do offline: **events, meetups, experiences, playdates, meetings, pickup games, classes, worship or school activities, fitness**, and other rhythms of neighborhood life.

Each **BuddyBubble** is a **Social Space**—a home base for a community. In the database this is a **`workspaces`** row (routes still use `/app/[workspace_id]` today). Inside a Social Space, **Bubbles** are smaller areas—by interest, team, age group, or project—with their own **chat** and **Bubbleboard** cards. The in-app copy describes this as **“chat and cards in your BuddyBubbles and Bubbles”** (`src/app/layout.tsx`, `src/app/page.tsx`). Cards (`tasks` in schema) carry **statuses**, **calendar scheduling** in that Social Space’s timezone (`workspaces.calendar_timezone`), **comments**, **attachments**, and **item types** such as `task`, `event`, `workout`, `program`, and more (`src/types/database.ts`)—so the board can read as a mix of to-dos, **experiences**, and **programs**, not only office work.

**Who it’s for**

- **Families, friend groups, schools, churches, sports organizers, clubs, and buddy crews** — anyone coordinating people and dates in the real world.
- **Local businesses** — the optional **public storefront** fields (`public_slug`, branding, etc.) and marketing **storefront** app can act as a **shop window on the web**, while the **chat rail** and **Bubbleboard** become the **door into the shop’s local community**: ongoing conversation plus visible **events or experiences** on the board.
- **Hosts** (owners/admins) manage who’s in the space, send **invites**, and can use **analytics** or **paid plans** where the product supports them—without the whole product reading as “enterprise SaaS.”
- **Members and guests** join bubbles they’re allowed into (`bubble_members` editor/viewer roles; **private** bubbles when you need a smaller circle).

**Why it exists (vision + code)**

- **Community first** — the center of gravity is **people, place, and showing up**, not generic “team ops.” The app wraps that in **shared chat + a shared board + calendar-aware cards**.
- **IRL + online together** — **QR and link invites**, onboarding paths, and invite analytics in code are aligned with **in-person** handoffs and word-of-mouth (“scan this at the field,” “here’s the link after service”).
- **Small-business friendly** — when a **Social Space** opts into public discovery, the stack supports **leads** and trials so a **local** business can grow its circle without losing the neighborhood feel.

---

## Core features

The table below lists **what the codebase implements**—mapped where it helps to the **community** story above (chat rail, Bubbleboard, invites, optional storefront and billing for hosts).

| Area                                | What exists in code                                                                                                                                                                                                                                                            |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Auth**                            | Supabase Auth; middleware session refresh (`utils/supabase/middleware.ts`); `/login`; `/auth/callback`; redirects for `/app` and `/onboarding` when unauthenticated.                                                                                                           |
| **Social Spaces (BuddyBubbles)**    | `workspace_members` with roles; `/app` picks a Social Space (cookie `BB_LAST_WORKSPACE_COOKIE` or first membership); `/app/[workspace_id]` loads `DashboardShell` (URL param name reflects the `workspaces` table).                                                            |
| **Bubbles**                         | Scoped to one **Social Space** (`bubbles.workspace_id`); optional **privacy**; `bubble_members` for per-bubble **editor** / **viewer**.                                                                                                                                        |
| **Chat**                            | `messages` per `bubble_id`; attachments JSON; optional `attached_task_id` linking a message to a Kanban card.                                                                                                                                                                  |
| **Bubbleboard (Kanban + calendar)** | `tasks` with `board_columns`, positions, `item_type`, `metadata`, archiving, **visibility** (`private` / `public` when the Social Space is public-facing), programs (`program_id`, `program_session_key`) — the main place for **events, experiences, and plans**.             |
| **Invites**                         | `/invite/[token]`; `invitations` with types **`qr` \| `link` \| `email` \| `sms`**; RPCs such as `accept_invitation`, `get_invite_preview`, join request flows (`invitation_join_requests`); HttpOnly **`bb_invite_token`** cookie set from middleware on invite paths.        |
| **Onboarding**                      | `/onboarding` consumes invite cookie via server actions; pending-approval path (`?invite=pending`).                                                                                                                                                                            |
| **People & invites**                | `/app/[workspace_id]/invites` (and related server actions under `invites/`).                                                                                                                                                                                                   |
| **Profile**                         | `users` row (bio, avatar, children names for certain categories); **Profile completion gate** for dashboard (`ProfileCompletionModal`, `completeProfileGateAction`, `isDashboardProfileComplete` in `src/lib/profile-helpers.ts`).                                             |
| **Fitness**                         | `fitness_profiles`; class domain tables (`class_offerings`, `class_instances`, `class_enrollments`); dashboard surfaces wired in `DashboardShell` (e.g. workout player, fitness boards — filenames reference Analytics, Classes, Programs).                                    |
| **Public window & leads**           | Optional **web-facing** presence: **`public_slug`**, **`custom_domain`**, **`is_public`**, **`public_branding`**; `leads` ties curious visitors to a community; `/api/leads/**`, storefront trial, AI preview routes — useful for **local businesses** welcoming neighbors in. |
| **Host subscriptions (optional)**   | Stripe (`STRIPE_*` in `.env.example`); `stripe_customers`, `workspace_subscriptions`, `billing_funnel_events`; subscription settings and webhooks — primarily wired for **business** / **fitness** Social Spaces in the schema.                                                |
| **Analytics**                       | `analytics_events` and per–Social Space analytics UI — helpful for **hosts** understanding how people found an invite or moved through onboarding, not only “conversion dashboards.”                                                                                           |
| **Email / SMS**                     | **Resend** and **Twilio** env vars for invite delivery (referenced in `.env.example`).                                                                                                                                                                                         |
| **AI**                              | `@google/genai` dependency; multiple `/api/ai/*` routes (card covers, workouts, programs, storefront preview, etc.).                                                                                                                                                           |
| **Cron**                            | `/api/cron/expire-member-trials`, `/api/cron/scheduled-tasks`.                                                                                                                                                                                                                 |
| **Demo / embed**                    | `/demo` with iframe-oriented docs in `.env.example` (`DEMO_WORKSPACE_IDS`, `MARKETING_FRAME_ANCESTORS`); `POST /api/demo/join`.                                                                                                                                                |
| **Admin**                           | `/admin/growth` behind `(admin)/layout.tsx` (founder-style access; `users.is_admin` exists in types).                                                                                                                                                                          |
| **Marketing storefront**            | Separate Astro app in `apps/storefront` (Turnstile, React islands, Vercel adapter per its `package.json`).                                                                                                                                                                     |

---

## Tech stack

| Layer                           | Technology (from `package.json` / npm workspace config)                                                                                                         |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Main web app**                | **Next.js 15**, **React 19**, **TypeScript**                                                                                                                    |
| **Styling**                     | **Tailwind CSS 4**, **tw-animate-css**, **next-themes**                                                                                                         |
| **UI**                          | **Radix UI** primitives, **Base UI**, **shadcn** (dependency), **lucide-react**, **motion**, **Sonner**, **CVA**, **tailwind-merge**                            |
| **Data & auth**                 | **Supabase** (`@supabase/supabase-js`, `@supabase/ssr`) — Postgres, Auth, Storage (e.g. avatars / attachments in code paths)                                    |
| **Server state / client state** | **Zustand** stores (e.g. `workspaceStore` for the active Social Space / `workspaces` row, `userProfileStore` in dashboard code)                                 |
| **DnD**                         | **@dnd-kit** (Kanban / ordering)                                                                                                                                |
| **Payments**                    | **Stripe** (`stripe`, `@stripe/react-stripe-js`)                                                                                                                |
| **Email / SMS**                 | **Resend**, **Twilio**                                                                                                                                          |
| **Other services**              | **@vercel/kv** (rate limiting / shared limits per `.env.example`), **Google Auth Library**, **Dompurify**, **react-markdown**, **pdfjs-dist**, **qrcode.react** |
| **AI**                          | **@google/genai**                                                                                                                                               |
| **Marketing site**              | **Astro 6** + **@astrojs/react** + **@astrojs/vercel** in `apps/storefront`                                                                                     |
| **Quality**                     | **Prettier**, **Husky**, **lint-staged**, **Vitest**, **`tsc --noEmit`** as `npm run lint`                                                                      |

---

## Key architecture

- **Multi-tenant “community graph”** — Each **Social Space** / **BuddyBubble** is stored as a **`workspaces`** row and holds many **Bubbles**; each bubble has **messages** (chat) and **tasks** (Bubbleboard cards). `workspace_members` carries who belongs to that Social Space; `bubble_members` can narrow who sees or edits a given bubble. Types in `src/types/database.ts` match **RLS**-oriented Supabase migrations under `supabase/migrations/`.

- **Next.js App Router** — Route groups such as `(dashboard)` wrap authenticated app pages; `src/app/(dashboard)/app/[workspace_id]/layout.tsx` verifies membership and renders `DashboardShell`.

- **Supabase session handling** — `middleware.ts` calls `updateSession` from `utils/supabase/middleware.ts` (cookie-backed `createServerClient` from `@supabase/ssr`). Invite paths also set **`bb_invite_token`** for downstream onboarding.

- **Server Actions** — Many mutations live under `src/app/(dashboard)/**` with `'use server'` (e.g. profile, member email visibility in a Social Space, invites). Some flows use **service role** clients (`src/lib/supabase-service-role.ts`) where documented (e.g. admin auth updates, analytics inserts, demo join) — **never** expose `SUPABASE_SERVICE_ROLE_KEY` to the client.

- **Large composite UI** — `DashboardShell` is the day-to-day **community room**: Social Space switcher (workspace rail in code), bubble picker, **chat**, **Bubbleboard**, calendar strip, modals (cards, people/invites, settings, profile completion), optional subscription reminders, and **embed** mode (`?embed=true`) for marketing iframes.

- **Monorepo** — Root app is the primary deployable; `apps/storefront` is an **npm workspace** package (`"workspaces": ["apps/*"]` in root `package.json`)—not the same word as **Social Space**—with its own scripts and env.

---

## Getting started

### Prerequisites

- **Node.js ≥ 20** (`engines` in root `package.json`)
- A **Supabase** project (URL + anon/publishable key + migrations applied)
- Optional: Stripe, Resend, Twilio, Vercel, KV — depending on which features you exercise (see `.env.example`)

### Install

From the repository root:

```bash
npm install
```

The repo also declares `"packageManager": "pnpm@10.30.3+sha512.…"`; if you use **pnpm**, run `pnpm install` instead and use `pnpm` for scripts analogously.

### Environment

1. Copy **`.env.example`** → **`.env.local`** at the repo root and fill in at minimum:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (or publishable key variants documented in the example file)
   - `SUPABASE_SERVICE_ROLE_KEY` — required for several server-only flows (demo join, some analytics, admin auth updates, etc.)

2. For the **Astro storefront**, copy **`apps/storefront/.env.example`** as needed.

`.env.example` contains detailed comments for OAuth redirect URLs (`/auth/callback`), site origin (`NEXT_PUBLIC_SITE_URL` / fallbacks), Stripe catalog JSON, Turnstile, and more.

### Database

Migrations live in **`supabase/migrations/`**. The TypeScript schema mirror is **`src/types/database.ts`** (with a note to regenerate types via Supabase CLI when the schema changes).

Typical workflow (from `.env.example`):

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

### Run the Next.js app

```bash
npm run dev
```

Default dev server (from `package.json`): **http://localhost:3000** (`next dev --port 3000 --hostname 0.0.0.0`).

### Run the Astro storefront

```bash
cd apps/storefront && npm run dev
```

(or use workspace flags / `npm run dev -w storefront` if configured in your environment)

### Common repo scripts (root)

| Script                                    | Purpose                                                           |
| ----------------------------------------- | ----------------------------------------------------------------- |
| `npm run dev`                             | Next dev server                                                   |
| `npm run build`                           | Next production build                                             |
| `npm run lint`                            | `tsc --noEmit`                                                    |
| `npm run format` / `npm run format:check` | Prettier                                                          |
| `npm run check`                           | Prettier check + lint + Next build + `astro check` for storefront |
| `npm run check:storefront`                | Astro diagnostics only                                            |
| `npm run verify:storefront`               | Astro check + Astro build (when you change `apps/storefront/`)    |
| `npm test`                                | Vitest                                                            |

**Git hooks:** `prepare` sets up **Husky**; commits run **lint-staged** (Prettier on staged files) and `npm run lint` per `package.json` / `docs/pre-commit-checklist.md`.

---

## Further reading in-repo

- **`docs/`** — troubleshooting, TDD notes, pre-commit checklist, Stripe examples, etc.
- **`supabase/migrations/`** — authoritative SQL for RLS, RPCs, and tables.

---

## License / ownership

Not specified in the scanned files; add your organization’s license and contribution guidelines if this repository is public or shared.
