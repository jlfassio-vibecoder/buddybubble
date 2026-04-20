import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Hash,
  Info,
  Search,
  Bell,
  Star,
  X,
  Calendar as CalendarIcon,
  User,
  MessageSquare,
  Clock,
  Paperclip,
  PanelLeftClose,
  Loader2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { supabaseClientErrorMessage } from '@/lib/supabase-client-error';
import { cn } from '@/lib/utils';
import { formatMessageTimestamp } from '@/lib/message-timestamp';
import { rowToChatMessage, searchJoinRowToChatMessage } from '@/lib/chat-message-mapper';
import { createClient } from '@utils/supabase/client';
import { guestTaskAssignmentVisibilityOr, isGuestWorkspaceRole } from '@/lib/guest-task-query';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { useUserProfileStore } from '@/store/userProfileStore';
import { useLiveVideoStore } from '@/store/liveVideoStore';
import type { BubbleRow, TaskRow } from '@/types/database';
import {
  ALL_BUBBLES_BUBBLE_ID,
  ALL_BUBBLES_LABEL,
  defaultBubbleIdForWrites,
} from '@/lib/all-bubbles';
import type { Database } from '@/types/database';
import type { MessageAttachment } from '@/types/message-attachment';
import type { ChatMessage, ChatUserSnapshot, SearchMessageJoinRow } from '@/types/chat';
import { MESSAGE_ATTACHMENT_FILE_ACCEPT } from '@/lib/message-attachment-limits';
import type { JoinRequestPreviewItem } from '@/lib/workspace-join-requests';
import { ChatFeedTaskCard } from './ChatFeedTaskCard';
import { ChatMessageRow } from './ChatMessageRow';
import { RichMessageComposer } from './RichMessageComposer';
import { ThreadPanel } from './ThreadPanel';
import { MessageMediaModal } from './MessageMediaModal';
import type { OpenTaskOptions } from '@/types/open-task-options';
import { resolveTaskCommentMessageIdFromBubbleAnchor } from '@/lib/resolve-task-comment-from-bubble-anchor';
import { useTaskBubbleUps } from '@/hooks/use-task-bubble-ups';
import { useCoachTypingWait } from '@/hooks/useCoachTypingWait';
import { useMessageThread, type PeerThreadReplyInsertPayload } from '@/hooks/useMessageThread';
import { CoachTypingIndicator } from '@/components/chat/CoachTypingIndicator';
import { toChatUserSnapshot, type MessageThreadFilter } from '@/lib/message-thread';
import { liveSessionInviteMetadataToJson } from '@/types/live-session-invite';

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

function dayBoundsIso(searchDate: string): { start: string; end: string } | null {
  if (!searchDate || !/^\d{4}-\d{2}-\d{2}$/.test(searchDate)) return null;
  const [y, mo, d] = searchDate.split('-').map(Number);
  const start = new Date(y, mo - 1, d, 0, 0, 0, 0);
  const end = new Date(y, mo - 1, d, 23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString() };
}

export type ChatAreaProps = {
  /** Bubbles in the active BuddyBubble (used for aggregate "All Bubbles" view and per-message labels). */
  bubbles: BubbleRow[];
  /** Matches `messages_insert` / `can_view_bubble` — not the same as task write. */
  canPostMessages: boolean;
  /** Required to use "Create and attach card" in the composer (Kanban write). */
  canWriteTasks?: boolean;
  /**
   * Opens `TaskModal` in create mode for the given bubble; run `onTaskCreated` after the task is saved
   * (chat feed cards — post a message with `attached_task_id`).
   */
  onOpenCreateTaskForChat?: (opts: {
    bubbleId: string | null;
    onTaskCreated: (taskId: string) => void;
  }) => void;
  onCollapse?: () => void;
  onOpenTask?: (taskId: string, opts?: OpenTaskOptions) => void;
  /** Workspace admins: pending join requests surfaced in the header bell (collapsed-sidebar fallback). */
  joinRequestBellPreview?: JoinRequestPreviewItem[];
  /** Centered above the channel row — workspace (BuddyBubble) name, same as Bubbles rail. */
  workspaceTitle?: string;
};

export function ChatArea({
  bubbles,
  canPostMessages,
  canWriteTasks = false,
  onOpenCreateTaskForChat,
  onCollapse = () => {},
  onOpenTask = () => {},
  joinRequestBellPreview = [],
  workspaceTitle,
}: ChatAreaProps) {
  const router = useRouter();
  const activeBubble = useWorkspaceStore((s) => s.activeBubble);
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id) ?? null;
  const workspaceName = useWorkspaceStore((s) => s.activeWorkspace?.name);
  const workspaceRole = useWorkspaceStore((s) => s.activeWorkspace?.role ?? null);
  const myProfile = useUserProfileStore((s) => s.profile);

  const [input, setInput] = useState('');
  /** Latest composer text for chat-card handoff (read when the task modal saves). */
  const latestInputRef = useRef('');
  useEffect(() => {
    latestInputRef.current = input;
  }, [input]);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchSender, setSearchSender] = useState('');
  const [searchDate, setSearchDate] = useState('');
  const [activeThreadParent, setActiveThreadParent] = useState<ChatMessage | null>(null);
  const [peerThreadReplyNotifications, setPeerThreadReplyNotifications] = useState<
    NotificationStub[]
  >([]);
  const [openThreadFromPeerIntent, setOpenThreadFromPeerIntent] = useState<{
    threadRootMessageId: string;
  } | null>(null);
  const [threadComposerFocusNonce, setThreadComposerFocusNonce] = useState(0);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('recentSearches') : null;
    return saved ? JSON.parse(saved) : [];
  });
  const [searchResults, setSearchResults] = useState<ChatMessage[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [mediaModal, setMediaModal] = useState<{
    attachments: MessageAttachment[];
    index: number;
  } | null>(null);

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

  const notifications = useMemo(
    () => [...joinRequestNotifications, ...peerThreadReplyNotifications],
    [joinRequestNotifications, peerThreadReplyNotifications],
  );

  const onMarkNotificationRead = useCallback((id: string) => {
    setPeerThreadReplyNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
    );
  }, []);

  /** Resolves bubble coach+embed anchor to task-scoped `commentThreadMessageId` when opening TaskModal. */
  const openTaskFromChat = useCallback(
    async (taskId: string, opts?: OpenTaskOptions) => {
      const merged: OpenTaskOptions = { ...(opts ?? {}) };
      const anchor = opts?.taskCommentAnchorBubbleMessageId?.trim();
      delete merged.taskCommentAnchorBubbleMessageId;
      if (anchor && !merged.commentThreadMessageId) {
        try {
          const supabase = createClient();
          const resolved = await resolveTaskCommentMessageIdFromBubbleAnchor(
            supabase,
            taskId,
            anchor,
          );
          if (resolved) {
            merged.tab = 'comments';
            merged.commentThreadMessageId = resolved;
            merged.viewMode = merged.viewMode ?? 'full';
          }
        } catch {
          /* open without deep link */
        }
      }
      onOpenTask(taskId, merged);
    },
    [onOpenTask],
  );

  const handlePeerThreadReplyInsert = useCallback((payload: PeerThreadReplyInsertPayload) => {
    setPeerThreadReplyNotifications((prev) => {
      const nid = `tr:${payload.replyMessageId}`;
      if (prev.some((n) => n.id === nid)) return prev;
      return [
        ...prev,
        {
          id: nid,
          userId: '',
          title: 'New reply in thread',
          content: payload.contentPreview,
          type: 'thread_reply' as const,
          relatedId: payload.threadRootMessageId,
          read: false,
          timestamp: new Date(),
        },
      ];
    });
    setOpenThreadFromPeerIntent({ threadRootMessageId: payload.threadRootMessageId });
  }, []);

  const scrollRef = useRef<HTMLDivElement>(null);
  const composerPopoverRef = useRef<HTMLDivElement>(null);

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

  const messageThreadFilter = useMemo<MessageThreadFilter | null>(() => {
    if (!activeBubble) return null;
    if (activeBubble.id === ALL_BUBBLES_BUBBLE_ID) {
      if (realBubbleIds.length === 0) return null;
      return { scope: 'all_bubbles', bubbleIds: realBubbleIds };
    }
    return { scope: 'bubble', bubbleId: activeBubble.id };
  }, [activeBubble, realBubbleIds]);

  const {
    messages,
    userById,
    teamMembers,
    agentAuthUserIds,
    replyCounts,
    error: messageError,
    sending: sendingAttachments,
    sendMessage,
    clearError,
    setError,
  } = useMessageThread({
    filter: messageThreadFilter,
    workspaceId,
    bubbles,
    canPostMessages,
    currentUserId: myProfile?.id ?? null,
    onPeerThreadReplyInsert: handlePeerThreadReplyInsert,
  });

  const coachScopeRootMessages = useMemo(
    () => messages.filter((m) => m.parent_id == null || m.parent_id === ''),
    [messages],
  );
  const coachScopeThreadMessages = useMemo(() => {
    const pid = activeThreadParent?.id;
    if (!pid) return [];
    return messages.filter((m) => m.id === pid || m.parent_id === pid);
  }, [messages, activeThreadParent?.id]);

  const coachWaitMain = useCoachTypingWait({
    messages: coachScopeRootMessages,
    myUserId: myProfile?.id,
  });
  const coachWaitThread = useCoachTypingWait({
    messages: coachScopeThreadMessages,
    myUserId: myProfile?.id,
  });

  const coachTypingAvatarUrl = useMemo(() => {
    const id = agentAuthUserIds[0];
    if (!id) return null;
    return userById[id]?.avatar_url ?? null;
  }, [agentAuthUserIds, userById]);

  useEffect(() => {
    coachWaitMain.clear();
    coachWaitThread.clear();
  }, [activeBubble?.id, coachWaitMain.clear, coachWaitThread.clear]);

  useEffect(() => {
    coachWaitThread.clear();
  }, [activeThreadParent?.id, coachWaitThread.clear]);

  const chatBubbleTaskIds = useMemo(() => {
    const s = new Set<string>();
    for (const m of messages) {
      if (m.attached_task_id) s.add(m.attached_task_id);
    }
    return [...s];
  }, [messages]);

  const { bubbleUpPropsFor } = useTaskBubbleUps(chatBubbleTaskIds);

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
    return messages.map((row) => {
      const base = userById[row.user_id];
      const user: ChatUserSnapshot | undefined =
        myProfile && row.user_id === myProfile.id ? toChatUserSnapshot(myProfile) : base;
      return rowToChatMessage(row, user, bubbleNameById[row.bubble_id] ?? bubbleName, replyCounts);
    });
  }, [messages, userById, myProfile, bubbleNameById, bubbleName, replyCounts]);

  const displayMessages = useMemo(() => {
    return allMessages.filter((m) => !m.parentId);
  }, [allMessages]);

  const threadMessages = useMemo(() => {
    if (!activeThreadParent) return [];
    return allMessages.filter((m) => m.parentId === activeThreadParent.id);
  }, [allMessages, activeThreadParent]);

  useEffect(() => {
    if (!openThreadFromPeerIntent) return;
    const parent = allMessages.find((m) => m.id === openThreadFromPeerIntent.threadRootMessageId);
    if (!parent) return;
    setActiveThreadParent(parent);
    setOpenThreadFromPeerIntent(null);
    setThreadComposerFocusNonce((n) => n + 1);
  }, [openThreadFromPeerIntent, allMessages]);

  useEffect(() => {
    setPeerThreadReplyNotifications([]);
    setOpenThreadFromPeerIntent(null);
  }, [activeBubble?.id]);

  useEffect(() => {
    const id = activeThreadParent?.id;
    if (!id) return;
    setPeerThreadReplyNotifications((prev) =>
      prev.map((n) => (n.type === 'thread_reply' && n.relatedId === id ? { ...n, read: true } : n)),
    );
  }, [activeThreadParent?.id]);

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
      setActiveThreadParent(null);
      return;
    }
    if (activeBubble.id === ALL_BUBBLES_BUBBLE_ID && realBubbleIds.length === 0) {
      setActiveThreadParent(null);
    }
  }, [activeBubble, realBubbleIds.length]);

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
      let taskQuery = supabase
        .from('tasks')
        .select('*')
        .in('bubble_id', bubbleIds)
        .is('archived_at', null)
        .order('bubble_id', { ascending: true })
        .order('position', { ascending: true });
      if (isGuestWorkspaceRole(workspaceRole) && myProfile?.id) {
        taskQuery = taskQuery.or(guestTaskAssignmentVisibilityOr(myProfile.id));
      }
      const { data, error } = await taskQuery;
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
  }, [workspaceId, bubbles, workspaceRole, myProfile?.id]);

  const handleStartLiveWorkout = useCallback(() => {
    if (!workspaceId || !myProfile?.id) {
      setError('You need a socialspace and profile to start a live workout.');
      return;
    }
    if (pendingFiles.length > 0) {
      setError('Remove pending attachments before starting a live workout.');
      return;
    }
    setError(null);

    const threadParentId = activeThreadParent?.id;
    let targetBubbleId: string | null = null;
    if (threadParentId) {
      const parentRow = messages.find((m) => m.id === threadParentId);
      targetBubbleId = parentRow?.bubble_id ?? null;
    } else if (!activeBubble) {
      setError('Select a bubble to post.');
      return;
    } else if (activeBubble.id === ALL_BUBBLES_BUBBLE_ID) {
      targetBubbleId = defaultBubbleIdForWrites(bubbles);
    } else {
      targetBubbleId = activeBubble.id;
    }
    if (!targetBubbleId) {
      setError(
        threadParentId
          ? 'Could not find thread parent. Try closing and reopening the thread.'
          : 'Add a bubble in this socialspace before posting.',
      );
      return;
    }

    void (async () => {
      const wsId = workspaceId;
      const sessionId = crypto.randomUUID();
      const shortId = sessionId.replace(/-/g, '').slice(0, 8);
      const channelId = `bb-live-${wsId}-${shortId}`;
      const createdAt = new Date().toISOString();
      const metadata = liveSessionInviteMetadataToJson({
        type: 'live_session',
        workspaceId: wsId,
        sessionId,
        channelId,
        hostUserId: myProfile.id,
        mode: 'workout',
        createdAt,
      });
      const content = 'Started a live workout — tap Join below.';
      const sent = await sendMessage(content, threadParentId, undefined, { metadata });
      if (!sent) return;
      useLiveVideoStore.getState().joinSession({
        workspaceId: wsId,
        sessionId,
        channelId,
        hostUserId: myProfile.id,
        mode: 'workout',
        inviteMessageId: sent.messageId,
      });
    })();
  }, [
    activeBubble,
    activeThreadParent?.id,
    bubbles,
    messages,
    myProfile?.id,
    pendingFiles.length,
    sendMessage,
    setError,
    workspaceId,
  ]);

  const handleComposeChatCard = useCallback(() => {
    if (!canWriteTasks || !onOpenCreateTaskForChat) return;
    if (pendingFiles.length > 0) {
      setError('Remove pending attachments before posting a card, or send files separately.');
      return;
    }
    setError(null);

    let targetBubbleId: string | null = null;
    const threadParentId = activeThreadParent?.id;
    if (threadParentId) {
      const parentRow = messages.find((m) => m.id === threadParentId);
      targetBubbleId = parentRow?.bubble_id ?? null;
    } else if (!activeBubble) {
      setError('Select a bubble to post.');
      return;
    } else if (activeBubble.id === ALL_BUBBLES_BUBBLE_ID) {
      targetBubbleId = defaultBubbleIdForWrites(bubbles);
    } else {
      targetBubbleId = activeBubble.id;
    }
    if (!targetBubbleId) {
      setError(
        threadParentId
          ? 'Could not find thread parent. Try closing and reopening the thread.'
          : 'Add a bubble in this socialspace before posting.',
      );
      return;
    }

    onOpenCreateTaskForChat({
      bubbleId: targetBubbleId,
      onTaskCreated: (taskId) => {
        const caption = latestInputRef.current.trim();
        void (async () => {
          const sent = await sendMessage(caption, threadParentId, undefined, {
            attachedTaskId: taskId,
          });
          if (sent) {
            setInput('');
          }
        })();
      },
    });
  }, [
    activeBubble,
    activeThreadParent?.id,
    bubbles,
    canWriteTasks,
    messages,
    onOpenCreateTaskForChat,
    pendingFiles.length,
    sendMessage,
    setError,
  ]);

  const canPostInComposer =
    !!activeBubble &&
    (activeBubble.id !== ALL_BUBBLES_BUBBLE_ID || defaultBubbleIdForWrites(bubbles) !== null);

  const richMentionConfig = useMemo(
    () => ({
      members: teamMembersResolved.map((m) => ({
        id: m.id,
        name: m.name,
        email: m.email,
      })),
    }),
    [teamMembersResolved],
  );

  const richSlashConfig = useMemo(() => ({ tasks: allTasks }), [allTasks]);

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
          .select(
            '*, users!inner(full_name, avatar_url), bubbles!inner(name), tasks!messages_attached_task_id_fkey(*)',
          )
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
    setThreadComposerFocusNonce((n) => n + 1);
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
                  onClick={() => void openTaskFromChat(task.id, { viewMode: 'full' })}
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
    <div
      ref={composerPopoverRef}
      className="relative flex h-full min-h-0 min-w-0 w-full flex-col bg-background"
    >
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
                              if (n.type === 'thread_reply') {
                                const parent = allMessages.find((m) => m.id === n.relatedId);
                                if (parent) {
                                  setActiveThreadParent(parent);
                                  setThreadComposerFocusNonce((x) => x + 1);
                                }
                              }
                              onMarkNotificationRead(n.id);
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
                          {msg.attachedTask ? (
                            <ChatFeedTaskCard
                              task={msg.attachedTask}
                              onOpenTask={(taskId, opts) => void openTaskFromChat(taskId, opts)}
                              bubbleUp={bubbleUpPropsFor(msg.attachedTask.id)}
                            />
                          ) : null}
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
              >
                <ChatMessageRow
                  message={msg}
                  density="rail"
                  renderContent={renderMessageContent}
                  onOpenAttachment={(attachments, index) => setMediaModal({ attachments, index })}
                  onOpenTask={(taskId, opts) => onOpenTask?.(taskId, opts)}
                  bubbleUpPropsFor={bubbleUpPropsFor}
                  onOpenThread={handleOpenThread}
                  isActiveThreadParent={activeThreadParent?.id === msg.id}
                  threadUnread={notifications.some(
                    (n) => n.type === 'thread_reply' && n.relatedId === msg.id && !n.read,
                  )}
                  showDepartmentBadgeLabel={ALL_BUBBLES_LABEL}
                  liveSessionViewerUserId={myProfile?.id ?? null}
                />
              </motion.div>
            ))}
          </AnimatePresence>
          {coachWaitMain.isWaitingForCoach ? (
            <div className="mt-6 w-full shrink-0">
              <CoachTypingIndicator density="rail" coachAvatarUrl={coachTypingAvatarUrl} />
            </div>
          ) : null}
        </div>

        {/* Thread Panel */}
        <ThreadPanel
          activeThreadParent={activeThreadParent}
          threadMessages={threadMessages}
          canPostMessages={canPostMessages}
          liveSessionViewerUserId={myProfile?.id ?? null}
          onClose={() => {
            coachWaitThread.clear();
            setActiveThreadParent(null);
          }}
          onSendMessage={async (content, files) => {
            if (!activeThreadParent) return null;
            return await sendMessage(content, activeThreadParent.id, files);
          }}
          onSubmitIntent={coachWaitThread.optimisticIntent}
          onSuccessfulThreadSend={(sent) => {
            coachWaitThread.registerSuccessfulSend(sent);
          }}
          isWaitingForCoach={coachWaitThread.isWaitingForCoach}
          coachTypingAvatarUrl={coachTypingAvatarUrl}
          onOpenAttachment={(attachments, index) => setMediaModal({ attachments, index })}
          onOpenTask={(taskId, opts) => void openTaskFromChat(taskId, opts)}
          bubbleUpPropsFor={bubbleUpPropsFor}
          renderMessageContent={renderMessageContent}
          sending={sendingAttachments}
          composerFocusNonce={threadComposerFocusNonce}
        />
      </div>

      <MessageMediaModal
        open={mediaModal !== null}
        onOpenChange={(open) => {
          if (!open) setMediaModal(null);
        }}
        attachments={mediaModal?.attachments ?? []}
        initialIndex={mediaModal?.index ?? 0}
      />

      <RichMessageComposer
        density="rail"
        popoverContainerRef={composerPopoverRef}
        value={input}
        onChange={(next, _meta) => setInput(next)}
        onSubmitIntent={coachWaitMain.optimisticIntent}
        onSubmit={async ({ text, files }) => {
          if ((!text.trim() && (!files || files.length === 0)) || sendingAttachments) return false;
          const sent = await sendMessage(text, undefined, files);
          if (!sent) return false;
          setInput('');
          setPendingFiles([]);
          coachWaitMain.registerSuccessfulSend(sent);
          return true;
        }}
        pendingFiles={pendingFiles}
        onPendingFilesChange={setPendingFiles}
        fileAccept={MESSAGE_ATTACHMENT_FILE_ACCEPT}
        onAttachmentFilesSelected={() => clearError()}
        disabled={!canPostMessages || !canPostInComposer || sendingAttachments}
        isSending={sendingAttachments}
        canSubmit={
          (!!input.trim() || pendingFiles.length > 0) && canPostMessages && canPostInComposer
        }
        attachDisabled={!canPostMessages || !canPostInComposer || sendingAttachments}
        createCardDisabled={
          !canPostMessages ||
          !canPostInComposer ||
          !canWriteTasks ||
          !onOpenCreateTaskForChat ||
          pendingFiles.length > 0 ||
          sendingAttachments
        }
        placeholder={activeBubble ? `Message #${activeBubble.name}` : 'Select a bubble…'}
        errorText={messageError}
        mentionConfig={richMentionConfig}
        slashConfig={richSlashConfig}
        onRequestCreateAndAttachCard={handleComposeChatCard}
        features={{
          enableStartLiveWorkout: true,
        }}
        onRequestStartLiveWorkout={handleStartLiveWorkout}
        startLiveWorkoutDisabled={
          !canPostMessages ||
          !canPostInComposer ||
          !workspaceId ||
          !myProfile?.id ||
          pendingFiles.length > 0 ||
          sendingAttachments
        }
        footerHint={
          <>
            <b>Return</b> to send (after attaching, pick files then send) • <b>Shift + Return</b>{' '}
            for new line • <b>@</b> to mention
          </>
        }
      />
    </div>
  );
}
