/**
 * Coach-authored structured updates for the Task Modal **Workout intake** wizard
 * (readiness / sleep sliders, steps, duration, intensity, soreness).
 *
 * - Carried on `messages.metadata.task_modal_intake_patch` (JSON object) after the
 *   agent RPC merges it into the reply row — same delivery pattern as `execution_patch`.
 * - Client applies via `useWorkoutIntakeWizardState` / `WorkoutIntakePanel` (controlled).
 *
 * Keep option lists in sync with `WorkoutIntakePanel` (imports these constants).
 */

export const WORKOUT_INTAKE_DURATION_CHOICES = [15, 30, 45, 60, 'Optimized for Goals'] as const;
export type WorkoutIntakeDurationChoice = (typeof WORKOUT_INTAKE_DURATION_CHOICES)[number];

export const WORKOUT_INTAKE_INTENSITY_OPTIONS = [
  'Light/Recovery',
  'Moderate',
  'High/HIIT',
] as const;
export type WorkoutIntakeIntensityChoice = (typeof WORKOUT_INTAKE_INTENSITY_OPTIONS)[number];

/** RPE-ceiling phase intent for generation intake Step 1 (macro planning). */
export const WORKOUT_GENERATION_PHASE_INTENT_OPTIONS = [
  'technical_baseline',
  'standard_progression',
  'aggressive_overload',
] as const;
export type WorkoutGenerationPhaseIntentPatch =
  (typeof WORKOUT_GENERATION_PHASE_INTENT_OPTIONS)[number];

export const WORKOUT_INTAKE_SORENESS_OPTIONS = [
  'None',
  'Legs',
  'Back',
  'Shoulders',
  'Chest',
  'Core',
] as const;

export type TaskModalIntakePatch = {
  readiness?: number;
  sleep_quality?: number;
  wizard_step?: 1 | 2 | 3;
  duration_minutes?: WorkoutIntakeDurationChoice;
  /** @deprecated Legacy cardio labels — prefer phase_intent for generation intake. */
  target_intensity?: WorkoutIntakeIntensityChoice;
  phase_intent?: WorkoutGenerationPhaseIntentPatch;
  soreness?: string[];
};

export type TaskModalIntakePatchDropReason =
  | 'unknown_key'
  | 'invalid_type'
  | 'clamped'
  | 'invalid_enum'
  | 'soreness_none_combination';

/** Bounded telemetry for fields dropped or corrected while parsing coach JSON. */
export type TaskModalIntakePatchDrop = {
  field: string;
  reason: TaskModalIntakePatchDropReason;
  /** Short, non-PII hint (truncated). */
  detail?: string;
};

const SORENESS_SET = new Set<string>(WORKOUT_INTAKE_SORENESS_OPTIONS as unknown as string[]);
const INTENSITY_SET = new Set<string>(WORKOUT_INTAKE_INTENSITY_OPTIONS as unknown as string[]);
const PHASE_INTENT_SET = new Set<string>(
  WORKOUT_GENERATION_PHASE_INTENT_OPTIONS as unknown as string[],
);
const DURATION_NUMS = new Set<number>([15, 30, 45, 60]);

// Copilot suggestion ignored: camelCase keys are for replaying persisted metadata and hand-edited JSON, not Gemini’s primary snake_case contract.
const TASK_MODAL_INTAKE_PATCH_KNOWN_KEYS = new Set<string>([
  'readiness',
  'readiness_energy',
  'readinessEnergy',
  'sleep_quality',
  'sleepQuality',
  'wizard_step',
  'wizardStep',
  'duration_minutes',
  'durationMinutes',
  'target_intensity',
  'targetIntensity',
  'phase_intent',
  'phaseIntent',
  'soreness',
]);

const MAX_INTAKE_DROPS = 50;

function sliceDetail(s: string, max = 48): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

function pushDrop(drops: TaskModalIntakePatchDrop[], entry: TaskModalIntakePatchDrop): void {
  if (drops.length >= MAX_INTAKE_DROPS) return;
  drops.push(entry);
}

function clampInt(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

function parseReadinessSleepWithDrops(
  raw: unknown,
  field: 'readiness' | 'sleep_quality',
  drops: TaskModalIntakePatchDrop[],
): number | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (/^\d+$/.test(t)) {
      const n = Number(t);
      const out = clampInt(n, 1, 10);
      if (n !== out) {
        pushDrop(drops, { field, reason: 'clamped', detail: sliceDetail(String(n)) });
      }
      return out;
    }
    pushDrop(drops, { field, reason: 'invalid_type', detail: 'non_numeric_string' });
    return undefined;
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const out = clampInt(raw, 1, 10);
    if (raw !== out) {
      pushDrop(drops, { field, reason: 'clamped', detail: sliceDetail(String(raw)) });
    }
    return out;
  }
  pushDrop(drops, { field, reason: 'invalid_type' });
  return undefined;
}

function parseWizardStepWithDrops(
  raw: unknown,
  drops: TaskModalIntakePatchDrop[],
): 1 | 2 | 3 | undefined {
  if (raw === undefined || raw === null) return undefined;
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw.trim()) : NaN;
  if (!Number.isInteger(n) || n < 1 || n > 3) {
    pushDrop(drops, { field: 'wizard_step', reason: 'invalid_enum', detail: '1_to_3' });
    return undefined;
  }
  return n as 1 | 2 | 3;
}

function parseDurationWithDrops(
  raw: unknown,
  drops: TaskModalIntakePatchDrop[],
): WorkoutIntakeDurationChoice | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw === 'number' && DURATION_NUMS.has(raw)) return raw as WorkoutIntakeDurationChoice;
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (t === 'Optimized for Goals') return 'Optimized for Goals';
    if (/^\d+$/.test(t)) {
      const n = Number(t);
      if (DURATION_NUMS.has(n)) return n as WorkoutIntakeDurationChoice;
    }
  }
  pushDrop(drops, { field: 'duration_minutes', reason: 'invalid_enum' });
  return undefined;
}

function parseIntensityWithDrops(
  raw: unknown,
  drops: TaskModalIntakePatchDrop[],
): WorkoutIntakeIntensityChoice | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'string') {
    pushDrop(drops, { field: 'target_intensity', reason: 'invalid_type' });
    return undefined;
  }
  const t = raw.trim();
  if (INTENSITY_SET.has(t)) return t as WorkoutIntakeIntensityChoice;
  pushDrop(drops, {
    field: 'target_intensity',
    reason: 'invalid_enum',
    detail: sliceDetail(t, 32),
  });
  return undefined;
}

function parsePhaseIntentWithDrops(
  raw: unknown,
  drops: TaskModalIntakePatchDrop[],
): WorkoutGenerationPhaseIntentPatch | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'string') {
    pushDrop(drops, { field: 'phase_intent', reason: 'invalid_type' });
    return undefined;
  }
  const t = raw.trim();
  if (PHASE_INTENT_SET.has(t)) return t as WorkoutGenerationPhaseIntentPatch;
  pushDrop(drops, {
    field: 'phase_intent',
    reason: 'invalid_enum',
    detail: sliceDetail(t, 32),
  });
  return undefined;
}

function parseStringArrayWithDrops(
  raw: unknown,
  allowed: Set<string>,
  field: string,
  drops: TaskModalIntakePatchDrop[],
): string[] | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (!Array.isArray(raw)) {
    pushDrop(drops, { field, reason: 'invalid_type' });
    return undefined;
  }
  if (raw.length === 0) return undefined;
  const out: string[] = [];
  for (const el of raw) {
    if (typeof el !== 'string') {
      pushDrop(drops, { field, reason: 'invalid_type', detail: 'element' });
      continue;
    }
    const s = el.trim();
    if (!s) continue;
    if (!allowed.has(s)) {
      pushDrop(drops, { field, reason: 'invalid_enum', detail: sliceDetail(s, 32) });
      continue;
    }
    out.push(s);
  }
  if (out.length === 0) return undefined;
  return [...new Set(out)].sort();
}

function normalizeSorenessWithDrops(
  arr: string[] | undefined,
  drops: TaskModalIntakePatchDrop[],
): string[] | undefined {
  if (!arr || arr.length === 0) return undefined;
  const filtered = arr.filter((s) => SORENESS_SET.has(s));
  if (filtered.includes('None') && filtered.length > 1) {
    pushDrop(drops, { field: 'soreness', reason: 'soreness_none_combination' });
    return normalizeSorenessWithDrops(
      filtered.filter((s) => s !== 'None'),
      drops,
    );
  }
  return filtered.length ? [...new Set(filtered)].sort() : undefined;
}

/**
 * Parses Gemini `task_modal_intake_patch` and collects bounded drop/clamp telemetry.
 * Returns `patch: null` when absent or when nothing valid remains.
 */
export function parseAndCollectTaskModalIntakePatchFromGemini(raw: unknown): {
  patch: TaskModalIntakePatch | null;
  dropped: TaskModalIntakePatchDrop[];
} {
  const dropped: TaskModalIntakePatchDrop[] = [];
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { patch: null, dropped };
  }
  const o = raw as Record<string, unknown>;

  for (const key of Object.keys(o)) {
    if (!TASK_MODAL_INTAKE_PATCH_KNOWN_KEYS.has(key)) {
      pushDrop(dropped, { field: key, reason: 'unknown_key' });
    }
  }

  const readiness =
    parseReadinessSleepWithDrops(
      o.readiness ?? o.readiness_energy ?? o.readinessEnergy,
      'readiness',
      dropped,
    ) ?? undefined;
  const sleep_quality =
    parseReadinessSleepWithDrops(o.sleep_quality ?? o.sleepQuality, 'sleep_quality', dropped) ??
    undefined;
  const wizard_step = parseWizardStepWithDrops(o.wizard_step ?? o.wizardStep, dropped) ?? undefined;
  const duration_minutes =
    parseDurationWithDrops(o.duration_minutes ?? o.durationMinutes, dropped) ?? undefined;
  const target_intensity =
    parseIntensityWithDrops(o.target_intensity ?? o.targetIntensity, dropped) ?? undefined;
  const phase_intent =
    parsePhaseIntentWithDrops(o.phase_intent ?? o.phaseIntent, dropped) ?? undefined;
  let soreness = parseStringArrayWithDrops(o.soreness, SORENESS_SET, 'soreness', dropped);
  soreness = normalizeSorenessWithDrops(soreness, dropped);

  const out: TaskModalIntakePatch = {};
  if (readiness !== undefined) out.readiness = readiness;
  if (sleep_quality !== undefined) out.sleep_quality = sleep_quality;
  if (wizard_step !== undefined) out.wizard_step = wizard_step;
  if (duration_minutes !== undefined) out.duration_minutes = duration_minutes;
  if (target_intensity !== undefined) out.target_intensity = target_intensity;
  if (phase_intent !== undefined) out.phase_intent = phase_intent;
  if (soreness !== undefined) out.soreness = soreness;

  const patch = Object.keys(out).length > 0 ? out : null;
  return { patch, dropped };
}

/**
 * Parses Gemini `task_modal_intake_patch` from coach JSON. Returns `null` when absent
 * or when nothing valid remains (strict — invalid keys are dropped).
 */
export function parseTaskModalIntakePatchFromGemini(raw: unknown): TaskModalIntakePatch | null {
  return parseAndCollectTaskModalIntakePatchFromGemini(raw).patch;
}

/** Same shape as metadata replay on the client (already server-validated). */
export function parseTaskModalIntakePatchFromMetadata(raw: unknown): TaskModalIntakePatch | null {
  return parseTaskModalIntakePatchFromGemini(raw);
}

/** RPC / persistence: omit null or empty object. */
export function taskModalIntakePatchForRpc(patch: TaskModalIntakePatch | null): unknown | null {
  if (patch == null || Object.keys(patch).length === 0) return null;
  return patch;
}
