/**
 * Stage 2 enrich for parametric outline fill — coaching prose onto hydrated fill blocks.
 * Soft-fails so Stage 1 fill still returns a workout when enrich is unavailable.
 */

import type { PreparedWorkoutChainRequest } from '@/lib/workout-factory/prepare-workout-chain-request';
import { parseJSONWithRepair } from '@/lib/workout-factory/json-parser';
import {
  dictionaryRowsByNormalizedName,
  insertExerciseDictionaryPendingFromEnrichment,
  mergeKanbanEnrichFromDictionaryAndVertex,
  rpcExerciseDictionaryLookupByNames,
  splitExtractByDictionaryMatches,
} from '@/lib/workout-factory/exercise-dictionary-bridge';
import {
  buildEnrichWorkoutBiomechanicsPrompt,
  validateEnrichWorkoutBiomechanicsOutput,
} from '@/lib/workout-factory/prompt-chain/enrich-workout-biomechanics';
import { OUTLINE_FILL_VERTEX_MODEL } from '@/lib/workout-factory/outline-fill-config';
import type {
  KanbanEnrichBiomechanicsOutput,
  KanbanExtractBriefOutput,
  KanbanExtractedExercise,
} from '@/lib/workout-factory/types/kanban-extract-types';
import type { VertexAICredentials } from '@/lib/workout-factory/vertex-ai-client';
import { callVertexAI } from '@/lib/workout-factory/vertex-ai-client';
import { createServiceRoleClient } from '@/lib/supabase-service-role';
import type { ExerciseDictionaryRow } from '@/types/database';

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function stringifyRich(v: string | string[] | undefined): string | undefined {
  if (v == null) return undefined;
  if (Array.isArray(v)) {
    const parts = v.map((x) => (typeof x === 'string' ? x.trim() : '')).filter(Boolean);
    return parts.length > 0 ? parts.join('\n') : undefined;
  }
  const t = v.trim();
  return t.length > 0 ? t : undefined;
}

function isVertexCreds(
  creds: VertexAICredentials,
): creds is { projectId: string; region: string; accessToken: string } {
  return 'accessToken' in creds;
}

/** Flatten named exercises from hydrated outline blocks (same order as factory assemble). */
export function outlineHydratedBlocksToEnrichExtract(
  blocks: Record<string, unknown>[],
  title: string,
): KanbanExtractBriefOutput {
  const exercises: KanbanExtractedExercise[] = [];
  let order = 0;
  for (const blk of blocks) {
    const rawExercises = Array.isArray(blk.exercises) ? blk.exercises : [];
    for (const exRaw of rawExercises) {
      if (!isPlainObject(exRaw)) continue;
      const name = typeof exRaw.name === 'string' ? exRaw.name.trim() : '';
      if (!name) continue;
      order += 1;
      const row: KanbanExtractedExercise = {
        order,
        section: 'main',
        exercise_name: name,
      };
      if (typeof exRaw.sets === 'number' && Number.isFinite(exRaw.sets) && exRaw.sets > 0) {
        row.sets = Math.round(exRaw.sets);
      }
      if (typeof exRaw.reps === 'string' && exRaw.reps.trim()) row.reps = exRaw.reps.trim();
      else if (typeof exRaw.reps === 'number' && Number.isFinite(exRaw.reps)) {
        row.reps = String(exRaw.reps);
      }
      if (typeof exRaw.rest_seconds === 'number' && Number.isFinite(exRaw.rest_seconds)) {
        row.rest_seconds = exRaw.rest_seconds;
      }
      if (typeof exRaw.work_seconds === 'number' && Number.isFinite(exRaw.work_seconds)) {
        row.work_seconds = exRaw.work_seconds;
      }
      if (typeof exRaw.rpe === 'number' && Number.isFinite(exRaw.rpe)) row.rpe = exRaw.rpe;
      if (typeof exRaw.rounds === 'number' && Number.isFinite(exRaw.rounds) && exRaw.rounds > 0) {
        row.rounds = Math.round(exRaw.rounds);
      }
      exercises.push(row);
    }
  }
  return { workout_title: title, exercises };
}

/** Stamp enrich prose onto hydrated outline exercises by 1-based global order. */
export function applyEnrichToOutlineHydratedBlocks(
  blocks: Record<string, unknown>[],
  enrich: KanbanEnrichBiomechanicsOutput,
): void {
  const byOrder = new Map(enrich.exercises.map((en) => [en.order, en] as const));
  let order = 0;
  for (const blk of blocks) {
    const rawExercises = Array.isArray(blk.exercises) ? blk.exercises : [];
    for (const exRaw of rawExercises) {
      if (!isPlainObject(exRaw)) continue;
      const name = typeof exRaw.name === 'string' ? exRaw.name.trim() : '';
      if (!name) continue;
      order += 1;
      const en = byOrder.get(order);
      if (!en) continue;
      const instr = stringifyRich(en.detailed_instructions);
      if (instr) exRaw.instructions = instr;
      const form = stringifyRich(en.biomechanical_cues);
      if (form) exRaw.form_cues = form;
      const injury = stringifyRich(en.injury_prevention_tips);
      if (injury) exRaw.injury_prevention_tips = injury;
    }
  }
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
        '[generate-workout-chain][outline-enrich] dictionary cache skipped (service_role)',
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
        '[generate-workout-chain][outline-enrich] dictionary lookup failed',
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

/**
 * Run Kanban-compatible Stage 2 enrich for outline-filled exercises.
 * Returns null on soft failure (fill still succeeds without coaching prose).
 */
export async function runOutlineFillStage2Enrich(args: {
  prepared: PreparedWorkoutChainRequest;
  creds: VertexAICredentials;
  hydratedBlocks: Record<string, unknown>[];
  shouldLog: boolean;
  createdByUserId?: string | null;
}): Promise<KanbanEnrichBiomechanicsOutput | null> {
  const { prepared, creds, hydratedBlocks, shouldLog, createdByUserId } = args;
  if (!isVertexCreds(creds)) return null;

  const title = prepared.persona.title?.trim() || 'Workout';
  const extracted = outlineHydratedBlocksToEnrichExtract(hydratedBlocks, title);
  if (extracted.exercises.length === 0) return null;

  try {
    const { serviceClient, foundByOrder, missing } = await resolveDictionarySplit(
      extracted,
      shouldLog,
    );
    const partialExtract: KanbanExtractBriefOutput = {
      workout_title: extracted.workout_title,
      exercises: missing,
    };
    const extractIsPartialSubset =
      missing.length > 0 && missing.length < extracted.exercises.length;

    let vertexEnrich: KanbanEnrichBiomechanicsOutput | null = null;
    if (missing.length > 0) {
      if (shouldLog) {
        console.warn('[generate-workout-chain] Outline fill: Stage 2 enrich (Vertex)...');
      }
      const enrichPrompt = buildEnrichWorkoutBiomechanicsPrompt(
        partialExtract,
        prepared.persona.medical,
        {
          extractIsPartialSubset,
        },
      );
      const enrichResponse = await callVertexAI({
        systemPrompt:
          'You are a strength coach and biomechanics specialist. Output ONLY valid JSON. Never change prescription fields from the extract.',
        userPrompt: enrichPrompt,
        accessToken: creds.accessToken,
        projectId: creds.projectId,
        region: creds.region,
        model: OUTLINE_FILL_VERTEX_MODEL,
        temperature: 0.35,
        maxTokens: 8192,
        timeoutMs: 120000,
        logPrefix: '[generate-workout-chain][outline-enrich]',
      });
      const enrichParsed = parseJSONWithRepair(enrichResponse);
      const enrichValidation = validateEnrichWorkoutBiomechanicsOutput(
        enrichParsed.data,
        partialExtract,
      );
      if (!enrichValidation.valid) {
        if (shouldLog) {
          console.warn(
            '[generate-workout-chain] Outline fill: Stage 2 enrich validation failed:',
            enrichValidation.error,
          );
        }
        return null;
      }
      vertexEnrich = enrichValidation.data;
    } else if (shouldLog) {
      console.warn(
        '[generate-workout-chain] Outline fill: Stage 2 enrich skipped (exercise_dictionary cache hit).',
      );
    }

    const enriched = mergeKanbanEnrichFromDictionaryAndVertex(
      extracted,
      foundByOrder,
      vertexEnrich,
    );

    const vertexEnrichedOrders = new Set(missing.map((e) => e.order));
    if (serviceClient && vertexEnrichedOrders.size > 0) {
      const byOrder = new Map(enriched.exercises.map((e) => [e.order, e]));
      for (const order of vertexEnrichedOrders) {
        const ex = extracted.exercises.find((e) => e.order === order);
        const en = byOrder.get(order);
        if (!ex || !en) continue;
        try {
          await insertExerciseDictionaryPendingFromEnrichment(
            serviceClient,
            ex.exercise_name,
            en,
            createdByUserId,
          );
        } catch (err) {
          if (shouldLog) {
            console.warn(
              '[generate-workout-chain][outline-enrich] dictionary insert failed',
              order,
              ex.exercise_name,
              err instanceof Error ? err.message : err,
            );
          }
        }
      }
    }

    applyEnrichToOutlineHydratedBlocks(hydratedBlocks, enriched);
    return enriched;
  } catch (err) {
    if (shouldLog) {
      console.warn(
        '[generate-workout-chain] Outline fill: Stage 2 enrich soft-failed:',
        err instanceof Error ? err.message : err,
      );
    }
    return null;
  }
}
