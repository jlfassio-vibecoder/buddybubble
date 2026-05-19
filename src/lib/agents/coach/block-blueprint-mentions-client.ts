/**
 * Client-side helpers for `:` block blueprint tags in chat composers.
 * Server contract: `metadata.block_blueprint_mentions` → Coach `BLOCK_BLUEPRINT_REFS`.
 */

import { classifyBlockRole } from '@/lib/agents/_shared/workout-metadata/merge-coach-proposed-into-task-metadata';
import type { BlockFormat } from '@/lib/agents/coach/block-blueprint-library';
import {
  BLOCK_BLUEPRINT_CATALOG,
  searchBlockCatalog,
  type BlockBlueprintCatalogEntry,
  type BlockCatalogGroup,
  defaultFormatParamsFor,
} from '@/lib/agents/coach/block-blueprint-catalog';
import { composerMentionTokenInMessage } from '@/lib/agents/coach/exercise-mentions';
import type {
  BlockBlueprintMentionClientPayload,
  BlockSectionRole,
} from '@/lib/agents/coach/block-blueprint-mentions';

export type BlockPickerPreset = BlockBlueprintCatalogEntry;

export type { BlockBlueprintCatalogEntry, BlockCatalogGroup };
export { BLOCK_BLUEPRINT_CATALOG, defaultFormatParamsFor, searchBlockCatalog };

/** Closed-world picker rows for the `:` composer popover. */
export const BLOCK_PICKER_PRESETS: BlockPickerPreset[] = [...BLOCK_BLUEPRINT_CATALOG];

export function sectionRoleFromName(sectionName: string): BlockSectionRole {
  return classifyBlockRole(sectionName);
}

export function filterBlockPickerPresets(
  presets: BlockPickerPreset[],
  query: string,
): BlockPickerPreset[] {
  return searchBlockCatalog(query, presets);
}

export function blockBlueprintMentionFromPick(
  preset: BlockPickerPreset,
): BlockBlueprintMentionClientPayload {
  const section_name = preset.section_name.trim();
  return {
    token: preset.token,
    section_name,
    section_role: sectionRoleFromName(section_name),
    block_format: preset.block_format,
    format_params: { ...preset.format_params },
  };
}

export function finalizeBlockBlueprintMentionsForSend(
  pending: BlockBlueprintMentionClientPayload[],
  messageText: string,
): BlockBlueprintMentionClientPayload[] | null {
  const filtered = pending.filter((m) => composerMentionTokenInMessage(messageText, m.token));
  return filtered.length > 0 ? filtered : null;
}
