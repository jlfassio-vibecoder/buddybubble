'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type WorkoutIntakePanelChromeProps = {
  headerLabel: string;
  stepLabel: string;
  disabled?: boolean;
  disabledReason?: string;
  children: ReactNode;
};

export function WorkoutIntakePanelChrome({
  headerLabel,
  stepLabel,
  disabled = false,
  disabledReason,
  children,
}: WorkoutIntakePanelChromeProps) {
  return (
    <div
      className={cn(
        'space-y-4 rounded-lg border border-border/60 bg-muted/20 p-3',
        disabled && 'pointer-events-none opacity-60',
      )}
      aria-disabled={disabled || undefined}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{headerLabel}</p>
        <p className="text-[11px] text-muted-foreground">{stepLabel}</p>
      </div>
      {disabledReason ? <p className="text-xs text-muted-foreground">{disabledReason}</p> : null}
      {children}
    </div>
  );
}
