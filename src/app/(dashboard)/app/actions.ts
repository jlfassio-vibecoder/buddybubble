'use server';

import { redirect } from 'next/navigation';
import { formatUserFacingError } from '@/lib/format-error';
import { WORKSPACE_SEED_BY_CATEGORY } from '@/lib/workspace-seed-templates';
import { createClient } from '@utils/supabase/server';

export type CreateWorkspaceState = { error?: string } | null;

const VALID_CATEGORIES = ['business', 'kids', 'class', 'community'] as const;
type ValidCategory = (typeof VALID_CATEGORIES)[number];

type CoreOk = { workspaceId: string };
type CoreErr = { error: string };

/**
 * Sequential inserts: workspace → member (admin) → category template Bubbles + board_columns.
 * If any step after workspace creation fails, deletes the workspace row so nothing is orphaned.
 */
async function createWorkspaceCore(name: string, categoryType: string): Promise<CoreOk | CoreErr> {
  const trimmed = name.trim();
  if (!trimmed) {
    return { error: 'Enter a BuddyBubble name.' };
  }
  if (!VALID_CATEGORIES.includes(categoryType as ValidCategory)) {
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
    return { error: formatUserFacingError(profileErr) };
  }

  const { data: ws, error: wsError } = await supabase
    .from('workspaces')
    .insert({
      name: trimmed,
      category_type: categoryType,
      created_by: user.id,
    })
    .select('id')
    .single();

  if (wsError || !ws) {
    return { error: wsError ? formatUserFacingError(wsError) : 'Could not create BuddyBubble.' };
  }

  const workspaceId = ws.id as string;

  const { error: memError } = await supabase.from('workspace_members').insert({
    workspace_id: workspaceId,
    user_id: user.id,
    role: 'owner',
  });

  if (memError) {
    await supabase.from('workspaces').delete().eq('id', workspaceId);
    return { error: formatUserFacingError(memError) };
  }

  const seed = WORKSPACE_SEED_BY_CATEGORY[categoryType as ValidCategory];

  const bubbleRows = seed.bubbles.map((b) => ({
    workspace_id: workspaceId,
    name: b.name,
    icon: 'Hash',
  }));

  const { error: bubblesError } = await supabase.from('bubbles').insert(bubbleRows);

  if (bubblesError) {
    await supabase.from('workspaces').delete().eq('id', workspaceId);
    return { error: formatUserFacingError(bubblesError) };
  }

  const columnRows = seed.columns.map((c) => ({
    workspace_id: workspaceId,
    name: c.name,
    slug: c.slug,
    position: c.position,
  }));

  const { error: columnsError } = await supabase.from('board_columns').insert(columnRows);

  if (columnsError) {
    await supabase.from('workspaces').delete().eq('id', workspaceId);
    return { error: formatUserFacingError(columnsError) };
  }

  return { workspaceId };
}

export async function createWorkspaceFromModal(
  name: string,
  categoryType: string,
): Promise<{ ok: true; workspaceId: string } | { ok: false; error: string }> {
  const result = await createWorkspaceCore(name, categoryType);
  if ('error' in result) {
    return { ok: false, error: result.error };
  }
  return { ok: true, workspaceId: result.workspaceId };
}

export async function createWorkspace(
  _prevState: CreateWorkspaceState,
  formData: FormData,
): Promise<CreateWorkspaceState> {
  const name = String(formData.get('name') ?? '');
  const categoryType = String(formData.get('category_type') ?? 'business');
  const result = await createWorkspaceCore(name, categoryType);
  if ('error' in result) {
    return { error: result.error };
  }
  redirect(`/app/${result.workspaceId}`);
}
