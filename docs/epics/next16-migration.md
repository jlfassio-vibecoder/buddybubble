# Epic: Next.js 16 Migration

> Status: **Proposed (read-only audit)**
> Owner: Platform / Frontend
> Last updated: 2026-05-09
> Scope: Root Next.js app (`/` + `src/app/**`) only. The `apps/storefront` workspace is **Astro 6** and is unaffected by this migration except for the shared React 19 pin in `pnpm` overrides.
> Sources of truth: [Next.js 16 release notes](https://nextjs.org/blog/next-16) and the [v15 → v16 upgrade guide](https://nextjs.org/docs/app/guides/upgrading/version-16).

---

## 1. Executive Summary

We are on a strong baseline. Our Next.js 15 + React 19 monorepo is already **structurally ready** for Next.js 16:

- All Async Request APIs (`params`, `searchParams`, `cookies()`, `headers()`) are already awaited everywhere — there are **zero remaining synchronous-access call sites**.
- React 19.2 is already installed and pinned (`react@19.2.5`, `react-dom@19.2.5`, `@types/react@19.2.14`).
- The Node engine is already `>=20.19.0` (Next 16 requires `>=20.9.0`); TypeScript is `~5.8.2` (>=5.1 required).
- We use **no Edge runtime** and **no PPR / Cache Components / `unstable_*` cache APIs** — meaning the highest-risk Next 16 changes (cache model rewrite, `proxy.ts` Node-only constraint) hit our code with very small surface area.

The migration is therefore expected to be a **mechanical, codemod-driven upgrade** rather than a structural rewrite. The two material work items are:

1. **`middleware.ts` → `proxy.ts` rename.** A single 35-line file, plus its Supabase `updateSession` helper. No runtime change required (we are already on Node-friendly logic, never used `runtime: 'edge'`).
2. **Tooling migration:** Turbopack-by-default, ESLint flat config, removal of the `next lint` command, and the Next.js plugin / config bumps.

### Expected Benefits

- **Performance:** Turbopack is now stable and the default for `next dev` and `next build`; layout deduplication + incremental prefetching reduce navigation payloads with no code changes.
- **Caching ergonomics:** Adopting `updateTag()` (read-your-writes) and `revalidateTag(name, profile)` (stale-while-revalidate) is a strict upgrade for our Server Action mutation flows that currently rely on `revalidatePath()`.
- **Developer ergonomics:** `useEffectEvent`, View Transitions, Activity, and stable React Compiler integration become available; concurrent `next dev`/`next build` (separate output dirs + lockfile) reduce CI flakiness.
- **Reduced surface for bugs:** Removal of legacy AMP, `serverRuntimeConfig`, `next lint`, and `unstable_*` cache prefixes simplifies the framework footprint we ship and audit.

### Headline Risk

The main risk is **subtle middleware behavior change** when renaming `middleware.ts` to `proxy.ts` — the `proxy` route is hard-pinned to Node runtime and the matcher / cookie semantics need verification under load against our Supabase auth flow. This is the single highest-priority test gate.

---

## 2. Codebase Assessment

### 2.1 Async Request APIs — **NO BLOCKERS**

| Surface                   | File count                                                                        | Already async?                                                                                                                                |
| ------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/**/page.tsx`     | 15                                                                                | ✅ All `params`/`searchParams` already typed `Promise<...>` and awaited                                                                       |
| `src/app/**/layout.tsx`   | 4                                                                                 | ✅ Same — `await params` everywhere a dynamic segment is consumed                                                                             |
| `src/app/**/route.ts`     | 25                                                                                | ✅ Only one route (`api/analytics/workspace/[workspace_id]/route.ts`) consumes dynamic params, and it already awaits the `Promise<...>` shape |
| `cookies()` / `headers()` | 12 awaited call sites across page/route/action files + `utils/supabase/server.ts` | ✅ Every single call uses `const x = await cookies()` / `await headers()`                                                                     |

Concrete evidence (already-correct sites):

```16:18:src/app/api/analytics/workspace/[workspace_id]/route.ts
  _req: Request,
  { params }: { params: Promise<{ workspace_id: string }> },
) {
```

```7:9:utils/supabase/server.ts
export async function createClient() {
  const cookieStore = await cookies();
  const headerList = await headers();
```

Searches that returned **zero hits** (proving we have no Next-15-style sync fallbacks anywhere):

- `cookies()` / `headers()` used without `await`.
- `params: { ... }` typed as a plain object on a `page.tsx`/`layout.tsx`/`route.ts`.
- `searchParams` consumed without `await`.
- Synchronous `draftMode()`.

**Conclusion:** Async-API codemod is effectively a no-op. Risk: **None.** Action: run the codemod anyway as a safety net during the upgrade pass and confirm `tsc --noEmit` is green.

### 2.2 Middleware — **SMALL, DETERMINISTIC RENAME**

We have exactly one root middleware file:

```1:35:middleware.ts
import { type NextRequest } from 'next/server';
import { BB_INVITE_TOKEN_COOKIE, inviteTokenCookieOptions } from '@/lib/invite-cookies';
import { isPlausibleInviteTokenForCookie } from '@/lib/invite-token';
import { updateSession } from '@utils/supabase/middleware';

export async function middleware(request: NextRequest) {
  const response = await updateSession(request);
  ...
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|css|ico|woff2?)$).*)',
  ],
};
```

Plus the Supabase helper at `utils/supabase/middleware.ts` (~100 lines). Both files together are the **entire scope** of this work item.

| Concern                                                                   | Status                                                                                                                                 |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `export const runtime = 'edge'` anywhere in `src/app/**`                  | ✅ **Zero hits.** We have never used the Edge runtime.                                                                                 |
| External dependencies that require Edge                                   | ✅ None. `@supabase/ssr` uses Web `Headers`/`Request` APIs but runs equally well on Node.                                              |
| Calls into Node-only APIs from middleware                                 | ✅ Already Node-compatible (`@supabase/ssr` + `NextResponse`).                                                                         |
| Configuration flags that change name (`skipMiddlewareUrlNormalize`, etc.) | ✅ Not used.                                                                                                                           |
| Other middleware files in workspace                                       | `apps/storefront/src/middleware.ts` exists but belongs to the **Astro** app, which uses its own middleware system and is out of scope. |

**Migration shape:** rename `middleware.ts` → `proxy.ts`, rename the exported function `middleware` → `proxy`, and rename the helper module from `utils/supabase/middleware.ts` → `utils/supabase/proxy.ts` (purely cosmetic — the file currently exports `updateSession`, not `middleware`, so its public surface is already neutral).

**Risk:** **Low.** The codemod handles both renames; the main verification surface is auth flow E2E + the invite-token cookie path.

### 2.3 React 19 Strictness — **CLEAN**

| Pattern Next 16 / React 19 will reject or warn on                                                         | Hits in `src/**`                                                                                                                                                                                                   |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `React.FC` / `React.FunctionComponent` typing                                                             | **0**                                                                                                                                                                                                              |
| `defaultProps` on function components (removed in React 19)                                               | **0**                                                                                                                                                                                                              |
| `propTypes` (removed in React 19)                                                                         | **0**                                                                                                                                                                                                              |
| Class lifecycles `componentWillMount` / `componentWillReceiveProps` / `componentWillUpdate`               | **0**                                                                                                                                                                                                              |
| `UNSAFE_*` lifecycle prefixes                                                                             | **0**                                                                                                                                                                                                              |
| String refs                                                                                               | **0**                                                                                                                                                                                                              |
| Default `import React from 'react'` (deprecated; Next 16 will keep it working but flag it)                | **1** — `src/components/chat/AgentTypingIndicator.tsx`                                                                                                                                                             |
| `forwardRef(...)` usage (still supported in React 19, soft-deprecated in favor of `ref` as a normal prop) | **4 files / 8 occurrences** — all in shadcn-style UI primitives: `components/ui/dialog.tsx`, `components/ui/sheet.tsx`, `components/ui/radio-group.tsx`, `components/modals/task-modal/TaskModalCommentsPanel.tsx` |

`'use client'` directive is used on **207** files; `'use server'` on **17** action files — all aligned with current best practice. We have **zero** `unstable_*` imports, **zero** uses of the deprecated `revalidate` segment exports, and **zero** uses of `React.use(...)` to unwrap promises (which would suggest hand-rolled async-API workarounds).

**Conclusion:** No mandatory React-19 fixes. Two **optional** cleanups can be scheduled as follow-up PRs (not migration blockers):

1. Replace `forwardRef` with the React-19 prop-style `ref` in the four UI primitives.
2. Drop the lone default `React` import in `AgentTypingIndicator.tsx`.

### 2.4 Caching & Data Fetching — **SMALL FOOTPRINT, OPPORTUNISTIC IMPROVEMENT**

We are **not** an aggressive consumer of Next 15's implicit cache. Specifically:

| Pattern                                                                                       | Hits                                                                                                                                                           | Notes                                                                                                                                                |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `unstable_cache` / `unstable_noStore` / `unstable_cacheLife` / `unstable_cacheTag`            | **0**                                                                                                                                                          | We never adopted any `unstable_*` cache primitive — there is no rename work.                                                                         |
| `experimental_ppr` route segment / `experimental.ppr` config                                  | **0**                                                                                                                                                          | We never enabled PPR.                                                                                                                                |
| `cacheComponents`, `dynamicIO`, `'use cache'` directive                                       | **0**                                                                                                                                                          | We never adopted Cache Components / dynamicIO.                                                                                                       |
| `fetch(... cache: 'force-cache' / 'no-store')` or `fetch(... { next: { revalidate, tags } })` | **0**                                                                                                                                                          | We do not lean on `fetch()` cache options for revalidation — all server reads go through Supabase clients which are not part of the Next data cache. |
| `revalidatePath(...)` in Server Actions                                                       | **12 call sites across 3 files** — `bubble-actions.ts` (5), `invites/actions.ts` (4), `invites/member-actions.ts` (2), `invites/member-profile-actions.ts` (1) | Continues to work in Next 16.                                                                                                                        |
| `revalidateTag(...)` (single-arg form, deprecated in Next 16)                                 | **0**                                                                                                                                                          | Nothing to migrate.                                                                                                                                  |
| `export const dynamic = 'force-dynamic'`                                                      | **3 routes** — `api/cron/expire-member-trials`, `api/stripe/webhook`, `api/cron/scheduled-tasks`, `api/domains`                                                | Still supported; Stripe webhook and crons explicitly need fresh execution.                                                                           |
| `export const maxDuration = ...`                                                              | **6 AI / lead-capture routes**                                                                                                                                 | Still supported.                                                                                                                                     |
| `export const runtime = 'edge'`                                                               | **0**                                                                                                                                                          | Confirms our Node-by-default posture.                                                                                                                |

**Implication:** Because we never adopted the implicit `fetch()` / `unstable_cache` model, the **mandatory** migration work for caching is essentially zero. However, Next 16 gives us a clearly better tool for our 12 `revalidatePath()` mutation flows: `updateTag(tag)` (read-your-writes — perfect for invite/member mutations) and `revalidateTag(tag, 'max')` (stale-while-revalidate — good for analytics dashboards). Adopting these is an **optional Phase 5 enhancement** and not part of the v16 cutover.

### 2.5 Dependency Compatibility Matrix

| Package                                                                                                                                                                   | Current                                             | Next 16 status                                                                                                                                                            | Action                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `next`                                                                                                                                                                    | `^15.5.18`                                          | Requires `^16`                                                                                                                                                            | **Bump to `^16` (codemod handles config rewrite).**                                                                                                |
| `react` / `react-dom`                                                                                                                                                     | `19.2.5` (pnpm-overridden)                          | ✅ Next 16 ships against React 19.2                                                                                                                                       | Keep pin; verify after `next` bump.                                                                                                                |
| `@types/react` / `@types/react-dom`                                                                                                                                       | `19.2.14` / `19.2.3`                                | ✅ Compatible                                                                                                                                                             | None.                                                                                                                                              |
| `eslint`                                                                                                                                                                  | `^9.39.4`                                           | ✅ Flat-config compatible                                                                                                                                                 | Keep.                                                                                                                                              |
| `eslint-config-next`                                                                                                                                                      | `^15.5.18`                                          | Requires `^16` and **flat config**                                                                                                                                        | Bump + migrate `.eslintrc.json` → `eslint.config.mjs`.                                                                                             |
| `@next/eslint-plugin-next` (transitive)                                                                                                                                   | via `eslint-config-next@15`                         | Defaults to **flat config** in v16; legacy `.eslintrc` consumers must migrate                                                                                             | Codemod `next-lint-to-eslint-cli` handles this.                                                                                                    |
| `typescript`                                                                                                                                                              | `~5.8.2`                                            | ✅ Exceeds 5.1 minimum                                                                                                                                                    | None.                                                                                                                                              |
| Node engine (`package.json#engines.node`)                                                                                                                                 | `>=20.19.0`                                         | ✅ Exceeds 20.9 minimum                                                                                                                                                   | None.                                                                                                                                              |
| `@supabase/ssr`                                                                                                                                                           | `^0.10.2`                                           | ✅ Framework-agnostic; uses Web `Cookies`/`Headers` callbacks                                                                                                             | None — but verify `proxy.ts` rename doesn't break the cookie `setAll` round-trip in our `utils/supabase/middleware.ts` helper.                     |
| `@supabase/supabase-js`                                                                                                                                                   | `^2.103.3`                                          | ✅ Independent of Next runtime                                                                                                                                            | None.                                                                                                                                              |
| `@vercel/kv`                                                                                                                                                              | `^3.0.0`                                            | ✅ Node-only client; fine under proxy's mandatory Node runtime                                                                                                            | None.                                                                                                                                              |
| `stripe`                                                                                                                                                                  | `^22.0.1`                                           | ✅ Independent                                                                                                                                                            | None. The `api/stripe/webhook/route.ts` already reads raw body via `req.text()` — Next 16 does not change this.                                    |
| `@stripe/react-stripe-js` / `@stripe/stripe-js`                                                                                                                           | `^6.1.0` / `^9.1.0`                                 | ✅ Independent                                                                                                                                                            | None.                                                                                                                                              |
| `agora-rtc-sdk-ng`                                                                                                                                                        | `^4.24.3` (already in `transpilePackages`)          | ✅ Turbopack supports `transpilePackages`                                                                                                                                 | None — but smoke-test under Turbopack; this package historically caused webpack async-chunk edge cases.                                            |
| `next-themes`                                                                                                                                                             | `^0.4.6`                                            | ✅ Independent                                                                                                                                                            | None.                                                                                                                                              |
| `motion` (`framer-motion` successor)                                                                                                                                      | `^12.23.24`                                         | ✅ React 19 compatible                                                                                                                                                    | None.                                                                                                                                              |
| `lucide-react`                                                                                                                                                            | `^0.546.0`                                          | ✅ React 19 compatible                                                                                                                                                    | None.                                                                                                                                              |
| `pdfjs-dist`                                                                                                                                                              | `^4.10.38`                                          | Heavy, dynamic-imported only                                                                                                                                              | Smoke-test under Turbopack worker resolution.                                                                                                      |
| `zustand`, `@dnd-kit/*`, `@radix-ui/*`, `@base-ui/react`                                                                                                                  | latest patches                                      | ✅ React 19 compatible                                                                                                                                                    | None.                                                                                                                                              |
| `next.config.ts` features in use                                                                                                                                          | `transpilePackages`, `reactStrictMode`, `headers()` | ✅ All preserved in Next 16                                                                                                                                               | None — but `experimental.turbopack` would need to move to top-level `turbopack` if we ever add Turbopack-specific options. We currently have none. |
| `vercel.json`                                                                                                                                                             | `framework: nextjs` + 2 cron routes                 | ✅ Unchanged                                                                                                                                                              | None.                                                                                                                                              |
| `next/image` usage                                                                                                                                                        | **0 in `src/**`\*\*                                 | N/A — none of the new image-config defaults (`qualities=[75]`, `imageSizes` minus 16, `localPatterns.search`, `minimumCacheTTL=4h`, `maximumRedirects=3`) affect us today | Document in onboarding rules so future contributors know about the new defaults.                                                                   |
| `next/legacy/image`, `images.domains`, `serverRuntimeConfig`, `publicRuntimeConfig`, `getConfig`, `next/amp`, `useAmp`, `skipMiddlewareUrlNormalize` (all removed in v16) | **0 hits**                                          | ✅ Nothing to remove                                                                                                                                                      | None.                                                                                                                                              |
| Parallel routes (`@slot/`) requiring `default.js`                                                                                                                         | **0 hits**                                          | ✅ N/A                                                                                                                                                                    | None.                                                                                                                                              |
| `generateImageMetadata`, `generateSitemaps` (now async props)                                                                                                             | **0 hits**                                          | ✅ N/A                                                                                                                                                                    | None.                                                                                                                                              |
| `next lint` script                                                                                                                                                        | `"lint:eslint": "next lint"` in `package.json`      | ❌ Removed in v16                                                                                                                                                         | Replace with `eslint .` (codemod available).                                                                                                       |

**Browser support note:** Next 16 drops Chrome <111, Edge <111, Firefox <111, Safari <16.4. Our SaaS analytics should be sampled before launch to confirm this is acceptable for our user base.

---

## 3. Phased Implementation Plan

Each phase ends in a green CI run on a feature branch. We do **not** advance to the next phase until the prior one is merged.

### Phase 1 — Tooling & Dependency Bumps

**Goal:** Land Next 16 in development without changing application code.

Tasks:

1. Create branch `chore/next16-phase1-tooling`.
2. Run the official codemod:
   ```bash
   pnpm dlx @next/codemod@canary upgrade latest
   ```
   Review and stage every diff manually — the codemod will (a) bump `next`, `eslint-config-next`, and (b) rewrite the Turbopack config keys.
3. Verify pinned versions in `package.json`:
   - `next: ^16`, `eslint-config-next: ^16`, `react: 19.2.5`, `react-dom: 19.2.5` (unchanged).
4. Update the dev/build scripts in `package.json`:
   - Drop `--turbopack` flags (Turbopack is default in v16).
   - Replace `"lint:eslint": "next lint"` with `"lint:eslint": "eslint ."`.
5. Run `pnpm dlx @next/codemod@canary next-lint-to-eslint-cli .` to migrate `.eslintrc.json` → flat config.
6. Re-run the full `pnpm check` matrix (`format:check`, `lint`, `lint:eslint`, `test:deno-integration`, `build`, `check:storefront`).

Acceptance criteria:

- [ ] `pnpm install` completes; `pnpm-lock.yaml` reflects only Next 16-line bumps and codemod-introduced changes.
- [ ] `pnpm dev` starts on Turbopack with no warnings about `--turbopack` flag deprecation.
- [ ] `pnpm build` succeeds on Turbopack; no `webpack` config errors.
- [ ] `pnpm lint:eslint` runs against the new flat config and passes.
- [ ] `tsc --noEmit` is clean.
- [ ] No runtime regression in local smoke test of `/login`, `/app`, `/onboarding`.

### Phase 2 — Async API Codemod (defensive)

**Goal:** Run the async-API codemod even though our audit shows zero blocking sites — this is our safety net.

Tasks:

1. Run `pnpm dlx @next/codemod@canary next-async-request-api .`.
2. Run `pnpm dlx next typegen` to regenerate `PageProps<...>` / `LayoutProps<...>` / `RouteContext<...>` helpers.
3. Optional refactor: migrate the **15** page files, **4** layout files, and **1** dynamic route handler to the new typed helpers (e.g. `PageProps<'/app/[workspace_id]/settings/analytics'>`) — improves type safety, not required for the cutover.

Acceptance criteria:

- [ ] Codemod produces **zero** material edits to source (only re-formatting tolerable).
- [ ] All 15 pages, 4 layouts, and 25 routes type-check under the new helpers.
- [ ] No regression in `pnpm test`.

### Phase 3 — Middleware → Proxy Redesign

**Goal:** Move from the deprecated middleware convention to `proxy.ts` while keeping the Supabase auth flow byte-identical.

Tasks:

1. Rename:
   - `middleware.ts` → `proxy.ts` (codemod will do this; verify).
   - Exported function name: `middleware` → `proxy`.
   - Rename the helper module `utils/supabase/middleware.ts` → `utils/supabase/proxy.ts` for naming consistency. Update the two import sites (`proxy.ts` itself + any tests).
2. Confirm that the `config.matcher` array is preserved exactly (asset exclusion + Next internals).
3. Confirm the `BB_INVITE_TOKEN_COOKIE` cookie write still happens after `updateSession(request)` returns the response.
4. Add a regression note in `docs/pre-commit-checklist.md`: "When editing `proxy.ts`, run the auth E2E flow."
5. Document in `docs/refactor/next16-proxy-rename.md` that the Edge runtime is **not** available in `proxy` and that any future need for Edge logic must use a separate handler (Route Handler with `runtime='edge'`).

Acceptance criteria:

- [ ] `proxy.ts` exists at the project root; `middleware.ts` is removed.
- [ ] `pnpm dev` shows no "deprecated middleware convention" warning.
- [ ] Auth E2E (Playwright `e2e/`) passes:
  - Cold-load `/app` while unauthenticated → redirects to `/login?next=/app`.
  - Successful magic-link login → lands on `/app/<workspaceId>` with `bb_last_workspace_id` cookie.
  - `/login` while authenticated → redirects to last workspace.
  - `/update-password` gating respects `bb_password_setup_pending=1`.
  - Visiting `/invite/<token>` writes `bb_invite_token` cookie iff token is plausible.
- [ ] No 5xx in production canary deploy for the first 24h after cutover.

### Phase 4 — Testing & Deployment

**Goal:** Cut over to production with rollback ready.

Tasks:

1. Full `pnpm check` matrix on CI.
2. Targeted manual QA:
   - Stripe webhook delivery against test mode (raw `req.text()` body parsing).
   - Two cron paths (`/api/cron/scheduled-tasks`, `/api/cron/expire-member-trials`) trigger and complete within `maxDuration`.
   - AI route handlers with `maxDuration: 90/300` complete on Vercel.
   - Agora live-video room connect/disconnect under Turbopack-built bundle.
3. Deploy to a Vercel preview branch; run Playwright against the preview URL.
4. Promote to production; keep the previous build pinned for instant rollback.
5. Monitor:
   - 4xx/5xx rates on `/api/*` and on the auth gate (`updateSession`) for 48h.
   - Bundle size baseline; `next build` no longer reports `size` / `First Load JS` (per Next 16 release notes) — switch to Vercel Analytics / Lighthouse for the regression baseline.

Acceptance criteria:

- [ ] All Vercel preview deploys are green on the first attempt.
- [ ] Production canary 24h: **0** new 5xx classes on auth or webhook routes.
- [ ] `pnpm-lock.yaml` is the only lockfile diff in the production deploy.
- [ ] Rollback runbook executed against a staging environment to verify it works.

### Phase 5 — Optional Enhancements (post-cutover, separate Epics)

These are **explicitly out of scope** for the v15 → v16 cutover but become available once we are on v16:

- **`updateTag` adoption:** Replace 12 `revalidatePath(...)` call sites in `bubble-actions.ts` and `invites/*` server actions with `updateTag` (read-your-writes for the user who just submitted) + `revalidateTag` for collaborators.
- **`refresh()` from Server Actions:** Replace any client-side `router.refresh()` after server mutation with the new `refresh()` from `next/cache`.
- **React Compiler:** Set `reactCompiler: true` after collecting baseline build-time and bundle metrics (note: Babel-based, expect longer builds).
- **`cacheComponents`:** Evaluate enabling for the marketing/demo routes (`/`, `/demo`, `/invite/[token]`) where mixing static/dynamic in a single page would deliver a UX win.
- **`forwardRef` cleanup** in the four shadcn UI primitives + drop the lone default `React` import in `AgentTypingIndicator.tsx`.
- **Migrate `@vercel/kv` rate-limiters** off `@vercel/kv` toward Upstash directly (already flagged in `lib/storefront-preview-rate-limit.ts`).

Each of these gets its own ticket and acceptance criteria.

---

## 4. Risks, Gotchas, and Rollback Strategy

### 4.1 Specific Gotchas for Our App

| #   | Risk                                                                                                                                                                                                                                                                                                                                                                                   | Likelihood | Impact                                   | Mitigation                                                                                                                                                        |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Supabase auth cookie regression in `proxy.ts`.** Our `updateSession()` helper rebuilds `NextResponse.next({ request })` inside the Supabase `cookies.setAll()` callback and copies cookies onto redirect responses. A subtle change in how `proxy.ts` returns responses (vs. `middleware.ts`) could break either the cookie round-trip or the `/login`-while-authenticated redirect. | Medium     | High (full auth outage)                  | Phase 3 acceptance criteria gate on the auth E2E suite. Add a temporary debug log of `supabaseResponse.cookies.getAll().map(c => c.name)` for one preview deploy. |
| 2   | **Turbopack vs `agora-rtc-sdk-ng`.** This package is already in `transpilePackages`, but historically caused webpack async-chunk edge cases. Turbopack handles chunking differently.                                                                                                                                                                                                   | Medium     | Medium (live-video shell breaks on prod) | Smoke-test live-video room join during Phase 1. If broken, fall back to `next build --webpack` short-term while we ship a Turbopack-compatible adapter.           |
| 3   | **`pdfjs-dist` worker resolution under Turbopack.** Dynamic worker imports historically need `turbopack.resolveAlias` or explicit worker URL handling.                                                                                                                                                                                                                                 | Low        | Medium (PDF preview broken)              | Test the PDF flow that loads `pdfjs-dist`. If it breaks, add the appropriate `turbopack` config rather than reverting.                                            |
| 4   | **Stripe webhook signature verification.** Stripe needs the raw bytes of the request body. We rely on `req.text()` + `dynamic = 'force-dynamic'` — this is unchanged in Next 16 but is the highest-blast-radius integration we have.                                                                                                                                                   | Low        | High (silent payment-event drops)        | Send a test event from Stripe dashboard against preview deploy; assert `200` and presence of corresponding `billing_funnel_events` row.                           |
| 5   | **Vercel cron routes.** Crons reference `framework: nextjs` and Node runtime; Next 16 keeps both, but the `.next/dev` vs `.next` output dir change could affect any Vercel adapter expectations.                                                                                                                                                                                       | Low        | Medium (silent cron skip)                | Verify cron invocations in Vercel dashboard within 24h post-deploy.                                                                                               |
| 6   | **ESLint flat-config pulling in different rules.** `next/core-web-vitals` shape has changed between flat and legacy configs.                                                                                                                                                                                                                                                           | Medium     | Low                                      | Run `pnpm lint:eslint` immediately after the codemod; treat any new errors as Phase 1 fixes, not blockers.                                                        |
| 7   | **Storefront pnpm-lock churn.** The shared `pnpm` overrides for `react@19.2.5` / `react-dom@19.2.5` apply to `apps/storefront` too. A Next 16 install can re-resolve transitive React versions.                                                                                                                                                                                        | Low        | Low                                      | Run `pnpm verify:storefront` (already a check command) in Phase 1.                                                                                                |
| 8   | **Browser baseline (Chrome/Edge/FF 111+, Safari 16.4+).** Our user base may include older devices.                                                                                                                                                                                                                                                                                     | Unknown    | User-facing                              | Pull last-90d analytics for browser versions before merge; if non-trivial cohort is below the new floor, ship a polyfill notice or block.                         |
| 9   | **Removed `next lint` script in CI.** Our `pnpm check` script invokes `next lint`. If we miss the rename, CI silently passes (script no-ops) instead of failing.                                                                                                                                                                                                                       | Medium     | Medium (lint regression goes unnoticed)  | Phase 1 explicitly updates the script and grep-checks for `"next lint"` in `.github/workflows/**`.                                                                |
| 10  | **Concurrent `next dev` lockfile.** Next 16 prevents two `next dev` instances on the same project. Anyone running our test runners that spawn dev servers must adapt.                                                                                                                                                                                                                  | Low        | Low                                      | Document in `docs/pre-commit-checklist.md`.                                                                                                                       |

### 4.2 Rollback Strategy

We treat this as a **single, atomic cutover** with two reversal levels:

**Level 1 — Vercel re-promotion (60 seconds):** the previous v15.5.18 production build remains pinned in Vercel deployments. If any of the above gotchas fire post-promotion, immediately re-promote the prior deployment from the Vercel dashboard. No code change required.

**Level 2 — Branch revert (15 minutes):** if Level 1 is not sufficient (e.g. a downstream consumer has assumed the new behavior), revert the merge commit on `main`, push, let CI re-deploy. The codemod produces a single coherent diff that is well suited to `git revert`.

**Pre-conditions for cutover:**

- All four phases pass on a preview deploy with the auth E2E suite green.
- A 30-minute monitoring window post-promotion is staffed.
- Stripe test webhook + cron invocations have been validated against the preview deploy.
- A diff of `pnpm-lock.yaml` has been reviewed by a second engineer.

**Post-cutover verification (T+24h):**

- Auth success rate within ±0.5% of baseline.
- Stripe webhook 2xx rate at 100%.
- Cron invocations: 2 per day (`scheduled-tasks` hourly, `expire-member-trials` daily) — both seen in logs.
- No new high-cardinality 5xx classes in `/api/*`.

If all four pass at T+24h, we close the epic. Phase 5 enhancement tickets are then opened independently.

### Runtime versions (Node 22 floor)

After the migration cutover, the workspace requires **Node.js >=22.12.0** (see root `.nvmrc` and `engines` in both package manifests). CI reads `.nvmrc`; Vercel project settings must be set to Node 22.x separately. See [`docs/operations/runtime-versions.md`](../operations/runtime-versions.md).

---

## Appendix A — Files Touched by This Epic

| Phase            | Files                                                                                                                                                                                                                                                                       |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1                | `package.json`, `pnpm-lock.yaml`, `.eslintrc.json` → `eslint.config.mjs`, `next.config.ts` (codemod-driven), `next-env.d.ts` (regenerated)                                                                                                                                  |
| 2                | (defensive) — same 15 pages + 4 layouts + 25 routes scanned; expected diff: zero                                                                                                                                                                                            |
| 3                | `middleware.ts` → `proxy.ts`; `utils/supabase/middleware.ts` → `utils/supabase/proxy.ts`; `docs/pre-commit-checklist.md` updated                                                                                                                                            |
| 4                | None — verification only                                                                                                                                                                                                                                                    |
| 5 (out of scope) | 12 server-action call sites in `bubble-actions.ts`, `invites/actions.ts`, `invites/member-actions.ts`, `invites/member-profile-actions.ts`; 4 UI primitives in `components/ui/{dialog,sheet,radio-group}.tsx` and `components/modals/task-modal/TaskModalCommentsPanel.tsx` |

## Appendix B — Files Confirmed UNCHANGED

These are not touched by the migration despite often being affected in other Next 16 migrations:

- All 15 `page.tsx` files — already async.
- All 4 `layout.tsx` files — already async, no `default.js` parallel slots needed.
- All 25 `route.ts` files — already use `await params` where applicable; `dynamic`/`maxDuration` segment exports continue working.
- `vercel.json` — unchanged.
- `apps/storefront/**` — Astro 6, out of scope.
- `supabase/**` — Deno-isolated, out of scope.

## Appendix C — Out of Scope

- Migration to `cacheComponents` / `'use cache'` directive (Phase 5+).
- Adoption of React Compiler (Phase 5+).
- Migration off `@vercel/kv` (separate ticket — already flagged in code).
- Re-architecture of any AI route to streaming (separate epic).
- Browser baseline communication / deprecation notice (separate product decision).
