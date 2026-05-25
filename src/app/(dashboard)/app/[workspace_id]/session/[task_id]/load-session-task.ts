import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeItemType } from '@/lib/item-types';
import { resolveWorkoutLogsBubbleId } from '@/lib/fitness/resolve-workout-logs-bubble-id';
import type { ActiveSessionTaskPayload } from '@/features/active-session/types/session-task';

export async function loadActiveSessionTask(
  supabase: SupabaseClient,
  workspaceId: string,
  taskId: string,
): Promise<ActiveSessionTaskPayload | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: membership } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!membership) return null;

  const { data: task, error: taskError } = await supabase
    .from('tasks')
    .select('id, bubble_id, metadata, title, item_type')
    .eq('id', taskId)
    .maybeSingle();

  if (taskError || !task) return null;

  if (normalizeItemType(task.item_type) !== 'workout') return null;

  const { data: bubble, error: bubbleError } = await supabase
    .from('bubbles')
    .select('workspace_id')
    .eq('id', task.bubble_id)
    .maybeSingle();

  if (bubbleError || !bubble || bubble.workspace_id !== workspaceId) return null;

  const targetBubbleId = await resolveWorkoutLogsBubbleId(supabase, workspaceId, task.bubble_id);

  return {
    id: task.id,
    title: task.title,
    bubble_id: task.bubble_id,
    target_bubble_id: targetBubbleId,
    metadata: task.metadata,
    item_type: task.item_type,
  };
}

export type { ActiveSessionTaskPayload };
