'use server';

import {
  isVideoAggregationMetadata,
  provisionAggregationParent,
} from '@/lib/video-library/provision-aggregation-parent';
import { parseClassRecordingFromInstanceMetadata } from '@/types/live-session-invite';
import { createClient } from '@utils/supabase/server';

export type ActionResult<T extends Record<string, unknown> = Record<never, never>> =
  | { error: string }
  | ({ ok: true } & T);

export type AvailableVodItem = {
  id: string;
  title: string;
};

export type AggregationLinkItemInput = {
  kind: 'vod' | 'break';
  childInstanceId?: string;
  breakDurationSec?: number;
  titleOverride?: string;
};

async function requireWorkspaceAdmin(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    return { ok: false, error: 'Could not verify your role. Please try again.' };
  }
  const role = (data as { role?: string } | null)?.role;
  if (role !== 'owner' && role !== 'admin') {
    return {
      ok: false,
      error: 'Only socialspace admins and owners can build aggregated workouts.',
    };
  }
  return { ok: true };
}

async function requireWorkspaceMember(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    return { ok: false, error: 'Could not verify your membership. Please try again.' };
  }
  if (!data) {
    return { ok: false, error: 'You must be a workspace member to play this workout.' };
  }
  return { ok: true };
}

export type AggregatorLinkDto = {
  id: string;
  linkKind: 'vod' | 'break';
  sortOrder: number;
  breakDurationSec: number | null;
  titleOverride: string | null;
  childInstanceId: string | null;
  childTitle: string | null;
  childRecording: ReturnType<typeof parseClassRecordingFromInstanceMetadata>;
};

function offeringNameFromEmbed(nested: unknown): string | null {
  if (!nested || typeof nested !== 'object') return null;
  if (Array.isArray(nested)) {
    const first = nested[0];
    if (!first || typeof first !== 'object') return null;
    const name = (first as { name?: unknown }).name;
    return typeof name === 'string' && name.trim() ? name.trim() : null;
  }
  const name = (nested as { name?: unknown }).name;
  return typeof name === 'string' && name.trim() ? name.trim() : null;
}

export async function getAvailableVodsAction(input: {
  workspaceId: string;
}): Promise<ActionResult<{ vods: AvailableVodItem[] }>> {
  const workspaceId = input.workspaceId?.trim();
  if (!workspaceId) return { error: 'Workspace is required.' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  const admin = await requireWorkspaceAdmin(supabase, workspaceId, user.id);
  if (!admin.ok) return { error: admin.error };

  const { data, error } = await supabase
    .from('class_instances')
    .select('id, metadata, scheduled_at, class_offerings(name)')
    .eq('workspace_id', workspaceId)
    .order('scheduled_at', { ascending: false });

  if (error) {
    return { error: error.message || 'Could not load ready videos.' };
  }

  const vods: AvailableVodItem[] = [];
  for (const raw of data ?? []) {
    if (!raw || typeof raw !== 'object') continue;
    const row = raw as {
      id?: string;
      metadata?: unknown;
      class_offerings?: unknown;
    };
    const id = typeof row.id === 'string' ? row.id : '';
    if (!id) continue;
    if (isVideoAggregationMetadata(row.metadata)) continue;
    const recording = parseClassRecordingFromInstanceMetadata(row.metadata);
    if (recording?.status !== 'ready') continue;
    const offeringName = offeringNameFromEmbed(row.class_offerings);
    vods.push({
      id,
      title: offeringName || 'Untitled recording',
    });
  }

  return { ok: true, vods };
}

export async function saveAggregationAction(input: {
  workspaceId: string;
  title: string;
  items: AggregationLinkItemInput[];
}): Promise<ActionResult<{ parentInstanceId: string }>> {
  const workspaceId = input.workspaceId?.trim();
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const items = Array.isArray(input.items) ? input.items : [];

  if (!workspaceId) return { error: 'Workspace is required.' };
  if (!title) return { error: 'Title is required.' };
  if (items.length === 0) return { error: 'Add at least one video to the timeline.' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  const admin = await requireWorkspaceAdmin(supabase, workspaceId, user.id);
  if (!admin.ok) return { error: admin.error };

  let vodCount = 0;
  const childIds: string[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item || (item.kind !== 'vod' && item.kind !== 'break')) {
      return { error: `Invalid segment at position ${i + 1}.` };
    }
    if (item.kind === 'vod') {
      const childId = typeof item.childInstanceId === 'string' ? item.childInstanceId.trim() : '';
      if (!childId) return { error: `Video segment ${i + 1} is missing a class instance.` };
      childIds.push(childId);
      vodCount += 1;
    } else {
      const sec = item.breakDurationSec;
      if (typeof sec !== 'number' || !Number.isFinite(sec) || sec <= 0) {
        return { error: `Break segment ${i + 1} needs a duration greater than 0 seconds.` };
      }
    }
  }

  if (vodCount < 1) {
    return { error: 'Add at least one video to the timeline.' };
  }

  const uniqueChildIds = [...new Set(childIds)];
  const { data: childRows, error: childErr } = await supabase
    .from('class_instances')
    .select('id, workspace_id, metadata')
    .eq('workspace_id', workspaceId)
    .in('id', uniqueChildIds);

  if (childErr) {
    return { error: childErr.message || 'Could not verify selected videos.' };
  }

  const byId = new Map(
    ((childRows ?? []) as { id: string; workspace_id: string; metadata: unknown }[]).map((r) => [
      r.id,
      r,
    ]),
  );

  for (const childId of uniqueChildIds) {
    const row = byId.get(childId);
    if (!row) {
      return { error: 'One or more selected videos were not found in this workspace.' };
    }
    if (isVideoAggregationMetadata(row.metadata)) {
      return { error: 'Aggregated workouts cannot be nested inside another aggregation.' };
    }
    const recording = parseClassRecordingFromInstanceMetadata(row.metadata);
    if (recording?.status !== 'ready') {
      return { error: 'Every selected video must have a ready recording.' };
    }
  }

  const breakSeconds = items
    .filter((i) => i.kind === 'break')
    .reduce((sum, i) => sum + (typeof i.breakDurationSec === 'number' ? i.breakDurationSec : 0), 0);
  // Copilot suggestion ignored: child VOD lengths are not stored, so an accurate total duration for this synthetic private parent is not computable here.
  const durationMin = Math.max(1, Math.round(breakSeconds / 60) || 60);

  const provisioned = await provisionAggregationParent({
    supabase,
    workspaceId,
    hostUserId: user.id,
    title,
    durationMin,
  });

  if (!provisioned.ok) {
    return { error: provisioned.error };
  }

  const parentInstanceId = provisioned.instanceId;
  const linkRows = items.map((item, sortOrder) => {
    if (item.kind === 'vod') {
      return {
        workspace_id: workspaceId,
        parent_instance_id: parentInstanceId,
        child_instance_id: item.childInstanceId!.trim(),
        link_kind: 'vod' as const,
        sort_order: sortOrder,
        break_duration_sec: null,
        title_override:
          typeof item.titleOverride === 'string' && item.titleOverride.trim()
            ? item.titleOverride.trim()
            : null,
        metadata: {},
      };
    }
    return {
      workspace_id: workspaceId,
      parent_instance_id: parentInstanceId,
      child_instance_id: null,
      link_kind: 'break' as const,
      sort_order: sortOrder,
      break_duration_sec: Math.round(item.breakDurationSec!),
      title_override:
        typeof item.titleOverride === 'string' && item.titleOverride.trim()
          ? item.titleOverride.trim()
          : null,
      metadata: {},
    };
  });

  const { error: linkErr } = await supabase.from('class_instance_links').insert(linkRows);

  if (linkErr) {
    await supabase.from('class_instances').delete().eq('id', parentInstanceId);
    await supabase.from('tasks').delete().eq('id', provisioned.taskId);
    await supabase.from('class_offerings').delete().eq('id', provisioned.offeringId);
    return { error: linkErr.message || 'Could not save aggregation segments.' };
  }

  return { ok: true, parentInstanceId };
}

export async function getAggregatorLinksAction(input: {
  workspaceId: string;
  parentInstanceId: string;
}): Promise<ActionResult<{ parentTitle: string; links: AggregatorLinkDto[] }>> {
  const workspaceId = input.workspaceId?.trim();
  const parentInstanceId = input.parentInstanceId?.trim();
  if (!workspaceId) return { error: 'Workspace is required.' };
  if (!parentInstanceId) return { error: 'Aggregated workout is required.' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  const member = await requireWorkspaceMember(supabase, workspaceId, user.id);
  if (!member.ok) return { error: member.error };

  const { data: parent, error: parentErr } = await supabase
    .from('class_instances')
    .select('id, workspace_id, metadata, class_offerings(name)')
    .eq('id', parentInstanceId)
    .maybeSingle();

  if (parentErr || !parent) {
    return { error: parentErr?.message || 'Aggregated workout not found.' };
  }

  const parentRow = parent as {
    id: string;
    workspace_id: string;
    metadata: unknown;
    class_offerings?: unknown;
  };
  if (parentRow.workspace_id !== workspaceId) {
    return { error: 'Aggregated workout is not in this workspace.' };
  }
  if (!isVideoAggregationMetadata(parentRow.metadata)) {
    return { error: 'This class is not an aggregated workout.' };
  }

  const parentTitle = offeringNameFromEmbed(parentRow.class_offerings) || 'Aggregated Workout';

  const { data: linkRows, error: linkErr } = await supabase
    .from('class_instance_links')
    .select(
      'id, link_kind, sort_order, break_duration_sec, title_override, child_instance_id, class_instances!child_instance_id(id, metadata, class_offerings(name))',
    )
    .eq('parent_instance_id', parentInstanceId)
    .order('sort_order', { ascending: true });

  if (linkErr) {
    return { error: linkErr.message || 'Could not load aggregation segments.' };
  }

  const links: AggregatorLinkDto[] = [];
  for (const raw of linkRows ?? []) {
    if (!raw || typeof raw !== 'object') continue;
    const row = raw as {
      id?: string;
      link_kind?: string;
      sort_order?: number;
      break_duration_sec?: number | null;
      title_override?: string | null;
      child_instance_id?: string | null;
      class_instances?: unknown;
    };
    const id = typeof row.id === 'string' ? row.id : '';
    if (!id) continue;
    const linkKind = row.link_kind === 'break' ? 'break' : row.link_kind === 'vod' ? 'vod' : null;
    if (!linkKind) continue;

    const nestedChild = row.class_instances;
    const childObj = Array.isArray(nestedChild) ? nestedChild[0] : nestedChild;
    const child =
      childObj && typeof childObj === 'object'
        ? (childObj as { id?: string; metadata?: unknown; class_offerings?: unknown })
        : null;

    const childInstanceId =
      typeof row.child_instance_id === 'string'
        ? row.child_instance_id
        : typeof child?.id === 'string'
          ? child.id
          : null;
    const childTitle =
      (typeof row.title_override === 'string' && row.title_override.trim()
        ? row.title_override.trim()
        : null) ||
      offeringNameFromEmbed(child?.class_offerings) ||
      (linkKind === 'break' ? 'Break' : 'Untitled recording');

    links.push({
      id,
      linkKind,
      sortOrder: typeof row.sort_order === 'number' ? row.sort_order : links.length,
      breakDurationSec:
        typeof row.break_duration_sec === 'number' && Number.isFinite(row.break_duration_sec)
          ? row.break_duration_sec
          : null,
      titleOverride:
        typeof row.title_override === 'string' && row.title_override.trim()
          ? row.title_override.trim()
          : null,
      childInstanceId,
      childTitle,
      childRecording: parseClassRecordingFromInstanceMetadata(child?.metadata ?? null),
    });
  }

  return { ok: true, parentTitle, links };
}
