'use client';

import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

export type TaskModalDetailsFooterActionsProps = {
  canWrite: boolean;
  isCreateMode: boolean;
  saving: boolean;
  title: string;
  typeNoun: string;
  coreDirty: boolean;
  onCreateTask: () => void | Promise<void>;
  onSaveCoreFields: () => void | Promise<void>;
  taskId: string | null;
  archiving: boolean;
  loading: boolean;
  onArchiveTask: () => void | Promise<void>;
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
}: TaskModalDetailsFooterActionsProps) {
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
    </>
  );
}
