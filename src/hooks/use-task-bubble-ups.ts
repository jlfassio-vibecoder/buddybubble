import { useCallback, useEffect, useId, useMemo } from 'react';
import { useTaskBubbleUpStore } from '@/store/taskBubbleUpStore';
import type { TaskBubbleUpSummary } from '@/store/taskBubbleUpStore';
import type { TaskBubbleUpControlProps } from '@/components/tasks/bubbly-button';

export type { TaskBubbleUpSummary };

/**
 * Shared Bubble Up state via {@link useTaskBubbleUpStore}: all surfaces see the same counts / hasMine.
 * Each consumer registers its `taskIds` scope so loads are coalesced into one batch query.
 */
export function useTaskBubbleUps(taskIds: readonly string[]) {
  const scopeId = useId();
  const uniqueSortedKey = useMemo(() => [...new Set(taskIds)].sort().join(','), [taskIds]);

  const registerScope = useTaskBubbleUpStore((s) => s.registerScope);
  const unregisterScope = useTaskBubbleUpStore((s) => s.unregisterScope);
  const summaries = useTaskBubbleUpStore((s) => s.summaries);
  const pendingTaskIds = useTaskBubbleUpStore((s) => s.pendingTaskIds);
  const authUserId = useTaskBubbleUpStore((s) => s.authUserId);
  const toggleTask = useTaskBubbleUpStore((s) => s.toggleTask);

  useEffect(() => {
    const ids = [...new Set(taskIds)];
    registerScope(scopeId, ids);
    return () => unregisterScope(scopeId);
  }, [uniqueSortedKey, scopeId, registerScope, unregisterScope]);

  const bubbleUpPropsFor = useCallback(
    (taskId: string): TaskBubbleUpControlProps | undefined => {
      if (!authUserId) return undefined;
      const row = summaries[taskId] ?? { count: 0, hasMine: false };
      return {
        count: row.count,
        hasMine: row.hasMine,
        busy: Boolean(pendingTaskIds[taskId]),
        onToggle: () => void toggleTask(taskId),
      };
    },
    [authUserId, summaries, pendingTaskIds, toggleTask],
  );

  return { bubbleUpPropsFor };
}
