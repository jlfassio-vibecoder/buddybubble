/** 0-based exercise index within an EMOM block. */
export type EmomStationIndex = number;

/** One minute slot in an alternating EMOM cycle (may list multiple stations). */
export type EmomAlternatingMinute = readonly EmomStationIndex[];

/** Closed-world EMOM formatParams (superset of legacy keys). */
export type EmomFormatParams = {
  interval_seconds?: number;
  total_minutes?: number;
  total_rounds?: number;
  rest_in_interval_seconds?: number;
  is_alternating?: boolean;
  alternating_stations?: readonly EmomAlternatingMinute[];
};

/** True when params declare an alternating EMOM with a valid station cycle. */
export function isAlternatingEmomParams(
  params: Record<string, unknown>,
): params is EmomFormatParams & {
  is_alternating: true;
  alternating_stations: readonly EmomAlternatingMinute[];
} {
  if (params.is_alternating !== true) return false;
  const stations = params.alternating_stations;
  if (!Array.isArray(stations) || stations.length === 0) return false;
  return stations.every(
    (minute) =>
      Array.isArray(minute) && minute.length > 0 && minute.every((i) => typeof i === 'number'),
  );
}
