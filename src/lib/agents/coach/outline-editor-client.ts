/**
 * Client helpers for the Task Modal outline structure editor (Hop 2).
 */

import type { BlockBlueprintCatalogEntry } from '@/lib/agents/coach/block-blueprint-catalog';
import { classifyBlockRole } from '@/lib/agents/_shared/workout-metadata/merge-coach-proposed-into-task-metadata';
import {
  BLOCK_FORMAT_ENUM,
  FORMAT_PARAM_KEYS_BY_FORMAT,
  normalizeFormatParams,
  REQUIRED_FORMAT_PARAMS_BY_FORMAT,
  type BlockFormat,
  validateBlockShape,
} from '@/lib/agents/coach/block-blueprint-library';
import { ensureOutlineExercisePlaceholders } from '@/lib/agents/coach/outline-exercise-placeholders';
import { parseCoachWorkoutOutlineWithDrops, type BlockShapeDrop } from '@/lib/agents/coach/parse';
import { preflightOutlineBlocks } from '@/lib/workout-factory/outline-block-preflight';

export type FormatParamFieldMeta = {
  key: string;
  label: string;
  type: 'number' | 'boolean' | 'select' | 'string';
  required: boolean;
  options?: { value: string; label: string }[];
};

const FORMAT_LABELS: Record<BlockFormat, string> = {
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

const PARAM_LABELS: Record<string, string> = {
  rest_between_sets_seconds: 'Rest between sets (sec)',
  target_rpe: 'Target RPE',
  rounds: 'Rounds',
  rest_between_rounds_seconds: 'Rest between rounds (sec)',
  pairing_notes: 'Pairing notes',
  rest_between_exercises_seconds: 'Rest between exercises (sec)',
  time_cap_minutes: 'Time cap (min)',
  target_rounds: 'Target rounds',
  interval_seconds: 'Interval (sec)',
  total_minutes: 'Total minutes',
  total_rounds: 'Total rounds',
  rest_in_interval_seconds: 'Rest in interval (sec)',
  is_alternating: 'Alternating stations',
  work_seconds: 'Work (sec)',
  rest_seconds: 'Rest (sec)',
  start_reps: 'Start reps',
  peak_reps: 'Peak reps',
  step_reps: 'Step reps',
  direction: 'Direction',
  reps_per_cluster: 'Reps per cluster',
  clusters: 'Clusters',
  intra_cluster_rest_seconds: 'Intra-cluster rest (sec)',
  drop_percent: 'Drop percent',
  drops: 'Drop count',
};

const EDITOR_HIDDEN_FORMAT_PARAM_KEYS = new Set(['is_combo', 'alternating_stations']);

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

export function catalogPresetToOutlineBlock(
  preset: BlockBlueprintCatalogEntry,
): Record<string, unknown> {
  const formatParams = normalizeFormatParams(preset.block_format, preset.format_params);
  const block: Record<string, unknown> = {
    name: preset.section_name,
    block_format: preset.block_format,
    format_params: formatParams,
    exercises: defaultExercisePlaceholders(preset.block_format),
  };
  return ensureOutlineExercisePlaceholders([block])[0] ?? block;
}

export function createInstructionBlock(name: string, lines: string[]): Record<string, unknown> {
  const trimmedName = name.trim() || 'Prep';
  const instructions = lines.map((l) => l.trim()).filter((l) => l.length > 0);
  return { name: trimmedName, instructions };
}

export function normalizeOutlineDraft(blocks: Record<string, unknown>[]): {
  blocks: Record<string, unknown>[];
  drops: BlockShapeDrop[];
} {
  const { blocks: normalized, drops } = preflightOutlineBlocks(blocks);
  return { blocks: ensureOutlineExercisePlaceholders(normalized), drops };
}

export function formatParamFieldMeta(format: BlockFormat): FormatParamFieldMeta[] {
  const keys = FORMAT_PARAM_KEYS_BY_FORMAT[format].filter(
    (key) => !EDITOR_HIDDEN_FORMAT_PARAM_KEYS.has(key),
  );
  const required = new Set(REQUIRED_FORMAT_PARAMS_BY_FORMAT[format]);
  return keys.map((key) => {
    if (key === 'direction') {
      return {
        key,
        label: PARAM_LABELS.direction ?? key,
        type: 'select' as const,
        required: required.has(key),
        options: [
          { value: 'ascending', label: 'Ascending' },
          { value: 'descending', label: 'Descending' },
        ],
      };
    }
    if (key === 'is_alternating' || key === 'is_combo') {
      return {
        key,
        label: PARAM_LABELS[key] ?? key,
        type: 'boolean' as const,
        required: required.has(key),
      };
    }
    if (key === 'pairing_notes') {
      return {
        key,
        label: PARAM_LABELS.pairing_notes ?? key,
        type: 'string' as const,
        required: required.has(key),
      };
    }
    return {
      key,
      label: PARAM_LABELS[key] ?? key.replace(/_/g, ' '),
      type: 'number' as const,
      required: required.has(key),
    };
  });
}

export function blockFormatLabel(format: string | null | undefined): string {
  if (typeof format === 'string' && (BLOCK_FORMAT_ENUM as readonly string[]).includes(format)) {
    return FORMAT_LABELS[format as BlockFormat];
  }
  return format?.trim() || 'Instruction';
}

export function outlineBlockSummary(block: Record<string, unknown>): string {
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

export function canAddExerciseToBlock(block: Record<string, unknown>): boolean {
  const format = block.block_format;
  if (typeof format !== 'string' || !(BLOCK_FORMAT_ENUM as readonly string[]).includes(format)) {
    return false;
  }
  const exercises = Array.isArray(block.exercises) ? block.exercises : [];
  const bf = format as BlockFormat;
  if (bf === 'superset' || bf === 'contrast') return exercises.length < 2;
  return true;
}

export function canRemoveExerciseFromBlock(block: Record<string, unknown>): boolean {
  const format = block.block_format;
  if (typeof format !== 'string' || !(BLOCK_FORMAT_ENUM as readonly string[]).includes(format)) {
    return false;
  }
  const exercises = Array.isArray(block.exercises) ? block.exercises : [];
  const bf = format as BlockFormat;
  const params = normalizeFormatParams(
    bf,
    block.format_params &&
      typeof block.format_params === 'object' &&
      !Array.isArray(block.format_params)
      ? (block.format_params as Record<string, unknown>)
      : {},
  );
  const minCount =
    bf === 'superset' || bf === 'contrast' ? 2 : bf === 'circuit' || bf === 'chipper' ? 3 : 0;
  if (exercises.length <= minCount) return false;
  const shape = validateBlockShape(bf, exercises.length - 1, params);
  return shape == null || exercises.length - 1 >= minCount;
}

export function blockShapeDropMessage(drop: BlockShapeDrop): string {
  const messages: Record<string, string> = {
    unknown_block_format: 'Unknown block format',
    superset_cardinality: 'Superset requires exactly 2 exercises',
    circuit_cardinality: 'Circuit requires at least 3 exercises',
    emom_missing_params: 'EMOM needs interval and duration (minutes or rounds)',
    emom_alternating_invalid_stations: 'EMOM alternating stations are invalid',
    amrap_missing_time_cap: 'AMRAP needs a time cap (minutes)',
    tabata_missing_rounds: 'Tabata needs rounds',
    ladder_missing_reps: 'Ladder needs start and peak reps',
    chipper_cardinality: 'Chipper requires at least 3 exercises',
    chipper_missing_rounds: 'Chipper needs rounds',
    pyramid_missing_reps: 'Pyramid needs start and peak reps',
    contrast_cardinality: 'Contrast requires exactly 2 exercises',
    contrast_missing_rounds: 'Contrast needs rounds',
    clusters_missing_params: 'Clusters need reps per cluster and cluster count',
    drop_sets_missing_params: 'Drop sets need drop percent and drop count',
    instruction_only_requires_warmup_finisher_or_cooldown_role:
      'Instruction blocks need Warm-up, Cool-down, Finisher, or Mobility in the block name',
  };
  return messages[drop.reason] ?? `${drop.field}: ${drop.reason}`;
}

export function validateOutlineDraftForConfirm(blocks: Record<string, unknown>[]): {
  ok: boolean;
  blocks: Record<string, unknown>[];
  drops: BlockShapeDrop[];
} {
  const { blocks: normalized, drops } = normalizeOutlineDraft(blocks);
  const roleDrops: BlockShapeDrop[] = [];

  for (let i = 0; i < normalized.length; i++) {
    const block = normalized[i]!;
    const instructions = Array.isArray(block.instructions)
      ? block.instructions.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
      : [];
    const isInstructionOnly =
      instructions.length > 0 &&
      (typeof block.block_format !== 'string' || !block.block_format.trim());
    if (!isInstructionOnly) continue;

    const name = typeof block.name === 'string' ? block.name.trim() : '';
    if (classifyBlockRole(name) === 'main') {
      roleDrops.push({
        field: `blocks[${i}].name`,
        reason: 'instruction_only_requires_warmup_finisher_or_cooldown_role',
      });
    }
  }

  const allDrops = [...drops, ...roleDrops];
  if (normalized.length === 0) {
    return { ok: false, blocks: normalized, drops: allDrops };
  }
  if (roleDrops.length > 0) {
    return { ok: false, blocks: normalized, drops: allDrops };
  }
  return { ok: true, blocks: normalized, drops: allDrops };
}

export { parseCoachWorkoutOutlineWithDrops };
