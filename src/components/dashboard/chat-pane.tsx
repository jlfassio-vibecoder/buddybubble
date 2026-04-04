'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@utils/supabase/client';
import type { MessageRow } from '@/types/database';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

type Props = {
  bubbleId: string | null;
  canWrite: boolean;
};

export function ChatPane({ bubbleId, canWrite }: Props) {
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  const loadMessages = useCallback(async () => {
    if (!bubbleId) {
      setMessages([]);
      return;
    }
    const supabase = createClient();
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('bubble_id', bubbleId)
      .order('created_at', { ascending: true });
    setMessages(data ?? []);
  }, [bubbleId]);

  useEffect(() => {
    void loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    if (!bubbleId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`messages:${bubbleId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `bubble_id=eq.${bubbleId}`,
        },
        () => {
          void loadMessages();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [bubbleId, loadMessages]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!bubbleId || !body.trim() || !canWrite) return;
    setSending(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSending(false);
      return;
    }
    const { error } = await supabase.from('messages').insert({
      bubble_id: bubbleId,
      user_id: user.id,
      content: body.trim(),
    });
    setSending(false);
    if (!error) {
      setBody('');
      void loadMessages();
    }
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col border-r border-border bg-background">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">Chat</h2>
        <p className="text-xs text-muted-foreground">
          {bubbleId ? 'Messages in this bubble' : 'Select a bubble'}
        </p>
      </div>
      <ScrollArea className="min-h-0 flex-1 p-4">
        <ul className="space-y-3">
          {messages.map((m) => (
            <li key={m.id} className="text-sm">
              <span className="text-xs text-muted-foreground">
                {new Date(m.created_at).toLocaleString()} · {m.user_id.slice(0, 8)}…
              </span>
              <p className="mt-0.5 whitespace-pre-wrap text-foreground">{m.content}</p>
            </li>
          ))}
          {messages.length === 0 && bubbleId && (
            <li className="text-sm text-muted-foreground">No messages yet.</li>
          )}
        </ul>
      </ScrollArea>
      <Separator />
      {canWrite && bubbleId ? (
        <form onSubmit={send} className="p-3">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write a message…"
            rows={3}
            className="resize-none text-sm"
          />
          <Button type="submit" size="sm" className="mt-2" disabled={sending || !body.trim()}>
            Send
          </Button>
        </form>
      ) : (
        <p className="p-3 text-xs text-muted-foreground">
          {!bubbleId ? 'Select a bubble' : 'Read-only (guest)'}
        </p>
      )}
    </div>
  );
}
