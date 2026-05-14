# Phase 0 — Discovery and locked decisions

> Inventory what already exists, then **freeze** the contract and policy
> decisions the next phases will execute against. **No application code
> changes** in this phase — only this document and the epic README status row.

## Inputs

- Working reference: `src/components/chat/WorkoutCoachRail.tsx`
- Current TaskModal chat panel: `src/components/modals/task-modal/TaskModalCommentsPanel.tsx`
- TaskModal mount points: `src/components/modals/TaskModal.tsx`
  (two branches: `viewMode === 'comments-only'` and `viewMode === 'full' && tab === 'comments'`)
- Tab union: `src/types/open-task-options.ts`
- Realtime + send hook: `src/hooks/useMessageThread.ts`
- Default-slug contract on the server: `supabase/functions/_shared/dispatch/routing.ts`

## Deliverables

This file (when committed) is the deliverable. After the **Decisions** section
is filled in and reviewed, Phase 1 may begin.

---

## 1. Surface inventory

| Surface                                      | File                                                                                                                           | Component used today      | Notes                                                                                                                      |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Workout player split pane                    | [`src/components/fitness/WorkoutPlayer.tsx`](../../../src/components/fitness/WorkoutPlayer.tsx) (`WorkoutCoachRail` at ~1162)  | `WorkoutCoachRail`        | Coach workout sentinel + execution-patch loop are owned by this surface + rail, not TaskModal.                             |
| TaskModal — `comments-only` + unified scroll | [`src/components/modals/TaskModal.tsx`](../../../src/components/modals/TaskModal.tsx) (`TaskModalCommentsPanel` at ~1256–1276) | `TaskModalCommentsPanel`  | `unifiedScrollLayout` + `composerPortalHost={composerPortalHost}`; portal host div at ~1280–1282; tab bar follows.         |
| TaskModal — `full` + `tab === 'comments'`    | [`src/components/modals/TaskModal.tsx`](../../../src/components/modals/TaskModal.tsx) (`TaskModalCommentsPanel` at ~1554–1582) | `TaskModalCommentsPanel`  | Optional `onMessagesScroll` / `showInlineGenerateWorkout` when workout split pane; no `composerPortalHost` in this branch. |
| Bubble / dashboard chat                      | [`src/components/chat/ChatArea.tsx`](../../../src/components/chat/ChatArea.tsx)                                                | `ChatArea` (own composer) | Out of scope until Phase 6.                                                                                                |

**Additional references (not separate chat surfaces):** `TaskModalChatCardWorkoutActions` type is imported from `TaskModalCommentsPanel.tsx` by [`ChatMessageRow.tsx`](../../../src/components/chat/ChatMessageRow.tsx), [`ChatFeedTaskCard.tsx`](../../../src/components/chat/ChatFeedTaskCard.tsx), and [`CoachDraftCard.tsx`](../../../src/components/chat/CoachDraftCard.tsx) — those stay typed in one module until Phase 4 moves the type.

**Buddy onboarding sentinel:** the same `BUDDY_ONBOARDING_SYSTEM_EVENT` string and “silent insert + filter” pattern exists in [`ChatArea.tsx`](../../../src/components/chat/ChatArea.tsx) (see comment at ~60–66) and [`TaskModalCommentsPanel.tsx`](../../../src/components/modals/task-modal/TaskModalCommentsPanel.tsx) (lines 38–44, 316–323, 440–498). Keep values in sync with Edge dispatch expectations.

---

## 2. `TaskModalCommentsPanel` features — disposition

Legend: **port** = move into `TaskModalChatRailAdapter` or `StandardTaskChatRail` as appropriate; **drop** = not carried into the generic rail; **opt-in** = optional adapter props only, never baked into `StandardTaskChatRailProps` unless explicitly listed in §4.

| #   | Feature                                                                                                     | Where (evidence)                                                                      | Disposition | Notes                                                                                                                                                                                                                                                                     |
| --- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Default agent slug `'coach'` (`TASK_COMMENTS_DEFAULT_AGENT_SLUG`)                                           | `TaskModalCommentsPanel.tsx` ~52, passed to `resolveTargetAgent` ~600–601, ~629, ~709 | **opt-in**  | Today hardcoded to `coach`. Phase 3 replaces with `defaultSlugForItemType(task.item_type)` in the adapter; the rail receives `defaultAgentSlug` as a prop only.                                                                                                           |
| 2   | Buddy onboarding sentinel auto-post on empty thread                                                         | `TaskModalCommentsPanel.tsx` ~440–498                                                 | **port**    | **Not** inside `StandardTaskChatRail` (README principle 3). Re-home to `TaskModalChatRailAdapter` `useEffect` + same `messages.length` / `buddyTriggerFiredRef` guards.                                                                                                   |
| 3   | Hide sentinel from transcript                                                                               | `TaskModalCommentsPanel.tsx` ~316–323                                                 | **port**    | Filter `BUDDY_ONBOARDING_SYSTEM_EVENT` (or metadata-driven silent sentinel if we add one) in adapter or rail transcript layer.                                                                                                                                            |
| 4   | `initialCommentThreadMessageId` deep-link                                                                   | `TaskModalCommentsPanel.tsx` ~416–431                                                 | **port**    | Adapter owns `deepLinkConsumedRef` + `setActiveThreadParent` equivalent; rail may expose thread state later or adapter wraps rail + thread UI.                                                                                                                            |
| 5   | `commentsPanelRef.exitThread()`                                                                             | `TaskModalCommentsPanel.tsx` ~160–162                                                 | **port**    | Adapter `useImperativeHandle` delegates to thread state held in adapter (same contract as today).                                                                                                                                                                         |
| 6   | `onMarkedRead` (debounced `user_task_views`)                                                                | `TaskModalCommentsPanel.tsx` ~178–212                                                 | **port**    | Adapter-only debounced upsert; rail stays unaware of Kanban unread.                                                                                                                                                                                                       |
| 7   | `onCoachDraftFinalizeSuccess`                                                                               | `TaskModalCommentsPanel.tsx` ~789–790, ~837–838, ~854; passed from `TaskModal.tsx`    | **port**    | Forward via §4 `chatRowExtras` from `TaskModalChatRailAdapter` into `ChatMessageRow`.                                                                                                                                                                                     |
| 8   | `composerPortalHost` + `unifiedScrollLayout`                                                                | Props ~94–98; `createPortal` ~731–736; `TaskModal.tsx` ~1270–1282                     | **port**    | Unified comments-only layout depends on composer living **above** the tab bar. Conflicts with README “rail owns footer” principle — **open follow-up:** either amend epic principle 5 for TaskModal-only portal escape hatch or reproduce layout with CSS without portal. |
| 9   | `chatCardWorkoutActions`                                                                                    | `TaskModalCommentsPanel.tsx` ~789–790                                                 | **opt-in**  | Adapter passes via §4 `chatRowExtras` into `ChatMessageRow` (not a separate top-level prop).                                                                                                                                                                              |
| 10  | `showInlineGenerateWorkout`                                                                                 | `TaskModalCommentsPanel.tsx` ~562–582; `TaskModal.tsx` ~1568–1572                     | **opt-in**  | Inline Generate row is TaskModal / workout-context UI; adapter renders it above/below rail, not inside generic rail.                                                                                                                                                      |
| 11  | Mobile / scroll coordination (`onMessagesScroll`, `scrollContainerRef`, `useLayoutEffect` scroll-to-bottom) | `TaskModalCommentsPanel.tsx` ~516–542, ~774, ~825; `TaskModal.tsx` ~1575–1578         | **port**    | Adapter passes scroll refs / handlers; rail keeps `min-h-0` flex column internals.                                                                                                                                                                                        |

**Phase 2 execution note (2026-05-14):** the flag-on TaskModal path is fully
specified in [`phase-2-task-modal-integration.md`](./phase-2-task-modal-integration.md).
It supersedes ambiguous wording above for: deep-link (scroll-only, no thread
pane), `exitThread` (imperative no-op), `composerPortalHost` / `unifiedScrollLayout`
(dropped on flag-on), `chatCardWorkoutActions` / `onCoachDraftFinalizeSuccess`
(via §4 `chatRowExtras`), and scroll coordination (dropped on flag-on; rail
internal scroll).

---

## 3. `item_type → defaultAgentSlug` mapping (Phase 3 executes)

Decide and freeze the table below. `null` = omit `default_agent_slug` on insert (human-only default for routing).

### 3a. Schema vs RPC vs live data

**`tasks.item_type` CHECK (latest migration)** — [`20260724120000_tasks_item_type_class.sql`](../../../supabase/migrations/20260724120000_tasks_item_type_class.sql):

`task`, `event`, `experience`, `idea`, `memory`, `workout`, `workout_log`, `program`, `class`

**`agent_create_card_and_reply` `p_task_type` whitelist** — [`20260729120000_agent_rpcs_persist_execution_patch.sql`](../../../supabase/migrations/20260729120000_agent_rpcs_persist_execution_patch.sql) lines 177–186:

Same list **except `class` is missing** from the RPC whitelist.

**Open follow-up:** if Coach (or any agent) ever creates cards with `item_type = 'class'` via `agent_create_card_and_reply`, extend the RPC whitelist in a migration **before** relying on that path.

**Live `tasks` snapshot (non-archived)** — query run at Phase 0 execution via Supabase MCP `execute_sql`:

```sql
select item_type, count(*)::int as task_rows, count(distinct bubble_id)::int as bubble_count
from public.tasks
where archived_at is null
group by item_type
order by item_type;
```

**Result:** `event` (4 tasks, 4 bubbles), `experience` (4, 3), `program` (2, 1), `task` (81, 34), `workout` (91, 29), `workout_log` (9, 2). **No live rows** for `idea`, `memory`, or `class` in this snapshot (they remain schema-allowed).

> **`request` is not a `tasks.item_type`.** It appears only as `RichMessageComposerSlashTask.type` (`'task' \| 'request' \| 'idea'`). Do not add a `request` row to this mapping table.

### 3b. Live agent catalog + bindings

**Query A — active agents**

```sql
select slug, mention_handle, is_active, response_timeout_ms
from public.agent_definitions
order by slug;
```

**Result:**

| slug      | mention_handle | is_active | response_timeout_ms |
| --------- | -------------- | --------- | ------------------- |
| buddy     | Buddy          | true      | 30000               |
| coach     | coach          | true      | 30000               |
| organizer | organizer      | true      | 30000               |

**Query B — bindings per slug** (`bubble_agent_bindings` joins `agent_definitions`)

```sql
select ad.slug, count(*)::int as binding_rows, count(distinct bab.bubble_id)::int as bubble_count
from public.bubble_agent_bindings bab
join public.agent_definitions ad on ad.id = bab.agent_definition_id
group by ad.slug
order by ad.slug;
```

**Result:**

| slug      | binding_rows | bubble_count |
| --------- | -----------: | -----------: |
| coach     |           66 |           66 |
| organizer |           47 |           47 |

**Buddy:** `buddy` row exists in `agent_definitions` but **zero** rows in `bubble_agent_bindings` in this database. Buddy onboarding still works via the **sentinel insert** path + mention routing — do **not** set `defaultAgentSlug = 'buddy'` from this table until bindings exist (otherwise `default_agent_slug` metadata may not match bubble-bound strategies).

**Query C — orphan bindings** (FK integrity check)

```sql
select bab.id
from public.bubble_agent_bindings bab
left join public.agent_definitions ad on ad.id = bab.agent_definition_id
where ad.id is null
limit 10;
```

**Result:** `[]` (no orphans).

**Query D — coverage matrix** (distinct `(bubble_id, item_type)` from tasks × each active agent slug)

```sql
with bt as (
  select distinct bubble_id, item_type
  from public.tasks
  where archived_at is null
),
active as (
  select id, slug from public.agent_definitions where is_active = true
)
select t.item_type,
       a.slug,
       count(distinct t.bubble_id)::int as bubbles_with_type,
       count(distinct case when bab.bubble_id is not null then t.bubble_id end)::int as bubbles_with_binding
from bt t
cross join active a
left join public.bubble_agent_bindings bab
  on bab.bubble_id = t.bubble_id
  and bab.agent_definition_id = a.id
group by t.item_type, a.slug
order by t.item_type, a.slug;
```

**Result (abridged):** for **every** `(item_type, slug)` pair in the live snapshot, `bubbles_with_binding` for `buddy` is **0**. For `coach` / `organizer`, non-zero counts match bubbles that have tasks of that type (e.g. `task`: 34 bubbles, 32 with coach binding, 25 with organizer binding; `workout`: 29 bubbles, 27 with coach, 11 with organizer).

**Gaps to track in Phase 3:** 2 `task`-carrying bubbles lack coach bindings; 2 `workout`-carrying bubbles lack coach bindings. Users in those bubbles will still get `metadata.default_agent_slug = 'coach'` if we follow the parity mapping below — server routing may skip with `no_strategy_matched` until bindings are fixed.

### 3c. Frozen mapping (parity with today’s `TASK_COMMENTS_DEFAULT_AGENT_SLUG`)

| `item_type`             | `defaultAgentSlug` | Justification                                                                                                                              |
| ----------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `task`                  | `coach`            | Matches current TaskModal comments default; 32/34 live bubbles with coach binding (2 gaps — fix bindings or accept degraded routing).      |
| `event`                 | `coach`            | Parity default; all 4 live bubbles have coach + organizer — **product follow-up:** consider switching to `organizer` for event-only cards. |
| `experience`            | `coach`            | Parity; 3/3 live bubbles have coach + organizer.                                                                                           |
| `idea`                  | `coach`            | Schema-allowed; zero live tasks in audit snapshot — keeps parity when data appears.                                                        |
| `memory`                | `coach`            | Schema-allowed; zero live tasks in audit snapshot.                                                                                         |
| `workout`               | `coach`            | Primary Coach surface; 27/29 live bubbles with coach binding (2 gaps).                                                                     |
| `workout_log`           | `coach`            | Fitness log context; 2/2 live bubbles have coach binding.                                                                                  |
| `program`               | `coach`            | Program cards; 1/1 live bubble has coach binding.                                                                                          |
| `class`                 | `null`             | Schema-allowed; **zero** live tasks in audit snapshot — default human-only until product defines an agent + bindings.                      |
| _(any other / unknown)_ | `null`             | Default-deny.                                                                                                                              |

---

## 4. Frozen prop API for `StandardTaskChatRail`

The rail implementation must match **exactly** this shape. Any change requires a
PR that updates this section first.

```ts
import type { ComponentProps } from 'react';
import type { ChatMessageRow } from '@/components/chat/ChatMessageRow';
import type { RichMessageComposer } from '@/components/chat/RichMessageComposer';
import type { MessageRowWithEmbeddedTask } from '@/types/database';

export type StandardTaskChatRailProps = {
  /** Workspace context for member loading + agent binding lookup. */
  workspaceId: string;

  /** `tasks.id`. The rail hardcodes `useMessageThread` to `scope: 'task'`. */
  taskId: string;

  /**
   * Resolved bubble for `taskId`. Optional only because some callers may not
   * have it yet, but providing it avoids an extra `tasks.bubble_id` fetch and
   * lets `bubble_agent_bindings` load before the first send.
   */
  bubbleId?: string;

  /**
   * Required by `useMessageThread`; pass the parent's existing write-permission
   * flag (e.g. TaskModal's `canWrite`).
   */
  canPostMessages: boolean;

  /**
   * Sets `messages.metadata.default_agent_slug` on root inserts. The server
   * resolver (`parseRootDefaultAgentSlug`) reads this value verbatim.
   *
   * `null` / omitted = human-only chat: no agent typing indicator, no failsafe
   * timer, no agent affordances in the composer.
   */
  defaultAgentSlug?: string | null;

  /**
   * Optional overrides for [`RichMessageComposer`](../../../src/components/chat/RichMessageComposer.tsx).
   * Composer feature flags live under the `features` prop (`RichMessageComposerFeatures`:
   * `enableAtMentions`, `enableSlashTaskLinks`, `enableExerciseHashMentions`,
   * `enableCreateAndAttachCard`, `enableStartLiveWorkout`) — not as top-level props.
   *
   * Conservative rail defaults (pass via `composerOverrides.features` unless overridden):
   * `{ enableAtMentions: true, enableSlashTaskLinks: false, enableExerciseHashMentions: false, enableCreateAndAttachCard: false, enableStartLiveWorkout: false }`
   */
  composerOverrides?: Partial<ComponentProps<typeof RichMessageComposer>>;

  /** Optional collapse handle (parity with `WorkoutCoachRail`'s header button). */
  onCollapse?: () => void;

  className?: string;

  /**
   * Optional row filter applied **before** `rowToChatMessage` (task-scoped
   * `MessageRowWithEmbeddedTask[]`). Use to hide rows that must exist in the DB
   * (e.g. Buddy onboarding sentinel) without embedding product strings inside
   * the rail. When omitted, no filtering.
   */
  transcriptFilter?: (row: MessageRowWithEmbeddedTask) => boolean;

  /**
   * Optional passthrough props for [`ChatMessageRow`](../../../src/components/chat/ChatMessageRow.tsx).
   * Keeps TaskModal-only callbacks out of the generic rail’s top-level prop list.
   */
  chatRowExtras?: Pick<
    ComponentProps<typeof ChatMessageRow>,
    | 'onCoachDraftFinalizeSuccess'
    | 'chatCardWorkoutActions'
    | 'bubbleUpPropsFor'
    | 'onOpenAttachment'
  >;
};
```

**`useMessageThread` parity:** the hook accepts `taskBubbleIdHint?: string | null` ([`useMessageThread.ts`](../../../src/hooks/useMessageThread.ts) ~85, ~145). Callers should pass the same value they pass today as `taskBubbleIdHint` into the rail as **`bubbleId`** (the rail forwards it internally as `taskBubbleIdHint`).

Explicitly **not** in this API: `class_instance_id`, `sessionId`,
`isMemberView`, `workoutTitle`, `workoutData`, `onApplyExecutionPatch`, any
exercise-dictionary props, any sentinel auto-post toggle, `composerPortalHost`,
`unifiedScrollLayout`. TaskModal-only row callbacks (`onCoachDraftFinalizeSuccess`,
`chatCardWorkoutActions`, `bubbleUpPropsFor`, `onOpenAttachment`) are **only**
accepted nested under `chatRowExtras`, never as duplicate top-level props.

---

## 5. Decisions (fill in, then freeze)

Phase 1 begins only after this block is **dated and signed** by a human reviewer.

```
DECISIONS LOCKED ON: 2026-05-14
REVIEWED BY: Justin Fassio

Section 2 dispositions: accepted as written in the §2 table (port / opt-in split).
Phase 2 execution updates: Buddy sentinel hide + TaskModal row callbacks are
delivered via §4 optional `transcriptFilter` and `chatRowExtras` (not as
top-level rail props). TaskModal flag-on path drops `composerPortalHost` /
`unifiedScrollLayout` (see phase-2-task-modal-integration.md — README principle 5
preserved).

Section 3 mapping: accepted as written in §3c (coach parity default; class → null;
buddy not used as defaultAgentSlug until bubble_agent_bindings exist).

Section 4 amendments (chronological):
- 2026-05-13: added `canPostMessages` (Phase 1 prerequisite).
- 2026-05-14: added `transcriptFilter` and `chatRowExtras` (Phase 2 prerequisite).

Open follow-ups:
- RPC `agent_create_card_and_reply` whitelist missing `class` vs tasks CHECK including `class`.
- Coach binding gaps: 2 task bubbles + 2 workout bubbles without coach bindings (counts from §3b Query D).
- Product: consider `organizer` as default for `event` / `experience` instead of `coach` (all audited bubbles currently have both).
```

## Acceptance criteria

- [x] §1 surface inventory verified against the current codebase.
- [x] §2 disposition column filled for every row.
- [x] §3 `item_type → slug` mapping filled and validated against
      `agent_definitions` + `bubble_agent_bindings` (live MCP audit + migration cross-check).
- [x] §4 prop API verified against `RichMessageComposer` (`features` nesting) and `useMessageThread` (`taskBubbleIdHint` → `bubbleId` caller contract).
- [x] §5 decisions block **dated and signed** by reviewer(s).
- [x] SQL audit queries and results recorded in §3b.

## Risk + rollback

This phase is doc-only. Rollback is reverting the doc PR.
