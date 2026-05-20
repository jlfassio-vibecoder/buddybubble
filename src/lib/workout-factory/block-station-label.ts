import type { BlockFormat } from '@/lib/agents/coach/block-blueprint-library';

const GROUPED_FORMATS: BlockFormat[] = ['superset', 'contrast', 'circuit', 'chipper'];

function usesStationLabels(blockFormat: BlockFormat | null): boolean {
  if (!blockFormat) return false;
  return GROUPED_FORMATS.includes(blockFormat);
}

/**
 * Station prefix for grouped block formats (A1, A2, …).
 * Returns null for straight_sets, amrap, emom, etc.
 */
export function blockStationLabel(
  blockFormat: BlockFormat | null,
  exerciseIndexInBlock: number,
): string | null {
  if (!usesStationLabels(blockFormat)) return null;
  return `A${exerciseIndexInBlock + 1}`;
}

export function blockUsesGroupedLayout(
  blockFormat: BlockFormat | null,
  exerciseCount: number,
): boolean {
  return exerciseCount > 1 && usesStationLabels(blockFormat);
}
