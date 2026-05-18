/**
 * Wall-clock budget for Vertex calls inside a single `agent-dispatch` invocation.
 * Reserves time for persist + safe-reply fallback so a slow LLM does not consume
 * the entire configured timeout and leave `fallback_ok: false` + HTTP 500.
 */

/** Time reserved after the LLM call for RPC persist or `insertSafeReply`. */
export const FALLBACK_RESERVE_MS = 12_000;

/** Soft cap on total handler wall clock (below typical Edge limits). */
export const DISPATCH_WALL_CLOCK_CAP_MS = 55_000;

/** Minimum Vertex budget so abort still fires predictably in tests. */
export const MIN_LLM_BUDGET_MS = 5_000;

/**
 * Effective Vertex timeout for this request: min(configured, remaining wall) minus reserve.
 */
export function computeLlmBudgetMs(
  configuredTimeoutMs: number,
  dispatchStartedAtMs: number,
  nowMs = Date.now(),
): number {
  const elapsed = nowMs - dispatchStartedAtMs;
  const remainingWall = DISPATCH_WALL_CLOCK_CAP_MS - elapsed;
  const cappedConfigured = Math.min(configuredTimeoutMs, remainingWall);
  const afterReserve = cappedConfigured - FALLBACK_RESERVE_MS;
  return Math.max(MIN_LLM_BUDGET_MS, afterReserve);
}
