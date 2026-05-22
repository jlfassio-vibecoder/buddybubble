import { formatAlternatingEmomTaxonomy } from '@/lib/workout-factory/format-alternating-taxonomy';
import { listEmomGlobalMinutesForStation } from '@/lib/workout-factory/interval-timer/resolve-emom-alternating';
import { isAlternatingEmomParams } from '@/lib/workout-factory/types/emom-format-params';
import { buildPlayerExerciseIndexLookup } from '@/lib/workout-factory/workout-player-exercise-index';
import type { WorkoutExercise } from '@/lib/item-metadata';
import type { WorkoutSessionBlockView } from '@/lib/workout-factory/workout-session-view-model';

export type EmomAlternatingGuideExercise = {
  exerciseIndex: number;
  name: string;
  global_minutes: number[];
  set_indices: number[];
};

export type EmomAlternatingGuideBlock = {
  block_name: string;
  cycle_taxonomy: string;
  exercises: EmomAlternatingGuideExercise[];
};

/**
 * Deterministic minute → local setIndex mapping for alternating EMOM blocks.
 * Returns null when no alternating EMOM blocks exist in the session.
 */
export function buildEmomAlternatingCoachGuide(
  blocks: WorkoutSessionBlockView[],
  flatExercises: WorkoutExercise[],
): EmomAlternatingGuideBlock[] | null {
  const lookup = buildPlayerExerciseIndexLookup(blocks);
  const globalByBlockAndLocal = new Map<string, Map<number, number>>();
  for (const entry of lookup) {
    let blockMap = globalByBlockAndLocal.get(entry.blockId);
    if (!blockMap) {
      blockMap = new Map();
      globalByBlockAndLocal.set(entry.blockId, blockMap);
    }
    blockMap.set(entry.exerciseIndexInBlock, entry.globalIndex);
  }

  const guideBlocks: EmomAlternatingGuideBlock[] = [];

  for (const block of blocks) {
    if (block.section !== 'main' || block.blockFormat !== 'emom') continue;
    const params = block.formatParams ?? {};
    if (!isAlternatingEmomParams(params)) continue;

    const stations = params.alternating_stations;
    const cycleTaxonomy = formatAlternatingEmomTaxonomy(stations);
    const blockMap = globalByBlockAndLocal.get(block.id);
    if (!blockMap) continue;

    const exercises: EmomAlternatingGuideExercise[] = [];
    const blockExercises = block.exercises ?? [];

    for (let localIdx = 0; localIdx < blockExercises.length; localIdx++) {
      const globalIdx = blockMap.get(localIdx);
      if (globalIdx === undefined) continue;

      const globalMinutes = listEmomGlobalMinutesForStation(localIdx, params);
      if (globalMinutes.length === 0) continue;

      const setIndices = globalMinutes.map((_, i) => i);
      const factoryEx = blockExercises[localIdx];
      const flatName = flatExercises[globalIdx]?.name?.trim();
      const factoryName =
        factoryEx && typeof factoryEx.exerciseName === 'string'
          ? factoryEx.exerciseName.trim()
          : '';
      const name = flatName || factoryName || '(unnamed)';

      exercises.push({
        exerciseIndex: globalIdx,
        name,
        global_minutes: globalMinutes,
        set_indices: setIndices,
      });
    }

    if (exercises.length > 0) {
      guideBlocks.push({
        block_name: block.name?.trim() || 'Main',
        cycle_taxonomy: cycleTaxonomy,
        exercises,
      });
    }
  }

  return guideBlocks.length > 0 ? guideBlocks : null;
}
