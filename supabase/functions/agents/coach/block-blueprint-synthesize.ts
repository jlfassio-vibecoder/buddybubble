/** MIRROR FILE — canonical lives at `src/lib/agents/coach/block-blueprint-synthesize.ts`.
 *
 * Body below is byte-for-byte identical to the canonical Vitest-side file (excluding
 * this header). Import paths use explicit `.ts` extensions required by Deno.
 * Any change must be hand-mirrored — run `pnpm check:agent-mirror` to verify parity.
 */

import { normalizeFormatParams } from './block-blueprint-library.ts';
import type { BlockBlueprintMentionClientPayload } from './block-blueprint-mentions.ts';

export const WORKOUT_BLOCK_INDEX_HEADER = '--- WORKOUT BLOCK INDEX (append-only rail) ---';
export const SERVER_BLOCK_SHELLS_HEADER = '--- SERVER BLOCK SHELLS (fixed structure) ---';

export type CoachProposedBlockShell = {
  name: string;
  block_format: string;
  format_params: Record<string, unknown>;
  exercises: unknown[];
};

function exerciseLabel(ex: unknown): string | null {
  if (!ex || typeof ex !== 'object' || Array.isArray(ex)) return null;
  const o = ex as Record<string, unknown>;
  const n = o.exerciseName ?? o.name;
  return typeof n === 'string' && n.trim() ? n.trim() : null;
}

function formatExerciseNameList(exercises: unknown[], max = 16): string {
  const names: string[] = [];
  for (const ex of exercises) {
    if (names.length >= max) break;
    const label = exerciseLabel(ex);
    if (label) names.push(label);
  }
  if (names.length === 0) return '(none)';
  const extra = exercises.length > names.length ? ` +${exercises.length - names.length} more` : '';
  return names.join(', ') + extra;
}

function formatBlockFormatHint(block: Record<string, unknown>): string {
  const fmt = block.blockFormat ?? block.block_format;
  const params = block.formatParams ?? block.format_params;
  const parts: string[] = [];
  if (typeof fmt === 'string' && fmt.trim()) parts.push(String(fmt));
  if (params && typeof params === 'object' && !Array.isArray(params)) {
    for (const [k, v] of Object.entries(params as Record<string, unknown>)) {
      if (v != null && v !== '') parts.push(`${k}=${v}`);
    }
  }
  return parts.length ? parts.join(', ') : 'instruction-only';
}

function appendSectionLines(lines: string[], label: string, blocks: unknown): void {
  if (!Array.isArray(blocks)) return;
  for (const raw of blocks) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const b = raw as Record<string, unknown>;
    const name =
      typeof b.name === 'string' && b.name.trim()
        ? b.name.trim()
        : typeof b.exerciseName === 'string' && b.exerciseName.trim()
          ? b.exerciseName.trim()
          : label;
    const instructions = b.instructions;
    if (Array.isArray(instructions) && instructions.length > 0) {
      lines.push(`- ${name} [${label}]: ${instructions.slice(0, 3).join('; ')}`);
      continue;
    }
    const ex = Array.isArray(b.exercises) ? b.exercises : [];
    lines.push(`- ${name} [${label}, ${formatBlockFormatHint(b)}]: ${formatExerciseNameList(ex)}`);
  }
}

/**
 * Compact block index for LIVE CO-PILOT append turns. Replaces the full ~10KB workout JSON
 * in the system prompt when `block_blueprint_mentions` is present — the server merge path
 * retains the canonical workout on the task row.
 */
export function summarizeWorkoutContextForRailBlockAppend(rawJson: string): string | null {
  const trimmed = rawJson.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const root = parsed as Record<string, unknown>;
    const lines: string[] = [
      'Existing sections on the card (server-side merge preserves all of these):',
    ];

    const af = root.ai_workout_factory;
    if (af && typeof af === 'object' && !Array.isArray(af)) {
      const ws = (af as Record<string, unknown>).workout_set;
      if (ws && typeof ws === 'object' && !Array.isArray(ws)) {
        const workouts = (ws as Record<string, unknown>).workouts;
        if (Array.isArray(workouts)) {
          for (let wi = 0; wi < workouts.length; wi++) {
            const w = workouts[wi];
            if (!w || typeof w !== 'object' || Array.isArray(w)) continue;
            const session = w as Record<string, unknown>;
            const sessionName =
              typeof session.name === 'string' && session.name.trim()
                ? session.name.trim()
                : `workout ${wi + 1}`;
            lines.push(`Session "${sessionName}":`);
            appendSectionLines(lines, 'warm-up', session.warmupBlocks);
            appendSectionLines(lines, 'main', session.exerciseBlocks);
            appendSectionLines(lines, 'finisher', session.finisherBlocks);
            appendSectionLines(lines, 'cool-down', session.cooldownBlocks);
            if (lines.length === 1) {
              appendSectionLines(lines, 'legacy', session.blocks);
            }
          }
          if (lines.length > 1) return lines.join('\n');
        }
      }
    }

    const topEx = root.exercises;
    if (Array.isArray(topEx) && topEx.length > 0) {
      lines.push(`Flat exercises: ${formatExerciseNameList(topEx)}`);
      return lines.join('\n');
    }

    return null;
  } catch {
    return null;
  }
}

export function formatRailBlockAppendWorkoutContextBlock(summary: string): string {
  return (
    `${WORKOUT_BLOCK_INDEX_HEADER}\n` +
    `${summary}\n\n` +
    'Do not rewrite or re-emit these sections. Emit proposed_workout_metadata.blocks with ONLY the new block(s) from BLOCK_BLUEPRINT_REFS / SERVER BLOCK SHELLS.'
  );
}

/** Build append-only block shells from client `block_blueprint_mentions`. */
export function synthesizeProposedBlocksFromMentions(
  mentions: BlockBlueprintMentionClientPayload[],
): CoachProposedBlockShell[] {
  return mentions.map((m) => ({
    name: m.section_name,
    block_format: m.block_format,
    format_params: normalizeFormatParams(m.block_format, m.format_params) as Record<
      string,
      unknown
    >,
    exercises: [],
  }));
}

export function formatServerBlockShellsPromptBlock(
  shells: CoachProposedBlockShell[],
): string | null {
  if (!shells.length) return null;
  const lines = shells.map((s) => JSON.stringify(s));
  return (
    `\n\n${SERVER_BLOCK_SHELLS_HEADER}\n` +
    lines.join('\n') +
    '\n\nblock_format and format_params above are FIXED by the client composer token. ' +
    'Your job on this turn: set update_existing_task true; emit proposed_workout_metadata.blocks ' +
    'with the same name, block_format, and format_params plus exercises[] filled from the user message ' +
    '(and # exercise tags when present). Keep reply_content to one short confirmation. ' +
    'Do not emit updated_task_description workout prose or unchanged blocks.'
  );
}

function shellKey(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Merge client-decided block structure with model output (exercises win from model;
 * format_params / block_format win from shells).
 */
export function mergeBlueprintShellsWithModelBlocks(
  shells: CoachProposedBlockShell[],
  modelBlocks: unknown,
): CoachProposedBlockShell[] {
  const byName = new Map<string, Record<string, unknown>>();
  if (Array.isArray(modelBlocks)) {
    for (const raw of modelBlocks) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
      const b = raw as Record<string, unknown>;
      const name = typeof b.name === 'string' ? b.name.trim() : '';
      if (name) byName.set(shellKey(name), b);
    }
  }

  return shells.map((shell) => {
    const model = byName.get(shellKey(shell.name));
    const exercises =
      model && Array.isArray(model.exercises) && model.exercises.length > 0
        ? model.exercises
        : shell.exercises;
    return {
      name: shell.name,
      block_format: shell.block_format,
      format_params: shell.format_params,
      exercises,
    };
  });
}

export function isRailBlockBlueprintAppendTurn(args: {
  isRailSurface: boolean;
  blockBlueprintMentions: BlockBlueprintMentionClientPayload[] | null;
  currentWorkoutContextJson: string | null;
}): boolean {
  return (
    args.isRailSurface &&
    args.blockBlueprintMentions != null &&
    args.blockBlueprintMentions.length > 0 &&
    args.currentWorkoutContextJson != null
  );
}
