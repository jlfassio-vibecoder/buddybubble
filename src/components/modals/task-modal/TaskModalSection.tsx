'use client';

import { useState, type ReactNode } from 'react';
import { ChevronRight, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

export type TaskModalSectionProps = {
  icon?: ReactNode;
  title: string;
  hint?: string;
  sub?: string;
  first?: boolean;
  children: ReactNode;
};

/** `.tm-section` — 26px icon chip + 13px/700 title, 18px vertical rhythm, hairline top border. */
export function TaskModalSection({
  icon,
  title,
  hint,
  sub,
  first,
  children,
}: TaskModalSectionProps) {
  return (
    <section className={cn('border-t border-border py-[18px]', first && 'border-t-0 pt-1')}>
      <div className="mb-3.5 flex items-center gap-2">
        {icon ? (
          <span className="flex size-[26px] shrink-0 items-center justify-center rounded-lg bg-secondary text-foreground">
            {icon}
          </span>
        ) : null}
        <span className="text-[13px] font-bold tracking-tight text-foreground">{title}</span>
        {hint ? <span className="ml-auto text-xs text-muted-foreground">{hint}</span> : null}
      </div>
      {sub ? (
        <p className="-mt-[7px] mb-3.5 text-xs leading-relaxed text-muted-foreground">{sub}</p>
      ) : null}
      {children}
    </section>
  );
}

export function TaskModalAgentTag() {
  return (
    <span className="inline-flex h-[17px] items-center gap-1 rounded-full bg-primary/18 pl-1.5 pr-1.5 text-[9.5px] font-extrabold uppercase tracking-wide text-primary">
      <Sparkles className="size-2.5" strokeWidth={2.4} aria-hidden />
      Coach
    </span>
  );
}

export type TaskModalFieldProps = {
  label?: string;
  optional?: boolean;
  agent?: boolean;
  hint?: string;
  help?: string;
  children: ReactNode;
  className?: string;
};

/** `.tm-field` — labelled wrapper; `agent` marks the field as Coach-populated. */
export function TaskModalField({
  label,
  optional,
  agent,
  hint,
  help,
  children,
  className,
}: TaskModalFieldProps) {
  return (
    <div className={cn('mb-3.5 last:mb-0', className)}>
      {label ? (
        <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-foreground">
          {label}
          {optional ? <span className="font-medium text-muted-foreground">· optional</span> : null}
          {agent ? <TaskModalAgentTag /> : null}
          {hint ? <span className="ml-auto text-muted-foreground">{hint}</span> : null}
        </div>
      ) : null}
      <div
        className={cn(
          agent &&
            '[&_input]:border-primary/55 [&_select]:border-primary/55 [&_textarea]:border-primary/55 [&_button[data-slot=select-trigger]]:border-primary/55',
        )}
      >
        {children}
      </div>
      {help ? (
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted-foreground">{help}</p>
      ) : null}
    </div>
  );
}

/** Shared input sizing token — 44px height, `--radius-lg` corners, matches `.tm-input`. */
export const taskModalInputClass =
  'h-11 w-full rounded-lg border border-input bg-background px-3.5 text-[14.5px] text-foreground outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50';

export type TaskModalDisclosureProps = {
  icon?: ReactNode;
  title: string;
  meta?: string;
  defaultOpen?: boolean;
  children: ReactNode;
};

/** `.tm-disc` — collapsible section (Cover & appearance, Attachments, Danger zone). Closed by default. */
export function TaskModalDisclosure({
  icon,
  title,
  meta,
  defaultOpen = false,
  children,
}: TaskModalDisclosureProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-border">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 py-4 text-left text-foreground"
      >
        {icon ? (
          <span className="flex size-[26px] shrink-0 items-center justify-center rounded-lg bg-secondary text-foreground">
            {icon}
          </span>
        ) : null}
        <span className="text-[13px] font-bold tracking-tight">{title}</span>
        {meta ? (
          <span className="ml-auto text-xs font-medium text-muted-foreground">{meta}</span>
        ) : null}
        <ChevronRight
          className={cn(
            'size-[18px] shrink-0 text-muted-foreground transition-transform',
            !meta && 'ml-auto',
            open && 'rotate-90',
          )}
          aria-hidden
        />
      </button>
      {open ? <div className="pb-[18px]">{children}</div> : null}
    </div>
  );
}
