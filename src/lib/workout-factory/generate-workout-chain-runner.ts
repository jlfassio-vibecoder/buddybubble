/**
 * 4-step Workout Factory chain (Vertex) — same orchestration as Interval Timers `generate-workout-chain`.
 */

import type { PatternSkeleton, ExerciseSelection } from '@/lib/workout-factory/types/ai-program';
import type {
  WorkoutArchitectBlueprint,
  WorkoutSetTemplate,
  WorkoutChainMetadata,
  WorkoutInSet,
} from '@/lib/workout-factory/types/ai-workout';
import { parseJSONWithRepair } from '@/lib/workout-factory/json-parser';
import { prepareWorkoutChainRequest } from '@/lib/workout-factory/prepare-workout-chain-request';
import {
  buildWorkoutArchitectPrompt,
  validateWorkoutArchitectOutput,
} from '@/lib/workout-factory/prompt-chain/step1-workout-architect';
import {
  buildBiomechanistPrompt,
  validateBiomechanistOutput,
} from '@/lib/workout-factory/prompt-chain/step2-biomechanist';
import {
  buildCoachPrompt,
  validateCoachOutput,
} from '@/lib/workout-factory/prompt-chain/step3-coach';
import {
  buildWorkoutMathematicianPrompt,
  validateWorkoutMathematicianOutput,
} from '@/lib/workout-factory/prompt-chain/step4-workout-mathematician';
import { normalizeWorkoutSet } from '@/lib/workout-factory/program-schedule-utils';
import { callVertexAI, getVertexAICredentials } from '@/lib/workout-factory/vertex-ai-client';
import {
  runExtractAndEnrichChain,
  useKanbanExtractPipeline,
} from '@/lib/workout-factory/generate-workout-kanban-extract-runner';
import type { WorkoutChainGenerationResponse } from '@/lib/workout-factory/workout-chain-response';

export async function runGenerateWorkoutChain(
  rawBody: unknown,
  shouldLog: boolean,
): Promise<{ ok: true; data: WorkoutChainGenerationResponse } | { ok: false; response: Response }> {
  const prepared = await prepareWorkoutChainRequest(rawBody, shouldLog);
  if (!prepared.ok) return { ok: false, response: prepared.response };

  const {
    persona,
    blockOptions,
    hiitMode,
    hiitOptions,
    amrapDensityOptions,
    tabataBalancedOptions,
    zoneContext,
    availableEquipment,
    providedArchitect,
    step1UserPromptOverride,
  } = prepared.data;

  const amrapDensityMode = !!persona.amrapDensityMode;
  const tabataBalancedMode = !!persona.tabataBalancedMode;

  const creds = await getVertexAICredentials('[generate-workout-chain]');
  if ('error' in creds) return { ok: false, response: creds.error };

  if (useKanbanExtractPipeline(persona)) {
    if (shouldLog) console.warn('[generate-workout-chain] Using Kanban extract & enrich pipeline');
    return runExtractAndEnrichChain(prepared.data, creds, shouldLog);
  }

  const { projectId, region, accessToken } = creds;

  let workoutArchitect: WorkoutArchitectBlueprint;
  if (providedArchitect) {
    const validation = validateWorkoutArchitectOutput(
      providedArchitect,
      hiitMode,
      amrapDensityMode,
      tabataBalancedMode,
      tabataBalancedOptions,
    );
    if (!validation.valid) {
      return {
        ok: false,
        response: new Response(
          JSON.stringify({ error: `Invalid architectBlueprint: ${validation.error}` }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      };
    }
    workoutArchitect = validation.data;
    if (shouldLog)
      console.warn('[generate-workout-chain] Using provided workout architect blueprint');
  } else {
    if (shouldLog) console.warn('[generate-workout-chain] Step 1: Workout Architect...');
    const step1Prompt =
      step1UserPromptOverride ?? buildWorkoutArchitectPrompt(persona, zoneContext, hiitOptions);
    const step1System =
      'You are the Workout Architect (PhD Exercise Physiology). Output ONLY valid JSON.';
    const step1Response = await callVertexAI({
      systemPrompt: step1System,
      userPrompt: step1Prompt,
      accessToken,
      projectId,
      region,
      temperature: 0.5,
      maxTokens: 2048,
      logPrefix: '[generate-workout-chain]',
    });

    const step1Parsed = parseJSONWithRepair(step1Response);
    const step1Validation = validateWorkoutArchitectOutput(
      step1Parsed.data,
      hiitMode,
      amrapDensityMode,
      tabataBalancedMode,
      tabataBalancedOptions,
    );
    if (!step1Validation.valid) {
      return {
        ok: false,
        response: new Response(
          JSON.stringify({ error: `Step 1 (Workout Architect) failed: ${step1Validation.error}` }),
          { status: 500, headers: { 'Content-Type': 'application/json' } },
        ),
      };
    }
    workoutArchitect = step1Validation.data;
  }
  if (shouldLog)
    console.warn('[generate-workout-chain] Step 1 complete:', workoutArchitect.workout_set_name);

  const architectForStep2 = {
    ...workoutArchitect,
    program_name: workoutArchitect.workout_set_name,
    rationale: workoutArchitect.rationale,
    split: workoutArchitect.split,
    progression_protocol: workoutArchitect.progression_protocol,
    progression_rules: workoutArchitect.progression_rules,
    volume_landmarks: workoutArchitect.volume_landmarks,
  };

  if (shouldLog) console.warn('[generate-workout-chain] Step 2: Biomechanist...');
  const step2Prompt = buildBiomechanistPrompt(architectForStep2);
  const step2Response = await callVertexAI({
    systemPrompt:
      'You are the Biomechanist. Map movement patterns for structural balance. Output ONLY valid JSON.',
    userPrompt: step2Prompt,
    accessToken,
    projectId,
    region,
    temperature: 0.4,
    maxTokens: 2048,
    logPrefix: '[generate-workout-chain]',
  });

  const step2Parsed = parseJSONWithRepair(step2Response);
  const step2Validation = validateBiomechanistOutput(
    step2Parsed.data,
    workoutArchitect.split.days_per_week,
  );
  if (!step2Validation.valid) {
    return {
      ok: false,
      response: new Response(
        JSON.stringify({ error: `Step 2 (Biomechanist) failed: ${step2Validation.error}` }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      ),
    };
  }
  const patterns: PatternSkeleton = step2Validation.data;

  if (shouldLog) console.warn('[generate-workout-chain] Step 3: Coach...');
  const step3Prompt = buildCoachPrompt(patterns, availableEquipment, hiitMode, undefined, {
    kanbanBriefAuthoritative: !!persona.kanbanBriefAuthoritative,
  });
  const step3System =
    'You are the Equipment Coach. Select specific exercises based on available equipment. Output ONLY valid JSON.';
  const step3Response = await callVertexAI({
    systemPrompt: step3System,
    userPrompt: step3Prompt,
    accessToken,
    projectId,
    region,
    temperature: 0.4,
    maxTokens: 3072,
    logPrefix: '[generate-workout-chain]',
  });

  const step3Parsed = parseJSONWithRepair(step3Response);
  const step3Validation = validateCoachOutput(step3Parsed.data, patterns.days.length);
  if (!step3Validation.valid) {
    return {
      ok: false,
      response: new Response(
        JSON.stringify({ error: `Step 3 (Coach) failed: ${step3Validation.error}` }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      ),
    };
  }
  const exercises: ExerciseSelection[] = step3Validation.data;

  if (shouldLog) console.warn('[generate-workout-chain] Step 4: Workout Mathematician...');
  const step4Prompt = buildWorkoutMathematicianPrompt(
    workoutArchitect,
    exercises,
    blockOptions,
    hiitMode,
    hiitOptions,
    amrapDensityMode,
    amrapDensityOptions,
    tabataBalancedMode,
    tabataBalancedOptions,
  );
  const step4Response = await callVertexAI({
    systemPrompt: amrapDensityMode
      ? 'You are the Workout Mathematician. For Density-Based AMRAP: output ONLY one main circuit in exerciseBlocks using fixed repetition counts per station (sets/reps schema). FORBID workSeconds and timed-station prescriptions. restSeconds must be 0 between movements (continuous lap). Primary metric: Total Laps Completed. Do not include warmupBlocks, finisherBlocks, or cooldownBlocks (use empty arrays). Output ONLY valid JSON.'
      : tabataBalancedMode
        ? 'You are the Workout Mathematician. For Balanced Tabata: output exactly ONE block in exerciseBlocks. Each exercise MUST use workSeconds 20, restSeconds 10, and rounds as specified in the user prompt. FORBID sets and reps in the main block. Do not include warmupBlocks, finisherBlocks, or cooldownBlocks (use empty arrays). Output ONLY valid JSON.'
        : hiitMode
          ? hiitOptions?.protocolFormat === 'amrap'
            ? 'You are the Workout Mathematician. For AMRAP: output ONLY the main interval circuit in exerciseBlocks (timer fields: workSeconds, restSeconds, rounds=1 per exercise). Do not include warmupBlocks, finisherBlocks, or cooldownBlocks (use empty arrays). Warm-up and cool-down are not part of this output. Output ONLY valid JSON.'
            : 'You are the Workout Mathematician. Generate one set of HIIT workouts with workSeconds, restSeconds, rounds per exercise. Output ONLY valid JSON.'
          : 'You are the Workout Mathematician. Generate one set of workouts with sets, reps, RPE, rest. Output ONLY valid JSON.',
    userPrompt: step4Prompt,
    accessToken,
    projectId,
    region,
    temperature: 0.3,
    maxTokens: 8192,
    timeoutMs: 120000,
    logPrefix: '[generate-workout-chain]',
  });

  const step4Parsed = parseJSONWithRepair(step4Response);
  const step4Validation = validateWorkoutMathematicianOutput(
    step4Parsed.data,
    workoutArchitect.sessions.length,
    blockOptions,
    hiitMode,
    hiitOptions,
    amrapDensityMode,
    tabataBalancedMode,
    tabataBalancedOptions,
  );
  if (!step4Validation.valid) {
    return {
      ok: false,
      response: new Response(
        JSON.stringify({
          error: `Step 4 (Workout Mathematician) failed: ${step4Validation.error}`,
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      ),
    };
  }
  const workouts: WorkoutInSet[] = step4Validation.data;

  const workoutSet: WorkoutSetTemplate = normalizeWorkoutSet({
    title: persona.title || workoutArchitect.workout_set_name,
    description: persona.description || workoutArchitect.rationale,
    difficulty: persona.demographics.experienceLevel as 'beginner' | 'intermediate' | 'advanced',
    workouts,
  });

  const chain_metadata: WorkoutChainMetadata = {
    pipeline: 'legacy_four_step',
    step1_workout_architect: workoutArchitect,
    step2_biomechanist: patterns,
    step3_coach: exercises,
    step4_workout_mathematician: workouts,
    generated_at: new Date().toISOString(),
    model_used: 'vertex-ai',
  };

  return {
    ok: true,
    data: {
      workoutSet,
      chain_metadata,
    },
  };
}
