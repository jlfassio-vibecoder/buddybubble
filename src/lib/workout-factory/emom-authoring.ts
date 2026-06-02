import type {
  EmomAlternatingMinute,
  EmomFormatParams,
  EmomStationDraft,
} from '@/lib/workout-factory/types/emom-format-params';

export type EmomAuthoringDraft = {
  total_minutes: number;
  track_active_pacing: boolean;
  stations: EmomStationDraft[];
};

const DEFAULT_INTERVAL_SECONDS = 60;
const DEFAULT_TOTAL_MINUTES = 10;

export function defaultEmomAuthoringDraft(exerciseCount: number): EmomAuthoringDraft {
  const stations: EmomStationDraft[] =
    exerciseCount > 0
      ? [
          {
            is_rest: false,
            exercise_index: 0,
            target_type: 'reps',
            target_value: null,
          },
        ]
      : [];
  return {
    total_minutes: DEFAULT_TOTAL_MINUTES,
    track_active_pacing: true,
    stations,
  };
}

function positiveInt(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const n = Math.round(v);
  return n > 0 ? n : null;
}

function parseStationDraft(raw: unknown): EmomStationDraft | null {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (o.is_rest === true) return { is_rest: true };
  if (o.is_rest !== false) return null;
  const exercise_index =
    typeof o.exercise_index === 'number' && Number.isFinite(o.exercise_index)
      ? Math.max(0, Math.round(o.exercise_index))
      : null;
  if (exercise_index == null) return null;
  const target_type = o.target_type === 'time' ? 'time' : o.target_type === 'reps' ? 'reps' : null;
  if (!target_type) return null;
  let target_value: number | null = null;
  if (o.target_value != null) {
    const n = Number(o.target_value);
    if (Number.isFinite(n) && n >= 0) target_value = Math.round(n);
  }
  return { is_rest: false, exercise_index, target_type, target_value };
}

export function parseEmomStationsFromParams(
  params: Record<string, unknown>,
): EmomStationDraft[] | null {
  return normalizeEmomStationsArray(params.stations);
}

/** Normalize rich `stations` from formatParams (coach ingest + metadata patches). */
export function normalizeEmomStationsArray(raw: unknown): EmomStationDraft[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: EmomStationDraft[] = [];
  for (const item of raw) {
    const parsed = parseStationDraft(item);
    if (parsed) out.push(parsed);
  }
  return out.length > 0 ? out : null;
}

/**
 * After flat exercise list edits: out-of-range work stations become rest slots
 * (preserves cycle length; avoids orphaned exercise_index values).
 */
export function reconcileEmomStationsForExerciseCount(
  stations: EmomStationDraft[],
  exerciseCount: number,
): EmomStationDraft[] {
  if (exerciseCount <= 0) {
    return stations.map(() => ({ is_rest: true }));
  }
  return stations.map((station) => {
    if (station.is_rest) return station;
    if (station.exercise_index >= exerciseCount) {
      return { is_rest: true };
    }
    return station;
  });
}

/** Reconstruct authoring cycle from legacy alternating_stations (cycle length preserved). */
export function stationsFromAlternatingCycle(
  alternating: readonly EmomAlternatingMinute[],
): EmomStationDraft[] {
  return alternating.map((slot) => {
    const idx = slot[0];
    if (typeof idx !== 'number' || !Number.isFinite(idx)) {
      return { is_rest: true };
    }
    return {
      is_rest: false,
      exercise_index: Math.max(0, Math.round(idx)),
      target_type: 'reps' as const,
      target_value: null,
    };
  });
}

export function hydrateEmomAuthoringDraft(
  params: Record<string, unknown>,
  exerciseCount: number,
): EmomAuthoringDraft {
  const fromRich = parseEmomStationsFromParams(params);
  let stations = fromRich;
  if (!stations && Array.isArray(params.alternating_stations)) {
    stations = stationsFromAlternatingCycle(params.alternating_stations as EmomAlternatingMinute[]);
  }
  if (!stations || stations.length === 0) {
    return defaultEmomAuthoringDraft(exerciseCount);
  }

  const total_minutes =
    positiveInt(params.total_minutes) ?? positiveInt(params.total_rounds) ?? DEFAULT_TOTAL_MINUTES;

  const track_active_pacing =
    typeof params.track_active_pacing === 'boolean' ? params.track_active_pacing : true;

  return {
    total_minutes,
    track_active_pacing,
    stations: stations.map((s) =>
      s.is_rest
        ? { is_rest: true }
        : {
            ...s,
            exercise_index:
              exerciseCount > 0
                ? Math.min(s.exercise_index, Math.max(0, exerciseCount - 1))
                : s.exercise_index,
          },
    ),
  };
}

export type DerivedEmomLegacyParams = {
  interval_seconds: number;
  total_minutes: number;
  is_alternating: boolean;
  alternating_stations?: EmomAlternatingMinute[];
};

/**
 * Derive legacy runtime keys from rich stations + total_minutes.
 * Cycle length = stations.length (NOT padded to total_minutes); runtime repeats via modulo.
 */
export function deriveEmomLegacyParams(
  stations: EmomStationDraft[],
  totalMinutes: number,
): DerivedEmomLegacyParams {
  const total_minutes = Math.max(1, Math.round(totalMinutes));
  const hasRest = stations.some((s) => s.is_rest);
  const workStations = stations.filter(
    (s): s is Extract<EmomStationDraft, { is_rest: false }> => !s.is_rest,
  );

  if (!hasRest && workStations.length > 0) {
    const alternating_stations: EmomAlternatingMinute[] = workStations.map((s) => [
      s.exercise_index,
    ]);
    return {
      interval_seconds: DEFAULT_INTERVAL_SECONDS,
      total_minutes,
      is_alternating: true,
      alternating_stations,
    };
  }

  // Rest in cycle: legacy alternating_stations cannot represent empty rest slots (engine unchanged).
  return {
    interval_seconds: DEFAULT_INTERVAL_SECONDS,
    total_minutes,
    is_alternating: false,
  };
}

export function buildEmomFormatParamsFromDraft(draft: EmomAuthoringDraft): EmomFormatParams {
  const legacy = deriveEmomLegacyParams(draft.stations, draft.total_minutes);
  const params: EmomFormatParams = {
    interval_seconds: legacy.interval_seconds,
    total_minutes: legacy.total_minutes,
    track_active_pacing: draft.track_active_pacing,
    stations: draft.stations,
    is_alternating: legacy.is_alternating,
  };
  if (legacy.alternating_stations) {
    params.alternating_stations = legacy.alternating_stations;
  } else {
    delete params.alternating_stations;
  }
  return params;
}
