'use client';

import { CalendarDays, Columns3, LayoutGrid, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';

export type DesktopFocusMode = 'chat' | 'board' | 'calendar' | 'split';

type Props = {
  activeMode: DesktopFocusMode | null;
  onChange: (mode: DesktopFocusMode) => void;
  /** Avoid clicks before layout state is rehydrated from localStorage. */
  disabled?: boolean;
  className?: string;
};

const MODES: { id: DesktopFocusMode; label: string; Icon: typeof MessageSquare }[] = [
  { id: 'chat', label: 'Focus messages', Icon: MessageSquare },
  { id: 'board', label: 'Focus board', Icon: LayoutGrid },
  { id: 'calendar', label: 'Focus calendar', Icon: CalendarDays },
  { id: 'split', label: 'Split view (messages + board + calendar strip)', Icon: Columns3 },
];

/** Desktop-only macros for main-stage collapse; hidden below `md`. */
export function DesktopViewSwitcher({ activeMode, onChange, disabled = false, className }: Props) {
  return (
    <div
      className={cn(
        'max-md:hidden flex items-center gap-0.5 rounded-lg border border-border bg-muted/40 p-0.5',
        className,
      )}
      role="group"
      aria-label="Layout focus"
    >
      {MODES.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          title={label}
          aria-label={label}
          aria-pressed={activeMode === id}
          disabled={disabled}
          onClick={() => onChange(id)}
          className={cn(
            'rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40',
            activeMode === id && 'bg-background text-foreground shadow-sm',
          )}
        >
          <Icon className="size-4" strokeWidth={2} aria-hidden />
        </button>
      ))}
    </div>
  );
}
