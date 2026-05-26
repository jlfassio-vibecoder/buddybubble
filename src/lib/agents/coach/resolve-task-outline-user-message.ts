/**
 * Resolves the original user prompt for Phase B outline generation when the client
 * omits user_message (e.g. Retry Structure from the task modal).
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type OutlineUserMessageSource = 'client_body' | 'card_thread' | 'bubble_history' | 'none';

export type OutlineMessageRow = {
  content: string;
  user_id: string;
  created_at?: string;
};

export type ResolveTaskOutlineUserMessageResult = {
  userMessage: string | undefined;
  source: OutlineUserMessageSource;
  historyTexts: string[];
};

const CATALOG_TOKEN_RE =
  /:(?:main|finisher|metcon|warmup|strength|recovery|prep)\/[a-z0-9_-]+\/[a-z0-9_-]+/i;

const HISTORY_MAX_LINES = 5;
const HISTORY_MAX_CHARS = 500;

export function messageHasCatalogToken(content: string): boolean {
  return CATALOG_TOKEN_RE.test(content);
}

/** Pick primary userMessage from human-authored candidates (ordered oldest-first). */
export function pickBestHumanOutlineMessage(
  humanMessages: OutlineMessageRow[],
): OutlineMessageRow | null {
  if (humanMessages.length === 0) return null;

  const withToken = humanMessages.filter((m) => messageHasCatalogToken(m.content));
  if (withToken.length > 0) {
    return withToken.reduce((best, m) =>
      m.content.trim().length > best.content.trim().length ? m : best,
    );
  }

  return humanMessages.reduce((best, m) =>
    m.content.trim().length > best.content.trim().length ? m : best,
  );
}

export function buildOutlineHistoryTexts(
  humanMessages: OutlineMessageRow[],
  primaryContent: string,
): string[] {
  const primary = primaryContent.trim();
  const others = humanMessages
    .map((m) => m.content.trim())
    .filter((c) => c.length > 0 && c !== primary)
    .reverse()
    .slice(0, HISTORY_MAX_LINES)
    .map((c) => (c.length > HISTORY_MAX_CHARS ? c.slice(0, HISTORY_MAX_CHARS) : c));
  return others;
}

export function filterHumanMessages(
  rows: OutlineMessageRow[],
  agentAuthIds: ReadonlySet<string>,
): OutlineMessageRow[] {
  return rows.filter(
    (row) =>
      typeof row.content === 'string' &&
      row.content.trim().length > 0 &&
      typeof row.user_id === 'string' &&
      !agentAuthIds.has(row.user_id),
  );
}

type CardAnchorRow = {
  id: string;
  parent_id: string | null;
  created_at: string;
};

async function loadAgentAuthIdsForBubble(
  supabase: SupabaseClient,
  bubbleId: string,
): Promise<Set<string>> {
  const { data: bindings } = await supabase
    .from('bubble_agent_bindings')
    .select('agent_definitions(auth_user_id)')
    .eq('bubble_id', bubbleId)
    .eq('enabled', true);

  const ids = new Set<string>();
  for (const row of bindings ?? []) {
    const authUserId = (row.agent_definitions as { auth_user_id?: string } | null)?.auth_user_id;
    if (typeof authUserId === 'string' && authUserId) ids.add(authUserId);
  }
  return ids;
}

async function loadCardAnchorMessage(
  supabase: SupabaseClient,
  bubbleId: string,
  taskId: string,
): Promise<CardAnchorRow | null> {
  const { data: cardMsg } = await supabase
    .from('messages')
    .select('id, parent_id, created_at')
    .eq('bubble_id', bubbleId)
    .eq('attached_task_id', taskId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!cardMsg?.id || !cardMsg.created_at) return null;
  return {
    id: cardMsg.id,
    parent_id: cardMsg.parent_id ?? null,
    created_at: cardMsg.created_at,
  };
}

async function loadThreadHumanMessages(
  supabase: SupabaseClient,
  bubbleId: string,
  cardMsg: CardAnchorRow,
  agentAuthIds: ReadonlySet<string>,
): Promise<OutlineMessageRow[]> {
  const threadRootId = cardMsg.parent_id ?? cardMsg.id;
  const { data: threadMsgs } = await supabase
    .from('messages')
    .select('content, user_id, created_at')
    .eq('bubble_id', bubbleId)
    .or(`id.eq.${threadRootId},parent_id.eq.${threadRootId}`)
    .lte('created_at', cardMsg.created_at)
    .order('created_at', { ascending: true });

  return filterHumanMessages(threadMsgs ?? [], agentAuthIds);
}

async function loadBubbleHistoryHumanMessages(
  supabase: SupabaseClient,
  bubbleId: string,
  taskCreatedAt: string,
  agentAuthIds: ReadonlySet<string>,
): Promise<OutlineMessageRow[]> {
  const { data: priorMsgs } = await supabase
    .from('messages')
    .select('content, user_id, created_at')
    .eq('bubble_id', bubbleId)
    .lte('created_at', taskCreatedAt)
    .order('created_at', { ascending: false })
    .limit(25);

  const human = filterHumanMessages(priorMsgs ?? [], agentAuthIds);
  return human.reverse();
}

function resultFromHumanMessages(
  humanMessages: OutlineMessageRow[],
  source: Exclude<OutlineUserMessageSource, 'client_body' | 'none'>,
): ResolveTaskOutlineUserMessageResult {
  const best = pickBestHumanOutlineMessage(humanMessages);
  if (!best) {
    return { userMessage: undefined, source: 'none', historyTexts: [] };
  }
  const trimmed = best.content.trim().slice(0, 2000);
  return {
    userMessage: trimmed,
    source,
    historyTexts: buildOutlineHistoryTexts(humanMessages, trimmed),
  };
}

export async function resolveTaskOutlineUserMessage(
  supabase: SupabaseClient,
  args: {
    taskId: string;
    bubbleId: string;
    taskCreatedAt: string;
  },
): Promise<ResolveTaskOutlineUserMessageResult> {
  const agentAuthIds = await loadAgentAuthIdsForBubble(supabase, args.bubbleId);

  const cardMsg = await loadCardAnchorMessage(supabase, args.bubbleId, args.taskId);
  if (cardMsg) {
    const threadHuman = await loadThreadHumanMessages(
      supabase,
      args.bubbleId,
      cardMsg,
      agentAuthIds,
    );
    const fromThread = resultFromHumanMessages(threadHuman, 'card_thread');
    if (fromThread.userMessage) return fromThread;
  }

  const bubbleHuman = await loadBubbleHistoryHumanMessages(
    supabase,
    args.bubbleId,
    args.taskCreatedAt,
    agentAuthIds,
  );
  const fromBubble = resultFromHumanMessages(bubbleHuman, 'bubble_history');
  if (fromBubble.userMessage) return fromBubble;

  return { userMessage: undefined, source: 'none', historyTexts: [] };
}
