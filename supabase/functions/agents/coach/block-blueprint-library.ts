/** MIRROR FILE — canonical lives at `src/lib/agents/coach/block-blueprint-library.ts`.
 *
 * Body below is byte-for-byte identical to the canonical Vitest-side file (excluding
 * this header). Import paths use explicit `.ts` extensions required by Deno.
 * Any change must be hand-mirrored — run `pnpm check:agent-mirror` to verify parity.
 */

export const BLOCK_FORMAT_ENUM = [
  'straight_sets',
  'superset',
  'circuit',
  'amrap',
  'emom',
  'tabata',
  'ladder',
  'chipper',
  'pyramid',
  'contrast',
  'clusters',
  'drop_sets',
] as const;

export type BlockFormat = (typeof BLOCK_FORMAT_ENUM)[number];

const BLOCK_FORMAT_SET = new Set<string>(BLOCK_FORMAT_ENUM);

export type BlockShapeDropReason =
  | 'unknown_block_format'
  | 'superset_cardinality'
  | 'circuit_cardinality'
  | 'emom_missing_params'
  | 'emom_alternating_invalid_stations'
  | 'amrap_missing_time_cap'
  | 'tabata_missing_rounds'
  | 'ladder_missing_reps'
  | 'chipper_cardinality'
  | 'chipper_missing_rounds'
  | 'pyramid_missing_reps'
  | 'contrast_cardinality'
  | 'contrast_missing_rounds'
  | 'clusters_missing_params'
  | 'drop_sets_missing_params'
  | 'json_parse_failed'
  | 'missing_blocks'
  | 'invalid_revision'
  | 'block_name_too_verbose'
  | 'block_name_clamped'
  | 'instruction_only_requires_warmup_finisher_or_cooldown_role';

export type BlockShapeDrop = {
  field: string;
  reason: BlockShapeDropReason;
};

export const FORMAT_PARAM_KEYS_BY_FORMAT: Readonly<Record<BlockFormat, readonly string[]>> = {
  straight_sets: ['rest_between_sets_seconds', 'target_rpe'],
  superset: ['rounds', 'rest_between_rounds_seconds', 'pairing_notes'],
  circuit: ['rounds', 'rest_between_rounds_seconds', 'rest_between_exercises_seconds'],
  amrap: ['time_cap_minutes', 'target_rounds', 'rest_between_rounds_seconds'],
  emom: [
    'interval_seconds',
    'total_minutes',
    'total_rounds',
    'rest_in_interval_seconds',
    'is_alternating',
    'is_combo',
    'alternating_stations',
    'stations',
    'track_active_pacing',
  ],
  tabata: ['work_seconds', 'rest_seconds', 'rounds'],
  ladder: ['start_reps', 'peak_reps', 'step_reps', 'direction', 'rounds'],
  chipper: ['rounds', 'time_cap_minutes'],
  pyramid: [
    'start_reps',
    'peak_reps',
    'step_reps',
    'direction',
    'sets',
    'load_progression_percent',
  ],
  contrast: ['rounds', 'rest_between_rounds_seconds', 'pairing_notes'],
  clusters: [
    'reps_per_cluster',
    'clusters',
    'intra_cluster_rest_seconds',
    'inter_set_rest_seconds',
    'rounds',
  ],
  drop_sets: ['drop_percent', 'drops', 'rounds', 'target_rpe'],
};

/** Keys that must be present after normalize for shape validation (format-specific). */
export const REQUIRED_FORMAT_PARAMS_BY_FORMAT: Readonly<Record<BlockFormat, readonly string[]>> = {
  straight_sets: [],
  superset: ['rounds'],
  circuit: ['rounds'],
  amrap: ['time_cap_minutes'],
  emom: ['interval_seconds'],
  tabata: ['rounds'],
  ladder: ['start_reps', 'peak_reps'],
  chipper: ['rounds'],
  pyramid: ['start_reps', 'peak_reps'],
  contrast: ['rounds'],
  clusters: ['reps_per_cluster', 'clusters'],
  drop_sets: ['drop_percent', 'drops'],
};

const LEGACY_TYPE_TO_FORMAT: Readonly<Record<string, BlockFormat>> = {
  straight_sets: 'straight_sets',
  straightset: 'straight_sets',
  straight: 'straight_sets',
  superset: 'superset',
  circuit: 'circuit',
  amrap: 'amrap',
  emom: 'emom',
  tabata: 'tabata',
  ladder: 'ladder',
  chipper: 'chipper',
  pyramid: 'pyramid',
  contrast: 'contrast',
  clusters: 'clusters',
  drop_sets: 'drop_sets',
  drop_set: 'drop_sets',
};

const LADDER_DIRECTIONS = new Set(['ascending', 'descending']);

function normalizeLegacyKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

export function isBlockFormat(raw: unknown): raw is BlockFormat {
  return typeof raw === 'string' && BLOCK_FORMAT_SET.has(raw);
}

/** Map legacy `blocks[].type` strings to `block_format`; null when unknown. */
export function mapLegacyTypeToBlockFormat(raw: unknown): BlockFormat | null {
  if (typeof raw !== 'string') return null;
  const key = normalizeLegacyKey(raw);
  return LEGACY_TYPE_TO_FORMAT[key] ?? null;
}

function positiveInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.round(value);
  }
  if (typeof value === 'string' && /^\d+(\.\d+)?$/.test(value.trim())) {
    const n = Number(value.trim());
    if (Number.isFinite(n) && n > 0) return Math.round(n);
  }
  return null;
}

function positiveNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  if (typeof value === 'string') {
    const n = Number(value.trim());
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

type EmomStationDraftNormalized =
  | { is_rest: true }
  | {
      is_rest: false;
      exercise_index: number;
      target_type: 'reps' | 'time';
      target_value: number | null;
    };

function normalizeEmomStationDraft(raw: unknown): EmomStationDraftNormalized | null {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (o.is_rest === true) return { is_rest: true };
  if (o.is_rest !== false) return null;
  if (typeof o.exercise_index !== 'number' || !Number.isFinite(o.exercise_index)) return null;
  const exercise_index = Math.max(0, Math.round(o.exercise_index));
  const target_type = o.target_type === 'time' ? 'time' : o.target_type === 'reps' ? 'reps' : null;
  if (!target_type) return null;
  let target_value: number | null = null;
  if (o.target_value != null) {
    const n = Number(o.target_value);
    if (Number.isFinite(n) && n >= 0) target_value = Math.round(n);
  }
  return { is_rest: false, exercise_index, target_type, target_value };
}

/** Normalize rich EMOM `stations` cycle; null when malformed. */
function normalizeEmomStationsDrafts(raw: unknown): EmomStationDraftNormalized[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: EmomStationDraftNormalized[] = [];
  for (const item of raw) {
    const parsed = normalizeEmomStationDraft(item);
    if (parsed) out.push(parsed);
  }
  return out.length > 0 ? out : null;
}

/** Normalize alternating EMOM station cycle; null when malformed. */
function normalizeAlternatingStations(raw: unknown): number[][] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: number[][] = [];
  for (const minute of raw) {
    if (!Array.isArray(minute) || minute.length === 0) return null;
    const indices: number[] = [];
    const seen = new Set<number>();
    for (const idx of minute) {
      if (typeof idx !== 'number' || !Number.isFinite(idx)) return null;
      const i = Math.trunc(idx);
      if (i < 0) return null;
      if (!seen.has(i)) {
        seen.add(i);
        indices.push(i);
      }
    }
    if (indices.length === 0) return null;
    out.push(indices);
  }
  return out;
}

function validateEmomAlternatingStations(
  params: Record<string, unknown>,
  exercisesLength: number,
): boolean {
  if (params.is_alternating !== true) return true;
  const raw = params.alternating_stations;
  if (!Array.isArray(raw) || raw.length === 0) return false;
  for (const minute of raw) {
    if (!Array.isArray(minute) || minute.length === 0) return false;
    for (const idx of minute) {
      if (typeof idx !== 'number' || !Number.isFinite(idx)) return false;
      const i = Math.trunc(idx);
      if (i < 0 || i >= exercisesLength) return false;
    }
  }
  return true;
}

/** Coach / outline ingest default when the model omits interval but supplies duration. */
export const EMOM_DEFAULT_INTERVAL_SECONDS = 60;

const INTEGER_PARAM_KEYS = new Set([
  'time_cap_minutes',
  'interval_seconds',
  'total_minutes',
  'total_rounds',
  'rounds',
  'work_seconds',
  'rest_seconds',
  'rest_in_interval_seconds',
  'rest_between_sets_seconds',
  'rest_between_rounds_seconds',
  'rest_between_exercises_seconds',
  'target_rounds',
  'start_reps',
  'peak_reps',
  'step_reps',
  'sets',
  'load_progression_percent',
  'reps_per_cluster',
  'intra_cluster_rest_seconds',
  'inter_set_rest_seconds',
  'clusters',
  'drop_percent',
  'drops',
]);

/** Strip irrelevant keys, round integers, drop invalid values. */
export function normalizeFormatParams(format: BlockFormat, raw: unknown): Record<string, unknown> {
  const allowed = new Set(FORMAT_PARAM_KEYS_BY_FORMAT[format]);
  const out: Record<string, unknown> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  const o = raw as Record<string, unknown>;
  for (const key of FORMAT_PARAM_KEYS_BY_FORMAT[format]) {
    if (!(key in o)) continue;
    const v = o[key];
    if (key === 'pairing_notes') {
      if (typeof v === 'string' && v.trim()) out.pairing_notes = v.trim();
      continue;
    }
    if (key === 'direction') {
      if (typeof v === 'string') {
        const d = v.trim().toLowerCase();
        if (LADDER_DIRECTIONS.has(d)) out.direction = d;
      }
      continue;
    }
    if (key === 'target_rpe') {
      const n = positiveNumber(v);
      if (n != null) out.target_rpe = n;
      continue;
    }
    if (key === 'is_alternating') {
      if (v === true) out.is_alternating = true;
      else if (v === false) out.is_alternating = false;
      continue;
    }
    if (key === 'is_combo') {
      if (v === true) out.is_combo = true;
      else if (v === false) out.is_combo = false;
      continue;
    }
    if (key === 'alternating_stations') {
      const stations = normalizeAlternatingStations(v);
      if (stations != null) out.alternating_stations = stations;
      continue;
    }
    if (key === 'stations') {
      const stations = normalizeEmomStationsDrafts(v);
      if (stations != null) out.stations = stations;
      continue;
    }
    if (key === 'track_active_pacing') {
      if (v === true) out.track_active_pacing = true;
      else if (v === false) out.track_active_pacing = false;
      continue;
    }
    if (INTEGER_PARAM_KEYS.has(key)) {
      const n = positiveInt(v);
      if (n != null) out[key] = n;
    }
  }
  if (out.is_alternating !== true) {
    delete out.alternating_stations;
  }
  if (format === 'emom') {
    const hasDuration =
      (typeof out.total_minutes === 'number' && out.total_minutes > 0) ||
      (typeof out.total_rounds === 'number' && out.total_rounds > 0);
    if (hasDuration && typeof out.interval_seconds !== 'number') {
      out.interval_seconds = EMOM_DEFAULT_INTERVAL_SECONDS;
    }
  }
  // Defensive: only emit keys in allow-list even if raw had extras
  for (const k of Object.keys(out)) {
    if (!allowed.has(k)) delete out[k];
  }
  return out;
}

function hasPositiveIntParam(params: Record<string, unknown>, key: string): boolean {
  return typeof params[key] === 'number' && (params[key] as number) > 0;
}

export {
  buildComboAlternatingStationsMatrix,
  buildDefaultAlternatingStationsMatrix,
  hydrateEmomAlternatingStations,
} from '../../_shared/workout-metadata/hydrate-emom-alternating-stations.ts';

/** Returns drop reason or null when shape is valid. */
export function validateBlockShape(
  format: BlockFormat,
  exercisesLength: number,
  params: Record<string, unknown>,
): BlockShapeDropReason | null {
  switch (format) {
    case 'superset':
      if (exercisesLength !== 2) return 'superset_cardinality';
      return null;
    case 'circuit':
      if (exercisesLength < 3) return 'circuit_cardinality';
      return null;
    case 'amrap':
      if (!hasPositiveIntParam(params, 'time_cap_minutes')) return 'amrap_missing_time_cap';
      return null;
    case 'emom': {
      if (!hasPositiveIntParam(params, 'interval_seconds')) return 'emom_missing_params';
      const hasDuration =
        hasPositiveIntParam(params, 'total_minutes') || hasPositiveIntParam(params, 'total_rounds');
      if (!hasDuration) return 'emom_missing_params';
      if (!validateEmomAlternatingStations(params, exercisesLength)) {
        return 'emom_alternating_invalid_stations';
      }
      return null;
    }
    case 'tabata':
      if (!hasPositiveIntParam(params, 'rounds')) return 'tabata_missing_rounds';
      return null;
    case 'ladder':
      if (!hasPositiveIntParam(params, 'start_reps') || !hasPositiveIntParam(params, 'peak_reps')) {
        return 'ladder_missing_reps';
      }
      return null;
    case 'chipper':
      if (exercisesLength < 3) return 'chipper_cardinality';
      if (!hasPositiveIntParam(params, 'rounds')) return 'chipper_missing_rounds';
      return null;
    case 'pyramid':
      if (!hasPositiveIntParam(params, 'start_reps') || !hasPositiveIntParam(params, 'peak_reps')) {
        return 'pyramid_missing_reps';
      }
      return null;
    case 'contrast':
      if (exercisesLength !== 2) return 'contrast_cardinality';
      if (!hasPositiveIntParam(params, 'rounds')) return 'contrast_missing_rounds';
      return null;
    case 'clusters':
      if (
        !hasPositiveIntParam(params, 'reps_per_cluster') ||
        !hasPositiveIntParam(params, 'clusters')
      ) {
        return 'clusters_missing_params';
      }
      return null;
    case 'drop_sets':
      if (!hasPositiveIntParam(params, 'drop_percent') || !hasPositiveIntParam(params, 'drops')) {
        return 'drop_sets_missing_params';
      }
      return null;
    case 'straight_sets':
    default:
      return null;
  }
}

export const BLOCK_BLUEPRINT_LIBRARY_HEADER = '--- BLOCK BLUEPRINT LIBRARY ---';

/** User clearly asked to draft / create the card (main-chat outline turn). */
export function userMessageShowsDraftIntent(content: string): boolean {
  const t = content.trim();
  if (!t) return false;
  return /\b(draft\s+(the\s+)?outline|please\s+draft|proceed\s+with|go\s+ahead\s+and\s+draft|create\s+(the\s+)?card|put\s+it\s+on\s+a\s+card)\b/i.test(
    t,
  );
}

/** True when the full block taxonomy should be appended to the Coach system prompt. */
export function shouldInjectBlockBlueprintLibrary(_args: {
  isRailSurface: boolean;
  blockBlueprintMentionCount: number;
  /** @deprecated Main chat always injects; kept for call-site compatibility. */
  userMessageShowsDraftIntent?: boolean;
}): boolean {
  // Rail and main bubble always receive the blueprint library so agreement turns
  // (e.g. "That sounds good") still know EMOM/tabata format_params without draft-intent regex.
  return true;
}

/**
 * Imperative blueprint prose for Coach system prompt injection.
 * Names schema keys so `pnpm check:agent-prompts` Direction B stays clean.
 */
export function buildBlockBlueprintLibraryPrompt(): string {
  return (
    `${BLOCK_BLUEPRINT_LIBRARY_HEADER}\n` +
    'When you emit proposed_workout_metadata.blocks for exercise-shaped sections, you MUST select a blueprint and hydrate within its constraints. Do not invent formats or put timing only in reply_content — structured JSON is the prescription.\n' +
    'block_format must be one of: straight_sets, superset, circuit, amrap, emom, tabata, ladder, chipper, pyramid, contrast, clusters, drop_sets. Do not invent new values. Prefer block_format over legacy type.\n' +
    'format_params is a single object; include only keys relevant to block_format (see below). Omit format_params for straight_sets when using default rest only.\n' +
    '\n' +
    'straight_sets — Default strength / hypertrophy. Optional format_params: rest_between_sets_seconds, target_rpe. Fill exercises[] with sets × reps per movement.\n' +
    '\n' +
    'superset — Exactly 2 exercises back-to-back (antagonist pair). Required format_params: rounds. Optional: rest_between_rounds_seconds, pairing_notes. For 3+ exercises in sequence use circuit, not superset.\n' +
    '\n' +
    'circuit — Round-robin stations. Required format_params: rounds. Optional: rest_between_rounds_seconds, rest_between_exercises_seconds. Require at least 3 exercises in exercises[].\n' +
    '\n' +
    'amrap — As many rounds as possible in a time cap. Required format_params: time_cap_minutes. Optional: target_rounds, rest_between_rounds_seconds. exercises[] repeat in order until time_cap_minutes elapses.\n' +
    '\n' +
    'emom — Every minute on the minute. Required format_params: interval_seconds AND (total_minutes OR total_rounds). Optional: rest_in_interval_seconds, is_alternating (boolean), alternating_stations (array of index arrays, 0-based within exercises[]). For simple A/B/C rotation set is_alternating true and omit alternating_stations — the server auto-builds [[0],[1],[2],…]. For A / B+C combo minutes use the :main/emom/alternating-combo or :finisher/emom/alternating-combo catalog token (server pairs the last two exercises on one minute); do not emit is_combo in model JSON. For other combined minutes supply alternating_stations explicitly such as [[0],[1,2]]. Do NOT use circuit for minute-bound alternating work. You MAY emit per-exercise work_seconds / rest_seconds; when omitted, the server derives them from interval_seconds and rest_in_interval_seconds.\n' +
    '\n' +
    'tabata — Work / rest intervals. Required format_params: rounds. Optional: work_seconds (default 20), rest_seconds (default 10). Set work_seconds, rest_seconds, and rounds on format_params only. Do not repeat timing in updated_task_description, coach_notes, or block names. Per-exercise work_seconds/rest_seconds are optional numeric overrides only — never prose.\n' +
    '\n' +
    'ladder — Ascending or descending rep rungs on one or more movements. Required format_params: start_reps, peak_reps. Optional: step_reps (default 1), direction (ascending or descending), rounds. Hydrate exercises[] with per-set or per-round rep targets from start_reps toward peak_reps by step_reps; do not put the scheme only in reply_content.\n' +
    '\n' +
    'chipper — Complete all prescribed reps of each exercise in order before advancing to the next. Required format_params: rounds (usually 1). Optional: time_cap_minutes for for-time chippers. Require at least 3 exercises in exercises[] with distinct rep counts per movement.\n' +
    '\n' +
    'pyramid — Set-by-set rep and/or load progression (not rep-rung ladders). Required format_params: start_reps, peak_reps. Optional: step_reps, direction (ascending or descending), sets, load_progression_percent. Hydrate exercises[] with per-set rep or load targets across the pyramid; do not put the scheme only in reply_content.\n' +
    '\n' +
    'contrast — Post-activation potentiation: exactly 2 exercises (heavy strength + explosive plyometric or speed). Required format_params: rounds. Optional: rest_between_rounds_seconds, pairing_notes. Alternate heavy then explosive each round; use superset for antagonist pairs without PAP intent.\n' +
    '\n' +
    'clusters — Intra-set micro-rest between rep clusters. Required format_params: reps_per_cluster, clusters. Optional: intra_cluster_rest_seconds, inter_set_rest_seconds, rounds. Hydrate exercises[] with cluster structure in sets/reps or coach_notes.\n' +
    '\n' +
    'drop_sets — Working set to failure then load reductions. Required format_params: drop_percent, drops. Optional: rounds, target_rpe. Hydrate exercises[] with working-set reps and drop-set load reductions; do not put drops only in reply_content.\n' +
    '\n' +
    'Instruction-only blocks (warm-up, cool-down, mobility): when instructions[] is non-empty and exercises[] is empty or omitted, omit block_format and format_params; name + instructions only.\n' +
    'HARD RULES: superset and contrast require exactly 2 exercises. contrast requires rounds. circuit and chipper require at least 3 exercises. amrap requires time_cap_minutes. emom requires interval_seconds and total_minutes or total_rounds. tabata requires rounds. ladder and pyramid require start_reps and peak_reps. chipper requires rounds. clusters requires reps_per_cluster and clusters. drop_sets requires drop_percent and drops. Unknown block_format values are rejected server-side — never coerce a time-domain format into straight_sets.'
  );
}
