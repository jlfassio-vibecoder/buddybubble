/**
 * Re-export shim for the Organizer system prompt fixture.
 *
 * Phase 4 fold (see `docs/refactor/vertex-agent-dispatch-consolidation/phase-4-organizer-strategy-port.md`):
 * the canonical prompt now lives at `src/lib/agents/organizer/prompts.ts`. This
 * file remains as a re-export so `src/lib/agents/organizerResponse.test.ts` keeps
 * importing `organizerSystemPromptMirror` from the historical path without
 * modification, structurally eliminating the byte-for-byte drift previously
 * documented in `docs/refactor/phase4-deviation-log.md:39-50`.
 *
 * The Deno mirror that powers the runtime lives at
 * `supabase/functions/agents/organizer/prompts.ts`, which is byte-for-byte identical
 * to the canonical. Phase 7 will add a drift-detection lint to enforce parity.
 */

export { organizerSystemPrompt as organizerSystemPromptMirror } from './organizer/prompts';
