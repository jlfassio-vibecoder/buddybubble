/**
 * Heuristic exercise / teleprompter segment duration estimates (pacing aid only).
 * Pure module — no React, DB, or dictionary fetch.
 */

export type EstimateExerciseDurationInput = {
  name?: string | null;
  sets?: number | null;
  reps?: number | string | null;
  duration_min?: number | null;
  work_seconds?: number | null;
  rest_seconds?: number | null;
  rounds?: number | null;
  /** Accepted for forward compat; unused in v1 math. */
  blockFormat?: string | null;
  formatParams?: Record<string, unknown> | null;
};

/** Queue item for teleprompter pacing (id + prescription fields). */
export type TeleprompterItem = EstimateExerciseDurationInput & {
  id: string;
  /** Parent tile key: `deckItemId ?? snapshotId`. */
  deckItemId: string;
  /** Precomputed estimate; preferred by {@link estimateQueueDurationsSec} when finite. */
  estimateSec?: number;
};

const DEFAULT_EXERCISE_SEC = 90;
const DEFAULT_SET_BUCKET_SEC = 45;
const DEFAULT_REST_SEC = 15;
const DEFAULT_AMRAP_REPS = 10;
const MIN_EXERCISE_SEC = 20;
const MAX_EXERCISE_SEC = 15 * 60;

type MovementFamily = {
  keywords: string[];
  secPerRep: number;
  restBetweenSetsSec: number;
};

/** First matching family wins (case-insensitive substring). */
const MOVEMENT_FAMILIES: MovementFamily[] = [
  {
    keywords: ['clean', 'snatch', 'jerk', 'thruster'],
    secPerRep: 5,
    restBetweenSetsSec: 120,
  },
  {
    keywords: ['squat', 'deadlift', 'lunge', 'hinge', 'rdl'],
    secPerRep: 4,
    restBetweenSetsSec: 90,
  },
  {
    keywords: [
      'bench',
      'press',
      'row',
      'pull-up',
      'pullup',
      'chin-up',
      'chinup',
      'push-up',
      'pushup',
    ],
    secPerRep: 2.5,
    restBetweenSetsSec: 60,
  },
  {
    keywords: ['curl', 'raise', 'fly', 'plank', 'crunch', 'sit-up', 'situp'],
    secPerRep: 2,
    restBetweenSetsSec: 45,
  },
];

const DEFAULT_SEC_PER_REP = 3;
const DEFAULT_REST_BETWEEN_SETS_SEC = 60;

function isPositiveFinite(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0;
}

function clampEstimateSec(sec: number): number {
  if (!Number.isFinite(sec)) return DEFAULT_EXERCISE_SEC;
  return Math.min(MAX_EXERCISE_SEC, Math.max(MIN_EXERCISE_SEC, Math.round(sec)));
}

function resolveMovementFamily(name: string | null | undefined): {
  secPerRep: number;
  restBetweenSetsSec: number;
} {
  const lower = typeof name === 'string' ? name.trim().toLowerCase() : '';
  if (!lower) {
    return { secPerRep: DEFAULT_SEC_PER_REP, restBetweenSetsSec: DEFAULT_REST_BETWEEN_SETS_SEC };
  }
  for (const family of MOVEMENT_FAMILIES) {
    if (family.keywords.some((kw) => lower.includes(kw))) {
      return { secPerRep: family.secPerRep, restBetweenSetsSec: family.restBetweenSetsSec };
    }
  }
  return { secPerRep: DEFAULT_SEC_PER_REP, restBetweenSetsSec: DEFAULT_REST_BETWEEN_SETS_SEC };
}

/**
 * Parse reps for strength estimates.
 * - number → as-is when finite and > 0
 * - "8-10" / en-dash → midpoint
 * - AMRAP / max / empty / unparsable → null
 */
export function parseRepsForEstimate(reps: number | string | null | undefined): number | null {
  if (typeof reps === 'number') {
    return isPositiveFinite(reps) ? reps : null;
  }
  if (typeof reps !== 'string') return null;
  const trimmed = reps.trim();
  if (!trimmed) return null;

  const lower = trimmed.toLowerCase();
  if (lower === 'amrap' || lower === 'max') return null;

  const range = trimmed.match(/^(\d+(?:\.\d+)?)\s*[-–—]\s*(\d+(?:\.\d+)?)$/);
  if (range) {
    const a = Number(range[1]);
    const b = Number(range[2]);
    if (isPositiveFinite(a) && isPositiveFinite(b)) return (a + b) / 2;
    return null;
  }

  const single = Number(trimmed);
  if (isPositiveFinite(single)) return single;
  return null;
}

function hasUsableRepsField(reps: number | string | null | undefined): boolean {
  if (reps == null) return false;
  if (typeof reps === 'string' && reps.trim() === '') return false;
  return true;
}

/**
 * Estimate how long one exercise / teleprompter segment will take (seconds).
 * Priority: duration_min → interval params → sets×reps → sets bucket → default 90s.
 */
export function estimateExerciseDurationSec(input: EstimateExerciseDurationInput): number {
  const durationMin = input.duration_min;
  if (isPositiveFinite(durationMin)) {
    return clampEstimateSec(durationMin * 60);
  }

  const workSeconds = input.work_seconds;
  const rounds = input.rounds;
  const sets = input.sets;
  if (isPositiveFinite(workSeconds) && (isPositiveFinite(rounds) || isPositiveFinite(sets))) {
    const rest = isPositiveFinite(input.rest_seconds) ? input.rest_seconds : DEFAULT_REST_SEC;
    const roundsOrSets = isPositiveFinite(rounds) ? rounds : (sets as number);
    return clampEstimateSec((workSeconds + rest) * roundsOrSets);
  }

  if (isPositiveFinite(sets) && hasUsableRepsField(input.reps)) {
    const parsed = parseRepsForEstimate(input.reps);
    const repsMid = parsed ?? DEFAULT_AMRAP_REPS;
    const { secPerRep, restBetweenSetsSec } = resolveMovementFamily(input.name);
    const work = sets * repsMid * secPerRep;
    const restTotal = Math.max(0, sets - 1) * restBetweenSetsSec;
    return clampEstimateSec(work + restTotal);
  }

  if (isPositiveFinite(sets)) {
    return clampEstimateSec(sets * DEFAULT_SET_BUCKET_SEC);
  }

  return clampEstimateSec(DEFAULT_EXERCISE_SEC);
}

export function estimateQueueDurationsSec(
  items: Array<EstimateExerciseDurationInput & { estimateSec?: number }>,
): number[] {
  if (!Array.isArray(items)) return [];
  return items.map((item) => {
    const pre = item?.estimateSec;
    if (typeof pre === 'number' && Number.isFinite(pre) && pre > 0) {
      return clampEstimateSec(pre);
    }
    return estimateExerciseDurationSec(item ?? {});
  });
}

/** Prefix sums: `[0, e0, e0+e1, …]` (length = items + 1). */
export function cumulativeDurationsSec(perItemSec: number[]): number[] {
  const out = [0];
  if (!Array.isArray(perItemSec)) return out;
  let sum = 0;
  for (const sec of perItemSec) {
    sum += Number.isFinite(sec) ? sec : 0;
    out.push(sum);
  }
  return out;
}

/**
 * Active 0-based index at elapsed seconds.
 * `cum` is a prefix-sum array from {@link cumulativeDurationsSec}.
 */
export function findActiveIndexFromCumulative(cum: number[], elapsedSec: number): number {
  if (!Array.isArray(cum) || cum.length <= 1) return 0;
  const n = cum.length - 1;
  const t = Number.isFinite(elapsedSec) ? Math.max(0, elapsedSec) : 0;
  let active = 0;
  for (let i = 0; i < n; i++) {
    if (cum[i]! <= t) active = i;
  }
  return active;
}
