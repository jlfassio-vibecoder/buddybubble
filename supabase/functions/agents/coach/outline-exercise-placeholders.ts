/**
 * Default exercise name placeholders for parametric outline blocks.
 *
 * Deno mirror: `supabase/functions/agents/coach/outline-exercise-placeholders.ts`.
 */

import {
  hydrateEmomAlternatingStations,
  isBlockFormat,
  normalizeFormatParams,
  type BlockFormat,
} from './block-blueprint-library.ts';

function defaultExercisePlaceholders(format: BlockFormat): { name: string }[] {
  switch (format) {
    case 'superset':
    case 'contrast':
      return [{ name: 'Movement A' }, { name: 'Movement B' }];
    case 'circuit':
    case 'chipper':
      return [{ name: 'Station 1' }, { name: 'Station 2' }, { name: 'Station 3' }];
    default:
      return [{ name: 'Movement' }];
  }
}

function exerciseCount(block: Record<string, unknown>): number {
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

/** Fill missing `exercises[]` placeholders after Phase B or manual structure generation. */
export function ensureOutlineExercisePlaceholders(
  blocks: Record<string, unknown>[],
): Record<string, unknown>[] {
  return blocks.map((block) => {
    if (!block || typeof block !== 'object' || Array.isArray(block)) return block;
    if (Array.isArray(block.instructions) && block.instructions.length > 0 && !block.block_format) {
      return block;
    }
    const rawFormat = block.block_format;
    if (typeof rawFormat !== 'string' || !isBlockFormat(rawFormat)) return block;
    if (exerciseCount(block) > 0) return block;

    const format = rawFormat as BlockFormat;
    let formatParams = normalizeFormatParams(format, block.format_params);
    const exercises = defaultExercisePlaceholders(format);
    if (format === 'emom') {
      formatParams = hydrateEmomAlternatingStations(exercises.length, formatParams);
    }
    const next: Record<string, unknown> = { ...block, exercises, format_params: formatParams };
    return next;
  });
}
