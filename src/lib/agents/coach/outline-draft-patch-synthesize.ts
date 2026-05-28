/**
 * Deterministic outline_draft_patch synthesis when the model omits blocks on outline co-pilot turns.
 *
 * Resolves `:finisher/amrap/metcon` tokens from message text and/or
 * `metadata.block_blueprint_mentions`, then builds merge_by_name patches.
 *
 * Deno mirror: `supabase/functions/agents/coach/outline-draft-patch-synthesize.ts`.
 * Run `pnpm check:agent-mirror` after edits.
 */

import { classifyBlockRole } from '../_shared/workout-metadata/merge-coach-proposed-into-task-metadata';
import type { BlockFormat } from './block-blueprint-library';
import { normalizeFormatParams } from './block-blueprint-library';
import type { BlockBlueprintCatalogEntry } from './block-blueprint-catalog';
import type { BlockBlueprintMentionClientPayload } from './block-blueprint-mentions';
import {
  mergeBlueprintShellsWithModelBlocks,
  synthesizeProposedBlocksFromMentions,
} from './block-blueprint-synthesize';
import { ensureOutlineExercisePlaceholders } from './outline-exercise-placeholders';
import {
  findBlockCatalogEntryInText,
  parseDurationMinutesFromText,
} from './outline-phase-b-fallback';
import type { OutlineDraftPatchV1 } from './outline-draft-patch';
import { parseCoachWorkoutOutlineWithDrops } from './parse';

function mentionFromCatalogEntry(
  entry: BlockBlueprintCatalogEntry,
): BlockBlueprintMentionClientPayload {
  return {
    token: entry.token,
    section_name: entry.section_name,
    section_role: classifyBlockRole(entry.section_name),
    block_format: entry.block_format,
    format_params: { ...entry.format_params },
  };
}

function applyDurationFromMessage(
  messageText: string,
  blockFormat: BlockFormat,
  formatParams: Record<string, unknown>,
): Record<string, unknown> {
  const duration = parseDurationMinutesFromText(messageText);
  if (duration == null) return formatParams;
  if (blockFormat === 'emom') return { ...formatParams, total_minutes: duration };
  if (blockFormat === 'amrap') return { ...formatParams, time_cap_minutes: duration };
  return formatParams;
}

function collectBlockMentions(args: {
  messageText: string;
  blockMentions: BlockBlueprintMentionClientPayload[] | null;
}): BlockBlueprintMentionClientPayload[] {
  const out: BlockBlueprintMentionClientPayload[] = [];
  const seen = new Set<string>();
  for (const mention of args.blockMentions ?? []) {
    const key = mention.token.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(mention);
  }
  const catalogFromText = findBlockCatalogEntryInText(args.messageText);
  if (catalogFromText) {
    const key = catalogFromText.token.trim().toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(mentionFromCatalogEntry(catalogFromText));
    }
  }
  return out;
}

export function synthesizeOutlineDraftPatchFromBlockIntent(args: {
  messageText: string;
  blockMentions: BlockBlueprintMentionClientPayload[] | null;
  revision: number;
  modelBlocks?: unknown;
}): OutlineDraftPatchV1 | null {
  const mentions = collectBlockMentions(args);
  if (mentions.length === 0) return null;

  const shells = synthesizeProposedBlocksFromMentions(mentions).map((shell) => {
    const format_params = normalizeFormatParams(
      shell.block_format as BlockFormat,
      applyDurationFromMessage(
        args.messageText,
        shell.block_format as BlockFormat,
        shell.format_params,
      ),
    );
    return { ...shell, format_params };
  });

  const merged = mergeBlueprintShellsWithModelBlocks(shells, args.modelBlocks);
  const withPlaceholders = ensureOutlineExercisePlaceholders(merged as Record<string, unknown>[]);
  const collect = parseCoachWorkoutOutlineWithDrops({
    coach_workout_outline: withPlaceholders,
  });
  if (!collect.outline?.length) return null;

  return {
    v: 1,
    revision: Math.max(0, Math.floor(args.revision)),
    mode: 'merge_by_name',
    blocks: collect.outline,
    clear_confirmation: true,
  };
}

export function shouldSynthesizeOutlineDraftPatch(args: {
  outlineCoPilotActive: boolean;
  hasPatch: boolean;
  patchDropReasons: string[];
  messageText: string;
  blockMentions: BlockBlueprintMentionClientPayload[] | null;
}): boolean {
  if (!args.outlineCoPilotActive || args.hasPatch) return false;
  if (args.patchDropReasons.includes('missing_blocks')) return true;
  if (args.blockMentions?.length) return true;
  return findBlockCatalogEntryInText(args.messageText) != null;
}
