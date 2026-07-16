'use server';

import {
  isRecordingReadyToPublish,
  type VideoLibraryAccessScope,
} from '@/lib/video-library/publish';
import { parseClassRecordingFromInstanceMetadata } from '@/types/live-session-invite';
import { createClient } from '@utils/supabase/server';

export type ActionResult<T extends Record<string, unknown> = Record<never, never>> =
  | { error: string }
  | ({ ok: true } & T);

export type VideoLibraryPrivateBubble = {
  id: string;
  name: string;
  bubble_type: string | null;
};

async function requireWorkspaceAdmin(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .maybeSingle();
  const role = (data as { role?: string } | null)?.role;
  if (role !== 'owner' && role !== 'admin') {
    return { ok: false, error: 'Only socialspace admins and owners can publish videos.' };
  }
  return { ok: true };
}

async function resolveVideoLibraryHubBubbleId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
): Promise<{ ok: true; bubbleId: string } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from('bubbles')
    .select('id, name, metadata')
    .eq('workspace_id', workspaceId);

  if (error) {
    return { ok: false, error: error.message || 'Could not load Video Library bubble.' };
  }

  const rows = (data ?? []) as { id: string; name: string; metadata: unknown }[];
  const byKind = rows.find((b) => {
    const m = b.metadata;
    return (
      m &&
      typeof m === 'object' &&
      !Array.isArray(m) &&
      (m as Record<string, unknown>).kind === 'video_library'
    );
  });
  if (byKind) return { ok: true, bubbleId: byKind.id };

  const byName = rows.find((b) => b.name.trim() === 'Video Library');
  if (byName) return { ok: true, bubbleId: byName.id };

  return {
    ok: false,
    error: 'Video Library bubble not found. Refresh or contact support.',
  };
}

export async function getVideoLibraryPublishContextAction(input: { workspaceId: string }): Promise<
  ActionResult<{
    isPublic: boolean;
    publicSlug: string | null;
    hubBubbleId: string | null;
    privateBubbles: VideoLibraryPrivateBubble[];
  }>
> {
  const workspaceId = input.workspaceId?.trim();
  if (!workspaceId) return { error: 'Workspace is required.' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  const admin = await requireWorkspaceAdmin(supabase, workspaceId, user.id);
  if (!admin.ok) return { error: admin.error };

  const { data: workspace, error: wsErr } = await supabase
    .from('workspaces')
    .select('is_public, public_slug')
    .eq('id', workspaceId)
    .maybeSingle();

  if (wsErr || !workspace) {
    return { error: wsErr?.message || 'Workspace not found.' };
  }

  const ws = workspace as { is_public: boolean | null; public_slug: string | null };
  const hub = await resolveVideoLibraryHubBubbleId(supabase, workspaceId);

  const { data: bubbleRows, error: bubErr } = await supabase
    .from('bubbles')
    .select('id, name, bubble_type, is_private')
    .eq('workspace_id', workspaceId);

  if (bubErr) {
    return { error: bubErr.message || 'Could not load bubbles.' };
  }

  const privateBubbles = (
    (bubbleRows ?? []) as {
      id: string;
      name: string;
      bubble_type: string | null;
      is_private: boolean;
    }[]
  )
    .filter((b) => b.bubble_type !== 'trial' && (b.is_private === true || b.bubble_type === 'dm'))
    .map((b) => ({
      id: b.id,
      name: b.name,
      bubble_type: b.bubble_type,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    ok: true,
    isPublic: ws.is_public === true,
    publicSlug: typeof ws.public_slug === 'string' ? ws.public_slug.trim() || null : null,
    hubBubbleId: hub.ok ? hub.bubbleId : null,
    privateBubbles,
  };
}

export async function publishToVideoLibraryAction(input: {
  workspaceId: string;
  classInstanceId: string;
  accessScope: VideoLibraryAccessScope;
  bubbleId?: string;
  title?: string | null;
}): Promise<ActionResult<{ publicationId: string }>> {
  const workspaceId = input.workspaceId?.trim();
  const classInstanceId = input.classInstanceId?.trim();
  const accessScope = input.accessScope;

  if (!workspaceId) return { error: 'Workspace is required.' };
  if (!classInstanceId) return { error: 'Class instance is required.' };
  if (
    accessScope !== 'workspace' &&
    accessScope !== 'bubble_members' &&
    accessScope !== 'public_storefront'
  ) {
    return { error: 'Invalid access scope.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  const admin = await requireWorkspaceAdmin(supabase, workspaceId, user.id);
  if (!admin.ok) return { error: admin.error };

  const { data: instance, error: instErr } = await supabase
    .from('class_instances')
    .select('id, workspace_id, metadata')
    .eq('id', classInstanceId)
    .maybeSingle();

  if (instErr || !instance) {
    return { error: instErr?.message || 'Class instance not found.' };
  }

  const row = instance as { id: string; workspace_id: string; metadata: unknown };
  if (row.workspace_id !== workspaceId) {
    return { error: 'Class instance is not in this workspace.' };
  }

  const recording = parseClassRecordingFromInstanceMetadata(row.metadata);
  if (!isRecordingReadyToPublish(recording)) {
    return { error: 'Recording must be ready before publishing.' };
  }

  let bubbleId: string;
  if (accessScope === 'bubble_members') {
    const requested = input.bubbleId?.trim();
    if (!requested) {
      return { error: 'Select a private or DM bubble for specific people.' };
    }
    const { data: dest, error: destErr } = await supabase
      .from('bubbles')
      .select('id, workspace_id, is_private, bubble_type')
      .eq('id', requested)
      .maybeSingle();
    if (destErr || !dest) {
      return { error: destErr?.message || 'Destination bubble not found.' };
    }
    const b = dest as {
      id: string;
      workspace_id: string;
      is_private: boolean;
      bubble_type: string | null;
    };
    if (b.workspace_id !== workspaceId) {
      return { error: 'Destination bubble is not in this workspace.' };
    }
    if (!(b.is_private === true || b.bubble_type === 'dm')) {
      return { error: 'Specific people publishes must target a private or DM bubble.' };
    }
    bubbleId = b.id;
  } else {
    const hub = await resolveVideoLibraryHubBubbleId(supabase, workspaceId);
    if (!hub.ok) return { error: hub.error };
    bubbleId = hub.bubbleId;
  }

  if (accessScope === 'public_storefront') {
    const { data: workspace, error: wsErr } = await supabase
      .from('workspaces')
      .select('is_public, public_slug')
      .eq('id', workspaceId)
      .maybeSingle();
    if (wsErr || !workspace) {
      return { error: wsErr?.message || 'Workspace not found.' };
    }
    const ws = workspace as { is_public: boolean | null; public_slug: string | null };
    const slug = typeof ws.public_slug === 'string' ? ws.public_slug.trim() : '';
    if (ws.is_public !== true || !slug) {
      return {
        error: 'Public publish requires a published Astro page (public workspace with a slug).',
      };
    }
  }

  const titleRaw = typeof input.title === 'string' ? input.title.trim() : '';
  const title = titleRaw.length > 0 ? titleRaw : null;
  const publishedAt = new Date().toISOString();

  const { data: existing } = await supabase
    .from('video_library_publications')
    .select('id')
    .eq('class_instance_id', classInstanceId)
    .eq('bubble_id', bubbleId)
    .eq('access_scope', accessScope)
    .maybeSingle();

  const existingId = (existing as { id?: string } | null)?.id;

  if (existingId) {
    const { data: updated, error: updErr } = await supabase
      .from('video_library_publications')
      .update({
        title,
        published_by: user.id,
        published_at: publishedAt,
        unpublished_at: null,
        workspace_id: workspaceId,
      })
      .eq('id', existingId)
      .select('id')
      .maybeSingle();

    if (updErr || !updated) {
      return { error: updErr?.message || 'Could not update publication.' };
    }
    return { ok: true, publicationId: (updated as { id: string }).id };
  }

  const { data: inserted, error: insErr } = await supabase
    .from('video_library_publications')
    .insert({
      workspace_id: workspaceId,
      class_instance_id: classInstanceId,
      bubble_id: bubbleId,
      access_scope: accessScope,
      title,
      published_by: user.id,
      published_at: publishedAt,
      unpublished_at: null,
      metadata: {},
    })
    .select('id')
    .maybeSingle();

  if (insErr || !inserted) {
    return { error: insErr?.message || 'Could not create publication.' };
  }

  return { ok: true, publicationId: (inserted as { id: string }).id };
}

export async function unpublishFromVideoLibraryAction(input: {
  workspaceId: string;
  publicationId: string;
}): Promise<ActionResult> {
  const workspaceId = input.workspaceId?.trim();
  const publicationId = input.publicationId?.trim();
  if (!workspaceId) return { error: 'Workspace is required.' };
  if (!publicationId) return { error: 'Publication is required.' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  const admin = await requireWorkspaceAdmin(supabase, workspaceId, user.id);
  if (!admin.ok) return { error: admin.error };

  const { data, error } = await supabase
    .from('video_library_publications')
    .update({ unpublished_at: new Date().toISOString() })
    .eq('id', publicationId)
    .eq('workspace_id', workspaceId)
    .select('id')
    .maybeSingle();

  if (error) {
    return { error: error.message || 'Could not unpublish.' };
  }
  if (!data) {
    return { error: 'Publication not found.' };
  }

  return { ok: true };
}
