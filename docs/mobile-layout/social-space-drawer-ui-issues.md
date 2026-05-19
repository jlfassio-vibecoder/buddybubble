# Mobile Social Space drawer — UI issues

> **Companion to** [`README.md`](./README.md) and [`architecture-assessment.md`](./architecture-assessment.md).  
> **Scope:** Off-canvas menu drawer on narrow viewports (`MobileSidebarSheet` → `MobileWorkspaceStrip` + `BubbleSidebar`). This is **not** desktop `WorkspaceRail` (97px column).  
> **Method:** Code audit + production screenshot review (2026-05-17).

### P0 fix status (2026-05-17)

Issues **1–4** (portal theming / contrast) are **addressed**: [`MobileSidebarSheet`](../../src/components/layout/MobileSidebarSheet.tsx) wraps drawer content in `ThemeScope` with `themeCategory` from [`dashboard-shell.tsx`](../../src/components/dashboard/dashboard-shell.tsx), and `SheetContent` uses `bg-transparent` so the rail paints correctly. Vitest: [`mobile-chrome.test.tsx`](../../src/components/layout/mobile-chrome.test.tsx) (`MobileSidebarSheet injects theme variables inside the portaled drawer`).

### P1 fix status (2026-05-17)

Issues **5–6, 10–11, 14, 16, 23, 27–28** are **addressed**. See workspace strip and bubbles sections below.

### P2 fix status (2026-05-17)

Issues **7–9, 12–13, 15, 17–18, 20–22** are **addressed** (light **24**: visible **Channels** header with `aria-label="Bubbles"`). **Deferred:** **25** channel grouping, optional history **B** (`push`/`back()` to close drawer).

### P3 fix status (2026-05-17)

Issue **21** (swipe-from-edge) is **addressed**: [`MobileEdgeSwipeOpener`](../../src/components/layout/MobileEdgeSwipeOpener.tsx) opens the drawer on a rightward swipe from the left edge; [`MobileSidebarSheet`](../../src/components/layout/MobileSidebarSheet.tsx) uses **vaul** (`direction="left"`) for swipe-left-to-close. Radix [`sheet.tsx`](../../src/components/ui/sheet.tsx) is unchanged for other surfaces.

**iOS Safari tradeoff:** A slow swipe starting at `x ≈ 0` may still trigger the browser back gesture (~20px zone). The **Menu** tab remains the deterministic opener. Optional follow-up: gate edge sensor width on `display-mode: standalone`.

Vitest: [`MobileEdgeSwipeOpener.test.tsx`](../../src/components/layout/MobileEdgeSwipeOpener.test.tsx).

**`?nav=open` (issue 22):** Drawer open state is URL-derived (`normalizeMobileNav` + `useMobileShellState`). Updates use `router.replace` (approach **A**): same history semantics as `?tab=` — refresh with `?nav=open` restores the drawer; system **Back** does **not** close the drawer (closes the workspace route instead).

Vitest: [`mobile-chrome.test.tsx`](../../src/components/layout/mobile-chrome.test.tsx), [`use-mobile-shell-state.test.tsx`](../../src/hooks/use-mobile-shell-state.test.tsx), [`mobile-crm-tab.test.ts`](../../src/lib/mobile-crm-tab.test.ts).

---

## What you are looking at

On mobile, **Menu** in the bottom tab bar opens an off-canvas drawer:

| Layer  | Component                                                                                                         | Role                                              |
| ------ | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Shell  | [`MobileSidebarSheet.tsx`](../../src/components/layout/MobileSidebarSheet.tsx)                                    | vaul drawer (`direction="left"`), left edge       |
| Top    | [`MobileWorkspaceStrip.tsx`](../../src/components/layout/MobileWorkspaceStrip.tsx)                                | Horizontal BuddyBubble switcher + footer controls |
| Bottom | [`BubbleSidebar`](../../src/components/dashboard/bubble-sidebar.tsx) (`hideWorkspaceTitle`, `isMobileDrawerMode`) | Channel (“bubble”) list                           |

Wiring lives in [`dashboard-shell.tsx`](../../src/components/dashboard/dashboard-shell.tsx) (~lines 2115–2118).

---

## Critical — theme and contrast (fixed in P0)

These issues explained a production screenshot where workspace letters appeared as faint text on a **white** drawer. **Fixed 2026-05-17** via inner `ThemeScope` on the portaled sheet (see P0 fix status above).

| #     | Issue                                                              | Status                                                                   |
| ----- | ------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| **1** | Workspace rail rendered on white sheet instead of themed dark rail | **Fixed** — `ThemeScope` + transparent `SheetContent`                    |
| **2** | Inactive workspace tiles nearly invisible                          | **Fixed** — rail tokens apply on `--rail-bg`                             |
| **3** | Active workspace state weak or broken                              | **Fixed** — `--sidebar-active` available in drawer                       |
| **4** | Two-panel visual system collided                                   | **Fixed** — strip and `BubbleSidebar` share scoped shadcn/sidebar tokens |

---

## Workspace strip (`MobileWorkspaceStrip`)

| #      | Issue                                               | Status                                                       |
| ------ | --------------------------------------------------- | ------------------------------------------------------------ |
| **5**  | Workspace identity was only the first letter        | **Fixed** — two-char initials + short label under each tile  |
| **6**  | No visible section label / current socialspace name | **Fixed** — “Socialspaces” header + `currentWorkspaceName`   |
| **7**  | Large dead zone above workspace row                 | **Fixed** — safe-area-only top padding; integrated header    |
| **8**  | Close (×) not integrated with strip                 | **Fixed** — rail header close + `hideCloseButton` on sheet   |
| **9**  | Controls row feels disconnected                     | **Fixed** — labeled action toolbar in one `border-t` section |
| **10** | Drawer did not close on workspace `Link`            | **Fixed** — `onWorkspaceNavigate`                            |
| **11** | No horizontal scroll affordance                     | **Fixed** — right-edge mask when overflow                    |
| **12** | Footer icons lack text labels                       | **Fixed** — Invite / New / Fitness / You captions            |

---

## Bubbles / channels (`BubbleSidebar` in drawer)

| #      | Issue                                       | Status                                                 |
| ------ | ------------------------------------------- | ------------------------------------------------------ |
| **13** | Desktop-density layout in full-width drawer | **Fixed** — `px-1.5`, compact rows, full-width drawer  |
| **14** | “BUBBLES” header minimal context            | **Fixed** — socialspace name in strip header           |
| **15** | Header divider alignment                    | **Fixed** — full-bleed `-mx-2` header border in drawer |
| **16** | Per-bubble settings hover-dependent         | **Fixed** — always visible in drawer mode              |
| **17** | Admin tab strip height                      | **Fixed** — `h-8` + `text-[10px]` in drawer            |
| **18** | “New bubble” + Add cramped                  | **Fixed** — stacked form + full-width Add in drawer    |

---

## Drawer shell (`MobileSidebarSheet` / `sheet.tsx`)

| #      | Issue                                       |
| ------ | ------------------------------------------- | --------------------------------------------------------- |
| **19** | ~~Default sheet surface is app background~~ | **Fixed in P0** — transparent shell + inner `ThemeScope`  |
| **20** | **~90% width with exposed dimmed strip**    | **Fixed** — `w-full max-w-none` on mobile sheet           |
| **21** | **No swipe-from-edge affordance**           | **Fixed** — `MobileEdgeSwipeOpener` + vaul swipe-to-close |
| **22** | **Drawer open state not URL-replayable**    | **Fixed** — `?nav=open` via `router.replace` (approach A) |

---

## Information architecture and copy

| #      | Issue                                                                                                |
| ------ | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| **23** | “Social Space” not labeled in visible UI                                                             | **Fixed** — visible “Socialspaces” in strip                                        |
| **24** | **Terminology mix** — “BuddyBubble” in code/aria vs “Bubbles” in UI vs “socialspace” in invite copy. | **Partial** — drawer shows **Channels** (`aria-label="Bubbles"`); no global rename |
| **25** | **Flat channel list** — no grouping or density modes; sparse for power users with many channels.     |

---

## Accessibility

| #      | Issue                                         |
| ------ | --------------------------------------------- | --------------------------------------------- |
| **26** | Contrast failure on workspace tiles           | **Fixed in P0**                               |
| **27** | Workspace switcher relies on color/ring alone | **Partial** — `aria-label` per workspace link |
| **28** | Touch targets for bubble settings             | **Fixed** — larger tap target in drawer mode  |

---

## Regression / docs vs reality

| #      | Issue                                                                                                                                                                                                                                                                           |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **29** | **F1 “drawer overflow” is structurally fixed** (vertical stack + `MobileWorkspaceStrip`) per [`architecture-assessment.md`](./architecture-assessment.md) §5.1, but **presentation** can still be wrong when theme tokens are missing — layout does not overflow; styling does. |
| **30** | ~~**Vitest smoke does not catch theming**~~ — **Partially fixed:** strip smoke uses `ThemeScope`; `MobileSidebarSheet` portal test asserts `--rail-bg` on scoped ancestor.                                                                                                      |

---

## Suggested fix priority

| Priority   | Action                                                                                                |
| ---------- | ----------------------------------------------------------------------------------------------------- |
| ~~**P0**~~ | ~~Wrap drawer body in `ThemeScope` inside `SheetContent`~~ — **Done (2026-05-17).**                   |
| ~~**P0**~~ | ~~Re-verify strip contrast after theme injection~~ — Vitest guard + deploy QA on device.              |
| ~~**P1**~~ | ~~Show current BuddyBubble name in drawer~~ — **Done (2026-05-17).**                                  |
| ~~**P1**~~ | ~~Improve workspace tiles (labels, scroll hint)~~ — **Done (2026-05-17).**                            |
| ~~**P1**~~ | ~~Mobile touch path for bubble admin settings~~ — **Done (2026-05-17).**                              |
| ~~**P2**~~ | ~~Integrated header/close; footer labels; full width; density; `?nav=open`~~ — **Done (2026-05-17).** |
| ~~**P3**~~ | ~~Swipe-from-edge open + vaul swipe-to-close (issue 21)~~ — **Done (2026-05-17).**                    |

---

## Related files

- [`src/components/layout/MobileSidebarSheet.tsx`](../../src/components/layout/MobileSidebarSheet.tsx)
- [`src/components/layout/MobileEdgeSwipeOpener.tsx`](../../src/components/layout/MobileEdgeSwipeOpener.tsx)
- [`src/components/layout/MobileWorkspaceStrip.tsx`](../../src/components/layout/MobileWorkspaceStrip.tsx)
- [`src/components/dashboard/bubble-sidebar.tsx`](../../src/components/dashboard/bubble-sidebar.tsx)
- [`src/components/layout/WorkspaceRail.tsx`](../../src/components/layout/WorkspaceRail.tsx) — desktop reference
- [`src/components/theme/ThemeScope.tsx`](../../src/components/theme/ThemeScope.tsx)
- [`src/components/modals/PeopleInvitesModal.tsx`](../../src/components/modals/PeopleInvitesModal.tsx) — portal + `ThemeScope` pattern
- [`src/lib/theme-engine/registry.ts`](../../src/lib/theme-engine/registry.ts) — `--rail-bg` and sidebar tokens

---

## Change log

| Date       | Change                                                                                                                                                                                    |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-05-17 | Initial issue inventory from code audit and mobile production screenshot.                                                                                                                 |
| 2026-05-17 | P0 shipped: `MobileSidebarSheet` + `themeCategory` / inner `ThemeScope`; issues 1–4 marked fixed; Vitest drawer theming test added.                                                       |
| 2026-05-17 | P1 shipped: strip header (`Socialspaces` + name), labeled tiles, scroll fade, `onWorkspaceNavigate`, drawer bubble settings visible; Vitest extended.                                     |
| 2026-05-17 | P2 shipped: integrated close, full-width sheet, labeled footer actions, bubble density/admin chrome, `?nav=open` URL state (replace semantics); Vitest + back-button contract documented. |
| 2026-05-17 | P3 shipped: `MobileEdgeSwipeOpener` + vaul left drawer (swipe open/close); issue 21 fixed; Safari edge-back tradeoff documented.                                                          |
