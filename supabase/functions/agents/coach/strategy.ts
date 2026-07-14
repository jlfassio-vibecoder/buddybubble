/**
 * Coach `AgentStrategy<CoachGeminiJsonResponse>` — Deno-only.
 *
 * Wires together the pure modules (`config`, `schema`, `prompts`, `parse`,
 * `server-guards`) with the DB-coupled context loaders (`context.ts`) and the shared
 * Vertex / RPC helpers under `_shared/`.
 *
 * Lift map (legacy → here):
 *   - workout-context preflight: bubble-agent-dispatch/index.ts:1479-1544
 *   - buildSystemPrompt assembly: bubble-agent-dispatch/index.ts:1599-1645
 *   - buildContents (history filter + role assignment): index.ts:1647-1663
 *   - persist (draft vs card branch): index.ts:1773-1824
 *
 * `ctx.extras.coach` namespacing keeps request-scoped fields adjacent to the strategy
 * that owns them. Schema:
 *
 *   ctx.extras.coach: {
 *     knownTargetTaskId: string | null;
 *     priorUserMessageCount: number;        // computed in applyServerGuards
 *     currentWorkoutContextJson: string | null;
 *     taskMetadataForContext: unknown | null;
 *     exerciseDictionaryByIndex: Record<number, { dictionary_id; slug } | null> | null;
 *   }
 */

import { readDispatcherEnv } from '../../_shared/env.ts';
import { computeLlmBudgetMs } from '../../_shared/dispatch/llm-budget.ts';
import { log } from '../../_shared/obs/log.ts';
import {
  agentCreateCardAndReply,
  agentInsertCoachWorkoutDraftReply,
  agentUpdateTaskAndReply,
  AGENT_CREATE_CARD_CANONICAL_NULL_PATCHES,
} from '../../_shared/dispatch/rpc.ts';
import {
  applyCoachWorkoutOutlineToTaskMetadata,
  mergeCoachProposedIntoTaskMetadata,
} from '../../_shared/workout-metadata/merge-coach-proposed-into-task-metadata.ts';
import { syncCoachOutlineFromRichMetadata } from '../../_shared/workout-metadata/factory-session-to-coach-outline.ts';
import {
  shouldExcludeWorkoutSentinelFromHistory,
  isWorkoutContextSentinel,
  WORKOUT_CONTEXT_LEGACY_SENTINEL,
  extractWorkoutOpenSessionId,
  countPriorWorkoutOpenSentinels,
} from '../../_shared/dispatch/sentinel.ts';
import type {
  AgentStrategy,
  DispatchContext,
  RpcEnvelope,
  SupabaseClient as SharedSupabaseClient,
} from '../../_shared/dispatch/types.ts';
import type { GeminiContent, VertexGenerateResponse } from '../../_shared/llm/types.ts';
import {
  classifyError,
  extractGeminiText,
  generateContent,
} from '../../_shared/llm/vertex-gemini.ts';

import {
  ACTIVE_WORKOUT_EXECUTION_STATE_DIRECTIVE,
  COACH_HISTORY_LIMIT,
  COACH_CUE_MAX_OUTPUT_TOKENS,
  COACH_CUE_THINKING_BUDGET,
  COACH_MAX_OUTPUT_TOKENS,
  COACH_MODEL_DEFAULT,
  COACH_OUTLINE_ONLY_MAX_OUTPUT_TOKENS,
  COACH_OUTLINE_ONLY_MODEL,
  COACH_OUTLINE_ONLY_TEMPERATURE,
  COACH_SAFE_REPLY_TEXT,
  COACH_SLUG,
  COACH_TEMPERATURE,
  COACH_THINKING_BUDGET,
  COACH_WORKOUT_GREETING_MAX_OUTPUT_TOKENS,
  COACH_WORKOUT_GREETING_TEMPERATURE,
  MID_WORKOUT_SUPPORT_MODE_DIRECTIVE,
  SESSION_TELEMETRY_GROUND_TRUTH_DIRECTIVE,
  resolveCoachThinkingBudget,
} from './config.ts';
import { readTaskModalOutlineDraftFromMessageMetadata } from './build-outline-draft-context.ts';
import {
  applyOutlineDraftPatch,
  buildOutlineDraftAppliedPayload,
  outlineDraftAppliedForRpc,
  outlineDraftPatchStaleReason,
} from './outline-draft-patch.ts';
import { ensureOutlineExercisePlaceholders } from './outline-exercise-placeholders.ts';
import { readCoachOutlineMetadata } from './coach-outline-metadata.ts';
import {
  buildBlockBlueprintLibraryPrompt,
  shouldInjectBlockBlueprintLibrary,
  userMessageShowsDraftIntent,
} from './block-blueprint-library.ts';
import {
  fetchCoachUserContext,
  hasRichWorkoutSetMetadata,
  loadCurrentTaskContext,
  resolveCoachTaskMetadataForMerge,
  resolveCurrentWorkoutContextJsonFromThread,
  resolveKnownTargetTaskId,
  resolveActiveSessionSurfaceForCoachPrompt,
  resolveSessionTelemetryForCoachPrompt,
  type SessionTelemetryResolveSource,
  extractWorkoutTaskTitleFromMetadata,
  readWorkoutContextFromMessageMetadata,
  stringifyWorkoutContextForPrompt,
  fetchFitnessProfileBiometrics,
} from './context.ts';
import {
  cardActionForRpc,
  CoachGeminiJsonResponse,
  executionPatchForRpc,
  parseCoachJson,
  personalCuesPatchForRpc,
  stripMarkdownCodeFences,
  taskModalIntakePatchForRpc,
  workoutCuesPatchForRpc,
} from './parse.ts';
import {
  formatTaggedExerciseRefsPromptBlock,
  parseExerciseMentionsFromMetadata,
  resolveExerciseMentionLines,
} from './exercise-mentions.ts';
import {
  formatBlockBlueprintRefsPromptBlock,
  parseBlockBlueprintMentionsFromMetadata,
} from './block-blueprint-mentions.ts';
import {
  mergeBlueprintShellsWithModelBlocks,
  summarizeWorkoutContextForRailBlockAppend,
  synthesizeProposedBlocksFromMentions,
} from './block-blueprint-synthesize.ts';
import {
  shouldSynthesizeOutlineDraftPatch,
  synthesizeOutlineDraftPatchFromBlockIntent,
} from './outline-draft-patch-synthesize.ts';
import { loadExerciseDictionaryByIndex } from './exercise-dictionary-by-index.ts';
import {
  buildApexArchitectMainChatBlock,
  buildBaseCoachPrompt,
  buildCurrentTaskContextBlock,
  buildExerciseCueRequestCoachBlock,
  buildTaskModalIntakeUiCoachBlock,
  buildTaskModalLiveStateBlock,
  buildWorkoutOpenGreetingPrompt,
  buildWorkoutOpenGreetingUserText,
  buildWorkoutStructureBlockFromContextJson,
  formatExerciseIndexMap,
  isCoachRailSurfaceFromMessageMetadata,
  readTaskModalLiveStateFromMessageMetadata,
  resolveOutlineDraftPromptParts,
  shouldSuppressTaskModalIntakeForOutlineCoPilot,
  shouldSuppressTaskModalIntakeForPreflightReadiness,
  buildSessionReadinessContextBlock,
  readSessionReadinessContextFromMessageMetadata,
  taskMetadataLooksWorkoutShaped,
  WORKOUT_CONTEXT_HEADER,
  type ExerciseDictionaryIndexEntry,
} from './prompts.ts';
import {
  COACH_EXERCISE_CUE_RESPONSE_SCHEMA,
  COACH_MAIN_CHAT_RESPONSE_SCHEMA,
  COACH_OUTLINE_ONLY_SCHEMA,
  COACH_RESPONSE_SCHEMA,
  COACH_WORKOUT_GREETING_SCHEMA,
} from './schema.ts';
import {
  applyCoachServerGuards,
  stripStructuralWritesForWorkoutCuePatch,
  type CoachGuardsFragment,
} from './server-guards.ts';
import { tryBlockBlueprintLanePreflight } from './block-blueprint-lane-preflight.ts';
import { inferCardActionTriggerGeneration } from './card-action-infer.ts';
import {
  buildCoachOutlinePhaseBPrompts,
  coachOutlinePhaseBSkipReason,
  processCoachOutlinePhaseBVertexOutput,
} from './run-coach-outline-phase-b.ts';
import { mergeCoachOutlineMetadataPatch } from './coach-outline-metadata.ts';
import {
  formatSessionTelemetryForPrompt,
  parseSessionTelemetryFromMetadata,
} from './session-telemetry-format.ts';
import {
  readInjuriesOnFileFromBiometrics,
  resolveExerciseCueRequestForDispatch,
} from './exercise-cue-request.ts';
import { coalesceWorkoutCuesPatchFromPersonalFallback } from './workout-cues-patch.ts';
import { buildTaskMetadataDeltaForWorkoutCuePatch } from './workout-cue-metadata-merge.ts';

/** Coach-owned scratch on `ctx.extras`. */
type CoachExtras = {
  knownTargetTaskId: string | null;
  currentWorkoutContextJson: string | null;
  taskMetadataForContext: unknown | null;
  exerciseDictionaryByIndex: Record<number, ExerciseDictionaryIndexEntry | null> | null;
  sessionTelemetrySource?: SessionTelemetryResolveSource;
  sessionTelemetryBlock?: string | null;
  outlinePhaseB?: {
    attempted: boolean;
    ok: boolean;
    error?: string;
    drops?: import('./parse.ts').BlockShapeDrop[];
  };
  outlineCoPilotActive?: boolean;
  triggerOutlineRevision?: number | null;
  exerciseCueRequestActive?: boolean;
};

const FALLBACK_WORKOUT_GREETING = "Good to see you back in the gym! Let's get to work.";

/** True when the **trigger** row indicates a live workout session (not task-row metadata alone). */
function isTriggerActiveWorkoutSession(
  message: Pick<DispatchContext['message'], 'content' | 'metadata'>,
): boolean {
  if (isCoachRailSurfaceFromMessageMetadata(message.metadata)) return false;
  if (isWorkoutContextSentinel(message)) return true;
  const c = message.content;
  if (typeof c === 'string' && c.trim() === WORKOUT_CONTEXT_LEGACY_SENTINEL) return true;
  const m = message.metadata;
  if (m != null && typeof m === 'object' && !Array.isArray(m)) {
    const o = m as Record<string, unknown>;
    const wc = o.workoutContext ?? o.workout_context;
    if (wc != null && typeof wc === 'object' && !Array.isArray(wc)) return true;
  }
  return false;
}

function readCoachExtras(ctx: DispatchContext): CoachExtras {
  const raw = (ctx.extras?.coach ?? {}) as Partial<CoachExtras>;
  return {
    knownTargetTaskId: typeof raw.knownTargetTaskId === 'string' ? raw.knownTargetTaskId : null,
    currentWorkoutContextJson:
      typeof raw.currentWorkoutContextJson === 'string' ? raw.currentWorkoutContextJson : null,
    taskMetadataForContext: raw.taskMetadataForContext ?? null,
    exerciseDictionaryByIndex:
      raw.exerciseDictionaryByIndex != null && typeof raw.exerciseDictionaryByIndex === 'object'
        ? (raw.exerciseDictionaryByIndex as Record<number, ExerciseDictionaryIndexEntry | null>)
        : null,
    sessionTelemetrySource:
      raw.sessionTelemetrySource === 'message' ||
      raw.sessionTelemetrySource === 'workout_log' ||
      raw.sessionTelemetrySource === 'none'
        ? raw.sessionTelemetrySource
        : undefined,
    sessionTelemetryBlock:
      typeof raw.sessionTelemetryBlock === 'string' ? raw.sessionTelemetryBlock : null,
    outlineCoPilotActive: raw.outlineCoPilotActive === true,
    triggerOutlineRevision:
      typeof raw.triggerOutlineRevision === 'number' && Number.isFinite(raw.triggerOutlineRevision)
        ? Math.max(0, Math.floor(raw.triggerOutlineRevision))
        : null,
    exerciseCueRequestActive: raw.exerciseCueRequestActive === true,
  };
}

function writeCoachExtras(ctx: DispatchContext, extras: CoachExtras): void {
  if (!ctx.extras) {
    // Defensive: dispatcher initializes to {}; this fallback keeps the strategy correct
    // if a future caller forgets.
    (ctx as DispatchContext & { extras: Record<string, unknown> }).extras = {};
  }
  ctx.extras![COACH_SLUG] = extras;
}

function priorUserMessageCount(ctx: DispatchContext): number {
  const agentAuthIds = new Set<string>([ctx.agent.auth_user_id]);
  let count = 0;
  for (const row of ctx.history) {
    if (row.user_id && !agentAuthIds.has(row.user_id)) count += 1;
  }
  return count;
}

function proposedMetaHasParametricBlocks(meta: Record<string, unknown> | null): boolean {
  if (meta == null) return false;
  const blocks = meta.blocks;
  return Array.isArray(blocks) && blocks.length > 0;
}

/**
 * STEP 1 quarantine removed — Hop 2 eligibility is logged via coachOutlinePhaseBSkipReason.
 */
function outlinePhaseBCardFields(parsed: CoachGeminiJsonResponse): {
  title: string;
  description: string;
} {
  if (parsed.create_card) {
    return {
      title: parsed.task_title?.trim() ?? '',
      description: parsed.task_description?.trim() ?? '',
    };
  }
  return {
    title: parsed.updated_task_title?.trim() ?? '',
    description: parsed.updated_task_description?.trim() ?? '',
  };
}

async function patchTaskOutlineMetadataFields(
  supabase: SharedSupabaseClient,
  taskId: string,
  patch: Parameters<typeof mergeCoachOutlineMetadataPatch>[1],
): Promise<void> {
  const { data: row, error: fetchErr } = await supabase
    .from('tasks')
    .select('metadata')
    .eq('id', taskId)
    .maybeSingle();
  if (fetchErr || !row) {
    log('warn', 'coach outline metadata patch skipped — task fetch failed', {
      task_id: taskId,
      error: fetchErr?.message,
    });
    return;
  }
  const next = mergeCoachOutlineMetadataPatch(row.metadata, patch);
  const { error: updErr } = await supabase
    .from('tasks')
    .update({ metadata: next })
    .eq('id', taskId);
  if (updErr) {
    log('warn', 'coach outline metadata patch failed', {
      task_id: taskId,
      error: updErr.message,
    });
  }
}

export const CoachStrategy: AgentStrategy<CoachGeminiJsonResponse> = {
  slug: COACH_SLUG,
  model: COACH_MODEL_DEFAULT,
  temperature: COACH_TEMPERATURE,
  maxOutputTokens: COACH_MAX_OUTPUT_TOKENS,
  responseSchema: COACH_RESPONSE_SCHEMA,
  safeReplyText: COACH_SAFE_REPLY_TEXT,
  // Cap the LLM-input thread history at the most recent COACH_HISTORY_LIMIT
  // rows. The dispatcher (`agent-dispatch/handler.ts`) forwards this to
  // `buildDispatchContext`, which both bounds the DB query AND tail-slices any
  // pre-loaded resolver history. The shared
  // `_shared/dispatch/history.ts:DEFAULT_HISTORY_LIMIT` (50) remains in force
  // for `agent-dispatch/resolve.ts:327` so authoring-agent discovery in long
  // threads is unaffected.
  historyLimit: COACH_HISTORY_LIMIT,

  routing: {
    acceptMention: true,
    acceptRootDefault: true,
    acceptThreadContinuation: true,
    requireBubbleBinding: true,
    implicitTrigger: isWorkoutContextSentinel,
  },

  /**
   * Workout-player silent-greeting preflight. Returns `short_circuit_with_reply` so the
   * dispatcher persists the greeting via `agent_create_card_and_reply` (no card) and
   * exits before running the main JSON-mode call.
   */
  async preflight(ctx) {
    if (isWorkoutContextSentinel(ctx.message)) {
      const env = readDispatcherEnv();
      const meta = (ctx.message.metadata ?? {}) as Record<string, unknown>;
      const workoutTitle = extractWorkoutTaskTitleFromMetadata(meta);
      const workoutJson = stringifyWorkoutContextForPrompt(meta['workoutContext']);

      const openSessionId = extractWorkoutOpenSessionId(meta);
      if (
        openSessionId &&
        countPriorWorkoutOpenSentinels(ctx.history, openSessionId, ctx.message.id) > 0
      ) {
        return { kind: 'skip', reason: 'duplicate_workout_open_sentinel' };
      }

      let userContextBlock: string | null = null;
      if (ctx.message.bubble_id) {
        try {
          // deno-lint-ignore no-explicit-any
          userContextBlock = await fetchCoachUserContext(
            ctx.supabase as unknown as Parameters<typeof fetchCoachUserContext>[0],
            ctx.message.user_id,
            ctx.message.bubble_id,
            ctx.requestId,
          );
        } catch (err) {
          log('warn', 'coach preflight user context failed', {
            request_id: ctx.requestId,
            slug: COACH_SLUG,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      const isoNow = new Date().toISOString();
      const readiness = readSessionReadinessContextFromMessageMetadata(meta);
      const sessionReadinessBlock = readiness ? buildSessionReadinessContextBlock(readiness) : null;

      let sessionTelemetryBlock: string | null = null;
      let workoutStructureBlock: string | null = null;
      let systemPrompt = '';
      let userText = buildWorkoutOpenGreetingUserText(workoutJson, null);

      try {
        const telemetrySnapshot = parseSessionTelemetryFromMetadata(meta);
        const formattedTelemetry = telemetrySnapshot
          ? formatSessionTelemetryForPrompt(telemetrySnapshot, { activeSession: true })
          : '';
        sessionTelemetryBlock = formattedTelemetry.trim() ? formattedTelemetry : null;
        let workoutStructureSourceJson = '';
        try {
          workoutStructureSourceJson = JSON.stringify(meta['workoutContext'] ?? null);
        } catch {
          workoutStructureSourceJson = '';
        }
        workoutStructureBlock = buildWorkoutStructureBlockFromContextJson(
          workoutStructureSourceJson,
        );
        const readinessJson = readiness ? JSON.stringify(readiness) : null;
        userText = buildWorkoutOpenGreetingUserText(workoutJson, readinessJson);
        systemPrompt = buildWorkoutOpenGreetingPrompt({
          workoutTitle,
          isoNow,
          userContextBlock,
          sessionReadinessBlock,
          workoutStructureBlock,
          sessionTelemetryBlock,
        });
      } catch (err) {
        log('error', 'coach workout greeting context assembly failed', {
          request_id: ctx.requestId,
          slug: COACH_SLUG,
          error: err instanceof Error ? err.message : String(err),
        });
        const readinessJson = readiness ? JSON.stringify(readiness) : null;
        userText = buildWorkoutOpenGreetingUserText(workoutJson, readinessJson);
        systemPrompt = buildWorkoutOpenGreetingPrompt({
          workoutTitle,
          isoNow,
          userContextBlock,
          sessionReadinessBlock,
          workoutStructureBlock: null,
          sessionTelemetryBlock: null,
        });
      }

      let replyText = FALLBACK_WORKOUT_GREETING;
      try {
        const response = await generateContent({
          project: env.GCP_PROJECT_ID,
          location: env.GCP_LOCATION,
          model: COACH_MODEL_DEFAULT,
          systemPrompt,
          contents: [{ role: 'user', parts: [{ text: userText }] }] as GeminiContent[],
          generationConfig: {
            temperature: COACH_WORKOUT_GREETING_TEMPERATURE,
            maxOutputTokens: COACH_WORKOUT_GREETING_MAX_OUTPUT_TOKENS,
            responseMimeType: 'application/json',
            responseSchema: COACH_WORKOUT_GREETING_SCHEMA,
          },
          timeoutMs: env.LLM_TIMEOUT_MS,
          signal: ctx.signal,
          env: { GCP_SERVICE_ACCOUNT_JSON: env.GCP_SERVICE_ACCOUNT_JSON },
        });
        const text = extractGeminiText(response.candidates?.[0]);
        const cleaned = stripMarkdownCodeFences(text);
        try {
          const parsed = JSON.parse(cleaned) as Record<string, unknown>;
          const rc = parsed.reply_content;
          const cleanedReply = typeof rc === 'string' ? rc.trim() : '';
          if (cleanedReply.length > 0) {
            replyText = cleanedReply;
          } else {
            log('warn', 'coach workout greeting empty reply_content', {
              request_id: ctx.requestId,
              slug: COACH_SLUG,
              response_length: cleaned.length,
            });
          }
        } catch (parseErr) {
          log('warn', 'coach workout greeting parse fallback', {
            request_id: ctx.requestId,
            slug: COACH_SLUG,
            error: parseErr instanceof Error ? parseErr.message : String(parseErr),
          });
          replyText = FALLBACK_WORKOUT_GREETING;
        }
      } catch (err) {
        log('warn', 'coach workout greeting generate failed', {
          request_id: ctx.requestId,
          slug: COACH_SLUG,
          error_kind: classifyError(err),
        });
        replyText = FALLBACK_WORKOUT_GREETING;
      }

      return {
        kind: 'short_circuit_with_reply',
        replyText,
        rpc: 'agent_create_card_and_reply',
        rpcArgs: {
          p_create_card: false,
          p_task_type: 'workout',
          p_task_status: 'todo',
          ...AGENT_CREATE_CARD_CANONICAL_NULL_PATCHES,
        },
      };
    }

    const env = readDispatcherEnv();
    const blockLane = await tryBlockBlueprintLanePreflight(ctx, env);
    if (blockLane) return blockLane;

    return null;
  },

  /**
   * Compose the Coach system prompt and stash the request-scoped fragments on
   * `ctx.extras.coach` so `applyServerGuards` and `persist` can read them back.
   */
  async buildSystemPrompt(ctx) {
    if (!ctx.message.bubble_id) {
      // Defensive: webhook normalizer allows null, but Coach requires bubble context.
      throw new Error('coach_missing_bubble_id');
    }

    const knownTargetTaskId = await resolveKnownTargetTaskId(
      ctx.supabase as unknown as Parameters<typeof resolveKnownTargetTaskId>[0],
      ctx.message,
      ctx.history,
      ctx.requestId,
    );

    const isRailSurface = isCoachRailSurfaceFromMessageMetadata(ctx.message.metadata);
    let currentTaskContextBlock = '';
    let taskMetadataForContext: unknown | null = null;
    let taskItemType: string | null = null;
    let taskTitleForContext: string | null = null;
    let taskDescriptionForContext: string | null = null;
    if (knownTargetTaskId) {
      const ctxRow = await loadCurrentTaskContext(
        ctx.supabase as unknown as Parameters<typeof loadCurrentTaskContext>[0],
        knownTargetTaskId,
        ctx.message.bubble_id,
        ctx.requestId,
      );
      if (ctxRow) {
        taskMetadataForContext = ctxRow.metadata;
        taskItemType = ctxRow.item_type;
        taskTitleForContext = ctxRow.title;
        taskDescriptionForContext = ctxRow.description;
      }
    }

    const outlinePromptArgs = {
      taskItemType,
      taskMetadataForContext,
      messageMetadata: ctx.message.metadata,
      taskTitle: taskTitleForContext,
    };
    const outlineParts = resolveOutlineDraftPromptParts(outlinePromptArgs);
    const outlineCoPilotActive = outlineParts.coPilotBlock != null;
    const incomingDraft = readTaskModalOutlineDraftFromMessageMetadata(ctx.message.metadata);
    log('info', 'coach outline draft metadata', {
      request_id: ctx.requestId,
      slug: COACH_SLUG,
      has_incoming_draft: incomingDraft != null,
      draft_revision: incomingDraft?.revision ?? null,
      draft_block_count: incomingDraft?.blocks.length ?? 0,
      draft_block_names: incomingDraft?.blocks
        .map((b) => (typeof b.name === 'string' ? b.name.trim() : ''))
        .filter((n) => n.length > 0),
      outline_co_pilot_active: outlineCoPilotActive,
      will_inject_draft_block: outlineParts.draftBlock != null,
      task_item_type: taskItemType,
    });

    if (taskTitleForContext) {
      currentTaskContextBlock = buildCurrentTaskContextBlock(
        taskTitleForContext,
        taskDescriptionForContext,
        outlineCoPilotActive
          ? { outlineStructure: true }
          : isRailSurface
            ? { rail: true }
            : undefined,
      );
    }

    const userContextBlock = await fetchCoachUserContext(
      ctx.supabase as unknown as Parameters<typeof fetchCoachUserContext>[0],
      ctx.message.user_id,
      ctx.message.bubble_id,
      ctx.requestId,
    );

    // History rows (`ctx.history`) are guaranteed oldest → newest by Phase 1's history
    // loaders, so we can pass them straight to the workout-context resolver.
    const resolvedWorkoutContextJson = resolveCurrentWorkoutContextJsonFromThread(
      ctx.history,
      { metadata: ctx.message.metadata },
      taskMetadataForContext,
      {
        preferTaskMetadata: isRailSurface && knownTargetTaskId !== null,
        requestId: ctx.requestId,
      },
    );
    const currentWorkoutContextJson = outlineCoPilotActive ? null : resolvedWorkoutContextJson;
    if (outlineCoPilotActive && resolvedWorkoutContextJson) {
      log('info', 'coach outline co-pilot suppressed workout context for prompt', {
        request_id: ctx.requestId,
        slug: COACH_SLUG,
        suppressed_bytes: resolvedWorkoutContextJson.length,
      });
    }

    let exerciseDictionaryByIndex: Record<number, ExerciseDictionaryIndexEntry | null> | null =
      null;
    if (currentWorkoutContextJson) {
      try {
        exerciseDictionaryByIndex = await loadExerciseDictionaryByIndex(
          ctx.supabase as unknown as Parameters<typeof loadExerciseDictionaryByIndex>[0],
          currentWorkoutContextJson,
          ctx.requestId,
        );
      } catch (err) {
        log('warn', 'coach loadExerciseDictionaryByIndex failed', {
          request_id: ctx.requestId,
          slug: COACH_SLUG,
          error: err instanceof Error ? err.message : String(err),
        });
        exerciseDictionaryByIndex = null;
      }
    }

    const exerciseMentions = parseExerciseMentionsFromMetadata(ctx.message.metadata);
    const blockBlueprintMentions = parseBlockBlueprintMentionsFromMetadata(ctx.message.metadata);

    const isActiveSessionSurface = resolveActiveSessionSurfaceForCoachPrompt(
      ctx.message.metadata,
      ctx.history,
    );

    const { snapshot: sessionTelemetrySnapshot, source: sessionTelemetrySource } =
      await resolveSessionTelemetryForCoachPrompt(ctx, {
        knownTargetTaskId,
        taskItemType,
        taskMetadataForContext,
        isActiveSessionSurface,
      });

    let sessionTelemetryBlock: string | null = null;
    if (sessionTelemetrySnapshot) {
      sessionTelemetryBlock = formatSessionTelemetryForPrompt(sessionTelemetrySnapshot, {
        rail: isRailSurface,
        activeSession: isActiveSessionSurface,
      });
      log('info', 'coach session telemetry source', {
        request_id: ctx.requestId,
        slug: COACH_SLUG,
        source: sessionTelemetrySource,
        fingerprint: sessionTelemetrySnapshot.fingerprint,
        bytes: new TextEncoder().encode(sessionTelemetryBlock).length,
      });
    }

    const exerciseCueRequest = resolveExerciseCueRequestForDispatch(
      ctx.message.metadata,
      ctx.history,
      ctx.agent.auth_user_id,
    );

    writeCoachExtras(ctx, {
      knownTargetTaskId,
      currentWorkoutContextJson,
      taskMetadataForContext,
      exerciseDictionaryByIndex,
      sessionTelemetrySource,
      sessionTelemetryBlock,
      outlineCoPilotActive,
      triggerOutlineRevision: incomingDraft?.revision ?? null,
      exerciseCueRequestActive: exerciseCueRequest != null,
    });

    const today = new Date().toISOString().split('T')[0];
    const parts: string[] = [];
    if (!isRailSurface) {
      parts.push(buildApexArchitectMainChatBlock());
    }
    parts.push(
      buildBaseCoachPrompt(today, {
        apexArchitectMainChat: !isRailSurface,
        exerciseCueRequestMode: exerciseCueRequest != null,
      }),
    );

    const triggerContent = typeof ctx.message.content === 'string' ? ctx.message.content : '';
    const blockLibraryIncluded = shouldInjectBlockBlueprintLibrary({
      isRailSurface,
      blockBlueprintMentionCount: blockBlueprintMentions?.length ?? 0,
      userMessageShowsDraftIntent: userMessageShowsDraftIntent(triggerContent),
    });
    if (blockLibraryIncluded) {
      parts.push(buildBlockBlueprintLibraryPrompt());
    }

    const thinkingBudget = resolveCoachThinkingBudget({
      isRailSurface,
      hasWorkoutContext: currentWorkoutContextJson != null,
      exerciseCueRequestMode: exerciseCueRequest != null,
    });
    log('info', 'coach main rail diet', {
      request_id: ctx.requestId,
      slug: COACH_SLUG,
      surface: isRailSurface ? 'rail' : 'non_rail',
      block_library_included: blockLibraryIncluded,
      thinking_budget: thinkingBudget,
    });

    if (currentWorkoutContextJson) {
      let workoutCtxBlock: string;
      if (isRailSurface) {
        const summary = summarizeWorkoutContextForRailBlockAppend(currentWorkoutContextJson);
        workoutCtxBlock = summary
          ? `${WORKOUT_CONTEXT_HEADER}\n${summary}\n`
          : `${WORKOUT_CONTEXT_HEADER}\n${currentWorkoutContextJson}`;
      } else {
        workoutCtxBlock = `${WORKOUT_CONTEXT_HEADER}\n${currentWorkoutContextJson}`;
      }
      const indexMap = formatExerciseIndexMap(
        currentWorkoutContextJson,
        exerciseDictionaryByIndex ?? undefined,
      );
      if (indexMap) workoutCtxBlock += indexMap;
      const tagLines = resolveExerciseMentionLines(exerciseMentions, currentWorkoutContextJson);
      const tagBlock = formatTaggedExerciseRefsPromptBlock(tagLines);
      if (tagBlock) workoutCtxBlock += tagBlock;
      const blueprintBlock = formatBlockBlueprintRefsPromptBlock(blockBlueprintMentions ?? [], {
        outlineCoPilot: outlineCoPilotActive,
      });
      if (blueprintBlock) workoutCtxBlock += blueprintBlock;
      parts.push(workoutCtxBlock);
      if (sessionTelemetryBlock) {
        parts.push(sessionTelemetryBlock);
        parts.push(SESSION_TELEMETRY_GROUND_TRUTH_DIRECTIVE);
      }
      // Live-player / mid-workout directives forbid proposed_workout_metadata and
      // conflict with LIVE CO-PILOT rail co-editing (colon composer, block append).
      if (!isRailSurface) {
        parts.push(MID_WORKOUT_SUPPORT_MODE_DIRECTIVE);
        parts.push(ACTIVE_WORKOUT_EXECUTION_STATE_DIRECTIVE);
      }
    } else {
      if (exerciseMentions?.length) {
        const tagLines = resolveExerciseMentionLines(exerciseMentions, null);
        const tagBlock = formatTaggedExerciseRefsPromptBlock(tagLines);
        if (tagBlock) parts.push(tagBlock.trimStart());
      }
      const blueprintBlock = formatBlockBlueprintRefsPromptBlock(blockBlueprintMentions ?? [], {
        outlineCoPilot: outlineCoPilotActive,
      });
      if (blueprintBlock) parts.push(blueprintBlock.trimStart());
    }
    if (!currentWorkoutContextJson && sessionTelemetryBlock) {
      parts.push(sessionTelemetryBlock);
      parts.push(SESSION_TELEMETRY_GROUND_TRUTH_DIRECTIVE);
    }
    if (currentTaskContextBlock) parts.push(currentTaskContextBlock);

    if (outlineParts.coPilotBlock) parts.push(outlineParts.coPilotBlock);
    if (outlineParts.draftBlock) parts.push(outlineParts.draftBlock);

    const it = (taskItemType ?? '').toLowerCase();
    const suppressIntakeForOutline =
      shouldSuppressTaskModalIntakeForOutlineCoPilot(outlinePromptArgs);
    const suppressIntakeForPreflightReadiness = shouldSuppressTaskModalIntakeForPreflightReadiness(
      ctx.message.metadata,
    );
    if (suppressIntakeForPreflightReadiness) {
      const readinessCtx = readSessionReadinessContextFromMessageMetadata(ctx.message.metadata);
      if (readinessCtx) parts.push(buildSessionReadinessContextBlock(readinessCtx));
    }
    const showTaskModalIntakeUi =
      !suppressIntakeForOutline &&
      !suppressIntakeForPreflightReadiness &&
      (it === 'workout' ||
        it === 'workout_log' ||
        taskMetadataLooksWorkoutShaped(taskMetadataForContext));
    if (showTaskModalIntakeUi) parts.push(buildTaskModalIntakeUiCoachBlock());
    const liveState = readTaskModalLiveStateFromMessageMetadata(ctx.message.metadata);
    if (liveState) parts.push(buildTaskModalLiveStateBlock(liveState));
    if (userContextBlock) parts.push(userContextBlock);

    if (exerciseCueRequest) {
      const biometrics = await fetchFitnessProfileBiometrics(
        ctx.supabase as unknown as Parameters<typeof fetchFitnessProfileBiometrics>[0],
        ctx.message.user_id,
        ctx.message.bubble_id!,
      );
      const injuries = readInjuriesOnFileFromBiometrics(biometrics);
      parts.push(buildExerciseCueRequestCoachBlock(exerciseCueRequest, injuries));
      log('info', 'coach exercise cue request injected', {
        request_id: ctx.requestId,
        slug: COACH_SLUG,
        resolution_key: exerciseCueRequest.resolution_key,
        empty_field_count: exerciseCueRequest.empty_fields.length,
        injuries_on_file: injuries.onFile,
      });
    }

    return parts.join('\n\n');
  },

  resolveGenerationConfig(ctx) {
    const extras = readCoachExtras(ctx);
    const isRailSurface = isCoachRailSurfaceFromMessageMetadata(ctx.message.metadata);
    const cueReq = isRailSurface
      ? resolveExerciseCueRequestForDispatch(
          ctx.message.metadata,
          ctx.history,
          ctx.agent.auth_user_id,
        )
      : null;
    if (cueReq) {
      // Must set thinkingConfig — handler defaults to COACH_THINKING_BUDGET (2048), which
      // shares the maxOutputTokens budget and previously truncated cue JSON mid-patch.
      return {
        maxOutputTokens: COACH_CUE_MAX_OUTPUT_TOKENS,
        thinkingConfig: { thinkingBudget: COACH_CUE_THINKING_BUDGET },
      };
    }
    const budget = resolveCoachThinkingBudget({
      isRailSurface,
      hasWorkoutContext: extras.currentWorkoutContextJson != null,
    });
    if (budget === COACH_THINKING_BUDGET) return null;
    return { thinkingConfig: { thinkingBudget: budget } };
  },

  resolveResponseSchema(ctx) {
    const isRailSurface = isCoachRailSurfaceFromMessageMetadata(ctx.message.metadata);
    if (!isRailSurface) return COACH_MAIN_CHAT_RESPONSE_SCHEMA;
    const cueReq = resolveExerciseCueRequestForDispatch(
      ctx.message.metadata,
      ctx.history,
      ctx.agent.auth_user_id,
    );
    if (cueReq) return COACH_EXERCISE_CUE_RESPONSE_SCHEMA;
    return COACH_RESPONSE_SCHEMA;
  },

  /**
   * Map history → Vertex `contents`, filter the workout sentinel, and append the
   * trigger row as the final user turn. Mirrors `bubble-agent-dispatch/index.ts:1647-1663`.
   */
  buildContents(ctx) {
    const agentAuthIds = new Set<string>([ctx.agent.auth_user_id]);
    const out: GeminiContent[] = [];
    for (const row of ctx.history) {
      const text = typeof row.content === 'string' ? row.content : '';
      if (!text.trim()) continue;
      if (shouldExcludeWorkoutSentinelFromHistory(row)) continue;
      const role: 'user' | 'model' = agentAuthIds.has(row.user_id) ? 'model' : 'user';
      out.push({ role, parts: [{ text }] });
    }
    out.push({ role: 'user', parts: [{ text: ctx.message.content ?? '' }] });
    return Promise.resolve(out);
  },

  parse(json, ctx) {
    const response = json as VertexGenerateResponse;
    const text = extractGeminiText(response.candidates?.[0]);
    if (typeof text !== 'string' || !text.trim()) {
      throw new Error('gemini_empty_response');
    }
    const dict = readCoachExtras(ctx).exerciseDictionaryByIndex ?? undefined;
    const out = parseCoachJson(text, dict ?? undefined);
    if (out.task_modal_intake_dropped.length > 0) {
      const tuples = out.task_modal_intake_dropped.slice(0, 20).map((d) => ({
        field: d.field,
        reason: d.reason,
        detail: d.detail ?? null,
      }));
      log('warn', 'coach task_modal_intake_patch drops', {
        request_id: ctx.requestId,
        slug: COACH_SLUG,
        error_kind: 'task_modal_intake_parse',
        drop_count: out.task_modal_intake_dropped.length,
        tuples,
      });
    }
    const outlineNameDrops = out.outline_draft_patch_drops.filter(
      (d) => d.reason === 'block_name_too_verbose' || d.reason === 'block_name_clamped',
    );
    if (outlineNameDrops.length > 0) {
      log('warn', 'coach outline_draft_patch name sanitize', {
        request_id: ctx.requestId,
        slug: COACH_SLUG,
        message_id: ctx.message.id,
        drop_count: outlineNameDrops.length,
        drops: outlineNameDrops.slice(0, 10),
      });
    }
    return out;
  },

  async enrichParsed(parsed, ctx) {
    const hasCoachOutline =
      parsed.coach_workout_outline != null && parsed.coach_workout_outline.length > 0;
    const proposedMeta = parsed.proposed_workout_metadata as Record<string, unknown> | null;
    const skipReason = coachOutlinePhaseBSkipReason({
      isRailSurface: isCoachRailSurfaceFromMessageMetadata(ctx.message.metadata),
      isActiveWorkoutSession: isTriggerActiveWorkoutSession(ctx.message),
      createCard: parsed.create_card,
      updateExistingTask: parsed.update_existing_task,
      hasCoachOutline,
      hasProposedParametricBlocks: proposedMetaHasParametricBlocks(proposedMeta),
      cardActionTriggerGeneration: parsed.card_action === 'trigger_generation',
    });

    if (skipReason != null) {
      log('info', 'coach outline phase b skipped', {
        request_id: ctx.requestId,
        slug: COACH_SLUG,
        message_id: ctx.message.id,
        skip_reason: skipReason,
        create_card: parsed.create_card,
        update_existing_task: parsed.update_existing_task,
      });
      return parsed;
    }

    const env = readDispatcherEnv();
    const dispatchStartedAt =
      typeof ctx.extras?.dispatchStartedAtMs === 'number'
        ? ctx.extras.dispatchStartedAtMs
        : Date.now();
    const llmBudgetMs = computeLlmBudgetMs(env.LLM_TIMEOUT_MS, dispatchStartedAt);
    const { title, description } = outlinePhaseBCardFields(parsed);
    const { systemPrompt, userPrompt } = buildCoachOutlinePhaseBPrompts({
      title,
      description,
      userMessage: ctx.message.content ?? '',
    });

    log('info', 'coach outline phase b begin', {
      request_id: ctx.requestId,
      slug: COACH_SLUG,
      message_id: ctx.message.id,
      llm_budget_ms: llmBudgetMs,
      create_card: parsed.create_card,
      update_existing_task: parsed.update_existing_task,
    });

    const startedAt = Date.now();
    let response: VertexGenerateResponse;
    try {
      response = await generateContent({
        project: env.GCP_PROJECT_ID,
        location: env.GCP_LOCATION,
        model: COACH_OUTLINE_ONLY_MODEL,
        systemPrompt,
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }] as GeminiContent[],
        generationConfig: {
          temperature: COACH_OUTLINE_ONLY_TEMPERATURE,
          maxOutputTokens: COACH_OUTLINE_ONLY_MAX_OUTPUT_TOKENS,
          responseMimeType: 'application/json',
          responseSchema: COACH_OUTLINE_ONLY_SCHEMA,
        },
        timeoutMs: llmBudgetMs,
        signal: ctx.signal,
        env: { GCP_SERVICE_ACCOUNT_JSON: env.GCP_SERVICE_ACCOUNT_JSON },
        debug: env.LLM_DEBUG,
        slug: COACH_SLUG,
        requestId: ctx.requestId,
      });
    } catch (err) {
      log('warn', 'coach outline phase b generate failed', {
        request_id: ctx.requestId,
        slug: COACH_SLUG,
        message_id: ctx.message.id,
        error_kind: classifyError(err),
        latency_ms: Date.now() - startedAt,
      });
      writeCoachExtras(ctx, {
        ...readCoachExtras(ctx),
        outlinePhaseB: {
          attempted: true,
          ok: false,
          error: 'Outline generation failed. Add blocks manually or retry from the task card.',
        },
      });
      return parsed;
    }

    const finishReason = response.candidates?.[0]?.finishReason;
    log('info', 'coach outline phase b done', {
      request_id: ctx.requestId,
      slug: COACH_SLUG,
      message_id: ctx.message.id,
      latency_ms: Date.now() - startedAt,
      finish_reason: finishReason,
      token_out: response.usageMetadata?.candidatesTokenCount,
    });

    const text = extractGeminiText(response.candidates?.[0]);
    const phaseResult = processCoachOutlinePhaseBVertexOutput({ text, finishReason });

    if (!phaseResult.ok) {
      log('warn', 'coach outline phase b failed', {
        request_id: ctx.requestId,
        slug: COACH_SLUG,
        message_id: ctx.message.id,
        error_kind: phaseResult.errorKind,
        drop_count: phaseResult.drops?.length ?? 0,
      });
      writeCoachExtras(ctx, {
        ...readCoachExtras(ctx),
        outlinePhaseB: {
          attempted: true,
          ok: false,
          error: phaseResult.message,
          drops: phaseResult.drops,
        },
      });
      return parsed;
    }

    if (phaseResult.drops.length > 0) {
      log('warn', 'coach outline phase b drops', {
        request_id: ctx.requestId,
        slug: COACH_SLUG,
        message_id: ctx.message.id,
        drop_count: phaseResult.drops.length,
        drops: phaseResult.drops.slice(0, 10),
      });
    }

    log('info', 'coach outline phase b merged', {
      request_id: ctx.requestId,
      slug: COACH_SLUG,
      message_id: ctx.message.id,
      outline_block_count: phaseResult.blocks.length,
    });

    writeCoachExtras(ctx, {
      ...readCoachExtras(ctx),
      outlinePhaseB: { attempted: true, ok: true },
    });

    return {
      ...parsed,
      coach_workout_outline: phaseResult.blocks,
      coach_workout_outline_drops: phaseResult.drops,
    };
  },

  applyServerGuards(parsed, ctx) {
    const extras = readCoachExtras(ctx);
    const isActiveWorkoutSession = isTriggerActiveWorkoutSession(ctx.message);
    const hasIntakePatch =
      parsed.task_modal_intake_patch != null &&
      typeof parsed.task_modal_intake_patch === 'object' &&
      Object.keys(parsed.task_modal_intake_patch).length > 0;
    const reply = typeof parsed.reply_content === 'string' ? parsed.reply_content : '';
    const claimsIntakeUi =
      /\b(slider|wizard\s*step|readiness|sleep\s*quality|duration|intensity|soreness|equipment)\b/i.test(
        reply,
      );
    const hasExecutionPatch = parsed.execution_patch != null && parsed.execution_patch.length > 0;
    if (claimsIntakeUi && !hasIntakePatch && !hasExecutionPatch) {
      log('warn', 'coach reply_content claims intake update without patch', {
        request_id: ctx.requestId,
        slug: COACH_SLUG,
      });
    }
    if (parsed.proposed_workout_metadata_drops.length > 0) {
      log('info', 'coach parametric block drops', {
        request_id: ctx.requestId,
        slug: COACH_SLUG,
        message_id: ctx.message.id,
        drops: parsed.proposed_workout_metadata_drops,
      });
    }

    const exerciseCueRequest = resolveExerciseCueRequestForDispatch(
      ctx.message.metadata,
      ctx.history,
      ctx.agent.auth_user_id,
    );
    const coalescedWorkoutCuesPatch = coalesceWorkoutCuesPatchFromPersonalFallback({
      workoutCuesPatch: parsed.workout_cues_patch,
      unanchoredDrops: parsed.personal_cues_unanchored_drops ?? [],
      workoutContextJson: extras.currentWorkoutContextJson,
      exerciseCueRequestResolutionKey: exerciseCueRequest?.resolution_key ?? null,
      exerciseCueRequestExerciseIndex: exerciseCueRequest?.workout_exercise_index,
    });
    let parsedForGuards = parsed;
    if (
      coalescedWorkoutCuesPatch != null &&
      parsed.workout_cues_patch == null &&
      parsed.personal_cues_unanchored_drops.length > 0
    ) {
      parsedForGuards = {
        ...parsed,
        workout_cues_patch: coalescedWorkoutCuesPatch,
        personal_cues_dropped_unanchored: 0,
      };
      log('info', 'coach personal_cues rerouted to workout_cues_patch', {
        request_id: ctx.requestId,
        slug: COACH_SLUG,
        message_id: ctx.message.id,
        resolution_key: coalescedWorkoutCuesPatch.resolution_key,
        rerouted_count: parsed.personal_cues_unanchored_drops.length,
      });
    } else if (parsed.personal_cues_dropped_unanchored > 0 && !coalescedWorkoutCuesPatch) {
      log('warn', 'coach personal_cues unanchored drops', {
        request_id: ctx.requestId,
        slug: COACH_SLUG,
        error_kind: 'cue_unanchored',
        dropped: parsed.personal_cues_dropped_unanchored,
      });
    }

    const fragment: CoachGuardsFragment = {
      knownTargetTaskId: extras.knownTargetTaskId,
      currentWorkoutContextJson: extras.currentWorkoutContextJson,
      priorUserMessageCount: priorUserMessageCount(ctx),
      isActiveWorkoutSession,
      outlineCoPilotActive: extras.outlineCoPilotActive === true,
      exerciseCueRequestActive: extras.exerciseCueRequestActive === true,
    };

    const blockBlueprintMentions = parseBlockBlueprintMentionsFromMetadata(ctx.message.metadata);
    const messageText = typeof ctx.message.content === 'string' ? ctx.message.content : '';
    const patchDropReasons = parsed.outline_draft_patch_drops.map((d) => String(d.reason));
    let toGuard = parsedForGuards;
    if (
      shouldSynthesizeOutlineDraftPatch({
        outlineCoPilotActive: extras.outlineCoPilotActive === true,
        hasPatch: parsed.outline_draft_patch != null,
        patchDropReasons,
        messageText,
        blockMentions: blockBlueprintMentions,
      })
    ) {
      const synthesized = synthesizeOutlineDraftPatchFromBlockIntent({
        messageText,
        blockMentions: blockBlueprintMentions,
        revision:
          extras.triggerOutlineRevision ??
          readTaskModalOutlineDraftFromMessageMetadata(ctx.message.metadata)?.revision ??
          0,
        modelBlocks: parsed.proposed_workout_metadata?.blocks,
      });
      if (synthesized) {
        toGuard = {
          ...parsed,
          outline_draft_patch: synthesized,
          proposed_workout_metadata: null,
        };
        log('info', 'coach outline draft patch synthesized from block intent', {
          request_id: ctx.requestId,
          slug: COACH_SLUG,
          message_id: ctx.message.id,
          revision: synthesized.revision,
          block_count: synthesized.blocks.length,
          block_names: synthesized.blocks
            .map((b) => (typeof b.name === 'string' ? b.name.trim() : ''))
            .filter((n) => n.length > 0),
        });
      }
    }

    let out = applyCoachServerGuards(toGuard, fragment);

    const cuePatchTurn =
      out.workout_cues_patch != null || fragment.exerciseCueRequestActive === true;

    if (blockBlueprintMentions?.length && !cuePatchTurn) {
      const shells = synthesizeProposedBlocksFromMentions(blockBlueprintMentions);
      const mergedBlocks = mergeBlueprintShellsWithModelBlocks(
        shells,
        out.proposed_workout_metadata?.blocks,
      );
      const hasExercises = mergedBlocks.some(
        (b) => Array.isArray(b.exercises) && b.exercises.length > 0,
      );
      if (hasExercises) {
        out = {
          ...out,
          update_existing_task: true,
          proposed_workout_metadata: {
            ...(out.proposed_workout_metadata ?? {}),
            blocks: mergedBlocks,
          },
        };
      }
    }

    if (out.workout_cues_patch != null) {
      out = stripStructuralWritesForWorkoutCuePatch(out);
    }

    if (ctx.coachCardActions !== true) {
      out = { ...out, card_action: null };
    }

    const isRailSurface = isCoachRailSurfaceFromMessageMetadata(ctx.message.metadata);
    const inferred = inferCardActionTriggerGeneration({
      isRailSurface,
      currentWorkoutContextJson: extras.currentWorkoutContextJson,
      triggerContent: typeof ctx.message.content === 'string' ? ctx.message.content : '',
      parsed: out,
    });
    if (inferred != null) {
      out = { ...out, card_action: inferred };
      log('info', 'coach card_action server_inferred', {
        request_id: ctx.requestId,
        slug: COACH_SLUG,
        message_id: ctx.message.id,
        action: inferred,
      });
    }

    const inHadDesc = Boolean(parsed.updated_task_description?.trim());
    const outHasDesc = Boolean(out.updated_task_description?.trim());
    if (inHadDesc && !outHasDesc) {
      log('info', 'coach guard hard-nulled updated_task_description', {
        request_id: ctx.requestId,
        slug: COACH_SLUG,
        message_id: ctx.message.id,
        reason: 'narrative_vs_structure',
      });
    }

    return out;
  },

  async persist(parsed, ctx): Promise<RpcEnvelope> {
    const extras = readCoachExtras(ctx);
    const knownTargetTaskId = extras.knownTargetTaskId;
    const isRailSurface = isCoachRailSurfaceFromMessageMetadata(ctx.message.metadata);
    const outlinePatch = parsed.outline_draft_patch;

    if (
      isRailSurface &&
      extras.outlineCoPilotActive &&
      outlinePatch == null &&
      parsed.outline_draft_patch_drops.length > 0
    ) {
      log('warn', 'coach outline draft patch dropped at parse', {
        request_id: ctx.requestId,
        slug: COACH_SLUG,
        message_id: ctx.message.id,
        drop_count: parsed.outline_draft_patch_drops.length,
        drops: parsed.outline_draft_patch_drops.slice(0, 10),
      });
    }

    if (isRailSurface && knownTargetTaskId && extras.outlineCoPilotActive && outlinePatch != null) {
      const outlineMeta = readCoachOutlineMetadata(extras.taskMetadataForContext);
      if (!outlineMeta.confirmedAt && !outlineMeta.hasFactory) {
        const staleReason = outlineDraftPatchStaleReason(
          extras.triggerOutlineRevision ?? null,
          outlinePatch.revision,
        );
        if (staleReason) {
          log('warn', 'coach outline draft patch stale', {
            request_id: ctx.requestId,
            slug: COACH_SLUG,
            message_id: ctx.message.id,
            reason: staleReason,
            trigger_revision: extras.triggerOutlineRevision,
            patch_revision: outlinePatch.revision,
          });
        } else {
          const triggerDraft = readTaskModalOutlineDraftFromMessageMetadata(ctx.message.metadata);
          const baseBlocks = triggerDraft?.blocks?.length
            ? triggerDraft.blocks
            : (outlineMeta.outline ?? []);
          const merged = ensureOutlineExercisePlaceholders(
            applyOutlineDraftPatch({
              baseBlocks,
              patch: outlinePatch,
            }),
          );
          const baseMeta = extras.taskMetadataForContext ?? {};
          const withOutline = applyCoachWorkoutOutlineToTaskMetadata(baseMeta, merged);
          const pNewMeta = mergeCoachOutlineMetadataPatch(withOutline, {
            outline: merged.length > 0 ? merged : null,
            status: 'ready',
            clearConfirmation: outlinePatch.clear_confirmation !== false,
            drops:
              parsed.outline_draft_patch_drops.length > 0
                ? parsed.outline_draft_patch_drops
                : undefined,
          });
          const appliedPayload = buildOutlineDraftAppliedPayload({
            revision: outlinePatch.revision,
            blocks: merged,
            drops:
              parsed.outline_draft_patch_drops.length > 0
                ? parsed.outline_draft_patch_drops
                : undefined,
          });
          const blockNames = merged
            .map((b) => (typeof b.name === 'string' ? b.name.trim() : ''))
            .filter((n) => n.length > 0);
          log('info', 'coach outline draft patch applied', {
            request_id: ctx.requestId,
            slug: COACH_SLUG,
            message_id: ctx.message.id,
            trigger_revision: extras.triggerOutlineRevision,
            patch_revision: outlinePatch.revision,
            mode: outlinePatch.mode,
            block_count: merged.length,
            block_names: blockNames,
            drop_count: parsed.outline_draft_patch_drops.length,
          });
          const supabase: SharedSupabaseClient = ctx.supabase;
          const cardActionParam = cardActionForRpc(parsed.card_action);
          const workoutCuesParamOutline = workoutCuesPatchForRpc(parsed.workout_cues_patch);
          const upd = await agentUpdateTaskAndReply(supabase, {
            p_trigger_message_id: ctx.message.id,
            p_thread_id: ctx.threadId,
            p_agent_auth_user_id: ctx.agent.auth_user_id,
            p_invoker_user_id: ctx.message.user_id,
            p_target_task_id: knownTargetTaskId,
            p_reply_text: parsed.reply_content,
            p_new_title: null,
            p_new_description: null,
            p_new_metadata: pNewMeta,
            p_card_action: cardActionParam,
            p_outline_draft_applied: outlineDraftAppliedForRpc(appliedPayload),
            p_workout_cues_patch: workoutCuesParamOutline,
          });
          if (!upd.ok) {
            log('error', 'coach outline draft patch rpc failed', {
              request_id: ctx.requestId,
              slug: COACH_SLUG,
              message_id: ctx.message.id,
              error: upd.error,
            });
            throw new Error(`rpc_failed:${upd.error}`);
          }
          return { ok: true, data: upd.data };
        }
      }
    }
    const workoutCuesParam = workoutCuesPatchForRpc(parsed.workout_cues_patch);
    const payload =
      workoutCuesParam != null ? stripStructuralWritesForWorkoutCuePatch(parsed) : parsed;
    if (workoutCuesParam != null) {
      log('info', 'coach workout_cues_patch structural sanitize', {
        request_id: ctx.requestId,
        slug: COACH_SLUG,
        message_id: ctx.message.id,
        resolution_key: parsed.workout_cues_patch?.resolution_key,
      });
    }

    if (knownTargetTaskId && workoutCuesParam != null && payload.workout_cues_patch) {
      const supabase: SharedSupabaseClient = ctx.supabase;
      const metaDelta = buildTaskMetadataDeltaForWorkoutCuePatch(
        extras.taskMetadataForContext,
        payload.workout_cues_patch,
      );
      if (metaDelta == null) {
        log('warn', 'coach workout_cues_patch metadata merge skipped', {
          request_id: ctx.requestId,
          slug: COACH_SLUG,
          message_id: ctx.message.id,
          resolution_key: payload.workout_cues_patch.resolution_key,
          target_task_id: knownTargetTaskId,
          reason: 'no_task_metadata_delta',
          note: 'reply_only_task_unchanged',
        });
      } else {
        log('info', 'coach workout_cues_patch metadata merge', {
          request_id: ctx.requestId,
          slug: COACH_SLUG,
          message_id: ctx.message.id,
          resolution_key: payload.workout_cues_patch.resolution_key,
          has_metadata_delta: true,
        });
      }
      const cueUpd = await agentUpdateTaskAndReply(supabase, {
        p_trigger_message_id: ctx.message.id,
        p_thread_id: ctx.threadId,
        p_agent_auth_user_id: ctx.agent.auth_user_id,
        p_invoker_user_id: ctx.message.user_id,
        p_target_task_id: knownTargetTaskId,
        p_reply_text: payload.reply_content,
        p_new_title: null,
        p_new_description: null,
        p_new_metadata: metaDelta,
        p_workout_cues_patch: workoutCuesParam,
      });
      if (!cueUpd.ok) {
        log('error', 'coach workout_cues_patch persist rpc failed', {
          request_id: ctx.requestId,
          slug: COACH_SLUG,
          message_id: ctx.message.id,
          error: cueUpd.error,
        });
        throw new Error(`rpc_failed:${cueUpd.error}`);
      }
      return { ok: true, data: cueUpd.data };
    }

    const trimmedNewTitle = payload.updated_task_title?.trim() ?? '';
    const trimmedNewDesc = payload.updated_task_description?.trim() ?? '';
    const hasUpdateBody = trimmedNewTitle.length > 0 || trimmedNewDesc.length > 0;
    const hasProposedMeta =
      payload.proposed_workout_metadata != null &&
      Object.keys(payload.proposed_workout_metadata).length > 0;
    const hasCoachOutline =
      payload.coach_workout_outline != null && payload.coach_workout_outline.length > 0;

    const supabase: SharedSupabaseClient = ctx.supabase;
    const patchParam = executionPatchForRpc(payload.execution_patch);
    const personalCuesParam = personalCuesPatchForRpc(payload.personal_cues_resolved);
    const intakePatchParam = taskModalIntakePatchForRpc(payload.task_modal_intake_patch);
    const cardActionParam = cardActionForRpc(payload.card_action);
    const hasCardAction = cardActionParam != null;
    const hasMessageMetaPatch =
      patchParam != null ||
      personalCuesParam != null ||
      intakePatchParam != null ||
      workoutCuesParam != null;

    if (parsed.card_action) {
      log('info', 'coach card_action emitted', {
        request_id: ctx.requestId,
        slug: COACH_SLUG,
        message_id: ctx.message.id,
        action: parsed.card_action,
      });
    }
    if (parsed.workout_cues_patch) {
      log('info', 'coach workout_cues_patch emitted', {
        request_id: ctx.requestId,
        slug: COACH_SLUG,
        message_id: ctx.message.id,
        resolution_key: parsed.workout_cues_patch.resolution_key,
      });
    }

    const shouldDirectUpdate =
      isRailSurface &&
      knownTargetTaskId !== null &&
      payload.update_existing_task &&
      (hasUpdateBody || hasProposedMeta || hasCoachOutline) &&
      !hasMessageMetaPatch;

    const shouldInsertDraft =
      !shouldDirectUpdate &&
      knownTargetTaskId !== null &&
      payload.update_existing_task &&
      (hasUpdateBody || hasProposedMeta);

    if (shouldDirectUpdate) {
      let pNewMeta: Record<string, unknown> | null = null;
      let mergeExerciseBlocksTouched = false;
      let mergeTouchedEmptyWithBlocks = false;
      let replyText = parsed.reply_content;

      if (hasProposedMeta) {
        const raw = payload.proposed_workout_metadata as Record<string, unknown>;
        const proposedBlockCount = Array.isArray(raw.blocks) ? raw.blocks.length : 0;
        if (ctx.coachMergeWorkoutMetadata === true) {
          const mergeBase = resolveCoachTaskMetadataForMerge(
            extras.taskMetadataForContext ?? {},
            extras.currentWorkoutContextJson,
          );
          const { metadata, mergeLog } = mergeCoachProposedIntoTaskMetadata({
            base: mergeBase,
            proposed: raw,
          });
          pNewMeta = metadata;
          mergeExerciseBlocksTouched = mergeLog.touched.includes('exerciseBlocks');
          mergeTouchedEmptyWithBlocks = proposedBlockCount > 0 && mergeLog.touched.length === 0;
          log('info', 'coach merge workout metadata', {
            request_id: ctx.requestId,
            slug: COACH_SLUG,
            message_id: ctx.message.id,
            merge_target: mergeLog.target,
            merge_touched: mergeLog.touched,
            merge_exercise_count: mergeLog.exerciseCount,
            merge_drops: mergeLog.drops,
            merge_block_formats: mergeLog.blockFormats,
          });
          if (mergeExerciseBlocksTouched) {
            pNewMeta = syncCoachOutlineFromRichMetadata(pNewMeta);
          }
        } else {
          pNewMeta = raw;
        }
      }
      if (hasCoachOutline) {
        const outlineBase = pNewMeta ?? extras.taskMetadataForContext ?? {};
        pNewMeta = applyCoachWorkoutOutlineToTaskMetadata(
          outlineBase,
          payload.coach_workout_outline,
        );
        log('info', 'coach outline metadata', {
          request_id: ctx.requestId,
          slug: COACH_SLUG,
          message_id: ctx.message.id,
          outline_block_count: payload.coach_workout_outline!.length,
          outline_formats: payload.coach_workout_outline!.map(
            (b) => (b as { block_format?: string }).block_format ?? 'unknown',
          ),
        });
      }

      if (mergeTouchedEmptyWithBlocks) {
        replyText = `${replyText.trim()}\n\n(Structure unchanged — try again using the exact block names from your workout.)`;
        log('info', 'coach rail merge phantom update guard', {
          request_id: ctx.requestId,
          slug: COACH_SLUG,
          message_id: ctx.message.id,
        });
      }

      let cardActionParamFinal = cardActionParam;
      if (
        ctx.coachAutoRegenerateAfterRailMerge === true &&
        ctx.coachCardActions === true &&
        !isTriggerActiveWorkoutSession(ctx.message) &&
        pNewMeta != null &&
        hasRichWorkoutSetMetadata(pNewMeta) &&
        mergeExerciseBlocksTouched
      ) {
        cardActionParamFinal = cardActionForRpc('regenerate_from_outline');
        log('info', 'coach rail merge triggered factory rehydrate', {
          request_id: ctx.requestId,
          slug: COACH_SLUG,
          message_id: ctx.message.id,
        });
      }

      const upd = await agentUpdateTaskAndReply(supabase, {
        p_trigger_message_id: ctx.message.id,
        p_thread_id: ctx.threadId,
        p_agent_auth_user_id: ctx.agent.auth_user_id,
        p_invoker_user_id: ctx.message.user_id,
        p_target_task_id: knownTargetTaskId!,
        p_reply_text: replyText,
        p_new_title: trimmedNewTitle.length > 0 ? trimmedNewTitle : null,
        p_new_description: trimmedNewDesc.length > 0 ? trimmedNewDesc : null,
        p_new_metadata: pNewMeta,
        p_card_action: cardActionParamFinal,
        p_workout_cues_patch: workoutCuesParam,
      });
      if (!upd.ok) {
        log('error', 'coach persist direct update rpc failed', {
          request_id: ctx.requestId,
          slug: COACH_SLUG,
          message_id: ctx.message.id,
          error: upd.error,
        });
        throw new Error(`rpc_failed:${upd.error}`);
      }
      log('info', 'coach rail auto-applied workout edit', {
        request_id: ctx.requestId,
        slug: COACH_SLUG,
        message_id: ctx.message.id,
        has_title: trimmedNewTitle.length > 0,
        has_desc: trimmedNewDesc.length > 0,
        has_metadata: hasProposedMeta,
      });
      return { ok: true, data: upd.data };
    }

    if (shouldInsertDraft) {
      const draft = await agentInsertCoachWorkoutDraftReply(supabase, {
        p_trigger_message_id: ctx.message.id,
        p_thread_id: ctx.threadId,
        p_agent_auth_user_id: ctx.agent.auth_user_id,
        p_invoker_user_id: ctx.message.user_id,
        p_target_task_id: knownTargetTaskId!,
        p_reply_text: payload.reply_content,
        p_proposed_title: trimmedNewTitle.length > 0 ? trimmedNewTitle : null,
        p_proposed_description: trimmedNewDesc.length > 0 ? trimmedNewDesc : null,
        p_proposed_metadata: hasProposedMeta ? payload.proposed_workout_metadata! : {},
        p_execution_patch: patchParam,
        p_personal_cues: personalCuesParam,
        p_task_modal_intake_patch: intakePatchParam,
        p_card_action: cardActionParam,
        p_workout_cues_patch: workoutCuesParam,
      });
      if (!draft.ok) {
        log('error', 'coach persist draft rpc failed', {
          request_id: ctx.requestId,
          slug: COACH_SLUG,
          message_id: ctx.message.id,
          error: draft.error,
        });
        throw new Error(`rpc_failed:${draft.error}`);
      }
      return { ok: true, data: draft.data };
    }

    const rpcArgs: {
      p_trigger_message_id: string;
      p_thread_id: string;
      p_agent_auth_user_id: string;
      p_invoker_user_id: string;
      p_reply_text: string;
      p_create_card: boolean;
      p_task_type: string;
      p_task_status: string;
      p_task_title?: string | null;
      p_task_description?: string | null;
      p_seed_task_comment_text?: string | null;
      p_execution_patch?: unknown;
      p_personal_cues?: unknown;
      p_task_modal_intake_patch?: unknown;
      p_card_action?: unknown;
      p_workout_cues_patch?: unknown;
      p_coach_workout_outline?: unknown;
    } = {
      p_trigger_message_id: ctx.message.id,
      p_thread_id: ctx.threadId,
      p_agent_auth_user_id: ctx.agent.auth_user_id,
      p_invoker_user_id: ctx.message.user_id,
      p_reply_text: payload.reply_content,
      p_create_card: payload.create_card,
      p_task_type: 'workout',
      p_task_status: 'todo',
    };
    if (payload.create_card && payload.task_title) {
      rpcArgs.p_task_title = payload.task_title;
      rpcArgs.p_task_description = payload.task_description ?? null;
      rpcArgs.p_seed_task_comment_text = payload.coach_task_notes ?? null;
      if (hasCoachOutline) {
        rpcArgs.p_coach_workout_outline = payload.coach_workout_outline;
        log('info', 'coach create card outline', {
          request_id: ctx.requestId,
          slug: COACH_SLUG,
          message_id: ctx.message.id,
          outline_block_count: payload.coach_workout_outline!.length,
          outline_formats: payload.coach_workout_outline!.map(
            (b) => (b as { block_format?: string }).block_format ?? 'unknown',
          ),
        });
      }
    }
    if (knownTargetTaskId) {
      rpcArgs.p_create_card = false;
    }
    rpcArgs.p_execution_patch = patchParam;
    rpcArgs.p_personal_cues = personalCuesParam;
    rpcArgs.p_task_modal_intake_patch = intakePatchParam;
    rpcArgs.p_card_action = cardActionParam;
    rpcArgs.p_workout_cues_patch = workoutCuesParam;

    if (
      hasCardAction &&
      !hasUpdateBody &&
      !hasProposedMeta &&
      !hasMessageMetaPatch &&
      !payload.create_card
    ) {
      rpcArgs.p_create_card = false;
    }

    const card = await agentCreateCardAndReply(supabase, {
      ...AGENT_CREATE_CARD_CANONICAL_NULL_PATCHES,
      ...rpcArgs,
    });
    if (!card.ok) {
      log('error', 'coach persist card rpc failed', {
        request_id: ctx.requestId,
        slug: COACH_SLUG,
        message_id: ctx.message.id,
        error: card.error,
      });
      throw new Error(`rpc_failed:${card.error}`);
    }

    const outlinePhaseB = readCoachExtras(ctx).outlinePhaseB;
    const createdTaskId =
      card.data != null &&
      typeof card.data === 'object' &&
      !Array.isArray(card.data) &&
      typeof (card.data as { created_task_id?: unknown }).created_task_id === 'string'
        ? ((card.data as { created_task_id: string }).created_task_id as string)
        : null;

    const outlinePersistTaskId =
      createdTaskId ?? (knownTargetTaskId && outlinePhaseB?.attempted ? knownTargetTaskId : null);

    if (outlinePersistTaskId && outlinePhaseB?.attempted) {
      if (outlinePhaseB.ok && hasCoachOutline) {
        await patchTaskOutlineMetadataFields(supabase, outlinePersistTaskId, {
          outline: parsed.coach_workout_outline,
          status: 'ready',
          error: null,
          drops: parsed.coach_workout_outline_drops ?? [],
        });
        log('info', 'coach outline persisted to task', {
          request_id: ctx.requestId,
          slug: COACH_SLUG,
          message_id: ctx.message.id,
          task_id: outlinePersistTaskId,
          outline_block_count: parsed.coach_workout_outline!.length,
          via_create_card: createdTaskId != null,
        });
      } else if (!outlinePhaseB.ok) {
        await patchTaskOutlineMetadataFields(supabase, outlinePersistTaskId, {
          status: 'needs_structure',
          error: outlinePhaseB.error ?? 'Outline generation failed.',
          drops: outlinePhaseB.drops ?? [],
        });
      }
    }

    return { ok: true, data: card.data };
  },
};

// Importing `readWorkoutContextFromMessageMetadata` keeps it co-resident with the
// other context helpers without forcing the strategy to use it; reserved for future
// strategies (e.g. an Organizer-side trigger) that may need the raw payload.
void readWorkoutContextFromMessageMetadata;
