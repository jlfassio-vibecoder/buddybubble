'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { TaskHardDeleteBlockedError } from '@/components/modals/task-modal/hooks/useTaskHardDelete';

export type TaskModalDetailsFooterActionsProps = {
  canWrite: boolean;
  isCreateMode: boolean;
  saving: boolean;
  title: string;
  typeNoun: string;
  coreDirty: boolean;
  onCreateTask: () => void | Promise<void>;
  onSaveCoreFields: () => void | Promise<void | boolean>;
  taskId: string | null;
  archiving: boolean;
  loading: boolean;
  onArchiveTask: () => void | Promise<void>;
  /** Hard delete (Phase 3.8). When absent, the delete panel is hidden. */
  onHardDeleteTask?: () => void | Promise<void>;
};

export function TaskModalDetailsFooterActions({
  canWrite,
  isCreateMode,
  saving,
  title,
  typeNoun,
  coreDirty,
  onCreateTask,
  onSaveCoreFields,
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

  return (
    <>
      {canWrite && (
        <div className="flex flex-wrap gap-2 pt-2">
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
      )}

      {!isCreateMode && taskId && canWrite ? (
        <>
          <Separator className="my-4" />
          <div className="rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-3">
            <p className="mb-2 text-xs font-medium text-destructive">Archive {typeNoun}</p>
            <p className="mb-3 text-xs text-muted-foreground">
              Hides this {typeNoun} from the board and calendar. Recovery from archive is not
              available in this version yet.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={archiving || saving || loading}
              onClick={() => void onArchiveTask()}
            >
              {archiving ? 'Archiving…' : `Archive ${typeNoun}`}
            </Button>
          </div>
        </>
      ) : null}

      {!isCreateMode && taskId && canWrite && onHardDeleteTask ? (
        <>
          <Separator className="my-4" />
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-3">
            <p className="mb-2 text-xs font-medium text-destructive">Delete {typeNoun}</p>
            <p className="mb-3 text-xs text-muted-foreground">
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
        </>
      ) : null}
    </>
  );
}
