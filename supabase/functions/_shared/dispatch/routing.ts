/**
 * Slug-agnostic routing primitives shared by every agent strategy.
 *
 * No agent slug strings are hard-coded here. Strategies declare their slug + opt-ins via
 * `RoutingDescriptor` (see `_shared/dispatch/types.ts`); this module supplies the
 * composable predicates the dispatcher applies to those descriptors.
 *
 * - `mentionsHandle` — ported from `supabase/functions/buddy-agent-dispatch/index.ts:99-114`
 *   so the case-insensitive, word-bounded `@<handle>` match continues to behave the
 *   same for every `mention_handle`.
 * - `parseRootDefaultAgentSlug` — ported from
 *   `supabase/functions/bubble-agent-dispatch/index.ts:102-109`.
 */

import type { AgentDef, HistoryRow, NormalizedMessage, SupabaseClient } from './types.ts';

/** Escape a string for use as a regex literal (no character classes, no quantifiers). */
export function escapeRegExpLiteral(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Word-bounded, case-insensitive `@<handle>` check. Mirrors the client resolver at
 * `src/lib/agents/resolveTargetAgent.ts` so "@BuddyBubble" or "you@buddy.example.com"
 * do not false-positive, and "@BUDDY" / "@Buddy" both match.
 */
export function mentionsHandle(content: string | null | undefined, handle: string): boolean {
  if (!content || !handle) return false;
  const re = new RegExp(`(^|[^\\w])@${escapeRegExpLiteral(handle)}(?!\\w)`, 'i');
  return re.test(content);
}

/**
 * Read `record.metadata.default_agent_slug` if the message author opted into
 * root-default routing. The slug returned is whatever string the metadata carried
 * (lowercased, trimmed). The dispatcher decides whether any registered strategy claims
 * that slug — this helper does NOT validate against the registry.
 */
export function parseRootDefaultAgentSlug(record: NormalizedMessage): string | null {
  const m = record.metadata;
  if (m == null || typeof m !== 'object' || Array.isArray(m)) return null;
  const v = (m as Record<string, unknown>).default_agent_slug;
  if (typeof v !== 'string') return null;
  const trimmed = v.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Return the first agent in `agents` whose `mention_handle` appears in `content`.
 * Iteration order is the array order — caller controls priority by ordering.
 */
export function findFirstMentionedAgent(
  content: string | null | undefined,
  agents: ReadonlyArray<AgentDef>,
): AgentDef | null {
  if (!content) return null;
  for (const agent of agents) {
    if (!agent.is_active) continue;
    if (mentionsHandle(content, agent.mention_handle)) return agent;
  }
  return null;
}

/**
 * Return the most-recent agent that authored a message in this thread, given the set of
 * agent `auth_user_id`s. Used for "thread continuation" routing when the user replies
 * inside a thread without re-mentioning the agent.
 *
 * Inputs:
 *   - `rows` ordered oldest → newest (caller must guarantee this; matches
 *     `loadThreadHistoryByParent` ordering).
 *   - `agentAuthIds` set of `agent_definitions.auth_user_id` values to consider.
 */
export function findAuthoringAgentInThread(
  rows: ReadonlyArray<HistoryRow>,
  agentAuthIds: ReadonlySet<string>,
  agents: ReadonlyArray<AgentDef>,
): AgentDef | null {
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    if (!agentAuthIds.has(row.user_id)) continue;
    const match = agents.find((a) => a.auth_user_id === row.user_id && a.is_active);
    if (match) return match;
  }
  return null;
}

/**
 * True if `bubble_agent_bindings` has an enabled row binding `slug` to `bubbleId` and
 * the joined `agent_definitions` row is active. Used by strategies (Organizer today)
 * that require explicit per-bubble enablement. Mirrors the legacy join at
 * `supabase/functions/organizer-agent-dispatch/index.ts:478-485` so RLS / column
 * coverage stays identical.
 *
 * Returns `{ bound: false, error }` on lookup failure so the caller can log + skip
 * without throwing. Returns `{ bound: false }` when no row matched.
 */
export type BubbleBindingResult = { bound: true } | { bound: false; error?: string };

type BubbleBindingsTable = {
  select: (columns: string) => {
    eq: (
      column: string,
      value: unknown,
    ) => {
      eq: (
        column: string,
        value: unknown,
      ) => {
        eq: (
          column: string,
          value: unknown,
        ) => {
          eq: (
            column: string,
            value: unknown,
          ) => {
            maybeSingle: () => Promise<{
              data: unknown;
              error: { message: string } | null;
            }>;
          };
        };
      };
    };
  };
};

export async function bubbleHasBindingForSlug(
  supabase: SupabaseClient,
  bubbleId: string,
  slug: string,
): Promise<BubbleBindingResult> {
  const table = supabase.from('bubble_agent_bindings') as unknown as BubbleBindingsTable;
  const result = await table
    .select('agent_definitions!inner(slug, is_active, auth_user_id)')
    .eq('bubble_id', bubbleId)
    .eq('enabled', true)
    .eq('agent_definitions.slug', slug)
    .eq('agent_definitions.is_active', true)
    .maybeSingle();
  if (result.error) {
    return { bound: false, error: result.error.message };
  }
  return { bound: result.data != null };
}
