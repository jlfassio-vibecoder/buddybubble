import { parseCoachDraftFromMessageMetadata } from '@/types/coach-draft';
import { parseLiveSessionInviteFromMessageMetadata } from '@/types/live-session-invite';
import { parseMessageAttachments } from '@/types/message-attachment';
import { resolveAgentAvatar } from '@/lib/agents/resolveAgentAvatar';
import type { AgentDefinitionLite } from '@/lib/agents/resolveTargetAgent';
import type { MessageRowWithEmbeddedTask } from '@/types/database';
import type { ChatMessage, ChatUserSnapshot, SearchMessageJoinRow } from '@/types/chat';

/**
 * Maps a raw message row into the chat-layer `ChatMessage`.
 *
 * Avatar sourcing (Phase-2 refactor — see `docs/refactor/agent-routing-audit.md`):
 *   - If `row.user_id` belongs to a known agent (present in `agentsByAuthUserId`), resolve the
 *     avatar via `resolveAgentAvatar(agent)` — the single source of truth for agent branding.
 *   - Otherwise, fall back to the authenticated user's `avatar_url`.
 *
 * This closes the `agentSnapshots vs fromRows` merge-order race documented in the audit: the
 * mapper no longer depends on how `userById` was merged for agent rows.
 */
export function rowToChatMessage(
  row: MessageRowWithEmbeddedTask,
  user: ChatUserSnapshot | undefined,
  bubbleName: string,
  replyCounts: Map<string, number>,
  agentsByAuthUserId: Map<string, AgentDefinitionLite>,
): ChatMessage {
  const agent = agentsByAuthUserId.get(row.user_id) ?? null;
  const sender = agent
    ? agent.display_name
    : (user?.full_name && user.full_name.trim()) || user?.email?.split('@')[0] || 'Member';
  const agentAvatar = agent ? resolveAgentAvatar(agent) : '';
  const senderAvatar = agent ? agentAvatar || undefined : (user?.avatar_url ?? undefined);
  return {
    id: row.id,
    sender,
    senderAvatar,
    content: row.content,
    timestamp: new Date(row.created_at),
    department: bubbleName,
    uid: row.user_id,
    parentId: row.parent_id ?? undefined,
    threadCount: replyCounts.get(row.id) ?? 0,
    attachments: parseMessageAttachments(row.attachments),
    attached_task_id: row.attached_task_id,
    attachedTask: row.tasks ?? null,
    coachDraft: parseCoachDraftFromMessageMetadata(row.metadata),
    liveSessionInvite: parseLiveSessionInviteFromMessageMetadata(row.metadata),
  };
}

export function searchJoinRowToChatMessage(
  row: SearchMessageJoinRow,
  replyCounts: Map<string, number>,
): ChatMessage {
  const user = row.users;
  const bubbleName = row.bubbles.name;
  const sender = (user?.full_name && user.full_name.trim()) || 'Member';
  return {
    id: row.id,
    sender,
    senderAvatar: user?.avatar_url ?? undefined,
    content: row.content,
    timestamp: new Date(row.created_at),
    department: bubbleName,
    uid: row.user_id,
    parentId: row.parent_id ?? undefined,
    threadCount: replyCounts.get(row.id) ?? 0,
    attachments: parseMessageAttachments(row.attachments),
    attached_task_id: row.attached_task_id,
    attachedTask: row.tasks ?? null,
    coachDraft: parseCoachDraftFromMessageMetadata(row.metadata),
    liveSessionInvite: parseLiveSessionInviteFromMessageMetadata(row.metadata),
  };
}
