'use client';

import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

export type KanbanColumnAddProps = {
  disabled?: boolean;
  onAdd: () => void;
  variant?: 'empty' | 'inline';
  className?: string;
};

export function KanbanColumnAdd({
  disabled,
  onAdd,
  variant = 'empty',
  className,
}: KanbanColumnAddProps) {
  if (variant === 'inline') {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={onAdd}
        className={cn(
          'mt-1 flex w-full items-center justify-center gap-1 rounded-lg py-2 text-xs font-medium text-primary hover:bg-primary/5 disabled:pointer-events-none disabled:opacity-50',
          className,
        )}
      >
        <Plus className="size-3.5" aria-hidden />
        Add new
      </button>
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onAdd}
      className={cn(
        'flex min-h-[120px] w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary/25 bg-primary/[0.03] px-3 py-4 text-sm font-medium text-primary transition-colors hover:border-primary/40 hover:bg-primary/[0.06] disabled:pointer-events-none disabled:opacity-50',
        className,
      )}
    >
      <span className="inline-flex items-center gap-1.5">
        <Plus className="size-4" aria-hidden />
        Add New
      </span>
    </button>
  );
}
