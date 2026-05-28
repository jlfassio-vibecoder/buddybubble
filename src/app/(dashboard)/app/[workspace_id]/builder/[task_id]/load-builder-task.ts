import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeItemType } from '@/lib/item-types';
import { parseMemberRole } from '@/lib/permissions';
import type { WorkoutBuilderTaskPayload } from '@/features/workout-builder/types/workout-builder-task';

export async function loadBuilderTask(
  supabase: SupabaseClient,
  workspaceId: string,
  taskId: string,
): Promise<WorkoutBuilderTaskPayload | null> {
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
    .select('id, bubble_id, metadata, title, description, item_type')
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

  return {
    id: task.id,
    title: task.title,
    description: task.description,
    bubble_id: task.bubble_id,
    metadata: task.metadata,
    item_type: task.item_type,
    memberRole: parseMemberRole(membership.role),
  };
}

export type { WorkoutBuilderTaskPayload };
