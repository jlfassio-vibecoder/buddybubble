'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@utils/supabase/client';
import type { StorefrontSandboxMessageRow } from '@/types/database';

type Channel = 'welcome' | 'qa';

const CHANNEL_LABEL: Record<Channel, string> = {
  welcome: '# Welcome',
  qa: '# Q&A',
};

export function StorefrontSandboxConsole({ canReply }: { canReply: boolean }) {
  const [channel, setChannel] = useState<Channel>('welcome');
  const [rows, setRows] = useState<StorefrontSandboxMessageRow[]>([]);
  const [replyText, setReplyText] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const supabase = useMemo(() => createClient(), []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: qerr } = await supabase
      .from('storefront_sandbox_messages')
      .select('*')
      .eq('channel_key', channel)
      .order('created_at', { ascending: true });
    setLoading(false);
    if (qerr) {
      setError(qerr.message);
      return;
    }
    setRows((data ?? []) as StorefrontSandboxMessageRow[]);
  }, [supabase, channel]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const ch = supabase
      .channel(`storefront-sandbox:${channel}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'storefront_sandbox_messages',
          filter: `channel_key=eq.${channel}`,
        },
        (payload) => {
          const row = payload.new as StorefrontSandboxMessageRow;
          setRows((prev) => {
            if (prev.some((r) => r.id === row.id)) return prev;
            return [...prev, row].sort(
              (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
            );
          });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [supabase, channel]);

  async function sendReply(e: React.FormEvent) {
    e.preventDefault();
    const t = replyText.trim();
    if (!t || !canReply) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch('/api/storefront-sandbox/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel_key: channel, body: t }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? res.statusText);
        return;
      }
      setReplyText('');
    } catch {
      setError('Network error');
    } finally {
      setSending(false);
    }
  }

  function labelForRow(r: StorefrontSandboxMessageRow): string {
    if (r.author_kind === 'team') {
      return r.display_name?.trim() || 'BuddyBubble';
    }
    return r.display_name?.trim() ? `${r.display_name.trim()} (guest)` : 'Visitor';
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">Storefront sandbox</h1>
        <p className="mt-1 text-sm text-slate-600">
          Guests on the marketing site post here; replies show up live in the interactive demo. Keep
          this page open to see new guest messages in real time.
        </p>
      </header>

      <div className="flex gap-2">
        {(['welcome', 'qa'] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setChannel(key)}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${
              channel === key
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {CHANNEL_LABEL[key]}
          </button>
        ))}
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <div className="max-h-[50vh] space-y-3 overflow-y-auto rounded-xl border border-slate-200 bg-white p-4">
        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-slate-500">No messages yet.</p>
        ) : (
          rows.map((r) => (
            <div key={r.id} className="rounded-lg border border-slate-100 bg-slate-50/80 p-3">
              <div className="text-xs font-semibold text-slate-800">{labelForRow(r)}</div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{r.body}</p>
              <div className="mt-2 text-[10px] uppercase tracking-wide text-slate-400">
                {r.author_kind} · {new Date(r.created_at).toLocaleString()}
              </div>
            </div>
          ))
        )}
      </div>

      {canReply ? (
        <form onSubmit={sendReply} className="space-y-2">
          <label htmlFor="sandbox-reply" className="block text-sm font-medium text-slate-700">
            Team reply in {CHANNEL_LABEL[channel]}
          </label>
          <textarea
            id="sandbox-reply"
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            placeholder="Type a reply visible to everyone on the marketing demo…"
          />
          <button
            type="submit"
            disabled={sending || !replyText.trim()}
            className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {sending ? 'Sending…' : 'Send reply'}
          </button>
        </form>
      ) : (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          You’re signed in, but this account isn’t listed in{' '}
          <code className="rounded bg-amber-100 px-1">STOREFRONT_SANDBOX_OWNER_USER_IDS</code>. Add
          your Supabase auth user id to that env var to send team replies.
        </p>
      )}
    </div>
  );
}
