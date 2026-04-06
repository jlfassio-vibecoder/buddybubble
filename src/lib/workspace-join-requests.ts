import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

export type JoinRequestPreviewItem = {
  id: string;
  requesterLabel: string;
  createdAt: string;
};

function requesterLabelFromUsers(u: { full_name?: string | null; email?: string | null } | null) {
  if (!u) return 'Someone';
  const name = u.full_name?.trim();
  if (name) return name;
  if (u.email?.trim()) return u.email.trim();
  return 'Someone';
}

/** Count + recent rows for sidebar badge, chat bell, and realtime refresh (admins only; RLS applies). */
export async function fetchPendingJoinRequestCountAndPreview(
  supabase: SupabaseClient<Database>,
  workspaceId: string,
): Promise<{ count: number; preview: JoinRequestPreviewItem[] }> {
  const { count, error: countError } = await supabase
    .from('invitation_join_requests')
    .select('*', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .eq('status', 'pending');

  if (countError) {
    return { count: 0, preview: [] };
  }

  const { data, error } = await supabase
    .from('invitation_join_requests')
    .select('id, created_at, users ( full_name, email )')
    .eq('workspace_id', workspaceId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(25);

  if (error || !data) {
    return { count: count ?? 0, preview: [] };
  }

  const preview: JoinRequestPreviewItem[] = data.map((raw) => {
    const r = raw as {
      id: string;
      created_at: string;
      users:
        | { full_name: string | null; email: string | null }
        | { full_name: string | null; email: string | null }[]
        | null;
    };
    const u = Array.isArray(r.users) ? r.users[0] : r.users;
    return {
      id: r.id,
      createdAt: r.created_at,
      requesterLabel: requesterLabelFromUsers(u ?? null),
    };
  });

  return { count: count ?? 0, preview };
}
