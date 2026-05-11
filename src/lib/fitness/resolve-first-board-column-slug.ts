import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * First column slug for a workspace (by `board_columns.position`).
 * Falls back to `'planned'` when the query fails or returns nothing.
 */
export async function resolveFirstBoardColumnSlug(
  db: SupabaseClient,
  workspaceId: string,
): Promise<string> {
  const { data, error } = await db
    .from('board_columns')
    .select('slug')
    .eq('workspace_id', workspaceId)
    .order('position', { ascending: true })
    .limit(1);

  if (error) {
    console.error('[resolveFirstBoardColumnSlug] board_columns', error);
    return 'planned';
  }
  const slug = data?.[0]?.slug;
  return typeof slug === 'string' && slug.trim() ? slug.trim() : 'planned';
}
