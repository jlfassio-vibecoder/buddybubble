'use server';

import { createClient } from '@utils/supabase/server';

export type SetWorkspaceMemberEmailVisibilityResult = { ok: true } | { error: string };

export async function setWorkspaceMemberShowEmailAction(input: {
  workspaceId: string;
  show: boolean;
}): Promise<SetWorkspaceMemberEmailVisibilityResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  const { error } = await supabase.rpc('set_workspace_member_show_email', {
    p_workspace_id: input.workspaceId,
    p_show: input.show,
  });
  if (error) return { error: error.message };
  return { ok: true };
}
