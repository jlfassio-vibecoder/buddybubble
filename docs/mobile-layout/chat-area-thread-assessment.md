# Mobile ChatArea rail & nested thread drawer — architectural assessment & gap analysis

> **Companion to** [`README.md`](./README.md) and [`architecture-assessment.md`](./architecture-assessment.md).  
> **Scope:** Main Messages rail (`ChatArea`) and its nested **`ThreadPanel`** on narrow viewports (`layoutMobile`, `?tab=chat`). Does **not** cover `StandardTaskChatRail` / Task Modal task-scoped threads (separate surface).  
> **Method:** Code audit (2026-05-20), aligned with post–PR #118 mobile shell behavior (`resolveDashboardLayoutCollapse`, `MobileShellProvider`).

---

## 1. Executive summary

The mobile **Chat** tab correctly shows **only** the Messages column (`hideMainStageBelowMd`, `omitMobileNonChatStrip`). Inside that column, however, **`ChatArea` and `ThreadPanel` are unchanged desktop layouts**: a horizontal split (feed + fixed **320px** thread column) with no `max-md:` adaptation, no full-screen thread takeover, and no coordination with shell chrome (`MobileHeader`, `MobileTabBar`, `--mobile-tab-bar-h`).

**Net assessment (2026-05-20 update):** **Phase A + B3 are shipped.** Narrow viewports open threads in [`MobileThreadSheet`](../../src/components/layout/MobileThreadSheet.tsx) (full-bleed vaul, `z-[100]`/`z-[110]`). Thread visibility on mobile is driven by **`?thread={messageId}`** ([`src/lib/mobile-chat-thread.ts`](../../src/lib/mobile-chat-thread.ts)); open uses `router.push`, close uses `router.back()` when the thread was opened via push (else `replace` strips the param). Desktop remains the `w-80` flex column. **Remaining gaps:** C3–C10 (header duplication, composer `bottom-24`, search panels, etc.) — see §5 and Phase B/C below.

---

## 2. Where Chat sits in the mobile shell

When `layoutMobile === true` and `?tab=chat` (default), the user sees this stack:

```
┌──────────────────────────────────────────────┐
│  MobileHeader (h-14 + safe-area-top)        │  ← shell: buddyBubbleTitle
├──────────────────────────────────────────────┤
│  ChatArea outer column (flex-1 min-h-0)      │
│  ┌────────────────────────────────────────┐ │
│  │ ChatArea header (optional workspace row │ │  ← NOT hidden on mobile
│  │   h-9 + channel row h-16)               │ │
│  ├────────────────────────────────────────┤ │
│  │ flex row: feed | ThreadPanel w-80       │ │  ← desktop split, always
│  ├────────────────────────────────────────┤ │
│  │ RichMessageComposer (rail density)      │ │
│  └────────────────────────────────────────┘ │
├──────────────────────────────────────────────┤
│  MobileTabBar (--mobile-tab-bar-h)          │
└──────────────────────────────────────────────┘
```

**Shell wiring** (verified in [`dashboard-shell.tsx`](../../src/components/dashboard/dashboard-shell.tsx)):

| Flag                     | When `?tab=chat` on mobile | Effect on Chat                                                 |
| ------------------------ | -------------------------- | -------------------------------------------------------------- |
| `hideMainStageBelowMd`   | `true`                     | Kanban/calendar stage hidden; chat column gets `max-md:flex-1` |
| `omitMobileNonChatStrip` | `false`                    | No collapsed “Messages” strip beside chat                      |
| `onCollapse`             | Still passed               | Collapse control hidden in `ChatArea` via `max-md:hidden`      |

`ChatArea` has **no** `layoutMobile` prop and **no** `useIsNarrowBelowMd()` — it cannot distinguish mobile from a narrow desktop window except via incidental Tailwind on one header button.

---

## 3. Component architecture

### 3.1 `ChatArea.tsx` (~1.5k LOC)

**Role:** Orchestration shell for bubble-scoped messaging: header, search overlay, feed, thread slot, main composer, notifications, media modal.

| Concern                         | Owner                                                      | Mobile awareness            |
| ------------------------------- | ---------------------------------------------------------- | --------------------------- |
| Message load / send             | `useMessageThread`                                         | None                        |
| Thread parent state             | `activeThreadParent` (`useState`)                          | None                        |
| Peer notification → open thread | `openThreadFromPeerIntent`                                 | None                        |
| Layout                          | `flex min-h-0 flex-1` messages row + `ThreadPanel` sibling | Desktop side-by-side only   |
| Collapse rail                   | `onCollapse` + `PanelLeftClose`                            | Button `max-md:hidden` only |

**Messages region** (`ChatArea.tsx` ~1311–1401):

```tsx
<div className="flex min-h-0 flex-1 overflow-hidden">
  <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 ...">…feed…</div>
  <ThreadPanel … />
</div>
```

Both children are flex siblings with **no** `max-md:flex-col`, **no** overlay, **no** conditional unmount of the feed when a thread is open.

**Header** (~998–1117): Two-row chrome — optional `workspaceTitle` strip (`h-9`) plus channel row (`h-16`, `px-6`). Duplicates information already shown in `MobileHeader` (bubble/workspace title). Desktop collapse, search, bell, and info icons remain visible on mobile.

### 3.2 `ThreadPanel.tsx`

**Role:** Slack-style thread drawer: parent message, replies, thread-scoped `RichMessageComposer`.

| Property | Value                  | Mobile impact                                                          |
| -------- | ---------------------- | ---------------------------------------------------------------------- |
| Width    | `w-80` (20rem / 320px) | Fixed; does not scale to viewport                                      |
| Position | In-flow flex sibling   | Squeezes feed; not `fixed` / full-screen                               |
| Motion   | `x: '100%'` spring     | Slide-in from right within **allocated** 320px, not over full viewport |
| z-index  | `z-10`                 | Below shell tab bar (`z-[90]`) and modals (`z-[150]`)                  |
| Close    | Header `X`             | No back gesture, no URL, no history entry                              |

Thread composer uses `density="thread"` (smaller controls). Mentions/slash disabled (`features` prop).

### 3.3 Shared dependencies

| Component                        | Used by       | Mobile notes                                                                                   |
| -------------------------------- | ------------- | ---------------------------------------------------------------------------------------------- |
| `ChatMessageRow`                 | Feed + thread | `density="rail" \| "thread"`; “Reply in thread” hidden until **hover** on zero-reply messages  |
| `RichMessageComposer`            | Main + thread | Rail popovers `absolute bottom-24 left-6`; portals into `composerPopoverRef` on main rail only |
| `ChatFeedTaskCard` / attachments | Feed + thread | Card width follows parent; narrow feed truncates heavily when thread open                      |

---

## 4. Behavioral flows on mobile

### 4.1 Open Chat tab

1. User lands on `/app/{workspace}?view=messages&tab=chat` (or taps **Chat**).
2. Shell hydrates collapse flags ([`resolveDashboardLayoutCollapse`](../../src/lib/dashboard-layout-collapse.ts)).
3. `WorkspaceMainSplit` renders only the chat column full width below `md`.
4. `ChatArea` mounts with **full internal header** + feed + bottom composer.

**Gap:** ~**81px+** of vertical chrome before the first message (shell header 56px + chat header up to 25px + channel 64px — exact total depends on `workspaceTitle`).

### 4.2 Open thread from feed

1. User taps “N replies” (always visible) or attempts “Reply in thread” (often **invisible** until hover).
2. `setActiveThreadParent(msg)`; `ThreadPanel` animates in as **320px** right column.
3. Main feed remains visible but **~18%** of viewport width on iPhone 14 width (390px − 320px ≈ 70px).
4. Main rail composer **stays mounted** below the split — two composers can appear on screen (main + thread).

**Gap:** No single-focus mode; no hide-feed-on-thread; browser back does not close thread.

### 4.3 Thread from notification bell

Same as 4.2; `setOpenThreadFromPeerIntent` resolves parent from `allMessages` and focuses thread composer via `composerFocusNonce`.

**Gap:** Notification dropdown (`w-80 absolute right-0`) may clip or extend past the left edge on very narrow widths; not anchored to a touch-friendly bottom sheet.

### 4.4 Search overlay

`AnimatePresence` expands a multi-field search panel (`grid-cols-1 md:grid-cols-3`). On mobile, fields stack — acceptable — but consumes large vertical space above an already chrome-heavy column.

**Gap:** Tapping a result only closes search; does not scroll to message or open thread (noted in code comment “In a real app…”).

### 4.5 Composer popovers (@ / / / #)

Popovers render at `bottom-24` (6rem) from the **`composerPopoverRef`** root (`ChatArea` outer `relative` div).

**Gap:** Tab bar height is `calc(4rem + safe-area-inset-bottom)` (`--mobile-tab-bar-h`). **`bottom-24` ≠ tab bar offset** — popovers can overlap the tab bar or sit too high on devices with large home indicators. Documented as **F6 remainder** in [`architecture-assessment.md`](./architecture-assessment.md).

---

## 5. Gap analysis (findings table)

Severity matches [`architecture-assessment.md`](./architecture-assessment.md): **P0** user-visible defect; **P1** fragility before next mobile feature; **P2** cleanup.

| ID      | Finding                                                                                                                     | Severity | Where                                               |
| ------- | --------------------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------- |
| **C1**  | Thread opens as **in-flow `w-80` column**, crushing the main feed on narrow viewports                                       | **P0**   | `ThreadPanel.tsx:89`, `ChatArea.tsx:1311`           |
| **C2**  | **“Reply in thread”** control uses `opacity-0 group-hover:opacity-100` — unreliable on touch                                | **P0**   | `ChatMessageRow.tsx:180–186`                        |
| **C3**  | **Double (triple) header stack**: `MobileHeader` + ChatArea workspace strip + channel header                                | **P1**   | `MobileHeader.tsx`, `ChatArea.tsx:999–1017`         |
| **C4**  | **`RichMessageComposer` popovers** use literal `bottom-24`, not `--mobile-tab-bar-h`                                        | **P1**   | `RichMessageComposer.tsx:615,657,711,784`           |
| **C5**  | **Two composers** visible when thread open (main rail + thread) — confusing on small screens                                | **P1**   | `ChatArea.tsx:1311–1511`, `ThreadPanel.tsx:140`     |
| **C6**  | Thread state is **React-only** — no `?thread=` URL, no `router.back()` close, no share/deep link                            | **P1**   | `ChatArea.tsx:193`, `ThreadPanel.tsx`               |
| **C7**  | **`ChatArea` is layout-agnostic** — no `layoutMobile` / hook; cannot adopt full-screen thread without shell prop or context | **P1**   | `ChatArea.tsx` (entire), `dashboard-shell.tsx:1955` |
| **C8**  | Active thread highlight uses **`-mx-6 px-6`** — assumes desktop feed padding; can misalign on narrow feed                   | **P2**   | `ChatMessageRow.tsx:82`                             |
| **C9**  | Search / notification panels use **fixed `w-80`** absolute positioning — edge clipping risk                                 | **P2**   | `ChatArea.tsx:1053`, notifications popover          |
| **C10** | **Footer hint** on main composer (keyboard shortcuts) is desktop-centric noise on mobile                                    | **P2**   | `ChatArea.tsx:1504–1510`                            |
| **C11** | No **Vitest / Playwright** coverage for mobile thread layout or touch thread entry                                          | **P2**   | test tree                                           |
| **C12** | README §5.3 states thread/composer “rely on internal responsive sizing” — **inaccurate** for threads                        | **P2**   | `README.md` §5.3                                    |

**Counts:** **2× P0**, **5× P1**, **5× P2**.

---

## 6. Comparison to established mobile patterns in-repo

| Pattern                      | Reference                                                   | Chat/thread today                                     |
| ---------------------------- | ----------------------------------------------------------- | ----------------------------------------------------- |
| Full-bleed overlay drawer    | `MobileSidebarSheet` (vaul `direction="left"`, `w-full`)    | Thread is partial-width in-flow column                |
| URL-driven navigation        | `?tab=`, `?nav=open` via `useMobileShellState`              | Thread parent id only in React state                  |
| Shell height tokens          | `--mobile-tab-bar-h`, `--mobile-header-h` on dashboard root | Composer popovers ignore tokens                       |
| Single-pane mobile tabs      | `WorkspaceMainSplit` `hideMainStageBelowMd`                 | Chat **internally** still multi-pane when thread open |
| Full-screen modal below `md` | `TaskModal` `max-md:rounded-none max-md:flex-1`             | Thread not elevated to modal/sheet tier               |
| Touch-first controls         | Kanban `TouchSensor`, drawer swipe                          | Thread entry relies on hover                          |

**Implication:** The thread UX should be treated as a **third mobile overlay tier** (alongside Social Space drawer and Task Modal), not as a miniature desktop column.

---

## 7. Recommended remediation map

Ordered by dependency. Estimates are engineering days for a focused mobile pass.

### Phase A — P0 (thread usable on phone) — **DONE**

| Step | Status | Implementation                                                                                                                                                            |
| ---- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1   | Done   | [`MobileThreadSheet.tsx`](../../src/components/layout/MobileThreadSheet.tsx); [`ChatArea.tsx`](../../src/components/chat/ChatArea.tsx) branches on `useIsNarrowBelowMd()` |
| A2   | Done   | [`ChatMessageRow.tsx`](../../src/components/chat/ChatMessageRow.tsx) `max-md:opacity-100` on “Reply in thread”                                                            |
| A3   | Done   | Main rail [`RichMessageComposer`](../../src/components/chat/RichMessageComposer.tsx) hidden when narrow + thread open                                                     |

### Phase B — P1 (shell alignment)

| Step | Status | Notes                                                                                                                           |
| ---- | ------ | ------------------------------------------------------------------------------------------------------------------------------- |
| B1   | Open   | ChatArea header compaction                                                                                                      |
| B2   | Open   | Composer popovers vs `--mobile-tab-bar-h`                                                                                       |
| B3   | Done   | `?thread=` in [`ChatArea`](../../src/components/chat/ChatArea.tsx); push/back; strip on invalid id, bubble change, non-chat tab |
| B4   | Done   | vaul swipe-to-close + header close → `closeThread()`                                                                            |

### Phase C — P2 (quality)

| Step | Change                                                                                   | Files                                  |
| ---- | ---------------------------------------------------------------------------------------- | -------------------------------------- |
| C1   | Hide `footerHint` below `md` on rail composer                                            | `ChatArea.tsx` / `RichMessageComposer` |
| C2   | Notification / search panels: `max-w-[min(20rem,100vw-2rem)]` + collision-aware position | `ChatArea.tsx`                         |
| C3   | Vitest: narrow viewport + thread open → feed hidden; touch thread button visible         | new `chat-area-mobile.test.tsx`        |
| C4   | Update [`README.md`](./README.md) §5.3 to point here                                     | docs                                   |

**Out of scope for this doc:** migrating bubble chat to `StandardTaskChatRail` ([`phase-6-chat-area-and-future-surfaces.md`](../refactor/standard-task-chat-rail/phase-6-chat-area-and-future-surfaces.md)); task-scoped `ThreadPanel` in Task Modal comments; arbitrary-depth threading.

---

## 8. Target architecture (mobile thread)

**Implemented (Phase A + B3):**

```
?tab=chat
  ChatArea (single column)
    ├─ compact header (channel only)
    ├─ feed (flex-1)
    └─ composer (respects --mobile-tab-bar-h)

?tab=chat&thread={id}   [optional Phase B3]
  MobileThreadOverlay (vaul right, z-[100])
    ├─ back / close
    ├─ parent + replies (scroll)
    └─ thread composer
```

**Z-index ladder (suggested):** tab bar 90 → thread overlay 100 → Task Modal 150 → same as existing modal doc.

---

## 9. Verification checklist (manual QA)

After Phase A/B work:

- [ ] iPhone-width viewport, Chat tab: feed uses full width; no Kanban/calendar bleed.
- [ ] Open thread with 0 replies: entry control visible without hover.
- [ ] With thread open: feed not interactable (hidden or covered); one composer.
- [ ] Close thread: returns to feed; tab bar still visible; no layout jump under URL bar.
- [ ] @ mention popover clears tab bar and home indicator.
- [ ] Peer notification opens correct thread; unread badge clears.
- [ ] Rotate to landscape: thread remains usable (acceptable v1: same overlay; landscape polish can be P2).

---

## 10. Related documentation

| Doc                                                                                              | Relevance                                                                      |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| [`README.md`](./README.md)                                                                       | Shell tabs, `WorkspaceMainSplit` flags, §5.3 Chat (needs C12 update after fix) |
| [`architecture-assessment.md`](./architecture-assessment.md)                                     | F6 composer `bottom-*`, F12 test gaps, F14/F15 shell debt                      |
| [`social-space-drawer-ui-issues.md`](./social-space-drawer-ui-issues.md)                         | vaul drawer pattern to mirror for threads                                      |
| [`../CHAT_ARCHITECTURE_ASSESSMENT.md`](../CHAT_ARCHITECTURE_ASSESSMENT.md)                       | Data model, `ThreadPanel` role, composer contract                              |
| [`../fitness/views/layout-shell-architecture.md`](../fitness/views/layout-shell-architecture.md) | Mobile collapse / `?tab=` hydration                                            |

---

## 11. Changelog

| Date       | Change                                                                        |
| ---------- | ----------------------------------------------------------------------------- |
| 2026-05-20 | Initial assessment (post PR #118 mobile board tab fix)                        |
| 2026-05-20 | Phase A + B3 implemented: `MobileThreadSheet`, `?thread=`, touch thread entry |
