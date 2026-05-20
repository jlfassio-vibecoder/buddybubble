import type { WorkoutExercise } from '@/lib/item-metadata';
import { formatExercisePrescriptionLineFromTask } from '@/lib/workout-factory/format-exercise-prescription-line';
import type { WorkoutSessionBlockView } from '@/lib/workout-factory/workout-session-view-model';

/**
 * One-line block summary for deck strips and compact previews (UpNext, deck chrome).
 * Subtitle logic stays aligned with `formatBlockSubtitle` via ViewModel `block.subtitle`.
 */
export function formatBlockSummaryLine(block: WorkoutSessionBlockView): string {
  const name = block.name?.trim() || 'Block';
  const subtitle = block.subtitle?.trim();
  let line = subtitle ? `${name} · ${subtitle}` : name;

  if (block.exercises.length > 0) {
    const n = block.exercises.length;
    line += ` (${n} ${n === 1 ? 'exercise' : 'exercises'})`;
    return line;
  }

  if (block.instructions.length > 0) {
    const n = block.instructions.length;
    line += ` (${n} ${n === 1 ? 'instruction' : 'instructions'})`;
  }

  return line;
}

/** Compact flat exercise line for strip summaries (legacy metadata.exercises). */
export function formatFlatExerciseLine(ex: WorkoutExercise): string | null {
  const name = ex.name?.trim();
  if (!name) return null;
  const meta = formatExercisePrescriptionLineFromTask(ex);
  return meta ? `${meta} · ${name}` : name;
}

export function formatRichWorkoutStripSummary(
  blocks: WorkoutSessionBlockView[],
  options?: { maxBlocks?: number; maxFlatExercises?: number; flatExercises?: WorkoutExercise[] },
): string | null {
  const maxBlocks = options?.maxBlocks ?? 3;
  const parts: string[] = [];

  for (const block of blocks) {
    const hasContent = block.exercises.length > 0 || block.instructions.length > 0;
    if (!hasContent) continue;
    parts.push(formatBlockSummaryLine(block));
    if (parts.length >= maxBlocks) break;
  }

  const flat = options?.flatExercises ?? [];
  const maxFlat = options?.maxFlatExercises ?? 3;
  if (parts.length === 0 && flat.length > 0) {
    const lines = flat.map(formatFlatExerciseLine).filter((s): s is string => Boolean(s));
    const clipped = lines.slice(0, maxFlat);
    const overflow = lines.length - clipped.length;
    if (clipped.length === 0) return null;
    return overflow > 0 ? `${clipped.join(' · ')} · +${overflow} more` : clipped.join(' · ');
  }

  if (parts.length === 0) return null;

  const blockText = parts.join(' · ');
  const firstFlat = flat.length > 0 ? formatFlatExerciseLine(flat[0]) : null;
  if (
    firstFlat &&
    !blockText.toLowerCase().includes(firstFlat.split(' · ').pop()?.toLowerCase() ?? '')
  ) {
    return `${blockText} · ${firstFlat}`;
  }
  return blockText;
}
