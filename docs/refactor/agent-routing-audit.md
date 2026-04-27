# Agent Routing Audit — Coach vs Buddy

Read-only architectural audit of agent typing-state routing, avatar sourcing, identity
data-model, mention parsing, system sentinels, and failsafe timeouts.

All claims below cite `file:line` from the current repository state. No source files were
modified during this audit. Live cloud DB values were read via `rest/v1` endpoints with the
service-role key and are marked as such.

---

## 1. Typing-state call sites

### 1.1 `useCoachTypingWait` definition

| Symbol                              | File:line                                                                                                        | Notes                                                                      |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `useCoachTypingWait` export         | `src/hooks/useCoachTypingWait.ts:36`                                                                             | Generic "user sent, someone else will reply" detector. Not agent-specific. |
| Internal state `isWaitingForCoach`  | `src/hooks/useCoachTypingWait.ts:37`                                                                             | Singleton bool per hook instance.                                          |
| `optimisticIntent` set `true`       | `src/hooks/useCoachTypingWait.ts:55`, `src/hooks/useCoachTypingWait.ts:71`, `src/hooks/useCoachTypingWait.ts:73` | `beginWait()` inside `optimisticIntent`.                                   |
| `registerSuccessfulSend` set `true` | `src/hooks/useCoachTypingWait.ts:76`–`src/hooks/useCoachTypingWait.ts:82`                                        | Records `outboundMessageIdRef.current` then `beginWait()`.                 |
| Clear on "latest is not me"         | `src/hooks/useCoachTypingWait.ts:84`–`src/hooks/useCoachTypingWait.ts:95`                                        | Effect comparing `latestMessage.user_id !== myUserId`.                     |
| Failsafe timer `setTimeout`         | `src/hooks/useCoachTypingWait.ts:58`, `src/hooks/useCoachTypingWait.ts:62`                                       | `COACH_WAIT_FAILSAFE_MS = 15_000` (`src/hooks/useCoachTypingWait.ts:6`).   |
| `clear` callback                    | `src/hooks/useCoachTypingWait.ts:49`–`src/hooks/useCoachTypingWait.ts:53`                                        | Resets `outboundMessageIdRef` + `isWaitingForCoach=false`.                 |

The hook exposes `{ isWaitingForCoach, optimisticIntent, registerSuccessfulSend, clear }` at
`src/hooks/useCoachTypingWait.ts:97`–`src/hooks/useCoachTypingWait.ts:102`.

### 1.2 `useCoachTypingWait` consumers

#### `src/components/chat/ChatArea.tsx` (main bubble chat surface + thread panel)

| Purpose                                                                                 | File:line                                                                       | Gated by agent identity?                                                                                 |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Import                                                                                  | `src/components/chat/ChatArea.tsx:49`                                           | n/a                                                                                                      |
| Root feed hook: `coachWaitMain = useCoachTypingWait({...})`                             | `src/components/chat/ChatArea.tsx:349`–`src/components/chat/ChatArea.tsx:352`   | No                                                                                                       |
| Thread panel hook: `coachWaitThread = useCoachTypingWait({...})`                        | `src/components/chat/ChatArea.tsx:353`–`src/components/chat/ChatArea.tsx:356`   | No                                                                                                       |
| Clear on bubble change                                                                  | `src/components/chat/ChatArea.tsx:364`–`src/components/chat/ChatArea.tsx:367`   | n/a                                                                                                      |
| Clear on thread-parent change                                                           | `src/components/chat/ChatArea.tsx:369`–`src/components/chat/ChatArea.tsx:371`   | n/a                                                                                                      |
| Root composer `onSubmitIntent` → gated call to `coachWaitMain.optimisticIntent()`       | `src/components/chat/ChatArea.tsx:1318`–`src/components/chat/ChatArea.tsx:1331` | **Yes — gated by `mentionsCoach(input)` at `:1321`.** If `@buddy` matches, sets `isBuddyTyping` instead. |
| Root composer `onSubmit` → gated `coachWaitMain.registerSuccessfulSend(sent)`           | `src/components/chat/ChatArea.tsx:1332`–`src/components/chat/ChatArea.tsx:1352` | **Yes — gated by `mentionsCoach(text)` at `:1339`; `mentionsBuddy(text)` branch at `:1344`.**            |
| Thread composer `onSubmitIntent={coachWaitThread.optimisticIntent}`                     | `src/components/chat/ChatArea.tsx:1289`                                         | **No gating — fires for every thread reply regardless of agent.**                                        |
| Thread composer `onSuccessfulThreadSend → coachWaitThread.registerSuccessfulSend(sent)` | `src/components/chat/ChatArea.tsx:1290`–`src/components/chat/ChatArea.tsx:1292` | **No gating — same issue.**                                                                              |
| `isWaitingForCoach` passed to `ThreadPanel`                                             | `src/components/chat/ChatArea.tsx:1293`                                         | n/a                                                                                                      |
| Render Coach `AgentTypingIndicator` (root)                                              | `src/components/chat/ChatArea.tsx:1259`–`src/components/chat/ChatArea.tsx:1267` | Driven by `coachWaitMain.isWaitingForCoach`                                                              |
| Render Buddy `AgentTypingIndicator` (root)                                              | `src/components/chat/ChatArea.tsx:1268`–`src/components/chat/ChatArea.tsx:1272` | Driven by `isBuddyTyping`                                                                                |

#### `src/components/modals/task-modal/TaskModalCommentsPanel.tsx` (Kanban task comments)

| Purpose                                                                                                                      | File:line                                                                                                                           | Gated by agent identity?                                                             |
| ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Import                                                                                                                       | `src/components/modals/task-modal/TaskModalCommentsPanel.tsx:21`                                                                    | n/a                                                                                  |
| Destructure `{ isWaitingForCoach, optimisticIntent: onComposerSubmitIntent, registerSuccessfulSend, clear: clearCoachWait }` | `src/components/modals/task-modal/TaskModalCommentsPanel.tsx:324`–`src/components/modals/task-modal/TaskModalCommentsPanel.tsx:332` | No                                                                                   |
| Clear on thread-parent change                                                                                                | `src/components/modals/task-modal/TaskModalCommentsPanel.tsx:449`–`src/components/modals/task-modal/TaskModalCommentsPanel.tsx:459` | n/a                                                                                  |
| Root composer `onSubmitIntent` → gated `onComposerSubmitIntent()`                                                            | `src/components/modals/task-modal/TaskModalCommentsPanel.tsx:539`–`src/components/modals/task-modal/TaskModalCommentsPanel.tsx:551` | **Yes — gated by `mentionsCoach(draft)` at `:541`; Buddy branch at `:543`.**         |
| Root composer `onSubmit` → gated `registerSuccessfulSend(sent)`                                                              | `src/components/modals/task-modal/TaskModalCommentsPanel.tsx:552`–`src/components/modals/task-modal/TaskModalCommentsPanel.tsx:569` | **Yes — gated by `mentionsCoach(text)` at `:558`; `mentionsBuddy(text)` at `:561`.** |
| Thread composer `onSubmitIntent={onComposerSubmitIntent}`                                                                    | `src/components/modals/task-modal/TaskModalCommentsPanel.tsx:604`                                                                   | **No gating — fires for every thread reply regardless of agent.**                    |
| Thread composer `onSubmit` → always `registerSuccessfulSend(sent)`                                                           | `src/components/modals/task-modal/TaskModalCommentsPanel.tsx:605`–`src/components/modals/task-modal/TaskModalCommentsPanel.tsx:614` | **No gating — same issue.**                                                          |
| Render Coach `AgentTypingIndicator` (root)                                                                                   | `src/components/modals/task-modal/TaskModalCommentsPanel.tsx:697`–`src/components/modals/task-modal/TaskModalCommentsPanel.tsx:705` | Driven by `isWaitingForCoach`                                                        |
| Render Buddy `AgentTypingIndicator` (root)                                                                                   | `src/components/modals/task-modal/TaskModalCommentsPanel.tsx:706`–`src/components/modals/task-modal/TaskModalCommentsPanel.tsx:710` | Driven by `isBuddyTyping`                                                            |
| Render Coach `AgentTypingIndicator` (thread)                                                                                 | `src/components/modals/task-modal/TaskModalCommentsPanel.tsx:767`–`src/components/modals/task-modal/TaskModalCommentsPanel.tsx:775` | `isWaitingForCoach` only; **no Buddy indicator rendered in thread view.**            |

#### `src/components/chat/ThreadPanel.tsx` (thread side panel in `ChatArea`)

| Purpose                                                                                                         | File:line                                                                           | Gated by agent identity?                                                                                                     |
| --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --- |
| Prop types include `isWaitingForCoach?: boolean`, `onSubmitIntent?: () => void`, `coachTypingAvatarUrl?: string | null`                                                                               | `src/components/chat/ThreadPanel.tsx:25`, `src/components/chat/ThreadPanel.tsx:28`, `src/components/chat/ThreadPanel.tsx:29` | n/a |
| Coach indicator render                                                                                          | `src/components/chat/ThreadPanel.tsx:127`–`src/components/chat/ThreadPanel.tsx:131` | Uses `agentType="coach"` and parent-supplied avatar.                                                                         |
| Reply composer `onSubmitIntent={onSubmitIntent}`                                                                | `src/components/chat/ThreadPanel.tsx:143`                                           | **No agent gating inside `ThreadPanel`; it forwards whatever parent wired.**                                                 |

### 1.3 `isBuddyTyping` set/read sites

| Occurrence                             | File:line                                                                       | Trigger / clear                           |
| -------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------- |
| Declaration                            | `src/components/chat/ChatArea.tsx:419`                                          | `useState(false)`                         |
| Auto-clear on any message arrival      | `src/components/chat/ChatArea.tsx:433`–`src/components/chat/ChatArea.tsx:438`   | `allMessages.length > 0` clears           |
| Clear on bubble change                 | `src/components/chat/ChatArea.tsx:442`–`src/components/chat/ChatArea.tsx:445`   | —                                         |
| Unmount cleanup                        | `src/components/chat/ChatArea.tsx:447`                                          | —                                         |
| Onboarding trigger effect              | `src/components/chat/ChatArea.tsx:449`–`src/components/chat/ChatArea.tsx:490`   | Sets true + 30s failsafe + sends sentinel |
| Gated set in composer `onSubmitIntent` | `src/components/chat/ChatArea.tsx:1323`–`src/components/chat/ChatArea.tsx:1330` | `mentionsBuddy(input)`                    |
| Gated set in composer `onSubmit`       | `src/components/chat/ChatArea.tsx:1344`–`src/components/chat/ChatArea.tsx:1351` | `mentionsBuddy(text)`                     |
| Render usage (main)                    | `src/components/chat/ChatArea.tsx:1268`                                         | —                                         |

| Occurrence                             | File:line                                                                                                                           | Trigger / clear                           |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Declaration                            | `src/components/modals/task-modal/TaskModalCommentsPanel.tsx:384`                                                                   | `useState(false)`                         |
| Auto-clear on any message              | `src/components/modals/task-modal/TaskModalCommentsPanel.tsx:400`–`src/components/modals/task-modal/TaskModalCommentsPanel.tsx:405` | `sortedRows.length > 0` clears            |
| Clear on taskId change                 | `src/components/modals/task-modal/TaskModalCommentsPanel.tsx:409`–`src/components/modals/task-modal/TaskModalCommentsPanel.tsx:412` | —                                         |
| Unmount cleanup                        | `src/components/modals/task-modal/TaskModalCommentsPanel.tsx:414`                                                                   | —                                         |
| Empty-thread onboarding effect         | `src/components/modals/task-modal/TaskModalCommentsPanel.tsx:416`–`src/components/modals/task-modal/TaskModalCommentsPanel.tsx:447` | Sets true + 30s failsafe + sends sentinel |
| Placeholder suppression                | `src/components/modals/task-modal/TaskModalCommentsPanel.tsx:694`                                                                   | —                                         |
| Render usage (root)                    | `src/components/modals/task-modal/TaskModalCommentsPanel.tsx:706`                                                                   | —                                         |
| Gated set in composer `onSubmitIntent` | `src/components/modals/task-modal/TaskModalCommentsPanel.tsx:543`–`src/components/modals/task-modal/TaskModalCommentsPanel.tsx:550` | `mentionsBuddy(draft)`                    |
| Gated set in composer `onSubmit`       | `src/components/modals/task-modal/TaskModalCommentsPanel.tsx:561`–`src/components/modals/task-modal/TaskModalCommentsPanel.tsx:568` | `mentionsBuddy(text)`                     |

### 1.4 Composer `onSubmitIntent` sites

| File:line                                                                                                                     | Component / surface              | Who sets it                                  |
| ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | -------------------------------------------- |
| `src/components/chat/RichMessageComposer.tsx:65`                                                                              | Prop definition                  | Shared composer                              |
| `src/components/chat/RichMessageComposer.tsx:115`, `src/components/chat/RichMessageComposer.tsx:290`                          | Invoked on form submit           | Shared composer                              |
| `src/components/chat/ThreadPanel.tsx:25`, `src/components/chat/ThreadPanel.tsx:49`, `src/components/chat/ThreadPanel.tsx:143` | Thread reply composer            | Forwarded from `ChatArea`/parent             |
| `src/components/chat/ChatArea.tsx:1289`                                                                                       | Thread composer in `ThreadPanel` | `coachWaitThread.optimisticIntent` (ungated) |
| `src/components/chat/ChatArea.tsx:1318`                                                                                       | Root composer                    | Gated by `mentionsCoach` / `mentionsBuddy`   |
| `src/components/modals/task-modal/TaskModalCommentsPanel.tsx:539`                                                             | Task root composer               | Gated by `mentionsCoach` / `mentionsBuddy`   |
| `src/components/modals/task-modal/TaskModalCommentsPanel.tsx:604`                                                             | Task thread composer             | `onComposerSubmitIntent` (ungated)           |

### 1.5 Where Coach wait bleeds into non-Coach interactions

- **Thread-panel reply composer in `ChatArea`** fires Coach wait on every reply regardless of content
  (`src/components/chat/ChatArea.tsx:1289`–`src/components/chat/ChatArea.tsx:1292`).
- **Task-modal thread composer** similarly fires Coach wait on every reply
  (`src/components/modals/task-modal/TaskModalCommentsPanel.tsx:604`, `src/components/modals/task-modal/TaskModalCommentsPanel.tsx:612`).
- The hook's semantic ("somebody else will reply") ignores which agent the user invoked
  (`src/hooks/useCoachTypingWait.ts:36`, `src/hooks/useCoachTypingWait.ts:84`–`src/hooks/useCoachTypingWait.ts:95`).

---

## 2. Avatar sourcing

### 2.1 Typing-indicator avatar resolution (`src/components/chat/AgentTypingIndicator.tsx`)

| Resolution path                                                              | File:line                                                                                             | Source                                              | Distinguishes agent?                                                   |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------- |
| `avatarUrl` prop `<img src={avatarUrl}>`                                     | `src/components/chat/AgentTypingIndicator.tsx:107`–`src/components/chat/AgentTypingIndicator.tsx:113` | Caller-supplied URL                                 | Only if caller supplies a distinct URL per `agentType`                 |
| `avatarFallback` prop                                                        | `src/components/chat/AgentTypingIndicator.tsx:114`–`src/components/chat/AgentTypingIndicator.tsx:116` | Caller-supplied ReactNode                           | Caller-determined                                                      |
| Default fallback (Buddy) hardcoded `<img src="/brand/BuddyBubble-mark.svg">` | `src/components/chat/AgentTypingIndicator.tsx:55`–`src/components/chat/AgentTypingIndicator.tsx:63`   | Static public asset                                 | **Yes (Buddy-specific)** — but **does not** match the feed avatar path |
| Default fallback letter `<span>{label[0]}</span>`                            | `src/components/chat/AgentTypingIndicator.tsx:64`–`src/components/chat/AgentTypingIndicator.tsx:67`   | `defaultAgentLabel(agentType)[0]` (`C` / `O` / `B`) | Yes, but no graphic                                                    |

### 2.2 Typing-indicator callers

| Caller                                  | File:line                                                                                                                           | `agentType`                                                                                                     | `avatarUrl` source                             |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `ChatArea` main                         | `src/components/chat/ChatArea.tsx:1261`–`src/components/chat/ChatArea.tsx:1265`                                                     | `"coach"`                                                                                                       | `coachTypingAvatarUrl` (see §2.4)              |
| `ChatArea` Buddy root                   | `src/components/chat/ChatArea.tsx:1270`                                                                                             | `"buddy"`                                                                                                       | none → hardcoded `/brand/BuddyBubble-mark.svg` |
| `ChatArea` → `ThreadPanel` (coach only) | `src/components/chat/ChatArea.tsx:1293`–`src/components/chat/ChatArea.tsx:1294`                                                     | `"coach"` (inside panel at `src/components/chat/ThreadPanel.tsx:129`–`src/components/chat/ThreadPanel.tsx:133`) | `coachTypingAvatarUrl` prop                    |
| Task modal root (coach)                 | `src/components/modals/task-modal/TaskModalCommentsPanel.tsx:697`–`src/components/modals/task-modal/TaskModalCommentsPanel.tsx:705` | `"coach"`                                                                                                       | `coachTypingAvatarUrl`                         |
| Task modal root (buddy)                 | `src/components/modals/task-modal/TaskModalCommentsPanel.tsx:706`–`src/components/modals/task-modal/TaskModalCommentsPanel.tsx:710` | `"buddy"`                                                                                                       | none → hardcoded asset                         |
| Task modal thread (coach only)          | `src/components/modals/task-modal/TaskModalCommentsPanel.tsx:767`–`src/components/modals/task-modal/TaskModalCommentsPanel.tsx:775` | `"coach"`                                                                                                       | `coachTypingAvatarUrl`                         |

### 2.3 Feed message avatar (`ChatMessageRow`) sourcing

- Resolution: `message.senderAvatar` → fallback `message.sender[0]`
  (`src/components/chat/ChatMessageRow.tsx:92`–`src/components/chat/ChatMessageRow.tsx:101`).
- `senderAvatar` is populated by `rowToChatMessage` from `user.avatar_url`
  (`src/lib/chat-message-mapper.ts:13`–`src/lib/chat-message-mapper.ts:18`,
  `src/lib/chat-message-mapper.ts:40`–`src/lib/chat-message-mapper.ts:43`).
- `user` is passed from:
  - `ChatArea`: `userById[row.user_id]` or `toChatUserSnapshot(myProfile)` for the self row
    (`src/components/chat/ChatArea.tsx:401`–`src/components/chat/ChatArea.tsx:406`).
  - `TaskModalCommentsPanel`: same pattern
    (`src/components/modals/task-modal/TaskModalCommentsPanel.tsx:341`–`src/components/modals/task-modal/TaskModalCommentsPanel.tsx:346`).
- `userById` is built from two sources in `useMessageThread`:
  - Real `public.users` rows joined via `messages.user_id`
    (`src/hooks/useMessageThread.ts:210`–`src/hooks/useMessageThread.ts:221`,
    `src/hooks/useMessageThread.ts:249`–`src/hooks/useMessageThread.ts:256`,
    `src/hooks/useMessageThread.ts:1034`–`src/hooks/useMessageThread.ts:1040`).
  - Synthetic snapshots from `agent_definitions` joined via `bubble_agent_bindings` and the Buddy
    global fetch (`src/hooks/useMessageThread.ts:622`–`src/hooks/useMessageThread.ts:628`,
    `src/hooks/useMessageThread.ts:642`–`src/hooks/useMessageThread.ts:648`).
  - For the agent synthetic snapshots, `avatar_url` is taken from `agent_definitions.avatar_url`
    (`src/hooks/useMessageThread.ts:625`, `src/hooks/useMessageThread.ts:645`), **not** from
    `public.users.avatar_url`.

**Important collision**: when an agent posts a real message, `rowToChatMessage(row, userById[row.user_id], ...)`
will receive whichever snapshot is in `userById` for that `auth_user_id`. If the `users` fetch at
`src/hooks/useMessageThread.ts:210` resolved first (null `avatar_url` today), it will be overwritten by the
agent snapshot merge at `src/hooks/useMessageThread.ts:656` because the order in the set-state
is `...prev, ...agentSnapshots, ...fromRows` — so `fromRows` actually **wins over** `agentSnapshots`
for agent users whose row exists in both sources. For human rows, `agentSnapshots` is irrelevant.

```652:657:src/hooks/useMessageThread.ts
      const humanMembersFiltered = members.filter((m) => !agentAuthIds.has(m.id));
      const mergedMembers = [...agentMembers, ...humanMembersFiltered];

      setTeamMembers(mergedMembers);
      setAgentAuthUserIds([...agentAuthIds]);
      setUserById((prev) => ({ ...prev, ...agentSnapshots, ...fromRows }));
```

The consequence today (DB state verified — see §3.2): `fromRows` does not contain Buddy's auth id
because `workspace_members` join excludes agents, so `agentSnapshots` ends up as the sole snapshot
source for Buddy. With `agent_definitions.avatar_url = null`, `senderAvatar` becomes `undefined`,
falling back to `message.sender[0]` → `"B"` for Buddy's feed avatar.

### 2.4 `coachTypingAvatarUrl` derivation (non-deterministic ordering)

Both surfaces compute it as:

```358:362:src/components/chat/ChatArea.tsx
  const coachTypingAvatarUrl = useMemo(() => {
    const id = agentAuthUserIds[0];
    if (!id) return null;
    return userById[id]?.avatar_url ?? null;
  }, [agentAuthUserIds, userById]);
```

Same logic: `src/components/modals/task-modal/TaskModalCommentsPanel.tsx:334`–`src/components/modals/task-modal/TaskModalCommentsPanel.tsx:338`.

Ordering of `agentAuthUserIds` comes from the Set-then-spread at
`src/hooks/useMessageThread.ts:604`, `src/hooks/useMessageThread.ts:615`,
`src/hooks/useMessageThread.ts:635`, `src/hooks/useMessageThread.ts:655`. Insertion order is:

1. Each bubble-bound agent in `bubble_agent_bindings` (ordered by `sort_order asc` at
   `src/hooks/useMessageThread.ts:536`).
2. Buddy (only if not already present) at `src/hooks/useMessageThread.ts:634`.

So index `[0]` is **not guaranteed to be Coach**. For bubbles without any bindings but with Buddy
enabled, `agentAuthUserIds[0]` is Buddy's `auth_user_id`, and `coachTypingAvatarUrl` — nominally
"the coach avatar" — becomes Buddy's avatar URL (currently `null`). In any bubble where bindings
exist, the first `sort_order` binding wins, which may or may not be Coach.

### 2.5 Avatar distinction summary

| Context          | Buddy distinguishable?                                           | Coach distinguishable?                                                | Human distinguishable?              |
| ---------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------- |
| Typing indicator | Yes via hardcoded `/brand/BuddyBubble-mark.svg` (`:59`)          | Only if `coachTypingAvatarUrl` resolves to a URL — today null in prod | N/A (not rendered for humans)       |
| Feed message row | Only by sender name fallback letter `"B"` (DB `avatar_url` null) | Only by sender name fallback letter `"C"` (DB `avatar_url` null)      | Yes via `users.avatar_url` when set |

---

## 3. Agent identity data model

### 3.1 Schema

| Artifact                                    | Location                                                                                                                                                               |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `public.users.is_agent` boolean             | `supabase/migrations/20260527100000_bubble_agents_phase1_identity.sql:8`–`:12`                                                                                         |
| `public.agent_definitions` table            | `supabase/migrations/20260527100000_bubble_agents_phase1_identity.sql:18`–`:45` (incl. `avatar_url text` at `:24`, `mention_handle` at `:21`, `auth_user_id` at `:23`) |
| `public.bubble_agent_bindings` table        | `supabase/migrations/20260527100000_bubble_agents_phase1_identity.sql:51`–`:62`                                                                                        |
| RLS for `agent_definitions` (bubble-scoped) | `supabase/migrations/20260527100000_bubble_agents_phase1_identity.sql:75`–`:87`                                                                                        |
| RLS extension for workspace-global Buddy    | `supabase/migrations/20260701150000_buddy_agent_rls_workspace_global.sql:13`–`:49`                                                                                     |
| TypeScript types                            | `src/types/database.generated.ts:36`–`:77`, aliased at `src/types/database.ts:89`, `src/types/database.ts:91`                                                          |
| Provisioning script                         | `scripts/provision-agents.ts:30`–`:52` (agent specs) and `:88`–`:189` (auth + users + agent_definitions insert)                                                        |

### 3.2 Live DB state (read via service-role REST on 2026-04-23)

| Slug      | `agent_definitions.avatar_url` | `public.users.avatar_url` | `auth_user_id`                         | `is_agent` |
| --------- | ------------------------------ | ------------------------- | -------------------------------------- | ---------- |
| coach     | `null`                         | `null`                    | `a1111111-1111-4111-8111-111111111101` | `true`     |
| organizer | `null`                         | `null`                    | `a1111111-1111-4111-8111-111111111102` | `true`     |
| buddy     | `null`                         | `null`                    | `db2cb12b-074e-4b28-99e3-0d731c1362f9` | `true`     |

Neither the `agent_definitions.avatar_url` nor the bot's `public.users.avatar_url` is populated
for any agent. The hardcoded `/brand/BuddyBubble-mark.svg` path in the typing indicator is the
**only** Buddy visual that exists in the product today.

### 3.3 `agentAuthUserIds` computation and ordering

| Step                                                                              | File:line                                                               |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Local `agentAuthIds = new Set<string>()`                                          | `src/hooks/useMessageThread.ts:604`                                     |
| Add each bubble-bound agent `auth_user_id`                                        | `src/hooks/useMessageThread.ts:615`                                     |
| Order of `bubble_agent_bindings` rows: `order('sort_order', { ascending: true })` | `src/hooks/useMessageThread.ts:536`                                     |
| Conditionally add Buddy if not present                                            | `src/hooks/useMessageThread.ts:634`–`src/hooks/useMessageThread.ts:649` |
| Spread to array: `setAgentAuthUserIds([...agentAuthIds])`                         | `src/hooks/useMessageThread.ts:655`                                     |

Observations:

- Set insertion order is preserved in JS, so the array order is deterministic per the insertion
  sequence (sort_order asc + Buddy last).
- For bubbles with no bindings, `agentAuthUserIds = [buddyAuthUserId]`, so `coachTypingAvatarUrl`
  actually returns Buddy's avatar URL from `userById`.
- When multiple agents are bound in the same bubble, index `[0]` is the lowest `sort_order`. There
  is no guarantee that this is Coach — it is whatever row was created first / lowest priority.
- If `sort_order` ties, Postgres order is **unspecified** without a secondary key, so `[0]` can
  alias between ties across reloads. `[UNVERIFIED]` whether production rows share sort_order.

### 3.4 Is `agent_definitions.avatar_url` consumed by UI?

- Read from DB: `src/hooks/useMessageThread.ts:532`, `src/hooks/useMessageThread.ts:545`.
- Mapped into:
  - `MessageThreadTeamMember.avatar` for mention picker
    (`src/hooks/useMessageThread.ts:620`, `src/hooks/useMessageThread.ts:640`).
  - `ChatUserSnapshot.avatar_url` in `userById`
    (`src/hooks/useMessageThread.ts:625`, `src/hooks/useMessageThread.ts:645`).
- Indirectly consumed by `ChatMessageRow` through `rowToChatMessage` / `senderAvatar`
  (`src/lib/chat-message-mapper.ts:13`–`:18`, `src/components/chat/ChatMessageRow.tsx:92`–`:101`).
- Also used by typing indicator via `coachTypingAvatarUrl` → `userById[id]?.avatar_url`
  (`src/components/chat/ChatArea.tsx:358`–`:362`,
  `src/components/modals/task-modal/TaskModalCommentsPanel.tsx:334`–`:338`).

**Conclusion**: `agent_definitions.avatar_url` _is_ plumbed into both feed avatars and the typing
indicator, but the column is `null` for every agent today, so it never actually propagates a
visible image.

---

## 4. Mention parsing

| Where                                                                                    | Pattern    | Used for                                            |
| ---------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------- |
| `src/components/chat/ChatArea.tsx:56`–`:59` (`mentionsCoach`)                            | `/(^       | [^\w])@coach(?!\w)/i`                               |
| `src/components/chat/ChatArea.tsx:61`–`:64` (`mentionsBuddy`)                            | `/(^       | [^\w])@buddy(?!\w)/i`                               |
| `src/components/modals/task-modal/TaskModalCommentsPanel.tsx:35`–`:38` (`mentionsCoach`) | Same regex | Gate in task modal root composer at `:541`, `:558`  |
| `src/components/modals/task-modal/TaskModalCommentsPanel.tsx:40`–`:43` (`mentionsBuddy`) | Same regex | Gate in task modal root composer at `:543`, `:561`  |
| `supabase/functions/buddy-agent-dispatch/index.ts:97` (`mentionsBuddy` — server)         | `/(^       | [^\w])@buddy(?!\w)/i` (inferred from function body) |

Additional composer `@` handling — not agent-routing:

- `RichMessageComposer` has generic `@`-mention dropdown logic at
  `src/components/chat/RichMessageComposer.tsx:202`–`:215` and `:252`–`:256`, but it
  filters `mentionConfig.members` by **name** (`src/components/chat/RichMessageComposer.tsx:154`–`:160`).
  It does not differentiate agent slugs/handles in submit flow; it just inserts the name.
- There is no server-authoritative mapping from the text `@Buddy` → agent slug on the client.

**No other client-side mention parsers exist**. All agent routing decisions currently rely on the
four lowercase regexes listed above.

### 4.1 Identified regex concerns

- The regexes are case-insensitive but hardcoded to the literal strings `@coach` and `@buddy`,
  which lock to the English display names. `mention_handle` in DB is `coach` / `Buddy` /
  `organizer` — a user-renamed mention_handle (e.g., `@AI-Coach`) would bypass gating.
- There is no handling for `@Organizer` even though the agent exists in DB
  (`src/types/database.generated.ts:44`–`:54`, provisioned in `scripts/provision-agents.ts:39`–`:43`).
  Sending `@organizer` will fall through both `mentionsCoach` and `mentionsBuddy` checks, so the
  main composer fires **no** typing state at all for that agent — [UNVERIFIED] visible impact
  since the backend `bubble-agent-dispatch` may not respond to Organizer either.

---

## 5. Sentinel / system-event messages

| Constant                                                 | Value                                | File:line                                                                        |
| -------------------------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------- |
| `BUDDY_ONBOARDING_SYSTEM_EVENT` (frontend, main chat)    | `[SYSTEM_EVENT: ONBOARDING_STARTED]` | `src/components/chat/ChatArea.tsx:72`                                            |
| `BUDDY_ONBOARDING_SYSTEM_EVENT` (frontend, task modal)   | same value                           | `src/components/modals/task-modal/TaskModalCommentsPanel.tsx:51`                 |
| `BUDDY_ONBOARDING_SYSTEM_EVENT` (backend, edge function) | same value                           | `supabase/functions/buddy-agent-dispatch/index.ts:110`                           |
| `WORKOUT_COACH_SENTINEL_EVENT` (frontend, workout rail)  | `[SYSTEM_EVENT: WORKOUT_CONTEXT]`    | `src/components/chat/WorkoutCoachRail.tsx` (constant)                            |
| Same (backend, edge function)                            | same value                           | `supabase/functions/bubble-agent-dispatch/index.ts` (`isWorkoutContextSentinel`) |

### 5.1 Filtering so users never see the sentinel

- Main chat: `allMessages` filter `row.content !== BUDDY_ONBOARDING_SYSTEM_EVENT` at
  `src/components/chat/ChatArea.tsx:400`.
- Task modal: `sortedRows` filter at
  `src/components/modals/task-modal/TaskModalCommentsPanel.tsx:309`.
- Backend history builder also strips it when prompting Gemini
  (`supabase/functions/buddy-agent-dispatch/index.ts:213`, `:241`).

### 5.2 Emission sites (frontend → DB)

| Emitter                                               | File:line                                                         | Expected responder |
| ----------------------------------------------------- | ----------------------------------------------------------------- | ------------------ |
| Empty-bubble onboarding in `ChatArea`                 | `src/components/chat/ChatArea.tsx:476`                            | Buddy              |
| Empty task-comment thread in `TaskModalCommentsPanel` | `src/components/modals/task-modal/TaskModalCommentsPanel.tsx:440` | Buddy              |

Both emitters:

- Use per-context refs to fire once: `buddyTriggerFiredRef`
  (`src/components/chat/ChatArea.tsx:417`, `src/components/modals/task-modal/TaskModalCommentsPanel.tsx:382`).
- Start Buddy typing state alongside the emit
  (`src/components/chat/ChatArea.tsx:469`–`:474`,
  `src/components/modals/task-modal/TaskModalCommentsPanel.tsx:433`–`:438`).

### 5.3 Backend invocation flow for sentinel

- Sentinel goes into `public.messages` via normal `INSERT` path (`useMessageThread.sendMessage` at
  `src/hooks/useMessageThread.ts:668`–`src/hooks/useMessageThread.ts:1048`).
- DB webhook trigger `buddy_dispatch_webhook` POSTs to
  `/functions/v1/buddy-agent-dispatch` with `x-buddy-agent-secret` header (verified in cloud
  DB; reference in `docs/bubble-agent-webhook.md` for the coach analog).
- Edge function treats sentinel as `isImplicitTrigger` — `supabase/functions/buddy-agent-dispatch/index.ts:122`
  (`content === BUDDY_ONBOARDING_SYSTEM_EVENT`).

### 5.4 Other agent-invoking system triggers

- **Workout player:** `[SYSTEM_EVENT: WORKOUT_CONTEXT]` is inserted from `WorkoutCoachRail` with
  `metadata.default_agent_slug: coach`, `workout_task_title`, and `workoutContext`. The UI hides the
  sentinel row; `bubble-agent-dispatch` detects it and runs a short **workout-open greeting** path
  (reply-only RPC), then returns.
- Buddy onboarding sentinel remains separate (`buddy-agent-dispatch`).
- Coach for normal bubble chat remains `@mention` / `default_agent_slug` on user-authored roots in
  `bubble-agent-dispatch`.

---

## 6. Failsafe timeouts in the typing-state system

| Timer                                  | Duration    | Set at                                                                                                        | Clear conditions                                                                                                                                         |
| -------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `COACH_WAIT_FAILSAFE_MS`               | `15_000` ms | `src/hooks/useCoachTypingWait.ts:6`, `:58`, `:62`                                                             | Resolves by `clear()` (`:49`–`:53`), unmount (`:65`–`:69`), latest message becomes not-mine (`:84`–`:95`), or failsafe fires                             |
| `BUDDY_TYPING_TIMEOUT_MS` (main chat)  | `30_000` ms | `src/components/chat/ChatArea.tsx:75`, `:471`–`:474`, `:1326`–`:1329`, `:1347`–`:1350`                        | Any non-sentinel message arrival (`:433`–`:438`), bubble change (`:442`–`:445`), unmount (`:447`), sentinel send failure (`:477`–`:481`), failsafe fires |
| `BUDDY_TYPING_TIMEOUT_MS` (task modal) | `30_000` ms | `src/components/modals/task-modal/TaskModalCommentsPanel.tsx:54`, `:435`–`:438`, `:546`–`:549`, `:564`–`:567` | Any non-sentinel message arrival (`:400`–`:405`), taskId change (`:409`–`:412`), unmount (`:414`), sentinel send failure (`:441`–`:446`), failsafe fires |

Observations:

- Coach failsafe is **half** the duration of Buddy's (15s vs 30s). [UNVERIFIED] whether Buddy's
  Edge-Function cold start + Gemini latency routinely exceeds 15s and would cause Coach-like UX
  regressions if the hook were reused for Buddy.
- The auto-clear "any message arrives" effect for Buddy uses the sentinel-filtered list
  (`allMessages` / `sortedRows`), which means the sentinel itself does not prematurely clear the
  indicator. This is intentional.
- `useCoachTypingWait` auto-clear requires `latest.user_id !== myUserId` **and** the outbound
  message id to be present in `messages`. For large/paginated threads where the outbound row has
  not been realtime-merged, the failsafe is the only clear path.

---

## Questions requiring product decisions

1. **Coach wait semantics**: `useCoachTypingWait` is today a generic "await any peer/agent reply."
   Should it remain a generic multi-agent wait hook with a label (`pendingAgent: 'coach' | 'buddy'  | ...`), or be replaced by per-agent state pipes tied to `mention_handle`? [UNVERIFIED] which
   surfaces still require a generic "someone is typing" visualization for peers.
2. **Avatar canonical source**: should Buddy's avatar be stored in
   (a) `agent_definitions.avatar_url` (referenced by UI today but unset), (b) the bot's
   `public.users.avatar_url`, or (c) a static app asset referenced by slug mapping (current
   typing-indicator approach)? The three paths are inconsistent and `agent_definitions.avatar_url`
   is not currently populated — see §3.2.
3. `**agentAuthUserIds[0]` contract\*\*: the variable name used in `coachTypingAvatarUrl` implies a
   Coach-specific identity, but the array order is `sort_order` asc with Buddy appended. Should
   avatar selection switch to an explicit lookup keyed by `slug = 'coach'` to eliminate drift?
4. **Thread composer ungated Coach wait**: thread composers in both `ChatArea`
   (`src/components/chat/ChatArea.tsx:1289`) and `TaskModalCommentsPanel`
   (`src/components/modals/task-modal/TaskModalCommentsPanel.tsx:604`) still fire Coach wait on
   every reply. Is this intentional (historic "someone will reply to me" affordance for peer
   replies) or a bug to remove? [UNVERIFIED] UX intent.
5. **Mention regex authority**: the client regexes assume `@coach` / `@buddy` lowercase literals.
   `agent_definitions.mention_handle` is the authoritative source; should we drive mention
   detection from that column to support rename / per-workspace override?
6. **Organizer typing affordance**: `@organizer` currently fires no optimistic typing indicator
   anywhere (no regex matches). Is this agent still in scope, and if so, what typing/avatar flow
   should apply?
7. **Buddy sentinel in thread view**: the task modal renders Buddy's typing indicator in the root
   view only (`src/components/modals/task-modal/TaskModalCommentsPanel.tsx:706`). Thread view
   shows only the Coach indicator (`:767`). If Buddy can continue conversations in card threads,
   should Buddy's indicator also render in the thread view?
8. `**agent_definitions.avatar_url` vs static asset parity\*\*: the typing indicator's Buddy default
   (`/brand/BuddyBubble-mark.svg`) does not appear on Buddy's authored message rows. Should we
   populate `agent_definitions.avatar_url` (or the bot's `public.users.avatar_url`) with the same
   asset so both the typing indicator and feed row show the BuddyBubble mark without UI branching?
9. **Coach failsafe duration asymmetry**: is 15s (Coach) vs 30s (Buddy) intentional, or should a
   unified per-agent latency budget exist?
10. **Per-bubble Coach specificity**: the product model says Coach is "one per BuddyBubble." Today
    the UI uses `agentAuthUserIds[0]` and `coachTypingAvatarUrl` naming is singular; there's no
    UI contract for multiple coaches in a social space. [UNVERIFIED] whether the schema allows it
    (`bubble_agent_bindings` allows multiple bindings, so yes in principle).
