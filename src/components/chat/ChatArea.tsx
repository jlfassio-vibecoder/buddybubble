import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
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
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';
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
import { ThreadPanel } from './ThreadPanel';

type UserRow = Database['public']['Tables']['users']['Row'];

/** Legacy chat row shape used by the original ChatArea markup */
export type ChatMessage = {
  id: string;
  sender: string;
  senderAvatar?: string;
  content: string;
  timestamp: Date;
  department: string;
  attachments?: { length: number }[];
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
  type: 'thread_reply' | 'task_assigned' | 'mention';
  relatedId: string;
  read: boolean;
  timestamp: Date;
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
  user: UserRow | undefined,
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
  };
}

export type ChatAreaProps = {
  /** Bubbles in the active BuddyBubble (used for aggregate "All Bubbles" view and per-message labels). */
  bubbles: BubbleRow[];
  canWrite: boolean;
  onCollapse?: () => void;
  onOpenTask?: (taskId: string) => void;
};

export function ChatArea({
  bubbles,
  canWrite,
  onCollapse = () => {},
  onOpenTask = () => {},
}: ChatAreaProps) {
  const activeBubble = useWorkspaceStore((s) => s.activeBubble);
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id) ?? null;
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

  const [dbMessages, setDbMessages] = useState<MessageRow[]>([]);
  const [userById, setUserById] = useState<Record<string, UserRow>>({});
  const [teamMembers, setTeamMembers] = useState<UserProfile[]>([]);
  const [allTasks, setAllTasks] = useState<TaskPickerRow[]>([]);

  const notifications: NotificationStub[] = [];
  const onMarkNotificationRead = (_id: string) => {};

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
      const user: UserRow | undefined =
        myProfile && row.user_id === myProfile.id
          ? ({ ...base, ...myProfile, id: myProfile.id } as UserRow)
          : base;
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
          next[u.id] = u as UserRow;
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
          setUserById((prev) => ({ ...prev, [u.id]: u as UserRow }));
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
      const { data } = await supabase
        .from('workspace_members')
        .select('user_id, users ( id, full_name, avatar_url, email, created_at )')
        .eq('workspace_id', workspaceId);
      if (cancelled) return;
      const members: UserProfile[] = [];
      const fromRows: Record<string, UserRow> = {};
      for (const row of data ?? []) {
        const u = (row as { users?: UserRow | UserRow[] | null }).users;
        const usr = Array.isArray(u) ? u[0] : u;
        if (!usr?.id) continue;
        members.push({
          id: usr.id,
          name: usr.full_name?.trim() || usr.email?.split('@')[0] || 'Member',
          email: usr.email ?? '',
          avatar: usr.avatar_url ?? undefined,
        });
        fromRows[usr.id] = usr;
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
        .order('bubble_id', { ascending: true })
        .order('position', { ascending: true });
      if (cancelled) return;
      if (error) {
        console.error('[ChatArea] load tasks for / mentions', error);
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
    async (content: string, parentId?: string) => {
      if (!canWrite || !content.trim()) return;
      let targetBubbleId: string | null = null;
      if (parentId) {
        const parentRow = dbMessages.find((m) => m.id === parentId);
        targetBubbleId = parentRow?.bubble_id ?? null;
      } else if (!activeBubble) {
        return;
      } else if (activeBubble.id === ALL_BUBBLES_BUBBLE_ID) {
        targetBubbleId = defaultBubbleIdForWrites(bubbles);
      } else {
        targetBubbleId = activeBubble.id;
      }
      if (!targetBubbleId) return;
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await supabase.from('messages').insert({
        bubble_id: targetBubbleId,
        user_id: user.id,
        content: content.trim(),
        parent_id: parentId ?? null,
      });
      if (!error) {
        const { data: self } = await supabase
          .from('users')
          .select('id, full_name, avatar_url, email, created_at')
          .eq('id', user.id)
          .maybeSingle();
        if (self) {
          setUserById((prev) => ({ ...prev, [self.id]: self as UserRow }));
        }
      }
    },
    [activeBubble, bubbles, canWrite, dbMessages],
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      void sendMessage(input);
      setInput('');
      setShowMentions(false);
    }
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

      if (
        parsed.hasAttachment &&
        !parsed.cleanQuery &&
        !parsed.fromOperator &&
        !parsed.inOperator &&
        !dateStr
      ) {
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
          console.error('[ChatArea] message search', error);
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
                  className="text-indigo-600 font-bold bg-indigo-50 px-1 rounded border border-indigo-100"
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
                  className="text-emerald-600 font-bold bg-emerald-50 px-1 rounded border border-emerald-100 cursor-pointer hover:bg-emerald-100 transition-colors"
                  title={`View Task: ${task.title}`}
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
    <div className="relative flex h-full min-h-0 min-w-0 w-full flex-col bg-white">
      {/* Header */}
      <header className="h-16 border-b border-slate-200 flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-2">
          <Hash className="h-5 w-5 shrink-0 text-slate-900 opacity-70" aria-hidden />
          <h2 className="font-bold text-slate-900">{activeBubble?.name ?? 'Chat'}</h2>
          <Star className="w-4 h-4 text-slate-300 hover:text-yellow-400 cursor-pointer transition-colors" />
        </div>
        <div className="flex items-center gap-4 text-slate-500">
          <Search
            className={cn(
              'w-5 h-5 cursor-pointer transition-colors',
              isSearchOpen ? 'text-indigo-600' : 'hover:text-slate-900',
            )}
            onClick={() => setIsSearchOpen(!isSearchOpen)}
          />
          <div className="relative">
            <Bell
              className={cn(
                'w-5 h-5 cursor-pointer transition-colors',
                isNotificationsOpen ? 'text-indigo-600' : 'hover:text-slate-900',
              )}
              onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
            />
            {notifications.some((n) => !n.read) && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 border-2 border-white rounded-full" />
            )}

            <AnimatePresence>
              {isNotificationsOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-50"
                >
                  <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                    <h3 className="font-bold text-slate-900 text-sm">Notifications</h3>
                    <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                      {notifications.filter((n) => !n.read).length} New
                    </span>
                  </div>
                  <div className="max-h-96 overflow-y-auto custom-scrollbar">
                    {notifications.length > 0 ? (
                      notifications.map((n) => (
                        <div
                          key={n.id}
                          className={cn(
                            'p-4 border-b border-slate-50 last:border-0 transition-colors cursor-pointer hover:bg-slate-50',
                            !n.read && 'bg-indigo-50/30',
                          )}
                          onClick={() => {
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
                              <p className="text-xs font-bold text-slate-900 mb-1">{n.title}</p>
                              <p className="text-[11px] text-slate-600 leading-relaxed">
                                {n.content}
                              </p>
                              <p className="text-[10px] text-slate-400 mt-2">
                                {format(n.timestamp, 'MMM d, h:mm a')}
                              </p>
                            </div>
                            {!n.read && (
                              <div className="w-2 h-2 bg-indigo-600 rounded-full mt-1 shrink-0" />
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="p-8 text-center">
                        <Bell className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                        <p className="text-sm text-slate-400">No notifications yet.</p>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <Info className="w-5 h-5 cursor-pointer hover:text-slate-900" />
          <button
            onClick={onCollapse}
            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-indigo-600 transition-all"
            title="Collapse Chat"
          >
            <PanelLeftClose className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Search Overlay */}
      <AnimatePresence>
        {isSearchOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-slate-50 border-b border-slate-200 overflow-hidden shrink-0"
          >
            <div className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
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
                  className="p-1 hover:bg-slate-200 rounded-full text-slate-400 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
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
                    className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                  />
                </div>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={searchSender}
                    onChange={(e) => setSearchSender(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void performSearch();
                    }}
                    placeholder="Sender..."
                    className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                  />
                </div>
                <div className="relative">
                  <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="date"
                    value={searchDate}
                    onChange={(e) => setSearchDate(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void performSearch();
                    }}
                    className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                  />
                </div>
              </div>

              {/* Recent Searches */}
              {!searchQuery && !searchSender && !searchDate && recentSearches.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
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
                        className="px-3 py-1 bg-white border border-slate-200 rounded-full text-xs text-slate-600 hover:bg-slate-50 transition-colors flex items-center gap-2"
                      >
                        {s}
                        <X
                          className="w-3 h-3 text-slate-300 hover:text-red-500"
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
                <div className="mt-4 bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                  <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                      {isSearching ? (
                        <>
                          <Loader2
                            className="w-3.5 h-3.5 animate-spin text-indigo-500"
                            aria-hidden
                          />
                          Searching…
                        </>
                      ) : (
                        `${searchResults.length} Results Found`
                      )}
                    </span>
                    <div className="flex gap-2">
                      <span className="text-[10px] text-slate-400 italic">
                        Tip: use from:user or in:bubble
                      </span>
                    </div>
                  </div>
                  <div className="max-h-64 overflow-y-auto custom-scrollbar">
                    {isSearching ? (
                      <div className="p-8 flex flex-col items-center justify-center gap-2 text-slate-400">
                        <Loader2 className="w-8 h-8 animate-spin text-indigo-400" aria-hidden />
                        <p className="text-sm">Searching messages…</p>
                      </div>
                    ) : searchResults.length > 0 ? (
                      searchResults.map((msg) => (
                        <div
                          key={msg.id}
                          className="p-3 hover:bg-slate-50 border-b border-slate-50 last:border-0 transition-colors cursor-pointer"
                          onClick={() => {
                            // In a real app, we'd scroll to this message
                            // For now, just close search
                            setIsSearchOpen(false);
                          }}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-slate-900">{msg.sender}</span>
                              <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded font-medium">
                                #{msg.department}
                              </span>
                              {msg.attachments && msg.attachments.length > 0 && (
                                <Paperclip className="w-3 h-3 text-indigo-400" />
                              )}
                            </div>
                            <span className="text-[10px] text-slate-400">
                              {format(msg.timestamp, 'MMM d, h:mm a')}
                            </span>
                          </div>
                          <p className="text-xs text-slate-600 line-clamp-2">
                            {renderMessageContent(msg.content)}
                          </p>
                        </div>
                      ))
                    ) : (
                      <div className="p-8 text-center">
                        <MessageSquare className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                        <p className="text-sm text-slate-400">No messages match your search.</p>
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
                  activeThreadParent?.id === msg.id && 'bg-indigo-50/50 -mx-6 px-6 py-2',
                )}
              >
                <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold shrink-0 overflow-hidden border border-slate-100">
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
                    <span className="font-bold text-slate-900">{msg.sender}</span>
                    {msg.department === ALL_BUBBLES_LABEL && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-indigo-50 text-indigo-600 rounded-full font-bold border border-indigo-100">
                        {ALL_BUBBLES_LABEL}
                      </span>
                    )}
                    <span className="text-xs text-slate-400">
                      {format(msg.timestamp, 'h:mm a')}
                    </span>
                  </div>
                  <div className="text-slate-700 leading-relaxed mt-0.5">
                    {renderMessageContent(msg.content)}
                  </div>

                  {/* Thread Indicator */}
                  {msg.threadCount && msg.threadCount > 0 ? (
                    <button
                      onClick={() => handleOpenThread(msg)}
                      className="mt-2 flex items-center gap-2 text-[10px] font-bold text-indigo-600 hover:text-indigo-700 transition-colors bg-indigo-50 px-2 py-1 rounded-md border border-indigo-100"
                    >
                      <MessageSquare className="w-3 h-3" />
                      {msg.threadCount} {msg.threadCount === 1 ? 'reply' : 'replies'}
                      {notifications.some(
                        (n) => n.type === 'thread_reply' && n.relatedId === msg.id && !n.read,
                      ) && (
                        <span className="px-1 py-0.5 bg-red-500 text-white text-[7px] rounded-full uppercase tracking-tighter animate-pulse">
                          New
                        </span>
                      )}
                    </button>
                  ) : (
                    <button
                      onClick={() => handleOpenThread(msg)}
                      className="mt-1 opacity-0 group-hover:opacity-100 flex items-center gap-1 text-[10px] font-bold text-slate-400 hover:text-indigo-600 transition-all"
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
          canWrite={canWrite}
          onClose={() => setActiveThreadParent(null)}
          onSendMessage={(content) => {
            if (!activeThreadParent) return;
            void sendMessage(content, activeThreadParent.id);
          }}
          renderMessageContent={renderMessageContent}
        />
      </div>

      {/* Mention Suggestions */}
      <AnimatePresence>
        {showMentions && filteredMembers.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute bottom-24 left-6 w-64 bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden z-50"
          >
            <div className="p-2 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
              <AtSign className="w-3 h-3 text-indigo-600" />
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
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
                      ? 'bg-indigo-50 text-indigo-700'
                      : 'hover:bg-slate-50 text-slate-700',
                  )}
                >
                  <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-[10px] font-bold text-indigo-700">
                    {member.name[0]}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold">{member.name}</span>
                    <span className="text-[10px] text-slate-400">{member.email}</span>
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
            className="absolute bottom-24 left-6 w-80 bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden z-50"
          >
            <div className="p-2 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
              <Hash className="w-3 h-3 text-emerald-600" />
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                Link Task / Feature
              </span>
            </div>
            <div className="max-h-48 overflow-y-auto custom-scrollbar">
              {allTasks.filter((t) =>
                t.title.toLowerCase().includes(taskMentionSearch.toLowerCase()),
              ).length === 0 ? (
                <div className="p-4 text-center">
                  <p className="text-xs text-slate-400">No tasks found</p>
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
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'hover:bg-slate-50 text-slate-700',
                      )}
                    >
                      <div className="w-7 h-7 rounded bg-emerald-100 flex items-center justify-center text-emerald-600 text-[10px] font-bold shrink-0">
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
                        <span className="text-[10px] text-slate-400 truncate">{task.status}</span>
                      </div>
                    </button>
                  ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input */}
      <div className="p-6 pt-0">
        <form onSubmit={handleSubmit} className="relative flex items-center">
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
            disabled={!canWrite || !canPostInComposer}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 pr-12 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!input.trim() || !canWrite || !canPostInComposer}
            className="absolute right-2 p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
          >
            <Send className="w-5 h-5" />
          </button>
        </form>
        <p className="text-[10px] text-slate-400 mt-2 px-1">
          <b>Return</b> to send • <b>Shift + Return</b> for new line • <b>@</b> to mention
          {false && (
            <span className="ml-2 text-indigo-500 font-bold">• Broadcast to all bubbles</span>
          )}
        </p>
      </div>
    </div>
  );
}
