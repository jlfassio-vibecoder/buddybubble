/**
 * Kanban authoritative brief: Vertex Extract → Enrich (no 4-step factory chain).
 */

import type { WorkoutExercise } from '@/lib/item-metadata';
import type { PreparedWorkoutChainRequest } from '@/lib/workout-factory/prepare-workout-chain-request';
import { parseJSONWithRepair } from '@/lib/workout-factory/json-parser';
import {
  insertExerciseDictionaryPendingFromEnrichment,
  mergeKanbanEnrichFromDictionaryAndVertex,
  dictionaryRowsByNormalizedName,
  rpcExerciseDictionaryLookupByNames,
  splitExtractByDictionaryMatches,
} from '@/lib/workout-factory/exercise-dictionary-bridge';
import {
  buildEnrichWorkoutBiomechanicsPrompt,
  validateEnrichWorkoutBiomechanicsOutput,
} from '@/lib/workout-factory/prompt-chain/enrich-workout-biomechanics';
import {
  buildExtractWorkoutFromBriefPrompt,
  validateExtractWorkoutFromBriefOutput,
} from '@/lib/workout-factory/prompt-chain/extract-workout-from-brief';
import type { WorkoutChainGenerationResponse } from '@/lib/workout-factory/workout-chain-response';
import {
  buildWorkoutInSetFromKanbanExtract,
  mergeKanbanExtractEnrichToTaskExercises,
} from '@/lib/workout-factory/map-kanban-extract-to-workout';
import { normalizeWorkoutSet } from '@/lib/workout-factory/program-schedule-utils';
import type { WorkoutSetTemplate } from '@/lib/workout-factory/types/ai-workout';
import type {
  KanbanEnrichBiomechanicsOutput,
  KanbanExtractBriefOutput,
} from '@/lib/workout-factory/types/kanban-extract-types';
import type { VertexAICredentials } from '@/lib/workout-factory/vertex-ai-client';
import { callVertexAI } from '@/lib/workout-factory/vertex-ai-client';
import { createServiceRoleClient } from '@/lib/supabase-service-role';
import type { ExerciseDictionaryRow } from '@/types/database';

function isVertexCreds(
  creds: VertexAICredentials,
): creds is { projectId: string; region: string; accessToken: string } {
  return 'accessToken' in creds;
}

export function useKanbanExtractPipeline(persona: PreparedWorkoutChainRequest['persona']): boolean {
  return (
    !!persona.kanbanBriefAuthoritative &&
    !!(persona.title?.trim() || persona.description?.trim()) &&
    !persona.hiitMode &&
    !persona.amrapDensityMode &&
    !persona.tabataBalancedMode
  );
}

async function resolveDictionarySplit(
  extracted: KanbanExtractBriefOutput,
  shouldLog: boolean,
): Promise<{
  serviceClient: ReturnType<typeof createServiceRoleClient> | null;
  foundByOrder: Map<number, ExerciseDictionaryRow>;
  missing: KanbanExtractBriefOutput['exercises'];
}> {
  let serviceClient: ReturnType<typeof createServiceRoleClient> | null = null;
  try {
    serviceClient = createServiceRoleClient();
  } catch (err) {
    if (shouldLog) {
      console.warn(
        'exercise_dictionary_cache_skipped',
        'service_role_unavailable',
        err instanceof Error ? err.message : err,
      );
    }
    return {
      serviceClient: null,
      foundByOrder: new Map(),
      missing: extracted.exercises,
    };
  }

  try {
    const names = extracted.exercises.map((e) => e.exercise_name);
    const rows = await rpcExerciseDictionaryLookupByNames(serviceClient, names);
    const normToRow = dictionaryRowsByNormalizedName(rows);
    return { serviceClient, ...splitExtractByDictionaryMatches(extracted, normToRow) };
  } catch (err) {
    if (shouldLog) {
      console.warn(
        'exercise_dictionary_cache_skipped',
        'lookup_failed',
        err instanceof Error ? err.message : err,
      );
    }
    return {
      serviceClient,
      foundByOrder: new Map(),
      missing: extracted.exercises,
    };
  }
}

export async function runExtractAndEnrichChain(
  prepared: PreparedWorkoutChainRequest,
  creds: VertexAICredentials,
  shouldLog: boolean,
): Promise<{ ok: true; data: WorkoutChainGenerationResponse } | { ok: false; response: Response }> {
  if (!isVertexCreds(creds)) return { ok: false, response: creds.error };

  const { projectId, region, accessToken } = creds;
  const { persona } = prepared;

  if (shouldLog) console.warn('[generate-workout-chain] Kanban path: Extract (Step A)...');
  const extractPrompt = buildExtractWorkoutFromBriefPrompt(persona);
  const extractSystem =
    'You are a workout text extractor. Output ONLY valid JSON matching the user schema. Never invent exercises.';
  const extractResponse = await callVertexAI({
    systemPrompt: extractSystem,
    userPrompt: extractPrompt,
    accessToken,
    projectId,
    region,
    temperature: 0.1,
    maxTokens: 4096,
    logPrefix: '[generate-workout-chain][kanban-extract]',
  });

  const extractParsed = parseJSONWithRepair(extractResponse);
  const extractValidation = validateExtractWorkoutFromBriefOutput(extractParsed.data);
  if (!extractValidation.valid) {
    return {
      ok: false,
      response: new Response(
        JSON.stringify({ error: `Kanban extract (Step A) failed: ${extractValidation.error}` }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      ),
    };
  }
  const extracted = extractValidation.data;

  const { serviceClient, foundByOrder, missing } = await resolveDictionarySplit(
    extracted,
    shouldLog,
  );
  const partialExtract: KanbanExtractBriefOutput = {
    workout_title: extracted.workout_title,
    workout_description: extracted.workout_description,
    exercises: missing,
  };
  const extractIsPartialSubset = missing.length > 0 && missing.length < extracted.exercises.length;

  let vertexEnrich: KanbanEnrichBiomechanicsOutput | null = null;

  if (missing.length > 0) {
    if (shouldLog) console.warn('[generate-workout-chain] Kanban path: Enrich (Step B)...');
    const enrichPrompt = buildEnrichWorkoutBiomechanicsPrompt(partialExtract, persona.medical, {
      extractIsPartialSubset,
    });
    const enrichSystem =
      'You are a strength coach and biomechanics specialist. Output ONLY valid JSON. Never change prescription fields from the extract.';
    const enrichResponse = await callVertexAI({
      systemPrompt: enrichSystem,
      userPrompt: enrichPrompt,
      accessToken,
      projectId,
      region,
      temperature: 0.35,
      maxTokens: 8192,
      timeoutMs: 120000,
      logPrefix: '[generate-workout-chain][kanban-enrich]',
    });

    const enrichParsed = parseJSONWithRepair(enrichResponse);
    const enrichValidation = validateEnrichWorkoutBiomechanicsOutput(
      enrichParsed.data,
      partialExtract,
    );
    if (!enrichValidation.valid) {
      return {
        ok: false,
        response: new Response(
          JSON.stringify({ error: `Kanban enrich (Step B) failed: ${enrichValidation.error}` }),
          { status: 500, headers: { 'Content-Type': 'application/json' } },
        ),
      };
    }
    vertexEnrich = enrichValidation.data;
  } else if (shouldLog) {
    console.warn(
      '[generate-workout-chain] Kanban path: Enrich (Step B) skipped (exercise_dictionary cache hit).',
    );
  }

  let enriched;
  try {
    enriched = mergeKanbanEnrichFromDictionaryAndVertex(extracted, foundByOrder, vertexEnrich);
  } catch (err) {
    return {
      ok: false,
      response: new Response(
        JSON.stringify({
          error: `Kanban enrich merge failed: ${err instanceof Error ? err.message : String(err)}`,
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      ),
    };
  }

  const vertexEnrichedOrders = new Set(missing.map((e) => e.order));
  if (serviceClient && vertexEnrichedOrders.size > 0) {
    const byOrder = new Map(enriched.exercises.map((e) => [e.order, e]));
    for (const order of vertexEnrichedOrders) {
      const ex = extracted.exercises.find((e) => e.order === order);
      const en = byOrder.get(order);
      if (!ex || !en) continue;
      try {
        await insertExerciseDictionaryPendingFromEnrichment(serviceClient, ex.exercise_name, en);
      } catch (err) {
        if (shouldLog) {
          console.warn(
            'exercise_dictionary_insert_failed',
            order,
            ex.exercise_name,
            err instanceof Error ? err.message : err,
          );
        }
      }
    }
  }

  const workoutInSet = buildWorkoutInSetFromKanbanExtract(extracted, persona);
  const taskExercises: WorkoutExercise[] = mergeKanbanExtractEnrichToTaskExercises(
    extracted,
    enriched,
  );

  const workoutSet: WorkoutSetTemplate = normalizeWorkoutSet({
    title: workoutInSet.title,
    description: workoutInSet.description,
    difficulty: persona.demographics.experienceLevel as 'beginner' | 'intermediate' | 'advanced',
    workouts: [workoutInSet],
  });

  const chain_metadata = {
    pipeline: 'kanban_extract_enrich' as const,
    extract_workout_from_brief: extracted,
    enrich_workout_biomechanics: enriched,
    generated_at: new Date().toISOString(),
    model_used: 'vertex-ai',
  };

  return {
    ok: true,
    data: {
      workoutSet,
      chain_metadata,
      taskExercises,
    },
  };
}
