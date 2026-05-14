# Phase 4 — Deprecate `TaskModalCommentsPanel`

> Once Phase 2/3 have soaked with the flag fully on for at least one calendar
> week with no regressions, remove the legacy panel and the integration flag.

## Inputs

- `NEXT_PUBLIC_STANDARD_TASK_CHAT_RAIL=1` has been the default in production
  for **≥ 7 days**.
- No open issues tagged `standard-task-chat-rail` regressions.
- Phase 0 §2 dispositions still match what the adapter actually does. (If
  product flipped any "drop" to "port" during soak, that work must land
  before this phase.)

## Deliverables

Files to **delete**:

- `src/components/modals/task-modal/TaskModalCommentsPanel.tsx`
- Any test file that exclusively covers `TaskModalCommentsPanel`. Tests that
  cover the imperative-handle contract should be migrated to the adapter
  instead of deleted.

Files to **modify**:

- `src/components/modals/TaskModal.tsx` — remove the flag branch; both
  mount points unconditionally render `TaskModalChatRailAdapter`.
- `src/lib/feature-flags/standardTaskChatRail.ts` — delete the helper.
- `.env.example` — remove the `NEXT_PUBLIC_STANDARD_TASK_CHAT_RAIL` line.
- Any docs that still reference `TaskModalCommentsPanel`. Run
  `rg "TaskModalCommentsPanel" docs src` and update every match.

Files **not** touched:

- `StandardTaskChatRail.tsx`, `TaskModalChatRailAdapter.tsx`,
  `defaultSlugForItemType.ts`.
- `WorkoutCoachRail.tsx` (Phase 5).
- `agent-dispatch` and DB.

## Tests

1. `rg "TaskModalCommentsPanel" src` returns no results.
2. `rg "NEXT_PUBLIC_STANDARD_TASK_CHAT_RAIL"` returns no results outside
   `docs/refactor/standard-task-chat-rail/`.
3. Existing TaskModal integration tests (deep-link open, exitThread,
   mark-read) pass against the unconditional adapter.

## Acceptance criteria

- [ ] Legacy panel deleted.
- [ ] Feature flag and helper deleted.
- [ ] All documentation updated.
- [ ] No new test debt introduced; tests previously gated on the flag are
      now run unconditionally.

## Risk + rollback

This is the only destructive phase. Rollback is `git revert` of this PR.
The previous flag default (`1`) is preserved if revert is needed, so
behavior on revert continues to use `StandardTaskChatRail`.

Do **not** merge this phase unless you are willing to revert the entire
PR — there is no flag-flip rollback after this point.
