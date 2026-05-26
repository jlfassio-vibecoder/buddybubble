import type { SupabaseClient } from '@supabase/supabase-js';

export const WORKOUT_LOGS_BUBBLE_NAME = 'Workout Logs';

/**
 * Resolves the fitness workspace bubble used for workout_log drafts and completions.
 * Falls back to the source workout bubble when the channel is missing (pre-backfill workspaces).
 */
export async function resolveWorkoutLogsBubbleId(
  supabase: SupabaseClient,
  workspaceId: string,
  fallbackBubbleId: string,
): Promise<string> {
  const { data, error } = await supabase
    .from('bubbles')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('name', WORKOUT_LOGS_BUBBLE_NAME)
    .maybeSingle();

  if (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[resolveWorkoutLogsBubbleId] query failed; using source bubble', error);
    }
    return fallbackBubbleId;
  }

  if (!data?.id) {
    if (process.env.NODE_ENV === 'development') {
      console.warn(
        `[resolveWorkoutLogsBubbleId] "${WORKOUT_LOGS_BUBBLE_NAME}" bubble missing; using source bubble`,
      );
    }
    return fallbackBubbleId;
  }

  return data.id;
}
