'use client';

import { useEffect, useState } from 'react';
import {
  getArchivedTasksAction,
  hardDeleteTaskAction,
  restoreTaskAction,
} from '@/app/(dashboard)/app/[workspace_id]/tasks-actions';
import { ArchivedTaskItem } from '@/components/board/archived-task-item';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import type { TaskRow } from '@/types/database';

export type ArchiveSheetProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  bubbleId: string;
  canWrite: boolean;
  onActionComplete?: () => void;
};

export function ArchiveSheet({
  isOpen,
  onOpenChange,
  bubbleId,
  canWrite,
  onActionComplete,
}: ArchiveSheetProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [tasks, setTasks] = useState<TaskRow[]>([]);

  useEffect(() => {
    if (!isOpen || !bubbleId.trim()) return;

    let cancelled = false;
    setLoading(true);
    setError(null);
    setActionError(null);

    void getArchivedTasksAction(bubbleId).then((res) => {
      if (cancelled) return;
      setLoading(false);
      if (res.ok) {
        setTasks(res.tasks);
      } else {
        setError(res.error);
        setTasks([]);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [isOpen, bubbleId]);

  const handleRestore = async (taskId: string) => {
    setActionError(null);
    const res = await restoreTaskAction(taskId);
    if (!res.ok) {
      setActionError(res.error);
      return;
    }
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    onActionComplete?.();
  };

  const handleDelete = async (taskId: string) => {
    setActionError(null);
    const res = await hardDeleteTaskAction(taskId);
    if (!res.ok) {
      setActionError(res.error);
      return;
    }
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    onActionComplete?.();
  };

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full max-w-md flex-col p-0">
        <header className="border-b border-border px-6 pb-3 pr-14 pt-4">
          <SheetTitle>Archived Items</SheetTitle>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {!canWrite ? (
            <p className="mb-3 text-xs text-muted-foreground">
              You can view archived items; editing is limited for this bubble.
            </p>
          ) : null}
          {actionError ? <p className="mb-3 text-sm text-destructive">{actionError}</p> : null}
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : tasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No archived items</p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {tasks.map((task) => (
                <li key={task.id}>
                  <ArchivedTaskItem
                    task={task}
                    canWrite={canWrite}
                    onRestore={handleRestore}
                    onDelete={handleDelete}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
