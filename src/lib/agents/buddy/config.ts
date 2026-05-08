/**
 * Buddy agent configuration constants.
 *
 * Canonical Vitest-side home; mirrored byte-for-byte at
 * `supabase/functions/agents/buddy/config.ts` (Deno). Strategy modules are the
 * only files allowed to hard-code the slug literal.
 *
 * Lift map:
 *   - model + generation params: buddy-agent-dispatch/index.ts:440-449, :470-477
 *   - safe reply text: new for the consolidated dispatcher (legacy Buddy had no
 *     equivalent fallback — it returned 200 + { ok: false, error: ... } and never
 *     wrote a user-visible reply on LLM failure). Phase 5 adds one for parity with
 *     Coach/Organizer.
 *   - implicit-trigger user-turn text: buddy-agent-dispatch/index.ts:451-453.
 *   - onboarding sentinel string: buddy-agent-dispatch/index.ts:123 (mirrored to
 *     `_shared/dispatch/sentinel.ts:ONBOARDING_SYSTEM_EVENT`).
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
