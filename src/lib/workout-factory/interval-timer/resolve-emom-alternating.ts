import { isAlternatingEmomParams } from '@/lib/workout-factory/types/emom-format-params';
import { resolveEmomTotalRounds } from '@/lib/workout-factory/interval-timer/resolve-emom-total-rounds';

/** 0-based exercise indices active this minute (alternating EMOM only). */
export function resolveEmomActiveStationIndices(
  params: Record<string, unknown>,
  minuteIndex: number,
): number[] | null {
  if (!isAlternatingEmomParams(params)) return null;
  const cycle = params.alternating_stations;
  return [...(cycle[minuteIndex % cycle.length] ?? [])];
}

/** Global minute indices (0..totalRounds-1) where this station appears. */
export function listEmomGlobalMinutesForStation(
  exerciseIndexInBlock: number,
  params: Record<string, unknown>,
): number[] {
  const totalRounds = resolveEmomTotalRounds(params);
  if (totalRounds == null || totalRounds <= 0) return [];
  if (!isAlternatingEmomParams(params)) return [];
  const cycle = params.alternating_stations;
  const out: number[] = [];
  for (let r = 0; r < totalRounds; r++) {
    const slot = cycle[r % cycle.length] ?? [];
    if (slot.includes(exerciseIndexInBlock)) out.push(r);
  }
  return out;
}

/** Log rows for one station = number of minutes it is active. */
export function countEmomStationLogRows(
  exerciseIndexInBlock: number,
  params: Record<string, unknown>,
): number {
  return listEmomGlobalMinutesForStation(exerciseIndexInBlock, params).length;
}

/** Local 0-based set row to highlight, or null when station inactive this minute. */
export function resolveEmomLocalHighlightSetIndex(
  exerciseIndexInBlock: number,
  minuteIndex: number,
  params: Record<string, unknown>,
): number | null {
  const appearances = listEmomGlobalMinutesForStation(exerciseIndexInBlock, params);
  const pos = appearances.indexOf(minuteIndex);
  return pos >= 0 ? pos : null;
}
