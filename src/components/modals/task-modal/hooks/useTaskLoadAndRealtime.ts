'use client';

import { useCallback, useEffect } from 'react';
import { createClient } from '@utils/supabase/client';
import type { TaskRow } from '@/types/database';

export type UseTaskLoadAndRealtimeParams = {
  open: boolean;
  taskId: string | null;
  applyRow: (row: TaskRow) => void;
  /** Called when the modal opens in create mode (`open && !taskId`); should reset all form state. */
  onResetForCreate: () => void;
  setLoading: (loading: boolean) => void;
  setError: (message: string | null) => void;
};

/**
 * Loads the task when opening in edit mode, resets form when opening in create mode,
 * and subscribes to `tasks` row updates for the current task id.
 */
export function useTaskLoadAndRealtime({
  open,
  taskId,
  applyRow,
  onResetForCreate,
  setLoading,
  setError,
}: UseTaskLoadAndRealtimeParams): { loadTask: (id: string) => Promise<void> } {
  const loadTask = useCallback(
    async (id: string) => {
      setLoading(true);
      setError(null);
      const supabase = createClient();
      const { data, error: qErr } = await supabase
        .from('tasks')
        .select('*, task_subtasks(*), task_activity_log(*), task_assignees(user_id)')
        .eq('id', id)
        .maybeSingle();
      setLoading(false);
      if (qErr || !data) {
        setError(qErr?.message ?? 'Card not found');
        return;
      }
      applyRow(data as TaskRow);
    },
    [applyRow, setLoading, setError],
  );

  useEffect(() => {
    if (!open) return;
    if (!taskId) {
      onResetForCreate();
      return;
    }
    void loadTask(taskId);
  }, [open, taskId, loadTask, onResetForCreate]);

  useEffect(() => {
    if (!open || !taskId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`task-modal:${taskId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'tasks',
          filter: `id=eq.${taskId}`,
        },
        () => {
          void loadTask(taskId);
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [open, taskId, loadTask]);

  return { loadTask };
}
