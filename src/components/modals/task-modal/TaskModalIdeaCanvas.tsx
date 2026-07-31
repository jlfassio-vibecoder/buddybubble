'use client';

import { ArrowUpRight, ChevronUp, Lightbulb } from 'lucide-react';
import type { Json } from '@/types/database';
import type { ItemType } from '@/lib/item-types';
import { parseTaskMetadata } from '@/lib/item-metadata';
import { ITEM_TYPE_VISUAL } from '@/lib/item-type-styles';
import { TaskModalField, TaskModalSection } from '@/components/modals/task-modal/TaskModalSection';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type PromoteTargetType = Extract<ItemType, 'event' | 'program' | 'class'>;

export type TaskModalIdeaCanvasProps = {
  taskMetadata?: Json | null;
  canWrite: boolean;
  onPromoteItemType?: (next: PromoteTargetType) => void;
  /** When false, hide/disable Promote to Class (caller lacks class management). */
  canPromoteToClass?: boolean;
  className?: string;
  isAgentField?: (key: string) => boolean;
};

const PROMOTE_TARGETS: PromoteTargetType[] = ['event', 'program', 'class'];

/** Read `metadata.votes` without managed-field plumbing. */
export function readIdeaVotes(metadata: Json | null | undefined): number {
  const o = parseTaskMetadata(metadata ?? {}) as Record<string, unknown>;
  const raw = o.votes;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) return Math.floor(raw);
  if (typeof raw === 'string' && raw.trim()) {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) return Math.floor(n);
  }
  return 0;
}

function readOptionalString(meta: Record<string, unknown>, key: string): string | null {
  const v = meta[key];
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t || null;
}

function readTags(meta: Record<string, unknown>): string[] {
  const raw = meta.tags;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
    .map((t) => t.trim());
}

/**
 * Handoff-aligned Idea Details canvas: interest vote display + promote row.
 * Vote toggle persistence is out of scope this pass.
 */
export function TaskModalIdeaCanvas({
  taskMetadata = null,
  canWrite,
  onPromoteItemType,
  canPromoteToClass = true,
  className,
  isAgentField,
}: TaskModalIdeaCanvasProps) {
  const meta = parseTaskMetadata(taskMetadata ?? {}) as Record<string, unknown>;
  const votes = readIdeaVotes(taskMetadata);
  const effort = readOptionalString(meta, 'effort');
  const impact = readOptionalString(meta, 'impact');
  const tags = readTags(meta);
  const agent = (key: string) => Boolean(isAgentField?.(key));

  return (
    <div className={className} data-testid="task-modal-idea-canvas">
      <TaskModalSection
        icon={<Lightbulb className="size-4" aria-hidden />}
        title="Idea"
        sub="A lightweight proposal the community can rally behind before it becomes anything bigger."
      >
        <TaskModalField label="Interest">
          <div className="flex flex-wrap items-center gap-3.5">
            <button
              type="button"
              disabled
              aria-disabled
              className={cn(
                'inline-flex h-11 items-center gap-1.5 rounded-[var(--radius-xl)] border border-border bg-background px-3.5 text-foreground',
                'disabled:cursor-default disabled:opacity-100',
              )}
              data-testid="task-modal-idea-vote"
              title="Voting will be available in a later pass"
            >
              <ChevronUp className="size-4 shrink-0" aria-hidden strokeWidth={2.4} />
              <span className="text-[15px] font-bold tabular-nums tracking-tight">{votes}</span>
              <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
                votes
              </span>
            </button>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold tracking-tight text-foreground">
                Vote to show interest
              </div>
              <div className="mt-0.5 text-xs leading-snug text-muted-foreground">
                Members upvote ideas worth pursuing. High-interest ideas surface to organizers.
              </div>
            </div>
          </div>
        </TaskModalField>

        <div className="mt-3.5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TaskModalField label="Effort" agent={agent('effort')}>
            <div
              className="rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-muted-foreground"
              data-testid="task-modal-idea-effort"
            >
              {effort ?? '—'}
            </div>
          </TaskModalField>
          <TaskModalField label="Impact" agent={agent('impact')}>
            <div
              className="rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-muted-foreground"
              data-testid="task-modal-idea-impact"
            >
              {impact ?? '—'}
            </div>
          </TaskModalField>
        </div>

        <div className="mt-3.5">
          <TaskModalField label="Tags" agent={agent('tags')}>
            {tags.length > 0 ? (
              <div className="flex flex-wrap gap-1.5" data-testid="task-modal-idea-tags">
                {tags.map((t) => (
                  <span
                    key={t}
                    className="inline-flex h-6 items-center rounded-full bg-secondary px-2.5 text-[11px] font-semibold text-muted-foreground"
                  >
                    {t}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground" data-testid="task-modal-idea-tags-empty">
                No tags yet
              </p>
            )}
          </TaskModalField>
        </div>
      </TaskModalSection>

      <TaskModalSection
        icon={<ArrowUpRight className="size-4" aria-hidden />}
        title="Promote"
        sub="When an idea is ready, graduate it to a real card type — it keeps its title, description, and discussion."
      >
        <div className="flex flex-col gap-2" data-testid="task-modal-idea-promote">
          {PROMOTE_TARGETS.map((id) => {
            const vis = ITEM_TYPE_VISUAL[id];
            const Icon = vis.Icon;
            const classBlocked = id === 'class' && !canPromoteToClass;
            return (
              <Button
                key={id}
                type="button"
                variant="outline"
                size="sm"
                className="justify-start gap-2"
                disabled={!canWrite || !onPromoteItemType || classBlocked}
                title={
                  classBlocked
                    ? 'You need class management permission to promote to Class'
                    : undefined
                }
                onClick={() => onPromoteItemType?.(id)}
              >
                <Icon className={cn('size-3.5 shrink-0', vis.iconText)} aria-hidden />
                Promote to {vis.label}
              </Button>
            );
          })}
        </div>
      </TaskModalSection>
    </div>
  );
}
