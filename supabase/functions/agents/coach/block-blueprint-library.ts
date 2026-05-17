/** MIRROR FILE — canonical lives at `src/lib/agents/coach/block-blueprint-library.ts`.
 *
 * Body below is byte-for-byte identical to the canonical Vitest-side file (excluding
 * this header). Any change must be hand-mirrored — run `pnpm check:agent-mirror` to verify parity.
 */

export const BLOCK_FORMAT_ENUM = [
  'straight_sets',
  'superset',
  'circuit',
  'amrap',
  'emom',
  'tabata',
] as const;

export type BlockFormat = (typeof BLOCK_FORMAT_ENUM)[number];

const BLOCK_FORMAT_SET = new Set<string>(BLOCK_FORMAT_ENUM);

export type BlockShapeDropReason =
  | 'unknown_block_format'
  | 'superset_cardinality'
  | 'circuit_cardinality'
  | 'emom_missing_params'
  | 'amrap_missing_time_cap'
  | 'tabata_missing_rounds';

export type BlockShapeDrop = {
  field: string;
  reason: BlockShapeDropReason;
};

export const FORMAT_PARAM_KEYS_BY_FORMAT: Readonly<Record<BlockFormat, readonly string[]>> = {
  straight_sets: ['rest_between_sets_seconds', 'target_rpe'],
  superset: ['rounds', 'rest_between_rounds_seconds', 'pairing_notes'],
  circuit: ['rounds', 'rest_between_rounds_seconds', 'rest_between_exercises_seconds'],
  amrap: ['time_cap_minutes', 'target_rounds', 'rest_between_rounds_seconds'],
  emom: ['interval_seconds', 'total_minutes', 'total_rounds', 'rest_in_interval_seconds'],
  tabata: ['work_seconds', 'rest_seconds', 'rounds'],
};

/** Keys that must be present after normalize for shape validation (format-specific). */
export const REQUIRED_FORMAT_PARAMS_BY_FORMAT: Readonly<Record<BlockFormat, readonly string[]>> = {
  straight_sets: [],
  superset: ['rounds'],
  circuit: ['rounds'],
  amrap: ['time_cap_minutes'],
  emom: ['interval_seconds'],
  tabata: ['rounds'],
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
};

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
    if (key === 'target_rpe') {
      const n = positiveNumber(v);
      if (n != null) out.target_rpe = n;
      continue;
    }
    if (INTEGER_PARAM_KEYS.has(key)) {
      const n = positiveInt(v);
      if (n != null) out[key] = n;
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
      return null;
    }
    case 'tabata':
      if (!hasPositiveIntParam(params, 'rounds')) return 'tabata_missing_rounds';
      return null;
    case 'straight_sets':
    default:
      return null;
  }
}

export const BLOCK_BLUEPRINT_LIBRARY_HEADER = '--- BLOCK BLUEPRINT LIBRARY ---';

/**
 * Imperative blueprint prose for Coach system prompt injection.
 * Names schema keys so `pnpm check:agent-prompts` Direction B stays clean.
 */
export function buildBlockBlueprintLibraryPrompt(): string {
  return (
    `${BLOCK_BLUEPRINT_LIBRARY_HEADER}\n` +
    'When you emit proposed_workout_metadata.blocks for exercise-shaped sections, you MUST select a blueprint and hydrate within its constraints. Do not invent formats or put timing only in reply_content — structured JSON is the prescription.\n' +
    'block_format must be one of: straight_sets, superset, circuit, amrap, emom, tabata. Do not invent new values. Prefer block_format over legacy type.\n' +
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
    'emom — Every minute on the minute. Required format_params: interval_seconds AND (total_minutes OR total_rounds). Optional: rest_in_interval_seconds. Hydrate exercises[] with one movement per minute slot, or alternating A/B each minute. You MAY emit per-exercise work_seconds / rest_seconds (e.g. 15s deadlifts + 45s rest in a 60-second minute); when omitted, the server derives them from interval_seconds and rest_in_interval_seconds.\n' +
    '\n' +
    'tabata — Work / rest intervals. Required format_params: rounds. Optional: work_seconds (default 20), rest_seconds (default 10). Each exercise inherits work_seconds / rest_seconds / rounds from format_params; you may override per-exercise with work_seconds / rest_seconds.\n' +
    '\n' +
    'Instruction-only blocks (warm-up, cool-down, mobility): when instructions[] is non-empty and exercises[] is empty or omitted, omit block_format and format_params; name + instructions only.\n' +
    'HARD RULES: superset requires exactly 2 exercises. amrap requires time_cap_minutes. emom requires interval_seconds and total_minutes or total_rounds. tabata requires rounds. Unknown block_format values are rejected server-side — never coerce a time-domain format into straight_sets.'
  );
}
