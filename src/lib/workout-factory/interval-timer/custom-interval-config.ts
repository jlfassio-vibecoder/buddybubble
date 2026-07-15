import { INTERVAL_PRESET_ROUND_BOUNDS } from '@/lib/workout-factory/interval-timer/interval-preset-catalog';
import { computeTabataBlockDurationFromParams } from '@/lib/workout-factory/interval-timer/tabata-block-duration';
import type { TabataRestMode } from '@/lib/workout-factory/types/tabata-format-params';

export type CustomIntervalConfig = {
  work_seconds: number;
  rest_seconds: number;
  /** Circuit rounds (single-station quick launch → work segments === rounds). */
  rounds: number;
  /** Optional circuit stations; omit/empty → single Movement placeholder at build time */
  station_names?: string[];
  /** Active rest requires rest_seconds > 0 and non-empty active_rest_exercises. */
  rest_mode?: TabataRestMode;
  /** Low-intensity moves during rest; omit unless rest_mode === 'active'. */
  active_rest_exercises?: string[];
  /** Longer rest after a full circuit pass; requires at least 2 stations. */
  round_rest_seconds?: number;
};

export type NormalizedCustomIntervalConfig = CustomIntervalConfig & {
  interval_preset: 'custom';
};

export type CustomIntervalConfigValidationResult =
  | { ok: true; value: NormalizedCustomIntervalConfig }
  | { ok: false; errors: string[] };

export const CUSTOM_INTERVAL_WORK_SECONDS_BOUNDS = { min: 1, max: 600 } as const;
export const CUSTOM_INTERVAL_REST_SECONDS_BOUNDS = { min: 0, max: 300 } as const;
export const CUSTOM_INTERVAL_ROUND_REST_SECONDS_BOUNDS = { min: 0, max: 300 } as const;

export const CUSTOM_INTERVAL_STATION_BOUNDS = {
  maxCount: 12,
  maxNameLength: 64,
} as const;

/** Phase 2 modal seed — Classic HIIT defaults; builder does not auto-apply. */
export const DEFAULT_CUSTOM_INTERVAL_CONFIG: CustomIntervalConfig = {
  work_seconds: 30,
  rest_seconds: 30,
  rounds: 8,
};

function roundFinite(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return null;
  return Math.round(v);
}

/**
 * Split on commas / newlines; trim; drop empties; truncate names; cap count.
 * Does not validate — use {@link validateCustomIntervalConfig} for bounds errors.
 */
export function parseCustomIntervalStationNames(raw: string): string[] {
  if (typeof raw !== 'string' || raw.trim() === '') return [];
  const parts = raw
    .split(/[\n,]+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((p) => p.slice(0, CUSTOM_INTERVAL_STATION_BOUNDS.maxNameLength));
  return parts.slice(0, CUSTOM_INTERVAL_STATION_BOUNDS.maxCount);
}

/** Same rules as {@link parseCustomIntervalStationNames} — for Phase 3 active-rest textarea. */
export const parseCustomIntervalActiveRestNames = parseCustomIntervalStationNames;

function normalizeNameList(raw: unknown, fieldLabel: string): { names?: string[]; error?: string } {
  if (raw == null) return {};
  if (!Array.isArray(raw)) {
    return { error: `${fieldLabel} must be an array of strings` };
  }
  if (raw.length === 0) return {};
  if (raw.length > CUSTOM_INTERVAL_STATION_BOUNDS.maxCount) {
    return {
      error: `${fieldLabel} must have at most ${CUSTOM_INTERVAL_STATION_BOUNDS.maxCount} entries`,
    };
  }
  const names: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'string') {
      return { error: `each ${fieldLabel} entry must be a string` };
    }
    const trimmed = entry.trim();
    if (trimmed.length === 0) {
      return { error: `${fieldLabel} must be non-empty` };
    }
    if (trimmed.length > CUSTOM_INTERVAL_STATION_BOUNDS.maxNameLength) {
      return {
        error: `${fieldLabel} must be at most ${CUSTOM_INTERVAL_STATION_BOUNDS.maxNameLength} characters`,
      };
    }
    names.push(trimmed);
  }
  return { names };
}

/**
 * Validates and normalizes ad-hoc custom interval timing.
 * Always sets `interval_preset: 'custom'` on success (Quick Launch intent).
 */
export function validateCustomIntervalConfig(input: unknown): CustomIntervalConfigValidationResult {
  const errors: string[] = [];
  if (input == null || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, errors: ['Config must be an object'] };
  }
  const o = input as Record<string, unknown>;

  const work = roundFinite(o.work_seconds);
  if (
    work == null ||
    work < CUSTOM_INTERVAL_WORK_SECONDS_BOUNDS.min ||
    work > CUSTOM_INTERVAL_WORK_SECONDS_BOUNDS.max
  ) {
    errors.push(
      `work_seconds must be an integer from ${CUSTOM_INTERVAL_WORK_SECONDS_BOUNDS.min} to ${CUSTOM_INTERVAL_WORK_SECONDS_BOUNDS.max}`,
    );
  }

  const rest = roundFinite(o.rest_seconds);
  if (
    rest == null ||
    rest < CUSTOM_INTERVAL_REST_SECONDS_BOUNDS.min ||
    rest > CUSTOM_INTERVAL_REST_SECONDS_BOUNDS.max
  ) {
    errors.push(
      `rest_seconds must be an integer from ${CUSTOM_INTERVAL_REST_SECONDS_BOUNDS.min} to ${CUSTOM_INTERVAL_REST_SECONDS_BOUNDS.max}`,
    );
  }

  const roundBounds = INTERVAL_PRESET_ROUND_BOUNDS.custom;
  const rounds = roundFinite(o.rounds);
  if (rounds == null || rounds < roundBounds.min || rounds > roundBounds.max) {
    errors.push(`rounds must be an integer from ${roundBounds.min} to ${roundBounds.max}`);
  }

  const stationResult = normalizeNameList(o.station_names, 'station_names');
  if (stationResult.error) {
    errors.push(stationResult.error);
  }

  const restModeRaw = o.rest_mode;
  let restMode: TabataRestMode | undefined;
  if (restModeRaw != null) {
    if (restModeRaw === 'passive' || restModeRaw === 'active') {
      restMode = restModeRaw;
    } else {
      errors.push(`rest_mode must be 'passive' or 'active'`);
    }
  }

  const activeRestResult = normalizeNameList(o.active_rest_exercises, 'active_rest_exercises');
  if (activeRestResult.error) {
    errors.push(activeRestResult.error);
  }
  const activeRestNames = activeRestResult.names;

  const wantsActive = restMode === 'active';
  const hasOrphanNames = !wantsActive && activeRestNames != null && activeRestNames.length > 0;

  if (hasOrphanNames) {
    errors.push('active_rest_exercises requires rest_mode to be active');
  }

  if (wantsActive) {
    if (rest != null && rest === 0) {
      errors.push('rest_mode active requires rest_seconds greater than 0');
    }
    if (activeRestNames == null || activeRestNames.length === 0) {
      errors.push('rest_mode active requires at least one active_rest_exercises entry');
    }
  }

  const exerciseCount = stationResult.names?.length ?? 0;
  let roundRest: number | null = null;
  if (o.round_rest_seconds != null) {
    roundRest = roundFinite(o.round_rest_seconds);
    if (
      roundRest == null ||
      roundRest < CUSTOM_INTERVAL_ROUND_REST_SECONDS_BOUNDS.min ||
      roundRest > CUSTOM_INTERVAL_ROUND_REST_SECONDS_BOUNDS.max
    ) {
      errors.push(
        `round_rest_seconds must be an integer from ${CUSTOM_INTERVAL_ROUND_REST_SECONDS_BOUNDS.min} to ${CUSTOM_INTERVAL_ROUND_REST_SECONDS_BOUNDS.max}`,
      );
      roundRest = null;
    } else if (roundRest > 0 && exerciseCount <= 1) {
      errors.push('round_rest_seconds requires at least 2 station_names');
    }
  }

  if (errors.length > 0 || work == null || rest == null || rounds == null) {
    return { ok: false, errors };
  }

  // Passive / omit: strip rest_mode and active_rest_exercises from normalized output.
  const emitActive =
    wantsActive && rest > 0 && activeRestNames != null && activeRestNames.length > 0;
  const roundRestSeconds =
    roundRest != null && roundRest > 0 && exerciseCount > 1 ? roundRest : undefined;

  return {
    ok: true,
    value: {
      work_seconds: work,
      rest_seconds: rest,
      rounds,
      interval_preset: 'custom',
      ...(stationResult.names != null && stationResult.names.length > 0
        ? { station_names: stationResult.names }
        : {}),
      ...(emitActive
        ? { rest_mode: 'active' as const, active_rest_exercises: activeRestNames }
        : {}),
      ...(roundRestSeconds != null ? { round_rest_seconds: roundRestSeconds } : {}),
    },
  };
}

/** Live-session duration preview (includes default 10s GET READY setup). */
export function previewCustomIntervalDuration(config: CustomIntervalConfig): number | null {
  const validated = validateCustomIntervalConfig(config);
  if (!validated.ok) return null;
  return computeTabataBlockDurationFromParams(validated.value, {
    exerciseCount: validated.value.station_names?.length ?? 0,
  });
}
