/**
 * MIRROR FILE — canonical lives at `src/lib/agents/coach/outline-block-name-sanitize.ts`.
 * Run `pnpm check:agent-mirror` after edits.
 */

import type { BlockShapeDrop } from './block-blueprint-library.ts';

export const OUTLINE_BLOCK_NAME_MAX_LEN = 40;
export const OUTLINE_EXERCISE_NAME_MAX_LEN = 40;
export const MAX_OUTLINE_EXERCISES_PER_BLOCK = 12;
export const MAX_INSTRUCTION_LINES = 4;
export const MAX_INSTRUCTION_LINE_LEN = 200;

/** Trim, collapse whitespace, slice to maxLen (prefer last word boundary in second half). */
export function clampOutlineBlockName(raw: string, maxLen = OUTLINE_BLOCK_NAME_MAX_LEN): string {
  const collapsed = raw.trim().replace(/\s+/g, ' ');
  if (collapsed.length <= maxLen) return collapsed;
  const slice = collapsed.slice(0, maxLen);
  const lastSpace = slice.lastIndexOf(' ');
  if (lastSpace > maxLen * 0.5) return slice.slice(0, lastSpace).trim();
  return slice.trim();
}

export function clampOutlineExerciseName(
  raw: string,
  maxLen = OUTLINE_EXERCISE_NAME_MAX_LEN,
): string {
  return clampOutlineBlockName(raw, maxLen);
}

/** Heuristic: timing/count/format prose belongs in format_params and exercises[], not name. */
export function isVerboseOutlineBlockName(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) return false;
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length > 8) return true;
  if (/\b\d+\s*min(?:ute)?s?\b/i.test(trimmed)) return true;
  if (/\(/.test(trimmed)) return true;
  if (/\b\d+\s+exercises?\b/i.test(trimmed)) return true;
  if (/\beach\s+block\b/i.test(trimmed)) return true;
  // Dash-separated prescription tails (e.g. "… - 4 Exercises"), not short labels ("Main — Functional Circuit").
  if (
    words.length > 5 &&
    /\s[-–—]\s/.test(trimmed) &&
    /\b(amrap|emom|tabata|min|rounds?|exercises?|stations?)\b/i.test(trimmed)
  ) {
    return true;
  }
  if (words.length > 5 && /\b(rounds?|exercises?|stations?)\b/i.test(trimmed)) return true;
  return false;
}

export type SanitizeBlockNameResult = {
  name: string | null;
  dropped: boolean;
  clamped: boolean;
};

export function sanitizeOutlineBlockName(
  raw: unknown,
  field: string,
  drops: BlockShapeDrop[],
): SanitizeBlockNameResult {
  if (typeof raw !== 'string' || !raw.trim()) {
    return { name: null, dropped: false, clamped: false };
  }
  const collapsed = raw.trim().replace(/\s+/g, ' ');
  const clampedName = clampOutlineBlockName(collapsed);
  const wasClamped = collapsed.length > clampedName.length;

  if (isVerboseOutlineBlockName(collapsed)) {
    drops.push({ field, reason: 'block_name_too_verbose' });
    return { name: null, dropped: true, clamped: wasClamped };
  }
  if (wasClamped) {
    drops.push({ field, reason: 'block_name_clamped' });
  }
  return { name: clampedName, dropped: false, clamped: wasClamped };
}

/** Cap instruction lines for outline-shaped blocks. */
export function capOutlineInstructionLines(lines: string[]): string[] {
  return lines
    .slice(0, MAX_INSTRUCTION_LINES)
    .map((s) =>
      s.length > MAX_INSTRUCTION_LINE_LEN ? s.slice(0, MAX_INSTRUCTION_LINE_LEN).trim() : s,
    )
    .filter((s) => s.length > 0);
}

export type SanitizeOutlinePatchBlocksResult = {
  blocks: Record<string, unknown>[];
  drops: BlockShapeDrop[];
};

/** Belt-and-suspenders pass for outline_draft_patch blocks (server-guards). */
export function sanitizeOutlinePatchBlocks(
  blocks: Record<string, unknown>[],
  fieldPrefix: string,
): SanitizeOutlinePatchBlocksResult {
  const drops: BlockShapeDrop[] = [];
  const out: Record<string, unknown>[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const blk = blocks[i];
    if (!blk || typeof blk !== 'object' || Array.isArray(blk)) continue;
    const field = `${fieldPrefix}[${i}].name`;
    const nameResult = sanitizeOutlineBlockName(blk.name, field, drops);
    if (nameResult.dropped) continue;
    const next: Record<string, unknown> = { ...blk };
    if (nameResult.name) next.name = nameResult.name;
    else delete next.name;
    if (Array.isArray(next.exercises)) {
      next.exercises = (next.exercises as unknown[])
        .slice(0, MAX_OUTLINE_EXERCISES_PER_BLOCK)
        .map((ex) => {
          if (!ex || typeof ex !== 'object' || Array.isArray(ex)) return ex;
          const row = { ...(ex as Record<string, unknown>) };
          if (typeof row.name === 'string' && row.name.trim()) {
            row.name = clampOutlineExerciseName(row.name);
          }
          return row;
        });
    }
    if (Array.isArray(next.instructions)) {
      const lines = capOutlineInstructionLines(
        (next.instructions as unknown[]).filter((x): x is string => typeof x === 'string'),
      );
      if (lines.length > 0) next.instructions = lines;
      else delete next.instructions;
    }
    if (Object.keys(next).length > 0) out.push(next);
  }
  return { blocks: out, drops };
}
