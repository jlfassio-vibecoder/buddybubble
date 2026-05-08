/**
 * Re-export shim for the Buddy system prompt (Phase 5 fold).
 *
 * Canonical source of truth lives at `src/lib/agents/buddy/prompts.ts`. The
 * byte-for-byte Deno mirror lives at `supabase/functions/agents/buddy/prompts.ts`,
 * which this file re-exports from.
 *
 * The legacy dispatcher (`./index.ts`) keeps importing `buddySystemPrompt` from this
 * path, so its behavior is unchanged. The legacy dispatcher is going idle in Phase 5
 * (the `buddy_dispatch_webhook` is disabled when v2 picks up Buddy); Phase 6 deletes
 * the entire `buddy-agent-dispatch/` directory cleanly. Cross-function imports under
 * `supabase/functions/` are supported by the Edge Functions bundler (the Coach +
 * Organizer v2 strategies use the same pattern via `_shared/` and `agents/`).
 */

export { buddySystemPrompt } from '../agents/buddy/prompts.ts';
