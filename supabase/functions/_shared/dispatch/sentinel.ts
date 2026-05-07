/**
 * Slug-agnostic sentinel detection used by the consolidated dispatcher.
 *
 * "Sentinel" messages are special internal messages the frontend silently inserts to
 * trigger an agent without showing the trigger to the user (the agent's reply IS shown).
 * Two are in production today:
 *
 *   - Buddy onboarding: `[SYSTEM_EVENT: ONBOARDING_STARTED]` exact-match content.
 *     Source: `supabase/functions/buddy-agent-dispatch/index.ts:123` and the frontend
 *     emitter that mirrors the same string.
 *   - Coach workout-context: `metadata.is_silent_sentinel === true` plus
 *     `metadata.workout_context.source === 'workout_player'`. The legacy magic-string
 *     `[SYSTEM_EVENT: WORKOUT_CONTEXT]` is the pre-metadata fallback that may still
 *     exist in older thread history. Source:
 *     `supabase/functions/bubble-agent-dispatch/index.ts:115-136`.
 *
 * Strategies wire these in via `RoutingDescriptor.implicitTrigger`. This module owns no
 * slug strings — it cannot know which strategy claims a sentinel.
 */

import type { HistoryRow, NormalizedMessage } from './types.ts';

export const ONBOARDING_SYSTEM_EVENT = '[SYSTEM_EVENT: ONBOARDING_STARTED]';
export const WORKOUT_CONTEXT_LEGACY_SENTINEL = '[SYSTEM_EVENT: WORKOUT_CONTEXT]';

/** Exact-match content sentinel check. Trims content; case-sensitive. */
export function isExactSentinel(
  message: Pick<NormalizedMessage, 'content'>,
  sentinel: string,
): boolean {
  const c = message.content;
  if (typeof c !== 'string') return false;
  return c.trim() === sentinel;
}

function asMetadataObject(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

/**
 * Workout-player open sentinel: source of truth is the metadata-first contract from
 * `bubble-agent-dispatch/index.ts:119-126`. Returns true on the metadata signal regardless
 * of `content` so legacy callers that no longer emit the magic string still classify.
 */
export function isWorkoutContextSentinel(
  message: Pick<NormalizedMessage, 'content' | 'metadata'>,
): boolean {
  const m = asMetadataObject(message.metadata);
  if (!m) return false;
  if (m.is_silent_sentinel !== true) return false;
  const wctx = asMetadataObject(m.workout_context);
  if (!wctx) return false;
  return wctx.source === 'workout_player';
}

/**
 * Exclude workout-context sentinels from Gemini history. Matches both the metadata
 * contract and the legacy magic-string format so partially-backfilled threads stay
 * compatible with the prompt builder.
 *
 * Mirrors `shouldExcludeWorkoutSentinelFromHistory` at
 * `supabase/functions/bubble-agent-dispatch/index.ts:129-136`.
 */
export function shouldExcludeWorkoutSentinelFromHistory(
  row: Pick<HistoryRow, 'content' | 'metadata'>,
): boolean {
  if (isWorkoutContextSentinel(row)) return true;
  const c = row.content;
  return typeof c === 'string' && c.trim() === WORKOUT_CONTEXT_LEGACY_SENTINEL;
}

/**
 * Exclude Buddy's onboarding sentinel from Gemini history so the model does not see
 * the trigger string itself in its replay of the thread. Symmetric with the workout
 * helper above; Buddy uses the exact-match content variant.
 */
export function shouldExcludeBuddyOnboardingFromHistory(row: Pick<HistoryRow, 'content'>): boolean {
  return isExactSentinel(row, ONBOARDING_SYSTEM_EVENT);
}
