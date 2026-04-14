/**
 * Phase 3: async AI workout for storefront soft-trial (Vertex chain + service-role task insert).
 *
 * @see docs/tdd-lead-onboarding.md §6, §8 Phase 3
 */

import { after } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase-service-role';
import { buildBuddyWorkoutPersona } from '@/lib/workout-factory/buddy-persona';
import { runGenerateWorkoutChain } from '@/lib/workout-factory/generate-workout-chain-runner';
import { workoutInSetToTaskExercises } from '@/lib/workout-factory/map-ai-workout-to-task-exercises';
import type { Json, FitnessProfileRow } from '@/types/database';

export type StorefrontTrialJobPayload = {
  workspaceId: string;
  userId: string;
  leadId: string;
  trialBubbleId: string;
};

const DEFAULT_BLOCK_OPTIONS = {
  includeWarmup: true,
  mainBlockCount: 1,
  includeFinisher: false,
  includeCooldown: false,
};

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

/**
 * Runs after storefront intake response: generates one workout and inserts `tasks` (service role).
 */
export async function runStorefrontTrialWorkoutJob(
  payload: StorefrontTrialJobPayload,
): Promise<void> {
  const { workspaceId, userId, trialBubbleId } = payload;
  const shouldLog = process.env.NODE_ENV === 'development';
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

  const { persona, availableEquipmentNames } = buildBuddyWorkoutPersona({
    profile,
    overrides: undefined,
    dailyCheckIn: null,
  });

  const chainBody: Record<string, unknown> = {
    ...persona,
    availableEquipmentNames,
    blockOptions: DEFAULT_BLOCK_OPTIONS,
  };

  const result = await runGenerateWorkoutChain(chainBody, shouldLog);
  if (!result.ok) {
    const errText = await result.response.text();
    console.error('[storefront-trial-job] Vertex chain failed', result.response.status, errText);
    return;
  }

  const { workoutSet } = result.data;
  const firstWorkout = workoutSet.workouts[0];
  const taskExercises = firstWorkout ? workoutInSetToTaskExercises(firstWorkout) : [];
  const title = (workoutSet.title ?? 'Your workout').trim() || 'Your workout';
  const description = workoutSet.description?.trim() || null;

  const statusSlug = await resolveFirstBoardColumnSlug(db, workspaceId);

  const workoutType = 'strength';

  const metadata: Json = {
    exercises: taskExercises,
    workout_type: workoutType,
  } as Json;

  const { error: insertErr } = await db.from('tasks').insert({
    bubble_id: trialBubbleId,
    title,
    description,
    status: statusSlug,
    position: 0,
    priority: 'medium',
    item_type: 'workout',
    metadata,
    assigned_to: userId,
    visibility: 'private',
    subtasks: [],
    comments: [],
    activity_log: [],
    attachments: [],
  });

  if (insertErr) {
    console.error('[storefront-trial-job] tasks insert', insertErr);
  }
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
