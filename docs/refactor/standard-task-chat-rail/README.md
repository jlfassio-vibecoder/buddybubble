# Standard Task Chat Rail — epic charter

**Goal.** One reusable chat rail (`StandardTaskChatRail`) that powers every
task-scoped chat surface in the app — `TaskModal` first, then `WorkoutPlayer`,
then any future drawer or split pane — so chat presentation, agent routing, and
realtime wiring live in **one** component instead of being copy-pasted with
silent drift between surfaces.

**Centerpiece pairing.** The polymorphic `TaskModal` and this standard rail
become the two architectural centerpieces of the app. The modal owns "what is
this card?"; the rail owns "what is the conversation about this card?" Together
they keep every item type (Card, Event, Experience, Idea, Memory, Workout, …)
on the same chat substrate without a special component per type.

**Surgical-edit rule.** This refactor is staged so the existing chat panels
(`TaskModalCommentsPanel`, `WorkoutCoachRail`) keep running unchanged until the
new rail is built, soaked behind a feature flag, and proven equivalent. No
existing component is deleted before its replacement is live and verified.

---

## How this folder is organized

Each phase is a standalone Markdown file you can paste into Plan mode as a
single prompt. Phases are sequenced and call out their inputs and exit
criteria so a planning agent can confirm prerequisites before starting work.

| #   | File                                                                                                 | Purpose                                                                                                       |
| --- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 0   | [`phase-0-discovery-and-decisions.md`](./phase-0-discovery-and-decisions.md)                         | Inventory existing surfaces; freeze the prop API; lock the `item_type → agent slug` mapping. No code changes. |
| 1   | [`phase-1-build-standalone-rail.md`](./phase-1-build-standalone-rail.md)                             | Create `StandardTaskChatRail.tsx` with no callers; unit tests + sandbox route only.                           |
| 2   | [`phase-2-task-modal-integration.md`](./phase-2-task-modal-integration.md)                           | Swap the two `TaskModal` chat mount points behind a feature flag; port deep-link / mark-read features.        |
| 3   | [`phase-3-dynamic-agent-binding.md`](./phase-3-dynamic-agent-binding.md)                             | Wire `item_type → defaultAgentSlug`; audit `bubble_agent_bindings`; verify `'none'` is fully silent.          |
| 3.5 | [`phase-3.5-layout-stabilization.md`](./phase-3.5-layout-stabilization.md)                           | Stop the rail from collapsing during AI generation; opt-in desktop split-pane (rail + details side-by-side).  |
| 4   | [`phase-4-deprecate-task-modal-comments-panel.md`](./phase-4-deprecate-task-modal-comments-panel.md) | Remove `TaskModalCommentsPanel` and the integration flag once Phase 2/3 have soaked.                          |
| 5   | [`phase-5-workout-coach-rail-migration.md`](./phase-5-workout-coach-rail-migration.md)               | Convert `WorkoutCoachRail` into a thin Coach/workout wrapper over the standard rail (or delete it).           |
| 6   | [`phase-6-chat-area-and-future-surfaces.md`](./phase-6-chat-area-and-future-surfaces.md)             | Optional: extend the rail to `ChatArea` and any new drawer surfaces. Out of scope for the initial epic.       |

---

## Principles (non-negotiable)

1. **Agent slugs are dynamic, not enum-typed.** The rail accepts
   `defaultAgentSlug?: string | null`. There is no enum of agents in the
   component. The canonical source of truth is `agent_definitions.slug`, joined
   to bubbles via `bubble_agent_bindings`.
2. **`null` / omitted slug = human-only chat.** No `AgentTypingIndicator`, no
   `useAgentResponseWait` failsafe, no agent toggle. The composer renders the
   same plain chat affordances as a person-to-person message thread.
3. **No silent system messages from the standard rail.** The Coach
   workout-player sentinel and the Buddy onboarding sentinel are
   surface-specific handshakes. They live in wrappers (or in the surface's
   own `useEffect`), never in the standard rail.
4. **No domain-specific data on the props.** `class_instance_id`, `sessionId`,
   `workoutData`, `onApplyExecutionPatch`, exercise-dictionary autocomplete,
   `proposedWrite` — none of these may appear in `StandardTaskChatRailProps`.
   Wrappers attach them.
5. **Layout is `flex h-full min-h-0 min-w-0 flex-col`, period.** The rail
   must fill whatever flex parent it lands in. It does not take a width prop;
   parents constrain width. It does not portal its composer; it owns its own
   footer.
6. **Realtime, history, and inserts go through `useMessageThread` only.** The
   rail does not open its own Supabase channel, it does not write to
   `messages` directly, and it does not bypass `MessageThreadFilter`. The
   filter is hardcoded to `scope: 'task'`.
7. **No new agent code paths.** This epic does not modify `agent-dispatch`,
   `agent_definitions`, `bubble_agent_bindings`, RLS, or any RPC. Routing
   stays exactly as it is today; the rail is presentation + send only.
8. **Feature-flag every TaskModal change until Phase 4.** Any phase that
   touches `TaskModal.tsx` lands behind `NEXT_PUBLIC_STANDARD_TASK_CHAT_RAIL`
   so a regression is one env flip away from being reverted.

---

## Non-goals

- Redesigning `RichMessageComposer`, `ChatMessageRow`, or the message data model.
- Changing `useMessageThread` semantics (channels, RLS, send pipeline).
- Touching `supabase/functions/agent-dispatch/**` or any agent RPC.
- Adding new `item_type` values, new agents, or new mention handles.
- Introducing a new design system primitive — the rail composes existing chat
  primitives only.

---

## Status table

Update this table in the same PR that lands a phase. Rows are in execution order.

| #   | Phase                                   | Status      | PR  | Owner | Notes                                                                          |
| --- | --------------------------------------- | ----------- | --- | ----- | ------------------------------------------------------------------------------ |
| 0   | Discovery & decisions                   | complete    |     |       |                                                                                |
| 1   | Build standalone rail                   | in review   |     |       |                                                                                |
| 2   | TaskModal integration (flagged)         | in review   |     |       |                                                                                |
| 3   | Dynamic agent binding                   | complete    |     |       | Manual smoke verified end-to-end Coach routing per `item_type`.                |
| 3.5 | Layout stabilization (collapse + split) | complete    |     |       | Split-pane + collapse fix landed behind `NEXT_PUBLIC_STANDARD_TASK_CHAT_RAIL`. |
| 4   | Deprecate `TaskModalCommentsPanel`      | not started |     |       |                                                                                |
| 5   | `WorkoutCoachRail` migration            | not started |     |       |                                                                                |
| 6   | `ChatArea` + future surfaces (optional) | not started |     |       |                                                                                |

---

## Rollback policy

- **Phases 1, 5, 6** are additive or live behind their own surface; rollback is
  the PR revert.
- **Phase 2** ships behind `NEXT_PUBLIC_STANDARD_TASK_CHAT_RAIL`. Rollback is
  setting the flag to `false` and redeploying — no code revert required.
- **Phase 3** is additive in the resolver helper; if the
  `item_type → defaultAgentSlug` map regresses behavior, fall back to passing
  `null` from `TaskModal` until the map is fixed.
- **Phase 4** is the only destructive phase. It cannot land until Phase 2/3
  have soaked for a full week with no regressions reported.

---

## Cross-references

- Working reference implementation: `src/components/chat/WorkoutCoachRail.tsx`
- Current TaskModal chat panel (to be replaced): `src/components/modals/task-modal/TaskModalCommentsPanel.tsx`
- TaskModal tab state + mount points: `src/components/modals/TaskModal.tsx`
- Tab union type: `src/types/open-task-options.ts`
- Hook the rail wraps: `src/hooks/useMessageThread.ts`
- Agent waiting hook: `src/hooks/useAgentResponseWait.ts`
- Server-side default-slug contract: `supabase/functions/_shared/dispatch/routing.ts` (`parseRootDefaultAgentSlug`)
- Agent webhook safety rule: `.cursor/rules/supabase-agent-dispatch-webhook-secret.mdc`
