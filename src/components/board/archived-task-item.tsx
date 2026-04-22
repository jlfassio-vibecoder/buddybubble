'use client';

import { useState } from 'react';
import { Loader2, RotateCcw, Trash2 } from 'lucide-react';
import { getItemTypeVisual } from '@/lib/item-type-styles';
import { normalizeItemType } from '@/lib/item-types';
import type { TaskRow } from '@/types/database';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

function archivedOnLabel(archivedAt: string | null): string {
  if (!archivedAt) return '';
  const d = new Date(archivedAt);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  if (d.getFullYear() !== now.getFullYear()) opts.year = 'numeric';
  return `Archived on ${d.toLocaleDateString(undefined, opts)}`;
}

export type ArchivedTaskItemProps = {
  task: TaskRow;
  onRestore: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  canWrite: boolean;
};

export function ArchivedTaskItem({ task, onRestore, onDelete, canWrite }: ArchivedTaskItemProps) {
  const [pending, setPending] = useState<'restore' | 'delete' | null>(null);
  const visual = getItemTypeVisual(normalizeItemType(task.item_type));
  const { Icon } = visual;
  const busy = pending !== null;
  const sub = archivedOnLabel(task.archived_at);

  const handleRestore = async () => {
    if (busy || !canWrite) return;
    setPending('restore');
    try {
      await onRestore(task.id);
    } finally {
      setPending(null);
    }
  };

  const handleDelete = async () => {
    if (busy || !canWrite) return;
    if (!window.confirm('Are you sure? This cannot be undone.')) return;
    setPending('delete');
    try {
      await onDelete(task.id);
    } finally {
      setPending(null);
    }
  };

  return (
    <div
      className={cn(
        'flex min-w-0 items-center gap-3 rounded-lg border border-border/80 bg-card px-3 py-2.5',
        'shadow-sm',
      )}
    >
      <div
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-md border border-border/60 bg-muted/40',
          visual.iconText,
        )}
        aria-hidden
      >
        <Icon className="size-4" strokeWidth={2} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium leading-tight text-foreground">{task.title}</p>
        {sub ? <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-9 text-muted-foreground hover:text-foreground"
          disabled={!canWrite || busy}
          onClick={() => void handleRestore()}
          aria-label="Restore task"
          title="Restore"
        >
          {pending === 'restore' ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <RotateCcw className="size-4" aria-hidden />
          )}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-9 text-muted-foreground hover:text-destructive"
          disabled={!canWrite || busy}
          onClick={() => void handleDelete()}
          aria-label="Delete permanently"
          title="Delete permanently"
        >
          {pending === 'delete' ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Trash2 className="size-4" aria-hidden />
          )}
        </Button>
      </div>
    </div>
  );
}
