/**
 * Re-export shim for the Organizer system prompt (Phase 4 fold).
 *
 * Canonical source of truth lives at `src/lib/agents/organizer/prompts.ts`. The
 * byte-for-byte Deno mirror lives at
 * `supabase/functions/agents/organizer/prompts.ts`, which this file re-exports from.
 *
 * The legacy dispatcher (`./index.ts`) keeps importing `organizerSystemPrompt` from
 * this path, so its behavior is unchanged. The legacy dispatcher is going idle in
 * Phase 4 (the `organizer_dispatch_webhook` is disabled when v2 picks up Organizer);
 * Phase 6 deletes the entire `organizer-agent-dispatch/` directory cleanly. Cross-
 * function imports under `supabase/functions/` are supported by the Edge Functions
 * bundler (the Coach v2 strategy uses the same pattern via `_shared/`).
 */

export { organizerSystemPrompt } from '../agents/organizer/prompts.ts';
