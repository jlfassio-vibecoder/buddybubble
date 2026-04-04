'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@utils/supabase/server';

export type CreateWorkspaceState = { error?: string } | null;

export async function createWorkspace(
  _prevState: CreateWorkspaceState,
  formData: FormData,
): Promise<CreateWorkspaceState> {
  const name = String(formData.get('name') ?? '').trim();
  const categoryType = String(formData.get('category_type') ?? 'business');
  if (!name) {
    return { error: 'Enter a workspace name.' };
  }
  if (!['business', 'kids', 'class'].includes(categoryType)) {
    return { error: 'Invalid category.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: 'You must be signed in.' };
  }

  const { error: profileErr } = await supabase.rpc('ensure_profile_for_uid', {
    _uid: user.id,
  });
  if (profileErr) {
    return { error: profileErr.message };
  }

  const { data: ws, error: wsError } = await supabase
    .from('workspaces')
    .insert({
      name,
      category_type: categoryType,
      created_by: user.id,
    })
    .select('id')
    .single();

  if (wsError || !ws) {
    return { error: wsError?.message ?? 'Could not create workspace' };
  }

  const { error: memError } = await supabase.from('workspace_members').insert({
    workspace_id: ws.id,
    user_id: user.id,
    role: 'admin',
  });

  if (memError) {
    return { error: memError.message };
  }

  redirect(`/app/${ws.id}`);
}
