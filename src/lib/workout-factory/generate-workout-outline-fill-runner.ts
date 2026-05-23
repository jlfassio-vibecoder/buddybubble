/**
 * Parametric outline fill pipeline: Vertex Stage 1 → deterministic hydrate → assemble.
 */

import type { PreparedWorkoutChainRequest } from '@/lib/workout-factory/prepare-workout-chain-request';
import { parseJSONWithRepair } from '@/lib/workout-factory/json-parser';
import {
  buildWorkoutInSetFromOutlineFill,
  outlineFillToTaskExercises,
} from '@/lib/workout-factory/map-outline-fill-to-workout';
import {
  hydrateAndValidateOutlineBlocks,
  outlineBlocksToFillOutput,
  preflightOutlineBlocks,
} from '@/lib/workout-factory/outline-block-preflight';
import {
  buildFillParametricOutlinePrompt,
  FILL_PARAMETRIC_OUTLINE_SYSTEM_PROMPT,
  validateFillParametricOutlineOutput,
} from '@/lib/workout-factory/prompt-chain/fill-parametric-outline';
import { normalizeWorkoutSet } from '@/lib/workout-factory/program-schedule-utils';
import type { WorkoutSetTemplate } from '@/lib/workout-factory/types/ai-workout';
import type { WorkoutChainGenerationResponse } from '@/lib/workout-factory/workout-chain-response';
import type { VertexAICredentials } from '@/lib/workout-factory/vertex-ai-client';
import { callVertexAI } from '@/lib/workout-factory/vertex-ai-client';

const OUTLINE_FILL_VERTEX_MODEL = 'google/gemini-3.1-flash-lite-preview';

function isVertexCreds(
  creds: VertexAICredentials,
): creds is { projectId: string; region: string; accessToken: string } {
  return 'accessToken' in creds;
}

export async function runGenerateWorkoutOutlineFill(
  prepared: PreparedWorkoutChainRequest,
  creds: VertexAICredentials,
  shouldLog: boolean,
  _createdByUserId?: string | null,
): Promise<{ ok: true; data: WorkoutChainGenerationResponse } | { ok: false; response: Response }> {
  if (!isVertexCreds(creds)) return { ok: false, response: creds.error };

  const rawOutline = prepared.coachWorkoutOutline;
  if (!rawOutline?.length) {
    return {
      ok: false,
      response: new Response(JSON.stringify({ error: 'coachWorkoutOutline is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }),
    };
  }

  const preflight = preflightOutlineBlocks(rawOutline);
  if (preflight.blocks.length === 0) {
    return {
      ok: false,
      response: new Response(
        JSON.stringify({ error: 'Outline preflight produced no valid blocks' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    };
  }

  const { projectId, region, accessToken } = creds;
  const equipmentList = prepared.availableEquipment
    .map((e) => (typeof e === 'string' ? e.trim() : ''))
    .filter((e) => e.length > 0);

  if (shouldLog) {
    console.warn('[generate-workout-chain] Outline fill: Stage 1 (Vertex)...');
  }

  const userPrompt = buildFillParametricOutlinePrompt(
    prepared.persona,
    preflight.blocks,
    equipmentList,
  );

  const fillResponse = await callVertexAI({
    systemPrompt: FILL_PARAMETRIC_OUTLINE_SYSTEM_PROMPT,
    userPrompt,
    accessToken,
    projectId,
    region,
    model: OUTLINE_FILL_VERTEX_MODEL,
    temperature: 0.2,
    maxTokens: 8192,
    timeoutMs: 120000,
    logPrefix: '[generate-workout-chain][outline-fill]',
  });

  const fillParsed = parseJSONWithRepair(fillResponse);
  const fillValidation = validateFillParametricOutlineOutput(fillParsed.data, preflight.blocks);
  if (!fillValidation.valid) {
    return {
      ok: false,
      response: new Response(
        JSON.stringify({ error: `Outline fill (Stage 1) failed: ${fillValidation.error}` }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      ),
    };
  }

  const postFill = hydrateAndValidateOutlineBlocks(
    fillValidation.data.blocks as unknown as Record<string, unknown>[],
  );
  if (postFill.drops.length > 0 || postFill.blocks.length !== preflight.blocks.length) {
    const reasons = postFill.drops.map((d) => `${d.field}:${d.reason}`).join('; ');
    return {
      ok: false,
      response: new Response(
        JSON.stringify({
          error: `Outline post-fill validation failed${reasons ? `: ${reasons}` : ''}`,
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      ),
    };
  }

  // Phase 3.2b: optional enrich-workout-biomechanics Stage 2 (skipped for MVP)
  if (shouldLog) {
    console.warn('[generate-workout-chain] Outline fill: Stage 2 enrich skipped (Phase 3.2b)');
  }

  const workoutInSet = buildWorkoutInSetFromOutlineFill(postFill.blocks, prepared.persona);
  const taskExercises = outlineFillToTaskExercises(workoutInSet);

  const workoutSet: WorkoutSetTemplate = normalizeWorkoutSet({
    title: workoutInSet.title,
    description: workoutInSet.description,
    difficulty: prepared.persona.demographics.experienceLevel as
      | 'beginner'
      | 'intermediate'
      | 'advanced',
    workouts: [workoutInSet],
  });

  const fillOutput = outlineBlocksToFillOutput(postFill.blocks);

  return {
    ok: true,
    data: {
      workoutSet,
      taskExercises,
      chain_metadata: {
        pipeline: 'parametric_outline_fill',
        fill_parametric_outline: fillOutput,
        outline_source_block_count: preflight.blocks.length,
        enrich_workout_biomechanics: null,
        generated_at: new Date().toISOString(),
        model_used: 'vertex-ai',
      },
    },
  };
}
