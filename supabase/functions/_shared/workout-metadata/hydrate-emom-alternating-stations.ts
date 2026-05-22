/** MIRROR FILE — canonical lives at `src/lib/agents/_shared/workout-metadata/hydrate-emom-alternating-stations.ts`.
 *
 * Body below is byte-for-byte identical to the canonical Vitest-side file (excluding
 * this header). Any change must be hand-mirrored — run `pnpm check:agent-mirror` to verify parity.
 */

function alternatingStationsMissingOrEmpty(params: Record<string, unknown>): boolean {
  const raw = params.alternating_stations;
  if (raw == null) return true;
  if (!Array.isArray(raw) || raw.length === 0) return true;
  return false;
}

/** Build [[0], [1], …, [n-1]] for simple A/B/C alternating EMOM (one station per minute). */
export function buildDefaultAlternatingStationsMatrix(exerciseCount: number): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < exerciseCount; i++) out.push([i]);
  return out;
}

/**
 * When is_alternating is true and alternating_stations is missing/empty,
 * inject a 1-to-1 minute cycle. Does not overwrite explicit matrices.
 */
export function hydrateEmomAlternatingStations(
  exerciseCount: number,
  params: Record<string, unknown>,
): Record<string, unknown> {
  if (params.is_alternating !== true) return params;
  if (!alternatingStationsMissingOrEmpty(params)) return params;
  if (!Number.isInteger(exerciseCount) || exerciseCount < 1) return params;
  return { ...params, alternating_stations: buildDefaultAlternatingStationsMatrix(exerciseCount) };
}
