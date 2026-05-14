# Phase 5 — `WorkoutCoachRail` migration

> Convert `WorkoutCoachRail` into a thin Coach + workout wrapper around
> `StandardTaskChatRail`, or delete it entirely if all of its surface-specific
> behavior can move to `WorkoutPlayer.tsx`. This is the only phase that
> touches `WorkoutPlayer.tsx`.

## Inputs

- Phases 1–4 complete; `StandardTaskChatRail` is the canonical TaskModal
  chat surface and has shipped without regressions.
- Decision (made in this phase) on whether `WorkoutCoachRail` becomes a
  wrapper or is deleted.

## Decision matrix (record the choice in the PR description)

| Option       | When to pick it                                                                                                                                                                      | Outcome                                                                                                                                                                                                                             |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Wrapper**  | Coach workout sentinel, exercise hashtag autocomplete, or `onApplyExecutionPatch` continue to be Coach-/workout-specific and should not move to `WorkoutPlayer.tsx`.                 | `WorkoutCoachRail.tsx` becomes a ~50-line file that mounts `StandardTaskChatRail` with `defaultAgentSlug="coach"` and `composerOverrides={{ enableExerciseHashMentions: true, ... }}`, plus a `useEffect` for the workout sentinel. |
| **Deletion** | Every workout-/Coach-specific behavior either moves to `WorkoutPlayer.tsx` (sentinel `useEffect`, execution-patch listener) or to `composerOverrides` passed by `WorkoutPlayer.tsx`. | `WorkoutCoachRail.tsx` is removed; `WorkoutPlayer.tsx` mounts `StandardTaskChatRail` directly.                                                                                                                                      |

If unsure, pick **Wrapper**. It is reversible to deletion in a later cleanup;
deletion is not reversible without rebuilding the component.

## Deliverables — Wrapper option

Files to **modify**:

- `src/components/chat/WorkoutCoachRail.tsx` — gut the body; reimplement as:

  ```tsx
  export function WorkoutCoachRail(props: WorkoutCoachRailProps) {
    useWorkoutSentinelEffect(props); // moved out of the rail body
    return (
      <StandardTaskChatRail
        workspaceId={props.workspaceId}
        taskId={props.taskId}
        bubbleId={props.bubbleId}
        defaultAgentSlug="coach"
        composerOverrides={{
          enableExerciseHashMentions: true,
          enableStartLiveWorkout: false,
        }}
        onCollapse={props.onCollapse}
        className={props.className}
      />
    );
  }
  ```

- `src/components/fitness/WorkoutPlayer.tsx` — no behavioral change; it
  continues to import `WorkoutCoachRail` exactly as today.

Files to **create**:

- `src/components/fitness/useWorkoutSentinelEffect.ts` — extracts the
  Coach workout-open sentinel from the current `WorkoutCoachRail.tsx` so the
  rail body stays presentation-only.

## Deliverables — Deletion option

Files to **delete**:

- `src/components/chat/WorkoutCoachRail.tsx` and its tests.

Files to **modify**:

- `src/components/fitness/WorkoutPlayer.tsx` — replace the `WorkoutCoachRail`
  mount with `<StandardTaskChatRail defaultAgentSlug="coach" composerOverrides={...}/>`.
  Move the workout sentinel into a `useEffect` co-located with
  `WorkoutPlayer`.
- Move `onApplyExecutionPatch` consumption to a `WorkoutPlayer`-side listener
  (it observes new Coach replies via the same `useMessageThread` semantics
  the rail already uses internally — Phase 0 must confirm this is feasible
  before deletion is chosen).

## Tests

For both options:

1. Workout split pane renders the rail at the same width as today; no layout
   shift on open.
2. Sending a message from the workout pane produces a row with
   `metadata.default_agent_slug === 'coach'`.
3. Coach replies render with the existing `ChatMessageRow` styling and any
   workout cards continue to render via `RichMessageComposer`'s existing
   pipeline.
4. The workout sentinel auto-post still fires once per workout open and is
   not visible in the transcript.
5. `onApplyExecutionPatch` (or its wrapper-side replacement) still fires when
   Coach returns a patch.

## Acceptance criteria

- [ ] Decision (Wrapper vs Deletion) recorded in the PR description.
- [ ] All workout-specific behavior present today is preserved.
- [ ] No regression in Coach reply latency or in workout sentinel idempotency.
- [ ] No DB / Edge Function changes.

## Risk + rollback

`WorkoutPlayer` is a high-traffic surface for Coach. Rollback = `git revert`
of this PR. There is no feature flag for this phase because the wrapper
option is internally a no-op for callers; if the rail behaves differently
than the legacy implementation, that is a Phase 1 bug, not a Phase 5 bug,
and should be fixed in the rail.
