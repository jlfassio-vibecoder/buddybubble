/**
 * Deterministic agent ordering contract (shared between `useMessageThread` and any future
 * surfaces that list agents).
 *
 * Sort order:
 *   1. `bubble_agent_bindings.sort_order` ASC (primary)
 *   2. `agent_definitions.slug` ASC (stable tiebreaker)
 *
 * Consumers must NEVER rely on array index for identity — always look up by slug via
 * `agentsByAuthUserId`. The ordering is exposed only so that sweeps (server-side mention
 * parsing, realtime dedupe, rendered team-member lists) have a reproducible iteration
 * order that doesn't depend on insertion or Postgres row order.
 *
 * Workspace-global agents that do NOT have a `bubble_agent_bindings` row (e.g. Buddy) are
 * assigned `UNBOUND_AGENT_SORT_ORDER` by callers so they always sort AFTER bubble-bound
 * agents with any finite `sort_order`.
 */
export const UNBOUND_AGENT_SORT_ORDER = Number.MAX_SAFE_INTEGER;

export type AgentOrderingEntry<TDef extends { slug: string; auth_user_id: string }> = {
  sortOrder: number;
  def: TDef;
};

export function sortAgentEntries<
  T extends AgentOrderingEntry<{ slug: string; auth_user_id: string }>,
>(entries: readonly T[]): T[] {
  return [...entries].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.def.slug.localeCompare(b.def.slug);
  });
}
