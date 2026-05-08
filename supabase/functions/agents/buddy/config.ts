/**
 * MIRROR FILE — canonical lives at `src/lib/agents/buddy/config.ts`.
 *
 * Body below is byte-for-byte identical to the canonical Vitest-side file (excluding
 * this header). Any change must be hand-mirrored — run `pnpm check:agent-mirror` to
 * verify parity.
 *
 * No relative imports → import paths are identical between Node and Deno builds for
 * this module.
 */

/** Stable agent slug. Strategy modules are the only files allowed to hard-code this. */
export const BUDDY_SLUG = 'buddy' as const;

export const BUDDY_MODEL_DEFAULT = 'gemini-2.5-flash' as const;

export const BUDDY_TEMPERATURE = 0.4 as const;
export const BUDDY_MAX_OUTPUT_TOKENS = 1024 as const;

/** User-visible reply the dispatcher inserts when the LLM call fails. */
export const BUDDY_SAFE_REPLY_TEXT = 'I had trouble loading that just now. Mind trying once more?';

/**
 * Sentinel string the frontend silently inserts to wake Buddy up for onboarding.
 * Duplicated here (rather than re-exported from `_shared/dispatch/sentinel.ts`) so
 * pure Vitest tests can import this module without pulling in the dispatch types
 * surface. Identity is enforced by the parse test that asserts strict equality.
 */
export const BUDDY_ONBOARDING_SENTINEL = '[SYSTEM_EVENT: ONBOARDING_STARTED]' as const;

/**
 * User-turn text the strategy substitutes when the trigger row IS the onboarding
 * sentinel. Lifted verbatim from buddy-agent-dispatch/index.ts:452.
 */
export const BUDDY_IMPLICIT_TRIGGER_USER_TEXT =
  'The user just landed on this feature for the first time (implicit onboarding trigger). Greet them briefly, orient them, offer ONE concrete first step, and consider proposing a small starter card.';
