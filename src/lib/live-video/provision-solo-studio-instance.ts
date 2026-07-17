'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@utils/supabase/client';
import {
  insertTasksRowWithRetries,
  resolveInsertPosition,
} from '@/components/modals/task-modal/task-insert-row';
import { classScheduledAtToTaskSchedule } from '@/lib/fitness/class-instance-task-sync';
import { classDeckBuilderSessionId } from '@/lib/fitness/class-deck-builder-session-id';
import { formatUserFacingError } from '@/lib/format-error';
import type { AsyncSessionPayload } from '@/types/live-session-invite';
import type { Database, Json } from '@/types/database';

export const SOLO_STUDIO_OFFERING_NAME = 'Solo Studio Recording';

export type ProvisionSoloStudioInstanceArgs = {
  workspaceId: string;
  hostUserId: string;
  /**
   * Live workout session UUID for Agora / `joinSession` only.
   * Not written into `async_session.sessionId` (that uses `bb-class-deck:<instanceId>`).
   */
  sessionId: string;
  /** Workspace bubbles; must include a `Classes` channel for the private class task. */
  bubbles: ReadonlyArray<{ id: string; name: string }>;
  supabase?: SupabaseClient<Database>;
  /** Override `createdAt` / `scheduled_at` (tests). */
  nowIso?: string;
};

export type ProvisionSoloStudioInstanceResult =
  | { ok: true; instanceId: string; offeringId: string; taskId: string }
  | { ok: false; error: string };

/**
 * Pure metadata for a solo studio class instance: `async_session` only — never `live_session`
 * (avoids ClassCard Join Live / deep-link broadcast).
 * `async_session.sessionId` is always the class draft namespace for AsyncPlaybackShell.
 */
export function buildSoloStudioInstanceMetadata(opts: {
  classInstanceId: string;
  hostUserId: string;
  createdAt: string;
}): Json {
  const asyncSession: AsyncSessionPayload = {
    type: 'async_session',
    sessionId: classDeckBuilderSessionId(opts.classInstanceId),
    createdAt: opts.createdAt,
    hostUserId: opts.hostUserId.trim(),
  };
  return { async_session: asyncSession } as Json;
}

function rlsFriendlyMessage(message: string): string {
  const lower = message.toLowerCase();
  if (
    lower.includes('permission denied') ||
    lower.includes('row-level security') ||
    lower.includes('violates row-level security') ||
    lower.includes('new row violates')
  ) {
    return 'Only workspace owners and admins can create a Solo Studio class.';
  }
  return message;
}

/**
 * Provisions a private `class_instances` row (offering + class task) as the storage anchor for
 * Solo Recording Studio. Does not write chat invites or `metadata.live_session`.
 */
export async function provisionSoloStudioInstance(
  args: ProvisionSoloStudioInstanceArgs,
): Promise<ProvisionSoloStudioInstanceResult> {
  const workspaceId = args.workspaceId.trim();
  const hostUserId = args.hostUserId.trim();
  const sessionId = args.sessionId.trim();
  if (!workspaceId || !hostUserId || !sessionId) {
    return { ok: false, error: 'Missing workspace, host, or session for Solo Studio.' };
  }

  const classesBubble = args.bubbles.find((b) => b.name === 'Classes');
  if (!classesBubble?.id) {
    return {
      ok: false,
      error: 'Add a Classes channel before entering Solo Studio.',
    };
  }

  const supabase = args.supabase ?? createClient();
  const nowIso = args.nowIso ?? new Date().toISOString();

  const { data: offeringRow, error: oErr } = await supabase
    .from('class_offerings')
    .insert({
      workspace_id: workspaceId,
      name: SOLO_STUDIO_OFFERING_NAME,
      description: null,
      duration_min: 60,
      location: null,
      metadata: {},
    })
    .select('id')
    .maybeSingle();

  if (oErr || !offeringRow?.id) {
    return {
      ok: false,
      error: rlsFriendlyMessage(
        formatUserFacingError(oErr ?? new Error('Could not create Solo Studio offering')),
      ),
    };
  }

  const offeringId = offeringRow.id as string;
  const schedule = classScheduledAtToTaskSchedule(nowIso);
  const position = await resolveInsertPosition(supabase, classesBubble.id);

  const { data: taskRow, error: tErr } = await insertTasksRowWithRetries(
    supabase,
    {
      bubble_id: classesBubble.id,
      title: SOLO_STUDIO_OFFERING_NAME,
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
    },
    {
      status: 'scheduled',
      calendarTimezone: null,
      hasTodayBoardColumn: false,
    },
  );

  if (tErr || !taskRow?.id) {
    await supabase.from('class_offerings').delete().eq('id', offeringId);
    return {
      ok: false,
      error: rlsFriendlyMessage(
        formatUserFacingError(tErr ?? new Error('Could not create Solo Studio class task')),
      ),
    };
  }

  const taskId = taskRow.id as string;

  const { data: instRow, error: iErr } = await supabase
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
    await supabase.from('tasks').delete().eq('id', taskId);
    await supabase.from('class_offerings').delete().eq('id', offeringId);
    return {
      ok: false,
      error: rlsFriendlyMessage(
        formatUserFacingError(iErr ?? new Error('Could not create Solo Studio class instance')),
      ),
    };
  }

  const instanceId = instRow.id as string;
  const metadata = buildSoloStudioInstanceMetadata({
    classInstanceId: instanceId,
    hostUserId,
    createdAt: nowIso,
  });

  const { data: updated, error: metaErr } = await supabase
    .from('class_instances')
    .update({ metadata })
    .eq('id', instanceId)
    .select('id')
    .maybeSingle();

  if (metaErr || !updated?.id) {
    await supabase.from('class_instances').delete().eq('id', instanceId);
    await supabase.from('tasks').delete().eq('id', taskId);
    await supabase.from('class_offerings').delete().eq('id', offeringId);
    return {
      ok: false,
      error: rlsFriendlyMessage(
        formatUserFacingError(
          metaErr ?? new Error('Could not set Solo Studio async session metadata'),
        ),
      ),
    };
  }

  return {
    ok: true,
    instanceId,
    offeringId,
    taskId,
  };
}

/** Args for `live_session_create.p_access_mode` from the active dock session. */
export function resolveLiveSessionCreateAccessMode(
  accessMode: 'open' | 'solo_studio' | undefined,
): 'open' | 'solo_studio' {
  return accessMode === 'solo_studio' ? 'solo_studio' : 'open';
}
