/**
 * Thread history loaders + Vertex `contents` mapper.
 *
 * Two loaders are exposed because Coach uses both today (the dispatcher picks one based
 * on whether the trigger row carries `target_task_id`). Reference port:
 * `supabase/functions/bubble-agent-dispatch/index.ts:1421-1438`.
 *
 * Both loaders SELECT the same column set every legacy dispatcher needs so the rows are
 * substitutable: `id, user_id, content, created_at, parent_id, target_task_id,
 * attached_task_id, metadata`.
 *
 * Both order results oldest → newest before returning, matching the order Vertex
 * `contents` expects and the order `findAuthoringAgentInThread` walks.
 */

import type { GeminiContent } from '../llm/types.ts';
import type { HistoryRow, SupabaseClient } from './types.ts';

const HISTORY_COLUMNS =
  'id, user_id, content, created_at, parent_id, target_task_id, attached_task_id, metadata';

const DEFAULT_HISTORY_LIMIT = 50;

type MessagesTable = {
  select: (columns: string) => MessagesQuery;
};

type MessagesQuery = {
  eq: (column: string, value: unknown) => MessagesQuery;
  neq: (column: string, value: unknown) => MessagesQuery;
  or: (filter: string) => MessagesQuery;
  order: (column: string, options: { ascending: boolean }) => MessagesQuery;
  limit: (n: number) => Promise<{
    data: HistoryRow[] | null;
    error: { message: string } | null;
  }>;
};

function buildBaseQuery(
  supabase: SupabaseClient,
  bubbleId: string,
  triggerId: string,
): MessagesQuery {
  const table = supabase.from('messages') as unknown as MessagesTable;
  return table.select(HISTORY_COLUMNS).eq('bubble_id', bubbleId).neq('id', triggerId);
}

function ascending(rows: HistoryRow[]): HistoryRow[] {
  return [...rows].sort((a, b) => {
    if (a.created_at === b.created_at) return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    return a.created_at < b.created_at ? -1 : 1;
  });
}

/**
 * Thread history loaded by Slack-style root id (`parent_id` OR `id` equals the thread
 * root). Returns up to `limit` rows ordered oldest → newest.
 */
export async function loadThreadHistoryByParent(
  supabase: SupabaseClient,
  bubbleId: string,
  triggerId: string,
  threadId: string,
  limit: number = DEFAULT_HISTORY_LIMIT,
): Promise<{ rows: HistoryRow[]; error?: string }> {
  const result = await buildBaseQuery(supabase, bubbleId, triggerId)
    .or(`parent_id.eq.${threadId},id.eq.${threadId}`)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (result.error) return { rows: [], error: result.error.message };
  return { rows: ascending(result.data ?? []) };
}

/**
 * Thread history loaded by `target_task_id` (Coach's task-scoped flow). Returns up to
 * `limit` rows ordered oldest → newest.
 */
export async function loadThreadHistoryByTargetTask(
  supabase: SupabaseClient,
  bubbleId: string,
  triggerId: string,
  taskId: string,
  limit: number = DEFAULT_HISTORY_LIMIT,
): Promise<{ rows: HistoryRow[]; error?: string }> {
  const result = await buildBaseQuery(supabase, bubbleId, triggerId)
    .eq('target_task_id', taskId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (result.error) return { rows: [], error: result.error.message };
  return { rows: ascending(result.data ?? []) };
}

/**
 * Map ordered history rows to Vertex `contents`. Agent-authored rows (whose `user_id`
 * is in `agentAuthIds`) become `role: 'model'`; everything else becomes `role: 'user'`.
 * Empty / null `content` rows are skipped — they cannot be sent to Vertex as text parts.
 */
export function toGeminiContents(
  rows: ReadonlyArray<HistoryRow>,
  agentAuthIds: ReadonlySet<string>,
): GeminiContent[] {
  const out: GeminiContent[] = [];
  for (const row of rows) {
    const text = typeof row.content === 'string' ? row.content : '';
    if (!text.trim()) continue;
    const role: 'user' | 'model' = agentAuthIds.has(row.user_id) ? 'model' : 'user';
    out.push({ role, parts: [{ text }] });
  }
  return out;
}
