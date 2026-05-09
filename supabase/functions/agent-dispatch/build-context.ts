/**
 * Build the per-request `DispatchContext` the strategy methods consume.
 *
 * History loading mirrors the legacy decision branch at
 * `supabase/functions/bubble-agent-dispatch/index.ts:1421-1438`:
 *   - if the trigger row carries `target_task_id`, fetch the task-scoped history;
 *   - else if `parent_id` is set, fetch the Slack-style thread history;
 *   - else (root-level message with no thread), there is no history to load.
 *
 * Callers may pass a pre-loaded `history` to avoid double-querying when the resolver
 * already had to fetch the thread to discover an authoring agent.
 *
 * `extras` starts empty; strategies populate their own slug-namespaced sub-objects.
 */

import {
  loadThreadHistoryByParent,
  loadThreadHistoryByTargetTask,
} from '../_shared/dispatch/history.ts';
import { log } from '../_shared/obs/log.ts';
import type {
  DispatchContext,
  HistoryRow,
  NormalizedMessage,
  ResolvedAgent,
  SupabaseClient,
} from '../_shared/dispatch/types.ts';

export type BuildDispatchContextInput = {
  supabase: SupabaseClient;
  message: NormalizedMessage;
  agent: ResolvedAgent;
  requestId: string;
  /** Total time budget passed to `AbortSignal.timeout` for the LLM call. */
  llmTimeoutMs: number;
  /** Pre-loaded thread history if the resolver already had to fetch it. */
  history?: HistoryRow[] | null;
  /**
   * Optional cap on the number of `messages` rows to surface as `ctx.history`.
   * Sourced from `AgentStrategy.historyLimit`. When set:
   *
   *   - Direct loads via `loadThreadHistoryByTargetTask` /
   *     `loadThreadHistoryByParent` pass this limit so the DB query itself is
   *     bounded.
   *   - Pre-loaded `input.history` (e.g. rows the resolver in
   *     `agent-dispatch/resolve.ts:327` fetched while looking for the authoring
   *     agent) is sliced to the last N rows so the strategy and LLM never see
   *     more than N entries regardless of how the array was populated.
   *
   * Leave undefined to use the shared
   * `_shared/dispatch/history.ts:DEFAULT_HISTORY_LIMIT`.
   */
  historyLimit?: number;
};

/**
 * Return the last `limit` rows of `rows` if `limit` is a positive finite number
 * AND the array exceeds it; otherwise return the original array unchanged.
 *
 * Centralized so the slicing rule (positive int, slice from the tail to keep
 * chronological ordering intact) stays in one place. History rows arrive
 * oldest → newest from `loadThreadHistoryBy*`, so the tail is the most recent
 * window — exactly what we want to send to Vertex.
 */
function tailSlice<T>(rows: ReadonlyArray<T>, limit: number | undefined): T[] {
  if (limit === undefined || !Number.isFinite(limit) || limit <= 0) return [...rows];
  if (rows.length <= limit) return [...rows];
  return rows.slice(rows.length - limit);
}

export async function buildDispatchContext(
  input: BuildDispatchContextInput,
): Promise<DispatchContext> {
  const { supabase, message, agent, requestId, llmTimeoutMs, historyLimit } = input;
  const threadId = message.parent_id ?? message.id;

  let history: HistoryRow[] = input.history ?? [];
  if (!input.history && message.bubble_id) {
    if (message.target_task_id) {
      const result =
        historyLimit !== undefined
          ? await loadThreadHistoryByTargetTask(
              supabase,
              message.bubble_id,
              message.id,
              message.target_task_id,
              historyLimit,
            )
          : await loadThreadHistoryByTargetTask(
              supabase,
              message.bubble_id,
              message.id,
              message.target_task_id,
            );
      if (result.error) {
        log('warn', 'history load (target_task) failed', {
          request_id: requestId,
          bubble_id: message.bubble_id,
          message_id: message.id,
          error: result.error,
        });
      }
      history = result.rows;
    } else if (message.parent_id != null) {
      const result =
        historyLimit !== undefined
          ? await loadThreadHistoryByParent(
              supabase,
              message.bubble_id,
              message.id,
              message.parent_id,
              historyLimit,
            )
          : await loadThreadHistoryByParent(
              supabase,
              message.bubble_id,
              message.id,
              message.parent_id,
            );
      if (result.error) {
        log('warn', 'history load (parent) failed', {
          request_id: requestId,
          bubble_id: message.bubble_id,
          message_id: message.id,
          error: result.error,
        });
      }
      history = result.rows;
    }
  }

  // Apply the strategy's tail cap regardless of how `history` was populated.
  // Pre-loaded history (from the resolver) may be larger than the strategy
  // wants in its LLM input — the resolver intentionally loads up to
  // `DEFAULT_HISTORY_LIMIT` rows to discover the authoring agent in long
  // threads, but the strategy may want a tighter window for Vertex.
  history = tailSlice(history, historyLimit);

  return {
    supabase,
    requestId,
    message,
    agent,
    threadId,
    history,
    signal: AbortSignal.timeout(llmTimeoutMs),
    extras: {},
  };
}
