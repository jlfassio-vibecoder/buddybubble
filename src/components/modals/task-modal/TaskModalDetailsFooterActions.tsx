'use client';

import { useEffect, useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TaskModalDisclosure } from '@/components/modals/task-modal/TaskModalSection';
import { TaskHardDeleteBlockedError } from '@/components/modals/task-modal/hooks/useTaskHardDelete';

export type TaskModalDetailsFooterActionsProps = {
  canWrite: boolean;
  isCreateMode: boolean;
  saving: boolean;
  typeNoun: string;
  taskId: string | null;
  archiving: boolean;
  loading: boolean;
  onArchiveTask: () => void | Promise<void>;
  /** Hard delete (Phase 3.8). When absent, the delete panel is hidden. */
  onHardDeleteTask?: () => void | Promise<void>;
};

/** Danger zone only — Save/Create live in `TaskModalDetailsStickyFooter`. */
export function TaskModalDetailsFooterActions({
  canWrite,
  isCreateMode,
  saving,
  typeNoun,
  taskId,
  archiving,
  loading,
  onArchiveTask,
  onHardDeleteTask,
}: TaskModalDetailsFooterActionsProps) {
  const [deleteStep, setDeleteStep] = useState<'idle' | 'confirm'>('idle');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    setDeleteStep('idle');
    setDeleteError(null);
    setDeleting(false);
  }, [taskId]);

  if (isCreateMode || !taskId || !canWrite) return null;

  return (
    <TaskModalDisclosure
      icon={<TriangleAlert className="size-4" aria-hidden />}
      title="Danger zone"
      meta={onHardDeleteTask ? 'Archive · Delete' : 'Archive'}
    >
      <div className="space-y-3">
        <div className="rounded-xl border border-destructive/35 bg-destructive/[0.07] px-4 py-[15px]">
          <p className="mb-1.5 text-[13px] font-bold text-destructive">Archive {typeNoun}</p>
          <p className="mb-2.5 text-xs leading-relaxed text-muted-foreground">
            Hides this {typeNoun} from the board and calendar. Recovery from archive is not
            available in this version yet.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-destructive/50 text-destructive hover:bg-destructive/[0.14] hover:text-destructive"
            disabled={archiving || saving || loading}
            onClick={() => void onArchiveTask()}
          >
            {archiving ? 'Archiving…' : `Archive ${typeNoun}`}
          </Button>
        </div>

        {onHardDeleteTask ? (
          <div className="rounded-xl border border-destructive/35 bg-destructive/[0.07] px-4 py-[15px]">
            <p className="mb-1.5 text-[13px] font-bold text-destructive">Delete {typeNoun}</p>
            <p className="mb-2.5 text-xs leading-relaxed text-muted-foreground">
              Permanently removes this {typeNoun} and its chat history. This cannot be undone.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={deleting || archiving || saving || loading}
                onClick={() => {
                  if (deleteStep === 'idle') {
                    setDeleteError(null);
                    setDeleteStep('confirm');
                    return;
                  }
                  void (async () => {
                    setDeleting(true);
                    setDeleteError(null);
                    try {
                      await onHardDeleteTask();
                      setDeleteStep('idle');
                    } catch (e) {
                      if (
                        e instanceof TaskHardDeleteBlockedError &&
                        e.reason === 'PROGRAM_HAS_CHILDREN'
                      ) {
                        setDeleteError(
                          `Cannot delete this program — ${e.childCount} child workout(s) still reference it. Archive or delete them first.`,
                        );
                      } else if (e instanceof Error) {
                        setDeleteError(e.message);
                      } else {
                        setDeleteError('Delete failed.');
                      }
                    } finally {
                      setDeleting(false);
                    }
                  })();
                }}
              >
                {deleting
                  ? 'Deleting…'
                  : deleteStep === 'confirm'
                    ? 'Delete permanently'
                    : `Delete ${typeNoun}`}
              </Button>
              {deleteStep === 'confirm' ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={deleting}
                  onClick={() => {
                    setDeleteStep('idle');
                    setDeleteError(null);
                  }}
                >
                  Cancel
                </Button>
              ) : null}
            </div>
            {deleteError ? <p className="mt-2 text-xs text-destructive">{deleteError}</p> : null}
          </div>
        ) : null}
      </div>
    </TaskModalDisclosure>
  );
}
