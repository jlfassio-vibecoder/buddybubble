'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@utils/supabase/client';
import {
  isSupabaseBenignRequestAbort,
  supabaseClientErrorMessage,
} from '@/lib/supabase-client-error';
import {
  buildReplyCounts,
  fetchEmbeddedTaskForMessage,
  MESSAGES_SELECT_WITH_TASK,
  messageThreadChannelName,
  messageThreadFilterKey,
  toChatUserSnapshot,
  type MessageThreadFilter,
} from '@/lib/message-thread';
import { defaultBubbleIdForWrites } from '@/lib/all-bubbles';
import type {
  AgentDefinitionRow,
  BubbleRow,
  Json,
  MessageRow,
  MessageRowWithEmbeddedTask,
  TaskRow,
} from '@/types/database';
import type { ChatUserSnapshot } from '@/types/chat';
import type { AgentDefinitionLite } from '@/lib/agents/resolveTargetAgent';
import { sortAgentEntries, UNBOUND_AGENT_SORT_ORDER } from '@/lib/agents/sortAgentEntries';
import {
  attachmentsToJson,
  classifyFileKind,
  inferMimeFromFileName,
  type MessageAttachment,
} from '@/types/message-attachment';
import {
  buildMessageAttachmentObjectPath,
  MESSAGE_ATTACHMENTS_BUCKET,
  removeMessageAttachmentPrefix,
} from '@/lib/message-storage';
import { validateAttachmentFiles } from '@/lib/message-attachment-limits';
import { captureVideoPoster, getVideoFileMetadata } from '@/lib/video-poster';
import { renderPdfFirstPageToJpegBlob } from '@/lib/pdf-page-thumbnail';
import { formatUserFacingError } from '@/lib/format-error';

export type { MessageThreadFilter } from '@/lib/message-thread';

const DEFAULT_AGENT_RESPONSE_TIMEOUT_MS = 30_000;

function toAgentDefinitionLite(def: AgentDefinitionRow): AgentDefinitionLite {
  return {
    id: def.id,
    slug: def.slug,
    mention_handle: def.mention_handle,
    display_name: def.display_name,
    avatar_url: def.avatar_url,
    auth_user_id: def.auth_user_id,
    response_timeout_ms: def.response_timeout_ms ?? DEFAULT_AGENT_RESPONSE_TIMEOUT_MS,
  };
}

export type MessageThreadTeamMember = {
  id: string;
  name: string;
  email: string;
  avatar?: string;
};

export type PeerThreadReplyInsertPayload = {
  threadRootMessageId: string;
  replyMessageId: string;
  contentPreview: string;
};

export type UseMessageThreadArgs = {
  filter: MessageThreadFilter | null;
  workspaceId: string | null;
  bubbles: BubbleRow[];
  canPostMessages: boolean;
  /**
   * Task scope only: bubble id for the open task (e.g. from `TaskModal`’s `bubbleId`).
   * Ensures `bubble_agent_bindings` loads before the async `tasks.bubble_id` fetch resolves.
   */
  taskBubbleIdHint?: string | null;
  /** Current user id — used to ignore own realtime inserts for bubble thread notifications. */
  currentUserId?: string | null;
  /**
   * Bubble / all-bubbles scope only: another user posted a reply (`parent_id` set, not task-scoped).
   * ChatArea uses this for bell + auto-open thread.
   */
  onPeerThreadReplyInsert?: (payload: PeerThreadReplyInsertPayload) => void;
};

/** Returned from `sendMessage` on success (message id + server timestamp for coach-wait UX). */
export type SendMessageSuccess = { messageId: string; createdAt: string };

export type UseMessageThreadResult = {
  messages: MessageRowWithEmbeddedTask[];
  userById: Record<string, ChatUserSnapshot>;
  teamMembers: MessageThreadTeamMember[];
  /**
   * Agent `messages.user_id` values available in this thread's bubble.
   *
   * Ordering contract (see `sortAgentEntries` in this file):
   *   1. `bubble_agent_bindings.sort_order` ASC
   *   2. `agent_definitions.slug` ASC (stable tiebreaker)
   *   3. Workspace-global agents (e.g. Buddy) always appear after bubble-bound agents.
   *
   * Consumers must NEVER rely on array index for identity — always look up by slug via
   * `agentsByAuthUserId`. The ordering is exposed only so that sweeps (server-side mention
   * parsing, realtime dedupe) have a reproducible iteration order.
   */
  agentAuthUserIds: string[];
  /**
   * Agent definitions available in this surface, keyed by `auth_user_id`. Used by the chat
   * message mapper (for agent-sourced avatars) and by `useAgentResponseWait` consumers (for
   * looking up by sender id). Replaces ad-hoc `agentAuthUserIds[0]` lookups.
   */
  agentsByAuthUserId: Map<string, AgentDefinitionLite>;
  replyCounts: Map<string, number>;
  isLoading: boolean;
  error: string | null;
  sending: boolean;
  sendMessage: (
    content: string,
    parentId?: string,
    files?: File[],
    options?: { attachedTaskId?: string | null; metadata?: Json },
  ) => Promise<SendMessageSuccess | null>;
  clearError: () => void;
  setError: (message: string | null) => void;
};

export function useMessageThread({
  filter,
  workspaceId,
  bubbles,
  canPostMessages,
  taskBubbleIdHint = null,
  currentUserId = null,
  onPeerThreadReplyInsert,
}: UseMessageThreadArgs): UseMessageThreadResult {
  const [messages, setMessages] = useState<MessageRowWithEmbeddedTask[]>([]);
  const currentUserIdRef = useRef<string | null>(null);
  const onPeerThreadReplyInsertRef = useRef<typeof onPeerThreadReplyInsert>(undefined);
  currentUserIdRef.current = currentUserId ?? null;
  onPeerThreadReplyInsertRef.current = onPeerThreadReplyInsert;
  const [userById, setUserById] = useState<Record<string, ChatUserSnapshot>>({});
  const [teamMembers, setTeamMembers] = useState<MessageThreadTeamMember[]>([]);
  const [agentAuthUserIds, setAgentAuthUserIds] = useState<string[]>([]);
  const [agentsByAuthUserId, setAgentsByAuthUserId] = useState<Map<string, AgentDefinitionLite>>(
    () => new Map(),
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [taskBubbleId, setTaskBubbleId] = useState<string | null>(null);

  const filterKey = messageThreadFilterKey(filter);

  const taskBubbleIdFromMessages = useMemo(() => {
    if (!filter || filter.scope !== 'task') return null;
    const row = messages.find((m) => m.bubble_id);
    return row?.bubble_id ?? null;
  }, [filter, messages]);

  /** Bubble context for agent mentions; null when agents must not load (`all_bubbles` or unknown task bubble). */
  const agentQueryBubbleId = useMemo(() => {
    if (!filter) return null;
    if (filter.scope === 'all_bubbles') return null;
    if (filter.scope === 'bubble') return filter.bubbleId;
    if (filter.scope === 'task') {
      return taskBubbleId ?? taskBubbleIdFromMessages ?? taskBubbleIdHint ?? null;
    }
    return null;
  }, [filter, taskBubbleId, taskBubbleIdFromMessages, taskBubbleIdHint]);

  useEffect(() => {
    if (!filter || filter.scope !== 'task') {
      setTaskBubbleId(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from('tasks')
        .select('bubble_id')
        .eq('id', filter.taskId)
        .maybeSingle();
      if (cancelled) return;
      setTaskBubbleId((data as { bubble_id?: string } | null)?.bubble_id ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [filter && filter.scope === 'task' ? filter.taskId : null]);

  useEffect(() => {
    if (!filter) {
      setMessages([]);
      setIsLoading(false);
      return;
    }
    const f = filter;
    if (f.scope === 'all_bubbles' && f.bubbleIds.length === 0) {
      setMessages([]);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    async function load() {
      const supabase = createClient();
      let q = supabase
        .from('messages')
        .select(MESSAGES_SELECT_WITH_TASK)
        .order('created_at', { ascending: true });
      if (f.scope === 'all_bubbles') {
        q = q.in('bubble_id', [...f.bubbleIds]);
      } else if (f.scope === 'bubble') {
        q = q.eq('bubble_id', f.bubbleId);
      } else {
        q = q.eq('target_task_id', f.taskId);
      }
      const { data, error: qErr } = await q;
      if (cancelled) return;
      if (qErr) {
        if (isSupabaseBenignRequestAbort(qErr)) {
          setIsLoading(false);
          return;
        }
        console.error('[useMessageThread] load messages', supabaseClientErrorMessage(qErr));
        setMessages([]);
        setIsLoading(false);
        return;
      }
      const rows = (data ?? []) as MessageRowWithEmbeddedTask[];
      setMessages(rows);
      const ids = [...new Set(rows.map((r) => r.user_id))];
      if (ids.length === 0) {
        setIsLoading(false);
        return;
      }
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
      setIsLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [filterKey]);

  useEffect(() => {
    if (!filter) return;
    const f = filter;

    const supabase = createClient();
    const channelName = messageThreadChannelName(f);
    const channel = supabase.channel(channelName);

    const onInsert = (payload: { new: Record<string, unknown> }) => {
      const row = payload.new as MessageRow;
      void (async () => {
        const supa = createClient();
        const enriched = await fetchEmbeddedTaskForMessage(supa, row);
        setMessages((prev) => {
          if (prev.some((m) => m.id === enriched.id)) return prev;
          return [...prev, enriched].sort(
            (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
          );
        });
        const { data: u } = await supa
          .from('users')
          .select('id, full_name, avatar_url, email, created_at')
          .eq('id', row.user_id)
          .maybeSingle();
        if (u) {
          setUserById((prev) => ({ ...prev, [u.id]: toChatUserSnapshot(u) }));
        }

        const myId = currentUserIdRef.current;
        const parentId = enriched.parent_id ?? row.parent_id ?? null;
        const uid = enriched.user_id ?? row.user_id ?? null;
        const isBubbleScope = f.scope === 'bubble' || f.scope === 'all_bubbles';
        const noTaskTarget = enriched.target_task_id == null && row.target_task_id == null;
        if (parentId && isBubbleScope && noTaskTarget && myId && uid && uid !== myId) {
          const raw = typeof enriched.content === 'string' ? enriched.content : '';
          const preview = raw.trim().slice(0, 120) || 'New reply in thread';
          onPeerThreadReplyInsertRef.current?.({
            threadRootMessageId: parentId,
            replyMessageId: enriched.id,
            contentPreview: preview,
          });
        }
      })();
    };
    const onUpdate = (payload: { new: Record<string, unknown> }) => {
      const row = payload.new as MessageRow;
      void (async () => {
        const supa = createClient();
        const enriched = await fetchEmbeddedTaskForMessage(supa, row);
        setMessages((prev) => prev.map((m) => (m.id === row.id ? enriched : m)));
      })();
    };
    const onDelete = (payload: { old: Record<string, unknown> }) => {
      const old = payload.old as { id?: string };
      if (!old?.id) return;
      setMessages((prev) => prev.filter((m) => m.id !== old.id));
    };

    const onTaskInsertOrUpdate = (payload: { new: Record<string, unknown> }) => {
      const row = payload.new as TaskRow;
      if (!row?.id) return;
      setMessages((prev) => {
        if (!prev.some((m) => m.attached_task_id === row.id)) return prev;
        return prev.map((m) => {
          if (m.attached_task_id !== row.id) return m;
          if (row.archived_at) return { ...m, tasks: null };
          return { ...m, tasks: row };
        });
      });
    };

    const onTaskDelete = (payload: { old: Record<string, unknown> }) => {
      const oldId = (payload.old as { id?: string })?.id;
      if (!oldId) return;
      setMessages((prev) => {
        if (!prev.some((m) => m.attached_task_id === oldId)) return prev;
        return prev.map((m) => (m.attached_task_id === oldId ? { ...m, tasks: null } : m));
      });
    };

    if (f.scope === 'all_bubbles') {
      for (const bid of f.bubbleIds) {
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
        channel.on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'tasks',
            filter: `bubble_id=eq.${bid}`,
          },
          onTaskInsertOrUpdate,
        );
        channel.on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'tasks',
            filter: `bubble_id=eq.${bid}`,
          },
          onTaskInsertOrUpdate,
        );
        channel.on(
          'postgres_changes',
          {
            event: 'DELETE',
            schema: 'public',
            table: 'tasks',
            filter: `bubble_id=eq.${bid}`,
          },
          onTaskDelete,
        );
      }
    } else if (f.scope === 'bubble') {
      const bubbleId = f.bubbleId;
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
      channel.on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'tasks',
          filter: `bubble_id=eq.${bubbleId}`,
        },
        onTaskInsertOrUpdate,
      );
      channel.on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'tasks',
          filter: `bubble_id=eq.${bubbleId}`,
        },
        onTaskInsertOrUpdate,
      );
      channel.on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'tasks',
          filter: `bubble_id=eq.${bubbleId}`,
        },
        onTaskDelete,
      );
    } else {
      const taskId = f.taskId;
      channel.on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `target_task_id=eq.${taskId}`,
        },
        onInsert,
      );
      channel.on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `target_task_id=eq.${taskId}`,
        },
        onUpdate,
      );
      channel.on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'messages',
          filter: `target_task_id=eq.${taskId}`,
        },
        onDelete,
      );
      channel.on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'tasks',
          filter: `id=eq.${taskId}`,
        },
        onTaskInsertOrUpdate,
      );
      channel.on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'tasks',
          filter: `id=eq.${taskId}`,
        },
        onTaskInsertOrUpdate,
      );
      channel.on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'tasks',
          filter: `id=eq.${taskId}`,
        },
        onTaskDelete,
      );
    }

    channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- realtime filters are fully determined by `filterKey`; `filter` object identity can change without semantic scope change.
  }, [filterKey]);

  useEffect(() => {
    if (!workspaceId) {
      setTeamMembers([]);
      setAgentAuthUserIds([]);
      return;
    }
    let cancelled = false;
    /**
     * Loads workspace members and bubble-scoped agents (plus workspace-global Buddy).
     *
     * **Ordering contract for `agentAuthUserIds`:** `bubble_agent_bindings.sort_order` ASC,
     * then `agent_definitions.slug` ASC as a deterministic tiebreaker (`sortAgentEntries`).
     * Workspace-global Buddy is inserted with `UNBOUND_AGENT_SORT_ORDER` so he always sorts
     * after bubble-bound agents.
     *
     * Consumers must never rely on array index for identity; always look up by slug via
     * `agentsByAuthUserId`.
     */
    async function loadMembersAndAgents() {
      const supabase = createClient();
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      const myId = authUser?.id ?? null;

      const membersPromise = supabase
        .from('workspace_members')
        .select(
          'user_id, show_email_to_workspace_members, users ( id, full_name, avatar_url, email, created_at )',
        )
        .eq('workspace_id', workspaceId);

      const agentsPromise =
        agentQueryBubbleId != null
          ? supabase
              .from('bubble_agent_bindings')
              .select(
                'sort_order, agent_definitions ( id, slug, mention_handle, display_name, auth_user_id, avatar_url, is_active, created_at, response_timeout_ms )',
              )
              .eq('bubble_id', agentQueryBubbleId)
              .eq('enabled', true)
              .order('sort_order', { ascending: true })
          : Promise.resolve({ data: [] as unknown[], error: null });

      // Buddy is a workspace-global onboarding/guidance agent — available in EVERY bubble without
      // needing a `bubble_agent_bindings` row. We fetch him directly from `agent_definitions`
      // and merge into `teamMembers` below, deduped against bubble-bound agents by `auth_user_id`.
      // @Coach / @Organizer behavior is unchanged — they still only appear where bound.
      const buddyAgentPromise = supabase
        .from('agent_definitions')
        .select(
          'id, slug, mention_handle, display_name, auth_user_id, avatar_url, is_active, created_at, response_timeout_ms',
        )
        .eq('slug', 'buddy')
        .eq('is_active', true)
        .maybeSingle();

      const [
        { data, error: wmErr },
        { data: agentBindingRows, error: agentErr },
        { data: buddyAgentRow, error: buddyAgentErr },
      ] = await Promise.all([membersPromise, agentsPromise, buddyAgentPromise]);

      if (cancelled) return;

      if (wmErr) {
        console.error('[useMessageThread] workspace_members', supabaseClientErrorMessage(wmErr));
      }
      if (agentErr) {
        console.error(
          '[useMessageThread] bubble_agent_bindings',
          supabaseClientErrorMessage(agentErr),
        );
      }
      if (buddyAgentErr) {
        console.error(
          '[useMessageThread] buddy agent_definitions',
          supabaseClientErrorMessage(buddyAgentErr),
        );
      }

      const members: MessageThreadTeamMember[] = [];
      const fromRows: Record<string, ChatUserSnapshot> = {};
      for (const row of data ?? []) {
        const u = (row as { users?: ChatUserSnapshot | ChatUserSnapshot[] | null }).users;
        const usr = Array.isArray(u) ? u[0] : u;
        if (!usr?.id) continue;
        const showPeerEmail =
          myId != null &&
          (usr.id === myId ||
            (row as { show_email_to_workspace_members?: boolean })
              .show_email_to_workspace_members === true);
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

      // Collect agent rows (bubble-bound + workspace-global) and sort them through a single
      // deterministic comparator so that agentAuthUserIds, teamMembers, and the Map below
      // all share the same iteration order. See `sortAgentEntries` JSDoc for the contract.
      type OrderedEntry = { sortOrder: number; def: AgentDefinitionRow };
      const seenAuthIds = new Set<string>();
      const rawEntries: OrderedEntry[] = [];

      for (const raw of agentBindingRows ?? []) {
        const row = raw as {
          sort_order: number;
          agent_definitions: AgentDefinitionRow | AgentDefinitionRow[] | null;
        };
        const def = Array.isArray(row.agent_definitions)
          ? row.agent_definitions[0]
          : row.agent_definitions;
        if (!def?.auth_user_id || !def.is_active) continue;
        if (seenAuthIds.has(def.auth_user_id)) continue;
        seenAuthIds.add(def.auth_user_id);
        rawEntries.push({ sortOrder: row.sort_order, def });
      }

      // Merge the workspace-global Buddy agent. Dedup against bubble-bound agents so a React key
      // collision cannot happen if Buddy ever gets both global and per-bubble bindings.
      const buddyDef = buddyAgentRow as AgentDefinitionRow | null;
      if (buddyDef?.auth_user_id && buddyDef.is_active && !seenAuthIds.has(buddyDef.auth_user_id)) {
        seenAuthIds.add(buddyDef.auth_user_id);
        rawEntries.push({ sortOrder: UNBOUND_AGENT_SORT_ORDER, def: buddyDef });
      }

      const orderedEntries = sortAgentEntries(rawEntries);

      const agentMembers: MessageThreadTeamMember[] = [];
      const agentSnapshots: Record<string, ChatUserSnapshot> = {};
      const agentAuthIds = new Set<string>();
      const agentsMap = new Map<string, AgentDefinitionLite>();

      for (const { def } of orderedEntries) {
        agentAuthIds.add(def.auth_user_id);
        agentsMap.set(def.auth_user_id, toAgentDefinitionLite(def));
        agentMembers.push({
          id: def.auth_user_id,
          name: def.display_name,
          email: '',
          avatar: def.avatar_url ?? undefined,
        });
        agentSnapshots[def.auth_user_id] = toChatUserSnapshot({
          id: def.auth_user_id,
          full_name: def.display_name,
          avatar_url: def.avatar_url,
          email: null,
          created_at: def.created_at,
        });
      }

      const humanMembersFiltered = members.filter((m) => !agentAuthIds.has(m.id));
      const mergedMembers = [...agentMembers, ...humanMembersFiltered];

      setTeamMembers(mergedMembers);
      setAgentAuthUserIds([...agentAuthIds]);
      setAgentsByAuthUserId(agentsMap);
      setUserById((prev) => ({ ...prev, ...agentSnapshots, ...fromRows }));
    }
    void loadMembersAndAgents();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, agentQueryBubbleId]);

  const replyCounts = useMemo(() => buildReplyCounts(messages), [messages]);

  const clearError = useCallback(() => setError(null), []);

  const sendMessage = useCallback(
    async (
      content: string,
      parentId?: string,
      files?: File[],
      options?: { attachedTaskId?: string | null; metadata?: Json },
    ): Promise<SendMessageSuccess | null> => {
      if (!canPostMessages) {
        setError('You do not have permission to post messages in this channel.');
        return null;
      }
      if (!workspaceId) {
        setError('No socialspace selected.');
        return null;
      }
      if (!filter) {
        setError('Select a bubble to post.');
        return null;
      }
      const raw = files ?? [];
      const attachedTaskId = options?.attachedTaskId ?? null;
      const messageMetadata = options?.metadata;
      const hasAttachedTask = Boolean(attachedTaskId);

      if (!content.trim() && raw.length === 0 && !hasAttachedTask) return null;

      if (hasAttachedTask && raw.length > 0) {
        setError('Remove pending attachments before posting a card, or send files separately.');
        return null;
      }

      if (!hasAttachedTask) {
        if (!content.trim() && raw.length === 0) {
          setError('Message text is required.');
          return null;
        }
      }
      const candidates = raw.filter((f) => classifyFileKind(f) !== 'unsupported');
      const validated = validateAttachmentFiles(candidates);
      if (!validated.ok) {
        setError(validated.message);
        return null;
      }
      const accepted = validated.files;
      setError(null);

      let targetBubbleId: string | null = null;
      if (parentId) {
        const parentRow = messages.find((m) => m.id === parentId);
        targetBubbleId = parentRow?.bubble_id ?? null;
      } else if (filter.scope === 'all_bubbles') {
        targetBubbleId = defaultBubbleIdForWrites(bubbles);
      } else if (filter.scope === 'bubble') {
        targetBubbleId = filter.bubbleId;
      } else {
        targetBubbleId = taskBubbleId;
      }
      if (!targetBubbleId) {
        setError(
          parentId
            ? 'Could not find thread parent. Try closing and reopening the thread.'
            : filter.scope === 'task'
              ? 'Could not resolve task bubble.'
              : 'Add a bubble in this socialspace before posting attachments.',
        );
        return null;
      }

      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError('You need to be signed in to send messages.');
        return null;
      }

      if (attachedTaskId) {
        const { data: attachTask, error: attachErr } = await supabase
          .from('tasks')
          .select('bubble_id')
          .eq('id', attachedTaskId)
          .single();
        if (attachErr || !attachTask) {
          setError('Could not verify the card for this message.');
          return null;
        }
        if (attachTask.bubble_id !== targetBubbleId) {
          setError('That card belongs to a different bubble than this message.');
          return null;
        }
      }

      const targetTaskId = filter.scope === 'task' ? filter.taskId : null;

      setSending(true);
      try {
        const { data: inserted, error: insErr } = await supabase
          .from('messages')
          .insert({
            bubble_id: targetBubbleId,
            user_id: user.id,
            content: content.trim(),
            parent_id: parentId ?? null,
            attached_task_id: attachedTaskId,
            target_task_id: targetTaskId,
            ...(messageMetadata !== undefined ? { metadata: messageMetadata } : {}),
          })
          .select(MESSAGES_SELECT_WITH_TASK)
          .single();

        if (insErr || !inserted?.id) {
          console.error(
            '[useMessageThread] message insert',
            insErr ? supabaseClientErrorMessage(insErr) : 'insert returned no row',
          );
          setError(
            insErr ? formatUserFacingError(insErr) : 'Could not create message. Please try again.',
          );
          return null;
        }

        const messageId = inserted.id;
        const createdAt =
          typeof inserted.created_at === 'string' ? inserted.created_at : new Date().toISOString();
        const row = inserted as MessageRowWithEmbeddedTask;
        setMessages((prev) => {
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
              console.error(
                '[useMessageThread] attachment upload',
                supabaseClientErrorMessage(upErr),
              );
              setError(formatUserFacingError(upErr));
              await abortAttempt();
              return null;
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
                    '[useMessageThread] pdf thumb upload',
                    supabaseClientErrorMessage(upPdfThumb),
                  );
                }
              } catch (e) {
                console.error('[useMessageThread] pdf thumb', supabaseClientErrorMessage(e));
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
              console.error('[useMessageThread] video upload', supabaseClientErrorMessage(upVid));
              setError(formatUserFacingError(upVid));
              await abortAttempt();
              return null;
            }

            let vm: Awaited<ReturnType<typeof getVideoFileMetadata>>;
            try {
              vm = await getVideoFileMetadata(file);
            } catch (e) {
              console.error('[useMessageThread] video metadata', supabaseClientErrorMessage(e));
              setError(e instanceof Error ? e.message : 'Could not read video.');
              await abortAttempt();
              return null;
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
                  '[useMessageThread] generate-message-video-poster: fallback to client poster',
                  fnErr
                    ? supabaseClientErrorMessage(fnErr)
                    : 'invoke returned no error but response was not ok',
                );
                let poster: Awaited<ReturnType<typeof captureVideoPoster>>;
                try {
                  poster = await captureVideoPoster(file);
                } catch (e) {
                  console.error(
                    '[useMessageThread] video poster fallback',
                    supabaseClientErrorMessage(e),
                  );
                  setError(e instanceof Error ? e.message : 'Could not read video.');
                  await abortAttempt();
                  return null;
                }
                const { error: upPoster } = await supabase.storage
                  .from(MESSAGE_ATTACHMENTS_BUCKET)
                  .upload(thumbPath, poster.blob, {
                    cacheControl: '3600',
                    upsert: false,
                    contentType: 'image/jpeg',
                  });
                if (upPoster) {
                  console.error(
                    '[useMessageThread] poster upload',
                    supabaseClientErrorMessage(upPoster),
                  );
                  setError(formatUserFacingError(upPoster));
                  await abortAttempt();
                  return null;
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
                console.error('[useMessageThread] video poster', supabaseClientErrorMessage(e));
                setError(e instanceof Error ? e.message : 'Could not read video.');
                await abortAttempt();
                return null;
              }
              const { error: upPoster } = await supabase.storage
                .from(MESSAGE_ATTACHMENTS_BUCKET)
                .upload(thumbPath, poster.blob, {
                  cacheControl: '3600',
                  upsert: false,
                  contentType: 'image/jpeg',
                });
              if (upPoster) {
                console.error(
                  '[useMessageThread] poster upload',
                  supabaseClientErrorMessage(upPoster),
                );
                setError(formatUserFacingError(upPoster));
                await abortAttempt();
                return null;
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
              '[useMessageThread] message attachments update',
              supabaseClientErrorMessage(updErr),
            );
            setError(formatUserFacingError(updErr));
            await abortAttempt();
            return null;
          }
          setMessages((prev) => {
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
        return { messageId, createdAt };
      } finally {
        setSending(false);
      }
    },
    [bubbles, canPostMessages, filter, messages, taskBubbleId, workspaceId],
  );

  return {
    messages,
    userById,
    teamMembers,
    agentAuthUserIds,
    agentsByAuthUserId,
    replyCounts,
    isLoading,
    error,
    sending,
    sendMessage,
    clearError,
    setError,
  };
}
