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
import { log } from '../../_shared/obs/log.ts';
import {
  agentCreateCardAndReply,
  agentInsertCoachWorkoutDraftReply,
  agentUpdateTaskAndReply,
} from '../../_shared/dispatch/rpc.ts';
import { mergeCoachProposedIntoTaskMetadata } from '../../_shared/workout-metadata/merge-coach-proposed-into-task-metadata.ts';
import {
  shouldExcludeWorkoutSentinelFromHistory,
  isWorkoutContextSentinel,
  WORKOUT_CONTEXT_LEGACY_SENTINEL,
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
  COACH_MAX_OUTPUT_TOKENS,
  COACH_MODEL_DEFAULT,
  COACH_SAFE_REPLY_TEXT,
  COACH_SLUG,
  COACH_TEMPERATURE,
  COACH_WORKOUT_GREETING_MAX_OUTPUT_TOKENS,
  COACH_WORKOUT_GREETING_TEMPERATURE,
  MID_WORKOUT_SUPPORT_MODE_DIRECTIVE,
} from './config.ts';
import {
  fetchCoachUserContext,
  loadCurrentTaskContext,
  resolveCurrentWorkoutContextJsonFromThread,
  resolveKnownTargetTaskId,
  extractWorkoutTaskTitleFromMetadata,
  readWorkoutContextFromMessageMetadata,
  stringifyWorkoutContextForPrompt,
} from './context.ts';
import {
  CoachGeminiJsonResponse,
  executionPatchForRpc,
  parseCoachJson,
  personalCuesPatchForRpc,
  stripMarkdownCodeFences,
  taskModalIntakePatchForRpc,
} from './parse.ts';
import {
  formatTaggedExerciseRefsPromptBlock,
  parseExerciseMentionsFromMetadata,
  resolveExerciseMentionLines,
} from './exercise-mentions.ts';
import { loadExerciseDictionaryByIndex } from './exercise-dictionary-by-index.ts';
import {
  buildBaseCoachPrompt,
  buildCurrentTaskContextBlock,
  buildTaskModalIntakeUiCoachBlock,
  buildTaskModalLiveStateBlock,
  buildWorkoutOpenGreetingPrompt,
  buildWorkoutOpenGreetingUserText,
  formatExerciseIndexMap,
  isCoachRailSurfaceFromMessageMetadata,
  readTaskModalLiveStateFromMessageMetadata,
  taskMetadataLooksWorkoutShaped,
  WORKOUT_CONTEXT_HEADER,
  type ExerciseDictionaryIndexEntry,
} from './prompts.ts';
import { COACH_RESPONSE_SCHEMA, COACH_WORKOUT_GREETING_SCHEMA } from './schema.ts';
import { applyCoachServerGuards, type CoachGuardsFragment } from './server-guards.ts';

/** Coach-owned scratch on `ctx.extras`. */
type CoachExtras = {
  knownTargetTaskId: string | null;
  currentWorkoutContextJson: string | null;
  taskMetadataForContext: unknown | null;
  exerciseDictionaryByIndex: Record<number, ExerciseDictionaryIndexEntry | null> | null;
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
    if (!isWorkoutContextSentinel(ctx.message)) return null;

    const env = readDispatcherEnv();
    const meta = (ctx.message.metadata ?? {}) as Record<string, unknown>;
    const workoutTitle = extractWorkoutTaskTitleFromMetadata(meta);
    const workoutJson = stringifyWorkoutContextForPrompt(meta['workoutContext']);

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
    const systemPrompt = buildWorkoutOpenGreetingPrompt({
      workoutTitle,
      isoNow,
      userContextBlock,
    });
    const userText = buildWorkoutOpenGreetingUserText(workoutJson);

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
        if (cleanedReply.length > 0) replyText = cleanedReply;
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
        p_execution_patch: null,
        p_personal_cues: null,
        p_task_modal_intake_patch: null,
      },
    };
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
        currentTaskContextBlock = buildCurrentTaskContextBlock(
          ctxRow.title,
          ctxRow.description,
          isRailSurface ? { rail: true } : undefined,
        );
      }
    }

    const userContextBlock = await fetchCoachUserContext(
      ctx.supabase as unknown as Parameters<typeof fetchCoachUserContext>[0],
      ctx.message.user_id,
      ctx.message.bubble_id,
      ctx.requestId,
    );

    // History rows (`ctx.history`) are guaranteed oldest → newest by Phase 1's history
    // loaders, so we can pass them straight to the workout-context resolver.
    const currentWorkoutContextJson = resolveCurrentWorkoutContextJsonFromThread(
      ctx.history,
      { metadata: ctx.message.metadata },
      taskMetadataForContext,
      {
        preferTaskMetadata: isRailSurface && knownTargetTaskId !== null,
        requestId: ctx.requestId,
      },
    );

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

    writeCoachExtras(ctx, {
      knownTargetTaskId,
      currentWorkoutContextJson,
      taskMetadataForContext,
      exerciseDictionaryByIndex,
    });

    const today = new Date().toISOString().split('T')[0];
    const parts: string[] = [buildBaseCoachPrompt(today)];
    const exerciseMentions = parseExerciseMentionsFromMetadata(ctx.message.metadata);

    if (currentWorkoutContextJson) {
      let workoutCtxBlock = `${WORKOUT_CONTEXT_HEADER}\n${currentWorkoutContextJson}`;
      const indexMap = formatExerciseIndexMap(
        currentWorkoutContextJson,
        exerciseDictionaryByIndex ?? undefined,
      );
      if (indexMap) workoutCtxBlock += indexMap;
      const tagLines = resolveExerciseMentionLines(exerciseMentions, currentWorkoutContextJson);
      const tagBlock = formatTaggedExerciseRefsPromptBlock(tagLines);
      if (tagBlock) workoutCtxBlock += tagBlock;
      parts.push(workoutCtxBlock);
      parts.push(MID_WORKOUT_SUPPORT_MODE_DIRECTIVE);
      parts.push(ACTIVE_WORKOUT_EXECUTION_STATE_DIRECTIVE);
    } else if (exerciseMentions?.length) {
      const tagLines = resolveExerciseMentionLines(exerciseMentions, null);
      const tagBlock = formatTaggedExerciseRefsPromptBlock(tagLines);
      if (tagBlock) parts.push(tagBlock.trimStart());
    }
    if (currentTaskContextBlock) parts.push(currentTaskContextBlock);
    const it = (taskItemType ?? '').toLowerCase();
    const showTaskModalIntakeUi =
      it === 'workout' ||
      it === 'workout_log' ||
      taskMetadataLooksWorkoutShaped(taskMetadataForContext);
    if (showTaskModalIntakeUi) parts.push(buildTaskModalIntakeUiCoachBlock());
    const liveState = readTaskModalLiveStateFromMessageMetadata(ctx.message.metadata);
    if (showTaskModalIntakeUi && liveState) parts.push(buildTaskModalLiveStateBlock(liveState));
    if (userContextBlock) parts.push(userContextBlock);
    return parts.join('\n\n');
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
    if (out.personal_cues_dropped_unanchored > 0) {
      log('warn', 'coach personal_cues unanchored drops', {
        request_id: ctx.requestId,
        slug: COACH_SLUG,
        error_kind: 'cue_unanchored',
        dropped: out.personal_cues_dropped_unanchored,
      });
    }
    return out;
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
    if (claimsIntakeUi && !hasIntakePatch) {
      log('warn', 'coach reply_content claims intake update without patch', {
        request_id: ctx.requestId,
        slug: COACH_SLUG,
      });
    }
    const fragment: CoachGuardsFragment = {
      knownTargetTaskId: extras.knownTargetTaskId,
      currentWorkoutContextJson: extras.currentWorkoutContextJson,
      priorUserMessageCount: priorUserMessageCount(ctx),
      isActiveWorkoutSession,
    };
    return applyCoachServerGuards(parsed, fragment);
  },

  async persist(parsed, ctx): Promise<RpcEnvelope> {
    const extras = readCoachExtras(ctx);
    const knownTargetTaskId = extras.knownTargetTaskId;
    const trimmedNewTitle = parsed.updated_task_title?.trim() ?? '';
    const trimmedNewDesc = parsed.updated_task_description?.trim() ?? '';
    const hasUpdateBody = trimmedNewTitle.length > 0 || trimmedNewDesc.length > 0;
    const hasProposedMeta =
      parsed.proposed_workout_metadata != null &&
      Object.keys(parsed.proposed_workout_metadata).length > 0;

    const isRailSurface = isCoachRailSurfaceFromMessageMetadata(ctx.message.metadata);
    const supabase: SharedSupabaseClient = ctx.supabase;
    const patchParam = executionPatchForRpc(parsed.execution_patch);
    const personalCuesParam = personalCuesPatchForRpc(parsed.personal_cues_resolved);
    const intakePatchParam = taskModalIntakePatchForRpc(parsed.task_modal_intake_patch);
    const hasMessageMetaPatch =
      patchParam != null || personalCuesParam != null || intakePatchParam != null;

    const shouldDirectUpdate =
      isRailSurface &&
      knownTargetTaskId !== null &&
      parsed.update_existing_task &&
      (hasUpdateBody || hasProposedMeta) &&
      !hasMessageMetaPatch;

    const shouldInsertDraft =
      !shouldDirectUpdate &&
      knownTargetTaskId !== null &&
      parsed.update_existing_task &&
      (hasUpdateBody || hasProposedMeta);

    if (shouldDirectUpdate) {
      let pNewMeta: Record<string, unknown> | null = null;
      if (hasProposedMeta) {
        const raw = parsed.proposed_workout_metadata as Record<string, unknown>;
        if (ctx.coachMergeWorkoutMetadata === true) {
          // Merge base must match the task row Coach saw in buildSystemPrompt (`taskMetadataForContext`).
          const { metadata, mergeLog } = mergeCoachProposedIntoTaskMetadata({
            base: extras.taskMetadataForContext ?? {},
            proposed: raw,
          });
          pNewMeta = metadata;
          log('info', 'coach merge workout metadata', {
            request_id: ctx.requestId,
            slug: COACH_SLUG,
            message_id: ctx.message.id,
            merge_target: mergeLog.target,
            merge_touched: mergeLog.touched,
            merge_exercise_count: mergeLog.exerciseCount,
            merge_drops: mergeLog.drops,
          });
        } else {
          pNewMeta = raw;
        }
      }
      const upd = await agentUpdateTaskAndReply(supabase, {
        p_trigger_message_id: ctx.message.id,
        p_thread_id: ctx.threadId,
        p_agent_auth_user_id: ctx.agent.auth_user_id,
        p_invoker_user_id: ctx.message.user_id,
        p_target_task_id: knownTargetTaskId!,
        p_reply_text: parsed.reply_content,
        p_new_title: trimmedNewTitle.length > 0 ? trimmedNewTitle : null,
        p_new_description: trimmedNewDesc.length > 0 ? trimmedNewDesc : null,
        p_new_metadata: pNewMeta,
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
        p_reply_text: parsed.reply_content,
        p_proposed_title: trimmedNewTitle.length > 0 ? trimmedNewTitle : null,
        p_proposed_description: trimmedNewDesc.length > 0 ? trimmedNewDesc : null,
        p_proposed_metadata: hasProposedMeta ? parsed.proposed_workout_metadata! : {},
        p_execution_patch: patchParam,
        p_personal_cues: personalCuesParam,
        p_task_modal_intake_patch: intakePatchParam,
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
    } = {
      p_trigger_message_id: ctx.message.id,
      p_thread_id: ctx.threadId,
      p_agent_auth_user_id: ctx.agent.auth_user_id,
      p_invoker_user_id: ctx.message.user_id,
      p_reply_text: parsed.reply_content,
      p_create_card: parsed.create_card,
      p_task_type: 'workout',
      p_task_status: 'todo',
    };
    if (parsed.create_card && parsed.task_title) {
      rpcArgs.p_task_title = parsed.task_title;
      rpcArgs.p_task_description = parsed.task_description ?? null;
      rpcArgs.p_seed_task_comment_text = parsed.coach_task_notes ?? null;
    }
    rpcArgs.p_execution_patch = patchParam;
    rpcArgs.p_personal_cues = personalCuesParam;
    rpcArgs.p_task_modal_intake_patch = intakePatchParam;

    const card = await agentCreateCardAndReply(supabase, rpcArgs);
    if (!card.ok) {
      log('error', 'coach persist card rpc failed', {
        request_id: ctx.requestId,
        slug: COACH_SLUG,
        message_id: ctx.message.id,
        error: card.error,
      });
      throw new Error(`rpc_failed:${card.error}`);
    }
    return { ok: true, data: card.data };
  },
};

// Importing `readWorkoutContextFromMessageMetadata` keeps it co-resident with the
// other context helpers without forcing the strategy to use it; reserved for future
// strategies (e.g. an Organizer-side trigger) that may need the raw payload.
void readWorkoutContextFromMessageMetadata;
