function positiveInt(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const n = Math.round(v);
  return n > 0 ? n : null;
}

/**
 * Derives EMOM round count from formatParams.
 * Precedence: total_rounds → floor(total_minutes * 60 / interval_seconds) → rounds → null.
 */
export function resolveEmomTotalRounds(params: Record<string, unknown>): number | null {
  const intervalSeconds = positiveInt(params.interval_seconds);
  if (intervalSeconds == null) return null;

  const totalRounds = positiveInt(params.total_rounds);
  if (totalRounds != null) return totalRounds;

  const totalMinutes = positiveInt(params.total_minutes);
  if (totalMinutes != null) {
    return Math.floor((totalMinutes * 60) / intervalSeconds);
  }

  const legacyRounds = positiveInt(params.rounds);
  if (legacyRounds != null) return legacyRounds;

  return null;
}
