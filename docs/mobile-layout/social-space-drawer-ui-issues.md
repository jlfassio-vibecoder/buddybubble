# Mobile Social Space drawer — UI issues

> **Companion to** [`README.md`](./README.md) and [`architecture-assessment.md`](./architecture-assessment.md).  
> **Scope:** Off-canvas menu drawer on narrow viewports (`MobileSidebarSheet` → `MobileWorkspaceStrip` + `BubbleSidebar`). This is **not** desktop `WorkspaceRail` (97px column).  
> **Method:** Code audit + production screenshot review (2026-05-17).

### P0 fix status (2026-05-17)

Issues **1–4** (portal theming / contrast) are **addressed**: [`MobileSidebarSheet`](../../src/components/layout/MobileSidebarSheet.tsx) portals via **vaul** and injects [`ThemeScope`](../../src/components/theme/ThemeScope.tsx) with `themeCategory` from [`dashboard-shell.tsx`](../../src/components/dashboard/dashboard-shell.tsx) **inside** `Drawer.Content`. The drawer shell uses a **transparent** `Drawer.Content` so the themed rail paints correctly and `--rail-bg` (and related sidebar tokens) inherit on the portaled subtree. Vitest: [`mobile-chrome.test.tsx`](../../src/components/layout/mobile-chrome.test.tsx) (`MobileSidebarSheet injects theme variables inside the portaled drawer`).

### P1 fix status (2026-05-17)

Issues **5–6, 10–11, 14, 16, 23, 27–28** are **addressed**. See workspace strip and bubbles sections below.

### P2 fix status (2026-05-17)

Issues **7–9, 12–13, 15, 17–18, 20–22** are **addressed** (light **24**: visible **Channels** header with `aria-label="Bubbles"`).

**`?nav=open` (issue 22):** Drawer open state is URL-derived (`normalizeMobileNav` + `useMobileShellState`). Updates use `router.replace` (approach **A**): same history semantics as `?tab=` — refresh with `?nav=open` restores the drawer; system **Back** does **not** close the drawer (closes the workspace route instead).

Vitest: [`use-mobile-shell-state.test.tsx`](../../src/hooks/use-mobile-shell-state.test.tsx), [`mobile-crm-tab.test.ts`](../../src/lib/mobile-crm-tab.test.ts).

**Deferred (not in P2 scope):** optional history **B** (`push`/`back()` to close drawer); dashboard-wide **F14** (CSS-first layout flash); **F15** (`MobileShell` / `DashboardShellInner` decomposition).

### P3 fix status (2026-05-17)

Issue **21** (swipe-from-edge) is **addressed**: [`MobileEdgeSwipeOpener`](../../src/components/layout/MobileEdgeSwipeOpener.tsx) opens the drawer on a rightward swipe from the left edge; [`MobileSidebarSheet`](../../src/components/layout/MobileSidebarSheet.tsx) uses **vaul** (`direction="left"`) for swipe-left-to-close.

**iOS Safari tradeoff:** A slow swipe starting at `x ≈ 0` may still trigger the browser back gesture (~20px zone). The **Menu** tab remains the deterministic opener. **Deferred follow-up:** gate edge sensor width on `display-mode: standalone`.

Vitest: [`MobileEdgeSwipeOpener.test.tsx`](../../src/components/layout/MobileEdgeSwipeOpener.test.tsx), [`mobile-chrome.test.tsx`](../../src/components/layout/mobile-chrome.test.tsx).

---

## Open / deferred inventory

Only the items below remain **open** or **partial** for this drawer. All other numbered issues in this doc (**1–24** except **25**) are **resolved** across P0–P3.

| Item                | Status       | Notes                                                                                         |
| ------------------- | ------------ | --------------------------------------------------------------------------------------------- |
| **25**              | **Open**     | Channel grouping / search / density modes (product feature)                                   |
| **24**              | **Partial**  | Terminology alignment (`BuddyBubble` / Bubbles / socialspace) — drawer uses **Channels** only |
| **27**              | **Partial**  | Workspace switcher — `aria-label` per link; no extra visible label beyond tiles               |
| **B**               | **Deferred** | `push` + `router.back()` so hardware Back closes drawer first                                 |
| **F14**             | **Deferred** | CSS-first layout flash (dashboard-wide; see architecture assessment)                          |
| **F15**             | **Deferred** | `MobileShell` extraction / `DashboardShellInner` decomposition                                |
| **standalone gate** | **Deferred** | Narrow or disable edge sensor in mobile Safari to reduce back-swipe collision                 |

---

## Radix `sheet.tsx` vs vaul `MobileSidebarSheet`

Do **not** conflate these two primitives:

| Surface                                                                                              | Implementation                          | When to use                                                                                                                                                              |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`src/components/ui/sheet.tsx`](../../src/components/ui/sheet.tsx)                                   | Radix Dialog (`Sheet` / `SheetContent`) | **Non–mobile-drawer** surfaces only — e.g. desktop left-rail collapsed panels and any other sheet that is not the Social Space menu drawer                               |
| [`src/components/layout/MobileSidebarSheet.tsx`](../../src/components/layout/MobileSidebarSheet.tsx) | **vaul** `Drawer` (`direction="left"`)  | **Exclusively** the mobile off-canvas Social Space drawer (`layoutMobile` in `dashboard-shell`) — swipe-to-close, full-bleed width, `ThemeScope` inside `Drawer.Content` |

P0 theming originally landed on Radix `SheetContent`; P3 migrated the mobile drawer to vaul while **preserving** the inner `ThemeScope` + transparent shell pattern on `Drawer.Content`.

---

## What you are looking at

On mobile, **Menu** in the bottom tab bar (or swipe-from-edge) opens an off-canvas drawer:

| Layer       | Component                                                                                                         | Role                                                    |
| ----------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Edge sensor | [`MobileEdgeSwipeOpener.tsx`](../../src/components/layout/MobileEdgeSwipeOpener.tsx)                              | Swipe right from left edge to open (when drawer closed) |
| Shell       | [`MobileSidebarSheet.tsx`](../../src/components/layout/MobileSidebarSheet.tsx)                                    | vaul drawer (`direction="left"`), left edge             |
| Top         | [`MobileWorkspaceStrip.tsx`](../../src/components/layout/MobileWorkspaceStrip.tsx)                                | Horizontal BuddyBubble switcher + footer controls       |
| Bottom      | [`BubbleSidebar`](../../src/components/dashboard/bubble-sidebar.tsx) (`hideWorkspaceTitle`, `isMobileDrawerMode`) | Channel (“bubble”) list                                 |

Wiring lives in [`dashboard-shell.tsx`](../../src/components/dashboard/dashboard-shell.tsx) (~lines 2120–2140).

---

## Critical — theme and contrast (fixed in P0)

These issues explained a production screenshot where workspace letters appeared as faint text on a **white** drawer. **Fixed 2026-05-17** via inner `ThemeScope` on the portaled drawer content (see P0 fix status above; shell is now vaul `Drawer.Content`).

| #     | Issue                                                              | Status                                                                   |
| ----- | ------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| **1** | Workspace rail rendered on white sheet instead of themed dark rail | **Fixed** — `ThemeScope` inside transparent vaul `Drawer.Content`        |
| **2** | Inactive workspace tiles nearly invisible                          | **Fixed** — rail tokens apply on `--rail-bg`                             |
| **3** | Active workspace state weak or broken                              | **Fixed** — `--sidebar-active` available in drawer                       |
| **4** | Two-panel visual system collided                                   | **Fixed** — strip and `BubbleSidebar` share scoped shadcn/sidebar tokens |

---

## Workspace strip (`MobileWorkspaceStrip`)

| #      | Issue                                               | Status                                                                                                                                                         |
| ------ | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **5**  | Workspace identity was only the first letter        | **Fixed** — two-char initials + short label under each tile                                                                                                    |
| **6**  | No visible section label / current socialspace name | **Fixed** — “Socialspaces” header + `currentWorkspaceName`                                                                                                     |
| **7**  | Large dead zone above workspace row                 | **Fixed** — safe-area-only top padding; integrated header                                                                                                      |
| **8**  | Close (×) not integrated with strip                 | **Fixed** — explicit close in rail header (`MobileWorkspaceStrip` `onClose`); vaul swipe-left-to-close for gesture dismiss (no Radix sheet × on mobile drawer) |
| **9**  | Controls row feels disconnected                     | **Fixed** — labeled action toolbar in one `border-t` section                                                                                                   |
| **10** | Drawer did not close on workspace `Link`            | **Fixed** — `onWorkspaceNavigate`                                                                                                                              |
| **11** | No horizontal scroll affordance                     | **Fixed** — right-edge mask when overflow                                                                                                                      |
| **12** | Footer icons lack text labels                       | **Fixed** — Invite / New / Fitness / You captions                                                                                                              |

---

## Bubbles / channels (`BubbleSidebar` in drawer)

| #      | Issue                                       | Status                                                     |
| ------ | ------------------------------------------- | ---------------------------------------------------------- |
| **13** | Desktop-density layout in full-width drawer | **Fixed** — `px-1.5`, compact rows, full-bleed vaul drawer |
| **14** | “BUBBLES” header minimal context            | **Fixed** — socialspace name in strip header               |
| **15** | Header divider alignment                    | **Fixed** — full-bleed `-mx-2` header border in drawer     |
| **16** | Per-bubble settings hover-dependent         | **Fixed** — always visible in drawer mode                  |
| **17** | Admin tab strip height                      | **Fixed** — `h-8` + `text-[10px]` in drawer                |
| **18** | “New bubble” + Add cramped                  | **Fixed** — stacked form + full-width Add in drawer        |

---

## Drawer shell (`MobileSidebarSheet` — vaul)

> Radix [`sheet.tsx`](../../src/components/ui/sheet.tsx) is **not** used for this drawer. See **Radix `sheet.tsx` vs vaul `MobileSidebarSheet`** above.

| #      | Issue                                                          | Status                                                                                                             |
| ------ | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **19** | Default drawer surface is app background                       | **Fixed in P0** — transparent vaul `Drawer.Content` + inner `ThemeScope`                                           |
| **20** | ~90% width (`w-[min(100vw-0.5rem, 24rem)]`) left dimmed sliver | **Fixed** — vaul `Drawer.Content` uses `w-full max-w-none` for full-bleed edge-to-edge drawer (no right dead zone) |
| **21** | No swipe-from-edge affordance                                  | **Fixed** — `MobileEdgeSwipeOpener` (open) + vaul swipe-left-to-close                                              |
| **22** | Drawer open state not URL-replayable                           | **Fixed** — `?nav=open` via `router.replace` (approach A)                                                          |

---

## Information architecture and copy

| #      | Issue                                                                                           | Status                                                                             |
| ------ | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| **23** | “Social Space” not labeled in visible UI                                                        | **Fixed** — visible “Socialspaces” in strip                                        |
| **24** | Terminology mix — “BuddyBubble” in code/aria vs “Bubbles” in UI vs “socialspace” in invite copy | **Partial** — drawer shows **Channels** (`aria-label="Bubbles"`); no global rename |
| **25** | Flat channel list — no grouping or density modes                                                | **Open** — product feature; out of scope for P0–P3                                 |

---

## Accessibility

| #      | Issue                                         | Status                                        |
| ------ | --------------------------------------------- | --------------------------------------------- |
| **26** | Contrast failure on workspace tiles           | **Fixed in P0**                               |
| **27** | Workspace switcher relies on color/ring alone | **Partial** — `aria-label` per workspace link |
| **28** | Touch targets for bubble settings             | **Fixed** — larger tap target in drawer mode  |

---

## Regression / docs vs reality

| #      | Issue                                                                                                                     | Status                                                                                        |
| ------ | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **29** | F1 “drawer overflow” is structurally fixed (`MobileWorkspaceStrip` stack) but presentation can break without theme tokens | **Fixed (structure)** — styling depends on `ThemeScope` in portaled drawer                    |
| **30** | Vitest smoke did not catch theming                                                                                        | **Partially fixed** — `MobileSidebarSheet` portal test asserts `--rail-bg` on scoped ancestor |

---

## Suggested fix priority

| Priority   | Action                                                                                                |
| ---------- | ----------------------------------------------------------------------------------------------------- |
| ~~**P0**~~ | ~~`ThemeScope` inside portaled drawer (`Drawer.Content`)~~ — **Done (2026-05-17).**                   |
| ~~**P0**~~ | ~~Re-verify strip contrast after theme injection~~ — Vitest guard + deploy QA on device.              |
| ~~**P1**~~ | ~~Show current BuddyBubble name in drawer~~ — **Done (2026-05-17).**                                  |
| ~~**P1**~~ | ~~Improve workspace tiles (labels, scroll hint)~~ — **Done (2026-05-17).**                            |
| ~~**P1**~~ | ~~Mobile touch path for bubble admin settings~~ — **Done (2026-05-17).**                              |
| ~~**P2**~~ | ~~Integrated header/close; footer labels; full width; density; `?nav=open`~~ — **Done (2026-05-17).** |
| ~~**P3**~~ | ~~Swipe-from-edge open + vaul swipe-to-close (issue 21)~~ — **Done (2026-05-17).**                    |
| **Next**   | Issue **25** (channel grouping); optional **B**, **F14**, **F15**, standalone edge-sensor gate        |

---

## Related files

- [`src/components/layout/MobileSidebarSheet.tsx`](../../src/components/layout/MobileSidebarSheet.tsx) — mobile drawer (vaul)
- [`src/components/ui/sheet.tsx`](../../src/components/ui/sheet.tsx) — Radix sheet (non-drawer surfaces only)
- [`src/components/layout/MobileEdgeSwipeOpener.tsx`](../../src/components/layout/MobileEdgeSwipeOpener.tsx)
- [`src/components/layout/MobileWorkspaceStrip.tsx`](../../src/components/layout/MobileWorkspaceStrip.tsx)
- [`src/components/dashboard/bubble-sidebar.tsx`](../../src/components/dashboard/bubble-sidebar.tsx)
- [`src/components/layout/WorkspaceRail.tsx`](../../src/components/layout/WorkspaceRail.tsx) — desktop reference
- [`src/components/theme/ThemeScope.tsx`](../../src/components/theme/ThemeScope.tsx)
- [`src/components/modals/PeopleInvitesModal.tsx`](../../src/components/modals/PeopleInvitesModal.tsx) — portal + `ThemeScope` pattern
- [`src/lib/theme-engine/registry.ts`](../../src/lib/theme-engine/registry.ts) — `--rail-bg` and sidebar tokens

---

## Change log

| Date       | Change                                                                                                                                                                                     |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-05-17 | Initial issue inventory from code audit and mobile production screenshot.                                                                                                                  |
| 2026-05-17 | P0 shipped: `ThemeScope` + `themeCategory` on portaled drawer; issues 1–4 marked fixed; Vitest drawer theming test added.                                                                  |
| 2026-05-17 | P1 shipped: strip header (`Socialspaces` + name), labeled tiles, scroll fade, `onWorkspaceNavigate`, drawer bubble settings visible; Vitest extended.                                      |
| 2026-05-17 | P2 shipped: integrated close, full-width drawer, labeled footer actions, bubble density/admin chrome, `?nav=open` URL state (replace semantics); Vitest + back-button contract documented. |
| 2026-05-17 | P3 shipped: `MobileEdgeSwipeOpener` + vaul left drawer (swipe open/close); issue 21 fixed; Safari edge-back tradeoff documented.                                                           |
| 2026-05-17 | Doc pass: P0/vaul theming wording; Radix `sheet.tsx` vs `MobileSidebarSheet` note; issues 8/20/19/25 statuses; open/deferred inventory.                                                    |
