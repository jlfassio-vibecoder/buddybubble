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

function omitIsCombo(params: Record<string, unknown>): Record<string, unknown> {
  if (!('is_combo' in params)) return params;
  const { is_combo: _removed, ...rest } = params;
  return rest;
}

/** Build [[0], [1], …, [n-1]] for simple A/B/C alternating EMOM (one station per minute). */
export function buildDefaultAlternatingStationsMatrix(exerciseCount: number): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < exerciseCount; i++) out.push([i]);
  return out;
}

/**
 * A / B+C combo circuit: solo minutes for early exercises, last two paired on one minute.
 * Example: 3 exercises -> [[0], [1, 2]]; 4 -> [[0], [1], [2, 3]]; 2 -> [[0, 1]].
 */
export function buildComboAlternatingStationsMatrix(exerciseCount: number): number[][] {
  if (!Number.isInteger(exerciseCount) || exerciseCount < 2) {
    return buildDefaultAlternatingStationsMatrix(exerciseCount);
  }
  if (exerciseCount === 2) return [[0, 1]];
  const out: number[][] = [];
  for (let i = 0; i < exerciseCount - 2; i++) out.push([i]);
  out.push([exerciseCount - 2, exerciseCount - 1]);
  return out;
}

/**
 * When is_alternating is true and alternating_stations is missing/empty,
 * inject a minute cycle (1-to-1 or combo). Does not overwrite explicit matrices.
 * Always strips internal is_combo from the returned params.
 */
export function hydrateEmomAlternatingStations(
  exerciseCount: number,
  params: Record<string, unknown>,
): Record<string, unknown> {
  const stripped = omitIsCombo(params);
  if (stripped.is_alternating !== true) return stripped;
  if (!alternatingStationsMissingOrEmpty(stripped)) return stripped;
  if (!Number.isInteger(exerciseCount) || exerciseCount < 1) return stripped;

  const useCombo = params.is_combo === true && exerciseCount >= 2;
  const alternating_stations = useCombo
    ? buildComboAlternatingStationsMatrix(exerciseCount)
    : buildDefaultAlternatingStationsMatrix(exerciseCount);

  return { ...stripped, alternating_stations };
}
