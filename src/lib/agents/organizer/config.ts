/**
 * Organizer agent configuration constants.
 *
 * Canonical Vitest-side home; mirrored byte-for-byte at
 * `supabase/functions/agents/organizer/config.ts` (Deno). Strategy modules are the
 * only files allowed to hard-code the slug literal.
 *
 * Lift map:
 *   - model + generation params: organizer-agent-dispatch/index.ts:511-520, :536-541
 *   - safe reply text: new for the consolidated dispatcher (Organizer had no
 *     equivalent fallback before; the v2 dispatcher inserts this when the LLM call
 *     is fallback-eligible per `_shared/llm/vertex-gemini.ts:classifyError`).
 */

export const ORGANIZER_SLUG = 'organizer' as const;

export const ORGANIZER_MODEL_DEFAULT = 'gemini-2.5-flash' as const;

export const ORGANIZER_TEMPERATURE = 0.3 as const;
export const ORGANIZER_MAX_OUTPUT_TOKENS = 1024 as const;

/** User-visible reply the dispatcher inserts when the LLM call fails. */
export const ORGANIZER_SAFE_REPLY_TEXT =
  'I had trouble compiling that meeting note. Can you say it again?';
