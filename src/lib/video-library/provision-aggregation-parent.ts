import type { SupabaseClient } from '@supabase/supabase-js';
import { classScheduledAtToTaskSchedule } from '@/lib/fitness/class-instance-task-sync';
import { formatUserFacingError } from '@/lib/format-error';
import type { Database, Json } from '@/types/database';

export const AGGREGATION_OFFERING_NAME_FALLBACK = 'Aggregated Workout';

export type VideoAggregationMetadata = {
  type: 'video_aggregation';
  version: 1;
};

export function buildAggregationInstanceMetadata(): Json {
  const video_aggregation: VideoAggregationMetadata = {
    type: 'video_aggregation',
    version: 1,
  };
  return { video_aggregation } as Json;
}

export function isVideoAggregationMetadata(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return false;
  const raw = (metadata as Record<string, unknown>).video_aggregation;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const o = raw as Record<string, unknown>;
  return o.type === 'video_aggregation' && o.version === 1;
}

export type ProvisionAggregationParentArgs = {
  supabase: SupabaseClient<Database>;
  workspaceId: string;
  hostUserId: string;
  title: string;
  /** Offering duration in minutes (defaults to 60). */
  durationMin?: number;
  nowIso?: string;
};

export type ProvisionAggregationParentResult =
  | { ok: true; instanceId: string; offeringId: string; taskId: string }
  | { ok: false; error: string };

function rlsFriendlyMessage(message: string): string {
  const lower = message.toLowerCase();
  if (
    lower.includes('permission denied') ||
    lower.includes('row-level security') ||
    lower.includes('violates row-level security') ||
    lower.includes('new row violates')
  ) {
    return 'Only workspace owners and admins can create aggregated workouts.';
  }
  return message;
}

async function resolveNextTaskPosition(
  supabase: SupabaseClient<Database>,
  bubbleId: string,
): Promise<number> {
  const { data } = await supabase
    .from('tasks')
    .select('position')
    .eq('bubble_id', bubbleId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();
  const pos =
    typeof data?.position === 'number' && Number.isFinite(data.position) ? data.position : 0;
  return pos + 1;
}

/**
 * Provisions a private parent `class_instances` row (offering + class task) as the aggregation
 * identity. Metadata is only `{ video_aggregation }` — no recording / async_session in v1.
 */
export async function provisionAggregationParent(
  args: ProvisionAggregationParentArgs,
): Promise<ProvisionAggregationParentResult> {
  const workspaceId = args.workspaceId.trim();
  const hostUserId = args.hostUserId.trim();
  const title = args.title.trim() || AGGREGATION_OFFERING_NAME_FALLBACK;
  if (!workspaceId || !hostUserId) {
    return { ok: false, error: 'Missing workspace or host for aggregation.' };
  }

  const { data: bubbles, error: bErr } = await args.supabase
    .from('bubbles')
    .select('id, name')
    .eq('workspace_id', workspaceId);

  if (bErr) {
    return { ok: false, error: rlsFriendlyMessage(formatUserFacingError(bErr)) };
  }

  const classesBubble = ((bubbles ?? []) as { id: string; name: string }[]).find(
    (b) => b.name.trim() === 'Classes',
  );
  if (!classesBubble?.id) {
    return {
      ok: false,
      error: 'Add a Classes channel before creating an aggregated workout.',
    };
  }

  const nowIso = args.nowIso ?? new Date().toISOString();
  const durationMin =
    typeof args.durationMin === 'number' &&
    Number.isFinite(args.durationMin) &&
    args.durationMin > 0
      ? Math.max(1, Math.round(args.durationMin))
      : 60;

  const { data: offeringRow, error: oErr } = await args.supabase
    .from('class_offerings')
    .insert({
      workspace_id: workspaceId,
      name: title,
      description: null,
      duration_min: durationMin,
      location: null,
      metadata: {},
    })
    .select('id')
    .maybeSingle();

  if (oErr || !offeringRow?.id) {
    return {
      ok: false,
      error: rlsFriendlyMessage(
        formatUserFacingError(oErr ?? new Error('Could not create aggregation offering')),
      ),
    };
  }

  const offeringId = offeringRow.id as string;
  const schedule = classScheduledAtToTaskSchedule(nowIso);
  const position = await resolveNextTaskPosition(args.supabase, classesBubble.id);

  const { data: taskRow, error: tErr } = await args.supabase
    .from('tasks')
    .insert({
      bubble_id: classesBubble.id,
      title,
      description: null,
      status: 'scheduled',
      priority: 'medium',
      position,
      scheduled_on: schedule.scheduled_on,
      scheduled_time: schedule.scheduled_time,
      item_type: 'class',
      metadata: {},
      visibility: 'private',
      created_by: hostUserId,
    })
    .select('id')
    .maybeSingle();

  if (tErr || !taskRow?.id) {
    await args.supabase.from('class_offerings').delete().eq('id', offeringId);
    return {
      ok: false,
      error: rlsFriendlyMessage(
        formatUserFacingError(tErr ?? new Error('Could not create aggregation class task')),
      ),
    };
  }

  const taskId = taskRow.id as string;

  const { data: instRow, error: iErr } = await args.supabase
    .from('class_instances')
    .insert({
      workspace_id: workspaceId,
      offering_id: offeringId,
      task_id: taskId,
      scheduled_at: nowIso,
      capacity: null,
      instructor_id: hostUserId,
      instructor_notes: null,
      visibility: 'private',
      metadata: {},
    })
    .select('id')
    .maybeSingle();

  if (iErr || !instRow?.id) {
    await args.supabase.from('tasks').delete().eq('id', taskId);
    await args.supabase.from('class_offerings').delete().eq('id', offeringId);
    return {
      ok: false,
      error: rlsFriendlyMessage(
        formatUserFacingError(iErr ?? new Error('Could not create aggregation class instance')),
      ),
    };
  }

  const instanceId = instRow.id as string;
  const metadata = buildAggregationInstanceMetadata();

  const { data: updated, error: metaErr } = await args.supabase
    .from('class_instances')
    .update({ metadata })
    .eq('id', instanceId)
    .select('id')
    .maybeSingle();

  if (metaErr || !updated?.id) {
    await args.supabase.from('class_instances').delete().eq('id', instanceId);
    await args.supabase.from('tasks').delete().eq('id', taskId);
    await args.supabase.from('class_offerings').delete().eq('id', offeringId);
    return {
      ok: false,
      error: rlsFriendlyMessage(
        formatUserFacingError(
          metaErr ?? new Error('Could not set aggregation metadata on class instance'),
        ),
      ),
    };
  }

  return { ok: true, instanceId, offeringId, taskId };
}
