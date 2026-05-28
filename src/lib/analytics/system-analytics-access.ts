import { createClient } from '@utils/supabase/server';
import { canManageWorkspace, parseMemberRole } from '@/lib/permissions';
import { getWorkspaceTier, type WorkspaceTierInfo } from '@/lib/subscription-permissions-server';
import type { MemberRole } from '@/types/database';

export type SystemAnalyticsAccess = {
  userId: string;
  role: MemberRole;
  tier: WorkspaceTierInfo;
};

export async function resolveSystemAnalyticsAccess(
  workspaceId: string,
): Promise<SystemAnalyticsAccess | 'unauthenticated' | 'forbidden'> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return 'unauthenticated';

  const { data: mem } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!mem) return 'forbidden';

  const role = parseMemberRole((mem as { role?: string }).role);
  if (!canManageWorkspace(role)) return 'forbidden';

  const tier = await getWorkspaceTier(workspaceId, supabase);
  return { userId: user.id, role, tier };
}
