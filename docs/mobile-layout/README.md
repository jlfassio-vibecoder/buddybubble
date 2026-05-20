# Mobile layout

This document describes how the **BuddyBubble** web app renders on **narrow viewports** (phones and small tablets). It is the result of a code-level audit of the dashboard shell, the dedicated mobile components in `src/components/layout/`, and the surrounding hooks and stores that control collapse behavior.

It is intentionally **descriptive**, not prescriptive: each behavior cited maps to a specific file and (in most cases) a specific section of code so you can verify or change it in place.

> **Scope.** This document covers the **authenticated dashboard route** at `/app/[workspace_id]/...` (`src/app/(dashboard)/app/[workspace_id]/layout.tsx` → `DashboardShell`). Marketing, login, magic-link, invite, and admin routes do **not** render the mobile shell described here — they use the regular `RootLayout` only and rely on per-page responsive styling.

---

## 1. Breakpoint and detection

| Concern            | Value                                                                                                 | Source                                                                 |
| ------------------ | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Breakpoint         | **`max-width: 767.98px`** (Tailwind `max-md:` / below `md`) — canonical string **`NARROW_MAX_QUERY`** | [`src/lib/viewport.ts`](../../src/lib/viewport.ts)                     |
| Hook               | `useIsNarrowBelowMd()` (uses **`NARROW_MAX_QUERY`**)                                                  | `src/hooks/use-is-narrow-below-md.ts`                                  |
| Composed flag      | `layoutMobile = !embedMode && narrowViewport`                                                         | `src/components/dashboard/dashboard-shell.tsx` (`DashboardShellInner`) |
| Embed escape hatch | `?embed=true` query param disables the mobile shell entirely                                          | `dashboard-shell.tsx` (`embedMode`)                                    |

`useIsNarrowBelowMd()` runs `useLayoutEffect` against `window.matchMedia(NARROW_MAX_QUERY)` where **`NARROW_MAX_QUERY`** is **`'(max-width: 767.98px)'`** from [`src/lib/viewport.ts`](../../src/lib/viewport.ts), and updates state on the `change` event, so the dashboard re-renders the moment the viewport crosses the boundary.

```ts
// src/hooks/use-is-narrow-below-md.ts (conceptual)
useLayoutEffect(() => {
  const mq = window.matchMedia(NARROW_MAX_QUERY);
  // ...
}, []);
```

`layoutMobile` is the **single switch** the dashboard uses to choose between the desktop multi-column layout and the mobile vertical layout. Anything you see described below as "mobile" is gated on this flag. When `?embed=true` is present (storefront iframes, marketing previews), `layoutMobile` stays `false` even on a narrow viewport — embeds always render the desktop chrome at whatever width the host iframe gives them.

---

## 2. Top-level structure on mobile

When `layoutMobile` is `true`, the dashboard renders three distinct chrome regions stacked vertically inside a single full-height column. Everything else collapses or hides.

```
┌──────────────────────────────────────────────┐
│  MobileHeader  (h-14, sticky title + trailing)│
├──────────────────────────────────────────────┤
│                                              │
│  Active tab body                             │
│  (Chat | Board | Calendar)                   │
│  scrolls inside `min-h-0 flex-1`             │
│                                              │
├──────────────────────────────────────────────┤
│  MobileTabBar  (4rem + safe-area → --mobile-tab-bar-h) │
└──────────────────────────────────────────────┘
                 ↑
                 │  MobileSidebarSheet slides in
                 │  from the left over everything
                 │  when the tab bar's "Menu"
                 │  item is tapped.
```

The container that orchestrates this layout is in `dashboard-shell.tsx`:

- **Root shell** — `h-[100dvh]` (not `h-screen`) and an inline style defining **`--mobile-tab-bar-h: calc(4rem + env(safe-area-inset-bottom, 0px))`** on the same wrapper `div`.
- **Mobile chrome** — [`MobileShellProvider`](../../src/hooks/use-mobile-shell-state.ts) wraps `DashboardShellInner` so [`MobileTabBar`](../../src/components/layout/MobileTabBar.tsx) and the shell share **`useMobileShellState()`** (`tab`, `setTab`, `drawerOpen`, `setDrawerOpen`).
- **Drawer** — [`MobileSidebarSheet`](../../src/components/layout/MobileSidebarSheet.tsx) receives `open` / `onOpenChange` from that hook (aliases `mobileNavOpen` / `setMobileNavOpen` in the shell). Children are **[`MobileWorkspaceStrip`](../../src/components/layout/MobileWorkspaceStrip.tsx)** (horizontal BuddyBubbles + controls) then **[`BubbleSidebar`](../../src/components/dashboard/bubble-sidebar.tsx)** with **`hideWorkspaceTitle`** and **`isMobileDrawerMode`** — not `WorkspaceRail` inside the drawer.

The wrapper `div` is `flex-col` on mobile and **`md:flex-row`** on desktop, with `md:overflow-hidden` only applied at desktop widths. The body is then a flex child with **`pb-[var(--mobile-tab-bar-h)]`** (`md:pb-0` on desktop) so the persistent bottom tab bar never covers content.

---

## 3. The three mobile chrome components

All three live in `src/components/layout/` and are intentionally small and self-contained.

### 3.1 `MobileHeader.tsx`

A 56 px-tall (`h-14`) header that shows the current **BuddyBubble title** centered, with an optional **trailing slot**. The trailing slot in the dashboard is the realtime presence face pile (`ActiveUsersStack`), unless the page is in embed mode.

```13:15:src/components/layout/MobileHeader.tsx
export function MobileHeader({ title, trailing }: Props) {
  return (
    <header className="relative flex h-14 shrink-0 items-center border-b border-border bg-background px-4 pt-[env(safe-area-inset-top,0px)] md:hidden">
      <h1
        className={cn(
          'min-w-0 flex-1 truncate text-center text-sm font-semibold text-foreground',
          trailing ? 'pr-14' : '',
        )}
      >
        {title}
      </h1>
      {trailing ? (
        <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center">
          {trailing}
        </div>
      ) : null}
    </header>
  );
}
```

Notes:

- The header is **`md:hidden`** — it never renders on desktop.
- The title comes from `buddyBubbleTitle`, which resolves the currently selected bubble's display name via `resolveBuddyBubbleDisplayTitle(selectedBubbleId, bubbles, activeWorkspace?.name)` (`src/lib/all-bubbles.ts` consumer). For the aggregate "All Bubbles" view it falls back to the workspace name.
- Navigation is **not** in the header. There is no hamburger here on purpose — the navigation drawer is opened from the bottom tab bar instead.

### 3.2 `MobileTabBar.tsx`

Fixed to the bottom of the viewport (`fixed bottom-0`) at `z-[90]`. It is the only navigation chrome on mobile. The component has **no props**: it calls **`useMobileShellState()`** and therefore **must render under [`MobileShellProvider`](../../src/hooks/use-mobile-shell-state.ts)** (provided from [`dashboard-shell.tsx`](../../src/components/dashboard/dashboard-shell.tsx)).

- **Height** — `h-[var(--mobile-tab-bar-h)]` (same CSS variable the dashboard root defines).
- **Menu** — `onClick={() => setDrawerOpen(true)}` opens the drawer.
- **Tabs** — `onClick={() => setTab(id)}` writes `?tab=` via the same helper the shell uses; active state uses **`aria-current="page"`** and `normalizeMobileTab` on `searchParams` inside the hook.

Items, in left-to-right order:

| Position | Label        | Icon            | Behavior                                                                                          |
| -------- | ------------ | --------------- | ------------------------------------------------------------------------------------------------- |
| 1        | **Menu**     | `PanelLeft`     | Calls **`setDrawerOpen(true)`** (opens `MobileSidebarSheet`). Not a tab; never shows as "active." |
| 2        | **Chat**     | `MessageSquare` | **`setTab('chat')`** → `?tab=chat`.                                                               |
| 3        | **Board**    | `LayoutGrid`    | **`setTab('board')`**.                                                                            |
| 4        | **Calendar** | `CalendarDays`  | **`setTab('calendar')`**.                                                                         |

Tabs are persisted to the URL via **`router.replace(..., { scroll: false })`** inside the hook. The active tab is **`normalizeMobileTab(searchParams.get('tab'))`** from `src/lib/mobile-crm-tab.ts`:

```1:7:src/lib/mobile-crm-tab.ts
export type MobileCrmTab = 'chat' | 'board' | 'calendar';

export function normalizeMobileTab(value: string | null): MobileCrmTab {
  if (value === 'board' || value === 'calendar') return value;
  return 'chat';
}
```

The bar uses **`pb-[env(safe-area-inset-bottom,0px)]`** plus **`h-[var(--mobile-tab-bar-h)]`** so it sits flush against the home-indicator area on iOS while staying tappable. Root [`layout.tsx`](../../src/app/layout.tsx) exports **`viewportFit: 'cover'`** so those `env()` insets are real on iPhone. The matching **`pb-[var(--mobile-tab-bar-h)]`** on the body container (§2) prevents the bar from overlapping the active tab's content.

### 3.3 `MobileSidebarSheet.tsx`

A left-edge **off-canvas drawer** that wraps **[`MobileWorkspaceStrip`](../../src/components/layout/MobileWorkspaceStrip.tsx)** + **[`BubbleSidebar`](../../src/components/dashboard/bubble-sidebar.tsx)** (not the desktop `WorkspaceRail`) so the user can switch BuddyBubble or bubble without leaving the active tab. Known issues and fix status: [`social-space-drawer-ui-issues.md`](./social-space-drawer-ui-issues.md).

The inner content wrapper is **`flex-col`** with safe-area padding only (`pt-[env(safe-area-inset-top)]`, `pb-[env(safe-area-inset-bottom)]`). Close lives in the rail header; swipe gestures use **vaul** (see below).

Key points:

- Width is **`w-full max-w-none`** — full viewport on mobile (no dimmed sliver).
- **Open:** Menu tab, or swipe right from the left edge via [`MobileEdgeSwipeOpener`](../../src/components/layout/MobileEdgeSwipeOpener.tsx) (18px strip; `--mobile-header-h` / `--mobile-tab-bar-h` on the shell).
- **Close:** rail header ×, overlay, Escape, or swipe left on the drawer (**vaul** `direction="left"`).
- **`BubbleSidebar`** in the drawer uses **`hideWorkspaceTitle`** and **`isMobileDrawerMode`** with `hideSidebarCollapseButton: true` where applicable — the drawer closes via the overlay/escape/swipe, not via collapse chevrons.

- Selecting a bubble inside the drawer **closes the drawer** and, on narrow viewports, calls **`mobileShell.setTab('chat')`** (same URL writer as the tab bar).

- Opening **People & invites** also auto-closes the drawer (`openPeopleInvites` calls `setMobileNavOpen(false)` / `setDrawerOpen(false)` when `layoutMobile`).

---

## 4. Tabs and the desktop "split" layout reduction

The desktop dashboard uses a multi-column resizable shell (`WorkspaceRail` | `BubbleSidebar` | `Messages` | `Kanban` | `Calendar`). On mobile this is **flattened to one visible region at a time**, driven by `?tab=`.

| `?tab=`          | What is visible inside the body                  | Active panel state                                                       |
| ---------------- | ------------------------------------------------ | ------------------------------------------------------------------------ |
| `chat` (default) | `ChatArea` only — calendar and Kanban are hidden | `chatCollapsed=false`, `kanbanCollapsed=true`, `calendarCollapsed=false` |
| `board`          | `KanbanBoard` only — calendar slot is omitted    | `chatCollapsed=true`, `kanbanCollapsed=false`                            |
| `calendar`       | `CalendarRail` (main-stage variant)              | `chatCollapsed=true`, `kanbanCollapsed=true`, `calendarCollapsed=false`  |

These transitions are wired in two layers:

**(a)** The `LayoutCommands` returned from `dashboard-shell.tsx` route any `focus*` macro (Messages / Board / Calendar / Split) through **`mobileShell.setTab(...)`** when `layoutMobile` (same `router.replace` semantics as [`useMobileShellState`](../../src/hooks/use-mobile-shell-state.ts)).

Note: `focusSplit()` falls back to `?tab=board` on mobile, since there is no split mode small enough to be useful on a phone.

**(b)** A single **`useLayoutEffect`** in `dashboard-shell.tsx` hydrates collapse flags from `localStorage` (rails + desktop prefs) and applies **`resolveDashboardLayoutCollapse`** ([`src/lib/dashboard-layout-collapse.ts`](../../src/lib/dashboard-layout-collapse.ts)). On narrow viewports it reads **`readIsNarrowBelowMd()`** synchronously inside the effect (not a stale `useState(false)` from the first paint), so **`?tab=` is authoritative** for the chat/kanban/calendar triplet on the same pass. Deps: `[workspaceId, embedMode, urlTab, urlView, narrowViewport]` (viewport changes re-run hydrate).

`layoutHydrated` is true only when `layoutHydratedWorkspaceId === workspaceId`, so workspace switches re-hydrate before persistence effects run.

### How `WorkspaceMainSplit` honors the active tab

`WorkspaceMainSplit` is the same component used on desktop, but the dashboard passes mobile-aware flags so it renders the correct single-pane view:

```1478:1483:src/components/dashboard/dashboard-shell.tsx
  const omitMobileNonChatStrip = layoutMobile && mobileTab !== 'chat';
  const hideCalendarForMobileBoard = layoutMobile && mobileTab === 'board';
```

```1683:1684:src/components/dashboard/dashboard-shell.tsx
      hideMainStageBelowMd={layoutMobile && mobileTab === 'chat'}
```

Inside `WorkspaceMainSplit` these surface as Tailwind responsive classes that hide whole subtrees below `md`:

```164:218:src/components/dashboard/workspace-main-split.tsx
  return (
    <div ref={containerRef} className="flex min-h-0 min-w-0 flex-1">
      <div
        className={cn(
          'flex min-h-0 min-w-0 flex-col overflow-hidden border-r border-border bg-background',
          chatCollapsed && 'pointer-events-none w-0 min-w-0 flex-[0_0_0] border-transparent',
          messagesOnlyMain && 'min-w-0 flex-1',
          hideMainStageBelowMd && 'max-md:w-full max-md:min-w-0 max-md:flex-1',
        )}
        ...
      >
        {renderChat({ onCollapse: collapseChat })}
      </div>
      ...
      {!hideMainStage && (
        <div
          data-workspace-kanban-stage
          className={cn(
            'flex min-h-0 min-w-0 flex-1 flex-row',
            hideMainStageBelowMd && 'max-md:hidden',
          )}
        >
          ...
```

So on the **chat tab** the chat element grows to the full mobile width and the Kanban/calendar stage is `max-md:hidden`. On the **board tab** the chat side is `flex-[0_0_0]` and the Kanban stage is the only flex child. On the **calendar tab**, `kanbanCollapsed` is also true, so `WorkspaceMainSplit` substitutes the `CalendarRail` into the stage with `mainStage: true` (see `workspace-main-split.tsx` lines 237–247).

---

## 5. Content behaviors that change on mobile

The dashboard's children also adapt without needing the `layoutMobile` flag, by using `max-md:` / `md:hidden` rules.

### 5.1 Kanban board (`src/components/board/KanbanBoard.tsx`)

- **Strip column** (the narrow vertical "Kanban" hide-strip) is `max-md:hidden`. The strip exists for desktop split layouts only:

  ```173:177:src/components/board/KanbanBoard.tsx
              'max-md:hidden shrink-0 border-r border-border bg-background',
              COLLAPSED_COLUMN_WIDTH_CLASS,
            )}
            aria-hidden
          />
  ```

- **Horizontal column scroll** uses **CSS scroll snapping** (`snap-proximity` on mobile) below `md`, so swiping between Kanban columns can snap gently without fighting **`TouchSensor`** long-press DnD. The desktop scroll bar is also hidden on mobile:

  ```1334:1339:src/components/board/KanbanBoard.tsx
        <div
          className={cn(
            'min-h-0 flex-1 overflow-x-auto overflow-y-hidden overscroll-x-contain',
            'max-md:snap-x max-md:snap-proximity max-md:[scrollbar-width:none] max-md:[&::-webkit-scrollbar]:hidden',
          )}
        >
  ```

- The **collapse-board-strip** chrome and **panel-collapse buttons** in the board header are `max-md:hidden`, because there are no other panels to collapse into on mobile.

### 5.2 Calendar rail (`src/components/dashboard/calendar-rail.tsx`)

- The **collapsed strip** variant of the calendar (`isCollapsed={true}`) is `max-md:hidden` — it is meaningless on mobile because the calendar is either the active tab (full width) or completely hidden:

  ```406:413:src/components/dashboard/calendar-rail.tsx
    if (isCollapsed) {
      return (
        <div
          className={cn(
            'max-md:hidden flex h-full min-h-0 shrink-0 flex-col overflow-hidden border-l border-border bg-muted/30',
            COLLAPSED_COLUMN_WIDTH_CLASS,
          )}
        >
  ```

- The **calendar-collapse button** in the chrome bar is `max-md:hidden` for the same reason.

### 5.3 Chat (`src/components/chat/ChatArea.tsx`)

- The **"Collapse Messages" button** in the chat header is `max-md:hidden`. Mobile users use the bottom tab bar instead of collapsing the chat into a strip.
- On narrow viewports, **threads** use [`MobileThreadSheet`](../../src/components/layout/MobileThreadSheet.tsx) (vaul `direction="right"`, full width) with URL state **`?thread={messageId}`** (`router.push` on open, `router.back()` on close when opened via push). Desktop keeps the side-by-side `w-80` column. See [`chat-area-thread-assessment.md`](./chat-area-thread-assessment.md).

### 5.4 Task modal (`src/components/modals/TaskModal.tsx`)

The task modal becomes **full-screen below `md`** instead of a centered card:

```965:976:src/components/modals/TaskModal.tsx
      <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 max-md:p-0 max-md:items-stretch">
        ...
            'max-md:flex-1 max-md:min-h-0 max-md:max-h-none max-md:max-w-none max-md:rounded-none max-md:border-x-0 max-md:border-t-0',
```

`z-[150]` is intentionally above the `MobileTabBar` (`z-[90]`) and above sheet overlays (`z-110–120`) so the modal is reachable on phones. The bottom **`TaskModalTabBar`** also pads `pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))]` to clear the home indicator (`src/components/modals/task-modal/TaskModalTabBar.tsx`).

When the modal is in **workout split** mode on mobile, the unified pane logic uses `max-md:hidden` / `max-md:flex` to swap between the workout view and the task details view — only one is visible on a phone at a time.

### 5.5 Class deck builder & async player

When a class deck builder (`?class_deck_builder=…`) or async player (`?class_async_player=…`) is active on mobile, the shell **forces `?tab=board`** (via **`mobileShell.setTab('board')`** after a `searchParams.get('tab') === 'board'` guard) so the main-stage takeover renders correctly without redundant history entries.

### 5.6 Live video dock

When a live video session is active, the dashboard renders a `ResizablePanelGroup` for the dock + workspace split. On mobile (and embed) the resize handle is **disabled** so the user cannot accidentally drag a tiny pane:

```1904:1904:src/components/dashboard/dashboard-shell.tsx
                                    disabled={layoutMobile || embedMode}
```

The theater layout planner (`src/features/live-video/theater/live-theater-layout.types.ts`) treats `layoutMobile || embedMode` as the **`compact`** branch, which always returns `vertical_compact_session` shell + `useFlexColumnLayout: true`. There is no horizontal "theater + board" split on mobile.

### 5.7 Floating chrome that respects the tab bar

Shell-level overlays use the same **`--mobile-tab-bar-h`** token as the tab bar:

- **Comment alert toast** — `bottom-[calc(var(--mobile-tab-bar-h)+0.5rem)]` on mobile, `md:bottom-6` on desktop.
- **"Exit selection mode" floating button** — same mobile bottom token; `md:bottom-6 md:left-6` on desktop.

Other components (e.g. **`RichMessageComposer`** popovers) may still use literal `bottom-*` until migrated; prefer **`calc(var(--mobile-tab-bar-h)+…)`** for new dashboard floaters on mobile.

### 5.8 The desktop title strip and view switcher

The 44 px title strip (`max-md:hidden`) that contains the BuddyBubble title, presence stack, `DesktopViewSwitcher`, and (for fitness workspaces) the Fitness Profile button is **hidden on mobile**:

```1777:1810:src/components/dashboard/dashboard-shell.tsx
                      <div className="max-md:hidden flex h-11 shrink-0 items-center justify-between gap-3 border-b border-border bg-background px-4">
                        ...
                          <DesktopViewSwitcher
                            activeMode={desktopFocusModeActive}
                            onBeforeSelectChat={onDesktopSwitcherBeforeSelectChat}
                            onChange={applyDesktopFocusMode}
                            disabled={!layoutHydrated}
                          />
                          ...
```

The `DesktopViewSwitcher` itself is also `max-md:hidden` internally (`src/components/layout/desktop-view-switcher.tsx`, line 36). On mobile, the equivalent role is filled by the `MobileTabBar`.

---

## 6. State, persistence, and what carries over

The mobile shell does **not** add any new persisted state. It piggybacks on the existing collapse keys defined in `src/lib/layout-collapse-keys.ts`:

| Concept                               | localStorage key                                      |
| ------------------------------------- | ----------------------------------------------------- |
| Workspace rail collapsed              | `buddybubble.workspaceRailCollapsed.{workspaceId}`    |
| Bubble sidebar collapsed              | `buddybubble.bubbleSidebarCollapsed.{workspaceId}`    |
| Chat (Messages) collapsed             | `buddybubble.chatCollapsed.{workspaceId}`             |
| Kanban collapsed                      | `buddybubble.kanbanCollapsed.{workspaceId}`           |
| Calendar collapsed                    | `buddybubble.calendarCollapsed.{workspaceId}`         |
| Live dock vs workspace split (height) | `buddybubble.dockWorkspaceSplit.{workspaceId}` (JSON) |

The mobile **active tab is in the URL only** — it is not written to localStorage. This means:

- Refreshing on mobile keeps you on the same tab via `?tab=`.
- Resizing from mobile → desktop preserves the underlying collapse state, so the user lands in a consistent multi-column layout (the deep-link effect in §4(b) keeps things sane).
- Resizing from desktop → mobile collapses to whichever tab matches the current desktop focus mode, because the tab bar reads `?tab=` and `LayoutCommands` dispatches through **`mobileShell.setTab(...)`** whenever a focus mode is invoked on narrow viewports.

The drawer open flag comes from **`useMobileShellState()`** (same provider as the tab bar). It is **not** in the URL and is not persisted — each full navigation starts with the drawer closed.

---

## 7. Behavior around hydration

`DashboardShell` uses `useIsNarrowBelowMd` for the breakpoint and gates column behavior on `layoutHydrated` (`layoutHydratedWorkspaceId === workspaceId`). A single **`useLayoutEffect`** reads localStorage and applies `resolveDashboardLayoutCollapse` (mobile: `?tab=` wins). This matters on mobile in two ways:

1. The `LayoutCommands.focusMessages|focusBoard|focusCalendar|focusSplit` macros are **no-ops while `!layoutHydrated`**, so an early click on the tab bar will not race the hydration write to localStorage. The tab bar's own `?tab=` mutation still works (it does not depend on `layoutHydrated`); collapse flags update when the hydrate effect runs (`urlTab`, `workspaceId`, `narrowViewport`).
2. The `Suspense` fallback in `src/app/(dashboard)/app/[workspace_id]/layout.tsx` renders a column shell with `flex-col bg-background md:flex-row md:overflow-hidden` and **`h-[100dvh]`** so the SSR placeholder height matches the hydrated dashboard shell (avoids iOS URL-bar jitter).

   ```10:20:src/app/(dashboard)/app/[workspace_id]/layout.tsx
   function DashboardRouteFallback() {
     return (
       <div
         className="flex h-[100dvh] min-h-0 flex-col bg-background md:flex-row md:overflow-hidden"
         aria-busy="true"
         aria-label="Loading workspace"
       >
         <div className="min-h-0 min-w-0 flex-1 animate-pulse bg-muted/25" />
       </div>
     );
   }
   ```

---

## 8. Accessibility notes

- `MobileHeader` uses a real `<header>` and a single `<h1>`; the current screen identity is the BuddyBubble title.
- `MobileTabBar` uses `<nav aria-label="Primary socialspace views">`. Each tab is a `<button>`; the menu opener is a `<button>` (not a tab — it never receives `aria-current`). The active tab uses color/weight, not just color, to indicate state (`stroke-[2.25px]` on the icon plus `text-primary`).
- `MobileSidebarSheet` uses **vaul** (`Drawer` with `direction="left"`); the `Drawer.Title` is `sr-only` because the rail headers inside provide visible labels. Dismiss by overlay, Escape, rail close, or **swipe left on the drawer** (vaul). Open from the left edge via `MobileEdgeSwipeOpener` (not Radix Sheet defaults). Other surfaces still use [`sheet.tsx`](../../src/components/ui/sheet.tsx).
- `pb-[env(safe-area-inset-bottom,0px)]` on the tab bar and the body container respects iOS home-indicator safe areas. The task modal's tab bar pads its bottom the same way.
- The kanban swipe-snap region hides its scrollbar (`[scrollbar-width:none]`) but remains keyboard-scrollable because the underlying element is a normal scroll container.

---

## 9. What does **not** change on mobile

It is useful to know what the mobile layout deliberately leaves alone:

- **Routing**: there is no `/m/...` route or separate page tree. Mobile is a CSS + component swap inside the same `/app/[workspace_id]` route.
- **Data fetching**: hooks (`useUpdatePresence`, realtime subscriptions, store loaders) all run identically on mobile.
- **Permissions and roles**: `usePermissions` and the trial soft-lock logic are viewport-agnostic.
- **Theming**: `ThemeScope` and the workspace category theme map apply exactly the same way; mobile never forces light/dark mode.
- **Modals**: every modal (`TaskModal`, `WorkspaceSettingsModal`, `PeopleInvitesModal`, `ProfileModal`, `ProfileCompletionModal`, `CreateWorkspaceModal`, `FitnessProfileSheet`, `StartTrialModal`, `LiveClassReminderModal`) uses its own `max-md:` rules; the dashboard does not gate modal mounting on `layoutMobile`.

---

## 10. File map

### Mobile-specific components

- `src/components/layout/MobileHeader.tsx` — top title bar
- `src/components/layout/MobileTabBar.tsx` — bottom 4-item nav
- `src/components/layout/MobileSidebarSheet.tsx` — left-edge off-canvas drawer
- `src/components/layout/MobileWorkspaceStrip.tsx` — horizontal BuddyBubble strip inside the drawer

### Detection & shared constants

- `src/hooks/use-is-narrow-below-md.ts` — `useIsNarrowBelowMd()` matchMedia hook
- `src/lib/viewport.ts` — **`NARROW_MAX_QUERY`** (canonical `(max-width: 767.98px)` string)
- `src/lib/mobile-crm-tab.ts` — `MobileCrmTab` type and `normalizeMobileTab`

### Shell state

- `src/hooks/use-mobile-shell-state.ts` — `MobileShellProvider`, `useMobileShellState()` (`tab`, `setTab`, `drawerOpen`, `setDrawerOpen`)

### Orchestration

- `src/components/dashboard/dashboard-shell.tsx` — owns `layoutMobile`, wires **`useMobileShellState()`** (as `mobileShell` / `mobileTab` / drawer aliases), the deep-link reconciliation effect, and renders the three mobile chrome regions
- `src/components/dashboard/workspace-main-split.tsx` — receives `omitCollapsedMessagesStrip`, `hideCalendarSlot`, `hideMainStageBelowMd`, `hideMainStage` and applies `max-md:` Tailwind classes to drop subtrees on mobile

### Companion responsive behavior

- `src/components/board/KanbanBoard.tsx` — mobile snap-scroll + hidden strip column
- `src/components/dashboard/calendar-rail.tsx` — hides collapsed-strip variant + collapse button on mobile
- `src/components/chat/ChatArea.tsx` — hides "Collapse Messages" button on mobile
- `src/components/modals/TaskModal.tsx` — full-screen below `md`
- `src/components/modals/task-modal/TaskModalTabBar.tsx` — safe-area bottom padding

### Cross-references

- `docs/tdd-layout-column-drawers.md` — the column-collapse persistence contract that mobile inherits via `?tab=`
- `src/lib/layout-collapse-keys.ts` — all localStorage keys mobile may write through

### Tests (Vitest)

- `src/lib/mobile-crm-tab.test.ts` — tab normalization
- `src/hooks/use-is-narrow-below-md.test.tsx` — narrow detection
- `src/components/layout/mobile-chrome.test.tsx` — mobile chrome smoke

---

## 11. Quick recipes

**"Add a new bottom-bar tab."**

1. Extend `MobileCrmTab` in `src/lib/mobile-crm-tab.ts` and update `normalizeMobileTab`.
2. Add the `{ id, label, Icon }` entry to `ITEMS` in `src/components/layout/MobileTabBar.tsx`.
3. Wire the new value in the deep-link effect (~`dashboard-shell.tsx` line 1216) and in `LayoutCommands` so the underlying desktop collapse flags stay coherent when the viewport widens.

**"Show a new piece of chrome only on mobile."**

- Use `md:hidden` (Tailwind) so the element is purely CSS-gated. Reach for `layoutMobile` only when you need React-level branching (e.g., to mount a different component tree, swap props, or skip an effect).

**"Make sure floating UI doesn't collide with the tab bar."**

- Prefer **`bottom-[calc(var(--mobile-tab-bar-h)+0.5rem)]`** (or a similar offset) on mobile so floaters track tab-bar height + safe area; use `md:bottom-6` on desktop. Pair with `z-[100]` or higher to clear the tab bar's `z-[90]`.

**"Disable the mobile shell for a screenshot or marketing iframe."**

- Append `?embed=true` to the dashboard URL. `embedMode` will force `layoutMobile = false` regardless of viewport size.
