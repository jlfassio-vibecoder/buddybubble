# Standard Task Chat Rail

Task-scoped chat UI that composes existing chat primitives (`useMessageThread`, `ChatMessageRow`, `RichMessageComposer`, agent typing / wait affordances) into a single **flex column** rail. One implementation is meant to back every “conversation about this task” surface (for example `TaskModal` today, `WorkoutCoachRail` and others as the epic progresses).

## Feature flag

| Variable                                | Effect                                                                |
| --------------------------------------- | --------------------------------------------------------------------- |
| `NEXT_PUBLIC_STANDARD_TASK_CHAT_RAIL=1` | `TaskModal` uses `TaskModalChatRailAdapter` → `StandardTaskChatRail`. |
| unset / not `1`                         | Legacy `TaskModalCommentsPanel` chat path.                            |

Helper: `src/lib/feature-flags/standardTaskChatRail.ts` → `isStandardTaskChatRailEnabled()`.

## Primary code

| Path                                                            | Role                                                                                                                                            |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/chat/StandardTaskChatRail.tsx`                  | The rail: thread filter is `scope: 'task'`, scroll + transcript + composer, optional `defaultAgentSlug` for agent affordances.                  |
| `src/components/modals/task-modal/TaskModalChatRailAdapter.tsx` | TaskModal bridge: bubble hint, Buddy onboarding filter, `itemType` → `defaultSlugForItemType`, ref handle parity with `TaskModalCommentsPanel`. |
| `src/lib/agents/defaultSlugForItemType.ts`                      | Maps `tasks.item_type` to root default agent slug (or human-only).                                                                              |
| `src/hooks/useMessageThread.ts`                                 | Single source for realtime, history, inserts, and polling fallback for the rail.                                                                |

## Layout contract

The rail is **`flex h-full min-h-0 min-w-0 flex-col`**. Parents own width and outer layout; the rail fills the flex region and keeps the composer in-flow (no portal). TaskModal may render a desktop split (rail + details) when the flag is on—see `TaskModal.tsx` and `TaskModalDetailsBody.tsx`.

## Dev sandbox

Under the dev app segment:

- `src/app/(dev)/sandbox/standard-task-chat-rail/page.tsx`
- `src/app/(dev)/sandbox/standard-task-chat-rail/sandbox-client.tsx`

Use this to exercise the rail in isolation without opening a full task modal.

## Telemetry / routing logs

The rail uses surface id `standard-task-chat-rail` for client routing telemetry (`logAgentRoutingEvent`).

## Epic and phased work

Charter, phase breakdown, status table, and rollback notes live in:

**`docs/refactor/standard-task-chat-rail/README.md`**

Use that folder for implementation plans; use **this** folder for a stable “what is this rail and where do I change it?” overview.

## Design rules (short)

- **`defaultAgentSlug` omitted or `null`:** human-only thread (no agent typing indicator, no agent wait failsafe).
- **No domain-specific props on the rail** (no workout payloads, execution patches, etc.). Wrappers pass extras via `chatRowExtras` / composer overrides.
- **No duplicate Supabase realtime paths** outside `useMessageThread` for this transcript.
