'use client';

import { useCallback, useEffect, useRef } from 'react';
import { createClient } from '@utils/supabase/client';
import { supabaseClientErrorMessage } from '@/lib/supabase-client-error';

export type UseTaskCommentsViewedMarkerArgs = {
  enabled: boolean;
  taskId: string | null;
  userId: string | null | undefined;
  onMarkedRead?: () => void;
};

/**
 * Debounced `user_task_views` upsert when the user has the task comments rail open.
 * Extracted from the former task-modal comments rail wrapper (Phase 3.7).
 */
export function useTaskCommentsViewedMarker({
  enabled,
  taskId,
  userId,
  onMarkedRead,
}: UseTaskCommentsViewedMarkerArgs): void {
  const onMarkedReadRef = useRef(onMarkedRead);
  onMarkedReadRef.current = onMarkedRead;

  const recordCommentsViewed = useCallback(async () => {
    const uid = userId;
    const tid = taskId?.trim();
    if (!uid || !tid) return;
    const supabase = createClient();
    const { error } = await supabase.from('user_task_views').upsert(
      {
        user_id: uid,
        task_id: tid,
        last_viewed_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,task_id' },
    );
    if (error) {
      console.warn(
        '[useTaskCommentsViewedMarker] user_task_views upsert failed',
        supabaseClientErrorMessage(error),
      );
      return;
    }
    onMarkedReadRef.current?.();
  }, [userId, taskId]);

  useEffect(() => {
    if (!enabled) return;
    if (!userId) return;
    if (!taskId?.trim()) return;
    let cancelled = false;
    const debounceMs = 1500;
    const t = window.setTimeout(() => {
      if (cancelled) return;
      void recordCommentsViewed();
    }, debounceMs);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [enabled, userId, taskId, recordCommentsViewed]);
}
