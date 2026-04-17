# Composer extraction plan (`RichMessageComposer`)

**Goal (Step 2 of [CHAT_AREA_REFACTOR_PLAN.md](./CHAT_AREA_REFACTOR_PLAN.md)):** Extract the rail composer from `ChatArea.tsx` (text input, @ mentions, `/` task tokens, pending files, “create card”, submit) into a reusable `<RichMessageComposer />`, then converge `ThreadPanel.tsx` onto the same component with **feature flags** so thread replies can stay simpler initially or gain parity deliberately.

This document defines **prop boundaries** and **state ownership** before any implementation.

---

## 0. Current-state inventory (what is coupled today)

### `ChatArea.tsx` (main rail composer)

**Text + refs**

- `input` / `setInput` (controlled string).
- `inputRef` for cursor-aware insertion (`insertMention`, `insertTaskMention`).
- `latestInputRef` synced from `input` via `useEffect` so `handleComposeChatCard` can read the latest caption when the task modal completes asynchronously.

**Mention / slash token detection**

- `handleInputChange` inspects `selectionStart`, derives `textBeforeCursor`, toggles:
  - `@` mention mode: `mentionSearch`, `showMentions`, `mentionIndex`, hides task mentions.
  - `/` task-link mode: `taskMentionSearch`, `showTaskMentions`, `taskMentionIndex`, hides member mentions when `@` branch wins.
- Uses `lastTaskMentionSlashIndex` (module-local helper) to avoid matching slashes inside URLs.

**Keyboard handling (same `<input onKeyDown>`)**

- When `showMentions` + `filteredMembers.length > 0`: ArrowUp/Down cycles `mentionIndex`; Enter/Tab inserts selected member; Escape closes.
- When `showTaskMentions`: recomputes `filtered` inline from `allTasks` + `taskMentionSearch`; ArrowUp/Down cycles `taskMentionIndex`; Enter/Tab inserts selected task title; Escape closes.
- **Note:** `mentionIndex` can be `-1` in state but Enter path assumes `filteredMembers[mentionIndex]` exists when popover visible (same as today).

**Popovers (rendered outside the composer DOM subtree)**

- Two `AnimatePresence` blocks **after** the main layout, positioned with `absolute bottom-24 left-6` (anchored to the `ChatArea` column, not the input).
- Member popover lists `filteredMembers` (derived from `teamMembersResolved` + `mentionSearch`).
- Task popover lists `allTasks` filtered by `taskMentionSearch`.

**Attachments**

- Hidden `<input type="file" multiple />` + `handleAttachmentPick` appends to `pendingFiles`.
- Chip list UI + remove buttons.
- `attachmentError` string surfaced above the form.
- Submit path: `handleSubmit` → `sendMessage(text, undefined, files)` then clears `input` + `pendingFiles` + `showMentions`.

**“Create and attach card”**

- Separate button gated by `canWriteTasks`, `onOpenCreateTaskForChat`, `pendingFiles.length`, `sendingAttachments`, `canPostInComposer`.
- `handleComposeChatCard` duplicates bubble resolution logic (thread parent vs active bubble vs All Bubbles default write bubble) and calls `onOpenCreateTaskForChat` with `onTaskCreated` that posts via `sendMessage` with `attachedTaskId`.

**Permissions / gating**

- `canPostMessages`, `canPostInComposer`, `sendingAttachments` drive disabled states.
- Submit disabled when `!input.trim()` (files-only send is **not** supported on the main composer today).

### `ThreadPanel.tsx` (thread reply composer)

- Local `threadInput`, `pendingFiles`, hidden file input, chip list, simple `<form onSubmit>` calling `onSendMessage(text, files)`.
- **No** @ mention detection, **no** `/` task picker, **no** “create card” button, **no** `attachmentError` display, **different** sizing (`text-sm`, smaller padding, smaller icons).

---

## 1. Prop boundaries (`RichMessageComposerProps`)

### 1.1 Draft TypeScript interface

Design goals:

- Composer is **UI + local interaction**; parent keeps **authorization context** and **send orchestration** (`sendMessage` stays in `ChatArea` for now).
- Avoid prop explosion by grouping **optional capabilities** behind nested config objects and **slots**.

```ts
import type { ReactNode } from 'react';

export type RichMessageComposerMentionMember = {
  id: string;
  name: string;
  email?: string;
  /** Optional: used only by popover UI */
  avatarLetter?: string;
};

export type RichMessageComposerSlashTask = {
  id: string;
  title: string;
  status: string;
  /** Used for iconography in the picker (maps to existing chat picker icons) */
  type: 'task' | 'request' | 'idea';
};

export type RichMessageComposerMentionConfig = {
  /** Full directory used for filtering; composer applies substring filter internally OR parent can pass pre-filtered via `getMentionCandidates`. */
  members: RichMessageComposerMentionMember[];
  /** Optional override if parent wants server-driven filtering later */
  getMentionCandidates?: (query: string) => RichMessageComposerMentionMember[];
};

export type RichMessageComposerSlashConfig = {
  tasks: RichMessageComposerSlashTask[];
  getSlashCandidates?: (query: string) => RichMessageComposerSlashTask[];
};

export type RichMessageComposerFeatures = {
  /** default true in rail; false in thread v1 if we want parity later */
  enableAtMentions?: boolean;
  /** default true in rail */
  enableSlashTaskLinks?: boolean;
  /** rail-only today */
  enableCreateAndAttachCard?: boolean;
};

export type RichMessageComposerProps = {
  /** Controlled text is strongly preferred (matches current ChatArea + ThreadPanel). */
  value: string;
  onChange: (next: string, meta: { selectionStart: number | null }) => void;

  /** Submit intent: parent performs network IO */
  onSubmit: (payload: { text: string; files: File[] }) => void | Promise<void>;

  /** File picking */
  pendingFiles: File[];
  onPendingFilesChange: (next: File[]) => void;
  fileAccept: string;

  disabled?: boolean;
  isSending?: boolean;

  placeholder?: string;

  /** Inline error string (rail uses `attachmentError` today) */
  errorText?: string | null;
  onDismissError?: () => void;

  /** Optional actions */
  features?: RichMessageComposerFeatures;
  mention?: RichMessageComposerMentionConfig;
  slash?: RichMessageComposerSlashConfig;

  onRequestCreateAndAttachCard?: () => void;
  createCardDisabledReason?: string | null;

  /** Visual variants */
  density?: 'rail' | 'thread';

  /** Popover anchoring: today’s rail uses absolute positioning against the whole chat column */
  popoverStrategy?: 'inputAnchored' | 'containerAnchored';
  popoverContainerRef?: React.RefObject<HTMLElement | null>;

  /** Optional: override popover rendering entirely (keeps core composer thin) */
  renderMentionPopover?: (props: {
    open: boolean;
    query: string;
    highlightedIndex: number;
    members: RichMessageComposerMentionMember[];
    onHighlightIndexChange: (idx: number) => void;
    onPick: (member: RichMessageComposerMentionMember) => void;
    onClose: () => void;
  }) => ReactNode;

  renderSlashPopover?: (props: {
    open: boolean;
    query: string;
    highlightedIndex: number;
    tasks: RichMessageComposerSlashTask[];
    onHighlightIndexChange: (idx: number) => void;
    onPick: (task: RichMessageComposerSlashTask) => void;
    onClose: () => void;
  }) => ReactNode;

  /** Footer hint text under the composer */
  footerHint?: ReactNode;

  className?: string;
};
```

### 1.2 Controlled vs uncontrolled text

**Decision: controlled (`value` + `onChange`)** for v1.

Reasons:

- `ChatArea` already owns `input` and synchronously derives mention/slash UI from it.
- `handleComposeChatCard` depends on reading the latest text (`latestInputRef`); controlled state can keep a ref **inside** the composer (`useEffect` mirroring `value`) so the parent does not need a parallel `latestInputRef` unless we want it for other reasons.

**Optional later:** add `defaultValue` mode only if we need a mount-and-forget embed (not required for rail/thread parity).

### 1.3 Passing mention/slash configuration without bloating props

Use a **two-layer API**:

1. **Data config objects** (`mention`, `slash`) carry arrays + optional `get*Candidates` hooks.
2. **Render overrides** (`renderMentionPopover`, `renderSlashPopover`) let us preserve today’s bespoke animated UI without forcing every styling concern into props.

**Highlight indices** (`mentionIndex`, `taskMentionIndex`) should live **inside** the composer implementation details by default (not props), because they are purely local UI state.

If we need headless testing or unusual UX, expose optional controlled indices:

- `mentionUi?: { open: boolean; onOpenChange; highlightedIndex; onHighlightedIndexChange }` (only if necessary; default hidden).

---

## 2. State ownership (parent vs child)

### 2.1 `handleInputChange` + token detection

**Owner: `<RichMessageComposer />` (child)** for v1.

The detection rules are entirely local functions of `(value, selectionStart)` and do not need workspace context.

Parent responsibilities shrink to:

- Passing `mention.members` / `slash.tasks` (already loaded in `ChatArea`).
- Handling `onSubmit` and any side effects that must remain in `ChatArea` (`sendMessage`, clearing after success, etc.).

### 2.2 `handleKeyDown` (Escape / Enter / arrows)

**Owner: child**, co-located with the input, because it must interleave with:

- popover navigation,
- preventing default Enter while selecting,
- preserving normal Enter behavior when popovers are closed (today: native form submit on Enter).

**Parent retains:**

- `onSubmit` implementation and “can submit?” policy (e.g. `canPostMessages`, `canPostInComposer`, `sendingAttachments` passed down as `disabled` / `isSending`).

**Important parity note:** Today the hint mentions “Shift+Return for newline” but the input is `type="text"` (no multiline). The extraction should **not** accidentally change that unless we explicitly migrate to `<textarea>` in a later step.

### 2.3 Insertion helpers (`insertMention`, `insertTaskMention`)

**Owner: child** (they only manipulate `value` + caret).

Parent should not need to know cursor math.

### 2.4 Pending file queue (`pendingFiles`)

**Two viable approaches; pick one explicitly during implementation:**

**Option A (recommended for Step 2 parity): parent-owned (current behavior)**

- Pros: `handleComposeChatCard` already inspects `pendingFiles.length`; `sendMessage` reads the same queue; minimal behavioral risk.
- Cons: composer is less “fully self-contained”.

**Option B: child-owned files + parent reads via callback**

- Pros: composer is more self-contained.
- Cons: requires threading “pendingFiles empty?” rules into `onRequestCreateAndAttachCard` via composer state or an `onPendingFilesChange` subscription (more moving parts).

**Plan default:** **Option A** for the first extraction PR, then consider Option B once `sendMessage` is lifted into a hook.

### 2.5 Popover placement state

**Owner: child**, but must accept `popoverContainerRef` / `popoverStrategy` so we can reproduce:

- current `absolute bottom-24 left-6` behavior (container anchored), and later
- tighter anchoring to the input (modal-safe).

### 2.6 `attachmentError` / `setAttachmentError`

**Owner: parent** (`ChatArea`), because errors are produced by `sendMessage` and attachment validation outside the composer today.

Composer receives `errorText` + optional dismiss.

---

## 3. Execution roadmap (safe extraction sequence)

### Phase A — Extract UI shell with no behavior changes

1. Create `src/components/chat/RichMessageComposer.tsx`.
2. Move **only JSX** for:
   - hidden file input,
   - error text,
   - pending file chips,
   - action buttons (attach / optional create card),
   - text field + submit,
   - footer hint,
     into the new component.
3. Keep handler bodies in `ChatArea` initially by passing them as props (`value`, `onChange`, `onKeyDown`, etc.) — even if temporarily verbose — to prove zero behavior drift.

### Phase B — Move local interaction logic into the composer

1. Move `handleInputChange`, `insertMention`, `insertTaskMention`, popover open state, highlight indices, and `onKeyDown` logic into the composer.
2. Move `lastTaskMentionSlashIndex` into a small util (e.g. `src/lib/chat-composer-tokens.ts`) if we want it testable.
3. Replace duplicated `latestInputRef` pattern with an internal composer ref (still calling `onChange` upward).

### Phase C — Popovers: co-locate or slot

1. Default implementation: move the two popover blocks into composer output (still supports `containerAnchored` positioning).
2. Optional: allow `renderMentionPopover` / `renderSlashPopover` to preserve `motion/react` styling without importing heavy UI into core logic.

### Phase D — Unify `ThreadPanel` composer

1. Replace thread footer form with `<RichMessageComposer density="thread" features={{ enableAtMentions:false, enableSlashTaskLinks:false, enableCreateAndAttachCard:false }} />`.
2. Map `onSubmit` → existing `onSendMessage(text, files)` contract.
3. Decide product intent:
   - **v1 parity-minimal:** thread composer stays text+files only (but shares component).
   - **v1 parity-full:** enable mentions/slash in thread (requires passing `mention` + `slash` data into `ThreadPanel` props from `ChatArea`).

### Phase E — Cleanup / consolidation

1. Remove now-dead state from `ChatArea` once composer owns it.
2. Expand `tsconfig.chat.json` include list if new files land outside current globs.
3. Follow-up (separate PR): consider `textarea` + real newline behavior, and portal-based popovers for TaskModal embedding.

---

## 4. Risk register (explicitly tracked)

- **Popover anchoring:** current absolute positioning is not modal-safe; extraction should make strategy explicit before embedding composer outside the rail.
- **`mentionIndex` edge cases:** align keyboard selection behavior with empty lists and `-1` defaults while preserving current UX.
- **Thread vs rail feature drift:** unify component but gate features to avoid surprising UX changes in thread replies.
- **`create card` + pending files invariant:** must remain enforced (`pendingFiles` blocks card compose).

---

## 5. “Done” criteria for Step 2

- `ChatArea.tsx` no longer contains inline composer JSX for the rail footer (only composes `<RichMessageComposer />`).
- `ThreadPanel.tsx` uses the same composer component for replies (density `thread`), with mentions/slash either intentionally off or intentionally on (documented decision).
- `npx tsc -p tsconfig.chat.json --noEmit` remains green (whole-repo `TaskModal` typing can still lag until the planned modal migration).
