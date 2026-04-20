import type { CoachDraftPayload } from '@/types/coach-draft';
import type { Database, MessageRow, TaskRow } from '@/types/database';
import type { MessageAttachment } from '@/types/message-attachment';

type UserRow = Database['public']['Tables']['users']['Row'];

/** Subset of `users` loaded in chat queries/joins — avoids requiring `bio` / `children_names` on partial selects. */
export type ChatUserSnapshot = Pick<
  UserRow,
  'id' | 'full_name' | 'avatar_url' | 'email' | 'created_at'
>;

/** Chat row shape used by chat UI layers (rail + thread). */
export type ChatMessage = {
  id: string;
  sender: string;
  senderAvatar?: string;
  content: string;
  timestamp: Date;
  /** Bubble display name (or synthetic label in All Bubbles mode). */
  department: string;
  attachments?: MessageAttachment[];
  uid: string;
  parentId?: string;
  threadCount?: number;
  /** Same as `messages.attached_task_id` (raw id for loaders that skip the embed). */
  attached_task_id?: string | null;
  /** Left join from `tasks(*)` when present. */
  attachedTask?: TaskRow | null;
  /** Parsed from `messages.metadata` when the coach proposed a workout revision. */
  coachDraft?: CoachDraftPayload | null;
};

/** Join row shape used by message search (PostgREST embed). */
export type SearchMessageJoinRow = MessageRow & {
  users: { full_name: string | null; avatar_url: string | null };
  bubbles: { name: string };
  tasks: TaskRow | null;
};
