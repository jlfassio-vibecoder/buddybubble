'use client';

import { useCallback, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { toast } from 'sonner';
import { formatUserFacingError } from '@/lib/format-error';
import type { SessionDeckSnapshot } from '@/features/live-video/shells/huddle/session-deck-snapshot';
import type { TaskRow } from '@/types/database';

export type UsePersistDeckSnapshotArgs = {
  supabase: SupabaseClient;
  canWrite: boolean;
  onSuccess?: () => void;
};

export function usePersistDeckSnapshot({
  supabase,
  canWrite,
  onSuccess,
}: UsePersistDeckSnapshotArgs) {
  const [busy, setBusy] = useState(false);

  const updateOriginalTask = useCallback(
    async (snap: SessionDeckSnapshot): Promise<boolean> => {
      if (!canWrite) {
        toast.error('You do not have permission to update tasks.');
        return false;
      }
      setBusy(true);
      try {
        const { error } = await supabase
          .from('tasks')
          .update({
            metadata: snap.task.metadata as TaskRow['metadata'],
            updated_at: new Date().toISOString(),
          })
          .eq('id', snap.originTaskId);
        if (error) {
          toast.error(formatUserFacingError(error));
          return false;
        }
        toast.success('Original card updated');
        onSuccess?.();
        return true;
      } finally {
        setBusy(false);
      }
    },
    [canWrite, onSuccess, supabase],
  );

  const insertTaskClone = useCallback(
    async (snap: SessionDeckSnapshot): Promise<string | null> => {
      if (!canWrite) {
        toast.error('You do not have permission to create tasks.');
        return null;
      }
      const t = snap.task;
      const bubbleId = t.bubble_id;
      if (!bubbleId) {
        toast.error('Missing bubble for new card.');
        return null;
      }
      setBusy(true);
      try {
        const { data: posRows, error: posErr } = await supabase
          .from('tasks')
          .select('position')
          .eq('bubble_id', bubbleId)
          .is('archived_at', null)
          .order('position', { ascending: false })
          .limit(1);
        if (posErr) {
          toast.error(formatUserFacingError(posErr));
          return null;
        }
        const maxPos =
          posRows?.[0] && typeof (posRows[0] as { position: number }).position === 'number'
            ? Number((posRows[0] as { position: number }).position) + 1
            : 0;

        const baseTitle = (t.title ?? '').trim() || 'Workout';
        const title = `${baseTitle} (Copy)`.slice(0, 500);

        const insertRow = {
          bubble_id: bubbleId,
          title,
          description: t.description ?? null,
          status: t.status,
          priority: t.priority,
          position: maxPos,
          scheduled_on: t.scheduled_on ?? null,
          scheduled_time: t.scheduled_time ?? null,
          item_type: t.item_type,
          metadata: t.metadata as TaskRow['metadata'],
          visibility: t.visibility,
          assigned_to: t.assigned_to ?? null,
          program_id: t.program_id ?? null,
          program_session_key: t.program_session_key ?? null,
          attachments: t.attachments ?? {},
        };

        const { data, error: insErr } = await supabase
          .from('tasks')
          .insert(insertRow)
          .select('id')
          .maybeSingle();

        if (insErr || !data?.id) {
          toast.error(formatUserFacingError(insErr ?? new Error('Insert failed')));
          return null;
        }
        toast.success('Saved as new card');
        onSuccess?.();
        return data.id as string;
      } finally {
        setBusy(false);
      }
    },
    [canWrite, onSuccess, supabase],
  );

  return { busy, updateOriginalTask, insertTaskClone };
}
