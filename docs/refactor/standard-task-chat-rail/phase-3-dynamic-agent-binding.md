# Phase 3 — Dynamic agent binding (`item_type → defaultAgentSlug`)

> Replace the temporary `defaultAgentSlug={null}` in
> `TaskModalChatRailAdapter` with the mapping locked in Phase 0 §3. Audit
> `bubble_agent_bindings` so the resolver never silently falls through.
> The rail itself is **not** modified — this is a pure adapter + audit phase.

## Inputs

- Phase 0 §3 mapping table is filled and frozen.
- Phase 2 has soaked in staging with the flag on for at least one day with no
  regressions.
- Knowledge of the server-side resolver: `parseRootDefaultAgentSlug` in
  `supabase/functions/_shared/dispatch/routing.ts`. The slug must match an
  active row in `agent_definitions` **and** a row in `bubble_agent_bindings`
  for the message's bubble (when the strategy declares
  `requireBubbleBinding: true`).

## Deliverables

Files to **create**:

1. `src/lib/agents/defaultSlugForItemType.ts` — pure function:

   ```ts
   export type ItemType = string;
   export function defaultSlugForItemType(itemType: ItemType | null | undefined): string | null;
   ```

   Implementation = a literal switch reflecting Phase 0 §3. No I/O, no
   feature flags, no fallback behavior beyond returning `null`. Default-deny.

2. `src/lib/agents/__tests__/defaultSlugForItemType.test.ts` — covers every
   row in the Phase 0 §3 table, including the `null`/unknown branch.

Files to **modify**:

- `src/components/modals/task-modal/TaskModalChatRailAdapter.tsx` — replace
  the hardcoded `null` with
  `defaultSlugForItemType(task?.item_type ?? null)`.
- `src/types/open-task-options.ts` — only if a new public type alias for
  `ItemType` is needed. Otherwise leave untouched.

Files **not** touched:

- `StandardTaskChatRail.tsx` (the rail does not know about `item_type`).
- `agent_definitions`, `bubble_agent_bindings`, RLS, RPCs.
- `supabase/functions/agent-dispatch/**` and any `_shared/dispatch/**` file.

## Pre-merge audits (must pass)

For each non-`null` mapping in Phase 0 §3:

1. `agent_definitions` contains an active row with that `slug`.
2. `bubble_agent_bindings` has a row binding that slug for at least one
   production bubble that uses the corresponding `item_type`. If the agent's
   strategy declares `requireBubbleBinding: true` (Coach today), every
   workspace that should produce a reply must have the binding.
3. The agent's `routing.excludeOnMentionOf` does not silently disable
   responses for the most common mention patterns in that surface.

Capture the audit output in this PR description as a short table — one row
per `item_type` with the SQL the auditor ran and the count returned.

## Tests

1. `defaultSlugForItemType` returns the locked value for every row in
   Phase 0 §3, and `null` for any unrecognized string.
2. The TaskModal adapter, with `task.item_type === '<type-with-slug>'`, sends
   a message whose `metadata.default_agent_slug` equals the locked slug.
3. The TaskModal adapter, with `task.item_type === '<type-with-null>'`, sends
   a message **without** `metadata.default_agent_slug` set — confirming the
   "no key" contract (not `null`-valued).
4. Switching `task.item_type` after mount (the modal is polymorphic) updates
   the value sent on the **next** message; messages already in flight retain
   the slug they were sent with.

## Acceptance criteria

- [ ] Mapping helper file exists and matches Phase 0 §3 verbatim.
- [ ] Adapter consumes the helper; no other call sites.
- [ ] All audit cells in this PR description show non-zero binding counts (or
      `null` mapping).
- [ ] No DB / Edge Function / dispatch code changed.
- [ ] CI passes with `NEXT_PUBLIC_STANDARD_TASK_CHAT_RAIL` both `0` and `1`.

## Risk + rollback

If a row in §3 misroutes a workspace's chat to the wrong agent (or to no
agent), revert the helper to return `null` for that `item_type` and
re-enable the flag immediately. Adapter behavior degrades to "human-only
chat" rather than to a wrong-agent reply.
