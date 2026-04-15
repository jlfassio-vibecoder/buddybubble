/**
 * Phase 3: async AI workout for storefront soft-trial (service-role task insert).
 *
 * Uses the same **single** Vertex call as storefront preview (~14s timeout) instead of the
 * 4-step `generate-workout-chain` (four sequential LLMs, often multi-minute). Falls back to a
 * minimal draft card if generation fails so the Kanban never stays empty indefinitely.
 *
 * @see docs/tdd-lead-onboarding.md §6, §8 Phase 3
 */

import { after } from 'next/server';
import type { WorkoutExercise } from '@/lib/item-metadata';
import { createServiceRoleClient } from '@/lib/supabase-service-role';
import { runStorefrontPreviewGeneration } from '@/lib/workout-factory/storefront-preview-runner';
import type { Json, FitnessProfileRow } from '@/types/database';

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

async function resolveFirstBoardColumnSlug(
  db: ReturnType<typeof createServiceRoleClient>,
  workspaceId: string,
) {
  const { data, error } = await db
    .from('board_columns')
    .select('slug')
    .eq('workspace_id', workspaceId)
    .order('position', { ascending: true })
    .limit(1);

  if (error) {
    console.error('[storefront-trial-job] board_columns', error);
    return 'planned';
  }
  const slug = data?.[0]?.slug;
  return typeof slug === 'string' && slug.trim() ? slug.trim() : 'planned';
}

async function insertTrialWorkoutTask(
  db: ReturnType<typeof createServiceRoleClient>,
  args: {
    trialBubbleId: string;
    userId: string;
    workspaceId: string;
    title: string;
    description: string | null;
    exercises: WorkoutExercise[];
  },
): Promise<boolean> {
  const statusSlug = await resolveFirstBoardColumnSlug(db, args.workspaceId);
  const metadata: Json = {
    exercises: args.exercises,
    workout_type: 'strength',
  } as Json;

  const { error: insertErr } = await db.from('tasks').insert({
    bubble_id: args.trialBubbleId,
    title: args.title,
    description: args.description,
    status: statusSlug,
    position: 0,
    priority: 'medium',
    item_type: 'workout',
    metadata,
    assigned_to: args.userId,
    visibility: 'private',
    subtasks: [],
    comments: [],
    activity_log: [],
    attachments: [],
  });

  if (insertErr) {
    console.error('[storefront-trial-job] tasks insert', insertErr);
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
    return;
  }
  if ((ws as { category_type?: string }).category_type !== 'fitness') {
    return;
  }

  const { data: existingWorkout, error: existErr } = await db
    .from('tasks')
    .select('id')
    .eq('bubble_id', trialBubbleId)
    .eq('item_type', 'workout')
    .eq('assigned_to', userId)
    .is('archived_at', null)
    .limit(1)
    .maybeSingle();

  if (existErr) {
    console.error('[storefront-trial-job] idempotency check', existErr);
    return;
  }
  if (existingWorkout?.id) {
    return;
  }

  const { data: profileRow, error: profileError } = await db
    .from('fitness_profiles')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .maybeSingle();

  if (profileError) {
    console.error('[storefront-trial-job] fitness_profiles', profileError);
    return;
  }

  const profile = profileRow as FitnessProfileRow | null;
  const profileForPreview: unknown = profile ?? {};

  const preview = await runStorefrontPreviewGeneration(profileForPreview);
  if (preview.ok) {
    const p = preview.preview;
    const exercises: WorkoutExercise[] = p.main_exercises.map((e) => ({
      name: e.name,
      coach_notes: e.detail,
    }));
    const title = p.title.trim() || 'Your workout';
    const description =
      [p.summary.trim(), p.coach_tip?.trim() ? `Tip: ${p.coach_tip.trim()}` : '']
        .filter(Boolean)
        .join('\n\n') || null;

    const ok = await insertTrialWorkoutTask(db, {
      trialBubbleId,
      userId,
      workspaceId,
      title,
      description,
      exercises,
    });
    if (ok) return;
  } else {
    const errText = await preview.response.text().catch(() => '');
    console.error(
      '[storefront-trial-job] single-call preview failed',
      preview.response.status,
      errText,
    );
  }

  await insertTrialWorkoutTask(db, {
    trialBubbleId,
    userId,
    workspaceId,
    title: 'Your trial workout',
    description:
      'We added a starter workout you can edit. If AI was unavailable, replace these with your plan.',
    exercises: FALLBACK_EXERCISES,
  });
}

/** Schedule Vertex + task insert after the HTTP response (same invocation, extended `maxDuration`). */
export function scheduleStorefrontTrialWorkoutAfterResponse(
  payload: StorefrontTrialJobPayload,
): void {
  after(() => {
    void runStorefrontTrialWorkoutJob(payload).catch((e) => {
      console.error('[storefront-trial-job] async workout job failed', e);
    });
  });
}
