'use client';

import { useState } from 'react';
import { Hash, Settings } from 'lucide-react';
import { createClient } from '@utils/supabase/client';
import type { BubbleRow } from '@/types/database';
import { ALL_BUBBLES_BUBBLE_ID, ALL_BUBBLES_LABEL } from '@/lib/all-bubbles';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

type Props = {
  workspaceId: string;
  bubbles: BubbleRow[];
  selectedBubbleId: string | null;
  onSelectBubble: (id: string) => void;
  onBubblesChange: (rows: BubbleRow[]) => void;
  canWrite: boolean;
  isAdmin?: boolean;
  onOpenWorkspaceSettings?: () => void;
};

export function BubbleSidebar({
  workspaceId,
  bubbles,
  selectedBubbleId,
  onSelectBubble,
  onBubblesChange,
  canWrite,
  isAdmin = false,
  onOpenWorkspaceSettings,
}: Props) {
  const [name, setName] = useState('');
  const [adding, setAdding] = useState(false);

  async function addBubble(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !canWrite) return;
    setAdding(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from('bubbles')
      .insert({
        workspace_id: workspaceId,
        name: name.trim(),
        icon: null,
      })
      .select('*')
      .single();
    setAdding(false);
    if (!error && data) {
      onBubblesChange([...bubbles, data]);
      onSelectBubble(data.id);
      setName('');
    }
  }

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-card">
      <div className="border-b border-border p-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Bubbles
          </h2>
          {isAdmin && onOpenWorkspaceSettings ? (
            <button
              type="button"
              onClick={onOpenWorkspaceSettings}
              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Workspace settings"
              title="Workspace settings"
            >
              <Settings className="size-4" />
            </button>
          ) : null}
        </div>
        {canWrite && (
          <form onSubmit={addBubble} className="mt-2 flex gap-2">
            <Input
              placeholder="New bubble"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-8 text-sm"
            />
            <Button type="submit" size="sm" disabled={adding || !name.trim()}>
              Add
            </Button>
          </form>
        )}
      </div>
      <ScrollArea className="flex-1">
        <ul className="p-2">
          <li key={ALL_BUBBLES_BUBBLE_ID}>
            <button
              type="button"
              onClick={() => onSelectBubble(ALL_BUBBLES_BUBBLE_ID)}
              className={cn(
                'mb-1 flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm font-medium transition-colors',
                selectedBubbleId === ALL_BUBBLES_BUBBLE_ID
                  ? 'bg-accent text-accent-foreground'
                  : 'hover:bg-muted',
              )}
            >
              <Hash className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
              {ALL_BUBBLES_LABEL}
            </button>
          </li>
          {bubbles.map((b) => (
            <li key={b.id}>
              <button
                type="button"
                onClick={() => onSelectBubble(b.id)}
                className={cn(
                  'mb-1 flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm font-medium transition-colors',
                  selectedBubbleId === b.id ? 'bg-accent text-accent-foreground' : 'hover:bg-muted',
                )}
              >
                <Hash className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
                {b.name}
              </button>
            </li>
          ))}
          {bubbles.length === 0 && (
            <li className="px-2 py-4 text-sm text-muted-foreground">No bubbles yet.</li>
          )}
        </ul>
      </ScrollArea>
    </aside>
  );
}
