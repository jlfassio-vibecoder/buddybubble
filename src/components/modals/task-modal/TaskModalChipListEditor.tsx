'use client';

import { useState, type ReactNode } from 'react';
import { Package, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { taskModalInputClass } from '@/components/modals/task-modal/TaskModalSection';
import { cn } from '@/lib/utils';

export type TaskModalChipListEditorProps = {
  values: string[];
  onChange: (next: string[]) => void;
  canWrite: boolean;
  addPlaceholder: string;
  testId: string;
  /** When true, show a Package icon on each chip (Event bring). */
  chipIcon?: boolean;
  emptyLabel?: string;
};

/**
 * Shared add/remove chip editor for TaskModal canvases (Event bring/people, Experience good_for).
 */
export function TaskModalChipListEditor({
  values,
  onChange,
  canWrite,
  addPlaceholder,
  testId,
  chipIcon,
  emptyLabel = 'None yet',
}: TaskModalChipListEditorProps) {
  const [draft, setDraft] = useState('');

  const commit = () => {
    const t = draft.trim();
    if (!t) return;
    if (values.some((v) => v.toLowerCase() === t.toLowerCase())) {
      setDraft('');
      return;
    }
    onChange([...values, t]);
    setDraft('');
  };

  return (
    <div className="space-y-2" data-testid={testId}>
      <div className="flex flex-wrap gap-1.5">
        {values.map((v, idx) => (
          <span
            key={`${v}-${idx}`}
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-secondary px-2.5 text-xs font-semibold text-foreground"
          >
            {chipIcon ? <Package className="size-3 text-muted-foreground" aria-hidden /> : null}
            {v}
            {canWrite ? (
              <button
                type="button"
                className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                aria-label={`Remove ${v}`}
                onClick={() => onChange(values.filter((_, i) => i !== idx))}
              >
                <X className="size-3" aria-hidden />
              </button>
            ) : null}
          </span>
        ))}
        {values.length === 0 && !canWrite ? (
          <p className="text-xs text-muted-foreground" data-testid={`${testId}-empty`}>
            {emptyLabel}
          </p>
        ) : null}
      </div>
      {canWrite ? (
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commit();
              }
            }}
            placeholder={addPlaceholder}
            aria-label={addPlaceholder}
            className={cn(taskModalInputClass, 'h-8 max-w-[200px]')}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8"
            onClick={commit}
            data-testid={`${testId}-add`}
          >
            Add
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export type TaskModalStringListEditorProps = {
  values: string[];
  onChange: (next: string[]) => void;
  canWrite: boolean;
  addPlaceholder: string;
  testId: string;
  emptyHelp: string;
  icon: ReactNode;
};

/**
 * Icon-led list editor (handoff `.tm-list`) for Experience highlights / includes.
 */
export function TaskModalStringListEditor({
  values,
  onChange,
  canWrite,
  addPlaceholder,
  testId,
  emptyHelp,
  icon,
}: TaskModalStringListEditorProps) {
  const [draft, setDraft] = useState('');

  const commit = () => {
    const t = draft.trim();
    if (!t) return;
    if (values.some((v) => v.toLowerCase() === t.toLowerCase())) {
      setDraft('');
      return;
    }
    onChange([...values, t]);
    setDraft('');
  };

  return (
    <div className="space-y-1" data-testid={testId}>
      {values.length === 0 ? (
        <p className="text-xs text-muted-foreground" data-testid={`${testId}-empty`}>
          {emptyHelp}
        </p>
      ) : (
        <ul className="m-0 list-none p-0">
          {values.map((v, idx) => (
            <li
              key={`${v}-${idx}`}
              className={cn(
                'flex items-start gap-2.5 py-2 text-[13.5px] text-foreground',
                idx < values.length - 1 && 'border-b border-border/60',
              )}
            >
              <span className="mt-0.5 shrink-0 text-primary">{icon}</span>
              <span className="min-w-0 flex-1 leading-snug">{v}</span>
              {canWrite ? (
                <button
                  type="button"
                  className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
                  aria-label={`Remove ${v}`}
                  onClick={() => onChange(values.filter((_, i) => i !== idx))}
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {canWrite ? (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commit();
              }
            }}
            placeholder={addPlaceholder}
            aria-label={addPlaceholder}
            className={cn(taskModalInputClass, 'h-8 max-w-[240px]')}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8"
            onClick={commit}
            data-testid={`${testId}-add`}
          >
            Add
          </Button>
        </div>
      ) : null}
    </div>
  );
}
