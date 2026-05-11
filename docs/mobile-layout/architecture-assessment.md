# Mobile layout — architectural assessment & gap analysis

> **Companion to** [`README.md`](./README.md). The README describes _what is_; this document evaluates _how well it is built_, identifies real gaps observed in the source, and proposes a prioritized remediation map.
>
> **Method.** Code-level audit on 2026-05-10, **refreshed 2026-05-11** after Waves **1–4**: F1 drawer stack; **Wave 1** platform plumbing (F2–F6: `viewportFit: 'cover'`, `100dvh`, `--mobile-tab-bar-h`, `MobileHeader` / `MobileTabBar` safe-area + `aria-current`); **Wave 2** Kanban F8 (`TouchSensor` + `snap-proximity`); **Wave 3** canonical breakpoint [`viewport.ts`](../../src/lib/viewport.ts) (F7) and [`useMobileShellState`](../../src/hooks/use-mobile-shell-state.ts) + [`MobileShellProvider`](../../src/hooks/use-mobile-shell-state.ts) (F10); **Wave 4** Vitest mobile smoke ([`mobile-crm-tab.test.ts`](../../src/lib/mobile-crm-tab.test.ts), [`use-is-narrow-below-md.test.tsx`](../../src/hooks/use-is-narrow-below-md.test.tsx), [`mobile-chrome.test.tsx`](../../src/components/layout/mobile-chrome.test.tsx)) for F12 (unit scope only). Line references drift — verify in-repo. **Severity** uses a P0/P1/P2 ladder defined in §3. See [`tdd-layout-column-drawers.md`](../tdd-layout-column-drawers.md) for the column-collapse contract.

---

## 1. Executive summary

The mobile layout is a **pragmatic CSS-first overlay** on top of a desktop multi-column shell, gated by a single `layoutMobile` flag and the `?tab=` URL parameter. It works, but it has **structural debt and several outright bugs** that mostly originate from two root causes:

1. **The mobile experience is bolted onto a desktop-first state machine.** Mobile-only props (`omitMobileNonChatStrip`, `hideCalendarForMobileBoard`, `hideMainStageBelowMd`) still live on `WorkspaceMainSplit`; many mobile-only branches remain in `DashboardShellInner` — though **tab + drawer chrome** now flows through [`useMobileShellState`](../../src/hooks/use-mobile-shell-state.ts) under [`MobileShellProvider`](../../src/hooks/use-mobile-shell-state.ts) (see §6.6).
2. **Residual debt is mostly integration and coverage shape, not baseline iOS breakage.** Global `viewportFit: 'cover'`, dashboard `h-[100dvh]`, shared `--mobile-tab-bar-h`, and header/tab-bar safe-area wiring are **shipped** (Wave 1). Remaining gaps: **Playwright still desktop-only** (F12 remainder), **`RichMessageComposer`** and other ad-hoc `bottom-*` callers not yet routed through the tab-bar token, theater **`compact`** conflation (F9), and god-component decomposition (F15).

Net assessment: the mobile shell is **fit for notched iPhones at the chrome layer** and **covered by targeted Vitest** for tab normalization, narrow detection, and chrome mount smoke tests. **F1 is resolved** (§5.1). **Shipped-wave P0s F2–F4 and P1s F5–F8, F7 are closed** in the headline table. Open work clusters around **F9**, **F10 URL-replay for the drawer**, **F11–F15**, and **F12 Playwright / broader Vitest**.

### Headline findings

| #   | Finding                                                                                                                                                                                                                                                                                                                                                                                                                           | Severity           | Where                                                                                                                                                                                                                                         |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | ~~Drawer rails overflow~~ **RESOLVED** — vertical stack: `MobileWorkspaceStrip` + `BubbleSidebar` (`isMobileDrawerMode`); see §5.1                                                                                                                                                                                                                                                                                                | —                  | [`MobileWorkspaceStrip.tsx`](../../src/components/layout/MobileWorkspaceStrip.tsx), [`MobileSidebarSheet.tsx`](../../src/components/layout/MobileSidebarSheet.tsx), [`bubble-sidebar.tsx`](../../src/components/dashboard/bubble-sidebar.tsx) |
| F2  | ~~No global `viewport-fit=cover`~~ **RESOLVED** — `export const viewport` with `viewportFit: 'cover'` in [`layout.tsx`](../../src/app/layout.tsx)                                                                                                                                                                                                                                                                                 | —                  | —                                                                                                                                                                                                                                             |
| F3  | ~~`h-screen` URL-bar shift~~ **RESOLVED** — dashboard root `h-[100dvh]`                                                                                                                                                                                                                                                                                                                                                           | —                  | [`dashboard-shell.tsx`](../../src/components/dashboard/dashboard-shell.tsx)                                                                                                                                                                   |
| F4  | ~~`MobileTabBar` a11y~~ **RESOLVED** — `aria-current="page"` on tab buttons; tab + Menu use [`useMobileShellState`](../../src/hooks/use-mobile-shell-state.ts)                                                                                                                                                                                                                                                                    | —                  | [`MobileTabBar.tsx`](../../src/components/layout/MobileTabBar.tsx)                                                                                                                                                                            |
| F5  | ~~`MobileHeader` top inset~~ **RESOLVED** — `pt-[env(safe-area-inset-top,0px)]`                                                                                                                                                                                                                                                                                                                                                   | —                  | [`MobileHeader.tsx`](../../src/components/layout/MobileHeader.tsx)                                                                                                                                                                            |
| F6  | ~~Magic `bottom-20` / `bottom-24`~~ **RESOLVED (shell)** — `--mobile-tab-bar-h` on dashboard root; body `pb`, tab bar `h`, comment alert + exit-selection use `calc(var(--mobile-tab-bar-h)+0.5rem)`; other floaters (e.g. composer) may still use literals                                                                                                                                                                       | **P1** (remainder) | `RichMessageComposer.tsx` etc.                                                                                                                                                                                                                |
| F7  | ~~Two breakpoint literals~~ **RESOLVED** — canonical `NARROW_MAX_QUERY` in [`viewport.ts`](../../src/lib/viewport.ts); `useIsNarrowBelowMd`, `WorkoutPlayer`, `dashboard-shell` `matchMedia` call sites                                                                                                                                                                                                                           | —                  | —                                                                                                                                                                                                                                             |
| F8  | ~~Kanban touch / snap fight~~ **RESOLVED** — `TouchSensor` `{ delay: 250, tolerance: 5 }` + `PointerSensor`; mobile columns `max-md:snap-proximity`                                                                                                                                                                                                                                                                               | —                  | [`KanbanBoard.tsx`](../../src/components/board/KanbanBoard.tsx)                                                                                                                                                                               |
| F9  | `embedMode` and `layoutMobile` are merged via `compact = layoutMobile \|\| embedMode` in the theater layout — different concerns conflated                                                                                                                                                                                                                                                                                        | **P1**             | `live-theater-layout.types.ts:71`                                                                                                                                                                                                             |
| F10 | **`?tab=` + drawer** partially centralized — [`useMobileShellState`](../../src/hooks/use-mobile-shell-state.ts) + [`MobileShellProvider`](../../src/hooks/use-mobile-shell-state.ts) wrap `DashboardShellInner`; `LayoutCommands` / effects / [`MobileTabBar`](../../src/components/layout/MobileTabBar.tsx) use `setTab` / `setDrawerOpen`. Drawer open is **still not URL-replayable**; `localStorage` collapse flags unchanged | **P1**             | `dashboard-shell.tsx`, `use-mobile-shell-state.ts`                                                                                                                                                                                            |
| F11 | `ResizableHandle` always renders the grip even when the panel group is `disabled={layoutMobile}` — non-functional drag UI on phones                                                                                                                                                                                                                                                                                               | **P2**             | `resizable.tsx:58–68`, `dashboard-shell.tsx:1925, 1979`                                                                                                                                                                                       |
| F12 | **Partially resolved (Vitest).** [`mobile-crm-tab.test.ts`](../../src/lib/mobile-crm-tab.test.ts), [`use-is-narrow-below-md.test.tsx`](../../src/hooks/use-is-narrow-below-md.test.tsx), [`mobile-chrome.test.tsx`](../../src/components/layout/mobile-chrome.test.tsx). **Playwright** still Desktop Chrome only                                                                                                                 | **P1**             | `playwright.config.ts:24`                                                                                                                                                                                                                     |
| F13 | No portrait/landscape distinction; landscape phone shows full chrome, leaving < 200 px of vertical content area                                                                                                                                                                                                                                                                                                                   | **P2**             | global                                                                                                                                                                                                                                        |
| F14 | `useIsNarrowBelowMd` defaults to `false` and runs in `useLayoutEffect` — narrow viewports flash desktop layout for one paint                                                                                                                                                                                                                                                                                                      | **P2**             | `use-is-narrow-below-md.ts:6–9`                                                                                                                                                                                                               |
| F15 | `DashboardShellInner` (~ 2200 lines) interleaves mobile and desktop concerns; mobile branches are scattered across ≥ 12 effects/handlers                                                                                                                                                                                                                                                                                          | **P2**             | `dashboard-shell.tsx`                                                                                                                                                                                                                         |

Counts: **0 active P0** (F2–F4 shipped). **F1** closed (§5.1). **P1** (active): F6 remainder outside shell, F9, F10 drawer URL, F12 Playwright gap; **P2**: F11–F15. Detail and historical remediation narrative in §4–§7; some subsections below describe **pre-fix** state for archaeology — prefer the headline table + file links for truth.

---

## 2. Architecture in one page

```
                  ┌─────────────────────────────────────────────┐
                  │  Detection (1 hook, 1 type)                  │
                  │  ─────────────────                           │
                  │  useIsNarrowBelowMd()  ─►  narrow: bool      │
                  │  normalizeMobileTab()  ─►  'chat'|'board'|   │
                  │                              'calendar'      │
                  └────────────────┬────────────────────────────┘
                                   ▼
        ┌────────────────────────────────────────────────────────┐
        │  Composition (single owner: DashboardShellInner)        │
        │  ──────────────────────────────────────────             │
        │  layoutMobile = !embedMode && narrow                    │
        │  MobileShellProvider → useMobileShellState()             │
        │    (tab, setTab, drawerOpen, setDrawerOpen)               │
        │  + ~12 effects that branch on layoutMobile               │
        │  + LayoutCommands.focus*() → mobileShell.setTab on mobile │
        └────────────────┬───────────────────────────────────────┘
                         ▼
   ┌──────────────────────────┴──────────────────────────────────┐
   │  Mobile chrome                │  Desktop fallthrough          │
   │  MobileHeader                 │  WorkspaceRail              │
   │  MobileTabBar                 │  BubbleSidebar (fixed width) │
   │  MobileSidebarSheet (Sheet)   │  WorkspaceMainSplit          │
   │    └ MobileWorkspaceStrip     │                               │
   │       (drawer only; not rail) │                               │
   └─────────────────────────────────┴─────────────────────────────┘
                         │
                         ▼
   ┌─────────────────────────────────────────────────────────────┐
   │  Content panes (shared with desktop, mobile via Tailwind)    │
   │  ChatArea ─┐                                                 │
   │  KanbanBoard ── responsive via max-md: / md:hidden classes   │
   │  CalendarRail ─┘                                             │
   │  TaskModal (full-screen below md)                            │
   └─────────────────────────────────────────────────────────────┘
```

**Two coordination contracts** carry signals across the boundary:

- **`?tab=`** in the URL is the source of truth for which pane is on screen.
- **`localStorage` `chatCollapsed` / `kanbanCollapsed` / `calendarCollapsed`** continue to drive the underlying desktop layout, and a mobile-only effect (in §4 of the README) keeps them coherent with `?tab=`.

**Tab bar height contract (shell):** the dashboard root sets **`--mobile-tab-bar-h`** (`calc(4rem + env(safe-area-inset-bottom, 0px))`); the main column `pb`, [`MobileTabBar`](../../src/components/layout/MobileTabBar.tsx) `h-[var(--mobile-tab-bar-h)]`, and key floating toasts in [`dashboard-shell.tsx`](../../src/components/dashboard/dashboard-shell.tsx) use that token. Other modules may still use literal `bottom-*` until migrated (**F6** remainder).

---

## 3. Severity ladder

We use three severities throughout this document:

| Tag    | Definition                                                                                                          |
| ------ | ------------------------------------------------------------------------------------------------------------------- |
| **P0** | User-visible defect on a common device or accessibility regression. Should be fixed in the next mobile-touching PR. |
| **P1** | Architectural fragility, scaling risk, or coverage gap. Should land before the next mobile-targeted feature.        |
| **P2** | Cleanliness or future-proofing. Schedule into refactor windows.                                                     |

---

## 4. Strengths to preserve

Not all of the implementation is debt — these decisions are **good** and any rework should keep them:

1. **Single-route mobile.** No `/m/...` route tree; mobile is a CSS swap. This avoids the classic two-codebase trap and keeps SEO/auth flows simple.
2. **URL-as-state for the active tab.** `?tab=` survives reloads, deep links, and viewport changes. The dashboard reconciles desktop collapse state from the URL, not the other way around.
3. **One detection hook.** `useIsNarrowBelowMd()` is cheap, correct, and used consistently in `DashboardShellInner`. It is a good seam to extend (e.g., to a new `useViewportProfile()` hook if tablet/landscape are added).
4. **Drawer pattern is canonical.** Re-using Radix `Sheet` for `MobileSidebarSheet` rather than a hand-rolled overlay is the right call. **Desktop `WorkspaceRail` stays untouched in the drawer** — a dedicated [`MobileWorkspaceStrip.tsx`](../../src/components/layout/MobileWorkspaceStrip.tsx) owns the horizontal workspace switcher + footer controls so mobile layout does not fork the desktop rail component.
5. **Bottom tab bar is fixed and persistent.** This matches platform convention on iOS/Android and avoids navigation regressions when the keyboard opens (the bar is below the viewport when the keyboard pushes content up — iOS still treats `position: fixed` correctly because of `visualViewport`).
6. **Modal and theater layouts are aware of `layoutMobile`.** The `LiveVideoSessionShell` plan is unit-tested for the mobile branch (`live-theater-layout.test.ts`), and the `TaskModal` correctly raises its z-index above the tab bar.
7. **Embed mode is an explicit escape hatch.** `?embed=true` deterministically falls back to desktop chrome — which is the right behavior for marketing iframes.

---

## 5. P0 findings (must-fix)

### 5.1 F1 — RESOLVED: drawer overflow (vertical stack + mobile strip)

**Original issue.** The drawer used `flex-row` with `WorkspaceRail` (`w-[97px] shrink-0`) beside `BubbleSidebar` (`w-[302px] shrink-0`). Sum **399 px** exceeded the sheet max width **384 px** (`24rem`), clipping bubble controls on common phones.

**Current implementation (closed).**

1. **[`MobileSidebarSheet.tsx`](../../src/components/layout/MobileSidebarSheet.tsx)** — Inner wrapper is **`flex-col`** with **`pt-[max(3rem,env(safe-area-inset-top))]`** (clears Radix close control + notch) and **`pb-[env(safe-area-inset-bottom,0px)]`**.
2. **[`MobileWorkspaceStrip.tsx`](../../src/components/layout/MobileWorkspaceStrip.tsx)** — Mobile-only strip: **icons row** (`h-16`, horizontal scroll, `snap-x snap-proximity`, `touch-pan-x`, hidden scrollbar) + **controls row** (`h-14`, Invite / Create / Fitness / Profile). **Inactive** workspace tiles use a faint **`ring-1 ring-inset ring-white/10`**; **active** uses **`ring-2 ring-inset ring-white`** plus the **3 px bottom bar**. Icons and controls rows share **`px-4`** so the first icon and Invite align. No vertical divider between Invite and the trailing control group (flex `justify-between`).
3. **[`dashboard-shell.tsx`](../../src/components/dashboard/dashboard-shell.tsx)** — Drawer children: `<MobileWorkspaceStrip {...drawerStripProps} />` then `<BubbleSidebar {...drawerBubbleProps} hideWorkspaceTitle isMobileDrawerMode />`. **`WorkspaceRail.tsx` is not used inside the drawer** (desktop rail unchanged).
4. **[`bubble-sidebar.tsx`](../../src/components/dashboard/bubble-sidebar.tsx)** — Optional **`hideWorkspaceTitle`** and **`isMobileDrawerMode`** (`w-full min-w-0 flex-1` when expanded in drawer) so the bubble list fills remaining height without a fixed 302 px width.

**Follow-ups (non-blocking).** Vitest smoke for chrome components is in [`mobile-chrome.test.tsx`](../../src/components/layout/mobile-chrome.test.tsx). Playwright mobile projects remain optional (**F12** remainder).

### 5.2–5.4 Wave 1 P0s — **RESOLVED** (F2, F3, F4)

These items shipped; the following is the **post-fix** summary (historical narrative removed).

- **F2 — [`src/app/layout.tsx`](../../src/app/layout.tsx)** exports `viewport` with `viewportFit: 'cover'` so `env(safe-area-inset-*)` is real on iOS.
- **F3 — [`dashboard-shell.tsx`](../../src/components/dashboard/dashboard-shell.tsx)** dashboard root uses **`h-[100dvh]`** instead of `h-screen`.
- **F4 — [`MobileTabBar.tsx`](../../src/components/layout/MobileTabBar.tsx)** tab buttons use **`aria-current="page"`**; the bar consumes **`useMobileShellState()`** (must render under [`MobileShellProvider`](../../src/hooks/use-mobile-shell-state.ts) from [`dashboard-shell.tsx`](../../src/components/dashboard/dashboard-shell.tsx)).

---

## 6. P1 findings (architectural fragility & coverage gaps)

### 6.1 **`MobileHeader` top safe-area (F5) — RESOLVED**

[`MobileHeader.tsx`](../../src/components/layout/MobileHeader.tsx) includes **`pt-[env(safe-area-inset-top,0px)]`** (with F2 `viewport-fit=cover`).

### 6.2 **Tab bar clearance token (F6) — RESOLVED in shell; remainder elsewhere**

Dashboard root inline style sets **`--mobile-tab-bar-h`**; main body **`pb-[var(--mobile-tab-bar-h)]`**, [`MobileTabBar`](../../src/components/layout/MobileTabBar.tsx) **`h-[var(--mobile-tab-bar-h)]`**, and the comment-alert / exit-selection floating controls use **`bottom-[calc(var(--mobile-tab-bar-h)+0.5rem)]`** on mobile. **`RichMessageComposer`** and other widgets may still use hard-coded `bottom-*` — migrate opportunistically.

### 6.3 **Canonical narrow breakpoint (F7) — RESOLVED**

[`src/lib/viewport.ts`](../../src/lib/viewport.ts) exports **`NARROW_MAX_QUERY`**. [`use-is-narrow-below-md.ts`](../../src/hooks/use-is-narrow-below-md.ts), [`WorkoutPlayer.tsx`](../../src/components/fitness/WorkoutPlayer.tsx), and ad-hoc `matchMedia` in [`dashboard-shell.tsx`](../../src/components/dashboard/dashboard-shell.tsx) use it. Unit coverage: [`use-is-narrow-below-md.test.tsx`](../../src/hooks/use-is-narrow-below-md.test.tsx), [`mobile-crm-tab.test.ts`](../../src/lib/mobile-crm-tab.test.ts).

### 6.4 **Kanban touch + scroll snap (F8) — RESOLVED**

[`KanbanBoard.tsx`](../../src/components/board/KanbanBoard.tsx) registers **`TouchSensor`** with **`{ delay: 250, tolerance: 5 }`** alongside **`PointerSensor`**. Horizontal column scroller uses **`max-md:snap-proximity`** (not `snap-mandatory`). **`PointerSensor`** still sees touch-derived pointer events — if QA shows stray drags on fast swipes, consider **`MouseSensor`** for mouse-only (documented caveat from Wave 2 plan).

### 6.5 `embedMode` and `layoutMobile` are conflated as "compact" (F9)

```71:71:src/features/live-video/theater/live-theater-layout.types.ts
  const compact = layoutMobile || embedMode;
```

The two are not the same:

- `layoutMobile` = phone, touch, small viewport, fixed bottom nav.
- `embedMode` = third-party iframe, untrusted height, no nav at all, may be desktop-sized.

Today both branches use the same `vertical_compact_session` shell, but coupling them means:

- A future "compact desktop" feature has nowhere to land.
- An embed-mode bug looks like a mobile bug, and vice versa.

**Architectural fix.** Pass them as two booleans into `LiveTheaterLayoutInputs`:

```ts
inputs: { isMobile: boolean; isEmbed: boolean; ... }
```

and let `deriveLiveTheaterLayoutPlan` produce different shells when they diverge. The single-`compact` shorthand can stay as a derivation _inside_ the function, not at the input boundary.

### 6.6 Mobile state seam (**F10** — partially addressed)

| Concern                      | Owner                                                                                                                          | Persisted?          | Replayable from URL? |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------- | -------------------- |
| Active tab                   | `?tab=` via **`useMobileShellState().setTab`**                                                                                 | Yes (URL)           | ✅                   |
| Drawer open                  | **`useMobileShellState().drawerOpen`** (React context from [`MobileShellProvider`](../../src/hooks/use-mobile-shell-state.ts)) | No                  | ❌                   |
| Underlying collapse flags    | `localStorage`                                                                                                                 | Yes (per workspace) | ❌                   |
| Force a tab from a deep link | `?view=messages` (and `?tab=*`)                                                                                                | Yes                 | ✅                   |

**Shipped:** [`DashboardShell`](../../src/components/dashboard/dashboard-shell.tsx) wraps **`MobileShellProvider`** around `DashboardShellInner`; **`LayoutCommands`**, class-deck / async-player effects, **`onSelectBubble`**, and **[`MobileTabBar`](../../src/components/layout/MobileTabBar.tsx)** use the hook for **`setTab`** / **`setDrawerOpen`**. Deep-link **`useEffect`** that maps `urlTab` → desktop collapse flags is unchanged.

**Still open:** URL-replayable drawer (`?nav=open` or similar); optional further extraction from `DashboardShellInner` (F15).

### 6.7–6.8 CI coverage for mobile (**F12** — Vitest landed; Playwright pending)

**Vitest (Wave 4):** [`mobile-crm-tab.test.ts`](../../src/lib/mobile-crm-tab.test.ts), [`use-is-narrow-below-md.test.tsx`](../../src/hooks/use-is-narrow-below-md.test.tsx), [`mobile-chrome.test.tsx`](../../src/components/layout/mobile-chrome.test.tsx) (`MobileHeader`, `MobileWorkspaceStrip` with empty store, **`MobileTabBar` inside `MobileShellProvider`**).

**Playwright:** still **Desktop Chrome** only in [`playwright.config.ts`](../../playwright.config.ts) — add mobile projects when ready (**F12** remainder).

---

## 7. P2 findings (cleanliness & future-proofing)

### 7.1 Disabled resize handles render their grip icon (F11)

```58:68:src/components/ui/resizable.tsx
      {withHandle ? (
        verticalGroup ? (
          <span className="rounded-sm border border-border bg-muted/80 px-1 shadow-sm">
            <GripHorizontal className="size-3 text-muted-foreground" strokeWidth={2} aria-hidden />
          </span>
        ) : (
          <span className="rounded-sm border border-border bg-muted/80 py-1 shadow-sm">
            <GripVertical className="size-3 text-muted-foreground" strokeWidth={2} aria-hidden />
          </span>
        )
      ) : null}
```

`ResizableHandle` has no awareness of whether the parent `ResizablePanelGroup` is `disabled`. On mobile (and embed) the live-video dock split renders a grip with `cursor-row-resize` that does nothing. Either accept a `disabled` prop on the handle and hide the grip, or read the disabled state from a parent context.

### 7.2 No portrait/landscape distinction (F13)

Landscape phone (e.g., iPhone 13 in landscape: 844 × 390) is _wider_ than `md` (768 px), so `layoutMobile` becomes `false` and the user gets the **desktop** multi-column layout on a 390 px-tall viewport — typically too short to be usable. Similarly, an iPad in portrait (768 px × 1024 px) sits exactly at the boundary.

There is no `@media (orientation: ...)` rule in the codebase (the `aria-orientation` matches found earlier are unrelated separator semantics). A `useViewportProfile()` hook returning `{ isPhone, isLandscape, isTablet }` would generalize `useIsNarrowBelowMd` cleanly.

### 7.3 SSR/CSR flash on narrow viewport (F14)

```1:19:src/hooks/use-is-narrow-below-md.ts
'use client';

import { useLayoutEffect, useState } from 'react';
import { NARROW_MAX_QUERY } from '@/lib/viewport';

export function useIsNarrowBelowMd(): boolean {
  const [narrow, setNarrow] = useState(false);

  useLayoutEffect(() => {
    const mq = window.matchMedia(NARROW_MAX_QUERY);
    setNarrow(mq.matches);
    const onChange = () => setNarrow(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return narrow;
}
```

Initial state is `false`, so the server (and the first paint on the client) renders the desktop layout. On the first `useLayoutEffect` tick the state flips and the mobile chrome appears. The `Suspense` fallback in `(dashboard)/app/[workspace_id]/layout.tsx` masks _some_ of this — it shows a single skeleton column — but for any cached/instant route there is still a one-frame flash.

Three pragmatic fixes (least-invasive first):

1. Render the mobile chrome as `md:hidden` and the desktop chrome as `max-md:hidden` so **CSS** decides at first paint, and the `layoutMobile` JS flag only gates effects/conditional logic.
2. Read a cookie (`viewport-hint`) set by middleware from the user agent / client hint headers, and seed `useState(() => cookie === 'narrow')`.
3. Accept the flash and document it as known.

Today the code does (3) implicitly. Promoting (1) is the most aligned with the rest of the codebase, which already uses `md:hidden` heavily.

### 7.4 `DashboardShellInner` is a god component (F15)

The component is ~ 2200 lines and owns:

- Workspace data, bubble data, profile data, presence, subscription, live-video, deck builder, async player, theater plan.
- Five orthogonal collapse flags.
- The mobile detection flag, the mobile tab, the drawer open state, and at least 12 effects that branch on `layoutMobile`.

The mobile-specific concerns are not separable today because they are interleaved with the chat/board/calendar focus macros. Possible decompositions:

- ~~Extract a `useMobileShellState()` hook~~ **Done** — [`use-mobile-shell-state.ts`](../../src/hooks/use-mobile-shell-state.ts) + provider; drawer URL replay still open (**F10** remainder).
- Extract a `MobileShell` component that owns `MobileHeader`, `MobileTabBar`, `MobileSidebarSheet`, and the mobile-specific effects, and renders `children` in the active-tab slot. The desktop shell continues to be the current `WorkspaceMainSplit`.
- Move floating UI (`commentAlert`, "Exit selection mode") into a small `MobileFloatingChrome` so the magic-number question (F6) lives in one file.

These are big changes. They are P2 because the **existing structure is correct enough**; the cost is _testing_ it (F12) and _evolving_ it (every new mobile feature has to read the entire dashboard shell to find where to plug in).

---

## 8. Per-area assessment

| Area                     | Strengths                                                                                                                                                                                                                                                                                          | Gaps                                                                                           | Severity |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------- |
| **Detection**            | `useIsNarrowBelowMd` + **`NARROW_MAX_QUERY`** in [`viewport.ts`](../../src/lib/viewport.ts); Vitest mock coverage                                                                                                                                                                                  | SSR default first-paint (F14)                                                                  | P2       |
| **Top header**           | Safe-area top padding + F2 viewport                                                                                                                                                                                                                                                                | —                                                                                              | —        |
| **Bottom tab bar**       | `aria-current`; `h-[var(--mobile-tab-bar-h)]`; **`useMobileShellState`**; Vitest smoke under provider                                                                                                                                                                                              | Playwright mobile projects (F12 remainder)                                                     | P1       |
| **Off-canvas drawer**    | Radix Sheet; vertical stack; `MobileWorkspaceStrip`; auto-close on bubble select                                                                                                                                                                                                                   | No swipe-from-edge; drawer open not URL-replayable (**F10** remainder)                         | P1       |
| **Tab routing**          | URL-as-state; `setTab` centralized; deep-link collapse effect                                                                                                                                                                                                                                      | `localStorage` collapse vs URL still two sources; `focusSplit()` → `board` on mobile by design | P1       |
| **Content panes**        | Kanban **`TouchSensor`** + **`snap-proximity`** (F8)                                                                                                                                                                                                                                               | Composer / other floaters may still use literal `bottom-*` (F6 remainder)                      | P1       |
| **Modals**               | TaskModal correctly raises z-index above tab bar; full-screen below md                                                                                                                                                                                                                             | Mixed modal policies                                                                           | P2       |
| **Live video / theater** | Mobile branch unit-tested; resize disabled on mobile                                                                                                                                                                                                                                               | `compact = mobile \|\| embed` (F9); resize grip when disabled (F11)                            | P1 / P2  |
| **Hydration**            | Suspense fallback matches mobile column orientation                                                                                                                                                                                                                                                | First-paint narrow flash (F14)                                                                 | P2       |
| **Accessibility**        | Radix drawer; tab bar `aria-label` + **`aria-current`** on tabs                                                                                                                                                                                                                                    | Live-region / skip-link polish                                                                 | P1       |
| **Platform integration** | **`viewportFit: 'cover'`**; dashboard **`100dvh`**; **`--mobile-tab-bar-h`**                                                                                                                                                                                                                       | `themeColor` / PWA metadata if product wants installable app                                   | P1       |
| **Testing**              | Theater mobile branch test + **Vitest** mobile unit/smoke ([`mobile-crm-tab.test.ts`](../../src/lib/mobile-crm-tab.test.ts), [`use-is-narrow-below-md.test.tsx`](../../src/hooks/use-is-narrow-below-md.test.tsx), [`mobile-chrome.test.tsx`](../../src/components/layout/mobile-chrome.test.tsx)) | Playwright still desktop-only                                                                  | P1       |
| **Observability**        | `AnalyticsProvider` runs on mobile                                                                                                                                                                                                                                                                 | Mobile-shell session tagging                                                                   | P2       |

---

## 9. Cross-cutting risks

These risks span multiple findings and surface as "weird mobile bug reports":

1. **Composer / misc floaters vs tab bar.** Shell-level toasts use **`--mobile-tab-bar-h`**; **`RichMessageComposer`** and other modules may still use hard-coded offsets — consolidate over time.
2. **Pointer vs touch on Kanban.** `PointerSensor` still receives touch pointers; if accidental drags persist, evaluate **`MouseSensor`** for desktop-only (**F8** follow-up).
3. **The dashboard shell remains a single point of failure.** `DashboardShellInner` is still large; `layoutHydrated` ordering guards remain critical (**F15**).
4. **Playwright gap.** Vitest covers utilities + chrome mount smoke; **end-to-end mobile** flows still need device projects when prioritized (**F12** remainder).
5. **Theater `compact` conflation** (F9) is unchanged — still a design-time risk when debugging embed vs phone.

---

## 10. Proposed remediation roadmap

A small, ordered set. Each item is sized to one PR.

### Wave 1 — Platform plumbing (low risk, high payoff)

1. **Global `viewport` + `viewportFit: 'cover'`** — _**Done (F2).**_
2. **`h-[100dvh]`** on dashboard root — _**Done (F3).**_
3. **`MobileHeader` top safe-area** — _**Done (F5).**_
4. **`MobileTabBar` `aria-current` + hook integration** — _**Done (F4).**_
5. **`--mobile-tab-bar-h`** on root + body / tab bar / key floaters — _**Done (F6 shell).**_ Composer etc. still opportunistic.

### Wave 2 — Drawer & DnD correctness

6. **Drawer vertical stack + `MobileWorkspaceStrip`.** _**Done (F1).**_ Debug log removed.
7. **Kanban `TouchSensor` + `snap-proximity`.** _**Done (F8).**_

### Wave 3 — Architecture

8. **`src/lib/viewport.ts` + `NARROW_MAX_QUERY` migrations.** _**Done (F7).**_
9. **Split `compact` into two booleans (`isMobile`, `isEmbed`)** in the live-theater layout planner. _Open (**F9**)._
10. **`useMobileShellState` + `MobileShellProvider`.** _**Done (partial F10).**_ Drawer URL replay + further shell decomposition remain.

### Wave 4 — Safety net

11. **Playwright mobile projects** — _Open (**F12** remainder)._
12. **Vitest: `normalizeMobileTab`, `useIsNarrowBelowMd`, mobile chrome smoke.** _**Done (F12 Vitest slice).**_ Optional: integration test for the `?tab=` ↔ collapse `useEffect`.

### Wave 5 — Polish (future)

13. Hide the resize grip when `disabled` (F11).
14. Migrate `useState(false)` to a CSS-first detection pattern or a viewport-hint cookie (F14).
15. Decompose `DashboardShellInner` into `MobileShell` + `DesktopShell` (F15) — only after Wave 3's hook extraction lands.
16. Decide a single modal mobile policy (full-screen or centered card) and standardize `TaskModal` / `ProfileCompletionModal` / `WorkoutPlayer` accordingly.

---

## 11. Open questions for the product/design team

These are not engineering decisions; they are policy questions whose answers determine whether some findings above are bugs or intentional trade-offs.

1. **Tablet (768 px–1024 px) is currently desktop.** Is that intentional, or should the mobile shell extend up to `lg` (1024 px)?
2. **Landscape phone** is currently desktop. Should it stay that way, switch to mobile, or get its own "compact landscape" mode?
3. **Drawer contents** — **Resolved in product:** stacked horizontal workspace strip + full-width bubble list below (`MobileWorkspaceStrip` + `BubbleSidebar` drawer mode). Pagination / master-detail remains a future option if telemetry shows many BuddyBubbles per user.
4. **Comments-only TaskModal on mobile** is full-screen but `mobileUnifiedPane` toggling is still a desktop pattern; do mobile users need a separate "card overview" entry?
5. **Live-video on mobile** uses a single shell variant. Is there an explicit mobile session shape we want (e.g., dock-only, with the workspace as a peek)?
6. **PWA?** Is BuddyBubble intended to be installable on iOS/Android home screens? If yes, **`viewportFit: 'cover'` is already shipped (F2)** — remaining work is manifest, icons, and store policies.

Answering even one of these questions sharpens the priority of several findings — e.g., a "yes" on #6 (PWA) elevates manifest + icons work alongside any remaining metadata gaps.

---

## 12. Change log

| Date       | Author                    | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-05-10 | Initial assessment        | First version. Cross-references `README.md` v1.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 2026-05-10 | Post F1 + strip polish    | F1 closed: `MobileWorkspaceStrip`, drawer `flex-col` + safe-area padding, `BubbleSidebar` `hideWorkspaceTitle` / `isMobileDrawerMode`; strip visual polish (`px-4`, inactive `ring-white/10` vs active `ring-white` + bottom bar, invite divider removed). Headline table, §2, §5.1, §8, §10, §11 updated.                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 2026-05-11 | Post Waves 1–4 + doc sync | **Wave 1:** F2–F6 (`viewport`, `100dvh`, header/tab-bar safe-area, `--mobile-tab-bar-h`, shell floaters). **Wave 2:** F8 Kanban `TouchSensor` + `snap-proximity`. **Wave 3:** F7 [`viewport.ts`](../../src/lib/viewport.ts); F10 [`useMobileShellState`](../../src/hooks/use-mobile-shell-state.ts) / [`MobileShellProvider`](../../src/hooks/use-mobile-shell-state.ts), [`MobileTabBar`](../../src/components/layout/MobileTabBar.tsx) on hook. **Wave 4:** Vitest [`mobile-crm-tab.test.ts`](../../src/lib/mobile-crm-tab.test.ts), [`use-is-narrow-below-md.test.tsx`](../../src/hooks/use-is-narrow-below-md.test.tsx), [`mobile-chrome.test.tsx`](../../src/components/layout/mobile-chrome.test.tsx). Removed strip debug log. README + assessment refreshed to match. |

---

## 13. Next recommended update

1. **Playwright mobile projects** — device emulation + one navigation smoke (**F12** remainder).
2. **Route remaining floaters** (e.g. **`RichMessageComposer`**) through **`--mobile-tab-bar-h`** or document exceptions (**F6** remainder).
3. **Theater `compact` split** — **`isMobile`** vs **`isEmbed`** (**F9**).
4. **Optional `?nav=` (or similar)** for URL-replayable drawer (**F10** remainder).
5. **`MobileShell` extraction / thinner `DashboardShellInner`** (**F15**).
