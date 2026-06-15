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

/** Bounded repair retries before surfacing 422 OUTLINE_FILL_VALIDATION_FAILED. */
export const MAX_FILL_ATTEMPTS = 2;

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

  const baseUserPrompt = buildFillParametricOutlinePrompt(
    prepared.persona,
    preflight.blocks,
    equipmentList,
  );

  // The fill model is non-deterministic against a strict structural contract; a single
  // drift (renamed block, dropped prescription, malformed JSON) would otherwise hard-fail
  // with a 422. Retry once with the validation error fed back before surfacing the error.
  let fillValidation: ReturnType<typeof validateFillParametricOutlineOutput> | undefined;
  let lastError = 'unknown validation error';

  for (let attempt = 1; attempt <= MAX_FILL_ATTEMPTS; attempt++) {
    const userPrompt =
      attempt === 1
        ? baseUserPrompt
        : `${baseUserPrompt}

=== PREVIOUS ATTEMPT REJECTED ===
Your last response failed validation: ${lastError}
Return corrected JSON only. Preserve every block name, block_format, and format_params exactly as given, and include sets, reps, or work_seconds for each exercise.`;

    if (shouldLog && attempt > 1) {
      console.warn(
        `[generate-workout-chain] Outline fill: Stage 1 retry ${attempt}/${MAX_FILL_ATTEMPTS} after: ${lastError}`,
      );
    }

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

    let parsedData: unknown;
    try {
      parsedData = parseJSONWithRepair(fillResponse).data;
    } catch (parseErr) {
      lastError = parseErr instanceof Error ? parseErr.message : 'unparseable JSON';
      console.warn('[generate-workout-chain][outline-fill]', {
        event: attempt < MAX_FILL_ATTEMPTS ? 'fill_attempt_failed' : 'fill_exhausted',
        attempt,
        maxAttempts: MAX_FILL_ATTEMPTS,
        validation_error: lastError,
      });
      if (attempt < MAX_FILL_ATTEMPTS) continue;
      throw parseErr;
    }

    const validation = validateFillParametricOutlineOutput(parsedData, preflight.blocks);
    fillValidation = validation;
    if (validation.valid) break;
    lastError = validation.error;
    console.warn('[generate-workout-chain][outline-fill]', {
      event: attempt < MAX_FILL_ATTEMPTS ? 'fill_attempt_failed' : 'fill_exhausted',
      attempt,
      maxAttempts: MAX_FILL_ATTEMPTS,
      validation_error: lastError,
    });
  }

  if (!fillValidation || !fillValidation.valid) {
    return {
      ok: false,
      response: new Response(
        JSON.stringify({
          error: 'OUTLINE_FILL_VALIDATION_FAILED',
          message: `Outline fill (Stage 1) failed: ${lastError}`,
          validation_error: lastError,
        }),
        { status: 422, headers: { 'Content-Type': 'application/json' } },
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
