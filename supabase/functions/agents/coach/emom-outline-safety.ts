/**
 * MIRROR FILE — canonical lives at `src/lib/agents/coach/emom-outline-safety.ts`.
 * Run `pnpm check:agent-mirror` after edits.
 */

import { hydrateEmomAlternatingStations } from '../../_shared/workout-metadata/hydrate-emom-alternating-stations.ts';
import { isBlockFormat, normalizeFormatParams } from './block-blueprint-library.ts';

function namedExerciseCount(block: Record<string, unknown>): number {
  if (!Array.isArray(block.exercises)) return 0;
  return block.exercises.filter(
    (ex) =>
      ex &&
      typeof ex === 'object' &&
      !Array.isArray(ex) &&
      typeof (ex as { name?: unknown }).name === 'string' &&
      (ex as { name: string }).name.trim().length > 0,
  ).length;
}

function isAlternatingMissing(params: Record<string, unknown>): boolean {
  if (!('is_alternating' in params)) return true;
  const v = params.is_alternating;
  return v === undefined || v === null;
}

/**
 * Ensures multi-exercise EMOM blocks default to alternating A/B (not legacy density).
 * Leaves blocks with explicit `is_alternating: false` unchanged (density intent).
 */
export function applyEmomMultiExerciseAlternatingSafety(
  outline: Record<string, unknown>[] | null,
): Record<string, unknown>[] | null {
  if (outline == null || outline.length === 0) return outline;

  return outline.map((block) => {
    if (!block || typeof block !== 'object' || Array.isArray(block)) return block;
    const rawFormat = block.block_format;
    if (!isBlockFormat(rawFormat) || rawFormat !== 'emom') return block;

    const exerciseCount = namedExerciseCount(block);
    if (exerciseCount < 2) return block;

    let formatParams = normalizeFormatParams('emom', block.format_params);
    if (formatParams.is_alternating === false) {
      return { ...block, format_params: formatParams };
    }

    if (isAlternatingMissing(formatParams)) {
      const { is_combo: _removed, ...rest } = formatParams;
      formatParams = { ...rest, is_alternating: true };
    }

    if (formatParams.is_alternating === true) {
      formatParams = hydrateEmomAlternatingStations(exerciseCount, formatParams);
    }

    return { ...block, format_params: formatParams };
  });
}
