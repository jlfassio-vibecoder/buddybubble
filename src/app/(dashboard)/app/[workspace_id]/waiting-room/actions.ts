'use server';

import { createClient } from '@utils/supabase/server';

export type BulkApproveResult = {
  approved: number;
  errors: string[];
};

export async function bulkApproveJoinRequests(
  workspaceId: string,
  joinRequestIds: string[],
): Promise<BulkApproveResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { approved: 0, errors: ['Not signed in.'] };
  }

  const { data: mem } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .maybeSingle();

  const role = (mem as { role?: string } | null)?.role;
  if (role !== 'admin' && role !== 'owner') {
    return {
      approved: 0,
      errors: ['Only socialspace admins and owners can approve join requests.'],
    };
  }

  const unique = [
    ...new Set(joinRequestIds.filter((id) => typeof id === 'string' && id.length > 0)),
  ];
  if (unique.length === 0) {
    return { approved: 0, errors: ['No requests selected.'] };
  }

  // Bounded parallelism: faster than strict sequential RPCs without opening dozens of concurrent requests.
  const concurrency = 8;
  let approved = 0;
  const errors: string[] = [];
  for (let i = 0; i < unique.length; i += concurrency) {
    const slice = unique.slice(i, i + concurrency);
    const batch = await Promise.all(
      slice.map((id) => supabase.rpc('approve_invitation_join_request', { p_join_request_id: id })),
    );
    for (const { error } of batch) {
      if (error) {
        errors.push(error.message);
      } else {
        approved += 1;
      }
    }
  }

  return { approved, errors };
}
