/**
 * Flat, searchable block blueprint catalog for the `:` composer picker (Phase A).
 * Each row maps to the closed-world `block_format` enum — UX tokens are 3-segment strings.
 */

import type { BlockFormat } from './block-blueprint-library';
import { BLOCK_FORMAT_ENUM, REQUIRED_FORMAT_PARAMS_BY_FORMAT } from './block-blueprint-library';
export type BlockCatalogGroup =
  | 'MAIN'
  | 'CONDITIONING_AND_FINISHERS'
  | 'STRENGTH'
  | 'PREP'
  | 'RECOVERY';

export type BlockBlueprintCatalogEntry = {
  id: string;
  /** Literal composer substring, e.g. ":finisher/tabata/vo2 " */
  token: string;
  label: string;
  group: BlockCatalogGroup;
  searchAliases: string[];
  section_name: string;
  block_format: BlockFormat;
  format_params: Record<string, number | string | boolean>;
  /** Search-only; not sent on the wire */
  physiological_focus?: string;
};

export const BLOCK_CATALOG_GROUP_ORDER: readonly BlockCatalogGroup[] = [
  'MAIN',
  'CONDITIONING_AND_FINISHERS',
  'STRENGTH',
  'PREP',
  'RECOVERY',
] as const;

export const BLOCK_CATALOG_GROUP_LABELS: Readonly<Record<BlockCatalogGroup, string>> = {
  MAIN: 'MAIN',
  CONDITIONING_AND_FINISHERS: 'CONDITIONING & FINISHERS',
  STRENGTH: 'STRENGTH',
  PREP: 'PREP',
  RECOVERY: 'RECOVERY',
};

export function defaultFormatParamsFor(
  format: BlockFormat,
): Record<string, number | string | boolean> {
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
    case 'ladder':
      return { start_reps: 1, peak_reps: 10, step_reps: 1, direction: 'ascending' };
    case 'chipper':
      return { rounds: 1 };
    case 'pyramid':
      return { start_reps: 6, peak_reps: 12, step_reps: 2, direction: 'ascending' };
    case 'contrast':
      return { rounds: 4 };
    case 'clusters':
      return { reps_per_cluster: 3, clusters: 4, intra_cluster_rest_seconds: 15 };
    case 'drop_sets':
      return { drop_percent: 20, drops: 2 };
    case 'straight_sets':
    default:
      return {};
  }
}

function catalogToken(phase: string, structure: string, focus: string): string {
  return `:${phase}/${structure}/${focus} `;
}

function entry(
  id: string,
  phase: string,
  structure: string,
  focus: string,
  label: string,
  group: BlockCatalogGroup,
  section_name: string,
  block_format: BlockFormat,
  opts?: {
    format_params?: Record<string, number | string | boolean>;
    searchAliases?: string[];
    physiological_focus?: string;
  },
): BlockBlueprintCatalogEntry {
  return {
    id,
    token: catalogToken(phase, structure, focus),
    label,
    group,
    searchAliases: opts?.searchAliases ?? [],
    section_name,
    block_format,
    format_params: opts?.format_params ?? defaultFormatParamsFor(block_format),
    physiological_focus: opts?.physiological_focus,
  };
}

/** Closed-world picker catalog (~48 pre-combined tags). */
export const BLOCK_BLUEPRINT_CATALOG: readonly BlockBlueprintCatalogEntry[] = [
  // MAIN
  entry(
    'main-straight-strength',
    'main',
    'straight-sets',
    'strength',
    'Main · Straight sets · Strength',
    'MAIN',
    'Main',
    'straight_sets',
    {
      searchAliases: ['str', 'cns', 'hypertrophy'],
      physiological_focus: 'mechanical tension',
    },
  ),
  entry(
    'main-superset-push-pull',
    'main',
    'superset',
    'push-pull',
    'Main · Superset · Push–pull',
    'MAIN',
    'Main',
    'superset',
    {
      searchAliases: ['antagonist', 'pair'],
      physiological_focus: 'hypertrophy volume',
    },
  ),
  entry(
    'main-superset-hypertrophy',
    'main',
    'superset',
    'hypertrophy',
    'Main · Superset · Hypertrophy',
    'MAIN',
    'Main',
    'superset',
    { searchAliases: ['pair', 'burn'] },
  ),
  entry(
    'main-circuit-full-body',
    'main',
    'circuit',
    'full-body',
    'Main · Circuit · Full body',
    'MAIN',
    'Main',
    'circuit',
    { searchAliases: ['metcon', 'rounds'], format_params: { rounds: 3 } },
  ),
  entry(
    'main-circuit-conditioning',
    'main',
    'circuit',
    'conditioning',
    'Main · Circuit · Conditioning',
    'MAIN',
    'Main',
    'circuit',
    { searchAliases: ['cardio', 'density'], format_params: { rounds: 4 } },
  ),
  entry(
    'main-amrap-density',
    'main',
    'amrap',
    'density',
    'Main · AMRAP · Density',
    'MAIN',
    'Main',
    'amrap',
    {
      format_params: { time_cap_minutes: 12 },
      searchAliases: ['metcon', 'glycolytic'],
    },
  ),
  entry(
    'main-emom-alternating',
    'main',
    'emom',
    'alternating',
    'Main · EMOM · Alternating',
    'MAIN',
    'Main',
    'emom',
    {
      format_params: { interval_seconds: 60, total_minutes: 10, is_alternating: true },
      searchAliases: ['pacing', 'interval', 'minute', 'abc'],
    },
  ),
  entry(
    'main-emom-alternating-combo',
    'main',
    'emom',
    'alternating-combo',
    'Main · EMOM · Alternating Combo',
    'MAIN',
    'Main',
    'emom',
    {
      format_params: {
        interval_seconds: 60,
        total_minutes: 10,
        is_alternating: true,
        is_combo: true,
      },
      searchAliases: ['combo', 'a/b+c', 'paired', 'circuit'],
    },
  ),
  entry(
    'main-emom-straight',
    'main',
    'emom',
    'straight',
    'Main · EMOM · Straight',
    'MAIN',
    'Main',
    'emom',
    {
      format_params: { interval_seconds: 60, total_minutes: 10, is_alternating: false },
      searchAliases: ['single', 'station'],
    },
  ),
  entry(
    'main-tabata-power',
    'main',
    'tabata',
    'power',
    'Main · Tabata · Power',
    'MAIN',
    'Main',
    'tabata',
    { searchAliases: ['hiit', 'interval'] },
  ),
  entry(
    'main-ladder-strength',
    'main',
    'ladder',
    'strength',
    'Main · Ladder · Strength',
    'MAIN',
    'Main',
    'ladder',
    {
      format_params: { start_reps: 3, peak_reps: 8, step_reps: 1, direction: 'ascending' },
      searchAliases: ['cns', 'progression'],
      physiological_focus: 'maximal strength',
    },
  ),
  entry(
    'main-pyramid-strength',
    'main',
    'pyramid',
    'strength',
    'Main · Pyramid · Strength',
    'MAIN',
    'Main',
    'pyramid',
    {
      searchAliases: ['pyr', 'pyramid', 'progression'],
      physiological_focus: 'maximal strength',
    },
  ),
  entry(
    'main-pyramid-hypertrophy',
    'main',
    'pyramid',
    'hypertrophy',
    'Main · Pyramid · Hypertrophy',
    'MAIN',
    'Main',
    'pyramid',
    {
      format_params: { start_reps: 8, peak_reps: 15, step_reps: 2, direction: 'ascending' },
      searchAliases: ['pyr', 'volume'],
    },
  ),
  entry(
    'main-contrast-power',
    'main',
    'contrast',
    'power',
    'Main · Contrast · Power',
    'MAIN',
    'Main',
    'contrast',
    {
      format_params: { rounds: 4 },
      searchAliases: ['pap', 'contrast', 'plyo'],
    },
  ),
  entry(
    'main-contrast-strength',
    'main',
    'contrast',
    'strength',
    'Main · Contrast · Strength',
    'MAIN',
    'Main',
    'contrast',
    {
      format_params: { rounds: 5 },
      searchAliases: ['pap', 'heavy', 'explosive'],
    },
  ),
  entry(
    'main-straight-hypertrophy',
    'main',
    'straight-sets',
    'hypertrophy',
    'Main · Straight sets · Hypertrophy',
    'MAIN',
    'Main',
    'straight_sets',
    { searchAliases: ['volume', '8-12'] },
  ),

  // CONDITIONING & FINISHERS
  entry(
    'finisher-amrap-metcon',
    'finisher',
    'amrap',
    'metcon',
    'Finisher · AMRAP · Metcon',
    'CONDITIONING_AND_FINISHERS',
    'Finisher',
    'amrap',
    {
      format_params: { time_cap_minutes: 5 },
      searchAliases: ['burnout', 'glycolytic'],
    },
  ),
  entry(
    'finisher-amrap-core',
    'finisher',
    'amrap',
    'core',
    'Finisher · AMRAP · Core',
    'CONDITIONING_AND_FINISHERS',
    'Finisher',
    'amrap',
    {
      format_params: { time_cap_minutes: 5 },
      searchAliases: ['abs', 'midline'],
      physiological_focus: 'core',
    },
  ),
  entry(
    'finisher-tabata-vo2',
    'finisher',
    'tabata',
    'vo2',
    'Finisher · Tabata · VO2',
    'CONDITIONING_AND_FINISHERS',
    'Finisher',
    'tabata',
    { searchAliases: ['tab', 'hiit', 'interval'] },
  ),
  entry(
    'finisher-tabata-core',
    'finisher',
    'tabata',
    'core',
    'Finisher · Tabata · Core',
    'CONDITIONING_AND_FINISHERS',
    'Finisher',
    'tabata',
    { searchAliases: ['tab', 'abs'], physiological_focus: 'core' },
  ),
  entry(
    'finisher-emom-alternating',
    'finisher',
    'emom',
    'alternating',
    'Finisher · EMOM · Alternating',
    'CONDITIONING_AND_FINISHERS',
    'Finisher',
    'emom',
    {
      format_params: { interval_seconds: 60, total_minutes: 8, is_alternating: true },
      searchAliases: ['pacing', 'minute', 'interval'],
    },
  ),
  entry(
    'finisher-emom-alternating-combo',
    'finisher',
    'emom',
    'alternating-combo',
    'Finisher · EMOM · Alternating Combo',
    'CONDITIONING_AND_FINISHERS',
    'Finisher',
    'emom',
    {
      format_params: {
        interval_seconds: 60,
        total_minutes: 8,
        is_alternating: true,
        is_combo: true,
      },
      searchAliases: ['combo', 'a/b+c', 'paired', 'circuit'],
    },
  ),
  entry(
    'finisher-circuit-core',
    'finisher',
    'circuit',
    'core',
    'Finisher · Circuit · Core',
    'CONDITIONING_AND_FINISHERS',
    'Finisher',
    'circuit',
    {
      format_params: { rounds: 3 },
      searchAliases: ['abs', 'midline'],
      physiological_focus: 'core',
    },
  ),
  entry(
    'metcon-amrap-glycolytic',
    'metcon',
    'amrap',
    'glycolytic',
    'Metcon · AMRAP · Glycolytic',
    'CONDITIONING_AND_FINISHERS',
    'Finisher',
    'amrap',
    {
      format_params: { time_cap_minutes: 10 },
      searchAliases: ['finisher', 'density'],
    },
  ),
  entry(
    'metcon-emom-density',
    'metcon',
    'emom',
    'density',
    'Metcon · EMOM · Density',
    'CONDITIONING_AND_FINISHERS',
    'Main',
    'emom',
    {
      format_params: { interval_seconds: 60, total_minutes: 15, is_alternating: false },
      searchAliases: ['threshold', 'lactic', 'pacing'],
    },
  ),
  entry(
    'cardio-hiit-threshold',
    'cardio',
    'hiit',
    'threshold',
    'Cardio · HIIT · Threshold',
    'CONDITIONING_AND_FINISHERS',
    'Finisher',
    'emom',
    {
      format_params: { interval_seconds: 40, total_minutes: 12 },
      searchAliases: ['hiit', 'anaerobic'],
      physiological_focus: 'anaerobic threshold',
    },
  ),
  entry(
    'cardio-tabata-vo2',
    'cardio',
    'tabata',
    'vo2',
    'Cardio · Tabata · VO2',
    'CONDITIONING_AND_FINISHERS',
    'Finisher',
    'tabata',
    { searchAliases: ['tab', 'hiit'] },
  ),
  entry(
    'cardio-circuit-conditioning',
    'cardio',
    'circuit',
    'conditioning',
    'Cardio · Circuit · Conditioning',
    'CONDITIONING_AND_FINISHERS',
    'Main',
    'circuit',
    {
      format_params: { rounds: 4 },
      searchAliases: ['metcon', 'full-body'],
    },
  ),
  entry(
    'finisher-ladder-core',
    'finisher',
    'ladder',
    'core',
    'Finisher · Ladder · Core',
    'CONDITIONING_AND_FINISHERS',
    'Finisher',
    'ladder',
    {
      format_params: { start_reps: 1, peak_reps: 10, step_reps: 1, direction: 'ascending' },
      searchAliases: ['ladder', 'abs', 'midline'],
      physiological_focus: 'core',
    },
  ),
  entry(
    'finisher-ladder-metcon',
    'finisher',
    'ladder',
    'metcon',
    'Finisher · Ladder · Metcon',
    'CONDITIONING_AND_FINISHERS',
    'Finisher',
    'ladder',
    {
      format_params: {
        start_reps: 1,
        peak_reps: 10,
        step_reps: 1,
        direction: 'descending',
      },
      searchAliases: ['ladder', 'density', 'descending'],
    },
  ),
  entry(
    'metcon-chipper-density',
    'metcon',
    'chipper',
    'density',
    'Metcon · Chipper · Density',
    'CONDITIONING_AND_FINISHERS',
    'Finisher',
    'chipper',
    {
      format_params: { rounds: 1 },
      searchAliases: ['chip', 'chipper', 'metcon'],
    },
  ),
  entry(
    'finisher-chipper-core',
    'finisher',
    'chipper',
    'core',
    'Finisher · Chipper · Core',
    'CONDITIONING_AND_FINISHERS',
    'Finisher',
    'chipper',
    {
      format_params: { rounds: 1 },
      searchAliases: ['chip', 'abs', 'core'],
    },
  ),
  entry(
    'cardio-chipper-for-time',
    'cardio',
    'chipper',
    'for-time',
    'Cardio · Chipper · For time',
    'CONDITIONING_AND_FINISHERS',
    'Finisher',
    'chipper',
    {
      format_params: { rounds: 1, time_cap_minutes: 15 },
      searchAliases: ['chip', 'for-time', 'threshold'],
    },
  ),
  entry(
    'finisher-drop-sets-isolation',
    'finisher',
    'drop-sets',
    'isolation',
    'Finisher · Drop sets · Isolation',
    'CONDITIONING_AND_FINISHERS',
    'Finisher',
    'drop_sets',
    {
      format_params: { drop_percent: 15, drops: 2 },
      searchAliases: ['drop', 'burnout', 'pump'],
    },
  ),

  // STRENGTH
  entry(
    'strength-straight-cns',
    'strength',
    'straight-sets',
    'cns',
    'Strength · Straight sets · CNS',
    'STRENGTH',
    'Main',
    'straight_sets',
    {
      searchAliases: ['heavy', '5x5', 'max'],
      physiological_focus: 'maximal strength',
    },
  ),
  entry(
    'strength-straight-hypertrophy',
    'strength',
    'straight-sets',
    'hypertrophy',
    'Strength · Straight sets · Hypertrophy',
    'STRENGTH',
    'Main',
    'straight_sets',
    { searchAliases: ['volume', '8-12'] },
  ),
  entry(
    'strength-superset-antagonist',
    'strength',
    'superset',
    'antagonist',
    'Strength · Superset · Antagonist',
    'STRENGTH',
    'Main',
    'superset',
    { searchAliases: ['push-pull', 'pair'] },
  ),
  entry(
    'strength-superset-pairing',
    'strength',
    'superset',
    'pairing',
    'Strength · Superset · Pairing',
    'STRENGTH',
    'Main',
    'superset',
    { format_params: { rounds: 4, pairing_notes: 'Antagonist or same-pattern pair' } },
  ),
  entry(
    'strength-circuit-accessory',
    'strength',
    'circuit',
    'accessory',
    'Strength · Circuit · Accessory',
    'STRENGTH',
    'Main',
    'circuit',
    { format_params: { rounds: 3 }, searchAliases: ['pump', 'isolation'] },
  ),
  entry(
    'strength-pyramid-load',
    'strength',
    'pyramid',
    'load',
    'Strength · Pyramid · Load',
    'STRENGTH',
    'Main',
    'pyramid',
    {
      format_params: {
        start_reps: 5,
        peak_reps: 3,
        step_reps: 1,
        direction: 'descending',
        load_progression_percent: 5,
      },
      searchAliases: ['pyr', 'load', 'ramp'],
    },
  ),
  entry(
    'strength-clusters-cns',
    'strength',
    'clusters',
    'cns',
    'Strength · Clusters · CNS',
    'STRENGTH',
    'Main',
    'clusters',
    {
      searchAliases: ['cluster', 'density', 'cns'],
      physiological_focus: 'maximal strength',
    },
  ),
  entry(
    'strength-clusters-hypertrophy',
    'strength',
    'clusters',
    'hypertrophy',
    'Strength · Clusters · Hypertrophy',
    'STRENGTH',
    'Main',
    'clusters',
    {
      format_params: { reps_per_cluster: 4, clusters: 5, intra_cluster_rest_seconds: 20 },
      searchAliases: ['cluster', 'volume'],
    },
  ),
  entry(
    'strength-drop-sets-metabolic',
    'hypertrophy',
    'drop-sets',
    'metabolic',
    'Hypertrophy · Drop sets · Metabolic',
    'STRENGTH',
    'Main',
    'drop_sets',
    {
      searchAliases: ['drop', 'metcon', 'pump'],
    },
  ),
  entry(
    'strength-drop-sets-failure',
    'strength',
    'drop-sets',
    'failure',
    'Strength · Drop sets · Failure',
    'STRENGTH',
    'Main',
    'drop_sets',
    {
      format_params: { drop_percent: 20, drops: 3 },
      searchAliases: ['drop', 'failure', 'burnout'],
    },
  ),

  // PREP
  entry(
    'primer-activation-general',
    'primer',
    'activation',
    'general',
    'Primer · Activation · General',
    'PREP',
    'Warm-up',
    'straight_sets',
    {
      searchAliases: ['warmup', 'prep', 'glutes', 'rotator'],
      physiological_focus: 'neuromuscular activation',
    },
  ),
  entry(
    'primer-activation-core',
    'primer',
    'activation',
    'core',
    'Primer · Activation · Core',
    'PREP',
    'Warm-up',
    'straight_sets',
    {
      searchAliases: ['warmup', 'abs', 'bracing'],
      physiological_focus: 'core',
    },
  ),
  entry(
    'warmup-straight-mobility',
    'warmup',
    'straight-sets',
    'mobility',
    'Warm-up · Straight sets · Mobility',
    'PREP',
    'Warm-up',
    'straight_sets',
    { searchAliases: ['prep', 'primer', 'dynamic'] },
  ),
  entry(
    'warmup-circuit-prep',
    'warmup',
    'circuit',
    'prep',
    'Warm-up · Circuit · Prep',
    'PREP',
    'Warm-up',
    'circuit',
    {
      format_params: { rounds: 2 },
      searchAliases: ['activation', 'ramp'],
    },
  ),

  // RECOVERY
  entry(
    'cooldown-straight-mobility',
    'cooldown',
    'straight-sets',
    'mobility',
    'Cool down · Straight sets · Mobility',
    'RECOVERY',
    'Cool down',
    'straight_sets',
    { searchAliases: ['stretch', 'recovery', 'parasympathetic'] },
  ),
  entry(
    'recovery-straight-parasympathetic',
    'recovery',
    'straight-sets',
    'parasympathetic',
    'Recovery · Straight sets · Parasympathetic',
    'RECOVERY',
    'Cool down',
    'straight_sets',
    { searchAliases: ['cooldown', 'mobility', 'breath'] },
  ),
  entry(
    'recovery-circuit-mobility',
    'recovery',
    'circuit',
    'mobility',
    'Recovery · Circuit · Mobility',
    'RECOVERY',
    'Cool down',
    'circuit',
    {
      format_params: { rounds: 2 },
      searchAliases: ['stretch', 'flow'],
    },
  ),
];

function catalogSearchHaystack(e: BlockBlueprintCatalogEntry): string {
  const groupLabel = BLOCK_CATALOG_GROUP_LABELS[e.group].toLowerCase();
  const tokenBody = e.token.trim().replace(/^:/, '').toLowerCase();
  return [
    tokenBody,
    e.label,
    e.section_name,
    e.block_format,
    groupLabel,
    e.physiological_focus ?? '',
    ...e.searchAliases,
  ]
    .join(' ')
    .toLowerCase();
}

/** Fuzzy filter on token segments, label, aliases, and focus metadata. */
export function searchBlockCatalog(
  query: string,
  catalog: readonly BlockBlueprintCatalogEntry[] = BLOCK_BLUEPRINT_CATALOG,
): BlockBlueprintCatalogEntry[] {
  let q = query.trim().toLowerCase();
  if (q.startsWith(':')) q = q.slice(1);
  if (!q) return [...catalog];

  const parts = q.split('/').filter(Boolean);
  return catalog.filter((e) => {
    const hay = catalogSearchHaystack(e);
    return parts.every((part) => hay.includes(part));
  });
}

export type BlockCatalogDisplayItem =
  | { type: 'header'; group: BlockCatalogGroup; title: string }
  | { type: 'entry'; entry: BlockBlueprintCatalogEntry };

/** Browse mode: sticky group headers; search mode: flat entries only. */
export function groupCatalogForDisplay(
  entries: readonly BlockBlueprintCatalogEntry[],
  opts?: { grouped?: boolean },
): BlockCatalogDisplayItem[] {
  const grouped = opts?.grouped ?? true;
  if (!grouped || entries.length === 0) {
    return entries.map((entry) => ({ type: 'entry' as const, entry }));
  }

  const byGroup = new Map<BlockCatalogGroup, BlockBlueprintCatalogEntry[]>();
  for (const g of BLOCK_CATALOG_GROUP_ORDER) {
    byGroup.set(g, []);
  }
  for (const e of entries) {
    const list = byGroup.get(e.group);
    if (list) list.push(e);
  }

  const items: BlockCatalogDisplayItem[] = [];
  for (const group of BLOCK_CATALOG_GROUP_ORDER) {
    const groupEntries = byGroup.get(group) ?? [];
    if (groupEntries.length === 0) continue;
    items.push({ type: 'header', group, title: BLOCK_CATALOG_GROUP_LABELS[group] });
    for (const entry of groupEntries) {
      items.push({ type: 'entry', entry });
    }
  }
  return items;
}

export function assertCatalogIntegrity(
  catalog: readonly BlockBlueprintCatalogEntry[] = BLOCK_BLUEPRINT_CATALOG,
): void {
  const ids = new Set<string>();
  const tokens = new Set<string>();
  const formatSet = new Set<string>(BLOCK_FORMAT_ENUM);

  for (const e of catalog) {
    if (ids.has(e.id)) throw new Error(`duplicate catalog id: ${e.id}`);
    ids.add(e.id);
    if (tokens.has(e.token)) throw new Error(`duplicate catalog token: ${e.token}`);
    tokens.add(e.token);
    if (!formatSet.has(e.block_format)) {
      throw new Error(`invalid block_format on ${e.id}: ${e.block_format}`);
    }
    if (!e.token.endsWith(' ')) {
      throw new Error(`catalog token must end with trailing space: ${e.id}`);
    }
    for (const key of REQUIRED_FORMAT_PARAMS_BY_FORMAT[e.block_format]) {
      if (!(key in e.format_params)) {
        throw new Error(`missing required format_param ${key} on ${e.id}`);
      }
    }
  }
}

// Fail fast in dev if catalog is malformed
assertCatalogIntegrity();
