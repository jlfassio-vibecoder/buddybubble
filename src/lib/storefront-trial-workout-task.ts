/**
 * Shared storefront trial workout: insert `tasks` row from a validated preview payload
 * and optional `bubbles.metadata.workout_generation` updates (Realtime UX).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { WorkoutExercise } from '@/lib/item-metadata';
import type { Json } from '@/types/database';
import { storefrontPreviewExerciseToWorkoutExercise } from '@/lib/workout-factory/storefront-preview-exercise-detail';
import type { StorefrontPreviewPayload } from '@/lib/workout-factory/storefront-preview-runner';

export const BUBBLE_WORKOUT_GENERATION_KEY = 'workout_generation' as const;

export type WorkoutGenerationStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export type BubbleWorkoutGenerationState = {
  status: WorkoutGenerationStatus;
  updated_at: string;
  error_message?: string;
};

const MAX_ERROR_MESSAGE_LEN = 500;

async function resolveFirstBoardColumnSlug(
  db: SupabaseClient,
  workspaceId: string,
): Promise<string> {
  const { data, error } = await db
    .from('board_columns')
    .select('slug')
    .eq('workspace_id', workspaceId)
    .order('position', { ascending: true })
    .limit(1);

  if (error) {
    console.error('[storefront-trial-workout-task] board_columns', error);
    return 'planned';
  }
  const slug = data?.[0]?.slug;
  return typeof slug === 'string' && slug.trim() ? slug.trim() : 'planned';
}

/**
 * Insert a workout `tasks` row from a validated storefront-style preview (Vertex single-call).
 * Used for storefront trial, async trial job, and in-app “quick workout” from the fitness profile.
 */
export async function insertWorkoutTaskFromStorefrontPreview(
  db: SupabaseClient,
  args: {
    bubbleId: string;
    userId: string;
    workspaceId: string;
    preview: StorefrontPreviewPayload;
  },
): Promise<boolean> {
  const p = args.preview;
  const exercises: WorkoutExercise[] = p.main_exercises.map((e) =>
    storefrontPreviewExerciseToWorkoutExercise(e.name, e.detail),
  );
  const title = p.title.trim() || 'Your workout';
  const description =
    [p.summary.trim(), p.coach_tip?.trim() ? `Tip: ${p.coach_tip.trim()}` : '']
      .filter(Boolean)
      .join('\n\n') || null;

  const statusSlug = await resolveFirstBoardColumnSlug(db, args.workspaceId);
  const metadata: Json = {
    exercises,
    workout_type: 'strength',
  } as Json;

  const { error: insertErr } = await db.from('tasks').insert({
    bubble_id: args.bubbleId,
    title,
    description,
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
    console.error('[storefront-trial-workout-task] tasks insert', insertErr);
    return false;
  }
  return true;
}

export async function insertTrialWorkoutTaskFromPreview(
  db: SupabaseClient,
  args: {
    trialBubbleId: string;
    userId: string;
    workspaceId: string;
    preview: StorefrontPreviewPayload;
  },
): Promise<boolean> {
  return insertWorkoutTaskFromStorefrontPreview(db, {
    bubbleId: args.trialBubbleId,
    userId: args.userId,
    workspaceId: args.workspaceId,
    preview: args.preview,
  });
}

export async function trialBubbleNeedsStorefrontWorkout(
  db: SupabaseClient,
  trialBubbleId: string,
  userId: string,
): Promise<boolean> {
  const { count, error } = await db
    .from('tasks')
    .select('id', { count: 'exact', head: true })
    .eq('bubble_id', trialBubbleId)
    .eq('item_type', 'workout')
    .eq('assigned_to', userId)
    .is('archived_at', null);

  if (error) {
    console.error(
      '[storefront-trial-workout-task] workout task count',
      error.message || 'Unknown error',
    );
    return true;
  }
  return (count ?? 0) === 0;
}

function parseBubbleMetadata(raw: unknown): Record<string, unknown> {
  if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
    return { ...(raw as Record<string, unknown>) };
  }
  return {};
}

/**
 * Merge `metadata.workout_generation` on the bubble (service-role).
 */
export async function setBubbleWorkoutGenerationStatus(
  db: SupabaseClient,
  bubbleId: string,
  status: WorkoutGenerationStatus,
  opts?: { error_message?: string },
): Promise<void> {
  const { data, error: selErr } = await db
    .from('bubbles')
    .select('metadata')
    .eq('id', bubbleId)
    .maybeSingle();
  if (selErr) {
    console.error('[storefront-trial-workout-task] bubble select for metadata', selErr);
    return;
  }
  const prev = parseBubbleMetadata(data?.metadata);
  const gen: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };
  if (status === 'failed' && opts?.error_message?.trim()) {
    gen.error_message = opts.error_message.trim().slice(0, MAX_ERROR_MESSAGE_LEN);
  }
  prev[BUBBLE_WORKOUT_GENERATION_KEY] = gen;
  const { error: upErr } = await db
    .from('bubbles')
    .update({ metadata: prev as Json })
    .eq('id', bubbleId);
  if (upErr) {
    console.error('[storefront-trial-workout-task] bubble metadata update', upErr);
  }
}

export function parseWorkoutGenerationFromBubbleMetadata(
  metadata: unknown,
): BubbleWorkoutGenerationState | null {
  if (metadata === null || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const o = metadata as Record<string, unknown>;
  const raw = o[BUBBLE_WORKOUT_GENERATION_KEY];
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const g = raw as Record<string, unknown>;
  const status = g.status;
  if (
    status !== 'pending' &&
    status !== 'running' &&
    status !== 'completed' &&
    status !== 'failed' &&
    status !== 'skipped'
  ) {
    return null;
  }
  const updated_at = typeof g.updated_at === 'string' ? g.updated_at : '';
  const error_message = typeof g.error_message === 'string' ? g.error_message : undefined;
  return {
    status,
    updated_at,
    ...(error_message ? { error_message } : {}),
  };
}
