/**
 * Parametric outline fill pipeline: Vertex Stage 1 → deterministic hydrate → assemble.
 */

import {
  buildDeterministicOutlineFillFromPreflight,
  isOutlineFillDeterministicFallbackEnabled,
} from '@/lib/workout-factory/build-deterministic-outline-fill';
import type { PreparedWorkoutChainRequest } from '@/lib/workout-factory/prepare-workout-chain-request';
import { parseJSONWithRepair } from '@/lib/workout-factory/json-parser';
import {
  buildWorkoutInSetFromOutlineFill,
  outlineFillToTaskExercises,
} from '@/lib/workout-factory/map-outline-fill-to-workout';
import {
  classifyOutlineFillValidationReason,
  hydrateAndValidateOutlineBlocks,
  outlineBlocksToFillOutput,
  preflightOutlineBlocks,
  type OutlineFillValidationReason,
} from '@/lib/workout-factory/outline-block-preflight';
import {
  OUTLINE_FILL_MAX_OUTPUT_TOKENS,
  OUTLINE_FILL_TRUNCATION_TOKEN_RATIO,
  OUTLINE_FILL_VERTEX_MODEL,
} from '@/lib/workout-factory/outline-fill-config';
import {
  countPreflightExercises,
  isVertexFinishLikelyTruncated,
  type OutlineFillTelemetry,
} from '@/lib/workout-factory/outline-fill-telemetry';
import {
  buildFillParametricOutlinePrompt,
  FILL_PARAMETRIC_OUTLINE_SYSTEM_PROMPT,
  validateFillParametricOutlineOutput,
} from '@/lib/workout-factory/prompt-chain/fill-parametric-outline';
import { normalizeWorkoutSet } from '@/lib/workout-factory/program-schedule-utils';
import type { WorkoutSetTemplate } from '@/lib/workout-factory/types/ai-workout';
import type { WorkoutChainGenerationResponse } from '@/lib/workout-factory/workout-chain-response';
import type { VertexAICredentials } from '@/lib/workout-factory/vertex-ai-client';
import { callVertexAIWithMetadata } from '@/lib/workout-factory/vertex-ai-client';

/** Bounded repair retries before surfacing 422 OUTLINE_FILL_VALIDATION_FAILED. */
export const MAX_FILL_ATTEMPTS = 2;

export type OutlineFillRunOptions = {
  createdByUserId?: string | null;
  requestId?: string;
};

export type OutlineFillRunResult =
  | { ok: true; data: WorkoutChainGenerationResponse; telemetry: OutlineFillTelemetry }
  | { ok: false; response: Response; telemetry: OutlineFillTelemetry };

function isVertexCreds(
  creds: VertexAICredentials,
): creds is { projectId: string; region: string; accessToken: string } {
  return 'accessToken' in creds;
}

function buildRetryUserPrompt(
  baseUserPrompt: string,
  lastError: string,
  truncated: boolean,
): string {
  const truncationHint = truncated
    ? '\nKeep output compact; do not add commentary outside JSON.'
    : '';
  return `${baseUserPrompt}

=== PREVIOUS ATTEMPT REJECTED ===
Your last response failed validation: ${lastError}
Return corrected JSON only. Match the outline block count and exercise count per block. Include exercises[] with movement names; add sets, reps, or work_seconds when required by the block format.${truncationHint}`;
}

function emptyTokenTotals() {
  return {
    promptTokens: null as number | null,
    completionTokens: null as number | null,
    totalTokens: null as number | null,
  };
}

function addTokenTotals(
  acc: ReturnType<typeof emptyTokenTotals>,
  usage: {
    promptTokens: number | null;
    completionTokens: number | null;
    totalTokens: number | null;
  },
) {
  if (usage.promptTokens != null) {
    acc.promptTokens = (acc.promptTokens ?? 0) + usage.promptTokens;
  }
  if (usage.completionTokens != null) {
    acc.completionTokens = (acc.completionTokens ?? 0) + usage.completionTokens;
  }
  if (usage.totalTokens != null) {
    acc.totalTokens = (acc.totalTokens ?? 0) + usage.totalTokens;
  }
}

function assembleOutlineFillSuccess(
  prepared: PreparedWorkoutChainRequest,
  hydratedBlocks: Record<string, unknown>[],
  outlineSourceBlockCount: number,
  fillFallback?: { reason: string },
): WorkoutChainGenerationResponse {
  const workoutInSet = buildWorkoutInSetFromOutlineFill(hydratedBlocks, prepared.persona);
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
  const fillOutput = outlineBlocksToFillOutput(hydratedBlocks);
  return {
    workoutSet,
    taskExercises,
    chain_metadata: {
      pipeline: 'parametric_outline_fill',
      fill_parametric_outline: fillOutput,
      outline_source_block_count: outlineSourceBlockCount,
      enrich_workout_biomechanics: null,
      generated_at: new Date().toISOString(),
      model_used: 'vertex-ai',
      ...(fillFallback ? { fill_fallback: true, fill_fallback_reason: fillFallback.reason } : {}),
    },
  };
}

export async function runGenerateWorkoutOutlineFill(
  prepared: PreparedWorkoutChainRequest,
  creds: VertexAICredentials,
  shouldLog: boolean,
  options?: OutlineFillRunOptions | string | null,
): Promise<OutlineFillRunResult> {
  const runOptions: OutlineFillRunOptions =
    typeof options === 'string' || options === null || options === undefined
      ? { createdByUserId: options ?? undefined }
      : options;

  const startedAt = Date.now();
  let exerciseCount = 0;
  let attemptCount = 0;
  let lastFinishReason: string | null = null;
  let truncatedAnyAttempt = false;
  const tokenTotals = emptyTokenTotals();

  const buildTelemetry = (
    partial: Partial<
      Pick<
        OutlineFillTelemetry,
        | 'failureKind'
        | 'validationReason'
        | 'validationError'
        | 'truncated'
        | 'fillFallback'
        | 'fillFallbackReason'
      >
    > & { outlineBlockCount: number; exerciseCount: number },
  ): OutlineFillTelemetry => ({
    pipeline: 'parametric_outline_fill',
    latencyMs: Date.now() - startedAt,
    attemptCount,
    maxAttempts: MAX_FILL_ATTEMPTS,
    outlineBlockCount: partial.outlineBlockCount,
    exerciseCount: partial.exerciseCount,
    promptTokens: tokenTotals.promptTokens,
    completionTokens: tokenTotals.completionTokens,
    totalTokens: tokenTotals.totalTokens,
    finishReason: lastFinishReason,
    truncated: partial.truncated ?? truncatedAnyAttempt,
    model: OUTLINE_FILL_VERTEX_MODEL,
    requestId: runOptions.requestId,
    failureKind: partial.failureKind,
    validationReason: partial.validationReason,
    validationError: partial.validationError,
    fillFallback: partial.fillFallback,
    fillFallbackReason: partial.fillFallbackReason,
  });

  if (!isVertexCreds(creds)) {
    return {
      ok: false,
      response: creds.error,
      telemetry: buildTelemetry({ outlineBlockCount: 0, exerciseCount: 0 }),
    };
  }

  const rawOutline = prepared.coachWorkoutOutline;
  if (!rawOutline?.length) {
    return {
      ok: false,
      response: new Response(JSON.stringify({ error: 'coachWorkoutOutline is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }),
      telemetry: buildTelemetry({ outlineBlockCount: 0, exerciseCount: 0 }),
    };
  }

  const preflight = preflightOutlineBlocks(rawOutline);
  const blockCount = preflight.blocks.length;
  exerciseCount = countPreflightExercises(preflight.blocks);

  if (blockCount === 0) {
    return {
      ok: false,
      response: new Response(
        JSON.stringify({ error: 'Outline preflight produced no valid blocks' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
      telemetry: buildTelemetry({ outlineBlockCount: blockCount, exerciseCount }),
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

  let fillValidation: ReturnType<typeof validateFillParametricOutlineOutput> | undefined;
  let lastError = 'unknown validation error';
  let lastFailureKind: 'validation' | 'parse' = 'validation';
  let lastTruncatedAttempt = false;

  for (let attempt = 1; attempt <= MAX_FILL_ATTEMPTS; attempt++) {
    attemptCount = attempt;
    const userPrompt =
      attempt === 1
        ? baseUserPrompt
        : buildRetryUserPrompt(baseUserPrompt, lastError, lastTruncatedAttempt);

    if (shouldLog && attempt > 1) {
      console.warn(
        `[generate-workout-chain] Outline fill: Stage 1 retry ${attempt}/${MAX_FILL_ATTEMPTS} after: ${lastError}`,
      );
    }

    const fillResponse = await callVertexAIWithMetadata({
      systemPrompt: FILL_PARAMETRIC_OUTLINE_SYSTEM_PROMPT,
      userPrompt,
      accessToken,
      projectId,
      region,
      model: OUTLINE_FILL_VERTEX_MODEL,
      temperature: 0.2,
      maxTokens: OUTLINE_FILL_MAX_OUTPUT_TOKENS,
      timeoutMs: 120000,
      logPrefix: '[generate-workout-chain][outline-fill]',
    });

    lastFinishReason = fillResponse.finishReason;
    addTokenTotals(tokenTotals, fillResponse.usage);
    lastTruncatedAttempt = isVertexFinishLikelyTruncated(
      fillResponse.finishReason,
      fillResponse.usage.completionTokens,
      OUTLINE_FILL_MAX_OUTPUT_TOKENS,
      OUTLINE_FILL_TRUNCATION_TOKEN_RATIO,
    );
    if (lastTruncatedAttempt) truncatedAnyAttempt = true;

    let parsedData: unknown;
    try {
      parsedData = parseJSONWithRepair(fillResponse.content).data;
    } catch (parseErr) {
      lastError = parseErr instanceof Error ? parseErr.message : 'unparseable JSON';
      lastFailureKind = 'parse';
      const validationReason: OutlineFillValidationReason = 'parse';
      console.warn('[generate-workout-chain][outline-fill]', {
        event: attempt < MAX_FILL_ATTEMPTS ? 'fill_attempt_failed' : 'fill_exhausted',
        failure_kind: 'parse',
        validation_reason: validationReason,
        attempt,
        maxAttempts: MAX_FILL_ATTEMPTS,
        validation_error: lastError,
        outline_block_count: blockCount,
        exercise_count: exerciseCount,
        completion_tokens: fillResponse.usage.completionTokens,
        finish_reason: fillResponse.finishReason,
        truncated: lastTruncatedAttempt,
        likely_truncation: lastTruncatedAttempt,
        request_id: runOptions.requestId,
      });
      if (attempt < MAX_FILL_ATTEMPTS) continue;
      break;
    }

    const validation = validateFillParametricOutlineOutput(parsedData, preflight.blocks);
    fillValidation = validation;
    if (validation.valid) break;
    lastError = validation.error;
    lastFailureKind = 'validation';
    const validationReason = classifyOutlineFillValidationReason(lastError);
    console.warn('[generate-workout-chain][outline-fill]', {
      event: attempt < MAX_FILL_ATTEMPTS ? 'fill_attempt_failed' : 'fill_exhausted',
      failure_kind: 'validation',
      validation_reason: validationReason,
      attempt,
      maxAttempts: MAX_FILL_ATTEMPTS,
      validation_error: lastError,
      outline_block_count: blockCount,
      exercise_count: exerciseCount,
      completion_tokens: fillResponse.usage.completionTokens,
      finish_reason: fillResponse.finishReason,
      truncated: lastTruncatedAttempt,
      request_id: runOptions.requestId,
    });
  }

  if (!fillValidation || !fillValidation.valid) {
    const validationReason: OutlineFillValidationReason =
      lastFailureKind === 'parse' ? 'parse' : classifyOutlineFillValidationReason(lastError);

    if (!isOutlineFillDeterministicFallbackEnabled()) {
      return {
        ok: false,
        response: new Response(
          JSON.stringify({
            error: 'OUTLINE_FILL_VALIDATION_FAILED',
            failure_kind: lastFailureKind,
            validation_reason: validationReason,
            message: `Outline fill (Stage 1) failed: ${lastError}`,
            validation_error: lastError,
          }),
          { status: 422, headers: { 'Content-Type': 'application/json' } },
        ),
        telemetry: buildTelemetry({
          outlineBlockCount: blockCount,
          exerciseCount,
          failureKind: lastFailureKind,
          validationReason,
          validationError: lastError,
          truncated: truncatedAnyAttempt,
        }),
      };
    }

    console.warn('[generate-workout-chain][outline-fill]', {
      event: 'fill_fallback_used',
      failure_kind: lastFailureKind,
      validation_reason: validationReason,
      validation_error: lastError,
      outline_block_count: blockCount,
      exercise_count: exerciseCount,
      truncated: truncatedAnyAttempt,
      request_id: runOptions.requestId,
    });

    const fallbackBlocks = buildDeterministicOutlineFillFromPreflight(preflight.blocks);
    const postFillFallback = hydrateAndValidateOutlineBlocks(fallbackBlocks);
    if (
      postFillFallback.drops.length > 0 ||
      postFillFallback.blocks.length !== preflight.blocks.length
    ) {
      const reasons = postFillFallback.drops.map((d) => `${d.field}:${d.reason}`).join('; ');
      return {
        ok: false,
        response: new Response(
          JSON.stringify({
            error: `Outline post-fill validation failed${reasons ? `: ${reasons}` : ''}`,
          }),
          { status: 500, headers: { 'Content-Type': 'application/json' } },
        ),
        telemetry: buildTelemetry({
          outlineBlockCount: blockCount,
          exerciseCount,
          failureKind: lastFailureKind,
          validationReason,
          validationError: reasons || 'post-fill validation failed after fallback',
          truncated: truncatedAnyAttempt,
          fillFallback: true,
          fillFallbackReason: lastError,
        }),
      };
    }

    if (shouldLog) {
      console.warn('[generate-workout-chain] Outline fill: deterministic fallback assembled');
    }

    return {
      ok: true,
      data: assembleOutlineFillSuccess(prepared, postFillFallback.blocks, preflight.blocks.length, {
        reason: lastError,
      }),
      telemetry: buildTelemetry({
        outlineBlockCount: blockCount,
        exerciseCount,
        truncated: truncatedAnyAttempt,
        fillFallback: true,
        fillFallbackReason: lastError,
      }),
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
      telemetry: buildTelemetry({
        outlineBlockCount: blockCount,
        exerciseCount,
        failureKind: 'validation',
        validationReason: 'unknown',
        validationError: reasons || 'post-fill validation failed',
        truncated: truncatedAnyAttempt,
      }),
    };
  }

  if (shouldLog) {
    console.warn('[generate-workout-chain] Outline fill: Stage 2 enrich skipped (Phase 3.2b)');
  }

  return {
    ok: true,
    data: assembleOutlineFillSuccess(prepared, postFill.blocks, preflight.blocks.length),
    telemetry: buildTelemetry({
      outlineBlockCount: blockCount,
      exerciseCount,
      truncated: truncatedAnyAttempt,
    }),
  };
}
