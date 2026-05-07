/**
 * Routing resolver for the consolidated dispatcher.
 *
 * Walks the registered strategies in deterministic order and returns the first one that
 * matches the trigger via:
 *   1. `routing.implicitTrigger(message)` — slug-agnostic sentinel match (e.g. Coach
 *      workout-context). Mirrors `bubble-agent-dispatch/index.ts:1479-1544`.
 *   2. `routing.acceptMention` + `findFirstMentionedAgent` over the strategies' bound
 *      `agent_definitions.mention_handle`. Mirrors `bubble-agent-dispatch/index.ts:1376-1391`.
 *   3. `routing.acceptRootDefault` + `parseRootDefaultAgentSlug(message)` (only when
 *      `parent_id == null`). Mirrors `bubble-agent-dispatch/index.ts:1393-1404`.
 *   4. `routing.acceptThreadContinuation` via `findAuthoringAgentInThread` (lazy thread
 *      load). Mirrors `bubble-agent-dispatch/index.ts:1442-1459`.
 *
 * `requireBubbleBinding: true` strategies are filtered against the loaded
 * `bubble_agent_bindings` rows — strategies whose slug is not bound to the bubble do
 * not match. Returns the loaded `history` rows alongside the resolution so
 * `buildDispatchContext` does not double-query.
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

type AgentDefEmbed = {
  slug: string;
  display_name: string;
  mention_handle: string;
  auth_user_id: string;
  is_active: boolean;
};

type BindingRow = {
  sort_order: number;
  agent_definitions: AgentDefEmbed | AgentDefEmbed[] | null;
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
            data: BindingRow[] | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  };
};

function unwrapDef(row: BindingRow): AgentDefEmbed | null {
  const d = row.agent_definitions;
  const o = Array.isArray(d) ? d[0] : d;
  if (!o || typeof o !== 'object') return null;
  if (!o.auth_user_id || !o.display_name) return null;
  return o as AgentDefEmbed;
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

  const table = supabase.from('bubble_agent_bindings') as unknown as BindingsTable;
  const result = await table
    .select(
      'sort_order, agent_definitions ( slug, display_name, mention_handle, auth_user_id, is_active )',
    )
    .eq('bubble_id', message.bubble_id)
    .eq('enabled', true)
    .in('agent_definitions.slug', registeredSlugs)
    .order('sort_order', { ascending: true });

  if (result.error) {
    log('error', 'bindings query failed', {
      request_id: requestId,
      bubble_id: message.bubble_id,
      error: result.error.message,
    });
    return { skipped: true, reason: 'bindings_query_failed' };
  }

  const seenAuthIds = new Set<string>();
  const orderedDefs: AgentDef[] = [];
  for (const raw of result.data ?? []) {
    const def = unwrapDef(raw);
    if (!def?.is_active || !def.auth_user_id) continue;
    if (seenAuthIds.has(def.auth_user_id)) continue;
    seenAuthIds.add(def.auth_user_id);
    orderedDefs.push({
      slug: def.slug,
      auth_user_id: def.auth_user_id,
      mention_handle: def.mention_handle,
      display_name: def.display_name,
      is_active: def.is_active,
    });
  }

  // Cross-index strategies + their bound AgentDef rows so the per-rule walks below can
  // skip strategies that require a binding when one is missing.
  const defBySlug = new Map(orderedDefs.map((d) => [d.slug, d]));

  const buildResolved = (def: AgentDef): ResolvedAgent => ({
    slug: def.slug,
    auth_user_id: def.auth_user_id,
    mention_handle: def.mention_handle,
    display_name: def.display_name,
  });

  // Rule 1: implicit trigger.
  for (const strategy of registry) {
    if (!strategy.routing?.implicitTrigger) continue;
    if (!strategy.routing.implicitTrigger(message)) continue;
    if (strategy.routing.requireBubbleBinding && !defBySlug.has(strategy.slug)) continue;
    const def = defBySlug.get(strategy.slug);
    if (!def) continue;
    return { slug: strategy.slug, agent: buildResolved(def), history: null };
  }

  // Rule 2: mention.
  const mentionableAgents: AgentDef[] = [];
  const mentionStrategiesBySlug = new Map<string, AgentStrategy<unknown>>();
  for (const strategy of registry) {
    if (!strategy.routing?.acceptMention) continue;
    const def = defBySlug.get(strategy.slug);
    if (!def) {
      if (strategy.routing.requireBubbleBinding) continue;
      // Strategy doesn't require binding but still has no def → skip; no handle to match.
      continue;
    }
    mentionableAgents.push(def);
    mentionStrategiesBySlug.set(strategy.slug, strategy);
  }
  const mention = findFirstMentionedAgent(message.content, mentionableAgents);
  if (mention) {
    const strategy = mentionStrategiesBySlug.get(mention.slug);
    const exclude = strategy?.routing?.excludeOnMentionOf;
    if (
      !exclude ||
      !exclude.some((slug) =>
        defBySlug.get(slug)
          ? findFirstMentionedAgent(message.content, [defBySlug.get(slug)!]) != null
          : false,
      )
    ) {
      return { slug: mention.slug, agent: buildResolved(mention), history: null };
    }
  }

  // Rule 3: root default (parent_id == null only).
  if (message.parent_id == null) {
    const slug = parseRootDefaultAgentSlug(message);
    if (slug) {
      for (const strategy of registry) {
        if (strategy.slug !== slug) continue;
        if (!strategy.routing?.acceptRootDefault) continue;
        const def = defBySlug.get(strategy.slug);
        if (!def) continue;
        return { slug: strategy.slug, agent: buildResolved(def), history: null };
      }
    }
  }

  // Rule 4: thread continuation. Load history once, share with the caller.
  if (message.parent_id != null) {
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
    for (const strategy of registry) {
      if (!strategy.routing?.acceptThreadContinuation) continue;
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

  return { skipped: true, reason: 'no_strategy_matched' };
}
