'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@utils/supabase/client';
import type { TaskRow } from '@/types/database';
import { compareScheduledTime } from '@/lib/task-scheduled-time';

export type UseCalendarTasksParams = {
  /**
   * Call-site / logging only: `public.tasks` rows are scoped by `bubble_id`, not `workspace_id`.
   */
  workspaceId: string;
  bubbleIds: string[];
  /** Inclusive calendar day (YYYY-MM-DD), aligned with `scheduled_on`. */
  rangeStart: string;
  rangeEnd: string;
  enabled?: boolean;
  /** Bump (e.g. after archive or cross-rail drop) to refetch without changing range. */
  reloadNonce?: number;
};

function ymd(task: TaskRow): string {
  return task.scheduled_on ? String(task.scheduled_on).slice(0, 10) : '';
}

function sortCalendarTasks(rows: TaskRow[]): TaskRow[] {
  return [...rows].sort((a, b) => {
    const ad = ymd(a);
    const bd = ymd(b);
    const byDay = ad.localeCompare(bd);
    if (byDay !== 0) return byDay;
    const byTime = compareScheduledTime(a.scheduled_time, b.scheduled_time);
    if (byTime !== 0) return byTime;
    return a.title.localeCompare(b.title);
  });
}

export function useCalendarTasks(params: UseCalendarTasksParams): {
  tasks: TaskRow[];
  loading: boolean;
  error: string | null;
} {
  const { bubbleIds, rangeStart, rangeEnd, enabled = true, reloadNonce = 0 } = params;
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || bubbleIds.length === 0 || !rangeStart || !rangeEnd) {
      setTasks([]);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    async function run() {
      const supabase = createClient();
      const { data, error: qErr } = await supabase
        .from('tasks')
        .select('*')
        .in('bubble_id', bubbleIds)
        .gte('scheduled_on', rangeStart)
        .lte('scheduled_on', rangeEnd)
        .order('scheduled_on', { ascending: true })
        .order('position', { ascending: true });

      if (cancelled) return;

      if (qErr) {
        setTasks([]);
        setError(qErr.message);
        setLoading(false);
        return;
      }
      const rows = (data ?? []) as TaskRow[];
      setTasks(sortCalendarTasks(rows.filter((t) => !t.archived_at)));
      setLoading(false);
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [params.workspaceId, bubbleIds, enabled, rangeEnd, rangeStart, reloadNonce]);

  return { tasks, loading, error };
}
