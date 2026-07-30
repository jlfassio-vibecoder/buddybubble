'use client';

import {
  CheckCircle2,
  History,
  MessageCircle,
  Paperclip,
  Pencil,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TaskActivityEntry } from '@/types/task-modal';
import { formatActivityLine } from './task-modal-activity-utils';

export type TaskModalActivityPanelProps = {
  activityLog: TaskActivityEntry[];
};

const ICON_BY_TYPE: Record<string, LucideIcon> = {
  field_change: Pencil,
  comment: MessageCircle,
  subtask: CheckCircle2,
  attachment: Paperclip,
};

const ACCENT_TYPES = new Set(['subtask', 'attachment']);

export function TaskModalActivityPanel({ activityLog }: TaskModalActivityPanelProps) {
  if (activityLog.length === 0) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <History className="size-4 shrink-0" aria-hidden />
        No activity yet.
      </p>
    );
  }

  return (
    // Copilot suggestion ignored: timeline connector positioning depends on div layout, not list semantics.
    <div className="pl-2">
      {activityLog.map((e, i) => {
        const Icon = ICON_BY_TYPE[e.type] ?? Sparkles;
        const accent = ACCENT_TYPES.has(e.type);
        const isLast = i === activityLog.length - 1;
        return (
          <div key={e.id} className={cn('relative flex gap-3', !isLast && 'pb-[18px]')}>
            {!isLast ? (
              <span
                className="absolute left-3 top-[26px] bottom-[-2px] w-px bg-border"
                aria-hidden
              />
            ) : null}
            <span
              className={cn(
                'z-[1] flex size-[25px] shrink-0 items-center justify-center rounded-full border',
                accent
                  ? 'border-primary/35 bg-primary/18 text-primary'
                  : 'border-border bg-secondary text-muted-foreground',
              )}
            >
              <Icon className="size-3.5" strokeWidth={2} aria-hidden />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="text-[13px] leading-snug text-foreground">{formatActivityLine(e)}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {new Date(e.at).toLocaleString()}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
