// import { runExtractAndEnrichChain } from '@/lib/workout-factory/generate-workout-kanban-extract-runner';
import { runGenerateWorkoutOutlineFill } from '@/lib/workout-factory/generate-workout-outline-fill-runner';
import { preflightOutlineBlocks } from '@/lib/workout-factory/outline-block-preflight';
import { prepareWorkoutChainRequest } from '@/lib/workout-factory/prepare-workout-chain-request';
import { getVertexAICredentials } from '@/lib/workout-factory/vertex-ai-client';
import type { WorkoutChainGenerationResponse } from '@/lib/workout-factory/workout-chain-response';

const OUTLINE_REQUIRED_ERROR = 'OUTLINE_REQUIRED_FOR_FACTORY';

/**
 * Workout chain generation: parametric outline fill when a valid Apex outline is present.
 * STEP 1 quarantine: Kanban extract → enrich (Hop 3b/4) disabled while rebuilding states.
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

  /*
  if (shouldLog && prepared.data.coachWorkoutOutline?.length) {
    console.warn(
      '[generate-workout-chain] coach_workout_outline present but preflight dropped all blocks — using Kanban extract & enrich',
    );
  } else if (shouldLog) {
    console.warn('[generate-workout-chain] Using Kanban extract & enrich pipeline');
  }

  return runExtractAndEnrichChain(prepared.data, creds, shouldLog, options?.createdByUserId);
  */
}
