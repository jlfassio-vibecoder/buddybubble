'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@utils/supabase/server';

export async function createWorkspace(formData: FormData) {
  const name = String(formData.get('name') ?? '').trim();
  const categoryType = String(formData.get('category_type') ?? 'business');
  if (!name) {
    return;
  }
  if (!['business', 'kids', 'class'].includes(categoryType)) {
    return;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return;
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
    return;
  }

  const { error: memError } = await supabase.from('workspace_members').insert({
    workspace_id: ws.id,
    user_id: user.id,
    role: 'admin',
  });

  if (memError) {
    return;
  }

  redirect(`/app/${ws.id}`);
}
