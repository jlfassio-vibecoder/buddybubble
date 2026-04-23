# Adding an Organizer variant

Organizer is currently a single global agent wired to `organizer-agent-dispatch`. If
Organizer becomes per-bubble-configurable (e.g. a workspace wants its own
`@DesignOrganizer` that reads a private agenda store), the flow is analogous to adding
a Coach — see `docs/agents/adding-a-coach.md` — except the webhook side routes to
`organizer-agent-dispatch` rather than `bubble-agent-dispatch`.

## Differences from adding a Coach

1. **Dispatcher selection.** A new slug that should behave like Organizer (meeting
   coordinator, human-in-the-loop writes, no fitness advice) points at
   `organizer-agent-dispatch`. A new Coach-style slug points at `bubble-agent-dispatch`.
   Today this is controlled at the DB webhook level (one row per Supabase Dashboard
   webhook per function). No code change is required to add an Organizer variant;
   however, `organizer-agent-dispatch` currently resolves a single active row where
   `slug = 'organizer'`. Supporting multiple Organizer slugs will require extending that
   lookup to accept any slug in an allowlist (e.g. `slug LIKE 'organizer%'` or a
   dedicated `organizer_class` column). Do NOT hardcode additional slug strings in the
   function — extend the DB lookup.

2. **RPC identity check.** `organizer_create_reply_and_task` validates that
   `p_organizer_user_id` maps to a row with `slug = 'organizer'`. A new variant needs
   the RPC's identity check relaxed to an allowlist or moved to a boolean column (e.g.
   `public.agent_definitions.is_organizer_class = true`). The migration should keep the
   check as an explicit predicate — do NOT remove the identity check.

3. **Prompt.** `organizerPrompt.ts` is Organizer's scope contract (meetings only, no
   fitness advice). A variant either reuses it verbatim or ships a sibling prompt file
   in the same function. Do NOT merge Organizer's prompt with Coach's or Buddy's —
   scope isolation is the whole point.

## The quick flow

1. Provision the auth user in `scripts/provision-agents.ts`.
2. Insert a row in `public.agent_definitions` with a globally-unique `mention_handle`.
3. Bind to bubbles via `public.bubble_agent_bindings`.
4. Extend `organizer-agent-dispatch`'s `agent_definitions` lookup to cover the new
   slug(s). Mirror the change in `organizer_create_reply_and_task`'s identity check.
5. Verify via E2E: `@<NewHandle> schedule standup` → meeting-scoped reply, no fitness
   content.

## What NOT to do

- Do not create a new Edge Function per Organizer variant unless the prompt / RPC
  surface genuinely diverges. One function, one RPC, one prompt is the happy path.
- Do not hardcode variant slugs in the client resolver or typing indicator. All
  routing is driven by `agent_definitions` + `bubble_agent_bindings`; that invariant
  is enforced by the `scripts/check-agent-coupling.ts` lint rule.
- Do not re-enable silent writes as part of a variant rollout. Organizer's
  human-in-the-loop confirmation contract (`ORGANIZER_WRITES_ENABLED=false` by
  default) applies to every Organizer variant until the UI confirmation flow ships.
