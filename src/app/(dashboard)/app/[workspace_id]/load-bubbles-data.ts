import 'server-only';

import { createClient } from '@supabase/supabase-js';
import { unstable_cache } from 'next/cache';
import type { BubbleRow } from '@/types/database';
import { getSupabasePublishableKey, getSupabaseUrl } from '@utils/supabase/env';

export type BubblesPageData = {
  initialBubbles: BubbleRow[];
};

export function bubblesCacheTag(workspaceId: string): string {
  return `workspace-${workspaceId}-bubbles`;
}

export async function loadBubblesDataCached(
  workspaceId: string,
  userId: string,
  token: string,
): Promise<BubblesPageData> {
  const cached = unstable_cache(
    async (): Promise<BubblesPageData> => {
      const url = getSupabaseUrl();
      const key = getSupabasePublishableKey();
      if (!url || !key) {
        throw new Error(
          'Missing NEXT_PUBLIC_SUPABASE_URL or a Supabase key (NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY)',
        );
      }

      const supabase = createClient(url, key, {
        global: { headers: { Authorization: `Bearer ${token}` } },
      });

      const { data, error } = await supabase
        .from('bubbles')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: true });

      if (error) throw new Error(error.message);

      return { initialBubbles: (data ?? []) as BubbleRow[] };
    },
    ['workspace-bubbles-data', workspaceId, userId, 'v1'],
    { tags: [bubblesCacheTag(workspaceId)] },
  );

  return cached();
}
