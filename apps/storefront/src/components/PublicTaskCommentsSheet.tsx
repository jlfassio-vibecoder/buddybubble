'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { AgentTypingIndicator } from '@/components/chat/AgentTypingIndicator';
import { useAgentResponseWait } from '@/hooks/useAgentResponseWait';
import type { SendMessageSuccess } from '@/hooks/useMessageThread';
import type { AgentDefinitionLite } from '@/lib/agents/resolveTargetAgent';
import { mentionsHandle } from '@/lib/agents/organizer/parse';
import { STOREFRONT_BUDDY_MAX_CHARS } from '@/lib/agents/buddy/config';
import { normalizeCommentRow } from '../lib/supabase-embed';
import { useStorefrontAuth } from './StorefrontAuthProvider';

/** Disambiguate author embed (`user_id` vs `thread_subject_user_id` both reference `users`). */
const MESSAGE_AUTHOR_SELECT =
  'id, content, created_at, user_id, parent_id, users:users!messages_user_id_fkey ( full_name, avatar_url )';

type CommentRow = {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  parent_id: string | null;
  users: {
    full_name: string | null;
    avatar_url: string | null;
  } | null;
};

type BuddyAgentRow = {
  id: string;
  slug: string;
  mention_handle: string;
  display_name: string;
  auth_user_id: string;
  avatar_url: string | null;
  response_timeout_ms: number;
};

type Props = {
  taskId: string;
  bubbleId: string;
  title: string;
  onClose: () => void;
  onCountChange: (count: number) => void;
};

function toBuddyLite(row: BuddyAgentRow): AgentDefinitionLite {
  return {
    id: row.id,
    slug: row.slug,
    mention_handle: row.mention_handle,
    display_name: row.display_name,
    avatar_url: row.avatar_url,
    auth_user_id: row.auth_user_id,
    response_timeout_ms: row.response_timeout_ms,
  };
}

function authorLabel(
  row: CommentRow,
  currentUserId: string | null,
  buddy: AgentDefinitionLite | null,
): string {
  if (buddy && row.user_id === buddy.auth_user_id) return buddy.display_name;
  if (currentUserId && row.user_id === currentUserId) return 'You';
  const name = row.users?.full_name?.trim();
  if (name) return name;
  return 'Visitor';
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function PublicTaskCommentsSheet({
  taskId,
  bubbleId,
  title,
  onClose,
  onCountChange,
}: Props) {
  const { supabase, userId, ready } = useStorefrontAuth();
  const [messages, setMessages] = useState<CommentRow[]>([]);
  const [buddyAgent, setBuddyAgent] = useState<AgentDefinitionLite | null>(null);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const agentsByAuthUserId = useMemo(() => {
    const map = new Map<string, AgentDefinitionLite>();
    if (buddyAgent) map.set(buddyAgent.auth_user_id, buddyAgent);
    return map;
  }, [buddyAgent]);

  const waitBuddy = useAgentResponseWait({
    messages,
    myUserId: userId,
    agentsByAuthUserId,
  });

  const loadMessages = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const { data, error: fetchErr } = await supabase
      .from('messages')
      .select(MESSAGE_AUTHOR_SELECT)
      .eq('target_task_id', taskId)
      .order('created_at', { ascending: true });

    if (fetchErr) {
      setError(fetchErr.message);
      setLoading(false);
      return;
    }

    const rows = (data ?? [])
      .map((row) => normalizeCommentRow(row))
      .filter((row): row is CommentRow => row != null);
    setMessages(rows);
    onCountChange(rows.length);
    setError(null);
    setLoading(false);
  }, [supabase, taskId, onCountChange]);

  useEffect(() => {
    void loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;

    void (async () => {
      const { data, error: agentErr } = await supabase
        .from('agent_definitions')
        .select(
          'id, slug, mention_handle, display_name, auth_user_id, avatar_url, response_timeout_ms',
        )
        .eq('slug', 'buddy')
        .eq('is_active', true)
        .maybeSingle();

      if (cancelled) return;
      if (agentErr || !data) return;
      setBuddyAgent(toBuddyLite(data as BuddyAgentRow));
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  useEffect(() => {
    if (!supabase) return;

    const channel = supabase
      .channel(`storefront-task-comments:${taskId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `target_task_id=eq.${taskId}`,
        },
        async (payload) => {
          const row = payload.new as {
            id: string;
            content: string;
            created_at: string;
            user_id: string;
            parent_id?: string | null;
          };

          const { data } = await supabase
            .from('messages')
            .select(MESSAGE_AUTHOR_SELECT)
            .eq('id', row.id)
            .maybeSingle();

          const enriched = normalizeCommentRow(data);
          if (!enriched) return;
          setMessages((prev) => {
            if (prev.some((m) => m.id === enriched.id)) return prev;
            const next = [...prev, enriched].sort(
              (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
            );
            onCountChange(next.length);
            return next;
          });
        },
      )
      .subscribe();

    return () => {
      void channel.unsubscribe();
      void supabase.removeChannel(channel);
    };
  }, [supabase, taskId, onCountChange]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, waitBuddy.pending]);

  useEffect(() => {
    waitBuddy.clear();
  }, [taskId, waitBuddy.clear]);

  useEffect(() => {
    return () => {
      waitBuddy.clear();
    };
  }, [waitBuddy.clear]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const appendBuddyMention = useCallback(() => {
    if (!buddyAgent) return;
    const token = `@${buddyAgent.mention_handle} `;
    setDraft((prev) => {
      const trimmed = prev.trimEnd();
      if (!trimmed) return token;
      if (mentionsHandle(trimmed, buddyAgent.mention_handle)) return prev;
      return `${trimmed} ${token}`;
    });
  }, [buddyAgent]);

  const handleSend = async () => {
    if (!supabase || !userId || !ready) return;
    const content = draft.trim();
    if (!content) return;

    const routesToBuddy = buddyAgent != null && mentionsHandle(content, buddyAgent.mention_handle);
    if (routesToBuddy) {
      waitBuddy.registerIntent(buddyAgent);
    }

    setSending(true);
    setError(null);

    const { data: taskRow, error: taskErr } = await supabase
      .from('tasks')
      .select('bubble_id')
      .eq('id', taskId)
      .maybeSingle();

    const resolvedBubbleId = taskRow?.bubble_id ?? bubbleId;
    if (taskErr || !resolvedBubbleId) {
      setSending(false);
      if (routesToBuddy) waitBuddy.clear();
      setError(taskErr?.message ?? 'Could not resolve the card channel for this comment.');
      return;
    }

    const { data: inserted, error: insErr } = await supabase
      .from('messages')
      .insert({
        bubble_id: resolvedBubbleId,
        user_id: userId,
        content,
        target_task_id: taskId,
        parent_id: null,
        ...(routesToBuddy ? { metadata: { surface: 'storefront' } } : {}),
      })
      .select('id, created_at')
      .single();

    setSending(false);
    if (insErr) {
      if (routesToBuddy) waitBuddy.clear();
      setError(insErr.message);
      return;
    }

    if (routesToBuddy && inserted && buddyAgent) {
      const sent: SendMessageSuccess = {
        messageId: inserted.id,
        createdAt: inserted.created_at,
      };
      waitBuddy.registerSuccessfulSend(sent, buddyAgent);
    }

    setDraft('');
  };

  const buddyMentionLabel = buddyAgent ? `@${buddyAgent.mention_handle}` : '@Buddy';

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close comments"
        onClick={onClose}
      />
      <aside
        className="relative flex h-full w-full max-w-md flex-col bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="storefront-comments-title"
      >
        <header className="flex items-start justify-between gap-3 border-b border-zinc-200 px-4 py-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Comments</p>
            <h2
              id="storefront-comments-title"
              className="truncate text-lg font-semibold text-zinc-900"
            >
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
            aria-label="Close"
          >
            <X className="size-5" aria-hidden />
          </button>
        </header>

        <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-4">
          {loading ? (
            <p className="text-sm text-zinc-500">Loading comments…</p>
          ) : messages.length === 0 && !waitBuddy.pending ? (
            <p className="text-sm text-zinc-500">No comments yet. Be the first to say hello.</p>
          ) : (
            <ul className="space-y-4">
              {messages.map((row) => (
                <li
                  key={row.id}
                  className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2.5"
                >
                  <div className="mb-1 flex items-baseline justify-between gap-2">
                    <span className="text-xs font-semibold text-zinc-800">
                      {authorLabel(row, userId, buddyAgent)}
                    </span>
                    <time className="shrink-0 text-[10px] text-zinc-400" dateTime={row.created_at}>
                      {formatWhen(row.created_at)}
                    </time>
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-700">
                    {row.content}
                  </p>
                </li>
              ))}
              {waitBuddy.pending ? (
                <li className="pt-1">
                  <AgentTypingIndicator density="rail" pending={waitBuddy.pending} />
                </li>
              ) : null}
            </ul>
          )}
        </div>

        <footer className="border-t border-zinc-200 px-4 py-4">
          {error ? <p className="mb-2 text-xs text-red-600">{error}</p> : null}
          <div className="mb-2 flex items-center gap-2">
            <button
              type="button"
              onClick={appendBuddyMention}
              disabled={!ready || !userId || sending || !buddyAgent}
              className="rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Ask {buddyMentionLabel}
            </button>
          </div>
          <div className="flex gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={2}
              maxLength={STOREFRONT_BUDDY_MAX_CHARS}
              placeholder={
                ready && userId ? `Ask ${buddyMentionLabel} or leave a comment…` : 'Connecting…'
              }
              disabled={!ready || !userId || sending}
              className="min-h-[2.5rem] flex-1 resize-y rounded-xl border border-zinc-200 px-3 py-2 text-sm text-zinc-900 outline-none ring-blue-500/30 focus:ring-2 disabled:bg-zinc-50"
            />
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={!ready || !userId || sending || !draft.trim()}
              className="shrink-0 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Post
            </button>
          </div>
        </footer>
      </aside>
    </div>,
    document.body,
  );
}
