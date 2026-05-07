/**
 * Agent strategy registry — Deno-only.
 *
 * The dispatcher (`agent-dispatch-v2/index.ts`) imports `REGISTRY` and `getStrategy`
 * exclusively. Each strategy lives under its own slug-namespaced subfolder so future
 * Phase 4 / Phase 5 work (Buddy, Organizer) can register without touching this file
 * beyond a single new entry.
 *
 * Iteration order matches the Phase 1 ordering contract from
 * `src/lib/agents/sortAgentEntries.ts` (sort_order ASC, slug ASC tiebreaker). Today
 * Coach is the sole entry, so the order is trivially `['coach']`.
 */

import type { AgentStrategy } from '../_shared/dispatch/types.ts';

import { CoachStrategy } from './coach/strategy.ts';

export const REGISTRY = {
  [CoachStrategy.slug]: CoachStrategy,
} as const;

export type RegistryKey = keyof typeof REGISTRY;

/**
 * Iteration order across registered strategies. Deterministic across deploys so the
 * dispatcher's mention / thread-continuation walks always produce the same first match
 * given the same inputs.
 */
export const REGISTRY_ITERATION_ORDER: ReadonlyArray<AgentStrategy<unknown>> = [
  CoachStrategy as unknown as AgentStrategy<unknown>,
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
