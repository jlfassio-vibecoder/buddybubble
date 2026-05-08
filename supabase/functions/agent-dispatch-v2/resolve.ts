/**
 * Routing resolver for the consolidated dispatcher.
 *
 * Walks the registered strategies in deterministic order and returns the first one that
 * matches the trigger via:
 *   1. `routing.implicitTrigger(message)` — slug-agnostic sentinel match (e.g. Coach
 *      workout-context, Buddy onboarding). Mirrors `bubble-agent-dispatch/index.ts:1479-1544`.
 *   2. `routing.acceptMention` + `findFirstMentionedAgent` over the strategies'
 *      `agent_definitions.mention_handle`. Mirrors `bubble-agent-dispatch/index.ts:1376-1391`.
 *   3. `routing.acceptRootDefault` + `parseRootDefaultAgentSlug(message)` (only when
 *      `parent_id == null`). Mirrors `bubble-agent-dispatch/index.ts:1393-1404`.
 *   4. `routing.acceptThreadContinuation`:
 *      - `parent_id != null` → thread-history walk via `findAuthoringAgentInThread`. Mirrors
 *        `bubble-agent-dispatch/index.ts:1442-1459`.
 *      - `parent_id == null` AND `continuationLookback === 'bubble'` → single bubble-scoped
 *        lookup of the immediate prior message; matches if the prior author is this
 *        strategy's agent. Mirrors `buddy-agent-dispatch/index.ts:170-186`.
 *
 * Phase 5 single-query split:
 *
 *   Query A (`agent_definitions`): selects every registered-slug definition row, no
 *   `bubble_agent_bindings` join. Workspace-global agents (Buddy) and exclusion-only
 *   agents (Coach when not bound to the bubble) both land here, so `excludeOnMentionOf`
 *   can always look up another strategy's mention handle.
 *
 *   Query B (`bubble_agent_bindings`): selects `sort_order` + slug only. Builds the
 *   `boundSortOrder` map. Strategies whose `routing.requireBubbleBinding === true` are
 *   gated on `boundSortOrder.has(slug)`; `requireBubbleBinding === false` strategies
 *   (Buddy) match without the gate.
 *
 *   Iteration order: bound strategies in `bindings.sort_order` ASC; unbound strategies
 *   in `REGISTRY_ITERATION_ORDER` declared order. Buddy is unbound and trails Coach +
 *   Organizer, matching the implicit "fitness bubble Coach > Organizer > Buddy" priority
 *   and keeping mention/continuation walks deterministic across deploys.
 */

import { loadThreadHistoryByParent } from '../_shared/dispatch/history.ts';
import { log } from '../_shared/obs/log.ts';
import {
  findAuthoringAgentInThread,
  findFirstMentionedAgent,
  parseRootDefaultAgentSlug,
} from '../_shared/dispatch/routing.ts';
import type {
  AgentDef,
  AgentStrategy,
  HistoryRow,
  NormalizedMessage,
  ResolvedAgent,
  SupabaseClient,
} from '../_shared/dispatch/types.ts';

type AgentDefRow = {
  slug: string;
  display_name: string;
  mention_handle: string;
  auth_user_id: string;
  is_active: boolean;
};

type AgentDefinitionsTable = {
  select: (columns: string) => {
    in: (
      column: string,
      values: unknown[],
    ) => {
      eq: (
        column: string,
        value: unknown,
      ) => Promise<{
        data: AgentDefRow[] | null;
        error: { message: string } | null;
      }>;
    };
  };
};

type BindingsRow = {
  sort_order: number;
  agent_definitions: { slug: string } | { slug: string }[] | null;
};

type BindingsTable = {
  select: (columns: string) => {
    eq: (
      column: string,
      value: unknown,
    ) => {
      eq: (
        column: string,
        value: unknown,
      ) => {
        in: (
          column: string,
          values: unknown[],
        ) => {
          order: (
            column: string,
            options: { ascending: boolean },
          ) => Promise<{
            data: BindingsRow[] | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  };
};

type PriorMessageRow = { id: string; user_id: string };

type PriorBubbleMessageTable = {
  select: (columns: string) => {
    eq: (
      column: string,
      value: unknown,
    ) => {
      neq: (
        column: string,
        value: unknown,
      ) => {
        order: (
          column: string,
          options: { ascending: boolean },
        ) => {
          limit: (n: number) => Promise<{
            data: PriorMessageRow[] | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  };
};

function unwrapBindingSlug(row: BindingsRow): string | null {
  const d = row.agent_definitions;
  const o = Array.isArray(d) ? d[0] : d;
  if (!o || typeof o !== 'object') return null;
  if (typeof o.slug !== 'string' || !o.slug) return null;
  return o.slug;
}

export type ResolveAgentInput = {
  supabase: SupabaseClient;
  message: NormalizedMessage;
  registry: ReadonlyArray<AgentStrategy<unknown>>;
  requestId: string;
};

export type ResolveAgentSuccess = {
  slug: string;
  agent: ResolvedAgent;
  /** Pre-loaded thread rows (oldest → newest) when the resolver had to fetch them. */
  history: HistoryRow[] | null;
};

export type ResolveAgentSkip = {
  skipped: true;
  reason: string;
};

/**
 * Resolve which strategy (if any) should handle this trigger. Returns null when no
 * strategy matched at all (caller responds 200 skip).
 */
export async function resolveAgent(
  input: ResolveAgentInput,
): Promise<ResolveAgentSuccess | ResolveAgentSkip | null> {
  const { supabase, message, registry, requestId } = input;
  if (!message.bubble_id) {
    return { skipped: true, reason: 'missing_bubble_id' };
  }

  const registeredSlugs = registry.map((s) => s.slug);
  if (registeredSlugs.length === 0) {
    return null;
  }

  // ---- Query A: every registered-slug definition (no bindings join). --------------
  // Required so Buddy (workspace-global, no bindings rows) and `excludeOnMentionOf`
  // targets that may not be bound to this bubble (e.g. Coach in a non-fitness bubble
  // where Buddy still wants to defer on `@Coach`) both have entries in `defBySlug`.
  const defsTable = supabase.from('agent_definitions') as unknown as AgentDefinitionsTable;
  const defsResult = await defsTable
    .select('slug, display_name, mention_handle, auth_user_id, is_active')
    .in('slug', registeredSlugs)
    .eq('is_active', true);
  if (defsResult.error) {
    log('error', 'agent_definitions query failed', {
      request_id: requestId,
      bubble_id: message.bubble_id,
      error: defsResult.error.message,
    });
    return { skipped: true, reason: 'agent_definitions_query_failed' };
  }

  const defBySlug = new Map<string, AgentDef>();
  for (const row of defsResult.data ?? []) {
    if (!row.is_active || !row.auth_user_id || !row.slug) continue;
    if (defBySlug.has(row.slug)) continue;
    defBySlug.set(row.slug, {
      slug: row.slug,
      auth_user_id: row.auth_user_id,
      mention_handle: row.mention_handle,
      display_name: row.display_name,
      is_active: row.is_active,
    });
  }

  // ---- Query B: bubble_agent_bindings (slug + sort_order only). -------------------
  // Builds the `boundSortOrder` map used both for the iteration walk order and for
  // gating `requireBubbleBinding === true` strategies.
  const bindingsTable = supabase.from('bubble_agent_bindings') as unknown as BindingsTable;
  const bindingsResult = await bindingsTable
    .select('sort_order, agent_definitions ( slug )')
    .eq('bubble_id', message.bubble_id)
    .eq('enabled', true)
    .in('agent_definitions.slug', registeredSlugs)
    .order('sort_order', { ascending: true });

  if (bindingsResult.error) {
    log('error', 'bindings query failed', {
      request_id: requestId,
      bubble_id: message.bubble_id,
      error: bindingsResult.error.message,
    });
    return { skipped: true, reason: 'bindings_query_failed' };
  }

  /** Bound strategies in `bindings.sort_order` ASC. Gates `requireBubbleBinding`. */
  const boundSlugsInOrder: string[] = [];
  const boundSlugSet = new Set<string>();
  for (const raw of bindingsResult.data ?? []) {
    const slug = unwrapBindingSlug(raw);
    if (!slug) continue;
    if (boundSlugSet.has(slug)) continue;
    if (!defBySlug.has(slug)) continue;
    boundSlugSet.add(slug);
    boundSlugsInOrder.push(slug);
  }

  // ---- Build the iteration order. ------------------------------------------------
  // Bound strategies first (sort_order ASC), then unbound strategies in registry order.
  const strategyBySlug = new Map<string, AgentStrategy<unknown>>(registry.map((s) => [s.slug, s]));
  const iterationOrder: AgentStrategy<unknown>[] = [];
  for (const slug of boundSlugsInOrder) {
    const strat = strategyBySlug.get(slug);
    if (strat) iterationOrder.push(strat);
  }
  for (const strat of registry) {
    if (boundSlugSet.has(strat.slug)) continue;
    iterationOrder.push(strat);
  }

  /** True iff the strategy passes its `requireBubbleBinding` gate against this bubble. */
  const passesBindingGate = (strategy: AgentStrategy<unknown>): boolean => {
    if (!strategy.routing?.requireBubbleBinding) return true;
    return boundSlugSet.has(strategy.slug);
  };

  const buildResolved = (def: AgentDef): ResolvedAgent => ({
    slug: def.slug,
    auth_user_id: def.auth_user_id,
    mention_handle: def.mention_handle,
    display_name: def.display_name,
  });

  // Rule 1: implicit trigger.
  for (const strategy of iterationOrder) {
    if (!strategy.routing?.implicitTrigger) continue;
    if (!strategy.routing.implicitTrigger(message)) continue;
    if (!passesBindingGate(strategy)) continue;
    const def = defBySlug.get(strategy.slug);
    if (!def) continue;
    return { slug: strategy.slug, agent: buildResolved(def), history: null };
  }

  // Rule 2: mention.
  const mentionableAgents: AgentDef[] = [];
  const mentionStrategiesBySlug = new Map<string, AgentStrategy<unknown>>();
  for (const strategy of iterationOrder) {
    if (!strategy.routing?.acceptMention) continue;
    if (!passesBindingGate(strategy)) continue;
    const def = defBySlug.get(strategy.slug);
    if (!def) continue;
    mentionableAgents.push(def);
    mentionStrategiesBySlug.set(strategy.slug, strategy);
  }
  const mention = findFirstMentionedAgent(message.content, mentionableAgents);
  if (mention) {
    const strategy = mentionStrategiesBySlug.get(mention.slug);
    const exclude = strategy?.routing?.excludeOnMentionOf;
    // Exclusion lookup uses `defBySlug` (always present for any registered slug),
    // NOT `boundSlugSet` — Buddy must still defer on `@Coach` even when Coach is not
    // bound to this bubble. Mirrors `buddy-agent-dispatch/index.ts:391-397`.
    if (
      !exclude ||
      !exclude.some((slug) => {
        const otherDef = defBySlug.get(slug);
        return otherDef ? findFirstMentionedAgent(message.content, [otherDef]) != null : false;
      })
    ) {
      return { slug: mention.slug, agent: buildResolved(mention), history: null };
    }
  }

  // Rule 3: root default (parent_id == null only).
  if (message.parent_id == null) {
    const slug = parseRootDefaultAgentSlug(message);
    if (slug) {
      for (const strategy of iterationOrder) {
        if (strategy.slug !== slug) continue;
        if (!strategy.routing?.acceptRootDefault) continue;
        if (!passesBindingGate(strategy)) continue;
        const def = defBySlug.get(strategy.slug);
        if (!def) continue;
        return { slug: strategy.slug, agent: buildResolved(def), history: null };
      }
    }
  }

  // Rule 4: thread continuation.
  if (message.parent_id != null) {
    // 4a: parent_id present → walk the loaded thread history.
    const threadId = message.parent_id;
    const historyResult = await loadThreadHistoryByParent(
      supabase,
      message.bubble_id,
      message.id,
      threadId,
    );
    if (historyResult.error) {
      log('warn', 'thread continuation history load failed', {
        request_id: requestId,
        bubble_id: message.bubble_id,
        message_id: message.id,
        error: historyResult.error,
      });
    }
    const rows = historyResult.rows;
    for (const strategy of iterationOrder) {
      if (!strategy.routing?.acceptThreadContinuation) continue;
      if (!passesBindingGate(strategy)) continue;
      const def = defBySlug.get(strategy.slug);
      if (!def) continue;
      const agentAuthIds = new Set([def.auth_user_id]);
      const match = findAuthoringAgentInThread(rows, agentAuthIds, [def]);
      if (match) {
        return { slug: strategy.slug, agent: buildResolved(match), history: rows };
      }
    }
    return { skipped: true, reason: 'no_strategy_matched' };
  }

  // 4b: parent_id == null → strategies opting into `continuationLookback === 'bubble'`
  // get a single bubble-scoped lookup of the immediate prior message. Memoized so
  // multiple opt-in strategies share the same query.
  let priorAuthorId: string | null | undefined; // undefined = not fetched yet
  for (const strategy of iterationOrder) {
    if (!strategy.routing?.acceptThreadContinuation) continue;
    if (strategy.routing.continuationLookback !== 'bubble') continue;
    if (!passesBindingGate(strategy)) continue;
    const def = defBySlug.get(strategy.slug);
    if (!def) continue;

    if (priorAuthorId === undefined) {
      const priorTable = supabase.from('messages') as unknown as PriorBubbleMessageTable;
      const priorResult = await priorTable
        .select('id, user_id')
        .eq('bubble_id', message.bubble_id)
        .neq('id', message.id)
        .order('created_at', { ascending: false })
        .limit(2);
      if (priorResult.error) {
        log('warn', 'bubble continuation prior message lookup failed', {
          request_id: requestId,
          bubble_id: message.bubble_id,
          message_id: message.id,
          error: priorResult.error.message,
        });
        priorAuthorId = null;
      } else {
        const prev = (priorResult.data ?? [])[0];
        priorAuthorId = prev?.user_id ?? null;
      }
    }

    if (priorAuthorId && priorAuthorId === def.auth_user_id) {
      return { slug: strategy.slug, agent: buildResolved(def), history: null };
    }
  }

  return { skipped: true, reason: 'no_strategy_matched' };
}
