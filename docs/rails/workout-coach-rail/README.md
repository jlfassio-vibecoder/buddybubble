# Workout Coach Rail

`WorkoutCoachRail` is the **workout-player** chat surface: Coach (default) and optional Buddy inside the live workout UI, wired to the **same task-scoped message thread** as the rest of the app (`useMessageThread` with `scope: 'task'`), but with **workout-specific** metadata, composer behavior, and log merging that do not belong on the generic task rail.

## Why this is a separate rail

`StandardTaskChatRail` is intentionally **domain-neutral** (no `workoutData`, `sessionId`, execution patches, or workout sentinels on its public props). `WorkoutCoachRail` encodes the **WorkoutPlayer** contract: silent sentinel on open, `#` exercise tagging against the current workout plus the exercise dictionary, Coach/Buddy send modes, and applying Coach `execution_patch` payloads back into the player.

Keeping both rails means **two layouts and two prop APIs** to maintain when shared primitives (`RichMessageComposer`, `useMessageThread`, `ChatMessageRow`) change. That cost is accepted as long as the workout experience stays specialized; folding Coach into the standard rail would either leak workout-only props onto every task surface or require a thick wrapper that duplicates most of this file anyway.

## Where it mounts

| Consumer                                               | Path                                                                                            |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Workout player split pane (desktop + mobile coach tab) | [`src/components/fitness/WorkoutPlayer.tsx`](../../../src/components/fitness/WorkoutPlayer.tsx) |

There is no feature flag: if the workout player is open with chat enabled, this rail is the implementation.

## Responsibilities (high level)

1. **Thread** — `useMessageThread` with `MessageThreadFilter` `{ scope: 'task', taskId }`, `taskBubbleIdHint: bubbleId`, and workspace subject for RLS-aligned behavior.
2. **One-shot silent sentinel** — After bubble row + agents load, inserts a single system message (`Started a workout session.`) with `metadata.is_silent_sentinel`, `workout_context.source === 'workout_player'`, and rich `workoutContext` so **agent-dispatch** can open Coach with the right workout title and context (including empty exercise lists).
3. **Transcript hygiene** — Hides the sentinel from the visible transcript (metadata flag or legacy magic string) while still allowing the server handshake.
4. **Execution patches** — Scans Coach-authored rows for `metadata.execution_patch`, parses with `parseExecutionPatchFromMetadata`, and calls **`onApplyExecutionPatch`** so `WorkoutPlayer` can merge structured edits into live logs.
5. **Composer** — Coach default slug on sends (`default_agent_slug` in metadata), `enableExerciseHashMentions`, pending `exercise_mentions` finalized on send, Buddy mode prefixes `@` for routing.
6. **Telemetry** — `logAgentRoutingEvent` and `useAgentResponseWait` use surface id **`workout-coach-rail`**.

## Public props (`WorkoutCoachRailProps`)

| Prop                                             | Role                                                                                                                           |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `workspaceId`, `bubbleId`, `taskId`              | Workspace + bubble for bindings/names; **task id** scopes the message thread.                                                  |
| `canPostMessages`                                | Passed through to `useMessageThread` / composer disabled state.                                                                |
| `sessionId`, `class_instance_id`, `isMemberView` | Copied into sentinel metadata for server / analytics context.                                                                  |
| `workoutTitle`, `workoutData`                    | Title for greeting metadata; `workoutData` drives exercise names for `#` mentions and sentinel `workoutContext` normalization. |
| `onApplyExecutionPatch`                          | Required callback when a Coach message carries a valid execution patch.                                                        |
| `onCollapse`, `className`                        | Optional panel chrome (collapse aligns with player layout).                                                                    |

## Layout contract

Same flex column contract as the other rail: **`flex h-full min-h-0 min-w-0 flex-col`** inside the player’s left column; width is owned by `WorkoutPlayer` (`md:max-w-[min(38%,400px)]` etc.), not the rail.

## Relationship to other docs

- Generic task chat rail (TaskModal, flag, future surfaces): [`docs/rails/standard-task-chat-rail/README.md`](../standard-task-chat-rail/README.md).
- Historical epic / Phase 5 “migrate WorkoutCoachRail” idea: [`docs/refactor/standard-task-chat-rail/phase-5-workout-coach-rail-migration.md`](../../refactor/standard-task-chat-rail/phase-5-workout-coach-rail-migration.md) — **optional**; product may keep this rail indefinitely if the dedicated UX stays the right tradeoff.

## When to edit this file

- Workout open handshake, sentinel metadata, or Edge expectations for `workout_context` / `is_silent_sentinel`.
- Coach/Buddy toggle behavior, `#` exercise tagging, or `exercise_mentions` payload shape.
- How execution patches are applied to the player (`onApplyExecutionPatch` ordering and error handling).
- Shared chat primitive upgrades that need workout-specific wiring (prefer small deltas here over pushing workout props into `StandardTaskChatRail`).

## Source

Implementation: [`src/components/chat/WorkoutCoachRail.tsx`](../../../src/components/chat/WorkoutCoachRail.tsx).
