/**
 * Agent strategy registry — Deno-only.
 *
 * The dispatcher (`agent-dispatch-v2/index.ts`) imports `REGISTRY` and `getStrategy`
 * exclusively. Each strategy lives under its own slug-namespaced subfolder so future
 * agent additions land as a single new entry plus an import here.
 *
 * Iteration order matches the Phase 1 ordering contract from
 * `src/lib/agents/sortAgentEntries.ts` (sort_order ASC, slug ASC tiebreaker), which
 * is also what the resolver applies via `bubble_agent_bindings.sort_order` in
 * `agent-dispatch-v2/resolve.ts`. The Phase 5 resolver refactor sources iteration
 * order from `bubble_agent_bindings.sort_order` for bound strategies, then falls
 * back to this declared order for unbound (workspace-global) strategies.
 *
 * Coach lists first because production `bubble_agent_bindings.sort_order` puts Coach
 * ahead of Organizer in fitness bubbles where both are bound; Organizer-only bubbles
 * are unaffected by the order. Buddy trails both because it is workspace-global
 * (no `bubble_agent_bindings` row) — the resolver appends unbound strategies after
 * the bound ones, and listing Buddy last keeps mention / continuation walks
 * deterministic without inventing an artificial sort key for it.
 */

import type { AgentStrategy } from '../_shared/dispatch/types.ts';

import { BuddyStrategy } from './buddy/strategy.ts';
import { CoachStrategy } from './coach/strategy.ts';
import { OrganizerStrategy } from './organizer/strategy.ts';

export const REGISTRY = {
  [CoachStrategy.slug]: CoachStrategy,
  [OrganizerStrategy.slug]: OrganizerStrategy,
  [BuddyStrategy.slug]: BuddyStrategy,
} as const;

export type RegistryKey = keyof typeof REGISTRY;

/**
 * Iteration order across registered strategies. Deterministic across deploys so the
 * dispatcher's mention / thread-continuation walks always produce the same first match
 * given the same inputs.
 */
export const REGISTRY_ITERATION_ORDER: ReadonlyArray<AgentStrategy<unknown>> = [
  CoachStrategy as unknown as AgentStrategy<unknown>,
  OrganizerStrategy as unknown as AgentStrategy<unknown>,
  BuddyStrategy as unknown as AgentStrategy<unknown>,
];

/**
 * Resolve a strategy by slug. Returns null when the slug is unknown so the dispatcher
 * can decide between a 200 skip and a hard error. The cast to `AgentStrategy<unknown>`
 * widens the per-strategy parsed type — the dispatcher only consumes the contract
 * surface (preflight, buildSystemPrompt, parse, etc.) generically.
 */
export function getStrategy(slug: string): AgentStrategy<unknown> | null {
  const entry = (REGISTRY as Record<string, AgentStrategy<unknown> | undefined>)[slug];
  return entry ?? null;
}
