'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@utils/supabase/client';
import type { TaskRow } from '@/types/database';

export type WorkoutTemplate = Pick<
  TaskRow,
  'id' | 'title' | 'description' | 'metadata' | 'item_type'
>;

/**
 * Loads tasks with `item_type = 'workout'` from all bubbles in a workspace.
 * Used to populate a template picker so users can clone a workout as a new task.
 */
export function useWorkoutTemplates(workspaceId: string | null): {
  templates: WorkoutTemplate[];
  loading: boolean;
  reload: () => Promise<void>;
} {
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!workspaceId) {
      setTemplates([]);
      return;
    }
    setLoading(true);

    const supabase = createClient();

    const { data: bubbles } = await supabase
      .from('bubbles')
      .select('id')
      .eq('workspace_id', workspaceId);

    if (!bubbles?.length) {
      setTemplates([]);
      setLoading(false);
      return;
    }

    const bubbleIds = bubbles.map((b) => b.id as string);

    const { data: tasks } = await supabase
      .from('tasks')
      .select('id, title, description, metadata, item_type')
      .in('bubble_id', bubbleIds)
      .eq('item_type', 'workout')
      .is('archived_at', null)
      .order('created_at', { ascending: false })
      .limit(50);

    setTemplates((tasks ?? []) as WorkoutTemplate[]);
    setLoading(false);
  }, [workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { templates, loading, reload: load };
}
