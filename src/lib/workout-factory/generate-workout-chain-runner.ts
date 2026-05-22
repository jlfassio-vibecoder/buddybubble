import { runExtractAndEnrichChain } from '@/lib/workout-factory/generate-workout-kanban-extract-runner';
import { prepareWorkoutChainRequest } from '@/lib/workout-factory/prepare-workout-chain-request';
import { getVertexAICredentials } from '@/lib/workout-factory/vertex-ai-client';
import type { WorkoutChainGenerationResponse } from '@/lib/workout-factory/workout-chain-response';

/**
 * All workout chain generation uses the Kanban extract → enrich pipeline
 * (Vertex brief extraction + optional dictionary merge + enrich).
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

  if (shouldLog) {
    if (prepared.data.coachWorkoutOutline?.length) {
      console.warn(
        '[generate-workout-chain] coach_workout_outline present; outline filler not implemented (Phase 3.2) — using Kanban extract & enrich',
      );
    } else {
      console.warn('[generate-workout-chain] Using Kanban extract & enrich pipeline');
    }
  }
  return runExtractAndEnrichChain(prepared.data, creds, shouldLog, options?.createdByUserId);
}
