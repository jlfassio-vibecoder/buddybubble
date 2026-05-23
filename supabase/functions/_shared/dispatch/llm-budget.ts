/**
 * Wall-clock budget for Vertex calls inside a single `agent-dispatch` invocation.
 * Reserves time for persist + safe-reply fallback so a slow LLM does not consume
 * the entire configured timeout and leave `fallback_ok: false` + HTTP 500.
 */

/** Time reserved after the LLM call for RPC persist or `insertSafeReply`. */
export const FALLBACK_RESERVE_MS = 12_000;

/** Legacy default cap (pre-2026-05); kept for tests referencing the old clip at ~43s LLM budget. */
export const LEGACY_DISPATCH_WALL_CLOCK_CAP_MS = 55_000;

/** Upper bound for one agent-dispatch handler (orchestrates ~60s Vertex + persist reserve). */
export const DISPATCH_WALL_CLOCK_CAP_MS = 75_000;

/** Minimum Vertex budget so abort still fires predictably in tests. */
export const MIN_LLM_BUDGET_MS = 5_000;

/**
 * Wall-clock ceiling for this invocation so `LLM_TIMEOUT_MS` above 55s is not silently
 * clipped (previously min(60s config, 55s cap) − reserve ≈ 43s LLM budget).
 */
export function effectiveDispatchWallClockCapMs(configuredTimeoutMs: number): number {
  const neededForConfigured = configuredTimeoutMs + FALLBACK_RESERVE_MS + 2_000;
  return Math.min(
    DISPATCH_WALL_CLOCK_CAP_MS,
    Math.max(LEGACY_DISPATCH_WALL_CLOCK_CAP_MS, neededForConfigured),
  );
}

/**
 * Effective Vertex timeout for this request: min(configured, remaining wall) minus reserve.
 */
export function computeLlmBudgetMs(
  configuredTimeoutMs: number,
  dispatchStartedAtMs: number,
  nowMs = Date.now(),
): number {
  const elapsed = nowMs - dispatchStartedAtMs;
  const wallCap = effectiveDispatchWallClockCapMs(configuredTimeoutMs);
  const remainingWall = wallCap - elapsed;
  const cappedConfigured = Math.min(configuredTimeoutMs, remainingWall);
  const afterReserve = cappedConfigured - FALLBACK_RESERVE_MS;
  return Math.max(MIN_LLM_BUDGET_MS, afterReserve);
}
