# Phase 1 — Build the standalone `StandardTaskChatRail`

> Create the new component file with **no callers** in production code. Verify
> it in isolation via unit tests + a sandbox route. `TaskModal.tsx`,
> `WorkoutPlayer.tsx`, and `TaskModalCommentsPanel.tsx` are **not** touched.

## Inputs

- Phase 0 complete (`§5 DECISIONS LOCKED ON` populated).
- Frozen prop API from Phase 0 §4.
- Working reference component: `src/components/chat/WorkoutCoachRail.tsx`.

## Deliverables

Files to **create**:

1. `src/components/chat/StandardTaskChatRail.tsx` — the rail itself.
2. `src/components/chat/__tests__/StandardTaskChatRail.test.tsx` — unit tests
   (Vitest + Testing Library).
3. `src/app/(dev)/sandbox/standard-task-chat-rail/page.tsx` — sandbox route
   that mounts the rail with hardcoded `workspaceId` / `taskId` for visual
   sanity checks. Gate with `process.env.NEXT_PUBLIC_DEV_SANDBOXES === '1'`.

Files **not** touched:

- `src/components/modals/TaskModal.tsx`
- `src/components/modals/task-modal/TaskModalCommentsPanel.tsx`
- `src/components/fitness/WorkoutPlayer.tsx`
- `src/components/chat/WorkoutCoachRail.tsx`
- `src/hooks/useMessageThread.ts`
- Anything under `supabase/functions/**`

## Component contract

Implement `StandardTaskChatRailProps` exactly as frozen in Phase 0 §4.

### Internal layout (must match `WorkoutCoachRail`'s shape)

```tsx
return (
  <div className={cn('flex h-full min-h-0 min-w-0 flex-col bg-background', className)}>
    {/* Optional header — only render if onCollapse is provided */}
    <header className="..." />

    {/* Scrollable transcript */}
    <div className="flex-1 min-h-0 overflow-y-auto">
      {messages.map((m) => <ChatMessageRow key={m.id} message={m} ... />)}
      {agentTyping ? <AgentTypingIndicator agentSlug={defaultAgentSlug ?? undefined} /> : null}
    </div>

    {/* Composer footer — owns its own dock; never portals out */}
    <RichMessageComposer
      enableAtMentions
      enableSlashTaskLinks={false}
      enableExerciseHashMentions={false}
      enableCreateAndAttachCard={false}
      enableStartLiveWorkout={false}
      {...composerOverrides}
      onSend={handleSend}
    />
  </div>
);
```

### State + data layer

- `useMessageThread({ filter: { scope: 'task', taskId }, taskBubbleIdHint: bubbleId, workspaceId })`.
- On send, set `metadata.default_agent_slug = defaultAgentSlug` **only when
  `defaultAgentSlug` is a non-empty string**. Never write `default_agent_slug:
null` — omit the key entirely.
- If `defaultAgentSlug` is null/undefined:
  - Do **not** mount `useAgentResponseWait`.
  - Do **not** render `AgentTypingIndicator`.
  - Do **not** add agent-toggle UI.
- If `defaultAgentSlug` is a non-empty string:
  - Mount `useAgentResponseWait({ agentSlug: defaultAgentSlug, bubbleId })`.
  - Render `AgentTypingIndicator` while `agentTyping === true`.

### Tripwire (dev-only)

```ts
if (process.env.NODE_ENV !== 'production') {
  // eslint-disable-next-line no-console
  console.log('[DEBUG] StandardTaskChatRail mount ->', {
    taskId,
    workspaceId,
    bubbleId,
    defaultAgentSlug: defaultAgentSlug ?? null,
  });
}
```

## Tests

`__tests__/StandardTaskChatRail.test.tsx` must cover:

1. Renders an empty transcript without crashing when given valid IDs.
2. With `defaultAgentSlug={undefined}`:
   - `AgentTypingIndicator` is not in the DOM.
   - `useAgentResponseWait` is not invoked (mock the module).
   - Sent messages do **not** include `default_agent_slug` in their metadata.
3. With `defaultAgentSlug="coach"`:
   - Sent messages include `metadata.default_agent_slug === 'coach'`.
   - `AgentTypingIndicator` renders when the mocked `useAgentResponseWait`
     reports `agentTyping`.
4. `composerOverrides.enableExerciseHashMentions = true` reaches the composer
   without altering any other prop.
5. The root element has the exact class string
   `flex h-full min-h-0 min-w-0 flex-col bg-background` so layout regressions
   are caught.

Mock `useMessageThread` to avoid hitting Supabase; assert on the args it
receives (especially `filter.scope === 'task'`).

## Acceptance criteria

- [ ] `StandardTaskChatRail.tsx` exists and exports a component matching the
      Phase 0 §4 prop shape exactly.
- [ ] No production file imports it. (`rg "StandardTaskChatRail" src` returns
      only the new file, its test, and the sandbox page.)
- [ ] Vitest suite for the rail is green; coverage of all five test cases above.
- [ ] Sandbox page renders and accepts a typed message end-to-end against a
      seeded task in a dev workspace.
- [ ] No new dependencies added. No changes outside the four files listed in
      "Deliverables".

## Risk + rollback

Phase 1 is purely additive. Rollback is `git revert` of the PR. No flag, no
deploy coordination required.
