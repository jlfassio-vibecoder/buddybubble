# Adding a new Coach for a new social space

Phase 4 locks the agent-routing layer to a fully agent-agnostic contract: the client
resolver (`src/lib/agents/resolveTargetAgent.ts`), the typing indicator
(`useAgentResponseWait`), and the avatar resolver (`resolveAgentAvatar`) do not know
about specific coaches. Adding a new Coach is now a DB change plus, optionally, a
binding row per bubble.

This doc walks through the full flow end-to-end, with a worked example of adding a
`RecipeCoach` for a recipe-sharing social space.

---

## The checklist

1. **Provision an auth user for the new agent.** Extend `scripts/provision-agents.ts` with
   a new entry so the bot identity is created idempotently alongside the existing Coach,
   Organizer, and Buddy identities.
2. **Insert a row in `public.agent_definitions`.** Fields: `slug`, `mention_handle`
   (globally unique — enforced by the Phase 4 case-insensitive index), `display_name`,
   `avatar_url`, `response_timeout_ms`, `auth_user_id`.
3. **Bind the agent to one or more bubbles** via `public.bubble_agent_bindings`. Pick
   `sort_order` carefully — the client lists agents in this order, and the resolver's
   positional "first mention wins" rule uses it.
4. **Confirm the surface-component `contextDefaultAgentSlug` wiring** if this agent should
   be the *default* when the user types a plain message (no `@mention`). For Phase 4, the
   default is hardcoded to `'coach'` in `src/components/chat/ChatArea.tsx` and
   `src/components/modals/task-modal/TaskModalCommentsPanel.tsx`. Both are on the
   lint-allowlist; do not inline the slug elsewhere.
5. **Verify** by sending a plain message and an `@<handle>` message in the bound bubble.
   The typing indicator's `data-pending-slug` attribute and `img src` should match.

---

## Worked example: add a `RecipeCoach` with handle `@RecipeCoach`

### 1. Provision the auth user

Edit `scripts/provision-agents.ts` and add:

```ts
const AGENTS: readonly AgentSpec[] = [
  // ...existing entries...
  {
    slug: 'recipe_coach',
    email: 'bubble-agent-recipe-coach@system.buddybubble.local',
    displayName: 'Recipe Coach',
    mentionHandle: 'RecipeCoach',
  },
];
```

Then run:

```sh
pnpm db:provision-agents
```

This creates the auth user and inserts a row in `public.users` with `is_agent = true`.

### 2. Insert the `agent_definitions` row

Write a migration like `supabase/migrations/<timestamp>_add_recipe_coach.sql`:

```sql
-- Provision a RecipeCoach agent (see scripts/provision-agents.ts for the auth.users side).
-- IMPORTANT: mention_handle must be globally unique (case-insensitive). The Phase 4 index
-- at `agent_definitions_mention_handle_lower_idx` rejects collisions at insert time.

insert into public.agent_definitions (
  slug,
  mention_handle,
  display_name,
  avatar_url,
  auth_user_id,
  is_active,
  response_timeout_ms
)
select
  'recipe_coach',
  'RecipeCoach',
  'Recipe Coach',
  '/brand/BuddyBubble-RecipeCoach-mark.svg',
  u.id,
  true,
  60000
from public.users u
where u.email = 'bubble-agent-recipe-coach@system.buddybubble.local'
on conflict (slug) do update set
  mention_handle    = excluded.mention_handle,
  display_name      = excluded.display_name,
  avatar_url        = excluded.avatar_url,
  response_timeout_ms = excluded.response_timeout_ms;
```

### 3. Bind to bubbles

For every bubble where `RecipeCoach` should answer, add a row:

```sql
-- Bind RecipeCoach to the "Recipes" workspace's main bubble.
insert into public.bubble_agent_bindings (bubble_id, agent_definition_id, enabled, sort_order)
select
  b.id,
  ad.id,
  true,
  10
from public.bubbles b
cross join public.agent_definitions ad
where b.name = 'Recipes Main' -- replace with the real predicate
  and ad.slug = 'recipe_coach'
on conflict (bubble_id, agent_definition_id) do update set
  enabled    = excluded.enabled,
  sort_order = excluded.sort_order;
```

`sort_order` matters: the client resolver orders `availableAgents` by `sort_order` asc,
then slug. A lower number in a bubble that also has `@Coach` means RecipeCoach will win
when the user types just `@Coach` only if handles collide — but since `mention_handle`
is globally unique, what it really controls is list display order and which agent the
surface default resolves to when `contextDefaultAgentSlug` matches.

### 4. Surface default wiring

`contextDefaultAgentSlug` is intentionally hardcoded at the surface-component level:

- `src/components/chat/ChatArea.tsx`: `CHAT_AREA_DEFAULT_AGENT_SLUG = 'coach'`.
- `src/components/modals/task-modal/TaskModalCommentsPanel.tsx`:
  `TASK_COMMENTS_DEFAULT_AGENT_SLUG = 'coach'`.

These are the **only** two files on the lint allowlist for the literal `'coach'` as a
slug. Do NOT branch on `surface === 'recipes'` inside these components. If you need the
default to change per workspace / per-bubble, introduce a `contextDefaultAgentSlug` prop
or a workspace-scoped setting; do not grow slug literals in other files.

For Phase 4, `RecipeCoach` is NOT the default anywhere — users must `@RecipeCoach`
explicitly. That keeps the surface-component hardcode stable.

### 5. Verify

```text
1. Open the Recipes bubble in the UI.
2. Type `@RecipeCoach what should I cook tonight` and send.
3. The typing indicator appears with `data-pending-slug="recipe_coach"` and the branded
   RecipeCoach avatar.
4. The agent replies within `response_timeout_ms`; if it does not, the indicator clears
   and `agent.response.timeout` logs with `agentSlug: 'recipe_coach'`.
```

Any *dispatch* logic (Gemini prompts, RPC calls, Kanban card creation) is OUT OF SCOPE
for this doc; a new coach either reuses `bubble-agent-dispatch` (for fitness-style
behavior) or gets its own `<slug>-agent-dispatch` function following the pattern at
`supabase/functions/organizer-agent-dispatch/`.

---

## Why this is easy now

Phases 1–4 removed every hardcoded `'coach'` / `'buddy'` / `'organizer'` reference from
the routing layer. The resolver, typing indicator, avatar resolver, and pending-wait
hook are all data-driven from `agent_definitions` and `bubble_agent_bindings`. Adding a
new coach is a DB migration, not a code change — and the lint rule at
`scripts/check-agent-coupling.ts` keeps it that way.
