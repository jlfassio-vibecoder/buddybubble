# Task Modal UI Assessment — Layout, Focus Modes, and Refactor Direction

This document assesses the current layout of `src/components/modals/TaskModal.tsx` in relation to tabbed “focus” areas (Details, Comments, Subtasks, Activity). It maps the JSX architecture, identifies gaps versus a true focus-mode experience, and proposes structural changes **without** prescribing implementation code.

---

## 1. Current Layout Architecture

### 1.1 High-level JSX tree

The modal does **not** use Radix `Dialog` / `DialogContent`; it is a **custom full-screen overlay** with a centered card:

```
<>
  <div className="fixed inset-0 z-[150] ...">     // backdrop + viewport
    <button />                                     // click-outside close (aria-label="Close")
    <div className="relative ... max-h-[90vh] ... flex flex-col overflow-hidden">  // card shell
      {taskId ? <TaskModalHero ... /> : null}     // persisted task only
      <div className="flex min-h-0 flex-1 flex-col">                               // main column
        <div className="shrink-0 ... border-b">   // title row (“header strip”)
          <h2>{modalTitle}</h2>
          {modalSubtitle ? <p>...</p> : null}
          {!taskId ? <button close X /> : null}   // close only in create mode here
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto" onScroll={...}>           // scroll body
          <TaskModalEditorChrome ... />            // type / visibility / workout viewer row (conditional)
          <div className="px-6 pt-4 pb-4">
            {error, loading, ...}
            {tab === 'details' && (...)}
            {tab === 'comments' && <TaskModalCommentsPanel />}
            {tab === 'subtasks' && <TaskModalSubtasksPanel />}
            {tab === 'activity' && <TaskModalActivityPanel />}
          </div>
        </div>
        <div className="shrink-0 border-t" role="tablist">                         // bottom tab strip
          {tabBtn('details', 'Details')} ...
          {optional BubblyButton}
        </div>
      </div>
    </div>
  </div>
  <WorkoutViewerDialog ... />                      // sibling portal-like dialog
</>
```

**Mental model:** `Hero` (optional) → **fixed chrome** (title strip + scroll region + bottom tabs) inside a single `flex-col` card. The **scroll container** is only the middle block; the hero and bottom tablist are **not** inside that scroller.

### 1.2 Where header text and hero sit vs `tab`

| Region                                                | Relation to `tab`                                                                                                                                                                          |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`TaskModalHero`**                                   | Rendered when `taskId` is truthy **only** (`{taskId ? <TaskModalHero /> : null}`). **Independent of `tab`.** Always mounted for existing tasks for every tab.                              |
| **`modalTitle` / `modalSubtitle`** (the `<h2>` strip) | Computed from **create vs edit**, **item type**, and **workout card** detection (`isExistingWorkoutCard`). **No `tab` input.** Same strings for Details, Comments, Subtasks, and Activity. |
| **Tab panels**                                        | `tab` gates **only** the inner panel JSX inside the scrollable `px-6` wrapper (`tab === 'details' \| 'comments' \| ...`).                                                                  |

**Hero placement vs scroll:** The codebase explicitly documents intent: _“Hero stays fixed above this pane; collapse the cinematic cover when the user scrolls the body.”_ The hero is a **sibling above** the `overflow-y-auto` body, not inside it — so it is **fixed at the top of the card** (in the flex sense), not scrolling away with list content.

**Cinematic collapse:** `heroCinematicCollapsed` is toggled when the body `scrollTop > 8`, or when the user interacts with editor chrome (`onInteraction` → `setHeroCinematicCollapsed(true)`). Reset when `open`, `taskId`, or `cardCoverPath` changes. Again, **not** tied to `tab`.

### 1.3 Component boundaries (relevant to layout)

- **`TaskModalHero`** (`task-modal-hero.tsx`): Owns cover image, 16:9 cinematic vs compact layout, title/description preview, and close for **existing** tasks (hero path).
- **`TaskModalEditorChrome`**: Type selector, visibility, workout viewer trigger — shown when `showEditorChrome` is true (`!taskId || viewMode === 'full'`). **Not tab-aware**; for existing tasks in `full` view it appears **above all tab panels**.
- **Tab strip**: Local `tabBtn` helper; `selectTab` updates `tab` and may bump `viewMode` out of `comments-only` when leaving Comments.

---

## 2. Gap Analysis (Focus Modes)

### 2.1 Why this does not feel like “true” focus mode

1. **Visual hierarchy does not follow cognitive focus.** The user selects “Comments” or “Subtasks,” but the **hero** and **generic edit header** still communicate “this is the card editor / cover story,” not “you are now in discussion” or “you are now in checklist mode.”
2. **Vertical budget is dominated by non-tab content on non-Details tabs.** For persisted tasks with a cover image, **`TaskModalHero` keeps a large 16:9 region** until the user scrolls or triggers chrome interaction (`compactCinematic`). That behavior optimizes **Details + cinematic preview**, not **Comments / Subtasks / Activity** where density matters.
3. **Duplicate title surfaces.** In cinematic mode the hero shows **title + description**; the scroll body on Details repeats title in form fields; the header strip shows **modalTitle** again. On secondary tabs, users still see **hero title** + **“Edit … / Workout Card”** + panel content — noisy, not focused.
4. **`TaskModalEditorChrome` is global to the scroll body in full mode.** Type / visibility / workout controls remain **above** Comments, Subtasks, and Activity unless `viewMode === 'comments-only'`. That is correct for a global inspector, but it **competes** with list-style tabs for vertical space and attention.

### 2.2 Is the hero inside the scrollable body?

**No.** The hero is **outside** the `overflow-y-auto` region, as the first flex child of the card (when `taskId` is set). Only the middle column scrolls.

### 2.3 Are there hardcoded strings that resist tab-driven chrome?

**Yes, by construction:**

- **`modalTitle` / `modalSubtitle`** are built from fixed templates: e.g. create mode `New ${modalTypeNoun}`, edit mode `Edit ${modalTypeNoun}` or **`Workout Card`** for existing workout / workout_log cards, plus create-only subtitle copy. **`tab` never participates.**
- **Tab labels** are literals in `tabBtn('details', 'Details')`, etc. (appropriate for the strip; separate from header dynamics.)
- **`TaskModalHero`** uses `'Untitled'` when title is empty — internal to the hero component.

So the **header strip is intentionally stable** (edit vs create semantics). That stability is good for **orientation**, but it is exactly what prevents **tab-as-mode** messaging (e.g. “Comments” as primary title when on that tab) without a deliberate extension.

---

## 3. Refactoring Proposal

### 3.1 Dynamic header text without JSX clutter

**Pattern:** Treat “what the header should say” as **derived presentation state**, not inline ternaries in the return.

- **Option A — `useMemo` block near other derivations:** Build `{ primary, secondary }` from `{ tab, isCreateMode, itemType, title, ... }` in one object, then JSX only references `header.primary` / `header.secondary`. Keeps everything in `TaskModal.tsx` with minimal surface area.
- **Option B — small pure function in the same file or `task-modal-header-copy.ts`:** `getTaskModalHeaderCopy(ctx) => { title, subtitle }` with a unit-testable table for combinations (create vs edit × tab × workout card). **No hook required** if inputs are already in scope.
- **Option C — lookup map for tab-specific overlays:** e.g. base `editLabel` from current `modalTitle` logic, then `tab === 'comments' ? { subtitle: '…' } : {}` merged in one place. Avoid scattering `tab ===` in JSX.

**Recommendation:** Prefer **B or C** so product copy and edge cases (workout card vs generic edit) stay centralized and grep-friendly; use **A** only if the derivation stays tiny.

### 3.2 Safely hiding or collapsing the hero when `tab !== 'details'`

Goals: reclaim space on Comments / Subtasks / Activity, avoid **layout thrash**, and avoid **scroll position surprises** inside the body.

**Lowest-risk first step (reuse existing hero behavior):**  
`TaskModalHero` already implements **cinematic vs compact** via `compactCinematic`. Driving `compactCinematic={tab !== 'details' || heroCinematicCollapsed}` (conceptually) forces the **non–aspect-video** layout when leaving Details **without** unmounting the hero or changing the scroll container’s structure. Because the hero sits **above** the scroller, **body `scrollTop` is unchanged** when the hero height changes; the scrollable viewport simply **gains height** — typically no content “jump” inside the list, though the **visible** portion of the list may shift down slightly as more fits — usually acceptable.

**Stronger focus (hide hero entirely on non-Details tabs):**  
Unmounting or `display: none` on the hero **will** change flex layout and can feel abrupt. Mitigations:

- **Reserve a stable minimum height** for a “collapsed” slot (e.g. always render a thin top bar or zero-height transition) so tab switches do not reflow unrelated regions twice.
- Prefer **CSS height animation** (`grid-template-rows: 1fr` → `0fr` with `overflow: hidden`) or **`max-height` + `opacity`** on a wrapper, with **`prefers-reduced-motion`** respected, over instant DOM removal.
- **Do not** reset `scrollTop` on tab change unless you intentionally scroll to top for that tab — resetting can feel like a bug; if you need “top of thread,” do it explicitly per tab with documented UX.

**Interaction with `heroCinematicCollapsed`:** Keep scroll-driven collapse for **Details**; for other tabs, either **ignore** scroll-based collapse or **merge** with tab-driven rules so state stays predictable (document precedence: e.g. “tab !== details always wins for layout mode”).

### 3.3 Should we extract `TaskModalHeader.tsx`?

**Yes, when** you introduce non-trivial rules (tab + create/edit + workout card + optional subtitle / actions). Benefits:

- **`TaskModal.tsx`** stays focused on data, save flows, and tab wiring.
- **Header** owns: `h2`, subtitle, create-mode close button, and future **tab-specific** actions (e.g. “Mark read,” filter) without bloating the modal root.
- **Props stay explicit:** `title`, `tab`, `isCreateMode`, `itemType`, `onClose`, etc.

**Skip extraction** if the derived copy is a **single `useMemo`** returning two strings and no new actions — avoid premature abstraction.

**Optional parallel:** A thin **`TaskModalLayout.tsx`** shell (overlay + card + three regions: top / scroll / tab bar) could separate **geometry** from **business logic**, but that is a larger split; only worth it if you also reorganize hero + chrome placement.

---

## 4. Summary Table

| Concern       | Current behavior                 | Focus-mode gap                                 |
| ------------- | -------------------------------- | ---------------------------------------------- |
| Hero          | Fixed above scroll; tab-agnostic | Steals space on Comments / Subtasks / Activity |
| Header (`h2`) | Derived from mode + type only    | Does not reflect active tab / focus            |
| Editor chrome | Full mode: above all tabs        | Competes with list tabs for space              |
| Tab state     | Swaps inner panel only           | Does not orchestrate chrome or hero            |

---

## 5. Suggested implementation order (later)

1. **Derive header copy** from `tab` (and existing mode rules) via a single function or memo.
2. **Tie hero layout to `tab`** (compact on non-Details) using existing `TaskModalHero` props before considering full removal.
3. **Decide** whether Comments / Subtasks / Activity should hide or shorten **`TaskModalEditorChrome`** (product decision; technically independent of hero).
4. **Extract `TaskModalHeader`** once copy and actions stabilize.

This sequence keeps diffs small, preserves current scroll architecture, and validates UX before larger layout extractions.
