/**
 * Re-export shim for Organizer's pure parsing + write-gating helpers.
 *
 * Phase 4 fold (see `docs/refactor/vertex-agent-dispatch-consolidation/phase-4-organizer-strategy-port.md`):
 * the canonical implementations now live at `src/lib/agents/organizer/parse.ts`. This
 * file is preserved as a re-export so `src/lib/agents/organizerResponse.test.ts` and
 * any in-tree consumers continue to import from the historical path without
 * modification, structurally eliminating the byte-for-byte drift previously
 * documented in `docs/refactor/phase4-deviation-log.md:39-50`.
 *
 * The mirror that powers the Deno runtime lives at
 * `supabase/functions/agents/organizer/parse.ts`. Phase 7 will add a drift-detection
 * lint to enforce parity between the canonical and the mirror.
 */

export {
  escapeRegExpLiteral,
  mentionsHandle,
  parseOrganizerResponse,
  gateOrganizerWrite,
  type OrganizerProposedWrite,
  type OrganizerParsedResponse,
} from './organizer/parse';
