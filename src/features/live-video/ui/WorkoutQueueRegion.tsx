'use client';

import { useEffect, useId, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { SessionState } from '@/features/live-video/state/sessionStateMachine';
import { SessionDeckBuilder } from '@/features/live-video/shells/huddle/SessionDeckBuilder';
import { cn } from '@/lib/utils';

export type WorkoutQueueRegionProps = {
  state: SessionState;
  uiMode: 'builder' | 'live';
  /** Reserved for future toggle gating during board pick. */
  selectingFromBoard: boolean;
  className?: string;
};

export function WorkoutQueueRegion({ state, uiMode, className }: WorkoutQueueRegionProps) {
  const [isOpen, setIsOpen] = useState(uiMode !== 'live');
  const panelId = useId();

  useEffect(() => {
    if (state.phase !== 'lobby') setIsOpen(false);
  }, [state.phase]);

  useEffect(() => {
    setIsOpen(uiMode !== 'live');
  }, [uiMode]);

  return (
    <div className={cn('flex min-h-0 shrink-0 flex-col', className)}>
      <div
        className={cn(
          'grid min-h-0 transition-[grid-template-rows] duration-300 ease-in-out',
          isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
      >
        <div id={panelId} className="min-h-0 overflow-hidden">
          <SessionDeckBuilder state={state} isCollapsed={!isOpen} className="min-h-0 min-w-0" />
        </div>
      </div>
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex h-6 w-full shrink-0 items-center justify-center bg-muted/50 transition-colors hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="sr-only">{isOpen ? 'Hide workout queue' : 'Show workout queue'}</span>
        {isOpen ? <ChevronUp size={16} aria-hidden /> : <ChevronDown size={16} aria-hidden />}
      </button>
    </div>
  );
}
