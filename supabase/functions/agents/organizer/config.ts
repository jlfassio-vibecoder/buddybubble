/**
 * MIRROR FILE — canonical lives at `src/lib/agents/organizer/config.ts`.
 *
 * Body below is byte-for-byte identical to the canonical Vitest-side file (excluding
 * this header). Any change must be hand-mirrored. Phase 7 will add a drift-detection
 * lint to enforce parity.
 *
 * No relative imports → import paths are identical between Node and Deno builds for
 * this module.
 */

/** Stable agent slug. Strategy modules are the only files allowed to hard-code this. */
export const ORGANIZER_SLUG = 'organizer' as const;

export const ORGANIZER_MODEL_DEFAULT = 'gemini-2.5-flash' as const;

export const ORGANIZER_TEMPERATURE = 0.3 as const;
export const ORGANIZER_MAX_OUTPUT_TOKENS = 1024 as const;

/** User-visible reply the dispatcher inserts when the LLM call fails. */
export const ORGANIZER_SAFE_REPLY_TEXT =
  'I had trouble compiling that meeting note. Can you say it again?';
