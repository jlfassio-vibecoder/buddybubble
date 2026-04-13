import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Send,
  Hash,
  Info,
  Search,
  Bell,
  Star,
  AtSign,
  X,
  Calendar as CalendarIcon,
  User,
  MessageSquare,
  Clock,
  Paperclip,
  PanelLeftClose,
  Zap,
  Lightbulb,
  CheckSquare,
  Loader2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { supabaseClientErrorMessage } from '@/lib/supabase-client-error';
import { cn } from '@/lib/utils';
import { formatMessageTimestamp } from '@/lib/message-timestamp';
import { createClient } from '@utils/supabase/client';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { useUserProfileStore } from '@/store/userProfileStore';
import type { BubbleRow, MessageRow, TaskRow } from '@/types/database';
import {
  ALL_BUBBLES_BUBBLE_ID,
  ALL_BUBBLES_LABEL,
  defaultBubbleIdForWrites,
} from '@/lib/all-bubbles';
import type { Database } from '@/types/database';
import {
  attachmentsToJson,
  classifyFileKind,
  inferMimeFromFileName,
  parseMessageAttachments,
  type MessageAttachment,
} from '@/types/message-attachment';
import {
  buildMessageAttachmentObjectPath,
  MESSAGE_ATTACHMENTS_BUCKET,
  removeMessageAttachmentPrefix,
} from '@/lib/message-storage';
import {
  MESSAGE_ATTACHMENT_FILE_ACCEPT,
  validateAttachmentFiles,
} from '@/lib/message-attachment-limits';
import { captureVideoPoster, getVideoFileMetadata } from '@/lib/video-poster';
import { renderPdfFirstPageToJpegBlob } from '@/lib/pdf-page-thumbnail';
import { formatUserFacingError } from '@/lib/format-error';
import type { JoinRequestPreviewItem } from '@/lib/workspace-join-requests';
import { ThreadPanel } from './ThreadPanel';
import { MessageAttachmentThumbnails } from './MessageAttachmentThumbnails';
import { MessageMediaModal } from './MessageMediaModal';
import type { TaskModalTab } from '@/components/modals/TaskModal';

type UserRow = Database['public']['Tables']['users']['Row'];

/** Subset of `users` loaded in chat queries/joins — avoids requiring `bio` / `children_names` on partial selects. */
type ChatUserSnapshot = Pick<UserRow, 'id' | 'full_name' | 'avatar_url' | 'email' | 'created_at'>;

function toChatUserSnapshot(u: {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  email: string | null;
  created_at: string;
}): ChatUserSnapshot {
  return {
    id: u.id,
    full_name: u.full_name,
    avatar_url: u.avatar_url,
    email: u.email,
    created_at: u.created_at,
  };
}

/** Chat row shape used by ChatArea markup */
export type ChatMessage = {
  id: string;
  sender: string;
  senderAvatar?: string;
  content: string;
  timestamp: Date;
  department: string;
  attachments?: MessageAttachment[];
  uid: string;
  parentId?: string;
  threadCount?: number;
};

type UserProfile = {
  id: string;
  name: string;
  email: string;
  avatar?: string;
};

type TaskPickerRow = {
  id: string;
  title: string;
  status: string;
  type: 'task' | 'request' | 'idea';
};

type NotificationStub = {
  id: string;
  userId: string;
  title: string;
  content: string;
  type: 'thread_reply' | 'task_assigned' | 'mention' | 'join_request';
  relatedId: string;
  read: boolean;
  timestamp: Date;
  actionHref?: string;
};

function buildReplyCounts(rows: MessageRow[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    if (r.parent_id) {
      m.set(r.parent_id, (m.get(r.parent_id) ?? 0) + 1);
    }
  }
  return m;
}

/** Parsed search query (same rules as legacy in-memory search). */
export type ParsedMessageSearch = {
  cleanQuery: string;
  fromOperator: string;
  inOperator: string;
  hasAttachment: boolean;
};

/**
 * Extracts cleanQuery, fromOperator, inOperator, and has:attachment from the main query string
 * plus the optional sender field.
 */
export function parseSearchFilters(searchQuery: string, searchSender: string): ParsedMessageSearch {
  let cleanQuery = searchQuery;
  let fromOperator = searchSender;
  let inOperator = '';
  let hasAttachment = false;

  const fromMatch = cleanQuery.match(/from:(\w+)/);
  if (fromMatch) {
    fromOperator = fromMatch[1];
    cleanQuery = cleanQuery.replace(fromMatch[0], '').trim();
  }

  const inMatch = cleanQuery.match(/in:([\w\s&]+)/);
  if (inMatch) {
    inOperator = inMatch[1].trim();
    cleanQuery = cleanQuery.replace(inMatch[0], '').trim();
  }

  if (cleanQuery.includes('has:attachment')) {
    hasAttachment = true;
    cleanQuery = cleanQuery.replace('has:attachment', '').trim();
  }

  return { cleanQuery, fromOperator, inOperator, hasAttachment };
}

type SearchMessageJoinRow = MessageRow & {
  users: { full_name: string | null; avatar_url: string | null };
  bubbles: { name: string };
};

function searchJoinRowToChatMessage(
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
  };
}

function dayBoundsIso(searchDate: string): { start: string; end: string } | null {
  if (!searchDate || !/^\d{4}-\d{2}-\d{2}$/.test(searchDate)) return null;
  const [y, mo, d] = searchDate.split('-').map(Number);
  const start = new Date(y, mo - 1, d, 0, 0, 0, 0);
  const end = new Date(y, mo - 1, d, 23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString() };
}

/** Rightmost `/` that starts a `/task` token (after start or whitespace), not slashes inside e.g. `https://`. */
function lastTaskMentionSlashIndex(s: string): number {
  for (let i = s.length - 1; i >= 0; i--) {
    if (s[i] !== '/') continue;
    if (i === 0) return 0;
    const before = s[i - 1];
    if (before === ' ' || before === '\n' || before === '\r' || before === '\t') return i;
  }
  return -1;
}

function rowToChatMessage(
  row: MessageRow,
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
  };
}

export type ChatAreaProps = {
  /** Bubbles in the active BuddyBubble (used for aggregate "All Bubbles" view and per-message labels). */
  bubbles: BubbleRow[];
  /** Matches `messages_insert` / `can_view_bubble` — not the same as task write. */
  canPostMessages: boolean;
  onCollapse?: () => void;
  onOpenTask?: (taskId: string, opts?: { tab?: TaskModalTab }) => void;
  /** Workspace admins: pending join requests surfaced in the header bell (collapsed-sidebar fallback). */
  joinRequestBellPreview?: JoinRequestPreviewItem[];
  /** Centered above the channel row — workspace (BuddyBubble) name, same as Bubbles rail. */
  workspaceTitle?: string;
};

export function ChatArea({
  bubbles,
  canPostMessages,
  onCollapse = () => {},
  onOpenTask = () => {},
  joinRequestBellPreview = [],
  workspaceTitle,
}: ChatAreaProps) {
  const router = useRouter();
  const activeBubble = useWorkspaceStore((s) => s.activeBubble);
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id) ?? null;
  const workspaceName = useWorkspaceStore((s) => s.activeWorkspace?.name);
  const myProfile = useUserProfileStore((s) => s.profile);

  const [input, setInput] = useState('');
  const [mentionSearch, setMentionSearch] = useState('');
  const [showMentions, setShowMentions] = useState(false);
  const [mentionIndex, setMentionIndex] = useState(-1);
  const [taskMentionSearch, setTaskMentionSearch] = useState('');
  const [showTaskMentions, setShowTaskMentions] = useState(false);
  const [taskMentionIndex, setTaskMentionIndex] = useState(-1);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchSender, setSearchSender] = useState('');
  const [searchDate, setSearchDate] = useState('');
  const [activeThreadParent, setActiveThreadParent] = useState<ChatMessage | null>(null);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('recentSearches') : null;
    return saved ? JSON.parse(saved) : [];
  });
  const [searchResults, setSearchResults] = useState<ChatMessage[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [sendingAttachments, setSendingAttachments] = useState(false);
  const [mediaModal, setMediaModal] = useState<{
    attachments: MessageAttachment[];
    index: number;
  } | null>(null);

  const [dbMessages, setDbMessages] = useState<MessageRow[]>([]);
  const [userById, setUserById] = useState<Record<string, ChatUserSnapshot>>({});
  const [teamMembers, setTeamMembers] = useState<UserProfile[]>([]);
  const [allTasks, setAllTasks] = useState<TaskPickerRow[]>([]);

  const joinRequestNotifications: NotificationStub[] = useMemo(() => {
    if (!workspaceId || joinRequestBellPreview.length === 0) return [];
    const name = workspaceName?.trim() || 'this BuddyBubble';
    const href = `/app/${workspaceId}/invites?tab=pending`;
    return joinRequestBellPreview.map((p) => ({
      id: `jr:${p.id}`,
      userId: '',
      title: 'Someone wants to join',
      content: `${p.requesterLabel} requested to join ${name}. Review on People & invites.`,
      type: 'join_request' as const,
      relatedId: p.id,
      read: false,
      timestamp: new Date(p.createdAt),
      actionHref: href,
    }));
  }, [workspaceId, workspaceName, joinRequestBellPreview]);

  const stubNotifications: NotificationStub[] = [];
  const notifications = useMemo(
    () => [...joinRequestNotifications, ...stubNotifications],
    [joinRequestNotifications],
  );
  const onMarkNotificationRead = (_id: string) => {};

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);

  const bubbleName = activeBubble?.name ?? 'Bubble';

  const bubbleNameById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const b of bubbles) m[b.id] = b.name;
    return m;
  }, [bubbles]);

  /** Real Bubbles in this BuddyBubble only (excludes synthetic "All Bubbles"). */
  const realBubbleIds = useMemo(
    () => bubbles.filter((b) => b.id !== ALL_BUBBLES_BUBBLE_ID).map((b) => b.id),
    [bubbles],
  );

  const replyCounts = useMemo(() => buildReplyCounts(dbMessages), [dbMessages]);

  const teamMembersResolved = useMemo(() => {
    if (!myProfile) return teamMembers;
    return teamMembers.map((m) =>
      m.id === myProfile.id
        ? {
            ...m,
            name: myProfile.full_name?.trim() || m.name,
            avatar: myProfile.avatar_url ?? m.avatar,
          }
        : m,
    );
  }, [teamMembers, myProfile]);

  const allMessages = useMemo(() => {
    return dbMessages.map((row) => {
      const base = userById[row.user_id];
      const user: ChatUserSnapshot | undefined =
        myProfile && row.user_id === myProfile.id ? toChatUserSnapshot(myProfile) : base;
      return rowToChatMessage(row, user, bubbleNameById[row.bubble_id] ?? bubbleName, replyCounts);
    });
  }, [dbMessages, userById, myProfile, bubbleNameById, bubbleName, replyCounts]);

  const displayMessages = useMemo(() => {
    return allMessages.filter((m) => !m.parentId);
  }, [allMessages]);

  const threadMessages = useMemo(() => {
    if (!activeThreadParent) return [];
    return allMessages.filter((m) => m.parentId === activeThreadParent.id);
  }, [allMessages, activeThreadParent]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [displayMessages]);

  useEffect(() => {
    localStorage.setItem('recentSearches', JSON.stringify(recentSearches));
  }, [recentSearches]);

  useEffect(() => {
    if (!activeBubble) {
      setDbMessages([]);
      setActiveThreadParent(null);
      return;
    }
    const isAll = activeBubble.id === ALL_BUBBLES_BUBBLE_ID;
    const bubbleIds = bubbles.map((b) => b.id);
    if (isAll && bubbleIds.length === 0) {
      setDbMessages([]);
      setActiveThreadParent(null);
      return;
    }
    const bubbleId = activeBubble.id;
    let cancelled = false;
    async function load() {
      const supabase = createClient();
      let q = supabase.from('messages').select('*').order('created_at', { ascending: true });
      if (isAll) {
        q = q.in('bubble_id', bubbleIds);
      } else {
        q = q.eq('bubble_id', bubbleId);
      }
      const { data, error } = await q;
      if (cancelled || error) return;
      const rows = (data ?? []) as MessageRow[];
      setDbMessages(rows);
      const ids = [...new Set(rows.map((r) => r.user_id))];
      if (ids.length === 0) return;
      const { data: users } = await supabase
        .from('users')
        .select('id, full_name, avatar_url, email, created_at')
        .in('id', ids);
      if (cancelled) return;
      setUserById((prev) => {
        const next = { ...prev };
        for (const u of users ?? []) {
          next[u.id] = toChatUserSnapshot(u);
        }
        return next;
      });
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [activeBubble?.id, bubbles]);

  useEffect(() => {
    if (!activeBubble) return;
    const isAll = activeBubble.id === ALL_BUBBLES_BUBBLE_ID;
    const bubbleIds = bubbles.map((b) => b.id);
    if (isAll && bubbleIds.length === 0) return;

    const supabase = createClient();
    const bubbleId = activeBubble.id;
    const channelName = isAll
      ? `messages-rt-all:${[...bubbleIds].sort().join(',')}`
      : `messages-rt:${bubbleId}`;
    const channel = supabase.channel(channelName);

    const onInsert = (payload: { new: Record<string, unknown> }) => {
      const row = payload.new as MessageRow;
      setDbMessages((prev) => {
        if (prev.some((m) => m.id === row.id)) return prev;
        return [...prev, row].sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
        );
      });
      void (async () => {
        const supa = createClient();
        const { data: u } = await supa
          .from('users')
          .select('id, full_name, avatar_url, email, created_at')
          .eq('id', row.user_id)
          .maybeSingle();
        if (u) {
          setUserById((prev) => ({ ...prev, [u.id]: toChatUserSnapshot(u) }));
        }
      })();
    };
    const onUpdate = (payload: { new: Record<string, unknown> }) => {
      const row = payload.new as MessageRow;
      setDbMessages((prev) => prev.map((m) => (m.id === row.id ? row : m)));
    };
    const onDelete = (payload: { old: Record<string, unknown> }) => {
      const old = payload.old as { id?: string };
      if (!old?.id) return;
      setDbMessages((prev) => prev.filter((m) => m.id !== old.id));
    };

    if (isAll) {
      for (const bid of bubbleIds) {
        channel.on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `bubble_id=eq.${bid}`,
          },
          onInsert,
        );
        channel.on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'messages',
            filter: `bubble_id=eq.${bid}`,
          },
          onUpdate,
        );
        channel.on(
          'postgres_changes',
          {
            event: 'DELETE',
            schema: 'public',
            table: 'messages',
            filter: `bubble_id=eq.${bid}`,
          },
          onDelete,
        );
      }
    } else {
      channel.on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `bubble_id=eq.${bubbleId}`,
        },
        onInsert,
      );
      channel.on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `bubble_id=eq.${bubbleId}`,
        },
        onUpdate,
      );
      channel.on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'messages',
          filter: `bubble_id=eq.${bubbleId}`,
        },
        onDelete,
      );
    }

    channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [activeBubble?.id, bubbles]);

  useEffect(() => {
    if (!workspaceId) {
      setTeamMembers([]);
      return;
    }
    let cancelled = false;
    async function loadMembers() {
      const supabase = createClient();
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      const myId = authUser?.id ?? null;
      const { data } = await supabase
        .from('workspace_members')
        .select(
          'user_id, show_email_to_workspace_members, users ( id, full_name, avatar_url, email, created_at )',
        )
        .eq('workspace_id', workspaceId);
      if (cancelled) return;
      const members: UserProfile[] = [];
      const fromRows: Record<string, ChatUserSnapshot> = {};
      for (const row of data ?? []) {
        const u = (row as { users?: ChatUserSnapshot | ChatUserSnapshot[] | null }).users;
        const usr = Array.isArray(u) ? u[0] : u;
        if (!usr?.id) continue;
        const showPeerEmail =
          !myId ||
          usr.id === myId ||
          (row as { show_email_to_workspace_members?: boolean }).show_email_to_workspace_members ===
            true;
        const displayEmail = showPeerEmail ? (usr.email ?? '') : '';
        const displayName =
          usr.full_name?.trim() ||
          (showPeerEmail ? usr.email?.split('@')[0] : undefined)?.trim() ||
          'Member';
        members.push({
          id: usr.id,
          name: displayName,
          email: displayEmail,
          avatar: usr.avatar_url ?? undefined,
        });
        fromRows[usr.id] = toChatUserSnapshot({
          ...usr,
          email: showPeerEmail ? usr.email : null,
        });
      }
      setTeamMembers(members);
      setUserById((prev) => ({ ...prev, ...fromRows }));
    }
    void loadMembers();
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  /** Task / feature picker: all tasks in this BuddyBubble (matches legacy global task list for `/…` links). */
  useEffect(() => {
    if (!workspaceId || bubbles.length === 0) {
      setAllTasks([]);
      return;
    }
    const bubbleIds = bubbles.map((b) => b.id);
    let cancelled = false;
    async function loadTasksForMentions() {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .in('bubble_id', bubbleIds)
        .is('archived_at', null)
        .order('bubble_id', { ascending: true })
        .order('position', { ascending: true });
      if (cancelled) return;
      if (error) {
        console.error('[ChatArea] load tasks for / mentions', supabaseClientErrorMessage(error));
        setAllTasks([]);
        return;
      }
      const mapped: TaskPickerRow[] = (data ?? []).map((t: TaskRow) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        type: 'task',
      }));
      setAllTasks(mapped);
    }
    void loadTasksForMentions();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, bubbles]);

  const sendMessage = useCallback(
    async (content: string, parentId?: string, files?: File[]): Promise<boolean> => {
      if (!canPostMessages) {
        setAttachmentError('You do not have permission to post messages in this channel.');
        return false;
      }
      if (!workspaceId) {
        setAttachmentError('No workspace selected.');
        return false;
      }
      const raw = files ?? [];
      if (!content.trim() && raw.length === 0) return false;
      if (!content.trim()) {
        setAttachmentError('Message text is required.');
        return false;
      }
      const candidates = raw.filter((f) => classifyFileKind(f) !== 'unsupported');
      const validated = validateAttachmentFiles(candidates);
      if (!validated.ok) {
        setAttachmentError(validated.message);
        return false;
      }
      const accepted = validated.files;
      setAttachmentError(null);

      let targetBubbleId: string | null = null;
      if (parentId) {
        const parentRow = dbMessages.find((m) => m.id === parentId);
        targetBubbleId = parentRow?.bubble_id ?? null;
      } else if (!activeBubble) {
        setAttachmentError('Select a bubble to post.');
        return false;
      } else if (activeBubble.id === ALL_BUBBLES_BUBBLE_ID) {
        targetBubbleId = defaultBubbleIdForWrites(bubbles);
      } else {
        targetBubbleId = activeBubble.id;
      }
      if (!targetBubbleId) {
        setAttachmentError(
          parentId
            ? 'Could not find thread parent. Try closing and reopening the thread.'
            : 'Add a bubble in this workspace before posting attachments.',
        );
        return false;
      }

      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setAttachmentError('You need to be signed in to send messages.');
        return false;
      }

      setSendingAttachments(true);
      try {
        const { data: inserted, error: insErr } = await supabase
          .from('messages')
          .insert({
            bubble_id: targetBubbleId,
            user_id: user.id,
            content: content.trim(),
            parent_id: parentId ?? null,
          })
          .select('*')
          .single();

        if (insErr || !inserted?.id) {
          console.error(
            '[ChatArea] message insert',
            insErr ? supabaseClientErrorMessage(insErr) : 'insert returned no row',
          );
          setAttachmentError(
            insErr ? formatUserFacingError(insErr) : 'Could not create message. Please try again.',
          );
          return false;
        }

        const messageId = inserted.id;
        const row = inserted as MessageRow;
        setDbMessages((prev) => {
          if (prev.some((m) => m.id === row.id)) return prev;
          return [...prev, row].sort(
            (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
          );
        });

        const abortAttempt = async () => {
          await removeMessageAttachmentPrefix(supabase, workspaceId, messageId);
          await supabase.from('messages').delete().eq('id', messageId);
        };

        const meta: MessageAttachment[] = [];

        for (const file of accepted) {
          const k = classifyFileKind(file);
          if (k === 'image' || k === 'document') {
            const path = buildMessageAttachmentObjectPath(workspaceId, messageId, file.name);
            const { error: upErr } = await supabase.storage
              .from(MESSAGE_ATTACHMENTS_BUCKET)
              .upload(path, file, { cacheControl: '3600', upsert: false });
            if (upErr) {
              console.error('[ChatArea] attachment upload', supabaseClientErrorMessage(upErr));
              setAttachmentError(formatUserFacingError(upErr));
              await abortAttempt();
              return false;
            }
            const mime =
              file.type || inferMimeFromFileName(file.name) || 'application/octet-stream';
            const isPdf = mime === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
            let pdfThumbPath: string | null = null;
            let pdfW: number | null = null;
            let pdfH: number | null = null;
            if (k === 'document' && isPdf) {
              try {
                const pdfThumb = await renderPdfFirstPageToJpegBlob(file);
                const thumbStorePath = buildMessageAttachmentObjectPath(
                  workspaceId,
                  messageId,
                  'pdf-thumb.jpg',
                );
                const { error: upPdfThumb } = await supabase.storage
                  .from(MESSAGE_ATTACHMENTS_BUCKET)
                  .upload(thumbStorePath, pdfThumb.blob, {
                    cacheControl: '3600',
                    upsert: false,
                    contentType: 'image/jpeg',
                  });
                if (!upPdfThumb) {
                  pdfThumbPath = thumbStorePath;
                  pdfW = pdfThumb.width;
                  pdfH = pdfThumb.height;
                } else {
                  console.error(
                    '[ChatArea] pdf thumb upload',
                    supabaseClientErrorMessage(upPdfThumb),
                  );
                }
              } catch (e) {
                console.error('[ChatArea] pdf thumb', supabaseClientErrorMessage(e));
              }
            }
            const docImage: MessageAttachment = {
              id: crypto.randomUUID(),
              kind: k,
              path,
              file_name: file.name,
              mime_type: mime,
              size_bytes: file.size,
              uploaded_at: new Date().toISOString(),
            };
            if (pdfThumbPath) {
              docImage.thumb_path = pdfThumbPath;
              docImage.width = pdfW;
              docImage.height = pdfH;
            }
            meta.push(docImage);
          } else if (k === 'video') {
            const path = buildMessageAttachmentObjectPath(workspaceId, messageId, file.name);
            const thumbPath = buildMessageAttachmentObjectPath(
              workspaceId,
              messageId,
              'poster.jpg',
            );
            const { error: upVid } = await supabase.storage
              .from(MESSAGE_ATTACHMENTS_BUCKET)
              .upload(path, file, { cacheControl: '3600', upsert: false });
            if (upVid) {
              console.error('[ChatArea] video upload', supabaseClientErrorMessage(upVid));
              setAttachmentError(formatUserFacingError(upVid));
              await abortAttempt();
              return false;
            }

            let vm: Awaited<ReturnType<typeof getVideoFileMetadata>>;
            try {
              vm = await getVideoFileMetadata(file);
            } catch (e) {
              console.error('[ChatArea] video metadata', supabaseClientErrorMessage(e));
              setAttachmentError(e instanceof Error ? e.message : 'Could not read video.');
              await abortAttempt();
              return false;
            }

            const useEdgePoster = process.env.NEXT_PUBLIC_MESSAGE_VIDEO_POSTER_EDGE === '1';
            let thumb_path = thumbPath;
            let width = vm.width;
            let height = vm.height;
            let duration_sec = vm.duration_sec;

            if (useEdgePoster) {
              const { data, error: fnErr } = await supabase.functions.invoke(
                'generate-message-video-poster',
                {
                  body: {
                    workspace_id: workspaceId,
                    message_id: messageId,
                    video_path: path,
                    thumb_path: thumbPath,
                  },
                },
              );
              const edgePayload = data as { ok?: boolean } | null;
              const edgeOk = !fnErr && edgePayload?.ok === true;

              if (!edgeOk) {
                console.error(
                  '[ChatArea] generate-message-video-poster: fallback to client poster',
                  fnErr
                    ? supabaseClientErrorMessage(fnErr)
                    : 'invoke returned no error but response was not ok',
                );
                let poster: Awaited<ReturnType<typeof captureVideoPoster>>;
                try {
                  poster = await captureVideoPoster(file);
                } catch (e) {
                  console.error('[ChatArea] video poster fallback', supabaseClientErrorMessage(e));
                  setAttachmentError(e instanceof Error ? e.message : 'Could not read video.');
                  await abortAttempt();
                  return false;
                }
                const { error: upPoster } = await supabase.storage
                  .from(MESSAGE_ATTACHMENTS_BUCKET)
                  .upload(thumbPath, poster.blob, {
                    cacheControl: '3600',
                    upsert: false,
                    contentType: 'image/jpeg',
                  });
                if (upPoster) {
                  console.error('[ChatArea] poster upload', supabaseClientErrorMessage(upPoster));
                  setAttachmentError(formatUserFacingError(upPoster));
                  await abortAttempt();
                  return false;
                }
                thumb_path = thumbPath;
                width = poster.width;
                height = poster.height;
                duration_sec = poster.duration_sec;
              }
            } else {
              let poster: Awaited<ReturnType<typeof captureVideoPoster>>;
              try {
                poster = await captureVideoPoster(file);
              } catch (e) {
                console.error('[ChatArea] video poster', supabaseClientErrorMessage(e));
                setAttachmentError(e instanceof Error ? e.message : 'Could not read video.');
                await abortAttempt();
                return false;
              }
              const { error: upPoster } = await supabase.storage
                .from(MESSAGE_ATTACHMENTS_BUCKET)
                .upload(thumbPath, poster.blob, {
                  cacheControl: '3600',
                  upsert: false,
                  contentType: 'image/jpeg',
                });
              if (upPoster) {
                console.error('[ChatArea] poster upload', supabaseClientErrorMessage(upPoster));
                setAttachmentError(formatUserFacingError(upPoster));
                await abortAttempt();
                return false;
              }
              thumb_path = thumbPath;
              width = poster.width;
              height = poster.height;
              duration_sec = poster.duration_sec;
            }

            meta.push({
              id: crypto.randomUUID(),
              kind: 'video',
              path,
              thumb_path,
              file_name: file.name,
              mime_type: file.type || inferMimeFromFileName(file.name) || 'video/mp4',
              size_bytes: file.size,
              uploaded_at: new Date().toISOString(),
              width,
              height,
              duration_sec,
            });
          }
        }

        if (meta.length > 0) {
          const attachmentsJson = attachmentsToJson(meta);
          const { error: updErr } = await supabase
            .from('messages')
            .update({ attachments: attachmentsJson })
            .eq('id', messageId);
          if (updErr) {
            console.error(
              '[ChatArea] message attachments update',
              supabaseClientErrorMessage(updErr),
            );
            setAttachmentError(formatUserFacingError(updErr));
            await abortAttempt();
            return false;
          }
          setDbMessages((prev) => {
            const idx = prev.findIndex((m) => m.id === messageId);
            if (idx === -1) return prev;
            const next = [...prev];
            next[idx] = { ...next[idx], attachments: attachmentsJson as MessageRow['attachments'] };
            return next;
          });
        }

        const { data: self } = await supabase
          .from('users')
          .select('id, full_name, avatar_url, email, created_at')
          .eq('id', user.id)
          .maybeSingle();
        if (self) {
          setUserById((prev) => ({ ...prev, [self.id]: toChatUserSnapshot(self) }));
        }
        return true;
      } finally {
        setSendingAttachments(false);
      }
    },
    [activeBubble, bubbles, canPostMessages, dbMessages, workspaceId],
  );

  const canPostInComposer =
    !!activeBubble &&
    (activeBubble.id !== ALL_BUBBLES_BUBBLE_ID || defaultBubbleIdForWrites(bubbles) !== null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInput(value);

    const cursorPosition = e.target.selectionStart || 0;
    const textBeforeCursor = value.substring(0, cursorPosition);

    const lastAtSymbol = textBeforeCursor.lastIndexOf('@');
    if (lastAtSymbol !== -1) {
      const charBeforeAt = lastAtSymbol > 0 ? textBeforeCursor[lastAtSymbol - 1] : ' ';
      if (charBeforeAt === ' ' || charBeforeAt === '\n') {
        const query = textBeforeCursor.substring(lastAtSymbol + 1);
        if (!query.includes(' ')) {
          setMentionSearch(query);
          setShowMentions(true);
          setMentionIndex(0);
          setShowTaskMentions(false);
          return;
        }
      }
    }
    setShowMentions(false);

    const lastSlashSymbol = lastTaskMentionSlashIndex(textBeforeCursor);
    if (lastSlashSymbol !== -1) {
      const query = textBeforeCursor.substring(lastSlashSymbol + 1);
      if (!query.includes(' ')) {
        setTaskMentionSearch(query);
        setShowTaskMentions(true);
        setTaskMentionIndex(0);
        return;
      }
    }
    setShowTaskMentions(false);
  };

  const insertMention = (userName: string) => {
    const cursorPosition = inputRef.current?.selectionStart || 0;
    const textBeforeCursor = input.substring(0, cursorPosition);
    const textAfterCursor = input.substring(cursorPosition);
    const lastAtSymbol = textBeforeCursor.lastIndexOf('@');

    const newValue =
      textBeforeCursor.substring(0, lastAtSymbol) + `@${userName} ` + textAfterCursor;

    setInput(newValue);
    setShowMentions(false);
    inputRef.current?.focus();
  };

  const insertTaskMention = (taskTitle: string) => {
    const cursorPosition = inputRef.current?.selectionStart || 0;
    const textBeforeCursor = input.substring(0, cursorPosition);
    const textAfterCursor = input.substring(cursorPosition);
    const lastSlashSymbol = lastTaskMentionSlashIndex(textBeforeCursor);
    if (lastSlashSymbol < 0) return;

    const newValue =
      textBeforeCursor.substring(0, lastSlashSymbol) + `/${taskTitle} ` + textAfterCursor;

    setInput(newValue);
    setShowTaskMentions(false);
    inputRef.current?.focus();
  };

  const handleAttachmentPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const incoming = e.target.files;
    const picked = incoming?.length ? Array.from(incoming) : [];
    e.target.value = '';
    if (picked.length === 0) return;
    setAttachmentError(null);
    setPendingFiles((prev) => [...prev, ...picked]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || sendingAttachments) return;
    const text = input;
    const files = [...pendingFiles];
    const ok = await sendMessage(text, undefined, files);
    if (!ok) return;
    setInput('');
    setPendingFiles([]);
    setShowMentions(false);
  };

  const filteredMembers = teamMembersResolved.filter((member) =>
    member.name.toLowerCase().includes(mentionSearch.toLowerCase()),
  );

  const performSearch = useCallback(
    async (overrides?: { query?: string; sender?: string; date?: string }) => {
      const qRaw = overrides?.query ?? searchQuery;
      const sRaw = overrides?.sender ?? searchSender;
      const dRaw = overrides?.date ?? searchDate;
      const parsed = parseSearchFilters(qRaw.trim(), sRaw.trim());
      const dateStr = dRaw.trim();

      const hasAnyFilter =
        !!parsed.cleanQuery ||
        !!parsed.fromOperator ||
        !!parsed.inOperator ||
        !!dateStr ||
        parsed.hasAttachment;

      if (!hasAnyFilter) {
        setSearchResults([]);
        return;
      }

      if (!workspaceId || realBubbleIds.length === 0) {
        setSearchResults([]);
        return;
      }

      setIsSearching(true);
      setSearchResults([]);
      try {
        const supabase = createClient();

        const scopeIds =
          activeBubble?.id && activeBubble.id !== ALL_BUBBLES_BUBBLE_ID
            ? [activeBubble.id]
            : realBubbleIds;

        let q = supabase
          .from('messages')
          .select('*, users!inner(full_name, avatar_url), bubbles!inner(name)')
          .order('created_at', { ascending: false })
          .limit(50);

        if (scopeIds.length === 1) {
          q = q.eq('bubble_id', scopeIds[0]);
        } else {
          q = q.in('bubble_id', scopeIds);
        }

        const onlyAttachmentFilter =
          parsed.hasAttachment &&
          !parsed.cleanQuery &&
          !parsed.fromOperator &&
          !parsed.inOperator &&
          !dateStr;
        if (onlyAttachmentFilter) {
          q = q.not('attachments', 'eq', '[]');
        }

        if (parsed.cleanQuery) {
          q = q.ilike('content', `%${parsed.cleanQuery}%`);
        }
        if (parsed.fromOperator) {
          q = q.filter('users.full_name', 'ilike', `%${parsed.fromOperator}%`);
        }
        if (parsed.inOperator) {
          q = q.filter('bubbles.name', 'ilike', `%${parsed.inOperator}%`);
        }

        const bounds = dayBoundsIso(dateStr);
        if (bounds) {
          q = q.gte('created_at', bounds.start).lte('created_at', bounds.end);
        }

        const { data, error } = await q;

        if (error) {
          console.error('[ChatArea] message search', supabaseClientErrorMessage(error));
          setSearchResults([]);
          return;
        }

        const rows = (data ?? []) as SearchMessageJoinRow[];
        let mapped = rows.map((row) => searchJoinRowToChatMessage(row, replyCounts));

        if (parsed.hasAttachment) {
          mapped = mapped.filter((m) => m.attachments && m.attachments.length > 0);
        }

        setSearchResults(mapped);
      } finally {
        setIsSearching(false);
      }
    },
    [
      searchQuery,
      searchSender,
      searchDate,
      workspaceId,
      realBubbleIds,
      activeBubble?.id,
      replyCounts,
    ],
  );

  const saveSearch = (query: string) => {
    if (!query.trim()) return;
    setRecentSearches((prev) => {
      const filtered = prev.filter((s) => s !== query);
      return [query, ...filtered].slice(0, 5);
    });
  };

  const handleOpenThread = (msg: ChatMessage) => {
    setActiveThreadParent(msg);
    notifications
      .filter((n) => n.type === 'thread_reply' && n.relatedId === msg.id && !n.read)
      .forEach((n) => onMarkNotificationRead(n.id));
  };

  const renderMessageContent = (content: string) => {
    let parts: (string | React.ReactNode)[] = [content];

    if (teamMembersResolved && teamMembersResolved.length > 0) {
      const sortedMembers = [...teamMembersResolved].sort((a, b) => b.name.length - a.name.length);
      const namesPattern = sortedMembers
        .map((m) => m.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('|');
      const namesRegex = new RegExp(`(@(?:${namesPattern}))`, 'g');

      parts = parts.flatMap((part) => {
        if (typeof part !== 'string') return part;
        const subParts = part.split(namesRegex);
        return subParts.map((subPart, i) => {
          if (subPart.startsWith('@')) {
            const name = subPart.substring(1);
            if (teamMembersResolved.some((m) => m.name === name)) {
              return (
                <span
                  key={`mention-${i}`}
                  className="text-primary font-bold bg-primary/10 px-1 rounded border border-primary/20"
                >
                  {subPart}
                </span>
              );
            }
          }
          return subPart;
        });
      });
    }

    if (allTasks && allTasks.length > 0) {
      const sortedTasks = [...allTasks].sort((a, b) => b.title.length - a.title.length);
      const titlesPattern = sortedTasks
        .map((t) => t.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('|');
      const titlesRegex = new RegExp(`(/(?:${titlesPattern}))`, 'g');

      parts = parts.flatMap((part) => {
        if (typeof part !== 'string') return part;
        const subParts = part.split(titlesRegex);
        return subParts.map((subPart, i) => {
          if (subPart.startsWith('/')) {
            const title = subPart.substring(1);
            const task = allTasks.find((t) => t.title === title);
            if (task) {
              return (
                <button
                  key={`task-${i}`}
                  type="button"
                  onClick={() => onOpenTask(task.id)}
                  className="cursor-pointer rounded border border-[color:color-mix(in_srgb,var(--accent-green)_38%,transparent)] bg-[var(--accent-green-bg)] px-1 font-bold text-[var(--accent-green-text)] transition-colors hover:opacity-90"
                  title={`View card: ${task.title}`}
                >
                  {subPart}
                </button>
              );
            }
          }
          return subPart;
        });
      });
    }

    return parts;
  };
  return (
    <div className="relative flex h-full min-h-0 min-w-0 w-full flex-col bg-background">
      {/* Header */}
      <header className="flex shrink-0 flex-col border-b border-border bg-background">
        {workspaceTitle ? (
          <div className="flex h-9 min-h-9 shrink-0 items-center justify-center border-b border-border/70 px-6">
            <span
              className="truncate text-center text-xs font-semibold text-muted-foreground"
              title={workspaceTitle}
            >
              {workspaceTitle}
            </span>
          </div>
        ) : null}
        <div className="flex h-16 shrink-0 items-center justify-between px-6">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <button
              type="button"
              onClick={onCollapse}
              className="max-md:hidden shrink-0 rounded-lg p-1.5 text-muted-foreground transition-all hover:bg-muted hover:text-primary"
              title="Collapse Messages"
              aria-label="Collapse Messages panel"
            >
              <PanelLeftClose className="h-5 w-5" strokeWidth={2} aria-hidden />
            </button>
            <Hash className="h-5 w-5 shrink-0 text-foreground opacity-70" aria-hidden />
            <h2 className="min-w-0 truncate font-bold text-foreground">
              {activeBubble?.name ?? 'Chat'}
            </h2>
            <Star className="w-4 h-4 shrink-0 text-muted-foreground/55 hover:text-yellow-400 cursor-pointer transition-colors" />
          </div>
          <div className="flex shrink-0 items-center gap-4 text-muted-foreground">
            <Search
              className={cn(
                'w-5 h-5 cursor-pointer transition-colors',
                isSearchOpen ? 'text-primary' : 'hover:text-foreground',
              )}
              onClick={() => setIsSearchOpen(!isSearchOpen)}
            />
            <div className="relative">
              <Bell
                className={cn(
                  'w-5 h-5 cursor-pointer transition-colors',
                  isNotificationsOpen ? 'text-primary' : 'hover:text-foreground',
                )}
                onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
              />
              {notifications.some((n) => !n.read) && (
                <span className="absolute -right-1 -top-1 size-2.5 rounded-full border-2 border-background bg-destructive" />
              )}

              <AnimatePresence>
                {isNotificationsOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-2xl"
                  >
                    <div className="p-4 border-b border-border flex items-center justify-between bg-muted/70">
                      <h3 className="font-bold text-foreground text-sm">Notifications</h3>
                      <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                        {notifications.filter((n) => !n.read).length} New
                      </span>
                    </div>
                    <div className="max-h-96 overflow-y-auto custom-scrollbar">
                      {notifications.length > 0 ? (
                        notifications.map((n) => (
                          <div
                            key={n.id}
                            className={cn(
                              'p-4 border-b border-border last:border-0 transition-colors cursor-pointer hover:bg-muted/70',
                              !n.read && 'bg-primary/10',
                            )}
                            onClick={() => {
                              if (n.type === 'join_request' && n.actionHref) {
                                router.push(n.actionHref);
                                setIsNotificationsOpen(false);
                                return;
                              }
                              onMarkNotificationRead(n.id);
                              if (n.type === 'thread_reply') {
                                const parent = allMessages.find((m) => m.id === n.relatedId);
                                if (parent) setActiveThreadParent(parent);
                              }
                              setIsNotificationsOpen(false);
                            }}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1">
                                <p className="text-xs font-bold text-foreground mb-1">{n.title}</p>
                                <p className="text-[11px] text-muted-foreground leading-relaxed">
                                  {n.content}
                                </p>
                                <p className="text-[10px] text-muted-foreground mt-2">
                                  {formatMessageTimestamp(n.timestamp)}
                                </p>
                              </div>
                              {!n.read && (
                                <div className="mt-1 size-2 shrink-0 rounded-full bg-primary" />
                              )}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="p-8 text-center">
                          <Bell className="w-8 h-8 text-muted-foreground/35 mx-auto mb-2" />
                          <p className="text-sm text-muted-foreground">No notifications yet.</p>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <Info className="w-5 h-5 cursor-pointer hover:text-foreground" />
          </div>
        </div>
      </header>

      {/* Search Overlay */}
      <AnimatePresence>
        {isSearchOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-muted/70 border-b border-border overflow-hidden shrink-0"
          >
            <div className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Search className="w-4 h-4" />
                  Search Messages
                </h3>
                <button
                  onClick={() => {
                    setIsSearchOpen(false);
                    setSearchQuery('');
                    setSearchSender('');
                    setSearchDate('');
                    setSearchResults(null);
                  }}
                  className="p-1 hover:bg-muted rounded-full text-muted-foreground transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        saveSearch(searchQuery);
                        void performSearch();
                      }
                    }}
                    placeholder="Search or use operators (from:, in:, has:attachment)..."
                    className="w-full rounded-lg border border-input bg-background py-2 pl-9 pr-4 text-sm text-foreground transition-all focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20"
                  />
                </div>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="text"
                    value={searchSender}
                    onChange={(e) => setSearchSender(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void performSearch();
                    }}
                    placeholder="Sender..."
                    className="w-full rounded-lg border border-input bg-background py-2 pl-9 pr-4 text-sm text-foreground transition-all focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20"
                  />
                </div>
                <div className="relative">
                  <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="date"
                    value={searchDate}
                    onChange={(e) => setSearchDate(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void performSearch();
                    }}
                    className="w-full rounded-lg border border-input bg-background py-2 pl-9 pr-4 text-sm text-foreground transition-all focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20"
                  />
                </div>
              </div>

              {/* Recent Searches */}
              {!searchQuery && !searchSender && !searchDate && recentSearches.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Clock className="w-3 h-3" />
                    Recent Searches
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {recentSearches.map((s, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          setSearchQuery(s);
                          void performSearch({ query: s });
                        }}
                        className="flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted/70"
                      >
                        {s}
                        <X
                          className="h-3 w-3 text-muted-foreground/55 hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            setRecentSearches((prev) => prev.filter((item) => item !== s));
                          }}
                        />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Search Results */}
              {(searchQuery || searchSender || searchDate) && searchResults !== null && (
                <div className="mt-4 overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-sm">
                  <div className="px-4 py-2 bg-muted/70 border-b border-border flex items-center justify-between">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                      {isSearching ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" aria-hidden />
                          Searching…
                        </>
                      ) : (
                        `${searchResults.length} Results Found`
                      )}
                    </span>
                    <div className="flex gap-2">
                      <span className="text-[10px] text-muted-foreground italic">
                        Tip: use from:user or in:bubble
                      </span>
                    </div>
                  </div>
                  <div className="max-h-64 overflow-y-auto custom-scrollbar">
                    {isSearching ? (
                      <div className="p-8 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                        <Loader2 className="w-8 h-8 animate-spin text-primary/80" aria-hidden />
                        <p className="text-sm">Searching messages…</p>
                      </div>
                    ) : searchResults.length > 0 ? (
                      searchResults.map((msg) => (
                        <div
                          key={msg.id}
                          className="p-3 hover:bg-muted/70 border-b border-border last:border-0 transition-colors cursor-pointer"
                          onClick={() => {
                            // In a real app, we'd scroll to this message
                            // For now, just close search
                            setIsSearchOpen(false);
                          }}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-foreground">
                                {msg.sender}
                              </span>
                              <span className="text-[10px] px-1.5 py-0.5 bg-muted text-muted-foreground rounded font-medium">
                                #{msg.department}
                              </span>
                              {msg.attachments && msg.attachments.length > 0 && (
                                <Paperclip className="w-3 h-3 text-primary/80" />
                              )}
                            </div>
                            <span className="text-[10px] text-muted-foreground">
                              {formatMessageTimestamp(msg.timestamp)}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {renderMessageContent(msg.content)}
                          </p>
                        </div>
                      ))
                    ) : (
                      <div className="p-8 text-center">
                        <MessageSquare className="w-8 h-8 text-muted-foreground/35 mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">
                          No messages match your search.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Messages */}
      <div className="flex-1 flex overflow-hidden">
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6 scroll-smooth">
          <AnimatePresence initial={false}>
            {displayMessages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  'flex gap-4 group relative',
                  activeThreadParent?.id === msg.id && 'bg-primary/15 -mx-6 px-6 py-2',
                )}
              >
                <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center text-primary font-bold shrink-0 overflow-hidden border border-border">
                  {msg.senderAvatar ? (
                    <img
                      src={msg.senderAvatar}
                      alt={msg.sender}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    msg.sender[0]
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="font-bold text-foreground">{msg.sender}</span>
                    {msg.department === ALL_BUBBLES_LABEL && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-primary/10 text-primary rounded-full font-bold border border-primary/20">
                        {ALL_BUBBLES_LABEL}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {formatMessageTimestamp(msg.timestamp)}
                    </span>
                  </div>
                  <div className="text-foreground leading-relaxed mt-0.5">
                    {renderMessageContent(msg.content)}
                  </div>
                  {msg.attachments && msg.attachments.length > 0 && (
                    <MessageAttachmentThumbnails
                      attachments={msg.attachments}
                      onOpenAttachment={(i) =>
                        setMediaModal({ attachments: msg.attachments!, index: i })
                      }
                    />
                  )}

                  {/* Thread Indicator */}
                  {msg.threadCount && msg.threadCount > 0 ? (
                    <button
                      onClick={() => handleOpenThread(msg)}
                      className="mt-2 flex items-center gap-2 text-[10px] font-bold text-primary hover:text-primary transition-colors bg-primary/10 px-2 py-1 rounded-md border border-primary/20"
                    >
                      <MessageSquare className="w-3 h-3" />
                      {msg.threadCount} {msg.threadCount === 1 ? 'reply' : 'replies'}
                      {notifications.some(
                        (n) => n.type === 'thread_reply' && n.relatedId === msg.id && !n.read,
                      ) && (
                        <span className="animate-pulse rounded-full bg-destructive px-1 py-0.5 text-[7px] font-medium uppercase tracking-tighter text-destructive-foreground">
                          New
                        </span>
                      )}
                    </button>
                  ) : (
                    <button
                      onClick={() => handleOpenThread(msg)}
                      className="mt-1 opacity-0 group-hover:opacity-100 flex items-center gap-1 text-[10px] font-bold text-muted-foreground hover:text-primary transition-all"
                    >
                      <MessageSquare className="w-3 h-3" />
                      Reply in thread
                    </button>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Thread Panel */}
        <ThreadPanel
          activeThreadParent={activeThreadParent}
          threadMessages={threadMessages}
          canPostMessages={canPostMessages}
          onClose={() => setActiveThreadParent(null)}
          onSendMessage={async (content, files) => {
            if (!activeThreadParent) return false;
            return sendMessage(content, activeThreadParent.id, files);
          }}
          onOpenAttachment={(attachments, index) => setMediaModal({ attachments, index })}
          renderMessageContent={renderMessageContent}
          sending={sendingAttachments}
        />
      </div>

      {/* Mention Suggestions */}
      <AnimatePresence>
        {showMentions && filteredMembers.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute bottom-24 left-6 z-50 w-64 overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-2xl"
          >
            <div className="p-2 bg-muted/70 border-b border-border flex items-center gap-2">
              <AtSign className="w-3 h-3 text-primary" />
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                Mention Team Member
              </span>
            </div>
            <div className="max-h-48 overflow-y-auto custom-scrollbar">
              {filteredMembers.map((member, idx) => (
                <button
                  key={member.id}
                  onClick={() => insertMention(member.name)}
                  className={cn(
                    'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
                    idx === mentionIndex
                      ? 'bg-primary/10 text-primary'
                      : 'hover:bg-muted/70 text-foreground',
                  )}
                >
                  <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center text-[10px] font-bold text-primary">
                    {member.name[0]}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold">{member.name}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {member.email || 'Email hidden'}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {showTaskMentions && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute bottom-24 left-6 z-50 w-80 overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-2xl"
          >
            <div className="p-2 bg-muted/70 border-b border-border flex items-center gap-2">
              <Hash className="h-3 w-3 text-[var(--accent-green-text)]" />
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                Link card / Feature
              </span>
            </div>
            <div className="max-h-48 overflow-y-auto custom-scrollbar">
              {allTasks.filter((t) =>
                t.title.toLowerCase().includes(taskMentionSearch.toLowerCase()),
              ).length === 0 ? (
                <div className="p-4 text-center">
                  <p className="text-xs text-muted-foreground">No cards found</p>
                </div>
              ) : (
                allTasks
                  .filter((t) => t.title.toLowerCase().includes(taskMentionSearch.toLowerCase()))
                  .map((task, idx) => (
                    <button
                      key={task.id}
                      onClick={() => insertTaskMention(task.title)}
                      className={cn(
                        'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
                        idx === taskMentionIndex
                          ? 'bg-[var(--accent-green-bg)] text-[var(--accent-green-text)]'
                          : 'text-foreground hover:bg-muted/70',
                      )}
                    >
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-[color:color-mix(in_srgb,var(--accent-green)_22%,transparent)] text-[10px] font-bold text-[var(--accent-green-text)]">
                        {task.type === 'request' ? (
                          <Zap className="w-3 h-3" />
                        ) : task.type === 'idea' ? (
                          <Lightbulb className="w-3 h-3" />
                        ) : (
                          <CheckSquare className="w-3 h-3" />
                        )}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm font-semibold truncate">{task.title}</span>
                        <span className="text-[10px] text-muted-foreground truncate">
                          {task.status}
                        </span>
                      </div>
                    </button>
                  ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <MessageMediaModal
        open={mediaModal !== null}
        onOpenChange={(open) => {
          if (!open) setMediaModal(null);
        }}
        attachments={mediaModal?.attachments ?? []}
        initialIndex={mediaModal?.index ?? 0}
      />

      {/* Input */}
      <div className="p-6 pt-0">
        <input
          ref={attachmentInputRef}
          type="file"
          className="hidden"
          multiple
          accept={MESSAGE_ATTACHMENT_FILE_ACCEPT}
          onChange={handleAttachmentPick}
        />
        {attachmentError && (
          <p className="mb-2 px-1 text-xs text-destructive" role="alert">
            {attachmentError}
          </p>
        )}
        {pendingFiles.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5 px-1">
            {pendingFiles.map((f, i) => (
              <span
                key={`${f.name}-${i}`}
                className="inline-flex max-w-[200px] items-center gap-1 rounded-md border border-border bg-muted/70 px-2 py-1 text-[10px] text-foreground"
              >
                <span className="truncate">{f.name}</span>
                <button
                  type="button"
                  className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={() => setPendingFiles((p) => p.filter((_, j) => j !== i))}
                  aria-label="Remove file"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <button
            type="button"
            className="shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-primary disabled:opacity-30"
            disabled={!canPostMessages || !canPostInComposer || sendingAttachments}
            title="Attach image, video, or document"
            aria-label="Attach file"
            onClick={() => attachmentInputRef.current?.click()}
          >
            <Paperclip className="h-5 w-5" />
          </button>
          <div className="relative min-w-0 flex-1">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={handleInputChange}
              onKeyDown={(e) => {
                if (showMentions && filteredMembers.length > 0) {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setMentionIndex((prev) => (prev + 1) % filteredMembers.length);
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setMentionIndex(
                      (prev) => (prev - 1 + filteredMembers.length) % filteredMembers.length,
                    );
                  } else if (e.key === 'Enter' || e.key === 'Tab') {
                    e.preventDefault();
                    insertMention(filteredMembers[mentionIndex].name);
                  } else if (e.key === 'Escape') {
                    setShowMentions(false);
                  }
                } else if (showTaskMentions) {
                  const filtered = allTasks.filter((t) =>
                    t.title.toLowerCase().includes(taskMentionSearch.toLowerCase()),
                  );
                  if (filtered.length > 0) {
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      setTaskMentionIndex((prev) => (prev + 1) % filtered.length);
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setTaskMentionIndex((prev) => (prev - 1 + filtered.length) % filtered.length);
                    } else if (e.key === 'Enter' || e.key === 'Tab') {
                      e.preventDefault();
                      if (filtered[taskMentionIndex]) {
                        insertTaskMention(filtered[taskMentionIndex].title);
                      }
                    }
                  }
                  if (e.key === 'Escape') {
                    setShowTaskMentions(false);
                  }
                }
              }}
              placeholder={activeBubble ? `Message #${activeBubble.name}` : 'Select a bubble…'}
              disabled={!canPostMessages || !canPostInComposer || sendingAttachments}
              className="w-full rounded-xl border border-input bg-background px-4 py-3 pr-12 text-foreground transition-all placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={
                !input.trim() || !canPostMessages || !canPostInComposer || sendingAttachments
              }
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-primary hover:bg-primary/10 rounded-lg disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
            >
              {sendingAttachments ? (
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </button>
          </div>
        </form>
        <p className="mt-2 px-1 text-[10px] text-muted-foreground">
          <b>Return</b> to send (after attaching, pick files then send) • <b>Shift + Return</b> for
          new line • <b>@</b> to mention
        </p>
      </div>
    </div>
  );
}
