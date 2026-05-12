'use client';

import { Users } from 'lucide-react';

import { cn } from '@/lib/utils';

export type RosterDrawerTriggerProps = {
  count: number;
  isOpen: boolean;
  onOpen: () => void;
};

export function RosterDrawerTrigger({ count, isOpen, onOpen }: RosterDrawerTriggerProps) {
  const badge = count > 99 ? '99+' : count > 0 ? String(count) : null;

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        aria-label={`Roster (${count} people)`}
        aria-expanded={isOpen}
        onClick={onOpen}
        className={cn(
          'flex size-11 shrink-0 items-center justify-center rounded-full text-white transition-colors',
          isOpen ? 'bg-white/20 hover:bg-white/25' : 'bg-white/10 hover:bg-white/15',
        )}
      >
        <Users className="size-5" aria-hidden />
      </button>
      {badge != null ? (
        <span
          className="pointer-events-none absolute -right-0.5 -top-0.5 flex min-h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground shadow-sm"
          aria-hidden
        >
          {badge}
        </span>
      ) : null}
    </div>
  );
}
