'use client';

import { TaskModalAgentTag } from '@/components/modals/task-modal/TaskModalSection';

export type TaskModalPersonaStripProps = {
  /** Number of fields still stamped `by: 'agent'` (after live demotions). */
  agentFieldCount: number;
  className?: string;
};

/**
 * `.tm-persona-strip` — banner when Coach has hydrated canvas fields via chat.
 * Canvas remains SoT; this is display chrome only.
 */
export function TaskModalPersonaStrip({ agentFieldCount, className }: TaskModalPersonaStripProps) {
  if (agentFieldCount <= 0) return null;
  return (
    <div
      className={
        className ??
        'mb-4 flex items-center gap-[11px] rounded-[var(--radius-xl)] border border-primary/32 bg-primary/[0.08] px-[13px] py-[11px]'
      }
      data-testid="task-modal-persona-strip"
      role="status"
    >
      <span
        className="flex size-[34px] shrink-0 items-center justify-center rounded-full bg-primary text-[12px] font-extrabold text-primary-foreground"
        aria-hidden
      >
        C
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5 text-[12.5px] font-bold leading-snug text-foreground">
          <span>Coach hydrated this Canvas</span>
          <TaskModalAgentTag />
          <span className="text-[11px] font-semibold text-muted-foreground">
            {agentFieldCount} {agentFieldCount === 1 ? 'field' : 'fields'}
          </span>
        </div>
        <p className="mt-px text-[11.5px] text-muted-foreground">
          The Persona filled the form through chat — the Canvas stays the source of truth.
        </p>
      </div>
    </div>
  );
}
