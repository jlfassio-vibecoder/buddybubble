/**
 * Outline draft context for Coach rail / builder — client metadata + server prompt blocks.
 *
 * Deno mirror: `supabase/functions/agents/coach/build-outline-draft-context.ts`.
 * Run `pnpm check:agent-mirror` after edits.
 */

import { COACH_OUTLINE_STATUS_VALUES, type CoachOutlineStatus } from './coach-outline-metadata.ts';
import type { BlockShapeDrop } from './parse.ts';

export const OUTLINE_DRAFT_CONTEXT_HEADER = '--- CURRENT OUTLINE DRAFT ---';

export const MAX_OUTLINE_DRAFT_DROPS = 6;
export const MAX_OUTLINE_DRAFT_BLOCKS = 32;
export const MAX_OUTLINE_DRAFT_JSON_BYTES = 12_000;

export type TaskModalOutlineDraftV1 = {
  v: 1;
  revision: number;
  status: CoachOutlineStatus;
  confirmed: boolean;
  blocks: Record<string, unknown>[];
  drops?: BlockShapeDrop[];
};

const FORMAT_LABELS: Record<string, string> = {
  straight_sets: 'Straight sets',
  superset: 'Superset',
  circuit: 'Circuit',
  amrap: 'AMRAP',
  emom: 'EMOM',
  tabata: 'Tabata',
  ladder: 'Ladder',
  chipper: 'Chipper',
  pyramid: 'Pyramid',
  contrast: 'Contrast',
  clusters: 'Clusters',
  drop_sets: 'Drop sets',
};

function isPlainBlock(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

function blockFormatLabel(format: string | null | undefined): string {
  if (typeof format === 'string' && format in FORMAT_LABELS) {
    return FORMAT_LABELS[format] ?? format;
  }
  return format?.trim() || 'Instruction';
}

/** Compact one-line summary for prompt injection (mirrored; no outline-editor-client import). */
// Copilot suggestion ignored: Duplicated intentionally so Coach/Edge modules stay free of outline-editor-client imports (mirror parity).
export function outlineBlockSummaryForDraftContext(block: Record<string, unknown>): string {
  const name = typeof block.name === 'string' && block.name.trim() ? block.name.trim() : 'Block';
  const instructions = Array.isArray(block.instructions)
    ? block.instructions.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    : [];
  if (instructions.length > 0 && !block.block_format) {
    return `${name} — instruction block`;
  }
  const fmt = blockFormatLabel(typeof block.block_format === 'string' ? block.block_format : null);
  const params =
    block.format_params &&
    typeof block.format_params === 'object' &&
    !Array.isArray(block.format_params)
      ? (block.format_params as Record<string, unknown>)
      : {};
  const hints: string[] = [];
  if (typeof params.rounds === 'number') hints.push(`${params.rounds} rounds`);
  if (typeof params.time_cap_minutes === 'number') hints.push(`${params.time_cap_minutes} min cap`);
  if (typeof params.total_minutes === 'number') hints.push(`${params.total_minutes} min`);
  if (typeof params.interval_seconds === 'number')
    hints.push(`${params.interval_seconds}s interval`);
  const hint = hints.length ? ` (${hints.join(', ')})` : '';
  return `${name} — ${fmt}${hint}`;
}

function capBlocks(blocks: Record<string, unknown>[]): Record<string, unknown>[] {
  return blocks.slice(0, MAX_OUTLINE_DRAFT_BLOCKS);
}

function capDrops(drops: BlockShapeDrop[]): BlockShapeDrop[] {
  return drops.slice(0, MAX_OUTLINE_DRAFT_DROPS);
}

function trimPayloadToJsonBudget(payload: TaskModalOutlineDraftV1): TaskModalOutlineDraftV1 {
  let blocks = capBlocks(payload.blocks);
  let drops = payload.drops ? capDrops(payload.drops) : undefined;
  let current: TaskModalOutlineDraftV1 = { ...payload, blocks, drops };
  while (
    blocks.length > 0 &&
    new TextEncoder().encode(JSON.stringify(current)).length > MAX_OUTLINE_DRAFT_JSON_BYTES
  ) {
    blocks = blocks.slice(0, Math.max(0, blocks.length - 1));
    current = { ...current, blocks };
  }
  return current;
}

export type BuildTaskModalOutlineDraftPayloadArgs = {
  revision: number;
  status: CoachOutlineStatus;
  confirmed: boolean;
  blocks: Record<string, unknown>[];
  drops?: BlockShapeDrop[];
};

/** Build client metadata payload (pass pre-normalized blocks from the outline editor). */
export function buildTaskModalOutlineDraftPayload(
  args: BuildTaskModalOutlineDraftPayloadArgs,
): TaskModalOutlineDraftV1 {
  const revision = Number.isFinite(args.revision) ? Math.max(0, Math.floor(args.revision)) : 0;
  const status = (COACH_OUTLINE_STATUS_VALUES as readonly string[]).includes(args.status)
    ? args.status
    : 'ready';
  const blocks = capBlocks(args.blocks.filter((b) => isPlainBlock(b)).map((b) => ({ ...b })));
  const drops = args.drops?.length ? capDrops(args.drops) : undefined;
  return trimPayloadToJsonBudget({
    v: 1,
    revision,
    status,
    confirmed: Boolean(args.confirmed),
    blocks,
    ...(drops?.length ? { drops } : {}),
  });
}

function coerceMessageMetadataRoot(meta: unknown): Record<string, unknown> | null {
  if (meta == null) return null;
  if (typeof meta === 'string') {
    try {
      return coerceMessageMetadataRoot(JSON.parse(meta));
    } catch {
      return null;
    }
  }
  if (typeof meta !== 'object' || Array.isArray(meta)) return null;
  return meta as Record<string, unknown>;
}

export function readTaskModalOutlineDraftFromMessageMetadata(
  meta: unknown,
): TaskModalOutlineDraftV1 | null {
  const root = coerceMessageMetadataRoot(meta);
  if (!root) return null;
  const raw = root.task_modal_outline_draft;
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (o.v !== 1) return null;
  const revRaw = o.revision;
  const revision =
    typeof revRaw === 'number' && Number.isFinite(revRaw)
      ? Math.max(0, Math.floor(revRaw))
      : typeof revRaw === 'string' && /^\d+$/.test(revRaw.trim())
        ? Math.max(0, parseInt(revRaw.trim(), 10))
        : null;
  if (revision === null) return null;
  const statusRaw = o.status;
  const status =
    typeof statusRaw === 'string' &&
    (COACH_OUTLINE_STATUS_VALUES as readonly string[]).includes(statusRaw)
      ? (statusRaw as CoachOutlineStatus)
      : 'ready';
  const blocksRaw = o.blocks;
  if (!Array.isArray(blocksRaw)) return null;
  const blocks = capBlocks(blocksRaw.filter((b) => isPlainBlock(b)).map((b) => ({ ...b })));
  const confirmed = Boolean(o.confirmed);
  const dropsRaw = o.drops;
  const drops = Array.isArray(dropsRaw)
    ? capDrops(
        dropsRaw.filter(
          (d) =>
            d &&
            typeof d === 'object' &&
            !Array.isArray(d) &&
            typeof (d as { field?: unknown }).field === 'string' &&
            typeof (d as { reason?: unknown }).reason === 'string',
        ) as BlockShapeDrop[],
      )
    : undefined;
  return trimPayloadToJsonBudget({
    v: 1,
    revision,
    status,
    confirmed,
    blocks,
    ...(drops?.length ? { drops } : {}),
  });
}

export function buildOutlineDraftContextBlock(
  payload: TaskModalOutlineDraftV1,
  title?: string | null,
): string {
  const lines: string[] = [
    OUTLINE_DRAFT_CONTEXT_HEADER,
    'This is the live workout structure draft the member is editing (may include unsaved UI changes). Treat block names and format_params as ground truth for structure discussion. Do not invent exercises or full prescriptions here — structure only.',
    `revision: ${payload.revision}`,
    `status: ${payload.status}`,
    `confirmed: ${payload.confirmed}`,
  ];
  if (title?.trim()) lines.push(`workout_title: ${JSON.stringify(title.trim())}`);
  if (payload.blocks.length === 0) {
    lines.push('blocks: (empty — help the member add structure)');
  } else {
    lines.push('blocks:');
    for (let i = 0; i < payload.blocks.length; i++) {
      lines.push(`  ${i + 1}. ${outlineBlockSummaryForDraftContext(payload.blocks[i])}`);
    }
  }
  if (payload.drops?.length) {
    lines.push(`validation_drops: ${JSON.stringify(payload.drops)}`);
  }
  lines.push(
    'When patching via outline_draft_patch, echo revision above; route timing to format_params (e.g. time_cap_minutes), not block name.',
  );
  return lines.join('\n');
}

export function buildOutlineDraftContextBlockFromStored(args: {
  outline: Record<string, unknown>[] | null;
  status?: CoachOutlineStatus;
  revision?: number;
  title?: string | null;
}): string | null {
  if (!args.outline?.length) return null;
  const payload = buildTaskModalOutlineDraftPayload({
    revision: args.revision ?? 0,
    status: args.status ?? 'ready',
    confirmed: false,
    blocks: args.outline,
  });
  return buildOutlineDraftContextBlock(payload, args.title);
}
