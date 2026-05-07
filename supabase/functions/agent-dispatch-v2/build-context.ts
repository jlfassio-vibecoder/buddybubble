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
};

export async function buildDispatchContext(
  input: BuildDispatchContextInput,
): Promise<DispatchContext> {
  const { supabase, message, agent, requestId, llmTimeoutMs } = input;
  const threadId = message.parent_id ?? message.id;

  let history: HistoryRow[] = input.history ?? [];
  if (!input.history && message.bubble_id) {
    if (message.target_task_id) {
      const result = await loadThreadHistoryByTargetTask(
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
      const result = await loadThreadHistoryByParent(
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
