/**
 * Client-side helpers for `:` block blueprint tags in chat composers.
 * Server contract: `metadata.block_blueprint_mentions` → Coach `BLOCK_BLUEPRINT_REFS`.
 */

import { classifyBlockRole } from '@/lib/agents/_shared/workout-metadata/merge-coach-proposed-into-task-metadata';
import type { BlockFormat } from '@/lib/agents/coach/block-blueprint-library';
import { composerMentionTokenInMessage } from '@/lib/agents/coach/exercise-mentions';
import type {
  BlockBlueprintMentionClientPayload,
  BlockSectionRole,
} from '@/lib/agents/coach/block-blueprint-mentions';

export type BlockPickerPreset = {
  id: string;
  label: string;
  section_name: string;
  block_format: BlockFormat;
  format_params: Record<string, number | string>;
};

export function sectionRoleFromName(sectionName: string): BlockSectionRole {
  return classifyBlockRole(sectionName);
}

export function defaultFormatParamsFor(format: BlockFormat): Record<string, number | string> {
  switch (format) {
    case 'amrap':
      return { time_cap_minutes: 5 };
    case 'emom':
      return { interval_seconds: 60, total_minutes: 10 };
    case 'tabata':
      return { rounds: 8, work_seconds: 20, rest_seconds: 10 };
    case 'superset':
    case 'circuit':
      return { rounds: 3 };
    case 'straight_sets':
    default:
      return {};
  }
}

function presetToken(sectionName: string, format: BlockFormat): string {
  const sectionKey = sectionName.trim().toLowerCase().replace(/\s+/g, '-');
  return `:${sectionKey}/${format} `;
}

function makePreset(
  id: string,
  label: string,
  section_name: string,
  block_format: BlockFormat,
  format_params?: Record<string, number | string>,
): BlockPickerPreset {
  return {
    id,
    label,
    section_name,
    block_format,
    format_params: format_params ?? defaultFormatParamsFor(block_format),
  };
}

/** Closed-world picker rows for the `:` composer popover. */
export const BLOCK_PICKER_PRESETS: BlockPickerPreset[] = [
  makePreset('finisher-amrap', 'Finisher · AMRAP', 'Finisher', 'amrap'),
  makePreset('finisher-tabata', 'Finisher · Tabata', 'Finisher', 'tabata'),
  makePreset('finisher-emom', 'Finisher · EMOM', 'Finisher', 'emom'),
  makePreset('main-straight', 'Main · Straight sets', 'Main', 'straight_sets'),
  makePreset('main-superset', 'Main · Superset', 'Main', 'superset'),
  makePreset('main-circuit', 'Main · Circuit', 'Main', 'circuit', { rounds: 3 }),
  makePreset('main-amrap', 'Main · AMRAP', 'Main', 'amrap', { time_cap_minutes: 12 }),
  makePreset('warmup-straight', 'Warm-up · Straight sets', 'Warm-up', 'straight_sets'),
  makePreset('cooldown-straight', 'Cool down · Straight sets', 'Cool down', 'straight_sets'),
];

export function filterBlockPickerPresets(
  presets: BlockPickerPreset[],
  query: string,
): BlockPickerPreset[] {
  const q = query.trim().toLowerCase();
  if (!q) return presets;
  return presets.filter((p) => {
    const hay = `${p.label} ${p.section_name} ${p.block_format}`.toLowerCase();
    const parts = q.split('/').filter(Boolean);
    return parts.every((part) => hay.includes(part));
  });
}

export function blockBlueprintMentionFromPick(
  preset: BlockPickerPreset,
): BlockBlueprintMentionClientPayload {
  const section_name = preset.section_name.trim();
  return {
    token: presetToken(section_name, preset.block_format),
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
