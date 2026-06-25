export const INTERVAL_PRESET_IDS = [
  'tabata',
  'classic_hiit',
  'hypertrophy_density',
  'heavy_aerobic',
  'power_sprints',
  'fighters',
] as const;

export type KnownIntervalPresetId = (typeof INTERVAL_PRESET_IDS)[number];
export type IntervalPresetId = KnownIntervalPresetId | 'custom';

/** User-facing label for `block_format: tabata` in format pickers (not the Tabata preset). */
export const WORK_REST_BLOCK_FORMAT_LABEL = 'Intervals';

/** Umbrella subtitle when W/R do not match a named preset or strict Tabata protocol. */
export const CUSTOM_INTERVAL_SUBTITLE_LABEL = 'Intervals';

export const INTERVAL_PRESET_ROUND_BOUNDS: Readonly<
  Record<IntervalPresetId, { min: number; max: number }>
> = {
  tabata: { min: 4, max: 12 },
  classic_hiit: { min: 4, max: 16 },
  hypertrophy_density: { min: 4, max: 16 },
  heavy_aerobic: { min: 4, max: 10 },
  power_sprints: { min: 4, max: 8 },
  fighters: { min: 3, max: 6 },
  custom: { min: 1, max: 20 },
};

export const INTERVAL_TERMINOLOGY_PROMPT_BLOCK =
  'INTERVAL TERMINOLOGY (CRITICAL): block_format "tabata" is the internal engine for all work/rest blocks. User-facing vocabulary: "Intervals" is the umbrella format name. "Tabata" means ONLY the strict Izumi protocol (20s work / 10s rest / 8 rounds default) — never say "Tabata-style", "-style Tabata", or "Tabata finisher" when work/rest are not 20/10. For other ratios use preset names (Classic HIIT for 30/30, Hypertrophy / Density for 40/20, Power Sprints for 10/50, Fighters / Grapplers for 5:00/1:00, Heavy Aerobic for 60/60) or "Intervals" / "Standard Intervals" for custom W/R. Always emit interval_preset on format_params (tabata, classic_hiit, hypertrophy_density, heavy_aerobic, power_sprints, fighters, or custom). Block names use the preset label (e.g. "Finisher — Classic HIIT"), not "Tabata" unless W/R are 20/10.';

export const INTERVAL_MODALITY_FACTORY_PROMPT =
  'INTERVAL MODALITIES: Strict modalities have locked timing — Tabata (20/10/8 only), EMOM, AMRAP. Do not recalculate their format_params. Standard intervals (block_format tabata with other W/R) are flexible: respect work_seconds, rest_seconds, rounds, and interval_preset from the outline; never label non-20/10 blocks "Tabata" in coach_notes or exercise copy.';

export type IntervalWorkRestRatio = '1:1' | '2:1' | '1:2' | '1:3' | '1:5' | '5:1';

export type IntervalPresetDefinition = {
  id: KnownIntervalPresetId;
  /** Full name for builder chips and coach copy */
  label: string;
  /** Compact label for block subtitles */
  subtitleLabel: string;
  workSeconds: number;
  restSeconds: number;
  defaultRounds: number;
  ratioLabel: IntervalWorkRestRatio;
  energySystemBlurb: string;
};

export const INTERVAL_PRESET_CATALOG: readonly IntervalPresetDefinition[] = [
  {
    id: 'tabata',
    label: 'Tabata (Max Effort)',
    subtitleLabel: 'Tabata',
    workSeconds: 20,
    restSeconds: 10,
    defaultRounds: 8,
    ratioLabel: '2:1',
    energySystemBlurb: 'Anaerobic / VO₂ max',
  },
  {
    id: 'classic_hiit',
    label: 'Classic HIIT',
    subtitleLabel: 'Classic HIIT',
    workSeconds: 30,
    restSeconds: 30,
    defaultRounds: 8,
    ratioLabel: '1:1',
    energySystemBlurb: 'Glycolytic / lactate tolerance',
  },
  {
    id: 'hypertrophy_density',
    label: 'Hypertrophy / Density',
    subtitleLabel: 'Hypertrophy / Density',
    workSeconds: 40,
    restSeconds: 20,
    defaultRounds: 8,
    ratioLabel: '2:1',
    energySystemBlurb: 'Localized muscular endurance',
  },
  {
    id: 'heavy_aerobic',
    label: 'Heavy Aerobic',
    subtitleLabel: 'Heavy Aerobic',
    workSeconds: 60,
    restSeconds: 60,
    defaultRounds: 6,
    ratioLabel: '1:1',
    energySystemBlurb: 'Oxidative (cardio engine)',
  },
  {
    id: 'power_sprints',
    label: 'Power Sprints',
    subtitleLabel: 'Power Sprints',
    workSeconds: 10,
    restSeconds: 50,
    defaultRounds: 6,
    ratioLabel: '1:5',
    energySystemBlurb: 'ATP-PC (phosphagen)',
  },
  {
    id: 'fighters',
    label: 'Fighters / Grapplers',
    subtitleLabel: 'Fighters / Grapplers',
    workSeconds: 300,
    restSeconds: 60,
    defaultRounds: 5,
    ratioLabel: '5:1',
    energySystemBlurb: 'Sport-specific endurance',
  },
] as const;

const PRESET_BY_ID = new Map<KnownIntervalPresetId, IntervalPresetDefinition>(
  INTERVAL_PRESET_CATALOG.map((preset) => [preset.id, preset]),
);

function positiveInt(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const n = Math.round(v);
  return n > 0 ? n : null;
}

export function isIntervalPresetId(v: unknown): v is KnownIntervalPresetId {
  return typeof v === 'string' && PRESET_BY_ID.has(v as KnownIntervalPresetId);
}

export function isIntervalPresetOrCustomId(v: unknown): v is IntervalPresetId {
  return v === 'custom' || isIntervalPresetId(v);
}

export function getIntervalPresetDefinition(id: KnownIntervalPresetId): IntervalPresetDefinition {
  const preset = PRESET_BY_ID.get(id);
  if (!preset) throw new Error(`Unknown interval preset: ${id}`);
  return preset;
}

export function applyIntervalPreset(
  id: KnownIntervalPresetId,
  overrides?: { rounds?: number },
): {
  work_seconds: number;
  rest_seconds: number;
  rounds: number;
  interval_preset: KnownIntervalPresetId;
} {
  const preset = getIntervalPresetDefinition(id);
  const rounds = positiveInt(overrides?.rounds) ?? preset.defaultRounds;
  return {
    work_seconds: preset.workSeconds,
    rest_seconds: preset.restSeconds,
    rounds,
    interval_preset: id,
  };
}

export function paramsMatchPreset(
  params: Record<string, unknown>,
  id: KnownIntervalPresetId,
  options?: { requireRounds?: boolean },
): boolean {
  const preset = getIntervalPresetDefinition(id);
  const work = positiveInt(params.work_seconds);
  const rest = positiveInt(params.rest_seconds);
  if (work !== preset.workSeconds || rest !== preset.restSeconds) return false;
  if (options?.requireRounds) {
    const rounds = positiveInt(params.rounds);
    if (rounds !== preset.defaultRounds) return false;
  }
  return true;
}

export function deriveIntervalPresetFromParams(params: Record<string, unknown>): IntervalPresetId {
  for (const id of INTERVAL_PRESET_IDS) {
    if (paramsMatchPreset(params, id)) return id;
  }
  return 'custom';
}

export function resolveIntervalPresetLabel(params: Record<string, unknown>): string {
  const presetId = params.interval_preset;
  if (isIntervalPresetId(presetId) && paramsMatchPreset(params, presetId)) {
    return getIntervalPresetDefinition(presetId).subtitleLabel;
  }

  if (paramsMatchPreset(params, 'tabata')) {
    return getIntervalPresetDefinition('tabata').subtitleLabel;
  }

  const derived = deriveIntervalPresetFromParams(params);
  if (derived !== 'custom') {
    return getIntervalPresetDefinition(derived).subtitleLabel;
  }

  return CUSTOM_INTERVAL_SUBTITLE_LABEL;
}

export function reconcileIntervalPreset(params: Record<string, unknown>): Record<string, unknown> {
  const derived = deriveIntervalPresetFromParams(params);
  const presetId = params.interval_preset;

  if (derived !== 'custom') {
    return { ...params, interval_preset: derived };
  }

  if (presetId === 'custom') {
    return { ...params, interval_preset: 'custom' };
  }

  return { ...params, interval_preset: 'custom' };
}

export function isRoundCountValidForPreset(rounds: number, presetId: IntervalPresetId): boolean {
  const bounds = INTERVAL_PRESET_ROUND_BOUNDS[presetId];
  return Number.isInteger(rounds) && rounds >= bounds.min && rounds <= bounds.max;
}

export function computeRestFromWorkAndRatio(
  workSeconds: number,
  ratio: IntervalWorkRestRatio,
): number {
  const work = positiveInt(workSeconds);
  if (work == null) return 0;

  switch (ratio) {
    case '1:1':
      return work;
    case '2:1':
      return Math.round(work / 2);
    case '1:2':
      return work * 2;
    case '1:3':
      return work * 3;
    case '1:5':
      return work * 5;
    case '5:1':
      return Math.round(work / 5);
    default:
      return 0;
  }
}

export const INTERVAL_WORK_REST_RATIOS: readonly IntervalWorkRestRatio[] = [
  '1:1',
  '2:1',
  '1:2',
  '1:3',
  '1:5',
  '5:1',
];

export function resolveRatioForTabataParams(
  params: Record<string, unknown>,
  fallback: IntervalWorkRestRatio = '2:1',
): IntervalWorkRestRatio {
  const stored = params.interval_preset;
  if (isIntervalPresetId(stored)) {
    return getIntervalPresetDefinition(stored).ratioLabel;
  }
  const derived = deriveIntervalPresetFromParams(params);
  if (derived !== 'custom') {
    return getIntervalPresetDefinition(derived).ratioLabel;
  }
  return fallback;
}

function syncTabataPresetId(params: Record<string, unknown>): Record<string, unknown> {
  const derived = deriveIntervalPresetFromParams(params);
  return {
    ...params,
    interval_preset: derived === 'custom' ? 'custom' : derived,
  };
}

export type MergeTabataFormatParamsOptions = {
  restLocked?: boolean;
  ratio?: IntervalWorkRestRatio;
  manualRestEdit?: boolean;
};

export function mergeTabataFormatParams(
  prev: Record<string, unknown>,
  patch: Partial<{
    work_seconds: number | undefined;
    rest_seconds: number | undefined;
    rounds: number | undefined;
  }>,
  options?: MergeTabataFormatParamsOptions,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...prev };

  if (patch.rounds !== undefined) next.rounds = patch.rounds;
  if (patch.work_seconds !== undefined) next.work_seconds = patch.work_seconds;

  if (options?.manualRestEdit) {
    if (patch.rest_seconds !== undefined) next.rest_seconds = patch.rest_seconds;
    return syncTabataPresetId({ ...next, interval_preset: 'custom' });
  }

  if (patch.rest_seconds !== undefined && options?.restLocked === false) {
    next.rest_seconds = patch.rest_seconds;
  }

  const shouldAutoRest =
    options?.restLocked !== false && (patch.work_seconds !== undefined || options?.ratio != null);

  if (shouldAutoRest) {
    const work = positiveInt(next.work_seconds);
    if (work != null) {
      const ratio = options?.ratio ?? resolveRatioForTabataParams(next);
      next.rest_seconds = computeRestFromWorkAndRatio(work, ratio);
    }
  } else if (patch.rest_seconds !== undefined) {
    next.rest_seconds = patch.rest_seconds;
  }

  return syncTabataPresetId(next);
}
