/**
 * Phase 3: async AI workout for storefront soft-trial (service-role task insert).
 *
 * Uses the same **single** Vertex call as storefront preview (shared timeout budget) instead of the
 * 4-step `generate-workout-chain` (four sequential LLMs, often multi-minute). Falls back to a
 * minimal draft card only if **AI generation** fails—not if generation succeeds but the DB insert
 * fails (that path logs and exits without a second insert).
 *
 * @see docs/tdd-lead-onboarding.md §6, §8 Phase 3
 */

import { after } from 'next/server';
import type { WorkoutExercise } from '@/lib/item-metadata';
import { createServiceRoleClient } from '@/lib/supabase-service-role';
import { runStorefrontPreviewGeneration } from '@/lib/workout-factory/storefront-preview-runner';
import type { FitnessProfileRow } from '@/types/database';
import {
  insertTrialWorkoutTaskFromPreview,
  setBubbleWorkoutGenerationStatus,
} from '@/lib/storefront-trial-workout-task';
import type { Json } from '@/types/database';
import { replaceTaskAssigneesWithUserIds } from '@/lib/task-assignees-db';

export type StorefrontTrialJobPayload = {
  workspaceId: string;
  userId: string;
  leadId: string;
  trialBubbleId: string;
};

const FALLBACK_EXERCISES: WorkoutExercise[] = [
  { name: 'Warm-up', coach_notes: '5–10 minutes of easy movement' },
  {
    name: 'Trial workout',
    coach_notes:
      'Personalized AI details could not be loaded. Tap the card to edit and add your exercises.',
  },
  { name: 'Cool-down', coach_notes: 'Light stretching' },
];

async function insertFallbackTrialWorkoutTask(
  db: ReturnType<typeof createServiceRoleClient>,
  args: {
    trialBubbleId: string;
    userId: string;
    workspaceId: string;
  },
): Promise<boolean> {
  const { data, error } = await db
    .from('board_columns')
    .select('slug')
    .eq('workspace_id', args.workspaceId)
    .order('position', { ascending: true })
    .limit(1);

  let statusSlug = 'planned';
  if (error) {
    console.error('[storefront-trial-job] board_columns', error);
  } else if (typeof data?.[0]?.slug === 'string' && data[0].slug.trim()) {
    statusSlug = data[0].slug.trim();
  }
  const metadata: Json = {
    exercises: FALLBACK_EXERCISES,
    workout_type: 'strength',
  } as Json;

  const { data: inserted, error: insertErr } = await db
    .from('tasks')
    .insert({
      bubble_id: args.trialBubbleId,
      title: 'Your trial workout',
      description:
        'We added a starter workout you can edit. If AI was unavailable, replace these with your plan.',
      status: statusSlug,
      position: 0,
      priority: 'medium',
      item_type: 'workout',
      metadata,
      visibility: 'private',
      attachments: [],
    })
    .select('id')
    .maybeSingle();

  if (insertErr || !inserted?.id) {
    console.error('[storefront-trial-job] fallback tasks insert', insertErr);
    return false;
  }
  const { error: assigneeErr } = await replaceTaskAssigneesWithUserIds(db, inserted.id, [
    args.userId,
  ]);
  if (assigneeErr) {
    console.error('[storefront-trial-job] task_assignees insert', assigneeErr);
    return false;
  }
  return true;
}

/**
 * Runs after storefront intake response: generates one workout and inserts `tasks` (service role).
 */
export async function runStorefrontTrialWorkoutJob(
  payload: StorefrontTrialJobPayload,
): Promise<void> {
  const { workspaceId, userId, trialBubbleId } = payload;
  const db = createServiceRoleClient();

  const { data: ws, error: wsErr } = await db
    .from('workspaces')
    .select('category_type')
    .eq('id', workspaceId)
    .maybeSingle();

  if (wsErr || !ws) {
    console.error('[storefront-trial-job] workspace', wsErr);
    await setBubbleWorkoutGenerationStatus(db, trialBubbleId, 'failed', {
      error_message: 'Workspace not found for workout generation',
    });
    return;
  }
  if ((ws as { category_type?: string }).category_type !== 'fitness') {
    await setBubbleWorkoutGenerationStatus(db, trialBubbleId, 'completed');
    return;
  }

  const { data: existingWorkout, error: existErr } = await db
    .from('tasks')
    .select('id, task_assignees!inner(user_id)')
    .eq('bubble_id', trialBubbleId)
    .eq('item_type', 'workout')
    .eq('task_assignees.user_id', userId)
    .is('archived_at', null)
    .limit(1)
    .maybeSingle();

  if (existErr) {
    console.error('[storefront-trial-job] idempotency check', existErr);
    await setBubbleWorkoutGenerationStatus(db, trialBubbleId, 'failed', {
      error_message: existErr.message || 'Could not verify existing workout',
    });
    return;
  }
  if (existingWorkout?.id) {
    await setBubbleWorkoutGenerationStatus(db, trialBubbleId, 'completed');
    return;
  }

  await setBubbleWorkoutGenerationStatus(db, trialBubbleId, 'running');

  try {
    const { data: profileRow, error: profileError } = await db
      .from('fitness_profiles')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId)
      .maybeSingle();

    if (profileError) {
      console.error(
        '[storefront-trial-job] fitness_profiles read failed; continuing with empty profile',
        profileError,
      );
    }

    const profile = profileRow as FitnessProfileRow | null;
    const profileForPreview: unknown = profile ?? {};

    const preview = await runStorefrontPreviewGeneration(profileForPreview);
    if (preview.ok) {
      const ok = await insertTrialWorkoutTaskFromPreview(db, {
        trialBubbleId,
        userId,
        workspaceId,
        preview: preview.preview,
      });
      if (ok) {
        await setBubbleWorkoutGenerationStatus(db, trialBubbleId, 'completed');
        return;
      }
      console.error(
        '[storefront-trial-job] tasks insert failed after successful AI preview; not inserting fallback',
      );
      await setBubbleWorkoutGenerationStatus(db, trialBubbleId, 'failed', {
        error_message: 'Could not save workout card',
      });
      return;
    }

    const errText = await preview.response.text().catch(() => '');
    console.error(
      '[storefront-trial-job] single-call preview failed',
      preview.response.status,
      errText,
    );

    const fallbackOk = await insertFallbackTrialWorkoutTask(db, {
      trialBubbleId,
      userId,
      workspaceId,
    });
    if (fallbackOk) {
      await setBubbleWorkoutGenerationStatus(db, trialBubbleId, 'completed');
      return;
    }
    console.error(
      '[storefront-trial-job] fallback trial workout insert failed after AI generation failure',
    );
    await setBubbleWorkoutGenerationStatus(db, trialBubbleId, 'failed', {
      error_message: 'AI preview failed and fallback card could not be saved',
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unexpected error';
    console.error('[storefront-trial-job] unhandled', e);
    await setBubbleWorkoutGenerationStatus(db, trialBubbleId, 'failed', { error_message: msg });
  }
}

/**
 * Schedule Vertex + task insert after the HTTP response in production.
 * In local dev, run inline so the card creation path is deterministic while debugging.
 */
export async function scheduleStorefrontTrialWorkoutAfterResponse(
  payload: StorefrontTrialJobPayload,
): Promise<void> {
  if (process.env.NODE_ENV === 'development') {
    await runStorefrontTrialWorkoutJob(payload);
    return;
  }
  after(() => {
    void runStorefrontTrialWorkoutJob(payload).catch((e) => {
      console.error('[storefront-trial-job] async workout job failed', e);
    });
  });
}
