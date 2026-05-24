import { runGenerateWorkoutOutlineFill } from '@/lib/workout-factory/generate-workout-outline-fill-runner';
import { preflightOutlineBlocks } from '@/lib/workout-factory/outline-block-preflight';
import { prepareWorkoutChainRequest } from '@/lib/workout-factory/prepare-workout-chain-request';
import { getVertexAICredentials } from '@/lib/workout-factory/vertex-ai-client';
import type { WorkoutChainGenerationResponse } from '@/lib/workout-factory/workout-chain-response';

const OUTLINE_REQUIRED_ERROR = 'OUTLINE_REQUIRED_FOR_FACTORY';

/**
 * Workout chain generation: parametric outline fill when a valid Apex outline is present.
 */
export async function runGenerateWorkoutChain(
  rawBody: unknown,
  shouldLog: boolean,
  options?: { createdByUserId?: string | null },
): Promise<{ ok: true; data: WorkoutChainGenerationResponse } | { ok: false; response: Response }> {
  const prepared = await prepareWorkoutChainRequest(rawBody, shouldLog);
  if (!prepared.ok) return { ok: false, response: prepared.response };

  const creds = await getVertexAICredentials('[generate-workout-chain]');
  if ('error' in creds) return { ok: false, response: creds.error };

  const preflight = prepared.data.coachWorkoutOutline?.length
    ? preflightOutlineBlocks(prepared.data.coachWorkoutOutline)
    : null;

  if (preflight && preflight.blocks.length > 0) {
    if (shouldLog) {
      console.warn('[generate-workout-chain] Using parametric outline fill pipeline');
    }
    return runGenerateWorkoutOutlineFill(prepared.data, creds, shouldLog, options?.createdByUserId);
  }

  if (shouldLog) {
    console.warn(
      '[generate-workout-chain] No valid coach_workout_outline — factory blocked (Kanban quarantined)',
    );
  }

  return {
    ok: false,
    response: new Response(JSON.stringify({ error: OUTLINE_REQUIRED_ERROR }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    }),
  };
}
