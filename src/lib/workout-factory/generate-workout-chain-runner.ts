import { runGenerateWorkoutOutlineFill } from '@/lib/workout-factory/generate-workout-outline-fill-runner';
import type { OutlineFillTelemetry } from '@/lib/workout-factory/outline-fill-telemetry';
import { preflightOutlineBlocks } from '@/lib/workout-factory/outline-block-preflight';
import { prepareWorkoutChainRequest } from '@/lib/workout-factory/prepare-workout-chain-request';
import { getVertexAICredentials } from '@/lib/workout-factory/vertex-ai-client';
import type { WorkoutChainGenerationResponse } from '@/lib/workout-factory/workout-chain-response';

const OUTLINE_REQUIRED_ERROR = 'OUTLINE_REQUIRED_FOR_FACTORY';

export type GenerateWorkoutChainRunOptions = {
  createdByUserId?: string | null;
  requestId?: string;
};

export type GenerateWorkoutChainRunResult =
  | { ok: true; data: WorkoutChainGenerationResponse; telemetry: OutlineFillTelemetry | null }
  | { ok: false; response: Response; telemetry: OutlineFillTelemetry | null };

/**
 * Workout chain generation: parametric outline fill when a valid Apex outline is present.
 */
export async function runGenerateWorkoutChain(
  rawBody: unknown,
  shouldLog: boolean,
  options?: GenerateWorkoutChainRunOptions,
): Promise<GenerateWorkoutChainRunResult> {
  const prepared = await prepareWorkoutChainRequest(rawBody, shouldLog);
  if (!prepared.ok) return { ok: false, response: prepared.response, telemetry: null };

  const creds = await getVertexAICredentials('[generate-workout-chain]');
  if ('error' in creds) return { ok: false, response: creds.error, telemetry: null };

  const preflight = prepared.data.coachWorkoutOutline?.length
    ? preflightOutlineBlocks(prepared.data.coachWorkoutOutline)
    : null;

  if (preflight && preflight.blocks.length > 0) {
    if (shouldLog) {
      console.warn('[generate-workout-chain] Using parametric outline fill pipeline');
    }
    return runGenerateWorkoutOutlineFill(prepared.data, creds, shouldLog, {
      createdByUserId: options?.createdByUserId,
      requestId: options?.requestId,
    });
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
    telemetry: null,
  };
}
