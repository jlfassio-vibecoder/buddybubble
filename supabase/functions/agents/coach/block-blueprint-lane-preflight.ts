/**
 * Lane 1 (deterministic) + Lane 2 (exercise-fill micro-call) preflight for `:` composer.
 * Intercepts before full COACH_RESPONSE_SCHEMA.
 */

import type { DispatcherEnv } from '../../_shared/env.ts';
import { AGENT_CREATE_CARD_CANONICAL_NULL_PATCHES } from '../../_shared/dispatch/rpc.ts';
import type { DispatchContext, PreflightAction } from '../../_shared/dispatch/types.ts';
import { log } from '../../_shared/obs/log.ts';
import {
  classifyError,
  extractGeminiText,
  generateContent,
} from '../../_shared/llm/vertex-gemini.ts';
import type { GeminiContent } from '../../_shared/llm/types.ts';
import {
  COACH_MODEL_DEFAULT,
  COACH_SAFE_REPLY_TEXT,
  COACH_SLUG,
  COACH_TEMPERATURE,
} from './config.ts';
import {
  buildBlockExerciseFillSystemPrompt,
  buildBlockExerciseFillUserText,
} from './block-exercise-fill-prompts.ts';
import { COACH_BLOCK_EXERCISE_FILL_SCHEMA } from './block-exercise-fill-schema.ts';
import type { BlockExerciseFillResponse } from './block-exercise-fill-schema.ts';
import {
  blockMeetsExerciseCardinality,
  buildDeterministicCoachBlocks,
  buildMergedTaskMetadataForBlockAppend,
  resolveBlockBlueprintRouterGate,
  templateBlockAppendReply,
} from './block-blueprint-router.ts';
import type { BlockFormat } from './block-blueprint-library.ts';
import { hydrateEmomAlternatingStations, validateBlockShape } from './block-blueprint-library.ts';
import { parseBlockBlueprintMentionsFromMetadata } from './block-blueprint-mentions.ts';
import { parseExerciseMentionsFromMetadata } from './exercise-mentions.ts';
import {
  mergeBlueprintShellsWithModelBlocks,
  summarizeWorkoutContextForRailBlockAppend,
  synthesizeProposedBlocksFromMentions,
} from './block-blueprint-synthesize.ts';
import {
  loadCurrentTaskContext,
  resolveCoachTaskMetadataForMerge,
  resolveCurrentWorkoutContextJsonFromThread,
  resolveKnownTargetTaskId,
} from './context.ts';
import { isCoachRailSurfaceFromMessageMetadata } from './prompts.ts';
import { COACH_WORKOUT_GREETING_SCHEMA } from './schema.ts';
import { stripMarkdownCodeFences } from './parse.ts';

const LANE2_MAX_OUTPUT_TOKENS = 1024;
const LANE2_THINKING_BUDGET = 256;
const LANE2_TIMEOUT_MS = 12_000;
const LANE1_MICRO_REPLY_TIMEOUT_MS = 5_000;

function persistPreflightAction(
  lane: 'block_append_deterministic' | 'block_append_exercise_fill',
  replyText: string,
  knownTargetTaskId: string,
  p_new_metadata: Record<string, unknown>,
): PreflightAction {
  return {
    kind: 'short_circuit_with_persist',
    lane,
    replyText,
    rpc: 'agent_update_task_and_reply',
    rpcArgs: {
      p_target_task_id: knownTargetTaskId,
      p_reply_text: replyText,
      p_new_title: null,
      p_new_description: null,
      p_new_metadata,
      p_card_action: null,
    },
  };
}

async function maybePolishLane1Reply(
  ctx: DispatchContext,
  env: DispatcherEnv,
  templateReply: string,
  userMessage: string,
  blocksSummary: string,
): Promise<string> {
  if (!env.COACH_BLOCK_APPEND_MICRO_REPLY) return templateReply;
  try {
    const response = await generateContent({
      project: env.GCP_PROJECT_ID,
      location: env.GCP_LOCATION,
      model: COACH_MODEL_DEFAULT,
      systemPrompt:
        'Rewrite the template confirmation into one friendly Coach chat line (2 sentences max). Do not change exercise names or block structure.',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `Template: ${templateReply}\nUser asked: ${userMessage}\nBlocks: ${blocksSummary}`,
            },
          ],
        },
      ] as GeminiContent[],
      generationConfig: {
        temperature: 0.35,
        maxOutputTokens: 256,
        responseMimeType: 'application/json',
        responseSchema: COACH_WORKOUT_GREETING_SCHEMA,
      },
      timeoutMs: LANE1_MICRO_REPLY_TIMEOUT_MS,
      signal: ctx.signal,
      env: { GCP_SERVICE_ACCOUNT_JSON: env.GCP_SERVICE_ACCOUNT_JSON },
      slug: COACH_SLUG,
      requestId: ctx.requestId,
    });
    const text = extractGeminiText(response.candidates?.[0]);
    const cleaned = stripMarkdownCodeFences(text);
    const parsed = JSON.parse(cleaned) as { reply_content?: string };
    const rc = typeof parsed.reply_content === 'string' ? parsed.reply_content.trim() : '';
    if (rc.length > 0) return rc;
  } catch (err) {
    log('warn', 'coach block append micro reply failed', {
      request_id: ctx.requestId,
      slug: COACH_SLUG,
      error_kind: classifyError(err),
    });
  }
  return templateReply;
}

function parseExerciseFillResponse(text: string): BlockExerciseFillResponse | null {
  try {
    const cleaned = stripMarkdownCodeFences(text);
    const parsed = JSON.parse(cleaned) as BlockExerciseFillResponse;
    if (!parsed || !Array.isArray(parsed.blocks)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function blocksMeetCardinality(
  shells: ReturnType<typeof synthesizeProposedBlocksFromMentions>,
): boolean {
  for (const shell of shells) {
    const count = Array.isArray(shell.exercises) ? shell.exercises.length : 0;
    if (!blockMeetsExerciseCardinality(shell.block_format as BlockFormat, count)) return false;
    let formatParams = shell.format_params as Record<string, unknown>;
    if (shell.block_format === 'emom') {
      formatParams = hydrateEmomAlternatingStations(count, formatParams);
    }
    const shape = validateBlockShape(shell.block_format as BlockFormat, count, formatParams);
    if (shape != null) return false;
  }
  return true;
}

async function runLane2ExerciseFill(
  ctx: DispatchContext,
  env: DispatcherEnv,
  gate: Extract<ReturnType<typeof resolveBlockBlueprintRouterGate>, { eligible: true }>,
  taskMetadataForContext: unknown,
  workoutContextJson: string | null,
): Promise<PreflightAction | 'lane2_failed'> {
  const shells = synthesizeProposedBlocksFromMentions(gate.blockMentions);
  const summary = workoutContextJson
    ? summarizeWorkoutContextForRailBlockAppend(workoutContextJson)
    : null;
  const userMessage = typeof ctx.message.content === 'string' ? ctx.message.content : '';

  try {
    const response = await generateContent({
      project: env.GCP_PROJECT_ID,
      location: env.GCP_LOCATION,
      model: COACH_MODEL_DEFAULT,
      systemPrompt: buildBlockExerciseFillSystemPrompt(),
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: buildBlockExerciseFillUserText({
                userMessage,
                shells,
                workoutIndexSummary: summary,
              }),
            },
          ],
        },
      ] as GeminiContent[],
      generationConfig: {
        temperature: COACH_TEMPERATURE,
        maxOutputTokens: LANE2_MAX_OUTPUT_TOKENS,
        responseMimeType: 'application/json',
        responseSchema: COACH_BLOCK_EXERCISE_FILL_SCHEMA,
        thinkingConfig: { thinkingBudget: LANE2_THINKING_BUDGET },
      },
      timeoutMs: LANE2_TIMEOUT_MS,
      signal: ctx.signal,
      env: { GCP_SERVICE_ACCOUNT_JSON: env.GCP_SERVICE_ACCOUNT_JSON },
      slug: COACH_SLUG,
      requestId: ctx.requestId,
    });

    const text = extractGeminiText(response.candidates?.[0]);
    if (!text?.trim()) return 'lane2_failed';

    const fill = parseExerciseFillResponse(text);
    if (!fill) return 'lane2_failed';

    const merged = mergeBlueprintShellsWithModelBlocks(shells, fill.blocks);
    if (!blocksMeetCardinality(merged)) return 'lane2_failed';

    const { p_new_metadata, mergeLog } = buildMergedTaskMetadataForBlockAppend(
      taskMetadataForContext,
      merged,
    );

    log('info', 'coach block append lane2 merge', {
      request_id: ctx.requestId,
      slug: COACH_SLUG,
      merge_touched: mergeLog.touched,
      merge_drops: mergeLog.drops,
    });

    const replyText = templateBlockAppendReply(merged);
    return persistPreflightAction(
      'block_append_exercise_fill',
      replyText,
      gate.knownTargetTaskId,
      p_new_metadata,
    );
  } catch (err) {
    log('warn', 'lane2_exercise_fill_failed', {
      request_id: ctx.requestId,
      slug: COACH_SLUG,
      error_kind: classifyError(err),
    });
    return 'lane2_failed';
  }
}

/**
 * Returns a preflight action for Lane 1/2, safe-reply short-circuit on Lane 2 failure,
 * or null to fall through to Lane 3 (full Coach).
 */
export async function tryBlockBlueprintLanePreflight(
  ctx: DispatchContext,
  env: DispatcherEnv,
): Promise<PreflightAction | null> {
  const blockMentions = parseBlockBlueprintMentionsFromMetadata(ctx.message.metadata);
  if (!blockMentions?.length) return null;

  const isRailSurface = isCoachRailSurfaceFromMessageMetadata(ctx.message.metadata);
  if (!isRailSurface) return null;

  if (!ctx.message.bubble_id) return null;

  const knownTargetTaskId = await resolveKnownTargetTaskId(
    ctx.supabase as unknown as Parameters<typeof resolveKnownTargetTaskId>[0],
    ctx.message,
    ctx.history,
    ctx.requestId,
  );

  let taskMetadataForContext: unknown = null;
  if (knownTargetTaskId) {
    const row = await loadCurrentTaskContext(
      ctx.supabase as unknown as Parameters<typeof loadCurrentTaskContext>[0],
      knownTargetTaskId,
      ctx.message.bubble_id,
      ctx.requestId,
    );
    if (row) taskMetadataForContext = row.metadata;
  }

  const messageText = typeof ctx.message.content === 'string' ? ctx.message.content : '';
  const exerciseMentions = parseExerciseMentionsFromMetadata(ctx.message.metadata);

  const workoutContextJson = resolveCurrentWorkoutContextJsonFromThread(
    ctx.history,
    { metadata: ctx.message.metadata },
    taskMetadataForContext,
    { preferTaskMetadata: true, requestId: ctx.requestId },
  );

  const taskMetadataForMerge = resolveCoachTaskMetadataForMerge(
    taskMetadataForContext,
    workoutContextJson,
  );

  const gate = resolveBlockBlueprintRouterGate({
    isRailSurface,
    blockMentions,
    knownTargetTaskId,
    taskMetadataForContext: taskMetadataForMerge,
    coachMergeWorkoutMetadata: ctx.coachMergeWorkoutMetadata === true,
    messageText,
    exerciseMentions,
  });

  if (!gate.eligible) {
    if (blockMentions.length > 0) {
      log('info', 'coach block blueprint lane blocked', {
        request_id: ctx.requestId,
        slug: COACH_SLUG,
        reason: gate.reason,
        has_trigger_workout_context: workoutContextJson != null,
      });
    }
    return null;
  }

  if (gate.lane === 'lane2') {
    const lane2 = await runLane2ExerciseFill(
      ctx,
      env,
      gate,
      taskMetadataForMerge,
      workoutContextJson,
    );
    if (lane2 === 'lane2_failed') {
      return {
        kind: 'short_circuit_with_reply',
        replyText: COACH_SAFE_REPLY_TEXT,
        rpc: 'agent_create_card_and_reply',
        rpcArgs: {
          p_create_card: false,
          p_task_type: 'workout',
          p_task_status: 'todo',
          ...AGENT_CREATE_CARD_CANONICAL_NULL_PATCHES,
        },
      };
    }
    return lane2;
  }

  const blocks = buildDeterministicCoachBlocks(gate.assigned, messageText);
  const { p_new_metadata } = buildMergedTaskMetadataForBlockAppend(taskMetadataForMerge, blocks);
  const templateReply = templateBlockAppendReply(blocks);
  const replyText = await maybePolishLane1Reply(
    ctx,
    env,
    templateReply,
    messageText,
    JSON.stringify(blocks.map((b) => b.name)),
  );

  return persistPreflightAction(
    'block_append_deterministic',
    replyText,
    gate.knownTargetTaskId,
    p_new_metadata,
  );
}
