'use client';

import { useCallback, useEffect } from 'react';
import { createClient } from '@utils/supabase/client';
import type { TaskRow } from '@/types/database';

export type ApplyRowContext = {
  /** When true, caller is a silent refresh (realtime / execution patch); form may merge instead of clobbering dirty text. */
  silent: boolean;
};

export type UseTaskLoadAndRealtimeParams = {
  open: boolean;
  taskId: string | null;
  applyRow: (row: TaskRow, ctx: ApplyRowContext) => void;
  /** Called when the modal opens in create mode (`open && !taskId`); should reset all form state. */
  onResetForCreate: () => void;
  setLoading: (loading: boolean) => void;
  setError: (message: string | null) => void;
  /** Invoked when the `tasks` row is deleted while the modal is open (e.g. hard delete elsewhere). */
  onTaskRowDeleted?: () => void;
};

type LoadTaskOptions = {
  silent?: boolean;
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
  onTaskRowDeleted,
}: UseTaskLoadAndRealtimeParams): {
  loadTask: (id: string, options?: LoadTaskOptions) => Promise<void>;
} {
  const loadTask = useCallback(
    async (id: string, options?: LoadTaskOptions) => {
      const silent = options?.silent === true;
      const applyCtx: ApplyRowContext = { silent };
      if (!silent) {
        setLoading(true);
      }
      setError(null);
      const supabase = createClient();
      const maxAttempts = 5;
      const delayMs = 400;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const { data, error: qErr } = await supabase
          .from('tasks')
          .select('*, task_subtasks(*), task_activity_log(*), task_assignees(user_id)')
          .eq('id', id)
          .maybeSingle();
        if (qErr) {
          if (!silent) {
            setLoading(false);
          }
          setError(qErr.message ?? 'Card not found');
          return;
        }
        if (data) {
          if (!silent) {
            setLoading(false);
          }
          applyRow(data as TaskRow, applyCtx);
          return;
        }
        // Row not visible yet (e.g. client opened TaskModal the moment after insert, before read-your-writes)
        if (attempt < maxAttempts - 1) {
          await new Promise((r) => setTimeout(r, delayMs));
        }
      }
      if (!silent) {
        setLoading(false);
      }
      setError('Card not found');
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
          // Realtime task updates can be frequent during active chat. Refresh fields
          // without toggling the shell loading state to avoid modal flash/reload UX.
          void loadTask(taskId, { silent: true });
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'tasks',
          filter: `id=eq.${taskId}`,
        },
        () => {
          onTaskRowDeleted?.();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [open, taskId, loadTask, onTaskRowDeleted]);

  return { loadTask };
}
