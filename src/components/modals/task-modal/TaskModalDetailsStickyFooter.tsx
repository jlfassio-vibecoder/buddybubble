'use client';

import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type TaskModalDetailsStickyFooterProps = {
  canWrite: boolean;
  isCreateMode: boolean;
  saving: boolean;
  title: string;
  typeNoun: string;
  coreDirty: boolean;
  onCancel: () => void;
  onCreateTask: () => void | Promise<unknown>;
  onSaveCoreFields: () => void | Promise<unknown>;
  className?: string;
};

/**
 * Handoff `.tm-foot`: save-state hint + Cancel / Save|Create.
 * Status-only hint — does not introduce a second write path.
 */
export function TaskModalDetailsStickyFooter({
  canWrite,
  isCreateMode,
  saving,
  title,
  typeNoun,
  coreDirty,
  onCancel,
  onCreateTask,
  onSaveCoreFields,
  className,
}: TaskModalDetailsStickyFooterProps) {
  if (!canWrite) return null;

  let hint: ReactNode;
  if (saving) {
    hint = <span className="text-muted-foreground">{isCreateMode ? 'Creating…' : 'Saving…'}</span>;
  } else if (isCreateMode && !title.trim()) {
    hint = <span className="text-muted-foreground">Add a title to create</span>;
  } else if (coreDirty || isCreateMode) {
    hint = <span className="text-muted-foreground">Unsaved changes</span>;
  } else {
    hint = (
      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
        <Check
          className="size-3.5 text-emerald-600 dark:text-emerald-500"
          aria-hidden
          strokeWidth={2.4}
        />
        All changes saved
      </span>
    );
  }

  return (
    <footer
      className={cn(
        'flex shrink-0 flex-wrap items-center gap-3 border-t border-border bg-card px-5 py-3',
        className,
      )}
      data-testid="task-modal-details-sticky-footer"
    >
      <div className="min-w-0 text-xs" data-testid="task-modal-details-footer-hint">
        {hint}
      </div>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={onCancel}>
          Cancel
        </Button>
        {isCreateMode ? (
          <Button
            type="button"
            size="sm"
            disabled={saving || !title.trim()}
            onClick={() => void onCreateTask()}
          >
            {saving ? 'Creating…' : `Create ${typeNoun}`}
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            disabled={saving || !coreDirty}
            onClick={() => void onSaveCoreFields()}
          >
            {saving ? 'Saving…' : `Save ${typeNoun}`}
          </Button>
        )}
      </div>
    </footer>
  );
}
