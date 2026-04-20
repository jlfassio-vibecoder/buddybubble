import { parseCoachDraftFromMessageMetadata } from '@/types/coach-draft';
import { parseLiveSessionInviteFromMessageMetadata } from '@/types/live-session-invite';
import { parseMessageAttachments } from '@/types/message-attachment';
import type { MessageRowWithEmbeddedTask } from '@/types/database';
import type { ChatMessage, ChatUserSnapshot, SearchMessageJoinRow } from '@/types/chat';

export function rowToChatMessage(
  row: MessageRowWithEmbeddedTask,
  user: ChatUserSnapshot | undefined,
  bubbleName: string,
  replyCounts: Map<string, number>,
): ChatMessage {
  const sender =
    (user?.full_name && user.full_name.trim()) || user?.email?.split('@')[0] || 'Member';
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
