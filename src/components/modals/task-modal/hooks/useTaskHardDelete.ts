'use client';

import { useCallback } from 'react';
import { createClient } from '@utils/supabase/client';
import type { ItemType } from '@/types/database';

export type TaskHardDeleteBlockedReason = 'PROGRAM_HAS_CHILDREN';

export class TaskHardDeleteBlockedError extends Error {
  readonly reason: TaskHardDeleteBlockedReason;
  readonly childCount: number;

  constructor(reason: TaskHardDeleteBlockedReason, childCount: number) {
    super(reason);
    this.name = 'TaskHardDeleteBlockedError';
    this.reason = reason;
    this.childCount = childCount;
  }
}

export function useTaskHardDelete() {
  const hardDeleteTask = useCallback(async (id: string, opts?: { itemType?: ItemType }) => {
    const supabase = createClient();
    if (opts?.itemType === 'program') {
      const { count, error } = await supabase
        .from('tasks')
        .select('id', { count: 'exact', head: true })
        .eq('program_id', id);
      if (error) throw error;
      const n = count ?? 0;
      if (n > 0) {
        throw new TaskHardDeleteBlockedError('PROGRAM_HAS_CHILDREN', n);
      }
    }
    const { error } = await supabase.from('tasks').delete().eq('id', id);
    if (error) throw error;
  }, []);

  return { hardDeleteTask };
}
